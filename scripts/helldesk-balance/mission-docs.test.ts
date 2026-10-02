import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('mission balance instructions', () => {
  it('gives readers served-build commands and explains every emitted measurement', () => {
    const doc = readFileSync('docs/HELLDESK.md', 'utf8');
    expect(doc.includes('HELLDESK_URL="$BALANCE_URL" node scripts/helldesk-balance/mission-matrix.mjs')).toBe(true);
    expect(doc).toContain('mission-matrix.mjs --quiet-on-loud');
    expect(doc).toContain('MISSION_RUNS');
    const scenarios = [...doc.matchAll(/run\.mjs '(\{"mission"[^']+\})'/g)].map((m) => JSON.parse(m[1]!) as { mission: string; approach: string; seed: number });
    expect(scenarios.map((s) => [s.mission, s.approach, s.seed])).toEqual([
      ['stapler', 'quiet', 1700000000], ['vendor', 'loud', 1700000000],
    ]);
    const source = readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '');
    const r = runInNewContext(source + `\nmissionRecord({ card: 'stapler', seed: 17, over: true, finish: 'done', seconds: 120,
      maxTier: 0, detectedAt: null, noticedAt: null, noiseEvents: 0,
      result: { quiet: true, repTotal: 168, base: 120, bonus: 48, perResolve: 0 } }, 'quiet', 0, 100)`) as object;
    const fields = /Mission fields:([\s\S]+?)The summary/.exec(doc)?.[1] ?? '';
    for (const key of Object.keys(r)) expect(fields, `reader needs the ${key} definition`).toContain(`\`${key}\``);
    expect(doc).toContain('finish not quiet / runs');
    expect(doc).toContain('MISSION_WALL_MINUTES');
    expect(doc).toContain('diagnostics only');
  });
});
