import {
  type EngineApi,
  type NodeId,
  type SetupOp,
  WasmEngine,
} from '../engine-api';
import {
  helpdeskActionPayload,
  HELPDESK_TIER,
  KIND_LABELS,
} from './actions';
import type { ChannelDef } from './channels';
import type { InstallPolicy } from './company';
import { DEMO_ACTION_DATA } from './demo-world';
import {
  type Employer,
  employerFor,
  FIRST_EMPLOYER,
} from './employers';
import { watchMachineEvents } from './events';
import { FIELDS, PLAYER_TIERS, type PlayerTier } from './fields';
import { clampMeter } from './meters';
import {
  beatsFiredBy,
  type EmployerArc,
  PROBATION_WEEK,
  seasonAt,
} from './pressure';
import { spawnWorldTicket } from './tickets';
import { type DayScript } from './week';

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
  /**
   * Which employer stands this week up, defaulting to the shop that hired the
   * probationer.
   *
   * Optional and absent means the first employer, which is the back-compat rule
   * read forwards: a carry written before the switch existed - every retry
   * record and every save this build has ever read - could only have been at
   * the one employer there was. The day the second employer ships, a carry
   * naming it stands up its graph instead; until then this is the whole of the
   * switch parameter, threaded but pointed at one place.
   */
  readonly employer?: string;
  /**
   * The standing the player arrives with, or absent for a fresh start.
   *
   * This is the career half of the switch. On a first week and on a retry it is
   * ABSENT, and absent means the employer's own starting reputation is seeded -
   * which is why a fresh probation and a retried one are byte-identical to the
   * world before this field existed: nothing new is written. On an employer
   * SWITCH it carries the reputation earned at the last shop, and the new
   * player node is seeded FROM it rather than fresh, which is the standing
   * following the player across the swap.
   */
  readonly reputation?: number;
  /**
   * And the title, carried the same way and for the same reason: present only
   * on a switch, when the player keeps the standing they held. Absent leaves the
   * employer's own seeded title in place, so the probation week's "IT Support
   * Technician (probationary)" is untouched and the goldens do not move.
   */
  readonly title?: string;
  /**
   * The PAM tier the player carries in (E6), or absent for a desk player.
   *
   * The third carried career field, and it keeps the byte-identical rule the
   * hardest way of the three: a `service_desk` tier - which is every carry a
   * probation, a retry and every existing switch record produces - writes
   * NOTHING to the graph, exactly as an absent reputation and title do. Only a
   * `systems_engineer` carry writes the field, which is the promotion following
   * a player across a change of employer, permanently.
   */
  readonly playerTier?: PlayerTier;
}

export const FIRST_WEEK: WeekCarry = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: PROBATION_WEEK,
  employer: FIRST_EMPLOYER,
});

export interface WorldSession {
  readonly engine: EngineApi;
  readonly tier: number;
  /** The seed this week was dealt from - what the day driver schedules on. */
  readonly seed: number;
  readonly carry: WeekCarry;
  /** Which employer this session stood up - what a switch or save reads back. */
  readonly employer: string;
  /**
   * This employer's content, carried ON the session rather than in a module
   * global (0.6.0 slice 3). The day driver and the shell read the week, rooms
   * and install policy from HERE - which is what makes a second employer's
   * world session-scoped and stops two live sessions from cross-contaminating.
   */
  readonly week: readonly DayScript[];
  readonly channels: readonly ChannelDef[];
  readonly installPolicy: InstallPolicy;
  readonly reviewBar: number;
  /** Whether this employer runs the probation lead's boss pings (P1-4). */
  readonly runsBossPings: boolean;
}

/**
 * A carry with every world-seed field resolved, and the career fields kept as
 * "present or not" rather than defaulted.
 *
 * The distinction is the whole of the byte-identical claim. `farmFund`,
 * `attempt` and `arcWeek` default to a value and are always written. The career
 * fields do NOT default to a value - they resolve to `null`, which means "write
 * nothing, leave the employer's own seed" - so a carry with no career on it
 * emits exactly the ops it emitted before the career existed.
 */
interface ResolvedCarry {
  readonly farmFund: number;
  readonly attempt: number;
  readonly arcWeek: number;
  readonly employer: string;
  readonly reputation: number | null;
  readonly title: string | null;
  /**
   * The tier to WRITE, or null to leave the employer's seed. `service_desk`
   * resolves to null - the default is written nowhere, which is what keeps a
   * fresh week byte-identical - and only `systems_engineer` resolves to a value
   * the carry setup pushes onto the player node.
   */
  readonly playerTier: PlayerTier | null;
}

function requireCarry(carry: Readonly<WeekCarry>): ResolvedCarry {
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

  // The carried standing, when there is one, is a meter reading: a whole number
  // on the same nought-to-a-hundred scale the reputation meter runs, clamped so
  // a firing penalty that took it below the floor arrives as the floor rather
  // than as a negative the graph would refuse.
  let reputation: number | null = null;

  if (carry.reputation !== undefined) {
    if (!Number.isSafeInteger(carry.reputation)) {
      throw new TypeError('A carried reputation is a whole number.');
    }

    reputation = clampMeter(carry.reputation);
  }

  const title = carry.title ?? null;

  if (title !== null && title.length === 0) {
    throw new TypeError('A carried title is a name, not an empty string.');
  }

  // Only a systems_engineer carry writes the field; a service_desk carry and an
  // absent one resolve to null, which is "leave the employer's seed", which is
  // "write nothing" - the whole of why a fresh week's world does not move.
  const playerTier = carry.playerTier === PLAYER_TIERS.systemsEngineer
    ? PLAYER_TIERS.systemsEngineer
    : null;

  return {
    farmFund: carry.farmFund,
    attempt: carry.attempt,
    arcWeek,
    employer: carry.employer ?? FIRST_EMPLOYER,
    reputation,
    title,
    playerTier,
  };
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
  employer: Employer = employerFor(carry.employer),
): WorldSession {
  const start = requireCarry(carry);
  const player = employer.playerId;
  engine.setTier(HELPDESK_TIER);
  engine.applySetup([
    ...employer.setup(),
    ...weekOpeningSetup(player, employer.reviewBar),
    ...carrySetup(start, player),
    ...pressureSetup(start.arcWeek, employer.arc, player),
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
  watchMachineEvents(engine, player);

  // Only Monday's inherited pile is spawned here: it is what was waiting when
  // the player sat down. Everything that ARRIVES during a shift, and every
  // other day of the week, is the day driver's to spawn at the tick the week's
  // table says it turns up.
  for (const id of employer.mondayTicketIds()) {
    spawnWorldTicket(engine, id);
  }

  return {
    engine,
    tier: HELPDESK_TIER,
    seed: seedForAttempt(start.attempt),
    carry: resolvedToCarry(start),
    employer: employer.id,
    // The content the driver and shell read off the session, so the world plays
    // as THIS employer without any module global to race.
    week: employer.week,
    channels: employer.channels,
    installPolicy: employer.installPolicy,
    reviewBar: employer.reviewBar,
    runsBossPings: employer.runsBossPings,
  };
}

/**
 * The resolved carry as a plain `WeekCarry` again, for the session to report.
 *
 * The career fields are folded back to present-or-absent - a `null` standing is
 * dropped rather than reported as `null` - so the carry a fresh probation
 * reports is exactly the three-and-employer shape it was handed, which is what
 * lets `createWorldSession(FIRST_WEEK).carry` still equal `FIRST_WEEK`.
 */
function resolvedToCarry(start: Readonly<ResolvedCarry>): WeekCarry {
  return {
    farmFund: start.farmFund,
    attempt: start.attempt,
    arcWeek: start.arcWeek,
    employer: start.employer,
    ...(start.reputation === null ? {} : { reputation: start.reputation }),
    ...(start.title === null ? {} : { title: start.title }),
    ...(start.playerTier === null ? {} : { playerTier: start.playerTier }),
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
function weekOpeningSetup(
  player: NodeId,
  reviewBar: number,
): readonly SetupOp[] {
  return [
    {
      op: 'setField',
      id: player,
      field: FIELDS.reviewBar,
      value: reviewBar,
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
function pressureSetup(
  arcWeek: number,
  arc: Readonly<EmployerArc>,
  player: NodeId,
): readonly SetupOp[] {
  const season = seasonAt(arcWeek, arc);

  if (season === null) {
    return [];
  }

  const fired = new Set(beatsFiredBy(season, arcWeek));
  const ops: SetupOp[] = [];

  if (fired.has('weather')) {
    ops.push({
      op: 'setField',
      id: player,
      field: FIELDS.pressureWeatherAt,
      value: 0,
    });
  }

  if (fired.has('notice')) {
    ops.push({
      op: 'setField',
      id: player,
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
function carrySetup(
  carry: Readonly<ResolvedCarry>,
  player: NodeId,
): readonly SetupOp[] {
  const ops: SetupOp[] = [
    {
      op: 'setField',
      id: player,
      field: FIELDS.farmFund,
      value: carry.farmFund,
    },
    {
      op: 'setField',
      id: player,
      field: FIELDS.weekOpeningFund,
      value: carry.farmFund,
    },
    {
      op: 'setField',
      id: player,
      field: FIELDS.weekAttempt,
      value: carry.attempt,
    },
    // Where this week sits in a career, which is world state for the same
    // reason the attempt is: it is saved, it is replayed, and one line of the
    // matrix - the one nobody can move - is read straight off it.
    {
      op: 'setField',
      id: player,
      field: FIELDS.arcWeek,
      value: carry.arcWeek,
    },
  ];

  // The career, when a switch carried one. These ops are written ONLY when the
  // carry holds a standing to continue, which is the whole of why a fresh
  // probation and a retried one stay byte-identical: with no career on the
  // carry nothing is pushed here, and the employer's own seed - the starting
  // reputation, the probationary title - stands untouched exactly as it did
  // before this field existed. On a switch they overwrite that seed with what
  // the player earned at the last shop, which is the standing following them.
  if (carry.reputation !== null) {
    ops.push(
      {
        op: 'setField',
        id: player,
        field: FIELDS.reputation,
        value: carry.reputation,
      },
      // The weighted week read starts where the meter does on a Monday - there
      // are no days behind it to weigh - so an arriving standing seeds both.
      {
        op: 'setField',
        id: player,
        field: FIELDS.weekReputation,
        value: carry.reputation,
      },
    );
  }

  if (carry.title !== null) {
    ops.push({
      op: 'setField',
      id: player,
      field: FIELDS.title,
      value: carry.title,
    });
  }

  // The tier, on a switch that carried a promoted one. Written ONLY for a
  // systems_engineer carry (requireCarry resolved service_desk to null), so a
  // fresh probation, a retry and a switch that never promoted push nothing here
  // and the player node is byte-identical to the world before the tier existed.
  // On a promoted switch it seeds the engineer tier, which is the promotion
  // following the player across the swap - permanent, as the design requires.
  if (carry.playerTier !== null) {
    ops.push({
      op: 'setField',
      id: player,
      field: FIELDS.playerTier,
      value: carry.playerTier,
    });
  }

  return ops;
}
