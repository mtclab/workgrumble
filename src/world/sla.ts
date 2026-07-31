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

export function ticketPriority(
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
 * Both clocks for one ticket, as of `now`.
 *
 * `slaTicks` is what the ticket was written with - the deadline it spawned on
 * before anybody triaged it - and it is only used to work out how much of the
 * engine's current deadline is time the ticket spent parked.
 */
export function ticketClocks(
  node: Readonly<ReadOnlyGraphNode>,
  now: number,
  slaTicks: number,
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

  // The resolution deadline IS the engine's field: it moves out while the
  // ticket is parked, and the engine breaches against it.
  const resolutionTarget = priority === null
    ? slaTicks
    : targetsFor(priority).resolution;

  return {
    priority,
    response: {
      dueAt: responseDueAt,
      stoppedAt: respondedAt,
      running: responseRunning,
      breached: responseBreached,
      remaining: responseDueAt - (respondedAt ?? (responseRunning ? now : responseDueAt)),
    },
    resolution: {
      dueAt: deadline,
      stoppedAt: null,
      running: !resolved && !onHold,
      breached: node.fields[FIELDS.breached] === true,
      remaining: deadline - now,
    },
    onHold,
    heldTicks: Math.max(0, deadline - spawnedAt - resolutionTarget),
  };
}

/**
 * Whether the response clock has anything left to stop. Reading it in one
 * place keeps the driver's sweep and the app's badge agreeing about when a
 * ticket counts as touched.
 */
export function needsResponse(node: Readonly<ReadOnlyGraphNode>): boolean {
  return numberField(node, FIELDS.respondedAt) === null
    && node.fields[FIELDS.state] !== 'resolved';
}
