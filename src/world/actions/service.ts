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

      // Queued work survives a restart on purpose, so a service brought back
      // in front of a full queue is handed the job that jammed it within
      // seconds. Real order: empty the queue, then start the service.
      const backlog = context.graph
        .neighbors(resolved.node.id, {
          direction: 'out',
          edgeKind: 'connected_to',
        })
        .find((device) => {
          const queued = device.fields[FIELDS.queueLen];
          return typeof queued === 'number' && queued > 0;
        });

      if (backlog !== undefined) {
        return `${String(backlog.fields[FIELDS.queueLen])} job(s) are still `
          + `queued on "${describeNode(backlog)}". It will just choke on the `
          + 'same job again. Empty the queue first, then start the service.';
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
