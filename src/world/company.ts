import type { Edge, GraphNode, SetupOp } from '../engine-api';
import { NO_RUN } from './consumables';
import { DEVICE_TYPES, FIELDS, SERVICE_STATUS } from './fields';
import { STARTING_REPUTATION } from './meters';

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

  addNode(ops, {
    id: COMPANY_IDS.playerMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'BEIGE-BOX',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '1024x768',
      [FIELDS.pendingUpdates]: false,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.adaMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'SALES-02',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '1024x768',
      [FIELDS.pendingUpdates]: true,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.garyMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'PAYROLL-04',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '800x600',
      [FIELDS.pendingUpdates]: true,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.printServer,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'PRINT-01',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '640x480',
      [FIELDS.pendingUpdates]: true,
    },
  });

  // The rest of the floor, and the two boxes nobody visits. Written as a table
  // because a desk machine is a hostname, a screen size and nothing else -
  // everything interesting about any of them arrives with a ticket.
  const DESKS: readonly {
    id: string;
    hostname: string;
    owner?: string;
    /** The print box this desk sends to. The warehouse has its own. */
    prints?: string;
  }[] = [
    {
      id: COMPANY_IDS.priyaMachine,
      hostname: 'ACCTS-01',
      owner: COMPANY_IDS.priya,
      prints: COMPANY_IDS.printServer,
    },
    {
      id: COMPANY_IDS.kwameMachine,
      hostname: 'SALES-05',
      owner: COMPANY_IDS.kwame,
      prints: COMPANY_IDS.printServer,
    },
    {
      id: COMPANY_IDS.robMachine,
      hostname: 'FIN-02',
      owner: COMPANY_IDS.rob,
      prints: COMPANY_IDS.printServer,
    },
    {
      id: COMPANY_IDS.warehouseMachine,
      hostname: 'WHOUSE-01',
      owner: COMPANY_IDS.hilda,
      prints: COMPANY_IDS.warehousePrintServer,
    },
    {
      id: COMPANY_IDS.terryMachine,
      hostname: 'EST-03',
      owner: COMPANY_IDS.terry,
      prints: COMPANY_IDS.printServer,
    },
    {
      id: COMPANY_IDS.dennisMachine,
      hostname: 'MKTG-02',
      owner: COMPANY_IDS.dennis,
      prints: COMPANY_IDS.printServer,
    },
    {
      id: COMPANY_IDS.marcusMachine,
      hostname: 'ACCTS-03',
      owner: COMPANY_IDS.marcus,
      prints: COMPANY_IDS.printServer,
    },
    // The file server, and the warehouse print box on the corridor socket.
    // Neither is owned by anybody, which is the reason both of them are in
    // this game at all.
    { id: COMPANY_IDS.fileServer, hostname: 'FILES-01' },
    { id: COMPANY_IDS.warehousePrintServer, hostname: 'PRINT-02' },
  ];

  // Nodes first, edges after: a desk that prints to the warehouse box is
  // wired to a machine further down this same list, and an edge whose other
  // end has not been built yet is refused by the engine rather than quietly
  // dropped.
  for (const desk of DESKS) {
    addNode(ops, {
      id: desk.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: desk.hostname,
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: '1024x768',
        [FIELDS.pendingUpdates]: false,
      },
    });
  }

  for (const desk of DESKS) {
    if (desk.owner !== undefined) {
      addEdge(ops, { from: desk.owner, to: desk.id, kind: 'owns' });
    }

    if (desk.prints !== undefined) {
      addEdge(ops, {
        from: desk.id,
        to: desk.prints,
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

  // The fan reports a status like everything else on this box, and that is
  // the whole trap: it is a lump of spinning plastic, not a service. Saying
  // so here is what keeps "restart it" honest everywhere downstream.
  addNode(ops, {
    id: COMPANY_IDS.fan,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Chassis fan',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: false,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.spooler,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Print Spooler',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });
  addNode(ops, {
    id: COMPANY_IDS.vpn,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'VPN Concentrator',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });

  // The backup agent on Marcus's box. It reports a status, it is restartable,
  // and it has never once been stopped by anything but a person.
  addNode(ops, {
    id: COMPANY_IDS.backupAgent,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Backup Agent',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });

  addNode(ops, {
    id: COMPANY_IDS.fileShare,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'File Sharing',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });

  // The job that builds HR's headcount report. It has been stopped since the
  // spring, and everybody has been doing it by hand and complaining quietly.
  addNode(ops, {
    id: COMPANY_IDS.reportJob,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Scheduled Reports',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });

  // Not a service anybody can restart: it is a licence server, and the only
  // number on it that matters is how many seats are not being used. Three of
  // the six are, one of them by a man who left in April.
  addNode(ops, {
    id: COMPANY_IDS.suiteLicences,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Accounts Suite licence pool',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: false,
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
    from: COMPANY_IDS.player,
    to: COMPANY_IDS.playerMachine,
    kind: 'owns',
  });
  addEdge(ops, {
    from: COMPANY_IDS.ada,
    to: COMPANY_IDS.adaMachine,
    kind: 'owns',
  });
  addEdge(ops, {
    from: COMPANY_IDS.gary,
    to: COMPANY_IDS.garyMachine,
    kind: 'owns',
  });
  // The lead signed for the print server years ago and has never once looked
  // at it. Ownership on paper, ownership in practice: not the same graph.
  addEdge(ops, {
    from: COMPANY_IDS.boss,
    to: COMPANY_IDS.printServer,
    kind: 'owns',
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
  addEdge(ops, {
    from: COMPANY_IDS.playerMachine,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: COMPANY_IDS.adaMachine,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: COMPANY_IDS.garyMachine,
    to: COMPANY_IDS.printServer,
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

  return ops;
}
