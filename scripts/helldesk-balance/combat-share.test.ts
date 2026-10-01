import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/helldesk-balance/combat-share.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('import.meta.url', "'file:///scripts/helldesk-balance/combat-share.mjs'");

function measure(incomplete = false) {
  const runs: { name: string; rung: number; kit?: string[]; seed: number; floors: number }[] = [];
  const lines: string[] = [];
  const context = {
    process: { env: { HELLDESK_URL: 'served-build', CHROMIUM: 'browser', COMBAT_OUT: 'results' }, execPath: 'node' },
    URL,
    fileURLToPath: (url: URL) => url.pathname,
    join: (...parts: string[]) => parts.join('/'),
    mkdirSync: () => undefined,
    spawnSync: (_exec: string, args: string[], options: { env: Record<string, string> }) => {
      runs.push(JSON.parse(args[1] ?? '{}') as (typeof runs)[number]);
      expect(options.env).toMatchObject({ HELLDESK_URL: 'served-build', CHROMIUM: 'browser' });
      expect(options.env.OUT).toMatch(/^results\/(trainee|senior)-\d+\.json$/);
      return { status: 0 };
    },
    readFileSync: () => JSON.stringify({
      floors: [0, 1, 2].slice(0, incomplete ? 2 : 3).map((floor) => ({ floor, floorSec: 10, combatSec: floor + 1, combatShare: (floor + 1) / 10, aggroEpisodes: floor + 2, burnouts: 0 })),
      errors: [], snaps: [],
    }),
    console: { log: (line: string) => lines.push(line) },
  };
  return { run: () => runInNewContext(source, context) as unknown, runs, lines };
}

describe('combat-share matrix', () => {
  it('runs six three-floor careers sequentially and reports times, fights, mean and spread', () => {
    const m = measure();
    m.run();
    expect(m.runs).toHaveLength(6);
    expect(m.runs.slice(0, 3).map((r) => [r.name, r.rung, r.seed, r.floors])).toEqual([
      ['trainee', 0, 1700000000, 3], ['trainee', 0, 1700000001, 3], ['trainee', 0, 1700000002, 3],
    ]);
    expect(m.runs.slice(3).every((r) => r.name === 'senior' && r.rung === 6 && r.kit?.join(',') === 'cat6,cardigan')).toBe(true);
    expect(m.lines.filter((line) => /^(trainee|senior) \d/.test(line))).toHaveLength(18);
    expect(m.lines).toContain('trainee 1700000000 0 10.0 1.0 0.1000 2 0');
    expect(m.lines).toContain('senior: mean combatShare 0.2000, spread 0.2000 (max-min over 9 floors)');
  });

  it('rejects a partial career instead of reporting a misleading average', () => {
    const m = measure(true);
    expect(m.run).toThrow('incomplete or errored career');
    expect(m.runs).toHaveLength(1);
  });
});
