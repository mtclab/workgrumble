import type { DispatchLogEntry, DispatchResult } from '../engine-api';
import type { FieldValue, NodeId } from '../engine-api';
import type { ReadOnlyGraphView } from '../engine-api';
import type { Account, ApiResult, FeedbackSubmission } from './api';
import type { AppStateStore } from './app-state';
import type { AppDef } from './apps/types';
import type { DayApi } from './day-driver';
import type { SaveHealthView } from './save-health';
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
 * Who this browser is, as far as the building is concerned.
 *
 * All three answer rather than throwing, and `account()` is a READ of what is
 * known right now rather than a question asked over the wire: the cookie
 * behind it is HttpOnly, so nothing in the browser can see it, and the only
 * way the player ever learns their own number is for the shell to be told once
 * at boot and to remember.
 *
 * It is the whole ACCOUNT rather than the number alone because the number
 * alone is not what the badge screen has to state: an account has a date it
 * was made, a date it was last used and a date it lapses, and all three come
 * from the building at the same moment as the badge itself.
 */
export interface ShellIdentity {
  account(): Account | null;
  signIn(badge: string): Promise<ApiResult<Account>>;
  issueBadge(): Promise<ApiResult<Account>>;
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
  /**
   * Whether writes are landing. It is on the context rather than inside the
   * session because the SURFACE for it is the taskbar: "nothing is being
   * kept" is a state a player has to be able to see at any moment, not a
   * toast that scrolled past while they were in a ticket.
   */
  readonly saveHealth: SaveHealthView;
  /** The badge this browser plays as, and the two ways to get one. */
  readonly identity: ShellIdentity;
  /**
   * Filing a report about the game itself.
   *
   * On the context rather than inside the feedback app because it is the one
   * seam in this product that leaves the browser, and `main.ts` is where the
   * decision about what the browser is allowed to talk to is made. An app is
   * handed a function that answers; it never learns what a URL is.
   */
  report(submission: Readonly<FeedbackSubmission>): Promise<ApiResult<void>>;
  dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;
  /** What has been dispatched since the last day boundary. Read-only. */
  dispatchLog(): readonly DispatchLogEntry[];
  /**
   * Fires after the world graph changed, whoever changed it. An app that has
   * to stay truthful (a ticket queue, a directory listing) repaints from this
   * instead of only repainting the window that happened to dispatch.
   */
  onWorldChange(listener: () => void): () => void;
}
