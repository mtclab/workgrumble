import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from './index';
import {
  canInstall,
  canUninstall,
  INSTALLABLE_APP_IDS,
  INSTALLABLE_MANIFEST,
  installableApp,
  isInstallableId,
  resolveManifest,
} from './installable';

function reasonOf(result: { ok: boolean; reason?: string }): string {
  return result.ok ? '' : (result.reason ?? '');
}

describe('the installable catalogue', () => {
  it('is disjoint from the base roster', () => {
    // The three categories only stay apart if an id belongs to exactly one of
    // them. A collision would make resolveManifest throw on the union.
    const base = new Set(APP_MANIFEST.map((app) => app.id));

    for (const id of INSTALLABLE_APP_IDS) {
      expect(base.has(id), id).toBe(false);
    }
  });

  it('knows its own ids and refuses the rest', () => {
    const [first] = INSTALLABLE_MANIFEST;
    expect(first).toBeDefined();
    expect(isInstallableId(first?.id)).toBe(true);
    expect(installableApp(first?.id ?? '')).toBe(first);

    // A base app is emphatically not installable - it ships - and garbage is
    // garbage. This is the "refuse garbage" the app-state parse leans on.
    expect(isInstallableId(APP_MANIFEST[0]?.id)).toBe(false);
    expect(isInstallableId('not-a-real-app')).toBe(false);
    expect(isInstallableId(42)).toBe(false);
    expect(installableApp('not-a-real-app')).toBeUndefined();
  });
});

describe('resolving the manifest the desktop mounts', () => {
  it('is the base roster, unchanged, with an empty install set', () => {
    // The determinism guarantee for the desktop: install nothing and the
    // resolved manifest is byte-for-byte the base one - same reference, even -
    // which is why the golden weeks do not move.
    expect(resolveManifest(APP_MANIFEST, [])).toBe(APP_MANIFEST);
  });

  it('adds an installed app to the base roster', () => {
    const toy = INSTALLABLE_MANIFEST[0];
    expect(toy).toBeDefined();

    const resolved = resolveManifest(APP_MANIFEST, [toy?.id ?? '']);

    expect(resolved.length).toBe(APP_MANIFEST.length + 1);
    expect(resolved.map((app) => app.id)).toContain(toy?.id);
    // Base first, install after: the roster order the desktop mounts in.
    expect(resolved.slice(0, APP_MANIFEST.length).map((app) => app.id))
      .toEqual(APP_MANIFEST.map((app) => app.id));
  });

  it('drops an unknown or duplicated installed id rather than crashing', () => {
    const toy = INSTALLABLE_MANIFEST[0];

    // Belt and braces on top of the parse: an id the catalogue does not hold is
    // ignored, and the same id twice is collapsed to one mount.
    expect(resolveManifest(APP_MANIFEST, ['not-a-real-app'])).toBe(APP_MANIFEST);
    expect(
      resolveManifest(APP_MANIFEST, [toy?.id ?? '', toy?.id ?? '']).length,
    ).toBe(APP_MANIFEST.length + 1);
  });
});

/**
 * P1-C: the state-aware guard the store consults before it dispatches.
 *
 * Every refusal here is a bug the shipped store would otherwise have: a fresh
 * audit line for a toy already installed, a false removal for one that is not,
 * and - the serious one - an unknown id reaching the install set, which makes
 * the next save one the strict parse refuses to load.
 */
describe('whether an install move is legal', () => {
  const toy = INSTALLABLE_MANIFEST[0]?.id ?? '';

  it('allows installing a known program that is not installed', () => {
    expect(canInstall([], toy)).toEqual({ ok: true });
  });

  it('refuses an unknown id before it can reach the install set', () => {
    // The load-bearing one: an unknown id in the save-carried set is dropped by
    // resolveManifest, so a save carrying it is one the parse refuses - an
    // unloadable file made by a click. The guard stops it entering at all.
    const result = canInstall([], 'not-a-real-app');
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain('not a program');
  });

  it('refuses installing something already installed', () => {
    // A second install would write a second audit line and re-arm the lead's
    // beat for a toy already on the desktop, with nothing new to show.
    const result = canInstall([toy], toy);
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain('already installed');
  });

  it('allows uninstalling something installed, refuses one that is not', () => {
    expect(canUninstall([toy], toy)).toEqual({ ok: true });

    // Taking off something absent would write a removal record for a program
    // that was never on the machine.
    const result = canUninstall([], toy);
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain('not installed');
  });
});
