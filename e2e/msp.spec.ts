import { expect, type Page, test } from '@playwright/test';

import {
  clockOffFor,
  completeLogin,
  focusWindow,
  openFromStartMenu,
  resolvedToast,
  runCommand,
  runSimMinutes,
  workUntilMinute,
  SHIFT_MINUTES,
} from './helpers';

/**
 * The MSP employer, on the built artifact (0.8.0 + 0.9.0, E5 #26/#27).
 *
 * The MSP arc is proven at the unit level through the real dispatch path
 * (msp-scope.test.ts, monitor.test.ts), but nothing walked it through the SHELL
 * - the browser never reaches the third employer, so the board's mount and the
 * scope refusal had no shipped-path coverage. This closes that: arrive at the
 * MSP, see the monitoring board stand up with a monitoring-only customer's
 * watched things on it, and confirm a FIX at that customer is refused by the
 * real terminal - the 0.8.0 scope mechanic and the 0.9.0 board, on the artifact.
 *
 * Seeded the way the shell seeds an arrival: a switch record in storage (the
 * key the offer-accept writes), so booting stands the MSP up on its Monday -
 * the same code path a real pass-and-accept takes.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A career crossing into the MSP with standing intact. */
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
  // Every day-advancing spec installs the fake clock before boot.
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

test('the monitoring board stands up at the MSP with a customer on it', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'monitor');

  // The board mounted through the real shell, and it is the monitoring-only
  // customer's surface: its watched things are listed, read off the estate.
  await expect(page.getByTestId('monitor-app')).toBeVisible();
  await expect(page.getByTestId('monitor-contract'))
    .toContainText(/eyes on glass|contract/i);
  await expect(page.getByTestId('monitor-row-customer:northwind:backup'))
    .toBeVisible();
  await expect(page.getByTestId('monitor-row-customer:northwind:cert'))
    .toBeVisible();
  await expect(page.getByTestId('monitor-row-customer:northwind:disk'))
    .toBeVisible();
});

test('a fix at the monitoring-only customer is refused by the terminal', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');
  // A Windows fix verb aimed at the monitoring-only customer's box: the
  // contract is notify-and-escalate, not remediate, and the terminal says so.
  await runCommand(page, 'restart NW-SRV-01\\Spooler');

  await expect(page.getByTestId('cmd-output'))
    .toContainText(/monitoring-only|notify-and-escalate|not.*remediate/i);
});

test('an out-of-scope server action names the change-request path, and one files', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // FONTAINE-LAW is a helpdesk contract: a server is out of the day-to-day
  // scope, but - unlike monitoring-only - it is work a change request can
  // authorise, so the refusal names the path rather than being a dead end.
  await runCommand(page, 'restart FONT-FILE-01\\Spooler');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/change request|changereq/i);

  // Filing one is a real verb through the real terminal, and it then reads back
  // on the board of requests, under review.
  await runCommand(page, 'changereq file FONT-FILE-01\\Spooler');
  await runCommand(page, 'changereq list');
  await expect(page.getByTestId('cmd-output')).toContainText('FONT-FILE-01');
});

test('a co-managed customer needs coordination before you act', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // ARDEN-MFG is co-managed: their own IT owns the box. A unilateral server
  // touch is caught and names the coordinate path, not a dead end.
  await runCommand(page, 'restart ARDEN-SRV-01\\W3SVC');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/co-managed|notify|coordinat|unilateral|RACI/i);

  // Notifying their IT files the coordination notice through the real terminal
  // - the coordinate step the tier turns on. That this notice then clears the
  // action (coordinate-then-act) is proven end to end in msp-scope.test.ts.
  await runCommand(page, 'notify ARDEN-SRV-01\\W3SVC');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/coordinat|their (own )?IT|noted|ARDEN/i);
});

test('a fully-managed customer has no server scope wall', async ({ page }) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // HOLLOWAY-ACCT is fully-managed: the MSP is the whole IT department, so a
  // server action carries none of the helpdesk contract's "not your servers"
  // wall - the exact restart refused at a helpdesk customer is in scope here.
  await runCommand(page, 'restart HOLL-SRV-01\\Dfs');
  await expect(page.getByTestId('cmd-output'))
    .not.toContainText('Servers are not in this contract');
});

test('a ticket wears its customer SLA tier', async ({ page }) => {
  await arriveAtMsp(page);

  // The queue names each MSP ticket's customer and its SLA tier, so the player
  // can triage by it - a Gold customer's clock is tighter than a Bronze one's.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByText(/\((Gold|Silver|Bronze)\)/).first())
    .toBeVisible();
});

test('an on-call page fires overnight and surfaces in the brief (E6, 0.17.0)', async ({
  page,
}) => {
  await arriveAtMsp(page);

  // On-call is the engineers' tier: take the promotion first (the arrival's
  // standing is above the bar). Accepting raises the first incident too; we let
  // it sit and walk the week to the on-call night.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'promotion accept');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Systems Engineer now');

  // Monday out; Tuesday is the on-call night - clocking off it pages a real fire
  // (nginx down on the company box), which surfaces on the Wednesday brief.
  await clockOffFor(page, 1);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await clockOffFor(page, 2);

  // The Wednesday brief carries the page: a real fire, named, with the one
  // convenience the surface offers - a way to the terminal where the fix lives.
  await expect(page.getByTestId('brief-pages')).toBeVisible();
  await expect(page.getByTestId('brief-pages-list'))
    .toContainText(/reverse proxy|FC-RMM-01|real fire/i);
  await expect(page.getByText('Open the terminal').first()).toBeVisible();
});

/**
 * The onboarding capstone on the built artifact (0.13.0, E5 #31).
 *
 * The event, the audit and the horror are proven at the unit level through the
 * real driver and terminal (onboarding.test.ts); this walks the shipped SHELL to
 * the day it fires - the browser reaches the third employer only by arriving at
 * it, and only mid-week does the client sign. Work Monday and Tuesday, open the
 * Wednesday shift, cross ten o'clock, and the customer that was not in the world
 * at boot is now on the wire: `audit customer:tillman` enumerates the estate
 * nobody documented and surfaces the backup that is green and empty.
 */
test('the mid-week onboarding stands a customer up and discovery finds the horror', async ({
  page,
}) => {
  await arriveAtMsp(page);

  // arriveAtMsp opens the Monday shift; run it to its end and clock off (the
  // loop-until-day_end helper, not a hardcoded shift length - the arrival spends
  // clock), then do the Tuesday, to reach the Wednesday the client signs on.
  await clockOffFor(page, 1);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await clockOffFor(page, 2);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // The shift opens at 09:00; the client signs at 10:00 and the discovery ticket
  // lands at 10:20. Run past both.
  await runSimMinutes(page, 100);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'audit customer:tillman');

  const output = page.getByTestId('cmd-output');
  // The map the handover did not come with: the real estate, off the wire.
  await expect(output).toContainText('TILLMAN-FREIGHT');
  await expect(output).toContainText('TILL-SRV-01');
  // And the horror, read off the estate node: a backup reporting success it
  // cannot restore from.
  await expect(output).toContainText('failing silently');
});

/**
 * The creative vertical on the built artifact (0.32.0, E5 slice 2).
 *
 * MARLOWE-STUDIO is in the world from Monday boot, so the estate half needs no
 * clock: the Macs answer on the wire, the Windows tools refuse them BY NAME
 * (lane A's family rule, on a customer's estate rather than in a fixture), and
 * the licensing verb refuses a plan with no seat in it. All through the real
 * terminal, on the real artifact.
 */
test('the studio\'s Macs answer, refuse the Windows tools, and have no spare seat', async ({
  page,
}) => {
  await arriveAtMsp(page);
  await openFromStartMenu(page, 'cmd');

  const output = page.getByTestId('cmd-output');

  // A Mac is a box on the wire like any other: ping reaches it.
  await runCommand(page, 'ping MARL-WS-01');
  await expect(output).toContainText(/Reply from|bytes/i);

  // And the Windows service tools refuse it truthfully, naming the family and
  // what would actually reach it - not RDP, and not sc.
  await runCommand(page, 'restart MARL-WS-01\\Spooler');
  await expect(output).toContainText(/Mac|Screen Sharing/i);

  // The studio is fully-managed, so this is not a scope wall: the desk MAY
  // administer their licensing, and the refusal is the plan's arithmetic.
  await runCommand(page, 'licence give lvasquez');
  await expect(output).toContainText('no free seats');
});

/**
 * And the journey, walked: the ticket the Mac vertical opens on is closed the
 * only way it can be - by talking somebody through a click the desk is not
 * allowed to make.
 *
 * Wednesday afternoon, because that is where the week deals it. The reply is
 * dispatched from a CONVERSATION, which is the only surface that reaches
 * `ticket.reply_to_reporter` at all - the thing 0.32.0 found the dental access
 * review had never had - so this walk is also the shipped-path proof that the
 * option exists and closes what it claims to.
 */
test('the black-screen ticket closes on the walkthrough, from the chat window', async ({
  page,
}) => {
  await arriveAtMsp(page);

  // Monday and Tuesday out, then open the Wednesday and run past the drip at
  // 14:20 - far enough past it to clear the arrival jitter either way.
  await clockOffFor(page, 1);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await clockOffFor(page, 2);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await workUntilMinute(page, 15 * 60 - 8 * 60);

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-marlowe-screen-recording').click();

  /*
   * The fault, LOOKED AT (#55, 0.33.0), before it is talked through.
   *
   * This is the fiction hole 0.32.0 named and left open: the ticket closes
   * from a chat window, so nothing made anybody open the viewer - and if they
   * had, they would have been shown a Windows desktop, complete with a Recycle
   * bin, on a Mac that is supposed to be showing them nothing at all. The
   * viewer reads the consent now, so the reporter's description and the
   * player's screen finally agree.
   */
  // Corin's box, picked by hand: the ticket's reporter is the studio MANAGER,
  // whose own Mac is fine, and the machine the fault is on is the designer's -
  // which is the shape of the ticket and the reason the link does not aim
  // there.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-marl-ws-01').click();
  await expect(page.getByTestId('remote-hostname')).toHaveText('MARL-WS-01');
  await expect(page.getByTestId('remote-viewport'))
    .toHaveAttribute('data-blackout', 'true');
  await expect(page.getByTestId('remote-blackout'))
    .toContainText('The screen is black');

  // And nothing else is on it. Not the Windows furniture that used to be, and
  // not the Mac face either: a blackout drawn over a dock silhouette would be
  // this window showing a screen it has just said it cannot see.
  await expect(page.getByTestId('remote-desktop-icons')).toHaveCount(0);
  await expect(page.getByTestId('remote-start')).toHaveCount(0);
  await expect(page.getByTestId('remote-dock')).toHaveCount(0);
  await expect(page.getByTestId('remote-menu-bar')).toHaveCount(0);

  await focusWindow(page, 'tickets');

  // The conversation with the studio manager, opened off the ticket the way a
  // player reaches it.
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Rosa Marlowe');
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('black square');

  // The option that does the job rather than promising it: the walkthrough,
  // sent. Nothing on the estate changes and the ticket closes, because the
  // deliverable was always the sentence.
  await page.getByTestId('chat-options')
    .getByRole('button', { name: /Privacy & Security, Screen/ })
    .click();
  await expect(resolvedToast(page)).toHaveCount(1);
});

test('the network toolbox diagnoses the downed portal over ssh (E6, 0.16.0)', async ({
  page,
}) => {
  // The 0.16.0 surface on the shipped path: promote, ssh to the MSP\'s own box
  // (the portal is down there), and READ it with the network commands before the
  // 0.15.0 restart - ss shows the port unheld, curl shows nginx 502ing on its
  // dead upstream, and the not-installed netstat refuses with the apt hint.
  await arriveAtMsp(page);
  await openFromStartMenu(page, 'cmd');

  await runCommand(page, 'promotion accept');
  const output = page.getByTestId('cmd-output');
  await expect(output).toContainText('Systems Engineer now');

  await runCommand(page, 'ssh pat@FC-RMM-01');
  await expect(page.locator('.cmd-prompt').first()).toHaveText('pat@FC-RMM-01:~$');

  // ss: the listeners in the real shape. nginx holds its ports; the failed
  // portal\'s 8000 upstream is honestly absent - the not-listening diagnosis.
  await runCommand(page, 'ss -tlnp');
  await expect(output).toContainText('Local Address:Port');
  await expect(output).toContainText('*:22');

  // netstat is NOT installed - the refusal that teaches ss as canonical.
  await runCommand(page, 'netstat -tlnp');
  await expect(output).toContainText('sudo apt install net-tools');

  // curl: nginx answers but 502s, because the app it proxies to is down.
  await runCommand(page, 'curl -I http://localhost');
  await expect(output).toContainText('502');
  await expect(output).toContainText('server: nginx');

  // The restart (0.15.0) fixes it, and curl now reads 200 - the diagnosis
  // closed by the fix, both over the same ssh session.
  await runCommand(page, 'systemctl restart fcportal');
  await runCommand(page, 'curl -I http://localhost');
  await expect(output).toContainText('HTTP/2 200');
});

/**
 * The MSP weekend carries the contract row (D4, 0.38.0) - the box-level
 * assert #64's close-out named as owed. Five days of a mostly-ignored MSP
 * queue is guaranteed silence on somebody's contract, so the weekend screen
 * must show the row and fold it into the attainment fraction it prints -
 * a screen whose mark its own lines cannot explain was the finding.
 */
test('the weekend explains the mark: contract misses on the screen', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await arriveAtMsp(page);

  for (let day = 1; day < 5; day += 1) {
    await runSimMinutes(page, SHIFT_MINUTES + 90);
    await expect(page.getByTestId('day-state')).toHaveText('Day end');
    await page.getByTestId('scorecard-clock-off').click();
    await expect(page.getByTestId('brief-heading'))
      .toContainText(`Day ${String(day + 1)}`);
    await page.getByTestId('brief-start-shift').click();
    await page.getByTestId('close-brief').click();
  }

  await runSimMinutes(page, SHIFT_MINUTES + 90);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();

  // The row exists where contracts do, and the fraction it feeds is the one
  // on the screen: numerator = arrived - deadlines missed - contract misses.
  const missed = Number(
    await page.getByTestId('weekend-contract-missed').textContent(),
  );
  expect(missed).toBeGreaterThan(0);

  const arrived = Number(await page.getByTestId('weekend-arrived').textContent());
  const breached = Number(await page.getByTestId('weekend-breached').textContent());
  await expect(page.getByTestId('weekend-attainment')).toContainText(
    `${String(arrived - breached - missed)} of ${String(arrived)}`,
  );
});
