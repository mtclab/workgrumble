/**
 * Reading the drives: where a path lands, what is in a directory, what is in a
 * file.
 *
 * Everything here is pure and reads the graph. It is deliberately not the
 * terminal: `dir` and `tree` and `type` are output shapes, and they live with
 * the shell that prints them - what lives here is the part that has to be TRUE
 * regardless of which surface asks. That split is why the path rules can be
 * unit-tested to death without a DOM.
 *
 * Two entries in this estate are read out of somewhere else in the world
 * rather than out of a `content` field, and both are derived by a pure
 * function of the same fields another surface already paints:
 *
 * - the spool directory IS the queue on the printer plugged into that box, so
 *   what the directory holds and what the print queue reports cannot come
 *   apart; and
 * - `SYSTEM.LOG` IS the machine's own event log, so the file and the Event
 *   Viewer are two windows onto one field.
 *
 * Anything else would be a second copy of a fact this world already holds, and
 * a second copy is a thing that can disagree.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import {
  EVENT_LEVEL_LABELS,
  type MachineEvent,
  readEventLog,
} from './events';
import { DEVICE_TYPES, FIELDS } from './fields';
import {
  driveRootId,
  eventLogFileId,
  PROFILES_DIR,
  spoolDirId,
} from './filesystem';
import { fileStamp } from './hours';

/** The drive letter this estate has. There has never been another one. */
export const DRIVE = 'C:';

/** The administrative share a box answers on, which is how a tech reaches it. */
export const ADMIN_SHARE = 'C$';

/* -- what an entry looks like once it has been read ----------------------- */

export interface FsEntry {
  readonly kind: 'directory' | 'file';
  readonly name: string;
  /** The stamp a listing prints, as the estate writes dates. */
  readonly modified: string;
  /** Bytes. Directories have none, and a listing prints `<DIR>` instead. */
  readonly size: number;
  readonly accessDenied: boolean;
  /** The node behind it, or nothing where the world derives the entry. */
  readonly nodeId: string | null;
  /**
   * What `type` would print, or nothing where there is no text to print: a
   * directory, a spool file, something this account may not read.
   */
  readonly text: string | null;
}

/** Where a path landed, and on which box. */
export interface Location {
  readonly machineId: string;
  /** The segments below the drive root, as the player typed them. */
  readonly segments: readonly string[];
  /**
   * The host it was reached through, when it was reached over `\\HOST\C$`, or
   * nothing for a path on the box the terminal is running on. It is carried
   * here rather than looked up again because it is how the path has to be
   * PRINTED - a refusal that named a local path for a remote one would be a
   * refusal about a different box.
   */
  readonly host: string | null;
}

/**
 * Why a path did not land. The words are the command's - `type` says "file"
 * where `dir` says "path", exactly as the real ones do - so this is the reason
 * rather than the sentence.
 */
export type FsFault =
  | 'missing'
  | 'denied'
  | 'no-such-drive'
  | 'no-network-path'
  | 'no-tilde';

export type Resolved =
  | { readonly ok: true; readonly location: Location }
  | { readonly ok: false; readonly fault: FsFault; readonly path: string };

export type Found =
  | { readonly ok: true; readonly entry: FsEntry; readonly location: Location }
  | { readonly ok: false; readonly fault: FsFault; readonly path: string };

/** What the terminal is standing in. */
export interface TerminalSession {
  /** The box the terminal itself runs on. Only this one can be a cwd. */
  readonly machineId: string;
  readonly cwd: readonly string[];
  /** The account this session runs as, for `%USERPROFILE%`. */
  readonly username: string | null;
}

/* -- paths ---------------------------------------------------------------- */

/** `C:\WINDOWS\SYSTEM32`, or `\\PRINT-01\C$\WINDOWS` on somebody else's box. */
export function displayPath(location: Readonly<Location>): string {
  const root = location.host === null
    ? DRIVE
    : `\\\\${location.host}\\${ADMIN_SHARE}`;

  return location.segments.length === 0
    ? `${root}\\`
    : `${root}\\${location.segments.join('\\')}`;
}

/** Where the terminal is standing, in the shape a prompt prints it. */
export function promptPath(cwd: readonly string[]): string {
  return cwd.length === 0 ? `${DRIVE}\\` : `${DRIVE}\\${cwd.join('\\')}`;
}

function normalise(
  base: readonly string[],
  parts: readonly string[],
): readonly string[] {
  const walked = [...base];

  for (const part of parts) {
    if (part === '.' || part.length === 0) {
      continue;
    }

    if (part === '..') {
      // At the root there is nowhere above to go, and a real shell says
      // nothing about it - it simply leaves you where you were.
      walked.pop();
      continue;
    }

    walked.push(part);
  }

  return walked;
}

function machineByHostname(
  graph: ReadOnlyGraphView,
  hostname: string,
): ReadOnlyGraphNode | undefined {
  const needle = hostname.trim().toLowerCase();

  return graph
    .nodesOfKind('machine')
    .find((machine) => {
      const name = machine.fields[FIELDS.hostname];
      return typeof name === 'string' && name.toLowerCase() === needle;
    });
}

function splitSegments(path: string): readonly string[] {
  return path.split(/[\\/]+/u).filter((part) => part.length > 0);
}

/**
 * Where a typed path lands, before anything has been looked up.
 *
 * It knows about four shapes and refuses the rest by name: an absolute path on
 * this drive, a path from the root of it, a path relative to where the
 * terminal is standing, and the administrative share of another box - which is
 * how a support tech has always reached a machine they are not sitting at, and
 * which works here for the reason it works there: the Server service is
 * running on every box in this building and the player can see that it is.
 */
export function resolvePath(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  input: string,
): Resolved {
  // Quotes are how the real shell is told that a path with spaces in it is one
  // path. They are optional here because the parser hands this command its
  // whole argument, and they are accepted because a player who knows the tool
  // will type them.
  const path = input.trim().replace(/^"(.*)"$/u, '$1').trim();
  const fail = (fault: FsFault): Resolved => ({ ok: false, fault, path });

  if (path.length === 0) {
    return {
      ok: true,
      location: {
        machineId: session.machineId,
        segments: session.cwd,
        host: null,
      },
    };
  }

  // The one expansion this shell has, spelled the way this family spells it.
  // Replaced through a function rather than with a string, because a username
  // with a `$` in it would otherwise be read as a replacement pattern - which
  // is the kind of bug that waits for the one account nobody tested.
  const expanded = path.replace(
    /%userprofile%/giu,
    () => (session.username === null
      ? `${DRIVE}\\${PROFILES_DIR}`
      : `${DRIVE}\\${PROFILES_DIR}\\${session.username}`),
  );

  if (/^~(?:[\\/]|$)/u.test(expanded)) {
    return fail('no-tilde');
  }

  if (/^[\\/]{2}/u.test(expanded)) {
    const parts = splitSegments(expanded);
    const [host = '', share = '', ...rest] = parts;
    const machine = machineByHostname(graph, host);

    if (machine === undefined || share.toUpperCase() !== ADMIN_SHARE) {
      return fail('no-network-path');
    }

    const hostname = machine.fields[FIELDS.hostname];

    return {
      ok: true,
      location: {
        machineId: machine.id,
        segments: normalise([], rest),
        host: typeof hostname === 'string' ? hostname : host,
      },
    };
  }

  const drive = /^([a-z]):(.*)$/iu.exec(expanded);

  if (drive !== null) {
    const [, letter = '', rest = ''] = drive;

    if (`${letter.toUpperCase()}:` !== DRIVE) {
      return fail('no-such-drive');
    }

    return {
      ok: true,
      location: {
        machineId: session.machineId,
        segments: normalise([], splitSegments(rest)),
        host: null,
      },
    };
  }

  const fromRoot = /^[\\/]/u.test(expanded);

  return {
    ok: true,
    location: {
      machineId: session.machineId,
      segments: normalise(
        fromRoot ? [] : session.cwd,
        splitSegments(expanded),
      ),
      host: null,
    },
  };
}

/* -- entries -------------------------------------------------------------- */

const ENCODER = new TextEncoder();

function byteLength(text: string): number {
  return ENCODER.encode(text).length;
}

function nameOf(node: Readonly<ReadOnlyGraphNode>): string {
  const name = node.fields[FIELDS.name];
  return typeof name === 'string' ? name : node.id;
}

function stampOf(node: Readonly<ReadOnlyGraphNode>): string {
  const modified = node.fields[FIELDS.modified];
  return typeof modified === 'string' ? modified : '';
}

/* -- the two entries the world derives ------------------------------------ */

/** One queued print job, as the world holds it: `bytes|stamp`. */
export interface SpoolJob {
  readonly bytes: number;
  readonly modified: string;
}

const SPOOL_SEPARATOR = '|';

export function encodeSpoolJob(job: Readonly<SpoolJob>): string {
  return `${String(job.bytes)}${SPOOL_SEPARATOR}${job.modified}`;
}

/**
 * The queue behind a printer, oldest first. Anything this build cannot read is
 * dropped rather than shown, the same rule the event log follows and for the
 * same reason: a save is a file on the player's machine.
 */
export function readSpoolJobs(value: unknown): readonly SpoolJob[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map((line): SpoolJob | null => {
        const [bytes = '', modified = ''] = line.split(SPOOL_SEPARATOR);
        const size = Number(bytes);

        return line.length === 0
          || !Number.isSafeInteger(size)
          || size < 0
          || modified.length === 0
          ? null
          : { bytes: size, modified };
      })
      .filter((job): job is SpoolJob => job !== null),
  );
}

/** The printers whose jobs land in this box's spool directory. */
function printersOn(
  graph: ReadOnlyGraphView,
  machineId: string,
): readonly ReadOnlyGraphNode[] {
  return graph
    .neighbors(machineId, { direction: 'in', edgeKind: 'connected_to' })
    .filter(
      (node) => node.kind === 'device'
        && node.fields[FIELDS.type] === DEVICE_TYPES.printer,
    );
}

/**
 * What is actually sitting in the spool directory: one file per queued job,
 * numbered the way a spooler numbers them.
 *
 * The world holds the jobs, so nothing here is invented - and because the
 * listing is READ from the queue rather than kept beside it, the directory and
 * the print queue cannot disagree about how much work is stuck.
 */
export function spoolEntries(
  graph: ReadOnlyGraphView,
  machineId: string,
): readonly FsEntry[] {
  const entries: FsEntry[] = [];

  for (const printer of printersOn(graph, machineId)) {
    for (const job of readSpoolJobs(printer.fields[FIELDS.spoolJobs])) {
      entries.push({
        kind: 'file',
        name: `${String(entries.length + 1).padStart(5, '0')}.SPL`,
        modified: job.modified,
        size: job.bytes,
        accessDenied: false,
        nodeId: null,
        // A spool file is the print job itself. There is no text in it, and a
        // terminal that printed some would be inventing the one thing the
        // world deliberately does not hold: what anybody was printing.
        text: null,
      });
    }
  }

  return entries;
}

/** How many jobs the spool directory on this box is holding. */
export function spoolDepth(
  graph: ReadOnlyGraphView,
  machineId: string,
): number {
  return spoolEntries(graph, machineId).length;
}

/**
 * Where a printer's queue and its own spool directory disagree, as sentences.
 *
 * The world holds the depth of a queue as a number and the jobs behind it as a
 * list, because a count cannot fill a directory and a directory of invented
 * files would be a fake. Two facts about one thing can come apart, so this is
 * the invariant that says they have not: every mutation that touches a queue
 * is asserted against it - the seed, the ticket that jams the spooler, the
 * clear, the restart afterwards - and the solvability harness runs it after
 * every step of every advertised path in the game.
 *
 * A list rather than a throw: the callers are gates, and a gate that names
 * every printer it found wrong is worth more than one that stops at the first.
 */
export function spoolDisagreements(
  graph: ReadOnlyGraphView,
): readonly string[] {
  const complaints: string[] = [];
  const byHost = new Map<string, number>();

  for (const printer of graph.nodesOfKind('device')) {
    if (printer.fields[FIELDS.type] !== DEVICE_TYPES.printer) {
      continue;
    }

    const depth = printer.fields[FIELDS.queueLen];
    const jobs = readSpoolJobs(printer.fields[FIELDS.spoolJobs]).length;

    if (typeof depth !== 'number') {
      complaints.push(`${printer.id} has no queue length on it at all.`);
      continue;
    }

    if (depth !== jobs) {
      complaints.push(
        `${printer.id} reports ${String(depth)} job(s) queued and its spool `
        + `directory holds ${String(jobs)}. One of them is lying to somebody.`,
      );
    }

    for (const host of graph.neighbors(printer.id, {
      direction: 'out',
      edgeKind: 'connected_to',
    })) {
      if (host.kind === 'machine') {
        byHost.set(host.id, (byHost.get(host.id) ?? 0) + depth);
      }
    }
  }

  // And the same question from the player's chair: what the spool directory on
  // that box LISTS, against what the printers plugged into it say is queued.
  // It is the queue length on one side of this and the listing on the other,
  // so a printer wired to the wrong box shows up here rather than as an empty
  // directory nobody can explain.
  for (const [machineId, expected] of byHost) {
    const listed = spoolDepth(graph, machineId);

    if (listed !== expected) {
      complaints.push(
        `The spool directory on ${machineId} lists ${String(listed)} file(s) `
        + `for ${String(expected)} queued job(s).`,
      );
    }
  }

  return complaints;
}

/**
 * The machine's own log, as a file: the same rows the Event Viewer paints,
 * from the same field, in the shape a log file has.
 */
export function eventLogText(
  graph: ReadOnlyGraphView,
  machineId: string,
): string {
  return logText(readEventLog(graph.getField(machineId, FIELDS.eventLog)));
}

/** The rows themselves, from a log that has already been read. */
function logText(log: readonly Readonly<MachineEvent>[]): string {
  return log
    .map((event) => [
      fileStamp(event.tick),
      EVENT_LEVEL_LABELS[event.level].padEnd(11),
      event.source.padEnd(24),
      String(event.id).padEnd(6),
      event.message,
    ].join('  '))
    .join('\n');
}

/* -- looking things up ---------------------------------------------------- */

function entryOf(
  graph: ReadOnlyGraphView,
  machineId: string,
  node: Readonly<ReadOnlyGraphNode>,
): FsEntry {
  const denied = node.fields[FIELDS.accessDenied] === true;

  if (node.kind === 'directory') {
    return {
      kind: 'directory',
      name: nameOf(node),
      modified: stampOf(node),
      size: 0,
      accessDenied: denied,
      nodeId: node.id,
      text: null,
    };
  }

  // The log is the one file whose bytes are somewhere else in the world. When
  // the machine has written nothing yet the file is empty and keeps the stamp
  // it was imaged with, because that is the last time anything touched it.
  if (node.id === eventLogFileId(machineId)) {
    const log = readEventLog(graph.getField(machineId, FIELDS.eventLog));
    const text = logText(log);
    const last = log.at(-1);

    return {
      kind: 'file',
      name: nameOf(node),
      modified: last === undefined ? stampOf(node) : fileStamp(last.tick),
      size: byteLength(text),
      accessDenied: denied,
      nodeId: node.id,
      text: denied ? null : text,
    };
  }

  const content = node.fields[FIELDS.content];
  const text = typeof content === 'string' ? content : '';

  return {
    kind: 'file',
    name: nameOf(node),
    modified: stampOf(node),
    size: byteLength(text),
    accessDenied: denied,
    nodeId: node.id,
    text: denied ? null : text,
  };
}

/** Case-insensitive, and stable: a listing is read top to bottom by a human. */
function byName(left: Readonly<FsEntry>, right: Readonly<FsEntry>): number {
  const a = left.name.toLowerCase();
  const b = right.name.toLowerCase();

  if (a === b) {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  }

  return a < b ? -1 : 1;
}

/**
 * What is in a directory, in the order a listing prints it.
 *
 * The spool directory is the one that answers from the world rather than from
 * its own edges; everything else is the `contains` edges it was seeded with.
 */
export function listEntries(
  graph: ReadOnlyGraphView,
  machineId: string,
  directoryId: string,
): readonly FsEntry[] {
  if (directoryId === spoolDirId(machineId)) {
    return spoolEntries(graph, machineId);
  }

  return Object.freeze(
    graph
      .neighbors(directoryId, { direction: 'out', edgeKind: 'contains' })
      .filter((node) => node.kind === 'directory' || node.kind === 'file')
      .map((node) => entryOf(graph, machineId, node))
      .sort(byName),
  );
}

/** The drive root of a box, which is what the machine contains. */
function driveOf(
  graph: ReadOnlyGraphView,
  machineId: string,
): FsEntry | undefined {
  const root = graph.getNode(driveRootId(machineId));

  return root === undefined || root.kind !== 'directory'
    ? undefined
    : entryOf(graph, machineId, root);
}

/**
 * The entry a location names, walked from the root one segment at a time.
 *
 * A directory nobody may read stops the walk where the walk reaches it, which
 * is what an access control list does: you can see that PAYROLL is there,
 * because its parent let you list it, and you cannot go in.
 */
export function locate(
  graph: ReadOnlyGraphView,
  location: Readonly<Location>,
): Found {
  const path = displayPath(location);
  const root = driveOf(graph, location.machineId);

  if (root === undefined) {
    return { ok: false, fault: 'missing', path };
  }

  let here = root;

  for (const [index, segment] of location.segments.entries()) {
    if (here.kind !== 'directory' || here.nodeId === null) {
      // A file with a path under it is not a path at all, and the real shell
      // says exactly what it says for a path that is not there.
      return { ok: false, fault: 'missing', path };
    }

    if (here.accessDenied) {
      return { ok: false, fault: 'denied', path };
    }

    const needle = segment.toLowerCase();
    const found = listEntries(graph, location.machineId, here.nodeId)
      .find((entry) => entry.name.toLowerCase() === needle);

    if (found === undefined) {
      return { ok: false, fault: 'missing', path };
    }

    here = found;

    if (index === location.segments.length - 1) {
      return { ok: true, entry: here, location };
    }
  }

  return { ok: true, entry: here, location };
}

/** Resolution and lookup in one, which is what every command actually wants. */
export function findPath(
  graph: ReadOnlyGraphView,
  session: Readonly<TerminalSession>,
  input: string,
): Found {
  const resolved = resolvePath(graph, session, input);

  return resolved.ok
    ? locate(graph, resolved.location)
    : { ok: false, fault: resolved.fault, path: input.trim() };
}
