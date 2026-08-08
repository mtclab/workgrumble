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
  it('ships the day screens and the helpdesk apps ahead of the demo apps', () => {
    expect(APP_MANIFEST.map(({ id }) => id)).toEqual([
      'brief',
      'scorecard',
      'weekend',
      'caught',
      'call',
      'meeting',
      'reboot',
      'review',
      'beer',
      'tickets',
      'directory',
      'remote',
      'monitor',
      'events',
      'chat',
      'hubbub',
      'mail',
      'cmd',
      'kb',
      'about',
      'display',
      'updates',
      'feedback',
      'bubbles',
      'browser',
    ]);
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

  /**
   * Tier zero is the bare workstation, and the four things on it are the four
   * that are about the MACHINE rather than about the job: what this is, what it
   * LOOKS like, what it just installed, and how to say it is broken. A tester
   * whose build fails before it can hand out a helpdesk still has to be able to
   * report that, so none of them is gated behind a promotion.
   *
   * Display Properties (0.27.0) is on this list rather than with the tools for
   * the same reason About is: it is a window about the box. What it can DO is
   * gated - a service-desk player is refused a Linux desktop, in a sentence -
   * but the gate belongs on the choice, not on the window: a control somebody
   * cannot even find is a control that teaches nobody why.
   */
  it('hides tier-gated apps from a tier-zero desktop', () => {
    expect(appsForTier(APP_MANIFEST, 0).map(({ id }) => id)).toEqual([
      'about',
      'display',
      'updates',
      'feedback',
    ]);
    expect(appsForTier(APP_MANIFEST, 1).map(({ id }) => id)).toEqual([
      'brief',
      'scorecard',
      'weekend',
      'caught',
      'call',
      'meeting',
      'reboot',
      'review',
      'beer',
      'tickets',
      'directory',
      'remote',
      'monitor',
      'events',
      'chat',
      'hubbub',
      'mail',
      'cmd',
      'kb',
      'about',
      'display',
      'updates',
      'feedback',
      'bubbles',
      'browser',
    ]);
  });

  /**
   * The day's own screens are opened by the day and never by an icon: an entry
   * for "the morning brief" among the tools would read as a tool. They keep
   * their start-menu entry, because a screen that cannot be reopened is a dead
   * end - which is exactly what the desktop flag is allowed to cost.
   */
  it('keeps the day screens off the desktop and in the start menu', () => {
    const hidden = APP_MANIFEST.filter((app) => app.desktop === false);
    expect(hidden.map(({ id }) => id))
      .toEqual([
        'brief',
        'scorecard',
        'weekend',
        'caught',
        // The three the DAY opens and the player never asks for: a phone that
        // is ringing, half an hour that was booked on the Monday, and a
        // workstation that has decided to install something.
        'call',
        'meeting',
        'reboot',
        'review',
        'beer',
      ]);

    const dayScreens = new Set(hidden.map(({ id }) => id));

    for (const app of APP_MANIFEST) {
      if (!dayScreens.has(app.id)) {
        expect(app.desktop, app.id).not.toBe(false);
      }
    }
  });

  it('gates every helpdesk app behind the helpdesk tier', () => {
    for (const id of [
      'brief',
      'scorecard',
      'weekend',
      'caught',
      'call',
      'meeting',
      'reboot',
      'review',
      'beer',
      'tickets',
      'directory',
      'remote',
      'monitor',
      'events',
      'chat',
      'hubbub',
      'mail',
      'cmd',
      'kb',
    ]) {
      expect(
        APP_MANIFEST.find((app) => app.id === id)?.tier_required,
      ).toBe(1);
      expect(APP_MANIFEST.find((app) => app.id === id)?.slack).toBe(false);
    }
  });
});
