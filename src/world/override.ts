/**
 * The manager override / CYA arc's one piece of world logic (E8, 0.24.0): when
 * the audit finding on the privileged grant is due.
 *
 * Everything else about the override is content and reuse. The order is a ticket;
 * the risk-acceptance is a change_request node (the 0.10.0 artifact, reused as a
 * variant) the ticket seeds and the sign verb approves; the risky action is the
 * ordinary `accountAddToGroup` onto Domain Admins; and the win/fail is the
 * ticket's own resolution rule (the grant done AND a signed risk acceptance on
 * file). The one thing that is not content is the CONSEQUENCE's teeth: the grant
 * gets flagged whichever way it was made, and where the risk LANDS depends on
 * whether a signed risk acceptance named an accepting owner - which is the read
 * the day driver settles the fallout off.
 *
 * It is a pure read of the graph, the same shape as `recertFollowUpDue` and
 * `socialEngineeringDue`: it names the over-privileged account to charge the
 * finding against when the grant has been made AND the finding has not already
 * landed, and nothing otherwise. Because it reads Halcyon-specific nodes it
 * returns nothing in every other world, so the driver hook that calls it is inert
 * everywhere the override does not live - exactly as the recert follow-up is.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS } from './fields';

/** The manager's order against policy - the ticket the player meets it as. */
export const OVERRIDE_TICKET = 'ticket:halcyon-override';

/**
 * The risk-acceptance draft the order arrives with (E8, 0.24.0): a change_request
 * node, the 0.10.0 artifact reused as the `risk_acceptance` variant. Seeded
 * unsigned by the ticket; the sign verb records the ordering manager's approval
 * on it. Its id is a constant because four places name it - the ticket seeds it,
 * the sign verb's path targets it, the resolution rule reads it, and the fallout
 * verb reads its decision - so those four cannot drift about which node it is.
 */
export const OVERRIDE_RISK_ACCEPTANCE = 'changereq:halcyon-override-da';

/** The `incident_owner` marker for a grant made with no sign-off on file. */
export const UNAUTHORISED_OWNER = 'unauthorised';

/**
 * Whether the contractor has actually been made a Domain Admin: the grant the
 * order asked for, made real as a member_of edge. Either the professional path
 * (a signed risk acceptance first) or the silent one (the bare grant) leaves this
 * true; refusing outright leaves it false, which is why refusing raises no
 * finding - nothing was granted to flag.
 */
function grantMade(graph: ReadOnlyGraphView): boolean {
  if (graph.getNode(HALCYON_IDS.contractorAccount) === undefined) {
    return false;
  }

  return graph
    .neighbors(HALCYON_IDS.contractorAccount, {
      direction: 'out',
      edgeKind: 'member_of',
    })
    .some((group) => group.id === HALCYON_IDS.domainAdmins);
}

/**
 * The over-privileged account the audit finding is due against, or nothing.
 *
 * Due when the override ticket is in the world AND the contractor has been made a
 * Domain Admin AND the finding has not already landed. It does NOT wait on the
 * ticket resolving, because the silent-comply path never resolves it - the grant
 * itself is what a privileged-access audit flags, signed off or not - so the
 * finding lands on any grant and the SIGN-OFF decides only whose name is on it.
 */
export function overrideFalloutDue(
  graph: ReadOnlyGraphView,
): string | undefined {
  if (graph.getNode(OVERRIDE_TICKET) === undefined) {
    return undefined;
  }

  if (!grantMade(graph)) {
    return undefined;
  }

  const alreadyLanded = typeof graph.getField(
    HALCYON_IDS.contractorAccount,
    FIELDS.overrideFalloutAt,
  ) === 'number';

  return alreadyLanded ? undefined : HALCYON_IDS.contractorAccount;
}
