import type { ActionDef } from '../../engine/actions';
import {
  describeNode,
  HELPDESK_TIER,
  requireTargetId,
  resolveParamNode,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from '../../world/actions/ids';

const ACCOUNT_PARAM = 'account';

export const SHARE_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.shareGrantAccess,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'share');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const account = resolveParamNode(context, ACCOUNT_PARAM, 'account');

      if (!account.ok) {
        return account.reason;
      }

      const granted = context.graph
        .neighbors(account.node.id, {
          direction: 'out',
          edgeKind: 'has_access',
        })
        .some((candidate) => candidate.id === resolved.node.id);

      return granted
        ? `"${describeNode(account.node)}" can already reach `
          + `"${describeNode(resolved.node)}". The problem is somewhere else, `
          + 'and it usually spells the path wrong.'
        : null;
    },
    apply: (context) => {
      const account = context.params[ACCOUNT_PARAM];

      if (typeof account !== 'string') {
        throw new TypeError('Granting access needs an account node id.');
      }

      context.graph.addEdge({
        from: account,
        to: requireTargetId(context.target),
        kind: 'has_access',
      });
    },
  },
];
