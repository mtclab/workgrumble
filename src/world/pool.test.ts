/**
 * The matrix, checked as arithmetic and as a ranking.
 *
 * Two different things are being asserted here and they fail for different
 * reasons. The scoring is a pure function and is pinned to worked numbers, so
 * a weight nobody meant to change goes red with the sum printed beside it. The
 * RANKING is where somebody's job is decided, so it is asserted at the edges
 * that actually decide one: a tie, the place immediately above the line, the
 * place immediately below it, and a player who is nowhere near either.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from './company';
import { conductLine } from './conduct';
import {
  conductScore,
  MATRIX_CONDUCT_PER_LINE,
  MATRIX_WEIGHTS,
  matrixSummary,
  type PoolMember,
  poolStanding,
  scoreRow,
  SELECTION_POOL,
  SERVICE_CAP_WEEKS,
  serviceScore,
} from './pool';

/** The week of the arc the round is decided in, which is what service reads. */
const DECISION_WEEK = 10;

/** A file with `lines` things on it, written the way the world writes them. */
function fileOf(lines: number): string {
  return Array.from(
    { length: lines },
    (_, index) => conductLine(60 + index, 'screen', 'a discussion forum'),
  ).join('\n');
}

function standingFor(performance: number, lines: number): ReturnType<
  typeof poolStanding
> {
  return poolStanding(
    { performance, file: fileOf(lines), arcWeek: DECISION_WEEK },
    2,
  );
}

const NAMES: Readonly<Record<string, string>> = {
  [COMPANY_IDS.player]: 'Pat Pending',
  [COMPANY_IDS.bev]: 'Bev',
  [COMPANY_IDS.gary]: 'Gary',
  [COMPANY_IDS.terry]: 'Terry',
  [COMPANY_IDS.owen]: 'Owen',
  [COMPANY_IDS.rob]: 'Rob',
};

const nameOf = (person: string): string => NAMES[person] ?? person;

describe('the three lines of the matrix', () => {
  it('weighs the week heaviest, and adds up to a whole matrix', () => {
    const total = MATRIX_WEIGHTS.performance
      + MATRIX_WEIGHTS.conduct
      + MATRIX_WEIGHTS.service;

    expect(total).toBeCloseTo(1, 10);
    // The only line the player moves by playing has to be the one that moves
    // the answer most, or the layer is a lottery with a table in front of it.
    expect(MATRIX_WEIGHTS.performance)
      .toBeGreaterThan(MATRIX_WEIGHTS.conduct + MATRIX_WEIGHTS.service);
  });

  it('scores the file down six points a line, to nothing', () => {
    expect(conductScore(0)).toBe(100);
    expect(conductScore(1)).toBe(100 - MATRIX_CONDUCT_PER_LINE);
    expect(conductScore(15)).toBe(10);
    expect(conductScore(16)).toBe(4);
    // A file that thick has nothing left to give, which is the same shape the
    // bar shift has: he has made his mind up and there is nothing left to make
    // it up with.
    expect(conductScore(17)).toBe(0);
    expect(conductScore(400)).toBe(0);
  });

  it('scores service up to ten years and no further', () => {
    expect(serviceScore(0)).toBe(0);
    expect(serviceScore(SERVICE_CAP_WEEKS)).toBe(100);
    expect(serviceScore(SERVICE_CAP_WEEKS * 3)).toBe(100);
    expect(serviceScore(52)).toBe(10);
    // Ten weeks into a career is two points out of a hundred, and that is the
    // grim true fact the screen has to say out loud rather than bury.
    expect(serviceScore(DECISION_WEEK)).toBe(2);
  });

  it('adds the three up the same way for everybody', () => {
    const row = scoreRow({
      person: COMPANY_IDS.player,
      performance: 99,
      fileLines: 1,
      serviceWeeks: DECISION_WEEK,
    });

    // 0.6 * 99 + 0.2 * 94 + 0.2 * 2 = 59.4 + 18.8 + 0.4 = 78.6
    expect(row.conduct).toBe(94);
    expect(row.service).toBe(2);
    expect(row.composite).toBe(79);
  });

  it('never leaves the hundred it is out of', () => {
    expect(scoreRow({
      person: 'person:nobody',
      performance: 400,
      fileLines: 0,
      serviceWeeks: SERVICE_CAP_WEEKS,
    }).composite).toBe(100);
    expect(scoreRow({
      person: 'person:nobody',
      performance: -50,
      fileLines: 99,
      serviceWeeks: 0,
    }).composite).toBe(0);
  });
});

/**
 * The five people the player is actually held against, pinned.
 *
 * These are the numbers the whole layer is balanced on, so they are asserted
 * rather than described: the person immediately above the line decides who
 * goes, and a colleague whose appraisal quietly moved would move somebody's
 * job without anybody having chosen to.
 */
describe('the pool this employer draws', () => {
  it('is five other people, scored on their own three lines', () => {
    const standing = standingFor(0, 0);
    const composites = new Map(
      standing.rows.map((row) => [row.person, row.composite]),
    );

    expect(SELECTION_POOL).toHaveLength(5);
    expect(composites.get(COMPANY_IDS.bev)).toBe(72);
    expect(composites.get(COMPANY_IDS.gary)).toBe(65);
    expect(composites.get(COMPANY_IDS.terry)).toBe(58);
    // Owen is the number that matters: the last person kept, and therefore the
    // line the player is playing against all consultation.
    expect(composites.get(COMPANY_IDS.owen)).toBe(55);
    expect(composites.get(COMPANY_IDS.rob)).toBe(40);
  });

  it('puts the line at the fourth-best of the five, wherever the player is', () => {
    // Two going from six leaves three people who can be above you, so the
    // number to beat is Owen's - and it is the same number whether the player
    // is top of the table or bottom of it, which is what makes it a target.
    for (const mark of [100, 56, 0]) {
      const standing = standingFor(mark, 0);

      expect(standing.pool).toBe(6);
      expect(standing.cut).toBe(2);
      expect(standing.cutFrom).toBe(5);
      expect(standing.line, `at a mark of ${String(mark)}`).toBe(55);
    }
  });
});

/**
 * The five weeks this game already knows how to play, put through a round.
 *
 * The mark each of them produces is measured elsewhere - `scripted-week.test.ts`
 * walks them through the shipped driver - and reproduced here as an input, so
 * this file is about what the MATRIX does with a week rather than about what a
 * week scores. The endings are asserted where they are decided, in
 * `scripted-arc.test.ts`.
 */
describe('the five profiles, against the pool', () => {
  const CASES: readonly {
    readonly name: string;
    readonly mark: number;
    readonly lines: number;
    readonly composite: number;
    readonly position: number;
    readonly inTheCut: boolean;
  }[] = [
    {
      name: 'worked properly',
      mark: 99,
      lines: 1,
      composite: 79,
      position: 1,
      inTheCut: false,
    },
    {
      // The finding, and the one this layer exists to produce: a week that
      // kept the job on probation does not keep it in a round. Fifty-four
      // against Owen's fifty-five, by one point, with both numbers on the
      // screen for three weeks beforehand.
      name: 'half the roster',
      mark: 56,
      lines: 0,
      composite: 54,
      position: 5,
      inTheCut: true,
    },
    {
      // And the other one: the file converts at last. Seventeen points and two
      // places, on a week that closed everything - it survives, and it is the
      // first time the folder has ever been mentioned.
      name: 'worked, with the browser up all week',
      mark: 99,
      lines: 15,
      composite: 62,
      position: 3,
      inTheCut: false,
    },
    {
      name: 'half the roster, with the browser up all week',
      mark: 56,
      lines: 15,
      composite: 36,
      position: 6,
      inTheCut: true,
    },
    {
      name: 'nothing at all',
      mark: 4,
      lines: 12,
      composite: 8,
      position: 6,
      inTheCut: true,
    },
  ];

  it.each(CASES)('puts $name at $position of six', (profile) => {
    const standing = standingFor(profile.mark, profile.lines);

    expect(standing.player.composite).toBe(profile.composite);
    expect(standing.position).toBe(profile.position);
    expect(standing.inTheCut).toBe(profile.inTheCut);
  });

  it('is decided by the composite and by nothing else', () => {
    for (const profile of CASES) {
      const standing = standingFor(profile.mark, profile.lines);
      const line = standing.line ?? Number.NaN;

      expect(standing.inTheCut, profile.name)
        .toBe(standing.player.composite < line
          || (standing.player.composite === line
            && standing.position >= standing.cutFrom));
    }
  });

  it('costs the file exactly what the file is worth', () => {
    const clean = standingFor(99, 0).player.composite;
    const thick = standingFor(99, 15).player.composite;

    // Fifteen lines, six points a line, at a fifth of the composite: eighteen
    // points, and the two places it moved somebody are the whole conversion.
    expect(clean - thick).toBe(18);
  });
});

describe('the edges a ranking is decided at', () => {
  it('keeps the player who is level with the line, on service, and loses', () => {
    // A composite exactly equal to the last person kept. The tie-break is
    // length of service, which the player has none of, so a dead heat with
    // Owen sends the player home - and Owen's service is on the same screen,
    // all consultation, which is the only thing that makes that survivable.
    const tied: readonly PoolMember[] = [
      {
        person: COMPANY_IDS.owen,
        role: 'Logistics, late shift',
        performance: 50,
        fileLines: 1,
        startedWeeksBefore: 3 * 52,
      },
    ];
    // Owen scores 55.2 and rounds to 55; 0.6 * 58 + 20 + 0.4 is 55.2 as well.
    const standing = poolStanding(
      { performance: 58, file: '', arcWeek: DECISION_WEEK },
      1,
      tied,
    );

    expect(standing.player.composite).toBe(55);
    expect(standing.rows[0]?.person).toBe(COMPANY_IDS.owen);
    expect(standing.position).toBe(2);
    expect(standing.inTheCut).toBe(true);
  });

  it('breaks a tie the same way twice, whatever order the pool arrives in', () => {
    const forwards = poolStanding(
      { performance: 50, file: '', arcWeek: DECISION_WEEK },
      2,
    );
    const backwards = poolStanding(
      { performance: 50, file: '', arcWeek: DECISION_WEEK },
      2,
      [...SELECTION_POOL].reverse(),
    );

    expect(backwards.rows.map((row) => row.person))
      .toEqual(forwards.rows.map((row) => row.person));
    expect(backwards.position).toBe(forwards.position);
  });

  it('leaves a player who is nowhere near the line alone', () => {
    const safe = standingFor(100, 0);

    expect(safe.position).toBe(1);
    expect(safe.inTheCut).toBe(false);
    // And safe is not the same as untouchable: the line is still on screen,
    // and it is still fifty-five.
    expect(safe.line).toBe(55);
  });

  it('cuts nobody when nobody is going', () => {
    const standing = poolStanding(
      { performance: 1, file: fileOf(20), arcWeek: 1 },
      0,
    );

    expect(standing.cut).toBe(0);
    expect(standing.cutFrom).toBe(standing.pool + 1);
    expect(standing.inTheCut).toBe(false);
  });
});

describe('what the screen says about it', () => {
  it('names the number, the place, the three lines and the neighbour', () => {
    const summary = matrixSummary(standingFor(56, 0), nameOf);

    expect(summary).toContain('2 of 6 roles go');
    expect(summary).toContain('5 of 6');
    expect(summary).toContain('54');
    // The person immediately above, by name, because a ranking against people
    // with names is the whole defence against this reading as a curve.
    expect(summary).toContain('Owen');
    expect(summary).toContain('55');
    expect(summary).toContain('you are in the two');
  });

  it('names the person below when the player is safe', () => {
    const summary = matrixSummary(standingFor(99, 0), nameOf);

    expect(summary).toContain('1 of 6');
    expect(summary).toContain('Bev');
    expect(summary).toContain('you are not in the two');
  });
});
