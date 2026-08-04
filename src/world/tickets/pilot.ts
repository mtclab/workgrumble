import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import { encodeSpoolJob } from '../listings';
import { stampAt } from '../hours';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

const PRINTER_QUEUE_DEPTH = 47;

/**
 * The pile itself, which is a directory as well as a number.
 *
 * A queue length can be a count; a spool directory cannot - it holds files,
 * and files have sizes and times. So the world holds the jobs, one line per
 * job, and everything that moves the count moves the list in the same breath.
 * The two are asserted to agree, which is the only reason a count and a list
 * are allowed to live beside each other at all.
 *
 * Nothing in a line is a document name or an owner: a spool file is named
 * after its job number, so what the world holds is exactly what a listing
 * prints and no more. The four identical sizes are the four copies of the same
 * delivery note, re-sent by increasingly short-tempered people - which is the
 * diagnosis the ticket's own flavour text promises, sitting in the directory
 * where a tech would find it.
 */
const DELIVERY_NOTE_BYTES = 40_960;

const JOB_BYTES: readonly number[] = [
  12_288, 8_192, 4_096, 233_472, 6_144, 16_384, 2_048,
  DELIVERY_NOTE_BYTES, 30_720, 5_120, 61_440, 10_240, 3_072, 24_576,
  DELIVERY_NOTE_BYTES, 7_168, 143_360, 9_216, 20_480, 4_096, 51_200,
  DELIVERY_NOTE_BYTES, 13_312, 2_048, 86_016, 15_360, 6_144, 45_056,
  DELIVERY_NOTE_BYTES, 11_264, 5_120, 71_680, 18_432, 3_072, 27_648,
  8_192, 4_096, 96_256, 12_288, 6_144, 33_792, 2_048,
  57_344, 14_336, 5_120, 22_528, 9_216,
];

/** The minute the first of them was sent, which was before anybody arrived. */
const FIRST_JOB_MINUTE = 7 * 60 + 58;

/**
 * The queue as the world holds it: one job a minute from just before eight,
 * which is what a morning looks like when nothing is coming out of the other
 * end. Written as a function of the table above so the count and the list
 * cannot be edited apart.
 */
function spoolJobsField(): string {
  return JOB_BYTES.map(
    (bytes, index) => encodeSpoolJob({
      bytes,
      modified: stampAt(1, FIRST_JOB_MINUTE + index),
    }),
  ).join('\n');
}

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
    reward: { reputation: 4 },
    kb_ref: 'kb/display-rotation',
  },
  cause: 'Somebody pressed the screen-rotation shortcut on SALES-02 and left '
    + 'for the weekend.',
  dialogue_ref: 'dialogue/sales',
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
      // The portal bot got here first, and made the exact category error Gary
      // makes: it heard "password" and kept offering a self-service reset -
      // which needs him signed in, and a locked account is precisely what he
      // cannot sign in past. A real reset (the one a tech runs, `account.ts`)
      // ends the lockout; the self-service one the bot pushed never could,
      // because the lockout is the thing standing between him and it. So the
      // deflection layer sent on the thing it could not chew rather than the
      // thing it fixed (0.5.0 slice 3).
      preChew: {
        tried: 'Self-service password reset, offered twice by the support '
          + 'portal ("It looks like you are having trouble signing in!").',
        stillBroken: 'He never got as far as resetting anything: the '
          + 'self-service reset needs him signed in, and being locked out is '
          + 'exactly what he cannot sign in past - so the portal kept offering '
          + 'the one fix its own lockout put out of reach, then sent him here '
          + 'crosser than it found him.',
      },
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
    reward: { reputation: 2 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The lockout tripped this morning after five failed attempts and '
    + 'nothing has cleared it since. Gary has been away a fortnight and has '
    + 'not signed in once in that time, which is the other half of the story '
    + 'the directory tells.',
  dialogue_ref: 'dialogue/payroll',
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
      // The same pile, as the files it is made of. Written here rather than
      // derived at the other end because a directory holding forty-seven
      // invented sizes and times would be exactly the fake the fidelity bar
      // exists to forbid.
      {
        op: 'setField',
        id: COMPANY_IDS.printer,
        field: FIELDS.spoolJobs,
        value: spoolJobsField(),
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
    reward: { reputation: 5 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The spooler on PRINT-01 wedged on a malformed job and everything '
    + 'sent since has piled up behind it.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'cmd-clear-and-restart',
      app: 'cmd',
      label: 'clearqueue on the Hercules - which stops the spooler and drops '
        + 'the files it had open - then restart spooler',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
          // Clearing the queue IS stopping the spooler: the queued jobs are
          // files that service has open, so the action is told which one it
          // is stopping and leaves it stopped for the step below.
          params: { spooler: COMPANY_IDS.spooler },
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
      label: 'Stop the spooler and empty the queue from the hardware panel on '
        + 'PRINT-01, then start the spooler again from its taskbar',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.printer,
          // Clearing the queue IS stopping the spooler: the queued jobs are
          // files that service has open, so the action is told which one it
          // is stopping and leaves it stopped for the step below.
          params: { spooler: COMPANY_IDS.spooler },
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
