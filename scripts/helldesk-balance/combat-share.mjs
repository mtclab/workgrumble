// Six careers, sequentially: the current trainee and senior balance scenarios.
// Env: HELLDESK_URL, CHROMIUM, VERBOSE (passed to run.mjs), COMBAT_OUT (JSON directory).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scenarios = [
  { name: 'trainee', rung: 0 },
  { name: 'senior', rung: 6, kit: ['cat6', 'cardigan'] },
];
const seeds = [1700000000, 1700000001, 1700000002];
const dir = process.env.COMBAT_OUT ?? 'combat-share';
mkdirSync(dir, { recursive: true });
const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));
console.log('scenario seed floor floorSec combatSec combatShare aggroEpisodes burnouts');
for (const scenario of scenarios) {
  const shares = [];
  for (const seed of seeds) {
    const out = join(dir, `${scenario.name}-${seed}.json`);
    const run = spawnSync(process.execPath, [runner, JSON.stringify({ ...scenario, seed, floors: 3, wallMinutes: 15 })], {
      env: { ...process.env, OUT: out }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (run.error || run.status !== 0) throw new Error(`${scenario.name} seed ${seed}: runner failed`);
    const result = JSON.parse(readFileSync(out, 'utf8'));
    if (result.floors.length !== 3 || result.errors.length || result.snaps.some((s) => s.err)) {
      throw new Error(`${scenario.name} seed ${seed}: incomplete or errored career; inspect its JSON`);
    }
    for (const f of result.floors) {
      if (![f.floorSec, f.combatSec, f.combatShare, f.aggroEpisodes].every(Number.isFinite) || f.floorSec <= 0) {
        throw new Error(`${scenario.name} seed ${seed}: missing combat measurements`);
      }
      shares.push(f.combatShare);
      console.log(`${scenario.name} ${seed} ${f.floor} ${f.floorSec.toFixed(1)} ${f.combatSec.toFixed(1)} ${f.combatShare.toFixed(4)} ${f.aggroEpisodes} ${f.burnouts}`);
    }
  }
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const spread = Math.max(...shares) - Math.min(...shares);
  console.log(`${scenario.name}: mean combatShare ${mean.toFixed(4)}, spread ${spread.toFixed(4)} (max-min over 9 floors)`);
}
