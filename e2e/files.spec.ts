import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  logInOnDay,
  openFromStartMenu,
  runCommand,
  runOnlyCommand,
} from './helpers';

/**
 * The filesystem, on the shipped artifact, through the terminal a player uses.
 *
 * Found by the owner playing the live build: the instinct on a terminal is to
 * look at the tree and move around, and there was nothing there. What is here
 * is not "the commands exist" - the shapes are held to their fidelity rows in
 * the unit suite, line for line - but the two claims that can only be made on
 * the real thing:
 *
 * - the working directory belongs to the window, and the prompt follows it; and
 * - the spool directory IS the stuck queue, so emptying one empties the other,
 *   and a player can diagnose the week's office-wide fault by listing a
 *   directory as well as by reading a services list or an event log.
 */

const SPOOL = '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS';

test('is a drive somebody can walk around, and a prompt that follows', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');
  const prompt = page.locator('.cmd-prompt');

  await expect(prompt).toHaveText('C:\\SUPPORT>');

  await runOnlyCommand(page, 'dir');
  await expect(output).toContainText('Volume in drive C has no label.');
  await expect(output).toContainText('Directory of C:\\SUPPORT');
  await expect(output).toContainText('RUNBOOK.TXT');
  await expect(output).toContainText('File(s)');
  await expect(output).toContainText('bytes free');

  // The working directory moves, and the prompt is the thing that says so.
  await runCommand(page, 'cd ..');
  await expect(prompt).toHaveText('C:\\>');
  await runCommand(page, 'cd');
  await expect(output).toContainText('C:\\');
  await runCommand(page, 'cd WINDOWS\\SYSTEM32');
  await expect(prompt).toHaveText('C:\\WINDOWS\\SYSTEM32>');
  await runOnlyCommand(page, 'dir');
  await expect(output).toContainText('Directory of C:\\WINDOWS\\SYSTEM32');
  await expect(output).toContainText('LOGFILES');

  // A file is a file, and the one on this desk was left by whoever sat here.
  await runCommand(page, 'cd \\Documents and Settings\\ppending\\My Documents');
  await runOnlyCommand(page, 'type HANDOVER.TXT');
  await expect(output).toContainText('read this before you ring anybody');
  await expect(output).toContainText('SPOOL\\PRINTERS');

  // And the refusals are the real ones.
  await runCommand(page, 'cd C:\\NOTHING');
  await expect(output).toContainText('The system cannot find the path specified.');
  await runCommand(page, 'cd ~');
  await expect(output).toContainText('%USERPROFILE%');
  await runCommand(page, 'type C:\\WINDOWS');
  await expect(output).toContainText('Access is denied.');
});

test('draws the tree, and stops where somebody else\'s rights start', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');

  await runOnlyCommand(page, 'tree C:\\WINDOWS');
  await expect(output).toContainText('Folder PATH listing');
  await expect(output).toContainText('└───SYSTEM32');
  await expect(output).toContainText('PRINTERS');
  // Directories only, without /f.
  await expect(output).not.toContainText('WIN.INI');

  await runOnlyCommand(page, 'tree C:\\WINDOWS /f');
  await expect(output).toContainText('WIN.INI');

  // Payroll's directory is visible and not readable, which is what a
  // permission looks like from the outside.
  await runOnlyCommand(page, 'tree \\\\FILES-01\\C$');
  await expect(output).toContainText('PAYROLL');
  await expect(output).toContainText('Access is denied.');
  await runOnlyCommand(page, 'dir \\\\FILES-01\\C$\\PAYROLL');
  await expect(output).toContainText('Access is denied.');

  // The one file on this estate that explains a service nobody put back.
  await runOnlyCommand(page, 'type \\\\FILES-01\\C$\\REPORTSVC\\REPORTSVC.INI');
  await expect(output).toContainText('PUT IT BACK AFTER');
  await expect(output).toContainText('LastRun=14/03/1998  02:00');
});

/**
 * The load-bearing test in this file.
 *
 * The queue length and the spool directory are two windows onto one pile of
 * work. This walks the week's office-wide fault from the directory rather than
 * from the ticket: forty-seven files, four of them the same size because four
 * of them are the same delivery note, and a directory that is empty the moment
 * the queue is - on the real artifact, through the shipped verbs.
 */
test('holds the stuck jobs as files, and empties when the queue does', async ({
  page,
}) => {
  // Tuesday, which is the morning the week hands over its office-wide fault.
  await logInOnDay(page, 2);
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');

  await runOnlyCommand(page, 'queue hercules');
  await expect(output).toContainText('47 job(s)');

  await runOnlyCommand(page, `dir ${SPOOL}`);
  await expect(output).toContainText('Volume in drive \\\\PRINT-01\\C$');
  await expect(output).toContainText('00001.SPL');
  await expect(output).toContainText('00047.SPL');
  await expect(output).toContainText('47 File(s)');

  const listed = await output.innerText();

  expect(listed.match(/\d{5}\.SPL/gu)).toHaveLength(47);
  // Four files of exactly the same size are four copies of the same delivery
  // note, which is the diagnosis the reporter did not give you.
  expect(listed.match(/ 40,960 /gu)).toHaveLength(4);

  // The machine's own log says the same thing, in the same field the Event
  // Viewer paints - and the file and the window agree because they are one.
  await runOnlyCommand(
    page,
    'type \\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\LOGFILES\\SYSTEM.LOG',
  );
  await expect(output).toContainText('Jobs are stacking up on Hercules 400');
  await openFromStartMenu(page, 'events');
  await page.getByTestId('events-machine-print').click();
  await expect(page.getByTestId('events-table'))
    .toContainText('Jobs are stacking up on Hercules 400');

  // Empty the queue, and the directory is empty. Not "reports empty" - there
  // is nothing in it, because there is nothing in the queue.
  await focusWindow(page, 'cmd');
  await runCommand(page, 'clearqueue hercules');
  await runOnlyCommand(page, `dir ${SPOOL}`);
  await expect(output).toContainText('0 File(s)');
  await expect(output).not.toContainText('.SPL');
  await runOnlyCommand(page, 'queue hercules');
  await expect(output).toContainText('0 job(s)');

  // And step three of the procedure leaves it empty, which is the property
  // that stops the same job jamming the same service again.
  await runCommand(page, 'restart PRINT-01\\spooler');
  await expect(output).toContainText('RUNNING');
  await runOnlyCommand(page, `dir ${SPOOL}`);
  await expect(output).toContainText('0 File(s)');
  await expect(output).not.toContainText('.SPL');
});
