import type { ReadOnlyGraphNode } from '../../engine/graph-view';
import {
  applyDialogueEffect,
  type DialogueOption,
  type DialogueTree,
  dialogueForSpeaker,
  dialogueNode,
  dialogueRoot,
  isRevealEffect,
} from '../../world/dialogue';
import { FIELDS } from '../../world/fields';
import { ticketTitle } from '../../world/tickets';
import { createIcon } from '../icons';
import type { AppDef, AppInstance } from './types';
import { element, osButton, textValue } from './ui';

type Speaker = 'them' | 'you' | 'system';

interface TranscriptLine {
  readonly who: Speaker;
  readonly text: string;
}

interface ThreadState {
  nodeId: string;
  /** Root the thread is running from, so a resolution can move it. */
  rootUsed: string;
  lines: TranscriptLine[];
  ended: boolean;
}

export function personKey(id: string): string {
  return id.startsWith('person:') ? id.slice('person:'.length) : id;
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
    const threads = new Map<string, ThreadState>();
    let selectedId: string | null = null;
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
    ): ThreadState => ({
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
    ): ThreadState => {
      const activeRoot = dialogueRoot(tree, ticketResolved(tree));
      const existing = threads.get(personId);

      if (existing === undefined) {
        const fresh = startThread(tree, activeRoot);
        threads.set(personId, fresh);
        return fresh;
      }

      if (existing.rootUsed !== activeRoot) {
        existing.lines.push({
          who: 'system',
          text: 'They message you again.',
        });
        existing.lines.push({
          who: 'them',
          text: dialogueNode(tree, activeRoot)?.npc_line ?? '',
        });
        existing.nodeId = activeRoot;
        existing.rootUsed = activeRoot;
        existing.ended = false;
      }

      return existing;
    };

    const choose = (
      personId: string,
      tree: Readonly<DialogueTree>,
      option: Readonly<DialogueOption>,
    ): void => {
      const thread = threadFor(personId, tree);
      thread.lines.push({ who: 'you', text: option.label });
      refusal = null;
      outcome = null;

      if (option.effect !== undefined) {
        const result = applyDialogueEffect(option.effect, {
          ticket: tree.ticket,
          dispatch: (action, target, params) => api.dispatch(
            action,
            api.actor,
            target,
            params,
          ),
        });

        if (result.ok) {
          outcome = isRevealEffect(option.effect)
            ? `Written onto ${ticketTitle(tree.ticket ?? '')}.`
            : 'Done, from here, while they were still talking.';
        } else {
          // The conversation carries on regardless: a refused effect is a
          // thing that did not work, not a thing that ends the call.
          refusal = result.reason;
        }
      }

      if (option.next === undefined) {
        thread.ended = true;
        thread.lines.push({ who: 'system', text: 'The conversation ends.' });
      } else {
        thread.nodeId = option.next;
        thread.lines.push({
          who: 'them',
          text: dialogueNode(tree, option.next)?.npc_line ?? '',
        });
      }

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
        row.dataset.selected = String(person.id === selectedId);
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
          selectedId = person.id;
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
          thread.nodeId = activeRoot;
          thread.rootUsed = activeRoot;
          thread.ended = false;
          thread.lines.push({
            who: 'them',
            text: dialogueNode(tree, activeRoot)?.npc_line ?? '',
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

      const outcomeLine = element('p', 'app-outcome', 'chat-outcome');
      outcomeLine.hidden = outcome === null;
      outcomeLine.textContent = outcome ?? '';

      const refusalLine = element('p', 'app-refusal', 'chat-refusal');
      refusalLine.hidden = refusal === null;

      if (refusal !== null) {
        refusalLine.append(createIcon('icon-lock'));
        const copy = element('span');
        copy.textContent = refusal;
        refusalLine.append(copy);
      }

      panel.append(outcomeLine, refusalLine);
    };

    const render = (): void => {
      const nodes = persons();

      if (
        selectedId === null
        || !nodes.some((person) => person.id === selectedId)
      ) {
        selectedId = nodes.find((person) => person.id !== api.actor)?.id
          ?? nodes[0]?.id
          ?? null;
      }

      const open = nodes.filter((person) => {
        const tree = dialogueForSpeaker(person.id);
        return tree?.ticket !== undefined
          && api.graph.getField(tree.ticket, FIELDS.state) !== 'resolved';
      }).length;
      summary.textContent = `${String(nodes.length)} contacts · `
        + `${String(open)} with something open`;

      renderPeople(nodes);
      renderPanel(nodes.find((person) => person.id === selectedId));

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

    return {
      receiveIntent: (intent): void => {
        if (intent.kind !== 'chat-person') {
          return;
        }

        if (api.graph.getNode(intent.id)?.kind !== 'person') {
          return;
        }

        selectedId = intent.id;
        refusal = null;
        outcome = null;
        render();
      },
      unmount: (): void => {
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
