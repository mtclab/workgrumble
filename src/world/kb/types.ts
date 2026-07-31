/**
 * A knowledge-base article, in the shape a real one has.
 *
 * KCS - the practice every service desk of this size claims to follow and half
 * of them actually do - files an article as four named sections rather than as
 * prose: Issue (the problem in the user's words), Environment (where it
 * happens), Resolution (the steps, in order) and Cause (why, which is the
 * optional one in the standard and mandatory here, because the honest
 * explanation IS the learner path this product promised).
 *
 * Content, not code: the wiki app renders whatever is in this shape, and a
 * ticket points at one by `kb_ref`.
 */

/**
 * Where an article is in its life.
 *
 * The real ladder is Draft -> Validated -> Published -> Retired. Two rungs are
 * enough to tell the truth this building has to tell: an article somebody
 * finished and an article somebody started, and the second one is still on the
 * shelf where the first one is, because nobody has ever been given the
 * afternoon to sort it out.
 */
export const ARTICLE_STATES = ['draft', 'published'] as const;

export type ArticleState = (typeof ARTICLE_STATES)[number];

export function isArticleState(value: unknown): value is ArticleState {
  return typeof value === 'string'
    && ARTICLE_STATES.some((state) => state === value);
}

export interface KbArticle {
  /** `kb/<slug>` - the same string a ticket's `kb_ref` carries. */
  readonly id: string;
  readonly title: string;
  /** One line for the article list. */
  readonly summary: string;
  readonly state: ArticleState;
  /** The symptom, as the person who filed it would describe it. */
  readonly issue: string;
  /** Which machines, accounts or corner of the estate this is about. */
  readonly environment: string;
  /** What to do, in the order it has to be done in. */
  readonly resolution: readonly string[];
  /** Why it happens. The half that turns a fix into knowing something. */
  readonly cause: readonly string[];
  /** Other article ids worth reading next. */
  readonly see_also: readonly string[];
}
