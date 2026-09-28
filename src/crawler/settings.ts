/**
 * Options that belong to the player, not to a career: they survive a new
 * game and are shared by every save slot.
 */
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
};

const KEY = 'workgrumble-helldesk-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Settings just will not persist in this browser.
  }
}
