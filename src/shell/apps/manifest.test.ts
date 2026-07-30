import { describe, expect, it } from 'vitest';

import { ICON_IDS } from '../icons';
import { APP_MANIFEST } from './index';
import {
  appsForTier,
  loadManifest,
} from './manifest';
import type { AppDef } from './types';

function app(id: string, tier: number): AppDef {
  return {
    id,
    title: `App ${id}`,
    icon: `icon-${id}`,
    tier_required: tier,
    slack: false,
    mount: () => ({ unmount: (): void => {} }),
  };
}

describe('app manifest', () => {
  it('loads an immutable ordered manifest', () => {
    const manifest = loadManifest([
      app('about', 0),
      app('bubbles', 1),
      app('future', 3),
    ]);

    expect(manifest.map(({ id }) => id)).toEqual([
      'about',
      'bubbles',
      'future',
    ]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest[0])).toBe(true);
  });

  it('filters by inclusive tier without reordering the manifest', () => {
    const manifest = loadManifest([
      app('tier-two-first', 2),
      app('starter', 0),
      app('tier-one', 1),
    ]);

    expect(appsForTier(manifest, 1).map(({ id }) => id)).toEqual([
      'starter',
      'tier-one',
    ]);
    expect(appsForTier(manifest, 2).map(({ id }) => id)).toEqual([
      'tier-two-first',
      'starter',
      'tier-one',
    ]);
  });

  it('rejects invalid tiers, blank fields, and duplicate ids', () => {
    expect(() => loadManifest([app('', 0)])).toThrow('non-empty');
    expect(() => loadManifest([app('bad-tier', -1)])).toThrow(
      'non-negative',
    );
    expect(() => loadManifest([app('same', 0), app('same', 1)])).toThrow(
      'Duplicate',
    );
    expect(() => appsForTier([], 1.5)).toThrow('non-negative');
  });
});

describe('shipped manifest', () => {
  it('ships the two demo apps in order', () => {
    expect(APP_MANIFEST.map(({ id }) => id)).toEqual(['about', 'bubbles']);
  });

  it('draws every icon in-repo instead of borrowing one', () => {
    for (const app of APP_MANIFEST) {
      expect(ICON_IDS).toContain(app.icon);
    }
  });

  it('keeps at least one slack app so the boss key has a target', () => {
    expect(APP_MANIFEST.some((app) => app.slack)).toBe(true);
    expect(APP_MANIFEST.some((app) => !app.slack)).toBe(true);
  });

  it('hides tier-gated apps from a tier-zero desktop', () => {
    expect(appsForTier(APP_MANIFEST, 0).map(({ id }) => id)).toEqual([
      'about',
    ]);
    expect(appsForTier(APP_MANIFEST, 1).map(({ id }) => id)).toEqual([
      'about',
      'bubbles',
    ]);
  });
});
