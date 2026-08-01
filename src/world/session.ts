import {
  type EngineApi,
  type SetupOp,
  WasmEngine,
} from '../engine-api';
import {
  helpdeskActionPayload,
  HELPDESK_TIER,
  KIND_LABELS,
} from './actions';
import { companySetup, COMPANY_IDS } from './company';
import { DEMO_ACTION_DATA } from './demo-world';
import { watchMachineEvents } from './events';
import { FIELDS } from './fields';
import { beatsFiredBy, PROBATION_WEEK, seasonAt } from './pressure';
import { spawnWorldTicket } from './tickets';
import { inheritedTicketIds, REVIEW_PASS_PERFORMANCE } from './week';

/**
 * Where the first week is dealt from. The working day is replayable, so the
 * seed is a constant rather than a clock reading.
 */
export const WORLD_SEED = 0x5eed_1c01;

/**
 * How far the seed moves when a week is played again.
 *
 * A retried week has to be recognisably the same week - the same tickets, the
 * same people, the same review on Friday - and not the same MINUTES, or the
 * second attempt is a memory test. The offset moves the jitter on the drip and
 * the lead's rounds and nothing else. It is an odd number well away from the
 * seed's own bit pattern so consecutive attempts do not land near each other.
 */
export const RETRY_SEED_STEP = 0x9e37_79b9;

/** The seed for the nth attempt at the probation week, counting from 1. */
export function seedForAttempt(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new TypeError('An attempt at the week is numbered from 1.');
  }

  return (WORLD_SEED + (attempt - 1) * RETRY_SEED_STEP) >>> 0;
}

/**
 * What a new week starts with.
 *
 * The fund is the joke that survives every firing: they take the job, the
 * lanyard and the desk, and the money towards the farm is still yours. The
 * attempt number is what moves the seed, so week two of the SAME week is not
 * the same minutes.
 */
export interface WeekCarry {
  readonly farmFund: number;
  readonly attempt: number;
  /**
   * Which week of the employer arc this one is, counting from 1.
   *
   * Optional, and it defaults to the probation week, because that is the only
   * week the shipped game deals: the arc exists so that the systemic layer has
   * somewhere to live and so that the seam employer switching needs is a
   * parameter rather than a rewrite. A week built without it is week one, and
   * week one carries no weather by rule.
   */
  readonly arcWeek?: number;
}

export const FIRST_WEEK: WeekCarry = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: PROBATION_WEEK,
});

export interface WorldSession {
  readonly engine: EngineApi;
  readonly tier: number;
  /** The seed this week was dealt from - what the day driver schedules on. */
  readonly seed: number;
  readonly carry: WeekCarry;
}

function requireCarry(carry: Readonly<WeekCarry>): Required<WeekCarry> {
  const arcWeek = carry.arcWeek ?? PROBATION_WEEK;

  if (!Number.isSafeInteger(carry.farmFund) || carry.farmFund < 0) {
    throw new TypeError('A farm fund is a whole number of pence, at least 0.');
  }

  if (!Number.isSafeInteger(carry.attempt) || carry.attempt < 1) {
    throw new TypeError('An attempt at the week is numbered from 1.');
  }

  if (!Number.isSafeInteger(arcWeek) || arcWeek < 1) {
    throw new TypeError('A week of the employer arc is numbered from 1.');
  }

  return { farmFund: carry.farmFund, attempt: carry.attempt, arcWeek };
}

/**
 * One way to stand up a working week: the same wiring the browser boots and the
 * same wiring the tests drive. A test that builds its own world is a test that
 * can pass while the shipped one is broken.
 *
 * The engine is the Rust core, and everything below is content handed to it as
 * DATA - the company as construction ops, the verb set as action definitions,
 * the tickets as definitions the engine spawns and then owns. Nothing outside
 * the engine holds a writable handle on the world.
 */
export function createWorldSession(
  carry: Readonly<WeekCarry> = FIRST_WEEK,
  engine: EngineApi = new WasmEngine(seedForAttempt(carry.attempt)),
): WorldSession {
  const start = requireCarry(carry);
  engine.setTier(HELPDESK_TIER);
  engine.applySetup([
    ...companySetup(),
    ...weekOpeningSetup(),
    ...carrySetup(start),
    ...pressureSetup(start.arcWeek),
  ]);
  engine.registerActions({
    kind_labels: KIND_LABELS,
    actions: DEMO_ACTION_DATA,
  });
  engine.registerActions(helpdeskActionPayload());

  // The machines start keeping their own history HERE, before a single ticket
  // is dealt: a spooler that was already down when the player sat down still
  // fell over, and the Event Viewer is the only surface that says when. A
  // subscription taken after the pile was spawned would open Monday on four
  // faults and an empty log.
  watchMachineEvents(engine, COMPANY_IDS.player);

  // Only Monday's inherited pile is spawned here: it is what was waiting when
  // the player sat down. Everything that ARRIVES during a shift, and every
  // other day of the week, is the day driver's to spawn at the tick the week's
  // table says it turns up.
  for (const id of inheritedTicketIds(1)) {
    spawnWorldTicket(engine, id);
  }

  return {
    engine,
    tier: HELPDESK_TIER,
    seed: seedForAttempt(start.attempt),
    carry: start,
  };
}

/**
 * What a Monday morning owes the Friday: the bar the conversation at three
 * will be held against, at the figure a week with nothing on anybody's file
 * leaves it at.
 *
 * It is world state rather than a constant in a guard because it MOVES - a
 * conduct file somebody has a reason to open raises it, and the review verbs
 * compare the mark against whatever the graph is holding. And it is written
 * here rather than in `companySetup` because the number belongs to the week
 * and `week.ts` imports the company: reaching back the other way would be an
 * import cycle that runs at module load, which is a `WEEK` table built out of
 * a `COMPANY_IDS` that does not exist yet.
 */
function weekOpeningSetup(): readonly SetupOp[] {
  return [
    {
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reviewBar,
      value: REVIEW_PASS_PERFORMANCE,
    },
  ];
}

/**
 * The weather, as it stood on the Monday morning of this week.
 *
 * Two fields, both mail arrival gates, both written only when the arc says the
 * beat has ALREADY happened - because both of them happened in a week that is
 * not this one. Each week of a career is its own world and its own clock, so
 * "the announcement went out four weeks ago" cannot be a tick in this week's
 * clock; what it is, from in here, is a thing that is in the inbox on the
 * Monday, which is exactly what the shipped mail already models.
 *
 * In the probation week - which is every week the shipped game currently
 * reaches - this writes NOTHING. That is the strongest claim this slice makes
 * and it is deliberately made here, in the one function that could break it: a
 * quiet week's graph carries no announcement, no ranking and no line, so the
 * layer is inert rather than merely switched off, and the golden weeks are the
 * proof. The only thing 0.2.7 puts in a quiet Monday's world is the arc week
 * itself, which is a fact about where the player is in a career rather than
 * about anything happening to them.
 */
function pressureSetup(arcWeek: number): readonly SetupOp[] {
  const season = seasonAt(arcWeek);

  if (season === null) {
    return [];
  }

  const fired = new Set(beatsFiredBy(season, arcWeek));
  const ops: SetupOp[] = [];

  if (fired.has('weather')) {
    ops.push({
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.pressureWeatherAt,
      value: 0,
    });
  }

  if (fired.has('notice')) {
    ops.push({
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.pressureNoticeAt,
      value: 0,
    });
  }

  return ops;
}

/**
 * What the last attempt left behind, written into the new world.
 *
 * The opening balance is recorded beside the fund rather than inferred: the
 * week scorecard reports what the WEEK earned, and on a second attempt the
 * fund does not start at nought. A screen that subtracted an opening balance
 * it had to guess at would be a screen that flatters a retry.
 */
function carrySetup(carry: Required<WeekCarry>): readonly SetupOp[] {
  return [
    {
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.farmFund,
      value: carry.farmFund,
    },
    {
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.weekOpeningFund,
      value: carry.farmFund,
    },
    {
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.weekAttempt,
      value: carry.attempt,
    },
    // Where this week sits in a career, which is world state for the same
    // reason the attempt is: it is saved, it is replayed, and one line of the
    // matrix - the one nobody can move - is read straight off it.
    {
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.arcWeek,
      value: carry.arcWeek,
    },
  ];
}
