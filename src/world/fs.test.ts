/**
 * Where a path lands, and what is behind it.
 *
 * Path resolution is the part of a filesystem that a player leans on without
 * ever thinking about it, and the part that is wrong in every fake one: `..`
 * above the root, a name in the wrong case, a trailing slash, a file with a
 * path underneath it, a directory somebody else's rights are on. Each of those
 * has a right answer in this family, the right answer is here, and where it
 * differs from a unix shell - case, `~`, the drive letter - the difference is
 * asserted rather than left to be discovered by somebody who knows.
 *
 * The other half of the file is the two entries this world DERIVES, and the
 * invariant under them: a spool directory is a print queue, and the two of
 * them are never allowed to disagree about how much work is stuck.
 */

import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from './actions';
import { COMPANY_IDS } from './company';
import { FIELDS } from './fields';
import { EVENT_LEVEL_LABELS, readEventLog } from './events';
import {
  eventLogFileId,
  SCANNER_EXPORT_BYTES,
  scannerExportDirId,
  spoolDirId,
} from './filesystem';
import {
  displayPath,
  eventLogText,
  findPath,
  listEntries,
  promptPath,
  readSpoolJobs,
  readStoredFiles,
  resolvePath,
  spoolDepth,
  spoolDisagreements,
  storedDisagreements,
  type TerminalSession,
} from './fs';
import { calendarDate, fileStamp, stampAt, WEEK_STARTS_ON } from './hours';
import { createWorldSession, type WorldSession } from './session';
import { spawnWorldTicket } from './tickets';

const DESK: TerminalSession = {
  machineId: COMPANY_IDS.playerMachine,
  cwd: ['SUPPORT'],
  username: 'ppending',
};

function world(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession();

  for (const id of ticketIds) {
    spawnWorldTicket(session.engine, id);
  }

  return session;
}

/**
 * What a path landed on, as the entry rather than as the path.
 *
 * The path is what the player typed - this family echoes the case it was
 * given, which `cmd-files.test.ts` asserts - so a test about WHERE a path
 * lands has to look at the thing at the end of it.
 */
function at(session: WorldSession, path: string, from = DESK): string {
  const found = findPath(session.engine.graph, from, path);

  return found.ok
    ? `${found.entry.kind}:${found.entry.nodeId ?? found.entry.name}`
    : `fault:${found.fault}`;
}

describe('path resolution', () => {
  it('walks absolute, relative and root-relative paths to the same place', () => {
    const session = world();

    for (const path of [
      'C:\\WINDOWS\\SYSTEM32',
      'c:\\windows\\system32',
      'C:/WINDOWS/SYSTEM32',
      'C:\\WINDOWS\\SYSTEM32\\',
      '\\WINDOWS\\SYSTEM32',
      '..\\WINDOWS\\SYSTEM32',
      'C:\\WINDOWS\\.\\SYSTEM32',
      'C:\\WINDOWS\\SYSTEM32\\LOGFILES\\..',
    ]) {
      expect(at(session, path), path)
        .toBe('directory:dir:beige-box/c/windows/system32');
    }
  });

  /**
   * Case is the one every unix hand gets wrong here, and it is not a detail:
   * this family folds case and keeps it. `c:\windows` finds the directory, and
   * the directory is still called WINDOWS afterwards.
   */
  it('folds case to find a name and prints the name it was given', () => {
    const session = world();
    const found = findPath(session.engine.graph, DESK, 'c:\\dOcUmEnTs AnD sEtTiNgS');

    expect(found.ok && found.entry.name).toBe('Documents and Settings');
  });

  it('goes nowhere above the root, and says nothing about it', () => {
    const session = world();

    for (const path of ['C:\\..', 'C:\\..\\..\\..', '..\\..\\..\\..']) {
      expect(at(session, path), path).toBe('directory:dir:beige-box/c');
    }

    // And the walk back down still works from up there, which is the half
    // that catches a `..` implemented as "give up".
    expect(at(session, 'C:\\..\\..\\WINDOWS'))
      .toBe('directory:dir:beige-box/c/windows');
  });

  it('refuses what is not there, in four different ways', () => {
    const session = world();

    expect(at(session, 'C:\\NOTHING')).toBe('fault:missing');
    // A file with a path under it is not a path, which is what the real shell
    // says about it too.
    expect(at(session, 'C:\\AUTOEXEC.BAT\\WINDOWS')).toBe('fault:missing');
    expect(at(session, 'D:\\')).toBe('fault:no-such-drive');
    expect(at(session, '\\\\NOWHERE-01\\C$')).toBe('fault:no-network-path');
    // The share has to be the administrative one: this estate reaches a box
    // through `C$` and has no other network path in it.
    expect(at(session, '\\\\PRINT-01\\common')).toBe('fault:no-network-path');
  });

  it('stops at rights somebody else holds rather than pretending it is empty', () => {
    const session = world();

    expect(at(session, '\\\\FILES-01\\C$\\PAYROLL'))
      .toBe('directory:dir:files/c/payroll');
    // The entry is visible from its parent - which is what an ACL does - and
    // the walk into it is refused.
    expect(at(session, '\\\\FILES-01\\C$\\PAYROLL\\ANYTHING'))
      .toBe('fault:denied');
  });

  it('expands the variable this family has and refuses the one it has not', () => {
    const session = world();

    expect(at(session, '%USERPROFILE%'))
      .toBe('directory:dir:beige-box/c/documents-and-settings/ppending');
    expect(at(session, '%userprofile%\\My Documents')).toBe(
      'directory:dir:beige-box/c/documents-and-settings/ppending/my-documents',
    );
    // There is no `~` in cmd. It is not a home directory, it is a name a
    // directory could have had, and pretending otherwise would teach the
    // player a shell that does not exist.
    expect(at(session, '~')).toBe('fault:no-tilde');
    expect(at(session, '~/My Documents')).toBe('fault:no-tilde');
  });

  it('takes a path with spaces in it, quoted or not', () => {
    const session = world();

    for (const path of [
      '"C:\\Documents and Settings"',
      'C:\\Documents and Settings',
    ]) {
      expect(at(session, path), path)
        .toBe('directory:dir:beige-box/c/documents-and-settings');
    }
  });

  it('reaches another box through its administrative share only', () => {
    const session = world();
    const resolved = resolvePath(
      session.engine.graph,
      DESK,
      '\\\\PRINT-01\\C$\\WINDOWS',
    );

    expect(resolved.ok && resolved.location.machineId)
      .toBe(COMPANY_IDS.printServer);
    expect(resolved.ok && resolved.location.host).toBe('PRINT-01');
    expect(resolved.ok && displayPath(resolved.location))
      .toBe('\\\\PRINT-01\\C$\\WINDOWS');
  });

  it('prints the prompt path the way a prompt prints it', () => {
    expect(promptPath([])).toBe('C:\\');
    expect(promptPath(['SUPPORT'])).toBe('C:\\SUPPORT');
    expect(promptPath(['WINDOWS', 'SYSTEM32'])).toBe('C:\\WINDOWS\\SYSTEM32');
  });
});

/**
 * The wall calendar, which exists because a directory listing has a date
 * column and the clock this game counts on has no year in it.
 *
 * It is pinned here rather than left implicit for two reasons: the anchor is a
 * real Monday and has to stay one, and it has to stay AFTER everything the
 * fiction already says happened - a rule written in March, a leaver who went in
 * April, a second-factor rollout that finished in June.
 */
describe('the week in the year it happens in', () => {
  it('starts on a Monday, after everything this world remembers', () => {
    expect(WEEK_STARTS_ON).toEqual({ year: 1998, month: 9, dayOfMonth: 7 });
    expect(new Date(Date.UTC(1998, 8, 7)).getUTCDay()).toBe(1);

    expect(calendarDate(1)).toBe('07/09/1998');
    // Friday, which is the day the review happens on.
    expect(calendarDate(5)).toBe('11/09/1998');
    // And it rolls over a month boundary rather than counting past the end of
    // September, which is what a date that is really a date does.
    expect(calendarDate(25)).toBe('01/10/1998');
  });

  it('stamps a minute the way a listing prints one', () => {
    expect(stampAt(1, 8 * 60 + 41)).toBe('07/09/1998  08:41');
    // Tick zero is 08:00 on day one, which is where the clock starts.
    expect(fileStamp(0)).toBe('07/09/1998  08:00');
    expect(fileStamp(60)).toBe('07/09/1998  09:00');
    expect(fileStamp(1_440)).toBe('08/09/1998  08:00');
  });
});

describe('the machine log, as a file', () => {
  it('is the same rows the Event Viewer paints, from the same field', () => {
    const session = world('ticket:wedged-spooler');
    const log = readEventLog(session.engine.graph.getField(
      COMPANY_IDS.printServer,
      FIELDS.eventLog,
    ));
    const text = eventLogText(session.engine.graph, COMPANY_IDS.printServer);
    const rows = text.split('\n');

    expect(log.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(log.length);

    for (const [index, event] of log.entries()) {
      const row = rows[index] ?? '';

      expect(row).toContain(fileStamp(event.tick));
      expect(row).toContain(EVENT_LEVEL_LABELS[event.level]);
      expect(row).toContain(event.source);
      expect(row).toContain(String(event.id));
      expect(row).toContain(event.message);
    }
  });

  it('is dated by the last thing written to it, and empty until then', () => {
    const session = world('ticket:wedged-spooler');
    const graph = session.engine.graph;
    const found = findPath(
      graph,
      DESK,
      '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\LOGFILES\\SYSTEM.LOG',
    );
    const log = readEventLog(graph.getField(
      COMPANY_IDS.printServer,
      FIELDS.eventLog,
    ));
    const last = log.at(-1);

    expect(found.ok && found.entry.nodeId)
      .toBe(eventLogFileId(COMPANY_IDS.printServer));
    expect(found.ok && found.entry.modified)
      .toBe(fileStamp(last?.tick ?? 0));
    expect(found.ok && found.entry.size).toBeGreaterThan(0);

    // A box nothing has happened to has an empty log file that still keeps
    // the stamp it was imaged with, because that is the last time anybody
    // touched it.
    const quiet = findPath(
      graph,
      DESK,
      'C:\\WINDOWS\\SYSTEM32\\LOGFILES\\SYSTEM.LOG',
    );

    expect(quiet.ok && quiet.entry.size).toBe(0);
    expect(quiet.ok && quiet.entry.modified).toBe('11/06/1994  09:12');
  });
});

describe('the spool directory and the queue behind it', () => {
  it('holds one file per queued job, and nothing when nothing is queued', () => {
    const empty = world();

    expect(spoolDepth(empty.engine.graph, COMPANY_IDS.printServer)).toBe(0);
    expect(listEntries(
      empty.engine.graph,
      COMPANY_IDS.printServer,
      spoolDirId(COMPANY_IDS.printServer),
    )).toEqual([]);

    const jammed = world('ticket:wedged-spooler');
    const files = listEntries(
      jammed.engine.graph,
      COMPANY_IDS.printServer,
      spoolDirId(COMPANY_IDS.printServer),
    );

    expect(files).toHaveLength(47);
    expect(files[0]?.name).toBe('00001.SPL');
    expect(files.at(-1)?.name).toBe('00047.SPL');
    // Every one of them is a real size and a real minute off the world's own
    // job list - and four of them are the same size, because four of them are
    // the same delivery note sent four times.
    expect(files.every((file) => file.size > 0)).toBe(true);
    expect(files.filter((file) => file.size === 40_960)).toHaveLength(4);
    expect(files[0]?.modified).toBe('07/09/1998  07:58');
  });

  /**
   * The agreement gate, driven rather than asserted at rest.
   *
   * Every mutation this world has that touches a print queue, in the order a
   * player meets them: the seed, the ticket that jams the spooler, the clear,
   * and the restart afterwards. It has teeth - removing the line that empties
   * the job list in `printer.clear_queue` turns the third step red - and the
   * solvability harness runs the same check after every step of every path.
   */
  it('agrees with the queue after every mutation that touches it', () => {
    const session = world();
    const graph = session.engine.graph;
    const agrees = (): readonly string[] => spoolDisagreements(graph);
    const queued = (): unknown => graph.getField(
      COMPANY_IDS.printer,
      FIELDS.queueLen,
    );

    expect(agrees()).toEqual([]);
    expect(queued()).toBe(0);

    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');
    expect(agrees()).toEqual([]);
    expect(queued()).toBe(47);
    expect(spoolDepth(graph, COMPANY_IDS.printServer)).toBe(47);

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      { spooler: COMPANY_IDS.spooler },
    )).toEqual({ ok: true });
    expect(agrees()).toEqual([]);
    expect(queued()).toBe(0);
    expect(spoolDepth(graph, COMPANY_IDS.printServer)).toBe(0);

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.spooler,
      {},
    )).toEqual({ ok: true });
    expect(agrees()).toEqual([]);
    expect(spoolDepth(graph, COMPANY_IDS.printServer)).toBe(0);
  });

  it('reads a job list back, and drops a line it cannot read', () => {
    expect(readSpoolJobs('')).toEqual([]);
    expect(readSpoolJobs(undefined)).toEqual([]);
    expect(readSpoolJobs('4096|07/09/1998  08:01')).toEqual([
      { bytes: 4_096, modified: '07/09/1998  08:01' },
    ]);
    expect(readSpoolJobs('nonsense\n-1|x\n4096|\n4096|07/09/1998  08:01'))
      .toHaveLength(1);
  });

  it('lists a directory a program filled, and keeps its total honest', () => {
    const session = world();
    const graph = session.engine.graph;
    const exports = scannerExportDirId(COMPANY_IDS.warehouseMachine);
    const files = listEntries(graph, COMPANY_IDS.warehouseMachine, exports);

    // Twelve months of barcode reads, each a size and a minute and nothing
    // else - which is what a listing prints and all this world knows.
    expect(files).toHaveLength(12);
    expect(files[0]?.name).toBe('SCN9709.EXP');
    expect(files[0]?.modified).toBe('30/09/1997  23:58');
    expect(files.every((file) => file.size > 0)).toBe(true);
    expect(files.every((file) => file.nodeId === null)).toBe(true);
    expect(files.every((file) => file.text === null)).toBe(true);
    expect(files.reduce((total, file) => total + file.size, 0))
      .toBe(SCANNER_EXPORT_BYTES);

    // And the whole pile is three hundred megabytes on a drive with three
    // left, which is the entire diagnosis and is readable from one screen.
    expect(SCANNER_EXPORT_BYTES).toBeGreaterThan(
      Number(graph.getField(COMPANY_IDS.warehouseMachine, FIELDS.diskFree)),
    );
    expect(storedDisagreements(graph)).toEqual([]);
  });

  /**
   * The same teeth the queue's gate has, on the other pile the world holds
   * twice: the listing a directory prints and the number the drive gets back
   * when it is emptied. Doctored by hand, because nothing the player can
   * dispatch is allowed to take them apart.
   */
  it('says so when a directory listing and its byte total disagree', () => {
    const session = world();
    const exports = scannerExportDirId(COMPANY_IDS.warehouseMachine);

    session.engine.applySetup([{
      op: 'setField',
      id: exports,
      field: FIELDS.storedBytes,
      value: 12,
    }]);

    const complaints = storedDisagreements(session.engine.graph);

    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain(exports);
    expect(complaints[0]).toContain('12 byte(s)');

    // A total with no listing under it at all is the same fault the other way
    // round, and it is caught for the same reason.
    session.engine.applySetup([
      { op: 'setField', id: exports, field: FIELDS.storedFiles, value: '' },
      { op: 'setField', id: exports, field: FIELDS.storedBytes, value: 0 },
    ]);
    expect(storedDisagreements(session.engine.graph)).toEqual([]);
  });

  it('reads a stored listing back, and drops a line it cannot read', () => {
    expect(readStoredFiles('')).toEqual([]);
    expect(readStoredFiles(undefined)).toEqual([]);
    expect(readStoredFiles('SCN9709.EXP|22020096|30/09/1997  23:58')).toEqual([
      { name: 'SCN9709.EXP', bytes: 22_020_096, modified: '30/09/1997  23:58' },
    ]);
    expect(readStoredFiles(
      'nonsense\n|4096|x\nA|-1|x\nA||x\nSCN.EXP|4096|30/09/1997  23:58',
    )).toHaveLength(1);
  });

  it('names the printer and the box when the two come apart', () => {
    const session = world('ticket:wedged-spooler');

    // The failure this gate exists for, made by hand: a queue emptied without
    // the files going with it.
    session.engine.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      { spooler: COMPANY_IDS.spooler },
    );
    session.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.printer,
      field: FIELDS.spoolJobs,
      value: '4096|07/09/1998  08:01',
    }]);

    const complaints = spoolDisagreements(session.engine.graph);

    expect(complaints).toHaveLength(2);
    expect(complaints[0]).toContain(COMPANY_IDS.printer);
    expect(complaints[1]).toContain(COMPANY_IDS.printServer);
  });
});
