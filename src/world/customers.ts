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

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import {
  FIELDS,
  isServerRole,
  type MachineRole,
  machineRoleOf,
  type ServiceScope,
  SERVICE_SCOPES,
  serviceScopeOf,
} from './fields';

/**
 * The customer a machine belongs to, by id, or null when it belongs to none.
 *
 * Null is the in-house case: probation and Bodgeworth boxes carry no customer,
 * so every guard below reads null and stands down, which is the whole of why
 * the dimension is additive.
 */
export function customerIdOfMachine(
  machine: Readonly<ReadOnlyGraphNode>,
): string | null {
  const value = machine.fields[FIELDS.machineCustomer];
  return typeof value === 'string' && value.length > 0 ? value : null;
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
 * machine of the given role.
 *
 * Every action the terminal dispatches is a remediation - reads never reach
 * here - so the verdict is a pure function of the scope and whether the target
 * is a server:
 *
 *  - monitoring_only: nothing may be fixed; the move is to escalate.
 *  - helpdesk: workstations and users, yes; servers, no.
 *  - co_managed: notify the customer's own IT first; do not act unilaterally.
 *  - fully_managed: everything is in reach.
 *
 * `null` scope (no customer, or a customer with no readable contract) is
 * `allowed`: an in-house box has no contract to be out of.
 */
export type ScopeVerdict =
  | 'allowed'
  | 'monitoring_only'
  | 'helpdesk_server'
  | 'co_managed';

export function scopeVerdict(
  scope: ServiceScope | null,
  role: MachineRole,
): ScopeVerdict {
  switch (scope) {
    case SERVICE_SCOPES.monitoringOnly:
      return 'monitoring_only';
    case SERVICE_SCOPES.helpdesk:
      return isServerRole(role) ? 'helpdesk_server' : 'allowed';
    case SERVICE_SCOPES.coManaged:
      return 'co_managed';
    case SERVICE_SCOPES.fullyManaged:
    case null:
      return 'allowed';
  }
}

/**
 * The true refusal for a scope verdict, as the lines a terminal prints, or null
 * when the action is allowed. Every reason is a real one from the scope research
 * (Azure Lighthouse / GDAP / PAM tiering): the world teaches the shape of the
 * job by refusing, exactly as the 0.7.0 cross-OS refusals do.
 */
export function scopeRefusalLines(verdict: ScopeVerdict): readonly string[] | null {
  switch (verdict) {
    case 'allowed':
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
        'This is co-managed. Their own IT owns this box - notify them first; the '
          + 'RACI says',
        'it is theirs. Acting unilaterally here is exactly the coordination gap '
          + 'the contract',
        'exists to close.',
      ];
  }
}

/**
 * The scope refusal for a remediation aimed at a machine, or null when the
 * contract covers it. The one call the terminal makes: it resolves the
 * machine's customer, reads the scope, and turns the verdict into the true
 * sentence.
 */
export function scopeRefusalForMachine(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly string[] | null {
  const customerId = customerIdOfMachine(machine);

  if (customerId === null) {
    return null;
  }

  const scope = scopeOfCustomer(graph, customerId);
  const role = machineRoleOf(machine.fields[FIELDS.machineRole]);
  return scopeRefusalLines(scopeVerdict(scope, role));
}

/**
 * The wrong-customer guard: an action aimed at a machine that belongs to a
 * DIFFERENT customer than the one the open ticket put on screen.
 *
 * The single sharpest MSP hazard - acting in the wrong client's environment -
 * made mechanical. It fires only when BOTH customers are real and different: an
 * action with no customer selected (no ticket open) is not caught here, because
 * there is nothing on screen to be the wrong one; an action on an in-house box
 * (no target customer) is not caught either, because it belongs to no client.
 *
 * Returns the STOP lines naming both, or null when the target is the customer
 * already in context (or there is nothing to compare).
 */
export function wrongCustomerGuardLines(
  graph: ReadOnlyGraphView,
  machine: Readonly<ReadOnlyGraphNode>,
  currentCustomerId: string | null,
): readonly string[] | null {
  if (currentCustomerId === null) {
    return null;
  }

  const targetCustomerId = customerIdOfMachine(machine);

  if (targetCustomerId === null || targetCustomerId === currentCustomerId) {
    return null;
  }

  const here = customerName(graph, currentCustomerId);
  const there = customerName(graph, targetCustomerId);
  const box = machineLabel(machine);

  return [
    `STOP. ${here} is on your screen but ${box} belongs to ${there}.`,
    'Are you in the right customer? Acting in the wrong tenant is the MSP horror '
      + 'story;',
    `open a ${there} ticket if that is where you mean to be, or aim at a ${here} `
      + 'box.',
  ];
}

/** How the guard names the box - its hostname, then its id as a last resort. */
function machineLabel(machine: Readonly<ReadOnlyGraphNode>): string {
  const hostname = machine.fields[FIELDS.hostname];
  return typeof hostname === 'string' && hostname.length > 0
    ? hostname
    : machine.id;
}
