/**
 * The file, who opens it, and what opening it costs.
 *
 * Three questions and they are deliberately separate tests, because the whole
 * design is that they are separate things: the record accumulates and does
 * nothing, somebody acquires a reason to read it, and only then does anything
 * that is written in it reach a decision. A slice that quietly collapsed those
 * back into one number - conduct as a subtraction - would pass "the file has
 * lines in it" and fail everything below.
 */

import { describe, expect, it } from 'vitest';

import type { ReadOnlyGraphNode } from '../engine-api';
import { BOSS_TRAP_TICKET } from './boss';
import {
  CONDUCT_BAR_SHIFT_MAX,
  CONDUCT_BAR_SHIFT_PER_LINE,
  CONDUCT_TRIGGERS,
  CONDUCT_TRIGGER_CRITERIA,
  conductEntries,
  conductFileSize,
  conductLine,
  conductStamp,
  conductSummary,
  conductTriggers,
  favourTicketIds,
  readConductFile,
} from './conduct';
import { FIELDS } from './fields';
import { tickAtMinute } from './hours';
import { REVIEW_PASS_PERFORMANCE } from './week';

/** A ticket node in whichever of the three states a trigger looks at. */
function ticket(
  id: string,
  over: Readonly<{
    state?: string;
    breachedAt?: number;
    respondedAt?: number;
  }> = {},
): ReadOnlyGraphNode {
  return {
    id,
    kind: 'ticket',
    fields: {
      [FIELDS.state]: over.state ?? 'open',
      [FIELDS.breached]: over.breachedAt !== undefined,
      ...(over.breachedAt === undefined
        ? {}
        : { [FIELDS.breachedAt]: over.breachedAt }),
      ...(over.respondedAt === undefined
        ? {}
        : { [FIELDS.respondedAt]: over.respondedAt }),
    },
  };
}

/** The ticket somebody only files because they were sent to the form. */
const FAVOUR = favourTicketIds()[0] ?? '';

/** A file of `count` lines, written on the Monday, one every ten minutes. */
function fileOf(count: number): string {
  return Array.from(
    { length: count },
    (_unused, index) => conductLine(
      tickAtMinute(1, 9 * 60) + index * 10,
      'screen',
      'a discussion forum',
    ),
  ).join('\n');
}

describe('the file', () => {
  it('says what was noticed and when, in the voice a file is written in', () => {
    const line = conductLine(
      tickAtMinute(3, 11 * 60 + 16),
      'screen',
      'a discussion forum',
    );
    const [entry] = conductEntries(line);

    expect(entry?.kind).toBe('screen');
    // The day by its name and the minute on the clock the player reads, which
    // is what a person writing a note actually puts at the top of it.
    expect(entry?.text).toContain('Wednesday 11:16');
    expect(entry?.text).toContain('a discussion forum');
    // Passive, dated, and quietly awful. It is not the scene: the scene is a
    // man being funny at the desk, and this is the sentence that outlives him.
    expect(entry?.text).toContain('No further action at this time');

    const desk = conductEntries(
      conductLine(tickAtMinute(4, 14 * 60 + 2), 'desk', '5 empty cans'),
    );
    expect(desk[0]?.kind).toBe('desk');
    expect(desk[0]?.text).toContain('Thursday 14:02');
    expect(desk[0]?.text).toContain('5 empty cans');
    expect(desk[0]?.text).toContain('Not raised with the employee');
  });

  it('keeps the order it was written in, oldest first', () => {
    const morning = conductLine(100, 'screen', 'a puzzle game');
    const afternoon = conductLine(400, 'desk', '4 empty cans');
    const entries = conductEntries([morning, afternoon].join('\n'));

    expect(entries.map((entry) => entry.tick)).toEqual([100, 400]);
    expect(conductFileSize([morning, afternoon].join('\n'))).toBe(2);
  });

  it('is nothing at all when nothing has been written', () => {
    expect(conductEntries(undefined)).toEqual([]);
    expect(conductEntries('')).toEqual([]);
    expect(conductEntries('   ')).toEqual([]);
    expect(conductFileSize(null)).toBe(0);
    // And a line the world could not have written is skipped rather than
    // counted: a file is read back by a screen and by a gate, and half a line
    // is not evidence of anything.
    expect(conductEntries('nonsense')).toEqual([]);
    expect(conductEntries('12|shouting|something')).toEqual([]);
  });

  /** A stamp is what makes the legibility gate checkable at all. */
  it('carries the minute as a number, not only as a sentence', () => {
    expect(conductStamp(tickAtMinute(1, 9 * 60))).toBe('Monday 09:00');
    expect(conductEntries(conductLine(77, 'screen', 'a forum'))[0]?.tick)
      .toBe(77);
  });
});

describe('who has a reason to open it', () => {
  it('names all three before any of them happens', () => {
    for (const id of CONDUCT_TRIGGERS) {
      expect(CONDUCT_TRIGGER_CRITERIA[id].length).toBeGreaterThan(20);
    }
  });

  it('has nobody in it when the queue was dealt with', () => {
    expect(conductTriggers([
      ticket('ticket:a', { state: 'resolved' }),
      ticket(FAVOUR, { state: 'resolved' }),
      ticket(BOSS_TRAP_TICKET, { state: 'resolved' }),
    ])).toEqual([]);
  });

  /**
   * The pairing the CYA rule already teaches: a deadline missed is bad, and a
   * deadline missed in silence is the one somebody rings about. A red ticket
   * whose reporter was actually spoken to is not a grievance.
   */
  it('finds the customer who went red and was never told anything', () => {
    const spoken = conductTriggers([
      ticket('ticket:a', { breachedAt: 400, respondedAt: 200 }),
    ]);
    expect(spoken).toEqual([]);

    const [found] = conductTriggers([
      ticket('ticket:late', { breachedAt: 900 }),
      ticket('ticket:earlier', { breachedAt: 400 }),
    ]);
    expect(found?.id).toBe('customer');
    // Earliest first, so who complains is decided by the world rather than by
    // whatever order the graph handed its nodes over in.
    expect(found?.ticketId).toBe('ticket:earlier');
  });

  it('finds the colleague who was sent to the form and left on it', () => {
    expect(FAVOUR).not.toBe('');
    const [found] = conductTriggers([ticket(FAVOUR)]);
    expect(found?.id).toBe('colleague');
    expect(conductTriggers([ticket(FAVOUR, { state: 'resolved' })])).toEqual([]);
  });

  it('finds the lead, who does not need telling about his own', () => {
    const [found] = conductTriggers([
      ticket(BOSS_TRAP_TICKET, { breachedAt: 300, respondedAt: 100 }),
    ]);
    expect(found?.id).toBe('lead');
  });
});

describe('what opening it does', () => {
  const REACHED = REVIEW_PASS_PERFORMANCE + CONDUCT_BAR_SHIFT_MAX;
  const thick = fileOf(CONDUCT_BAR_SHIFT_MAX / CONDUCT_BAR_SHIFT_PER_LINE);
  const aggrieved = [ticket('ticket:hilda', { breachedAt: 400 })];
  const dealtWith = [ticket('ticket:hilda', { state: 'resolved' })];

  /**
   * FIZZLE ONE: nobody looked.
   *
   * A week can be full of conversations in the corridor and still end without
   * a single consequence, because the file is a private document until
   * somebody has a reason to ask for it. This is the documented reality -
   * monitoring is near-universal and enforcement is not - and it is the reason
   * "worked properly with the browser up all week" is still a pass.
   */
  it('does nothing at all while nobody has a reason', () => {
    const reading = readConductFile(dealtWith, thick);

    expect(reading.triggers).toEqual([]);
    expect(reading.lines).toBe(5);
    expect(reading.bar).toBe(REVIEW_PASS_PERFORMANCE);
    expect(conductSummary(reading)).toContain('Nobody has a reason');
  });

  /**
   * FIZZLE TWO: somebody looked and there was nothing to read.
   *
   * The half-a-job week. It is a bad week and it is not a conduct week, and
   * the bar must not move for a blank page - which is the assertion that stops
   * "somebody complained" from quietly becoming a second performance penalty.
   */
  it('does nothing when the file it opens is empty', () => {
    const reading = readConductFile(aggrieved, '');

    expect(reading.triggers.map((trigger) => trigger.id)).toEqual(['customer']);
    expect(reading.lines).toBe(0);
    expect(reading.bar).toBe(REVIEW_PASS_PERFORMANCE);
    // And it is SEEN to fizzle: the sentence says somebody looked, says what
    // they found, and says the mark is being decided on its own.
    expect(conductSummary(reading)).toContain('Somebody has a reason');
    expect(conductSummary(reading)).toContain('nothing on your file');
    expect(conductSummary(reading))
      .toContain(`against ${String(REVIEW_PASS_PERFORMANCE)}`);
  });

  /** And the week both halves of it are true of, which is the one that lands. */
  it('raises the bar when a reason and a file meet', () => {
    const reading = readConductFile(aggrieved, thick);

    expect(reading.lines).toBe(5);
    expect(reading.bar).toBe(REACHED);
    expect(conductSummary(reading)).toContain(String(REACHED));
  });

  it('moves the bar by the line, and stops', () => {
    const barFor = (lines: number): number => readConductFile(
      aggrieved,
      fileOf(lines),
    ).bar;

    expect(barFor(1))
      .toBe(REVIEW_PASS_PERFORMANCE + CONDUCT_BAR_SHIFT_PER_LINE);
    expect(barFor(2))
      .toBe(REVIEW_PASS_PERFORMANCE + 2 * CONDUCT_BAR_SHIFT_PER_LINE);
    // One conversation a day for a week is as bad as it ever gets. After that
    // he has made his mind up and there is nothing left to make it up with.
    expect(barFor(5)).toBe(REACHED);
    expect(barFor(15)).toBe(REACHED);
    expect(barFor(40)).toBe(REACHED);
  });

  /**
   * THE SHIELD, stated as arithmetic, because it is the half of this design
   * that is easiest to lose and hardest to see missing.
   *
   * Contribution buys latitude - Hollander's idiosyncrasy credit, which is
   * finite and is spent by deviating. A week thick with conversations survives
   * being read if the numbers are there; the same file against a week that did
   * half the job does not. Neither of those is a subtraction, and putting one
   * in would make both of these read the same way.
   */
  it('is survived by the mark, and only by the mark', () => {
    const bar = readConductFile(aggrieved, thick).bar;

    // Did the job, with the browser up all week, and one thing went red.
    expect(96).toBeGreaterThanOrEqual(bar);
    // Did half the job, with the browser up all week.
    expect(56).toBeLessThan(bar);
    // And the same half-job week with a clean file clears the same line it
    // always had to.
    expect(56).toBeGreaterThanOrEqual(readConductFile(aggrieved, '').bar);
  });
});
