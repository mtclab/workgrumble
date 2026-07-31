import type { ActionData, GuardData, OpData, PredData } from '../../engine-api';
import { FIELDS } from '../fields';
import {
  PRIORITIES,
  PRIORITY_MATRIX,
  type Priority,
  SLA_TARGETS,
} from '../priority';
import { HANDOFF_BOUNCE } from '../tickets/handoff';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  param,
  paramNodeGuards,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const NOTE_PARAM = 'note';
const COMMENT_PARAM = 'comment';
const ARTICLE_PARAM = 'article';
const PARENT_PARAM = 'parent';
const REPORTED_PARAM = 'reported';
const TRIED_PARAM = 'tried';
const TOUCHES_PARAM = 'touches';

/** A newline-joined field is one string; the apps split it back into lines. */
export function fieldLines(value: unknown): readonly string[] {
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
 *
 * What counts as evidence changed in M3 and the sentence did not: it used to
 * be a flag some chat option set, and it is now the customer-visible comment
 * stream - a question the reporter can actually see having been asked.
 */
export const WAITING_NEEDS_QUESTION_REASON = 'You have not actually asked '
  + 'them anything yet. Stopping their clock on a question nobody put to them '
  + 'is the kind of thing that gets read back to you at a review.';

/**
 * Why triage is refused, in the words the player reads.
 *
 * Exported for the same reason the CYA sentence is: the Tickets app greys its
 * own button out with these, and a button that refuses for one reason while
 * the engine refuses for another is two rules pretending to be one.
 */
export const CLASSIFY_CLOSED_REASON = 'That ticket is closed. Triaging it now '
  + 'is filing a weather report for last Tuesday.';

export const CLASSIFY_ON_HOLD_REASON = 'It is parked, and re-cutting its '
  + 'deadline now would move a clock that is supposed to be stopped. Take it '
  + 'back off hold first, then triage it - the time it has already spent '
  + 'waiting comes with it.';

/**
 * And a missed deadline is a missed deadline.
 *
 * Triaging a breached ticket used to move its deadline into the future while
 * the breach stayed latched, which reads as "Overdue 0m" and is the exact
 * shape of a number somebody has been at. The breach is history; the way to
 * make it stop being true is to fix the thing.
 */
export const CLASSIFY_BREACHED_REASON = 'That one has already blown its SLA. '
  + 'Re-cutting the deadline now would move a line it has already crossed, '
  + 'which is the sort of tidying-up that gets read back to you at a review.';

/**
 * Why a closed ticket takes no article, in the words the player reads.
 *
 * Exported because the Tickets app greys its own picker out with the same
 * sentence: two rules pretending to be one is the bug this codebase keeps
 * refusing to ship.
 */
export const LINK_CLOSED_REASON = 'That ticket is closed. An article linked '
  + 'afterwards is a tidy record of a decision nobody made at the time - link '
  + 'it while it is still work, which is also when it is true.';

/**
 * Why a ticket cannot be somebody's duplicate, in the words the player reads.
 *
 * This refusal is the whole safety rail on bulk-close: a queue that could
 * attach anything to anything would be a queue where the fastest play is to
 * fix one ticket and claim the other nineteen. It arrives per ticket, from the
 * engine, because whether a ticket is a duplicate is a fact about THAT ticket
 * and the app attaches several at once - so the button stays live and the
 * sentence comes back about the one it was wrong about. Exported so the gate
 * that proves the rail has teeth can name it.
 */
export const LINK_PARENT_REFUSED_REASON = 'That ticket is not a duplicate of '
  + 'anything. Its own fault is still its own fault, and closing something '
  + 'else would close it on paper while the reporter sits there.';

const LINK_PARENT_CLOSED_REASON = 'That ticket is already closed. Attaching '
  + 'it to a parent now is filing, not support.';

const UNTRACKED_GUARD: GuardData = {
  when: { pred: 'ticket_untracked', node: TARGET },
  reason: UNTRACKED_REASON,
};

function stateIs(state: string): PredData {
  return fieldIs(TARGET, FIELDS.state, state);
}

/** Whether a newline-joined stream on the ticket has anything in it. */
function streamEmpty(field: string): PredData {
  return {
    pred: 'any',
    of: [
      { pred: 'field_missing', node: TARGET, field },
      fieldIs(TARGET, field, ''),
    ],
  };
}

/** Appending one line to a newline-joined field, guards and all. */
function appendStream(
  id: string,
  field: string,
  paramName: string,
  copy: Readonly<{ closed: string; blank: string; repeat: string }>,
  extra: readonly OpData[] = [],
): ActionData {
  return {
    id,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      { when: stateIs('resolved'), reason: copy.closed },
      { when: { pred: 'param_blank', param: paramName }, reason: copy.blank },
      {
        when: {
          pred: 'line_in_field',
          node: TARGET,
          field,
          value: { param_trim: paramName },
        },
        reason: copy.repeat,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field,
        value: {
          append_line: {
            node: TARGET,
            field,
            value: { param_trim: paramName },
          },
        },
      },
      ...extra,
    ],
  };
}

/**
 * The matrix as a refusal.
 *
 * The priority arriving as a parameter would otherwise be a third opinion
 * beside impact and urgency - a caller could send "low, low, P1" and the world
 * would keep it. This says the whole 3x3 table in the op language: the triple
 * has to BE one of the nine cells, or the classification does not happen. The
 * table is the same one the app reads, so there is one matrix in the codebase
 * and the engine is the thing that enforces it.
 */
const MATRIX_GUARD: GuardData = {
  when: not({
    pred: 'any',
    of: PRIORITY_MATRIX.map((cell) => ({
      pred: 'all' as const,
      of: [
        { pred: 'param_int_in' as const, param: 'impact', values: [cell.impact] },
        { pred: 'param_int_in' as const, param: 'urgency', values: [cell.urgency] },
        {
          pred: 'param_int_in' as const,
          param: 'priority',
          values: [cell.priority],
        },
      ],
    })),
  }),
  reason: 'That is not a triage anybody could arrive at. Impact and urgency '
    + 'are low, medium or high, and the priority is whatever the matrix makes '
    + 'of them - it is not a third thing you get to pick.',
};

/**
 * Re-cutting the resolution deadline to the priority that was just assigned.
 *
 * One op per priority, guarded on the priority the ops above have already
 * written, because the deadline has to come from the TABLE rather than from a
 * number the caller sent along with it. Assigning a P1 to something that has
 * been sitting all morning therefore leaves it with very little of its hour
 * left, which is the consequence of mis-triage made mechanical rather than
 * narrated.
 *
 * The sum is built in a scratch field and the real deadline is written ONCE,
 * at the end. Adding the terms straight onto `sla_deadline` put the ticket on
 * a partial sum for one mutation - the arrival plus the new target, before the
 * pause and the overnight hours went back on - and the engine breaches on
 * whatever the deadline says the moment it says it. A ticket carried over from
 * yesterday was therefore breached BY BEING TRIAGED, and a breach latches: the
 * player never saw a deadline that had passed, only a red badge that arrived
 * with the classification.
 */
function deadlineOps(): readonly OpData[] {
  return PRIORITIES.map((priority: Priority) => ({
    op: 'when' as const,
    cond: fieldIs(TARGET, FIELDS.priority, priority),
    ops: [
      {
        op: 'set_field' as const,
        node: TARGET,
        field: FIELDS.slaRecut,
        value: {
          add: {
            node: TARGET,
            field: FIELDS.spawnedAt,
            by: { const: SLA_TARGETS[priority].resolution },
            // A deadline is a tick, and the engine holds ticks in the range
            // JavaScript can read back exactly. Nothing here can get near it;
            // the clamp is mandatory, and the honest bound for a tick is the
            // tick range.
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
      // And every minute the ticket was already excused goes back on top: the
      // pause it spent on somebody else, and the hours the office was dark.
      // The target is measured from the minute the ticket ARRIVED, and neither
      // of those is a minute anybody was allowed to work in. Without this,
      // following the app's own instruction - clear the hold, then triage -
      // cost the player every minute of it, and a ticket inherited on Monday
      // and triaged on Tuesday breached the moment it was classified.
      ...[FIELDS.heldTicks, FIELDS.offHoursTicks].map((counter) => ({
        op: 'when' as const,
        cond: {
          pred: 'field_is_number' as const,
          node: TARGET,
          field: counter,
        },
        ops: [
          {
            op: 'set_field' as const,
            node: TARGET,
            field: FIELDS.slaRecut,
            value: {
              add: {
                node: TARGET,
                field: FIELDS.slaRecut,
                by: { field: { node: TARGET, field: counter } },
                clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
              },
            },
          },
        ],
      })),
      // The one write anybody sees, and the only one the breach check reads.
      {
        op: 'set_field' as const,
        node: TARGET,
        field: FIELDS.slaDeadline,
        value: { field: { node: TARGET, field: FIELDS.slaRecut } },
      },
      { op: 'clear_field' as const, node: TARGET, field: FIELDS.slaRecut },
    ],
  }));
}

/** The handoff L2 will actually keep: a symptom AND something tried. */
const COMPLETE_HANDOFF: PredData = {
  pred: 'all',
  of: [
    not({ pred: 'param_blank', param: REPORTED_PARAM }),
    not({ pred: 'param_blank', param: TRIED_PARAM }),
  ],
};

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
      // and has not answered, never because the queue looked frightening. The
      // evidence is the customer-visible stream, which is the only place a
      // question the reporter could actually have seen can be.
      {
        when: streamEmpty(FIELDS.customerVisible),
        reason: WAITING_NEEDS_QUESTION_REASON,
      },
    ],
    apply: [
      { op: 'set_waiting', node: TARGET, waiting: true },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.holdReason,
        value: { const: 'awaiting_user' },
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
    apply: [
      { op: 'set_waiting', node: TARGET, waiting: false },
      { op: 'clear_field', node: TARGET, field: FIELDS.holdReason },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketClassify,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      { when: stateIs('resolved'), reason: CLASSIFY_CLOSED_REASON },
      // Classifying re-cuts the resolution deadline, and a stopped clock is
      // not a clock anybody may re-cut: the order is take it off hold, then
      // triage it. The pause itself is not lost by waiting - `held_ticks` goes
      // back on top of whatever the new target is.
      { when: stateIs('waiting_on_user'), reason: CLASSIFY_ON_HOLD_REASON },
      { when: stateIs('breached'), reason: CLASSIFY_BREACHED_REASON },
      MATRIX_GUARD,
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.impact,
        value: { param: 'impact' },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.urgency,
        value: { param: 'urgency' },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.priority,
        value: { param: 'priority' },
      },
      ...deadlineOps(),
    ],
  },
  appendStream(
    HELPDESK_ACTIONS.ticketAddWorknote,
    FIELDS.worknotes,
    NOTE_PARAM,
    {
      closed: 'That ticket is already closed. Whatever you have just worked '
        + 'out, it is history now.',
      blank: 'There is nothing to write down. A work note that says nothing '
        + 'is worse than no note at all.',
      repeat: 'That is already on the ticket. Writing it twice does not make '
        + 'it twice as true.',
    },
  ),
  appendStream(
    HELPDESK_ACTIONS.ticketAddComment,
    FIELDS.customerVisible,
    COMMENT_PARAM,
    {
      closed: 'That ticket is closed. Anything you send now arrives at '
        + 'somebody who has stopped thinking about it.',
      blank: 'An empty message is not a question. They will read it as one '
        + 'anyway, which is worse.',
      repeat: 'You have already put that to them, word for word. Asking '
        + 'again gets the same answer, slightly colder.',
    },
    // First contact with the reporter stops the response clock, and only the
    // first: the second question is not a faster answer to the first.
    [
      {
        op: 'when',
        cond: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.respondedAt,
        }),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.respondedAt,
            value: { now: true },
          },
        ],
      },
    ],
  ),
  {
    id: HELPDESK_ACTIONS.ticketRecordResponse,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      // There is deliberately no guard on the ticket being closed. The one
      // caller stamps this in the same minute as the action it is recording,
      // and the commonest first touch there is - the fix - closes the ticket
      // as it lands. Refusing it left a ticket that was answered LATE with no
      // timestamp at all, and a missing timestamp reads as "in time".
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.respondedAt,
        },
        reason: 'That ticket has already been touched once. A response clock '
          + 'stops the first time, not the best time.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.respondedAt,
        value: { now: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketRecordTouch,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      // The whole field arrives, already bounded, from the one place that
      // knows what the ticket's evidence looks like. The engine's job here is
      // to insist it IS a field: a touch record that arrives as a number is a
      // caller bug, and a ticket carrying one is evidence nobody can read.
      {
        when: { pred: 'param_string_missing', param: TOUCHES_PARAM },
        reason: 'A record of what was tried is a list of things that were '
          + 'tried, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.touchLog,
        value: { param: TOUCHES_PARAM },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketLinkArticle,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      // A closed ticket is a record, and a record is not where the reading
      // goes: link it while it is still work, which is also the only time the
      // link is true about how it was solved.
      { when: stateIs('resolved'), reason: LINK_CLOSED_REASON },
      {
        when: { pred: 'param_blank', param: ARTICLE_PARAM },
        reason: 'No article arrived with that link. An empty reference on a '
          + 'ticket is worse than none, because a report counts it.',
      },
      {
        when: { pred: 'param_blank', param: NOTE_PARAM },
        reason: 'A link with nothing written beside it tells the next person '
          + 'which article, and not why.',
      },
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.kbRef,
          value: { param_trim: ARTICLE_PARAM },
        },
        reason: `"{v:${ARTICLE_PARAM}}" is already the article on this ticket. `
          + 'Linking it twice does not make it twice as relevant.',
      },
      {
        when: {
          pred: 'line_in_field',
          node: TARGET,
          field: FIELDS.worknotes,
          value: { param_trim: NOTE_PARAM },
        },
        reason: 'That note is already on the ticket, word for word.',
      },
    ],
    // Two writes, one act: the reference a report reads, and the sentence the
    // next human reads. Splitting them across two actions would let a ticket
    // carry a link nobody explained, or an explanation of a link that is not
    // there.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.kbRef,
        value: { param_trim: ARTICLE_PARAM },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: { param_trim: NOTE_PARAM },
          },
        },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketLinkToParent,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      { when: stateIs('resolved'), reason: LINK_PARENT_CLOSED_REASON },
      ...paramNodeGuards(PARENT_PARAM, 'ticket'),
      {
        when: { pred: 'ticket_untracked', node: param(PARENT_PARAM) },
        reason: `"{p:${PARENT_PARAM}.label}" is a record in the estate and in `
          + 'nobody\'s queue. A parent has to be a ticket somebody is working.',
      },
      // The rule is the ticket's own, read by the engine: a ticket that was
      // not written as somebody's duplicate cannot be closed by closing
      // something else, however much the queue would like it to be.
      {
        when: {
          pred: 'resolution_refuses_field',
          node: TARGET,
          field: FIELDS.parentResolved,
          value: true,
        },
        reason: LINK_PARENT_REFUSED_REASON,
      },
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.parent,
          value: { param_trim: PARENT_PARAM },
        },
        reason: `That ticket is already attached to "{p:${PARENT_PARAM}.label}".`,
      },
      {
        when: { pred: 'param_blank', param: NOTE_PARAM },
        reason: 'A link with nothing written beside it is a decision the next '
          + 'person has to guess at.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.parent,
        value: { param_trim: PARENT_PARAM },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: { param_trim: NOTE_PARAM },
          },
        },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketResolveWithParent,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      { when: stateIs('resolved'), reason: CLOSED_REASON },
      ...paramNodeGuards(PARENT_PARAM, 'ticket'),
      {
        when: not({
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.parent,
          value: { param_trim: PARENT_PARAM },
        }),
        reason: `"{p:${PARENT_PARAM}.label}" is not this ticket's parent. A `
          + 'ticket closes with the incident it was attached to, and with no '
          + 'other.',
      },
      // The parent's own state, read off the parent. A child closed while its
      // parent is still open would be a ticket closed because somebody said
      // so, which is the one thing this game does not have.
      {
        when: not(fieldIs(param(PARENT_PARAM), FIELDS.state, 'resolved')),
        reason: `"{p:${PARENT_PARAM}.label}" has not been fixed yet, so there `
          + 'is nothing to tell anybody and nothing to close.',
      },
      {
        when: fieldIs(TARGET, FIELDS.parentResolved, true),
        reason: 'That one has already been closed with its parent. Telling '
          + 'them twice is how a flood becomes a complaint.',
      },
      {
        when: { pred: 'param_blank', param: COMMENT_PARAM },
        reason: 'A ticket closed without a word to the reporter is how a '
          + 'service desk earns the reputation it has.',
      },
    ],
    // The order is load-bearing: the reporter is told FIRST, and the marker
    // that closes the ticket is written last. Marking first would resolve the
    // ticket, and a resolved ticket refuses comments - which would close forty
    // people's tickets in silence.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.customerVisible,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.customerVisible,
            value: { param_trim: COMMENT_PARAM },
          },
        },
      },
      {
        op: 'when',
        cond: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.respondedAt,
        }),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.respondedAt,
            value: { now: true },
          },
        ],
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.parentResolved,
        value: { const: true },
      },
    ],
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
      // Blank halves are allowed - that is what a thin handoff IS, and it
      // bounces rather than being refused. Halves that are not there at all
      // are a form nobody filled in, which is a caller bug.
      {
        when: {
          pred: 'any',
          of: [
            { pred: 'param_absent', param: REPORTED_PARAM },
            { pred: 'param_absent', param: TRIED_PARAM },
          ],
        },
        reason: 'The handoff form did not arrive. Second line take tickets on '
          + 'a form, not on trust.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.handoffReported,
        value: { param_trim: REPORTED_PARAM },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.handoffTried,
        value: { param_trim: TRIED_PARAM },
      },
      // A complete handoff goes. Whether it also CLOSES the ticket is the
      // ticket's own resolution rule talking, and if it does not close, the
      // ticket is now waiting on somebody else - which is a hold with a
      // different reason on it, not the reporter's fault.
      {
        op: 'when',
        cond: COMPLETE_HANDOFF,
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.escalated,
            value: { const: true },
          },
          {
            op: 'when',
            cond: not(stateIs('resolved')),
            ops: [
              { op: 'set_waiting', node: TARGET, waiting: true },
              {
                op: 'set_field',
                node: TARGET,
                field: FIELDS.holdReason,
                value: { const: 'awaiting_vendor' },
              },
            ],
          },
        ],
      },
      // A thin one is accepted, sent, and marked for the return journey.
      {
        op: 'when',
        cond: not(COMPLETE_HANDOFF),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.handoffBouncedAt,
            value: { now: true },
          },
        ],
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.ticketBounceHandoff,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      UNTRACKED_GUARD,
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.handoffBouncedAt,
        }),
        reason: 'Nothing has bounced on that ticket. Second line have not '
          + 'seen it, which is its own kind of news.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.handoffSettledAt,
        },
        reason: 'That bounce has already landed, and you have already paid '
          + 'for it. Once is the arrangement.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.handoffSettledAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: { const: HANDOFF_BOUNCE.worknote },
          },
        },
      },
      {
        op: 'set_field',
        node: { ref: 'actor' },
        field: FIELDS.reputation,
        value: {
          sub: {
            node: { ref: 'actor' },
            field: FIELDS.reputation,
            by: { const: HANDOFF_BOUNCE.reputationCost },
            clamp: { min: 0, max: 100 },
          },
        },
      },
    ],
  },
];
