import type { SimClock } from './clock';
import { EntityGraph, type NodeId } from './graph';
import type { Rng } from './rng';
import {
  EDGE_KINDS,
  type FieldValue,
  NODE_KINDS,
} from './schema';

export interface ActionContext {
  graph: EntityGraph;
  rng: Rng;
  actor: NodeId;
  target: NodeId | null;
  params: Record<string, FieldValue>;
}

export interface ActionDef {
  id: string;
  tier: number;
  validate(context: ActionContext): string | null;
  apply(context: ActionContext): void;
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

function cloneLogEntry(entry: Readonly<DispatchLogEntry>): DispatchLogEntry {
  const base = {
    tick: entry.tick,
    id: entry.id,
    actor: entry.actor,
    target: entry.target,
    params: { ...entry.params },
    ok: entry.ok,
  };

  return entry.reason === undefined
    ? base
    : { ...base, reason: entry.reason };
}

export class ActionRegistry {
  private readonly actions = new Map<string, ActionDef>();
  private readonly dispatchLog: DispatchLogEntry[] = [];
  private tier: number;

  public constructor(
    private readonly graph: EntityGraph,
    private readonly rng: Rng,
    private readonly clock: SimClock,
    initialTier = 1,
  ) {
    this.tier = this.validateTier(initialTier);
  }

  public get log(): readonly DispatchLogEntry[] {
    return this.dispatchLog.map(cloneLogEntry);
  }

  public register(definition: ActionDef): void {
    if (definition.id.length === 0) {
      throw new TypeError('Action id must be a non-empty string.');
    }

    this.validateTier(definition.tier);

    if (this.actions.has(definition.id)) {
      throw new Error(`Action "${definition.id}" is already registered.`);
    }

    this.actions.set(definition.id, { ...definition });
  }

  public setTier(tier: number): void {
    this.tier = this.validateTier(tier);
  }

  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult {
    const tick = this.clock.now();
    const definition = this.actions.get(id);

    if (definition === undefined) {
      return this.reject(
        tick,
        id,
        actor,
        target,
        params,
        `Unknown action "${id}".`,
      );
    }

    if (definition.tier > this.tier) {
      return this.reject(
        tick,
        id,
        actor,
        target,
        params,
        `Action "${id}" requires tier ${String(definition.tier)}.`,
      );
    }

    const context: ActionContext = {
      graph: this.createValidationGraph(),
      rng: this.rng,
      actor,
      target,
      params: { ...params },
    };
    const validationReason = definition.validate(context);

    if (validationReason !== null) {
      return this.reject(
        tick,
        id,
        actor,
        target,
        params,
        validationReason,
      );
    }

    context.graph = this.graph;
    definition.apply(context);
    this.dispatchLog.push({
      tick,
      id,
      actor,
      target,
      params: { ...params },
      ok: true,
    });
    return { ok: true };
  }

  public replay(entries: readonly DispatchLogEntry[]): void {
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.tick) || entry.tick < this.clock.now()) {
        throw new Error('Replay ticks must be ordered safe integers.');
      }

      this.clock.advance(entry.tick - this.clock.now());

      if (this.clock.now() !== entry.tick) {
        throw new Error('Clock did not reach the replay entry tick.');
      }

      const result = this.dispatch(
        entry.id,
        entry.actor,
        entry.target,
        entry.params,
      );

      if (result.ok !== entry.ok) {
        throw new Error(`Replay diverged for action "${entry.id}".`);
      }

      if (!result.ok && result.reason !== entry.reason) {
        throw new Error(`Replay reason diverged for action "${entry.id}".`);
      }
    }
  }

  private reject(
    tick: number,
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
    reason: string,
  ): DispatchResult {
    this.dispatchLog.push({
      tick,
      id,
      actor,
      target,
      params: { ...params },
      ok: false,
      reason,
    });
    return { ok: false, reason };
  }

  private createValidationGraph(): EntityGraph {
    const validationGraph = new EntityGraph();

    for (const kind of NODE_KINDS) {
      for (const node of this.graph.nodesOfKind(kind)) {
        validationGraph.addNode(node);
      }
    }

    for (const kind of NODE_KINDS) {
      for (const node of this.graph.nodesOfKind(kind)) {
        for (const edgeKind of EDGE_KINDS) {
          for (
            const neighbor of this.graph.neighbors(
              node.id,
              { direction: 'out', edgeKind },
            )
          ) {
            validationGraph.addEdge({
              from: node.id,
              to: neighbor.id,
              kind: edgeKind,
            });
          }
        }
      }
    }

    return validationGraph;
  }

  private validateTier(tier: number): number {
    if (!Number.isSafeInteger(tier) || tier < 0) {
      throw new TypeError('Action tier must be a non-negative safe integer.');
    }

    return tier;
  }
}
