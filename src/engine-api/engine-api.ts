import type {
  ActionPayload,
  CheckpointOutcome,
  DispatchLogEntry,
  DispatchResult,
  EngineEvent,
  Expr,
  FieldValue,
  LogCheckpoint,
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
  /**
   * A stretch of time nobody is at the desk, converted in one go.
   *
   * A night is nine hundred minutes and the world does exactly one thing in
   * each of them: every unresolved deadline moves out by a minute and the
   * counter behind it goes up by one. Announced minute by minute, that is nine
   * hundred tick fan-outs and tens of thousands of mutation events, and every
   * open window repaints on all of them - which is the whole of the measured
   * delay between clocking off and seeing tomorrow morning.
   *
   * So it is one core call, no intermediate fan-out, and one tick at the end.
   * It is legal ONLY while the service clock is held, and that is the load-
   * bearing half: with the clock held no deadline can be crossed, so no ticket
   * can breach, resolve or spawn - the events a listener timestamps with
   * `now()` cannot happen, and there is nothing whose honest minute could be
   * lost. Anything else in the batch is a broken assumption rather than a
   * quiet coalesce, and this throws rather than swallowing it.
   */
  advanceOffHours(ticks: number): void;
  now(): number;
  /**
   * Whether the ticks going past are ticks a service level counts. It is world
   * state - a save carries it - and the only thing that moves it is a
   * dispatched verb, so the day driver reads it to find out whether the engine
   * still agrees with the day it has just loaded, replayed or booted into.
   */
  slaRunning(): boolean;

  readonly graph: ReadOnlyGraphView;
  evaluate(expr: Expr): boolean;
  snapshotHash(): string;
  dispatchLog(): readonly DispatchLogEntry[];
  /**
   * Makes this moment the baseline the dispatch log is measured from, and
   * drains everything recorded before it. The day loop calls this at a day
   * boundary - the one point where the history behind it is finished with,
   * because the day has been scored and paid.
   */
  checkpoint(): CheckpointOutcome;
  /** The baseline a save would be carried against right now. */
  logCheckpoint(): LogCheckpoint;

  ticketState(id: NodeId): TicketState | undefined;
  wasTicketBreached(id: NodeId): boolean;

  /** Every engine event, in the order it happened. */
  onEvent(listener: (event: EngineEvent) => void): () => void;
  /** Fires once per simulation tick, after that tick's events. */
  onTick(listener: (tick: number) => void): () => void;

  serialize(): string;
  restore(state: string): void;
}

/**
 * A shared fan-out for the adapter. Listeners are copied before delivery so an
 * app that unsubscribes while being notified does not skip its neighbour.
 *
 * Two things listeners do that a plain loop cannot survive:
 *
 * - One of them dispatches. That produces events which, delivered immediately,
 *   would reach the listeners AFTER this one before the event they are still
 *   waiting for - a consequence arriving before its cause, for half the room.
 *   So a nested emit joins the back of the queue the current drain is working
 *   through, and causal order holds for everybody.
 * - One of them throws. Every listener after it used to lose the event
 *   entirely: one app's bad repaint silently froze another app. Every listener
 *   is called, the failures are collected, and the aggregate is thrown once
 *   delivery is complete.
 */
export class EventFanOut {
  private readonly eventListeners = new Set<(event: EngineEvent) => void>();
  private readonly tickListeners = new Set<(tick: number) => void>();
  private readonly queue: EngineEvent[] = [];
  private draining = false;

  public onEvent(listener: (event: EngineEvent) => void): () => void {
    return subscribe(this.eventListeners, listener);
  }

  public onTick(listener: (tick: number) => void): () => void {
    return subscribe(this.tickListeners, listener);
  }

  public emit(events: readonly EngineEvent[]): void {
    this.queue.push(...events);

    if (this.draining) {
      // A listener is emitting while being notified. Its events are queued
      // behind the batch in flight and the drain already running delivers
      // them; returning here is what keeps cause before consequence.
      return;
    }

    this.draining = true;
    const failures: unknown[] = [];

    try {
      for (
        let event = this.queue.shift();
        event !== undefined;
        event = this.queue.shift()
      ) {
        for (const listener of [...this.eventListeners]) {
          try {
            listener(event);
          } catch (failure: unknown) {
            failures.push(failure);
          }
        }
      }
    } finally {
      this.draining = false;
      // A drain that ends badly must not leave a queue for the next emit to
      // deliver out of nowhere.
      this.queue.length = 0;
    }

    throwFailures(failures, 'events');
  }

  public tick(tick: number): void {
    const failures: unknown[] = [];

    for (const listener of [...this.tickListeners]) {
      try {
        listener(tick);
      } catch (failure: unknown) {
        failures.push(failure);
      }
    }

    throwFailures(failures, 'the tick');
  }
}

/** Reports listener failures once everybody has been told. */
function throwFailures(failures: readonly unknown[], what: string): void {
  if (failures.length === 0) {
    return;
  }

  throw new AggregateError(
    failures,
    `${String(failures.length)} listener(s) failed handling ${what}.`,
  );
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
