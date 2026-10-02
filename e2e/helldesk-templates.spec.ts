import { expect, type Page, test } from '@playwright/test';

/**
 * Helldesk 0.3.0 S2a: one capture per floor template, on the served build
 * (docs/SPEC_HELLDESK_030_S2.md, "a sweep spec renders each template once").
 * Like visual-sweep.spec.ts these are CAPTURES for a human eye, not
 * assertions about looks; the hard rules are that each template loads on
 * the shipped page (`crawler?template=<id>`: the lobby and that template,
 * furnished, nobody on it), the game is playing, and the camera stands in
 * the template's doorway looking in (`__helldesk.toTemplate`, which only
 * places the player).
 *
 * Screenshots land in test-results/helldesk-templates/.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';
const OUT = 'test-results/helldesk-templates';
const TEMPLATES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T9', 'T10', 'sauna', 'it'] as const;

test.describe.configure({ timeout: 180_000 });

interface W {
  __crawler: { screen: string; time: number; input: { locked: boolean }; level: { recipe?: { id: string } } };
  __helldesk: { toTemplate: () => boolean };
}

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

async function gameTime(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as W).__crawler.time);
}

for (const id of TEMPLATES) {
  test(`template ${id}: loads on the served page and is captured from its doorway`, async ({ page }) => {
    await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
    await page.goto(HELLDESK);
    // Full quality: these frames are for looking at.
    await page.evaluate((key) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify({ quality: 'high', renderScale: 1, tips: false }));
    }, SETTINGS_KEY);
    await page.goto(`${HELLDESK}?template=${id}&seed=4242`);
    await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
    expect(await page.evaluate(() => (window as unknown as W).__crawler.level.recipe?.id)).toBe(`show-${id}`);
    await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
    expect(await page.evaluate(() => (window as unknown as W).__helldesk.toTemplate())).toBe(true);
    // A second of game time for the lights and the camera to settle.
    const t0 = await gameTime(page);
    await expect.poll(() => gameTime(page), { timeout: 60_000 }).toBeGreaterThan(t0 + 1);
    await page.screenshot({ path: `${OUT}/${id}.png` });
  });
}
