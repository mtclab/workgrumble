import type { Level } from './level';

/**
 * A level's layout as one number: every grid, every room, prop, person and
 * the start, hashed (FNV-1a, 32 bits). Two floors with the same print are the
 * same floor as far as play is concerned; the meshes are left out on purpose.
 * `levelprint.test.ts` pins today's generator to it for many seeds, so a
 * change meant for missions cannot quietly move the ordinary floors.
 */
export function levelPrint(level: Level): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193) >>> 0;
  };
  const text = (s: string): void => {
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  /** Positions are cell centres or simple offsets: a hundredth of a metre is plenty. */
  const num = (v: number): void => mix(Math.round(v * 100) | 0);
  mix(level.w);
  mix(level.h);
  for (const grid of [level.floor, level.solid, level.opaque]) for (let i = 0; i < grid.length; i++) mix(grid[i] ?? 0);
  for (let i = 0; i < level.roomOf.length; i++) mix(level.roomOf[i] ?? 0);
  for (const r of level.rooms) {
    text(r.kind);
    mix(r.x);
    mix(r.y);
    mix(r.w);
    mix(r.h);
  }
  for (const it of level.interactables) {
    text(it.kind);
    num(it.x);
    num(it.z);
    mix(it.room);
    mix(it.lock);
    mix(it.id);
  }
  for (const sp of level.spawns) {
    text(sp.kind);
    num(sp.x);
    num(sp.z);
    mix(sp.room);
  }
  num(level.start.x);
  num(level.start.z);
  num(level.bossSpawn.x);
  num(level.bossSpawn.z);
  mix(level.lightSpots.length);
  return h;
}
