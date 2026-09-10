import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Start menu's cap, and the one skin that was left out of it - the
 * adversarial review of the 0.42.0 bundle.
 *
 * W-07's fix stopped the menu running under the taskbar by giving the LIST a
 * definite height to wrap its columns against: `.start-menu` declares
 * `--start-menu-cap`, its own `max-height` reads that variable, and
 * `.start-menu-list` reads the same variable less the two paddings so the
 * wrap can never count a row the menu has no room for. Two of the three skin
 * overrides were converted to set the variable. The Mac family's was not -
 * `.screen-desktop[data-panel-second="top"] .start-menu` still sets
 * `max-height` directly - so on that desktop the MENU is capped to clear both
 * bars while the LIST inside it still measures itself against the one-bar cap
 * it inherits from the base rule. At the shipped `--size-taskbar: 32px` that
 * is 24px more list than menu: `auto-fill` counts a row that does not fit,
 * the list overflows a container with no `overflow` of its own, and the top
 * entry ends up under the menu bar - visible and unclickable, which is the
 * exact dead end that override's own comment says it exists to prevent. The
 * fade does not fire either: `markStartMenuFold` compares the list's scroll
 * height with its client height, and the list has room for everything.
 *
 * The gate is over the stylesheet rather than over a browser because that is
 * where the mistake lives and where the next one will: a skin added later
 * that caps the menu without going through the variable puts the same hole
 * back, silently, on a desktop no e2e viewport happens to open.
 */
const THEME = readFileSync(
  fileURLToPath(new URL('./theme.css', import.meta.url)),
  'utf8',
);

/** Every `selector { ... }` block in the sheet, flat: it has no nesting. */
function blocks(css: string): readonly { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = [];

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    found.push({
      selector: (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//gu, '').trim(),
      body: match[2] ?? '',
    });
  }

  return found;
}

/** The declared value of one property in a block, or null. */
function declaration(body: string, property: string): string | null {
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`, 'u').exec(body);

  return found === null ? null : (found[1] ?? '').replace(/\s+/gu, ' ').trim();
}

describe('the start menu is capped in one place (W-07, 0.42.0)', () => {
  it('caps every skin through --start-menu-cap and never directly', () => {
    // `.start-menu` as a whole class - `.start-menu-list` is a different
    // element with its own rule and is checked separately below.
    const menus = blocks(THEME).filter(
      (block) => /\.start-menu(?![\w-])/u.test(block.selector),
    );

    // The gate is over something: the base rule and three skin overrides.
    expect(menus.length).toBeGreaterThan(3);

    const direct = menus
      .filter((block) => {
        const value = declaration(block.body, 'max-height');

        return value !== null && value !== 'var(--start-menu-cap)';
      })
      .map((block) => `${block.selector} { max-height: ${
        declaration(block.body, 'max-height') ?? ''
      } }`);

    expect(direct, 'a start menu capped without the variable the list reads')
      .toEqual([]);
  });

  it('measures the list against the same variable, less its paddings', () => {
    const list = blocks(THEME).find(
      (block) => block.selector === '.start-menu-list',
    );

    expect(list, 'the list rule has been renamed').toBeDefined();
    expect(declaration(list?.body ?? '', 'max-height'))
      .toContain('var(--start-menu-cap)');
  });
});
