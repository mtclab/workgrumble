/**
 * The lead's messages, landing in the thread he has always used.
 *
 * A ping is not a new channel and it is not a notification with a face on it:
 * it is a line in the chat app, in the conversation that was already there,
 * left standing on the node it asks about. That is why it lives in the shell's
 * app store rather than in the world - what was SAID is screen state, and what
 * it costs you is meters in the graph, dispatched before this is ever called.
 *
 * It deliberately does not steal the player's selection. Somebody halfway
 * through asking Ada about her screen should not have the panel yanked out
 * from under them; the toast says who wants them, and the thread is waiting.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { COMPANY_IDS } from '../world/company';
import {
  conversationFor,
  dialogueForSpeaker,
  dialogueNode,
} from '../world/dialogue';
import type { AppStateStore, ChatThread } from './app-state';

/**
 * Appends what he said and moves the conversation to the node that asks it.
 *
 * The node is the tree's `summoned_root` - the entry point nothing in the tree
 * points at - so the questions that only make sense once the ticket exists are
 * only reachable once it does.
 */
export function pingBossThread(store: AppStateStore, line: string): void {
  openThreadAt(store, COMPANY_IDS.boss, line);
}

/**
 * Somebody who is not the lead, asking for a favour instead of raising a
 * ticket.
 *
 * Identical machinery and deliberately so: being messaged directly is one beat
 * with one shape, whoever is doing it, and the only thing that differs is whose
 * thread it lands in. The line comes out of the person's own tree rather than
 * being passed in, because a message that is not in the conversation it opens
 * is a message the player cannot answer.
 */
export function openDirectMessage(
  store: AppStateStore,
  speaker: string,
): string | null {
  const tree = dialogueForSpeaker(speaker);
  const landing = tree?.summoned_root;

  if (tree === undefined || landing === undefined) {
    return null;
  }

  const line = dialogueNode(tree, landing)?.npc_line ?? '';
  openThreadAt(store, speaker, line);
  return line;
}

/**
 * Somebody opening a conversation with the word "Hi." and nothing else.
 *
 * It lands on the tree's `hello_root`, which is a node whose whole content is
 * a greeting and whose one option is the player asking what they want. That is
 * the difference from the two above and it is the entire beat: a ping and a
 * favour both arrive with the question already in them, and this arrives with
 * none of it.
 *
 * `rootUsed` is computed rather than assumed, and that is a fix rather than a
 * detail. The chat window MOVES a thread whose `rootUsed` no longer matches
 * the root it would compute for that person, so a greeting stamped with the
 * tree's own root would be dragged onto a live ticket's opening line the
 * instant it was painted - which for the new starter on a Thursday means the
 * greeting is replaced by a mailbox complaint and the beat silently does not
 * happen.
 *
 * Answers the line, or null for somebody whose tree does not do this.
 */
export function openNoHello(
  store: AppStateStore,
  graph: ReadOnlyGraphView,
  speaker: string,
): string | null {
  const tree = dialogueForSpeaker(speaker);
  const landing = tree?.hello_root;

  if (tree === undefined || landing === undefined) {
    return null;
  }

  const line = dialogueNode(tree, landing)?.npc_line ?? '';
  const existing = store.get().chat.threads[speaker];
  const opening = dialogueNode(tree, tree.root)?.npc_line ?? '';

  store.patchExternal('chat', {
    threads: {
      ...store.get().chat.threads,
      [speaker]: {
        nodeId: landing,
        rootUsed: conversationFor(tree, graph).root,
        ended: false,
        lines: [
          ...existing?.lines ?? [{ who: 'them' as const, text: opening }],
          { who: 'them', text: line },
        ],
      },
    },
  });

  return line;
}

/**
 * And the question, finally, for somebody who waited it out.
 *
 * It moves the thread only if it is STILL standing on the greeting, because a
 * player who asked already had this line minutes ago and being handed it twice
 * would read as the same person saying the same thing to themselves. The
 * driver fires the beat either way - it has no opinion about a transcript -
 * and this is the half that knows where the conversation is.
 *
 * Answers whether anything was actually said.
 */
export function askedAtLast(store: AppStateStore, speaker: string): boolean {
  const tree = dialogueForSpeaker(speaker);
  const landing = tree?.hello_root;
  const thread = store.get().chat.threads[speaker];

  if (tree === undefined || landing === undefined || thread === undefined) {
    return false;
  }

  if (thread.nodeId !== landing) {
    return false;
  }

  // The node the greeting leads to, which is the question they were getting
  // round to. Read off the tree rather than named here, so the content owns
  // both halves of the beat and this owns neither.
  const asked = dialogueNode(tree, landing)?.options
    .find((option) => option.next !== undefined)?.next;

  if (asked === undefined) {
    return false;
  }

  store.patchExternal('chat', {
    threads: {
      ...store.get().chat.threads,
      [speaker]: {
        ...thread,
        nodeId: asked,
        lines: [
          ...thread.lines,
          { who: 'them', text: dialogueNode(tree, asked)?.npc_line ?? '' },
        ],
      },
    },
  });

  return true;
}

/**
 * Somebody saying one thing into a conversation, without opening a question.
 *
 * The difference from the two above is the whole of why it exists: a ping MOVES
 * the thread to the node that asks the question, and this does not move it at
 * all. What lands here is a remark - the receptionist noticing the dot has gone
 * red, the man who has been waiting all afternoon saying so - and there is
 * nothing to answer, so a conversation the player was halfway through is left
 * exactly where they left it, with one more line above it.
 *
 * `once` is for the chatter, and it is idempotence taken off the SAVE rather
 * than out of a counter nobody keeps: the transcript is the record, it rides
 * every save and reload, so a line already in it is a line already said. That
 * is what makes the office's four remarks land once each without a shred of
 * new state - and why the answer somebody gives about being kept waiting does
 * NOT pass it, because that one is once per person per DAY and the world is
 * the half that counts it.
 *
 * Answers whether anything was actually said.
 */
export function remarkInThread(
  store: AppStateStore,
  speaker: string,
  line: string,
  once = false,
): boolean {
  const tree = dialogueForSpeaker(speaker);

  if (tree === undefined || line.length === 0) {
    return false;
  }

  const existing = store.get().chat.threads[speaker];

  if (once && (existing?.lines ?? []).some((said) => said.text === line)) {
    return false;
  }

  const opening = dialogueNode(tree, tree.root)?.npc_line ?? '';
  const before = existing?.lines ?? [{ who: 'them' as const, text: opening }];

  store.patchExternal('chat', {
    threads: {
      ...store.get().chat.threads,
      [speaker]: {
        // Untouched: where the conversation stands is the player's business,
        // and a remark that reset it would be a colleague talking over them.
        nodeId: existing?.nodeId ?? tree.root,
        rootUsed: existing?.rootUsed ?? tree.root,
        ended: existing?.ended ?? false,
        lines: [...before, { who: 'them', text: line }],
      },
    },
  });

  return true;
}

function openThreadAt(
  store: AppStateStore,
  speaker: string,
  line: string,
): void {
  const tree = dialogueForSpeaker(speaker);

  if (tree === undefined) {
    return;
  }

  const landing = tree.summoned_root ?? tree.root;
  const existing = store.get().chat.threads[speaker];
  const opening = dialogueNode(tree, tree.root)?.npc_line ?? '';
  const before = existing?.lines ?? [
    // Somebody who has never opened the boss channel still gets a thread that
    // reads like one: he says his usual thing first, then the new thing.
    { who: 'them' as const, text: opening },
  ];

  const thread: ChatThread = {
    nodeId: landing,
    // The root the thread is running FROM is unchanged: the chat app moves a
    // thread when its root changes, and being pinged is not a new root - it
    // is him arriving in the middle of the one that was already open. His
    // concern has not been raised yet at the minute he pings, so the root the
    // chat app will compute for him is still the tree's own.
    rootUsed: tree.root,
    ended: false,
    lines: [...before, { who: 'them', text: line }],
  };

  // External: the chat app did not do this and will not repaint itself for it.
  store.patchExternal('chat', {
    threads: { ...store.get().chat.threads, [speaker]: thread },
  });
}
