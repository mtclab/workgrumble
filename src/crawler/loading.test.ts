import { describe, expect, it } from 'vitest';
import { afterLoad, guarded, loadFailureLine } from './loading';

describe('the loading card\'s safety net', () => {
  it('runs the work, and says nothing when it succeeds', () => {
    const seen: string[] = [];
    guarded(() => seen.push('built'), () => seen.push('failed'))();
    expect(seen).toEqual(['built']);
  });

  it('a load that throws goes to the fallback, not into the void', () => {
    const failures: unknown[] = [];
    const boom = new Error('level generation fell over');
    expect(() => guarded(() => { throw boom; }, (e) => failures.push(e))()).not.toThrow();
    expect(failures).toEqual([boom]);
  });

  it('says what went wrong and that the saves are untouched', () => {
    expect(loadFailureLine(new Error('no such floor'))).toBe('That did not load (no such floor). Your saves are as they were: Continue or Load game to try again.');
    expect(loadFailureLine(undefined)).toBe('That did not load. Your saves are as they were: Continue or Load game to try again.');
    expect(loadFailureLine('x'.repeat(500)).length).toBeLessThan(260);
  });
});

describe('where a load lands', () => {
  it('in the pause menu when Esc was pressed while the card was up and the load came out in play', () => {
    expect(afterLoad('play', true)).toBe('pause');
  });

  it('where the load put it otherwise: play as asked, or a dialogue that already has the mouse', () => {
    expect(afterLoad('play', false)).toBe('stay');
    expect(afterLoad('dialogue', true)).toBe('stay');
  });
});
