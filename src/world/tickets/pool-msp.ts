/**
 * Pool tickets for one shop (E11, 0.34.0 slice 2) - the surplus the exclusion
 * window needs, in the queue's own shape.
 *
 * Each one is self-contained: no arc, no chain, no beat. It lands on estate the
 * shop already has and closes through verbs the registry already holds, and the
 * day it is dealt on is the sampler's business rather than a table's.
 *
 * WHAT THE MSP'S SURPLUS IS ABOUT. Fettle & Crane's week is not made of faults,
 * it is made of CONTRACTS: the same broken thing is a fix at one customer, a
 * hand-back at another and an escalation at a third, and which of those it is
 * is the only question the desk is really being asked. So the eighteen below are
 * spread across the seven customer estates that exist at boot, and each one is
 * written to the scope its customer bought - NORTHWIND is watched and never
 * touched, ARDEN is somebody else's estate the MSP shares, HOLLOWAY and ELMWOOD
 * and MARLOWE are the MSP's whole to fix, and FONTAINE and MERIDIAN stop at the
 * server-room door. Getting that wrong would not read as a difficulty setting;
 * it would read as a game that has not understood its own subject.
 *
 * SIX OF THEM ARE SHORT ON PURPOSE. A lockout, a spooler, an expired password, a
 * grant, a restart nobody has done, a workstation service that has wedged: the
 * job's own texture, two or three sentences each, one step, an article that
 * already exists. The owner's calibration on D-E11-6 is exact about this - the
 * repetition is the job, and a four-paragraph ticket about a print queue is a
 * worse lie than the repetition is.
 *
 * TILLMAN-FREIGHT is deliberately absent. Its estate is stood up mid-week by the
 * onboarding event rather than at boot, so a pool ticket about it would be dealt
 * into a world that does not have the machine it is about. The engineer-tier
 * incidents on Fettle & Crane's own box are absent for the mirror reason: those
 * are summoned by the promotion, and a pool entry is a loose dealt ticket.
 *
 * Nothing here dispatches, reads a clock, or consumes the engine's RNG.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import {
  fsEntryId,
  myDocumentsDirId,
  TEMP_SEGMENTS,
  tempDirId,
} from '../filesystem';
import { mspMachineHostname, MSP_IDS } from '../msp-company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { baselineServiceId } from '../services';
import type { WorldTicket } from './types';

/* -- FONTAINE-LAW: a Windows-only law firm on a helpdesk contract --------- */

/**
 * The lockout, and the whole of the mundane half of this file in one entry.
 *
 * A partner typed his way past the threshold and the directory shut the door,
 * which is what a lockout is and all it is. It is helpdesk-scope work on a user
 * at a helpdesk customer, so nothing about the contract is in the way, and the
 * article it points at has been on the shelf since the probation shop.
 */
const FONTAINE_PARTNER_LOCKOUT: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.fontainePartnerAccount, MSP_IDS.fontaineWorkstation],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:msp-pool-fontaine-partner-lockout',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fontaine: Marcus is locked out again',
      body:
        'Nadia reports that Marcus cannot sign in - he has been trying since '
        + 'the car park and the account has stopped taking anything at all. He '
        + 'has a client in at half nine and would like everyone to know it.',
    },
    reporter: MSP_IDS.fontaineContact,
    // The lockout arrives with the ticket about it: the failed run, and the
    // door the directory shut at the end of it.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.fontainePartnerAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: MSP_IDS.fontainePartnerAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: MSP_IDS.fontainePartnerAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.fontainePartnerAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'A run of failed sign-ins tripped the lockout threshold, exactly as it '
    + 'is meant to. The password is still the password; the door is shut and '
    + 'unlocking the account opens it. A reset would work too and would send a '
    + 'partner looking for a sticky note he does not have.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'unlock-mreyes',
      app: 'directory',
      label: 'Unlock the account for mreyes',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: MSP_IDS.fontainePartnerAccount,
        },
      ],
    },
  ],
};

/**
 * The server-room door, on a Windows box - the helpdesk wall the shipped week
 * only ever teaches on a Linux one.
 *
 * MERIDIAN's prod-down escalation stacks two refusals at once (wrong contract
 * AND wrong operating system), which is legible and also lets a player believe
 * the wall was really about the OS. This is the same wall with the second
 * refusal taken away: FONT-FILE-01 is a Windows file server on a Windows-only
 * estate, the desk has every tool for it, and it is still not in a helpdesk
 * contract. The symptom Nadia can see is documents failing to save; the cause
 * she cannot is a file server two gigabytes from the end of its disk, and the
 * only honest ending is a fast escalation with the number on it.
 */
const FONTAINE_FILE_SERVER_FULL: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.fontaineFileServer, MSP_IDS.fontaineWorkstation],
  // She is describing it as an annoyance because it is intermittent. A document
  // store minutes from having nowhere to write is not an annoyance.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-fontaine-file-server-full',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Fontaine: saving into the document system fails about half the '
        + 'time',
      body:
        'Nadia reports that since yesterday afternoon, saving a document back '
        + 'into the firm\'s document system fails roughly every other attempt - '
        + 'no pattern anybody can see, no error worth repeating, and it works '
        + 'if you try again. Two fee earners have started keeping copies on '
        + 'their desktops, which she is not happy about and neither is anybody '
        + 'who has ever had to find one.',
    },
    reporter: MSP_IDS.fontaineContact,
    // The real state behind the intermittency: the file server the document
    // store writes to is down to its last couple of gigabytes, so a write
    // succeeds or fails depending on what else landed in the same minute.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.fontaineFileServer,
        field: FIELDS.diskFree,
        value: 2_147_483_648,
      },
    ],
    // Escalation is the ending because the box is a server at a helpdesk
    // customer: the desk may read it and may not act on it, engineer or not.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-fontaine-file-server-full' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/msp-scope-escalation',
  },
  cause: 'FONT-FILE-01 is nearly out of disk, so a save into the document store '
    + 'succeeds or fails depending on how much room there happens to be in the '
    + 'second it lands - which is exactly what "about half the time" looks like '
    + 'from a fee earner\'s chair. It is a server, and Fontaine is a helpdesk '
    + 'contract: workstations and users are the desk\'s, servers are not, and '
    + 'that is true whether or not the tools would reach. The value the desk '
    + 'adds is naming the cause and the free-space figure in the escalation, so '
    + 'whoever owns the box is not asked to go and find it again.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'escalate-fontaine-file-server',
      app: 'tickets',
      label: 'Escalate it: it is their file server, and a helpdesk contract '
        + 'stops at the server',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-fontaine-file-server-full',
          params: {
            reported: 'Intermittent write failures saving into the document '
              + 'store at FONTAINE-LAW since yesterday afternoon.',
            tried:
              'Read the free space on FONT-FILE-01: about 2 GB left and '
              + 'falling, which is why the failures are intermittent rather '
              + 'than total\n'
              + 'Checked scope: helpdesk contract, FONT-FILE-01 is a server - '
              + 'not the desk\'s to clear down, however Windows it is',
          },
        },
      ],
    },
  ],
};

/**
 * The everyday grant, and the second short one.
 *
 * A matter workspace is a per-matter security group because the ethical wall
 * is, so being staffed on a matter and being able to open it are two separate
 * events and the second one is somebody's job. Nadia has already done the half
 * that is hers - checked conflicts - which is what makes this a grant rather
 * than a conversation.
 */
const FONTAINE_SUPERVISING_PARTNER: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.fontainePartnerAccount, MSP_IDS.fontaineMatterShare],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:msp-pool-fontaine-supervising-partner',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Fontaine: Marcus has been put on Delacroix and cannot open it',
      body:
        'Nadia reports that Marcus has been added as supervising partner on the '
        + 'Delacroix estate matter and the workspace is not there for him. She '
        + 'has checked conflicts and there is no wall on this one, so he is '
        + 'clear to be added.',
    },
    reporter: MSP_IDS.fontaineContact,
    // Nothing is broken and nothing is seeded: the fault is the absence of a
    // grant, which is what every access request in this game actually is.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: MSP_IDS.fontainePartnerAccount },
      to: { id: MSP_IDS.fontaineMatterShare },
      kind: 'has_access',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/matter-workspace-access',
  },
  cause: 'Being staffed on a matter and being in the matter\'s security group '
    + 'are two different events, and only the first of them happens by somebody '
    + 'saying so in a meeting. He is in none of the groups he has not been put '
    + 'in, which is the whole point of running the ethical wall as membership.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'grant-delacroix-to-mreyes',
      app: 'directory',
      label: 'Add Marcus to the Delacroix matter workspace',
      steps: [
        {
          action: HELPDESK_ACTIONS.shareGrantAccess,
          target: MSP_IDS.fontaineMatterShare,
          params: { account: MSP_IDS.fontainePartnerAccount },
        },
      ],
    },
  ],
};

/* -- MERIDIAN-SAAS: a SaaS shop, helpdesk, the Linux prod out of reach ---- */

/**
 * The restart nobody does, at the one customer where the person clicking Later
 * is the operations lead himself.
 *
 * Third of the short ones. Nothing is broken: a fortnight of updates are staged
 * and waiting for the box to go round once, which is what staged means, and the
 * prompt is the only thing that has ever asked.
 */
const MERIDIAN_RESTART_PROMPT: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.meridianLaptop],
  claimed_urgency: 1,
  true_urgency: 1,
  def: {
    id: 'ticket:msp-pool-meridian-restart-prompt',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Meridian: Theo\'s laptop has been asking to restart for a '
        + 'fortnight',
      body:
        'Theo has finally raised the thing his own machine has been nagging him '
        + 'about since the start of the month. He would like it to stop asking, '
        + 'and he is aware of how this reads coming from him.',
    },
    reporter: MSP_IDS.meridianContact,
    // The staged updates, which is the only thing wrong with the box.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.meridianLaptop,
        field: FIELDS.pendingUpdates,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.meridianLaptop },
      field: FIELDS.pendingUpdates,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-restart-nobody-does',
  },
  cause: 'Updates are staged rather than applied: they download, they sit, and '
    + 'they wait for the machine to go round once, because applying them under '
    + 'somebody mid-call is how you take a floor out at half past two. Nothing '
    + 'is broken and nothing will break - the updates finish on the way back up '
    + 'and the prompt is gone.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'restart-meri-ws-01',
      app: 'remote',
      label: 'Restart MERI-WS-01 and let the staged updates finish',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineReboot,
          target: MSP_IDS.meridianLaptop,
        },
      ],
    },
  ],
};

/**
 * Provisioned into the wrong group, which is two faults in one line and the
 * only two-step path in this pool.
 *
 * The same weekend migration the shipped SSO ticket is about, from the other
 * side: where Dana was simply not carried across, Nora was rebuilt BY HAND at
 * two in the morning and landed in the group next to the right one. So she
 * cannot open the CRM she needs, and she can reach the production tenant she
 * has never had any business in - and neither half is fixed by the other. Both
 * steps are load-bearing against the rule below, which is the honest shape: an
 * access review that closed on getting her into Salesforce and left her a
 * production admin would have closed on half a job.
 */
const MERIDIAN_WRONG_GROUPS: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.meridianAnalystAccount,
    MSP_IDS.meridianAppGroup,
    MSP_IDS.meridianProdAdmins,
  ],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-meridian-wrong-groups',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Meridian: Nora cannot open the CRM, and the access review has a '
        + 'question about her',
      body:
        'Theo has two things about the same person and suspects they are one '
        + 'thing. Nora has never once got into Salesforce since the weekend the '
        + 'SSO was rebuilt - she has been asking a colleague to pull reports '
        + 'for her, which he has been doing, which is why nobody raised it. And '
        + 'the access review has flagged her name in a group he is fairly sure '
        + 'an analyst should not be in.',
    },
    reporter: MSP_IDS.meridianContact,
    // The membership she should never have had. The one she SHOULD have is
    // simply absent, the way a missing grant always is.
    setup: [
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.meridianAnalystAccount,
          to: MSP_IDS.meridianProdAdmins,
          kind: 'member_of',
        },
      },
    ],
    // Both halves, because they are both the finding: out of the group she was
    // put in by mistake, and into the one she was meant to be in.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'not',
          expr: {
            op: 'edge',
            from: { id: MSP_IDS.meridianAnalystAccount },
            to: { id: MSP_IDS.meridianProdAdmins },
            kind: 'member_of',
          },
        },
        {
          op: 'edge',
          from: { id: MSP_IDS.meridianAnalystAccount },
          to: { id: MSP_IDS.meridianAppGroup },
          kind: 'member_of',
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/okta-app-assignment',
  },
  cause: 'Her account was rebuilt by hand during the SSO migration and put into '
    + 'Production Admins instead of Salesforce Users - two entries next to each '
    + 'other in the same list at two in the morning. Okta authenticates her, '
    + 'finds no assignment to the app, and drops her back on the dashboard, '
    + 'which is why the CRM has never worked for her; the group she did get is '
    + 'the reason the review flagged her. Taking the wrong one off does not give '
    + 'her the right one and adding the right one does not take the wrong one '
    + 'away, so this is one ticket with two things that have to happen in it.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'correct-nora-provisioning',
      app: 'directory',
      label: 'Take Nora out of Production Admins, then put her in Salesforce '
        + 'Users',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: MSP_IDS.meridianAnalystAccount,
          params: { group: MSP_IDS.meridianProdAdmins },
        },
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: MSP_IDS.meridianAnalystAccount,
          params: { group: MSP_IDS.meridianAppGroup },
        },
      ],
    },
  ],
};

/**
 * The deadline that is genuinely immovable and genuinely not yours.
 *
 * A customer-visible status page during a customer-visible incident is the one
 * piece of writing an outage is judged on afterwards, and Meridian's runs on
 * the product fleet - a Linux box, at a helpdesk customer. The pressure is
 * completely real and it changes nothing about the contract, which is the whole
 * point of the archetype here: the absurdity is not the deadline, it is the
 * expectation that a deadline moves a wall.
 */
const MERIDIAN_STATUS_PAGE: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.meridianAppServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-meridian-status-page',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'Meridian: the status page has to say something in the next ten '
        + 'minutes',
      body:
        'Theo is on the phone with the incident half-open in front of him. '
        + 'Their biggest customer\'s contract says a customer-visible incident '
        + 'is posted within thirty minutes, twenty of those are gone, and the '
        + 'person who normally publishes the page is on a plane. The status '
        + 'page is served off MERI-APP-01 with the product, so he is asking the '
        + 'desk to push the text he has already written.',
    },
    reporter: MSP_IDS.meridianContact,
    setup: [],
    // No branch where the desk publishes it: MERI-APP-01 is a Linux production
    // box at a helpdesk customer, and neither the contract nor the toolset
    // reaches it. Ten minutes is a reason to escalate faster, not further.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-meridian-status-page' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/msp-scope-escalation',
  },
  cause: 'The status page is a page on the product fleet, and the product fleet '
    + 'is a Linux server estate their own infrastructure team owns under a '
    + 'helpdesk contract. There is no version of this the desk can publish: not '
    + 'the contract, not the operating system, not the credentials. The '
    + 'deadline is real and it belongs to somebody who can actually reach the '
    + 'box, so the fastest thing that can be done from this chair is to get '
    + 'their on-call engineer on it with the text Theo has already written '
    + 'attached, in the first minute rather than the ninth.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'escalate-status-page',
      app: 'tickets',
      label: 'Escalate it to their on-call now, with the copy he has written',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-meridian-status-page',
          params: {
            reported: 'MERIDIAN-SAAS need their public status page updated '
              + 'inside a 30-minute contractual window; 20 minutes are gone.',
            tried:
              'Confirmed the status page is served from MERI-APP-01, the Linux '
              + 'product app server\n'
              + 'Checked scope: helpdesk contract, prod fleet is their infra '
              + 'team\'s - escalated immediately rather than spending the '
              + 'window finding that out',
          },
        },
      ],
    },
  ],
};

/* -- NORTHWIND-CLINIC: monitoring-only, escalate-and-mean-it -------------- */

/**
 * The watched box's own portal has stopped, and the answer is still a phone
 * call to somebody else.
 *
 * The shipped clinic tickets are all thresholds - a job that failed, a cert
 * counting down, a disk filling - and a threshold is easy to leave alone. This
 * one is an outage: patients are in front of a form that is not there, the fix
 * is a single restart, the desk can see exactly which service it is, and the
 * contract still says watch and notify. That gap is the entire lesson of a
 * monitoring-only account and it only bites when the fix is obvious.
 */
const NORTHWIND_PORTAL_STOPPED: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindPortal, MSP_IDS.northwindServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-northwind-portal-stopped',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Northwind: the clinic portal is down - the service has stopped',
      body:
        'The board has gone red on the clinic portal: the service on NW-SRV-01 '
        + 'is not running at all, and patients booking online are getting '
        + 'nothing. Ivy has rung to ask whether the desk can "just put it back '
        + 'on", which is a fair question and has the same answer it always has '
        + 'at this account.',
    },
    reporter: MSP_IDS.northwindContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.northwindPortal,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-northwind-portal-stopped' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/monitoring-only-alerts',
  },
  cause: 'The portal service on NW-SRV-01 is stopped, which is why the booking '
    + 'page answers nothing. Starting it again would almost certainly fix it, '
    + 'and starting it is remediation on an account that bought monitoring and '
    + 'not hands - the world refuses it, truthfully, and it would be out-of-'
    + 'scope work nobody agreed to and nobody is billing even if it did not. '
    + 'What the account is paying for is that somebody noticed within a minute '
    + 'and can tell their engineer exactly which service on which box, which is '
    + 'worth more to them than a restart done quietly and never written down.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-northwind-portal',
      app: 'tickets',
      label: 'Escalate it: monitoring-only, starting it is not contracted',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-northwind-portal-stopped',
          params: {
            reported: 'Clinic portal service on NW-SRV-01 is STOPPED; online '
              + 'booking is down for patients.',
            tried:
              'Read the service state off the board: stopped, not wedged and '
              + 'not certificate-related\n'
              + 'Checked the contract: monitoring-only, remediation out of '
              + 'scope - raised rather than started',
          },
        },
      ],
    },
  ],
};

/**
 * The clinic's shared folders, gone from desks the MSP has never seen.
 *
 * Ivy describes the reception machines because those are what she sits in front
 * of, and they are not on this contract at all - the MSP watches one server and
 * nothing else at Northwind. The cause is on the box that IS watched, which is
 * the small satisfaction of a monitoring-only account done properly: the one
 * thing they pay for is the one thing that answers the question.
 */
const NORTHWIND_SERVER_SERVICE: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindServer],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-northwind-server-service',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Northwind: "the shared folders have gone off both reception '
        + 'machines"',
      body:
        'Ivy rings to say that neither reception PC can reach the shared '
        + 'folders - the letters, the scanned referrals, all of it - and that '
        + 'the machines themselves seem fine. Those two PCs are not on the '
        + 'contract and the MSP has never logged into either of them. The one '
        + 'thing at Northwind the MSP does watch is the server they both point '
        + 'at.',
    },
    reporter: MSP_IDS.northwindContact,
    // The Server service is what publishes a Windows box's shares. Wedged, it
    // reports running and serves nobody, which is exactly the shape Ivy is
    // describing from the other end of it.
    setup: [
      {
        op: 'setField',
        id: baselineServiceId(MSP_IDS.northwindServer, 'LanmanServer'),
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-northwind-server-service' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/monitoring-only-alerts',
  },
  cause: 'The Server service on NW-SRV-01 has wedged. It is the service that '
    + 'publishes a Windows box\'s shares, so with it stuck the box is up, '
    + 'answers a ping, reports itself running and hands out no files at all - '
    + 'which from a reception desk is indistinguishable from two PCs having '
    + 'gone wrong at once. Neither of those PCs is on this contract and neither '
    + 'of them is the problem. Restarting the service on the server would clear '
    + 'it and is remediation on a monitoring-only account, so the job is to '
    + 'raise it naming the service, so their engineer does not spend the '
    + 'morning on the two machines Ivy described.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-northwind-server-service',
      app: 'tickets',
      label: 'Escalate it: name the wedged service, monitoring-only stops '
        + 'there',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-northwind-server-service',
          params: {
            reported: 'Both Northwind reception PCs (not on contract) have lost '
              + 'the shared folders on NW-SRV-01.',
            tried:
              'Read the watched server: the Server service (LanmanServer) is '
              + 'wedged - running, and serving nothing\n'
              + 'Checked the contract: monitoring-only, the restart is not the '
              + 'desk\'s - raised with the service named',
          },
        },
      ],
    },
  ],
};

/* -- HOLLOWAY-ACCT: a small practice, fully-managed, whole estate in reach - */

/** The payslip pack the export dialog dropped where nobody looks. */
const HOLLOWAY_PAYSLIP_PDF = fsEntryId(
  MSP_IDS.hollowayWorkstation,
  [...TEMP_SEGMENTS, 'PAYSLIPS-SEPT-BRAMBLE.PDF'],
  'file',
);
const HOLLOWAY_TEMP = tempDirId(MSP_IDS.hollowayWorkstation);
const HOLLOWAY_DOCS = myDocumentsDirId(MSP_IDS.hollowayWorkstation, 'pmehta');

/**
 * What is in the pack, so a tech can prove it is the right one before moving
 * anything. A payroll run for the wrong period, uploaded to a client portal, is
 * a worse afternoon than a missed cut-off.
 */
const HOLLOWAY_PAYSLIP_TEXT = [
  'PAYSLIP PACK - BRAMBLE & CO LTD',
  'Prepared by Holloway & Finch payroll bureau',
  '',
  'Tax year 2025-26   |   Period 06   |   42 employees',
  'Generated 09/09/2025  11:52 by pmehta',
  '',
  'This is the pack the bureau exported for the client portal.',
  'The export dialog opened where the payroll software last read',
  'from, which is why it is in WINDOWS\\TEMP and not in the folder',
  'the upload page starts in.',
].join('\n');

/**
 * The month's payroll, thirty seconds from where it needs to be, with a cut-off
 * nobody can move.
 *
 * BACS is a three-day cycle and the bureau's submission window closes at two, so
 * the deadline is arithmetic somebody else did years ago and it is not going to
 * bend for a file dialog. The fault is the smallest one in this file - a pack
 * exported to the directory the export dialog happened to be pointing at - and
 * the whole difficulty is the clock and the temptation to re-run the payroll
 * rather than go and look for the pack that already exists.
 */
const HOLLOWAY_PAYROLL_EXPORT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.hollowayWorkstation, MSP_IDS.hollowayContactAccount],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-holloway-payroll-export',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'Holloway: the payslip pack has vanished and BACS closes at two',
      body:
        'Priya exported a client\'s payslip pack out of the payroll software an '
        + 'hour ago, went to lunch, and has come back to a client portal asking '
        + 'her to choose a file and a folder with nothing in it. The bureau\'s '
        + 'BACS submission closes at two; after that the money moves a day '
        + 'late for forty-two people. She is about to run the whole payroll '
        + 'again, which she says will take fifty minutes '
        + 'and which she has correctly worked out she does not have.',
    },
    reporter: MSP_IDS.hollowayContact,
    // The pack, written into TEMP by the export dialog and never moved. It
    // arrives with the ticket for the same reason the e-filing PDF does: a
    // world that had it on Monday morning would be a world holding a file
    // somebody had not written yet.
    setup: [
      {
        op: 'addNode',
        node: {
          id: HOLLOWAY_PAYSLIP_PDF,
          kind: 'file',
          fields: {
            [FIELDS.name]: 'PAYSLIPS-SEPT-BRAMBLE.PDF',
            [FIELDS.modified]: '09/09/2025  11:52',
            [FIELDS.volume]: mspMachineHostname(MSP_IDS.hollowayWorkstation),
            [FIELDS.content]: HOLLOWAY_PAYSLIP_TEXT,
          },
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HOLLOWAY_TEMP,
          to: HOLLOWAY_PAYSLIP_PDF,
          kind: 'contains',
        },
      },
    ],
    // Closed when the pack is where the upload page opens - out of the
    // directory nobody looks in and into her own documents.
    resolved_when: {
      op: 'edge',
      from: { id: HOLLOWAY_DOCS },
      to: { id: HOLLOWAY_PAYSLIP_PDF },
      kind: 'contains',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/saved-into-temp',
  },
  cause: 'Nothing is broken and nothing was lost. The payroll software\'s export '
    + 'dialog opened where it had last read a file from rather than where a '
    + 'person would put one, so the pack went into WINDOWS\\TEMP, and the client '
    + 'portal\'s upload page opens in My Documents - two defaults that have '
    + 'never agreed and never will. The file is there, dated an hour ago, with '
    + 'the right client and the right period in the first line of it, which is '
    + 'worth reading before moving it: a pack for the wrong period uploaded on '
    + 'time is worse than one uploaded late. Re-running the payroll would also '
    + 'work and would spend fifty of the twenty minutes she has.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'place-the-payslip-pack',
      app: 'cmd',
      label: 'Move the payslip pack out of TEMP into her documents',
      steps: [
        {
          action: HELPDESK_ACTIONS.fileMove,
          target: HOLLOWAY_PAYSLIP_PDF,
          params: { from: HOLLOWAY_TEMP, to: HOLLOWAY_DOCS },
        },
      ],
    },
  ],
};

/**
 * One desk, not the office - the fourth of the short ones, and the distinction
 * the shipped shared-drive ticket teaches from the other side.
 *
 * Everybody losing the mapped drive at once is the server. One person losing
 * every mapped drive while the office carries on is the SMB client on that one
 * box, which is a service like any other and restarts like one.
 */
const HOLLOWAY_WORKSTATION_SERVICE: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.hollowayWorkstation],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:msp-pool-holloway-workstation-service',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Holloway: Priya has lost every mapped drive and nobody else has',
      body:
        'Priya reports that all of her mapped drives have gone at once on '
        + 'HOLL-WS-01 - S:, the scans folder, the lot - and that everybody else '
        + 'in the office is working normally, which she checked before ringing.',
    },
    reporter: MSP_IDS.hollowayContact,
    setup: [
      {
        op: 'setField',
        id: baselineServiceId(MSP_IDS.hollowayWorkstation, 'LanmanWorkstation'),
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: {
        id: baselineServiceId(MSP_IDS.hollowayWorkstation, 'LanmanWorkstation'),
      },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/power-cycle',
  },
  cause: 'The Workstation service on HOLL-WS-01 has wedged. It is the SMB '
    + 'client - the half of file sharing that does the asking - so with it stuck '
    + 'every mapped drive on that one machine stops resolving while the server '
    + 'and everybody else\'s desk carry on perfectly. That is the tell: one desk '
    + 'is the client, the whole office is the server. Restarting the service is '
    + 'the smallest thing that could be at fault, and it is a workstation, which '
    + 'is helpdesk work at any tier.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'restart-the-workstation-service',
      app: 'cmd',
      label: 'Restart the Workstation service on HOLL-WS-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: baselineServiceId(
            MSP_IDS.hollowayWorkstation,
            'LanmanWorkstation',
          ),
        },
      ],
    },
  ],
};

/**
 * Disabled, not locked - the state everybody reports as the other one.
 *
 * Priya says locked out because that is the word people have, and the fix for
 * locked out does a very tidy nothing here. The article this points at is the
 * one that exists precisely for this: three mechanisms wear the same face at
 * the login box and only one of them is an unlock. It is also the one action in
 * the helpdesk set that deserves a moment first, because somebody MEANT to
 * switch an account off - so the ticket does the work of establishing who did
 * and why, and the answer is a spreadsheet that matched the wrong row.
 */
const HOLLOWAY_DISABLED_ACCOUNT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.hollowayContactAccount, MSP_IDS.hollowayWorkstation],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-holloway-disabled-account',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Holloway: Priya cannot sign in and says she is locked out',
      body:
        'Priya is on the phone from the practice\'s spare handset: she cannot '
        + 'get in this morning and would like unlocking, please, quickly, '
        + 'because the whole office\'s post is sitting in a mailbox she is the '
        + 'only one who opens. She adds that Gordon signed in fine, so it is '
        + 'not the server, and she is right about that.',
    },
    reporter: MSP_IDS.hollowayContact,
    // The account is OFF rather than locked. It is the same complaint from the
    // user and a different job entirely, which is the whole of this ticket.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.hollowayContactAccount,
        field: FIELDS.enabled,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.hollowayContactAccount },
      field: FIELDS.enabled,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'She is not locked out. Her account is DISABLED, which is deliberate '
    + 'and permanent until somebody reverses it, and unlocking a disabled '
    + 'account achieves nothing at all - the door is not shut, the account is '
    + 'switched off. The practice runs its leavers list off a spreadsheet the '
    + 'MSP processes monthly, and this month it carried a row for a P Mehta who '
    + 'left a different firm the practice merged with in the spring. Knowing '
    + 'WHO switched it off and WHY is the part that matters, because enabling '
    + 'an account the leavers process disabled is a security incident with your '
    + 'name in the audit log - and here the answer is a duplicate name on a '
    + 'spreadsheet, which is worth writing on the ticket so it does not happen '
    + 'again next month.',
  dialogue_ref: 'dialogue/msp-priya',
  paths: [
    {
      id: 'enable-pmehta',
      app: 'directory',
      label: 'Switch the account back on for pmehta',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountEnable,
          target: MSP_IDS.hollowayContactAccount,
        },
      ],
    },
  ],
};

/* -- ELMWOOD-DENTAL: the hands-on Windows vertical, fully-managed --------- */

/** The spooler on the reception desktop, where the practice's paper lives. */
const ELMWOOD_RECEPTION_SPOOLER = baselineServiceId(
  MSP_IDS.elmwoodReception,
  'Spooler',
);

/**
 * The spooler, which is the fifth of the short ones and the most ordinary
 * ticket in this game.
 *
 * It is here rather than being written out of the pool because it IS the job: a
 * practice that cannot print a referral letter has stopped, and the fix is one
 * restart and no thinking at all. The article for it has been on the shelf
 * since the probation shop and does not need a second one.
 */
const ELMWOOD_RECEPTION_SPOOLER_TICKET: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.elmwoodReception],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:msp-pool-elmwood-reception-spooler',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Elmwood: reception cannot print referral letters or appointment '
        + 'cards',
      body:
        'Grace reports that nothing has come out of the reception printer since '
        + 'yesterday afternoon and the jobs are stacking up in the queue. The '
        + 'Print Spooler on ELM-WS-02 has wedged: running, and taking nothing '
        + 'and releasing nothing.',
    },
    reporter: MSP_IDS.elmwoodContact,
    setup: [
      {
        op: 'setField',
        id: ELMWOOD_RECEPTION_SPOOLER,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ELMWOOD_RECEPTION_SPOOLER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The Print Spooler wedged - the one status a spooler earns its own '
    + 'article for, where the service manager reports it running and it is '
    + 'neither accepting nor releasing a job. It is a workstation service on a '
    + 'fully-managed customer, so there is no wall in front of it and no '
    + 'cleverness required: restart it and the queue drains.',
  dialogue_ref: 'dialogue/msp-grace',
  paths: [
    {
      id: 'restart-the-reception-spooler',
      app: 'cmd',
      label: 'Restart the Print Spooler on ELM-WS-02',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ELMWOOD_RECEPTION_SPOOLER,
        },
      ],
    },
  ],
};

/** The service on the practice server that everything scheduled runs under. */
const ELMWOOD_SCHEDULER = baselineServiceId(MSP_IDS.elmwoodServer, 'Schedule');

/**
 * A week in which nothing scheduled happened, and nobody could have noticed.
 *
 * The nastiest shape a fault can take is one whose symptom is an absence: the
 * recall letters that did not print, the overnight job that did not run, the
 * export that did not land. Nothing goes red, nobody rings, and the practice
 * only finds out because a patient does. The cause is one wedged service on the
 * server, and the practice is fully-managed, so it is the desk's to fix.
 */
const ELMWOOD_TASK_SCHEDULER: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.elmwoodServer, MSP_IDS.elmwoodReception],
  // Grace files it as a query about one patient. It is a week of every
  // scheduled job on the practice server not having run.
  claimed_urgency: 1,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-elmwood-task-scheduler',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Elmwood: a patient rang to ask why she never got her recall',
      body:
        'Grace reports what she thinks is a one-off: a patient due a six-month '
        + 'check has rung to ask why nobody wrote to her. Grace has looked and '
        + 'the letter is not in the sent list. Then she looked at last week and '
        + 'that is not there either. She would like somebody to tell her it is '
        + 'the printer.',
    },
    reporter: MSP_IDS.elmwoodContact,
    setup: [
      {
        op: 'setField',
        id: ELMWOOD_SCHEDULER,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ELMWOOD_SCHEDULER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/power-cycle',
  },
  cause: 'It is not the printer. The Task Scheduler service on ELM-SRV-01 has '
    + 'wedged, and everything the practice does on a timer runs under it - the '
    + 'recall run, the overnight database backup job, the end-of-day export. A '
    + 'scheduled job that never starts produces no error, because nothing ever '
    + 'ran to have one, so a week of them going missing looks like nothing at '
    + 'all until a patient counts the months. Restarting the service on the '
    + 'server puts the schedule back; the recall run that was missed has to be '
    + 'started by hand afterwards, and that is the practice\'s to do rather '
    + 'than the desk\'s, but they need telling that it is.',
  dialogue_ref: 'dialogue/msp-grace',
  paths: [
    {
      id: 'restart-the-practice-scheduler',
      app: 'cmd',
      label: 'Restart the Task Scheduler service on ELM-SRV-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ELMWOOD_SCHEDULER,
        },
      ],
    },
  ],
};

/* -- ARDEN-MFG: co-managed, hand it back or coordinate then act ----------- */

/**
 * The other half of the RACI, and the one that is harder to hand back than a
 * lockout is: an expired password on somebody who is standing in front of a
 * terminal that will not let her start a shift.
 *
 * Under the co-managed split, day-to-day user support is Arden's own helpdesk's
 * - the MSP has servers, after-hours and specialist work - and this is as
 * day-to-day as it gets. Doing it anyway is not generous, it is two desks
 * acting on one account, which is precisely the failure the boundary is drawn
 * to prevent. Short, because the answer is short.
 */
const ARDEN_RESET_HANDBACK: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.ardenSupervisorAccount, MSP_IDS.ardenWorkstation],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:msp-pool-arden-reset-handback',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden: "her password has run out, can you just do it while you '
        + 'are in there"',
      body:
        'Marika\'s password has expired and she mailed the MSP alias again - it '
        + 'is the address in her sent items from last time, which is entirely '
        + 'understandable. Dev has forwarded it with the shrug of a man who '
        + 'knows exactly whose job this is and is trying his luck anyway.',
    },
    reporter: MSP_IDS.ardenContact,
    // The expiry is real and it is on their side of the line. Seeding it is the
    // honest version: there IS a fault, and it is not the MSP's to clear.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.ardenSupervisorAccount,
        field: FIELDS.passwordExpired,
        value: true,
      },
    ],
    // The RACI-correct close: route it to the desk whose job it is. A reset
    // from here would work and would be the wrong thing to have done.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-arden-reset-handback' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/co-managed-raci',
  },
  cause: 'Her password has expired, which is a policy clock running out on the '
    + 'credential rather than anything being broken, and the fix is a reset. '
    + 'Whose reset is the only question here: under the co-managed RACI, '
    + 'day-to-day user support belongs to Arden\'s own helpdesk, and the MSP '
    + 'has the servers, the after-hours and the specialist work. Doing it from '
    + 'this desk because the ticket happens to be open here is how two teams '
    + 'end up resetting the same account an hour apart and neither of them '
    + 'knows the other did.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'hand-the-reset-back',
      app: 'tickets',
      label: 'Hand it back: day-to-day user work is Arden\'s IT under the RACI',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-arden-reset-handback',
          params: {
            reported: 'Floor supervisor\'s password has expired; mailed the MSP '
              + 'alias rather than Arden\'s own helpdesk.',
            tried:
              'Confirmed the account state: password expired, not locked and '
              + 'not disabled - an ordinary reset\n'
              + 'Checked the RACI: day-to-day user support is Arden\'s team - '
              + 'routed back rather than double-handled',
          },
        },
      ],
    },
  ],
};

/** The Server service on Arden's IIS box, which is also its file share. */
const ARDEN_LANMAN = baselineServiceId(MSP_IDS.ardenServer, 'LanmanServer');

/**
 * Coordinate, then act - on a shared box, in the middle of a shift.
 *
 * ARDEN-SRV-01 is the MSP's to work on under the split, and that is where the
 * freedom ends: two teams can reach that server, so an unannounced change by
 * one is a change the other did not know about. The scope engine refuses the
 * unilateral restart and the notify clears it, which is why the path's label
 * says both halves out loud - the notify is the gate, not a courtesy.
 */
const ARDEN_SERVER_SERVICE: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.ardenServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-arden-server-service',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden: the shop floor cannot open the drawings folder',
      body:
        'Dev reports that nobody on the floor can reach the drawings share on '
        + 'ARDEN-SRV-01 - the machinists are working off a printed set from '
        + 'March, which he describes as "a quality problem waiting to be a '
        + 'safety one". His own people are on the line changeover and cannot '
        + 'get to it; the server is the MSP\'s under the split, so he is asking '
        + 'the desk to take it, coordinated.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [
      {
        op: 'setField',
        id: ARDEN_LANMAN,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ARDEN_LANMAN },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/co-managed-coordination',
  },
  cause: 'The Server service on ARDEN-SRV-01 has wedged. It is the service that '
    + 'publishes a Windows box\'s shares, so the box is up and answering and '
    + 'handing out no files - which is why the portal on the same machine is '
    + 'fine and the drawings folder is not. It is a server, which under the '
    + 'co-managed split is the MSP\'s to work on, and the estate is shared, '
    + 'which is why acting on it unannounced is refused: notify their IT first '
    + '("notify <service>") so nobody trips over anybody on that box, and then '
    + 'restart the service.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'coordinate-then-restart-lanmanserver',
      app: 'cmd',
      label: 'Notify Arden\'s IT, then restart the Server service on '
        + 'ARDEN-SRV-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ARDEN_LANMAN,
        },
      ],
    },
  ],
};

/* -- MARLOWE-STUDIO: the Mac vertical, fully-managed ---------------------- */

/**
 * The volume that is not there, and the Mac that is fine.
 *
 * The Windows-shaped instinct on a Mac estate is to blame the Mac, and Rosa
 * arrives having already done it for you - she has restarted it, she has
 * unplugged the network cable, she is asking whether the machine needs
 * "reinstalling". None of that was ever going to help, because a share somebody
 * has no access to and a share that does not exist look identical from the
 * Finder sidebar: both are simply absent. The fix is a grant, on the account,
 * and the machine never had anything wrong with it.
 */
const MARLOWE_SHARE_ACCESS: WorldTicket = {
  arrival: 'drip',
  nodes: [
    MSP_IDS.marloweFreelancerAccount,
    MSP_IDS.marloweProjectShare,
    MSP_IDS.marloweNas,
  ],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:msp-pool-marlowe-share-access',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Marlowe: Luca\'s Mac cannot see the Projects volume at all',
      body:
        'Rosa reports that Luca can see the NAS in the Finder sidebar, sign in '
        + 'to it, and then be shown nothing - the Projects volume everybody '
        + 'else mounts is simply not in the list for him. She has restarted the '
        + 'Mac, moved him to a different desk and asked whether it needs '
        + 'reinstalling, and she would like to know why the same machine that '
        + 'worked for Corin does not work for Luca.',
    },
    reporter: MSP_IDS.marloweContact,
    // Nothing is broken and nothing is seeded: he has never been granted it,
    // which is the whole of the fault and the reason it looks like a Mac fault.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: MSP_IDS.marloweFreelancerAccount },
      to: { id: MSP_IDS.marloweProjectShare },
      kind: 'has_access',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/share-access-not-the-machine',
  },
  cause: 'A file server hands a client the list of shares that client is '
    + 'allowed to see, so a volume somebody has no rights to is not a volume '
    + 'they are refused - it is a volume that is not in their list. From the '
    + 'Finder that is indistinguishable from the share having been deleted, '
    + 'which is why the conversation goes to the Mac and stays there. He signed '
    + 'in successfully, which is the tell: authentication worked and '
    + 'authorisation is what is missing. He was set up as a freelancer on the '
    + 'day he arrived and the Projects volume was never on the list somebody '
    + 'worked through, so granting his account access to the share is the whole '
    + 'of the fix and the machine was never part of it.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'grant-projects-to-luca',
      app: 'directory',
      label: 'Grant Luca\'s account access to the Projects volume',
      steps: [
        {
          action: HELPDESK_ACTIONS.shareGrantAccess,
          target: MSP_IDS.marloweProjectShare,
          params: { account: MSP_IDS.marloweFreelancerAccount },
        },
      ],
    },
  ],
};

/**
 * Expired, not locked and not wrong - the last of the short ones, and the third
 * face the login box wears.
 *
 * A Mac says the password is incorrect when the directory behind it says the
 * password is out of date, so the reporter arrives certain somebody has changed
 * something. Nobody has. The credential's clock ran out and the account is
 * perfectly healthy.
 */
const MARLOWE_PASSWORD_EXPIRED: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.marloweDesignerAccount, MSP_IDS.marloweDesignMac],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:msp-pool-marlowe-password-expired',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Marlowe: Corin\'s password "has stopped working"',
      body:
        'Rosa reports that Corin\'s password is being refused on his own Mac '
        + 'and that he has definitely not changed it, which she says with the '
        + 'confidence of somebody who has watched him type it. Nothing else '
        + 'about the machine is wrong.',
    },
    reporter: MSP_IDS.marloweContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.marloweDesignerAccount,
        field: FIELDS.passwordExpired,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.marloweDesignerAccount },
      field: FIELDS.passwordExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'His password has expired. It is the third of the three states that '
    + 'wear the same face at a login box - locked, disabled, expired - and it '
    + 'is the one where the account is completely healthy and the credential is '
    + 'out of date. Unlocking it would do nothing, because nobody locked it; '
    + 'the fix is a reset, and he will be asked to choose a new one at the next '
    + 'sign-in, which is the ticket after this one if nobody tells him.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'reset-cadeyemi',
      app: 'directory',
      label: 'Reset the password for cadeyemi',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountResetPassword,
          target: MSP_IDS.marloweDesignerAccount,
        },
      ],
    },
  ],
};

/**
 * A full disk with nothing on it to delete.
 *
 * Every other full-drive ticket in this game is a cleanup: something automatic
 * has been writing a second copy since 1997 and the fix is to empty it. This is
 * the honest opposite, and it is the ordinary case at a studio - the NAS is
 * full of live jobs, every one of them the only copy there is, and there is no
 * clever answer that makes room. That makes it a purchase rather than a fix,
 * and a purchase is somebody else's decision - so the desk's job is to raise it
 * with numbers on it, early enough to be a conversation rather than an outage.
 */
const MARLOWE_NAS_CAPACITY: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.marloweNas, MSP_IDS.marloweProjectShare],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:msp-pool-marlowe-nas-capacity',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Marlowe: the project NAS is nearly full and there is a shoot next '
        + 'week',
      body:
        'Rosa reports that the NAS has started warning about space and asks '
        + 'whether somebody can "clear the old stuff off". There are a hundred '
        + 'and twenty gigabytes left on it and a three-day shoot next week that '
        + 'the producer has already told her will land about four terabytes of '
        + 'rushes.',
    },
    reporter: MSP_IDS.marloweContact,
    // The number, on the box. It is a fact about capacity rather than a fault:
    // nothing on the NAS is wrong and nothing on it is a second copy.
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.marloweNas,
        field: FIELDS.diskFree,
        value: 128_849_018_880,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:msp-pool-marlowe-nas-capacity' },
      field: FIELDS.escalated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/capacity-is-not-a-cleanup',
  },
  cause: 'There is no "old stuff". Everything on the project NAS is a live job '
    + 'or a delivered one the studio is contractually holding, every file on it '
    + 'is the only copy of itself, and nothing automatic has been quietly '
    + 'writing a second one - which is what makes this different from every '
    + 'other full drive on this estate. A hundred and twenty gigabytes against '
    + 'four terabytes of incoming rushes is not a housekeeping problem, it is a '
    + 'capacity one, and no amount of looking will turn it into the first kind. '
    + 'Deleting somebody\'s job to buy a week is the one move that would make '
    + 'this genuinely unrecoverable. It wants raising as a purchase, with the '
    + 'free space, the date of the shoot and the size of it, while there is '
    + 'still a week to get disks in.',
  dialogue_ref: 'dialogue/msp-rosa',
  paths: [
    {
      id: 'escalate-nas-capacity',
      app: 'tickets',
      label: 'Raise it as a capacity request, with the numbers and the date',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:msp-pool-marlowe-nas-capacity',
          params: {
            reported: 'MARLOWE-STUDIO project NAS (MARL-NAS-01) is down to '
              + '~120 GB free with a three-day shoot next week expected to '
              + 'produce ~4 TB.',
            tried:
              'Read the free space off MARL-NAS-01 and checked what is on it: '
              + 'live and delivered jobs, no second copies, nothing disposable '
              + 'to clear\n'
              + 'This is a capacity purchase rather than a clear-down - raised '
              + 'now so disks can be in before the shoot rather than after it',
          },
        },
      ],
    },
  ],
};

export const POOL_MSP_TICKETS: readonly WorldTicket[] = [
  // FONTAINE-LAW - the law firm, helpdesk scope: a lockout, the server-room
  // door on a Windows box, and a matter grant.
  FONTAINE_PARTNER_LOCKOUT,
  FONTAINE_FILE_SERVER_FULL,
  FONTAINE_SUPERVISING_PARTNER,
  // MERIDIAN-SAAS - the SaaS shop: the restart nobody does, a provisioning
  // mistake that is two faults, and a deadline that does not move a contract.
  MERIDIAN_RESTART_PROMPT,
  MERIDIAN_WRONG_GROUPS,
  MERIDIAN_STATUS_PAGE,
  // NORTHWIND-CLINIC - monitoring-only: an outage with an obvious fix, and a
  // cause on the one box the contract covers.
  NORTHWIND_PORTAL_STOPPED,
  NORTHWIND_SERVER_SERVICE,
  // HOLLOWAY-ACCT - fully-managed: a payroll cut-off, one desk that is not the
  // office, and the state everybody reports as a lockout.
  HOLLOWAY_PAYROLL_EXPORT,
  HOLLOWAY_WORKSTATION_SERVICE,
  HOLLOWAY_DISABLED_ACCOUNT,
  // ELMWOOD-DENTAL - fully-managed: the spooler, and a week in which nothing
  // scheduled happened.
  ELMWOOD_RECEPTION_SPOOLER_TICKET,
  ELMWOOD_TASK_SCHEDULER,
  // ARDEN-MFG - co-managed: the hand-back, and the coordinate-then-act.
  ARDEN_RESET_HANDBACK,
  ARDEN_SERVER_SERVICE,
  // MARLOWE-STUDIO - the Mac vertical: a grant that looks like a Mac fault, an
  // expired password, and a disk that is simply full.
  MARLOWE_SHARE_ACCESS,
  MARLOWE_PASSWORD_EXPIRED,
  MARLOWE_NAS_CAPACITY,
];
