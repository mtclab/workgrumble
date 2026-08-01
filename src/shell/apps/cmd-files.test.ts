/**
 * What the four file commands PRINT, held to the row each of them ships with
 * in `docs/research/terminal-fidelity.md`.
 *
 * The claim in that table is not "it lists things": it is a volume header, a
 * date-and-time column, `<DIR>` where a size would be, a right-aligned size
 * with thousands in it, a two-line footer counting files, bytes and what is
 * left on the drive - and, for the refusals, the real tool's own wording. A
 * test that only checked that a filename appeared would pass on something that
 * looked nothing like the thing it claims to be.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../../world/company';
import type { TerminalSession } from '../../world/fs';
import { createWorldSession, type WorldSession } from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
import {
  cdLines,
  dirLines,
  treeLines,
  typeLines,
  volumeSerial,
} from './cmd-files';

const DESK: TerminalSession = {
  machineId: COMPANY_IDS.playerMachine,
  cwd: ['SUPPORT'],
  username: 'ppending',
};

const SPOOL = '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS';

function world(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession();

  for (const id of ticketIds) {
    spawnWorldTicket(session.engine, id);
  }

  return session;
}

function dir(session: WorldSession, path: string, from = DESK): string[] {
  return [...dirLines(session.engine.graph, from, path).lines];
}

describe('dir', () => {
  it('prints the volume header, the columns and the footer', () => {
    const session = world();
    const lines = dir(session, 'C:\\SUPPORT');

    expect(lines.slice(0, 5)).toEqual([
      ' Volume in drive C has no label.',
      ` Volume Serial Number is ${volumeSerial(COMPANY_IDS.playerMachine)}`,
      '',
      ' Directory of C:\\SUPPORT',
      '',
    ]);

    // Itself and its parent, then the entries, in name order - and the date
    // column is the estate's own, which is the same one every file surface
    // uses.
    expect(lines[5]).toBe('04/09/1998  16:58    <DIR>          .');
    expect(lines[6]).toMatch(/^\d{2}\/\d{2}\/\d{4} {2}\d{2}:\d{2} {4}<DIR> {10}\.\.$/u);
    expect(lines[7]).toMatch(/^\d{2}\/\d{2}\/\d{4} {2}\d{2}:\d{2} +\d+ README\.TXT$/u);

    // The footer counts what it printed, and quotes what the drive has left.
    // Both columns line up, which is the half a regular expression cannot see.
    expect(lines.at(-2)).toBe(
      `${'2'.padStart(16)} File(s) ${'607'.padStart(14)} bytes`,
    );
    expect(lines.at(-1)).toBe(
      `${'2'.padStart(16)} Dir(s) ${'341,458,944'.padStart(15)} bytes free`,
    );
  });

  it('sizes a file at exactly what type would print', () => {
    const session = world();
    const listed = dir(session, 'C:\\SUPPORT\\RUNBOOK.TXT');
    const printed = typeLines(session.engine.graph, DESK, 'C:\\SUPPORT\\RUNBOOK.TXT')
      .lines
      .join('\n');

    expect(listed[3]).toBe(' Directory of C:\\SUPPORT');
    expect(listed.at(-2)).toBe(
      `${'1'.padStart(16)} File(s) ${
        String(printed.length).padStart(14)
      } bytes`,
    );
    // A listing of one file has no directories in it, which is what the real
    // one does with a path that names a file.
    expect(listed.at(-1)).toContain(' Dir(s) ');
    expect(listed.at(-1)?.trimStart().startsWith('0')).toBe(true);
  });

  /**
   * Case is folded to FIND a directory and echoed to PRINT the path, which is
   * how this family behaves and is why `c:\windows` works at all. The drive
   * letter is the one exception: it is the drive's own name rather than
   * something the player named, so it comes back as `C:` however it was typed.
   */
  it('echoes the case it was given, under the drive\'s own letter', () => {
    const session = world();

    expect(dir(session, 'c:\\windows')[3]).toBe(' Directory of C:\\windows');
    expect(dir(session, 'C:\\WINDOWS')[3]).toBe(' Directory of C:\\WINDOWS');
  });

  it('prints the queue as the files it is made of', () => {
    const session = world('ticket:wedged-spooler');
    const lines = dir(session, SPOOL);

    expect(lines[0]).toBe(' Volume in drive \\\\PRINT-01\\C$ has no label.');
    expect(lines[3]).toBe(` Directory of ${SPOOL}`);
    expect(lines).toContain('07/09/1998  07:58            12,288 00001.SPL');
    // Forty-seven jobs, forty-seven files, and the four identical sizes that
    // are the same delivery note sent four times.
    expect(lines.at(-2)).toBe(
      `${'47'.padStart(16)} File(s) ${'1,393,664'.padStart(14)} bytes`,
    );
    expect(lines.filter((line) => line.includes('40,960'))).toHaveLength(4);
  });

  it('says the real thing when the path is not there, or not yours', () => {
    const session = world();

    expect(dir(session, 'C:\\NOTHING'))
      .toEqual(['The system cannot find the path specified.']);
    expect(dir(session, '\\\\FILES-01\\C$\\PAYROLL')[0])
      .toBe('Access is denied.');
    expect(dir(session, '\\\\NOWHERE\\C$')[0])
      .toBe('The network path was not found.');
  });

  it('refuses the switches and the wildcards it does not have', () => {
    const session = world();

    expect(dir(session, '/s')[0]).toBe('"/s" is not a switch this dir has.');
    expect(dir(session, '*.TXT')[0]).toBe('This dir does not do wildcards.');
  });
});

describe('cd', () => {
  it('prints where you are when it is asked nothing, which is the quirk', () => {
    const session = world();

    // The one place this family and the unix one disagree outright: bare `cd`
    // goes home on a unix shell and says the name of the room here.
    expect(cdLines(session.engine.graph, DESK, '').lines).toEqual(['C:\\SUPPORT']);
    expect(cdLines(
      session.engine.graph,
      { ...DESK, cwd: [] },
      '',
    ).lines).toEqual(['C:\\']);
  });

  it('moves, silently, and hands the terminal back where it stands', () => {
    const session = world();
    const moved = cdLines(session.engine.graph, DESK, '..\\WINDOWS\\SYSTEM32');

    expect(moved.lines).toEqual([]);
    expect(moved.cwd).toEqual(['WINDOWS', 'SYSTEM32']);

    // And at the root, `..` is not an error - it is nothing at all.
    const top = cdLines(session.engine.graph, { ...DESK, cwd: [] }, '..');

    expect(top.lines).toEqual([]);
    expect(top.cwd).toEqual([]);
  });

  it('refuses a file, a missing path and a UNC path, each in its own words', () => {
    const session = world();
    const graph = session.engine.graph;

    expect(cdLines(graph, DESK, 'README.TXT').lines)
      .toEqual(['The directory name is invalid.']);
    expect(cdLines(graph, DESK, 'C:\\NOTHING').lines)
      .toEqual(['The system cannot find the path specified.']);

    // The real refusal, in the real words: a UNC path can be listed and read
    // and it cannot be stood in.
    const unc = cdLines(graph, DESK, SPOOL).lines;

    expect(unc[0]).toBe(`'${SPOOL}'`);
    expect(unc[1]).toBe('CMD does not support UNC paths as current directories.');
    expect(cdLines(graph, DESK, SPOOL).cwd).toBeUndefined();
  });

  it('has no ~, and says which spelling this shell has', () => {
    const session = world();
    const refused = cdLines(session.engine.graph, DESK, '~').lines;

    expect(refused[0]).toBe('The system cannot find the path specified.');
    expect(refused[1]).toContain('%USERPROFILE%');
  });
});

describe('type', () => {
  it('prints the file, and nothing around it', () => {
    const session = world();
    const lines = typeLines(session.engine.graph, DESK, 'RUNBOOK.TXT').lines;

    expect(lines[0]).toBe('PRINT SPOOLER - the order matters');
    expect(lines.join('\n')).toContain('clearqueue <printer>');
  });

  it('reads the config that explains a service nobody has fixed', () => {
    const session = world();
    const lines = typeLines(
      session.engine.graph,
      DESK,
      '\\\\FILES-01\\C$\\REPORTSVC\\REPORTSVC.INI',
    ).lines;

    expect(lines.join('\n')).toContain('LastRun=14/03/1998  02:00');
    expect(lines.join('\n')).toContain('PUT IT BACK AFTER');
  });

  it('is the machine log the Event Viewer shows, off the same field', () => {
    const session = world('ticket:wedged-spooler');
    const lines = typeLines(
      session.engine.graph,
      DESK,
      '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\LOGFILES\\SYSTEM.LOG',
    ).lines;

    expect(lines.join('\n')).toContain('Error');
    expect(lines.join('\n')).toContain('Service Control Manager');
    expect(lines.join('\n')).toContain('7031');
  });

  it('refuses a directory the way the real one does, and a spool file honestly', () => {
    const session = world('ticket:wedged-spooler');
    const graph = session.engine.graph;

    // Not a mistake in the shell: a directory is opened rather than read.
    expect(typeLines(graph, DESK, 'C:\\WINDOWS').lines)
      .toEqual(['Access is denied.']);
    expect(typeLines(graph, DESK, 'C:\\NOTHING.TXT').lines)
      .toEqual(['The system cannot find the file specified.']);

    const spool = typeLines(graph, DESK, `${SPOOL}\\00001.SPL`).lines;

    expect(spool[0]).toContain('is a spool file');
    expect(spool.join(' ')).toContain('There is no text in it');
  });
});

describe('tree', () => {
  it('draws the directories under a path, and only the directories', () => {
    const session = world();
    const lines = treeLines(session.engine.graph, DESK, ['C:\\WINDOWS']).lines;

    expect(lines[0]).toBe('Folder PATH listing');
    expect(lines[1])
      .toBe(`Volume serial number is ${volumeSerial(COMPANY_IDS.playerMachine)}`);
    expect(lines[2]).toBe('C:\\WINDOWS');
    expect(lines.slice(3)).toEqual([
      '└───SYSTEM32',
      '    ├───LOGFILES',
      '    └───SPOOL',
      '        └───PRINTERS',
    ]);
    // WIN.INI is a file and this is a tree of folders, which is what the real
    // one prints without /f.
    expect(lines.join('\n')).not.toContain('WIN.INI');
  });

  it('draws the files as well when it is asked to', () => {
    const session = world();
    const lines = treeLines(
      session.engine.graph,
      DESK,
      ['C:\\WINDOWS', '/f'],
    ).lines;

    expect(lines.join('\n')).toContain('WIN.INI');
    expect(lines.join('\n')).toContain('SYSTEM.LOG');
  });

  it('says where the rights stop rather than drawing an empty branch', () => {
    const session = world();
    const lines = treeLines(
      session.engine.graph,
      DESK,
      ['\\\\FILES-01\\C$'],
    ).lines;

    expect(lines).toContain('├───PAYROLL');
    expect(lines).toContain('│   └───Access is denied.');
  });

  it('says so when there is nothing under it, and refuses what it cannot walk', () => {
    const session = world();
    const graph = session.engine.graph;

    expect(treeLines(graph, DESK, ['C:\\SUPPORT']).lines.at(-1))
      .toBe('No subfolders exist');
    expect(treeLines(graph, DESK, ['C:\\AUTOEXEC.BAT']).lines)
      .toEqual(['The directory name is invalid.']);
    expect(treeLines(graph, DESK, ['/a']).lines[0])
      .toBe('"/a" is not a switch this tree has.');
  });
});
