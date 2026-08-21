/**
 * THE SCREEN COMES BACK WITH THE WEEK (#61 box round, 0.41.0).
 *
 * The finding the first box round on the resume made, and the half the world
 * assertions could not see. The boot-time resume put the whole WORLD back -
 * the graph, the clock, the week, the shop - and dropped the SCREEN. A load in
 * a running session replaces the app state under a mounted desktop, and the
 * desktop's `onReplaced` subscription is what rebuilds the surfaces, restores
 * the windows, re-applies the skin and re-derives the day's own screens. The
 * boot resume runs `session.load()` before a desktop exists: the replacement
 * fired with nobody listening, and the desktop that stood up a moment later
 * built its screen from the assumption that a desktop is always a fresh
 * morning. full-day's `resumed toEqual before` red on the box was the four open
 * windows and the focused scorecard, gone.
 *
 * Two claims here, and neither is "a function returned ok".
 *
 * 1. A SCREEN SURVIVES A SAVE, through the pair that puts it in and takes it
 *    back out (`windowsStateOf` / `screenFrom`) and the shipped save in
 *    between. Same windows, same pile order, same minimised one, same focus.
 * 2. THE BOUNDARY SAVE CARRIES THE MORNING IT OPENS ON, which is the ordering
 *    fact both e2e resume journeys now rest on: at a clock-off the driver
 *    announces the new day BEFORE it asks for the save, so a desktop listening
 *    to that announcement has already put the new morning's brief up by the
 *    time the file is written - and a refresh comes back to a desk with the
 *    brief on it rather than to a bare one.
 *
 * What is NOT here, said plainly: the desktop's own mount. It is DOM, this
 * suite has no DOM, and the wiring that calls `adoptScreens` at mount is held
 * by `e2e/full-day.spec.ts` (the deep-equal on the resumed screens) and
 * `e2e/resume.spec.ts`. What this file holds is the derivation both ends of
 * that wiring share and the ordering the specs' claims are true because of.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { employerFor } from '../world/employers';
import { createWorldSession, FIRST_WEEK } from '../world/session';
import { AppStateStore } from './app-state';
import { APP_MANIFEST } from './apps';
import type { AppDef } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { launchApp, screenFrom, windowsStateOf } from './launch';
import { RetrySlot } from './retry';
import { createShellSession, SaveSlot, type ShellSessionApi } from './save';
import { SwitchSlot } from './switch';
import {
  createWindowManager,
  focusWindow,
  minimizeWindow,
  type Viewport,
  type WindowManagerState,
} from './wm';

beforeAll(() => {
  loadEngineForTests();
});

/** A `Storage` in a Map. The browser's is not what is on trial here. */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

/** The size the desktop measures on the box, near enough for a cascade. */
const VIEWPORT: Viewport = { width: 1_280, height: 760 };

interface Rig {
  readonly session: ShellSessionApi;
  readonly appState: AppStateStore;
  readonly driver: DayDriver;
  readonly slot: SaveSlot;
}

/** A session wired the way `main.ts` wires one, over one browser's storage. */
function rig(storage: Storage, boundary: () => void = (): void => {}): Rig {
  const world = createWorldSession(FIRST_WEEK);
  const employer = employerFor(world.employer);
  const appState = new AppStateStore();
  const slot = new SaveSlot(storage);
  const driver = new DayDriver(
    world.engine,
    COMPANY_IDS.player,
    world.seed,
    {
      onDayBoundary: boundary,
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
    undefined,
    world.week,
    employer.channels,
    employer.runsBossPings,
    employer.arc,
  );

  return {
    appState,
    driver,
    slot,
    session: createShellSession({
      engine: world.engine,
      appState,
      day: driver,
      slot,
      retry: new RetrySlot(storage),
      switch: new SwitchSlot(storage),
      actor: COMPANY_IDS.player,
      employer: world.employer,
      probeEngine: () => new WasmEngine(world.seed),
      restart: () => {},
    }),
  };
}

/** The apps a desktop at the probation tier resolves - the real manifest. */
function apps(): readonly AppDef[] {
  return APP_MANIFEST;
}

function appOf(id: string): AppDef {
  const found = apps().find((app) => app.id === id);

  if (found === undefined) {
    throw new Error(`"${id}" is not an app in the shipped manifest.`);
  }

  return found;
}

/** A desk with three things on it, one of them minimised and one in front. */
function aBusyDesk(): WindowManagerState {
  let screen = createWindowManager(VIEWPORT);

  screen = launchApp(screen, appOf('directory'));
  screen = launchApp(screen, appOf('browser'));
  screen = launchApp(screen, appOf('tickets'));
  screen = minimizeWindow(screen, 'browser');
  return focusWindow(screen, 'directory');
}

describe('the screen a resumed session comes back to', () => {
  it('is the one the save was taken with, windows, pile and focus', () => {
    const storage = new MemoryStorage();
    const live = rig(storage);
    const desk = aBusyDesk();

    // What the desktop writes into the store every time the screen changes.
    live.appState.patch('windows', windowsStateOf(desk));
    expect(live.session.save()).toEqual({ ok: true, value: undefined });

    // A SECOND BOOT over the same storage, resumed through the shipped load -
    // the exact call the start menu's Load makes and the one `main.ts` makes at
    // a refresh. Its store starts empty, which is the whole point: everything
    // below has to have come out of the file.
    const back = rig(storage);

    expect(back.appState.get().windows.open).toEqual([]);
    expect(back.session.load()).toEqual({ ok: true, value: undefined });

    // THE GOAL: the desk the player left. A desktop built onto this store has
    // to derive THIS, and a desktop that assumed a fresh morning derived an
    // empty screen from it - which is the box red this gate is for.
    const resumed = screenFrom(back.appState.get().windows, apps(), VIEWPORT);

    // Bottom of the pile first, and focusing the directory raised it to the
    // top - so this is the z-order the player left, which is the order that
    // decides which app the lead names when he catches them.
    expect(resumed.windows.map((entry) => entry.appId))
      .toEqual(['browser', 'tickets', 'directory']);
    expect(resumed.windows.map((entry) => entry.minimized))
      .toEqual([true, false, false]);
    expect(resumed.focusedId).toBe('directory');
    // And it is the same screen, by the same pair of functions the save uses.
    expect(windowsStateOf(resumed)).toEqual(windowsStateOf(desk));
  });

  it('drops a window whose program is no longer on the machine', () => {
    // The install set rides the save too, so a toy that was uninstalled between
    // the save and the load has no definition to reopen into. Skipped rather
    // than refused - the callers rebuild the app surfaces before asking, so by
    // the time this runs "not in the manifest" means gone on purpose.
    const screen = screenFrom(
      {
        open: [
          { appId: 'directory', minimized: false },
          { appId: 'solitaire', minimized: false },
        ],
        focusedId: 'directory',
      },
      apps().filter((app) => app.id !== 'solitaire'),
      VIEWPORT,
    );

    expect(screen.windows.map((entry) => entry.appId)).toEqual(['directory']);
    expect(screen.focusedId).toBe('directory');
  });

  it('is an empty desk for a browser that has never played', () => {
    // The fresh-boot path, unchanged by construction: a store nobody has
    // written a window into derives exactly the empty manager the mount used to
    // build by hand, so the boot that stands a new week up paints what it
    // always painted.
    const fresh = new AppStateStore();

    expect(screenFrom(fresh.get().windows, apps(), VIEWPORT))
      .toEqual(createWindowManager(VIEWPORT));
  });
});

/**
 * THE ORDERING, and the reason both e2e resume journeys can claim a brief.
 *
 * `clockOff` walks the world into the next morning, `announce()`s it, and only
 * then calls `onDayBoundary` - which is where the save is written. So every
 * listener has already seen `morning_brief` on the new day by the time the file
 * is taken, and the desktop's listener is the one that puts the brief up
 * (`syncDayScreens`, off the day it just heard about). The brief window is
 * therefore IN the boundary save, and a refresh comes back to a desk with it
 * on rather than to a bare one with the day's own screen a press away.
 *
 * Teeth: move `this.handlers.onDayBoundary()` above `this.announce()` in
 * `clockOff` and this reds - the save would be taken on a desk that had not
 * been told the day had turned, and both journeys' brief assertions would
 * become wrong without a single unit test noticing.
 */
describe('the day boundary', () => {
  it('announces the morning before it asks for the save', () => {
    const storage = new MemoryStorage();
    const heard: string[] = [];
    const live = rig(storage, () => {
      heard.push('save');
    });

    live.driver.onChanged(() => {
      heard.push(`${live.driver.state()}:${String(live.driver.day())}`);
    });

    live.driver.startShift();

    for (let step = 0; step < 700 && live.driver.state() !== 'day_end'; step += 1) {
      live.driver.step(TICK_INTERVAL_MS);
    }

    expect(live.driver.state()).toBe('day_end');
    heard.length = 0;
    live.driver.clockOff();

    // The save is the last thing the boundary does, and the announcement
    // immediately before it already says it is Tuesday morning.
    expect(heard.at(-1)).toBe('save');
    expect(heard.at(-2)).toBe('morning_brief:2');
    expect(live.driver.day()).toBe(2);
  });
});
