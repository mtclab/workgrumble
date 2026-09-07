import { expect, test } from '@playwright/test';

import { logIn, openFromStartMenu } from './helpers';

/**
 * The game on a phone.
 *
 * It is a fake-DESKTOP-OS caricature and it is desktop-first by design, so
 * this file is deliberately NOT the responsive epic: it does not ask the
 * layout to reflow, collapse or grow a bottom nav. It asks the one thing the
 * shell already claims to do and stopped doing - THE WINDOW IS ON THE SCREEN.
 *
 * The window manager clamps every window it opens to its viewport
 * (`clampWindowBounds`), and it measures that viewport off the desktop
 * surface. The surface sat in a grid column sized to its widest row rather
 * than to the screen, and the taskbar will not fold below about 612px - so on
 * a 390px phone the surface measured 612, the clamp was handed a screen 222px
 * wider than the real one, and the first window a player opened arrived at
 * x=309 with most of itself past the right edge. Every assertion here is about
 * that: what the shell measures, and where a window lands because of it.
 *
 * 390x844 is a stock modern phone in portrait, which is the narrowest thing
 * this game is going to be opened on and the width the mobile audit was run
 * at.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('opens its windows on the screen the player actually has', async ({
  page,
}) => {
  await logIn(page, { brief: 'keep' });

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const screenWidth = viewport?.width ?? 0;

  // THE WINDOW THE DAY PUTS UP ITSELF, first, because it is the symptom a
  // player meets rather than the measurement behind it. The morning brief is
  // the first thing a new player sees and no click opens it, so a phone player
  // who never touches the Start menu still meets this one.
  const brief = await page.getByTestId('window-brief').boundingBox();
  expect(brief).not.toBeNull();
  expect(brief?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((brief?.x ?? 0) + (brief?.width ?? 0)).toBeLessThanOrEqual(screenWidth);

  // WHAT THE SHELL MEASURES, which is the root the rest are symptoms of. The
  // surface is what `measureViewport` reads, so a surface wider than the screen
  // is a lie the clamp then faithfully obeys.
  const measured = await page.getByTestId('desktop-surface').evaluate(
    (surface) => surface.clientWidth,
  );
  expect(measured).toBeLessThanOrEqual(screenWidth);

  // AND ONE THE PLAYER OPENS. The cascade walks new windows to the right, so
  // the second window is where an off-by-a-viewport clamp shows worst.
  await page.getByTestId('close-brief').click();
  await openFromStartMenu(page, 'kb');
  const kb = await page.getByTestId('window-kb').boundingBox();
  expect(kb).not.toBeNull();
  expect(kb?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((kb?.x ?? 0) + (kb?.width ?? 0)).toBeLessThanOrEqual(screenWidth);

  // And the page itself never grows a sideways scroll to hide the overflow in:
  // a desktop that is wider than the screen is the same defect wearing a
  // scrollbar.
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    screen: window.innerWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.screen);
});
