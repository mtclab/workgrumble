import { describe, expect, it } from 'vitest';
import { EDGE_SHAPE, edgeShadow, hitPauseFor, shakeScale } from './a11y';
import { RARITY_INFO, RARITY_MARK, RARITY_SHAPE, type Rarity } from './loot';
import { DEFAULT_SETTINGS } from './settings';

describe('comfort settings', () => {
  it('shake off is no shake at all, not a fifth of it', () => {
    expect(shakeScale(false)).toBe(0);
    expect(shakeScale(true)).toBeGreaterThan(0);
  });

  it('hit pause off freezes nothing, on a quick hit or a heavy one', () => {
    expect(hitPauseFor(false, false)).toBe(0);
    expect(hitPauseFor(true, false)).toBe(0);
    expect(hitPauseFor(false, true)).toBeGreaterThan(0);
    expect(hitPauseFor(true, true)).toBeGreaterThan(hitPauseFor(false, true));
  });

  it('everything is on for a new player, as the game has always played', () => {
    expect(DEFAULT_SETTINGS.shake).toBe(true);
    expect(DEFAULT_SETTINGS.flashes).toBe(true);
    expect(DEFAULT_SETTINGS.hitPause).toBe(true);
  });
});

/** A shadow with its colours taken out: what is left is the shape. */
const shapeOf = (s: string): string => s.replace(/rgba\([^)]*\)/g, 'C');

describe('the screen edge says more than its colour', () => {
  it('hurt and heal differ in shape: a hit has a hard rim, a heal has none', () => {
    expect(shapeOf(edgeShadow('hurt', 0.5))).not.toBe(shapeOf(edgeShadow('heal', 0.5)));
    expect(edgeShadow('hurt', 0.5)).toMatch(/inset 0 0 0 \d+px/);
    expect(edgeShadow('heal', 0.5)).not.toMatch(/inset 0 0 0 \d+px/);
    expect(EDGE_SHAPE.heal.blur).toBeGreaterThan(EDGE_SHAPE.hurt.blur * 2);
  });

  it('every flash has a shape of its own', () => {
    const shapes = (['hurt', 'heal', 'meeting'] as const).map((k) => shapeOf(edgeShadow(k, 0.4)));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('fades by opacity alone', () => {
    expect(edgeShadow('hurt', 0.25)).toContain('0.250)');
    expect(shapeOf(edgeShadow('hurt', 0.25))).toBe(shapeOf(edgeShadow('hurt', 0.9)));
  });
});

describe('rarity without colour', () => {
  const rarities = Object.keys(RARITY_INFO) as Rarity[];

  it('every rarity above common has a mark of its own beside the name', () => {
    expect(RARITY_MARK.common).toBe('');
    const marks = rarities.filter((r) => r !== 'common').map((r) => RARITY_MARK[r]);
    expect(marks.every((m) => m !== '')).toBe(true);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('every rarity drops as a shape of its own', () => {
    const shapes = rarities.map((r) => RARITY_SHAPE[r]);
    expect(new Set(shapes).size).toBe(rarities.length);
  });
});
