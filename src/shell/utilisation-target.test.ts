/**
 * Per-title utilisation targets, PLAYED (E9/E10 bridge, 0.39.0 - lane C).
 *
 * `world/timesheet.test.ts` proves the reading out of fixtures and
 * `world/titles.test.ts` proves the column holds together. This file asks the
 * only question neither of those can: with the shipped start carry, the shipped
 * driver and the shipped week, does the rung a player is actually sitting at
 * decide what the business asks of their hours - and does the review say so?
 *
 * The week driven here is IDLE BUT PRESENT: the player clocks on, the day runs
 * out under them, and they attribute nothing to anybody. It is the shape of
 * week the whole column exists to have an opinion about, and it separates the
 * three built rungs cleanly.
 *
 * WHERE THE TEETH ARE, said out loud because each is a thing that would ship
 * broken otherwise:
 *
 *  - THE ROW IS PER RUNG. An idle week reds the row at the engineer and leaves
 *    the probationer's card without a row at all. Put the target back in one
 *    place for both service-desk rungs - which is what it was until this slice,
 *    a map keyed by PAM TIER - and the junior half goes red immediately, because
 *    two rungs stand on that tier and only one of them is asked for anything.
 *  - THE HEADER READS THE TABLE. The sentence the timesheet window prints names
 *    the percentage `utilisationTargetFor` returns for THAT rung, taken from the
 *    table here rather than written down again. Hardcode any figure in
 *    `utilisationLine` and the senior case reds against the engineer's, because
 *    the two rungs are asked for different numbers on different bases.
 *  - THE ROW SAYS IT IS NOT SCORED. Under target is a conversation and never a
 *    mark (#67). Take the clause off `utilisationReviewLine` and the wording
 *    assertions go red; fold the reading into `weekPerformance` and the mark
 *    assertion below goes red with them.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { createWorldSession, type WorldSession } from '../world/session';
import { utilisationLine } from '../world/timesheet';
import { type Rung, utilisationTargetFor } from '../world/titles';
import { REVIEW_DAY } from '../world/week';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { carryForStart } from './start';

beforeAll(() => {
  loadEngineForTests();
});

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
}

/**
 * A world at whichever rung, stood up the way the SHELL stands one up.
 *
 * Through `carryForStart`, which is the start select's own road - the same
 * reason `audit-teeth.test.ts` gives for using it: a test that built a senior by
 * writing the tier and the title onto the player node would be testing a second
 * way to be a senior, and the whole of `start.ts` is that there is only one.
 */
function rig(rung: Rung): Rig {
  const session = createWorldSession(carryForStart(rung));
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
    undefined,
    session.week,
    session.channels,
  );

  return { session, driver };
}

/**
 * The whole week, clocked on for and spent on nothing.
 *
 * Present rather than absent, which is the distinction that makes the number
 * mean anything: the hours are on the clock and the sheet has nothing to put
 * against them.
 */
function idleWeek(rigged: Rig, endTheWeek = true): void {
  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    rigged.driver.startShift();

    while (rigged.driver.state() === 'shift') {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    // The last clock-off ENDS the week, which files the sheet. A caller that
    // wants to move the reading has to be left standing on the Friday with it
    // still open, because a submitted sheet correctly refuses an edit.
    if (day < REVIEW_DAY || endTheWeek) {
      rigged.driver.clockOff();
    }
  }
}

describe('what the business asks of the hours is a column on the rung table', () => {
  it('leaves the PROBATIONER\'s card without a utilisation row at all', () => {
    const rigged = rig('sd_junior');
    idleWeek(rigged);

    const reading = rigged.driver.timesheetUtilisation();

    expect(utilisationTargetFor('sd_junior')).toBeNull();
    expect(reading.target).toBeNull();
    // Nothing to be under, so nothing said about being under it - and the two
    // review surfaces leave the row off rather than print a blank.
    expect(reading.met).toBe(true);
    expect(rigged.driver.weekScorecard().utilisation).toBe('');
    // The window still prints the number, and claims no target with it.
    expect(utilisationLine(reading)).not.toContain('the business asks for');
  }, 60_000);

  it('clears the SENIOR desk\'s gentle target on a sheet nobody thought about', () => {
    const rigged = rig('sd_senior');
    idleWeek(rigged);

    const target = utilisationTargetFor('sd_senior');
    const reading = rigged.driver.timesheetUtilisation();
    const row = rigged.driver.weekScorecard().utilisation;

    expect(target).not.toBeNull();
    // The desk's sheet is one bucket a day at seven and a half hours, so an
    // idle week accounts for the whole of itself and clears the target with
    // room. That is the pathology the research names - stop recording
    // non-billable time and utilisation is always a hundred - shipped as the
    // joke it is rather than as a punishment.
    expect(reading.basis).toBe('recorded');
    expect(reading.percent).toBe(100);
    expect(reading.met).toBe(true);
    // THE HEADER READS THE TABLE: the figure in the sentence is the figure on
    // the row, not one written into the reader.
    expect(utilisationLine(reading))
      .toContain(`against the ${String(target?.percent)}% the business asks for`);
    expect(row).toContain('On target');
    expect(row).toContain('nothing on this card is computed from it');
  }, 60_000);

  it('reds the ENGINEER\'s row on an idle week and calls it a conversation', () => {
    const rigged = rig('systems_engineer');
    idleWeek(rigged);

    const target = utilisationTargetFor('systems_engineer');
    const reading = rigged.driver.timesheetUtilisation();
    const card = rigged.driver.weekScorecard();

    expect(target?.basis).toBe('billable');
    // A week on the clock with nothing on anybody's invoice.
    expect(reading.availableMinutes).toBeGreaterThan(0);
    expect(reading.percent).toBe(0);
    expect(reading.met).toBe(false);
    expect(utilisationLine(reading))
      .toContain(`against the ${String(target?.percent)}% the business asks for`);

    // And the review row, which is where #67's decision lives: under target is
    // a CONVERSATION and not a mark, said in the row so the player does not
    // have to guess whether the verdict above it had this in it.
    expect(card.utilisation).toContain('Under target');
    expect(card.utilisation).toContain('conversation');
    expect(card.utilisation).toContain('not a mark');
    expect(card.utilisation).toContain('nothing on this card is computed from it');
  }, 60_000);

  it('asks the two desk rungs for different things off the same PAM tier', () => {
    // The thing the old tier-keyed map could not say, and the reason the column
    // had to move onto the table: a senior service desk analyst has a junior's
    // privileges, so the tier cannot be the answer to what the business asks.
    const junior = rig('sd_junior');
    const senior = rig('sd_senior');

    expect(junior.driver.playerTier()).toBe(senior.driver.playerTier());
    expect(junior.driver.timesheetUtilisation().target).toBeNull();
    expect(senior.driver.timesheetUtilisation().target)
      .toBe(utilisationTargetFor('sd_senior')?.percent);
  }, 60_000);

  it('moves the row off the target and leaves the mark where it was', () => {
    // The same week twice, differing in ONE thing: what the player says their
    // hours were. The desk's sheet is the one that can be moved without moving
    // the queue - one line a day, claimable through the shipped verb - so this
    // is the cheapest honest way to ask whether the row is a term in the mark.
    const rigged = rig('sd_senior');
    idleWeek(rigged, false);

    const before = rigged.driver.weekScorecard();
    expect(before.utilisation).toContain('On target');

    // Two days written down as nothing: three days of five accounted for is
    // sixty per cent, which is under the eighty-five the row asks for.
    expect(rigged.driver.claimTimesheet('1.1', 0, null).ok).toBe(true);
    expect(rigged.driver.claimTimesheet('2.1', 0, null).ok).toBe(true);

    const after = rigged.driver.weekScorecard();

    expect(after.utilisation).toContain('Under target');
    expect(after.utilisation).not.toBe(before.utilisation);
    // And the verdict did not notice. Fold the reading into `weekPerformance`
    // and these three go red together.
    expect(after.performance).toBe(before.performance);
    expect(after.bar).toBe(before.bar);
    expect(after.outcome).toBe(before.outcome);
  }, 60_000);
});
