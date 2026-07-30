import type { ActionDef } from '../../engine/actions';
import type { TicketEngine } from '../../engine/tickets';
import { FIELDS } from '../../world/fields';
import {
  field,
  HELPDESK_TIER,
  requireTargetId,
  resolveTarget,
  stringParam,
} from './helpers';
import { HELPDESK_ACTIONS } from '../../world/actions/ids';

const CLUE_PARAM = 'clue';

/** The clue field is one string; the ticket app splits it back into lines. */
export function clueLines(value: unknown): readonly string[] {
  return typeof value === 'string' && value.length > 0
    ? value.split('\n').filter((line) => line.length > 0)
    : [];
}

/**
 * What the ticket actions need to know about shipped ticket content without
 * depending on the content itself: whether a ticket's own resolution rule
 * accepts an escalation. Lane content supplies it; the actions stay generic.
 */
export interface TicketPolicy {
  readonly tickets: TicketEngine;
  allowsEscalation(ticketId: string): boolean;
  /**
   * Whether the ticket engine is actually tracking this id. A `ticket` node
   * can exist in the graph without a record behind it - hand-seeded content,
   * a future spawner, a test fixture - and the engine THROWS when asked about
   * one. Validation has to know, so a dispatch answers with a reason rather
   * than taking the app down with it.
   */
  isRegistered(ticketId: string): boolean;
}

const CLOSED_REASON = 'That ticket is already closed. Let it rest.';

const UNTRACKED_REASON = 'That ticket is not on the helpdesk system. It is a '
  + 'record in the estate and in nobody\'s queue, so there is no clock behind '
  + 'it and nothing here can move it.';

/**
 * The CYA rule, in the words the player reads. Exported because the Tickets
 * app disables its own toggle with the SAME sentence: a button that greys out
 * for one reason while the engine refuses for another is two rules pretending
 * to be one.
 */
export const WAITING_NEEDS_QUESTION_REASON = 'You have not actually asked '
  + 'them anything yet. Stopping their clock on a question nobody put to them '
  + 'is the kind of thing that gets read back to you at a review.';

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

        if (!policy.isRegistered(resolved.node.id)) {
          return UNTRACKED_REASON;
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

        // The CYA rule: an SLA pauses because the reporter was asked something
        // and has not answered, never because the queue looked frightening.
        if (field(resolved.node, FIELDS.questionAsked) !== true) {
          return WAITING_NEEDS_QUESTION_REASON;
        }

        return null;
      },
      apply: (context) => {
        policy.tickets.setWaiting(requireTargetId(context.target), true);
      },
    },
    {
      id: HELPDESK_ACTIONS.ticketMarkAsked,
      tier: HELPDESK_TIER,
      validate: (context) => {
        const resolved = resolveTarget(context, 'ticket');

        if (!resolved.ok) {
          return resolved.reason;
        }

        if (!policy.isRegistered(resolved.node.id)) {
          return UNTRACKED_REASON;
        }

        if (field(resolved.node, FIELDS.state) === 'resolved') {
          return 'That ticket is already closed. There is nothing left to ask '
            + 'them about.';
        }

        // Deliberately no "you already asked" refusal: asking a second
        // question is normal support, and the mark simply stays set.
        return null;
      },
      apply: (context) => {
        const target = requireTargetId(context.target);

        if (context.graph.getField(target, FIELDS.questionAsked) !== true) {
          context.graph.setField(target, FIELDS.questionAsked, true);
        }
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

        if (!policy.isRegistered(resolved.node.id)) {
          return UNTRACKED_REASON;
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
    {
      id: HELPDESK_ACTIONS.ticketAddClue,
      tier: HELPDESK_TIER,
      validate: (context) => {
        const resolved = resolveTarget(context, 'ticket');

        if (!resolved.ok) {
          return resolved.reason;
        }

        if (field(resolved.node, FIELDS.state) === 'resolved') {
          return 'That ticket is already closed. Whatever they have just '
            + 'remembered, it is history now.';
        }

        const clue = stringParam(context, CLUE_PARAM)?.trim() ?? '';

        if (clue.length === 0) {
          return 'There is nothing to write down. A note that says nothing is '
            + 'worse than no note at all.';
        }

        if (clueLines(field(resolved.node, FIELDS.clues)).includes(clue)) {
          return 'That is already written on the ticket. Asking twice gets '
            + 'the same answer, slightly colder.';
        }

        return null;
      },
      apply: (context) => {
        const target = requireTargetId(context.target);
        const clue = context.params[CLUE_PARAM];

        if (typeof clue !== 'string' || clue.trim().length === 0) {
          throw new TypeError('A clue must be a non-empty string.');
        }

        const existing = clueLines(context.graph.getField(target, FIELDS.clues));
        context.graph.setField(
          target,
          FIELDS.clues,
          [...existing, clue.trim()].join('\n'),
        );
      },
    },
  ];
}
