import { describe, expect, it } from 'vitest';

import {
  byteLength,
  checkSave,
  MAX_SAVE_BYTES,
  SAVE_NOT_A_SAVE,
  SAVE_TOO_BIG,
} from './saves';

function saveOf(size: number): string {
  const envelope = { schema: 3, savedAt: 1_700_000_000_000, engine: '' };
  const padding = size - byteLength(JSON.stringify(envelope));

  return JSON.stringify({ ...envelope, engine: 'x'.repeat(Math.max(0, padding)) });
}

describe('what a badge will keep', () => {
  it('takes a save with the two numbers the sync is decided on', () => {
    const checked = checkSave(
      JSON.stringify({ schema: 3, savedAt: 42, label: 'Day 2, 12:35' }),
    );

    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.envelope).toEqual({ schema: 3, savedAt: 42 });
  });

  /**
   * The cap, on the byte rather than the character. A save is mostly the
   * engine's own serialization and that is ASCII, but the label carries what
   * the clock said and a future one could carry anything - and `length` on a
   * string with one emoji in it is not how much room it takes.
   */
  it('refuses a save over half a megabyte, and takes one just under', () => {
    const under = saveOf(MAX_SAVE_BYTES);
    expect(byteLength(under)).toBe(MAX_SAVE_BYTES);
    expect(checkSave(under).ok).toBe(true);

    const over = saveOf(MAX_SAVE_BYTES + 1);
    const refused = checkSave(over);
    expect(refused.ok).toBe(false);
    expect(refused.ok || refused.status).toBe(413);
    expect(refused.ok || refused.reason).toBe(SAVE_TOO_BIG);
  });

  it('counts the bytes, not the characters', () => {
    // Four characters, ten bytes: a cap measured in characters would be a cap
    // that is two and a half times what it says on days when it matters.
    expect(byteLength('週末おわり'.slice(0, 4))).toBeGreaterThan(4);
  });

  it('refuses anything that is not a save file', () => {
    for (const body of ['', 'not json', '[]', '"a string"', '{}']) {
      const refused = checkSave(body);
      expect(refused.ok, body).toBe(false);
      expect(refused.ok || refused.status, body).toBe(400);
      expect(refused.ok || refused.reason, body).toBe(SAVE_NOT_A_SAVE);
    }
  });

  it('refuses a save whose stamp cannot decide a conflict', () => {
    expect(checkSave(JSON.stringify({ schema: 3 })).ok).toBe(false);
    expect(checkSave(JSON.stringify({ schema: 3, savedAt: -1 })).ok).toBe(false);
    expect(checkSave(JSON.stringify({ schema: 3, savedAt: 1.5 })).ok).toBe(false);
    expect(checkSave(JSON.stringify({ savedAt: 1 })).ok).toBe(false);
    expect(checkSave(JSON.stringify({ schema: 0, savedAt: 1 })).ok).toBe(false);
  });
});
