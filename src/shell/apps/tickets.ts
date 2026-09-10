import type { ReadOnlyGraphNode } from '../../engine-api';
import { isTicketState, type TicketState } from '../../engine-api';
import {
  CLASSIFY_BREACHED_REASON,
  CLASSIFY_CLOSED_REASON,
  CLASSIFY_ON_HOLD_REASON,
  fieldLines,
  HELPDESK_ACTIONS,
  LINK_CLOSED_REASON,
  WAITING_NEEDS_QUESTION_REASON,
} from '../../world/actions';
import {
  customerIdForTicketNodes,
  customerName,
} from '../../world/customers';
import {
  AUDIT_VERDICTS,
  filedOn,
  isAuditTicket,
  verdictOn,
} from '../../world/audit';
import { FIELDS, SLA_TIER_LABELS, type SlaTier } from '../../world/fields';
import {
  articleLinkNote,
  findKbArticle,
  kbShelf,
} from '../../world/kb';
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
  tierTargetsFor,
  type Priority,
} from '../../world/priority';
import {
  HOLD_REASON_LABELS,
  holdReasonOf,
  type PrioritySource,
  prioritySourceOf,
  ticketClocks,
  type TicketClocks,
} from '../../world/sla';
import {
  cadenceIntervalFor,
  cadenceMissesOn,
  cadencePriorityOf,
  cadenceWindowClosesAt,
} from '../../world/cadence';
import {
  allowsEscalation,
  childrenOf,
  findWorldTicket,
  joinLines,
  linkNote,
  parentOf,
  ticketTitle,
  triedFromTouches,
  trueClassification,
  whyThin,
  type WorldTicket,
} from '../../world/tickets';
import { serviceMinutesBetween } from '../../world/hours';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, GameApi } from './types';
import {
  definitionRow,
  element,
  formatDuration,
  type KeyedRow,
  KeyedRows,
  osButton,
  outcomeLine,
  refusalLine,
  resolveSelection,
  setAvailability,
  setFlag,
  setText,
  textValue,
  withFocusRestored,
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

/**
 * The article somebody linked while working this ticket, or nothing.
 *
 * Deliberately not the same question as "which article is this ticket about":
 * the definition's `kb_ref` is where a player is told to start reading, and
 * this is what they say they actually used. A report counts the second one.
 */
export function linkedArticle(
  node: Readonly<ReadOnlyGraphNode>,
): string | null {
  const value = node.fields[FIELDS.kbRef];
  return typeof value === 'string' && value.length > 0 ? value : null;
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

function reporterName(
  api: Pick<GameApi, 'graph'>,
  entry: WorldTicket | undefined,
): string {
  if (entry === undefined) {
    return 'Unknown reporter';
  }

  return textValue(
    api.graph.getField(entry.def.reporter, FIELDS.name),
    entry.def.reporter,
  );
}

/**
 * Which lever moved the number, in the one sentence the pane prints - or
 * nothing, when the pane already has a row that says it.
 *
 * VIP is that case and it is `null` deliberately: the row above already says the
 * priority is forced by the caller's name and that nobody here can unpick it, and
 * a second sentence about the same lever would read as a second lever.
 *
 * Exported because this IS the row: the pane is DOM and the offline suite is
 * not, so a claim about what the player reads has to be checkable without a
 * browser standing up.
 */
export function prioritySourceLine(source: PrioritySource): string | null {
  if (source === 'vip') {
    return null;
  }

  if (source === 'off_matrix') {
    return 'The number does not follow from the recorded cell - the two '
      + 'dropdowns below disagree with it. Somebody\'s arithmetic, not the '
      + 'matrix\'s; the audit queue exists for exactly this.';
  }

  return source === 'self_declared'
    ? 'The reporter made a claim about how urgent this is and nobody has read '
      + 'it yet. The number above is not that claim - it is the desk\'s '
      + 'default for anything untriaged, and it stands until somebody triages '
      + 'this one.'
    : 'Priority came out of the matrix - impact times urgency, the two '
      + 'dropdowns below, nobody\'s name involved.';
}

/**
 * The VIP row's sentence, whose flag named honestly (E9, 0.37.0).
 *
 * Exported for the same reason `prioritySourceLine` is: the shadow VIP's
 * ticket is typed by the assistant and flagged for the executive it is FOR,
 * so "the caller is on the list" would be a lie on exactly the ticket this
 * row most needs to be true on - and a claim about what the player reads
 * has to be checkable without a browser standing up.
 */
export function vipRowLine(
  beneficiary: unknown,
  priority: Priority | null,
): string {
  return (typeof beneficiary === 'string' && beneficiary.length > 0
    ? `Raised on behalf of ${beneficiary}, who is on the VIP list - the `
      + 'flag keys off who it is FOR, not who typed it. The priority '
    : 'The caller is on the VIP list, so the priority ')
    + 'is forced to '
    + `${priorityLabel(priority)} regardless of impact. Nobody `
    + 'chose it and nobody can unpick it here.';
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
  return ticketClocks(node, api.clock.now());
}

/** The two sentences the detail pane's SLA rows carry, built in one place so
 * the minute-by-minute repaint and the full one cannot come to disagree. */
export function responseLine(clocks: Readonly<TicketClocks>): string {
  // "Touched", not "Answered" (0.42.0, W-04). The stamp behind this clock is
  // the first time anybody DID anything about the ticket, and it is written
  // even where the fix landed before a word was said to the reporter - which
  // is the honest model and was the dishonest word: the row printed the
  // trade's term for a conversation four rows above a stream saying nobody
  // had been told anything. The conversation now has a row of its own below.
  return `${clockSummary(clocks.response, 'Touched')}`
    + ` · target ${formatDuration(clocks.target.response)}`;
}

/**
 * The other half of it: what the REPORTER has been told (0.42.0, W-04).
 *
 * Model-level and exported for the same reason `cadenceLine` is - the pane is
 * DOM and the offline suite is not - and it reads one field, `answered_at`,
 * which every write to the customer-visible stream stamps and nothing else
 * does. Where both stamps exist the gap between them is the sentence: the
 * minutes between somebody picking the ticket up and the reporter finding out
 * anybody had. Where the second one does not exist the row says so in the
 * words the stream below it already uses, rather than leaving the clock above
 * to imply a conversation that never happened.
 */
export function answeredLine(
  node: Readonly<ReadOnlyGraphNode>,
  clocks: Readonly<TicketClocks>,
): string {
  const answeredAt = node.fields[FIELDS.answeredAt];

  if (typeof answeredAt !== 'number') {
    return node.fields[FIELDS.state] === 'resolved'
      ? 'Nothing was ever put to the reporter. It was fixed in silence: the '
        + 'clock above stopped when somebody picked it up, not when anybody '
        + 'told them.'
      : 'Nothing has been put to the reporter yet. The clock above stops at '
        + 'the first touch; this one waits for words.';
  }

  const touchedAt = clocks.response.stoppedAt;
  // Counted in minutes at the desk, like every other span this pane prints:
  // the gap across a night is the hours somebody could have written in, not
  // the hours on the wall.
  const gap = touchedAt === null
    ? 0
    : serviceMinutesBetween(touchedAt, answeredAt);

  // With the day on it, in the shape the rest of the building stamps a minute
  // in - `10:00 (Day 1)`. A ticket can be answered on the Tuesday and read on
  // the Thursday, and a bare time on a pane that spans a week is the W-17
  // class of fault: a stamp that reads as today whatever day it happened on.
  const at = formatSimTime(answeredAt);

  return `First words to the reporter at ${at.time} (${at.day})`
    + (gap > 0
      ? ` · ${formatDuration(gap)} after it was first touched.`
      : '.');
}

/**
 * The update-cadence row's sentence: the promised gap, the minute the window
 * now running closes on, and what is already on the record.
 *
 * Exported and model-level for the reason `prioritySourceLine` is - the pane is
 * DOM and the offline suite is not - and the closing minute is here rather than
 * left to the reader (0.37.1). The row used to print the gap and the misses and
 * expect the player to add one to the other across a night the clock skips,
 * which is arithmetic nobody does and everybody gets wrong in the direction
 * that costs them. It is static between records, so it belongs on the same
 * repaint discipline the row already had.
 */
export function cadenceLine(
  node: Readonly<ReadOnlyGraphNode>,
  interval: number,
): string {
  const missed = cadenceMissesOn(node);
  const record = missed > 0
    ? ` ${String(missed)} window${missed === 1 ? '' : 's'} of silence `
      + 'on the record already; the record does not shrink.'
    : '';
  const state = node.fields[FIELDS.state];

  // The clock only runs where the settler charges it (0.37.1 second round):
  // a parked ticket's silence is excused and a closed ticket's record is
  // history, and the first cut printed a closing minute on both - a specific
  // false promise on the two commonest states a ticket can be read in.
  if (state === 'resolved') {
    return `An update every ${formatDuration(interval)} was the promise. `
      + 'Closed now; what the record holds is what it billed.'
      + record;
  }

  if (state === 'waiting_on_user') {
    return `An update every ${formatDuration(interval)}`
      + ' - the contract clock on talking, not fixing. Parked, so the clock '
      + 'is held: waiting minutes are excused, and the window resumes when '
      + 'the ticket comes back.'
      + record;
  }

  return `An update every ${formatDuration(interval)}`
    + ' - the contract clock on talking, not fixing. This window closes at '
    + `${formatSimTime(cadenceWindowClosesAt(node, interval)).time}.`
    + record;
}

function resolutionLine(clocks: Readonly<TicketClocks>): string {
  return `${clockSummary(clocks.resolution, 'Closed')}`
    + ` · due ${formatSimTime(clocks.resolution.dueAt).time}`
    // The contract's honesty (D4, 0.37.0): an external tier binds the talking,
    // not the fixing - published resolution targets are best effort at every
    // vendor the research checked. The tool still shows its target, because
    // the tool always does; the words stop it reading as the binding clock.
    + (clocks.tier !== null ? ' · goal, best effort' : '')
    + (clocks.heldTicks > 0
      ? ` · paused ${formatDuration(clocks.heldTicks)}`
      : '');
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

/**
 * One line of the queue, as data.
 *
 * The row is modelled before it is drawn so the thing that moves every minute
 * can be seen for what it is: of the ten values below, exactly one - `sla` -
 * changes when nothing has happened but time. A row is therefore never rebuilt
 * on a tick; it is told the new sentence and keeps its element, its checkbox
 * and whatever the player was doing to it.
 */
export interface TicketRow {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly reporter: string;
  /**
   * Which CUSTOMER this ticket is for (0.8.0), derived from the box its fault is
   * on, or null for an in-house ticket. The multi-customer board is the defining
   * fact of MSP work - the queue, not the tech, decides which company you are in
   * - so the row names it.
   */
  readonly customer: string | null;
  /**
   * The customer's SLA tier (0.12.0), or null in-house. The queue names it
   * beside the customer so the player can triage BY it - a Gold P2 outranks a
   * Bronze P1, which is the real prioritisation call the tier exists to make.
   */
  readonly tier: SlaTier | null;
  readonly state: TicketState;
  readonly breached: boolean;
  readonly selected: boolean;
  readonly picked: boolean;
  readonly priority: string;
  readonly priorityLabel: string;
  /**
   * Whether that priority was FORCED by the caller's VIP flag (E8, 0.26.0).
   *
   * The queue has to say it, or the injustice is invisible: two rows reading P2,
   * one of them because four people cannot work and one because of whose name is
   * on it. The label carries it in words and the flag carries it as an attribute,
   * so the row can be styled and read either way.
   */
  readonly vip: boolean;
  readonly badge: string;
  /** The countdown, and the only part of a row a passing minute may move. */
  readonly sla: string;
}

export interface QueueView {
  readonly selectedId: string | null;
  readonly picked: ReadonlySet<string>;
}

/**
 * What the priority cell says (E8, 0.26.0).
 *
 * For everybody, the priority. For a VIP caller's ticket, the priority AND the
 * reason, in the two letters the product itself uses - because "P2" on the exec's
 * earbuds and "P2" on a system outage are the same number arrived at two
 * completely different ways, and a queue that prints only the number is a queue
 * that has hidden the whole mechanic.
 */
function priorityCellLabel(clocks: Readonly<TicketClocks>): string {
  return clocks.vip
    ? `${priorityLabel(clocks.priority)} (VIP)`
    : priorityLabel(clocks.priority);
}

export function ticketRows(
  api: Pick<GameApi, 'graph'>,
  nodes: readonly Readonly<ReadOnlyGraphNode>[],
  now: number,
  view: Readonly<QueueView>,
): readonly TicketRow[] {
  return nodes.map((node) => {
    const entry = findWorldTicket(node.id);
    const clocks = ticketClocks(node, now);
    const customerId = entry === undefined
      ? null
      : customerIdForTicketNodes(api.graph, entry.nodes);

    return {
      id: node.id,
      key: ticketKey(node.id),
      title: entry?.def.flavor.title ?? node.id,
      reporter: reporterName(api, entry),
      customer: customerId === null ? null : customerName(api.graph, customerId),
      tier: clocks.tier,
      state: ticketState(node),
      breached: wasBreached(node),
      selected: node.id === view.selectedId,
      picked: view.picked.has(node.id),
      priority: clocks.priority === null ? 'none' : String(clocks.priority),
      priorityLabel: priorityCellLabel(clocks),
      vip: clocks.vip,
      badge: ticketStateLabel(node),
      sla: clockSummary(clocks.resolution, 'Closed'),
    };
  });
}

/**
 * The three counters a passing minute moves on its own, and that the queue
 * rows and the two detail cells are told DIRECTLY on every tick rather than
 * rebuilt for.
 *
 * The engine walks the deadline of a parked ticket out by one every minute -
 * `sla_deadline`, with `held_ticks` or `off_hours_ticks` counting why - so a
 * fingerprint that read them would change on every tick of a shift and rebuild
 * this window once a minute, which is the exact thing the countdown cells are
 * updated in place to avoid. They are excluded because they are the clock, not
 * the content.
 */
const LIVE_CLOCK_FIELDS: ReadonlySet<string> = new Set([
  FIELDS.slaDeadline,
  FIELDS.heldTicks,
  FIELDS.offHoursTicks,
]);

/**
 * A fingerprint of everything on this screen that a WORLD change could move,
 * and nothing a mere minute does: the queue's own content - every ticket's
 * fields but the live-clock counters above - and which ticket is selected.
 *
 * It is the tickets app's half of the repaint discipline every list in this
 * shell keeps. The detail pane is rebuilt on every world change, so a world
 * change that leaves the queue untouched - the pressure meters ticking on the
 * PLAYER node, a stress point charged for an unread Hubbub message, suspicion
 * draining - would throw the pane away under the player's cursor, taking a
 * ticked duplicate box and an open triage dropdown with it. The meters live on
 * the player node and never on a ticket, so such a change produces the
 * identical fingerprint and the pane is left standing. Only a change to a
 * ticket the queue actually draws rebuilds it. The other detail panes in this
 * shell (the directory's, Remote Assist's) keep the same discipline by
 * comparing a model signature; this is that signature, read off the graph.
 */
export function ticketQueueFingerprint(
  nodes: readonly Readonly<ReadOnlyGraphNode>[],
  selectedId: string | null,
): string {
  const parts = nodes.map((node) => {
    const fields = Object.keys(node.fields)
      .filter((field) => !LIVE_CLOCK_FIELDS.has(field))
      .sort()
      .map((field) => `${field}=${JSON.stringify(node.fields[field])}`);

    return `${node.id}#${fields.join(',')}`;
  });

  return `${selectedId ?? ''}|${parts.join(';')}`;
}

export const TICKETS_APP: AppDef = {
  id: 'tickets',
  title: 'Ticket Queue',
  icon: 'icon-tickets',
  tier_required: 1,
  slack: false,
  mount: (host, api) => {
    let selectedId: string | null = null;
    /** Which list is on screen. `mine` on every rung that has only one. */
    let tab: 'mine' | 'audit' = 'mine';
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
    // Which article the player has picked but not yet linked. Like the triage
    // dropdowns, it is not world state until they say so.
    let pickedArticle: string | null = null;
    // The tickets ticked on the left, waiting to be attached to a parent. A
    // selection is not a link: nothing happens to any of them until the player
    // names the incident they are all duplicates of.
    const picked = new Set<string>();
    let linkOutcome: string | null = null;
    // The fingerprint of the queue as it stood when this window was last
    // rebuilt. A world change whose fingerprint matches it is a change to
    // something this window does not draw - the meters on the player node, most
    // often - and rebuilding for it would throw away the pane, the triage
    // dropdowns and the ticked boxes the player is working in. Null until the
    // first paint.
    let painted: string | null = null;
    /**
     * The detail pane's two countdown cells, and which ticket they are about.
     * A minute passing moves those two sentences and nothing else on the pane,
     * so the minute writes them directly instead of rebuilding a panel with a
     * pair of dropdowns in it that the player may well have open.
     */
    let detailClocks: {
      readonly id: string;
      readonly response: HTMLElement;
      readonly resolution: HTMLElement;
    } | null = null;

    const root = element('section', 'app-page tickets-app', 'tickets-app');

    const toolbar = element('div', 'tickets-toolbar');
    const summary = element('span', 'tickets-summary', 'tickets-summary');
    const note = element('span', 'tickets-note');
    note.textContent = 'Tickets close when the world is fixed, not when you '
      + 'say so.';
    toolbar.append(summary, note);

    /**
     * THE SECOND QUEUE (E9, 0.36.0) - a tab on this window rather than a window
     * of its own, and that is the load-bearing decision of the whole slice.
     *
     * The senior rung's shape break is that a SECOND LIST arrives, not a second
     * desk. Everything below the list is the same: the same detail pane, the
     * same clocks, the same estate, and - the part that decides it - the same
     * TRIAGE FORM, because correcting a junior's filing is filing a triage. A
     * window of its own would have had to either carry its own copy of the two
     * dropdowns, the nine cells and the deadline arithmetic (a second matrix,
     * free to drift from the one the game teaches) or reduce to an index that
     * sends you back here, which is a window that does nothing.
     *
     * And the tension reads for free this way: switching tabs does not stop
     * your own clocks. Same window, same minute, somebody else's problem.
     *
     * The strip is HIDDEN outright where no audit item exists, which is every
     * rung but the senior's. A dead tab on a junior's Monday would be the
     * window advertising a job that desk does not have, and it keeps the
     * shipped weeks' markup byte-identical.
     */
    const tabs = element('div', 'tickets-tabs', 'tickets-tabs');
    const mineTab = osButton('My queue', 'tickets-tab-mine', { compact: true });
    const auditTab = osButton('QA audit', 'tickets-tab-audit', {
      compact: true,
    });

    for (const [button, which] of [
      [mineTab, 'mine'],
      [auditTab, 'audit'],
    ] as const) {
      button.addEventListener('click', () => {
        tab = which;
        // The selection belongs to the list it was made in: carrying it across
        // would open the audit tab on one of your own tickets, which is the
        // one thing the split exists to stop.
        selectedId = null;
        refusal = null;
        render();
      });
    }

    tabs.append(mineTab, auditTab);
    toolbar.append(tabs);

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

    const emptyRow = element('li', 'tickets-empty', 'tickets-empty');
    emptyRow.textContent = 'Queue empty. Somebody is about to fix that.';

    /**
     * Builds one queue row, once. Everything the row can ever say is written
     * by `update`; the listeners close over the ticket ID rather than over a
     * graph node, because the node is a snapshot and the id is the ticket.
     */
    const createRow = (
      model: Readonly<TicketRow>,
    ): KeyedRow<TicketRow, HTMLLIElement> => {
      const id = model.id;
      const item = element('li');
      const row = element('button', 'ticket-row', `ticket-row-${model.key}`);
      row.type = 'button';

      const title = element('strong');
      const meta = element('span', 'ticket-row-meta');
      const status = element('span', 'ticket-row-status');
      const priority = element(
        'span',
        'ticket-priority',
        `ticket-row-priority-${model.key}`,
      );
      const badge = element('span', 'ticket-badge');
      const sla = element('span', 'ticket-row-sla');
      status.append(priority, badge, sla);

      // The tick box is a SIBLING of the row rather than a control inside
      // it: a button in a button is not a thing, and selecting a duplicate
      // must not also re-open the detail pane of the ticket you are about to
      // attach to something else.
      const pick = element('input', 'ticket-pick', `ticket-pick-${model.key}`);
      pick.type = 'checkbox';
      pick.addEventListener('change', () => {
        if (pick.checked) {
          picked.add(id);
        } else {
          picked.delete(id);
        }

        refusal = null;
        render();
      });

      row.append(title, meta, status);
      row.addEventListener('click', () => {
        selectedId = id;
        // Opening a ticket LOADS its customer's context (0.8.0): the terminal's
        // wrong-customer guard reads this to know which tenant is "on screen".
        // An in-house ticket has no customer, which clears it - you are back to
        // no tenant selected.
        const opened = findWorldTicket(id);
        api.appState.setCustomerContext(
          opened === undefined
            ? null
            : customerIdForTicketNodes(api.graph, opened.nodes),
        );
        refusal = null;
        pickedImpact = null;
        pickedUrgency = null;
        pickedArticle = null;
        handoffOpen = false;
        handoffReported = '';
        render();
      });
      item.append(pick, row);

      return {
        element: item,
        update: (next: Readonly<TicketRow>): void => {
          setFlag(row, 'state', next.state);
          setFlag(row, 'breached', String(next.breached));
          setFlag(row, 'selected', String(next.selected));
          setFlag(row, 'priority', next.priority);
          setText(title, next.title);
          // The reporter, and - for an MSP ticket - which customer it is for in
          // front of them, because at an MSP the first thing a row has to answer
          // is "whose company is this?". The customer's SLA tier rides with it
          // (0.12.0) so the queue can be triaged by what the clock is worth.
          setText(
            meta,
            next.customer === null
              ? next.reporter
              : next.tier === null
                ? `${next.customer} - ${next.reporter}`
                : `${next.customer} (${SLA_TIER_LABELS[next.tier]}) `
                  + `- ${next.reporter}`,
          );
          setFlag(priority, 'priority', next.priority);
          setFlag(priority, 'vip', String(next.vip));
          setText(priority, next.priorityLabel);
          setFlag(badge, 'state', next.state);
          setFlag(badge, 'breached', String(next.breached));
          setText(badge, next.badge);
          setText(sla, next.sla);
          pick.setAttribute(
            'aria-label',
            `Select ${next.title} as a duplicate`,
          );

          if (pick.checked !== next.picked) {
            pick.checked = next.picked;
          }
        },
      };
    };

    const queueRows = new KeyedRows<TicketRow, HTMLLIElement>(
      queue,
      (model) => model.id,
      createRow,
    );

    const renderQueue = (nodes: readonly ReadOnlyGraphNode[]): void => {
      queueRows.sync(
        ticketRows(api, nodes, api.clock.now(), { selectedId, picked }),
        emptyRow,
      );
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

    /**
     * The filing under audit: whose it is, what it says, and the one answer the
     * triage form below cannot give.
     *
     * IT DOES NOT PRINT THE ANSWER, and that is the whole design of the panel.
     * The player is shown exactly what a person doing this job is shown - the
     * cell, the number beside it, who the ticket is for - and everything needed
     * to check it is already on this screen or one click away: the estate is in
     * the monitor and the directory, the matrix is printed under the dropdowns,
     * and the VIP rule is on the row above. A panel that said "the impact is
     * wrong" would be the game doing the audit and asking the player to agree.
     *
     * The verdict, once there is one, is stated rather than hidden: a signature
     * is a fact about the ticket, and the pane says which way it went and when.
     */
    const renderAudit = (
      node: Readonly<ReadOnlyGraphNode>,
    ): HTMLElement => {
      const panel = element('section', 'ticket-audit', 'ticket-audit');
      const filed = filedOn(api.graph, node.id);
      const verdict = verdictOn(api.graph, node.id);
      panel.dataset.verdict = verdict ?? 'none';

      const heading = element('h3');
      heading.textContent = 'Quality check';

      const who = element('p', 'ticket-audit-who', 'ticket-audit-who');
      who.textContent = `Filed by ${
        textValue(node.fields[FIELDS.auditOf], 'somebody at first line')
      }. It is on their desk; the triage is on yours.`;

      const said = element('p', 'ticket-audit-filed', 'ticket-audit-filed');
      said.textContent = filed === null
        ? 'Nothing legible was filed, which is its own answer.'
        : `They filed ${cellLabel(filed)}.`;

      panel.append(heading, who, said);

      // Who it is FOR, where that is not who typed it. Only on the tickets that
      // have one, so the line's presence is itself the thing worth noticing -
      // which is exactly the fact the filing on this one missed.
      const beneficiary = node.fields[FIELDS.beneficiary];

      if (typeof beneficiary === 'string' && beneficiary.length > 0) {
        const forWhom = element(
          'p',
          'ticket-audit-beneficiary',
          'ticket-audit-beneficiary',
        );
        forWhom.textContent = `Raised on behalf of ${beneficiary}.`;
        panel.append(forWhom);
      }

      // The article, when the class has one. It is the compounding half made
      // visible: this filing is right because somebody wrote the thing down.
      const article = node.fields[FIELDS.kbRef];
      const linked = typeof article === 'string'
        ? findKbArticle(article)
        : undefined;

      if (linked !== undefined && verdict === null && filed !== null) {
        const cite = element('p', 'ticket-audit-article', 'ticket-audit-article');
        cite.textContent = `They followed ${linked.id} - "${linked.title}".`;
        panel.append(cite);
      }

      const outcome = element('p', 'ticket-audit-outcome', 'ticket-audit-outcome');
      outcome.textContent = verdict === null
        ? 'Agree with it, or file your own triage below. Filing your own costs '
          + 'you the rest of the thought you were having.'
        : verdict === AUDIT_VERDICTS.confirmed
          ? 'You signed this triage off as filed.'
          : 'You re-triaged this one.';
      panel.append(outcome);

      const actions = element('div', 'app-action-row');
      const confirm = osButton('Agree with this triage', 'audit-confirm', {
        primary: true,
      });
      setAvailability(
        confirm,
        verdict === null
          ? null
          : 'You have already ruled on this one. A QA signature is not '
            + 'something you take back by pressing the other button.',
      );
      confirm.addEventListener('click', () => {
        const result = api.day.confirmAudit(node.id);
        refusal = result.ok ? null : result.reason;
        render();
      });
      actions.append(confirm);
      panel.append(actions);

      return panel;
    };

    /**
     * The desk asking for the article, when the same class has come past twice.
     *
     * A banner on the audit tab rather than a panel on a ticket, because the
     * article is about a CLASS: hanging it off whichever instance happens to be
     * open would make it a property of one ticket, and the next one would ask
     * again. Null until KCS's own threshold is met, and gone for good once it
     * is written.
     */
    const renderWriteUp = (): HTMLElement | null => {
      if (api.day.writeUpClass() === null) {
        return null;
      }

      const banner = element('section', 'ticket-writeup', 'ticket-writeup');
      const heading = element('h3');
      heading.textContent = 'Write it up';
      const line = element('p', 'ticket-writeup-line', 'ticket-writeup-line');
      line.textContent = 'That is the second one of these this week, and first '
        + 'line have filed it the same way both times. There is no article for '
        + 'it. Writing one costs you the rest of the afternoon\'s '
        + 'concentration and it means the next one arrives right.';

      const actions = element('div', 'app-action-row');
      const write = osButton('Author the article', 'audit-author-article', {
        primary: true,
      });
      write.addEventListener('click', () => {
        const result = api.day.writeUpArticle();
        refusal = result.ok ? null : result.reason;
        render();
      });
      actions.append(write);

      banner.append(heading, line, actions);
      return banner;
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

      // The targets the preview quotes are THIS ticket's - its customer's tier
      // (0.12.0) crossed with the priority the picked cell would make - so the
      // number a Gold ticket shows is the tighter one it will actually run on.
      const previewTarget = pair === null
        ? null
        : tierTargetsFor(clocks.tier, pair.priority);
      const outcome = element('p', 'triage-outcome', 'triage-outcome');
      outcome.textContent = pair === null || previewTarget === null
        ? 'Priority is what the matrix makes of those two. Pick both.'
        : `The matrix says ${priorityLabel(pair.priority)}: respond within ${
          formatDuration(previewTarget.response)
        }, resolve within ${
          formatDuration(previewTarget.resolution)
        }.`;

      const file = osButton('File this triage', 'triage-file', {
        primary: true,
      });
      setAvailability(
        file,
        ticketState(node) === 'resolved'
          ? CLASSIFY_CLOSED_REASON
          : clocks.onHold
            ? CLASSIFY_ON_HOLD_REASON
            : ticketState(node) === 'breached'
              ? CLASSIFY_BREACHED_REASON
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
      // Off the TICKET, not off the dispatch log: the log is drained at every
      // day boundary, and a ticket worked yesterday and escalated this morning
      // would otherwise reach second line claiming nobody had touched it.
      const tried = triedFromTouches(node.fields[FIELDS.touchLog]);
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
          // And then paint, which is the whole reason this line exists: every
          // repaint the dispatch caused happened while the form was still
          // open - it has to, because a REFUSED handoff belongs on the form
          // that was refused - so without this the form that went stays on
          // screen until something unrelated moves. A send that looks like it
          // did nothing is a send the player does twice.
          render();
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

    /**
     * The KCS loop, made a control: read the base while you work, then say
     * which article you used.
     *
     * It is on the ticket rather than in the KB because the ticket is the
     * thing being solved and the ticket is what the link is evidence about -
     * and because a player who has just read four articles should not have to
     * remember which window the ticket was in.
     */
    const renderArticleLink = (
      node: Readonly<ReadOnlyGraphNode>,
    ): HTMLElement => {
      const panel = element('section', 'ticket-article', 'ticket-article');
      const heading = element('h3');
      heading.textContent = 'Knowledge article';
      const linked = linkedArticle(node);
      const current = element(
        'p',
        'ticket-article-current',
        'ticket-article-current',
      );
      current.textContent = linked === null
        ? 'Nothing linked yet. The article this one was filed under is where '
          + 'to start reading; what you link is what you actually used.'
        : `Linked: ${findKbArticle(linked)?.title ?? linked} (${linked})`;

      const row = element('div', 'ticket-article-row');
      const picker = element(
        'select',
        'os-select',
        'ticket-article-picker',
      );
      picker.setAttribute('aria-label', 'Knowledge article');

      // The SHELF rather than the corpus (E9, 0.36.0): you cannot link an
      // article nobody has written, and the picker is the one place a player
      // would otherwise find the answer to a beat they are being asked to do.
      const shelf = kbShelf(api.graph, api.actor);

      for (const article of shelf) {
        const option = element('option');
        option.value = article.id;
        option.textContent = article.state === 'draft'
          ? `${article.title} [draft]`
          : article.title;
        picker.append(option);
      }

      const fallback = linked
        ?? findWorldTicket(node.id)?.def.kb_ref
        ?? shelf[0]?.id
        ?? '';
      const chosen = pickedArticle ?? fallback;

      if (shelf.some((article) => article.id === chosen)) {
        picker.value = chosen;
      }

      picker.addEventListener('change', () => {
        pickedArticle = picker.value;
        refusal = null;
        render();
      });

      const link = osButton('Link this article', 'ticket-link-article');
      const article = findKbArticle(chosen);
      setAvailability(
        link,
        ticketState(node) === 'resolved'
          ? LINK_CLOSED_REASON
          : article === undefined
            ? 'That reference is not an article anybody wrote.'
            : article.id === linked
              ? `"${article.title}" is already the article on this ticket.`
              : null,
      );
      link.addEventListener('click', () => {
        if (article === undefined) {
          return;
        }

        if (dispatchOn(HELPDESK_ACTIONS.ticketLinkArticle, node.id, {
          article: article.id,
          note: articleLinkNote(article),
        })) {
          pickedArticle = null;
        }
      });

      row.append(picker, link);
      panel.append(heading, current, row);
      return panel;
    };

    /**
     * The flood workflow: forty reports, one fault, one incident that matters.
     *
     * The parent is the ticket the player is LOOKING at, and the children are
     * the ones they have ticked - which is the way round a service desk works
     * it, because the parent is the one you have opened, read and understood.
     * Nothing here closes anything: attaching a duplicate is filing, and the
     * children close when the parent's fault is actually fixed.
     */
    const renderParentPanel = (
      node: Readonly<ReadOnlyGraphNode>,
      nodes: readonly Readonly<ReadOnlyGraphNode>[],
    ): HTMLElement => {
      const panel = element('section', 'ticket-parent', 'ticket-parent');
      const heading = element('h3');
      heading.textContent = 'Duplicates';

      const parentId = parentOf(node);
      const children = childrenOf(nodes, node.id);
      const standing = element(
        'p',
        'ticket-parent-standing',
        'ticket-parent-standing',
      );
      const closed = ticketState(node) === 'resolved';
      standing.textContent = parentId === null
        ? children.length === 0
          ? closed
            ? 'Nothing is attached to this one. Anything attached now closes '
              + 'straight away, with the same words to its reporter - which is '
              + 'what the late ones are.'
            : 'Nothing is attached to this one.'
          : `${String(children.length)} ticket(s) attached. They close when `
            + 'this one does, with the same words to their reporters.'
        : `Attached to ${ticketTitle(parentId)} (${parentId}). It closes when `
          + 'that one does.';

      // Itself is never one of its own duplicates, so it is filtered out here
      // rather than refused later: a player who ticked everything meant
      // everything else.
      const selected = [...picked].filter((id) => id !== node.id);
      const attach = osButton(
        selected.length === 0
          ? 'Attach the ticked ones to this'
          : `Attach ${String(selected.length)} ticked to this`,
        'ticket-link-parent',
        { primary: true },
      );
      // A CLOSED parent is still a parent, and the state of it is deliberately
      // not asked about here. Refusing one was the queue disagreeing with the
      // world: the engine takes the link and the cascade closes the child in
      // the same minute. It made both of this week's delayed floods unclosable
      // through the shipped UI for anybody who repaired the fault before the
      // last report arrived - Ada is fifteen minutes behind Thursday's parent,
      // Gary thirty-five, Terry the best part of an hour behind Wednesday's -
      // which is to say, for anybody working quickly.
      setAvailability(
        attach,
        selected.length === 0
          ? 'Tick the tickets on the left that are the same fault as this '
            + 'one. A duplicate is a report of the same outage, not another '
            + 'job you would rather not do.'
          : null,
      );
      attach.addEventListener('click', () => {
        let attached = 0;
        refusal = null;

        for (const child of selected) {
          const result = api.dispatch(
            HELPDESK_ACTIONS.ticketLinkToParent,
            api.actor,
            child,
            { parent: node.id, note: linkNote(ticketTitle(node.id), node.id) },
          );

          if (result.ok) {
            attached += 1;
            picked.delete(child);
          } else if (refusal === null) {
            // The first refusal is the one that gets the screen: forty
            // identical sentences would bury it.
            refusal = result.reason;
          }
        }

        linkOutcome = attached === 0
          ? null
          : `${String(attached)} ticket(s) attached to this one.`;
        render();
      });

      panel.append(
        heading,
        standing,
        attach,
        outcomeLine('ticket-parent-outcome', linkOutcome),
      );
      return panel;
    };

    const renderDetail = (
      node: ReadOnlyGraphNode | undefined,
      nodes: readonly ReadOnlyGraphNode[],
    ): void => {
      detail.replaceChildren();
      detailClocks = null;

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
      priorityBadge.dataset.vip = String(clocks.vip);
      priorityBadge.textContent = clocks.priority === null
        ? 'Untriaged (treated as P3)'
        : priorityCellLabel(clocks);
      priorityValue.append(priorityBadge);

      // And WHY, when the answer is not "what broke" (E8, 0.26.0). A row of its
      // own rather than a footnote on the priority, because it is a different
      // fact about the ticket - the same shape the customer's SLA tier gets
      // below - and because the player is entitled to read, in one line, that
      // this deadline was set by the caller's name and not by the fault.
      if (clocks.vip) {
        const vipValue = definitionRow(facts, 'VIP flag', 'ticket-detail-vip');
        vipValue.textContent = vipRowLine(
          node.fields[FIELDS.beneficiary],
          clocks.priority,
        );
      }

      // And the same question answered for the other two levers (E9, 0.37.0).
      // The VIP row above is this row's vip branch - it says the flag forced the
      // number and that nobody can unpick it - so `prioritySourceLine` returns
      // nothing there and this one is simply absent. What is left is the pair
      // the player can actually act on: a number the matrix produced, and a
      // number that is still the reporter's own opinion.
      const sourceLine = prioritySourceLine(prioritySourceOf(node));

      if (sourceLine !== null) {
        const sourceValue = definitionRow(
          facts,
          'Set by',
          'ticket-detail-priority-source',
        );
        sourceValue.textContent = sourceLine;
      }

      // RETAINED OWNERSHIP (E9, 0.36.0), where it can be read: this ticket has
      // been sent to second line and is still yours, and - the part worth a
      // sentence - the clock underneath it is still running. A chip on the row
      // would say the first half; only the pane can say the second, and the
      // second is the mechanic.
      if (typeof node.fields[FIELDS.retainedAt] === 'number'
        && node.fields[FIELDS.escalated] !== true) {
        const kept = definitionRow(facts, 'Ownership', 'ticket-detail-retained');
        kept.dataset.retained = 'true';
        kept.textContent = 'Sent to second line at '
          + `${formatSimTime(Number(node.fields[FIELDS.retainedAt])).time}, and `
          + 'still yours. The clock below has not stopped and will not: at this '
          + 'grade you keep it until they come back.';
      }

      // The customer's SLA tier (0.12.0), the thing the two clocks below are set
      // by. Only when there is one: an in-house ticket has no tier, so the row is
      // simply not there and the pane reads as it always did.
      if (clocks.tier !== null) {
        const tierValue = definitionRow(facts, 'SLA tier', 'ticket-detail-tier');
        const tierBadge = element('span', 'ticket-tier');
        tierBadge.dataset.tier = clocks.tier;
        tierBadge.textContent = SLA_TIER_LABELS[clocks.tier];
        tierValue.append(tierBadge);
      }

      // The countdown moves every minute and the deadline does not, so the
      // deadline gets an attribute of its own: a test that reads them out of
      // one sentence cannot tell "the clock is running" from "the clock has
      // been quietly bought back".
      const responseRow = definitionRow(
        facts,
        'Response SLA',
        'ticket-detail-response',
      );
      responseRow.textContent = responseLine(clocks);
      responseRow.dataset.due = formatSimTime(clocks.response.dueAt).time;

      // What the reporter has actually been told, under the clock that stops
      // when somebody touches it (0.42.0, W-04). It changes when the RECORD
      // changes rather than every minute, so it stays out of the two cells
      // below that the repaint is allowed to move.
      const answeredRow = definitionRow(
        facts,
        'Answered',
        'ticket-detail-answered',
      );
      answeredRow.textContent = answeredLine(node, clocks);
      answeredRow.dataset.answered = String(
        typeof node.fields[FIELDS.answeredAt] === 'number',
      );

      const resolutionRow = definitionRow(
        facts,
        'Resolution SLA',
        'ticket-detail-resolution',
      );
      resolutionRow.textContent = resolutionLine(clocks);
      resolutionRow.dataset.due = formatSimTime(clocks.resolution.dueAt).time;

      // The clock the external contract actually binds beside the ack (D4,
      // 0.37.0): a promised gap between customer-visible updates, and the
      // count of windows this ticket has already let pass. Deliberately no
      // live countdown - the row changes when the RECORD changes, so it stays
      // out of the per-minute repaint the two cells below are allowed.
      // The contract's priority, not the pane's: untriaged runs at the same
      // default the other two clocks already run at, so the row exists from
      // arrival - a promise that only appeared once the player triaged was
      // the loophole the third review round measured.
      const cadenceInterval = cadenceIntervalFor(
        clocks.tier,
        cadencePriorityOf(node),
      );

      if (cadenceInterval !== null) {
        const cadenceRow = definitionRow(
          facts,
          'Update cadence',
          'ticket-detail-cadence',
        );
        cadenceRow.dataset.missed = String(cadenceMissesOn(node));
        cadenceRow.dataset.due = formatSimTime(
          cadenceWindowClosesAt(node, cadenceInterval),
        ).time;
        cadenceRow.textContent = cadenceLine(node, cadenceInterval);
      }

      // The two cells the next minute is allowed to move on their own. Every
      // other thing on this pane is a fact about the world, and the world
      // announces itself.
      detailClocks = {
        id: node.id,
        response: responseRow,
        resolution: resolutionRow,
      };

      const body = element('p', 'ticket-body', 'ticket-detail-body');
      body.textContent = entry?.def.flavor.body
        ?? 'No description. The reporter is confident you know what they mean.';

      detail.append(heading, facts, body);

      // The deflection bot's pre-chew, when there is one (0.5.0 slice 3): a
      // read-only note that the obvious fix was already tried by the portal and
      // did not stick, which is why this weird thing survived to a human. No
      // control, no verb - it is context, the way the work notes are.
      const preChew = entry?.def.flavor.preChew;

      if (preChew !== undefined) {
        const note = element('div', 'ticket-prechew', 'ticket-detail-prechew');
        const label = element('h3', 'ticket-prechew-label');
        label.textContent = 'The portal got here first';
        const tried = element('p', 'ticket-prechew-tried', 'ticket-detail-prechew-tried');
        tried.textContent = `Bot tried: ${preChew.tried}`;
        const still = element('p', 'ticket-prechew-still', 'ticket-detail-prechew-still');
        still.textContent = `User says: ${preChew.stillBroken}`;
        note.append(label, tried, still);
        detail.append(note);
      }

      // Somebody else's filing, above the form that disagrees with it (E9,
      // 0.36.0). Above rather than below on purpose: the question this pane is
      // asking is "is this right", and the triage controls underneath are the
      // way to say no.
      if (isAuditTicket(api.graph, node.id)) {
        detail.append(renderAudit(node));
      }

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

      // The reporter's own reaction to how they were spoken to, when there is
      // one. Its own panel because it is its own field: it is the reporter
      // talking back, not a question the player asked, and it deliberately does
      // NOT count toward the CYA rule above - being rude never buys the right to
      // park the clock on somebody. Absent, and this panel simply is not there.
      const reactions = fieldLines(node.fields[FIELDS.reporterReaction]);

      if (reactions.length > 0) {
        detail.append(renderStream(
          'ticket-reactions',
          'How they took it',
          reactions,
          false,
          '',
        ));
      }

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

      // The article somebody LINKED beats the one the ticket was written
      // with: the second is where to start reading, the first is what was
      // actually used, and only one of them is evidence.
      // The fourth cross-app link, and the one the recurring faults live on:
      // what the reporter's machine wrote down about itself while nobody was
      // reading. It carries WHICH box, like the remote link does.
      const eventsButton = osButton('Read its event log', 'ticket-open-events');
      setAvailability(
        eventsButton,
        !api.hasApp('events')
          ? 'Event Viewer is not installed on this workstation yet.'
          : reporterMachine === undefined
            ? 'No workstation is signed out to this reporter, so there is no '
              + 'log to read. Pick the box yourself in Event Viewer.'
            : null,
      );
      eventsButton.addEventListener('click', () => {
        if (reporterMachine !== undefined) {
          api.openApp('events', {
            kind: 'remote-machine',
            id: reporterMachine.id,
          });
        }
      });

      const kbRef = linkedArticle(node) ?? entry?.def.kb_ref ?? '';
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
        eventsButton,
        kbButton,
      );
      detail.append(
        actions,
        renderArticleLink(node),
        renderParentPanel(node, nodes),
      );

      detail.append(
        refusalLine('ticket-refusal', refusal, createIcon('icon-lock')),
      );
    };

    const render = (): void => {
      const all = ticketNodes();
      // The split, and the ONE place it happens. Everything below reads
      // `nodes`, so the queue, the selection, the counters and the detail pane
      // cannot end up talking about different lists.
      const audits = all.filter((node) => isAuditTicket(api.graph, node.id));
      const mine = all.filter((node) => !isAuditTicket(api.graph, node.id));
      const second = audits.length > 0;

      // A tab strip that is not there at all where there is no second queue -
      // and the tab falls back with it, so a rung that never had one cannot be
      // left looking at an empty list by a stale bit of state.
      tabs.hidden = !second;

      if (!second) {
        tab = 'mine';
      }

      const nodes = tab === 'audit' ? audits : mine;
      selectedId = resolveSelection(nodes, selectedId).id;

      for (const [button, which] of [
        [mineTab, 'mine'],
        [auditTab, 'audit'],
      ] as const) {
        button.dataset.selected = String(tab === which);
        button.setAttribute('aria-pressed', String(tab === which));
      }

      mineTab.textContent = `My queue (${String(mine.length)})`;
      // Ruled or not, because that is the question the tab is asking: the count
      // that matters to a senior is how many filings are still waiting on a
      // signature, not how many tickets are on the board.
      auditTab.textContent = `QA audit (${String(
        audits.filter((node) => verdictOn(api.graph, node.id) === null).length,
      )})`;

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

      // The detail pane is still rebuilt whenever the world moves, so the
      // keyboard is put back where it was afterwards - the shared rule, which
      // also declines to restore focus to a control the repaint has just
      // disabled, because focusing one drops the cursor on the body anyway.
      withFocusRestored(root, () => {
        renderQueue(nodes);
        renderDetail(nodes.find((node) => node.id === selectedId), nodes);

        // The write-up prompt lives on the audit tab and nowhere else: it is
        // the second queue's own beat, and a banner about somebody else's
        // filings on top of your own list would be the window shouting across
        // itself.
        const banner = tab === 'audit' ? renderWriteUp() : null;

        if (banner !== null) {
          detail.prepend(banner);
        }
      });

      // The queue as it now stands, so the next world change can tell whether
      // it moved anything this window draws. Recorded on every paint, world- or
      // player-driven, so a rebuild the player's own click asked for resets the
      // baseline just as a world one does.
      // Off the WHOLE board rather than the shown tab: an item dealt onto the
      // other list is a world change this window draws (the tab counts move),
      // and a fingerprint that could not see it would leave the strip stale.
      painted = ticketQueueFingerprint(all, selectedId);
    };

    /**
     * A minute, and nothing else.
     *
     * The queue rows are told the new countdown - they are not rebuilt, and
     * the detail pane is not touched at all beyond its two clock cells. A tick
     * that repainted this window wholesale shut the triage dropdowns in the
     * player's hand once a second and threw away every row element in the
     * queue with them.
     */
    const paintClocks = (): void => {
      const nodes = ticketNodes();
      renderQueue(nodes);

      const cells = detailClocks;

      if (cells === null) {
        return;
      }

      const node = nodes.find((candidate) => candidate.id === cells.id);

      if (node === undefined) {
        return;
      }

      const clocks = clocksFor(api, node);
      setText(cells.response, responseLine(clocks));
      setFlag(cells.response, 'due', formatSimTime(clocks.response.dueAt).time);
      setText(cells.resolution, resolutionLine(clocks));
      setFlag(
        cells.resolution,
        'due',
        formatSimTime(clocks.resolution.dueAt).time,
      );
    };

    host.replaceChildren(root);
    render();

    const unsubscribeTick = api.clock.onTick(() => {
      paintClocks();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      // Only when the world moved something this window actually draws. The
      // pressure meters tick on the player node every few minutes - a stress
      // point for an unread Hubbub message, suspicion draining - and each is a
      // world change that leaves every ticket untouched. Rebuilding for one
      // threw the detail pane away under the player's cursor, unticking a
      // duplicate box they had ticked and shutting a triage dropdown they had
      // open. The fingerprint is the queue's own content, so such a change
      // matches the last paint and this returns without touching the DOM.
      if (ticketQueueFingerprint(ticketNodes(), selectedId) === painted) {
        return;
      }

      render();
    });

    return {
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        root.remove();
      },
      /**
       * "Open the queue AT this ticket", from whichever window sent us here -
       * the plan surface, for now (E10, 0.29.0).
       *
       * It selects and nothing else: an intent is a request to a VIEW, so a
       * ticket that is not in the queue leaves the selection where it was
       * rather than blanking the pane. `resolveSelection` on the next paint is
       * the backstop for a row that goes away underneath it.
       */
      receiveIntent: (intent): void => {
        if (intent.kind !== 'queue-ticket'
          || api.graph.getNode(intent.id)?.kind !== 'ticket') {
          return;
        }

        selectedId = intent.id;
        refusal = null;
        handoffOpen = false;
        render();
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
