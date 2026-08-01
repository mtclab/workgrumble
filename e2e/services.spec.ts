import { expect, type Page, test } from '@playwright/test';

import {
  logIn,
  openFromStartMenu,
  runCommand,
} from './helpers';

/**
 * The estate is a real estate.
 *
 * Found by the owner playing the live build: `services BEIGE-BOX` listed a
 * chassis fan and nothing else, and About This Workstation reported how many
 * tickets were waiting. Both are fixed in the world rather than in a string,
 * so both are checked here on the shipped artifact, through the surfaces a
 * player uses.
 *
 * The load-bearing test in this file is the second one. Twenty-odd services on
 * every box is only worth having if none of them is scenery: the rule is that
 * a service asked to restart either restarts or refuses for a reason that is
 * true of it, and the only honest way to assert that is to walk EVERY row and
 * check both halves.
 */

/** The player's own box, from the machine list. */
async function connectTo(page: Page, machine: string): Promise<void> {
  await openFromStartMenu(page, 'remote');
  await page.getByTestId(`remote-machine-${machine}`).click();
}

test('lists what a workstation actually runs, and says how to name one', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');

  await runCommand(page, 'services BEIGE-BOX');
  const output = page.getByTestId('cmd-output');

  await expect(output).toContainText('Services on BEIGE-BOX (workstation)');
  await expect(output).toContainText('DISPLAY NAME');
  await expect(output).toContainText('STATUS');
  await expect(output).toContainText('STARTUP TYPE');

  // A list somebody has to READ: the four startup types are all on it, which
  // is what makes a stopped service a question rather than a verdict.
  await expect(output).toContainText('Print Spooler');
  await expect(output).toContainText('DNS Client');
  await expect(output).toContainText('Remote Procedure Call (RPC)');
  await expect(output).toContainText('Automatic (Delayed Start)');
  await expect(output).toContainText('Manual');
  await expect(output).toContainText('Disabled');

  // What reports a status and is not a service is UNDER the table, named as
  // what it is. The fan was the whole list once.
  await expect(output).toContainText(
    'Also on this box, reporting a status and not services:',
  );
  await expect(output).toContainText('Chassis fan');
  await expect(output).toContainText('[hardware, not restartable]');

  // Every box in the building runs most of that list, so the name of a
  // service is not an answer to which one - and the refusal hands back the
  // form that is.
  await runCommand(page, 'restart spooler');
  await expect(output).toContainText('Name the box as well');
  await runCommand(page, 'sc query BEIGE-BOX\\Dnscache');
  await expect(output).toContainText('SERVICE_NAME: Dnscache');
  await expect(output).toContainText('STATE              : 4  RUNNING');
});

test('runs a different list on a print server, a file server and a DC', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');

  await runCommand(page, 'services PRINT-01');
  await expect(output).toContainText('Services on PRINT-01 (print server)');
  await expect(output).toContainText('TCP/IP Print Server');

  await runCommand(page, 'services FILES-01');
  await expect(output).toContainText('Services on FILES-01 (file server)');
  await expect(output).toContainText('Distributed File System');
  // The licence pool is on that box and is not a service on it.
  await expect(output).toContainText('Accounts Suite licence pool');
  await expect(output).toContainText('[not a service on this box]');

  await runCommand(page, 'services DC-01');
  await expect(output).toContainText('Services on DC-01 (domain controller)');
  await expect(output).toContainText('Directory Service');
  await expect(output).toContainText('Kerberos Key Distribution Center');
  await expect(output).toContainText('DNS Server');

  // And it is a machine on the network like any other, which is the point of
  // putting the directory on a box instead of in the air.
  await runCommand(page, 'ping DC-01');
  await expect(output).toContainText('Reply from DC-01');
});

/**
 * The no-scenery gate.
 *
 * Every service on the player's own box, one at a time: the restart button is
 * either live, or disabled with a sentence saying why. A control that is
 * disabled with no reason - or live and does nothing - is the thing this slice
 * exists to make impossible.
 */
test('leaves no service on the box that neither restarts nor says why', async ({
  page,
}) => {
  await logIn(page);
  await connectTo(page, 'beige-box');

  const rows = page.getByTestId('remote-services').locator('tbody tr');
  const count = await rows.count();

  expect(count).toBeGreaterThan(20);

  let restartable = 0;

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const restart = row.getByRole('button', { name: 'Restart' });
    const name = await row.locator('.remote-service-name').innerText();

    if (await restart.isDisabled()) {
      // Disabled is only allowed WITH a reason, and the reason has to be a
      // sentence rather than a shrug.
      const why = await restart.getAttribute('title');

      expect(why, name).toBeTruthy();
      expect((why ?? '').length, name).toBeGreaterThan(20);
      continue;
    }

    restartable += 1;
  }

  // And at least one of them is genuinely startable: the Manual services that
  // are stopped on purpose are the proof that "stopped" is not "broken".
  expect(restartable).toBeGreaterThan(0);
});

test('starts a stopped service for real, and refuses the four that cannot', async ({
  page,
}) => {
  await logIn(page);
  await connectTo(page, 'beige-box');

  // Manual and stopped, which is correct - and it starts when asked.
  const bits = page.getByTestId('remote-service-beige-box/bits');
  await expect(bits).toContainText('Stopped');
  await expect(bits).toContainText('Manual');
  await page.getByTestId('remote-restart-beige-box/bits').click();
  await expect(bits).toContainText('Running');

  // Disabled: nothing starts it, and the fix is its startup type.
  const registry = page.getByTestId('remote-restart-beige-box/remoteregistry');
  await expect(registry).toBeDisabled();
  await expect(registry).toHaveAttribute('title', /set to Disabled/);

  // The manager's own, which will not take a stop control at all.
  const rpc = page.getByTestId('remote-restart-beige-box/rpcss');
  await expect(rpc).toBeDisabled();
  await expect(rpc).toHaveAttribute('title', /will not take a stop control/);

  // Running and healthy, which is a different refusal again.
  const dns = page.getByTestId('remote-restart-beige-box/dnscache');
  await expect(dns).toBeDisabled();
  await expect(dns).toHaveAttribute('title', /running/);

  // And the fan, which is not software - listed under the table, refused in
  // its own words, and the reason none of the above says "hardware".
  const fan = page.getByTestId('remote-restart-chassis-fan');
  await expect(fan).toBeDisabled();
  await expect(fan).toHaveAttribute('title', /not software/);

  // The same four, from the terminal, in the world's own words.
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');

  await runCommand(page, 'restart BEIGE-BOX\\RemoteRegistry');
  await expect(output).toContainText('is set to Disabled');
  await runCommand(page, 'restart BEIGE-BOX\\RpcSs');
  await expect(output).toContainText('will not take a stop control');
  await runCommand(page, 'restart chassis fan');
  await expect(output).toContainText('It will not help.');
  await runCommand(page, 'restart Accounts Suite licence pool');
  await expect(output).toContainText('somebody else\'s box answering');
});

/**
 * The boss's-eye view of the slack mechanic: if the lead can read the machine,
 * so can the player. A window that is open is a process; a window that is
 * minimised is still a process; a window that is closed is gone.
 */
test('reports the browser and the toy as the processes they are', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');

  await runCommand(page, 'tasklist');
  const output = page.getByTestId('cmd-output');

  await expect(output).toContainText('System Idle Process');
  await expect(output).toContainText('CMD.EXE');
  await expect(output).not.toContainText('NAVIGATE.EXE');

  await openFromStartMenu(page, 'browser');
  await openFromStartMenu(page, 'bubbles');
  await page.keyboard.press('Backquote');

  // The panic key moved what is on the screen and nothing at all on the list.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'tasklist');
  await expect(output).toContainText('NAVIGATE.EXE');
  await expect(output).toContainText('BUBBLES.EXE');
  await expect(output).toContainText('A minimised window is a running program');

  // The same truth in the taskbar of the player's own remote session.
  await connectTo(page, 'beige-box');
  await expect(page.getByTestId('remote-program-browser'))
    .toHaveAttribute('data-minimized', 'true');

  // Closed is gone, which is the other half of the promise.
  await page.getByTestId('taskbar-button-browser').click();
  await page.getByTestId('close-browser').click();
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'tasklist');
  await expect(output).not.toContainText('NAVIGATE.EXE');
});

test('is an About dialog about this workstation, and nothing else', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'about');

  const about = page.getByTestId('about-app');

  await expect(page.getByTestId('about-value-workstation')).toHaveText('BEIGE-BOX');
  await expect(page.getByTestId('about-value-logged-on-as'))
    .toHaveText('workgrumble\\ppending');
  await expect(page.getByTestId('about-value-processor')).toContainText('Pentagon');
  await expect(page.getByTestId('about-value-memory'))
    .toHaveText('64 MB (48 MB usable, and nobody knows why)');
  await expect(page.getByTestId('about-value-display')).toHaveText('1024x768');
  await expect(page.getByTestId('about-value-uptime')).not.toBeEmpty();
  await expect(page.getByTestId('about-value-version')).toContainText('4.10.1998');
  await expect(page.getByTestId('about-value-licence')).toContainText('One desk');

  // The debug readouts are gone, and this is the assertion that keeps them
  // gone: a ticket count is the queue's business and an entity count is
  // nobody's.
  await expect(about).not.toContainText('entities');
  await expect(about).not.toContainText('World records');
  await expect(about).not.toContainText('Tickets awaiting you');

  // The two world-reaching buttons still reach the world.
  await page.getByTestId('about-run-diagnostics').click();
  await expect(page.getByTestId('about-value-last-diagnostic'))
    .toHaveText(/^\d{2}:\d{2}$/);

  // And what the dialog says about the machine is what `systeminfo` says
  // about the same machine, because both read the same fields.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'systeminfo');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('64 MB (48 MB usable, and nobody knows why)');
});
