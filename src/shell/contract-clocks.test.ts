/**
 * The external contract's clocks, PLAYED (E9, 0.37.0 - D4).
 *
 * Four claims, each written so reverting the line it is about turns it red:
 *
 *  1. SILENCE IS STAMPED. A tiered ticket left untouched past its promise
 *     accrues cadence misses through the real driver minutes, monotone; words
 *     to the reporter re-anchor the window without shrinking the record.
 *  2. THE LATE ACK IS STAMPED ONCE. A tiered ticket whose response clock runs
 *     out untouched carries ack_missed forever - and exactly once.
 *  3. THE BILLING FLIPPED (D4). A tiered ticket's resolution breach no longer
 *     weighs in the meters' breach sum; its contract stamps weigh instead.
 *     An in-house world's arithmetic is byte-identical to before the module
 *     existed - the probation shop cannot grow a stamp at all.
 *  4. THE WALK'S TARGET EXISTS. The sysadmin walk names
 *     fontaine-matter-access as its cadence surface; the MSP morning deals it
 *     - asserted here in milliseconds so a week change reds here, not twenty
 *     minutes into a box run (the 0.36.0 lesson).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { FieldValue } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { cadenceMissesOn } from '../world/cadence';
import { priorityFor } from '../world/priority';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { HELPDESK_ACTIONS } from '../world/actions';
import { createWorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { carryForStart } from './start';

beforeAll(() => {
  loadEngineForTests();
});

const TARGET = 'ticket:fontaine-matter-access';

function rig() {
  const session = createWorldSession(carryForStart('systems_engineer'));
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

function runMinutes(rigged: ReturnType<typeof rig>, minutes: number): void {
  // Pinned to x1 so a step is a minute: at the driver's own default the day
  // runs out from under the last leg and the guard swallows the remainder.
  rigged.driver.setSpeed(1);

  for (let step = 0; step < minutes && rigged.driver.state() === 'shift'; step += 1) {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

describe('the contract settler', () => {
  it('deals the walk\'s named target on the MSP morning', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runMinutes(rigged, 90);

    const node = rigged.session.engine.graph.getNode(TARGET);
    expect(node, 'the sysadmin walk names this ticket - see total-walk '
      + 'tickets.contract-clocks').toBeDefined();
  });

  it('stamps silence, monotone, and words re-anchor without shrinking', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runMinutes(rigged, 90);

    // Triage it so the cadence promise exists (a silver P3 promises an
    // update every two hours), then let the desk say nothing past a window.
    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      TARGET,
      { impact: 2, urgency: 2, priority: priorityFor(2, 2) },
    )).toEqual({ ok: true });

    runMinutes(rigged, 130);

    const node = () => rigged.session.engine.graph.getNode(TARGET)!;
    const stamped = cadenceMissesOn(node());
    // At least one window has passed in silence. The EXACT count is the
    // arrival phase's to blur (its minutes tick without being desk minutes),
    // and an exact figure here would be the faked-clock lesson relearned -
    // the property under test is that silence stamps and the count climbs.
    expect(stamped).toBeGreaterThanOrEqual(1);

    // Words re-anchor the window; the record holds.
    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      COMPANY_IDS.player,
      TARGET,
      { comment: 'Still with the vendor - the matter list is rebuilding.' },
    )).toEqual({ ok: true });

    runMinutes(rigged, 30);
    expect(cadenceMissesOn(node())).toBe(stamped);

    // And another window of silence grows it again - monotone, never down.
    // A hundred and fifty minutes, generous headroom past one more window on
    // this leg of the day.
    runMinutes(rigged, 150);
    expect(cadenceMissesOn(node())).toBeGreaterThan(stamped);
  });

  it('stamps the late ack exactly once', () => {
    const rigged = rig();
    rigged.driver.startShift();
    // A silver untriaged response target is 160 desk minutes; run well past
    // it without touching the ticket.
    runMinutes(rigged, 220);

    const node = rigged.session.engine.graph.getNode(TARGET);
    expect(node?.fields[FIELDS.ackMissed]).toBe(true);

    // The second stamp is refused by the action's own guard - the settler's
    // due-read never offers it twice, and the guard is what makes that a
    // property of the world rather than of the caller.
    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketRecordAckMiss,
      COMPANY_IDS.player,
      TARGET,
      {},
    ).ok).toBe(false);
  });

  /**
   * The record itself, guarded (0.37.1).
   *
   * The settler is the only caller and it counts up, so the verb only ever saw
   * whole numbers that climbed - and it therefore only guarded that SOMETHING
   * arrived. What that left open is the worst shape a param bug takes here: a
   * negative count goes into the field, comes back out of `breachWeightOf` as
   * a negative weight, and `nonNegative` THROWS inside `tickMeters`, which is
   * the day loop. Not a wrong number on a screen - a shift that stops.
   *
   * Both halves are proven by dispatching what the caller cannot currently
   * send, which is the only way to test a guard whose one caller is polite.
   */
  it('refuses a miss count that is not a count, or that shrinks the record', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runMinutes(rigged, 90);

    // The param is typed `FieldValue` because that is what a dispatch carries;
    // a string in it is exactly one of the shapes under test, and the caller
    // that sends one will not be this polite about it.
    const record = (misses: FieldValue): boolean => rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketRecordCadenceMiss,
      COMPANY_IDS.player,
      TARGET,
      { misses },
    ).ok;
    const stamped = (): unknown => rigged.session.engine.graph
      .getNode(TARGET)?.fields[FIELDS.cadenceMissed];

    // The floor. Drop the whole-number guard and the first of these lands,
    // and the day loop throws the next time the meters are read.
    expect(record(-1)).toBe(false);
    expect(record(-4)).toBe(false);
    expect(record(1.5)).toBe(false);
    expect(record('two')).toBe(false);
    expect(stamped()).toBeUndefined();

    // The record climbs, and holds.
    expect(record(2)).toBe(true);
    expect(stamped()).toBe(2);
    expect(record(3)).toBe(true);
    expect(stamped()).toBe(3);

    // And never shrinks. Drop the monotone guard and this one lands, and the
    // count of windows that passed in silence quietly un-passes two of them.
    expect(record(1)).toBe(false);
    expect(record(0)).toBe(false);
    expect(stamped()).toBe(3);
    // The same number twice is not a shrink - a settler that recounted the
    // same silence must not be refused for saying so.
    expect(record(3)).toBe(true);
    expect(stamped()).toBe(3);
  });

  it('cannot stamp anything at the probation shop', () => {
    const rigged = rig();
    // The in-house world: no tier anywhere, so a full silent day stamps no
    // ticket - which is what keeps every shipped in-house golden and the
    // meters' arithmetic byte-identical.
    const inHouse = createWorldSession();
    const driver = new DayDriver(
      inHouse.engine,
      COMPANY_IDS.player,
      inHouse.seed,
      {
        onDayBoundary: () => {},
        openSlackApps: () => [],
        focusedSlackApp: () => null,
      },
      undefined,
      inHouse.week,
      inHouse.channels,
    );
    driver.startShift();

    while (driver.state() === 'shift') {
      driver.step(TICK_INTERVAL_MS);
    }

    for (const ticket of inHouse.engine.graph.nodesOfKind('ticket')) {
      expect(ticket.fields[FIELDS.ackMissed], ticket.id).toBeUndefined();
      expect(ticket.fields[FIELDS.cadenceMissed], ticket.id).toBeUndefined();
    }

    void rigged;
  });

  it('writes the park off - waiting minutes are excused, not banked (0.37.1)', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runMinutes(rigged, 90);

    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      TARGET,
      { impact: 2, urgency: 2, priority: priorityFor(2, 2) },
    )).toEqual({ ok: true });
    // A question first - the CYA rule wants words before a park.
    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      TARGET,
      { comment: 'Which matter were you in when it refused you?' },
    )).toEqual({ ok: true });
    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketSetWaiting,
      COMPANY_IDS.player,
      TARGET,
      {},
    )).toEqual({ ok: true });

    const node = () => rigged.session.engine.graph.getNode(TARGET)!;
    const parkedWith = cadenceMissesOn(node());

    // Park across several would-be windows; a parked ticket owes nothing.
    runMinutes(rigged, 150);
    expect(cadenceMissesOn(node())).toBe(parkedWith);

    expect(rigged.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClearWaiting,
      COMPANY_IDS.player,
      TARGET,
      {},
    )).toEqual({ ok: true });

    // The measured bug, both rounds of it: round one landed the whole park
    // as silence one minute after the unpark; round two still billed the
    // REMAINDER of the window that was running when the park began - a
    // window that could be one hundred percent parked. The write-off must
    // buy a whole fresh window of actual desk silence.
    runMinutes(rigged, 3);
    expect(cadenceMissesOn(node())).toBe(parkedWith);
    runMinutes(rigged, 100);
    expect(cadenceMissesOn(node())).toBe(parkedWith);

    // And a full window of real silence after the unpark still charges - the
    // write-off is not an amnesty.
    runMinutes(rigged, 40);
    expect(cadenceMissesOn(node())).toBeGreaterThan(parkedWith);
  });
});
