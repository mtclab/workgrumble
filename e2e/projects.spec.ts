import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runCommand,
  workUntilMinute,
} from './helpers';

/**
 * The plan surface, on the built artifact (E10, 0.29.0, slice 2).
 *
 * The total walk drives the board through the sysadmin run - it opens, it
 * follows the terminal out to the cutover and back, and its task rows go to the
 * queue. Two states cannot live in that run, and they are the two this file is
 * for, each needing a world the walk is not in:
 *
 *  - THE DESK THAT IS NOT AN ENGINEER'S. The walk's whole point is that it took
 *    the promotion; a player who has not is the other half of the tier gate,
 *    and the house rule about dead ends says the window has to SAY so rather
 *    than be missing.
 *  - THE PROJECT NOBODY WORKED. The walk does the job, so nothing in it is ever
 *    past its date. Slipping is the mechanic the board exists for, and the only
 *    way to see it is a morning where the audit was left alone until after
 *    lunch - which is a different Monday.
 *
 * Both are DIRECTION rather than arithmetic: the exact minute a phase goes red
 * is a deterministic unit test's question (`projects.test.ts`), and a browser
 * asserting one against a fast-forwarded clock is the lesson this project has
 * already paid for once.
 *
 * Seeded the way `msp.spec.ts` seeds an arrival: a switch record in storage, so
 * booting stands the MSP up on its Monday through the code path a real
 * pass-and-accept takes.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A career crossing into the MSP with the standing a promotion needs. */
const ARRIVAL = {
  employer: 'msp',
  career: {
    reputation: 74,
    title: 'IT Support Technician',
    farmFund: 30_000,
    trail: null,
  },
};

async function arriveAtMsp(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
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
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
}

test('the plan surface tells a service-desk player whose work this is', async ({
  page,
}) => {
  await arriveAtMsp(page);

  // The window is there, on a desk that cannot have a project - which is the
  // shipped pattern for a tier-gated APP (Display Properties keeps it too): the
  // gate is on what the window can hold, and the window is where it is said.
  await openFromStartMenu(page, 'projects');

  await expect(page.getByTestId('projects-app')).toBeVisible();
  await expect(page.getByTestId('projects-empty'))
    .toContainText('not service-desk work');
  await expect(page.getByTestId('projects-empty'))
    .toContainText('arrives with the promotion');

  // And nothing about a project is on the screen: no phases, no rule set.
  await expect(page.getByTestId('projects-phases')).toHaveCount(0);
  await expect(page.getByTestId('projects-rules')).toHaveCount(0);
});

test('a phase nobody worked reads as late on the board, in words', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'promotion accept');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Systems Engineer now');

  await openFromStartMenu(page, 'projects');

  // Handed over at nine, due by lunchtime, and not started: the row counts
  // down in working time while there is still a morning to do it in.
  const slack = page.getByTestId('projects-phase-slack-audit');

  await expect(page.getByTestId('projects-now')).toContainText('Now: Audit');
  await expect(slack).toContainText('of working time');
  await expect(page.getByTestId('projects-phase-audit'))
    .not.toHaveAttribute('data-slip', 'late');

  // The whole morning spent on something else. The audit was due by lunchtime
  // and it is twenty past twelve: the number does not stop at zero and the row
  // does not quietly go blank - it turns round and says how far past its date
  // the phase is, which is the warning the mechanic exists for. The MINUTE it
  // turns is a deterministic unit test's question, not a browser's; this asks
  // only that it turned.
  await workUntilMinute(page, 260);

  await expect(slack).toContainText('past its date');
  await expect(page.getByTestId('projects-phase-audit'))
    .toHaveAttribute('data-slip', 'late');
  await expect(page.getByTestId('projects-now')).toContainText('past its date');

  // And it is still workable: a late project is behind, not lost, and the task
  // that would fix it is on the desk with a way into it.
  await expect(page.getByTestId('projects-open-task-arden-fw-audit'))
    .toBeEnabled();
});
