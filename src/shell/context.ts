import type { DispatchResult } from '../engine/actions';
import type { FieldValue, NodeId } from '../engine/graph';
import type { AppDef } from './apps/types';
import type { ReadonlyGraph } from './graph-view';

/**
 * The slice of the engine clock the shell is allowed to see: it may read
 * simulation time and observe ticks, never advance or pause the simulation.
 * `SimClock` satisfies this structurally.
 */
export interface ShellClock {
  now(): number;
  onTick(listener: (tick: number) => void): () => void;
}

export interface ShellUser {
  readonly displayName: string;
  readonly account: string;
  readonly passwordHint: string;
  /** Graph node the shell dispatches actions as. */
  readonly node: NodeId;
}

/**
 * Everything the view layer receives from the wiring in `main.ts`. There is no
 * writable graph handle here by design: the shell mutates the world only by
 * dispatching registered actions.
 */
export interface ShellContext {
  readonly manifest: readonly AppDef[];
  readonly tier: number;
  readonly graph: ReadonlyGraph;
  readonly clock: ShellClock;
  readonly user: ShellUser;
  dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;
}
