import { expect, type Page, test } from '@playwright/test';
import type { Actor } from '../src/crawler/entities';
import type { Hazard, Projectile } from '../src/crawler/combat';

/**
 * The shipped path, played (Helldesk 0.2.0): one career's first week on the
 * served build, through the real entry point, the way a player plays it.
 *
 * The keyboard from the title into a new career and the whole induction;
 * a user fought (the wind-up seen, hits landed, resolved) and another talked
 * down with a biscuit; a ticket fixed at a terminal, the queue one shorter;
 * F5 and F9, a slot saved and loaded from pause; the floor-0 boss beaten,
 * the lift to Friday, the sauna and the drive back, Monday on floor 1; a
 * burnout and Clock back in; a quality change made in play and still there
 * after a reload. Each test builds its own career from the title, so each
 * stands alone.
 *
 * Every stage asserts what the player got - the screen, the HUD's words, the
 * queue, the floor, the save they load - not that a call returned. Real keys
 * and the real mouse wherever timing allows. The window's handles only put
 * the player somewhere (in front of the lift, the kiuas, a boss), turn them
 * to face somebody (the mouse's aim, which a headless runner cannot do), or
 * skip a long wait (the boss's first nine-tenths, a shift's worth of hits);
 * none of them resolves, fixes, saves or loads anything. The in-page
 * presses follow the combat spec, for the same reason: a key sent from the
 * runner arrives hundreds of milliseconds late on a software renderer, past
 * a quarter-second parry window.
 *
 * Under software rendering the game runs slower than the clock on the wall,
 * so every step waits on the game's own state.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';
const SLOT = 'workgrumble-helldesk-v3-';

// Whole careers under software rendering: floors built, a boss fought, a weekend driven.
test.describe.configure({ timeout: 600_000 });

interface Foe {
  pending: string | null;
  windup: number;
  stunned: number;
  resolved: boolean;
  calm: boolean;
  hp: number;
  dist: number;
}

interface Boss {
  name: string;
  hp: number;
  maxHp: number;
  active: boolean;
  resolved: boolean;
}

interface Induction {
  step: string;
  dummy: number;
  props: string[];
  terminal: boolean;
}

interface Save {
  name: string;
  floor: number;
  week: number;
  location: string;
  rep: number;
  sanity: number;
  energy: number;
  loyly: number;
  consumables: Record<string, number>;
  queue: { t: number; from: string; sla: number; gold: boolean }[];
  weekend: { saunas: number };
  stats: { resolvedField: number; resolvedPeace: number; resolvedDesk: number; bosses: number; burnouts: number };
}

interface Crawler {
  screen: string;
  time: number;
  attackCd: number;
  rootT: number;
  charging: boolean;
  blocking: boolean;
  actors: readonly Actor[];
  projectiles: readonly Projectile[];
  hazards: readonly Hazard[];
  boss: Actor | null;
  rmbT: number;
  chargeT: number;
  floorAwake: boolean;
  elevatorOpen: boolean;
  visionDue: boolean;
  vision: unknown;
  saunaT: number;
  input: { locked: boolean };
  player: { pos: { x: number; z: number } };
  level: { start: { x: number; z: number } };
  settings: { quality: string; inductionDone: boolean };
  renderer: { shadowMap: { enabled: boolean } };
  lights: { userData: { enabled?: boolean } }[];
  derivedCache: { maxSanity: number; maxLoyly: number; weapon: { range: number; arc?: number } };
  save: Save;
}

interface Handles {
  duel: (kind: string, dist: number) => number;
  calm: () => void;
  foe: (id: number) => Foe | null;
  fixesFor: (t: number) => readonly string[];
  induction: () => Induction | null;
  standBefore: (which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number) => boolean;
  standAt: (kind: string) => boolean;
  face: (id: number) => boolean;
  boss: () => Boss | null;
  toBoss: (dist: number) => boolean;
  weakenBoss: (hp: number) => boolean;
  wear: (left: number) => void;
}

interface FightFrame {
  time: number;
  screen: string;
  sanity: number;
  energy: number;
  id: number;
  hp: number | null;
  pending: string | null;
  windup: number;
  swings: number;
  hostiles: { id: number; kind: string; hp: number; dist: number; aggro: boolean; docile: boolean; pending: string | null }[];
  projectiles: { kind: string; owner: number | null; dist: number }[];
  hazards: { kind: string | null; dist: number; radius: number }[];
  queue: { t: number; sla: number; gold: boolean }[];
}

type W = Window & { __crawler: Crawler; __helldesk: Handles; __fightTrace?: FightFrame[] };

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const trace = await page.evaluate(() => (window as unknown as W).__fightTrace ?? []).catch(() => []);
  if (trace.length === 0) return;
  const record = `\nFight record: ${JSON.stringify(trace)}`;
  for (const error of info.errors) {
    error.message = (error.message ?? '') + record;
    if (error.stack !== undefined) error.stack += record;
  }
});

// ---------------------------------------------------------------- reading the game

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

async function save(page: Page): Promise<Save> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as W).__crawler.save)) as Save);
}

async function foe(page: Page, id: number): Promise<Foe | null> {
  return page.evaluate((i) => (window as unknown as W).__helldesk.foe(i), id);
}

async function boss(page: Page): Promise<Boss> {
  const b = await page.evaluate(() => (window as unknown as W).__helldesk.boss());
  if (b === null) throw new Error('no boss on this floor');
  return b;
}

async function step(page: Page): Promise<string> {
  return (await page.evaluate(() => (window as unknown as W).__helldesk.induction()))?.step ?? 'none';
}

// ---------------------------------------------------------------- doing things

/** A browser that has played before (cheap graphics, no tips), with or without an induction behind it, at the title. */
async function boot(page: Page, inducted: boolean): Promise<void> {
  // One fixed world for every run: the scenes staged in front of the player need open floor.
  await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
  await page.goto(HELLDESK);
  await page.evaluate(([key, done]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: done }));
  }, [SETTINGS_KEY, inducted] as const);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
}

/** New career with the mouse, the induction skipped, Morag's welcome answered: normal play on floor 0. */
async function skipToFloor(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New career' }).click();
  await page.getByLabel('Name on the badge').fill(name);
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  await settle(page);
  expect((await save(page)).floor).toBe(0);
}

/**
 * Back to play: anything ringing meanwhile (a staffing call, Derek's
 * Friday review) is answered with its highlighted line, the one Enter
 * would pick, until the floor is the player's again.
 */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => {
    const s = await screen(page);
    if (s === 'dialogue') await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    return s;
  }, { timeout: 120_000, intervals: [400] }).toBe('play');
}

/**
 * The mouse captured, over the real canvas. Headless browsers do not
 * reliably grant pointer lock, so the test says the mouse is captured (the
 * buttons and the HUD's E prompt only answer then) and uses the real mouse.
 */
async function capture(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
  const box = await page.locator('canvas.game-canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** Stand in front of the first unused one of `kind`, with E's prompt on it. */
async function standAt(page: Page, kind: string, prompt: string | RegExp): Promise<void> {
  await settle(page);
  await capture(page);
  expect(await page.evaluate((k) => (window as unknown as W).__helldesk.standAt(k), kind)).toBe(true);
  await expect(page.locator('.hud-prompt')).toContainText(prompt);
}

/** E (the real key) until the screen leaves play for `to`; a call that rang in between is answered first. */
async function pressE(page: Page, to: string): Promise<void> {
  await expect.poll(async () => {
    const s = await screen(page);
    if (s === 'play') await page.keyboard.press('e');
    return s;
  }, { timeout: 60_000, intervals: [600] }).toBe(to);
}

/** One swing of the real left button, over the canvas. */
async function swing(page: Page): Promise<void> {
  await page.mouse.down();
  await page.mouse.up();
}

/** Read the tell, guard it, then walk up and swing in the opening, all on the game's frames. */
async function fight(page: Page, kind: 'user' | 'boss'): Promise<{ id: number; whole: number; windup: boolean; hit: boolean }> {
  return page.evaluate((k) => new Promise((done, reject) => {
    const w = window as unknown as W;
    const g = w.__crawler;
    const h = w.__helldesk;
    const canvas = document.querySelector('canvas.game-canvas');
    if (canvas === null) { reject(new Error('no canvas')); return; }
    // Return to the lift before staging the user. Existing
    // projectiles survive stageDuel; SLA breaches can bring new managers.
    const placed = k === 'user' ? h.standAt('elevator') : h.toBoss(1.8);
    if (!placed) { reject(new Error('no place to fight')); return; }
    g.input.locked = true;
    const id = k === 'user' ? h.duel('user', 1.9) : g.boss?.id ?? -1;
    if (id <= 0 || (k === 'boss' && !h.weakenBoss(40))) { reject(new Error('no foe')); return; }
    const whole = h.foe(id)?.hp ?? 0;
    const started = performance.now();
    const gameStart = g.time;
    const trace: FightFrame[] = [];
    w.__fightTrace = trace;
    let windup = false;
    let hit = false;
    let swings = 0;
    let attackHeld = false;
    let guardHeld = false;
    let moving = '';
    const key = (code: string, down: boolean): void => {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    };
    const move = (code: string): void => {
      if (code === moving) return;
      if (moving !== '') key(moving, false);
      moving = code;
      if (code !== '') key(code, true);
    };
    const mouse = (button: number, down: boolean): void => {
      if (down) canvas.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
      else window.dispatchEvent(new MouseEvent('mouseup', { button }));
    };
    const watch = (): void => {
      const f = h.foe(id);
      const dist = (p: { x: number; z: number }): number => Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z);
      trace.push({
        time: g.time - gameStart, screen: g.screen, sanity: g.save.sanity, energy: g.save.energy, id,
        hp: f?.hp ?? null, pending: f?.pending ?? null, windup: f?.windup ?? 0, swings,
        hostiles: g.actors.filter((a) => a.id !== id && a.hostile && !a.resolved && dist(a.pos) <= 12).map((a) => ({
          id: a.id, kind: a.kind, hp: a.hp, dist: dist(a.pos), aggro: a.aggro, docile: a.docile, pending: a.pending,
        })),
        projectiles: g.projectiles.filter((p) => p.hostile && dist(p.mesh.position) <= 12).map((p) => ({ kind: p.kind, owner: p.owner?.id ?? null, dist: dist(p.mesh.position) })),
        hazards: g.hazards.filter((p) => dist(p) <= 12).map((p) => ({ kind: p.kind, dist: dist(p), radius: p.radius })),
        queue: g.save.queue.map((q) => ({ t: q.t, sla: q.sla, gold: q.gold })),
      });
      hit ||= f !== null && f.hp < whole;
      windup ||= f !== null && f.pending !== null && f.windup > 0;
      if (f === null || f.resolved || g.screen === 'dead' || g.time - gameStart > 90 || performance.now() - started > 180_000) {
        move('');
        mouse(0, false);
        mouse(2, false);
        done({ id, whole, windup, hit });
        return;
      }
      if (g.screen !== 'play') {
        move('');
        mouse(0, false);
        mouse(2, false);
        attackHeld = guardHeld = false;
        // The highlighted answer is the same one settle/Enter chooses.
        if (g.screen === 'dialogue') document.querySelector<HTMLButtonElement>('.dlg-opt.is-sel')?.click();
        requestAnimationFrame(watch);
        return;
      }
      g.input.locked = true;
      const telling = g.actors.filter((a) => a.hostile && !a.resolved && a.pending !== null && dist(a.pos) <= 12)
        .sort((a, b) => a.windup - b.windup)[0];
      const flying = g.projectiles.filter((p) => p.hostile && dist(p.mesh.position) < 4)
        .sort((a, b) => dist(a.mesh.position) - dist(b.mesh.position))[0];
      const charging = k === 'boss' && (g.boss?.charging ?? 0) > 0;
      const incoming = telling !== undefined || flying !== undefined || charging;
      h.face(telling?.id ?? flying?.owner?.id ?? id);
      // Let the user's first wind-up be seen before answering it. Guard
      // Derek's slam and keep it up until his invitations have passed.
      if (incoming || !windup) {
        move(f.pending === 'boss.charge' || charging ? 'KeyD' : '');
        if (attackHeld) { mouse(0, false); attackHeld = false; }
        if (!guardHeld) { mouse(2, true); guardHeld = true; }
      } else if (guardHeld) {
        move('');
        // A short RMB release shoves. Wait until this is a held guard.
        if (g.rmbT > 0.3) { mouse(2, false); guardHeld = false; }
      } else {
        h.face(id);
        const target = g.actors.find((a) => a.id === id);
        // A stapler's arc can hit several people. Walk around a calm
        // bystander rather than waking them with the user's swing.
        const crowded = k === 'user' && target !== undefined && g.actors.some((a) => {
          if (a.id === id || !a.hostile || a.resolved || a.aggro || dist(a.pos) > g.derivedCache.weapon.range + a.radius) return false;
          const dx = target.pos.x - g.player.pos.x;
          const dz = target.pos.z - g.player.pos.z;
          const ax = a.pos.x - g.player.pos.x;
          const az = a.pos.z - g.player.pos.z;
          const arc = (g.derivedCache.weapon.arc ?? 1) / 2 + 0.25;
          return dist(a.pos) <= 0.8 || (dx * ax + dz * az) / Math.max(0.0001, f.dist * dist(a.pos)) > Math.cos(arc);
        });
        move(crowded ? 'KeyD' : f.dist > 1.7 ? 'KeyW' : '');
        if (crowded && attackHeld) {
          mouse(2, true);
          guardHeld = true;
          mouse(0, false);
          attackHeld = false;
        } else if (attackHeld && g.charging) {
          mouse(0, false);
          attackHeld = false;
        } else if (!crowded && !attackHeld && !g.charging && !g.blocking && g.rootT <= 0 && g.attackCd <= 0 && f.dist <= 2.1 && swings < (k === 'user' ? 20 : 40)) {
          mouse(0, true);
          attackHeld = true;
          swings++;
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), kind);
}

/** A user from the floor, calm, in front of you, talked down with a chocolate digestive (E, and the line). */
async function talkDown(page: Page): Promise<void> {
  await settle(page);
  await capture(page);
  const before = await save(page);
  const id = await page.evaluate(() => (window as unknown as W).__helldesk.duel('user', 1.6));
  expect(id).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as W).__helldesk.calm());
  await expect(page.locator('.hud-prompt')).toContainText('talk them down');
  await pressE(page, 'dialogue');
  const biscuit = page.locator('.dlg-opt', { hasText: 'chocolate digestive' });
  await expect(biscuit).toBeVisible();
  await biscuit.click();
  await expect(page.locator('.dlg-text')).toContainText('GOOD ones');
  await page.locator('.dlg-opt').first().click();
  await settle(page);
  // Resolved with words: walked off calm, one biscuit lighter, counted as talked down.
  const f = await foe(page, id);
  if (f !== null) expect(f).toMatchObject({ resolved: true, calm: true });
  const after = await save(page);
  expect(after.stats.resolvedPeace).toBe(before.stats.resolvedPeace + 1);
  expect(after.consumables.biscuits ?? 0).toBe((before.consumables.biscuits ?? 0) - 1);
}

/** Pause with Esc, wait out the quarter second in which the menu ignores Esc. */
async function pause(page: Page): Promise<void> {
  await settle(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('paused');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
}

/** Where the player stands, and how far that is from the floor's start (where every load puts you). */
async function whereAmI(page: Page): Promise<{ x: number; z: number; fromStart: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    const p = g.player.pos;
    return { x: p.x, z: p.z, fromStart: Math.hypot(p.x - g.level.start.x, p.z - g.level.start.z) };
  });
}

// ---------------------------------------------------------------- the induction, played

/** Keep doing `act` until the induction leaves `from` (a press can land on a frame that swallows it). */
async function until(page: Page, from: string, act: () => Promise<void>, tries = 6): Promise<void> {
  for (let i = 0; i < tries && (await step(page)) === from; i++) {
    await act();
    await expect.poll(() => step(page), { timeout: 8_000 }).not.toBe(from).catch(() => undefined);
  }
  expect(await step(page)).not.toBe(from);
}

async function onStep(page: Page, s: string): Promise<void> {
  await expect.poll(() => step(page), { timeout: 60_000 }).toBe(s);
  await expect(page.getByTestId('induction-card')).toHaveAttribute('data-step', s);
}

async function standBefore(page: Page, which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number): Promise<void> {
  expect(await page.evaluate(([w, d]) => (window as unknown as W).__helldesk.standBefore(w, d), [which, dist] as const)).toBe(true);
}

/** The guard raised from inside the page on the frame the dummy's wind-up reaches `left` seconds to go, and let down after the strike. */
async function guard(page: Page, id: number, left: number): Promise<void> {
  await page.evaluate(([i, l]) => new Promise<void>((done) => {
    const w = window as unknown as W;
    const canvas = document.querySelector('canvas.game-canvas');
    const watch = (): void => {
      const f = w.__helldesk.foe(i);
      if (f !== null && f.pending !== null && f.windup <= l) {
        canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
        done();
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), [id, left] as const);
  await page.waitForFunction((i) => (window as unknown as W).__helldesk.foe(i)?.pending === null, id, { polling: 'raf', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as W).__crawler.rmbT > 0.3, null, { polling: 'raf', timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })));
}

/** The whole first morning, card by card, each step done with the game's own input (the induction spec has the detail). */
async function playInduction(page: Page): Promise<void> {
  await onStep(page, 'look');
  await capture(page);
  await until(page, 'look', () => page.evaluate(() => new Promise<void>((done) => {
    let n = 0;
    const tick = (): void => {
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: n % 2 === 0 ? 8 : -8 }));
      if (++n >= 30) {
        done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })));

  await onStep(page, 'walk');
  await standBefore(page, 'morag', 4.5);
  await page.keyboard.down('w');
  await expect.poll(() => step(page), { timeout: 60_000 }).not.toBe('walk');
  await page.keyboard.up('w');

  await onStep(page, 'talk');
  await standBefore(page, 'colleague', 1.8);
  await expect(page.locator('.hud-prompt')).toContainText('Sam from Sales');
  await page.keyboard.press('e');
  await page.locator('.dlg-opt').first().click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page)).toBe('play');

  await onStep(page, 'swing');
  await capture(page);
  await standBefore(page, 'dummy', 1.5);
  await until(page, 'swing', () => page.evaluate(() => {
    document.querySelector('canvas.game-canvas')?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  }));

  await onStep(page, 'heavy');
  await until(page, 'heavy', async () => {
    await page.mouse.down();
    await page.waitForFunction(() => (window as unknown as W).__crawler.chargeT > 0.9, null, { polling: 'raf', timeout: 60_000 });
    await page.mouse.up();
  });

  await onStep(page, 'label');
  await page.keyboard.press('2');
  await standBefore(page, 'dummy', 2.5);
  await until(page, 'label', () => swing(page));
  await page.keyboard.press('1');

  await onStep(page, 'block');
  await standBefore(page, 'dummy', 1.6);
  const dummy = (await page.evaluate(() => (window as unknown as W).__helldesk.induction()))?.dummy ?? -1;
  expect(dummy).toBeGreaterThan(0);
  for (let go = 0; go < 6 && (await step(page)) === 'block'; go++) await guard(page, dummy, 99);
  await onStep(page, 'parry');
  for (let go = 0; go < 6 && (await step(page)) === 'parry'; go++) await guard(page, dummy, 0.2);

  await onStep(page, 'ticket');
  await standBefore(page, 'terminal', 1.4);
  await expect(page.locator('.hud-prompt')).toContainText('Log on');
  await page.keyboard.press('e');
  await expect.poll(() => screen(page)).toBe('os');
  await page.locator('.os-fix.os-hint').click();
  await expect.poll(() => step(page)).toBe('map');
  await page.getByRole('button', { name: /Log off/ }).click();
  await expect.poll(() => screen(page)).toBe('play');

  await onStep(page, 'map');
  await page.keyboard.press('m');
  await expect(page.locator('.dlg-opt').first()).toBeVisible({ timeout: 60_000 });
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => step(page)).toBe('none');
}

// ---------------------------------------------------------------- the career

test('first day: the keyboard from the title, the induction, a fight, a talk-down and a ticket fixed', async ({ page }) => {
  await boot(page, false);

  // The title by keyboard: New career is the default (nothing saved yet).
  await expect(page.getByRole('button', { name: 'New career' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name on the badge')).toBeFocused();
  await page.keyboard.type('Pat Playthrough');
  // Never done an induction: it is on.
  await expect(page.getByLabel('Skip the induction')).not.toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dlg-opt.is-sel')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  expect((await save(page)).name).toBe('Pat Playthrough');

  // The morning: the floor asleep until it is done, then normal play on floor 0.
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(false);
  await playInduction(page);
  await expect(page.getByTestId('induction-card')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.inductionDone)).toBe(true);
  for (const label of ['SANITY', 'REP', 'PROMILLE', 'CAFFEINE']) await expect(page.locator('.hud-bar')).toContainText(label);
  expect((await save(page)).floor).toBe(0);

  // A fight: a user squares up, winds up (the swing is announced), and the stapler answers.
  await settle(page);
  await capture(page);
  const before = await save(page);
  const { id, whole, windup, hit } = await fight(page, 'user');
  expect(id).toBeGreaterThan(0);
  expect(whole).toBeGreaterThan(0);
  expect(windup).toBe(true);
  expect(hit).toBe(true);
  expect(await screen(page)).toBe('play');
  await expect.poll(async () => {
    const f = await foe(page, id);
    return f === null || f.resolved;
  }).toBe(true);
  let after = await save(page);
  // Resolved in person: counted, and paid.
  expect(after.stats.resolvedField).toBe(before.stats.resolvedField + 1);
  expect(after.rep).toBeGreaterThan(before.rep);
  // And the status bar shows what the career holds (polled together: a pickup can add to it any frame).
  await expect.poll(async () => (await page.locator('.hud-rep').textContent()) === `₡${(await save(page)).rep}`).toBe(true);

  // Another one, talked down instead.
  await talkDown(page);

  // A ticket fixed at a terminal (WorkgrumbleOS): the queue one shorter.
  await standAt(page, 'terminal', 'Log on');
  await pressE(page, 'os');
  if ((await save(page)).queue.length === 0) await page.getByRole('button', { name: /Pick up new tickets/ }).click();
  await expect.poll(async () => (await save(page)).queue.length).toBeGreaterThan(0);
  const rows = page.locator('.os-row');
  await rows.first().click();
  const desk = await save(page);
  const first = desk.queue[0];
  if (first === undefined) throw new Error('no ticket');
  // The fix a player who knew the answer would pick (the bot reads the same list).
  const fixes = await page.evaluate((t) => (window as unknown as W).__helldesk.fixesFor(t), first.t);
  const labels = await page.locator('.os-fix').allTextContents();
  const right = labels.findIndex((l) => fixes.includes(l.replace(/^\S+\s/, '')));
  expect(right).toBeGreaterThanOrEqual(0);
  await page.locator('.os-fix').nth(right).click();
  await expect(page.locator('.os-feedback')).toContainText('Resolved');
  after = await save(page);
  expect(after.queue).toHaveLength(desk.queue.length - 1);
  expect(after.queue.map((q) => q.from)).not.toContain(first.from);
  expect(after.stats.resolvedDesk).toBe(desk.stats.resolvedDesk + 1);
  expect(after.rep).toBeGreaterThan(desk.rep);
  await expect(rows).toHaveCount(after.queue.length);
  await page.getByRole('button', { name: /Log off/ }).click();
  await expect.poll(() => screen(page)).toBe('play');
  // Back on the floor, the status bar's queue says the same.
  await expect.poll(async () => (await page.locator('.hud-rep + .hud-small').textContent())?.startsWith(`Queue: ${(await save(page)).queue.length} `) ?? false).toBe(true);
});

test('saves: F5 and F9 put the career back as it was; a slot saved from pause loads from pause', async ({ page }) => {
  await boot(page, true);
  await skipToFloor(page, 'Sam Saves');

  // Walk a little into the floor, then F5.
  await capture(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await whereAmI(page)).fromStart, { timeout: 30_000 }).toBeGreaterThan(1);
  await page.keyboard.up('w');
  const quick = await save(page);
  await page.keyboard.press('F5');
  await expect(page.locator('.hud-toasts')).toContainText('Quicksaved');
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, `${SLOT}quick`)).toBe(true);

  // Then things happen: somebody talked down (a biscuit gone), and a walk elsewhere.
  await talkDown(page);
  expect((await save(page)).stats.resolvedPeace).toBe(quick.stats.resolvedPeace + 1);

  // F9: the career as it was at F5.
  await page.keyboard.press('F9');
  await expect(page.locator('.hud-toasts')).toContainText('Loaded: Sam Saves', { timeout: 120_000 });
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  let now = await save(page);
  expect(now.stats.resolvedPeace).toBe(quick.stats.resolvedPeace);
  expect(now.consumables.biscuits).toBe(quick.consumables.biscuits);
  expect(now.rep).toBe(quick.rep);
  expect(now.floor).toBe(0);
  // Position: a save keeps no position, so every load (F9 included) stands
  // the player at the floor's start, the lift lobby - not where F5 was pressed.
  expect((await whereAmI(page)).fromStart).toBeLessThan(0.5);

  // A slot: talk one down (biscuit gone), save to Slot 1 from pause.
  await talkDown(page);
  const slotted = await save(page);
  await pause(page);
  await page.getByRole('button', { name: 'Save game' }).click();
  await expect(page.locator('.title-logo')).toHaveText('SAVE');
  await page.getByRole('button', { name: /^Slot 1: \(empty\)/ }).click();
  await expect(page.locator('.title-logo')).toHaveText('PAUSED');
  await expect(page.locator('.hud-toasts')).toContainText('Saved to Slot 1');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => screen(page)).toBe('play');

  // More happens: the last biscuit.
  await talkDown(page);
  expect((await save(page)).consumables.biscuits ?? 0).toBe((slotted.consumables.biscuits ?? 0) - 1);

  // Load from pause: Slot 1, and the career is as it was saved there (not the quicksave).
  await pause(page);
  await page.getByRole('button', { name: 'Load game' }).click();
  await expect(page.locator('.title-logo')).toHaveText('LOAD');
  await page.getByRole('button', { name: /^Slot 1: Sam Saves/ }).click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  now = await save(page);
  expect(now.stats.resolvedPeace).toBe(slotted.stats.resolvedPeace);
  expect(now.consumables.biscuits).toBe(slotted.consumables.biscuits);
  expect(now.rep).toBe(slotted.rep);
  expect(now.stats.resolvedPeace).toBe(quick.stats.resolvedPeace + 1);
});

test('the week: the boss of floor 0, the lift to Friday, the sauna and the drive back, Monday on floor 1', async ({ page }) => {
  await boot(page, true);
  await skipToFloor(page, 'Fran Friday');
  const monday = await save(page);
  expect(monday.week).toBe(1);

  // The lift will not go while the major incident stands.
  const derek = await boss(page);
  expect(derek).toMatchObject({ name: 'Derek', resolved: false });
  await standAt(page, 'elevator', 'Lift locked');
  await page.keyboard.press('e');
  await expect(page.locator('.hud-toasts')).toContainText('The lift is locked while Derek is unresolved');
  expect(await screen(page)).toBe('play');

  // The fight, in the corner office. Most of it is skipped (the boss starts
  // at a sliver of health); the hits that resolve Derek are the player's.
  const fought = await fight(page, 'boss');
  expect(fought.whole).toBe(40);
  expect(fought.windup).toBe(true);
  expect(fought.hit).toBe(true);
  expect(await screen(page)).toBe('play');
  const done = await boss(page);
  expect(done.resolved).toBe(true);
  // It was a fight: Derek knew about it (the title card, the music).
  expect(done.active).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.elevatorOpen)).toBe(true);
  expect((await save(page)).stats.bosses).toBe(monday.stats.bosses + 1);

  // The lift: Friday, and the drive up to the mökki.
  const friday = await save(page);
  await standAt(page, 'elevator', 'Take the lift');
  await pressE(page, 'transition');
  await expect(page.locator('.lift-name')).toContainText('Friday 17:00');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => (await save(page)).location, { timeout: 120_000 }).toBe('mokki');
  // Derek's Friday phone call, answered; then the plot is yours.
  await settle(page);
  const weekend = await save(page);
  // Payday: the week's salary is in.
  expect(weekend.rep).toBeGreaterThan(friday.rep);
  await expect(page.locator('.hud-floor')).toContainText('The Mökki - weekend 1');

  // The sauna.
  await standAt(page, 'kiuas', 'Throw löyly');
  await expect.poll(async () => {
    const n = (await save(page)).weekend.saunas;
    if (n === 0 && (await screen(page)) === 'play') await page.keyboard.press('e');
    return n;
  }, { timeout: 60_000, intervals: [600] }).toBe(1);
  const steamed = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { saunaT: g.saunaT, loyly: g.save.loyly, max: g.derivedCache.maxLoyly, under: g.visionDue || g.vision !== null };
  });
  expect(steamed.saunaT).toBeGreaterThan(0);
  expect(steamed.loyly).toBe(steamed.max);
  // A full meter spilling over takes you under the steam for thirty seconds
  // (SUO, its own spec): standing still, it runs out and the mökki is back.
  if (steamed.under) {
    await expect.poll(() => page.evaluate(() => {
      const g = (window as unknown as W).__crawler;
      return g.visionDue || g.vision !== null;
    }), { timeout: 240_000, intervals: [1_000] }).toBe(false);
  }

  // Sunday evening: the car, and the drive back.
  await standAt(page, 'car', 'Drive back to work');
  await pressE(page, 'dialogue');
  await page.locator('.dlg-opt', { hasText: 'Drive back to work.' }).click();
  await expect.poll(() => screen(page)).toBe('transition');
  await expect(page.locator('.lift .title-blurb')).toContainText('Monday');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => (await save(page)).floor, { timeout: 120_000 }).toBe(1);
  await settle(page);
  const floor1 = await save(page);
  expect(floor1).toMatchObject({ floor: 1, location: 'office', week: 2 });
  await expect(page.locator('.hud-floor')).toContainText('Floor 1');
  // A new floor, a new major incident, and the lift locked again.
  expect(await boss(page)).toMatchObject({ name: 'Karen', resolved: false });
  expect(await page.evaluate(() => (window as unknown as W).__crawler.elevatorOpen)).toBe(false);
});

test('a burnout and Clock back in; a quality change made in play is kept', async ({ page }) => {
  await boot(page, true);
  await skipToFloor(page, 'Bo Burnout');
  const before = await save(page);
  expect(before.stats.burnouts).toBe(0);

  // A long shift (its hits skipped), and one more swing from a user taken standing still.
  await capture(page);
  const id = await page.evaluate(() => (window as unknown as W).__helldesk.duel('user', 1.9));
  expect(id).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as W).__helldesk.wear(1));
  // Standing still: the user's next swing is the one too many. (A call that rings meanwhile is answered.)
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'dialogue') await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    return now;
  }, { timeout: 120_000, intervals: [400] }).toBe('dead');
  await expect(page.locator('.title-logo')).toHaveText('BURNOUT');
  let s = await save(page);
  expect(s.stats.burnouts).toBe(1);
  expect(s.rep).toBeLessThan(before.rep);

  // Clock back in: the floor again, whole, the burnout on the record.
  await expect(page.getByRole('button', { name: /Clock back in/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  s = await save(page);
  expect(s.floor).toBe(0);
  expect(s.stats.burnouts).toBe(1);
  expect(s.sanity).toBe(await page.evaluate(() => (window as unknown as W).__crawler.derivedCache.maxSanity));
  expect((await whereAmI(page)).fromStart).toBeLessThan(0.5);
  await expect(page.locator('.hud-bar')).toContainText('SANITY');

  // Settings in play: pause, the Control Panel, Quality up to Medium.
  await pause(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect.poll(() => screen(page)).toBe('os');
  const quality = page.locator('select[data-setting="quality"]');
  await expect(quality).toHaveValue('low');
  await quality.selectOption('medium');
  // Applied at once: shadows on, five lights instead of three.
  const applied = (): Promise<{ quality: string; shadows: boolean; lights: number }> => page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { quality: g.settings.quality, shadows: g.renderer.shadowMap.enabled, lights: g.lights.filter((l) => l.userData.enabled !== false).length };
  });
  expect(await applied()).toEqual({ quality: 'medium', shadows: true, lights: 5 });
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).not.toBe('os');

  // Kept: in this browser's settings, and after a reload and Continue.
  expect(await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { quality?: string }).quality, SETTINGS_KEY)).toBe('medium');
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click({ timeout: 120_000 });
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  expect(await applied()).toEqual({ quality: 'medium', shadows: true, lights: 5 });
  expect((await save(page)).name).toBe('Bo Burnout');
});
