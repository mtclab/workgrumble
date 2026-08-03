/**
 * The clock slows down near events (slice 0.3.2), driven through the shipped
 * driver and the shipped engine.
 *
 * At x4 a six-minute ring window is a second and a half of real time, and a
 * choice nobody has time to read is not a choice. So the one rule: when
 * something synchronous LANDS - a call starts ringing, a meeting or a
 * workstation takes the desk, a manager arrives at a screen with a game on it
 * - the day drops to x1 and hands the player back seconds they can use.
 *
 * Everything below is asserted as the player would meet it: the driver is run
 * turn by turn through the interval the browser passes it, and the claim is
 * what the speed control READS afterwards - not that a function was called.
 * The four exclusions are as much of the rule as the drops are, and each has
 * its own case: the grace a postpone buys keeps the player's speed, the
 * handback does not give it back, pause is untouched in both directions, and
 * a player who puts the clock back up mid-ring keeps it up.
 *
 * Nothing here touches the DOM. The driver runs exactly as it does in the
 * browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import {
  buildInterruptionSchedule,
  INTERRUPTION_SOURCES,
  type InterruptionEntry,
} from '../world/interruptions';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import {
  DayDriver,
  DRIVER_INTERVAL_MS,
  EVENT_SPEED,
  holdsTheDesk,
  slowsTheClock,
  type Speed,
  TICK_INTERVAL_MS,
  windowFor,
} from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** What is on the screen to be caught at, which the test writes into. */
  readonly onScreen: string[];
  /** Every catch the corridor made, in the minute it made it. */
  readonly caught: string[];
  /** Every telegraph the driver fired when the clock actually dropped. */
  readonly dropped: string[];
}

/**
 * A driver standing at the start of a given day's shift, with a screen the
 * test can put something on.
 *
 * The days before it are PLAYED rather than skipped, exactly as
 * `interruptions.test.ts` plays them: a Thursday reboot is only reachable from
 * a world that has had a Monday in it, and the schedule is built at the day
 * boundary the same way the browser builds it.
 */
function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const onScreen: string[] = [];
  const caught: string[] = [];
  const dropped: string[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => onScreen,
      focusedSlackApp: () => onScreen[0] ?? null,
      onCaught: (appId) => {
        caught.push(appId);
      },
      onClockDropped: (cause) => {
        dropped.push(cause);
      },
    },
  );

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    // Worked rather than watched: a week nobody touches saturates every meter
    // by the Wednesday, and the days in between are not what is under test.
    runTo(driver, session, shiftStartTick(played) + 90);
    workTheQueue(driver, session);
    runTo(driver, session, shiftStartTick(played) + 300);
    workTheQueue(driver, session);
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  caught.length = 0;
  dropped.length = 0;
  return { driver, session, onScreen, caught, dropped };
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

/** The days before the one under test, walked at whatever speed they are on. */
function runTo(
  driver: DayDriver,
  session: WorldSession,
  tick: number,
): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * The day, walked to a minute THROUGH THE INTERVAL THE BROWSER USES.
 *
 * `main.ts` hands the driver `DRIVER_INTERVAL_MS` four times a second, and at
 * every speed this game runs at that is at most one whole minute per turn - so
 * a walk built out of it lands on the minute it was asked for however the
 * speed changes underneath it. A walk built out of `TICK_INTERVAL_MS` would
 * take four minutes a turn at x4 and one at x1, which is a test whose
 * resolution depends on the thing it is measuring.
 */
function turnTo(
  driver: DayDriver,
  session: WorldSession,
  tick: number,
): void {
  let turns = 0;

  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(DRIVER_INTERVAL_MS);
    turns += 1;

    if (turns > 200_000) {
      throw new Error(
        `The clock stopped short of ${String(tick)} at `
        + `${String(session.engine.now())}.`,
      );
    }
  }
}

/** The minute the shipped seed puts an authored interruption on. */
function entryOn(
  session: WorldSession,
  day: number,
  id: string,
): InterruptionEntry {
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

/* -- the table ------------------------------------------------------------ */

/**
 * The family, one row at a time.
 *
 * It is derived from the two lists the shell already keeps rather than
 * declared again, and this is the test that stops a third opinion appearing:
 * a source added to the world is a source somebody had to decide about, and
 * the decision it inherits is the honest one - everything that lands on a
 * player either takes the desk or rings at them.
 */
describe('what slows the clock down', () => {
  it('is every source this world can be interrupted by', () => {
    for (const source of INTERRUPTION_SOURCES) {
      expect(slowsTheClock(source), source).toBe(true);
      // And it is one of the two families, rather than a third list that
      // happens to agree with them today.
      expect(holdsTheDesk(source) || windowFor(source) === 'call', source)
        .toBe(true);
    }

    // Nothing is not something happening.
    expect(slowsTheClock(undefined)).toBe(false);
  });

  it('drops to a speed a person can read a window at', () => {
    expect(EVENT_SPEED).toBe(1);
  });
});

/* -- the drops ------------------------------------------------------------ */

describe('the day drops to x1 when something lands', () => {
  /**
   * The Tuesday call: a phone that rings for six minutes, which at x4 is a
   * second and a half of anybody's afternoon.
   */
  it('when the phone starts ringing', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick - 1);

    // Still the player's speed on the minute before: the drop is an ARRIVAL,
    // not a state the schedule leaks in advance.
    expect(world.driver.speed()).toBe(4);
    expect(world.driver.interruption()).toBeNull();

    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
    expect(world.driver.speed()).toBe(1);
  });

  it('when the meeting takes the desk', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick - 1);
    expect(world.driver.speed()).toBe(4);

    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.interruption()?.entry.id).toBe('meeting:hygiene-sync');
    expect(world.driver.speed()).toBe(1);
  });

  it('when the workstation takes the desk', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'machine:reboot');
    // The Thursday rings before it reboots, and that call is a drop of its
    // own: the clock is put back up on the far side of it, so what the
    // afternoon proves is the WORKSTATION and not the phone.
    const call = entryOn(world.session, 4, 'call:annexe-printer');

    turnTo(world.driver, world.session, call.endsTick + 1);
    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick - 1);
    expect(world.driver.speed()).toBe(4);

    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.interruption()?.entry.id).toBe('machine:reboot');
    expect(world.driver.speed()).toBe(1);
  });

  /**
   * And the corridor, which is the member of the family that is not an
   * interruption at all: a scene opens on somebody who was looking at
   * something else, and it is a scene with a button on it.
   *
   * Monday authors no interruptions, so the lead is the only thing on this
   * day that can move the control - which is what makes the pair of
   * assertions below a claim about being CAUGHT rather than about time
   * passing.
   */
  it('when the lead arrives at a screen with a game on it', () => {
    const clean = harnessOn(1);

    clean.driver.setSpeed(4);
    runTo(clean.driver, clean.session, shiftEndTick(1));
    // A whole Monday with a clean screen: he came round, found nothing, and
    // the clock is still where the player left it.
    expect(clean.caught).toEqual([]);
    expect(clean.driver.speed()).toBe(4);

    const world = harnessOn(1);

    world.onScreen.push('bubbles');
    world.driver.setSpeed(4);

    while (world.caught.length === 0 && world.driver.state() === 'shift') {
      world.driver.step(DRIVER_INTERVAL_MS);
    }

    expect(world.caught).toEqual(['bubbles']);
    expect(world.driver.speed()).toBe(1);
  });
});

/* -- and what it leaves alone --------------------------------------------- */

describe('the minutes the player bought', () => {
  /**
   * The grace a postpone buys is the player's desk time, and it keeps the
   * player's speed for every minute of it.
   *
   * The walk is the whole beat rather than a sample of it: the reboot lands
   * and drops the clock (the arrival), the player puts it back up and pushes
   * the machine ten minutes out, the ten minutes run at the speed they chose,
   * and the arrival they bought their way to drops it again - because a
   * workstation taking the desk is a workstation taking the desk however many
   * times it has been put off.
   */
  it('run at the speed the player chose, right up to the arrival', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'machine:reboot');

    // Put up on the minute before the reboot, so the drop under test is the
    // reboot's own and not the phone call earlier in the afternoon.
    turnTo(world.driver, world.session, entry.tick - 1);
    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick);
    expect(world.driver.speed()).toBe(1);

    // The player disagrees, which is one click and their business.
    world.driver.setSpeed(4);
    expect(world.driver.deferInterruption()).toEqual({ ok: true });

    const pushed = world.session.engine.now();
    const coming = world.driver.pendingRestart();

    expect(coming?.entry.id).toBe('machine:reboot');
    expect(coming?.ticksAway).toBe(entry.postpones[0]);

    // Every minute of the grace, one at a time, with the control read on each
    // of them: a drop anywhere in here is the player being charged for
    // minutes they paid for.
    for (let minute = 1; minute < (entry.postpones[0] ?? 0); minute += 1) {
      turnTo(world.driver, world.session, pushed + minute);
      expect(world.driver.speed(), `minute ${String(minute)} of the grace`)
        .toBe(4);
      expect(world.driver.interruption()).toBeNull();
    }

    // And the far end of the grace, which is an arrival like any other.
    turnTo(world.driver, world.session, pushed + (entry.postpones[0] ?? 0));
    expect(world.driver.interruption()?.entry.id).toBe('machine:reboot');
    expect(world.driver.speed()).toBe(1);
  });

  /**
   * The re-up sticks, which is the other half of "on the arrival edge".
   *
   * A rule that asked "is something happening" every minute would be a control
   * that fights the hand on it: the player who decides to watch a call at x4
   * has decided something about their own afternoon, and the phone is still
   * ringing while they do.
   */
  it('and a player who puts the clock back up mid-ring keeps it up', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick);
    expect(world.driver.speed()).toBe(1);

    world.driver.setSpeed(4);

    // The rest of the ring, minute by minute, with the phone still on the
    // screen for every one of them.
    for (let minute = entry.tick + 1; minute < entry.endsTick; minute += 1) {
      turnTo(world.driver, world.session, minute);
      expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
      expect(world.driver.speed(), `minute ${String(minute)}`).toBe(4);
    }
  });

  /**
   * And the handback gives nothing back, on purpose. "The day slowed down
   * because something happened" is legible; a clock that re-accelerates behind
   * the player's back is not.
   */
  it('and the desk coming back does not restore the speed', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick);
    expect(world.driver.speed()).toBe(1);

    turnTo(world.driver, world.session, entry.endsTick + 1);

    expect(world.driver.interruption()).toBeNull();
    expect(world.driver.speed()).toBe(1);
  });
});

/* -- the axis it is not on ------------------------------------------------ */

describe('pause is a different question', () => {
  it('is untouched by a drop, and holds the drop through a resume', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.speed()).toBe(1);
    // The day is not stopped: a phone ringing is a thing that is HAPPENING,
    // and every clock in this game runs through it.
    expect(world.driver.paused()).toBe(false);

    world.driver.setPaused(true);
    expect(world.driver.speed()).toBe(1);
    world.driver.setPaused(false);
    expect(world.driver.speed()).toBe(1);
  });

  /**
   * And the other direction: a day that was stopped when the phone was due
   * stays stopped, and the minute it is started again is the minute the phone
   * rings and the control drops. Nothing is lost by pausing and nothing is
   * dodged by it.
   */
  it('holds the arrival until the clock is started again', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick - 1);

    world.driver.setPaused(true);

    for (let turn = 0; turn < 400; turn += 1) {
      world.driver.step(DRIVER_INTERVAL_MS);
    }

    expect(world.session.engine.now()).toBe(entry.tick - 1);
    expect(world.driver.interruption()).toBeNull();
    expect(world.driver.speed()).toBe(4);

    world.driver.setPaused(false);
    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
    expect(world.driver.speed()).toBe(1);
  });
});

/* -- the telegraph on the drop (F2) --------------------------------------- */

/**
 * The drop leaves a word behind it now (slice 0.3.6, F2).
 *
 * The only signal a drop ever left was the speed button moving, so an afternoon
 * chosen at x4 could run the rest of itself at x1 with nobody the wiser and the
 * no-auto-restore rule making it permanent. The telegraph fires exactly when
 * the clock ACTUALLY drops - and says nothing when a takeover lands on a clock
 * that was already at x1, because nothing changed and a telegraph about nothing
 * is noise. Reverting the telegraph reds the first case; reverting the "only on
 * a real drop" guard reds the second.
 */
describe('the drop tells the player it happened', () => {
  it('fires a telegraph naming the cause when the clock is actually dropped', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    world.driver.setSpeed(4);
    turnTo(world.driver, world.session, entry.tick - 1);
    expect(world.dropped).toEqual([]);

    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.speed()).toBe(1);
    expect(world.dropped).toEqual(['call']);
  });

  it('says nothing when the takeover lands on a clock already at x1', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    // The player is already watching at x1: the arrival changes no speed, so
    // there is no drop to announce.
    world.driver.setSpeed(1);
    turnTo(world.driver, world.session, entry.tick);

    expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
    expect(world.driver.speed()).toBe(1);
    expect(world.dropped).toEqual([]);
  });

  it('names the lead when the corridor drops it', () => {
    const world = harnessOn(1);

    world.onScreen.push('bubbles');
    world.driver.setSpeed(4);

    while (world.caught.length === 0 && world.driver.state() === 'shift') {
      world.driver.step(DRIVER_INTERVAL_MS);
    }

    expect(world.driver.speed()).toBe(1);
    expect(world.dropped).toEqual(['boss']);
  });
});

/* -- the goldens' half of it ---------------------------------------------- */

/**
 * A day driven at x1 - which is what every scripted walk in this suite does -
 * cannot tell whether this slice shipped.
 *
 * It is the argument the goldens make in one assertion: speed is a property of
 * how fast somebody is WATCHING, the world's minutes are the same minutes at
 * any of them, and a rule that only ever sets x1 changes nothing about a day
 * that was already there. A golden that moved under this slice would be a bug
 * in the slice.
 */
describe('a day at x1', () => {
  it('spends the same minutes and lands on the same world', () => {
    const speeds: Speed[] = [1, 1];
    const hashes = speeds.map((speed) => {
      const world = harnessOn(2);
      const entry = entryOn(world.session, 2, 'call:spooler');

      world.driver.setSpeed(speed);
      turnTo(world.driver, world.session, entry.endsTick + 30);

      expect(world.driver.speed()).toBe(1);
      return {
        tick: world.session.engine.now(),
        hash: world.session.engine.snapshotHash(),
      };
    });

    expect(hashes[0]).toEqual(hashes[1]);
  });
});
