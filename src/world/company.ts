import type { Edge, GraphNode, SetupOp } from '../engine-api';
import { NO_RUN } from './consumables';
import {
  VERIFICATION_METHODS,
  verificationChannels,
} from './fallout';
import { driveSetup } from './filesystem';
import {
  DEVICE_TYPES,
  FIELDS,
  type MachineRole,
  MACHINE_ROLES,
  SERVICE_CLASSES,
  SERVICE_STATUS,
  STARTUP_TYPES,
} from './fields';
import { STARTING_REPUTATION } from './meters';
import { BASELINE_SERVICES, baselineServiceId } from './services';

/**
 * What everybody on this estate has on file, from the June rollout: a number
 * the directory can ring back, and a recovery code in an envelope.
 *
 * The other two approved channels are not seeded because this building cannot
 * offer them. Nobody has a nominated recovery contact - the rollout never
 * asked - and nobody comes to the desk, because there is no desk to come to:
 * the service desk is a phone number and a form, which is exactly how a
 * fifty-person company with one first-line tech works.
 */
const VERIFICATION_CHANNELS_ON_FILE = verificationChannels([
  VERIFICATION_METHODS.callback,
  VERIFICATION_METHODS.recoveryCode,
]);

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

/**
 * The employer. One company = one graph seed (DESIGN_POC section 6.4), so a
 * later employer switch loads a different pack rather than a different engine.
 *
 * The seed is a fixed literal: same nodes, same fields, same edges, same order,
 * every boot. Nothing here consumes the simulation RNG, which keeps the world
 * replayable and leaves the RNG stream to the systems that vary outcomes.
 */
export const COMPANY = {
  name: 'Workgrumble Ltd',
  domain: 'WORKGRUMBLE',
  motto: 'Established 1987. Refurbished 1994. Untouched since.',
} as const;

export const COMPANY_IDS = {
  /** The player. */
  player: 'person:pat',
  playerAccount: 'account:pat',
  playerMachine: 'machine:beige-box',
  monitor: 'device:monitor',
  fan: 'service:chassis-fan',

  /** The boss. Mail nags now, boss mechanics in M3. */
  boss: 'person:desmond',
  bossAccount: 'account:desmond',

  ada: 'person:ada',
  adaAccount: 'account:ada',
  adaMachine: 'machine:ada',
  adaMouse: 'device:ada-mouse',

  gary: 'person:gary',
  garyAccount: 'account:gary',
  garyMachine: 'machine:gary',
  garyMailRule: 'mail_rule:gary-autofile',

  nina: 'person:nina',
  ninaAccount: 'account:nina',

  bev: 'person:bev',
  bevAccount: 'account:bev',

  /** Accounts payable, a new phone, and an authenticator that died with it. */
  priya: 'person:priya',
  priyaAccount: 'account:priya',
  priyaMachine: 'machine:priya',

  /** Two weeks into the job and already the subject of a chain of two. */
  kwame: 'person:kwame',
  kwameAccount: 'account:kwame',
  kwameMachine: 'machine:kwame',

  /** First morning, no licence, and a leaver still holding the seat. */
  rob: 'person:rob',
  robAccount: 'account:rob',
  robMachine: 'machine:rob',

  /** The warehouse, and the tablet in the warehouse cupboard. */
  hilda: 'person:hilda',
  hildaAccount: 'account:hilda',
  warehouseMachine: 'machine:warehouse',
  warehouseTablet: 'device:warehouse-tablet',

  /** Nights in logistics, and the only person who sees the cleaner. */
  owen: 'person:owen',
  owenAccount: 'account:owen',

  /** The one who reads the whole message and files a ticket anyway. */
  terry: 'person:terry',
  terryAccount: 'account:terry',
  terryMachine: 'machine:terry',

  /** Marketing, and the only person this week who did the right thing. */
  dennis: 'person:dennis',
  dennisAccount: 'account:dennis',
  dennisMachine: 'machine:dennis',

  /** Accounts, and a backup agent that stopped itself at nine oh seven. */
  marcus: 'person:marcus',
  marcusAccount: 'account:marcus',
  marcusMachine: 'machine:marcus',
  backupAgent: 'service:backup-agent',

  /** HR, and a report that has not run since the spring. */
  yolanda: 'person:yolanda',
  yolandaAccount: 'account:yolanda',

  /** Facilities. No tickets, one roll of tape, and the fix nobody codes. */
  vic: 'person:vic',
  vicAccount: 'account:vic',

  /**
   * The leaver. Offboarded in April, account switched off the same afternoon,
   * and still holding a seat of a licence somebody is paying for every month.
   */
  colin: 'person:colin',
  colinAccount: 'account:colin',

  printServer: 'machine:print',
  printer: 'device:printer',
  spooler: 'service:spooler',
  vpn: 'service:vpn',

  /** The warehouse printer, and the socket the cleaner's trolley likes. */
  warehousePrintServer: 'machine:print-warehouse',
  warehousePrinter: 'device:printer-warehouse',

  /** The file server: the share, the report job, and everybody's Wednesday. */
  fileServer: 'machine:files',
  fileShare: 'service:fileshare',
  reportJob: 'service:report-job',

  /**
   * The domain controller. It holds every account in the directory app, every
   * group membership the terminal reads back, and the clock the whole building
   * disagrees with by four minutes.
   *
   * Nobody owns it, nobody has logged on to it since it was built, and it is in
   * the game because a domain with no domain controller is a company where the
   * accounts, the logons and the lockouts happen nowhere.
   */
  domainController: 'machine:dc',

  /** What the accounts package counts before it lets anybody in. */
  suiteLicences: 'service:suite-licences',

  /** The transport rule somebody wrote in March and never switched on. */
  phishBlock: 'mail_rule:phish-block',

  printUsers: 'group:print-users',
  vpnUsers: 'group:vpn-users',
  /**
   * Send As, which is not the same permission as Full Access and is the whole
   * lesson of the week's two-ticket chain. It is a group in this estate
   * because that is how a mail system this old grants it.
   */
  salesSendAs: 'group:sales-send-as',
  commonShare: 'share:common',
  /** The shared mailbox Sales answer from, and nobody owns. */
  salesMailbox: 'share:sales-mailbox',
} as const;

export type CompanyNodeId = (typeof COMPANY_IDS)[keyof typeof COMPANY_IDS];

interface StaffSeed {
  readonly person: string;
  readonly account: string;
  readonly name: string;
  readonly title: string;
  readonly username: string;
  readonly desk: string;
  /**
   * When they were last in, as a tick, or absent for somebody who has not
   * signed in since before this log starts.
   *
   * Absent rather than a negative number, because the clock in this game
   * counts from the first Monday morning and there is no honest way to write
   * "a fortnight ago" in it. A directory that shows "not since before the log
   * starts" is telling the truth; one that shows a made-up date is not.
   */
  readonly lastLogon?: number;
  /**
   * Whether this account is holding one of the suite's seats on the morning the
   * game starts. Written per person rather than derived, because who is holding
   * a seat is a fact about April rather than about anybody's job title - which
   * is exactly what makes the new starter's first morning somebody else's fault.
   */
  readonly licence?: boolean;
  /**
   * The leaver. Switched off on purpose, months ago, by a process that did its
   * job - it is not a fault, and the ticket it causes is not about the account
   * at all.
   */
  readonly disabled?: boolean;
}

const STAFF: readonly StaffSeed[] = [
  {
    person: COMPANY_IDS.player,
    account: COMPANY_IDS.playerAccount,
    name: 'Pat Pending',
    title: 'IT Support Technician (probationary)',
    username: 'ppending',
    desk: 'The cupboard with the good kettle',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.boss,
    account: COMPANY_IDS.bossAccount,
    name: 'Desmond Frisk',
    title: 'Service Delivery Lead',
    username: 'dfrisk',
    desk: 'The office with the door',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.ada,
    account: COMPANY_IDS.adaAccount,
    name: 'Ada Whitlock',
    title: 'Senior Account Manager',
    username: 'awhitlock',
    desk: 'Sales, by the window she will not stop opening',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.gary,
    account: COMPANY_IDS.garyAccount,
    name: 'Gary Poole',
    title: 'Payroll Clerk',
    username: 'gpoole',
    desk: 'Payroll, behind the plant',
    // Two weeks away. He has not been in since before this log starts, which
    // is the first thing the directory says about him and the reason the
    // lockout is not a mystery.
  },
  {
    person: COMPANY_IDS.nina,
    account: COMPANY_IDS.ninaAccount,
    name: 'Nina Okafor',
    title: 'Logistics Coordinator',
    username: 'nokafor',
    desk: 'Logistics, nearest the printer and regretting it',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.bev,
    account: COMPANY_IDS.bevAccount,
    name: 'Bev Tannock',
    title: 'Reception',
    username: 'btannock',
    desk: 'Reception, guarding the visitor biscuits',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.priya,
    account: COMPANY_IDS.priyaAccount,
    name: 'Priya Raval',
    title: 'Accounts Payable',
    username: 'praval',
    desk: 'Accounts, under the only working air vent',
    lastLogon: 0,
    licence: true,
  },
  {
    person: COMPANY_IDS.kwame,
    account: COMPANY_IDS.kwameAccount,
    name: 'Kwame Boateng',
    title: 'Sales Executive',
    username: 'kboateng',
    desk: 'Sales, the desk with the broken drawer',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.rob,
    account: COMPANY_IDS.robAccount,
    name: 'Rob Tulliver',
    title: 'Finance Assistant (first day)',
    username: 'rtulliver',
    desk: 'Finance, the desk they cleared on Tuesday',
    // He has never signed in, because he has never been able to.
  },
  {
    person: COMPANY_IDS.hilda,
    account: COMPANY_IDS.hildaAccount,
    name: 'Hilda Marsh',
    title: 'Warehouse Supervisor',
    username: 'hmarsh',
    desk: 'The warehouse, and she would like that noted',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.owen,
    account: COMPANY_IDS.owenAccount,
    name: 'Owen Pryce',
    title: 'Logistics, late shift',
    username: 'opryce',
    desk: 'Whichever desk is free at six in the evening',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.terry,
    account: COMPANY_IDS.terryAccount,
    name: 'Terry Blunt',
    title: 'Estimating',
    username: 'tblunt',
    desk: 'Estimating, behind a monitor he has never once cleaned',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.dennis,
    account: COMPANY_IDS.dennisAccount,
    name: 'Dennis Hoyle',
    title: 'Marketing',
    username: 'dhoyle',
    desk: 'Marketing, nearest the poster he designed',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.marcus,
    account: COMPANY_IDS.marcusAccount,
    name: 'Marcus Kelp',
    title: 'Management Accountant',
    username: 'mkelp',
    desk: 'Accounts, by the window with the blind that does not',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.yolanda,
    account: COMPANY_IDS.yolandaAccount,
    name: 'Yolanda Reece',
    title: 'HR Manager',
    username: 'yreece',
    desk: 'HR, the office with the frosted glass',
    lastLogon: 0,
    licence: true,
  },
  {
    person: COMPANY_IDS.vic,
    account: COMPANY_IDS.vicAccount,
    name: 'Vic Ndlovu',
    title: 'Facilities Supervisor',
    username: 'vndlovu',
    desk: 'The plant room, and everywhere else, eventually',
    lastLogon: 0,
  },
  {
    person: COMPANY_IDS.colin,
    account: COMPANY_IDS.colinAccount,
    name: 'Colin Peach',
    title: 'Management Accountant (left in April)',
    username: 'cpeach',
    desk: 'The desk they cleared on Tuesday, before that',
    disabled: true,
    licence: true,
  },
];

interface MachineSeed {
  readonly id: string;
  readonly hostname: string;
  /** What the box is for, which is what decides the services on it. */
  readonly role: MachineRole;
  readonly owner?: string;
  /** The box this one's cable ends up in. Everything ends up in PRINT-01. */
  readonly wiredTo?: string;
  readonly resolution?: string;
  readonly pendingUpdates?: boolean;
  /**
   * What is in the case. The comedy in this game lives in the hardware rather
   * than in invented telemetry, and both the About dialog and `systeminfo`
   * read these two fields - so a machine cannot have two different amounts of
   * memory depending on which window is open.
   */
  readonly processor: string;
  readonly memory: string;
  /**
   * How much of the drive is not being used, in bytes.
   *
   * Seeded rather than counted off the files on it: a listing shows the
   * handful of things worth naming and a real drive is mostly things nobody
   * names. It is the number the footer of a directory listing quotes, and the
   * warehouse box is nearly full because a box in a warehouse always is.
   */
  readonly diskFree: number;
}

const DESK_PROCESSOR = 'Pentagon 133 MHz (one of them, and it is trying)';
const DESK_MEMORY = '64 MB (48 MB usable, and nobody knows why)';

const MACHINES: readonly MachineSeed[] = [
  {
    id: COMPANY_IDS.playerMachine,
    hostname: 'BEIGE-BOX',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.player,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 341_458_944,
  },
  {
    id: COMPANY_IDS.adaMachine,
    hostname: 'SALES-02',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.ada,
    wiredTo: COMPANY_IDS.printServer,
    pendingUpdates: true,
    processor: 'Pentagon 166 MHz (the good one, because Sales asked twice)',
    memory: '96 MB',
    diskFree: 512_204_800,
  },
  {
    id: COMPANY_IDS.garyMachine,
    hostname: 'PAYROLL-04',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.gary,
    wiredTo: COMPANY_IDS.printServer,
    resolution: '800x600',
    pendingUpdates: true,
    processor: 'Pentagon 90 MHz',
    memory: '32 MB',
    diskFree: 88_145_920,
  },
  {
    id: COMPANY_IDS.printServer,
    hostname: 'PRINT-01',
    role: MACHINE_ROLES.printServer,
    // Signed for by the lead years ago, and never once looked at since:
    // ownership on paper and ownership in practice are not the same graph.
    owner: COMPANY_IDS.boss,
    resolution: '640x480',
    pendingUpdates: true,
    processor: 'Pentagon 200 MHz',
    memory: '128 MB',
    diskFree: 47_185_920,
  },
  {
    id: COMPANY_IDS.priyaMachine,
    hostname: 'ACCTS-01',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.priya,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 402_653_184,
  },
  {
    id: COMPANY_IDS.kwameMachine,
    hostname: 'SALES-05',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.kwame,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 615_514_112,
  },
  {
    id: COMPANY_IDS.robMachine,
    hostname: 'FIN-02',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.rob,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 1_073_741_824,
  },
  {
    id: COMPANY_IDS.warehouseMachine,
    hostname: 'WHOUSE-01',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.hilda,
    wiredTo: COMPANY_IDS.warehousePrintServer,
    processor: 'Pentagon 90 MHz (and a layer of warehouse on the fan)',
    memory: '32 MB',
    diskFree: 3_145_728,
  },
  {
    id: COMPANY_IDS.terryMachine,
    hostname: 'EST-03',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.terry,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 268_435_456,
  },
  {
    id: COMPANY_IDS.dennisMachine,
    hostname: 'MKTG-02',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.dennis,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 62_914_560,
  },
  {
    id: COMPANY_IDS.marcusMachine,
    hostname: 'ACCTS-03',
    role: MACHINE_ROLES.workstation,
    owner: COMPANY_IDS.marcus,
    wiredTo: COMPANY_IDS.printServer,
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 314_572_800,
  },
  // The three boxes nobody sits at. None of them is owned by anybody, which is
  // most of the reason all three are in this game.
  {
    id: COMPANY_IDS.fileServer,
    hostname: 'FILES-01',
    role: MACHINE_ROLES.fileServer,
    // On the same switch as everything else, because everybody opens the share
    // every Wednesday: a file server nothing could reach would be a file
    // server nothing could use, and `ping` would have been saying so.
    wiredTo: COMPANY_IDS.printServer,
    resolution: '640x480',
    processor: 'Pentagon 200 MHz (a desktop, under a desk, doing a server job)',
    memory: '256 MB',
    diskFree: 826_277_888,
  },
  {
    id: COMPANY_IDS.warehousePrintServer,
    hostname: 'PRINT-02',
    role: MACHINE_ROLES.printServer,
    // The uplink down the corridor, which is the whole warehouse's connection
    // to the building and shares a socket with whatever the cleaner plugs in.
    wiredTo: COMPANY_IDS.printServer,
    resolution: '640x480',
    processor: 'Pentagon 90 MHz',
    memory: '32 MB',
    diskFree: 128_974_848,
  },
  {
    id: COMPANY_IDS.domainController,
    hostname: 'DC-01',
    role: MACHINE_ROLES.domainController,
    wiredTo: COMPANY_IDS.printServer,
    resolution: '640x480',
    processor: 'Pentagon 200 MHz (holding every logon in the building)',
    memory: '256 MB',
    diskFree: 1_610_612_736,
  },
];

const GROUP_MEMBERSHIPS: readonly { account: string; group: string }[] = [
  { account: COMPANY_IDS.playerAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.playerAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.bossAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.adaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.adaAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.garyAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.garyAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.ninaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.ninaAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.bevAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.priyaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.kwameAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.robAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.hildaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.owenAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.terryAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.dennisAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.marcusAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.yolandaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.vicAccount, group: COMPANY_IDS.printUsers },
  // Send As on the Sales mailbox. Ada has it because she was there when it was
  // set up; the new starter loses both of these to the setup of the two
  // tickets about them, which is two permissions and therefore - the whole
  // lesson - two tickets.
  //
  // Kwame is seeded WITH them and each ticket takes its own one away as it
  // arrives, which is the same shape every other missing-permission ticket in
  // this world uses. Without it the fault was the absence of something nobody
  // had written down, so a player who granted Full Access and Send As on
  // Monday afternoon - both perfectly legal moves - was handed two tickets
  // that spawned already resolved, and the chain that IS the lesson never
  // happened.
  { account: COMPANY_IDS.adaAccount, group: COMPANY_IDS.salesSendAs },
  { account: COMPANY_IDS.kwameAccount, group: COMPANY_IDS.salesSendAs },
];

/**
 * Where a named service above IS the box's copy of a baseline one.
 *
 * The print server's spooler and the file server's Server service are both
 * real baseline services that this week's tickets are about, so they are
 * written by hand with the rest of the named ones - and the baseline must not
 * seed a second copy beside them, or the estate would hold two spoolers on one
 * box and only one of them would ever be the one that jams.
 */
const NAMED_SERVICE_TWINS: Readonly<Record<string, readonly string[]>> = {
  [COMPANY_IDS.printServer]: ['Spooler'],
  [COMPANY_IDS.fileServer]: ['LanmanServer'],
};

/** Gary is deliberately left off the share: it gives grant_access a job. */
const SHARE_ACCESS: readonly { account: string; share: string }[] = [
  { account: COMPANY_IDS.playerAccount, share: COMPANY_IDS.commonShare },
  { account: COMPANY_IDS.bossAccount, share: COMPANY_IDS.commonShare },
  { account: COMPANY_IDS.adaAccount, share: COMPANY_IDS.commonShare },
  { account: COMPANY_IDS.ninaAccount, share: COMPANY_IDS.commonShare },
  { account: COMPANY_IDS.bevAccount, share: COMPANY_IDS.commonShare },
  { account: COMPANY_IDS.adaAccount, share: COMPANY_IDS.salesMailbox },
  // And Kwame, until the ticket about it arrives and takes it off him again.
  { account: COMPANY_IDS.kwameAccount, share: COMPANY_IDS.salesMailbox },
];

/**
 * The employer as construction ops. The seed is data the engine applies, not
 * calls into a graph the world holds: nothing outside the engine gets a
 * writable handle on the world any more.
 */
export function companySetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];

  for (const member of STAFF) {
    addNode(ops, {
      id: member.person,
      kind: 'person',
      fields: {
        [FIELDS.name]: member.name,
        [FIELDS.title]: member.title,
        [FIELDS.desk]: member.desk,
        // The day, and the money the day is for, belong to the person working
        // it. Nobody else in the building has a shift the player can see.
        ...(member.person === COMPANY_IDS.player
          ? {
            [FIELDS.dayState]: 'morning_brief',
            [FIELDS.farmFund]: 0,
            // The meters are seeded rather than left absent because the op
            // language moves a field it can read: arithmetic on a field that
            // was never a number is a refusal, and it should be, so the
            // world's opening position has to say what these start at.
            [FIELDS.stress]: 0,
            [FIELDS.suspicion]: 0,
            [FIELDS.reputation]: STARTING_REPUTATION,
            // The weighted read starts where the meter does: a Monday morning
            // has no days behind it to weigh.
            [FIELDS.weekReputation]: STARTING_REPUTATION,
            [FIELDS.suspicionEvents]: 0,
            [FIELDS.breachesCharged]: 0,
            [FIELDS.resolveCreditPaid]: 0,
            [FIELDS.caughtEvents]: 0,
            // The desk, on a morning nobody has needed a can yet.
            [FIELDS.deskCans]: 0,
            [FIELDS.drinkStartedAt]: NO_RUN,
            [FIELDS.drinkTolerance]: 0,
            [FIELDS.drinkCrashCharged]: NO_RUN,
            [FIELDS.consumableSpend]: 0,
            // The week itself: which attempt this is, what the fund held when
            // it started, and how the conversation on Friday went. All three
            // are seeded for the same reason the meters are - a field that was
            // never there is a field the op language refuses to move.
            [FIELDS.weekAttempt]: 1,
            [FIELDS.weekOpeningFund]: 0,
            [FIELDS.reviewOutcome]: 'pending',
            [FIELDS.weekEnded]: false,
            // Probation. It is in the fridge with your name on it.
            [FIELDS.beerUnlocked]: false,
            [FIELDS.beerOpened]: false,
          }
          : {}),
      },
    });
    addNode(ops, {
      id: member.account,
      kind: 'account',
      fields: {
        [FIELDS.username]: member.username,
        // Nobody is locked or expired in the SEED. Every account FAULT in this
        // game arrives with the ticket that is about it, which is what puts the
        // lockout in the machine's event log at the minute it happened instead
        // of before the world started.
        //
        // The one account that starts switched off is not a fault: it is a
        // leaver, disabled in April by a process that worked, and the ticket it
        // eventually causes is about the licence he is still holding rather
        // than about the account at all.
        [FIELDS.locked]: false,
        [FIELDS.enabled]: member.disabled !== true,
        [FIELDS.passwordExpired]: false,
        ...(member.licence === undefined
          ? {}
          : { [FIELDS.licence]: member.licence }),
        // Seeded rather than left absent for the reason the meters are: the op
        // language moves a field it can read, and a counter that was never a
        // number is a counter nothing can add to.
        [FIELDS.badPwCount]: 0,
        [FIELDS.pwMustChange]: false,
        // The second-factor rollout finished in June and everybody is on it,
        // which is what makes losing the phone a support call rather than a
        // shrug. A ticket is what takes somebody back off it.
        [FIELDS.mfaEnrolled]: true,
        // And the same rollout is where the identity-proofing channels came
        // from: a callback number the directory holds, and a recovery code
        // handed out in an envelope nobody has thrown away yet. Both were
        // arranged BEFORE anybody needed them, which is the entire property
        // that makes them evidence - unlike a payroll number, which is on a
        // payslip, or a hiring manager, who is on the company blog.
        [FIELDS.verificationChannels]: VERIFICATION_CHANNELS_ON_FILE,
        ...(member.lastLogon === undefined
          ? {}
          : { [FIELDS.lastLogon]: member.lastLogon }),
      },
    });
    addEdge(ops, {
      from: member.person,
      to: member.account,
      kind: 'owns',
    });
  }

  // Every box in the building, as a table. A machine is a hostname, a role, a
  // screen and what is inside the case - everything else interesting about any
  // of them arrives with a ticket.
  //
  // The ROLE is the load-bearing column: it is what decides the twenty-odd
  // baseline services the box runs, because a print server and a domain
  // controller do not run the same list and a tech who has learned one has
  // learned the shape of the others.
  for (const machine of MACHINES) {
    addNode(ops, {
      id: machine.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: machine.hostname,
        [FIELDS.machineRole]: machine.role,
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: machine.resolution ?? '1024x768',
        [FIELDS.pendingUpdates]: machine.pendingUpdates === true,
        [FIELDS.processor]: machine.processor,
        [FIELDS.memory]: machine.memory,
        [FIELDS.diskFree]: machine.diskFree,
      },
    });
  }

  // And what is on each of those drives: the image every box was built from,
  // whatever its role adds, and a profile for whoever logs on there. It goes
  // in immediately after the machines and before anything else, because a
  // `contains` edge from a machine to its own root is an edge like any other
  // and the engine refuses one whose ends are not both built yet.
  for (const machine of MACHINES) {
    const owner = STAFF.find((member) => member.person === machine.owner);

    ops.push(...driveSetup({
      machineId: machine.id,
      role: machine.role,
      ...(owner === undefined ? {} : { ownerUsername: owner.username }),
      supportDesk: machine.id === COMPANY_IDS.playerMachine,
    }));
  }

  // Nodes first, edges after: a desk that prints to the warehouse box is
  // wired to a machine further down this same list, and an edge whose other
  // end has not been built yet is refused by the engine rather than quietly
  // dropped.
  for (const machine of MACHINES) {
    if (machine.owner !== undefined) {
      addEdge(ops, { from: machine.owner, to: machine.id, kind: 'owns' });
    }

    if (machine.wiredTo !== undefined) {
      addEdge(ops, {
        from: machine.id,
        to: machine.wiredTo,
        kind: 'connected_to',
      });
    }
  }

  addNode(ops, {
    id: COMPANY_IDS.monitor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Trinitrend 15"',
      [FIELDS.type]: DEVICE_TYPES.monitor,
      [FIELDS.powered]: true,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.printer,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Hercules 400',
      [FIELDS.type]: DEVICE_TYPES.printer,
      [FIELDS.powered]: true,
      [FIELDS.wedged]: false,
      [FIELDS.queueLen]: 0,
      // The queue is a number AND the files behind it, and both start empty.
      // Seeded rather than left absent for the reason the meters are: the op
      // language moves a field it can read.
      [FIELDS.spoolJobs]: '',
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.adaMouse,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Sales spare mouse',
      [FIELDS.type]: DEVICE_TYPES.mouse,
      [FIELDS.powered]: true,
      [FIELDS.batteryPct]: 4,
    },
  });

  addNode(ops, {
    id: COMPANY_IDS.warehousePrinter,
    kind: 'device',
    fields: {
      // Named nothing like the Hercules on purpose: two printers whose names
      // share a first word is a terminal where "queue hercules" is a question
      // rather than a command.
      [FIELDS.name]: 'Ajax 90',
      [FIELDS.type]: DEVICE_TYPES.printer,
      [FIELDS.powered]: true,
      [FIELDS.wedged]: false,
      [FIELDS.queueLen]: 0,
      [FIELDS.spoolJobs]: '',
    },
  });

  // The tablet in the warehouse cupboard. It was set up in 2019 to scan
  // pallets, it is still logged in as the supervisor, and it has been offering
  // the same password every few minutes ever since somebody changed it.
  addNode(ops, {
    id: COMPANY_IDS.warehouseTablet,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Warehouse scanning tablet',
      [FIELDS.type]: DEVICE_TYPES.tablet,
      [FIELDS.powered]: true,
      [FIELDS.batteryPct]: 61,
      // It holds nothing YET. The credential is what the relock ticket brings,
      // because a device that was hammering the directory before anybody
      // reported it would have locked the account on the Monday.
      [FIELDS.storedCredential]: false,
    },
  });

  // The named services: the ones the WORLD moves. Every one of them is
  // something a ticket is about this week, which is what separates them from
  // the twenty-odd baseline services seeded below them - and each carries the
  // same four facts a real services list holds, so that the two classes are
  // indistinguishable to read and different only in what happens to them.
  //
  // The fan is first and it is the trap: it reports a status like everything
  // else on this box, and it is a lump of spinning plastic rather than
  // software. Saying so in the data is what keeps "restart it" honest
  // everywhere downstream - and it has no short name, because the service
  // manager has never heard of it.
  addNode(ops, {
    id: COMPANY_IDS.fan,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Chassis fan',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.serviceClass]: SERVICE_CLASSES.hardware,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.spooler,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Print Spooler',
      [FIELDS.serviceName]: 'Spooler',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.vpn,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'VPN Concentrator',
      [FIELDS.serviceName]: 'RemoteAccess',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });

  // The backup agent on Marcus's box. It reports a status, it can be stopped
  // and started, and it has never once been stopped by anything but a person.
  addNode(ops, {
    id: COMPANY_IDS.backupAgent,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Backup Agent',
      [FIELDS.serviceName]: 'BackupAgent',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });

  // The file server's Server service, under the name this building calls it.
  // It IS the baseline `LanmanServer` every other box runs - which is why the
  // baseline below leaves it out here rather than seeding a second one - and
  // it is a named service because it is the one everybody's Wednesday hangs
  // off, and therefore the one a ticket is about.
  addNode(ops, {
    id: COMPANY_IDS.fileShare,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'File Sharing',
      [FIELDS.serviceName]: 'LanmanServer',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });

  // The job that builds HR's headcount report. It has been stopped since the
  // spring, and everybody has been doing it by hand and complaining quietly.
  addNode(ops, {
    id: COMPANY_IDS.reportJob,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Scheduled Reports',
      [FIELDS.serviceName]: 'ReportSvc',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });

  // Not a service anybody here can restart: it is somebody else's licence box
  // answering over the wire, and the only number on it that matters is how
  // many seats are not being used. Three of the six are, one of them by a man
  // who left in April.
  addNode(ops, {
    id: COMPANY_IDS.suiteLicences,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Accounts Suite licence pool',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.serviceClass]: SERVICE_CLASSES.appliance,
      [FIELDS.seatsFree]: 0,
    },
  });

  addNode(ops, {
    id: COMPANY_IDS.printUsers,
    kind: 'group',
    fields: { [FIELDS.name]: 'Print Users' },
  });
  addNode(ops, {
    id: COMPANY_IDS.vpnUsers,
    kind: 'group',
    fields: { [FIELDS.name]: 'VPN Users' },
  });
  addNode(ops, {
    id: COMPANY_IDS.salesSendAs,
    kind: 'group',
    fields: { [FIELDS.name]: 'Sales Mailbox - Send As' },
  });

  addNode(ops, {
    id: COMPANY_IDS.commonShare,
    kind: 'share',
    fields: {
      [FIELDS.name]: 'Common Drive',
      [FIELDS.path]: `\\\\${COMPANY.domain}\\common`,
    },
  });

  addNode(ops, {
    id: COMPANY_IDS.salesMailbox,
    kind: 'share',
    fields: {
      [FIELDS.name]: 'Sales (shared mailbox)',
      [FIELDS.path]: `\\\\${COMPANY.domain}\\mail\\sales`,
    },
  });

  // The transport rule somebody wrote the last time this happened, tested
  // once, and never switched on, because switching it on was a change and a
  // change needed a form.
  addNode(ops, {
    id: COMPANY_IDS.phishBlock,
    kind: 'mail_rule',
    fields: {
      [FIELDS.name]: 'Quarantine lookalike sender domains',
      [FIELDS.enabled]: false,
      [FIELDS.target]: 'Quarantine (nobody has ever opened it)',
    },
  });

  addNode(ops, {
    id: COMPANY_IDS.garyMailRule,
    kind: 'mail_rule',
    fields: {
      [FIELDS.name]: 'Anything from Desmond, file under Later',
      [FIELDS.enabled]: true,
      [FIELDS.target]: 'Later (a folder nobody opens)',
    },
  });

  addEdge(ops, {
    from: COMPANY_IDS.gary,
    to: COMPANY_IDS.garyMailRule,
    kind: 'owns',
  });

  addEdge(ops, {
    from: COMPANY_IDS.monitor,
    to: COMPANY_IDS.playerMachine,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: COMPANY_IDS.printer,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: COMPANY_IDS.adaMouse,
    to: COMPANY_IDS.adaMachine,
    kind: 'connected_to',
  });

  // Which printer the spooler actually feeds. Written down rather than
  // guessed from "whatever else is plugged into that box", because the VPN
  // shares the same server and has nothing to do with anybody's backlog.
  addEdge(ops, {
    from: COMPANY_IDS.spooler,
    to: COMPANY_IDS.printer,
    kind: 'connected_to',
  });

  addEdge(ops, {
    from: COMPANY_IDS.warehousePrinter,
    to: COMPANY_IDS.warehousePrintServer,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: COMPANY_IDS.warehouseTablet,
    to: COMPANY_IDS.warehouseMachine,
    kind: 'connected_to',
  });

  addEdge(ops, {
    from: COMPANY_IDS.backupAgent,
    to: COMPANY_IDS.marcusMachine,
    kind: 'runs_on',
  });
  // Everything nobody remembers buying lives on the file server, because it
  // was the box with the space.
  for (const service of [
    COMPANY_IDS.fileShare,
    COMPANY_IDS.reportJob,
    COMPANY_IDS.suiteLicences,
  ]) {
    addEdge(ops, {
      from: service,
      to: COMPANY_IDS.fileServer,
      kind: 'runs_on',
    });
  }

  addEdge(ops, {
    from: COMPANY_IDS.fan,
    to: COMPANY_IDS.playerMachine,
    kind: 'runs_on',
  });
  addEdge(ops, {
    from: COMPANY_IDS.spooler,
    to: COMPANY_IDS.printServer,
    kind: 'runs_on',
  });
  // The VPN concentrator shares the print server because it was the only box
  // with a free slot the week it arrived. This is load-bearing beige.
  addEdge(ops, {
    from: COMPANY_IDS.vpn,
    to: COMPANY_IDS.printServer,
    kind: 'runs_on',
  });

  for (const membership of GROUP_MEMBERSHIPS) {
    addEdge(ops, {
      from: membership.account,
      to: membership.group,
      kind: 'member_of',
    });
  }

  for (const grant of SHARE_ACCESS) {
    addEdge(ops, {
      from: grant.account,
      to: grant.share,
      kind: 'has_access',
    });
  }

  // And the twenty-odd services every one of those boxes has been running
  // since it was built, from the table for its role.
  //
  // Last, so that everything a ticket names is already in the world by the
  // time the noise arrives - and because this is what it is: the noise. The
  // skill this game is about is reading twenty lines and finding the one that
  // is wrong, and a list with only the wrong line in it has done that for you.
  for (const machine of MACHINES) {
    const named = NAMED_SERVICE_TWINS[machine.id] ?? [];

    for (const service of BASELINE_SERVICES[machine.role]) {
      // A named service above IS this box's copy of that service, so the
      // baseline does not seed a second one beside it.
      if (named.includes(service.service)) {
        continue;
      }

      const id = baselineServiceId(machine.id, service.service);

      addNode(ops, {
        id,
        kind: 'service',
        fields: {
          [FIELDS.name]: service.name,
          [FIELDS.serviceName]: service.service,
          [FIELDS.status]: service.status,
          [FIELDS.startupType]: service.startup,
          ...(service.serviceClass === undefined
            ? {}
            : { [FIELDS.serviceClass]: service.serviceClass }),
        },
      });
      addEdge(ops, { from: id, to: machine.id, kind: 'runs_on' });
    }
  }

  return ops;
}
