import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_EMPTY,
  FEEDBACK_MALFORMED,
  issueBody,
  issueTitle,
  parseFeedback,
} from './feedback';

const BADGE = 'WG-1234-AB';

function report(over: Record<string, unknown> = {}): unknown {
  return {
    summary: 'The spooler button does nothing on Thursday',
    details: 'Clicked it four times.',
    contact: false,
    context: {
      day: 4,
      schema: 3,
      build: '0.1.0',
      core: '0.4.0',
      app: 'remote',
      actions: ['service.restart', 'printer.clear_queue'],
    },
    ...over,
  };
}

describe('a report off the wire', () => {
  it('keeps what the player typed and the context the game read', () => {
    const parsed = parseFeedback(report(), BADGE);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.report.summary)
      .toBe('The spooler button does nothing on Thursday');
    expect(parsed.ok && parsed.report.context.day).toBe(4);
    expect(parsed.ok && parsed.report.context.actions)
      .toEqual(['service.restart', 'printer.clear_queue']);
  });

  it('needs a line saying what happened', () => {
    expect(parseFeedback(report({ summary: '   ' }), BADGE))
      .toEqual({ ok: false, reason: FEEDBACK_EMPTY });
    expect(parseFeedback(report({ summary: 7 }), BADGE))
      .toEqual({ ok: false, reason: FEEDBACK_EMPTY });
    expect(parseFeedback('a string', BADGE))
      .toEqual({ ok: false, reason: FEEDBACK_MALFORMED });
    expect(parseFeedback(null, BADGE))
      .toEqual({ ok: false, reason: FEEDBACK_MALFORMED });
  });

  /**
   * The rule the whole form is built around. A badge is the only identifier
   * this product has; a report that carries one without being asked is a
   * report that says who sent it without being asked. The tick is checked on
   * the SERVER, so a future client that forgets the box cannot leak it.
   */
  it('attaches the badge only when the box was ticked', () => {
    const off = parseFeedback(report({ contact: false }), BADGE);
    expect(off.ok && off.report.badge).toBeNull();

    const missing = parseFeedback(report({ contact: undefined }), BADGE);
    expect(missing.ok && missing.report.badge).toBeNull();

    // And nothing truthy will do it either - the tick is a tick.
    const nearly = parseFeedback(report({ contact: 'yes' }), BADGE);
    expect(nearly.ok && nearly.report.badge).toBeNull();

    const on = parseFeedback(report({ contact: true }), BADGE);
    expect(on.ok && on.report.badge).toBe(BADGE);
  });

  /**
   * A body claiming a badge is never read. The only badge that can be attached
   * is the one the request's own cookie proved, so this is not a check that
   * can be forgotten - there is no code path that looks.
   */
  it('cannot be told to file a report under somebody else', () => {
    const parsed = parseFeedback(
      report({ contact: true, badge: 'WG-9999-ZZ' }),
      BADGE,
    );

    expect(parsed.ok && parsed.report.badge).toBe(BADGE);
  });

  it('caps what it will carry, so one form cannot post a novel', () => {
    const parsed = parseFeedback(
      report({
        summary: 'x'.repeat(500),
        details: 'y'.repeat(9_000),
        context: { actions: Array.from({ length: 40 }, (_, i) => `a.${String(i)}`) },
      }),
      BADGE,
    );

    expect(parsed.ok && parsed.report.summary.length).toBe(120);
    expect(parsed.ok && parsed.report.details.length).toBe(4_000);
    expect(parsed.ok && parsed.report.context.actions.length).toBe(5);
  });

  it('strips the characters that would let text act like markup', () => {
    const parsed = parseFeedback(
      report({
        summary: 'a\u0007bc `code` <b>bold</b>',
        details: 'line one\r\nline two\ttabbed',
      }),
      BADGE,
    );

    expect(parsed.ok && parsed.report.summary)
      .toBe("abc 'code' (b)bold(/b)");
    // Newlines survive in the details and nowhere else: a report is a
    // paragraph, and a summary is a title.
    expect(parsed.ok && parsed.report.details)
      .toBe('line one\nline two tabbed');
  });
});

describe('the issue it becomes', () => {
  it('titles it with the player\'s own line, marked as a tester report', () => {
    const parsed = parseFeedback(report(), BADGE);

    expect(parsed.ok && issueTitle(parsed.report))
      .toBe('[tester] The spooler button does nothing on Thursday');
  });

  it('writes the context out, and says the badge was withheld', () => {
    const parsed = parseFeedback(report(), BADGE);
    const body = parsed.ok ? issueBody(parsed.report) : '';

    expect(body).toContain('Clicked it four times.');
    expect(body).toContain('- Game day: 4');
    expect(body).toContain('- Save format: 3');
    expect(body).toContain('- Build: 0.1.0');
    expect(body).toContain('- Engine: 0.4.0');
    expect(body).toContain('- Window in front: remote');
    expect(body).toContain('service.restart, printer.clear_queue');
    expect(body).toContain('did not ask to be contacted');
    expect(body).not.toContain(BADGE);
  });

  it('puts the badge in when it was offered', () => {
    const parsed = parseFeedback(report({ contact: true }), BADGE);

    expect(parsed.ok && issueBody(parsed.report)).toContain(BADGE);
  });

  it('says so plainly when a report has nothing but its title', () => {
    const parsed = parseFeedback(report({ details: '', context: {} }), BADGE);
    const body = parsed.ok ? issueBody(parsed.report) : '';

    expect(body).toContain('No further detail was given');
    expect(body).toContain('- Game day: not reported');
    expect(body).toContain('none since the last day boundary');
  });
});
