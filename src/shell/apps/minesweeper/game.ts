/**
 * Minesweeper, as rules rather than as a screen.
 *
 * The sibling of `../solitaire/game`, and built to the same three bans: no DOM,
 * no `Date.now`, and - the one the engine actually forbids - no `Math.random`.
 * A board is `f(seed)`, a reveal is `f(state, r, c)`, a flag is
 * `f(state, r, c)`, and every one answers with a new frozen state or the same
 * one back. The shell toy in `../minesweeper` renders whatever this hands it and
 * feeds a seed down from a shell source (the sim tick), so the whole of the game
 * that could be wrong is testable without a browser in the room.
 *
 * Two things are worth saying out loud because they are the rules a wrist knows
 * and a test does not:
 *
 * - FIRST-CLICK SAFETY. The mines are not laid when the board is built; they are
 *   laid on the first reveal, avoiding the cell the player clicked (and its
 *   neighbours, where the board is not so dense that there is no room). So the
 *   first click is never a mine and, on a normal board, opens into a flood -
 *   which is the standard rule and the reason nobody loses on move one.
 * - THE FLOOD. Revealing a cell with no mines around it reveals its neighbours,
 *   and theirs, out to the border of numbered cells - the cascade your finger
 *   expects. It steps around flags, because a flag is the player saying "not
 *   here" and the flood does not overrule it.
 */

export type CellState = 'hidden' | 'revealed' | 'flagged';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface Cell {
  /** Whether a mine sits here. Meaningful only once `placed` is true. */
  readonly mine: boolean;
  /** How many of the eight neighbours are mines. Valid once `placed`. */
  readonly adjacent: number;
  readonly state: CellState;
}

/** A working cell the internals may write to before it is frozen out. */
interface MutableCell {
  mine: boolean;
  adjacent: number;
  state: CellState;
}

export interface GameConfig {
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
}

/**
 * The board the toy ships: the classic beginner field, small enough to read a
 * flood on and dense enough that the flood does not just open the whole thing.
 */
export const BEGINNER: GameConfig = { rows: 9, cols: 9, mines: 10 };

export interface GameState {
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
  /** The seed the mines are laid from, once the first click says where. */
  readonly seed: number;
  /** Whether the mines have been laid yet - false until the first reveal. */
  readonly placed: boolean;
  readonly status: GameStatus;
  /** Row-major: `cells[row][col]`. */
  readonly cells: ReadonlyArray<readonly Cell[]>;
}

/** A cell coordinate, as the one thing a reveal or a flag is aimed at. */
export interface Coord {
  readonly row: number;
  readonly col: number;
}

/**
 * A seeded PRNG - mulberry32 - so the toy carries its own randomness rather than
 * reaching for `Math.random`, which the engine bans and which no test could pin.
 * Same seed, same stream; that is the whole contract the mine lay leans on. It
 * is the same generator the card game next door uses, on purpose: one shape of
 * "deterministic randomness" for both toys.
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

function assertConfig(config: Readonly<GameConfig>): void {
  const { rows, cols, mines } = config;

  if (!Number.isSafeInteger(rows) || rows <= 0
    || !Number.isSafeInteger(cols) || cols <= 0) {
    throw new Error('A board needs a positive whole number of rows and columns.');
  }

  if (!Number.isSafeInteger(mines) || mines < 0) {
    throw new Error('A board needs a non-negative whole number of mines.');
  }

  // The mines have to fit with the clicked cell left clear - anything denser
  // than that has no safe first click and is not a game of Minesweeper.
  if (mines > rows * cols - 1) {
    throw new Error(
      'There are more mines than there are cells to hide them under, once the '
      + 'first click is kept safe.',
    );
  }
}

function key(row: number, col: number): string {
  return `${String(row)},${String(col)}`;
}

/** Whether a coordinate names a cell on the board. */
export function inBounds(state: Readonly<GameState>, row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < state.rows
    && col >= 0 && col < state.cols;
}

/** The up-to-eight neighbours of a cell, clipped to the board. */
export function neighbours(
  state: Readonly<GameState>,
  row: number,
  col: number,
): readonly Coord[] {
  const out: Coord[] = [];

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) {
        continue;
      }

      const r = row + dr;
      const c = col + dc;

      if (inBounds(state, r, c)) {
        out.push({ row: r, col: c });
      }
    }
  }

  return out;
}

/**
 * Freeze a fresh output state, copying every row and every cell first so the
 * freeze can never reach an object the caller still holds. The purity contract
 * is the card game's, word for word: the input is returned exactly as it went
 * in - unfrozen and unchanged - and the copies here are what make that true.
 */
function freezeState(
  base: Readonly<GameState>,
  cells: ReadonlyArray<readonly MutableCell[]>,
  status: GameStatus,
  placed: boolean,
): GameState {
  return Object.freeze({
    rows: base.rows,
    cols: base.cols,
    mines: base.mines,
    seed: base.seed,
    placed,
    status,
    cells: Object.freeze(
      cells.map((rowCells) => Object.freeze(
        rowCells.map((cell) => Object.freeze<Cell>({
          mine: cell.mine,
          adjacent: cell.adjacent,
          state: cell.state,
        })),
      )),
    ),
  });
}

/** A mutable deep copy of a state's grid, for an operation to work on. */
function cloneCells(state: Readonly<GameState>): MutableCell[][] {
  return state.cells.map((rowCells) => rowCells.map((cell) => ({
    mine: cell.mine,
    adjacent: cell.adjacent,
    state: cell.state,
  })));
}

/**
 * A blank board from a seed: every cell hidden, no mines laid, nothing to lose
 * on yet. Pure in the seed, so the same number always builds the same starting
 * board - though every starting board looks identical until the first click
 * decides where the mines are allowed to be.
 */
export function createBoard(seed: number, config: Readonly<GameConfig> = BEGINNER): GameState {
  assertConfig(config);

  const cells: MutableCell[][] = Array.from(
    { length: config.rows },
    () => Array.from(
      { length: config.cols },
      () => ({ mine: false, adjacent: 0, state: 'hidden' }),
    ),
  );

  return freezeState(
    {
      rows: config.rows,
      cols: config.cols,
      mines: config.mines,
      seed: seed >>> 0,
      placed: false,
      status: 'playing',
      cells,
    },
    cells,
    'playing',
    false,
  );
}

/**
 * The adjacency count of every cell, given where the mines are. Written once
 * and read by both the mine lay and the test-facing constructor, so the number
 * on the board and the number a test builds are computed by the same code.
 */
function withAdjacency(cells: MutableCell[][]): void {
  const rows = cells.length;

  for (let r = 0; r < rows; r += 1) {
    const rowCells = cells[r];

    if (rowCells === undefined) {
      continue;
    }

    const cols = rowCells.length;

    for (let c = 0; c < cols; c += 1) {
      const cell = rowCells[c];

      if (cell === undefined) {
        continue;
      }

      let count = 0;

      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }

          const nr = r + dr;
          const nc = c + dc;

          if (cells[nr]?.[nc]?.mine === true) {
            count += 1;
          }
        }
      }

      cell.adjacent = count;
    }
  }
}

/**
 * Lay the mines on the first click.
 *
 * The safe zone is the clicked cell always, plus its neighbours where the board
 * has room to spare (more free cells than the nine of the zone). On a normal
 * board that means the first click opens into a flood; on a board packed so
 * tight there is no room, it means only the clicked cell is guaranteed clear -
 * still first-click-safe, just not first-click-generous. Positions are drawn
 * from the seeded stream, so the same seed and the same first click lay the
 * same mines every time. Flags already set are preserved.
 */
function layMines(
  cells: MutableCell[][],
  state: Readonly<GameState>,
  safeRow: number,
  safeCol: number,
): void {
  const total = state.rows * state.cols;
  const generous = state.mines <= total - 9;

  const safe = new Set<string>();
  safe.add(key(safeRow, safeCol));

  if (generous) {
    for (const spot of neighbours(state, safeRow, safeCol)) {
      safe.add(key(spot.row, spot.col));
    }
  }

  const candidates: Coord[] = [];

  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (!safe.has(key(r, c))) {
        candidates.push({ row: r, col: c });
      }
    }
  }

  // Fisher-Yates over the candidates, drawing from the seeded stream, then take
  // the first `mines` of the shuffled list. The clicked cell's coordinates are
  // mixed into the seed so that the SAME seed clicked in two different places
  // lays two different boards - the deal is `f(seed, first click)`, not `f(seed)`
  // alone, which is the whole of first-click safety made deterministic.
  const rng = makeRng((state.seed ^ Math.imul(safeRow + 1, 73856093)
    ^ Math.imul(safeCol + 1, 19349663)) >>> 0);

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const here = candidates[i];
    const there = candidates[j];

    if (here !== undefined && there !== undefined) {
      candidates[i] = there;
      candidates[j] = here;
    }
  }

  for (let i = 0; i < state.mines; i += 1) {
    const spot = candidates[i];

    if (spot !== undefined) {
      const cell = cells[spot.row]?.[spot.col];

      if (cell !== undefined) {
        cell.mine = true;
      }
    }
  }

  withAdjacency(cells);
}

/** Whether every cell that is NOT a mine has been revealed - the win. */
function allSafeRevealed(cells: ReadonlyArray<readonly MutableCell[]>): boolean {
  return cells.every((rowCells) => rowCells.every(
    (cell) => cell.mine || cell.state === 'revealed',
  ));
}

/**
 * Reveal a cell.
 *
 * The first reveal of a board lays the mines around it (first-click safety),
 * then reveals as normal. A flagged or already-revealed cell, an out-of-bounds
 * coordinate, or a move on a finished game are all no-ops that hand the same
 * state straight back. Revealing a mine loses - the board is turned face up so
 * the player can see what they hit. Revealing a cell with no adjacent mines
 * floods outward, stepping around flags. Revealing the last safe cell wins.
 */
export function reveal(state: Readonly<GameState>, row: number, col: number): GameState {
  if (state.status !== 'playing' || !inBounds(state, row, col)) {
    return state;
  }

  const target = state.cells[row]?.[col];

  if (target === undefined
    || target.state === 'revealed'
    || target.state === 'flagged') {
    return state;
  }

  const cells = cloneCells(state);
  let placed = state.placed;

  if (!placed) {
    layMines(cells, state, row, col);
    placed = true;
  }

  const hit = cells[row]?.[col];

  if (hit === undefined) {
    return state;
  }

  if (hit.mine) {
    // The loss turns every mine face up, the way the board does when it goes
    // off - the flags the player planted stay planted.
    for (const rowCells of cells) {
      for (const cell of rowCells) {
        if (cell.mine && cell.state !== 'flagged') {
          cell.state = 'revealed';
        }
      }
    }

    return freezeState(state, cells, 'lost', placed);
  }

  // Flood from the clicked cell: reveal it, and if it is a zero, spread to its
  // hidden, unflagged neighbours, out to the numbered border. An explicit stack
  // rather than recursion, so a wide-open board cannot blow the call stack.
  const stack: Coord[] = [{ row, col }];

  while (stack.length > 0) {
    const here = stack.pop();

    if (here === undefined) {
      continue;
    }

    const cell = cells[here.row]?.[here.col];

    if (cell === undefined || cell.state !== 'hidden' || cell.mine) {
      continue;
    }

    cell.state = 'revealed';

    if (cell.adjacent === 0) {
      for (const spot of neighbours(state, here.row, here.col)) {
        const next = cells[spot.row]?.[spot.col];

        if (next !== undefined && next.state === 'hidden' && !next.mine) {
          stack.push(spot);
        }
      }
    }
  }

  const status: GameStatus = allSafeRevealed(cells) ? 'won' : 'playing';

  return freezeState(state, cells, status, placed);
}

/**
 * Flag or unflag a hidden cell.
 *
 * A revealed cell cannot be flagged - there is nothing left to mark - and a
 * finished game or an out-of-bounds coordinate is a no-op. Flagging works before
 * the mines are laid, which is why a player can plant a flag and have the first
 * reveal lay the field around it without disturbing it. The flag is a mark, not
 * a move: it never wins, loses, or reveals anything.
 */
export function toggleFlag(state: Readonly<GameState>, row: number, col: number): GameState {
  if (state.status !== 'playing' || !inBounds(state, row, col)) {
    return state;
  }

  const target = state.cells[row]?.[col];

  if (target === undefined || target.state === 'revealed') {
    return state;
  }

  const cells = cloneCells(state);
  const cell = cells[row]?.[col];

  if (cell === undefined) {
    return state;
  }

  cell.state = cell.state === 'flagged' ? 'hidden' : 'flagged';

  return freezeState(state, cells, 'playing', state.placed);
}

/* ------------------------------------------------------------- reading it */

export function isWon(state: Readonly<GameState>): boolean {
  return state.status === 'won';
}

export function isLost(state: Readonly<GameState>): boolean {
  return state.status === 'lost';
}

/** How many flags are on the board right now. */
export function flagCount(state: Readonly<GameState>): number {
  return state.cells.reduce(
    (total, rowCells) => total + rowCells.filter(
      (cell) => cell.state === 'flagged',
    ).length,
    0,
  );
}

/**
 * The mine counter every Minesweeper has: the number of mines less the number
 * of flags planted. It can go negative - flag more cells than there are mines
 * and the counter says so - which is the honest behaviour and not a bug.
 */
export function minesRemaining(state: Readonly<GameState>): number {
  return state.mines - flagCount(state);
}

/**
 * Build a placed board with the mines exactly where you say, for tests and for
 * nothing else. It runs the real adjacency code, so a board a test constructs
 * carries the same numbers the game would compute - a test that hand-counted
 * would be a second, quietly-wrong opinion about the same rule.
 */
export function boardFromMines(
  config: Readonly<GameConfig>,
  mines: readonly Coord[],
  seed = 0,
): GameState {
  assertConfig(config);

  const cells: MutableCell[][] = Array.from(
    { length: config.rows },
    () => Array.from(
      { length: config.cols },
      () => ({ mine: false, adjacent: 0, state: 'hidden' }),
    ),
  );

  for (const spot of mines) {
    const cell = cells[spot.row]?.[spot.col];

    if (cell !== undefined) {
      cell.mine = true;
    }
  }

  withAdjacency(cells);

  return freezeState(
    {
      rows: config.rows,
      cols: config.cols,
      mines: config.mines,
      seed: seed >>> 0,
      placed: true,
      status: 'playing',
      cells,
    },
    cells,
    'playing',
    true,
  );
}
