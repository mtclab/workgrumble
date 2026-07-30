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

      // Hardware first: a fan is not "already running", it is not a service
      // at all, and telling the player the wrong true thing helps nobody.
      if (field(resolved.node, FIELDS.restartable) !== true) {
        return `"${describeNode(resolved.node)}" is a piece of hardware that `
          + 'reports a status, not software you can stop and start. You '
          + 'cannot turn a fan off and on again. Well. You can. It will not '
          + 'help.';
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
