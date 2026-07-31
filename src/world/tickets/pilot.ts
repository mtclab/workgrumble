import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

const PRINTER_QUEUE_DEPTH = 47;

/**
 * How many wrong passwords this directory takes before it shuts the door.
 *
 * Written down because it is the number the account carries when the player
 * reads it, and because the lockout story is only a story if the count in the
 * directory and the count in the fiction are the same number.
 */
export const LOCKOUT_THRESHOLD = 5;

/**
 * Pilot ticket 1 - hidden_cause. The reported symptom ("hacked") and the
 * faulty field (a rotated display) are not the same thing, which is the whole
 * genre in one ticket.
 */
export const ROTATED_SCREEN: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.adaMachine],
  // She has said the word "police". It is one desk and a keyboard shortcut,
  // but she genuinely cannot work sideways, so it is not the bottom of the
  // pile either.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:rotated-screen',
    archetype: 'hidden_cause',
    flavor: {
      title: 'I have been hacked and I want it logged',
      body:
        'Ada reports that her screen "went sideways on its own" over the '
        + 'weekend and would like to know whether the police need to be '
        + 'involved. She mentions, as an unrelated aside, that a colleague '
        + 'was messing about at her desk on Friday afternoon.',
    },
    reporter: COMPANY_IDS.ada,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.adaMachine,
        field: FIELDS.displayRotation,
        value: 90,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.adaMachine },
      field: FIELDS.displayRotation,
      value: 0,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4, money: 15 },
    kb_ref: 'kb/display-rotation',
  },
  cause: 'Somebody pressed the screen-rotation shortcut on SALES-02 and left '
    + 'for the weekend.',
  dialogue_ref: 'dialogue/rotated-screen',
  paths: [
    {
      id: 'cmd-rotate',
      app: 'cmd',
      label: 'Turn the display back with rotate SALES-02 0',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineSetDisplayRotation,
          target: COMPANY_IDS.adaMachine,
          params: { rotation: 0 },
        },
      ],
    },
    {
      id: 'remote-rotate',
      app: 'remote',
      label: 'Fix it on her screen through Remote Assist',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineSetDisplayRotation,
          target: COMPANY_IDS.adaMachine,
          params: { rotation: 0 },
        },
      ],
    },
    {
      id: 'chat-walk-through',
      app: 'chat',
      label: 'Talk her through the shortcut herself, over chat',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineSetDisplayRotation,
          target: COMPANY_IDS.adaMachine,
          params: { rotation: 0 },
        },
      ],
    },
  ],
};

/**
 * Pilot ticket 2 - read_the_screen. The answer is on the reporter's monitor,
 * in English, and has been read aloud to you twice.
 */
export const LOCKED_ACCOUNT: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.garyAccount],
  // One person, and that person cannot do anything at all until it is
  // cleared. High urgency is the one thing Gary is right about.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:locked-account',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Computer says the password is wrong (it is not wrong)',
      body:
        'Gary is back from two weeks away and cannot get in. He has read the '
        + 'message on his screen out to you twice - "This account has been '
        + 'locked out, please contact support" - without noticing that it is '
        + 'also the answer. He is typing the password correctly. That was '
        + 'never the problem.',
    },
    reporter: COMPANY_IDS.gary,
    // The lockout as it actually happened, in the order it happened in: five
    // failed attempts first thing, then the directory shutting the door. Both
    // are in the graph rather than in the flavour text, because the directory
    // and the event log are where a tech reads this - and because "3 bad
    // attempts at 04:12 while they were away" is the whole diagnosis.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.garyAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.garyAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.garyAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.garyAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2, money: 8 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The lockout tripped this morning after five failed attempts and '
    + 'nothing has cleared it since. Gary has been away a fortnight and has '
    + 'not signed in once in that time, which is the other half of the story '
    + 'the directory tells.',
  dialogue_ref: 'dialogue/locked-account',
  paths: [
    {
      id: 'directory-unlock',
      app: 'directory',
      label: 'Unlock the account in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.garyAccount,
        },
      ],
    },
    {
      id: 'cmd-unlock',
      app: 'cmd',
      label: 'Unlock it with unlock gpoole',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.garyAccount,
        },
      ],
    },
  ],
};

/**
 * Pilot ticket 3 - hidden_cause, two steps IN ORDER. Queued jobs survive a
 * restart on purpose, so starting the spooler before emptying the queue only
 * hands it the job that jammed it. Clear first, then start.
 */
export const WEDGED_SPOOLER: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.spooler, COMPANY_IDS.printer],
  // The one ticket in the pile that really is what it says it is: nobody in
  // the building can print, and forty-seven jobs are stacked behind it.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:wedged-spooler',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The printer is haunted',
      body:
        'Nina reports that the Hercules 400 hums, flashes and prints nothing. '
        + `There are ${String(PRINTER_QUEUE_DEPTH)} jobs queued behind `
        + 'whatever it is brooding about, four of which are the same delivery '
        + 'note re-sent by increasingly short-tempered people.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.spooler,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.printer,
        field: FIELDS.queueLen,
        value: PRINTER_QUEUE_DEPTH,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.spooler },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.printer },
          field: FIELDS.queueLen,
          value: 0,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5, money: 20 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The spooler on PRINT-01 wedged on a malformed job and everything '
    + 'sent since has piled up behind it.',
  dialogue_ref: 'dialogue/wedged-spooler',
  paths: [
    {
      id: 'cmd-clear-and-restart',
      app: 'cmd',
      label: 'clearqueue on the Hercules, then restart spooler',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.spooler,
        },
      ],
    },
    {
      id: 'remote-services-panel',
      app: 'remote',
      label: 'Empty the queue from the hardware panel on PRINT-01, then start '
        + 'the spooler from its taskbar',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.spooler,
        },
      ],
    },
  ],
};

export const PILOT_TICKETS: readonly WorldTicket[] = [
  ROTATED_SCREEN,
  LOCKED_ACCOUNT,
  WEDGED_SPOOLER,
];
