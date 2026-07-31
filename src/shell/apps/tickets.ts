import type { ReadOnlyGraphNode } from '../../engine-api';
import { isTicketState, type TicketState } from '../../engine-api';
import {
  fieldLines,
  HELPDESK_ACTIONS,
  WAITING_NEEDS_QUESTION_REASON,
} from '../../world/actions';
import { FIELDS } from '../../world/fields';
import {
  cellLabel,
  type Classification,
  classify,
  isLevel,
  isMisclassified,
  type Level,
  LEVEL_LABELS,
  LEVELS,
  priorityLabel,
  targetsFor,
} from '../../world/priority';
import {
  HOLD_REASON_LABELS,
  holdReasonOf,
  ticketClocks,
  type TicketClocks,
} from '../../world/sla';
import {
  allowsEscalation,
  findWorldTicket,
  joinLines,
  triedFromLog,
  trueClassification,
  whyThin,
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
  waiting_on_user: 'On hold',
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

  if (state === 'resolved' && wasBreached(node)) {
    return 'Closed (breached)';
  }

  if (state === 'waiting_on_user') {
    const reason = holdReasonOf(node);
    return reason === null
      ? STATE_LABELS[state]
      : HOLD_REASON_LABELS[reason];
  }

  return STATE_LABELS[state];
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

/** The player's own triage, if they have done one. */
function assignedClassification(
  node: Readonly<ReadOnlyGraphNode>,
): Classification | null {
  const impact = node.fields[FIELDS.impact];
  const urgency = node.fields[FIELDS.urgency];

  return isLevel(impact) && isLevel(urgency)
    ? classify(impact, urgency)
    : null;
}

function clocksFor(
  api: GameApi,
  node: Readonly<ReadOnlyGraphNode>,
): TicketClocks {
  const entry = findWorldTicket(node.id);
  return ticketClocks(node, api.clock.now(), entry?.def.sla_ticks ?? 0);
}

/** One clock, said the way a queue says it. */
function clockSummary(
  clock: Readonly<TicketClocks['response' | 'resolution']>,
  stoppedWord: string,
): string {
  if (clock.breached) {
    return clock.running
      ? `Overdue ${formatDuration(-clock.remaining)}`
      : `${stoppedWord}, late`;
  }

  return clock.running
    ? `${formatDuration(clock.remaining)} left`
    : `${stoppedWord}, in time`;
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
    // Half-entered triage, per ticket: what the player has picked on the two
    // dropdowns but not yet filed. It is not world state until they file it.
    let pickedImpact: Level | null = null;
    let pickedUrgency: Level | null = null;
    // The handoff form: open or not, and the one line only the player can
    // write. Everything else on the form is read off the dispatch log.
    let handoffOpen = false;
    let handoffReported = '';

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

    const dispatchOn = (
      action: string,
      ticketId: string,
      params: Record<string, string | number | boolean | null> = {},
    ): boolean => {
      const result = api.dispatch(action, api.actor, ticketId, params);
      refusal = result.ok ? null : result.reason;
      render();
      return result.ok;
    };

    const renderQueue = (nodes: readonly ReadOnlyGraphNode[]): void => {
      queue.replaceChildren();

      for (const node of nodes) {
        const entry = findWorldTicket(node.id);
        const state = ticketState(node);
        const clocks = clocksFor(api, node);
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
        row.dataset.priority = clocks.priority === null
          ? 'none'
          : String(clocks.priority);

        const title = element('strong');
        title.textContent = entry?.def.flavor.title ?? node.id;
        const meta = element('span', 'ticket-row-meta');
        meta.textContent = reporterName(api, entry);
        const status = element('span', 'ticket-row-status');
        const priority = element(
          'span',
          'ticket-priority',
          `ticket-row-priority-${ticketKey(node.id)}`,
        );
        priority.dataset.priority = clocks.priority === null
          ? 'none'
          : String(clocks.priority);
        priority.textContent = priorityLabel(clocks.priority);
        const badge = element('span', 'ticket-badge');
        badge.dataset.state = state;
        badge.dataset.breached = String(wasBreached(node));
        badge.textContent = ticketStateLabel(node);
        const sla = element('span', 'ticket-row-sla');
        sla.textContent = clockSummary(clocks.resolution, 'Closed');
        status.append(priority, badge, sla);

        row.append(title, meta, status);
        row.addEventListener('click', () => {
          selectedId = node.id;
          refusal = null;
          pickedImpact = null;
          pickedUrgency = null;
          handoffOpen = false;
          handoffReported = '';
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

    /** One of the two triage dropdowns. */
    const levelPicker = (
      testId: string,
      label: string,
      value: Level | null,
      onPick: (level: Level) => void,
    ): HTMLElement => {
      const wrap = element('label', 'triage-field');
      const caption = element('span', 'triage-label');
      caption.textContent = label;
      const select = element('select', 'os-select', testId);

      const blank = element('option');
      blank.value = '';
      blank.textContent = 'Pick one';
      blank.selected = value === null;
      select.append(blank);

      for (const level of LEVELS) {
        const option = element('option');
        option.value = String(level);
        option.textContent = LEVEL_LABELS[level];
        option.selected = value === level;
        select.append(option);
      }

      select.addEventListener('change', () => {
        const picked = Number(select.value);

        if (isLevel(picked)) {
          onPick(picked);
        }
      });

      wrap.append(caption, select);
      return wrap;
    };

    const renderTriage = (
      node: Readonly<ReadOnlyGraphNode>,
      entry: WorldTicket | undefined,
      clocks: Readonly<TicketClocks>,
    ): HTMLElement => {
      const panel = element('section', 'ticket-triage', 'ticket-triage');
      const heading = element('h3');
      heading.textContent = 'Triage';
      const claim = element('p', 'ticket-claim', 'ticket-claimed-urgency');
      claim.textContent = entry === undefined
        ? 'Nobody has said how urgent this is.'
        : `Reporter calls it ${
          LEVEL_LABELS[entry.claimed_urgency].toLowerCase()
        } urgency. They would.`;

      const assigned = assignedClassification(node);
      const impact = pickedImpact ?? assigned?.impact ?? null;
      const urgency = pickedUrgency ?? assigned?.urgency ?? null;
      const pair = impact !== null && urgency !== null
        ? classify(impact, urgency)
        : null;

      const fields = element('div', 'triage-fields');
      fields.append(
        levelPicker('triage-impact', 'Impact', impact, (level) => {
          pickedImpact = level;
          refusal = null;
          render();
        }),
        levelPicker('triage-urgency', 'Urgency', urgency, (level) => {
          pickedUrgency = level;
          refusal = null;
          render();
        }),
      );

      const outcome = element('p', 'triage-outcome', 'triage-outcome');
      outcome.textContent = pair === null
        ? 'Priority is what the matrix makes of those two. Pick both.'
        : `The matrix says ${priorityLabel(pair.priority)}: respond within ${
          formatDuration(targetsFor(pair.priority).response)
        }, resolve within ${
          formatDuration(targetsFor(pair.priority).resolution)
        }.`;

      const file = osButton('File this triage', 'triage-file', {
        primary: true,
      });
      setAvailability(
        file,
        ticketState(node) === 'resolved'
          ? 'This ticket is closed. Triaging it now is filing a weather '
            + 'report for last Tuesday.'
          : clocks.onHold
            ? 'It is on hold. Take it back off hold before you re-cut its '
              + 'deadline, or the pause comes back to you as free time.'
            : pair === null
              ? 'Pick an impact and an urgency first.'
              : null,
      );
      file.addEventListener('click', () => {
        if (pair === null) {
          return;
        }

        if (dispatchOn(HELPDESK_ACTIONS.ticketClassify, node.id, {
          impact: pair.impact,
          urgency: pair.urgency,
          priority: pair.priority,
        })) {
          pickedImpact = null;
          pickedUrgency = null;
        }
      });

      panel.append(heading, claim, fields, outcome, file);
      return panel;
    };

    /** One comment stream, rendered so nobody confuses the two. */
    const renderStream = (
      testId: string,
      heading: string,
      lines: readonly string[],
      internal: boolean,
      empty: string,
    ): HTMLElement => {
      const panel = element('section', 'ticket-stream', testId);
      panel.dataset.internal = String(internal);
      const title = element('h3');
      title.textContent = heading;
      panel.append(title);

      if (lines.length === 0) {
        const nothing = element('p', 'ticket-stream-empty');
        nothing.textContent = empty;
        panel.append(nothing);
        return panel;
      }

      const list = element('ul', 'ticket-stream-lines');

      for (const line of lines) {
        const entry = element('li');
        entry.textContent = line;
        list.append(entry);
      }

      panel.append(list);
      return panel;
    };

    const renderHandoff = (node: Readonly<ReadOnlyGraphNode>): HTMLElement => {
      const entry = findWorldTicket(node.id);
      const tried = triedFromLog(api.dispatchLog(), entry?.nodes ?? []);
      const panel = element('section', 'ticket-handoff', 'ticket-handoff');

      const heading = element('h3');
      heading.textContent = 'Handoff to second line';
      const preamble = element('p', 'ticket-handoff-note');
      preamble.textContent = 'They take tickets on a form. What you tried is '
        + 'already filled in from what you actually did.';

      const reportedField = element('label', 'triage-field');
      const reportedLabel = element('span', 'triage-label');
      reportedLabel.textContent = 'What the user reported';
      const reported = element('input', 'os-input', 'handoff-reported');
      reported.type = 'text';
      reported.value = handoffReported;
      reported.placeholder = 'In their words, or as close as you can bear.';
      reported.addEventListener('input', () => {
        handoffReported = reported.value;
        updateSendState();
      });
      reportedField.append(reportedLabel, reported);

      const triedPanel = element('div', 'handoff-tried', 'handoff-tried');
      const triedTitle = element('span', 'triage-label');
      triedTitle.textContent = 'What I tried';
      triedPanel.append(triedTitle);

      if (tried.length === 0) {
        const nothing = element('p', 'ticket-stream-empty', 'handoff-tried-empty');
        nothing.textContent = 'Nothing yet. You have not touched this one.';
        triedPanel.append(nothing);
      } else {
        const list = element('ul', 'ticket-stream-lines');

        for (const line of tried) {
          const item = element('li');
          item.dataset.worked = String(line.worked);
          item.textContent = `${formatSimTime(line.tick).time} ${line.text}`;
          list.append(item);
        }

        triedPanel.append(list);
      }

      const warning = element('p', 'ticket-handoff-warning', 'handoff-warning');
      const send = osButton('Send it to second line', 'handoff-send', {
        primary: true,
      });

      function currentHandoff(): { reported: string; tried: string[] } {
        return {
          reported: handoffReported,
          tried: tried.map((line) => line.text),
        };
      }

      function updateSendState(): void {
        const thin = whyThin(currentHandoff());
        warning.hidden = thin === null;
        warning.textContent = thin ?? '';
      }

      updateSendState();

      send.addEventListener('click', () => {
        const form = currentHandoff();

        if (dispatchOn(HELPDESK_ACTIONS.ticketEscalate, node.id, {
          reported: form.reported,
          tried: joinLines(form.tried),
        })) {
          handoffOpen = false;
          handoffReported = '';
        }
      });

      const cancel = osButton('Not yet', 'handoff-cancel');
      cancel.addEventListener('click', () => {
        handoffOpen = false;
        render();
      });

      const buttons = element('div', 'app-action-row');
      buttons.append(send, cancel);

      panel.append(heading, preamble, reportedField, triedPanel, warning, buttons);
      return panel;
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
      const clocks = clocksFor(api, node);

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

      const priorityValue = definitionRow(
        facts,
        'Priority',
        'ticket-detail-priority',
      );
      const priorityBadge = element('span', 'ticket-priority');
      priorityBadge.dataset.priority = clocks.priority === null
        ? 'none'
        : String(clocks.priority);
      priorityBadge.textContent = clocks.priority === null
        ? 'Untriaged (treated as P3)'
        : priorityLabel(clocks.priority);
      priorityValue.append(priorityBadge);

      definitionRow(facts, 'Response SLA', 'ticket-detail-response')
        .textContent = `${clockSummary(clocks.response, 'Answered')} · target ${
          formatDuration(targetsFor(clocks.priority).response)
        }`;
      definitionRow(facts, 'Resolution SLA', 'ticket-detail-resolution')
        .textContent = `${clockSummary(clocks.resolution, 'Closed')} · due ${
          formatSimTime(clocks.resolution.dueAt).time
        }${clocks.heldTicks > 0
          ? ` · paused ${formatDuration(clocks.heldTicks)}`
          : ''}`;

      const body = element('p', 'ticket-body', 'ticket-detail-body');
      body.textContent = entry?.def.flavor.body
        ?? 'No description. The reporter is confident you know what they mean.';

      detail.append(heading, facts, body);
      detail.append(renderTriage(node, entry, clocks));

      detail.append(
        renderStream(
          'ticket-worknotes',
          'Work notes (internal)',
          fieldLines(node.fields[FIELDS.worknotes]),
          true,
          'Nothing worked out yet. Nobody reads these until they do.',
        ),
        renderStream(
          'ticket-comments',
          'Customer-visible',
          fieldLines(node.fields[FIELDS.customerVisible]),
          false,
          'Nothing has been put to the reporter. As far as they know, '
            + 'nobody has looked.',
        ),
      );

      if (handoffOpen) {
        detail.append(renderHandoff(node));
      }

      const actions = element('div', 'app-action-row');
      const closed = state === 'resolved';

      const waiting = state === 'waiting_on_user';
      const waitingButton = osButton(
        waiting ? 'Take it back off hold' : 'Put it on hold',
        'ticket-waiting-toggle',
      );
      setAvailability(
        waitingButton,
        closed
          ? 'This ticket is closed. The clock has nothing left to stop.'
          : state === 'breached'
            ? 'The SLA has already run out. Parking it now fools nobody.'
            // The CYA rule, said before the click and in the same words the
            // engine would refuse it with. Ask them something first, where
            // they can see it.
            : !waiting
              && fieldLines(node.fields[FIELDS.customerVisible]).length === 0
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
        handoffOpen = true;
        refusal = null;
        render();
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
          .find((owned) => owned.kind === 'machine');
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

/**
 * Tickets whose triage does not match the world, for the day-end review.
 *
 * It is the assigned CELL against the true one rather than the priority they
 * happened to produce: two different wrong readings that land on the same
 * number are still two wrong readings, and the review reads the classification.
 */
export interface Misclassified {
  readonly id: string;
  readonly title: string;
  readonly assigned: Classification;
  readonly truth: Classification;
}

export function misclassifiedTickets(
  api: Pick<GameApi, 'graph'>,
  nodes: readonly Readonly<ReadOnlyGraphNode>[],
): readonly Misclassified[] {
  const found: Misclassified[] = [];

  for (const node of nodes) {
    const assigned = assignedClassification(node);
    const truth = trueClassification(api.graph, node.id);

    if (assigned === null || truth === null || !isMisclassified(assigned, truth)) {
      continue;
    }

    found.push({
      id: node.id,
      title: findWorldTicket(node.id)?.def.flavor.title ?? node.id,
      assigned,
      truth,
    });
  }

  return found;
}

export { cellLabel };
