import { test } from '@playwright/test';

import { logIn, openFromStartMenu } from './helpers';

// Overseer visual-review captures - not assertions. Screenshots land in
// test-results/visual/ and are eyeballed by a human/model reviewer.
test('captures shell states for visual review', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-results/visual/01-boot.png' });

  await logIn(page);
  await page.screenshot({ path: 'test-results/visual/02-desktop.png' });

  await openFromStartMenu(page, 'about');
  // Nine apps wrap the icon grid under the cascade area - launch the second
  // window from the start menu instead of a possibly covered desktop icon.
  await openFromStartMenu(page, 'bubbles');
  await page.screenshot({ path: 'test-results/visual/03-two-windows.png' });

  await page.getByTestId('start-button').click();
  await page.screenshot({ path: 'test-results/visual/04-start-menu.png' });
  await page.keyboard.press('Escape');

  await page.keyboard.press('Backquote');
  await page.screenshot({ path: 'test-results/visual/05-boss-key.png' });
});

test('captures helpdesk apps for visual review', async ({ page }) => {
  await logIn(page);

  await openFromStartMenu(page, 'tickets');
  await page.screenshot({ path: 'test-results/visual/06-tickets-queue.png' });
  await page.getByTestId('ticket-row-locked-account').click();
  await page.screenshot({ path: 'test-results/visual/07-ticket-detail.png' });

  await openFromStartMenu(page, 'directory');
  await page.screenshot({ path: 'test-results/visual/08-directory.png' });

  await openFromStartMenu(page, 'cmd');
  await page.getByTestId('cmd-input').fill('help');
  await page.keyboard.press('Enter');
  await page.screenshot({ path: 'test-results/visual/09-cmd.png' });
});

test('captures the day surfaces', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await page.screenshot({ path: 'test-results/visual/15-morning-brief.png' });
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('day-speed-4').click();
  await page.screenshot({ path: 'test-results/visual/16-shift-taskbar.png' });
});

test('captures the chat, mail, KB and remote surfaces', async ({ page }) => {
  await logIn(page);

  // Remote Assist on the machine whose screen is sideways: this capture is
  // the one that shows whether the signature gag reads at all.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-ada').click();
  await page.screenshot({ path: 'test-results/visual/10-remote-rotated.png' });

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print').click();
  await page.screenshot({ path: 'test-results/visual/11-remote-services.png' });

  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();
  await page.getByTestId('chat-option-1').click();
  await page.screenshot({ path: 'test-results/visual/12-chat.png' });

  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-queue-nag').click();
  await page.screenshot({ path: 'test-results/visual/13-mail.png' });

  await openFromStartMenu(page, 'kb');
  await page.getByTestId('kb-row-print-spooler').click();
  await page.screenshot({ path: 'test-results/visual/14-kb.png' });
});
