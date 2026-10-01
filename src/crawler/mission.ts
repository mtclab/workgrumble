import type { ActorKind } from './entities';
import type { Sort, Tier } from './stealth';
import type { RecipeId } from './templates';

/**
 * Mission cards (docs/SPEC_HELLDESK_030.md 2.4-2.6), the 0.3.0 spike's pure
 * rules: what a card is, how a run of one is tracked, and what finishing it
 * pays. No three.js and no DOM here; `missionplay.ts` puts a card into the
 * game and `missions.ts` holds the two cards.
 */

/** The card's intended play (spec 2.2). Every sneaky card can be played loud. */
export type Style = 'sneaky' | 'loud';

export type Objective =
  /** Take this quest item from the locked closet in HR's office. */
  | { readonly kind: 'take'; readonly item: string; readonly text: string }
  /** Resolve this many of these people (any road: in combat or talked down). */
  | { readonly kind: 'resolve'; readonly who: ActorKind; readonly count: number; readonly text: string };

/** Who the card puts on the map, where (a footprint tag, or 'node': a corridor node) and how they spend the day. */
export interface CrowdSpec {
  readonly kind: ActorKind;
  readonly room: string;
  readonly sort: Sort;
  readonly count?: number;
  /** The card's own name for them ('hr'): the stapler is quiet only if HR never noticed you. */
  readonly tag?: string;
  readonly name?: string;
}

export interface MissionCard {
  readonly id: string;
  /** Its number in the spec's starter catalogue. */
  readonly number: number;
  readonly title: string;
  /** Who put it on the board, and what they said. */
  readonly source: string;
  readonly voice: string;
  readonly style: Style;
  readonly recipe: RecipeId;
  /** The floor its people are rolled for (and its look). */
  readonly floor: number;
  /** Rep the card is worth (spec 2.4: base, the same both ways). */
  readonly value: number;
  readonly objective: Objective;
  readonly crowd: readonly CrowdSpec[];
  /** A watcher who must never reach Investigate for the finish to count as quiet. */
  readonly unseenBy?: string;
  /** What going loud means on this card, for the briefing. */
  readonly loud: string;
}

/** Spec 2.4: a quiet finish pays the card plus 40%, and +3 Management, +2 Staff. */
export const QUIET_BONUS = 0.4;
export const QUIET_STANDING = { management: 3, staff: 2 } as const;

export type Finish = 'done' | 'aborted' | 'burnout';

export interface Outcome {
  readonly finish: Finish;
  /** The highest escalation the mission reached. */
  readonly maxTier: Tier;
  /** The card's `unseenBy` watcher noticed you. */
  readonly spoiled: boolean;
  /** Rep the resolves on the card paid as they happened. */
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
export function payout(card: MissionCard, o: Outcome): Payout {
  if (o.finish !== 'done') return { quiet: false, base: 0, bonus: 0, perResolve: o.resolvedRep, management: 0, staff: 0 };
  const quiet = quietFinish(o);
  return {
    quiet,
    base: card.value,
    bonus: quiet ? Math.round(card.value * QUIET_BONUS) : 0,
    perResolve: o.resolvedRep,
    management: quiet ? QUIET_STANDING.management : 0,
    staff: quiet ? QUIET_STANDING.staff : 0,
  };
}

/** One run of a card: the clock, the objective, the escalation reached, the resolves. */
export class MissionRun {
  seconds = 0;
  maxTier: Tier;
  spoiled = false;
  resolvedRep = 0;
  /** Resolves counted toward a 'resolve' objective. */
  progress = 0;
  objectiveDone = false;
  outcome: Outcome | null = null;
  private readonly counted = new Set<number>();

  constructor(readonly card: MissionCard, startTier: Tier) {
    this.maxTier = startTier;
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

  /** Someone of the card's crowd was resolved (each counts once). */
  resolved(id: number, kind: ActorKind, rep: number): void {
    if (this.over || this.counted.has(id)) return;
    this.counted.add(id);
    this.resolvedRep += rep;
    const ob = this.card.objective;
    if (ob.kind === 'resolve' && kind === ob.who) {
      this.progress += 1;
      if (this.progress >= ob.count) this.objectiveDone = true;
    }
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

  /** Close the card. `done` needs the objective; the payout is the caller's to apply, once. */
  finish(how: Finish): { outcome: Outcome; pay: Payout } | null {
    if (this.over || (how === 'done' && !this.objectiveDone)) return null;
    const outcome: Outcome = { finish: how, maxTier: this.maxTier, spoiled: this.spoiled, resolvedRep: this.resolvedRep, seconds: this.seconds };
    this.outcome = outcome;
    return { outcome, pay: payout(this.card, outcome) };
  }
}
