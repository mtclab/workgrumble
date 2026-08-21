/**
 * THE STANDING GATE: the season plays on the weeks it is scheduled for.
 *
 * Every other gate this build has over the redundancy round asks its questions
 * AT the table: `season-home.test.ts` sweeps `REDUNDANCY_ROUND.weather` to
 * `REDUNDANCY_ROUND.decision`, `scripted-arc.test.ts` opens with
 * `const DECISION = REDUNDANCY_ROUND.decision`, and `pressure.test.ts` asks
 * `beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.notice)`. Each of those is the
 * right question about ownership, about a week that decides, and about the
 * beat function - and not one of them can tell you WHEN the season is. Move
 * every beat two weeks earlier and all three follow it, green.
 *
 * That hole was measured rather than guessed, and it was measured on the exact
 * change that then shipped: with the arc re-cut to ten weeks and the round
 * moved to weather 4 / notice 6 / criteria 7 / decision 8, the whole suite
 * stayed green except one assertion about a constant. Three thousand tests and
 * nothing noticed that a third of the season had moved. This file was written
 * before the re-time for that reason - the gate has to exist before the thing
 * it guards moves, or nobody finds out what the move cost.
 *
 * So this file pins the schedule as LITERAL week numbers and reads them off
 * REAL worlds - the shipped session, the shipped driver, this shop's own arc -
 * rather than off the table that placed them. A re-time is then a deliberate
 * edit here with the moved beat named in the commit, which is what the pacing
 * rules are worth: they are load-time refusals about a shape, and this is the
 * only place that says which shape shipped.
 *
 * TEETH: move any beat in `REDUNDANCY_ROUND` by a week - the revert - and the
 * week that lost it goes red naming the beat it expected and the beat it got.
 *
 * Ten worlds with a wasm engine under each, which is what "played" costs
 * and the reason this is one pass rather than a case per week.
 */

import { describe, expect, it } from 'vitest';

import { employerFor, FIRST_EMPLOYER } from '../world/employers';
import { findMailThread, visibleMail } from '../world/mail';
import type { PressureBeat } from '../world/pressure';
import { createWorldSession, type WorldSession } from '../world/session';
import { DayDriver } from './day-driver';

/** A headless desk: no windows open, nothing on screen, nobody watching. */
const HANDLERS = {
  onDayBoundary: (): void => {},
  openSlackApps: (): readonly string[] => [],
  focusedSlackApp: (): string | null => null,
};

interface Shop {
  readonly session: WorldSession;
  readonly driver: DayDriver;
}

/**
 * The probation shop, stood up at one week of its arc through the shipped
 * path - the same four things `main.ts` hands the driver, including the arc,
 * which is the whole subject here.
 */
function shopAt(arcWeek: number): Shop {
  const shop = employerFor(FIRST_EMPLOYER);
  const session = createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek,
    employer: FIRST_EMPLOYER,
  });

  return {
    session,
    driver: new DayDriver(
      session.engine,
      shop.playerId,
      session.seed,
      HANDLERS,
      undefined,
      session.week,
      session.channels,
      session.runsBossPings,
      shop.arc,
    ),
  };
}

/**
 * The season as it ships, written out in weeks rather than read out of the
 * table that places them.
 *
 * Ten entries because the arc is ten weeks: week one is the probation week and
 * carries nothing by rule, weeks two and three are the quiet ones a player
 * needs in order to have a normal week to compare an abnormal one against, the
 * weather runs four to five because two weeks is what makes an attentive
 * player feel clever later, the announcement is week six, the consultation is
 * on screen in week seven and closes before the week that decides, the
 * conversation is the Friday of week eight, and weeks nine and ten are clear
 * by construction rather than by luck.
 *
 * It was twelve until 0.41.0, with the consultation on screen seven to nine
 * and the conversation on the Friday of week ten. The two weeks came out of
 * the consultation window and out of nothing else, which is why the only
 * entries below that changed are weeks eight and nine.
 */
const SCHEDULE: readonly (PressureBeat | null)[] = [
  null, // week 1 - probation
  null, // week 2 - quiet
  null, // week 3 - quiet
  'weather', // week 4
  'weather', // week 5
  'notice', // week 6
  'criteria', // week 7
  'decision', // week 8
  null, // week 9 - clear
  null, // week 10 - clear
];

/** What the quiet-week sentence is, taken from the week nothing is on. */
const QUIET = 'Nothing is being proposed. There is no round on, nobody is '
  + 'being scored against anybody, and the week is decided on the mark and '
  + 'the file alone.';

describe('the season plays on the weeks it is scheduled for', () => {
  it('runs ten weeks, which is the length the schedule fills', () => {
    // The arc's length is half the schedule: a season placed correctly inside
    // an arc of the wrong length is still the wrong season, and the two clear
    // weeks at the end only exist because there are weeks there to be clear.
    // Its own case rather than a first line in the sweep below, so that a
    // re-time reports the beat that moved as well as the length that changed.
    expect(employerFor(FIRST_EMPLOYER).arc.weeks).toBe(10);
    expect(SCHEDULE).toHaveLength(10);
  });

  it('carries each beat in the week it belongs to, over real worlds', () => {
    for (const [index, expected] of SCHEDULE.entries()) {
      const week = index + 1;
      const where = `arc week ${String(week)}`;
      const shop = shopAt(week);
      const reading = shop.driver.pressureReading();

      // The beat the WORLD is in, not the beat the table says it should be.
      expect(reading.beat, where).toBe(expected);
      expect(reading.week, where).toBe(week);

      if (expected === null) {
        // A quiet week is quiet on every surface, not just in the reading:
        // no season, no matrix, and the sentence a player with no round on
        // has read since the probation week.
        expect(reading.season, where).toBeNull();
        expect(shop.driver.pressureSummary(), where).toBe(QUIET);
        continue;
      }

      expect(reading.season, where).not.toBeNull();
      expect(shop.driver.pressureSummary(), where).not.toBe(QUIET);

      // The matrix exists exactly where the player can be scored on it and
      // nowhere earlier: before the criteria beat nobody has been told they
      // are in a pool, so a ranking on screen would be a leak.
      const ranked = expected === 'criteria' || expected === 'decision';

      expect(reading.standing === null, where).toBe(!ranked);
    }
  }, 300_000);

  it('puts each announcement in the inbox from its own week and not before', () => {
    // The two beats that arrive as post are the two the player can be caught
    // out by, so "the beat fired" and "the mail is readable" have to be the
    // same week. Read off real inboxes at the weeks either side of each.
    const inboxAt = (week: number): readonly string[] => visibleMail(
      shopAt(week).session.engine.graph,
      FIRST_EMPLOYER,
    ).map((entry) => entry.id);

    expect(inboxAt(3)).not.toContain('mail/round-weather');
    expect(inboxAt(4)).toContain('mail/round-weather');
    expect(inboxAt(5)).not.toContain('mail/round-notice');
    expect(inboxAt(6)).toContain('mail/round-notice');
  }, 120_000);

  it('tells the player eighteen days, which is over the legal floor', () => {
    // The one number in this season a player is asked to diarise, read out of
    // the shipped mail body rather than recomputed here. Eighteen is the
    // announcement on the Monday of week six and the conversation on the
    // Friday of week eight, and it clears the floor a round of two out of six
    // actually owes - one week's statutory notice - by more than double. It
    // read thirty-two until 0.41.0, when the arc came down to ten weeks and
    // the notice floor stopped charging a small round the twenty-to-ninety-
    // nine collective figure. Any re-time moves this sentence, and it is the
    // sentence rather than the constant that decides whether a player can see
    // the conversation coming.
    const thread = findMailThread('mail/round-notice');
    const body = (thread?.messages ?? []).flatMap((message) => message.body)
      .join(' ');

    expect(body).toContain('18 days from today');
  });
});
