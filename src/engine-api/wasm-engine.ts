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
  DispatchLogEntry,
  DispatchResult,
  EngineEvent,
  Expr,
  FieldValue,
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

let loaded = false;

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

    this.core = new Core(seed >>> 0);
    this.view = this.createView();
  }

  public applySetup(ops: readonly SetupOp[]): void {
    this.expect(this.core.apply_setup(JSON.stringify(ops)));
  }

  public registerActions(payload: ActionPayload): void {
    this.expect(this.core.register_actions(JSON.stringify(payload)));
  }

  public registerTicket(def: TicketDef): void {
    this.expect(this.core.spawn_ticket(JSON.stringify(def)));
  }

  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult {
    const answer = parseAnswer(this.core.dispatch(JSON.stringify({
      action: id,
      actor,
      target,
      params,
    })));
    this.fanOut.emit(answer.events ?? []);

    return answer.ok
      ? { ok: true }
      : { ok: false, reason: answer.reason ?? 'The engine refused without saying why.' };
  }

  public setTier(tier: number): void {
    this.expect(this.core.set_tier(tier));
  }

  public tier(): number {
    return this.core.tier();
  }

  /**
   * One tick at a time, so a tick's events land before that tick is announced
   * - the ticket engine has already reacted by the time an app repaints.
   */
  public advance(ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new TypeError('Clock advance must be a non-negative safe integer.');
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

  public now(): number {
    return this.core.now();
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

  public restore(state: string): void {
    this.expect(this.core.restore(state));
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
    const answer = parseAnswer(this.core.query(JSON.stringify(request)));

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

function freezeNode(node: ReadOnlyGraphNode): ReadOnlyGraphNode {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    fields: Object.freeze({ ...node.fields }),
  });
}
