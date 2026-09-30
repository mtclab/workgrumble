import { describe, expect, it } from 'vitest';
import { generateLevel, type Level, lineOfSight, TILE, wallBetween } from './level';
import { THEMES } from './textures';

/**
 * The wall test behind hiding people from the renderer. Getting it wrong one
 * way costs frames; getting it wrong the other way makes somebody vanish while
 * they are in plain view, so the direction of every mistake is pinned here.
 */

const centre = (c: number): number => c * TILE + TILE / 2;

function levels(): Level[] {
  const theme = THEMES[0];
  if (theme === undefined) throw new Error('no theme');
  return [1, 2, 3, 4].map((f) => generateLevel(f, theme, 4242 + f * 31, true));
}

describe('wallBetween', () => {
  it('never hides what the sight rules would show', () => {
    for (const lv of levels()) {
      const floors: [number, number][] = [];
      for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) if (lv.floor[z * lv.w + x] === 1) floors.push([x, z]);
      for (let i = 0; i < floors.length; i += 7) {
        for (let j = i + 3; j < floors.length; j += 11) {
          const [ax, az] = floors[i] as [number, number];
          const [bx, bz] = floors[j] as [number, number];
          if (lineOfSight(lv, centre(ax), centre(az), centre(bx), centre(bz))) {
            expect(wallBetween(lv, centre(ax), centre(az), centre(bx), centre(bz))).toBe(false);
          }
        }
      }
    }
  });

  it('hides behind a real wall', () => {
    let checked = 0;
    for (const lv of levels()) {
      for (let z = 1; z < lv.h - 1; z++) {
        for (let x = 1; x < lv.w - 1; x++) {
          const i = z * lv.w + x;
          const wall = lv.opaque[i] === 1 && lv.floor[i] !== 1;
          if (!wall || lv.floor[i - 1] !== 1 || lv.floor[i + 1] !== 1) continue;
          expect(wallBetween(lv, centre(x - 1), centre(z), centre(x + 1), centre(z))).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('does not hide behind a prop that only fills part of its cell', () => {
    let checked = 0;
    for (const lv of levels()) {
      for (let z = 1; z < lv.h - 1; z++) {
        for (let x = 1; x < lv.w - 1; x++) {
          const i = z * lv.w + x;
          const prop = lv.opaque[i] === 1 && lv.floor[i] === 1;
          if (!prop || lv.floor[i - 1] !== 1 || lv.floor[i + 1] !== 1) continue;
          if (lv.opaque[i - 1] === 1 || lv.opaque[i + 1] === 1) continue;
          // The sight rules call this blocked; the renderer must not.
          expect(lineOfSight(lv, centre(x - 1), centre(z), centre(x + 1), centre(z))).toBe(false);
          expect(wallBetween(lv, centre(x - 1), centre(z), centre(x + 1), centre(z))).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
