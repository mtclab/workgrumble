import type { ActionData, NodeRefData, PredData } from '../../engine-api';
import { NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { PROBATION_BONUS_PENCE, REVIEW_PASS_PERFORMANCE } from '../week';
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
   * Friday at three, in the two sentences it can end with.
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
