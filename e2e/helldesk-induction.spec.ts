import { expect, type Page, test } from '@playwright/test';

/**
 * Induction day (docs/SPEC_INDUCTION.md), on the served build.
 *
 * A new career starts a guided first morning in the lobby: one card at a
 * time, each moving on only when the player has done what it says. These
 * play the whole of it from New career to normal play, the way a player
 * would - the mouse to look, W to walk, E to talk, the left button to swing
 * and fire, 2 for the label maker, the right button to block and parry, E at
 * the lobby computer, M for the map - and check what a player would see: the
 * card for each step, the step moving on, the meters arriving, and at the end
 * the props gone and the floor open. With "Skip the induction" ticked, a new
 * career is the floor as it always was. A reload mid-induction comes back at
 * the same step.
 *
 * The test puts the player in front of each prop (`standBefore`) so it is not
 * testing its own steering; every step itself is done with the game's own
 * input. Under software rendering the game runs slower than the clock on the
 * wall and a key or button sent from the test runner arrives a few hundred
 * milliseconds late, so everything here waits on the game's own state, and
 * the one thing timed to a quarter second (the parry) is pressed from inside
 * the page on the right frame, through the canvas's own mouse handler.
 */

const HELLDESK = '/crawler';

// A career start under software rendering takes a while, and the whole morning is a dozen steps of game time.
test.describe.configure({ timeout: 240_000 });

interface Foe {
  pending: string | null;
  windup: number;
  stunned: number;
  resolved: boolean;
}

interface Induction {
  step: string;
  sanityTold: boolean;
  dummy: number;
  props: string[];
  terminal: boolean;
  hidden: string[];
}

interface Crawler {
  screen: string;
  rmbT: number;
  chargeT: number;
  floorAwake: boolean;
  input: { locked: boolean };
  settings: { inductionDone: boolean };
  save: { sanity: number };
}

interface Handles {
  induction: () => Induction | null;
  standBefore: (which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number) => boolean;
  foe: (id: number) => Foe | null;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

const SETTINGS_KEY = 'workgrumble-helldesk-settings';
const AUTO_SLOT = 'workgrumble-helldesk-v3-auto';

/** A clean browser (or one that has done an induction before), at the title. */
async function boot(page: Page, inducted: boolean): Promise<void> {
  await page.goto(HELLDESK);
  await page.evaluate(([key, done]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: done }));
  }, [SETTINGS_KEY, inducted] as const);
  await page.reload();
}

async function induction(page: Page): Promise<Induction> {
  const st = await page.evaluate(() => (window as unknown as W).__helldesk.induction());
  if (st === null) throw new Error('no induction handle');
  return st;
}

async function step(page: Page): Promise<string> {
  return (await induction(page)).step;
}

/** The card on screen shows `s`, and the induction is on it. */
async function onCard(page: Page, s: string): Promise<void> {
  await expect.poll(() => step(page), { timeout: 60_000 }).toBe(s);
  const card = page.getByTestId('induction-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-step', s);
}

async function standBefore(page: Page, which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number): Promise<void> {
  expect(await page.evaluate(([w, d]) => (window as unknown as W).__helldesk.standBefore(w, d), [which, dist] as const)).toBe(true);
}

/**
 * The buttons go to the game only while the mouse is captured. Headless
 * browsers do not reliably grant pointer lock, so the test says the mouse
 * is captured and then uses the real mouse over the real canvas.
 */
async function captureMouse(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
  const box = await page.locator('canvas.game-canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function sanity(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as W).__crawler.save.sanity);
}

/** Wait (frame by frame) until the dummy has a swing on its way, then until it lands. */
async function dummySwing(page: Page, id: number): Promise<void> {
  await page.waitForFunction((i) => {
    const f = (window as unknown as W).__helldesk.foe(i);
    return f !== null && f.pending !== null;
  }, id, { polling: 'raf', timeout: 60_000 });
  await page.waitForFunction((i) => {
    const f = (window as unknown as W).__helldesk.foe(i);
    return f !== null && f.pending === null;
  }, id, { polling: 'raf', timeout: 60_000 });
}

/** Keep doing `act` until the induction leaves `from` (a click can land on a frame that swallows it). */
async function until(page: Page, from: string, act: () => Promise<void>, tries = 6): Promise<void> {
  for (let i = 0; i < tries && (await step(page)) === from; i++) {
    await act();
    await expect.poll(() => step(page), { timeout: 8_000 }).not.toBe(from).catch(() => undefined);
  }
  expect(await step(page)).not.toBe(from);
}

/** New career, the New Starter Form with the skip box as `skip`, and Morag's first words. */
async function newCareer(page: Page, skip: boolean): Promise<void> {
  await page.getByRole('button', { name: 'New career' }).click();
  const box = page.getByLabel('Skip the induction');
  await box.setChecked(skip);
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('play');
}

/** The first three steps: look round, walk over to Morag, talk the practice colleague down. */
async function lookWalkTalk(page: Page): Promise<void> {
  await onCard(page, 'look');
  // Mouse look, through the game's own mousemove handler (as pointer lock would deliver it).
  await captureMouse(page);
  await until(page, 'look', async () => {
    await page.evaluate(() => new Promise<void>((done) => {
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
    }));
  });

  await onCard(page, 'walk');
  await expect(page.getByTestId('induction-card')).toContainText('W');
  await standBefore(page, 'morag', 4.5);
  await page.keyboard.down('w');
  await expect.poll(() => step(page), { timeout: 60_000 }).not.toBe('walk');
  await page.keyboard.up('w');

  await onCard(page, 'talk');
  await standBefore(page, 'colleague', 1.8);
  await expect(page.locator('.hud-prompt')).toContainText('Sam from Sales');
  await page.keyboard.press('e');
  await expect(page.locator('.dlg-opt').first()).toBeVisible();
  await expect(page.locator('.dlg-opt').first()).toContainText('Practice 100%');
  await page.locator('.dlg-opt').first().click();
  // The thanks, then back to the floor.
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('play');
}

test('a new career plays the whole induction, one card at a time, and then the floor opens', async ({ page }) => {
  await boot(page, false);
  await page.getByRole('button', { name: 'New career' }).click();
  // Never done one: the box is off.
  await expect(page.getByLabel('Skip the induction')).not.toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await newCareer(page, false);

  // The lobby is set for the morning, and the floor is asleep.
  let st = await induction(page);
  expect(st.props).toHaveLength(3);
  expect(st.terminal).toBe(true);
  expect(st.hidden).toEqual(expect.arrayContaining(['energy', 'rep', 'promille', 'caffeine']));
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(false);

  await lookWalkTalk(page);

  // 3. A quick swing on the dummy.
  await onCard(page, 'swing');
  await captureMouse(page);
  await standBefore(page, 'dummy', 1.5);
  // A press and a release back to back: a tap, not a charge.
  await until(page, 'swing', async () => {
    await page.mouse.down();
    await page.mouse.up();
  });

  // 4. The heavy one: hold until the ring is ready, let go. Energy has come on to the HUD.
  await onCard(page, 'heavy');
  expect((await induction(page)).hidden).not.toContain('energy');
  await until(page, 'heavy', async () => {
    await page.mouse.down();
    await page.waitForFunction(() => (window as unknown as W).__crawler.chargeT > 0.9, null, { polling: 'raf', timeout: 60_000 });
    await page.mouse.up();
  });

  // 5. The label maker: 2, then fire. The card points at the ammo under TOOL.
  await onCard(page, 'label');
  await expect(page.locator('.hud-cell-weapon')).toHaveClass(/is-pointed/);
  await page.keyboard.press('2');
  await expect(page.locator('.hud-weapon')).toContainText(/label/i);
  await until(page, 'label', async () => {
    await page.mouse.down();
    await page.mouse.up();
  });
  await page.keyboard.press('1');

  // 6. Block and parry. First a swing taken on the chin: a little Sanity, and what Sanity is.
  await onCard(page, 'block');
  await standBefore(page, 'dummy', 1.6);
  const dummy = (await induction(page)).dummy;
  expect(dummy).toBeGreaterThan(0);
  const whole = await sanity(page);
  await dummySwing(page, dummy);
  await expect.poll(() => sanity(page)).toBeLessThan(whole);
  expect((await induction(page)).sanityTold).toBe(true);
  await expect(page.getByTestId('induction-card')).toContainText('Sanity is your health');
  expect(await step(page)).toBe('block');

  // Then held up in good time: blocked, no Sanity lost, on to the parry.
  await page.mouse.down({ button: 'right' });
  const guarded = await sanity(page);
  await expect.poll(() => step(page), { timeout: 60_000 }).toBe('parry');
  expect(await sanity(page)).toBeGreaterThanOrEqual(guarded - 0.01);
  await page.waitForFunction(() => (window as unknown as W).__crawler.rmbT > 0.3, null, { polling: 'raf', timeout: 60_000 });
  await page.mouse.up({ button: 'right' });

  // The parry: raised in the wind-up's last quarter second, pressed on the right frame from inside the page.
  await onCard(page, 'parry');
  for (let go = 0; go < 4 && (await step(page)) === 'parry'; go++) {
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
    }), dummy);
    await page.waitForFunction((i) => (window as unknown as W).__helldesk.foe(i)?.pending === null, dummy, { polling: 'raf', timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as W).__crawler.rmbT > 0.3, null, { polling: 'raf', timeout: 60_000 });
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })));
  }

  // 7. The floor wakes up; REP and the queue arrive with the ticket.
  await onCard(page, 'ticket');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(true);
  expect((await induction(page)).hidden).not.toContain('rep');
  await standBefore(page, 'terminal', 1.4);
  await expect(page.locator('.hud-prompt')).toContainText('Log on');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('os');
  await page.locator('.os-fix.os-hint').click();
  await expect.poll(() => step(page)).toBe('map');
  await page.getByRole('button', { name: /Log off/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('play');

  // 8. The map.
  await onCard(page, 'map');
  await page.keyboard.press('m');
  await expect(page.locator('.dlg-opt').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.dlg-text')).toContainText('lift');
  await page.locator('.dlg-opt').first().click();

  // Normal play: no card, no props, no lobby computer, the floor awake, and remembered for next time.
  await expect.poll(() => step(page)).toBe('none');
  await expect(page.getByTestId('induction-card')).toHaveCount(0);
  st = await induction(page);
  expect(st.props).toEqual([]);
  expect(st.terminal).toBe(false);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.inductionDone)).toBe(true);
  expect(await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { inductionDone?: boolean }).inductionDone, SETTINGS_KEY)).toBe(true);
});

test('with "Skip the induction" ticked, a new career lands straight in normal play', async ({ page }) => {
  // Somebody who has done one before: the box is on by default.
  await boot(page, true);
  await page.getByRole('button', { name: 'New career' }).click();
  await expect(page.getByLabel('Skip the induction')).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await newCareer(page, true);

  const st = await induction(page);
  expect(st.step).toBe('none');
  expect(st.props).toEqual([]);
  expect(st.terminal).toBe(false);
  expect(st.hidden).toEqual([]);
  await expect(page.getByTestId('induction-card')).toHaveCount(0);
  // Every meter on the bar, from the first frame.
  await expect(page.locator('.hud-bar .is-hidden')).toHaveCount(0);
  for (const label of ['SANITY', 'REP', 'LÖYLY', 'PROMILLE', 'CAFFEINE']) await expect(page.locator('.hud-bar')).toContainText(label);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(true);
});

test('a reload mid-induction comes back at the same step, with the lobby set for it', async ({ page }) => {
  await boot(page, false);
  await newCareer(page, false);
  await lookWalkTalk(page);
  await onCard(page, 'swing');
  // The step is saved with the career (the autosave after each step).
  await expect.poll(() => page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : (JSON.parse(raw) as { data: { induction: { step: string } | null } }).data.induction?.step ?? null;
  }, AUTO_SLOT), { timeout: 60_000 }).toBe('swing');

  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.screen)).toBe('play');
  await onCard(page, 'swing');
  const st = await induction(page);
  expect(st.props).toHaveLength(3);
  expect(st.terminal).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.floorAwake)).toBe(false);

  // And it carries on from there.
  await captureMouse(page);
  await standBefore(page, 'dummy', 1.5);
  await until(page, 'swing', async () => {
    await page.mouse.down();
    await page.mouse.up();
  });
  await onCard(page, 'heavy');
});
