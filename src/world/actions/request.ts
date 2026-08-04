import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import {
  REQUEST_ANSWER_REPUTATION,
  REQUEST_DEFLECT_REPUTATION,
} from '../requests';
import { HELPDESK_TIER, not } from './helpers';
import { REQUEST_ACTIONS } from './ids';

/**
 * The three answers to the same question arriving everywhere (0.5.0 slice 2).
 *
 * Convert, answer and deflect all RESOLVE a linked request, and resolving it
 * quietens every copy of it - the dedupe, enforced in the world so all three
 * surfaces read one answer. They differ only in the social effect: converting
 * moves no meter (its credit is the ticket it mints, which the driver raises
 * after this succeeds), answering pays a point of gratitude, and deflecting
 * costs a little goodwill. Every one of them refuses a request already on the
 * `request_resolved` set, which is what makes answering it in three places
 * three lots of wasted minutes for one credit rather than three answers.
 *
 * The records are the interruption family's exactly: a bare `id` on the SET the
 * guard reads, and an `id@kind` LINE on the ledger the surfaces read, the line
 * built by the driver in the minute the button was pressed so a replay writes
 * the identical string.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/** The request, named once, so the resolution can be read back. */
const ID_PARAM = 'id';
/** The whole `id@kind` line the ledger takes, built by the driver. */
const LINE_PARAM = 'line';

const ON_SHIFT: PredData = {
  pred: 'field_eq',
  node: ACTOR,
  field: FIELDS.dayState,
  value: { const: 'shift' },
};

/** Whether this request has already been dealt with, on the bare-id set. */
const ALREADY_RESOLVED: PredData = {
  pred: 'line_in_field',
  node: ACTOR,
  field: FIELDS.requestResolved,
  value: { param: ID_PARAM },
};

export const REQUEST_OFF_SHIFT_REASON = 'Nobody is answering anybody outside '
  + 'a shift. A request has to be dealt with at the desk it arrived on, while '
  + 'somebody is at it.';

export const REQUEST_ALREADY_RESOLVED_REASON = 'That one is already dealt with. '
  + 'It came in on more than one channel, you answered it on one of them, and '
  + 'the other copies are the same request wearing a different coat - which is '
  + 'the whole reason not to answer it again.';

/** The guards every one of the three answers shares. */
const RESOLVE_GUARDS: GuardData[] = [
  {
    when: not(ON_SHIFT),
    reason: REQUEST_OFF_SHIFT_REASON,
  },
  {
    when: { pred: 'param_blank', param: ID_PARAM },
    reason: 'A request was resolved and nobody wrote down which. A resolution '
      + 'with no request on it cannot quieten the copies, which is the only '
      + 'thing resolving it is for.',
  },
  {
    when: { pred: 'param_blank', param: LINE_PARAM },
    reason: 'A resolution has to say which way it went. A record with no answer '
      + 'in it cannot tell a converted request from an answered one.',
  },
  {
    when: ALREADY_RESOLVED,
    reason: REQUEST_ALREADY_RESOLVED_REASON,
  },
];

/** Writing the bare id onto the set the guard refuses a second answer against. */
const MARK_RESOLVED: OpData = {
  op: 'set_field',
  node: ACTOR,
  field: FIELDS.requestResolved,
  value: {
    append_line: {
      node: ACTOR,
      field: FIELDS.requestResolved,
      value: { param: ID_PARAM },
    },
  },
};

/** And the `id@kind` line onto the ledger the surfaces read the answer off. */
const RECORD_ANSWER: OpData = {
  op: 'set_field',
  node: ACTOR,
  field: FIELDS.requestResolvedAs,
  value: {
    append_line: {
      node: ACTOR,
      field: FIELDS.requestResolvedAs,
      value: { param: LINE_PARAM },
    },
  },
};

/** A reputation move, clamped to the meter, or nothing for convert. */
function reputation(by: number): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field: FIELDS.reputation,
    value: {
      add: {
        node: ACTOR,
        field: FIELDS.reputation,
        by: { const: by },
        clamp: { min: METER_FLOOR, max: METER_CEILING },
      },
    },
  };
}

export const REQUEST_ACTION_DATA: readonly ActionData[] = [
  // Convert: the correct play. It records the resolution and moves no meter -
  // the credit is the ticket the driver mints off the back of this, which
  // counts on Friday the way every closed ticket does. The human is kept happy
  // AND the work is visible, which is the whole of why it is the right answer.
  {
    id: REQUEST_ACTIONS.convert,
    tier: HELPDESK_TIER,
    validate: RESOLVE_GUARDS,
    apply: [MARK_RESOLVED, RECORD_ANSWER],
  },
  // Answer: the DM bypass, generalised. The human is grateful - a point of
  // reputation - and there is no ticket, so nothing about this reaches the
  // review. Grateful, and invisible on Friday.
  {
    id: REQUEST_ACTIONS.answer,
    tier: HELPDESK_TIER,
    validate: RESOLVE_GUARDS,
    apply: [MARK_RESOLVED, RECORD_ANSWER, reputation(REQUEST_ANSWER_REPUTATION)],
  },
  // Deflect: send them to the form. It keeps your time and costs a little
  // goodwill, and it is a legitimate answer rather than a punished one.
  {
    id: REQUEST_ACTIONS.deflect,
    tier: HELPDESK_TIER,
    validate: RESOLVE_GUARDS,
    apply: [
      MARK_RESOLVED,
      RECORD_ANSWER,
      reputation(REQUEST_DEFLECT_REPUTATION),
    ],
  },
];
