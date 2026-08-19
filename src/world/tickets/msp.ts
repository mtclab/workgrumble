/**
 * The MSP employer's REAL per-vertical queue (0.8.0, Pass B).
 *
 * Pass A shipped the customer MODEL and the scope mechanic on three skeleton
 * lockouts. This is the content those rails were built for: ten characteristic
 * tickets, each drawn from the vertical research (docs/design/msp-arc.md), each
 * landing on the correct customer's estate, each carrying its TRUE scope so the
 * Pass A engine is exercised by real work rather than by a fixture.
 *
 *  - FONTAINE-LAW (law firm, helpdesk): a document-management check-out deadlock
 *    (iManage), a matter-workspace access request (ethical-wall care), and the
 *    tense one - an e-filing deadline where CM/ECF has bounced the PDF. All
 *    workstation/user/share scope, so the desk CAN work them.
 *  - MERIDIAN-SAAS (saas, helpdesk): an Okta SSO login loop, an offboarding
 *    access-gap, an MFA lockout - all identity, all in scope - and one that DRAWS
 *    the player onto the Linux product fleet, where the only honest move is to be
 *    refused (OS + contract both) and escalate. That last one is the compose case
 *    the 0.7.0 refusals and the 0.8.0 scope refusals stack on.
 *  - NORTHWIND-CLINIC (monitoring-only): three alerts - a failed backup, an
 *    expiring certificate, a full disk - the player may only ACKNOWLEDGE and
 *    ESCALATE. Their resolution rule IS escalation; a player who reaches to FIX
 *    one is refused, truthfully, by the monitoring-only scope engine.
 *
 * Every fix path is a REAL fix and names REAL systems; every KB article it points
 * at is true (src/world/kb/articles.ts). Nothing here invents engine state: the
 * verbs are the shipped helpdesk set, chosen to match the real remediation, and
 * where the truest real fix is an admin unlock or a released lock the estate
 * models it as the graph fact it is (a stale membership, a checked-out group).
 */

import {
  FS_ACTIONS,
  FS_GROUP_PARAM,
  FS_MODE_PARAM,
  FS_OWNER_PARAM,
  HELPDESK_ACTIONS,
  INCIDENT_ACTIONS,
  INCIDENT_DISK_FREE_LOW,
  INCIDENT_JOURNAL_BYTES,
  JOURNAL_VACUUM_TARGET,
  SYSTEMD_ACTIONS,
} from '../actions';
import {
  FIELDS,
  LOCKOUT_THRESHOLD,
  SERVICE_STATUS,
  SYSTEMD_STATES,
  UNIT_ENABLEMENTS,
} from '../fields';
import {
  fsEntryId,
  myDocumentsDirId,
  TEMP_SEGMENTS,
  tempDirId,
} from '../filesystem';
import { mspMachineHostname, MSP_IDS } from '../msp-company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { baselineServiceId } from '../services';
import { PROJECT_TICKETS } from './project';
import { POOL_MSP_TICKETS } from './pool-msp';
import { SCOPE_ASK_TICKETS } from './scope-asks';
import type { WorldTicket } from './types';

/* -- FONTAINE-LAW: a Windows-only law firm on a helpdesk contract --------- */

/**
 * The iManage check-out deadlock. A partner closed the document management
 * client the wrong way - shut the laptop lid on it - and the deposition he had
 * open is still marked checked out TO HIM, read-only to everyone else. A
 * paralegal with a hearing tomorrow cannot edit it.
 *
 * The fix is the real one: an administrator releases the stale check-out. In the
 * estate that lock is exactly what it is in iManage - a hold one user has on the
 * document - modelled as the partner's membership of the document's checked-out
 * set, so releasing it is removing the stale holder. It is helpdesk-scope work
 * on a user and a document, not a touch of a server.
 */
const CHECKOUT_DEADLOCK: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.fontainePartnerAccount,
    MSP_IDS.fontaineCheckoutLock,
    MSP_IDS.fontaineWorkstation,
  ],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:fontaine-checkout-deadlock',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Fontaine: nobody can edit the Rossiter deposition',
      body:
        'Nadia reports that the Rossiter v Atlas deposition is stuck read-only '
        + 'in iManage. A paralegal with a hearing tomorrow cannot check it out - '
        + 'the system says Marcus already has it, and Marcus does not: he closed '
        + 'his laptop on Friday with it open and has been in court since. It is '
        + 'checked out to a man who is not there.',
    },
    reporter: MSP_IDS.fontaineContact,
    // The stale hold arrives with the ticket, the way every fault in this roster
    // does: the partner still holds the document, which is why nobody else can.
    setup: [
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.fontainePartnerAccount,
          to: MSP_IDS.fontaineCheckoutLock,
          kind: 'member_of',
        },
      },
    ],
    // Closed when the stale check-out is released - the document is no longer
    // held by the man who is not there.
    resolved_when: {
      op: 'not',
      expr: {
        op: 'edge',
        from: { id: MSP_IDS.fontainePartnerAccount },
        to: { id: MSP_IDS.fontaineCheckoutLock },
        kind: 'member_of',
      },
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/document-checkout-lock',
  },
  cause: 'iManage marks a document checked out to whoever has it open, and a '
    + 'client that closes uncleanly never releases the lock. Marcus\'s hold has '
    + 'simply never been given back; an administrator releasing it is the whole '
    + 'of the fix, and restoring anything or restarting anything would be neither '
    + 'here nor there.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'release-the-checkout',
      app: 'directory',
      label: 'Release Marcus\'s stale check-out on the deposition (iManage '
        + 'Control Center)',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: MSP_IDS.fontainePartnerAccount,
          params: { group: MSP_IDS.fontaineCheckoutLock },
        },
      ],
    },
  ],
};

/**
 * The matter-workspace access request. A new associate started Monday and cannot
 * open the Delacroix estate matter - she is not in its security group. This is
 * the everyday grant, with the one thing a law firm adds to it: the ethical
 * wall. Erin is not screened off Delacroix (Nadia has checked the conflicts
 * system before raising it), so the grant is clean; the job is to make it, not
 * to invent a wall that is not there.
 */
const MATTER_ACCESS: WorldTicket = {
  arrival: 'morning',
  nodes: [
    MSP_IDS.fontaineNewHireAccount,
    MSP_IDS.fontaineMatterShare,
    MSP_IDS.fontaineWorkstation,
  ],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:fontaine-matter-access',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Fontaine: new associate cannot open the Delacroix matter',
      body:
        'Nadia reports that Erin, who started this morning, has been staffed on '
        + 'the Delacroix estate matter and cannot see the workspace at all. Nadia '
        + 'adds - unprompted, and correctly - that she has already checked the '
        + 'conflicts system: there is no ethical wall on this one, so Erin is '
        + 'clear to be added.',
    },
    reporter: MSP_IDS.fontaineContact,
    // Nothing is broken and nothing is seeded: the fault is the absence of a
    // grant, exactly as the licence and mailbox requests are.
    setup: [],
    // Closed when the new associate can reach the matter workspace.
    resolved_when: {
      op: 'edge',
      from: { id: MSP_IDS.fontaineNewHireAccount },
      to: { id: MSP_IDS.fontaineMatterShare },
      kind: 'has_access',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/matter-workspace-access',
  },
  cause: 'She has never been granted it. A matter workspace is a security group '
    + 'on the document system, membership is per matter because the ethical wall '
    + 'is, and a new starter is in none of them until somebody who has checked '
    + 'the conflicts puts her in the right ones.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'grant-matter-access',
      app: 'directory',
      label: 'Add Erin to the Delacroix matter workspace',
      steps: [
        {
          action: HELPDESK_ACTIONS.shareGrantAccess,
          target: MSP_IDS.fontaineMatterShare,
          params: { account: MSP_IDS.fontaineNewHireAccount },
        },
      ],
    },
  ],
};

/* -- the e-filing deadline: the tense law-firm headline ------------------- */

/** The correct filing, in the wrong place, on the front-office workstation. */
const EFILING_PDF = fsEntryId(
  MSP_IDS.fontaineWorkstation,
  [...TEMP_SEGMENTS, 'ROSSITER-MSJ-FINAL.PDF'],
  'file',
);
const EFILING_TEMP = tempDirId(MSP_IDS.fontaineWorkstation);
const EFILING_DOCS = myDocumentsDirId(MSP_IDS.fontaineWorkstation, 'nfontaine');

/**
 * What the good file has in it, so a tech can prove it is the right one - the
 * flattened, OCR'd, unsecured PDF/A - before moving anything. It is the whole
 * reason a court-ready PDF is worth reading the header of.
 */
const EFILING_TEXT = [
  'ROSSITER v ATLAS - MOTION FOR SUMMARY JUDGMENT',
  'US District Court, filed via CM/ECF',
  '',
  'PDF/A-1b   |   Text layer: PRESENT (OCR)   |   Security: NONE',
  '',
  'This is the flattened copy the paralegal exported for filing.',
  'The one the system keeps rejecting is the DRAFT print - it has',
  'document security set and no text layer, which is why CM/ECF',
  'bounced it: "PDF document is malformed or contains security',
  'settings that prevent it from being processed."',
].join('\n');

/**
 * The e-filing deadline panic. An attorney is trying to file a motion before the
 * court's cutoff and CM/ECF keeps rejecting the PDF. The court does not excuse
 * filer-side failures, so this is genuinely high-severity - the tense headline
 * of the law-firm week.
 *
 * The rejection cause is a real one: the file being uploaded is the DRAFT print,
 * which carries document-security restrictions and has no OCR text layer, and
 * CM/ECF refuses it. The paralegal already produced the acceptable copy - a
 * flattened, OCR'd PDF/A - but the "Save As PDF/A" export dropped it into the
 * temp directory the way an opened attachment lands there, and it never made it
 * to the folder the CM/ECF upload dialog points at. The desk's job under the
 * clock is to prove which file is the right one and put it where the filing goes.
 */
const EFILING_PANIC: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.fontaineWorkstation, MSP_IDS.fontaineContactAccount],
  // A statutory deadline the court will not move, minutes out. This is the one
  // ticket on the law-firm desk that is exactly as urgent as it is claimed.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:fontaine-efiling',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Fontaine: CM/ECF keeps rejecting the filing and it is due at noon',
      body:
        'Nadia is on the line for a partner who cannot file the Rossiter summary '
        + 'judgment motion. CM/ECF rejects the upload every time - "malformed or '
        + 'contains security settings" - and the filing is due at noon, which the '
        + 'court will not move for an IT problem. The paralegal insists she made '
        + 'a proper PDF/A earlier; nobody can find it, and the draft they keep '
        + 'uploading is the one being bounced.',
    },
    reporter: MSP_IDS.fontaineContact,
    // The right file, written into TEMP by the export dialog and never moved.
    setup: [
      {
        op: 'addNode',
        node: {
          id: EFILING_PDF,
          kind: 'file',
          fields: {
            [FIELDS.name]: 'ROSSITER-MSJ-FINAL.PDF',
            [FIELDS.modified]: '09/06/2025  10:41',
            [FIELDS.volume]: mspMachineHostname(MSP_IDS.fontaineWorkstation),
            [FIELDS.content]: EFILING_TEXT,
          },
        },
      },
      {
        op: 'addEdge',
        edge: { from: EFILING_TEMP, to: EFILING_PDF, kind: 'contains' },
      },
    ],
    // Closed when the acceptable copy is where the upload dialog is pointed - in
    // the filer's own documents, out of the temp directory nobody looks in.
    resolved_when: {
      op: 'edge',
      from: { id: EFILING_DOCS },
      to: { id: EFILING_PDF },
      kind: 'contains',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6 },
    kb_ref: 'kb/e-filing-pdf-rejected',
  },
  cause: 'CM/ECF rejected the draft because it had document security set and no '
    + 'text layer - a real and common e-filing failure. The acceptable copy, the '
    + 'flattened OCR\'d PDF/A the paralegal exported, is sitting in WINDOWS\\TEMP '
    + 'where the Save As dialog left it, and the upload dialog is pointed at My '
    + 'Documents. Nothing is broken; the right file is one move from where it is '
    + 'needed.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'place-the-court-ready-pdf',
      app: 'cmd',
      label: 'Move the flattened PDF/A out of TEMP into the filer\'s documents',
      steps: [
        {
          action: HELPDESK_ACTIONS.fileMove,
          target: EFILING_PDF,
          params: { from: EFILING_TEMP, to: EFILING_DOCS },
        },
      ],
    },
  ],
};

/* -- MERIDIAN-SAAS: a SaaS shop, helpdesk, the Linux prod out of reach ---- */

/**
 * The Okta SSO login loop. IT swapped the CRM's SSO integration over the
 * weekend, and the new app assignment did not carry everyone across: an engineer
 * clicks the tile and Okta bounces her straight back to the dashboard, over and
 * over, because she is not in the group the new app grants access from. The fix
 * is to restore her app assignment - add her to the Okta group behind it.
 */
const SSO_LOGIN_LOOP: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.meridianDevAccount, MSP_IDS.meridianAppGroup, MSP_IDS.meridianLaptop],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:meridian-app-assignment',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Meridian: Salesforce SSO just bounces Dana back to the dashboard',
      body:
        'Theo reports that after the weekend\'s SSO change, Dana clicks the '
        + 'Salesforce tile in Okta and lands straight back on the Okta '
        + 'dashboard - no error, no login, just a loop. Everyone else on her '
        + 'team is fine. The product servers are fine too, he adds, which is '
        + 'true and is not something the desk could touch if they were not.',
    },
    reporter: MSP_IDS.meridianContact,
    // The assignment that did not carry across is simply not there; the loop is
    // the absence of it. Nothing seeded, like every missing-grant ticket.
    setup: [],
    // Closed when her app assignment is back - she is in the group the new
    // integration grants from.
    resolved_when: {
      op: 'edge',
      from: { id: MSP_IDS.meridianDevAccount },
      to: { id: MSP_IDS.meridianAppGroup },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/okta-app-assignment',
  },
  cause: 'The weekend migration rebuilt the Salesforce app on a new group-based '
    + 'assignment and Dana was not carried into the group. Okta will authenticate '
    + 'her and then find she has no assignment to the app, so it returns her to '
    + 'the dashboard - which looks like a loop and is really a missing membership.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'restore-app-assignment',
      app: 'directory',
      label: 'Add Dana to the Okta Salesforce Users group',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: MSP_IDS.meridianDevAccount,
          params: { group: MSP_IDS.meridianAppGroup },
        },
      ],
    },
  ],
};

/**
 * The offboarding access-gap. A contractor's engagement ended in April and the
 * deprovisioning stopped one step short: he is still in the Production Admins
 * group in Okta, which is access a person who no longer works here should not
 * have. Nothing is on fire; it is the quiet security finding that offboarding
 * is supposed to close and did not. The fix is to remove the lingering
 * membership.
 */
const OFFBOARDING_GAP: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.meridianContractorAccount,
    MSP_IDS.meridianProdAdmins,
    MSP_IDS.meridianLaptop,
  ],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:meridian-offboarding',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Meridian: a contractor who left in April is still a Prod Admin',
      body:
        'Theo has been through the Okta access review and found Rafiq - whose '
        + 'contract ended in April - still in the Production Admins group. He is '
        + 'gone, the account was never fully offboarded, and the membership is '
        + 'exactly the access review that turned it up says it is: a person who '
        + 'does not work here who can still reach production.',
    },
    reporter: MSP_IDS.meridianContact,
    // The lingering membership arrives with the ticket that is about it.
    setup: [
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.meridianContractorAccount,
          to: MSP_IDS.meridianProdAdmins,
          kind: 'member_of',
        },
      },
    ],
    // Closed when the leaver is out of the group he should never still be in.
    resolved_when: {
      op: 'not',
      expr: {
        op: 'edge',
        from: { id: MSP_IDS.meridianContractorAccount },
        to: { id: MSP_IDS.meridianProdAdmins },
        kind: 'member_of',
      },
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/offboarding-access-gap',
  },
  cause: 'Offboarding disabled the account and stopped there. Group memberships '
    + 'are not removed by disabling somebody - nothing removes them until a '
    + 'person does - so the leaver\'s access to the production admin group has '
    + 'simply outlived the leaver, which is the whole of the finding.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'revoke-lingering-access',
      app: 'directory',
      label: 'Remove Rafiq from the Okta Production Admins group',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: MSP_IDS.meridianContractorAccount,
          params: { group: MSP_IDS.meridianProdAdmins },
        },
      ],
    },
  ],
};

/**
 * The MFA lockout. An analyst mistyped her way past the threshold on a Monday
 * and her identity account is locked. It is the same skill the probation shop
 * teaches on an Active Directory lockout - a lockout is a lockout in any
 * directory - said true to the estate it happens in: an Okta account, locked by
 * failed attempts, unlocked from the admin console.
 */
const MFA_LOCKOUT: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.meridianAnalystAccount, MSP_IDS.meridianLaptop],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:meridian-mfa-lockout',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Meridian: Nora is locked out of everything after a bad Monday',
      body:
        'Theo reports that Nora cannot get into anything - the authenticator '
        + 'stopped taking the code it was generating, she tried a few more '
        + 'times, and now Okta has locked the account outright. She has a '
        + 'client call at ten. The product fleet is fine, he says, which it is.',
    },
    reporter: MSP_IDS.meridianContact,
    // The lockout arrives with the ticket: the failed run and the shut door.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.meridianAnalystAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: MSP_IDS.meridianAnalystAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: MSP_IDS.meridianAnalystAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    // Closed when the account is unlocked - the door is open again.
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.meridianAnalystAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/sso-mfa-lockout',
  },
  cause: 'A run of failed sign-ins tripped Okta\'s lockout, exactly as it is '
    + 'meant to. An identity user at a helpdesk customer - the desk unlocks it '
    + 'from the admin console, and whether the authenticator itself needs a '
    + 'reset afterwards is the next question, not this one.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'unlock-nprice',
      app: 'cmd',
      label: 'Unlock the account for nprice',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: MSP_IDS.meridianAnalystAccount,
        },
      ],
    },
  ],
};

/**
 * The Linux prod draw - the compose case, made content.
 *
 * The product is down and the ticket points straight at MERI-APP-01, the Linux
 * application server. Every instinct says restart the app or the web server, and
 * every instinct is wrong here on BOTH counts: it is a SERVER (out of the
 * helpdesk contract) and it is Linux (a Windows stop control does not reach a
 * systemd unit). The only honest ending is to be refused and escalate to the
 * customer's own infrastructure team - which is what the resolution rule accepts
 * and the fix path does. The refusal itself is proven, on real content, by
 * `msp-scope.test.ts`.
 */
const PROD_DOWN_ESCALATE: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.meridianAppServer, MSP_IDS.meridianDbServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:meridian-prod-down',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Meridian: the product is down - "just restart the app server?"',
      body:
        'Theo reports the product is throwing 502s and customers are noticing. '
        + 'He asks, reasonably, whether the desk can "just bounce the app '
        + 'server" - MERI-APP-01. It is the product\'s Linux box, it is a '
        + 'server, and it is under the customer\'s own infrastructure team on '
        + 'this contract: reaching into it is out of scope on OS and contract '
        + 'both, and the job is to raise it fast to the people whose it is.',
    },
    reporter: MSP_IDS.meridianContact,
    setup: [],
    // The only honest ending: escalate. Remediation on the prod fleet is out of
    // reach on both counts, so escalation is not a fallback here - it is the job.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:meridian-prod-down' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/msp-scope-escalation',
  },
  cause: 'The product is down on a Linux server the MSP does not manage under a '
    + 'helpdesk contract. There is nothing here a Tier-1 Windows tech may - or '
    + 'even could - do to it; the fast, correct move is a clean escalation to '
    + 'the customer\'s infrastructure team with what is known.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'escalate-prod-to-infra',
      app: 'tickets',
      label: 'Escalate it: prod is out of scope on OS and contract both',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:meridian-prod-down',
          params: {
            reported: 'Product returning 502s; customer-visible outage.',
            tried:
              'Confirmed MERI-APP-01 is the Linux prod app server\n'
              + 'Checked scope: helpdesk contract, servers out of reach - not '
              + 'the desk\'s to touch',
          },
        },
      ],
    },
  ],
};

/* -- NORTHWIND-CLINIC: monitoring-only, escalate-and-mean-it -------------- */

/**
 * The backup-failed alert, and the gap behind it.
 *
 * The board goes red because last night's backup job failed. The honest end is
 * escalation - Northwind is monitoring-only, remediation is out of contract - and
 * a player who reaches to restart the backup service is refused. But the article
 * this points at says the harder truth the alert only half-tells: a backup job
 * reporting success is not the same as a restorable backup, and monitoring the
 * JOB is not testing the RESTORE. Raising it correctly is the whole of the job.
 */
const BACKUP_ALERT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindServer, MSP_IDS.northwindBackup],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:northwind-backup-alert',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Northwind: backup job FAILED on NW-SRV-01',
      body:
        'The monitoring board is red on NW-SRV-01: last night\'s backup job '
        + 'failed outright. Northwind is a monitoring-only account - the MSP '
        + 'watches this box and no more - so the job is to acknowledge it and '
        + 'raise it to whoever does their fixes, not to reach in and restart '
        + 'the backup service.',
    },
    reporter: MSP_IDS.northwindContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.northwindBackup,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:northwind-backup-alert' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/backup-verification-gap',
  },
  cause: 'The backup service wedged and the job failed. On a monitoring-only '
    + 'contract the fix is out of scope; acknowledging and escalating IS the '
    + 'job - and it is worth doing loudly, because a monitoring that watches the '
    + 'job and never tests a restore is one green tick away from a backup nobody '
    + 'can actually restore from.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-backup',
      app: 'tickets',
      label: 'Escalate it: monitoring-only, remediation is not contracted',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:northwind-backup-alert',
          params: {
            reported: 'Backup job failed overnight on NW-SRV-01 (monitoring '
              + 'alert).',
            tried:
              'Confirmed the failure on the board\n'
              + 'Checked the contract: monitoring-only, remediation out of scope',
          },
        },
      ],
    },
  ],
};

/**
 * The certificate-expiry threshold alert. The clinic portal's TLS certificate is
 * days from expiry and the board has flagged it. On a monitoring-only contract
 * the renew is not the desk's to do - a player who reaches for it is refused - so
 * the winnable move is to raise it before it expires, which is the entire value
 * of watching a threshold rather than an outage.
 */
const CERT_ALERT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindServer, MSP_IDS.northwindPortal],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:northwind-cert-alert',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Northwind: TLS certificate on the clinic portal expiring',
      body:
        'The board has flagged the clinic portal on NW-SRV-01: its TLS '
        + 'certificate is inside the expiry threshold and counting down. '
        + 'Northwind is monitoring-only, so renewing it is not the MSP\'s to '
        + 'do - the point of the alert is to raise it in time for the people '
        + 'who can, before the day it expires and the whole portal starts '
        + 'refusing patients.',
    },
    reporter: MSP_IDS.northwindContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.northwindPortal,
        field: FIELDS.certExpired,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:northwind-cert-alert' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/monitoring-only-alerts',
  },
  cause: 'The portal\'s certificate is near expiry - a threshold the monitoring '
    + 'exists to catch early. Renewing it is real work, but not work this '
    + 'contract covers; raising it with enough runway that it never actually '
    + 'expires is exactly what a monitoring-only account is paying for.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-cert',
      app: 'tickets',
      label: 'Escalate it: monitoring-only, the renew is not contracted',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:northwind-cert-alert',
          params: {
            reported: 'Clinic portal TLS certificate inside the expiry '
              + 'threshold on NW-SRV-01.',
            tried:
              'Confirmed the expiry date on the board\n'
              + 'Checked the contract: monitoring-only, renewal out of scope',
          },
        },
      ],
    },
  ],
};

/**
 * The disk-full threshold alert. NW-SRV-01 has crossed its low-space threshold.
 * On any other customer this is a directory to empty; here it is an alert to
 * raise, because the contract is watch-and-notify and clearing space on the box
 * is out of scope. The winnable move is escalation, before the disk fills the
 * rest of the way and the server stops doing anything at all.
 */
const DISK_ALERT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindServer],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:northwind-disk-alert',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Northwind: NW-SRV-01 crossed its low-disk threshold',
      body:
        'The board is amber on NW-SRV-01: free space has dropped below the '
        + 'threshold and is still falling. It is a file server, it is monitoring-'
        + 'only, and clearing space on it is not the MSP\'s to do - the job is to '
        + 'raise it now, while there is still room to raise it in, rather than '
        + 'the morning it fills and everything on the box stops.',
    },
    reporter: MSP_IDS.northwindContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.northwindServer,
        field: FIELDS.diskFree,
        value: 1_073_741_824,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:northwind-disk-alert' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/monitoring-only-alerts',
  },
  cause: 'The server is low on disk and dropping. Emptying anything on it is '
    + 'real remediation and out of a monitoring-only contract; the value the '
    + 'account bought is the early warning, and spending it means escalating '
    + 'while there is still headroom, not after.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-disk',
      app: 'tickets',
      label: 'Escalate it: monitoring-only, clearing space is not contracted',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:northwind-disk-alert',
          params: {
            reported: 'NW-SRV-01 below its low-disk threshold and falling '
              + '(monitoring alert).',
            tried:
              'Confirmed free space on the board\n'
              + 'Checked the contract: monitoring-only, remediation out of scope',
          },
        },
      ],
    },
  ],
};

/* -- HOLLOWAY-ACCT: a small practice, fully-managed, whole estate in reach --- */

/** The DFS service the practice's shared S: drive maps through, on their server. */
const HOLLOWAY_DFS = baselineServiceId(MSP_IDS.hollowayFileServer, 'Dfs');

/**
 * The shared-drive outage - the server fix a helpdesk contract would REFUSE, in
 * scope here because the contract is fully-managed.
 *
 * The whole practice maps its client folders through a DFS namespace on
 * HOLL-SRV-01, and the Distributed File System service on that server has
 * wedged: the S: drive is there but nothing under it resolves, so nobody can
 * open a client file. The fix is the real one - restart the wedged service on
 * the server - and it is the exact move the scope engine refuses at FONTAINE-LAW
 * (a server, out of a helpdesk contract). At HOLLOWAY-ACCT the MSP IS the IT
 * department, so the wall is simply not there: this is the contrast the tier
 * teaches, proven end to end in `msp-scope.test.ts`.
 */
const SHARED_DRIVE_DOWN: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.hollowayFileServer, MSP_IDS.hollowayWorkstation],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:holloway-shared-drive',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Holloway: nobody can open anything on the S: drive',
      body:
        'Priya reports the whole office has lost the S: drive - the letter is '
        + 'still there but every client folder under it comes back empty or errors, '
        + 'and it is month-end. It is the Distributed File System on HOLL-SRV-01, '
        + 'their server. On a helpdesk contract that would be a wall; Holloway is '
        + 'fully-managed, so the server is the MSP\'s to fix, and the fix is to '
        + 'restart the wedged service.',
    },
    reporter: MSP_IDS.hollowayContact,
    // The DFS service wedges the way the spooler does: up, and not answering.
    setup: [
      {
        op: 'setField',
        id: HOLLOWAY_DFS,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    // Closed when the file system service is answering again and the shares
    // resolve.
    resolved_when: {
      op: 'eq',
      selector: { id: HOLLOWAY_DFS },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/dfs-namespace-down',
  },
  cause: 'The Distributed File System service on HOLL-SRV-01 wedged - the '
    + 'manager reports it running, the namespace it serves does not resolve, and '
    + 'the S: drive maps straight through it. Restarting the service on the '
    + 'server clears it. At a helpdesk customer this is out of contract and the '
    + 'move is to escalate; here the MSP owns the server, so the fix is the fix.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'restart-dfs-on-the-server',
      app: 'cmd',
      label: 'Restart the Distributed File System service on HOLL-SRV-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: HOLLOWAY_DFS,
        },
      ],
    },
  ],
};

/** The Print Spooler on the reception workstation, the everyday helpdesk fix. */
const HOLLOWAY_SPOOLER = baselineServiceId(
  MSP_IDS.hollowayWorkstation,
  'Spooler',
);

/**
 * The workstation issue - a wedged Print Spooler on the reception desktop. It is
 * the same everyday fix a helpdesk contract covers everywhere, sitting beside
 * the server fix above precisely to make the point: fully-managed is not a
 * different KIND of work, it is the SAME work with no wall in front of the
 * server half of it.
 */
const HOLLOWAY_SPOOLER_TICKET: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.hollowayWorkstation],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:holloway-spooler',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Holloway: the reception PC will not print, jobs just pile up',
      body:
        'Priya cannot print from the reception workstation - jobs sit in the '
        + 'queue and nothing comes out. The Print Spooler on HOLL-WS-01 has '
        + 'wedged: it reports running and answers nobody, which is the one status '
        + 'a spooler earns its own paragraph for. Restart it and the queue drains.',
    },
    reporter: MSP_IDS.hollowayContact,
    setup: [
      {
        op: 'setField',
        id: HOLLOWAY_SPOOLER,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: HOLLOWAY_SPOOLER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The Print Spooler wedged - running, and not accepting or releasing a '
    + 'job. It is a workstation service the desk restarts, the same at a fully-'
    + 'managed customer as anywhere: the tier changes what the SERVER half of '
    + 'the estate lets you do, not this.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'restart-the-spooler',
      app: 'cmd',
      label: 'Restart the Print Spooler on HOLL-WS-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: HOLLOWAY_SPOOLER,
        },
      ],
    },
  ],
};

/**
 * The account issue - the bookkeeper locked out before the payroll run. A plain
 * lockout, unlocked from the desk, squarely in scope: the third of the practice
 * estate the fully-managed contract covers whole (a user, a workstation and a
 * server, none of them walled off).
 */
const HOLLOWAY_LOCKOUT: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.hollowayBookkeeperAccount, MSP_IDS.hollowayWorkstation],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:holloway-lockout',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Holloway: Gordon is locked out and payroll runs this morning',
      body:
        'Priya reports that Gordon, the bookkeeper, is locked out of his account '
        + 'and cannot get into the practice suite - and the payroll run is due '
        + 'this morning. He tried his password too many times after a long '
        + 'weekend. The desk unlocks it; it is a user, and users are helpdesk '
        + 'work at any tier.',
    },
    reporter: MSP_IDS.hollowayContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.hollowayBookkeeperAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: MSP_IDS.hollowayBookkeeperAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: MSP_IDS.hollowayBookkeeperAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.hollowayBookkeeperAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'A run of failed sign-ins tripped the lockout, exactly as it should. '
    + 'Unlocking the account is the whole of the fix - a user at a fully-managed '
    + 'customer is helpdesk work like any other, and nothing about this tier '
    + 'changes an unlock.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'unlock-gainsley',
      app: 'directory',
      label: 'Unlock the account for gainsley',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: MSP_IDS.hollowayBookkeeperAccount,
        },
      ],
    },
  ],
};

/* -- ARDEN-MFG: co-managed, coordinate-then-act ---------------------------- */

/**
 * The RACI hand-back - the one you must give BACK to their IT.
 *
 * A floor supervisor is locked out and the ticket landed in the MSP queue by
 * mistake (she mailed the wrong address). Under the co-managed split, day-to-day
 * user support is ARDEN's own IT's - the MSP covers after-hours, servers and
 * specialist work. Reaching in to reset her, even coordinated, poaches their
 * team's job and is exactly the "I thought you had it" double-work the contract
 * exists to avoid. The honest, RACI-correct move is to hand it back to Dev's
 * desk - so, like the prod-down escalation, the resolution rule IS the handoff.
 */
const ARDEN_LOCKOUT_HANDBACK: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.ardenSupervisorAccount, MSP_IDS.ardenWorkstation],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:arden-lockout-handback',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden: a floor supervisor is locked out - "can you reset her?"',
      body:
        'Dev forwards a lockout: Marika on the shop floor mailed the MSP alias by '
        + 'mistake and cannot log in. It is a routine daytime user reset, which '
        + 'under the co-managed split is Arden\'s OWN helpdesk\'s to do - the MSP '
        + 'has the servers and the after-hours, their team has the users. Reaching '
        + 'in to reset her here steps on Dev\'s desk; the correct move is to hand '
        + 'it back to their IT, not to poach it.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    // The RACI-correct close: hand it to the team whose job it is. Resetting her
    // from the MSP desk is not the resolution - handing it back is.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:arden-lockout-handback' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/co-managed-raci',
  },
  cause: 'A daytime user lockout is Arden\'s internal helpdesk\'s responsibility '
    + 'under the co-managed RACI, not the MSP\'s - the MSP owns servers, after-'
    + 'hours and specialist work. The ticket reached the wrong queue; the fix is '
    + 'to route it back to their team, cleanly, rather than double-handle a user '
    + 'both desks think the other has.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'hand-back-to-their-it',
      app: 'tickets',
      label: 'Hand it back: day-to-day user support is Arden\'s IT under the RACI',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:arden-lockout-handback',
          params: {
            reported: 'Floor supervisor locked out; routed to the MSP in error.',
            tried:
              'Confirmed the lockout is a routine daytime user reset\n'
              + 'Checked the RACI: day-to-day user support is Arden\'s own '
              + 'helpdesk, not the MSP - handing back rather than double-handling',
          },
        },
      ],
    },
  ],
};

/** The shop-floor scheduling portal, on their IIS box - the W3SVC that serves it. */
const ARDEN_W3SVC = baselineServiceId(MSP_IDS.ardenServer, 'W3SVC');

/**
 * The after-hours gap the MSP fills - and the one that needs COORDINATION.
 *
 * The shop-floor scheduling portal is down for the night shift: the World Wide
 * Web Publishing service on ARDEN-SRV-01 has wedged, and Arden's own IT has gone
 * home. This is squarely the MSP's to do under co-managed - after-hours, on a
 * server - but co-managed is coordinate-then-act: acting on their estate
 * unilaterally is refused, and the move is to NOTIFY their IT first (`notify
 * <service>`) and then restart. The graph path here is the restart itself; the
 * coordinate step is the scope-engine seam, proven in `msp-scope.test.ts` (a
 * unilateral restart is caught, the notify clears it).
 */
const ARDEN_PORTAL_AFTERHOURS: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.ardenServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:arden-portal-afterhours',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden: the shop-floor portal is down as their IT clocks off',
      body:
        'Dev flags that the scheduling portal is down heading into the night '
        + 'shift - the IIS service on ARDEN-SRV-01 has wedged - and his team is '
        + 'clocking off for the day. This is the MSP\'s to fill: after their '
        + 'hours, on a server. But Arden is co-managed, so it is not a free hand '
        + '- notify their IT first ("notify <service>"), then restart the '
        + 'service. Acting unilaterally is the coordination gap the contract '
        + 'closes.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [
      {
        op: 'setField',
        id: ARDEN_W3SVC,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ARDEN_W3SVC },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/co-managed-coordination',
  },
  cause: 'The World Wide Web Publishing service on ARDEN-SRV-01 wedged and the '
    + 'portal it serves went dark. Under co-managed this is the MSP\'s gap to '
    + 'fill after hours, but the act is gated by coordination: their own IT is '
    + 'notified first so both teams know who is on the box, and then the wedged '
    + 'service is restarted - coordinate, then act.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'coordinate-then-restart-w3svc',
      app: 'cmd',
      label: 'Notify Arden\'s IT, then restart the portal service on ARDEN-SRV-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ARDEN_W3SVC,
        },
      ],
    },
  ],
};

/* -- PENNINGTON-ACCT: the box you can touch and should not (E9, 0.37.0) ---- */

/**
 * The RACI's soft wall, as the one ticket that walks straight into it.
 *
 * The practice suite the whole firm bills through has stopped, on PENN-SRV-01,
 * which is Gil's box under the RACI - their one IT man owns the application,
 * and he is out at a client until the afternoon. The fix is a service restart
 * and it WORKS: the MSP monitors that box, so the MSP has an admin account on
 * it, and nothing in the estate is going to refuse a Tier-1 tech bouncing a
 * service. That is not a hole in the mechanic, it is the mechanic.
 *
 * WHERE IT LIVES, because it is not where a teaching ticket would normally go.
 * It is dealt out of the MSP's SURPLUS (`spares/msp.ts`) rather than off the
 * authored week, and that is a measurement rather than a preference: the
 * engineer's work blend at this shop is derived from the authored week's own
 * mix, and one more server-kind arrival in that table drops
 * `mixAfforded(msp, systems_engineer, 20)` from twenty to ten. The reasoning,
 * the three placements it was measured at and what buying it a seat in the
 * authored week would cost are written down beside the entry itself.
 *
 * Both ways through close the ticket, which is the padding rule applied to a
 * social cost: the player is never handed a fault they cannot fix. Notify
 * Gil first and the restart is coordinated work on a shared estate, and his
 * morning is a mail he already knew about. Restart it without a word and the
 * ticket closes just the same - and tomorrow his monitoring tells him, in his
 * words rather than yours, which is what the reputation is spent on. The seam
 * that tells the two apart is the scope pre-flight in `cmd-run.ts`; the graph
 * path below is the restart itself, exactly as ARDEN's after-hours portal is.
 */
const PENNINGTON_PRACTICE_DOWN: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.penningtonServer, MSP_IDS.penningtonPracticeApp],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:pennington-practice-down',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Pennington: the practice suite has stopped, and Gil is out',
      body:
        'Esme rings: nobody at Pennington & Roe can get into Ledgerline - no '
        + 'time recording, no billing, forty people at a standstill and the '
        + 'morning going. The service on PENN-SRV-01 has stopped. Gil, their IT '
        + 'manager, is at a client until three and is not picking up. That box '
        + 'is his under the RACI - the practice system is the customer\'s own '
        + 'to run, the MSP has the desks and the monitoring - which is why the '
        + 'move is to notify their IT ("notify <target>") and then restart the '
        + 'service. Your account will bounce it either way. That is the point.',
    },
    reporter: MSP_IDS.penningtonContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.penningtonPracticeApp,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.penningtonPracticeApp },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/co-managed-application-ownership',
  },
  cause: 'The Ledgerline service on PENN-SRV-01 has stopped and taken time '
    + 'recording and billing with it. The restart is the fix and it is four '
    + 'seconds of work; the question the co-managed RACI asks is a different '
    + 'one, because that server and the application on it are the customer\'s '
    + 'own IT manager\'s under the split. Nothing refuses the restart - the MSP '
    + 'monitors the box and holds an account on it - so the honest move is to '
    + 'notify him first and then do it, and the cost of not bothering arrives '
    + 'the next morning off his own monitoring rather than at the keyboard.',
  dialogue_ref: 'dialogue/msp-esme',
  paths: [
    {
      id: 'notify-then-restart-ledgerline',
      app: 'cmd',
      label: 'Notify Gil, then restart Ledgerline on PENN-SRV-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: MSP_IDS.penningtonPracticeApp,
        },
      ],
    },
  ],
};

/* -- TILLMAN-FREIGHT: the onboarding discovery, and the horror (0.13.0) ---- */

/**
 * The onboarding-discovery ticket: the new customer's runbook says the backups
 * are green, and discovery is the job of finding out whether that is true.
 *
 * It arrives twenty minutes after TILLMAN signs (the Wednesday onboarding
 * event), by which point the estate the audit reads is standing up. The ticket
 * itself invents nothing: the fault is a real state on the backup service
 * (`backup_verified: false`, seeded by `mspOnboardingSetup`), the audit reads it
 * off the node, and the honest onboarding move is to RAISE it - the same
 * escalate the prod-down and the monitoring alerts resolve on, because "their
 * backups were never actually working" is a finding for whoever owns the
 * remediation plan, not a thing to quietly restart and hope. Papering over it is
 * exactly the skipped-discovery mistake that eats the contract.
 *
 * Setup is empty - the failure was already on the estate when they signed, not
 * something the ticket stands up - so the solvability gate can spawn it into a
 * bare MSP world (no onboarding fired) and still prove the escalate closes it.
 */
const TILLMAN_BACKUP_DISCOVERY: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.tillmanServer, MSP_IDS.tillmanBackup],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:tillman-backup-discovery',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Tillman onboarding: audit the estate before we take it on',
      body:
        'TILLMAN-FREIGHT signed this morning and we have taken them on '
        + 'undocumented. The handover note is one line - "nightly backups run, '
        + 'all green" - and that is the whole of the runbook. Run discovery on '
        + 'their estate (audit customer:tillman) and confirm what is actually '
        + 'there. Onboarding is where an MSP earns or loses a client; find what '
        + 'nobody wrote down and raise it, do not paper over it.',
    },
    reporter: MSP_IDS.tillmanContact,
    setup: [],
    // Raise it. The finding - a backup reporting success without a restorable
    // backup behind it - is not a desk fix on a client the MSP does not fully
    // know yet; the honest onboarding move is a clean escalation of what
    // discovery turned up, and that is the rule this ticket closes on.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:tillman-backup-discovery' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/backup-verification-gap',
  },
  cause: 'The backup job on TILL-SRV-01 reports success every night and has not '
    + 'produced a restorable backup in months - configured, green, and empty, '
    + 'the classic onboarding horror. Monitoring the job is not testing the '
    + 'restore; the discovery finds it, and raising it before the estate goes '
    + 'live is the whole value of doing onboarding honestly.',
  dialogue_ref: 'dialogue/msp-glenda',
  paths: [
    {
      id: 'escalate-tillman-backup',
      app: 'tickets',
      label: 'Raise it: the backup has never actually worked, flag it on the '
        + 'onboarding plan',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:tillman-backup-discovery',
          params: {
            reported: 'TILL-SRV-01 backup (wbengine) reports success nightly but '
              + 'has no verified restore point since 2025-11-09 - failing '
              + 'silently.',
            tried:
              'Ran discovery on the estate (audit customer:tillman)\n'
              + 'Read the backup off TILL-SRV-01: RUNNING, backup_verified '
              + 'false - green screen, empty restore',
          },
        },
      ],
    },
  ],
};

/* -- ELMWOOD-DENTAL: the hands-on Windows vertical, fully-managed (0.14.0) --- */

/**
 * The chair-side headline: the intraoral X-ray sensor "not detected", with a
 * patient in the chair.
 *
 * The single most common dental-IT ticket, and the one whose SLA is genuinely
 * tight because a surgery cannot take the radiograph it is mid-procedure for.
 * The real triage is the reseat: the USB sensor or its interface has dropped off
 * the bus, and re-seating the connector brings it back - which is a device
 * power-cycle in this world's terms (the same verb the flat mouse and the dead
 * warehouse printer take). Modelled as the device fact it is: the sensor on the
 * operatory workstation, powered off in the ticket's setup, brought back on by
 * the reseat. In scope because ELMWOOD is fully-managed - a chair-side device on
 * a managed workstation is squarely the MSP's - and on the tightest clock in the
 * game because the clinic is Gold and the fault is high-severity.
 */
const XRAY_SENSOR_NOT_DETECTED: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.elmwoodSensor, MSP_IDS.elmwoodOperatory],
  // A patient is in the chair and the surgery cannot take the image it is
  // mid-procedure for: as urgent as it is claimed, and the desk agrees.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:elmwood-xray-sensor',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Elmwood: the X-ray sensor is "not detected" and there is a patient '
        + 'in the chair',
      body:
        'Grace is calling from reception for the surgery: the DEXIS sensor on the '
        + 'chair-side PC has stopped being detected mid-appointment - the imaging '
        + 'software says no sensor is connected and the dentist cannot take the '
        + 'radiograph. It was working an hour ago. There is a patient sitting in '
        + 'the chair with their mouth open, so this one is now, not later.',
    },
    reporter: MSP_IDS.elmwoodContact,
    // The sensor drops off the USB bus, which reads as "not detected" - the
    // device simply not being there. It arrives with the ticket, like every
    // fault in this roster; nothing about the workstation itself is broken.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.elmwoodSensor,
        field: FIELDS.powered,
        value: false,
      },
    ],
    // Closed when the sensor is enumerating again - back on the bus, detected.
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.elmwoodSensor },
      field: FIELDS.powered,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/xray-sensor-not-detected',
  },
  cause: 'An intraoral sensor that reports "not detected" has almost always '
    + 'dropped off the USB bus - a connector worked loose, a hub browned out, or '
    + 'the interface stopped enumerating. Re-seating the USB connection brings it '
    + 'back on the bus and the imaging software finds it again; nothing on the '
    + 'workstation and nothing in the patient database is wrong, which is why '
    + 'reseating is the first move and rebuilding anything is the wrong one.',
  dialogue_ref: 'dialogue/msp-grace',
  paths: [
    {
      id: 'reseat-the-sensor',
      app: 'remote',
      label: 'Reseat the USB X-ray sensor on the operatory PC (power-cycle the '
        + 'device)',
      steps: [
        {
          action: HELPDESK_ACTIONS.devicePowerCycle,
          target: MSP_IDS.elmwoodSensor,
        },
      ],
    },
  ],
};

/**
 * The imaging bridge a PMS update broke - the integration boundary, escalated.
 *
 * After a weekend Dentrix update, captured X-rays stop landing in the patient
 * chart: the DEXIS-to-Dentrix imaging bridge and the new PMS version no longer
 * agree on the interface, so images are taken and then go nowhere. Every instinct
 * says restart the bridge service, and on a fully-managed contract the desk MAY
 * touch the server - but a restart puts the same version-mismatched bridge back
 * up in front of the same broken chart write. This is a vendor integration
 * defect, not a wedged service, so the honest close is a clean escalation to the
 * imaging vendor with the PMS version that broke it - the same shape the
 * prod-down and the onboarding-backup discovery resolve on. The service is real
 * estate a tech can read; nothing on it is wedged, which is exactly the trap.
 */
const IMAGING_BRIDGE_BREAK: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.elmwoodServer,
    MSP_IDS.elmwoodImagingBridge,
    MSP_IDS.elmwoodOperatory,
  ],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:elmwood-imaging-bridge',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Elmwood: X-rays are being taken but not saving to the patient chart',
      body:
        'Grace reports that since the Dentrix update over the weekend, the '
        + 'surgery can capture X-rays on the DEXIS sensor but they never appear in '
        + 'the patient\'s chart - the image is taken and then simply is not there. '
        + 'The imaging bridge on the practice server is running; restarting it '
        + 'changes nothing, because the update moved the interface out from under '
        + 'it. This is the vendor\'s integration to reconcile, and it wants '
        + 'raising with the version that broke it.',
    },
    reporter: MSP_IDS.elmwoodContact,
    // Nothing is wedged and nothing is seeded: the bridge runs, the PMS runs, and
    // the fault is that the two no longer agree - an integration break the estate
    // cannot hold as a status, exactly as the prod-down outage is a fiction the
    // escalate resolves rather than a field on a box.
    setup: [],
    // The honest ending: escalate to the imaging vendor. A Tier-1 restart cannot
    // reconcile a bridge with a PMS version it was not built for, so escalation
    // is the job here, not a fallback - the resolution rule is the raise.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:elmwood-imaging-bridge' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/imaging-bridge-pms-update',
  },
  cause: 'A PMS update changed the interface the imaging bridge writes through, '
    + 'so DEXIS captures an image and the bridge can no longer hand it to the '
    + 'Dentrix chart. The bridge service is running - restarting it just reloads '
    + 'the same version-mismatched integration - so this is not a desk fix at any '
    + 'tier; it is a vendor reconciliation of the bridge to the new PMS version, '
    + 'and the fast, correct move is to escalate it with the update details.',
  dialogue_ref: 'dialogue/msp-grace',
  paths: [
    {
      id: 'escalate-imaging-bridge',
      app: 'tickets',
      label: 'Escalate it: the PMS update broke the bridge, it is the vendor\'s '
        + 'to reconcile',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:elmwood-imaging-bridge',
          params: {
            reported: 'DEXIS captures succeed but do not write to the Dentrix '
              + 'chart since the weekend PMS update; images lost.',
            tried:
              'Confirmed the DEXIS imaging bridge on ELM-SRV-01 is RUNNING\n'
              + 'Restart reloads the same bridge - the PMS update moved the '
              + 'interface, so it is a vendor integration reconcile, not a desk '
              + 'fix at any tier',
          },
        },
      ],
    },
  ],
};

/**
 * The HIPAA access-review request - who opened a patient chart.
 *
 * A patient (or their guardian) has asked the practice for an accounting of who
 * viewed their record, and Grace has passed it to the MSP because the audit
 * trail lives in the PMS the MSP administers. This is compliance-adjacent work,
 * and its deliverable is not a fix on the estate - it is the answer, pulled from
 * the Dentrix audit log and reported back to the practice. So the ticket closes
 * on a reply to the reporter (the same rule the phish report closes on): reading
 * the audit trail is a read, running the report is in scope on a managed
 * contract, and the accounting handed back to the practice manager IS the job.
 * Nothing is remediated because nothing is broken; the record is produced.
 */
/**
 * The three replies this roster closes a ticket with, said once.
 *
 * They live here, beside the paths that advertise them, and the DIALOGUE reads
 * them - the same arrangement the phish praise has had since the pilot week
 * (`PHISH_PRAISE`), and for a reason 0.32.0 found the hard way: a chat option
 * is the ONLY route a player has to `ticket.reply_to_reporter`, so a
 * reply-closed ticket whose tree does not offer one is a ticket nobody can
 * close. The dental access review shipped in that state in 0.14.0 and nothing
 * caught it, because every gate it had drove the PATH rather than the tree.
 * There is a standing gate now (`dialogue.test.ts`), and these constants are
 * what keep the two halves saying the same sentence.
 */
export const HIPAA_ACCESS_REPORT = 'Access review complete: the Dentrix audit '
  + 'trail for that chart over the last month shows only the treating dentist '
  + 'and the practice manager, each entry stamped with the login and time. No '
  + 'unexpected access. Full report is on the ticket for your records.';

export const SCREEN_RECORDING_WALKTHROUGH = 'This one has to be done at the '
  + 'Mac, and it takes a minute: on Corin\'s machine, System Settings > Privacy '
  + '& Security > Screen Recording, switch our support tool on, and let it quit '
  + 'and reopen when it asks. macOS will not let us do it from the management '
  + 'console - Apple keeps screen capture as the user\'s own decision, however '
  + 'managed the Mac is. Once he has ticked it the session will show his screen '
  + 'straight away.';

export const GATEKEEPER_ANSWER = 'That message is not saying the plugin is '
  + 'malware - it is saying it has not been notarized, which means Apple has '
  + 'never scanned that particular build. For a tool from a supplier you have '
  + 'worked with for two years, the supported way through is the override macOS '
  + 'provides: right-click the plugin in Finder, choose Open and confirm, or '
  + 'allow it under System Settings > Privacy & Security straight after it is '
  + 'blocked. Please do NOT turn Gatekeeper off - that drops the check for '
  + 'everything the studio downloads from now on to solve one file. Worth '
  + 'asking him to notarize future builds; it is a step at his end and it stops '
  + 'this happening on every machine.';

const HIPAA_ACCESS_REVIEW: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.elmwoodServer, MSP_IDS.elmwoodContactAccount],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:elmwood-hipaa-audit',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Elmwood: a patient wants to know who opened their chart',
      body:
        'Grace has a request from a patient asking, under their right to an '
        + 'accounting, who has accessed their record over the last month. The '
        + 'practice keeps that in the Dentrix audit trail on the server, and Grace '
        + 'needs the answer to give back. It is not a thing to fix - it is a thing '
        + 'to look up and report accurately, from the log the system already '
        + 'keeps.',
    },
    reporter: MSP_IDS.elmwoodContact,
    // Nothing is broken and nothing is seeded: the audit trail exists on the PMS
    // and always has. The job is to read it and report, not to change anything.
    setup: [],
    // Closed when the accounting has been written back to the practice - the
    // access review answered from the log, on the record where it belongs.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:elmwood-hipaa-audit' },
      field: FIELDS.replied,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/hipaa-access-review',
  },
  cause: 'A HIPAA access review is answered from the audit trail the practice '
    + 'management system keeps as a matter of course - every chart open is logged '
    + 'with who and when. Producing the accounting is running that report for the '
    + 'patient and date range and handing it back to the practice; it is a read '
    + 'and a report, not remediation, which is why the ticket closes on the '
    + 'answer being given rather than on anything being changed.',
  dialogue_ref: 'dialogue/msp-grace',
  paths: [
    {
      id: 'report-the-access-review',
      app: 'chat',
      label: 'Pull the Dentrix audit trail and report the chart-access accounting '
        + 'to the practice',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketReplyToReporter,
          target: 'ticket:elmwood-hipaa-audit',
          params: { comment: HIPAA_ACCESS_REPORT },
        },
      ],
    },
  ],
};

/* -- MARLOWE-STUDIO: the Mac vertical, fully-managed (0.32.0) -------------- */

/**
 * The black screen: a remote session that connects and shows nothing, because
 * nobody has granted the support tool Screen Recording.
 *
 * The first thing a Windows-shaped desk gets wrong about a Mac. The session is
 * up, the tool is running, the box is enrolled in the studio's MDM - and the
 * viewer is looking at a black rectangle, because macOS treats "see this
 * screen" as a consent belonging to the person sitting in front of it. There is
 * no console button for it: a management profile can pre-approve Accessibility
 * for the same tool and CANNOT pre-approve Screen Recording, which is exactly
 * what `mdm.push_profile` refuses on this box and why the refusal is the lesson
 * rather than a wall.
 *
 * So the fix is somebody else's click, and the work is talking them through it:
 * System Settings > Privacy & Security > Screen Recording, tick the support
 * tool, and let it restart. That is a reply to the reporter - the same shape the
 * HIPAA access review closes on - because the deliverable is the walkthrough,
 * not a state the desk can reach from here. The consent itself is real estate
 * (`tcc_screen_recording` on the Mac, granted across the studio and taken away
 * on this one box by the setup below), which is what the MDM refusal reads.
 */
const SCREEN_RECORDING_BLIND: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.marloweDesignMac, MSP_IDS.marloweDesignerAccount],
  // Rosa says the designer is sitting waiting on IT, which is true; the fault is
  // a two-minute walkthrough rather than the emergency the studio calls it.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:marlowe-screen-recording',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Marlowe: your remote thing connects to Corin\'s Mac and shows a '
        + 'black screen',
      body:
        'Rosa reports that when the desk starts a remote session to Corin\'s Mac '
        + 'it connects - he can see it say somebody has joined - and then the '
        + 'viewer just shows black. Corin can see his own screen perfectly well '
        + 'and is describing it down the phone, which he says is the worst '
        + 'possible way to get help with a colour problem. The Mac is on the '
        + 'studio\'s management, so Rosa assumed this was something IT could '
        + 'switch on from your end.',
    },
    reporter: MSP_IDS.marloweContact,
    // The consent, withdrawn. It arrives with the ticket like every other fault
    // here: the studio's Macs are seeded with the support tool approved, and
    // this one box is not - a new machine, a reinstalled tool, a "Deny" clicked
    // in a hurry. Nothing else about the Mac is wrong.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.marloweDesignMac,
        field: FIELDS.tccScreenRecording,
        value: false,
      },
    ],
    // Closed when the walkthrough has been given: the desk cannot grant this
    // and never could, so the job is the person on the other end being told
    // exactly where to click and why.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:marlowe-screen-recording' },
      field: FIELDS.replied,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/mac-screen-recording-consent',
  },
  cause: 'macOS puts screen capture behind a consent (TCC) that only the person '
    + 'logged in at that Mac can give: System Settings > Privacy & Security > '
    + 'Screen Recording, per application. A remote-support tool without it '
    + 'connects normally and is handed a black frame, which is why the session '
    + 'looks alive and shows nothing. Device management does not solve it - a '
    + 'PPPC profile can pre-approve Accessibility for the same tool, and Apple '
    + 'deliberately excludes Screen Recording from what an administrator may '
    + 'grant - so there is no console fix at any tier, and the correct work is '
    + 'to walk the user through granting it themselves.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'walk-them-through-the-grant',
      app: 'chat',
      label: 'Walk Corin through granting Screen Recording in Privacy & '
        + 'Security',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketReplyToReporter,
          target: 'ticket:marlowe-screen-recording',
          params: { comment: SCREEN_RECORDING_WALKTHROUGH },
        },
      ],
    },
  ],
};

/**
 * The plugin that will not open: Gatekeeper, notarization, and the override
 * that is a legitimate move rather than a hack.
 *
 * A freelance-supplied plugin lands on the edit Mac and refuses to run, with
 * the wording macOS actually uses. The instinct - "this is a virus, wipe it" or
 * "turn Gatekeeper off" - is wrong in both directions, and the truth is the
 * teachable middle: notarization is Apple checking a developer's build for
 * known malware and stamping it, an unnotarized build is UNCHECKED rather than
 * KNOWN BAD, and macOS ships a documented way to open one anyway for software
 * you have reason to trust. That is the whole ticket: read the dialog, know
 * what it is claiming, and give the studio the real answer.
 *
 * Nothing is seeded, for the same reason the imaging bridge seeds nothing: the
 * refusal is the OS enforcing a policy, not a state on the box gone wrong, and
 * a field called "gatekeeper_blocked" would be a fault where there is none. It
 * closes on the reply, which is where the knowledge is handed over.
 */
const GATEKEEPER_PLUGIN: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.marloweEditMac, MSP_IDS.marloweProjectShare],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:marlowe-gatekeeper-plugin',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Marlowe: the edit suite will not open the plugin the job needs',
      body:
        'Rosa reports that the render plugin the client\'s job is built around '
        + 'will not open on the edit Mac. She has read the message out twice: '
        + '"Chroma Bloom cannot be opened because the developer cannot be '
        + 'verified. macOS cannot verify that this app is free from malware." '
        + 'The plugin came from the freelancer who built the effect, the studio '
        + 'has used his work for two years, and somebody in the room has already '
        + 'suggested turning the security off entirely. The delivery is today.',
    },
    reporter: MSP_IDS.marloweContact,
    // Nothing to seed and nothing wrong with the Mac: Gatekeeper is doing
    // precisely its job on a build that has not been through notarization, and
    // there is no state on the box to repair - only a decision to make and
    // explain.
    setup: [],
    // Closed when the studio has been given the real answer: what the message
    // means, and the documented way to open a build you have reason to trust.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:marlowe-gatekeeper-plugin' },
      field: FIELDS.replied,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/gatekeeper-unnotarized',
  },
  cause: '"The developer cannot be verified" is Gatekeeper reporting that the '
    + 'app has not been NOTARIZED - it has not been submitted to Apple\'s '
    + 'automated malware scan and stamped - which is a different claim from '
    + '"this is malware". Small tools, plugins and one-off builds from people '
    + 'you work with are frequently unnotarized because notarizing costs the '
    + 'developer a paid account and a step in their build. macOS ships the '
    + 'override for exactly this case: open the item from Finder\'s context menu '
    + 'and confirm, or allow it under System Settings > Privacy & Security '
    + 'after the first refusal. Turning Gatekeeper off wholesale is the wrong '
    + 'move - it removes the check for everything the studio ever downloads to '
    + 'solve one file - and so is deleting a supplier\'s work on the strength of '
    + 'a message that never said it was dangerous.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'explain-and-authorise-the-override',
      app: 'chat',
      label: 'Tell them what the message means and the supported way to open '
        + 'it',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketReplyToReporter,
          target: 'ticket:marlowe-gatekeeper-plugin',
          params: { comment: GATEKEEPER_ANSWER },
        },
      ],
    },
  ],
};

/**
 * The seat that followed the person: a Named User licence expired mid-project,
 * and there is nothing on the estate to fix.
 *
 * The third Mac-shop truth, and the one that has nothing to do with Macs and
 * everything to do with how creative software is sold. A creative-suite seat is
 * attached to a PERSON in the vendor's admin console, not to a machine: it
 * follows them between the studio's Macs, and it stops the day the term it was
 * bought for ends. The freelancer's did, in the middle of a job, so the suite
 * opens and refuses.
 *
 * Every desk instinct is a dead end and the estate says so with the machinery
 * it already had. Assigning a seat is refused because the studio's plan is
 * fully subscribed (`seats_free: 0` on the pool), and the seats it does have
 * are held by working designers - taking one back to unblock the freelancer
 * blocks somebody else and does NOT close this, because moving a problem is not
 * solving it. What is left is the true move: raise it with the licensing desk,
 * with the account and the job on it, so a seat is bought or the term renewed.
 * The same clean-escalation shape as the imaging bridge, for the same reason -
 * the decision is not the desk's to make.
 */
const CREATIVE_SEAT_EXPIRED: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.marloweFreelancerAccount,
    MSP_IDS.marloweSuiteSeats,
    MSP_IDS.marloweStudioMac,
  ],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:marlowe-seat-expired',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Marlowe: the freelancer cannot open the suite and he is billing '
        + 'by the hour',
      body:
        'Rosa reports that Luca, the motion designer they have in for a job, '
        + 'signed in this morning and the creative suite will not open for him - '
        + 'it says his subscription is not active. He was working in it on '
        + 'Friday, on the same desk, on the same files. Rosa has already tried '
        + 'the obvious: signing him out and back in, and moving him to a '
        + 'different Mac, on the theory that the machine had lost its licence.',
    },
    reporter: MSP_IDS.marloweContact,
    // The seat, gone. Written explicitly rather than left absent: "this person
    // holds no seat" is the fact the whole ticket turns on, and a field nobody
    // wrote is a fact nobody can read.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.marloweFreelancerAccount,
        field: FIELDS.licence,
        value: false,
      },
    ],
    // The honest ending: raise it with the licensing desk. A seat that has
    // lapsed at the vendor is bought or renewed, not conjured, and no verb on
    // this estate can make one - which is why the escalation IS the work here.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:marlowe-seat-expired' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/named-user-seats',
  },
  cause: 'Creative-suite licences are NAMED USER: the entitlement is attached to '
    + 'the person in the vendor\'s admin console and travels with them between '
    + 'machines, which is why signing out, signing in and changing Mac all '
    + 'change nothing. The freelancer\'s seat was bought for a term, the term '
    + 'ended, and the seat was unassigned at renewal - so the suite is behaving '
    + 'correctly by refusing to open. The studio\'s plan has no spare seat to '
    + 'give him, and the seats it has are held by designers who are using them: '
    + 'reclaiming one unblocks Luca by blocking somebody else, which is a '
    + 'commercial decision the studio makes and not a fix the desk performs. '
    + 'Escalating it with the account, the job and the date it lapsed is what '
    + 'actually gets a seat bought.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'escalate-to-the-licensing-desk',
      app: 'tickets',
      label: 'Escalate it: the seat lapsed at the vendor and has to be bought '
        + 'back',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:marlowe-seat-expired',
          params: {
            reported: 'MARLOWE-STUDIO: Named User seat for lvasquez (Luca '
              + 'Vasquez, contract motion designer) is not active - creative '
              + 'suite refuses to open. Working Friday, blocked this morning.',
            tried:
              'Sign-out/sign-in and a different Mac, both by the studio - a '
              + 'Named User seat follows the person, so neither could help\n'
              + 'Creative suite seats pool shows 0 free: the plan is fully '
              + 'subscribed and every seat is held by working staff, so there '
              + 'is none to assign and none to take back without blocking '
              + 'somebody else\n'
              + 'Needs a seat bought or the term renewed at the licensing desk',
          },
        },
      ],
    },
  ],
};

/* -- FETTLE & CRANE's OWN infra: the first fix at the engineer tier (E6) --- */

/**
 * The client portal down - the payoff of the promotion (E6, Pass B).
 *
 * The first incident the newly-promoted engineer is paged onto, and the honest
 * counterpart to the MERIDIAN prod-down escalate: this box is FETTLE & CRANE's
 * OWN (FC-RMM-01), running the client portal customers log into, so there is no
 * customer contract in the way and the engineer FIXES it rather than escalating.
 * That is the wall coming down truthfully - the Linux box a service-desk player
 * could never reach is fixable now, on the employer's own infra, without
 * bypassing any customer scope (a helpdesk customer's server stays out of reach,
 * engineer or not).
 *
 * The fault is a REAL node state, not a string: `fcportal.service` is seeded
 * healthy in `mspSetup`, and this ticket's setup flips its `unit_state` to
 * `failed` and writes the failure cascade into its journal - the crash, the
 * retries, the start-limit systemd hit and gave up on. The fix path is the exact
 * engineer workflow: ssh in, `systemctl status` (failed), `journalctl -u` (why),
 * `systemctl restart` (silent), and the unit flips back to active(running),
 * which is what this closes on. Arrival is `summoned`: it is not on anybody's
 * scripted week, so every existing golden is byte-identical until the promotion
 * fires and the shell raises it (`day.raiseFirstIncident`).
 */
const SYSENG_FIRST_INCIDENT: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.mspInfraServer, MSP_IDS.mspInfraPortalUnit],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:syseng-first-incident',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fettle & Crane: the client portal is down - customers can\'t log in',
      body:
        'Morgan pages you the moment the tier flips: the client portal is down. '
        + 'It runs on FC-RMM-01 - our own box, not a customer\'s - as '
        + 'fcportal.service, and it fell over this morning and has not come back. '
        + 'Customers cannot log in to raise anything. It is ours to fix now: ssh '
        + 'in, read the unit, and bring it up. systemctl status will show it '
        + 'failed and journalctl -u will show why.',
    },
    reporter: MSP_IDS.mspLead,
    // The fault is a REAL node state: flip the seeded-healthy unit to failed, and
    // write the journal that says why - the crash, systemd's retries, and the
    // start-limit it hit. `systemctl restart` is the fix, and it works because
    // nothing is misconfigured; the unit just exhausted its automatic retries.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.mspInfraPortalUnit,
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      },
      {
        op: 'setField',
        id: MSP_IDS.mspInfraPortalUnit,
        field: FIELDS.unitJournal,
        value: [
          'Sep 07 08:44:10 FC-RMM-01 fcportal[2143]: [CRITICAL] worker 3 died: '
            + 'unhandled exception in request handler',
          'Sep 07 08:44:10 FC-RMM-01 systemd[1]: fcportal.service: Main process '
            + 'exited, code=exited, status=1/FAILURE',
          'Sep 07 08:44:10 FC-RMM-01 systemd[1]: fcportal.service: Failed with '
            + 'result \'exit-code\'.',
          'Sep 07 08:44:10 FC-RMM-01 systemd[1]: fcportal.service: Scheduled '
            + 'restart job, restart counter is at 5.',
          'Sep 07 08:44:11 FC-RMM-01 systemd[1]: fcportal.service: Start request '
            + 'repeated too quickly.',
          'Sep 07 08:44:11 FC-RMM-01 systemd[1]: fcportal.service: Failed with '
            + 'result \'exit-code\'.',
          'Sep 07 08:44:11 FC-RMM-01 systemd[1]: Failed to start Fettle & Crane '
            + 'client portal.',
        ].join('\n'),
      },
    ],
    // Closed when the unit is answering again: active (running) on the portal
    // node. Read straight off the state the restart writes, so a fabricated
    // confirmation could never close it - only the real flip does.
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.mspInfraPortalUnit },
      field: FIELDS.unitState,
      value: SYSTEMD_STATES.activeRunning,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/systemd-start-limit',
  },
  cause: 'fcportal.service crashed once and systemd, after retrying it too fast, '
    + 'hit its start-limit and stopped trying - so it is sitting failed rather '
    + 'than running. Nothing is misconfigured; the unit just exhausted its '
    + 'automatic retries. ssh in, confirm it with systemctl status, read '
    + 'journalctl -u for the why, and systemctl restart brings it back - which '
    + 'is silent on success, because systemd says nothing when it works.',
  dialogue_ref: 'dialogue/msp-morgan',
  paths: [
    {
      id: 'restart-the-portal-unit',
      app: 'cmd',
      label: 'ssh in and restart fcportal.service on FC-RMM-01',
      steps: [
        {
          action: SYSTEMD_ACTIONS.unitRestart,
          target: MSP_IDS.mspInfraPortalUnit,
        },
      ],
    },
  ],
};

/* -- the characteristic sysadmin incidents (E6, 0.19.0) ------------------- */

/**
 * The disk-full incident (E6, 0.19.0): df -h -> du -> clear.
 *
 * The textbook fire drill, on FC-RMM-01. A crash-looping service has flooded
 * journald and the systemd journal has grown until the root filesystem is at
 * 100% - a REAL state, not a string: the incident sets the box's `disk_free`
 * near zero and `journal_bytes` to ~26G. The diagnosis is the classic: `df -h`
 * shows the filesystem near full, `du -sh /var/log/journal` (the new command)
 * finds what is eating it, and `journalctl --vacuum-size=200M` reclaims it -
 * disk frees, and the ticket closes on the journal being back down to the vacuum
 * target. Summoned by the promotion, so the estate is byte-identical until then.
 */
const SYSENG_DISK_FULL: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.mspInfraServer],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:syseng-disk-full',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fettle & Crane: FC-RMM-01 root filesystem at 100% - jobs failing',
      body:
        'Monitoring is screaming that FC-RMM-01 is out of disk. Overnight jobs '
        + 'have started failing with "No space left on device". ssh in and find '
        + 'what is eating the root filesystem: df -h shows how full it is, and '
        + 'du -sh on the log directories finds the runaway. It will be a log that '
        + 'has grown unbounded - clear it and the space comes back.',
    },
    reporter: MSP_IDS.mspLead,
    // The real state: the box near-full, and the journal that ate it. `df -h`
    // reads `disk_free`, `du -sh /var/log/journal` reads `journal_bytes` - the
    // two the vacuum writes, so a fabricated confirmation could never close it.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.mspInfraServer,
        field: FIELDS.diskFree,
        value: INCIDENT_DISK_FREE_LOW,
      },
      {
        op: 'setField',
        id: MSP_IDS.mspInfraServer,
        field: FIELDS.journalBytes,
        value: INCIDENT_JOURNAL_BYTES,
      },
    ],
    // Closed when the journal is back down to the vacuum target - the honest
    // read of the fix's own write. The disk freeing is the same event, from the
    // other side of the one field the vacuum touches.
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.mspInfraServer },
      field: FIELDS.journalBytes,
      value: JOURNAL_VACUUM_TARGET,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/disk-full-journal',
  },
  cause: 'A service on FC-RMM-01 crash-looped and logged to journald on every '
    + 'restart, so the systemd journal grew unbounded until it filled the root '
    + 'filesystem and everything that needed to write failed with "No space left '
    + 'on device". df -h shows the filesystem at 100%; du -sh /var/log/journal is '
    + 'what points at the journal as the culprit rather than a guess. journalctl '
    + '--vacuum-size=200M deletes the archived journals down to a cap and hands '
    + 'the space back - the disk frees, and the jobs run again.',
  dialogue_ref: 'dialogue/msp-morgan',
  paths: [
    {
      id: 'vacuum-the-journal',
      app: 'cmd',
      label: 'ssh in, du to find the runaway journal, and vacuum it',
      steps: [
        {
          action: INCIDENT_ACTIONS.journalVacuum,
          target: MSP_IDS.mspInfraServer,
        },
      ],
    },
  ],
};

/**
 * The cert-expiry incident (E6, 0.19.0): the process failure, not a technical one.
 *
 * The classic that took down O2 and Teams. The portal's TLS certificate has
 * EXPIRED: nginx is up and serving, the app behind it is healthy, and every
 * browser refuses the connection - a REAL state, `cert_expired: true` on the
 * nginx unit that terminates TLS. The truth the version teaches is that this is
 * NOT a technical failure: nothing broke, nothing crashed - a deadline nobody
 * scheduled arrived, and no monitoring tracked it. Diagnose with `curl -I`
 * (SSL certificate problem: certificate has expired), fix with `certbot renew`
 * (the certificate is replaced and the service serves again). The lesson lands
 * in the KB and the cause: a cert is a deadline nobody put in the calendar.
 */
const SYSENG_CERT_EXPIRY: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.mspInfraNginxUnit],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:syseng-cert-expiry',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fettle & Crane: the client portal is throwing certificate errors',
      body:
        'Customers are getting a full-page security warning on the client portal '
        + 'and nobody can log in - "your connection is not private". The portal '
        + 'itself is up: this is not a crash. ssh in and check it with curl -I; if '
        + 'the certificate has expired, renew it with certbot. Nothing is broken - '
        + 'the certificate just ran out, and no alarm went off when it did.',
    },
    reporter: MSP_IDS.mspLead,
    // The real state: the TLS certificate on the nginx unit is expired. The
    // service is UP the whole time - `cert_expired` is a fault of its own, the
    // running-and-refusing state an expired cert looks like from a browser.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.mspInfraNginxUnit,
        field: FIELDS.certExpired,
        value: true,
      },
    ],
    // Closed when the certificate is valid again - read straight off the flag
    // the renew clears and the served box refuses on, so only the real renew
    // closes it.
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.mspInfraNginxUnit },
      field: FIELDS.certExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/cert-expiry-process',
  },
  cause: 'The TLS certificate the client portal presents expired. This is the '
    + 'trap the whole incident teaches: it is NOT a technical failure. nginx is '
    + 'running, the app behind it is healthy, nothing crashed - the certificate '
    + 'simply reached its expiry date and browsers, correctly, refuse an expired '
    + 'certificate. It is a monitoring and process failure: the cert was fine '
    + 'until the day it was not, and nobody was tracking the deadline. curl -I '
    + 'shows the expired certificate; certbot renew replaces it and reloads the '
    + 'service, and the portal serves again. A certificate is a deadline nobody '
    + 'scheduled - the fix in the moment is a renew, the fix for good is putting '
    + 'the expiry on a calendar with an alarm.',
  dialogue_ref: 'dialogue/msp-morgan',
  paths: [
    {
      id: 'renew-the-certificate',
      app: 'cmd',
      label: 'ssh in, confirm the expired cert with curl -I, and certbot renew',
      steps: [
        {
          action: INCIDENT_ACTIONS.certRenew,
          target: MSP_IDS.mspInfraNginxUnit,
        },
      ],
    },
  ],
};

/**
 * The failed-deploy incident + the blameless postmortem (E6, 0.19.0).
 *
 * "It worked in staging." A routine release of the background worker broke prod:
 * `fcworker.service` went `failed` after the deploy, because the build read a
 * config key that exists in staging and not in production. The fix is the
 * rollback + the corrected restart (systemctl restart, reused). THEN the beat the
 * version is named for: the incident is not CLOSED by the restart, it is closed
 * by the blameless POSTMORTEM - a short, append-only post-incident record that
 * analyses the SYSTEM (staging had no parity, the pipeline had no rollback) and
 * never the person. The unit is built by this ticket's own setup, so FC-RMM-01 is
 * byte-identical until the promotion raises it.
 */
const SYSENG_FAILED_DEPLOY: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.mspInfraWorkerUnit],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:syseng-failed-deploy',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fettle & Crane: fcportal worker down after this afternoon\'s deploy',
      body:
        'The background worker (fcworker.service) is down after the release that '
        + 'went out this afternoon. "It worked in staging." journalctl -u will '
        + 'show it failing on a config key that is not in production. Roll it back '
        + 'and restart it to stop the bleeding - and then write the postmortem: '
        + 'this incident is not closed until there is a blameless write-up of what '
        + 'the SYSTEM let happen, which is how the tier does it.',
    },
    reporter: MSP_IDS.mspLead,
    // The unit is BUILT by this ticket, failed, with the deploy's failure cascade
    // in its journal - so the box is byte-identical until the incident raises it.
    setup: [
      {
        op: 'addNode',
        node: {
          id: MSP_IDS.mspInfraWorkerUnit,
          kind: 'unit',
          fields: {
            [FIELDS.name]: 'Fettle & Crane portal background worker',
            [FIELDS.unitName]: 'fcworker.service',
            [FIELDS.unitState]: SYSTEMD_STATES.failed,
            [FIELDS.unitEnabled]: UNIT_ENABLEMENTS.enabled,
            [FIELDS.unitJournal]: [
              'Sep 07 14:03:07 FC-RMM-01 fcworker[3288]: [ERROR] config key '
                + 'QUEUE_BROKER_URL is not set',
              'Sep 07 14:03:07 FC-RMM-01 fcworker[3288]: [CRITICAL] cannot start '
                + 'without a broker; it worked in staging because staging sets it',
              'Sep 07 14:03:07 FC-RMM-01 systemd[1]: fcworker.service: Main '
                + 'process exited, code=exited, status=78/CONFIG',
              'Sep 07 14:03:07 FC-RMM-01 systemd[1]: fcworker.service: Failed with '
                + 'result \'exit-code\'.',
              'Sep 07 14:03:08 FC-RMM-01 systemd[1]: fcworker.service: Scheduled '
                + 'restart job, restart counter is at 5.',
              'Sep 07 14:03:08 FC-RMM-01 systemd[1]: fcworker.service: Start '
                + 'request repeated too quickly.',
              'Sep 07 14:03:08 FC-RMM-01 systemd[1]: Failed to start Fettle & '
                + 'Crane portal background worker.',
            ].join('\n'),
          },
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.mspInfraWorkerUnit,
          to: MSP_IDS.mspInfraServer,
          kind: 'runs_on',
        },
      },
    ],
    // Closed only when the fire is OUT and written up: the unit back active AND
    // the blameless postmortem filed. The restart alone does not close it - the
    // postmortem is how the tier closes an incident, which is the whole point.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraWorkerUnit },
          field: FIELDS.unitState,
          value: SYSTEMD_STATES.activeRunning,
        },
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraWorkerUnit },
          field: FIELDS.postmortemFiled,
          value: true,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/failed-deploy-postmortem',
  },
  cause: 'A release of fcworker.service was deployed to production having "worked '
    + 'in staging". It failed to start in production because it read a config key '
    + '(QUEUE_BROKER_URL) that staging sets and production does not, exited '
    + 'non-zero, and systemd hit the start-limit and left it failed. The '
    + 'immediate fix is the rollback and restart. But the incident is closed by '
    + 'the blameless postmortem, not the restart: the record of what happened, '
    + 'the timeline, what the SYSTEM let happen (staging was not a faithful copy '
    + 'of production, the pipeline had no pre-flight and no automated rollback), '
    + 'and the follow-up. Blameless means it analyses the system, never the '
    + 'person who ran the deploy - which is how the tier turns a fire into a '
    + 'thing that does not happen the same way twice.',
  dialogue_ref: 'dialogue/msp-morgan',
  paths: [
    {
      id: 'rollback-and-write-it-up',
      app: 'cmd',
      label: 'ssh in, restart the rolled-back worker, and file the postmortem',
      steps: [
        {
          action: SYSTEMD_ACTIONS.unitRestart,
          target: MSP_IDS.mspInfraWorkerUnit,
        },
        {
          action: INCIDENT_ACTIONS.postmortemFile,
          target: MSP_IDS.mspInfraWorkerUnit,
          params: { line: 'fcworker@0' },
        },
      ],
    },
  ],
};

/**
 * The permission-denied incident (E6, 0.21.0): half of Linux breakage is a bit.
 *
 * fcauth.service - the portal's authentication service - is down, and not
 * because it crashed: a deploy re-copied its secret env file
 * (/etc/fcauth/auth.env) as `root:root` mode `600`, so the `fcauth` service
 * account can no longer READ it, and the service fails to start with "Permission
 * denied". The whole fault is a permission bit, and the fix is the real one: read
 * the journal for the denied path, `ls -la` it to see the wrong `-rw-------`
 * root:root, `chown root:fcauth` to restore the group the service reads through,
 * `chmod 640` so that group gets read (least privilege, not chmod 777), then
 * `systemctl restart`. It is a REAL state: the file node carries the wrong
 * mode/owner and the shell's restart gate refuses to bring the unit up until the
 * file is readable - so a restart before the fix fails exactly as a real one
 * does, and only the corrected permission lets it come up. The unit and the file
 * are BUILT by this ticket's setup, so FC-RMM-01 is byte-identical until the
 * promotion raises it.
 */
const SYSENG_PERMISSION_DENIED: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.mspInfraAuthUnit, MSP_IDS.mspInfraAuthConfig],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:syseng-permission-denied',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fettle & Crane: portal logins failing - the auth service is down',
      body:
        'Nobody can log in to the client portal - the sign-in just hangs and '
        + 'fails. fcauth.service on FC-RMM-01 (our own box) is down and will not '
        + 'start. It is not a crash: journalctl -u fcauth shows it dying on '
        + '"Permission denied" reading its config. This afternoon\'s deploy '
        + 'touched that file. ssh in, ls -la the file to see who owns it, fix the '
        + 'owner and mode so the service can read it, and restart it.',
    },
    reporter: MSP_IDS.mspLead,
    // The real state, BUILT by the ticket: the secret env file owned root:root at
    // mode 600 (the fcauth account cannot read it), and the unit failed with the
    // permission-denied cascade in its journal, pointing at requires_file so the
    // shell's restart gate refuses until the file is made readable.
    setup: [
      {
        op: 'addNode',
        node: {
          id: MSP_IDS.mspInfraAuthConfig,
          kind: 'file',
          fields: {
            [FIELDS.name]: 'auth.env',
            [FIELDS.path]: '/etc/fcauth/auth.env',
            [FIELDS.volume]: 'FC-RMM-01',
            // The wrong state a deploy left: readable only by root.
            [FIELDS.fsMode]: '600',
            [FIELDS.fsOwner]: 'root',
            [FIELDS.fsGroup]: 'root',
          },
        },
      },
      {
        op: 'addNode',
        node: {
          id: MSP_IDS.mspInfraAuthUnit,
          kind: 'unit',
          fields: {
            [FIELDS.name]: 'Fettle & Crane authentication service',
            [FIELDS.unitName]: 'fcauth.service',
            [FIELDS.unitState]: SYSTEMD_STATES.failed,
            [FIELDS.unitEnabled]: UNIT_ENABLEMENTS.enabled,
            [FIELDS.requiresFile]: MSP_IDS.mspInfraAuthConfig,
            [FIELDS.unitJournal]: [
              'Sep 07 15:12:04 FC-RMM-01 fcauth[4102]: [ERROR] cannot open '
                + '/etc/fcauth/auth.env: Permission denied',
              'Sep 07 15:12:04 FC-RMM-01 fcauth[4102]: [CRITICAL] cannot start '
                + 'without its configuration; refusing to run',
              'Sep 07 15:12:04 FC-RMM-01 systemd[1]: fcauth.service: Main process '
                + 'exited, code=exited, status=1/FAILURE',
              'Sep 07 15:12:04 FC-RMM-01 systemd[1]: fcauth.service: Failed with '
                + 'result \'exit-code\'.',
              'Sep 07 15:12:05 FC-RMM-01 systemd[1]: fcauth.service: Scheduled '
                + 'restart job, restart counter is at 5.',
              'Sep 07 15:12:05 FC-RMM-01 systemd[1]: fcauth.service: Start request '
                + 'repeated too quickly.',
              'Sep 07 15:12:05 FC-RMM-01 systemd[1]: Failed to start Fettle & '
                + 'Crane authentication service.',
            ].join('\n'),
          },
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.mspInfraAuthUnit,
          to: MSP_IDS.mspInfraServer,
          kind: 'runs_on',
        },
      },
    ],
    // Closed only when the file is in its correct least-privilege state AND the
    // service is back up: root-owned, group fcauth, mode 640 (the group reads,
    // the world does not), and the unit active. That is a STRONGER close than
    // "the unit is running" - it verifies the permission was actually fixed the
    // right way, not that the service merely happens to be up - so every step of
    // the fix (chown the group, chmod the bits, restart) is load-bearing and no
    // step is a ritual. The canonical fix the KB teaches is exactly this.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraAuthUnit },
          field: FIELDS.unitState,
          value: SYSTEMD_STATES.activeRunning,
        },
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraAuthConfig },
          field: FIELDS.fsOwner,
          value: 'root',
        },
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraAuthConfig },
          field: FIELDS.fsGroup,
          value: 'fcauth',
        },
        {
          op: 'eq',
          selector: { id: MSP_IDS.mspInfraAuthConfig },
          field: FIELDS.fsMode,
          value: '640',
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/permission-denied',
  },
  cause: 'fcauth.service reads /etc/fcauth/auth.env at startup, and this '
    + 'afternoon\'s deploy re-copied that file as root:root mode 600 - readable '
    + 'only by root. The fcauth service account is neither root nor in the file\'s '
    + 'group and there is no other-read bit, so it is denied, the process exits, '
    + 'and systemd leaves the unit failed. Nothing crashed and nothing in the app '
    + 'is misconfigured: a permission bit is wrong. journalctl -u fcauth shows the '
    + '"Permission denied" on the path and ls -la /etc/fcauth/auth.env shows the '
    + '-rw------- root root. The fix is least privilege: chown root:fcauth to '
    + 'restore the group the service reads through, chmod 640 so that group gets '
    + 'read while the secret stays off everyone else, then systemctl restart. A '
    + 'restart before the file is readable just fails again - the fix is the '
    + 'permission, not the retry.',
  dialogue_ref: 'dialogue/msp-morgan',
  paths: [
    {
      id: 'fix-the-permission-and-restart',
      app: 'cmd',
      label: 'ssh in, chown/chmod the config readable, and restart fcauth.service',
      steps: [
        {
          action: FS_ACTIONS.chown,
          target: MSP_IDS.mspInfraAuthConfig,
          params: { [FS_OWNER_PARAM]: 'root', [FS_GROUP_PARAM]: 'fcauth' },
        },
        {
          action: FS_ACTIONS.chmod,
          target: MSP_IDS.mspInfraAuthConfig,
          params: { [FS_MODE_PARAM]: '640' },
        },
        {
          action: SYSTEMD_ACTIONS.unitRestart,
          target: MSP_IDS.mspInfraAuthUnit,
        },
      ],
    },
  ],
};

export const MSP_TICKETS: readonly WorldTicket[] = [
  // FONTAINE-LAW - the law firm, helpdesk scope.
  MATTER_ACCESS,
  CHECKOUT_DEADLOCK,
  EFILING_PANIC,
  // MERIDIAN-SAAS - the SaaS shop, helpdesk identity work, prod out of reach.
  SSO_LOGIN_LOOP,
  OFFBOARDING_GAP,
  MFA_LOCKOUT,
  PROD_DOWN_ESCALATE,
  // NORTHWIND-CLINIC - monitoring-only, escalate and mean it.
  BACKUP_ALERT,
  CERT_ALERT,
  DISK_ALERT,
  // HOLLOWAY-ACCT - fully-managed, whole estate in reach (0.11.0).
  SHARED_DRIVE_DOWN,
  HOLLOWAY_SPOOLER_TICKET,
  HOLLOWAY_LOCKOUT,
  // ARDEN-MFG - co-managed, coordinate-then-act (0.11.0).
  ARDEN_LOCKOUT_HANDBACK,
  ARDEN_PORTAL_AFTERHOURS,
  // PENNINGTON-ACCT - co-managed with the RACI map written down (E9, 0.37.0):
  // the box the map hands to their own IT, which the desk can reach anyway.
  PENNINGTON_PRACTICE_DOWN,
  // TILLMAN-FREIGHT - the mid-week onboarding + the discovery horror (0.13.0).
  TILLMAN_BACKUP_DISCOVERY,
  // ELMWOOD-DENTAL - the fully-managed dental vertical, hands-on + chair-side
  // time pressure (0.14.0): the X-ray sensor reseat, the imaging-bridge vendor
  // escalation, the HIPAA access-review report.
  XRAY_SENSOR_NOT_DETECTED,
  IMAGING_BRIDGE_BREAK,
  HIPAA_ACCESS_REVIEW,
  // MARLOWE-STUDIO - the fully-managed creative agency and the Mac vertical
  // (0.32.0): the consent only the user can give, the policy the OS vendor
  // enforces, and the seat that follows the person out of the door.
  SCREEN_RECORDING_BLIND,
  GATEKEEPER_PLUGIN,
  CREATIVE_SEAT_EXPIRED,
  // FETTLE & CRANE's own infra: the first fix at the engineer tier (E6, Pass B).
  // Summoned - raised by the promotion, not by a scripted day.
  SYSENG_FIRST_INCIDENT,
  // The characteristic sysadmin incidents (E6, 0.19.0): the disk that fills with
  // logs (df -h -> du -> vacuum), the cert that expired (a process failure, not a
  // technical one), and the deploy that "worked in staging" - closed by the
  // blameless postmortem. All summoned by the promotion, all on the MSP's own box.
  SYSENG_DISK_FULL,
  SYSENG_CERT_EXPIRY,
  SYSENG_FAILED_DEPLOY,
  // The permission-denied incident (E6, 0.21.0): a service down because its
  // config file is owned wrong - the fix is chown/chmod + restart, not a retry.
  SYSENG_PERMISSION_DENIED,
  // ARDEN-MFG's edge firewall replacement (E10, 0.29.0): the first PROJECT, as
  // four phase tasks, their parent delivery row, and the two tickets a cutover
  // done off the handover pack raises the next morning. They are in the MSP
  // roster because they are Fettle & Crane's work on a Fettle & Crane customer -
  // every gate that stands a world up per employer therefore stands the right
  // one up for them, without a fourth list of exceptions to keep in step.
  ...PROJECT_TICKETS,
  // The out-of-scope asks (E9, 0.38.0): the two requests that are not faults -
  // a floor build at the helpdesk-scope law firm and a migration at the
  // co-managed accountancy - and the bigger sequel each of them earns from a
  // player who simply did it. Here for the reason the project tasks are: the
  // gates stand a world up per employer off these arrays.
  ...SCOPE_ASK_TICKETS,
  // And the pool (E11, 0.34.0 slice 2), in this list for the same reason the
  // project tasks are: every gate that stands a world up per employer reads
  // these arrays to decide which estate a ticket belongs in.
  ...POOL_MSP_TICKETS,
];
