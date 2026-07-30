import type {
  DispatchResult,
} from '../../engine/actions';
import type { ReadOnlyGraphView } from '../../engine/graph-view';
import type {
  FieldValue,
} from '../../engine/schema';

export interface AppInstance {
  unmount(): void;
}

export interface GameApi {
  readonly graph: ReadOnlyGraphView;
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
  openApp(id: string): void;
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
  mount(host: HTMLElement, api: GameApi): AppInstance;
}
