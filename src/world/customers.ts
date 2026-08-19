/**
 * The CUSTOMER dimension, as the pure functions that read it and the two
 * mechanics that hang off it (0.8.0, the MSP arc).
 *
 * A customer is a first-class world node (kind `customer`, `schema.rs`) owned by
 * the MSP employer; every machine in that customer's estate carries the
 * customer's id in `FIELDS.machineCustomer`. Nothing here mutates anything - it
 * reads the graph and returns verdicts and the true sentences that go with them.
 * Two surfaces consume it: the tickets app (which customer a ticket is for, and
 * the context opening one loads) and the terminal (`cmd-run.ts`), where the
 * scope-of-touch RBAC-403 and the wrong-customer guard fire.
 *
 * The scope refusal is the SAME honesty engine 0.7.0 shipped for cross-OS
 * refusals, generalised from OS to CONTRACT: an action out of the customer's
 * contract scope is refused with the real reason, and it COMPOSES with the OS
 * refusal (a helpdesk player reaching for a SaaS customer's Linux prod is
 * refused on both counts). Like that engine, this is a shell-side pre-flight -
 * it stops the terminal SENDING an action the contract does not cover - so the
 * engine stays customer-agnostic for actions and every existing golden holds.
 */

import type {
  NodeKind,
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
} from '../engine-api';
import {
  FIELDS,
  isServerRole,
  type MachineRole,
  machineRoleOf,
  type RaciOwner,
  RACI_OWNERS,
  raciOwnerOf,
  type ServiceScope,
  SERVICE_SCOPES,
  serviceScopeOf,
  type SlaTier,
  slaTierOf,
} from './fields';

/**
 * The node kinds a remediation can be AIMED at - the kinds behind which these
 * walls can find a customer, and therefore the kinds an action's target guard
 * naming one makes that action a remediation.
 *
 * The list is the seam's own reach written down (`shell/apps/remediation.ts`
 * resolves exactly these: a box, the box a service, unit or device sits on, an
 * account, and now a share). It lives here, with the mechanic, because a second
 * reader needs it: `actions/index.ts` derives WHICH VERBS are remediations from
 * the registry by looking for a target guard on one of these kinds, and the
 * dialogue dispatcher's load-time gate reads that answer. Two lists would
 * eventually disagree, and the disagreement would be a verb that reaches an
 * estate with no wall in front of it - the exact hole this is here to close.
 */
export const REMEDIATION_TARGET_KINDS: readonly NodeKind[] = Object.freeze([
  'machine',
  'service',
  'unit',
  'device',
  'account',
  'share',
  // The drive's two mutating verbs target these (0.38.0 review) - the
  // machine rides in as a param the guard reader cannot see, but the TARGET
  // is honest and the seam walks it home through the contains chain.
  'file',
  'directory',
]);

/**
 * The customer a NODE belongs to, by id, or null when it belongs to none.
 *
 * The customer field (`FIELDS.machineCustomer`, whose value is the plain
 * `customer` key) is the SAME on every node that carries one - a machine, and
 * now an account - so the resolver reads it off any node. Null is the in-house
 * case: probation and Bodgeworth nodes carry no customer, so every guard below
 * reads null and stands down, which is the whole of why the dimension is
 * additive.
 */
export function customerIdOfNode(
  node: Readonly<ReadOnlyGraphNode>,
): string | null {
  const value = node.fields[FIELDS.machineCustomer];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The customer a machine belongs to, by id, or null when it belongs to none. */
export function customerIdOfMachine(
  machine: Readonly<ReadOnlyGraphNode>,
): string | null {
  return customerIdOfNode(machine);
}

/**
 * The customer an ACCOUNT belongs to, by id, or null when it belongs to none.
 *
 * The MSP seeds each customer's staff accounts with the customer field, exactly
 * as it seeds their boxes, so an account-targeted action (unlock, resetpw, ...)
 * resolves to a customer and runs the same scope + tenant pre-flight a
 * machine-targeted one does. In-house accounts (probation, Bodgeworth, and the
 * MSP's own desk) carry none and read null, so their behaviour is unchanged.
 */
export function customerIdOfAccount(
  account: Readonly<ReadOnlyGraphNode>,
): string | null {
  return customerIdOfNode(account);
}

/**
 * The customer a SHARE belongs to, by id, or null when it belongs to none.
 *
 * The third node kind to carry the field, for the same reason the second one
 * did. `shareGrantAccess` aims at a `share`, which resolves to neither a
 * machine nor an account, so a grant on a customer's share slipped the scope
 * pre-flight entirely from 0.8.0 onwards - a monitoring-only customer's
 * workspace could be handed to somebody in silent breach of the contract, by
 * the same verb the walls catch everywhere else.
 *
 * A share is not walked to a machine on purpose. It has no edge to one (its
 * only edges are the `has_access` grants, and the whole point of the ticket is
 * that the grant is not there yet), and the walk would be wrong even if it
 * existed: permissions on a workspace are USER-AND-IDENTITY work, exactly like
 * an account, so it is refused where an account is refused and allowed where an
 * account is allowed. Resolving it to the file server behind it would refuse
 * the shipped Fontaine matter grant as SERVER work, which is a wall the
 * contract does not have.
 *
 * In-house shares (the common drive, the sales mailbox) carry no customer and
 * read null, so every non-MSP world is untouched.
 */
export function customerIdOfShare(
  share: Readonly<ReadOnlyGraphNode>,
): string | null {
  return customerIdOfNode(share);
}

/** The customer node itself, or undefined when nobody built it. */
export function customerNode(
  graph: ReadOnlyGraphView,
  customerId: string,
): Readonly<ReadOnlyGraphNode> | undefined {
  const node = graph.getNode(customerId);
  return node?.kind === 'customer' ? node : undefined;
}

/**
 * The handle a customer is known by on the queue and in a refusal - the short
 * uppercase name the world writes, falling back to the id so a message is never
 * blank even for a fixture customer nobody named.
 */
export function customerName(
  graph: ReadOnlyGraphView,
  customerId: string,
): string {
  const node = customerNode(graph, customerId);
  const name = node?.fields[FIELDS.name];
  return typeof name === 'string' && name.length > 0 ? name : customerId;
}

/**
 * The customer a TICKET is for, DERIVED from the machine behind its estate
 * nodes (0.8.0) - a ticket's customer is never authored, it is read off the box
 * the fault is on. The tickets app reads this to show which customer each ticket
 * is for, and to load that customer's context when the ticket is opened.
 *
 * Walks the ticket's estate nodes and returns the first customer it finds behind
 * a machine (the box itself, or the box a service or unit runs on), or null when
 * the ticket is about an in-house estate with no customer.
 */
export function customerIdForTicketNodes(
  graph: ReadOnlyGraphView,
  nodeIds: readonly string[],
): string | null {
  for (const id of nodeIds) {
    const node = graph.getNode(id);

    if (node === undefined) {
      continue;
    }

    const machine = node.kind === 'machine'
      ? node
      : node.kind === 'service' || node.kind === 'unit'
        ? graph
          .neighbors(id, { direction: 'out', edgeKind: 'runs_on' })
          .find((owner) => owner.kind === 'machine')
        : undefined;

    const customerId = machine === undefined
      ? null
      : customerIdOfMachine(machine);

    if (customerId !== null) {
      return customerId;
    }
  }

  return null;
}

/** The SLA tier a customer bought (0.12.0), read defensively (unknown -> null). */
export function slaTierOfCustomer(
  graph: ReadOnlyGraphView,
  customerId: string,
): SlaTier | null {
  const node = customerNode(graph, customerId);
  return node === undefined
    ? null
    : slaTierOf(node.fields[FIELDS.customerSlaTier]);
}

/**
 * The SLA tier a TICKET runs on (0.12.0), derived the same way its customer is:
 * off the box behind its estate nodes. Null when the ticket is in-house (no
 * customer, so no tier) - which is what keeps the probation and Bodgeworth
 * clocks the default and their goldens still.
 *
 * Read at SPAWN to stamp the tier onto the ticket and set its tier-scaled
 * resolution budget; every later read is off the stamped field, not this walk.
 */
export function slaTierForTicketNodes(
  graph: ReadOnlyGraphView,
  nodeIds: readonly string[],
): SlaTier | null {
  const customerId = customerIdForTicketNodes(graph, nodeIds);
  return customerId === null ? null : slaTierOfCustomer(graph, customerId);
}

/** The contract scope a customer bought, read defensively (unknown -> null). */
export function scopeOfCustomer(
  graph: ReadOnlyGraphView,
  customerId: string,
): ServiceScope | null {
  const node = customerNode(graph, customerId);
  return node === undefined
    ? null
    : serviceScopeOf(node.fields[FIELDS.customerServiceScope]);
}

/**
 * What the contract says about a REMEDIATION (any mutating action) aimed at a
 * machine of the given role, and - at a co-managed customer - at a box the RACI
 * map has an owner for.
 *
 * Every action the terminal dispatches is a remediation - reads never reach
 * here - so the verdict is a pure function of the scope, whether the target is
 * a server, and which team the map hands the target to:
 *
 *  - monitoring_only: nothing may be fixed; the move is to escalate.
 *  - helpdesk: workstations and users, yes; servers, no.
 *  - co_managed: notify the customer's own IT first; do not act unilaterally.
 *  - fully_managed: everything is in reach.
 *
 * `null` scope (no customer, or a customer with no readable contract) is
 * `allowed`: an in-house box has no contract to be out of.
 *
 * THE RACI SPLIT (E9, 0.37.0) is the third input, and it only ever means
 * something under co_managed - the other three contracts have no second IT team
 * for a map to divide the work with, so the owner is not read there at all:
 *
 *  - `msp`: the map gives this function to the provider. It is the desk's work
 *    to do, so it is `allowed`, exactly as a fully-managed box is - a heads-up
 *    about work the customer has contracted out is not coordination, it is
 *    noise, and a wall in front of it would be a wall in front of the job.
 *  - `internal`: the map gives it to the customer's own team - their
 *    application, their box, their afternoon. The command is not refused, and
 *    that is the point: `raci_internal` is ALLOWED WITH A CONSEQUENCE. Nothing
 *    technical stops an MSP admin account restarting a service on a box it can
 *    reach, and pretending otherwise would be the game inventing a permission
 *    the estate does not have. What actually happens is the peer sysadmin finds
 *    out afterwards, from his own monitoring, and says so. The refusal is
 *    social and it is late, and the seam that stamps it is `cmd-run.ts`.
 *  - absent: the map says nothing about this target, so the shipped co-managed
 *    default stands - notify them first, then act.
 */
export type ScopeVerdict =
  | 'allowed'
  | 'monitoring_only'
  | 'helpdesk_server'
  | 'co_managed'
  | 'raci_internal';

export function scopeVerdict(
  scope: ServiceScope | null,
  role: MachineRole | null,
  raci: RaciOwner | null,
): ScopeVerdict {
  switch (scope) {
    case SERVICE_SCOPES.monitoringOnly:
      return 'monitoring_only';
    case SERVICE_SCOPES.helpdesk:
      // A null role is a non-machine target (an account): user-and-identity
      // work is squarely helpdesk, so it is allowed; only the SERVER tier is
      // out of a helpdesk contract.
      return role !== null && isServerRole(role) ? 'helpdesk_server' : 'allowed';
    case SERVICE_SCOPES.coManaged:
      return raci === RACI_OWNERS.internal
        ? 'raci_internal'
        : raci === RACI_OWNERS.msp
          ? 'allowed'
          : 'co_managed';
    case SERVICE_SCOPES.fullyManaged:
    case null:
      return 'allowed';
  }
}

/**
 * Which team the RACI map hands a MACHINE to, read defensively off the box.
 *
 * On the box rather than on the customer because that is the grain the real
 * document works at: a co-managed RACI does not hand over "the estate", it
 * hands over functions, and the boxes those functions run on are what a desk
 * actually aims a verb at. A non-machine target (an account) has no entry in
 * anybody's map and reads null, which is the co-managed default.
 */
export function raciOwnerOfMachine(
  machine: Readonly<ReadOnlyGraphNode>,
): RaciOwner | null {
  return raciOwnerOf(machine.fields[FIELDS.raciOwner]);
}

/**
 * The true refusal for a scope verdict, as the lines a terminal prints, or null
 * when the action is allowed. Every reason is a real one from the scope research
 * (Azure Lighthouse / GDAP / PAM tiering): the world teaches the shape of the
 * job by refusing, exactly as the 0.7.0 cross-OS refusals do.
 */
export function scopeRefusalLines(verdict: ScopeVerdict): readonly string[] | null {
  switch (verdict) {
    // The two that say nothing: an action the contract covers, and the wall
    // that is not one. A box the RACI hands to the customer's own IT refuses
    // NOTHING here, because nothing refuses it in life either - the cost of it
    // arrives the next morning in their sysadmin's own words, which is a
    // different thing from a permission and lives in `world/raci.ts`.
    case 'allowed':
    case 'raci_internal':
      return null;
    case 'monitoring_only':
      return [
        'This account is monitoring-only - the contract is notify-and-escalate, '
          + 'not remediate.',
        'Raise it; remediation is out of scope until authorised as billable work.',
      ];
    case 'helpdesk_server':
      return [
        'Helpdesk covers workstations and users here. Servers are not in this '
          + 'contract - escalate,',
        'or the customer engages their infrastructure provider. (Workstation '
          + 'creds never',
        'cross into the server tier, which is why this is refused and not merely '
          + 'discouraged.)',
      ];
    case 'co_managed':
      return [
        'This is co-managed. Their own IT owns this estate alongside the MSP - '
          + 'notify them first',
        '("notify <target>"), the RACI says it is shared. Acting unilaterally '
          + 'here is exactly the',
        '"I thought you had it" coordination gap the contract exists to close; '
          + 'coordinate, then act.',
      ];
  }
}

/**
 * The scope refusal for a remediation aimed at a resolved CUSTOMER, at the
 * given role, or null when the contract covers it (or there is no customer).
 *
 * The one decision both target paths share: a machine resolves a customer, a
 * server-or-not role and a RACI owner, an account resolves a customer, a `null`
 * role (user-and-identity work, never a server) and a `null` owner (nobody's
 * map has a line for an account). Reading the scope and turning the verdict
 * into the true sentence happens here, once.
 */
export function scopeRefusalForCustomer(
  graph: ReadOnlyGraphView,
  customerId: string | null,
  role: MachineRole | null,
  raci: RaciOwner | null,
): readonly string[] | null {
  if (customerId === null) {
    return null;
  }

  const scope = scopeOfCustomer(graph, customerId);
  return scopeRefusalLines(scopeVerdict(scope, role, raci));
}

/**
 * The scope refusal for a remediation aimed at a machine, or null when the
 * contract covers it. Resolves the machine's customer, role and RACI owner and
 * hands all three to the shared decision above.
 */
export function scopeRefusalForMachine(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly string[] | null {
  return scopeRefusalForCustomer(
    graph,
    customerIdOfMachine(machine),
    machineRoleOf(machine.fields[FIELDS.machineRole]),
    raciOwnerOfMachine(machine),
  );
}

/**
 * The wrong-customer guard: an action aimed at a target that belongs to a
 * DIFFERENT customer than the one the open ticket put on screen.
 *
 * The single sharpest MSP hazard - acting in the wrong client's environment -
 * made mechanical. It fires only when BOTH customers are real and different: an
 * action with no customer selected (no ticket open) is not caught here, because
 * there is nothing on screen to be the wrong one; an action on an in-house
 * target (no target customer) is not caught either, because it belongs to no
 * client. The target is named by the label passed in - a box's hostname, or an
 * account's username - so both machine and account paths share one guard.
 *
 * Returns the STOP lines naming both, or null when the target is the customer
 * already in context (or there is nothing to compare).
 */
export function wrongCustomerLines(
  graph: ReadOnlyGraphView,
  targetCustomerId: string | null,
  targetLabel: string,
  currentCustomerId: string | null,
): readonly string[] | null {
  if (currentCustomerId === null) {
    return null;
  }

  if (targetCustomerId === null || targetCustomerId === currentCustomerId) {
    return null;
  }

  const here = customerName(graph, currentCustomerId);
  const there = customerName(graph, targetCustomerId);

  return [
    `STOP. ${here} is on your screen but ${targetLabel} belongs to ${there}.`,
    'Are you in the right customer? Acting in the wrong tenant is the MSP horror '
      + 'story;',
    `open a ${there} ticket if that is where you mean to be, or aim at a ${here} `
      + 'box.',
  ];
}

/**
 * The wrong-customer guard for a machine target: resolves the box's customer
 * and its hostname label and hands both to the shared guard above.
 */
export function wrongCustomerGuardLines(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
  currentCustomerId: string | null,
): readonly string[] | null {
  return wrongCustomerLines(
    graph,
    customerIdOfMachine(machine),
    machineLabel(machine),
    currentCustomerId,
  );
}

/** How the guard names the box - its hostname, then its id as a last resort. */
function machineLabel(machine: Readonly<ReadOnlyGraphNode>): string {
  const hostname = machine.fields[FIELDS.hostname];
  return typeof hostname === 'string' && hostname.length > 0
    ? hostname
    : machine.id;
}
