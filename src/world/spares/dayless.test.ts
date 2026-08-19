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
 *
 * TWO SURFACES, because the class lives on two (0.38.0 verifier round). The
 * files above are one; the other is DIALOGUE, and the gate above could not see
 * it - a tree is one person's whole conversation, and the trees that talk
 * about a spare are mixed in with the trees that talk about the authored week,
 * in a file the gate had no reason to read. Two forward-looking Thursdays were
 * sitting in the MSP trees the whole time the first gate was green. The second
 * describe below reads the SHIPPED tree objects rather than their source, and
 * limits itself to trees carrying a ticket the surplus deals - the same rule,
 * asked of the only content the rule is about. Reading the objects also closes
 * the split-line hole for free: a sentence broken across two source lines by
 * `+` is one string by the time a player is read it, and that is the string
 * this checks.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MSP_TREES } from '../dialogue/msp-trees';
import type { DialogueTree } from '../dialogue/types';
import { SPARE_EMPLOYERS, spareWeekFor } from './index';

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
  // The same rule, in the two dialogue lines that need it: the weekend a
  // partner's kit is moved over, and the weekend Gil has already been told he
  // is losing. Both are ahead of every day the draw can put the ask on.
  'the old suite out on the Saturday',
  'his feelings about his Saturday quite clear',
  // The timesheet IS due on day five, which is Friday by the week's own
  // structure - this subject line is true on every draw.
  'Are the timesheets in by Friday or on Friday',
  // The firm decides everything in one weekly meeting; which weekday that
  // meeting is on is a fact about the FIRM, not about the day the ask lands.
  'Friday, at the partners\' meeting',
  // HISTORY, the same reason the desk's Tuesday above earns: a fault that
  // worked, ran, or started on a named day is talking about a day that has
  // already happened, and last Tuesday exists from every day of the week.
  'It worked on Tuesday',
  'He was in it on Friday, same desk, same files',
  'Marcus is in court and has been since Friday',
  'Ask how Marcus left the document on Friday',
  'it ran itself on Saturday night. It was saving images fine on Friday',
  'redid the Salesforce SSO integration on Saturday',
  // A recurring rota - "in on Thursdays" is a fact about the man, true on
  // whichever day somebody rings about him.
  'He is in on Thursdays',
  // A delivery date ahead of the desk, not a claim about which day it is: the
  // disks land on the next Tuesday there is, from any day of the week.
  'the disks are ordered for Tuesday',
];

/**
 * Comment and docblock lines never reach a player. String-literal lines do.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('*') || trimmed.startsWith('//')
    || trimmed.startsWith('/*');
}

/**
 * The line with every ALLOWED phrase cut OUT of it, rather than the line waved
 * through for containing one (0.38.0 verifier round).
 *
 * `line.includes(allowed)` whitewashed the whole line: one earned phrase
 * excused every other day named beside it, so appending ", so come back
 * Thursday" to an allowed sentence stayed green - which is the shape of the
 * next weekday to be written, since a line that already names a day is exactly
 * where somebody adds a second one. Only the phrase that earned its reason
 * goes; whatever is left still has to be dayless.
 *
 * The forty-character prefix is kept because an ALLOWED phrase may be longer
 * than the line it sits on: source is wrapped and a literal is split by `+`.
 * Cutting the prefix leaves the tail of the phrase behind, which is harmless -
 * the tail of a phrase whose weekday was inside the prefix carries no weekday.
 */
function masked(line: string): string {
  return ALLOWED.reduce(
    (rest, allowed) => rest
      .split(allowed)
      .join(' ')
      .split(allowed.slice(0, 40))
      .join(' '),
    line,
  );
}

function offendingLines(source: string): readonly string[] {
  return source
    .split('\n')
    .filter((line) => !isCommentLine(line) && WEEKDAY.test(masked(line)));
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

/* -- the same rule, over the dialogue that talks about a spare ------------- */

/**
 * Every ticket the surplus can deal, off the registry rather than a list here.
 *
 * Derived, not hardcoded, for the reason every other derived list in this
 * suite is: a second copy would go stale the first time somebody moves a
 * ticket between the authored week and the pool, and the way it would go stale
 * is by quietly covering less.
 */
function spareTicketIds(): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const employer of SPARE_EMPLOYERS) {
    for (const day of spareWeekFor(employer)) {
      for (const id of day.inherited) {
        ids.add(id);
      }

      for (const slot of day.drip) {
        ids.add(slot.ticketId);
      }

      for (const slot of day.dms ?? []) {
        ids.add(slot.raises);
      }

      for (const walkUp of day.walkUps ?? []) {
        ids.add(walkUp.raises);
      }
    }
  }

  return ids;
}

/**
 * Every string a tree holds, however deeply it is nested.
 *
 * A generic walk rather than a list of the fields that carry prose, because
 * the list would be the thing that goes stale: a node kind that grows a new
 * text field would grow it outside this gate. Ids, node names and action ids
 * are swept up too and that costs nothing - none of them is capable of
 * containing the word Thursday, and one that did would deserve the question.
 */
function stringsIn(value: unknown, into: string[] = []): readonly string[] {
  if (typeof value === 'string') {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value as readonly unknown[]) {
      stringsIn(item, into);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      stringsIn(item, into);
    }
  }

  return into;
}

describe('dialogue about sampler-dealt tickets is dayless', () => {
  const spares = spareTicketIds();
  const dealt = MSP_TREES.filter(
    (tree: DialogueTree) => tree.tickets.some((id) => spares.has(id)),
  );

  it('finds the trees the surplus talks through, so the gate has a subject', () => {
    // The gate is only worth anything if it is reading something. A rename
    // that emptied this list would otherwise leave a green test over no
    // content at all - the shape the first weekday gate shipped in.
    expect(dealt.length).toBeGreaterThan(0);
  });

  it.each(dealt.map((tree) => [tree.id, tree] as const))(
    '%s names no weekday it cannot know',
    (_label, tree) => {
      const bad = stringsIn(tree).filter((line) => WEEKDAY.test(masked(line)));

      expect(bad, 'weekday claims in dialogue that a sampler-dealt ticket '
        + 'reaches - go dayless or earn an ALLOWED line with a reason')
        .toEqual([]);
    },
  );
});
