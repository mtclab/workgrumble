/**
 * The one remediation seam, shared by every surface that can change the estate.
 *
 * The customer mechanics - the wrong-tenant STOP (0.8.0), the three scope walls
 * (0.8.0-0.11.0) and the co-managed RACI's soft wall (0.37.0) - were written at
 * the TERMINAL's dispatch chokepoint and lived there, which quietly meant they
 * were a property of the terminal rather than of the game. Remote Assist sent
 * the same verbs at the same boxes through its own `api.dispatch` call and met
 * none of them: restarting a service on a customer's internal box from the
 * remote window resolved the ticket with no refusal, no trail and no morning
 * complaint, and the same click on a monitoring-only estate was simply allowed.
 * Every wall the world teaches was one window away from not existing.
 *
 * So the decision moved here, out of any one app, and the apps became callers.
 * A window that dispatches a remediation calls `dispatchRemediation` and gets
 * the walls; a window that calls `api.dispatch` directly for a remediation is
 * the bug, and there is now exactly one place to look for it. That is the whole
 * point of a seam: the next app to grow a Restart button cannot re-open this by
 * being written normally, because the normal way through is this function.
 *
 * The order inside it is the order the terminal shipped, because it is the
 * order the refusals have to come in: are you even in the right customer, then
 * does the contract cover this, then - only after the act has landed - was that
 * box theirs and did anybody tell them.
 */

import type { ReadOnlyGraphNode } from '../../engine-api';
import { RACI_LINE_PARAM, WORLD_ACTIONS } from '../../world/actions';
import { changeRequestConsult } from '../../world/change-request';
import { isCoordinated } from '../../world/coordination';
import {
  customerIdOfAccount,
  customerIdOfMachine,
  customerIdOfShare,
  machineForTarget,
  raciOwnerOfMachine,
  scopeOfCustomer,
  scopeVerdict,
  wrongCustomerLines,
} from '../../world/customers';
import { FIELDS, type MachineRole, machineRoleOf, type RaciOwner } from '../../world/fields';
import { raciViolationDue, raciViolationLine } from '../../world/raci';
import type { GameApi } from './types';
import { textValue } from './ui';

/**
 * What a remediation did, in the three shapes a caller has to tell apart.
 *
 * `refused` is the seam's own word - a tenant or contract refusal, several true
 * sentences, and nothing happened. `failed` is the WORLD's word, the engine's
 * own reason for not doing it. `done` is a thing that happened, already stamped
 * if it needed stamping. A terminal prints the first two the same way; a window
 * with a refusal strip and an outcome strip does not, which is why they are
 * separate rather than one bag of lines.
 */
export type RemediationResult =
  | { readonly kind: 'refused'; readonly lines: readonly string[] }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'done' };

/**
 * WHICH wall said no, alongside the sentences it said it in.
 *
 * The seam refuses for two different reasons and a caller can genuinely need to
 * tell them apart. `tenant` is the wrong-customer STOP: you are in somebody
 * else's estate, and nothing about this action is the subject. `contract` is
 * everything the contract itself decides - the monitoring-only wall, the
 * helpdesk server tier, co-managed coordination, and the change-request consult
 * that either names the path or reports where a filed request has got to.
 *
 * It exists because the unix terminal has a paragraph of its own to add to a
 * CONTRACT refusal ("ssh reaches the box at the engineer tier, but ...") and
 * none to add to a tenant STOP, and it had that paragraph because it ran its
 * own guards. Routing it through the seam without this would have meant either
 * losing the dialect or reading it back out of the sentences, and a caller
 * matching on the seam's prose would be the seam's prose becoming an API.
 *
 * The third wall, `unresolved`, is neither of those and has to be told apart
 * from both: the target could not be placed on a box at all, so no contract
 * was ever consulted and a dialect that bolted its own "the contract still
 * governs" paragraph onto it would be explaining a rule that never fired.
 */
export interface RemediationRefusal {
  readonly wall: 'tenant' | 'contract' | 'unresolved';
  readonly lines: readonly string[];
}

/**
 * The name a refusal calls a target by - its hostname, the name on it, or the
 * username, whichever the node has, and its id when it has none.
 *
 * Shared with the terminal rather than reinvented per window: the sentence
 * "PENN-SRV-01 belongs to Pennington" has to name the box the same way whoever
 * is reading it, and two helpers would eventually disagree about a node with a
 * name and no hostname.
 */
export function labelOf(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(
    node.fields[FIELDS.hostname]
      ?? node.fields[FIELDS.name]
      ?? node.fields[FIELDS.username],
    node.id,
  );
}

/**
 * The MACHINE an action's target sits on, for the customer guards.
 *
 * The walk itself lives in `world/customers.ts` as of the 0.38.0 verifier
 * round, because coordination was carrying a private copy of it that had gone
 * a version stale. This is the seam's view of it: the same answer, taken off
 * the api's graph.
 */
function machineOf(
  api: GameApi,
  targetId: string,
): Readonly<ReadOnlyGraphNode> | null {
  return machineForTarget(api.graph, targetId);
}

/**
 * What the seam says about a drive node it cannot place on a box.
 *
 * FAIL CLOSED (0.38.0 verifier round). A file or directory whose contains
 * chain reaches no machine used to resolve to null, and null meant "in-house,
 * no contract to be out of" - so the one shape the walk cannot read was the
 * one shape with no wall in front of it, which is the hole the drive arm was
 * added to close said backwards. A wall that opens when it cannot see is not a
 * wall. It refuses in the seam's own register: what it could not establish,
 * and what to do instead.
 */
const UNPLACED_TARGET_LINES: readonly string[] = Object.freeze([
  'Refused: nothing on this estate says which box that lives on.',
  'A change is authorised against a MACHINE - whose it is, what the contract',
  'covers on it, who else runs it - and none of those questions has an answer',
  'here. Escalate it with the path; a write nobody can place is the one that',
  'turns up in somebody else\'s morning.',
]);

/**
 * The one scope + tenant decision, on a RESOLVED customer id (0.8.0). Both the
 * machine path and the account path feed it a customer id, a role and a label,
 * and it runs, in order:
 *
 *  - the wrong-customer guard first (you are in the wrong tenant entirely - the
 *    STOP that names both), then
 *  - the scope-of-touch RBAC-403 (the contract does not cover this action).
 *
 * A `null` role is a non-machine target (an account): user-and-identity work is
 * helpdesk work, so a helpdesk contract allows it and only the SERVER tier is
 * refused. Null return means clear to dispatch - the in-house case for every
 * target that carries no customer, so probation and Bodgeworth are untouched.
 * There is ONE guard, shared, not one per target kind.
 */
function customerScopeGuard(
  api: GameApi,
  customerId: string | null,
  role: MachineRole | null,
  raci: RaciOwner | null,
  label: string,
  targetId: string,
  verb: string,
): RemediationRefusal | null {
  const current = api.appState.getCustomerContext();
  const wrongCustomer = wrongCustomerLines(api.graph, customerId, label, current);

  if (wrongCustomer !== null) {
    return { wall: 'tenant', lines: wrongCustomer };
  }

  // An in-house target has no contract to be out of.
  if (customerId === null) {
    return null;
  }

  const verdict = scopeVerdict(scopeOfCustomer(api.graph, customerId), role, raci);

  if (verdict === 'allowed') {
    return null;
  }

  // The RACI soft wall (E9, 0.37.0), and the one branch of this guard that
  // refuses nothing. A box the customer's own IT owns is a box the MSP's
  // credentials reach anyway, so the seam does not pretend otherwise: the
  // action goes through, and `dispatchRemediation` writes down that it went
  // through unannounced. Turning this into a refusal would be a lock the estate
  // does not have; leaving the consequence out would be a wall nobody meets.
  if (verdict === 'raci_internal') {
    return null;
  }

  // The co-managed coordinate-then-act seam (0.11.0): a coordination notice for
  // this target - the heads-up to the customer's OWN IT - clears the action,
  // before the change-request consult is even asked. It is the middle weight
  // between a helpdesk wall (never) and a fully-managed free hand (always):
  // notify, then act. The `isCoordinated` clause is the fail-closed gate - drop
  // it and a co-managed action would pass with no notice at all, which is the
  // unilateral hazard the tier exists to catch, and exactly what the teeth test
  // proves goes red on revert.
  if (verdict === 'co_managed' && isCoordinated(api.graph, targetId)) {
    return null;
  }

  // The heart of 0.10.0: before it refuses an out-of-scope action, the scope
  // engine consults approvals. An APPROVED change request covering this exact
  // (target, verb) and inside its window lets the action through; otherwise the
  // refusal names the path (file one) rather than dead-ending - except for
  // monitoring-only, which stays notify-and-escalate and never offers a CR.
  const consult = changeRequestConsult({
    graph: api.graph,
    now: api.clock.now(),
    targetId,
    verb,
    verdict,
  });

  return consult.allowed ? null : { wall: 'contract', lines: consult.lines };
}

/**
 * The customer pre-flight run before any mutating action is sent (0.8.0). It
 * resolves the target's customer - the box behind a machine, service, unit or
 * device target, or the customer an ACCOUNT target belongs to directly - and
 * runs the shared scope + tenant guard.
 *
 * Account-targeted verbs (unlock, resetpw, and the rest) resolve to no machine,
 * so they used to slip the guard entirely - a monitoring-only customer's user
 * could be reset in silent breach of the contract. Reading the account's own
 * customer here closes that hole: the mechanic has no bypass, whatever the verb
 * aims at. It is the generalisation of the 0.7.0 honesty engine from OS to
 * CONTRACT and TENANT, at the seam every mutating verb funnels through.
 *
 * Exported because a window can want the refusal WITHOUT the dispatch - to grey
 * a button out, or to say why before the click - but a caller that uses it that
 * way still dispatches through `dispatchRemediation`, which asks again. The
 * pre-flight is the gate; this is a view of it.
 */
export function remediationRefusal(
  api: GameApi,
  targetId: string,
  verb: string,
): RemediationRefusal | null {
  const machine = machineOf(api, targetId);

  if (machine !== null) {
    return customerScopeGuard(
      api,
      customerIdOfMachine(machine),
      machineRoleOf(machine.fields[FIELDS.machineRole]),
      raciOwnerOfMachine(machine),
      labelOf(machine),
      targetId,
      verb,
    );
  }

  const node = api.graph.getNode(targetId);

  if (node?.kind === 'account') {
    // An account is user-and-identity work - a null role, never a server - so a
    // helpdesk contract covers it, a monitoring-only one refuses it, and the
    // wrong-tenant guard fires on it exactly as it does for a box.
    return customerScopeGuard(
      api,
      customerIdOfAccount(node),
      null,
      // An account is in nobody's RACI map - the document divides functions
      // that run on boxes - so identity work at a co-managed customer meets the
      // shipped notify-first wall, not the soft one.
      null,
      labelOf(node),
      targetId,
      verb,
    );
  }

  if (node?.kind === 'share') {
    // A share resolves to neither a machine nor an account, which is how
    // `shareGrantAccess` walked past this pre-flight from 0.8.0 until 0.38.0.
    // It is guarded on the same terms an account is - a null role, because
    // permissions on a workspace are identity work and never the server tier,
    // and a null RACI owner, because a map divides functions that run on boxes
    // and has no line for a share.
    return customerScopeGuard(
      api,
      customerIdOfShare(node),
      null,
      null,
      labelOf(node),
      targetId,
      verb,
    );
  }

  // And the drive node the walk could not place. It is reached ONLY when the
  // arm above found no machine, so a file on a box - the whole of the shipped
  // drive, and the SELinux beat's own file through the unit that needs it -
  // never sees this sentence.
  if (node?.kind === 'file' || node?.kind === 'directory') {
    return { wall: 'unresolved', lines: UNPLACED_TARGET_LINES };
  }

  return null;
}

/**
 * The soft wall's record, written AFTER the work it is about (E9, 0.37.0).
 *
 * The order is the mechanic. The remediation has already succeeded - it was
 * never going to fail, because an MSP admin account on a co-managed estate can
 * reach the customer's own boxes and everybody involved knows it - and this
 * asks the world the question nothing else asked: was that theirs, and did
 * anybody tell them? If so it stamps the box, and the day driver turns the
 * stamp into their sysadmin's mail tomorrow morning.
 *
 * Silent for every other target in the game. Nothing is stamped in-house, at a
 * customer whose contract has no second IT team in it, on the MSP's own side of
 * this customer's RACI, or on a box somebody notified about first - and the
 * verb refuses each of those on its own account too, so a shell that asked
 * wrongly could not write a record the world does not agree with.
 */
function stampRaciViolation(
  api: GameApi,
  targetId: string,
  verb: string,
): void {
  const machine = machineOf(api, targetId);

  if (machine === null) {
    return;
  }

  const now = api.clock.now();

  if (!raciViolationDue(api.graph, machine, targetId, verb, now)) {
    return;
  }

  // The line is built HERE, in the minute the action was dispatched, and the
  // world appends it - the same contract the install audit and the break-glass
  // trail keep, so replaying the log writes the identical string.
  api.dispatch(WORLD_ACTIONS.raciViolation, api.actor, machine.id, {
    [RACI_LINE_PARAM]: raciViolationLine(verb, now),
  });
}

/**
 * Send a remediation at the world, through every wall it has to pass.
 *
 * Pre-flight, then the act, then the record - and a refusal returns before the
 * act, so a refused remediation leaves the world exactly as it found it, which
 * is the property the whole scope mechanic rests on.
 *
 * Every surface that changes a customer's estate goes through here: the
 * terminal's `dispatchLines`, the unix dialect's `unitVerbLines`, Remote
 * Assist's `run`, the directory's `run`. A fifth one is a call to this
 * function.
 */
export function dispatchRemediation(
  api: GameApi,
  action: string,
  target: string,
  params: Record<string, string | number> = {},
): RemediationResult {
  const refused = remediationRefusal(api, target, action);

  if (refused !== null) {
    return { kind: 'refused', lines: refused.lines };
  }

  const result = api.dispatch(action, api.actor, target, params);

  if (!result.ok) {
    return { kind: 'failed', reason: result.reason };
  }

  stampRaciViolation(api, target, action);

  return { kind: 'done' };
}

/**
 * What a window says after one of its controls has been clicked: the two strips
 * every one of these panes already has under its buttons, one of which is
 * always null.
 */
export interface RemediationStrips {
  readonly refusal: string | null;
  readonly outcome: string | null;
}

/**
 * What a window's refusal strip says about a result, or null when nothing
 * refused it.
 *
 * The two kinds of no read the same to somebody looking at a button: the
 * contract's and the world's. A strip has no lines, so the terminal's wrapped
 * sentences are joined by the space the wrap stood in - the WORDS are the
 * shipped words either way, because a window that paraphrased a refusal would
 * be teaching a rule the game does not have, and the point of this slice is
 * that these sentences are reachable from a window at all.
 */
export function refusalOf(result: RemediationResult): string | null {
  switch (result.kind) {
    // The blank line a terminal refusal uses as a paragraph break goes: a strip
    // under a button has no paragraphs, and two spaces in the middle of it
    // would be the seam showing through.
    case 'refused':
      return result.lines.filter((line) => line.length > 0).join(' ');
    case 'failed':
      return result.reason;
    case 'done':
      return null;
  }
}
