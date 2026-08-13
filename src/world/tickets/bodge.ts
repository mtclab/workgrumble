/**
 * The Bodgeworth & Batch queue (0.6.0 slice 3).
 *
 * A wild-west haulage firm's first real week, and deliberately a SHORTER,
 * shallower week than probation - five faults across five days rather than
 * twenty-eight, because the point of the second employer is the CONTRAST, not
 * the depth. Every one is a fault a first-line tech has met a hundred times,
 * closed by exactly the same skills the probation shop taught, on a KB the tech
 * carries between jobs (the articles are reused for that reason - a lockout is a
 * lockout in any building). What is different is the estate they sit in: a
 * shared login, a server under a desk, a firm with no audit and no MFA.
 *
 * The reply-all storm on the Wednesday is the event day the whole E5 spine was
 * built to home, and one of these tickets is the signal buried in its noise -
 * `ticket:the-share-down`, the accounts drive falling over while forty people
 * argue about cake. It arrives as an ordinary drip; what makes it the event is
 * that it lands in the middle of the storm.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { BODGE_IDS } from '../second-company';
import { POOL_BODGE_TICKETS } from './pool-bodge';
import type { WorldTicket } from './types';

/**
 * The shared login, locked. It is worse than one person's lockout because it is
 * EVERYBODY on the front desk - Sharon, Baz when he covers, whoever is on
 * reception - all signed in as the same account, so a lockout takes down the
 * whole desk. Read the directory, unlock it, done.
 */
export const OFFICE_LOGIN_LOCKED: WorldTicket = {
  arrival: 'morning',
  nodes: [BODGE_IDS.officeAccount],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:office-login-locked',
    archetype: 'read_the_screen',
    flavor: {
      title: 'The front desk will not let anyone in',
      body:
        'Sharon reports that nobody can sign in at the front desk - the whole '
        + 'office shares the one login and it is refusing all of them this '
        + 'morning. She has read the message out: "This account has been '
        + 'locked out." She is treating it as one person\'s problem, which is '
        + 'the one thing about a shared login it never is.',
    },
    reporter: BODGE_IDS.sharon,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.officeAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: BODGE_IDS.officeAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: BODGE_IDS.officeAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.officeAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The shared OFFICE login tripped its lockout after a run of failed '
    + 'attempts this morning - somebody at the desk typing it wrong on repeat - '
    + 'and nothing has cleared it since. One account, one lockout, the whole '
    + 'front office out.',
  dialogue_ref: 'dialogue/bodge-sharon',
  paths: [
    {
      id: 'directory-unlock',
      app: 'directory',
      label: 'Unlock the OFFICE account in the directory',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: BODGE_IDS.officeAccount,
        },
      ],
    },
    {
      id: 'cmd-unlock',
      app: 'cmd',
      label: 'Unlock it with unlock office',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: BODGE_IDS.officeAccount,
        },
      ],
    },
  ],
};

/**
 * Kev's pride, stopped. The accounts package is the one bit of software Kev
 * built the firm around, and it has fallen over - which he reports as the box
 * having done something to itself. A restart brings it back; what the ticket is
 * for is not being sniffy about whose fault it was.
 */
export const ACCOUNTS_PACKAGE_DOWN: WorldTicket = {
  arrival: 'morning',
  nodes: [BODGE_IDS.accountsPackage, BODGE_IDS.server],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:accounts-package-down',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The accounts thing has stopped and I did not touch it',
      body:
        'Kev reports that the accounts package - the one he set up, on the '
        + 'server under his desk - has stopped, and is at pains to say the box '
        + 'did it by itself over the weekend. He mentions, unprompted, that the '
        + 'server fan has been getting louder and that he has not done anything '
        + 'about that either.',
    },
    reporter: BODGE_IDS.kev,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.accountsPackage,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.accountsPackage },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/event-log',
  },
  cause: 'The accounts service on the server stopped - the event log has it '
    + 'going down at the weekend, on a box that is short of memory and hot with '
    + 'it. It starts straight back up; it will do it again until the box is '
    + 'looked at properly, which is a second-line job Kev keeps meaning to do.',
  dialogue_ref: 'dialogue/bodge-kev',
  paths: [
    {
      id: 'cmd-restart-accounts',
      app: 'cmd',
      label: 'restart the accounts service on the server',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: BODGE_IDS.accountsPackage,
        },
      ],
    },
    {
      id: 'remote-restart-accounts',
      app: 'remote',
      label: 'Start it from the services panel while he watches',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: BODGE_IDS.accountsPackage,
        },
      ],
    },
  ],
};

/** The number of jobs stacked behind the wedged yard printer. */
const YARD_QUEUE_DEPTH = 19;

/**
 * The yard printer, wedged. The same two-step-in-order fault the probation
 * shop's spooler is - clear the queue, then start the spooler - because a
 * printer jam is a printer jam, and the skill transfers exactly. Baz reports it
 * from the yard, where he prints every delivery note.
 */
export const YARD_PRINTER_WEDGED: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.spooler, BODGE_IDS.printer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:yard-printer-wedged',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Yard printer flashing and doing nothing',
      body:
        'Baz reports that the yard printer hums, flashes and prints nothing, '
        + `and there are ${String(YARD_QUEUE_DEPTH)} jobs stacked behind `
        + 'whatever it is sulking about - most of them the same delivery note, '
        + 'sent again every time somebody walked back out and it still had not '
        + 'come out.',
    },
    reporter: BODGE_IDS.baz,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.spooler,
        field: FIELDS.status,
        value: SERVICE_STATUS.wedged,
      },
      {
        op: 'setField',
        id: BODGE_IDS.printer,
        field: FIELDS.queueLen,
        value: YARD_QUEUE_DEPTH,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: BODGE_IDS.spooler },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
        {
          op: 'eq',
          selector: { id: BODGE_IDS.printer },
          field: FIELDS.queueLen,
          value: 0,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'The spooler wedged on a malformed job and everything sent since has '
    + 'piled up behind it. Clearing the queue drops the job that jammed it; '
    + 'starting the spooler first only hands it back the thing that broke it.',
  dialogue_ref: 'dialogue/bodge-baz',
  paths: [
    {
      id: 'cmd-clear-and-restart',
      app: 'cmd',
      label: 'clearqueue on the yard printer, then restart the spooler',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: BODGE_IDS.printer,
          // Clearing the queue IS stopping the spooler: the queued jobs are
          // files that service has open, so the action is told which one it is
          // stopping and leaves it stopped for the restart below.
          params: { spooler: BODGE_IDS.spooler },
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: BODGE_IDS.spooler,
        },
      ],
    },
  ],
};

/**
 * The signal in the storm. The Wednesday reply-all cascade fills the shared
 * drive with a hundred copies of a reply-all-ed cake photo, the drive that also
 * holds the accounts share fills up, and the share service stops - and the one
 * ticket that actually matters lands in the middle of forty people telling each
 * other to stop replying all. A restart brings the share back; the skill is
 * seeing it at all.
 */
export const THE_SHARE_DOWN: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.theShare, BODGE_IDS.server],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:the-share-down',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Can\'t open the shared drive (probably the email thing?)',
      body:
        'Trev reports, from somewhere in the middle of the reply-all storm, '
        + 'that the shared drive has stopped answering. He thinks it is "the '
        + 'email thing", and he is not wrong about the timing: the storm has '
        + 'been dropping the same photo into the drive all morning, the box '
        + 'filled, and the share service gave up.',
    },
    reporter: BODGE_IDS.trev,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.theShare,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.theShare },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/event-log',
  },
  cause: 'The reply-all storm dropped the same attachment into the shared drive '
    + 'over and over until the server ran out of room, and the share service '
    + 'stopped when it could not write. Starting it brings the drive back; the '
    + 'room only stays back once the storm burns out.',
  dialogue_ref: 'dialogue/bodge-trev',
  paths: [
    {
      id: 'cmd-restart-share',
      app: 'cmd',
      label: 'restart the share service on the server',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: BODGE_IDS.theShare,
        },
      ],
    },
    {
      id: 'remote-restart-share',
      app: 'remote',
      label: 'Start it from the services panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: BODGE_IDS.theShare,
        },
      ],
    },
  ],
};

/**
 * The boss's frozen computer, which is a flat mouse. Vernon owns the firm and
 * thinks IT is a thing you should have sorted, and he has reported his machine
 * as completely dead when the truth is on the screen: a low-battery notice for
 * a wireless mouse he has decided is a separate problem.
 */
export const VERNON_MOUSE: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.vernonMouse, BODGE_IDS.vernonLaptop],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:vernon-mouse',
    archetype: 'read_the_screen',
    flavor: {
      title: 'My computer has died completely and I have a call at two',
      body:
        'Vernon reports that his laptop has died entirely - nothing moves, '
        + 'nothing clicks - and that he has a call at two and needs it now. The '
        + 'screen is showing a low-battery notice for a wireless mouse, which '
        + 'he has read, and which he believes is a different problem for later.',
    },
    reporter: BODGE_IDS.vernon,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.vernonMouse,
        field: FIELDS.batteryPct,
        value: 0,
      },
      {
        op: 'setField',
        id: BODGE_IDS.vernonMouse,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.vernonMouse },
      field: FIELDS.batteryPct,
      value: 100,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/reading-the-error',
  },
  cause: 'The mouse batteries are flat. The laptop is fine and has been fine '
    + 'throughout, which is what makes "died completely" such a good phrase for '
    + 'it - and what makes telling the owner so, plainly, the actual job.',
  dialogue_ref: 'dialogue/bodge-vernon',
  paths: [
    {
      id: 'replace-the-battery',
      app: 'remote',
      label: 'Put batteries in the mouse from the hardware panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.deviceReplaceBattery,
          target: BODGE_IDS.vernonMouse,
        },
      ],
    },
  ],
};

export const BODGE_TICKETS: readonly WorldTicket[] = [
  OFFICE_LOGIN_LOCKED,
  ACCOUNTS_PACKAGE_DOWN,
  YARD_PRINTER_WEDGED,
  THE_SHARE_DOWN,
  VERNON_MOUSE,
  // And the pool (E11, 0.34.0 slice 2). They are in THIS list rather than in
  // the roster's own because every gate that stands a world up per employer
  // reads these arrays to decide which estate a ticket belongs in - so a pool
  // ticket filed anywhere else would be spawned into the probation shop, where
  // its reporter does not exist.
  ...POOL_BODGE_TICKETS,
];
