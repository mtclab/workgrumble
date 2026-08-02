/**
 * The words the office has about your dot, and the two gates that keep them
 * honest.
 *
 * Content tests rather than mechanism ones: the mechanism is lane A's and is
 * tested a floor down. What can go wrong HERE is quieter and worse - somebody
 * takes a point of reputation off the player and nobody says anything, or two
 * people are given the same sentence, or a status nobody in the building has
 * ever remarked on reads as a button that does nothing.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../company';
import { WORLD_TICKETS } from '../tickets';
import { PRESENCE_VALUES } from '../presence';
import {
  assertAwayLines,
  assertPresenceChatter,
  AWAY_LINE_ROSTER,
  AWAY_NOTICED_LINES,
  awayNoticedLine,
  PRESENCE_CHATTER,
  presenceChatter,
} from './presence';

describe('what somebody says about being left waiting', () => {
  /**
   * The gate that matters: the sting is a REPUTATION hit, and a reputation hit
   * nobody can trace to a person is a number that just went down.
   */
  it('has a line for everybody the week can leave waiting', () => {
    const reporters = new Set(
      WORLD_TICKETS
        .map((ticket) => ticket.def.reporter)
        .filter((reporter) => reporter !== COMPANY_IDS.player),
    );

    expect(reporters.size).toBeGreaterThan(5);

    for (const reporter of reporters) {
      expect(awayNoticedLine(reporter), reporter).not.toBeNull();
    }

    expect([...AWAY_LINE_ROSTER].sort()).toEqual([...reporters].sort());
  });

  it('refuses to load a roster with a silent reporter in it', () => {
    expect(() => assertAwayLines(['person:nobody']))
      .toThrow('nothing to say about being left waiting');
  });

  /**
   * Each line is that person and nobody else. A shared sentence would be the
   * office speaking with one voice, which is the sameness this game is built
   * against - and it is checkable, because a duplicate is a duplicate.
   */
  it('gives each of them their own sentence', () => {
    const said = Object.values(AWAY_NOTICED_LINES);

    expect(new Set(said).size).toBe(said.length);

    for (const [who, line] of Object.entries(AWAY_NOTICED_LINES)) {
      // Long enough to be a person talking rather than a status label.
      expect(line.length, who).toBeGreaterThan(60);
      // And about the status, which is the one thing every one of them has
      // noticed - said in their own words rather than in the world's.
      expect(line.toLowerCase(), who).toMatch(/away|unavailable|dot|status/u);
    }
  });
});

describe('the office noticing a dot', () => {
  it('has somebody for each of the three, and no line twice', () => {
    expect(assertPresenceChatter(PRESENCE_CHATTER)).toBe(PRESENCE_CHATTER);

    for (const presence of PRESENCE_VALUES) {
      expect(presenceChatter(presence).length, presence).toBeGreaterThan(0);
    }

    const said = PRESENCE_CHATTER.map((remark) => remark.line);
    expect(new Set(said).size).toBe(said.length);
  });

  it('refuses a table with a status nobody has noticed', () => {
    expect(() => assertPresenceChatter(
      PRESENCE_CHATTER.filter((remark) => remark.presence !== 'away'),
    )).toThrow('anything to say about "away"');
  });

  it('refuses two people saying the same thing', () => {
    const first = PRESENCE_CHATTER[0];

    expect(first).toBeDefined();
    expect(() => assertPresenceChatter([
      ...PRESENCE_CHATTER,
      { ...first as NonNullable<typeof first>, speaker: COMPANY_IDS.bev },
    ])).toThrow('say the same thing');
  });

  /**
   * Sparse is the point. This is the office noticing rather than a chorus, and
   * a table that grew a line per person per status would be forty people
   * commenting on a taskbar.
   */
  it('is a handful of lines for a whole week', () => {
    expect(PRESENCE_CHATTER.length).toBeLessThanOrEqual(6);

    for (const remark of PRESENCE_CHATTER) {
      expect(awayNoticedLine(remark.speaker) ?? '', remark.speaker)
        .not.toBe(remark.line);
    }
  });
});
