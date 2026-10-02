import { ALARM_RULES, ALARM_WORDS, type AlarmRule, BAND_NAMES, BAND_RANK, type Band, type MissionCard, QUIET_BONUS, QUIET_STANDING, rungBand } from './mission';
import { giverDef, POOL } from './missions';
import { Rng } from './rng';

/**
 * The weekly deck (docs/SPEC_HELLDESK_030_S1.md, S1b, owner decision D2):
 * every Monday a different hand of cards on your workstation, small and big,
 * quiet and loud, from different people, some after hours; the week's major
 * incident (P1) always one of them. Pure rules: the deal, and what a card
 * on the board is doing. The game deals on Monday (`Game.startWeek`), the
 * workstation shows it (os.ts), the lift goes to it (interact.ts).
 */

/** The week's floor P1 as a card on the board: today's floor and its boss, P1 rules. */
export const FLOOR_P1 = 'floor';

/** Where a card on the board stands. */
export type CardState = 'offered' | 'accepted' | 'done' | 'failed' | 'declined';

export interface DealtCard {
  /** A card's id (missions.ts), or FLOOR_P1. */
  readonly id: string;
  /** The week's major incident: mandatory, it opens Friday. */
  readonly p1: boolean;
  /** The card's alarm rule this week (D7); null for the floor P1, which plays as a floor always did. */
  readonly alarm: AlarmRule | null;
  /** After hours (D6): half the crowd, dimmer lights, the giver's after-hours pay. */
  readonly afterHours: boolean;
  /** Handed over in person by its giver on the hub (a "!" over them), not at the workstation. */
  readonly inPerson: boolean;
  /** The card's map, the same all week. */
  readonly seed: number;
  state: CardState;
}

export interface Deck {
  /** The week it was dealt for (-1: none dealt yet). */
  week: number;
  cards: DealtCard[];
}

export function emptyDeck(): Deck {
  return { week: -1, cards: [] };
}

/** How many cards a week deals, P1 included, by band (S1b "The weekly deck"). */
export const DECK_SIZE: Readonly<Record<Band, readonly [number, number]>> = {
  helpdesk: [3, 4],
  specialist: [4, 5],
  architect: [5, 7],
};

/** The story's last floor: the printer may stand in for the floor P1 only in Overtime (game.ts FINAL_FLOOR). */
export const STORY_FLOORS = 4;

/** Odds a Helpdesk Overtime week's P1 is the Printer Uprising rather than the floor. */
export const PRINTER_P1_ODDS = 1 / 3;

/** Odds a card other than the floor P1 is dealt after hours. */
export const AFTER_HOURS_ODDS = 0.25;

/** What the deal needs to know. */
export interface DealInput {
  readonly careerSeed: number;
  readonly week: number;
  /** The week's P1 floor (save.floor). */
  readonly floor: number;
  readonly rung: number;
  /** Last week's non-P1 card ids: this week's set must differ. */
  readonly previous: readonly string[];
  /** Cards that may not be dealt this week (a side quest in hand that tells the same story). */
  readonly exclude: readonly string[];
  /**
   * Dealt for a week already under way (a save from before the deck, or a
   * deck that did not read back): the P1 is the week's floor, whose progress
   * (its boss beaten, Friday open) the save already has.
   */
  readonly midWeek?: boolean;
}

function cardById(id: string): MissionCard | undefined {
  return POOL.find((c) => c.id === id);
}

/** The card behind a dealt card (undefined for the floor P1). */
export function deckCard(d: Pick<DealtCard, 'id'>): MissionCard | undefined {
  return d.id === FLOOR_P1 ? undefined : cardById(d.id);
}

/** Which alarm rules a card may be dealt (D7): loud cards one-way or cooldown, the rest any of the three. */
export function rulesFor(card: MissionCard): readonly AlarmRule[] {
  return card.style === 'loud' ? ['one-way', 'cooldown'] : ALARM_RULES;
}

/** Does a card's giver come to the hub (and so can hand it over in person, and be let down by it)? */
export function coworkerCard(card: MissionCard): boolean {
  return giverDef(card.giver.id)?.coworker === true;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/**
 * Deal a week (D2). Seeded by the career and the week: the same career on
 * the same week (and the same week before it) gets the same deck. The P1
 * plus a hand by band, drawn without repeats from the pool at or below the
 * player's band, never all one style (a non-loud and a non-sneaky card
 * whenever the pool allows), never last week's set again unless the band's
 * minimum leaves no other hand (the minimum wins); alarm rules dealt
 * per card, two different ones when there are three or more; some after
 * hours; about a third handed over in person by a coworker.
 */
export function deal(input: DealInput): Deck {
  const r = new Rng((Math.imul(input.careerSeed >>> 0, 0x2c1b3c6d) ^ Math.imul(input.week + 1, 0x297a2d39) ^ 0x6465636b) >>> 0);
  const band = rungBand(input.rung);
  const excluded = new Set(input.exclude);
  const seedFor = (k: number): number => (Math.imul(input.careerSeed >>> 0, 0x9e3779b1) ^ Math.imul(input.week * 31 + k + 1, 0x85ebca6b)) >>> 0;

  // The P1: the week's floor, unless this is a Helpdesk week of Overtime and the printers have risen instead.
  const printer = cardById('printer');
  const printerP1 = printer !== undefined && input.midWeek !== true && band === 'helpdesk' && input.floor > STORY_FLOORS && !excluded.has('printer') && r.chance(PRINTER_P1_ODDS);
  const cards: DealtCard[] = [
    printerP1 && printer !== undefined
      ? { id: printer.id, p1: true, alarm: r.pick(rulesFor(printer)), afterHours: r.chance(AFTER_HOURS_ODDS), inPerson: false, seed: seedFor(0), state: 'accepted' }
      : { id: FLOOR_P1, p1: true, alarm: null, afterHours: false, inPerson: false, seed: seedFor(0), state: 'accepted' },
  ];

  const eligible = POOL.filter((c) => c.p1 !== true && BAND_RANK[c.band] <= BAND_RANK[band] && !excluded.has(c.id));
  const [lo, hi] = DECK_SIZE[band];
  // The band's minimum comes first, from whatever the week's exclusions leave. Past it, one card is
  // left out whenever the pool allows, so next week can deal a different set.
  const least = Math.min(lo - 1, eligible.length);
  const room = eligible.length > least ? eligible.length - 1 : eligible.length;
  const want = Math.max(least, Math.min(r.int(lo, hi) - 1, room));
  // Last week's set again only when the minimum leaves no other hand to deal.
  const canDiffer = want < eligible.length;
  const previous = [...input.previous];
  const hasNonLoud = eligible.some((c) => c.style !== 'loud');
  const hasNonSneaky = eligible.some((c) => c.style !== 'sneaky');
  let hand: MissionCard[] = [];
  for (let attempt = 0; attempt < 64; attempt++) {
    const draw = r.shuffle([...eligible]).slice(0, want);
    const ids = draw.map((c) => c.id);
    if (hasNonLoud && want >= 2 && !draw.some((c) => c.style !== 'loud')) continue;
    if (hasNonSneaky && want >= 2 && !draw.some((c) => c.style !== 'sneaky')) continue;
    if (want > 0 && canDiffer && sameSet(ids, previous)) continue;
    hand = draw;
    break;
  }
  if (hand.length === 0 && want > 0) {
    // Never reached with the S1b pool (the gate deals 1600 weeks a band): a deterministic hand that still differs from last week.
    const rest = eligible.filter((c) => !previous.includes(c.id));
    hand = [...rest, ...eligible.filter((c) => previous.includes(c.id))].slice(0, want);
  }

  // Alarm rules, then make sure a hand of three or more has two different ones.
  const alarms = hand.map((c) => r.pick(rulesFor(c)));
  if (hand.length >= 3 && new Set(alarms).size < 2) {
    for (let k = hand.length - 1; k >= 0; k--) {
      const card = hand[k];
      const now = alarms[k];
      if (card === undefined || now === undefined) continue;
      const other = rulesFor(card).filter((x) => x !== now);
      if (other.length > 0) {
        alarms[k] = r.pick(other);
        break;
      }
    }
  }

  // About a third in person, from the cards whose giver is a coworker.
  const inPersonN = Math.round(hand.length / 3);
  const people = r.shuffle(hand.filter(coworkerCard).map((c) => c.id)).slice(0, inPersonN);

  hand.forEach((c, k) => {
    cards.push({
      id: c.id, p1: false, alarm: alarms[k] ?? c.alarm, afterHours: r.chance(AFTER_HOURS_ODDS), inPerson: people.includes(c.id),
      seed: seedFor(k + 1), state: 'offered',
    });
  });
  return { week: input.week, cards };
}

/** The non-P1 ids of a deck, for next week's deal. */
export function handIds(d: Deck): string[] {
  return d.cards.filter((c) => !c.p1).map((c) => c.id);
}

/** The pay multiplier on a dealt card: the giver's after-hours rate (D6), or 1 in the day. */
export function payRate(d: Pick<DealtCard, 'id' | 'afterHours'>): number {
  if (!d.afterHours) return 1;
  const card = deckCard(d);
  return card === undefined ? 1 : giverDef(card.giver.id)?.afterHours ?? 1;
}

/** Cards you hold: accepted, not finished, not the P1 (the P1 was never on your plate to choose). */
export function heldCards(d: Deck): DealtCard[] {
  return d.cards.filter((c) => !c.p1 && c.state === 'accepted');
}

const STATES: readonly CardState[] = ['offered', 'accepted', 'done', 'failed', 'declined'];

/** A saved deck, checked field by field: anything broken is dropped (a deck from an older build deals again). */
export function normalizeDeck(raw: unknown): Deck {
  if (typeof raw !== 'object' || raw === null) return emptyDeck();
  const o = raw as { week?: unknown; cards?: unknown };
  const week = typeof o.week === 'number' && Number.isInteger(o.week) ? o.week : -1;
  const cards: DealtCard[] = [];
  if (Array.isArray(o.cards)) {
    for (const x of o.cards as unknown[]) {
      const c = x as Partial<Record<keyof DealtCard, unknown>> | null;
      if (typeof c !== 'object' || c === null || typeof c.id !== 'string' || (c.id !== FLOOR_P1 && cardById(c.id) === undefined)) continue;
      if (!STATES.includes(c.state as CardState) || typeof c.seed !== 'number') continue;
      const alarm = ALARM_RULES.includes(c.alarm as AlarmRule) ? c.alarm as AlarmRule : null;
      cards.push({ id: c.id, p1: c.p1 === true, alarm, afterHours: c.afterHours === true, inPerson: c.inPerson === true, seed: c.seed >>> 0, state: c.state as CardState });
    }
  }
  return cards.some((c) => c.p1) ? { week, cards } : emptyDeck();
}

/** A card as the workstation shows it (S1b "Your workstation"): everything the player decides on, in words. */
export interface CardView {
  readonly index: number;
  readonly id: string;
  readonly title: string;
  readonly giver: string;
  /** The giver is a coworker on the hub (declining costs a little with them). */
  readonly coworker: boolean;
  readonly size: string;
  readonly style: string;
  readonly band: string;
  readonly pay: string;
  readonly deadline: string;
  readonly afterHours: boolean;
  /** The alarm rule in plain words (D7). */
  readonly rule: string;
  readonly place: string;
  readonly state: CardState;
  readonly inPerson: boolean;
  readonly p1: boolean;
}

/** The week's floor P1 as the board names it. */
export interface FloorP1 {
  readonly title: string;
  readonly place: string;
}

/** What the workstation shows for a dealt card. */
export function cardView(d: DealtCard, index: number, floor: FloorP1): CardView {
  const card = deckCard(d);
  if (card === undefined) {
    return {
      index, id: d.id, title: floor.title, giver: 'The Service Desk', coworker: false, size: 'Project', style: 'Loud', band: 'Every band',
      pay: 'The boss\'s bounty, and Friday', deadline: 'Friday (it opens Friday)', afterHours: false, rule: 'A floor as it always was: everyone hostile on sight.',
      place: floor.place, state: d.state, inPerson: false, p1: true,
    };
  }
  const rate = payRate(d);
  const base = Math.round(card.value * rate);
  const bonus = Math.round(card.value * QUIET_BONUS * rate);
  const quiet = card.style === 'loud' ? '' : `, +₡${bonus} and Management +${QUIET_STANDING.management}, Staff +${QUIET_STANDING.staff} if nobody notices`;
  return {
    index, id: card.id, title: card.title, giver: card.giver.name, coworker: coworkerCard(card),
    size: card.size === 'task' ? 'Task' : 'Project', style: card.style[0]?.toUpperCase() + card.style.slice(1), band: BAND_NAMES[card.band],
    pay: `₡${base}${quiet}${d.afterHours && rate !== 1 ? ` (after-hours rate x${rate})` : ''}`,
    deadline: card.sla !== undefined ? `A ${card.sla} s clock, once started` : 'Friday',
    afterHours: d.afterHours, rule: ALARM_WORDS[d.alarm ?? card.alarm], place: card.place, state: d.state, inPerson: d.inPerson, p1: d.p1,
  };
}

/** Standing with a coworker a declined card costs (S1b: "a little"). */
export const DECLINE_RAPPORT = 2;
