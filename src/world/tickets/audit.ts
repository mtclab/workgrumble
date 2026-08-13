/**
 * The five tickets the audit queue deals (E9, 0.36.0 - the SD-senior rung).
 *
 * They are ordinary tickets in every respect the engine cares about: real
 * faults on estate the shop already has, real reporters, real fixes through
 * verbs the registry already holds, and the solvability gate drives every one
 * of them like any other. What makes them the second queue is not the ticket -
 * it is that somebody has ALREADY TRIAGED it, and the filing is on the node
 * before the player sees it (`src/world/audit.ts`).
 *
 * THE CLASS, and why it is three faults on one box. Three of these are the
 * print server, and the joke is the estate's own arithmetic: PRINT-01 carries
 * eleven people and a workstation's spooler carries one, so "a service has
 * stopped and somebody cannot print" is a P4 on one desk and a P2 on the floor,
 * and the two look identical on a ticket form. That is the misreading a first-
 * line analyst makes over and over, it is the one thing an impact walk can
 * settle, and it is what the article at the end of the beat is about. The
 * fourth and fifth are the other two ways to get a filing wrong: the table
 * ignored, and the VIP flag read off whoever typed it.
 *
 * NOTHING NEW ON THE ESTATE. No machine, no verb and no app: every fix here is
 * a service restart or an unlock, which is deliberate - this slice is about the
 * SECOND QUEUE, and a set-piece fault behind each audit would be a content
 * epic wearing a mechanic's clothes.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { baselineServiceId } from '../services';
import type { WorldTicket } from './types';

/* -- the print server, three ways ----------------------------------------- */

const PRINT_SCHEDULE = baselineServiceId(COMPANY_IDS.printServer, 'Schedule');
const PRINT_WORKSTATION = baselineServiceId(
  COMPANY_IDS.printServer,
  'LanmanWorkstation',
);
const PRINT_BROWSER = baselineServiceId(COMPANY_IDS.printServer, 'Browser');
const MARKETING_SPOOLER = baselineServiceId(
  COMPANY_IDS.dennisMachine,
  'Spooler',
);

/**
 * Instance one of the class: the overnight job that clears the queue has not
 * run, so by mid-morning nothing prints for anybody - and exactly one person
 * rang about it, which is what the filing is a reading of.
 */
const AUDIT_PRINT_TASK: WorldTicket = {
  arrival: 'drip',
  nodes: [PRINT_SCHEDULE, COMPANY_IDS.printServer],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:audit-print-task',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Printing has gone slow and then stopped',
      body:
        'Nina reports that her jobs sit in the queue and never come out, and '
        + 'that this also happened last month. She is the only person who has '
        + 'rung, because she is the only person who sits near enough to the '
        + 'printer to have noticed nothing coming out of it.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: PRINT_SCHEDULE,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PRINT_SCHEDULE },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'Task Scheduler is stopped on PRINT-01, so the nightly job that '
    + 'clears jobs out of the queue has not run since Friday. The queue is '
    + 'full, and a full queue on the print server is the whole building, not '
    + 'the one desk that rang.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'audit-restart-print-schedule',
      app: 'cmd',
      label: 'Start the Task Scheduler service on PRINT-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: PRINT_SCHEDULE },
      ],
    },
  ],
};

/** Instance two: the same box, the same misreading, a different service. */
const AUDIT_PRINT_WORKSTATION: WorldTicket = {
  arrival: 'drip',
  nodes: [PRINT_WORKSTATION, COMPANY_IDS.printServer],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:audit-print-workstation',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Cannot add the printer on a new machine',
      body:
        'Terry has a rebuilt machine and cannot add the office printer to it. '
        + 'The wizard finds the name and then says the driver cannot be '
        + 'retrieved. He has tried it twice and has gone to lunch.',
    },
    reporter: COMPANY_IDS.terry,
    setup: [
      {
        op: 'setField',
        id: PRINT_WORKSTATION,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PRINT_WORKSTATION },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Workstation service is stopped on PRINT-01, so the print server '
    + 'cannot read the driver share it hands drivers out of. Every machine '
    + 'that has the printer already keeps printing, which is why one person '
    + 'has rung and the rest find out tomorrow.',
  dialogue_ref: 'dialogue/estimating',
  paths: [
    {
      id: 'audit-restart-print-workstation',
      app: 'cmd',
      label: 'Start the Workstation service on PRINT-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: PRINT_WORKSTATION },
      ],
    },
  ],
};

/**
 * Instance three, and the one the article changes: with the write-up on the
 * shelf the junior looks the class up and files it correctly, which is the
 * compounding half of the KB beat.
 */
const AUDIT_PRINT_BROWSER: WorldTicket = {
  arrival: 'drip',
  nodes: [PRINT_BROWSER, COMPANY_IDS.printServer],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:audit-print-browser',
    archetype: 'hidden_cause',
    flavor: {
      title: 'PRINT-01 has disappeared off the network',
      body:
        'Hilda cannot see PRINT-01 in Network Neighbourhood any more and has '
        + 'concluded that somebody has taken it away. It is still there. She '
        + 'would like it put back.',
    },
    reporter: COMPANY_IDS.hilda,
    setup: [
      {
        op: 'setField',
        id: PRINT_BROWSER,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PRINT_BROWSER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'Computer Browser is stopped on PRINT-01, so the box no longer '
    + 'announces itself and nothing lists it. Anybody who has it already '
    + 'prints fine; anybody setting a machine up from today cannot find it.',
  dialogue_ref: 'dialogue/warehouse',
  paths: [
    {
      id: 'audit-restart-print-browser',
      app: 'cmd',
      label: 'Start the Computer Browser service on PRINT-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: PRINT_BROWSER },
      ],
    },
  ],
};

/* -- the table ignored ---------------------------------------------------- */

/**
 * One desk, genuinely - and the number underneath the cell is not the one the
 * nine cells make of it. The whole fault is arithmetic, and the arithmetic is
 * printed on the triage panel.
 */
const AUDIT_MARKETING_SPOOLER: WorldTicket = {
  arrival: 'drip',
  nodes: [MARKETING_SPOOLER, COMPANY_IDS.dennisMachine],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:audit-marketing-spooler',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Nothing prints from my machine and the mailer goes tonight',
      body:
        'Dennis cannot print anything at all from MKT-01. Everybody either '
        + 'side of him prints fine off the same printer. The proof for the '
        + 'mailer has to be signed off by five, on paper, by somebody who '
        + 'will not read it on a screen.',
    },
    reporter: COMPANY_IDS.dennis,
    setup: [
      {
        op: 'setField',
        id: MARKETING_SPOOLER,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MARKETING_SPOOLER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Print Spooler service on MKT-01 is stopped. A job is handed to '
    + 'the spooler on the machine it was printed from before it goes '
    + 'anywhere, so it never leaves the desk - and it is one desk, which is '
    + 'the half of the filing that was right.',
  dialogue_ref: 'dialogue/marketing',
  paths: [
    {
      id: 'audit-restart-marketing-spooler',
      app: 'cmd',
      label: 'Start the Print Spooler service on MKT-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: MARKETING_SPOOLER },
      ],
    },
  ],
};

/* -- the flag read off the person who typed it ---------------------------- */

/**
 * The shadow-VIP truth, as one ticket: reception types it, the Service Delivery
 * Lead is the one locked out, and the VIP list covers him. Everything about the
 * filing is right except whose name the flag was read off.
 */
const AUDIT_LEAD_LOCKED: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.bossAccount],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:audit-lead-locked',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Raising this for Desmond - he cannot get in',
      body:
        'Bev has typed this up because Desmond asked her to on his way past '
        + 'reception. He has locked himself out again, he is in back-to-back '
        + 'meetings until eleven, and he would rather it were dealt with '
        + 'before he comes out of them.',
    },
    reporter: COMPANY_IDS.bev,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.bossAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.bossAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.bossAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.bossAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The lockout counter tripped on dfrisk. One account, one person - and '
    + 'that person is on the list the queue-jump rule reads, which is a fact '
    + 'about the beneficiary rather than about the reporter.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'audit-unlock-dfrisk',
      app: 'directory',
      label: 'Unlock dfrisk in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.bossAccount,
        },
      ],
    },
  ],
};

export const AUDIT_TICKETS: readonly WorldTicket[] = Object.freeze([
  AUDIT_PRINT_TASK,
  AUDIT_MARKETING_SPOOLER,
  AUDIT_LEAD_LOCKED,
  AUDIT_PRINT_WORKSTATION,
  AUDIT_PRINT_BROWSER,
]);
