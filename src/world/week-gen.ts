/**
 * The week, sampled: day shapes, a constrained draw, and the beats that will
 * not be moved (E11, 0.31.0 slice 2).
 *
 * It emits `readonly DayScript[]` and nothing else, which is the whole reason
 * it is safe to write. The driver reads its week through one private field and
 * every reader is `dayPlan(day, this.week_)`; the four production call sites
 * that used to resolve `employer.week` already go through `WeekSource` (slice
 * 1). So a generated week is not a new kind of thing the rest of the game has
 * to learn about - it is the same table, assembled differently.
 *
 * THE ORDER IS SPELUNKY'S, and it is the one decision in here that everything
 * else follows from. Yu's level generator never validates a level: it lays the
 * traversable path down first and fills rooms in around it, so the property
 * that matters cannot be broken by the filling. The same shape here - beats
 * first, then the day shapes, then quotas, then the fill against the budget -
 * is what keeps the rejection rate near nought instead of at the 43 to 51 per
 * cent EA SEED measured on naively generated match-3 levels.
 *
 *   1. the week seed, a hash of the shop and the position in the arc
 *   2. place the beats            (backtracking over the days each may anchor on)
 *   3. the day shapes             (the shop's ramp, a budget target inside the band)
 *   4. fill to the budget         (weighted draw, without replacement, recency-barred)
 *   5. assemble
 *   6. `validateWeek`             (the loader, unchanged - I1 to I34, I43 to I52)
 *   7. the budget and the quotas  (lane A's arithmetic, against the shape)
 *
 * WHAT THE SEED IS KEYED ON, and it is the most important determinism decision
 * in the epic. Composition is keyed on `(employer, arcWeek)`; the MINUTES are
 * keyed on the attempt, downstream, exactly as they already are. That is the
 * shipped retry contract read one level up - "a retried week has to be
 * recognisably the same week, the same tickets, the same people, the same
 * review on Friday, and not the same MINUTES" - so a player fired on Thursday
 * comes back to the week they lost rather than to a different one. The attempt
 * is therefore deliberately absent from the tuple below, and a save needs no
 * new field: the employer is in the file and the arc position is on the player
 * node, which is why slice 1 could fix the reload before this existed.
 *
 * WHAT THIS VERSION CANNOT DO, said out loud rather than discovered later. The
 * pools now carry a surplus (`src/world/spares/`, 0.34.0 slice 2) and the
 * product draws under a window of ONE: nothing a shop dealt last week is dealt
 * again this week. The design asks for THREE (D-E11-6) and the content does not
 * carry it yet, so this module still refuses rather than quietly dealing the
 * same Tuesday again - see `WeekRefused`, and see `PRODUCT_WINDOW` at the
 * bottom of this file for what the remaining two weeks would actually cost,
 * which is not the "more tickets" the spike assumed.
 *
 * Nothing here dispatches, reads a clock, or consumes the engine's RNG: a week
 * is decided before the day starts, and the same request answers the same way
 * three times running and again after a load.
 */

import { CAUGHT_MINUTES, PATROLS_PER_DAY } from './boss';
import { seedStream } from './day';
import { employerFor, type Employer } from './employers';
import {
  dayLoad,
  LOAD_BAND_MINUTES,
  partitionFactor,
  type LoadTicket,
} from './load';
import {
  AUTHORED_WEEK,
  contentFor,
  COLUMNS,
  DAY_LABELS,
  type Beat,
  type Column,
  type ContentEntry,
  type DayFragment,
  type EmployerContent,
} from './pools';
import { findWorldTicket } from './tickets';
import {
  DEFAULT_RUNG,
  TITLE_TABLE,
  WORK_KINDS,
  type Rung,
  type WorkKind,
} from './titles';
import { MAX_INHERITED, validateWeek, type DayScript } from './week';
import type { WeekRequest, WeekSource } from './week-source';
import { mixOfWeek, workKindOf } from './work-kinds';

/**
 * How many weeks an entry sits out after being drawn.
 *
 * Three, and the number is the highest-leverage decision in the epic rather
 * than a taste: four shipped games independently arrived at the same device -
 * Slay the Spire's three-encounter exclusion window, Left 4 Dead's shuffled
 * boss bag with no successive repeats, Tetris's seven-bag with its twelve-piece
 * worst case, RimWorld's eight-to-a-hundred-and-forty-day incident cooldowns -
 * and NONE of them solves repetition by making the pool bigger. Uniform drawing
 * needs a pool around twenty times the per-session draw before repeats stop
 * being noticeable, which is roughly ninety-five drip tickets a shop for a
 * single week's freshness, and at that size most of what is written is never
 * seen. A window makes a pool of fifty behave like one of three hundred.
 *
 * It bars the DRAW, not the pool. The entry is still in the pool, still
 * weighted, still eligible the moment the window passes.
 */
export const RECENCY_WEEKS = 3;

/**
 * How many derived sub-seeds a week is allowed before the refusal stands.
 *
 * Six. EA SEED measured 43 to 51 per cent validity on naively generated
 * match-3 levels against one designer constraint, so a generator that expects
 * every first attempt to land is a generator that has not met content yet -
 * and equally, a generator that rerolls forever is one that will never tell
 * anybody a shop is a ticket short.
 */
const REROLLS = 6;

/**
 * How many complete arrangements one attempt is allowed to try before it gives
 * up and the next sub-seed has a go.
 *
 * The search checks its own leaves - an arrangement counts only if the fill can
 * finish it into a week that meets every band and every quota - so without a
 * budget a shop whose content nearly does not fit would walk its whole tree.
 * Forty leaves times six sub-seeds is a couple of hundred complete weeks, which
 * is milliseconds and is a long way past the point where "the content is short"
 * is the honest answer.
 */
const LEAF_BUDGET = 40;

/**
 * And how many partial arrangements it may walk on the way to them.
 *
 * The leaf budget alone does not bound the search: a shop with eight beats and
 * five days has three hundred thousand partial arrangements, and a tree whose
 * branches are all pruned before the bottom reaches no leaves at all while
 * taking a very long time not to. Both ends need a number.
 */
const NODE_BUDGET = 1_500;

/**
 * What a quota floor is worth against a minute, when a beat is choosing a day.
 *
 * Larger than any band, because the two are not commensurable: a day short of
 * minutes is a day that reads light, and a day short of the room post its shop
 * puts on every day is a day that is not at that shop. It orders the search
 * and nothing else - no budget is ever added to with it.
 */
const QUOTA_PULL = 10_000;

/**
 * THE WORK MIX: D2's blend ratios, turned into a quota the draw can meet (E9,
 * 0.35.0 slice 3).
 *
 * The rung table says what a title changes as a FACTOR against the shop's own
 * mix - 0.6 is "this rung sees three of the five password jobs this shop deals
 * in a week" - and a factor is not something a generator can check. This is the
 * conversion, and it is done in SHARES rather than in counts: the shop's
 * authored week gives the share of its arrivals each kind of work takes, the
 * row's factor thins that share, and the ceiling for a week being drawn is that
 * share of THAT week's arrivals.
 *
 * Shares rather than counts, because the two disagree and the disagreement is
 * not small: the probation shop authors twenty-three arrivals and draws up to
 * twenty-five, and a ceiling measured against the authored COUNT would quietly
 * tighten every time a drawn week came out larger than the week it was measured
 * from. A share is a claim about the shape of a week, which is what a blend is.
 *
 * The baseline is the AUTHORED week rather than an average of drawn ones, for
 * the same reason the column quotas are measured off it: it is the one week
 * somebody WROTE, so it is the only statement of what a week at this shop is
 * that does not depend on the sampler being right.
 *
 * FLOOR ONE, WHEREVER THE FACTOR IS NOT NOUGHT, and that is the whole of D2 in
 * one line: the lower work LESSENS, it does not disappear. An engineer's week
 * that dealt no password job at all would be the blend decision reversed by
 * arithmetic - the ceiling would have been met by dealing none.
 */
interface MixBound {
  /** Whole arrivals, at least this many in the week. */
  readonly least: number;
  /** The share of the week's arrivals this kind may take, nought to one. */
  readonly share: number;
}

type MixBounds = Readonly<Record<WorkKind, MixBound>>;

/** How many of a kind a week of `total` arrivals may hold under a bound. */
function ceilingFor(bound: MixBound, total: number): number {
  return bound.share >= 1
    ? Number.POSITIVE_INFINITY
    : Math.ceil(bound.share * total);
}

/** The tickets an entry puts on the desk - the two columns with a clock. */
function arrivalsOf(entry: ContentEntry): readonly string[] {
  return [
    ...(entry.fragment.inherited ?? []),
    ...(entry.fragment.drip ?? []).map((slot) => slot.ticketId),
  ];
}

/** What kinds of work a set of entries deals, counted. */
function mixOf(
  entries: readonly ContentEntry[],
  kindOf: (id: string) => WorkKind,
): Record<WorkKind, number> {
  const counts: Record<WorkKind, number> = {
    access: 0, device: 0, server: 0, project: 0,
  };

  for (const entry of entries) {
    for (const id of arrivalsOf(entry)) {
      counts[kindOf(id)] += 1;
    }
  }

  return counts;
}

/** The rung's bounds, and the classifier they are counted with. */
interface Mix {
  readonly bounds: MixBounds;
  readonly kindOf: (id: string) => WorkKind;
}

/** Every entry the authored table places, which is the shop's own statement. */
function authoredEntries(content: EmployerContent): readonly ContentEntry[] {
  return [
    ...content.beats.flatMap((beat) => beat.members.map((member) => member.entry)),
    ...content.pool,
  ].filter((entry) => entry.homeDay >= 1);
}

/**
 * The rung's mix, against this shop, or null when the rung blends nothing.
 *
 * Null is the junior's answer and it is not a shortcut - a row of all ones IS
 * "the shop as it deals it", so there is nothing to hold the draw to, and
 * returning bounds that could never bite would put a pass over the fill that
 * changed the order things are drawn in. That is exactly how a junior's weeks
 * would have quietly stopped being the weeks this game already ships.
 */
export function mixBoundsFor(
  content: EmployerContent,
  rung: Rung,
  kindOf: (id: string) => WorkKind = workKindOf,
): MixBounds | null {
  const row = TITLE_TABLE[rung];

  // Nothing to measure if nothing is blended: the shop's own week is never
  // classified for a rung that takes it as it comes, which is what keeps a
  // junior's draw the draw it has always been - and keeps a fixture shop whose
  // tickets no roster knows playable without a classifier of its own.
  if (WORK_KINDS.every((kind) => row.workMix[kind] >= 1)) {
    return null;
  }

  const baseline = mixOf(authoredEntries(content), kindOf);
  const total = WORK_KINDS.reduce((sum, kind) => sum + baseline[kind], 0);
  const bounds = {} as Record<WorkKind, MixBound>;

  for (const kind of WORK_KINDS) {
    const factor = row.workMix[kind];
    const share = total === 0 ? 0 : baseline[kind] / total;

    bounds[kind] = factor >= 1
      ? { least: 0, share: 1 }
      : factor <= 0
        ? { least: 0, share: 0 }
        : { least: baseline[kind] > 0 ? 1 : 0, share: share * factor };
  }

  return Object.freeze(bounds);
}

/** Whether a week's arrivals sit inside the rung's mix, ceilings and floors. */
function withinMix(
  mix: Mix | null,
  counts: Readonly<Record<WorkKind, number>>,
): boolean {
  if (mix === null) {
    return true;
  }

  const total = WORK_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

  return WORK_KINDS.every(
    (kind) => counts[kind] >= mix.bounds[kind].least
      && counts[kind] <= ceilingFor(mix.bounds[kind], total),
  );
}

/**
 * Whether a part-filled week could still take one more entry: the ceilings
 * alone, against the total the week WOULD have.
 */
function withinCeilings(
  mix: Mix,
  week: Readonly<Record<WorkKind, number>>,
  adding: Readonly<Record<WorkKind, number>>,
): boolean {
  const total = WORK_KINDS.reduce(
    (sum, kind) => sum + week[kind] + adding[kind],
    0,
  );

  return WORK_KINDS.every(
    (kind) => week[kind] + adding[kind] <= ceilingFor(mix.bounds[kind], total),
  );
}

/** Every entry a plan holds, across all its days. */
function planEntries(
  plan: ReadonlyMap<number, readonly ContentEntry[]>,
): readonly ContentEntry[] {
  return [...plan.values()].flat();
}

/** A week the constraints do not admit, with the reason a human can act on. */
export class WeekRefused extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'WeekRefused';
  }
}

export interface GenerateOptions {
  /**
   * How many weeks back the draw remembers. Three in the product.
   *
   * A parameter because the sweep needs it: with no surplus content a window
   * of three makes week two unreachable, so the gate that walks SAMPLED weeks
   * through the feasibility auditor asks for a window of nought and says why.
   * A knob a gate can turn is better than a gate that cannot ask the question.
   */
  readonly window?: number;
  /** The roster, for pricing a day. Injected so a fixture can price its own. */
  readonly price?: (id: string) => LoadTicket | undefined;
  /**
   * And how a ticket is CLASSED, for the rung's work mix - injected for exactly
   * the same reason and by exactly the same callers: a fixture shop deals
   * `ticket:fill-3`, which no roster classifies and no mix could measure.
   */
  readonly kindOf?: (id: string) => WorkKind;
}

/** Where every entry of a week ended up: the plan, before it is a table. */
type Plan = ReadonlyMap<number, readonly ContentEntry[]>;

/**
 * The seed a whole week is drawn from: a HASH of the tuple, never a sum.
 *
 * Slay the Spire 2 shipped per-system generators derived from one run seed
 * that were not independent, so knowing the opening act narrowed which curse
 * you would be offered, and the studio replaced its generator rather than let
 * players learn the correlation table. The seeds in this world are additively
 * related by construction, so a week seed built by adding would put attempt two
 * of week three arithmetically next door to attempt three of week two. Hashed
 * through the `compose` stream, they are not neighbours in any sense.
 */
export function weekSeedFor(employer: string, arcWeek: number): number {
  return seedStream('compose', arcWeek, 0, employer);
}

function bandBottom(load: number): number {
  return load <= 1 ? 0 : (LOAD_BAND_MINUTES[load - 2] ?? 0) + 1;
}

function bandTop(load: number): number {
  return LOAD_BAND_MINUTES[load - 1] ?? Number.POSITIVE_INFINITY;
}

function cellsOf(fragment: DayFragment, column: Column): readonly unknown[] {
  return (fragment as Record<string, readonly unknown[] | undefined>)[column] ?? [];
}

/** One day of a shop, as the fourteen-column table it emits. */
function assembleDay(
  content: EmployerContent,
  day: number,
  entries: readonly ContentEntry[],
  arcWeek: number,
): DayScript {
  const shape = content.shapes[day - 1];

  if (shape === undefined) {
    throw new WeekRefused(`A working week has no day ${String(day)} in it.`);
  }

  const columns: Record<string, unknown[]> = {};

  for (const entry of entries) {
    for (const column of COLUMNS) {
      for (const cell of cellsOf(entry.fragment, column)) {
        (columns[column] ??= []).push(cell);
      }
    }
  }

  const optional: Record<string, unknown[]> = {};

  for (const column of COLUMNS) {
    const cells = columns[column];

    if (column !== 'inherited' && column !== 'drip' && cells !== undefined) {
      optional[column] = cells;
    }
  }

  return {
    day: shape.day,
    label: DAY_LABELS[shape.day - 1] ?? shape.label,
    inherited: (columns.inherited ?? []) as readonly string[],
    drip: (columns.drip ?? []) as DayScript['drip'],
    ...optional,
    // The lead's rounds. The authored week keeps the primes somebody chose; a
    // drawn one derives them, which is also how the one duplication in the
    // shipped tables stops being able to recur - Bodgeworth and the MSP author
    // the same four numbers, and a twist hashed from a week seed with the
    // shop's name in it cannot collide with another shop's the way two
    // hand-copied lists can.
    patrolSeed: arcWeek === AUTHORED_WEEK
      ? shape.patrolSeed
      : seedStream(
        'place',
        weekSeedFor(content.employer, arcWeek),
        shape.day,
        'patrol',
      ),
    load: shape.load,
  };
}

/** Every day the plan gives a shop. */
function assemble(content: EmployerContent, plan: Plan, arcWeek: number): DayScript[] {
  return content.shapes.map(
    (shape) => assembleDay(content, shape.day, plan.get(shape.day) ?? [], arcWeek),
  );
}

/** What one entry costs a day, in the pieces the arithmetic adds up. */
interface EntryCost {
  readonly tickets: number;
  readonly ticketMinutes: number;
  /** Takeovers, walk-ups and typing indicators, without the lead's floor. */
  readonly other: number;
}

/** The lead's rounds, which every day pays whether or not anybody is caught. */
const PATROL_FLOOR = PATROLS_PER_DAY * CAUGHT_MINUTES;

/** What a day would commit if the plan stopped here, in minutes. */
type Pricer = (entries: readonly ContentEntry[]) => number;

/**
 * A day's committed minutes, summed from its parts instead of assembled.
 *
 * The same arithmetic lane A's `dayLoad` does, and deliberately not a second
 * opinion about it: every entry is priced ONCE by `dayLoad` itself, on a day
 * holding only that entry, and the sampler then adds the pieces up. It exists
 * because the search asks the question tens of thousands of times - every
 * candidate, at every step, on every leaf of the placement tree - and
 * assembling and revalidating a whole table each time is the difference
 * between a sweep that runs inside the suite and one nobody ever runs.
 *
 * The two are held against each other rather than trusted apart: every day of
 * every week this module emits is priced AGAIN by `dayLoad` in `gate` below and
 * the two totals are compared to the minute, so a drift between the fast sum
 * and the real arithmetic is a refusal rather than a quietly light Thursday.
 */
function pricerFor(
  content: EmployerContent,
  price: (id: string) => LoadTicket | undefined,
): Pricer {
  const costs = new Map<string, EntryCost>();

  const costOf = (entry: ContentEntry): EntryCost => {
    const cached = costs.get(entry.id);

    if (cached !== undefined) {
      return cached;
    }

    const alone = dayLoad(assembleDay(content, 1, [entry], AUTHORED_WEEK), price);
    const built: EntryCost = {
      tickets: alone.tickets.length,
      ticketMinutes: alone.ticketMinutes,
      other: alone.otherMinutes - PATROL_FLOOR,
    };

    costs.set(entry.id, built);

    return built;
  };

  return (entries: readonly ContentEntry[]): number => {
    let tickets = 0;
    let minutes = 0;
    let other = 0;

    for (const entry of entries) {
      const cost = costOf(entry);
      tickets += cost.tickets;
      minutes += cost.ticketMinutes;
      other += cost.other;
    }

    return Math.round(minutes * partitionFactor(tickets)) + other + PATROL_FLOOR;
  };
}

function countsOf(entries: readonly ContentEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    for (const column of COLUMNS) {
      counts[column] = (counts[column] ?? 0) + cellsOf(entry.fragment, column).length;
    }
  }

  return counts;
}

/** Whether a day could still hold this entry without breaking its shape. */
function fits(
  content: EmployerContent,
  entries: readonly ContentEntry[],
): boolean {
  const counts = countsOf(entries);

  if ((counts.inherited ?? 0) > MAX_INHERITED) {
    return false;
  }

  return COLUMNS.every(
    (column) => (counts[column] ?? 0) <= content.quotas[column].most,
  );
}

/**
 * The days a beat may anchor on, hungriest first.
 *
 * The order is the budget's, not the calendar's. A beat is content with a load
 * on it, and a shop like Halcyon Grange is almost ENTIRELY beats - eight of its
 * nine tickets arrive coupled to the room post that is about them - so a placer
 * that ignored the budget would decide the whole shape of the week and then
 * hand a fill step with two spare entries the job of making Thursday a
 * Thursday. Days still short of the floor of their band come first; the seeded
 * value breaks the ties, which is where the variety between seeds lives.
 */
function anchorsFor(
  beat: Beat,
  weekSeed: number,
  hunger: (day: number, entry: ContentEntry) => number,
): readonly number[] {
  // Scored once per anchor rather than once per comparison. A sort comparator
  // is called O(n log n) times and this one's score walks the day, so a naive
  // version turns a five-element sort into forty measurements of the week.
  const scored = beat.allowedDays.map((anchor) => ({
    anchor,
    need: beat.members.reduce(
      (total, member) => total + hunger(anchor + member.at, member.entry),
      0,
    ),
    tie: seedStream('place', weekSeed, anchor, beat.id),
  }));

  return scored
    .sort((left, right) => right.need - left.need || left.tie - right.tie)
    .map((entry) => entry.anchor);
}

/**
 * The beats, placed - the traversable path, laid down before anything fills.
 *
 * Backtracking rather than a greedy pass, because the constraints interact: a
 * four-day arc placed on the Tuesday leaves one anchor for anything else that
 * spans two days, and a shop whose morning pile is full by Wednesday has to be
 * able to take the Wednesday beat back. Five days and a handful of beats, so
 * the search is instant and - the part this codebase cares about - inspectable
 * and deterministic.
 */
function placeBeats(
  content: EmployerContent,
  weekSeed: number,
  cost: Pricer,
  /**
   * The most a day could still commit if the fill gave it its best single
   * loose entry - the one step of lookahead the placer cannot do without.
   *
   * Beats go down before the fill draws, so a placer that measured a day by
   * what it holds NOW keeps feeding the heavy day until the day's columns are
   * full, and then the fill has nowhere to put the one entry that would have
   * finished it. Halcyon Grange's Thursday is exactly that: it is reachable by
   * two coupled beats and the loose eighty-minute recertification and by
   * nothing else, and a placer with no lookahead puts three beats there every
   * time and refuses the week.
   */
  reachable: (day: number, here: readonly ContentEntry[]) => number,
  /**
   * Whether to try the heavy content first, or to let the seed choose.
   *
   * First-fit-decreasing is the better opening move and it is what the first
   * attempt uses. It is not the only arrangement that works, and on the
   * tightest shop in the game it is not always one that does: Halcyon Grange's
   * Thursday can be reached by three coupled beats or by the loose
   * eighty-minute recertification and two light ones, and a placer that only
   * ever tries the first fills the day's three room-post slots and then has
   * nowhere to put the recertification. So a reroll drops the heuristic and
   * lets the seed order the beats, which is what makes the bounded retry an
   * actual search rather than the same answer several times over.
   */
  byWeight: boolean,
  /** What the fill would do with what is left - the leaf test. */
  finish: (placed: Map<number, ContentEntry[]>) => Map<number, ContentEntry[]> | null,
): Map<number, ContentEntry[]> {
  const placed = new Map<number, ContentEntry[]>();
  // Hardest first, then heaviest: a beat with one legal anchor decides the
  // days it takes before a beat with five gets an opinion about them, and
  // among the free ones the heavy content is placed while the heavy days are
  // still empty. That second half is first-fit-decreasing, the standard answer
  // to exactly this problem, and without it a shop whose content is nearly all
  // coupled - Halcyon Grange, eight beats and two loose entries - fills its
  // Thursday with whichever three beats happened to sort first.
  const weightOf = new Map(content.beats.map((beat) => [
    beat.id,
    cost(beat.members.map((member) => member.entry)),
  ]));
  const beats = [...content.beats].sort(
    (left, right) => left.allowedDays.length - right.allowedDays.length
      || (byWeight
        ? (weightOf.get(right.id) ?? 0) - (weightOf.get(left.id) ?? 0)
        : seedStream('place', weekSeed, 0, left.id)
          - seedStream('place', weekSeed, 0, right.id))
      || left.id.localeCompare(right.id),
  );

  let leaves = 0;
  let nodes = 0;
  let solved: Map<number, ContentEntry[]> | null = null;

  const attempt = (index: number): boolean => {
    nodes += 1;

    if (nodes > NODE_BUDGET) {
      return false;
    }

    const beat = beats[index];

    if (beat === undefined) {
      // The placer checks its own work, exactly as the interruption builder
      // and the patrol builder already do and for the same reason: a bad seed
      // would not look like a bug, it would look like a Thursday that was a
      // second Monday once a fortnight. An arrangement is only legal if the
      // fill can finish it into a week that passes the loader and the ramp -
      // so a placement that spends the day's room-post slots and leaves the
      // eighty-minute job nowhere to go is taken back rather than shipped.
      leaves += 1;

      if (leaves > LEAF_BUDGET) {
        return false;
      }

      solved = finish(new Map(
        [...placed].map(([day, entries]) => [day, [...entries]]),
      ));

      return solved !== null;
    }

    /**
     * How much a day wants this member: the minutes it is still short of the
     * floor of its band, plus a flat pull for every quota floor this member
     * would help it meet.
     *
     * The second term is what stops the search thrashing. A shop that owes
     * every day a room post has nine posts and five days, and a placer that
     * only measured minutes scatters them by the seed, leaves a Wednesday with
     * none, discovers it at the leaf and backtracks - which is a correct
     * answer arrived at by exhaustion. Pulling a beat toward the day that is
     * missing what it carries gets the same answer first time.
     */
    const hunger = (day: number, entry: ContentEntry): number => {
      const here = placed.get(day) ?? [];
      const counts = countsOf(here);
      const bare = (counts.inherited ?? 0) + (counts.drip ?? 0) === 0
        && !content.dealsNothing.has(day)
        && (cellsOf(entry.fragment, 'inherited').length > 0
          || cellsOf(entry.fragment, 'drip').length > 0)
        ? QUOTA_PULL
        : 0;
      const owed = COLUMNS.reduce(
        (total, column) => total + (
          cellsOf(entry.fragment, column).length > 0
            && (counts[column] ?? 0) < content.quotas[column].least
            ? QUOTA_PULL
            : 0
        ),
        0,
      );

      return bare + owed + Math.max(
        0,
        bandBottom(content.shapes[day - 1]?.load ?? 1) - reachable(day, here),
      );
    };

    for (const anchor of anchorsFor(beat, weekSeed, hunger)) {
      const touched = beat.members.map((member) => ({
        day: anchor + member.at,
        entry: member.entry,
      }));

      for (const { day, entry } of touched) {
        placed.set(day, [...(placed.get(day) ?? []), entry]);
      }

      const legal = touched.every(
        ({ day }) => fits(content, placed.get(day) ?? [])
          // And the ceiling of the day's band, which is a refusal rather than
          // a preference: a day past the top of load 4 is not a hard day, it
          // is a day nobody could have been given.
          && cost(placed.get(day) ?? [])
            <= bandTop(content.shapes[day - 1]?.load ?? 1),
      );

      if (legal && attempt(index + 1)) {
        return true;
      }

      for (const { day, entry } of touched) {
        placed.set(day, (placed.get(day) ?? []).filter((held) => held !== entry));
      }
    }

    return false;
  };

  if (!attempt(0) || solved === null) {
    throw new WeekRefused(
      `${content.employer} has no arrangement of its ${String(content.beats.length)} `
      + `coupled beats and ${String(content.pool.length)} loose entries that `
      + 'fills five days to the ramp it wrote down. Either a beat cannot be '
      + 'placed at all, or every placement leaves a day short of its band.',
    );
  }

  return solved;
}

/** One weighted draw out of what is left, decided by this week and this step. */
function draw(
  candidates: readonly ContentEntry[],
  weekSeed: number,
  day: number,
  key: string,
): ContentEntry | undefined {
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);

  if (total <= 0) {
    return undefined;
  }

  let roll = seedStream('compose', weekSeed, day, key) % total;

  for (const entry of candidates) {
    roll -= entry.weight;

    if (roll < 0) {
      return entry;
    }
  }

  return candidates[candidates.length - 1];
}

/**
 * The fill, in three passes: the quotas, the empty days, then the budget.
 *
 * The order is Spelunky's again, one level down. A quota is a claim about what
 * a week at this shop IS - the probation week authors one of each interruption
 * shape across five days and there is a test that says so - and a day that has
 * spent its budget before its quota is a day that cannot meet it any more. So
 * the required cells go down first and the budget fills in around them.
 *
 * The days are taken heaviest FIRST, which is the one ordering decision worth
 * arguing. Filled Monday to Friday, the light days at the front spend the
 * content the heavy days at the back are the whole shape of the week for, and
 * Thursday - the day you are not meant to finish - arrives at an empty pool
 * and comes out as a second Monday. Hardest constraint first is the standard
 * answer and it is the same instinct as placing the beats with the fewest
 * legal anchors before the ones with five.
 *
 * The budget is committed MINUTES of the shift rather than a count of tickets,
 * because that is the unit the feasibility auditor counts in and the only one
 * that survives content changing shape: the review mark is scale-invariant, so
 * a week twice the size scores the same for the same proportion of work done,
 * and ticket COUNT is therefore not difficulty. Time pressure is.
 *
 * The target inside the band is drawn rather than fixed, which is Booth's rule
 * kept: the algorithm adjusts pacing, not amplitude. Thursday stays the day you
 * cannot finish on every seed; what moves is where inside its band it lands.
 */
function fillToBudget(
  content: EmployerContent,
  placed: Map<number, ContentEntry[]>,
  weekSeed: number,
  history: ReadonlySet<string>,
  cost: Pricer,
  /** The rung's work mix, or null for a rung that takes the shop as it comes. */
  mix: Mix | null,
): void {
  const used = new Set<string>();

  for (const entries of placed.values()) {
    for (const entry of entries) {
      used.add(entry.id);
    }
  }

  /**
   * What one entry adds to the week's mix, worked out once per entry.
   *
   * The counting is cheap and the search is not: `eligible` runs over the whole
   * pool at every step of every day, so the difference between measuring an
   * entry once and measuring the whole week again per candidate is the
   * difference between a sweep that runs in the suite and one that does not.
   */
  const adds = new Map<string, Record<WorkKind, number>>();
  const addedBy = (entry: ContentEntry): Record<WorkKind, number> => {
    const known = adds.get(entry.id);

    if (known !== undefined) {
      return known;
    }

    const counted = mixOf([entry], mix?.kindOf ?? ((): WorkKind => 'access'));
    adds.set(entry.id, counted);

    return counted;
  };

  const eligible = (
    day: number,
    column: Column | null,
    top: number,
    /** A work kind this draw is FOR, when it is the mix being filled. */
    kind: WorkKind | null = null,
  ): readonly ContentEntry[] => {
    const here = placed.get(day) ?? [];
    // The mix is a WEEK-level quota, so its ceilings are read against every day
    // at once rather than against this one - which is the whole difference
    // between it and the column quotas above it.
    const week = mix === null
      ? null
      : mixOf(planEntries(placed), mix.kindOf);

    return content.pool.filter(
      (entry) => !used.has(entry.id)
        && !history.has(entry.id)
        && (column === null || entry.column === column)
        && (kind === null || addedBy(entry)[kind] > 0)
        && entry.allowedDays.includes(day)
        && fits(content, [...here, entry])
        && (mix === null || week === null || withinCeilings(
          mix,
          week,
          addedBy(entry),
        ))
        && cost([...here, entry]) <= top,
    );
  };

  const take = (day: number, entry: ContentEntry): void => {
    used.add(entry.id);
    placed.set(day, [...(placed.get(day) ?? []), entry]);
  };

  const heaviest = (day: number): number => bandTop(
    content.shapes[day - 1]?.load ?? 1,
  );

  // Pass one: the quota floors, every day, every column.
  for (const shape of content.shapes) {
    for (const column of COLUMNS) {
      const wanted = content.quotas[column].least;

      for (let step = countsOf(placed.get(shape.day) ?? [])[column] ?? 0;
        step < wanted;
        step += 1) {
        const picked = draw(
          eligible(shape.day, column, heaviest(shape.day)),
          weekSeed,
          shape.day,
          `quota:${column}:${String(step)}`,
        );

        if (picked === undefined) {
          throw new WeekRefused(
            `${content.employer} owes its ${shape.label} ${String(wanted)} of `
            + `${column} and the pool can find ${String(step)}. A quota the `
            + 'draw cannot meet is a week that is not this shop\'s.',
          );
        }

        take(shape.day, picked);
      }
    }
  }

  // Pass one and a half: the rung's own floors, which are a WEEK's claim rather
  // than a day's - "lessened, but present". A day is chosen for each by the
  // ordinary rules (it has to be allowed there, fit the columns and stay inside
  // the band), heaviest day last so the light days take the blend and the heavy
  // days keep their room; a kind with nowhere to go is a refusal, because a
  // rung whose password work cannot be dealt at all is not that rung.
  if (mix !== null) {
    for (const kind of WORK_KINDS) {
      const wanted = mix.bounds[kind].least;

      for (let step = mixOf(planEntries(placed), mix.kindOf)[kind];
        step < wanted;
        step += 1) {
        const lightestFirst = [...content.shapes].sort(
          (left, right) => bandBottom(left.load) - bandBottom(right.load)
            || left.day - right.day,
        );
        let taken = false;

        for (const shape of lightestFirst) {
          const picked = draw(
            eligible(shape.day, null, heaviest(shape.day), kind),
            weekSeed,
            shape.day,
            `mix:${kind}:${String(step)}`,
          );

          if (picked !== undefined) {
            take(shape.day, picked);
            taken = true;
            break;
          }
        }

        if (!taken) {
          throw new WeekRefused(
            `${content.employer} owes this rung ${String(wanted)} of `
            + `${kind} work in a week and the draw can place `
            + `${String(step)}. A blend that cannot be dealt is a title `
            + 'playing a week that is not its own.',
          );
        }
      }
    }
  }

  // And every day at least one thing on the desk, unless this shop writes
  // that day empty on purpose. It is not a column quota - it is either column
  // and the loader has never held anybody to it - so it is its own pass.
  for (const shape of content.shapes) {
    if (content.dealsNothing.has(shape.day)) {
      continue;
    }

    for (let step = 0; step < content.pool.length; step += 1) {
      const counts = countsOf(placed.get(shape.day) ?? []);

      if ((counts.inherited ?? 0) + (counts.drip ?? 0) > 0) {
        break;
      }

      const picked = draw(
        eligible(shape.day, null, heaviest(shape.day)).filter(
          (entry) => entry.column === 'inherited' || entry.column === 'drip',
        ),
        weekSeed,
        shape.day,
        `deals:${String(step)}`,
      );

      if (picked === undefined) {
        throw new WeekRefused(
          `${content.employer} has nothing left to put on the desk on its `
          + `${shape.label}, and this shop does not write an empty day.`,
        );
      }

      take(shape.day, picked);
    }
  }

  // Pass two: the budget, heaviest day first.
  const order = [...content.shapes].sort(
    (left, right) => bandBottom(right.load) - bandBottom(left.load)
      || left.day - right.day,
  );

  for (const shape of order) {
    const top = bandTop(shape.load);
    const low = bandBottom(shape.load);
    const span = Math.max(1, top - low + 1);
    const target = low
      + (seedStream('compose', weekSeed, shape.day, 'budget') % span);

    for (let step = 0; step < content.pool.length; step += 1) {
      const here = placed.get(shape.day) ?? [];
      const committed = cost(here);

      if (committed >= target) {
        break;
      }

      const candidates = eligible(shape.day, null, top);
      // Below the FLOOR of the band the day is not the day it says it is, so
      // the heaviest thing that still fits goes in; above it, the draw is the
      // draw. Two rules rather than one because "reach the band" and "vary
      // inside it" are different questions and only the first can fail.
      const picked = committed < low
        ? [...candidates].sort(
          (left, right) => cost([...here, right]) - cost([...here, left])
            || left.id.localeCompare(right.id),
        )[0]
        : draw(candidates, weekSeed, shape.day, `fill:${String(step)}`);

      if (picked === undefined) {
        break;
      }

      take(shape.day, picked);
    }
  }
}

/** The ids some earlier week already drew, and this one may therefore not. */
function drawnBefore(
  content: EmployerContent,
  arcWeek: number,
  rung: Rung,
  options: Readonly<GenerateOptions>,
): ReadonlySet<string> {
  const window = options.window ?? RECENCY_WEEKS;
  const drawn = new Set<string>();

  for (let week = Math.max(1, arcWeek - window); week < arcWeek; week += 1) {
    // Under the CURRENT rung, which is the same generous approximation the
    // window already makes: a player promoted mid-arc saw their earlier weeks
    // as a junior, and recomputing them as an engineer can bar an entry they
    // never met. The window bars more than it strictly must and never less,
    // which is the safe direction and the one this module already documents.
    for (const script of generateFor(content, week, rung, options)) {
      for (const entry of [...content.beats.flatMap(
        (beat) => beat.members.map((member) => member.entry),
      ), ...content.pool]) {
        if (dealtIn(script, entry)) {
          drawn.add(entry.id);
        }
      }
    }
  }

  return drawn;
}

/**
 * Whether a day's table holds this entry's cells.
 *
 * Read off the emitted week rather than off a remembered plan, so the recency
 * window can never disagree with what a player was actually dealt. Matching is
 * by value, which is deliberately generous where two cells are identical - the
 * arc's two outages are the same slot at the same minute two days apart, and
 * both of them count as drawn. Generous is the safe direction for a window: it
 * bars more than it strictly must, never less.
 *
 * Exported because the window's own gates ask exactly this question of an
 * emitted week - was this entry dealt - and a second implementation of it in a
 * test file would be a test agreeing with itself about what "drawn" means.
 */
export function dealtIn(script: Readonly<DayScript>, entry: ContentEntry): boolean {
  return COLUMNS.some((column) => {
    const mine = cellsOf(entry.fragment, column);
    const theirs = column === 'inherited'
      ? script.inherited
      : (script as unknown as Record<string, readonly unknown[] | undefined>)[column] ?? [];

    return mine.length > 0
      && mine.every((cell) => theirs.some(
        (other) => JSON.stringify(other) === JSON.stringify(cell),
      ));
  });
}

/**
 * The week itself: the authored one at week one, a drawn one after it.
 *
 * The branch is a CONTENT fact rather than a special case in the sampler. A
 * shop's first week is written by hand and stays written - the probation Monday
 * is the day the two basic tools are taught, and every good implementation of
 * this pattern pins its opening the same way. Both branches then go through the
 * same assembly, the same loader and the same budget, which is what makes the
 * reproduction gate worth having: the authored week is not a bypass, it is an
 * input the whole pipeline has to be able to carry.
 */
function composeWeek(
  content: EmployerContent,
  arcWeek: number,
  rung: Rung,
  options: Readonly<GenerateOptions>,
): readonly DayScript[] {
  const price = options.price ?? findWorldTicket;
  const cost = pricerFor(content, price);
  /**
   * The rung's mix binds the DRAW and not the authored week, and that is a
   * content decision rather than a convenience. Week one of every shop is a
   * table somebody wrote - the probation Monday teaches the two basic tools -
   * and the pipeline's whole contract with it is to reproduce it byte for byte.
   * A quota that could refuse it would be a rung refusing the shipped game;
   * what the quota is FOR is every week after it, which is every week nobody
   * wrote by hand.
   */
  const kindOf = options.kindOf ?? workKindOf;
  const bounds = arcWeek === AUTHORED_WEEK
    ? null
    : mixBoundsFor(content, rung, kindOf);
  const mix: Mix | null = bounds === null ? null : { bounds, kindOf };

  if (arcWeek === AUTHORED_WEEK) {
    const plan = new Map<number, ContentEntry[]>();
    const all = [
      ...content.beats.flatMap((beat) => beat.members.map((member) => member.entry)),
      ...content.pool,
    ]
      // A spare has no home day and so is not in the authored week at all.
      .filter((entry) => entry.homeDay >= 1)
      .sort((left, right) => left.homeDay - right.homeDay || left.order - right.order);

    for (const entry of all) {
      plan.set(entry.homeDay, [...(plan.get(entry.homeDay) ?? []), entry]);
    }

    return gate(content, assemble(content, plan, arcWeek), price, plan, cost, mix);
  }

  const history = drawnBefore(content, arcWeek, rung, options);
  const weekSeed = weekSeedFor(content.employer, arcWeek);
  const spare = content.pool.filter((entry) => !history.has(entry.id));
  // Only beats are down while the placer runs, so nothing in the loose pool
  // can already be taken and there is no used-set to consult.
  const reachable = (day: number, here: readonly ContentEntry[]): number => spare
    .reduce((best, entry) => {
      if (!entry.allowedDays.includes(day)) {
        return best;
      }

      const withIt = cost([...here, entry]);

      return withIt <= bandTop(content.shapes[day - 1]?.load ?? 1)
        && withIt > best
        ? withIt
        : best;
    }, cost(here));
  let last: unknown;

  /**
   * THE BLEND YIELDS TO THE WEEK, and only ever in that order.
   *
   * Two passes: the rung's mix, and then the shop as it comes. It is the same
   * decision `PRODUCT_WINDOW` records one constraint along - the designed value
   * is three weeks and the pools carry one - said here as behaviour instead of
   * as a constant, because the affordable blend is per shop AND per rung rather
   * than one number.
   *
   * The argument for yielding rather than refusing is what each promise is
   * worth to a player. The day's band is a promise about the week they are
   * playing: a Thursday under its floor is a broken Thursday and nothing about
   * a job title makes it a good one. The blend is a promise about the TITLE, and
   * where a shop's pool cannot express it - the probation shop's surplus is
   * desk-work almost all the way down, and no arrangement of it is an
   * engineer's week - the honest answer is the shop's own week, not a refusal
   * that would leave a promoted player with no Monday at all. What is NOT
   * acceptable is doing this quietly at a shop that could have carried the
   * blend, which is why the strict pass runs first, in full, every time, and
   * why `mixAfforded` exists for the gates to measure which shops manage it.
   */
  for (const attempt of mix === null ? [null] : [mix, null]) {
    for (let reroll = 0; reroll < REROLLS; reroll += 1) {
      const salted = seedStream('compose', weekSeed, 0, `reroll:${String(reroll)}`);

      try {
        const placed = placeBeats(
          content,
          salted,
          cost,
          reachable,
          reroll === 0,
          (trial) => {
            try {
              fillToBudget(content, trial, salted, history, cost, attempt);
            } catch (refused: unknown) {
              if (!(refused instanceof WeekRefused)) {
                throw refused;
              }

              last = refused;

              return null;
            }

            return admissible(content, trial, cost, attempt) ? trial : null;
          },
        );

        return gate(
          content,
          assemble(content, placed, arcWeek),
          price,
          placed,
          cost,
          attempt,
        );
      } catch (refused: unknown) {
        if (!(refused instanceof WeekRefused)) {
          throw refused;
        }

        last = refused;
      }
    }
  }

  throw last instanceof Error ? last : new WeekRefused(
    `${content.employer} has no week ${String(arcWeek)} its constraints admit.`,
  );
}

/**
 * Whether a shop's content can actually carry a rung's blend, measured rather
 * than assumed - the mix's own `windowAfforded`.
 *
 * It composes the shop's next few weeks under the rung's mix and answers with
 * how many of them landed inside it. The gates use it two ways: as the hard
 * assertion for the pairs a player can REACH today (the engineer at the MSP
 * carries its blend, every week, or the slice is not built), and as a reported
 * number for the rest, so "this shop cannot express that rung" is a fact
 * somebody has written down rather than a surprise in a play-test.
 */
export function mixAfforded(
  content: EmployerContent,
  rung: Rung,
  weeks: number = 10,
  options: Readonly<GenerateOptions> = { window: PRODUCT_WINDOW },
): number {
  const bounds = mixBoundsFor(content, rung, options.kindOf ?? workKindOf);

  if (bounds === null) {
    return weeks;
  }

  const mix: Mix = { bounds, kindOf: options.kindOf ?? workKindOf };
  let carried = 0;

  for (let week = AUTHORED_WEEK + 1; week <= AUTHORED_WEEK + weeks; week += 1) {
    const drawn = generateFor(content, week, rung, options);

    if (withinMix(mix, mixOfWeek(drawn, mix.kindOf))) {
      carried += 1;
    }
  }

  return carried;
}

/**
 * The cheap half of the gate, for the inside of the search.
 *
 * Bands and column counts only - no assembly, no loader. It is what a leaf of
 * the placement tree is judged by, because a search that ran the whole boot-time
 * validator on every arrangement it tried would be a search nobody could afford
 * to run in a sweep. The expensive half runs once, on the arrangement that won.
 */
function admissible(
  content: EmployerContent,
  plan: ReadonlyMap<number, readonly ContentEntry[]>,
  cost: Pricer,
  mix: Mix | null,
): boolean {
  // The week-level half first, because it is one count over the whole plan and
  // it is the cheapest thing here to be wrong about.
  if (mix !== null && !withinMix(mix, mixOf(planEntries(plan), mix.kindOf))) {
    return false;
  }

  return content.shapes.every((shape) => {
    const entries = plan.get(shape.day) ?? [];
    const committed = cost(entries);

    if (committed < bandBottom(shape.load) || committed > bandTop(shape.load)) {
      return false;
    }

    const counts = countsOf(entries);

    if (
      (counts.inherited ?? 0) + (counts.drip ?? 0) === 0
      && !content.dealsNothing.has(shape.day)
    ) {
      return false;
    }

    return COLUMNS.every((column) => {
      const held = counts[column] ?? 0;

      return held >= content.quotas[column].least
        && held <= content.quotas[column].most;
    });
  });
}

/**
 * The gates every week goes through, drawn or authored.
 *
 * `validateWeek` first, because it is the loader the four hand-written weeks
 * already pass at module load and it refuses thirty-four kinds of quiet
 * wrongness for nothing. Then the arithmetic: a day whose committed minutes do
 * not say what its `load` says is a day the sampler mis-measured, and a column
 * outside the shape the shop's own week keeps is a week that is not this shop's.
 */
function gate(
  content: EmployerContent,
  week: readonly DayScript[],
  price: (id: string) => LoadTicket | undefined,
  plan: Plan,
  cost: Pricer,
  mix: Mix | null,
): readonly DayScript[] {
  const checked = validateWeek(week, content.rooms);

  // The mix, read off the EMITTED week rather than off the plan it came from -
  // the same rule the column quotas keep two paragraphs down. A plan and a
  // table disagreeing about what was dealt is exactly the sort of thing that
  // would show up as a rung's blend being right in the sampler and wrong on the
  // desk.
  if (mix !== null) {
    const dealt = mixOfWeek(checked, mix.kindOf);

    const arrivals = WORK_KINDS.reduce((sum, kind) => sum + dealt[kind], 0);

    for (const kind of WORK_KINDS) {
      const bound = mix.bounds[kind];
      const most = ceilingFor(bound, arrivals);

      if (dealt[kind] < bound.least || dealt[kind] > most) {
        throw new WeekRefused(
          `${content.employer} drew ${String(dealt[kind])} of ${kind} work in `
          + `${String(arrivals)} arrivals, and this rung takes between `
          + `${String(bound.least)} and ${String(most)} of it. The blend is `
          + 'what the title means.',
        );
      }
    }
  }

  for (const script of checked) {
    const priced = dayLoad(script, price);
    const summed = cost(plan.get(script.day) ?? []);

    // The fast sum against the real arithmetic, exactly rather than to the
    // band. The sampler asks its own pricer tens of thousands of times and the
    // gate asks lane A's once; two answers to "how heavy is this day" is
    // exactly the sort of disagreement that would show up as a shop whose
    // Thursdays are subtly light, so they are compared to the minute here and
    // a difference is a refusal rather than a rounding nobody looks at.
    if (summed !== priced.committedMinutes) {
      throw new WeekRefused(
        `${script.label} at ${content.employer} sums to ${String(summed)} `
        + `minutes while the roster's own arithmetic makes it `
        + `${String(priced.committedMinutes)}. The sampler and the gate are `
        + 'measuring different days.',
      );
    }

    if (priced.load !== script.load) {
      throw new WeekRefused(
        `${script.label} at ${content.employer} was drawn to load `
        + `${String(script.load)} and commits ${String(priced.committedMinutes)} `
        + `minutes, which is load ${String(priced.load)}. A ramp the sampler `
        + 'does not actually hit is a ramp written down twice and meant once.',
      );
    }

    if (
      script.inherited.length + script.drip.length === 0
      && !content.dealsNothing.has(script.day)
    ) {
      throw new WeekRefused(
        `${script.label} at ${content.employer} deals nothing at all, and this `
        + 'shop does not write a day like that. A day the draw came up empty '
        + 'on does not read as a bug - it reads as a quiet day - which is why '
        + 'it is refused here rather than noticed by somebody in week nine.',
      );
    }

    for (const column of COLUMNS) {
      const held = column === 'inherited'
        ? script.inherited.length
        : ((script as unknown as Record<string, readonly unknown[] | undefined>)[column]
          ?? []).length;
      const quota = content.quotas[column];

      if (held < quota.least || held > quota.most) {
        throw new WeekRefused(
          `${script.label} at ${content.employer} holds ${String(held)} of `
          + `${column}, and this shop's weeks hold between ${String(quota.least)} `
          + `and ${String(quota.most)} of it. A quota is the shape of the shop.`,
        );
      }
    }
  }

  return checked;
}

const GENERATED = new Map<string, readonly DayScript[]>();

function generateFor(
  content: EmployerContent,
  arcWeek: number,
  rung: Rung,
  options: Readonly<GenerateOptions>,
): readonly DayScript[] {
  // The rung is IN THE KEY and not in the seed, and the difference is the whole
  // of why a junior's weeks did not move when this arrived. In the key, because
  // two rungs draw different weeks and a cache that answered the second with
  // the first's would deal an engineer a junior's Tuesday. Not in the seed,
  // because the seed decides WHICH week this is - keying it on the title would
  // have redrawn every existing week the moment the table existed, for a rung
  // whose row changes nothing.
  const key = `${content.employer}#${String(arcWeek)}#${rung}#${String(
    options.window ?? RECENCY_WEEKS,
  )}`;
  const cached = options.price === undefined ? GENERATED.get(key) : undefined;

  if (cached !== undefined) {
    return cached;
  }

  if (!Number.isSafeInteger(arcWeek) || arcWeek < 1) {
    throw new WeekRefused(
      `There is no week ${String(arcWeek)} of anybody's career.`,
    );
  }

  const built = composeWeek(content, arcWeek, rung, options);

  if (options.price === undefined) {
    GENERATED.set(key, built);
  }

  return built;
}

/**
 * One week, for one shop, at one position in one career.
 *
 * The attempt is deliberately not read: it moves the minutes, downstream, and
 * a week that changed composition on a retry would be a different job with the
 * same name on it.
 */
export function generateWeek(
  request: Readonly<WeekRequest>,
  content: EmployerContent,
  options: Readonly<GenerateOptions> = {},
): readonly DayScript[] {
  // The rung comes off the request because it comes off the WORLD: it is the
  // player's own tier, which a save carries and a load restores, so the week a
  // reload resolves is the week the player was playing (`week-source.ts`). A
  // request with none is the bottom of the ladder, which is every save written
  // before the table existed and every player who has not been promoted.
  return generateFor(content, request.arcWeek, request.rung ?? DEFAULT_RUNG, options);
}

/**
 * The exclusion window THE PRODUCT draws under (E11, 0.34.0 slice 2).
 *
 * ONE, raised from nought by the slice that paid for it, and it is a measured
 * fact about the content rather than a taste. `RECENCY_WEEKS` above is the
 * decided design - three, D-E11-6 - and this is what the pools can carry today:
 * nothing a shop dealt last week is dealt again this week, at every shop, at
 * every arc position the sweep reaches.
 *
 * WHY IT IS ONE AND NOT THREE, because the arithmetic is the interesting part
 * and it is not the one the spike predicted. The spike costed the window in
 * POOL SIZE - fifty to sixty drip entries a shop - and that number is right
 * about the MSP and wrong about the shape of the problem everywhere else. A
 * window of one means week two is drawn with the whole of week one barred, so
 * the surplus alone has to build a legal week: five days, each inside the band
 * its own ramp wrote down. What binds is not how many entries a shop owns but
 * how many it may put on ONE DAY and what each of them weighs.
 *
 * Halcyon Grange is the clearest case. It may deal one inherited ticket and
 * three drips, so four arrivals is its ceiling, and four thirty-minute
 * arrivals cannot reach the floor of a load-2 Thursday however they are
 * arranged - a pool of a hundred one-step tickets would still refuse. Three
 * two-step tickets fixed it and took that shop to a window of TWO. The
 * probation shop is the mirror image: it was six arrivals short of a load-3
 * Wednesday, and the step from six arrivals to seven vaults straight over the
 * top of the band, so what it needed was four more of the workstation taking
 * the screen - minutes that are not a ticket.
 *
 * So the honest cost of the next window is not "more tickets". It is heavier
 * entries where a day is capped, and non-ticket minutes where the count term
 * is the thing in the way. Slice 2 can ship twice, and the second one now knows
 * what to buy.
 *
 * The ratchet in `week-gen.test.ts` holds both directions - no wider than the
 * content affords and no narrower - so this number cannot outlive its reason
 * and cannot quietly lag the content either.
 */
export const PRODUCT_WINDOW = 1;

/**
 * The widest window a shop's content can actually honour, measured rather than
 * asserted - the ratchet's own reading, and the sweep's.
 *
 * It composes the shop's next few weeks at each window from the widest down and
 * answers with the first one that does not refuse. `depth` is how many weeks
 * past the authored one it insists on, because a window only bites once enough
 * weeks have been drawn to fill it: a shop that manages week two under a window
 * of three and then refuses week three has not honoured a window of three.
 */
export function windowAfforded(
  content: EmployerContent,
  depth: number = RECENCY_WEEKS + 1,
  /** Whose weeks: the mix a rung blends changes what the content can carry. */
  rung: Rung = DEFAULT_RUNG,
): number {
  for (let window = RECENCY_WEEKS; window > 0; window -= 1) {
    let carried = true;

    for (let week = AUTHORED_WEEK + 1; week <= AUTHORED_WEEK + depth; week += 1) {
      try {
        generateFor(content, week, rung, { window });
      } catch (refused: unknown) {
        if (!(refused instanceof WeekRefused)) {
          throw refused;
        }

        carried = false;
        break;
      }
    }

    if (carried) {
      return window;
    }
  }

  return 0;
}

function wired(
  request: Readonly<WeekRequest>,
  content: EmployerContent,
): readonly DayScript[] {
  return generateWeek(request, content, { window: PRODUCT_WINDOW });
}

/** The seam's answer, for the shops the registry knows. */
export const generatedWeek: WeekSource = (
  request: Readonly<WeekRequest>,
): readonly DayScript[] => wired(
  request,
  contentFor(employerFor(request.employer)),
);

/** The same, for a shop somebody handed us rather than one the registry holds. */
export function generatedWeekFor(employer: Employer): WeekSource {
  return (request: Readonly<WeekRequest>): readonly DayScript[] => wired(
    request,
    contentFor(employer),
  );
}
