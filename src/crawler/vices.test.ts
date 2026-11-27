import { describe, expect, it, vi } from 'vitest';
import { caffeineBand, CAFFEINE_EFFECTS } from './caffeine';
import { Game } from './game';
import { derive, newSave } from './state';
import { tickCaffeine } from './vices';

vi.mock('./audio', () => ({ sfx: { jitter: () => undefined } }));

describe('the cardiac scare', () => {
  it('coming down into jittery immediately uses the jittery sanity drain', () => {
    const g = Object.create(Game.prototype) as Game;
    const save = newSave(1);
    save.caffeine = 700;
    Object.assign(g, {
      save, derivedCache: derive(save), jitterT: 10,
      player: { setTool: () => undefined, rig: { glow: 0 } },
      hud: { toast: () => undefined, flash: () => undefined },
      rootPlayer: () => undefined, journal: () => undefined,
    });
    expect(g.derived().caffeine.drain).toBe(2);
    tickCaffeine(g, 0.01);
    expect(caffeineBand(save.caffeine, save.caffeineTol)).toBe('jittery');
    expect(g.derived().caffeine.drain, 'post-scare sanity drain').toBe(CAFFEINE_EFFECTS.jittery.drain);
    expect(g.derived().caffeine.jitter).toBe(CAFFEINE_EFFECTS.jittery.jitter);
  });
});
