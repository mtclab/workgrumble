import type { ActorKind, EliteAffix, HelperRole } from './entities';
import type { Mood, Point, Sort, Tier } from './stealth';
import type { RecipeId } from './templates';

/**
 * Mission cards (docs/SPEC_HELLDESK_030.md 2.4-2.6, docs/SPEC_HELLDESK_030_S1.md
 * S1b): what a card is, how a run of one is tracked, and what finishing it
 * pays. No three.js and no DOM here; `missionplay.ts` puts a card into the
 * game, `missions.ts` holds the cards and `deck.ts` deals them each week.
 */

/**
 * D7: how a card's alarm behaves (the Watch in stealth.ts plays it).
 * 'one-way': tiers only go up (the spike's model). 'search': a person at
 * Alert who has lost you for 8 seconds searches (a countdown over their
 * head, walking to where they last saw you) and drops to Noticed at zero;
 * Escalated stays; the mission's tier follows the highest person.
 * 'cooldown': any tier, Escalated included, drops one step after 45 seconds
 * with nobody seeing you and no fighting, announced like a rise.
 */
export type AlarmRule = 'one-way' | 'search' | 'cooldown';
export const ALARM_RULES: readonly AlarmRule[] = ['one-way', 'search', 'cooldown'];

/** The card's intended play (spec 2.2). Every sneaky card can be played loud. */
export type Style = 'sneaky' | 'loud' | 'mixed' | 'social' | 'escort';

/** A small job or a big one. */
export type Size = 'task' | 'project';

/** The career rung band a card is pitched at (spec 2.6): Helpdesk 0-3, Specialist 4-9, Architect 10-11. */
export type Band = 'helpdesk' | 'specialist' | 'architect';

/** Where a card's map comes from: a template recipe, or today's generator ('large'). */
export type CardRecipe = RecipeId | 'large';

export type Objective =
  /** Take this quest item from the locked closet in HR's office. */
  | { readonly kind: 'take'; readonly item: string; readonly text: string }
  /** Resolve this many of these people (any road: in combat or talked down); with `tag`, only the card's people of that tag. */
  | { readonly kind: 'resolve'; readonly who: ActorKind; readonly count: number; readonly text: string; readonly tag?: string }
  /** Pick up `count` of the `of` copies of this item the card scatters over the map. */
  | { readonly kind: 'collect'; readonly item: string; readonly count: number; readonly of: number; readonly text: string }
  /** Bring the card's person of this tag to the Internal IT counter. */
  | { readonly kind: 'escort'; readonly who: string; readonly text: string }
  /** Fix the computer in the room of this tag (E on it), then whatever the card asks there. */
  | { readonly kind: 'fix'; readonly room: string; readonly text: string };

/** Who the card puts on the map, where (a footprint tag, or 'node': a corridor node) and how they spend the day. */
export interface CrowdSpec {
  readonly kind: ActorKind;
  readonly room: string;
  readonly sort: Sort;
  readonly count?: number;
  /** The card's own name for them ('hr'): the stapler is quiet only if HR never noticed you. */
  readonly tag?: string;
  readonly name?: string;
  /** Expecting you (the people at a debrief): seeing you raises nothing; noise and crime still do. */
  readonly expected?: true;
  /** A patroller whose route also crosses the service spine, at one point (the stapler's tuning). */
  readonly crossesSpine?: true;
  /** A helper's role (Josh is an intern), and an elite's affix. */
  readonly role?: HelperRole;
  readonly elite?: EliteAffix;
  /** A hostile pocket (the vendors' pitch): watched, but quick to see you (their suspicion rises three times as fast). */
  readonly pocket?: true;
  /** Every one of this spec in the same room (three at one meeting table). */
  readonly together?: true;
}

/** Who hands a card out (D6): a coworker on the hub, or a department. */
export interface Giver {
  readonly id: string;
  readonly name: string;
}

/** What failing a card costs (spec 2.5): standing, and (`hostile`) the giver after you on the hub on your next visit. */
export interface Failure {
  readonly hostile: boolean;
  readonly management: number;
  readonly staff: number;
  readonly text: string;
}

/** What going loud does on the card besides the tier (the stapler's tuning): a harder lock, and somebody called in. */
export interface OnLoud {
  /** Added to the objective closet's lock difficulty. */
  readonly lock?: number;
  /** Who is called, and the line that announces it. */
  readonly summon?: CrowdSpec & { readonly line: string };
}

export interface MissionCard {
  readonly id: string;
  /** Its number in the spec's starter catalogue. */
  readonly number: number;
  readonly title: string;
  /** The place named on the HUD, independent of the floor's look. */
  readonly place: string;
  /** Who put it on the board, and what they said. */
  readonly source: string;
  readonly voice: string;
  readonly style: Style;
  readonly size: Size;
  readonly band: Band;
  readonly giver: Giver;
  readonly recipe: CardRecipe;
  /** The floor its people are rolled for (and its look). A 'large' card is played on the week's floor instead. */
  readonly floor: number;
  /** Rep the card is worth (spec 2.4: base, the same both ways). */
  readonly value: number;
  readonly objective: Objective;
  readonly crowd: readonly CrowdSpec[];
  /** A watcher who must never reach Investigate for the finish to count as quiet. */
  readonly unseenBy?: string;
  /** What going loud means on this card, for the briefing. */
  readonly loud: string;
  /** The alarm rule the card plays by when nothing else says (the deck deals one per week). */
  readonly alarm: AlarmRule;
  readonly failure: Failure;
  /** A major incident (P1): on the board every week it is dealt, it opens Friday, and it is never aborted, only left. */
  readonly p1?: true;
  /** A P1's clock (seconds of play on its map): run out and the card has failed. */
  readonly sla?: number;
  readonly onLoud?: OnLoud;
  /** The side quest this card retells: never dealt while that quest is in hand, and not offered the week the card is. */
  readonly sibling?: string;
}

/** Spec 2.4: a quiet finish pays the card plus 40%, and +3 Management, +2 Staff. */
export const QUIET_BONUS = 0.4;
export const QUIET_STANDING = { management: 3, staff: 2 } as const;

/** D7: the alarm rule in the words the card and the mission HUD print. */
export const ALARM_WORDS: Readonly<Record<AlarmRule, string>> = {
  'one-way': 'Once they know, they know.',
  search: 'Lose them and they search, then give up.',
  cooldown: 'It blows over.',
};

/** The band of a career rung (spec 2.6). */
export function rungBand(rung: number): Band {
  return rung >= 10 ? 'architect' : rung >= 4 ? 'specialist' : 'helpdesk';
}

export const BAND_RANK: Readonly<Record<Band, number>> = { helpdesk: 0, specialist: 1, architect: 2 };
export const BAND_NAMES: Readonly<Record<Band, string>> = { helpdesk: 'Helpdesk', specialist: 'Specialist', architect: 'Architect' };

/** How a card ends: done (the objective, then the lift), aborted at the lift, burned out on it, or failed (its own failure, spec 2.5). */
export type Finish = 'done' | 'aborted' | 'burnout' | 'failed';

export interface Outcome {
  readonly finish: Finish;
  /** The highest escalation the mission reached. */
  readonly maxTier: Tier;
  /** The card's `unseenBy` watcher noticed you. */
  readonly spoiled: boolean;
  /** Rep the resolves on the card really paid as they happened (the employer's rate and a talk-down's cut applied). */
  readonly resolvedRep: number;
  readonly seconds: number;
}

export interface Payout {
  readonly quiet: boolean;
  /** Paid at the finish: the card, and the quiet bonus. */
  readonly base: number;
  readonly bonus: number;
  /** Paid already, one resolve at a time (shown, not paid again). */
  readonly perResolve: number;
  readonly management: number;
  readonly staff: number;
}

/** Quiet: done, never above Noticed, and not noticed by the one who mattered. */
export function quietFinish(o: Outcome): boolean {
  return o.finish === 'done' && o.maxTier <= 1 && !o.spoiled;
}

/**
 * What a finish pays (spec 2.4). Both ways pay the card's value; quiet adds
 * 40% and the standing, loud has had the resolves. An abort or a burnout pays
 * nothing more than the resolves already had.
 */
export function payout(card: MissionCard, o: Outcome, rate = 1): Payout {
  if (o.finish !== 'done') return { quiet: false, base: 0, bonus: 0, perResolve: o.resolvedRep, management: 0, staff: 0 };
  const quiet = quietFinish(o);
  // `rate`: the giver's after-hours pay (D6), on the card and its quiet bonus alike.
  return {
    quiet,
    base: Math.round(card.value * rate),
    bonus: quiet ? Math.round(card.value * QUIET_BONUS * rate) : 0,
    perResolve: o.resolvedRep,
    management: quiet ? QUIET_STANDING.management : 0,
    staff: quiet ? QUIET_STANDING.staff : 0,
  };
}

/** A run as a save keeps it (S1b: a reload mid-mission). People are counted by their place in the card's crowd. */
export interface RunSave {
  readonly seconds: number;
  readonly maxTier: Tier;
  readonly spoiled: boolean;
  readonly resolvedRep: number;
  readonly progress: number;
  readonly objectiveDone: boolean;
  readonly counted: readonly number[];
}

/** One of the card's people as a save keeps them, by their place in the crowd. */
export interface PersonSave {
  readonly i: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly hp: number;
  readonly resolved: boolean;
  readonly aggro: boolean;
  readonly suspicion: number;
  readonly peak: number;
  readonly mood: Mood;
  readonly countdown: number;
  readonly spot: Point | null;
  /** Rep a vendor billed you and still owes back: resolve them and it is refunded. */
  readonly stolen?: number;
  /** Talked to already: one talk-down (a failed one stays failed), one promotion pitch. */
  readonly talked?: boolean;
  /** Seconds left of a rage (a failed talk-down, an escalating elite at half health). */
  readonly enragedT?: number;
  /** The one-off conversation beats had with them (not the moment's: entities.ts `lastingMemo`). */
  readonly memo?: readonly string[];
  /** Something already given you. */
  readonly gift?: boolean;
  /** A vendor making off after a grab: seconds of it left. */
  readonly fleeT?: number;
}

/** Everything a mission keeps across a save (S1b "Saves"): the run, the alarm, the people, what was picked up. */
export interface PlaySave {
  readonly run: RunSave;
  readonly tier: Tier;
  readonly quietT: number;
  readonly people: readonly PersonSave[];
  /** The card's scattered copies already picked up, by their place in the scatter. */
  readonly collected: readonly number[];
  /** The card's going-loud already happened (the closet bolted, somebody called). */
  readonly loudDone: boolean;
  /** An escort's nerve, 0-100. */
  readonly nerve: number;
  readonly repAtStart: number;
  readonly managementAtStart: number;
  readonly staffAtStart: number;
  readonly detectedAt: number | null;
  readonly noticedAt: number | null;
  readonly noiseEvents: number;
}

/** One run of a card: the clock, the objective, the escalation reached, the resolves. */
export class MissionRun {
  seconds = 0;
  maxTier: Tier;
  spoiled = false;
  resolvedRep = 0;
  /** Resolves (or pickups) counted toward a 'resolve' or 'collect' objective. */
  progress = 0;
  objectiveDone = false;
  outcome: Outcome | null = null;
  private readonly counted = new Set<number>();

  constructor(readonly card: MissionCard, startTier: Tier, from?: RunSave) {
    this.maxTier = startTier;
    if (from === undefined) return;
    this.seconds = from.seconds;
    this.maxTier = Math.max(startTier, from.maxTier) as Tier;
    this.spoiled = from.spoiled;
    this.resolvedRep = from.resolvedRep;
    this.progress = from.progress;
    this.objectiveDone = from.objectiveDone;
    for (const k of from.counted) this.counted.add(k);
  }

  save(): RunSave {
    return {
      seconds: this.seconds, maxTier: this.maxTier, spoiled: this.spoiled, resolvedRep: this.resolvedRep,
      progress: this.progress, objectiveDone: this.objectiveDone, counted: [...this.counted],
    };
  }

  /** Has this one of the crowd (by place in it) been counted already? */
  hasCounted(key: number): boolean {
    return this.counted.has(key);
  }

  get over(): boolean {
    return this.outcome !== null;
  }

  tick(dt: number): void {
    if (!this.over) this.seconds += dt;
  }

  /** The mission's tier now: the run remembers the highest. */
  tier(t: Tier): void {
    if (t > this.maxTier) this.maxTier = t;
  }

  /** Someone of the card's crowd (`key`: their place in it) was resolved, paying `rep` (what the balance really moved by); each counts once. */
  resolved(key: number, kind: ActorKind, rep: number, tag: string | null = null): void {
    if (this.over || this.counted.has(key)) return;
    this.counted.add(key);
    this.resolvedRep += rep;
    const ob = this.card.objective;
    if (ob.kind === 'resolve' && kind === ob.who && (ob.tag === undefined || ob.tag === tag)) {
      this.progress += 1;
      if (this.progress >= ob.count) this.objectiveDone = true;
    }
  }

  /** One of the card's scattered copies picked up. */
  collected(): void {
    const ob = this.card.objective;
    if (this.over || ob.kind !== 'collect') return;
    this.progress += 1;
    if (this.progress >= ob.count) this.objectiveDone = true;
  }

  /** The escort is at the counter, or the fix is in: the objective's own end. */
  reached(): void {
    const ob = this.card.objective;
    if (!this.over && (ob.kind === 'escort' || ob.kind === 'fix')) this.objectiveDone = true;
  }

  /** The card's item is in your hands. */
  took(item: string): void {
    const ob = this.card.objective;
    if (!this.over && ob.kind === 'take' && ob.item === item) this.objectiveDone = true;
  }

  /** A watcher with this tag reached Investigate. */
  noticedBy(tag: string | null): void {
    if (!this.over && tag !== null && tag === this.card.unseenBy) this.spoiled = true;
  }

  /** Close the card. `done` needs the objective; the payout (at `rate`, the after-hours pay) is the caller's to apply, once. */
  finish(how: Finish, rate = 1): { outcome: Outcome; pay: Payout } | null {
    if (this.over || (how === 'done' && !this.objectiveDone)) return null;
    const outcome: Outcome = { finish: how, maxTier: this.maxTier, spoiled: this.spoiled, resolvedRep: this.resolvedRep, seconds: this.seconds };
    this.outcome = outcome;
    return { outcome, pay: payout(this.card, outcome, rate) };
  }
}
