/**
 * What is on the drives.
 *
 * Found by the owner playing the live build: the instinct on a terminal is to
 * look at the tree and move around, and there was nothing there. So every box
 * in this building has a C: drive in the graph - directories, files, and the
 * `contains` edges between them - seeded from the tables below by the role the
 * box has, exactly the way its services are.
 *
 * Three rules hold this together and all three are load-bearing:
 *
 * - **The world is the only source.** A listing is read out of the graph. The
 *   two entries the world holds no text for are read out of the world as well:
 *   the spool directory is the printer's queue and the log file is the
 *   machine's own event log, both derived in `fs.ts` by a pure function of the
 *   same fields the Event Viewer and the print queue show. Nothing anywhere is
 *   a string in a switch.
 * - **A file's size is its content.** There is no `size` field, so `dir` and
 *   `type` cannot disagree about the same file.
 * - **Nothing here is a new fault.** These trees are the substrate for the
 *   content slice. The one file that explains anything - the report service's
 *   own ini, stopped for a month-end window in March and never restored - says
 *   what the shipped ticket and the shipped KB article already say, in the
 *   place a tech would actually find it.
 */

import type { Edge, GraphNode, SetupOp } from '../engine-api';
import { FIELDS, type MachineRole, MACHINE_ROLES } from './fields';

/* -- ids ------------------------------------------------------------------ */

/** The box half of a machine id: `machine:beige-box` -> `beige-box`. */
function boxOf(machineId: string): string {
  return machineId.includes(':')
    ? machineId.slice(machineId.indexOf(':') + 1)
    : machineId;
}

/**
 * What a path segment is called in an id.
 *
 * Ids are lower case and have no spaces in them, and names are what the estate
 * actually calls the entry: `Documents and Settings` lives at
 * `dir:beige-box/c/documents-and-settings`, and the listing prints the name.
 * The mapping is one-way on purpose - resolution walks the graph by name, not
 * by rebuilding ids out of what somebody typed.
 */
function slug(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9.]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/** The drive itself, which is what a machine contains. */
export function driveRootId(machineId: string): string {
  return `dir:${boxOf(machineId)}/c`;
}

/** The id of an entry, named by the segments below the drive root. */
function fsNodeId(
  machineId: string,
  segments: readonly string[],
  kind: 'directory' | 'file',
): string {
  const prefix = kind === 'file' ? 'file' : 'dir';
  const path = [boxOf(machineId), 'c', ...segments.map(slug)].join('/');

  return `${prefix}:${path}`;
}

/* -- the paths that mean something ---------------------------------------- */

/** Where the drive keeps profiles, and what the terminal opens in. */
export const PROFILES_DIR = 'Documents and Settings';
const SUPPORT_DIR = 'SUPPORT';

/** The support tech's own box, and the directory a terminal starts in. */
export const DEFAULT_CWD: readonly string[] = Object.freeze([SUPPORT_DIR]);

/** The spool directory, in the place the real one is. */
const SPOOL_SEGMENTS: readonly string[] = Object.freeze([
  'WINDOWS',
  'SYSTEM32',
  'SPOOL',
  'PRINTERS',
]);

/** And the log the Event Viewer is a window onto. */
const EVENT_LOG_SEGMENTS: readonly string[] = Object.freeze([
  'WINDOWS',
  'SYSTEM32',
  'LOGFILES',
  'SYSTEM.LOG',
]);

/** The directory whose contents are the queue on the printer plugged in here. */
export function spoolDirId(machineId: string): string {
  return fsNodeId(machineId, SPOOL_SEGMENTS, 'directory');
}

/** The file whose contents are this machine's event log. */
export function eventLogFileId(machineId: string): string {
  return fsNodeId(machineId, EVENT_LOG_SEGMENTS, 'file');
}

/* -- the trees, as data --------------------------------------------------- */

interface EntrySeed {
  readonly name: string;
  /** As the estate writes dates: `14/03/1997  11:02`. */
  readonly modified: string;
  /** True where the account at first line has no rights to read it. */
  readonly accessDenied?: boolean;
}

interface FileSeed extends EntrySeed {
  readonly kind: 'file';
  /** What `type` prints, and therefore what `dir` counts as its bytes. */
  readonly content?: string;
}

interface DirSeed extends EntrySeed {
  readonly kind: 'directory';
  readonly children?: readonly TreeSeed[];
}

type TreeSeed = FileSeed | DirSeed;

function dir(
  name: string,
  modified: string,
  children: readonly TreeSeed[] = [],
  accessDenied = false,
): DirSeed {
  return {
    kind: 'directory',
    name,
    modified,
    children,
    ...(accessDenied ? { accessDenied: true } : {}),
  };
}

function file(
  name: string,
  modified: string,
  content: string,
  accessDenied = false,
): FileSeed {
  return {
    kind: 'file',
    name,
    modified,
    content,
    ...(accessDenied ? { accessDenied: true } : {}),
  };
}

/** The day the image every box in this building was built from was built. */
const IMAGED = '11/06/1994  09:12';
/** The last time anybody touched the shared configuration. */
const TOUCHED = '02/02/1998  16:40';
/** The spring, which is when several things in this world stopped. */
const MARCH = '14/03/1998  02:00';

const AUTOEXEC = [
  '@ECHO OFF',
  'PROMPT $P$G',
  'PATH C:\\WINDOWS;C:\\WINDOWS\\SYSTEM32;C:\\SUPPORT',
  'REM Do not remove. Nobody remembers what it is for.',
  'REM -- VN 1994',
].join('\n');

const CONFIG_SYS = [
  'DEVICE=C:\\WINDOWS\\HIMEM.SYS',
  'FILES=60',
  'BUFFERS=30',
  'REM FILES was 30 until the accounts package was installed.',
].join('\n');

const WIN_INI = [
  '[windows]',
  'load=',
  'run=',
  '[Desktop]',
  'Wallpaper=C:\\WINDOWS\\BEIGE.BMP',
  '[Ports]',
  'LPT1:=',
].join('\n');

/**
 * The handover, on the desk of the person who has just left.
 *
 * It is the one file in this estate written TO the player, and it says the
 * three things a first day needs and nothing the game does not already model.
 */
const HANDOVER = [
  'HANDOVER - read this before you ring anybody',
  '',
  '1. Everything in this building prints through PRINT-01. Everything.',
  '   When the spooler wedges, the queue is a directory and the directory',
  '   is on that box: \\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS',
  '',
  '2. The Event Viewer is not decoration. Every box has been writing down',
  '   what happened to it the whole time somebody was describing it to you',
  '   over the phone.',
  '',
  '3. If somebody rings and you cannot prove they are who they say they',
  '   are, you have not proved they are who they say they are.',
  '',
  '- your predecessor, who is not answering their phone either',
].join('\n');

const RUNBOOK = [
  'PRINT SPOOLER - the order matters',
  '',
  '  1. Stop the spooler.  The queued jobs are files it has open, and',
  '     deleting them out from under it is exactly when deletion fails.',
  '  2. Empty the queue.   "clearqueue <printer>" does the first two of',
  '                        these and leaves the service stopped.',
  '  3. Start it again.    "restart <printer server>\\Spooler".',
  '',
  'Starting it before the queue is empty hands it the job that jammed it,',
  'and you get to do all of this again in four minutes.',
].join('\n');

const README_SUPPORT = [
  'C:\\SUPPORT holds the tools first line is allowed to run.',
  'It is on the PATH, which is the only reason anything here works.',
].join('\n');

/**
 * The report service's own configuration, on the box it runs on.
 *
 * It explains a service that is not doing its job, in the place a tech would
 * look and in the words the person who did it left behind. It claims nothing
 * about the service's state now - a file cannot know that - only when the job
 * last produced anything, which is the date the shipped KB article already
 * tells the player to work the deadline with.
 */
const REPORTSVC_INI = [
  '[Service]',
  '; Paused for the month-end window. PUT IT BACK AFTER. - MK 14/03/1998',
  'Description=Scheduled Reports',
  '',
  '[Jobs]',
  'Headcount=headcount.xls',
  'RunAt=02:00',
  'LastRun=14/03/1998  02:00',
  'LastResult=0 (nothing has asked it since)',
].join('\n');

const COMMON_README = [
  'THE COMMON DRIVE',
  '',
  'Everything anybody has ever needed twice is in here somewhere, and',
  'nothing in here has ever been deleted. Do not reorganise it. The last',
  'person who reorganised it does not work here.',
].join('\n');

/**
 * The base image, which every box in this building was built from and none of
 * them has been rebuilt since.
 */
function baseTree(): readonly TreeSeed[] {
  return [
    file('AUTOEXEC.BAT', IMAGED, AUTOEXEC),
    file('CONFIG.SYS', IMAGED, CONFIG_SYS),
    dir(PROFILES_DIR, IMAGED),
    dir('WINDOWS', IMAGED, [
      file('WIN.INI', TOUCHED, WIN_INI),
      dir('SYSTEM32', IMAGED, [
        dir('LOGFILES', IMAGED, [
          // Contents derived: this IS the machine's event log, and `fs.ts`
          // reads it off the same field the Event Viewer paints.
          file('SYSTEM.LOG', IMAGED, ''),
        ]),
        dir('SPOOL', IMAGED, [
          // And this IS the queue on whatever printer is plugged into this
          // box. Every Windows machine has the directory; on most of them it
          // is empty, which is what a healthy print path looks like.
          dir('PRINTERS', IMAGED),
        ]),
      ]),
    ]),
  ];
}

/** The extra directories a box gets for being the box it is. */
const ROLE_TREES: Readonly<Record<MachineRole, readonly TreeSeed[]>> = {
  [MACHINE_ROLES.workstation]: [],
  [MACHINE_ROLES.printServer]: [
    dir('DRIVERS', IMAGED, [
      file(
        'README.TXT',
        '19/09/1996  14:03',
        [
          'Driver disks are in the cupboard by the kettle.',
          'The Hercules 400 driver on this box is the one that works.',
          'Do not update it. It was updated once.',
        ].join('\n'),
      ),
    ]),
  ],
  [MACHINE_ROLES.fileServer]: [
    dir('REPORTSVC', MARCH, [
      file('REPORTSVC.INI', MARCH, REPORTSVC_INI),
    ]),
    dir('SHARES', IMAGED, [
      dir('COMMON', '02/09/1998  08:55', [
        file('README.TXT', '17/07/1997  10:31', COMMON_README),
      ]),
    ]),
    // Payroll's own directory, which first line has no rights to and can see
    // the name of. That is what an ACL looks like from the outside, and it is
    // the honest "no" this estate has: not a locked door, a permission.
    dir('PAYROLL', '04/09/1998  17:44', [], true),
  ],
  [MACHINE_ROLES.domainController]: [
    dir('NETLOGON', IMAGED, [
      file(
        'LOGON.BAT',
        TOUCHED,
        [
          '@ECHO OFF',
          'NET USE P: \\\\WORKGRUMBLE\\common /PERSISTENT:YES',
          'REM P: because somebody had already taken every other letter.',
        ].join('\n'),
      ),
    ]),
  ],
};

/**
 * The one box that is not like the others: the desk the support terminal runs
 * on. It has the tools directory on its path and the handover in its profile,
 * because somebody sat here before you did.
 */
const SUPPORT_DESK_TREE: readonly TreeSeed[] = [
  dir(SUPPORT_DIR, '04/09/1998  16:58', [
    file('README.TXT', '11/06/1994  09:20', README_SUPPORT),
    file('RUNBOOK.TXT', '04/09/1998  16:58', RUNBOOK),
  ]),
];

/* -- the seed ------------------------------------------------------------- */

export interface DriveSeed {
  readonly machineId: string;
  readonly role: MachineRole;
  /** The account that logs on here, or nothing on a box nobody sits at. */
  readonly ownerUsername?: string;
  /**
   * Whether this is the desk the support terminal runs on. It is a fact about
   * which chair the player is in rather than about what kind of box it is,
   * which is why it is passed in by the seed that knows and not guessed at
   * from a hostname here.
   */
  readonly supportDesk?: boolean;
}

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

function entryOps(
  ops: SetupOp[],
  machineId: string,
  parentId: string,
  segments: readonly string[],
  entry: TreeSeed,
): void {
  const here = [...segments, entry.name];
  const id = fsNodeId(machineId, here, entry.kind);

  addNode(ops, {
    id,
    kind: entry.kind,
    fields: {
      [FIELDS.name]: entry.name,
      [FIELDS.modified]: entry.modified,
      ...(entry.accessDenied === true ? { [FIELDS.accessDenied]: true } : {}),
      ...(entry.kind === 'file' && entry.content !== undefined
        ? { [FIELDS.content]: entry.content }
        : {}),
    },
  });
  addEdge(ops, { from: parentId, to: id, kind: 'contains' });

  if (entry.kind === 'directory') {
    for (const child of entry.children ?? []) {
      entryOps(ops, machineId, id, here, child);
    }
  }
}

/**
 * One machine's drive, as construction ops: the root, everything the image put
 * on it, whatever its role adds, and a profile for whoever logs on there.
 *
 * Depth first, parents before children, so no edge is ever laid to a node the
 * engine has not built yet - the same rule the rest of the seed follows and
 * the same refusal if it is broken.
 */
export function driveSetup(drive: Readonly<DriveSeed>): readonly SetupOp[] {
  const ops: SetupOp[] = [];
  const rootId = driveRootId(drive.machineId);

  addNode(ops, {
    id: rootId,
    kind: 'directory',
    fields: {
      [FIELDS.name]: 'C:',
      [FIELDS.modified]: IMAGED,
    },
  });
  addEdge(ops, { from: drive.machineId, to: rootId, kind: 'contains' });

  const tree: TreeSeed[] = [
    ...baseTree(),
    ...ROLE_TREES[drive.role],
    ...(drive.supportDesk === true ? SUPPORT_DESK_TREE : []),
  ];

  for (const entry of tree) {
    entryOps(ops, drive.machineId, rootId, [], entry);
  }

  // A profile exists where somebody has logged on, which is why the boxes
  // nobody sits at have `Documents and Settings` and nothing in it.
  if (
    drive.ownerUsername !== undefined
    && drive.role === MACHINE_ROLES.workstation
  ) {
    const profileParent = fsNodeId(drive.machineId, [PROFILES_DIR], 'directory');
    const profile = dir(drive.ownerUsername, '04/09/1998  17:31', [
      dir('Desktop', '04/09/1998  17:31'),
      dir(
        'My Documents',
        '04/09/1998  17:31',
        drive.supportDesk === true
          ? [file('HANDOVER.TXT', '04/09/1998  17:31', HANDOVER)]
          : [],
      ),
    ]);

    entryOps(ops, drive.machineId, profileParent, [PROFILES_DIR], profile);
  }

  return ops;
}
