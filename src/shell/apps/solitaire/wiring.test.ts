/**
 * Office Solitaire is wired as an installable slack toy - exactly the arcade's
 * rails - and NOT as a base app. This gate holds both halves at once, because
 * the two ways to get it wrong are opposite: forget a rail and the toy is a dead
 * end when installed; add it to the base roster and it lands in the golden weeks
 * and moves their byte-for-byte hash.
 *
 * Teeth are named per assertion: the exact change that turns each red.
 */

import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from '../index';
import { INSTALLABLE_APP_IDS, installableApp } from '../installable';
import { BROWSER_SITES } from '../browser-sites';
import { caughtScene } from '../../../world/scenes';
import { slackRate } from '../../../world/meters';
import { INSTALLED_TOY_SLACK_RATE } from '../../../world/software';
import { SOLITAIRE_APP } from './index';

describe('Office Solitaire, wired as an installable slack toy', () => {
  it('is installable and is NOT a base app', () => {
    // Teeth: add SOLITAIRE_APP to APP_MANIFEST and the second half reds - which
    // is the assertion standing between the toy and the golden weeks. A scripted
    // walk mounts the base roster, so a toy absent from it is a toy never opened.
    expect(INSTALLABLE_APP_IDS.has('solitaire')).toBe(true);
    // The catalogue freezes a shallow copy of each def, so compare by value - a
    // deep-equal that carries the same id and the same mount through.
    expect(installableApp('solitaire')).toEqual(SOLITAIRE_APP);
    expect(APP_MANIFEST.map((app) => app.id)).not.toContain('solitaire');
  });

  it('is a slack app that drips at the installed-toy rate', () => {
    // Teeth: drop `slack: true` and it drips nothing and cannot be caught; drop
    // its SLACK_RATES entry and it falls back to the default rate, quietly
    // making the strongest medicine as weak as the bubbles.
    expect(SOLITAIRE_APP.slack).toBe(true);
    expect(slackRate('solitaire')).toEqual(INSTALLED_TOY_SLACK_RATE);
  });

  it('has a caught scene of its own, about the game on the screen', () => {
    // Teeth: the manifest refuses to boot a slack app with no scene, so this is
    // belt-and-braces on the boot gate - and it pins the scene to the specific
    // thing that was up rather than a generic telling-off.
    const scene = caughtScene('solitaire');
    expect(scene).toBeDefined();
    expect(scene?.fileSubject).toContain('card');
    expect(scene?.dismissLabel.length).toBeGreaterThan(0);
  });

  it('fills a real row in the web store, not a greyed one', () => {
    // Teeth: the store's install rows must equal the catalogue (browser-sites
    // enforces the set); this names the row so a rename or a regression to a
    // "coming soon" placeholder reds here too.
    const store = BROWSER_SITES.find((site) => site.page.kind === 'store');
    expect(store?.page.kind).toBe('store');

    if (store?.page.kind !== 'store') {
      return;
    }

    const row = store.page.programs.find((program) => program.appId === 'solitaire');
    expect(row?.name).toBe('Office Solitaire');
    expect(row?.blurb.length ?? 0).toBeGreaterThan(20);
  });
});
