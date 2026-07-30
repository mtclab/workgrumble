import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from './apps/index';
import type { AppDef } from './apps/types';
import { launchApp, windowIdFor, windowSeedFor } from './launch';
import {
  createWindowManager,
  minimizeSlackWindows,
  minimizeWindow,
  type WindowManagerState,
} from './wm';

const VIEWPORT = { width: 1_280, height: 760 };

function requireApp(id: string): AppDef {
  const app = APP_MANIFEST.find((candidate) => candidate.id === id);

  if (app === undefined) {
    throw new Error(`The shipped manifest is missing "${id}".`);
  }

  return app;
}

function launchAll(): WindowManagerState {
  let state = createWindowManager(VIEWPORT);

  for (const app of APP_MANIFEST) {
    state = launchApp(state, app);
  }

  return state;
}

describe('app launcher', () => {
  it('carries the manifest identity into the window, slack flag included', () => {
    for (const app of APP_MANIFEST) {
      expect(windowSeedFor(app)).toEqual({
        id: windowIdFor(app),
        appId: app.id,
        title: app.title,
        icon: app.icon,
        slack: app.slack,
      });
    }
  });

  it('runs one window per app and refocuses instead of duplicating', () => {
    const about = requireApp('about');
    let state = launchAll();

    expect(state.windows).toHaveLength(APP_MANIFEST.length);

    state = launchApp(state, about);
    expect(state.windows).toHaveLength(APP_MANIFEST.length);
    expect(state.focusedId).toBe(about.id);
    expect(state.windows.at(-1)?.id).toBe(about.id);
  });

  it('brings a minimized app back instead of opening a second window', () => {
    const bubbles = requireApp('bubbles');
    let state = minimizeWindow(launchAll(), bubbles.id);

    expect(state.windows.find(({ id }) => id === bubbles.id)?.minimized)
      .toBe(true);

    state = launchApp(state, bubbles);
    expect(state.windows).toHaveLength(APP_MANIFEST.length);
    expect(state.windows.find(({ id }) => id === bubbles.id)?.minimized)
      .toBe(false);
    expect(state.focusedId).toBe(bubbles.id);
  });

  it('leaves the boss key able to hide exactly the slack apps', () => {
    const hidden = minimizeSlackWindows(launchAll());

    for (const app of APP_MANIFEST) {
      expect({
        id: app.id,
        minimized: hidden.windows.find(({ id }) => id === app.id)?.minimized,
      }).toEqual({ id: app.id, minimized: app.slack });
    }
  });
});
