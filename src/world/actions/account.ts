import type { ActionData, GuardData } from '../../engine-api';
import { IDENTITY_VERIFICATION_TICKS } from '../fallout';
import { FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  param,
  paramNodeGuards,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const GROUP_PARAM = 'group';

const MEMBER_OF_GROUP = {
  pred: 'has_edge',
  from: TARGET,
  to: param(GROUP_PARAM),
  kind: 'member_of',
} as const;

/**
 * Three things wear the same face at the login box, and each of them has its
 * own fix. These are the sentences that say which one you are looking at -
 * exported because the directory greys the same buttons out with the same
 * words, and a button that refuses for one reason while the engine refuses for
 * another is two rules pretending to be one.
 */
export const DISABLED_NOT_LOCKED_REASON = '"{target.label}" is disabled, not '
  + 'locked. Somebody switched that account off on purpose - a leaver, a hold, '
  + 'a contract that ended - and unlocking it achieves a very tidy nothing.';

export const EXPIRED_NOT_LOCKED_REASON = '"{target.label}" is not locked: '
  + 'their password has expired, which is a policy clock running out on the '
  + 'credential rather than a door somebody shut. Reset it instead.';

export const NOT_LOCKED_REASON = '"{target.label}" is not locked. Whatever '
  + 'they are complaining about, it is something else.';

export const DISABLED_NEEDS_ENABLING_REASON = '"{target.label}" is disabled. '
  + 'Give it a new password and it still lets nobody in - the account itself '
  + 'is switched off, and putting it back is a different decision.';

export const NOT_DISABLED_REASON = '"{target.label}" is not disabled, so '
  + 'there is nothing here to switch back on. Read the state before you pick '
  + 'the fix: locked, disabled and expired are three faults and three jobs.';

/** The account is off, rather than locked or out of date. */
const IS_DISABLED: GuardData = {
  when: fieldIs(TARGET, FIELDS.enabled, false),
  reason: DISABLED_NOT_LOCKED_REASON,
};

/**
 * Why signing every device out is not the fix for a dead authenticator.
 *
 * The wrong-flavour trap, in one sentence the player can act on. It is a real
 * verb with a real use - a session somebody else is holding - and this is the
 * one case where doing it makes the ticket worse, so the refusal has to say
 * which fix it is the wrong flavour OF.
 */
export const REVOKE_WITHOUT_FACTOR_REASON = '"{target.label}" has no working '
  + 'second factor at the moment, so signing every device out is signing them '
  + 'out of the one thing they can still get into. Revoking sessions is the fix '
  + 'for a session somebody else is holding. This is a lost authenticator, and '
  + 'the fix for that is a new enrolment.';

/** The seat count, quoted back at whoever went looking for a spare one. */
export const NO_FREE_SEATS_REASON = 'The licence pool has no free seats. '
  + 'Somewhere on this estate somebody is holding one and not using it, and '
  + 'until that seat comes back this is not a thing you can grant.';

export const SEATS_PARAM = 'pool';

export const ACCOUNT_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.accountUnlock,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      IS_DISABLED,
      // Ordered from the most specific state to the least: an expired password
      // on an unlocked account is a real fault with a real fix, and "it is not
      // locked" would send the player looking for a second problem that is not
      // there.
      {
        when: {
          pred: 'all',
          of: [
            not(fieldIs(TARGET, FIELDS.locked, true)),
            fieldIs(TARGET, FIELDS.passwordExpired, true),
          ],
        },
        reason: EXPIRED_NOT_LOCKED_REASON,
      },
      {
        when: not(fieldIs(TARGET, FIELDS.locked, true)),
        reason: NOT_LOCKED_REASON,
      },
    ],
    // An unlock ends the lockout and the count behind it, and touches nothing
    // else: the password is still the password, and an expired one is still
    // expired. That is the whole lesson of the three states.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.locked,
        value: { const: false },
      },
      { op: 'clear_field', node: TARGET, field: FIELDS.lockedSince },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.badPwCount,
        value: { const: 0 },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountEnable,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: not(fieldIs(TARGET, FIELDS.enabled, false)),
        reason: NOT_DISABLED_REASON,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.enabled,
        value: { const: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountResetPassword,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: fieldIs(TARGET, FIELDS.enabled, false),
        reason: DISABLED_NEEDS_ENABLING_REASON,
      },
    ],
    // A reset hands out a temporary password, which also ends a lockout and
    // the expiry that may have caused all this: leaving either behind would be
    // a support call an hour later from the same person, with less patience.
    // And it leaves the flag every real reset leaves - they have to change it
    // at next logon, which is the ticket after this one.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.passwordResetAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.locked,
        value: { const: false },
      },
      { op: 'clear_field', node: TARGET, field: FIELDS.lockedSince },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.badPwCount,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.passwordExpired,
        value: { const: false },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.pwMustChange,
        value: { const: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountVerifyIdentity,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      // TODAY, and the word is load-bearing. The refusal used to read any
      // stamp at all, so a check done on Monday refused a check on Wednesday
      // and left the player with an enrolment they could not verify - which is
      // a trap with no way out rather than a joke about repeating yourself.
      {
        when: {
          pred: 'field_within',
          node: TARGET,
          field: FIELDS.identityVerifiedAt,
          ticks: IDENTITY_VERIFICATION_TICKS,
        },
        reason: 'You have already checked who "{target.label}" is today. '
          + 'Asking them their payroll number twice is not twice the security, '
          + 'it is one security and one irritated person.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.identityVerifiedAt,
        value: { now: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountRegisterMfa,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: fieldIs(TARGET, FIELDS.enabled, false),
        reason: 'Binding a new authenticator to a disabled account is putting '
          + 'a new lock on a door that has been bricked up. Whatever they are '
          + 'really asking for, it starts somewhere else.',
      },
      {
        when: fieldIs(TARGET, FIELDS.mfaEnrolled, true),
        reason: '"{target.label}" already has a working second factor. '
          + 'Re-enrolling one that works is how somebody ends up with two '
          + 'codes and no idea which one the door wants.',
      },
    ],
    // Nothing here REFUSES for want of a verification. That is not an
    // oversight: an enrolment that refused without one would teach the player
    // that the system does the checking, and the entire point of this trap is
    // that it does not and never will.
    //
    // What it does do is write down what was true at the desk, in the minute
    // it happened, and never revise it. The consequence a day later reads this
    // latch rather than the account's verification stamp, because the stamp
    // can be written at any time - verifying the next morning used to cancel a
    // consequence that had already been earned, and a speculative check on
    // Monday used to excuse an enrolment on Wednesday.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.mfaEnrolled,
        value: { const: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.mfaEnrolledAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.mfaEnrolmentVerified,
        value: { const: false },
      },
      {
        op: 'when',
        cond: {
          pred: 'field_within',
          node: TARGET,
          field: FIELDS.identityVerifiedAt,
          ticks: IDENTITY_VERIFICATION_TICKS,
        },
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.mfaEnrolmentVerified,
            value: { const: true },
          },
        ],
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountRevokeSessions,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: not(fieldIs(TARGET, FIELDS.mfaEnrolled, true)),
        reason: REVOKE_WITHOUT_FACTOR_REASON,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.sessionsRevokedAt,
        value: { now: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountRevokeLicence,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      ...paramNodeGuards(SEATS_PARAM, 'service'),
      {
        when: not(fieldIs(TARGET, FIELDS.licence, true)),
        reason: '"{target.label}" is not holding a seat, so there is none to '
          + 'take back. The one that is missing is being held by somebody '
          + 'else, and the directory will say who.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.licence,
        value: { const: false },
      },
      {
        op: 'set_field',
        node: param(SEATS_PARAM),
        field: FIELDS.seatsFree,
        value: {
          add: {
            node: param(SEATS_PARAM),
            field: FIELDS.seatsFree,
            by: { const: 1 },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountAssignLicence,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      ...paramNodeGuards(SEATS_PARAM, 'service'),
      {
        when: fieldIs(TARGET, FIELDS.licence, true),
        reason: '"{target.label}" already has a seat. Whatever they cannot '
          + 'open, it is not the licence stopping them.',
      },
      {
        when: {
          pred: 'field_at_most',
          node: param(SEATS_PARAM),
          field: FIELDS.seatsFree,
          value: 0,
        },
        reason: NO_FREE_SEATS_REASON,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.licence,
        value: { const: true },
      },
      {
        op: 'set_field',
        node: param(SEATS_PARAM),
        field: FIELDS.seatsFree,
        value: {
          sub: {
            node: param(SEATS_PARAM),
            field: FIELDS.seatsFree,
            by: { const: 1 },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountAddToGroup,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      ...paramNodeGuards(GROUP_PARAM, 'group'),
      {
        when: MEMBER_OF_GROUP,
        reason: `"{target.label}" is already in "{p:${GROUP_PARAM}.label}". `
          + 'Adding them twice is not how permissions work, however much the '
          + 'requester insists.',
      },
    ],
    apply: [
      {
        op: 'add_edge',
        from: TARGET,
        to: param(GROUP_PARAM),
        kind: 'member_of',
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.accountRemoveFromGroup,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      ...paramNodeGuards(GROUP_PARAM, 'group'),
      {
        when: not(MEMBER_OF_GROUP),
        reason: `"{target.label}" was never in "{p:${GROUP_PARAM}.label}", `
          + 'so there is nothing to take away.',
      },
    ],
    apply: [
      {
        op: 'remove_edge',
        from: TARGET,
        to: param(GROUP_PARAM),
        kind: 'member_of',
      },
    ],
  },
];
