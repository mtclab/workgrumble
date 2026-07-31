import type {
  DispatchResult,
} from '../../engine-api';
import type { ReadOnlyGraphView } from '../../engine-api';
import type {
  FieldValue,
} from '../../engine-api';
import type { AppStateStore } from '../app-state';
import type { DayApi } from '../day-driver';

/**
 * What one app asks another to show when it opens it.
 *
 * `openApp` on its own opens an app wherever it last was, which is right for
 * a taskbar click and useless for a cross-app link: "open the KB" is not the
 * same request as "open the KB AT the article this ticket names". An intent
 * carries that second half, and nothing else - it is a request to a view, not
 * a channel for world state, so there is no payload here an app could mutate.
 */
export type AppIntent =
  | { readonly kind: 'kb-article'; readonly ref: string }
  | { readonly kind: 'chat-person'; readonly id: string }
  | { readonly kind: 'remote-machine'; readonly id: string };

export interface AppInstance {
  unmount(): void;
  /**
   * Handles an intent the launcher carried in, for an app that has somewhere
   * to carry it to. Optional: an app that ignores intents is still a valid
   * app, and an intent aimed at one is dropped rather than being an error.
   */
  receiveIntent?(intent: AppIntent): void;
}

export interface GameApi {
  readonly graph: ReadOnlyGraphView;
  /**
   * What this app was showing last time it was open. Window-local state used
   * to die with the window; a transcript, an unread flag and a selected
   * article are things the player expects to find where they left them, and
   * things a save has to carry.
   */
  readonly appState: AppStateStore;
  /**
   * The shift the player is in the middle of. Reading it is free; the two
   * things that move it - starting the shift, clocking off - go through the
   * engine's action registry like every other change to the world.
   */
  readonly day: DayApi;
  dispatch(
    id: string,
    actor: string,
    target: string | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;
  readonly clock: {
    now(): number;
    /** Subscribe to simulation ticks. Apps must unsubscribe on unmount. */
    onTick(listener: (tick: number) => void): () => void;
  };
  /** Fires after any world mutation. Apps must unsubscribe on unmount. */
  onWorldChange(listener: () => void): () => void;
  notify(title: string, body: string): void;
  /**
   * Opens an app, or raises the one already open. The optional intent tells
   * that app where to land; leaving it off is the plain "just open it" call
   * every M1 caller already makes.
   */
  openApp(id: string, intent?: AppIntent): void;
  /** True when an app is installed at the current tier, for cross-app links. */
  hasApp(id: string): boolean;
  /** The person node the shell dispatches actions as. */
  readonly actor: string;
}

export interface AppDef {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly tier_required: number;
  readonly slack: boolean;
  /**
   * Whether the app gets a desktop icon. The day screens do not: they are put
   * on screen by the day itself, and an icon for "the morning brief" among the
   * tools would read as a tool. They keep their start-menu entry, because a
   * screen you cannot reopen is a dead end.
   */
  readonly desktop?: boolean;
  mount(host: HTMLElement, api: GameApi): AppInstance;
}
