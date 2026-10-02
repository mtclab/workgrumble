import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/crawler/state';

const source = readFileSync('scripts/helldesk-balance/run.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', "'file:///scripts/helldesk-balance/run.mjs'");

async function run(seed = 1700000000, mission?: string, approach = 'quiet', fault?: string, extra: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const lines: string[] = [];
  let output = '';
  const game = {
    save: newSave(1), headless: false, screen: 'play', input: {},
    buy: (id: string) => { calls.push(`buy ${id}`); },
    refreshDerived: () => undefined,
    loadFloor: () => { calls.push(`spawn rung ${game.save.rung} seed ${game.save.seed}`); },
    loadHub: () => { calls.push(`hub rung ${game.save.rung} seed ${game.save.seed}`); },
  };
  const hubShare = typeof extra.hubShare === 'number' ? extra.hubShare : null;
  const floors = hubShare !== null
    ? [{ where: 'hub', floor: 0, floorSec: 1200, combatSec: 1200 * hubShare, combatShare: hubShare, aggroEpisodes: 1 }]
    : [0, 1, 2].map((floor) => ({ floor, floorSec: 10, combatSec: 4, combatShare: 0.4, aggroEpisodes: 2 }));
  const m = { card: mission, seed, seconds: 120, maxTier: 1, detectedAt: null, noticedAt: 24, over: false, finish: 'done', result: { quiet: true, base: 120, bonus: 48, perResolve: 0, repTotal: 168 } };
  const bot = {
    policy: {}, cur: { combatSec: 3, minSanity: 0.9 }, floors: [] as typeof floors, events: [], deaths: [],
    seed: (n: number) => { calls.push(`bot seed ${n}`); },
    run: (_sec: number, n: number) => { if (fault === 'bot') throw new Error('bot broke'); bot.floors = floors.slice(0, n); m.over = true; bot.ended = hubShare !== null; return { time: 30 }; },
    ended: false,
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
    process: { exitCode: 0, argv: ['node', 'run.mjs', JSON.stringify({ ...(fault === 'cap' ? { wallMinutes: 0.000001 } : {}), name: 'senior', seed, rung: 6, kit: ['cat6', 'cardigan'], floors: 3, ...(mission ? { mission, approach } : {}), ...(extra.scenario as object ?? {}) })], env: { OUT: 'result.json' } },
    URL,
    ...(runInNewContext(readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '') + '\n({ missionRecord, MISSION_CARDS })') as object),
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
    await expect(run(17, 'unknown')).rejects.toThrow('mission must be one of stapler, vendor, postits, phishing, josh, marcus, printer');
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


describe('a hub-only week', () => {
  it('stays on the hub (built at the scenario\'s rung), never loads a floor, and reports the 5% gate', async () => {
    const r = await run(1700000000, undefined, 'quiet', undefined, { scenario: { approach: 'hub-only', hubMinutes: 20 }, hubShare: 0.02 });
    expect(r.calls).toContain('hub rung 6 seed 1700000000');
    expect(r.calls.some((c) => c.startsWith('spawn rung'))).toBe(false);
    expect(JSON.parse(r.output)).toMatchObject({ hubWeek: { combatShare: 0.02, floorSec: 1200, pass: true } });
    expect(r.lines.some((l) => l.startsWith('hub-only combatShare 0.0200') && l.endsWith('PASS'))).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('fails the run when the hub is more than 5% fighting', async () => {
    const r = await run(1700000000, undefined, 'quiet', undefined, { scenario: { approach: 'hub-only' }, hubShare: 0.08 });
    expect(JSON.parse(r.output)).toMatchObject({ hubWeek: { combatShare: 0.08, pass: false } });
    expect(r.exitCode).toBe(1);
  });

  it('is a career\'s approach only, with a positive hub time', async () => {
    await expect(run(17, 'stapler', 'hub-only')).rejects.toThrow('approach must be quiet, loud or auto');
    await expect(run(17, undefined, 'quiet', undefined, { scenario: { approach: 'loud' } })).rejects.toThrow('a career\'s approach can only be hub-only');
    await expect(run(17, undefined, 'quiet', undefined, { scenario: { approach: 'hub-only', hubMinutes: 0 } })).rejects.toThrow('hubMinutes must be positive and finite');
  });
});
