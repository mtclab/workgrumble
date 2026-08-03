import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  applyDialogueEffects,
  type Conversation,
  conversationFor,
  type DialogueOption,
  type DialogueTree,
  dialogueForSpeaker,
  dialogueNode,
  isAskEffect,
  isRevealEffect,
  isSocialEffect,
} from '../../world/dialogue';
import { FIELDS } from '../../world/fields';
import { ticketTitle } from '../../world/tickets';
import type { ChatState, ChatThread } from '../app-state';
import { createIcon } from '../icons';
import { settleAggressiveTone } from './tone';
import type { AppDef, AppInstance } from './types';
import {
  element,
  type KeyedRow,
  KeyedRows,
  nodeKey,
  osButton,
  outcomeLine,
  refusalLine,
  setFlag,
  setText,
  textValue,
  withFocusRestored,
} from './ui';

export function personKey(id: string): string {
  return nodeKey(id);
}

/**
 * One contact, as data. Same rule as every other list in this shell: the row is
 * modelled before it is drawn, so a repaint driven by something happening
 * elsewhere in the building can be seen for what it usually is - every one of
 * these values unchanged.
 */
export interface ChatPersonRow {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  /** Whether this is the player, who is in their own contact list. */
  readonly self: boolean;
  readonly selected: boolean;
  /** Whether they have something open, which is why anybody rings anybody. */
  readonly openTicket: boolean;
}

/**
 * The conversation panel, as data.
 *
 * Everything the panel draws is in here and it reads nothing else, which is
 * what lets the app compare two of these and skip a rebuild. The comparison is
 * the point: this panel is made of buttons, and it was being rebuilt on every
 * world change - which, with the meters moving every five minutes of the shift,
 * meant the option the player was reading became a different element while they
 * were reading it.
 */
export interface ChatPanelModel {
  readonly id: string;
  readonly name: string;
  /** What this conversation is about, as a title, or nothing. */
  readonly about: string | null;
  readonly hasTree: boolean;
  readonly lines: readonly { readonly who: string; readonly text: string }[];
  /** The options on offer, or null once the thread has ended. */
  readonly options: readonly string[] | null;
  readonly outcome: string | null;
  readonly refusal: string | null;
}

/**
 * Chat: the only tool that talks to the person instead of the machine.
 *
 * The vague-ticket mechanic lives here. Reporters describe what they see and
 * are wrong about why, and one option in each conversation is the question
 * that gets the truth out of them - which lands on the ticket as a clue,
 * through the same action registry every other fix goes through.
 */
export const CHAT_APP: AppDef = {
  id: 'chat',
  title: 'Chat',
  icon: 'icon-chat',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    // Transcripts outlive the window, and the save carries them: a
    // conversation that unhappens when the window closes is a conversation the
    // player has to have again, and the reveal it bought is already on the
    // ticket. What is NOT kept is the last line of feedback - a refusal or an
    // outcome is about the click that just happened.
    const chat = (): ChatState => api.appState.get().chat;
    const putThread = (personId: string, thread: ChatThread): void => {
      api.appState.patch('chat', {
        threads: { ...chat().threads, [personId]: thread },
      });
    };
    const select = (personId: string | null): void => {
      api.appState.patch('chat', { selectedId: personId });
    };
    let refusal: string | null = null;
    let outcome: string | null = null;

    const root = element('section', 'app-page chat-app', 'chat-app');

    const toolbar = element('div', 'chat-toolbar');
    const summary = element('span', 'chat-summary', 'chat-summary');
    const note = element('span', 'chat-note');
    note.textContent = 'Ask the question nobody thought to ask.';
    toolbar.append(summary, note);

    const people = element('ul', 'chat-people', 'chat-people');
    const panel = element('section', 'chat-panel', 'chat-panel');
    const columns = element('div', 'chat-columns');
    columns.append(people, panel);
    /**
     * The dots, and the price of watching them.
     *
     * It lives OUTSIDE the panel deliberately. The panel is rebuilt only when
     * what it says has changed, and an indicator that cycles once a minute
     * changes what it says once a minute - so putting it in there would rebuild
     * the option buttons under the player's cursor for the whole of a beat
     * whose entire content is a button they are about to press. Out here it
     * repaints on the tick and touches nothing else.
     *
     * Both halves are on screen at once on purpose. The indicator is the joke -
     * somebody has said hello and is now, apparently, composing - and the
     * minutes beside it are the legibility rule this game keeps everywhere
     * else: waiting is four more minutes of a shift that does not stop, asking
     * is one click, and the player can read both before choosing either.
     */
    const typing = element('p', 'chat-typing', 'chat-typing');
    root.append(toolbar, columns, typing);

    const persons = (): readonly ReadOnlyGraphNode[] => api.graph
      .nodesOfKind('person');

    /**
     * What this person is ringing about right now, and where the conversation
     * opens because of it.
     *
     * One read for the three questions the window asks - which ticket a reveal
     * lands on, which line they open with, and whether the contact list flags
     * them - because they are one question. A tree can name tickets that have
     * not been raised yet: the lead raises his by mentioning it halfway through
     * the morning, and the new starter's follow-up does not exist until the
     * first one is fixed.
     */
    const talking = (
      tree: Readonly<DialogueTree>,
    ): Conversation => conversationFor(tree, api.graph);

    const hasOpenTicket = (tree: Readonly<DialogueTree> | undefined): boolean => (
      tree !== undefined && talking(tree).open
    );

    const startThread = (
      tree: Readonly<DialogueTree>,
      rootId: string,
    ): ChatThread => ({
      nodeId: rootId,
      rootUsed: rootId,
      lines: [
        {
          who: 'them',
          text: dialogueNode(tree, rootId)?.npc_line ?? '',
        },
      ],
      ended: false,
    });

    /**
     * The live thread for a person, moved onto the reaction branch if their
     * ticket closed while the window was open - so nobody keeps complaining
     * about a problem the player has already fixed.
     */
    const threadFor = (
      personId: string,
      tree: Readonly<DialogueTree>,
    ): ChatThread => {
      const activeRoot = talking(tree).root;
      const existing = chat().threads[personId];

      if (existing === undefined) {
        const fresh = startThread(tree, activeRoot);
        putThread(personId, fresh);
        return fresh;
      }

      if (existing.rootUsed === activeRoot) {
        return existing;
      }

      const moved: ChatThread = {
        nodeId: activeRoot,
        rootUsed: activeRoot,
        ended: false,
        lines: [
          ...existing.lines,
          { who: 'system', text: 'They message you again.' },
          {
            who: 'them',
            text: dialogueNode(tree, activeRoot)?.npc_line ?? '',
          },
        ],
      };
      putThread(personId, moved);
      return moved;
    };

    /**
     * Plays one option. The conversation is advanced BEFORE the effect is
     * dispatched, because a dispatch mutates the world synchronously and the
     * world listener repaints (and may move this very thread onto its
     * reaction branch) before the dispatch call has even returned. Advancing
     * afterwards would drag the thread back onto the branch it just left.
     */
    const choose = (
      personId: string,
      tree: Readonly<DialogueTree>,
      option: Readonly<DialogueOption>,
    ): void => {
      const thread = threadFor(personId, tree);
      const said: ChatThread['lines'] = [
        ...thread.lines,
        { who: 'you', text: option.label },
      ];
      refusal = null;
      outcome = null;

      putThread(
        personId,
        option.next === undefined
          ? {
            ...thread,
            ended: true,
            lines: [
              ...said,
              { who: 'system', text: 'The conversation ends.' },
            ],
          }
          : {
            ...thread,
            nodeId: option.next,
            lines: [
              ...said,
              {
                who: 'them',
                text: dialogueNode(tree, option.next)?.npc_line ?? '',
              },
            ],
          },
      );

      const played = applyDialogueEffects(option.effects ?? [], {
        ticket: talking(tree).ticket,
        // What goes on the ticket as the question is what the player said.
        said: option.label,
        dispatch: (action, target, params) => api.dispatch(
          action,
          api.actor,
          target,
          params,
        ),
      });

      // The conversation carries on regardless: a refused effect is a thing
      // that did not work, not a thing that ends the call.
      refusal = played.refusal;

      const reported: string[] = [];

      if (played.done.some(isAskEffect)) {
        reported.push('On the ticket where they can see it, so the clock can '
          + 'honestly be stopped on them.');
      }

      if (played.done.some(isRevealEffect)) {
        reported.push(`Filed as a work note on ${
          ticketTitle(talking(tree).ticket ?? '')
        }.`);
      }

      if (
        played.done.some(
          (effect) => !isAskEffect(effect) && !isRevealEffect(effect)
            && !isSocialEffect(effect),
        )
      ) {
        reported.push('Done, from here, while they were still talking.');
      }

      // The aggressive register's social half, through the shared path every
      // surface uses - so a call cannot skip the boss consequence a chat pays.
      const toneNote = settleAggressiveTone(api.day, option, played);

      if (toneNote !== null) {
        reported.push(toneNote);
      }

      outcome = reported.length > 0 ? reported.join(' ') : null;

      render();
    };

    const createPersonRow = (
      first: Readonly<ChatPersonRow>,
    ): KeyedRow<ChatPersonRow, HTMLLIElement> => {
      const id = first.id;
      const item = element('li');
      const row = element(
        'button',
        'chat-person',
        `chat-person-${personKey(id)}`,
      );
      row.type = 'button';

      const name = element('strong');
      const title = element('span', 'chat-person-title');
      // The flag is part of the row rather than something appended when it
      // applies: a row is a thing, and a thing that grows a child is a thing
      // that has to be rebuilt. It says nothing at all when there is nothing
      // open, so a test - or a screen reader - reading the row reads the truth.
      const flag = element('span', 'chat-person-flag');
      row.append(name, title, flag);

      row.addEventListener('click', () => {
        select(id);
        refusal = null;
        outcome = null;
        render();
      });
      item.append(row);

      return {
        element: item,
        update: (next: Readonly<ChatPersonRow>): void => {
          setFlag(row, 'selected', String(next.selected));
          setFlag(row, 'self', String(next.self));
          setText(name, next.name);
          setText(title, next.title);
          setText(flag, next.openTicket ? 'Open ticket' : '');
          flag.hidden = !next.openTicket;
        },
      };
    };

    const peopleRows = new KeyedRows<ChatPersonRow, HTMLLIElement>(
      people,
      (model) => model.id,
      createPersonRow,
    );

    const renderPeople = (nodes: readonly ReadOnlyGraphNode[]): void => {
      const selectedId = chat().selectedId;

      peopleRows.sync(nodes.map((person) => ({
        id: person.id,
        name: textValue(person.fields[FIELDS.name], person.id)
          + (person.id === api.actor ? ' (you)' : ''),
        title: textValue(person.fields[FIELDS.title], 'Job title unrecorded'),
        self: person.id === api.actor,
        selected: person.id === selectedId,
        openTicket: hasOpenTicket(dialogueForSpeaker(person.id)),
      })));
    };

    /**
     * The panel is rebuilt only when what it SAYS has changed.
     *
     * It holds the option buttons - the only controls this app has - and it was
     * being thrown away and built again on every world change. The meters move
     * every five minutes of every shift, so a conversation was being rebuilt
     * under the player's cursor while they were reading it: the transcript
     * jumped back to the bottom, any text they had selected went, and the
     * button they were about to press was a different element by the time they
     * pressed it. Same rule as the directory and Remote Assist, for the same
     * reason and in the same shape.
     */
    let painted: string | null = null;

    const renderPanel = (person: ReadOnlyGraphNode | undefined): void => {
      const tree = person === undefined
        ? undefined
        : dialogueForSpeaker(person.id);
      const name = person === undefined
        ? ''
        : textValue(person.fields[FIELDS.name], person.id);
      const about = tree === undefined ? undefined : talking(tree).ticket;
      // Reading the thread is what MOVES it onto the reaction branch, so it is
      // read on every paint whether or not the panel is rebuilt afterwards.
      const thread = person === undefined || tree === undefined
        ? undefined
        : threadFor(person.id, tree);
      const node = tree === undefined || thread === undefined
        ? undefined
        : dialogueNode(tree, thread.nodeId);
      const model: ChatPanelModel | null = person === undefined ? null : {
        id: person.id,
        name,
        about: about === undefined ? null : ticketTitle(about),
        hasTree: tree !== undefined,
        lines: thread?.lines ?? [],
        options: thread === undefined || thread.ended || node === undefined
          ? null
          : node.options.map((option) => option.label),
        outcome,
        refusal,
      };
      const signature = JSON.stringify(model);

      if (signature === painted) {
        return;
      }

      painted = signature;
      panel.replaceChildren();

      if (person === undefined || tree === undefined || thread === undefined) {
        renderPanelWithoutThread(name, person !== undefined);
        return;
      }

      panel.append(chatHead(name, model?.about ?? null));

      const transcript = element('ol', 'chat-transcript', 'chat-transcript');

      for (const line of thread.lines) {
        const entry = element('li', 'chat-line');
        entry.dataset.who = line.who;
        const who = element('span', 'chat-line-who');
        who.textContent = line.who === 'them'
          ? name
          : line.who === 'you'
            ? 'You'
            : '';
        const text = element('span', 'chat-line-text');
        text.textContent = line.text;
        entry.append(who, text);
        transcript.append(entry);
      }

      panel.append(transcript);

      const options = element('div', 'chat-options', 'chat-options');

      if (thread.ended || node === undefined) {
        const again = osButton('Bring it up again', 'chat-restart');
        again.addEventListener('click', () => {
          const activeRoot = talking(tree).root;
          putThread(person.id, {
            nodeId: activeRoot,
            rootUsed: activeRoot,
            ended: false,
            lines: [
              ...thread.lines,
              {
                who: 'them',
                text: dialogueNode(tree, activeRoot)?.npc_line ?? '',
              },
            ],
          });
          refusal = null;
          outcome = null;
          render();
        });
        options.append(again);
      } else {
        node.options.forEach((option, index) => {
          const button = osButton(option.label, `chat-option-${String(index)}`);
          button.addEventListener('click', () => {
            choose(person.id, tree, option);
          });
          options.append(button);
        });
      }

      panel.append(options);

      panel.append(
        outcomeLine('chat-outcome', outcome),
        refusalLine('chat-refusal', refusal, createIcon('icon-lock')),
      );

      // Pinned to the newest line, and only after a rebuild: a conversation
      // that silently scrolls away from the player is a conversation they lose,
      // and one that jumps to the bottom every time a meter moves is worse.
      transcript.scrollTop = transcript.scrollHeight;
    };

    /** The head every panel has: who you are talking to, and what about. */
    const chatHead = (name: string, about: string | null): HTMLElement => {
      const head = element('div', 'chat-head');
      const heading = element('h2', undefined, 'chat-heading');
      heading.textContent = name;
      head.append(heading);

      if (about !== null) {
        const context = element('span', 'chat-context', 'chat-context');
        context.textContent = about;
        const open = osButton('Open the queue', 'chat-open-tickets', {
          compact: true,
        });
        open.addEventListener('click', () => {
          api.openApp('tickets');
        });
        head.append(context, open);
      }

      return head;
    };

    /**
     * The two panels with no conversation in them: nobody picked, and somebody
     * who has never once opened the chat client.
     */
    const renderPanelWithoutThread = (name: string, picked: boolean): void => {
      if (!picked) {
        const empty = element('p', 'chat-placeholder', 'chat-empty');
        empty.textContent = 'Pick somebody. Half of support is asking the '
          + 'right person the right question in the right order.';
        panel.append(empty);
        return;
      }

      panel.append(chatHead(name, null));
      const silent = element('p', 'chat-placeholder', 'chat-no-thread');
      silent.textContent = `${name} has never once opened the chat client. `
        + 'If it is urgent, it is a walk.';
      panel.append(silent);
    };

    const render = (): void => {
      const nodes = persons();
      const { selectedId } = chat();

      if (
        selectedId === null
        || !nodes.some((person) => person.id === selectedId)
      ) {
        select(
          nodes.find((person) => person.id !== api.actor)?.id
            ?? nodes[0]?.id
            ?? null,
        );
      }

      const open = nodes.filter(
        (person) => hasOpenTicket(dialogueForSpeaker(person.id)),
      ).length;
      summary.textContent = `${String(nodes.length)} contacts · `
        + `${String(open)} with something open`;

      // A rebuild takes the keyboard off whatever the player was standing on,
      // so the paint puts it back - on the rare occasions there is a rebuild.
      withFocusRestored(root, () => {
        renderPeople(nodes);
        const showing = chat().selectedId;
        renderPanel(nodes.find((person) => person.id === showing));
      });

      renderTyping(nodes.find((person) => person.id === chat().selectedId));
    };

    /**
     * Whether the person on screen is still getting round to it.
     *
     * The row is never removed, only emptied. A row that appears and
     * disappears once a minute moves everything under it - which, for the
     * whole of this beat, is the one option the player is reaching for - and
     * the blank frames of the cadence are frames the indicator is deliberately
     * out on.
     */
    const renderTyping = (person: ReadOnlyGraphNode | undefined): void => {
      const tree = person === undefined
        ? undefined
        : dialogueForSpeaker(person.id);
      // Still typing means still typing AT YOU. Somebody who has already been
      // asked what they want has said it, minutes early, and a window that
      // carried on showing dots over the answer would be charging for a wait
      // the player refused to have - which is the opposite of what asking is
      // supposed to buy.
      const asked = tree?.hello_root !== undefined
        && person !== undefined
        && chat().threads[person.id]?.nodeId !== tree.hello_root;
      const waiting = person === undefined || asked
        ? null
        : api.day.typing(person.id);

      typing.dataset.typing = waiting === null ? 'false' : 'true';
      typing.dataset.left = String(waiting?.minutesLeft ?? 0);
      typing.hidden = waiting === null;

      if (waiting === null || person === undefined) {
        typing.textContent = '';
        return;
      }

      const name = textValue(person.fields[FIELDS.name], person.id);
      typing.textContent = `${name} ${waiting.line}`.trimEnd()
        + (waiting.minutesLeft > 0
          ? ` · waiting it out is ${String(waiting.minutesLeft)} more `
            + 'minute(s) of the shift; asking is one click'
          : '');
    };

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // The minute hand, which is what makes a typing indicator an indicator
    // rather than a label: nothing in the world moves while somebody composes,
    // so a window that only repainted on world changes would show one frozen
    // frame for the whole of the beat and would never notice it ending.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    // A load replaces every transcript at once, and nothing else says so.
    const unsubscribeState = api.appState.onReplaced(() => {
      refusal = null;
      outcome = null;
      render();
    });

    return {
      receiveIntent: (intent): void => {
        if (intent.kind !== 'chat-person') {
          return;
        }

        if (api.graph.getNode(intent.id)?.kind !== 'person') {
          return;
        }

        select(intent.id);
        refusal = null;
        outcome = null;
        render();
      },
      unmount: (): void => {
        unsubscribeWorld();
        unsubscribeTick();
        unsubscribeState();
        root.remove();
      },
    };
  },
};
