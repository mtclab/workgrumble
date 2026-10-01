import { expect, type Page, test } from '@playwright/test';

/**
 * Missions, the 0.3.0 spike (docs/SPEC_HELLDESK_030.md 6.0), on the served
 * build: `crawler?mission=stapler` and `?mission=vendor` start a fresh
 * trainee straight into the card; the page with no query is the title it
 * always was.
 *
 * Real keys move the player (C to sneak, W to walk, Shift to sprint, E at
 * the lift). The `__helldesk` mission handles only read the state or place
 * the player (`missionToSpine`, `missionStandInView`); nothing here sets a
 * tier, a suspicion or an objective. Under software rendering the game runs
 * slower than the wall clock, so every wait is on the game's own clock or
 * state, and the one step where frames matter runs in the page.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';

test.describe.configure({ timeout: 180_000 });

interface Watched {
  id: number;
  name: string;
  kind: string;
  tag: string | null;
  sort: string;
  hostile: boolean;
  aggro: boolean;
  resolved: boolean;
  suspicion: number;
  mood: string;
  bark: string;
  barkAt: number;
  patrol: { x: number; z: number }[];
}

interface MissionState {
  card: string;
  style: string;
  tier: number;
  tierName: string;
  maxTier: number;
  over: boolean;
  finish: string | null;
  actors: Watched[];
  spine: { x: number; z: number }[];
}

interface Crawler {
  screen: string;
  time: number;
  input: { locked: boolean };
  player: { crouching: boolean; pos: { x: number; z: number } };
  level: { recipe?: { id: string } };
  save: { energy: number };
}

interface Handles {
  mission: () => MissionState | null;
  missionStandInView: (id: number, dist: number) => boolean;
  missionToSpine: () => boolean;
  standAt: (kind: string) => boolean;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

async function mission(page: Page): Promise<MissionState> {
  const m = await page.evaluate(() => (window as unknown as W).__helldesk.mission());
  if (m === null) throw new Error('no mission running');
  return m;
}

async function gameTime(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as W).__crawler.time);
}

/** A browser that has played before (cheap graphics, no tips), then the page with `query`. */
async function open(page: Page, query: string): Promise<void> {
  await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
  await page.goto(HELLDESK);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false }));
  }, SETTINGS_KEY);
  await page.goto(`${HELLDESK}${query}`);
}

/** The card's briefing is up; take the card, and play. */
async function takeCard(page: Page): Promise<void> {
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('dialogue');
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page)).toBe('play');
  // Headless browsers do not reliably grant pointer lock: say the mouse is captured, as the playthrough does.
  await page.evaluate(() => { (window as unknown as W).__crawler.input.locked = true; });
}

test('?mission=stapler: the office row; crouched out of sight it stays Quiet, sprinting in view is Noticed with a bark', async ({ page }) => {
  await open(page, '?mission=stapler&seed=4242');
  await takeCard(page);
  const start = await mission(page);
  expect(start.card).toBe('stapler');
  expect(start.style).toBe('sneaky');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.level.recipe?.id)).toBe('officeRow');
  expect(start.tier).toBe(0);
  expect(start.actors.find((a) => a.tag === 'hr')?.patrol.length ?? 0).toBeGreaterThanOrEqual(4);
  expect(start.spine.length).toBeGreaterThan(20);
  await expect(page.getByTestId('mission-hud')).toContainText('QUIET');

  // Crouch-walk three seconds of game time down the service spine: nobody there to see.
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.missionToSpine())).toBe(true);
  const from = await page.evaluate(() => ({ ...(window as unknown as W).__crawler.player.pos }));
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.player.crouching)).toBe(true);
  const t0 = await gameTime(page);
  await page.keyboard.down('w');
  await expect.poll(() => gameTime(page), { timeout: 90_000 }).toBeGreaterThan(t0 + 3);
  await page.keyboard.up('w');
  const to = await page.evaluate(() => ({ ...(window as unknown as W).__crawler.player.pos }));
  expect(Math.hypot(to.x - from.x, to.z - from.z), 'the walk went somewhere').toBeGreaterThan(3);
  const quiet = await mission(page);
  expect(quiet.tier).toBe(0);
  expect(quiet.maxTier).toBe(0);
  await expect(page.getByTestId('mission-hud')).toContainText('QUIET');

  // Stand up, and sprint in front of someone at their desk, kept in their cone on every game frame.
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.player.crouching)).toBe(false);
  const desk = quiet.actors.filter((a) => a.sort === 'desk' && a.tag === null).map((a) => a.id);
  expect(desk.length).toBeGreaterThan(0);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  const who = await page.evaluate((ids) => new Promise<number>((done) => {
    const w = window as unknown as W;
    const id = ids.find((i) => w.__helldesk.missionStandInView(i, 3.5)) ?? -1;
    if (id < 0) { done(-1); return; }
    const began = w.__crawler.time;
    const frame = (): void => {
      const m = w.__helldesk.mission();
      if (m !== null && m.tier >= 1) { done(id); return; }
      if (w.__crawler.time - began > 30) { done(-2); return; }
      w.__helldesk.missionStandInView(id, 3.5);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), desk);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  expect(who, 'somebody at a desk could be stood in front of, and noticed').toBeGreaterThan(0);
  const noticed = await mission(page);
  expect(noticed.tier).toBeGreaterThanOrEqual(1);
  const them = noticed.actors.find((a) => a.id === who);
  expect(them?.suspicion ?? 0).toBeGreaterThanOrEqual(40);
  // Every detection is announced: a bark over their head, the HUD eye and the toast.
  expect(them?.bark ?? '').not.toBe('');
  expect(them?.barkAt ?? -1).toBeGreaterThan(t0);
  await expect(page.getByTestId('mission-hud')).toContainText(/NOTICED|ALERT/);
  await expect(page.locator('.hud-toasts')).toContainText('NOTICED');
});

test('?mission=vendor: the meeting ring, Escalated from the start, with hostile vendors; the lift aborts it to a results card', async ({ page }) => {
  await open(page, '?mission=vendor&seed=77');
  await takeCard(page);
  const m = await mission(page);
  expect(m.card).toBe('vendor');
  expect(m.style).toBe('loud');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.level.recipe?.id)).toBe('meetingRing');
  expect(m.tier).toBe(3);
  const vendors = m.actors.filter((a) => a.kind === 'vendor');
  expect(vendors).toHaveLength(4);
  expect(vendors.every((v) => v.hostile && !v.resolved)).toBe(true);
  expect(m.actors.filter((a) => a.kind === 'consultant')).toHaveLength(1);
  await expect(page.getByTestId('mission-hud')).toContainText('ESCALATED');

  // The lift, with the card not done: it asks, and Abort closes the card.
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.standAt('elevator'))).toBe(true);
  await expect(page.locator('.hud-prompt')).toContainText('the card is not done');
  await expect.poll(async () => {
    if (await screen(page) === 'play') await page.keyboard.press('e');
    return screen(page);
  }, { timeout: 60_000, intervals: [600] }).toBe('dialogue');
  await page.locator('.dlg-opt', { hasText: 'Abort the card.' }).click();
  await expect(page.getByTestId('mission-result')).toContainText('Aborted at the lift');
  await expect(page.getByTestId('mission-result')).toContainText('Escalated');
  await expect(page.getByTestId('mission-hud')).toBeHidden();
  expect((await mission(page)).finish).toBe('aborted');

  // Again: the same card, briefed afresh.
  await page.getByRole('button', { name: 'Again' }).click();
  await takeCard(page);
  const again = await mission(page);
  expect(again.card).toBe('vendor');
  expect(again.over).toBe(false);
});

test('the page with no query is the normal title screen', async ({ page }) => {
  await open(page, '');
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
  expect(await screen(page)).toBe('title');
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.mission())).toBeNull();
  await expect(page.getByTestId('mission-hud')).toHaveCount(0);
});
