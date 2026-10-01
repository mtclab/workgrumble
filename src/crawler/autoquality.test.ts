import { describe, expect, it } from 'vitest';
import {
  autoPickDue,
  judge,
  lower,
  MAX_FRAME_MS,
  medianOf,
  type Quality,
  QualityPicker,
  TARGET_FRAME_MS,
  type Verdict,
  WARMUP_MS,
  WINDOW_MS,
} from './autoquality';
import { DEFAULT_SETTINGS } from './settings';

/**
 * A machine, as the picker sees it: the frame time it draws at each level.
 * Runs the picker to its decision (or gives up after a minute of frames)
 * and says where it settled and what it said on the way.
 */
function run(frameAt: Readonly<Record<Quality, number>>, start: Quality = 'high'): { level: Quality; verdicts: Verdict[]; done: boolean } {
  const p = new QualityPicker(start);
  const verdicts: Verdict[] = [];
  for (let t = 0; t < 60_000 && !p.done;) {
    const ms = frameAt[p.level];
    t += ms;
    const v = p.frame(ms);
    if (v !== null) verdicts.push(v);
  }
  return { level: p.level, verdicts, done: p.done };
}

describe('the quality picker', () => {
  it('keeps High on a fast machine, after one window', () => {
    expect(run({ high: 8, medium: 6, low: 4 })).toEqual({ level: 'high', verdicts: ['keep'], done: true });
  });

  it('steps a slow machine down to Medium, and keeps it when Medium is fast enough', () => {
    expect(run({ high: 32, medium: 17, low: 10 })).toEqual({ level: 'medium', verdicts: ['down', 'keep'], done: true });
  });

  it('takes a very slow machine all the way to Low', () => {
    expect(run({ high: 60, medium: 40, low: 18 })).toEqual({ level: 'low', verdicts: ['down', 'down', 'keep'], done: true });
  });

  it('never goes below Low: too slow even there, it stops at Low', () => {
    expect(run({ high: 120, medium: 90, low: 70 })).toEqual({ level: 'low', verdicts: ['down', 'down', 'stop'], done: true });
    expect(run({ high: 120, medium: 90, low: 70 }, 'low')).toEqual({ level: 'low', verdicts: ['stop'], done: true });
    expect(lower('low')).toBe('low');
    expect(judge(500, 'low')).toBe('stop');
  });

  it('decides on the median, at the target (~50 fps): a frame at the target is fast enough', () => {
    expect(judge(TARGET_FRAME_MS, 'high')).toBe('keep');
    expect(judge(TARGET_FRAME_MS + 0.5, 'high')).toBe('down');
    expect(judge(TARGET_FRAME_MS + 0.5, 'medium')).toBe('down');
    // A few hitches in a fast window do not drag it down; a median is not a mean.
    const p = new QualityPicker('high');
    let v: Verdict | null = null;
    for (let i = 0; v === null; i++) v = p.frame(i % 10 === 0 ? 90 : 10);
    expect(v).toBe('keep');
  });

  it('does not time the warm-up: compile stalls right after a start or a step are left out', () => {
    const p = new QualityPicker('high');
    let elapsed = 0;
    let v: Verdict | null = null;
    // Half a second of 100 ms stalls, then a fast machine.
    while (elapsed < WARMUP_MS) {
      expect(p.frame(100)).toBeNull();
      elapsed += 100;
    }
    while (v === null) {
      v = p.frame(10);
      elapsed += 10;
    }
    expect(v).toBe('keep');
    expect(elapsed).toBeGreaterThanOrEqual(WARMUP_MS + WINDOW_MS);
  });

  it('does not let the warm-up lean either way: a burst of quick frames first does not hide a slow machine', () => {
    const p = new QualityPicker('high');
    let elapsed = 0;
    // Five hundred 1 ms frames in the first half second (more frames than
    // the whole window will have), then 30 ms frames.
    while (elapsed < WARMUP_MS) {
      expect(p.frame(1)).toBeNull();
      elapsed += 1;
    }
    let v: Verdict | null = null;
    while (v === null) v = p.frame(30);
    expect(v).toBe('down');
    expect(p.level).toBe('medium');
  });

  it('steps down a machine slower than a frame a second, rather than waiting on it for ever', () => {
    expect(run({ high: 4000, medium: 2500, low: 1500 })).toEqual({ level: 'low', verdicts: ['down', 'down', 'stop'], done: true });
  });

  it('counts one long stall (a tab coming back) as one slow frame: a fast machine still keeps High', () => {
    const p = new QualityPicker('high');
    let v: Verdict | null = null;
    for (let i = 0; v === null; i++) v = p.frame(i === 100 ? 60_000 : 10);
    expect(v).toBe('keep');
    expect(MAX_FRAME_MS).toBeLessThan(WINDOW_MS);
  });

  it('ignores nonsense frame times, and stops completely once it has decided', () => {
    const p = new QualityPicker('high');
    expect(p.frame(0)).toBeNull();
    expect(p.frame(Number.NaN)).toBeNull();
    let v: Verdict | null = null;
    while (v === null) v = p.frame(12);
    expect(v).toBe('keep');
    expect(p.done).toBe(true);
    for (let i = 0; i < 10_000; i++) expect(p.frame(200)).toBeNull();
    expect(p.level).toBe('high');
  });

  it('takes the median of what it was given, odd or even', () => {
    expect(medianOf(Float32Array.from([5, 1, 3]), 3)).toBe(3);
    expect(medianOf(Float32Array.from([4, 1, 3, 2]), 4)).toBe(2.5);
    // Only the first n count.
    expect(medianOf(Float32Array.from([9, 1, 100, 100, 100]), 2)).toBe(5);
    expect(medianOf(new Float32Array(4), 0)).toBe(0);
  });
});

describe('when a launch picks', () => {
  it('picks on a first launch: nothing kept', () => {
    expect(autoPickDue(null)).toBe(true);
  });

  it('does not pick once settings exist: the machine\'s pick, the player\'s, or settings older than the pick', () => {
    expect(autoPickDue(JSON.stringify({ ...DEFAULT_SETTINGS, quality: 'medium', qualitySource: 'auto' }))).toBe(false);
    expect(autoPickDue(JSON.stringify({ ...DEFAULT_SETTINGS, qualitySource: 'player' }))).toBe(false);
    // What every e2e spec seeds, and what a player from before 0.2.0 has.
    expect(autoPickDue(JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false }))).toBe(false);
  });

  it('resumes a pick cut short (the tab closed while it was timing)', () => {
    expect(autoPickDue(JSON.stringify({ ...DEFAULT_SETTINGS, quality: 'medium', qualitySource: 'sampling' }))).toBe(true);
  });

  it('treats unreadable settings as none, as loading them does', () => {
    expect(autoPickDue('{not json')).toBe(true);
    expect(autoPickDue('null')).toBe(true);
  });

  it('defaults to the player\'s own quality: only a first launch marks it as the machine\'s', () => {
    expect(DEFAULT_SETTINGS.qualitySource).toBe('player');
  });
});
