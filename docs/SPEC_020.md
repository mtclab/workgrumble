# v0.2.0 spec: the machine is a real machine

Shipped in slices, each its own release with in-game notes. Standing bars + git rules apply. M0 golden immutable; other goldens move per slice with justified numbers.

Slice order is deliberate: the account model first (cheapest to change before careers exist), then the world's substance, then voice.

## Slice 0.2.1 - the badge is an account, and accounts do not live forever

Found by the owner playing v0.1.0: a badge with no save silently starts a new week, and nothing ever expires.

1. **Badge = account, save = what it holds.** Registering mints a durable identity; logging in resumes a save if there is one and starts a week if there is not. No implicit second account, no orphan badges.
2. **Last seen.** Every login and every cloud save stamps `last_seen` on the badge record.
3. **Retention, told plainly.** Badge and save carry a KV TTL refreshed on each login/save: **180 days** of silence and both go. Said in the game's voice at mint time and in the notes ("IT clears out dormant accounts after six months, which is the most realistic thing in this building"). No cron, no cleanup surface - TTL on write.
4. **The player can see it**: the badge screen states when the account was made, when it was last seen, and when it lapses if nobody comes back.
5. Gates: unit for TTL refresh + resume-vs-fresh-week decision; e2e for register -> save -> new browser -> login -> same week, and register -> no save -> login -> fresh Monday with the same badge.

## Slice 0.2.2 - the estate is a real estate

Found by the owner: `services BEIGE-BOX` lists a chassis fan and nothing else; About This Workstation reports ticket counts.

1. **Baseline services per machine kind**, real names and display names, each with status and **startup type** (Automatic / Manual / Disabled - "set to Manual and nobody noticed" is a real ticket). Two classes, both honest: ticket-relevant (the world moves them) and baseline (real, stable). A baseline service must restart when asked or refuse for a true reason - never scenery that silently does nothing.
2. **The player's own box reflects what is actually open** - the browser and the game are processes too, which is the boss's-eye view of the slack mechanic.
3. **About This Workstation becomes an About dialog**: OS name and build, workstation name, logged-on user, processor, memory, display, uptime, licence line. Ticket counts move out; entity counts go away. Comedy lives in the hardware ("512 MB (384 MB usable, and nobody knows why)").
4. Gates: `services` output shape asserted per family; every baseline service either restarts or refuses truthfully; About asserts machine facts and asserts the absence of world counts.

## Slice 0.2.3 - the filesystem

Found by the owner: the instinct to look at the tree and move around, with nothing there.

1. **File and directory node kinds** with `contains` edges, per-terminal working directory, path resolution (absolute, relative, `..`, `~` / `%USERPROFILE%`).
2. **Commands per family, per the fidelity bar**: `dir`/`cd`/`type`/`tree` on Windows, `ls`/`cd`/`pwd`/`cat`/`less` on unix - differing in output shape, not just spelling.
3. **Plausible trees per machine kind**, seeded: user profile, a spool directory that actually holds the stuck jobs, logs that agree with Event Viewer, a config file that explains a broken service.
4. **Unlocks** (content, later slices): the "my files are gone" trope, disk-full-by-one-directory, case-sensitivity as a real ticket on unix skins.
5. Gates: path resolution unit-tested hard (traversal, root, missing, permission); `ls` and `dir` asserted to differ correctly; the spool directory agrees with the spooler's queue length at all times.

## Standing bar added in this version

**Terminal fidelity.** Every command declares a tier: FAITHFUL (real syntax, flags, output shape, error wording), SHAPED (right concept and shape, smaller data, nothing false), or REFUSED HONESTLY (answers like a real shell would for an unsupported flag, or says plainly it is not simulated). A refusal teaches nothing; a fake teaches something wrong. Families are not one shell in hats. `docs/research/terminal-fidelity.md` carries one row per command - real syntax, cited real output, claimed tier, deliberate omissions - and no new command ships without its row.

## Later in 0.2.x (not yet spec'd)

Reply tones on selected chat/mail beats (register only - the mechanical effect never changes, the social consequence does).
