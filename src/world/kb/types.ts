/**
 * A knowledge-base article. Content, not code: the wiki app renders whatever
 * is in this shape, and a ticket links to one by `kb_ref`.
 */
export interface KbArticle {
  /** `kb/<slug>` - the same string a ticket's `kb_ref` carries. */
  readonly id: string;
  readonly title: string;
  /** One line for the article list. */
  readonly summary: string;
  /** Paragraphs, in reading order. */
  readonly body: readonly string[];
  /** Other article ids worth reading next. */
  readonly see_also: readonly string[];
}
