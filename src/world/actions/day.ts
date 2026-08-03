import type { ActionData, NodeRefData, PredData } from '../../engine-api';
import { NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import {
  PROBATION_BONUS_PENCE,
  REDUNDANCY_PAYMENT_PENCE,
  REVIEW_PASS_PERFORMANCE,
} from '../week';
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

/** The review has not happened yet, which is what makes it happen once. */
const REVIEW_PENDING: PredData = {
  pred: 'field_eq',
  node: ACTOR,
  field: FIELDS.reviewOutcome,
  value: { const: 'pending' },
};

/**
 * The mark, held against the bar the world is carrying.
 *
 * `field_at_least` would compare it against a constant, which is what this
 * used to be. The bar moves now - it starts at `REVIEW_PASS_PERFORMANCE` and
 * is raised by what somebody found on the conduct file - so both review verbs
 * compare two fields, and a bar that was never written is a bar nobody has
 * cleared.
 */
const MARK_CLEARS_THE_BAR: PredData = {
  pred: 'field_at_least_field',
  node: ACTOR,
  field: FIELDS.weekReputation,
  than: { node: ACTOR, field: FIELDS.reviewBar },
};

/**
 * And the other question a Friday can ask: not "was it good enough" but "was
 * somebody easier to justify losing".
 *
 * Two fields compared, exactly as the bar is: where the player came in the
 * pool, against the first position that goes. Both are written a minute before
 * the conversation by `reviewMatrixRead`, both are on the criteria screen for
 * three weeks before that, and in a week with no round on NEITHER EXISTS -
 * which answers false, because a ranking nobody is holding is a ranking nobody
 * is in. That is what keeps the whole systemic layer inert in a quiet week
 * rather than merely switched off.
 */
const IN_THE_CUT: PredData = {
  pred: 'field_at_least_field',
  node: ACTOR,
  field: FIELDS.reviewPosition,
  than: { node: ACTOR, field: FIELDS.reviewCutFrom },
};

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
      // And the three records that are about TODAY rather than about the week,
      // wiped where they exist.
      //
      // Two of them are the dot's: how many minutes of do-not-disturb-while-
      // working are on the record, and what has been billed for them. The
      // lead's beat is a claim about THIS MORNING - "you have been on Do Not
      // Disturb", said at a desk, about a morning he watched - and evidence
      // that carried over from Monday would arm a Thursday beat with no
      // Thursday behind it. The third is who has already had their one thought
      // about an Away desk, which is once per person per DAY: keeping the
      // record for a day rather than writing the date into every line is what
      // lets the world enforce that rule off one parameter instead of trusting
      // a caller to spell a key.
      //
      // Each one is guarded on already existing, and that guard is the whole
      // determinism argument of the slice standing up: a player who has never
      // touched the tray has none of these fields, a clear of an absent field
      // would CREATE it at nought, and every scripted week in the suite would
      // move by three fields on the player node.
      ...[
        FIELDS.dndWorkingTicks,
        FIELDS.dndSuspicionCharged,
        FIELDS.presenceNoticed,
      ].map((field) => ({
        op: 'when' as const,
        cond: not({ pred: 'field_missing' as const, node: ACTOR, field }),
        ops: [
          {
            op: 'set_field' as const,
            node: ACTOR,
            field,
            value: { const: field === FIELDS.presenceNoticed ? '' : 0 },
          },
        ],
      })),
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
      // Five o'clock on a Friday that went well, and not a minute before it.
      //
      // The lock used to come off in the review itself, at three, which left
      // two hours of shift in which the fridge was open and the week was not
      // over - the joke the tooltip has been telling all week, told early and
      // at the desk. The probation ends when the DAY does.
      {
        op: 'when',
        cond: {
          pred: 'field_eq',
          node: ACTOR,
          field: FIELDS.reviewOutcome,
          value: { const: 'passed' },
        },
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.beerUnlocked,
            value: { const: true },
          },
        ],
      },
    ],
  },
  // The service clock, kept honest by the state it belongs to: one of these is
  // legal during a shift and the other is legal outside one, so the pair can
  // never leave the engine counting minutes at an empty desk - or refusing to
  // count minutes at a full one - however they are dispatched.
  {
    id: DAY_ACTIONS.slaClockRun,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'The service clock runs while the shift does. This is not a '
          + 'shift, and a deadline nobody could work towards is not a deadline.',
      },
    ],
    apply: [{ op: 'set_sla_clock', running: true }],
  },
  {
    id: DAY_ACTIONS.slaClockHold,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: stateIs('shift'),
        reason: 'The shift is on. Stopping every clock in the building while '
          + 'you are sitting at the desk is not a feature anybody is getting.',
      },
    ],
    apply: [{ op: 'set_sla_clock', running: false }],
  },
  /**
   * Somebody opening the file, a minute before the conversation.
   *
   * The bar and the sentence explaining it are snapshotted for the same reason
   * the mark is: everything they are computed from carries on moving after
   * three o'clock. A ticket closed at half past would retire the aggrieved
   * customer who caused the whole thing, and the review window would then be
   * printing a reason that no longer existed above a verdict it had caused.
   *
   * The bar may not be BELOW the published pass mark. A caller that could send
   * a lower one could hand somebody a job by arithmetic, which is the one
   * direction this must not be able to fail in.
   */
  {
    id: DAY_ACTIONS.reviewFileRead,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Nobody reads anybody\'s file outside working hours. He is '
          + 'very clear about that, in a way he is not clear about anything '
          + 'else.',
      },
      {
        when: not(REVIEW_PENDING),
        reason: 'That conversation has already happened, and the file was '
          + 'read before it, which is the whole order of these things.',
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'bar',
          value: REVIEW_PASS_PERFORMANCE,
        }),
        reason: 'The bar is a whole mark out of a hundred and it never goes '
          + `below ${String(REVIEW_PASS_PERFORMANCE)}. What is on a file can `
          + 'raise the line. Nothing lowers it.',
      },
      {
        when: { pred: 'param_blank', param: 'conduct' },
        reason: 'A bar was set and nobody wrote down why. The reason is the '
          + 'half of this the player is owed.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewBar,
        value: { param: 'bar' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewConduct,
        value: { param_trim: 'conduct' },
      },
    ],
  },
  /**
   * Somebody reading the matrix, in the same minute as the file.
   *
   * The ranking is snapshotted for the same reason the mark and the bar are:
   * every number it is computed from carries on moving after three o'clock. A
   * ticket closed at half past would raise the player's own performance line
   * and could move them across the cut, and the window afterwards would then
   * be printing a position that no longer existed above a verdict it had
   * caused.
   *
   * A position is at least 1, and so is the line - a round where the first
   * position that goes is nought is a round where everybody goes, which is not
   * a redundancy, it is a closure - and the sentence that explains the ranking
   * is required, because a ranking without it is a number the player has to
   * take on trust.
   */
  {
    id: DAY_ACTIONS.reviewMatrixRead,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Nobody scores anybody\'s matrix outside working hours. It is '
          + 'a consultation, and consultations happen on the clock.',
      },
      {
        when: not(REVIEW_PENDING),
        reason: 'That conversation has already happened, and the pool was '
          + 'scored before it, which is the whole order of these things.',
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'position',
          value: 1,
        }),
        reason: 'A place in a pool is a whole number and it starts at one. '
          + 'There is no nought-th person on a matrix.',
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'cut_from',
          value: 1,
        }),
        reason: 'The line is the first position that goes, and it is a whole '
          + 'number at least one. A round that starts cutting at nought is not '
          + 'a redundancy, it is a closure.',
      },
      {
        when: { pred: 'param_blank', param: 'criteria' },
        reason: 'A pool was scored and nobody wrote down what it said. The '
          + 'matrix is a screen, not a secret.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewPosition,
        value: { param: 'position' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewCutFrom,
        value: { param: 'cut_from' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewCriteria,
        value: { param_trim: 'criteria' },
      },
    ],
  },
  /**
   * Friday at three, in the three sentences it can end with.
   *
   * The threshold lives in the GUARDS. A single verb taking an outcome would
   * put the decision in whatever code called it, and there are three screens
   * that want to know how the review went - so the world is the thing that
   * decides, once, and everybody else reads the field afterwards.
   */
  {
    id: DAY_ACTIONS.reviewPassed,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Reviews happen during working hours. He is very clear about '
          + 'that, in a way he is not clear about anything else.',
      },
      {
        when: not(REVIEW_PENDING),
        reason: 'That conversation has already happened. Whatever was decided '
          + 'in it has been decided.',
      },
      {
        when: not(MARK_CLEARS_THE_BAR),
        reason: 'Nothing in the file supports keeping you on, and the file is '
          + 'the only thing in the room he is reading from.',
      },
      // Clearing the bar is not the same as keeping the job in a week where
      // two roles are going. The mark answers "was this good enough"; the
      // matrix answers "was somebody easier to justify losing", and a pass
      // dispatched over the top of a ranking would be the shell overruling the
      // one decision this game holds in the world on purpose.
      {
        when: IN_THE_CUT,
        reason: 'The mark is fine and the mark is not what is being decided. '
          + 'You are in the two, and the two is a ranking rather than a line.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewOutcome,
        value: { const: 'passed' },
      },
      // What the conversation was decided on, kept as it was read. The mark
      // carries on moving after three - the queue does not stop, and the last
      // clock-off folds Friday in again - and the week screen was showing a
      // live number beside a verdict it did not produce.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewReputation,
        value: { field: { node: ACTOR, field: FIELDS.weekReputation } },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.farmFund,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.farmFund,
            by: { const: PROBATION_BONUS_PENCE },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  {
    id: DAY_ACTIONS.reviewFired,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Reviews happen during working hours. He is very clear about '
          + 'that, in a way he is not clear about anything else.',
      },
      {
        when: not(REVIEW_PENDING),
        reason: 'That conversation has already happened. Whatever was decided '
          + 'in it has been decided.',
      },
      {
        when: MARK_CLEARS_THE_BAR,
        reason: 'There is enough in the file to keep you on, and he is not a '
          + 'man who does paperwork he does not have to.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewOutcome,
        value: { const: 'fired' },
      },
      // The same snapshot on the way out. A week screen that read the live
      // figure could say "46 of 45 needed" above "Probation: not continued",
      // which is the screen arguing with itself about the one number the
      // player is owed an honest account of.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewReputation,
        value: { field: { node: ACTOR, field: FIELDS.weekReputation } },
      },
    ],
  },
  /**
   * The third ending, and the one that is not a loss.
   *
   * It is guarded on both halves of the sentence it stands for: the week
   * CLEARED the line it was held to, and the pool put somebody else above you.
   * A week that did not clear the bar cannot reach this verb at all - that is
   * a firing, with the reasons the firing has - which is what stops a
   * redundancy round from being used to launder a week somebody actually lost.
   *
   * What it does is the whole design of the outcome. The mark is snapshotted
   * like every other ending, so the screen and the verdict cannot drift. The
   * fund keeps everything it had and takes the payment on top, because the
   * fund was never theirs and a week's notice is what nine weeks of service
   * actually buys. And the conduct file is deliberately NOT cleared here: it
   * belongs to the people who wrote it, it stays in this world with them, and
   * what does not travel to the next employer is a matter of which world gets
   * built rather than of a field being wiped on the way out.
   */
  {
    id: DAY_ACTIONS.reviewRedundant,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('shift')),
        reason: 'Reviews happen during working hours. He is very clear about '
          + 'that, in a way he is not clear about anything else.',
      },
      {
        when: not(REVIEW_PENDING),
        reason: 'That conversation has already happened. Whatever was decided '
          + 'in it has been decided.',
      },
      {
        when: not(IN_THE_CUT),
        reason: 'Nobody is proposing to make you redundant. There is either no '
          + 'round on or you are not in the part of it that goes, and neither '
          + 'is a thing anybody can volunteer for.',
      },
      {
        when: not(MARK_CLEARS_THE_BAR),
        reason: 'The week did not reach the line it was held to, and a round '
          + 'is not a way of dressing that up. This one has a different name '
          + 'and no cheque attached.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewOutcome,
        value: { const: 'redundant' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reviewReputation,
        value: { field: { node: ACTOR, field: FIELDS.weekReputation } },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.farmFund,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.farmFund,
            by: { const: REDUNDANCY_PAYMENT_PENCE },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
  /**
   * Answering a ping that landed after you clocked off, from the morning brief.
   *
   * Legal only at the brief, because that is where the "while you were out"
   * surface is and because the stress it carries is stress carried INTO a day -
   * a ping answered mid-shift would be a different beat with a different cost.
   * Once per ping, off the world's own list, so the button cannot be pressed
   * twice for two lots of the same point and a reload lands on the same answered
   * set. The two meter moves are parameters rather than constants in here for
   * the same reason every other meter move is - the shell reads what KIND of
   * thing happened and the world decides where the number stops - and both are
   * held to being whole and non-negative, so a caller cannot answer a ping for a
   * windfall of reputation or hand the player a stress hit out of nothing.
   */
  {
    id: DAY_ACTIONS.afterHoursAnswer,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('morning_brief')),
        reason: 'The while-you-were-out list is a thing you read before the '
          + 'shift starts. Once the clock is running, last night is last night.',
      },
      {
        when: { pred: 'param_blank', param: 'id' },
        reason: 'Something pinged you overnight and nobody wrote down what. An '
          + 'answer to a ping nobody can name is an answer that cannot be read '
          + 'back, which is the same as not having given one.',
      },
      {
        when: {
          pred: 'line_in_field',
          node: ACTOR,
          field: FIELDS.afterHoursAnswered,
          value: { param: 'id' },
        },
        reason: 'You already answered that one. It happened last night, you '
          + 'replied this morning, and the point it was worth has been counted '
          + 'once - which is all it is worth.',
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'rep_up',
          value: 0,
        }),
        reason: 'What being reachable is worth has to be a whole number of '
          + 'points at or above zero, and this is not one.',
      },
      {
        when: not({
          pred: 'param_is_whole_number',
          param: 'stress_up',
          value: 0,
        }),
        reason: 'What being reachable costs has to be a whole number of points '
          + 'at or above zero, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.afterHoursAnswered,
        value: {
          append_line: {
            node: ACTOR,
            field: FIELDS.afterHoursAnswered,
            value: { param: 'id' },
          },
        },
      },
      // The gain, and the cost it is paid against. Both clamp to the meter's own
      // floor and ceiling, so a ping answered with reputation already at the top
      // is the point it always was and no more.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reputation,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.reputation,
            by: { param: 'rep_up' },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
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
   * Clocking off on the last day, which is not the same verb as clocking off
   * on any other one: there is no tomorrow to advance into, the counts are not
   * cleared for a day that will not happen, and the world stops here so the
   * week scorecard has something to be a scorecard OF.
   */
  {
    id: DAY_ACTIONS.endWeek,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not(stateIs('day_end')),
        reason: 'The week ends when the day does, and this one has not.',
      },
      {
        when: REVIEW_PENDING,
        reason: 'Nobody has had the conversation yet. Going home now would be '
          + 'leaving before your own review, which is a way of answering it.',
      },
      {
        when: {
          pred: 'field_eq',
          node: ACTOR,
          field: FIELDS.weekEnded,
          value: { const: true },
        },
        reason: 'The week is over. It was over the first time.',
      },
      {
        when: not({ pred: 'param_is_whole_number', param: 'banked', value: 0 }),
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
        field: FIELDS.weekEnded,
        value: { const: true },
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
