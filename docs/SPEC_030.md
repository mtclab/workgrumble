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
