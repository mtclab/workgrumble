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
import {
  CHANGE_REQUEST_DECISIONS,
  CHANGE_REQUEST_KINDS,
  CHANGE_REQUEST_STATUSES,
  FIELDS,
} from '../fields';
import { OVERRIDE_RISK_ACCEPTANCE, OVERRIDE_TICKET } from '../override';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { RECERT_FOLLOWUP, RECERT_TICKET } from '../recert';
import type { WorldTicket } from './types';

const KB_EXEC_EXCEPTION = 'kb/exec-exception-risk';
const KB_BEC_RESPONSE = 'kb/bec-incident-response';
const KB_RECERT = 'kb/access-recertification';
const KB_CYA = 'kb/manager-override-cya';

/** The one member_of edge check the recert reuses for every finding. */
function memberOf(account: string, group: string) {
  return {
    op: 'edge' as const,
    from: { id: account },
    to: { id: group },
    kind: 'member_of' as const,
  };
}

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

/**
 * The Q3 access recertification (E8, 0.23.0) - access hell, and the friction is
 * entirely human.
 *
 * One ticket, but a QUEUE: its resolution rule is the whole least-privilege end
 * state, and the path that closes it is the six decisions that get there. Four of
 * them are the classic findings the research names, seeded as real account/group
 * state by this ticket's own `setup`:
 *
 *  - the LEAVER: Gordon Frey, gone since the spring, still enabled and still in a
 *    privileged group - the orphaned account. Revoke = disable him.
 *  - PRIVILEGE CREEP: Marguerite Sole, three departments deep, holding every
 *    role's access. Strip the three she no longer needs (Sales CRM, Ops, Legacy
 *    Admin); keep the one she does (Finance).
 *  - the SERVICE ACCOUNT in Domain Admins: over-privileged, and the sharp one -
 *    it is ALSO load-bearing (slice 3), so right-size it OUT of Domain Admins, do
 *    not touch the Backup Operators group its job needs.
 *  - the SoD conflict: Cass Holloway can both create a vendor and approve its
 *    payment. Split it - revoke one side, keep the other.
 *
 * And two of the clauses are BENIGN access the review must KEEP: Marguerite in
 * Finance and Neil in Sales CRM. They are in the rule so that a blanket-REVOKE is
 * wrong too - strip Neil's Sales CRM (or Marguerite's Finance) and the review does
 * not close, because least-privilege is the graded outcome, not
 * revoke-everything. Neil sharing Sales CRM with Marguerite is the teaching in one
 * group: keep his, strip hers.
 *
 * The rubber-stamp is not a path. The manager offers "just approve them all" in
 * the dialogue (`recertApproveAll`), and it fails closed - it records the
 * sign-off and touches no entitlement, so this rule stays false and the audit
 * breaches. The only way to close it is to work each line.
 */
const ACCESS_RECERT: WorldTicket = {
  arrival: 'morning',
  nodes: [
    HALCYON_IDS.gordonAccount,
    HALCYON_IDS.margueriteAccount,
    HALCYON_IDS.cassAccount,
    HALCYON_IDS.svcBackupAccount,
    HALCYON_IDS.domainAdmins,
    HALCYON_IDS.nightlyBackup,
  ],
  // A compliance deadline, real and not on fire: the audit wants it this quarter,
  // and the manager who owns it wants it off her desk.
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: RECERT_TICKET,
    archetype: 'hidden_cause',
    flavor: {
      title: 'Halcyon: Q3 access recertification - review the privileged groups',
      body:
        'Compliance wants the quarterly access review done. Miriam, the CFO, has '
        + 'sent over the list of who is in the privileged groups and asked you to '
        + 'certify it: keep what is legitimate, revoke what is not. She has added '
        + 'that she is buried in year-end and would honestly rather you "just '
        + 'approved the lot" so she can sign it off - which is exactly how these '
        + 'lists rot in the first place.',
    },
    reporter: HALCYON_IDS.cfo,
    // The findings arrive with the ticket, the way every fault in this game does:
    // the orphaned membership, the three crept groups, the over-privileged
    // service account, and the second half of the SoD conflict (Cass is already
    // in vendor-create by right; this is the approval group that makes it a
    // conflict).
    setup: [
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.gordonAccount,
          to: HALCYON_IDS.financeAdmins,
          kind: 'member_of',
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.margueriteAccount,
          to: HALCYON_IDS.salesCrm,
          kind: 'member_of',
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.margueriteAccount,
          to: HALCYON_IDS.opsShare,
          kind: 'member_of',
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.margueriteAccount,
          to: HALCYON_IDS.legacyAdmin,
          kind: 'member_of',
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.svcBackupAccount,
          to: HALCYON_IDS.domainAdmins,
          kind: 'member_of',
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: HALCYON_IDS.cassAccount,
          to: HALCYON_IDS.paymentApprove,
          kind: 'member_of',
        },
      },
    ],
    // The correct least-privilege end state, in full: the leaver disabled, the
    // crept access stripped, the legit access KEPT, the service account
    // right-sized out of Domain Admins, and the SoD conflict split to exactly one
    // side. Every clause is load-bearing - leave one finding unworked and it
    // stays false, revoke one benign membership and it stays false.
    resolved_when: {
      op: 'and',
      exprs: [
        // The leaver, deprovisioned.
        {
          op: 'eq',
          selector: { id: HALCYON_IDS.gordonAccount },
          field: FIELDS.enabled,
          value: false,
        },
        // Privilege creep, stripped: the three groups she no longer needs.
        { op: 'not', expr: memberOf(HALCYON_IDS.margueriteAccount, HALCYON_IDS.salesCrm) },
        { op: 'not', expr: memberOf(HALCYON_IDS.margueriteAccount, HALCYON_IDS.opsShare) },
        { op: 'not', expr: memberOf(HALCYON_IDS.margueriteAccount, HALCYON_IDS.legacyAdmin) },
        // Kept: her current, legitimate group, and Neil's by-right Sales CRM.
        // These make blanket-revoke wrong - strip either and the review is unmet.
        memberOf(HALCYON_IDS.margueriteAccount, HALCYON_IDS.finance),
        memberOf(HALCYON_IDS.neilAccount, HALCYON_IDS.salesCrm),
        // The service account, right-sized: out of Domain Admins.
        { op: 'not', expr: memberOf(HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins) },
        // The SoD conflict, split to exactly one entitlement (either is fine; both
        // is the conflict, neither is over-revoked).
        {
          op: 'or',
          exprs: [
            {
              op: 'and',
              exprs: [
                memberOf(HALCYON_IDS.cassAccount, HALCYON_IDS.vendorCreate),
                { op: 'not', expr: memberOf(HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove) },
              ],
            },
            {
              op: 'and',
              exprs: [
                { op: 'not', expr: memberOf(HALCYON_IDS.cassAccount, HALCYON_IDS.vendorCreate) },
                memberOf(HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove),
              ],
            },
          ],
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6 },
    kb_ref: KB_RECERT,
  },
  cause: 'Access accretes and never sheds: a leaver whose account was never '
    + 'disabled, a long-serving person carrying every department they have ever '
    + 'been in, a service account somebody made a domain admin to make an error '
    + 'go away, and one clerk who can both raise a vendor and pay it. None of it '
    + 'is an attack; all of it is the org, and the recertification is the only '
    + 'time anybody looks. The service account is the trap - it IS over-privileged '
    + 'and it IS load-bearing, so it is right-sized, not killed.',
  dialogue_ref: 'dialogue/halcyon-miriam',
  paths: [
    {
      id: 'work-the-recert',
      app: 'directory',
      label: 'Work the review: disable the leaver, strip the crept access, '
        + 'right-size the service account, and split the SoD conflict',
      steps: [
        { action: HELPDESK_ACTIONS.accountDisable, target: HALCYON_IDS.gordonAccount },
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: HALCYON_IDS.margueriteAccount,
          params: { group: HALCYON_IDS.salesCrm },
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: HALCYON_IDS.margueriteAccount,
          params: { group: HALCYON_IDS.opsShare },
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: HALCYON_IDS.margueriteAccount,
          params: { group: HALCYON_IDS.legacyAdmin },
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: HALCYON_IDS.svcBackupAccount,
          params: { group: HALCYON_IDS.domainAdmins },
        },
        {
          action: HELPDESK_ACTIONS.accountRemoveFromGroup,
          target: HALCYON_IDS.cassAccount,
          params: { group: HALCYON_IDS.paymentApprove },
        },
      ],
    },
  ],
};

/**
 * The wrong revoke bites back (E8, 0.23.0, slice 3).
 *
 * Summoned - and neither scheduled nor `follows` - because it turns up only when
 * the player has actually KILLED the service account: disabled it, or taken it out
 * of Backup Operators, instead of right-sizing it. The day driver reads that
 * state off the graph once the review is closed and raises this; a clean
 * right-size raises nothing, so honest diligence is never punished.
 *
 * Its setup normalises the account to the fully-broken state the job cannot run
 * under - switched off and out of its group - so the fix is unambiguous whichever
 * way the player killed it: re-enable it and put it back in Backup Operators. It
 * is restored RIGHT-SIZED - it does not go back into Domain Admins, because the
 * recert was right about that part.
 */
const RECERT_BROKEN_JOB: WorldTicket = {
  arrival: 'summoned',
  nodes: [
    HALCYON_IDS.svcBackupAccount,
    HALCYON_IDS.backupOperators,
    HALCYON_IDS.nightlyBackup,
  ],
  // A production backup is not running. Real, and reasonably urgent.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: RECERT_FOLLOWUP,
    archetype: 'hidden_cause',
    flavor: {
      title: 'Halcyon: the nightly backup failed - "access denied" for the '
        + 'service account',
      body:
        'Bronwen has flagged that the overnight backup job did not run - the '
        + 'monitoring email says the service account it runs as was denied access. '
        + 'It worked yesterday. The only thing that changed is the access review: '
        + 'the service account was in Domain Admins, and cleaning that up took the '
        + 'access the job actually depended on with it. The backup needs putting '
        + 'back - right-sized, not made a domain admin again.',
    },
    reporter: HALCYON_IDS.bronwen,
    // The broken state, normalised: whatever the careless revoke did, the job's
    // account is off and out of its group here, so the restore is the same two
    // moves every time.
    setup: [
      {
        op: 'setField',
        id: HALCYON_IDS.svcBackupAccount,
        field: FIELDS.enabled,
        value: false,
      },
      {
        op: 'removeEdge',
        edge: {
          from: HALCYON_IDS.svcBackupAccount,
          to: HALCYON_IDS.backupOperators,
          kind: 'member_of',
        },
      },
    ],
    // Restored to the RIGHT-SIZED state the recert should have left it in: enabled
    // and back in Backup Operators (the group its job needs) - and NOT back in
    // Domain Admins, which the review was correct to remove.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: HALCYON_IDS.svcBackupAccount },
          field: FIELDS.enabled,
          value: true,
        },
        memberOf(HALCYON_IDS.svcBackupAccount, HALCYON_IDS.backupOperators),
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: KB_RECERT,
  },
  cause: 'The service account was over-privileged AND load-bearing: it did not '
    + 'need Domain Admins, but the nightly job genuinely runs as it, through '
    + 'Backup Operators. Killing the account - disabling it, or stripping the '
    + 'group its job needs - is what breaks the job. Right-sizing it would not '
    + 'have: the fix now is to restore only the access the job depends on.',
  dialogue_ref: 'dialogue/halcyon-bronwen',
  paths: [
    {
      id: 'restore-right-sized',
      app: 'directory',
      label: 'Put the backup account back: re-enable it and return it to Backup '
        + 'Operators (not Domain Admins)',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountEnable,
          target: HALCYON_IDS.svcBackupAccount,
        },
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: HALCYON_IDS.svcBackupAccount,
          params: { group: HALCYON_IDS.backupOperators },
        },
      ],
    },
  ],
};

/**
 * The manager override you cannot refuse (E8, 0.24.0) - the CYA / risk-acceptance
 * gate, the org-dysfunction epic's third mechanic.
 *
 * The order is against best practice and entirely plausible: Ivor Brace, the Head
 * of IT and the player's own manager, wants the Meridian migration contractor
 * given Domain Admin to finish the finance cutover tonight - "we'll narrow it
 * later". Domain admin is standing access to everything, far beyond the task, on
 * an external account; a good tech knows it is wrong, and the manager who owns the
 * deadline is leaning on the desk to just do it.
 *
 * The gate is the mechanic, and it fails CLOSED both ways:
 *  - REFUSING OUTRIGHT (never granting) leaves the contractor out of Domain Admins
 *    - the resolution rule's first clause is false, the ticket breaches unresolved,
 *    which is the insubordination cost.
 *  - SILENTLY COMPLYING (the bare `accountAddToGroup` with nothing signed) makes
 *    the first clause true and the second - a SIGNED risk acceptance naming the
 *    accepting owner - false. The ticket does not close, and the audit finding
 *    (the summoned fallout) lands on the DESK.
 *  - The WIN is getting it in writing: sign the risk acceptance (the ordering
 *    manager's approval on the 0.10.0 change_request artifact, reused as the
 *    `risk_acceptance` variant), THEN grant. Both clauses true, and the finding
 *    lands on the accepting owner, not the desk.
 *
 * The risk acceptance is the 0.10.0 change_request REUSED: the ticket seeds it
 * unsigned (a draft with the risk, the why-not-now, and the required signer), the
 * `riskAcceptanceSign` verb records the ordering manager's approve decision on it,
 * and the resolution rule reads it back with `exists`. The signature is the
 * approval; the artifact is the same node kind, told apart by `cr_kind`.
 */
const MANAGER_OVERRIDE: WorldTicket = {
  arrival: 'morning',
  nodes: [
    HALCYON_IDS.contractorAccount,
    HALCYON_IDS.managerAccount,
    HALCYON_IDS.domainAdmins,
  ],
  // Urgent because the manager says the cutover is tonight; the TRUE urgency is a
  // want dressed as a fire - the deadline is real but the RIGHT move is the
  // sign-off, not the rush, and rushing is exactly the trap.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: OVERRIDE_TICKET,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: "give the Meridian contractor domain admin for tonight"',
      body:
        'Ivor Brace, the Head of IT, has raised it himself: the Meridian '
        + 'migration engineer needs to finish the finance-system cutover tonight '
        + 'and keeps hitting permissions. "Just put Wystan in Domain Admins so he '
        + 'can get it done - we\'ll narrow it back down once the migration is in. '
        + 'I know it is not ideal, but the board wants this live by Monday and I '
        + 'do not want to hear it slipped on an access request." It is your own '
        + 'manager, it is one click, and it is a domain admin token handed to an '
        + 'external laptop.',
    },
    reporter: HALCYON_IDS.manager,
    // The risk-acceptance draft arrives WITH the order, unsigned - the 0.10.0
    // change_request node reused as the risk_acceptance variant. It names the
    // risk, the why-not-now, and the accepting owner who must sign (Ivor). The
    // sign verb records his approval on it; nothing else about the estate is
    // seeded, because the contractor and the group are standing nodes and the
    // "fault" is only the order.
    setup: [
      {
        op: 'addNode',
        node: {
          id: OVERRIDE_RISK_ACCEPTANCE,
          kind: 'change_request',
          fields: {
            [FIELDS.name]: 'Risk acceptance: Domain Admin for the Meridian '
              + 'contractor',
            [FIELDS.crKind]: CHANGE_REQUEST_KINDS.riskAcceptance,
            [FIELDS.crTarget]: HALCYON_IDS.contractorAccount,
            [FIELDS.crVerb]: HELPDESK_ACTIONS.accountAddToGroup,
            [FIELDS.crRisk]: 'Domain Admin is standing control of the whole '
              + 'directory - every account, every server - handed to an external '
              + 'contractor\'s laptop for a task that needs a fraction of it. If '
              + 'that laptop is compromised, or the access outlives the migration, '
              + 'it is a domain-wide breach.',
            [FIELDS.crReason]: 'The finance cutover has a board deadline of Monday '
              + 'and scoping a least-privilege role for the migration tooling '
              + 'takes days the deadline does not allow. Accepted as a '
              + 'time-boxed exception, to be narrowed the moment the migration is '
              + 'in.',
            [FIELDS.crRequiredSigner]: HALCYON_IDS.managerAccount,
            [FIELDS.crStatus]: CHANGE_REQUEST_STATUSES.submitted,
          },
        },
      },
    ],
    // The win, in full: the contractor IS a Domain Admin (the action done) AND a
    // signed risk acceptance names the accepting owner (the sign-off on file).
    // Both clauses load-bearing: no grant and it stays false (refusing breaches);
    // no signature and it stays false (silent compliance does not close it).
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'edge',
          from: { id: HALCYON_IDS.contractorAccount },
          to: { id: HALCYON_IDS.domainAdmins },
          kind: 'member_of',
        },
        {
          op: 'exists',
          kind: 'change_request',
          where: [
            { field: FIELDS.crKind, value: CHANGE_REQUEST_KINDS.riskAcceptance },
            { field: FIELDS.crTarget, value: HALCYON_IDS.contractorAccount },
            { field: FIELDS.crDecision, value: CHANGE_REQUEST_DECISIONS.approve },
            { field: FIELDS.crAcceptedBy, value: HALCYON_IDS.managerAccount },
          ],
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: KB_CYA,
  },
  cause: 'A manager with the authority to insist has ordered a technically-trivial '
    + 'thing that is a real risk, and the desk is one click and one political act '
    + 'away from owning it. Refusing outright is insubordination; silently doing '
    + 'it puts the incident on the person who typed the command. The only path '
    + 'that is neither is the risk acceptance - name the risk, name why it cannot '
    + 'be remediated now, and get the ordering manager\'s SIGNATURE - after which '
    + 'the grant is documented, authorised, and accountable to the person who '
    + 'accepted it. The CYA is the right move and it is never the punished one.',
  dialogue_ref: 'dialogue/halcyon-ivor',
  paths: [
    {
      id: 'get-it-in-writing',
      app: 'directory',
      label: 'Get the risk accepted in writing - the ordering manager signs it - '
        + 'then grant the access',
      steps: [
        {
          action: HELPDESK_ACTIONS.riskAcceptanceSign,
          target: OVERRIDE_RISK_ACCEPTANCE,
        },
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: HALCYON_IDS.contractorAccount,
          params: { group: HALCYON_IDS.domainAdmins },
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
  ACCESS_RECERT,
  RECERT_BROKEN_JOB,
  MANAGER_OVERRIDE,
];
