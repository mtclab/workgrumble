import type { ActionData, GuardData, NodeRefData, OpData } from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { fieldIs, HELPDESK_TIER, not } from './helpers';
import { DAY_ACTIONS } from './ids';

/**
 * Minutes of do-not-disturb-while-working this interval is banking, or absent
 * on a dispatch from a world with no dot in it.
 */
const DND_TICKS_PARAM = 'dnd_ticks_up';

/**
 * The pressure meters move on the person carrying them, so the verb is aimed
 * at whoever dispatched it. Nobody else in the building has a stress level the
 * player can see.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/**
 * One meter, moved up and then down, each step held inside the range.
 *
 * Two parameters rather than one signed number because that is what the world
 * can check - a guard can insist on a whole number at or above zero - and
 * because the pair reads back out of the dispatch log as what actually
 * happened: the queue did this to you, the half hour off did that. Clamping
 * after each step rather than once at the end is what makes the ceiling a
 * place a value STOPS rather than one it passes through on the way down.
 */
function meterOps(field: string, up: string, down: string): readonly OpData[] {
  const move = (
    direction: 'add' | 'sub',
    param: string,
  ): OpData => ({
    op: 'set_field',
    node: ACTOR,
    field,
    value: direction === 'add'
      ? {
        add: {
          node: ACTOR,
          field,
          by: { param },
          clamp: { min: METER_FLOOR, max: METER_CEILING },
        },
      }
      : {
        sub: {
          node: ACTOR,
          field,
          by: { param },
          clamp: { min: METER_FLOOR, max: METER_CEILING },
        },
      },
  });

  return [move('add', up), move('sub', down)];
}

/** Every number this action carries is world state before it is anything. */
function wholeNumber(param: string, what: string): GuardData {
  return {
    when: not({ pred: 'param_is_whole_number', param, value: 0 }),
    reason: `${what} has to be a whole number of points at or above zero, `
      + 'and this is not one.',
  };
}

const METER_PARAMS: readonly (readonly [string, string])[] = [
  ['stress_up', 'What the queue did to you'],
  ['stress_down', 'What the break took off'],
  ['suspicion_up', 'What was visible on your screen'],
  ['suspicion_down', 'What clean work earned back'],
  ['reputation_up', 'What the closures were worth'],
  ['reputation_down', 'What the misses cost'],
  ['breaches_charged', 'The breaches already billed'],
  ['resolve_credit_paid', 'The credit already paid out'],
];

/**
 * The pressure layer's one verb.
 *
 * The shell works out HOW MUCH from readable state - open tickets, breaches,
 * what is on screen, whether it is lunch - and the engine works out what the
 * meters end up BEING. Splitting it there is what keeps the day replayable:
 * the numbers are in the dispatch log, so a replay arrives at the same meters
 * rather than recomputing them against a wall clock nobody recorded.
 */
export const METER_ACTION_DATA: readonly ActionData[] = [
  {
    id: DAY_ACTIONS.metersTick,
    tier: HELPDESK_TIER,
    validate: [
      ...METER_PARAMS.map(([param, what]) => wholeNumber(param, what)),
      {
        when: not({
          pred: 'param_int_in',
          param: 'suspicion_events_up',
          values: [0, 1],
        }),
        reason: 'An interval is either one the boss would have had something '
          + 'to say about or it is not. There is no half of one.',
      },
      // The dot's minutes are optional and validated when they are there: a
      // dispatch from before the status existed says nothing and writes
      // nothing, which is what keeps a scripted week byte-identical to the one
      // that was walked before this slice.
      {
        when: {
          pred: 'all',
          of: [
            not({ pred: 'param_absent', param: DND_TICKS_PARAM }),
            not({
              pred: 'param_is_whole_number',
              param: DND_TICKS_PARAM,
              value: 0,
            }),
          ],
        },
        reason: 'Minutes of a status held while the queue was being worked '
          + 'have to be a whole number of them at or above zero, and this is '
          + 'not one.',
      },
      // And they are the WORLD's to believe rather than the caller's: the dot
      // is on the graph, so a driver cannot bank half an hour of do not
      // disturb against a player who is showing Available.
      {
        when: {
          pred: 'all',
          of: [
            {
              pred: 'param_is_whole_number',
              param: DND_TICKS_PARAM,
              value: 1,
            },
            not(fieldIs(ACTOR, FIELDS.presence, 'dnd')),
          ],
        },
        reason: 'Those are minutes of a dot nobody is showing. The status is '
          + 'not on do not disturb, so there is nothing for the record to be '
          + 'a record of.',
      },
    ],
    apply: [
      ...meterOps(FIELDS.stress, 'stress_up', 'stress_down'),
      ...meterOps(FIELDS.suspicion, 'suspicion_up', 'suspicion_down'),
      ...meterOps(FIELDS.reputation, 'reputation_up', 'reputation_down'),
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicionEvents,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.suspicionEvents,
            by: { param: 'suspicion_events_up' },
            // One a minute for a career would not reach this. The bound is
            // there because arithmetic without one is how a counter becomes a
            // number nobody can read back.
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
      // The dot's minutes, when there are any, and NOTHING at all when there
      // are none: an add of nought is still a write, and a field that appeared
      // on every player node the first time the meters ticked would move every
      // golden in the suite while saying, of somebody who has never touched
      // the tray, that they have nought minutes of a status rather than no
      // status at all.
      //
      // Two ops because the first interval that banks any has to OPEN the
      // account: the op language adds to a number it can read, so an add
      // against an absent field is a refusal rather than a start.
      {
        op: 'when',
        cond: {
          pred: 'all',
          of: [
            {
              pred: 'param_is_whole_number',
              param: DND_TICKS_PARAM,
              value: 1,
            },
            { pred: 'field_missing', node: ACTOR, field: FIELDS.dndWorkingTicks },
          ],
        },
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.dndWorkingTicks,
            value: { const: 0 },
          },
        ],
      },
      {
        op: 'when',
        cond: {
          pred: 'param_is_whole_number',
          param: DND_TICKS_PARAM,
          value: 1,
        },
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.dndWorkingTicks,
            value: {
              add: {
                node: ACTOR,
                field: FIELDS.dndWorkingTicks,
                by: { param: DND_TICKS_PARAM },
                clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
              },
            },
          },
        ],
      },
      // The watermarks last, and only once the meters they paid for have
      // moved: an action is all of itself or none of it, so a refusal above
      // cannot leave a breach marked as billed.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.breachesCharged,
        value: { param: 'breaches_charged' },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.resolveCreditPaid,
        value: { param: 'resolve_credit_paid' },
      },
    ],
  },
  /**
   * The week's standing, weighted, as the review will read it.
   *
   * Same split as the meters above and for the same reason: the shell works
   * out the number from state anybody can read - what the days before were
   * worth, where reputation stands now - and the world decides what it ends up
   * being. The ceiling is applied HERE rather than trusted from the caller,
   * which is why the field is zeroed and then added to: a clamped add is the
   * only arithmetic in this language that says "and no further".
   */
  {
    id: DAY_ACTIONS.weekReading,
    tier: HELPDESK_TIER,
    validate: [
      wholeNumber('reading', 'The week as it stands'),
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.weekReputation,
        value: { const: METER_FLOOR },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.weekReputation,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.weekReputation,
            by: { param: 'reading' },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
];
