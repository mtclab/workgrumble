/**
 * Pool tickets for one shop (E11, 0.34.0 slice 2) - the surplus the exclusion
 * window needs, in the queue's own shape.
 *
 * Each one is self-contained: no arc, no chain, no beat. It lands on estate the
 * shop already has and closes through verbs the registry already holds, and the
 * day it is dealt on is the sampler's business rather than a table's.
 *
 * BODGEWORTH & BATCH, which is the same building the authored week is set in
 * and therefore the same five faults over again in different clothes: a family
 * plant-hire firm with one server under a desk, one printer at the end of the
 * yard, one login the whole front office shares, and thirty years of nobody
 * ever having done a thing properly. Nothing here needs an estate the shop has
 * not got. Two of these are the job's own texture and are deliberately short -
 * a lockout is a lockout, and a ticket that spent four paragraphs on one would
 * be the game insisting a lockout is interesting.
 *
 * The camera box in the corner is out of bounds on purpose: its units want the
 * engineer promotion and an ssh client, and a service-desk pool ticket aimed at
 * it would be a wall wearing a ticket's clothes.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { BODGE_IDS } from '../second-company';
import { baselineServiceId } from '../services';
import type { WorldTicket } from './types';

/**
 * The SMB client on the front desk - the Workstation service, which is the
 * half of a mapped drive that lives on the machine doing the mapping.
 *
 * It is a baseline service on every Windows box in the building, which is what
 * makes it the right node: nothing was installed for this fault and nothing is
 * special about the front desk except that it is the box somebody "sped up".
 */
const FRONT_DESK_CLIENT = baselineServiceId(
  BODGE_IDS.frontDesk,
  'LanmanWorkstation',
);

/**
 * One desk, no drive, and a server that is perfectly well.
 *
 * The Workstation service is the SMB CLIENT: with it stopped, that machine has
 * no way of reaching any share anywhere, while the server it cannot see is
 * serving everybody else without a complaint. So the whole diagnosis is in the
 * count - one desk is the desk, every desk is the server - and the reason it is
 * hidden is that the symptom points at the drive, which is the one thing in the
 * chain that is fine.
 *
 * It is Kev's, and it is Kev's in the way everything here is: he "sped the
 * front desk up" by going down the services list and stopping the ones he did
 * not recognise. He is not wrong that it is quicker.
 */
const FRONT_DESK_NO_NETWORK: WorldTicket = {
  arrival: 'morning',
  nodes: [FRONT_DESK_CLIENT, BODGE_IDS.frontDesk],
  // Sharon has put medium on it because the front desk has been managing off
  // paper since half eight, which is exactly the sort of managing that makes a
  // whole-desk outage look like a small one.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:front-desk-no-network',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The front desk cannot get on the drive (everyone else can)',
      body:
        'Sharon reports that the front desk cannot open anything on the '
        + 'server - the drive letter is there and everything under it errors, '
        + 'and she has been writing hire notes out by hand since half eight. '
        + 'Kev has already checked the server for her and says the server is '
        + 'fine, which she thinks is unhelpful and which is also true.',
    },
    reporter: BODGE_IDS.sharon,
    setup: [
      {
        op: 'setField',
        id: FRONT_DESK_CLIENT,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: FRONT_DESK_CLIENT },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/two-ends-of-a-share',
  },
  cause: 'The Workstation service on FRONT-DESK is stopped, and that service '
    + 'is the machine\'s SMB client - the end of a mapped drive that does the '
    + 'asking. Nothing is wrong with the server, the share or the cable: this '
    + 'one box has no way of reaching any share at all, which is why it is the '
    + 'only box complaining.',
  dialogue_ref: 'dialogue/bodge-sharon',
  paths: [
    {
      id: 'cmd-start-the-workstation-service',
      app: 'cmd',
      label: 'Start the Workstation service on FRONT-DESK',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: FRONT_DESK_CLIENT,
        },
      ],
    },
  ],
};

/**
 * The account that shuts again ten minutes after it is opened, because
 * something in the building is still offering the password it had last week.
 *
 * The classic, and the classic culprit: a multifunction printer with scan-to-
 * folder set up on somebody's own login. Kev configured the yard printer to
 * drop scans onto the server in about 2011 and typed his own credentials into
 * it, because at the time he was the only person with any. He changed his
 * password last week. The printer has been trying the old one every few minutes
 * ever since, and five wrong goes is a lockout.
 *
 * Two steps, both load-bearing and in this order for a reason a player can
 * feel: unlock it first and the count starts again while you are still typing.
 */
const KEV_RELOCK: WorldTicket = {
  arrival: 'morning',
  nodes: [BODGE_IDS.kevAccount, BODGE_IDS.printer],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:kev-relock',
    archetype: 'hidden_cause',
    flavor: {
      title: 'My login keeps shutting itself and I have not done anything',
      body:
        'Kev has been locked out four times since Thursday. Each time somebody '
        + 'has opened it back up, each time he has had ten minutes of '
        + 'invoicing, and each time it has gone again. He has changed his '
        + 'password twice trying to get ahead of it and is now, in his own '
        + 'words, not sure what his password is either.',
    },
    reporter: BODGE_IDS.kev,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.printer,
        field: FIELDS.storedCredential,
        value: true,
      },
      {
        op: 'setField',
        id: BODGE_IDS.kevAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: BODGE_IDS.kevAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: BODGE_IDS.kevAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    // Both, or it is not fixed: an open account with the printer still trying
    // is a fix with a ten-minute half-life, and a quiet printer in front of a
    // locked account is a door somebody has stopped knocking on.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: BODGE_IDS.kevAccount },
          field: FIELDS.locked,
          value: false,
        },
        {
          op: 'eq',
          selector: { id: BODGE_IDS.printer },
          field: FIELDS.storedCredential,
          value: false,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/the-account-that-relocks',
  },
  cause: 'The yard printer scans to a folder on the server, and it has been '
    + 'signing in to do it as Kev since he set it up. He changed his password '
    + 'last week; the printer did not, and it offers the old one every few '
    + 'minutes until the directory has had five and shuts the account.',
  dialogue_ref: 'dialogue/bodge-kev',
  paths: [
    {
      // Silence the thing that is typing, then open the door. The other order
      // closes it too - the world does not care which way round - but this is
      // the one worth advertising, because the other one has the player watch
      // it shut again while they are still on the phone.
      id: 'forget-the-printer-then-unlock',
      app: 'cmd',
      label: 'Clear the printer\'s stored password, then unlock kev',
      steps: [
        {
          action: HELPDESK_ACTIONS.deviceForgetCredentials,
          target: BODGE_IDS.printer,
        },
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: BODGE_IDS.kevAccount,
        },
      ],
    },
  ],
};

/**
 * The job's own texture, and short on purpose: a man in a yard has typed his
 * password wrong five times and the directory has done exactly what it is for.
 * One step, an article the tech already carries between jobs, and no mystery.
 */
const BAZ_LOCKED_OUT: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.bazAccount],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:baz-locked-out',
    archetype: 'read_the_screen',
    flavor: {
      title: 'It has stopped letting me in and it is not my fault this time',
      body:
        'Baz reports that his own login has stopped working - "locked out", it '
        + 'says, and he has read it out twice to make sure. He wants it on '
        + 'record that he did not type it wrong on purpose and that the keys on '
        + 'the yard terminal have got mud in them.',
    },
    reporter: BODGE_IDS.baz,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.bazAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: BODGE_IDS.bazAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: BODGE_IDS.bazAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.bazAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'Five wrong attempts in a row this morning, and the lockout counter '
    + 'did what it is there for. The password is still the password; the door '
    + 'is what is shut.',
  dialogue_ref: 'dialogue/bodge-baz',
  paths: [
    {
      id: 'unlock-baz',
      app: 'directory',
      label: 'Unlock baz in the directory',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: BODGE_IDS.bazAccount,
        },
      ],
    },
  ],
};

/**
 * The other short one, and the other half of the three-states article: an
 * account that is not locked and not expired but switched off, months ago, by
 * somebody who was tidying and who was very nearly right.
 *
 * Trev said he was going part-time in the spring. Kev heard "retiring".
 */
const TREV_SWITCHED_OFF: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.trevAccount],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:trev-switched-off',
    archetype: 'read_the_screen',
    flavor: {
      title: 'It will not have me at all and I have driven in for this',
      body:
        'Trev is in for his one day this week and cannot sign in. He reports '
        + 'that it is not asking for a password wrongly, it is refusing him '
        + 'before it gets that far, and that the message on the screen mentions '
        + 'the account rather than the password. He has driven forty minutes '
        + 'and would like that noted.',
    },
    reporter: BODGE_IDS.trev,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.trevAccount,
        field: FIELDS.enabled,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.trevAccount },
      field: FIELDS.enabled,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'The account is DISABLED rather than locked: somebody switched it off '
    + 'in the spring, when Trev going part-time was heard as Trev retiring. '
    + 'Unlocking it achieves nothing and a new password achieves nothing - the '
    + 'account itself is off, and switching it back on is a different control.',
  dialogue_ref: 'dialogue/bodge-trev',
  paths: [
    {
      id: 'enable-trev',
      app: 'directory',
      label: 'Switch the trev account back on in the directory',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountEnable,
          target: BODGE_IDS.trevAccount,
        },
      ],
    },
  ],
};

/**
 * The boss, a deadline he has known about for a fortnight and mentioned four
 * minutes ago, and a printer that is switched off.
 *
 * The whole of the archetype in one ticket: the claim is a three o'clock the
 * world has no opinion about, the fault is one man leaning on a power button,
 * and the gap between them is the thing the player has to decide what to do
 * with. There is one printer in this firm and it is at the far end of the yard,
 * which is also why nobody noticed it had gone off.
 */
const YARD_PRINTER_UNPLUGGED: WorldTicket = {
  arrival: 'drip',
  nodes: [BODGE_IDS.printer],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:yard-printer-unplugged',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'I need the insurance renewal printed and signed by three',
      body:
        'Vernon reports that the printer is dead and that the broker wants the '
        + 'renewal back by three, which he has known about since the middle of '
        + 'last month and has mentioned for the first time now. Not jammed and '
        + 'not out of paper: off, with no lights on it at all, the way a thing '
        + 'is off when nothing is going into it.',
    },
    reporter: BODGE_IDS.vernon,
    setup: [
      {
        op: 'setField',
        id: BODGE_IDS.printer,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: BODGE_IDS.printer },
      field: FIELDS.powered,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/power-cycle',
  },
  cause: 'The printer has no power. There is one socket at that end of the '
    + 'yard, the pressure washer was on it this morning, and the printer went '
    + 'back on the wall and not back on. Everything else about it is fine, '
    + 'which is why the fix takes ten seconds and the conversation about the '
    + 'three o\'clock takes longer.',
  dialogue_ref: 'dialogue/bodge-vernon',
  paths: [
    {
      id: 'power-the-printer-back-up',
      app: 'remote',
      label: 'Bring the yard printer back up from the hardware panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.devicePowerCycle,
          target: BODGE_IDS.printer,
        },
      ],
    },
  ],
};

export const POOL_BODGE_TICKETS: readonly WorldTicket[] = [
  FRONT_DESK_NO_NETWORK,
  KEV_RELOCK,
  BAZ_LOCKED_OUT,
  TREV_SWITCHED_OFF,
  YARD_PRINTER_UNPLUGGED,
];
