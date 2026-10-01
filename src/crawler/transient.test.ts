import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { writeSlot } from './saves';
import { newSave } from './state';

vi.mock('./screens', () => ({
  LOADING_OFFICE: 'Office',
  showLoading: (_g: Game, _label: string, fn: () => void) => fn(),
  startPlay: () => undefined,
}));

function host(): Game {
  const g = Object.create(Game.prototype) as Game;
  const noop = (): void => undefined;
  Object.assign(g, { save: newSave(1), abilityCd: 45, os: { hide: noop }, dialogue: { close: noop }, hud: { toast: noop }, loadFloor: noop, loadWorld: noop, journal: noop, openDialogue: noop });
  return g;
}

describe('domain abilities on career changes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a new career starts with its domain ability ready', () => {
    const g = host();
    g.beginCareer({ name: 'Player', background: 'grad', sign: 'patch', rung: 5, domain: 'Systems', track: 'engineer' }, true);
    expect(g.abilityCd, 'new career ability ready').toBe(0);
  });

  it('a loaded save starts with its domain ability ready', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    writeSlot('quick', { name: 'Player', title: 'Engineer', where: 'Office', level: 5 }, newSave(2));
    const g = host();
    expect(g.loadSlot('quick')).toBe(true);
    expect(g.abilityCd, 'loaded career ability ready').toBe(0);
  });
});
