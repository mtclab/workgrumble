import type { SimClock } from './clock';
import {
  createReadOnlyGraphView,
  type ReadOnlyGraphView,
} from './graph-view';
import type { EntityGraph, NodeId } from './graph';
import type { Rng } from './rng';
import type { FieldValue } from './schema';

/** The slice of the clock an action may see: simulation time, read-only. */
export interface ActionClock {
  now(): number;
}

interface BaseActionContext {
  readonly rng: Rng;
  readonly actor: NodeId;
  readonly target: NodeId | null;
  readonly params: Record<string, FieldValue>;
  readonly clock: ActionClock;
}

/**
 * What a validator gets. Identical to `ActionContext` except that the graph is
 * the read-only view: refusing is a pure decision, so the type makes the write
 * methods unreachable and the frozen view makes them unreachable at runtime.
 */
export interface ValidationContext extends BaseActionContext {
  readonly graph: ReadOnlyGraphView;
}

/** What `apply` gets: the real, writable world graph. */
export interface ActionContext extends BaseActionContext {
  readonly graph: EntityGraph;
}

export interface ActionDef {
  id: string;
  tier: number;
  validate(context: ValidationContext): string | null;
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
  private readonly actionClock: ActionClock;
  private tier: number;

  public constructor(
    private readonly graph: EntityGraph,
    private readonly rng: Rng,
    private readonly clock: SimClock,
    initialTier = 1,
  ) {
    this.tier = this.validateTier(initialTier);
    this.actionClock = Object.freeze({ now: () => this.clock.now() });
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

    const validationReason = definition.validate({
      graph: createReadOnlyGraphView(this.graph),
      rng: this.rng,
      actor,
      target,
      params: { ...params },
      clock: this.actionClock,
    });

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

    definition.apply({
      graph: this.graph,
      rng: this.rng,
      actor,
      target,
      params: { ...params },
      clock: this.actionClock,
    });
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

  private validateTier(tier: number): number {
    if (!Number.isSafeInteger(tier) || tier < 0) {
      throw new TypeError('Action tier must be a non-negative safe integer.');
    }

    return tier;
  }
}
