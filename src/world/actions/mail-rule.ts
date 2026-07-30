import type { ActionDef } from '../../engine/actions';
import {
  HELPDESK_TIER,
  requireTargetId,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const MAIL_RULE_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.mailRuleDelete,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'mail_rule');
      return resolved.ok ? null : resolved.reason;
    },
    apply: (context) => {
      context.graph.removeNode(requireTargetId(context.target));
    },
  },
];
