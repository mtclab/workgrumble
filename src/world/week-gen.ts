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
 * pools are built from the four shipped weeks and no content was added, so
 * every shop's pool holds EXACTLY the entries its authored week uses and not
 * one spare. A three-week exclusion window over a pool with no surplus has
 * nothing to draw in week two, and this module refuses rather than quietly
 * dealing the same Tuesday again - see `WeekRefused`. That is the content bill
 * D-E11-1 has to pay (the spike costs it at 50 to 60 drip entries per shop),
 * and refusing is how the generator says so in a sentence instead of in a
 * player's second week.
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
import { MAX_INHERITED, validateWeek, type DayScript } from './week';
import type { WeekRequest, WeekSource } from './week-source';

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
): void {
  const used = new Set<string>();

  for (const entries of placed.values()) {
    for (const entry of entries) {
      used.add(entry.id);
    }
  }

  const eligible = (
    day: number,
    column: Column | null,
    top: number,
  ): readonly ContentEntry[] => {
    const here = placed.get(day) ?? [];

    return content.pool.filter(
      (entry) => !used.has(entry.id)
        && !history.has(entry.id)
        && (column === null || entry.column === column)
        && entry.allowedDays.includes(day)
        && fits(content, [...here, entry])
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
  options: Readonly<GenerateOptions>,
): ReadonlySet<string> {
  const window = options.window ?? RECENCY_WEEKS;
  const drawn = new Set<string>();

  for (let week = Math.max(1, arcWeek - window); week < arcWeek; week += 1) {
    for (const script of generateFor(content, week, options)) {
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
 */
function dealtIn(script: Readonly<DayScript>, entry: ContentEntry): boolean {
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
  options: Readonly<GenerateOptions>,
): readonly DayScript[] {
  const price = options.price ?? findWorldTicket;
  const cost = pricerFor(content, price);

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

    return gate(content, assemble(content, plan, arcWeek), price, plan, cost);
  }

  const history = drawnBefore(content, arcWeek, options);
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

  // Generate and test, bounded. The order above is meant to make rejection
  // rare rather than routine, but "rare" is not "never" and an unbounded
  // reroll is a content bug with the symptom hidden: it would spin until it
  // found the one arrangement that fits and nobody would ever learn the shop
  // was one entry short. A handful of derived sub-seeds, then the refusal.
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
            fillToBudget(content, trial, salted, history, cost);
          } catch (refused: unknown) {
            if (!(refused instanceof WeekRefused)) {
              throw refused;
            }

            last = refused;

            return null;
          }

          return admissible(content, trial, cost) ? trial : null;
        },
      );

      return gate(
        content,
        assemble(content, placed, arcWeek),
        price,
        placed,
        cost,
      );
    } catch (refused: unknown) {
      if (!(refused instanceof WeekRefused)) {
        throw refused;
      }

      last = refused;
    }
  }

  throw last instanceof Error ? last : new WeekRefused(
    `${content.employer} has no week ${String(arcWeek)} its constraints admit.`,
  );
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
): boolean {
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
): readonly DayScript[] {
  const checked = validateWeek(week, content.rooms);

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
  options: Readonly<GenerateOptions>,
): readonly DayScript[] {
  const key = `${content.employer}#${String(arcWeek)}#${String(
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

  const built = composeWeek(content, arcWeek, options);

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
  return generateFor(content, request.arcWeek, options);
}

/**
 * How far into an arc the PRODUCT resolves weeks. One, deliberately.
 *
 * The generator can compose week nine of any shop and the sweep audits ten
 * thousand of them, but no career in this build reaches week two: the arc's
 * twelve-week pressure ladder is shipped and unreachable, and wiring a drawn
 * week to a player is D-E11-1's decision to make, not this slice's. So the
 * seam clamps - every arc position a live session can hold resolves to the
 * shop's authored table, byte for byte, exactly as the registry lookup it
 * replaces did. A player sees nothing new this version, which is the point of
 * this version.
 *
 * Deleting the clamp is the whole of the wiring when that decision lands.
 */
const WIRED_WEEKS = AUTHORED_WEEK;

function wired(
  request: Readonly<WeekRequest>,
  content: EmployerContent,
): readonly DayScript[] {
  return generateWeek(
    { ...request, arcWeek: Math.min(request.arcWeek, WIRED_WEEKS) },
    content,
  );
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
