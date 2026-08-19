/**
 * The MONTH-END CHANGE FREEZE (E9, 0.39.0): the days of the month at which a
 * customer's own calendar, rather than their contract, decides that non-urgent
 * change waits.
 *
 * It is the half of change management the 0.10.0 change request could not
 * teach. That module answers MAY this be done, and answers it out of the
 * contract: a helpdesk desk reaching for a server is gated, a watch-only
 * account is refused outright. This one answers WHEN, and the answer comes
 * from the customer's own year: a firm whose month ends in a ledger being
 * closed does not care that the work is authorised - while the close runs,
 * anything that could stop a fee earner recording time or a bookkeeper posting
 * a journal is held until the new month starts. Real practice, and the first
 * thing a new tech at an accountancy's provider is told.
 *
 * THREE RULES, and the third is the one that keeps this honest:
 *
 *  1. The freeze is DECLARED BY THE CUSTOMER, as world data on the customer
 *     node (`FIELDS.customerChangeFreeze`), read exactly the way the scope and
 *     the tier are read. It is not a property of the contract and not a
 *     property of the vertical - Fettle & Crane has two accountancies, and if
 *     one of them stopped closing on a calendar month the field would come off
 *     that node and nothing else would move.
 *  2. It DEFERS, it does not refuse. A request filed in the window is still
 *     filed and still approved - the paperwork is not the problem - and the
 *     window it books opens after the thaw. The player is not told no; the
 *     player is told the first.
 *  3. It NEVER UNLOCKS. Everything here runs downstream of the scope decision
 *     and only ever moves an approved window LATER. A monitoring-only account
 *     that declared a freeze would still have its request rejected, with no
 *     window at all, because the decision is reached before the calendar is
 *     asked. Composition in that order is the property the teeth test pins:
 *     scope decides what may happen, the freeze decides when.
 *
 * Everything is pure and deterministic, on the world's own calendar - the
 * anchor in `hours.ts` and the arc week the player is on - so the same save
 * reloads into the same month.
 *
 * WHAT IT REACHES, said plainly rather than implied. The freeze acts on the
 * CHANGE DESK: the window a filed request books. That is the whole of its
 * mechanical reach today, and it means the bite is uneven across the three
 * firms that declare one - a helpdesk contract reaching for a server files a
 * request and feels it; a fully-managed contract files none, because nothing
 * on that estate is out of reach for a request to be needed for, so there the
 * close is world data and a line on the record and nothing more. That is not a
 * hole in this module, it is the 0.8.0 scope model doing what it does; making
 * a close hold a fully-managed hand would be a NEW WALL in front of work the
 * contract allows, with a week's solvability hanging off it, and that is a
 * design decision rather than a wiring one. The surfaces below are worded to
 * claim only what the engine does.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { customerNode } from './customers';
import {
  type ChangeFreeze,
  changeFreezeOf,
  FIELDS,
  SERVICE_STATUS,
  STARTUP_TYPES,
  SYSTEMD_STATES,
  UNIT_ENABLEMENTS,
} from './fields';
import {
  arcCalendarDay,
  calendarDate,
  calendarParts,
  dayForTick,
  dayOpensTick,
} from './hours';

/**
 * How many days of a month the close holds the door shut for.
 *
 * THREE, and the number is from the practice rather than from the drama. A
 * month-end close is not a month-long event: the ledger is shut, the last
 * journals are posted and the reconciliations are run in the final few days,
 * and that is the stretch a finance-led firm asks its provider to leave alone
 * (the widely-quoted freeze is "the last few working days of the month and the
 * first of the new one" - three calendar days is the short, defensible end of
 * it). Longer would be a lie about how firms work and would swallow most of a
 * playable week; shorter would be a rule that almost never fires.
 *
 * It is counted in CALENDAR days, not working ones, because a calendar is what
 * a close is booked against - the thirtieth is the thirtieth whether or not
 * anybody is at a desk - and because the thaw has to be a date the world can
 * name: the first.
 */
export const FREEZE_DAYS = 3;

/**
 * The freeze a customer declares, or null when they declare none. Read
 * defensively off the node, like the scope and the tier beside it.
 */
export function changeFreezeOfCustomer(
  graph: ReadOnlyGraphView,
  customerId: string,
): ChangeFreeze | null {
  const node = customerNode(graph, customerId);
  return node === undefined
    ? null
    : changeFreezeOf(node.fields[FIELDS.customerChangeFreeze]);
}

/**
 * Which week of the career this is, read off the player node the way
 * `week-source.ts` reads it - and defaulting to the first week, which is what
 * every world that has never been promoted is on.
 *
 * The freeze needs it because the world's clock restarts every week: a tick
 * only knows it is on day two of SOME week, and whether that day is the
 * twenty-ninth of September or the eighth is a question only the arc can
 * answer. Off the graph rather than remembered, for the reason the week
 * request is off the graph: the graph is the half that survives a load.
 */
export function arcWeekOf(graph: ReadOnlyGraphView, actor: string): number {
  const value = graph.getField(actor, FIELDS.arcWeek);

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}

/** Where a customer's month-end stands at a given minute of a given week. */
export interface FreezeReading {
  /** Which freeze the customer declares. */
  readonly freeze: ChangeFreeze;
  /** Whether this minute is inside the window. */
  readonly frozen: boolean;
  /** The date the window ends on, as the estate writes dates: the first. */
  readonly thawDate: string;
  /** The tick the thaw day opens on - the earliest a deferred window may sit. */
  readonly thawTick: number;
  /** The date the window opened (or will open) on this month. */
  readonly freezeFrom: string;
}

/**
 * The month-end reading for a day of the career: whether it is inside the last
 * `FREEZE_DAYS` days of its month, and when the month turns.
 *
 * Pure arithmetic on the calendar day number, so it is right in February and
 * right in a thirty-one-day month without a table: the window is every day of
 * the month after `daysInMonth - FREEZE_DAYS`, and the thaw is the day after
 * the last one, which is always the first.
 */
function monthEndAt(calendarDay: number): {
  readonly frozen: boolean;
  readonly thawDay: number;
  readonly freezeFromDay: number;
} {
  const { dayOfMonth, daysInMonth } = calendarParts(calendarDay);
  const firstFrozen = daysInMonth - FREEZE_DAYS + 1;

  return {
    frozen: dayOfMonth >= firstFrozen,
    // The first of the next month, in the same day numbering: however many
    // days of this month are left, plus one.
    thawDay: calendarDay + (daysInMonth - dayOfMonth) + 1,
    freezeFromDay: calendarDay - (dayOfMonth - firstFrozen),
  };
}

/**
 * A customer's freeze at this minute of this week, or null when the customer
 * declares none - which is nearly all of them, and which is why every surface
 * below can ask without a condition and print nothing.
 */
export function freezeReading(
  graph: ReadOnlyGraphView,
  customerId: string | null,
  arcWeek: number,
  now: number,
): FreezeReading | null {
  const freeze = customerId === null
    ? null
    : changeFreezeOfCustomer(graph, customerId);

  if (freeze === null) {
    return null;
  }

  const today = arcCalendarDay(arcWeek, dayForTick(now));
  const { frozen, thawDay, freezeFromDay } = monthEndAt(today);
  // The day the thaw falls on, counted back into THIS week's clock. It may be
  // past the week's own five days, and that is an honest answer rather than a
  // bug: a change frozen on the last day the player is at the desk is a change
  // that does not happen this week, and the window it books says so.
  const thawSimDay = thawDay - arcCalendarDay(arcWeek, 1) + 1;

  return {
    freeze,
    frozen,
    thawDate: calendarDate(thawDay),
    thawTick: dayOpensTick(Math.max(1, thawSimDay)),
    freezeFrom: calendarDate(freezeFromDay),
  };
}

/* -- the emergency, read off the estate rather than declared --------------- */

/**
 * Whether the thing a change is aimed at is DOWN on the record - the freeze's
 * emergency class, and deliberately the same fact change control already runs
 * on (`change-control.ts`: "A DOWN service is the fire (0.17.0), fixed NOW and
 * never gated; only a LIVE one is a change under control").
 *
 * There is no emergency FLAG anywhere in this, and there must not be: a flag
 * would be a box the player could tick to walk through the freeze, and every
 * change would be an emergency by the second week. The world already writes
 * down whether a service is up, the monitoring board reads that same field,
 * and a ticket that downs a service writes it - so the fire and the freeze
 * cannot drift apart about what a fire is.
 *
 * DOWN is read in each manager's own vocabulary, and narrowly on purpose:
 *
 *  - a Windows service is down when it is WEDGED (running and not answering,
 *    which is the game's third status), or STOPPED when it was set to start
 *    itself. A stopped MANUAL service is not a fault - half the baseline is
 *    stopped and manual, which is exactly how a real box looks.
 *  - a unit is down when it has FAILED, or is inactive while ENABLED.
 *
 * Anything else - an account, a box, a path, a healthy service somebody wants
 * changed - is not an emergency, so it waits for the first. Narrow is the
 * fail-closed direction here: a class that is too wide is a freeze with a hole
 * in it.
 */
export function isEmergencyChange(
  graph: ReadOnlyGraphView,
  targetId: string,
): boolean {
  const node = graph.getNode(targetId);

  if (node === undefined) {
    return false;
  }

  if (node.kind === 'service') {
    return isServiceDown(node);
  }

  return node.kind === 'unit' && isUnitDown(node);
}

function isServiceDown(node: Readonly<ReadOnlyGraphNode>): boolean {
  const status = node.fields[FIELDS.status];

  if (status === SERVICE_STATUS.wedged) {
    return true;
  }

  const startup = node.fields[FIELDS.startupType];

  return status === SERVICE_STATUS.stopped
    && (startup === STARTUP_TYPES.automatic || startup === STARTUP_TYPES.delayed);
}

function isUnitDown(node: Readonly<ReadOnlyGraphNode>): boolean {
  const state = node.fields[FIELDS.unitState];

  return state === SYSTEMD_STATES.failed
    || (state === SYSTEMD_STATES.inactiveDead
      && node.fields[FIELDS.unitEnabled] === UNIT_ENABLEMENTS.enabled);
}

/* -- the deferral the change request applies ------------------------------- */

export interface FreezeDeferral {
  /** The earliest tick a deferred window may open on: the thaw day's open. */
  readonly from: number;
  /** The date the reply names, and the CR node carries. */
  readonly thawDate: string;
}

/**
 * The deferral a change request aimed at this target picks up, or null when
 * nothing defers it: no declared freeze, not inside the window, or the thing
 * is down and this is the fire rather than a change.
 *
 * The ONLY thing it can return is a later starting point for the window. There
 * is no arm of this that allows anything, which is the property that makes the
 * composition safe to reason about: whatever the caller does with a null is
 * what the game did before this module existed.
 */
export function freezeDeferral(
  graph: ReadOnlyGraphView,
  customerId: string | null,
  targetId: string,
  arcWeek: number,
  now: number,
): FreezeDeferral | null {
  const reading = freezeReading(graph, customerId, arcWeek, now);

  if (reading === null || !reading.frozen || isEmergencyChange(graph, targetId)) {
    return null;
  }

  return { from: reading.thawTick, thawDate: reading.thawDate };
}

/**
 * How a surface says the freeze out loud - the customer record's line, and the
 * one the change desk's reply borrows.
 *
 * Authored here rather than at each surface because there are three of them
 * and they are answering the same question; a second sentence written at a
 * screen is a second account of the rule.
 */
export function freezeRecordLines(
  reading: Readonly<FreezeReading>,
): readonly string[] {
  return reading.frozen
    ? [
      `Change freeze: MONTH-END, on now (since ${reading.freezeFrom}). They are `
        + 'closing the',
      `  ledger and expect nothing non-urgent until ${reading.thawDate}: a `
        + 'change request filed',
      '  here books its window after that. A service that is actually DOWN is '
        + 'not held -',
      '  that is the fire, and the fire has never waited for a calendar.',
    ]
    : [
      `Change freeze: month-end - the last ${String(FREEZE_DAYS)} days of each `
        + 'month, thawing',
      '  on the first. Not on today.',
    ];
}
