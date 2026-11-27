import { expect, type Page, test } from '@playwright/test';

/**
 * SUO: what the steam shows (docs/SPEC_SUO.md), on the served build.
 *
 * Throw löyly on an office kiuas with the meter nearly full and the floor
 * goes under the bog for thirty seconds. These drive the real page the way a
 * player would - E on the kiuas, W to walk, E on the figure, F to cast - and
 * check what a player would see: the HUD gone and one serif line in its
 * place; back in the office, the blessing in the effects list and a rune that
 * costs nothing; or, standing still, the steam running out with nothing lost.
 * And that nothing of it is ever saved.
 */

const HELLDESK = '/crawler';

// Building a floor under software rendering is slow, and the timeout path
// waits out thirty seconds of play on top.
test.describe.configure({ timeout: 120_000 });

interface Crawler {
  screen: string;
  save: {
    loyly: number; sanity: number; suoBlessing: boolean; floor: number; spell: string | null;
    floorState: { suo: boolean }; stats: { spellsCast: number };
  };
  derivedCache: { maxLoyly: number; maxSanity: number };
  vision: unknown;
  lastVisionDiff: string[] | null;
  loadFloor: (n: number, fromSave: boolean) => void;
  learnSpell: (id: string) => boolean;
  writeSlotFor: (id: string) => boolean;
  autosave: () => void;
}

interface Handles {
  toKiuas: () => boolean;
  toFigure: () => boolean;
  calm: () => void;
  vision: () => { left: number; dist: number } | null;
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
}

/**
 * Beside a real office kiuas, facing it, with Löyly at 95% and nobody after
 * you. Not every floor has a sauna (most do): go up until one does.
 */
async function atKiuasNearlyFull(page: Page): Promise<void> {
  const found = await page.evaluate(() => {
    const w = window as unknown as W;
    for (let n = 0; n < 12; n++) {
      if (n > 0) w.__crawler.loadFloor(w.__crawler.save.floor + 1, false);
      if (w.__helldesk.toKiuas()) return true;
    }
    return false;
  });
  expect(found).toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__helldesk.calm();
    w.__crawler.save.loyly = w.__crawler.derivedCache.maxLoyly * 0.95;
  });
}

async function throwLoyly(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__helldesk.vision() !== null)).toBe(true);
}

function slotKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('workgrumble-helldesk-v3-')).sort());
}

test('the steam takes you under at a sauna; the Löylyhenki blesses you; the next rune is free', async ({ page }) => {
  await startCareer(page);
  await atKiuasNearlyFull(page);
  await throwLoyly(page);

  // Under: the HUD is gone, one serif line and the steam meter stand in for it.
  await expect(page.locator('.hud')).toBeHidden();
  await expect(page.locator('.suo-line')).toBeVisible();
  await expect(page.locator('.suo-line')).toHaveText('The steam takes you under.');
  await expect(page.locator('.suo-meter')).toBeVisible();
  const lineFont = await page.locator('.suo-line').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(lineFont).toMatch(/serif/);
  const figure = await page.evaluate(() => (window as unknown as W).__helldesk.vision());
  expect(figure?.dist).toBeGreaterThanOrEqual(10);
  expect(figure?.dist).toBeLessThanOrEqual(18.5);

  // Walk the last steps to the figure (W), and take its hand (E).
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.toFigure())).toBe(true);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  // The way-under line holds for its first three seconds of play, then this one.
  await expect(page.locator('.suo-line')).toContainText('The Löylyhenki waits.', { timeout: 30_000 });
  await page.keyboard.press('KeyE');

  // Back in the office, exactly as it was, and blessed.
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.vision === null)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.lastVisionDiff)).toEqual([]);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.suo-veil')).toBeHidden();
  await expect(page.locator('.hud-effects')).toContainText('Steam-blessed: next rune free and certain');
  const after = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { blessed: g.save.suoBlessing, sanity: g.save.sanity, max: g.derivedCache.maxSanity };
  });
  expect(after.blessed).toBe(true);
  expect(after.sanity).toBe(after.max);

  // The next rune costs nothing and cannot fail: cast it with the meter empty.
  await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    g.learnSpell('steam');
    g.save.spell = 'steam';
    g.save.loyly = 0;
  });
  const before = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { sanity: g.save.sanity, cast: g.save.stats.spellsCast };
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.save.stats.spellsCast)).toBe(before.cast + 1);
  const spent = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { loyly: g.save.loyly, sanity: g.save.sanity, blessed: g.save.suoBlessing };
  });
  expect(spent.loyly).toBeLessThan(1);
  expect(spent.sanity).toBeGreaterThanOrEqual(before.sanity);
  expect(spent.blessed).toBe(false);
  await expect(page.locator('.hud-effects')).not.toContainText('Steam-blessed');
});

test('standing still, the steam runs out: back in the office, no blessing, nothing lost', async ({ page }) => {
  // Thirty seconds of play can be a minute of wall time under software rendering (the loop caps a frame at 0.05 s).
  test.setTimeout(180_000);
  await startCareer(page);
  await atKiuasNearlyFull(page);
  const sanityIn = await page.evaluate(() => (window as unknown as W).__crawler.save.sanity);
  await throwLoyly(page);
  await expect(page.locator('.hud')).toBeHidden();

  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.vision === null), { timeout: 150_000, intervals: [1000] }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.lastVisionDiff)).toEqual([]);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.suo-veil')).toBeHidden();
  const out = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { loyly: g.save.loyly, max: g.derivedCache.maxLoyly, sanity: g.save.sanity, blessed: g.save.suoBlessing };
  });
  expect(out.blessed).toBe(false);
  expect(out.loyly).toBeGreaterThanOrEqual(out.max - 0.01);
  expect(out.sanity).toBeGreaterThanOrEqual(sanityIn);
  await expect(page.locator('.hud-effects')).not.toContainText('Steam-blessed');

  // Once a floor visit: another sauna-sized overflow here does nothing.
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.floorState.suo)).toBe(true);
});

test('nothing is saved under the steam, and a reload lands in the normal world', async ({ page }) => {
  await startCareer(page);
  await atKiuasNearlyFull(page);
  const slotsBefore = await slotKeys(page);
  const autoBefore = await page.evaluate(() => localStorage.getItem('workgrumble-helldesk-v3-auto'));
  await throwLoyly(page);

  // Quicksave, a slot save and an autosave are all refused.
  await page.keyboard.press('F5');
  await expect(page.locator('.suo-line')).toHaveText('Nothing is kept here.');
  const refused = await page.evaluate(() => (window as unknown as W).__crawler.writeSlotFor('slot1'));
  expect(refused).toBe(false);
  await page.evaluate(() => (window as unknown as W).__crawler.autosave());
  expect(await slotKeys(page)).toEqual(slotsBefore);
  expect(await page.evaluate(() => localStorage.getItem('workgrumble-helldesk-v3-auto'))).toBe(autoBefore);

  // The pause menu offers no save while under.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save game' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume' }).click();

  // Reload mid-vision: the normal world, from the save made before it.
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.suo-veil')).toHaveCount(0);
  const back = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { vision: g.vision, suo: g.save.floorState.suo, blessed: g.save.suoBlessing };
  });
  expect(back.vision).toBeNull();
  expect(back.suo).toBe(false);
  expect(back.blessed).toBe(false);
});
