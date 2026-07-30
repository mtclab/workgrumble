import type { ActionDef } from '../../engine/actions';
import type { TicketEngine } from '../../engine/tickets';
import { FIELDS } from '../fields';
import {
  field,
  HELPDESK_TIER,
  requireTargetId,
  resolveTarget,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

/**
 * What the ticket actions need to know about shipped ticket content without
 * depending on the content itself: whether a ticket's own resolution rule
 * accepts an escalation. Lane content supplies it; the actions stay generic.
 */
export interface TicketPolicy {
  readonly tickets: TicketEngine;
  allowsEscalation(ticketId: string): boolean;
}

const CLOSED_REASON = 'That ticket is already closed. Let it rest.';

export function createTicketActions(
  policy: Readonly<TicketPolicy>,
): readonly ActionDef[] {
  return [
    {
      id: HELPDESK_ACTIONS.ticketSetWaiting,
      tier: HELPDESK_TIER,
      validate: (context) => {
        const resolved = resolveTarget(context, 'ticket');

        if (!resolved.ok) {
          return resolved.reason;
        }

        const state = field(resolved.node, FIELDS.state);

        if (state === 'resolved') {
          return CLOSED_REASON;
        }

        if (state === 'breached') {
          return 'The SLA on that ticket has already run out. Parking it on '
            + 'the user now fools nobody, least of all the report.';
        }

        if (state === 'waiting_on_user') {
          return 'That ticket is already parked on the user. The clock is as '
            + 'stopped as it is going to get.';
        }

        return null;
      },
      apply: (context) => {
        policy.tickets.setWaiting(requireTargetId(context.target), true);
      },
    },
    {
      id: HELPDESK_ACTIONS.ticketClearWaiting,
      tier: HELPDESK_TIER,
      validate: (context) => {
        const resolved = resolveTarget(context, 'ticket');

        if (!resolved.ok) {
          return resolved.reason;
        }

        const state = field(resolved.node, FIELDS.state);

        if (state === 'resolved') {
          return CLOSED_REASON;
        }

        if (state !== 'waiting_on_user') {
          return 'That ticket is not waiting on anybody. The clock is already '
            + 'running, and it is running at you.';
        }

        return null;
      },
      apply: (context) => {
        policy.tickets.setWaiting(requireTargetId(context.target), false);
      },
    },
    {
      id: HELPDESK_ACTIONS.ticketEscalate,
      tier: HELPDESK_TIER,
      validate: (context) => {
        const resolved = resolveTarget(context, 'ticket');

        if (!resolved.ok) {
          return resolved.reason;
        }

        if (field(resolved.node, FIELDS.state) === 'resolved') {
          return CLOSED_REASON;
        }

        if (field(resolved.node, FIELDS.escalated) === true) {
          return 'That one is already with the field team. Escalating it '
            + 'twice just puts your name on it twice.';
        }

        if (!policy.allowsEscalation(resolved.node.id)) {
          return 'This is fixable from your desk, and everyone downstream '
            + 'knows it. Escalating it would be a career-limiting move.';
        }

        return null;
      },
      apply: (context) => {
        context.graph.setField(
          requireTargetId(context.target),
          FIELDS.escalated,
          true,
        );
      },
    },
  ];
}
