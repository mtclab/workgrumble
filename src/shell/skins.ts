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
 *
 * 0.33.0 adds the THIRD FAMILY and the first LAYOUT FORK (docs/research/
 * mac-edition.md section 6): a Mac-shaped desktop, which needed three things
 * the seven desktops above it never asked for - a panel that is a MENU BAR
 * rather than a taskbar, a launcher that is a DOCK rather than a corner
 * button, and window buttons on the LEFT. All three are declared here as data
 * and read by the renderer, because a skin that reached for a per-skin branch
 * in the shell would be the skin system admitting it does not generalise.
 *
 * What it is NOT: Apple's trade dress. The menu bar, the dock and the button
 * side are interface LAYOUT - functional facts anybody may draw - and that is
 * the whole of what is copied. No logo, no wordmark, no claim to their type,
 * and no traffic-light colours: the buttons wear this skin's token palette
 * exactly as every other desktop's do. The name is a parody name.
 */

import type { DispatchResult } from '../engine-api';

/* -- what a skin is allowed to say ---------------------------------------- */

export const PANEL_POSITIONS = ['bottom', 'top'] as const;

export type PanelPosition = (typeof PANEL_POSITIONS)[number];

/**
 * What KIND of bar a panel is, which is a different question from where it
 * sits (0.33.0).
 *
 * Every desktop up to here had one answer: a `panel` - a taskbar, wherever it
 * is nailed. A MENU BAR is not that bar moved to the top. It is a strip that
 * belongs to the FOCUSED APPLICATION rather than to the window list: the app
 * whose window has the keyboard owns it, and it says which app that is. MATE's
 * top bar is emphatically NOT one - it is a panel with a launcher in it, which
 * is why the kind is data rather than "top means menu bar".
 *
 * The honest limit, written where it is decided rather than in a release note:
 * the apps in this shell have no MENU MODEL. There is no File, no Edit, no
 * per-app menu tree anywhere in this product, so a menu bar here shows the
 * focused app's NAME and the status end, and stops. Inventing a File menu with
 * nothing behind it would be chrome that lies about what it opens, which is
 * the one thing the whole skin system is built not to do.
 */
export const PANEL_KINDS = ['panel', 'menu-bar'] as const;

export type PanelKind = (typeof PANEL_KINDS)[number];

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
  /**
   * The Mac family's (0.33.0): a DOCK - an icon strip along the bottom, in the
   * MIDDLE of the screen rather than jammed into a corner, with the open
   * windows in the same strip as the launcher.
   *
   * It is a launcher style rather than a panel kind because that is what it
   * changes: the panel is still the bar that holds the launcher and the window
   * list, and what a dock does is stop putting them at the left edge with
   * words next to them. Magnification is NOT shipped - see the note on the
   * skin itself.
   */
  'dock',
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
   * Taskbar or menu bar (0.33.0). On BOTH panel shapes, because "which of my
   * bars is the menu bar" is a question a two-panel desktop can answer either
   * way - MATE's top bar is a panel and the Mac family's is a menu bar, and
   * they are on the same edge.
   */
  readonly kind: PanelKind;
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
 * On the single-panel desktops it is the whole of the chrome. On MATE it is
 * the panel along the top, and the taskbar along the bottom is the
 * `secondPanel` beside it; on the Mac family it is the DOCK, and the menu bar
 * over it is the second panel - the launcher is what decides which, not the
 * edge.
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
 * backlog the spec named (the Mac family) is the case that needs it. Every
 * Windows-or-Linux desktop puts them on the right, which is what all of the
 * researched DEs actually do; 0.33.0 is the entry that finally uses the other
 * value, with the ORDER reversed with it - close first, then minimize, then
 * the zoom slot. Both halves are needed and neither implies the other: a
 * left-hand row in min/max/close order would be nobody's desktop.
 *
 * The third button stays `maximize`, and that is a deliberate refusal. The
 * Mac family calls it zoom, but the mechanic behind this button is the
 * maximize toggle every other desktop's is, and a `zoom` value would be a
 * second name for one function - the registry claiming a behaviour the window
 * manager does not have. The ORDER is the layout fact; the label is the truth
 * about the button.
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
  'orchard',
] as const;

export type SkinId = (typeof SKIN_IDS)[number];

export interface Skin {
  readonly id: SkinId;
  /** What the chooser calls it. */
  readonly label: string;
  /** One line of what it is, in the game's voice. */
  readonly blurb: string;
  /**
   * Which family of machine this chrome belongs to - the same three the world
   * models (`MACHINE_OS`), because a desktop is a face on one of them.
   *
   * It decides two things and no more: whether a distro rides underneath (only
   * Linux has one) and which sentence a player below the engineer tier is
   * refused with. The `windows` entry is the box IT issues, which is why it is
   * the one family nobody is refused.
   */
  readonly family: 'windows' | 'linux' | 'mac';
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
   * Null off the Linux family: the Windows caricature is not a distro at all,
   * and neither is a Mac.
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

/** What a distribution has watching its processes, and null for neither. */
export type SecurityModule = 'selinux' | 'apparmor' | null;

export interface Distro {
  readonly id: DistroId;
  readonly label: string;
  /** The verb the box speaks. The whole of the dialect axis, wired thin. */
  readonly packageManager: PackageManager;
  /**
   * The mandatory-access-control layer this distribution ships ON by default
   * (0.28.0), and the one row on this table that is a MECHANIC rather than a
   * vocabulary.
   *
   * The RHEL family ships SELinux enforcing out of the box; the Debian family
   * and openSUSE ship AppArmor; Arch ships neither until you set one up. Only
   * the first of those does anything in this game - it is the one authored
   * denial - but the other two are here rather than as a `selinux: boolean`
   * because "this box has no SELinux" and "this box has nothing" are different
   * sentences, and the refusal a player gets for typing `getenforce` on the
   * wrong box is only useful if it says which.
   */
  readonly securityModule: SecurityModule;
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
    securityModule: 'apparmor',
    defaultDesktop: 'gnome',
    blurb: 'The one everything else is written for. Ships GNOME, and has '
      + 'opinions about how you install Firefox.',
  }),
  Object.freeze({
    id: 'mint',
    label: 'Linux Mint 22',
    packageManager: 'apt',
    securityModule: 'apparmor',
    defaultDesktop: 'cinnamon',
    blurb: 'Ubuntu with the corners sanded off. Ships Cinnamon, which is the '
      + 'point of it.',
  }),
  Object.freeze({
    id: 'debian',
    label: 'Debian 12 (bookworm)',
    packageManager: 'apt',
    securityModule: 'apparmor',
    defaultDesktop: 'gnome',
    blurb: 'The thing the other two are built out of, and the one that will '
      + 'still boot in nine years. The same apt, none of the enthusiasm, and '
      + 'nobody here is going to push a snap at you.',
  }),
  Object.freeze({
    id: 'fedora',
    label: 'Fedora 41',
    packageManager: 'dnf',
    securityModule: 'selinux',
    defaultDesktop: 'gnome',
    blurb: 'The upstream of the enterprise one, six months ahead of everybody. '
      + 'Ships GNOME; speaks dnf.',
  }),
  Object.freeze({
    id: 'rhel',
    label: 'RHEL 9 (or Rocky, or Alma)',
    packageManager: 'dnf',
    securityModule: 'selinux',
    defaultDesktop: 'gnome',
    blurb: 'The one the auditor has heard of. dnf, with yum still answering '
      + 'because thirty years of fingers do, and a subscription somebody was '
      + 'supposed to renew.',
  }),
  Object.freeze({
    id: 'opensuse',
    label: 'openSUSE Leap 15.6',
    packageManager: 'zypper',
    securityModule: 'apparmor',
    defaultDesktop: 'kde',
    blurb: 'The green one, with a chameleon on the wallpaper and YaST for '
      + 'absolutely everything. Ships KDE; speaks zypper, which is neither of '
      + 'the two verbs you already know.',
  }),
  Object.freeze({
    id: 'arch',
    label: 'Arch Linux',
    packageManager: 'pacman',
    securityModule: null,
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

/**
 * What is watching the processes on a box on this distro - and null both for a
 * distro that ships nothing and for a machine that is not on Linux at all.
 *
 * The two nulls mean the same thing to every caller (`getenforce` is not a
 * binary here), which is why they are not distinguished: a Windows box and an
 * Arch install have exactly as much SELinux on them as each other.
 */
export function securityModuleFor(distro: DistroId | null): SecurityModule {
  return distro === null ? null : distroById(distro).securityModule;
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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
    kind: 'panel',
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

/**
 * The Mac family: the design team's hand-me-down, and the first desktop in
 * this registry whose LAYOUT the shell could not previously describe.
 *
 * Three tells, all of them layout and all of them declared rather than coded:
 *
 * - a MENU BAR across the top, which is a panel `kind` and not a taskbar that
 *   has been moved. It belongs to whichever app has the keyboard, and it says
 *   which one that is. What it does NOT hold is menus, because this shell's
 *   apps have none - see `PANEL_KINDS`, where that limit is written down.
 * - a DOCK along the bottom, which is the launcher style: the strip is
 *   CENTRED, the words come off the buttons, and the launcher stands in it
 *   beside the open windows instead of in a corner by itself.
 * - the window buttons on the LEFT, in close-then-minimize-then-zoom order,
 *   which is the muscle-memory joke the whole slice is for: a week of aiming
 *   at the top right corner, and the thing up there now is the menu bar.
 *
 * Not shipped, and both are deliberate. DOCK MAGNIFICATION: the icons do not
 * swell under the pointer, because this shell has no pointer-driven layout
 * anywhere else and a strip that resized under the cursor would move the
 * button a player was aiming at - a gag paid for with a misclick. And the
 * TRAFFIC-LIGHT COLOURS: the buttons take this skin's palette like every other
 * desktop's do. Their side and their order are interface layout; their exact
 * three colours are somebody's trade dress, and this game does not need them
 * to make the joke land.
 *
 * No distro, for the same reason the Windows box has none: it is not Linux,
 * and a package-manager column under it would be a fabricated fact about a
 * machine.
 */
const ORCHARD: Skin = {
  id: 'orchard',
  label: 'Orchard 15',
  blurb: 'The design team replaced their laptops and the old one came to you, '
    + 'still logged into somebody\'s photo library. Menu bar along the top, a '
    + 'dock along the bottom, and the close button on the LEFT, which you will '
    + 'discover roughly forty times today.',
  family: 'mac',
  tokens: {
    // Light, low-contrast and almost bevel-free: the palette of a desktop that
    // has not drawn a raised grey button since the beige box was current.
    '--color-surface': '#f2f2f4',
    '--color-surface-raised': '#ffffff',
    '--color-surface-sunken': '#e2e2e6',
    '--color-surface-field': '#ffffff',
    '--color-bevel-light': '#ffffff',
    '--color-bevel-dark': '#d0d0d6',
    '--color-bevel-shadow': '#a6a6ae',
    '--color-ink': '#1d1d1f',
    '--color-ink-soft': '#5b5b63',
    '--color-ink-disabled': '#a6a6ae',
    '--color-ink-inverse': '#ffffff',
    // A muted graphite-teal rather than anybody's brand blue, and nowhere near
    // the three colours this skin is deliberately not wearing.
    '--color-accent': '#3f6f7a',
    '--color-accent-bright': '#5d97a3',
    '--color-accent-deep': '#2b4d55',
    '--color-accent-ink': '#ffffff',
    '--color-wallpaper': '#232733',
    '--color-wallpaper-weave': '#2c3140',
    '--color-wallpaper-glow': '#3a4152',
    // No claim on anybody's system font: a stack of faces that are actually
    // installed, in the order a Mac would find them.
    '--font-ui': '"Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif',
    // The same reasoning MATE's height is set by: two bars, so neither may
    // spend a taskbar's worth of the player's screen.
    '--size-taskbar': '32px',
    // The roundest chrome in the registry, which is the other half of "this is
    // not the beige box" before a single button is read.
    '--radius-chrome': '10px',
    '--bevel-raised': 'inset 0 0 0 1px var(--color-bevel-dark)',
    '--bevel-sunken': 'inset 0 0 0 1px var(--color-bevel-shadow)',
    '--bevel-window': 'inset 0 0 0 1px var(--color-bevel-dark)',
  },
  panel: {
    // The DOCK is the panel with the launcher in it, and it is at the bottom -
    // so the app list still opens upward from where it is pressed, exactly as
    // it does on the issued box.
    position: 'bottom',
    kind: 'panel',
    launcher: {
      style: 'dock',
      // A grid of applications, which is what pressing it opens. Named for
      // what it does rather than for anybody's product.
      label: 'Applications',
      icon: 'icon-applications',
    },
    windowList: true,
    // The clock is upstairs in the menu bar, which is where a Mac keeps it.
    tray: false,
  },
  secondPanel: {
    position: 'top',
    kind: 'menu-bar',
    // A menu bar is not a window list, and the dock downstairs already is one.
    windowList: false,
    tray: true,
  },
  // The tell, and the reason `side` was declared with nothing using it: LEFT,
  // close first. Not a hidden button, not a re-labelled one - the same three
  // controls the beige box has, at the other end and in the other order.
  windowButtons: { order: ['close', 'minimize', 'maximize'], side: 'left' },
  distro: null,
};

export const SKINS: readonly Skin[] = Object.freeze([
  DESKPRO,
  KDE,
  GNOME,
  CINNAMON,
  MATE,
  XFCE,
  LXQT,
  ORCHARD,
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
 * - Picking a DISTRO on a box that is not on Linux at all - the issued Windows
 *   one, or the hand-me-down Mac - installs it, so it brings the desktop that
 *   distro SHIPS (the distro half of the pairing). This is not a convenience:
 *   there is no desktop to leave alone on a machine that is not on Linux yet,
 *   and a press that resolved to nothing would be a dead click.
 * - Except on the one distro that ships NO desktop. Arch on a machine with no
 *   desktop yet resolves to `needs-desktop`, and the chooser makes the player
 *   pick - which is not a limitation being worked around, it is the truest
 *   single thing this axis says about Arch, so the resolution says it out loud.
 *
 * Going back to the issued Windows box drops the distro, because a Windows box
 * is not on one - and so does moving to the Mac, for the same reason and by
 * the same branch.
 */
export function resolveDesktopChoice(
  current: Readonly<DesktopChoiceState>,
  choice: Readonly<DesktopChoice>,
): DesktopResolution {
  if (choice.skin !== undefined) {
    const skin = skinById(choice.skin);

    // A distro rides under the LINUX family and under nothing else (0.33.0).
    // It used to read "not Windows", which was the same sentence while there
    // were two families and becomes a lie with three: a Mac carrying a
    // package-manager column would be this table inventing a fact about a
    // machine, and `{ skin: mac, distro: arch }` is a request the shell must
    // answer with a machine that exists.
    return skin.family === 'linux'
      ? {
        kind: 'choice',
        next: { skin: skin.id, distro: choice.distro ?? skin.distro },
      }
      : { kind: 'choice', next: { skin: skin.id, distro: null } };
  }

  if (choice.distro === undefined) {
    return {
      kind: 'choice',
      next: { skin: current.skin, distro: current.distro },
    };
  }

  // A box that is ALREADY on Linux keeps its desktop and changes distribution
  // underneath it, which is the independence rule. A Mac is not on one: asking
  // for Ubuntu there is the same request as asking for it on the issued
  // Windows box - an install - so it falls through to the branch below and
  // arrives wearing whatever that distribution ships.
  if (skinById(current.skin).family === 'linux') {
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
  const skin = skinById(next.skin);

  if (engineer || skin.family === 'windows') {
    return { ok: true };
  }

  return {
    ok: false,
    reason: skin.family === 'mac'
      ? DESKTOP_TIER_REFUSAL_MAC
      : DESKTOP_TIER_REFUSAL,
  };
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

/**
 * And the same gate said about the Mac, which is a different sentence because
 * it is a different refusal (0.33.0).
 *
 * The Linux one is about an IMAGE: the box on the desk is IT's, and what goes
 * on it is IT's call. This one is about HARDWARE that already exists and has
 * been promised to somebody else - the design team's old laptop, which goes to
 * an engineer because engineers are who it goes to. Answering that with "IT
 * keeps the image" would be the shell refusing a question nobody asked.
 *
 * Both name the PROMOTION, because both are the same tier and a player must be
 * able to hear that they are.
 */
export const DESKTOP_TIER_REFUSAL_MAC = 'That is the design team\'s '
  + 'hand-me-down, and there is a queue for it. The spare goes to whoever is '
  + 'carrying a laptop between sites and an on-call phone, which is the '
  + 'engineers\' tier and not the desk\'s - it arrives with the promotion. '
  + 'Until then you have the beige one, and the beige one has never once '
  + 'refused to open a Word attachment.';
