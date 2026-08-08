/**
 * The access recertification's one piece of world logic (E8, 0.23.0): the
 * consequence of a careless revoke.
 *
 * Everything else about the recert is content - the findings are account/group
 * state seeded by the ticket, and working the queue is the ordinary revoke and
 * disable verbs. The one thing that is not content is the wrong-revoke bite: the
 * service account is over-privileged (Domain Admins it does not need) BUT
 * load-bearing (a scheduled job runs as it, through Backup Operators), so the
 * right move is to RIGHT-SIZE it and the wrong one is to kill it. Killing it -
 * disabling the account, or taking it out of the group its job needs - breaks a
 * real scheduled job, and this is the read the day driver settles a follow-up
 * ticket off.
 *
 * It is a pure read of the graph, the same shape as `socialEngineeringDue`: it
 * names the follow-up to raise when the review has been worked AND the service
 * account has been left broken AND the follow-up has not already been raised, and
 * nothing otherwise. Because it reads Halcyon-specific nodes, it returns nothing
 * in every other world - the recert ticket is not there to be resolved - so the
 * driver hook that calls it is inert everywhere the review does not live, exactly
 * as the summoned boss-phone ticket is inert away from the probation shop.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS } from './fields';

/** The Q3 access recertification itself - the queue the player works. */
export const RECERT_TICKET = 'ticket:halcyon-recert';

/**
 * The broken scheduled job the careless kill raises. Summoned, not scheduled and
 * not `follows`: it turns up only when the service account has actually been
 * killed, which is a state the day driver reads rather than a slot in any week.
 */
export const RECERT_FOLLOWUP = 'ticket:halcyon-recert-followup';

/**
 * Whether the service account has been KILLED rather than right-sized: switched
 * off, or taken out of the Backup Operators group its scheduled job needs. Either
 * one breaks the job; right-sizing (out of Domain Admins, kept in Backup
 * Operators, still enabled) is neither.
 */
function serviceAccountKilled(graph: ReadOnlyGraphView): boolean {
  if (graph.getNode(HALCYON_IDS.svcBackupAccount) === undefined) {
    return false;
  }

  const enabled = graph.getField(HALCYON_IDS.svcBackupAccount, FIELDS.enabled)
    === true;
  const inJobGroup = graph
    .neighbors(HALCYON_IDS.svcBackupAccount, {
      direction: 'out',
      edgeKind: 'member_of',
    })
    .some((group) => group.id === HALCYON_IDS.backupOperators);

  return !enabled || !inJobGroup;
}

/**
 * The follow-up ticket to raise, or nothing.
 *
 * Due when the recertification has been worked to a close AND the service account
 * was killed doing it AND the broken-job ticket has not already been raised. The
 * recert-resolved gate is what makes honest correction free: disable the account
 * by mistake, notice, re-enable it, and finish the review - the account is whole
 * at the close, so nothing fires. The cost is only ever a careless revoke left
 * standing.
 */
export function recertFollowUpDue(
  graph: ReadOnlyGraphView,
): string | undefined {
  if (graph.getNode(RECERT_TICKET) === undefined) {
    return undefined;
  }

  if (graph.getField(RECERT_TICKET, FIELDS.state) !== 'resolved') {
    return undefined;
  }

  if (graph.getNode(RECERT_FOLLOWUP) !== undefined) {
    return undefined;
  }

  return serviceAccountKilled(graph) ? RECERT_FOLLOWUP : undefined;
}
