import type { ActionDef } from '../../engine/actions';
import { FIELDS, SERVICE_STATUS } from '../fields';
import {
  describeNode,
  field,
  HELPDESK_TIER,
  requireTargetId,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const SERVICE_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.serviceRestart,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'service');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const status = field(resolved.node, FIELDS.status);

      if (
        status !== SERVICE_STATUS.wedged
        && status !== SERVICE_STATUS.stopped
      ) {
        return `"${describeNode(resolved.node)}" is already running. `
          + 'Restarting a healthy service is how a small ticket becomes a big '
          + 'one.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(
        requireTargetId(context.target),
        FIELDS.status,
        SERVICE_STATUS.running,
      );
    },
  },
];
