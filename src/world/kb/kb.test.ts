import { describe, expect, it } from 'vitest';

import { WORLD_TICKETS } from '../tickets';
import { AUTHORED_ARTICLES } from './authored';
import {
  articleLinkNote,
  findKbArticle,
  kbSlug,
  validateKbArticles,
  WORLD_KB,
} from './index';
import type { KbArticle } from './types';

function article(overrides: Partial<KbArticle> = {}): KbArticle {
  return {
    id: 'kb/fixture',
    title: 'Fixture',
    summary: 'A fixture.',
    state: 'published',
    issue: 'It does not work and I have a meeting.',
    environment: 'A fixture, in a test, in a building that does not exist.',
    resolution: ['Turn it off.', 'Turn it on.'],
    cause: ['A paragraph explaining why, at some length.'],
    see_also: [],
    ...overrides,
  };
}

describe('knowledge base content gate', () => {
  it('accepts the shipped articles', () => {
    expect(validateKbArticles(WORLD_KB)).toHaveLength(WORLD_KB.length);
  });

  it('refuses an id that is not a kb reference', () => {
    expect(() => validateKbArticles([article({ id: 'display-rotation' })]))
      .toThrow('must look like');
  });

  it('refuses duplicates, empty text and empty bodies', () => {
    expect(() => validateKbArticles([article(), article()]))
      .toThrow('Duplicate');
    expect(() => validateKbArticles([article({ title: ' ' })]))
      .toThrow('no title');
    expect(() => validateKbArticles([article({ summary: '' })]))
      .toThrow('no summary');
    expect(() => validateKbArticles([article({ cause: [] })]))
      .toThrow('empty paragraph');
    expect(() => validateKbArticles([article({ cause: ['ok', '  '] })]))
      .toThrow('empty paragraph');
  });

  /**
   * The four sections are the article. A KCS article missing its Issue cannot
   * be matched to a ticket, one missing its Resolution is a diagnosis nobody
   * can act on, and one missing its Cause is the recipe this product exists
   * not to ship.
   */
  it('refuses an article that is missing one of its sections', () => {
    expect(() => validateKbArticles([article({ issue: '  ' })]))
      .toThrow('no Issue');
    expect(() => validateKbArticles([article({ environment: '' })]))
      .toThrow('no Environment');
    expect(() => validateKbArticles([article({ resolution: [] })]))
      .toThrow('empty Resolution step');
    expect(() => validateKbArticles([article({ resolution: ['do it', ' '] })]))
      .toThrow('empty Resolution step');
    // A state nobody files an article in, arriving the only way it can: out
    // of a save, a hand-edited content file, or a build that shipped half a
    // rename. The type says it cannot happen; the loader still checks.
    expect(() => validateKbArticles([
      { ...article(), state: 'validated-ish' } as unknown as KbArticle,
    ])).toThrow('no state');
  });

  it('refuses a see-also that leads nowhere, or in a circle of one', () => {
    expect(() => validateKbArticles([article({ see_also: ['kb/nothing'] })]))
      .toThrow('missing article');
    expect(() => validateKbArticles([article({ see_also: ['kb/fixture'] })]))
      .toThrow('points at itself');
  });
});

describe('shipped knowledge base', () => {
  it('files an article for every shipped ticket, by the reference it names', () => {
    for (const entry of WORLD_TICKETS) {
      expect(findKbArticle(entry.def.kb_ref), entry.def.kb_ref).toBeDefined();
    }
  });

  it('ships evergreen articles beyond the per-ticket ones', () => {
    const ticketRefs = new Set(WORLD_TICKETS.map(({ def }) => def.kb_ref));
    const evergreen = WORLD_KB.filter(({ id }) => !ticketRefs.has(id));

    expect(evergreen.length).toBeGreaterThanOrEqual(2);
  });

  it('explains the fix honestly enough to be worth reading', () => {
    for (const entry of WORLD_KB) {
      // The learner path is the point: a two-line stub with a joke in it is
      // not an explanation, and this is the only place that can say so.
      expect(entry.cause.length, entry.id).toBeGreaterThanOrEqual(2);

      for (const paragraph of entry.cause) {
        expect(paragraph.length, entry.id).toBeGreaterThan(80);
      }

      // And the fix half is steps rather than prose, because under a deadline
      // nobody reads a paragraph looking for the order to do things in.
      expect(entry.resolution.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(entry.issue.length, entry.id).toBeGreaterThan(40);
      expect(entry.environment.length, entry.id).toBeGreaterThan(20);
    }
  });

  /**
   * Every shelf has one. It is IN the list rather than hidden, because a draft
   * nobody can see is a draft nobody will ever finish - and it says so on the
   * row, on the page, and in the note a link to it writes.
   */
  it('ships exactly the drafts it means to, flagged as drafts', () => {
    // The SHIPPED shelf: everything somebody wrote before the player got here.
    // The articles the player writes are drafts too, and for a different and
    // sharper reason (E9, 0.36.0) - twenty minutes between two tickets is what
    // a draft IS - so they are counted apart rather than folded in.
    const drafts = WORLD_KB.filter(
      ({ id, state }) => state === 'draft' && !AUTHORED_ARTICLES.includes(id),
    );

    expect(drafts).toHaveLength(1);

    for (const draft of drafts) {
      expect(draft.title.toUpperCase()).toContain('DRAFT');
      expect(articleLinkNote(draft)).toContain('is a draft');
    }

    // And the player's own, which nobody has ever been given the afternoon to
    // validate. It says so in the note a link to it writes, which is the one
    // place a reader meets it under pressure.
    for (const id of AUTHORED_ARTICLES) {
      const written = findKbArticle(id);
      expect(written?.state, id).toBe('draft');
      expect(articleLinkNote(written ?? article())).toContain('is a draft');
    }

    // A published article that nobody has flagged says nothing about drafts.
    const published = findKbArticle('kb/print-spooler');
    expect(published?.state).toBe('published');
    expect(articleLinkNote(published ?? drafts[0] ?? article()))
      .not.toContain('is a draft');
  });

  it('writes a link note that names the article it links', () => {
    const spooler = findKbArticle('kb/print-spooler');

    expect(spooler).toBeDefined();
    expect(articleLinkNote(spooler ?? article())).toContain('kb/print-spooler');
    expect(articleLinkNote(spooler ?? article()))
      .toContain(spooler?.title ?? '');
  });

  it('names each article by a slug the UI can hang an id on', () => {
    expect(kbSlug('kb/print-spooler')).toBe('print-spooler');
    expect(kbSlug('print-spooler')).toBe('print-spooler');
    expect(new Set(WORLD_KB.map(({ id }) => kbSlug(id))).size)
      .toBe(WORLD_KB.length);
  });
});
