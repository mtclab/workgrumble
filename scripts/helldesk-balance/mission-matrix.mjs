// Prototype cards, sequentially, one browser per run. Add --vendor-quiet for both approaches on both cards.
// Env: HELLDESK_URL, CHROMIUM, MISSION_OUT (directory), MISSION_WALL_MINUTES (per card, default 12).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionSummary } from './mission-summary.mjs';

const scenarios = [
  { mission: 'stapler', approach: 'quiet', runs: 30 },
  { mission: 'stapler', approach: 'loud', runs: 10 },
  { mission: 'vendor', approach: 'loud', runs: 10 },
  ...(process.argv.includes('--vendor-quiet') ? [{ mission: 'vendor', approach: 'quiet', runs: 10 }] : []),
];
const wallMinutes = Number(process.env.MISSION_WALL_MINUTES ?? 12);
if (!Number.isFinite(wallMinutes) || wallMinutes <= 0) throw new Error('MISSION_WALL_MINUTES must be positive and finite');
const dir = process.env.MISSION_OUT ?? 'mission-results';
mkdirSync(dir, { recursive: true });
const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));
const records = [];
console.log('card seed approach finish seconds maxTier detectedAt noticedAt repTotal repPerMin combatSec minSanityPct');
for (const scenario of scenarios) {
  for (let i = 0; i < scenario.runs; i++) {
    const seed = 1700000000 + i;
    const name = `${scenario.mission}-${scenario.approach}-${seed}`;
    const out = join(dir, `${name}.json`);
    const run = spawnSync(process.execPath, [runner, JSON.stringify({ name, mission: scenario.mission, approach: scenario.approach, seed, wallMinutes })], {
      env: { ...process.env, OUT: out }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: wallMinutes * 60000 + 30000,
    });
    if (run.error || run.status !== 0) throw new Error(`${name}: runner failed or exceeded its cap`);
    const result = JSON.parse(readFileSync(out, 'utf8'));
    const m = result.mission;
    if (result.errors.length || result.snaps.some((s) => s.err) || !m || m.card !== scenario.mission || m.approach !== scenario.approach || m.seed !== seed
      || !['quiet', 'loud', 'aborted', 'burnout'].includes(m.finish) || ![m.seconds, m.repPerMin, m.combatSec, m.minSanityPct].every(Number.isFinite) || m.seconds <= 0) {
      throw new Error(`${name}: incomplete or errored mission; inspect its JSON`);
    }
    records.push(m);
    console.log(`${m.card} ${m.seed} ${m.approach} ${m.finish} ${m.seconds.toFixed(1)} ${m.maxTier} ${m.detectedAt ?? 'null'} ${m.noticedAt ?? 'null'} ${m.repTotal} ${m.repPerMin.toFixed(2)} ${m.combatSec.toFixed(1)} ${m.minSanityPct}`);
  }
}
const summary = missionSummary(records);
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
const q = summary.staplerQuiet;
console.log(`stapler-quiet: detection rate ${q.detectionRate.toFixed(4)}, median detectedAt ${q.medianDetectedAt ?? 'null'}s, quiet-finish share ${q.quietFinishShare.toFixed(4)} (${q.runs} runs)`);
for (const g of summary.repPerMin) console.log(`${g.card}-${g.approach}: ${g.runs ? `mean Rep/min ${g.mean.toFixed(2)}, spread ${g.spread.toFixed(2)} (max-min, ${g.runs} runs)` : 'not sampled'}`);
console.log(`stapler quiet/loud Rep/min ratio ${summary.staplerQuietVsLoudRatio?.toFixed(4) ?? 'null'}; target 0.85-1.15: ${summary.withinTarget === null ? 'not measured' : summary.withinTarget ? 'within' : 'outside'}`);
