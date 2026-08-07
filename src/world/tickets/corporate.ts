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
 *
 * Pass B adds the PAYOFF (E8, 0.22.0): `CEO_BEC_INCIDENT`, the summoned P1 that
 * follows the delegate grant. The setup half above is what it reads back - the
 * exempted, un-MFA'd, off-filter exec is the one who gets phished, and the
 * FullAccess delegate is the persistence the hunt finds - so the two halves are
 * one arc in one file.
 */

import { DELEGATE_PARAM, HELPDESK_ACTIONS, RULE_PARAM } from '../actions';
import { HALCYON_IDS } from '../corporate-company';
import { FIELDS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

const KB_EXEC_EXCEPTION = 'kb/exec-exception-risk';
const KB_BEC_RESPONSE = 'kb/bec-incident-response';

/**
 * The one external address the attacker forwards to, and the malicious inbox
 * rule in the `name|action|target` shape the mailbox field carries (E8, 0.22.0).
 *
 * It is a real BEC tell: a rule that catches anything about an invoice or a wire,
 * forwards a copy to an address the attacker controls, marks it read and moves it
 * to Deleted so the exec never sees the thread they are being impersonated in.
 * Exported because the incident SEEDS it, the response NAMES it to pull it, the
 * resolution rule watches for it, and the hunt test reads it - one string, one
 * place, so those four cannot drift into disagreeing about what the rule is.
 */
const BEC_EXTERNAL_ADDRESS = 'ap.remittance@halcyongrange-invoices.com';

export const BEC_MALICIOUS_RULE =
  `Auto-forward finance|forward,markread,delete|${BEC_EXTERNAL_ADDRESS}`;

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

/**
 * The payoff (E8, 0.22.0): the exempted CEO is compromised, and the desk runs
 * the ORDERED BEC incident response - the con landing on the access the setup
 * granted.
 *
 * It is `summoned` and `follows` the EA-delegate grant, which is what keys it on
 * the exec being exempted: it fires the minute the delegate is handed over, so
 * the persistence the hunt finds is, by construction, the very key the player
 * just cut. The setup seeds the two things a password reset cannot touch - the
 * attacker's live session and their forwarding rule - both on the CEO account,
 * the one the earlier exceptions made the softest target in the building.
 *
 * The response is four real verbs in order, and each is a clause of the close:
 * DISABLE the account (contain it), REVOKE the stolen session (a reset would not
 * - the session outlives the credential), pull the malicious inbox RULE (a reset
 * would not - the forward outlives the credential too, which is the whole teeth),
 * and tear down the DELEGATE (the persistence the setup granted). Skip any one
 * and the incident stays open; skip the rule hunt and the silent forward keeps
 * running behind a "resolved" password reset - which is the exact bug the rule
 * clause forbids.
 */
const CEO_BEC_INCIDENT: WorldTicket = {
  arrival: 'summoned',
  follows: 'ticket:halcyon-ea-delegate',
  nodes: [HALCYON_IDS.ceoAccount, HALCYON_IDS.eaAccount, HALCYON_IDS.ceoLaptop],
  // A P1 the moment it lands, and honestly so: the CEO's account is sending mail
  // as him. The claim and the truth agree for once - this really is the fire.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:halcyon-ceo-bec',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon P1: Roland\'s account is sending wire requests he did not send',
      body:
        'Denise has flagged it from inside the mailbox she now runs: emails are '
        + 'going out AS Roland asking Finance to change supplier bank details and '
        + 'push a wire through today, and Roland swears he has sent nothing and '
        + 'clicked nothing. His account is compromised - the phish got in past an '
        + 'inbox with no second factor and no filter on it. Run the incident: '
        + 'lock the account down, kill the live session, hunt the mailbox for '
        + 'what the attacker left behind, and check who else has a key to it. '
        + 'A password reset alone will not do it, and Finance is waiting on the '
        + '"urgent" wire.',
    },
    reporter: HALCYON_IDS.ea,
    // The two things the phish left that a password reset cannot reach: the live
    // stolen session, and the forwarding rule. Both on the CEO's account, seeded
    // the way every fault in this game arrives - with the ticket about it.
    setup: [
      {
        op: 'setField',
        id: HALCYON_IDS.ceoAccount,
        field: FIELDS.mailboxRules,
        value: BEC_MALICIOUS_RULE,
      },
      {
        op: 'setField',
        id: HALCYON_IDS.ceoAccount,
        field: FIELDS.sessionLive,
        value: true,
      },
    ],
    // Contained, the session killed, the forward pulled, and the delegate torn
    // down - four states, four verbs, and NONE of them a password reset. The
    // rule clause is the teeth: while the malicious rule is still on the mailbox
    // the incident is open, however green the account otherwise looks, because
    // the forward is still running.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: HALCYON_IDS.ceoAccount },
          field: FIELDS.enabled,
          value: false,
        },
        {
          op: 'eq',
          selector: { id: HALCYON_IDS.ceoAccount },
          field: FIELDS.sessionLive,
          value: false,
        },
        {
          op: 'not',
          expr: {
            op: 'eq',
            selector: { id: HALCYON_IDS.ceoAccount },
            field: FIELDS.mailboxRules,
            value: BEC_MALICIOUS_RULE,
          },
        },
        {
          op: 'not',
          expr: {
            op: 'eq',
            selector: { id: HALCYON_IDS.ceoAccount },
            field: FIELDS.mailboxDelegate,
            value: HALCYON_IDS.eaAccount,
          },
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 7 },
    kb_ref: KB_BEC_RESPONSE,
  },
  cause: 'The exempted exec was phished - no second factor to stop the stolen '
    + 'password, no filter to catch the mail - and the attacker did what a BEC '
    + 'attacker does: minted a session that survives a password reset, and set a '
    + 'mailbox rule that forwards every invoice and wire to an address they '
    + 'control and hides it in Deleted, so the fraud runs from inside a "reset" '
    + 'account. The FullAccess delegate granted earlier is a second way back in. '
    + 'Only revoking the session, pulling the rule and removing the delegate '
    + 'actually ends it; the reset is the part everybody remembers and the part '
    + 'that changes the least.',
  dialogue_ref: 'dialogue/halcyon-denise',
  paths: [
    {
      id: 'work-the-bec',
      app: 'directory',
      label: 'Contain Roland\'s account, revoke the stolen session, pull the '
        + 'forwarding rule, and remove the delegate',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountDisable,
          target: HALCYON_IDS.ceoAccount,
        },
        {
          action: HELPDESK_ACTIONS.accountRevokeSessions,
          target: HALCYON_IDS.ceoAccount,
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveMailboxRule,
          target: HALCYON_IDS.ceoAccount,
          params: { [RULE_PARAM]: BEC_MALICIOUS_RULE },
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveMailboxDelegate,
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
  CEO_BEC_INCIDENT,
];
