/* global window, document, localStorage -- used inside page.evaluate callbacks, which run in the browser */
// Runs one bot career against a served build of the game and prints what happened.
//
//   npx vite build --outDir /tmp/helldesk && npx vite preview --outDir /tmp/helldesk --port 4179 &
//   node scripts/helldesk-balance/run.mjs '{"name":"trainee","floors":5,"wallMinutes":15}'
//
// Scenario keys: name, seed (uint32 career and bot seed), floors, wallMinutes, rung, kit (items to start with),
// workplace, policy (bot policy overrides: staff accept|pushback|delegate,
// mentor accept|quick|decline, talk, fixAcc, block, treats, recruit, buy).
// Env: HELLDESK_URL (default http://localhost:4179/crawler.html), CHROMIUM
// (a Chromium executable), OUT (where to write the JSON, default ./bal-<name>.json).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { missionRecord } from './mission-record.mjs';

const scenario = JSON.parse(process.argv[2] ?? '{}');
if (scenario.seed !== undefined && (!Number.isInteger(scenario.seed) || scenario.seed < 0 || scenario.seed > 0xffffffff)) throw new Error('seed must be a uint32');
if (scenario.mission !== undefined && !['stapler', 'vendor'].includes(scenario.mission)) throw new Error('mission must be stapler or vendor');
if (scenario.approach !== undefined && !['quiet', 'loud', 'auto'].includes(scenario.approach)) throw new Error('approach must be quiet, loud or auto');
if (scenario.wallMinutes !== undefined && (!Number.isFinite(scenario.wallMinutes) || scenario.wallMinutes <= 0)) throw new Error('wallMinutes must be positive and finite');
const name = scenario.name ?? 'run';
const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const G = (fn, arg) => page.evaluate(fn, arg);
if (scenario.seed !== undefined) await page.addInitScript((seed) => { Date.now = () => seed; }, scenario.seed);
const url = new URL(process.env.HELLDESK_URL ?? 'http://localhost:4179/crawler.html');
if (scenario.mission) {
  url.searchParams.set('mission', scenario.mission);
  url.searchParams.set('seed', String(scenario.seed ?? 1700000000));
}
await page.goto(url.href);
await G(() => { localStorage.clear(); localStorage.setItem('workgrumble-helldesk-settings', JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, bloom: false })); });
await page.reload();
if (scenario.mission) {
  const approach = scenario.approach ?? scenario.policy?.approach ?? 'auto';
  const out = { name, scenario, mission: null, errors, snaps: [] };
  const t0 = Date.now();
  const cap = (scenario.wallMinutes ?? 12) * 60000;
  try {
    await page.waitForFunction(() => window.__helldesk?.mission() && window.__crawler.screen === 'dialogue', undefined, { timeout: Math.min(cap, 30000) });
    await G(() => { window.__crawler.headless = true; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__crawler.screen === 'play', undefined, { timeout: Math.min(cap, 30000) });
    await page.addScriptTag({ content: readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
    await G((sc) => {
      Object.assign(window.__bot.policy, sc.policy ?? {}, { approach: sc.approach });
      window.__bot.seed(sc.seed ?? 1700000000);
    }, { ...scenario, approach });
    while (Date.now() - t0 < cap) {
      const r = await G((budget) => window.__bot.run(10, Infinity, budget), Math.min(1000, cap - (Date.now() - t0)));
      out.snaps.push(r);
      const state = await G(() => ({ m: window.__helldesk.mission(), combatSec: window.__bot.cur?.combatSec ?? 0, minSanityPct: Math.round((window.__bot.cur?.minSanity ?? 1) * 100), shown: !!document.querySelector('.mission-result') }));
      if (state.m.over && state.shown) {
        out.mission = missionRecord(state.m, approach, state.combatSec, state.minSanityPct);
        break;
      }
    }
    if (!out.mission) errors.push('mission did not finish within wall-time cap');
  } catch {
    errors.push('mission runner failed before results');
  }
  out.wallSec = Math.round((Date.now() - t0) / 1000);
  writeFileSync(process.env.OUT ?? `bal-${name}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.mission));
  if (errors.length) { console.log('errors', errors); process.exitCode = 1; }
} else {
await G(() => { window.__crawler.headless = true; });
await page.waitForTimeout(800);
await page.click('text=New career');
await page.getByLabel('Skip the induction').check();
await page.waitForTimeout(200);
if (scenario.workplace) await page.click(`text=${scenario.workplace}`).catch(() => {});
await page.click('text=Sign the contract');
await page.waitForTimeout(500);
await page.click('.dlg-opt');
await page.addScriptTag({ content: readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
await G((sc) => {
  const g = window.__crawler;
  g.headless = true;
  g.screen = 'play';
  g.input.enabled = true;
  g.input.locked = true;
  Object.assign(window.__bot.policy, sc.policy ?? {});
  if (sc.seed !== undefined) window.__bot.seed(sc.seed);
  if (sc.rung !== undefined) {
    const s = g.save;
    s.rung = sc.rung;
    s.level = 1 + sc.rung;
    for (const k of Object.keys(s.skills)) s.skills[k].value = Math.min(100, s.skills[k].value + sc.rung * 5);
    if (sc.rung >= 4) { s.domain = 'Systems'; s.track = sc.track ?? 'engineer'; }
    s.rep += sc.rung * 150;
    // Kit a real senior would have picked up on the way: a better tool and some armour.
    for (const id of (sc.kit ?? [])) { const had = s.rep; const f0 = s.floor; s.rep += 5000; s.floor = 4; g.buy(id); s.rep = had; s.floor = f0; }
    g.refreshDerived();
  }
  if (sc.workplace) g.save.workplace = sc.workplace;
  // Spawn the starting enemies at the scenario's rung and employer too.
  g.loadFloor(g.save.floor, false);
}, scenario);
const out = { name, scenario, floors: [], errors, snaps: [] };
const t0 = Date.now();
const maxFloors = scenario.floors ?? 5;
while (Date.now() - t0 < (scenario.wallMinutes ?? 12) * 60000) {
  const r = await G((floors) => window.__bot.run(60, floors), maxFloors).catch((e) => ({ err: String(e) }));
  out.snaps.push(r);
  if (r.err) { console.log('ERR', r.err); break; }
  const floors = await G(() => window.__bot.floors.length);
  if (process.env.VERBOSE) console.log(JSON.stringify(r));
  if (floors >= maxFloors || (await G(() => window.__bot.ended === true))) break;
}
out.floors = await G(() => window.__bot.floors);
out.events = await G(() => window.__bot.events);
out.deaths = await G(() => window.__bot.deaths);
out.final = await G(() => { const s = window.__crawler.save; return { rung: s.rung, level: s.level, rep: s.rep, warnings: s.warnings, burnouts: s.stats.burnouts, staffedDone: s.stats.staffedDone, staffedMissed: s.stats.staffedMissed, mentored: s.stats.mentored, perks: s.perks, won: s.won, team: s.team, mgmt: Math.round(s.standing.management), itcrowd: Math.round(s.standing.itcrowd), week: s.week }; });
out.wallSec = Math.round((Date.now() - t0) / 1000);
writeFileSync(process.env.OUT ?? `bal-${name}.json`, JSON.stringify(out, null, 1));
console.log(`== ${name} (${out.wallSec}s wall)`);
for (const f of out.floors) console.log(JSON.stringify(f));
console.log('final', JSON.stringify(out.final));
console.log('events', out.events.slice(0, 12).join(' | '));
for (const d of out.deaths.slice(0, 40)) console.log('death', JSON.stringify(d));
console.log('errors', errors.slice(0, 5));
}
} finally {
await browser.close();
}
