import { BOSS_KEY_LABEL } from '../../keys';
import type { AppDef, AppInstance, GameApi } from '../types';
import {
  applyMove,
  type Card,
  cardCode,
  deal,
  drawStock,
  type GameState,
  isRed,
  isStuck,
  isTableauRun,
  isWon,
  type Move,
  type MoveSource,
  type MoveTarget,
  type Suit,
} from './game';

/**
 * The web store's third real toy, and the one that actually was on every office
 * machine: Klondike Solitaire, playable for real.
 *
 * It is a real slack app the same way Office Arcade and the Media Player are -
 * `slack: true`, the installed-toy slack rate (`SLACK_RATES.solitaire`), a caught
 * scene of its own for the specific thing that was on the screen, and an install
 * on the audit the drip and the lead's beat read. The difference is that this one
 * is a genuine game: a seeded deal, the real Klondike rules, a stock to turn and
 * a win to reach.
 *
 * The rules live next door in `./game` as pure functions over a state value, so
 * everything that could be wrong about the game is tested without a browser. This
 * file is only the hands: it draws the board the logic describes, turns clicks
 * into moves the logic validates, and never decides a rule itself. Two clicks per
 * move - pick a card up, put it down - because a drag in this shell is the fragile
 * thing and a select-then-place is the robust one.
 *
 * The seed comes from the sim clock, a shell source rather than the wall clock,
 * so the deal is deterministic under replay; and the state is transient, dying
 * with the window like the arcade's, so a scripted week that never opens it stays
 * byte-identical.
 */

const SUIT_GLYPH: Readonly<Record<Suit, string>> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const RANK_LABEL: Readonly<Record<number, string>> = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
};

function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

/**
 * A fresh seed from the sim tick and a deal counter, mixed so that dealing again
 * on the same tick still shuffles differently. Integer arithmetic only; the wall
 * clock never gets a look in.
 */
function seedFor(tick: number, deals: number): number {
  const mixed = Math.imul(tick ^ 0x9e3779b9, 2654435761) + Math.imul(deals + 1, 40503);
  return mixed >>> 0;
}

export const SOLITAIRE_APP: AppDef = {
  id: 'solitaire',
  title: 'Office Solitaire',
  icon: 'icon-solitaire',
  tier_required: 1,
  slack: true,
  desktop: true,
  mount: (host, api: GameApi): AppInstance => {
    let deals = 0;
    let state: GameState = deal(seedFor(api.clock.now(), deals));
    let selected: MoveSource | null = null;

    const root = document.createElement('section');
    root.className = 'solitaire-app';
    root.dataset.testid = 'solitaire-app';

    const header = document.createElement('div');
    header.className = 'solitaire-header';

    const title = document.createElement('h1');
    title.className = 'solitaire-title';
    title.textContent = 'Office Solitaire';

    const tip = document.createElement('p');
    tip.className = 'solitaire-tip';
    tip.textContent = `A card game you installed yourself, off the web store. `
      + `Pick a card, then a pile. Panic key: ${BOSS_KEY_LABEL}`;

    const status = document.createElement('p');
    status.className = 'solitaire-status';
    status.dataset.testid = 'solitaire-status';

    const newDeal = document.createElement('button');
    newDeal.type = 'button';
    newDeal.className = 'os-button os-button-compact';
    newDeal.dataset.testid = 'solitaire-new-deal';
    newDeal.textContent = 'New deal';

    header.append(title, tip, status, newDeal);

    const board = document.createElement('div');
    board.className = 'solitaire-board';
    board.dataset.testid = 'solitaire-board';

    root.append(header, board);
    host.replaceChildren(root);

    const sameSource = (a: MoveSource, b: MoveSource): boolean =>
      a.zone === b.zone && a.pile === b.pile && a.index === b.index;

    const isSelectable = (source: MoveSource): boolean => {
      if (source.zone === 'waste') {
        return state.waste.length > 0 && source.index === state.waste.length - 1;
      }

      if (source.zone === 'foundation') {
        const pile = state.foundations[source.pile];
        return pile !== undefined && source.index === pile.length - 1
          && pile.length > 0;
      }

      const pile = state.tableau[source.pile];
      return pile !== undefined && isTableauRun(pile, source.index);
    };

    const attempt = (to: MoveTarget): boolean => {
      if (selected === null) {
        return false;
      }

      const move: Move = { from: selected, to };
      const next = applyMove(state, move);

      if (next === null) {
        return false;
      }

      state = next;
      selected = null;

      if (isWon(state)) {
        api.notify(
          'Office Solitaire',
          'You won. Every card is home, the queue is exactly where you left it, '
            + 'and the only record of the achievement is the one IT keeps of the '
            + 'program that let you get it.',
        );
      }

      return true;
    };

    const onCardClick = (source: MoveSource): void => {
      if (isWon(state)) {
        return;
      }

      if (selected === null) {
        if (isSelectable(source)) {
          selected = source;
        }
      } else if (
        (source.zone === 'tableau' || source.zone === 'foundation')
        && attempt({ zone: source.zone, pile: source.pile })
      ) {
        // Landed onto the pile this card sits on.
      } else if (isSelectable(source) && !sameSource(source, selected)) {
        selected = source;
      } else {
        selected = null;
      }

      render();
    };

    const onDropClick = (to: MoveTarget): void => {
      if (isWon(state) || selected === null) {
        return;
      }

      attempt(to);
      render();
    };

    const onStock = (): void => {
      if (isWon(state)) {
        return;
      }

      selected = null;
      state = drawStock(state);
      render();
    };

    const onNewDeal = (): void => {
      deals += 1;
      state = deal(seedFor(api.clock.now(), deals));
      selected = null;
      render();
    };

    newDeal.addEventListener('click', onNewDeal);
    board.addEventListener('click', onBoardClick);

    // A single delegated listener on the board reads the intent off the target's
    // data attributes, so a full re-render never leaks a per-card listener.
    function onBoardClick(event: MouseEvent): void {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-role]',
      );

      if (target === null || target === undefined) {
        return;
      }

      const role = target.dataset.role;
      const zone = target.dataset.zone as Zone | undefined;
      const pile = Number(target.dataset.pile ?? 'NaN');
      const cardIndex = Number(target.dataset.index ?? 'NaN');

      if (role === 'stock') {
        onStock();
        return;
      }

      if (role === 'drop' && (zone === 'tableau' || zone === 'foundation')
        && Number.isInteger(pile)) {
        onDropClick({ zone, pile });
        return;
      }

      if (role === 'card' && zone !== undefined && Number.isInteger(pile)
        && Number.isInteger(cardIndex)) {
        onCardClick({ zone, pile, index: cardIndex });
      }
    }

    type Zone = MoveSource['zone'];

    function cardButton(card: Card, source: MoveSource): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = card.faceUp ? 'solitaire-card' : 'solitaire-card down';
      button.dataset.colour = card.faceUp
        ? (isRed(card.suit) ? 'red' : 'black')
        : 'down';
      button.dataset.role = 'card';
      button.dataset.zone = source.zone;
      button.dataset.pile = String(source.pile);
      button.dataset.index = String(source.index);

      if (card.faceUp) {
        button.dataset.testid = `solitaire-card-${cardCode(card)}`;
        button.textContent = `${rankLabel(card.rank)}${SUIT_GLYPH[card.suit]}`;
        button.setAttribute(
          'aria-label',
          `${rankLabel(card.rank)} of ${card.suit}`,
        );

        if (selected !== null && sameSource(selected, source)) {
          button.dataset.selected = 'true';
        }
      } else {
        button.textContent = '';
        button.setAttribute('aria-label', 'Face-down card');
        // A face-down tableau card is inert: you cannot pick up what you cannot
        // see, and it carries no test id, so nothing drives it.
        button.disabled = true;
      }

      return button;
    }

    function dropTarget(zone: 'tableau' | 'foundation', pile: number, label: string): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'solitaire-slot';
      button.dataset.role = 'drop';
      button.dataset.zone = zone;
      button.dataset.pile = String(pile);
      button.dataset.testid = `solitaire-drop-${zone === 'tableau' ? 't' : 'f'}-${String(pile)}`;
      button.textContent = label;
      button.setAttribute('aria-label', `Empty ${zone} pile ${String(pile + 1)}`);
      return button;
    }

    function renderStock(): HTMLElement {
      const cell = document.createElement('div');
      cell.className = 'solitaire-pile';
      cell.dataset.testid = 'solitaire-stock-pile';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'solitaire-slot solitaire-stock';
      button.dataset.role = 'stock';
      button.dataset.testid = 'solitaire-stock';
      button.textContent = state.stock.length > 0
        ? String(state.stock.length)
        : '↺';
      button.setAttribute(
        'aria-label',
        state.stock.length > 0
          ? `Stock, ${String(state.stock.length)} cards - draw one`
          : 'Stock empty - recycle the waste',
      );
      cell.append(button);
      return cell;
    }

    function renderWaste(): HTMLElement {
      const cell = document.createElement('div');
      cell.className = 'solitaire-pile';
      cell.dataset.testid = 'solitaire-waste';

      const card = state.waste[state.waste.length - 1];

      if (card === undefined) {
        cell.append(dropTargetLabel('Waste'));
      } else {
        cell.append(cardButton(card, {
          zone: 'waste',
          pile: 0,
          index: state.waste.length - 1,
        }));
      }

      return cell;
    }

    function dropTargetLabel(text: string): HTMLElement {
      const span = document.createElement('span');
      span.className = 'solitaire-empty';
      span.textContent = text;
      return span;
    }

    function renderFoundation(index: number): HTMLElement {
      const cell = document.createElement('div');
      cell.className = 'solitaire-pile';
      cell.dataset.testid = `solitaire-foundation-${String(index)}`;

      const pile = state.foundations[index] ?? [];
      const card = pile[pile.length - 1];

      if (card === undefined) {
        cell.append(dropTarget('foundation', index, '◇'));
      } else {
        cell.append(cardButton(card, {
          zone: 'foundation',
          pile: index,
          index: pile.length - 1,
        }));
      }

      return cell;
    }

    function renderTableau(index: number): HTMLElement {
      const cell = document.createElement('div');
      cell.className = 'solitaire-pile solitaire-column';
      cell.dataset.testid = `solitaire-tableau-${String(index)}`;

      const pile = state.tableau[index] ?? [];

      if (pile.length === 0) {
        cell.append(dropTarget('tableau', index, ''));
        return cell;
      }

      const stack = document.createElement('div');
      stack.className = 'solitaire-stack';
      pile.forEach((card, cardIndex) => {
        stack.append(cardButton(card, { zone: 'tableau', pile: index, index: cardIndex }));
      });
      cell.append(stack);
      return cell;
    }

    function render(): void {
      board.dataset.won = String(isWon(state));

      if (isWon(state)) {
        status.dataset.testid = 'solitaire-status';
        status.textContent = 'You won. The whole deck is home.';
      } else if (isStuck(state)) {
        status.textContent = 'No moves left. Deal again - nobody is counting, '
          + 'except the audit, which counts a different thing.';
      } else if (selected !== null) {
        status.textContent = 'Card in hand. Click a pile to drop it, or the same '
          + 'card to put it back.';
      } else {
        status.textContent = 'Turn the stock, build the columns down, send the '
          + 'aces up.';
      }

      const top = document.createElement('div');
      top.className = 'solitaire-row solitaire-top';
      top.append(renderStock(), renderWaste());
      const gap = document.createElement('div');
      gap.className = 'solitaire-gap';
      top.append(gap);
      for (let f = 0; f < 4; f += 1) {
        top.append(renderFoundation(f));
      }

      const columns = document.createElement('div');
      columns.className = 'solitaire-row solitaire-columns';
      for (let t = 0; t < 7; t += 1) {
        columns.append(renderTableau(t));
      }

      const children: HTMLElement[] = [top, columns];

      if (isWon(state)) {
        const banner = document.createElement('div');
        banner.className = 'solitaire-win';
        banner.dataset.testid = 'solitaire-win';
        banner.textContent = 'You won a game of Office Solitaire.';
        children.push(banner);
      }

      board.replaceChildren(...children);
    }

    render();

    return {
      unmount: (): void => {
        newDeal.removeEventListener('click', onNewDeal);
        board.removeEventListener('click', onBoardClick);
        root.remove();
      },
    };
  },
};
