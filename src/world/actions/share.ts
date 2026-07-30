import type { ActionData } from '../../engine-api';
import {
  HELPDESK_TIER,
  param,
  paramNodeGuards,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const ACCOUNT_PARAM = 'account';

export const SHARE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.shareGrantAccess,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('share'),
      ...paramNodeGuards(ACCOUNT_PARAM, 'account'),
      {
        when: {
          pred: 'has_edge',
          from: param(ACCOUNT_PARAM),
          to: TARGET,
          kind: 'has_access',
        },
        reason: `"{p:${ACCOUNT_PARAM}.label}" can already reach `
          + '"{target.label}". The problem is somewhere else, and it usually '
          + 'spells the path wrong.',
      },
    ],
    apply: [
      {
        op: 'add_edge',
        from: param(ACCOUNT_PARAM),
        to: TARGET,
        kind: 'has_access',
      },
    ],
  },
];
