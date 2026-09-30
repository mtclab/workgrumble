import { expect, type Page, test } from '@playwright/test';

/**
 * Combat you can read (docs/SPEC_COMBAT_READ.md), on the served build.
 *
 * Every hit on the player is announced before it lands: an enemy winds up,
 * and the damage is decided when the strike comes, from where the player is
 * then. So a player who sees the wind-up and strafes out is not hurt, and
 * one who stands still is (the control). Raising the block as the strike
 * comes is a parry: PARRY, and the attacker staggered. A block held up long
 * before is only a block.
 *
 * These drive the real page with real keys and the real mouse: D to strafe,
 * the right button to block. Under software rendering the game runs slower
 * than the clock on the wall, so every step waits on the game's own state,
 * never on a fixed number of milliseconds.
 */

const HELLDESK = '/crawler';

// A career start under software rendering takes a while, and each fight waits on game time.
test.describe.configure({ timeout: 180_000 });

interface Foe {
  pending: string | null;
  windup: number;
  stunned: number;
  resolved: boolean;
}

interface Crawler {
  screen: string;
  rmbT: number;
  charging: boolean;
  chargeT: number;
  attackCd: number;
  player: { swing: number };
  blocking: boolean;
  input: { locked: boolean };
  save: { sanity: number; energy: number; flags: Record<string, unknown> };
}

interface Handles {
  duel: (kind: string, dist: number) => number;
  foe: (id: number) => Foe | null;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

async function startCareer(page: Page): Promise<void> {
  await page.goto(HELLDESK);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('workgrumble-helldesk-settings', JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'New career' }).click();
  // Straight to the floor: the induction has a spec of its own (helldesk-induction).
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('play');
}

/** A user from Sales squares up 1.9 m in front of you, with room to your right. */
async function duel(page: Page): Promise<number> {
  const id = await page.evaluate(() => (window as unknown as W).__helldesk.duel('user', 1.9));
  expect(id).toBeGreaterThan(0);
  return id;
}

async function foe(page: Page, id: number): Promise<Foe> {
  const f = await page.evaluate((i) => (window as unknown as W).__helldesk.foe(i), id);
  if (f === null) throw new Error('the foe is gone');
  return f;
}

/** Wait (frame by frame) until the foe is winding up, with at most `left` seconds of it to go. */
async function windingUp(page: Page, id: number, left = 99): Promise<void> {
  await page.waitForFunction(([i, l]) => {
    const f = (window as unknown as W).__helldesk.foe(i);
    return f !== null && f.pending !== null && f.windup <= l;
  }, [id, left] as const, { polling: 'raf', timeout: 60_000 });
}

/** Wait (frame by frame) until the wind-up has run out: the strike has come. */
async function struck(page: Page, id: number): Promise<void> {
  await page.waitForFunction((i) => {
    const f = (window as unknown as W).__helldesk.foe(i);
    return f !== null && f.pending === null;
  }, id, { polling: 'raf', timeout: 60_000 });
}

async function sanity(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as W).__crawler.save.sanity);
}

async function parries(page: Page): Promise<number> {
  return page.evaluate(() => Number((window as unknown as W).__crawler.save.flags.parries ?? 0));
}

/**
 * The right button goes to the game only while the mouse is captured.
 * Headless browsers do not reliably grant pointer lock, so the test says the
 * mouse is captured and then presses the real button over the real canvas.
 */
async function captureMouse(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
  const box = await page.locator('canvas.game-canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** Let go of the block only after it has been up a while, so letting go is not a shove. */
async function lowerBlock(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as W).__crawler.rmbT > 0.3, null, { polling: 'raf', timeout: 60_000 });
  // Released through the same window handler the press went to, whichever
  // way the press was made.
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })));
}

test('stepping back during the wind-up: the swing comes and misses', async ({ page }) => {
  await startCareer(page);
  const id = await duel(page);
  // Start backing off on the very frame the wind-up begins. The key goes
  // through the game's own keyboard handler, pressed from inside the page:
  // a key sent from the test runner arrives a few hundred milliseconds
  // late on a slow software renderer, after a 0.45 s wind-up has already
  // ended, and the test would be measuring its own latency, not the game.
  await page.evaluate((i) => new Promise<void>((done) => {
    const h = (window as unknown as W).__helldesk;
    const watch = (): void => {
      const f = h.foe(i);
      if (f !== null && f.pending !== null) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
        done();
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), id);
  const before = await sanity(page);
  await struck(page, id);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' })));
  // The swing came (not interrupted), and it found nobody there.
  expect((await foe(page, id)).stunned).toBe(0);
  expect(await sanity(page)).toBeGreaterThanOrEqual(before);
});

test('standing still through the wind-up: the swing lands (the control)', async ({ page }) => {
  await startCareer(page);
  const id = await duel(page);
  await windingUp(page, id);
  const before = await sanity(page);
  await struck(page, id);
  await expect.poll(() => sanity(page)).toBeLessThan(before);
});

test('raising the block on the wind-up parries: PARRY, and the attacker staggers', async ({ page }) => {
  await startCareer(page);
  await captureMouse(page);
  const id = await duel(page);
  const before = await parries(page);
  // The window is the last quarter second before the strike. The press is
  // made from inside the page, on the frame the wind-up enters that window,
  // through the canvas's own mouse handler: a press sent from the test
  // runner arrives a few hundred milliseconds late on a slow software
  // renderer and would miss a 0.25 s window by its own latency. If a frame
  // still skips past it, the next wind-up (the user keeps swinging) is
  // another go.
  let parried = false;
  for (let go = 0; go < 3 && !parried; go++) {
    await page.evaluate((i) => new Promise<void>((done) => {
      const h = (window as unknown as W).__helldesk;
      const canvas = document.querySelector('canvas.game-canvas');
      const watch = (): void => {
        const f = h.foe(i);
        if (f !== null && f.pending !== null && f.windup <= 0.2) {
          canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
          done();
          return;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }), id);
    await struck(page, id);
    parried = (await parries(page)) > before;
    if (parried) expect((await foe(page, id)).stunned).toBeGreaterThan(0);
    await lowerBlock(page);
  }
  expect(parried).toBe(true);
  expect(await parries(page)).toBe(before + 1);
});

test('a block held up long before the wind-up only blocks: no parry, no stagger', async ({ page }) => {
  await startCareer(page);
  await captureMouse(page);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as unknown as W).__crawler.rmbT > 0.6, null, { polling: 'raf', timeout: 60_000 });
  const before = await parries(page);
  const id = await duel(page);
  const energy = await page.evaluate(() => (window as unknown as W).__crawler.save.energy);
  await windingUp(page, id);
  await struck(page, id);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.blocking)).toBe(true);
  expect(await parries(page)).toBe(before);
  expect((await foe(page, id)).stunned).toBe(0);
  // It was blocked: the guard took it out of your energy.
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.energy)).toBeLessThan(energy);
  await page.mouse.up({ button: 'right' });
});

test('a swing held into the pause menu does not go off when play resumes', async ({ page }) => {
  // Hold the melee button past a full charge, pause with Escape, let go
  // behind the menu, resume: the release happened while nobody was playing,
  // so nothing swings and no energy is spent on a heavy nobody asked for.
  await startCareer(page);
  await captureMouse(page);
  await page.mouse.down({ button: 'left' });
  await page.waitForFunction(() => (window as unknown as W).__crawler.chargeT > 0.9, null, { polling: 'raf', timeout: 60_000 });
  const energy = await page.evaluate(() => (window as unknown as W).__crawler.save.energy);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('paused');
  await page.mouse.up({ button: 'left' });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
  // Watch the first thirty frames back in play for any swing at all.
  const seen = await page.evaluate(() => new Promise<{ swing: number; cd: number; charging: boolean }>((done) => {
    const g = (window as unknown as W).__crawler;
    let frames = 0;
    let swing = 0;
    let cd = 0;
    const watch = (): void => {
      if (g.screen === 'play') frames++;
      swing = Math.max(swing, g.player.swing);
      cd = Math.max(cd, g.attackCd);
      if (frames >= 30) {
        done({ swing, cd, charging: g.charging });
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }));
  expect(seen.swing).toBe(0);
  expect(seen.cd).toBeLessThanOrEqual(0);
  expect(seen.charging).toBe(false);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.energy)).toBeGreaterThanOrEqual(energy);
});
