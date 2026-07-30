import type { ActionData } from '../../engine-api';
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

export const ACCOUNT_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.accountUnlock,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: fieldIs(TARGET, FIELDS.enabled, false),
        reason: '"{target.label}" is disabled, not locked. '
          + 'Unlocking a disabled account achieves a very tidy nothing.',
      },
      {
        when: not(fieldIs(TARGET, FIELDS.locked, true)),
        reason: '"{target.label}" is not locked. '
          + 'Whatever they are complaining about, it is something else.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.locked,
        value: { const: false },
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
        reason: '"{target.label}" is disabled. '
          + 'Give it a password and it still will not let anybody in.',
      },
    ],
    // A reset hands out a temporary password, which also ends a lockout:
    // leaving the account locked afterwards would be a support call an hour
    // later from the same person, with less patience.
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
