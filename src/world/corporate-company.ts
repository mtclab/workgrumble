/**
 * The FOURTH employer, and the one the org-dysfunction epic is built for: an
 * IN-HOUSE corporate IT desk at a mid-size company, where you support the
 * EXECUTIVES directly (E8, 0.22.0).
 *
 * Where Workgrumble Ltd is one enterprise with an opinion about everything,
 * Bodgeworth is a wild-west haulage firm, and Fettle & Crane is an MSP serving
 * many customers a layer removed, Halcyon Grange Holdings is the building where
 * the machine is fine and the ORGANISATION is the vulnerability. It has a domain
 * controller, a file server, an MFA rollout everybody is on, and a mail filter -
 * the locked-down enterprise, the same as the probation shop - and its
 * distinguishing character is none of that. It is the POLITICS: a CEO who does
 * not do passwords, a CFO who signs the wires, an executive assistant who runs
 * the CEO's diary and his inbox, and a desk that reports, in practice, to
 * whoever is most annoyed. The exec weak spot lives here because here you are
 * one desk away from the exec, and "no" is a political act.
 *
 * Everything below is DATA the engine applies, the same as the three estates it
 * sits beside, and it shares not one node id with them: the four worlds are four
 * buildings, and only one is ever stood up at a time. Nothing here consumes the
 * simulation RNG or reads the clock.
 *
 * The one thing this estate seeds that the others do not is the EXEC EXCEPTION
 * model (`fields.ts`): the accounts carry a second factor everybody is enrolled
 * on and a mailbox that is on the filter, so the exceptions the VIP tickets
 * grant - MFA off, an EA delegate, off the filter - are real states removed from
 * a real default, which is the setup a later pass's BEC incident reads back.
 */

import type { Edge, GraphNode, SetupOp } from '../engine-api';
import type { ChannelDef } from './channels';
import { NO_RUN } from './consumables';
import { VERIFICATION_METHODS, verificationChannels } from './fallout';
import { driveSetup } from './filesystem';
import {
  DEVICE_TYPES,
  FIELDS,
  MACHINE_OS,
  type MachineOs,
  type MachineRole,
  MACHINE_ROLES,
  SERVICE_STATUS,
  STARTUP_TYPES,
} from './fields';
import { STARTING_REPUTATION } from './meters';
import { BASELINE_SERVICES, baselineServiceId } from './services';

/**
 * What Halcyon has on file to prove who somebody is: a callback to the number
 * the directory holds. It has the same June-rollout enrolment the probation
 * shop does - this is a run enterprise, not a wild-west one - so a caller who
 * has lost their phone is verified through a channel the account already has.
 */
const VERIFICATION_CHANNELS_ON_FILE = verificationChannels([
  VERIFICATION_METHODS.callback,
]);

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

/**
 * What Halcyon thinks about you installing software: it has an audit, the same
 * as the probation shop. `locked_down` is reused because a corporate IT desk is
 * exactly as watched - the exec politics are what is new, not a wild-west desk.
 */
export const HALCYON_COMPANY = {
  name: 'Halcyon Grange Holdings',
  domain: 'HALCYON',
  motto: 'Excellence, Delivered. (the sign in reception says so)',
  installPolicy: 'locked_down',
} as const;

export const HALCYON_IDS = {
  /** The player, same person as ever, now on an in-house corporate desk. */
  player: 'person:pat',
  playerAccount: 'account:pat-halcyon',
  playerMachine: 'machine:halcyon-desk',
  playerMonitor: 'device:halcyon-monitor',

  /**
   * Roland Cushing-Vane. Chief Executive, signs nothing he can get somebody to
   * sign for him, and does not do passwords - the exec whose exceptions the
   * week's VIP tickets are about, and the account a later BEC incident lands on.
   */
  ceo: 'person:halcyon-roland',
  ceoAccount: 'account:halcyon-roland',
  ceoLaptop: 'machine:halcyon-ceo-laptop',

  /**
   * Miriam Thale. Chief Financial Officer, the one the fraudulent wire request
   * would be sent TO - here as the estate the exec layer needs to be legible,
   * and the person a later incident's scope walk reaches.
   */
  cfo: 'person:halcyon-miriam',
  cfoAccount: 'account:halcyon-miriam',
  cfoPc: 'machine:halcyon-cfo-pc',

  /**
   * Denise Porlock. Executive Assistant to the CEO - runs his diary and, if the
   * desk grants it, his mailbox. She files the exception requests on his behalf
   * (she is the reporter of the VIP tickets), and the FullAccess delegate she is
   * given is the persistence vector a later hunt finds.
   */
  ea: 'person:halcyon-denise',
  eaAccount: 'account:halcyon-denise',
  eaPc: 'machine:halcyon-ea-pc',

  /** Neil Faber, Sales. An ordinary account, so the estate is not all execs. */
  neil: 'person:halcyon-neil',
  neilAccount: 'account:halcyon-neil',
  neilPc: 'machine:halcyon-neil-pc',

  /** Bronwen Kettle, Office Manager. Runs the floor and the front desk. */
  bronwen: 'person:halcyon-bronwen',
  bronwenAccount: 'account:halcyon-bronwen',
  bronwenPc: 'machine:halcyon-bronwen-pc',

  /** The domain controller the enterprise runs on. Nobody's personal box. */
  dc: 'machine:halcyon-dc-01',
  /** The file server the whole office maps its drives through. */
  fileServer: 'machine:halcyon-srv-01',

  /* -- the access recertification (E8, 0.23.0) --------------------------- */
  /**
   * Gordon Frey, who left Finance in the spring. The account is a person the
   * offboarding forgot: still enabled, still in a privileged group, months after
   * his last logon - the orphaned account the research puts at an average of 116
   * days to deprovision. The recert's revoke is to disable it.
   */
  gordon: 'person:halcyon-gordon',
  gordonAccount: 'account:halcyon-gordon',
  /**
   * Marguerite Sole, who has been at Halcyon for years and in three departments,
   * and whose access is the sum of all of them. She is Finance now and needs the
   * Finance group; she is NOT Sales, Operations or a legacy-system admin any more,
   * and the memberships she kept from each are privilege creep - three groups to
   * strip, one to keep.
   */
  marguerite: 'person:halcyon-marguerite',
  margueriteAccount: 'account:halcyon-marguerite',
  /**
   * Cass Holloway, Accounts Payable, who can both create a vendor and approve its
   * payments - the segregation-of-duties conflict, one person able to pay
   * themselves. The recert splits it: keep one entitlement, revoke the other.
   */
  cass: 'person:halcyon-cass',
  cassAccount: 'account:halcyon-cass',
  /**
   * The nightly-backup service account. It is in Domain Admins for no reason
   * anybody can name (the textbook least-privilege violation) - AND its scheduled
   * job genuinely runs as it, through the Backup Operators group. So it is
   * over-privileged BUT load-bearing: the recert RIGHT-SIZES it (out of Domain
   * Admins, kept in Backup Operators), and killing it outright breaks the job.
   */
  svcBackupAccount: 'account:halcyon-svc-backup',
  /** The scheduled job that runs AS the backup account, via Backup Operators. */
  nightlyBackup: 'service:halcyon-nightly-backup',

  /** Domain Admins - the crown jewels, and where the service account should not be. */
  domainAdmins: 'group:halcyon-domain-admins',
  /** Backup Operators - the specific access the nightly job actually needs. */
  backupOperators: 'group:halcyon-backup-operators',
  /** Finance Admins - the privileged group the leaver was never taken out of. */
  financeAdmins: 'group:halcyon-finance-admins',
  /** Finance - Marguerite's current, legitimate group. Kept, not revoked. */
  finance: 'group:halcyon-finance',
  /** Sales - CRM Access. Neil's by right; Marguerite's only by history. */
  salesCrm: 'group:halcyon-sales-crm',
  /** Operations shared drive - Marguerite's old department, kept by accident. */
  opsShare: 'group:halcyon-ops-share',
  /** Legacy System Admins - an old admin group Marguerite no longer needs. */
  legacyAdmin: 'group:halcyon-legacy-admin',
  /** AP - Vendor Maintenance: create a vendor. One half of the SoD conflict. */
  vendorCreate: 'group:halcyon-vendor-create',
  /** AP - Payment Approval: approve a payment. The other half of the conflict. */
  paymentApprove: 'group:halcyon-payment-approve',

  /* -- the manager override / CYA (E8, 0.24.0) --------------------------- */
  /**
   * Ivor Brace, Head of IT - the player's own manager, and the one who ORDERS
   * the thing a good tech knows is wrong: give the migration contractor Domain
   * Admin tonight, we will narrow it later. He is the ordering manager, so he is
   * also the ACCEPTING OWNER whose signature the risk acceptance needs - the CYA
   * is getting his name onto the risk in writing before the grant is made.
   */
  manager: 'person:halcyon-ivor',
  managerAccount: 'account:halcyon-ivor',
  /**
   * Wystan Pryce, the Meridian Migrations contractor doing the finance-system
   * cutover. An external account with a real login, and the one the order wants
   * made a domain admin - the standing privileged access far beyond the task
   * that is the whole of why a good tech gets the risk accepted in writing first.
   */
  contractor: 'person:halcyon-wystan',
  contractorAccount: 'account:halcyon-wystan',
} as const;

export type HalcyonNodeId = (typeof HALCYON_IDS)[keyof typeof HALCYON_IDS];

interface StaffSeed {
  readonly person: string;
  readonly account: string;
  readonly name: string;
  readonly title: string;
  readonly username: string;
  readonly desk: string;
}

const STAFF: readonly StaffSeed[] = [
  {
    person: HALCYON_IDS.player,
    account: HALCYON_IDS.playerAccount,
    name: 'Pat Pending',
    title: 'IT Support Analyst',
    username: 'pat',
    desk: 'A desk on the ground floor, one lift ride below the people it '
      + 'answers to',
  },
  {
    person: HALCYON_IDS.ceo,
    account: HALCYON_IDS.ceoAccount,
    name: 'Roland Cushing-Vane',
    title: 'Chief Executive Officer',
    username: 'rcushingvane',
    desk: 'The corner office on the top floor, and a laptop he takes everywhere '
      + 'and reads nothing on',
  },
  {
    person: HALCYON_IDS.cfo,
    account: HALCYON_IDS.cfoAccount,
    name: 'Miriam Thale',
    title: 'Chief Financial Officer',
    username: 'mthale',
    desk: 'The other top-floor office, where the wires are signed off',
  },
  {
    person: HALCYON_IDS.ea,
    account: HALCYON_IDS.eaAccount,
    name: 'Denise Porlock',
    title: 'Executive Assistant to the CEO',
    username: 'dporlock',
    desk: 'The desk outside the corner office, where the CEO\'s diary and his '
      + 'inbox both actually live',
  },
  {
    person: HALCYON_IDS.neil,
    account: HALCYON_IDS.neilAccount,
    name: 'Neil Faber',
    title: 'Account Executive, Sales',
    username: 'nfaber',
    desk: 'Somewhere on the sales floor, usually on a headset',
  },
  {
    person: HALCYON_IDS.bronwen,
    account: HALCYON_IDS.bronwenAccount,
    name: 'Bronwen Kettle',
    title: 'Office Manager',
    username: 'bkettle',
    desk: 'The front desk, and everywhere the front desk can see',
  },
  {
    person: HALCYON_IDS.marguerite,
    account: HALCYON_IDS.margueriteAccount,
    name: 'Marguerite Sole',
    title: 'Finance Business Partner (formerly Sales, formerly Operations)',
    username: 'msole',
    desk: 'A desk she has moved three times without ever losing a login',
  },
  {
    person: HALCYON_IDS.cass,
    account: HALCYON_IDS.cassAccount,
    name: 'Cass Holloway',
    title: 'Accounts Payable Clerk',
    username: 'cholloway',
    desk: 'The accounts payable desk, where the vendors and the payments both live',
  },
  {
    person: HALCYON_IDS.gordon,
    account: HALCYON_IDS.gordonAccount,
    name: 'Gordon Frey',
    title: 'Financial Analyst (left in the spring)',
    username: 'gfrey',
    desk: 'A desk somebody else has now, and a login nobody switched off',
  },
  {
    person: HALCYON_IDS.manager,
    account: HALCYON_IDS.managerAccount,
    name: 'Ivor Brace',
    title: 'Head of IT',
    username: 'ibrace',
    desk: 'The office at the end of the IT corridor, and the deadline nobody '
      + 'else has to explain to the board',
  },
  {
    person: HALCYON_IDS.contractor,
    account: HALCYON_IDS.contractorAccount,
    name: 'Wystan Pryce',
    title: 'Migration Engineer, Meridian Migrations (contractor)',
    username: 'wpryce-ext',
    desk: 'A hot desk near Finance for the length of the cutover, and a laptop '
      + 'that is not the company\'s',
  },
];

interface MachineSeed {
  readonly id: string;
  readonly hostname: string;
  readonly role: MachineRole;
  /** Omitted means Windows, the back-compat default. */
  readonly os?: MachineOs;
  readonly owner?: string;
  readonly wiredTo?: string;
  readonly resolution?: string;
  readonly pendingUpdates?: boolean;
  readonly processor: string;
  readonly memory: string;
  readonly diskFree: number;
}

const MACHINES: readonly MachineSeed[] = [
  {
    id: HALCYON_IDS.playerMachine,
    hostname: 'HALCYON-IT-07',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.player,
    wiredTo: HALCYON_IDS.dc,
    resolution: '1920x1080',
    processor: 'A managed desktop, imaged to the corporate standard',
    memory: '16 GB',
    diskFree: 214_748_364_800,
  },
  {
    id: HALCYON_IDS.ceoLaptop,
    hostname: 'HALCYON-CEO-LT',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.ceo,
    wiredTo: HALCYON_IDS.dc,
    processor: 'The most expensive laptop in the building, used as a tray',
    memory: '32 GB',
    diskFree: 402_653_184_000,
  },
  {
    id: HALCYON_IDS.cfoPc,
    hostname: 'HALCYON-CFO-PC',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.cfo,
    wiredTo: HALCYON_IDS.dc,
    processor: 'A locked-down finance desktop, two monitors and a shredder',
    memory: '16 GB',
    diskFree: 171_798_691_840,
  },
  {
    id: HALCYON_IDS.eaPc,
    hostname: 'HALCYON-EA-PC',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.ea,
    wiredTo: HALCYON_IDS.dc,
    processor: 'A desktop with the CEO\'s calendar open on it all day',
    memory: '16 GB',
    diskFree: 128_849_018_880,
  },
  {
    id: HALCYON_IDS.neilPc,
    hostname: 'HALCYON-SLS-14',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.neil,
    wiredTo: HALCYON_IDS.dc,
    processor: 'A sales-floor desktop that has run the CRM since 2019',
    memory: '8 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: HALCYON_IDS.bronwenPc,
    hostname: 'HALCYON-RECEP',
    role: MACHINE_ROLES.workstation,
    owner: HALCYON_IDS.bronwen,
    wiredTo: HALCYON_IDS.dc,
    resolution: '1366x768',
    processor: 'The front-desk desktop, and the visitor book that replaced a book',
    memory: '8 GB',
    diskFree: 128_849_018_880,
  },
  {
    id: HALCYON_IDS.dc,
    hostname: 'HALCYON-DC-01',
    role: MACHINE_ROLES.domainController,
    processor: 'The domain controller the whole enterprise authenticates against',
    memory: '32 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: HALCYON_IDS.fileServer,
    hostname: 'HALCYON-SRV-01',
    role: MACHINE_ROLES.fileServer,
    wiredTo: HALCYON_IDS.dc,
    processor: 'The file server the office maps every shared drive through',
    memory: '32 GB',
    diskFree: 42_949_672_960,
  },
];

/**
 * Somebody's name off the same table the seed builds them from, for the one
 * kind of caller that cannot read the graph: static content naming a person in
 * a paragraph it wrote before there was a world.
 */
export function halcyonStaffName(personId: string): string {
  const member = STAFF.find((candidate) => candidate.person === personId);

  if (member === undefined) {
    throw new Error(`Nobody at Halcyon is called "${personId}".`);
  }

  return member.name;
}

export function halcyonMachineHostname(machineId: string): string {
  const machine = MACHINES.find((candidate) => candidate.id === machineId);

  if (machine === undefined) {
    throw new Error(`No machine at Halcyon is called "${machineId}".`);
  }

  return machine.hostname;
}

/**
 * The rooms Halcyon's channel client runs. Two governed corporate rooms - an
 * `#it-support` where the desk lives and an `#exec-office` where the exec floor
 * asks the desk for things by name - which is the channel-mix half of the
 * archetype contrast: the politics has a room, and it is the room the exceptions
 * are demanded in.
 */
export const HALCYON_CHANNELS: readonly ChannelDef[] = Object.freeze([
  Object.freeze({
    id: 'room:it-support',
    name: '#it-support',
    topic: 'raise a ticket. yes, even you. one issue per ticket, please.',
  }),
  Object.freeze({
    id: 'room:exec-office',
    name: '#exec-office',
    topic: 'the executive floor. if it is urgent and from up here it is very '
      + 'urgent (Denise)',
  }),
]);

export function halcyonChannels(): readonly ChannelDef[] {
  return HALCYON_CHANNELS;
}

/** The Halcyon estate as construction ops. */
export function halcyonSetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];

  for (const member of STAFF) {
    addNode(ops, {
      id: member.person,
      kind: 'person',
      fields: {
        [FIELDS.name]: member.name,
        [FIELDS.title]: member.title,
        [FIELDS.desk]: member.desk,
        ...(member.person === HALCYON_IDS.player
          ? {
            // The player's opening position, seeded exactly as the other three
            // employers seed it: a switch OVERWRITES reputation and title from
            // the carried career (session.ts); everything else here is the
            // fresh Monday it is.
            [FIELDS.dayState]: 'morning_brief',
            [FIELDS.farmFund]: 0,
            [FIELDS.stress]: 0,
            [FIELDS.suspicion]: 0,
            [FIELDS.reputation]: STARTING_REPUTATION,
            [FIELDS.weekReputation]: STARTING_REPUTATION,
            [FIELDS.suspicionEvents]: 0,
            [FIELDS.breachesCharged]: 0,
            [FIELDS.resolveCreditPaid]: 0,
            [FIELDS.caughtEvents]: 0,
            [FIELDS.deskCans]: 0,
            [FIELDS.drinkStartedAt]: NO_RUN,
            [FIELDS.drinkTolerance]: 0,
            [FIELDS.drinkCrashCharged]: NO_RUN,
            [FIELDS.consumableSpend]: 0,
            [FIELDS.weekAttempt]: 1,
            [FIELDS.weekOpeningFund]: 0,
            [FIELDS.reviewOutcome]: 'pending',
            [FIELDS.weekEnded]: false,
            [FIELDS.beerUnlocked]: false,
            [FIELDS.beerOpened]: false,
          }
          : {}),
      },
    });
    addNode(ops, accountNode(member.account, member.username));
    addEdge(ops, {
      from: member.person,
      to: member.account,
      kind: 'owns',
    });
  }

  for (const machine of MACHINES) {
    addNode(ops, {
      id: machine.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: machine.hostname,
        [FIELDS.machineRole]: machine.role,
        [FIELDS.machineOs]: machine.os ?? MACHINE_OS.windows,
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: machine.resolution ?? '1024x768',
        [FIELDS.pendingUpdates]: machine.pendingUpdates === true,
        [FIELDS.processor]: machine.processor,
        [FIELDS.memory]: machine.memory,
        [FIELDS.diskFree]: machine.diskFree,
      },
    });
  }

  for (const machine of MACHINES) {
    const owner = STAFF.find((member) => member.person === machine.owner);

    ops.push(...driveSetup({
      machineId: machine.id,
      hostname: machine.hostname,
      role: machine.role,
      ...(owner === undefined ? {} : { ownerUsername: owner.username }),
      supportDesk: machine.id === HALCYON_IDS.playerMachine,
    }));
  }

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
    id: HALCYON_IDS.playerMonitor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'A second monitor, corporate-issue',
      [FIELDS.type]: DEVICE_TYPES.monitor,
      [FIELDS.powered]: true,
    },
  });
  addEdge(ops, {
    from: HALCYON_IDS.playerMonitor,
    to: HALCYON_IDS.playerMachine,
    kind: 'connected_to',
  });

  // The baseline services every Windows box has run since it was built, from
  // the table for its role - the noise the one wrong line hides in, and the
  // real services on the DC and file server the enterprise runs on.
  for (const machine of MACHINES) {
    for (const service of BASELINE_SERVICES[machine.role] ?? []) {
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

  seedRecertEstate(ops);

  return ops;
}

/**
 * The access-recertification estate (E8, 0.23.0) - the standing world the Q3
 * review is about.
 *
 * What lives here is the ESTATE: the privileged groups, the two accounts the
 * review adds (the leaver and the service account), and the BENIGN, legitimate
 * memberships the player must have the judgement to KEEP - Neil is genuinely in
 * Sales CRM, Marguerite genuinely in Finance, the service account genuinely in
 * Backup Operators, Cass genuinely able to create vendors. The FINDINGS - the
 * crept and orphaned and over-privileged memberships - arrive with the recert
 * ticket's own `setup`, exactly as every other fault in this game does, so the
 * estate is byte-clean until the review is dealt and a player cannot tidy a
 * finding away before the ticket that is about it exists.
 *
 * The nightly-backup job is the "something depends on it" made real: it runs AS
 * the service account, through Backup Operators, so revoking that specific group
 * (or disabling the account) breaks a real scheduled job - which is the whole of
 * why the service account is right-sized, not killed.
 */
function seedRecertEstate(ops: SetupOp[]): void {
  const GROUPS: readonly Readonly<{ id: string; name: string }>[] = [
    { id: HALCYON_IDS.domainAdmins, name: 'Domain Admins' },
    { id: HALCYON_IDS.backupOperators, name: 'Backup Operators' },
    { id: HALCYON_IDS.financeAdmins, name: 'Finance Admins' },
    { id: HALCYON_IDS.finance, name: 'Finance' },
    { id: HALCYON_IDS.salesCrm, name: 'Sales - CRM Access' },
    { id: HALCYON_IDS.opsShare, name: 'Operations - Shared Drive' },
    { id: HALCYON_IDS.legacyAdmin, name: 'Legacy System Admins' },
    { id: HALCYON_IDS.vendorCreate, name: 'AP - Vendor Maintenance' },
    { id: HALCYON_IDS.paymentApprove, name: 'AP - Payment Approval' },
  ];

  for (const group of GROUPS) {
    addNode(ops, {
      id: group.id,
      kind: 'group',
      fields: { [FIELDS.name]: group.name },
    });
  }

  // The service account, which is nobody's person: a login the scheduled job
  // authenticates as. Ordinary account fields, so the directory can show it
  // beside the humans; what makes it a finding is where it sits, which the
  // ticket seeds.
  addNode(ops, accountNode(HALCYON_IDS.svcBackupAccount, 'svc-halcyonbackup'));

  // The scheduled job the service account runs, on the file server - the real
  // thing that depends on the account's Backup Operators membership.
  addNode(ops, {
    id: HALCYON_IDS.nightlyBackup,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Nightly Backup (Scheduled Task)',
      [FIELDS.serviceName]: 'HalcyonBackupTask',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addEdge(ops, {
    from: HALCYON_IDS.nightlyBackup,
    to: HALCYON_IDS.fileServer,
    kind: 'runs_on',
  });

  // The BENIGN memberships - the ones a correct recert KEEPS. Each is a real,
  // legitimate access, and the judgement the mechanic tests is telling them from
  // the findings that arrive with the ticket: Neil is Sales (Sales CRM), so his
  // membership of the group Marguerite must be TAKEN OUT of is correct; keeping
  // his while stripping hers is the whole lesson that a recert is per-person, not
  // per-group.
  const BENIGN: readonly Readonly<{ account: string; group: string }>[] = [
    { account: HALCYON_IDS.neilAccount, group: HALCYON_IDS.salesCrm },
    { account: HALCYON_IDS.margueriteAccount, group: HALCYON_IDS.finance },
    { account: HALCYON_IDS.svcBackupAccount, group: HALCYON_IDS.backupOperators },
    { account: HALCYON_IDS.cassAccount, group: HALCYON_IDS.vendorCreate },
  ];

  for (const membership of BENIGN) {
    addEdge(ops, {
      from: membership.account,
      to: membership.group,
      kind: 'member_of',
    });
  }
}

/**
 * One account node, corporate flavour: a second factor everybody is enrolled on
 * (the June rollout), a mailbox that is ON the filter, and nothing locked or
 * expired in the seed. Every fault - and every exception - arrives with the
 * ticket about it, exactly as the other three employers' do.
 *
 * The exec-exception fields are seeded at their BENIGN default: `filterExempt`
 * is `false` (on the filter, the ordinary case), and `mailboxDelegate` and
 * `mailboxRules` are left ABSENT (nobody else on the mailbox, no inbox rules) -
 * which is the byte-clean way to seed "nothing granted yet" and, for the
 * delegate, the state the grant verb requires (it refuses a mailbox that
 * already has one). The VIP tickets remove `mfaEnrolled`, name a delegate, and
 * flip `filterExempt`, so each exception is a real state moved off a real
 * default, which is the setup a later pass's incident reads back.
 */
function accountNode(id: string, username: string): GraphNode {
  return {
    id,
    kind: 'account',
    fields: {
      [FIELDS.username]: username,
      [FIELDS.locked]: false,
      [FIELDS.enabled]: true,
      [FIELDS.passwordExpired]: false,
      [FIELDS.badPwCount]: 0,
      [FIELDS.pwMustChange]: false,
      // The enterprise is enrolled: everybody has a second factor, which is what
      // makes the CEO's exception a hole removed from a wall rather than the
      // wild-west shrug Bodgeworth's absent factor is.
      [FIELDS.mfaEnrolled]: true,
      // On the filter, the ordinary case. The exec exception flips this.
      [FIELDS.filterExempt]: false,
      [FIELDS.verificationChannels]: VERIFICATION_CHANNELS_ON_FILE,
    },
  };
}
