import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from './index';
import {
  INSTALLABLE_APP_IDS,
  INSTALLABLE_MANIFEST,
  installableApp,
  isInstallableId,
  resolveManifest,
} from './installable';

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
