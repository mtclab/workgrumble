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

  it('refills the viewport when it changes and clamps the restore to it', () => {
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

  it('keeps the pre-maximize geometry across a temporary viewport shrink', () => {
    const large = { width: 1_280, height: 800 };
    let state = openWindow(createWindowManager(large), seed('one'));
    const normalBounds = selected(state, 'one').bounds;

    state = toggleMaximizedWindow(state, 'one');
    // The window manager is dragged through a phone-sized viewport and back:
    // a minimised browser, a rotated device, a split-screen shove.
    state = setWindowViewport(state, { width: 500, height: 400 });
    expect(selected(state, 'one').restoreBounds).toEqual(normalBounds);

    state = setWindowViewport(state, large);
    state = toggleMaximizedWindow(state, 'one');

    expect(selected(state, 'one').bounds).toEqual(normalBounds);
    expect(selected(state, 'one').maximized).toBe(false);
    assertWindowManagerInvariants(state);
  });

  it('clamps a stale restore against the viewport it lands in', () => {
    let state = openWindow(createWindowManager(VIEWPORT), seed('one'));
    state = toggleMaximizedWindow(state, 'one');
    state = setWindowViewport(state, { width: 500, height: 400 });
    state = toggleMaximizedWindow(state, 'one');

    const bounds = selected(state, 'one').bounds;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(500);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
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

  /**
   * The ninth window.
   *
   * The cascade counted slots and wrapped at seven, so the eighth window
   * landed exactly on the first: same corner, same size, and the titlebar of
   * the one underneath unreachable except from the taskbar. Two windows in
   * precisely the same place is not a stack, it is a window that has gone
   * missing.
   */
  it('never puts a new window exactly on top of an open one', () => {
    let state = createWindowManager({ width: 1_600, height: 1_000 });

    for (let index = 0; index < 12; index += 1) {
      state = openWindow(state, {
        id: `window-${String(index)}`,
        appId: 'demo',
        title: `Window ${String(index)}`,
        icon: 'icon-about',
        slack: false,
      });
    }

    const corners = state.windows.map(
      ({ bounds }) => `${String(bounds.x)}:${String(bounds.y)}`,
    );

    expect(new Set(corners).size).toBe(corners.length);
    assertWindowManagerInvariants(state);
  });

  /**
   * And the corner a closed window leaves behind is offered to the next one
   * rather than being counted past - a desktop worked through app by app used
   * to walk the staircase off the bottom while the top of it stood empty.
   */
  it('reuses a slot that a closed window has given back', () => {
    let state = createWindowManager({ width: 1_600, height: 1_000 });
    const open = (id: string): void => {
      state = openWindow(state, {
        id,
        appId: id,
        title: id,
        icon: 'icon-about',
        slack: false,
      });
    };

    open('window-a');
    open('window-b');
    const first = state.windows[0]?.bounds;
    state = closeWindow(state, 'window-a');
    open('window-c');

    expect(state.windows.map(({ id }) => id))
      .toEqual(['window-b', 'window-c']);
    expect(state.windows[1]?.bounds).toEqual(first);
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
