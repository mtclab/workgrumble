/**
 * The weather, and the paperwork it arrives with.
 *
 * Everything in `conduct.ts` is about a file somebody keeps on you and the
 * three people who might one day have a reason to open it. This is the other
 * half of the same finding, and it is the half that actually ends most
 * first-line jobs: the reason to look was not something you did. A client went
 * quiet. A quarter went badly. Somebody bought the company. The file is still
 * read, the numbers are still read, and the question stops being "was this
 * person good enough" and becomes "who is easiest to justify losing".
 *
 * `docs/research/review-scoring.md` section 2.6 is where this comes from and
 * it is worth being precise about why this layer is buildable at all: the law
 * REQUIRES the systemic case to be legible. A redundancy selection matrix is a
 * published table of criteria - skills, performance, attendance, disciplinary
 * record, length of service - scored across a named pool. Collective
 * consultation is a statutory thirty days before the first dismissal for
 * twenty to ninety-nine roles, forty-five for a hundred or more, with a form
 * HR1 on the same timetable. So the sequence a first-line worker actually
 * experiences is: something in the air, then an announcement with a number and
 * a date in it, then a window in which nothing is decided and everybody is
 * polite, then the conversation. Redundancy is the most heavily telegraphed
 * thing that happens in a working life, and anything this game does here that
 * is not telegraphed is LESS realistic rather than more dramatic.
 *
 * Three things live here and nothing else does:
 *
 * - THE CATALOGUE. Nine entries, as data: what each one looks like from a
 *   first-line chair, the four signals it has to fire before it may change
 *   anything, and what it does mechanically. One of them is implemented; the
 *   other eight are written down with `implemented: false` and the arc
 *   validator refuses to schedule them, which is the difference between a
 *   catalogue and eight dead code paths.
 * - THE ARC. A career is a table of weeks the same way a week is a table of
 *   days, and the pacing rules are enforced by its loader: nothing in the
 *   probation week, two quiet weeks before the first thing happens, one season
 *   per employer, never two live at once, two clear weeks after each one is
 *   resolved. An arc BELONGS TO ONE SHOP and says which - the season on it is
 *   that shop's content, narrated by that shop's cast, and a building that has
 *   authored none runs the same twelve weeks with nothing on them.
 * - THE FOUR-BEAT CONTRACT. Weather, notice, criteria, decision - in that
 *   order, each inspectable, and `telegraph` is the only way to obtain the
 *   type the decision function will accept. A future entry cannot skip a beat
 *   because it cannot be scheduled without all four, and a caller cannot skip
 *   the check because there is no other way to make the argument.
 *
 * Nothing here touches the DOM, dispatches, reads the time of day, or consumes
 * the simulation RNG. No trigger in this game is a die roll: the determinism
 * gate forbids it and legibility forbids it twice.
 */

import { arcCalendarDay, calendarDate, DAYS_PER_CALENDAR_WEEK } from './hours';
import { matrixSummary, type PoolStanding } from './pool';
import { WEEK_DAYS } from './week';

/* -- the catalogue --------------------------------------------------------- */

export const PRESSURE_IDS = [
  'client_loss',
  'downturn',
  'new_leadership',
  'redundancy_round',
  'downsizing',
  'bad_decisions',
  'merger',
  'contract_win',
  'outsourcing',
] as const;

export type PressureId = (typeof PRESSURE_IDS)[number];

/**
 * Which way an entry can go for the person in the chair.
 *
 * Six of the nine cut BOTH ways, and that is a design constraint rather than
 * an observation: a catalogue of threats only is a misery simulator, and a
 * career arc that never contains a piece of weather the player ends up better
 * for is a game about being rained on. A merger is a threat and a promotion
 * case. Fewer hands is more visible and more valuable. A tool migration
 * punishes everybody and rewards whoever adapts first.
 */
export const PRESSURE_CUTS = ['threat', 'both'] as const;

export type PressureCuts = (typeof PRESSURE_CUTS)[number];

/**
 * What an entry DOES, as a kind rather than as prose, so that the arc loader
 * can refuse to schedule a kind this build has not implemented.
 *
 * Exactly one of these is implemented, and it is the one that carries the
 * model: `positional_bar` replaces the fixed pass mark with a place in a
 * ranking, which is the only mechanism in the game with no absolute number in
 * it to inflate.
 */
export const PRESSURE_EFFECTS = [
  'positional_bar',
  'roster_shrinks',
  'roster_grows',
  'share_rises',
  'bar_rises',
  'tooling_degrades',
  'employer_changes',
] as const;

export type PressureEffect = (typeof PRESSURE_EFFECTS)[number];

/** The four beats, in the order they are allowed to happen in. */
export const PRESSURE_BEATS = [
  'weather',
  'notice',
  'criteria',
  'decision',
] as const;

export type PressureBeat = (typeof PRESSURE_BEATS)[number];

/**
 * What the player is told, per beat, in the fiction's own words.
 *
 * All four are required of every entry in the catalogue, including the eight
 * nobody has implemented, because the entry is not a plan until somebody has
 * written down what it would LOOK like - and the most authentic signal in the
 * whole table is a manager suddenly asking for ticket statistics by analyst,
 * which is a sentence rather than a mechanic.
 */
export type PressureSignals = Readonly<Record<PressureBeat, string>>;

export interface PressureEntry {
  readonly id: PressureId;
  /** What an all-staff mail would call it. */
  readonly title: string;
  /** What it looks like from a first-line chair, before anybody explains it. */
  readonly chairView: string;
  readonly signals: PressureSignals;
  /** What it changes about the game, in one sentence. */
  readonly changes: string;
  readonly effect: PressureEffect;
  readonly cuts: PressureCuts;
  /**
   * Whether this build can actually run it.
   *
   * Written down rather than implied by the absence of code, because the arc
   * loader reads it: an arc that schedules an entry nobody has implemented is
   * a boot failure rather than a season in which nothing happens.
   */
  readonly implemented: boolean;
}

/**
 * The nine, as the research lists them, in the order it lists them.
 *
 * The recurring truth across the table, and the honest joke: THE WORKLOAD
 * NEVER SHRINKS WITH THE HEADCOUNT. Every entry either raises the denominator,
 * lowers the number of hands, or moves the bar - and exactly one of them
 * (client loss) reduces the actual work.
 */
export const PRESSURE_CATALOGUE: readonly PressureEntry[] = validateCatalogue([
  {
    id: 'client_loss',
    title: 'The account nobody mentions any more',
    chairView: 'The queue from one account thins, and then stops. The people '
      + 'you knew there stop replying, and nobody says why.',
    signals: {
      weather: 'A thread with that account in it goes quiet. Nothing is '
        + 'announced, and a monthly usage report is requested by somebody who '
        + 'has never asked for one.',
      notice: 'An account manager comes down here, which has not happened '
        + 'before, and names the date the contract ends.',
      criteria: 'The desk is funded per seat, and there are fewer seats. What '
        + 'gets read is who the remaining seats need.',
      decision: 'The headcount the desk is funded for, held against the '
        + 'headcount it has.',
    },
    changes: 'Removes a slice of the roster and lowers the headcount the desk '
      + 'is paid for, which raises the comparative bar without raising any '
      + 'number the player can see.',
    effect: 'roster_shrinks',
    cuts: 'threat',
    implemented: false,
  },
  {
    id: 'downturn',
    title: 'Cost discipline',
    chairView: 'Nothing is bought. Licences are not renewed and the ageing '
      + 'estate stays exactly as ageing as it is.',
    signals: {
      weather: 'A requisition comes back unsigned. Somebody in Accounts uses '
        + 'the phrase "for now" twice in one mail.',
      notice: 'A cost-discipline mail with a date on it: no new licences this '
        + 'quarter, and the quarter is named.',
      criteria: 'The same work, through the routes that do not cost anything.',
      decision: 'What the desk got through without buying its way out of it.',
    },
    changes: 'Closes the fix paths that cost money - a licence, a replacement '
      + 'machine - so more tickets need the harder route.',
    effect: 'bar_rises',
    cuts: 'threat',
    implemented: false,
  },
  {
    id: 'new_leadership',
    title: 'A new lead, with a mandate',
    chairView: 'Somebody who does not know you, and who likes to be seen '
      + 'saving money.',
    signals: {
      weather: 'A consultant with a lanyard nobody recognises is shown the '
        + 'floor by somebody walking too fast.',
      notice: 'An introduction mail with the word "efficiencies" in it, and a '
        + 'request for ticket statistics by analyst, by a date.',
      criteria: 'Statistics by analyst, read by somebody who was not here '
        + 'when they were earned.',
      decision: 'The numbers, without the person who watched you make them.',
    },
    changes: 'Discounts the latitude the player has accumulated, because '
      + 'idiosyncrasy credit is held by the OBSERVERS and the observer has '
      + 'been replaced. The bar rises - and so does the value of a file the '
      + 'new lead has never read.',
    effect: 'bar_rises',
    cuts: 'both',
    implemented: false,
  },
  {
    id: 'redundancy_round',
    title: 'A proposed reduction in roles',
    chairView: 'An all-staff mail with a number in it and a date. Then a '
      + 'fixed window in which nothing is decided and everybody is polite.',
    signals: {
      weather: 'A budget line in a mail nobody was meant to read all of, and '
        + 'a meeting in the room with the blind down.',
      notice: 'The announcement: a proposed reduction of a named number of '
        + 'roles, a named selection pool, and the date consultation closes.',
      criteria: 'The selection matrix, published: performance, disciplinary '
        + 'record and length of service, scored across the pool, with your own '
        + 'line on it and everybody else\'s beside it.',
      decision: 'The ranking, read out, with the reasons printed beside it.',
    },
    changes: 'Replaces the fixed pass mark with a POSITION: a number of roles '
      + 'go from a named pool, scored on the matrix, and surviving means being '
      + 'harder to justify losing than the person at the next desk.',
    effect: 'positional_bar',
    cuts: 'threat',
    implemented: true,
  },
  {
    id: 'downsizing',
    title: 'The reorganisation',
    chairView: 'Six on the floor becomes four. The queue does not become '
      + 'four-sixths of a queue.',
    signals: {
      weather: 'A leaving-do for somebody whose replacement is not mentioned.',
      notice: 'An org-chart mail and a rota change, both dated.',
      criteria: 'The share of the queue each remaining pair of hands carries.',
      decision: 'Whether the desk held, on the hands it had left.',
    },
    changes: 'Raises the player\'s share of what arrives - the honest '
      + 'difficulty increase, and precisely the one a normalised mark measures '
      + 'correctly and an absolute score does not.',
    effect: 'share_rises',
    cuts: 'both',
    implemented: false,
  },
  {
    id: 'bad_decisions',
    title: 'The migration',
    chairView: 'Your tools change mid-week. The knowledge base is wrong. '
      + 'Tickets arrive for a system you have no article on.',
    signals: {
      weather: 'A project mail with a go-live date in it, sent to everybody, '
        + 'about a thing nobody at this end was asked about.',
      notice: 'Twenty minutes of training, a PDF, and a countdown nobody '
        + 'asked for.',
      criteria: 'Who is still closing things on the new tool.',
      decision: 'Adaptation, measured as though it were competence.',
    },
    changes: 'Degrades the tooling for a period - coverage gaps in the KB, an '
      + 'app replaced by a worse one, actions relocated - and degrades it for '
      + 'the NPCs too, so the pool moves with the player.',
    effect: 'tooling_degrades',
    cuts: 'both',
    implemented: false,
  },
  {
    id: 'merger',
    title: 'The acquisition',
    chairView: 'Two ticket systems, two estates, and two of everybody.',
    signals: {
      weather: 'Rumour in chat, and two logos on the intranet page nobody '
        + 'maintains.',
      notice: 'The announcement mail, a town-hall invite, and a '
        + 'data-migration notice with a date.',
      criteria: 'Duplication first, because that is where the saving is - and '
        + 'then who knows how the legacy estate actually works.',
      decision: 'Which of the two of you the integration keeps.',
    },
    changes: 'The largest of the nine: a second estate, a second ticket '
      + 'family, and duplicate roles - which is what makes the comparative '
      + 'question sharp. Legacy knowledge is retention-positive, so this one '
      + 'can be a promotion.',
    effect: 'employer_changes',
    cuts: 'both',
    implemented: false,
  },
  {
    id: 'contract_win',
    title: 'The win',
    chairView: 'Congratulations. Here are four hundred more users, on the '
      + 'same rota, from the fourteenth.',
    signals: {
      weather: 'A bid team seen in the good meeting room three days running.',
      notice: 'A celebratory all-staff mail, and an onboarding plan with a '
        + 'date on it.',
      criteria: 'The same service levels, over rather more of everything.',
      decision: 'Whether the desk absorbed it, and who did the absorbing.',
    },
    changes: 'Grows the roster sharply for a period with the service levels '
      + 'unchanged. Under a normalised mark that is honest difficulty; under '
      + 'an absolute score it would have been free points.',
    effect: 'roster_grows',
    cuts: 'both',
    implemented: false,
  },
  {
    id: 'outsourcing',
    title: 'The transition',
    chairView: 'A supplier\'s people shadow you for a week, and then ask you '
      + 'to document your job.',
    signals: {
      weather: 'Time-and-motion observers with clipboards, introduced as '
        + 'being from Head Office.',
      notice: 'A request for ticket volumes by category, and a knowledge '
        + 'transfer workshop in the diary, with a date.',
      criteria: 'Who the supplier needs on the first morning they own this.',
      decision: 'Which desk you are sitting at afterwards, and whose badge '
        + 'opens the door to it.',
    },
    changes: 'Ends the job by TRANSFER rather than by dismissal - continuity '
      + 'of service, terms intact - which is the on-ramp to employer '
      + 'switching. The person who knows the estate is the one the supplier '
      + 'keeps.',
    effect: 'employer_changes',
    cuts: 'both',
    implemented: false,
  },
]);

/**
 * Load-time gate for the catalogue.
 *
 * An entry with a beat missing is the only kind of broken this table can be
 * that nobody would see: the arc would schedule it, the four-beat contract
 * would refuse it at the decision, and the season would pass in silence with
 * nothing having happened. So it is refused here, at boot, in the file.
 */
export function validateCatalogue(
  entries: readonly PressureEntry[],
): readonly PressureEntry[] {
  const seen = new Set<PressureId>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`The pressure catalogue lists "${entry.id}" twice.`);
    }

    seen.add(entry.id);

    if (entry.title.trim().length === 0 || entry.chairView.trim().length < 20) {
      throw new Error(
        `"${entry.id}" has no chair view. An entry nobody has described from `
        + 'the chair is a spreadsheet row rather than a thing that happens to '
        + 'somebody.',
      );
    }

    if (entry.changes.trim().length < 20) {
      throw new Error(
        `"${entry.id}" does not say what it changes mechanically.`,
      );
    }

    for (const beat of PRESSURE_BEATS) {
      if (entry.signals[beat].trim().length < 20) {
        throw new Error(
          `"${entry.id}" has no ${beat} signal. Four beats or no effect: an `
          + 'event the player cannot see coming may not change an outcome, '
          + 'and one that cannot be described cannot be shown.',
        );
      }
    }
  }

  for (const id of PRESSURE_IDS) {
    if (!seen.has(id)) {
      throw new Error(`The pressure catalogue is missing "${id}".`);
    }
  }

  return Object.freeze(entries.map((entry) => Object.freeze({
    ...entry,
    signals: Object.freeze({ ...entry.signals }),
  })));
}

export function findPressure(id: string): PressureEntry | undefined {
  return PRESSURE_CATALOGUE.find((entry) => entry.id === id);
}

/** The entries that can leave the player better off. Six of the nine. */
export function cutsBothWays(): readonly PressureEntry[] {
  return PRESSURE_CATALOGUE.filter((entry) => entry.cuts === 'both');
}

/* -- the season ------------------------------------------------------------ */

/**
 * One piece of weather, placed on the career arc: which entry, and the week
 * each of its four beats lands in.
 *
 * Weeks rather than minutes, because a season is not a day's schedule. The
 * shape the research asks for is quiet, weather, notice, consultation,
 * decision, quiet - five or six weeks with the middle three carrying the
 * tension - and the player is meant to feel the season turn, which is a
 * different sensation from being rained on.
 */
export interface PressureSeason {
  readonly id: PressureId;
  /** Ambient, no numbers, costs nothing, changes nothing. */
  readonly weather: number;
  /** Named, dated, with a number in it. The statutory shape. */
  readonly notice: number;
  /** The consultation window: the matrix is on screen and standings move. */
  readonly criteriaFrom: number;
  readonly criteriaTo: number;
  /** The week the conversation on Friday reads a ranking. */
  readonly decision: number;
  /** How many roles go, and out of how many people. */
  readonly cut: number;
  readonly pool: number;
  /** The mail threads the two announcement beats actually arrive as. */
  readonly weatherThread: string;
  readonly noticeThread: string;
}

/**
 * An employer, as a length and a list of seasons.
 *
 * One employer is eight to twelve weeks of work with one season of pressure in
 * it and the rest is the job. This is the table the pacing rules are enforced
 * against, and it is one level up from `WEEK` in exactly the way the research
 * says it should be: `WEEK` is a table of days with beats on them, and this is
 * a table of weeks with beats on them.
 */
export interface EmployerArc {
  /**
   * WHOSE arc this is, by employer id - the one seam a season's ownership
   * hangs on (#59a).
   *
   * It was the shop's display name until 0.36.0, which is a field nothing read
   * and which let all four employers point at one arc: the round then fired at
   * every building, narrated by five colleagues who work at exactly one of
   * them. An id instead, checked against the registry at load
   * (`employers.ts`), so "which shop does this season belong to" has one
   * answer that the surfaces, the mail and the telegraph gate all read.
   */
  readonly employer: string;
  /** How many weeks this employer lasts. */
  readonly weeks: number;
  readonly seasons: readonly PressureSeason[];
}

/** The week the player is hired into, which carries nothing by rule. */
export const PROBATION_WEEK = 1;

/**
 * How many quiet weeks have to pass before the first beat of any season.
 *
 * Two, after the probation week - so the earliest anything may happen is week
 * four. A redundancy round means nothing to somebody who has no baseline: the
 * player has to have had a normal week before an abnormal one can read as one.
 */
export const QUIET_WEEKS_BEFORE = 2;

/**
 * And after. Recovery is not a random variable - it is scheduled, and it is
 * scheduled here rather than being left to a probability, because the whole
 * failure mode this layer has is becoming a random-disaster generator.
 */
export const QUIET_WEEKS_AFTER = 2;

/**
 * The shortest a notice may be, in days.
 *
 * Thirty, taken from collective consultation, where twenty to ninety-nine
 * proposed redundancies require consultation to start at least thirty days
 * before the first dismissal (Acas; GOV.UK). A round of two out of six does
 * not meet that threshold and therefore has no statutory minimum of its own -
 * which makes it exactly the case where a game could be less legible than the
 * law and get away with it. It is held to the collective figure anyway, and
 * the arc loader enforces it, because a game may not be harder to see coming
 * than employment law.
 */
export const NOTICE_DAYS_MINIMUM = 30;

/**
 * Calendar days in a week. The working week is five; the calendar is seven.
 *
 * It moved down to `hours.ts` in 0.39.0, where the wall calendar lives and
 * where the month-end freeze also has to ask it, and it is re-exported from
 * here because this is the module the arc's own readers ask about the arc.
 * One constant, two doors, no second answer.
 */
export { DAYS_PER_CALENDAR_WEEK };

/**
 * The mail the two announcement beats arrive as.
 *
 * Ids rather than threads: `mail/threads.ts` imports these, so a season cannot
 * name a thread nobody wrote, and `mail/index.ts` refuses to load an inbox
 * that is missing one.
 */
export const PRESSURE_MAIL = Object.freeze({
  weather: 'mail/round-weather',
  notice: 'mail/round-notice',
});

/**
 * The season this employer actually gets, and the numbers in it.
 *
 * Two roles from a pool of six, which is the size the research asks for -
 * small, named and inspectable - because the failure mode of comparative
 * survival is forced ranking, and the fix for forced ranking is the same as
 * the real one: keep the pool small, name everybody in it, and make the
 * criteria things the player controls.
 *
 * Week four is the earliest the pacing rules allow anything at all, so that is
 * where the weather sits: two weeks of it, with nothing in them but a budget
 * line and a closed door. The announcement is week six, the consultation runs
 * from week seven right up to the week it is decided in, and the conversation
 * is on the Friday of week ten - which is thirty-two calendar days after the
 * announcement went out, and therefore over the collective-consultation floor
 * rather than under it. Weeks eleven and twelve are quiet by construction.
 *
 * Quiet, weather, notice, consultation, decision, quiet: the player should be
 * able to feel the season turn, which is a different sensation from being
 * rained on.
 */
export const REDUNDANCY_ROUND: PressureSeason = {
  id: 'redundancy_round',
  weather: 4,
  notice: 6,
  criteriaFrom: 7,
  criteriaTo: 9,
  decision: 10,
  cut: 2,
  pool: 6,
  weatherThread: PRESSURE_MAIL.weather,
  noticeThread: PRESSURE_MAIL.notice,
};

/**
 * How long a job is, in weeks, at every shop this build ships.
 *
 * One number rather than one per employer, because a seasonless arc is the
 * SAME arc with nothing on it: the weeks climb, the generator draws, the
 * review fires, and the only thing a shop without authored weather is missing
 * is the weather. An arc that also got shorter would be a second difference
 * nobody asked for, and `stayAnotherWeek` reads this to know when the job is
 * over.
 */
export const ARC_WEEKS = 12;

/**
 * The probation shop's arc, and the only one in this build with a season on it.
 *
 * The id is written here as a literal because `employers.ts` imports this file
 * and cannot be imported back, and it is not left to trust: the registry
 * refuses at load to hand out an employer whose arc names a different shop, so
 * a typo here is a boot failure rather than a season that belongs to nobody.
 */
export const EMPLOYER_ARC: EmployerArc = validateArc({
  employer: 'workgrumble',
  weeks: ARC_WEEKS,
  seasons: [REDUNDANCY_ROUND],
});

/**
 * The same twelve weeks, at a shop that has not authored any weather yet.
 *
 * This is the whole of #59a's fix stated as a value. The redundancy round is
 * Workgrumble's - its pool IS that building's five colleagues, its two
 * announcements are written in that building's Finance and HR voices - and a
 * shared arc fired it at the haulage firm, the MSP and the corporate desk as
 * well, where `pressureSummary` narrated a round through people who do not
 * exist and `readTheMatrix` could end a career on it.
 *
 * A seasonless arc is not a switched-off one: `arcWeek` still climbs, the week
 * generator still draws, the Friday still reviews, `stayAnotherWeek` still
 * counts down to the offer. What a shop with no season has is no weather, no
 * notice, no matrix and no round - which is the truthful reading of a building
 * whose content nobody has written yet, and is exactly what the other three
 * shops have shipped all along in every place except this one.
 *
 * It goes through `validateArc` like the authored one: an empty season list is
 * a list the pacing rules have nothing to say about, and running it through
 * the same loader is what makes that a fact rather than an assumption.
 */
export function seasonlessArc(employer: string): EmployerArc {
  return validateArc({ employer, weeks: ARC_WEEKS, seasons: [] });
}

/**
 * Load-time gate for a career arc: the pacing rules, as refusals.
 *
 * Every one of these is a rule the research states and none of them can be
 * checked by playing, because the thing they forbid is a season that felt
 * wrong six weeks later. They are written as a general check over a LIST of
 * seasons rather than as five assertions about the one that ships, so an arc
 * with two seasons on it is checked for overlap and for the quiet between
 * them by the code that already exists rather than by whoever adds the second.
 */
export function validateArc(arc: Readonly<EmployerArc>): EmployerArc {
  if (!Number.isSafeInteger(arc.weeks) || arc.weeks < 1) {
    throw new Error('An employer arc is a whole number of weeks, at least 1.');
  }

  // One per employer arc, sized to the arc. A merger and a redundancy round in
  // the same month is real life and is unplayable.
  if (arc.seasons.length > 1) {
    throw new Error(
      `"${arc.employer}" schedules ${String(arc.seasons.length)} seasons. One `
      + 'employer gets one season of pressure and the rest is the job.',
    );
  }

  const spans: { readonly from: number; readonly to: number }[] = [];

  for (const season of arc.seasons) {
    const entry = findPressure(season.id);

    if (entry === undefined) {
      throw new Error(`"${season.id}" is not in the pressure catalogue.`);
    }

    if (!entry.implemented) {
      throw new Error(
        `"${season.id}" is written down but not built. Scheduling it would be `
        + 'a season in which the mail arrives, the date passes and nothing '
        + 'happens.',
      );
    }

    const beats: readonly [PressureBeat, number][] = [
      ['weather', season.weather],
      ['notice', season.notice],
      ['criteria', season.criteriaFrom],
      ['decision', season.decision],
    ];

    let previous = 0;

    for (const [beat, week] of beats) {
      if (!Number.isSafeInteger(week) || week < 1) {
        throw new Error(`"${season.id}" puts its ${beat} outside any week.`);
      }

      if (week <= PROBATION_WEEK) {
        throw new Error(
          `"${season.id}" puts its ${beat} in the probation week. The `
          + 'probation week carries none: pressure without a baseline is '
          + 'noise, and the five days are the tutorial for the social layer.',
        );
      }

      if (week <= previous) {
        throw new Error(
          `"${season.id}" fires its ${beat} in week ${String(week)}, which is `
          + 'not after the beat before it. Four beats, in order, or no effect.',
        );
      }

      previous = week;
    }

    if (season.criteriaTo < season.criteriaFrom
      || season.criteriaTo >= season.decision) {
      throw new Error(
        `"${season.id}" runs its consultation from week `
        + `${String(season.criteriaFrom)} to week ${String(season.criteriaTo)}`
        + ', which is not a window that closes before the decision.',
      );
    }

    if (season.weather < PROBATION_WEEK + QUIET_WEEKS_BEFORE + 1) {
      throw new Error(
        `"${season.id}" starts in week ${String(season.weather)}. The first `
        + `beat of a season waits ${String(QUIET_WEEKS_BEFORE)} quiet weeks `
        + 'after the probation week, so that somebody has a normal week to '
        + 'compare an abnormal one against.',
      );
    }

    if (season.notice - season.weather < 2) {
      throw new Error(
        `"${season.id}" announces itself ${String(season.notice - season.weather)}`
        + ' week(s) after the weather. Weather is two or more weeks out; it is '
        + 'the beat that makes an attentive player feel clever later, and one '
        + 'week is not enough to have been attentive in.',
      );
    }

    const days = (season.decision - season.notice) * DAYS_PER_CALENDAR_WEEK
      + (WEEK_DAYS - 1);

    if (days < NOTICE_DAYS_MINIMUM) {
      throw new Error(
        `"${season.id}" leaves ${String(days)} days between the announcement `
        + `and the conversation. The floor is ${String(NOTICE_DAYS_MINIMUM)}: `
        + 'a game may not be less legible than employment law.',
      );
    }

    if (season.decision + QUIET_WEEKS_AFTER > arc.weeks) {
      throw new Error(
        `"${season.id}" is decided in week ${String(season.decision)} of an `
        + `arc ${String(arc.weeks)} weeks long. A resolved season is followed `
        + `by ${String(QUIET_WEEKS_AFTER)} clear weeks, enforced by the `
        + 'scheduler rather than by a probability.',
      );
    }

    if (!Number.isSafeInteger(season.cut) || season.cut < 1
      || !Number.isSafeInteger(season.pool) || season.pool <= season.cut) {
      throw new Error(
        `"${season.id}" cuts ${String(season.cut)} from a pool of `
        + `${String(season.pool)}, which is not a round anybody survives.`,
      );
    }

    const span = {
      from: season.weather,
      to: season.decision + QUIET_WEEKS_AFTER,
    };

    for (const other of spans) {
      if (span.from <= other.to && other.from <= span.to) {
        throw new Error(
          `"${season.id}" is live at the same time as another season. At most `
          + 'one at a time, never two overlapping, and two clear weeks between.',
        );
      }
    }

    spans.push(span);
  }

  return Object.freeze({
    ...arc,
    seasons: Object.freeze(arc.seasons.map((season) => Object.freeze({
      ...season,
    }))),
  });
}

/* -- where a week sits in it ----------------------------------------------- */

/**
 * The season a given week of the arc belongs to, or null for a quiet week.
 *
 * The arc is REQUIRED, and that is the whole enforcement of #59a rather than a
 * tidy-up: it used to default to `EMPLOYER_ARC`, so every caller that did not
 * happen to be holding a shop's own arc silently asked the probation shop's
 * one instead - which is how the round reached three buildings that never
 * authored it. There is no default any more, so "which shop's weather is
 * this" is a question nobody can forget to answer.
 */
export function seasonAt(
  week: number,
  arc: Readonly<EmployerArc>,
): PressureSeason | null {
  return arc.seasons.find(
    (season) => week >= season.weather && week <= season.decision,
  ) ?? null;
}

/** Whether anything at all is live in this week of the arc. */
export function isQuietWeek(
  week: number,
  arc: Readonly<EmployerArc>,
): boolean {
  return seasonAt(week, arc) === null;
}

/**
 * Which beats have fired by the end of a given week, in order.
 *
 * "By", not "in": the notice does not stop having been sent, and the whole
 * point of the criteria beat is that it is on screen for three weeks before it
 * decides anything. What this answers is what the player has been able to READ
 * so far, which is the only question the legibility gate asks.
 */
export function beatsFiredBy(
  season: Readonly<PressureSeason>,
  week: number,
): readonly PressureBeat[] {
  const fired: PressureBeat[] = [];

  if (week >= season.weather) {
    fired.push('weather');
  }

  if (week >= season.notice) {
    fired.push('notice');
  }

  if (week >= season.criteriaFrom) {
    fired.push('criteria');
  }

  if (week >= season.decision) {
    fired.push('decision');
  }

  return Object.freeze(fired);
}

/** The beat this week IS, which is what a screen names it by. */
export function beatAt(
  season: Readonly<PressureSeason>,
  week: number,
): PressureBeat | null {
  if (week === season.decision) {
    return 'decision';
  }

  if (week >= season.criteriaFrom && week <= season.criteriaTo) {
    return 'criteria';
  }

  if (week === season.notice) {
    return 'notice';
  }

  if (week >= season.weather && week < season.notice) {
    return 'weather';
  }

  return null;
}

/* -- the four-beat contract ------------------------------------------------ */

declare const TELEGRAPHED: unique symbol;

/**
 * A season that has fired all four beats, in order, each of them readable.
 *
 * The brand is the enforcement and it is deliberately impossible to forge: the
 * only function that produces this type is `telegraph`, the only function that
 * accepts it is the one that decides an outcome, and the symbol it is keyed on
 * is not exported. A future catalogue entry cannot skip a beat because it
 * cannot be scheduled without four of them; a future CALLER cannot skip the
 * check because there is no other way to build the argument. That is the
 * difference between a rule and a rule with teeth.
 */
export type TelegraphedSeason = PressureSeason & {
  readonly [TELEGRAPHED]: true;
};

/**
 * The gate: four beats, in order, each with the artefact that made it
 * readable, or nothing happens.
 *
 * `readable` is asked of the caller rather than assumed, because the beats are
 * not all the same kind of thing - two are mail in an inbox and one is a
 * screen with a table on it - and the one thing they have in common is that
 * the player could have looked at them. A beat whose artefact is missing is a
 * beat that did not fire, whatever the calendar says.
 */
export function telegraph(
  season: Readonly<PressureSeason>,
  week: number,
  readable: (beat: PressureBeat) => boolean,
): TelegraphedSeason | null {
  const fired = beatsFiredBy(season, week);

  if (fired.length !== PRESSURE_BEATS.length) {
    return null;
  }

  for (const [index, beat] of PRESSURE_BEATS.entries()) {
    if (fired[index] !== beat || !readable(beat)) {
      return null;
    }
  }

  return season as TelegraphedSeason;
}

/**
 * The same question asked as an assertion, for the gates.
 *
 * It answers the reason rather than a boolean, because "the season did not
 * fire" is not a test failure anybody can act on and "the notice never arrived
 * in the inbox" is.
 */
export function whyNotTelegraphed(
  season: Readonly<PressureSeason>,
  week: number,
  readable: (beat: PressureBeat) => boolean,
): string | null {
  const fired = new Set(beatsFiredBy(season, week));

  for (const beat of PRESSURE_BEATS) {
    if (!fired.has(beat)) {
      return `the ${beat} beat has not fired by week ${String(week)}`;
    }

    if (!readable(beat)) {
      return `the ${beat} beat fired and left nothing the player could read`;
    }
  }

  return null;
}

/* -- what the screens say about it ----------------------------------------- */

/**
 * Where the week stands in the season, as anything with a screen needs it.
 *
 * Free to build and changes nothing, exactly like the conduct reading it sits
 * beside: the review window shows it all week, the week card shows it at the
 * end, and neither of them is being shown a different rule from the one that
 * applies. Nothing may fire from a state the player could not read first, and
 * this is the state.
 */
export interface PressureReading {
  readonly week: number;
  readonly season: PressureSeason | null;
  readonly beat: PressureBeat | null;
  /** The matrix, once there is a round to be scored on. Null until then. */
  readonly standing: PoolStanding | null;
}

/**
 * The sentence the screens print, in the world's own words.
 *
 * Five things it can say, one per beat plus the quiet week, and the quiet week
 * is not padding: a player who has never seen a round has to be told that this
 * is a thing that can happen and that nothing is happening, or the first
 * notice arrives as a surprise mechanic rather than as the season turning.
 */
export function pressureSummary(
  reading: Readonly<PressureReading>,
  nameOf: (person: string) => string,
): string {
  const { season, beat, standing } = reading;

  if (season === null || beat === null) {
    return 'Nothing is being proposed. There is no round on, nobody is being '
      + 'scored against anybody, and the week is decided on the mark and the '
      + 'file alone.';
  }

  const entry = findPressure(season.id);
  const dates = `The announcement went out on ${noticeDate(season)} and `
    + `consultation closes on ${decisionDate(season)}.`;

  if (beat === 'weather') {
    return `${entry?.signals.weather ?? ''} Nothing has been proposed and no `
      + 'dates have been given. It is possible that this is nothing.';
  }

  if (beat === 'notice') {
    return `A reduction of ${String(season.cut)} roles is proposed, from a `
      + `pool of ${String(season.pool)}. ${dates} Nothing is decided until `
      + 'then, and the scoring is published from today.';
  }

  const matrix = standing === null
    ? 'The matrix has not been scored yet.'
    : matrixSummary(standing, nameOf);

  return beat === 'criteria'
    ? `Consultation is open. ${matrix} ${dates}`
    : `This is the week it is decided in. ${matrix}`;
}

/* -- the calendar the notice quotes ---------------------------------------- */

/**
 * A day of the arc, as the estate writes dates.
 *
 * The world's clock restarts every week - each week is its own session and its
 * own graph - so the wall calendar in `hours.ts` only knows about the five
 * days in front of it. A career has a longer calendar than that, and a notice
 * without a date on it is not a notice, so the arc week is folded back into
 * the same anchor: Monday 7 September 1998, plus seven days a week.
 *
 * The fold itself is `arcCalendarDay` (0.39.0), because the freeze asks the
 * same question and wants the NUMBER rather than the string - it has to know
 * how far the first of the month is, which a date somebody has already
 * formatted cannot say.
 */
export function arcDate(week: number, day: number): string {
  return calendarDate(arcCalendarDay(week, day));
}

/** The Friday the conversation happens on, as a date somebody can diarise. */
export function decisionDate(season: Readonly<PressureSeason>): string {
  return arcDate(season.decision, WEEK_DAYS);
}

/** And the Monday the announcement went out on. */
export function noticeDate(season: Readonly<PressureSeason>): string {
  return arcDate(season.notice, 1);
}

/** How many days of warning the round actually gives. */
export function noticeDays(season: Readonly<PressureSeason>): number {
  return (season.decision - season.notice) * DAYS_PER_CALENDAR_WEEK
    + (WEEK_DAYS - 1);
}
