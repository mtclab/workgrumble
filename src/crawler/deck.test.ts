import { describe, expect, it } from 'vitest';
import { cardView, coworkerCard, deal, type DealInput, DECK_SIZE, type Deck, deckCard, FLOOR_P1, handIds, payRate, rulesFor, STORY_FLOORS } from './deck';
import { FINAL_FLOOR } from './game';
import { ALARM_WORDS, BAND_RANK, rungBand } from './mission';
import { GIVERS, POOL } from './missions';

/**
 * The weekly deck (docs/SPEC_HELLDESK_030_S1.md, S1b gate 1, and the deal's
 * part of gate 4): the deal over 200 career seeds x 8 weeks, at every band.
 * The game deals with exactly this function on Monday (`Game.dealWeek`);
 * deckgame.test.ts plays it.
 */

const SEEDS = Array.from({ length: 200 }, (_, i) => (Math.imul(i + 1, 2654435761) >>> 0));
const WEEKS = 8;
/** A rung in each band: Helpdesk, Specialist, Architect. */
const RUNGS = [0, 6, 11] as const;

/** Eight weeks of one career at one rung, each week dealt from the last, as Monday does. */
function career(seed: number, rung: number, floorOf: (week: number) => number = (w) => w - 1): Deck[] {
  const out: Deck[] = [];
  let previous: string[] = [];
  for (let week = 1; week <= WEEKS; week++) {
    const d = deal({ careerSeed: seed, week, floor: floorOf(week), rung, previous, exclude: [] });
    out.push(d);
    previous = handIds(d);
  }
  return out;
}

const eligible = (rung: number): number => POOL.filter((c) => c.p1 !== true && BAND_RANK[c.band] <= BAND_RANK[rungBand(rung)]).length;

describe('gate 1: the deal', () => {
  it('the same career and week (and week before) deal the same deck', () => {
    for (const seed of SEEDS) {
      for (const rung of RUNGS) {
        const input: DealInput = { careerSeed: seed, week: 3, floor: 2, rung, previous: ['stapler', 'phishing'], exclude: [] };
        expect(deal(input), `seed ${seed} rung ${rung}`).toEqual(deal({ ...input, previous: [...input.previous] }));
      }
    }
    // And a different week deals differently somewhere in the run.
    expect(SEEDS.some((seed) => JSON.stringify(deal({ careerSeed: seed, week: 1, floor: 0, rung: 0, previous: [], exclude: [] })) !== JSON.stringify(deal({ careerSeed: seed, week: 2, floor: 0, rung: 0, previous: [], exclude: [] })))).toBe(true);
  });

  it('200 careers x 8 weeks at every band: the P1 always, the count by band, the style mix, never last week\'s set', { timeout: 60_000 }, () => {
    for (const rung of RUNGS) {
      const band = rungBand(rung);
      const [lo, hi] = DECK_SIZE[band];
      // The no-repeat rule leaves at least one card of the pool out each week.
      const most = Math.min(hi, eligible(rung));
      for (const seed of SEEDS) {
        const weeks = career(seed, rung);
        weeks.forEach((d, k) => {
          const at = `seed ${seed} rung ${rung} week ${k + 1}`;
          const p1 = d.cards.filter((c) => c.p1);
          expect(p1, `${at}: one P1`).toHaveLength(1);
          expect(d.cards[0]?.p1, `${at}: the P1 first`).toBe(true);
          expect(d.cards.length, `${at}: ${band} deals ${lo}-${hi}`).toBeGreaterThanOrEqual(lo);
          expect(d.cards.length, `${at}: ${band} deals ${lo}-${hi}`).toBeLessThanOrEqual(most);
          const hand = d.cards.filter((c) => !c.p1).map((c) => deckCard(c)!);
          expect(new Set(hand.map((c) => c.id)).size, `${at}: no repeats`).toBe(hand.length);
          for (const c of hand) expect(BAND_RANK[c.band], `${at}: ${c.id} at or below the band`).toBeLessThanOrEqual(BAND_RANK[band]);
          expect(hand.some((c) => c.style !== 'loud'), `${at}: a card that is not loud`).toBe(true);
          expect(hand.some((c) => c.style !== 'sneaky'), `${at}: a card that is not sneaky`).toBe(true);
          if (k > 0) expect(new Set(handIds(d)), `${at}: not last week's set`).not.toEqual(new Set(handIds(weeks[k - 1]!)));
        });
      }
    }
  });

  it('alarm rules (D7): loud cards one-way or cooldown, the rest any; a hand of three or more has two different rules', () => {
    for (const rung of RUNGS) {
      for (const seed of SEEDS) {
        for (const d of career(seed, rung)) {
          const hand = d.cards.filter((c) => !c.p1);
          for (const c of hand) expect(rulesFor(deckCard(c)!)).toContain(c.alarm);
          if (hand.length >= 3) expect(new Set(hand.map((c) => c.alarm)).size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
          // Every rule shows on the card in its own words.
          for (const c of hand) expect(cardView(c, 0, { title: '', place: '' }).rule).toBe(ALARM_WORDS[c.alarm!]);
        }
      }
    }
  });

  it('in person: about a third of the hand, only cards from a coworker on the hub', () => {
    let inPerson = 0;
    let hand = 0;
    for (const seed of SEEDS) {
      for (const d of career(seed, 0)) {
        const cards = d.cards.filter((c) => !c.p1);
        hand += cards.length;
        for (const c of cards.filter((x) => x.inPerson)) {
          inPerson++;
          expect(coworkerCard(deckCard(c)!), `${c.id}: a coworker's card`).toBe(true);
        }
        expect(cards.filter((c) => c.inPerson).length).toBe(Math.min(Math.round(cards.length / 3), cards.filter((c) => coworkerCard(deckCard(c)!)).length));
      }
    }
    expect(inPerson / hand).toBeGreaterThan(0.25);
    expect(inPerson / hand).toBeLessThan(0.42);
  });

  it('a card in the exclude list is never dealt', () => {
    for (const seed of SEEDS) {
      const d = deal({ careerSeed: seed, week: 4, floor: 3, rung: 0, previous: [], exclude: ['stapler', 'josh'] });
      expect(handIds(d)).not.toContain('stapler');
      expect(handIds(d)).not.toContain('josh');
    }
  });
});

describe('gate 4 (the deal): after hours', () => {
  it('the floor P1 is never after hours; other cards sometimes are, paid at the giver\'s after-hours rate', () => {
    let after = 0;
    let rated = 0;
    for (const rung of RUNGS) {
      for (const seed of SEEDS) {
        for (const d of career(seed, rung)) {
          for (const c of d.cards) {
            if (c.id === FLOOR_P1) {
              expect(c.afterHours, `seed ${seed}: the floor P1 is never after hours`).toBe(false);
              expect(payRate(c)).toBe(1);
              continue;
            }
            const giver = GIVERS[deckCard(c)!.giver.id]!;
            expect(payRate(c), `${c.id} ${c.afterHours ? 'after hours' : 'in the day'}`).toBe(c.afterHours ? giver.afterHours : 1);
            if (c.afterHours) after++;
            if (c.afterHours && giver.afterHours !== 1) rated++;
          }
        }
      }
    }
    expect(after, 'some cards are dealt after hours').toBeGreaterThan(0);
    expect(rated, 'and some of their givers pay more for it').toBeGreaterThan(0);
    // The table: some givers pay 1.5x after hours, some 1.0x (D6).
    expect(new Set(Object.values(GIVERS).map((g) => g.afterHours))).toEqual(new Set([1, 1.5]));
  });
});

describe('the Printer Uprising as the week\'s P1', () => {
  it('only at Helpdesk band in Overtime: the story floors keep their bosses', () => {
    expect(STORY_FLOORS, 'deck.ts mirrors game.ts').toBe(FINAL_FLOOR);
    let printer = 0;
    for (const seed of SEEDS) {
      for (const rung of RUNGS) {
        for (const d of career(seed, rung, (w) => w + 2)) {
          const p1 = d.cards.find((c) => c.p1)!;
          if (p1.id !== FLOOR_P1) {
            printer++;
            expect(p1.id).toBe('printer');
            expect(rungBand(rung)).toBe('helpdesk');
          }
        }
        // Story weeks (floors 0-4): always the floor.
        for (const d of career(seed, rung, (w) => Math.min(w - 1, STORY_FLOORS))) {
          if (d.week <= STORY_FLOORS + 1) expect(d.cards[0]?.id).toBe(FLOOR_P1);
        }
      }
    }
    expect(printer, 'it does happen').toBeGreaterThan(0);
    // Never in the hand: it is a P1.
    for (const seed of SEEDS) for (const d of career(seed, 0)) expect(handIds(d)).not.toContain('printer');
  });
});
