/**
 * The Timesheet window, proven through the REAL path (0.30.0, slice 1).
 *
 * There is no DOM in this suite, so - exactly as `projects.test.ts` drives the
 * plan surface's four mapping functions and `monitor.test.ts` drives the
 * board's two verbs - this drives what the window is MADE of against a real
 * world worked through the shipped terminal:
 *
 *  - `day.timesheet()`, the sheet the window is a read of;
 *  - `sheetItems`, which is the window's whole layout decision - the order of
 *    the rows, which day each belongs to, the handle each line is addressed
 *    by, whether the rest of the day is on the sheet at all, and whether the
 *    row offers an edit;
 *  - the readings the cells are written from: `gapOf`, `lineReads`,
 *    `unattributedLine`, `totalsLine`, `sheetStamp`.
 *
 * Nothing here is a view model somebody made up for the test. The world is
 * driven minute by minute through the shipped parser and the shipped driver,
 * every edit goes through the same `claimTimesheet` the buttons call, and the
 * assertions are facts about a morning that was actually worked.
 *
 * WHERE THE TEETH ARE, said out loud because each of these is a thing that
 * would ship broken otherwise:
 *
 *  - `gapOf` reads `edited`, not the two numbers. Change it to compare
 *    `claimed` against `derived` and the two cases below - a claim for exactly
 *    what the records say, and a line flipped to vague without a minute moving
 *    - both go back to reading as untouched, and both go red here.
 *  - the rest of the day is on the sheet ONLY where there is some. Drop the
 *    guard and the service-desk shape grows an "unattributed" row saying zero
 *    under every day of the week, which reds.
 *  - a submitted sheet offers no edit. Take the `submittedAt` half out of
 *    `editsOffered` and every row on a filed sheet goes editable again, which
 *    reds - and the refusal beside the button disappears with it.
 *  - the SENIOR DESK's window is the middle shape (0.40.0) and it is neither of
 *    the other two: rows to argue with, which the probationer's has not, and no
 *    billable word at the end of them, which the engineer's has. Key the window
 *    on `single_bucket` versus everything else and the flag comes back; key the
 *    edits on the engineer's shape alone and the rung loses the argument that
 *    is the whole point of it.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { CAREER_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import {
  calendarDate,
  shiftStartTick,
  WORKING_MINUTES_PER_DAY,
} from '../../world/hours';
import { MSP_CHANNELS } from '../../world/msp-company';
import { MSP_WEEK } from '../../world/msp-week';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { findWorldTicket } from '../../world/tickets';
import {
  hoursLabel,
  lineFlag,
  type SheetDay,
  SERVICE_DESK_LABEL,
  type Timesheet,
  timesheetLines,
} from '../../world/timesheet';
import { AppStateStore } from '../app-state';
import { carryForStart } from '../start';
import { DayDriver, TICK_INTERVAL_MS } from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import {
  editsOffered,
  gapOf,
  type LineItem,
  lineReads,
  type SheetItem,
  sheetItems,
  sheetStamp,
  shapeLine,
  submitRefusal,
  totalsLine,
  unattributedLine,
} from './timesheet';
import type { GameApi } from './types';
import { offeredAtFor } from '../../world/titles';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
}

/** The MSP desk, with the promotion taken through the real verb when asked. */
function rig(promoted = true): Rig {
  const session = createWorldSession(MSP_CARRY);
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
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
  }

  return { session, driver, api };
}

/** A line typed at the shipped terminal, through the shipped parser. */
function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

function runTo(rigged: Rig, tick: number): void {
  while (rigged.session.engine.now() < tick
    && rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * A mixed morning at the MSP, worked through the terminal.
 *
 * Mixed on purpose, and the same morning `../timesheet.test.ts` drives: the
 * project's own audit, a rule carried, and an act on a different customer's
 * estate, with time passing between them. A morning spent on one thing would
 * produce a sheet with one row on it and prove nothing about a layout.
 */
function workTheMorning(rigged: Rig): void {
  rigged.driver.startShift();
  runTo(rigged, shiftStartTick(1) + 20);
  run(rigged, 'fw audit ARD-FW-01');
  runTo(rigged, shiftStartTick(1) + 50);
  run(rigged, 'fw migrate wan-default');
  runTo(rigged, shiftStartTick(1) + 80);
  run(rigged, 'rotate ELM-WS-01 90');
  runTo(rigged, shiftStartTick(1) + 110);
}

/** The rows the window would draw, as the window asks for them. */
function items(rigged: Rig): readonly SheetItem[] {
  return sheetItems(rigged.driver.timesheet(), rigged.driver.day());
}

function lineItems(rigged: Rig): readonly LineItem[] {
  return items(rigged).filter(
    (item): item is LineItem => item.kind === 'line',
  );
}

function firstLine(rigged: Rig): LineItem {
  const line = lineItems(rigged)[0];

  if (line === undefined) {
    throw new Error('The sheet has no lines on it.');
  }

  return line;
}

function dayOf(sheet: Readonly<Timesheet>, day: number): SheetDay {
  const found = sheet.days.find((candidate) => candidate.day === day);

  if (found === undefined) {
    throw new Error(`The sheet has no day ${String(day)} on it.`);
  }

  return found;
}

describe('the sheet the desk fills in', () => {
  it('is one unattributed bucket a day with nothing on it to decide', () => {
    const rigged = rig(false);
    workTheMorning(rigged);

    const sheet = rigged.driver.timesheet();
    const rows = lineItems(rigged);

    expect(sheet.shape).toBe('single_bucket');
    // One line, and it is the joke: seven and a half hours against a bucket
    // that is nobody's invoice, on a day that is not over.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.line.label).toBe(SERVICE_DESK_LABEL);
    expect(rows[0]?.line.billable).toBe(false);
    expect(hoursLabel(rows[0]?.line.derived ?? 0)).toBe('7h 30m');

    // Nothing to argue with, so the window offers no argument - and says so
    // in its own sentence rather than by handing over a dead control.
    expect(editsOffered(sheet)).toBe(false);
    expect(rows.every((row) => !row.editable)).toBe(true);
    expect(shapeLine(sheet)).toContain('nothing on it to decide');

    // And no "unattributed" row anywhere: a desk sheet attributes nothing at
    // all, so a row saying so under every day would be noise pretending to be
    // a mechanic.
    expect(items(rigged).some((item) => item.kind === 'gap')).toBe(false);
    expect(unattributedLine(dayOf(sheet, 1))).toBeNull();
  });

  it('still has the one thing there is to do with it', () => {
    const rigged = rig(false);
    workTheMorning(rigged);

    expect(submitRefusal(rigged.driver.timesheet())).toBeNull();
    expect(rigged.driver.submitTimesheet().ok).toBe(true);

    const sheet = rigged.driver.timesheet();

    expect(sheetStamp(sheet, rigged.driver.day()).state).toBe('submitted');
    expect(submitRefusal(sheet)).toContain('That sheet has gone in');
  });
});

/**
 * The senior desk's window (0.40.0): the middle rung of the paperwork ramp.
 *
 * Driven at the shop the rung is actually hired into, through the shipped
 * dispatch, because the question is what the window makes of a REAL week -
 * `world/timesheet.test.ts` drives the fold itself over a shop with customers
 * on it, which no shop this rung can be hired at has.
 */
describe('the sheet the senior desk has to make add up', () => {
  function seniorRig(): { readonly driver: DayDriver; readonly session: WorldSession } {
    const session = createWorldSession(carryForStart('sd_senior'));
    const driver = new DayDriver(
      session.engine,
      COMPANY_IDS.player,
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

    driver.startShift();

    // One real job, off the shipped content, through the shipped dispatch.
    for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
      const step = findWorldTicket(ticket.id)?.paths[0]?.steps[0];

      if (step === undefined) {
        continue;
      }

      if (driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      ).ok) {
        // And an hour of the morning going by on it, because a stretch owns
        // the minutes AFTER it: a job dispatched at nine on a clock that has
        // not moved is worth no time to anybody, on this sheet or a real one.
        while (session.engine.now() < shiftStartTick(1) + 60
          && driver.state() === 'shift') {
          driver.step(TICK_INTERVAL_MS);
        }

        return { driver, session };
      }
    }

    throw new Error('The senior desk\'s Monday deals no job this rig can work.');
  }

  it('draws lines to argue with, and no billable word at the end of them', () => {
    const rigged = seniorRig();
    const sheet = rigged.driver.timesheet();
    const rows = sheetItems(sheet, rigged.driver.day());
    const lines = rows.filter((row): row is LineItem => row.kind === 'line');

    expect(sheet.shape).toBe('per_customer');
    expect(lines.length).toBeGreaterThan(0);

    // The two things this window has that the probationer's has not: minutes
    // read off the records rather than written by the shape, and an edit on
    // every row - because a sheet that says whose day it was has something on
    // it to disagree with.
    expect(lines.every((row) => row.line.derived > 0)).toBe(true);
    expect(sheet.days[0]?.derived).toBeLessThan(WORKING_MINUTES_PER_DAY);
    expect(editsOffered(sheet)).toBe(true);
    expect(lines.every((row) => row.editable)).toBe(true);
    expect(rows.some((row) => row.kind === 'gap')).toBe(true);
    expect(unattributedLine(sheet.days[0] as SheetDay)).not.toBeNull();

    // And the thing it has NOT that the engineer's window has: a billable
    // split. Every row would come out as "internal", which would read as a
    // judgement about the work rather than as the absence of a column.
    expect(lines.every((row) => lineFlag(row.line, row.shape) === '')).toBe(true);
    expect(lines.every((row) => !row.line.billable)).toBe(true);
    expect(shapeLine(sheet)).toContain('off the records');
    expect(shapeLine(sheet)).not.toContain('billable');
    expect(timesheetLines(sheet, rigged.driver.day()).join('\n'))
      .not.toContain('internal');
  });
});

describe('the sheet the engineer argues with', () => {
  it('lays the week out a day at a time, lines under their day', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const sheet = rigged.driver.timesheet();
    const rows = items(rigged);

    expect(sheet.shape).toBe('per_customer_project');
    // A heading, then this day's lines, then what is left of the day - in
    // that order, which is the whole of the layout.
    expect(rows[0]?.kind).toBe('day');
    expect(rows.at(-1)?.kind).toBe('gap');
    expect(lineItems(rigged).length).toBeGreaterThan(1);

    // Every line is addressed the way the terminal addresses it, so a player
    // reading the window can type at the other door without translating.
    expect(lineItems(rigged).map((row) => row.handle))
      .toEqual(['1.1', '1.2']);
    expect(rows.filter((row) => row.kind === 'day')).toHaveLength(1);
    expect(rows.find((row) => row.kind === 'day')?.today).toBe(true);

    // The project as a line of its own, carrying its own name, beside the
    // customer whose screen went round.
    expect(lineItems(rigged).some((row) => row.line.label.includes('edge')))
      .toBe(true);
    expect(lineItems(rigged).every((row) => row.line.billable)).toBe(true);
    expect(lineItems(rigged).every((row) => row.editable)).toBe(true);
  });

  it('shows one number until the player has been in, then two', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const before = firstLine(rigged);

    expect(gapOf(before.line)).toBe('unedited');

    // The pad, through the verb the button calls.
    const padded = before.line.derived + 60;

    expect(rigged.driver.claimTimesheet(before.handle, padded, null).ok)
      .toBe(true);

    const after = firstLine(rigged);

    expect(after.handle).toBe(before.handle);
    expect(gapOf(after.line)).toBe('over');
    expect(after.line.claimed).toBe(padded);
    // And the half the whole architecture is about: the record did not move.
    expect(after.line.derived).toBe(before.line.derived);

    // The other line is untouched, so it still shows one number. A sheet that
    // grew a second column everywhere the moment anything was edited would be
    // a sheet nobody could see the edit on.
    expect(gapOf(lineItems(rigged)[1]?.line ?? after.line)).toBe('unedited');
  });

  it('keeps the second number on a line claimed for what it was worth', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const line = firstLine(rigged);

    // Claiming EXACTLY what the records say is still the player saying it, and
    // the sheet has to go on showing that they did. This is the teeth on
    // `gapOf` reading `edited` rather than comparing the two numbers.
    expect(
      rigged.driver.claimTimesheet(line.handle, line.line.derived, null).ok,
    ).toBe(true);

    const level = firstLine(rigged);

    expect(level.line.edited).toBe(true);
    expect(level.line.claimed).toBe(level.line.derived);
    expect(gapOf(level.line)).toBe('level');
  });

  it('counts a line flipped to vague as a line the player wrote', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const line = firstLine(rigged);

    expect(rigged.driver.claimTimesheet(line.handle, null, 'vague').ok)
      .toBe(true);

    const vague = firstLine(rigged);

    // Not a minute has moved and the line is still the player's own words -
    // the second half of the teeth on the edited read.
    expect(vague.line.claimed).toBe(vague.line.derived);
    expect(gapOf(vague.line)).toBe('level');
    expect(vague.line.detail).toBe('vague');
  });

  it('shows each line as the sentence it will actually go out as', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const line = firstLine(rigged);
    const written = lineReads(line.day, line.line);

    // Date, estate, hours - the shape the research says survives a finance
    // team going through an invoice line by line.
    expect(written).toContain(calendarDate(line.day));
    expect(written).toContain(line.line.label);
    expect(written).toContain(hoursLabel(line.line.claimed));

    expect(rigged.driver.claimTimesheet(line.handle, null, 'vague').ok)
      .toBe(true);

    // And the other one, which is the whole of what "vague" buys and costs:
    // one word, no date, no estate, nothing to check.
    expect(lineReads(line.day, firstLine(rigged).line)).toBe('consulting');
  });

  it('puts the rest of the day on the sheet, on nobody\'s invoice', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const sheet = rigged.driver.timesheet();
    const day = dayOf(sheet, 1);
    const said = unattributedLine(day);

    expect(day.unattributed).toBeGreaterThan(0);
    expect(said).toContain(hoursLabel(day.unattributed));
    expect(said).toContain('nobody\'s invoice');
    // Named as a subtraction rather than as a telling-off: nothing is charged
    // for it, which is the sentence the house rule about honesty requires.
    expect(said).toContain('Nothing is charged for it');
    expect(items(rigged).filter((item) => item.kind === 'gap')).toHaveLength(1);
  });

  it('totals a day, and says the second figure only once it differs', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const before = rigged.driver.timesheet();

    expect(totalsLine(before.derived, before.claimed))
      .toBe(`${hoursLabel(before.derived)} worked`);

    const line = firstLine(rigged);

    const padded = line.line.derived + 60;

    expect(rigged.driver.claimTimesheet(line.handle, padded, null).ok)
      .toBe(true);

    const after = rigged.driver.timesheet();

    expect(after.claimed).toBe(before.claimed + 60);
    expect(totalsLine(after.derived, after.claimed))
      .toBe(`${hoursLabel(after.derived)} worked, ${
        hoursLabel(after.claimed)
      } claimed`);
    // The week's worked total did not move, because nothing about the week
    // moved: only what is being said about it did.
    expect(after.derived).toBe(before.derived);
  });

  it('is the same sheet the terminal prints, edited from either door', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const line = firstLine(rigged);
    const padded = line.line.derived + 90;

    expect(rigged.driver.claimTimesheet(line.handle, padded, null).ok)
      .toBe(true);

    // The window's claim, read back off the terminal's own formatter. There is
    // one sheet behind the two doors, and this is what says so.
    const printed = timesheetLines(
      rigged.driver.timesheet(),
      rigged.driver.day(),
    ).join('\n');

    expect(printed).toContain(hoursLabel(padded));
    expect(printed).toContain(line.handle);
    expect(firstLine(rigged).line.claimed).toBe(padded);
  });
});

describe('the stamp on the sheet', () => {
  it('says when it is due, and says so louder on the day', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const sheet = rigged.driver.timesheet();

    // The clock is a parameter of the reading rather than a thing this has to
    // spend five simulated days reaching: the window hands `day.day()` in, and
    // the honest Friday of a whole driven week is `../timesheet.test.ts`'s.
    expect(sheetStamp(sheet, 1).state).toBe('due');
    expect(sheetStamp(sheet, 1).line).toContain('Nothing has gone in yet');
    expect(sheetStamp(sheet, sheet.dueDay).state).toBe('due-today');
    expect(sheetStamp(sheet, sheet.dueDay).line).toContain('end of today');
  });

  it('freezes the whole window the minute it goes in', () => {
    const rigged = rig();
    workTheMorning(rigged);

    const line = firstLine(rigged);

    expect(rigged.driver.claimTimesheet(line.handle, 420, null).ok).toBe(true);
    expect(rigged.driver.submitTimesheet().ok).toBe(true);

    const sheet = rigged.driver.timesheet();
    const stamp = sheetStamp(sheet, rigged.driver.day());

    expect(stamp.state).toBe('submitted');
    expect(stamp.line).toMatch(/Submitted at \d\d:\d\d on day \d/);
    // No edit affordance survives it - not one row, not the button.
    expect(editsOffered(sheet)).toBe(false);
    expect(lineItems(rigged).every((row) => !row.editable)).toBe(true);
    expect(submitRefusal(sheet)).toContain('That sheet has gone in');
    // And the claim is still standing on the frozen sheet, which is the point
    // of freezing it: what was sent is what is on the screen.
    expect(firstLine(rigged).line.claimed).toBe(420);
  });

  it('says out loud when the week filed it for you', () => {
    const rigged = rig();
    workTheMorning(rigged);

    expect(rigged.driver.submitTimesheet(true).ok).toBe(true);

    const stamp = sheetStamp(rigged.driver.timesheet(), rigged.driver.day());

    expect(stamp.state).toBe('auto-submitted');
    expect(stamp.line).toContain('Nobody filled it in');
    expect(stamp.line).toContain('exactly as it stood');
  });
});
