import type { ActionDef } from '../../engine/actions';
import { FIELDS } from '../../world/fields';
import {
  describeNode,
  field,
  HELPDESK_TIER,
  requireTargetId,
  resolveParamNode,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from '../../world/actions/ids';

const GROUP_PARAM = 'group';

export const ACCOUNT_ACTIONS: readonly ActionDef[] = [
  {
    id: HELPDESK_ACTIONS.accountUnlock,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'account');

      if (!resolved.ok) {
        return resolved.reason;
      }

      if (field(resolved.node, FIELDS.enabled) === false) {
        return `"${describeNode(resolved.node)}" is disabled, not locked. `
          + 'Unlocking a disabled account achieves a very tidy nothing.';
      }

      if (field(resolved.node, FIELDS.locked) !== true) {
        return `"${describeNode(resolved.node)}" is not locked. `
          + 'Whatever they are complaining about, it is something else.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(
        requireTargetId(context.target),
        FIELDS.locked,
        false,
      );
    },
  },
  {
    id: HELPDESK_ACTIONS.accountResetPassword,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'account');

      if (!resolved.ok) {
        return resolved.reason;
      }

      if (field(resolved.node, FIELDS.enabled) === false) {
        return `"${describeNode(resolved.node)}" is disabled. `
          + 'Give it a password and it still will not let anybody in.';
      }

      return null;
    },
    apply: (context) => {
      const target = requireTargetId(context.target);
      // A reset hands out a temporary password, which also ends a lockout:
      // leaving the account locked afterwards would be a support call an hour
      // later from the same person, with less patience.
      context.graph.setField(
        target,
        FIELDS.passwordResetAt,
        context.clock.now(),
      );
      context.graph.setField(target, FIELDS.locked, false);
    },
  },
  {
    id: HELPDESK_ACTIONS.accountAddToGroup,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'account');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const group = resolveParamNode(context, GROUP_PARAM, 'group');

      if (!group.ok) {
        return group.reason;
      }

      const member = context.graph
        .neighbors(resolved.node.id, {
          direction: 'out',
          edgeKind: 'member_of',
        })
        .some((candidate) => candidate.id === group.node.id);

      return member
        ? `"${describeNode(resolved.node)}" is already in `
          + `"${describeNode(group.node)}". Adding them twice is not how `
          + 'permissions work, however much the requester insists.'
        : null;
    },
    apply: (context) => {
      const group = context.params[GROUP_PARAM];

      if (typeof group !== 'string') {
        throw new TypeError('Group membership needs a group node id.');
      }

      context.graph.addEdge({
        from: requireTargetId(context.target),
        to: group,
        kind: 'member_of',
      });
    },
  },
  {
    id: HELPDESK_ACTIONS.accountRemoveFromGroup,
    tier: HELPDESK_TIER,
    validate: (context) => {
      const resolved = resolveTarget(context, 'account');

      if (!resolved.ok) {
        return resolved.reason;
      }

      const group = resolveParamNode(context, GROUP_PARAM, 'group');

      if (!group.ok) {
        return group.reason;
      }

      const member = context.graph
        .neighbors(resolved.node.id, {
          direction: 'out',
          edgeKind: 'member_of',
        })
        .some((candidate) => candidate.id === group.node.id);

      return member
        ? null
        : `"${describeNode(resolved.node)}" was never in `
          + `"${describeNode(group.node)}", so there is nothing to take away.`;
    },
    apply: (context) => {
      const group = context.params[GROUP_PARAM];

      if (typeof group !== 'string') {
        throw new TypeError('Group membership needs a group node id.');
      }

      context.graph.removeEdge({
        from: requireTargetId(context.target),
        to: group,
        kind: 'member_of',
      });
    },
  },
];
