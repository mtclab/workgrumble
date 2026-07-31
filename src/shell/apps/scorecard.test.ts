/**
 * The day scorecard, scoped to the day it is scoring.
 *
 * Every number on that screen answers a question about ONE day, and two of
 * them were not: the late responses and the triage that disagreed with the
 * estate were counted over every ticket in the world. So a Monday with one
 * missed response reported that same failure on Tuesday's clean scorecard, and
 * Wednesday's, and Thursday's, and at the review - a player who fixed their
 * mistake and then had four flawless days was told, every evening, that they
 * had not.
 *
 * The counts come off one function now, which is what stops the three cohorts
 * drifting apart again, and this is that function driven against the shipped
 * world through the shipped verbs.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { dayOpensTick, shiftStartTick } from '../../world/day';
import { createWorldSession, type WorldSession } from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
import { scorecardCounts } from './scorecard';

beforeAll(() => {
  loadEngineForTests();
});

/** Just enough of the app's world to ask it the two questions. */
function apiFor(session: WorldSession): Parameters<typeof scorecardCounts>[0] {
  return {
    graph: session.engine.graph,
    clock: {
      now: () => session.engine.now(),
      onTick: () => () => {},
    },
  };
}

/** Monday, with the clock on the hour the shift starts. */
function mondayMorning(): WorldSession {
  const session = createWorldSession();
  session.engine.advance(shiftStartTick(1) - session.engine.now());
  return session;
}

/** How many tickets Monday inherits before anybody adds one. */
const INHERITED_ON_MONDAY = 2;

describe('what the scorecard counts as today', () => {
  /**
   * Monday bad, Tuesday clean. The gate is Tuesday reading zero: it is the
   * only assertion that can tell a scoped count from a cumulative one, and it
   * is the one the screen was getting wrong.
   */
  it('does not report Monday\'s misses on Tuesday\'s scorecard', () => {
    const session = mondayMorning();

    // Monday: one ticket nobody says a word to, and one triaged against the
    // evidence. Both are failures, and both belong to Monday.
    spawnWorldTicket(session.engine, 'ticket:fan-noise');
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      'ticket:fan-noise',
      { impact: 3, urgency: 3, priority: 1 },
    )).toEqual({ ok: true });

    // Long enough for the response clock on it to have run out.
    session.engine.advance(dayOpensTick(2) - session.engine.now() - 1);

    const monday = scorecardCounts(apiFor(session), 1);
    expect(monday.cohort.map((node) => node.id)).toContain('ticket:fan-noise');
    // The one this test added, and the pile Monday inherits at eight, none of
    // which anybody said a word to.
    expect(monday.lateResponses).toBe(INHERITED_ON_MONDAY + 1);
    expect(monday.misclassified.map((entry) => entry.id))
      .toEqual(['ticket:fan-noise']);

    // Tuesday: a different ticket, answered the minute it arrives and never
    // triaged wrongly.
    session.engine.advance(shiftStartTick(2) - session.engine.now());
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      'ticket:wedged-spooler',
      { comment: 'Looking at it now.' },
    )).toEqual({ ok: true });

    const tuesday = scorecardCounts(apiFor(session), 2);

    expect(tuesday.cohort.map((node) => node.id))
      .toEqual(['ticket:wedged-spooler']);
    expect(tuesday.lateResponses).toBe(0);
    expect(tuesday.misclassified).toEqual([]);

    // And Monday still says what Monday was. Scoping a count is not the same
    // as forgetting it.
    expect(scorecardCounts(apiFor(session), 1).lateResponses)
      .toBe(INHERITED_ON_MONDAY + 1);
    expect(scorecardCounts(apiFor(session), 1).misclassified).toHaveLength(1);
  });

  /**
   * The two counts on this panel that used to be recomputed from NOW.
   *
   * A response answered on the Tuesday turned Monday's row from late to clean,
   * days after Monday's pay had been banked; and a triage filed on the Tuesday
   * for a Monday ticket was reported as Monday's misreading, which is a day
   * the player had not touched it. Both questions are about a day, so both are
   * asked of that day's own minutes.
   */
  it('does not let a later day rewrite an earlier one', () => {
    const session = mondayMorning();
    spawnWorldTicket(session.engine, 'ticket:fan-noise');

    // Monday goes past with nobody saying a word to anybody.
    session.engine.advance(dayOpensTick(2) - session.engine.now() - 1);
    const monday = scorecardCounts(apiFor(session), 1);
    expect(monday.lateResponses).toBe(INHERITED_ON_MONDAY + 1);
    expect(monday.misclassified).toEqual([]);

    // Late on Monday something else lands, untouched by anybody.
    const late = 'ticket:wedged-spooler';
    spawnWorldTicket(session.engine, late);

    // Tuesday: somebody finally answers the fan, and triages the other one
    // against the evidence while they are there.
    session.engine.advance(shiftStartTick(2) - session.engine.now());
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      'ticket:fan-noise',
      { comment: 'Looking at it now, a day late.' },
    )).toEqual({ ok: true });
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      late,
      // Filed as a nothing job: one desk, whenever. It is the office-wide
      // print outage.
      { impact: 1, urgency: 1, priority: 4 },
    )).toEqual({ ok: true });

    // Monday is exactly what Monday was, and always will be.
    expect(scorecardCounts(apiFor(session), 1).lateResponses)
      .toBe(monday.lateResponses);
    expect(scorecardCounts(apiFor(session), 1).misclassified).toEqual([]);

    // And the misreading is on the day somebody actually made it, even though
    // the ticket it is about arrived the day before.
    expect(scorecardCounts(apiFor(session), 2).misclassified
      .map((entry) => entry.id)).toEqual([late]);
    expect(scorecardCounts(apiFor(session), 2).cohort
      .map((node) => node.id)).not.toContain(late);
  });

  /** And the three cohorts on that panel are the same cohort. */
  it('scores every count over the tickets that arrived that day', () => {
    const session = mondayMorning();
    spawnWorldTicket(session.engine, 'ticket:fan-noise');
    session.engine.advance(shiftStartTick(2) - session.engine.now());
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');

    for (const day of [1, 2]) {
      const counts = scorecardCounts(apiFor(session), day);

      for (const node of counts.cohort) {
        const spawned = node.fields.spawned_at;
        expect(typeof spawned === 'number' ? spawned : -1, node.id)
          .toBeGreaterThanOrEqual(dayOpensTick(day));
        expect(typeof spawned === 'number' ? spawned : -1, node.id)
          .toBeLessThan(dayOpensTick(day + 1));
      }
    }
  });
});
