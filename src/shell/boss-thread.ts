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

import { COMPANY_IDS } from '../world/company';
import { dialogueForSpeaker, dialogueNode, dialogueRoot } from '../world/dialogue';
import type { AppStateStore, ChatThread } from './app-state';

/**
 * Appends what he said and moves the conversation to the node that asks it.
 *
 * The node is the tree's `summoned_root` - the entry point nothing in the tree
 * points at - so the questions that only make sense once the ticket exists are
 * only reachable once it does.
 */
export function pingBossThread(store: AppStateStore, line: string): void {
  const tree = dialogueForSpeaker(COMPANY_IDS.boss);

  if (tree === undefined) {
    return;
  }

  const landing = tree.summoned_root ?? tree.root;
  const existing = store.get().chat.threads[COMPANY_IDS.boss];
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
    // is him arriving in the middle of the one that was already open.
    rootUsed: dialogueRoot(tree, false),
    ended: false,
    lines: [...before, { who: 'them', text: line }],
  };

  // External: the chat app did not do this and will not repaint itself for it.
  store.patchExternal('chat', {
    threads: { ...store.get().chat.threads, [COMPANY_IDS.boss]: thread },
  });
}
