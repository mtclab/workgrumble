import { describe, expect, it } from 'vitest';

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
