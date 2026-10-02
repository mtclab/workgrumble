import { describe, expect, it } from 'vitest';
import { flowField, generateLevel, type Level } from './level';
import { THEMES } from './textures';

/**
 * The hub's recipe (docs/SPEC_HELLDESK_030_S1.md, S1a "The hub floor"):
 * today's room generator made into the career's own floor. The ordinary
 * floors it must not move are pinned by `levelprint.test.ts`.
 */
const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 7919);

function hub(seed: number): Level {
  const theme = THEMES[seed % THEMES.length];
  if (theme === undefined) throw new Error('theme');
  return generateLevel(2, theme, seed, true, false, 'hub');
}

describe('the hub recipe', () => {
  const spawnKinds = new Set(['user', 'caller', 'manager', 'healer', 'helper', 'npc', 'tonttu']);

  function check(level: Level, seed: number): { sauna: boolean } {
    const kinds = level.rooms.map((r) => r.kind);
    expect(level.rooms[0]?.kind, `seed ${seed}: the lobby is room 0`).toBe('lobby');
    const lifts = level.interactables.filter((it) => it.kind === 'elevator');
    expect(lifts, `seed ${seed}: one lift`).toHaveLength(1);
    expect(lifts[0]?.room, `seed ${seed}: in the lobby`).toBe(0);
    expect(kinds, `seed ${seed}: a kitchen`).toContain('kitchen');
    expect(kinds, `seed ${seed}: Internal IT`).toContain('it');
    expect(level.interactables.some((it) => it.kind === 'itdesk'), `seed ${seed}: the IT counter`).toBe(true);
    expect(kinds.filter((k) => k === 'cubicles').length, `seed ${seed}: two open-plan rooms`).toBeGreaterThanOrEqual(2);
    expect(kinds, `seed ${seed}: no corner office`).not.toContain('boss');
    // Nobody rolled to be trouble: only the room kinds' own people.
    for (const sp of level.spawns) expect(spawnKinds.has(sp.kind), `seed ${seed}: ${sp.kind}`).toBe(true);
    // One connected floor from the lift.
    const field = flowField(level, level.start.x, level.start.z, 32000);
    for (let i = 0; i < level.w * level.h; i++) if (level.floor[i] === 1 && level.solid[i] === 0) expect(field[i], `seed ${seed}: cell ${i}`).toBeGreaterThanOrEqual(0);
    return { sauna: kinds.includes('sauna') };
  }

  it('150 seeds: lobby and lift, kitchen, IT, open plan, no boss room, nobody hostile rolled, connected; a sauna at today\'s odds', { timeout: 60_000 }, () => {
    let saunas = 0;
    for (const seed of SEEDS) if (check(hub(seed), seed).sauna) saunas++;
    // Today's odds are 70% (a floor large enough to reach the sauna's turn always is).
    expect(saunas / SEEDS.length).toBeGreaterThan(0.55);
    expect(saunas / SEEDS.length).toBeLessThan(0.85);
  });
});
