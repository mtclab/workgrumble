import type { ActionData, NodeRefData } from '../../engine-api';
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
    ],
  },
];
