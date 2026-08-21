import type { WindowsState } from './app-state';
import type { AppDef } from './apps/types';
import {
  createWindowManager,
  focusWindow,
  minimizeWindow,
  openWindow,
  restoreWindow,
  type Viewport,
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

/**
 * THE SCREEN A STORE DESCRIBES: every window the app state says is open, in
 * the pile order it says, with the focus it says.
 *
 * One answer to "what is on the desktop", read from ONE place, and that is the
 * whole reason it is a function rather than two bits of desktop code. The
 * desktop used to derive its screen twice: once when a LOAD replaced the store
 * under it (`restoreWindows`), and once at MOUNT - where it derived it from
 * nothing at all, on the assumption that a desktop is always built onto a fresh
 * morning. That assumption held for exactly as long as a fresh Monday was the
 * only thing a boot could stand up. The moment a refresh started resuming
 * (#61, 0.41.0) it stopped being true, and the resumed player arrived in the
 * right WORLD looking at the wrong SCREEN: the week, the queue and the clock
 * came back, and the four windows they had open did not, because the store
 * carrying them was handed to a desktop that never looked at it.
 *
 * So both paths ask this, and a screen is a function of the store either way.
 *
 * An app id the manifest does not hold is SKIPPED rather than refused: the
 * install set rides the save too, and a toy that was uninstalled between the
 * save and the load has no definition to open into. Callers rebuild the app
 * surfaces before asking, so by the time this runs "not in `apps`" means gone
 * on purpose.
 *
 * GEOMETRY IS NOT RESTORED because it was never saved: a window put back at
 * coordinates from somebody else's screen is worse than one the cascade has
 * placed.
 */
export function screenFrom(
  saved: Readonly<WindowsState>,
  apps: readonly Readonly<AppDef>[],
  viewport: Readonly<Viewport>,
): WindowManagerState {
  let next = createWindowManager(viewport);

  for (const entry of saved.open) {
    const definition = apps.find((app) => app.id === entry.appId);

    if (definition === undefined) {
      continue;
    }

    next = launchApp(next, definition);

    if (entry.minimized) {
      next = minimizeWindow(next, windowIdFor(definition));
    }
  }

  return saved.focusedId === null ? next : focusWindow(next, saved.focusedId);
}

/**
 * And the other direction: the store a screen describes.
 *
 * `screenFrom`'s inverse, and here rather than in the desktop so the two sit
 * next to each other and can be read as the pair they are. What rides the save
 * is the LIST and the FOCUS and nothing else - not geometry, which belongs to
 * the machine the window was dragged around on rather than to the week.
 *
 * What it is FOR is the save: the pressure layer decides everything on what is
 * genuinely up when the lead arrives, so a file that does not carry the screen
 * is a file that changes the answer.
 */
export function windowsStateOf(
  state: Readonly<WindowManagerState>,
): WindowsState {
  return {
    open: state.windows.map((windowState) => ({
      appId: windowState.appId,
      minimized: windowState.minimized,
    })),
    focusedId: state.focusedId,
  };
}
