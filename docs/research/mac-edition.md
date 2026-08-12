# Mac edition research spike (E5, third OS family)

Dated 2026-08-12. The per-edition realism spike the skin taxonomy mandates
(owner 2026-07-31: two-axis = family x edition, fidelity bar: simulate close
enough to real that people really learn). Scope: what `os: mac` must be true
about before it ships as (a) world data in estates, (b) an honesty-engine
family, (c) a player desktop + dialect. Sources at the bottom; every mechanic
below names the real thing it teaches.

## 0. Era ruling (precedent, not a new decision)

The estate already runs Ubuntu 24.04 systemd units against a 1998 desk
calendar - the era is comedy-elastic and the learning claim binds to CURRENT
reality. The Mac family follows the same ruling: modern macOS truth (zsh,
launchd, TCC, Gatekeeper, notarization), not System 8. The chrome may wink at
the era; the commands do not.

## 1. The service layer: launchd, not systemd

The macOS init/service manager is launchd; the tool is `launchctl`. What is
TRUE and teachable:

- Services are **property lists** in `/Library/LaunchDaemons` (root daemons),
  `/Library/LaunchAgents` and `~/Library/LaunchAgents` (per-user agents).
  The unit-file analogy to systemd is direct and honest.
- Two command vocabularies exist: legacy `load`/`unload` (what most
  instructions on the web still say) and modern `bootstrap`/`bootout` with
  explicit **domain targets** (`system`, `user/<uid>`, `gui/<uid>`).
  `launchctl list` lists loaded services; `launchctl kickstart -k
  <domain>/<label>` is the modern restart, replacing the unload/load
  two-step. `launchctl print <domain>/<label>` is the modern status read.
- Labels are reverse-DNS (`com.company.thing`) - a distinct dialect surface
  from systemd's `nginx.service` and Windows' `Spooler`.
- TEACHING HOOK: same action registry as `systemctl`/`sc`, third dialect
  column. The engine's `unit` node kind (shipped for Linux in 0.7.0) carries
  mac units unchanged; only the verb table and label style differ.

## 2. The log surface: Console.app + `log`

Unified logging since 10.12: `log show --last 1h --predicate ...`,
`log stream`. Console.app is the GUI over the same stream. Mapping: the
existing `event_log` renders through a third reader (Event Viewer / journalctl
/ Console). Same derived-not-duplicated rule as the spool directory: one
event_log, three faces.

## 3. The dialect: zsh + brew, sharing the unix table

- Default shell is **zsh** since Catalina (10.15). Bash remains installed but
  ancient (3.2, GPL2 freeze) - a true and funny KB fact.
- The unix command table shipped for Linux (ls/cat/ps/kill/df/ping...) is
  ~fully shared. Mac-specific overlays: `brew install/upgrade/list` as the
  package-manager column (Homebrew is the de-facto standard, not an Apple
  product - the KB should say so); `open <path>`; `pbcopy/pbpaste`;
  `softwareupdate --list`; `dscl` in place of AD-side account looks (deep
  cut, probably Engineer-tier); `networksetup`/`scutil` for the network
  read surfaces.
- Case-INSENSITIVE-but-preserving default filesystem (APFS default) - the
  inverse of the Linux case gag, its own trap: two files differing only in
  case cannot coexist, which bites people ARRIVING from Linux.

## 4. The frustration set (diverge, never escape - house rule)

Verified wordings and mechanics, each mappable to shipped rails:

- **Gatekeeper/notarization refusal**: unnotarized app -> "[App] cannot be
  opened because the developer cannot be verified. macOS cannot verify that
  this app is free from malware." (variant: "...because Apple cannot check it
  for malicious software."). The web-store/installable rail already exists;
  on a mac box an unvetted tool install hits THIS wall instead of the IT
  audit - policy enforced by the OS vendor rather than the employer, which
  is the joke and the lesson (right-click Open / System Settings override =
  the taught path).
- **TCC permission walls**: any remote-control/screen-view tool needs
  **Screen Recording** and **Accessibility** grants under Privacy & Security,
  approved by a LOCAL admin user; MDM (Jamf PPPC profiles) can pre-approve
  Accessibility but Screen Recording still wants the user's own click. This
  is the shipped "remote viewer" app meeting a dialog the TICKET is about:
  "I approved the wrong thing and now IT cannot see my screen."
- **OS upgrade nag + multi-GB updates**: the perennial "macOS Sequoia is
  ready to install" corner nag; major upgrades are multi-GB downloads that
  developers' fleets defer via MDM. Maps onto the forced-reboot rail as the
  family's OWN flavor: mac never force-reboots you mid-shift (that pain is
  Windows'), it NAGS eternally and eats the disk instead.
- **Dongles/peripherals**: USB-C dock roulette, the missing HDMI adapter at
  the client meeting - walk-up material, not a system.
- **The 90-day password + FileVault recovery key**: a locked-out designer
  whose FileVault key is in a drawer. Account rail exists.

## 5. The estate: creative agency archetype (axis-3, already designed)

`docs/design/estate-and-customers.md` already commits: creative/media agency =
Mac ~100%, 10GbE NAS for project files, **Jamf** as the MDM, Adobe CC. What
the research adds (verified):

- Adobe CC in a managed fleet = packages from the Adobe Admin Console
  deployed via Jamf; **Named User vs Shared Device licensing** is the real
  split and a true ticket seed ("the licence followed the person, the
  freelancer's seat expired mid-render").
- Jamf = the `sc`/`systemctl` analogue at FLEET grain (policies, profiles,
  Self Service). For the MSP scope model: a mac-heavy customer at
  helpdesk-tier scope = you read Jamf state, you do not push profiles
  (scope wall reuses the 0.8.0 machinery unchanged).
- The NAS is where the real tickets live: "Premiere says the project file is
  locked", "the share re-mounted read-only" - SMB truths, OS-agnostic
  mechanics, mac-flavored surfaces.

## 6. The chrome (player desktop, LOOK axis)

Biggest layout fork the skin system has taken (0.27/0.28 proved the overlay
system on 6 DEs, all bottom/top panels):

- **Global menu bar** (top, always, owns the focused app's menus) - a new
  panel KIND, not a repositioned panel.
- **Dock** (bottom center, magnifying icon strip) - a new launcher style.
- **Traffic lights on the LEFT** of the title bar, close-minimize-zoom.
- Windows' close-button muscle memory breaking = intended comedy; NPC
  OS-war chatter trio completes (owner sketch).

Ship order recommendation: chrome LAST (it is pure look); dialect + estate
first (they carry the learning claim).

## 7. What we refuse (honesty bar)

- No Terminal.app faking beyond the shared table + overlays - half a dialect
  is worse than none (0.2.3 ruling).
- Windows tools refuse mac hosts truthfully BY NAME ("that is a Mac on the
  wire; Screen Sharing or SSH, not RDP") - same refusal grammar as Linux.
- No Finder simulation; the drive surfaces stay terminal-grain.
- No Apple trade dress in art: menu bar/dock/traffic lights are LAYOUT facts
  (interface layouts are functional), Apple logos/wordmarks are not shipped.
  Parody naming per the cloud-provider precedent.

## 8. Slice map (for the version plan)

1. **World data + honesty (buildable now)**: `machineOs: 'mac'` third value;
   mac boxes seeded in a creative-vertical MSP customer; launchd `unit`
   baselines (real labels: com.apple.mDNSResponder, com.adobe.*,
   com.jamf.management.daemon); cross-family refusals on every Windows
   surface; Console face of event_log where SD-visible.
2. **The creative vertical content**: ELMWOOD-pattern customer (0.14.0
   dental = the template): 3 tickets, 3 distinct mac-true mechanics
   (TCC screen-recording grant walk-through; Gatekeeper unnotarized plugin
   refusal with the taught override; CC licence seat/NAS lock).
3. **Dialect (player-side, Engineer-gated like Linux was)**: zsh prompt +
   brew overlay on the unix table; `launchctl` verbs on the action registry.
4. **Chrome skin**: menu-bar panel kind + dock launcher + left traffic
   lights; hand-me-down-MacBook / design-team fiction for the gating.

Slices 1+2 = one shippable version (0.32.0) on entirely proven rails.
Slices 3+4 = the following version(s); 4 depends on nothing but is pure
cosmetics, 3 wants the same title-gating conversation E6 used.

## Sources (dated 2026-08-12)

- launchctl vocab + domains: ss64.com/mac/launchctl.html; masklinn's
  launchctl/launchd gist; alansiu.net launchctl-new-subcommand-basics.
- Gatekeeper wording: support.apple.com/102445 ("Safely open apps on your
  Mac"); macpaw.com fix-macos-cannot-verify; developer.apple.com forums
  121929/120016.
- TCC/PPPC: hexnode.com macos-tcc-pppc-permissions; community.jamf.com
  prompt-user-to-enable-screen-recording-tcc; HCL BigFix remote-control
  macOS permissions doc.
- Jamf + Adobe CC: docs.jamf.com technical paper "Administering Adobe
  Creative Cloud for Enterprise with Jamf Pro" (deployment, Named User vs
  Shared Device, reporting).
- Estate archetype: docs/design/estate-and-customers.md (already sourced:
  cubittech design-agency Mac).
