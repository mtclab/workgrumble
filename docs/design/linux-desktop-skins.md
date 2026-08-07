# Design: the Linux desktop + distro skins (E6 close / E5 skins)

**Dated 2026-08-07. Owner-seeded (2026-08-07): "more diverse - KDE, GNOME (yuck),
Cinnamon; Ubuntu, Mint, RHEL/Fedora." Grounded in the DE/distro taxonomy research.
The last E6 piece + the original E5-skins idea, made concrete.**

## The model: two orthogonal axes (LOOK vs DIALECT), exactly the 0.7.0 spike's split

The research confirms DE and distro are INDEPENDENT (openSUSE = KDE chrome + zypper
dialect; Fedora = GNOME chrome + dnf dialect; RHEL clones share dialect, any DE).
So the skin system is two separable overlays on the player's own machine:

- **DESKTOP ENVIRONMENT = the LOOK** (chrome, cosmetic, the visible variety the
  owner wants). Reskins the player's shell: panel position, launcher style, window-
  button set. World/apps/mechanics IDENTICAL. This is a tokens+layout overlay on
  the existing window manager - NOT a rewrite.
- **DISTRO = the DIALECT** (the command overlay). The package manager verb the box
  speaks (apt/dnf/zypper/pacman) + SELinux on/off. Reuses the 0.15-0.21 unix
  command engine with a small per-distro overlay (apt already exists; dnf/zypper
  are overlays on the same install/update/list mechanics).

The highest-signal TELLS to nail (from the research), so each skin is authentic not
generic:

### DE (chrome) tells
| DE | panel | launcher | window buttons | reputation |
| --- | --- | --- | --- | --- |
| KDE Plasma | bottom, full-width | Kickoff (bottom-left overlay) | min/max/close top-right | Windows-refugee-friendly, very configurable |
| GNOME | TOP bar only, NO taskbar | Activities overview (zoom) | **close-only, top-right** (no min/max) | opinionated/minimal, "yuck" per owner |
| Cinnamon | bottom | Start-menu clone (bottom-left) | min/max/close top-right | THE most Windows-like (Mint) |
| Xfce | bottom, single | classic menu | min/max/close | lightweight, no-frills, old hardware |
| MATE | TWO panels (top menu + bottom taskbar) | classic dual-menu | min/max/close | GNOME-2 continuation, classic |
| LXQt | single, taskbar-like | launcher | min/max/close | lightest, minimal/embedded |

### Distro (dialect) tells
| distro | pkg manager | default DE | SELinux | trait |
| --- | --- | --- | --- | --- |
| Ubuntu | apt (+snap push) | GNOME (left dock) | off | default beginner/server; snap controversy |
| Mint | apt (no snap) | Cinnamon | off | Windows-refugee desktop |
| Debian | apt | installer choice | off | old-but-rock-solid, the base |
| Fedora | dnf | GNOME | ON | bleeding edge, RHEL upstream |
| RHEL/Rocky/Alma | dnf/yum | GNOME | ON | enterprise standard; subscription-manager (RHEL); the CentOS diaspora |
| openSUSE | zypper + YaST | KDE | Leap off/Tumbleweed on | zypper + YaST signature |
| Arch | pacman | DIY | off | rolling, "btw I use arch" |

## The honest scope call: this is COSMETIC breadth, not the spine

The skin is the least load-bearing thing in the game (chrome). It is worth doing -
the owner wants the diversity, it proves the skin system generalises, it is the E6
capstone + the E5-skins payoff - but it ships as BREADTH, in cuts, not as one huge
GNOME-clone build:

**First version - the skin SYSTEM + 2-3 DEs + the distro-as-dialect seam.** An
engineer can switch their OWN desktop to a Linux look (title-gated, the seniors-run-
Linux thing). Ship the chrome-overlay system (panel/launcher/window-buttons as a
tokens+layout skin the shell reads) with 2-3 DEs that are maximally DISTINCT so the
system is proven general: **KDE** (Windows-like, the comfortable one), **GNOME**
(the top-bar/no-taskbar/close-only one - the owner's "yuck", worth having as the
foil), and **Cinnamon** (the Mint one). Plus the distro-as-dialect seam: the box's
distro decides apt vs dnf (reuse the 0.20.0 apt engine + a dnf overlay). The player
chooses a DE (+ implicitly a distro).

**Backlog (later cuts):** more DEs (Xfce/MATE/LXQt); more distros (the full apt/dnf/
zypper/pacman set + SELinux-enforcing as a real behaviour on the RHEL family +
Tumbleweed); the distro in-jokes (snap controversy, "btw I use arch", the CentOS->
Rocky/Alma diaspora, YaST); the era axis (the original two-axis family x edition -
Win eras too).

## Recommendation on SEQUENCING vs the org epic

The org-dysfunction epic (docs/design/org-dysfunction.md) is the bigger, more
distinctive prize - build that arc first. The skins are the E6 cosmetic capstone -
slot them as a breadth version when the org arc wants a lighter palate-cleanser, or
after. Both are planned + researched; neither blocks the other.
