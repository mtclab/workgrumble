/**
 * Office Minesweeper is wired as an installable slack toy - exactly Office
 * Solitaire's rails - and NOT as a base app. This gate holds both halves at
 * once, because the two ways to get it wrong are opposite: forget a rail and the
 * toy is a dead end when installed; add it to the base roster and it lands in
 * the golden weeks and moves their byte-for-byte hash.
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
import { MINESWEEPER_APP } from './index';

describe('Office Minesweeper, wired as an installable slack toy', () => {
  it('is installable and is NOT a base app', () => {
    // Teeth: add MINESWEEPER_APP to APP_MANIFEST and the last line reds - which
    // is the assertion standing between the toy and the golden weeks. A scripted
    // walk mounts the base roster, so a toy absent from it is a toy never opened.
    expect(INSTALLABLE_APP_IDS.has('minesweeper')).toBe(true);
    // The catalogue freezes a shallow copy of each def, so compare by value.
    expect(installableApp('minesweeper')).toEqual(MINESWEEPER_APP);
    expect(APP_MANIFEST.map((app) => app.id)).not.toContain('minesweeper');
  });

  it('is a slack app that drips at the installed-toy rate', () => {
    // Teeth: drop `slack: true` and it drips nothing and cannot be caught; drop
    // its SLACK_RATES entry and it falls back to the default rate, quietly
    // making the strongest medicine as weak as the bubbles.
    expect(MINESWEEPER_APP.slack).toBe(true);
    expect(slackRate('minesweeper')).toEqual(INSTALLED_TOY_SLACK_RATE);
  });

  it('has a caught scene of its own, about the game on the screen', () => {
    // Teeth: the manifest refuses to boot a slack app with no scene, so this is
    // belt-and-braces on the boot gate - and it pins the scene to the specific
    // thing that was up rather than a generic telling-off.
    const scene = caughtScene('minesweeper');
    expect(scene).toBeDefined();
    expect(scene?.fileSubject).toContain('Minesweeper');
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

    const row = store.page.programs.find((program) => program.appId === 'minesweeper');
    expect(row?.name).toBe('Office Minesweeper');
    expect(row?.blurb.length ?? 0).toBeGreaterThan(20);
  });
});
