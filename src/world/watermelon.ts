/**
 * THE WATERMELON (0.30.0, slice 3): green on the outside, red in the middle.
 *
 * The single most recognisable thing in the projects research, and it has a
 * name in the trade because it happens everywhere: "a watermelon is green on
 * the outside and red in the middle", and the reason it happens is that
 * "honesty has been made personally expensive" - teams "too frightened of the
 * consequences to mark themselves Red", right up until "a collection of
 * supposedly healthy projects came apart all at once"
 * (`docs/research/titles-projects-engine.md` 5.5).
 *
 * The mechanic is the timesheet's claim/record split said again about a
 * project, and it is built the same way on purpose:
 *
 *  - the TRUTH is `world/project.ts`, derived every time anybody asks, from
 *    what the work actually left behind. Nothing in this module can move it and
 *    nothing in this module is consulted to find it.
 *  - the CLAIM is a colour, on the player's own node, with the day it was said
 *    on. It is what the business has.
 *  - the CONSEQUENCE is a function of the two of them TOGETHER, computed the
 *    morning the slip goes public. There is no third record: nothing anywhere
 *    stores "the project was fine when they said it was", because the plan's
 *    dates were baked at kickoff and the derivation can still read them.
 *
 * The asymmetry is the whole joke and it is the sourced one. Saying RED is
 * answered immediately, by the org, in the way orgs answer red: a manager, some
 * pressure, and a meeting about the meeting. Saying GREEN costs nothing today -
 * nothing at all, ever, if the project lands - and the morning a phase misses
 * its date with a green standing, the question is not "why is it late" but "why
 * did you say it wasn't".
 *
 * Pure. Nothing here mutates, dispatches, reads a wall clock or rolls anything.
 */

import { dayForTick } from './hours';
import {
  PROJECT_PHASE_LABELS,
  type ProjectPhase,
  type ProjectStatus,
} from './project';

/* -- the colour ----------------------------------------------------------- */

export const PROJECT_RAG = ['green', 'amber', 'red'] as const;

export type ProjectRag = (typeof PROJECT_RAG)[number];

export const RAG_LABELS: Readonly<Record<ProjectRag, string>> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
};

export function isProjectRag(value: string): value is ProjectRag {
  return PROJECT_RAG.some((rag) => rag === value);
}

/* -- what the plan actually says ------------------------------------------ */

/**
 * An hour of working time: where a phase stops being "later" and starts being
 * today's problem.
 *
 * One shift is eight of these. It is the number the Projects board has drawn
 * its TIGHT state at since 0.29.0, and it lives here now so that the board and
 * the honest colour cannot come to different conclusions about the same phase -
 * a watermelon whose "true" colour disagreed with the screen the player is
 * looking at would not be a watermelon, it would be a bug.
 */
export const TIGHT_MINUTES = 60;

export type ProjectSlip = 'done' | 'ahead' | 'tight' | 'late';

/**
 * How much trouble a phase is in, off the date and the clock and nothing else.
 *
 * `done` is not trouble whatever the date says: a phase somebody finished is
 * finished, and a board that kept shouting about a date already met is a board
 * nobody reads the rest of.
 */
export function slipFor(
  input: Readonly<{ done: boolean; late: boolean; minutesLeft: number }>,
): ProjectSlip {
  if (input.done) {
    return 'done';
  }

  if (input.late) {
    return 'late';
  }

  return input.minutesLeft <= TIGHT_MINUTES ? 'tight' : 'ahead';
}

/**
 * The colour an honest report would carry, derived - never stored, and never
 * the thing the player files.
 *
 * It exists so the game can say, out loud and from the records, what the plan
 * said at the minute somebody typed something else.
 */
export function honestRag(slip: ProjectSlip): ProjectRag {
  return slip === 'late' ? 'red' : slip === 'tight' ? 'amber' : 'green';
}

/** The honest colour for a project status, in one call. */
export function honestRagFor(status: Readonly<ProjectStatus>): ProjectRag {
  return honestRag(slipFor({
    done: status.complete,
    late: status.late,
    minutesLeft: status.minutesLeft,
  }));
}

/* -- the claim ------------------------------------------------------------ */

const SEPARATOR = '|';

export interface StatusReport {
  readonly day: number;
  readonly rag: ProjectRag;
  /** The minute it was filed, which is what the question quotes back. */
  readonly tick: number;
}

export function encodeReport(report: Readonly<StatusReport>): string {
  return [String(report.day), report.rag, String(report.tick)].join(SEPARATOR);
}

function decodeReport(line: string): StatusReport | null {
  const parts = line.split(SEPARATOR);

  if (parts.length !== 3) {
    return null;
  }

  const [stamp, rag, said] = parts;
  const day = stamp === undefined || stamp.length === 0
    ? Number.NaN
    : Number(stamp);
  const tick = said === undefined || said.length === 0
    ? Number.NaN
    : Number(said);

  if (
    rag === undefined
    || !isProjectRag(rag)
    || !Number.isSafeInteger(day)
    || day < 1
    || !Number.isSafeInteger(tick)
    || tick < 0
  ) {
    return null;
  }

  return { day, rag, tick };
}

export function reportsFrom(value: unknown): readonly StatusReport[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeReport)
      .filter((report): report is StatusReport => report !== null),
  );
}

/**
 * The ledger with today's report written into it, replacing any earlier one for
 * the same day.
 *
 * Replacing rather than appending because a status report is a STATEMENT: file
 * amber at ten and red at four and what went to the business on that day is
 * red. What is kept is one colour per day, which is what a weekly report is -
 * and every day of it is kept, because the question that arrives on the Friday
 * is about the Tuesday.
 */
export function withReport(
  existing: unknown,
  report: Readonly<StatusReport>,
): string {
  return [...reportsFrom(existing).filter((line) => line.day !== report.day), report]
    .sort((left, right) => left.day - right.day)
    .map(encodeReport)
    .join('\n');
}

/** What the business was told about a day, or null when nobody said anything. */
export function reportForDay(
  reports: readonly Readonly<StatusReport>[],
  day: number,
): StatusReport | null {
  return reports.find((report) => report.day === day) ?? null;
}

/** The last thing anybody was told, whenever that was. */
export function latestReport(
  reports: readonly Readonly<StatusReport>[],
): StatusReport | null {
  return reports.reduce<StatusReport | null>(
    (latest, report) =>
      latest === null || report.day >= latest.day ? report : latest,
    null,
  );
}

/* -- what the org owes an answer to --------------------------------------- */

export const WATERMELON_BEATS = ['red_answered', 'green_questioned'] as const;

export type WatermelonBeat = (typeof WATERMELON_BEATS)[number];

export interface WatermelonDue {
  readonly beat: WatermelonBeat;
  /** The report being answered. */
  readonly report: StatusReport;
  /** Where the project actually is, this minute. */
  readonly phase: ProjectPhase;
  /** The date it has missed, for the beat that is about a missed date. */
  readonly due: number | null;
}

/** The key a settled beat is written down under: one answer per report. */
export function beatKey(beat: WatermelonBeat, day: number): string {
  return `${beat}@${String(day)}`;
}

export function answeredBeats(value: unknown): ReadonlySet<string> {
  return new Set(
    typeof value === 'string' && value.length > 0
      ? value.split('\n').filter((line) => line.length > 0)
      : [],
  );
}

export function withAnsweredBeat(existing: unknown, key: string): string {
  const kept = [...answeredBeats(existing)];
  return kept.includes(key) ? kept.join('\n') : [...kept, key].join('\n');
}

/**
 * What the org is due to say this morning about what it was told - a pure
 * "what is due right now" read on the `fallout.ts` rail, exactly like
 * `screamTestDue`, and settled in the same place.
 *
 * TWO BEATS, and the asymmetry between them IS the mechanic:
 *
 *  - RED, ANSWERED. A red filed yesterday is answered this morning the way orgs
 *    answer red. It is not a punishment - nothing is charged - it is a manager,
 *    a bit of pressure, and a meeting about the meeting, which is the cost of
 *    telling the truth and the reason nobody does.
 *  - GREEN, QUESTIONED. A green stands, and a phase has now missed a date that
 *    was baked at kickoff, and the miss happened on a day that is over - so it
 *    is public. The question is grounded in both records at once and reads out
 *    both: the colour, with the day it was said on, and the date, with the day
 *    it went past. There is no stored "was it really fine" anywhere: the plan's
 *    dates are still on the node and the derivation still reads them, which is
 *    precisely why the second copy this mechanic could have had does not exist.
 *
 * The morning rather than the minute, for the reason every settler in this game
 * uses the morning: a day is how long it takes somebody else to notice.
 */
export function watermelonDue(
  status: Readonly<ProjectStatus> | null,
  reports: readonly Readonly<StatusReport>[],
  answered: ReadonlySet<string>,
  now: number,
): readonly WatermelonDue[] {
  if (status === null) {
    return [];
  }

  const today = dayForTick(now);
  const due: WatermelonDue[] = [];

  for (const report of reports) {
    if (report.day >= today) {
      continue;
    }

    if (report.rag === 'red'
      && !answered.has(beatKey('red_answered', report.day))) {
      due.push({
        beat: 'red_answered',
        report,
        phase: status.phase,
        due: status.due,
      });
    }
  }

  // And the other half, which is not per-report but per-SLIP: one question,
  // about the last green that was standing when the date went past.
  const missed = status.due;
  const publiclyLate = status.late
    && missed !== null
    && dayForTick(missed) < today;

  if (!publiclyLate) {
    return Object.freeze(due);
  }

  const green = reports
    .filter((report) => report.rag === 'green'
      && report.day <= dayForTick(missed)
      && !answered.has(beatKey('green_questioned', report.day)))
    .reduce<StatusReport | null>(
      (latest, report) =>
        latest === null || report.day >= latest.day ? report : latest,
      null,
    );

  if (green !== null) {
    due.push({
      beat: 'green_questioned',
      report: green,
      phase: status.phase,
      due: missed,
    });
  }

  return Object.freeze(due);
}

/* -- how it reads --------------------------------------------------------- */

/** The beat, in the words the org would actually use. */
export function watermelonLines(
  entry: Readonly<WatermelonDue>,
): readonly string[] {
  const phase = PROJECT_PHASE_LABELS[entry.phase];

  if (entry.beat === 'red_answered') {
    return [
      `You put the edge replacement in as RED on day ${
        String(entry.report.day)
      }.`,
      'Delivery would like half an hour on it, and then another half an hour '
        + 'with the account side on the call, and then a short one tomorrow to '
        + 'agree what to say to the client. Nothing about '
        + `${phase.toLowerCase()} changes in any of them.`,
      'Nobody is annoyed with you. That is the part that takes the longest to '
        + 'get used to: it is not a telling-off, it is three meetings.',
    ];
  }

  return [
    `The ${phase.toLowerCase()} went past its date on day ${
      String(dayForTick(entry.due ?? 0))
    }, and the client has noticed before we did.`,
    `The status report for day ${String(entry.report.day)} says GREEN.`,
    'The question in the room is not why it is late. It is why you said it '
      + 'was not.',
  ];
}

/** Where the two records disagree, printed side by side. */
export function watermelonReadout(
  status: Readonly<ProjectStatus> | null,
  reports: readonly Readonly<StatusReport>[],
  today: number,
): readonly string[] {
  if (status === null) {
    return [];
  }

  const honest = honestRagFor(status);
  const filed = reportForDay(reports, today);

  return [
    `  Reported today: ${
      filed === null ? 'nothing filed' : RAG_LABELS[filed.rag].toUpperCase()
    }`,
    `  The plan says:  ${RAG_LABELS[honest].toUpperCase()}`,
  ];
}
