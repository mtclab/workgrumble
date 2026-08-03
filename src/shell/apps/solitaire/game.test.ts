/**
 * The solitaire rules, proven against constructed positions rather than a
 * screen. Every test here asserts a GOAL of the game - a well-formed deal, a
 * legal move landing correctly, an illegal one refused, a win and a dead game
 * both reachable - so a change that makes the toy return success while the board
 * is wrong reds here rather than passing behind a green button.
 *
 * The teeth are named per block: the exact revert that turns each assertion red,
 * so none of them is a test that would stay green with the bug reintroduced.
 */

import { describe, expect, it } from 'vitest';

import {
  applyMove,
  buildDeck,
  canApply,
  canDraw,
  type Card,
  cardCode,
  DECK_SIZE,
  deal,
  drawStock,
  type GameState,
  isStuck,
  isTableauRun,
  isWon,
  KING,
  legalMoves,
  makeRng,
  shuffle,
  type Suit,
  SUITS,
  TABLEAU_PILES,
} from './game';

function up(suit: Suit, rank: number): Card {
  return { suit, rank, faceUp: true };
}

function down(suit: Suit, rank: number): Card {
  return { suit, rank, faceUp: false };
}

function fullFoundation(suit: Suit): Card[] {
  return Array.from({ length: KING }, (_unused, i) => up(suit, i + 1));
}

/** A mutable board so a test can build a position by assigning piles onto it. */
interface Board {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
}

/** A blank board to drop constructed piles onto. */
function emptyState(): Board {
  return {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
  };
}

function allCards(state: GameState): Card[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
    ...state.tableau.flat(),
  ];
}

describe('the deck and the shuffle', () => {
  it('builds 52 distinct cards', () => {
    // Teeth: a build that dropped a suit or a rank makes this count wrong.
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map(cardCode)).size).toBe(DECK_SIZE);
    expect(SUITS).toHaveLength(4);
  });

  it('is a deterministic stream for a seed, in [0, 1)', () => {
    // Teeth: seed the PRNG off a clock or ignore the seed and these diverge.
    const a = makeRng(12345);
    const b = makeRng(12345);
    const draws = Array.from({ length: 8 }, () => a());

    expect(draws).toEqual(Array.from({ length: 8 }, () => b()));

    for (const value of draws) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }

    // A different seed is a different stream.
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('shuffles to a permutation, not a loss of cards', () => {
    // Teeth: a shuffle that overwrote instead of swapping would drop cards.
    const shuffled = shuffle(buildDeck(), makeRng(99));
    expect(new Set(shuffled.map(cardCode)).size).toBe(DECK_SIZE);
  });
});

describe('a dealt game', () => {
  it('is well-formed: 52 unique cards in the right pile sizes', () => {
    // Teeth: a deal that mis-sized the columns or lost the stock reds here.
    const state = deal(7);
    const cards = allCards(state);

    expect(cards).toHaveLength(DECK_SIZE);
    expect(new Set(cards.map(cardCode)).size).toBe(DECK_SIZE);

    expect(state.tableau.map((pile) => pile.length))
      .toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    expect(state.foundations.every((pile) => pile.length === 0)).toBe(true);
  });

  it('turns up only the last card of each column', () => {
    // Teeth: dealing every card face up (or none) breaks the up/down split.
    for (const pile of deal(7).tableau) {
      pile.forEach((card, index) => {
        expect(card.faceUp).toBe(index === pile.length - 1);
      });
    }
  });

  it('deals the same board for a seed and a different one for another', () => {
    // Teeth: this is the determinism the whole "testable toy" claim rests on.
    expect(deal(42)).toEqual(deal(42));

    const codes = (state: GameState): string => state.stock.map(cardCode).join();
    expect(codes(deal(42))).not.toBe(codes(deal(43)));
  });

  it('is not already won or stuck', () => {
    const state = deal(7);
    expect(isWon(state)).toBe(false);
    expect(isStuck(state)).toBe(false);
    expect(canDraw(state)).toBe(true);
  });
});

describe('drawing from the stock', () => {
  it('turns one card face up onto the waste', () => {
    // Teeth: a draw that left the card face down, or took two, reds here.
    const before = deal(7);
    const after = drawStock(before);

    expect(after.stock).toHaveLength(before.stock.length - 1);
    expect(after.waste).toHaveLength(1);
    expect(after.waste[0]?.faceUp).toBe(true);
  });

  it('recycles the spent waste back under the stock', () => {
    // Teeth: recycle is what stops an empty stock being a dead end; drop it and
    // the waste can never be drawn twice.
    let state = deal(7);

    for (let i = 0; i < 24; i += 1) {
      state = drawStock(state);
    }

    expect(state.stock).toHaveLength(0);
    expect(state.waste).toHaveLength(24);

    const recycled = drawStock(state);
    expect(recycled.stock).toHaveLength(24);
    expect(recycled.waste).toHaveLength(0);
    expect(recycled.stock.every((card) => !card.faceUp)).toBe(true);
  });

  it('does nothing with both piles empty', () => {
    const state = emptyState();
    expect(canDraw(state)).toBe(false);
    expect(drawStock(state)).toBe(state);
  });
});

describe('a tableau move', () => {
  it('accepts a legal alternating-colour run and lands it whole', () => {
    // Teeth: the core legal move. A validator stuck on "true" would still pass
    // the accept but fail the illegal-move test below; one that mis-moved the
    // run would fail the length assertions here.
    const state = emptyState();
    (state.tableau)[0] = [up('clubs', 8), up('hearts', 7), up('spades', 6)];
    (state.tableau)[1] = [up('diamonds', 9)];

    const move = {
      from: { zone: 'tableau' as const, pile: 0, index: 0 },
      to: { zone: 'tableau' as const, pile: 1 },
    };

    expect(canApply(state, move)).toBe(true);
    const next = applyMove(state, move);

    expect(next).not.toBeNull();
    expect(next?.tableau[0]).toHaveLength(0);
    expect(next?.tableau[1]?.map(cardCode)).toEqual(['d9', 'c8', 'h7', 's6']);
    // Purity: the source state was not mutated.
    expect(state.tableau[0]).toHaveLength(3);
  });

  it('refuses a same-colour landing and an unruly grab', () => {
    // Teeth: refusing the illegal move is the half a "return true" validator
    // fails. Same colour and a broken run are the two ways to be illegal.
    const state = emptyState();
    (state.tableau)[0] = [up('clubs', 8)];
    (state.tableau)[1] = [up('spades', 9)];

    const sameColour = {
      from: { zone: 'tableau' as const, pile: 0, index: 0 },
      to: { zone: 'tableau' as const, pile: 1 },
    };
    expect(canApply(state, sameColour)).toBe(false);
    expect(applyMove(state, sameColour)).toBeNull();

    // A grab that is not a valid descending run cannot be lifted.
    (state.tableau)[2] = [up('clubs', 8), up('hearts', 4)];
    expect(isTableauRun(state.tableau[2] ?? [], 0)).toBe(false);
  });

  it('turns up the card it uncovers', () => {
    // Teeth: the automatic flip. Drop it and a column never re-exposes.
    const state = emptyState();
    (state.tableau)[0] = [down('spades', 5), up('hearts', 4)];
    (state.tableau)[1] = [up('clubs', 5)];

    const next = applyMove(state, {
      from: { zone: 'tableau', pile: 0, index: 1 },
      to: { zone: 'tableau', pile: 1 },
    });

    expect(next?.tableau[0]).toHaveLength(1);
    expect(next?.tableau[0]?.[0]?.faceUp).toBe(true);
  });

  it('takes only a King onto an empty column', () => {
    const state = emptyState();
    (state.tableau)[0] = [up('hearts', KING)];
    (state.tableau)[1] = [up('spades', 5)];

    expect(canApply(state, {
      from: { zone: 'tableau', pile: 0, index: 0 },
      to: { zone: 'tableau', pile: 2 },
    })).toBe(true);
    expect(canApply(state, {
      from: { zone: 'tableau', pile: 1, index: 0 },
      to: { zone: 'tableau', pile: 2 },
    })).toBe(false);
  });
});

describe('a foundation move', () => {
  it('starts on an Ace and builds up in suit', () => {
    // Teeth: the up-in-suit rule. A foundation that took any card would pass a
    // lax accept and fail the refusals below.
    const withAce = emptyState();
    (withAce.waste) = [up('hearts', 1)];

    const afterAce = applyMove(withAce, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 0 },
    });
    expect(afterAce?.foundations[0]?.map(cardCode)).toEqual(['h1']);

    // Build the next position fresh - the returned state is frozen - with the
    // Ace already home and the two waiting on the waste.
    const withTwo = emptyState();
    (withTwo.foundations)[0] = [up('hearts', 1)];
    (withTwo.waste) = [up('hearts', 2)];

    const afterTwo = applyMove(withTwo, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 0 },
    });
    expect(afterTwo?.foundations[0]?.map(cardCode)).toEqual(['h1', 'h2']);
  });

  it('refuses a wrong suit, a gap, and a non-Ace on empty', () => {
    const state = emptyState();
    (state.foundations)[0] = [up('hearts', 1)];
    (state.waste) = [up('spades', 2)];
    expect(canApply(state, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 0 },
    })).toBe(false);

    state.waste = [up('hearts', 3)];
    expect(canApply(state, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 0 },
    })).toBe(false);

    state.waste = [up('clubs', 5)];
    (state.foundations)[1] = [];
    expect(canApply(state, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 1 },
    })).toBe(false);
  });

  it('will not move a run of more than one to a foundation', () => {
    const state = emptyState();
    (state.tableau)[0] = [up('hearts', 2), up('spades', 1)];
    // The Ace under the two would be a legal single, but the grab here starts
    // at the 2, which is a two-card run - foundations take one card.
    expect(canApply(state, {
      from: { zone: 'tableau', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 0 },
    })).toBe(false);
  });
});

describe('the end states', () => {
  it('reaches a win from one move away', () => {
    // Teeth: win detection. The last King goes home and the game is won; a
    // detector stuck on false never fires the banner.
    const state: GameState = {
      stock: [],
      waste: [up('spades', KING)],
      foundations: [
        fullFoundation('clubs'),
        fullFoundation('diamonds'),
        fullFoundation('hearts'),
        Array.from({ length: KING - 1 }, (_unused, i) => up('spades', i + 1)),
      ],
      tableau: [[], [], [], [], [], [], []],
    };

    expect(isWon(state)).toBe(false);
    const won = applyMove(state, {
      from: { zone: 'waste', pile: 0, index: 0 },
      to: { zone: 'foundation', pile: 3 },
    });

    expect(won).not.toBeNull();
    expect(isWon(won as GameState)).toBe(true);
    expect(allCards(won as GameState)).toHaveLength(DECK_SIZE);
  });

  it('reaches a provable dead game, and a live one is not called dead', () => {
    // Teeth: the lose. Two mid cards of like rank, nothing to draw, no Ace and
    // no King in reach - there is genuinely nothing to do, and isStuck must say
    // so. A single card added to the stock makes it drawable and no longer dead.
    const dead = emptyState();
    (dead.tableau)[0] = [up('clubs', 5)];
    (dead.tableau)[1] = [up('hearts', 5)];

    expect(legalMoves(dead)).toHaveLength(0);
    expect(canDraw(dead)).toBe(false);
    expect(isStuck(dead)).toBe(true);

    const live: GameState = { ...dead, stock: [down('diamonds', 9)] };
    expect(isStuck(live)).toBe(false);
  });

  it('lists the moves that exist and none that do not', () => {
    const state = emptyState();
    (state.tableau)[0] = [up('clubs', 8)];
    (state.tableau)[1] = [up('diamonds', 9)];
    (state.waste) = [up('hearts', 1)];

    const moves = legalMoves(state);
    // The 8 onto the 9, and the Ace up to any of four empty foundations.
    expect(moves.some((m) => m.from.zone === 'tableau' && m.to.zone === 'tableau'))
      .toBe(true);
    expect(moves.filter((m) => m.from.zone === 'waste' && m.to.zone === 'foundation'))
      .toHaveLength(4);
  });

  it('keeps every pile count sane across a real dealt game move', () => {
    // A light integration check on the shipped deal, not a constructed board:
    // draw a card and the totals still add to 52.
    const state = drawStock(deal(3));
    expect(allCards(state)).toHaveLength(DECK_SIZE);
    expect(state.tableau).toHaveLength(TABLEAU_PILES);
  });
});
