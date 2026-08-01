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

/**
 * One line onto the file, which is the whole of what being noticed costs the
 * world.
 *
 * The sentence arrives already written, from `src/world/conduct.ts`, exactly
 * as a machine's own event log does - a replay appends the identical string
 * rather than rebuilding it against a clock nobody saved.
 */
function fileLine(): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field: FIELDS.conductFile,
    value: {
      append_line: {
        node: ACTOR,
        field: FIELDS.conductFile,
        value: { param_trim: FILE_LINE_PARAM },
      },
    },
  };
}

const FILE_LINE_PARAM = 'file_line';

const WRITTEN_DOWN: GuardData[] = [
  {
    when: { pred: 'param_blank', param: FILE_LINE_PARAM },
    reason: 'Something was noticed and nobody wrote down what. A file with a '
      + 'blank line in it is worse than no file at all: it is a thing that '
      + 'counts against you and cannot be read.',
  },
];

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
    validate: WRITTEN_DOWN,
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
      // And the line, which is the only thing that survives the day. There is
      // no reputation op here on purpose: see `CAUGHT_MINUTES`.
      fileLine(),
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
    validate: [
      ...wholeNumber('suspicion_up', 'What the empties are worth'),
      ...WRITTEN_DOWN,
    ],
    // The desk told the story on its own, so the desk goes on the file. He
    // does not mention it, which is the joke and is also what a note in a
    // personnel file is FOR.
    apply: [add(FIELDS.suspicion, 'suspicion_up'), fileLine()],
  },
  {
    id: DAY_ACTIONS.bossPing,
    tier: HELPDESK_TIER,
    validate: wholeNumber('stress_up', 'What a ping off the lead costs'),
    apply: [add(FIELDS.stress, 'stress_up')],
  },
];
