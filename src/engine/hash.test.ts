import { describe, expect, it } from 'vitest';

import { fnv1a64 } from './hash';

describe('fnv1a64', () => {
  it('matches the standard 64-bit UTF-8 test vector', () => {
    expect(fnv1a64('hello')).toBe('a430d84680aabd0b');
  });

  it('hashes Unicode as UTF-8 bytes', () => {
    expect(fnv1a64('café')).toBe('48e8823acfa40d89');
  });
});

