/**
 * THE SAVE THAT WAS ALREADY ON A DISK WHEN THE WALLS WENT UP (0.38.1).
 *
 * 0.38.0 gave a `share` node the customer field the boxes and the staff
 * accounts already carried, and it gave it at SEED time - which is the whole
 * of the defect. A world stood up by that build has it; a world carried in
 * from a file written by any earlier one does not, `customerIdOfShare` reads
 * null off it, and null is the in-house answer. So a carried save's customer
 * share had NEITHER the tenant STOP nor the contract wall, by the same verb
 * every fresh world refuses. Nothing complained: the engine's own restore is
 * happy with an absent optional field, and the walls fail open on a null
 * customer by design, because a null customer is what in-house looks like.
 *
 * These drive the SHIPPED LOAD - `createShellSession.load()`, through the
 * preflight and the real engine restore - rather than constructing a session
 * and calling the migration on it. That is the 0.6.0 lesson: five wiring bugs
 * shipped past a green suite that built its state directly, and a migration is
 * exactly the kind of code that is correct in isolation and never called.
 *
 * THE FIXTURE is a real save, unbuilt. A current session is played, saved
 * through the shipped writer, and then walked BACKWARDS to what the previous
 * build would have written: the schema number goes back to 5, the customer
 * comes off every share node in the engine payload, and the ledger's fifth
 * column comes off every work segment - the three things 0.38.0 added that a
 * file could be missing. Nothing is hand-authored, so the fixture cannot drift
 * away from the shape the game actually writes.
 *
 * The claims, and what turns each red:
 *
 *  1. THE FILE STILL LOADS. A pre-0.38.0 save is not refused - there was no
 *     schema bump behind it and the engine types the customer field only when
 *     it is present - so the migration is the only thing standing between a
 *     carried save and a world with a hole in it.
 *  2. THE FIELD IS THERE AFTERWARDS, on the restored graph, from the same
 *     table the seed stamps from.
 *  3. AND THE WALL FIRES, through the terminal a player types at. Delete the
 *     5 -> 6 step and the same fixture loads, the same command runs, and the
 *     grant goes through in silence - which is the finding.
 *  4. A CURRENT FILE IS NOT TOUCHED. The migration is absent-only and the step
 *     is skipped outright at schema 6, so a round trip returns the same bytes.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { FIELDS } from '../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../world/msp-company';
import { shiftStartTick } from '../world/day';
import { createWorldSession, type WeekCarry } from '../world/session';
import { AppStateStore } from './app-state';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { RetrySlot } from './retry';
import {
  createShellSession,
  parseSaveFile,
  SAVE_SCHEMA,
  SaveSlot,
  type ShellSessionApi,
} from './save';
import { SwitchSlot } from './switch';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY: Readonly<WeekCarry> = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
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

interface Rig {
  readonly shell: ShellSessionApi;
  readonly slot: SaveSlot;
  readonly graph: () => WasmEngine['graph'];
  readonly api: (onScreen: string) => GameApi;
  readonly ledger: () => string;
}

/**
 * An MSP week wired the way `main.ts` wires one - the shipped shell session on
 * top of a real driver on top of a real engine, with the preflight engine the
 * shipped load uses.
 */
function rig(): Rig {
  const storage = new MemoryStorage();
  const session = createWorldSession(MSP_CARRY);
  const appState = new AppStateStore();
  const driver = new DayDriver(
    session.engine,
    MSP_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    },
    undefined,
    session.week,
    session.channels,
  );
  const slot = new SaveSlot(storage);

  // The shift is started and a piece of in-scope work is actually done, so the
  // file walked backwards below has a LEDGER in it - a work segment with the
  // fifth column 0.38.0 added - rather than an empty field the strip would
  // have nothing to say about.
  driver.startShift();

  while (
    session.engine.now() < shiftStartTick(1) + 20
    && driver.state() === 'shift'
  ) {
    driver.step(TICK_INTERVAL_MS);
  }

  driver.dispatch(
    HELPDESK_ACTIONS.machineSetDisplayRotation,
    MSP_IDS.player,
    MSP_IDS.elmwoodReception,
    { rotation: 90 },
  );

  return {
    slot,
    graph: () => session.engine.graph,
    ledger: () => {
      const value = session.engine.graph.getField(
        MSP_IDS.player,
        FIELDS.timesheetLog,
      );

      return typeof value === 'string' ? value : '';
    },
    // The terminal's own api, with dispatch going through the day driver
    // exactly as the shipped shell does - so what these commands send lands
    // where a player's land.
    api: (onScreen: string): GameApi => {
      appState.setCustomerContext(onScreen);

      return {
        graph: session.engine.graph,
        appState,
        day: driver,
        dispatch: (id, actor, target, params) => driver.dispatch(
          id,
          actor,
          target,
          params,
        ),
        recordProbe: () => {},
        dispatchLog: () => session.engine.dispatchLog(),
        clock: {
          now: () => session.engine.now(),
          onTick: (listener) => session.engine.onTick(listener),
        },
        onWorldChange: (listener) => session.engine.onEvent(() => {
          listener();
        }),
        notify: () => {},
        report: () => Promise.resolve({ ok: true, value: undefined }),
        openApp: () => {},
        closeApp: () => {},
        hasApp: () => false,
        installApp: () => ({ ok: true }),
        uninstallApp: () => ({ ok: true }),
        setDesktop: () => ({ ok: true }),
        restartWeek: () => {},
        acceptOffer: () => {},
        stayAnotherWeek: () => {},
        employer: 'msp',
        actor: MSP_IDS.player,
      };
    },
    shell: createShellSession({
      engine: session.engine,
      appState,
      day: driver,
      slot,
      retry: new RetrySlot(storage),
      switch: new SwitchSlot(storage),
      actor: MSP_IDS.player,
      employer: 'msp',
      probeEngine: () => new WasmEngine(session.seed),
      restart: () => {},
    }),
  };
}

/** The share nodes in an engine payload, whatever else is in it. */
function shareNodes(engine: string): Record<string, unknown>[] {
  const payload = JSON.parse(engine) as {
    graph: { nodes: Record<string, unknown>[] };
  };

  return payload.graph.nodes.filter((node) => node.kind === 'share');
}

/**
 * A save walked BACKWARDS to what the build before 0.38.0 would have written.
 *
 * Three subtractions, and each is a thing 0.38.0 added rather than a thing
 * invented for this test: the schema number, the customer on a share, and the
 * fifth column on a work segment. The ledger strip is realism rather than a
 * subject - the migration deliberately leaves four-field lines exactly where
 * they are - and it is here because a fixture that carried a column the old
 * build could not write would be a fixture of nothing.
 */
function asPreCustomerShares(raw: string): string {
  const file = JSON.parse(raw) as Record<string, unknown>;
  const payload = JSON.parse(file.engine as string) as {
    graph: { nodes: Record<string, unknown>[] };
  };

  for (const node of payload.graph.nodes) {
    const fields = node.fields as Record<string, unknown>;

    if (node.kind === 'share') {
      delete fields[FIELDS.machineCustomer];
    }

    const ledger = fields[FIELDS.timesheetLog];

    if (typeof ledger === 'string' && ledger.length > 0) {
      fields[FIELDS.timesheetLog] = ledger
        .split('\n')
        .map((line) => line.split('|').slice(0, 4).join('|'))
        .join('\n');
    }
  }

  return JSON.stringify({
    ...file,
    schema: SAVE_SCHEMA - 1,
    engine: JSON.stringify(payload),
  });
}

describe('a save carried in from before the share walls', () => {
  it('loads, is stamped, and meets the tenant STOP it used to walk past', () => {
    const live = rig();

    expect(live.shell.save()).toEqual({ ok: true, value: undefined });

    const written = live.slot.readRaw();

    expect(written).not.toBeNull();
    // The fixture is a real file, minus what the old build could not have
    // written - and the ledger really did have a fifth column to lose.
    expect(live.ledger().split('\n')[0]?.split('|')).toHaveLength(5);

    const carried = asPreCustomerShares(written ?? '');
    const stripped = shareNodes(
      (JSON.parse(carried) as { engine: string }).engine,
    );

    expect(stripped.length).toBeGreaterThan(0);
    expect(stripped.every(
      (node) => (node.fields as Record<string, unknown>)[FIELDS.machineCustomer]
        === undefined,
    )).toBe(true);
    expect(stripped.some((node) => node.id === MSP_IDS.fontaineMatterShare))
      .toBe(true);

    live.slot.writeRaw(carried);

    // 1. IT STILL LOADS. No schema bump stood in its way and the engine types
    //    the customer field only where it is present, so nothing on the way in
    //    would have told the player their save was short of anything.
    expect(live.shell.load()).toEqual({ ok: true, value: undefined });

    // 2. AND THE FIELD IS THERE, off the same table the seed stamps from.
    expect(live.graph().getField(
      MSP_IDS.fontaineMatterShare,
      FIELDS.machineCustomer,
    )).toBe(MSP_CUSTOMERS.fontaine);
    expect(live.graph().getField(
      MSP_IDS.marloweProjectShare,
      FIELDS.machineCustomer,
    )).toBe(MSP_CUSTOMERS.marlowe);

    // 3. SO THE WALL FIRES. Pennington's ticket is what is on screen; the
    //    Delacroix matter is Fontaine's, and this is the STOP a fresh world
    //    has had since 0.38.0 and a carried one had never had.
    const api = live.api(MSP_CUSTOMERS.pennington);
    const output = executeCommand(
      parseCommand('grant ekhoury Delacroix'),
      api,
    ).lines.join('\n');

    expect(output).toContain('STOP. PENNINGTON-ACCT is on your screen');
    expect(output).toContain('belongs to FONTAINE-LAW');
    expect(output).not.toContain('now has Full Access to');
    expect(api.dispatchLog().some(
      (entry) => entry.id === HELPDESK_ACTIONS.shareGrantAccess,
    )).toBe(false);
  });

  it('leaves a current file exactly as it was written', () => {
    const live = rig();

    expect(live.shell.save()).toEqual({ ok: true, value: undefined });

    const written = live.slot.readRaw() ?? '';
    const parsed = parseSaveFile(written);

    expect(parsed.ok).toBe(true);
    // Byte-for-byte: the step is skipped outright above schema 5, so a payload
    // this build wrote is not re-serialized on the way back in.
    expect(parsed.ok && parsed.value.engine).toBe(
      (JSON.parse(written) as { engine: string }).engine,
    );
    expect(parsed.ok && parsed.value.schema).toBe(SAVE_SCHEMA);

    // And re-reading a file the migration HAS already run over stamps nothing
    // a second time: the share carries its customer, so the absent-only rule
    // has nothing to do and the payload comes back unchanged again.
    const twice = parseSaveFile(
      JSON.stringify({
        ...(JSON.parse(written) as Record<string, unknown>),
        schema: SAVE_SCHEMA - 1,
      }),
    );

    expect(twice.ok && twice.value.engine).toBe(
      (JSON.parse(written) as { engine: string }).engine,
    );
  });
});

/**
 * A SAVE WHOSE LEDGER CANNOT BE READ (0.38.1).
 *
 * `segmentsFrom` used to drop a line it could not decode, which meant a
 * six-field line - an id with a bar in it - took a stretch of somebody's
 * morning out of the sheet with nothing to show for it but a total that did
 * not add up to a day. It refuses now, and the refusal has to land somewhere a
 * player can be told about: the LOAD, in the session nobody is playing, rather
 * than an hour later in a window.
 *
 * Teeth: take `driver.timesheetTruth()` back out of `preflight` and this reds
 * - the file loads, the session is replaced, and the throw is waiting in the
 * timesheet window instead.
 */
describe('a save whose ledger cannot be read', () => {
  it('is refused at the load, with the session still running', () => {
    const live = rig();

    expect(live.shell.save()).toEqual({ ok: true, value: undefined });

    const written = live.slot.readRaw() ?? '';
    const file = JSON.parse(written) as Record<string, unknown>;
    const payload = JSON.parse(file.engine as string) as {
      graph: { nodes: Record<string, unknown>[] };
    };

    for (const node of payload.graph.nodes) {
      const fields = node.fields as Record<string, unknown>;
      const ledger = fields[FIELDS.timesheetLog];

      if (typeof ledger === 'string' && ledger.length > 0) {
        // One extra bar in the last field, which is what an id carrying one
        // would have written before the encoder learned to refuse it.
        fields[FIELDS.timesheetLog] = `${ledger}|and-a-half`;
      }
    }

    live.slot.writeRaw(JSON.stringify({
      ...file,
      engine: JSON.stringify(payload),
    }));

    const outcome = live.shell.load();

    expect(outcome.ok).toBe(false);
    // And the world the player was in is untouched - the preflight ran on a
    // disposable engine, so nothing was replaced by a file that could not be.
    expect(live.graph().getField(
      MSP_IDS.fontaineMatterShare,
      FIELDS.machineCustomer,
    )).toBe(MSP_CUSTOMERS.fontaine);
  });
});
