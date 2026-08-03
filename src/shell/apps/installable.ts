import type { DispatchResult } from '../../engine-api';
import { assertCaughtScenes } from '../../world/scenes';
import { ARCADE_APP } from './arcade';
import { MEDIA_APP } from './mediaplayer';
import { MINESWEEPER_APP } from './minesweeper';
import { SOLITAIRE_APP } from './solitaire';
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
 * a player later. All four toys below are `slack: true` - the joke arcade, a
 * media player, a real game of Klondike, and a real game of Minesweeper - each a
 * real slack app once installed, so each drags a caught scene along, and this
 * assertion proves it.
 */
export const INSTALLABLE_MANIFEST: readonly AppDef[] = assertCaughtScenes(
  loadManifest([ARCADE_APP, MEDIA_APP, SOLITAIRE_APP, MINESWEEPER_APP]),
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
 * Whether an install of `id` into `installed` is a legal move, and why not.
 *
 * The state-aware guard the store consults BEFORE it dispatches the world verb,
 * because the world holds the audit trail and not the current install set. It
 * refuses the two moves that are wrong from the player's chair:
 *
 * - an id the catalogue does not hold, which must never reach the install set:
 *   an unknown id there is one `resolveManifest` drops, so the next save would
 *   be one the strict parse refuses - an unloadable file made by a click;
 * - an id already installed, which a second install would only re-audit and
 *   re-arm the lead's beat for, with nothing new on the desktop to show for it.
 *
 * Pure and total, so the desktop's guard is the same thing a test can drive.
 */
export function canInstall(
  installed: readonly string[],
  id: string,
): DispatchResult {
  if (!INSTALLABLE_APP_IDS.has(id)) {
    return {
      ok: false,
      reason: `"${id}" is not a program this workstation knows how to install. `
        + 'Nothing has been put on the machine.',
    };
  }

  if (installed.includes(id)) {
    return {
      ok: false,
      reason: 'That is already installed. It is on the desktop and on the '
        + 'audit; installing it again would only write the audit a second time '
        + 'for a program that is already here.',
    };
  }

  return { ok: true };
}

/**
 * And whether an uninstall of `id` is legal: only if it is actually installed,
 * because taking off something that is not there would write a removal record
 * for a program that was never on the machine.
 */
export function canUninstall(
  installed: readonly string[],
  id: string,
): DispatchResult {
  if (!installed.includes(id)) {
    return {
      ok: false,
      reason: 'That is not installed, so there is nothing to take off - and '
        + 'nothing to record removing.',
    };
  }

  return { ok: true };
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
