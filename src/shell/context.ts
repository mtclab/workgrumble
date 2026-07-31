import type { DispatchResult } from '../engine-api';
import type { FieldValue, NodeId } from '../engine-api';
import type { ReadOnlyGraphView } from '../engine-api';
import type { AppStateStore } from './app-state';
import type { AppDef } from './apps/types';
import type { DayApi } from './day-driver';
import type { ShellSessionApi } from './save';

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
  readonly graph: ReadOnlyGraphView;
  readonly clock: ShellClock;
  readonly user: ShellUser;
  /** What the apps were showing: outlives their windows, part of the save. */
  readonly appState: AppStateStore;
  /** The shift: what day it is, what state it is in, and the two verbs. */
  readonly day: DayApi;
  readonly session: ShellSessionApi;
  dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;
  /**
   * Fires after the world graph changed, whoever changed it. An app that has
   * to stay truthful (a ticket queue, a directory listing) repaints from this
   * instead of only repainting the window that happened to dispatch.
   */
  onWorldChange(listener: () => void): () => void;
}
