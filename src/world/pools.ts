/**
 * What a shop has to deal with, taken apart into the pieces a week is made of
 * (E11, 0.31.0 slice 2).
 *
 * A `DayScript` is a table: fourteen columns, five rows, every cell written by
 * hand against one shop. This module reads that table backwards - it takes the
 * four shipped weeks apart into the units a generator can move about, and it
 * does it WITHOUT a second copy of the content. There is no new week here and
 * no new ticket: every entry below is a slice of a table that already ships,
 * carrying the day it was authored on so the pieces can be put back exactly as
 * they were found. That round trip is the acceptance gate for the whole slice
 * (`week-gen.test.ts`), and it is only meaningful because the decomposition is
 * derived rather than transcribed - a hand-copied pool would agree with the
 * table because somebody typed it twice, which proves nothing about either.
 *
 * THE UNIT IS NOT THE TICKET. The spike is emphatic about this and it is the
 * correction that makes the rest work: sampling tickets into days is how you
 * get two weeks with wildly different weight. The unit here is an ENTRY - one
 * cell of one column, with the tickets it puts on the desk and the minutes it
 * costs - and entries are grouped into BEATS where the content couples them.
 *
 * WHAT COUPLES. Three kinds, and only the third is written down by hand:
 *
 *  - mechanical coupling, read off the ids. A room post carrying `request:` is
 *    the third coat of that request and the loader already refuses it alone
 *    (I30). A reply belongs with the message it answers, or the thread has no
 *    root. A post naming a ticket belongs with the day that deals it, which is
 *    what makes Bodgeworth's storm a storm rather than nine jokes and a fault.
 *  - the same incident on two days is one arc. The two cleaner outages are at
 *    the same minute two days apart and the whole clue is that the Event Viewer
 *    holds them four lines apart, so they move together or not at all.
 *  - and the semantic couplings a machine cannot see, declared in `BINDINGS`
 *    with the line of content that justifies each. There are two of them in the
 *    whole game and both are gated: a binding naming a shop this build does not
 *    have, or an id no week deals, is a boot failure - so the table cannot rot
 *    quietly, which it had already started to do before the gate existed.
 *
 * WHAT IS PINNED. A beat carries the days it is ALLOWED to anchor on rather
 * than the day it happens to be on - the spike's third correction, and the
 * reason the arc survives being moved. The rules are the loader's own, read up
 * one level: a night's pings and pages have no morning after the last day
 * (I19, I22), the 4:55 class needs a tomorrow for the hour it carries into,
 * a beat spanning k days cannot anchor closer than k days from Friday.
 *
 * Nothing here dispatches, reads a clock, or consumes the engine's RNG.
 */

import type { AfterHoursSlot } from './after-hours';
import type { ChannelMessageSlot } from './channels';
import { EMPLOYER_IDS, type Employer } from './employers';
import type { InterruptionSlot } from './interruptions';
import type { OnCallPage } from './on-call';
import type { LinkedRequestSlot } from './requests';
import {
  arrivesBeforeClose,
  MAX_INHERITED,
  WEEK_DAYS,
  type DayScript,
  type DmSlot,
  type DripSlot,
  type IncidentSlot,
  type NoHelloSlot,
  type OnboardingSlot,
  type WalkUpSlot,
} from './week';

/**
 * The arc position whose week is AUTHORED rather than drawn.
 *
 * Every shop's first week is a hand-written table and stays one. That is a
 * content decision with the whole external record behind it - Slay the Spire
 * deals floor 1 from the easy pool only, Left 4 Dead exempts its boss beats
 * from the pacer, Against the Storm pins the legendary cornerstone to years
 * two, four and six - and it is the same decision the shop already made: the
 * probation Monday is the day the two basic tools are taught, and a Monday
 * that sometimes teaches them and sometimes does not is not a teaching day.
 *
 * It is named here, once, so that "the generator reproduces the shipped weeks"
 * says exactly what it means: the shipped week IS week one, placed by the same
 * machinery that places a drawn one and put through the same budget, the same
 * quotas and the same loader. What reproduction proves is that the pipeline can
 * express every construct the four hand-written weeks use. What it does not
 * prove is the DRAW, because at week one there is nothing to draw - see
 * `week-gen.ts` for the arithmetic of why, and the sweep for what does prove it.
 */
export const AUTHORED_WEEK = 1;

/** What the brief calls each day. The same five words in all four shops. */
export const DAY_LABELS: readonly string[] = Object.freeze([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
]);

/**
 * The columns an entry can occupy - the day-shape categories, which is what
 * the quota table counts and what the slot layout has capacity rules about.
 */
export const COLUMNS = [
  'inherited',
  'drip',
  'incidents',
  'dms',
  'interruptions',
  'walkUps',
  'noHello',
  'channels',
  'requests',
  'afterHours',
  'onCall',
  'onboarding',
] as const;

export type Column = (typeof COLUMNS)[number];

/** One entry's contribution to a day: the cells it writes, and nothing else. */
export interface DayFragment {
  readonly inherited?: readonly string[];
  readonly drip?: readonly DripSlot[];
  readonly incidents?: readonly IncidentSlot[];
  readonly dms?: readonly DmSlot[];
  readonly interruptions?: readonly InterruptionSlot[];
  readonly walkUps?: readonly WalkUpSlot[];
  readonly noHello?: readonly NoHelloSlot[];
  readonly channels?: readonly ChannelMessageSlot[];
  readonly requests?: readonly LinkedRequestSlot[];
  readonly afterHours?: readonly AfterHoursSlot[];
  readonly onCall?: readonly OnCallPage[];
  readonly onboarding?: readonly OnboardingSlot[];
}

/** One cell of one column, with everything a budget or a draw needs of it. */
export interface ContentEntry {
  /** Stable across runs and unique within the shop: column, day, position. */
  readonly id: string;
  /** The day the authored table put it on. The only thing a plan may change. */
  readonly homeDay: number;
  /** Where in its column it sat, so a reassembled day keeps the written order. */
  readonly order: number;
  readonly column: Column;
  readonly fragment: DayFragment;
  /** The days this entry is ALLOWED on, before anything else constrains it. */
  readonly allowedDays: readonly number[];
  /**
   * How often it should turn up relative to its neighbours.
   *
   * One for everything today, because weights are authorial and there is no
   * author for them yet: the four shipped weeks say what is in a week, not how
   * often a thing should recur across a career. It is a field rather than an
   * absence so the draw is already weighted the day somebody writes the table.
   */
  readonly weight: number;
}

/** Entries that move together, and the shape of the move. */
export interface Beat {
  readonly id: string;
  /** Its members, each with the offset in days it holds from the anchor. */
  readonly members: readonly { readonly at: number; readonly entry: ContentEntry }[];
  /** How many days it occupies, counting the anchor. */
  readonly span: number;
  /** The anchor days it may take, narrowest of every member's own list. */
  readonly allowedDays: readonly number[];
  /** Where the authored table anchored it. */
  readonly homeAnchor: number;
}

/** What a day is called, how heavy it is meant to be, and the lead's twist. */
export interface DayShape {
  readonly day: number;
  readonly label: string;
  readonly load: number;
  readonly patrolSeed: number;
}

/** How many of a column a day may hold, measured off the authored week. */
export interface ColumnQuota {
  readonly least: number;
  readonly most: number;
}

/** Everything one shop can be dealt, and the shape its weeks take. */
export interface EmployerContent {
  readonly employer: string;
  /** The authored week's own shapes: labels, the ramp, the authored twists. */
  readonly shapes: readonly DayShape[];
  readonly beats: readonly Beat[];
  readonly pool: readonly ContentEntry[];
  readonly quotas: Readonly<Record<Column, ColumnQuota>>;
  /**
   * The days this shop authors with nothing on the desk at all.
   *
   * Bodgeworth's Friday is five tickets' worth of week running out on the
   * Thursday, and that is the whole contrast that shop is for. Every other day
   * of every other shop deals something, and the loader has never said so -
   * there was no need while a human wrote each table, and there is a need the
   * moment a draw can come up empty. A blank Tuesday would not throw, would not
   * look like a bug, and would read as a quiet day rather than as content that
   * failed to arrive. So the exemption is a fact about the shop, named here and
   * refused everywhere else.
   */
  readonly dealsNothing: ReadonlySet<number>;
  /** The rooms this shop rolled out, for the loader's channel check. */
  readonly rooms: ReadonlySet<string>;
}

/**
 * The couplings no machine can see, one line of content each.
 *
 * Kept to the two the shipped weeks actually have. Each is gated by
 * `contentFrom`, which refuses a binding naming an entry the week does not
 * hold - so a binding cannot outlive the content it binds, which is the only
 * way a table like this stays honest through a content change.
 */
const BINDINGS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  /**
   * The recurring arc. The cleaner wants the socket at four minutes to five on
   * the Monday and again on the Wednesday; the ticket about the first is
   * Tuesday's morning pile and the ticket about the second is Thursday's, and
   * the clue is that the Event Viewer holds both power losses four lines
   * apart. Four artifacts, one beat: move any of them alone and the second
   * ticket closes on power, which is the arc with its point taken out.
   */
  workgrumble: [[
    'incidents#1.0',
    'inherited#2.0',
    'incidents#3.1',
    'inherited#4.0',
  ]],
  /**
   * The onboarding capstone. Tillman signs at ten and the backup discovery
   * drips at twenty past - "once there is a client to audit" - so the drip is
   * a fact about the signing rather than a ticket that happens to be Wednesday.
   */
  msp: [['onboarding#3.0', 'drip#3.1']],
  // Bodgeworth needs none: the reply-all storm binds itself. Message eight of
  // ten names the drive that fell over, the drip for it lands on the same
  // minute, and the other nine are replies into one thread - so the ticket,
  // the signal and the cake all arrive in one group off the ids alone.
};

/**
 * A binding keyed on a shop this build does not have is a coupling that never
 * happens, and nothing else would ever say so: the table is read by id, a miss
 * reads as "this shop has no bindings", and the arc it was meant to hold
 * together comes apart quietly. It cost this slice one wrong key already - the
 * MSP is registered as `msp` and the table said `fettle_crane` - so the check
 * is at module load, where the rest of this codebase puts its refusals.
 */
for (const keyed of Object.keys(BINDINGS)) {
  if (!(EMPLOYER_IDS as readonly string[]).includes(keyed)) {
    throw new Error(
      `The coupling table binds content at "${keyed}", and no employer in this `
      + 'build is called that. A binding nobody reads is an arc nobody holds.',
    );
  }
}

function fragmentFor(column: Column, cell: unknown): DayFragment {
  return { [column]: [cell] };
}

/** The tickets an entry can put on the desk, for the budget arithmetic. */
function ticketsOf(column: Column, cell: unknown): readonly string[] {
  switch (column) {
    case 'inherited':
      return [cell as string];
    case 'drip':
      return [(cell as DripSlot).ticketId];
    case 'dms':
      return [(cell as DmSlot).raises];
    case 'walkUps':
      return [(cell as WalkUpSlot).raises];
    case 'requests':
      return [(cell as LinkedRequestSlot).raises];
    default:
      return [];
  }
}

/**
 * Which days this cell may sit on, read off the loader's own refusals.
 *
 * Nothing invented: a ping or a page authored on the last day has no morning
 * to be read on and `validateWeek` throws (I19, I22), and the 4:55 class
 * carries most of its response window into a tomorrow, which the feasibility
 * auditor spends two shifts looking for and Friday does not have.
 */
function daysFor(column: Column, cell: unknown): readonly number[] {
  const all = Array.from({ length: WEEK_DAYS }, (_, index) => index + 1);

  if (column === 'afterHours' || column === 'onCall') {
    return all.filter((day) => day !== WEEK_DAYS);
  }

  if (column === 'drip' && arrivesBeforeClose(cell as DripSlot)) {
    return all.filter((day) => day !== WEEK_DAYS);
  }

  return all;
}

function cellsOf(script: Readonly<DayScript>, column: Column): readonly unknown[] {
  return column === 'inherited' ? script.inherited : script[column] ?? [];
}

function entriesOf(week: readonly DayScript[]): readonly ContentEntry[] {
  const entries: ContentEntry[] = [];

  for (const script of week) {
    for (const column of COLUMNS) {
      cellsOf(script, column).forEach((cell, order) => {
        entries.push({
          id: idOf(column, script.day, order),
          homeDay: script.day,
          order,
          column,
          fragment: fragmentFor(column, cell),
          allowedDays: daysFor(column, cell),
          weight: 1,
        });
      });
    }
  }

  return entries;
}

function idOf(column: Column, day: number, order: number): string {
  return `${column}#${String(day)}.${String(order)}`;
}

/** The mechanical couplings, as pairs of entry ids to be unioned. */
function mechanicalPairs(
  week: readonly DayScript[],
): readonly (readonly [string, string])[] {
  const pairs: (readonly [string, string])[] = [];
  const incidentHomes = new Map<string, string>();
  const messageHomes = new Map<string, string>();
  const requestHomes = new Map<string, string>();
  const ticketHomes = new Map<string, string>();

  for (const script of week) {
    for (const column of COLUMNS) {
      cellsOf(script, column).forEach((cell, order) => {
        const self = idOf(column, script.day, order);

        if (column === 'channels') {
          messageHomes.set((cell as ChannelMessageSlot).id, self);
        }

        if (column === 'requests') {
          requestHomes.set((cell as LinkedRequestSlot).id, self);
        }

        for (const ticket of ticketsOf(column, cell)) {
          ticketHomes.set(`${String(script.day)}:${ticket}`, self);
        }
      });
    }
  }

  for (const script of week) {
    (script.incidents ?? []).forEach((slot, order) => {
      const self = idOf('incidents', script.day, order);
      const seen = incidentHomes.get(slot.incidentId);

      if (seen === undefined) {
        incidentHomes.set(slot.incidentId, self);
      } else {
        pairs.push([seen, self]);
      }
    });

    (script.channels ?? []).forEach((slot, order) => {
      const self = idOf('channels', script.day, order);
      const answered = slot.replyTo === undefined
        ? undefined
        : messageHomes.get(slot.replyTo);
      const request = slot.request === undefined
        ? undefined
        : requestHomes.get(slot.request);
      const about = slot.relatedTicket === undefined
        ? undefined
        : ticketHomes.get(`${String(script.day)}:${slot.relatedTicket}`);

      for (const other of [answered, request, about]) {
        if (other !== undefined && other !== self) {
          pairs.push([self, other]);
        }
      }
    });
  }

  return pairs;
}

class Groups {
  private readonly parent = new Map<string, string>();

  public find(id: string): string {
    const seen = this.parent.get(id);

    if (seen === undefined || seen === id) {
      this.parent.set(id, id);

      return id;
    }

    const root = this.find(seen);
    this.parent.set(id, root);

    return root;
  }

  public union(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);

    if (a !== b) {
      this.parent.set(a, b);
    }
  }
}

function beatFrom(id: string, members: readonly ContentEntry[]): Beat {
  const anchor = Math.min(...members.map((entry) => entry.homeDay));
  const span = Math.max(...members.map((entry) => entry.homeDay)) - anchor + 1;
  const placed = members.map((entry) => ({ at: entry.homeDay - anchor, entry }));
  const allowed: number[] = [];

  for (let day = 1; day + span - 1 <= WEEK_DAYS; day += 1) {
    if (placed.every((member) => member.entry.allowedDays.includes(day + member.at))) {
      allowed.push(day);
    }
  }

  return { id, members: placed, span, allowedDays: allowed, homeAnchor: anchor };
}

/** The surplus, as entries with no day of their own. */
function spareEntries(spare: readonly DayFragment[]): readonly ContentEntry[] {
  return spare.map((fragment, order) => {
    const held = fragment as Record<string, readonly unknown[] | undefined>;
    const column = COLUMNS.find((name) => (held[name] ?? []).length > 0);

    if (column === undefined) {
      throw new Error(
        `Spare entry ${String(order)} writes no column anybody deals.`,
      );
    }

    const cell = held[column]?.[0];

    return {
      id: `spare#${String(order)}`,
      // No home: the authored week is the one table a spare may not be in.
      homeDay: 0,
      order,
      column,
      fragment,
      allowedDays: daysFor(column, cell),
      weight: 1,
    };
  });
}

function quotasFrom(week: readonly DayScript[]): Record<Column, ColumnQuota> {
  const quotas = {} as Record<Column, ColumnQuota>;

  for (const column of COLUMNS) {
    const counts = week.map((script) => cellsOf(script, column).length);
    const most = Math.max(...counts);

    quotas[column] = {
      // The floor is what EVERY day of the authored week carries, so a shop
      // whose Fridays deal nothing keeps being allowed to; the ceiling is the
      // heaviest day it wrote, capped for the morning pile by the loader's own
      // refusal rather than by whatever the table happened to use.
      least: Math.min(...counts),
      most: column === 'inherited' ? Math.min(most, MAX_INHERITED) : most,
    };
  }

  return quotas;
}

/**
 * One shop, taken apart.
 *
 * Throws rather than guesses on a binding that names nothing: a coupling table
 * whose ids have drifted is a generator that will quietly split an arc, and
 * quiet wrongness in this codebase is a boot failure with a sentence on it.
 */
export function contentFrom(
  employerId: string,
  week: readonly DayScript[],
  rooms: ReadonlySet<string>,
  /**
   * Entries the shop can be dealt that its authored week does not use.
   *
   * The surplus, and the whole of what week two is made of. Nothing ships one
   * yet - this version adds no content - so the parameter is empty everywhere
   * in the product and is the seam the next slice's fifty-entry drip pool
   * arrives through. A spare has no home day, which is exactly right: it can
   * be drawn into any week but the authored one, and the authored one is the
   * table somebody wrote.
   */
  spare: readonly DayFragment[] = [],
): EmployerContent {
  const entries = [...entriesOf(week), ...spareEntries(spare)];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const groups = new Groups();

  for (const [left, right] of mechanicalPairs(week)) {
    groups.union(left, right);
  }

  for (const binding of BINDINGS[employerId] ?? []) {
    for (const id of binding) {
      if (!byId.has(id)) {
        throw new Error(
          `${employerId} binds "${id}", and its week has no such entry. A `
          + 'coupling table whose ids have drifted is an arc waiting to be '
          + 'split across two weeks that each make no sense.',
        );
      }
    }

    for (const id of binding.slice(1)) {
      groups.union(binding[0] ?? id, id);
    }
  }

  const clustered = new Map<string, ContentEntry[]>();

  for (const entry of entries) {
    const root = groups.find(entry.id);
    const bucket = clustered.get(root);

    if (bucket === undefined) {
      clustered.set(root, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  const beats: Beat[] = [];
  const pool: ContentEntry[] = [];

  for (const [root, members] of clustered) {
    if (members.length === 1 && members[0] !== undefined) {
      pool.push(members[0]);
    } else {
      beats.push(beatFrom(root, members));
    }
  }

  return {
    employer: employerId,
    shapes: week.map((script) => ({
      day: script.day,
      label: script.label,
      load: script.load,
      patrolSeed: script.patrolSeed,
    })),
    beats,
    pool,
    quotas: quotasFrom(week),
    dealsNothing: new Set(
      week
        .filter((script) => script.inherited.length + script.drip.length === 0)
        .map((script) => script.day),
    ),
    rooms,
  };
}

/**
 * Keyed on the SHOP rather than on its id, because a test may stand up a
 * fixture company the registry has never heard of and two fixtures are allowed
 * to share a name. An id-keyed cache would hand the second one the first one's
 * week, which is the same class of quiet wrongness this whole module exists to
 * refuse.
 */
const CONTENT = new WeakMap<Employer, EmployerContent>();

/**
 * The shop's content, taken apart once and remembered.
 *
 * Cached because a session is stood up thousands of times across the suite and
 * the decomposition is a pure function of a frozen table - and because the day
 * the driver asks for a week on every reload, the answer has to be cheap.
 */
export function contentFor(employer: Employer): EmployerContent {
  const cached = CONTENT.get(employer);

  if (cached !== undefined) {
    return cached;
  }

  const built = contentFrom(
    employer.id,
    employer.week,
    new Set(employer.channels.map((room) => room.id)),
  );

  CONTENT.set(employer, built);

  return built;
}
