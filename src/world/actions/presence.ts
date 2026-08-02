import type { ActionData, NodeRefData, OpData } from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { PRESENCE_VALUES, presenceCode } from '../presence';
import { fieldIs, HELPDESK_TIER, not } from './helpers';
import { DAY_ACTIONS, WORLD_ACTIONS } from './ids';

/**
 * The dot, as two verbs: the one the player presses and the one the office
 * presses back.
 *
 * Both are aimed at whoever dispatched them, like every other verb in this
 * family: a status is a property of the person showing it, and what showing it
 * costs is paid by the same person.
 *
 * The third half of the triangle - a declinable interruption sliding past a
 * red dot - lives in `actions/interruptions.ts` with the rest of the
 * interruption ledger, because what it writes IS that ledger. This file is the
 * dot itself and the one consequence that has nobody's window in it.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/** Which of the three, as an index into `PRESENCE_VALUES`. */
const DOT_PARAM = 'dot';

/** Who has noticed, and the whole `person@day` line that says they have. */
const REPORTER_PARAM = 'reporter';
const MARK_PARAM = 'mark';

export const PRESENCE_OFF_SHIFT_REASON = 'There is no shift on. A status is a '
  + 'thing the office reads off a desk somebody is sitting at, and nobody is '
  + 'looking at an empty one - setting a dot into a dark building tells '
  + 'nobody anything, which is a different thing from telling them you are '
  + 'busy.';

export const PRESENCE_UNKNOWN_REASON = 'A dot is one of three things: you are '
  + 'available, you would rather not be disturbed, or you are away from the '
  + 'desk. That is the whole of what anybody in this building can read off '
  + 'you, and this is not one of them.';

export const DOT_NOT_ON_REASON = 'The dot is not on do not disturb. Nothing '
  + 'about a status you are not showing can stop a phone ringing, and a call '
  + 'that slid past one you were not wearing would be a call that went '
  + 'missing.';

/**
 * And the exemption, in the words that teach it.
 *
 * A meeting and a workstation are the two interruptions with nobody on the
 * other end of them to read anything - the room is booked and the updates have
 * been outstanding since September - so the filter is not a rule they can be
 * held to. Every source the dot CAN dodge is one that can also be waved off,
 * which is why the flag the world reads here is the same one decline reads.
 */
export const DOT_IGNORED_REASON = 'It does not care what your dot says. A '
  + 'status is a thing PEOPLE read before deciding whether to bother you, and '
  + 'this is a room with a time on it and a machine that has already decided. '
  + 'Neither of them is somebody you can be unavailable to.';

export const AWAY_ALREADY_NOTICED_REASON = 'They have already had that '
  + 'thought today. Somebody watching your desk work through the afternoon '
  + 'with your dot on Away says something about it once - the second time '
  + 'they simply stop expecting anything, which costs you nothing today and '
  + 'is much worse.';

export const NOT_AWAY_REASON = 'The dot does not say Away. Nobody can be '
  + 'annoyed about a status you are not showing them, and a reputation hit '
  + 'for a lie nobody was told is a punishment with no cause.';

/**
 * The three, written as the world's own words rather than as anything a caller
 * says.
 *
 * Built from `PRESENCE_VALUES` so the wire number and the stored word cannot
 * drift: the index the caller sends is the index the branch is generated from,
 * and adding a fourth status would generate its branch or fail to compile.
 */
const SET_THE_DOT: OpData[] = PRESENCE_VALUES.map((presence) => ({
  op: 'when',
  cond: {
    pred: 'param_int_in',
    param: DOT_PARAM,
    values: [presenceCode(presence)],
  },
  ops: [
    {
      op: 'set_field',
      node: ACTOR,
      field: FIELDS.presence,
      value: { const: presence },
    },
  ],
}));

export const PRESENCE_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.presenceSet,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not({
          pred: 'param_int_in',
          param: DOT_PARAM,
          values: PRESENCE_VALUES.map((presence) => presenceCode(presence)),
        }),
        reason: PRESENCE_UNKNOWN_REASON,
      },
      // The world's half of "at a desk": there has to be a shift on. The
      // OTHER half - a desk that is currently a meeting room or a machine
      // installing updates - is the driver's, because it is the one that knows
      // what has taken the screen, and it refuses in the sentence that
      // interruption already owns rather than inventing a second one.
      {
        when: not(fieldIs(ACTOR, FIELDS.dayState, 'shift')),
        reason: PRESENCE_OFF_SHIFT_REASON,
      },
    ],
    apply: SET_THE_DOT,
  },
  {
    id: WORLD_ACTIONS.presenceNoticed,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'param_blank', param: REPORTER_PARAM },
        reason: 'Somebody escalated and nobody wrote down who. An escalation '
          + 'with no name on it is a reputation hit the player cannot trace '
          + 'to a person, which is the shape of a number that just went down.',
      },
      {
        when: { pred: 'param_blank', param: MARK_PARAM },
        reason: 'The record of who has already noticed today arrived empty, '
          + 'and a once-a-day rule with nothing to count is a rule that fires '
          + 'every time.',
      },
      // The dot, read off the graph rather than off the dispatch: what makes
      // this a consequence rather than an arbitrary fine is that the status
      // said Away at the minute the work was done, and the world is the half
      // that knows what the status says.
      {
        when: not(fieldIs(ACTOR, FIELDS.presence, 'away')),
        reason: NOT_AWAY_REASON,
      },
      {
        when: {
          pred: 'line_in_field',
          node: ACTOR,
          field: FIELDS.presenceNoticed,
          value: { param: MARK_PARAM },
        },
        reason: AWAY_ALREADY_NOTICED_REASON,
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'reputation_down',
          value: 0,
        }),
        reason: 'What somebody noticing costs has to be a whole number of '
          + 'points at or above zero, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reputation,
        value: {
          sub: {
            node: ACTOR,
            field: FIELDS.reputation,
            by: { param: 'reputation_down' },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
      // The mark last, and only once the hit has landed: an action is all of
      // itself or none of it, so a refusal above cannot leave a reporter
      // marked as having escalated without the escalation.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.presenceNoticed,
        value: {
          append_line: {
            node: ACTOR,
            field: FIELDS.presenceNoticed,
            value: { param: MARK_PARAM },
          },
        },
      },
    ],
  },
];
