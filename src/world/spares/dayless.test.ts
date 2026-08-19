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
 * THREE SURFACES, because the class lives on three. The files above are one.
 *
 * The second is DIALOGUE, and the source sweep could not see it - a tree is one
 * person's whole conversation, and the trees that talk about a spare are mixed
 * in with the trees that talk about the authored week, in a file the sweep had
 * no reason to read. That gate reads the SHIPPED tree objects rather than their
 * source, and limits itself to trees carrying a ticket the surplus deals - the
 * same rule, asked of the only content the rule is about. Reading the objects
 * also closes the split-line hole for free: a sentence broken across two source
 * lines by `+` is one string by the time a player is read it, and that is the
 * string this checks. It reads WORLD_DIALOGUE, which is the registry the game
 * ships (0.38.0 verifier round 2): the first cut read `MSP_TREES`, one file of
 * five, so eight of the thirty-two trees the surplus talks through were gated
 * and twenty-four were not, with thirty-six weekday lines between them.
 *
 * The third is the surplus's own TICKET BODIES, and it is the surface the class
 * was first found on. It had no gate at all until the round-2 verifier reverted
 * `pool-msp.ts` to a Thursday and Wednesday that a hand sweep had taken out,
 * and watched the whole suite stay green: the source sweep reads the SPARES
 * directory, and the tickets a spare deals live in `world/tickets/`. The gate
 * below asks the same question of the shipped ticket object, off the same
 * derived id list the dialogue gate filters on.
 *
 * WHAT THIS DOES NOT COVER, said plainly rather than implied by silence: the
 * four authored weeks are themselves taken apart into pools for week two
 * onward, so an authored ticket can also be dealt off the day it was written
 * for. That is a wider sweep and a different argument - an authored beat moves
 * as a coupled unit, which is a fact about `pools.ts` rather than about the
 * surplus - and it is not what these three gates claim. What they do claim is
 * that everything the SURPLUS puts in front of a player is dayless, and that a
 * tree is read whole, so authored lines inside a tree the surplus reaches are
 * triaged by the same rule and earn their reasons with the rest.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORLD_DIALOGUE } from '../dialogue';
import type { DialogueTree } from '../dialogue/types';
import { findWorldTicket } from '../tickets';
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
  // HISTORY, and the question that reaches it says so: the option is "Ask when
  // he was brought onto the matter", so the answer is the day a thing that has
  // already happened happened on, and last Friday exists from every day of the
  // week. (This reason used to read "a fact about the FIRM's meeting day",
  // which is not what the line is doing - 0.38.0 verifier round 2.)
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

  /* -- 0.38.0 verifier round 2 --------------------------------------------
     What the two widened gates named: the surplus's own ticket bodies, which
     had no gate at all, and the twenty-four trees the dialogue gate could not
     see while it read one file instead of the shipped registry. Seven lines in
     these went dayless instead (they claimed what day it IS, or promised a
     named one); these are the rest, and they are the same three reasons the
     list above already runs on. ------------------------------------------ */

  // HISTORY. Each of these looks BACKWARD at something that has already
  // happened - the same reason the desk's Tuesday and Marcus's Friday earn
  // above. Last Thursday exists from every day of the week.
  'times since Thursday', // Kev's relock, in the ticket body and in his own mouth
  'expired on a Sunday', // the intranet certificate's cause
  'started saying so at nine on Monday', // the same cause, and Marcus's reveal
  'expired on the thirteenth. Which was Sunday',
  'posted back on Friday', // the agency handset, in the ticket body
  'went back in the post on Friday', // and the same handset in Kwame's tree
  'posted it back on Friday',
  'to post it back on Friday',
  'when she left on Friday', // Ada's sideways screen: the session before it
  'at her desk on Friday',
  'at her keyboard on Friday afternoon',
  'a shortcut on my keyboard on Friday',
  'It rained on the Tuesday', // a holiday a fortnight ago
  'a delivery note from Friday', // what the label printer coughed up
  'wiped in the shop on Saturday', // the traded-in handset, both halves
  'Traded in on Saturday',
  'it has been with Ada since Thursday',
  'The box has been the fix since Monday',
  'Since Thursday. It lives in the cupboard',
  'Sometime Saturday, going by the invoices',
  'Friday. I left at four', // when Marcus was last at the machine
  'difficult to be precise about a Friday',
  // The despatch printer's two: both look back at outages that have happened,
  // and both name the CLEANERS' evenings rather than today's date.
  'the morning after a Tuesday or a Thursday',
  'same morning of the week as Tuesday',

  // A ROTA. What the building does every week, true on whichever day the draw
  // puts the ask on - the same reason the fire drill and the cabling man earn.
  'Cleaning, Tuesdays and Thursdays', // and here is that rota, said by facilities
  'by hand since then, on Sundays', // the payroll report, built by hand for months
  'by hand since March. On Sundays',
  'I put it back by hand on a Monday and by Thursday it has wandered off',

  // ALWAYS AHEAD OF THE SHIFT WEEK, the existing Monday rule: next Monday
  // exists from every day of a Monday-to-Friday week, so a board that wants a
  // migration live by one is asking for a day the desk still has in front of it.
  'wants this live by Monday',
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
  // WORLD_DIALOGUE, which is what the game hands a player, rather than any one
  // of the five files it is assembled from (0.38.0 verifier round 2). The first
  // cut read `MSP_TREES`, which is the MSP's file - so the surplus's other
  // three shops talked through twenty-four trees this gate never opened.
  const dealt = WORLD_DIALOGUE.filter(
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

/* -- and the same rule over the ticket the surplus actually deals ---------- */

/**
 * The prose on the ticket itself: the subject line a player triages off, the
 * body they read, and the cause the KB and the chat reveals are written from.
 *
 * This is the surface the whole class was FIRST found on, and until 0.38.0's
 * second verifier round it was the one surface with no gate on it at all. The
 * source sweep at the top reads the spares directory; a spare names a ticket
 * and the ticket is written in `world/tickets/`, so a hand-swept Thursday going
 * back into a pool file was a revert the full suite stayed green through. It is
 * asked of the shipped object rather than the source for the reason the
 * dialogue gate is: a body is assembled out of a dozen `+` continuations, and
 * the string a player reads is the one worth checking.
 */
describe('the tickets the surplus deals are dayless', () => {
  const spares = [...spareTicketIds()].sort();

  it('finds the tickets the surplus deals, so the gate has a subject', () => {
    // Same guard as the dialogue gate's, and the same reason: a derived list
    // that quietly emptied would leave this green over nothing.
    expect(spares.length).toBeGreaterThan(0);
  });

  it.each(spares.map((id) => [id] as const))(
    '%s names no weekday it cannot know',
    (id) => {
      const ticket = findWorldTicket(id);

      // A spare naming a ticket nobody wrote is somebody else's gate, but it
      // would silently empty THIS one, so it is refused here rather than
      // skipped past.
      expect(ticket, `the surplus deals ${id} and no ticket carries that id`)
        .toBeDefined();

      const bad = [
        ticket?.def.flavor.title ?? '',
        ticket?.def.flavor.body ?? '',
        ticket?.cause ?? '',
      ].filter((line) => WEEKDAY.test(masked(line)));

      expect(bad, 'weekday claims on a sampler-dealt ticket - go dayless or '
        + 'earn an ALLOWED line with a reason').toEqual([]);
    },
  );
});
