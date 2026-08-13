import type { DispatchLogEntry, DispatchResult } from '../engine-api';
import type { FieldValue, NodeId } from '../engine-api';
import type { ReadOnlyGraphView } from '../engine-api';
import type { Account, ApiResult, FeedbackSubmission } from './api';
import type { AppStateStore } from './app-state';
import type { AppDef } from './apps/types';
import type { DayApi } from './day-driver';
import type { SaveHealthView } from './save-health';
import type { SaveOutcome, ShellSessionApi } from './save';

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
 * Starting a career at a title, as the log-on screen needs it.
 *
 * The whole LADDER rather than only the rungs that can be played, because the
 * screen shows both: the ladder is the difficulty scale, and a select that
 * listed two jobs would be a difficulty scale with two settings and no shape.
 * Which of them can be taken is `takeable`, and the screen greys the rest.
 */
export interface ShellHireRung {
  readonly id: string;
  readonly label: string;
  /** The employer's name, for the rung a player can actually be hired at. */
  readonly employer: string | null;
  /** What this rung changes about the job, in the one sentence the table has. */
  readonly shapeBreak: string;
  readonly takeable: boolean;
}

export interface ShellHire {
  readonly rungs: readonly ShellHireRung[];
  /** Which rung this browser starts at with no choice made: the bottom one. */
  readonly standard: string;
  /**
   * Takes the job. Answers rather than throwing, and the answer matters: a
   * browser that will not keep the choice must say so on the screen the choice
   * was made on rather than boot a week that is not the one somebody picked.
   *
   * A rung that is not takeable is REFUSED here as well as greyed on screen -
   * the screen is a courtesy and this is the rule.
   */
  choose(rung: string): SaveOutcome;
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
   * Which employer this session is a week at, stamped into every save and read
   * by the offer surface to work out where the next job is. One fact, threaded
   * from the session that stood the world up rather than read off the graph -
   * the employer's identity is not a graph field, by design.
   */
  readonly employer: string;
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
   * The desk this career is being started at, when one is being started (E9,
   * 0.35.0, D1: the title you are hired at IS the difficulty).
   *
   * NULL is the normal case and it means "not now": this browser is carrying a
   * week already, or arriving at a new employer, or retrying a lost one, and
   * none of those is a hire. Only a boot with nothing behind it offers the
   * choice, which is why it is decided in `main.ts` - where the save slot, the
   * retry slot and the switch slot are all read - rather than in the screen
   * that draws it.
   */
  readonly hire: ShellHire | null;
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
