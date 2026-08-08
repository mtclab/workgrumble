import { describe, expect, it } from 'vitest';

import {
  canChooseDesktop,
  DEFAULT_DESKTOP_CHOICE,
  DEFAULT_SKIN_ID,
  DISTROS,
  distroById,
  hasWindowButton,
  packageManagerFor,
  resolveDesktopChoice,
  SKINS,
  skinById,
  type DistroId,
  type Skin,
  type SkinId,
  WINDOW_BUTTONS,
} from './skins';

/**
 * The skin system, at the level a test without a browser can hold it: the
 * registry IS the chrome, so what each desktop declares is what the shell
 * draws, and these are the teeth on that.
 *
 * The DOM half - that the panel really moves, that GNOME's titlebar really has
 * one button in it - is walked on the built artifact in `e2e/skins.spec.ts` and
 * `e2e/total-walk.spec.ts`. What is asserted HERE is the half those cannot see:
 * that the three desktops are genuinely different from each other and from the
 * default, which is what makes the lookup load-bearing. Revert `skinById` to
 * "always the default" and every assertion in the first block below reds.
 */

function chrome(skin: Readonly<Skin>): string {
  return [
    skin.panel.position,
    skin.panel.launcher.style,
    String(skin.panel.windowList),
    skin.windowButtons.order.join('+'),
    skin.windowButtons.side,
  ].join('/');
}

describe('the skin registry', () => {
  it('is a list of unique, described, complete desktops', () => {
    const ids = new Set<string>();

    for (const skin of SKINS) {
      expect(ids.has(skin.id), `duplicate skin "${skin.id}"`).toBe(false);
      ids.add(skin.id);
      expect(skin.label.trim().length, skin.id).toBeGreaterThan(0);
      // A sentence, not a label: the chooser prints it and "KDE" is not a
      // reason to press anything.
      expect(skin.blurb.trim().length, skin.id).toBeGreaterThan(40);
      expect(skin.panel.launcher.label.trim().length, skin.id)
        .toBeGreaterThan(0);
      expect(skin.windowButtons.order.length, skin.id).toBeGreaterThan(0);

      for (const button of skin.windowButtons.order) {
        expect(WINDOW_BUTTONS, skin.id).toContain(button);
      }

      // Every desktop can be closed out of. A skin that dropped the close
      // button would be chrome with no exit, which is the dead end the house
      // rules forbid - GNOME drops two of the three and never this one.
      expect(hasWindowButton(skin, 'close'), skin.id).toBe(true);
      // Every token a skin sets is a `--custom-property`; a skin cannot reach
      // the styling any other way, which is the whole design of the seam.
      for (const name of Object.keys(skin.tokens)) {
        expect(name.startsWith('--'), `${skin.id} sets "${name}"`).toBe(true);
      }
    }

    expect(SKINS.map((skin) => skin.id)).toContain(DEFAULT_SKIN_ID);
  });

  /**
   * The tooth. Each desktop is recognisable from its LAYOUT - which is the bar
   * the spec sets - so no two of them may describe the same chrome, and none of
   * them may describe the default's.
   */
  it('gives every desktop chrome nobody else has', () => {
    const seen = new Map<string, string>();

    for (const skin of SKINS) {
      const shape = chrome(skin);
      const other = seen.get(shape);
      expect(other, `${skin.id} renders exactly like ${String(other)}`)
        .toBeUndefined();
      seen.set(shape, skin.id);
    }

    expect(seen.size).toBe(SKINS.length);
  });

  it('leaves the issued Windows box exactly as it was', () => {
    const deskpro = skinById(DEFAULT_SKIN_ID);

    // No token overrides AT ALL. The default skin is the theme as declared, so
    // nothing is set on the desktop element and the chrome is byte-identical to
    // the build before skins existed. A token creeping in here is the skin
    // system leaking into the default, and the whole existing suite is the
    // other half of this gate.
    expect(deskpro.tokens).toEqual({});
    expect(deskpro.family).toBe('windows');
    expect(deskpro.panel.position).toBe('bottom');
    expect(deskpro.panel.launcher.style).toBe('start');
    expect(deskpro.panel.launcher.label).toBe('Start');
    expect(deskpro.panel.launcher.icon).toBe('icon-start');
    expect(deskpro.panel.windowList).toBe(true);
    expect(deskpro.panel.tray).toBe(true);
    expect(deskpro.windowButtons).toEqual({
      order: ['minimize', 'maximize', 'close'],
      side: 'right',
    });
    // And it is not on a distro, because it is not Linux.
    expect(deskpro.distro).toBeNull();
    expect(DEFAULT_DESKTOP_CHOICE).toEqual({
      skin: DEFAULT_SKIN_ID,
      distro: null,
    });
  });

  it('puts KDE at the bottom with everything where a refugee left it', () => {
    const kde = skinById('kde');

    expect(kde.panel.position).toBe('bottom');
    expect(kde.panel.launcher.style).toBe('kickoff');
    expect(kde.panel.windowList).toBe(true);
    expect(kde.windowButtons.order).toEqual(['minimize', 'maximize', 'close']);
    expect(kde.windowButtons.side).toBe('right');
  });

  /**
   * GNOME, and the sharp tell. The declaration is the DOM: the renderer builds
   * the buttons this list names and no others, so "not in the order" is "not in
   * the document" - never hidden, never disabled.
   */
  it('gives GNOME a top bar, no window list and a close-only titlebar', () => {
    const gnome = skinById('gnome');

    expect(gnome.panel.position).toBe('top');
    expect(gnome.panel.launcher.style).toBe('activities');
    expect(gnome.panel.launcher.label).toBe('Activities');
    // A word in the corner, no glyph - which is what the real one is.
    expect(gnome.panel.launcher.icon).toBeNull();
    expect(gnome.panel.windowList).toBe(false);
    expect(gnome.windowButtons.order).toEqual(['close']);
    expect(hasWindowButton(gnome, 'minimize')).toBe(false);
    expect(hasWindowButton(gnome, 'maximize')).toBe(false);
  });

  it('makes Cinnamon the one that looks like what you left', () => {
    const cinnamon = skinById('cinnamon');

    expect(cinnamon.panel.position).toBe('bottom');
    expect(cinnamon.panel.launcher.style).toBe('menu');
    expect(cinnamon.panel.windowList).toBe(true);
    expect(cinnamon.windowButtons.order)
      .toEqual(['minimize', 'maximize', 'close']);
    // The joke only lands if it really is the Windows-shaped one: same panel,
    // same buttons, different everything else.
    expect(cinnamon.panel.position).toBe(skinById('deskpro').panel.position);
    expect(cinnamon.windowButtons.order)
      .toEqual(skinById('deskpro').windowButtons.order);
    expect(cinnamon.tokens).not.toEqual({});
  });

  it('refuses an id no desktop answers to', () => {
    // The id type is closed, so the cast is how a test asks the RUNTIME
    // question: a hand-edited save is refused by the parse, and this is the
    // other half of the same guard.
    expect(() => skinById('xfce' as SkinId)).toThrow('Unknown desktop skin');
  });
});

describe('the distro axis', () => {
  it('pairs every desktop with a distro that ships it, or with none', () => {
    for (const skin of SKINS) {
      if (skin.family === 'windows') {
        expect(skin.distro, skin.id).toBeNull();
        continue;
      }

      const distro = distroById(skin.distro ?? 'ubuntu');
      expect(skin.distro, skin.id).not.toBeNull();
      expect(distro.packageManager, skin.id).toBeTruthy();
    }

    // The researched pairing, both directions: Ubuntu and Fedora ship GNOME,
    // Mint ships Cinnamon; GNOME's default is Ubuntu, Cinnamon's is Mint, and
    // KDE's is Fedora - the KDE edition, which is where dnf gets into a
    // player's hands without shipping zypper on the same day.
    expect(distroById('ubuntu').defaultDesktop).toBe('gnome');
    expect(distroById('mint').defaultDesktop).toBe('cinnamon');
    expect(distroById('fedora').defaultDesktop).toBe('gnome');
    expect(skinById('gnome').distro).toBe('ubuntu');
    expect(skinById('cinnamon').distro).toBe('mint');
    expect(skinById('kde').distro).toBe('fedora');
  });

  it('speaks apt on the Debian family and dnf on the RHEL one', () => {
    expect(packageManagerFor('ubuntu')).toBe('apt');
    expect(packageManagerFor('mint')).toBe('apt');
    expect(packageManagerFor('fedora')).toBe('dnf');
    // A box that is not on a distro has no package manager at all, which is
    // the honest answer for the Windows one.
    expect(packageManagerFor(null)).toBeNull();
    // Both verbs are actually reachable: a table where every distro spoke apt
    // would be an axis with one value in it.
    expect(new Set(DISTROS.map((distro) => distro.packageManager)))
      .toEqual(new Set(['apt', 'dnf']));
  });

  it('refuses a distro nobody ships', () => {
    // Closed type, runtime guard: the same rule the skins keep.
    expect(() => distroById('slackware' as DistroId)).toThrow('Unknown distro');
  });
});

describe('choosing a desktop', () => {
  it('brings the paired distro along with the desktop', () => {
    expect(resolveDesktopChoice(DEFAULT_DESKTOP_CHOICE, { skin: 'cinnamon' }))
      .toEqual({ skin: 'cinnamon', distro: 'mint' });
    expect(resolveDesktopChoice(DEFAULT_DESKTOP_CHOICE, { skin: 'kde' }))
      .toEqual({ skin: 'kde', distro: 'fedora' });
  });

  it('installs the distro\'s own desktop when the box is not on Linux yet', () => {
    // There is no desktop to leave alone on the issued Windows box, so the
    // distro half of the pairing decides: Ubuntu ships GNOME, Mint ships
    // Cinnamon. A press that resolved to nothing here would be a dead click.
    expect(resolveDesktopChoice(DEFAULT_DESKTOP_CHOICE, { distro: 'ubuntu' }))
      .toEqual({ skin: 'gnome', distro: 'ubuntu' });
    expect(resolveDesktopChoice(DEFAULT_DESKTOP_CHOICE, { distro: 'mint' }))
      .toEqual({ skin: 'cinnamon', distro: 'mint' });
  });

  it('leaves the desktop alone when only the distro is chosen', () => {
    // The axes are independent, and this is where that is true rather than
    // merely said: KDE on Fedora is a real machine, and so is KDE on Ubuntu.
    expect(resolveDesktopChoice(
      { skin: 'kde', distro: 'fedora' },
      { distro: 'ubuntu' },
    )).toEqual({ skin: 'kde', distro: 'ubuntu' });
  });

  it('drops the distro when the issued Windows box comes back', () => {
    expect(resolveDesktopChoice(
      { skin: 'gnome', distro: 'ubuntu' },
      { skin: 'deskpro' },
    )).toEqual({ skin: 'deskpro', distro: null });
  });

  /**
   * The gate: the promotion, the same one ssh keeps. A service-desk player gets
   * the box IT issued them and a sentence about why.
   */
  it('refuses a Linux desktop below the engineer tier, and says why', () => {
    const refusal = canChooseDesktop(
      { skin: 'gnome', distro: 'ubuntu' },
      false,
    );

    expect(refusal.ok).toBe(false);
    expect(refusal.ok ? '' : refusal.reason).toContain('promotion');
    expect(canChooseDesktop({ skin: 'kde', distro: 'fedora' }, true).ok)
      .toBe(true);
  });

  it('never refuses the box the desk was issued', () => {
    for (const engineer of [true, false]) {
      expect(canChooseDesktop(DEFAULT_DESKTOP_CHOICE, engineer).ok).toBe(true);
    }
  });
});
