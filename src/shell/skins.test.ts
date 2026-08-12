import { describe, expect, it } from 'vitest';

import {
  canChooseDesktop,
  DEFAULT_DESKTOP_CHOICE,
  DEFAULT_SKIN_ID,
  DESKTOP_TIER_REFUSAL_MAC,
  DISTROS,
  LAUNCHER_STYLES,
  PANEL_KINDS,
  type DesktopChoiceState,
  distroById,
  hasWindowButton,
  needsDesktopReason,
  PACKAGE_MANAGERS,
  packageManagerFor,
  resolveDesktopChoice,
  type SecurityModule,
  securityModuleFor,
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
 * that the six desktops are genuinely different from each other and from the
 * default, which is what makes the lookup load-bearing. Revert `skinById` to
 * "always the default" and every assertion in the first block below reds.
 */

/**
 * Everything about a desktop a player could point at from across the room: the
 * panels and where they are, what is in them, the shape AND the word of the
 * launcher, and the titlebar. Two desktops with the same string here are two
 * desktops nobody can tell apart, which is what the tooth below forbids.
 *
 * The launcher's LABEL is in it because 0.28.0 put three desktops on the same
 * bottom edge (Cinnamon, Xfce, LXQt): with only the style in the key, two of
 * them could have been given the same word in the corner and nothing would
 * have complained. The second panel is in it for the same reason in the other
 * direction - MATE's whole tell is the bar the others do not have.
 *
 * 0.33.0 adds the panel KINDS to the key, both of them, because that is the
 * version's own version of the same trap: MATE and the Mac family both put a
 * bar on the top edge and a bar on the bottom, and the difference between them
 * is which one is a menu bar and where the launcher is. Without the kinds in
 * here, a future desktop could be given MATE's exact shape with the labels
 * swapped and nothing would notice.
 */
function chrome(skin: Readonly<Skin>): string {
  const second = skin.secondPanel;

  return [
    skin.panel.position,
    skin.panel.kind,
    skin.panel.launcher.style,
    skin.panel.launcher.label,
    String(skin.panel.windowList),
    String(skin.panel.tray),
    second === null
      ? 'one-panel'
      : `${second.position}:${second.kind}:${String(second.windowList)}:${
        String(second.tray)
      }`,
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
      expect(LAUNCHER_STYLES, skin.id).toContain(skin.panel.launcher.style);
      expect(PANEL_KINDS, skin.id).toContain(skin.panel.kind);
      expect(skin.windowButtons.order.length, skin.id).toBeGreaterThan(0);
      // Every button a titlebar declares is one the renderer knows how to
      // build, and it declares each of them ONCE: a duplicate would be two
      // close buttons on the same window, which the order-as-the-set model
      // cannot otherwise catch.
      expect(new Set(skin.windowButtons.order).size, skin.id)
        .toBe(skin.windowButtons.order.length);

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

      // A MENU BAR is not a taskbar (0.33.0), and the registry may not declare
      // one that is: the open windows live in the panel that has the launcher
      // beside them, and a menu bar carrying the window list would be this
      // table calling a taskbar a menu bar. Said over both panels of every
      // skin, because either of them can be the one.
      for (const panel of [skin.panel, skin.secondPanel]) {
        if (panel !== null && panel.kind === 'menu-bar') {
          expect(panel.windowList, `${skin.id}'s menu bar holds a window list`)
            .toBe(false);
        }
      }

      if (skin.secondPanel === null) {
        // And a desktop with ONE bar cannot have made it a menu bar: a menu
        // bar with the launcher and the window list in it is a taskbar with a
        // name it has not earned, and there would be nowhere else for either
        // of them to be.
        expect(skin.panel.kind, skin.id).toBe('panel');
        continue;
      }

      // At most one of the two is a menu bar. Two would be a desktop whose
      // focused app owns both edges of the screen, which is nobody's.
      expect(
        [skin.panel.kind, skin.secondPanel.kind]
          .filter((kind) => kind === 'menu-bar').length,
        `${skin.id} declares two menu bars`,
      ).toBeLessThan(2);

      // A desktop with two panels puts them on OPPOSITE edges. Both on the
      // same one is not a layout - it is two bars in the same grid row, which
      // is what the stylesheet would try to draw, and the shell has no way to
      // say it is wrong at runtime. Said here, once, for every skin that ever
      // declares a second bar.
      expect(skin.secondPanel.position, skin.id)
        .not.toBe(skin.panel.position);
      // And it is a panel that HOLDS something. An empty second bar is a strip
      // of the player's screen spent on nothing.
      expect(
        skin.secondPanel.windowList || skin.secondPanel.tray,
        `${skin.id}'s second panel holds nothing`,
      ).toBe(true);
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
    // A taskbar, and the 0.33.0 fork is not in it: the issued box's bar is the
    // one it always was, and a menu bar here would be the new primitive
    // leaking into the desktop the whole suite is the gate on.
    expect(deskpro.panel.kind).toBe('panel');
    expect(deskpro.panel.launcher.style).toBe('start');
    expect(deskpro.panel.launcher.label).toBe('Start');
    expect(deskpro.panel.launcher.icon).toBe('icon-start');
    expect(deskpro.panel.windowList).toBe(true);
    expect(deskpro.panel.tray).toBe(true);
    // ONE panel, and the 0.28.0 extension is not in its DOM at all: a second
    // bar declared here - even an empty one - would be a bar the byte-identical
    // default does not have.
    expect(deskpro.secondPanel).toBeNull();
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

  /**
   * MATE, and the whole of the 0.28.0 system extension.
   *
   * The tooth on the second panel: revert MATE to one panel - drop
   * `secondPanel`, or move the window list and the tray back up into the menu
   * bar - and this reds in several places at once. It is the only skin that
   * uses the extension, which is the point: an extension proven by the one
   * desktop that needs it leaves the other six exactly where they were.
   */
  it('gives MATE a menu bar on top and a taskbar underneath', () => {
    const mate = skinById('mate');

    // Two panels, on opposite edges, and the launcher is in the top one.
    expect(mate.panel.position).toBe('top');
    expect(mate.panel.launcher.style).toBe('classic');
    expect(mate.panel.launcher.label).toBe('Applications');
    expect(mate.panel.launcher.icon).toBeNull();
    expect(mate.panel.kind).toBe('panel');
    expect(mate.secondPanel).toEqual({
      position: 'bottom',
      kind: 'panel',
      windowList: true,
      tray: true,
    });

    // And the split is the tell: the menu bar is a MENU BAR - the open windows
    // and the clock are downstairs. A MATE whose top bar held the window list
    // would be GNOME with an extra strip of grey at the bottom.
    expect(mate.panel.windowList).toBe(false);
    expect(mate.panel.tray).toBe(false);
    expect(mate.windowButtons.order)
      .toEqual(['minimize', 'maximize', 'close']);
  });

  /**
   * The two-bar desktops, which 0.33.0 makes two: MATE and the Mac.
   *
   * They are here together because they are the same extension used in
   * OPPOSITE directions, and asserting them side by side is the only way to
   * say that: MATE's launcher is in the top bar and its window list is
   * downstairs, the Mac's launcher is in the bottom bar and its clock is
   * upstairs. Same two fields, mirrored - which is what proves the second
   * panel is a general shape and not a MATE-shaped hole.
   */
  it('gives a second panel to MATE and the Mac, and to nobody else', () => {
    const twoPanelled = SKINS.filter((skin) => skin.secondPanel !== null);

    expect(twoPanelled.map((skin) => skin.id)).toEqual(['mate', 'orchard']);
    // Which is the other half of "the extension left every other desktop
    // untouched": six skins declare one panel, and the shell builds one bar
    // for each of them.
    expect(SKINS.length - twoPanelled.length).toBe(6);

    // The mirror, in one read: the launcher panel is on opposite edges and the
    // tray is on opposite edges with it.
    const mate = skinById('mate');
    const orchard = skinById('orchard');

    expect(mate.panel.position).not.toBe(orchard.panel.position);
    expect(mate.panel.tray).toBe(false);
    expect(orchard.panel.tray).toBe(false);
    expect(mate.secondPanel?.tray).toBe(true);
    expect(orchard.secondPanel?.tray).toBe(true);
    // And exactly one of the four bars in this test is a menu bar.
    expect(
      [mate.panel, mate.secondPanel, orchard.panel, orchard.secondPanel]
        .filter((panel) => panel?.kind === 'menu-bar').length,
    ).toBe(1);
  });

  it('makes Xfce the no-frills bottom panel with an Applications menu', () => {
    const xfce = skinById('xfce');

    expect(xfce.panel.position).toBe('bottom');
    expect(xfce.panel.launcher.style).toBe('applications');
    expect(xfce.panel.launcher.label).toBe('Applications');
    expect(xfce.panel.launcher.icon).toBe('icon-applications');
    expect(xfce.panel.windowList).toBe(true);
    expect(xfce.secondPanel).toBeNull();
    expect(xfce.windowButtons.order)
      .toEqual(['minimize', 'maximize', 'close']);
  });

  it('makes LXQt the slim one with a plain launcher', () => {
    const lxqt = skinById('lxqt');

    expect(lxqt.panel.position).toBe('bottom');
    expect(lxqt.panel.launcher.style).toBe('plain');
    expect(lxqt.panel.launcher.label).toBe('LXQt');
    // No glyph and no Start-menu costume: a button with the desktop's own name
    // on it, which is what the lightest one actually looks like.
    expect(lxqt.panel.launcher.icon).toBeNull();
    expect(lxqt.secondPanel).toBeNull();
    expect(lxqt.windowButtons.order)
      .toEqual(['minimize', 'maximize', 'close']);
    // The slimmest bar in the registry, and the tell you can see across the
    // room. Every other desktop that declares a bar height declares a taller
    // one; the default declares no tokens at all, which is its own gate.
    const height = (skin: Readonly<Skin>): number | null => {
      const declared = skin.tokens['--size-taskbar'];

      return declared === undefined ? null : Number.parseInt(declared, 10);
    };
    const slim = height(lxqt);

    expect(slim).not.toBeNull();

    for (const skin of SKINS) {
      const other = height(skin);

      if (skin.id === 'lxqt' || other === null) {
        continue;
      }

      expect(slim ?? 0, `${skin.id} is no taller than LXQt`)
        .toBeLessThan(other);
    }
  });

  /**
   * The Mac family (0.33.0), and the three primitives it is here to prove.
   *
   * TEETH, and they are the point of this block: take the `side` back to
   * 'right' and the order back to min/max/close and the two assertions below
   * red - which is the whole of the layout fork stated as data. Take the
   * menu-bar kind off the second panel and the kind assertion reds AND the
   * twin-chrome tooth reds with it, because a Mac whose bars are both plain
   * panels is MATE upside down.
   */
  it('gives the Mac a menu bar, a dock, and the buttons on the left', () => {
    const orchard = skinById('orchard');

    // THE MENU BAR: a kind, on the OTHER panel, over a launcher panel at the
    // bottom. Not a taskbar that has been moved - it holds no window list, and
    // the clock is in it because that is where a Mac keeps the clock.
    expect(orchard.secondPanel).toEqual({
      position: 'top',
      kind: 'menu-bar',
      windowList: false,
      tray: true,
    });

    // THE DOCK: the launcher style, in the panel at the bottom, with the open
    // windows in the same strip and the clock NOT in it.
    expect(orchard.panel.position).toBe('bottom');
    expect(orchard.panel.kind).toBe('panel');
    expect(orchard.panel.launcher.style).toBe('dock');
    expect(orchard.panel.launcher.icon).not.toBeNull();
    expect(orchard.panel.windowList).toBe(true);
    expect(orchard.panel.tray).toBe(false);

    // THE BUTTONS: left, close first, and all three of them present. The
    // third one stays `maximize` on purpose - the mechanic is the maximize
    // toggle every other desktop's is, and a `zoom` value would be the
    // registry naming a behaviour the window manager does not have.
    expect(orchard.windowButtons.side).toBe('left');
    expect(orchard.windowButtons.order)
      .toEqual(['close', 'minimize', 'maximize']);
    expect(hasWindowButton(orchard, 'maximize')).toBe(true);

    // It is the ONLY desktop on the left, which is what makes it a tell.
    expect(
      SKINS.filter((skin) => skin.windowButtons.side === 'left')
        .map((skin) => skin.id),
    ).toEqual(['orchard']);

    // And it is not on a distribution, because it is not Linux. A
    // package-manager column under a Mac would be a fabricated fact about a
    // machine - the same reason the issued Windows box has none.
    expect(orchard.family).toBe('mac');
    expect(orchard.distro).toBeNull();
  });

  /**
   * The three desktops that share the bottom edge and the same three window
   * buttons. Cinnamon, Xfce and LXQt are the case the spec calls out by name:
   * with the same panel position and the same titlebar, the LAUNCHER and the
   * palette are all that is left to tell them apart, so they must genuinely
   * differ - and the twin-chrome tooth above is what would catch it if a
   * fourth one landed on the same edge wearing the same corner.
   */
  it('tells the three bottom-panel Linux desktops apart', () => {
    const bottom = ['cinnamon', 'xfce', 'lxqt'] as const;
    const styles = new Set<string>();
    const labels = new Set<string>();
    const accents = new Set<string>();

    for (const id of bottom) {
      const skin = skinById(id);

      expect(skin.panel.position, id).toBe('bottom');
      styles.add(skin.panel.launcher.style);
      labels.add(skin.panel.launcher.label);
      accents.add(skin.tokens['--color-accent'] ?? '');
    }

    expect(styles.size).toBe(bottom.length);
    expect(labels.size).toBe(bottom.length);
    expect(accents.size).toBe(bottom.length);
  });

  it('refuses an id no desktop answers to', () => {
    // The id type is closed, so the cast is how a test asks the RUNTIME
    // question: a hand-edited save is refused by the parse, and this is the
    // other half of the same guard. Enlightenment is not shipped, which is the
    // only property this id needs - `xfce` used to sit here and is a real
    // desktop now.
    expect(() => skinById('enlightenment' as SkinId))
      .toThrow('Unknown desktop skin');
  });
});

describe('the distro axis', () => {
  it('pairs every desktop with a distro that ships it, or with none', () => {
    for (const skin of SKINS) {
      // A distribution rides under the LINUX family and under nothing else.
      // Asserted as "not Linux means null" rather than "Windows means null"
      // (0.33.0): with three families the old spelling would have let a Mac
      // quietly acquire a package manager, which is a fabricated fact about a
      // machine rather than a mispaired table row.
      if (skin.family !== 'linux') {
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

    // 0.28.0's three, paired the way they actually ship: Ubuntu MATE and
    // Lubuntu are official flavours, and Mint's other edition is the Xfce one.
    // No new distro is invented to hold them - the DE half of the pairing
    // points at a distro that already exists, which is what keeps this a table
    // rather than a second registry.
    expect(skinById('mate').distro).toBe('ubuntu');
    expect(skinById('xfce').distro).toBe('mint');
    expect(skinById('lxqt').distro).toBe('ubuntu');
  });

  it('speaks one verb per family, and all four are reachable', () => {
    expect(packageManagerFor('ubuntu')).toBe('apt');
    expect(packageManagerFor('mint')).toBe('apt');
    expect(packageManagerFor('fedora')).toBe('dnf');
    // 0.28.0's four. Debian is the row whose difference is TEMPERAMENT and not
    // a verb - it speaks the same apt Ubuntu does, on purpose - and RHEL shares
    // Fedora's dnf, which is what makes subscription-manager the one fact that
    // has to ask which DISTRO a box is rather than which verb it speaks.
    expect(packageManagerFor('debian')).toBe('apt');
    expect(packageManagerFor('rhel')).toBe('dnf');
    expect(packageManagerFor('opensuse')).toBe('zypper');
    expect(packageManagerFor('arch')).toBe('pacman');
    // A box that is not on a distro has no package manager at all, which is
    // the honest answer for the Windows one.
    expect(packageManagerFor(null)).toBeNull();
    // Every verb is actually reachable: a table where a manager was declared
    // and no distro shipped it would be a dialect nobody can get to.
    expect(new Set(DISTROS.map((distro) => distro.packageManager)))
      .toEqual(new Set(PACKAGE_MANAGERS));
  });

  it('ships a desktop with every distro except the one that does not', () => {
    // The pairing's distro half, and the single null in it. Arch is the null
    // BY DESIGN - it is the truest thing this axis says about Arch - so the
    // test names it rather than letting a future row quietly join it.
    for (const distro of DISTROS) {
      if (distro.id === 'arch') {
        expect(distro.defaultDesktop, distro.id).toBeNull();
        continue;
      }

      expect(distro.defaultDesktop, distro.id).not.toBeNull();
      expect(
        skinById(distro.defaultDesktop ?? 'gnome').family,
        distro.id,
      ).toBe('linux');
    }

    // The researched defaults for 0.28.0's rows: Debian's netinst default and
    // RHEL's workstation are GNOME, and openSUSE is the KDE one.
    expect(distroById('debian').defaultDesktop).toBe('gnome');
    expect(distroById('rhel').defaultDesktop).toBe('gnome');
    expect(distroById('opensuse').defaultDesktop).toBe('kde');
  });

  it('puts SELinux on the RHEL family and on nothing else', () => {
    // The one row on this table that is a MECHANIC rather than a vocabulary
    // (0.28.0), and the reason it is asserted as an exact SET rather than
    // per-row: the denial, the four verbs and their refusals are all read off
    // this column, so a future distro row that quietly claimed SELinux would
    // grow a beat nobody wrote, and one that dropped it would silently take
    // the beat away. Both are the same mistake and this catches either.
    const shipping = (module: SecurityModule): readonly string[] => DISTROS
      .filter((distro) => distro.securityModule === module)
      .map((distro) => distro.id)
      .sort((left, right) => left.localeCompare(right));

    expect(shipping('selinux')).toEqual(['fedora', 'rhel']);
    // The Debian family and openSUSE ship AppArmor, which is a real answer and
    // not the same as nothing - it is what the refusal names.
    expect(shipping('apparmor')).toEqual(['debian', 'mint', 'opensuse', 'ubuntu']);
    // And Arch ships neither until you set one up.
    expect(shipping(null)).toEqual(['arch']);

    expect(securityModuleFor('rhel')).toBe('selinux');
    expect(securityModuleFor('ubuntu')).toBe('apparmor');
    // A box that is not on a distro at all has as much SELinux on it as Arch
    // does, which is none - the same null, and the same answer to every caller.
    expect(securityModuleFor(null)).toBeNull();
  });

  it('refuses a distro nobody ships', () => {
    // Closed type, runtime guard: the same rule the skins keep.
    expect(() => distroById('slackware' as DistroId)).toThrow('Unknown distro');
  });
});

describe('choosing a desktop', () => {
  /**
   * The machine a request resolves to, for the cases that HAVE one.
   *
   * It fails rather than returning a default when the resolution is the
   * `needs-desktop` one, because a test that quietly read a missing desktop as
   * some fallback would be doing exactly what the union exists to stop the
   * product doing.
   */
  function resolved(
    current: DesktopChoiceState,
    choice: Parameters<typeof resolveDesktopChoice>[1],
  ): DesktopChoiceState {
    const resolution = resolveDesktopChoice(current, choice);

    if (resolution.kind !== 'choice') {
      throw new Error(`expected a machine, got "${resolution.kind}"`);
    }

    return resolution.next;
  }

  it('brings the paired distro along with the desktop', () => {
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { skin: 'cinnamon' }))
      .toEqual({ skin: 'cinnamon', distro: 'mint' });
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { skin: 'kde' }))
      .toEqual({ skin: 'kde', distro: 'fedora' });
  });

  it('installs the distro\'s own desktop when the box is not on Linux yet', () => {
    // There is no desktop to leave alone on the issued Windows box, so the
    // distro half of the pairing decides: Ubuntu ships GNOME, Mint ships
    // Cinnamon. A press that resolved to nothing here would be a dead click.
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { distro: 'ubuntu' }))
      .toEqual({ skin: 'gnome', distro: 'ubuntu' });
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { distro: 'mint' }))
      .toEqual({ skin: 'cinnamon', distro: 'mint' });
    // And 0.28.0's rows, which are the same rule and not a special case.
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { distro: 'debian' }))
      .toEqual({ skin: 'gnome', distro: 'debian' });
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { distro: 'opensuse' }))
      .toEqual({ skin: 'kde', distro: 'opensuse' });
  });

  it('makes the player pick a desktop for the distro that ships none', () => {
    // Arch on a machine with no desktop cannot resolve to one, and the
    // resolution SAYS SO rather than filling in a default nobody chose. This
    // is the version's sharpest single statement about Arch, so it is asserted
    // as the shape of the answer and not as a string.
    expect(resolveDesktopChoice(DEFAULT_DESKTOP_CHOICE, { distro: 'arch' }))
      .toEqual({ kind: 'needs-desktop', distro: 'arch' });

    // TEETH: give the row a default desktop and this stops being reachable.
    // Every OTHER distro resolves to a machine from the same starting point,
    // so a table that quietly grew a default for Arch would fail here rather
    // than silently skipping the only pick flow in the shell.
    for (const distro of DISTROS) {
      const resolution = resolveDesktopChoice(
        DEFAULT_DESKTOP_CHOICE,
        { distro: distro.id },
      );

      expect(resolution.kind, distro.id)
        .toBe(distro.id === 'arch' ? 'needs-desktop' : 'choice');
    }

    // The answer to the pick sets BOTH axes in one call, which is what keeps
    // the machine from ever being briefly on a distro nobody chose.
    expect(resolved(DEFAULT_DESKTOP_CHOICE, { skin: 'xfce', distro: 'arch' }))
      .toEqual({ skin: 'xfce', distro: 'arch' });

    // And nothing is asked on a box that ALREADY has a desktop: there is one
    // there to leave alone, which is the same independence rule as everywhere
    // else on this axis rather than an exemption for Arch.
    expect(resolved({ skin: 'mate', distro: 'ubuntu' }, { distro: 'arch' }))
      .toEqual({ skin: 'mate', distro: 'arch' });

    // The sentence the window opens the pick with names the distribution and
    // says what is being asked, rather than reading as a refusal.
    expect(needsDesktopReason('arch')).toContain('Arch Linux');
    expect(needsDesktopReason('arch')).toContain('Pick one');
  });

  it('leaves the desktop alone when only the distro is chosen', () => {
    // The axes are independent, and this is where that is true rather than
    // merely said: KDE on Fedora is a real machine, and so is KDE on Ubuntu.
    expect(resolved(
      { skin: 'kde', distro: 'fedora' },
      { distro: 'ubuntu' },
    )).toEqual({ skin: 'kde', distro: 'ubuntu' });
  });

  it('drops the distro when the issued Windows box comes back', () => {
    expect(resolved(
      { skin: 'gnome', distro: 'ubuntu' },
      { skin: 'deskpro' },
    )).toEqual({ skin: 'deskpro', distro: null });
  });

  /**
   * The Mac, on the axis that is not about it (0.33.0).
   *
   * TEETH: the branch used to read `family === 'windows'`, which was the same
   * sentence while there were two families. Put that spelling back and the
   * first two of these red - a Mac carrying dnf, and a Mac that could be
   * ASKED to carry pacman and would say yes.
   */
  it('never puts a distribution under the Mac, in either direction', () => {
    // Coming FROM Linux: the desktop changes and the distribution goes with
    // the machine it was on.
    expect(resolved({ skin: 'kde', distro: 'fedora' }, { skin: 'orchard' }))
      .toEqual({ skin: 'orchard', distro: null });

    // And asked for explicitly - the shape the desktop pick sends - it is
    // still refused a distribution, because there is no machine at the other
    // end of that request.
    expect(resolved(DEFAULT_DESKTOP_CHOICE, {
      skin: 'orchard',
      distro: 'arch',
    })).toEqual({ skin: 'orchard', distro: null });

    // The other direction is an INSTALL and resolves like one: a distribution
    // chosen on a machine that is not on Linux brings the desktop it ships,
    // whether the machine it is being put on is the beige box or the laptop.
    expect(resolved({ skin: 'orchard', distro: null }, { distro: 'mint' }))
      .toEqual({ skin: 'cinnamon', distro: 'mint' });
    // Including the one that ships none, which asks rather than inventing one.
    expect(resolveDesktopChoice({ skin: 'orchard', distro: null }, {
      distro: 'arch',
    })).toEqual({ kind: 'needs-desktop', distro: 'arch' });
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

  /**
   * The Mac behind the same gate, in its own sentence (0.33.0).
   *
   * The tier is the tier: a service-desk player does not get the design team's
   * hand-me-down any more than they get a Linux install. What differs is WHY,
   * and the refusal has to be the true one - "IT keeps the image" is an answer
   * about a machine nobody is asking about.
   *
   * TEETH: point `canChooseDesktop` at the Linux sentence for every family and
   * the hardware assertion below reds; drop the family check entirely and the
   * FIRST assertion reds, because the desk would be handed a laptop.
   */
  it('refuses the Mac below the tier, and for the right reason', () => {
    const refusal = canChooseDesktop({ skin: 'orchard', distro: null }, false);

    expect(refusal.ok).toBe(false);
    // Both refusals name the promotion, because both are the same tier and a
    // player has to be able to hear that they are.
    expect(refusal.ok ? '' : refusal.reason).toContain('promotion');
    // And this one is about the HARDWARE rather than about the image on the
    // issued box: it is a laptop somebody else is still using.
    expect(refusal.ok ? '' : refusal.reason).toBe(DESKTOP_TIER_REFUSAL_MAC);
    expect(DESKTOP_TIER_REFUSAL_MAC).toContain('hand-me-down');
    expect(DESKTOP_TIER_REFUSAL_MAC).not.toContain('image');

    // Past the promotion it is a machine like any other.
    expect(canChooseDesktop({ skin: 'orchard', distro: null }, true).ok)
      .toBe(true);
  });

  it('never refuses the box the desk was issued', () => {
    for (const engineer of [true, false]) {
      expect(canChooseDesktop(DEFAULT_DESKTOP_CHOICE, engineer).ok).toBe(true);
    }
  });
});
