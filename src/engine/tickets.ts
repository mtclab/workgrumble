import {
  evaluate,
  type Expr,
  type FieldMatch,
  isExpr,
  type Selector,
} from './assertions';
import type { SimClock } from './clock';
import type { EngineEventBus } from './events';
import {
  type Edge,
  type EntityGraph,
  type Node,
  type NodeId,
} from './graph';
import {
  type EdgeKind,
  type FieldValue,
  isEdgeKind,
  isFieldValue,
  isRecord,
  isTicketState,
  type NodeKind,
  type TicketState,
  validateNode,
} from './schema';

export const TICKET_ARCHETYPES = [
  'hidden_cause',
  'read_the_screen',
  'deadline_absurdity',
  'recurring_arc',
  'flood',
] as const;

export type TicketArchetype = (typeof TICKET_ARCHETYPES)[number];

export type SetupMutation =
  | { op: 'addNode'; node: Node }
  | {
    op: 'setField';
    id: NodeId;
    field: string;
    value: FieldValue;
  }
  | { op: 'addEdge'; edge: Edge }
  | { op: 'removeEdge'; edge: Edge };

export interface TicketDef {
  id: string;
  archetype: TicketArchetype;
  flavor: {
    title: string;
    body: string;
  };
  reporter: NodeId;
  setup: SetupMutation[];
  resolved_when: Expr;
  sla_ticks: number;
  reward: {
    reputation: number;
    money: number;
  };
  kb_ref: string;
}

interface TicketRecord {
  definition: TicketDef;
  waiting: boolean;
  resolved: boolean;
  breached: boolean;
  updating: boolean;
}

function isTicketArchetype(value: unknown): value is TicketArchetype {
  return typeof value === 'string'
    && TICKET_ARCHETYPES.some((archetype) => archetype === value);
}

function cloneFieldMatch(match: Readonly<FieldMatch>): FieldMatch {
  return {
    field: match.field,
    value: match.value,
  };
}

function cloneSelector(selector: Readonly<Selector>): Selector {
  if ('id' in selector) {
    return { id: selector.id };
  }

  return {
    kind: selector.kind,
    where: selector.where.map(cloneFieldMatch),
  };
}

function cloneExpr(expr: Readonly<Expr>): Expr {
  switch (expr.op) {
    case 'and':
    case 'or':
      return {
        op: expr.op,
        exprs: expr.exprs.map(cloneExpr),
      };
    case 'not':
      return {
        op: 'not',
        expr: cloneExpr(expr.expr),
      };
    case 'eq':
      return {
        op: 'eq',
        selector: cloneSelector(expr.selector),
        field: expr.field,
        value: expr.value,
      };
    case 'exists':
      return expr.where === undefined
        ? {
          op: 'exists',
          kind: expr.kind,
        }
        : {
          op: 'exists',
          kind: expr.kind,
          where: expr.where.map(cloneFieldMatch),
        };
    case 'edge':
      return {
        op: 'edge',
        from: cloneSelector(expr.from),
        to: cloneSelector(expr.to),
        kind: expr.kind,
      };
  }
}

function validateEdge(value: unknown): Edge {
  if (!isRecord(value)) {
    throw new TypeError('Setup edge must be an object.');
  }

  if (
    typeof value.from !== 'string'
    || value.from.length === 0
    || typeof value.to !== 'string'
    || value.to.length === 0
    || !isEdgeKind(value.kind)
  ) {
    throw new TypeError('Setup edge is invalid.');
  }

  return {
    from: value.from,
    to: value.to,
    kind: value.kind,
  };
}

function validateSetupMutation(value: unknown): SetupMutation {
  if (!isRecord(value) || typeof value.op !== 'string') {
    throw new TypeError('Setup mutation must be an object with an op.');
  }

  switch (value.op) {
    case 'addNode':
      return {
        op: 'addNode',
        node: validateNode(value.node),
      };
    case 'setField':
      if (
        typeof value.id !== 'string'
        || value.id.length === 0
        || typeof value.field !== 'string'
        || value.field.length === 0
        || !isFieldValue(value.value)
      ) {
        throw new TypeError('setField setup mutation is invalid.');
      }

      return {
        op: 'setField',
        id: value.id,
        field: value.field,
        value: value.value,
      };
    case 'addEdge':
      return {
        op: 'addEdge',
        edge: validateEdge(value.edge),
      };
    case 'removeEdge':
      return {
        op: 'removeEdge',
        edge: validateEdge(value.edge),
      };
    default:
      throw new TypeError(`Unsupported setup mutation "${value.op}".`);
  }
}

export function validateTicketDef(value: unknown): TicketDef {
  if (!isRecord(value)) {
    throw new TypeError('Ticket definition must be an object.');
  }

  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new TypeError('Ticket id must be a non-empty string.');
  }

  if (!isTicketArchetype(value.archetype)) {
    throw new TypeError('Ticket archetype is not supported.');
  }

  if (
    !isRecord(value.flavor)
    || typeof value.flavor.title !== 'string'
    || typeof value.flavor.body !== 'string'
  ) {
    throw new TypeError('Ticket flavor requires string title and body.');
  }

  if (typeof value.reporter !== 'string' || value.reporter.length === 0) {
    throw new TypeError('Ticket reporter must be a non-empty node id.');
  }

  if (!Array.isArray(value.setup)) {
    throw new TypeError('Ticket setup must be an array.');
  }

  if (!isExpr(value.resolved_when)) {
    throw new TypeError('Ticket resolved_when must be a valid expression.');
  }

  if (
    !Number.isSafeInteger(value.sla_ticks)
    || typeof value.sla_ticks !== 'number'
    || value.sla_ticks < 0
  ) {
    throw new TypeError('Ticket sla_ticks must be a non-negative safe integer.');
  }

  if (
    !isRecord(value.reward)
    || typeof value.reward.reputation !== 'number'
    || !Number.isFinite(value.reward.reputation)
    || typeof value.reward.money !== 'number'
    || !Number.isFinite(value.reward.money)
  ) {
    throw new TypeError('Ticket reward values must be finite numbers.');
  }

  if (typeof value.kb_ref !== 'string') {
    throw new TypeError('Ticket kb_ref must be a string.');
  }

  return {
    id: value.id,
    archetype: value.archetype,
    flavor: {
      title: value.flavor.title,
      body: value.flavor.body,
    },
    reporter: value.reporter,
    setup: value.setup.map(validateSetupMutation),
    resolved_when: cloneExpr(value.resolved_when),
    sla_ticks: value.sla_ticks,
    reward: {
      reputation: value.reward.reputation,
      money: value.reward.money,
    },
    kb_ref: value.kb_ref,
  };
}

export function isTicketDef(value: unknown): value is TicketDef {
  try {
    validateTicketDef(value);
    return true;
  } catch {
    return false;
  }
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class TicketEngine {
  private readonly tickets = new Map<NodeId, TicketRecord>();
  private readonly unsubscribeGraph: () => void;
  private readonly unsubscribeClock: () => void;

  public constructor(
    private readonly graph: EntityGraph,
    private readonly clock: SimClock,
    private readonly bus: EngineEventBus,
  ) {
    this.unsubscribeGraph = bus.on('graph:mutated', () => {
      this.checkAll();
    });
    this.unsubscribeClock = clock.onTick(() => {
      this.handleTick();
    });
  }

  public spawn(value: unknown): void {
    const definition = validateTicketDef(value);

    if (
      this.tickets.has(definition.id)
      || this.graph.getNode(definition.id) !== undefined
    ) {
      throw new Error(`Ticket "${definition.id}" already exists.`);
    }

    if (
      definition.setup.some(
        (mutation) => mutation.op === 'addNode'
          && mutation.node.id === definition.id,
      )
    ) {
      throw new Error('Ticket setup must not create the ticket node itself.');
    }

    const deadline = this.clock.now() + definition.sla_ticks;

    if (!Number.isSafeInteger(deadline)) {
      throw new RangeError('Ticket SLA deadline exceeds the safe tick range.');
    }

    const reporterWillExist = this.graph.getNode(definition.reporter) !== undefined
      || definition.setup.some(
        (mutation) => mutation.op === 'addNode'
          && mutation.node.id === definition.reporter,
      );

    if (!reporterWillExist) {
      throw new Error(`Reporter "${definition.reporter}" does not exist.`);
    }

    for (const mutation of definition.setup) {
      this.applySetupMutation(mutation);
    }

    if (this.graph.getNode(definition.reporter) === undefined) {
      throw new Error(`Reporter "${definition.reporter}" does not exist.`);
    }

    this.graph.addNode({
      id: definition.id,
      kind: 'ticket',
      fields: {
        state: 'open',
        spawned_at: this.clock.now(),
        sla_deadline: deadline,
        breached: false,
      },
    });

    const record: TicketRecord = {
      definition,
      waiting: false,
      resolved: false,
      breached: false,
      updating: false,
    };
    this.tickets.set(definition.id, record);
    this.bus.emit('ticket:spawned', { id: definition.id });
    this.checkTicket(record);
  }

  public setWaiting(id: NodeId, waiting: boolean): void {
    const record = this.getRecord(id);

    if (record.resolved) {
      throw new Error(`Resolved ticket "${id}" cannot wait on a user.`);
    }

    if (record.breached) {
      throw new Error(`Breached ticket "${id}" cannot wait on a user.`);
    }

    if (record.waiting === waiting) {
      return;
    }

    record.waiting = waiting;
    this.updateRecord(record, () => {
      this.graph.setField(
        id,
        'state',
        waiting ? 'waiting_on_user' : 'open',
      );
    });
    this.checkTicket(record);
  }

  public getState(id: NodeId): TicketState {
    this.getRecord(id);
    const state = this.graph.getField(id, 'state');

    if (!isTicketState(state)) {
      throw new Error(`Ticket "${id}" has no valid state.`);
    }

    return state;
  }

  public wasBreached(id: NodeId): boolean {
    return this.getRecord(id).breached;
  }

  public dispose(): void {
    this.unsubscribeGraph();
    this.unsubscribeClock();
  }

  private applySetupMutation(mutation: SetupMutation): void {
    switch (mutation.op) {
      case 'addNode':
        this.graph.addNode(mutation.node);
        return;
      case 'setField':
        this.graph.setField(
          mutation.id,
          mutation.field,
          mutation.value,
        );
        return;
      case 'addEdge':
        this.graph.addEdge(mutation.edge);
        return;
      case 'removeEdge':
        this.graph.removeEdge(mutation.edge);
    }
  }

  private handleTick(): void {
    for (const record of this.sortedRecords()) {
      if (!record.resolved && record.waiting) {
        const deadline = this.graph.getField(
          record.definition.id,
          'sla_deadline',
        );

        if (
          typeof deadline !== 'number'
          || !Number.isSafeInteger(deadline)
          || !Number.isSafeInteger(deadline + 1)
        ) {
          throw new Error(
            `Ticket "${record.definition.id}" has an invalid SLA deadline.`,
          );
        }

        this.updateRecord(record, () => {
          this.graph.setField(
            record.definition.id,
            'sla_deadline',
            deadline + 1,
          );
        });
      }
    }

    this.checkAll();
  }

  private checkAll(): void {
    for (const record of this.sortedRecords()) {
      this.checkTicket(record);
    }
  }

  private checkTicket(record: TicketRecord): void {
    if (record.resolved || record.updating) {
      return;
    }

    const id = record.definition.id;

    if (this.graph.getNode(id) === undefined) {
      return;
    }

    if (evaluate(this.graph, record.definition.resolved_when)) {
      this.resolve(record);
      return;
    }

    const deadline = this.graph.getField(id, 'sla_deadline');

    if (
      !record.breached
      && !record.waiting
      && typeof deadline === 'number'
      && this.clock.now() >= deadline
    ) {
      this.breach(record);
    }
  }

  private resolve(record: TicketRecord): void {
    record.resolved = true;
    record.waiting = false;
    this.updateRecord(record, () => {
      this.graph.setField(record.definition.id, 'state', 'resolved');
    });
    this.bus.emit('ticket:resolved', { id: record.definition.id });
  }

  private breach(record: TicketRecord): void {
    record.breached = true;
    this.updateRecord(record, () => {
      this.graph.setField(record.definition.id, 'state', 'breached');
      this.graph.setField(record.definition.id, 'breached', true);
    });
    this.bus.emit('ticket:breached', { id: record.definition.id });
    this.checkTicket(record);
  }

  private updateRecord(record: TicketRecord, update: () => void): void {
    record.updating = true;

    try {
      update();
    } finally {
      record.updating = false;
    }
  }

  private sortedRecords(): TicketRecord[] {
    return [...this.tickets.values()]
      .sort((left, right) => compareIds(
        left.definition.id,
        right.definition.id,
      ));
  }

  private getRecord(id: NodeId): TicketRecord {
    const record = this.tickets.get(id);

    if (record === undefined) {
      throw new Error(`Ticket "${id}" is not active.`);
    }

    return record;
  }
}

export type {
  EdgeKind,
  FieldValue,
  NodeKind,
  TicketState,
};
