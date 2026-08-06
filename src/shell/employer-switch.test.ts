import { describe, expect, it } from 'vitest';

import { AppStateStore } from './app-state';
import { DayDriver } from './day-driver';
import { RetrySlot } from './retry';
import {
  createShellSession,
  parseSaveFile,
  SaveSlot,
  type ShellSessionApi,
} from './save';
import { carryForSwitch, type SwitchRecord, SwitchSlot } from './switch';
import { WasmEngine } from '../engine-api';
import { COMPANY_IDS } from '../world/company';
import { FIELDS, PLAYER_TIERS } from '../world/fields';
import { createWorldSession, FIRST_WEEK } from '../world/session';
import type { ReviewOutcome } from '../world/week';

/**
 * The employer switch, driven end to end on the SHIPPED session.
 *
 * The goal, not the call: it is not enough that `switchEmployer` returns ok. The
 * player has to ARRIVE - a second employer's world stood up, seeded from the
 * standing they left with, the fund unbroken - and that world is a graph, so the
 * assertions read the arriving graph rather than trusting the verb. The pre-
 * switch state is constructed by writing the review outcome and standing onto
 * the player node (the review verbs' job, out of scope here); everything from
 * the offer onwards is the real seam.
 */

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

interface Bench {
  readonly session: ShellSessionApi;
  readonly engine: WasmEngine;
  readonly slot: SaveSlot;
  readonly switchSlot: SwitchSlot;
  readonly restarts: () => number;
}

/** A first-employer session, wired the shipped way, over in-memory storage. */
function bench(storage: MemoryStorage = new MemoryStorage()): Bench {
  const { engine, seed } = createWorldSession(FIRST_WEEK);
  const wasm = engine as WasmEngine;
  const appState = new AppStateStore();
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });
  const slot = new SaveSlot(storage);
  const switchSlot = new SwitchSlot(storage);
  let restarts = 0;

  const session = createShellSession({
    engine,
    appState,
    day: driver,
    slot,
    retry: new RetrySlot(storage),
    switch: switchSlot,
    actor: COMPANY_IDS.player,
    probeEngine: () => new WasmEngine(seed),
    restart: () => {
      restarts += 1;
    },
  });

  return { session, engine: wasm, slot, switchSlot, restarts: () => restarts };
}

/** Writes the verdict and standing the Friday would have left on the player. */
function endWith(
  engine: WasmEngine,
  outcome: ReviewOutcome,
  standing: { reputation: number; title: string; farmFund: number },
): void {
  engine.applySetup([
    { op: 'setField', id: COMPANY_IDS.player, field: FIELDS.reviewOutcome, value: outcome },
    { op: 'setField', id: COMPANY_IDS.player, field: FIELDS.reputation, value: standing.reputation },
    { op: 'setField', id: COMPANY_IDS.player, field: FIELDS.title, value: standing.title },
    { op: 'setField', id: COMPANY_IDS.player, field: FIELDS.farmFund, value: standing.farmFund },
  ]);
}

function fieldOf(engine: WasmEngine, field: string): unknown {
  return engine.graph.getField(COMPANY_IDS.player, field);
}

describe('taking the offer and arriving', () => {
  it('carries a passed career into the second employer clean', () => {
    const b = bench();
    endWith(b.engine, 'passed', {
      reputation: 66,
      title: 'IT Support Technician',
      farmFund: 25_000,
    });

    const taken = b.session.switchEmployer();
    expect(taken.ok).toBe(true);
    expect(b.restarts()).toBe(1);
    // The save of a world nobody is going back to is thrown away.
    expect(b.slot.exists()).toBe(false);

    // The record that crossed the threshold: a clean pass, no trail, the
    // standing intact and pointed at the next employer.
    const record = b.switchSlot.peek();
    expect(record).not.toBeNull();
    expect(record?.employer).toBe('bodgeworth');
    expect(record?.career.trail).toBeNull();
    expect(record?.career.reputation).toBe(66);
    expect(record?.career.farmFund).toBe(25_000);

    // The arrival: a second employer's world, seeded FROM the career rather than
    // fresh. This is the goal - the player standing in the new building with what
    // they earned, read off the new graph.
    const arrival = createWorldSession(carryForSwitch(record!));
    expect(arrival.employer).toBe('bodgeworth');
    const arrived = arrival.engine as WasmEngine;
    expect(fieldOf(arrived, FIELDS.reputation)).toBe(66);
    expect(fieldOf(arrived, FIELDS.title)).toBe('IT Support Technician');
    expect(fieldOf(arrived, FIELDS.farmFund)).toBe(25_000);
    // A fresh probationer at that employer would NOT be at 66: the carry is what
    // makes the two different, which is the standing following the player.
    const fresh = createWorldSession(FIRST_WEEK).engine as WasmEngine;
    expect(fieldOf(fresh, FIELDS.reputation)).not.toBe(66);
  });

  it('carries a firing into a worse start: the dent and the trail', () => {
    const b = bench();
    endWith(b.engine, 'fired', {
      reputation: 40,
      title: 'IT Support Technician',
      farmFund: 12_000,
    });

    expect(b.session.switchEmployer().ok).toBe(true);

    const record = b.switchSlot.peek();
    expect(record?.career.trail).toBe('fired');
    // The firing follows you: the reputation arrives DENTED, below what the
    // player held on the way out. If the exit mapping stopped feeding the fired
    // penalty, this would arrive at 40 and the gate would red.
    expect(record?.career.reputation).toBeLessThan(40);

    const arrival = createWorldSession(carryForSwitch(record!)).engine as WasmEngine;
    expect(fieldOf(arrival, FIELDS.reputation)).toBe(record?.career.reputation);
    // The one thing a firing never takes.
    expect(fieldOf(arrival, FIELDS.farmFund)).toBe(12_000);
  });

  it('refuses to switch out of a week that is not over', () => {
    const b = bench();
    // No verdict written: the review outcome is still pending.
    const taken = b.session.switchEmployer();

    expect(taken.ok).toBe(false);
    expect(b.restarts()).toBe(0);
    expect(b.switchSlot.peek()).toBeNull();
  });

  it('reads the world and does not touch it: the switch is not a mutation', () => {
    // The transition fires at the END of a probation and must not change the
    // world it is leaving - it reads the verdict and the standing, writes a slot,
    // and restarts. The proof with teeth: the graph hash is identical across the
    // call. If the switch grew a write to the player node, this reds.
    const b = bench();
    endWith(b.engine, 'passed', {
      reputation: 66,
      title: 'IT Support Technician',
      farmFund: 25_000,
    });

    const before = b.engine.snapshotHash();
    b.session.switchEmployer();
    expect(b.engine.snapshotHash()).toBe(before);
  });
});

describe('a save taken after arriving round-trips the transition', () => {
  const RECORD: SwitchRecord = {
    employer: 'bodgeworth',
    career: {
      reputation: 66,
      title: 'IT Support Technician',
      farmFund: 25_000,
      trail: null,
      tier: PLAYER_TIERS.serviceDesk,
    },
  };

  it('stamps the second employer and restores its world to the byte', () => {
    const storage = new MemoryStorage();
    const { engine, seed } = createWorldSession(carryForSwitch(RECORD));
    const wasm = engine as WasmEngine;
    const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    });
    const slot = new SaveSlot(storage);
    const session = createShellSession({
      engine,
      appState: new AppStateStore(),
      day: driver,
      slot,
      retry: new RetrySlot(storage),
      switch: new SwitchSlot(storage),
      actor: COMPANY_IDS.player,
      // The arrival stamps ITS employer, not the first one.
      employer: 'bodgeworth',
      probeEngine: () => new WasmEngine(seed),
      restart: () => {},
    });

    const arrived = wasm.snapshotHash();
    expect(session.save().ok).toBe(true);

    // The save file names the second employer - the one fact a reload needs that
    // the graph does not carry (slice 1's schema-4 id).
    const raw = slot.readRaw();
    expect(raw).not.toBeNull();
    const file = parseSaveFile(raw ?? '');
    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.value.employer).toBe('bodgeworth');
    }

    // And a load puts the arrived world back to the byte, with teeth: the world
    // is moved first, so a load that did nothing would fail the restore.
    wasm.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reputation,
      value: 3,
    }]);
    expect(wasm.snapshotHash()).not.toBe(arrived);
    expect(session.load().ok).toBe(true);
    expect(wasm.snapshotHash()).toBe(arrived);
    expect(fieldOf(wasm, FIELDS.reputation)).toBe(66);
  });
});

describe('a fresh probation is untouched by the switch existing', () => {
  it('stands up the same first-employer world it always did', () => {
    // The switch is additive: it only fires at a probation's end, seeded from a
    // carry a fresh week does not have. So a fresh probation is byte-identical to
    // the world before any of this - the same claim the probation goldens make,
    // asserted here against the second employer's arrival being DIFFERENT.
    const fresh = createWorldSession(FIRST_WEEK);
    expect(fresh.employer).toBe('workgrumble');

    const record = { employer: 'bodgeworth' as const, career: {
      reputation: 66,
      title: 'IT Support Technician',
      farmFund: 25_000,
      trail: null,
      tier: PLAYER_TIERS.serviceDesk,
    } };
    const arrival = createWorldSession(carryForSwitch(record));

    // Two different worlds: a fresh probationer and a carried career, told apart
    // by the hash. If the carry stopped seeding the new player node, these would
    // collapse to one and the switch would carry nothing.
    expect((arrival.engine as WasmEngine).snapshotHash())
      .not.toBe((fresh.engine as WasmEngine).snapshotHash());
  });
});
