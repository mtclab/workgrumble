/* global window, localStorage, performance -- used inside page.evaluate callbacks */
// Helldesk render benchmark: frame times and per-frame draw work for fixed
// scenes at each quality level, on a built copy of the game.
//
//   npm run build
//   node scripts/perf/bench.mjs [--dist dist] [--url http://host:port/crawler.html]
//     [--scenes title,floor1,floor4,mokki] [--qualities low,medium,high]
//     [--seconds 8] [--width 1920] [--height 1080] [--out bench.json]
//     [--tweak "<js run with g = the game before sampling>"]
//
// Numbers are only meaningful on real graphics hardware with a headed
// browser (software rendering and headless rAF starvation both lie). The
// renderer string is recorded with every run so a result says what drew it.
//
// Every run is deterministic in content: Date.now is pinned before the game
// loads (it seeds the save and the effects RNG), the player is made invisible
// so nothing aggroes, and the camera sweeps one full turn over the sample.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] ?? '']);
  return acc;
}, []));
const scenes = (args.scenes ?? 'title,floor1,floor4,mokki').split(',');
const qualities = (args.qualities ?? 'low,medium,high').split(',');
const seconds = Number(args.seconds ?? 8);
const width = Number(args.width ?? 1920);
const height = Number(args.height ?? 1080);
const headless = process.env.HEADLESS !== '0';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png' };

async function serve(dir) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { server, url: `http://127.0.0.1:${server.address().port}/crawler.html` };
}

const served = args.url === undefined ? await serve(args.dist ?? 'dist') : null;
const url = args.url ?? served.url;

const browser = await chromium.launch({
  headless,
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  // Uncapped on purpose: a virtual display (xvfb) cannot hold a real 60 Hz
  // even for a blank canvas, so paced numbers from one measure the display.
  args: (process.env.CHROME_FLAGS ?? '').split(' ').filter(Boolean).concat([
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--ignore-gpu-blocklist',
  ]),
});

async function run(scene, quality) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const pinned = 1_700_000_000_000;
    Date.now = () => pinned;
  });
  await page.goto(url);
  await page.evaluate((q) => {
    localStorage.clear();
    localStorage.setItem('workgrumble-helldesk-settings', JSON.stringify({ quality: q, tips: false }));
  }, quality);
  await page.reload();
  await page.waitForFunction(() => window.__crawler !== undefined);
  const gl = await page.evaluate(() => {
    const c = window.__crawler.renderer.getContext();
    const ext = c.getExtension('WEBGL_debug_renderer_info');
    return ext === null ? c.getParameter(c.RENDERER) : c.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  });
  if (scene !== 'title') {
    // Generous timeouts: signing the contract builds the first floor and
    // compiles its shaders on the main thread, which a click has to wait out.
    const slow = { timeout: 120_000 };
    await page.click('text=New career', slow);
    await page.waitForTimeout(200);
    await page.click('text=Sign the contract', slow);
    await page.waitForTimeout(500);
    await page.click('.dlg-opt', slow);
    await page.evaluate((sc) => {
      const g = window.__crawler;
      if (sc === 'mokki') g.loadMokki(false);
      else if (sc !== 'floor1') g.loadFloor(Number(sc.replace('floor', '')), false);
      g.screen = 'play';
      g.input.enabled = true;
      g.input.locked = true;
    }, scene);
  }
  // An experiment on top of the scene: switch one thing off, measure the rest.
  if (args.tweak !== undefined) await page.evaluate((js) => new Function('g', js)(window.__crawler), args.tweak);
  // Settle: shader compiles, first shadow maps, texture uploads.
  await page.waitForTimeout(2500);
  const result = await page.evaluate(async ({ sc, secs }) => {
    const g = window.__crawler;
    const r = g.renderer;
    r.info.autoReset = false;
    const start = sc === 'title' ? null : { x: g.player.pos.x, z: g.player.pos.z };
    const yaw0 = sc === 'title' ? 0 : g.player.yaw;
    const frames = [];
    const calls = [];
    const tris = [];
    const cpu = [];
    // Time the game's own rAF callback: everything the main thread does per
    // frame, and (where the driver offers timer queries) what the GPU spent on it.
    const gl = r.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const gpu = [];
    const pending = [];
    const collect = () => {
      while (pending.length > 0) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      const q = timer === null ? null : gl.createQuery();
      if (q !== null) gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
      const a = performance.now();
      cb(t);
      cpu.push(performance.now() - a);
      if (q !== null) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push(q); collect(); }
    });
    await new Promise((done) => {
      let t0 = -1;
      let prev = -1;
      const tick = (t) => {
        if (t0 < 0) t0 = t;
        const k = (t - t0) / (secs * 1000);
        if (start !== null) {
          g.invisT = 1e9;
          g.player.pos.x = start.x;
          g.player.pos.z = start.z;
          g.player.yaw = yaw0 + k * Math.PI * 2;
        }
        if (prev >= 0) {
          frames.push(t - prev);
          calls.push(r.info.render.calls);
          tris.push(r.info.render.triangles);
        }
        r.info.reset();
        prev = t;
        if (k < 1) raf(tick); else done();
      };
      raf(tick);
    });
    window.requestAnimationFrame = raf;
    const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    let meshes = 0;
    let shadowCasters = 0;
    g.scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) { meshes++; if (o.castShadow) shadowCasters++; }
    });
    const lights = [];
    g.scene.traverse((o) => { if (o.isLight && o.visible) lights.push(`${o.type}${o.castShadow ? '*' : ''}`); });
    return {
      frames: frames.length,
      fps: Math.round(1000 / mean(frames)),
      frameMs: { p50: +pct(frames, 0.5).toFixed(2), p95: +pct(frames, 0.95).toFixed(2), p99: +pct(frames, 0.99).toFixed(2) },
      cpuMs: { mean: +mean(cpu).toFixed(2), p95: +pct(cpu, 0.95).toFixed(2) },
      gpuMs: gpu.length === 0 ? null : { mean: +mean(gpu).toFixed(2), p95: +pct(gpu, 0.95).toFixed(2) },
      // Frames that would have missed a 60 Hz refresh even uncapped, and hitches.
      missed: +(100 * frames.filter((f) => f > 20).length / Math.max(1, frames.length)).toFixed(1),
      hitches: frames.filter((f) => f > 50).length,
      worstMs: +Math.max(...frames).toFixed(1),
      drawCalls: Math.round(mean(calls)),
      triangles: Math.round(mean(tris)),
      programs: r.info.programs?.length ?? null,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
      meshes,
      shadowCasters,
      lights: lights.join(' '),
    };
  }, { sc: scene, secs: seconds });
  await page.close();
  return { scene, quality, gl, errors: errors.slice(0, 3), ...result };
}

const results = [];
for (const scene of scenes) {
  for (const quality of qualities) {
    const r = await run(scene, quality);
    results.push(r);
    console.log(`${scene.padEnd(7)} ${quality.padEnd(6)} ${String(r.fps).padStart(4)} fps  p50 ${r.frameMs.p50}ms p95 ${r.frameMs.p95}ms p99 ${r.frameMs.p99}ms  cpu ${r.cpuMs.mean}ms  gpu ${r.gpuMs?.mean ?? '-'}ms  missed ${r.missed}% hitch ${r.hitches} worst ${r.worstMs}ms  calls ${r.drawCalls}  tris ${r.triangles}  meshes ${r.meshes}  progs ${r.programs}${r.errors.length > 0 ? `  ERR ${r.errors[0]}` : ''}`);
  }
}
console.log(`renderer: ${results[0]?.gl}`);
if (args.out !== undefined) await writeFile(args.out, JSON.stringify({ width, height, seconds, results }, null, 1));
await browser.close();
served?.server.close();
