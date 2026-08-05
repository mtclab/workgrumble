/**
 * The vocabulary the engine and the world share.
 *
 * These used to live inside `src/engine`; the engine is Rust now, so this is
 * where the TypeScript side keeps the shapes it sends across the boundary and
 * the shapes it gets back. Nothing here has behaviour - behaviour is the
 * engine's job, and a second implementation of it in TypeScript is exactly the
 * drift the port exists to remove.
 */

export const NODE_KINDS = [
  'person',
  'account',
  'machine',
  'device',
  'service',
  /**
   * A systemd unit on a Linux box - the Linux analogue of a `service`, kept as
   * its own kind because families are not one shell in hats: a unit carries
   * systemd's own state words and no Windows service manager reaches it.
   */
  'unit',
  /**
   * A CUSTOMER of an MSP employer (0.8.0) - a machine dimension exactly like
   * `os`, first-class because the ticket queue is organised BY customer. It
   * carries the contract scope that decides what the player may DO to its
   * estate, the business type that shapes that estate, and an SLA tier; its
   * machines carry its id in their `customer` field.
   */
  'customer',
  'share',
  'group',
  'mail_rule',
  'ticket',
  /**
   * The drive. A directory holds things and a file holds bytes, and both are
   * nodes for the same reason everything else is: the terminal reads the
   * world, and a tree kept anywhere else would be a second world to keep true.
   */
  'directory',
  'file',
] as const;

export const EDGE_KINDS = [
  'owns',
  'member_of',
  'connected_to',
  'runs_on',
  'has_access',
  /** What a drive holds: machine -> its root, directory -> its children. */
  'contains',
] as const;

export const TICKET_STATES = [
  'open',
  'resolved',
  'breached',
  'waiting_on_user',
] as const;

export const TICKET_ARCHETYPES = [
  'hidden_cause',
  'read_the_screen',
  'deadline_absurdity',
  'recurring_arc',
  'flood',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type TicketState = (typeof TICKET_STATES)[number];
export type TicketArchetype = (typeof TICKET_ARCHETYPES)[number];
export type FieldValue = string | number | boolean | null;
export type NodeId = string;

export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  fields: Record<string, FieldValue>;
}

export interface Edge {
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
}

export interface ReadOnlyGraphNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface NeighborOptions {
  edgeKind?: EdgeKind;
  direction: 'out' | 'in';
}

/**
 * The query half of the graph, and nothing else: the shell reads the world and
 * reaches it only through dispatched actions.
 */
export interface ReadOnlyGraphView {
  getNode(id: NodeId): ReadOnlyGraphNode | undefined;
  getField(id: NodeId, field: string): FieldValue | undefined;
  nodesOfKind(kind: NodeKind): readonly ReadOnlyGraphNode[];
  allNodes(): readonly ReadOnlyGraphNode[];
  neighbors(
    id: NodeId,
    options: Readonly<NeighborOptions>,
  ): readonly ReadOnlyGraphNode[];
}

export type DispatchResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface DispatchLogEntry {
  tick: number;
  id: string;
  actor: NodeId;
  target: NodeId | null;
  params: Record<string, FieldValue>;
  ok: boolean;
  reason?: string;
}

/**
 * Where the dispatch log is measured from, and how much of it there is.
 *
 * The log is append-only and every save carries it, so a career-long log is a
 * save that grows forever. A checkpoint is the world at `tick` - named by the
 * graph `hash` it had there - and the log holds only what happened since; a
 * `hash` of null means nothing has been drained yet, so the log is still the
 * whole history.
 */
export interface LogCheckpoint {
  readonly tick: number;
  readonly hash: string | null;
  readonly entries: number;
}

/** What taking a checkpoint moved. */
export interface CheckpointOutcome {
  readonly tick: number;
  readonly hash: string;
  readonly drained: number;
}

export type GraphMutation =
  | { type: 'node:added'; node: GraphNode }
  | { type: 'node:removed'; node: GraphNode; edges: Edge[] }
  | {
    type: 'field:set';
    id: NodeId;
    field: string;
    previous?: FieldValue;
    value: FieldValue;
  }
  | { type: 'edge:added'; edge: Edge }
  | { type: 'edge:removed'; edge: Edge };

export type EngineEvent =
  | { type: 'graph:mutated'; mutation: GraphMutation }
  | { type: 'ticket:spawned'; id: string }
  | { type: 'ticket:resolved'; id: string }
  | { type: 'ticket:breached'; id: string }
  /**
   * A saved world replaced the running one. Nothing mutated its way there, so
   * no other event describes it: anything showing the world or the clock is
   * looking at the previous session until it hears this.
   */
  | { type: 'world:restored'; tick: number };

/* -- assertions ---------------------------------------------------------- */

export interface FieldMatch {
  field: string;
  value: FieldValue;
}

export type Selector =
  | { id: NodeId }
  | { kind: NodeKind; where: FieldMatch[] };

export type Expr =
  | { op: 'and' | 'or'; exprs: Expr[] }
  | { op: 'not'; expr: Expr }
  | {
    op: 'eq';
    selector: Selector;
    field: string;
    value: FieldValue;
  }
  | { op: 'exists'; kind: NodeKind; where?: FieldMatch[] }
  | { op: 'edge'; from: Selector; to: Selector; kind: EdgeKind };

/* -- world construction -------------------------------------------------- */

export type SetupOp =
  | { op: 'addNode'; node: GraphNode }
  | { op: 'setField'; id: NodeId; field: string; value: FieldValue }
  | { op: 'addEdge'; edge: Edge }
  | { op: 'removeEdge'; edge: Edge };

export interface TicketDef {
  id: string;
  archetype: TicketArchetype;
  flavor: {
    title: string;
    body: string;
    /**
     * What the deflection bot tried before this reached a human, and why it did
     * not stick (0.5.0 slice 3).
     *
     * READ-ONLY flavour, no verb: the "have you tried the portal" layer answered
     * the easy 80% of the queue, so what survives to a person is the weird 20% -
     * and this is that made legible on the ticket that shows it. It explains,
     * mechanically, why the ticket in front of you is not the obvious thing: the
     * obvious thing was already tried. `tried` is what the bot did; `stillBroken`
     * is what the user came back saying. Absent on the tickets the bot never
     * touched, which is most of them.
     */
    preChew?: {
      readonly tried: string;
      readonly stillBroken: string;
    };
  };
  reporter: NodeId;
  setup: SetupOp[];
  resolved_when: Expr;
  sla_ticks: number;
  /**
   * What closing it is worth, and it is worth REPUTATION only.
   *
   * There used to be a `money` beside it, from 5 to 30 per ticket, and nothing
   * anywhere read it: resolution credit is archetype-weighted reputation
   * (`resolveCredit`), and the payslip pays a flat
   * `CLOSED_TICKET_BONUS_PENCE` per ticket closed that day (`daySlip`). A
   * difficult ticket's money could be edited from 30 to 5 and neither the
   * gameplay, the payslip nor a single golden would notice - content that
   * looked balanced and gated while being unable to affect anything. The flat
   * bonus is the shipped design, so the dead half of the pair is gone.
   */
  reward: {
    reputation: number;
  };
  kb_ref: string;
}

/* -- the op language ----------------------------------------------------- */

/** Where an op or a predicate finds the node it is talking about. */
export type NodeRefData =
  | { ref: 'target' | 'actor' }
  | { id: NodeId }
  | { param: string }
  | { bind: string };

export interface FieldRefData {
  node: NodeRefData;
  field: string;
}

/**
 * Moving a field by a whole number and holding the answer inside a range.
 *
 * The clamp is mandatory because every number the world keeps is a number
 * somebody reads back - a meter is 0-100, a fund is pence at or above zero -
 * so the bound is part of saying "add", not a decoration on it. The operand
 * has to be a form that could be a number: the engine refuses the rest at
 * registration rather than halfway through an apply.
 */
export interface ArithData extends FieldRefData {
  by: ValueData;
  clamp: { min: number; max: number };
}

/**
 * A value computed when an action applies. The `rng_*` and arithmetic forms
 * are only legal in `apply`: a validator that rolled dice would make replay a
 * fiction, and one that did arithmetic would have nowhere to put "that field
 * is not a number".
 */
export type ValueData =
  | { const: FieldValue }
  | { param: string }
  | { param_trim: string }
  | { now: true }
  | { field: FieldRefData }
  | { not_field: FieldRefData }
  | { append_line: FieldRefData & { value: ValueData } }
  | { rng_pick: FieldValue[] }
  | { rng_int: { min: number; max: number } }
  | { eq: [ValueData, ValueData] }
  | { add: ArithData }
  | { sub: ArithData };

/** A field name, or the parameter carrying one. */
export type FieldNameData = string | { param: string };

export type PredData =
  | { pred: 'target_missing' }
  | { pred: 'node_missing'; node: NodeRefData }
  | { pred: 'kind_is'; node: NodeRefData; kind: NodeKind }
  | { pred: 'field_eq'; node: NodeRefData; field: string; value: ValueData }
  | { pred: 'field_missing'; node: NodeRefData; field: string }
  | { pred: 'field_is_number'; node: NodeRefData; field: string }
  | { pred: 'field_is_bool'; node: NodeRefData; field: string }
  | { pred: 'field_at_least'; node: NodeRefData; field: string; value: number }
  | { pred: 'field_at_most'; node: NodeRefData; field: string; value: number }
  /**
   * One field at or above ANOTHER field, both read off the graph.
   *
   * Every other threshold this language can say is a constant, because every
   * other threshold in a world is one: a lockout is five attempts whoever is
   * typing. The probation bar is not. It starts at the published figure and is
   * raised by what is on the player's conduct file, so the comparison the
   * review's guards have to make is between two things the graph holds - and
   * doing it in a caller would put the decision that ends a run outside the
   * thing that replays it.
   */
  | {
    pred: 'field_at_least_field';
    node: NodeRefData;
    field: string;
    than: FieldRefData;
  }
  /**
   * A timestamp that is still recent: the field is a number and no more than
   * `ticks` have gone by since it was written. The window is the world's - the
   * engine has no opinion about what "today" means - but the clock is the
   * engine's, so a rule about the AGE of a stamp has to live here rather than
   * in whichever caller happened to think of it.
   */
  | { pred: 'field_within'; node: NodeRefData; field: string; ticks: number }
  | { pred: 'param_absent'; param: string }
  | { pred: 'param_string_missing'; param: string }
  | { pred: 'param_blank'; param: string }
  | { pred: 'param_int_in'; param: string; values: number[] }
  /**
   * A parameter that is a whole number the browser can hold exactly, at or
   * above `value`. The check a running total needs before it becomes world
   * state: everything else numeric reads a field, and `param_int_in` only
   * enumerates.
   */
  | { pred: 'param_is_whole_number'; param: string; value: number }
  | { pred: 'param_format'; param: string; format: 'resolution' }
  /**
   * Where the clock stands INSIDE a repeating period: `now % day_ticks` at or
   * below `value`. The engine knows nothing about shifts or closing time - the
   * period and the boundary are the world's - so this is how a rule about the
   * SHAPE of the day becomes a guard the engine enforces rather than a check
   * the one wired-up button happens to do first.
   */
  | { pred: 'tick_of_day_at_most'; day_ticks: number; value: number }
  | {
    pred: 'has_edge';
    from: NodeRefData;
    to: NodeRefData;
    kind: EdgeKind;
  }
  | {
    pred: 'neighbor_where';
    node: NodeRefData;
    direction: 'out' | 'in';
    edge_kind?: EdgeKind;
    matching: PredData;
    bind?: string;
  }
  | { pred: 'line_in_field'; node: NodeRefData; field: string; value: ValueData }
  /**
   * The same line, counted: a newline-separated field carries it at least
   * `times` times.
   *
   * `line_in_field` answers "has this happened", which is every question a
   * one-shot record has. A BUDGET is a different one - one line per spend, and
   * a rule that runs out - and counting it in a caller would put "how many are
   * left" outside the thing that replays the day. `times` is an expression
   * because the budget is per-entry data; a `times` that is not a whole number
   * at or above zero makes this TRUE, which is the refusing direction.
   */
  | {
    pred: 'line_count_at_least';
    node: NodeRefData;
    field: string;
    value: ValueData;
    times: ValueData;
  }
  | { pred: 'ticket_untracked'; node: NodeRefData }
  | {
    pred: 'resolution_refuses_field';
    node: NodeRefData;
    field: string;
    value: FieldValue;
  }
  | { pred: 'assert'; expr: Expr }
  | { pred: 'not'; of: PredData }
  | { pred: 'all'; of: PredData[] }
  | { pred: 'any'; of: PredData[] };

/**
 * One refusal. `reason` is a template the engine fills in with what the world
 * actually looks like: `{target.label}`, `{target.kind_label}`, `{v:rotation}`,
 * `{p:group.label}`, `{b:backlog.f:queue_len}`.
 */
export interface GuardData {
  when: PredData;
  reason: string;
}

export type OpData =
  | { op: 'set_field'; node: NodeRefData; field: FieldNameData; value: ValueData }
  | { op: 'clear_field'; node: NodeRefData; field: FieldNameData }
  | { op: 'add_edge'; from: NodeRefData; to: NodeRefData; kind: EdgeKind }
  | { op: 'remove_edge'; from: NodeRefData; to: NodeRefData; kind: EdgeKind }
  | { op: 'remove_node'; node: NodeRefData }
  | { op: 'set_waiting'; node: NodeRefData; waiting: boolean }
  /**
   * Starts or stops the clock every ticket's SLA is measured against. While it
   * is stopped, every unresolved deadline moves out a minute per minute - the
   * same mechanism a parked ticket uses, for the same reason. The engine knows
   * nothing about office hours; this is how a world tells it about them.
   */
  | { op: 'set_sla_clock'; running: boolean }
  | { op: 'when'; cond: PredData; ops: OpData[] };

export interface ActionData {
  id: string;
  tier: number;
  validate?: GuardData[];
  apply?: OpData[];
}

export interface ActionPayload {
  /** How a refusal names each node kind. The words are the world's, not the
   * engine's - it only knows which kind it is refusing. */
  kind_labels?: Partial<Record<NodeKind, string>>;
  actions: readonly ActionData[];
}

/* -- the handful of guards the view layer needs -------------------------- */

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string'
    && NODE_KINDS.some((kind) => kind === value);
}

export function isEdgeKind(value: unknown): value is EdgeKind {
  return typeof value === 'string'
    && EDGE_KINDS.some((kind) => kind === value);
}

export function isTicketState(value: unknown): value is TicketState {
  return typeof value === 'string'
    && TICKET_STATES.some((state) => state === value);
}

export function isFieldValue(value: unknown): value is FieldValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}
