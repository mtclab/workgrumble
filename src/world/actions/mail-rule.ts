import type { ActionData } from '../../engine-api';
import {
  HELPDESK_TIER,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const MAIL_RULE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.mailRuleDelete,
    tier: HELPDESK_TIER,
    validate: [...targetGuards('mail_rule')],
    apply: [{ op: 'remove_node', node: TARGET }],
  },
];
