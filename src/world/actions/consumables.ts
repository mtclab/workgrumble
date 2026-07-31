import type { ActionData, GuardData, NodeRefData } from '../../engine-api';
import { MAX_CANS, MAX_TOLERANCE, NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { HELPDESK_TIER, not } from './helpers';
import { DAY_ACTIONS } from './ids';

/** The desk belongs to whoever is sitting at it. */
const ACTOR: NodeRefData = { ref: 'actor' };

/** Nothing on this desk happens while the shift is not on. */
const DURING_SHIFT: GuardData = {
  when: not({
    pred: 'field_eq',
    node: ACTOR,
    field: FIELDS.dayState,
    value: { const: 'shift' },
  }),
  reason: 'The desk is not on shift. Whatever this was going to solve, it '
    + 'will still be there at nine.',
};

/**
 * Money is world state before it is anything, and so is the run this can
 * belongs to: both are checked for being what they claim before either moves.
 */
const SPEND_IS_MONEY: GuardData = {
  when: not({ pred: 'param_is_whole_number', param: 'pence', value: 0 }),
  reason: 'The machine takes whole pence and gives no change, and this is not '
    + 'a number of them.',
};

const TOLERANCE_IS_A_RUN: GuardData = {
  when: not({
    pred: 'param_int_in',
    param: 'tolerance',
    values: Array.from({ length: MAX_TOLERANCE }, (_unused, index) => index + 1),
  }),
  reason: 'A can is either the first of a run or the next one. There is no '
    + 'zeroth can, and nobody is on their ninth.',
};

/**
 * The desk verbs.
 *
 * The shell decides WHEN - which minute the can was opened, which run it
 * belongs to, what the crash is worth - from pure functions over the graph and
 * the clock; the engine decides what the numbers END UP BEING. The split is the
 * same one the meters use, and for the same reason: the numbers go into the
 * dispatch log, so a replayed day arrives at the same hands and the same money.
 */
export const CONSUMABLE_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.consumableDrink,
    tier: HELPDESK_TIER,
    validate: [DURING_SHIFT, SPEND_IS_MONEY, TOLERANCE_IS_A_RUN],
    apply: [
      // The minute the can was opened comes from the engine's own clock, not
      // from a number the shell passed in: everything downstream - the buff,
      // the crash, the tolerance window - is measured from it.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkStartedAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkTolerance,
        value: { param: 'tolerance' },
      },
      // A fresh run has not paid for its crash yet. -1 is "no run has", and it
      // is set here rather than cleared so the field is always a number.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkCrashCharged,
        value: { const: NO_RUN },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.deskCans,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.deskCans,
            by: { const: 1 },
            clamp: { min: 0, max: MAX_CANS },
          },
        },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.consumableSpend,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.consumableSpend,
            by: { param: 'pence' },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  {
    id: DAY_ACTIONS.consumableCrash,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not({ pred: 'param_is_whole_number', param: 'stress_up', value: 0 }),
        reason: 'What the crash costs has to be a whole number of points at '
          + 'or above zero, and this is not one.',
      },
      {
        when: not({ pred: 'param_is_whole_number', param: 'charged_for', value: 0 }),
        reason: 'A crash is billed against the minute the can was opened, and '
          + 'this is not one.',
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
      // The watermark last: an action is all of itself or none of it, so a
      // refusal above cannot leave a crash marked as paid for.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkCrashCharged,
        value: { param: 'charged_for' },
      },
    ],
  },
  {
    id: DAY_ACTIONS.deskTidy,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'field_eq', node: ACTOR, field: FIELDS.deskCans, value: { const: 0 } },
        reason: 'The desk is already clear. There is nothing here to be '
          + 'innocent about.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.deskCans,
        value: { const: 0 },
      },
    ],
  },
];
