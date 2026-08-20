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
 *    the row at the engineer and leaves BOTH service-desk cards without a row
 *    at all. The senior's 85% came off in 0.39.0's verifier round: their sheet
 *    is the junior's one-bucket sheet, which records the whole day by
 *    construction, so the target was cleared before the player did anything.
 *    Put any figure back on a `single_bucket` rung and the two desk cases below
 *    go red - which is the point of them.
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
import { utilisationLine } from '../world/timesheet';
import { findWorldTicket } from '../world/tickets';
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

  it('leaves the SENIOR desk\'s card without one too, and says why in the sheet', () => {
    const rigged = rig('sd_senior');
    idleWeek(rigged);

    const reading = rigged.driver.timesheetUtilisation();

    // The senior stands on the JUNIOR'S PAM TIER, so `shapeForTier` hands them
    // the same one-bucket sheet: seven and a half hours a day written by the
    // shape of the sheet, a hundred per cent recorded on a week nobody worked.
    // A target over that is cleared before the player has done anything, which
    // is why this row is null and not 85 as it shipped for one version - the
    // figure waits on the sheet shape moving to the rung.
    expect(utilisationTargetFor('sd_senior')).toBeNull();
    expect(reading.basis).toBe('recorded');
    expect(reading.percent).toBe(100);
    expect(reading.target).toBeNull();
    expect(reading.met).toBe(true);
    expect(rigged.driver.weekScorecard().utilisation).toBe('');
    expect(utilisationLine(reading)).not.toContain('the business asks for');
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

  it('asks the two desk rungs for nothing, off one tier and one sheet', () => {
    // The column moved onto the rung table because a tier-keyed map cannot tell
    // these two apart: a senior service desk analyst has a junior's privileges.
    // Today the table's answer for both is the same - NOTHING - and it is the
    // same answer for the same reason, which is the sheet that tier hands them
    // both. The seam is still the column: it is addressed per RUNG, so the day
    // the sheet shape moves to the rung the senior's figure comes back on its
    // own and the probationer's row stays off.
    const junior = rig('sd_junior');
    const senior = rig('sd_senior');

    expect(junior.driver.playerTier()).toBe(senior.driver.playerTier());
    expect(junior.driver.timesheet().shape)
      .toBe(senior.driver.timesheet().shape);
    expect(junior.driver.timesheetUtilisation().target).toBeNull();
    expect(senior.driver.timesheetUtilisation().target).toBeNull();
    // And the column is not empty, which is what makes those two nulls a
    // decision rather than a feature nobody finished.
    expect(utilisationTargetFor('systems_engineer')).not.toBeNull();
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
