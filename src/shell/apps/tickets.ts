import type { ReadOnlyGraphNode } from '../../engine-api';
import { isTicketState, type TicketState } from '../../engine-api';
import {
  clueLines,
  HELPDESK_ACTIONS,
  WAITING_NEEDS_QUESTION_REASON,
} from '../../world/actions';
import { FIELDS } from '../../world/fields';
import {
  allowsEscalation,
  findWorldTicket,
  type WorldTicket,
} from '../../world/tickets';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, GameApi } from './types';
import {
  definitionRow,
  element,
  formatDuration,
  osButton,
  refusalLine,
  resolveSelection,
  setAvailability,
  textValue,
} from './ui';

const STATE_LABELS: Readonly<Record<TicketState, string>> = {
  open: 'Open',
  waiting_on_user: 'Waiting on user',
  breached: 'Breached',
  resolved: 'Closed',
};

/** Live work first, then the ones the SLA already ate, then the closed pile. */
const STATE_ORDER: Readonly<Record<TicketState, number>> = {
  open: 0,
  waiting_on_user: 1,
  breached: 2,
  resolved: 3,
};

export function ticketKey(id: string): string {
  return id.startsWith('ticket:') ? id.slice('ticket:'.length) : id;
}

function ticketState(node: Readonly<ReadOnlyGraphNode>): TicketState {
  const state = node.fields[FIELDS.state];
  return isTicketState(state) ? state : 'open';
}

/**
 * Whether this ticket EVER breached, from the field the engine latches when
 * it happens. Closing a ticket sets its state to resolved and nothing else,
 * so reading the current state alone quietly forgives every breach the
 * moment the work is finished - which is precisely the thing a review is
 * about to ask you for.
 */
export function wasBreached(node: Readonly<ReadOnlyGraphNode>): boolean {
  return node.fields[FIELDS.breached] === true;
}

export function ticketStateLabel(node: Readonly<ReadOnlyGraphNode>): string {
  const state = ticketState(node);

  return state === 'resolved' && wasBreached(node)
    ? 'Closed (breached)'
    : STATE_LABELS[state];
}

/** How many SLAs were missed today, open or closed. */
export function breachedTicketCount(
  nodes: readonly Readonly<ReadOnlyGraphNode>[],
): number {
  return nodes.filter(wasBreached).length;
}

function deadlineOf(node: Readonly<ReadOnlyGraphNode>): number {
  const deadline = node.fields[FIELDS.slaDeadline];
  return typeof deadline === 'number' ? deadline : 0;
}

function reporterName(api: GameApi, entry: WorldTicket | undefined): string {
  if (entry === undefined) {
    return 'Unknown reporter';
  }

  return textValue(
    api.graph.getField(entry.def.reporter, FIELDS.name),
    entry.def.reporter,
  );
}

function slaSummary(
  node: Readonly<ReadOnlyGraphNode>,
  now: number,
): string {
  const state = ticketState(node);
  const deadline = deadlineOf(node);

  if (state === 'resolved') {
    return 'Closed';
  }

  if (state === 'breached') {
    return `Overdue ${formatDuration(now - deadline)}`;
  }

  return `${formatDuration(deadline - now)} left`;
}

export const TICKETS_APP: AppDef = {
  id: 'tickets',
  title: 'Ticket Queue',
  icon: 'icon-tickets',
  tier_required: 1,
  slack: false,
  mount: (host, api) => {
    let selectedId: string | null = null;
    // The last refusal stays on screen until the player does something else:
    // a repaint driven by the clock must not swallow the explanation.
    let refusal: string | null = null;

    const root = element('section', 'app-page tickets-app', 'tickets-app');

    const toolbar = element('div', 'tickets-toolbar');
    const summary = element('span', 'tickets-summary', 'tickets-summary');
    const note = element('span', 'tickets-note');
    note.textContent = 'Tickets close when the world is fixed, not when you '
      + 'say so.';
    toolbar.append(summary, note);

    const queue = element('ul', 'tickets-queue', 'tickets-queue');
    const detail = element('section', 'tickets-detail', 'ticket-detail');

    const columns = element('div', 'tickets-columns');
    columns.append(queue, detail);
    root.append(toolbar, columns);

    const ticketNodes = (): readonly ReadOnlyGraphNode[] => (
      [...api.graph.nodesOfKind('ticket')].sort((left, right) => {
        const order = STATE_ORDER[ticketState(left)]
          - STATE_ORDER[ticketState(right)];

        if (order !== 0) {
          return order;
        }

        const byDeadline = deadlineOf(left) - deadlineOf(right);
        return byDeadline !== 0
          ? byDeadline
          : left.id.localeCompare(right.id);
      })
    );

    const dispatchOn = (action: string, ticketId: string): void => {
      const result = api.dispatch(action, api.actor, ticketId, {});
      refusal = result.ok ? null : result.reason;
      render();
    };

    const renderQueue = (nodes: readonly ReadOnlyGraphNode[]): void => {
      const now = api.clock.now();
      queue.replaceChildren();

      for (const node of nodes) {
        const entry = findWorldTicket(node.id);
        const state = ticketState(node);
        const item = element('li');
        const row = element(
          'button',
          'ticket-row',
          `ticket-row-${ticketKey(node.id)}`,
        );
        row.type = 'button';
        row.dataset.state = state;
        row.dataset.breached = String(wasBreached(node));
        row.dataset.selected = String(node.id === selectedId);

        const title = element('strong');
        title.textContent = entry?.def.flavor.title ?? node.id;
        const meta = element('span', 'ticket-row-meta');
        meta.textContent = reporterName(api, entry);
        const status = element('span', 'ticket-row-status');
        const badge = element('span', 'ticket-badge');
        badge.dataset.state = state;
        badge.dataset.breached = String(wasBreached(node));
        badge.textContent = ticketStateLabel(node);
        const sla = element('span', 'ticket-row-sla');
        sla.textContent = slaSummary(node, now);
        status.append(badge, sla);

        row.append(title, meta, status);
        row.addEventListener('click', () => {
          selectedId = node.id;
          refusal = null;
          render();
        });
        item.append(row);
        queue.append(item);
      }

      if (nodes.length === 0) {
        const empty = element('li', 'tickets-empty', 'tickets-empty');
        empty.textContent = 'Queue empty. Somebody is about to fix that.';
        queue.append(empty);
      }
    };

    const renderDetail = (node: ReadOnlyGraphNode | undefined): void => {
      detail.replaceChildren();

      if (node === undefined) {
        const empty = element('p', 'tickets-placeholder', 'ticket-detail-empty');
        empty.textContent = 'Pick a ticket on the left. They do not pick '
          + 'themselves, and neither does anyone else.';
        detail.append(empty);
        return;
      }

      const entry = findWorldTicket(node.id);
      const state = ticketState(node);
      const now = api.clock.now();
      const deadline = deadlineOf(node);

      const heading = element('h2', undefined, 'ticket-detail-title');
      heading.textContent = entry?.def.flavor.title ?? node.id;

      const facts = element('dl', 'ticket-facts');
      definitionRow(facts, 'Reporter', 'ticket-detail-reporter').textContent = reporterName(api, entry);
      definitionRow(facts, 'Raised', 'ticket-detail-raised').textContent = formatSimTime(
        typeof node.fields[FIELDS.spawnedAt] === 'number'
          ? Number(node.fields[FIELDS.spawnedAt])
          : 0,
      ).time;
      const stateValue = definitionRow(facts, 'State', 'ticket-detail-state');
      const stateBadge = element('span', 'ticket-badge');
      stateBadge.dataset.state = state;
      stateBadge.dataset.breached = String(wasBreached(node));
      stateBadge.textContent = ticketStateLabel(node);
      stateValue.append(stateBadge);
      definitionRow(facts, 'Due', 'ticket-detail-due').textContent = formatSimTime(deadline).time;
      definitionRow(facts, 'SLA', 'ticket-detail-sla').textContent = slaSummary(node, now);

      const body = element('p', 'ticket-body', 'ticket-detail-body');
      body.textContent = entry?.def.flavor.body
        ?? 'No description. The reporter is confident you know what they mean.';

      detail.append(heading, facts, body);

      // Clue lines the chat layer revealed live on the ticket node itself,
      // split by the same helper the clue action writes them with.
      const clues = clueLines(node.fields[FIELDS.clues]);

      if (clues.length > 0) {
        const list = element('ul', 'ticket-clues', 'ticket-clues');

        for (const line of clues) {
          const clue = element('li');
          clue.textContent = line;
          list.append(clue);
        }

        detail.append(list);
      }

      const actions = element('div', 'app-action-row');
      const closed = state === 'resolved';

      const waiting = state === 'waiting_on_user';
      const waitingButton = osButton(
        waiting ? 'Take it back off the user' : 'Mark waiting on user',
        'ticket-waiting-toggle',
      );
      setAvailability(
        waitingButton,
        closed
          ? 'This ticket is closed. The clock has nothing left to stop.'
          : state === 'breached'
            ? 'The SLA has already run out. Parking it now fools nobody.'
            // The CYA rule, said before the click and in the same words the
            // engine would refuse it with. Message the reporter first.
            : !waiting && node.fields[FIELDS.questionAsked] !== true
              ? WAITING_NEEDS_QUESTION_REASON
              : null,
      );
      waitingButton.addEventListener('click', () => {
        dispatchOn(
          waiting
            ? HELPDESK_ACTIONS.ticketClearWaiting
            : HELPDESK_ACTIONS.ticketSetWaiting,
          node.id,
        );
      });

      const escalateButton = osButton('Escalate to field team', 'ticket-escalate');
      const escalatable = allowsEscalation(node.id);
      setAvailability(
        escalateButton,
        closed
          ? 'This ticket is closed. Escalating it would only confuse the van.'
          : escalatable
            ? node.fields[FIELDS.escalated] === true
              ? 'Already with the field team. Chasing it twice puts your name '
                + 'on it twice.'
              : null
            : 'This one is fixable from your desk, and everyone downstream '
              + 'knows it.',
      );
      escalateButton.addEventListener('click', () => {
        dispatchOn(HELPDESK_ACTIONS.ticketEscalate, node.id);
      });

      // The three cross-app links. Each one carries WHERE to land, not just
      // which app to open: a KB button that opens the KB at somebody else's
      // article is the same dead end as a KB button that does nothing.
      const reporter = entry?.def.reporter ?? '';
      const chatButton = osButton('Message reporter', 'ticket-open-chat');
      setAvailability(
        chatButton,
        !api.hasApp('chat')
          ? 'Chat is not installed on this workstation yet. Walk over, or '
            + 'wait for the rollout that was promised in March.'
          : reporter.length === 0
            ? 'This ticket has no reporter on file. It filed itself, which is '
              + 'a different ticket entirely.'
            : null,
      );
      chatButton.addEventListener('click', () => {
        api.openApp('chat', { kind: 'chat-person', id: reporter });
      });

      const reporterMachine = reporter.length === 0
        ? undefined
        : api.graph
          .neighbors(reporter, { direction: 'out', edgeKind: 'owns' })
          .find((node) => node.kind === 'machine');
      const remoteButton = osButton(
        'Remote into their machine',
        'ticket-open-remote',
      );
      setAvailability(
        remoteButton,
        !api.hasApp('remote')
          ? 'Remote Assist is not installed on this workstation.'
          : reporterMachine === undefined
            ? 'No workstation is signed out to this reporter, so there is no '
              + 'screen to take over. Pick the box yourself in Remote Assist.'
            : null,
      );
      remoteButton.addEventListener('click', () => {
        if (reporterMachine !== undefined) {
          api.openApp('remote', {
            kind: 'remote-machine',
            id: reporterMachine.id,
          });
        }
      });

      const kbRef = entry?.def.kb_ref ?? '';
      const kbButton = osButton('Open KB article', 'ticket-open-kb');
      setAvailability(
        kbButton,
        !api.hasApp('kb')
          ? `The Knowledge Base is not installed yet (article: ${
            kbRef.length > 0 ? kbRef : 'none filed'
          }).`
          : kbRef.length === 0
            ? 'Nobody has filed an article for this one yet. You are about to '
              + 'become the person who did.'
            : null,
      );
      kbButton.addEventListener('click', () => {
        api.openApp('kb', { kind: 'kb-article', ref: kbRef });
      });

      actions.append(
        waitingButton,
        escalateButton,
        chatButton,
        remoteButton,
        kbButton,
      );
      detail.append(actions);

      detail.append(
        refusalLine('ticket-refusal', refusal, createIcon('icon-lock')),
      );
    };

    const render = (): void => {
      const nodes = ticketNodes();
      selectedId = resolveSelection(nodes, selectedId).id;

      const openCount = nodes.filter(
        (node) => ticketState(node) === 'open'
          || ticketState(node) === 'waiting_on_user',
      ).length;
      // Cumulative, from the latched field: a breach that was later fixed
      // still happened, and the day's tally is what the review reads.
      const breachedCount = breachedTicketCount(nodes);
      summary.textContent = `${String(openCount)} open · `
        + `${String(breachedCount)} breached · `
        + `${String(nodes.length)} total`;

      const focusedTestId = document.activeElement instanceof HTMLElement
        && root.contains(document.activeElement)
        ? document.activeElement.dataset.testid ?? null
        : null;

      renderQueue(nodes);
      renderDetail(nodes.find((node) => node.id === selectedId));

      // A repaint triggered by a tick must not steal the keyboard from the
      // control the player is standing on.
      if (focusedTestId !== null) {
        const restored = root.querySelector(
          `[data-testid="${focusedTestId}"]`,
        );

        if (restored instanceof HTMLElement) {
          restored.focus();
        }
      }
    };

    host.replaceChildren(root);
    render();

    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
