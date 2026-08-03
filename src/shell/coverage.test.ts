import { describe, expect, it } from 'vitest';

import { COMMANDS } from './apps/cmd-parse';
import { APP_MANIFEST } from './apps/index';
import { INSTALLABLE_MANIFEST } from './apps/installable';
import {
  ACTIONS_WITHOUT_A_CONTROL,
  COVERAGE,
  coverageEntry,
  coverageFor,
  SCENES_WITHOUT_A_ROUTE,
  SHELL_SURFACES,
  WALK_RUNS,
  WINDOW_ROUTES,
} from './coverage';
import { helpdeskActions } from '../world/actions';
import { DEMO_ACTION_DATA } from '../world/demo-world';
import { DRINK_LABELS } from '../world/consumables';
import {
  BEER_AFTERMATH,
  BEER_SCENE,
  CAUGHT_SCENES,
  UNCAUGHT_SCENE,
} from '../world/scenes';
import { REVIEW_OUTCOMES } from '../world/week';

/**
 * The completeness gate.
 *
 * Everything below walks a REGISTRY - the installed apps, the terminal's
 * grammar, the action payload the engine is actually handed, the scene tables,
 * the desk's own phases - and diffs it against `coverage.ts`. None of it
 * inspects the walk; the walk polices itself against the same list on the
 * served build. What this half forbids is a product that has grown a function
 * nobody wrote down, which is the only way the walk can be complete and wrong
 * at the same time.
 *
 * Every assertion here is two-sided on purpose. A missing entry is a hole; a
 * stale one is a claim about a control that no longer exists, and a list that
 * only grows is a list that stops being true.
 */

/** Everything registered with the engine, which is what a player can cause. */
const REGISTERED_ACTIONS: readonly string[] = [
  ...DEMO_ACTION_DATA.map((action) => action.id),
  ...helpdeskActions().map((action) => action.id),
];

const APP_IDS: readonly string[] = APP_MANIFEST.map((app) => app.id);

/**
 * The third category: apps the web store can install but the build does not
 * ship on the desktop.
 *
 * An installable app is a valid surface for a coverage entry - its controls are
 * real and get walked once it is installed - but it is NOT a base app, so it is
 * not held to the "every app has a window entry" rule the base roster is. That
 * is the honest distinction the slice turns on: an installable-not-installed app
 * is neither a missing control (nobody installed it) nor a forbidden extra (the
 * catalogue knows it). Lane A ships the catalogue and no walked installable
 * entries; lane B installs one and walks it, and its entries slot in here.
 */
const INSTALLABLE_IDS: readonly string[] = INSTALLABLE_MANIFEST.map(
  (app) => app.id,
);

const SURFACES: readonly string[] = [
  ...APP_IDS,
  ...INSTALLABLE_IDS,
  ...SHELL_SURFACES,
];

/** The scenes this build can put in front of a player, derived from content. */
const SCENE_KEYS: readonly string[] = [
  // One per slack app, and the manifest refuses to boot a slack app without
  // one - so a new toy drags a new scene and a new entry along behind it.
  ...CAUGHT_SCENES.map((scene) => `caught.${scene.appId}`),
  // The absence of a telling-off, which is its own screen.
  'caught.none',
  // And the one telling-off that is not about an app at all: the status,
  // read against a morning of dispatches. It is named here rather than
  // derived because it is not one-per-slack-app - nobody can install a dot,
  // and the loader has nothing to refuse to boot without it.
  'caught.presence',
  // The other one that is not about a screen: the install audit, read at an
  // arrival. Named here rather than derived for the same reason - it is not
  // one-per-slack-app, it is one conversation about the whole list.
  'caught.software',
  ...REVIEW_OUTCOMES.map((outcome) => `review.${outcome}`),
  'beer.sealed',
  'beer.opened',
  ...Object.keys(SCENES_WITHOUT_A_ROUTE),
];

/** The states the desk can be in, from the desk's own labels. */
const CONSUMABLE_KEYS: readonly string[] = [
  ...Object.keys(DRINK_LABELS).map((phase) => `drink.${phase}`),
  'desk.empties',
  'desk.beer',
];

function sorted(values: Iterable<string>): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function claimed(key: 'scene' | 'consumable' | 'command'): readonly string[] {
  return sorted(new Set(
    COVERAGE.flatMap((entry) => {
      const value = entry[key];
      return value === undefined ? [] : [value];
    }),
  ));
}

describe('coverage manifest', () => {
  it('is a list of unique, described, placed entries', () => {
    const ids = new Set<string>();

    for (const entry of COVERAGE) {
      expect(ids.has(entry.id), `duplicate entry "${entry.id}"`).toBe(false);
      ids.add(entry.id);

      expect(entry.id.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.control.trim().length, entry.id).toBeGreaterThan(0);
      // A sentence, not a label: the walk names the entry and prints this when
      // a step fails, and "button" is not a thing anybody can act on.
      expect(entry.does.trim().length, entry.id).toBeGreaterThan(20);
      expect(SURFACES, entry.id).toContain(entry.surface);
      expect(Object.keys(WALK_RUNS), entry.id).toContain(entry.run);
    }
  });

  it('says why anything covered outside the week is outside it', () => {
    for (const entry of COVERAGE) {
      if (entry.run === 'week') {
        expect(entry.why, entry.id).toBeUndefined();
        continue;
      }

      // A run of its own is a claim that one week cannot hold this function,
      // and a claim with no reason is a skipped test with a label on it.
      expect(entry.why?.trim().length ?? 0, entry.id).toBeGreaterThan(20);
    }
  });

  it('gives every run of the walk something to walk', () => {
    for (const run of Object.keys(WALK_RUNS)) {
      expect(
        coverageFor(run as keyof typeof WALK_RUNS).length,
        `run "${run}" covers nothing`,
      ).toBeGreaterThan(0);
    }
  });

  it('finds an entry by id and refuses one that is not there', () => {
    expect(coverageEntry('desk.tidy').surface).toBe('desk');
    expect(() => coverageEntry('desk.polish')).toThrow('not a coverage entry');
  });

  /* -- the registries ----------------------------------------------------- */

  it('covers every installed app, by the routes it actually opens by', () => {
    const windows = COVERAGE.filter((entry) => entry.window !== undefined);
    const windowSurfaces = windows.map((entry) => entry.surface);

    // Three categories, and the walk keeps them apart. Every BASE app has a
    // window entry - shipped-always-present, always walked - which is the
    // equality below, read off the base roster and nothing else. An INSTALLABLE
    // app's entry is optional: it is walked when installed and absent when it is
    // not, so it may not appear in the base equality (that would demand the
    // week install it) and it may not be a surface the catalogue does not know.
    const baseSurfaces = windowSurfaces.filter((id) => APP_IDS.includes(id));
    const installableSurfaces = windowSurfaces.filter(
      (id) => !APP_IDS.includes(id),
    );

    expect(sorted(baseSurfaces)).toEqual(sorted(APP_IDS));

    // An installable window entry that names something the catalogue does not
    // hold is a fudge - a surface pretending to be installable to dodge the
    // base rule - and this is what refuses it.
    for (const id of installableSurfaces) {
      expect(INSTALLABLE_IDS, id).toContain(id);
    }

    for (const entry of windows) {
      const app = [...APP_MANIFEST, ...INSTALLABLE_MANIFEST].find(
        (candidate) => candidate.id === entry.surface,
      );
      const routes = entry.window?.routes ?? [];

      expect(app, entry.id).toBeDefined();

      for (const route of routes) {
        expect(WINDOW_ROUTES, entry.id).toContain(route);
      }

      // Every app is in the start menu, because a screen you cannot reopen is
      // a dead end. The icon grid and the day's own screens are the two halves
      // of the same rule, read off the manifest rather than asserted by hand.
      expect(routes, entry.id).toContain('start-menu');

      if (app?.desktop === false) {
        expect(routes, entry.id).toContain('day');
        expect(routes, entry.id).not.toContain('desktop-icon');
        continue;
      }

      expect(routes, entry.id).toContain('desktop-icon');
      expect(routes, entry.id).not.toContain('day');
    }
  });

  it('covers every command the terminal admits to having', () => {
    expect(claimed('command')).toEqual(
      sorted(COMMANDS.map((spec) => spec.name)),
    );
  });

  it('accounts for every registered action, once', () => {
    const reached = new Set(COVERAGE.flatMap((entry) => entry.actions ?? []));
    const explained = new Set(Object.keys(ACTIONS_WITHOUT_A_CONTROL));
    const both = [...reached].filter((action) => explained.has(action));

    // A verb cannot be both reachable and unreachable: the table is for the
    // ones the day loop and the world drive, and an entry that reaches one is
    // the better answer.
    expect(both).toEqual([]);
    expect(sorted([...reached, ...explained])).toEqual(
      sorted(REGISTERED_ACTIONS),
    );

    for (const [action, why] of Object.entries(ACTIONS_WITHOUT_A_CONTROL)) {
      expect(why.trim().length, action).toBeGreaterThan(20);
    }
  });

  it('covers every scene this build can put on the screen', () => {
    // A scene cannot be both walked and unreachable, which is the same rule
    // the action table keeps one test up: the entry that DRIVES it is always
    // the better answer, and a key in both lists would be a claim and its own
    // excuse sitting side by side.
    const explained = new Set(Object.keys(SCENES_WITHOUT_A_ROUTE));

    expect(claimed('scene').filter((scene) => explained.has(scene))).toEqual([]);
    // The scene keys are DERIVED - one per slack app, one per review outcome -
    // so a scene that is both a derived key and an explained one appears
    // twice in the list they are read off. The comparison is of the SETS.
    expect([
      ...claimed('scene'),
      ...explained,
    ].sort((left, right) => left.localeCompare(right)))
      .toEqual(sorted(new Set(SCENE_KEYS)));

    // The two the scene keys above are named after, so deleting one is a
    // failure here rather than a quietly shorter list.
    expect(UNCAUGHT_SCENE.title.length).toBeGreaterThan(0);
    expect(BEER_SCENE.title.length).toBeGreaterThan(0);
    expect(BEER_AFTERMATH.title.length).toBeGreaterThan(0);
  });

  it('covers every state the desk can be in', () => {
    expect(claimed('consumable')).toEqual(sorted(CONSUMABLE_KEYS));
  });

  it('covers every screen the day puts up by itself', () => {
    const screens = APP_MANIFEST
      .filter((app) => app.desktop === false)
      .map((app) => app.id);

    for (const screen of screens) {
      const entries = COVERAGE.filter((entry) => entry.surface === screen);
      // Not merely a window entry: a screen the day opens and nobody can do
      // anything on is the dead end the house rules forbid, so each one has to
      // carry at least one thing the player can DO as well.
      expect(entries.length, screen).toBeGreaterThan(1);
    }
  });
});
