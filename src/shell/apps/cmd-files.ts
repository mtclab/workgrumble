/**
 * The drive, as the terminal prints it: `dir`, `cd`, `type` and `tree`.
 *
 * This is output shape and nothing else. Where a path lands, what a directory
 * holds and what is in a file are decided in `src/world/fs.ts` over the graph;
 * what is here is the volume header, the date-and-size columns, the totals
 * footer and the four true refusals - which is the half that has to look like
 * the real tool, and the half a unit test can hold to it line for line.
 *
 * The family is a Windows family, so these are the Windows four. There is no
 * `ls` in here: the unix skins arrive with the machines that would run them,
 * and half a dialect - unix spelling over a cmd shape - is exactly what the
 * fidelity bar in `docs/research/terminal-fidelity.md` forbids.
 */

import type { ReadOnlyGraphView } from '../../engine-api';
import { FIELDS } from '../../world/fields';
import {
  ADMIN_SHARE,
  displayPath,
  DRIVE,
  findPath,
  type FsEntry,
  type FsFault,
  listEntries,
  type Location,
  locate,
  promptPath,
  resolvePath,
  type TerminalSession,
} from '../../world/fs';
import { stableHash } from './cmd-net';

export interface FileCommandResult {
  readonly lines: readonly string[];
  /** Where the terminal is standing afterwards, when `cd` moved it. */
  readonly cwd?: readonly string[];
}

/** `3204` -> `3,204`, which is how a listing has always written it. */
export function thousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/**
 * The number stamped on the volume when it was formatted.
 *
 * Derived from the machine, exactly like its address and its MAC in
 * `cmd-net.ts`, and for the same three reasons: the same box has the same
 * serial in every session, nothing here can disagree with the graph, and it is
 * not a second piece of world state anybody has to keep true.
 */
export function volumeSerial(machineId: string): string {
  const hash = stableHash(`volume:${machineId}`);
  const half = (shift: number): string => ((hash >>> shift) & 0xffff)
    .toString(16)
    .padStart(4, '0')
    .toUpperCase();

  return `${half(16)}-${half(0)}`;
}

/* -- the refusals, in the real words -------------------------------------- */

const PATH_NOT_FOUND = 'The system cannot find the path specified.';
const FILE_NOT_FOUND = 'The system cannot find the file specified.';
const ACCESS_DENIED = 'Access is denied.';
const INVALID_DIRECTORY = 'The directory name is invalid.';
const NETWORK_PATH = 'The network path was not found.';
const UNC_NOT_A_CWD = 'CMD does not support UNC paths as current directories.';

/**
 * What a failed lookup prints. The wording is the real tool's, and `type` says
 * "file" where the other three say "path" because the real ones do.
 */
function faultLines(
  fault: FsFault,
  about: 'path' | 'file',
): readonly string[] {
  switch (fault) {
    case 'denied':
      return [
        ACCESS_DENIED,
        'The entry is there and the rights on it are not yours. That is a '
          + 'permission rather than a locked door, and it is somebody\'s to '
          + 'grant rather than yours to work around.',
      ];
    case 'no-network-path':
      return [
        NETWORK_PATH,
        'A box on this estate answers on its own administrative share: '
          + '\\\\HOST\\C$. Nothing else here is a network path.',
      ];
    case 'no-tilde':
      return [
        about === 'file' ? FILE_NOT_FOUND : PATH_NOT_FOUND,
        'There is no ~ on this shell. The profile is %USERPROFILE%, which is '
          + 'the spelling this family has always used.',
      ];
    default:
      return [about === 'file' ? FILE_NOT_FOUND : PATH_NOT_FOUND];
  }
}

/* -- the listing ---------------------------------------------------------- */

/** The date-and-time column, then `<DIR>` or the size, then the name. */
function entryRow(entry: Readonly<FsEntry>): string {
  const size = entry.kind === 'directory'
    ? `    <DIR>${' '.repeat(10)}`
    : `${thousands(entry.size).padStart(18)} `;

  return `${entry.modified}${size}${entry.name}`;
}

function diskFreeOf(graph: ReadOnlyGraphView, machineId: string): number {
  const free = graph.getField(machineId, FIELDS.diskFree);
  return typeof free === 'number' ? free : 0;
}

function volumeHeader(location: Readonly<Location>): readonly string[] {
  const drive = location.host === null
    ? `drive ${DRIVE.replace(':', '')}`
    : `drive \\\\${location.host}\\${ADMIN_SHARE}`;

  return [
    ` Volume in ${drive} has no label.`,
    ` Volume Serial Number is ${volumeSerial(location.machineId)}`,
    '',
  ];
}

function totals(
  graph: ReadOnlyGraphView,
  location: Readonly<Location>,
  entries: readonly FsEntry[],
  dirCount: number,
): readonly string[] {
  const files = entries.filter((entry) => entry.kind === 'file');
  const bytes = files.reduce((sum, entry) => sum + entry.size, 0);

  return [
    `${String(files.length).padStart(16)} File(s) ${
      thousands(bytes).padStart(14)
    } bytes`,
    `${String(dirCount).padStart(16)} Dir(s) ${
      thousands(diskFreeOf(graph, location.machineId)).padStart(15)
    } bytes free`,
  ];
}

/** The parent of a location, for the `..` row and for a listing of one file. */
function parentOf(location: Readonly<Location>): Location {
  return { ...location, segments: location.segments.slice(0, -1) };
}

function switchRefusal(command: string, flag: string): FileCommandResult {
  return {
    lines: [
      `"${flag}" is not a switch this ${command} has.`,
      'It takes a path, and nothing but a path. The switches that walk trees, '
        + 'filter by attribute or print bare names are not simulated here, '
        + 'and a stub of one would teach a behaviour that is not there.',
    ],
  };
}

function wildcardRefusal(command: string): FileCommandResult {
  return {
    lines: [
      `This ${command} does not do wildcards.`,
      'Name the directory and read it, which is what you were going to do '
        + 'with the answer anyway.',
    ],
  };
}

/**
 * `dir [path]`, in the shape the real one prints: a volume header, one row per
 * entry with the date it was written and what it is, and a footer that counts
 * the files, their bytes and what is left on the drive.
 */
export function dirLines(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  argument: string,
): FileCommandResult {
  const arg = argument.trim();

  if (arg.startsWith('/')) {
    return switchRefusal('dir', arg);
  }

  if (arg.includes('*') || arg.includes('?')) {
    return wildcardRefusal('dir');
  }

  const found = findPath(graph, session, arg);

  if (!found.ok) {
    return { lines: faultLines(found.fault, 'path') };
  }

  // A file is a listing of one, headed by the directory it is in - which is
  // what the real one does and is the reason `dir <file>` is worth typing.
  if (found.entry.kind === 'file') {
    const parent = parentOf(found.location);

    return {
      lines: [
        ...volumeHeader(parent),
        ` Directory of ${displayPath(parent)}`,
        '',
        entryRow(found.entry),
        ...totals(graph, parent, [found.entry], 0),
      ],
    };
  }

  if (found.entry.accessDenied || found.entry.nodeId === null) {
    return { lines: faultLines('denied', 'path') };
  }

  const entries = listEntries(
    graph,
    found.location.machineId,
    found.entry.nodeId,
  );
  const atRoot = found.location.segments.length === 0;
  const above = atRoot ? null : locate(graph, parentOf(found.location));
  // Every directory but the root has itself and its parent in it, which is
  // both true of the real thing and the reason `cd ..` is discoverable. Each
  // carries the stamp of the directory it stands for, because that is what it
  // is: two more names for two directories that are already there.
  const dots: readonly FsEntry[] = above === null || !above.ok
    ? []
    : [
      { ...found.entry, name: '.' },
      { ...above.entry, name: '..' },
    ];
  const rows = [...dots, ...entries];
  const dirCount = rows.filter((entry) => entry.kind === 'directory').length;

  return {
    lines: [
      ...volumeHeader(found.location),
      ` Directory of ${displayPath(found.location)}`,
      '',
      ...(rows.length === 0
        ? ['File Not Found']
        : rows.map((entry) => entryRow(entry))),
      ...totals(graph, found.location, rows, dirCount),
    ],
  };
}

/**
 * `cd [path]`.
 *
 * Bare `cd` prints where you are, which is the one place this family and the
 * unix one disagree outright: `cd` on its own takes a unix shell home and
 * tells a Windows one to say the name of the room it is in.
 */
export function cdLines(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  argument: string,
): FileCommandResult {
  const arg = argument.trim();

  if (arg.length === 0) {
    return { lines: [promptPath(session.cwd)] };
  }

  if (arg.startsWith('/')) {
    return switchRefusal('cd', arg);
  }

  const resolved = resolvePath(graph, session, arg);

  if (!resolved.ok) {
    return { lines: faultLines(resolved.fault, 'path') };
  }

  // The real refusal, in the real words: a UNC path can be listed and read,
  // and it cannot be stood in.
  if (resolved.location.host !== null) {
    return {
      lines: [
        `'${displayPath(resolved.location)}'`,
        UNC_NOT_A_CWD,
        'It can be listed and read from where you are, which is what the '
          + 'admin share is for.',
      ],
    };
  }

  const found = locate(graph, resolved.location);

  if (!found.ok) {
    return { lines: faultLines(found.fault, 'path') };
  }

  if (found.entry.kind !== 'directory') {
    return { lines: [INVALID_DIRECTORY] };
  }

  if (found.entry.accessDenied) {
    return { lines: faultLines('denied', 'path') };
  }

  return { lines: [], cwd: resolved.location.segments };
}

/** `type <file>`, which prints what is in it and nothing else. */
export function typeLines(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  argument: string,
): FileCommandResult {
  const arg = argument.trim();

  if (arg.startsWith('/')) {
    return switchRefusal('type', arg);
  }

  if (arg.includes('*') || arg.includes('?')) {
    return wildcardRefusal('type');
  }

  const resolved = resolvePath(graph, session, arg);

  if (!resolved.ok) {
    return { lines: faultLines(resolved.fault, 'file') };
  }

  const found = locate(graph, resolved.location);

  if (!found.ok) {
    return { lines: faultLines(found.fault, 'file') };
  }

  // What the real one does to a directory, word for word. It is not a mistake
  // in the shell: a directory is opened rather than read, and the handle it
  // asks for is one nobody is given.
  if (found.entry.kind === 'directory') {
    return { lines: [ACCESS_DENIED] };
  }

  if (found.entry.accessDenied) {
    return { lines: faultLines('denied', 'file') };
  }

  if (found.entry.text === null) {
    return {
      lines: [
        `${found.entry.name} is a spool file: it is the print job itself, in `
          + 'whatever the printer speaks.',
        'There is no text in it, and this terminal will not put a screenful '
          + 'of a printer\'s opinions in front of you and call it a file.',
      ],
    };
  }

  return {
    lines: found.entry.text.length === 0 ? [] : found.entry.text.split('\n'),
  };
}

/* -- tree ----------------------------------------------------------------- */

const BRANCH = '├───';
const LAST_BRANCH = '└───';
const TRUNK = '│   ';
const GAP = '    ';

function treeRows(
  graph: ReadOnlyGraphView,
  machineId: string,
  directoryId: string,
  prefix: string,
  withFiles: boolean,
): readonly string[] {
  const entries = listEntries(graph, machineId, directoryId);
  const shown = withFiles
    ? entries
    : entries.filter((entry) => entry.kind === 'directory');
  const rows: string[] = [];

  for (const [index, entry] of shown.entries()) {
    const last = index === shown.length - 1;
    rows.push(`${prefix}${last ? LAST_BRANCH : BRANCH}${entry.name}`);

    if (entry.kind !== 'directory' || entry.nodeId === null) {
      continue;
    }

    if (entry.accessDenied) {
      // The walk stops where the rights do, and says so rather than drawing
      // an empty branch that reads as an empty directory.
      rows.push(`${prefix}${last ? GAP : TRUNK}${LAST_BRANCH}${ACCESS_DENIED}`);
      continue;
    }

    rows.push(...treeRows(
      graph,
      machineId,
      entry.nodeId,
      `${prefix}${last ? GAP : TRUNK}`,
      withFiles,
    ));
  }

  return rows;
}

/** `tree [path] [/f]` - the directories under a path, and the files with /f. */
export function treeLines(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  args: readonly string[],
): FileCommandResult {
  const flags = args.filter((arg) => arg.startsWith('/'));
  const withFiles = flags.some((flag) => flag.toLowerCase() === '/f');
  const unknown = flags.find((flag) => flag.toLowerCase() !== '/f');

  if (unknown !== undefined) {
    return switchRefusal('tree', unknown);
  }

  const target = args.filter((arg) => !arg.startsWith('/')).join(' ');
  const resolved = resolvePath(graph, session, target);

  if (!resolved.ok) {
    return { lines: faultLines(resolved.fault, 'path') };
  }

  const found = locate(graph, resolved.location);

  if (!found.ok) {
    return { lines: faultLines(found.fault, 'path') };
  }

  if (found.entry.kind !== 'directory') {
    return { lines: [INVALID_DIRECTORY] };
  }

  if (found.entry.accessDenied || found.entry.nodeId === null) {
    return { lines: faultLines('denied', 'path') };
  }

  const rows = treeRows(
    graph,
    found.location.machineId,
    found.entry.nodeId,
    '',
    withFiles,
  );

  return {
    lines: [
      // No label, so no "for volume X" - which is what the real one prints on
      // an unlabelled drive, and what `dir` has already said about this one.
      'Folder PATH listing',
      `Volume serial number is ${volumeSerial(found.location.machineId)}`,
      displayPath(found.location),
      ...(rows.length === 0 ? ['No subfolders exist'] : rows),
    ],
  };
}
