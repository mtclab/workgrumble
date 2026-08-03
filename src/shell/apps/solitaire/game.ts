/**
 * Klondike Solitaire, as rules rather than as a screen.
 *
 * Everything here is a pure function over a `GameState` value: no DOM, no
 * `Date.now`, and - the one the engine actually forbids - no `Math.random`. A
 * deal is `f(seed)`, a move is `f(state, move)`, and both answer with a new
 * frozen state or a plain no. The shell toy in `../solitaire` renders whatever
 * this hands it and feeds a seed down from a shell source (the sim tick), so the
 * whole of the game that could be wrong is testable without a browser in the
 * room.
 *
 * The variant is draw-one with an unlimited recycle of the waste, because a
 * draw-three the player cannot un-deal is a worse toy and a harder thing to
 * assert a legal move against. The rules otherwise are the ones your wrist knows:
 * tableau builds down in alternating colour, foundations build up in suit from
 * the Ace, an empty tableau column takes a King, and the card you uncover turns
 * face up.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Ace low at 1, King high at 13 - the order the builds count in. */
export const ACE = 1;
export const KING = 13;

export interface Card {
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

/** The two red suits, which is the whole of what "alternating colour" needs. */
export function isRed(suit: Suit): boolean {
  return suit === 'diamonds' || suit === 'hearts';
}

export function sameColour(left: Card, right: Card): boolean {
  return isRed(left.suit) === isRed(right.suit);
}

const SUIT_LETTER: Readonly<Record<Suit, string>> = {
  clubs: 'c',
  diamonds: 'd',
  hearts: 'h',
  spades: 's',
};

/** A short, stable id for a card - a suit letter and its rank, unique in a deck. */
export function cardCode(card: Card): string {
  return `${SUIT_LETTER[card.suit]}${String(card.rank)}`;
}

/** Where a run of cards is coming from, and where it is going. */
export type Zone = 'waste' | 'tableau' | 'foundation';

export interface MoveSource {
  readonly zone: Zone;
  readonly pile: number;
  /** Index into the pile of the FIRST card of the run being lifted. */
  readonly index: number;
}

export interface MoveTarget {
  readonly zone: 'tableau' | 'foundation';
  readonly pile: number;
}

export interface Move {
  readonly from: MoveSource;
  readonly to: MoveTarget;
}

export interface GameState {
  /** Face down; the top of the pile is the LAST element. */
  readonly stock: readonly Card[];
  /** Face up; the top - the only one you can take - is the last element. */
  readonly waste: readonly Card[];
  /** Four piles, each building up in one suit from the Ace. */
  readonly foundations: ReadonlyArray<readonly Card[]>;
  /** Seven columns, face-down cards under a face-up tail. */
  readonly tableau: ReadonlyArray<readonly Card[]>;
}

export const TABLEAU_PILES = 7;
export const FOUNDATION_PILES = 4;
export const DECK_SIZE = 52;

/* ---------------------------------------------------------------- the deck */

/** A fresh 52, ordered, all face down: the thing a shuffle then disorders. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (let rank = ACE; rank <= KING; rank += 1) {
      deck.push({ suit, rank, faceUp: false });
    }
  }

  return deck;
}

/**
 * A seeded PRNG - mulberry32 - so the toy carries its own randomness rather than
 * reaching for `Math.random`, which the engine bans and which no test could pin.
 * Same seed, same stream; that is the whole contract the deal leans on.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;

  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, drawing from the seeded stream. */
export function shuffle(deck: readonly Card[], rng: () => number): Card[] {
  const out = [...deck];

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const here = out[i];
    const there = out[j];

    if (here !== undefined && there !== undefined) {
      out[i] = there;
      out[j] = here;
    }
  }

  return out;
}

function freezeState(state: GameState): GameState {
  return Object.freeze({
    stock: Object.freeze(state.stock),
    waste: Object.freeze(state.waste),
    foundations: Object.freeze(state.foundations.map((pile) => Object.freeze(pile))),
    tableau: Object.freeze(state.tableau.map((pile) => Object.freeze(pile))),
  });
}

/**
 * Deal a game from a seed: seven columns of 1..7, the last card of each turned
 * up, and the remaining 24 left face down as the stock. Pure in the seed, so
 * the same number always deals the same board.
 */
export function deal(seed: number): GameState {
  const shuffled = shuffle(buildDeck(), makeRng(seed));
  const tableau: Card[][] = Array.from({ length: TABLEAU_PILES }, () => []);
  let cursor = 0;

  for (let pile = 0; pile < TABLEAU_PILES; pile += 1) {
    for (let depth = 0; depth <= pile; depth += 1) {
      const card = shuffled[cursor];
      cursor += 1;

      if (card === undefined) {
        throw new Error('Ran out of cards dealing the tableau.');
      }

      tableau[pile]?.push({ ...card, faceUp: depth === pile });
    }
  }

  const stock = shuffled.slice(cursor).map((card) => ({ ...card, faceUp: false }));

  return freezeState({
    stock,
    waste: [],
    foundations: Array.from({ length: FOUNDATION_PILES }, () => []),
    tableau,
  });
}

/* ------------------------------------------------------------- reading it */

export function isWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === KING);
}

function top(pile: readonly Card[]): Card | undefined {
  return pile[pile.length - 1];
}

/**
 * Whether the cards from `index` to the end of a tableau pile are a liftable
 * run: all face up, and each a rank below the one before it in the opposite
 * colour. A single face-up card is a run of one.
 */
export function isTableauRun(pile: readonly Card[], index: number): boolean {
  if (index < 0 || index >= pile.length) {
    return false;
  }

  for (let i = index; i < pile.length; i += 1) {
    const card = pile[i];

    if (card === undefined || !card.faceUp) {
      return false;
    }

    if (i > index) {
      const above = pile[i - 1];

      if (
        above === undefined
        || card.rank !== above.rank - 1
        || sameColour(card, above)
      ) {
        return false;
      }
    }
  }

  return true;
}

export function canStackOnTableau(moving: Card, destTop: Card | undefined): boolean {
  if (destTop === undefined) {
    return moving.rank === KING;
  }

  return !sameColour(moving, destTop) && moving.rank === destTop.rank - 1;
}

export function canPlaceOnFoundation(card: Card, destTop: Card | undefined): boolean {
  if (destTop === undefined) {
    return card.rank === ACE;
  }

  return card.suit === destTop.suit && card.rank === destTop.rank + 1;
}

/**
 * The run a source names, or `null` if that source is not something you could
 * pick up: an empty pile, a face-down card, a card that is not the top of the
 * waste or a foundation, or a tableau grab that is not a valid run.
 */
export function runAt(state: GameState, from: MoveSource): readonly Card[] | null {
  if (from.zone === 'waste') {
    const card = top(state.waste);

    return card !== undefined && from.index === state.waste.length - 1
      ? [card]
      : null;
  }

  if (from.zone === 'foundation') {
    const pile = state.foundations[from.pile];
    const card = pile === undefined ? undefined : top(pile);

    return card !== undefined && from.index === pile!.length - 1 ? [card] : null;
  }

  const pile = state.tableau[from.pile];

  if (pile === undefined || !isTableauRun(pile, from.index)) {
    return null;
  }

  return pile.slice(from.index);
}

/** Whether a move is legal, without performing it. */
export function canApply(state: GameState, move: Move): boolean {
  const run = runAt(state, move.from);

  if (run === null || run.length === 0) {
    return false;
  }

  // A move onto the pile it came from is not a move.
  if (move.from.zone === move.to.zone && move.from.pile === move.to.pile) {
    return false;
  }

  if (move.to.zone === 'foundation') {
    if (run.length !== 1) {
      return false;
    }

    const pile = state.foundations[move.to.pile];

    return pile !== undefined
      && run[0] !== undefined
      && canPlaceOnFoundation(run[0], top(pile));
  }

  const pile = state.tableau[move.to.pile];

  return pile !== undefined
    && run[0] !== undefined
    && canStackOnTableau(run[0], top(pile));
}

function withoutRun(pile: readonly Card[], from: MoveSource): Card[] {
  if (from.zone === 'tableau') {
    const remaining = pile.slice(0, from.index);
    const last = remaining[remaining.length - 1];

    // Uncovering a face-down card turns it up: the one automatic thing the
    // rules do for you, and the reason a column ever empties.
    if (last !== undefined && !last.faceUp) {
      remaining[remaining.length - 1] = { ...last, faceUp: true };
    }

    return remaining;
  }

  return pile.slice(0, -1);
}

/**
 * Apply a move, or answer `null` if it is illegal. The state handed back is a
 * new frozen value; the one passed in is never touched.
 */
export function applyMove(state: GameState, move: Move): GameState | null {
  if (!canApply(state, move)) {
    return null;
  }

  const run = runAt(state, move.from);

  if (run === null) {
    return null;
  }

  const next = {
    stock: state.stock,
    waste: [...state.waste],
    foundations: state.foundations.map((pile) => [...pile]),
    tableau: state.tableau.map((pile) => [...pile]),
  };

  // Lift the run off the source.
  if (move.from.zone === 'waste') {
    next.waste = withoutRun(state.waste, move.from);
  } else if (move.from.zone === 'foundation') {
    next.foundations[move.from.pile] = withoutRun(
      state.foundations[move.from.pile] ?? [],
      move.from,
    );
  } else {
    next.tableau[move.from.pile] = withoutRun(
      state.tableau[move.from.pile] ?? [],
      move.from,
    );
  }

  // Land it, all cards face up.
  const landing = run.map((card) => ({ ...card, faceUp: true }));

  if (move.to.zone === 'foundation') {
    next.foundations[move.to.pile] = [
      ...(next.foundations[move.to.pile] ?? []),
      ...landing,
    ];
  } else {
    next.tableau[move.to.pile] = [
      ...(next.tableau[move.to.pile] ?? []),
      ...landing,
    ];
  }

  return freezeState(next);
}

/**
 * Turn the stock over one card, or - when the stock is spent - recycle the
 * whole waste back under it, face down, to be drawn again. With nothing in
 * either pile there is nothing to do and the same state comes back.
 */
export function drawStock(state: GameState): GameState {
  if (state.stock.length > 0) {
    const card = top(state.stock);

    if (card === undefined) {
      return state;
    }

    return freezeState({
      stock: state.stock.slice(0, -1),
      waste: [...state.waste, { ...card, faceUp: true }],
      foundations: state.foundations,
      tableau: state.tableau,
    });
  }

  if (state.waste.length > 0) {
    // Recycle: the waste, reversed, becomes the stock again, face down.
    const recycled = [...state.waste]
      .reverse()
      .map((card) => ({ ...card, faceUp: false }));

    return freezeState({
      stock: recycled,
      waste: [],
      foundations: state.foundations,
      tableau: state.tableau,
    });
  }

  return state;
}

export function canDraw(state: GameState): boolean {
  return state.stock.length > 0 || state.waste.length > 0;
}

/**
 * Every productive move available now - not the draw, which `canDraw` owns, but
 * every card that could go somewhere it is not. Used to light up a hint and,
 * more importantly, to tell a dead game from a live one.
 */
export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  const consider = (from: MoveSource): void => {
    for (let pile = 0; pile < FOUNDATION_PILES; pile += 1) {
      const move: Move = { from, to: { zone: 'foundation', pile } };

      if (canApply(state, move)) {
        moves.push(move);
      }
    }

    for (let pile = 0; pile < TABLEAU_PILES; pile += 1) {
      const move: Move = { from, to: { zone: 'tableau', pile } };

      if (canApply(state, move)) {
        moves.push(move);
      }
    }
  };

  if (state.waste.length > 0) {
    consider({ zone: 'waste', pile: 0, index: state.waste.length - 1 });
  }

  state.foundations.forEach((pile, index) => {
    if (pile.length > 0) {
      consider({ zone: 'foundation', pile: index, index: pile.length - 1 });
    }
  });

  state.tableau.forEach((pile, index) => {
    for (let card = 0; card < pile.length; card += 1) {
      if (isTableauRun(pile, card)) {
        consider({ zone: 'tableau', pile: index, index: card });
      }
    }
  });

  return moves;
}

/**
 * A dead game: nothing to draw, nothing to recycle, and no card that can move.
 * This is the honest lose - not "you gave up" but "there is provably nothing
 * left to do" - which is the state a test can construct and stand on.
 */
export function isStuck(state: GameState): boolean {
  return !isWon(state)
    && !canDraw(state)
    && legalMoves(state).length === 0;
}
