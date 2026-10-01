import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { rebindCode } from './menus';
import { ACTIONS, type Action, BACKPACK_EXTRA, boundAction, DEFAULT_KEYS, extraFree, RESERVED_KEYS, SNEAK_EXTRA, TOOL_EXTRAS, WALK_EXTRAS } from './settings';

const EXTRAS: readonly string[] = [...WALK_EXTRAS, ...TOOL_EXTRAS, BACKPACK_EXTRA, SNEAK_EXTRA];

/** Bind `a` to `code` the way the Control Panel does: whatever had the key swaps to `a`'s old one. */
function bind(keys: Record<Action, string>, a: Action, code: string): Record<Action, string> {
  const next = { ...keys };
  const clash = ACTIONS.find((x) => x !== a && next[x] === code);
  if (clash !== undefined) next[clash] = next[a];
  next[a] = code;
  return next;
}

/**
 * The real `Game.hit` and `Game.extraHit` on a stand-in Game whose input
 * says `code` went down this frame.
 */
function pressed(keys: Record<Action, string>, code: string): { hit: (a: Action) => boolean; extra: (c: string) => boolean } {
  const g = Object.create(Game.prototype) as Game;
  Object.assign(g, {
    settings: { keys },
    input: { hit: (c: string) => c === code, down: (c: string) => c === code },
  });
  return { hit: (a) => g.hit(a), extra: (c) => g.extraHit(c) };
}

describe('every binding reaches its action', () => {
  it('any action bound to any built-in extra key gets the key, and the extra stands aside', () => {
    for (const a of ACTIONS) {
      for (const code of EXTRAS) {
        const keys = bind({ ...DEFAULT_KEYS }, a, code);
        const p = pressed(keys, code);
        expect(p.hit(a), `${a} on ${code}`).toBe(true);
        expect(boundAction(keys, code)).toBe(a);
        expect(p.extra(code), `${code}'s built-in use while ${a} has it`).toBe(false);
      }
    }
  });

  it('unbound, the extras still work (the arrows walk, I opens the backpack, Left Ctrl sneaks, 1-9 pick tools)', () => {
    for (const code of EXTRAS) {
      expect(extraFree(DEFAULT_KEYS, code), code).toBe(true);
      expect(pressed({ ...DEFAULT_KEYS }, code).extra(code)).toBe(true);
    }
  });

  it('the reserved keys cannot be bound: the binder gives up on them instead', () => {
    for (const code of RESERVED_KEYS) expect(rebindCode({ code, repeat: false })).toEqual({ kind: 'cancel' });
    for (const code of EXTRAS) expect(rebindCode({ code, repeat: false })).toEqual({ kind: 'bind', code });
  });

  /**
   * The rule above only holds if play asks for keys through it. A literal
   * key read straight off the input in play code is a shortcut the binder
   * does not know about, and any binding put on that key is silently dead.
   */
  it('no game code reads a literal key off the input except the reserved ones', () => {
    const dir = join(__dirname);
    const bad: string[] = [];
    const read = /\b(?:inp|input)\.(?:hit|down)\(\s*(['"`])([^'"`]*)\1?/g;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(read)) {
        const code = m[2] ?? '';
        if (!RESERVED_KEYS.includes(code)) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
