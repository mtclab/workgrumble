import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runSimMinutes,
  underPause,
} from './helpers';

/**
 * Week two at the same desk, on the built artifact (E11, 0.34.0 slice 1).
 *
 * `week.spec.ts` walks the whole chain in one session - a week worked, the
 * Friday passed, the stay pressed, and the Monday that follows - because the
 * 0.6.0 lesson is that a world transition has to be driven through the door a
 * player presses. THIS file is the other half: what week two IS once you are in
 * it, which that walk cannot ask without playing a second full week.
 *
 * The arrival is seeded the way the shell itself seeds one, and exactly as
 * `employer-switch.spec.ts` seeds Bodgeworth: a record in the switch slot, which
 * is what `stayAnotherWeek` writes on its way out. The only difference between
 * the two records is the two fields that make this a STAY rather than a switch -
 * the arc week it is arriving into, and what the building kept - so booting with
 * one in place drives the shipped arrival path rather than a fixture.
 *
 * Authored for the box run (specs are written, not run here); it is part of the
 * version's single box cycle.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** The note by the socket: the probation shop's one declared estate fact. */
const PRINT_SERVER = 'machine:print-warehouse';

/**
 * A week one that was passed, worked in on, and left a mark on the building:
 * Facilities came with a marker, and there is a toy on the machine.
 */
const STAYING = {
  employer: 'workgrumble',
  career: {
    reputation: 71,
    title: 'IT Support Technician',
    farmFund: 31_500,
    trail: null,
    tier: 'service_desk',
  },
  arcWeek: 2,
  estate: [{ node: PRINT_SERVER, field: 'sticky_note', value: true }],
  installed: ['arcade'],
};

/** Seed the stay record, then boot: the shell stands week two up on Monday. */
async function arriveInWeekTwo(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, STAYING] as [string, typeof STAYING],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
}

test('week two is a Monday at the same shop, and not the same Monday', async ({
  page,
}) => {
  await arriveInWeekTwo(page);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // The same building: the probation estate, the probation rooms, the lead who
  // still pings. Nothing about the world says a change of employer happened.
  await openFromStartMenu(page, 'hubbub');
  await expect(page.getByTestId('hubbub-channel-helpdesk')).toBeVisible();

  // And not the same Monday. The probation week opens on the two tickets every
  // new starter gets - the locked account and the rotated screen - and week two
  // is drawn, so it opens on something else. This is the assertion that reds if
  // the seam stops keying composition on the arc position, and the one that
  // reds if the Monday pile goes back to being spawned off the shop's authored
  // week while the driver deals a different one.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-locked-account')).toHaveCount(0);
  await expect(page.getByTestId('ticket-row-rotated-screen')).toHaveCount(0);
  await expect(page.getByTestId('tickets-empty')).toHaveCount(0);
});

test('the building kept what it was told to keep, and nothing else', async ({
  page,
}) => {
  await arriveInWeekTwo(page);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // REBUILT, read FIRST and with the day held: the fresh-morning claim is a
  // minute read, and every await below this line spends the minutes it would
  // be claiming about (the standing faked-clock rule - the arrival walk
  // above already cost an hour of drift on the first box run).
  await underPause(page, async () => {
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^0[89]:/);
  });

  // CARRIED, and visible on the desktop: the toy that was installed last week
  // is installed this week. It is app state rather than world state, so it
  // rides the arrival record rather than the estate whitelist - and it is the
  // carried fact a player can actually SEE.
  await expect(page.getByTestId('desktop-icon-arcade')).toBeVisible();

  // CARRIED, and in the world: the DO NOT UNPLUG note by the socket in the
  // warehouse corridor. Facilities came with a marker and did not come back
  // over the weekend to take it off. Read off the GRAPH rather than off a
  // screen, because there is no screen: a repair to a building is world state
  // by design, and the one thing a journey can do about that is ask the world.
  expect(await page.evaluate(
    ([node, field]) => globalThis.careerSim?.field(node, field) ?? null,
    [PRINT_SERVER, 'sticky_note'] as [string, string],
  )).toBe(true);

  // And the week climbed: the arc position is the field the redundancy round
  // reads and the field a load resolves the week from.
  expect(await page.evaluate(
    () => globalThis.careerSim?.field('person:pat', 'arc_week') ?? null,
  )).toBe(2);

  // REBUILT: the verdict and the ledger. A whitelist that carried the world
  // wholesale would pass everything above and fail everything here. (The
  // clock's own fresh-morning read moved to the top of the walk, held.)
  await openFromStartMenu(page, 'weekend');
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'pending');
  // Nothing arrived and nothing closed yet - a fresh week's ledger rather than
  // last week's carried across.
  await expect(page.getByTestId('weekend-closed')).toHaveText('0');
  await expect(page.getByTestId('weekend-breached')).toHaveText('0');

  // And the career DID carry, which is the half that is not the estate.
  await openFromStartMenu(page, 'scorecard');
  await expect(page.getByTestId('scorecard-farm-total')).toContainText('315.00');
});

/**
 * The 0.31.0 defect class, now reachable.
 *
 * A save carries a world; the week beside it is resolved from the employer, the
 * attempt and the arc position. While every session was week one, all three had
 * one answer and a load could not get it wrong. Now the third one moves - and a
 * load that resolved the week from the employer alone would put this Wednesday
 * morning into week one, with nothing thrown and a queue nobody was dealt.
 */
test('a save taken in week two reloads into week two', async ({ page }) => {
  await arriveInWeekTwo(page);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await runSimMinutes(page, 120);

  await openFromStartMenu(page, 'tickets');
  const queue = await page.getByTestId('tickets-summary').textContent();
  const world = await page.evaluate(() => globalThis.careerSim?.hash() ?? '');

  expect(world).not.toBe('');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  // A reload boots a NEW session - and the stay record has been let go of by
  // now, so this one comes back off the save file rather than off the arrival.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  // The same world to the byte, and the same queue on the screen: week two came
  // back as week two.
  expect(await page.evaluate(() => globalThis.careerSim?.hash() ?? '')).toBe(world);

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('tickets-summary')).toHaveText(queue ?? '');
  await expect(page.getByTestId('ticket-row-locked-account')).toHaveCount(0);
});
