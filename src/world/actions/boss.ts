import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
} from '../../engine-api';
import { CAUGHT_SUSPICION_FLOOR } from '../boss';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { HELPDESK_TIER, not } from './helpers';
import { DAY_ACTIONS } from './ids';

/**
 * The boss verbs move the meters of the person he is standing behind, so they
 * are aimed at whoever dispatched them. He has no node state of his own: where
 * he is at any minute is a function of the day's seeded schedule, which is
 * exactly why none of it has to be saved.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

function add(field: string, param: string, max = METER_CEILING): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field,
    value: {
      add: {
        node: ACTOR,
        field,
        by: { param },
        clamp: { min: METER_FLOOR, max },
      },
    },
  };
}

function subtract(field: string, param: string): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field,
    value: {
      sub: {
        node: ACTOR,
        field,
        by: { param },
        clamp: { min: METER_FLOOR, max: METER_CEILING },
      },
    },
  };
}

function wholeNumber(param: string, what: string): GuardData[] {
  return [
    {
      when: not({ pred: 'param_is_whole_number', param, value: 0 }),
      reason: `${what} has to be a whole number of points at or above zero, `
        + 'and this is not one.',
    },
  ];
}

/**
 * What the lead does when he gets here.
 *
 * All three of these are dispatched by the day driver rather than by a button:
 * the player's input to a patrol is what is on their screen when it arrives,
 * which is a decision they made several minutes earlier. That is the mechanic,
 * and putting the consequence in the action registry is what makes it part of
 * the world rather than part of the shell's opinion of the world.
 */
export const BOSS_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.bossCaught,
    tier: HELPDESK_TIER,
    validate: wholeNumber('reputation_cost', 'What being caught costs'),
    apply: [
      // The meter goes to the floor a spoken-to person sits at. Set rather
      // than subtracted: after this conversation nobody is wondering about
      // you any more, they know, and the knowing is on the other meter.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicion,
        value: { const: CAUGHT_SUSPICION_FLOOR },
      },
      subtract(FIELDS.reputation, 'reputation_cost'),
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.caughtEvents,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.caughtEvents,
            by: { const: 1 },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  {
    id: DAY_ACTIONS.bossNoticedEmpties,
    tier: HELPDESK_TIER,
    validate: wholeNumber('suspicion_up', 'What the empties are worth'),
    apply: [add(FIELDS.suspicion, 'suspicion_up')],
  },
  {
    id: DAY_ACTIONS.bossPing,
    tier: HELPDESK_TIER,
    validate: wholeNumber('stress_up', 'What a ping off the lead costs'),
    apply: [add(FIELDS.stress, 'stress_up')],
  },
];
