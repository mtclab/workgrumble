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
import { encodeStoredFile, storedBytes, type StoredFile } from './listings';

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
/** What a profile calls the place its owner thinks everything they save goes. */
export const MY_DOCUMENTS = 'My Documents';
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

/**
 * Where everything a program opens on your behalf lands, and where nobody
 * looks. It is on every box because it is on every box.
 */
export const TEMP_SEGMENTS: readonly string[] = Object.freeze([
  'WINDOWS',
  'TEMP',
]);

/** The scanning software's own directories, on the box that runs it. */
const SCANNER_DIR = 'SCANNER';
export const SCANNER_EXPORT_SEGMENTS: readonly string[] = Object.freeze([
  SCANNER_DIR,
  'EXPORT',
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

/** The directory a program saves into when nobody chose anywhere. */
export function tempDirId(machineId: string): string {
  return fsNodeId(machineId, TEMP_SEGMENTS, 'directory');
}

/** The directory the scanning software has been filling since 1997. */
export function scannerExportDirId(machineId: string): string {
  return fsNodeId(machineId, SCANNER_EXPORT_SEGMENTS, 'directory');
}

/** A profile's own documents on a box, for whoever logs on there. */
export function myDocumentsDirId(
  machineId: string,
  username: string,
): string {
  return fsNodeId(
    machineId,
    [PROFILES_DIR, username, MY_DOCUMENTS],
    'directory',
  );
}

/** Any entry a ticket has to build for itself, named the way the seed names it. */
export function fsEntryId(
  machineId: string,
  segments: readonly string[],
  kind: 'directory' | 'file',
): string {
  return fsNodeId(machineId, segments, kind);
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
  /**
   * A directory whose listing is what a program has written into it rather
   * than files this world holds any text for. It has no children: the two are
   * mutually exclusive, because a listing read from a field and a listing read
   * from edges would be one directory with two answers.
   */
  readonly stored?: readonly StoredSeed[];
  /** Whether what is in it is a second copy of something. */
  readonly disposable?: boolean;
}

type TreeSeed = FileSeed | DirSeed;

/** One file a program wrote: what a listing prints of it, and nothing else. */
type StoredSeed = StoredFile;

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

/** A directory a program fills, and whose contents are a second copy. */
function storedDir(
  name: string,
  modified: string,
  stored: readonly StoredSeed[],
  disposable: boolean,
): DirSeed {
  return {
    kind: 'directory',
    name,
    modified,
    stored,
    ...(disposable ? { disposable: true } : {}),
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

/**
 * The log the image left in the temp directory in 1994, and the reason a
 * player looking for a lost file finds something in there rather than nothing.
 *
 * It is also the honest description of what that directory is for, sitting in
 * the directory itself, which is where a tech would read it.
 */
const SETUP_LOG = [
  'SETUP.LOG - workstation build, 11/06/1994',
  '',
  'Files copied ....... 1,204',
  'Errors ............. 0',
  'Warnings ........... 1',
  '',
  'WARNING: TEMP is on the system drive. Anything a program opens for you',
  'lands here, nothing here is anybody\'s idea of a filing system, and the',
  'machine treats the lot of it as disposable at the next clear-out.',
].join('\n');

/**
 * The scanning software's own configuration, and the sentence that explains a
 * drive nobody has looked at since 1997.
 */
const SCANNER_INI = [
  '[PalletScan]',
  'Version=2.1c',
  'DataPath=C:\\SCANNER\\DATA',
  'ExportPath=C:\\SCANNER\\EXPORT',
  '',
  '[Export]',
  '; Written at the end of every month and sent to head office the same',
  '; night. Nobody has opened one since, and nothing here reads them back.',
  'Schedule=MONTHLY',
  '; Do not change this. - the man who installed it, 1997',
  'KeepExports=ALL',
].join('\n');

const PALLETS_DAT = [
  'PALLETSCAN DATA FILE - do not edit, do not move, do not delete',
  '',
  'This is where every pallet in the building is. It is not backed up,',
  'it is not copied anywhere, and the warehouse runs off it every morning.',
  'The exports next door are last month\'s news. This is today.',
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
      // Every box has one, and everything a program opens on somebody's
      // behalf lands in it. It is where the file nobody can find has always
      // been, on every estate anybody has ever worked on.
      dir('TEMP', IMAGED, [
        file('SETUP.LOG', IMAGED, SETUP_LOG),
      ]),
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

/* -- what is INSTALLED on a box, as opposed to what it is ----------------- */

/**
 * Software a particular box runs, which is a fact about that box rather than
 * about its role: one workstation in this building scans pallets and the other
 * nine do not, and no naming convention could tell you which.
 */
export const SOFTWARE = {
  palletScanner: 'pallet_scanner',
} as const;

export type Software = (typeof SOFTWARE)[keyof typeof SOFTWARE];

/**
 * The scanner's monthly exports: twelve months of barcode reads, each written
 * at two minutes to midnight on the last night of the month and uploaded the
 * same night.
 *
 * They are the fault the warehouse box has been carrying since 1997 - three
 * hundred megabytes of a second copy on a drive with a few left - and they are
 * a listing rather than files, because a file's size in this world is what
 * `type` would print and thirty megabytes of barcodes is not a thing anybody
 * should be shown a screenful of.
 */
const SCANNER_EXPORTS: readonly StoredSeed[] = Object.freeze([
  { name: 'SCN9709.EXP', bytes: 22_020_096, modified: '30/09/1997  23:58' },
  { name: 'SCN9710.EXP', bytes: 24_117_248, modified: '31/10/1997  23:58' },
  { name: 'SCN9711.EXP', bytes: 23_068_672, modified: '30/11/1997  23:58' },
  { name: 'SCN9712.EXP', bytes: 18_874_368, modified: '31/12/1997  23:58' },
  { name: 'SCN9801.EXP', bytes: 25_165_824, modified: '31/01/1998  23:58' },
  { name: 'SCN9802.EXP', bytes: 24_641_536, modified: '28/02/1998  23:58' },
  { name: 'SCN9803.EXP', bytes: 27_262_976, modified: '31/03/1998  23:58' },
  { name: 'SCN9804.EXP', bytes: 26_214_400, modified: '30/04/1998  23:58' },
  { name: 'SCN9805.EXP', bytes: 28_311_552, modified: '31/05/1998  23:58' },
  { name: 'SCN9806.EXP', bytes: 29_360_128, modified: '30/06/1998  23:58' },
  { name: 'SCN9807.EXP', bytes: 30_408_704, modified: '31/07/1998  23:58' },
  { name: 'SCN9808.EXP', bytes: 31_457_280, modified: '31/08/1998  23:58' },
]);

/** What emptying that directory gives back, to the byte. */
export const SCANNER_EXPORT_BYTES: number = storedBytes(SCANNER_EXPORTS);

const SOFTWARE_TREES: Readonly<Record<Software, readonly TreeSeed[]>> = {
  [SOFTWARE.palletScanner]: [
    dir(SCANNER_DIR, '31/08/1998  23:58', [
      file('SCANNER.INI', '19/06/1997  10:04', SCANNER_INI),
      dir('DATA', '04/09/1998  17:58', [
        file('PALLETS.DAT', '04/09/1998  17:58', PALLETS_DAT),
      ]),
      // The one that has eaten the drive, and the one that is safe to empty:
      // both facts are on the directories themselves, where a verb can read
      // them, because "which of these two may I delete" is the whole ticket.
      storedDir('EXPORT', '31/08/1998  23:58', SCANNER_EXPORTS, true),
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
  /** What the network calls the box, which is what its drive is stamped with. */
  readonly hostname: string;
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
  /** What is installed on this one, which no role and no hostname implies. */
  readonly software?: readonly Software[];
}

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

function storedFields(
  stored: readonly StoredSeed[],
): Record<string, string | number> {
  return {
    [FIELDS.storedFiles]: stored.map(encodeStoredFile).join('\n'),
    [FIELDS.storedBytes]: storedBytes(stored),
  };
}

function entryOps(
  ops: SetupOp[],
  drive: Readonly<DriveSeed>,
  parentId: string,
  segments: readonly string[],
  entry: TreeSeed,
): void {
  const here = [...segments, entry.name];
  const id = fsNodeId(drive.machineId, here, entry.kind);
  const stored = entry.kind === 'directory' ? entry.stored : undefined;

  addNode(ops, {
    id,
    kind: entry.kind,
    fields: {
      [FIELDS.name]: entry.name,
      [FIELDS.modified]: entry.modified,
      [FIELDS.volume]: drive.hostname,
      ...(entry.accessDenied === true ? { [FIELDS.accessDenied]: true } : {}),
      ...(entry.kind === 'directory' && entry.disposable === true
        ? { [FIELDS.disposable]: true }
        : {}),
      ...(stored === undefined ? {} : storedFields(stored)),
      ...(entry.kind === 'file' && entry.content !== undefined
        ? { [FIELDS.content]: entry.content }
        : {}),
    },
  });
  addEdge(ops, { from: parentId, to: id, kind: 'contains' });

  if (entry.kind === 'directory') {
    for (const child of entry.children ?? []) {
      entryOps(ops, drive, id, here, child);
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
      [FIELDS.volume]: drive.hostname,
    },
  });
  addEdge(ops, { from: drive.machineId, to: rootId, kind: 'contains' });

  const tree: TreeSeed[] = [
    ...baseTree(),
    ...ROLE_TREES[drive.role],
    ...(drive.software ?? []).flatMap((installed) => SOFTWARE_TREES[installed]),
    ...(drive.supportDesk === true ? SUPPORT_DESK_TREE : []),
  ];

  for (const entry of tree) {
    entryOps(ops, drive, rootId, [], entry);
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
        MY_DOCUMENTS,
        '04/09/1998  17:31',
        drive.supportDesk === true
          ? [file('HANDOVER.TXT', '04/09/1998  17:31', HANDOVER)]
          : [],
      ),
    ]);

    entryOps(ops, drive, profileParent, [PROFILES_DIR], profile);
  }

  return ops;
}
