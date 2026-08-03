import { BOSS_KEY_LABEL } from '../../keys';
import type { AppDef, AppInstance, GameApi } from '../types';
import {
  BEGINNER,
  type Cell,
  createBoard,
  type GameState,
  isLost,
  isWon,
  minesRemaining,
  reveal,
  toggleFlag,
} from './game';

/**
 * The web store's fourth real toy, and the other program that was on every
 * office machine beside the cards: Minesweeper, playable for real.
 *
 * It is a real slack app the same way Office Solitaire and the Media Player are
 * - `slack: true`, the installed-toy slack rate (`SLACK_RATES.minesweeper`), a
 * caught scene of its own for the specific thing that was on the screen, and an
 * install the audit's drip and the lead's beat read. The difference is that it
 * is a genuine game: a seeded field, first-click safety, the flood, flags, and a
 * win that is every safe cell turned over.
 *
 * The rules live next door in `./game` as pure functions over a state value, so
 * everything that could be wrong about the game is tested without a browser.
 * This file is only the hands: it draws the grid the logic describes, turns
 * clicks into reveals and flags the logic validates, and never decides a rule
 * itself.
 *
 * Two interaction notes, both about robustness. Left-click reveals; flagging is
 * a MODE toggle rather than a right-click, because a right-click is the fragile
 * thing to drive in this shell and a mode button is the robust one (a real
 * right-click still works as a shortcut, but nothing depends on it). And the
 * seed comes from the sim clock, a shell source rather than the wall clock, so
 * the field is deterministic under replay; the state is transient, dying with
 * the window like the arcade's, so a scripted week that never opens it stays
 * byte-identical.
 */

const HIDDEN_GLYPH = '';
const FLAG_GLYPH = '⚑';
const MINE_GLYPH = '✷';

/**
 * A fresh seed from the sim tick and a game counter, mixed so that starting a
 * new game on the same tick still lays a different field. Integer arithmetic
 * only; the wall clock never gets a look in. The same shape the card game uses.
 */
function seedFor(tick: number, games: number): number {
  const mixed = Math.imul(tick ^ 0x9e3779b9, 2654435761) + Math.imul(games + 1, 40503);
  return mixed >>> 0;
}

function cellLabel(cell: Cell): string {
  if (cell.state === 'flagged') {
    return FLAG_GLYPH;
  }

  if (cell.state !== 'revealed') {
    return HIDDEN_GLYPH;
  }

  if (cell.mine) {
    return MINE_GLYPH;
  }

  return cell.adjacent > 0 ? String(cell.adjacent) : '';
}

export const MINESWEEPER_APP: AppDef = {
  id: 'minesweeper',
  title: 'Office Minesweeper',
  icon: 'icon-minesweeper',
  tier_required: 1,
  slack: true,
  desktop: true,
  mount: (host, api: GameApi): AppInstance => {
    let games = 0;
    let state: GameState = createBoard(seedFor(api.clock.now(), games), BEGINNER);
    let flagMode = false;

    const root = document.createElement('section');
    root.className = 'minesweeper-app';
    root.dataset.testid = 'minesweeper-app';

    const header = document.createElement('div');
    header.className = 'minesweeper-header';

    const title = document.createElement('h1');
    title.className = 'minesweeper-title';
    title.textContent = 'Office Minesweeper';

    const tip = document.createElement('p');
    tip.className = 'minesweeper-tip';
    tip.textContent = `A game you installed yourself, off the web store. `
      + `Left-click clears a square; the flag button marks one you would rather `
      + `not. Panic key: ${BOSS_KEY_LABEL}`;

    const status = document.createElement('p');
    status.className = 'minesweeper-status';
    status.dataset.testid = 'minesweeper-status';

    const controls = document.createElement('div');
    controls.className = 'minesweeper-controls';

    const flagToggle = document.createElement('button');
    flagToggle.type = 'button';
    flagToggle.className = 'os-button os-button-compact';
    flagToggle.dataset.testid = 'minesweeper-flag-toggle';

    const newGame = document.createElement('button');
    newGame.type = 'button';
    newGame.className = 'os-button os-button-compact';
    newGame.dataset.testid = 'minesweeper-new-game';
    newGame.textContent = 'New game';

    controls.append(flagToggle, newGame);
    header.append(title, tip, status, controls);

    const grid = document.createElement('div');
    grid.className = 'minesweeper-grid';
    grid.dataset.testid = 'minesweeper-grid';
    grid.style.setProperty('--mine-cols', String(state.cols));

    root.append(header, grid);
    host.replaceChildren(root);

    const act = (row: number, col: number): void => {
      if (isWon(state) || isLost(state)) {
        return;
      }

      state = flagMode ? toggleFlag(state, row, col) : reveal(state, row, col);
      render();
    };

    const onGridClick = (event: MouseEvent): void => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-role="cell"]',
      );

      if (target === null || target === undefined) {
        return;
      }

      const row = Number(target.dataset.r ?? 'NaN');
      const col = Number(target.dataset.c ?? 'NaN');

      if (Number.isInteger(row) && Number.isInteger(col)) {
        act(row, col);
      }
    };

    // A right-click flags, as a shortcut for the wrist that expects it - but the
    // flag MODE button is the interaction the game leans on, so nothing breaks
    // if this never fires.
    const onGridContext = (event: MouseEvent): void => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-role="cell"]',
      );

      if (target === null || target === undefined) {
        return;
      }

      event.preventDefault();
      const row = Number(target.dataset.r ?? 'NaN');
      const col = Number(target.dataset.c ?? 'NaN');

      if (isWon(state) || isLost(state)
        || !Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }

      state = toggleFlag(state, row, col);
      render();
    };

    const onFlagToggle = (): void => {
      flagMode = !flagMode;
      render();
    };

    const onNewGame = (): void => {
      games += 1;
      state = createBoard(seedFor(api.clock.now(), games), BEGINNER);
      flagMode = false;
      render();
    };

    flagToggle.addEventListener('click', onFlagToggle);
    newGame.addEventListener('click', onNewGame);
    grid.addEventListener('click', onGridClick);
    grid.addEventListener('contextmenu', onGridContext);

    function cellButton(cell: Cell, row: number, col: number): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'minesweeper-cell';
      button.dataset.role = 'cell';
      button.dataset.r = String(row);
      button.dataset.c = String(col);
      button.dataset.state = cell.state;
      button.dataset.testid = `minesweeper-cell-${String(row)}-${String(col)}`;

      if (cell.state === 'revealed' && cell.mine) {
        button.dataset.mine = 'true';
      }

      if (cell.state === 'revealed' && !cell.mine && cell.adjacent > 0) {
        button.dataset.count = String(cell.adjacent);
      }

      button.textContent = cellLabel(cell);
      button.setAttribute('aria-label', ariaFor(cell, row, col));
      // A revealed number or blank is settled; nothing is gained by clicking it,
      // and disabling it keeps the flood from re-firing on a dead cell.
      button.disabled = cell.state === 'revealed';
      return button;
    }

    function ariaFor(cell: Cell, row: number, col: number): string {
      const where = `row ${String(row + 1)}, column ${String(col + 1)}`;

      if (cell.state === 'flagged') {
        return `Flagged, ${where}`;
      }

      if (cell.state !== 'revealed') {
        return `Covered, ${where}`;
      }

      if (cell.mine) {
        return `Mine, ${where}`;
      }

      return cell.adjacent > 0
        ? `${String(cell.adjacent)} adjacent, ${where}`
        : `Clear, ${where}`;
    }

    function render(): void {
      const won = isWon(state);
      const lost = isLost(state);
      root.dataset.status = won ? 'won' : lost ? 'lost' : 'playing';
      flagToggle.dataset.active = String(flagMode);
      flagToggle.textContent = flagMode ? 'Flag: on' : 'Flag: off';
      flagToggle.setAttribute('aria-pressed', String(flagMode));

      if (won) {
        status.textContent = 'Cleared it. Every safe square is open, the queue '
          + 'is exactly where you left it, and the only record of the win is the '
          + 'one IT keeps of the program that let you get it.';
      } else if (lost) {
        status.textContent = 'That one was a mine. New game - nobody is counting, '
          + 'except the audit, which counts a different thing.';
      } else {
        status.textContent = `Mines left: ${String(minesRemaining(state))}. `
          + (flagMode
            ? 'Flag mode is on - a click marks a square instead of clearing it.'
            : 'Left-click a square to clear it. First click is always safe.');
      }

      const board = document.createElement('div');
      board.className = 'minesweeper-board';
      board.style.setProperty('--mine-cols', String(state.cols));

      state.cells.forEach((rowCells, row) => {
        rowCells.forEach((cell, col) => {
          board.append(cellButton(cell, row, col));
        });
      });

      const children: HTMLElement[] = [board];

      if (won) {
        const banner = document.createElement('div');
        banner.className = 'minesweeper-banner minesweeper-win';
        banner.dataset.testid = 'minesweeper-win';
        banner.textContent = 'You cleared a game of Office Minesweeper.';
        children.push(banner);
      } else if (lost) {
        const banner = document.createElement('div');
        banner.className = 'minesweeper-banner minesweeper-lose';
        banner.dataset.testid = 'minesweeper-lose';
        banner.textContent = 'You lost a game of Office Minesweeper. '
          + 'The field is face up. Start another.';
        children.push(banner);
      }

      grid.replaceChildren(...children);
    }

    render();

    return {
      unmount: (): void => {
        flagToggle.removeEventListener('click', onFlagToggle);
        newGame.removeEventListener('click', onNewGame);
        grid.removeEventListener('click', onGridClick);
        grid.removeEventListener('contextmenu', onGridContext);
        root.remove();
      },
    };
  },
};
