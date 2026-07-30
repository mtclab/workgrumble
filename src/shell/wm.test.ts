import { describe, expect, it } from 'vitest';

import {
  assertWindowManagerInvariants,
  closeWindow,
  createWindowManager,
  focusWindow,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  minimizeSlackWindows,
  minimizeWindow,
  moveWindow,
  openWindow,
  resizeWindow,
  restoreWindow,
  setWindowViewport,
  toggleMaximizedWindow,
  toggleTaskbarWindow,
  type WindowManagerState,
  type WindowSeed,
} from './wm';

const VIEWPORT = { width: 1_200, height: 720 };

function seed(id: string, slack = false): WindowSeed {
  return {
    id,
    appId: id,
    title: `Window ${id}`,
    icon: `icon-${id}`,
    slack,
    bounds: {
      x: 100,
      y: 80,
      width: 500,
      height: 320,
    },
  };
}

function openThree(): WindowManagerState {
  let state = createWindowManager(VIEWPORT);
  state = openWindow(state, seed('one'));
  state = openWindow(state, seed('two', true));
  return openWindow(state, seed('three'));
}

function selected(
  state: Readonly<WindowManagerState>,
  id: string,
) {
  const windowState = state.windows.find((candidate) => candidate.id === id);

  if (windowState === undefined) {
    throw new Error(`Missing test window "${id}".`);
  }

  return windowState;
}

describe('window manager open, close, and focus', () => {
  it('opens at the top, rejects duplicate ids, and closes cleanly', () => {
    let state = createWindowManager(VIEWPORT);
    state = openWindow(state, seed('one'));
    state = openWindow(state, seed('two'));

    expect(state.windows.map(({ id }) => id)).toEqual(['one', 'two']);
    expect(state.focusedId).toBe('two');
    expect(() => openWindow(state, seed('one'))).toThrow('already open');

    state = closeWindow(state, 'two');
    expect(state.windows.map(({ id }) => id)).toEqual(['one']);
    expect(state.focusedId).toBe('one');

    state = closeWindow(state, 'one');
    expect(state.windows).toEqual([]);
    expect(state.focusedId).toBeNull();
  });

  it('brings a focused window to the top without duplicating it', () => {
    const state = focusWindow(openThree(), 'one');

    expect(state.windows.map(({ id }) => id)).toEqual([
      'two',
      'three',
      'one',
    ]);
    expect(state.focusedId).toBe('one');
    assertWindowManagerInvariants(state);
  });
});

describe('window manager minimize and maximize', () => {
  it('moves focus to the next visible window and restores through taskbar', () => {
    let state = minimizeWindow(openThree(), 'three');

    expect(selected(state, 'three').minimized).toBe(true);
    expect(state.focusedId).toBe('two');

    state = restoreWindow(state, 'three');
    expect(selected(state, 'three').minimized).toBe(false);
    expect(state.focusedId).toBe('three');
    expect(state.windows.at(-1)?.id).toBe('three');

    state = toggleTaskbarWindow(state, 'three');
    expect(selected(state, 'three').minimized).toBe(true);
    state = toggleTaskbarWindow(state, 'three');
    expect(selected(state, 'three').minimized).toBe(false);
    assertWindowManagerInvariants(state);
  });

  it('fills the viewport when maximized and restores exact normal bounds', () => {
    const initial = openWindow(createWindowManager(VIEWPORT), seed('one'));
    const normalBounds = selected(initial, 'one').bounds;
    const maximized = toggleMaximizedWindow(initial, 'one');

    expect(selected(maximized, 'one')).toMatchObject({
      bounds: { x: 0, y: 0, ...VIEWPORT },
      restoreBounds: normalBounds,
      maximized: true,
    });

    const restored = toggleMaximizedWindow(maximized, 'one');
    expect(selected(restored, 'one')).toMatchObject({
      bounds: normalBounds,
      restoreBounds: null,
      maximized: false,
    });
  });

  it('minimizes all slack windows in one state transition', () => {
    let state = focusWindow(openThree(), 'two');
    state = minimizeSlackWindows(state);

    expect(selected(state, 'two').minimized).toBe(true);
    expect(selected(state, 'one').minimized).toBe(false);
    expect(selected(state, 'three').minimized).toBe(false);
    expect(state.focusedId).toBe('three');
    assertWindowManagerInvariants(state);
  });

  it('keeps every hidden slack window open so the taskbar can restore it', () => {
    const before = openThree();
    const after = minimizeSlackWindows(before);

    expect(after.windows.map(({ id }) => id)).toEqual(
      before.windows.map(({ id }) => id),
    );
    expect(minimizeSlackWindows(after)).toBe(after);
    expect(selected(restoreWindow(after, 'two'), 'two').minimized).toBe(false);
  });

  it('leaves a slack-free desktop untouched when the boss key fires', () => {
    let state = createWindowManager(VIEWPORT);
    state = openWindow(state, seed('one'));
    state = openWindow(state, seed('three'));

    expect(minimizeSlackWindows(state)).toBe(state);
  });

  it('empties focus when every window is minimized and never dead-ends', () => {
    let state = openThree();

    for (const id of ['one', 'two', 'three']) {
      state = minimizeWindow(state, id);
    }

    expect(state.focusedId).toBeNull();
    expect(state.windows).toHaveLength(3);
    assertWindowManagerInvariants(state);

    state = toggleTaskbarWindow(state, 'one');
    expect(state.focusedId).toBe('one');
    expect(selected(state, 'one').minimized).toBe(false);
  });

  it('keeps focus when a background window closes', () => {
    const state = closeWindow(openThree(), 'one');

    expect(state.focusedId).toBe('three');
    expect(state.windows.map(({ id }) => id)).toEqual(['two', 'three']);
    assertWindowManagerInvariants(state);
    expect(closeWindow(state, 'missing')).toBe(state);
  });
});

describe('window manager movement, resize, and viewport constraints', () => {
  it('clamps moves to every viewport edge', () => {
    let state = openWindow(createWindowManager(VIEWPORT), seed('one'));
    state = moveWindow(state, 'one', { dx: -10_000, dy: -10_000 });
    expect(selected(state, 'one').bounds).toMatchObject({ x: 0, y: 0 });

    state = moveWindow(state, 'one', { dx: 10_000, dy: 10_000 });
    const bounds = selected(state, 'one').bounds;
    expect(bounds.x + bounds.width).toBe(VIEWPORT.width);
    expect(bounds.y + bounds.height).toBe(VIEWPORT.height);
    assertWindowManagerInvariants(state);
  });

  it('resizes all edge families while enforcing minimums and viewport bounds', () => {
    let state = openWindow(createWindowManager(VIEWPORT), seed('one'));
    state = resizeWindow(state, 'one', 'nw', {
      dx: 10_000,
      dy: 10_000,
    });
    expect(selected(state, 'one').bounds).toMatchObject({
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
    });

    state = resizeWindow(state, 'one', 'se', {
      dx: 10_000,
      dy: 10_000,
    });
    const bounds = selected(state, 'one').bounds;
    expect(bounds.x + bounds.width).toBe(VIEWPORT.width);
    expect(bounds.y + bounds.height).toBe(VIEWPORT.height);

    state = resizeWindow(state, 'one', 'n', { dx: 0, dy: -10_000 });
    state = resizeWindow(state, 'one', 'w', { dx: -10_000, dy: 0 });
    expect(selected(state, 'one').bounds).toMatchObject({ x: 0, y: 0 });
    assertWindowManagerInvariants(state);
  });

  it('reclamps normal and restore bounds when the viewport changes', () => {
    let state = openWindow(createWindowManager(VIEWPORT), seed('one'));
    state = toggleMaximizedWindow(state, 'one');
    state = setWindowViewport(state, { width: 420, height: 260 });

    expect(selected(state, 'one').bounds).toEqual({
      x: 0,
      y: 0,
      width: 420,
      height: 260,
    });

    state = toggleMaximizedWindow(state, 'one');
    const restored = selected(state, 'one').bounds;
    expect(restored.x + restored.width).toBeLessThanOrEqual(420);
    expect(restored.y + restored.height).toBeLessThanOrEqual(260);
    assertWindowManagerInvariants(state);
  });

  it('cascades unpositioned windows fully inside the viewport', () => {
    let state = createWindowManager({ width: 640, height: 400 });

    for (let index = 0; index < 12; index += 1) {
      state = openWindow(state, {
        id: `window-${String(index)}`,
        appId: 'demo',
        title: `Window ${String(index)}`,
        icon: 'icon-about',
        slack: false,
      });
    }

    for (const windowState of state.windows) {
      const { x, y, width, height } = windowState.bounds;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(640);
      expect(y + height).toBeLessThanOrEqual(400);
    }

    assertWindowManagerInvariants(state);
  });

  it('degrades configured minimums only for a viewport smaller than them', () => {
    const state = openWindow(
      createWindowManager({ width: 180, height: 120 }),
      seed('tiny'),
    );

    expect(selected(state, 'tiny').bounds).toEqual({
      x: 0,
      y: 0,
      width: 180,
      height: 120,
    });
    assertWindowManagerInvariants(state);
  });
});
