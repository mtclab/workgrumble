/**
 * The green-dot triangle, driven through the shipped driver and the shipped
 * engine, on the days the shipped week authors interruptions into.
 *
 * The units one floor down prove the arithmetic: where a slid call lands, what
 * an interval of do-not-disturb-while-working is worth, which sources a dot
 * cannot touch. What they cannot prove is the thing the player actually meets
 * - that the phone genuinely does not ring, that the meeting happens anyway,
 * that the record of a call nobody took is still there at the end of the day,
 * and that a week nobody sets a dot on is the same week it was before any of
 * this existed.
 *
 * So every assertion below is about a state the PLAYER reaches rather than
 * about a dispatch having returned. Nothing here touches the DOM: the driver
 * runs exactly as it does in the browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import {
  buildInterruptionSchedule,
  type InterruptionEntry,
} from '../world/interruptions';
import { isRefocusing, METER_INTERVAL_TICKS } from '../world/meters';
import {
  DND_BEAT_MINUTES,
  DND_BEAT_SUSPICION,
  DND_SLIDE_MINUTES,
  DND_WORKING_SUSPICION,
  type Presence,
} from '../world/presence';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket, ticketNodes } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import {
  DayDriver,
  IN_A_MEETING_REASON,
  TICK_INTERVAL_MS,
} from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every interruption that actually took the screen. */
  readonly arrivals: string[];
  /** And every one the dot sent away instead. */
  readonly dodged: string[];
  /** Everybody who has had a thought about the Away dot. */
  readonly noticed: string[];
}

/**
 * A driver standing at the start of a given day's shift, with the days before
 * it PLAYED rather than skipped - the schedule for a Thursday is only
 * reachable through a world that has had a Monday in it.
 */
function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const arrivals: string[] = [];
  const dodged: string[] = [];
  const noticed: string[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onInterruption: (view) => {
        arrivals.push(view.entry.id);
      },
      onInterruptionDodged: (entry) => {
        dodged.push(entry.id);
      },
      onPresenceNoticed: (reporter) => {
        noticed.push(reporter);
      },
    },
  );

  for (let played = 1; played < day; played += 1) {
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
  dodged.length = 0;
  noticed.length = 0;
  return { driver, session, arrivals, dodged, noticed };
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

/** One dispatch that is unmistakably work, aimed at a ticket's own estate. */
function touchSomething(driver: DayDriver, session: WorldSession): boolean {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    const step = findWorldTicket(ticket.id)?.paths[0]?.steps[0];

    if (step === undefined) {
      continue;
    }

    return driver.dispatch(
      step.action,
      COMPANY_IDS.player,
      step.target,
      { ...step.params },
    ).ok;
  }

  return false;
}

/**
 * A dispatch that is unmistakably work and changes nothing, so a test can keep
 * doing it all morning.
 *
 * It is REFUSED, on purpose: a refusal is still a touch - the log records what
 * was tried, not only what worked - so this is exactly the evidence the drip
 * reads, and the queue it is aimed at never runs out because nothing about the
 * world moves.
 */
function pretendToWork(driver: DayDriver, session: WorldSession): boolean {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    const node = isUnresolved(ticket) ? ticketNodes(ticket.id)[0] : undefined;

    if (node === undefined) {
      continue;
    }

    driver.dispatch(
      HELPDESK_ACTIONS.machineSetDisplayRotation,
      COMPANY_IDS.player,
      node,
      { rotation: 999 },
    );
    return true;
  }

  return false;
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

function number(session: WorldSession, field: string): number {
  const value = player(session, field);
  return typeof value === 'number' ? value : 0;
}

function lines(session: WorldSession, field: string): readonly string[] {
  const value = player(session, field);
  return typeof value === 'string' && value.length > 0
    ? value.split('\n')
    : [];
}

/* -- the default, and the week that never touches it ----------------------- */

describe('a player who never touches the tray', () => {
  it('is available, and the world holds nothing about it', () => {
    const world = harnessOn(1);

    expect(world.driver.presence()).toBe('available');
    // Absent rather than "available": the field is the thing that would move a
    // golden, and nothing writes it until somebody sets one.
    expect(player(world.session, FIELDS.presence)).toBeUndefined();
    expect(world.driver.dndBeat().armed).toBe(false);
  });

  /**
   * The determinism gate for this slice, said about the calendar rather than
   * about a hash: the schedule the day loop actually walks is the schedule it
   * walked before the dot existed, minute for minute, on every day of the
   * week the presence machinery could have touched.
   */
  it('walks the same interruption schedule the week always had', () => {
    const world = harnessOn(1);
    let arrived = 0;
    let authored = 0;

    for (const day of [1, 2, 3, 4, 5]) {
      authored += buildInterruptionSchedule(
        world.session.seed,
        day,
        interruptionPlanFor(day, world.session.seed),
      ).entries.length;

      runTo(world.driver, world.session, shiftEndTick(day));

      // Every authored entry of the day took the screen, in the minute the
      // schedule says, and nothing was slid past anybody.
      expect(world.dodged, `day ${String(day)}`).toEqual([]);
      expect(world.arrivals.length, `day ${String(day)}`).toBe(authored);
      arrived = world.arrivals.length;

      world.driver.clockOff();

      if (day < 5) {
        world.driver.startShift();
      }
    }

    // A week with interruptions in it, so the block above is not five
    // assertions about an empty list.
    expect(arrived).toBeGreaterThan(0);
    expect(player(world.session, FIELDS.interruptionDodged)).toBeUndefined();
    expect(player(world.session, FIELDS.dndWorkingTicks)).toBeUndefined();
    expect(player(world.session, FIELDS.presenceNoticed)).toBeUndefined();
    expect(player(world.session, FIELDS.presence)).toBeUndefined();
  });
});

/* -- the dnd journey ------------------------------------------------------- */

describe('a morning on do not disturb', () => {
  /**
   * The journey the spec names: dodge a call, collect the drip, meet the
   * meeting anyway.
   *
   * The assertion is what the PLAYER gets - a phone that does not ring, the
   * same call ringing later, and a meter that has moved because of it - rather
   * than that `setPresence` returned ok.
   */
  it('sends the call away and brings it back twenty minutes later', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 2);
    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });

    const before = number(world.session, FIELDS.stress);

    runTo(world.driver, world.session, entry.tick + 1);

    // It did not ring. Nothing took the screen, nothing was charged for
    // arriving, and there was no choice to make.
    expect(world.driver.interruption()).toBeNull();
    expect(world.arrivals).toEqual([]);
    expect(world.dodged).toEqual(['call:spooler']);
    expect(number(world.session, FIELDS.stress)).toBe(before);
    // And the budget is untouched: a slide is not a postpone.
    expect(player(world.session, FIELDS.interruptionPostpones)).toBeUndefined();

    // Back to available, and they try again - at the minute the world says,
    // which is measured from the slide rather than from the original ring.
    expect(world.driver.setPresence('available')).toEqual({ ok: true });
    runTo(world.driver, world.session, entry.tick + DND_SLIDE_MINUTES);

    expect(world.driver.interruption()?.entry.id).toBe('call:spooler');
    expect(world.arrivals).toEqual(['call:spooler']);
    // Still a call you can say no to: nobody asked them to ring back.
    expect(world.driver.interruption()?.entry.declinable).toBe(true);
    expect(world.driver.interruption()?.callback).toBe(false);
  });

  /**
   * Held all day, the call runs out of day - and the record of it is still
   * there at five o'clock, which is the honest trace the boss can read.
   */
  it('drops a call that never found a minute, and keeps the record', () => {
    const world = harnessOn(2);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(world.driver, world.session, shiftEndTick(2));

    expect(world.arrivals).toEqual([]);
    expect(lines(world.session, FIELDS.interruptionMissed))
      .toContain('call:spooler');
    // It slid all day rather than vanishing at the first attempt: the drop is
    // an outcome the day arrived at, not a shortcut.
    expect(lines(world.session, FIELDS.interruptionDodged).length)
      .toBeGreaterThan(3);
    // And none of it cost the window a phone that RANG costs, because none of
    // it rang. That is the trade the suspicion drip is the other half of.
    expect(isRefocusing(player(world.session, FIELDS.refocusUntil), shiftEndTick(2)))
      .toBe(false);
  });

  /**
   * The exemption, met the way a player meets it: the sync happens, it takes
   * the desk, and the dot is still on the whole time.
   */
  it('sits through the sync anyway', () => {
    const world = harnessOn(3);
    const sync = entryOn(world.session, 3, 'meeting:hygiene-sync');

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(world.driver, world.session, sync.tick);

    expect(world.driver.presence()).toBe('dnd');
    expect(world.dodged).toEqual([]);
    expect(world.driver.interruption()?.entry.id).toBe('meeting:hygiene-sync');
    // And the desk is genuinely gone, dot or no dot - including for the tray
    // control itself, which is a desk surface like any other.
    expect(world.driver.setPresence('available'))
      .toEqual({ ok: false, reason: IN_A_MEETING_REASON });
  });

  it('drips suspicion while the log says the queue is being worked', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(touchSomething(world.driver, world.session)).toBe(true);

    const before = number(world.session, FIELDS.suspicion);

    runTo(world.driver, world.session, world.session.engine.now() + METER_INTERVAL_TICKS * 2);

    expect(number(world.session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(before + DND_WORKING_SUSPICION);
    // And the evidence, which does not drain and is what the beat is armed
    // off: half an hour of it is a sentence somebody can say out loud.
    expect(number(world.session, FIELDS.dndWorkingTicks))
      .toBeGreaterThanOrEqual(METER_INTERVAL_TICKS);
  });

  it('costs a desk nobody is working at nothing at all', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    // No dispatch, no touch: a dot held over a quiet desk is telling the truth.
    runTo(world.driver, world.session, world.session.engine.now() + METER_INTERVAL_TICKS * 4);

    expect(player(world.session, FIELDS.dndWorkingTicks)).toBeUndefined();
    expect(number(world.session, FIELDS.suspicion)).toBe(0);
  });

  /**
   * The beat, armed off evidence rather than off a die roll. Lane B renders
   * the scene; what lane A owes it is a predicate that is false all the way up
   * to the minute the world can point at a number for it.
   */
  it('arms the lead\'s beat only once the record holds both halves', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(world.driver.dndBeat().armed).toBe(false);

    // Worked all morning with the dot on, which is the claim the beat's own
    // sentence makes and therefore the day it has to be armed by.
    for (let round = 0; round < 48; round += 1) {
      expect(pretendToWork(world.driver, world.session), 'nothing to work on')
        .toBe(true);
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS,
      );
    }

    const beat = world.driver.dndBeat();

    expect(beat.minutes).toBeGreaterThanOrEqual(DND_BEAT_MINUTES);
    expect(beat.suspicion).toBeGreaterThanOrEqual(DND_BEAT_SUSPICION);
    expect(beat.armed).toBe(true);

    // And it disarms the moment the dot comes off, because the beat is about
    // the dot rather than about the meter - the meter has its own scene.
    expect(world.driver.setPresence('available')).toEqual({ ok: true });
    expect(world.driver.dndBeat().armed).toBe(false);
  });
});

/* -- the away journey ------------------------------------------------------ */

describe('an afternoon marked away', () => {
  /**
   * Work while Away, get answered for it: one person, once, and the
   * reputation is the world's arithmetic rather than a scripted scold.
   */
  it('is answered by somebody who has been waiting for a word', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('away')).toEqual({ ok: true });

    const before = number(world.session, FIELDS.reputation);

    expect(touchSomething(world.driver, world.session)).toBe(true);

    expect(world.noticed).toHaveLength(1);
    expect(number(world.session, FIELDS.reputation)).toBeLessThan(before);
    expect(lines(world.session, FIELDS.presenceNoticed)).toHaveLength(1);
  });

  it('is one thought per person, however long the afternoon goes on', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('away')).toEqual({ ok: true });

    for (let round = 0; round < 6; round += 1) {
      touchSomething(world.driver, world.session);
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS,
      );
    }

    // Somebody did notice - an empty list would make the uniqueness below a
    // sentence about nothing.
    expect(world.noticed.length).toBeGreaterThan(0);
    // And several people can each have their one thought; nobody has two.
    expect(new Set(world.noticed).size).toBe(world.noticed.length);
    expect(lines(world.session, FIELDS.presenceNoticed))
      .toHaveLength(world.noticed.length);
  });

  it('costs nothing at all on the other two dots', () => {
    for (const presence of ['available', 'dnd'] satisfies Presence[]) {
      const world = harnessOn(1);
      const before = number(world.session, FIELDS.reputation);

      expect(world.driver.setPresence(presence)).toEqual({ ok: true });
      expect(touchSomething(world.driver, world.session)).toBe(true);

      expect(world.noticed, presence).toEqual([]);
      expect(number(world.session, FIELDS.reputation), presence).toBe(before);
    }
  });
});

/* -- the save, and the night ----------------------------------------------- */

describe('the dot across a save and a night', () => {
  it('comes back on the same minute with the same call still to come', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 2);
    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(world.driver, world.session, entry.tick + 1);

    const saved = world.session.engine.serialize();
    const reloaded = harnessOn(2);

    reloaded.session.engine.restore(saved);
    reloaded.driver.resync();

    expect(reloaded.driver.presence()).toBe('dnd');
    expect(reloaded.session.engine.now()).toBe(world.session.engine.now());
    expect(reloaded.driver.interruption()).toBeNull();

    // The call the dot slid past is exactly where the world put it, on both
    // sides of the save, because nothing about it was ever in the driver.
    reloaded.driver.setPresence('available');
    world.driver.setPresence('available');
    runTo(reloaded.driver, reloaded.session, entry.tick + DND_SLIDE_MINUTES);
    runTo(world.driver, world.session, entry.tick + DND_SLIDE_MINUTES);

    expect(reloaded.driver.interruption()?.entry.tick)
      .toBe(world.driver.interruption()?.entry.tick);
  });

  /**
   * The night, through the real `advanceOffHours` rather than the classifier:
   * a status set during the day survives the dark, and nothing about it is
   * WRITTEN in the dark - which is what the extended guard refuses.
   */
  it('survives the night without anything happening in it', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(touchSomething(world.driver, world.session)).toBe(true);
    runTo(world.driver, world.session, shiftEndTick(1));

    const banked = number(world.session, FIELDS.dndWorkingTicks);

    expect(() => {
      world.driver.clockOff();
    }).not.toThrow();

    expect(world.driver.presence()).toBe('dnd');
    expect(number(world.session, FIELDS.dndWorkingTicks)).toBe(banked);
    // Nobody rang, nobody escalated and nothing slid while the building was
    // dark - which is the whole of what the off-hours guard is for.
    expect(player(world.session, FIELDS.interruptionDodged)).toBeUndefined();
  });
});
