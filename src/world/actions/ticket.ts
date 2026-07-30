import type { ActionData, GuardData } from '../../engine-api';
import { FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const CLUE_PARAM = 'clue';

/** The clue field is one string; the ticket app splits it back into lines. */
export function clueLines(value: unknown): readonly string[] {
  return typeof value === 'string' && value.length > 0
    ? value.split('\n').filter((line) => line.length > 0)
    : [];
}

const CLOSED_REASON = 'That ticket is already closed. Let it rest.';

/**
 * A `ticket` node can exist in the graph with no record behind it - seeded
 * content, a fixture, a future spawner - and nothing here can move its clock,
 * because there is no clock. The engine knows which ids it tracks, so this is
 * a refusal rather than the crash it used to be.
 */
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

const UNTRACKED_GUARD: GuardData = {
  when: { pred: 'ticket_untracked', node: TARGET },
  reason: UNTRACKED_REASON,
};

function stateIs(state: string): GuardData['when'] {
  return fieldIs(TARGET, FIELDS.state, state);
}

export const TICKET_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      { when: stateIs('resolved'), reason: CLOSED_REASON },
      {
        when: stateIs('breached'),
        reason: 'The SLA on that ticket has already run out. Parking it on '
          + 'the user now fools nobody, least of all the report.',
      },
      {
        when: stateIs('waiting_on_user'),
        reason: 'That ticket is already parked on the user. The clock is as '
          + 'stopped as it is going to get.',
      },
      // The CYA rule: an SLA pauses because the reporter was asked something
      // and has not answered, never because the queue looked frightening.
      {
        when: not(fieldIs(TARGET, FIELDS.questionAsked, true)),
        reason: WAITING_NEEDS_QUESTION_REASON,
      },
    ],
    apply: [{ op: 'set_waiting', node: TARGET, waiting: true }],
  },
  {
    id: HELPDESK_ACTIONS.ticketMarkAsked,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      {
        when: stateIs('resolved'),
        reason: 'That ticket is already closed. There is nothing left to ask '
          + 'them about.',
      },
      // Deliberately no "you already asked" refusal: asking a second
      // question is normal support, and the mark simply stays set.
    ],
    apply: [
      {
        op: 'when',
        cond: not(fieldIs(TARGET, FIELDS.questionAsked, true)),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.questionAsked,
            value: { const: true },
          },
        ],
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketClearWaiting,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      { when: stateIs('resolved'), reason: CLOSED_REASON },
      {
        when: not(stateIs('waiting_on_user')),
        reason: 'That ticket is not waiting on anybody. The clock is already '
          + 'running, and it is running at you.',
      },
    ],
    apply: [{ op: 'set_waiting', node: TARGET, waiting: false }],
  },
  {
    id: HELPDESK_ACTIONS.ticketEscalate,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      { when: stateIs('resolved'), reason: CLOSED_REASON },
      {
        when: fieldIs(TARGET, FIELDS.escalated, true),
        reason: 'That one is already with the field team. Escalating it '
          + 'twice just puts your name on it twice.',
      },
      // Read off the ticket's own resolution rule rather than a second list
      // beside it: if setting `escalated` cannot close it, escalating is not
      // a solution, it is a signature on somebody else's problem.
      {
        when: {
          pred: 'resolution_refuses_field',
          node: TARGET,
          field: FIELDS.escalated,
          value: true,
        },
        reason: 'This is fixable from your desk, and everyone downstream '
          + 'knows it. Escalating it would be a career-limiting move.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.escalated,
        value: { const: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketAddClue,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: stateIs('resolved'),
        reason: 'That ticket is already closed. Whatever they have just '
          + 'remembered, it is history now.',
      },
      {
        when: { pred: 'param_blank', param: CLUE_PARAM },
        reason: 'There is nothing to write down. A note that says nothing is '
          + 'worse than no note at all.',
      },
      {
        when: {
          pred: 'line_in_field',
          node: TARGET,
          field: FIELDS.clues,
          value: { param_trim: CLUE_PARAM },
        },
        reason: 'That is already written on the ticket. Asking twice gets '
          + 'the same answer, slightly colder.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.clues,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.clues,
            value: { param_trim: CLUE_PARAM },
          },
        },
      },
    ],
  },
];
