/**
 * "Report a real problem": one ticket about Workgrumble itself, filed as a
 * GitHub issue.
 *
 * Two rules shape everything here and both are about what does NOT go in.
 *
 * The badge is attached only when the player has ticked the box that says so.
 * A badge is the only identifier this product has, and a bug report that
 * silently carries one is a bug report that silently says who sent it - so the
 * tick is checked here, on the server, rather than being a client-side
 * courtesy that a different build could forget.
 *
 * The auto-context is non-personal by construction rather than by promise. It
 * is a fixed set of fields, each of them read out of the game's own state -
 * which day, which format, which build, which window was in front, the last
 * five things dispatched - and there is no field an IP address, a header or a
 * user agent could arrive in. Nothing about the request is recorded.
 *
 * Everything the player typed is treated as hostile text on the way into a
 * Markdown document: lengths capped, control characters dropped, and no
 * interpolation into anything that could be read as a directive.
 */

const MAX_SUMMARY = 120;
const MAX_DETAILS = 4_000;
const MAX_ACTIONS = 5;
const MAX_ACTION_ID = 64;

export const FEEDBACK_EMPTY = 'A report needs a line saying what happened. '
  + 'One sentence is plenty.';

export const FEEDBACK_MALFORMED = 'That report did not arrive in one piece. '
  + 'Nothing has been filed.';

export const FEEDBACK_UNSTAFFED = 'The post room is unstaffed: this build has '
  + 'nowhere to file a report right now. Nothing has been sent, and nothing '
  + 'you typed has been kept.';

export interface FeedbackContext {
  readonly day: number | null;
  readonly schema: number | null;
  readonly build: string | null;
  readonly core: string | null;
  readonly app: string | null;
  readonly actions: readonly string[];
}

export interface FeedbackReport {
  readonly summary: string;
  readonly details: string;
  /** Present only when the player asked to be contactable about it. */
  readonly badge: string | null;
  readonly context: FeedbackContext;
}

export type FeedbackParse =
  | { readonly ok: true; readonly report: FeedbackReport }
  | { readonly ok: false; readonly reason: string };

/**
 * Text on its way into a Markdown document.
 *
 * Control characters go (a newline is kept in the details and nowhere else),
 * backticks and the two characters that start an HTML tag are neutered, and
 * the whole thing is cut to length. GitHub does not execute Markdown, but an
 * issue body that can be made to close its own code fence is an issue body
 * that can be made to say something the player did not type.
 */
function clean(value: unknown, limit: number, keepNewlines: boolean): string {
  if (typeof value !== 'string') {
    return '';
  }

  const flattened = keepNewlines
    ? value.replaceAll('\r\n', '\n').replaceAll(/[^\S\n]/g, ' ')
    : value.replaceAll(/\s/g, ' ');

  return flattened
    // eslint-disable-next-line no-control-regex -- controls are the point
    .replaceAll(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replaceAll('`', "'")
    .replaceAll('<', '(')
    .replaceAll('>', ')')
    .trim()
    .slice(0, limit);
}

function wholeOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function textOrNull(value: unknown, limit: number): string | null {
  const cleaned = clean(value, limit, false);
  return cleaned.length === 0 ? null : cleaned;
}

function readContext(value: unknown): FeedbackContext {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawActions = Array.isArray(source.actions) ? source.actions : [];

  return {
    day: wholeOrNull(source.day),
    schema: wholeOrNull(source.schema),
    build: textOrNull(source.build, 40),
    core: textOrNull(source.core, 40),
    app: textOrNull(source.app, 40),
    actions: rawActions
      .slice(0, MAX_ACTIONS)
      .map((entry) => clean(entry, MAX_ACTION_ID, false))
      .filter((entry) => entry.length > 0),
  };
}

/**
 * A report off the wire.
 *
 * `badge` is passed in rather than read from the body: the only badge this can
 * ever attach is the one the request's own cookie proved, so a body claiming
 * somebody else's cannot be believed because it is never read.
 */
export function parseFeedback(value: unknown, badge: string): FeedbackParse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: FEEDBACK_MALFORMED };
  }

  const body = value as Record<string, unknown>;
  const summary = clean(body.summary, MAX_SUMMARY, false);
  const details = clean(body.details, MAX_DETAILS, true);

  if (summary.length === 0) {
    return { ok: false, reason: FEEDBACK_EMPTY };
  }

  return {
    ok: true,
    report: {
      summary,
      details,
      badge: body.contact === true ? badge : null,
      context: readContext(body.context),
    },
  };
}

export function issueTitle(report: Readonly<FeedbackReport>): string {
  return `[tester] ${report.summary}`.slice(0, MAX_SUMMARY + 16);
}

function line(label: string, value: string | number | null): string {
  return `- ${label}: ${value === null ? 'not reported' : String(value)}`;
}

export function issueBody(report: Readonly<FeedbackReport>): string {
  const { context } = report;
  const actions = context.actions.length === 0
    ? 'none since the last day boundary'
    : context.actions.join(', ');

  return [
    report.details.length === 0
      ? '_No further detail was given._'
      : report.details,
    '',
    '---',
    '',
    '**Automatic context** (no personal data is collected by this form):',
    '',
    line('Game day', context.day),
    line('Save format', context.schema),
    line('Build', context.build),
    line('Engine', context.core),
    line('Window in front', context.app),
    line('Last actions', actions),
    line(
      'Badge',
      report.badge === null
        ? 'not attached - the reporter did not ask to be contacted'
        : report.badge,
    ),
  ].join('\n');
}
