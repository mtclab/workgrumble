import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import {
  METER_CEILING,
  METER_FLOOR,
  REFOCUS_TICKS,
  RING_OUT_REFOCUS_TICKS,
} from '../meters';
import { HELPDESK_TIER, not, TARGET } from './helpers';
import { DAY_ACTIONS } from './ids';

/**
 * The choice grammar: accept, defer, decline, and the reasons the world gives
 * back when one of them is not available.
 *
 * All three are aimed at whoever dispatched them, because what an interruption
 * costs is paid by the person it happened to. The interruption itself has no
 * node and no state of its own - where it is in the day is a function of the
 * seeded schedule, which is exactly why none of it has to be saved. What DOES
 * have to be saved is what the player decided, and that is three lists of ids
 * on the player node, appended to here and read back by the guards.
 *
 * The lists are ids and nothing else on purpose. `line_in_field` matches a
 * whole line, so a record carrying the minute and the verb could only be
 * checked by a caller that already knew the minute - a caller marking its own
 * homework. An id on its own is a question the world can answer with nothing
 * but the id, which is what makes "you have already dealt with this" and "you
 * have already pushed this once" refusals the ENGINE enforces.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

const ID_PARAM = 'id';
const TOUCHES_PARAM = 'touches';
const DECLINABLE_PARAM = 'declinable';
/** Whether the thing that rang out was about the ticket in hand. */
const BENIGN_PARAM = 'benign';

/** Which interruption this is, named once, and never blank. */
const NAMED: GuardData[] = [
  {
    when: { pred: 'param_blank', param: ID_PARAM },
    reason: 'Something interrupted you and nobody wrote down what. A choice '
      + 'about an interruption nobody can name is a choice that cannot be '
      + 'read back, which is the same as not having made one.',
  },
];

function listed(field: string): PredData {
  return {
    pred: 'line_in_field',
    node: ACTOR,
    field,
    value: { param: ID_PARAM },
  };
}

/** Appending the id to one of the three lists, which IS the record. */
function record(field: string): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field,
    value: {
      append_line: {
        node: ACTOR,
        field,
        value: { param: ID_PARAM },
      },
    },
  };
}

/**
 * Already answered or already refused. Deferring is deliberately NOT settled -
 * a deferred interruption is one that is coming back - so it has its own
 * refusal with its own sentence.
 */
const SETTLED: PredData = {
  pred: 'any',
  of: [
    listed(FIELDS.interruptionAnswered),
    listed(FIELDS.interruptionDeclined),
  ],
};

export const ALREADY_SETTLED_REASON = 'That one is already dealt with. It '
  + 'happened, you answered it one way or the other, and the world has it '
  + 'written down - there is nothing left to decide about it.';

export const ALREADY_DEFERRED_REASON = 'You have already asked them to come '
  + 'back, and this IS them coming back. The second time is the conversation.';

export const NOT_DECLINABLE_REASON = 'Attendance is expected. That is the '
  + 'phrase on the invitation and it is doing a lot of work: nobody would stop '
  + 'you, and everybody would notice. You are four days into a probation, you '
  + 'are the newest person in the building, and the newest person does not '
  + 'skip the sync - or catch up on it afterwards, which is the same sentence '
  + 'said more politely. Some interruptions you can wave off. This is the one '
  + 'the hierarchy is made of.';

const SETTLED_GUARD: GuardData = { when: SETTLED, reason: ALREADY_SETTLED_REASON };

/**
 * The debuff, written as two mutations rather than one.
 *
 * The op language adds to a field it can read and has no "now plus a constant"
 * form, which is the right restriction: an expiry the CALLER computed would be
 * a number the world took on trust, and this one is the world's own clock plus
 * the world's own constant. So the minute is written first and the window is
 * added to it, both inside the same action, which is one transaction - nothing
 * outside ever sees the intermediate value.
 */
function startRefocus(ticks: number): OpData[] {
  return [
    {
      op: 'set_field',
      node: ACTOR,
      field: FIELDS.refocusUntil,
      value: { now: true },
    },
    {
      op: 'set_field',
      node: ACTOR,
      field: FIELDS.refocusUntil,
      value: {
        add: {
          node: ACTOR,
          field: FIELDS.refocusUntil,
          by: { const: ticks },
          clamp: { min: METER_FLOOR, max: Number.MAX_SAFE_INTEGER },
        },
      },
    },
  ];
}

/**
 * The three verbs.
 *
 * `accept` is the only one that carries the cost model, and it carries it in
 * its TARGET. A benign interruption is one about the ticket in hand, so the
 * ticket is what the action is aimed at and the touch goes on it - a call can
 * be how a ticket moves, and the evidence of that belongs on the ticket the
 * same as any other touch. A malignant one is aimed at nothing, and what it
 * leaves behind is the refocus window.
 *
 * Neither branch is a parameter saying "this was benign", because a boolean
 * like that is a claim; a target is a thing the world can look at, refuse for
 * being the wrong kind, and write to.
 *
 * What `accept` does NOT do is start the refocus window. That is
 * `interruption.refocus`, dispatched when the screen comes back, because the
 * twenty-three minutes are measured from the minute the player is handed their
 * desk rather than from the minute they were taken off it - and a call that
 * started its own recovery window while the conversation was still running
 * spent a third of that window recovering from something that had not finished
 * happening.
 */
export const INTERRUPTION_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.interruptionAccept,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      SETTLED_GUARD,
      // A target at all is the claim that this was about the work in hand, so
      // the world checks the claim as far as it can: it has to be a ticket,
      // and it has to still exist.
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'target_missing' }),
            { pred: 'node_missing', node: TARGET },
          ],
        },
        reason: 'That call was supposedly about "{target.id}", and there is no '
          + 'such ticket. A touch recorded against nothing is worse than no '
          + 'record at all.',
      },
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'target_missing' }),
            not({ pred: 'node_missing', node: TARGET }),
            not({ pred: 'kind_is', node: TARGET, kind: 'ticket' }),
          ],
        },
        reason: '"{target.label}" is {target.kind_label}. An interruption is '
          + 'about a ticket or it is about nothing, and being about nothing is '
          + 'what it costs you.',
      },
      // The whole bounded field arrives already built, from the one place that
      // knows what a ticket's evidence looks like - the same contract
      // `ticket.record_touch` keeps, and for the same reason: a replay writes
      // the identical string rather than rebuilding it against a clock nobody
      // saved.
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'target_missing' }),
            { pred: 'param_string_missing', param: TOUCHES_PARAM },
          ],
        },
        reason: 'A call that moved a ticket has to say what it moved. The '
          + 'record of it arrived empty.',
      },
    ],
    apply: [
      record(FIELDS.interruptionAnswered),
      // About the work in hand: no focus cost, and the ticket learns that
      // somebody was on the phone about it.
      {
        op: 'when',
        cond: not({ pred: 'target_missing' }),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.touchLog,
            value: { param: TOUCHES_PARAM },
          },
        ],
      },
    ],
  },
  {
    id: DAY_ACTIONS.interruptionDefer,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      SETTLED_GUARD,
      {
        when: listed(FIELDS.interruptionDeferred),
        reason: ALREADY_DEFERRED_REASON,
      },
      // And the same flag decline reads, for the same reason it reads it.
      // An interruption you cannot wave off is not one you can push twenty
      // minutes out either: "I will catch up on the sync afterwards" is the
      // same sentence as "I will skip the sync" said more politely, and the
      // world answers both with the reason a junior does not.
      {
        when: not({ pred: 'param_int_in', param: DECLINABLE_PARAM, values: [1] }),
        reason: NOT_DECLINABLE_REASON,
      },
    ],
    // Nothing but the record. Deferring costs no focus - you did not have the
    // conversation - and WHEN it comes back is the schedule's business
    // (`deferredArrival`), which is a function of the entry rather than a
    // timer anybody has to save.
    apply: [record(FIELDS.interruptionDeferred)],
  },
  {
    id: DAY_ACTIONS.interruptionDecline,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      SETTLED_GUARD,
      // The second arrival is not declinable, and the world knows it is the
      // second arrival because the first one is in the list.
      {
        when: listed(FIELDS.interruptionDeferred),
        reason: ALREADY_DEFERRED_REASON,
      },
      // And some of them were never declinable. A junior does not skip the
      // sync, and the refusal saying so is the point rather than a hurdle.
      {
        when: not({ pred: 'param_int_in', param: DECLINABLE_PARAM, values: [1] }),
        reason: NOT_DECLINABLE_REASON,
      },
    ],
    apply: [record(FIELDS.interruptionDeclined)],
  },
  /**
   * The screen, handed back, and the window that starts from there.
   *
   * Guarded on the id being in the ANSWERED list, because that is what this is
   * the far side of: there is no coming back from a conversation nobody had,
   * and a caller that could write the debuff without one would be a caller
   * that could hand the player twenty-three bad minutes for nothing.
   */
  {
    id: DAY_ACTIONS.interruptionRefocus,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      {
        when: not(listed(FIELDS.interruptionAnswered)),
        reason: 'There is nothing to come back from. That one was never '
          + 'answered, and a window for finding your place again after a '
          + 'conversation that did not happen is a cost with no cause.',
      },
    ],
    apply: startRefocus(REFOCUS_TICKS),
  },
  /**
   * The phone that rang out.
   *
   * Two things, and the second is the one that stops "ignore it" from being
   * the correct answer to everything. The RECORD is the fourth list - not a
   * decision, because nobody decided, but evidence that the desk did not pick
   * up. The shorter window is the ringing itself: attention residue is about
   * the interruption rather than about the conversation, so a phone nobody
   * answered still pulled the thread, and it pulled it for less time because
   * there was no conversation to come back from.
   *
   * The window is skipped entirely when it was about the work in hand, which
   * is the same rule `accept` keeps: a colleague ringing about the ticket on
   * your screen is not the thing that costs you your place.
   */
  {
    id: DAY_ACTIONS.interruptionMissed,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      SETTLED_GUARD,
      {
        when: listed(FIELDS.interruptionMissed),
        reason: 'That one has already rung out once. A phone cannot go '
          + 'unanswered twice in the same minute it went unanswered in.',
      },
      {
        when: not({ pred: 'param_int_in', param: BENIGN_PARAM, values: [0, 1] }),
        reason: 'Whether it was about the work in hand is a yes or a no, and '
          + 'this is neither.',
      },
    ],
    apply: [
      record(FIELDS.interruptionMissed),
      {
        op: 'when',
        cond: not({ pred: 'param_int_in', param: BENIGN_PARAM, values: [1] }),
        ops: startRefocus(RING_OUT_REFOCUS_TICKS),
      },
    ],
  },
  /**
   * The arrival itself, which is charged before anybody has decided anything.
   *
   * The stress is a parameter rather than a constant in here for the same
   * reason every other meter move is: the shell reads what KIND of arrival it
   * was - severity, and whether it is about the work in hand - and the world
   * decides what a number ends up being and where it stops. A replay reads the
   * figure out of the dispatch log instead of recomputing it against a
   * schedule it would have to rebuild.
   *
   * It is deliberately not guarded on the id being unsettled. An arrival is
   * not a decision: the same interruption can arrive twice - once, and then
   * again twenty minutes later because you asked it to - and both arrivals are
   * genuinely interruptions. What the caller must not do is dispatch it twice
   * for one arrival, and the caller cannot, because it is dispatched from the
   * minute the schedule says the entry starts on.
   */
  {
    id: DAY_ACTIONS.interruptionArrived,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      {
        when: not({ pred: 'param_is_whole_number', param: 'stress_up', value: 0 }),
        reason: 'What being taken off the work costs has to be a whole number '
          + 'of points at or above zero, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.stress,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.stress,
            by: { param: 'stress_up' },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
  /**
   * The room emptying, which is the minute the recap mail is stamped from.
   *
   * One field, written once, by the day loop, at the end of a block nobody
   * chose to be in. It is separate from `accept` because they happen half an
   * hour apart: the sync is answered at half past ten because a junior cannot
   * skip it, and the mail about it exists at eleven.
   */
  {
    id: DAY_ACTIONS.meetingRecap,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not({
          pred: 'field_missing',
          node: ACTOR,
          field: FIELDS.meetingRecapAt,
        }),
        reason: 'That meeting has already been minuted. A recap written twice '
          + 'is a thread that arrives at two different times.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.meetingRecapAt,
        value: { now: true },
      },
    ],
  },
];
