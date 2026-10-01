import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const summarySource = readFileSync('scripts/helldesk-balance/mission-summary.mjs', 'utf8').replaceAll('export ', '');
const recordSource = readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '');
const source = readFileSync('scripts/helldesk-balance/mission-matrix.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('import.meta.url', "'file:///scripts/helldesk-balance/mission-matrix.mjs'");
interface Record {
  card: string; seed: number; approach: string; finish: string; seconds: number;
  maxTier: number; detectedAt: number | null; noticedAt: number | null;
  repTotal: number; repPerMin: number; combatSec: number; minSanityPct: number;
  repBase: number; repQuietBonus: number; repResolves: number;
}
const summary = runInNewContext(summarySource + '\nmissionSummary') as (records: Record[]) => {
  staplerQuiet: { runs: number; detectionRate: number | null; medianDetectedAt: number | null; quietFinishShare: number | null };
  repPerMin: { card: string; approach: string; runs: number; mean: number | null; spread: number | null }[];
  staplerQuietVsLoudRatio: number | null; withinTarget: boolean | null;
};
function record(finish = 'quiet', detectedAt: number | null = null, repPerMin = 100): Record {
  return { card: 'stapler', seed: 17, approach: 'quiet', finish, seconds: 120,
    maxTier: 1, detectedAt, noticedAt: 0, repTotal: repPerMin * 2, repPerMin, combatSec: 2, minSanityPct: 90,
    repBase: 120, repQuietBonus: finish === 'quiet' ? 48 : 0, repResolves: 0 };
}

function matrix(fault?: string, extended = false) {
  const runs: { mission: string; approach: string; seed: number; wallMinutes: number }[] = [];
  const lines: string[] = [];
  let active = false;
  let last: (typeof runs)[number];
  return { runs, lines, run: () => runInNewContext(recordSource + summarySource + source, {
    process: { argv: extended ? ['node', 'matrix', '--vendor-quiet'] : ['node', 'matrix'], execPath: 'node', env: { HELLDESK_URL: 'served-build', MISSION_WALL_MINUTES: '3' } },
    URL, fileURLToPath: (url: URL) => url.pathname, join: (...parts: string[]) => parts.join('/'),
    mkdirSync: () => undefined, writeFileSync: () => undefined,
    spawnSync: (_exec: string, args: string[], options: { env: object; timeout: number }) => {
      expect(active).toBe(false);
      active = true;
      last = JSON.parse(args[1]!) as typeof last;
      runs.push(last);
      expect(options.env).toMatchObject({ HELLDESK_URL: 'served-build' });
      expect(options.timeout).toBe(210000);
      active = false;
      return { status: fault === 'exit' ? 1 : 0, ...(fault === 'timeout' ? { error: new Error('timeout') } : {}) };
    },
    readFileSync: () => JSON.stringify({
      mission: fault === 'unfinished' ? null : { ...record(last.approach === 'quiet' ? 'quiet' : 'loud'), card: last.mission, approach: last.approach, seed: last.seed },
      errors: fault === 'page' ? ['page error'] : [], snaps: fault === 'bot' ? [{ err: 'bot error' }] : [],
    }),
    console: { log: (line: string) => lines.push(line) },
  }) as unknown };
}

describe('mission matrix', () => {
  it('measures 30 quiet staplers and ten of each loud card sequentially on paired seeds', () => {
    const m = matrix(); m.run();
    expect(m.runs).toHaveLength(50);
    expect(m.runs.slice(0, 30).every((r, i) => r.mission === 'stapler' && r.approach === 'quiet' && r.seed === 1700000000 + i)).toBe(true);
    expect(m.runs.slice(30, 40).every((r, i) => r.mission === 'stapler' && r.approach === 'loud' && r.seed === 1700000000 + i)).toBe(true);
    expect(m.runs.slice(40).every((r, i) => r.mission === 'vendor' && r.approach === 'loud' && r.seed === 1700000000 + i)).toBe(true);
    expect(m.lines.filter((l) => /^(stapler|vendor) \d/.test(l))).toHaveLength(50);
    expect(m.lines).toContain('stapler-quiet: detection rate 0.0000, median detectedAt nulls, quiet-finish share 1.0000 (30 runs)');
    expect(m.lines).toContain('vendor-quiet: not sampled');
    expect(m.lines.at(-1)).toContain('ratio 1.0000');
    const both = matrix(undefined, true); both.run();
    expect(both.runs).toHaveLength(60);
  });

  it.each(['exit', 'timeout', 'unfinished', 'page', 'bot'])('fails without a summary when a run has %s', (fault) => {
    const m = matrix(fault);
    expect(m.run).toThrow();
    expect(m.runs).toHaveLength(1);
    expect(m.lines.some((l) => l.includes('detection rate'))).toBe(false);
  });
});

describe('mission summary', () => {
  it('counts every nonquiet finish as detected, excludes null times from the median and compares mean run rates', () => {
    const records = [record(), record('loud', 20, 80), record('burnout', 40, 0), record('aborted', null, 0),
      { ...record('loud', 0, 60), approach: 'loud' }, { ...record('loud', 0, 40), approach: 'loud' }];
    const s = summary(records);
    expect(s.staplerQuiet).toEqual({ runs: 4, detectionRate: 0.75, medianDetectedAt: 30, quietFinishShare: 0.25 });
    expect(s.repPerMin[0]).toMatchObject({ mean: 45, spread: 100 });
    expect(s.staplerQuietVsLoudRatio).toBe(0.9);
    expect(s.withinTarget).toBe(true);
    expect(summary(records.slice(0, 3)).staplerQuiet.medianDetectedAt).toBe(30);
    expect(summary([record('loud', 7)]).staplerQuiet.medianDetectedAt).toBe(7);
    expect(summary([]).staplerQuiet.detectionRate).toBeNull();
    expect(summary([]).staplerQuietVsLoudRatio).toBeNull();
  });
});


describe('reward comparisons', () => {
  it('uses the mean of per-run rates, handles odd medians and includes the 15 percent boundaries', () => {
    const s = summary([record('loud', 10, 120), record('loud', 40, 40), record('loud', 20, 80)]);
    expect(s.repPerMin[0]?.mean).toBe(80);
    expect(s.staplerQuiet.medianDetectedAt).toBe(20);
    for (const rate of [85, 115]) {
      expect(summary([record('quiet', null, rate), { ...record('loud', 0, 100), approach: 'loud' }]).withinTarget).toBe(true);
    }
    expect(summary([record(), { ...record('loud', 0, 0), approach: 'loud' }]).staplerQuietVsLoudRatio).toBeNull();
  });
});
