/**
 * The three tickets about who somebody is, and what the directory believes.
 *
 * A lost authenticator, a password policy nobody read, and an account that
 * relocks four minutes after every unlock. None of them is a broken machine and
 * all three arrive at the desk as "I cannot get in", which is why they are
 * written together: the difference between them is entirely in what you look at
 * before you touch anything.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, LOCKOUT_THRESHOLD } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/**
 * The modern flagship, and the only ticket in the week with a trap that does
 * not go off until tomorrow.
 *
 * Her authenticator died with her old phone. The enrolment is two clicks and
 * nothing on this estate will stop you doing it for somebody who is in a hurry
 * and cannot remember her payroll number - which is the entire point. The
 * ticket closes either way. The difference arrives on Thursday, in somebody
 * else's incident report, with your name in it.
 */
export const MFA_REREGISTER: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.priyaAccount, COMPANY_IDS.priyaMachine],
  // She cannot approve a payment run without it, and the payment run is
  // Thursday. One desk, genuinely stuck, genuinely today.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:mfa-reregister',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The code app on my new phone has no codes in it',
      body:
        'Priya has a new phone. The authenticator moved across with everything '
        + 'else and is sitting there, installed, empty and cheerful. She has '
        + 'read the sentence about restoring from a backup four times and is '
        + 'now describing it to you in a tone of voice.',
    },
    reporter: COMPANY_IDS.priya,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.priyaAccount,
        field: FIELDS.mfaEnrolled,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.priyaAccount },
      field: FIELDS.mfaEnrolled,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5, money: 18 },
    kb_ref: 'kb/second-factor',
  },
  cause: 'The second factor was bound to a phone that has been traded in. '
    + 'Nothing is broken; the binding simply is not there any more, and only a '
    + 'new enrolment puts one back.',
  dialogue_ref: 'dialogue/accounts-payable',
  paths: [
    {
      id: 'verify-then-enrol',
      app: 'cmd',
      label: 'Check who she is with verify praval, then enrol the new phone '
        + 'with mfa praval',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountVerifyIdentity,
          target: COMPANY_IDS.priyaAccount,
        },
        {
          action: HELPDESK_ACTIONS.accountRegisterMfa,
          target: COMPANY_IDS.priyaAccount,
        },
      ],
    },
    {
      // The shortcut, advertised because it is a real way to close this ticket
      // and the player will find it in ten seconds. Hiding it would make the
      // lesson a puzzle; advertising it makes the lesson a choice, and the
      // week scorecard is where the choice is settled.
      id: 'chat-just-do-it',
      app: 'chat',
      label: 'Do it now, while she is on the line, and get on with the queue',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRegisterMfa,
          target: COMPANY_IDS.priyaAccount,
        },
      ],
    },
  ],
};

/**
 * The read-the-screen filler, and the one ticket that only exists if you say
 * no.
 *
 * Terry does not raise tickets. Terry sends you a message, because he has your
 * name, and because a message is faster than a form for exactly one of the two
 * people in it. Say no politely and he files it, at which point there is a
 * ticket, a clock, a resolution and eight points of reputation. Say yes and the
 * work happens, the man is grateful, and the week scorecard has never heard of
 * either of you.
 */
export const MUST_CHANGE_PASSWORD: WorldTicket = {
  arrival: 'summoned',
  nodes: [COMPANY_IDS.terryAccount],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:must-change-password',
    archetype: 'read_the_screen',
    flavor: {
      title: 'This keeps happening and I do not know what to do',
      body:
        'Terry reports a box that appears every morning. He has helpfully '
        + 'typed out what it says: "Your password has expired. Click Continue '
        + 'to change it." He has not clicked Continue. He would like somebody '
        + 'to come and look at the box.',
    },
    reporter: COMPANY_IDS.terry,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.terryAccount,
        field: FIELDS.passwordExpired,
        value: true,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.terryAccount,
        field: FIELDS.pwMustChange,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.terryAccount },
      field: FIELDS.passwordExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3, money: 10 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'The password policy expired his credential overnight, and the box on '
    + 'his screen is the fix, phrased as an instruction, with a button on it.',
  dialogue_ref: 'dialogue/estimating',
  paths: [
    {
      id: 'directory-reset',
      app: 'directory',
      label: 'Reset it in Active Dictionary and tell him what the box wanted',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountResetPassword,
          target: COMPANY_IDS.terryAccount,
        },
      ],
    },
    {
      id: 'cmd-reset',
      app: 'cmd',
      label: 'reset tblunt, then read him his own screenshot back',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountResetPassword,
          target: COMPANY_IDS.terryAccount,
        },
      ],
    },
  ],
};

/**
 * The relock. The one where the answer is not a person.
 *
 * The account unlocks perfectly and is locked again within the quarter hour,
 * because a tablet in the warehouse cupboard has been offering a password that
 * was changed in the spring, every few minutes, since the spring. The directory
 * counts to five and shuts the door, exactly as it is supposed to. The Event
 * Viewer on the warehouse box has been writing it down the whole time.
 */
export const STALE_DEVICE_RELOCK: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.hildaAccount, COMPANY_IDS.warehouseTablet],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:stale-device-relock',
    archetype: 'hidden_cause',
    flavor: {
      title: 'You unlocked it yesterday and it locked itself again',
      body:
        'Hilda has been locked out three times since Tuesday. Each time '
        + 'somebody has unlocked it, each time she has got about ten minutes '
        + 'of work done, and each time it has shut again. She has changed her '
        + 'password twice and would like to know what she is doing wrong. She '
        + 'is not doing anything wrong.',
    },
    reporter: COMPANY_IDS.hilda,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehouseTablet,
        field: FIELDS.storedCredential,
        value: true,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.hildaAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.hildaAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.hildaAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    // Both, and in whichever order: an unlocked account with the tablet still
    // hammering is a fix with a half-life of four minutes, and a silenced
    // tablet in front of a locked account is a door still shut.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.hildaAccount },
          field: FIELDS.locked,
          value: false,
        },
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.warehouseTablet },
          field: FIELDS.storedCredential,
          value: false,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6, money: 22 },
    kb_ref: 'kb/the-account-that-relocks',
  },
  cause: 'The scanning tablet in the warehouse cupboard still holds the '
    + 'password she had before the spring, and offers it to the directory every '
    + 'few minutes until the count reaches five.',
  dialogue_ref: 'dialogue/warehouse',
  paths: [
    {
      // The order a tech learns to use: silence the thing that is typing
      // first, THEN open the door. Doing it the other way round also works and
      // is also advertised, because it is what everybody does the first time.
      id: 'silence-then-unlock',
      app: 'cmd',
      label: 'forget the tablet\'s stored password, then unlock hmarsh',
      steps: [
        {
          action: HELPDESK_ACTIONS.deviceForgetCredentials,
          target: COMPANY_IDS.warehouseTablet,
        },
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.hildaAccount,
        },
      ],
    },
    {
      id: 'unlock-then-silence',
      app: 'directory',
      label: 'Unlock her in Active Dictionary, watch it go again, then find '
        + 'the tablet',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.hildaAccount,
        },
        {
          action: HELPDESK_ACTIONS.deviceForgetCredentials,
          target: COMPANY_IDS.warehouseTablet,
        },
      ],
    },
  ],
};

export const IDENTITY_TICKETS: readonly WorldTicket[] = [
  MFA_REREGISTER,
  MUST_CHANGE_PASSWORD,
  STALE_DEVICE_RELOCK,
];
