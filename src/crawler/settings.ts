/**
 * Options that belong to the player, not to a career: they survive a new
 * game and are shared by every save slot.
 */
export const ACTIONS = [
  'forward', 'back', 'left', 'right', 'sprint', 'jump', 'attack', 'block', 'interact', 'quickuse', 'cast', 'nextspell',
  'ability', 'sneak', 'rest', 'view', 'map', 'journal', 'backpack',
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint', jump: 'Jump',
  attack: 'Use tool (hold: heavy swing)', block: 'Block (tap: shove)', interact: 'Use / talk', quickuse: 'Quick supplies', cast: 'Cast rune', nextspell: 'Next rune', ability: 'Domain ability',
  sneak: 'Sneak', rest: 'Rest', view: 'First / third person', map: 'Map', journal: 'Journal', backpack: 'Backpack',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space',
  attack: 'Mouse0', block: 'Mouse2', interact: 'KeyE', quickuse: 'KeyQ', cast: 'KeyF', nextspell: 'KeyX', ability: 'KeyG',
  sneak: 'KeyC', rest: 'KeyT', view: 'KeyV', map: 'KeyM', journal: 'KeyJ', backpack: 'Tab',
};

/**
 * A mouse button as a binding: 'Mouse0' is the left, 'Mouse2' the right
 * (`MouseEvent.button`). The mouse and the keyboard share one namespace, so
 * any action can take either and a clash swaps the same way.
 */
export function mouseCode(button: number): string {
  return `Mouse${button}`;
}

/** 'KeyE' → 'E', 'ShiftLeft' → 'Left Shift', 'Mouse0' → 'LMB'. */
export function keyName(code: string): string {
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'Middle mouse';
  if (code === 'Mouse2') return 'RMB';
  if (/^Mouse\d+$/.test(code)) return `Mouse ${Number(code.slice(5)) + 1}`;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps Lock', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return map[code] ?? code;
}

export interface Settings {
  view: 'first' | 'third';
  fov: number;
  sensitivity: number;
  invertY: boolean;
  renderScale: number;
  bloom: boolean;
  quality: 'low' | 'medium' | 'high';
  /**
   * Who set `quality`: the player, the machine on its first launch ('auto':
   * the Control Panel says so), or nobody yet ('sampling': the first launch
   * is still timing it; `autoPickDue` resumes a pick cut short). Settings
   * saved before this existed read as the player's.
   */
  qualitySource: 'player' | 'auto' | 'sampling';
  /** Camera shake on hits. Off is none at all. */
  shake: boolean;
  /** Full-screen flashes: the hurt and heal edges, and SUO's white frames. */
  flashes: boolean;
  /** The split-second freeze when a melee hit lands. */
  hitPause: boolean;
  damageNumbers: boolean;
  tips: boolean;
  compass: boolean;
  music: number;
  sfx: number;
  autosave: boolean;
  /**
   * This player has finished an induction once, in any career: the New
   * Starter Form then ticks "Skip the induction" for them by default.
   */
  inductionDone: boolean;
  /**
   * The New Starter Form's "More options" (star sign, employer, Ironman) was
   * left open: it opens that way next time. Closed for a first career, where
   * those are the choices nobody needs yet.
   */
  starterMore: boolean;
  keys: Record<Action, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  view: 'third',
  fov: 75,
  sensitivity: 1,
  invertY: false,
  renderScale: 1,
  bloom: true,
  quality: 'high',
  qualitySource: 'player',
  shake: true,
  flashes: true,
  hitPause: true,
  damageNumbers: true,
  tips: true,
  compass: true,
  music: 0.5,
  sfx: 0.7,
  autosave: true,
  inductionDone: false,
  starterMore: false,
  keys: { ...DEFAULT_KEYS },
};

const KEY = 'workgrumble-helldesk-settings';

/** The settings exactly as this browser kept them: null when nothing is kept (or nothing can be). */
export function storedSettings(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, keys: { ...DEFAULT_KEYS, ...(saved.keys ?? {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Settings just will not persist in this browser.
  }
}
