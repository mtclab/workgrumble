/**
 * The four sites, as content.
 *
 * The gate that matters here is the one a runtime would only find when a
 * player opened the page: every picture is drawn out of this repo's own icon
 * sprite, and `createIcon` throws on an id nobody drew. A typo in a site file
 * would otherwise be a blank window with a caption under it.
 */

import { describe, expect, it } from 'vitest';

import { ICON_IDS } from '../icons';
import { INSTALLABLE_APP_IDS } from './installable';
import { BROWSER_SITES, browserSite } from './browser-sites';

describe('the browser sites', () => {
  it('ships four of them, each addressable and each unreachable', () => {
    expect(BROWSER_SITES).toHaveLength(4);
    expect(new Set(BROWSER_SITES.map((site) => site.id)).size).toBe(4);

    for (const site of BROWSER_SITES) {
      expect(site.title.length).toBeGreaterThan(0);
      // `.invalid` is reserved by the RFC precisely so it can never resolve:
      // a game that ships a real hostname in a fake browser is a game that
      // eventually points somebody at a domain squatter.
      expect(site.url).toContain('.invalid');
    }
  });

  it('lists only real installables in the web store, named to match', () => {
    const store = BROWSER_SITES.find((site) => site.page.kind === 'store');

    expect(store).toBeDefined();

    if (store === undefined || store.page.kind !== 'store') {
      return;
    }

    // The policy consequence stated honestly in-fiction, so the install is a
    // trade the player reads before they make it rather than a trap.
    expect(store.page.notice.length).toBeGreaterThan(20);

    const installable = store.page.programs.filter(
      (program) => program.appId !== undefined,
    );
    const soon = store.page.programs.filter(
      (program) => program.appId === undefined,
    );

    for (const program of installable) {
      expect(program.blurb.length).toBeGreaterThan(0);
      expect(program.register.length).toBeGreaterThan(0);
    }

    // EQUALITY with the catalogue, not subset: the store's install rows are
    // exactly the installable apps this build ships - no phantom row pointing at
    // a program that would mount empty, and no shipped installable the store
    // does not offer. A new INSTALLABLE_MANIFEST entry with no store row reds
    // here (and its missing walk route reds in coverage.test.ts).
    const storeIds = installable
      .map((program) => program.appId ?? '')
      .sort((left, right) => left.localeCompare(right));
    const catalogue = [...INSTALLABLE_APP_IDS]
      .sort((left, right) => left.localeCompare(right));
    expect(storeIds).toEqual(catalogue);

    // The catalogue lists more than ships - the greyed rows - which is the
    // cheap seam for later slices and half the joke.
    expect(soon.length).toBeGreaterThan(0);
  });

  it('draws every picture in-repo instead of fetching one', () => {
    for (const site of BROWSER_SITES) {
      if (site.page.kind !== 'gallery') {
        continue;
      }

      expect(site.page.pictures.length).toBeGreaterThan(0);

      for (const picture of site.page.pictures) {
        expect(ICON_IDS, picture.icon).toContain(picture.icon);
        // Line art is not self-explanatory; the caption is the joke and the
        // alt text is what it is a picture OF.
        expect(picture.alt.length).toBeGreaterThan(0);
        expect(picture.caption.length).toBeGreaterThan(0);
      }
    }
  });

  it('writes a thread that is a thread', () => {
    const forum = BROWSER_SITES.find((site) => site.page.kind === 'forum');

    expect(forum).toBeDefined();

    if (forum === undefined || forum.page.kind !== 'forum') {
      return;
    }

    expect(forum.page.posts.length).toBeGreaterThanOrEqual(5);

    for (const post of forum.page.posts) {
      expect(post.author.length).toBeGreaterThan(0);
      expect(post.when.length).toBeGreaterThan(0);
      expect(post.body.length).toBeGreaterThan(0);
      expect(post.body.every((line) => line.trim().length > 0)).toBe(true);
    }
  });

  it('answers with nothing for a page nobody bookmarked', () => {
    expect(browserSite(null)).toBeUndefined();
    expect(browserSite('intranet')).toBeUndefined();
    expect(browserSite('cats')?.title).toBe('Cat Pictures');
  });
});
