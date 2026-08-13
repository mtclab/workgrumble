import { expect, type Page, test } from '@playwright/test';

import { completeLogin, openFromStartMenu } from './helpers';

/**
 * THE START SELECT, on the built artifact (E9, 0.35.0 slice B, #58).
 *
 * D1 said the title you are hired at IS the difficulty select, and the only
 * place that claim can be checked is the shipped boot: the world is stood up
 * before the log-on box exists, so taking a job other than the standard one
 * writes the pick down and starts the machine again. Every one of those moves
 * is wiring, and wiring is where the lies live (0.6.0's switch taught this
 * version family that lesson) - so this walks it as a player does, through the
 * real screens, and asserts the WORLD on the other side rather than the click.
 *
 * Authored for the box run (specs are written here, not run here); it is part
 * of the version's single box cycle.
 */

const START_KEY = 'workgrumble/start';
const SWITCH_KEY = 'workgrumble/switch';
const PLAYER = 'person:pat';

/** What the world says about the player, read off the shipped debug handle. */
async function playerField(page: Page, field: string): Promise<unknown> {
  return page.evaluate(
    ([node, name]) => globalThis.careerSim?.field(node, name) ?? null,
    [PLAYER, field] as [string, string],
  );
}

/** Boot a browser that has never played before: the one boot that hires. */
async function freshBoot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const boot = page.getByTestId('boot-screen');

  if (await boot.isVisible()) {
    await page.keyboard.press('Space');
  }

  await expect(page.getByTestId('login-screen')).toBeVisible();
}

test('the log-on box offers the whole ladder, and only the built rungs', async ({
  page,
}) => {
  await freshBoot(page);

  const desk = page.getByTestId('login-desk');

  await expect(desk).toBeVisible();

  // Seven rungs, because the ladder IS the difficulty scale: a select holding
  // the two that are written would teach a player this game has two
  // difficulties rather than a career with five rungs still to come.
  await expect(desk.locator('option')).toHaveCount(7);
  await expect(desk.locator('option:not([disabled])')).toHaveCount(2);
  await expect(desk.locator('option[value="sd_junior"]')).toBeEnabled();
  await expect(desk.locator('option[value="systems_engineer"]')).toBeEnabled();
  await expect(desk.locator('option[value="architect"]')).toBeDisabled();

  // The standard desk is the one already selected, so a player who reads none
  // of this and presses Log on gets the game they have always got.
  await expect(desk).toHaveValue('sd_junior');

  // And the line under it says what the rung changes about the WORK, which is
  // the honest description of what picking it does.
  await expect(page.getByTestId('login-desk-note')).toContainText('KB');

  await desk.selectOption('architect');
  await expect(page.getByTestId('login-desk-note'))
    .toContainText('not written yet');
});

test('the standard desk logs straight on, at the probation shop', async ({
  page,
}) => {
  await freshBoot(page);

  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();

  // No reload, no ceremony: the world this browser booted IS the junior start.
  await expect(page.getByTestId('desktop')).toBeVisible();
  expect(await playerField(page, 'player_tier')).not.toBe('systems_engineer');
  expect(await playerField(page, 'title'))
    .toBe('IT Support Technician (probationary)');
});

test('taking the engineer\'s desk starts the career already promoted', async ({
  page,
}) => {
  await freshBoot(page);

  await page.getByTestId('login-desk').selectOption('systems_engineer');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();

  // The pick rebuilds the world, so the machine starts again and arrives at the
  // new starter's ceremony with the shop's name on it - the same screen an
  // employer switch has played since 0.6.0.
  await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 30_000 });

  // Second time round this browser is carrying a career, so there is no job to
  // offer: the select is gone.
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);

  await completeLogin(page);

  // THE JOB, not the lanyard. The tier is crossed, the title is the engineer's,
  // and the shop is the MSP.
  expect(await playerField(page, 'player_tier')).toBe('systems_engineer');
  expect(await playerField(page, 'title')).toBe('Systems Engineer');

  // And the engineer's own work is on the desk: the marquee incident the
  // promotion raises is raised for a player hired straight onto the tier too.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-syseng-first-incident'))
    .toBeVisible({ timeout: 30_000 });
});

test('a browser already carrying a career is not offered a job', async ({
  page,
}) => {
  // An arrival at a second employer is a career in flight, not a hire. The
  // select must not appear over it - the shop has already been decided, and a
  // difficulty picker on that screen would be a button that lies.
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, {
      employer: 'bodgeworth',
      career: {
        reputation: 82,
        title: 'IT Support Technician',
        farmFund: 25_000,
        trail: null,
      },
    }] as [string, unknown],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  await expect(page.getByTestId('desktop')).toBeVisible();
  // Reached the desk without the select ever being on screen.
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);
});

test('a rung nobody has written is refused, however it got into storage', async ({
  page,
}) => {
  // The greying on the option is manners; this is the rule. A hand-edited slot
  // naming an unbuilt rung must not stand up a world that calls somebody an
  // architect and deals them a probationer's week - it reads as no pick at all,
  // which is the standard desk.
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [START_KEY, { rung: 'architect' }] as [string, unknown],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  expect(await playerField(page, 'title'))
    .toBe('IT Support Technician (probationary)');
  expect(await playerField(page, 'player_tier')).not.toBe('systems_engineer');
});
