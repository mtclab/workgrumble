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
  isUnixFamily,
  MACHINE_OS,
  type MachineOs,
  type MachineRole,
  MACHINE_ROLES,
  type RaciOwner,
  RACI_OWNERS,
  SERVICE_CLASSES,
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
  baselineUnitsFor,
  FC_INFRA_UNITS,
  NAS_APPLIANCE_UNITS,
  unitIdOn,
  unitNodeFields,
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
  // 0.13.0, the customer that SIGNS mid-week and is stood up by the onboarding
  // event rather than at Monday boot - so it is absent until the day it joins.
  tillman: 'customer:tillman',
  // 0.14.0, the managed dental clinic - the hands-on Windows vertical. Distinct
  // from monitoring-only NORTHWIND-CLINIC: this one is fully-managed, with real
  // chair-side, time-pressured tickets.
  elmwood: 'customer:elmwood',
  // 0.32.0, the creative agency - the Mac vertical, and the first customer on
  // this roster whose desks are not Windows at all.
  marlowe: 'customer:marlowe',
  // 0.37.0, the co-managed customer with a RACI MAP on its estate - the second
  // co-managed account, and the one where the wall is not a wall.
  pennington: 'customer:pennington',
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
  {
    // ELMWOOD-DENTAL: a managed dental practice with no in-house IT, so the MSP
    // is the whole IT department - a fully-managed contract, which puts the
    // chair-side workstation, the USB X-ray sensor on it and the practice
    // server all in reach. Gold, because a clinic that stops the moment a chair
    // goes down pays for the tightest response there is: the chair-side sensor
    // ticket lands on the tiniest resolution budget in the game. Distinct from
    // monitoring-only NORTHWIND-CLINIC - two clinics at opposite scope poles.
    id: MSP_CUSTOMERS.elmwood,
    name: 'ELMWOOD-DENTAL',
    businessType: BUSINESS_TYPES.dentalClinic,
    scope: SERVICE_SCOPES.fullyManaged,
    sla: SLA_TIERS.gold,
  },
  {
    // MARLOWE-STUDIO: a creative agency with no in-house IT at all - a studio
    // manager, designers, and Fettle & Crane for everything else - so the
    // contract is fully-managed and the whole estate is in reach, MDM console
    // and licensing console included. Silver, because that tier had every scope
    // but this one: a studio missing a delivery loses a client, which is worth
    // paying above Bronze for, and it is not a surgery with a patient in the
    // chair, which is what Gold is for. The estate is the axis-3 archetype
    // whole - Macs, a project NAS, an MDM at fleet grain, a creative suite
    // licensed per person - and it is the first one where a Windows-shaped
    // instinct is wrong three different ways.
    id: MSP_CUSTOMERS.marlowe,
    name: 'MARLOWE-STUDIO',
    businessType: BUSINESS_TYPES.creativeAgency,
    scope: SERVICE_SCOPES.fullyManaged,
    sla: SLA_TIERS.silver,
  },
  {
    // PENNINGTON-ACCT: a mid-size accountancy with ONE internal IT person, and
    // the reason there is a second co-managed customer on this roster.
    //
    // ARDEN-MFG is co-managed with the map left unwritten, which is the honest
    // majority case and the one the 0.11.0 refusal is for: nobody has divided
    // the estate, so the rule is tell them before you touch anything. This one
    // has done the work. The RACI on the account names the functions - the desk
    // and the endpoints are the MSP's, the practice system is Gil's - and
    // that changes what a refusal even IS, because a map that hands a box to
    // their side does not come with a lock. Silver, like ARDEN: two IT teams
    // and a mid-size firm is a normal contract, not a premium one, and Gold
    // here would price the split rather than the urgency.
    //
    // The same vertical as HOLLOWAY-ACCT on purpose. Holloway is a small
    // practice where Fettle & Crane IS the IT department; this is the same
    // trade three sizes up, where they employ a man of their own - and the same
    // ticket (their line-of-business system has stopped) is a different job at
    // each. That contrast is the whole point of putting them in one industry.
    id: MSP_CUSTOMERS.pennington,
    name: 'PENNINGTON-ACCT',
    businessType: BUSINESS_TYPES.accountancy,
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
   * Fettle & Crane's own infrastructure lead (E6, Pass B) - the engineer who
   * runs the MSP's internal estate and pages the newly-promoted player when the
   * client portal falls over. Belongs to no customer: they are the MSP's own,
   * exactly like the player and the infra box below.
   */
  mspLead: 'person:fc-morgan',
  mspLeadAccount: 'account:fc-morgan',
  /**
   * The MSP's OWN Linux box and the product on it (E6, Pass B): Fettle & Crane's
   * client portal server, running `fcportal.service` behind nginx. No customer -
   * this is the employer's own infra, which is the honest, non-bypassing place a
   * promoted engineer fixes a downed unit over ssh (a helpdesk customer's server
   * stays out of reach on contract, engineer or not). The first-fix incident
   * downs the portal unit; `systemctl restart` brings it back.
   */
  mspInfraServer: 'machine:fc-rmm-01',
  mspInfraPortalUnit: 'unit:fc-rmm-01/fcportal.service',
  /**
   * The other two FC-RMM-01 units on-call pages land on (E6, 0.17.0): the
   * reverse proxy out front, and the cron daemon the nightly jobs run under.
   * Seeded healthy in `FC_INFRA_UNITS`; a page downs one overnight - nginx for
   * the real fire (the whole box goes dark), cron for the flap (a timer check
   * twitches and settles). Same box, no customer, so both stay the engineer's to
   * fix without crossing a contract.
   */
  mspInfraNginxUnit: 'unit:fc-rmm-01/nginx.service',
  mspInfraCronUnit: 'unit:fc-rmm-01/cron.service',
  /**
   * The background worker the failed-deploy incident is about (E6, 0.19.0):
   * fcworker.service, the queue processor behind the portal. It is NOT in the
   * seeded baseline - the incident's own setup adds it `failed`, exactly the way
   * a runtime addNode drips a ticket - so FC-RMM-01 is byte-identical until the
   * promotion raises the incident. "Worked in staging"; the fix is the rollback +
   * restart, and the incident closes on the blameless postmortem.
   */
  mspInfraWorkerUnit: 'unit:fc-rmm-01/fcworker.service',
  /**
   * The auth service and its secret env file the permission-denied incident is
   * about (E6, 0.21.0): fcauth.service reads /etc/fcauth/auth.env at startup, and
   * both are BUILT by the incident's own setup (the unit `failed`, the file owned
   * wrong) rather than seeded - so FC-RMM-01 is byte-identical until the promotion
   * raises it. A bad deploy left the env file `600 root:root` where the fcauth
   * service account needs read, so the service fails with "Permission denied"; the
   * fix is chown/chmod the file readable, then systemctl restart.
   */
  mspInfraAuthUnit: 'unit:fc-rmm-01/fcauth.service',
  mspInfraAuthConfig: 'file:fc-rmm-01/etc/fcauth/auth.env',

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

  /**
   * ARDEN-MFG's edge, and the estate the first PROJECT is about (0.29.0, E10).
   *
   * All of it is seeded on the Monday, because all of it is genuinely there on
   * the Monday: the old box has been running the plant since 2014, the new one
   * was procured six weeks ago and has been sitting in the comms cabinet in its
   * packaging ever since (procurement is the invisible wall every source in the
   * research names, and the honest way to ship it inside one week is to have it
   * already over), and the circuit is the ISP's handoff both of them are cabled
   * near. What ARRIVES at kickoff is the project - a schedule - and nothing else.
   *
   * `ARD-FW-01` carries the rule set as `service` nodes `runs_on` it: a named
   * thing the edge does, with a state, which is what a `service` is in this
   * world. Two of the six are in nobody's documentation.
   */
  ardenEdgeOld: 'machine:ard-fw-01',
  ardenEdgeNew: 'machine:ard-fw-02',
  /**
   * The ISP's fibre handoff at the bottom of the cabinet. One cable comes out
   * of it, and which box that cable is in IS the cutover - an edge in the graph,
   * moved by a verb and moved back by another.
   */
  ardenCircuit: 'device:ard-circuit-01',

  /**
   * TILLMAN-FREIGHT, the small trades business the MSP signs mid-week (0.13.0).
   * None of these is in `mspSetup()`: they are stood up by the onboarding event
   * (`mspOnboardingSetup`), so at Monday boot the customer does not exist and the
   * MSP world is byte-identical to 0.12.0. Glenda runs the office and files the
   * one ticket; the estate is two workstations and a server nobody documented,
   * and the backup service on that server is the whole horror - configured,
   * green, and empty.
   */
  tillmanContact: 'person:tillman-glenda',
  tillmanContactAccount: 'account:tillman-glenda',
  tillmanReception: 'machine:till-ws-01',
  tillmanYardPc: 'machine:till-ws-02',
  tillmanServer: 'machine:till-srv-01',
  tillmanBackup: 'service:till-srv-01/backup',

  /**
   * ELMWOOD-DENTAL, the fully-managed dental practice (0.14.0). Grace runs the
   * front office and files every clinic ticket on behalf of the surgery. The
   * estate is the hands-on Windows vertical: an operatory (chair-side)
   * workstation with the USB X-ray sensor plugged into it, a reception
   * workstation, and the practice server running the Dentrix-class PMS and the
   * DEXIS-class imaging bridge. The sensor "not detected" and the imaging bridge
   * a PMS update broke both hang off this estate; the HIPAA access-review is
   * read off the server's audit trail.
   */
  elmwoodContact: 'person:elmwood-grace',
  elmwoodContactAccount: 'account:elmwood-grace',
  elmwoodOperatory: 'machine:elm-ws-01',
  elmwoodReception: 'machine:elm-ws-02',
  elmwoodServer: 'machine:elm-srv-01',
  elmwoodSensor: 'device:elm-sensor-01',
  elmwoodImagingBridge: 'service:elm-srv-01/imaging-bridge',

  /**
   * MARLOWE-STUDIO, the fully-managed creative agency (0.32.0) - the Mac
   * vertical, and the estate the third OS family was seeded for.
   *
   * Rosa runs the studio and files everything on behalf of the people at the
   * desks, the way Grace does for the surgery. Corin is the senior designer
   * whose Mac the remote session cannot see and whose plugin the OS will not
   * open; Luca is the freelance motion designer whose seat on the creative suite
   * expired in the middle of a job, which is the licensing lesson: the seat was
   * never on the machine, it was on the person.
   *
   * The estate is three managed Macs and the box the work actually lives on -
   * a Linux project NAS serving SMB, which is what a 10GbE studio NAS is. The
   * suite's seats are a licence pool the same shape the probation shop's is,
   * and the project share is the volume every one of those Macs has mounted.
   */
  marloweContact: 'person:marlowe-rosa',
  marloweContactAccount: 'account:marlowe-rosa',
  marloweDesigner: 'person:marlowe-corin',
  marloweDesignerAccount: 'account:marlowe-corin',
  marloweFreelancer: 'person:marlowe-luca',
  marloweFreelancerAccount: 'account:marlowe-luca',
  marloweDesignMac: 'machine:marl-ws-01',
  marloweEditMac: 'machine:marl-ws-02',
  marloweStudioMac: 'machine:marl-ws-03',
  marloweNas: 'machine:marl-nas-01',
  marloweProjectShare: 'share:marl-projects',
  marloweSuiteSeats: 'service:marl-suite-seats',

  /**
   * PENNINGTON-ACCT, the co-managed accountancy with a RACI map (E9, 0.37.0).
   *
   * Esme runs the practice and files the tickets, the way Grace does for the
   * surgery. Gil is the OTHER half of this account and the reason it exists:
   * their entire IT department, one man, who owns the practice system the firm
   * runs on and reads his own monitoring in the morning. He files nothing - he
   * is not a customer contact, he is a peer - and he is the person who writes
   * the mail when somebody has been on his box without telling him.
   *
   * The estate is the map made of boxes. The two desks are the MSP's under the
   * RACI (`raci_owner: msp`) - endpoint support is exactly what they contracted
   * out - and PENN-SRV-01 is Gil's (`raci_owner: internal`), because
   * application ownership is the function every co-managed source says stays
   * in-house. He OWNS it in the graph as well as on paper, which is how the
   * complaint knows whose name goes on it.
   */
  penningtonContact: 'person:pennington-esme',
  penningtonContactAccount: 'account:pennington-esme',
  // The `-callum` in these two ids is a first draft of the man who ended up
  // being called Gil Farrant. They are save-borne internals - a save written
  // before the rename names them - so they STAY as they are. The display name
  // and the username are the parts a player ever reads, and those are his.
  penningtonSysadmin: 'person:pennington-callum',
  penningtonSysadminAccount: 'account:pennington-callum',
  penningtonServer: 'machine:penn-srv-01',
  penningtonReception: 'machine:penn-ws-01',
  penningtonSeniorDesk: 'machine:penn-ws-02',
  /**
   * The practice system itself: the ledger and tax suite the whole firm books
   * its hours into, as a Windows service on Gil's box. Seeded RUNNING like
   * every other named service here - the fault arrives with the ticket about
   * it, and the fix is the restart that works whoever types it, which is the
   * entire trap.
   */
  penningtonPracticeApp: 'service:penn-srv-01/ledgerline',
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
  /**
   * Whether this person holds a seat of the software their shop licenses per
   * PERSON (0.32.0, the creative agency). Only the studio has a licence pool,
   * and its permanent designers hold its seats - which is why there is not a
   * spare one for the freelancer whose term seat lapsed, and why taking one
   * back would block a working designer instead of a blocked one.
   */
  readonly licence?: boolean;
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
    // The MSP's own infrastructure lead (E6). No customer - Fettle & Crane's own
    // - so their account runs the in-house path, not a tenant scope. They file
    // the first-fix incident about the client portal the whole shop runs on.
    person: MSP_IDS.mspLead,
    account: MSP_IDS.mspLeadAccount,
    name: 'Morgan Okafor',
    title: 'Infrastructure Lead, Fettle & Crane',
    username: 'mokafor',
    desk: 'The engineer who owns the boxes Fettle & Crane itself runs on',
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

  // ELMWOOD-DENTAL, fully-managed (0.14.0). Grace files every clinic ticket; the
  // faults are about the surgery's shared machines and its server, not about a
  // named colleague's account, so she is the whole of the clinic's cast.
  {
    person: MSP_IDS.elmwoodContact,
    account: MSP_IDS.elmwoodContactAccount,
    name: 'Grace Bellamy',
    title: 'Practice Manager, Elmwood Dental',
    username: 'gbellamy',
    desk: 'A dental reception where a chair standing empty is a bill nobody sent, '
      + 'and the server lives in a cupboard behind the sterilisation room',
    customer: MSP_CUSTOMERS.elmwood,
  },

  // MARLOWE-STUDIO, fully-managed (0.32.0). Rosa files every studio ticket on
  // behalf of whoever is stuck; Corin and Luca are the two people the faults are
  // actually happening to, and both need accounts of their own - Corin because
  // the Mac in front of him is his, Luca because the licence seat that expired
  // is attached to a PERSON and there is nowhere else to hang it.
  {
    person: MSP_IDS.marloweContact,
    account: MSP_IDS.marloweContactAccount,
    name: 'Rosa Marlowe',
    title: 'Studio Manager, Marlowe Studio',
    username: 'rmarlowe',
    desk: 'A studio front desk with three delivery dates on the wall and a '
      + 'kettle nobody descales',
    customer: MSP_CUSTOMERS.marlowe,
    licence: true,
  },
  {
    person: MSP_IDS.marloweDesigner,
    account: MSP_IDS.marloweDesignerAccount,
    name: 'Corin Adeyemi',
    title: 'Senior Designer, Marlowe Studio',
    username: 'cadeyemi',
    desk: 'The corner desk with the colour-calibrated screen nobody else is '
      + 'allowed to touch',
    customer: MSP_CUSTOMERS.marlowe,
    licence: true,
  },
  {
    person: MSP_IDS.marloweFreelancer,
    account: MSP_IDS.marloweFreelancerAccount,
    name: 'Luca Vasquez',
    title: 'Motion Designer (freelance), Marlowe Studio',
    username: 'lvasquez',
    desk: 'A hot desk by the window, booked by the week, on the third week of '
      + 'a two-week job',
    customer: MSP_CUSTOMERS.marlowe,
  },

  // PENNINGTON-ACCT, co-managed with the map written down (E9, 0.37.0). Esme
  // files; Gil is the peer on the other side of the RACI line and files
  // nothing at all.
  {
    person: MSP_IDS.penningtonContact,
    account: MSP_IDS.penningtonContactAccount,
    name: 'Esme Roe',
    title: 'Practice Manager, Pennington & Roe',
    username: 'eroe',
    desk: 'The front office of an accountancy where forty people book their '
      + 'hours into one system and nobody has ever asked which box it is on',
    customer: MSP_CUSTOMERS.pennington,
  },
  {
    person: MSP_IDS.penningtonSysadmin,
    account: MSP_IDS.penningtonSysadminAccount,
    name: 'Gil Farrant',
    title: 'IT Manager, Pennington & Roe',
    username: 'gfarrant',
    desk: 'A desk in the server room, an IT department of one, and a monitoring '
      + 'dashboard he actually reads',
    customer: MSP_CUSTOMERS.pennington,
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
  /**
   * Which IT team the co-managed RACI map hands this box to (E9, 0.37.0).
   *
   * Written only where a map exists to read - one customer, three boxes - so
   * every other estate in this file carries no such field and is byte-identical
   * to before it existed. Omitted at a co-managed customer means the map is
   * silent about that box and the shipped notify-first rule stands, which is
   * ARDEN-MFG's whole estate and is the commoner case in life.
   */
  readonly raci?: RaciOwner;
  readonly owner?: string;
  readonly wiredTo?: string;
  readonly resolution?: string;
  readonly processor: string;
  readonly memory: string;
  readonly diskFree: number;
  /**
   * Whether this box is enrolled in the customer's device management (0.32.0).
   *
   * The same field a company-issue handset carries at the corporate employer,
   * on a workstation for the first time, because that is what an MDM at FLEET
   * grain manages: a managed Mac is enrolled, and the console can push a
   * configuration profile to it. It is what makes the Screen Recording refusal
   * about the LIMIT of a profile rather than about a missing channel.
   */
  readonly mdmEnrolled?: boolean;
  /**
   * Whether the remote-support tool holds Screen Recording consent on this Mac
   * (0.32.0). Seeded granted across the studio, because a desk that could
   * never see a screen would not have a support contract; the ticket takes it
   * away on one box, which is the fault.
   */
  readonly screenRecording?: boolean;
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
  // The edge, old and new (0.29.0). Both Linux, because a small-business
  // firewall is: a packet filter and a VPN daemon on a box, which is what the
  // firewall unit baseline gives each of them. Neither has anything wrong with
  // it - the old one works and the new one boots clean with no rules on it at
  // all, and that gap is the entire project.
  {
    id: MSP_IDS.ardenEdgeOld,
    hostname: 'ARD-FW-01',
    role: MACHINE_ROLES.firewall,
    os: MACHINE_OS.linux,
    customer: MSP_CUSTOMERS.arden,
    processor: 'The edge box the plant has run behind since 2014, last touched '
      + 'by a contractor nobody can name',
    memory: '2 GB',
    diskFree: 3_221_225_472,
  },
  {
    id: MSP_IDS.ardenEdgeNew,
    hostname: 'ARD-FW-02',
    role: MACHINE_ROLES.firewall,
    os: MACHINE_OS.linux,
    customer: MSP_CUSTOMERS.arden,
    processor: 'The replacement, racked six weeks ago and still on its factory '
      + 'configuration',
    memory: '8 GB',
    diskFree: 51_539_607_552,
  },

  // ELMWOOD-DENTAL: fully-managed, Windows-only and locked down. An operatory
  // (chair-side) workstation the X-ray sensor plugs into, a reception desktop,
  // and the practice server the PMS and imaging bridge run on - the whole estate
  // the MSP's, server included.
  {
    // The chair-side PC: a shared operatory workstation nobody personally owns,
    // the way the yard PC at Tillman is shared - it belongs to the chair, not a
    // person, which is why the sensor plugged into it takes a whole surgery down.
    id: MSP_IDS.elmwoodOperatory,
    hostname: 'ELM-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.elmwood,
    wiredTo: MSP_IDS.elmwoodServer,
    processor: 'The operatory PC by the chair, running the imaging capture front '
      + 'end all day',
    memory: '8 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: MSP_IDS.elmwoodReception,
    hostname: 'ELM-WS-02',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.elmwood,
    owner: MSP_IDS.elmwoodContact,
    wiredTo: MSP_IDS.elmwoodServer,
    processor: 'The front-desk desktop, appointment book and the practice suite',
    memory: '8 GB',
    diskFree: 128_849_018_880,
  },
  {
    id: MSP_IDS.elmwoodServer,
    hostname: 'ELM-SRV-01',
    role: MACHINE_ROLES.fileServer,
    customer: MSP_CUSTOMERS.elmwood,
    processor: 'The practice server: the Dentrix patient database and the DEXIS '
      + 'imaging bridge, in a cupboard behind the sterilisation room',
    memory: '32 GB',
    diskFree: 214_748_364_800,
  },

  // MARLOWE-STUDIO: fully-managed, and the inverse of every estate above it.
  // Three Macs at three desks, all enrolled in the studio's MDM and all with
  // the support tool's Screen Recording consent granted, wired to the one box
  // that is not a Mac: the project NAS the work lives on.
  {
    id: MSP_IDS.marloweDesignMac,
    hostname: 'MARL-WS-01',
    role: MACHINE_ROLES.workstation,
    os: MACHINE_OS.mac,
    customer: MSP_CUSTOMERS.marlowe,
    owner: MSP_IDS.marloweDesigner,
    wiredTo: MSP_IDS.marloweNas,
    resolution: '2560x1440',
    processor: 'The senior designer\'s desktop Mac, colour-calibrated to within '
      + 'an inch of its life',
    memory: '32 GB',
    diskFree: 343_597_383_680,
    mdmEnrolled: true,
    screenRecording: true,
  },
  {
    id: MSP_IDS.marloweEditMac,
    hostname: 'MARL-WS-02',
    role: MACHINE_ROLES.workstation,
    os: MACHINE_OS.mac,
    customer: MSP_CUSTOMERS.marlowe,
    wiredTo: MSP_IDS.marloweNas,
    resolution: '2560x1440',
    processor: 'The edit suite: whoever is cutting this week sits at it, which '
      + 'is why it has every plugin anybody has ever asked for',
    memory: '64 GB',
    diskFree: 171_798_691_840,
    mdmEnrolled: true,
    screenRecording: true,
  },
  {
    id: MSP_IDS.marloweStudioMac,
    hostname: 'MARL-WS-03',
    role: MACHINE_ROLES.workstation,
    os: MACHINE_OS.mac,
    customer: MSP_CUSTOMERS.marlowe,
    owner: MSP_IDS.marloweContact,
    wiredTo: MSP_IDS.marloweNas,
    resolution: '2560x1440',
    processor: 'The studio manager\'s laptop, which runs the schedule, the '
      + 'invoices and one very large spreadsheet',
    memory: '16 GB',
    diskFree: 128_849_018_880,
    mdmEnrolled: true,
    screenRecording: true,
  },
  {
    // The NAS: Linux, because a 10GbE project NAS is, and the estate says so
    // rather than dressing an appliance as a Windows file server. Its units are
    // hand-written (`NAS_APPLIANCE_UNITS`) for the same reason - the file-server
    // role table is a list of Windows services, and this box runs Samba.
    id: MSP_IDS.marloweNas,
    hostname: 'MARL-NAS-01',
    role: MACHINE_ROLES.fileServer,
    os: MACHINE_OS.linux,
    customer: MSP_CUSTOMERS.marlowe,
    processor: 'The project NAS on the studio\'s 10-gig switch: every job, every '
      + 'render, every version anybody has been too frightened to delete',
    memory: '16 GB',
    diskFree: 3_298_534_883_328,
  },

  // PENNINGTON-ACCT: co-managed, and the estate with the map ON it. Two desks
  // the firm has contracted out and one server it has not - the split written
  // as three fields rather than as a paragraph in a contract nobody reads.
  {
    id: MSP_IDS.penningtonReception,
    hostname: 'PENN-WS-01',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.pennington,
    owner: MSP_IDS.penningtonContact,
    wiredTo: MSP_IDS.penningtonServer,
    // The desks are the MSP's under the map, and that is not a courtesy: a
    // firm that employs one IT person contracts out the end-user work first,
    // because it is the half that arrives forty times a day. So this box needs
    // no heads-up before it is fixed - it is the job, and treating it as
    // somebody else's would be the desk refusing work it is paid for.
    raci: RACI_OWNERS.msp,
    processor: 'The front-desk PC, the practice diary and everybody\'s post',
    memory: '8 GB',
    diskFree: 96_636_764_160,
  },
  {
    id: MSP_IDS.penningtonSeniorDesk,
    hostname: 'PENN-WS-02',
    role: MACHINE_ROLES.workstation,
    customer: MSP_CUSTOMERS.pennington,
    wiredTo: MSP_IDS.penningtonServer,
    raci: RACI_OWNERS.msp,
    processor: 'A senior accountant\'s desktop with three spreadsheets open '
      + 'that have not been closed since the tax year opened',
    memory: '16 GB',
    diskFree: 128_849_018_880,
  },
  {
    // Gil's box, and the point of the whole customer. The practice system
    // runs on it, application ownership is his under the RACI, and the MSP's
    // admin account can reach it exactly as easily as it reaches anything else
    // - which is the honest bit. He owns it in the graph too, so the complaint
    // that comes back has a name on it rather than a role.
    id: MSP_IDS.penningtonServer,
    hostname: 'PENN-SRV-01',
    role: MACHINE_ROLES.fileServer,
    customer: MSP_CUSTOMERS.pennington,
    owner: MSP_IDS.penningtonSysadmin,
    raci: RACI_OWNERS.internal,
    processor: 'The practice server: the ledger and tax suite the firm bills '
      + 'through, in a room with Gil\'s desk in it',
    memory: '32 GB',
    diskFree: 214_748_364_800,
  },
];

/* -- ARDEN-MFG's edge rule set (0.29.0, E10) ------------------------------ */

/** The project the edge replacement is, by id. Its node arrives at kickoff. */
export const ARDEN_EDGE_PROJECT = 'project:arden-edge';

export const ARDEN_EDGE_PROJECT_NAME =
  'ARDEN-MFG: edge firewall replacement (ARD-FW-01 -> ARD-FW-02)';

/** The two tickets a cutover that missed something raises the next morning. */
export const ARDEN_SCREAM_TICKETS = {
  vendorTunnel: 'ticket:arden-fw-scream-brenmark',
  scanners: 'ticket:arden-fw-scream-scanners',
} as const;

interface EdgeRuleSeed {
  readonly id: string;
  /** What a listing prints. */
  readonly name: string;
  /** What a player types. */
  readonly short: string;
  readonly ruleClass: 'route' | 'nat' | 'policy' | 'vpn';
  readonly order: number;
  /** Whether the handover pack lists it. Two of these do not. */
  readonly documented: boolean;
  /** The ticket it becomes the morning after a cutover that left it behind. */
  readonly screamTicket?: string;
}

/**
 * The rule set on ARD-FW-01, in the order canon migrates a firewall in: routing
 * first, then NAT, then policies, then VPNs (FireMon's checklist, and every
 * engineer who has done one). Six rules, four of them in the handover pack.
 *
 * The two that are not in the pack are the two every real migration finds the
 * hard way, and both are documented failures rather than invented ones: a hole
 * a machine vendor asked for years ago and nobody wrote down, and an inbound
 * port a cloud service calls back on that was opened for a pilot and kept. They
 * are not hidden - the box will tell anybody who reads its live configuration -
 * they are simply not on the piece of paper.
 */
const ARDEN_EDGE_RULES: readonly EdgeRuleSeed[] = [
  {
    id: 'service:ard-fw-01/wan-default',
    name: 'WAN default route - Vector Broadband handoff',
    short: 'wan-default',
    ruleClass: 'route',
    order: 1,
    documented: true,
  },
  {
    id: 'service:ard-fw-01/nat-portal',
    name: 'NAT 443 inbound -> ARDEN-SRV-01 (shop-floor scheduling portal)',
    short: 'nat-portal',
    ruleClass: 'nat',
    order: 2,
    documented: true,
  },
  {
    id: 'service:ard-fw-01/policy-plant',
    name: 'Policy: office VLAN -> plant VLAN, print and file only',
    short: 'policy-plant',
    ruleClass: 'policy',
    order: 3,
    documented: true,
  },
  {
    id: 'service:ard-fw-01/vpn-coalport',
    name: 'Site-to-site VPN: Coalport yard',
    short: 'vpn-coalport',
    ruleClass: 'vpn',
    order: 4,
    documented: true,
  },
  {
    // The vendor hole. Brenmark's engineers dial into the press line's PLC to
    // read fault codes, and it has been open since the line was commissioned.
    // It is on nobody's list because the person who agreed it left in 2019.
    id: 'service:ard-fw-01/vpn-brenmark',
    name: 'Vendor tunnel: Brenmark press line PLC support (IPsec, 2019)',
    short: 'vpn-brenmark',
    ruleClass: 'vpn',
    order: 5,
    documented: false,
    screamTicket: ARDEN_SCREAM_TICKETS.vendorTunnel,
  },
  {
    // The pilot that never ended. The goods-in scanners were trialled on a
    // hosted service that calls back inbound; the trial finished, the scanners
    // stayed, and the rule stayed with them.
    id: 'service:ard-fw-01/nat-scanners',
    name: 'NAT 5601 inbound -> goods-in scanner callback (pilot, never removed)',
    short: 'nat-scanners',
    ruleClass: 'nat',
    order: 6,
    documented: false,
    screamTicket: ARDEN_SCREAM_TICKETS.scanners,
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
    addNode(ops, accountNode(
      member.account,
      member.username,
      member.customer,
      member.licence,
    ));
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
        // And which side of the co-managed RACI line this box is on (0.37.0),
        // written only where a map exists: absent everywhere else, which is
        // what keeps every other estate field for field what it was.
        ...(machine.raci === undefined
          ? {}
          : { [FIELDS.raciOwner]: machine.raci }),
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: machine.resolution ?? '1024x768',
        [FIELDS.pendingUpdates]: false,
        [FIELDS.processor]: machine.processor,
        [FIELDS.memory]: machine.memory,
        [FIELDS.diskFree]: machine.diskFree,
        // The two managed-Mac dimensions (0.32.0), written only where a box has
        // them: every other estate reads nothing and is byte-identical.
        ...(machine.mdmEnrolled === undefined
          ? {}
          : { [FIELDS.mdmEnrolled]: machine.mdmEnrolled }),
        ...(machine.screenRecording === undefined
          ? {}
          : { [FIELDS.tccScreenRecording]: machine.screenRecording }),
      },
    });
  }

  for (const machine of MACHINES) {
    // Unix boxes have no Windows drive to build, whichever family they are in.
    if (isUnixFamily(machine.os ?? MACHINE_OS.windows)) {
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
    // A machine with no local uplink is its site's anchor; its RMM tunnel
    // edge is laid AFTER the RMM box's own node below, because the engine
    // refuses an edge before both of its endpoints exist.
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

  // ELMWOOD-DENTAL's two named pieces of estate (0.14.0), seeded HEALTHY the way
  // every other named service is - the fault arrives with the ticket about it.
  //
  // The intraoral X-ray sensor: a USB device on the operatory workstation, on
  // and enumerating. Its ticket sets it powered-off ("not detected"), and the
  // fix is the reseat every dental practice knows - a device power-cycle here.
  addNode(ops, {
    id: MSP_IDS.elmwoodSensor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'DEXIS intraoral X-ray sensor (USB)',
      [FIELDS.type]: DEVICE_TYPES.sensor,
      [FIELDS.powered]: true,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.elmwoodSensor,
    to: MSP_IDS.elmwoodOperatory,
    kind: 'connected_to',
  });

  // The DEXIS imaging bridge: the integration that hands captured images from
  // DEXIS to the Dentrix chart. It runs on the practice server, seeded running -
  // the imaging-bridge ticket is an integration break a PMS update caused, and
  // its honest close is a vendor escalation (like the prod-down), so the service
  // itself is never wedged; it is real estate the ticket names and a tech reads.
  addNode(ops, {
    id: MSP_IDS.elmwoodImagingBridge,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'DEXIS Imaging Bridge',
      [FIELDS.serviceName]: 'DTXImagingBridge',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.elmwoodImagingBridge,
    to: MSP_IDS.elmwoodServer,
    kind: 'runs_on',
  });

  // MARLOWE-STUDIO's three named pieces of estate (0.32.0), all seeded HEALTHY
  // and none of them a fault: the volume the work is on, the units that serve
  // it, and the pool the creative suite is licensed out of.
  //
  // The project share is what every Mac in the studio has mounted, and it is
  // named with an SMB URL rather than a UNC path because that is what a Mac
  // shows you when you ask where a file is. It is estate the tickets talk
  // about; nothing in this version wedges it.
  addNode(ops, {
    id: MSP_IDS.marloweProjectShare,
    kind: 'share',
    fields: {
      [FIELDS.name]: 'Projects - live jobs',
      [FIELDS.path]: 'smb://marl-nas-01/projects',
    },
  });

  // What the NAS runs. Hand-seeded rather than taken from a role table, because
  // `file_server` in that table is a list of WINDOWS services and this box is a
  // Linux appliance serving SMB - the same reason Fettle & Crane's own box
  // carries its units by name.
  for (const unit of NAS_APPLIANCE_UNITS) {
    const id = unitIdOn(MSP_IDS.marloweNas, unit.unit);

    addNode(ops, { id, kind: 'unit', fields: unitNodeFields(unit) });
    addEdge(ops, { from: id, to: MSP_IDS.marloweNas, kind: 'runs_on' });
  }

  // The creative suite's seats: NAMED USER licensing, which is the whole of the
  // third ticket. A seat is attached to a person in the vendor's admin console,
  // not to a machine, and the studio's plan is fully subscribed - every seat it
  // pays for is held by somebody on the permanent staff. `seats_free: 0` is
  // therefore not a fault either: it is a company that bought exactly as many
  // seats as it has people, which is what every company does, and it is why the
  // freelancer whose term seat lapsed cannot simply be given one.
  //
  // Same shape as the probation shop's pool (an `appliance`: somebody else's
  // licence service answering over the wire, with a number on it and nothing to
  // restart) and a deliberately different lesson - there, a leaver was still
  // holding a seat and the fix was to take it back; here there is no stale seat
  // to reclaim and the honest move is to raise it.
  addNode(ops, {
    id: MSP_IDS.marloweSuiteSeats,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Creative suite seats (Named User)',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.serviceClass]: SERVICE_CLASSES.appliance,
      [FIELDS.seatsFree]: 0,
    },
  });

  // PENNINGTON-ACCT's practice system (E9, 0.37.0): the ledger and tax suite
  // the firm bills through, as the Windows service it is. Seeded RUNNING like
  // every other named service on this roster - the ticket about it wedges it -
  // and it is on Gil's box, which is the only fact about it that matters.
  addNode(ops, {
    id: MSP_IDS.penningtonPracticeApp,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Ledgerline Practice Suite',
      [FIELDS.serviceName]: 'LedgerlineSvc',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.penningtonPracticeApp,
    to: MSP_IDS.penningtonServer,
    kind: 'runs_on',
  });

  // ARDEN-MFG's edge (0.29.0): the ISP handoff, cabled into the OLD box, and
  // the rule set that box is enforcing. Seeded whole and seeded HEALTHY - there
  // is no fault here and there never was. The project is not a repair.
  addNode(ops, {
    id: MSP_IDS.ardenCircuit,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Vector Broadband fibre handoff (NTE), comms cabinet',
      [FIELDS.type]: DEVICE_TYPES.circuit,
      [FIELDS.powered]: true,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.ardenCircuit,
    to: MSP_IDS.ardenEdgeOld,
    kind: 'connected_to',
  });

  for (const rule of ARDEN_EDGE_RULES) {
    addNode(ops, {
      id: rule.id,
      kind: 'service',
      fields: {
        [FIELDS.name]: rule.name,
        [FIELDS.serviceName]: rule.short,
        [FIELDS.status]: SERVICE_STATUS.running,
        [FIELDS.startupType]: STARTUP_TYPES.automatic,
        [FIELDS.fwRuleProject]: ARDEN_EDGE_PROJECT,
        [FIELDS.fwRuleClass]: rule.ruleClass,
        [FIELDS.fwRuleOrder]: rule.order,
        [FIELDS.fwRuleDocumented]: rule.documented,
        // False rather than absent, and it matters: the staging gate asks the
        // engine for rules whose `fw_rule_migrated` EQUALS false, and equality
        // is the only match the assertion language has. A rule that carried the
        // field only once somebody had migrated it would be invisible to the
        // gate that is supposed to be waiting for it.
        [FIELDS.fwRuleMigrated]: false,
        ...(rule.screamTicket === undefined
          ? {}
          : { [FIELDS.fwRuleScreamTicket]: rule.screamTicket }),
      },
    });
    addEdge(ops, { from: rule.id, to: MSP_IDS.ardenEdgeOld, kind: 'runs_on' });
  }

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
    if (isUnixFamily(machine.os ?? MACHINE_OS.windows)) {
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

  // And the units on the unix boxes, from the table for their family and their
  // role - so Meridian's product fleet is real ahead of the tools that would
  // manage it, and refuses on OS and scope both when a helpdesk tech reaches
  // for it. A Mac's launchd jobs seed through the same loop and the same node
  // kind; only the table behind `baselineUnitsFor` differs.
  for (const machine of MACHINES) {
    const os = machine.os ?? MACHINE_OS.windows;

    if (!isUnixFamily(os)) {
      continue;
    }

    for (const unit of baselineUnitsFor(os, machine.role)) {
      const id = unitIdOn(machine.id, unit.unit);

      addNode(ops, { id, kind: 'unit', fields: unitNodeFields(unit) });
      addEdge(ops, { from: id, to: machine.id, kind: 'runs_on' });
    }
  }

  // Fettle & Crane's OWN infrastructure box (E6, Pass B): the MSP's internal
  // Linux server, seeded explicitly rather than through the customer MACHINES
  // table because it belongs to NO customer - it is the employer's own, the way
  // the player's desk is. It runs the client portal the shop and its customers
  // log into, HEALTHY at boot; the first-fix incident downs the portal unit. It
  // is on the same wire as the desk, so it is reachable and pingable, and its
  // units seed the same way every other Linux box's do.
  addNode(ops, {
    id: MSP_IDS.mspInfraServer,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'FC-RMM-01',
      [FIELDS.machineRole]: MACHINE_ROLES.appServer,
      [FIELDS.machineOs]: MACHINE_OS.linux,
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '1024x768',
      [FIELDS.pendingUpdates]: false,
      [FIELDS.processor]: 'A cloud instance running Fettle & Crane\'s own tooling',
      [FIELDS.memory]: '8 GB',
      // A modest 40 GB root, mostly used - what df -h reads and a later
      // disk-full incident would be about.
      [FIELDS.diskFree]: 6_442_450_944,
    },
  });
  addEdge(ops, {
    from: MSP_IDS.mspInfraServer,
    to: MSP_IDS.playerMachine,
    kind: 'connected_to',
  });

  // The RMM tunnel. Every managed site's anchor (the machine with no local
  // uplink) reaches the desk through the RMM box - the same wire Remote
  // Assist and the monitoring board already ride; a desk that can take over
  // a customer's screen but whose ping times out would be lying in one of
  // the two places. Until 0.32.0 nothing ever pinged a customer box, so
  // every customer estate was a graph island and nobody knew.
  for (const machine of MACHINES) {
    if (machine.wiredTo === undefined && machine.customer !== undefined) {
      addEdge(ops, {
        from: machine.id,
        to: MSP_IDS.mspInfraServer,
        kind: 'connected_to',
      });
    }
  }

  for (const unit of FC_INFRA_UNITS) {
    const id = unitIdOn(MSP_IDS.mspInfraServer, unit.unit);

    addNode(ops, { id, kind: 'unit', fields: unitNodeFields(unit) });
    addEdge(ops, { from: id, to: MSP_IDS.mspInfraServer, kind: 'runs_on' });
  }

  return ops;
}

/**
 * The estate the onboarding event stands up mid-week (0.13.0): TILLMAN-FREIGHT,
 * the small trades business the MSP has just signed and taken on undocumented.
 *
 * Deliberately NOT part of `mspSetup()`: it is applied at the event minute
 * (`onboarding.ts`, the day driver's `applyOnboardings`) exactly the way a change
 * request or a dripped ticket is added mid-day - a runtime `applySetup` a save
 * then serialises whole - so at Monday boot the customer is absent and the MSP
 * world is byte-identical to 0.12.0 until the day it signs.
 *
 * It builds the customer, its one contact, two workstations and a server the
 * same way `mspSetup` builds every other estate: real baseline services off the
 * role table, real drives, real edges. The one hand-added service is the backup
 * on the server, and it is the whole point of the arc - `status: running` (the
 * job reports success and the screen is green) beside `backup_verified: false`
 * (it has not produced a restorable backup in months). That is the silent
 * failure a discovery audit finds and a monitoring board that reads only status
 * would not: a real state on a real node, not a printed string.
 */
export function mspOnboardingSetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];

  addNode(ops, {
    id: MSP_CUSTOMERS.tillman,
    kind: 'customer',
    fields: {
      [FIELDS.name]: 'TILLMAN-FREIGHT',
      [FIELDS.customerBusinessType]: BUSINESS_TYPES.trades,
      // Fully-managed: the MSP is taking over their whole IT, which is why the
      // honest onboarding move on what discovery finds is to RAISE it, not to
      // shrug it off as somebody else's box.
      [FIELDS.customerServiceScope]: SERVICE_SCOPES.fullyManaged,
      [FIELDS.customerSlaTier]: SLA_TIERS.silver,
    },
  });

  // Glenda runs the office and files the ticket; her account carries the
  // customer id like every other customer's staff, so an action aimed at it
  // runs the same scope + tenant pre-flight.
  addNode(ops, {
    id: MSP_IDS.tillmanContact,
    kind: 'person',
    fields: {
      [FIELDS.name]: 'Glenda Tillman',
      [FIELDS.title]: 'Office Manager, Tillman Freight',
      [FIELDS.desk]: 'The front office of a haulage yard, where the IT is a '
        + 'server in the stationery cupboard nobody has opened in years',
    },
  });
  addNode(ops, accountNode(
    MSP_IDS.tillmanContactAccount,
    'gtillman',
    MSP_CUSTOMERS.tillman,
  ));
  addEdge(ops, {
    from: MSP_IDS.tillmanContact,
    to: MSP_IDS.tillmanContactAccount,
    kind: 'owns',
  });

  // The estate nobody wrote down: reception's PC, the yard-office PC, and the
  // server the backup runs on. Windows-only, small, and real.
  const machines: readonly MachineSeed[] = [
    {
      id: MSP_IDS.tillmanReception,
      hostname: 'TILL-WS-01',
      role: MACHINE_ROLES.workstation,
      customer: MSP_CUSTOMERS.tillman,
      owner: MSP_IDS.tillmanContact,
      wiredTo: MSP_IDS.tillmanServer,
      processor: 'A reception desktop that also runs the haulage booking system',
      memory: '8 GB',
      diskFree: 96_636_764_160,
    },
    {
      id: MSP_IDS.tillmanYardPc,
      hostname: 'TILL-WS-02',
      role: MACHINE_ROLES.workstation,
      customer: MSP_CUSTOMERS.tillman,
      wiredTo: MSP_IDS.tillmanServer,
      processor: 'A shared PC in the yard office, older than the newest lorry',
      memory: '8 GB',
      diskFree: 128_849_018_880,
    },
    {
      id: MSP_IDS.tillmanServer,
      hostname: 'TILL-SRV-01',
      role: MACHINE_ROLES.fileServer,
      customer: MSP_CUSTOMERS.tillman,
      processor: 'The one server: file shares, the booking database, and a '
        + 'backup job somebody set up once and left',
      memory: '16 GB',
      diskFree: 171_798_691_840,
    },
  ];

  for (const machine of machines) {
    addNode(ops, {
      id: machine.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: machine.hostname,
        [FIELDS.machineRole]: machine.role,
        [FIELDS.machineOs]: machine.os ?? MACHINE_OS.windows,
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

  for (const machine of machines) {
    const owner = STAFF.find((member) => member.person === machine.owner)
      ?? (machine.owner === MSP_IDS.tillmanContact
        ? { username: 'gtillman' }
        : undefined);

    ops.push(...driveSetup({
      machineId: machine.id,
      hostname: machine.hostname,
      role: machine.role,
      ...(owner === undefined ? {} : { ownerUsername: owner.username }),
    }));
  }

  for (const machine of machines) {
    if (machine.owner !== undefined) {
      addEdge(ops, { from: machine.owner, to: machine.id, kind: 'owns' });
    }

    if (machine.wiredTo !== undefined) {
      addEdge(ops, { from: machine.id, to: machine.wiredTo, kind: 'connected_to' });
    } else {
      // The RMM tunnel, same rule as the seeded estates: standing a customer
      // up includes deploying the agent, so the site's anchor reaches the
      // desk from the day it is onboarded.
      addEdge(ops, {
        from: machine.id,
        to: MSP_IDS.mspInfraServer,
        kind: 'connected_to',
      });
    }

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

  // The horror, seeded as the estate fact it is. The service is Windows Server
  // Backup (`wbengine`, the real service name), it is RUNNING and set to start
  // automatically - green on any board that reads status - and it has not
  // verified a restore since last November. `backup_verified: false` is the
  // whole failing state; flip it true and the box is genuinely safe, which is
  // what gives the audit's finding its teeth.
  addNode(ops, {
    id: MSP_IDS.tillmanBackup,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Backup Service',
      [FIELDS.serviceName]: 'wbengine',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
      [FIELDS.backupVerified]: false,
      [FIELDS.backupLastSuccess]: '2025-11-09',
    },
  });
  addEdge(ops, {
    from: MSP_IDS.tillmanBackup,
    to: MSP_IDS.tillmanServer,
    kind: 'runs_on',
  });

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
  /**
   * Whether this person is holding one of the seats their employer bought
   * (0.32.0). Written only where a licence pool exists to hold seats against -
   * the creative agency - so every other account in this world is the account
   * it has always been, field for field.
   */
  licence?: boolean,
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
      ...(licence === undefined ? {} : { [FIELDS.licence]: licence }),
    },
  };
}
