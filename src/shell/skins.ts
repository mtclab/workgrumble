/**
 * The skin system (0.27.0): the shell's chrome as DATA rather than as one
 * hardcoded Windows caricature.
 *
 * The model is the 0.7.0 spike's two orthogonal axes, and this file is the
 * first of them:
 *
 * - the DESKTOP ENVIRONMENT is the LOOK. It decides three things and nothing
 *   else: the TOKENS (overrides for the `:root` custom properties `theme.css`
 *   already declares - the styling seam this reuses rather than growing a
 *   parallel one), the PANEL (where the taskbar sits and what it holds), and
 *   the WINDOW BUTTONS (which of minimize/maximize/close a titlebar has, and
 *   where they sit). Nothing else. A skin cannot reach the world, the apps, the
 *   queue or a mechanic - it is a LOOK, and the same ticket is worked the same
 *   way under every one of them.
 * - the DISTRO is the DIALECT: which package manager the box speaks. It is the
 *   second axis and it lives at the bottom of this file, because a DE ships
 *   with a default distro and a distro ships with a default DE, and that
 *   pairing is data too.
 *
 * The Windows caricature (`deskpro`) is ONE ENTRY in this registry, and it
 * declares NO token overrides at all: the default renders byte-identically to
 * the build before the skin system existed, and the whole existing suite is the
 * gate on that. If a token had to be added to the default to make a skin work,
 * the skin system would have leaked into the default and the design would be
 * wrong.
 *
 * The per-DE facts below are the researched ones (docs/design/linux-desktop-
 * skins.md), not invented flavour: they are what makes each desktop
 * recognisable from its layout alone, which is the point of shipping three.
 */

import type { DispatchResult } from '../engine-api';

/* -- what a skin is allowed to say ---------------------------------------- */

export const PANEL_POSITIONS = ['bottom', 'top'] as const;

export type PanelPosition = (typeof PANEL_POSITIONS)[number];

/**
 * The launcher's shape, which is one of the sharpest per-DE tells: a Start
 * button, a Kickoff button, an Activities word, a Menu button. The style is
 * what the CSS keys off; the label is what the player reads.
 */
export const LAUNCHER_STYLES = [
  'start',
  'kickoff',
  'activities',
  'menu',
] as const;

export type LauncherStyle = (typeof LAUNCHER_STYLES)[number];

export interface LauncherSpec {
  readonly style: LauncherStyle;
  readonly label: string;
  /**
   * The glyph beside the label, or null for a launcher that is a WORD and
   * nothing else. GNOME's Activities is the null: a text button in the corner
   * of a top bar, which is exactly how the real one reads.
   */
  readonly icon: string | null;
}

/** Where the panel sits, and what it holds. */
export interface PanelSpec {
  readonly position: PanelPosition;
  readonly launcher: LauncherSpec;
  /**
   * Whether the panel carries a list of the open windows. GNOME is the false:
   * it has no taskbar at all, the overview replaces it, and a window list
   * bolted onto its top bar would be the one thing everybody notices is wrong.
   */
  readonly windowList: boolean;
  /** The clock/status end of the panel. Every shipped desktop has one. */
  readonly tray: boolean;
}

export const WINDOW_BUTTONS = ['minimize', 'maximize', 'close'] as const;

export type WindowButton = (typeof WINDOW_BUTTONS)[number];

/**
 * Which titlebar buttons exist, in the order they are drawn, and which end of
 * the titlebar they are drawn at.
 *
 * The ORDER is the list itself: a button that is not in it does not exist -
 * not hidden, not disabled, ABSENT from the DOM - because GNOME's close-only
 * titlebar is the sharpest tell of the three desktops and a CSS-hidden fake
 * would be the skin system lying about the one thing it was built to prove.
 *
 * `side` is declared because "and where" is half the question, and because the
 * backlog the spec names (the Mac family) is the case that needs it. Every
 * desktop shipped in 0.27.0 puts them on the right, which is what all three of
 * the researched DEs actually do.
 */
export interface WindowButtonSpec {
  readonly order: readonly WindowButton[];
  readonly side: 'left' | 'right';
}

export const SKIN_IDS = ['deskpro', 'kde', 'gnome', 'cinnamon'] as const;

export type SkinId = (typeof SKIN_IDS)[number];

export interface Skin {
  readonly id: SkinId;
  /** What the chooser calls it. */
  readonly label: string;
  /** One line of what it is, in the game's voice. */
  readonly blurb: string;
  /** Windows-caricature or Linux: what the box is running. */
  readonly family: 'windows' | 'linux';
  /**
   * Overrides for the `:root` custom properties in `theme.css`, applied to the
   * desktop element so every component under it picks them up. The default skin
   * declares NONE, which is what makes it byte-identical.
   */
  readonly tokens: Readonly<Record<string, string>>;
  readonly panel: PanelSpec;
  readonly windowButtons: WindowButtonSpec;
  /**
   * The distro this desktop ships on by default - the DE half of the pairing.
   * Null for the Windows caricature, which is not a distro at all.
   */
  readonly distro: DistroId | null;
}

/* -- the distro axis: the dialect, not the look --------------------------- */

export const DISTRO_IDS = ['ubuntu', 'mint', 'fedora'] as const;

export type DistroId = (typeof DISTRO_IDS)[number];

export const PACKAGE_MANAGERS = ['apt', 'dnf'] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export interface Distro {
  readonly id: DistroId;
  readonly label: string;
  /** The verb the box speaks. The whole of the dialect axis, wired thin. */
  readonly packageManager: PackageManager;
  /** The DE this distro ships by default - the distro half of the pairing. */
  readonly defaultDesktop: SkinId;
  readonly blurb: string;
}

/**
 * The three distros the first cut ships, one per package-manager verb plus the
 * one whose whole identity is the desktop.
 *
 * openSUSE (zypper), Arch (pacman), Debian and the RHEL rebuilds are backlog
 * with SELinux and the snap controversy: a fourth distro is another dialect to
 * write honestly, and a dialect written badly is worse than one not shipped.
 */
export const DISTROS: readonly Distro[] = Object.freeze([
  Object.freeze({
    id: 'ubuntu',
    label: 'Ubuntu 24.04 LTS',
    packageManager: 'apt',
    defaultDesktop: 'gnome',
    blurb: 'The one everything else is written for. Ships GNOME, and has '
      + 'opinions about how you install Firefox.',
  }),
  Object.freeze({
    id: 'mint',
    label: 'Linux Mint 22',
    packageManager: 'apt',
    defaultDesktop: 'cinnamon',
    blurb: 'Ubuntu with the corners sanded off. Ships Cinnamon, which is the '
      + 'point of it.',
  }),
  Object.freeze({
    id: 'fedora',
    label: 'Fedora 41',
    packageManager: 'dnf',
    defaultDesktop: 'gnome',
    blurb: 'The upstream of the enterprise one, six months ahead of everybody. '
      + 'Ships GNOME; speaks dnf.',
  }),
]);

export function distroById(id: DistroId): Distro {
  const found = DISTROS.find((distro) => distro.id === id);

  if (found === undefined) {
    throw new Error(`Unknown distro "${id}".`);
  }

  return found;
}

export function isDistroId(value: unknown): value is DistroId {
  return typeof value === 'string'
    && (DISTRO_IDS as readonly string[]).includes(value);
}

/** The verb a distro's box speaks, and null for a box that is not on one. */
export function packageManagerFor(
  distro: DistroId | null,
): PackageManager | null {
  return distro === null ? null : distroById(distro).packageManager;
}

/* -- the registry --------------------------------------------------------- */

/** The default: the Windows caricature this game has always shipped. */
export const DEFAULT_SKIN_ID: SkinId = 'deskpro';

const DESKPRO: Skin = {
  id: 'deskpro',
  label: 'DeskPro WorkGroup 98¾',
  blurb: 'The beige one IT issued you. Bottom taskbar, a Start button, three '
    + 'buttons in every titlebar, and a support contract that expired before '
    + 'you were hired.',
  family: 'windows',
  // DELIBERATELY EMPTY. The default skin is the theme as declared, so nothing
  // is set on the element and the chrome is the byte-identical one the whole
  // existing suite is written against.
  tokens: {},
  panel: {
    position: 'bottom',
    launcher: {
      style: 'start',
      label: 'Start',
      icon: 'icon-start',
    },
    windowList: true,
    tray: true,
  },
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: null,
};

/**
 * KDE Plasma: the comfortable landing.
 *
 * Bottom panel the full width of the screen, the Kickoff launcher in the far
 * bottom-left corner, min/max/close top-right - which is why the trade calls it
 * the Windows-refugee desktop, and why it is the first one an engineer who has
 * only ever run Windows should meet.
 */
const KDE: Skin = {
  id: 'kde',
  label: 'KDE Plasma',
  blurb: 'Bottom panel, Kickoff in the corner, all three window buttons where '
    + 'you left them. The one you hand somebody who has only ever run Windows '
    + '- and then they find the settings, and there are four thousand of them.',
  family: 'linux',
  tokens: {
    '--color-surface': '#eff0f1',
    '--color-surface-raised': '#fcfcfc',
    '--color-surface-sunken': '#e3e5e7',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#bdc3c7',
    '--color-bevel-shadow': '#9aa2a8',
    '--color-ink': '#232629',
    '--color-ink-soft': '#4d5459',
    '--color-ink-disabled': '#9aa2a8',
    '--color-ink-inverse': '#fcfcfc',
    '--color-accent': '#2980b9',
    '--color-accent-bright': '#3daee9',
    '--color-accent-deep': '#1f6a99',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#1b2833',
    '--color-wallpaper-weave': '#24384a',
    '--color-wallpaper-glow': '#2f4d63',
    '--font-ui': '"Noto Sans", "DejaVu Sans", Verdana, sans-serif',
    '--size-taskbar': '44px',
    '--radius-chrome': '3px',
    // Flat, the way every desktop built after 2005 is: the bevels are tokens,
    // so a skin can put the whole 9x plastic away without touching a rule.
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    position: 'bottom',
    launcher: {
      style: 'kickoff',
      label: 'Kickoff',
      icon: 'icon-kickoff',
    },
    windowList: true,
    tray: true,
  },
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'fedora',
};

/**
 * GNOME: the opinionated one, and deliberately the awkward one.
 *
 * A TOP BAR and no taskbar whatsoever - the overview replaces it - an
 * Activities button in the top-left, and the sharp tell: windows have a CLOSE
 * BUTTON ONLY. No minimize, no maximize, by design, because workspaces are
 * meant to replace both. It is in the game because it is the desktop people
 * either love or refuse, and a player should get to meet it and decide.
 */
const GNOME: Skin = {
  id: 'gnome',
  label: 'GNOME',
  blurb: 'Top bar, no taskbar, and one button on every window: close. No '
    + 'minimize, no maximize - that is not a bug, that is the design, and the '
    + 'argument about it has been going since 2011.',
  family: 'linux',
  tokens: {
    '--color-surface': '#f6f5f4',
    '--color-surface-raised': '#ffffff',
    '--color-surface-sunken': '#e1dedb',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#cdc7c2',
    '--color-bevel-shadow': '#9a9996',
    '--color-ink': '#2e3436',
    '--color-ink-soft': '#5e5c64',
    '--color-ink-disabled': '#9a9996',
    '--color-ink-inverse': '#ffffff',
    '--color-accent': '#3584e4',
    '--color-accent-bright': '#3584e4',
    '--color-accent-deep': '#3584e4',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#241f31',
    '--color-wallpaper-weave': '#2f2843',
    '--color-wallpaper-glow': '#3d3054',
    '--font-ui': 'Cantarell, "Noto Sans", "DejaVu Sans", sans-serif',
    // A slimmer bar than a taskbar - a top bar is not a place windows live, so
    // it does not need their height. Not slimmer than the tray inside it can
    // read at, because a clock nobody can see is not a tell, it is a bug.
    '--size-taskbar': '34px',
    '--radius-chrome': '8px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-shadow)',
  },
  panel: {
    position: 'top',
    launcher: {
      style: 'activities',
      label: 'Activities',
      // A word in the corner and nothing else, which is exactly the real one.
      icon: null,
    },
    windowList: false,
    tray: true,
  },
  // The tell. Not hidden, not disabled: the two buttons are not built.
  windowButtons: { order: ['close'], side: 'right' },
  distro: 'ubuntu',
};

/**
 * Cinnamon: Mint's, and the joke.
 *
 * A bottom panel, a Start-menu-shaped launcher in the bottom-left, min/max/
 * close - the most Windows-like desktop there is, which is the whole gag of
 * switching to Linux and landing somewhere that looks like what you left.
 */
const CINNAMON: Skin = {
  id: 'cinnamon',
  label: 'Cinnamon',
  blurb: 'Mint\'s. A panel along the bottom, a menu button in the corner, '
    + 'three window buttons. You have left Windows and arrived somewhere that '
    + 'looks like Windows, which is either the joke or the point.',
  family: 'linux',
  tokens: {
    '--color-surface': '#dad6d0',
    '--color-surface-raised': '#f5f4f2',
    '--color-surface-sunken': '#c6c2bc',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#b3aea6',
    '--color-bevel-shadow': '#8b867e',
    '--color-ink': '#2f2f2f',
    '--color-ink-soft': '#5a5a5a',
    '--color-ink-disabled': '#8b867e',
    '--color-ink-inverse': '#ffffff',
    '--color-accent': '#5f8c2f',
    '--color-accent-bright': '#86be43',
    '--color-accent-deep': '#3f6120',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#26302a',
    '--color-wallpaper-weave': '#2f3b33',
    '--color-wallpaper-glow': '#3c4c41',
    '--font-ui': 'Ubuntu, "Noto Sans", "DejaVu Sans", sans-serif',
    '--size-taskbar': '40px',
    '--radius-chrome': '4px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    position: 'bottom',
    launcher: {
      style: 'menu',
      label: 'Menu',
      icon: 'icon-menu',
    },
    windowList: true,
    tray: true,
  },
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'mint',
};

export const SKINS: readonly Skin[] = Object.freeze([
  DESKPRO,
  KDE,
  GNOME,
  CINNAMON,
]);

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string'
    && (SKIN_IDS as readonly string[]).includes(value);
}

/**
 * The skin for an id.
 *
 * The one lookup the whole chrome hangs off: the desktop reads the panel and
 * the tokens through it and the window renderer reads the buttons through it,
 * so reverting it to "always the default" is what makes every desktop render
 * identically - which is the tooth `skins.test.ts` keeps.
 */
export function skinById(id: SkinId): Skin {
  const found = SKINS.find((skin) => skin.id === id);

  if (found === undefined) {
    throw new Error(`Unknown desktop skin "${id}".`);
  }

  return found;
}

/** Whether a titlebar under this skin has a given button AT ALL. */
export function hasWindowButton(
  skin: Readonly<Skin>,
  button: WindowButton,
): boolean {
  return skin.windowButtons.order.includes(button);
}

/* -- the choice, and the gate on it --------------------------------------- */

/**
 * What the box is running: the desktop, and the distro underneath it.
 *
 * It is SCREEN state, not world state - it changes what the chrome looks like
 * and which package manager the box speaks, not what is true about the estate -
 * so it rides in the save-carried shell store beside the open windows and the
 * install set, and no golden world hash moves because somebody changed their
 * wallpaper. A Windows box has no distro, which is why `distro` is null there
 * rather than a default nobody chose.
 */
export interface DesktopChoiceState {
  readonly skin: SkinId;
  readonly distro: DistroId | null;
}

export const DEFAULT_DESKTOP_CHOICE: DesktopChoiceState = Object.freeze({
  skin: DEFAULT_SKIN_ID,
  distro: null,
});

/** A request to change one or both axes. Anything left out is left alone. */
export interface DesktopChoice {
  readonly skin?: SkinId;
  readonly distro?: DistroId;
}

/**
 * The choice a request resolves to, before the gate sees it - the pairing,
 * used in both directions.
 *
 * - Picking a DESKTOP carries its paired distro along (the DE half of the
 *   pairing): a player who picks Cinnamon gets Mint underneath it without
 *   having to know that.
 * - Picking a DISTRO on a box that is already on one leaves the desktop alone,
 *   because the axes are genuinely independent: Fedora running KDE is a real
 *   machine, and a chooser that dragged the desktop back to GNOME would teach
 *   the opposite of what the model says.
 * - Picking a DISTRO on the issued Windows box installs it, so it brings the
 *   desktop that distro SHIPS (the distro half of the pairing). This is not a
 *   convenience: there is no desktop to leave alone on a machine that is not on
 *   Linux yet, and a press that resolved to nothing would be a dead click.
 *
 * Going back to the issued Windows box drops the distro, because a Windows box
 * is not on one.
 */
export function resolveDesktopChoice(
  current: Readonly<DesktopChoiceState>,
  choice: Readonly<DesktopChoice>,
): DesktopChoiceState {
  if (choice.skin !== undefined) {
    const skin = skinById(choice.skin);

    return skin.family === 'windows'
      ? { skin: skin.id, distro: null }
      : { skin: skin.id, distro: choice.distro ?? skin.distro };
  }

  if (choice.distro === undefined) {
    return { skin: current.skin, distro: current.distro };
  }

  return skinById(current.skin).family === 'windows'
    ? {
      skin: distroById(choice.distro).defaultDesktop,
      distro: choice.distro,
    }
    : { skin: current.skin, distro: choice.distro };
}

/**
 * Whether a resolved choice is one this player may actually make.
 *
 * The gate is the PROMOTION, the same one ssh keeps and for the same reason:
 * putting Linux on the machine you were issued is not a service-desk move. It
 * is not a permission the game is being coy about either - the refusal says
 * what it is and what changes it, because a control that goes nowhere with no
 * sentence is the dead end the house rules forbid.
 *
 * Pure and total, so the gate a test drives is the gate the desktop keeps.
 */
export function canChooseDesktop(
  next: Readonly<DesktopChoiceState>,
  engineer: boolean,
): DispatchResult {
  if (engineer || skinById(next.skin).family === 'windows') {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'IT issues the desk a Windows box and IT keeps the image. Putting '
      + 'your own desktop on it is the engineers\' tier, not the desk\'s - it '
      + 'arrives with the promotion, along with the ssh that makes it worth '
      + 'having.',
  };
}
