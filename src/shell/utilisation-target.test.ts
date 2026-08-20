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
 *  - THE ROW IS PER RUNG, AND ONLY WHERE THE SHEET CAN MOVE. An idle week reds
 *    the row at the engineer AND at the senior desk (0.40.0), and leaves the
 *    probationer's card without a row at all. The senior's 85% came off in
 *    0.39.0's verifier round because their sheet was the junior's one-bucket
 *    sheet, which records the whole day by construction, so the target was
 *    cleared before the player did anything; 0.40.0 moved the shape onto the
 *    rung and the figure came back. Key the sheet on the PAM TIER again and the
 *    senior case below goes green on a week nobody worked, which is the exact
 *    failure it exists to catch. Put a figure back on the PROBATIONER's
 *    one-bucket rung and the table refuses to load at all.
 *  - THE HEADER READS THE TABLE. The sentence the timesheet window prints names
 *    the percentage `utilisationTargetFor` returns for THAT rung, taken from the
 *    table here rather than written down again. Hardcode the figure in
 *    `utilisationLine` and the desk cases red, because a rung with no target
 *    must print no target clause at all.
 *  - THE ROW SAYS IT IS NOT SCORED. Under target is a conversation and never a
 *    mark (#67). Take the clause off `utilisationReviewLine` and the wording
 *    assertions go red; fold the reading into `weekPerformance` and the mark
 *    assertion below goes red with them.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { createWorldSession, type WorldSession } from '../world/session';
import { WORKING_MINUTES_PER_DAY } from '../world/hours';
import { lineAt, utilisationLine } from '../world/timesheet';
import { findWorldTicket } from '../world/tickets';
import { type Rung, utilisationTargetFor } from '../world/titles';
import { REVIEW_DAY } from '../world/week';
import { editsOffered } from './apps/timesheet';
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
function idleWeek(
  rigged: Rig,
  endTheWeek = true,
  onFirstMorning?: (rigged: Rig) => void,
): void {
  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    rigged.driver.startShift();

    if (day === 1) {
      onFirstMorning?.(rigged);
    }

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

/**
 * One real step of the queue, dispatched through the driver.
 *
 * The engineer's sheet is derived from work that actually happened, so a test
 * that wants a LINE on it has to do a job rather than write one down. The step
 * is the shipped path's own first step, which is the same road
 * `world/patience.test.ts` takes for the same reason.
 */
function oneJob(rigged: Rig): void {
  for (const ticket of rigged.session.engine.graph.nodesOfKind('ticket')) {
    const step = findWorldTicket(ticket.id)?.paths[0]?.steps[0];

    if (step === undefined) {
      continue;
    }

    const result = rigged.driver.dispatch(
      step.action,
      COMPANY_IDS.player,
      step.target,
      { ...step.params },
    );

    if (result.ok) {
      return;
    }
  }

  throw new Error('The MSP Monday deals no job this rig can work.');
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

  /**
   * THE PROOF THE KNOB TURNS (0.40.0), and the one 0.39.0's verifier round
   * could not write.
   *
   * The same idle week, at the rung whose target was theatre until the sheet
   * moved with it. A senior who is present all week and attributes nothing now
   * reads NOUGHT per cent recorded and the row goes red - where the identical
   * week on the tier-keyed sheet read a hundred per cent, because that shape
   * wrote seven and a half hours a day whatever anybody did.
   *
   * Revert the shape to a tier read and this test goes GREEN on a week nobody
   * worked. That is what makes it a gate rather than an assertion.
   */
  it('REDS the SENIOR desk on an idle week, which is what the shape bought', () => {
    const rigged = rig('sd_senior');
    idleWeek(rigged);

    const target = utilisationTargetFor('sd_senior');
    const sheet = rigged.driver.timesheet();
    const reading = rigged.driver.timesheetUtilisation();
    const card = rigged.driver.weekScorecard();

    // THE READING FIRST, and deliberately: this is the assertion the whole
    // slice is for, so it must be the one that speaks when somebody puts the
    // shape back on the tier. Nought per cent of a week that was on the clock,
    // against the 85 the business asks - where the tier-keyed sheet read a
    // hundred and met it.
    expect(target).toEqual({ basis: 'recorded', percent: 85 });
    expect(reading.basis).toBe('recorded');
    expect(reading.availableMinutes).toBeGreaterThan(0);
    expect(reading.percent).toBe(0);
    expect(reading.met).toBe(false);
    expect(utilisationLine(reading))
      .toContain('against the 85% the business asks for');
    // And the review row, in the same words #67 decided for the engineer's:
    // under target is a conversation, and nothing is computed from it.
    expect(card.utilisation).toContain('Under target');
    expect(card.utilisation).toContain('conversation');
    expect(card.utilisation).toContain('nothing on this card is computed from it');

    // And the sheet under it, which is why the number could move: one line per
    // party the day went on, off the ledger - so a week that went nowhere has
    // no lines on it at all and a full day underneath as nobody's.
    expect(sheet.shape).toBe('per_customer');
    expect(sheet.derived).toBe(0);
    expect(sheet.days[0]?.unattributed).toBeGreaterThan(0);
  }, 60_000);

  /**
   * And the same rung with a morning's work on it, through the REAL DISPATCH.
   *
   * A sheet built by writing a ledger onto a fixture proves the formatter and
   * nothing else. This drives a job the way the player does and asks the sheet
   * what it made of it, which is the only way to catch a shape reading the
   * clock instead of the records.
   */
  it('puts the senior\'s worked minutes on a party line, off the ledger', () => {
    const rigged = rig('sd_senior');
    idleWeek(rigged, false, oneJob);

    const sheet = rigged.driver.timesheet();
    const truth = rigged.driver.timesheetTruth();
    const monday = sheet.days[0];

    // Every line on the sheet is a party the LEDGER named. Nothing is invented
    // and nothing is written by the shape: at an in-house shop that is the
    // employer's own work, and at a shop with customers on it those are the
    // customers (`world/timesheet.test.ts` drives the fold itself).
    expect(monday?.lines.length).toBeGreaterThan(0);
    expect(monday?.lines.every((line) => line.derived > 0)).toBe(true);
    expect(
      monday?.lines.reduce((total, line) => total + line.derived, 0),
    ).toBe(truth.days[0]?.attributed);
    // Not the desk's constant, and the rest of the day is on nobody - the two
    // facts a `single_bucket` sheet cannot state.
    expect(monday?.derived).toBeLessThan(WORKING_MINUTES_PER_DAY);
    expect(monday?.unattributed).toBeGreaterThan(0);

    // So the reading is off the floor and still under the ask, which is the
    // band the whole rung is played in.
    const reading = rigged.driver.timesheetUtilisation();

    expect(reading.percent).toBeGreaterThan(0);
    expect(reading.percent).toBeLessThan(85);

    // And there is something to disagree with, which is the other half of what
    // the shape buys: the claim moves the row and the record does not move.
    expect(lineAt(sheet, '1.1')).not.toBeNull();
    expect(rigged.driver.claimTimesheet('1.1', 400, null).ok).toBe(true);
    expect(rigged.driver.timesheetUtilisation().percent)
      .toBeGreaterThan(reading.percent);
    expect(rigged.driver.timesheetTruth().days[0]?.attributed)
      .toBe(truth.days[0]?.attributed);
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

  it('gives two rungs on ONE tier two different sheets and two answers', () => {
    // The whole reason both columns had to leave the tier behind. These two
    // players hold the same PAM tier - a senior service desk analyst has a
    // junior's privileges, by design - and everything about their paperwork
    // differs: the shape of the sheet, whether there is anything on it to
    // decide, and what the business asks of the hours. A tier read cannot
    // express any of that, and while it was making the decision the senior's
    // target had to be null to stay honest.
    const junior = rig('sd_junior');
    const senior = rig('sd_senior');

    expect(junior.driver.playerTier()).toBe(senior.driver.playerTier());
    expect(junior.driver.timesheet().shape).toBe('single_bucket');
    expect(senior.driver.timesheet().shape).toBe('per_customer');
    expect(junior.driver.timesheetUtilisation().target).toBeNull();
    expect(senior.driver.timesheetUtilisation().target).toBe(85);
    // And the probationer's sheet is still the joke it was: the day written by
    // the shape rather than read off the week, with nothing on it to argue
    // with. Byte for byte the surface 0.30.0 shipped.
    expect(editsOffered(junior.driver.timesheet())).toBe(false);
    expect(editsOffered(senior.driver.timesheet())).toBe(true);
  }, 60_000);

  it('moves the row off the target and leaves the mark where it was', () => {
    // The same week twice, differing in ONE thing: what the player says their
    // hours were. It is the ENGINEER's week, because the engineer is the rung
    // with a row to move - the desk's sheet writes itself and its target went
    // null with it (see above). One real job on the Monday puts one line on the
    // sheet, and that line is the lever: everything else about the two readings
    // below is the same week.
    const rigged = rig('systems_engineer');
    idleWeek(rigged, false, oneJob);

    const before = rigged.driver.weekScorecard();
    expect(before.utilisation).toContain('Under target');

    // The job written down as nothing, through the shipped claim verb.
    expect(rigged.driver.claimTimesheet('1.1', 0, null).ok).toBe(true);

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
