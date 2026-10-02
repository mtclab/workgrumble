import { expect, type Page, test } from '@playwright/test';

/**
 * The hub (docs/SPEC_HELLDESK_030_S1.md, S1a gates 8 to 10), on the served
 * build through the real entry point: a new career lands on its own office
 * floor; walking it for three minutes of game time takes no damage; a walk-up
 * ignored three times turns, announced, and the next one, talked to, is
 * resolved; and the lift goes up to the week's major incident and back, with
 * that floor kept as it was left.
 *
 * Real keys and the real mouse wherever timing allows (W to walk, E to talk
 * and to call the lift, clicks on the lift's buttons). The window's handles
 * only put the player somewhere (in front of the lift, or of somebody), turn
 * them, or skip a wait (the minute or two before somebody walks up, a boss's
 * first nine-tenths); none of them turns, resolves, fixes or saves anything.
 * Under software rendering the game runs slower than the clock on the wall,
 * so every step waits on the game's own state and time.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';

// Three minutes of game time under software rendering, and floors built three times.
test.describe.configure({ timeout: 900_000 });

interface HubDebug {
  clock: number;
  nextWalkUpIn: number | null;
  walker: number | null;
  reached: boolean;
  ignores: { id: number; n: number }[];
  hostile: { id: number; reason: string }[];
}

interface Person {
  id: number;
  name: string;
  kind: string;
  hostile: boolean;
  colleague: boolean;
  resolved: boolean;
  spawnIndex: number;
  bubble: unknown;
  pos: { x: number; z: number };
}

interface Level {
  w: number;
  h: number;
  floor: Uint8Array;
  solid: Uint8Array;
  start: { x: number; z: number };
  interactables: { id: number; kind: string; used: boolean }[];
}

interface Crawler {
  screen: string;
  time: number;
  attackCd: number;
  actors: readonly Person[];
  boss: { hp: number; resolved: boolean } | null;
  elevatorOpen: boolean;
  input: { locked: boolean };
  player: { pos: { x: number; z: number }; yaw: number };
  level: Level;
  hud: { toast: (text: string, kind?: string) => void };
  save: { location: string; floor: number; week: number; rep: number; sanity: number; floorState: { resolved: number[]; used: number[]; boss?: { hp: number } }; hub: { hostile: { spawnIndex: number; reason: string }[] } };
}

interface Handles {
  hub: () => HubDebug | null;
  hubWalkUpNow: () => void;
  standAt: (kind: string) => boolean;
  face: (id: number) => boolean;
  toPerson: (id: number, dist: number) => boolean;
  weakenBoss: (hp: number) => boolean;
}

interface Records {
  toasts: { text: string; t: number }[];
  hurts: { t: number; lost: number }[];
}

type W = Window & { __crawler: Crawler; __helldesk: Handles; __rec: Records };

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

async function hub(page: Page): Promise<HubDebug> {
  const d = await page.evaluate(() => (window as unknown as W).__helldesk.hub());
  if (d === null) throw new Error('not on the hub');
  return d;
}

async function where(page: Page): Promise<{ location: string; floor: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as W).__crawler.save;
    return { location: s.location, floor: s.floor };
  });
}

/** A browser that has played before, a new career with the induction skipped, Morag's welcome answered. */
async function newCareer(page: Page): Promise<void> {
  // One fixed world for every run: the same hub, the same floor upstairs.
  await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
  await page.goto(HELLDESK);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: true }));
  }, SETTINGS_KEY);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
  // What the player is told, with the game time it was said at, and every bit of Sanity lost in play, frame by frame.
  await page.evaluate(() => {
    const w = window as unknown as W;
    const g = w.__crawler;
    w.__rec = { toasts: [], hurts: [] };
    const toast = g.hud.toast.bind(g.hud);
    g.hud.toast = (text: string, kind?: string): void => {
      w.__rec.toasts.push({ text, t: g.time });
      toast(text, kind);
    };
    let career = g.save;
    let last = g.save.sanity;
    const watch = (): void => {
      // A new career is a new Sanity, not a hit.
      if (g.save !== career) {
        career = g.save;
        last = g.save.sanity;
      }
      if (g.screen === 'play' && g.save.sanity < last - 1e-6) w.__rec.hurts.push({ t: g.time, lost: last - g.save.sanity });
      last = g.save.sanity;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.getByRole('button', { name: 'New career' }).click();
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
}

/** Anything ringing (a staffing call, Derek's review) answered with its highlighted line, until the floor is the player's again. */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => {
    const s = await screen(page);
    if (s === 'dialogue') await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    return s;
  }, { timeout: 120_000, intervals: [400] }).toBe('play');
}

/** The mouse captured (headless runners do not reliably grant pointer lock). */
async function capture(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
  const box = await page.locator('canvas.game-canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** E (the real key) on the lift in front of you, and the button labelled `button`. */
async function takeLift(page: Page, button: string | RegExp, to: string): Promise<void> {
  await settle(page);
  await capture(page);
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.standAt('elevator'))).toBe(true);
  await expect(page.locator('.hud-prompt')).toContainText('Take the lift');
  await expect.poll(async () => {
    if ((await screen(page)) === 'play') await page.keyboard.press('e');
    return screen(page);
  }, { timeout: 60_000, intervals: [600] }).toBe('dialogue');
  await expect(page.locator('.dlg')).toContainText('The lift');
  await page.locator('.dlg-opt', { hasText: button }).click();
  await expect.poll(async () => (await where(page)).location, { timeout: 120_000 }).toBe(to);
  await settle(page);
}

/** The lift's buttons, as offered, without pressing any (Not yet. closes it). */
async function liftButtons(page: Page): Promise<string[]> {
  await settle(page);
  await capture(page);
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.standAt('elevator'))).toBe(true);
  await expect.poll(async () => {
    if ((await screen(page)) === 'play') await page.keyboard.press('e');
    return screen(page);
  }, { timeout: 60_000, intervals: [600] }).toBe('dialogue');
  const labels = (await page.locator('.dlg-opt').allTextContents()).map((l) => l.replace(/^\d+\.\s*/, '').trim());
  await page.locator('.dlg-opt', { hasText: 'Not yet.' }).click();
  await settle(page);
  return labels;
}

/**
 * Hold W (the real key) for `seconds` of game time, or until somebody starts
 * walking over with a problem: then you stop for them, as you would.
 */
async function walkFor(page: Page, seconds: number): Promise<void> {
  const t0 = await page.evaluate(() => (window as unknown as W).__crawler.time);
  await page.keyboard.down('w');
  await page.waitForFunction((end) => {
    const w = window as unknown as W;
    return w.__crawler.time >= end || (w.__helldesk.hub()?.walker ?? null) !== null;
  }, t0 + seconds, { polling: 'raf', timeout: 120_000 }).catch(() => undefined);
  await page.keyboard.up('w');
}

test('gate 8: a new career lands on the hub, and three minutes of walking it takes no damage', async ({ page }) => {
  await newCareer(page);
  expect(await where(page)).toEqual({ location: 'hub', floor: 0 });
  await expect(page.locator('.hud-floor')).toContainText('The hub');
  // Monday: the week's major incident, said and on the tracker.
  expect(await page.evaluate(() => (window as unknown as W).__rec.toasts.map((t) => t.text))).toContain('Monday. This week\'s major incident: Derek, floor B1.');
  await expect(page.locator('.hud-quests')).toContainText('MAJOR INCIDENT: Derek');
  const hostileOnArrival = await page.evaluate(() => (window as unknown as W).__crawler.actors.filter((a) => a.hostile && !a.resolved).length);
  expect(hostileOnArrival).toBe(0);

  await capture(page);
  const t0 = await page.evaluate(() => (window as unknown as W).__crawler.time);
  let answered = 0;
  // Walk the floor: W held, a turn now and then (the mouse, through the game's own handler), and
  // whoever walks up with a problem is talked to, as anyone walking the office would.
  for (let leg = 0; (await page.evaluate(() => (window as unknown as W).__crawler.time)) - t0 < 180; leg++) {
    if ((await screen(page)) === 'dialogue') {
      await page.locator('.dlg-opt').first().click();
      await settle(page);
      await capture(page);
    }
    const d = await hub(page);
    if (d.walker !== null && !d.reached) {
      // Somebody is on their way over: wait for them.
      const now = await page.evaluate(() => (window as unknown as W).__crawler.time);
      await page.waitForFunction((t) => (window as unknown as W).__crawler.time >= t + 1, now, { polling: 'raf', timeout: 60_000 }).catch(() => undefined);
      continue;
    }
    if (d.walker !== null && d.reached) {
      expect(await page.evaluate((id) => (window as unknown as W).__helldesk.face(id), d.walker)).toBe(true);
      await page.keyboard.press('e');
      await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('dialogue');
      await page.locator('.dlg-opt', { hasText: 'Walk them through it' }).click();
      await page.locator('.dlg-opt').first().click();
      await settle(page);
      await capture(page);
      answered++;
      continue;
    }
    await page.evaluate((n) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: n % 3 === 0 ? 420 : 160, movementY: 0 })), leg);
    await walkFor(page, 4);
  }
  const rec = await page.evaluate(() => (window as unknown as W).__rec);
  expect(rec.hurts, 'three minutes of walking the hub: no damage').toEqual([]);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.actors.filter((a) => a.hostile && !a.resolved).length), 'nobody turned').toBe(0);
  expect((await hub(page)).clock).toBeGreaterThanOrEqual(180);
  test.info().annotations.push({ type: 'walk-ups answered', description: String(answered) });
});

test('gate 9: a walk-up ignored three times turns, with the bark first; the next one, talked to, is resolved', async ({ page }) => {
  await newCareer(page);
  await capture(page);
  await page.evaluate(() => (window as unknown as W).__helldesk.hubWalkUpNow());
  await expect.poll(async () => (await hub(page)).walker, { timeout: 60_000 }).not.toBeNull();
  const walker = (await hub(page)).walker ?? -1;

  const reached = async (): Promise<void> => {
    await expect.poll(async () => (await hub(page)).reached, { timeout: 120_000 }).toBe(true);
  };
  const ignores = async (): Promise<number> => (await hub(page)).ignores.find((x) => x.id === walker)?.n ?? 0;
  for (let n = 1; n <= 3; n++) {
    await reached();
    // Turn away from them, to whichever way is open furthest, and walk off (W, the real key) until it counts.
    await page.evaluate((id) => {
      const g = (window as unknown as W).__crawler;
      const a = g.actors.find((x) => x.id === id);
      const lv = g.level;
      const p = g.player.pos;
      let best = g.player.yaw;
      let bestScore = -Infinity;
      for (let k = 0; k < 16; k++) {
        const yaw = (k * Math.PI) / 8;
        // The player faces (-sin yaw, -cos yaw).
        let open = 0;
        for (let d = 0.5; d <= 10; d += 0.5) {
          const x = Math.floor((p.x - Math.sin(yaw) * d) / 2);
          const z = Math.floor((p.z - Math.cos(yaw) * d) / 2);
          if (x < 0 || z < 0 || x >= lv.w || z >= lv.h || lv.floor[z * lv.w + x] !== 1 || lv.solid[z * lv.w + x] === 1) break;
          open = d;
        }
        const away = a === undefined ? 0 : -((a.pos.x - p.x) * -Math.sin(yaw) + (a.pos.z - p.z) * -Math.cos(yaw));
        const score = open * 2 + away;
        if (open >= 5 && score > bestScore) {
          bestScore = score;
          best = yaw;
        }
      }
      g.player.yaw = best;
    }, walker);
    await page.keyboard.down('w');
    await expect.poll(ignores, { timeout: 60_000 }).toBe(n);
    await page.keyboard.up('w');
    if (n < 3) await expect.poll(() => page.evaluate(() => (window as unknown as W).__rec.toasts.at(-1)?.text ?? ''), { timeout: 10_000 }).toContain(`(${n}/3)`);
  }
  const turned = await page.evaluate((id) => {
    const w = window as unknown as W;
    const a = w.__crawler.actors.find((x) => x.id === id);
    const told = w.__rec.toasts.find((x) => x.text.includes('ignored three times'));
    return { hostile: a?.hostile ?? false, bark: a?.bubble !== null && a?.bubble !== undefined, told: told?.t ?? null, now: w.__crawler.time };
  }, walker);
  expect(turned.hostile, 'the third ignore turns them').toBe(true);
  expect(turned.told, 'announced').not.toBeNull();
  expect(turned.bark, 'with a bark').toBe(true);
  expect((await hub(page)).hostile.map((h) => h.reason)).toEqual(['ignored']);
  // Nobody hits within 1.5 s of turning (game time).
  await page.waitForFunction((t) => (window as unknown as W).__crawler.time >= t + 1.6, turned.told ?? 0, { polling: 'raf', timeout: 60_000 });
  const early = await page.evaluate((t) => (window as unknown as W).__rec.hurts.filter((h) => h.t <= t + 1.5).filter((h) => h.t >= t), turned.told ?? 0);
  expect(early, 'no hit inside the grace').toEqual([]);

  // Earned, so it lasts until they are resolved: talked down with a chocolate digestive, they are off the list.
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'play') {
      await page.evaluate((id) => (window as unknown as W).__helldesk.toPerson(id, 1.6), walker);
      await page.evaluate((id) => (window as unknown as W).__helldesk.face(id), walker);
      await page.keyboard.press('e');
    } else if (now === 'dialogue' && !((await page.locator('.dlg').textContent()) ?? '').includes('digestive')) {
      await page.locator('.dlg-opt.is-sel').first().click().catch(() => undefined);
    }
    return page.locator('.dlg-opt', { hasText: 'chocolate digestive' }).count();
  }, { timeout: 60_000, intervals: [600] }).toBeGreaterThan(0);
  await page.locator('.dlg-opt', { hasText: 'chocolate digestive' }).click();
  await page.locator('.dlg-opt').first().click();
  await settle(page);
  expect((await hub(page)).hostile, 'resolved: nobody after you').toEqual([]);

  // The next one, talked to (E, and the line): resolved, a little Rep, and they go back to their desk.
  await page.evaluate(() => (window as unknown as W).__helldesk.hubWalkUpNow());
  await expect.poll(async () => {
    const w = (await hub(page)).walker;
    return w !== null && w !== walker;
  }, { timeout: 60_000 }).toBe(true);
  const next = (await hub(page)).walker ?? -1;
  await expect.poll(async () => (await hub(page)).reached, { timeout: 120_000 }).toBe(true);
  const rep = await page.evaluate(() => (window as unknown as W).__crawler.save.rep);
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'play') {
      await page.evaluate((id) => (window as unknown as W).__helldesk.face(id), next);
      await page.keyboard.press('e');
    } else if (now === 'dialogue' && !((await page.locator('.dlg').textContent()) ?? '').includes('A walk-up')) {
      // Something else rang first (a staffing call): answered, then back to them.
      await page.locator('.dlg-opt.is-sel').first().click().catch(() => undefined);
    }
    return page.locator('.dlg').textContent();
  }, { timeout: 60_000, intervals: [600] }).toContain('A walk-up');
  await page.locator('.dlg-opt', { hasText: 'Walk them through it' }).click();
  await page.locator('.dlg-opt').first().click();
  await settle(page);
  expect((await hub(page)).walker, 'resolved').toBeNull();
  const after = await page.evaluate((id) => {
    const g = (window as unknown as W).__crawler;
    return { hostile: g.actors.find((x) => x.id === id)?.hostile ?? null, rep: g.save.rep };
  }, next);
  expect(after.hostile).toBe(false);
  expect(after.rep).toBeGreaterThan(rep);
});

test('gate 10: the lift up to the major incident, a fight there, back down to the hub, and up again: the floor as it was left', async ({ page }) => {
  await newCareer(page);
  // On the hub: up, and no Friday yet.
  expect(await liftButtons(page)).toEqual(['Floor B1: the major incident', 'Not yet.']);
  await takeLift(page, 'Floor B1: the major incident', 'office');
  expect((await where(page)).floor).toBe(0);
  await expect(page.locator('.hud-floor')).toContainText('Floor B1');
  // Upstairs the lift goes back down, and Friday waits for the boss.
  expect(await liftButtons(page)).toEqual(['Back to the hub', 'Not yet.']);

  // A fight with one of the floor's own people: the real left button, from inside the page, on the game's frames.
  await capture(page);
  const target = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    const p = g.player.pos;
    const near = g.actors.filter((a) => a.hostile && !a.resolved && a.kind === 'user' && a.spawnIndex >= 0)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
    for (const a of near) if ((window as unknown as W).__helldesk.toPerson(a.id, 1.6)) return { id: a.id, spawnIndex: a.spawnIndex };
    return null;
  });
  if (target === null) throw new Error('nobody to fight');
  const won = await page.evaluate((id) => new Promise<boolean>((done) => {
    const w = window as unknown as W;
    const g = w.__crawler;
    const canvas = document.querySelector('canvas.game-canvas');
    const t0 = g.time;
    let held = false;
    const tick = (): void => {
      const a = g.actors.find((x) => x.id === id);
      if (a === undefined || a.resolved || g.time - t0 > 90) {
        if (held) window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        done(a === undefined || a.resolved);
        return;
      }
      if (g.screen === 'dialogue') document.querySelector<HTMLButtonElement>('.dlg-opt.is-sel')?.click();
      g.input.locked = true;
      w.__helldesk.face(id);
      const d = Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z);
      if (d > 2.2) w.__helldesk.toPerson(id, 1.6);
      if (held) {
        window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        held = false;
      } else if (g.attackCd <= 0) {
        canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        held = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), target.id);
  expect(won, 'the fight is won').toBe(true);
  await settle(page);
  // And the boss, some way into its fight (its first nine-tenths skipped).
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.weakenBoss(60))).toBe(true);
  const left = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { boss: g.boss?.hp ?? -1, resolved: [...g.save.floorState.resolved], used: [...g.save.floorState.used] };
  });
  expect(left.resolved).toContain(target.spawnIndex);

  await takeLift(page, 'Back to the hub', 'hub');
  await expect(page.locator('.hud-floor')).toContainText('The hub');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.actors.some((a) => a.hostile && !a.resolved)), 'the hub is calm').toBe(false);

  await takeLift(page, 'Floor B1: the major incident', 'office');
  const back = await page.evaluate((idx) => {
    const g = (window as unknown as W).__crawler;
    return {
      boss: g.boss?.hp ?? -1,
      resolved: [...g.save.floorState.resolved],
      used: [...g.save.floorState.used],
      gone: !g.actors.some((a) => a.spawnIndex === idx && !a.resolved),
    };
  }, target.spawnIndex);
  expect(back.boss, 'the boss as it was left').toBe(left.boss);
  expect(back.resolved).toEqual(left.resolved);
  expect(back.used).toEqual(left.used);
  expect(back.gone, 'whoever was resolved stays resolved').toBe(true);
});
