/**
 * A REFRESH COMES BACK TO THE WEEK YOU WERE IN (#61, 0.41.0).
 *
 * The defect these hold shut: a plain reload stood `FIRST_WEEK` up. The saved
 * week came back only if the badge held a newer copy or the player pressed
 * Load, so a career that is a FACT rather than a seed - the sd_senior desk, an
 * employer switch, week two of an arc - was silently demoted to the probation
 * shop on every refresh, with the real week sitting unloaded in the slot.
 *
 * THE CLAIM IS THE GOAL, NOT THE CALL. "The loader returned ok" is not evidence
 * anybody got their career back, and the transition-shaped version of this test
 * is exactly the hole the 0.36.0 senior walked through for five box rounds. So
 * the second boot below is asked what world it is IN: the title on the player
 * node, the week of the arc, and the graph hash of the whole thing against the
 * one that was saved.
 *
 * AND IT IS THE SHIPPED BOOT, in the shipped order. The rig mirrors `main.ts` -
 * read the four slots, `bootCareer`, stand the world up from the carry it
 * hands back, `createShellSession` over a real driver over a real engine,
 * acknowledge the carry, and then `session.load()` for a resume. Nothing here
 * builds a world by hand and nothing loads a save by any other road; a second
 * loader is how 0.6.0 shipped five wiring bugs.
 *
 * TEETH. Turn `resume` off in `bootCareer` - which is the 0.40.0 behaviour, to
 * the line - and the senior boot below comes back holding
 * "IT Support Technician (probationary)" at arc week 1 with a different hash,
 * and the arrival boot comes back at the probation shop. Both go red on the
 * world rather than on a return value.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { type Employer, employerFor } from '../world/employers';
import { FIELDS } from '../world/fields';
import { createWorldSession } from '../world/session';
import { AppStateStore } from './app-state';
import { beginCareer, bootCareer } from './boot-career';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { acknowledgeCarry, RetrySlot } from './retry';
import {
  createShellSession,
  parseSaveFile,
  SaveSlot,
  type SaveOutcome,
  type ShellSessionApi,
} from './save';
import { StartSlot } from './start';
import { SwitchSlot } from './switch';

beforeAll(() => {
  loadEngineForTests();
});

/** A `Storage` in a Map. The browser's is not what is on trial here. */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

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
    this.entries.set(key, value);
  }
}

interface Booted {
  readonly session: ShellSessionApi;
  readonly driver: DayDriver;
  /** What the world says about the player, off the live graph. */
  readonly field: (name: string) => unknown;
  readonly hash: () => string;
  readonly tick: () => number;
  /** The shop the load re-pointed the shell at, if it re-pointed one. */
  readonly restoredEmployer: () => string | null;
  readonly resumed: SaveOutcome | null;
  readonly hiring: boolean;
}

/**
 * A boot of this game over one browser's storage, in `main.ts`'s own order.
 *
 * Everything the shipped boot does that can decide which career comes back is
 * here and in the same sequence: read the slots, ask `bootCareer`, build the
 * world from the carry it names, wire the session, let go of the carry once the
 * new week is durable, and resume.
 */
function boot(storage: Storage): Booted {
  const retry = new RetrySlot(storage);
  const switchSlot = new SwitchSlot(storage);
  const slot = new SaveSlot(storage);
  const startSlot = new StartSlot(storage);
  const {
    arriving,
    carried,
    started,
    opening,
    resume,
    hiring,
  } = bootCareer({
    arriving: switchSlot.peek(),
    carried: retry.peek(),
    started: startSlot.peek(),
    saved: slot.exists(),
  });
  const world = createWorldSession(opening);
  let current: Employer = employerFor(world.employer);
  let restored: string | null = null;
  const appState = new AppStateStore();
  const driver = new DayDriver(
    world.engine,
    COMPANY_IDS.player,
    world.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
    undefined,
    world.week,
    current.channels,
    current.runsBossPings,
    current.arc,
  );
  const session = createShellSession({
    engine: world.engine,
    appState,
    day: driver,
    slot,
    retry,
    switch: switchSlot,
    actor: COMPANY_IDS.player,
    employer: world.employer,
    carried: opening.estate ?? [],
    probeEngine: () => new WasmEngine(world.seed),
    onEmployerRestored: (id) => {
      current = employerFor(id);
      restored = id;
    },
    restart: () => {},
  });

  if (arriving !== null) {
    acknowledgeCarry(switchSlot, () => session.save(), slot);
  }

  if (carried !== null) {
    acknowledgeCarry(retry, () => session.save(), slot);
  }

  if (started !== null) {
    acknowledgeCarry(startSlot, () => session.save(), slot);
  }

  return {
    session,
    driver,
    hiring,
    field: (name) => world.engine.graph.getField(COMPANY_IDS.player, name),
    hash: () => world.engine.snapshotHash(),
    tick: () => world.engine.now(),
    restoredEmployer: () => restored,
    resumed: resume ? session.load() : null,
  };
}

/** Works a stretch of the shift, so the second boot has something to come back to. */
function playAMorning(live: Booted): void {
  live.driver.startShift();

  for (let step = 0; step < 90; step += 1) {
    live.driver.step(TICK_INTERVAL_MS);
  }
}

describe('a refresh with a saved week in the browser', () => {
  it('comes back to the senior career, not to somebody else\'s probation', () => {
    const storage = new MemoryStorage();

    // The desk, taken the way the log-on screen takes it: a record written
    // down, and the machine started again.
    expect(beginCareer(new StartSlot(storage), 'sd_senior', []).ok).toBe(true);

    const hired = boot(storage);

    // The boot that consumed the pick is the senior's, and it saved itself:
    // that boundary save is the thing a refresh has to come back to.
    expect(hired.field(FIELDS.title)).toBe('Senior Service Desk Analyst');
    expect(hired.field(FIELDS.arcWeek)).toBe(2);
    expect(hired.resumed).toBeNull();

    playAMorning(hired);
    expect(hired.session.save()).toEqual({ ok: true, value: undefined });

    const played = hired.hash();
    const tick = hired.tick();

    // AND THE REFRESH. Nothing is carried into it - the pick was let go of by
    // the boot above - so this is the plain reload that used to deal a Monday.
    const back = boot(storage);

    // The goal FIRST, because it is the claim: the player is in THEIR world.
    // The title is the one they were hired at, the week is the one they were
    // in, and the graph is the same graph down to the hash - which no screen
    // shows and no screen should. The outcome of the load is checked after, so
    // a revert reds on the career rather than on a return value.
    expect(back.field(FIELDS.title)).toBe('Senior Service Desk Analyst');
    expect(back.field(FIELDS.arcWeek)).toBe(2);
    expect(back.hash()).toBe(played);
    expect(back.tick()).toBe(tick);
    expect(back.resumed).toEqual({ ok: true, value: undefined });
    // And no job is offered over the top of it: a browser carrying a career is
    // not a browser being hired.
    expect(back.hiring).toBe(false);
  });

  it('comes back to the shop that was switched to', () => {
    const storage = new MemoryStorage();

    // An arrival at the second employer, written the way `switchEmployer`
    // writes one.
    expect(new SwitchSlot(storage).write({
      employer: 'bodgeworth',
      career: {
        reputation: 82,
        title: 'IT Support Technician',
        farmFund: 25_000,
        trail: null,
      },
    }).ok).toBe(true);

    const arrived = boot(storage);

    playAMorning(arrived);
    expect(arrived.session.save()).toEqual({ ok: true, value: undefined });

    const there = arrived.hash();
    const filed = parseSaveFile(new SaveSlot(storage).readRaw() ?? '');

    expect(filed.ok && filed.value.employer).toBe('bodgeworth');

    const back = boot(storage);

    // The same building, to the byte - and the rest of the shell was told
    // which shop it is now at, which is what the install policy and the offer
    // surface read.
    expect(back.hash()).toBe(there);
    expect(back.restoredEmployer()).toBe('bodgeworth');
    expect(back.resumed).toEqual({ ok: true, value: undefined });
  });

  it('does not offer a job over a week it cannot open, and says so', () => {
    const storage = new MemoryStorage();

    // A file this build refuses. It is still a week somebody played, so the
    // honest boot is one that TRIES and is refused out loud - not one that
    // decides there is no career here and quietly deals a Monday.
    storage.setItem(
      'workgrumble/save',
      JSON.stringify({ schema: 99, engine: '{}' }),
    );

    const back = boot(storage);

    expect(back.resumed?.ok).toBe(false);
    expect(back.resumed?.ok === false && back.resumed.reason)
      .toContain('newer build');
    // Not a hire: the ladder must not appear over somebody's unreadable week,
    // because taking a desk from it would write straight over the file.
    expect(back.hiring).toBe(false);
  });
});

describe('a boot with nothing in the browser', () => {
  it('is a first Monday, and it is the one that offers a job', () => {
    const live = boot(new MemoryStorage());

    expect(live.resumed).toBeNull();
    expect(live.hiring).toBe(true);
    expect(live.field(FIELDS.title)).toBe('IT Support Technician (probationary)');
  });
});

/**
 * THE ORDER INSIDE THE START-FRESH DOOR.
 *
 * The pick is written first and the old career is let go of only once that
 * write has said it worked. Swap those two and a browser that will not keep the
 * pick has already thrown the career away: the player is left with neither, and
 * nothing on screen to say why.
 */
describe('starting a career over one that is already here', () => {
  it('lets the old one go only once the new desk is written down', () => {
    const storage = new MemoryStorage();
    const slot = new SaveSlot(storage);
    const retry = new RetrySlot(storage);

    slot.writeRaw('{"pretend":"a week"}');
    retry.write({
      attempt: 2,
      farmFund: 1_200,
      kbSelected: null,
      arcWeek: 1,
      employer: 'workgrumble',
      estate: [],
      tier: 'service_desk',
      title: null,
    });

    expect(beginCareer(
      new StartSlot(storage),
      'systems_engineer',
      [slot, retry],
    )).toEqual({ ok: true, value: undefined });

    expect(new StartSlot(storage).peek()).toEqual({ rung: 'systems_engineer' });
    expect(slot.exists()).toBe(false);
    expect(retry.peek()).toBeNull();
  });

  it('keeps the old career when the pick will not go down', () => {
    const storage = new MemoryStorage();
    const slot = new SaveSlot(storage);

    slot.writeRaw('{"pretend":"a week"}');

    const refused = beginCareer(
      { write: () => ({ ok: false, reason: 'Storage is full.' }) },
      'systems_engineer',
      [slot],
    );

    expect(refused).toEqual({ ok: false, reason: 'Storage is full.' });
    // The week is exactly where it was. Reverse the two halves of
    // `beginCareer` and this reds: the slot is empty and the pick is nowhere.
    expect(slot.readRaw()).toBe('{"pretend":"a week"}');
  });

  it('refuses a rung nobody has written, and clears nothing', () => {
    const storage = new MemoryStorage();
    const slot = new SaveSlot(storage);

    slot.writeRaw('{"pretend":"a week"}');

    const refused = beginCareer(new StartSlot(storage), 'architect', [slot]);

    expect(refused.ok).toBe(false);
    expect(new StartSlot(storage).peek()).toBeNull();
    expect(slot.readRaw()).toBe('{"pretend":"a week"}');
  });
});
