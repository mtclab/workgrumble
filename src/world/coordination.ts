/**
 * The co-managed coordinate-then-act seam (0.11.0), as the pure functions that
 * file a coordination notice and read whether one clears an action.
 *
 * 0.8.0 made an out-of-scope action a flat refusal, and 0.10.0 gated the risky
 * kind behind a change request. Co-managed is the middle weight neither of those
 * captures: acting on a customer whose OWN IT works alongside the MSP is not
 * forbidden and does not need the full change ceremony - it needs COORDINATION.
 * You tell their IT you are touching their box before you touch it, so the RACI
 * "I thought you had it" gap never opens, and then you act. This module is that
 * heads-up turned into world data.
 *
 * A coordination notice is a first-class node (kind `coordination`, `schema.rs`)
 * filed against a specific TARGET; the scope pre-flight consults it before it
 * refuses a co-managed action. Everything here is pure and deterministic - the
 * notice carries the minute it was given (off the clock the caller passes, never
 * a wall clock or Math.random), and the DRIVER applies the ops. Nothing here
 * mutates.
 *
 * The line the tier turns on is kept sharp: a notice clears co-managed work and
 * NOTHING else. It is not filed for an in-house target (no customer to notify),
 * for a helpdesk or monitoring-only customer (a heads-up does not widen a
 * contract - that is a change request or an escalation, not a coordination), or
 * for a fully-managed one (nobody else's IT to tell). Only co-managed is
 * coordinate-then-act, so only co-managed is what `notify` files against.
 *
 * From 0.37.0 that covers both co-managed shapes: the estate the map says
 * nothing about (where the notice CLEARS an action the pre-flight would refuse)
 * and the box the map hands to their own IT (where nothing is refused at all
 * and the notice is what stops the peer sysadmin finding out from his
 * monitoring). Same node, same verb, two different things being bought with it.
 */

import type {
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  SetupOp,
} from '../engine-api';
import {
  customerIdOfAccount,
  customerIdOfMachine,
  customerName,
  machineForTarget,
  raciOwnerOfMachine,
  scopeOfCustomer,
  scopeVerdict,
} from './customers';
import {
  FIELDS,
  machineRoleOf,
  type MachineRole,
  type RaciOwner,
} from './fields';

/* -- resolving what a target IS, for its customer and scope ---------------- */

/**
 * The customer a target belongs to, the machine role behind it, and which team
 * the RACI map hands that box to - the same three the scope pre-flight reads,
 * because a notice has to be decided against the same verdict it clears.
 *
 * Through the SHARED resolver as of the 0.38.0 verifier round. This module used
 * to carry its own `machineBehind`, which is the same walk written twice, and
 * the two drifted the moment one of them grew an arm: the seam learned to walk
 * a file or directory home down its contains chain and this copy did not, so
 * `planCoordination` told a player there was nobody to notify about a box the
 * seam was refusing them on. One walk, one answer, no second list of kinds.
 */
function customerAndRole(
  graph: ReadOnlyGraphView,
  targetId: string,
): {
  readonly customerId: string | null;
  readonly role: MachineRole | null;
  readonly raci: RaciOwner | null;
} {
  const node = graph.getNode(targetId);

  if (node?.kind === 'account') {
    return { customerId: customerIdOfAccount(node), role: null, raci: null };
  }

  const machine = machineForTarget(graph, targetId);

  return machine === null
    ? { customerId: null, role: null, raci: null }
    : {
      customerId: customerIdOfMachine(machine),
      role: machineRoleOf(machine.fields[FIELDS.machineRole]),
      raci: raciOwnerOfMachine(machine),
    };
}

/* -- reading a notice: does one clear this action ------------------------- */

/** A coordination notice node, by whether it is one. */
export function isCoordination(node: Readonly<ReadOnlyGraphNode>): boolean {
  return node.kind === 'coordination';
}

/**
 * Whether this notice clears the given target: it is a coordination filed for
 * exactly this target id. Per-target rather than per-verb on purpose - the
 * heads-up is "we are on this box", and once their IT knows that, the work the
 * ticket needs on it is the work they were told about.
 */
export function coordinationCovers(
  node: Readonly<ReadOnlyGraphNode>,
  targetId: string,
): boolean {
  return isCoordination(node) && node.fields[FIELDS.coordTarget] === targetId;
}

/**
 * Whether the customer's own IT has been notified about this target - the single
 * question the co-managed pre-flight asks before it refuses. Fails CLOSED:
 * without a notice for this exact target it is false, so reverting the check
 * that reads it wrongly lets a unilateral action through - which is what the
 * teeth test proves goes red.
 */
export function isCoordinated(
  graph: ReadOnlyGraphView,
  targetId: string,
): boolean {
  return graph
    .nodesOfKind('coordination')
    .some((node) => coordinationCovers(node, targetId));
}

/* -- filing: the verb that puts a coordination notice into the world ------- */

export type CoordinationFiling =
  | { readonly kind: 'not_needed'; readonly lines: readonly string[] }
  | {
    readonly kind: 'filed';
    readonly ops: readonly SetupOp[];
    readonly lines: readonly string[];
  };

/**
 * Plans the filing of a coordination notice for a target: the setup ops that add
 * the node, and the lines the terminal prints. It decides the outcome
 * deterministically from the contract:
 *
 *  - an in-house target, or a helpdesk / monitoring-only / fully-managed
 *    customer: no notice is filed. A heads-up to their IT is a co-managed move
 *    and only a co-managed one - the refusal names why the other tiers are not
 *    it (in-house is yours; helpdesk/monitoring is a scope wall, not a
 *    coordination; fully-managed has no other IT to tell).
 *  - a co-managed target: the notice is filed, and it clears the action - the
 *    RACI heads-up made mechanical.
 *
 * The DRIVER applies the ops; nothing here mutates.
 */
export function planCoordination(
  graph: ReadOnlyGraphView,
  targetId: string,
  now: number,
): CoordinationFiling {
  const { customerId, role, raci } = customerAndRole(graph, targetId);

  if (customerId === null) {
    return {
      kind: 'not_needed',
      lines: [
        'No coordination needed - this is an in-house box with no customer IT',
        'to notify. A coordination notice is the co-managed heads-up to a',
        'customer\'s own IT; there is nobody else\'s desk on the other end of this.',
      ],
    };
  }

  const verdict = scopeVerdict(scopeOfCustomer(graph, customerId), role, raci);
  const label = customerName(graph, customerId);

  // Both co-managed shapes take a notice, and for the same reason: there is
  // another IT team on the account and this is the sentence that tells them.
  // `raci_internal` is the one where nothing would have stopped you - the
  // heads-up is not what unlocks the work there, it is the difference between
  // a colleague being told and a colleague finding out - so refusing to file
  // one on their own box would be refusing the honest move on the one target
  // that most needs it.
  if (verdict !== 'co_managed' && verdict !== 'raci_internal') {
    return {
      kind: 'not_needed',
      lines: [
        `No coordination notice filed for ${label}.`,
        'Notifying their IT first is the co-managed move: their team and the MSP',
        'share the estate, so a heads-up before you act closes the "I thought you',
        'had it" gap. This contract is not co-managed - the honest move here is',
        'whatever the scope engine already says (do it, escalate, or a change',
        'request), not a notice their IT would not know what to do with.',
      ],
    };
  }

  const coordId = `coordination:${targetId}@${String(now)}`;

  const lines = verdict === 'raci_internal'
    ? [
      `${label}'s IT notified: you are working on ${targetId}.`,
      'That box is THEIRS under the RACI - their application, their sysadmin -',
      'and nothing was ever going to stop you touching it. This is the',
      'difference between a colleague being told and a colleague finding out',
      'from his own monitoring tomorrow morning. The heads-up is on the record.',
    ]
    : [
      `${label}'s IT notified: you are working on ${targetId}.`,
      'Co-managed is coordinate-then-act - their team owns this estate alongside',
      'the MSP, so telling them before you touch it is the contract, not a',
      'courtesy. The heads-up is on the record; the action is cleared.',
    ];

  return {
    kind: 'filed',
    ops: [
      {
        op: 'addNode',
        node: {
          id: coordId,
          kind: 'coordination',
          fields: {
            [FIELDS.name]: `Coordination: ${targetId}`,
            [FIELDS.coordTarget]: targetId,
            [FIELDS.coordCustomer]: customerId,
            [FIELDS.coordNotifiedAt]: now,
          },
        },
      },
    ],
    lines,
  };
}
