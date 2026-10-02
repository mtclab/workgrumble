// Every card of the S1b pool, sequentially, one browser per run: quiet (where the style allows) and loud,
// MISSION_RUNS seeds each (default 10). It fails unless every card x approach finishes the card (quiet or
// loud) on at least 80% of its seeds, and reports the completion rate of each. Add --quiet-on-loud for quiet
// runs of the loud cards too (they start Escalated, so quiet falls straight back to loud).
// Env: HELLDESK_URL, CHROMIUM, MISSION_OUT (directory), MISSION_WALL_MINUTES (per card, default 12), MISSION_RUNS.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionCompletion, missionSummary } from './mission-summary.mjs';
import { MISSION_CARDS, validateMissionRecord } from './mission-record.mjs';

const runsEach = Number(process.env.MISSION_RUNS ?? 10);
if (!Number.isInteger(runsEach) || runsEach <= 0) throw new Error('MISSION_RUNS must be a positive whole number');
const quietOnLoud = process.argv.includes('--quiet-on-loud');
const scenarios = MISSION_CARDS.flatMap((c) => [
  ...(c.quiet || quietOnLoud ? [{ mission: c.id, approach: 'quiet', runs: runsEach }] : []),
  { mission: c.id, approach: 'loud', runs: runsEach },
]);
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
      || !['quiet', 'loud', 'aborted', 'burnout', 'failed'].includes(m.finish) || ![m.seconds, m.repPerMin, m.combatSec, m.minSanityPct].every(Number.isFinite) || m.seconds <= 0) {
      throw new Error(`${name}: incomplete or errored mission; inspect its JSON`);
    }
    validateMissionRecord(m);
    records.push(m);
    console.log(`${m.card} ${m.seed} ${m.approach} ${m.finish} ${m.seconds.toFixed(1)} ${m.maxTier} ${m.detectedAt ?? 'null'} ${m.noticedAt ?? 'null'} ${m.repTotal} ${m.repPerMin.toFixed(2)} ${m.combatSec.toFixed(1)} ${m.minSanityPct}`);
  }
}
const summary = missionSummary(records);
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
for (const c of summary.cards) {
  const q = c.quiet;
  console.log(`${c.card}-quiet: ${q.runs ? `detection rate ${q.detectionRate.toFixed(4)}, median detectedAt ${q.medianDetectedAt ?? 'null'}s, quiet-finish share ${q.quietFinishShare.toFixed(4)} (${q.runs} runs)` : 'not sampled'}`);
}
for (const g of summary.repPerMin) console.log(`${g.card}-${g.approach}: ${g.runs ? `mean Rep/min ${g.mean.toFixed(2)}, spread ${g.spread.toFixed(2)} (max-min, ${g.runs} runs)` : 'not sampled'}`);
for (const c of summary.cards) {
  console.log(`${c.card} quiet/loud Rep/min ratio ${c.quietVsLoudRatio?.toFixed(4) ?? 'null'}; target 0.85-1.15 (reported, enforced in S6): ${c.withinTarget === null ? 'not measured' : c.withinTarget ? 'within' : 'outside'}`);
}
// Every card x approach must finish the card (quiet or loud) on at least 80% of its seeds.
const completion = missionCompletion(records);
writeFileSync(join(dir, 'completion.json'), JSON.stringify(completion, null, 1));
for (const g of completion.groups) {
  console.log(`${g.card}-${g.approach}: completion ${g.rate.toFixed(4)} (${g.done}/${g.runs} finished)${g.ok ? '' : ` BELOW ${completion.least}`}`);
}
if (!completion.ok) {
  const short = completion.groups.filter((g) => !g.ok).map((g) => `${g.card}-${g.approach} ${g.done}/${g.runs}`);
  throw new Error(`cards not completable on ${completion.least * 100}% of seeds: ${short.join(', ')}`);
}
