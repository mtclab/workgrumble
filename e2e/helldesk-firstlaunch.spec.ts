import { expect, type Page, test } from '@playwright/test';

/**
 * First launch, loading and the comfort settings (docs/SPEC_FIRST_LAUNCH.md),
 * on the served build.
 *
 * A browser with no settings times its first title screen and picks the
 * graphics quality itself, notes that in the Control Panel, and never times
 * again. A floor being built says so. Camera shake off is no shake, Screen
 * flashes off is no flash, and attack can be moved off the left button.
 *
 * Under software rendering the game runs slower than the clock on the wall,
 * so every step waits on the game's own state; presses whose timing matters
 * are made from inside the page, through the game's own handlers.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';

// A first launch times three levels; career starts under software rendering take a while.
test.describe.configure({ timeout: 240_000 });

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface Crawler {
  screen: string;
  pickingQuality: boolean;
  settings: { quality: string; qualitySource: string; keys: Record<string, string> };
  camera: { position: Vec };
  pipeline: { render: () => void };
  player: { pos: Vec; swing: number };
  input: { locked: boolean };
  attackCd: number;
  save: { sanity: number };
  openOs: (mode: string, app: string) => void;
  close: () => void;
}

interface Handles {
  duel: (kind: string, dist: number) => number;
  foe: (id: number) => { pending: string | null } | null;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

interface Stored {
  quality?: string;
  qualitySource?: string;
}

async function stored(page: Page): Promise<Stored | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : (JSON.parse(raw) as Stored);
  }, SETTINGS_KEY);
}

/** A browser that has played before: cheap graphics, no tips, the induction done, plus `extra`. */
async function boot(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  // One fixed world per run: the duel needs open floor round the player.
  await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
  await page.goto(HELLDESK);
  await page.evaluate(([key, more]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: true, ...more }));
  }, [SETTINGS_KEY, extra] as const);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
}

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

async function startCareer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New career' }).click();
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
}

/**
 * From now on, every frame notes how far the camera sits off the player
 * (first person, standing still, that is the shake and nothing else) and
 * whether the screen's edge is showing a flash.
 */
async function watchFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    const rec = { shake: 0, flash: '' };
    (window as unknown as { __rec: typeof rec }).__rec = rec;
    const render = g.pipeline.render.bind(g.pipeline);
    g.pipeline.render = (): void => {
      rec.shake = Math.max(rec.shake, Math.abs(g.camera.position.x - g.player.pos.x), Math.abs(g.camera.position.z - g.player.pos.z));
      const v = document.querySelector<HTMLElement>('.hud-vignette');
      // What is on the screen: the computed style, not the inline one (the
      // edge is hidden by the stylesheet until the HUD first shows it).
      if (v !== null && getComputedStyle(v).display !== 'none') rec.flash = v.dataset.flash ?? 'shown';
      render();
    };
  });
}

async function frames(page: Page): Promise<{ shake: number; flash: string }> {
  return page.evaluate(() => (window as unknown as { __rec: { shake: number; flash: string } }).__rec);
}

/** A user 1.9 m in front, and the player standing still until one of their swings lands. */
async function takeAHit(page: Page): Promise<void> {
  const id = await page.evaluate(() => (window as unknown as W).__helldesk.duel('user', 1.9));
  expect(id).toBeGreaterThan(0);
  const before = await page.evaluate(() => (window as unknown as W).__crawler.save.sanity);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.save.sanity), { timeout: 120_000 }).toBeLessThan(before);
  // The shake and the flash run on for a few frames after the hit: watch them out.
  await waitFrames(page, 20);
}

async function waitFrames(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => new Promise<void>((done) => {
    let left = count;
    const tick = (): void => {
      if (--left <= 0) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
}

/** Ten or more seconds of frames by the wall clock: longer than a warm-up and a timing window together. */
async function waitWall(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => new Promise<void>((done) => {
    const until = performance.now() + t;
    const tick = (): void => {
      if (performance.now() >= until) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), ms);
}

test.describe('a first launch', () => {
  // A small window, so a software renderer times High in a sensible time.
  test.use({ viewport: { width: 640, height: 360 } });

  test('picks a quality and says so; the next launch keeps it and does not time again', async ({ page }) => {
    await page.goto(HELLDESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });

    // Timing: the settings say so from the start, so a tab closed now resumes the pick.
    await expect.poll(async () => (await stored(page))?.qualitySource, { timeout: 60_000 }).toMatch(/^(sampling|auto)$/);
    // Decided, on the title, by itself.
    await expect.poll(async () => (await stored(page))?.qualitySource, { timeout: 180_000 }).toBe('auto');
    expect(await page.evaluate(() => (window as unknown as W).__crawler.pickingQuality)).toBe(false);
    const first = await stored(page);
    expect(['low', 'medium', 'high']).toContain(first?.quality);
    expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.quality)).toBe(first?.quality);

    // The Control Panel says it was the machine's choice.
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.getByTestId('settings-panel');
    await expect(panel.getByTestId('quality-note')).toContainText('automatically');
    await expect(panel.getByLabel('Quality')).toHaveValue(first?.quality ?? '');
    await page.keyboard.press('Escape');

    // Second launch. High, put back as if the machine had chosen it: a
    // software renderer timing High again would step it down, so a launch
    // that timed again would be caught changing it.
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(k, JSON.stringify({ ...s, quality: 'high', qualitySource: 'auto' }));
    }, SETTINGS_KEY);
    await page.reload();
    await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as W).__crawler.pickingQuality)).toBe(false);
    await waitWall(page, 10_000);
    expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.quality)).toBe('high');
    expect(await stored(page)).toMatchObject({ quality: 'high', qualitySource: 'auto' });
  });

  test('the player\'s own pick overrules it, and clears the note', async ({ page }) => {
    await page.goto(HELLDESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.getByTestId('settings-panel');
    await panel.getByLabel('Quality').selectOption('medium');
    await expect(panel.getByTestId('quality-note')).toHaveText('');
    expect(await stored(page)).toMatchObject({ quality: 'medium', qualitySource: 'player' });
    expect(await page.evaluate(() => (window as unknown as W).__crawler.pickingQuality)).toBe(false);
    // And nothing comes along later to change it.
    await waitWall(page, 10_000);
    expect(await stored(page)).toMatchObject({ quality: 'medium', qualitySource: 'player' });
  });
});

test('settings written while a first launch is timing stand: the pick stops and saves nothing over them', async ({ page }) => {
  await page.goto(HELLDESK);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.pickingQuality), { timeout: 120_000 }).toBe(true);
  // What every spec's boot does mid-pick: settings of its own, then (here) no reload.
  const seeded = { quality: 'low', renderScale: 0.3, tips: false, inductionDone: true };
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [SETTINGS_KEY, seeded] as const);
  // The pick's next verdict is where it would write: it stops there instead.
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.pickingQuality), { timeout: 120_000 }).toBe(false);
  await waitFrames(page, 5);
  expect(await stored(page)).toEqual(seeded);
  // And the next launch reads them as they were seeded.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
  expect(await page.evaluate(() => (window as unknown as W).__crawler.pickingQuality)).toBe(false);
  await page.getByRole('button', { name: 'New career' }).click();
  await expect(page.getByLabel('Skip the induction')).toBeChecked();
});

test('building a floor puts the loading card up, and it is painted before the work starts', async ({ page }) => {
  await boot(page);
  // Watched from inside the page: up, and still up on the next frame (the
  // work runs only after that frame has been drawn).
  await page.evaluate(() => {
    const rec = { seen: false, painted: false };
    (window as unknown as { __load: typeof rec }).__load = rec;
    new MutationObserver(() => {
      if (rec.seen || document.querySelector('[data-testid="loading-card"]') === null) return;
      rec.seen = true;
      requestAnimationFrame(() => { rec.painted = document.querySelector('[data-testid="loading-card"]') !== null; });
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'New career' }).click();
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
  expect(await page.evaluate(() => (window as unknown as { __load: { seen: boolean; painted: boolean } }).__load)).toEqual({ seen: true, painted: true });
  await expect(page.getByTestId('loading-card')).toHaveCount(0);
});

test('shake and flashes on (the control): a hit shakes the camera and flashes the edge', async ({ page }) => {
  await boot(page, { view: 'first' });
  await startCareer(page);
  await watchFrames(page);
  await takeAHit(page);
  const seen = await frames(page);
  expect(seen.shake).toBeGreaterThan(0);
  expect(seen.flash).toBe('hurt');
});

test('shake off and flashes off: a hit moves the camera not at all, and no edge is shown', async ({ page }) => {
  await boot(page, { view: 'first', shake: false, flashes: false });
  await startCareer(page);
  await watchFrames(page);
  await takeAHit(page);
  const seen = await frames(page);
  expect(seen.shake).toBe(0);
  expect(seen.flash).toBe('');
  await expect(page.locator('.hud-vignette')).toBeHidden();
});

function keyButton(page: Page, label: string) {
  return page.locator('.os-keys label', { hasText: label }).getByRole('button');
}

/** Watch `n` frames of play after `press` runs in the page; the biggest swing seen. */
async function swingAfter(page: Page, press: 'left' | 'right' | 'KeyL'): Promise<number> {
  return page.evaluate((how) => new Promise<number>((done) => {
    const g = (window as unknown as W).__crawler;
    const canvas = document.querySelector('canvas.game-canvas');
    const button = how === 'left' ? 0 : 2;
    if (how === 'KeyL') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
    else canvas?.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
    let frames = 0;
    let swing = 0;
    const watch = (): void => {
      swing = Math.max(swing, g.player.swing, g.attackCd > 0 ? 1 : 0);
      // A tap: let go two frames later, through the same handlers.
      if (frames === 2) {
        if (how === 'KeyL') window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyL' }));
        else window.dispatchEvent(new MouseEvent('mouseup', { button }));
      }
      if (++frames >= 40) {
        done(swing);
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), press);
}

test('attack rebound to a key: the key swings, the left button no longer does', async ({ page }) => {
  await boot(page);
  await startCareer(page);
  await page.evaluate(() => (window as unknown as W).__crawler.openOs('pack', 'settings'));
  await keyButton(page, 'Use tool').click();
  await expect(keyButton(page, 'Use tool')).toHaveText('press a key…');
  await page.keyboard.press('KeyL');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.keys.attack)).toBe('KeyL');
  await page.evaluate(() => (window as unknown as W).__crawler.close());
  await expect.poll(() => screen(page)).toBe('play');
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });

  expect(await swingAfter(page, 'left')).toBe(0);
  expect(await swingAfter(page, 'KeyL')).toBeGreaterThan(0);
});

test('attack moved to the right button by clicking it there: block swaps to the left, and the right button swings', async ({ page }) => {
  await boot(page);
  await startCareer(page);
  await page.evaluate(() => (window as unknown as W).__crawler.openOs('pack', 'settings'));
  await keyButton(page, 'Use tool').click();
  await keyButton(page, 'Use tool').click({ button: 'right' });
  const keys = await page.evaluate(() => (window as unknown as W).__crawler.settings.keys);
  expect(keys.attack).toBe('Mouse2');
  // Swapped, not lost: nothing is left unbound.
  expect(keys.block).toBe('Mouse0');
  await expect(keyButton(page, 'Use tool')).toHaveText('RMB');
  await expect(keyButton(page, 'Block')).toHaveText('LMB');
  // The right click that bound it did not start another rebind.
  await expect(page.locator('.os-key', { hasText: 'press a key…' })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as W).__crawler.close());
  await expect.poll(() => screen(page)).toBe('play');
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });

  expect(await swingAfter(page, 'right')).toBeGreaterThan(0);
});
