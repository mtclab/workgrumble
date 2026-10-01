import type { Action } from './settings';

/**
 * Frozen states say so (docs/SPEC_MENUS.md). A meeting, a budget freeze or
 * sitting down on the carpet roots you for a few seconds, and a small status
 * chip was all that said it: playtesters thought the controls had broken.
 * While you cannot move, a card in the middle of the screen says why and for
 * how long, and a movement key pressed meanwhile makes it pulse and plays a
 * short engaged tone, so the press is seen to have been heard.
 */

export interface RootedView {
  /** What has you, e.g. "In a meeting". */
  readonly reason: string;
  /** The rest of it, e.g. the meeting's subject, or empty. */
  readonly detail: string;
  /** Seconds left. */
  readonly left: number;
  /** 1 when it has just started, 0 when it is over: the countdown bar. */
  readonly fraction: number;
}

/**
 * What the card shows, or null for no card. Only in play: in a dialogue or
 * a menu the clock is not running and nothing is being blocked. `rootMax`
 * is how long this hold was when it began; a reason "Kind: detail" is split
 * at the first colon.
 */
export function rootedView(playing: boolean, rootT: number, rootMax: number, reason: string, drain = 1): RootedView | null {
  if (!playing || rootT <= 0) return null;
  const total = Math.max(rootMax, rootT);
  const cut = reason.indexOf(': ');
  const head = cut < 0 ? reason : reason.slice(0, cut);
  return {
    reason: head.trim() === '' ? 'You cannot move' : head,
    detail: cut < 0 ? '' : reason.slice(cut + 2),
    // The clock runs `drain` times as fast (Teflon): the seconds you will actually wait.
    left: rootT / Math.max(1, drain),
    fraction: Math.min(1, rootT / total),
  };
}

/** How fast a hold runs out: twice as fast with the Teflon perk. The tick and the card both use it. */
export function rootDrain(teflonRank: number): number {
  return teflonRank > 0 ? 2 : 1;
}

/** The keys that mean "I am trying to move": any of them while rooted pulses the card. */
export const MOVE_ACTIONS: readonly Action[] = ['forward', 'back', 'left', 'right', 'jump'];

/** The arrow keys walk too (`Game.moveInput`), whatever is bound: they count as trying. */
export const MOVE_CODES: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Was a key that moves you pressed this frame: a bound action, or an arrow. */
export function triesToMove(hitAction: (a: Action) => boolean, hitCode: (code: string) => boolean): boolean {
  return MOVE_ACTIONS.some(hitAction) || MOVE_CODES.some(hitCode);
}

/** Game seconds between two engaged tones: a held-down key mash makes one, not a buzz. */
export const BUSY_GAP = 0.35;

export function busyDue(now: number, lastAt: number | null): boolean {
  return lastAt === null || now - lastAt >= BUSY_GAP;
}

/** The card itself: centred, under the crosshair, gone the moment you can move. */
export class RootedCard {
  private readonly root: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly secs: HTMLDivElement;
  /** How many presses it has answered: on the element too, for the browser tests. */
  private pulses = 0;
  private shown = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-rooted';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('data-testid', 'rooted-card');
    this.root.dataset.pulses = '0';
    this.head = document.createElement('div');
    this.head.className = 'rooted-head';
    this.sub = document.createElement('div');
    this.sub.className = 'rooted-sub';
    const track = document.createElement('div');
    track.className = 'rooted-track';
    this.fill = document.createElement('div');
    this.fill.className = 'rooted-fill';
    track.append(this.fill);
    this.secs = document.createElement('div');
    this.secs.className = 'rooted-secs';
    this.root.append(this.head, this.sub, track, this.secs);
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  update(v: RootedView | null): void {
    if (v === null) {
      if (this.shown) {
        this.shown = false;
        this.root.style.display = 'none';
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.root.style.display = 'flex';
    }
    if (this.head.textContent !== v.reason) this.head.textContent = v.reason;
    if (this.sub.textContent !== v.detail) this.sub.textContent = v.detail;
    this.sub.style.display = v.detail === '' ? 'none' : 'block';
    this.fill.style.width = `${Math.round(v.fraction * 1000) / 10}%`;
    this.secs.textContent = `Back in ${v.left.toFixed(1)} s`;
  }

  /** A movement key was pressed while rooted: say it was heard. */
  pulse(): void {
    this.pulses++;
    this.root.dataset.pulses = String(this.pulses);
    this.root.classList.remove('is-pulse');
    // Restart the animation even when the last one has not finished.
    void this.root.offsetWidth;
    this.root.classList.add('is-pulse');
  }
}
