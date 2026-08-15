/**
 * The co-managed RACI's soft wall (E9, 0.37.0): the reads behind a refusal that
 * is not a refusal.
 *
 * The scope engine's three shipped walls all say NO at the moment of the act -
 * a monitoring-only account, a helpdesk contract reaching for a server, a
 * co-managed estate nobody has been told about. This is the fourth kind, and
 * the research is exact about why it is different: at a co-managed customer the
 * RACI map hands whole functions to the customer's OWN IT - application
 * ownership, the custom systems, on-site work - and the MSP holds an admin
 * account that can reach those boxes anyway. So the command SUCCEEDS. Nothing
 * technical is in the way, because in life nothing technical is in the way. The
 * consequence is a peer sysadmin reading his own monitoring the next morning
 * and asking who was on his box, which is a different thing from a permission
 * and arrives on a different day.
 *
 * Two pure reads carry it, in the shape every delayed consequence in this
 * codebase keeps (`overrideFalloutDue`, `selinuxAuditDue`, `screamTestDue`):
 *
 *  - `raciViolationDue` is asked by the TERMINAL, at the seam where a mutating
 *    verb has just succeeded: was that box theirs, and did anybody tell them?
 *  - `raciComplaintDue` is asked by the DAY DRIVER at the next start of shift:
 *    which boxes were touched unannounced yesterday and have not been answered
 *    for yet.
 *
 * Both are functions of the graph and the tick and nothing else - no clock read,
 * no RNG - so a save and a replay land on the same complaint in the same minute.
 * Both return nothing in every world with no co-managed RACI in it, which is
 * every world but the MSP's, so the hooks that call them are inert elsewhere
 * exactly as the override finding is away from the corporate floor.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { changeRequestAuthorises } from './change-request';
import { coordinationCovers } from './coordination';
import {
  customerIdOfMachine,
  raciOwnerOfMachine,
  scopeOfCustomer,
} from './customers';
import { FIELDS, RACI_OWNERS, SERVICE_SCOPES } from './fields';
import { dayForTick } from './hours';

/**
 * Whether this box is one the customer's own IT owns under the map: a
 * co-managed contract AND a `raci_owner` of `internal` on the box itself.
 *
 * Both halves, because either alone is a different world. A co-managed box with
 * no entry in the map is the shipped 0.8.0 notify-first refusal; an `internal`
 * marker at a fully-managed customer would be a RACI on a contract that has no
 * second IT team in it, which is a thing content should not be able to say by
 * accident - so it is read as nothing here rather than honoured.
 */
export function isInternallyOwned(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
): boolean {
  const customerId = customerIdOfMachine(machine);

  return customerId !== null
    && scopeOfCustomer(graph, customerId) === SERVICE_SCOPES.coManaged
    && raciOwnerOfMachine(machine) === RACI_OWNERS.internal;
}

/**
 * Whether their IT has been told about this box RECENTLY ENOUGH for this touch
 * (0.37.1) - the freshness the RACI read applies to a coordination notice, and
 * the reason it is here rather than in `isCoordinated`.
 *
 * `isCoordinated` asks whether a notice for this target exists at all, which is
 * the right question for the SCOPE PRE-FLIGHT: there the notice is a permission
 * being consulted before a refusal, and a permission does not evaporate. Here
 * it is a courtesy, and a courtesy has a shelf life. Without one, the first
 * `notify` a player ever typed on a box bought permanent silence on it: every
 * unannounced touch of that server for the rest of the run read as coordinated,
 * no trail was written, the peer never wrote, and the documented second
 * complaint was unreachable for anybody who had ever done the right thing once.
 *
 * The cut is the honest one and it is the day: a heads-up covers the day it was
 * given. That is what the heads-up SAYS - somebody is on your box this
 * evening - and it is what their sysadmin would take it to mean when he reads
 * his graphs tomorrow and finds a change he was told about last Tuesday. The
 * second clause is the same rule read against the box's own history: a notice
 * older than the last unannounced touch on it cannot be the word about this
 * one.
 *
 * Scoped deliberately to this read. Nothing about the pre-flight moves, so a
 * co-managed target the map says nothing about still refuses and still clears
 * on a notice of any age - that wall is about contract scope rather than about
 * whether a colleague was told this morning.
 */
function coordinatedForNow(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
  targetId: string,
  now: number,
): boolean {
  const violated = machine.fields[FIELDS.raciViolatedAt];
  const today = dayForTick(now);

  return graph.nodesOfKind('coordination').some((node) => {
    const filed = node.fields[FIELDS.coordNotifiedAt];

    if (!coordinationCovers(node, targetId) || typeof filed !== 'number') {
      return false;
    }

    return dayForTick(filed) === today
      && (typeof violated !== 'number' || filed > violated);
  });
}

/**
 * The `verb@tick` line a violation goes onto the trail as.
 *
 * Built by the CALLER in the minute the action was dispatched and appended by
 * the world, the same contract `software.install` and the break-glass trail
 * keep, so a replay of the log writes the identical string rather than
 * rebuilding it against a clock nobody saved.
 */
export function raciViolationLine(verb: string, tick: number): string {
  return `${verb}@${String(tick)}`;
}

/**
 * Whether a remediation that has just succeeded was a RACI violation: their
 * box, and nobody told them.
 *
 * "Told them" is either of the two things that count as telling them, and it
 * has to be both or the mechanic punishes the honest player. A COORDINATION
 * NOTICE for this exact target, given today, is the heads-up (`notify
 * <target>`) - see `coordinatedForNow` for why the day is on it. An
 * APPROVED, IN-WINDOW CHANGE REQUEST for this exact (target, verb) is the same
 * heads-up with their sysadmin's signature on it - heavier, slower, and if
 * anything more correct - so a desk that went through the change process and
 * still got complained at would be a desk being taught that paperwork is worth
 * nothing.
 *
 * The machine is handed in rather than walked to from the target id: the caller
 * has already resolved the box behind a service, unit or device target to run
 * the scope pre-flight, and a second walk here would be a second answer to a
 * question that has to have one.
 */
export function raciViolationDue(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
  targetId: string,
  verb: string,
  now: number,
): boolean {
  if (!isInternallyOwned(graph, machine)) {
    return false;
  }

  if (coordinatedForNow(graph, machine, targetId, now)) {
    return false;
  }

  return !graph
    .nodesOfKind('change_request')
    .some((node) => changeRequestAuthorises(node, targetId, verb, now));
}

/**
 * The boxes their own IT is owed a word about this morning.
 *
 * Due when the box was touched unannounced (`raci_violated_at` holds the minute
 * of the LATEST such touch), a night has gone by since - the complaint is a
 * morning thing, read off somebody else's overnight monitoring, and one that
 * arrived the same afternoon would be a colleague standing behind you rather
 * than a consequence - and nobody has complained about that touch yet.
 *
 * "Yet" is a comparison rather than a latch, and that is what makes a SECOND
 * violation land a SECOND complaint: the last complaint is stamped with the
 * minute it landed, so a box touched again after it has a stamp the complaint
 * does not cover, and a box left alone since has nothing owing. A one-shot
 * latch here would have made every violation after the first one free, which is
 * the opposite of the lesson.
 */
export function raciComplaintDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  const today = dayForTick(now);

  return graph.nodesOfKind('machine').flatMap((machine) => {
    const violated = machine.fields[FIELDS.raciViolatedAt];

    if (!isInternallyOwned(graph, machine)
      || typeof violated !== 'number'
      || dayForTick(violated) >= today) {
      return [];
    }

    const complained = machine.fields[FIELDS.raciComplainedAt];

    return typeof complained === 'number' && complained >= violated
      ? []
      : [machine.id];
  });
}

/**
 * The person whose box it is - the peer the complaint comes from, read off the
 * `owns` edge the estate already carries.
 *
 * No new field for it: a machine somebody owns is already an edge in this
 * graph, and their internal sysadmin owning the box he is responsible for under
 * the RACI is the same sentence twice if it is also written on the node. Null
 * when nobody owns it, which is why the notice never invents a name.
 */
export function raciPeerOf(
  graph: ReadOnlyGraphView,
  machineId: string,
): Readonly<ReadOnlyGraphNode> | null {
  return graph
    .neighbors(machineId, { direction: 'in', edgeKind: 'owns' })
    .find((node) => node.kind === 'person') ?? null;
}
