import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { readSlot, writeSlot } from './saves';
import { showFired } from './screens';
import { newSave, normalizeSave } from './state';

vi.mock('./audio', () => ({ sfx: { error: () => undefined } }));

function fired(save: Game['save']): void {
  const element = () => ({ classList: { toggle: () => undefined }, style: {}, append: () => undefined, addEventListener: () => undefined, querySelector: () => null });
  vi.stubGlobal('document', { createElement: element });
  showFired({ save, input: { releaseLock: () => undefined }, overlay: element(), menuKeys: { open: () => undefined } } as unknown as Game);
}

const meta = { name: 'Player', title: 'Trainee', where: 'Office', level: 1 };

describe('career save ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('firing a new career preserves another career quicksave and removes its own slots', () => {
    let nextCareer = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `career-${++nextCareer}` });
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
    const a = newSave(12);
    const b = newSave(12);
    expect(b.careerId).not.toBe(a.careerId);
    writeSlot('quick', meta, a);
    writeSlot('auto', meta, b);
    fired(b);
    expect(normalizeSave(readSlot('quick')?.data)?.careerId, 'career A quicksave remains loadable').toBe(a.careerId);
    expect(readSlot('auto')).toBeNull();
    writeSlot('quick', meta, b);
    fired(b);
    expect(readSlot('quick')).toBeNull();
    expect(normalizeSave(JSON.parse(JSON.stringify(a)))?.careerId).toBe(a.careerId);
  });

  it('old saves lack an owner and cannot delete unowned slots', () => {
    const old = newSave(1);
    delete old.careerId;
    expect(normalizeSave(old)?.careerId).toBeUndefined();
    expect(normalizeSave({ ...old, version: 2 })?.careerId).toBeUndefined();
  });
});
