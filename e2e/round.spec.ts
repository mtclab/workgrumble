import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runToDayEnd,
} from './helpers';

/**
 * Slice 0.2.7 on the built artifact, which is a week where NOTHING is
 * happening - and that is the whole test.
 *
 * The systemic layer is a career-layer system: the pacing rules put the first
 * piece of weather no earlier than the fourth week of an employer arc, and the
 * shipped game deals week one. So what a player can reach today is the quiet
 * state, and the quiet state has two jobs that are worth a test each.
 *
 * The first is legibility BEFORE the fact. A player who has never seen a round
 * has to know that rounds are a thing and that this is not one, or the first
 * announcement lands as a mechanic somebody sprang rather than as a season
 * turning. The screens say so, every day, in three places.
 *
 * The second is the negative half of the four-beat contract, and it is the one
 * that would go wrong silently: the announcement mail must NOT be in this
 * week's inbox. It is gated on a field the world does not carry in a quiet
 * week, and a build that seeded that field would put a redundancy notice in
 * front of somebody on their first Monday - which is the exact failure the
 * gate exists to forbid, and which no unit test can see on the artifact.
 *
 * The season itself - four beats, a matrix, a ranking and a third ending - is
 * driven end to end through the real driver and the real engine in
 * `src/shell/scripted-arc.test.ts`, on the week of the arc it belongs to.
 */

async function startShift(page: Page): Promise<void> {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await page.getByTestId('close-brief').click();
  await page.getByTestId('day-speed-4').click();
}

test('the probation week says which week of a career it is, and that it is quiet', async ({
  page,
}) => {
  await startShift(page);

  await openFromStartMenu(page, 'review');
  const review = page.getByTestId('review-app');

  // Week one of the arc, and no beat of any season live in it. Both are on
  // the window rather than inferred, because the arc week is also a line on
  // the matrix - length of service - and a player is owed the number that
  // decides things about them.
  await expect(review).toHaveAttribute('data-arc-week', '1');
  await expect(review).toHaveAttribute('data-beat', 'none');

  // And the sentence, which says what is not happening and what would be
  // decided if it were.
  const pressure = page.getByTestId('review-pressure');
  await expect(pressure).toContainText('Nothing is being proposed');
  await expect(pressure).toContainText('no round on');
  await expect(pressure).toContainText('the mark and the file alone');
});

test('there is no announcement in the inbox on the first Monday', async ({
  page,
}) => {
  await startShift(page);
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-app')).toBeVisible();

  // The two threads the season arrives as, both absent, because the fields
  // they are gated on are not in a quiet week's world at all. Absent rather
  // than empty: an inbox that showed the round and said it was not on would
  // be worse than one that showed nothing.
  await expect(page.getByTestId('mail-row-round-notice')).toHaveCount(0);
  await expect(page.getByTestId('mail-row-round-weather')).toHaveCount(0);

  // The post that IS there is the post that was always there, so the absence
  // above is a gate rather than a broken inbox.
  await expect(page.getByTestId('mail-row-onboarding')).toBeVisible();
  await expect(page.getByTestId('mail-row-queue-nag')).toBeVisible();
});

test('the evening scorecard says the same thing about the round', async ({
  page,
}) => {
  await startShift(page);
  await runToDayEnd(page);

  await expect(page.getByTestId('scorecard-app')).toBeVisible();
  // Beside the mark and the file, every evening, for the same reason both of
  // those are there: a thing first seen at the verdict is a thing nobody
  // could have played toward.
  await expect(page.getByTestId('scorecard-round'))
    .toContainText('Nothing is being proposed');
});
