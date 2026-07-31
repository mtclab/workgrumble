/**
 * The desk overlay: the things on your desk rather than on your screen.
 *
 * Two items and a growing pile of evidence, drawn over the wallpaper in the
 * bottom corner. They are deliberately NOT windows - a can of energy drink
 * with a titlebar and a taskbar button would be a program, and the whole point
 * of the desk is that it is the part of the office the OS does not manage.
 *
 * It owns no state. What it draws is read from the graph every time it paints,
 * and clicking anything here dispatches a registered action like every other
 * change to the world.
 */

import {
  BEER_TOOLTIP,
  BEER_UNLOCKED_TOOLTIP,
  DRINK_LABELS,
  DRINK_PRICE_PENCE,
  type DrinkPhase,
  drinkPhase,
  drinkState,
  MAX_CANS,
  nextTolerance,
} from '../world/consumables';
import { BEER_TOO_EARLY_REASON, LATE_CAN_REASON } from '../world/actions';
import { EMPTIES_TOLERATED } from '../world/boss';
import { formatPence } from '../world/day';
import { createIcon } from './icons';
import { element, osButton, setAvailability } from './apps/ui';

export interface DeskState {
  readonly phase: DrinkPhase;
  readonly cans: number;
  /** Null when a can may be opened; otherwise why it may not. */
  readonly blocked: string | null;
  /** What the can says about itself while it can still be opened. */
  readonly tooltip: string;
  /** Null once the probation is over; otherwise why the beer is locked. */
  readonly beerBlocked: string | null;
  /** Whether the one with your name on it has already been had. */
  readonly beerOpened: boolean;
}

export interface DeskHandlers {
  drink(): void;
  tidy(): void;
  /** The bottle. It opens a scene rather than swallowing a dispatch. */
  beer(): void;
}

/** How the desk reads a can that is about to be opened, for the tooltip. */
export function drinkTooltip(phase: DrinkPhase, tolerance: number): string {
  const price = `£${formatPence(DRINK_PRICE_PENCE)}`;

  if (phase === 'crash') {
    return `${price}. Another one now, on top of the one that has just worn `
      + 'off, and the next landing will be harder than this one.';
  }

  return tolerance > 1
    ? `${price}. Number ${String(tolerance)} of this run: shorter legs, `
      + 'heavier landing. You know this and you are going to do it anyway.'
    : `${price}. Steady hands for a while, whatever the queue says. There is `
      + 'a bill, and it arrives on time.';
}

/**
 * The desk, as a component the desktop mounts once and repaints when the
 * world moves. Everything it needs is handed to it: the state to draw, and
 * the two verbs, both of which go through the action registry.
 */
export class Desk {
  public readonly element: HTMLElement;

  private readonly drinkButton: HTMLButtonElement;
  private readonly drinkLabel: HTMLElement;
  private readonly beerButton: HTMLButtonElement;
  private readonly beerLabel: HTMLElement;
  private readonly beerLock: SVGElement;
  private readonly empties: HTMLElement;
  private readonly tidyButton: HTMLButtonElement;

  public constructor(handlers: Readonly<DeskHandlers>) {
    this.element = element('div', 'desk-overlay', 'desk-overlay');
    this.element.setAttribute('aria-label', 'Your desk');

    const items = element('div', 'desk-items');

    this.drinkButton = element('button', 'desk-item', 'desk-drink');
    this.drinkButton.type = 'button';
    this.drinkButton.append(createIcon('icon-can'));
    this.drinkLabel = element('span', 'desk-item-label', 'desk-drink-label');
    this.drinkButton.append(this.drinkLabel);
    this.drinkButton.addEventListener('click', () => {
      handlers.drink();
    });

    // Visible, locked, and it says why when you go near it. A locked thing
    // nobody can see is not a locked thing, it is an absent one - and the lock
    // is the setup for the one moment on Friday that pays it off.
    this.beerButton = element('button', 'desk-item desk-item-locked', 'desk-beer');
    this.beerButton.type = 'button';
    this.beerButton.append(createIcon('icon-beer'));
    this.beerLabel = element('span', 'desk-item-label', 'desk-beer-label');
    this.beerLabel.textContent = 'Beer';
    this.beerLock = createIcon('icon-lock');
    this.beerButton.append(this.beerLabel, this.beerLock);
    setAvailability(this.beerButton, BEER_TOOLTIP);
    this.beerButton.addEventListener('click', () => {
      handlers.beer();
    });

    items.append(this.drinkButton, this.beerButton);

    this.empties = element('div', 'desk-empties', 'desk-empties');
    this.tidyButton = osButton('Tidy the desk', 'desk-tidy', { compact: true });
    this.tidyButton.addEventListener('click', () => {
      handlers.tidy();
    });

    this.element.append(items, this.empties, this.tidyButton);
  }

  public render(state: Readonly<DeskState>): void {
    this.element.dataset.phase = state.phase;
    this.element.dataset.cans = String(state.cans);

    this.drinkLabel.textContent = DRINK_LABELS[state.phase];
    this.drinkButton.dataset.phase = state.phase;
    // `setAvailability` writes the refusal into the tooltip when the can is
    // blocked, so the price only takes the attribute back when it is not.
    setAvailability(this.drinkButton, state.blocked);

    if (state.blocked === null) {
      this.drinkButton.title = state.tooltip;
    }

    this.renderBeer(state);
    this.renderEmpties(state.cans);
  }

  /**
   * The beer, which is a tooltip for four and a half days and then a button.
   *
   * The lock lives in the world - only a review that went the right way turns
   * it off - so this reads the answer rather than deciding it, and the label
   * says which of the three things it currently is.
   */
  private renderBeer(state: Readonly<DeskState>): void {
    const locked = state.beerBlocked !== null;
    this.beerButton.classList.toggle('desk-item-locked', locked);
    this.beerButton.dataset.locked = String(locked);
    this.beerButton.dataset.opened = String(state.beerOpened);
    this.beerLock.style.display = locked ? '' : 'none';
    this.beerLabel.textContent = state.beerOpened ? 'Empty' : 'Beer';
    setAvailability(this.beerButton, state.beerBlocked);

    if (!locked) {
      this.beerButton.title = state.beerOpened
        ? 'Gone. It was not a good beer and it was exactly the right beer.'
        : BEER_UNLOCKED_TOOLTIP;
    }
  }

  private renderEmpties(cans: number): void {
    const shown = Math.min(MAX_CANS, Math.max(0, cans));
    this.empties.replaceChildren();

    for (let index = 0; index < shown; index += 1) {
      const empty = element('span', 'desk-empty');
      empty.append(createIcon('icon-can'));
      this.empties.append(empty);
    }

    const tooMany = cans > EMPTIES_TOLERATED;
    this.empties.dataset.tooMany = String(tooMany);
    this.empties.setAttribute(
      'aria-label',
      `${String(cans)} empty can(s) on the desk`,
    );
    this.empties.hidden = shown === 0;

    this.tidyButton.hidden = shown === 0;
    this.tidyButton.title = tooMany
      ? 'Four is the number at which somebody counts them. You are past it.'
      : 'Into the bin, before somebody makes it a conversation.';
  }
}

/** What the desk should be showing, read off the graph and the clock. */
export function deskState(
  fields: {
    readonly startedAt: unknown;
    readonly tolerance: unknown;
    readonly cans: unknown;
    readonly beerUnlocked?: unknown;
    readonly beerOpened?: unknown;
  },
  now: number,
  onShift: boolean,
  shiftEndsAt: number,
  buffTicksFor: (tolerance: number) => number,
): DeskState {
  const run = drinkState(fields.startedAt, fields.tolerance);
  const cans = typeof fields.cans === 'number' && Number.isSafeInteger(fields.cans)
    ? Math.max(0, fields.cans)
    : 0;
  const phase = drinkPhase(run, now);
  const tolerance = nextTolerance(run, now);

  return {
    phase,
    cans,
    blocked: blockedReason(now, onShift, shiftEndsAt, buffTicksFor(tolerance)),
    tooltip: drinkTooltip(phase, tolerance),
    // The same three sentences the engine refuses with, in the same order,
    // because they are the same three rules: a button that greys out for one
    // reason while the engine refuses for another is two rules pretending to
    // be one. The middle one is the one this half exists for - a bottle that
    // could be clicked at ten past three would be the joke told early.
    beerBlocked: fields.beerUnlocked !== true
      ? BEER_TOOLTIP
      : onShift
        ? BEER_TOO_EARLY_REASON
        : null,
    beerOpened: fields.beerOpened === true,
  };
}

/**
 * Why a can cannot be opened, in words the player can act on.
 *
 * The shift-tail rule is here rather than in the engine because it is about
 * the SHAPE of the day rather than about the world: a can opened at ten to
 * five would crash after everybody has gone home, which is a consequence the
 * player would never see and a buff with no bill. The engine still refuses
 * anything outside a shift; this is the half that explains itself.
 */
function blockedReason(
  now: number,
  onShift: boolean,
  shiftEndsAt: number,
  buffTicks: number,
): string | null {
  if (!onShift) {
    return 'The desk is not on shift. Whatever this was going to solve, it '
      + 'will still be there at nine.';
  }

  // The same sentence the engine refuses with, because it is the same rule:
  // this half is the one that greys the can out before the click.
  return now + buffTicks > shiftEndsAt ? LATE_CAN_REASON : null;
}
