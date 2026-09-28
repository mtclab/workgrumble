/**
 * Options that belong to the player, not to a career: they survive a new
 * game and are shared by every save slot.
 */
export const ACTIONS = [
  'forward', 'back', 'left', 'right', 'sprint', 'jump', 'interact', 'quickuse', 'cast', 'nextspell',
  'ability', 'sneak', 'rest', 'view', 'map', 'journal', 'backpack',
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint', jump: 'Jump',
  interact: 'Use / talk', quickuse: 'Quick supplies', cast: 'Cast rune', nextspell: 'Next rune', ability: 'Domain ability',
  sneak: 'Sneak', rest: 'Rest', view: 'First / third person', map: 'Map', journal: 'Journal', backpack: 'Backpack',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space',
  interact: 'KeyE', quickuse: 'KeyQ', cast: 'KeyF', nextspell: 'KeyX', ability: 'KeyG',
  sneak: 'KeyC', rest: 'KeyT', view: 'KeyV', map: 'KeyM', journal: 'KeyJ', backpack: 'Tab',
};

/** 'KeyE' → 'E', 'ShiftLeft' → 'Left Shift'. */
export function keyName(code: string): string {
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
  shake: boolean;
  damageNumbers: boolean;
  tips: boolean;
  compass: boolean;
  music: number;
  sfx: number;
  autosave: boolean;
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
  shake: true,
  damageNumbers: true,
  tips: true,
  compass: true,
  music: 0.5,
  sfx: 0.7,
  autosave: true,
  keys: { ...DEFAULT_KEYS },
};

const KEY = 'workgrumble-helldesk-settings';

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
