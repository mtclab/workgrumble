export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 180;
export const DEFAULT_WINDOW_WIDTH = 620;
export const DEFAULT_WINDOW_HEIGHT = 480;

const CASCADE_OFFSET = 28;
/**
 * Cascade origin. The horizontal start clears the desktop icon column so a
 * freshly opened window never buries the icons you opened it from.
 */
const CASCADE_ORIGIN_X = 140;
const CASCADE_ORIGIN_Y = 32;
const CASCADE_SLOTS = 7;
/**
 * Where the cascade goes when all seven slots are taken.
 *
 * Counting slots and taking the next one is right until the eighth window,
 * which used to land exactly on top of the first - same corner, same size,
 * indistinguishable, and the titlebar of the one underneath unreachable
 * without the taskbar. Three shelves offset by half a step give twenty-one
 * distinct places before anything is buried, which is more windows than this
 * desktop has apps.
 */
const CASCADE_SHELVES = 3;
const CASCADE_SHELF_OFFSET = CASCADE_OFFSET / 2;
const BOUNDS_EPSILON = 0.001;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WindowSeed {
  readonly id: string;
  readonly appId: string;
  readonly title: string;
  readonly icon: string;
  readonly slack: boolean;
  readonly bounds?: WindowBounds;
}

export interface ManagedWindow {
  readonly id: string;
  readonly appId: string;
  readonly title: string;
  readonly icon: string;
  readonly slack: boolean;
  readonly bounds: WindowBounds;
  readonly restoreBounds: WindowBounds | null;
  readonly minimized: boolean;
  readonly maximized: boolean;
}

export interface WindowManagerState {
  readonly viewport: Viewport;
  /** Bottom-to-top z-order. Minimized windows retain their place. */
  readonly windows: readonly ManagedWindow[];
  readonly focusedId: string | null;
  readonly cascadeIndex: number;
}

export interface PointDelta {
  readonly dx: number;
  readonly dy: number;
}

export type ResizeHandle =
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'nw';

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}

function validateViewport(viewport: Readonly<Viewport>): Viewport {
  assertFinite(viewport.width, 'Viewport width');
  assertFinite(viewport.height, 'Viewport height');

  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('Viewport dimensions must be positive.');
  }

  return { width: viewport.width, height: viewport.height };
}

function validateDelta(delta: Readonly<PointDelta>): void {
  assertFinite(delta.dx, 'Horizontal delta');
  assertFinite(delta.dy, 'Vertical delta');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function effectiveMinimum(
  viewportExtent: number,
  configuredMinimum: number,
): number {
  return Math.min(viewportExtent, configuredMinimum);
}

export function clampWindowBounds(
  bounds: Readonly<WindowBounds>,
  viewportInput: Readonly<Viewport>,
): WindowBounds {
  const viewport = validateViewport(viewportInput);
  assertFinite(bounds.x, 'Window x');
  assertFinite(bounds.y, 'Window y');
  assertFinite(bounds.width, 'Window width');
  assertFinite(bounds.height, 'Window height');

  const minimumWidth = effectiveMinimum(
    viewport.width,
    MIN_WINDOW_WIDTH,
  );
  const minimumHeight = effectiveMinimum(
    viewport.height,
    MIN_WINDOW_HEIGHT,
  );
  const width = clamp(bounds.width, minimumWidth, viewport.width);
  const height = clamp(bounds.height, minimumHeight, viewport.height);

  return {
    x: clamp(bounds.x, 0, viewport.width - width),
    y: clamp(bounds.y, 0, viewport.height - height),
    width,
    height,
  };
}

function viewportBounds(viewport: Readonly<Viewport>): WindowBounds {
  return {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };
}

function topVisibleId(
  windows: readonly ManagedWindow[],
): string | null {
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    const candidate = windows[index];

    if (candidate !== undefined && !candidate.minimized) {
      return candidate.id;
    }
  }

  return null;
}

function replaceWindow(
  state: Readonly<WindowManagerState>,
  id: string,
  update: (windowState: Readonly<ManagedWindow>) => ManagedWindow,
): readonly ManagedWindow[] {
  return state.windows.map((windowState) => (
    windowState.id === id ? update(windowState) : windowState
  ));
}

function bringToFront(
  windows: readonly ManagedWindow[],
  id: string,
): readonly ManagedWindow[] {
  const selected = windows.find((windowState) => windowState.id === id);

  if (selected === undefined) {
    return windows;
  }

  return [
    ...windows.filter((windowState) => windowState.id !== id),
    selected,
  ];
}

function slotBounds(
  viewport: Readonly<Viewport>,
  slot: number,
  shelf: number,
): WindowBounds {
  return clampWindowBounds(
    {
      x: CASCADE_ORIGIN_X
        + slot * CASCADE_OFFSET
        + shelf * CASCADE_SHELF_OFFSET,
      y: CASCADE_ORIGIN_Y
        + slot * CASCADE_OFFSET
        + shelf * CASCADE_SHELF_OFFSET,
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
    },
    viewport,
  );
}

/**
 * Where the next window goes: the next slot in the cascade that nothing is
 * already sitting exactly on.
 *
 * Opening apps one after another walks down the same staircase it always did,
 * because each new window finds the previous one in the slot above it. What is
 * new is that it LOOKS: a window opened after another was closed takes the
 * corner that is free rather than one it happened to have counted to, and the
 * eighth window on a full desktop steps onto the next shelf instead of
 * vanishing behind the first.
 */
function cascadeBounds(
  state: Readonly<WindowManagerState>,
): WindowBounds {
  const occupied = (bounds: Readonly<WindowBounds>): boolean => (
    state.windows.some((windowState) => (
      Math.abs(windowState.bounds.x - bounds.x) < 1
      && Math.abs(windowState.bounds.y - bounds.y) < 1
    ))
  );

  for (let shelf = 0; shelf < CASCADE_SHELVES; shelf += 1) {
    for (let slot = 0; slot < CASCADE_SLOTS; slot += 1) {
      const bounds = slotBounds(state.viewport, slot, shelf);

      if (!occupied(bounds)) {
        return bounds;
      }
    }
  }

  // Twenty-one windows deep, or a viewport too small to tell the slots apart.
  // Somebody is going to have to use the taskbar.
  return slotBounds(state.viewport, state.cascadeIndex % CASCADE_SLOTS, 0);
}

function finish(
  state: WindowManagerState,
): WindowManagerState {
  assertWindowManagerInvariants(state);
  return state;
}

export function createWindowManager(
  viewportInput: Readonly<Viewport>,
): WindowManagerState {
  const state: WindowManagerState = {
    viewport: validateViewport(viewportInput),
    windows: [],
    focusedId: null,
    cascadeIndex: 0,
  };

  return finish(state);
}

export function openWindow(
  state: Readonly<WindowManagerState>,
  seed: Readonly<WindowSeed>,
): WindowManagerState {
  if (
    seed.id.length === 0
    || seed.appId.length === 0
    || seed.title.length === 0
    || seed.icon.length === 0
  ) {
    throw new TypeError('Window identity fields must be non-empty.');
  }

  if (state.windows.some((windowState) => windowState.id === seed.id)) {
    throw new Error(`Window "${seed.id}" is already open.`);
  }

  const bounds = clampWindowBounds(
    seed.bounds ?? cascadeBounds(state),
    state.viewport,
  );
  const opened: ManagedWindow = {
    id: seed.id,
    appId: seed.appId,
    title: seed.title,
    icon: seed.icon,
    slack: seed.slack,
    bounds,
    restoreBounds: null,
    minimized: false,
    maximized: false,
  };

  return finish({
    ...state,
    windows: [...state.windows, opened],
    focusedId: opened.id,
    cascadeIndex: state.cascadeIndex + 1,
  });
}

export function closeWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  if (!state.windows.some((windowState) => windowState.id === id)) {
    return state;
  }

  const windows = state.windows.filter(
    (windowState) => windowState.id !== id,
  );

  return finish({
    ...state,
    windows,
    focusedId: state.focusedId === id
      ? topVisibleId(windows)
      : state.focusedId,
  });
}

export function focusWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (selected === undefined || selected.minimized) {
    return state;
  }

  const windows = bringToFront(state.windows, id);
  return finish({
    ...state,
    windows,
    focusedId: id,
  });
}

export function minimizeWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (selected === undefined || selected.minimized) {
    return state;
  }

  const windows = replaceWindow(state, id, (windowState) => ({
    ...windowState,
    minimized: true,
  }));

  return finish({
    ...state,
    windows,
    focusedId: state.focusedId === id
      ? topVisibleId(windows)
      : state.focusedId,
  });
}

export function restoreWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (selected === undefined) {
    return state;
  }

  const restored = replaceWindow(state, id, (windowState) => ({
    ...windowState,
    minimized: false,
  }));
  const windows = bringToFront(restored, id);

  return finish({
    ...state,
    windows,
    focusedId: id,
  });
}

export function toggleTaskbarWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (selected === undefined) {
    return state;
  }

  if (selected.minimized) {
    return restoreWindow(state, id);
  }

  return state.focusedId === id
    ? minimizeWindow(state, id)
    : focusWindow(state, id);
}

export function toggleMaximizedWindow(
  state: Readonly<WindowManagerState>,
  id: string,
): WindowManagerState {
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (selected === undefined || selected.minimized) {
    return state;
  }

  const windows = replaceWindow(state, id, (windowState) => (
    windowState.maximized
      ? {
        ...windowState,
        bounds: clampWindowBounds(
          windowState.restoreBounds ?? windowState.bounds,
          state.viewport,
        ),
        restoreBounds: null,
        maximized: false,
      }
      : {
        ...windowState,
        bounds: viewportBounds(state.viewport),
        restoreBounds: windowState.bounds,
        maximized: true,
      }
  ));
  const front = bringToFront(windows, id);

  return finish({
    ...state,
    windows: front,
    focusedId: id,
  });
}

export function moveWindow(
  state: Readonly<WindowManagerState>,
  id: string,
  delta: Readonly<PointDelta>,
): WindowManagerState {
  validateDelta(delta);
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (
    selected === undefined
    || selected.minimized
    || selected.maximized
  ) {
    return state;
  }

  const windows = replaceWindow(state, id, (windowState) => ({
    ...windowState,
    bounds: clampWindowBounds(
      {
        ...windowState.bounds,
        x: windowState.bounds.x + delta.dx,
        y: windowState.bounds.y + delta.dy,
      },
      state.viewport,
    ),
  }));

  return finish({
    ...state,
    windows,
  });
}

export function resizeWindow(
  state: Readonly<WindowManagerState>,
  id: string,
  handle: ResizeHandle,
  delta: Readonly<PointDelta>,
): WindowManagerState {
  validateDelta(delta);
  const selected = state.windows.find(
    (windowState) => windowState.id === id,
  );

  if (
    selected === undefined
    || selected.minimized
    || selected.maximized
  ) {
    return state;
  }

  const minimumWidth = effectiveMinimum(
    state.viewport.width,
    MIN_WINDOW_WIDTH,
  );
  const minimumHeight = effectiveMinimum(
    state.viewport.height,
    MIN_WINDOW_HEIGHT,
  );
  let left = selected.bounds.x;
  let top = selected.bounds.y;
  let right = selected.bounds.x + selected.bounds.width;
  let bottom = selected.bounds.y + selected.bounds.height;

  if (handle.includes('w')) {
    left = clamp(left + delta.dx, 0, right - minimumWidth);
  }

  if (handle.includes('e')) {
    right = clamp(
      right + delta.dx,
      left + minimumWidth,
      state.viewport.width,
    );
  }

  if (handle.includes('n')) {
    top = clamp(top + delta.dy, 0, bottom - minimumHeight);
  }

  if (handle.includes('s')) {
    bottom = clamp(
      bottom + delta.dy,
      top + minimumHeight,
      state.viewport.height,
    );
  }

  const windows = replaceWindow(state, id, (windowState) => ({
    ...windowState,
    bounds: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
  }));

  return finish({
    ...state,
    windows,
  });
}

export function minimizeSlackWindows(
  state: Readonly<WindowManagerState>,
): WindowManagerState {
  const hasVisibleSlack = state.windows.some(
    (windowState) => windowState.slack && !windowState.minimized,
  );

  if (!hasVisibleSlack) {
    return state;
  }

  const windows = state.windows.map((windowState) => (
    windowState.slack
      ? { ...windowState, minimized: true }
      : windowState
  ));

  return finish({
    ...state,
    windows,
    focusedId: topVisibleId(windows),
  });
}

export function setWindowViewport(
  state: Readonly<WindowManagerState>,
  viewportInput: Readonly<Viewport>,
): WindowManagerState {
  const viewport = validateViewport(viewportInput);
  // `restoreBounds` is carried through untouched. A viewport change is often
  // temporary (a rotated phone, a split-screen drag, a window-manager
  // animation) and rewriting the pre-maximize geometry against the smallest
  // viewport ever seen would shrink the window for good. Restoring clamps
  // against the viewport of that moment instead - see `toggleMaximizedWindow`.
  const windows = state.windows.map((windowState): ManagedWindow => ({
    ...windowState,
    bounds: windowState.maximized
      ? viewportBounds(viewport)
      : clampWindowBounds(windowState.bounds, viewport),
  }));

  return finish({
    ...state,
    viewport,
    windows,
  });
}

export function assertWindowManagerInvariants(
  state: Readonly<WindowManagerState>,
): void {
  validateViewport(state.viewport);
  const ids = new Set<string>();

  for (const windowState of state.windows) {
    if (ids.has(windowState.id)) {
      throw new Error(`Duplicate window id "${windowState.id}".`);
    }
    ids.add(windowState.id);

    const { x, y, width, height } = windowState.bounds;
    const minimumWidth = effectiveMinimum(
      state.viewport.width,
      MIN_WINDOW_WIDTH,
    );
    const minimumHeight = effectiveMinimum(
      state.viewport.height,
      MIN_WINDOW_HEIGHT,
    );

    if (
      x < -BOUNDS_EPSILON
      || y < -BOUNDS_EPSILON
      || x + width > state.viewport.width + BOUNDS_EPSILON
      || y + height > state.viewport.height + BOUNDS_EPSILON
      || width < minimumWidth - BOUNDS_EPSILON
      || height < minimumHeight - BOUNDS_EPSILON
    ) {
      throw new Error(`Window "${windowState.id}" is outside its bounds.`);
    }

    if (
      windowState.maximized
      && (
        x !== 0
        || y !== 0
        || width !== state.viewport.width
        || height !== state.viewport.height
      )
    ) {
      throw new Error(`Maximized window "${windowState.id}" must fill viewport.`);
    }
  }

  const topId = topVisibleId(state.windows);
  if (state.focusedId !== topId) {
    throw new Error('The focused window must be the top visible window.');
  }

  if (
    state.focusedId !== null
    && !ids.has(state.focusedId)
  ) {
    throw new Error('The focused window must exist.');
  }
}
