/**
 * The VIP tier (E8, 0.26.0) - the queue-jump, and the org-dysfunction epic's
 * quietest injustice.
 *
 * The mechanic is one line of real product behaviour: if the caller's VIP
 * checkbox is true, the ticket's priority is FORCED, whatever actually broke.
 * It is not an override anybody types and it is not a bug - it is a shipped
 * feature of every enterprise service desk, and the reason a chief executive's
 * earbuds and a team locked out of the ledger arrive on the same deadline.
 *
 * Three things are here and nothing else:
 *
 *  - WHO is flagged. The flag is a field on the PERSON (`FIELDS.vip`), seeded by
 *    the estate, so the list is data rather than a rule in code. `spawnWorldTicket`
 *    reads it off the ticket's reporter and stamps it on the ticket at spawn, the
 *    way 0.12.0 stamps a customer's tier, and everything downstream - the clock,
 *    the badge, the classify verb, the fallout below - reads that one fact.
 *
 *  - WHAT it forces. `VIP_FORCED_PRIORITY` is the priority a flagged caller's
 *    ticket runs at whatever its impact is. It is P2 rather than P1 for the same
 *    reason the real default is: the flag is not meant to look like an outage, it
 *    is meant to put the exec near the top and leave the desk to argue with the
 *    table rather than with the exec.
 *
 *  - WHAT THE WAIT COSTS. The collision (slice 2) is two tickets in one minute,
 *    both legitimately closeable, one forced P2 by the flag and one P2 by honest
 *    impact, and one desk. Whichever is left waiting long enough to breach its
 *    clock pays, and the two costs are different things: the exec goes over your
 *    head (suspicion - somebody senior is now looking at you) and the blocked team
 *    misses the payment run (reputation - the floor watched the desk pair earbuds).
 *    `queueJumpFalloutDue` is the pure read the day loop settles that off, the same
 *    shape as `overrideFalloutDue` and `recertFollowUpDue`, and it names Halcyon
 *    nodes only - so it is inert in every other world.
 *
 * Everything here is a pure read of the graph. Nothing writes; the actions do.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { FIELDS } from './fields';
import type { Priority } from './priority';

/**
 * The priority a VIP caller's ticket is forced to, whatever the impact is.
 *
 * P2 is the real default (the ServiceNow VIP business rule sets priority 2 with
 * impact and urgency high) and it is the interesting number: P1 would read as an
 * outage and be argued with, where P2 is plausible enough that nobody ever does.
 */
export const VIP_FORCED_PRIORITY: Priority = 2;

/* -- the collision (slice 2) ---------------------------------------------- */

/**
 * The trivial VIP request: the chief executive's earbuds will not pair. One
 * device, one person, no impact worth the name - and P2 because of who is asking.
 */
export const VIP_EARBUDS_TICKET = 'ticket:halcyon-ceo-earbuds';

/**
 * The real problem, from an ordinary user: the finance team cannot get into the
 * ledger and the payment run is blocked. P2 because of what broke.
 */
export const VIP_LEDGER_TICKET = 'ticket:halcyon-finance-ledger';

/** The shadow-IT tail (slice 3): the exec's unmanaged tablet with company mail. */
export const VIP_TABLET_TICKET = 'ticket:halcyon-ceo-tablet';

/** The documented exception the unmanaged device is closed with. */
export const VIP_DEVICE_EXCEPTION = 'changereq:halcyon-unmanaged-tablet';

/**
 * The two tickets that arrive in the same minute and cannot both be first.
 *
 * A pair rather than a list, and named here rather than in the content file,
 * because three things have to agree about which two they are: the week that
 * deals them together, the fallout that charges whichever waited, and the test
 * that drives both orders.
 */
export const COLLISION_TICKETS: readonly string[] = Object.freeze([
  VIP_EARBUDS_TICKET,
  VIP_LEDGER_TICKET,
]);

/** Whether this person is on the VIP list - the checkbox, read off the estate. */
export function isVipPerson(
  graph: ReadOnlyGraphView,
  personId: string,
): boolean {
  return graph.getField(personId, FIELDS.vip) === true;
}

/**
 * The priority a ticket from this reporter is forced to, or nothing.
 *
 * The one place the flag becomes a number. `spawnWorldTicket` asks it at spawn to
 * decide the ticket's stamped flag and its resolution budget; nothing else needs
 * to, because from then on the fact is on the ticket.
 */
export function vipForcedPriority(
  graph: ReadOnlyGraphView,
  reporterId: string,
): Priority | null {
  return isVipPerson(graph, reporterId) ? VIP_FORCED_PRIORITY : null;
}

/**
 * The collision tickets whose wait has come due - breached, and not yet charged.
 *
 * Due on the BREACH rather than on the other one closing, because that is what
 * waiting actually costs: a ticket somebody got to in time costs nothing, and a
 * clock that ran out did so while the desk was demonstrably working the other
 * one. Both are returned when both were ignored - ignoring the pair costs both,
 * which is the honest arithmetic and not a third option.
 *
 * It reads Halcyon-only nodes, so it returns nothing in every other world.
 */
export function queueJumpFalloutDue(
  graph: ReadOnlyGraphView,
): readonly string[] {
  return COLLISION_TICKETS.filter((id) => {
    if (graph.getNode(id) === undefined) {
      return false;
    }

    if (graph.getField(id, FIELDS.breached) !== true) {
      return false;
    }

    return typeof graph.getField(id, FIELDS.queueJumpFalloutAt) !== 'number';
  });
}
