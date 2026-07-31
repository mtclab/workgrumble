/**
 * Two clocks per ticket, because that is how many a real one has.
 *
 * The RESPONSE clock asks how long the reporter sat there before anybody
 * touched their problem, and it stops the first time somebody does. The
 * RESOLUTION clock asks how long the problem lasted, and it is the one the
 * engine already keeps: a parked ticket has its deadline pushed out minute by
 * minute, which is exactly what "on hold pauses the SLA" means. Reading the
 * engine's own field rather than keeping a second copy beside it is what makes
 * "on hold pauses the resolution clock ONLY" true by construction instead of
 * true by two pieces of code agreeing.
 *
 * Everything here is derivation. Nothing writes; the actions do that.
 */

import type { ReadOnlyGraphNode } from '../engine-api';
import { FIELDS } from './fields';
import { isPriority, type Priority, targetsFor } from './priority';

export const HOLD_REASONS = ['awaiting_user', 'awaiting_vendor'] as const;

export type HoldReason = (typeof HOLD_REASONS)[number];

export function isHoldReason(value: unknown): value is HoldReason {
  return typeof value === 'string'
    && HOLD_REASONS.some((reason) => reason === value);
}

export const HOLD_REASON_LABELS: Readonly<Record<HoldReason, string>> = {
  awaiting_user: 'Awaiting the user',
  awaiting_vendor: 'Awaiting the field team',
};

export interface ClockState {
  /** The tick this clock runs out on. */
  readonly dueAt: number;
  /** When it stopped counting, or null while it is still running. */
  readonly stoppedAt: number | null;
  readonly running: boolean;
  readonly breached: boolean;
  /** Ticks left. Negative once it is overdue; frozen once it has stopped. */
  readonly remaining: number;
}

export interface TicketClocks {
  readonly priority: Priority | null;
  readonly response: ClockState;
  readonly resolution: ClockState;
  readonly onHold: boolean;
  /** Minutes the resolution clock has spent parked so far. */
  readonly heldTicks: number;
}

function numberField(
  node: Readonly<ReadOnlyGraphNode>,
  field: string,
): number | null {
  const value = node.fields[field];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function ticketPriority(
  node: Readonly<ReadOnlyGraphNode>,
): Priority | null {
  const value = node.fields[FIELDS.priority];
  return isPriority(value) ? value : null;
}

export function holdReasonOf(
  node: Readonly<ReadOnlyGraphNode>,
): HoldReason | null {
  const value = node.fields[FIELDS.holdReason];
  return isHoldReason(value) ? value : null;
}

/**
 * Whether this ticket is still somebody's problem.
 *
 * One predicate, read everywhere, because "unresolved" was being spelled three
 * different ways and a BREACHED ticket fell through all of them: the deadline
 * running out does not fix the printer, and a queue that stopped counting a
 * ticket the moment it went red is a queue that pays you to let it.
 */
export function isUnresolved(node: Readonly<ReadOnlyGraphNode>): boolean {
  return node.fields[FIELDS.state] !== 'resolved';
}

/**
 * Whether it is on your plate THIS minute - which is what the stress meter is
 * about. A parked ticket is unresolved and is still not work you can do, which
 * is half the reason parking one is a relief rather than a formality.
 */
export function isActiveWork(node: Readonly<ReadOnlyGraphNode>): boolean {
  return isUnresolved(node) && node.fields[FIELDS.state] !== 'waiting_on_user';
}

/** Minutes this ticket has spent parked, as the engine has been counting. */
export function heldTicksOf(node: Readonly<ReadOnlyGraphNode>): number {
  return Math.max(0, numberField(node, FIELDS.heldTicks) ?? 0);
}

/**
 * Both clocks for one ticket, as of `now`.
 *
 * Both targets come from the triage - and from `targetsFor(null)` until there
 * is one, which is what "untriaged is treated as P3" has to MEAN if the app is
 * going to print it. There is deliberately no fallback to the number the
 * ticket was written with: a second ladder beside the table is a ticket whose
 * two clocks disagree about which priority it is.
 */
export function ticketClocks(
  node: Readonly<ReadOnlyGraphNode>,
  now: number,
): TicketClocks {
  const priority = ticketPriority(node);
  const spawnedAt = numberField(node, FIELDS.spawnedAt) ?? 0;
  const deadline = numberField(node, FIELDS.slaDeadline) ?? spawnedAt;
  const respondedAt = numberField(node, FIELDS.respondedAt);
  const state = node.fields[FIELDS.state];
  const resolved = state === 'resolved';
  const onHold = state === 'waiting_on_user';

  const responseDueAt = spawnedAt + targetsFor(priority).response;
  const responseRunning = respondedAt === null && !resolved;
  // A ticket that was fixed before anybody logged a word to the reporter is
  // not a missed response - it is a problem that stopped existing. Saying so
  // beats inventing a timestamp nobody recorded.
  const responseBreached = respondedAt === null
    ? !resolved && now >= responseDueAt
    : respondedAt >= responseDueAt;

  return {
    priority,
    response: {
      dueAt: responseDueAt,
      stoppedAt: respondedAt,
      running: responseRunning,
      breached: responseBreached,
      remaining: responseDueAt - (respondedAt ?? (responseRunning ? now : responseDueAt)),
    },
    // The resolution deadline IS the engine's field: it moves out while the
    // ticket is parked, and the engine breaches against it.
    resolution: {
      dueAt: deadline,
      stoppedAt: null,
      running: !resolved && !onHold,
      breached: node.fields[FIELDS.breached] === true,
      remaining: deadline - now,
    },
    onHold,
    // The engine's own counter rather than a subtraction: a deadline minus a
    // target only tells you about the pause while nothing else has moved the
    // deadline, and re-cutting one at triage is exactly that.
    heldTicks: heldTicksOf(node),
  };
}

/**
 * Whether the response clock has anything left to stop.
 *
 * Read BEFORE a dispatch: a ticket somebody is about to touch for the first
 * time counts, and a ticket that was closed before anybody said a word to the
 * reporter does not get a response stamped on it a day later. The action that
 * writes the stamp is the one that allows the resolving case - it runs in the
 * same minute as the fix, which is when the touch actually happened.
 */
export function needsResponse(node: Readonly<ReadOnlyGraphNode>): boolean {
  return numberField(node, FIELDS.respondedAt) === null
    && node.fields[FIELDS.state] !== 'resolved';
}
