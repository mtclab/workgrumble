import type { ActionDef } from '../../engine/actions';
import { DEVICE_TYPES, FIELDS } from '../fields';
import {
  describeNode,
  field,
  HELPDESK_TIER,
  requireTargetId,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const FULL_BATTERY = 100;

export const DEVICE_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.devicePowerCycle,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'device');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const powered = field(resolved.node, FIELDS.powered);
      const wedged = field(resolved.node, FIELDS.wedged);

      if (powered === true && wedged !== true) {
        return `"${describeNode(resolved.node)}" is on and behaving itself. `
          + 'Switching it off and on again now is superstition, not support.';
      }

      return null;
    },
    apply: (context) => {
      const target = requireTargetId(context.target);
      context.graph.setField(target, FIELDS.powered, true);
      context.graph.setField(target, FIELDS.wedged, false);
    },
  },
  {
    id: HELPDESK_ACTIONS.deviceReplaceBattery,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'device');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const battery = field(resolved.node, FIELDS.batteryPct);

      if (typeof battery !== 'number') {
        return `"${describeNode(resolved.node)}" does not take batteries. `
          + 'It takes mains power and mild abuse.';
      }

      if (battery >= FULL_BATTERY) {
        return `The batteries in "${describeNode(resolved.node)}" are fresh. `
          + 'The cupboard budget is not.';
      }

      return null;
    },
    apply: (context) => {
      const target = requireTargetId(context.target);
      context.graph.setField(target, FIELDS.batteryPct, FULL_BATTERY);
      context.graph.setField(target, FIELDS.powered, true);
    },
  },
  {
    id: HELPDESK_ACTIONS.printerClearQueue,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'device');

      if (!resolved.ok) {
        return resolved.reason;
      }

      if (field(resolved.node, FIELDS.type) !== DEVICE_TYPES.printer) {
        return `"${describeNode(resolved.node)}" is not a printer. `
          + 'It has no queue, only opinions.';
      }

      const queued = field(resolved.node, FIELDS.queueLen);

      if (typeof queued !== 'number' || queued <= 0) {
        return `The queue on "${describeNode(resolved.node)}" is already `
          + 'empty. Whatever is not printing, it is not the backlog.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(
        requireTargetId(context.target),
        FIELDS.queueLen,
        0,
      );
    },
  },
];
