# v0.3.0 spec: this update adds interruptions

Epic E1 (issue #2), slice 1 (issue #9). Research base: `docs/research/day-to-day-frustrations.md` -
sections 1-4 converge on ONE engine-side idea, the first-class interruption event, and this slice
builds that idea plus the two owner seeds that carry the most authenticity per effort: the surprise
call and the mandatory meeting block. Everything else in the wave (forced reboot, presence status,
walk-ups, no-hello beats, reply-all day, password day) is CONTENT on these rails and ships in later
0.3.x releases, each with its own version-plan issue.

Standing bars + git rules apply. No new terminal commands in this slice; if one sneaks in, it does
not ship without its fidelity row.

## The shape of the thing (architecture, decided before any lane starts)

1. **The schedule is stateless, like the patrol.** `src/world/interruptions.ts` exports
   `buildInterruptionSchedule(seed, day)` - a pure function returning timed entries, exactly the
   `buildPatrolSchedule` pattern (`src/world/boss.ts:94`). No new engine-side state machine, no
   ENGINE_VERSION bump for the schedule itself: a save restored mid-day recomputes the same
   schedule from the same seed, and a save taken mid-meeting restores mid-meeting because
   occupancy is `f(schedule, tick)`. What the player DID about an interruption (accepted,
   deferred, declined, completed) lives in the world graph, written by actions, so it rides the
   existing checkpoint/replay and needs no save-schema change.
2. **An interruption is data.** Each entry carries `source` (call / meeting / walk_up / boss /
   chat), `related_ticket` (id or none), `declinable`, `severity`, and its authored
   flavor (caller, subject, dialogue). *Amended at review (2026-08-02): `synchronous` was specced
   but nothing in this slice reads it - a carried-but-unread field is a dead contract, so it is
   dropped and returns with the first slice that behaves differently on it.* The engine feature is the COST MODEL and CHOICE GRAMMAR;
   payloads are content rows. Build the family once and the rest of the wave is authoring.
3. **One cost model: benign vs malignant.** An interruption related to the ticket the player is
   actually touching (the touch log knows) is benign - no refocus cost, and handling it writes
   touch evidence on that ticket. An unrelated one is malignant - a stress tick on arrival plus a
   **refocus debuff**: for a short window after it ends, the fumble threshold behaves as if stress
   were higher (the visible, honest version of "23 minutes to get back into it"). The debuff is a
   player-node field with an expiry tick, set and cleared by actions, shown on the desk while it
   runs. Numbers live in the balance table, not in prose.
4. **One choice grammar: accept / defer / decline.** Three world actions with guards and
   player-facing refusal reasons, dispatched through the op-language like every other verb.
   Defer re-queues the entry a fixed number of minutes out (once - the second arrival is not
   declinable, which is true to life). Decline is only legal where `declinable` says so.
   *Amended at review (2026-08-02): the source-dependent SOCIAL cost of declining is deferred to
   the tones/presence slices, which own the machinery it needs - in this slice a decline is
   recorded and costs the record only, and nothing printed claims otherwise. A call that rings
   out unanswered is also recorded, and a malignant one still collects a reduced refocus debuff -
   the ringing pulled focus whether or not anybody picked it up, and ignoring must not dominate
   answering.*
5. **Precedence is explicit, not emergent.** The screen can hold one takeover at a time. The
   scheduler avoids overlaps the way the patrol already avoids lunch: no interruption fires
   during a caught scene, a patrol arrival, or another interruption; a blocked entry slides to
   the next eligible tick rather than stacking into an unreadable moment. The meeting block and
   the patrol cannot overlap by construction - the boss is in the meeting too.
6. **Off-hours stay silent.** `advanceOffHours` (`src/engine-api/wasm-engine.ts:302`) already
   throws on unexpected events; interruption events join the forbidden list. The guard is
   extended, never weakened.

## Slice content

### The surprise call (owner seed)

1. An incoming-call takeover window - ringing, caller name, subject line - built on the chat
   machinery. The choice grammar renders as **Answer / Message first / Decline**.
2. **Answer** opens a synchronous conversation that consumes sim-minutes while SLA clocks run;
   related calls resolve into ticket progress (touch evidence, possibly a clue - a call CAN be
   how a ticket moves). **Message first** is defer with a smaller cost and a chat line sent now.
   **Decline** is legal per the entry's flag, with source-dependent social cost.
3. At least one call in the probation week is benign (the reporter of an open ticket, calling
   about that ticket) and at least one is malignant (a different department, a printer that is
   not yours), so the player FEELS the cost model's two halves in the shipped week.
4. Fumbling while answering is already a mechanic; a call taken above the fumble threshold gets
   the fumble treatment in its dialogue. Nothing new to build - the meters already say it.

### The mandatory meeting block (owner seed)

1. Announced in advance: it is on the morning brief and a summons mail names the hour ("Sync on
   ticket hygiene, 10:30, attendance is expected"). The player plans around it - that dread is
   the mechanic, and it costs nothing to render because the brief already exists.
2. At the hour, a takeover scene (caught-scene class, `src/shell/apps/caught.ts` precedent): the
   meeting owns the screen, the desk is unreachable, and **every clock runs**. The comedy is the
   meeting's minutes (authored beats, a few per meeting) against the ticker of a queue the player
   can see the shape of but cannot touch.
3. Not declinable, not deferrable - the grammar still fires, but both refusals answer with the
   reason a junior cannot skip the sync. The refusal TEACHING the hierarchy is the point.
4. It ends with the recap mail whose content is the meeting ("could have been an email" said by
   the artifact itself, not by a joke), and any SLA consequence of the absence is the world's
   honest arithmetic, not a scripted punishment.
5. The probation week gets exactly one, mid-morning, mid-week - prime time, per the research.
   Weight and cadence per title live with titles-as-difficulty (E5/E6 planning), as data.

### The refocus debuff (the science, made visible)

1. Malignant interruption ends -> `refocus_until` on the player node; until that tick, the
   effective fumble threshold drops (the shakes come easier). Desk shows it plainly
   ("Where was I..."), and it expires quietly.
2. Slacking does not clear it. Working through it does not extend it. It is a cost, not a state
   the player manages - one field, one bool of the science ([chi08]), nothing more.

## Gates

1. **Journey, not transition**: an e2e where a malignant call lands MID-ticket, the player
   answers, recovers through the refocus window, and closes the ticket - asserting the ticket's
   goal is reached AND the SLA arithmetic stayed true the whole way.
2. **The invariant holds through a meeting**: `deadline == spawn + target + held + off_hours`
   asserted in cargo across a meeting block - a meeting holds nothing, pauses nothing.
3. **Solvability under worst case**: the harness walks every advertised path against the week's
   WORST interruption schedule (every entry accepted at its latest slide); no advertised path
   may become uncompletable by timing. The no-op meta-test discipline applies unchanged.
4. **Determinism**: schedule is `f(seed, day)` - same seed, same week, byte-identical; the
   scripted-week golden moves ONCE, every changed number argued in the commit that moves it.
5. **Precedence proven**: a test constructs the collision (call due during caught scene, call
   due during meeting) and asserts the slide - one takeover at a time, nothing lost.
6. **Off-hours silence**: extended `advanceOffHours` guard has a test that plants an
   interruption in the forbidden window and watches it throw.
7. **Mid-state save**: save during a ringing call and during a meeting; reload; same screen,
   same schedule, same clocks. Two e2e cases, box-run.
8. Both gate halves green on box before deploy; e2e count checked against the expected number.

## Out of scope, said out loud

Forced reboot (0.3.1 headline candidate - it wants the same rails plus the update-screen art),
presence status (its own slice; touches suspicion/reputation balance), walk-ups, no-hello beats,
`arrives_minutes_before_close`, reply-all day, password-rotation day, camera-on stacking. The
Assistant (E2, issue #3) may ride whichever 0.3.x release has room in its notes.

---

# Slice 0.3.1 - the forced reboot (issue #10)

The flagship of the interruption family: the update that arrives mid-work, postponable a
dwindling number of times, and then simply happens while every clock runs. Rides the 0.3.0
rails end to end - a machine-source entry, the takeover class, refocus at desk-handback, the
same precedence discipline. What is new is the postpone budget and the update screen.

## The postpone budget (engine, lane A)

1. 0.3.0's defer is once, twenty minutes, flat. The reboot needs `postpones: [10, 5, 2]` -
   per-entry data, a SHRINKING list of windows, each spent postpone re-queuing the entry that
   many minutes out. Generalize the defer machinery to a budget: the world records each spend
   (spend count derivable from the graph - the driver must not keep it), the entry's arrival
   says how many are left, and the last arrival offers nothing. A call keeps its budget of one
   with a twenty-minute window - the 0.3.0 shape is the special case, and its tests must not
   move.
2. **Not declinable, and the refusal says why**: "The updates have been declined for four
   months. The option has been withdrawn. This is not IT's decision, and IT would like that
   noted." Content bar: the true reason, taught by the refusal.
3. The reboot cannot slide out of the day: `postpones` is authored so the worst case still
   lands inside the shift with room for the update minutes. The loader refuses a reboot whose
   worst case leaks past close - quiet wrongness is the enemy.
4. Off-hours: the new fields join the forbidden list. Extended, never weakened.

## The update screen (shell, lane B)

5. At zero, the takeover: rebooting workstation, then "Working on updates. 30%. Do not turn
   off your workstation." Percentages move with the honesty of the real thing - which is to
   say they are theatre pinned to real minutes: the DURATION is true (data, sim-minutes,
   clocks running), the percentage is a performance of it. Pause/speed and the Start menu
   stay reachable (0.3.0's desk-not-workstation rule); every desk surface refuses through the
   same dispatch seam with its own sentence ("The workstation is installing updates. It said
   so. It is not sorry.").
6. **Never the player's data**: the app-state store restores every window, every draft, every
   terminal scrollback exactly. The screen says "Restoring your work... (most of it)" - the
   doubt is the joke, the restore is total, and the gap between what the screen implies and
   what the world did is the whole comedy register of this game.
7. Refocus applies at desk-handback, malignant by construction (no related ticket). Arrival
   stress on the countdown's FIRST arrival only - the postponed re-arrivals are the same
   dread, not new dread.
8. **Real deploys ride it**: first boot on a changed build version plays the update screen
   before the release-notes window. One animation, two masters - the fiction's updates and
   ours - and the release note IS the changelog, as it already is.

## Content

9. The probation week gets ONE reboot: Thursday 14:10, first arrival mid-afternoon where the
   queue is warmest, worst case landing ~15:00. Tuesday/Wednesday stay as shipped - three
   interruption shapes across the week was the 0.3.0 argument, the fourth joins the day that
   had none.

## Gates

10. Journey: countdown at 14:10 mid-ticket, three postpones spent truthfully (each arrival
    names the remainder), reboot fires, update screen holds the desk while a deadline crosses
    inside it, windows and drafts restored byte-true after, refocus chip up at desk-handback.
11. Solvability walks the worst case (all postpones spent, latest landing); no advertised
    path uncompletable. Loader-refusal test for a reboot authored to leak past close.
12. Mid-countdown and mid-reboot saves reload to the same screen, same remaining budget, same
    clocks. Budget spend must round-trip through the world graph, not driver state.
13. Precedence: constructed collisions (reboot due during meeting, call due during reboot)
    slide per the 0.3.0 discipline; runtime assert unchanged.
14. The 0.3.0 defer tests do not move - the budget generalization is invisible at budget one.
15. Goldens move once, argued. Both halves on box, count checked.

---

# Slice 0.3.2 - time slows down near events (issue #11)

The debt 0.3.0 and 0.3.1 both flagged: at x4 a six-minute ring window is 1.5 real seconds. A
choice is not a choice at that frame rate, and the interruption family is made of choices.

1. **One rule**: when something synchronous lands - a call starts ringing, a meeting or a
   reboot takes the desk, a caught scene opens - the clock drops to x1. The table of what
   counts is the takeover/ring family the shell already names (`holdsTheDesk` and the ringing
   call); the postponed GRACE is not in it - those minutes are the player's desk time, bought
   deliberately, and they keep whatever speed the player chose.
2. **It stays at x1.** No automatic restore at handback: "the day slowed down because
   something happened" is legible, a clock that re-accelerates behind the player's back is
   not. Re-upping is one click and a deliberate act.
3. **Pause is orthogonal** and unchanged in every direction.
4. **Shell-only.** Speed was never world state: no engine change, no fields, no save-schema
   change. The scripted week drives the driver in turns, so the goldens must come out
   BYTE-IDENTICAL - a golden that moves under this slice is a bug in the slice, not a golden
   move to argue.
5. **The slice's real cost is the e2e helpers**: everything that runs sim-minutes at a fixed
   speed now crosses events that reset it. Decide the helper contract once - re-assert speed
   per step, or read the actual speed - and apply it everywhere; the full suite green on the
   box is the proof the sweep was complete.
6. Gates: unit per table row (drops), the grace (does not), handback (does not restore),
   pause (orthogonal); e2e at x4 asserting the speed CONTROL's state when a call lands and
   when a meeting takes the desk; goldens asserted identical; both halves on box, count
   checked.

---

# Slice 0.3.3 - presence, the green-dot triangle (issue #12)

Research section 3, whole cloth: the player gets a dot, and the dot is read by everybody.
One enum, no new meter - presence modulates the three meters that exist, which is what the
literature says the real anxiety is made of.

1. **World state, one verb.** `presence` on the player node (available / dnd / away),
   set by `presence.set` with guards (shift only; the world refuses a dot nobody is at a
   desk to show). Saves round-trip it; the boss reads it; default is available and the
   scripted walks never touch it - the goldens are asserted byte-identical on that fact.
2. **The filter is deterministic.** While DND holds at an entry's arrival tick, a
   declinable non-machine entry slides (the precedence discipline, reused) rather than
   fires. Meetings and the workstation are exempt - they do not care about your dot, and
   the Thursday reboot and Wednesday sync remain undodgeable by construction. The filter
   reads the graph at the tick, so schedule + filter = f(seed, day, graph) and the
   determinism gate holds.
3. **The triangle's costs, all world-enforced**:
   - DND while actively working drips suspicion (the dot says busy-with-something-else;
     the dispatch log says working; the boss reads both). Past a suspicion threshold the
     boss's "on Do Not Disturb all morning?" beat arms - caught-scene class, never a
     random scold.
   - Away while dispatching is a visible lie: a reporter waiting on a ticket the player
     touches while Away answers with the escalation the real world gives it (response
     pressure or a rep sting, once per reporter per day, not a drumbeat).
   - Available is the baseline: normal rates, no cost, no bonus. The default is honest.
4. **Chatter is data**: NPC lines reacting to the dot are dialogue rows, cheap, and the
   OS-war register the skins epic wants can wait - this slice's voice is the office
   noticing your status, nothing more.
5. **Tray surface**: the three-state control lives in the tray, one click, keyboardable,
   the current state visible at all times (the player must always know what the boss
   sees - a hidden dot would make the suspicion drip a trap rather than a tradeoff).
6. Gates: determinism (same seed+choices = same week); the DND journey (dodge a call,
   collect the drip, meet the meeting anyway); the Away journey (work while Away, get
   answered for it); solvability under all three presence values; goldens byte-identical;
   off-hours silence extended; mid-DND save round-trip; both halves on box, count
   checked.

---

# Slice 0.3.4 - colleagues (issue #13)

The tail of the wave-3 list: three payloads that are nearly pure content on rails already
built. If a payload needs a new engine concept, that is a finding, not a task - stop and
report.

1. **The walk-up.** A colleague arrives at the desk - corridor telegraph machinery, a
   different name in it - with something that should be a ticket ("while you're here...").
   Source `walk_up` (rails since 0.3.0: drops the clock, slides under DND - EXCEPT it does
   not: a body at the desk does not check your status, so walk-ups are exempt like
   meetings, in data, tested). The choice is the DM-bypass truth: do it off-book (they are
   grateful; the work is invisible; no credit) or ask them to file it (a beat of social
   cost; the ticket exists and counts). Both paths honest, neither punished into
   non-existence - the tradeoff IS the teaching.
2. **No-hello.** Chat NPCs open "Hi." and then a typing indicator that cycles. Waiting is
   sim time; "what's up?" starts the real question. One new chat-window state (typing
   indicator), the rest dialogue data. The veteran links the in-fiction no-hello page in
   the Browser - a parody page, Browser machinery exists.
3. **The 4:55 ticket.** `arrives_minutes_before_close` as ticket DATA generalizing the
   friday-17:55 seed; one mid-week ticket ships on it to prove the field is not
   Friday-shaped. Its response window is honest - a ticket that arrives 5 minutes before
   close with a 60-minute target carries its truth into tomorrow by the business-hours
   arithmetic that already exists.
4. Gates: a journey per payload (walk-up mid-ticket, both choices walked; no-hello burns
   what it claims; the 4:55 ticket's clocks true across the day boundary); solvability +
   determinism; goldens move ONCE for the week's new content, every number argued;
   off-hours silence; both halves on box, count checked.

---

# Slice 0.3.5 - the Assistant (issue #14)

Descoped from event days (deferred - they need a post-probation home, owner-flagged on #14).
This slice is E2 (#3): the useless-tips desk character. Flavor only, dismissible, and the
hints-never-answer house rule is the whole design constraint - it must never help.

1. **Its own character, NOT the paperclip.** A beige desk object with a face - the art pass
   picks between the candidates (stapler / CRT-with-eyebrows / desk-fan-with-eyes); the
   shell ships the frame and one placeholder that reads as "the office gave you a helper and
   it was the cheapest one". Tokens only, square 9x aesthetic, reduced-motion answered.
2. **Strictly useless.** Its lines are data, fired on the event cadence the desk already
   emits (onTick / onWorldChange / day.onChanged). It comments on what is happening and is
   never right about what to do - "Looks like you're closing a ticket! Have you tried
   turning it off and on again?" during a password reset. The KB owns all real help; the
   Assistant is FORBIDDEN from carrying a true actionable hint (gate: every line checked
   against a banned-substance list of the real fixes, the way hints-never-answer is gated
   elsewhere - a line that names the actual verb for the situation on screen fails the
   build).
3. **Dismissible, with memory.** Close it and it goes; it comes back on the next day (or the
   next big event) with a line about having been dismissed ("You closed me. That's okay.
   I've made a note. The note says you closed me."). Dismissal count is world/shell state
   that round-trips a save - one field, gag escalates by count.
4. **Never load-bearing.** Nothing in any journey may require reading it; it is pure overlay.
   The completeness walk drives its show/dismiss controls but asserts no gameplay depends on
   it. Speed-drop / takeover interplay: the Assistant is desk furniture, so a takeover hides
   it like the rest of the desk (it does not talk over the meeting - even it is not that
   useless).
5. Gates: a unit asserting the banned-hint gate has teeth (a planted true-hint line fails);
   dismissal round-trips a save; the cadence fires lines without ever blocking input;
   goldens byte-identical (it is not world state beyond the dismissal count, which the walks
   never touch); the completeness manifest gains its controls; both halves on box, count
   checked.

---

# Slice 0.3.6 - tail + polish (issue #16)

Owner-directed consolidation before E3: E1's last small payload, the owed flake fix, and the
balance the five fast slices left. Three parts; part 3 is driven by a concrete QoL/balance
findings pass, not abstract polish.

## Part 1 - the after-hours ping tail

E1's final payload (research P2, the boundary-erosion beat). A day does not end when the
shift does.

1. **A couple of pings land after `day_end`** - "overnight" - authored per day, world data.
   They are NOT tickets and NOT interruptions during the shift; they arrive in the gap
   between clocking off and the next login.
2. **Shown at next-morning login** on the day screen: a small "while you were out" surface,
   the messages that came after you left. Answerable there.
3. **Answering carries its honest cost**: a tiny reputation gain (you were reachable) paid
   against a tiny stress carryover into the new day (you were reachable). Leaving them is
   free of both - the tradeoff is the teaching, neither path punished into non-existence.
   World-enforced off the graph, once per ping, saves round-trip.
4. **Presence interplay**: DND overnight reduces how many arrive (you told them); answering
   from an "off" status the next morning is its own small tell, consistent with the 0.3.3
   triangle - reuse it, do not invent a fourth cost.
5. Placement: they are a property of the day boundary, not the probation content - the week
   ships one or two so the surface is real, weighted per title later (titles-as-difficulty).

## Part 2 - the day.spec fake-clock flake (#15)

`day.spec` keeps deliberate raw speed runs (the 0.3.2 contract), so under full-suite parallel
load a retrying assertion races a fake clock still advancing at x4 - the +20/+40 fingerprint.
Make its exact clock reads deterministic (pause around them, the house `underPause` pattern
used everywhere else) WITHOUT loosening what the raw-run speed test proves - the transition
being tested stays asserted; only the read is held. Test-only, no product change. Teeth: a
planted real speed bug (a tick that overspends) still reds it.

## Part 3 - the balance + QoL sweep

Driven by the overseer's QoL/balance review of the v0.3.0-v0.3.5 surfaces (findings appended
below when the pass returns). Scope: tune the placeholder constants the slices flagged as
tuning knobs to their reviewed values (each move argued, goldens move with the meters); fix
taskbar chip crowding / overlay-attention conflicts when several 0.3.x systems fire at once;
keep the probation WEEK breathing (five slices each added load to one Mon-Fri - if a day is a
wall of takeovers, thin it, the week is a teaching arc); visual-coherence fixes so the new
surfaces read as one system, not five bolt-ons. Concrete findings only - no vague polish.

## Gates

Journeys: an after-hours ping answered at next login carries its tiny cost honestly; the week
still teachable (no day a wall of takeovers). Determinism. #15 proven gone under parallel load
with the speed-bug teeth intact. Goldens: after-hours + balance changes MOVE meters - move
once, argue every number; the week-load rebalance likewise. Both halves box, count checked;
codex wave before release.

### Part 3 findings (from the QoL/balance review of v0.3.0-v0.3.5)

Reassurance first: **F0 - the probation week is NOT overloaded** (takeovers Mon 0 / Tue 1 /
Wed 1 / Thu 2 ~3h apart / Fri 1 - each slice picked a different day). Leave placement alone;
no week-rebalance, no golden churn from that.

Fix, in order:

- **F1 (P1, feel) - the tray can crowd the open-window buttons off the taskbar with no
  recovery.** The fixed left-to-right cluster (chips + the always-on ~84px presence word +
  the 5-button speed cluster) competes with `.taskbar-windows` (`flex:1`, `overflow:hidden`,
  no scroll). Worst case (3 chips + presence + speed) clips window buttons unreachable. Fix:
  an overflow affordance on `.taskbar-windows` (scroll or a "»" menu) AND collapse the
  presence control to the three dots with the word on hover/title, so the fixed cluster stops
  eating the window row.
- **F2 (P2, speed-as-UX) - the x1 drop is silent.** Five takeovers a week drop the clock to
  x1 with no signal but the pressed button; a player runs an afternoon slower than chosen
  without noticing. Fix: a one-line self-dismissing telegraph on the drop ("Clock dropped to
  x1 - a call came in"); keep the no-auto-restore rule (this closes the 0.3.2 flag).
- **F3 (P2, legibility) - chip colour crosses severity.** `.save-chip` (the one serious chip)
  is byte-identical to `.fumble-chip` (a cosmetic joke), and `.refocus-chip` (a real debuff)
  is styled neutral like ambient telegraphs. Fix: give the save-health chip its own
  unmistakable "not a joke" treatment distinct from the fumble chip.
- **F4 (P2, balance/teaching) - the presence triangle is under-taught.** The week authors
  zero `chat`/`boss`-source dodgeable interruptions and only two calls, so DND's cost can go
  undiscovered across a whole probation - the tray reads as free, the exact trap the design
  avoids. Fix: add ONE `chat`-source dodgeable interruption mid-week so DND's drip actually
  bites and the constants get pressed (this also validates F5). One chat beat, not a takeover
  - keeps F0 intact. Goldens move for it, argued.
- **F5 (P2, constants) - the tuning knobs are conservative but not wrong; the week just does
  not press them.** Recommendation: NO constant change this slice - F4's new chat beat is what
  makes them pressable; re-evaluate `DND_WORKING_SUSPICION=2` and friends once it exists.
  Documented, not moved.
- **F6 (P3, coherence) - a meeting takeover leaves the tray fully live** (presence buttons
  look clickable, refuse, pop a panel over the meeting). Fix: dim/mark the tray + speed
  cluster inert under a takeover so it does not invite a refused click.
- **F7 (P3, the gag's cost) - the Assistant returns on every big event; the only move is
  re-close.** Fix: honour a dismissal for the rest of the DAY (not just until the next big
  event) so closing it means something within a session; it still returns tomorrow with the
  escalated note.
- **F8 (P3, attention) - the boss telegraph renders over a machine takeover** (door-flash +
  tremor behind the update screen, both un-actionable). Fix: suppress the door-flash/tremor
  while `data-takeover` is set; the chip may stay.

Coherence verdict: the three interruption windows already read as one grammar (call=chat
chrome, meeting=caught-scene chrome, reboot=OS-dialog register); the only incoherence is the
chips (F3). Not a rebuild - a chip-palette fix.

---

# Slice 0.4.0 - the web store, the policy, and the audit (E3 #4, slice 1, issue #17)

The first slice of a new epic, so it lays the whole spine minimally rather than building one
corner deep. New capability: you can install software, and the building has an opinion about
that. Tone: The Website Is Down. The version steps to 0.4.0 because "you can install things
now" is a class of change, not a patch.

## The architectural core (lane A) - why this is an epic, not a payload

`APP_MANIFEST` is static, built at module load. Installing adds a manifest entry AT RUNTIME,
and the installed set MUST round-trip a save. So:

1. **The manifest becomes base + installed.** A fixed base roster (everything that ships) plus
   an installed set that lives in save-carried state (shell store, like the dismissal count /
   caught evidence). The desktop mounts base ∪ installed. Uninstalling removes from the set.
2. **The coverage gate stays honest.** The completeness walk asserts every reachable control
   is known; an installable-but-not-installed app is NOT a missing control (you have not
   installed it) and an installed app's controls ARE walked. The manifest gate must
   distinguish "shipped and always present", "installable" and "currently installed" - a new
   category, not a fudge.
3. **Determinism.** The installed set is save state and pure `f(graph/store)`; scripted walks
   install nothing, so the golden weeks are byte-identical (asserted).

## Company policy as world data

4. **One policy field** on the employer/world: the install policy. The probation employer is
   LOCKED-DOWN (enterprise). Written as per-employer data so the E5 employer-switch seam reads
   it; wild-west employers (installs carry no audit cost) arrive with E5. Locked-down is the
   default, so the FORBIDDEN path is this slice's teaching.

## The web store + the install action

5. **The Browser gains the software catalogue** - a third site, data like the parody forum/
   gallery: a download page listing installable programs with the register of a late-90s
   shareware site (each a joke, none of it true beyond what installs). An `install` action
   (world verb, guarded) and an `uninstall`.
6. **Forbidden install works, and is recorded.** Installing against a locked-down policy
   SUCCEEDS - you get the app - but (a) drips suspicion like a slack app while it sits there,
   and (b) writes an audit-trail record (install id + tick), IT-audits-IT, the timesheet-audit
   pattern: an audit event surfaces the record per-entry, and the boss beat arms on that
   evidence, never at random. Uninstalling removes the app but the audit record that it WAS
   installed remains - covering your tracks is itself a tell.
7. **Installed relief beats the Browser.** An installed toy is a stronger stress drain than
   the ambient Browser slack - so the honest tradeoff under a locked-down shop is better relief
   at higher audit risk. Numbers in the balance table, conservative, flagged.

## Content

8. One or two installables shipped (a media player + a game, in the TWID register), each a real
   slack app once installed. Uninstall is real. The catalogue lists more than ships, greyed
   "coming soon" in the shareware voice (cheap, sets up later slices).

## Gates

Journey: install a toy under the locked-down policy, get its relief, collect the suspicion +
the audit record, an audit event surfaces it, uninstall and the record still shows it was
there. Save round-trip of the installed set (install, save, reload, still installed and still
audit-recorded). Solvability + determinism (install set = save state). Coverage manifest honest
about the three app categories. Goldens byte-identical (empty install set in walks) unless a
walk installs - argue every number. Off-hours silence extended to any new fields. Both halves
box, count checked; codex wave before release.

---

# Slice 0.4.1 - a tone of voice: the aggressive register (issue #18)

Owner-requested: the player can tell a user where to go - up to and including telling them to
fuck off. This is the aggressive register of the parked response-tones design (reply options
gain a register; the others - wry / cheerful / sarcastic / exhausted - are content on this same
framework later). Ships the FRAMEWORK + aggressive + neutral baseline. Follows 0.4.0 (shares
dialogue/meters/coverage surface with the E3 lane - built next, not in parallel).

## The load-bearing rule (house, structural, not a promise)

Tone NEVER changes whether the ticket resolves. You can be as rude as the option allows and the
fix still happens - you never lose a ticket for sarcasm. The consequence is SOCIAL and real:

- a reputation cost (a genuinely rude reply damages your standing);
- the reporter reacts - the next message in their stream sharpens, and repeating it escalates
  (they complain / it comes back), reusing the customer-visible-stream machinery;
- boss watching (patrol present) when it is sent -> a suspicion beat, caught-scene class,
  evidence-armed (you were seen telling a user to get lost), never random;
- it scales with the register: neutral costs nothing, aggressive costs the lot.

## The mechanism (on the existing dialogue data model)

- `DialogueOption` gains an optional `tone` (`neutral` | `aggressive`; extensible). Data.
- A toned option's `effects` are the SAME ticket-work effects the neutral reply would run
  (identical resolution path) PLUS a social-consequence registered action. The tone changes the
  SOCIAL effect list, never the ticket effect list - which is what makes "the fix still happens"
  a structural guarantee. The gate asserts the ticket-work effects of the aggressive and neutral
  options on a beat are identical; only the social effects differ.
- The crude line is authored CONTENT on the beat - genuinely blunt, the register the owner
  asked for. The game does not endorse it: the social cost is always paid, it is a deliberate
  pick, never the default option.

## Content

Aggressive options on SELECTED beats where the user has earned it (tone appears only where
personality shows - a content multiplier, so not all 23 tickets). The fully-crude option on one
or two of the most infuriating beats (the catharsis asked for); milder-aggressive on the rest,
so it reads as a register and not a single button.

## Gates

The INVARIANT (aggressive reply resolves its ticket byte-identically to neutral + applies the
social cost) asserted as a gate with teeth (a tone that drops a ticket effect reds it). Journey:
send it, ticket still closes, reputation drops, boss-watching -> suspicion beat, repeat ->
reporter escalates. Solvability unchanged (tone never blocks a path). Determinism. Goldens: move
for rep/suspicion if a walk picks a toned option, argued - else walks pick neutral and goldens
are byte-identical (assert which). Off-hours; save round-trip; both halves box; codex wave.
Owner calibration: genuinely blunt per the directive, never endorsed (real cost); dial back at
review if too far.

---

# Slice 0.4.3 - make the quiet dot cost something (issue #20, closes F4/F5)

The tracked debt from the 0.3.6 QoL review: the 0.3.3 presence triangle is under-taught. DND
dodges call/chat/boss sources, but the probation week authors zero chat/boss dodgeable beats
and only two calls, so a player can finish probation never learning Do Not Disturb has a cost -
the tray reads as free, the exact trap the design set out to avoid. And F5's constants are
placeholders the week never presses.

## F4 - one chat beat that makes DND bite

Add ONE chat-source dodgeable interruption mid-week (a colleague DM / quick-question DND would
slide). CHAT beat, NOT a takeover - the week is not overloaded (F0) and stays that way. It
presses the triangle: sit on DND to dodge it and collect the working-DND suspicion drip, and
past threshold with the boss reading the dot, the "on Do Not Disturb all morning" beat; stay
Available and take the interruption's cost instead. The tradeoff becomes real and discoverable
inside probation. Pure content on the 0.3.3 rails (READS_THE_DOT already includes chat; the
dodge ledger and the drip exist) - no new mechanism.

## F5 - tune the constants now they are pressable

With F4's beat existing, judge the DND constants against a real dodge. The review flagged
`DND_WORKING_SUSPICION = 2` as cheaper than the Browser slack window - once there is something
worth dodging, DND-while-working may be too cheap. Tune ONLY with justification against the
now-pressable week; raise it toward "sitting on DND to dodge the chat beat costs about what the
dodge saves" if the read holds. Each move argued, goldens move with the meters, constants stay
flagged.

## Gates

Journey: a DND morning dodges the new chat beat, collects the drip, meets the boss beat past
threshold; an Available morning takes the beat's cost - both playable, neither dominates.
Determinism. Solvability under all three presence values (a dodgeable chat beat never blocks a
path). Goldens move once, argued (the arrival, plus any tuned constant) - prefer the golden
walks pick Available and HANDLE the beat, with the DND-dodge path exercised by a focused test.
Off-hours; save round-trip; both halves box; codex wave.

---

# Slice 0.4.4 - real games in the arcade (issue #21, E3 content)

Owner-requested: actual playable games. The web store's Office Arcade is a deliberate joke ("a
block moves left, this is the game") and the media player plays SILENCE.WAV; the store lists
greyed "coming soon" rows. This slice delivers the two programs that actually ran the 90s office
- Klondike Solitaire and Minesweeper - as REAL, playable installable toys, on the E3 rails
already built (installable manifest, slack:true, relief drain, caught scene, audit trail). Truer
and funnier than a shooter: installing a card game is exactly what puts you on IT's list.

## Lane A (this slice's headline) - Klondike Solitaire

1. A genuinely playable Klondike toy: a seeded deal, tableau + foundations + stock/waste,
   legal-move rules, draw, move-to-foundation, win/lose. Real game logic, separable from the
   DOM and unit-tested (a deal is well-formed; a legal move is accepted, an illegal one refused;
   win and lose states reachable).
2. **Deterministic seeded RNG in the shell toy** - the engine bans `Math.random`; the toy
   carries its own seeded PRNG seeded from a shell source (NOT wall clock), so the deal is
   testable. Game internal state is TRANSIENT shell state (a reload reshuffles, like the current
   arcade); the SLACK RELIEF is the only world effect, so goldens are byte-identical (scripted
   walks never open it - assert).
3. Wire it exactly like arcade/mediaplayer: an installable in the manifest, `slack:true`,
   `INSTALLED_TOY_SLACK_RATE`, a caught scene (boss catches you mid-hand), and it fills one of
   the web store's coming-soon rows. Installing it under the locked-down policy writes the audit
   trail (0.4.0). Parody-safe name (like the cloud providers): "Office Solitaire" / a coined
   name decided at build.

## Lane B (fast-follow, same rails) - Minesweeper

Same wiring, its own logic: a seeded board, reveal/flag, flood-reveal on a zero, lose on a mine,
win on all-safe-revealed. Unit-tested logic; transient state; fills the second coming-soon row.
Reuses Lane A's proven install/slack/audit pattern verbatim - build after Lane A lands so it
copies a working wiring rather than re-deriving it.

## Gates

Playable: unit-level game-logic tests (well-formed deal/board; legal vs illegal move; win + lose
reachable) - deterministic, DOM-independent. Slack: installed toy drips relief + is catchable +
audits under policy (reuse 0.4.0 rails). Goldens byte-identical (transient game state; walks
never play - assert). e2e: install from the web store, play a few real moves, get relief, get
caught / audited. Coverage: the toys' controls catalogued as installable-until-installed (the
0.4.0 three-category rule). Both halves box; codex wave.

---

# Version 0.5.0 - channel sprawl (E4 #5, issue #22) - THE FIRST BUNDLED VERSION

Owner cadence: fewer, larger updates. This version bundles three slices; each gets its lane
and its internal gate, and the VERSION gets one codex review + one box cycle + one release
note at the end. Research: modern-stack.md section 6 (DM bypass, conversational ticketing,
deflection bots), day-to-day-frustrations.md section 3.

## Slice 1 - the third channel

1. A Teams/Slack-parody app - CHANNELS + threads + @mentions + unread badges - distinct from
   the 1:1 Chat. Shipped on the base manifest, not installable: the company rolled it out and
   nobody asked for it, which is the joke and the truth.
2. World data decides which requests arrive on which channel. The 0.3.3 presence dot is shared
   across channels (one dot, everyone reads it).
3. Parody-safe name at build. The register: enterprise chat that is very excited about itself.

## Slice 2 - the same question everywhere

4. One authored request arrives on MULTIPLE channels (mail + chat + the new app). Answering
   the HUMAN anywhere satisfies them; only the TICKET path counts at review - the DM-bypass
   truth generalized to the whole intake surface.
5. Convert-to-ticket generalizes: any channel message can be minted into a real ticket (small
   time cost, keeps both the human and the credit) - the conversational-ticketing
   countermeasure, playable.
6. Duplicate arrivals are NOISE the player learns to dedupe; answered-in-the-wrong-place
   reuses the gratitude-no-credit scoring the DM bypass already has.

## Slice 3 - attention as a resource, and the bot

7. Unread badges across channels feed a small attention/stress input - the sprawl cost made
   mechanical. Conservative, flagged, argued at the goldens.
8. "Have you tried the portal": some tickets arrive pre-chewed by the deflection bot ("Bot
   tried: password reset. User says: still broken") - explains mechanically why the surviving
   queue is the weird stuff. The bot-frustrated archetype arrives pre-angry; the 0.4.1 tone
   register is how the player meets them.
9. Channel mix per employer is DATA (the E5 seam).

## Gates (once, at the version)

Journeys: the multi-channel request deduped and converted (counts at review); answered in the
wrong place (gratitude, no credit, visible); the pre-chewed ticket; unread pressure felt and
cleared. Goldens move once for the week's channel content - every number argued. Solvability,
determinism, off-hours, save round-trip standing. One codex review of the whole version diff
(</dev/null + timeout), one full box cycle, one release note.

---

# Version 0.5.1 - mobile playable (issue #23, owner-flagged mobile UX)

Owner: mobile UX is bad. Audit: the game is a fake-DESKTOP-OS, desktop-first by design, and
the HARD blocker is the boss key - Backquote, a physical key with no touch equivalent, so the
panic-hide-your-slacking core mechanic is DEAD on a phone. This is TIER 1: make it PLAYABLE on
touch. The full responsive layout (single maximized window, bottom nav, terminal ergonomics)
is TIER 2 - a separate epic, owner's scope call, NOT this version.

## Slice 1 - the on-screen panic control (headline)

1. Extract the boss-key action (`desktop.ts`: `closeTransientSurfaces()` +
   `commitWindows(minimizeSlackWindows(...))`) into a `panic()` method. The keydown handler
   and a new on-screen panic button both call it. The panic-key contract holds: no wait for a
   field to lose focus.
2. The button shows on touch / coarse-pointer / a narrow viewport (feature-detect via
   `pointer: coarse` / width, never user-agent sniffing). On desktop the keyboard path is
   unchanged. test-id for the button.

## Slice 2 - windows fit a small viewport

3. Clamp window geometry: max-width/height to the viewport (minus chrome), and reposition a
   window that would open off-screen back into view - nothing unreachable or undraggable on a
   phone. Clamp geometry only; do NOT rebuild the window manager (the cascade/occupancy logic
   and the 0.3.6 taskbar-scroll fix are the precedent).

## Slice 3 - touch tap targets

4. The panic button, window close, and the key chips get ~44px hit areas on coarse-pointer via
   tokens + `@media (pointer: coarse)`. Desktop sizing unchanged.

## Not in scope (tier 2, an epic)

Full responsive single-window layout, bottom nav, terminal touch ergonomics, orientation. This
version makes the desktop OS PLAYABLE on a phone; it does not make it a phone app.

## Gates

The panic button fires the IDENTICAL action as the boss key (driver/unit teeth on the shared
`panic()` - key and button minimize the same windows, close the same transient surfaces). A
geometry unit for the off-viewport clamp. Desktop path unchanged (the existing boss-key e2e
still passes). Goldens byte-identical (UI/CSS + a method extraction, no world state) - assert.
Coverage: the panic button in the manifest + PLAYER_CONTROLS. Both box halves; codex wave
(</dev/null + timeout).

---

# Version 0.6.0 - employer switching spine (E5 #24) - NEW EPIC, bundled

Owner GO (2026-08-05, "full spine"). Settles the event-day home: they live in the second
employer's arc. The architecture is already seamed (session.ts WeekCarry persists player
stats; companySetup is parameterizable; 0.4.0 policy + 0.5.0 channel-mix are per-employer
data) - this EXTENDS, it does not rewrite. Era/OS SKINS are a LATER E5 version (per-edition
research spikes), NOT this one.

## Slice 1 - the switch engine

1. Extend the carry so a company SWAP keeps the player's CAREER: reputation / title / standing
   + farmFund + arc position survive when the world graph (company, estate, tickets, accounts)
   is replaced. Today WeekCarry = {farmFund, attempt, arcWeek}; add the employer identity + the
   career stats that must persist, seeding the new employer's player node FROM the carry (not
   fresh). Three exits set up the next employer differently: completed probation, resigned,
   fired. Determinism: same carry + employer = same world; save round-trips the career carry
   across the switch. The PROBATION week stays byte-identical (a fresh probation still plays
   the same) - asserted.

## Slice 2 - the post-probation transition

2. Pass probation (the Friday review that goes the right way) -> an OFFER -> accept -> arrive at
   a second employer, Monday, week 1 of the new arc. Reputation follows you: a good probation =
   a better offer; a firing = worse offers / the trail. The farm-fund joke persists. A diegetic
   "you got the job, here is your new machine" transition (rides the boot / update-screen
   precedent). The player keeps title/standing; the WORLD is new.

## Slice 3 - the second employer (archetype + the event day)

3. A second companySetup with a DIFFERENT ARCHETYPE from the enterprise-locked-down probation
   shop: ship one contrasting employer (a wild-west small shop - install policy wild_west so
   installs carry no audit cost, the 0.4.0 seam paying off; a different channel mix, the 0.5.0
   seam; a different estate, ticket flavor, boss and culture). Its week carries an EVENT DAY -
   the deferred reply-all storm OR password rotation, finally homed. The contrast is the
   teaching: the same skills, a different building.

## Gates (once, at the version)

Probation-week goldens BYTE-IDENTICAL (the switch is additive) - asserted. New goldens for the
second-employer week, argued. Journeys: pass probation -> offer -> second employer plays;
career stats persist across the switch (save round-trip); the second employer's policy /
channel / archetype genuinely differ; the event day fires there. Solvability + determinism per
employer. One codex (health-checked, </dev/null + timeout), one full box, both halves.

## Deferred (later E5)

Era/OS skins (Win/Linux/Mac x edition, LOOK + DIALECT, fidelity mandate, per-edition spikes);
more employer archetypes; titles-as-difficulty; the full unemployable=game-over fail arc.

# Version 0.7.0 - the heterogeneous estate (E5 estate half, #25)

Owner refinement (2026-08-05): the estate is MIXED - Windows workstations + Windows servers
(AD, IIS) + Linux servers running the actual product. Company archetype is a world axis on the
0.6.0 employer registry. Sequencing decided: build the estate as WORLD DATA now, truthful in
the read-only surfaces a Service-Desk player already has; the player's Linux DESKTOP and
hands-on Linux-server MANAGEMENT gate to the Engineer tier (E6, unbuilt - 0.6.0 was a lateral
switch, not a promotion). Data-scoped by docs/spikes/heterogeneous-estate.md (BUILD-READY).
Family rule holds: families are not one shell in hats - a Windows tool aimed at a Linux box
refuses the way the real tool does, and the refusal is the lesson.

## Slice 1 - the os dimension + os-aware service baselines

FIELDS.machineOs (`os`: windows | linux), seeded per machine, absent = windows (back-compat).
New roles: iis_server (Windows), app_server + db_server (Linux). services.ts baseline map
becomes os-aware: Windows roles keep their EXACT current service sets (the fourteen existing
boxes change only by the added field - a conscious diff); Linux roles select real Ubuntu 24.04
systemd unit sets (nginx.service / <product>.service / ssh.service / systemd-journald / cron;
db gets postgresql). systemd status vocabulary is real (active (running) / failed / inactive) -
the Linux analogue of RUNNING/STOPPED/WEDGED, held as data, printed only where the graph holds
it. These units EXIST as world data (a future E6 `systemctl status` reads them) but are not yet
readable - the estate real ahead of the tools, as the filesystem slice seeded files first.

## Slice 2 - seed the heterogeneous estate

Add an IIS intranet box (W3SVC / WAS / AppHostSvc - WAS is W3SVC's real dependency) and one or
two Linux product/db servers to the first company (company.ts). Give Bodgeworth an undocumented
Linux box (second-company.ts) fitting its wild-west character. Confirm DC-01's AD baseline is
honestly named (NTDS / Kdc / DFSR on top of DNS/Netlogon). Employer estate-archetype read off
the registry: corporate (workstation-heavy + DC + IIS + a Linux box or two) vs wild-west (small
undocumented mix). SaaS/product archetype (mostly-Linux fleet) is NAMED as the future employer
the axis exists for, not built here.

## Slice 3 - cross-OS command honesty (the player-facing payload)

The SD player's Windows-family tools, aimed at a Linux host, refuse the way the real ones do:
`sc query APP-01\nginx` / `services APP-01` / `restart APP-01\nginx` answer honestly that the
box is not a Windows host, that it runs systemd, and that this terminal does not speak it -
which names the other family and the tools to learn (the on-ramp to E6, taught by refusal).
`tasklist /s` gains the not-Windows reason on top of its existing Remote-Registry refusal.
`ping` / `nslookup` / `tracert` stay OS-agnostic and reach + name the new boxes (the reply
proves the wire and nothing about the service, the truth ping already tells). This is the whole
change the SD player SEES.

## Gates (once, at the version)

Goldens move once (new field on every machine + new nodes), argued not silent. Journeys: the
new boxes ping / resolve / trace; the Windows management tools refuse a Linux host with the
honest wording and name systemd; the Windows tools still work on Windows boxes (no regression);
services/sc on the IIS box list its real services; the DC names AD honestly. Determinism +
solvability unchanged (no new tickets this slice). One codex (health-checked, </dev/null +
timeout), one full box at --workers=2.

## Not in scope (E6, per spike)

The unix terminal (ls -la / systemctl / journalctl / ss / ip / dig at Ubuntu fidelity), ssh,
the player's Linux DESKTOP skin, IIS app-pool recycles (appcmd), AD replication faults,
product-down escalation content. The Ubuntu 24.04 command-surface research is recorded when E6
builds it - not needed here because this slice ships no unix commands.

# Version 0.8.0 - the MSP employer + customers + scope-of-touch (E5, #26)

The customer/MSP arc opens (Path A, owner 2026-08-05). Research base: six syntheses distilled in
docs/design/estate-and-customers.md (three-axis model) and docs/design/msp-arc.md (this arc's
plan). A THIRD employer - a Managed Service Provider serving many customer companies - reached
via the 0.6.0 offer/switch the way Bodgeworth is, NOT a reframe of the shipping employers. The
one big new concept is the first-class CUSTOMER; almost everything else reuses shipping systems
(tickets + P1-P4 SLA + the timesheet mechanic = the PSA; the 0.7.0 estate = each customer's
infrastructure; the KB = the runbook; the remote surface = ScreenConnect). This version ships
the spine; the RMM board, more verticals, the change-request authorisation moment, onboarding,
co-managed and SLA tiers are the backlog (msp-arc.md).

## Slice 1 - the CUSTOMER entity + the MSP employer

A customer is a first-class world entity owned by the MSP employer: an id, a business-type (which
selects its estate, reusing the 0.7.0 os/role/service machinery whole), a service-scope contract
(monitoring_only | helpdesk | co_managed | fully_managed), and an SLA tier. The MSP employer
(on the 0.6.0 registry, like Bodgeworth) stands up N customer sub-estates, each tagged with its
customer id. Reached via the existing offer/switch; career stats carry across per 0.6.0.

## Slice 2 - the customer dimension on tickets + context

Tickets carry a `customer`. The queue shows which customer each is for; opening a ticket LOADS
that customer's context (the estate/creds an action then targets). Every ticket names its customer
- the multi-customer board the round-1 research calls the defining fact of MSP work ("the queue,
not the tech, decides which company you are in").

## Slice 3 - scope-of-touch, as a real RBAC-403 (reuses the 0.7.0 honesty engine)

Each customer's contract defines an allowed-actions scope; an out-of-scope action REFUSES with the
true reason - the same honesty engine 0.7.0 shipped for cross-OS refusals, generalised OS ->
CONTRACT, and it COMPOSES with 0.7.0 (a helpdesk player reaching for the SaaS customer's Linux
prod is refused on BOTH counts). Reasons are all real (Azure Lighthouse / GDAP / PAM-tiering
model): monitoring-only = notify-and-escalate not remediate; helpdesk = workstations/users, servers
out of contract; co-managed = notify their IT first; risky = needs a change request. Not a wall -
the shape of the job, taught by the world refusing.

## Slice 4 - the "which customer am I in?" pre-flight guard

A currently-selected customer (loaded from the open ticket). An action aimed at a machine that
belongs to a DIFFERENT customer is caught by a pre-flight tenant-match check that names both -
the MSP multi-tenancy horror (acting in the wrong client's environment) made mechanical, funny and
true. One guard; high value.

## Slice 5 - three verticals, real tickets, correctly scoped

Ship 3 customers spanning the poles, with real tickets from the vertical research (docs/design/
msp-arc.md cites them): a Windows-only LAW FIRM (helpdesk: DMS check-out deadlock, mailbox perms,
the e-filing-deadline panic, "always printing"); a SaaS/Linux SHOP (helpdesk: Okta SSO loop, SCIM
provisioning, Jamf Mac - with the Linux prod fleet OUT OF REACH, refused on OS + scope both); and
ONE MONITORING-ONLY account (an alert you may only acknowledge + escalate, not fix - the sharpest
scope contrast). Each ticket carries its true scope; the estates are seeded per business-type.

## Gates (once, at the version)

Goldens move (new customer entities + estates); argued. Journeys through the REAL path (the 0.6.0
lesson): switch to the MSP; open a ticket and land in the right customer's context; work an
in-scope helpdesk ticket to resolution; hit an out-of-scope action and get the truthful refusal
(monitoring-only can't-fix; helpdesk can't-touch-server; SaaS prod refused on OS+scope both); trip
the wrong-customer guard by aiming at another customer's box. Scope refusals proven with teeth
(fail when the guard is reverted). Determinism + solvability per customer. Existing employers
(probation, Bodgeworth) BYTE-IDENTICAL (the MSP is additive). One codex (health-checked; overseer
reviews by hand if codex is down), one full box at --workers=2.

## Not in scope (backlog, msp-arc.md)

The RMM/monitoring BOARD as a surface (monitoring-only starts as a scope-refusal); the Mac creative
+ dental verticals; the change-request authorisation gate; customer onboarding/discovery content;
co-managed coordination depth; Bronze/Silver/Gold SLA tiers + service credits.

# Version 0.9.0 - the RMM / monitoring board (E5, MSP arc, #27)

The monitoring-only customer gets its real surface. In 0.8.0 monitoring_only was only a terminal
REFUSAL (you may not fix); 0.9.0 gives it the RMM board it is defined by - "eyes on glass" - so
the monitoring-only contract becomes a played surface, not just a wall. Research base: the round-1/2
syntheses (NOC/RMM, alert fatigue, monitoring-only = notify-and-escalate) distilled in
docs/design/msp-arc.md. Reuses the estate (0.7.0), the customer/scope model (0.8.0), the app/window
shell, and the escalate verb; the one new thing is the board app.

## Slice 1 - the board app (a new AppDef, like the browser/tickets apps)

An RMM/monitoring board: per monitoring-only customer, the watched things (a backup job, a TLS cert,
a disk) each as a row with a live STATUS (ok / warning / failed / firing) read from the estate (the
service/machine nodes 0.8.0 already seeds on the clinic). The board is the monitoring-only customer's
whole visible surface - it shows state; it has no fix button, by contract and by design.

## Slice 2 - acknowledge + escalate, the only valid moves

An alert can be ACKNOWLEDGED (you have seen it; stops it re-nagging) and ESCALATED (raise it to the
customer / their own IT - the contracted action). These are the monitoring-only player's entire verb
set on the board; a fix is refused exactly as 0.8.0 refuses it. The 0.8.0 northwind alert tickets
(backup / cert / disk) now resolve THROUGH the board's acknowledge+escalate, not only via the terminal
- the ticket and the board agree (the same node state, read two ways, cannot drift - the spool-is-the-
queue discipline).

## Slice 3 - alert fatigue (the comedy + the skill)

The board carries NOISE: benign/auto-clearing alerts (a transient CPU spike that resolves itself, a
flapping check) mixed with the real ones. The skill and the joke is triage - acknowledging the noise
without missing the backup that is genuinely failing. Noise is deterministic (seeded, no Math.random)
and auto-clears on its own clock; the real ones do not. A player who escalates every blip is the
boy-who-cried-wolf; one who ignores the board misses the one that mattered.

## Gates (once, at the version)

Goldens move (board state + any new alert nodes); argued. Journeys through the REAL path: at the
monitoring-only customer the board shows the watched things with true state; acknowledge quiets an
alert; escalate resolves the contracted ticket; a FIX is still refused (the 0.8.0 mechanic intact,
proven through the board too); the board state and the alert ticket agree (no drift); noise
auto-clears and real alerts do not. Existing employers + the 0.8.0 helpdesk customers BYTE-IDENTICAL
(the board is additive, monitoring-only-scoped). One codex (overseer by hand if down), one full box
at --workers=2.

## Not in scope (backlog)

Monitoring for NON-monitoring-only customers (a fuller RMM across all contracts); on-call / after-
hours paging off the board (that is E6); the Mac creative + dental verticals; change-request auth;
onboarding; SLA tiers.

# Version 0.10.0 - the change-request authorisation moment (E5, MSP arc, #28)

Completes the scope loop. In 0.8.0 an out-of-contract action is a flat REFUSAL; in reality risky or
out-of-scope work is not forbidden, it is GATED - you file a change request (scope, risk, rollback),
it is approved, and only then may you act, in a window. This turns some hard refusals into a real
path: request -> approve -> act. Research base: the scope-enforcement synthesis (change management:
"a change request logs scope, risk, impact and rollback plan, goes through approval, and only after
sign-off can the requester schedule it") in docs/design/msp-arc.md. Reuses the 0.8.0 scope engine and
the 0.9.0 escalate/handoff pattern; the new thing is the change-request object + its approval gate.

## Slice 1 - the change-request object + verb

A change request is a world object: the action it authorises (target + verb), a stated risk, a
rollback note, and a status (draft -> submitted -> approved | rejected). A verb files one for a
specific out-of-scope/risky action. It is the diegetic form of "do we have authorisation to reboot
production at 2pm" - the artifact that gates the action, separate from the alert that surfaced it.

## Slice 2 - the scope engine consults approvals

The 0.8.0 scope pre-flight gains a branch: before refusing an out-of-scope/risky action, it checks
for an APPROVED change request covering that exact action. If one exists (and is in its window), the
action is ALLOWED; if not, the refusal now names the PATH ("this needs a change request - file one")
rather than a dead end. Monitoring-only stays notify-and-escalate (no CR makes a watch-only contract
into a remediation one - that is a contract change, not a change request); helpdesk-reaching-for-a-
server and genuinely risky work are what a CR unlocks. Distinguish clearly, per the research.

## Slice 3 - approval + the window

Approval is diegetic and truthful: a submitted CR is approved by the authority the real one needs
(the customer / their IT for co-managed; a lead for internal risk) - modelled without hand-waving
(e.g. an approver beat, or a deterministic approval after a stated review, never a fake instant yes).
An approved CR opens a WINDOW; acting outside the window refuses. A rejected CR says why. The comedy
+ truth: the emergency you cannot touch until the paperwork clears, and the maintenance window at an
hour nobody wanted.

## Gates (once, at the version)

Goldens move (CR objects); argued. Journeys through the REAL path: an out-of-scope action now names
the CR path; filing + approving a CR then permits the exact action it covers; acting outside the
window/without approval still refuses; monitoring-only is NOT unlockable by a CR (still escalate-only);
a rejected CR blocks. Teeth: the approval gate fails closed (revert -> the action is wrongly allowed).
Existing employers + 0.8.0/0.9.0 customers BYTE-IDENTICAL where no CR is filed. One codex (overseer by
hand if down), one full box at --workers=2, plus the MSP e2e (e2e/msp.spec.ts) extended for the CR path.

## Not in scope (backlog)

Mac creative + dental verticals; onboarding; co-managed coordination depth; SLA tiers; a full CAB /
multi-approver flow.

# Version 0.11.0 - the remaining contract tiers as customers (E5, MSP arc, #29)

Completes the scope-tier matrix with real content. 0.8.0 shipped helpdesk (FONTAINE, MERIDIAN) and
monitoring-only (NORTHWIND); the scopeVerdict engine ALSO handles fully_managed (everything allowed)
and co_managed (notify their IT / coordinate) but no customer exercises them. This ships two more
customers so both tiers are PLAYED, not just coded - and it exercises the 0.10.0 change-request path
(co_managed sign-off) with real content. Mostly content on the proven 0.8.0/0.10.0 rails; the one new
seam is the co_managed "notify their IT first" step made real. Research base: docs/design/msp-arc.md
(the service-scope table; co-managed = shared access, coordinate, RACI "I thought you had it").

## Slice 1 - a FULLY-MANAGED customer

A small business where the MSP IS the whole IT department: a fully_managed contract, an estate
(workstations + a server or two), and 3-4 real tickets that span what helpdesk could NOT do at the
other customers - a server-side fix included - all IN SCOPE here (fully_managed = everything). This
is the contrast the tier teaches: at this customer the wall the other contracts put up is simply not
there. Real tickets (a shared-drive/server issue, a workstation issue, an account issue).

## Slice 2 - a CO-MANAGED customer + the notify-their-IT step

A mid-size business with its OWN internal IT the MSP works ALONGSIDE (co_managed): a RACI split -
their IT owns day-to-day user support, the MSP fills the gaps (after-hours, specialist, project).
The mechanic the tier turns on: acting on this customer's estate requires COORDINATION - a "notify
their IT first" step before (or as) you act, not unilateral action (the research's "I thought you
were handling that" risk, made mechanical). Wire it truthfully: a co_managed action either routes
through a notify/coordinate step, or - for risky work - through the 0.10.0 change request with the
customer's IT as the sign-off. 3-4 tickets showing the coordination (one where you must hand back to
their IT; one where you fill a gap they cannot).

## Slice 3 - the tickets, correctly scoped, real

Author the fully-managed + co-managed tickets at the fidelity bar (real systems, true KB), each
exercising its tier: fully_managed resolves work that would be refused elsewhere; co_managed requires
the notify/coordinate step (or a CR) and a unilateral attempt is caught. Reuse existing verbs; the
co_managed coordinate step is the one small new affordance.

## Gates (once, at the version)

Goldens move (2 new customers + estates + tickets); argued. Journeys through the REAL path: at the
fully-managed customer a server fix that is refused at a helpdesk customer SUCCEEDS; at the co-managed
customer a unilateral action is caught and routes through notify-their-IT / a CR; both tiers' tickets
are solvable via their intended path; monitoring-only + helpdesk customers UNCHANGED. Teeth: the
co_managed coordinate gate fails closed (revert -> unilateral action wrongly allowed). Existing
employers + 0.8/0.9/0.10 customers BYTE-IDENTICAL. One codex (overseer by hand if down), one box at
--workers=2 (run in halves if the worker crashes) + msp.spec extended for the two new tiers.

## Not in scope (backlog)

Mac creative + dental verticals (need os=mac / a Mac skin); customer onboarding/discovery; Bronze/
Silver/Gold SLA tiers; a full CAB.

# Version 0.12.0 - customer SLA tiers (E5, MSP arc, #30)

The slaTier field has ridden on every customer since 0.8.0 (Holloway Gold, Arden Silver, ...) but
means nothing yet. 0.12.0 wires it: a customer's tier x a ticket's severity sets the response/
resolution CLOCK, so a Gold customer's problem is on a tighter deadline than a Bronze one's, and the
breach has a tiered consequence. Research base: the SLA-per-tier synthesis (Bronze/Silver/Gold x
P1-P4; Platinum 15-min P1 vs Silver 4-hour; breach = a service credit) in docs/design/msp-arc.md.
Layers onto the existing P1-P4 SLA + the ticket/severity model; mostly data + the clock computation.

## Slice 1 - the tier x severity SLA table

A real table: response + resolution targets per (slaTier, severity). Gold tighter than Silver
tighter than Bronze; P1 tighter than P4; the shape from the research (P1 minutes, P4 next-business-
day, Gold ~4x tighter than Bronze). A ticket at a customer reads ITS customer's tier and its own
severity to get its clock - replacing/parameterising the uniform SLA the game has now. Truthful,
deterministic. Existing (non-MSP) tickets keep their current clock (absent tier = the default the
probation/Bodgeworth world already uses - byte-identical).

## Slice 2 - the clock, shown and enforced

The ticket surface shows the tier + the deadline it earns; the SLA clock counts against the tiered
target; a breach is recorded. The tier is visible so the player can TRIAGE by it (a Gold P2 outranks
a Bronze P1 in the queue - the real prioritisation call). The clock pauses on "waiting on customer"
as it already does.

## Slice 3 - the tiered breach consequence

A breach costs by tier, truthfully: the higher the tier the more the miss costs (a Gold breach is a
service credit / a sharper reputation hit; a Bronze breach is a shrug). Never punish honesty; the
cost is the missed CLOCK, and it reads at the review the way performance already does. The comedy +
truth: the Gold customer who pays for 15 minutes and expects 15 minutes.

## Gates (once, at the version)

Goldens: MSP tickets' clocks move (they now read a tier); argued. Existing employers' tickets
BYTE-IDENTICAL (absent tier = current default). Journeys through the REAL path: a Gold ticket has a
tighter deadline than a Bronze ticket of the same severity; the tier shows on the ticket; a breach at
a higher tier costs more; the clock still pauses waiting-on-customer. Teeth: the tier actually changes
the deadline (revert -> all tiers get the same clock). Determinism. One codex (overseer by hand if
down), one box (workers=1 serial, the box is degraded) + msp.spec extended for the tier clock.

## Not in scope (backlog)

Mac creative + dental verticals; onboarding/discovery; a full CAB; service-credit BILLING surfaces
(the credit is a review/reputation effect, not an invoice).

# Version 0.13.0 - customer onboarding + the discovery horror (E5, MSP arc, #31)

The MSP arc's capstone: how a customer JOINS. A new customer is signed; you run DISCOVERY on their
estate (what machines, what services, what state), and you hit the genre-defining moment the research
names - "their backups were never actually working." Onboarding is where an MSP earns or loses a
client in the first ninety days; the game makes it a played beat. Research base: the onboarding
synthesis (discovery/audit -> RMM deploy -> the backup-never-worked horror-discovery) in
docs/design/msp-arc.md. Reuses the estate (0.7.0), the customer model (0.8.0), and the monitoring
board (0.9.0); the new thing is the onboarding event + the discovery/audit surface.

## Slice 1 - a new customer signs (the onboarding event)

A new customer arrives mid-week as an event (like the reply-all storm is an event): a small business
just signed, and the MSP has taken them on undocumented. The customer + a rough estate stand up, but
UNKNOWN - you have not audited it yet, and the runbook is thin or wrong (the round-1 "documentation is
the single most cited MSP pain" made real).

## Slice 2 - the discovery / audit

A discovery verb/surface that AUDITS the new customer's estate: enumerate the machines, the services,
the state - the real onboarding scan (the round-2 tooling research's estate-discovery step). It reads
the estate (0.7.0 machinery), so nothing is invented; it is the map you did not have. Deterministic.

## Slice 3 - the horror discovery

The audit surfaces the thing nobody wrote down and nobody was watching: the classic is a backup that
has been CONFIGURED and has been FAILING silently - the job "succeeds" but restores nothing, or has
not run in months. The board (0.9.0) or the audit shows it once you look. The beat is real and the
research-cited horror (an MSP that skipped discovery ate an incident + a lost contract). The player's
move is to RAISE it (escalate/notify), not paper over it - onboarding done honestly. Truthful, no
invented failure the estate does not hold.

## Gates (once, at the version)

Goldens move (the new customer + estate + the event); argued. Journeys through the REAL path: the
onboarding event fires; the discovery audit enumerates the new customer's real estate; the horror
(the silently-failing backup) is surfaced by the audit/board and is a REAL state on the estate, not a
string; raising it is the honest resolution. Existing employers + 0.8-0.12 customers BYTE-IDENTICAL
until the event fires. Determinism. One codex (overseer by hand if down), one box (workers=1 serial,
box degraded) + msp.spec extended for the onboarding/discovery path.

## Not in scope (backlog)

Mac creative + dental verticals (need os=mac); a full CAB; the deferred E6 sysadmin / E7 cloud tiers.

# Version 0.14.0 - the dental clinic vertical (E5, MSP arc, #32)

More curriculum breadth: a managed dental clinic, the hands-on Windows vertical the research details
(Dentrix/Eaglesoft/Open Dental + imaging). Distinct from the existing monitoring-only NORTHWIND-CLINIC
- this one is a MANAGED contract (helpdesk or fully-managed) with real, chair-side, time-pressured
tickets. Pure content on the proven customer/scope/ticket rails (no new mechanic; no os=mac - a dental
clinic is Windows-locked-down). Research base: the dental vertical in docs/design/msp-arc.md (X-ray
sensor not detected; imaging-bridge-to-PMS break; backup verification; HIPAA audit-log).

## Slice 1 - the clinic customer + estate

A new managed dental clinic customer (helpdesk or fully_managed - pick the one that lets the hands-on
tickets be in scope): Windows workstations at the chairs + reception, a practice-management/imaging
server, locked down. Real practice-management + imaging vocabulary (a Dentrix/Eaglesoft/Open Dental
-class PMS; a Dexis/Schick-class imaging bridge). Estate reuses the 0.7.0 machinery.

## Slice 2 - the hands-on tickets, real + time-pressured

The characteristic dental tickets from the research, each solvable via its real fix path:
- X-RAY SENSOR "not detected" - the single most common chair-side ticket; the real triage is
  reseat/swap the USB interface (a hands-on hardware-ish fix, chair-side, tight SLA because a patient
  is in the chair).
- IMAGING-BRIDGE-TO-PMS break after a Windows/PMS update - images stop writing to the patient chart;
  an integration fix (escalation-flavoured).
- A HIPAA audit-log / access review request - who opened a chart, a compliance-adjacent ticket.
The chair-side reliability = a tighter SLA than an office ticket (ties to the 0.12.0 tier clock).

## Slice 3 - correct scope + fidelity

Each ticket carries its true scope + severity (the chair-side ones tight); real product names; true
KB. The imaging-bridge one is the escalation/integration boundary; the sensor one is hands-on
helpdesk. Reuse existing verbs.

## Gates (once, at the version)

Goldens move (new customer + estate + tickets); argued. Journeys through the REAL path: the clinic's
tickets are solvable via their intended fixes; the chair-side sensor ticket runs on a tight clock; the
imaging-bridge ticket escalates the integration way; existing employers + 0.8-0.13 customers
BYTE-IDENTICAL. One codex (if it ever completes a review; else overseer self-review), one box
(workers=2, box rebooted + healthy) + msp.spec extended for the clinic.

## Not in scope (backlog)

Mac creative vertical (needs os=mac); a full CAB; the deferred E6 sysadmin / E7 cloud tiers.

# Version 0.15.0 - E6 opens: the promotion, ssh, the unix terminal (E6 #7)

The north-star epic opens - the biggest single version yet. The player is PROMOTED out of the
service desk into a Linux systems engineer, ssh's to a Linux server, and fixes it in a real unix
terminal. Everything built converges (docs/design/e6-sysadmin.md): the 0.7.0 Linux servers + their
seeded systemd units become manageable; the 0.7.0 "Windows tools don't reach Linux" wall is
RESOLVED; the 0.8.0 PAM scope-tier is the boundary the promotion crosses. This version ships the
SPINE; the full command surface, on-call, change control, incidents, and the player Linux desktop
are the backlog. Fidelity reference: the Ubuntu 24.04 command-surface research (cited real output) -
families differ in OUTPUT SHAPE, not spelling; a refusal teaches, a fake teaches something wrong.

## Slice 1 - THE PROMOTION (SD -> Systems Engineer, earned)

The player's first real PROMOTION (0.6.0 was a lateral switch; this is UP). Earned off MSP career
progression - a reputation/tenure threshold or an offer-style beat like the 0.6.0 switch, reusing
that machinery. It crosses the PAM tier boundary (the SAME model 0.8.0 scope uses): Tier 2
(workstation/helpdesk) -> Tier 1 (server/sysadmin), ONE-WAY and DIRECTIONAL - the player keeps
service-desk access, GAINS server access, permanently. It grants the sysadmin capabilities (ssh, the
unix terminal, the Linux estate). The weight is dramatised: you can now stop a service ten thousand
people depend on. New title/tier state on the player; reuse the career/title + the 0.8.0 tier model.

## Slice 2 - ssh + the unix terminal (the biggest new build)

The player stays on their Windows desktop and ssh's OUT to a Linux server (a 0.7.0 Linux box).
- **ssh** as its own mechanic, not a reskinned RDP: `ssh user@host` -> a trust-on-first-use
  FINGERPRINT prompt (`ED25519 key fingerprint SHA256:...`, accept -> appended to known_hosts;
  a later changed key is a scary refusal, not a fresh prompt). Key auth; `sudo` prompts the player's
  OWN password (not a target password), governed by /etc/sudoers.
- **The unix terminal**: an ssh session into a linux box switches the terminal to the UNIX DIALECT
  (the box's os=linux decides it - the dialect-is-data seam the 0.7.0 spike named). A CORE command
  set at fidelity, each READING the estate the box already holds (the seeded systemd units):
  `systemctl status <unit>` (the richer ●-dot block: Loaded/Active/Main PID/CGroup/log-tail in one
  call, vs sc's flat STATE line), `systemctl restart/start/stop <unit>` (SILENT on success - exit 0,
  NEVER a fabricated confirmation line), `journalctl -u <unit>` (timestamped journal lines),
  `ls -la` (mode/owner/group/size/mtime vs dir), `cd` bare -> HOME (the quirk vs Windows cd printing
  cwd), `df -h` (Mounted on, no drive letters), `ps aux` (USER/PID/%CPU/STAT vs tasklist), `ip a`
  (CIDR /24, no subnet-mask line vs ipconfig). Real output shape, cited at build time. Reuse the
  existing terminal engine (COMMANDS registry / cmd-parse / cmd-run structure) with a unix dialect.

## Slice 3 - the first Linux fix (the payoff)

A service down on a Linux server (a seeded systemd unit in a `failed`/`inactive` state - a real node
state, not a string). The now-promoted player ssh's in, `systemctl status <unit>` shows it failed,
`journalctl -u <unit>` shows why, `systemctl restart <unit>` brings it back (the unit node flips to
`active (running)`), and the thing it served is up. The 0.7.0 wall finally down: the box a helpdesk
player was refused is now yours to fix. A real ticket/incident wraps it.

## Gates (once, at the version)

Goldens move (the promotion state + the ssh/unix additions + the seeded-failed unit); argued. The
UNIX FIDELITY has teeth: the command output shapes match the cited real Ubuntu output; a Linux
`systemctl restart` is silent on success (a fabricated confirmation line fails a gate); the family
differs in shape from Windows (ls -la != dir). Journeys through the REAL path: earn the promotion ->
the tier unlocks (a server action refused BEFORE is allowed AFTER); ssh to a Linux box (fingerprint
-> known_hosts); the unix commands read the seeded units; the downed service is diagnosed (status +
journalctl) and fixed (restart -> node flips to running). Pre-promotion the player still cannot reach
a server (the 0.8.0/0.7.0 walls intact until promoted). Existing employers + the MSP customers +
probation/Bodgeworth BYTE-IDENTICAL until the promotion fires. Determinism (no Math.random - ssh
fingerprints, any seeded values off id/tick). One codex (if it completes a review; else overseer
self-review), one box (workers=1 on fresh workers, box degrades per-run) + an e2e walking the
promotion -> ssh -> unix-fix on the shipped shell.

## Not in scope (backlog, e6-sysadmin.md)

The full unix command surface (network ss/ip/dig depth, du, apt/patching, users/perms, the
not-installed traceroute/net-tools/htop gags, sudo -i vs -s); on-call off the board; change control /
maintenance windows / break-glass; the characteristic incidents (disk-full, cert-expiry,
failed-deploy) + the postmortem; the player's own Linux DESKTOP skin; bastion/ProxyJump depth; tmux.
