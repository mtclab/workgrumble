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
