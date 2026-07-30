import type {
  DispatchResult,
} from '../../engine/actions';
import type {
  FieldValue,
} from '../../engine/schema';
import type { ReadonlyGraph } from '../graph-view';

export interface AppInstance {
  unmount(): void;
}

export interface GameApi {
  readonly graph: ReadonlyGraph;
  dispatch(
    id: string,
    actor: string,
    target: string | null,
    params: Record<string, FieldValue>,
  ): DispatchResult;
  readonly clock: {
    now(): number;
  };
  notify(title: string, body: string): void;
  openApp(id: string): void;
}

export interface AppDef {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly tier_required: number;
  readonly slack: boolean;
  mount(host: HTMLElement, api: GameApi): AppInstance;
}
