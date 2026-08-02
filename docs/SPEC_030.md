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
