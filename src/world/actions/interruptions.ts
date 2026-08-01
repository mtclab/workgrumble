import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_FLOOR, REFOCUS_TICKS } from '../meters';
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

export const NOT_DECLINABLE_REASON = 'This is not one you can wave off. Some '
  + 'of them you can; the world says which, and it says no about this one.';

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
function startRefocus(): OpData[] {
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
          by: { const: REFOCUS_TICKS },
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
      // About something else entirely: the twenty-three minutes.
      {
        op: 'when',
        cond: { pred: 'target_missing' },
        ops: startRefocus(),
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
];
