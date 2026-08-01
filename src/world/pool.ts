/**
 * The selection matrix: who is easiest to justify losing.
 *
 * When the pressure is systemic the question stops being "was this person good
 * enough" and becomes comparative, and the comparison has a published shape.
 * A redundancy scoring matrix is "a structured table employers use to assess
 * all employees at risk of redundancy on fair, pre-defined criteria, with each
 * employee in a selection pool scored using factual, business-relevant
 * measures"; the criteria in common use are skills, qualifications,
 * performance, attendance, disciplinary record and length of service, with
 * performance scored from recent appraisals or objective KPI results and the
 * disciplinary record scored only where it is current and relevant
 * (`docs/research/review-scoring.md` section 2.6).
 *
 * That is this game's own model with a legal citation attached: the latent
 * conduct record, the performance number and the length of service are read AT
 * ONCE, against a pool, and an honest week does not buy safety - it buys a
 * position.
 *
 * Three lines, not six, and each one is here for a reason:
 *
 * - PERFORMANCE, and it is the heaviest, because it is the only line the
 *   player moves by playing. Theirs is this week's mark, the same number the
 *   review reads. Everybody else's is the appraisal figure HR is holding,
 *   because nobody else on this floor works tickets and inventing an SLA
 *   attainment for a receptionist would be a lie with a decimal point on it.
 * - DISCIPLINARY RECORD, which is the conduct file converted at last. It costs
 *   nothing all week, and here - and only here - it is worth points, which is
 *   the whole of what the latent record was for.
 * - LENGTH OF SERVICE, which the player cannot move at all and which is the
 *   true, grim structural fact about being the newest person in a building: on
 *   a matrix, being new IS the risk. It is on the screen, named, weighted and
 *   scored, so that the one line nobody controls is also the one line nobody
 *   has to guess at.
 *
 * Attendance and qualifications are deliberately absent rather than faked:
 * this game has no absence and no certification, and a matrix line scored from
 * nothing is a matrix line that would decide somebody's job from nothing.
 *
 * Nothing here touches the DOM, dispatches, reads the time of day, or consumes
 * the RNG.
 */

import { COMPANY_IDS } from './company';
import { conductFileSize } from './conduct';

/* -- the lines, and what each is worth ------------------------------------- */

export const MATRIX_WEIGHTS = Object.freeze({
  performance: 0.6,
  conduct: 0.2,
  service: 0.2,
});

/**
 * What one line of the conduct file costs on the matrix, and the most a whole
 * file can cost.
 *
 * Six points a line to a floor of nought, so a file with sixteen or more lines
 * on it scores zero for conduct and there is nothing further to lose. Against
 * the twenty percent this line carries, a full file is worth twenty points of
 * composite - which is, deliberately, about a third of the difference between
 * a week that did the job and a week that did half of it. Being seen is
 * expensive here and it is not fatal here, which is the same ratio the bar
 * shift uses and the same finding underneath it: the latitude is real, it is
 * finite, and it is spent.
 */
export const MATRIX_CONDUCT_PER_LINE = 6;

/**
 * The length of service that stops earning points, in weeks.
 *
 * Ten years. Real matrices cap service for the same reason: uncapped, it
 * becomes the only criterion anybody scores on and the exercise stops being
 * about the work. Everything past the cap is worth the same hundred, so the
 * receptionist who has been here twenty-two years and the one who has been
 * here eleven are level, and the person who started on the same Monday as the
 * player is level with the player.
 */
export const SERVICE_CAP_WEEKS = 520;

/** One person's four numbers, as the matrix prints them. */
export interface MatrixRow {
  /** The person node, so the screen reads the name out of the graph. */
  readonly person: string;
  /** Out of a hundred: this week's mark, or their last appraisal. */
  readonly performance: number;
  /** How many lines are on their file. */
  readonly fileLines: number;
  /** How long they have been here when this week starts. */
  readonly serviceWeeks: number;
}

export interface MatrixScore extends MatrixRow {
  /** Each line, scored out of a hundred. */
  readonly conduct: number;
  readonly service: number;
  /** The weighted composite, out of a hundred. */
  readonly composite: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The disciplinary line: a hundred, less what is on the file. */
export function conductScore(fileLines: number): number {
  return clamp(100 - fileLines * MATRIX_CONDUCT_PER_LINE, 0, 100);
}

/** The service line: how far up the ten years somebody is. */
export function serviceScore(weeks: number): number {
  return Math.round(100 * clamp(weeks, 0, SERVICE_CAP_WEEKS) / SERVICE_CAP_WEEKS);
}

/**
 * One row, scored. The same function for the player and for everybody else,
 * which is the point: a pool scored two different ways is a pool nobody can
 * argue with.
 */
export function scoreRow(row: Readonly<MatrixRow>): MatrixScore {
  const conduct = conductScore(row.fileLines);
  const service = serviceScore(row.serviceWeeks);

  return {
    ...row,
    conduct,
    service,
    composite: Math.round(
      MATRIX_WEIGHTS.performance * clamp(row.performance, 0, 100)
      + MATRIX_WEIGHTS.conduct * conduct
      + MATRIX_WEIGHTS.service * service,
    ),
  };
}

/* -- the pool -------------------------------------------------------------- */

/**
 * Somebody else in the pool: who they are, how long they had been here when
 * the player started, and what HR is holding on them.
 *
 * `startedWeeksBefore` rather than a length of service, because service is a
 * thing that grows: the new starter in Finance who arrived on the same Monday
 * as the player is level with the player in week nine and in week ninety, and
 * a table of frozen numbers would have quietly stopped being true after the
 * first week of the arc.
 */
export interface PoolMember extends Omit<MatrixRow, 'serviceWeeks'> {
  /** How long they had been here on the player's first morning. */
  readonly startedWeeksBefore: number;
  /** What the notice calls their role, and why they are in this pool. */
  readonly role: string;
}

/**
 * The five other people in the pool, and why it is these five.
 *
 * The pool is NOT the first-line desk, because this building does not have
 * one: Workgrumble Ltd has one first-line technician and it is the player,
 * which is exactly how a fifty-person company works and is stated in the
 * estate's own seed. Inventing five colleagues to be compared against would
 * rewrite the company's fiction to make a mechanic fit.
 *
 * So the pool is drawn the way a small employer actually draws one - "support
 * and administrative roles at this site" - and it puts a technician, a
 * receptionist, two people from logistics, somebody in estimating and a
 * finance assistant on the same table. That is a genuinely questionable pool,
 * it is the kind of pool that gets challenged, and it is what happens. The
 * matrix does not care that they do different jobs; it scores three lines that
 * exist for all of them.
 *
 * The numbers are authored, and each of them is a claim:
 *
 * - BEV has been on reception for twenty-two years, has never had a note put
 *   on her file, and had a perfectly ordinary appraisal. She is safe on
 *   service alone, which is what twenty-two years buys.
 * - GARY is eight years in, has two lines on his file about a mail rule and a
 *   forwarding argument, and is the one everybody assumes is safe.
 * - TERRY has six years and five lines, because Terry raises things.
 * - OWEN does the late shift, three years, one line, and a middling appraisal
 *   nobody wrote carefully. He is the person immediately above the line, which
 *   makes him the one number on the screen that actually matters.
 * - ROB started on the same Monday as the player - his first day is the week's
 *   own licence ticket - so he has exactly the player's service and the
 *   appraisal of somebody nobody has appraised. He is bottom, and he is bottom
 *   because he is new, which is the honest thing this table is for.
 */
export const SELECTION_POOL: readonly PoolMember[] = Object.freeze([
  {
    person: COMPANY_IDS.bev,
    role: 'Reception',
    performance: 53,
    fileLines: 0,
    startedWeeksBefore: 22 * 52,
  },
  {
    person: COMPANY_IDS.gary,
    role: 'Logistics',
    performance: 51,
    fileLines: 2,
    startedWeeksBefore: 8 * 52,
  },
  {
    person: COMPANY_IDS.terry,
    role: 'Estimating',
    performance: 53,
    fileLines: 5,
    startedWeeksBefore: 6 * 52,
  },
  {
    person: COMPANY_IDS.owen,
    role: 'Logistics, late shift',
    performance: 50,
    fileLines: 1,
    startedWeeksBefore: 3 * 52,
  },
  {
    person: COMPANY_IDS.rob,
    role: 'Finance',
    performance: 33,
    fileLines: 0,
    startedWeeksBefore: 0,
  },
]);

/** What the player's own row is made of, all of it read off the world. */
export interface PlayerRow {
  /** The mark the review reads, out of a hundred. */
  readonly performance: number;
  /** The conduct file, as the graph holds it. */
  readonly file: unknown;
  /** Which week of the arc this is, which is how long they have been here. */
  readonly arcWeek: number;
}

export interface PoolStanding {
  /** Everybody, best first. */
  readonly rows: readonly MatrixScore[];
  /** The player's place, counting from 1. */
  readonly position: number;
  /** The first position that goes. In the cut is `position >= cutFrom`. */
  readonly cutFrom: number;
  readonly cut: number;
  readonly pool: number;
  readonly inTheCut: boolean;
  /** The player's own row, scored. */
  readonly player: MatrixScore;
  /**
   * The number the player actually has to beat, and it is not read off their
   * own row: it is the composite of the person holding the last place that is
   * not theirs.
   *
   * Computed over the OTHERS rather than over the ranking, because a line read
   * out of a list the player is standing in moves when the player does, and a
   * target that moves with you is not a target. With two going from six there
   * are three people who can be above you and still leave you in work, so the
   * line is the fourth-best of the five colleagues - which is Owen, all
   * consultation, on fifty-five.
   *
   * Null when there is nobody left to be measured against, which nothing
   * shipped can reach and is answered rather than thrown.
   */
  readonly line: number | null;
}

/**
 * The pool, scored and ranked, with the player in it.
 *
 * Ties are broken by length of service and then by node id, and both halves of
 * that are deliberate. Service is the criterion a real matrix breaks ties on,
 * it is already on the screen, and it means the newest person loses a tie -
 * which is harsh, true, and legible in advance rather than a surprise in the
 * room. The id is the second break so that the answer cannot depend on the
 * order the graph happened to hand anything over in: this decides whether
 * somebody has a job, and it must decide it the same way twice.
 */
export function poolStanding(
  player: Readonly<PlayerRow>,
  cut: number,
  members: readonly PoolMember[] = SELECTION_POOL,
): PoolStanding {
  const playerRow = scoreRow({
    person: COMPANY_IDS.player,
    performance: player.performance,
    fileLines: conductFileSize(player.file),
    serviceWeeks: Math.max(0, player.arcWeek),
  });
  const rows = [
    playerRow,
    ...members.map((member) => scoreRow({
      person: member.person,
      performance: member.performance,
      fileLines: member.fileLines,
      serviceWeeks: member.startedWeeksBefore + Math.max(0, player.arcWeek),
    })),
  ].sort((left, right) => (
    right.composite - left.composite
    || right.serviceWeeks - left.serviceWeeks
    || left.person.localeCompare(right.person)
  ));

  const pool = rows.length;
  const going = Math.min(Math.max(cut, 0), pool);
  const cutFrom = pool - going + 1;
  const position = rows.findIndex((row) => row.person === COMPANY_IDS.player) + 1;
  const others = rows.filter((row) => row.person !== COMPANY_IDS.player);

  return {
    rows: Object.freeze(rows),
    position,
    cutFrom,
    cut: going,
    pool,
    inTheCut: position >= cutFrom,
    player: playerRow,
    line: others[pool - going - 1]?.composite ?? null,
  };
}

/**
 * The sentence the criteria screen shows all through the consultation, and the
 * one the review prints beside the verdict.
 *
 * It says the four things the player is owed and it says them in the order
 * they would ask: how many go, where you are, what you are being scored on,
 * and who is immediately above you. The last of those is the whole difference
 * between a ranking and a curve - the player is never playing against a
 * percentile of an invisible population, they are playing against Owen, who
 * does the late shift and has one line on his file.
 */
export function matrixSummary(
  standing: Readonly<PoolStanding>,
  nameOf: (person: string) => string,
): string {
  const place = `${String(standing.position)} of ${String(standing.pool)}`;
  const scored = `Your line reads ${String(standing.player.performance)} for `
    + `the week, ${String(standing.player.conduct)} for the file and `
    + `${String(standing.player.service)} for service, which comes to `
    + `${String(standing.player.composite)}.`;
  const above = standing.rows[standing.position - 2];
  const below = standing.rows[standing.position];
  const neighbour = standing.inTheCut
    ? above === undefined
      ? 'There is nobody above you.'
      : `${nameOf(above.person)} is one place above you on `
        + `${String(above.composite)}.`
    : below === undefined
      ? 'There is nobody below you.'
      : `${nameOf(below.person)} is one place below you on `
        + `${String(below.composite)}.`;

  return `${String(standing.cut)} of ${String(standing.pool)} roles go, and `
    + `you are ${place} on the matrix. ${scored} ${neighbour} `
    + (standing.inTheCut
      ? 'On today\'s numbers you are in the two.'
      : 'On today\'s numbers you are not in the two.');
}
