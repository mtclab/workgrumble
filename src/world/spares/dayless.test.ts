/**
 * Sampler-dealt content does not know what day it is (0.38.0).
 *
 * A spare has no home day - the week generator deals it wherever the draw
 * wants it - so a sentence in one that names a weekday reads wrong on most
 * draws. This class has now bitten three times (the Pennington Tuesday x3 in
 * 0.37.1's round, the corporate board-pack Thursday in the same sweep's
 * residual, and three fresh Thursdays in 0.38.0's dialogue), each swept by
 * hand with no assertion left behind. This is the assertion.
 *
 * Source-level on purpose, the remote-scope class gate's own idiom: the
 * flavor lives in string literals across these files, and a graph walk would
 * only see the tickets a particular world dealt. Comments talk ABOUT the
 * week and never reach a player, so they are exempt; what remains is
 * player-facing prose, and it either goes dayless or earns an ALLOWED line
 * with a reason.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEEKDAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/;

/** Exact substrings allowed to name a day, each with its reason. */
const ALLOWED: readonly string[] = [
  // History, not schedule: the mess predates the draw whatever day it is.
  'been there since Tuesday and nobody will own up to it',
  // Recurring calendar notes - true on every draw by construction.
  'Fire drill is the second Tuesday',
  'can reach on Tuesdays',
  // NEXT week's Monday exists from every weekday - "until Monday", "from
  // Monday", "find out on Monday" are forward references that always land.
  'do not raise that as a ticket until Monday',
  'Finance is in year-end from Monday',
  'I just do not want to find out on Monday',
  // The weekend is always ahead of a Monday-to-Friday shift week.
  'stripped out on the Saturday',
  'spending his Saturday',
  // The timesheet IS due on day five, which is Friday by the week's own
  // structure - this subject line is true on every draw.
  'Are the timesheets in by Friday or on Friday',
];

/**
 * Comment and docblock lines never reach a player. String-literal lines do.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('*') || trimmed.startsWith('//')
    || trimmed.startsWith('/*');
}

function offendingLines(source: string): readonly string[] {
  return source
    .split('\n')
    .filter((line) => {
      if (isCommentLine(line) || !WEEKDAY.test(line)) {
        return false;
      }

      return !ALLOWED.some((allowed) => line.includes(allowed.slice(0, 40)));
    });
}

describe('sampler-dealt content is dayless', () => {
  const here = join(__dirname);
  const files = [
    ...readdirSync(here)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => join(here, name)),
    join(here, '..', 'tickets', 'scope-asks.ts'),
  ];

  it.each(files.map((file) => [file.split('/').slice(-2).join('/'), file]))(
    '%s names no weekday it cannot know',
    (_label, file) => {
      const bad = offendingLines(readFileSync(file, 'utf8'));
      expect(bad, 'weekday claims in sampler-dealt content - go dayless or '
        + 'earn an ALLOWED line with a reason').toEqual([]);
    },
  );
});
