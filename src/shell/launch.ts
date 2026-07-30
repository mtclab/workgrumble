import type { AppDef } from './apps/types';
import {
  openWindow,
  restoreWindow,
  type WindowManagerState,
  type WindowSeed,
} from './wm';

/**
 * M1 runs one window per app, so the window id is the app id. Keeping the
 * mapping here means the taskbar, the renderer and the launcher cannot drift.
 */
export function windowIdFor(app: Readonly<AppDef>): string {
  return app.id;
}

export function windowSeedFor(app: Readonly<AppDef>): WindowSeed {
  return {
    id: windowIdFor(app),
    appId: app.id,
    title: app.title,
    icon: app.icon,
    slack: app.slack,
  };
}

/**
 * Opens an app, or brings the window it already has back to the front. Pure:
 * the desktop renderer calls this and paints whatever comes back.
 */
export function launchApp(
  state: Readonly<WindowManagerState>,
  app: Readonly<AppDef>,
): WindowManagerState {
  const id = windowIdFor(app);

  return state.windows.some((windowState) => windowState.id === id)
    ? restoreWindow(state, id)
    : openWindow(state, windowSeedFor(app));
}
