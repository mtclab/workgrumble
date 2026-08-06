/**
 * The THIRD employer, and the one the whole customer arc is built for: an MSP -
 * a Managed Service Provider serving many customer companies (0.8.0, E5 #26).
 *
 * Where Workgrumble Ltd is one in-house estate and Bodgeworth is one break-fix
 * shop, Fettle & Crane Managed IT looks after MANY customers at once, and the
 * player is a Tier-1 tech on its service desk. The one big new world concept is
 * the CUSTOMER: a first-class node carrying the contract that decides what the
 * player may DO (service_scope), the business that shapes its estate
 * (business_type), and an SLA tier. Every machine below carries its customer's
 * id; the desk the player sits at carries none, because it is the MSP's own.
 *
 * Three customers span the poles the scope + OS + tenant mechanics need to be
 * legible on day one:
 *
 *  - FONTAINE-LAW: a Windows-only law firm on a HELPDESK contract - workstations
 *    and users are yours, the AD domain controller and file server are not.
 *  - MERIDIAN-SAAS: a SaaS company, HELPDESK too, whose Linux product fleet is
 *    out of reach on BOTH counts - not your OS family AND not your contract.
 *  - NORTHWIND-CLINIC: a MONITORING-ONLY account - you get the alert, you may
 *    acknowledge and escalate, and the world refuses a fix, truthfully.
 *
 * Everything here is DATA the engine applies, sharing not one node id with the
 * other two employers' worlds. Nothing here consumes the simulation RNG or
 * reads the clock. Pass A ships the model, the estates and skeleton tickets that
 * prove the mechanics; the rich per-vertical ticket content is a later pass.
 */

import type { Edge, GraphNode, SetupOp } from '../engine-api';
import type { ChannelDef } from './channels';
import { NO_RUN } from './consumables';
import { VERIFICATION_METHODS, verificationChannels } from './fallout';
import { driveSetup } from './filesystem';
import {
  type BusinessType,
  BUSINESS_TYPES,
  DEVICE_TYPES,
  FIELDS,
  MACHINE_OS,
  type MachineOs,
  type MachineRole,
  MACHINE_ROLES,
  SERVICE_SCOPES,
  type ServiceScope,
  SERVICE_STATUS,
  SLA_TIERS,
  type SlaTier,
  STARTUP_TYPES,
} from './fields';
import { STARTING_REPUTATION } from './meters';
import {
  BASELINE_SERVICES,
  baselineServiceId,
  BASELINE_UNITS,
  linuxUnitId,
} from './services';

/**
 * What Fettle & Crane thinks about you installing software: it has an audit, the
 * same as a real MSP - your desk is a managed device and off-catalogue software
 * on it is a finding. `locked_down` is the probation shop's own policy, reused
 * because an MSP tech's own workstation is exactly as watched - the customer
 * estates are what is new, not a wild-west desk.
 */
export const MSP_COMPANY = {
  name: 'Fettle & Crane Managed IT',
  domain: 'FETTLE',
  motto: 'Your IT department, for the price of not having one.',
  installPolicy: 'locked_down',
} as const;

/** One customer of the MSP, as the fields its node carries. */
interface CustomerSeed {
  readonly id: string;
  /** The handle the queue prints and a refusal names, e.g. FONTAINE-LAW. */
  readonly name: string;
  readonly businessType: BusinessType;
  readonly scope: ServiceScope;
  readonly sla: SlaTier;
}

export const MSP_CUSTOMERS = {
  fontaine: 'customer:fontaine',
  meridian: 'customer:meridian',
  northwind: 'customer:northwind',
  // 0.11.0, the two tiers the 0.8.0 engine handled but no customer exercised:
  holloway: 'customer:holloway',
  arden: 'customer:arden',
} as const;

const CUSTOMERS: readonly CustomerSeed[] = [
  {
    id: MSP_CUSTOMERS.fontaine,
    name: 'FONTAINE-LAW',
    businessType: BUSINESS_TYPES.lawFirm,
    scope: SERVICE_SCOPES.helpdesk,
    sla: SLA_TIERS.silver,
  },
  {
    id: MSP_CUSTOMERS.meridian,
    name: 'MERIDIAN-SAAS',
    businessType: BUSINESS_TYPES.saas,
    scope: SERVICE_SCOPES.helpdesk,
    sla: SLA_TIERS.gold,
  },
  {
    id: MSP_CUSTOMERS.northwind,
    name: 'NORTHWIND-CLINIC',
    businessType: BUSINESS_TYPES.monitoringTarget,
    scope: SERVICE_SCOPES.monitoringOnly,
    sla: SLA_TIERS.bronze,
  },
  // 0.11.0: the fully-managed and co-managed tiers, made real.
  {
    // HOLLOWAY-ACCT: a small accountancy practice where Fettle & Crane IS the
    // whole IT department - a fully-managed contract, so nothing on their estate
    // is out of reach, including the server work a helpdesk contract walls off.
    id: MSP_CUSTOMERS.holloway,
    name: 'HOLLOWAY-ACCT',
    businessType: BUSINESS_TYPES.accountancy,
    scope: SERVICE_SCOPES.fullyManaged,
    sla: SLA_TIERS.gold,
  },
  {
    // ARDEN-MFG: a mid-size manufacturer with its OWN internal IT the MSP works
    // alongside - a co-managed contract, so acting on their estate is coordinate-
    // then-act: notify their team first, or route risky work through a change
    // request with their IT as the sign-off.
    id: MSP_CUSTOMERS.arden,
    name: 'ARDEN-MFG',
    businessType: BUSINESS_TYPES.manufacturing,
    scope: SERVICE_SCOPES.coManaged,
    sla: SLA_TIERS.silver,
  },
] as const;

export const MSP_IDS = {
  /** The player, same person as ever, now on an MSP service desk. */
  player: 'person:pat',
  playerAccount: 'account:pat-msp',
  playerMachine: 'machine:msp-desk',
  playerMonitor: 'device:msp-monitor',

  /**
   * Nadia Fontaine's practice manager contact at the law firm - the person who
   * files FONTAINE-LAW's tickets. A workstation user, so her lockout is a
   * helpdesk job and IN scope.
   */
  fontaineContact: 'person:fontaine-nadia',
  fontaineContactAccount: 'account:fontaine-nadia',
  fontaineWorkstation: 'machine:font-ws-01',
  fontaineDc: 'machine:font-dc-01',
  fontaineFileServer: 'machine:font-file-01',

  /**
   * The rest of the law firm the desk actually meets (0.8.0, Pass B). Nadia is
   * the contact who FILES every Fontaine ticket; these are the people the
   * tickets are ABOUT. A partner who closed iManage badly and left a deposition
   * checked out, a new associate who needs a matter workspace, and the shared
   * furniture those two faults hang off: the document-lock the partner is still
   * holding, and the matter share the associate cannot see.
   */
  fontainePartner: 'person:fontaine-marcus',
  fontainePartnerAccount: 'account:fontaine-marcus',
  fontaineNewHire: 'person:fontaine-erin',
  fontaineNewHireAccount: 'account:fontaine-erin',
  fontaineCheckoutLock: 'group:fontaine-checkout-lock',
  fontaineMatterShare: 'share:fontaine-matter',

  /**
   * Theo at Meridian - the SaaS company's office contact. His laptop is in
   * scope; the Linux product fleet he keeps mentioning is not, on either count.
   */
  meridianContact: 'person:meridian-theo',
  meridianContactAccount: 'account:meridian-theo',
  meridianLaptop: 'machine:meri-ws-01',
  meridianAppServer: 'machine:meri-app-01',
  meridianDbServer: 'machine:meri-db-01',

  /**
   * The identity estate the SaaS shop's corporate-IT work actually lives in
   * (0.8.0, Pass B). Theo files the tickets; these are the colleagues behind
   * them, and the two Okta groups their access hangs off. Everything here is
   * user-and-identity scope - squarely helpdesk - which is the point: the
   * PRODUCT fleet (the Linux app and db servers above) is out of reach on OS and
   * contract both, and the day is spent on Okta instead.
   */
  meridianDev: 'person:meridian-dana',
  meridianDevAccount: 'account:meridian-dana',
  meridianContractor: 'person:meridian-rafiq',
  meridianContractorAccount: 'account:meridian-rafiq',
  meridianAnalyst: 'person:meridian-nora',
  meridianAnalystAccount: 'account:meridian-nora',
  meridianAppGroup: 'group:meridian-app-users',
  meridianProdAdmins: 'group:meridian-prod-admins',

  /**
   * Ivy at Northwind Clinic - the monitoring-only account's contact. The MSP
   * watches their server and nothing more; a fix is out of contract.
   */
  northwindContact: 'person:northwind-ivy',
  northwindContactAccount: 'account:northwind-ivy',
  northwindServer: 'machine:nw-srv-01',
  northwindBackup: 'service:nw-srv-01/backup',
  /**
   * The clinic's public portal, on the same watched box (0.8.0, Pass B). It has
   * a TLS certificate the MSP monitors and - on a monitoring-only contract -
   * may only raise, never renew: the cert-expiry alert fires on this, and the
   * scope engine refuses the renew.
   */
  northwindPortal: 'service:nw-srv-01/clinicweb',

  /**
   * HOLLOWAY-ACCT, the fully-managed accountancy practice (0.11.0). Priya is the
   * office manager who files every Holloway ticket; the workstation and the file
   * server are the whole of a small practice's estate, and on a fully-managed
   * contract BOTH are the MSP's - the server DFS fix a helpdesk contract would
   * refuse is in scope here, which is the contrast this tier teaches.
   */
  hollowayContact: 'person:holloway-priya',
  hollowayContactAccount: 'account:holloway-priya',
  hollowayBookkeeper: 'person:holloway-gordon',
  hollowayBookkeeperAccount: 'account:holloway-gordon',
  hollowayWorkstation: 'machine:holl-ws-01',
  hollowayFileServer: 'machine:holl-srv-01',

  /**
   * ARDEN-MFG, the co-managed manufacturer with its own internal IT (0.11.0).
   * Dev Sharma is their IT manager and the MSP's point of contact - he files
   * both Arden tickets. The intranet server is the box the MSP fills the after-
   * hours gap on (co-managed reaches it, once their IT is notified); the floor
   * supervisor is the user whose lockout is their OWN team's to clear under the
   * RACI split - the hand-back the MSP does not poach.
   */
  ardenContact: 'person:arden-dev',
  ardenContactAccount: 'account:arden-dev',
  ardenSupervisor: 'person:arden-marika',
  ardenSupervisorAccount: 'account:arden-marika',
  ardenWorkstation: 'machine:arden-ws-01',
  ardenServer: 'machine:arden-srv-01',
} as const;

export type MspNodeId = (typeof MSP_IDS)[keyof typeof MSP_IDS];

interface StaffSeed {
  readonly person: string;
  readonly account: string;
  readonly name: string;
  readonly title: string;
  readonly username: string;
  readonly desk: string;
  /**
   * The customer whose staff this is, so their ACCOUNT carries the same
   * customer field a machine does and an account-targeted action (unlock,
   * resetpw, ...) runs the same scope + tenant pre-flight. Omitted for the
   * MSP's own tech, whose account belongs to no customer.
   */
  readonly customer?: string;
}

const STAFF: readonly StaffSeed[] = [
  {
    person: MSP_IDS.player,
    account: MSP_IDS.playerAccount,
    name: 'Pat Pending',
    title: 'Service Desk Technician (Tier 1)',
    username: 'pat',
    desk: 'A hot desk at Fettle & Crane, three customers deep before nine',
  },
  {
    person: MSP_IDS.fontaineContact,
    account: MSP_IDS.fontaineContactAccount,
    name: 'Nadia Fontaine',
    title: 'Practice Manager, Fontaine & Associates',
    username: 'nfontaine',
    desk: 'The front office of a law firm that runs on Windows and always has',
    customer: MSP_CUSTOMERS.fontaine,
  },
  {
    person: MSP_IDS.meridianContact,
    account: MSP_IDS.meridianContactAccount,
    name: 'Theo Marsh',
    title: 'Operations, Meridian',
    username: 'tmarsh',
    desk: 'An open-plan SaaS office, laptops out, the product humming in a '
      + 'datacentre somewhere else',
    customer: MSP_CUSTOMERS.meridian,
  },
  {
    person: MSP_IDS.northwindContact,
    account: MSP_IDS.northwindContactAccount,
    name: 'Ivy Okafor',
    title: 'Office Manager, Northwind Clinic',
    username: 'iokafor',
    desk: 'A clinic reception, where the only IT the MSP is paid to do is watch',
    customer: MSP_CUSTOMERS.northwind,
  },

  // The end-users the Pass B tickets are ABOUT, at the two helpdesk customers.
  // They file nothing themselves - their customer's contact does - so none of
  // them carries a dialogue tree; they exist to own the account a fault is on.
  {
    person: MSP_IDS.fontainePartner,
    account: MSP_IDS.fontainePartnerAccount,
    name: 'Marcus Reyes',
    title: 'Partner, Fontaine & Associates',
    username: 'mreyes',
    desk: 'A corner office where iManage is closed by shutting the laptop lid',
    customer: MSP_CUSTOMERS.fontaine,
  },
  {
    person: MSP_IDS.fontaineNewHire,
    account: MSP_IDS.fontaineNewHireAccount,
    name: 'Erin Khoury',
    title: 'Associate (started Monday), Fontaine & Associates',
    username: 'ekhoury',
    desk: 'A new desk, a full inbox, and not a single matter she can open yet',
    customer: MSP_CUSTOMERS.fontaine,
  },
  {
    person: MSP_IDS.meridianDev,
    account: MSP_IDS.meridianDevAccount,
    name: 'Dana Chen',
    title: 'Engineer, Meridian',
    username: 'dchen',
    desk: 'A hot-desk where the SSO tile has started bouncing her straight back',
    customer: MSP_CUSTOMERS.meridian,
  },
  {
    person: MSP_IDS.meridianContractor,
    account: MSP_IDS.meridianContractorAccount,
    name: 'Rafiq Hassan',
    title: 'Contractor (engagement ended in April), Meridian',
    username: 'rhassan',
    desk: 'Gone, and still - the ticket says - able to reach production',
    customer: MSP_CUSTOMERS.meridian,
  },
  {
    person: MSP_IDS.meridianAnalyst,
    account: MSP_IDS.meridianAnalystAccount,
    name: 'Nora Price',
    title: 'Analyst, Meridian',
    username: 'nprice',
    desk: 'A desk where the authenticator has stopped taking the code it makes',
    customer: MSP_CUSTOMERS.meridian,
  },

  // HOLLOWAY-ACCT, fully-managed (0.11.0). Priya files; Gordon is the bookkeeper
  // the account ticket is about.
  {
    person: MSP_IDS.hollowayContact,
    account: MSP_IDS.hollowayContactAccount,
    name: 'Priya Mehta',
    title: 'Office Manager, Holloway & Finch',
    username: 'pmehta',
    desk: 'A small practice where the MSP is the entire IT department, and knows '
      + 'it',
    customer: MSP_CUSTOMERS.holloway,
  },
  {
    person: MSP_IDS.hollowayBookkeeper,
    account: MSP_IDS.hollowayBookkeeperAccount,
    name: 'Gordon Ainsley',
    title: 'Bookkeeper, Holloway & Finch',
    username: 'gainsley',
    desk: 'Locked out on the morning the payroll run is due, which is always the '
      + 'morning',
    customer: MSP_CUSTOMERS.holloway,
  },

  // ARDEN-MFG, co-managed (0.11.0). Dev is their IT manager and the MSP's
  // counterpart; Marika is the floor supervisor whose lockout is Dev's team's.
  {
    person: MSP_IDS.ardenContact,
    account: MSP_IDS.ardenContactAccount,
    name: 'Dev Sharma',
    title: 'IT Manager, Arden Manufacturing',
    username: 'dsharma',
    desk: 'The other IT team on the account - the one the MSP coordinates with '
      + 'rather than around',
    customer: MSP_CUSTOMERS.arden,
  },
  {
    person: MSP_IDS.ardenSupervisor,
    account: MSP_IDS.ardenSupervisorAccount,
    name: 'Marika Voss',
    title: 'Floor Supervisor, Arden Manufacturing',
    username: 'mvoss',
    desk: 'Locked out, and routed to the MSP by mistake - her helpdesk is Dev\'s, '
      + 'not this one',
    customer: MSP_CUSTOMERS.arden,
  },
];

interface MachineSeed {
  readonly id: string;
  readonly hostname: string;
  readonly role: MachineRole;
  /** Omitted means Windows, the back-compat default. */
  readonly os?: MachineOs;
  /** The customer whose estate this box is in; omitted means the MSP's own. */
  readonly customer?: string;
  readonly owner?: string;
  readonly wiredTo?: string;
  readonly resolution?: string;
  readonly processor: string;
  readonly memory: string;
  readonly diskFree: number;
}

const MACHINES: readonly MachineSeed[] = [
  // The MSP's own desk - no customer, because it belongs to Fettle & Crane.
  {
    id: MSP_IDS.playerMachine,
    hostname: 'FC-DESK-07',
    role: MACHINE_ROLES.workstation,
    owner: MSP_IDS.player,
    resolution: '1920x1080',
    processor: 'Managed desktop, imaged last Tuesday',
    memory: '16 GB',
    diskFree: 214_748_364_800,
  },

  // FONTAINE-LAW: Windows-only, a workstation and two servers.
  {
    id: MSP_IDS.fontaineWorkstation,
    hostname: 'FONT-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.fontaine,
    owner: MSP_IDS.fontaineContact,
    wiredTo: MSP_IDS.fontaineDc,
    processor: 'A four-year-old business desktop under a lot of case files',
    memory: '8 GB',
    diskFree: 128_849_018_880,
  },
  {
    id: MSP_IDS.fontaineDc,
    hostname: 'FONT-DC-01',
    role: MACHINE_ROLES.domainController,
    customer: MSP_CUSTOMERS.fontaine,
    processor: 'A domain controller doing exactly one firm no favours',
    memory: '16 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: MSP_IDS.fontaineFileServer,
    hostname: 'FONT-FILE-01',
    role: MACHINE_ROLES.fileServer,
    customer: MSP_CUSTOMERS.fontaine,
    wiredTo: MSP_IDS.fontaineDc,
    processor: 'The file server every document management deadlock runs through',
    memory: '32 GB',
    diskFree: 42_949_672_960,
  },

  // MERIDIAN-SAAS: a Windows laptop, a Linux app server, a Linux db server.
  {
    id: MSP_IDS.meridianLaptop,
    hostname: 'MERI-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.meridian,
    owner: MSP_IDS.meridianContact,
    processor: 'A developer-spec laptop, mostly a browser and a terminal',
    memory: '32 GB',
    diskFree: 322_122_547_200,
  },
  {
    id: MSP_IDS.meridianAppServer,
    hostname: 'MERI-APP-01',
    role: MACHINE_ROLES.appServer,
    os: MACHINE_OS.linux,
    customer: MSP_CUSTOMERS.meridian,
    processor: 'A cloud instance running the product Meridian sells',
    memory: '16 GB',
    diskFree: 68_719_476_736,
  },
  {
    id: MSP_IDS.meridianDbServer,
    hostname: 'MERI-DB-01',
    role: MACHINE_ROLES.dbServer,
    os: MACHINE_OS.linux,
    customer: MSP_CUSTOMERS.meridian,
    processor: "The product's database, where the real damage would be",
    memory: '32 GB',
    diskFree: 137_438_953_472,
  },

  // NORTHWIND-CLINIC: one small server, watched and no more.
  {
    id: MSP_IDS.northwindServer,
    hostname: 'NW-SRV-01',
    role: MACHINE_ROLES.fileServer,
    customer: MSP_CUSTOMERS.northwind,
    processor: 'A clinic server the MSP is paid to watch and not to touch',
    memory: '16 GB',
    diskFree: 53_687_091_200,
  },

  // HOLLOWAY-ACCT: fully-managed, so the file server is as much the MSP's as the
  // workstation is - a small Windows-only practice, whole estate in reach.
  {
    id: MSP_IDS.hollowayWorkstation,
    hostname: 'HOLL-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.holloway,
    owner: MSP_IDS.hollowayContact,
    wiredTo: MSP_IDS.hollowayFileServer,
    processor: 'A reception desktop that also runs the practice management suite',
    memory: '8 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: MSP_IDS.hollowayFileServer,
    hostname: 'HOLL-SRV-01',
    role: MACHINE_ROLES.fileServer,
    customer: MSP_CUSTOMERS.holloway,
    processor: 'The file server the S: drive every client folder lives on maps to',
    memory: '16 GB',
    diskFree: 214_748_364_800,
  },

  // ARDEN-MFG: co-managed, so these are shared with Arden's own IT - the MSP
  // acts on them coordinated, never unilaterally. The intranet is the box the
  // MSP fills the after-hours gap on.
  {
    id: MSP_IDS.ardenWorkstation,
    hostname: 'ARDEN-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.arden,
    owner: MSP_IDS.ardenContact,
    processor: 'An IT manager\'s workstation, two service desks open at once',
    memory: '16 GB',
    diskFree: 128_849_018_880,
  },
  {
    id: MSP_IDS.ardenServer,
    hostname: 'ARDEN-SRV-01',
    role: MACHINE_ROLES.iisServer,
    customer: MSP_CUSTOMERS.arden,
    processor: 'The IIS box the shop-floor scheduling portal runs on',
    memory: '32 GB',
    diskFree: 171_798_691_840,
  },
];

/**
 * Baseline services a box should NOT seed because a named service twin is added
 * for them by hand. Empty for the MSP: the customer estates use the role
 * baselines whole, and the one named service (Northwind's backup) is on a box
 * whose baseline does not carry it, so there is nothing to skip.
 */
const NAMED_SERVICE_TWINS: Readonly<Record<string, readonly string[]>> = {};

/**
 * Somebody's name off the same table the seed builds them from, for the one
 * kind of caller that cannot read the graph.
 */
export function mspStaffName(personId: string): string {
  const member = STAFF.find((candidate) => candidate.person === personId);

  if (member === undefined) {
    throw new Error(`Nobody at the MSP is called "${personId}".`);
  }

  return member.name;
}

export function mspMachineHostname(machineId: string): string {
  const machine = MACHINES.find((candidate) => candidate.id === machineId);

  if (machine === undefined) {
    throw new Error(`No machine in the MSP world is called "${machineId}".`);
  }

  return machine.hostname;
}

/**
 * The rooms Fettle & Crane's service desk runs. Two governed rooms, MSP-shaped:
 * a `#service-desk` where the queue lives and a `#alerts` where the monitoring
 * board would post - the channel-mix contrast against Bodgeworth's ungoverned
 * `#office`. Inert on a scripted walk, like every channel message.
 */
export const MSP_CHANNELS: readonly ChannelDef[] = Object.freeze([
  Object.freeze({
    id: 'room:service-desk',
    name: '#service-desk',
    topic: 'the queue is the boss. one customer per ticket. check which tenant '
      + 'you are in before you touch anything.',
  }),
  Object.freeze({
    id: 'room:alerts',
    name: '#alerts',
    topic: 'monitoring alerts land here. acknowledge, escalate, do not fix what '
      + 'we are only paid to watch.',
  }),
]);

export function mspChannels(): readonly ChannelDef[] {
  return MSP_CHANNELS;
}

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

/** The MSP estate - the desk, three customers, three estates - as setup ops. */
export function mspSetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];

  // The customers first: the nodes every machine below points its `customer`
  // field at, and the nodes the scope + tenant guards read.
  for (const customer of CUSTOMERS) {
    addNode(ops, {
      id: customer.id,
      kind: 'customer',
      fields: {
        [FIELDS.name]: customer.name,
        [FIELDS.customerBusinessType]: customer.businessType,
        [FIELDS.customerServiceScope]: customer.scope,
        [FIELDS.customerSlaTier]: customer.sla,
      },
    });
  }

  for (const member of STAFF) {
    addNode(ops, {
      id: member.person,
      kind: 'person',
      fields: {
        [FIELDS.name]: member.name,
        [FIELDS.title]: member.title,
        [FIELDS.desk]: member.desk,
        ...(member.person === MSP_IDS.player
          ? {
            // The player's opening position, seeded exactly as the other two
            // employers seed it. A switch OVERWRITES reputation and title from
            // the carried career (session.ts); everything else is the fresh
            // Monday it is.
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
    addNode(ops, accountNode(member.account, member.username, member.customer));
    addEdge(ops, { from: member.person, to: member.account, kind: 'owns' });
  }

  for (const machine of MACHINES) {
    addNode(ops, {
      id: machine.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: machine.hostname,
        [FIELDS.machineRole]: machine.role,
        [FIELDS.machineOs]: machine.os ?? MACHINE_OS.windows,
        // The one new dimension: which customer's estate this box is in. Omitted
        // for the MSP's own desk, which belongs to no customer.
        ...(machine.customer === undefined
          ? {}
          : { [FIELDS.machineCustomer]: machine.customer }),
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: machine.resolution ?? '1024x768',
        [FIELDS.pendingUpdates]: false,
        [FIELDS.processor]: machine.processor,
        [FIELDS.memory]: machine.memory,
        [FIELDS.diskFree]: machine.diskFree,
      },
    });
  }

  for (const machine of MACHINES) {
    // Linux boxes have no Windows drive to build.
    if ((machine.os ?? MACHINE_OS.windows) === MACHINE_OS.linux) {
      continue;
    }

    const owner = STAFF.find((member) => member.person === machine.owner);

    ops.push(...driveSetup({
      machineId: machine.id,
      hostname: machine.hostname,
      role: machine.role,
      ...(owner === undefined ? {} : { ownerUsername: owner.username }),
      supportDesk: machine.id === MSP_IDS.playerMachine,
    }));
  }

  for (const machine of MACHINES) {
    if (machine.owner !== undefined) {
      addEdge(ops, { from: machine.owner, to: machine.id, kind: 'owns' });
    }

    if (machine.wiredTo !== undefined) {
      addEdge(ops, { from: machine.id, to: machine.wiredTo, kind: 'connected_to' });
    }
  }

  addNode(ops, {
    id: MSP_IDS.playerMonitor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'A second monitor, MSP-issue',
      [FIELDS.type]: DEVICE_TYPES.monitor,
      [FIELDS.powered]: true,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.playerMonitor,
    to: MSP_IDS.playerMachine,
    kind: 'connected_to',
  });

  // The service Northwind pays the MSP to WATCH: the backup service on
  // NW-SRV-01. Seeded healthy; the monitoring-alert ticket wedges it when it
  // arrives, the way every fault in this game arrives with its ticket. It is
  // what the scope refusal fires on when a player reaches to FIX what the
  // contract only lets them escalate.
  addNode(ops, {
    id: MSP_IDS.northwindBackup,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Backup Service',
      [FIELDS.serviceName]: 'NWBackup',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.northwindBackup,
    to: MSP_IDS.northwindServer,
    kind: 'runs_on',
  });

  // The clinic's public portal on the same watched box, with a TLS certificate
  // the MSP monitors. Seeded in date and running; the cert-expiry ticket wedges
  // the certificate when it arrives, the way every fault in this game arrives
  // with its ticket. On a monitoring-only contract the renew is refused and the
  // job is to raise it.
  addNode(ops, {
    id: MSP_IDS.northwindPortal,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Clinic Portal',
      [FIELDS.serviceName]: 'ClinicWeb',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
      [FIELDS.certExpired]: false,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.northwindPortal,
    to: MSP_IDS.northwindServer,
    kind: 'runs_on',
  });

  // The identity furniture the helpdesk-scope tickets hang off: the iManage
  // exclusive-lock the partner is still holding (its membership IS who has the
  // document checked out), the matter workspace the new associate cannot see,
  // and the two Okta groups a Meridian login is bounced on. The GROUPS and the
  // SHARE are estate that always exists; the faulty memberships arrive with the
  // ticket that is about them (in each ticket's `setup`), exactly as every other
  // fault in this roster does.
  const GROUPS: readonly Readonly<{ id: string; name: string }>[] = [
    {
      id: MSP_IDS.fontaineCheckoutLock,
      name: 'iManage - Rossiter v Atlas (checked out)',
    },
    { id: MSP_IDS.meridianAppGroup, name: 'Okta - Salesforce Users' },
    { id: MSP_IDS.meridianProdAdmins, name: 'Okta - Production Admins' },
  ];

  for (const group of GROUPS) {
    addNode(ops, {
      id: group.id,
      kind: 'group',
      fields: { [FIELDS.name]: group.name },
    });
  }

  addNode(ops, {
    id: MSP_IDS.fontaineMatterShare,
    kind: 'share',
    fields: {
      [FIELDS.name]: 'Matter Workspace - Delacroix Estate',
      // The customer's own UNC, not the MSP's: this share lives on Fontaine's
      // file server, which is who the matter security groups belong to.
      [FIELDS.path]: '\\\\FONTAINE\\matters\\delacroix',
    },
  });

  // The baseline services every Windows box has run since it was built, from the
  // table for its role - so a customer's file server has real Windows services
  // for the helpdesk scope refusal to fire on when a Tier-1 tech reaches for one.
  for (const machine of MACHINES) {
    if ((machine.os ?? MACHINE_OS.windows) === MACHINE_OS.linux) {
      continue;
    }

    const named = NAMED_SERVICE_TWINS[machine.id] ?? [];

    for (const service of BASELINE_SERVICES[machine.role] ?? []) {
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

  // And the systemd units on the Linux boxes, from the table for their role - so
  // Meridian's product fleet is real ahead of the tools that would manage it,
  // and refuses on OS and scope both when a helpdesk tech reaches for it.
  for (const machine of MACHINES) {
    if ((machine.os ?? MACHINE_OS.windows) !== MACHINE_OS.linux) {
      continue;
    }

    for (const unit of BASELINE_UNITS[machine.role] ?? []) {
      const id = linuxUnitId(machine.id, unit.unit);

      addNode(ops, {
        id,
        kind: 'unit',
        fields: {
          [FIELDS.name]: unit.name,
          [FIELDS.unitName]: unit.unit,
          [FIELDS.unitState]: unit.state,
          [FIELDS.unitEnabled]: unit.enabled,
        },
      });
      addEdge(ops, { from: id, to: machine.id, kind: 'runs_on' });
    }
  }

  return ops;
}

/** What the MSP has on file to prove who a customer contact is: a callback. */
const VERIFICATION_CHANNELS_ON_FILE = verificationChannels([
  VERIFICATION_METHODS.callback,
]);

/**
 * One account node. Nothing locked or expired in the seed; every fault arrives
 * with the ticket about it, exactly as the other two employers' do.
 *
 * A customer's staff account carries that customer's id in the SAME field a box
 * does (`FIELDS.machineCustomer`), so the scope + tenant pre-flight reads it and
 * an account-targeted action is guarded exactly as a machine-targeted one is.
 * The MSP's own tech gets no customer, so their account is in-house and
 * unguarded - byte-identical to before.
 */
function accountNode(
  id: string,
  username: string,
  customer?: string,
): GraphNode {
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
      [FIELDS.mfaEnrolled]: false,
      [FIELDS.verificationChannels]: VERIFICATION_CHANNELS_ON_FILE,
      ...(customer === undefined ? {} : { [FIELDS.machineCustomer]: customer }),
    },
  };
}
