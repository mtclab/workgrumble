import { assertCaughtScenes } from '../../world/scenes';
import { ARCADE_APP } from './arcade';
import { loadManifest } from './manifest';
import type { AppDef } from './types';

/**
 * The manifest, in three categories, and why the distinction is not a fudge.
 *
 * `APP_MANIFEST` (see `./index`) is the BASE roster: everything the build ships,
 * always present, always walked. This file is the OTHER two categories - the
 * apps you can install but have not, and the ones you have. An installable app
 * is one the web store can put on the machine; it is not a missing control
 * while it sits uninstalled (you have not installed it, so there is nothing to
 * walk), and its controls ARE walked once it is installed. The resolved manifest
 * the desktop mounts is `base ∪ installed`, computed here.
 *
 * The installable catalogue is scene-checked the same as the base roster: an
 * installable `slack` app is one somebody can be caught at, so shipping it
 * without the content for what happens then would fail the boot here rather than
 * a player later. The fixture below is `slack: false`, so that check is a no-op
 * for it - the toys that become slack apps arrive with lane B, and drag their
 * scenes along.
 */
export const INSTALLABLE_MANIFEST: readonly AppDef[] = assertCaughtScenes(
  loadManifest([ARCADE_APP]),
);

/** The ids the store can install, as a set for the quick membership questions. */
export const INSTALLABLE_APP_IDS: ReadonlySet<string> = new Set(
  INSTALLABLE_MANIFEST.map((app) => app.id),
);

/**
 * Whether an id names something this build can actually install.
 *
 * The app-state parse reads this to refuse a saved install set that names
 * something the catalogue does not hold - the same "refuse garbage" strictness
 * the dismissal count keeps for a non-integer, because an installed id pointing
 * at nothing is a manifest that would mount a window with no definition behind
 * it.
 */
export function isInstallableId(id: unknown): id is string {
  return typeof id === 'string' && INSTALLABLE_APP_IDS.has(id);
}

/**
 * The definition for an installable id, or undefined for one this build does
 * not know.
 */
export function installableApp(id: string): AppDef | undefined {
  return INSTALLABLE_MANIFEST.find((app) => app.id === id);
}

/**
 * The manifest as the desktop should mount it: the base roster, plus every
 * installed app the catalogue recognises, in base order then install order.
 *
 * An unknown installed id is dropped rather than crashing the mount - the parse
 * refuses those on the way in, so one reaching here is belt-and-braces - and a
 * duplicate install is collapsed. It runs the union back through `loadManifest`,
 * which re-validates and re-freezes and would throw on an installable id that
 * collided with a base one, a collision this catalogue is built to never have.
 *
 * With an EMPTY install set the answer is the base roster, unchanged - which is
 * every scripted walk, and the reason the golden weeks are byte-identical.
 */
export function resolveManifest(
  base: readonly AppDef[],
  installedIds: readonly string[],
): readonly AppDef[] {
  const seen = new Set<string>();
  const installed: AppDef[] = [];

  for (const id of installedIds) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    const app = installableApp(id);

    if (app !== undefined) {
      installed.push(app);
    }
  }

  return installed.length === 0
    ? base
    : loadManifest([...base, ...installed]);
}
