import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  applyDialogueEffects,
  type DialogueOption,
  type DialogueTree,
  dialogueForSpeaker,
  dialogueNode,
  dialogueRoot,
  isAskEffect,
  isRevealEffect,
} from '../../world/dialogue';
import { FIELDS } from '../../world/fields';
import { ticketTitle } from '../../world/tickets';
import type { ChatState, ChatThread } from '../app-state';
import { createIcon } from '../icons';
import type { AppDef, AppInstance } from './types';
import {
  element,
  nodeKey,
  osButton,
  outcomeLine,
  refusalLine,
  textValue,
  withFocusRestored,
} from './ui';

export function personKey(id: string): string {
  return nodeKey(id);
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
    root.append(toolbar, columns);

    const persons = (): readonly ReadOnlyGraphNode[] => api.graph
      .nodesOfKind('person');

    const ticketResolved = (tree: Readonly<DialogueTree>): boolean => (
      tree.ticket !== undefined
      && api.graph.getField(tree.ticket, FIELDS.state) === 'resolved'
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
      const activeRoot = dialogueRoot(tree, ticketResolved(tree));
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
        ticket: tree.ticket,
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
          ticketTitle(tree.ticket ?? '')
        }.`);
      }

      if (
        played.done.some(
          (effect) => !isAskEffect(effect) && !isRevealEffect(effect),
        )
      ) {
        reported.push('Done, from here, while they were still talking.');
      }

      outcome = reported.length > 0 ? reported.join(' ') : null;

      render();
    };

    const renderPeople = (nodes: readonly ReadOnlyGraphNode[]): void => {
      people.replaceChildren();

      for (const person of nodes) {
        const tree = dialogueForSpeaker(person.id);
        const item = element('li');
        const row = element(
          'button',
          'chat-person',
          `chat-person-${personKey(person.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(person.id === chat().selectedId);
        row.dataset.self = String(person.id === api.actor);

        const name = element('strong');
        name.textContent = textValue(person.fields[FIELDS.name], person.id)
          + (person.id === api.actor ? ' (you)' : '');
        const title = element('span', 'chat-person-title');
        title.textContent = textValue(
          person.fields[FIELDS.title],
          'Job title unrecorded',
        );
        row.append(name, title);

        if (
          tree?.ticket !== undefined
          && api.graph.getField(tree.ticket, FIELDS.state) !== 'resolved'
        ) {
          const flag = element('span', 'chat-person-flag');
          flag.textContent = 'Open ticket';
          row.append(flag);
        }

        row.addEventListener('click', () => {
          select(person.id);
          refusal = null;
          outcome = null;
          render();
        });
        item.append(row);
        people.append(item);
      }
    };

    const renderPanel = (person: ReadOnlyGraphNode | undefined): void => {
      panel.replaceChildren();

      if (person === undefined) {
        const empty = element('p', 'chat-placeholder', 'chat-empty');
        empty.textContent = 'Pick somebody. Half of support is asking the '
          + 'right person the right question in the right order.';
        panel.append(empty);
        return;
      }

      const tree = dialogueForSpeaker(person.id);
      const name = textValue(person.fields[FIELDS.name], person.id);

      const head = element('div', 'chat-head');
      const heading = element('h2', undefined, 'chat-heading');
      heading.textContent = name;
      head.append(heading);

      if (tree?.ticket !== undefined) {
        const context = element('span', 'chat-context', 'chat-context');
        context.textContent = ticketTitle(tree.ticket);
        const open = osButton('Open the queue', 'chat-open-tickets', {
          compact: true,
        });
        open.addEventListener('click', () => {
          api.openApp('tickets');
        });
        head.append(context, open);
      }

      panel.append(head);

      if (tree === undefined) {
        const silent = element('p', 'chat-placeholder', 'chat-no-thread');
        silent.textContent = `${name} has never once opened the chat client. `
          + 'If it is urgent, it is a walk.';
        panel.append(silent);
        return;
      }

      const thread = threadFor(person.id, tree);
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
      const node = dialogueNode(tree, thread.nodeId);

      if (thread.ended || node === undefined) {
        const again = osButton('Bring it up again', 'chat-restart');
        again.addEventListener('click', () => {
          const activeRoot = dialogueRoot(tree, ticketResolved(tree));
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

      const open = nodes.filter((person) => {
        const tree = dialogueForSpeaker(person.id);
        return tree?.ticket !== undefined
          && api.graph.getField(tree.ticket, FIELDS.state) !== 'resolved';
      }).length;
      summary.textContent = `${String(nodes.length)} contacts · `
        + `${String(open)} with something open`;

      // A world change repaints the whole panel underneath the player, so the
      // option they were standing on has to survive the paint.
      withFocusRestored(root, () => {
        renderPeople(nodes);
        const showing = chat().selectedId;
        renderPanel(nodes.find((person) => person.id === showing));
      });

      // Keep the transcript pinned to the newest line: a conversation that
      // silently scrolls away from the player is a conversation they lose.
      const transcript = panel.querySelector('[data-testid="chat-transcript"]');

      if (transcript instanceof HTMLElement) {
        transcript.scrollTop = transcript.scrollHeight;
      }
    };

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
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
        unsubscribeState();
        root.remove();
      },
    };
  },
};
