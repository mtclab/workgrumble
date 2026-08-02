/**
 * The Thursday afternoon the workstation takes for itself, as the shipped week
 * authors it - driven through the shipped driver and the shipped engine.
 *
 * Lane A proved the MACHINERY on a fixture: a budget that shrinks, a ledger
 * that survives a save, a refusal that says why. This file is about the two
 * things a fixture cannot answer.
 *
 * The first is the CONTENT: that the probation week really does schedule one,
 * on the day that had a call and no machine, at a minute that leaves every
 * window in the budget genuinely spendable inside the shift. A reboot whose
 * worst case ran past five would be refused at load, and a reboot authored at
 * half past four would be a budget the player can look at and never use.
 *
 * The second is the COUNTDOWN, which is lane B's own seam and the whole point
 * of a postpone: the minutes a push buys are minutes at the DESK. Something
 * has to be counting them, that something cannot be `interruption()` - by
 * design nothing is interrupting - and the queue has to be workable for every
 * one of them, or the budget would be a button that changes when the outage
 * happens and nothing else.
 *
 * Nothing here touches the DOM. The two windows are drawn from exactly these
 * answers; what they draw is walked on the built artifact in
 * `e2e/interruptions.spec.ts`.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatchResult } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { minuteOfDay } from '../world/hours';
import {
  buildInterruptionSchedule,
  type InterruptionEntry,
  placeDeferred,
} from '../world/interruptions';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import {
  DayDriver,
  INSTALLING_UPDATES_REASON,
  TICK_INTERVAL_MS,
} from './day-driver';
import { countdownChip } from './update-screen';

beforeAll(() => {
  loadEngineForTests();
});

/** The day the week puts a machine on, and the row it puts there. */
const THURSDAY = 4;
const REBOOT_ID = 'machine:reboot';

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
}

function runTo(world: Harness, tick: number): void {
  while (
    world.session.engine.now() < tick
    && world.driver.state() === 'shift'
  ) {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * Every open ticket worked the way its own content says it can be, and what
 * the world said about each attempt.
 *
 * The answers are handed back because one of the tests below is about them:
 * "the desk is workable" is not a claim about a dispatch returning at all, it
 * is a claim that nothing came back refused by a workstation.
 */
function workTheQueue(world: Harness): readonly DispatchResult[] {
  const answers: DispatchResult[] = [];

  for (const ticket of world.session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    for (const step of findWorldTicket(ticket.id)?.paths[0]?.steps ?? []) {
      answers.push(world.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      ));
    }
  }

  return answers;
}

/** The tickets still somebody's problem, by id. */
function stillOpen(world: Harness): readonly string[] {
  return world.session.engine.graph.nodesOfKind('ticket')
    .filter(isUnresolved)
    .map((ticket) => ticket.id);
}

/**
 * A driver standing at the start of the Thursday, on a week that was WORKED.
 *
 * The days before it are played rather than skipped, exactly as the browser
 * plays them: the schedule is built at the day boundary, the queue carries
 * over, and a week nobody touched would have every meter at its ceiling by the
 * Wednesday - which is a world nothing about a cost can be measured in.
 */
function thursday(): Harness {
  const session = createWorldSession();
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
  );
  const world: Harness = { driver, session };

  for (let played = 1; played < THURSDAY; played += 1) {
    driver.startShift();
    runTo(world, shiftStartTick(played) + 90);
    workTheQueue(world);
    runTo(world, shiftStartTick(played) + 300);
    workTheQueue(world);
    runTo(world, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  return world;
}

/** The reboot as the shipped seed places it on the shipped Thursday. */
function reboot(session: WorldSession): InterruptionEntry {
  const schedule = buildInterruptionSchedule(
    session.seed,
    THURSDAY,
    interruptionPlanFor(THURSDAY, session.seed),
  );
  const entry = schedule.entries.find(
    (candidate) => candidate.id === REBOOT_ID,
  );

  if (entry === undefined) {
    throw new Error('The shipped Thursday does not schedule the reboot.');
  }

  return entry;
}

/** Where the Nth push lands, the day's other bookings and all. */
function landingAfter(session: WorldSession, spends: number): number {
  const plan = interruptionPlanFor(THURSDAY, session.seed);
  const schedule = buildInterruptionSchedule(session.seed, THURSDAY, plan);

  return placeDeferred(
    reboot(session),
    schedule,
    plan.blocked,
    spends,
  )?.tick ?? -1;
}

/* -- the content ----------------------------------------------------------- */

describe('the update the probation week schedules', () => {
  /**
   * The row itself, on the shipped seed rather than in the abstract.
   *
   * It is pinned to the MINUTE because an update is not somebody deciding to
   * pick the phone up: it takes no jitter, it happens when it was scheduled to
   * happen by somebody who has never met you, and a jitter typed onto the row
   * later would make every other number in this file approximate.
   */
  it('lands at ten past two on the Thursday, with three shrinking windows', () => {
    const session = createWorldSession();
    const entry = reboot(session);

    expect(minuteOfDay(entry.tick)).toBe(14 * 60 + 10);
    expect(entry.slidFrom).toBeNull();
    expect(entry.source).toBe('machine');
    expect(entry.declinable).toBe(false);
    // Nobody's ticket, by construction: a workstation is about no work anybody
    // is holding, which is what makes it malignant every single time.
    expect(entry.relatedTicket).toBeNull();
    expect([...entry.postpones]).toEqual([10, 5, 2]);
    expect(entry.endsTick - entry.tick).toBe(12);
  });

  /**
   * The budget is spendable, which is a claim about the AFTERNOON rather than
   * about the row.
   *
   * The loader already refuses a reboot whose worst case leaks past the end of
   * the shift, so "it fits" is guaranteed. What is asserted here is the thing
   * that makes it a mechanic rather than a formality: with every window spent,
   * each push actually buys the minutes it promised, and the outage still ends
   * with an hour of shift behind it - so a player who spends the whole budget
   * to reach a boundary gets the boundary AND the afternoon.
   */
  it('can have every window spent and still finish inside the afternoon', () => {
    const session = createWorldSession();
    const entry = reboot(session);
    const minutes = entry.endsTick - entry.tick;
    const landings = [1, 2, 3].map((spends) => landingAfter(session, spends));
    const [first, second, third] = landings as [number, number, number];

    // The first window is clear air and buys exactly what it says. The second
    // one lands in minutes the lead's rounds already had on this seed and
    // slides past them, which is the schedule's own discipline rather than a
    // window that shrank - so the assertion is AT LEAST, for the same reason
    // lane A's is: the day's other bookings are the day's business.
    expect(first).toBe(entry.tick + 10);
    expect(second).toBeGreaterThanOrEqual(first + 5);
    expect(third).toBeGreaterThanOrEqual(second + 2);
    // And the whole budget spent still hands the desk back with the best part
    // of two hours on the shift, which is what makes it a decision.
    expect(third + minutes).toBeLessThan(shiftEndTick(THURSDAY) - 60);
  });
});

/* -- the countdown --------------------------------------------------------- */

describe('the minutes a postpone buys', () => {
  /**
   * The gate this seam exists for: a pushed reboot is COMING, something says
   * how long there is, and the desk is the player's for every minute of it.
   *
   * All three halves matter. A countdown that reported nothing would leave the
   * player pushing a button with no idea what it bought; a countdown that took
   * the desk would be spending the budget on their behalf; and a desk that
   * refused work while nothing was interrupting would be the whole mechanic
   * inverted - the postpone is the only thing in this family that hands
   * minutes BACK.
   */
  it('are counted down, and are minutes the queue can be worked in', () => {
    const world = thursday();
    const entry = reboot(world.session);

    runTo(world, entry.tick);
    expect(world.driver.interruption()?.entry.id).toBe(REBOOT_ID);
    expect(world.driver.deferInterruption()).toEqual({ ok: true });

    // Nothing owns the screen, and the thing that is coming says when.
    expect(world.driver.interruption()).toBeNull();

    const coming = world.driver.upcoming();

    expect(coming?.entry.id).toBe(REBOOT_ID);
    expect(coming?.postponed).toBe(true);
    expect(coming?.postponesLeft).toBe(2);
    expect(coming?.ticksAway).toBe(10);
    expect(coming?.entry.tick).toBe(landingAfter(world.session, 1));

    // And it is a COUNTDOWN: four minutes later it says four fewer.
    runTo(world, world.session.engine.now() + 4);
    expect(world.driver.upcoming()?.ticksAway).toBe(6);

    // The desk, meanwhile, is entirely the player's - which is what the ten
    // minutes were for and the only thing they were for. The claim is the
    // GOAL rather than the call: the queue is genuinely shorter afterwards,
    // and not one attempt came back refused by a workstation.
    const before = stillOpen(world);
    const answers = workTheQueue(world);
    const after = stillOpen(world);

    expect(answers.length).toBeGreaterThan(0);
    expect(answers.filter(
      (answer) => !answer.ok && answer.reason === INSTALLING_UPDATES_REASON,
    )).toEqual([]);
    expect(after.length).toBeLessThan(before.length);
  }, 20_000);

  /**
   * The chip's derivation, pinned for every window in the budget.
   *
   * This is the assertion a box run went looking for and could not find, and
   * the reason it could not is that the number belongs to the CLOCK rather
   * than to the budget. What the chip says is the placed arrival minus this
   * minute, and that is not the authored window in either direction:
   *
   *  - a postpone buys its minutes from the ARRIVAL it was spent at, so a
   *    player who presses the button five minutes into the dialog has five
   *    minutes of grace rather than ten (an e2e that pinned "10m" was pinning
   *    the minute it happened to click on, which is nobody's to promise);
   *  - and a callback that lands in minutes the day had already booked slides
   *    past them, which hands the player MORE. The second window on the
   *    shipped Thursday does exactly that.
   *
   * So the pin is the derivation itself, at all three windows, in a test that
   * controls the minute: the chip equals the placed landing minus now, it is
   * never less than the window that was bought, and it goes down with the
   * clock. A chip that rendered the next window out of the budget - the
   * arithmetic the dialog does - would read 5, 2, 2 here and fail all three.
   */
  it('counts down the minutes until the desk goes, window by window', () => {
    const world = thursday();
    const entry = reboot(world.session);
    const authored = [...entry.postpones];

    expect(authored).toEqual([10, 5, 2]);
    runTo(world, entry.tick);

    for (const [spend, bought] of authored.entries()) {
      // Spent AT the arrival, which is the only minute at which the window
      // bought and the window waited are the same number.
      expect(world.driver.interruption()?.entry.id, `spend ${String(spend)}`)
        .toBe(REBOOT_ID);
      expect(world.driver.deferInterruption()).toEqual({ ok: true });

      const landing = landingAfter(world.session, spend + 1);
      const at = world.session.engine.now();
      const waited = landing - at;

      expect(world.driver.upcoming()?.ticksAway, `spend ${String(spend)}`)
        .toBe(waited);
      expect(countdownChip(waited)).toBe(`Restarting in ${String(waited)}m`);
      // Never less than what was bought. More is the day's other bookings
      // pushing the callback out, which costs the player nothing.
      expect(waited, `spend ${String(spend)}`).toBeGreaterThanOrEqual(bought);

      // And it TICKS. A chip that showed the window as a constant would look
      // identical at the moment it was pressed and be a lie a minute later.
      runTo(world, at + 1);
      expect(world.driver.upcoming()?.ticksAway).toBe(waited - 1);
      expect(countdownChip(waited - 1))
        .toBe(`Restarting in ${String(waited - 1)}m`);

      runTo(world, landing);
    }

    // The far end of the budget: it is here, it is holding the desk, and
    // there is nothing counting down to anything any more.
    expect(world.driver.interruption()?.postponesLeft).toBe(0);
    expect(world.driver.upcoming()).toBeNull();
  }, 20_000);

  /**
   * And nothing counts down to something nobody has met.
   *
   * The chip and the window are drawn off this, so an `upcoming` that reported
   * every scheduled entry would read the week out loud in advance: a phone
   * that rings at twenty past would be announced at ten past, and the surprise
   * the whole family is built on would be gone. Only a thing the player has
   * been TOLD about - which is to say, one they pushed themselves - is a thing
   * with a clock on it.
   */
  it('says nothing about an interruption the player has not met yet', () => {
    const world = thursday();
    const entry = reboot(world.session);

    runTo(world, entry.tick - 30);

    const coming = world.driver.upcoming();

    // It is genuinely the next thing on the day - the seam sees it - and it
    // is NOT a countdown, because nobody has been told about it.
    expect(coming?.entry.id).toBe(REBOOT_ID);
    expect(coming?.postponed).toBe(false);
    expect(coming?.postponesLeft).toBe(3);
  }, 20_000);

  /**
   * The countdown comes out of a save file with the same number on it.
   *
   * It is the same claim lane A makes about the budget and it is made again
   * here because it is a DIFFERENT reader: the chip is drawn from `upcoming`,
   * which places the entry from the ledger every time it is asked, so a driver
   * that had started remembering where the callback went would be caught here
   * and nowhere else.
   */
  it('reads the same on both sides of a save', () => {
    const world = thursday();
    const entry = reboot(world.session);

    runTo(world, entry.tick);
    world.driver.deferInterruption();
    runTo(world, world.session.engine.now() + 3);

    const before = world.driver.upcoming();
    const savedAt = world.session.engine.now();
    const file = world.session.engine.serialize();
    const fresh = createWorldSession();
    const loaded = new DayDriver(
      fresh.engine,
      COMPANY_IDS.player,
      fresh.seed,
      {
        onDayBoundary: () => {},
        openSlackApps: () => [],
        focusedSlackApp: () => null,
      },
    );

    fresh.engine.restore(file);
    loaded.restoreDriverState(world.driver.driverState());

    expect(fresh.engine.now()).toBe(savedAt);

    const after = loaded.upcoming();

    expect(after?.entry.id).toBe(before?.entry.id);
    expect(after?.entry.tick).toBe(before?.entry.tick);
    expect(after?.ticksAway).toBe(before?.ticksAway);
    expect(after?.postponesLeft).toBe(before?.postponesLeft);
    expect(after?.postponed).toBe(true);
  }, 20_000);
});
