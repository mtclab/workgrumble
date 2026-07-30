import type { ActionDef } from '../../engine/actions';
import {
  FIELDS,
  isRotation,
  ROTATIONS,
} from '../../world/fields';
import {
  describeNode,
  field,
  HELPDESK_TIER,
  numberParam,
  requireTargetId,
  resolveTarget,
  stringParam,
} from './helpers';
import { HELPDESK_ACTIONS } from '../../world/actions/ids';

const ROTATION_PARAM = 'rotation';
const RESOLUTION_PARAM = 'resolution';
const RESOLUTION_PATTERN = /^\d{3,4}x\d{3,4}$/;

export const MACHINE_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.machineSetDisplayRotation,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'machine');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const rotation = numberParam(context, ROTATION_PARAM);

      if (!isRotation(rotation)) {
        return 'A screen can be turned to '
          + `${ROTATIONS.map(String).join(', ')} degrees and nothing in `
          + 'between. The monitor stand is not that ambitious.';
      }

      if (field(resolved.node, FIELDS.displayRotation) === rotation) {
        return `"${describeNode(resolved.node)}" is already at `
          + `${String(rotation)} degrees. Setting it again would be theatre.`;
      }

      return null;
    },
    apply: (context) => {
      const rotation = context.params[ROTATION_PARAM];

      if (!isRotation(rotation)) {
        throw new TypeError('Display rotation must be 0, 90, 180 or 270.');
      }

      context.graph.setField(
        requireTargetId(context.target),
        FIELDS.displayRotation,
        rotation,
      );
    },
  },
  {
    id: HELPDESK_ACTIONS.machineSetResolution,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'machine');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const resolution = stringParam(context, RESOLUTION_PARAM);

      if (resolution === undefined || !RESOLUTION_PATTERN.test(resolution)) {
        return 'Resolutions look like 1024x768. Anything else and the driver '
          + 'will pick something worse out of spite.';
      }

      if (field(resolved.node, FIELDS.resolution) === resolution) {
        return `"${describeNode(resolved.node)}" already runs at `
          + `${resolution}.`;
      }

      return null;
    },
    apply: (context) => {
      const resolution = context.params[RESOLUTION_PARAM];

      if (typeof resolution !== 'string') {
        throw new TypeError('Resolution must be a string.');
      }

      context.graph.setField(
        requireTargetId(context.target),
        FIELDS.resolution,
        resolution,
      );
    },
  },
  {
    id: HELPDESK_ACTIONS.machineReboot,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'machine');
      return resolved.ok ? null : resolved.reason;
    },
    apply: (context) => {
      const target = requireTargetId(context.target);
      context.graph.setField(target, FIELDS.pendingUpdates, false);
      context.graph.setField(target, FIELDS.uptimeSince, context.clock.now());
    },
  },
];
