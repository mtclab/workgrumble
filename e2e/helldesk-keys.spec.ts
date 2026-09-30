import { expect, type Page, test } from '@playwright/test';

/**
 * Helldesk's key rebinding, and the walk it once broke.
 *
 * Clicking a key in the Control Panel waits for the next key press. That wait
 * used to outlive the panel: leave it without pressing anything, and the next
 * key pressed in the game - W, to walk off - was bound to whatever had been
 * clicked. Saved, so it survived every restart: W strafed right for good. And
 * two clicks before a key press rebound both actions with that one key.
 *
 * These drive the real page and check what a player would: W walks forward.
 */

const HELLDESK = '/crawler';

// Building a floor under software rendering is slow; a career start alone can
// take most of the default thirty seconds when the suite runs in parallel.
test.describe.configure({ timeout: 120_000 });

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

async function openKeys(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __crawler: { openOs: (m: string, a: string) => void } }).__crawler.openOs('pack', 'settings'));
}

function keyButton(page: Page, label: string) {
  return page.locator('.os-keys label', { hasText: label }).getByRole('button');
}

async function binding(page: Page, action: string): Promise<string> {
  return page.evaluate((a) => (window as unknown as { __crawler: { settings: { keys: Record<string, string> } } }).__crawler.settings.keys[a] ?? '', action);
}

/** Hold a key in play and report how far the player went along and across their facing. */
async function walk(page: Page, code: string): Promise<{ along: number; across: number }> {
  const before = await page.evaluate(() => {
    const g = (window as unknown as { __crawler: { player: { pos: { x: number; z: number }; yaw: number } } }).__crawler;
    return { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw };
  });
  // Short, so the walk ends before whatever stands in front of the start.
  await page.keyboard.down(code);
  await page.waitForTimeout(300);
  await page.keyboard.up(code);
  const after = await page.evaluate(() => {
    const g = (window as unknown as { __crawler: { player: { pos: { x: number; z: number } } } }).__crawler;
    return { x: g.player.pos.x, z: g.player.pos.z };
  });
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
  return {
    along: -Math.sin(before.yaw) * dx - Math.cos(before.yaw) * dz,
    across: Math.cos(before.yaw) * dx - Math.sin(before.yaw) * dz,
  };
}

async function closeOs(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __crawler: { close: () => void } }).__crawler.close());
}

test('leaving a rebind unanswered leaves the keys alone, and W still walks forward', async ({ page }) => {
  await startCareer(page);
  await openKeys(page);
  await keyButton(page, 'Strafe right').click();
  await expect(keyButton(page, 'Strafe right')).toHaveText('press a key…');
  await closeOs(page);

  const step = await walk(page, 'KeyW');
  expect(step.along).toBeGreaterThan(0.3);
  expect(Math.abs(step.across)).toBeLessThan(step.along / 2);
  expect(await binding(page, 'forward')).toBe('KeyW');
  expect(await binding(page, 'right')).toBe('KeyD');

  // And nothing wrong was saved for the next session.
  await page.reload();
  expect(await binding(page, 'forward')).toBe('KeyW');
  expect(await binding(page, 'right')).toBe('KeyD');
});

test('a second rebind click takes over from the first, and one key binds one action', async ({ page }) => {
  await startCareer(page);
  await openKeys(page);
  await keyButton(page, 'Move forward').click();
  await keyButton(page, 'Strafe right').click();
  await page.keyboard.press('KeyL');

  expect(await binding(page, 'forward')).toBe('KeyW');
  expect(await binding(page, 'right')).toBe('KeyL');
});

test('a rebind that is answered works: the new key strafes right', async ({ page }) => {
  await startCareer(page);
  await openKeys(page);
  await keyButton(page, 'Strafe right').click();
  await page.keyboard.press('KeyL');
  await closeOs(page);

  const step = await walk(page, 'KeyL');
  expect(step.across).toBeGreaterThan(0.3);
  expect(Math.abs(step.along)).toBeLessThan(step.across / 2);
});

test('at a desk terminal, closing the Control Panel window ends the wait, and the next key is the desk\'s', async ({ page }) => {
  // A desk stays logged on after its last window closes, so this is the one
  // way out of a rebind that does not close the whole OS.
  await startCareer(page);
  await page.evaluate(() => (window as unknown as { __crawler: { openOs: (m: string, a: string) => void } }).__crawler.openOs('desk', 'settings'));
  await keyButton(page, 'Strafe right').click();
  await expect(keyButton(page, 'Strafe right')).toHaveText('press a key…');
  await page.locator('.os-window', { has: page.locator('.os-keys') }).locator('.os-x').click();
  await page.keyboard.press('KeyP');
  expect(await binding(page, 'right')).toBe('KeyD');
});
