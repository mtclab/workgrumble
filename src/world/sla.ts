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

import { serviceDeadline, serviceMinutesBetween } from './day';
import type { ReadOnlyGraphNode } from '../engine-api';
import { FIELDS, type SlaTier, slaTierOf } from './fields';
import {
  isPriority,
  type Priority,
  type SlaTarget,
  tierTargetsFor,
} from './priority';
import { VIP_FORCED_PRIORITY } from './vip';

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
  /**
   * The customer SLA tier this ticket runs on (0.12.0), or null in-house. The
   * clock below is read off `target`, which is this tier crossed with the
   * priority - so the tier IS the clock, not a label beside it.
   */
  readonly tier: SlaTier | null;
  /**
   * Whether the priority above was FORCED by the caller's VIP flag (E8, 0.26.0)
   * rather than earned by what broke. The queue and the detail pane both say so
   * out loud: the injustice is only a mechanic if the player can see it.
   */
  readonly vip: boolean;
  /** The tier x priority targets the two clocks are measured against. */
  readonly target: SlaTarget;
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

/**
 * Minutes of DESK TIME between two ticks, negative once the second one is in
 * the past. Both clocks report what is left in the currency their targets are
 * written in, which is the only currency a player can act on.
 */
function signedServiceMinutes(from: number, to: number): number {
  return to >= from
    ? serviceMinutesBetween(from, to)
    : -serviceMinutesBetween(to, from);
}

/**
 * Whether the caller behind this ticket is flagged VIP (E8, 0.26.0).
 *
 * Stamped on the ticket at spawn, so this is a field lookup rather than a walk
 * back to the reporter - the same reason the tier is read off the ticket.
 */
export function isVipTicket(node: Readonly<ReadOnlyGraphNode>): boolean {
  return node.fields[FIELDS.vip] === true;
}

/**
 * The priority this ticket actually runs at.
 *
 * For everybody it is the cell the triage assigned, and nothing until there is
 * one. For a VIP caller it is `VIP_FORCED_PRIORITY`, full stop: the flag forces
 * the priority regardless of impact, from the minute the ticket arrives and
 * whatever anybody classifies it as afterwards. That is the mechanic, not a
 * display trick - this is the number both clocks are measured against, so the
 * forced priority IS the deadline the engine breaches on and the target the app
 * prints, which is what "the flag drives the clock" has to mean.
 */
function ticketPriority(
  node: Readonly<ReadOnlyGraphNode>,
): Priority | null {
  if (isVipTicket(node)) {
    return VIP_FORCED_PRIORITY;
  }

  const value = node.fields[FIELDS.priority];
  return isPriority(value) ? value : null;
}

/**
 * Which lever put the number on the ticket.
 *
 * Three answers, because there are three levers: the flag forced it, nobody has
 * triaged it and the only number on the screen is the reporter's own claim, or
 * the nine-cell matrix produced it from impact and urgency. The pane says which,
 * because a priority whose provenance is invisible is a number the player is
 * asked to argue with and given nothing to argue against.
 *
 * DERIVED, deliberately. Both facts it reads - the VIP stamp and the priority
 * field - are already on the node, put there by the spawn seam and the classify
 * verb. A fourth stored field would be a second answer to one question, and the
 * two would disagree the first time a triage was re-filed.
 *
 * THE CONTRACT TIER IS NOT ONE OF THESE, and it looks like it should be. A
 * customer's tier moves the CLOCK the number is measured against, not the number
 * itself: a Gold P3 and a Bronze P3 are both P3, and the pane's own tier row says
 * which ladder is running. Adding it here would be completing an enum by its
 * shape rather than by what the levers do.
 */
export type PrioritySource = 'impact' | 'vip' | 'self_declared';

export function prioritySourceOf(
  node: Readonly<ReadOnlyGraphNode>,
): PrioritySource {
  if (isVipTicket(node)) {
    return 'vip';
  }

  return isPriority(node.fields[FIELDS.priority]) ? 'impact' : 'self_declared';
}

/**
 * The tier stamped on the ticket at spawn (0.12.0), or null in-house.
 *
 * Read off the ticket's own field rather than re-walking the estate: the tier
 * was resolved once when the ticket arrived and written onto the node, so every
 * clock read since is a field lookup, not a graph walk.
 */
function ticketTier(
  node: Readonly<ReadOnlyGraphNode>,
): SlaTier | null {
  return slaTierOf(node.fields[FIELDS.customerSlaTier]);
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
  const tier = ticketTier(node);
  // The tier crossed with the severity IS the clock (0.12.0): a Gold ticket's
  // response target is tighter than a Bronze one's of the same priority, and a
  // tier-less in-house ticket reads the default ladder byte-for-byte.
  const target = tierTargetsFor(tier, priority);
  const spawnedAt = numberField(node, FIELDS.spawnedAt) ?? 0;
  const deadline = numberField(node, FIELDS.slaDeadline) ?? spawnedAt;
  const respondedAt = numberField(node, FIELDS.respondedAt);
  const state = node.fields[FIELDS.state];
  const resolved = state === 'resolved';
  const onHold = state === 'waiting_on_user';

  // Business hours, said once: a target is a number of minutes at the desk,
  // so the minute it runs out on is the minute the desk has been sat at that
  // long. A ticket inherited at 08:00 owes its first word by half past nine,
  // not by half past eight with the office still dark.
  const responseDueAt = serviceDeadline(spawnedAt, target.response);
  const responseRunning = respondedAt === null && !resolved;
  // A ticket that was fixed before anybody logged a word to the reporter is
  // not a missed response - it is a problem that stopped existing. Saying so
  // beats inventing a timestamp nobody recorded.
  const responseBreached = respondedAt === null
    ? !resolved && now >= responseDueAt
    : respondedAt >= responseDueAt;

  return {
    priority,
    tier,
    vip: isVipTicket(node),
    target,
    response: {
      dueAt: responseDueAt,
      stoppedAt: respondedAt,
      running: responseRunning,
      breached: responseBreached,
      // Counted in minutes at the desk, like the target it is measured
      // against: "four hours left" over a night nobody works is a promise the
      // clock cannot keep, and the number is what the app puts on a badge.
      remaining: signedServiceMinutes(
        respondedAt ?? (responseRunning ? now : responseDueAt),
        responseDueAt,
      ),
    },
    // The resolution deadline IS the engine's field: it moves out while the
    // ticket is parked, and the engine breaches against it.
    resolution: {
      dueAt: deadline,
      stoppedAt: null,
      running: !resolved && !onHold,
      breached: node.fields[FIELDS.breached] === true,
      // Already counted in minutes at the desk, by construction: the engine
      // moves this deadline one minute forward for every minute that does not
      // count - a pause, a night, the hour before the shift - so the plain
      // subtraction only falls when a minute somebody could have worked in
      // goes past. Converting it again would say "no time left" at 17:00 on a
      // ticket with half of tomorrow morning still on it.
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
