# Product-truth walk, September 2026 (v0.41.0)

A player's walk of the shipped 0.41.0 artifact, in a real browser, from a fresh
profile: the door, the boot, the log-on, the first shift, every app the desk
reaches, the slacking loop and getting caught, save and reload, the day
scorecard, the Systems Engineer rung and its Linux tier, and a 390px phone.

**Nothing in this file is decided.** Two defects found by the walk were plain
bugs and are fixed on this branch with standing gates; everything else is
written up here as a PROPOSAL, because the fix is a design or content call and
those are the owner's. Where a finding restates something already on a backlog
or in a memory note, it says so - the point of writing it again is that the walk
met it live, on the shipped build, as a player.

**SINCE WRITTEN.** v0.42.0 is the bundle of this walk's plain-bug slices: W-01
and W-02 (already fixed here), then W-04, W-05, W-06, W-07, W-08, W-10 and
W-20, each with standing gates proven red against the behaviour described
below. The `fixed` column says which version. W-03, W-09, W-11 and W-12 stay
open as design calls and are named as known in that version's release note;
the proposals for them below stand as written.

**Venue.** `wrangler dev` on the staging box serving a fresh `npm run build` of
`origin/main` at `1e28519`, driven by Playwright from a clean context through
the fixture door link. Production is invite-only and the same commit.

---

## 1. The findings

| id | sev | what the player sees | cause | fixed |
| --- | --- | --- | --- | --- |
| W-01 | HIGH | The day scorecard opens two thirds of the way down, on the back half of a sentence. The work and the payslip - the whole feedback loop of the evening - are above the fold with nothing saying there is a fold. | `src/shell/window-renderer.ts:325` - `focusPrimaryControl` focused the bottom-most primary button without `preventScroll`; the browser brought it into view and took the pane with it. Measured: `scrollTop` 797 of 1243 in a 446px pane. | YES - 0.42.0 |
| W-02 | HIGH | On a 390px phone every window opens mostly off the right edge. The morning brief opens 612px wide with its right edge at 588; the first window from the Start menu lands at x=309. There is no sideways scroll to reach the rest. | `src/shell/theme.css:803` - `.screen-desktop` had no `grid-template-columns`, so its implicit `auto` column sized to the min-content of the taskbar (~612px). The window manager measures its viewport off that surface, so `clampWindowBounds` clamped every window to a screen a third wider than the real one. | YES - 0.42.0 |
| W-03 | HIGH | Starting as a Systems Engineer, the brief says "The board is light this morning. Dispatch has it as a quiet shift" directly above nine inherited tickets, five of them simultaneous Fettle & Crane infrastructure incidents on the same box. | The engineer start summons the rung's authored incidents at 08:00 Monday on top of the drawn MSP week. Already flagged as a residual on the 0.35.0 build note ("Monday density wants a human eye"); the walk confirms it reads as a contradiction, not as density. | no - see 2.1 |
| W-04 | HIGH | A ticket fixed silently through the terminal reads `Response SLA: Answered, in time` four rows above `Customer-visible: Nothing has been put to the reporter. As far as they know, nobody has looked.` | By design, not by accident: `HELPDESK_ACTIONS.ticketRecordResponse` stamps `responded_at` on the FIRST TOUCH (`src/world/actions/ticket.ts:622-650`), and the row prints the ordinary stopped-clock word for it (`src/shell/apps/tickets.ts:255`). The model means "touched"; the row says "answered". | YES - 0.42.0 (was: see 2.2) |
| W-05 | MED | The engineer's disk-full path: `journalctl --disk-usage` prints the entire journal instead of the one line systemd prints. | `src/shell/apps/cmd-unix.ts:1605-1620` handles `--vacuum-size` and `-u`, and every other flag falls through to the bare-journal listing. | YES - 0.42.0 (was: see 2.3) |
| W-06 | MED | `du -sh /var/log/*` answers `26G /var/log` - the parent, one line, no clue which log ate the disk. | `duTarget` in `src/shell/apps/cmd-unix.ts` strips a trailing `/*` and reads the glob as the directory. | YES - 0.42.0 (was: see 2.3) |
| W-07 | MED | The Start menu is cut off at the taskbar. The Fridge, Save game, Load game, Log off and Restart are below the fold, with no scrollbar gutter and no other cue that there is more. They ARE reachable - the list scrolls to a wheel. | The cap and the scroll rail work (`theme.css:1281`); nothing advertises them. And the gate that exists for exactly this - `e2e/windows.spec.ts:281` - measures the MENU's box (which is correctly clamped) and then reaches for `[data-testid^="start-menu-item-"]`, a prefix that does not match `start-menu-save`, `-load`, `-log-off` or `-restart`. It is green over five entries it cannot see. | YES - 0.42.0 (was: see 2.4) |
| W-08 | MED | The timesheet at 15:34 on day 2 reads `100% of the day accounted for. 15h of 12h 56m on the clock.` | `utilisationOf` (`src/world/timesheet.ts:1320`) divides the CLAIM by the elapsed desk minutes, and the day in progress has already pre-claimed a full 7h 30m. `share()` clamps the percentage to 100, so the row reports a healthy number beside two figures that contradict it. | YES - 0.42.0 (was: see 2.5) |
| W-09 | MED | Choosing any rung but the default and pressing Log on appears to do nothing: a setup screen runs, and then the same log-on box comes back - with the desk selector gone. The player has to log on a second time, and nothing on either screen says so. | The new-starter provisioning ceremony ends by returning to the log-on screen. Diegetically right, undocumented on screen. | no - see 2.6 |
| W-10 | MED | The clock can be paused, and every action still works. A whole day's triage, terminal reads and fixes cost zero simulated minutes. Walked: the day paused at 08:01, a triage filed, four terminal commands run and an account unlocked - "Ticket resolved, Day 1 08:01". | `DayDriver.setPaused` stops the tick and nothing else (`src/shell/day-driver.ts:2699`); dispatch never consults it. | YES - 0.42.0 (was: see 2.7) |
| W-11 | MED | `help` on the first morning of the service desk lists 40+ commands, including `audit <customer>`, `fw`, `notify`, `changereq`, `promotion` and `ssh`. Most refuse at this tier or contract. | The registry is tier-gated at DISPATCH, not in the listing. The architecture note in `[[project-it-career-sim]]` commits to "a bounded curated command set (~15 at helpdesk)". | no - see 2.8 |
| W-12 | MED | The KB is 67 articles with no search, and the ticket's "link the article you used" control is a single 67-row `<select>` carrying Linux, Mac, MSP-contract, firewall-project and security articles to a day-one junior. | Both surfaces list the whole corpus. | no - see 2.9 |
| W-20 | MED | `dig fc-rmm-01` answers `10.42.0.29`, and then `ping 10.42.0.29`, `traceroute 10.42.0.29` and `curl -I http://10.42.0.29/` all fail to resolve it. Testing by address - the one move that separates a DNS fault from a network fault, and the move this game's own KB article "'The internet is down' and the addresses still work" is about - is impossible in the terminal that teaches it. | `machineByName` (`src/shell/apps/cmd-unix.ts`) matches on the host LABEL only, so an address literal is never a host. `addressOf(machine.id)` already derives the other direction; nothing reads it back. Same shape on `curl` (2457), `traceroute` (2791) and `ssh` (961). | YES - 0.42.0 (was: see 2.11) |
| W-13 | LOW | The desk's "Energy drink" label overflows its own tile and disappears under the Beer tile beside it - it reads "Energy dri". | `desk-drink` is 64px wide at x=1292; its label is 79px and runs to 1375; `desk-beer` starts at 1362. | no |
| W-14 | LOW | The Browser's bookmarks page says "Two of them." above four bookmarks. | `src/shell/apps/browser.ts:105` - the sentence is a literal; the list is generated from `BROWSER_SITES`, which has grown to four. | no - trivially derivable, see 2.10 |
| W-15 | LOW | The caught scene creeps across the screen while it is up - about a pixel a simulated minute, both axes. Its one button is a moving target (Playwright refuses to click it as "not stable"). | The scene rebuilds and re-places its window on every minute repaint; with the day paused the drift stops dead. The repaint-discipline family from 0.5.0. | no |
| W-16 | LOW | The Assistant's speech bubble covers the last row of desktop icons (Hubbub, Browser) at 1440x900. Clicks pass through, so it is a reading problem rather than a blocking one. | The icon grid's last row starts at y=734; the assistant bubble starts at y=744. | no |
| W-17 | LOW | Mail timestamps carry no day. On day 2 at 08:10 the inbox shows Desmond's day-1 mail at "08:25" - a message fifteen minutes in the future. | The calendar seam (0.40.0) reached `dir`/`type`/`tree`, events, `ls` and the sheet; the mail list still prints a bare time. | no |
| W-18 | LOW | The keypress that skips the boot ceremony lands in the password field, so the log-on box opens with a stray character in it. | Any password works, so nothing breaks; it just looks untidy on the first screen a player ever sees. | no |
| W-19 | LOW | The window MAXIMIZE control carries no `data-testid`, so no journey drives it - and maximising is the first thing a player does to the ticket queue, whose detail pane is 1282px of content in a 387px default window. | `src/shell/window-renderer.ts` gives minimize and close a test id and maximize none. | no |

---

## 2. Proposals

### 2.1 W-03 - the engineer's Monday says one thing and shows another

Two things are true at once and only one of them is on the screen: the DRAWN
week is genuinely light, and the rung's authored incidents are all summoned at
08:00. The cheapest honest fix is not to move any content - it is to let the
brief's load reading see the summoned pile. `dayLoad` already reads the day's
tickets to pick the voice; the engineer start puts its incidents in after that
read, or outside the set it reads.

The richer fix is to stop summoning them all at once. Five incidents on one box
in one minute is not a busy Monday, it is a datacentre fire, and the arc has
five days to spend them over. This one also fixes W-05's sibling: the seeded
journals are stamped 14:03 and 15:12 on a clock that reads 08:03, because those
are the hours the incidents were AUTHORED for. Spread the incidents and the
journal timestamps stop being from the future for free.

### 2.2 W-04 - "answered" names an act nobody performed

The model is coherent and its comments argue for itself well: a ticket fixed
before anybody said a word to the reporter is not a missed response, it is a
problem that stopped existing, so `responded_at` is stamped at the first touch
rather than left null to read as a breach. The trouble is only the WORD. In the
trade, first response means a communication to the customer - it is what the
"time to first response" on every published SLA measures, and it is the number
the player would be asked about in an interview. The pane teaches the opposite,
and then contradicts itself four rows down.

Three ways out, in ascending cost:

1. **Rename the row.** "Answered" becomes "Touched" (or "First touch") and the
   row stops claiming a conversation. One string, no model change, no goldens.
   Weakest, and honest.
2. **Split the clock.** Keep `responded_at` as the touch stamp, and print the
   customer-visible stream's own first entry as the answer - two rows, both
   true, and the gap between them becomes readable. This is the real ITIL
   shape, and it makes "Message reporter" mean something it currently does not.
3. **Make the answer the thing that stops the clock.** Truest, and the most
   expensive: it would move breach counts, review marks and goldens across the
   whole week, and it would make the silent fix a losing move - which may not be
   the comedy the game wants.

Overseer's recommendation is (2), later, as its own slice; (1) as a stopgap if
the contradiction is to be closed sooner.

### 2.3 W-05 / W-06 - two unix commands that teach the wrong output

These are the north star's own failure mode: a player who learns the shape of
`journalctl --disk-usage` here learns it wrong, on the exact path the game's own
KB article ("A Linux box out of disk, and the journal that ate it") sends them
down. Both are small and both already have their truth in the world:

- `--disk-usage` should read the same `journal_bytes` field the vacuum reads and
  print systemd's one sentence: `Archived and active journals take up 26.0G in
  the file system.`
- `du -sh <path>/*` should list the leaves under that path, which `duLeaves`
  already holds, one line each, rather than the parent's total. That IS the
  diagnosis: the glob is how you find out it is the journal.

While that file is open, an unrecognised flag falling through to the default
listing is worth a rule of its own - real `journalctl` says
`Unknown option --whatever.` and exits, and a refusal that teaches is the
house style everywhere else in this terminal.

### 2.4 W-07 - the menu, and a gate that cannot see it

Two separate things, and the second is the more serious.

The MENU wants an affordance: at 1280x800 (the suite's own viewport) five
entries sit below the taskbar line, and a browser with overlay scrollbars shows
nothing to say so. A hairline fade, a visible rail, or simply fewer rows - the
day's own screens (A quick word, Somebody wants you, You are in a meeting,
Workstation update, Your probation review) are listed permanently even when no
such screen exists, and they are what pushed Save and Log off off the bottom.

The GATE is the finding worth acting on. `e2e/windows.spec.ts:281` is titled
"keeps the whole start menu on the screen at any app count", and it is green
while five entries are off the bottom, for two reasons that are both the same
mistake: it measures the WRAPPER (correctly clamped) rather than the items, and
its selector `[data-testid^="start-menu-item-"]` does not match the four action
rows at all. Same class as the 0.38.0 lesson about a gate pointed at one file of
a registry: point it at every `[data-testid^="start-menu-"]` descendant, and
assert each one's box against the taskbar line rather than against the
document.

### 2.5 W-08 - the sheet claims a day it has not worked yet

The timesheet is the one surface whose entire premise is that the game knows the
truth and the player's claim is measured against it. Printing `15h of 12h 56m`
under a green `100%` is that premise failing out loud - and the clamp in
`share()` is what hides it, so a player who reads only the percentage is told
they are exactly right when the sheet has over-claimed by two hours.

Two candidate rules, and the choice is a design call because it changes what the
sheet is FOR:

1. The day in progress claims what it has elapsed, and grows through the day.
   The sheet is then always defensible, and Friday's fold is unchanged.
2. The day in progress is excluded from the denominator as well as being
   pre-claimed. The sheet reads for completed days only, and today's row is
   marked as provisional.

Either way `share()` should stop clamping silently: an over-claim is exactly the
thing the customer-scrutiny mechanic exists to notice, so the number that says
so should be visible rather than rounded down to a pass.

### 2.6 W-09 - the second log-on nobody mentioned

The provisioning ceremony is good and worth keeping; it just needs one honest
sentence. Either the setup screen ends on "Your workstation is ready. Log on to
start.", or the log-on screen it returns to says it. As it is, the first thing a
player who picks a rung other than the default experiences is a screen that
looks like their choice was thrown away.

### 2.7 W-10 - pause is a hole under the whole economy

Every clock in this game - SLA, stress, suspicion, the boss's rounds, the
utilisation sheet - is priced in simulated minutes, and the pause button stops
those minutes while leaving every verb live. A player who pauses, empties the
queue, and un-pauses has beaten the entire pressure layer with a taskbar
control. This is not hypothetical or fiddly: it is one click, it is discoverable
in the first minute, and it makes the honest way to play strictly harder than
the dishonest one - which is the exact shape the house rule about honesty
already forbids elsewhere in this game.

Options, and this is an owner call because it trades a real QoL affordance
against the core loop:

1. **Pause freezes the desk.** Dispatch refuses under pause with a truthful
   reason ("The world is stopped. So are you."), the way the meeting takeover
   already refuses work at the dispatch seam. Cleanest; costs the player their
   read-at-leisure pause.
2. **Pause is reading only.** Reads (queue, KB, directory, `ls`, `services`)
   stay live; anything that CHANGES the world is refused. Keeps the affordance
   for its honest use, closes the exploit. More seams to hold, and the
   read/write split has to be exhaustive or the hole just moves.
3. **Leave it, and say so.** Pause is a single-player convenience and the game
   is not competitive. If this is the answer it should be a decision on the
   record, not an accident - and the pause chip could say what it is doing.

Overseer leans (2).

### 2.8 W-11 - the shell is not the curated set it was designed as

The architecture note is explicit: "Command/tool registry, tier-gated. Shell = a
bounded curated command set (~15 at helpdesk), never bash emulation." Today
`help` lists everything the registry holds and the tier gate fires at dispatch.
That is not a correctness bug - every refusal is truthful and several of them
teach - but it costs the desk tier its shape. A junior reading `help` cannot
tell which fifteen commands are their job.

Proposal: `help` lists what this tier and this contract can actually run, and
ends with one line naming what is above it and where it comes from, the way the
`ssh` row already does ("the engineers' tier, not the desk's"). The full list
stays reachable behind `help all` for the curious. The refusals stay exactly as
they are - a wall you can walk into is one of the better teachers in here.

### 2.9 W-12 - the corpus outgrew both its surfaces

67 articles in an unsearchable list, and the same 67 in a single `<select>` on
every ticket. The picker is the sharper problem: choosing "the article you
actually used" out of 67 rows in a dropdown is a worse experience than the work
the ticket is about, and it will be 100 rows after the next content version.

Proposal: a filter box on the KB app (title and summary substring is enough, no
index needed); and on the ticket, a picker that offers this ticket's filed
article, its `see also` links, and the articles the player has opened this week
first, with "all articles" behind a toggle. Neither changes what is authorable.

### 2.10 W-14 - a count that should be arithmetic

`'Two of them.'` in `browser.ts` is a literal beside a list built from
`BROWSER_SITES`. Deriving the word ("Two of them." / "Four of them.") makes the
sentence unable to drift again, and is the kind of thing a one-line gate can
hold for good: the tagline's number equals the registry's length.

### 2.11 W-20 - the address the game just printed is not an address

This one is worth its own slice because the KB article it contradicts is one of
the best in the corpus. `dns-is-not-the-internet` teaches the single most useful
first move in a network fault: ping the address, and if the address answers
while the name does not, the network is fine and the resolver is not. The
terminal cannot do it. Every tool resolves by label, so an IP - including the
one `dig` printed a second earlier - comes back as `Name or service not known`,
which is precisely the WRONG answer and precisely the answer that would send a
learner to the wrong conclusion.

The world already holds both halves: `addressOf(machine.id)` derives the
address from the node. `machineByName` needs to accept an address as well as a
label, in the one place all four tools already call. Once it does, a
resolver-broken-but-network-fine ticket becomes authorable for free, and the
article gets a path.

While that is open, two smaller ones in the same file: an unrecognised
`journalctl` flag should be refused by name rather than falling through
(see 2.3), and `traceroute`'s refusal spells the failure differently from
`ping`'s for the same cause - real traceroute says `unknown host`, which is
right, so this one is only worth noting as the place the address fix has to
land three times.

---

## 3. Depth against the north star, one line per rung

The claim being tested is the owner's: an applicant who says at interview that
they learned containerisation, terraform or Linux from this game must be able to
defend it. So the question per rung is not "is there content" but "could a
player NAME the real thing afterwards".

- **Service Desk (junior) - PASSES, and is the best-built thing in the game.**
  The lockout ticket is real AD: bad-password count, lockout duration, unlock
  rather than reset, and the phone in a pocket still offering the old password.
  `net user`, the event log, the spooler's stop-clear-start order, the matrix
  triage, the SLA clocks and the response/resolution split are all trade-true. A
  player could name lockout-vs-forgotten, impact x urgency, and why you clear a
  print queue before restarting the spooler, and be right.
- **Service Desk (senior) - PASSES, narrowly, on one idea.** The second queue -
  auditing the first line's filings, and the clock a wrong filing buys - is a
  real and rarely-modelled thing (QA sampling on a service desk), and the
  retained-ownership rule is right. But it is one mechanic; nothing else about
  the rung is new work, and the audit tab is empty for the first hours of the
  day, so a player can reach the evening without meeting it.
- **Systems Engineer - PASSES on the tools, THIN on the trade.** ssh with a real
  TOFU fingerprint prompt, `systemctl status` reading a real unit, `journalctl
  -u`, start-limit backoff, `ss -tlnp`, `curl -I` returning 502 when the
  upstream is down, `apt install` refusals for tools that are genuinely not on a
  stock box - this is defensible, and the disk-full and permission-denied
  incidents are the right incidents. What is missing is the half of the job that
  is not a terminal: no config is ever EDITED, nothing is version-controlled,
  nothing is deployed, and the change window exists as paperwork rather than as
  work. See section 4.
- **Desktop Support (L2), Senior Engineer, Team Lead, Architect / vCIO - NOT
  BUILT.** Four of the seven rungs on the log-on screen are disabled and say
  "not written yet", which is honest and reads fine. Worth naming here only
  because the ladder is the difficulty select: a player who wants a harder game
  has one step up available, not five.

**Is it a parody shell around button-clicking?** No - and the reason is worth
saying precisely, because it is the thing to protect. The tickets close when the
WORLD matches an assertion, not when a button says resolved; the refusals are
real refusals with real reasons; the KB articles are the reference material and
they are correct. That architecture is what makes the learning claim defensible,
and every thin spot below is thin CONTENT on sound rails rather than a hole in
the rails.

---

## 4. Where it is thin, and the real concept each thin spot could carry

Ordered by how much north-star ground each one would buy.

1. **Nothing is ever edited.** The engineer diagnoses with reads and fixes with
   `systemctl restart`. The commonest real Linux day - open the unit file or the
   config, change one line, `systemctl daemon-reload`, restart, watch it fail
   differently - is absent. The `permission-denied` incident already ships the
   perfect setup (`fcauth` cannot read `/etc/fcauth/auth.env`) and then resolves
   without the player ever looking at the file. **Concept: a service unit and a
   config file as first-class world objects; `daemon-reload`; the difference
   between a restart and a reload.**
2. **No version control anywhere.** For a game whose audience is people trying
   to get into the trade, the absence of `git` is the single largest gap: it is
   the one tool every job description asks for. **Concept: the config that was
   changed by hand and then overwritten by the next deploy; `git log` as the
   answer to "who did this"; a rollback that is a revert.**
3. **No IaC, so no terraform - which the owner's north star names by name.**
   The entity-state graph was designed for exactly this ("declared-vs-actual
   graph diff, nearly free"), the change-request machinery already models
   plan-approve-apply, and the estate is already a graph. This is the largest
   ready-to-build idea in the project. **Concept: plan vs apply; drift; state as
   a thing that can be wrong; "it works but it is not in the code".**
4. **No containers, so no containerisation - also named in the north star.**
   The Linux boxes run systemd units directly. **Concept: an image versus a
   container versus a running process; a container that restarts forever because
   its healthcheck is wrong; logs that live in the runtime rather than the
   filesystem.**
5. **Monitoring is a board you acknowledge, never one you configure.** The
   monitoring-only customer taught escalate-do-not-fix well; nobody ever sets a
   threshold or writes an alert rule. **Concept: alert fatigue as a thing you
   CAUSED; a threshold that fires at 80% on a disk that is always at 85%; the
   alert nobody acknowledged because the last two hundred were noise.**
6. **DNS is a lookup, never a fault** - and per W-20 the article's own method
   does not run. `dig` and `nslookup` read the estate truthfully, and the KB's
   "the internet is down and the addresses still work" is one of the best
   articles in the corpus; there is no ticket where a stale record or a TTL is
   the answer, and no way to test by address. **Concept: TTL; a record changed
   an hour ago that half the office cannot see yet; the difference between a
   resolver and a hosts file; ping-by-address as the fork in the diagnosis.**
7. **Backups: one horror, no restore.** The discovery ticket ("green and empty")
   is excellent and is the ONLY backup content. **Concept: a restore test as a
   procedure with steps; RPO and RTO as two different numbers; the backup that
   restores to the wrong place.**
8. **Certificates expire and are renewed with one verb.** `renewcert` is a
   button. **Concept: a chain; an intermediate that expired rather than the leaf;
   why the browser and `curl` disagree about the same server.**
9. **The escape fund has no door.** Every scorecard banks it and prints the
   total against £245,000. At the £80.85 take-home the walk earned on a working
   day that is roughly three thousand shifts, and no walk-out surface appeared.
   The endings are designed (`docs/design/e11-endings.md`) and the fund is
   already a real counter; until an exit exists the number reads as a joke about
   futility, which may be the intent but is worth deciding out loud.

---

## 5. What this walk did NOT reach

Named so the matrix is honest about its own coverage, per the house rule that an
uncovered cell is reported as uncovered.

- The Friday review and the redundancy round (the walk played days 1 and 2 of a
  probation week and day 1 of an engineer week).
- The employer switch, Bodgeworth & Batch, and the reply-all storm.
- The on-call pager and the 3am page.
- The firewall-replacement project past its first task.
- Solitaire, Minesweeper, Office Arcade and the Media Player as installed apps
  (the store was read, nothing was installed).
- The badge, the cloud save, and a week carried to a second browser.
- Skins other than the default (Display Properties was read, not driven).
- The "Report a real problem" form.
- Every rung above Systems Engineer, which is not built.
