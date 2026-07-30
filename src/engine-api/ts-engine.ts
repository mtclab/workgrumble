import { ActionRegistry, type ActionDef } from '../engine/actions';
import { evaluate } from '../engine/assertions';
import { SimClock } from '../engine/clock';
import { createEngineEventBus } from '../engine/events';
import { EntityGraph } from '../engine/graph';
import { createReadOnlyGraphView } from '../engine/graph-view';
import { createRng } from '../engine/rng';
import { TicketEngine } from '../engine/tickets';
import {
  EventFanOut,
  type EngineApi,
} from './engine-api';
import type {
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
 * The retired TypeScript engine behind the same interface, for the parity
 * harness ONLY - nothing in the shipped app may import this.
 *
 * It exists so the two implementations can be driven side by side: the Rust
 * core running the world's actions as DATA, this one running the original
 * closures. That comparison is the point. An adapter that interpreted the same
 * op language twice would only prove the interpreter agrees with itself.
 */
export class TsEngine implements EngineApi {
  private readonly bus = createEngineEventBus();
  private readonly clock = new SimClock();
  private readonly graphStore: EntityGraph;
  private readonly registry: ActionRegistry;
  private readonly tickets: TicketEngine;
  private readonly fanOut = new EventFanOut();
  private readonly registered = new Set<string>();
  private readonly view: ReadOnlyGraphView;

  private currentTier: number;

  public constructor(seed: number, tier = 1) {
    this.currentTier = tier;
    this.graphStore = new EntityGraph(this.bus);
    this.registry = new ActionRegistry(
      this.graphStore,
      createRng(seed),
      this.clock,
      tier,
    );
    // The ticket engine subscribes first, exactly as the session wires it, so
    // a ticket has already reacted by the time the event reaches a listener.
    this.tickets = new TicketEngine(this.graphStore, this.clock, this.bus);
    this.view = createReadOnlyGraphView(this.graphStore);

    this.bus.on('graph:mutated', (mutation) => {
      this.fanOut.emit([{ type: 'graph:mutated', mutation } as EngineEvent]);
    });
    this.bus.on('ticket:spawned', ({ id }) => {
      this.registered.add(id);
      this.fanOut.emit([{ type: 'ticket:spawned', id }]);
    });
    this.bus.on('ticket:resolved', ({ id }) => {
      this.fanOut.emit([{ type: 'ticket:resolved', id }]);
    });
    this.bus.on('ticket:breached', ({ id }) => {
      this.fanOut.emit([{ type: 'ticket:breached', id }]);
    });
    this.clock.onTick((tick) => {
      this.fanOut.tick(tick);
    });
  }

  public applySetup(ops: readonly SetupOp[]): void {
    for (const op of ops) {
      switch (op.op) {
        case 'addNode':
          this.graphStore.addNode(op.node);
          break;
        case 'setField':
          this.graphStore.setField(op.id, op.field, op.value);
          break;
        case 'addEdge':
          this.graphStore.addEdge(op.edge);
          break;
        case 'removeEdge':
          this.graphStore.removeEdge(op.edge);
          break;
      }
    }
  }

  public registerActions(): void {
    throw new Error(
      'The retired engine runs action closures, not action data. '
      + 'Use registerActionDefs in the parity harness.',
    );
  }

  /** How the parity harness installs the original closure definitions. */
  public registerActionDefs(definitions: readonly ActionDef[]): void {
    for (const definition of definitions) {
      this.registry.register(definition);
    }
  }

  public registerTicket(def: TicketDef): void {
    this.tickets.spawn(def);
  }

  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult {
    return this.registry.dispatch(id, actor, target, params);
  }

  public setTier(tier: number): void {
    this.registry.setTier(tier);
    this.currentTier = tier;
  }

  /** The registry keeps its tier private, so the adapter mirrors it. */
  public tier(): number {
    return this.currentTier;
  }

  public advance(ticks: number): void {
    this.clock.advance(ticks);
  }

  public now(): number {
    return this.clock.now();
  }

  public get graph(): ReadOnlyGraphView {
    return this.view;
  }

  public evaluate(expr: Expr): boolean {
    return evaluate(this.graphStore, expr);
  }

  public snapshotHash(): string {
    return this.graphStore.snapshotHash();
  }

  public dispatchLog(): readonly DispatchLogEntry[] {
    return this.registry.log.map((entry) => ({ ...entry }));
  }

  public ticketState(id: NodeId): TicketState | undefined {
    return this.registered.has(id) ? this.tickets.getState(id) : undefined;
  }

  public isTicketRegistered(id: NodeId): boolean {
    return this.registered.has(id);
  }

  public wasTicketBreached(id: NodeId): boolean {
    return this.registered.has(id) && this.tickets.wasBreached(id);
  }

  public setWaiting(id: NodeId, waiting: boolean): void {
    this.tickets.setWaiting(id, waiting);
  }

  public onEvent(listener: (event: EngineEvent) => void): () => void {
    return this.fanOut.onEvent(listener);
  }

  public onTick(listener: (tick: number) => void): () => void {
    return this.fanOut.onTick(listener);
  }

  public serialize(): string {
    throw new Error('The retired engine has no save seam.');
  }

  public restore(): void {
    throw new Error('The retired engine has no save seam.');
  }

  /** The ticket engine, for the suites that drove it directly. */
  public get ticketEngine(): TicketEngine {
    return this.tickets;
  }
}
