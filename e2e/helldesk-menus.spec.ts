import { expect, type Page, test } from '@playwright/test';

/**
 * Menus: flow and readability (docs/SPEC_MENUS.md), on the served build.
 *
 * Every menu answers the keyboard: the default is focused on open, Enter
 * presses the focused button, the arrows walk the list, Esc does the
 * screen's one safe thing. The title is a main menu with Settings before any
 * game exists. Burnout offers a save to load. Dialogue takes Enter and Esc.
 * The backpack has an app bar. And when you cannot move, a card says why.
 *
 * Real keys and clicks on the real page; the game's own handles only to
 * stage a scene (a manager in front of you) or read a result. Under software
 * rendering the game runs slower than the clock on the wall, so every step
 * waits on the game's own state, never on a fixed number of milliseconds -
 * with one exception: the pause menu ignores an Esc that comes within a
 * quarter of a second of it opening (the press that opened a menu never
 * closes it), so the walk lets that pass before pressing Esc again.
 */

const HELLDESK = '/crawler';
const SETTINGS_KEY = 'workgrumble-helldesk-settings';

// Career starts and a whole meeting under software rendering.
test.describe.configure({ timeout: 240_000 });

interface Actor {
  id: number;
  recruited: boolean;
}

interface Crawler {
  screen: string;
  rootT: number;
  settings: { quality: string };
  actors: Actor[];
  player: { pos: { x: number; z: number } };
  save: { name: string; rep: number; sanity: number; stats: { burnouts: number } };
  dialogue: { open: boolean; close: () => void };
  input: { locked: boolean };
  writeSlotFor: (id: string) => boolean;
}

interface Handles {
  duel: (kind: string, dist: number) => number;
  calm: () => void;
  findPrompt: () => void;
  interact: () => void;
}

type W = Window & { __crawler: Crawler; __helldesk: Handles };

/** A browser that has played before (cheap graphics, no tips, induction done), or with nothing in it at all. */
async function boot(page: Page, fresh = false): Promise<void> {
  // One fixed world per run: the scenes staged in front of the player need open floor.
  await page.addInitScript(() => { Date.now = () => 1_700_000_000_000; });
  await page.goto(HELLDESK);
  await page.evaluate(([fresh, key]) => {
    localStorage.clear();
    if (!fresh) localStorage.setItem(key, JSON.stringify({ quality: 'low', renderScale: 0.3, tips: false, inductionDone: true }));
  }, [fresh, SETTINGS_KEY] as const);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
}

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__crawler.screen);
}

/** New career with the mouse, the induction skipped, Morag's welcome answered. */
async function startCareer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New career' }).click();
  await page.getByLabel('Name on the badge').fill(name);
  await page.getByLabel('Skip the induction').check();
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await page.locator('.dlg-opt').first().click();
  await expect.poll(() => screen(page)).toBe('play');
}

/** Somebody of `kind` in front of you, calm, and E pressed on them (through the game's own handlers). */
async function talkTo(page: Page, kind: string): Promise<number> {
  const id = await page.evaluate((k) => (window as unknown as W).__helldesk.duel(k, 1.6), kind);
  expect(id).toBeGreaterThan(0);
  await page.evaluate(() => {
    const h = (window as unknown as W).__helldesk;
    h.calm();
    h.findPrompt();
    h.interact();
  });
  await expect.poll(() => screen(page)).toBe('dialogue');
  return id;
}

test('keyboard only: title, the form, play, pause and back, the backpack and Character', async ({ page }) => {
  await boot(page);
  // No save yet: New career is the default.
  await expect(page.getByRole('button', { name: 'New career' })).toBeFocused();
  await page.keyboard.press('Enter');

  // The form: the name box has the focus and its text is selected, so typing replaces it.
  await expect(page.getByLabel('Name on the badge')).toBeFocused();
  await page.keyboard.type('Ada Keyboard');
  // Somebody who has done an induction before: skipped by default.
  await expect(page.getByLabel('Skip the induction')).toBeChecked();
  // The rarely-needed choices are folded away.
  await expect(page.locator('details.cg-more')).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');

  // Morag's welcome: the highlighted line has the focus (Space would press it too), and Enter picks it.
  await expect(page.locator('.dlg-opt.is-sel')).toContainText('Clock in');
  await expect(page.locator('.dlg-opt.is-sel')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page)).toBe('play');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.name)).toBe('Ada Keyboard');

  // Esc pauses; Esc resumes.
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('paused');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  // Load from pause: Back has the focus, so two Enters never throw the session away.
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Load game' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-logo')).toHaveText('LOAD');
  await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backpack & Career' })).toHaveCount(0);
  await expect(page.locator('.maker-mark')).toHaveText('Built by MTC Lab');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('play');
  await expect(page.locator('.screen')).toBeHidden();
  // A browser that will not hand the mouse back after Esc: the prompt says how to get it.
  if (!(await page.evaluate(() => (window as unknown as W).__crawler.input.locked))) {
    await expect(page.locator('.hud-prompt')).toContainText('Click to capture the mouse');
  }

  // Tab: the backpack, its app bar focused on Inventory; the arrow and Enter open Character.
  await page.keyboard.press('Tab');
  await expect.poll(() => screen(page)).toBe('os');
  const bar = page.getByTestId('pack-bar');
  await expect(bar.getByRole('button', { name: /Inventory/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bar.getByRole('button', { name: /Character/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.os-window')).toHaveCount(1);
  await expect(page.locator('.os-window .os-title')).toContainText('Character');
  await expect(page.locator('.os-window .os-body')).toContainText('Ada Keyboard');
  // And a number key straight to Help.
  await page.keyboard.press('Digit6');
  await expect(page.locator('.os-window .os-title')).toContainText('Help');

  // Into an app's contents and back: the Control Panel, Down off the bar, Tab through
  // its controls (a list box keeps its own arrows), Up off the top back to the bar.
  await page.keyboard.press('Digit7');
  const panel = page.locator('.os-window .os-body');
  await expect(page.locator('.os-window .os-title')).toContainText('Control Panel');
  await page.keyboard.press('ArrowDown');
  await expect(panel.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // Tab walks; it does not close the backpack any more.
  expect(await screen(page)).toBe('os');
  await expect(page.locator('.os :focus')).toHaveCount(1);
  // Back past the first control (a list box: its arrows are its own) to the window's close box, and Up to the bar.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.os-window .os-x')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(bar.getByRole('button', { name: /Control Panel/ })).toBeFocused();

  // A binding answered from the keyboard: a held Enter does not bind Enter,
  // and the focus comes back to the binding after the redraw.
  const right = panel.locator('[data-action="right"]');
  await right.focus();
  // A second down without an up is a key-repeat (Playwright sends it as one).
  await page.keyboard.down('Enter');
  await expect(right).toHaveText('press a key…');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(right).toHaveText('press a key…');
  await page.keyboard.press('KeyL');
  await expect(panel.locator('[data-action="right"]')).toHaveText('L');
  await expect(panel.locator('[data-action="right"]')).toBeFocused();
  // Reset keys keeps the focus too.
  await panel.locator('[data-reset="keys"]').focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('[data-action="right"]')).toHaveText('D');
  await expect(panel.locator('[data-reset="keys"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('play');
});

test('burnout: Load game lands in the save that was loaded, and Back does not burn you out twice', async ({ page }) => {
  await boot(page);
  await startCareer(page, 'Bea Burnout');
  await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    g.save.rep = 1000;
    g.writeSlotFor('slot1');
  });
  await page.evaluate(() => { (window as unknown as W).__crawler.save.sanity = 0; });
  await expect.poll(() => screen(page)).toBe('dead');
  await expect(page.locator('.title-logo')).toHaveText('BURNOUT');
  await expect(page.getByRole('button', { name: /Clock back in/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Title screen' })).toBeVisible();
  const paid = await page.evaluate(() => (window as unknown as W).__crawler.save.rep);
  expect(paid).toBeLessThan(1000);

  // To the load menu and back: the same burnout, not a second one.
  await page.getByRole('button', { name: 'Load game' }).click();
  await expect(page.locator('.title-logo')).toHaveText('LOAD');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.title-logo')).toHaveText('BURNOUT');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.rep)).toBe(paid);
  expect(await page.evaluate(() => (window as unknown as W).__crawler.save.stats.burnouts)).toBe(1);

  await page.getByRole('button', { name: 'Load game' }).click();
  await page.getByRole('button', { name: /^Slot 1:/ }).click();
  await expect.poll(() => screen(page)).toBe('play');
  const s = await page.evaluate(() => {
    const g = (window as unknown as W).__crawler;
    return { name: g.save.name, rep: g.save.rep, burnouts: g.save.stats.burnouts, sanity: g.save.sanity };
  });
  // The save from before the burnout: its Rep and its record, whole.
  expect(s).toMatchObject({ name: 'Bea Burnout', rep: 1000, burnouts: 0 });
  expect(s.sanity).toBeGreaterThan(0);
});

test('dialogue: Esc walks away where that costs nothing; Enter picks the highlighted line', async ({ page }) => {
  await boot(page);
  await startCareer(page, 'Dee Dialogue');

  // A colleague from the IT Crowd: "Come with me" first, "Not now." last.
  const id = await talkTo(page, 'helper');
  await expect(page.locator('.dlg-opt.is-sel')).toContainText('Come with me');
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('play');
  const recruited = (): Promise<boolean> => page.evaluate((i) => (window as unknown as W).__crawler.actors.find((a) => a.id === i)?.recruited ?? false, id);
  // Walked away: nobody was recruited.
  expect(await recruited()).toBe(false);

  // Again, and this time Enter: the highlighted line, and what it does.
  await page.evaluate(() => {
    const h = (window as unknown as W).__helldesk;
    h.calm();
    h.findPrompt();
    h.interact();
  });
  await expect.poll(() => screen(page)).toBe('dialogue');
  await expect(page.locator('.dlg-opt.is-sel')).toContainText('Come with me');
  // A cursor that only reappears over another line does not move the highlight.
  await page.evaluate(() => {
    const opts = document.querySelectorAll('.dlg-opt');
    opts[opts.length - 1]?.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 0, bubbles: true }));
  });
  await expect(page.locator('.dlg-opt.is-sel')).toContainText('Come with me');
  await page.keyboard.down('Enter');
  await expect.poll(recruited).toBe(true);
  // Enter still held: its repeats press nothing - the reply stays up until a new press.
  await expect(page.locator('.dlg-opt.is-sel')).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(await screen(page)).toBe('dialogue');
  // Their reply: one line, which Enter (or Esc) closes.
  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page)).toBe('play');
});

test('a fresh browser: Settings from the title, a change kept, and the career starts with it', async ({ page }) => {
  await boot(page, true);
  // Nothing saved: nothing to continue or load, but Settings and Controls & help are there.
  await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load game' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.getByTestId('settings-panel');
  await expect(panel).toBeVisible();
  // The Control Panel's settings, minus resigning from a career that does not exist.
  await expect(panel.getByRole('button', { name: /Resign/ })).toHaveCount(0);
  await panel.getByLabel('Quality').selectOption('low');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.quality)).toBe('low');
  expect(await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { quality?: string }).quality, SETTINGS_KEY)).toBe('low');
  // Esc closes the panel and gives the focus back to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();

  // Controls & help: the essentials, Space for jump among them.
  await page.getByRole('button', { name: 'Controls & help' }).click();
  await expect(page.getByTestId('controls-grid')).toContainText('Space');
  await expect(page.getByTestId('controls-grid')).toContainText('jump');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('controls-panel')).toHaveCount(0);

  await startCareer(page, 'Fay Fresh');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.quality)).toBe('low');
  // And the next visit too.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New career' })).toBeVisible({ timeout: 120_000 });
  expect(await page.evaluate(() => (window as unknown as W).__crawler.settings.quality)).toBe('low');
});

test('a meeting roots you: the card says why, W pulses it, and it goes when you can move again', async ({ page }) => {
  await boot(page);
  await startCareer(page, 'Mo Meeting');
  await talkTo(page, 'manager');
  // Esc does nothing here: saying no to a manager is not walking away.
  await page.keyboard.press('Escape');
  expect(await screen(page)).toBe('dialogue');
  expect(await page.evaluate(() => (window as unknown as W).__crawler.rootT)).toBe(0);
  await expect(page.locator('.dlg-opt.is-sel')).toContainText('Accept the meeting');
  await page.keyboard.press('Enter');
  await expect(page.locator('.dlg-text')).toContainText('Great sync');
  // The manager's parting line: Esc walks away from it.
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('play');

  const card = page.getByTestId('rooted-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('In a meeting');
  const pos = (): Promise<{ x: number; z: number }> => page.evaluate(() => {
    const p = (window as unknown as W).__crawler.player.pos;
    return { x: p.x, z: p.z };
  });
  const start = await pos();
  const pulses = await card.getAttribute('data-pulses');

  // W, held: the card pulses (the press was heard) and nobody moves while it is up.
  await page.keyboard.down('KeyW');
  await expect.poll(() => card.getAttribute('data-pulses')).not.toBe(pulses);
  const during = await pos();
  if (await page.evaluate(() => (window as unknown as W).__crawler.rootT) > 0) {
    expect(Math.hypot(during.x - start.x, during.z - start.z)).toBeLessThan(0.05);
  }

  // The arrow keys walk too, so they are heard too.
  const afterW = await card.getAttribute('data-pulses');
  await page.keyboard.press('ArrowLeft');
  if (await page.evaluate(() => (window as unknown as W).__crawler.rootT) > 0) {
    await expect.poll(() => card.getAttribute('data-pulses')).not.toBe(afterW);
  }

  // The meeting ends: the card goes, and the held W walks.
  await expect(card).toBeHidden({ timeout: 120_000 });
  expect(await page.evaluate(() => (window as unknown as W).__crawler.rootT)).toBe(0);
  await expect.poll(async () => {
    // A staffing call waits for the end of a meeting before it rings; it is another spec's business.
    await page.evaluate(() => {
      const g = (window as unknown as W).__crawler;
      if (g.dialogue.open) g.dialogue.close();
    });
    const now = await pos();
    return Math.hypot(now.x - start.x, now.z - start.z);
  }, { timeout: 60_000 }).toBeGreaterThan(0.3);
  await page.keyboard.up('KeyW');
});
