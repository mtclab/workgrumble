import type { ActionData, NodeRefData } from '../../engine-api';
import { NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { HELPDESK_TIER, not } from './helpers';
import { DAY_ACTIONS } from './ids';

/**
 * The day is the actor's own: whoever is dispatching is the one whose shift
 * this is. That keeps the day verbs free of any particular person's node id,
 * which is the seam a second employable body would need later.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

function stateIs(state: string): {
  pred: 'field_eq';
  node: NodeRefData;
  field: string;
  value: { const: string };
} {
  return {
    pred: 'field_eq',
    node: ACTOR,
    field: FIELDS.dayState,
    value: { const: state },
  };
}

/**
 * The three moves a day makes, as verbs rather than as shell state.
 *
 * Everything about the day that has to survive a save goes through here, so a
 * loaded game knows whether the scorecard is still on the screen, and a replay
 * of the log walks the same day the player walked. The clock is moved by the
 * driver either side of these - the engine owns what state the day is IN, the
 * driver owns what time it is.
 */
export const DAY_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.startShift,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('morning_brief')),
        reason: 'The shift is already under way. There is no starting it '
          + 'twice, however much of the morning is left in you.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.dayState,
        value: { const: 'shift' },
      },
    ],
  },
  {
    id: DAY_ACTIONS.endShift,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Seventeen hundred comes at the end of a shift, and this is '
          + 'not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.dayState,
        value: { const: 'day_end' },
      },
    ],
  },
  {
    id: DAY_ACTIONS.clockOff,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('day_end')),
        reason: 'Clocking off is a thing you do at the end of a day. The day '
          + 'has not ended.',
      },
      // The banked total is world state from here on - it is hashed, saved and
      // replayed - so it is checked for being a number before it is one.
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'banked',
          value: 0,
        }),
        reason: 'The farm fund is counted in whole pence, and this is not a '
          + 'number of them.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.farmFund,
        value: { param: 'banked' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.dayState,
        value: { const: 'morning_brief' },
      },
      // The meters carry over - stress is the whole point of a shift you
      // survived - but the COUNTS are things about one day, and a scorecard
      // that added yesterday's in would stop meaning anything by Wednesday.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicionEvents,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.caughtEvents,
        value: { const: 0 },
      },
      // And the desk is cleared overnight by somebody who is paid less than
      // you and says nothing about it. The empties, the money the machine had
      // off you, and whatever is still in your blood all end with the day.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.deskCans,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.consumableSpend,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkStartedAt,
        value: { const: NO_RUN },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkTolerance,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.drinkCrashCharged,
        value: { const: NO_RUN },
      },
    ],
  },
];
