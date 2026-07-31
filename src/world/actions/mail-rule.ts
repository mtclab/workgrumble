import type { ActionData } from '../../engine-api';
import { FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const MAIL_RULE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.mailRuleEnable,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('mail_rule'),
      {
        when: fieldIs(TARGET, FIELDS.enabled, true),
        reason: '"{target.label}" is already on. Whatever got through came '
          + 'through a rule that was running, which is a different and much '
          + 'longer conversation.',
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
];
