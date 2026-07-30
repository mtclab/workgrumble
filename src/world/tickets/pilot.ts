import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, SERVICE_STATUS } from '../fields';
import type { WorldTicket } from './types';

const PRINTER_QUEUE_DEPTH = 47;

/**
 * Pilot ticket 1 - hidden_cause. The reported symptom ("hacked") and the
 * faulty field (a rotated display) are not the same thing, which is the whole
 * genre in one ticket.
 */
export const ROTATED_SCREEN: WorldTicket = {
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
    sla_ticks: 300,
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
    setup: [
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
    sla_ticks: 480,
    reward: { reputation: 2, money: 8 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The lockout tripped while Gary was away and nothing has cleared it '
    + 'since.',
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
 * Pilot ticket 3 - hidden_cause, two steps. Restarting the spooler is not
 * enough on its own: the backlog it choked on is still there afterwards.
 */
export const WEDGED_SPOOLER: WorldTicket = {
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
    sla_ticks: 360,
    reward: { reputation: 5, money: 20 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The spooler on PRINT-01 wedged on a malformed job and everything '
    + 'sent since has piled up behind it.',
  dialogue_ref: 'dialogue/wedged-spooler',
  paths: [
    {
      id: 'cmd-restart-and-clear',
      app: 'cmd',
      label: 'restart spooler, then clearqueue on the Hercules',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.spooler,
        },
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
        },
      ],
    },
    {
      id: 'remote-services-panel',
      app: 'remote',
      label: 'Restart it from the services panel on PRINT-01, then empty the '
        + 'queue',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.spooler,
        },
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
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
