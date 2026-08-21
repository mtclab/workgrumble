/**
 * A career of two weeks, at one employer, driven end to end on the SHIPPED
 * session (E11, 0.34.0 slice 1).
 *
 * THE LESSON THIS FILE IS BUILT AROUND IS 0.6.0's. The employer switch shipped
 * with five wiring defects that every unit test in the project missed, because
 * every unit test constructed the session it was about. A world transition is
 * not a function that returns a value - it is a boot, a Friday, a record
 * written to storage, a page torn down, and a second boot that has to find
 * everything the first one left. So nothing below builds a week-two session and
 * asserts on it. Week one is PLAYED, on the real driver, for five days; the
 * Friday's door is the shipped session verb; the record goes into real storage;
 * and week two is whatever the boot that reads it back stands up.
 *
 * The four claims, each of which fails in a different place:
 *
 * - THE UNLOCK. A passed week hands the player the same employer's NEXT week.
 *   `arcWeek` climbs, the composition is a different week, and the ten-week
 *   ladder in `pressure.ts` has somewhere to fire from for the first time since
 *   it shipped.
 * - THE WHITELIST CARRIES. What the employer declared persistent is in the new
 *   world; what it did not is rebuilt. Both halves are asserted, because a
 *   whitelist that carried everything would pass the first half alone.
 * - THE SAVE ROUND TRIP. A save taken mid-week-two reloads into week two. This
 *   is the 0.31.0 defect class read one version on: nothing throws when a load
 *   resolves the wrong week, the queue is simply somebody else's.
 * - THE THREE REFUSALS. A week that is not over, a firing and a redundancy have
 *   no next week here, and the arc's last week has no next week at all.
 *
 * Nothing below touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { employerFor } from '../world/employers';
import { FIELDS } from '../world/fields';
import { createWorldSession, FIRST_WEEK, type WeekCarry } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import { REVIEW_DAY } from '../world/week';
import { AppStateStore } from './app-state';
import { DayDriver, holdsTheDesk, TICK_INTERVAL_MS } from './day-driver';
import { RetrySlot } from './retry';
import {
  createShellSession,
  SAVE_SCHEMA,
  type SaveOutcome,
  SaveSlot,
  type ShellSessionApi,
} from './save';
import { carryForSwitch, SwitchSlot } from './switch';

beforeAll(() => {
  loadEngineForTests();
});

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

/**
 * The toy the store installs, and it is a real catalogue id rather than any
 * old string: the app-state parse refuses an install set naming something the
 * build cannot mount, so a carried set that did not round-trip a save would
 * fail the load rather than quietly arrive empty.
 */
const A_TOY = 'arcade';

interface Booted {
  readonly engine: EngineApi;
  readonly driver: DayDriver;
  readonly appState: AppStateStore;
  readonly session: ShellSessionApi;
  readonly slot: SaveSlot;
  readonly switchSlot: SwitchSlot;
  readonly carry: WeekCarry;
  readonly restarts: () => number;
}

/**
 * A boot, wired the way `main.ts` wires one.
 *
 * The same order and the same seams: read the arrival record, stand the world
 * up FROM it, hydrate the toys it carried, and hand the shell session the
 * employer id and the opening balance the world was built with. A test that
 * skipped any of those four would be a test of a boot nobody ships.
 */
function boot(storage: MemoryStorage): Booted {
  const switchSlot = new SwitchSlot(storage);
  const arriving = switchSlot.peek();
  const carry = arriving === null ? FIRST_WEEK : carryForSwitch(arriving);
  const { engine, seed, employer, week } = createWorldSession(carry);
  const shop = employerFor(employer);
  const appState = new AppStateStore();

  if (arriving?.installed !== undefined && arriving.installed.length > 0) {
    appState.patch('installed', { apps: [...arriving.installed] });
  }

  const driver = new DayDriver(
    engine,
    shop.playerId,
    seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
    // No injected plan reader, then this session's content - the week OFF THE
    // SESSION rather than off the employer record, exactly as `main.ts` hands
    // it in. A harness that let this default would deal the probation table all
    // week while the world underneath it was somebody else's, which is the
    // 0.6.0 defect class this whole file exists to catch.
    undefined,
    week,
    shop.channels,
    shop.runsBossPings,
  );
  const slot = new SaveSlot(storage);
  let restarts = 0;

  const session = createShellSession({
    engine,
    appState,
    day: driver,
    slot,
    retry: new RetrySlot(storage),
    switch: switchSlot,
    actor: shop.playerId,
    employer,
    carried: carry.estate ?? [],
    probeEngine: () => new WasmEngine(seed),
    restart: () => {
      restarts += 1;
    },
  });

  return {
    engine,
    driver,
    appState,
    session,
    slot,
    switchSlot,
    carry,
    restarts: () => restarts,
  };
}

/** Runs the clock to a minute of the current day, a tick at a time. */
function runTo(world: Booted, tick: number): void {
  while (world.engine.now() < tick && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * Competent play, expressed as the content expresses it: for everything in the
 * queue that is still somebody's problem, drive the first way the ticket itself
 * says it can be closed.
 *
 * The same shape `scripted-week.test.ts` uses, and written against the CONTENT
 * rather than a list of action ids for the same reason - a week that stops
 * passing because a path stopped working is a finding, not a fixture to update.
 */
function workTheQueue(world: Booted): void {
  for (let waited = 0; waited < 60; waited += 1) {
    if (!holdsTheDesk(world.driver.interruption()?.entry.source)) {
      break;
    }

    world.driver.step(TICK_INTERVAL_MS);
  }

  for (const ticket of world.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    const path = findWorldTicket(ticket.id)?.paths[0];

    if (path === undefined) {
      continue;
    }

    for (const step of path.steps) {
      world.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

/**
 * Five days at the probation shop, worked the way the golden week works them,
 * with the review left to fire on the Friday at three.
 *
 * `play` is where a test puts the one thing it wants this week to have done -
 * installing the toy, writing the note by the socket - so the week itself stays
 * one function and the difference between two of them is visible.
 */
function playAWeek(
  world: Booted,
  play: (world: Booted, day: number) => void = () => {},
): void {
  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    expect(world.driver.day()).toBe(day);

    // Tolerant of a shift somebody already started, because one caller reads
    // the Monday's schedule (which needs the shift on) before handing the week
    // over to be played.
    if (world.driver.state() !== 'shift') {
      world.driver.startShift();
    }

    const start = shiftStartTick(day);
    runTo(world, start + 90);
    play(world, day);
    workTheQueue(world);
    runTo(world, start + 240);
    workTheQueue(world);
    runTo(world, start + 400);
    workTheQueue(world);
    runTo(world, shiftEndTick(day));
    expect(world.driver.state()).toBe('day_end');
    world.driver.clockOff();
  }
}

/** Five days of the queue left exactly as it arrives, which loses the room. */
function idleAWeek(world: Booted): void {
  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    world.driver.startShift();
    runTo(world, shiftEndTick(day));
    world.driver.clockOff();
  }
}

function fieldOf(world: Booted, node: string, field: string): unknown {
  return world.engine.graph.getField(node, field);
}

/** The whole of the probation shop's declared list, as a Friday holds it. */
const NOTE = {
  node: COMPANY_IDS.warehousePrintServer,
  field: FIELDS.stickyNote,
};

/**
 * The two things this career does that a week has to remember: it puts a toy on
 * the machine, and it gets Facilities to write on the socket.
 *
 * The note is written by the ACTION rather than by a setField, because the
 * action is what a player has - and because the guard on it ("nothing plugged
 * in at that end has gone off often enough") is exactly the guard that makes
 * this the interesting whitelist entry: it is earned inside the week, once.
 */
function leaveAMarkOnTheBuilding(world: Booted, day: number): void {
  if (day === 1) {
    world.appState.patch('installed', { apps: [A_TOY] });
  }

  if (day === REVIEW_DAY) {
    world.driver.dispatch(
      'facilities.sticky_note',
      COMPANY_IDS.player,
      COMPANY_IDS.warehousePrintServer,
      {},
    );
  }
}

describe('a passed week hands the player the next one at the same desk', () => {
  function twoWeeks(): { one: Booted; two: Booted } {
    const storage = new MemoryStorage();
    const one = boot(storage);

    playAWeek(one, leaveAMarkOnTheBuilding);

    expect(one.driver.reviewOutcome()).toBe('passed');
    // The mark on the building is real before anybody claims it survives one.
    expect(fieldOf(one, NOTE.node, NOTE.field)).toBe(true);

    const stayed = one.session.stayAnotherWeek();
    expect(stayed.ok, stayed.ok ? '' : stayed.reason).toBe(true);
    expect(one.restarts()).toBe(1);
    // The save of a world nobody is going back to is thrown away, exactly as
    // the retry and the switch throw theirs.
    expect(one.slot.exists()).toBe(false);

    return { one, two: boot(storage) };
  }

  it('climbs the arc: the Monday that follows is week two, same shop', () => {
    const { two } = twoWeeks();

    expect(two.carry.employer).toBe('workgrumble');
    expect(two.carry.arcWeek).toBe(2);
    // Read off the WORLD rather than off the carry, because the carry is what
    // was asked for and the graph is what happened: the arc position is a
    // player-node field, the save carries it, the redundancy matrix reads it,
    // and `weekRequestFrom` resolves the week from it after a load.
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(2);
    expect(two.driver.day()).toBe(1);
  });

  it('is a DIFFERENT week: the Monday nobody has worked before', () => {
    const { two } = twoWeeks();
    const authored = employerFor('workgrumble').week;

    // THE CONCRETE DIFFERENCE, and it is asserted on the two things a player
    // actually meets rather than on a table nobody can see.
    //
    // First, the pile on the desk at eight o'clock. The probation Monday hands
    // every new starter the same two tickets - the locked account and the
    // rotated screen - and week two's Monday is drawn, so it is not that pile.
    // This is also the assertion that catches the defect this slice found: the
    // pile used to be spawned from the shop's AUTHORED Monday whatever week the
    // driver was dealing, so week two opened on week one's queue and nothing
    // threw.
    expect(authored[0]?.inherited).toContain('ticket:locked-account');
    expect(authored[0]?.inherited).toContain('ticket:rotated-screen');

    const onTheDesk = new Set(
      two.engine.graph.nodesOfKind('ticket').map((ticket) => ticket.id),
    );

    expect([...onTheDesk].sort()).not.toEqual([...authored[0]?.inherited ?? []].sort());

    // And second, the day itself: every arrival Monday holds, at the minute it
    // holds it. That is what the queue screen is built from, and it is the
    // reading that would be identical if the seam's clamp came back or if
    // composition stopped being keyed on the arc position.
    two.driver.startShift();

    const weekOne = boot(new MemoryStorage());
    weekOne.driver.startShift();

    expect(two.driver.schedule().arrivals.length).toBeGreaterThan(0);
    expect(two.driver.schedule().arrivals)
      .not.toEqual(weekOne.driver.schedule().arrivals);
  });

  it('carries what the shop declared, and rebuilds what it did not', () => {
    const { two } = twoWeeks();

    // CARRIED: the note by the socket. Facilities came with a marker and did
    // not come back to take it off, which is the whole of D-E11-1.
    expect(fieldOf(two, NOTE.node, NOTE.field)).toBe(true);
    // CARRIED: the toy on the machine, which is app state rather than world
    // state and rides the arrival record for exactly that reason.
    expect(two.appState.get().installed.apps).toContain(A_TOY);

    // REBUILT: the day meters and the week's own record. A whitelist that
    // carried the world wholesale would pass every assertion above and fail
    // every one of these - which is why they are in the same test.
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.reviewOutcome))
      .toBe('pending');
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.weekEnded)).toBeFalsy();
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.stress)).toBe(0);
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.suspicion)).toBe(0);
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.conductFile)).toBeFalsy();
    // And the queue: week one's tickets are not standing in week two's world.
    // The pile on the desk is the one this Monday deals.
    expect(two.engine.graph.nodesOfKind('ticket').every(
      (ticket) => (ticket.fields[FIELDS.state] ?? 'open') !== 'resolved',
    )).toBe(true);
  });

  it('carries the career: the standing, the title and the fund', () => {
    const storage = new MemoryStorage();
    const one = boot(storage);
    playAWeek(one);
    const earned = fieldOf(one, COMPANY_IDS.player, FIELDS.reputation);
    const banked = fieldOf(one, COMPANY_IDS.player, FIELDS.farmFund);

    expect(one.session.stayAnotherWeek().ok).toBe(true);

    const two = boot(storage);

    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.reputation)).toBe(earned);
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.farmFund)).toBe(banked);
    // A fresh probationer does not stand up at what a worked week earned: the
    // carry is what makes the two different.
    const fresh = createWorldSession(FIRST_WEEK).engine;
    expect(fresh.graph.getField(COMPANY_IDS.player, FIELDS.reputation))
      .not.toBe(earned);
  });

  /**
   * The 0.31.0 defect class, one version on and now reachable.
   *
   * A save carries a world; the week beside it is resolved from the employer,
   * the attempt and the arc position. Before week two existed, all three of
   * those had one answer and a load could not get it wrong. Now the third one
   * moves, and a load that resolved the week from the employer alone would put
   * the player's Wednesday morning into week one - with nothing thrown, and a
   * queue nobody had been dealt.
   */
  it('a save taken in week two reloads INTO week two', () => {
    const { two } = twoWeeks();

    two.driver.startShift();
    runTo(two, shiftStartTick(1) + 120);
    // The Monday of week two, as the queue screen reads it, before the save.
    const mondayOfWeekTwo = two.driver.schedule().arrivals;
    expect(two.session.save().ok).toBe(true);

    // The world is moved first, so a load that did nothing cannot pass.
    runTo(two, shiftEndTick(1));
    two.driver.clockOff();
    two.driver.startShift();
    runTo(two, shiftStartTick(2) + 60);
    expect(two.driver.day()).toBe(2);

    const loaded = two.session.load();
    expect(loaded.ok, loaded.ok ? '' : loaded.reason).toBe(true);
    expect(two.driver.day()).toBe(1);
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(2);
    // The day the driver deals after the load is the day it dealt before it.
    // The load re-points the driver at the week the file's WORLD is in, and
    // resolving it from the employer alone - which is what every load did
    // before 0.31.0 built the seam - would hand this Monday week one's.
    expect(two.driver.schedule().arrivals).toEqual(mondayOfWeekTwo);

    const weekOne = boot(new MemoryStorage());
    weekOne.driver.startShift();
    expect(two.driver.schedule().arrivals)
      .not.toEqual(weekOne.driver.schedule().arrivals);
  });

  /**
   * And the same round trip through the MIGRATION, which is the 0.31.0
   * guarantee extended rather than restated.
   *
   * A schema-4 file carries no estate delta, so the 4 -> 5 step invents the
   * only honest one: empty. The question this asks is whether that step can
   * lose the WEEK on its way past - and the answer has to be no for a reason
   * that is worth stating, because it is the whole architecture of the seam:
   * the week is resolved from the world (the employer the file names, plus the
   * attempt and the arc position off the restored player node), never from the
   * file's own fields. Strip the delta and the week is still in the graph.
   */
  it('a schema-4 file lands in its own week, delta or no delta', () => {
    const { two } = twoWeeks();

    two.driver.startShift();
    runTo(two, shiftStartTick(1) + 120);
    const mondayOfWeekTwo = two.driver.schedule().arrivals;
    expect(two.session.save().ok).toBe(true);

    const raw = two.slot.readRaw() ?? '';
    const file = JSON.parse(raw) as Record<string, unknown>;
    // Whatever this build writes today - the point of the case is the file it
    // is wound back TO, and a literal here made a schema bump look like a
    // week-two defect (0.38.1).
    expect(file.schema).toBe(SAVE_SCHEMA);
    // Wind it back to what a build before this version would have written.
    delete file.carried;
    two.slot.writeRaw(JSON.stringify({ ...file, schema: 4 }));

    // Move the world first, so a load that did nothing cannot pass.
    runTo(two, shiftEndTick(1));
    two.driver.clockOff();
    two.driver.startShift();
    expect(two.driver.day()).toBe(2);

    const loaded = two.session.load();
    expect(loaded.ok, loaded.ok ? '' : loaded.reason).toBe(true);
    expect(two.driver.day()).toBe(1);
    expect(fieldOf(two, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(2);
    expect(two.driver.schedule().arrivals).toEqual(mondayOfWeekTwo);
  });

  /**
   * And the fifth week, because two is a number a bug can hard-code.
   *
   * A career that stays four times over must land on week five, and every week
   * of it must be its own week. This is also the first thing in the project
   * that reaches the arc positions the redundancy round fires in.
   */
  it('keeps climbing: four stays land on week five, all of them different', () => {
    const storage = new MemoryStorage();
    const seen: string[] = [];

    for (let week = 1; week <= 5; week += 1) {
      const world = boot(storage);
      expect(fieldOf(world, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(week);
      world.driver.startShift();
      seen.push(JSON.stringify(world.driver.schedule().arrivals));

      if (week < 5) {
        playAWeek(world);
        expect(world.driver.reviewOutcome()).toBe('passed');
        expect(world.session.stayAnotherWeek().ok).toBe(true);
      }
    }

    expect(new Set(seen).size).toBe(seen.length);
  }, 120_000);
});

describe('the doors that are not there', () => {
  it('refuses a week that is not over', () => {
    const world = boot(new MemoryStorage());
    const refused: SaveOutcome = world.session.stayAnotherWeek();

    expect(refused.ok).toBe(false);
    expect(world.restarts()).toBe(0);
    expect(world.switchSlot.peek()).toBeNull();
  });

  it('refuses a firing: they have taken the desk back', () => {
    const world = boot(new MemoryStorage());
    idleAWeek(world);

    expect(world.driver.reviewOutcome()).toBe('fired');

    const refused = world.session.stayAnotherWeek();
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('lanyard');
    expect(world.restarts()).toBe(0);
  });

  it('refuses the last week of the arc: that is how long the job is', () => {
    const storage = new MemoryStorage();
    const arc = employerFor('workgrumble').arc;
    // Arriving at the last week the way the shell arrives at any week: a record
    // in storage, read by the boot.
    new SwitchSlot(storage).write({
      employer: 'workgrumble',
      career: {
        reputation: 70,
        title: 'IT Support Technician',
        farmFund: 40_000,
        trail: null,
        tier: 'service_desk',
      },
      arcWeek: arc.weeks,
    });

    const world = boot(storage);
    expect(fieldOf(world, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(arc.weeks);

    playAWeek(world);

    const refused = world.session.stayAnotherWeek();
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason)
      .toContain(`${String(arc.weeks)} is how long`);
    // And the offer is still there, which is what week ten leads to.
    expect(world.session.switchEmployer().ok).toBe(true);
  });

  /**
   * A save from before the re-time, at a week this arc no longer has.
   *
   * 0.41.0 took the arc from twelve weeks to ten, so a career carried over
   * from 0.40.0 can hold an `arcWeek` of eleven or twelve - a week that is now
   * PAST the end of the job it belongs to. There is no migration for it and
   * there should not be one: `arcWeek` has never been clamped to the arc (the
   * generator is gated out to week 564 for exactly this reason), so the honest
   * behaviour is the one every other post-decision week already has. The week
   * boots, the generator draws it, the season is quiet because the round was
   * decided in week eight, and the only door out is the offer.
   *
   * The failure this forbids is the tempting fix: a loader that refuses or
   * clamps an `arcWeek` past `arc.weeks` would turn somebody's carried save
   * into a boot error or silently move them backwards two weeks into a job
   * they had finished.
   */
  it('boots a carried save from a week the shortened arc no longer has', () => {
    const storage = new MemoryStorage();
    // Twelve: the last week a 0.40.0 career could be sitting on when this
    // version replaced it.
    const carried = 12;

    new SwitchSlot(storage).write({
      employer: 'workgrumble',
      career: {
        reputation: 70,
        title: 'IT Support Technician',
        farmFund: 40_000,
        trail: null,
        tier: 'service_desk',
      },
      arcWeek: carried,
    });

    const world = boot(storage);

    expect(carried).toBeGreaterThan(employerFor('workgrumble').arc.weeks);
    expect(fieldOf(world, COMPANY_IDS.player, FIELDS.arcWeek)).toBe(carried);

    // Buildable and dealt, not a special case: a full week plays out of it.
    playAWeek(world);

    // Quiet, because the round was decided and closed two weeks before this.
    expect(world.session.stayAnotherWeek().ok).toBe(false);
    expect(world.session.switchEmployer().ok).toBe(true);
  });

  /**
   * The switch, untouched, proven from the other side.
   *
   * 0.6.0's transition may not have changed meaning: taking the offer is a
   * FRESH probation at the next shop, so the arc position resets and nothing of
   * this building crosses the threshold - not the note by the socket, not the
   * toy on the machine.
   */
  it('a switch is still a fresh probation, with none of this estate on it', () => {
    const storage = new MemoryStorage();
    const one = boot(storage);
    playAWeek(one, leaveAMarkOnTheBuilding);

    expect(one.session.switchEmployer().ok).toBe(true);

    const record = one.switchSlot.peek();
    expect(record?.employer).toBe('bodgeworth');
    expect(record?.arcWeek).toBeUndefined();
    expect(record?.estate).toBeUndefined();
    expect(record?.installed).toBeUndefined();

    const two = boot(storage);
    expect(two.carry.arcWeek).toBe(1);
    expect(two.appState.get().installed.apps).toEqual([]);
  });
});
