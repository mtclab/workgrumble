import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/crawler/state';

const source = readFileSync('scripts/helldesk-balance/run.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', "'file:///scripts/helldesk-balance/run.mjs'");

async function run(seed = 1700000000) {
  const calls: string[] = [];
  const lines: string[] = [];
  let output = '';
  const game = {
    save: newSave(1), headless: false, screen: 'play', input: {},
    buy: (id: string) => { calls.push(`buy ${id}`); },
    refreshDerived: () => undefined,
    loadFloor: () => { calls.push(`spawn rung ${game.save.rung} seed ${game.save.seed}`); },
  };
  const floors = [0, 1, 2].map((floor) => ({ floor, floorSec: 10, combatSec: 4, combatShare: 0.4, aggroEpisodes: 2 }));
  const bot = {
    policy: {}, floors: [] as typeof floors, events: [], deaths: [],
    seed: (n: number) => { calls.push(`bot seed ${n}`); },
    run: (_sec: number, n: number) => { bot.floors = floors.slice(0, n); return { time: 30 }; },
  };
  const date = { now: () => 42 };
  const browserContext = {
    window: { __crawler: game, __bot: bot }, Date: date,
    localStorage: { clear: () => undefined, setItem: () => undefined },
    arg: undefined as unknown,
  };
  const evaluate = (fn: { toString: () => string }, arg?: unknown): unknown => {
    browserContext.arg = arg;
    return runInNewContext(`(${fn.toString()})(arg)`, browserContext) as unknown;
  };
  const page = {
    on: () => undefined,
    evaluate: (fn: { toString: () => string }, arg?: unknown) => Promise.resolve(evaluate(fn, arg)),
    addInitScript: (fn: { toString: () => string }, arg: unknown) => { calls.push('init'); evaluate(fn, arg); },
    goto: () => { calls.push('navigate'); },
    reload: () => undefined,
    waitForTimeout: () => undefined,
    click: (text: string) => {
      if (text === 'text=Sign the contract') game.save.seed = date.now() >>> 0;
    },
    getByLabel: (label: string) => ({ check: () => { calls.push(label); } }),
    addScriptTag: () => undefined,
  };
  const context = {
    chromium: { launch: () => ({ newPage: () => page, close: () => { calls.push('closed'); } }) },
    process: { argv: ['node', 'run.mjs', JSON.stringify({ name: 'senior', seed, rung: 6, kit: ['cat6', 'cardigan'], floors: 3 })], env: { OUT: 'result.json' } },
    URL,
    readFileSync: () => '',
    writeFileSync: (_path: string, text: string) => { output = text; },
    console: { log: (...parts: unknown[]) => lines.push(parts.map(String).join(' ')) },
  };
  await (runInNewContext(`(async () => { ${source} })()`, context) as Promise<void>);
  return { calls, lines, output };
}

describe('seeded balance career', () => {
  it('pins the seed before startup, skips induction and spawns senior enemies before measuring', async () => {
    const r = await run();
    expect(r.calls.slice(0, 2)).toEqual(['init', 'navigate']);
    expect(r.calls).toContain('Skip the induction');
    expect(r.calls).toContain('bot seed 1700000000');
    expect(r.calls).toContain('spawn rung 6 seed 1700000000');
    expect(r.calls).toContain('buy cat6');
    expect(r.calls).toContain('buy cardigan');
    expect(r.calls.at(-1)).toBe('closed');
    expect(r.output).toContain('"combatShare": 0.4');
    expect(r.lines).toContain('{"floor":0,"floorSec":10,"combatSec":4,"combatShare":0.4,"aggroEpisodes":2}');
  });

  it('rejects invalid seeds before opening a browser', async () => {
    await expect(run(-1)).rejects.toThrow('seed must be a uint32');
    await expect(run(1.5)).rejects.toThrow('seed must be a uint32');
    await expect(run(4294967296)).rejects.toThrow('seed must be a uint32');
  });
});
