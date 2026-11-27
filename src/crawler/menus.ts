import { type Action, keyName, RESERVED_KEYS } from './settings';

/**
 * The menus' rules, apart from the page so they can be tested
 * (docs/SPEC_MENUS.md): which buttons each screen offers and in what order,
 * what Esc does there, how the arrow keys walk a list, the backpack's app
 * bar, the controls card, and the plain words the New Starter Form uses for
 * its multipliers. The screens build their buttons from these and nothing
 * else, so a test of the list is a test of the screen.
 */

// ---------------------------------------------------------------- focus

export type FocusMove = 'next' | 'prev' | 'first' | 'last';

/** The arrow keys (and Home/End) as a move through a list, or null for any other key. */
export function focusMove(code: string): FocusMove | null {
  switch (code) {
    case 'ArrowDown':
    case 'ArrowRight':
      return 'next';
    case 'ArrowUp':
    case 'ArrowLeft':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

/**
 * Where focus goes next in a list of `count`, from `current` (-1: not in the
 * list yet). It wraps round both ends: a list you can fall off the end of
 * leaves the keyboard player nowhere, which is the trap this is here to stop.
 */
export function stepFocus(count: number, current: number, move: FocusMove): number {
  if (count <= 0) return -1;
  if (move === 'first') return 0;
  if (move === 'last') return count - 1;
  if (current < 0 || current >= count) return move === 'next' ? 0 : count - 1;
  return move === 'next' ? (current + 1) % count : (current - 1 + count) % count;
}

/**
 * The same walk over a list where some entries cannot be chosen (a greyed
 * dialogue line): they are stepped over, never landed on. -1 when nothing in
 * the list can be chosen.
 */
export function stepEnabled(disabled: readonly boolean[], current: number, move: FocusMove): number {
  const live = disabled.flatMap((d, i) => (d ? [] : [i]));
  if (live.length === 0) return -1;
  const at = live.indexOf(current);
  if (at < 0 && (move === 'next' || move === 'prev')) {
    // From a greyed or missing entry, the nearest live one in the direction of travel.
    const ahead = move === 'next' ? live.find((i) => i > current) : [...live].reverse().find((i) => i < current);
    return ahead ?? (move === 'next' ? live[0] ?? -1 : live[live.length - 1] ?? -1);
  }
  return live[stepFocus(live.length, at, move)] ?? -1;
}

/** The first entry that can be chosen, or -1: what a list highlights when it opens. */
export function firstEnabled(disabled: readonly boolean[]): number {
  return disabled.findIndex((d) => !d);
}

// ---------------------------------------------------------------- screens

export type MenuItem =
  | 'continue' | 'new' | 'load' | 'save' | 'settings' | 'controls' | 'whatsnew'
  | 'resume' | 'inventory' | 'character' | 'title' | 'clockin';

export const MENU_LABEL: Record<MenuItem, string> = {
  continue: 'Continue',
  new: 'New career',
  load: 'Load game',
  save: 'Save game',
  settings: 'Settings',
  controls: 'Controls & help',
  whatsnew: 'What\'s new',
  resume: 'Resume',
  inventory: 'Inventory',
  character: 'Character',
  title: 'Title screen',
  clockin: 'Clock back in (restart the floor)',
};

export interface MenuSpec {
  /** Top to bottom; the first is the default (focused on open). */
  readonly items: readonly MenuItem[];
  /** What Esc does on this screen, or null: nothing. */
  readonly escape: MenuItem | null;
}

/**
 * The only things Esc is ever allowed to do on a menu: go back to where you
 * were. Never load, quit, restart or spend anything - a key people press to
 * get out of the way must not cost them a career.
 */
export const SAFE_ESCAPES: readonly MenuItem[] = ['resume'];

/**
 * The mouse was let go of: does the game pause? Only when the browser took
 * it away during play (Esc, alt-tab). A release the game made itself is
 * never a pause, whatever the screen is by the time the event arrives: the
 * event comes later than the release, and a quickload's new floor could be
 * in play by then (it used to open the pause menu over it).
 */
export function lockLossPauses(screen: string, ours: boolean): boolean {
  return !ours && screen === 'play';
}

/**
 * The browser took the mouse away while a load's card was up (Esc during a
 * quickload): there is nothing to pause yet, but the player asked for a
 * pause, so the load lands in one (`afterLoad`). It used to be lost: the
 * load went on into play, uncaptured, with the pause never shown.
 */
export function lockLossDefers(screen: string, ours: boolean): boolean {
  return !ours && screen === 'loading';
}

/** The title is a real main menu: everything a player wants before a game exists. */
export function titleMenu(o: { readonly latest: boolean; readonly saves: boolean }): MenuSpec {
  const items: MenuItem[] = [];
  if (o.latest) items.push('continue');
  items.push('new');
  if (o.saves) items.push('load');
  items.push('settings', 'controls', 'whatsnew');
  return { items, escape: null };
}

/**
 * The pause menu. Ironman neither saves nor loads by hand; under the steam
 * (a vision) nothing is saved and the backpack does not open. Esc resumes.
 */
export function pauseMenu(o: { readonly ironman: boolean; readonly vision: boolean }): MenuSpec {
  const items: MenuItem[] = ['resume'];
  if (!o.ironman) {
    if (!o.vision) items.push('save');
    items.push('load');
  }
  if (!o.vision) items.push('inventory', 'character', 'settings');
  items.push('controls', 'title');
  return { items, escape: 'resume' };
}

/**
 * Burnout: clock back in, or load something better, or leave. Esc does
 * nothing here: every way out is a decision.
 */
export function burnoutMenu(): MenuSpec {
  return { items: ['clockin', 'load', 'title'], escape: null };
}

// ---------------------------------------------------------------- backpack

/**
 * The backpack's app bar, left to right: the number keys 1-8 open them in
 * this order. Character (where the perks are spent), Help and Achievements
 * used to be desktop icons, and the backpack hides the desktop.
 */
export const PACK_APPS = ['inventory', 'character', 'journal', 'hr', 'achievements', 'help', 'settings', 'updates'] as const;

/** Digit1..Digit8 as an index into PACK_APPS, or -1. */
export function packAppKey(code: string): number {
  const m = /^Digit([1-9])$/.exec(code);
  if (m === null) return -1;
  const i = Number(m[1]) - 1;
  return i < PACK_APPS.length ? i : -1;
}

/** Where the keyboard is in the backpack: on the app bar, in the open app, or nowhere in it. */
export type PackZone = 'bar' | 'app' | 'none';

export type PackNav =
  | { readonly kind: 'close' }
  /** Open PACK_APPS[index]. */
  | { readonly kind: 'app'; readonly index: number }
  /** Along the bar. */
  | { readonly kind: 'bar'; readonly move: FocusMove }
  /** Down off the bar, into the open app's first control. */
  | { readonly kind: 'enter' }
  /** Through the open app's controls; up from the first one is back to the bar. */
  | { readonly kind: 'step'; readonly move: 'next' | 'prev' }
  /** Back to the bar (from nowhere in particular). */
  | { readonly kind: 'tobar' }
  /** Round the bar and the open app together, never out of the backpack. */
  | { readonly kind: 'tab'; readonly back: boolean }
  /** Eaten: a held Enter would press the focused button again on every repeat. */
  | { readonly kind: 'swallow' }
  | { readonly kind: 'none' };

/**
 * A held key's repeat that would press a focused button again: Enter (and
 * Space). One press is one purchase, one perk, one equip; a text box keeps
 * its own keys.
 */
export function swallowsRepeat(e: { readonly code: string; readonly repeat: boolean }, field: boolean): boolean {
  return e.repeat && !field && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space');
}

/**
 * The keyboard in the backpack. The bar is the way in: 1-8 open its apps,
 * Left and Right walk it, Down goes into the open app, Up and Down walk the
 * app's buttons (perks, Equip, Use) and Up off the top comes back to the
 * bar. Tab walks the bar and the app together, so a list box or a slider
 * (whose arrows are its own) can always be left. Tab therefore does not
 * close the backpack: Esc, I, or the backpack key when it is not Tab do.
 */
export function packKey(e: { readonly code: string; readonly shiftKey: boolean; readonly repeat: boolean; readonly zone: PackZone; readonly field: boolean; readonly backpackKey: string }): PackNav {
  if (e.code === 'Escape') return { kind: 'close' };
  if (e.code === 'Tab') return { kind: 'tab', back: e.shiftKey };
  if (swallowsRepeat(e, e.field)) return { kind: 'swallow' };
  if (e.field || e.repeat) return { kind: 'none' };
  if (e.code === 'KeyI' || (e.code === e.backpackKey && e.code !== 'Tab')) return { kind: 'close' };
  const app = packAppKey(e.code);
  if (app >= 0) return { kind: 'app', index: app };
  if (e.zone === 'bar') {
    if (e.code === 'ArrowDown') return { kind: 'enter' };
    const move = focusMove(e.code);
    return move === null || e.code === 'ArrowUp' ? { kind: 'none' } : { kind: 'bar', move };
  }
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    if (e.zone === 'app') return { kind: 'step', move: e.code === 'ArrowDown' ? 'next' : 'prev' };
    return { kind: 'tobar' };
  }
  return { kind: 'none' };
}

/**
 * Where the focus goes when a list it was in is drawn again (an Equip, a
 * perk, a rebind redraw the window): the same place, or the last control
 * if the list got shorter, or nowhere (-1) if it was not in the list or the
 * list is now empty. Without it the focus fell to the page and the next key
 * started from nowhere.
 */
export function refocusIndex(was: number, count: number): number {
  if (was < 0 || count <= 0) return -1;
  return Math.min(was, count - 1);
}

/**
 * A key pressed while a Control Panel binding waits for one: the code to
 * bind, 'cancel' to give up waiting (Esc, and the save keys, which stay
 * put), or 'wait' for a held key's repeats. Holding Enter on a binding button used to
 * bind Enter: the press started the wait, its first repeat answered it.
 */
export type RebindAnswer = { readonly kind: 'wait' } | { readonly kind: 'cancel' } | { readonly kind: 'bind'; readonly code: string };
export function rebindCode(e: { readonly code: string; readonly repeat: boolean }): RebindAnswer {
  if (e.repeat) return { kind: 'wait' };
  return RESERVED_KEYS.includes(e.code) ? { kind: 'cancel' } : { kind: 'bind', code: e.code };
}

/**
 * Which save the load menu focuses: the newest, where loading is what the
 * player came for (the title, a burnout). From pause there is a career in
 * progress, unsaved since its last save: Back, so two Enters never throw it
 * away for a save the player did not pick.
 */
export function loadMenuFocus(from: 'title' | 'pause' | 'burnout'): 'newest' | 'back' {
  return from === 'pause' ? 'back' : 'newest';
}

/**
 * The prompt in play: what E would do, or, while the mouse is not captured
 * (a browser that refused the lock after Esc resumed, a click elsewhere),
 * how to get it back.
 */
export const CAPTURE_HINT = 'Click to capture the mouse and look around';
export function playPrompt(screen: string, locked: boolean, prompt: string): string {
  if (screen !== 'play') return '';
  return locked ? prompt : CAPTURE_HINT;
}

// ---------------------------------------------------------------- controls card

/**
 * The essentials, with the keys this player has actually bound: what a new
 * player needs before the first step, not the whole manual (that is Help).
 */
export function controlsGrid(keys: Readonly<Record<Action, string>>): [string, string][] {
  const move = [keys.forward, keys.left, keys.back, keys.right].map(keyName).join(' ');
  return [
    [move, 'move'],
    ['Mouse', 'look'],
    [keyName(keys.jump), 'jump'],
    [keyName(keys.sprint), 'sprint'],
    [keyName(keys.attack), 'tool (hold: heavy swing)'],
    [keyName(keys.block), 'block (tap: shove)'],
    [keyName(keys.interact), 'use / talk'],
    [keyName(keys.quickuse), 'quick supplies'],
    [keyName(keys.rest), 'rest and level up'],
    [keyName(keys.backpack), 'backpack'],
    [keyName(keys.map), 'map'],
    ['Esc', 'pause'],
  ];
}

// ---------------------------------------------------------------- the form's words

/**
 * A multiplier on how hard the building hits, said in words. The number is
 * still shown, as a detail: "×1.25" means nothing to a new starter, "harder"
 * does.
 */
export function difficultyWord(mult: number): string {
  if (mult < 0.8) return 'much easier';
  if (mult < 0.95) return 'easier';
  if (mult <= 1.05) return 'as designed';
  if (mult < 1.3) return 'harder';
  if (mult < 1.7) return 'much harder';
  return 'brutal';
}

export function capitalise(s: string): string {
  return s.length === 0 ? s : `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;
}
