import type { ActionData, GuardData } from '../../engine-api';
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
