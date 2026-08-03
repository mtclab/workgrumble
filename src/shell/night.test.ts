/**
 * The night, and the seam either side of it.
 *
 * Nine hundred minutes go past between clocking off at five and sitting down
 * at eight, and the world does exactly one thing in each of them: every
 * unresolved deadline moves out by a minute and the counter behind it goes up
 * by one. Lived a minute at a time that was nine hundred tick fan-outs and
 * tens of thousands of mutation events, every one of which repainted every
 * open window - which is the whole of the measured delay between pressing
 * "clock off" and seeing tomorrow morning.
 *
 * It is one core call now. That is only allowed to be a performance change, so
 * this file is the proof that it is one: the same hash, the same counters, the
 * same machine event logs and the same dispatch log as the minute-by-minute
 * night, with the fan-out counted so the saving cannot quietly go away again.
 *
 * And the other half is the seam the QA could not find a failure at and could
 * not find a test for either: a session saved during the morning brief, loaded,
 * and started at nine has to arrive at the same world as one that was never
 * interrupted. A resync that started an SLA a minute early, or extended one
 * twice, would be invisible to every other test in the suite.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi, EngineEvent } from '../engine-api';
import { offHoursRefusal } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import {
  dayOpensTick,
  shiftEndTick,
  shiftStartTick,
} from '../world/day';
import { FIELDS } from '../world/fields';
import { readEventLog } from '../world/events';
import { createWorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Night {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  /** Simulation ticks the engine announced. */
  readonly ticks: () => number;
  /** Engine events the engine announced. */
  readonly events: () => number;
}

function night(): Night {
  const { engine, seed } = createWorldSession();
  let ticks = 0;
  let events = 0;

  engine.onTick(() => {
    ticks += 1;
  });
  engine.onEvent(() => {
    events += 1;
  });

  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });

  return { driver, engine, ticks: () => ticks, events: () => events };
}

/** Monday, worked to five o'clock and no further. */
function toClockingOff(scene: Night): void {
  scene.driver.startShift();
  scene.driver.step(TICK_INTERVAL_MS
    * (shiftEndTick(1) - scene.engine.now()));
  expect(scene.driver.state()).toBe('day_end');
}

/** Every machine's log, as the Event Viewer would render it. */
function logs(engine: EngineApi): Record<string, string> {
  const found: Record<string, string> = {};

  for (const machine of engine.graph.nodesOfKind('machine')) {
    found[machine.id] = readEventLog(machine.fields[FIELDS.eventLog])
      .map((entry) => `${String(entry.tick)}/${String(entry.id)}`)
      .join(',');
  }

  return found;
}

/** Every open ticket's deadline and the counters behind it. */
function clocks(engine: EngineApi): Record<string, string> {
  const found: Record<string, string> = {};

  for (const ticket of engine.graph.nodesOfKind('ticket')) {
    found[ticket.id] = [
      FIELDS.slaDeadline,
      FIELDS.offHoursTicks,
      FIELDS.heldTicks,
      FIELDS.respondedAt,
      FIELDS.state,
    ].map((field) => `${field}=${String(ticket.fields[field] ?? '-')}`).join('|');
  }

  return found;
}

describe('the night, taken in one go', () => {
  /**
   * The parity that makes the coalesce legitimate rather than a shortcut: the
   * same world, to the hash, to the counters, and to the last line in every
   * machine's own log.
   */
  it('lands on exactly the world a minute-by-minute night lands on', () => {
    const coalesced = night();
    const lived = night();
    toClockingOff(coalesced);
    toClockingOff(lived);

    expect(coalesced.engine.snapshotHash()).toBe(lived.engine.snapshotHash());

    const minutes = dayOpensTick(2) - coalesced.engine.now();
    expect(minutes).toBeGreaterThan(800);

    coalesced.engine.advanceOffHours(minutes);

    for (let minute = 0; minute < minutes; minute += 1) {
      lived.engine.advance(1);
    }

    expect(coalesced.engine.now()).toBe(lived.engine.now());
    expect(coalesced.engine.snapshotHash()).toBe(lived.engine.snapshotHash());
    expect(clocks(coalesced.engine)).toEqual(clocks(lived.engine));
    // The evidence surface, row for row: the whole reason the coalesce may
    // not simply batch the events is that somebody stamps times onto them.
    expect(logs(coalesced.engine)).toEqual(logs(lived.engine));
    expect(coalesced.engine.dispatchLog()).toEqual(lived.engine.dispatchLog());
  });

  /**
   * And the cost, counted rather than timed. A wall clock is a flaky
   * assertion; the number of fan-outs is the thing that was actually wrong,
   * and it is exact.
   */
  it('announces the night once instead of nine hundred times', () => {
    const coalesced = night();
    const lived = night();
    toClockingOff(coalesced);
    toClockingOff(lived);

    const minutes = dayOpensTick(2) - coalesced.engine.now();
    const ticksBefore = coalesced.ticks();
    const eventsBefore = coalesced.events();

    coalesced.engine.advanceOffHours(minutes);

    for (let minute = 0; minute < minutes; minute += 1) {
      lived.engine.advance(1);
    }

    expect(coalesced.ticks() - ticksBefore).toBe(1);
    expect(coalesced.events() - eventsBefore).toBe(0);
    // The comparison, so this stops being a number nobody can read: living it
    // announces one tick per minute and a mutation per open deadline per
    // minute, and there are several hundred of both.
    expect(lived.ticks()).toBeGreaterThan(minutes - 1);
    expect(lived.events()).toBeGreaterThan(minutes);
  });

  /** And the shipped day boundary uses it, so the saving is the player's. */
  it('crosses a real day boundary with one repaint', () => {
    const scene = night();
    toClockingOff(scene);

    const ticksBefore = scene.ticks();
    const eventsBefore = scene.events();
    scene.driver.clockOff();

    expect(scene.engine.now()).toBe(dayOpensTick(2));
    // One tick for the night. The events are the clock-off verb itself and
    // the checkpoint - a handful, not a queue.
    expect(scene.ticks() - ticksBefore).toBe(1);
    expect(scene.events() - eventsBefore).toBeLessThan(50);
  });

  /**
   * The coalesce is legal only while the service clock is held, and that is
   * the load-bearing half rather than a tidiness rule: with the clock running
   * a deadline can be crossed, and a breach carries a minute that somebody
   * stamps onto a machine's log with `now()`. Reporting all of them as having
   * happened at the end of the night is the dishonest version of this change.
   */
  it('refuses to coalesce minutes somebody is being paid for', () => {
    const scene = night();
    scene.driver.startShift();

    expect(scene.engine.slaRunning()).toBe(true);
    expect(() => {
      scene.engine.advanceOffHours(60);
    }).toThrow(/lived one at a time/u);
    expect(scene.engine.now()).toBe(shiftStartTick(1));
  });

  /**
   * Nobody rings at four in the morning.
   *
   * The guard is an allowlist of the three fields a held clock moves, so an
   * interruption firing in the dark was already refused - but it was refused
   * as "1 event(s) happened", which is a sentence that names nothing. The
   * forbidden list names the mechanic instead, and it is the line that has to
   * be deleted before anybody can quietly add `refocus_until` to the three.
   *
   * The per-field half is asserted against the classifier, because the engine
   * emits these events from its own tick handler and the only honest way to
   * plant an interruption in the forbidden window is to hand the guard the
   * event an interruption would have produced.
   *
   * The WIRING is asserted separately and through the real call, because the
   * per-field half is worthless on its own: a classifier nobody calls is a
   * table that stays perfectly correct while the night stops being checked at
   * all. So the last block below makes `advanceOffHours` actually throw, and
   * asserts the sentence it throws is the one this same function produced -
   * which is a claim about the two being connected rather than about either.
   */
  it('refuses a night an interruption happened in, and says which', () => {
    const planted = (field: string): EngineEvent => ({
      type: 'graph:mutated',
      mutation: {
        type: 'field:set',
        id: COMPANY_IDS.player,
        field,
        value: 1,
      },
    });

    for (const field of [
      FIELDS.refocusUntil,
      FIELDS.interruptionAnswered,
      FIELDS.interruptionDeferred,
      FIELDS.interruptionDeclined,
      // And the one 0.3.0 lane B added, for the same reason as the other
      // four: nobody sits in a meeting at four in the morning, so a night
      // that minuted one is a night reporting an event at the wrong minute.
      FIELDS.meetingRecapAt,
      // And 0.3.1's ledger. A postpone is a thing the player spends while
      // something is on the screen in front of them, and nothing is on
      // anybody's screen at four in the morning - so a night that spent one
      // would be a night in which an update countdown was running.
      FIELDS.interruptionPostpones,
      // And the minute it was pressed on, which is the same claim with a
      // clock attached: there is no minute at four in the morning that a
      // player could have pressed anything on.
      FIELDS.interruptionSpentAt,
      // And 0.3.3's four. The dot cannot be set into an empty building, and
      // the three things that are consequences OF it cannot happen there
      // either: nobody rings a desk at four in the morning for a status to
      // slide past, no minute of the night is a minute anybody worked the
      // queue in, and nobody waiting on a ticket has a thought about your
      // availability before the building is unlocked.
      FIELDS.presence,
      FIELDS.interruptionDodged,
      FIELDS.dndWorkingTicks,
      FIELDS.presenceNoticed,
      // And 0.4.0's audit trail, both halves. Nobody installs or uninstalls
      // software at four in the morning, so a night that wrote either line
      // would be reporting an install at a minute nobody was at the desk.
      FIELDS.installAudit,
      FIELDS.installRemoved,
    ]) {
      const refusal = offHoursRefusal([planted(field)]);

      expect(refusal, field).toContain('The night was interrupted');
      expect(refusal, field).toContain(field);
    }

    // The three the night IS allowed to write still pass, which is the half
    // that proves the guard was extended rather than tightened into uselessness.
    expect(offHoursRefusal([
      planted('sla_deadline'),
      planted('off_hours_ticks'),
      planted('held_ticks'),
    ])).toBeNull();
    expect(offHoursRefusal([])).toBeNull();
    // And anything else is still refused, in the words it always was.
    expect(offHoursRefusal([planted(FIELDS.stress)]))
      .toContain('1 event(s) happened');
  });

  /**
   * And the real call refuses and permits, rather than being a table nobody
   * asks.
   *
   * The block above is a claim about the CLASSIFIER, and a classifier nobody
   * calls stays perfectly correct while the night stops being checked at all.
   * This is the other half, through `advanceOffHours` itself: a batch it
   * cannot vouch for is thrown and the clock does not move, and a batch it can
   * is lived and the clock does.
   *
   * The forbidden-FIELD branch is deliberately not driven from here, and that
   * is a property rather than a gap: nothing in this engine writes any of
   * those five fields on a tick, so a real night cannot produce one. The
   * branch exists for the tick handler somebody adds later, and the sentence
   * it carries is what will name the mechanic when they do. `assertCaughtScenes`
   * has the same shape - a loader guarding content that does not exist yet.
   */
  it('refuses a night it cannot vouch for, and lives one it can', () => {
    const refused = night();
    refused.driver.startShift();

    // A batch with the service clock running: minutes somebody is being paid
    // for, which is the state the whole coalesce is illegal in.
    expect(() => {
      refused.engine.advanceOffHours(60);
    }).toThrow();
    expect(refused.engine.now()).toBe(shiftStartTick(1));

    // And the same call over minutes nobody is at the desk for, which is what
    // every clock-off in the game does: lived, in one batch, and the clock is
    // where it was asked to be.
    const lived = night();
    const from = lived.engine.now();

    expect(lived.engine.slaRunning()).toBe(false);
    lived.engine.advanceOffHours(30);
    expect(lived.engine.now()).toBe(from + 30);
  });

  /** And the shipped night, walked, produces none of them. */
  it('gets through a real night without one', () => {
    const scene = night();
    toClockingOff(scene);

    expect(() => {
      scene.driver.clockOff();
    }).not.toThrow();
    expect(scene.engine.graph.getField(COMPANY_IDS.player, FIELDS.refocusUntil))
      .toBeUndefined();
  });

  /**
   * A night walked over a world that HAS spent a postpone, through the real
   * `advanceOffHours` rather than through the classifier.
   *
   * The two halves are different claims and both matter. The guard's: nothing
   * about the ledger happens in the dark, so the batch is one it can vouch for
   * and the clock moves. The ledger's: what was spent during the day is still
   * spent in the morning - a budget that came back full overnight would be an
   * update that could be put off for ever, one night at a time.
   */
  it('carries a spent postpone through the dark without writing one', () => {
    const scene = night();

    scene.driver.startShift();
    expect(scene.engine.dispatch(
      DAY_ACTIONS.interruptionDefer,
      COMPANY_IDS.player,
      null,
      { id: 'machine:reboot', declinable: 0, postpones: 3 },
    ).ok).toBe(true);

    toClockingOff(scene);

    expect(() => {
      scene.driver.clockOff();
    }).not.toThrow();
    expect(scene.engine.now()).toBe(dayOpensTick(2));
    expect(scene.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.interruptionPostpones,
    )).toBe('machine:reboot');
  });
});

/* -- the seam at nine o'clock --------------------------------------------- */

describe('a session saved during the morning brief', () => {
  /**
   * Uninterrupted, versus saved at 08:59, loaded and started at nine.
   *
   * No failure was reproduced here; the point is that one could not have been
   * found. The existing load coverage restores AFTER a completed night, so a
   * resync that started the service clock a minute early, or that let the
   * night's extension run one minute too far, would leave every deadline in
   * the world one out and the whole suite green.
   */
  it('arrives at the same world as one that was never interrupted', () => {
    const straight = night();
    const interrupted = night();

    for (const scene of [straight, interrupted]) {
      toClockingOff(scene);
      scene.driver.clockOff();
      expect(scene.engine.now()).toBe(dayOpensTick(2));
      expect(scene.driver.state()).toBe('morning_brief');
    }

    // The interrupted one spends the brief being read, and is saved with one
    // minute of it left.
    interrupted.engine.advanceOffHours(shiftStartTick(2) - 1
      - interrupted.engine.now());
    expect(interrupted.engine.now()).toBe(shiftStartTick(2) - 1);

    const saved = interrupted.engine.serialize();
    const reloaded = night();
    reloaded.engine.restore(saved);
    reloaded.driver.resync();

    expect(reloaded.driver.state()).toBe('morning_brief');
    expect(reloaded.engine.now()).toBe(shiftStartTick(2) - 1);

    // Both start the shift, which is what puts the clock on nine.
    straight.driver.startShift();
    reloaded.driver.startShift();

    expect(reloaded.engine.now()).toBe(shiftStartTick(2));
    expect(straight.engine.now()).toBe(shiftStartTick(2));
    expect(reloaded.engine.slaRunning()).toBe(true);
    expect(straight.engine.slaRunning()).toBe(true);

    // Every deadline, every counter, and the world itself.
    expect(clocks(reloaded.engine)).toEqual(clocks(straight.engine));
    expect(reloaded.engine.snapshotHash()).toBe(straight.engine.snapshotHash());

    // And they stay together for the morning, which is where an off-by-one in
    // the extension would show up rather than at the seam itself.
    straight.driver.step(TICK_INTERVAL_MS * 120);
    reloaded.driver.step(TICK_INTERVAL_MS * 120);

    expect(reloaded.engine.now()).toBe(straight.engine.now());
    expect(clocks(reloaded.engine)).toEqual(clocks(straight.engine));
    expect(reloaded.engine.snapshotHash()).toBe(straight.engine.snapshotHash());
  });
});
