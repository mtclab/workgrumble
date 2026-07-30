import type {
  ActionPayload,
  DispatchLogEntry,
  DispatchResult,
  EngineEvent,
  Expr,
  FieldValue,
  NodeId,
  ReadOnlyGraphView,
  SetupOp,
  TicketDef,
  TicketState,
} from './types';

/**
 * What the shell and the world are allowed to ask of the engine.
 *
 * One interface, two implementations: the Rust core through wasm (what ships)
 * and the retired TypeScript engine (parity harness only). Everything is
 * synchronous - the wasm module is initialised once at boot and every call
 * after that is a plain function call.
 */
export interface EngineApi {
  /** Seeds the world. A refusal here is a content bug, so it throws. */
  applySetup(ops: readonly SetupOp[]): void;
  /** Installs the verb set. Also a content bug when it fails. */
  registerActions(payload: ActionPayload): void;
  registerTicket(def: TicketDef): void;

  dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;

  setTier(tier: number): void;
  tier(): number;

  advance(ticks: number): void;
  now(): number;

  readonly graph: ReadOnlyGraphView;
  evaluate(expr: Expr): boolean;
  snapshotHash(): string;
  dispatchLog(): readonly DispatchLogEntry[];

  ticketState(id: NodeId): TicketState | undefined;
  isTicketRegistered(id: NodeId): boolean;
  wasTicketBreached(id: NodeId): boolean;
  /** Parks or un-parks a ticket directly. Actions do this through an op; the
   * method exists for tests and for the engine-level ticket suites. */
  setWaiting(id: NodeId, waiting: boolean): void;

  /** Every engine event, in the order it happened. */
  onEvent(listener: (event: EngineEvent) => void): () => void;
  /** Fires once per simulation tick, after that tick's events. */
  onTick(listener: (tick: number) => void): () => void;

  serialize(): string;
  restore(state: string): void;
}

/**
 * A shared fan-out for both adapters. Listeners are copied before dispatch so
 * an app that unsubscribes while being notified does not skip its neighbour.
 */
export class EventFanOut {
  private readonly eventListeners = new Set<(event: EngineEvent) => void>();
  private readonly tickListeners = new Set<(tick: number) => void>();

  public onEvent(listener: (event: EngineEvent) => void): () => void {
    return subscribe(this.eventListeners, listener);
  }

  public onTick(listener: (tick: number) => void): () => void {
    return subscribe(this.tickListeners, listener);
  }

  public emit(events: readonly EngineEvent[]): void {
    for (const event of events) {
      for (const listener of [...this.eventListeners]) {
        listener(event);
      }
    }
  }

  public tick(tick: number): void {
    for (const listener of [...this.tickListeners]) {
      listener(tick);
    }
  }
}

function subscribe<Listener>(
  listeners: Set<Listener>,
  listener: Listener,
): () => void {
  listeners.add(listener);
  let subscribed = true;

  return () => {
    if (!subscribed) {
      return;
    }

    subscribed = false;
    listeners.delete(listener);
  };
}

/** The read-only view the shell holds, over whichever engine is installed. */
export function createGraphView(engine: EngineApi): ReadOnlyGraphView {
  return engine.graph;
}
