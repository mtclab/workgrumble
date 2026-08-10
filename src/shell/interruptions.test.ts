/**
 * Being taken off the work, driven through the shipped driver and the shipped
 * engine, on the days the shipped week authors it into.
 *
 * The unit tests one floor down (`world/interruptions.test.ts`,
 * `world/actions/interruptions.test.ts`) prove the schedule is stateless and
 * the three verbs are guarded. What they cannot prove is the thing the player
 * actually meets: that a phone rings on the minute the table says, that the
 * cost model charges the right half of itself, that a deferred call genuinely
 * comes back, that a meeting nobody could skip leaves something readable
 * behind, and that a save taken in the middle of any of it is a save that
 * lands back in the middle of it.
 *
 * So every assertion below is about a state the PLAYER reaches - the ticket
 * carries the call as evidence, the inbox holds the minutes, the second
 * arrival cannot be waved off - rather than about a dispatch having returned.
 *
 * Nothing here touches the DOM. The driver runs exactly as it does in the
 * browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
import {
  ALREADY_DEFERRED_REASON,
  NO_POSTPONES_LEFT_REASON,
  NOT_DECLINABLE_REASON,
  UPDATES_WITHDRAWN_REASON,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { LUNCH_START_MINUTE, shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { minuteOfDay } from '../world/hours';
import { arrivedAt, findMailThread } from '../world/mail';
import { MEETING_MAIL } from '../world/mail/threads';
import { isRefocusing, REFOCUS_TICKS } from '../world/meters';
import {
  ARRIVAL_STRESS_PER_SEVERITY,
  buildInterruptionSchedule,
  DEFER_MINUTES,
  type InterruptionEntry,
  type InterruptionPlan,
  type InterruptionSlot,
  placeDeferred,
} from '../world/interruptions';
import { TICKET_HYGIENE_SYNC } from '../world/scenes';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket, triedFromTouches } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import {
  DayDriver,
  DRIVER_INTERVAL_MS,
  IN_A_MEETING_REASON,
  INSTALLING_UPDATES_REASON,
  type InterruptionView,
  TICK_INTERVAL_MS,
} from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const SPOOLER = 'ticket:wedged-spooler';

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every interruption the driver announced, in the minute it announced it. */
  readonly arrivals: InterruptionView[];
  readonly ended: InterruptionEntry[];
}

/**
 * A driver standing at the start of a given day's shift.
 *
 * The days before it are PLAYED rather than skipped - the clock is run to five
 * and clocked off, night and all - because an interruption on the Thursday is
 * only reachable from a world that has had a Monday in it, and because the
 * schedule is built at the day boundary the same way the browser builds it.
 */
function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const arrivals: InterruptionView[] = [];
  const ended: InterruptionEntry[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onInterruption: (view) => {
        arrivals.push(view);
      },
      onInterruptionEnded: (entry) => {
        ended.push(entry);
      },
    },
  );

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    // Worked rather than watched: a week nobody touches saturates every meter
    // by the Wednesday, and a test about what an arrival COSTS cannot be run
    // against a stress level that is already at its ceiling.
    runTo(driver, session, shiftStartTick(played) + 90);
    workTheQueue(driver, session);
    runTo(driver, session, shiftStartTick(played) + 300);
    workTheQueue(driver, session);
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  // What the days before it did is not what this test is about.
  arrivals.length = 0;
  ended.length = 0;
  return { driver, session, arrivals, ended };
}

/** Every open ticket closed the way its own content says it can be. */
function workTheQueue(driver: DayDriver, session: WorldSession): void {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    for (const step of findWorldTicket(ticket.id)?.paths[0]?.steps ?? []) {
      driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

function runTo(
  driver: DayDriver,
  session: WorldSession,
  tick: number,
): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** The minute the shipped seed puts an authored interruption on. */
function entryOn(session: WorldSession, day: number, id: string): InterruptionEntry {
  const schedule = buildInterruptionSchedule(
    session.seed,
    day,
    interruptionPlanFor(day, session.seed),
  );
  const entry = schedule.entries.find((candidate) => candidate.id === id);

  if (entry === undefined) {
    throw new Error(`Day ${String(day)} does not schedule "${id}".`);
  }

  return entry;
}

function player(session: WorldSession, field: string): unknown {
  return session.engine.graph.getField(COMPANY_IDS.player, field);
}

function stress(session: WorldSession): number {
  const value = player(session, FIELDS.stress);
  return typeof value === 'number' ? value : Number.NaN;
}

/* -- the malignant half ---------------------------------------------------- */

describe('a call about something that is not the work in hand', () => {
  /**
   * The Tuesday call, taken by somebody who is not on the Tuesday ticket.
   *
   * It is the SAME row as the benign case further down - the one that carries
   * `ticket:wedged-spooler` - and it costs, because the cost model reads what
   * the player is doing rather than what the table says. That is the whole
   * design in one pair of tests: benign is earned by being on the work, not
   * declared by content.
   */
  it('rings on the authored minute, and costs the arrival before anything is decided', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 1);
    const before = stress(world.session);
    expect(world.driver.interruption()).toBeNull();

    runTo(world.driver, world.session, entry.tick);

    const ringing = world.driver.interruption();
    expect(ringing?.entry.id).toBe('call:spooler');
    // Nothing has been touched yet this morning, so the call about the
    // printer is about nothing anybody is holding.
    expect(ringing?.ticketInHand).toBeNull();
    expect(ringing?.benign).toBe(false);
    expect(ringing?.answered).toBe(false);
    expect(ringing?.callback).toBe(false);
    // The price of being reachable, charged whatever is done about it next.
    expect(stress(world.session) - before)
      .toBe(entry.severity * ARRIVAL_STRESS_PER_SEVERITY);
  });

  /**
   * The whole point of the debuff, asserted as the player meets it: answering
   * costs a window in which the hands are worse, and the window ENDS on its
   * own without anybody managing it.
   */
  it('leaves a refocus window behind, which expires quietly', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);

    // Wednesday's meeting left one behind and it expired long ago; the claim
    // is about what THIS call writes, so it is compared against that.
    const stale = player(world.session, FIELDS.refocusUntil);

    expect(world.driver.answerInterruption()).toEqual({ ok: true });
    // Not yet: the window is measured from the minute the desk comes back,
    // so it does not start while the player is still on the phone.
    expect(player(world.session, FIELDS.refocusUntil)).toBe(stale);

    runTo(world.driver, world.session, entry.endsTick);

    const answeredAt = world.session.engine.now();
    const until = player(world.session, FIELDS.refocusUntil);

    expect(answeredAt).toBe(entry.endsTick);
    expect(until).toBe(answeredAt + REFOCUS_TICKS);
    expect(isRefocusing(until, answeredAt)).toBe(true);

    runTo(world.driver, world.session, answeredAt + REFOCUS_TICKS - 1);
    expect(isRefocusing(until, world.session.engine.now())).toBe(true);

    runTo(world.driver, world.session, answeredAt + REFOCUS_TICKS);
    expect(isRefocusing(until, world.session.engine.now())).toBe(false);
    // Nothing cleared it and nothing extended it: it is a cost, not a state.
    expect(player(world.session, FIELDS.refocusUntil)).toBe(until);
  });

  it('hands the screen straight back when it is waved off', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    const focus = player(world.session, FIELDS.refocusUntil);
    expect(world.driver.declineInterruption()).toEqual({ ok: true });

    // The minutes it would have taken are the player's again, in the same
    // minute, which is the whole of what declining buys - and it started no
    // refocus window, because there was no conversation to come back from.
    // (Wednesday's meeting left one behind and it is long expired; the claim
    // is that this call did not write another.)
    expect(world.driver.interruption()).toBeNull();
    expect(player(world.session, FIELDS.refocusUntil)).toBe(focus);
  });
});

/* -- the benign half ------------------------------------------------------- */

describe('a call about the ticket already in hand', () => {
  /**
   * The other half of the cost model, and the half the shipped golden week
   * never reaches - the scripted profiles sweep the queue in one pass rather
   * than sitting on one ticket - so it is driven here instead.
   *
   * Being on the ticket is expressed the way the world expresses it: a touch,
   * through the driver, which is what puts the minute on the ticket's log.
   */
  it('costs no focus, and lands on the ticket as evidence', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 5);
    // On the printer, and the touch log says so. It is the first step of the
    // ticket's own advertised path, which leaves it open - somebody halfway
    // through a job is exactly who this call is for.
    world.driver.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      { spooler: COMPANY_IDS.spooler },
    );

    const before = stress(world.session);
    runTo(world.driver, world.session, entry.tick);

    const ringing = world.driver.interruption();
    expect(ringing?.ticketInHand).toBe(SPOOLER);
    expect(ringing?.benign).toBe(true);
    // Nothing for the arrival: it is the job, arriving by phone.
    expect(stress(world.session)).toBe(before);

    expect(world.driver.answerInterruption()).toEqual({ ok: true });

    // The goal: the ticket carries the call, and the player is not worse at
    // their job for having taken it.
    const touched = triedFromTouches(
      world.session.engine.graph.getField(SPOOLER, FIELDS.touchLog),
    );
    expect(touched.some(
      (touch) => touch.text.length > 0 && touch.tick === world.session.engine.now(),
    )).toBe(true);
    expect(player(world.session, FIELDS.refocusUntil)).toBeUndefined();
    expect(world.driver.interruption()?.answered).toBe(true);
  });
});

/* -- asking them to call back ---------------------------------------------- */

describe('"can I call you back"', () => {
  it('comes back, later, and is not declinable the second time', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.deferInterruption()).toEqual({ ok: true });
    // The screen is the player's for the minutes they bought.
    expect(world.driver.interruption()).toBeNull();

    runTo(world.driver, world.session, entry.tick + DEFER_MINUTES);

    const again = world.driver.interruption();
    expect(again?.entry.id).toBe('call:annexe-printer');
    expect(again?.callback).toBe(true);
    expect(again?.entry.slidFrom).toBe(entry.tick);
    // And this time it is the conversation.
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: ALREADY_DEFERRED_REASON,
    });
    expect(world.driver.deferInterruption()).toEqual({
      ok: false,
      reason: ALREADY_DEFERRED_REASON,
    });
    expect(world.driver.answerInterruption()).toEqual({ ok: true });
  });

  /**
   * The bug a hundred green tests did not see, and the reason this one is
   * written as a JOURNEY rather than as a state.
   *
   * WHERE a deferred entry lives and WHAT was decided about it are two
   * questions, and reading them in the wrong order made the second answer the
   * first: an answered callback fell back to the ORIGINAL entry, whose minutes
   * were twenty minutes in the past. So `interruption()` went null the instant
   * the player pressed Answer - the conversation vanished out from under them,
   * the window closed, and nothing ever fired to say it had ended. Every
   * assertion about deferring still passed, because deferring worked; it was
   * the minute AFTER answering that was broken, and nothing looked there.
   */
  it('stays on the phone once the callback is answered', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    world.driver.deferInterruption();
    runTo(world.driver, world.session, entry.tick + DEFER_MINUTES);

    const back = world.driver.interruption();

    expect(back?.callback).toBe(true);
    expect(world.driver.answerInterruption()).toEqual({ ok: true });

    // Still there, still the callback, still answered - and it lasts the
    // minutes it was given rather than ending in the one it started in.
    const talking = world.driver.interruption();

    expect(talking?.entry.id).toBe('call:annexe-printer');
    expect(talking?.answered).toBe(true);
    expect(talking?.entry.tick).toBe(back?.entry.tick);

    const lastMinute = (back?.entry.endsTick ?? 0) - 1;

    runTo(world.driver, world.session, lastMinute);
    expect(world.driver.interruption()?.answered).toBe(true);

    // And the far side of it happens, once, at the minute the window says.
    runTo(world.driver, world.session, back?.entry.endsTick ?? 0);
    expect(world.driver.interruption()).toBeNull();
    expect(world.ended.filter((done) => done.id === 'call:annexe-printer'))
      .toHaveLength(1);
  });

  /**
   * The runtime half of precedence, and the only entry this family places at
   * runtime. A callback is put back on the day by `placeDeferred`, which has
   * to get out of the way of everything the day had already booked - so the
   * assertion is the property rather than a minute: whatever the callback
   * lands on, nothing else owns the screen while it does.
   */
  it('never comes back on top of something else', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    world.driver.deferInterruption();
    // Right through to the end of the shift: the assert inside the driver
    // throws if two takeovers ever share a minute, so a clean run IS the
    // claim, and the callback is proven to have happened by the arrival list.
    runTo(world.driver, world.session, shiftEndTick(4));

    // The Thursday holds three authored interruptions now - the chat message at
    // ten to eleven (0.4.3), the annexe call, and at ten past two the
    // workstation - so the day's whole arrival list is asserted rather than the
    // call's half of it. On an untouched (Available) dot the message is not
    // dodged: it arrives first, rings out, and sits at the head of the list. A
    // run that lost the reboot, or the message, would be a day that stopped
    // scheduling the thing a slice is about, and it would be lost in silence.
    expect(world.arrivals.map((view) => view.entry.id))
      .toEqual([
        'chat:dennis-calendar',
        'call:annexe-printer',
        'call:annexe-printer',
        'machine:reboot',
      ]);
    // The deferred callback is the SECOND annexe arrival, now at index two
    // because the chat message arrived ahead of it.
    expect(world.arrivals[2]?.callback).toBe(true);
  });
});

/* -- the update that is going to happen ------------------------------------ */

/**
 * The reboot, driven as a FIXTURE rather than as content - and it stays a
 * fixture now that the content exists.
 *
 * Lane A wrote this because the probation week had no update in it yet. Lane B
 * put one on the Thursday at ten past two, and the fixture is deliberately NOT
 * repointed at it: what is asserted below is the MACHINERY - three shrinking
 * windows, a budget counted out of the world, a refusal with the true reason
 * in it - and pinning that to whichever minute the week happens to carry this
 * month would be testing the content instead. The Tuesday used here is a real
 * day with its real call and its real rounds; the shipped Thursday is walked
 * as a journey in `e2e/interruptions.spec.ts` and pinned as a week in
 * `scripted-week.test.ts`.
 */
/**
 * The Tuesday, mid-morning, which is a working minute on a day the player has
 * headroom on. The shipped week will put its own reboot wherever the content
 * slice decides; what is asserted here is what has to hold on any of them.
 */
const REBOOT_DAY = 2;
const REBOOT_MINUTE = 10 * 60 + 40;
const REBOOT_ID = 'machine:reboot';
const REBOOT_MINUTES = 12;
/** Ten minutes to finish, five to save, two to swear. Then it happens. */
const REBOOT_POSTPONES = [10, 5, 2];

function rebootSlot(minute: number): InterruptionSlot {
  return {
    id: REBOOT_ID,
    source: 'machine',
    minute,
    minutes: REBOOT_MINUTES,
    relatedTicket: null,
    declinable: false,
    severity: 3,
    postpones: REBOOT_POSTPONES,
    flavor: { subject: 'Security updates, deferred since March' },
  };
}

/** The shipped week, plus one workstation with an opinion. */
function planWithReboot(
  minute: number,
): (day: number, seed: number) => InterruptionPlan {
  return (day, seed) => {
    const real = interruptionPlanFor(day, seed);

    return day === REBOOT_DAY
      ? { slots: [...real.slots, rebootSlot(minute)], blocked: real.blocked }
      : real;
  };
}

/**
 * The Thursday of a WORKED week, which is the world a cost has to be measured
 * in: a week nobody touches has every meter at its ceiling by the Wednesday,
 * and a stress charge asserted against a full bar asserts nothing.
 */
function rebootWorld(minute = REBOOT_MINUTE): Harness {
  const session = createWorldSession();
  const arrivals: InterruptionView[] = [];
  const ended: InterruptionEntry[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onInterruption: (view) => {
        arrivals.push(view);
      },
      onInterruptionEnded: (entry) => {
        ended.push(entry);
      },
    },
    planWithReboot(minute),
  );

  for (let played = 1; played < REBOOT_DAY; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftStartTick(played) + 90);
    workTheQueue(driver, session);
    runTo(driver, session, shiftStartTick(played) + 300);
    workTheQueue(driver, session);
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  arrivals.length = 0;
  ended.length = 0;
  return { driver, session, arrivals, ended };
}

interface RebootDay {
  readonly entry: InterruptionEntry;
  /** Where the Nth push actually lands, the day's other bookings and all. */
  readonly landingAfter: (spends: number) => number;
}

function rebootDay(world: Harness, minute = REBOOT_MINUTE): RebootDay {
  const plan = planWithReboot(minute)(REBOOT_DAY, world.session.seed);
  const schedule = buildInterruptionSchedule(
    world.session.seed,
    REBOOT_DAY,
    plan,
  );
  const entry = schedule.entries.find(
    (candidate) => candidate.id === REBOOT_ID,
  );

  if (entry === undefined) {
    throw new Error('The fixture day did not schedule the reboot.');
  }

  return {
    entry,
    // Pressed the minute each arrival lands, which is what the journey below
    // does and what a window is designed around: a postpone buys its minutes
    // from the press, so where the Nth one puts it is a walk rather than a
    // multiplication.
    landingAfter: (spends) => {
      const pressed: number[] = [];
      let arrival = entry.tick;

      for (let spend = 0; spend < spends; spend += 1) {
        pressed.push(arrival);
        arrival = placeDeferred(entry, schedule, plan.blocked, pressed)?.tick
          ?? -1;

        if (arrival < 0) {
          return -1;
        }
      }

      return arrival;
    },
  };
}

describe('the update that has been put off since March', () => {
  /**
   * The journey, minus the screen: it arrives, it is refused a decline in the
   * words that say why, it is pushed three times for exactly the minutes it
   * promised - each arrival naming what is left - and then it simply happens,
   * inside the day, and hands back a desk the player has to find their place
   * at again.
   *
   * Every number here is read off the world rather than off the driver: the
   * remaining budget is the entry's authored windows minus the ledger, so
   * there is nothing in this journey a save could disagree with.
   */
  it('is pushed three times, each arrival saying what is left, and then happens', () => {
    const world = rebootWorld();
    const { entry, landingAfter } = rebootDay(world);

    runTo(world.driver, world.session, entry.tick - 1);

    const before = stress(world.session);

    runTo(world.driver, world.session, entry.tick);

    const first = world.driver.interruption();

    expect(first?.entry.id).toBe(REBOOT_ID);
    expect(first?.entry.source).toBe('machine');
    expect(first?.postponesLeft).toBe(3);
    expect(first?.callback).toBe(false);
    // Malignant by construction: a workstation is about no ticket anybody is
    // holding, so being taken off the work costs what being taken off the work
    // costs - once, here, at the first arrival.
    expect(first?.benign).toBe(false);

    const arrivalCost = stress(world.session) - before;

    expect(arrivalCost).toBe(3 * ARRIVAL_STRESS_PER_SEVERITY);

    // There is nobody on the other end of it to say no to, and the refusal is
    // the one that teaches why rather than the one about a meeting.
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: UPDATES_WITHDRAWN_REASON,
    });

    // Three pushes, each one shorter than the last and each one measured from
    // where the last left it.
    const landings: number[] = [];
    const left: number[] = [];

    for (let spend = 0; spend < REBOOT_POSTPONES.length; spend += 1) {
      expect(world.driver.deferInterruption()).toEqual({ ok: true });
      expect(world.driver.interruption()).toBeNull();

      runTo(world.driver, world.session, landingAfter(spend + 1));

      const view = world.driver.interruption();

      expect(view?.entry.id, `push ${String(spend + 1)}`).toBe(REBOOT_ID);
      expect(view?.callback).toBe(true);
      landings.push(view?.entry.tick ?? -1);
      left.push(view?.postponesLeft ?? -1);
    }

    // Ten minutes, then five, then two - each measured from where the last one
    // left it, and each one AT LEAST that far out: a landing whose minutes the
    // day had already booked slides forward like any other arrival, which is
    // what happens to the second and third of these on this seed (the second
    // joined them in 0.31.0, when the seeded spreader's finalizer moved the
    // lead's rounds and one of them landed where this callback wanted to be).
    // The exact arithmetic in clear air is asserted one floor down, in
    // `world/interruptions.test.ts`, where there is no day in the way: a
    // postpone buys its whole window from the minute the button was pressed.
    // What is asserted here is the ORDER and the floor, which is what survives
    // a day with a lead walking through it.
    const [ten, five, two] = REBOOT_POSTPONES as [number, number, number];
    const [firstBack, secondBack, thirdBack] = landings as [
      number,
      number,
      number,
    ];

    expect(firstBack).toBe(entry.tick + ten);
    expect(secondBack).toBeGreaterThanOrEqual(firstBack + five);
    expect(thirdBack).toBeGreaterThanOrEqual(secondBack + two);
    // Two, one, none - which is the number an arrival has to be able to say.
    expect(left).toEqual([2, 1, 0]);
    // And the same dread, not new dread. It is asserted as the CHARGE rather
    // than as the meter, because the meter is not still between two arrivals:
    // half an hour of shift moves stress on its own, and a comparison of two
    // readings would be measuring the morning rather than the mechanic.
    expect(world.session.engine.dispatchLog().filter(
      (line) => line.id === DAY_ACTIONS.interruptionArrived
        && line.params.id === REBOOT_ID,
    )).toHaveLength(1);

    // The last arrival offers nothing, in words.
    expect(world.driver.deferInterruption()).toEqual({
      ok: false,
      reason: NO_POSTPONES_LEFT_REASON,
    });
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: UPDATES_WITHDRAWN_REASON,
    });

    // It happens, it holds the desk while it does, and every clock runs.
    const runningAt = world.session.engine.now();

    expect(world.session.engine.slaRunning()).toBe(true);
    runTo(world.driver, world.session, runningAt + REBOOT_MINUTES);

    const handedBack = world.session.engine.now();

    expect(handedBack).toBe(landingAfter(3) + REBOOT_MINUTES);
    // Inside the day, with every window spent - which is the promise the
    // loader's refusal exists to keep, and the reason a reboot cannot be
    // authored into a corner it has to be dropped from.
    expect(handedBack).toBeLessThan(shiftEndTick(REBOOT_DAY));
    expect(world.driver.interruption()).toBeNull();
    // The world knows it happened, and the player is looking for their place
    // again from the minute the desk came back.
    expect(world.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.interruptionAnswered,
    )).toContain(REBOOT_ID);
    expect(player(world.session, FIELDS.refocusUntil))
      .toBe(handedBack + REFOCUS_TICKS);
    expect(isRefocusing(player(world.session, FIELDS.refocusUntil), handedBack))
      .toBe(true);
    expect(world.ended.filter((done) => done.id === REBOOT_ID)).toHaveLength(1);
  }, 20_000);

  /**
   * "Restart now", which is the other button on the countdown and the one the
   * shipped week's player will press when they have nothing open.
   *
   * Accepting early settles it early, and the far side of the window still
   * happens exactly once: the world learns it was answered, the second accept
   * the day loop tries is refused as already settled rather than written
   * twice, and the recovery window is still measured from the minute the desk
   * came back.
   */
  it('can be taken now, and the far side of it happens once either way', () => {
    const world = rebootWorld();
    const { entry } = rebootDay(world);

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.answerInterruption()).toEqual({ ok: true });
    expect(world.driver.interruption()?.answered).toBe(true);

    runTo(world.driver, world.session, entry.endsTick);

    expect(world.driver.interruption()).toBeNull();
    expect(world.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.interruptionAnswered,
    )).toBe(REBOOT_ID);
    expect(player(world.session, FIELDS.refocusUntil))
      .toBe(entry.endsTick + REFOCUS_TICKS);
    expect(world.ended.filter((done) => done.id === REBOOT_ID)).toHaveLength(1);
  }, 20_000);

  /** The desk is gone while it installs, whichever keyboard asks for it. */
  it('refuses the work in its own sentence while it is installing', () => {
    const world = rebootWorld();
    const { entry, landingAfter } = rebootDay(world);
    const open = world.session.engine.graph.nodesOfKind('ticket')
      .find(isUnresolved);

    expect(open).toBeDefined();
    // Every window spent, so the thing itself is running.
    runTo(world.driver, world.session, entry.tick);

    for (let spend = 0; spend < REBOOT_POSTPONES.length; spend += 1) {
      expect(world.driver.deferInterruption().ok).toBe(true);
      runTo(world.driver, world.session, landingAfter(spend + 1));
    }

    const refused = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      open?.id ?? '',
      { impact: 1, urgency: 1 },
    );

    expect(refused).toEqual({ ok: false, reason: INSTALLING_UPDATES_REASON });
    expect(world.driver.drink()).toEqual({
      ok: false,
      reason: INSTALLING_UPDATES_REASON,
    });
    expect(world.driver.tidyDesk()).toEqual({
      ok: false,
      reason: INSTALLING_UPDATES_REASON,
    });

    // And the desk comes back: whatever the world then says about the request,
    // it is no longer the workstation saying it.
    runTo(world.driver, world.session, world.session.engine.now()
      + REBOOT_MINUTES);

    const after = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      open?.id ?? '',
      { impact: 1, urgency: 1 },
    );

    expect(after.ok || after.reason !== INSTALLING_UPDATES_REASON).toBe(true);
  }, 20_000);

  /**
   * The gate the budget's whole design is for: what is left of it is in the
   * WORLD, so a tab closed mid-countdown opens on the same minute with the
   * same number of pushes left.
   *
   * A driver that had been counting them would hand a restored countdown its
   * budget back, which is the quiet version of an update that can be put off
   * for ever.
   */
  it('comes out of a save file with the pushes it had left', () => {
    const world = rebootWorld();
    const { entry, landingAfter } = rebootDay(world);

    runTo(world.driver, world.session, entry.tick);
    world.driver.deferInterruption();
    runTo(world.driver, world.session, landingAfter(1));
    world.driver.deferInterruption();
    // Between the second push and the third arrival: nothing is on the screen,
    // and the only record of what has been spent is the ledger.
    runTo(world.driver, world.session, landingAfter(1) + 2);

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
      planWithReboot(REBOOT_MINUTE),
    );

    fresh.engine.restore(file);
    loaded.restoreDriverState(world.driver.driverState());

    expect(fresh.engine.now()).toBe(savedAt);
    expect(loaded.interruption()).toBeNull();

    // The third arrival lands where the two spent pushes put it, and it says
    // one is left rather than three.
    while (fresh.engine.now() < landingAfter(2) && loaded.state() === 'shift') {
      loaded.step(TICK_INTERVAL_MS);
    }

    const back = loaded.interruption();

    expect(back?.entry.id).toBe(REBOOT_ID);
    expect(back?.entry.tick).toBe(landingAfter(2));
    expect(back?.postponesLeft).toBe(1);
    expect(back?.callback).toBe(true);
  }, 20_000);

  /**
   * Precedence, constructed: a workstation authored onto the same minute as a
   * ringing phone. One takeover at a time is a property of the SCHEDULE, so
   * the reboot slides at construction rather than the two sharing a screen -
   * and the day plays through to five without the driver's runtime assert
   * firing.
   */
  it('slides off a call that was already on that minute', () => {
    const call = entryOn(createWorldSession(), REBOOT_DAY, 'call:spooler');
    const world = rebootWorld(minuteOfDay(call.tick));
    const { entry } = rebootDay(world, minuteOfDay(call.tick));

    expect(entry.slidFrom).not.toBeNull();
    expect(entry.tick).toBeGreaterThanOrEqual(call.endsTick);

    runTo(world.driver, world.session, shiftEndTick(REBOOT_DAY));

    expect(world.arrivals.map((view) => view.entry.id))
      .toContain(REBOOT_ID);
    expect(world.arrivals.map((view) => view.entry.id))
      .toContain('call:spooler');
  }, 20_000);
});

/* -- the half hour nobody chose -------------------------------------------- */

describe('the mandatory sync', () => {
  it('is neither declinable nor deferrable, and says why', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick);

    const block = world.driver.interruption();
    expect(block?.entry.source).toBe('meeting');
    expect(block?.entry.declinable).toBe(false);

    // The refusal is the teaching, so it has to be the WORLD's sentence
    // rather than a missing button - and BOTH of them, because catching up on
    // it afterwards is skipping it said more politely.
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: NOT_DECLINABLE_REASON,
    });
    expect(world.driver.deferInterruption()).toEqual({
      ok: false,
      reason: NOT_DECLINABLE_REASON,
    });
    // And it is still there afterwards, which is the point of a refusal.
    expect(world.driver.interruption()?.entry.id).toBe('meeting:hygiene-sync');
  });

  /**
   * The journey rather than the transition: the player sits through half an
   * hour they could not refuse, and what they have afterwards is the meeting
   * itself, in an inbox, with nothing taken out of it.
   */
  it('ends with the minutes in the inbox, and every clock still running', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');
    const recap = findMailThread(MEETING_MAIL.recap);

    expect(recap).toBeDefined();

    runTo(world.driver, world.session, entry.tick);
    // Before: the minutes of a meeting nobody has been to are not readable.
    expect(arrivedAt(
      recap ?? { id: '', subject: '', messages: [] },
      world.session.engine.graph,
    )).toBeNull();

    runTo(world.driver, world.session, entry.endsTick);

    expect(world.driver.interruption()).toBeNull();
    expect(world.ended.map((ended) => ended.id)).toContain('meeting:hygiene-sync');
    // The clock ran for every minute of it: the block took exactly the
    // minutes it booked and gave none of them back.
    expect(world.session.engine.now()).toBe(entry.endsTick);
    expect(world.session.engine.now() - entry.tick)
      .toBe(entry.endsTick - entry.tick);

    const landed = arrivedAt(
      recap ?? { id: '', subject: '', messages: [] },
      world.session.engine.graph,
    );

    expect(landed).toBe(entry.endsTick);
    // And it IS the meeting: every line that was said in the room is in it.
    const body = recap?.messages[0]?.body.join('\n') ?? '';

    for (const beat of TICKET_HYGIENE_SYNC.beats) {
      expect(body).toContain(beat.line);
    }
  });

  it('leaves the player looking for their place afterwards', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.endsTick);

    // Answered at the END rather than at the start, which is what makes the
    // twenty-three minutes start from the minute the room emptied.
    expect(player(world.session, FIELDS.interruptionAnswered))
      .toBe('meeting:hygiene-sync');
    expect(player(world.session, FIELDS.refocusUntil))
      .toBe(entry.endsTick + REFOCUS_TICKS);
  });
});

/**
 * A week played the way the browser walk plays one: the days in between are
 * RUN rather than worked.
 *
 * It is a different world from the worked harness above - every meter is at
 * its ceiling by the Wednesday - and a mechanic that only behaves on a tidy
 * desk is a mechanic that behaves for nobody, so the cases that care drive
 * this one.
 */
function idleTo(day: number): Harness {
  const session = createWorldSession();
  const arrivals: InterruptionView[] = [];
  const ended: InterruptionEntry[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onInterruption: (view) => {
        arrivals.push(view);
      },
      onInterruptionEnded: (entry) => {
        ended.push(entry);
      },
    },
  );

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  arrivals.length = 0;
  ended.length = 0;
  return { driver, session, arrivals, ended };
}

/* -- what a meeting does to the queue -------------------------------------- */

/**
 * The invariant the whole family sits on, asserted where a meeting actually
 * exists.
 *
 * There is a cargo test that walks the same arithmetic over a plain world, and
 * it is worth keeping for what it is - the engine's own claim that a half hour
 * of held nothing moves no deadline - but it is NOT this gate and no longer
 * says it is: a meeting is a shell-level thing and the core has never heard of
 * one. So this drives the real Wednesday, through the real driver, and asks
 * the two questions a player would notice the answer to.
 */
describe('a meeting holds nothing and pauses nothing', () => {
  /** Every unresolved ticket's resolution deadline, by id. */
  function deadlines(session: WorldSession): ReadonlyMap<string, number> {
    const found = new Map<string, number>();

    for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
      const due = ticket.fields[FIELDS.slaDeadline];

      if (typeof due === 'number' && isUnresolved(ticket)) {
        found.set(ticket.id, due);
      }
    }

    return found;
  }

  function breachedCount(session: WorldSession): number {
    return session.engine.graph.nodesOfKind('ticket').filter(
      (ticket) => ticket.fields[FIELDS.breached] === true,
    ).length;
  }

  /**
   * Per MINUTE, not at the end. A meeting that quietly handed its half hour
   * back would satisfy an end-to-end comparison perfectly well, because every
   * deadline would have moved together and moved back; the only place that
   * shows up is inside the block.
   */
  it('moves no deadline, on any minute of the block', () => {
    const world = idleTo(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.interruption()?.entry.source).toBe('meeting');

    const before = deadlines(world.session);

    expect(before.size).toBeGreaterThan(0);

    for (let minute = entry.tick; minute < entry.endsTick; minute += 1) {
      runTo(world.driver, world.session, minute + 1);

      for (const [id, due] of before) {
        const now = world.session.engine.graph.getField(id, FIELDS.slaDeadline);

        // Resolved tickets drop out of the map's purpose but keep their
        // field; either way the number must be the one it was.
        expect(now, `${id} at ${String(world.session.engine.now())}`).toBe(due);
      }
    }

    expect(world.session.engine.now()).toBe(entry.endsTick);
  });

  /**
   * And the other half, which is what makes the first half worth asserting:
   * the clock the deadlines are measured against RUNS for every minute of it.
   *
   * A meeting that held it would be a meeting in which the queue was safe, and
   * a queue that is safe while the player is trapped is not a cost at all - it
   * is a break. So: the service clock is on at every minute, the headroom on
   * an open ticket shrinks by exactly the length of the block while its
   * deadline does not move, and - so that none of that is vacuous - tickets in
   * this world do genuinely go red as the morning runs out.
   */
  it('runs every clock through the block, and shortens what is left', () => {
    const world = idleTo(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');
    const wentRed = breachedCount(world.session);

    runTo(world.driver, world.session, entry.tick);

    const watched = [...deadlines(world.session)][0];

    expect(watched).toBeDefined();

    const due = watched?.[1] ?? 0;
    const headroomBefore = due - world.session.engine.now();

    for (let minute = entry.tick; minute < entry.endsTick; minute += 1) {
      expect(world.session.engine.slaRunning(), String(minute)).toBe(true);
      runTo(world.driver, world.session, minute + 1);
    }

    const headroomAfter = due - world.session.engine.now();

    expect(headroomBefore - headroomAfter).toBe(entry.endsTick - entry.tick);
    // And the morning really is one in which deadlines run out, so the
    // per-minute assertions above are about a queue with clocks on it.
    runTo(world.driver, world.session, shiftEndTick(3));
    expect(breachedCount(world.session)).toBeGreaterThan(wentRed);
  });

  /** And the desk is not merely awkward to reach: it cannot be worked. */
  it('refuses the work, whichever surface asks', () => {
    const world = idleTo(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');
    const open = world.session.engine.graph.nodesOfKind('ticket')
      .find(isUnresolved);

    expect(open).toBeDefined();

    runTo(world.driver, world.session, entry.tick);

    // The terminal, the queue, Remote Assist and the chat window all reach the
    // world through this one call, so one refusal covers every keyboard in the
    // building - which is the point, because the pointer rules covered none of
    // them.
    const refused = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      open?.id ?? '',
      { impact: 1, urgency: 1 },
    );

    expect(refused).toEqual({ ok: false, reason: IN_A_MEETING_REASON });
    expect(world.driver.drink().ok).toBe(false);
    expect(world.driver.tidyDesk().ok).toBe(false);

    // And the moment the room empties the door is open again: whatever the
    // world then makes of the request, it is no longer the meeting refusing
    // it - which is the claim, because a rule that never lifted would be a
    // desk nobody could ever work at.
    runTo(world.driver, world.session, entry.endsTick);

    const after = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      open?.id ?? '',
      { impact: 1, urgency: 1 },
    );

    expect(after.ok || after.reason !== IN_A_MEETING_REASON).toBe(true);

    const desk = world.driver.tidyDesk();

    // Whatever the desk then says - an empty desk has its own opinion about
    // being tidied - it is no longer the meeting saying it.
    expect(desk.ok || desk.reason !== IN_A_MEETING_REASON).toBe(true);
  });
});

/* -- the mid-state promise ------------------------------------------------- */

describe('a world picked back up in the middle of one', () => {
  /**
   * The claim the whole stateless-schedule design was for: occupancy is
   * `f(schedule, world, tick)`, so there is nothing to save and nothing to
   * restore. `resync` is what a load calls; if any part of this were being
   * remembered in the driver, the view would come back different.
   */
  it('is still in the same call, on the same minute, after a reload', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick + 2);
    const before = world.driver.interruption();

    world.driver.resync();

    expect(world.driver.interruption()).toEqual(before);
    expect(before?.minutesIn).toBe(2);
  });

  it('is still in the same meeting, on the same minute, after a reload', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick + 11);
    const before = world.driver.interruption();

    world.driver.resync();

    expect(world.driver.interruption()).toEqual(before);
    expect(before?.entry.source).toBe('meeting');
    expect(before?.minutesIn).toBe(11);
  });

  /**
   * The same claim through the SAVE FILE rather than through `resync` alone,
   * which is the half `resync` cannot make on its own: a reload is a different
   * engine, built from nothing, handed a string.
   *
   * It is the two lines `ShellSession.load` runs - `engine.restore` and
   * `restoreDriverState` - against a world that is halfway through a block
   * nobody could refuse. A driver that had been remembering ANY part of where
   * it was in the meeting would come back somewhere else, and the minute would
   * be the first thing to go.
   */
  it('comes out of a save file on the same minute of the same meeting', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick + 8);

    const savedAt = world.session.engine.now();
    const file = world.session.engine.serialize();
    const driverState = world.driver.driverState();

    // A session nobody has played, exactly as a reloaded tab gives one.
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

    expect(fresh.engine.now()).not.toBe(savedAt);

    fresh.engine.restore(file);
    loaded.restoreDriverState(driverState);

    expect(fresh.engine.now()).toBe(savedAt);
    expect(loaded.interruption()?.entry.id).toBe('meeting:hygiene-sync');
    expect(loaded.interruption()?.minutesIn).toBe(8);
    // And it has not been quietly settled on the way through: the meeting is
    // answered at the END of its block, and this one has not reached it.
    expect(fresh.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.meetingRecapAt,
    )).toBeUndefined();
  });
});

/* -- the week the walk actually plays -------------------------------------- */

/**
 * The same beats against a week nobody worked, which is what the browser walk
 * plays: `logInOnDay` runs the days in between rather than working them.
 *
 * It is a separate case rather than a parameter because the two weeks are
 * genuinely different worlds - every meter is at its ceiling by the Wednesday
 * of an idle week - and a mechanic that only behaves on a tidy desk is a
 * mechanic that behaves for nobody. This is the harness the e2e failures were
 * diagnosed against, and it is kept so the next disagreement between the two
 * has a place to be settled offline.
 */
describe('a week nobody worked', () => {
  it('still rings, still comes back, and still knows it is a callback', () => {
    const world = idleTo(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
    expect(world.driver.deferInterruption()).toEqual({ ok: true });
    // The world has it written down, which is what the second arrival is read
    // off - and it is written as the id on its own, so the question can be
    // asked with nothing but the id.
    expect(world.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.interruptionDeferred,
    )).toBe('call:spooler');
    expect(world.driver.interruption()).toBeNull();

    runTo(world.driver, world.session, entry.tick + DEFER_MINUTES);

    const again = world.driver.interruption();

    expect(again?.entry.tick).toBe(entry.tick + DEFER_MINUTES);
    expect(again?.callback).toBe(true);
    expect(world.arrivals.map((view) => view.callback)).toEqual([false, true]);
  }, 20_000);

  it('still sits the player through the sync', () => {
    const world = idleTo(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.interruption()?.entry.source).toBe('meeting');

    runTo(world.driver, world.session, entry.endsTick);
    expect(world.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.meetingRecapAt,
    )).toBe(entry.endsTick);
  }, 20_000);
});

/* -- the minutes the day is allowed to spend ------------------------------- */

/**
 * A day with nothing on the calendar spends exactly the minutes it is given,
 * and not one more.
 *
 * This exists because a browser run reported the Monday clock arriving at
 * 12:20 where the walk had bought 150 minutes from 09:30, and +20 minutes on
 * the quietest day of the week is the sort of thing that has to be provable
 * offline before anybody argues about a browser. There are only two ways this
 * driver can spend a minute the caller did not buy - the conversation drain
 * (`owedMinutes_`, ten at a time) and a batch that converted more real time
 * than it was handed - and both of them show up here as a tick count.
 *
 * It is walked the way `e2e/day.spec.ts` walks it, through the interval the
 * browser actually uses: `main.ts` hands `step` the CONSTANT, four times a
 * second, so a fixed number of turns must buy a fixed number of minutes at
 * every speed. Monday authors no interruptions at all, so anything this finds
 * is the day loop spending minutes on something it did not say out loud.
 */
describe('the minutes a quiet Monday spends', () => {
  /** One turn of the browser's interval, at the constant it passes. */
  function turns(driver: DayDriver, count: number): void {
    for (let turn = 0; turn < count; turn += 1) {
      driver.step(DRIVER_INTERVAL_MS);
    }
  }

  it('buys exactly the minutes it was handed, at x1 and at x4', () => {
    const session = createWorldSession();
    const driver = new DayDriver(
      session.engine,
      COMPANY_IDS.player,
      session.seed,
      {
        onDayBoundary: () => {},
        // Nothing on the screen, so nothing to be caught at - which is the
        // only way this driver spends a minute nobody bought.
        openSlackApps: () => [],
        focusedSlackApp: () => null,
      },
    );

    driver.startShift();
    expect(session.engine.now()).toBe(shiftStartTick(1));

    // Paused: real time buys nothing at all.
    driver.setPaused(true);
    turns(driver, 10_000 / DRIVER_INTERVAL_MS);
    expect(session.engine.now()).toBe(shiftStartTick(1));

    driver.setPaused(false);
    turns(driver, 10_000 / DRIVER_INTERVAL_MS);
    expect(session.engine.now()).toBe(shiftStartTick(1) + 10);

    driver.setSpeed(4);
    turns(driver, 5_000 / DRIVER_INTERVAL_MS);
    expect(session.engine.now()).toBe(shiftStartTick(1) + 30);

    // The stretch the browser reported drifting on: 09:30 to noon, which is
    // 150 minutes and a hundred and fifty turns of the interval at x4.
    turns(driver, 37_500 / DRIVER_INTERVAL_MS);
    expect(session.engine.now()).toBe(shiftStartTick(1) + 180);
    expect(minuteOfDay(session.engine.now())).toBe(LUNCH_START_MINUTE);
    // And nobody was caught at anything, which is the arithmetic the +20
    // would have had to come out of: a conversation costs ten.
    expect(session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.caughtEvents,
    )).toBe(0);
  });
});

/* -- the hours nobody is at the desk --------------------------------------- */

describe('the shift, and only the shift', () => {
  it('rings nobody before the shift starts or after it ends', () => {
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

    // The morning brief, which is not paid time.
    expect(driver.state()).toBe('morning_brief');
    expect(driver.interruption()).toBeNull();

    driver.startShift();
    runTo(driver, session, shiftEndTick(1));
    expect(driver.state()).toBe('day_end');
    expect(driver.interruption()).toBeNull();
  });

  it('answers a verb aimed at nothing with a sentence rather than a crash', () => {
    const world = harnessOn(1);

    expect(world.driver.answerInterruption().ok).toBe(false);
    expect(world.driver.deferInterruption().ok).toBe(false);
    expect(world.driver.declineInterruption().ok).toBe(false);
    expect(world.driver.answerInterruption().ok).toBe(false);
  });
});

/* -- what the day loop is allowed to write --------------------------------- */

describe('the verbs the day loop drives', () => {
  it('records the meeting once, however long the day runs', () => {
    const world = harnessOn(3);

    runTo(world.driver, world.session, shiftEndTick(3));

    // A recap written twice would be a thread that arrived at two different
    // minutes, so the world refuses the second one - and the driver is not
    // allowed to depend on never asking.
    const second = world.session.engine.dispatch(
      DAY_ACTIONS.meetingRecap,
      COMPANY_IDS.player,
      null,
      {},
    );

    expect(second.ok).toBe(false);
    expect(world.ended.filter((entry) => entry.source === 'meeting'))
      .toHaveLength(1);
  });
});
