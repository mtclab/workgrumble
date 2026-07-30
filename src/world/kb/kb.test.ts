import { describe, expect, it } from 'vitest';

import { WORLD_TICKETS } from '../tickets';
import { findKbArticle, kbSlug, validateKbArticles, WORLD_KB } from './index';
import type { KbArticle } from './types';

function article(overrides: Partial<KbArticle> = {}): KbArticle {
  return {
    id: 'kb/fixture',
    title: 'Fixture',
    summary: 'A fixture.',
    body: ['A paragraph.'],
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
    expect(() => validateKbArticles([article({ body: [] })]))
      .toThrow('empty paragraph');
    expect(() => validateKbArticles([article({ body: ['ok', '  '] })]))
      .toThrow('empty paragraph');
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
      expect(entry.body.length, entry.id).toBeGreaterThanOrEqual(3);

      for (const paragraph of entry.body) {
        expect(paragraph.length, entry.id).toBeGreaterThan(80);
      }
    }
  });

  it('names each article by a slug the UI can hang an id on', () => {
    expect(kbSlug('kb/print-spooler')).toBe('print-spooler');
    expect(kbSlug('print-spooler')).toBe('print-spooler');
    expect(new Set(WORLD_KB.map(({ id }) => kbSlug(id))).size)
      .toBe(WORLD_KB.length);
  });
});
