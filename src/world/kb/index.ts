import { KB_ARTICLES } from './articles';
import type { KbArticle } from './types';

export type { KbArticle } from './types';

const ID_PREFIX = 'kb/';

/**
 * Load-time content gate: an article that links to nothing, or a "see also"
 * pointing at an article nobody wrote, is a dead end - and a dead end in the
 * learner path is the one place this product cannot afford one.
 */
export function validateKbArticles(
  articles: readonly KbArticle[],
): readonly KbArticle[] {
  const ids = new Set<string>();

  for (const article of articles) {
    if (!article.id.startsWith(ID_PREFIX) || article.id.length <= ID_PREFIX.length) {
      throw new Error(`Article id "${article.id}" must look like "kb/slug".`);
    }

    if (ids.has(article.id)) {
      throw new Error(`Duplicate knowledge-base article "${article.id}".`);
    }

    ids.add(article.id);

    if (article.title.trim().length === 0) {
      throw new Error(`Article "${article.id}" has no title.`);
    }

    if (article.summary.trim().length === 0) {
      throw new Error(`Article "${article.id}" has no summary.`);
    }

    if (article.body.length === 0
      || article.body.some((paragraph) => paragraph.trim().length === 0)) {
      throw new Error(`Article "${article.id}" has an empty paragraph.`);
    }
  }

  for (const article of articles) {
    for (const reference of article.see_also) {
      if (!ids.has(reference)) {
        throw new Error(
          `Article "${article.id}" points at missing article "${reference}".`,
        );
      }

      if (reference === article.id) {
        throw new Error(`Article "${article.id}" points at itself.`);
      }
    }
  }

  return Object.freeze([...articles]);
}

export const WORLD_KB: readonly KbArticle[] = validateKbArticles(KB_ARTICLES);

export function findKbArticle(id: string): KbArticle | undefined {
  return WORLD_KB.find((article) => article.id === id);
}

/** `kb/print-spooler` -> `print-spooler`, for element ids and test hooks. */
export function kbSlug(id: string): string {
  return id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;
}
