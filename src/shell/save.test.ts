import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { createWorldSession, WORLD_SEED } from '../world/session';
import { AppStateStore } from './app-state';
import { DayDriver } from './day-driver';
import {
  createShellSession,
  OLDEST_READABLE_SCHEMA,
  parseSaveFile,
  PRE_RELEASE_SAVE_REASON,
  SAVE_SCHEMA,
  SaveSlot,
  type ShellSessionApi,
} from './save';

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
}

function session(storage: MemoryStorage = new MemoryStorage()): Session {
  const { engine } = createWorldSession();
  const appState = new AppStateStore();
  const driver = new DayDriver(engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });
  const slot = new SaveSlot(storage);

  return {
    engine,
    appState,
    driver,
    storage,
    // The shipped wiring, not a copy of it.
    session: createShellSession({ engine, appState, day: driver, slot }),
  };
}

/** Half a day's work: a shift started, a ticket closed, some reading done. */
function workUntilMidday(live: Session): void {
  live.driver.startShift();
  live.driver.setSpeed(2);
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

    const raw = live.storage.getItem('it-career-sim/save');

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
      fresh.storage.setItem('it-career-sim/save', JSON.stringify(broken));

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
    older.storage.setItem('it-career-sim/save', raw);

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
});
