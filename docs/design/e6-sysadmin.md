# Design: E6 - the sysadmin tier (the promotion, ssh, the unix terminal)

**Dated 2026-08-06. The north-star epic (issue #7). Grounded in three research
syntheses (the Engineer's day; the SD->Engineer promotion; the Ubuntu 24.04
command-surface fidelity). Builds on everything the game has shipped.**

Proposal for convergence, not locked - ideas are discussions.

## The finding: E6 is where the whole game converges

The game has spent 0.3-0.14 building the service-desk floor and the MSP arc. E6
is the payoff the north star named ("learned it from the game, used it in the
job"): the player is PROMOTED out of the service desk into a Linux systems
engineer, and every system already built turns out to have been the setup:

| Already built | What E6 turns it into |
| --- | --- |
| 0.7.0 Linux servers (visible, UNMANAGEABLE) + their real systemd units | the boxes you now ssh into and run `systemctl` against - the units are already seeded |
| 0.7.0 "your Windows tools don't reach a Linux box" honest refusal | RESOLVED - the promotion gives you the unix tools + ssh; the wall was the on-ramp |
| 0.8.0 scope-of-touch = the PAM tier model | the promotion crosses Tier 2 (workstation/helpdesk) -> Tier 1 (server/sysadmin), the same model, now on the PLAYER |
| 0.9.0 monitoring board | the on-call / paging surface (the 3am page, alert fatigue) |
| 0.10.0 change-request + maintenance window | change control for risky server work; break-glass for the fire |
| the tickets/SLA engine | now graded on uptime/MTTR/incidents, not ticket-count |

Nothing here is a rewrite; E6 is the lock the last 12 versions cut the key for.

## Axis 1 - THE PROMOTION (the epic's spine, a new mechanic)

The player crosses the PAM tier boundary. Microsoft's AD tier model (the same
industry framework 0.8.0's customer scope already uses) is the mechanic, made
truthful:

- **Tier 2 -> Tier 1**, one-way and DIRECTIONAL: you never lose service-desk
  access, you GAIN server access. Permanent. (Research: "higher tier admins must
  never expose credentials to lower tier; a promotion unlocks a new tier of
  machine.")
- EARNED, not given: the promotion is the payoff of career progression at the
  MSP (reputation built over the arc / passed reviews - the title-ladder idea
  from the earliest design). This is the game's first real PROMOTION (0.6.0 was a
  lateral employer switch; this is up).
- Grants, all at once: ssh to the servers, sudo (logged, per-command - never raw
  shared root), the unix terminal, the Linux estate to manage, and on-call.
- THE WEIGHT: "you can now `systemctl stop` something ten thousand people depend
  on." (Research: the junior who took down all of Amazon with a backup upgrade.)
  The game should dramatise the first time you can break prod.

## Axis 2 - ssh + THE UNIX TERMINAL (the biggest new build, fidelity-gated)

The 0.7.0 deferred spike, now built. The player reaches the Linux servers by ssh
and works them in a unix terminal held to the SAME fidelity bar as the Windows
terminal - families differ in OUTPUT SHAPE, not just spelling.

- **ssh** is its own mechanic, not a reskinned RDP: trust-on-first-use fingerprint
  prompt (`ED25519 key fingerprint SHA256:...`, appended to known_hosts), a
  bastion/ProxyJump (`ssh -J`) to reach an internal box, key auth, `sudo` (prompts
  YOUR password, governed by /etc/sudoers, logs to auth.log). A CHANGED host key
  is a scary refusal, not a fresh prompt - a real puzzle beat.
- **The unix command surface** (fidelity reference in the research, cite real
  output at build time): `systemctl status/restart/journalctl` (the richer ●-dot
  block that carries loaded/active/pid/cgroup/log-tail in one call, vs sc's flat
  STATE line; RESTART IS SILENT ON SUCCESS - never fabricate a confirmation),
  `ls -la` (mode/owner/group vs dir), `cd` bare -> HOME (the quirk), `df -h`/`du`
  (Mounted on, no drive letters), `ps aux`/`top`/`uptime` (load average - no
  Windows equivalent), `free -h`, `ip a` (CIDR /24 vs ipconfig), `ss -tlnp` (vs
  netstat), `ping` (CONTINUOUS, needs -c - the sharpest family diff), `dig` (the
  ANSWER SECTION vs nslookup), `apt`/`dpkg`, `id`/`getent passwd` (7 colon-fields),
  `chmod`/`chown` (rwx/octal). These READ the estate the same way the Windows
  commands do - `systemctl status nginx` reads the nginx unit node 0.7.0 seeded.
- **The honest "not installed" gags** (fidelity: a refusal teaches): `traceroute`,
  net-tools (`ifconfig`/`netstat`), and `htop` are NOT installed by default ->
  real `command not found` + Ubuntu's `sudo apt install <x>` hint, not a silent
  success. Teaches `ip`/`ss` as canonical, which is what Ubuntu itself does.
- The **SELinux-disable gag**: modelled as a BAD shortcut (quiets the log, trades
  security), never a real fix - the running joke every admin recognises.

## Axis 3 - THE SYSADMIN WORK (on-call, change control, the real tasks)

The tickets change shape from user problems to system problems, and reuse the
built surfaces:

- Real tasks: a service down (`systemctl restart`), a disk filling with logs
  (`df -h`/`du -sh` -> clear it), a cert expiring (the classic that took down O2
  and Teams - a monitoring/process failure, not technical), a failed deploy
  ("worked in staging"), capacity.
- **On-call** (reuse 0.9.0 board): paged by severity; the 3am alert that
  self-resolves before you open the laptop (real - PagerDuty delays notification
  for exactly this); alert fatigue (2000 alerts/week, 3% actionable); the
  blameless postmortem after.
- **Change control** (reuse 0.10.0 CR): risky prod work needs a maintenance
  window / approved change; a standard change is pre-approved and boring by
  design; **break-glass** accounts (vaulted, audited, emergency-only) for the fire.
- **Measured on uptime/MTTR/incidents**, not ticket-count/CSAT - the review shifts.

## What's E7, not E6

SRE/DevOps = automation replacing toil (cloud consoles, IaC, error budgets, code
that manages systems). Explicitly the NEXT unlock, defined by automation not by
deeper access. E6 is manual/scripted server ops + on-call + change control.

## Version phasing (the spine, then the depth)

E6 is a big epic like the MSP arc; it phases across versions.

**First version - THE PROMOTION + ssh + the unix terminal spine + the first
Linux fix.** The player earns the promotion (Tier 2 -> Tier 1); ssh to a Linux
server (the TOFU fingerprint mechanic); a CORE unix command set at fidelity
(`systemctl status/restart`, `journalctl -u`, `ls -la`, `df -h`, `ps aux`,
`ip a` - the essentials, reading the seeded units/estate); and the payoff task -
a service down on a Linux box you can NOW fix (ssh in, `systemctl restart`), the
0.7.0 wall finally down. Complete + playable: the day you become an engineer and
touch a Linux box for the first time.

**Backlog (later versions, one slice each):**
- The full unix command surface (network ss/ip/dig, capacity du, apt/patching,
  users/perms, the not-installed gags, sudo depth).
- On-call off the board (the 3am page, alert fatigue, the self-resolving alert).
- Change control / maintenance windows / break-glass for risky prod work.
- The characteristic incidents (disk-full, cert-expiry, failed-deploy) + the
  blameless postmortem.
- The player's own Linux DESKTOP as a choosable skin (the deferred 0.7.0 skin).
- bastion/ProxyJump depth; tmux; config-management touchpoints.

## Open sub-questions for the first version (converge before build)

1. HOW does the promotion trigger? Recommend: EARNED off career progression at
   the MSP (a reputation/tenure threshold, or an offer-style beat like 0.6.0's
   switch) - the promotion is the arc's payoff, not a free unlock.
2. Does the first version ship the player's own Linux DESKTOP, or keep the player
   on Windows and ssh OUT (research: both are real; many seniors ssh out from a
   Windows/Mac desktop)? Recommend: ssh OUT first (the player stays on their
   Windows desktop, opens ssh, works the remote Linux box) - the Linux desktop
   skin is its own later slice, and ssh-out is the truer first step.
3. How big is the first command set? Recommend: the ~6-8 ESSENTIALS that let you
   diagnose + fix a downed service (systemctl status/restart, journalctl, ls -la,
   df -h, ps aux, ip a), with the rest as backlog - enough to play the first fix,
   not the whole surface at once.
