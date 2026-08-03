/**
 * The Minesweeper rules, proven against constructed positions rather than a
 * screen. Every test here asserts a GOAL of the game - a well-formed board, a
 * flood that floods, a flag that flags, a loss on a mine, a win on the last safe
 * cell, a first click that is always safe - so a change that makes the toy
 * return success while the board is wrong reds here rather than passing behind a
 * green button.
 *
 * The teeth are named per block: the exact revert that turns each assertion red,
 * so none of them is a test that would stay green with the bug reintroduced.
 */

import { describe, expect, it } from 'vitest';

import {
  BEGINNER,
  boardFromMines,
  type Cell,
  type Coord,
  createBoard,
  flagCount,
  type GameConfig,
  type GameState,
  isLost,
  isWon,
  makeRng,
  minesRemaining,
  neighbours,
  reveal,
  toggleFlag,
} from './game';

/** Every cell on a board, flat, for the counting assertions. */
function allCells(state: GameState): Cell[] {
  return state.cells.flatMap((rowCells) => [...rowCells]);
}

/**
 * A hand-built, UNFROZEN board, for the purity test that has to see whether a
 * move freezes or writes its input. `createBoard` and `boardFromMines` both
 * freeze their output, which would hide exactly the bug that test hunts, so the
 * purity contract is checked against a plain mutable structure - the sibling of
 * the card game's `emptyState`.
 */
function mutableBoard(rows: number, cols: number, mines: number): GameState {
  const cells: Cell[][] = Array.from({ length: rows }, () => Array.from(
    { length: cols },
    () => ({ mine: false, adjacent: 0, state: 'hidden' }),
  ));

  return { rows, cols, mines, seed: 5, placed: false, status: 'playing', cells };
}

function mineCount(state: GameState): number {
  return allCells(state).filter((cell) => cell.mine).length;
}

function revealedCount(state: GameState): number {
  return allCells(state).filter((cell) => cell.state === 'revealed').length;
}

/** The adjacency the state claims, re-derived by hand, to catch a wrong count. */
function trueAdjacent(state: GameState, row: number, col: number): number {
  return neighbours(state, row, col).filter(
    (spot) => state.cells[spot.row]?.[spot.col]?.mine === true,
  ).length;
}

describe('the PRNG', () => {
  it('is a deterministic stream for a seed, in [0, 1)', () => {
    // Teeth: seed the PRNG off a clock or ignore the seed and these diverge -
    // and with them every claim that a board is testable.
    const a = makeRng(12345);
    const b = makeRng(12345);
    const draws = Array.from({ length: 8 }, () => a());

    expect(draws).toEqual(Array.from({ length: 8 }, () => b()));

    for (const value of draws) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }

    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe('a fresh board', () => {
  it('is all hidden, no mines laid, nothing won or lost', () => {
    // Teeth: a board that laid mines before the first click, or started
    // revealed, breaks first-click safety and the very first thing the toy
    // shows.
    const state = createBoard(7);

    expect(state.rows).toBe(BEGINNER.rows);
    expect(state.cols).toBe(BEGINNER.cols);
    expect(state.mines).toBe(BEGINNER.mines);
    expect(state.placed).toBe(false);
    expect(state.status).toBe('playing');
    expect(allCells(state)).toHaveLength(BEGINNER.rows * BEGINNER.cols);
    expect(allCells(state).every((cell) => cell.state === 'hidden')).toBe(true);
    expect(mineCount(state)).toBe(0);
  });

  it('refuses a board with more mines than it can hide safely', () => {
    // Teeth: a config with no safe first click is not a game of Minesweeper;
    // the constructor must reject it rather than deal an unplayable board.
    const tooMany: GameConfig = { rows: 2, cols: 2, mines: 4 };
    expect(() => createBoard(1, tooMany)).toThrow(/mines/);
    // One short of the whole board is legal: the clicked cell stays clear.
    expect(() => createBoard(1, { rows: 2, cols: 2, mines: 3 })).not.toThrow();
  });
});

describe('the first click lays the field', () => {
  it('lays exactly the configured mines and never on the clicked cell', () => {
    // Teeth: the mine count is the board's whole difficulty; a lay that placed
    // the wrong number, or one that could bury the first click, reds here.
    for (let seed = 0; seed < 25; seed += 1) {
      const opened = reveal(createBoard(seed), 4, 4);

      expect(opened.placed).toBe(true);
      expect(mineCount(opened)).toBe(BEGINNER.mines);
      expect(opened.cells[4]?.[4]?.mine).toBe(false);
    }
  });

  it('computes every adjacency count correctly', () => {
    // Teeth: the numbers are the entire game. An off-by-one in the neighbour
    // sweep would light up here on the first mismatched cell.
    const opened = reveal(createBoard(99), 4, 4);

    for (let r = 0; r < opened.rows; r += 1) {
      for (let c = 0; c < opened.cols; c += 1) {
        expect(opened.cells[r]?.[c]?.adjacent, `cell ${String(r)},${String(c)}`)
          .toBe(trueAdjacent(opened, r, c));
      }
    }
  });

  it('opens into a flood on a normal board, so move one is never a dead number', () => {
    // Teeth: first-click GENEROSITY. The clicked cell's neighbours are kept
    // clear too where there is room, so the first reveal is a zero and cascades
    // - drop that and the first click can be a lone "5" against the odds.
    const opened = reveal(createBoard(3), 4, 4);
    expect(opened.cells[4]?.[4]?.adjacent).toBe(0);
    expect(revealedCount(opened)).toBeGreaterThan(1);
  });

  it('is deterministic in the seed AND the first click', () => {
    // Teeth: same seed, same click, same board - the determinism the whole
    // "testable toy" claim rests on. And a different first click on the same
    // seed is a different field, which is what makes first-click safety honest
    // rather than a reshuffle of one fixed board.
    const codes = (state: GameState): string => allCells(state)
      .map((cell) => (cell.mine ? '*' : '.')).join('');

    expect(codes(reveal(createBoard(42), 4, 4)))
      .toBe(codes(reveal(createBoard(42), 4, 4)));
    expect(codes(reveal(createBoard(42), 4, 4)))
      .not.toBe(codes(reveal(createBoard(42), 0, 0)));
  });
});

describe('revealing', () => {
  it('floods a zero out to the numbered border and stops at the numbers', () => {
    // Teeth: the cascade. One mine in a corner of a 3x3 leaves the far corner a
    // zero; revealing it opens all eight non-mine cells, and the ones touching
    // the mine show their number. A flood that stopped at the first cell would
    // reveal one; one that ran through numbers would reveal the mine too.
    const state = boardFromMines({ rows: 3, cols: 3, mines: 1 }, [{ row: 0, col: 0 }]);

    const opened = reveal(state, 2, 2);

    expect(revealedCount(opened)).toBe(8);
    expect(opened.cells[0]?.[0]?.state).toBe('hidden');
    // The three cells around the mine carry a count and were still revealed.
    expect(opened.cells[0]?.[1]?.adjacent).toBe(1);
    expect(opened.cells[1]?.[1]?.adjacent).toBe(1);
    expect(opened.cells[0]?.[1]?.state).toBe('revealed');
  });

  it('reveals just the one cell when it has a number on it', () => {
    // Teeth: a numbered cell does NOT flood. Revealing the "1" next to a mine
    // opens exactly it. A flood that ignored the adjacency count would spill.
    const state = boardFromMines({ rows: 1, cols: 3, mines: 1 }, [{ row: 0, col: 0 }]);
    const opened = reveal(state, 0, 1);

    expect(opened.cells[0]?.[1]?.state).toBe('revealed');
    expect(opened.cells[0]?.[1]?.adjacent).toBe(1);
    expect(opened.cells[0]?.[2]?.state).toBe('hidden');
  });

  it('steps around a flag while flooding', () => {
    // Teeth: a flag is the player saying "not here", and the flood does not
    // overrule it. Flag a safe cell, flood past it, and it stays flagged and
    // unrevealed - drop the flag check and the cascade tramples the mark.
    const state = boardFromMines({ rows: 3, cols: 3, mines: 1 }, [{ row: 0, col: 0 }]);
    const flagged = toggleFlag(state, 2, 0);

    const opened = reveal(flagged, 2, 2);

    expect(opened.cells[2]?.[0]?.state).toBe('flagged');
  });
});

describe('flagging', () => {
  it('flags a hidden cell and takes the flag back off', () => {
    // Teeth: the flag toggle, and the mine counter that reads it. Flagging must
    // mark the cell and drop the remaining count; a second toggle clears both.
    const state = createBoard(1);
    expect(minesRemaining(state)).toBe(BEGINNER.mines);

    const flagged = toggleFlag(state, 0, 0);
    expect(flagged.cells[0]?.[0]?.state).toBe('flagged');
    expect(flagCount(flagged)).toBe(1);
    expect(minesRemaining(flagged)).toBe(BEGINNER.mines - 1);

    const cleared = toggleFlag(flagged, 0, 0);
    expect(cleared.cells[0]?.[0]?.state).toBe('hidden');
    expect(flagCount(cleared)).toBe(0);
  });

  it('refuses to flag a revealed cell', () => {
    // Teeth: there is nothing to mark on a cell you can already see. A flag on
    // a revealed cell would be a mark the mine counter miscounts against.
    const state = boardFromMines({ rows: 1, cols: 3, mines: 1 }, [{ row: 0, col: 0 }]);
    const opened = reveal(state, 0, 2);
    expect(opened.cells[0]?.[2]?.state).toBe('revealed');

    const attempted = toggleFlag(opened, 0, 2);
    expect(attempted.cells[0]?.[2]?.state).toBe('revealed');
    expect(flagCount(attempted)).toBe(0);
  });
});

describe('the end states', () => {
  it('loses on a mine and turns the field face up', () => {
    // Teeth: the loss. Revealing a mine ends the game and shows the mines; a
    // detector stuck on "playing" never fires the lose banner.
    const state = boardFromMines({ rows: 2, cols: 2, mines: 1 }, [{ row: 0, col: 0 }]);

    expect(isLost(state)).toBe(false);
    const boom = reveal(state, 0, 0);

    expect(isLost(boom)).toBe(true);
    expect(boom.status).toBe('lost');
    expect(boom.cells[0]?.[0]?.state).toBe('revealed');
  });

  it('does nothing once the game is over', () => {
    // Teeth: a finished game is finished. A reveal or a flag after the loss
    // must not resurrect the board or move a number.
    const state = boardFromMines({ rows: 2, cols: 2, mines: 1 }, [{ row: 0, col: 0 }]);
    const boom = reveal(state, 0, 0);

    expect(reveal(boom, 1, 1)).toBe(boom);
    expect(toggleFlag(boom, 1, 1)).toBe(boom);
  });

  it('wins when the last safe cell is revealed, mines or no mines flagged', () => {
    // Teeth: the win is "every safe cell revealed", not "every mine flagged".
    // One mine on a 2x2: reveal the three safe cells and it is won, whether or
    // not the mine was ever flagged. A win keyed on flags would miss this.
    const state = boardFromMines({ rows: 2, cols: 2, mines: 1 }, [{ row: 0, col: 0 }]);

    let live: GameState = reveal(state, 0, 1);
    expect(isWon(live)).toBe(false);
    live = reveal(live, 1, 0);
    expect(isWon(live)).toBe(false);
    live = reveal(live, 1, 1);

    expect(isWon(live)).toBe(true);
    expect(live.status).toBe('won');
  });
});

describe('the no-ops and the purity contract', () => {
  it('hands the same state back for a move that cannot happen', () => {
    // Teeth: an out-of-bounds click, or a click on a revealed or flagged cell,
    // is nothing - the same state comes back, so the toy never re-renders a
    // move that was not made.
    const state = boardFromMines({ rows: 1, cols: 3, mines: 1 }, [{ row: 0, col: 0 }]);
    const opened = reveal(state, 0, 2);

    expect(reveal(opened, 9, 9)).toBe(opened);
    expect(reveal(opened, 0, 2)).toBe(opened);
    const flagged = toggleFlag(opened, 0, 1);
    expect(reveal(flagged, 0, 1)).toBe(flagged);
  });

  it('never freezes or mutates the state handed to a move', () => {
    // Teeth: if reveal or toggleFlag wrote into the input's cells before
    // freezing, freezing the output would freeze the INPUT and later mutate a
    // value the caller still holds. The input here is a hand-built, UNFROZEN
    // board on purpose - createBoard freezes its own output, which would hide
    // the bug - so a move that touched or froze it reds. A move returns a NEW
    // state and leaves the one passed in exactly as it was: unfrozen, unplaced,
    // and deep-equal to its snapshot.
    const before = mutableBoard(9, 9, 10);
    const snapshot = structuredClone(before.cells);

    const opened = reveal(before, 4, 4);
    expect(opened).not.toBe(before);
    expect(opened.placed).toBe(true);
    expect(Object.isFrozen(before.cells)).toBe(false);
    expect(Object.isFrozen(before.cells[4])).toBe(false);
    expect(before.cells).toEqual(snapshot);
    // The mines were laid on the CLONE, never on the input.
    expect(before.placed).toBe(false);
    expect(before.cells.flat().every((cell) => !cell.mine)).toBe(true);

    const flagBefore = mutableBoard(2, 2, 1);
    const flagSnapshot = structuredClone(flagBefore.cells);
    toggleFlag(flagBefore, 1, 1);
    expect(Object.isFrozen(flagBefore.cells)).toBe(false);
    expect(Object.isFrozen(flagBefore.cells[1])).toBe(false);
    expect(flagBefore.cells).toEqual(flagSnapshot);
  });

  it('keeps every neighbour on the board', () => {
    // A corner has three neighbours and a centre has eight - the clip that
    // keeps the flood and the adjacency count from reading off the edge.
    const state = createBoard(1, { rows: 3, cols: 3, mines: 1 });
    const corner: Coord[] = [...neighbours(state, 0, 0)];
    expect(corner).toHaveLength(3);
    expect(neighbours(state, 1, 1)).toHaveLength(8);
  });
});
