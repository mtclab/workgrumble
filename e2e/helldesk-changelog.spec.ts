import { expect, type Page, test } from '@playwright/test';

/**
 * Helldesk's "What's new", on the real page.
 *
 * A browser that last saw an older build is told what changed, once, on the
 * title screen; a reload does not tell it again; a first visit is told
 * nothing; and Update History keeps every release for whoever wants it later.
 * The rules themselves are unit-tested in `src/crawler/releases.test.ts`; this
 * is the journey a player takes through them.
 */

const HELLDESK = '/crawler';
const SEEN = 'workgrumble-helldesk-seen-version';

// Building a floor under software rendering is slow, and the title waits for it.
test.describe.configure({ timeout: 180_000 });

/** Boot with a clean browser, optionally one that remembers seeing `seen`. */
async function boot(page: Page, seen: string | null): Promise<void> {
  await page.goto(HELLDESK);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('workgrumble-helldesk-settings', JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false }));
    if (s !== null) localStorage.setItem('workgrumble-helldesk-seen-version', s);
  }, seen);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible();
}

test('an older seen version shows the notes once; a reload does not show them again', async ({ page }) => {
  await boot(page, '0.1.0');
  const panel = page.getByTestId('whats-new');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('release-0.2.0')).toBeVisible();
  // Only what came after the version this browser saw.
  await expect(panel.getByTestId('release-0.1.0')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe('0.2.0');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible();
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
});

test('the panel closes on its button and on Enter, and New career still works through it', async ({ page }) => {
  await boot(page, '0.1.0');
  await page.getByRole('button', { name: 'Noted' }).click();
  await expect(page.getByTestId('whats-new')).toHaveCount(0);

  await boot(page, '0.1.0');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
  // Enter closed the panel and did nothing else: still on the title.
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible();

  await boot(page, 'not-a-version');
  await expect(page.getByTestId('whats-new').getByTestId('release-0.1.0')).toBeVisible();
  await page.getByRole('button', { name: 'New career' }).click();
  await expect(page.getByRole('button', { name: 'Sign the contract' })).toBeVisible();
});

test('a first visit shows no panel, and the title says which build it is', async ({ page }) => {
  await boot(page, null);
  await expect(page.getByTestId('title-version')).toHaveText('Helldesk 0.2.0');
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe('0.2.0');
});

test('Update History lists every release, newest first', async ({ page }) => {
  await boot(page, null);
  await page.getByRole('button', { name: 'New career' }).click();
  // Straight to the floor: the induction has a spec of its own (helldesk-induction).
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await page.evaluate(() => (window as unknown as { __crawler: { openOs: (m: string, a: string) => void } }).__crawler.openOs('pack', 'updates'));

  const list = page.getByTestId('updates-list');
  await expect(list.getByTestId('release-0.2.0')).toBeVisible();
  await expect(list.getByTestId('release-0.2.0')).toContainText('Update 0.2.0');
  const order = await list.locator('.rel-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(order.slice(0, 2)).toEqual(['release-0.2.0', 'release-0.1.0']);
});
