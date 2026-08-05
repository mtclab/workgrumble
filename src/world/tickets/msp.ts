/**
 * The MSP employer's SKELETON tickets (0.8.0, Pass A).
 *
 * Just enough to PROVE the customer mechanics through the real path, one per
 * customer, each carrying its true scope:
 *
 *  - FONTAINE-LAW (helpdesk): a locked account - a workstation user, IN scope,
 *    closed by unlocking it. This is the desk's own job at a customer.
 *  - MERIDIAN-SAAS (helpdesk): the same shape at the SaaS company - a laptop
 *    user locked out, in scope - so the in-scope path is proven at a customer
 *    whose PROD is out of reach on OS and contract both (proven by the mechanic
 *    tests, not by a ticket the player could ever close there).
 *  - NORTHWIND-CLINIC (monitoring-only): a backup alert the player may only
 *    ACKNOWLEDGE and ESCALATE - closed by escalation, because remediation is out
 *    of contract. A player who reaches to FIX it is refused, truthfully.
 *
 * The rich per-vertical ticket streams the arc plan cites (the DMS deadlock, the
 * Okta SSO loop, the e-filing panic) are a LATER pass; these three exist to give
 * the scope, tenant and OS mechanics teeth. Each reuses an existing KB article
 * rather than shipping vertical KB content this pass.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { FIELDS, SERVICE_STATUS } from '../fields';
import { MSP_IDS } from '../msp-company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/** A law-firm helpdesk lockout: in scope, closed by unlocking the account. */
const FONTAINE_LOCKOUT: WorldTicket = {
  arrival: 'morning',
  nodes: [MSP_IDS.fontaineContactAccount, MSP_IDS.fontaineWorkstation],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:fontaine-lockout',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Fontaine: locked out, and court at ten',
      body:
        'Nadia at Fontaine & Associates cannot sign in - the account is locked '
        + 'after a run of failed attempts this morning. She has a filing at ten '
        + 'and would like this treated as urgent, which at a law firm it '
        + 'genuinely is.',
    },
    reporter: MSP_IDS.fontaineContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.fontaineContactAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.fontaineContactAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'A run of failed sign-ins locked the account this morning. A '
    + 'workstation user at a helpdesk customer - squarely the desk\'s job.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: [
    {
      id: 'unlock-nadia',
      app: 'cmd',
      label: 'Unlock the account for nfontaine',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: MSP_IDS.fontaineContactAccount,
        },
      ],
    },
  ],
};

/** The same in-scope shape at Meridian, whose product fleet is out of reach. */
const MERIDIAN_LOCKOUT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.meridianContactAccount, MSP_IDS.meridianLaptop],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:meridian-lockout',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Meridian: Theo locked out of his laptop account',
      body:
        'Theo at Meridian is locked out after fat-fingering his password on a '
        + 'new laptop. He mentions, as he always does, that "the app servers are '
        + 'fine" - which they are, and which is not something you could touch if '
        + 'they were not.',
    },
    reporter: MSP_IDS.meridianContact,
    setup: [
      {
        op: 'setField',
        id: MSP_IDS.meridianContactAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: MSP_IDS.meridianContactAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'A mistyped password locked the account. The user is in scope; the '
    + 'Linux product fleet he mentions is not, on OS and contract both.',
  dialogue_ref: 'dialogue/msp-theo',
  paths: [
    {
      id: 'unlock-theo',
      app: 'cmd',
      label: 'Unlock the account for tmarsh',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: MSP_IDS.meridianContactAccount,
        },
      ],
    },
  ],
};

/**
 * The monitoring-only alert. The ONLY honest ending is escalation: the contract
 * is watch-and-notify, so the ticket closes when it is escalated, not when the
 * service is fixed - and a player who tries to fix it is refused by the scope
 * engine. Its resolution rule accepts an escalation, which is the same
 * escalate-and-mean-it path the hardware ticket has.
 */
const NORTHWIND_ALERT: WorldTicket = {
  arrival: 'drip',
  nodes: [MSP_IDS.northwindServer, MSP_IDS.northwindBackup],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:northwind-backup-alert',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Northwind: backup alert on NW-SRV-01',
      body:
        'The monitoring board is red on NW-SRV-01: the backup service has '
        + 'wedged. Northwind is a monitoring-only account - the MSP watches this '
        + 'box and nothing more - so the job is to raise it, not to reach in and '
        + 'restart it.',
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
    kb_ref: 'kb/event-log',
  },
  cause: 'The backup service wedged. On a monitoring-only contract the fix is '
    + 'out of scope; acknowledging and escalating IS the job.',
  dialogue_ref: 'dialogue/msp-ivy',
  paths: [
    {
      id: 'escalate-northwind',
      app: 'tickets',
      label: 'Escalate it: monitoring-only, remediation is not contracted',
      steps: [
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:northwind-backup-alert',
          params: {
            reported: 'Backup service wedged on NW-SRV-01 (monitoring alert).',
            tried:
              'Confirmed the alert on the board\nChecked the contract: '
              + 'monitoring-only, remediation out of scope',
          },
        },
      ],
    },
  ],
};

export const MSP_TICKETS: readonly WorldTicket[] = [
  FONTAINE_LOCKOUT,
  MERIDIAN_LOCKOUT,
  NORTHWIND_ALERT,
];
