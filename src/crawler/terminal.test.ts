import { afterEach, describe, expect, it, vi } from 'vitest';
import { said } from './dialogue';
import { Game } from './game';
import type { Interactable } from './level';
import { writeSlot } from './saves';
import { resume } from './screens';
import { derive, newSave } from './state';

vi.mock('./audio', () => ({ sfx: { unlock: () => undefined, boot: () => undefined } }));
vi.mock('./screens', async (orig) => ({
  ...(await orig<typeof import('./screens')>()),
  showLoading: (_g: Game, _label: string, fn: () => void) => fn(),
}));

const terminal = { id: 1, kind: 'terminal' } as Interactable;

function host(): { g: Game; finish: () => void } {
  const g = Object.create(Game.prototype) as Game;
  let finish = (): void => undefined;
  const save = newSave(1);
  const noop = (): void => undefined;
  Object.assign(g, {
    save, derivedCache: derive(save), currentTerminal: terminal,
    overlay: { style: {}, replaceChildren: noop }, menuKeys: { close: noop },
    input: { requestLock: noop, releaseLock: noop },
    os: { hide: noop, open: noop }, hud: { toast: noop },
    dialogue: { close: noop, show: (_node: unknown, cb: () => void) => { finish = cb; } },
    loadFloor: noop, loadWorld: noop, journal: noop, tip: noop, saveIn: 10,
  });
  return { g, finish: () => finish() };
}

function backpack(g: Game): void {
  g.openOs('pack');
  expect(g.hasTerminal(), 'backpack has no computer actions').toBe(false);
}

describe('leaving a computer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starting a new career leaves the backpack a backpack', () => {
    const { g } = host();
    g.beginCareer({ name: 'Player', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null }, true);
    expect(g.hasTerminal(), 'new career is away from the terminal').toBe(false);
    backpack(g);
  });

  it('loading a save leaves the backpack a backpack', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    writeSlot('quick', { name: 'Player', title: 'Trainee', where: 'Office', level: 1 }, newSave(2));
    const { g } = host();
    expect(g.loadSlot('quick')).toBe(true);
    expect(g.hasTerminal(), 'loaded player is away from the terminal').toBe(false);
    backpack(g);
  });

  it('ending disciplinary dialogue and resuming play leave no computer actions', () => {
    const h = host();
    h.g.openDialogue(said('HR', 'Hearing concluded.', 'neutral', 'Leave'));
    h.finish();
    expect(h.g.hasTerminal(), 'dialogue ended away from the terminal').toBe(false);
    h.g.currentTerminal = terminal;
    resume(h.g);
    expect(h.g.hasTerminal()).toBe(false);
    backpack(h.g);
  });

  it('opening the backpack itself clears any stale computer', () => backpack(host().g));
});
