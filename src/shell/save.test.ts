import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { employerFor, FIRST_EMPLOYER } from '../world/employers';
import { FIELDS } from '../world/fields';
import {
  createWorldSession,
  FIRST_WEEK,
  seedForAttempt,
  type WeekCarry,
} from '../world/session';
import { spawnWorldTicket } from '../world/tickets';
import { noHelloOn } from '../world/week';
import { shiftStartTick } from '../world/day';
import { acknowledgeCarry, carryFrom, RetrySlot } from './retry';
import { SwitchSlot } from './switch';
import { AppStateStore } from './app-state';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import {
  createShellSession,
  OLDEST_READABLE_SCHEMA,
  parseSaveFile,
  PRE_RELEASE_SAVE_REASON,
  SAVE_SCHEMA,
  SaveSlot,
  type ShellSessionApi,
} from './save';
import { BUILD_VERSION } from '../shared/build';

beforeAll(() => {
  loadEngineForTests();
});

/** A `Storage` that lives in a Map. The browser's is not on trial here. */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  /** Set to refuse every write, the way a full quota does. */
  public sealed = false;

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    if (this.sealed) {
      throw new DOMException('QuotaExceededError');
    }

    this.entries.set(key, value);
  }
}

interface Session {
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
  readonly driver: DayDriver;
  readonly session: ShellSessionApi;
  readonly storage: MemoryStorage;
  readonly retry: RetrySlot;
  readonly switch: SwitchSlot;
  /** How many times the session asked the shell to start over. */
  readonly restarts: () => number;
  /** The employer a LOAD last stood up, as the shell heard about it. */
  readonly loadedEmployer: () => string | null;
}

function session(
  storage: MemoryStorage = new MemoryStorage(),
  carry: Readonly<WeekCarry> = FIRST_WEEK,
  /** The wall clock the save stamps itself with, when a test cares. */
  now?: () => number,
): Session {
  const { engine, seed } = createWorldSession(carry);
  // The employer content threaded exactly as `main.ts` threads it off the
  // session - so this helper boots the driver at the shop the carry names, not
  // the probation default. For a FIRST_WEEK carry that IS probation; for a
  // Bodgeworth carry it is Bodgeworth's week and rooms.
  const employer = employerFor(carry.employer);
  const appState = new AppStateStore();
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  }, undefined, employer.week, employer.channels, employer.runsBossPings);
  const slot = new SaveSlot(storage);
  const retry = new RetrySlot(storage);
  const switchSlot = new SwitchSlot(storage);
  let restarts = 0;
  let loadedEmployer: string | null = null;

  return {
    engine,
    appState,
    driver,
    storage,
    retry,
    switch: switchSlot,
    restarts: () => restarts,
    loadedEmployer: () => loadedEmployer,
    // The shipped wiring, not a copy of it.
    session: createShellSession({
      engine,
      appState,
      day: driver,
      slot,
      retry,
      switch: switchSlot,
      actor: COMPANY_IDS.player,
      employer: employer.id,
      onEmployerRestored: (id) => {
        loadedEmployer = id;
      },
      // The shipped preflight, not a copy of it: a save is tried in a session
      // nobody is playing before it replaces the one somebody is.
      probeEngine: () => new WasmEngine(seed),
      restart: () => {
        restarts += 1;
      },
      ...(now === undefined ? {} : { now }),
    }),
  };
}

/**
 * Runs a session's clock to a tick, a minute at a time.
 *
 * A minute at a time rather than in hours, because everything this is used for
 * is a beat with a window on it: a step of sixty minutes lands past every one
 * of them and reports a world in which nothing ever happened.
 */
function runTo(live: Session, tick: number): void {
  live.driver.setSpeed(1);

  while (live.engine.now() < tick && live.driver.state() !== 'day_end') {
    live.driver.step(TICK_INTERVAL_MS);
  }
}

/** Half a day's work: a shift started, a ticket closed, some reading done. */
function workUntilMidday(live: Session): void {
  live.driver.startShift();
  live.driver.setSpeed(2);
  spawnWorldTicket(live.engine, 'ticket:fan-noise');
  live.driver.step(60_000);

  expect(
    live.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      'ticket:fan-noise',
      {
          reported: 'It makes a noise like a bag of spanners.',
          tried: 'Turned it off and on again',
        },
    ),
  ).toEqual({ ok: true });

  live.appState.patch('mail', {
    selectedId: 'mail/queue-nag',
    read: ['mail/queue-nag'],
  });
  live.appState.patch('kb', { selectedId: 'kb/print-spooler' });
  live.appState.patch('chat', {
    selectedId: COMPANY_IDS.ada,
    threads: {
      [COMPANY_IDS.ada]: {
        nodeId: 'friday',
        rootUsed: 'root',
        ended: false,
        lines: [{ who: 'them', text: 'I have been hacked.' }],
      },
    },
  });
  live.driver.setPaused(true);
}

describe('the save file', () => {
  /**
   * The gate a mid-day save exists for: the same world, the same day, the same
   * screens. A round trip that only proves the JSON parses would let a load
   * put the player in a world that merely resembles the one they left.
   */
  it('takes a mid-day session back to exactly where it was', () => {
    const live = session();
    workUntilMidday(live);

    const hash = live.engine.snapshotHash();
    const tick = live.engine.now();
    const log = live.engine.dispatchLog();
    const screens = live.appState.snapshot();

    expect(live.session.save()).toEqual({ ok: true, value: undefined });
    expect(live.session.hasSave()).toBe(true);

    // A different session entirely: a fresh world, at 08:00, having read
    // nothing and done nothing.
    const loaded = session(live.storage);
    expect(loaded.engine.snapshotHash()).not.toBe(hash);
    expect(loaded.session.load()).toEqual({ ok: true, value: undefined });

    expect(loaded.engine.snapshotHash()).toBe(hash);
    expect(loaded.engine.now()).toBe(tick);
    expect(loaded.engine.dispatchLog()).toEqual(log);
    expect(loaded.driver.day()).toBe(live.driver.day());
    expect(loaded.driver.state()).toBe('shift');
    expect(loaded.appState.snapshot()).toEqual(screens);
    expect(loaded.driver.paused()).toBe(true);
    expect(loaded.driver.speed()).toBe(2);
    expect(loaded.engine.ticketState('ticket:fan-noise')).toBe('resolved');

    // And it is a live session, not a photograph: it keeps playing from here.
    loaded.driver.setPaused(false);
    loaded.driver.step(60_000);
    expect(loaded.engine.now()).toBe(tick + 120);
  });

  /**
   * A save taken while somebody is still typing, and a load that comes back
   * into the middle of it.
   *
   * The typing indicator is the one surface in this game with NO stored state
   * behind it: `day.typing()` is arithmetic on the week's own table and the
   * clock, which is the whole safety claim for deriving it rather than
   * remembering it. That claim is cheap to make and easy to be wrong about -
   * the obvious implementation is a countdown somebody starts, and a countdown
   * somebody starts is a countdown a reload restarts, resets or loses.
   *
   * So it is walked: stop mid-greeting with minutes still owed, save, load
   * into a session that has never had a Monday, and ask again. Same minutes
   * left, same line, on a driver that was built five seconds ago and has been
   * told nothing about anybody's chat window.
   */
  it('comes back into the middle of somebody still typing', () => {
    const live = session();
    live.driver.startShift();

    // Monday's greeting, and one minute into the wait: `noHelloOn` is the
    // week's own table rather than a number typed here, so a row that moves
    // moves this with it.
    const slot = noHelloOn(1)[0];
    expect(slot).toBeDefined();

    const said = shiftStartTick(1) + ((slot?.minute ?? 0) - 9 * 60);
    runTo(live, said + 1);

    const waiting = live.driver.typing(slot?.speaker ?? '');
    expect(waiting).not.toBeNull();
    expect(waiting?.minutesLeft).toBe((slot?.typingMinutes ?? 0) - 1);

    live.driver.setPaused(true);
    expect(live.session.save()).toEqual({ ok: true, value: undefined });

    const loaded = session(live.storage);
    // Nobody is typing at a session that has not started a shift, which is
    // what makes the assertion after the load a claim about the load.
    expect(loaded.driver.typing(slot?.speaker ?? '')).toBeNull();
    expect(loaded.session.load()).toEqual({ ok: true, value: undefined });

    expect(loaded.engine.now()).toBe(live.engine.now());
    expect(loaded.driver.typing(slot?.speaker ?? '')).toEqual(waiting);

    // And it carries on counting from there rather than starting again: one
    // more minute is one fewer owed, on the restored session.
    loaded.driver.setPaused(false);
    runTo(loaded, said + 2);
    expect(loaded.driver.typing(slot?.speaker ?? '')?.minutesLeft)
      .toBe((slot?.typingMinutes ?? 0) - 2);
  });

  /**
   * The day boundary is where the log is drained, so a save taken there
   * carries a baseline and no history at all - which is the whole point of the
   * checkpoint policy, seen from the save.
   */
  it('carries a checkpoint and an empty log across a day boundary', () => {
    const live = session();
    live.driver.startShift();
    live.driver.setSpeed(4);
    live.driver.step(1_000 * 480);
    expect(live.driver.state()).toBe('day_end');

    live.driver.clockOff();
    expect(live.engine.dispatchLog()).toEqual([]);
    expect(live.session.save()).toEqual({ ok: true, value: undefined });

    const loaded = session(live.storage);
    expect(loaded.session.load()).toEqual({ ok: true, value: undefined });

    expect(loaded.driver.day()).toBe(2);
    expect(loaded.driver.state()).toBe('morning_brief');
    expect(loaded.engine.dispatchLog()).toEqual([]);
    expect(loaded.engine.logCheckpoint()).toEqual({
      tick: 1_440,
      hash: loaded.engine.snapshotHash(),
      entries: 0,
    });
    expect(loaded.engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBe(live.engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund));
  });

  it('says there is nothing to load rather than pretending', () => {
    const live = session();
    expect(live.session.hasSave()).toBe(false);

    const outcome = live.session.load();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain('no saved game');
  });

  /**
   * A save that will not write is a sentence, not an exception. The player
   * asked the game to keep their day; taking the tab down instead is the
   * worst possible answer.
   */
  it('reports a storage that will not take it', () => {
    const live = session();
    live.storage.sealed = true;

    const outcome = live.session.save();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain('Storage is full');
  });

  /**
   * Anything on the machine can have edited this file. Every one of these
   * leaves the running session untouched - the player loses a click, not the
   * day they were in.
   */
  it('refuses a file that is damaged, foreign, or from the future', () => {
    const live = session();
    workUntilMidday(live);
    live.session.save();

    const raw = live.storage.getItem('workgrumble/save');

    if (raw === null) {
      throw new Error('The save was not written.');
    }

    const file = JSON.parse(raw) as Record<string, unknown>;
    expect(parseSaveFile(raw).ok).toBe(true);
    expect(file.schema).toBe(SAVE_SCHEMA);

    const damaged: Record<string, unknown>[] = [
      { ...file, schema: SAVE_SCHEMA + 1 },
      { ...file, schema: 'one' },
      { ...file, engine: '' },
      { ...file, engine: '{"version":"0.0.1"}' },
      { ...file, app: { chat: 'gone' } },
      { ...file, driver: { paused: false, speed: 3 } },
      { ...file, savedAtTick: -1 },
    ];

    for (const broken of damaged) {
      const fresh = session();
      const before = fresh.engine.snapshotHash();
      fresh.storage.setItem('workgrumble/save', JSON.stringify(broken));

      const outcome = fresh.session.load();
      expect(outcome.ok, JSON.stringify(broken.schema)).toBe(false);
      expect(fresh.engine.snapshotHash()).toBe(before);
      expect(fresh.driver.state()).toBe('morning_brief');
      expect(fresh.driver.paused()).toBe(false);
    }

    expect(parseSaveFile('{ not json').ok).toBe(false);
    expect(parseSaveFile('[]').ok).toBe(false);
    expect(parseSaveFile('42').ok).toBe(false);
  });

  /**
   * The migration seam, and the file it refuses.
   *
   * The fixture is a REAL schema-1 save, captured from the build that wrote
   * them (`10aa005`) and committed alongside this test - not a current payload
   * relabelled, which would prove nothing, because the whole problem is what
   * is INSIDE the engine payload. That world has no meters on the player node
   * and no meter, boss, consumable or triage verbs in its registry: restoring
   * it succeeds and then the day stops moving, one refused action at a time.
   */
  it('refuses a save from before the shift had any pressure in it', () => {
    const raw = readFileSync(
      new URL('./fixtures/save-schema-1.json', import.meta.url),
      'utf8',
    );
    const file = JSON.parse(raw) as Record<string, unknown>;

    // The fixture is what it claims to be, and the reasons it cannot be
    // migrated are visible in it rather than taken on trust.
    expect(file.schema).toBe(1);
    const payload = JSON.parse(String(file.engine)) as {
      graph: { nodes: { id: string; fields: Record<string, unknown> }[] };
      registry: { actions: { id: string }[] };
    };
    const player = payload.graph.nodes.find(
      (node) => node.id === COMPANY_IDS.player,
    );
    expect(player?.fields[FIELDS.stress]).toBeUndefined();
    expect(player?.fields[FIELDS.suspicion]).toBeUndefined();
    const verbs = new Set(payload.registry.actions.map((action) => action.id));
    expect(verbs.has(DAY_ACTIONS.metersTick)).toBe(false);
    expect(verbs.has(HELPDESK_ACTIONS.ticketClassify)).toBe(false);

    const older = session();
    const before = older.engine.snapshotHash();
    older.storage.setItem('workgrumble/save', raw);

    const outcome = older.session.load();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason)
      .toBe(PRE_RELEASE_SAVE_REASON);

    // Refused whole: the session the player was in is exactly as it was, and
    // no half of that file reached the world or the screens.
    expect(older.engine.snapshotHash()).toBe(before);
    expect(older.engine.now()).toBe(0);
    expect(older.driver.state()).toBe('morning_brief');
    expect(older.appState.snapshot()).toEqual(new AppStateStore().snapshot());

    // And the seam itself is still a seam: the parser reads the schema, says
    // which one it will not take, and takes the current one.
    expect(parseSaveFile(JSON.stringify({ ...file, schema: 0 })).ok).toBe(false);
    expect(OLDEST_READABLE_SCHEMA).toBeLessThanOrEqual(SAVE_SCHEMA);
  });

  /**
   * The stamp the badge sync is decided on, and the migration that gives one
   * to files written before there was anything to decide.
   *
   * Everything about the cloud copy hangs on `savedAt` being a real wall clock
   * from the machine that wrote the file. The simulation tick cannot do this
   * job and it is worth saying why in a test rather than only in a comment: it
   * restarts at zero every Monday and goes BACKWARDS on a retry, so a week
   * played to Thursday on one machine and restarted on another would hand the
   * argument to whichever copy happened to be further into its day.
   */
  it('stamps a save with the wall clock and the build that wrote it', () => {
    const at = 1_764_500_000_000;
    const live = session(new MemoryStorage(), FIRST_WEEK, () => at);
    workUntilMidday(live);
    live.session.save();

    const raw = live.storage.getItem('workgrumble/save') ?? '';
    const file = parseSaveFile(raw);

    expect(file.ok).toBe(true);
    expect(file.ok && file.value.savedAt).toBe(at);
    expect(file.ok && file.value.version).toBe(BUILD_VERSION);
    // The two clocks are different clocks and neither stands in for the other.
    expect(file.ok && file.value.savedAtTick).not.toBe(at);
  });

  it('refuses a save whose wall clock is not one', () => {
    const live = session();
    live.session.save();
    const file = JSON.parse(live.storage.getItem('workgrumble/save') ?? '{}') as
      Record<string, unknown>;

    const damagedStamps: Record<string, unknown>[] = [
      { ...file, savedAt: undefined },
      { ...file, savedAt: -1 },
      { ...file, savedAt: 'yesterday' },
      { ...file, savedAt: 1.5 },
      { ...file, version: 7 },
    ];

    for (const broken of damagedStamps) {
      expect(parseSaveFile(JSON.stringify(broken)).ok, JSON.stringify(broken))
        .toBe(false);
    }
  });

  /**
   * A schema-2 file has a complete, playable world in it and is missing only
   * the two facts the sync added, so it is migrated rather than refused - and
   * the stamp it is given is ZERO rather than "now".
   *
   * That is the whole assertion. A file written before this build existed
   * cannot have been written after one that was, and a migration that filled
   * in the current time would let a stale copy in this browser beat the badge's
   * own - silently, once, at the worst possible moment.
   */
  it('brings a schema-2 save forward with a stamp of zero', () => {
    const live = session();
    workUntilMidday(live);
    live.session.save();

    const current = JSON.parse(live.storage.getItem('workgrumble/save') ?? '{}') as
      Record<string, unknown>;
    const older: Record<string, unknown> = { ...current, schema: 2 };
    delete older.savedAt;
    delete older.version;

    const migrated = parseSaveFile(JSON.stringify(older));

    expect(migrated.ok).toBe(true);
    expect(migrated.ok && migrated.value.savedAt).toBe(0);
    expect(migrated.ok && migrated.value.version).toBeNull();
    // And it is still the same world: a migration that lost the day would be
    // a refusal with extra steps.
    expect(migrated.ok && migrated.value.savedAtTick).toBe(current.savedAtTick);

    const fresh = session();
    fresh.storage.setItem('workgrumble/save', JSON.stringify(older));
    expect(fresh.session.load().ok).toBe(true);
    expect(fresh.engine.snapshotHash()).toBe(live.engine.snapshotHash());
  });

  /**
   * The employer stamp (0.6.0). The career stats ride the engine payload; the
   * employer's IDENTITY is the one fact a reload needs that the graph does not
   * carry, so a save says which company it is a week at - and a file from before
   * the switch existed is a week at the first, the only one it could have been.
   */
  it('stamps a save with its employer and gives an older file the first one', () => {
    const live = session();
    live.session.save();

    const written = parseSaveFile(live.storage.getItem('workgrumble/save') ?? '');
    expect(written.ok && written.value.employer).toBe(FIRST_EMPLOYER);

    // A schema-3 file has no employer on it at all; the migration is the whole
    // back-compat rule, and if it stops writing the default a load has no
    // company to resume. Reverting the 3 -> 4 step fails this.
    const current = JSON.parse(live.storage.getItem('workgrumble/save') ?? '{}') as
      Record<string, unknown>;
    const older: Record<string, unknown> = { ...current, schema: 3 };
    delete older.employer;

    const migrated = parseSaveFile(JSON.stringify(older));
    expect(migrated.ok && migrated.value.employer).toBe(FIRST_EMPLOYER);
    expect(migrated.ok && migrated.value.schema).toBe(SAVE_SCHEMA);
  });

  /**
   * The hole the malformed-engine cases above cannot reach.
   *
   * Every "foreign" file in this suite so far is a broken engine STRING, and
   * the engine's own restore refuses those atomically. This one is not broken:
   * it is a structurally valid engine-0.4 world, wrapped as a current-schema
   * save, that simply is not this game's - the player node has no day state on
   * it. `engine.restore` accepts that happily, because coherence is all it
   * checks and the world IS coherent; the driver is the half that asks the
   * Workgrumble questions, and it used to ask them AFTER the running session
   * had already been replaced, outside the catch, in a click handler.
   *
   * Built by taking a real save and deleting one field, so it is exactly as
   * valid as the engine can tell and exactly as unplayable as it is.
   */
  it('refuses a valid foreign world that is missing the player invariants', () => {
    const source = session();
    workUntilMidday(source);
    source.session.save();
    const raw = source.storage.getItem('workgrumble/save');

    if (raw === null) {
      throw new Error('The save was not written.');
    }

    const file = JSON.parse(raw) as Record<string, unknown>;
    const payload = JSON.parse(String(file.engine)) as {
      graph: { nodes: { id: string; fields: Record<string, unknown> }[] };
    };
    const player = payload.graph.nodes.find(
      (node) => node.id === COMPANY_IDS.player,
    );

    if (player === undefined) {
      throw new Error('The save has no player in it to spoil.');
    }

    delete player.fields[FIELDS.dayState];
    const foreign = JSON.stringify({
      ...file,
      engine: JSON.stringify(payload),
    });

    // It really is a world the engine is happy with, which is the whole point.
    const probe = new WasmEngine(seedForAttempt(1));
    expect(() => {
      probe.restore(JSON.stringify(payload));
    }).not.toThrow();

    const live = session();
    workUntilMidday(live);
    const before = {
      hash: live.engine.snapshotHash(),
      tick: live.engine.now(),
      state: live.driver.state(),
      speed: live.driver.speed(),
      screens: live.appState.snapshot(),
    };
    live.storage.setItem('workgrumble/save', foreign);

    const outcome = live.session.load();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason)
      .toContain('That save would not load');

    // The session the player was in, untouched: world, clock, day and screens.
    expect(live.engine.snapshotHash()).toBe(before.hash);
    expect(live.engine.now()).toBe(before.tick);
    expect(live.driver.state()).toBe(before.state);
    expect(live.driver.speed()).toBe(before.speed);
    expect(live.appState.snapshot()).toEqual(before.screens);
  });
});

/* -- the week that survives a firing -------------------------------------- */

describe('the carry-over a firing leaves behind', () => {
  /**
   * The fund is the joke the whole game hangs on, so the moment it exists in
   * exactly one place is the moment worth testing.
   *
   * Boot used to read the retry slot and CLEAR it, then build the week. A
   * refresh, a crash or a shut laptop between that read and the first day
   * boundary came back as attempt one with nothing banked - which is not a lost
   * session, it is the one thing a firing is not allowed to take.
   */
  it('survives a refresh taken the instant the new week boots', () => {
    const storage = new MemoryStorage();
    const slot = new RetrySlot(storage);
    expect(slot.write({
      attempt: 2,
      farmFund: 41_000,
      kbSelected: null,
      arcWeek: 1,
      employer: 'workgrumble',
    }))
      .toEqual({ ok: true, value: undefined });

    // Boot, as `main.ts` boots: peek, build, save, and only then let go.
    const carried = slot.peek();
    expect(carried).not.toBeNull();
    const booted = session(storage, carryFrom(carried ?? {
      attempt: 1,
      farmFund: 0,
      kbSelected: null,
      arcWeek: 1,
      employer: 'workgrumble',
    }));
    expect(acknowledgeCarry(slot, () => booted.session.save())).toBe(true);

    // The refresh: nothing of that session survives except what is in storage.
    expect(slot.peek()).toBeNull();
    const afterRefresh = session(storage);
    expect(afterRefresh.session.load()).toEqual({ ok: true, value: undefined });

    expect(
      afterRefresh.engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund),
    ).toBe(41_000);
    expect(
      afterRefresh.engine.graph.getField(COMPANY_IDS.player, FIELDS.weekAttempt),
    ).toBe(2);
  });

  /** And a browser that cannot keep the save keeps the carry-over instead. */
  it('holds on to the record when the new week could not be written', () => {
    const storage = new MemoryStorage();
    const slot = new RetrySlot(storage);
    slot.write({
      attempt: 3,
      farmFund: 900,
      kbSelected: null,
      arcWeek: 1,
      employer: 'workgrumble',
    });

    const booted = session(storage, { farmFund: 900, attempt: 3 });
    storage.sealed = true;

    expect(acknowledgeCarry(slot, () => booted.session.save())).toBe(false);
    storage.sealed = false;
    // Still there, so the next boot is asked the same question rather than
    // quietly starting a first week with an empty fund.
    expect(slot.peek()?.farmFund).toBe(900);
    expect(slot.peek()?.attempt).toBe(3);
  });

  /**
   * A save taken during attempt two, reloaded into a boot that knows nothing
   * about it.
   *
   * The engine restores the right world; the DRIVER was built beside it with
   * attempt one's seed, and a save carries only pause and speed - so the day
   * it picked back up dripped its tickets on attempt one's minutes and walked
   * the lead round attempt one's rounds, in a world the player had reached on
   * attempt two. The seed is derived from the world now, which is the half
   * that survives a load.
   */
  it('picks a reloaded second attempt back up on its own schedule', () => {
    const storage = new MemoryStorage();
    const live = session(storage, { farmFund: 0, attempt: 2 });
    live.driver.startShift();
    live.driver.step(60_000 * 3);
    expect(live.session.save()).toEqual({ ok: true, value: undefined });

    const schedule = live.driver.schedule();
    const hash = live.engine.snapshotHash();

    // The refresh: no retry record left, so boot builds a FIRST week.
    const afterRefresh = session(storage);
    expect(afterRefresh.driver.schedule().arrivals.map((one) => one.tick))
      .not.toEqual(schedule.arrivals.map((one) => one.tick));

    expect(afterRefresh.session.load()).toEqual({ ok: true, value: undefined });

    expect(afterRefresh.engine.snapshotHash()).toBe(hash);
    // The queue it is going to deal is attempt two's, minute for minute.
    expect(afterRefresh.driver.schedule().arrivals)
      .toEqual(schedule.arrivals);

    // And the rest of the day plays out identically, boss included.
    live.driver.step(60_000 * 120);
    afterRefresh.driver.step(60_000 * 120);
    expect(afterRefresh.engine.snapshotHash()).toBe(live.engine.snapshotHash());
    expect(afterRefresh.driver.boss()).toEqual(live.driver.boss());
    expect(seedForAttempt(2)).not.toBe(seedForAttempt(1));
  });

  /**
   * A save taken at the SECOND employer reloads STILL at the second employer
   * (0.6.0, P1-1).
   *
   * The bug this forbids: a save carries which employer its world is at, and
   * `load` restored the graph but never applied the employer - so a Bodgeworth
   * save opened in a tab booted at probation kept the probation week, rooms and
   * policy over a Bodgeworth estate. The probation week deals `ticket:fan-noise`
   * on the Monday, whose `service:chassis-fan` node Bodgeworth does not have, so
   * it does not just draw the wrong rooms - it crashes the day. Driven through
   * the real save -> load path: a shell session saved at Bodgeworth, reloaded by
   * a DIFFERENT shell session booted at the probation shop.
   */
  it('reloads a second-employer save STILL at the second employer', () => {
    const storage = new MemoryStorage();

    // Stand Bodgeworth up, play a little, and save it.
    const bodge = session(storage, { farmFund: 0, attempt: 1, employer: 'bodgeworth' });
    bodge.driver.startShift();
    bodge.driver.step(60_000 * 3);
    expect(bodge.session.save()).toEqual({ ok: true, value: undefined });
    const bodgeHash = bodge.engine.snapshotHash();
    const bodgeRooms = bodge.driver.rooms().map((room) => room.id).sort();

    // A fresh boot that knows nothing about it: the PROBATION shop, booted at
    // its own week and its own rooms - the exact cross-employer load the bug
    // walked through.
    const reboot = session(storage);
    expect(reboot.driver.rooms().map((room) => room.id).sort())
      .not.toEqual(bodgeRooms);

    expect(reboot.session.load()).toEqual({ ok: true, value: undefined });

    // The world restored is Bodgeworth's, byte for byte.
    expect(reboot.engine.snapshotHash()).toBe(bodgeHash);
    // The DRIVER followed the save: it draws Bodgeworth's rooms now, not the
    // probation shop's it booted with, and it deals Bodgeworth's week - so its
    // channel feed is Bodgeworth's storm, not the probation shop's, and no
    // probation fan ticket is scheduled into an estate with no chassis fan.
    expect(reboot.driver.rooms().map((room) => room.id).sort()).toEqual(bodgeRooms);
    expect(reboot.driver.schedule().arrivals)
      .toEqual(bodge.driver.schedule().arrivals);
    const feed = reboot.driver.channelFeed(Number.MAX_SAFE_INTEGER);
    expect(feed.some((message) => message.id.startsWith('bodge:'))).toBe(true);
    // And the shell was told which shop it is now at, so the install policy the
    // audit reads and the name the offer prints follow the loaded save too.
    expect(reboot.loadedEmployer()).toBe('bodgeworth');
  });

  /**
   * And a save that names an employer this build never shipped is REFUSED, with
   * the session the player was in left running - not stood up as the wrong shop
   * (0.6.0, P1-1). Defaulting an unknown employer would be a silently wrong
   * game; the preflight catches it before the live world is touched.
   */
  it('refuses a save naming an employer this build does not ship', () => {
    const storage = new MemoryStorage();
    const live = session(storage);
    live.driver.startShift();
    expect(live.session.save()).toEqual({ ok: true, value: undefined });

    // Hand-edit the file to name a ghost shop.
    const slot = new SaveSlot(storage);
    const raw = slot.readRaw();
    expect(raw).not.toBeNull();
    const edited = JSON.stringify({
      ...(JSON.parse(raw!) as Record<string, unknown>),
      employer: 'a-shop-that-never-was',
    });
    slot.writeRaw(edited);

    const before = live.engine.snapshotHash();
    const outcome = live.session.load();
    expect(outcome.ok).toBe(false);
    // The running session is untouched: no half-loaded ghost world.
    expect(live.engine.snapshotHash()).toBe(before);
    expect(live.loadedEmployer()).toBeNull();
  });
});
