import { KB_ARTICLES } from './articles';
import { isArticleState, type KbArticle } from './types';

export {
  ARTICLE_STATES,
  type ArticleState,
  isArticleState,
  type KbArticle,
} from './types';

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

    if (!isArticleState(article.state)) {
      throw new Error(
        `Article "${article.id}" is in no state anybody files an article in.`,
      );
    }

    if (article.issue.trim().length === 0) {
      throw new Error(
        `Article "${article.id}" has no Issue: nobody could match it to a `
        + 'ticket, which is the one thing an article is for.',
      );
    }

    if (article.environment.trim().length === 0) {
      throw new Error(`Article "${article.id}" has no Environment.`);
    }

    if (article.resolution.length === 0
      || article.resolution.some((step) => step.trim().length === 0)) {
      throw new Error(`Article "${article.id}" has an empty Resolution step.`);
    }

    // The Cause section is optional in the standard and mandatory here: it is
    // the honest explanation this product's learner path is made of, and an
    // article without one is a recipe rather than knowledge.
    if (article.cause.length === 0
      || article.cause.some((paragraph) => paragraph.trim().length === 0)) {
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

/**
 * The line a link writes into the ticket's internal record.
 *
 * KCS calls linking the article the solve, and the reason is bookkeeping
 * rather than ceremony: an article with tickets hanging off it is an article
 * somebody can prove is worth keeping. So the link leaves a work note, one
 * sentence, built here so the ticket, the KB and the tests all say it the same
 * way - and it says out loud when what was linked is a draft.
 */
export function articleLinkNote(article: Readonly<KbArticle>): string {
  return `Linked knowledge article ${article.id} - "${article.title}".${
    article.state === 'draft'
      ? ' It is a draft, which is worth saying before somebody follows it.'
      : ''
  }`;
}

/** `kb/print-spooler` -> `print-spooler`, for element ids and test hooks. */
export function kbSlug(id: string): string {
  return id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;
}
