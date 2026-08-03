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

/**
 * Whether this conversation was the one about the STATUS, in which case the
 * morning it was about is closed by having been had.
 *
 * A parameter on the shared verb rather than a second verb, because it is the
 * same event with the same consequences - a line on the file, a meter on the
 * floor, twenty minutes off the shift - and the only difference is which of
 * the two records the lead was reading. What it stops is the beat re-arming
 * off a morning that has already been the subject of a conversation: the dot
 * has to earn a fresh half hour before he has anything new to say.
 */
const STATUS_SPENT_PARAM = 'status_evidence_spent';

/**
 * How far down the install audit this conversation was: the length of the trail
 * at the minute the lead came down about it.
 *
 * The software beat cannot clear its evidence the way the status one clears its
 * accrued minutes - the audit only ever grows - so instead of erasing anything
 * this advances a watermark to the length of the trail. The beat reads the tail
 * past this count, so the same install is not brought up every patrol; a fresh
 * install lands past the watermark and re-arms it. Absent on every conversation
 * that is not about software, which leaves the watermark exactly where it was.
 */
const INSTALL_NOTICED_PARAM = 'install_noticed';

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
    validate: [
      ...WRITTEN_DOWN,
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'param_absent', param: STATUS_SPENT_PARAM }),
            not({
              pred: 'param_int_in',
              param: STATUS_SPENT_PARAM,
              values: [0, 1],
            }),
          ],
        },
        reason: 'A conversation is either the one about your status or it is '
          + 'not. There is no half of one, and the morning it closes is a '
          + 'whole morning.',
      },
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'param_absent', param: INSTALL_NOTICED_PARAM }),
            not({
              pred: 'param_is_whole_number',
              param: INSTALL_NOTICED_PARAM,
              value: 0,
            }),
          ],
        },
        reason: 'The install audit is counted in whole lines, and a watermark '
          + 'that is not a whole number of them is a record the audit cannot '
          + 'place against the trail.',
      },
    ],
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
      // The morning the conversation was about, closed by having had it. Only
      // where it was the status conversation, and only where there is a
      // record to close - a telling-off about a forum leaves the dot's own
      // record exactly where it was, and a player who has never touched the
      // tray has no record for this to create.
      {
        op: 'when',
        cond: {
          pred: 'all',
          of: [
            { pred: 'param_int_in', param: STATUS_SPENT_PARAM, values: [1] },
            not({
              pred: 'field_missing',
              node: ACTOR,
              field: FIELDS.dndWorkingTicks,
            }),
          ],
        },
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.dndWorkingTicks,
            value: { const: 0 },
          },
          // The carry goes with it: what is billed is billed, and a bank
          // emptied while its bill stood would make the next minutes of the
          // dot free until the arithmetic caught up with itself.
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.dndSuspicionCharged,
            value: { const: 0 },
          },
        ],
      },
      // And the software watermark, where this was the conversation about the
      // install audit. Only where the param is there - a telling-off about a
      // forum or a status leaves the audit's own watermark exactly where it
      // was - and it is SET to the length of the trail rather than added to,
      // because what closes is "everything on the list so far", and a fresh
      // install lands past it and re-arms.
      {
        op: 'when',
        cond: not({ pred: 'param_absent', param: INSTALL_NOTICED_PARAM }),
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.installNoticed,
            value: { param: INSTALL_NOTICED_PARAM },
          },
        ],
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
