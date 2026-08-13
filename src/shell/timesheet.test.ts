/**
 * The timesheet, played (0.30.0, slice 1).
 *
 * `../world/timesheet.test.ts` proves the model out of fixtures. This asks the
 * only question that fixture cannot: with the shipped driver, the shipped
 * engine and the shipped terminal, driving a real day the way a player does,
 * does the sheet say what the ENGINE'S OWN RECORDS say happened?
 *
 * Five claims, and each of them is a thing that would ship broken without an
 * assertion on it:
 *
 * 1. NOTHING ON THE SHEET IS INVENTED. Every line of the ledger the sheet is
 *    derived from is backed by an entry in the engine's own dispatch log, at
 *    that minute, resolving through the same `attributionFor` to that bucket.
 *    Rebuild the ledger from the log and the same buckets come back.
 * 2. THE PRE-FILL AND THE TRUTH ARE ONE CALL. The derived column of the sheet
 *    is the derivation object, not a second reading of it.
 * 3. THE CLAIM NEVER MOVES THE TRUTH. Pad a line through the shipped verb and
 *    the ledger comes back byte-identical; a submitted sheet refuses the edit.
 * 4. SLACKING COSTS ATTRIBUTED TIME. The same day with the forum open in the
 *    middle of it attributes strictly fewer minutes, and the difference is
 *    unattributed rather than punished.
 * 5. IT SURVIVES A SAVE, AND A RETRY THROWS IT AWAY. The claim and the record
 *    are world state, so they serialise; a retried week is built from nothing,
 *    so a week that is being played again has no hours on it. Asked twice, on
 *    purpose: once of the engine alone, and once through the SHELL's own save
 *    seam with a whole boot in the middle of it - Save, reload, Load - because
 *    the trip a player takes has steps in it that a serialise/restore pair does
 *    not, and the sheet came back blank off one of them.
 *
 * Nothing here touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { WasmEngine } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS, PLAYER_TIERS } from '../world/fields';
import { shiftEndTick, shiftStartTick } from '../world/hours';
import {
  ARDEN_EDGE_PROJECT,
  MSP_CHANNELS,
  MSP_CUSTOMERS,
} from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { ticketNodes, ticketProjectOf } from '../world/tickets';
import {
  attributionFor,
  bucketOf,
  deriveTimesheet,
  segmentsFrom,
  segmentsFromLog,
  SERVICE_DESK_BUCKET,
  type Timesheet,
  TIMESHEET_LOG_LIMIT,
  type WorkResolver,
} from '../world/timesheet';
import { REVIEW_DAY } from '../world/week';
import { AppStateStore } from './app-state';
import {
  type ClaimGap,
  editsOffered,
  gapOf,
  sheetStamp,
} from './apps/timesheet';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { acknowledgeCarry, RetrySlot } from './retry';
import {
  createShellSession,
  SaveSlot,
  type ShellSessionApi,
} from './save';
import { MemoryStorage } from './storage';
import { switchRecord, SwitchSlot } from './switch';
import { offeredAtFor } from '../world/titles';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

const RESOLVER: WorkResolver = {
  projectOfTicket: ticketProjectOf,
  nodesOfTicket: ticketNodes,
};

/**
 * The browser that was full when the arrival tried to write itself down.
 *
 * A real state with a shipped consequence rather than a convenience: it is how
 * a switch record ends up still sitting in storage while a week gets played on
 * top of it, which is the boot the reload test below is about.
 */
class RefusingStorage extends MemoryStorage {
  public sealed = false;

  public override setItem(key: string, value: string): void {
    if (this.sealed) {
      throw new DOMException('QuotaExceededError');
    }

    super.setItem(key, value);
  }
}

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  /**
   * The shipped save seam, wired to this rig the way `main.ts` wires it.
   *
   * Here rather than mocked because the question the reload test asks is about
   * the SHELL's decision to write, not about whether the engine can serialise a
   * field - `save()` on the engine alone is a different, easier question, and
   * the one this file used to be able to answer.
   */
  readonly shell: ShellSessionApi;
  /** Where the save, the retry and the switch records all live. */
  readonly storage: Storage;
  /** What the shell says is on the screen, which is how slacking gets in. */
  focused: string | null;
}

/** The MSP desk, with the promotion taken through the real verb. */
function rig(promoted = true, storage: Storage = new MemoryStorage()): Rig {
  const session = createWorldSession(MSP_CARRY);
  const state: { focused: string | null } = { focused: null };
  const appState = new AppStateStore();
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => (state.focused === null ? [] : [state.focused]),
    focusedSlackApp: () => state.focused,
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const shell = createShellSession({
    engine: session.engine,
    appState,
    day: driver,
    slot: new SaveSlot(storage),
    retry: new RetrySlot(storage),
    switch: new SwitchSlot(storage),
    actor: COMPANY_IDS.player,
    employer: 'msp',
    probeEngine: () => new WasmEngine(WORLD_SEED),
    restart: () => {},
  });
  const api = {
    graph: session.engine.graph,
    appState,
    day: driver,
    dispatch: (
      id: string,
      actor: string,
      target: string | null,
      params: Record<string, string | number | boolean | null>,
    ) => driver.dispatch(id, actor, target, params),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener: (tick: number) => void) =>
        session.engine.onTick(listener),
    },
    onWorldChange: (listener: () => void) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true as const, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true as const }),
    uninstallApp: () => ({ ok: true as const }),
    setDesktop: () => ({ ok: true as const }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
    employer: 'msp',
    actor: COMPANY_IDS.player,
  } as unknown as GameApi;

  if (promoted) {
    session.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reputation,
      value: offeredAtFor('systems_engineer'),
    }]);
    session.engine.dispatch(
      CAREER_ACTIONS.acceptPromotion,
      COMPANY_IDS.player,
      COMPANY_IDS.player,
      {},
    );
    driver.raiseFirstIncident();
  }

  const rigged: Rig = {
    session,
    driver,
    api,
    shell,
    storage,
    get focused() {
      return state.focused;
    },
    set focused(value: string | null) {
      state.focused = value;
    },
  };

  return rigged;
}

function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

function runTo(rigged: Rig, tick: number): void {
  while (rigged.session.engine.now() < tick
    && rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/** Where the first line's claim stands against its record, or null for none. */
function firstGap(sheet: Readonly<Timesheet>): ClaimGap | null {
  const line = sheet.days[0]?.lines[0];

  return line === undefined ? null : gapOf(line);
}

function ledgerOf(rigged: Rig): string {
  const value = rigged.session.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.timesheetLog,
  );

  return typeof value === 'string' ? value : '';
}

/**
 * A morning at the MSP, worked through the shipped terminal.
 *
 * Deliberately a MIXED morning, because that is the shape the whole mechanic is
 * about: the project's own first task, an act on a different customer's estate,
 * and time passing between them. A morning spent entirely on one thing would
 * produce a sheet with one line on it and prove nothing about attribution.
 */
function workTheMorning(rigged: Rig): void {
  rigged.driver.startShift();
  runTo(rigged, shiftStartTick(1) + 20);
  run(rigged, 'fw rules ARD-FW-01');
  run(rigged, 'fw audit ARD-FW-01');
  runTo(rigged, shiftStartTick(1) + 50);
  run(rigged, 'fw migrate wan-default');
  // And somebody else's morning, on a different customer's estate, because a
  // sheet with one line on it proves nothing about attribution.
  runTo(rigged, shiftStartTick(1) + 80);
  run(rigged, 'rotate ELM-WS-01 90');
  runTo(rigged, shiftStartTick(1) + 110);
}

describe('the sheet, driven', () => {
  it('puts nothing on the sheet the engine did not record', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const { graph } = rigged.session.engine;
    const segments = segmentsFrom(ledgerOf(rigged));
    const log = rigged.session.engine.dispatchLog();

    expect(segments.length).toBeGreaterThan(1);

    // EVERY line of the ledger is an act the engine itself recorded, in that
    // minute, resolving through the same `attributionFor` to that bucket.
    // Nothing on the sheet exists because the sheet wanted it to.
    for (const segment of segments) {
      const backed = log.some((entry) => entry.ok
        && entry.tick === segment.tick
        && bucketOf(attributionFor(graph, entry.target, RESOLVER)
          ?? { kind: 'internal', id: 'none' }) === bucketOf(segment.ref));

      expect(backed, `${String(segment.tick)} ${bucketOf(segment.ref)}`)
        .toBe(true);
    }

    // And the other direction: rebuild the ledger from the log alone, through
    // the same function. Every bucket the sheet claims is one the log also
    // produces - the recorder and the audit are one piece of code with two
    // callers, so a sheet cannot hold a customer the records do not.
    //
    // It is containment rather than equality on purpose, and the difference is
    // itself the honest part: the dispatch log holds the WORLD's own acts too -
    // a monitored box writing its own event log is not somebody's afternoon -
    // and the ledger is written at the one seam the player's own hand passes
    // through. A rebuild from the raw log necessarily sees more.
    const rebuilt = deriveTimesheet(
      segmentsFromLog(graph, log, RESOLVER),
      rigged.session.engine.now(),
    );
    const derived = rigged.driver.timesheetTruth();
    const buckets = (truth: typeof derived): readonly string[] => truth.days
      .flatMap((day) => day.lines.map((line) => line.bucket))
      .sort((left, right) => left.localeCompare(right));
    const fromLog = buckets(rebuilt);

    expect(buckets(derived).length).toBeGreaterThan(1);

    for (const bucket of buckets(derived)) {
      expect(fromLog, bucket).toContain(bucket);
    }

    // And the morning that was actually worked is the morning on the sheet:
    // the project the engineer was handed, and the clinic whose screen went
    // round. Named, so a recorder that quietly dropped one reds here.
    expect(buckets(derived)).toEqual([
      bucketOf({ kind: 'customer', id: MSP_CUSTOMERS.elmwood }),
      bucketOf({ kind: 'project', id: ARDEN_EDGE_PROJECT }),
    ]);
  });

  it('reads the project code and the customer as separate lines', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const sheet = rigged.driver.timesheet();
    const day = sheet.days[0];

    expect(sheet.shape).toBe('per_customer');
    expect(day?.lines.some((line) => line.label.includes('edge firewall')))
      .toBe(true);
    expect(day?.lines.every((line) => line.billable)).toBe(true);
    // The morning was not all billable work, and the sheet says so without
    // anybody being told off for it.
    expect(day?.unattributed).toBeGreaterThan(0);
  });

  it('derives the sheet and the truth from the one call', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const truth = rigged.driver.timesheetTruth();
    const sheet = rigged.driver.timesheet();
    const flat = (
      rows: readonly { readonly bucket: string; readonly minutes?: number;
        readonly derived?: number }[],
    ): readonly string[] => rows
      .map((row) => `${row.bucket}=${String(row.minutes ?? row.derived ?? 0)}`)
      .sort((left, right) => left.localeCompare(right));

    // The derived column of the sheet IS the derivation. If the sheet ever
    // recomputes minutes of its own, the two stop agreeing here first.
    expect(flat(sheet.days.flatMap((day) => day.lines)))
      .toEqual(flat(truth.days.flatMap((day) => day.lines)));
    expect(rigged.driver.timesheetTruth()).toEqual(truth);
  });

  it('makes an hour on the forum an hour nobody can bill', () => {
    const honest = rig();
    workTheMorning(honest);

    const slacker = rig();
    slacker.driver.startShift();
    runTo(slacker, shiftStartTick(1) + 20);
    run(slacker, 'fw rules ARD-FW-01');
    run(slacker, 'fw audit ARD-FW-01');
    // And then the forum, for the half hour the honest run spent working.
    slacker.focused = 'browser';
    runTo(slacker, shiftStartTick(1) + 50);
    slacker.focused = null;
    run(slacker, 'fw migrate wan-default');
    runTo(slacker, shiftStartTick(1) + 80);
    run(slacker, 'rotate ELM-WS-01 90');
    runTo(slacker, shiftStartTick(1) + 110);

    const worked = honest.driver.timesheetTruth().days[0];
    const slacked = slacker.driver.timesheetTruth().days[0];

    expect(slacked?.attributed).toBeLessThan(worked?.attributed ?? 0);
    // The same day either way. The minutes did not vanish and nothing was
    // charged for them - they are simply on nobody's invoice.
    expect(slacked?.elapsed).toBe(worked?.elapsed);
    expect(slacked?.unattributed).toBeGreaterThan(worked?.unattributed ?? 0);
    expect(
      (slacked?.attributed ?? 0) + (slacked?.unattributed ?? 0),
    ).toBe(slacked?.elapsed);
  });

  it('keeps a week of hard work well inside the ledger\'s bound', () => {
    const rigged = rig();
    workTheMorning(rigged);
    runTo(rigged, shiftEndTick(1));

    // The ledger grows on CONTEXT SWITCHES rather than on acts, which is the
    // whole reason the bound is generous enough never to eat a Monday.
    expect(segmentsFrom(ledgerOf(rigged)).length)
      .toBeLessThan(TIMESHEET_LOG_LIMIT / 5);
  });
});

describe('the claim', () => {
  it('never moves the record it disagrees with', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const before = ledgerOf(rigged);
    const line = rigged.driver.timesheet().days[0]?.lines[0];

    expect(line).toBeDefined();

    const padded = run(rigged, 'timesheet claim 1.1 420').join('\n');

    expect(padded).toContain('7h claimed');
    // Byte-identical. The record and the claim are two pieces of paper, and
    // the whole of the next slice is the question you get asked when they
    // disagree - which is only answerable while this line holds.
    expect(ledgerOf(rigged)).toBe(before);

    const sheet = rigged.driver.timesheet();
    expect(sheet.days[0]?.lines[0]?.derived).toBe(line?.derived);
    expect(sheet.days[0]?.lines[0]?.claimed).toBe(420);
  });

  it('writes a vague line where a detailed one stood', () => {
    const rigged = rig();
    workTheMorning(rigged);
    run(rigged, 'timesheet vague 1.1');

    expect(rigged.driver.timesheet().days[0]?.lines[0]?.detail).toBe('vague');
    expect(run(rigged, 'timesheet').join('\n')).toContain('(vague)');

    run(rigged, 'timesheet detail 1.1');
    expect(rigged.driver.timesheet().days[0]?.lines[0]?.detail)
      .toBe('detailed');
  });

  it('refuses an edit once the sheet has gone in', () => {
    const rigged = rig();
    workTheMorning(rigged);

    expect(run(rigged, 'timesheet submit').join('\n'))
      .toContain('Timesheet submitted');
    expect(rigged.driver.timesheet().submittedAt).not.toBeNull();
    expect(rigged.driver.timesheet().submittedAuto).toBe(false);

    const refused = run(rigged, 'timesheet claim 1.1 420').join('\n');

    expect(refused).toContain('That sheet has gone in');
    expect(rigged.driver.timesheetClaims()).toEqual([]);
    // And the paper is not filed twice.
    expect(run(rigged, 'timesheet submit').join('\n'))
      .toContain('That sheet has gone in');
  });

  it('says which line it cannot find rather than doing nothing', () => {
    const rigged = rig();
    workTheMorning(rigged);

    expect(run(rigged, 'timesheet claim 9.9 60').join('\n'))
      .toContain('no line "9.9"');
    expect(run(rigged, 'timesheet claim 1.1 lots').join('\n'))
      .toContain('not a number of minutes');
    expect(run(rigged, 'timesheet shred').join('\n'))
      .toContain('is not something this terminal does');
  });
});

describe('the service desk\'s sheet', () => {
  it('is one bucket a day, and there is nothing to decide about it', () => {
    const rigged = rig(false);
    rigged.driver.startShift();
    runTo(rigged, shiftEndTick(1));

    const sheet = rigged.driver.timesheet();

    expect(rigged.driver.playerTier()).toBe(PLAYER_TIERS.serviceDesk);
    expect(sheet.shape).toBe('single_bucket');
    expect(sheet.days[0]?.lines).toHaveLength(1);
    expect(sheet.days[0]?.lines[0]?.bucket).toBe(SERVICE_DESK_BUCKET);
    expect(run(rigged, 'timesheet').join('\n')).toContain('Service Desk');
    expect(run(rigged, 'timesheet submit').join('\n'))
      .toContain('before the sigh finished');
  });
});

describe('the week ending on it', () => {
  it('submits whatever stands, and says that is what happened', () => {
    const rigged = rig();
    rigged.driver.startShift();

    // Friday, the long way round: five shifts through the shipped driver, so
    // the auto-submit fires off the real end of the real week.
    for (let day = 1; day <= REVIEW_DAY; day += 1) {
      runTo(rigged, shiftEndTick(day));

      while (rigged.driver.state() === 'shift') {
        rigged.driver.step(TICK_INTERVAL_MS);
      }

      rigged.driver.clockOff();

      if (day < REVIEW_DAY) {
        rigged.driver.startShift();
      }
    }

    const sheet = rigged.driver.timesheet();

    expect(rigged.driver.weekEnded()).toBe(true);
    expect(sheet.submittedAt).not.toBeNull();
    // Honestly labelled: it went in because the week ended, not because
    // anybody filled it in, and the sentence on the screen says so.
    expect(sheet.submittedAuto).toBe(true);
    expect(run(rigged, 'timesheet').join('\n'))
      .toContain('SUBMITTED automatically');
  });

  it('leaves a sheet the player already submitted alone', () => {
    const rigged = rig();
    workTheMorning(rigged);
    run(rigged, 'timesheet submit');

    const at = rigged.driver.timesheet().submittedAt;

    for (let day = 1; day <= REVIEW_DAY; day += 1) {
      runTo(rigged, shiftEndTick(day));

      while (rigged.driver.state() === 'shift') {
        rigged.driver.step(TICK_INTERVAL_MS);
      }

      rigged.driver.clockOff();

      if (day < REVIEW_DAY) {
        rigged.driver.startShift();
      }
    }

    // The same minute, and still the player's own submission: the week ending
    // does not re-file a sheet that is already in.
    expect(rigged.driver.timesheet().submittedAt).toBe(at);
    expect(rigged.driver.timesheet().submittedAuto).toBe(false);
  });
});

describe('a save, and a week played again', () => {
  it('comes back off a reload with the record and the claim on it', () => {
    const rigged = rig();
    workTheMorning(rigged);
    run(rigged, 'timesheet claim 1.1 420');
    run(rigged, 'timesheet vague 1.1');

    const before = rigged.driver.timesheet();
    const saved = rigged.session.engine.serialize();

    // A different session entirely, the way a reload is: a fresh engine, the
    // save poured into it, and a driver that has never seen this week.
    const loaded = rig();
    loaded.session.engine.restore(saved);
    loaded.driver.resync();

    const after = loaded.driver.timesheet();

    expect(after.days[0]?.lines[0]?.derived)
      .toBe(before.days[0]?.lines[0]?.derived);
    expect(after.days[0]?.lines[0]?.claimed).toBe(420);
    expect(after.days[0]?.lines[0]?.detail).toBe('vague');
  });

  /**
   * THE SAME TRIP, THROUGH THE SHELL'S OWN DECISION TO WRITE - which is the
   * half the test above cannot see.
   *
   * `engine.serialize()` straight into `engine.restore()` asks whether a field
   * survives a round trip. It does, and it always did. What a player does is
   * different in one respect that turned out to matter: they click Save, they
   * RELOAD THE PAGE, and a whole boot happens - a new world stood up from
   * whatever records storage is holding - before they ever click Load. Every
   * one of those steps is a chance for the file to be replaced by something
   * else, and none of them exists in a two-line serialise/restore.
   *
   * So this drives the shipped seam: the sheet is worked, padded, blurred and
   * filed; `session.save()` writes the file the start menu writes; a SECOND
   * session boots over the same storage and acknowledges the carry-over
   * `main.ts` acknowledges at every boot; and only then is the save loaded. The
   * sheet has to come back filed, frozen, with both claims standing on it.
   *
   * The arrival record is still in storage on purpose and not as a fixture
   * convenience: that is the shipped state after a browser refuses the arrival
   * write (the sentence the player gets says so), and it is the boot that used
   * to put a fresh Monday straight over the week in the slot. The sheet was
   * simply the surface it was noticed on - the whole save went, not the hours.
   */
  it('comes back off a reload through the shell, filed, with the claims on it', () => {
    const storage = new RefusingStorage();
    const arrival = new SwitchSlot(storage);
    const slot = new SaveSlot(storage);

    expect(arrival.write(switchRecord('msp', {
      reputation: 60,
      title: 'Systems Engineer',
      farmFund: 41_000,
      trail: null,
      tier: PLAYER_TIERS.systemsEngineer,
    }))).toEqual({ ok: true, value: undefined });

    // The boot that stood this week up could not write the arrival down, so the
    // record is still there and the player was told. They played anyway.
    const live = rig(true, storage);

    storage.sealed = true;
    expect(acknowledgeCarry(arrival, () => live.shell.save(), slot)).toBe(false);
    storage.sealed = false;

    workTheMorning(live);
    run(live, 'timesheet claim 1.1 420');
    run(live, 'timesheet vague 1.1');
    run(live, 'timesheet submit');

    const before = live.driver.timesheet();

    expect(before.submittedAt).not.toBeNull();
    expect(firstGap(before)).toBe('over');
    // Save game, from the start menu. Storage has room again by now.
    expect(live.shell.save()).toEqual({ ok: true, value: undefined });

    // The reload. Nothing of that session survives except what is in storage,
    // and the boot on the other side does what boot does: stands a world up and
    // acknowledges the carry-over before the player touches anything.
    const reloaded = rig(true, storage);

    // Boot's own acknowledgement, called exactly as `main.ts` calls it. What it
    // ANSWERS is boot's business and `save.test.ts` asserts it; what this test
    // is about is what the player gets when they click Load afterwards.
    acknowledgeCarry(arrival, () => reloaded.shell.save(), slot);
    expect(reloaded.shell.load()).toEqual({ ok: true, value: undefined });

    const after = reloaded.driver.timesheet();
    const line = after.days[0]?.lines[0];

    // Filed, at the same minute, and saying so in the words the window prints.
    expect(after.submittedAt).toBe(before.submittedAt);
    expect(after.submittedAuto).toBe(false);
    expect(sheetStamp(after, reloaded.driver.day()).state).toBe('submitted');
    // Frozen: the window offers no edit on a sheet that has gone in.
    expect(editsOffered(after)).toBe(false);
    expect(reloaded.driver.claimTimesheet('1.1', 60, null).ok).toBe(false);
    // And both claims are standing on it, against a record that did not move.
    expect(line?.claimed).toBe(420);
    expect(line?.detail).toBe('vague');
    expect(line?.derived).toBe(before.days[0]?.lines[0]?.derived);
    expect(firstGap(after)).toBe('over');
  });

  /**
   * The retry decision, asserted.
   *
   * A retry builds the world again from nothing - the fund, the article, the
   * attempt and the employer are the whole of what crosses - so the ledger, the
   * claim and the submission go with the week they were about. That is the
   * right answer rather than a convenient one: the hours were never worked, the
   * customers whose estates they were booked against never had those tickets
   * this time round, and a submitted sheet that survived would be an invoice
   * for a week that did not happen.
   */
  it('starts a retried week with nothing on the sheet', () => {
    const rigged = rig();
    workTheMorning(rigged);
    run(rigged, 'timesheet claim 1.1 420');
    run(rigged, 'timesheet submit');

    expect(rigged.driver.timesheet().submittedAt).not.toBeNull();

    // The same carry a firing hands over, with the fund and the attempt on it
    // and nothing else - which is exactly `carryFrom` a retry record.
    const again = createWorldSession({
      farmFund: 12_000,
      attempt: 2,
      arcWeek: 1,
      employer: 'msp',
    });
    const player = again.engine.graph.getNode(COMPANY_IDS.player);

    expect(player?.fields[FIELDS.farmFund]).toBe(12_000);
    expect(player?.fields[FIELDS.timesheetLog]).toBeUndefined();
    expect(player?.fields[FIELDS.timesheetClaim]).toBeUndefined();
    expect(player?.fields[FIELDS.timesheetSubmittedAt]).toBeUndefined();
  });
});

describe('the ledger through a whole shift', () => {
  it('never bills a customer for the night', () => {
    const rigged = rig();
    workTheMorning(rigged);
    runTo(rigged, shiftEndTick(1));

    while (rigged.driver.state() === 'shift') {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    rigged.driver.clockOff();
    rigged.driver.startShift();
    runTo(rigged, shiftStartTick(2) + 30);

    const truth = rigged.driver.timesheetTruth();

    // Two days, each of them inside its own shift, and neither of them holding
    // the nine hundred minutes the office was dark for.
    for (const day of truth.days) {
      expect(day.attributed).toBeLessThanOrEqual(day.elapsed);
    }

    expect(truth.days.map((day) => day.day)).toEqual([1, 2]);
  });

  it('holds the sheet at the tenant the customer would recognise', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const clinic = rigged.driver.timesheetTruth().days[0]?.lines.find(
      (line) => line.kind === 'customer',
    );

    expect(clinic?.id).toBe(MSP_CUSTOMERS.elmwood);
    // The sheet names the tenant the way the invoice would, off the customer
    // node rather than off an id nobody outside the save has ever seen.
    expect(rigged.driver.timesheet().days[0]?.lines
      .some((line) => line.label.includes('ELMWOOD'))).toBe(true);
  });
});
