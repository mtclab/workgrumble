import { expect, type Page, test } from '@playwright/test';
import { deal, type Deck, deckCard } from '../src/crawler/deck';

/**
 * The workstation and the weekly deck (docs/SPEC_HELLDESK_030_S1.md, S1b
 * browser gates), on the served build through the real entry point: a card
 * taken at your desk, the lift up to it, finished quiet, and back on the hub
 * paid; a loud card aborted at its lift, still on the board; and a
 * coworker's card handed over in person by talking to them.
 *
 * Real keys and the real mouse wherever timing allows (E at the desk, the
 * lift and a person; C to sneak; W to step onto a post-it; clicks on the
 * desk's Accept, the lift's buttons and the results card). The window's
 * handles only put the player somewhere (in front of the desk, the lift,
 * somebody, a step from a post-it), turn them, or read state; none of them
 * accepts, finishes, picks up, saves or loads anything. Under software
 * rendering the game runs slower than the clock on the wall, so every step
 * waits on the game's own state and time.
 *
 * The week's deck is the career's (seeded by the clock it was hired at), so
 * the spec picks the moment to hire at: the first minute after its fixed
 * clock whose week one, hired at rung 4 (Specialist: Vendor Day is in that
 * band's pool), deals Password Hygiene Week after hours at the desk, Vendor
 * Day, and a card handed over in person - worked out by the game's own deal.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';
const RUNG = 4;

test.describe.configure({ timeout: 900_000 });

/** The clock to hire at, and the deck it deals (the game deals the same on load: the spec checks). */
function hireClock(): { now: number; deck: Deck } {
  for (let k = 0; k < 100_000; k++) {
    const now = 1_700_000_000_000 + k * 60_000;
    // Week one: floor B1, whose story person is Marcus (so his card is not dealt that week).
    const d = deal({ careerSeed: now >>> 0, week: 1, floor: 0, rung: RUNG, previous: [], exclude: ['marcus'] });
    const by = (id: string) => d.cards.find((c) => c.id === id);
    const postits = by('postits');
    if (postits === undefined || postits.inPerson || !postits.afterHours || by('vendor') === undefined) continue;
    if (!d.cards.some((c) => c.inPerson)) continue;
    return { now, deck: d };
  }
  throw new Error('no clock deals what the spec needs');
}

interface CardView { index: number; id: string; title: string; giver: string; state: string; inPerson: boolean; afterHours: boolean; rule: string; place: string }

interface MissionState {
  card: string; career: boolean; tier: number; maxTier: number; over: boolean; finish: string | null; progress: number; objectiveDone: boolean;
  hud: { actors: { visible: boolean; suspicion: number | null }[] };
  result: { quiet: boolean; base: number; bonus: number; repTotal: number } | null;
}

interface Person { id: number; name: string; hostile: boolean; resolved: boolean; marker: unknown }

interface Crawler {
  screen: string;
  time: number;
  actors: readonly Person[];
  input: { locked: boolean };
  player: { crouching: boolean };
  save: { location: string; rep: number; week: number; seed: number; deck: { week: number; cards: { id: string; state: string }[] } };
}

interface Handles {
  deck: () => CardView[];
  toWorkstation: () => boolean;
  standAt: (kind: string) => boolean;
  toPerson: (id: number, dist: number) => boolean;
  face: (id: number) => boolean;
  mission: () => MissionState | null;
  missionToCopy: (dist: number) => boolean;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

const screen = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as W).__crawler.screen);
const location = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as W).__crawler.save.location);
const deckOf = (page: Page): Promise<CardView[]> => page.evaluate(() => (window as unknown as W).__helldesk.deck());
const cardOf = async (page: Page, id: string): Promise<CardView> => {
  const c = (await deckOf(page)).find((x) => x.id === id);
  if (c === undefined) throw new Error(`${id} is not on the board`);
  return c;
};
async function mission(page: Page): Promise<MissionState> {
  const m = await page.evaluate(() => (window as unknown as W).__helldesk.mission());
  if (m === null) throw new Error('no mission');
  return m;
}

/** A browser that has played before; a new career hired at rung 4, at the spec's moment, with the induction skipped; Morag answered. */
async function newCareer(page: Page, now: number): Promise<void> {
  await page.addInitScript((t) => { Date.now = () => t; }, now);
  await page.goto(HELLDESK);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: true }));
  }, SETTINGS_KEY);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'New career' }).click();
  await page.locator(`[data-focus="rung:${RUNG}"]`).click();
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page), { timeout: 120_000 }).toBe('play');
}

/** Anything ringing (a staffing call) answered with its highlighted line, until the player has the floor again. */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => {
    const s = await screen(page);
    if (s === 'dialogue' && !((await page.locator('.dlg').textContent()) ?? '').startsWith('The lift')) {
      await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    }
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

/** In front of the lift with its buttons up (E, the real key), wherever you are; a call that rang first is answered. */
async function liftOpen(page: Page): Promise<string[]> {
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'play') {
      await capture(page);
      await page.evaluate(() => (window as unknown as W).__helldesk.standAt('elevator'));
      await page.keyboard.press('e');
    } else if (now === 'dialogue' && !((await page.locator('.dlg').textContent()) ?? '').startsWith('The lift')) {
      await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    }
    return (await screen(page)) === 'dialogue' && ((await page.locator('.dlg').textContent()) ?? '').startsWith('The lift');
  }, { timeout: 120_000, intervals: [600] }).toBe(true);
  return (await page.locator('.dlg-opt').allTextContents()).map((l) => l.replace(/^\d+\.\s*/, '').replace(/^\[[^\]]*\]\s*/, '').trim());
}

/** The lift's button for a card, then its briefing taken; on the card's map. */
async function upTo(page: Page, label: string, card: string): Promise<void> {
  expect(await liftOpen(page)).toContain(label);
  await page.locator('.dlg-opt', { hasText: label }).click();
  await expect.poll(() => location(page), { timeout: 120_000 }).toBe('mission');
  await expect.poll(() => screen(page), { timeout: 60_000 }).toBe('dialogue');
  await expect(page.locator('.dlg')).toContainText('The alarm:');
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page)).toBe('play');
  expect((await mission(page)).card).toBe(card);
  expect((await mission(page)).career).toBe(true);
  await capture(page);
}

test('a card taken at your desk, the lift up, finished quiet, and back on the hub paid', async ({ page }) => {
  const { now, deck } = hireClock();
  await newCareer(page, now);
  // The game dealt what the deal says.
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.deck.cards.map((c) => c.id))).toEqual(deck.cards.map((c) => c.id));
  const postits = await cardOf(page, 'postits');
  expect(postits).toMatchObject({ state: 'offered', inPerson: false, afterHours: true, giver: 'Priya (InfoSec)' });

  // Your desk: E on its computer, the Projects window over the queue, Accept.
  await capture(page);
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.toWorkstation())).toBe(true);
  await expect(page.locator('.hud-prompt')).toContainText('WorkgrumbleOS');
  await page.keyboard.press('e');
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('os');
  const projects = page.locator('.os-window', { hasText: 'Projects' });
  await expect(projects).toBeVisible();
  const card = projects.locator('.os-card[data-card="postits"]');
  await expect(card).toContainText('Password Hygiene Week');
  await expect(card).toContainText('Priya (InfoSec)');
  await expect(card).toContainText('After hours');
  await expect(card).toContainText(`Alarm: ${postits.rule}`);
  await expect(card).toContainText('Due: Friday');
  await card.locator('[data-act="accept"]').click();
  await expect(projects.locator('.os-feedback')).toContainText('Accepted: Password Hygiene Week');
  expect((await cardOf(page, 'postits')).state).toBe('accepted');
  await page.keyboard.press('Escape');
  await settle(page);

  // Up the lift to the card, after hours: half the floor has gone home.
  await upTo(page, 'Password Hygiene Week (HR corridor)', 'postits');
  await expect(page.getByTestId('mission-rule')).toContainText(postits.rule);
  await expect(page.getByTestId('mission-rule')).toContainText('After hours.');
  const rep0 = await page.evaluate(() => (window as unknown as W).__crawler.save.rep);

  // Sneaking (C), a step at a time onto each post-it (W), and still while anyone's bar is up.
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__crawler.player.crouching)).toBe(true);
  for (let n = 1; n <= 8; n++) {
    await expect.poll(async () => {
      const m = await mission(page);
      return m.hud.actors.every((a) => (a.suspicion ?? 0) < 20);
    }, { timeout: 120_000, intervals: [500] }).toBe(true);
    expect(await page.evaluate(() => (window as unknown as W).__helldesk.missionToCopy(2.2))).toBe(true);
    await page.keyboard.down('w');
    await expect.poll(async () => (await mission(page)).progress, { timeout: 60_000 }).toBe(n);
    await page.keyboard.up('w');
  }
  const done = await mission(page);
  expect(done.objectiveDone).toBe(true);
  expect(done.maxTier, 'nobody went past Noticed').toBeLessThanOrEqual(1);

  // The lift: Finish, the results card (quiet), and back to the hub, paid.
  expect(await liftOpen(page)).toEqual(['Finish: close the card', 'Not yet.']);
  await page.locator('.dlg-opt', { hasText: 'Finish: close the card' }).click();
  const result = page.getByTestId('mission-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.title-logo')).toContainText('CARD CLOSED');
  await expect(result).toContainText('Finished quiet');
  await expect(result).toContainText('pay x1.5');
  const paid = (await mission(page)).result;
  expect(paid?.quiet).toBe(true);
  expect(paid?.base).toBe(165);
  await page.getByRole('button', { name: 'Back to the hub' }).click();
  await expect.poll(() => location(page), { timeout: 120_000 }).toBe('hub');
  await settle(page);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.rep) - rep0, 'paid at Priya\'s after-hours rate, quiet bonus and all').toBe(165 + 66);
  expect((await cardOf(page, 'postits')).state).toBe('done');
  expect(await liftOpen(page), 'done: off the lift').not.toContain('Password Hygiene Week (HR corridor)');
});

test('a loud card taken and aborted at its lift: still on the board, and on the lift', async ({ page }) => {
  const { now } = hireClock();
  await newCareer(page, now);
  await capture(page);
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.toWorkstation())).toBe(true);
  await page.keyboard.press('e');
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('os');
  const vendor = page.locator('.os-window', { hasText: 'Projects' }).locator('.os-card[data-card="vendor"]');
  await expect(vendor).toContainText('Vendor Day');
  await expect(vendor).toContainText('Loud');
  await vendor.locator('[data-act="accept"]').click();
  expect((await cardOf(page, 'vendor')).state).toBe('accepted');
  await page.keyboard.press('Escape');
  await settle(page);

  await upTo(page, 'Vendor Day (Atrium loop)', 'vendor');
  expect((await mission(page)).tier, 'loud from the start').toBe(3);
  expect(await liftOpen(page)).toEqual(['Abort: back to the hub (the card stays on the board until Friday)', 'Not yet.']);
  await page.locator('.dlg-opt', { hasText: 'Abort' }).click();
  await expect(page.locator('.title-logo')).toContainText('CARD ABORTED', { timeout: 60_000 });
  await expect(page.getByTestId('mission-result')).toContainText('still on the board until Friday');
  await page.getByRole('button', { name: 'Back to the hub' }).click();
  await expect.poll(() => location(page), { timeout: 120_000 }).toBe('hub');
  await settle(page);
  expect((await cardOf(page, 'vendor')).state, 'still on the board').toBe('accepted');
  const buttons = await liftOpen(page);
  expect(buttons).toContain('Vendor Day (Atrium loop)');
  await page.locator('.dlg-opt', { hasText: 'Not yet.' }).click();
});

test('a coworker\'s card offered in person: the desk says to ask them, and talking to them hands it over', async ({ page }) => {
  const { now, deck } = hireClock();
  await newCareer(page, now);
  const dealt = deck.cards.find((c) => c.inPerson)!;
  const giver = deckCard(dealt)!.giver.name;
  const offered = await cardOf(page, dealt.id);
  expect(offered).toMatchObject({ inPerson: true, state: 'offered', giver });

  // At the desk: no Accept, a note to ask them.
  await capture(page);
  expect(await page.evaluate(() => (window as unknown as W).__helldesk.toWorkstation())).toBe(true);
  await page.keyboard.press('e');
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('os');
  const card = page.locator('.os-window', { hasText: 'Projects' }).locator(`.os-card[data-card="${dealt.id}"]`);
  await expect(card).toContainText(`Ask ${giver}`);
  await expect(card.locator('[data-act="accept"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await settle(page);

  // On the floor: the giver, with a "!" over them; E, and the card in their words.
  const who = await page.evaluate((name) => {
    const a = (window as unknown as W).__crawler.actors.find((x) => x.name === name && !x.resolved);
    return a === undefined ? undefined : { id: a.id, marker: a.marker !== null };
  }, giver);
  expect(who, `${giver} is on the hub`).toBeDefined();
  expect(who?.marker, 'a "!" over them').toBe(true);
  await expect.poll(async () => {
    const s = await screen(page);
    if (s === 'play') {
      await capture(page);
      await page.evaluate((id) => (window as unknown as W).__helldesk.toPerson(id, 1.6), who!.id);
      await page.evaluate((id) => (window as unknown as W).__helldesk.face(id), who!.id);
      await page.keyboard.press('e');
    } else if (s === 'dialogue' && !((await page.locator('.dlg').textContent()) ?? '').includes('Leave it with me.')) {
      await page.locator('.dlg-opt.is-sel').first().click({ timeout: 5_000 }).catch(() => undefined);
    }
    return ((await page.locator('.dlg').textContent().catch(() => '')) ?? '').includes('Leave it with me.');
  }, { timeout: 120_000, intervals: [600] }).toBe(true);
  await expect(page.locator('.dlg')).toContainText(deckCard(dealt)!.title);
  await page.locator('.dlg-opt', { hasText: 'Leave it with me.' }).click();
  await expect.poll(async () => (await cardOf(page, dealt.id)).state).toBe('accepted');
  await page.locator('.dlg-opt').first().click();
  await settle(page);
  expect(await liftOpen(page)).toContain(`${deckCard(dealt)!.title} (${deckCard(dealt)!.place})`);
  await page.locator('.dlg-opt', { hasText: 'Not yet.' }).click();
});
