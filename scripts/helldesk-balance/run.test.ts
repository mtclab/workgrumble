import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/crawler/state';

const source = readFileSync('scripts/helldesk-balance/run.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', "'file:///scripts/helldesk-balance/run.mjs'");

async function run(seed = 1700000000, mission?: string, approach = 'quiet', fault?: string) {
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
  const m = { card: mission, seed, seconds: 120, maxTier: 1, detectedAt: null, noticedAt: 24, over: false, finish: 'done', result: { quiet: true, base: 120, bonus: 48, perResolve: 0, repTotal: 168 } };
  const bot = {
    policy: {}, cur: { combatSec: 3, minSanity: 0.9 }, floors: [] as typeof floors, events: [], deaths: [],
    seed: (n: number) => { calls.push(`bot seed ${n}`); },
    run: (_sec: number, n: number) => { if (fault === 'bot') throw new Error('bot broke'); bot.floors = floors.slice(0, n); m.over = true; return { time: 30 }; },
  };
  const date = { now: () => 42 };
  const browserContext = {
    window: { __crawler: game, __bot: bot, __helldesk: { mission: () => m } }, Date: date,
    document: { querySelector: () => m.over ? {} : null },
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
    goto: (url: string) => { calls.push('navigate'); calls.push(url); },
    waitForFunction: () => undefined,
    keyboard: { press: (key: string) => { calls.push(key); game.screen = 'play'; } },
    reload: () => undefined,
    waitForTimeout: () => undefined,
    click: (text: string) => {
      if (text === 'text=Sign the contract') game.save.seed = date.now() >>> 0;
    },
    getByLabel: (label: string) => ({ check: () => { calls.push(label); } }),
    addScriptTag: () => undefined,
  };
  let wallNow = 0;
  const context = {
    ...(fault === 'cap' ? { Date: { now: () => ++wallNow } } : {}),
    chromium: { launch: () => ({ newPage: () => page, close: () => { calls.push('closed'); } }) },
    process: { exitCode: 0, argv: ['node', 'run.mjs', JSON.stringify({ ...(fault === 'cap' ? { wallMinutes: 0.000001 } : {}), name: 'senior', seed, rung: 6, kit: ['cat6', 'cardigan'], floors: 3, ...(mission ? { mission, approach } : {}) })], env: { OUT: 'result.json' } },
    URL,
    missionRecord: runInNewContext(readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '') + '\nmissionRecord') as unknown,
    readFileSync: () => '',
    writeFileSync: (_path: string, text: string) => { output = text; },
    console: { log: (...parts: unknown[]) => lines.push(parts.map(String).join(' ')) },
  };
  await (runInNewContext(`(async () => { ${source} })()`, context) as Promise<void>);
  return { calls, lines, output, exitCode: context.process.exitCode };
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


describe('mission runner', () => {
  it('loads the pinned card, takes the briefing with Enter and writes the displayed reward', async () => {
    const r = await run(17, 'stapler');
    expect(r.calls.some((call) => call.endsWith('/crawler.html?mission=stapler&seed=17'))).toBe(true);
    expect(r.calls).toContain('Enter');
    expect(r.calls).not.toContain('Skip the induction');
    expect(JSON.parse(r.output)).toMatchObject({ mission: {
      card: 'stapler', seed: 17, approach: 'quiet', finish: 'quiet', seconds: 120,
      maxTier: 1, detectedAt: null, noticedAt: 24, repTotal: 168, repBase: 120,
      repQuietBonus: 48, repResolves: 0, repPerMin: 84, combatSec: 3, minSanityPct: 90,
    }, errors: [] });
    expect(r.calls.at(-1)).toBe('closed');
  });

  it('rejects unknown cards and approaches before opening a browser', async () => {
    await expect(run(17, 'unknown')).rejects.toThrow('mission must be stapler or vendor');
    await expect(run(17, 'vendor', 'cheat')).rejects.toThrow('approach must be quiet, loud or auto');
  });
});


describe('mission failure records', () => {
  it.each(['cap', 'bot'])('reports %s as a failed measurement and closes the browser', async (fault) => {
    const r = await run(17, 'stapler', 'quiet', fault);
    expect(JSON.parse(r.output)).toMatchObject({ mission: null });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain(fault === 'cap' ? 'mission did not finish within wall-time cap' : 'mission runner failed before results');
    expect(r.calls.at(-1)).toBe('closed');
  });
});
