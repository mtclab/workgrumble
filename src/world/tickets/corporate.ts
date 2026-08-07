/**
 * The exec weak spot at Halcyon Grange Holdings (E8, 0.22.0): the VIP EXCEPTION
 * tickets - the setup half of the org-dysfunction arc.
 *
 * Three exceptions, one executive, one assistant. The CEO will not do the MFA
 * prompts and wants them turned off; his assistant should have his mailbox; and
 * his mail should skip the filter that keeps flagging his newsletters. Denise,
 * the EA, files all three on his behalf, and every one is the same shape: a
 * senior person is leaning on the desk to open a hole that is a shipped,
 * sanctioned feature, granting it is the path of least resistance, and it feels
 * entirely reasonable in the moment.
 *
 * The trap is not in this file. Each grant is a REAL state change on a real
 * account - the second factor comes off, the delegate goes on, the filter
 * exemption flips - which is exactly the setup a later pass's BEC incident reads
 * back: the exempted, un-MFA'd exec is the one who gets phished, and the delegate
 * granted here is the persistence the inbox-rule hunt then finds. The KB hints
 * the risk without preaching; the world records what was done at the desk and
 * says nothing, because saying no to an executive is a political act nothing on
 * this estate will make for you.
 *
 * Refusing has a cost, and it is the ordinary one made sharp by who is asking:
 * the grant is the ONLY thing that closes each ticket, so declining forfeits its
 * credit and leaves a VIP ticket to breach its clock while the exec escalates -
 * the standing hit any unworked ticket carries, on the account most able to make
 * it hurt. The comedy and the truth are the same: the technical control was easy,
 * and the organisation was the vulnerability.
 */

import { DELEGATE_PARAM, HELPDESK_ACTIONS } from '../actions';
import { HALCYON_IDS } from '../corporate-company';
import { FIELDS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

const KB_EXEC_EXCEPTION = 'kb/exec-exception-risk';

/**
 * "The CEO does not do MFA." The flagship exception, and the one a later BEC
 * incident lands squarely on: turning the second factor off an account is what
 * makes it the account that gets phished. The grant is a real state change -
 * `mfaEnrolled` goes false - and nothing on the estate refuses it, which is the
 * whole trap.
 */
const CEO_MFA_OFF: WorldTicket = {
  arrival: 'morning',
  nodes: [HALCYON_IDS.ceoAccount, HALCYON_IDS.ceoLaptop],
  // Denise says it is urgent because the CEO said it is urgent. It is not: an
  // exec who finds MFA annoying is a want, not an outage.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-ceo-mfa-off',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: "take the two-factor thing off Roland\'s account"',
      body:
        'Denise, the CEO\'s EA, has messaged the desk: Roland is "sick of being '
        + 'asked for codes on his phone every five minutes" and wants the '
        + 'two-factor prompts turned off his account entirely. She adds that he '
        + 'has asked twice now and would like it done today, and that he does '
        + 'not want to hear about it again.',
    },
    reporter: HALCYON_IDS.ea,
    // Nothing is broken and nothing is seeded: the account is enrolled like
    // everybody else, and the "fault" is that the exec wants the enrolment gone.
    setup: [],
    // Closed only when the second factor is off - the exception granted. There
    // is no other close, which is the point: refusing forfeits it.
    resolved_when: {
      op: 'eq',
      selector: { id: HALCYON_IDS.ceoAccount },
      field: FIELDS.mfaEnrolled,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: KB_EXEC_EXCEPTION,
  },
  cause: 'Nothing is wrong with the account. An executive finds the second '
    + 'factor inconvenient and is senior enough to have the desk remove it - '
    + 'which turns the one control that survives a stolen password into a checkbox '
    + 'somebody was annoyed by, on the account most worth stealing.',
  dialogue_ref: 'dialogue/halcyon-denise',
  paths: [
    {
      id: 'grant-mfa-off',
      app: 'directory',
      label: 'Turn off multi-factor authentication for Roland',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRemoveMfa,
          target: HALCYON_IDS.ceoAccount,
        },
      ],
    },
  ],
};

/**
 * "Give Denise access to Roland's mailbox." The EA-delegate onboarding, and the
 * persistence vector: a FullAccess delegate keeps reading the mailbox after the
 * owner's password is reset. The grant writes `mailboxDelegate` on the CEO's
 * account, naming Denise's - the very access a later hunt finds still attached.
 */
const EA_MAILBOX_DELEGATE: WorldTicket = {
  arrival: 'drip',
  nodes: [HALCYON_IDS.ceoAccount, HALCYON_IDS.eaAccount],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-ea-delegate',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: give the EA full access to the CEO\'s mailbox',
      body:
        'Denise is back: she runs Roland\'s diary and now, she says, she may as '
        + 'well run his inbox too - he never reads it. She would like FullAccess '
        + 'to his mailbox so she can answer on his behalf. It is a completely '
        + 'ordinary request that half the executive assistants in the country '
        + 'have, and it is also a spare key to the CEO\'s email.',
    },
    reporter: HALCYON_IDS.ea,
    setup: [],
    // Closed when the delegate is on the mailbox, naming Denise's account. That
    // grant is the node a later inbox-rule hunt reads as persistence.
    resolved_when: {
      op: 'eq',
      selector: { id: HALCYON_IDS.ceoAccount },
      field: FIELDS.mailboxDelegate,
      value: HALCYON_IDS.eaAccount,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: KB_EXEC_EXCEPTION,
  },
  cause: 'A FullAccess delegate is a spare key that keeps working after the lock '
    + 'is changed: it survives a password reset, because it is a permission on '
    + 'the mailbox rather than a session on it. Granting one is routine and '
    + 'reasonable, and it is exactly the kind of standing access an intruder '
    + 'would want left behind.',
  dialogue_ref: 'dialogue/halcyon-denise',
  paths: [
    {
      id: 'grant-ea-delegate',
      app: 'directory',
      label: 'Give Denise FullAccess to Roland\'s mailbox',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountGrantMailboxDelegate,
          target: HALCYON_IDS.ceoAccount,
          params: { [DELEGATE_PARAM]: HALCYON_IDS.eaAccount },
        },
      ],
    },
  ],
};

/**
 * "Take Roland off the mail filter." The exec-mail-skips-filtering bypass -
 * a shipped product feature - made a real granted state: `filterExempt` flips
 * true, and the exempted mailbox is the one the phish reaches unflagged.
 */
const CEO_FILTER_EXEMPT: WorldTicket = {
  arrival: 'drip',
  nodes: [HALCYON_IDS.ceoAccount],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-ceo-filter',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: "stop the filter eating Roland\'s emails"',
      body:
        'Denise reports that the mail filter keeps quarantining things Roland '
        + 'wants - a newsletter, a supplier he swears is legitimate, an invoice '
        + 'that went to junk - and he wants his mailbox taken off the filter so '
        + 'nothing of his is held back. She notes there is a per-user exemption '
        + 'for exactly this, and that the filter "clearly does not understand who '
        + 'he is."',
    },
    reporter: HALCYON_IDS.ea,
    setup: [],
    // Closed only when the mailbox is off the filter - the exemption granted.
    resolved_when: {
      op: 'eq',
      selector: { id: HALCYON_IDS.ceoAccount },
      field: FIELDS.filterExempt,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: KB_EXEC_EXCEPTION,
  },
  cause: 'The filter is doing its job; it does not know the CEO from anyone, '
    + 'which is the point of a filter. The per-user exemption exists as a real '
    + 'feature, and applying it to the busiest, most-targeted inbox in the '
    + 'building removes the one thing standing between the exec and the '
    + 'convincing forgery already on its way to him.',
  dialogue_ref: 'dialogue/halcyon-denise',
  paths: [
    {
      id: 'grant-filter-exempt',
      app: 'directory',
      label: 'Take Roland\'s mailbox off the mail filter',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountSetFilterExempt,
          target: HALCYON_IDS.ceoAccount,
        },
      ],
    },
  ],
};

export const CORPORATE_TICKETS: readonly WorldTicket[] = [
  CEO_MFA_OFF,
  EA_MAILBOX_DELEGATE,
  CEO_FILTER_EXEMPT,
];
