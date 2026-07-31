import { expect, type Locator, type Page } from '@playwright/test';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LoginOptions {
  /**
   * What to do with the morning brief, which the day puts on screen at the
   * first login of a day. `close` (the default) clears it out of the way so a
   * test that is about something else starts on an empty desktop; `keep`
   * leaves it for the tests that are about the day itself.
   */
  readonly brief?: 'close' | 'keep';
}

/** Boots the shell and logs in. Boot auto-advances, so skipping is optional. */
export async function logIn(
  page: Page,
  options: Readonly<LoginOptions> = {},
): Promise<void> {
  await page.goto('/');
  await completeLogin(page, options);
}

/**
 * Everything after the navigation: skip the boot gag and log on. Split out so
 * a test can put its own work between loading the page and using it.
 */
export async function completeLogin(
  page: Page,
  options: Readonly<LoginOptions> = {},
): Promise<void> {
  const boot = page.getByTestId('boot-screen');

  if (await boot.isVisible()) {
    await page.keyboard.press('Space');
  }

  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  if (options.brief === 'keep') {
    return;
  }

  await dismissBrief(page);
}

/** Closes the morning brief if the day has just put one up. */
export async function dismissBrief(page: Page): Promise<void> {
  const brief = page.getByTestId('window-brief');

  if (await brief.isVisible()) {
    await page.getByTestId('close-brief').click();
    await expect(brief).toHaveCount(0);
  }
}

export async function openFromStartMenu(
  page: Page,
  appId: string,
): Promise<void> {
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();
  await page.getByTestId(`start-menu-item-${appId}`).click();
  await expect(page.getByTestId('start-menu')).toBeHidden();
  await expect(page.getByTestId(`window-${appId}`)).toBeVisible();
}

export async function openFromDesktopIcon(
  page: Page,
  appId: string,
): Promise<void> {
  await page.getByTestId(`desktop-icon-${appId}`).dblclick();
  await expect(page.getByTestId(`window-${appId}`)).toBeVisible();
}

/** Brings an already-open window to the front from the taskbar. */
export async function focusWindow(page: Page, appId: string): Promise<void> {
  await page.getByTestId(`taskbar-button-${appId}`).click();
  await expect(page.getByTestId(`window-${appId}`)).toHaveAttribute(
    'data-focused',
    'true',
  );
}

/** Runs one line in the Support Terminal and waits for it to echo back. */
export async function runCommand(page: Page, line: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.fill(line);
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText(
    `C:\\SUPPORT> ${line}`,
  );
}

/** The one toast that says a ticket closed itself. */
export function resolvedToast(page: Page): Locator {
  return page.getByTestId('toast').filter({ hasText: 'Ticket resolved' });
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('Expected the element to have a layout box.');
  }

  return box;
}

/** Presses the pointer in the middle of `from` and drags it by a delta. */
export async function dragBy(
  page: Page,
  from: Locator,
  dx: number,
  dy: number,
): Promise<void> {
  const box = await boxOf(from);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
}

export interface ActiveElement {
  /** `data-testid` of the focused element, or null when there is none. */
  readonly testid: string | null;
  /** True when the focused element sits inside an `aria-hidden` subtree. */
  readonly inAriaHidden: boolean;
}

/** Reads where keyboard focus actually is, not where the UI implies it is. */
export async function activeElement(page: Page): Promise<ActiveElement> {
  return page.evaluate(() => {
    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) {
      return { testid: null, inAriaHidden: false };
    }

    return {
      testid: active.dataset.testid ?? null,
      inAriaHidden: active.closest('[aria-hidden="true"]') !== null,
    };
  });
}

export async function zIndexOf(page: Page, appId: string): Promise<number> {
  const value = await page
    .getByTestId(`window-${appId}`)
    .getAttribute('data-z');

  return Number(value);
}
