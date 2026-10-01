import { focusMove, stepFocus } from './menus';

/**
 * The keyboard on a menu (docs/SPEC_MENUS.md): Tab and Shift+Tab go round
 * the menu's own controls, the arrow keys walk its buttons, Enter presses the
 * focused one, Esc does the screen's one safe thing. The rules about WHICH
 * button and what Esc may do are in `menus.ts`; this is only the wiring.
 */

/** How soon after a screen opens Esc starts to count on it. */
const ESC_GRACE_MS = 250;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary';

/** The controls in `scope` a keyboard can reach, in page order (hidden ones left out). */
export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** A text box, a list box or a slider: those keep their own keys (arrows move the caret or the value). */
export function isField(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
}

/**
 * Tab goes round the scope and never out of it (behind a menu is a game that
 * cannot take the focus anyway: focus that wandered there was lost, and
 * Enter with it); the arrows walk the buttons. True when the key was used.
 */
export function navKey(scope: HTMLElement, e: KeyboardEvent): boolean {
  if (e.code === 'Tab') {
    const items = focusables(scope);
    if (items.length === 0) return false;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[stepFocus(items.length, at, e.shiftKey ? 'prev' : 'next')]?.focus();
    return true;
  }
  const move = focusMove(e.code);
  if (move === null || isField(e.target)) return false;
  const buttons = focusables(scope).filter((el) => el instanceof HTMLButtonElement || el.tagName === 'SUMMARY');
  if (buttons.length === 0) return false;
  const at = buttons.indexOf(document.activeElement as HTMLElement);
  buttons[stepFocus(buttons.length, at, move)]?.focus();
  return true;
}

/**
 * Enter on a menu: the focused button. With the focus on nothing in the
 * menu (a click on the background), Enter only puts it back on the default,
 * so a stray Enter never presses something the player did not see selected.
 * True when the key was used; fields (the name box) are left to their owner.
 */
export function enterKey(scope: HTMLElement): boolean {
  const a = document.activeElement;
  if (a instanceof HTMLButtonElement && scope.contains(a)) {
    a.click();
    return true;
  }
  if (a instanceof HTMLElement && a !== document.body && scope.contains(a)) return false;
  const first = focusables(scope)[0];
  if (first === undefined) return false;
  first.focus();
  return true;
}

/**
 * The full-screen overlay's keyboard: one window listener for the overlay's
 * whole life, told by each screen what to focus and what Esc does. A panel
 * opened over the screen (Settings, Controls & help) takes the keys while it
 * is up, and Esc closes it first.
 */
export class MenuKeys {
  private live = false;
  /** When the current screen opened (performance.now()). */
  private openedAt = 0;
  private escape: (() => void) | null = null;
  private panel: { readonly el: HTMLElement; readonly close: () => void; readonly teardown: (() => void) | undefined } | null = null;

  constructor(private readonly root: HTMLElement) {
    window.addEventListener('keydown', (e) => this.key(e));
  }

  /** A new screen in the overlay: focus its default, and what Esc does there (null: nothing). */
  open(focus: HTMLElement | null, escape: (() => void) | null): void {
    this.live = true;
    this.openedAt = performance.now();
    this.escape = escape;
    this.dropPanel();
    focus?.focus({ preventScroll: true });
  }

  /** The overlay has gone: the keys belong to the game again. */
  close(): void {
    this.live = false;
    this.escape = null;
    this.dropPanel();
  }

  /**
   * A panel over the screen, modal while it is up. `close` takes it down
   * (and is what Esc does); `teardown` is its owner's clean-up, run exactly
   * once however the panel goes - closed, replaced by another panel, or
   * swept away with the screen.
   */
  openPanel(el: HTMLElement, close: () => void, focus?: HTMLElement, teardown?: () => void): void {
    this.dropPanel();
    this.panel = { el, close, teardown };
    (focus ?? focusables(el)[0])?.focus({ preventScroll: true });
  }

  /** The panel is going (or gone): run its teardown, once, and stop routing keys to it. */
  dropPanel(): void {
    const p = this.panel;
    this.panel = null;
    p?.teardown?.();
  }

  private scope(): HTMLElement {
    if (this.panel !== null && !this.panel.el.isConnected) this.dropPanel();
    return this.panel?.el ?? this.root;
  }

  private key(e: KeyboardEvent): void {
    if (!this.live || e.defaultPrevented) return;
    const scope = this.scope();
    if (e.code === 'Escape') {
      // The press that opened a menu never also closes it: a browser that
      // hands the page the Esc it used to release the mouse would otherwise
      // pause and resume in one keystroke.
      if (e.repeat || e.timeStamp - this.openedAt < ESC_GRACE_MS) return;
      const act = this.panel !== null ? this.panel.close : this.escape;
      if (act === null) return;
      e.preventDefault();
      act();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // A held Enter must not run down a chain of menus.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (enterKey(scope)) e.preventDefault();
      return;
    }
    if (navKey(scope, e)) e.preventDefault();
  }
}
