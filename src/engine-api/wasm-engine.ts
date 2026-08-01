import initWasm, {
  Engine as Core,
  initSync,
} from '../../core-rs/pkg/core_rs.js';
import {
  EventFanOut,
  type EngineApi,
} from './engine-api';
import type {
  ActionPayload,
  CheckpointOutcome,
  DispatchLogEntry,
  DispatchResult,
  EngineEvent,
  Expr,
  FieldValue,
  LogCheckpoint,
  NeighborOptions,
  NodeId,
  NodeKind,
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  SetupOp,
  TicketDef,
  TicketState,
} from './types';
import { TICKET_STATES } from './types';

interface EngineAnswer {
  ok: boolean;
  reason?: string;
  events?: EngineEvent[];
  value?: unknown;
}

/** The most ticks one `advance` may ask for. Mirrors `clock::MAX_ADVANCE_TICKS`. */
const MAX_ADVANCE_TICKS = 1_000_000;
/** The seed space of the generator: a `u32`, exactly. */
const MAX_SEED = 0xffff_ffff;

let loaded = false;

/**
 * Input the engine will not be asked to make sense of.
 *
 * The wasm glue COERCES: an `Infinity` seed becomes 0, a tier of `1.5` becomes
 * 1, and a `NaN` anywhere becomes something arbitrary and quiet. By the time
 * Rust sees the value there is nothing wrong with it, so the refusal has to
 * happen on this side of the call, before the number is bent into a shape the
 * engine finds reasonable.
 */
export class EngineInputError extends TypeError {
  public constructor(message: string) {
    super(message);
    this.name = 'EngineInputError';
  }
}

/**
 * Whether a string is something the engine can be handed intact.
 *
 * A lone surrogate is a legal JavaScript string and not legal JSON text:
 * encoding it replaces it with U+FFFD, so a save round-tripping through the
 * boundary would come back subtly different from the one that went in - and
 * the hash with it. `String.prototype.isWellFormed` says this in one call and
 * is newer than this project's target, so the scan is written out.
 */
function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit < 0xd800 || unit > 0xdfff) {
      continue;
    }

    // A trailing surrogate here has nothing in front of it, and a leading one
    // needs a trailing one directly after it.
    if (unit > 0xdbff) {
      return false;
    }

    const next = value.charCodeAt(index + 1);

    if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
      return false;
    }

    index += 1;
  }

  return true;
}

/**
 * The one way anything is encoded for the engine.
 *
 * `JSON.stringify` turns `Infinity` and `NaN` into `null` without a word, and
 * `null` is a legitimate field value - so a queue length of `Infinity` arrived
 * as a queue length of "nothing in particular" and the schema took it. Every
 * payload goes through this replacer instead, and a number the engine could
 * not have meant is a refusal rather than a quiet null.
 */
function encode(payload: unknown): string {
  const encoded = JSON.stringify(payload, (_key: string, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new EngineInputError(
        `The engine takes finite numbers; ${String(value)} is not one.`,
      );
    }

    if (typeof value === 'string' && !isWellFormedUtf16(value)) {
      throw new EngineInputError(
        'The engine takes well-formed text; this string carries an unpaired '
        + 'surrogate.',
      );
    }

    return value;
  });

  if (encoded === undefined) {
    throw new EngineInputError('There is nothing here to send to the engine.');
  }

  return encoded;
}

/** A number the engine will read back as exactly the number that was sent. */
function requireSafeInteger(
  value: number,
  what: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new EngineInputError(
      `${what} must be a whole number between ${String(minimum)} and `
      + `${String(maximum)}; got ${String(value)}.`,
    );
  }
}

/**
 * Loads the wasm module. In the browser this is a same-origin fetch of the
 * asset Vite emits next to the bundle; in a test it is the bytes read off
 * disk, so no suite ever needs a network.
 */
export async function loadEngine(): Promise<void> {
  if (loaded) {
    return;
  }

  await initWasm();
  loaded = true;
}

export function loadEngineFromBytes(bytes: BufferSource): void {
  if (loaded) {
    return;
  }

  initSync({ module: bytes });
  loaded = true;
}

function parseAnswer(payload: string): EngineAnswer {
  const parsed: unknown = JSON.parse(payload);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The engine answered with something that is not an object.');
  }

  return parsed as EngineAnswer;
}

function isTicketState(value: unknown): value is TicketState {
  return typeof value === 'string'
    && TICKET_STATES.some((state) => state === value);
}

/**
 * The shipped engine: the Rust core behind the `EngineApi` the shell talks to.
 *
 * Every call is JSON across the boundary and every mutation comes back as an
 * ordered list of events, which this adapter fans out to whoever subscribed -
 * the shell's `onWorldChange`, the notification hooks, the ticket queue.
 */
export class WasmEngine implements EngineApi {
  private readonly core: Core;
  private readonly fanOut = new EventFanOut();
  private readonly view: ReadOnlyGraphView;

  public constructor(seed: number) {
    if (!loaded) {
      throw new Error(
        'The engine module has not been loaded. Call loadEngine() first.',
      );
    }

    // Not `seed >>> 0`: that turns every wrong seed into a plausible one, and
    // a world seeded by a coercion is a world nobody asked for.
    requireSafeInteger(seed, 'The engine seed', 0, MAX_SEED);
    this.core = new Core(seed);
    this.view = this.createView();
  }

  public applySetup(ops: readonly SetupOp[]): void {
    this.expect(this.core.apply_setup(encode(ops)));
  }

  public registerActions(payload: ActionPayload): void {
    this.expect(this.core.register_actions(encode(payload)));
  }

  public registerTicket(def: TicketDef): void {
    this.expect(this.core.spawn_ticket(encode(def)));
  }

  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult {
    // A dispatch is something a player did, so bad input is a refusal they can
    // read rather than an exception that takes the window with it.
    let payload: string;

    try {
      payload = encode({
        action: id,
        actor,
        target,
        params,
      });
    } catch (failure: unknown) {
      if (failure instanceof EngineInputError) {
        return { ok: false, reason: failure.message };
      }

      throw failure;
    }

    const answer = parseAnswer(this.core.dispatch(payload));
    this.fanOut.emit(answer.events ?? []);

    return answer.ok
      ? { ok: true }
      : { ok: false, reason: answer.reason ?? 'The engine refused without saying why.' };
  }

  public setTier(tier: number): void {
    requireSafeInteger(tier, 'A tier', 0, Number.MAX_SAFE_INTEGER);
    this.expect(this.core.set_tier(tier));
  }

  public tier(): number {
    return this.core.tier();
  }

  /**
   * One tick at a time, so a tick's events land before that tick is announced
   * - the ticket engine has already reacted by the time an app repaints.
   *
   * The ceiling is the whole point of the check. This loop is synchronous, so
   * `Number.MAX_SAFE_INTEGER` ticks is not a long wait, it is a frozen tab;
   * a million is more simulated time than any caller wants and still returns.
   */
  public advance(ticks: number): void {
    requireSafeInteger(ticks, 'Clock advance', 0, MAX_ADVANCE_TICKS);

    if (this.core.now() + ticks > Number.MAX_SAFE_INTEGER) {
      throw new EngineInputError(
        'Clock advance would take the tick count past the safe integer range.',
      );
    }

    for (let elapsed = 0; elapsed < ticks; elapsed += 1) {
      const before = this.core.now();
      this.expect(this.core.advance(1));
      const now = this.core.now();

      if (now === before) {
        // The clock is paused; nothing further will move.
        break;
      }

      this.fanOut.tick(now);
    }
  }

  /**
   * The night, in one call.
   *
   * See `EngineApi.advanceOffHours` for why this is safe and why it is not a
   * general-purpose batch: the held service clock is what guarantees the only
   * mutations in the batch are the deadline-and-counter pairs the tick handler
   * writes, and those are the ones nobody stamps a time onto. Every other
   * event carries a minute that would be reported as this one, so finding one
   * here is a broken assumption and is thrown rather than coalesced away.
   */
  public advanceOffHours(ticks: number): void {
    requireSafeInteger(ticks, 'Clock advance', 0, MAX_ADVANCE_TICKS);

    if (ticks === 0) {
      return;
    }

    if (this.slaRunning()) {
      throw new Error(
        'Off-hours advance was asked for while the service clock is running. '
        + 'Those are minutes somebody is being paid for, and they are lived '
        + 'one at a time.',
      );
    }

    const before = this.core.now();
    const answer = parseAnswer(this.core.advance(ticks));

    if (!answer.ok) {
      throw new Error(answer.reason ?? 'The engine refused without saying why.');
    }

    const refusal = offHoursRefusal(answer.events ?? []);

    if (refusal !== null) {
      throw new Error(refusal);
    }

    if (this.core.now() !== before) {
      this.fanOut.tick(this.core.now());
    }
  }

  public now(): number {
    return this.core.now();
  }

  public slaRunning(): boolean {
    return this.query({ kind: 'sla_running' }) === true;
  }

  public get graph(): ReadOnlyGraphView {
    return this.view;
  }

  public evaluate(expr: Expr): boolean {
    return this.query({ kind: 'evaluate_expr', expr }) === true;
  }

  public snapshotHash(): string {
    return this.core.snapshot_hash();
  }

  public dispatchLog(): readonly DispatchLogEntry[] {
    return JSON.parse(this.core.dispatch_log()) as DispatchLogEntry[];
  }

  /**
   * Draws the line the log is measured from. Nothing about the world moves,
   * so there is nothing to repaint - but the answer says how much history was
   * dropped, which is the one thing a caller cannot find out afterwards.
   */
  public checkpoint(): CheckpointOutcome {
    const answer = parseAnswer(this.core.checkpoint());
    this.fanOut.emit(answer.events ?? []);

    if (!answer.ok) {
      throw new Error(answer.reason ?? 'The engine refused the checkpoint.');
    }

    return answer.value as CheckpointOutcome;
  }

  public logCheckpoint(): LogCheckpoint {
    return this.query({ kind: 'checkpoint' }) as LogCheckpoint;
  }

  public ticketState(id: NodeId): TicketState | undefined {
    const state = this.query({ kind: 'ticket_state', id });
    return isTicketState(state) ? state : undefined;
  }

  public wasTicketBreached(id: NodeId): boolean {
    return this.query({ kind: 'ticket_breached', id }) === true;
  }

  public onEvent(listener: (event: EngineEvent) => void): () => void {
    return this.fanOut.onEvent(listener);
  }

  public onTick(listener: (tick: number) => void): () => void {
    return this.fanOut.onTick(listener);
  }

  public serialize(): string {
    return this.core.serialize();
  }

  /**
   * Loads a saved world, and says so.
   *
   * The graph, the clock and every ticket have just been replaced wholesale.
   * No mutation caused that, so no mutation event describes it: the engine
   * emits `world:restored`, and the clock listeners are told too, because an
   * app showing the previous session's time until the next tick is showing the
   * wrong session.
   */
  public restore(state: string): void {
    if (!isWellFormedUtf16(state)) {
      throw new EngineInputError(
        'That save carries an unpaired surrogate; it is not the text it was '
        + 'saved as.',
      );
    }

    this.expect(this.core.restore(state));
    this.fanOut.tick(this.core.now());
  }

  /** Emits whatever happened, and turns a refusal into a thrown content bug. */
  private expect(payload: string): void {
    const answer = parseAnswer(payload);
    this.fanOut.emit(answer.events ?? []);

    if (!answer.ok) {
      throw new Error(answer.reason ?? 'The engine refused without saying why.');
    }
  }

  private query(request: Record<string, unknown>): unknown {
    const answer = parseAnswer(this.core.query(encode(request)));

    if (!answer.ok) {
      throw new Error(answer.reason ?? 'The engine refused the query.');
    }

    return answer.value;
  }

  private createView(): ReadOnlyGraphView {
    const nodes = (value: unknown): readonly ReadOnlyGraphNode[] => Object.freeze(
      (value as ReadOnlyGraphNode[]).map(freezeNode),
    );

    return Object.freeze({
      getNode: (id: NodeId) => {
        const node = this.query({ kind: 'get_node', id });
        return node === null ? undefined : freezeNode(node as ReadOnlyGraphNode);
      },
      // A field that is not there comes back with no value at all, which is
      // how "missing" stays distinguishable from a field holding null.
      getField: (id: NodeId, field: string) => this.query({
        kind: 'get_field',
        id,
        field,
      }) as FieldValue | undefined,
      nodesOfKind: (kind: NodeKind) => nodes(
        this.query({ kind: 'nodes_of_kind', node_kind: kind }),
      ),
      allNodes: () => nodes(this.query({ kind: 'all_nodes' })),
      neighbors: (id: NodeId, options: Readonly<NeighborOptions>) => nodes(
        this.query({
          kind: 'neighbors',
          id,
          direction: options.direction,
          ...(options.edgeKind === undefined
            ? {}
            : { edge_kind: options.edgeKind }),
        }),
      ),
    });
  }
}

/**
 * The three fields a held clock moves, and nothing else.
 *
 * They are named here rather than imported from the world because they are the
 * ENGINE's: the tick handler in `world.rs` writes exactly these, and the point
 * of this list is to notice the day one of them stops being the only thing an
 * off-hours minute does.
 */
const OFF_HOURS_FIELDS: ReadonlySet<string> = new Set([
  'sla_deadline',
  'off_hours_ticks',
  'held_ticks',
]);

/**
 * Fields the night is FORBIDDEN to touch, named one at a time.
 *
 * The allowlist above already refuses everything that is not one of its three,
 * so this list changes no verdict - it changes the SENTENCE, and that is the
 * whole of its job. "One event happened during an off-hours advance" is a
 * sentence somebody debugs for an hour; "an interruption fired at 03:40" is a
 * sentence that names the mechanic that broke the rule.
 *
 * It also makes the rule greppable in the direction it actually gets broken.
 * The tempting fix for "my new field trips the off-hours guard" is to add that
 * field to `OFF_HOURS_FIELDS`, which weakens the guard silently; a field named
 * here cannot be added there without deleting a line that says, in words, why
 * it must not be. Interruptions are the first entries because they are the
 * first mechanic with a schedule of its own: nobody rings at four in the
 * morning, and a world that let one through would be quietly telling the
 * player it had happened at nine.
 */
const OFF_HOURS_FORBIDDEN: Readonly<Record<string, string>> = {
  refocus_until: 'an interruption ended and started the player looking for '
    + 'their place again',
  interruption_answered: 'an interruption was answered',
  interruption_deferred: 'an interruption was pushed back',
  interruption_declined: 'an interruption was refused',
  interruption_missed: 'a phone rang out with nobody at the desk',
  meeting_recap_at: 'a meeting finished and somebody minuted it',
};

function isOffHoursCounterEvent(event: Readonly<EngineEvent>): boolean {
  return event.type === 'graph:mutated'
    && event.mutation.type === 'field:set'
    && OFF_HOURS_FIELDS.has(event.mutation.field);
}

/**
 * Whether a batch of off-hours events is allowed to have happened, and what to
 * say when it is not. Null is "the night was silent, as nights are".
 *
 * Exported because it is the guard's whole decision and a decision nothing can
 * call is a decision nothing can test: the engine emits these events from its
 * own tick handler, so the only honest way to plant an interruption in the
 * forbidden window is to hand the classifier the event the interruption would
 * have produced.
 */
export function offHoursRefusal(
  events: readonly Readonly<EngineEvent>[],
): string | null {
  for (const event of events) {
    if (event.type !== 'graph:mutated' || event.mutation.type !== 'field:set') {
      continue;
    }

    const forbidden = OFF_HOURS_FORBIDDEN[event.mutation.field];

    if (forbidden !== undefined) {
      return `The night was interrupted: ${forbidden}, at a minute nobody was `
        + 'at the desk for. Off-hours minutes are lived in one batch, so the '
        + 'whole of it would be reported as having happened at the end of the '
        + `night - and "${event.mutation.field}" is not a field a night may `
        + 'write.';
    }
  }

  const unexpected = events.filter((event) => !isOffHoursCounterEvent(event));

  return unexpected.length > 0
    ? `${String(unexpected.length)} event(s) happened during an off-hours `
      + 'advance. Coalescing them would report every one of them as having '
      + 'happened at the end of the night.'
    : null;
}

function freezeNode(node: ReadOnlyGraphNode): ReadOnlyGraphNode {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    fields: Object.freeze({ ...node.fields }),
  });
}
