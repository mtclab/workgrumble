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

## Slice 0.2.4 - the drive has tickets on it

The content the filesystem slice was built for, and the two surfaces it left half-said.

1. **"My files are gone"** (Friday, 09:40, Priya): an attachment opened out of a mail, worked on
   all afternoon and saved back into `C:\WINDOWS\TEMP` nine times, because that is where Save
   writes. Diagnosed with `dir`/`tree` and closed with a new world verb, `file.move` - which
   refuses a move between two boxes (that is a copy over the network), a destination whose
   listing is a field rather than its children, and a directory whose rights are somebody else's.
2. **Disk full by one directory** (Wednesday, 14:40, Hilda): the pallet scanner on WHOUSE-01 has
   written a monthly export since 1997 and deleted none of them - three hundred megabytes on a
   drive with three left. Diagnosed by reading a listing's byte total against `disk_free` in its
   own footer, closed with `directory.purge`, which empties a directory whose contents are a
   SECOND copy of something and refuses every other directory on the estate - including the
   pallet database next door, which is the only copy of where anything in that warehouse is.
3. **`queue <printer>` lists its jobs**: number, size and the minute each landed, under the same
   job number the spool file carries. Owners, document names and page counts stay absent and the
   output says so; `type` on a spool file stays refused.
4. **The Event Viewer carries the calendar**: a log row is dated `09/09/1998`, the same way every
   file surface dates one, so a log line and a directory listing agree about what evening they
   are describing.
5. Gates: per-path graph tests for both tickets; unit tests for both verbs, every refusal
   asserted with the world proven not to have moved; the listing-versus-total invariant asserted
   like the queue's; the solvability harness taught that a ticket's own setup builds nodes.

## Slice 0.2.5 - the review reads a percentage

Found by research rather than by play (`docs/research/review-scoring.md`): the Friday review was
decided on a summed reputation meter whose credit scaled with the roster while the price of being
caught did not, so the pass bar drifted downward with every ticket added and the crossover - the
roster size at which openly slacking beats quietly doing half the job - was about twenty-six
tickets against a shipped roster of twenty-five. **Option A only.** Option D (the latent conduct
record, social and systemic triggers, comparative survival) is the next slice and is deliberately
not in this one: shipped together, the goldens would be unreadable.

1. **The review's input is a normalised composite**, in the MetricNet balanced-scorecard shape:
   `100 * (0.5 * closed/arrived + 0.5 * (arrived - breached)/arrived)`, taken over the week TO
   DATE and folded day over day at the unchanged `REVIEW_WEIGHT = 0.5`. Always 0-100. Taken over
   the week to date rather than the day alone because a day's own counts do not divide - a ticket
   that arrives at ten to five on the Monday goes red on the Tuesday.
2. **The bar is 45**, from MetricNet's published distribution over hundreds of real service desks
   (median 50, third quartile 39-50, bottom quartile below 39): a probation bar just under the
   median. `week_reputation` keeps its field id - it is save state - and its doc comment says
   what it now holds.
3. **The meter is untouched.** Reputation still moves exactly as it did and still drives fumbling,
   the day scorecard and the caught scene. It is simply not what Friday reads.
4. **The number is legible before it decides anything**: on the day scorecard every evening with
   the bar beside it, on the week screen as both halves plus the mark, and in the review window
   beside the verdict.
5. Gates: **the scaling invariant** - the shipped profiles re-walked over their real day ledgers
   at 1x, 2x and 4x the roster, with the mark required to come out identical and the ordering,
   margins and side-of-the-bar to hold at every size, proven red by reverting to the summed model;
   an equality assertion that two weeks which dealt with the queue identically read identically
   however often the lead came round (conduct is not in the mark); a second assertion that the
   world still RECORDS what the review stopped reading, because that is what slice D is built
   from; and a standing assertion that the review does not read the reputation meter at all.

Known and accepted: the two-by-two collapses. "Worked" and "worked with the browser up all week"
now read the same number, as do "half the roster" and "half with the browser up" - which is
Option A's stated cost and the reason it forces the conduct decision to be made explicitly in the
next slice instead of smuggled in as a coefficient.

## Standing bar added in this version

**Terminal fidelity.** Every command declares a tier: FAITHFUL (real syntax, flags, output shape, error wording), SHAPED (right concept and shape, smaller data, nothing false), or REFUSED HONESTLY (answers like a real shell would for an unsupported flag, or says plainly it is not simulated). A refusal teaches nothing; a fake teaches something wrong. Families are not one shell in hats. `docs/research/terminal-fidelity.md` carries one row per command - real syntax, cited real output, claimed tier, deliberate omissions - and no new command ships without its row.

## Later in 0.2.x (not yet spec'd)

Reply tones on selected chat/mail beats (register only - the mechanical effect never changes, the social consequence does).
