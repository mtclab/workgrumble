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
 * recognisable from its layout alone, which is the point of shipping more than
 * one. 0.27.0 shipped three (KDE, GNOME, Cinnamon); 0.28.0 added the rest of
 * the researched set (MATE, Xfce, LXQt) and, with MATE, the one thing the
 * original shape could not say: a desktop with TWO panels.
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
  /** MATE's: a WORD in a menu bar, the GNOME-2 shape it continues. */
  'classic',
  /** Xfce's: the Applications menu, with the grid glyph beside it. */
  'applications',
  /** LXQt's: a button with the desktop's name on it and no decoration. */
  'plain',
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

/**
 * Where a panel sits and what it holds - everything about a panel EXCEPT the
 * launcher.
 *
 * The launcher is deliberately not in here, because a desktop has exactly one
 * of them however many panels it has: MATE's menu bar carries it and MATE's
 * taskbar does not. Making it a per-panel field would have meant a nullable
 * launcher on every skin plus an "exactly one panel has it" rule the compiler
 * cannot keep, so the launcher lives on the panel that always exists (below)
 * and the SECOND panel is this shape - see `Skin.secondPanel`.
 */
export interface SecondPanelSpec {
  readonly position: PanelPosition;
  /**
   * Whether the panel carries a list of the open windows. GNOME is the false:
   * it has no taskbar at all, the overview replaces it, and a window list
   * bolted onto its top bar would be the one thing everybody notices is wrong.
   */
  readonly windowList: boolean;
  /** The clock/status end of the panel. Every shipped desktop has one. */
  readonly tray: boolean;
}

/**
 * The panel every desktop has: the one with the launcher in it.
 *
 * On the six single-panel desktops it is the whole of the chrome. On MATE it
 * is the menu bar along the top, and the taskbar along the bottom is the
 * `secondPanel` beside it.
 */
export interface PanelSpec extends SecondPanelSpec {
  readonly launcher: LauncherSpec;
}

export const WINDOW_BUTTONS = ['minimize', 'maximize', 'close'] as const;

export type WindowButton = (typeof WINDOW_BUTTONS)[number];

/**
 * Which titlebar buttons exist, in the order they are drawn, and which end of
 * the titlebar they are drawn at.
 *
 * The ORDER is the list itself: a button that is not in it does not exist -
 * not hidden, not disabled, ABSENT from the DOM - because GNOME's close-only
 * titlebar is the sharpest tell in the whole registry and a CSS-hidden fake
 * would be the skin system lying about the one thing it was built to prove.
 *
 * `side` is declared because "and where" is half the question, and because the
 * backlog the spec names (the Mac family) is the case that needs it. Every
 * desktop shipped so far puts them on the right, which is what all of the
 * researched DEs actually do.
 */
export interface WindowButtonSpec {
  readonly order: readonly WindowButton[];
  readonly side: 'left' | 'right';
}

export const SKIN_IDS = [
  'deskpro',
  'kde',
  'gnome',
  'cinnamon',
  'mate',
  'xfce',
  'lxqt',
] as const;

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
  /**
   * The OTHER panel, for the one desktop that has two (0.28.0).
   *
   * MATE is a menu bar along the top AND a taskbar along the bottom - the
   * GNOME-2 arrangement it exists to continue - and that is a layout no amount
   * of tokens can say. It is a field rather than a `panels` array because a
   * launcher is a per-DESKTOP singleton, not a per-panel one: an array would
   * have made `launcher` nullable on every panel of every skin and left the
   * "exactly one of them has it" rule to a runtime check, where this shape
   * makes the launcher panel the one that cannot be missing. Every other
   * desktop says `null` here, which is the extension staying out of their way -
   * and the default skin is byte-identical because a null second panel is not
   * built at all.
   */
  readonly secondPanel: SecondPanelSpec | null;
  readonly windowButtons: WindowButtonSpec;
  /**
   * The distro this desktop ships on by default - the DE half of the pairing.
   * Null for the Windows caricature, which is not a distro at all.
   */
  readonly distro: DistroId | null;
}

/* -- the distro axis: the dialect, not the look --------------------------- */

export const DISTRO_IDS = [
  'ubuntu',
  'mint',
  'debian',
  'fedora',
  'rhel',
  'opensuse',
  'arch',
] as const;

export type DistroId = (typeof DISTRO_IDS)[number];

export const PACKAGE_MANAGERS = ['apt', 'dnf', 'zypper', 'pacman'] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export interface Distro {
  readonly id: DistroId;
  readonly label: string;
  /** The verb the box speaks. The whole of the dialect axis, wired thin. */
  readonly packageManager: PackageManager;
  /**
   * The DE this distro ships by default - the distro half of the pairing, and
   * NULL for the one distro that genuinely ships none.
   *
   * Arch is the null, and it is not a gap in the table: a distribution that
   * hands you a base system and no desktop is the truest single fact this axis
   * has to say, so the type says it rather than a default nobody chose being
   * quietly filled in. What the shell does with a null is
   * `resolveDesktopChoice`'s `needs-desktop` answer: the player is made to pick.
   */
  readonly defaultDesktop: SkinId | null;
  readonly blurb: string;
}

/**
 * The distros, one row per dialect the boxes in this game can speak plus the
 * ones whose difference is temperament rather than a verb.
 *
 * The whole of a distro is DATA over the ONE package engine: the same derived
 * pending set, the same `installed_packages` field, the same two registered
 * actions. What a row changes is the WORDS (and, for Arch, whether there is a
 * desktop at all) - which is exactly what changes when a real engineer walks
 * onto an unfamiliar box at two in the morning.
 *
 * Debian is deliberately mechanically identical to Ubuntu: it is the same apt,
 * and its trait is temperament, which is flavour and not a second engine. A
 * dialect written badly is worse than one not shipped, so a distro only grows a
 * verb table when it really has other verbs.
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
    id: 'debian',
    label: 'Debian 12 (bookworm)',
    packageManager: 'apt',
    defaultDesktop: 'gnome',
    blurb: 'The thing the other two are built out of, and the one that will '
      + 'still boot in nine years. The same apt, none of the enthusiasm, and '
      + 'nobody here is going to push a snap at you.',
  }),
  Object.freeze({
    id: 'fedora',
    label: 'Fedora 41',
    packageManager: 'dnf',
    defaultDesktop: 'gnome',
    blurb: 'The upstream of the enterprise one, six months ahead of everybody. '
      + 'Ships GNOME; speaks dnf.',
  }),
  Object.freeze({
    id: 'rhel',
    label: 'RHEL 9 (or Rocky, or Alma)',
    packageManager: 'dnf',
    defaultDesktop: 'gnome',
    blurb: 'The one the auditor has heard of. dnf, with yum still answering '
      + 'because thirty years of fingers do, and a subscription somebody was '
      + 'supposed to renew.',
  }),
  Object.freeze({
    id: 'opensuse',
    label: 'openSUSE Leap 15.6',
    packageManager: 'zypper',
    defaultDesktop: 'kde',
    blurb: 'The green one, with a chameleon on the wallpaper and YaST for '
      + 'absolutely everything. Ships KDE; speaks zypper, which is neither of '
      + 'the two verbs you already know.',
  }),
  Object.freeze({
    id: 'arch',
    label: 'Arch Linux',
    packageManager: 'pacman',
    // No default desktop, on purpose and by the distribution's own design.
    defaultDesktop: null,
    blurb: 'You install a base system and then you decide what a desktop even '
      + 'is, because it does not come with one. Rolling: "current" is a tense '
      + 'here, not a state.',
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
  secondPanel: null,
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
  secondPanel: null,
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
  secondPanel: null,
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
  secondPanel: null,
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'mint',
};

/**
 * MATE: the GNOME-2 continuation, and the reason the second panel exists.
 *
 * TWO panels. A menu bar along the top whose launcher is a WORD - the classic
 * Applications menu, no glyph, exactly the bar GNOME 2 had - and a taskbar
 * along the bottom carrying the window list and the tray. Every other desktop
 * in this registry says everything it has to say with one panel; this one
 * cannot, and that is precisely why it is here: the layout IS the tell, and no
 * amount of tokens can fake a second bar.
 */
const MATE: Skin = {
  id: 'mate',
  label: 'MATE',
  blurb: 'GNOME 2, carried on by people who refused to let it go. A menu bar '
    + 'across the top, a taskbar across the bottom, and a window manager that '
    + 'has not changed its mind about anything since 2010.',
  family: 'linux',
  tokens: {
    // The warm brown-orange of the era it continues, which is the one palette
    // nothing else in this registry is anywhere near.
    '--color-surface': '#efe9e3',
    '--color-surface-raised': '#faf7f4',
    '--color-surface-sunken': '#ddd5cc',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#c3b8ac',
    '--color-bevel-shadow': '#948877',
    '--color-ink': '#2b2622',
    '--color-ink-soft': '#5a5148',
    '--color-ink-disabled': '#948877',
    '--color-ink-inverse': '#ffffff',
    '--color-accent': '#b35b2e',
    '--color-accent-bright': '#d97c48',
    '--color-accent-deep': '#8a431f',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#2f2620',
    '--color-wallpaper-weave': '#3a2f27',
    '--color-wallpaper-glow': '#4a3b30',
    '--font-ui': '"DejaVu Sans", "Noto Sans", Verdana, sans-serif',
    // Slimmer than anybody else's, because there are two of them: a desktop
    // that spent a taskbar's height twice would have given the player a
    // smaller screen as a styling decision.
    '--size-taskbar': '32px',
    '--radius-chrome': '2px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    position: 'top',
    launcher: {
      style: 'classic',
      label: 'Applications',
      // A word in a menu bar, the way the GNOME-2 bar read.
      icon: null,
    },
    // The menu bar is a MENU BAR: the open windows are downstairs, and the
    // clock is down there with them.
    windowList: false,
    tray: false,
  },
  secondPanel: {
    position: 'bottom',
    windowList: true,
    tray: true,
  },
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'ubuntu',
};

/**
 * Xfce: the no-frills one, and the desktop that outlives the hardware.
 *
 * A single bottom panel, the classic Applications menu with the grid glyph
 * beside it, all three window buttons. Told apart from Cinnamon and LXQt by
 * the launcher (a named Applications menu rather than a Start-menu clone or a
 * bare button) and by a palette with no colour in it worth the name - which is
 * the honest look of a desktop whose entire pitch is that it does not get in
 * the way.
 */
const XFCE: Skin = {
  id: 'xfce',
  label: 'Xfce',
  blurb: 'The one that still runs on the laptop everybody else gave up on. No '
    + 'animations, no opinions, an Applications menu in the corner, and it '
    + 'will be exactly like this in ten years.',
  family: 'linux',
  tokens: {
    '--color-surface': '#e8eaec',
    '--color-surface-raised': '#f7f8f9',
    '--color-surface-sunken': '#d5d9dd',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#b6bcc2',
    '--color-bevel-shadow': '#868f97',
    '--color-ink': '#22282d',
    '--color-ink-soft': '#4f585f',
    '--color-ink-disabled': '#868f97',
    '--color-ink-inverse': '#ffffff',
    // Slate rather than a colour: Greybird's whole personality is restraint.
    '--color-accent': '#5c6f7d',
    '--color-accent-bright': '#7f96a5',
    '--color-accent-deep': '#3f4d58',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#2b3138',
    '--color-wallpaper-weave': '#353d45',
    '--color-wallpaper-glow': '#454f59',
    '--font-ui': '"Noto Sans", "DejaVu Sans", Tahoma, sans-serif',
    '--size-taskbar': '36px',
    '--radius-chrome': '2px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    position: 'bottom',
    launcher: {
      style: 'applications',
      label: 'Applications',
      icon: 'icon-applications',
    },
    windowList: true,
    tray: true,
  },
  secondPanel: null,
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'mint',
};

/**
 * LXQt: the lightest, and the one with the least to say.
 *
 * One SLIM bottom panel - the shortest bar any desktop here draws - and a
 * launcher that is the desktop's own name on a plain button: no glyph, no
 * accent, no Start-menu costume. That is the third bottom-panel desktop told
 * apart from the other two by layout and launcher alone, which is the bar the
 * spec sets.
 */
const LXQT: Skin = {
  id: 'lxqt',
  label: 'LXQt',
  blurb: 'The lightest desktop that is still a desktop. A thin bar along the '
    + 'bottom, a button with its own name on it, and enough memory left over '
    + 'to actually open the thing you came here to open.',
  family: 'linux',
  tokens: {
    '--color-surface': '#f2f4f6',
    '--color-surface-raised': '#ffffff',
    '--color-surface-sunken': '#e0e5ea',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#c2ccd4',
    '--color-bevel-shadow': '#8e9aa4',
    '--color-ink': '#1e2830',
    '--color-ink-soft': '#4a5760',
    '--color-ink-disabled': '#8e9aa4',
    '--color-ink-inverse': '#ffffff',
    '--color-accent': '#1f8fa5',
    '--color-accent-bright': '#2fb0c9',
    '--color-accent-deep': '#14636f',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#1c2430',
    '--color-wallpaper-weave': '#26303d',
    '--color-wallpaper-glow': '#33404f',
    '--font-ui': '"Noto Sans", "DejaVu Sans", Arial, sans-serif',
    // The slimmest bar in the registry, and the tell you can see across the
    // room. Not slimmer than the tray inside it can be read at, for the same
    // reason GNOME's top bar is not.
    '--size-taskbar': '30px',
    '--radius-chrome': '0px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    position: 'bottom',
    launcher: {
      style: 'plain',
      label: 'LXQt',
      icon: null,
    },
    windowList: true,
    tray: true,
  },
  secondPanel: null,
  windowButtons: { order: ['minimize', 'maximize', 'close'], side: 'right' },
  distro: 'ubuntu',
};

export const SKINS: readonly Skin[] = Object.freeze([
  DESKPRO,
  KDE,
  GNOME,
  CINNAMON,
  MATE,
  XFCE,
  LXQT,
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
 * What a request resolves to: a machine to put on the screen, or the one
 * question that has to be answered before there is one.
 *
 * It is a union rather than a state plus a boolean because the second case has
 * no state to hand back - a distro that ships no desktop leaves the resolution
 * genuinely incomplete, and a shape that returned some desktop anyway would be
 * the table quietly inventing the answer Arch exists to refuse to give.
 */
export type DesktopResolution =
  | { readonly kind: 'choice'; readonly next: DesktopChoiceState }
  | { readonly kind: 'needs-desktop'; readonly distro: DistroId };

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
 * - Except on the one distro that ships NO desktop. Arch on a machine with no
 *   desktop yet resolves to `needs-desktop`, and the chooser makes the player
 *   pick - which is not a limitation being worked around, it is the truest
 *   single thing this axis says about Arch, so the resolution says it out loud.
 *
 * Going back to the issued Windows box drops the distro, because a Windows box
 * is not on one.
 */
export function resolveDesktopChoice(
  current: Readonly<DesktopChoiceState>,
  choice: Readonly<DesktopChoice>,
): DesktopResolution {
  if (choice.skin !== undefined) {
    const skin = skinById(choice.skin);

    return skin.family === 'windows'
      ? { kind: 'choice', next: { skin: skin.id, distro: null } }
      : {
        kind: 'choice',
        next: { skin: skin.id, distro: choice.distro ?? skin.distro },
      };
  }

  if (choice.distro === undefined) {
    return {
      kind: 'choice',
      next: { skin: current.skin, distro: current.distro },
    };
  }

  if (skinById(current.skin).family !== 'windows') {
    return {
      kind: 'choice',
      next: { skin: current.skin, distro: choice.distro },
    };
  }

  const shipped = distroById(choice.distro).defaultDesktop;

  return shipped === null
    ? { kind: 'needs-desktop', distro: choice.distro }
    : { kind: 'choice', next: { skin: shipped, distro: choice.distro } };
}

/**
 * What the shell says to a distro that was chosen blind and ships no desktop.
 *
 * It lives beside the table because it is a fact ABOUT the table, and because
 * the chooser and the shell both have to say the same thing: the window opens
 * the pick with it, and a `setDesktop` that reaches the same case without one
 * refuses with it.
 */
export function needsDesktopReason(distro: DistroId): string {
  return `${distroById(distro).label} does not ship a desktop. That is not an `
    + 'oversight and it is not this window being awkward - it is the whole '
    + 'position of the distribution: you install a base system, and then you '
    + 'decide what a desktop even is. Pick one and it goes on with it.';
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

  return { ok: false, reason: DESKTOP_TIER_REFUSAL };
}

/**
 * The tier refusal itself, named because two callers need the same sentence:
 * the gate above, and the `needs-desktop` branch of `setDesktop`, which has no
 * resolved state to hand the gate and must not answer "pick a desktop" to
 * somebody who is not allowed one either way.
 */
export const DESKTOP_TIER_REFUSAL = 'IT issues the desk a Windows box and IT '
  + 'keeps the image. Putting your own desktop on it is the engineers\' tier, '
  + 'not the desk\'s - it arrives with the promotion, along with the ssh that '
  + 'makes it worth having.';
