/**
 * THE CALENDAR SEAM (0.40.0): every date this game prints, on one calendar,
 * for whatever week of the career the player is actually on.
 *
 * 0.39.0 gave the world an arc-true calendar - `arcCalendarDay(week, day)` -
 * and then wired exactly two surfaces to it. Everything else folded whatever
 * week was being played onto week one, so in arc week four a customer-record
 * audit said "freeze since 28/09/1998" while `dir` in the same terminal window
 * stamped files 07/09/1998. Two calendars over one estate, three weeks apart,
 * one screen.
 *
 * This file is the gate for the fix, and it is deliberately CROSS-SURFACE:
 * the defect was never that one renderer was wrong on its own, it was that the
 * renderers DISAGREED. So the load-bearing assertions here are equalities
 * between what different windows print for the same minute, not a table of
 * expected strings - a table would have gone green with all five surfaces
 * wrong in the same direction.
 *
 * Three gates, and each is a thing a revert breaks:
 *
 *  1. WEEK ONE FOLDS TO ITSELF. Every arc-aware function, at week one, is
 *     byte-identical to the tick-only fold it replaced - spelled out here as
 *     the old arithmetic rather than trusted. This is the whole no-regression
 *     argument for a change that touched every date in the build: the
 *     probation week, which is what the shipped goldens and nearly every
 *     suite in this repo run, cannot have moved.
 *  2. WEEK FOUR MOVES, AND MOVES TOGETHER. The `dir` stamp, the `type` of
 *     SYSTEM.LOG, the Event Viewer row, the timesheet's invoice line and
 *     `ls -l`'s date column all name the twenty-eighth of September for the
 *     Monday of arc week four, and all agree with `arcCalendarDay`. Revert any
 *     ONE of them to the old fold and it disagrees with the other four.
 *
 *     THROUGH THE SHIPPED READS, which is a verifier round's correction and
 *     the load-bearing property of this gate: the first cut handed the week to
 *     `dirLines`, `typeLines` and `lineReads` as a literal, and hardcoding the
 *     RENDERERS' own week reads back to week one - the exact 0.39.0 defect -
 *     left all three green. So the drive rows here come out of
 *     `executeCommand`, whose one `arcWeekOf` read dates the whole family, and
 *     the sheet sentence comes out of `lineReads` reading the same graph
 *     field itself. The only hand-built desk left in this file is gate 3's,
 *     whose subject is the stamp rule and not the week read.
 *  3. A SEEDED STAMP DOES NOT MOVE. The estate is older than the career: a
 *     file the world was imaged with keeps its founding date in every week.
 *     That is the stamp rule in `fs.ts`, and it is asserted rather than
 *     implied because "make every date arc-aware" applied without thinking
 *     would have re-dated the 1994 log file to whatever week it was read in.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import { eventLogFileId } from '../../world/filesystem';
import { readEventLog } from '../../world/events';
import {
  arcCalendarDay,
  arcDate,
  arcDateForTick,
  arcDayForTick,
  arcFileStamp,
  calendarDate,
  dayForTick,
  minuteOfDay,
  MINUTES_PER_DAY,
  stampAt,
} from '../../world/hours';
import { type SheetLine } from '../../world/timesheet';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
import { type TerminalSession } from '../../world/fs';
import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import { offeredAtFor } from '../../world/titles';
import { dirLines } from './cmd-files';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import {
  executeUnix,
  parseUnixCommand,
  type SshSession,
} from './cmd-unix';
import { eventRowDate } from './events';
import { lineReads } from './timesheet';
import type { GameApi } from './types';

/** The week of the arc whose Monday is the twenty-eighth of September. */
const ARC_WEEK = 4;

/** What that Monday is, on the wall. The freeze already prints this date. */
const ARC_MONDAY = '28/09/1998';

/** And the same Monday in the probation week, which is where it all started. */
const WEEK_ONE_MONDAY = '07/09/1998';

const LOGFILES = 'C$\\WINDOWS\\SYSTEM32\\LOGFILES';
const PRINT_SERVER_LOGS = `\\\\PRINT-01\\${LOGFILES}`;

function worldAt(arcWeek: number): WorldSession {
  const session = createWorldSession(Object.freeze({
    farmFund: 0,
    attempt: 1,
    arcWeek,
    employer: 'workgrumble',
  }));

  // The jammed spooler is the one seeded fault that writes a machine's event
  // log, which is the only stamp in this estate DERIVED from the clock rather
  // than seeded as world data. It is therefore the only thing that can prove
  // the derived half moved.
  spawnWorldTicket(session.engine, 'ticket:wedged-spooler');

  return session;
}

function deskAt(arcWeek: number): TerminalSession {
  return {
    machineId: COMPANY_IDS.playerMachine,
    cwd: ['SUPPORT'],
    username: 'ppending',
    arcWeek,
  };
}

function apiFor(session: WorldSession): GameApi {
  const day = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });

  return {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day,
    dispatch: (id, actor, target, params) => session.engine.dispatch(
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
    employer: 'workgrumble',
    actor: COMPANY_IDS.player,
  };
}

/** An ssh session on a Linux box, which is what `ls -l` needs to exist. */
function onBox(session: WorldSession, api: GameApi): SshSession {
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: offeredAtFor('systems_engineer'),
  }]);
  executeCommand(parseCommand('promotion accept'), api);
  const opened = executeCommand(parseCommand('ssh pat@APP-01'), api);
  const ssh = opened.enterSession;

  if (ssh === undefined) {
    throw new Error('ssh did not open a session');
  }

  return ssh;
}

/** The tick of the last thing the print server's log has to say. */
function lastLogTick(session: WorldSession): number {
  const log = readEventLog(session.engine.graph.getField(
    COMPANY_IDS.printServer,
    FIELDS.eventLog,
  ));
  const last = log.at(-1);

  expect(log.length).toBeGreaterThan(0);

  return last?.tick ?? 0;
}

/**
 * The `dir` row for SYSTEM.LOG on the print server, as a player reads it -
 * through the parser and `executeCommand`, so the week on the stamp is the one
 * `cmd-run`'s own `arcWeekOf` read answers and not one this file handed in.
 */
function logRowIn(api: GameApi): string {
  const listed = executeCommand(
    parseCommand(`dir ${PRINT_SERVER_LOGS}`),
    api,
  ).lines;
  const row = listed.find((line) => line.includes('SYSTEM.LOG'));

  expect(row).toBeDefined();

  return row ?? '';
}

/**
 * The first dated row `type` prints out of the same file, the same way. Found
 * by the shape of a stamp rather than by the date this file expects, so the
 * selection cannot smuggle the assertion in.
 */
function logFileFirstRow(api: GameApi): string {
  const printed = executeCommand(
    parseCommand(`type ${PRINT_SERVER_LOGS}\\SYSTEM.LOG`),
    api,
  ).lines;
  const row = printed.find((line) => /\d{2}\/\d{2}\/\d{4}/.test(line));

  expect(row).toBeDefined();

  return row ?? '';
}

/** One line of a timesheet, which is a pure argument rather than a fixture. */
const INVOICE_LINE: SheetLine = Object.freeze({
  bucket: 'customer:arden',
  label: 'Arden Manufacturing',
  billable: true,
  derived: 150,
  claimed: 150,
  detail: 'detailed',
  edited: false,
});

/* -- gate 1: week one folds onto itself ----------------------------------- */

describe('the arc calendar at week one is the calendar that shipped', () => {
  /**
   * THE BYTE-IDENTITY GATE, and the strongest thing this lane has.
   *
   * The right-hand side of every assertion is the OLD arithmetic, written out
   * rather than called: `calendarDate(dayForTick(tick))` is what
   * `formatSimTime(tick).date` did, and `stampAt(dayForTick(tick),
   * minuteOfDay(tick))` is what `fileStamp(tick)` did, letter for letter.
   * Because `arcCalendarDay(1, day)` is `day`, the arc versions have to answer
   * the same for the whole of the probation week - which is what every golden,
   * every scripted week and every date literal in this repo runs.
   */
  it('answers exactly what the tick-only fold answered, minute for minute', () => {
    // A whole week of minutes at a stride that lands on every hour boundary
    // and every day roll: 5 days, plus the nights either side of them.
    for (let tick = 0; tick <= 7 * MINUTES_PER_DAY; tick += 7) {
      expect(arcDayForTick(1, tick)).toBe(dayForTick(tick));
      expect(arcDateForTick(1, tick)).toBe(calendarDate(dayForTick(tick)));
      expect(arcFileStamp(1, tick))
        .toBe(stampAt(dayForTick(tick), minuteOfDay(tick)));
    }

    for (let day = 1; day <= 40; day += 1) {
      expect(arcDate(1, day)).toBe(calendarDate(day));
      expect(arcCalendarDay(1, day)).toBe(day);
    }
  });

  it('prints the week-one dates the whole build was written against', () => {
    const session = worldAt(1);
    const api = apiFor(session);
    const ssh = onBox(session, api);

    expect(logRowIn(api)).toContain(WEEK_ONE_MONDAY);
    expect(logFileFirstRow(api)).toContain(WEEK_ONE_MONDAY);
    expect(eventRowDate(api, lastLogTick(session))).toBe(WEEK_ONE_MONDAY);
    expect(lineReads(api, 1, INVOICE_LINE)).toContain(WEEK_ONE_MONDAY);
    expect(executeUnix(parseUnixCommand('ls -la'), api, ssh).lines.join('\n'))
      .toContain('Sep  7 ');
  });
});

/* -- gate 2: week four moves, and moves together -------------------------- */

describe('every date surface prints the week of the arc it is in', () => {
  /**
   * THE DEFECT THIS SLICE KILLS, stated as an equality.
   *
   * Five surfaces, one minute, one date. Reverting any single one of them to
   * the tick-only fold leaves it saying 07/09 while the other four say 28/09,
   * and this goes red on that surface's line - which is the teeth, and the
   * reason the assertions are against each other rather than against a
   * constant that a wholesale revert could move in lockstep.
   */
  it('agrees with itself across dir, type, the viewer, the sheet and ls', () => {
    const session = worldAt(ARC_WEEK);
    const api = apiFor(session);
    const ssh = onBox(session, api);
    const tick = lastLogTick(session);

    // What the arc says the day is, from the fold everything is built on.
    const expected = calendarDate(arcCalendarDay(ARC_WEEK, dayForTick(tick)));
    expect(expected).toBe(ARC_MONDAY);

    // The drive: the listing's date column, and the file's own rows.
    expect(logRowIn(api)).toContain(expected);
    expect(logFileFirstRow(api)).toContain(expected);
    // The window onto the same field.
    expect(eventRowDate(api, tick)).toBe(expected);
    // The document that leaves the building.
    expect(lineReads(api, dayForTick(tick), INVOICE_LINE))
      .toContain(expected);
    // And the other family's format for the same day, which is the whole of
    // the difference between `ls -l` and `dir`.
    expect(executeUnix(parseUnixCommand('ls -la'), api, ssh).lines.join('\n'))
      .toContain('Sep 28 ');

    // Not week one, said out loud: an assertion that only checked agreement
    // would be satisfied by five surfaces all still folding to September the
    // seventh together.
    expect(logRowIn(api)).not.toContain(WEEK_ONE_MONDAY);
    expect(eventRowDate(api, tick)).not.toBe(WEEK_ONE_MONDAY);
  });

  it('rolls the month with the arc rather than at the end of the week', () => {
    const session = worldAt(ARC_WEEK);
    const graph = session.engine.graph;

    // Monday to Friday of the fourth week is the twenty-eighth of September to
    // the second of October, which is the same span the month-end freeze
    // already reasons about. A calendar that stopped at the five days in front
    // of the player could not cross a month at all.
    expect(arcDate(ARC_WEEK, 1)).toBe(ARC_MONDAY);
    expect(arcDate(ARC_WEEK, 3)).toBe('30/09/1998');
    expect(arcDate(ARC_WEEK, 4)).toBe('01/10/1998');
    expect(arcDate(ARC_WEEK, 5)).toBe('02/10/1998');

    // And a listing on the Thursday of that week is in October, which is a
    // thing no surface in this build could say before 0.40.0.
    session.engine.advance(3 * MINUTES_PER_DAY);
    expect(arcFileStamp(ARC_WEEK, session.engine.now()))
      .toContain('01/10/1998');
    expect(graph.getField(COMPANY_IDS.player, FIELDS.arcWeek)).toBe(ARC_WEEK);
  });
});

/* -- gate 3: the estate is older than the career -------------------------- */

describe('a seeded stamp keeps the date the world was imaged with', () => {
  /**
   * The other half of the stamp rule, and the reason "make every date
   * arc-aware" is not what this slice did.
   *
   * `SYSTEM.LOG` on a box nothing has happened to has been sitting there since
   * June 1994, and a scanner export directory was filled in 1997. Those dates
   * are world data - the estate the player walked into - and they do not move
   * with the week the player is on, in the fourth arc week or the fortieth.
   */
  it('does not re-date a 1994 file into the week it is read in', () => {
    for (const arcWeek of [1, ARC_WEEK, 40]) {
      const session = worldAt(arcWeek);
      const quiet = dirLines(
        session.engine.graph,
        deskAt(arcWeek),
        `C:\\WINDOWS\\SYSTEM32\\LOGFILES`,
      ).lines.find((line) => line.includes('SYSTEM.LOG'));

      // Empty log, so the file keeps the stamp it was imaged with - which is
      // the last time anything touched it, whatever week it is now.
      expect(quiet).toContain('11/06/1994  09:12');
      expect(session.engine.graph.getNode(
        eventLogFileId(COMPANY_IDS.playerMachine),
      )).toBeDefined();
    }
  });
});
