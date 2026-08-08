# Thread C: projects as a game mechanic + engine fit

Research + analysis, 2026-08-08. Read-only pass over `/home/kasm-user/repot/workgrumble` at v0.27.0, plus web research.

Every claim about the repo below is a FACT read off the code at the file:line given. Web claims are labelled FACT (published/cited) or FOLKLORE (widely-repeated practitioner lore, no hard source - still usable as game material, just not as a design justification).

---

## 0. Recommendation up front

**Build projects as their OWN epic (call it E9), sequenced BEFORE E7 cloud, and make E7 a content pack that uses it.** Projects are a scheduling-and-commitment mechanic; cloud is a node-kind-and-verb pack. They are orthogonal, and the engine work for projects (phase state machine, cross-week carry, a planning surface) is bigger and riskier than the engine work for cloud (which the design docs correctly call "nearly free" - the declared-vs-actual graph diff is already how the engine works). Read E7's own scope in issue #8 and its research base at `docs/research/modern-stack.md:319-337`: every one of its five ranked additions is a single-session ticket. E7 as written contains no project.

Three shortest-path facts behind that call:

- **The multi-day machinery already exists inside a week and does not exist across one.** `serviceDeadline` already rolls a business-hours deadline over day boundaries; graph, tickets and clock survive `clockOff`; nothing survives `endWeek` except money, standing, title and tier, and each employer has exactly one authored five-day week. So a project of 2-4 days is cheap and a project of two weeks is a different epic.
- **The assertion language cannot count.** `resolved_when` is and/or/not/eq/exists/edge with equality-only matches. "40 of 60 mailboxes done" is not expressible; "nothing is left on the old thing" is, via `not(exists(...))`. Pick first content that only needs the second.
- **The tension mechanic is the one that is missing, not the phases.** Utilisation/timesheet is listed as "(designed)" in two design docs and built nowhere. Without it a project is a second queue; with it, an hour is genuinely contested. Every survey game that gets multi-day work right has some version of this, and every one that gets it wrong is a phase whose only content is elapsed time.

The strongest counterargument is at the end of section 7.4, and there is a tiebreaker question for the owner there.

Contents: 1-2 engine as-is · 3 what exists to build on · 4 gap list · 5 real-world project truth · 6 fun-mechanic survey · 7 E7 overlap and recommendation.

---

## 1. Engine as-is: how a ticket actually works

### 1.1 The three parts of a ticket

A ticket is DATA, validated at load, and it carries exactly three mechanical parts. The definition is `TicketDef`, parsed in `core-rs/src/tickets.rs:82-224` (TS mirror: `src/engine-api/types.ts:221`).

| Part | Mechanism name | Where |
| --- | --- | --- |
| Precondition | `setup: Vec<SetupMutation>` | `core-rs/src/tickets.rs:26-84` |
| Desired-state assertion | `resolved_when: Rc<Expr>` | `core-rs/src/tickets.rs:88`, grammar in `core-rs/src/assertions.rs:36-51` |
| Automatic grading | `World::check_ticket` -> `evaluate` -> `World::resolve_ticket` | `core-rs/src/world.rs:988`, `:999`, `:1032` |

**Precondition.** `SetupMutation` is a four-variant enum: `AddNode`, `SetField{id, field, value}`, `AddEdge`, `RemoveEdge` (`core-rs/src/tickets.rs:26-38`). These are applied when the ticket spawns. The fault IS the setup - the design rule is that a ticket's fault exists in the world whether or not anybody was watching (see the comment at `src/world/tickets/arc.ts:44-51`, which sets `power_losses: 1` explicitly rather than letting a clock produce it).

**Desired-state assertion.** `Expr` (`core-rs/src/assertions.rs:36-51`, TS `src/engine-api/types.ts:201-211`) is a six-variant serializable expression tree:

```
And(Vec<Expr>) | Or(Vec<Expr>) | Not(Box<Expr>)
Eq { selector, field, value }
Exists { kind, where_matches: Vec<FieldMatch> }
Edge { from: Selector, to: Selector, kind }
```

`Selector` is either `Id(String)` or `Kind{kind, where_matches}`. `FieldMatch` is `{field, value}` - **equality only**. The tree is **total by construction**: a malformed expression evaluates to `false`, never an error and never a panic, because content is data and a typo in a ticket file must not take the simulation down (`core-rs/src/assertions.rs:1-8`). Depth is bounded at `MAX_DEPTH = 64`.

**Automatic grading.** `check_all_tickets` (`core-rs/src/world.rs:981`) walks every unresolved ticket in sorted id order and calls `check_ticket`, which:
1. skips resolved or `updating` records,
2. clones `record.def.resolved_when` and calls `evaluate(&self.graph, &rule)` (`core-rs/src/world.rs:999-1002`),
3. on true -> `resolve_ticket`: sets `state = "resolved"`, stamps `resolved_at = clock.now()`, pushes `EngineEvent::TicketResolved` (`core-rs/src/world.rs:1032-1045`),
4. on false -> reads the ticket node's `sla_deadline` field and, if `clock.now() >= deadline` and the ticket is not `waiting`, calls `breach_ticket`: `state = "breached"`, `breached = true`, `breached_at = now`, `EngineEvent::TicketBreached` (`core-rs/src/world.rs:1052-1064`).

The `updating` flag (`TicketRecord.updating`, `core-rs/src/tickets.rs:243`) exists so that the engine writing the ticket's own bookkeeping fields does not re-enter the check that caused the write.

**Graph match is the whole grading model.** There is no per-ticket code, no scoring rubric, no partial credit. Resolution is a boolean over the graph, re-evaluated on every mutation, which is what makes multi-path solutions free: GUI button and terminal command both dispatch the same registry action, both mutate the graph, and the assertion does not care which. (`docs/DESIGN_POC.md:70-71`.)

### 1.2 The asymmetry that matters most for projects

The **action/guard** language is far richer than the **assertion** language, and they are separate grammars.

`PredData` (`src/engine-api/types.ts:333-431`) - the predicate language used by action guards and conditional ops - has, among ~25 variants:

- `field_at_least` / `field_at_most` (`:341-342`) - numeric thresholds
- `field_at_least_field` - one field against another read off the graph
- `neighbor_where { node, direction, edge_kind?, matching, bind? }` (`:388-401`) - quantified traversal with a binding
- `line_in_field` and `line_count_at_least { node, field, value, times }` (`:402-419`) - counting entries in a newline-separated field, explicitly built as a BUDGET mechanic
- `tick_of_day_at_most { day_ticks, value }` (`:387`) - clock-shape predicates
- `assert { expr: Expr }` (`:427`) - a one-way bridge that lets a guard use an assertion
- `not` / `all` / `any` (`:429-431`)

`OpData` (`src/engine-api/types.ts:443-457`) includes `when { cond: PredData, ops: OpData[] }`, `set_waiting`, `set_sla_clock`, `remove_node`.

So the engine **already knows how to count, threshold, traverse and quantify** - just not inside a `resolved_when`. `pred: 'assert'` bridges Expr INTO PredData; nothing bridges PredData into Expr.

**Consequence for projects.** A phase gate like "40 of 60 mailboxes migrated" is **not expressible today**. A gate like "no machine is still on Windows 10" IS expressible, as universal-quantification-by-negation:

```
{ op: 'not', expr: { op: 'exists', kind: 'machine', where: [{ field: 'os', value: 'win10' }] } }
```

That trick is worth naming, because it is exactly the shape of a migration completion gate and it costs zero engine work. What it cannot do is partial progress, which is the thing a phased project needs a UI for.

### 1.3 Everything else a ticket carries

`TicketDef` also validates: `archetype` (closed set of 5, `core-rs/src/schema.rs:72-78`: `hidden_cause`, `read_the_screen`, `deadline_absurdity`, `recurring_arc`, `flood`), `flavor{title, body, preChew?}`, `reporter`, `sla_ticks`, `sla_tier` (`bronze|silver|gold`, or `None` for in-house), `vip: bool`, `reward{reputation}` (money was deleted - nothing read it), `kb_ref`. Node kinds are a closed set of 15 (`core-rs/src/schema.rs:15-58`); edge kinds a closed set of 6 (`:59-68`); ticket states a closed set of 4: `open`, `resolved`, `breached`, `waiting_on_user` (`:70`).

Mutation happens ONLY through the action registry (`core-rs/src/actions.rs`, `core-rs/src/ops.rs` - 2420 lines of op/guard interpretation). ~200 action ids across 8 families in `src/world/actions/ids.ts` (`HELPDESK_`, `DAY_`, `WORLD_`, `SOFTWARE_`, `REQUEST_`, `SYSTEMD_`, `CHANGE_`, `INCIDENT_`). Tier gating is `engine.setTier(n)` / `engine.tier()` (`src/engine-api/engine-api.ts:38-39`), and app-level gating is `AppDef.tier_required: number` (`src/shell/apps/types.ts:160`).

---

## 2. Engine as-is: the week/day machinery

### 2.1 Time

`src/world/hours.ts` is the calendar and nothing else knows about tickets or the player.

- A tick is one simulated minute; **tick 0 is 08:00 on day one** (`hours.ts:16-23`).
- `MINUTES_PER_DAY = 1440`, `DAY_OPENS_MINUTE = 480` (08:00, the morning brief hour), `SHIFT_START_MINUTE = 540`, `SHIFT_END_MINUTE = 1020`, lunch 12:00-12:30, `SHIFT_MINUTES = 480` (`hours.ts:16-33`).
- `dayForTick`, `dayOpensTick`, `shiftWindow`, `lunchWindow`, `tickAtMinute`.
- **`serviceDeadline(from, minutes)` (`hours.ts:216-233`) already computes a business-hours deadline that rolls across day boundaries**: it converts to service minutes, divides by `SHIFT_MINUTES` to get whole days, and adds `days * MINUTES_PER_DAY`. A 3-day SLA is arithmetic that already works today.
- `serviceMinutesBetween` / `countsAgainstSla` - only shift minutes count.

**This is the single most important existing asset for projects: a correct, tested, multi-day business-hours clock.**

### 2.2 The day

`src/world/day.ts`: `DAY_STATES = ['morning_brief', 'shift', 'day_end']`, stored as `day_state` on the player node so it survives a save and is replayed rather than re-derived from a wall clock (`day.ts:1-15, :56`). `dayLedger` scores the day.

### 2.3 The week as a table

`src/world/week.ts` (2235 lines). `WEEK_DAYS = 5`; `REVIEW_DAY = WEEK_DAYS`; `REVIEW_MINUTE = 15*60` (`week.ts:71-75`). Saturday does not exist - "that is the joke and the scope".

`DayScript` (`week.ts:492-601`) is the per-day content table, and it is already a rich scheduling record:

| Column | What it schedules |
| --- | --- |
| `inherited: string[]` | tickets in the queue at 08:00 - **at most two, enforced** |
| `drip: DripSlot[]` | tickets arriving mid-shift, with a minute each |
| `incidents?` | world changes that happen whether or not anybody is watching |
| `dms?`, `channels?`, `requests?` | direct messages, Hubbub room posts, one-question-in-three-places |
| `interruptions?`, `walkUps?`, `noHello?` | screen takeovers, desk visits with a favour attached, typing-indicator beats |
| `afterHours?`, `onCall?` | overnight pings and pager fires - properties of the day BOUNDARY, read on the next morning's brief |
| `onboarding?` | a customer that signs mid-shift |
| `patrolSeed` | seeds the lead's rounds |
| `load: 1..4` | how heavy the day is MEANT to be - the ramp, written down |

`validateWeek()` is a boot-time loader that enforces the pacing rules structurally: morning pile <= 2 ("a queue of four before nine o'clock is not a working day, it is a punishment for logging on"), every ticket arrives exactly once, drips inside working hours, after-hours/on-call not authored on the last day (nowhere to read them), channel rooms must belong to the employer, a linked request must have exactly one Hubbub copy carrying its id (`week.ts:1-27`, `:1304-1480`).

Four employers, each with exactly ONE five-day week: `WEEK` (probation, `week.ts`), `SECOND_WEEK` (Bodgeworth, `second-week.ts`), `MSP_WEEK` (`msp-week.ts`), `CORPORATE_WEEK` (`corporate-week.ts`), registered in `src/world/employers.ts:163, :203, :234, :264`.

### 2.4 The driver, and what survives a boundary

`src/shell/day-driver.ts` (~5100 lines) is the one place real time turns into simulation time; speed and pause live here, not in the engine, because that is what makes a day replayable (`day-driver.ts:1-13`).

**Day boundary (`clockOff`, `day-driver.ts:2354-2410`):**
1. score and bank the day's slip, `recordWeekReading()`, dispatch `DAY_ACTIONS.clockOff`
2. `engine.advanceOffHours(morning - now)` - **the night in one call**. Legal only while the service clock is held; with the clock held no deadline can be crossed, so no ticket can breach, resolve or spawn during the jump (`src/engine-api/engine-api.ts:41-61`). Every open deadline moves out by 900 minutes.
3. load day+1's schedule, patrol, interruptions; spawn any arrivals crossed
4. `settleOnCallMisses(day-1)`, `raiseOnCallPages(day)`
5. `engine.checkpoint()` - the dispatch log restarts each morning

**The graph, the tickets, the meters and the clock all survive the day boundary.** Unresolved tickets carry into tomorrow with their deadlines pushed out; `src/shell/scripted-week.test.ts:698` asserts a week ending with "twenty-two still open". Multi-day ticket life is not hypothetical - it is the shipped behaviour.

**Week boundary (`endWeek`, `day-driver.ts:2422-2432`) is a hard reset.** It records the review outcome and hands off to the career layer. The next week is a NEW world, seeded from scratch:
- `WeekCarry { farmFund, attempt, arcWeek }` (`src/world/session.ts:60-80`)
- `CareerStanding { reputation, title, tier, trail }` (`src/world/career.ts:78-140`)
- `seedForAttempt(n)` = `WORLD_SEED + (n-1) * RETRY_SEED_STEP` (`session.ts:56`) - a retried week is the same week, not the same minutes

**Nothing else crosses a week boundary.** No graph node, no ticket, no open work.

Save: `SAVE_SCHEMA = 4` (`src/shell/save.ts:56`). The file is engine payload + app state + driver state, versioned, read strictly, applied all-or-nothing. Schema 4 added the employer identity because "a career spans more than one and the standing/title are in the engine payload but the employer's IDENTITY is not" (`save.ts:49-55`). A project would be the next thing in that category.

### 2.5 The career layer above the week

`src/world/pressure.ts`: "**A career is a table of weeks the same way a week is a table of days**" (`pressure.ts:34-38`). It holds a nine-entry catalogue of pressure seasons (client loss, downturn, new leadership, redundancy round, ...), of which one is implemented and eight carry `implemented: false` so the arc validator refuses to schedule them - "the difference between a catalogue and eight dead code paths". Pacing is enforced by the loader: nothing in the probation week, two quiet weeks before the first thing happens, one season per employer, never two live at once, two clear weeks after each resolves. Every beat obeys a **four-beat contract** - weather, notice, criteria, decision, in order, each inspectable, and `telegraph()` is the only way to obtain the type the decision function accepts.

That contract is the closest thing in the codebase to a phase state machine, and it is the right precedent to copy.

---

## 3. What already exists that a project would build on

Ordered by how much work each saves.

1. **Multi-day business-hours deadline arithmetic.** `serviceDeadline` (`hours.ts:216`) already spans days. A phase deadline three working days out is one call.
2. **Multi-day ticket persistence within a week.** Graph + tickets + clock survive `clockOff`; deadlines push out over the night; `advanceOffHours` makes the jump cheap.
3. **Per-ticket touch evidence.** `src/world/tickets/handoff.ts` builds "what I tried" from what the player DID to the ticket's nodes, recorded onto the ticket as they did it - `TriedEntry { tick, text, worked }`, with a per-verb `ACTION_SUMMARIES` table so an action id becomes a sentence. **Failed attempts are recorded too** ("which belong on the form too", `handoff.ts:22`). This is exactly the substrate a project status report needs, already built and already tested.
4. **Parent/child ticket relations, content-driven, engine untouched.** `src/world/tickets/parent.ts`: `closesWithParent(ticketId, own)` wraps a child's rule in `or(own, eq(child, parent_resolved, true))`. The link action refuses any ticket whose rule lacks that branch, using the engine's `resolution_refuses_field` guard. So "can this be closed by closing that" is answered by the ticket itself, and a ticket nobody authored as a duplicate can never be bulk-closed by a player who has fixed nothing. **A project's child tickets are the same pattern with the arrow reversed** (parent closes when children do, rather than children closing when the parent does) - and that reversal is NOT free, see gap 3.
5. **A first-class, clock-derived, windowed authorisation artifact.** `src/world/change-request.ts` (0.10.0): `change_request` is a node kind (`core-rs/src/schema.rs:33-40`) carrying scope, risk, rollback, target verb; the approval decision is **baked at file time** from what the contract allows (not RNG, not an instant yes), the review delay and the maintenance window are **seeded off the request id**, and the live status - under review / approved-but-not-in-window / open / closed / rejected - is **derived from those baked ticks against the clock** rather than stored. A save mid-review reloads to the same minute the paperwork was always going to clear on. This is a working, deterministic, save-safe, multi-hour state machine. **A project phase is the same shape at a longer scale.**
6. **`change-control.ts`** (E6 0.18.0): normal / standard / break-glass classification of a change - the real ITIL vocabulary, as a pure function. Projects inherit change windows for free.
7. **`coordination.ts`** (0.11.0): the co-managed notify-then-act notice, another first-class node filed against a target.
8. **A runtime world-injection seam.** `engine.applySetup(ops)` is called at runtime by the driver for dripped tickets, filed change requests and mid-shift onboardings (`day-driver.ts:1361, :1379, :1784, :1921, :1952`). `src/world/onboarding.ts` (0.13.0) is the closest existing thing to a project kickoff: a customer SIGNS mid-shift, its estate stands up UNKNOWN and undocumented, the ops are applied at runtime, and it is **idempotent by the customer node** so a replay or reload cannot stand the same client up twice.
9. **Two SLA clocks, and pause semantics.** `src/world/sla.ts`: a response clock that stops on first touch, and a resolution clock that IS the engine's `sla_deadline` field, pushed out minute by minute while parked - so "on hold pauses the resolution clock ONLY" is true by construction rather than by two pieces of code agreeing. `HOLD_REASONS = awaiting_user | awaiting_vendor`. Tier x priority targets via `tierTargetsFor`.
10. **`recurring_arc` as a two-day narrative.** `src/world/tickets/arc.ts` - the cleaner unplugs the warehouse printer on Tuesday and Thursday at 16:56; Tuesday closes on power alone, Thursday does not, because the Event Viewer has both losses four lines apart and the real fix is a note by the socket. Note what this is: **two independent tickets with authored coupling**, not one long-lived entity. It proves the appetite and proves the content pattern; it does not prove the engine can hold a project.
11. **A tier-gated app plugin contract.** `AppDef { id, title, icon, tier_required, slack, desktop?, mount }` (`src/shell/apps/types.ts:156-170`), iterated from `APP_MANIFEST`. `src/shell/apps/monitor.ts` is precedent for a board-style read-mostly surface. A Projects app is a manifest entry.
12. **A whole family of clock-driven delayed-consequence settlers.** The driver's per-minute step calls, in order, `settleOnCall`, `settleStaleAuth`, `settleLegendaryRevert`, `settleFollowUps`, `settleRecertFollowUp`, `settleOverrideFallout`, `settleQueueJumpFallout` (`day-driver.ts:2250-2267`), plus `settleSecurityFallout` at the START of the next shift, deliberately: "yesterday's shortcut, arriving in this morning's post ... a day is how long it takes somebody else to notice, and a consequence that landed in the same evening would read as a punishment for the click rather than as the cost of the omission" (`day-driver.ts:2333-2337`). `src/world/fallout.ts` calls these "two things the world keeps doing after you have stopped looking at it", and both are pure reads answering "what is due right now" so a replay lands on the same numbers. **This is precisely the machinery a project needs to generate tickets because of its own half-done state** - and the design instinct about consequence latency is already correct and already written down.
13. **An outcome-asserting solvability gate.** `src/world/tickets/solvability.test.ts`: for every ticket and every advertised path, the ticket spawns OPEN, every step is driven through the shipped registry against the shipped world, every step but the last leaves it open, the last closes it, **and every step is left out once from a fresh world and the ticket must not close without it**. That last clause was added because a path of `[irrelevant mutation, the actual fix]` used to pass. This is the gate a project mechanic must extend, and extending it is not trivial (see gap 8).

---

## 4. Gap list: what is genuinely missing

Ranked by cost, cheapest first.

**G1. No `project` / `phase` / `milestone` node kind.** `NODE_KINDS` is a closed array of 15 (`core-rs/src/schema.rs:15`). Adding kinds is routine (customer, change_request, coordination and unit were each added this way), but it is a core-rs change plus schema validation plus a save-schema consideration. Cost: small, well-trodden.

**G2. No project-shaped ticket archetype.** `TICKET_ARCHETYPES` is a closed array of 5 (`core-rs/src/schema.rs:72`). Cost: trivial, but only if a project IS a ticket - which it should not be, see G3.

**G3. No phase state machine.** `TICKET_STATES` is `open | resolved | breached | waiting_on_user`. A project needs an ordered sequence with gates: `scoping -> approved -> in_flight(phase n) -> cutover -> handover -> closed`, plus `blocked_on_customer`, `blocked_on_vendor`, `descoped`, `rolled_back`. The change-request status derivation (baked ticks + clock -> live status, never stored) and the pressure four-beat contract (`telegraph()` as the only constructor of the type the decision accepts) are the two patterns to copy. Cost: medium. This is the actual heart of the epic.

Note the direction problem in reusing `parent.ts`: today a CHILD closes when the parent resolves (`closesWithParent` adds an `or` branch to the child's rule). A project needs the opposite - the parent phase advances when its children resolve. `Expr` can express "all these tickets are resolved" as `and(eq(t1, state, resolved), eq(t2, state, resolved), ...)` by enumeration, which works for a fixed authored set. It cannot express "all children of this project", because there is no quantified traversal in `Expr`.

**G4. The assertion language cannot count or quantify.** Detailed in section 1.2. Three options, in ascending cost:
  - (a) **Counter field + terminal `eq`.** A project node carries `mailboxes_migrated`; an op increments it; the phase gate is `eq(project, mailboxes_migrated, 60)`. Works today, zero engine change, but the number is authored twice (the count and the target) and there is no "at least".
  - (b) **Universal-by-negation.** `not(exists(kind, where: [{field, value}]))` = "nothing is left in the bad state". Works today, zero engine change, and is genuinely the right shape for migration completion. Limited to equality on one field.
  - (c) **Lift a PredData subset into `Expr`** - `at_least`, `at_most`, `count_of{kind, where} >= n`, `all_matching`. The predicates already exist and are already tested in `ops.rs`; the work is grammar, parser, TS type, parity harness and the totality guarantee (a malformed count must be `false`, not a panic). Cost: medium, and it makes progress bars honest.

**G5. Nothing crosses a week boundary except money, standing, title and tier.** `endWeek` rebuilds the world from `WeekCarry` + `CareerStanding`. A project longer than five days has nowhere to live. Worse: **each employer has exactly one authored five-day week** (`employers.ts:163-264`), so multi-week play today means replaying the same five days under different pressure weather. There are literally no week-2 days for a two-week project to occupy.

  This is the biggest structural gap and it forces a design fork:
  - **Fork A - projects fit inside one week.** A project is 2-4 days of a five-day week. No carry problem, no new content weeks. The cost is that the fiction shrinks: real MSP projects are weeks-to-months (section 5).
  - **Fork B - projects carry across weeks.** Requires a project-state carry in `WeekCarry`, a re-seed path that stands the in-flight project's world back up (the `onboarding.ts` idempotent-setup pattern generalised), a save-schema bump, and week-2+ content per employer. This is a large epic on its own.

  Recommendation: **Fork A first, with the carry designed but not built.** Ship a 3-day project inside week one, prove the phase machine and the interruption tension, and only then decide whether the fiction needs weeks. This matches the repo's own habit (the pressure catalogue's eight `implemented: false` entries).

**G6. No long-horizon deadline UI.** The Tickets app shows per-ticket SLA countdowns. `DayScript.load` is the only forward-looking planning artifact and it is content-side, invisible to the player. Nothing in the shell shows "Wednesday 14:00" against "it is now Monday 11:20". A project needs a plan surface where a date three days out is legible and where slipping is visible before it is fatal. Cost: medium-large, and it is the one that decides whether the mechanic is fun (section 5.3).

**G7. No project app surface.** The plugin contract exists and gating exists, so this is content-shaped work rather than architecture: an `AppDef` with `tier_required` set to the engineer tier, a board, and a detail pane. Precedent: `monitor.ts`, `tickets.ts`. Cost: medium, mostly UI.

**G8. No time-allocation verb, and no utilisation pressure.** Every verb today is "do this now". A project needs "commit this afternoon to the migration", which only bites if there is a cost to the time. The **timesheet/utilisation mechanic is DESIGNED but not built** - both `docs/design/estate-and-customers.md:66` and `docs/design/msp-arc.md:29,:95` list it as "(designed)" and it appears nowhere in `src/`. Projects without it are a second queue; projects with it are a genuine allocation dilemma. Cost: medium, and it is a dependency, not a nice-to-have.

**G9. The solvability gate does not generalise for free.** Today's gate proves every ticket's assertion is reachable from its setup via registered actions, with every step load-bearing. For a project the equivalent property is strictly harder: **every phase gate must be reachable AND reachable within the working minutes the phase is allowed**. That is a scheduling feasibility check, not just graph reachability - and it has to account for interruptions, which are the whole point of the mechanic. Getting this wrong ships an unwinnable project, which is the single worst failure this product has (`solvability.test.ts:4-11`). Cost: medium-large, and it must be scoped INTO the epic, not after it.

**G10. `WEEK_DAYS = 5` and `REVIEW_DAY = WEEK_DAYS` are hardcoded** (`week.ts:71-75`), as is the assumption that Friday is about the review. A longer week is not a constant change.

---

## 5. Real-world project truth

Sourcing note: Reddit (r/msp, r/sysadmin) and Spiceworks were unreachable from this environment - blocked at the fetch layer, 403 on the JSON API, captcha/proof-of-work on every mirror and fallback engine tried. **No r/msp or r/sysadmin quotes appear below and none were invented.** The substitutes are MSP operator/consultancy blogs, vendor PSA documentation, Hacker News (via the Algolia API), and the peer-reviewed literature. FACT = documented/cited. FOLKLORE = widely-recognised practitioner lore with no traceable source.

### 5.1 The ticket/project split, and the PSA data model

**FACT. ConnectWise coined the industry name for the failure mode: the "projicket"** - "a portmanteau blending 'project' and 'ticket'", i.e. cramming multi-day, multi-dependency work into one service ticket. Their stated criteria: a TICKET is work that cannot be meaningfully broken into smaller tasks, whose tasks are independent or minimally dependent; a PROJECT is complex work with multiple INTERDEPENDENT tasks requiring several days or longer. Duration ceiling: a service ticket should not exceed ~30 days generally, and **"at an MSP, the max is around two weeks"**. Task granularity floor ~1 hour. The money quote: *"All these details are piled into one object. There's no way to sift through that before your project is off the rails, over budget."* ([ConnectWise marketplace blog](https://marketplace.connectwise.com/blogs/projickets-identifying-when-a-ticket-should-be-a-project))

**FACT. Autotask's one-liner is the cleanest framing in the corpus:** *"Projects are proactive and planned. Tickets are often created in response to a customer issue."* ([Datto PSA docs](https://psa.datto.com/help/Content/3_Features/8_Projects/Intro/PROJECTSMAIN.htm))

**FOLKLORE.** The shop rules engineers actually quote: "if it needs a quote, it's a project"; "if it needs hardware bought, it's a project"; "if it needs a maintenance window, it's a project". The honest finding is that **there is no universal hour threshold** - the real discriminators are dependencies, procurement, approval and a scheduled outage window. For a game, that ambiguity IS the comedy.

**FACT. The data-model nouns, verbatim and usable:**

| PSA | Structure |
| --- | --- |
| ConnectWise PSA (Manage) | `Project` -> `Phase` -> `Sub-phase` -> **`Project Ticket`** (a ticket living inside a phase, distinct from a service ticket) -> `Task`. Plus `Work Plan`, `Work Plan Template`, `Key Milestone` (any phase or ticket can be flagged), `Budget Hours` vs `Actual Hours`, `Project Board`, `% Complete`, task `Predecessors` ([docs](https://docs.connectwise.com/ConnectWise_Documentation/050/010/010/020)) |
| Autotask / Datto PSA | Types: `Proposal Project`, `Client Project`, `Template Project`, `Internal`. `Project` -> `Phase` -> `Task`, plus `Milestone` as an explicitly **billing** construct (bill a portion on completion of the survey), `Project Charge`, `Issue`, `Time Entry`. Lifecycle: proposal -> CRM `Opportunity` -> `Quote` -> win -> convert to Client Project -> execute -> milestone billing ([docs](https://psa.datto.com/help/Content/3_Features/8_Projects/Intro/ATProjectsWorkflow.htm)) |
| HaloPSA | **Projects are literally tickets.** A `Project` is a ticket TYPE with `Project Task` child tickets and `Milestones` carrying sequence number, dates and dependencies. The dependency rule is hard-coded and directly gameable: *"Tasks in milestone 2 will be locked until milestone 1 is marked as completed."* ([guide](https://usehalo.com/halopsa/guides/2032/)) |

**HaloPSA's model is the one that fits workgrumble's engine almost exactly** - a project is a ticket type, phases lock downstream tickets, milestones complete when all their tasks close. That maps onto the existing `parent.ts` machinery with the arrow reversed (gap G3).

**FACT, and it is an ugly truth worth stealing.** None of the big PSAs has a first-class change-order object for projects. The documented Autotask workaround is a hack MSPs really use: *"create a Project Phase called 'Change Order - ABC', create the Tasks needed under that Phase, and then set the Work Type for those Tasks to 'Hourly'"* ([Giant Rocketship](https://giantrocketship.com/blog/autotask-project-billing-the-easy-way)). A change order is a phase named after the fact that it should not exist.

**FACT. Internal IT swaps these nouns for governance ones:** `Project Intake Form`, `Business Case` (required above a size threshold), `Steering Committee`, `Request for Change (RFC)`, `Change Advisory Board (CAB)`, Standard/Normal/Emergency change, `Change Freeze` window. Workgrumble already has the change-classification half of this (`src/world/change-control.ts` - normal/standard/break-glass).

### 5.2 The project catalogue: what one actually is

Durations are FACT where a source states them.

| Project | Duration | Phases | The classic failure |
| --- | --- | --- | --- |
| Network/server refresh | 3-8 weeks (SMB) | discovery + site survey 1-2wk, design 1wk, **procurement 2-6wk**, install/commissioning 1-2wk, documentation 1wk, handover | *"The cheapest network refresh on paper is usually the one that skips the most phases."* Skip discovery -> gear in the wrong place; skip survey -> APs where signal does not reach; skip documentation -> the next change repeats discovery ([RIPEDA](https://ripeda.com/resources/insights/network-refresh-as-a-project/)) |
| Office move | 3-6 months planning | cabling weeks ahead, circuits, cutover weekend | **Fibre/ISP circuits take 60-90 days, up to 6 months with construction**; VoIP porting ~30 days minimum. Everything else is ready and the circuit is not ([PinPoint](https://pinpointtech.pro/blog/office-move-cabling-wifi-timeline/)) |
| M365 tenant-to-tenant | weeks to months | inventory -> pilot wave -> progressive waves -> cutover -> stabilisation | *"the costliest mistake ... is treating it as a mailbox job - teams moved mail cleanly but discovered OneDrive, Teams and sharing links were never planned, which turned a weekend into a month"*; *"Optimistic schedules ignore Microsoft throttling, so the weekend cutover may spill into Monday"* ([MS Advance](https://msadvance.com/en/microsoft-365-tenant-to-tenant-migration-complete-guide/), [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/migration/microsoft-365-tenant-to-tenant-migrations)) |
| Firewall/edge replacement | procurement months, **cutover ~2 hours** | procure -> configure (weeks of gap-filling) -> cable swap -> scream test | PDQ's engineer: the actual cutover was ~2 hours (40 minutes within the same vendor family), 1-2 minutes of user downtime, old firewall left racked. *"You'll miss stuff ... but you know pretty instantly if you broke the whole thing."* *"It's always an opportunity to kind of scream test some of the configurations."* Canon: migrate in order (routing, NAT, policies, VPNs); *"don't remove the old firewall from the rack until you've tested the new one"*; *"successful pings do not confirm application functionality"* ([PDQ](https://www.pdq.com/blog/inside-look-how-pdq-switched-firewalls/), [FireMon](https://www.firemon.com/blog/firewall-migration-checklist/)) |
| AD/domain migration (ADMT) | weeks | service accounts -> global groups -> user accounts with SID history | Service accounts that are actually user accounts with lost passwords; missing trusts; no test migration ([Varonis](https://www.varonis.com/blog/active-directory-migration-tool)) |
| VoIP cutover | ~30 days porting | LOA paperwork -> port -> cutover | **The pain is administrative, which is perfect parody material.** *"Mismatches between your LOA and carrier records are the leading cause of porting delays"*; *"A mismatched suite number can delay a port by weeks"*; *"One client's port was rejected because the authorized user was a former employee no longer at the company"* ([TeleCloud](https://telecloud.net/blog/port-phone-numbers-to-voip-provider-guide)) |
| Backup/DR implementation | weeks | discovery -> RPO/RTO targets -> implementation -> **validation (first restore test)** -> operate | The restore is never tested ([NOCdoc](https://nocdoc.com/2026/06/30/disaster-recovery-planning-msps/)) |
| Windows version rollout | weeks-months | Plan -> Prepare -> Deploy, via **deployment rings**: pilot -> early adopters -> departmental -> full | The app-compat long tail, and the one line-of-business app nobody owns ([TechTarget](https://www.techtarget.com/searchenterprisedesktop/tip/How-to-plan-a-Windows-11-upgrade-project)) |
| Cyber Essentials / MFA rollout | CE basic 1-3wk; **CE Plus 6-10wk**; SME engagement 2-5 billable days | phase by risk: admins, remote, execs first | Wonderfully on-theme: *"When responsibility is vague and exceptions are undocumented, rollouts either break workflows or exempt the riskiest access paths forever"* - the CEO gets the exemption and keeps it ([NetSec](https://netsecgroup.io/guides/cyber-essentials-timeline-guide-2025), [DataPath](https://www.mydatapath.com/blog/phishing-resistant-mfa-rollout-plan-microsoft-365/)) |

**The canonical phase chain, converging across every source: discovery/audit -> design -> procurement -> pilot -> cutover -> post-cutover stabilisation (48h) -> documentation/handover -> sign-off.** Documentation and handover are PHASES WITH BUDGET, which is exactly why they are the first thing dropped.

### 5.3 Who scopes, and the handoff that fails

**FACT.** Best practice is that a technical lead or pre-sales engineer is in the scoping conversation early, with a 30-60 minute sales/pre-sales/delivery walkthrough of the SOW before kickoff. The documented reality of that failing: *"the sales team sees a simple firewall deployment, [and] delivery might wonder why no one asked about a multi-site SD-WAN architecture"*; *"The delivery team may end up with an SOW that does not capture the whole discussion"* (notes scattered across email, Slack, CRM and memory); delivery discovers post-signature *"key dependencies that will add weeks to the schedule"*; *"Hidden tasks show up mid-project, triggering scope creep and change orders."* ([ScopeStack](https://scopestack.io/blog/sales-to-service-handoff-best-practices-for-msps-vars-and-it-service-teams))

**FACT (structural).** *"Forcing engineers to close deals is the most common structural mistake that MSP organizations make ... technicians should support discovery and scoping, not own quota."* ([Quantum Leap](https://www.thequantumleap.business/blog/msp-sales-team-structure-best-practices))

**FOLKLORE but universally recognised:** the chain is sales/account manager -> vCIO -> pre-sales engineer -> project coordinator -> the engineer who has to do it, and at shops under ~20 heads all five of those are the engineer.

**FACT. The go/no-go ritual:** agree success criteria BEFORE cutover, appoint **a single named decision-maker for the rollback call**, define rollback triggers, document the exact ORDER of rollback, then on the night follow the runbook exactly and monitor 48 hours against pre-cutover baselines.

### 5.4 The day split - the single most game-relevant finding

**FACT.** Industry billable-utilization targets are 75% for engineers/consultants and 85% for low-margin resources like cabling techs, with *"service executives aim for 75% billable ... and end up with yearly averages in the mid-60s."* And the specific distortion: *"One issue that can distort billable labor utilization percentages is situations where techs or engineers work on both project deliverables and support issues in the same work week."* ([Promys](https://promys.com/billable-labor-utilization-industry-averages-for-techs-engineers/))

**FACT (ops-engineering essay).** *"if someone is working on a project, and gets interrupted for 20 minutes, that is two context switches and probably a couple of hours of really productive work lost"*; *"People aren't machines, context switches are really expensive, and usually assumed to be free in process planning"*; *"when you're doing interrupts, your projects are a distraction"*. The prescription: *"Each day, try to do either projects or interrupts, not both."* ([log.andvari.net](https://log.andvari.net/pages/bad-machinery.html))

**FACT (Google SRE).** Google caps operational work at 50% of an SRE's time and requires at least the other 50% go to engineering project work, monitored, with excess ops load redirected back to product teams until it drops below 50% ([sre.google/sre-book/eliminating-toil](https://sre.google/sre-book/eliminating-toil/)).

**This is the mechanic the owner is describing, and it is real and citable at three levels: an MSP utilization target, a context-switch cost, and an SRE-enforced ratio. It is also gap G8.**

### 5.5 The pains, sourced

**Scope creep.** *"If you have ever finished a project and wondered where the profit went, scope creep is almost certainly the answer. It is a hundred small yeses that nobody tracked."* And the mechanism: *"A technician stays an extra hour to fix something that was not in the contract. A client sends a Slack message asking for 'just one more thing' and your engineer handles it because it feels faster than escalating. A migration that was scoped for a clean environment turns out to be anything but, and the team absorbs the extra work without anyone raising a flag."* Also: *"Projects blur into support, and support turns into unpaid projects."* ([Level.io](https://level.io/blog/msps-lose-profit)) The tell: *"If engineers are asking 'is this included?' mid-project, the scope was not defined well enough."* ([ProVal](https://www.provaltech.com/blog/top-5-mistakes-msps-make-in-it-project-rollouts-and-how-to-avoid-them/))

**The deadline set before the scoping.** HN, verbatim: *"Why does technical debt exist? Because requirements weren't properly clarified before work began. Because a salesperson promised an unrealistic deadline to a customer."* ([HN 46171289](https://news.ycombinator.com/item?id=46171289)) And the death-march variant: *"The exec in charge, known to us as The Hammer, had made big promises to poobahs higher up. So for no real-world reason, his employees worked death-march hours to have everything done by the arbitrarily chosen date."* ([HN 34019759](https://news.ycombinator.com/item?id=34019759))

**Status-report theatre - and it has a standard name: the WATERMELON.** *"A watermelon is green on the outside and red in the middle."* Why: *"Honesty has been made personally expensive"*; *"The moment red means punishment, we've handed everyone a reason to fudge the truth"*; *"Teams had been too frightened of the consequences to mark themselves Red."* What the meeting looks like: *"The dashboards say on track. The updates say all is good. The slides are a brilliant wall of green, full of positive words in nice fonts."* The endgame: *"Everything stayed refreshingly Green right up to the final quarter, when a collection of supposedly healthy projects came apart all at once."* ([Cultivated Management](https://www.cultivatedmanagement.com/watermelon-reporting/), [Intellect](https://www.intellectdesign.com/resources/blog/watermelon-status-reporting/), [Pragmatic Coders](https://www.pragmaticcoders.com/blog/everything-is-under-control-how-to-recognize-the-watermelon-effect-before-your-it-project-sinks)) The weekly status meeting itself is described in PM literature as *"a black hole that sucks time, energy and enthusiasm out of the project team"*, where decisions are deferred to next week's meeting ([projectmanagement.com](https://www.projectmanagement.com/articles/321441/killing-the-weekly-status-meeting)).

**The 90%-done project.** The named law is the **ninety-ninety rule** (Tom Cargill, Bell Labs): "the first 90 percent of the code accounts for the first 90 percent of the development time; the remaining 10 percent of the code accounts for the other 90 percent of the development time" - and it formally covers the "relatively done" state, where planned work is complete but unsignable-off pending one final activity that may not occur for a substantial time ([Wikipedia](https://en.wikipedia.org/wiki/Ninety-ninety_rule)). MSP-specific and quotable: *"that project you promised would be done last month but is still sitting at 85% complete"* and *"that engineer who just put in their notice after months of 60-hour weeks"* ([TopLeft](https://www.topleft.team/blog/msp-project-management-guide-finish-tickets-and-projects-on-time)).

**Why documentation dies.** *"When service desks are processing hundreds of tickets per day, asking technicians to also write up resolutions in IT Glue or Hudu means asking them to do two jobs at once, so documentation often falls behind, gets skipped, or gets done poorly."* Consequence: techs spend 20-30 minutes re-researching problems already solved ([Mizo](https://mizo.tech/blog/documentation-automation-it-glue-hudu-scaling-msp/)). Project closeout version: *"Teams move on immediately without formal sign-off, leaving pieced-together information for later troubleshooting."*

**Projects eaten by tickets.** *"Projects sit in the queue while reactive tickets take priority ... This is one of the biggest growth blockers for MSPs."* Plus the WIP-thrash pattern: *"They would start every project immediately to make clients happy, except nobody was happy because nothing was actually getting done"*; *"The constant context switching meant that all projects moved through the pipeline slowly."* Capacity rule worth stealing wholesale: *"If your Level 2 techs spend 60% of their time on tickets, don't schedule them for 40 hours of project work per week."* And: *"Running fifteen to 100+ projects at once is not a badge of honor, it is a profit killer."* ([TopLeft](https://www.topleft.team/blog/msp-project-management-guide-struggling-deadlines-and-how-to-fix-them))

**Change orders nobody raises.** *"In fixed price work, out of scope requests that are not handled through a change order process add cost without added funding."* The self-audit question is itself the indictment: look at last quarter's projects, which exceeded estimated hours by 20% or more, and did you issue a change order ([Level.io](https://level.io/blog/msps-lose-profit)). On fixed-price risk: *"If unforeseen technical issues arise, if a task takes longer than anticipated, or if our team needs to put in extra hours to meet the deadline, that is our problem, not the client's. We absorb the cost of those overruns."* ([Rewired MSP](https://rewiredmsp.com/blog/msp-showing-project-value-beyond-cost/)) And the design principle for a change-order mechanic, from HN: *"Not every change order has to have a cost, but every change in scope should go through the process. It should be just painful enough that your clients don't request random changes, but easy enough that they use it."* ([HN 92735](https://news.ycombinator.com/item?id=92735))

**Waiting on other people.** Procurement 2-6 weeks; ISP circuits 60-90 days to 6 months; a port rejected because a suite number was wrong or the LOA carried an ex-employee's name. On the unresponsive client: *"A stalled project is one that is still active but no longer moving: tasks sit in waiting states, the deadline holds, and no one says what's actually blocking it."* ([Your Leadership Map](https://www.yourleadershipmap.com/managers-compass/how-to-fix-stalled-project)) MSPs carry client-caused-delay clauses that almost nobody invokes.

**The rollback.** Doctrine is well documented and rarely followed: tested backups, defined triggers, a single named decision-maker, documented rollback ORDER, old kit left racked until validation. The recurring finding: *"Most migration problems can be traced back to something that was skipped, not something that was unknown."*

### 5.6 Statistics: what is safe to design against

| Claim | Status | Detail |
| --- | --- | --- |
| Large IT projects run **45% over budget, 7% over time, delivering 56% less value**; 17% go so badly they threaten the company's existence | **FACT** | McKinsey with the BT Centre for Major Programme Management, Univ. of Oxford, Oct 2012; n > 5,400 IT projects with initial budgets > $15M ([McKinsey](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/delivering-large-scale-it-projects-on-time-on-budget-and-on-value)) |
| **One in six IT projects is a "black swan"**: 200% average cost overrun, ~70% schedule overrun; 27% average overrun across all | **FACT** | Flyvbjerg & Budzier, Harvard Business Review 89(9), Sept 2011; n = 1,471 ([HBR](https://hbr.org/2011/09/why-your-it-project-may-be-riskier-than-you-think)) |
| Standish CHAOS 16% success / 53% challenged / 31% failed (1994), later ~29-35% | **The figures were published (FACT); what people take them to mean is FOLKLORE** | See next row |
| **Standish's methodology is unsound** | **FACT, peer-reviewed** | Eveleens & Verhoef, "The Rise and Fall of the Chaos Report Figures", IEEE Software Jan/Feb 2010, pp. 30-36. Four named problems: the definitions are "misleading" (success is defined SOLELY by estimation accuracy, not usefulness or satisfaction), "one-sided" (they ignore underruns), they "pervert the estimation practice" (steering on them rewards deliberate overestimation), and the figures are "meaningless" because they average numbers of unknown bias. Applied to 5,457 forecasts of 1,211 real projects, a demonstrably best-in-class forecasting organisation (median forecast/actual ratio 1.0) still scored only **35% "success"** by Standish's own definitions ([PDF](https://www.cs.vu.nl/~x/chaos/chaos.pdf)). **Do not cite CHAOS in the game's KB.** |
| **52% of projects experienced scope creep** in the prior 12 months, up from 43% five years earlier | **FACT** | PMI Pulse of the Profession 2018 ([PDF](https://www.pmi.org/-/media/pmi/documents/public/pdf/learning/thought-leadership/pulse/pulse-of-the-profession-2018.pdf)) |
| MSP billable utilization: **75% target for engineers, 85% for cabling techs, actuals mid-60s** | **FACT** (industry-average reporting) | [Promys](https://promys.com/billable-labor-utilization-industry-averages-for-techs-engineers/) |
| "70% of digital transformations fail" | **FOLKLORE with a real-but-narrow root** | BCG 2020 studied 70 of its own engagements plus 800+ execs and found ~30% "successful" against its own standard; most of the other 70% still created some value |
| "30-40% of data migration projects fail"; "83% of data migrations fail or exceed budget, per Gartner" | **FOLKLORE** | Repeated across vendor blogs; no primary source traceable for either |
| Cloud specifically: 27% of enterprises say migrations are slower than planned, 22% exceed budget by >20% | **FACT** | Flexera 2025 State of the Cloud ([Flexera](https://www.flexera.com/blog/finops/the-latest-cloud-computing-trends-flexera-2025-state-of-the-cloud-report/)) |

### 5.7 What falls straight out as game material

- **The tree**: Project -> Phase -> Project Ticket -> Task, with Milestones flagged on phases, Budget Hours vs Actual Hours per node, and predecessors that LOCK downstream work (HaloPSA's rule is literal).
- **The three-way clock**: project hours, ticket hours, unbillable hours, against a 75% target management sees and the engineer feels. An interrupt costs two context switches and roughly two hours of real output, not twenty minutes.
- **The gate ritual**: discovery -> design -> procurement (the invisible 2-6 week wall) -> pilot -> go/no-go (one named decision-maker, agreed criteria, documented rollback order) -> cutover window -> 48-hour stabilisation -> documentation -> sign-off. Documentation and sign-off are budgeted phases that get sacrificed, which is why the project shows 85-90% forever.
- **Status as a separate, corruptible resource**: RAG colour is a REPORTED value distinct from the true value. Reporting Red is punished by the org and rewarded by outcomes. This is the watermelon mechanic and it is thoroughly documented, not invented. It also sits perfectly beside the E8 CYA/manager-override machinery already shipped.
- **Scope creep as "a hundred small yeses that nobody tracked"**: individually free, cumulatively the whole margin. A change-order verb should exist, be socially expensive, and be the only thing that actually protects the budget - "just painful enough ... but easy enough that they use it".
- **The blockers are other people, and they are the funniest material in the corpus**: the ISP install date, the LOA with an ex-employee's name on it, the client who will not send the list, the exec who gets the MFA exemption and keeps it forever. None of them are technical, and the game's org-dysfunction epic (E8) has already built the vocabulary for exactly this.

---

## 6. Fun-mechanic survey: how sims model multi-day phased work

Five games, one anti-pattern each, plus what to steal. FACT = documented mechanic or cited review; INFERENCE = design reading.

### 6.1 Game Dev Tycoon - the anti-pattern, in full

FACT. A game runs Preparation -> Development -> Bug-Fixing. Development is 3 phases, each exposing 3 sliders that allocate that phase's time budget (phase 1: Engine/Gameplay/Story; phase 2: Dialogues/Level Design/AI; phase 3: World/Graphics/Sound). Sliders emit tech and design points scored against a hidden per-genre ideal ([Steam phases guide](https://steamcommunity.com/sharedfiles/filedetails/?id=174178538), [GDT wiki points algorithm](https://gamedevtycoon.fandom.com/wiki/Tech_and_Design_Points_Generation_Algorithm)).

FACT. **It is solved.** The wiki states the rule outright - per genre, never below 20% on 3-6 fields, never above 20% on 0-3, exceed 40% at least twice on 3-6 ([Success Guide](https://gamedevtycoon.fandom.com/wiki/Success_Guide)) - and a third-party slider lookup site exists purely to be consulted mid-play ([gamedevtycoonadvisor.com/sliders](https://gamedevtycoonadvisor.com/sliders)). GameCritics: "the creation process involves merely moving sliders and watching point bubbles float to the top of the screen, with no way to actually tell what the finished product is like" ([review](https://gamecritics.com/tayo-stalnaker/game-dev-tycoon-review/)).

**The lesson for workgrumble: three front-loaded decisions, zero interruption, an opaque grader.** Because the grader is hidden and non-diegetic, the only way to learn is external lookup, which converts play into data entry. This matters doubly here, because workgrumble's whole grading model is a graph assertion the KB explains honestly - it is structurally the OPPOSITE of a hidden ideal, and that advantage must not be thrown away by inventing a hidden project score.

### 6.2 Software Inc. - the reversible in-phase dial

FACT. Design -> Alpha -> Beta -> Release -> Support/patching. Design runs up to 4 iterations and CAPS the quality alpha can reach. Feature selection produces an estimate in **code units** and **art units**, and alpha runs until those counts are met. Beta is bug burn-down, and **sitting in beta longer ships fewer bugs, which means less support load and fewer refunds** ([alpha stage thread](https://steamcommunity.com/app/362620/discussions/0/1694914735990178034/), [design phase thread](https://steamcommunity.com/app/362620/discussions/0/594820656452540326/)). 94/100 Steambase player score, 7151 positive of 7586 ([Steambase](https://steambase.io/games/software-inc/reviews)); criticism clusters on micromanagement and on the opacity of the quality rating.

**Steal: "how long do I sit in beta" is a live, reversible dial with a modelled downstream cost.** In workgrumble that is directly "when do I cut over" - and the downstream cost is next week's ticket queue. That links the project layer to the ticket layer instead of putting them side by side.

### 6.3 F1 Manager - the foreground as metronome, not enemy

FACT. Nine car parts; aero parts must be **designed** and then separately **manufactured**, drawing on different pools. Research runs in parallel and only pays off next season. Design hours are capped per ATR period and unspent capacity is LOST; everything draws on the season cost cap ([F1 Manager official guide](https://www.f1manager.com/en-US/2024/news/car-development-research-guide), [SimRacingSetup](https://simracingsetup.com/f1-manager/f1-manager-2024-car-development/)). An advanced play is to delay manufacture and iterate the design, trading availability for quality.

**This is the best structural model for the question the owner is asking.** The race weekend is not an interruption of development - it is a metronome that periodically **converts the long project into public evidence**, and hands back new information about where the car is weak. The deadline is not "the bar hits 100%", it is "the race happens whether you are ready or not, and being unready is visible".

### 6.4 Prison Architect - concurrency cap, advance payment, and the planning tool

FACT. Grants are accepted from the Reports screen; **only 2 can be held at once** (a hired Accountant unlocks a third for $500). Each pays an **advance on acceptance** and a **completion bonus**, and adds a checkable objective list to the UI. Basic Detention Centre = $20,000 advance / $10,000 completion. The wiki documents **no hard time limit or fail state** on individual grants ([PA wiki, Grants](https://prisonarchitect.paradoxwikis.com/Grants)). Separately the **Planning tool** lets the player sketch walls and objects as blueprints workmen do not build - pure layout reasoning, no commitment ([PA wiki, Planning](https://prisonarchitect.paradoxwikis.com/Planning)).

**Three steals.** (a) The concurrency cap makes accepting a project a trade rather than a growing to-do list. (b) The **advance** means starting a project changes your world state immediately - you are now spending someone else's money and you owe an outcome. (c) The planning tool is "planning as gameplay" in its purest form: a free, consequence-free artifact the player authors BEFORE committing. In an ITIL-parody fake OS, that artifact writes itself - it is the change plan and the rollback step.

### 6.5 RimWorld - why interruption reads as drama and not annoyance

FACT. Work is a pawn x work-type priority matrix; long jobs are interrupted by combat, needs, mental breaks and raids. Players report colonists refusing to finish items another colonist started, and bills changed mid-work abandoning the in-progress job - widely called a pain point and modded out ([micromanagement thread](https://steamcommunity.com/app/294100/discussions/0/3140616601473804927/)). RimWorld is explicitly designed as a story generator, and Sylvester's GDC 2017 talk argues loss is an essential PART of a story, not its conclusion ([Game Developer](https://www.gamedeveloper.com/design/video-how-i-rimworld-i-found-success-through-ridiculous-contrarian-design), [GDC Vault](https://www.gdcvault.com/play/1024232/-RimWorld-Contrarian-Ridiculous-and)).

**INFERENCE, and it is the sharpest line in the survey: destruction with a story is drama; silent progress loss is a bug.** A raid does not pause the hospital build, it burns the half-built hospital. The project's partial state is destructible and inspectable, which is what keeps it emotionally present between sessions.

### 6.6 The cautionary case: Two Point Campus

FACT. Two Point Hospital has no project layer at all - a background research track players keep asking to be queueable ([thread](https://steamcommunity.com/app/535930/discussions/0/2590022385667104441/)), a build loop, and **Emergencies** as the interruption primitive (5-8 pre-diagnosed patients under a countdown; cure half for bonus, fail for a reputation hit). Emergencies are widely reported as feeling unfair rather than tense, because the outcome turns on pathfinding rather than decisions. Two Point Campus DID add a multi-year commitment (courses chosen at the academic-year boundary, students progressing Year 1 -> Year 2), and reviewers reported the result as "the late-game dullness of simply waiting for accomplishments to fulfill" ([New Game Network](https://www.newgamenetwork.com/article/2575/two-point-campus-review/), [GameGrin](https://www.gamegrin.com/reviews/two-point-campus-review/)).

**Campus is the exact failure mode this epic risks.** The commitment is real; nothing happens INSIDE the period that references it. A phase with no in-phase decisions is a wait, however well the fiction justifies it.

### 6.7 Two more, briefly

- **Project Highrise** (FACT): every new floor needs five separate utility lines run across it - reviewers found this "incredibly tedious" ([GameWatcher](http://www.gamewatcher.com/reviews/project-highrise-review/12679), [PixelJudge](https://pixeljudge.com/reviews/project-highrise-review/)). INFERENCE: dependencies produce tedium when uniform, planning when they differ per project.
- **Startup Company** (FACT): component -> module production chains; the common criticism is that the late game "forces you to expend geometric/exponential resources and time to achieve almost-linear growth" ([Steam](https://store.steampowered.com/app/606800/Startup_Company/)). INFERENCE: if higher titles just need MORE of the same work, seniority becomes punishment - directly relevant to the owner's title ladder.
- **Papers, Please** (FACT): the end-of-day stage is the inspector paying bills and allocating credits ([wiki](https://papersplease.fandom.com/wiki/End_of_day_screen)); Pope deliberately avoided introducing new bulletin rules on days when a guard/supervisor/investigator also talks to you ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)). Workgrumble already has this - `clockOff` + the scorecard - and already obeys the pacing rule (`week.ts` leaves Monday alone because Monday teaches the two basic tools).
- **The waiting literature** (FACT): CHI PLAY 2024 "Towards Understanding Waiting in Video Games" ([ACM](https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678791)); the practical version is that waiting works only under time pressure or as timing gameplay, never as a nuisance gate ([macoy.me](https://macoy.me/blog/gamedev/DontMakePlayersWait)).

### 6.8 What to steal, what to avoid

**STEAL, ranked:**

1. **Make the foreground the metronome, not the enemy.** A fixed cadence (`clockOff`, the Friday review, a change window) periodically converts project state into ticket-layer consequence. Workgrumble already HAS the cadence and already has the conversion seam (`applySetup` at runtime, drip tickets). If the migration is half-done at cutover, next week's queue changes.
2. **Every phase needs one in-phase decision with a reversible cost.** Test: if a phase can be fully specified before it starts, it is a progress bar - merge it into the previous decision or delete it.
3. **Cap concurrency and pay an advance.** Accepting a project costs something NOW: a slot, an afternoon booked, a promise in writing to a manager NPC.
4. **Make the partial state destructible and diegetic, not a percentage.** Workgrumble is unusually well placed here: the half-done project should BE graph state - a half-migrated OU, a staging box with 40 of 120 accounts, a change record sitting in "approved, not implemented" - visible in the same consoles the player built it in. A number dropping from 60% to 45% is annoying; finding your half-built group with the wrong membership is a story.
5. **Author the plan before you commit, then grade execution against the player's OWN plan.** The change-request artifact (scope, risk, rollback) is already this, and already shipped.
6. **The boundary reckoning is arithmetic, not a grade.** The scorecard already works this way. Do not bolt a hidden project score onto it.

**AVOID:**

- Front-loaded allocation plus a hidden ideal (GDT). Any hidden per-project scoring function will be a wiki page within a month.
- Phases whose only content is elapsed time (Two Point Campus).
- Uniform dependency chains (Project Highrise's five lines per floor, forever).
- Interruption without narrative or recovery. Two Point Hospital emergencies (outcome decided by pathfinding) and RimWorld's abandoned-bill behaviour are the two failure shapes.
- Micromanagement whose stakes are not modelled. The test is whether the Nth click changes an outcome the player can name.
- Linear reward for exponential input (Startup Company's late game).

**What makes a milestone deadline feel like PRESSURE rather than an arbitrary fail-state** (INFERENCE, grounded in the mechanics above):

1. **The deadline belongs to somebody else's calendar.** "Migration must finish in 3 days" is arbitrary. "The lease ends Friday and the ISP cuts the circuit" is not. F1's race happens; Papers Please's rent is due.
2. **Missing degrades, it does not delete.** Prison Architect grants have no fail timer; F1 just races a worse car. A missed milestone ships the BAD version - angrier users, a rollback, an audit finding, more tickets next week.
3. **The cost is forecastable mid-flight.** On day 2 of 5 the player should be able to see they will miss, and choose HOW to miss: cut scope, work late and take the stress, buy the vendor's help and take the budget hit. A deadline you cannot see coming is a fail-state; one you can watch approaching is pressure.
4. **The same resource serves two masters.** This is the mechanical heart of it: an hour on the project is an hour off the queue, and both bill you. This is gap G8, and it is why utilisation is a dependency rather than a nice-to-have.

**The repo's own research already supplies the interruption cost model.** `docs/research/day-to-day-frustrations.md:24-72` has the interruption science, correctly sourced and correctly sceptical (it debunks the famous "23 minutes 15 seconds" figure's provenance and replaces it with the honest model: 81.9% of interrupted work is resumed the same day, on average ~23 minutes later, having passed through about two intervening tasks). Two findings there are directly load-bearing for projects:

- **The 2008 Mark/Gudith/Klocke result**: interrupted people finish the interrupted task FASTER, and pay for it in significantly higher stress, frustration, time pressure and effort. Interruption cost belongs in the stress meter, not only the clock - which the game already has.
- **Benign vs malignant interruption turns on two axes**: RELEVANCE (an interruption relevant to the current task is less aversive and can even help) and TIMING (interrupting at a subtask BOUNDARY is measurably less disruptive than mid-subtask). **Applied to projects, that is a free and truthful mechanic: being pulled onto a ticket AT a phase boundary is cheap; being pulled mid-phase is expensive.** It makes the phase structure mechanically meaningful rather than decorative, and it costs nothing to build on top of the existing takeover machinery (`src/world/interruptions.ts`, `week.ts` `interruptions`/`walkUps` columns).

**Keeping "the thing you started 3 days ago" present:** persist it as inspectable world state, not a bar; let the ticket queue REFERENCE it (tickets generated because of your in-flight project are the cheapest and strongest device, and they make interruption thematic rather than random); give it an NPC owner who chases you on the cadence boundary; and put its one-line state on the day scorecard next to the day's ticket numbers, so the two layers are weighed in the same frame.

---

## 7. The E7 overlap: projects inside the cloud epic, or their own?

### 7.1 What E7 actually is, as written

GitHub issue #8 (`mtclab/workgrumble`), label `epic`, open, no comments:

> - parody-NAMED providers (trademark-safe: Nimbus-WS / Cerulean-portal / Giga-platform class), REAL-shaped systems: IAM, security groups, buckets, billing alarms, plan/apply
> - terraform model = the engine's declared-vs-actual graph diff (nearly free by design)
> - incident classes: public bucket, surprise bill, drift whodunit
> - per-provider dated research spike BEFORE build (data-scoped rule); KB jokes about knowledge staleness
> - the Assistant reincarnates as AI-in-everything (from E2)
> - educational arc: terraform/yaml/docker = the accidental curriculum; KB honest-explanations bar extends to IaC
> - Research base: docs/research/modern-stack.md (~90 sources).

`docs/ROADMAP.md` item 7 says the same in the roadmap's voice.

**Read the deliverables list carefully: E7 as scoped is a NODE-KIND-AND-VERB PACK plus three incident classes. Not one line of it is project-shaped.** Its own research base confirms this. `docs/research/modern-stack.md:319-337` ranks E7's five credible additions, and all five are single-session tickets:

- P3.1 the manual-change drift incident (read the audit log, find who and why, codify the fix before applying)
- P3.2 the public bucket (is it supposed to be public? one hosts the website, one holds HR exports)
- P3.3 the surprise bill (hunt the forgotten resource through a cost-by-tag view that is useless because nothing is tagged)
- P3.4 security-group / IAM access requests, explicitly named "the password-reset of cloud"
- P3.5 parody consoles as apps over the same graph

And `modern-stack.md:312-317` states the engine claim plainly: the declared-graph-vs-actual-graph diff is exactly Terraform's state-vs-reality model, so "no rework needed". E7 is genuinely cheap because the engine already thinks the way the tool does.

### 7.2 The case FOR putting projects inside E7

1. **Cloud work is the most project-shaped work in the whole game's fiction.** The real frameworks are explicitly phased. AWS's Migration Acceleration Program is a three-phase methodology - Assess, Mobilize, Migrate & Modernize - with a readiness assessment across six Cloud Adoption Framework dimensions before anyone touches a workload ([aws.amazon.com/migration-acceleration-program](https://aws.amazon.com/migration-acceleration-program/)). The 7 Rs (Rehost, Replatform, Repurchase, Refactor, Retire, Retain, Relocate) are a per-application disposition decision made in the assess phase ([itransition](https://www.itransition.com/cloud/aws/migration/strategy)). FACT, and a ready-made phase spine.
2. **A migration is a universal-quantification-by-negation gate in one line.** "Nothing is left on-prem" is `not(exists(machine, where: [{field: 'hosting', value: 'onprem'}]))` - expressible in `Expr` today (section 1.2). The gap-4 counting problem largely vanishes for exactly this content class.
3. **The declared-vs-actual diff is a natural PHASE READOUT.** A terraform plan that shows 12 resources to add IS a progress bar that is diegetic rather than decorative - the player reads the same artifact a real engineer reads, and it happens to say how far along they are. That is a rare and valuable coincidence.
4. **The E7 title is already the one the owner means.** `docs/design/estate-and-customers.md:32` puts "Cloud / DevOps consultancy | project engagements | migrations, billable hours, hand off and leave" under E7. The design docs already associate this employer archetype with project work.
5. **Google's SRE 50% toil cap gives the title-shift a real, citable mechanic.** Google caps operational work at 50% of an SRE's time and requires the other half go to engineering project work, monitored, with excess ops load redirected back to product teams until it drops below 50% ([sre.google/sre-book/eliminating-toil](https://sre.google/sre-book/eliminating-toil/)). FACT. That is the owner's "higher titles shift from tickets toward projects", already written down by the industry, with an enforcement rule attached that would make a great meter.

### 7.3 The case AGAINST

1. **They are orthogonal, and bundling them serialises two independent risks.** Projects are a scheduling-and-commitment mechanic (time, phases, deadlines, interruption). Cloud is a content pack (node kinds, verbs, consoles, three incidents). Neither needs the other. Bundled, E7 cannot ship until the project mechanic is right, and the project mechanic cannot be validated until cloud content exists.
2. **E7's cheapness is its whole justification, and projects would destroy it.** The epic is scoped as "nearly free by design". Gaps G3 (phase machine), G5 (cross-week carry), G6 (long-horizon UI), G8 (utilisation), G9 (a feasibility solvability gate) are collectively the largest engine change since the Rust port. Folding them into E7 turns a cheap epic into the most expensive one and buries the reason it was cheap.
3. **The project mechanic needs to be validated on content the game already understands.** An M365 tenant migration, an AD domain migration, a server refresh, an office move - these run on node kinds that already exist (`person`, `account`, `machine`, `service`, `share`, `group`, `customer`). A cloud project would need the phase machine AND a whole new estate vocabulary to be right at the same time, with no way to tell which one is wrong when it is not fun.
4. **The owner's ask is about TITLES, not about cloud.** Higher titles shifting toward projects has to be true at the sysadmin/E6 rung too, or the ladder has a dead step: service desk (tickets) -> systems engineer (tickets plus on-call) -> cloud (suddenly projects) reads as a genre change rather than a career. Today there is exactly one promotion in the game - `CAREER_ACTIONS.acceptPromotion`, gated at reputation 70, writing `player_tier` and `title` once, one-way (`src/world/actions/career.ts:32-85`). If the project mechanic only exists at E7, the intermediate rungs have nothing new to be.
5. **Cloud migrations are the WORST first project to build, because their real failure mode is invisibility.** Flexera's 2025 State of the Cloud reports 27% of enterprises describe cloud migrations as slower than planned and 22% exceeding budget by more than 20% ([flexera.com](https://www.flexera.com/blog/finops/the-latest-cloud-computing-trends-flexera-2025-state-of-the-cloud-report/)). The oft-repeated pattern is that the first 80% moves quickly, the next 15% slowly, and the last 5% never moves at all ([serchen](https://www.serchen.com/blog/the-cloud-migration-that-never-actually-ended)) - FOLKLORE in that exact numeric form, but consistent with the sourced overrun data. A first project mechanic needs an ENDING the player can reach and feel. A migration whose truthful ending is "it never quite finished" is a superb third project and a terrible first one.
6. **A caution on the statistics.** "83% of data migrations fail or exceed budget, per Gartner" circulates widely (e.g. [linkedin.com/pulse/83-data-migrations-fail](https://www.linkedin.com/pulse/83-data-migrations-fail-exceed-budgets-schedules-david-colella)) but I could not trace it to a primary Gartner publication. Treat as FOLKLORE. The Flexera figures above are sourced to a named annual report and are safe to design against.

### 7.4 Recommendation

**Projects are their own epic (E9), sequenced before E7, and E7 becomes its second content pack.**

Concretely:

- **E9 slice 1 - the phase machine, in one week, on existing node kinds.** One project, 3 working days inside a shipped five-day week, at the MSP or the corporate employer. Fork A from G5: no cross-week carry. Phase gates use counter-field-plus-`eq` (G4a) and universal-by-negation (G4b), so **zero core-rs assertion work in slice 1**. New: a `project` node kind, a phase state derived from baked ticks against the clock (the `change-request.ts` pattern), a Projects app entry in `APP_MANIFEST`.

  **Adopt HaloPSA's model, not ConnectWise's** (section 5.1): a project IS a ticket type, with project-task child tickets and milestones that LOCK downstream tasks until the previous milestone closes. That maps onto `parent.ts` with the arrow reversed and onto the existing ticket lifecycle, and it avoids inventing a parallel work-item system. Note also that ConnectWise's own guidance puts the MSP service-ticket ceiling at **around two weeks** - so a 3-day project is not a compromise for the sim's sake, it is a small real one.

  **Candidate content, in order of fit:** a **firewall/edge replacement** is the standout first project, because the real one has exactly the shape a game wants - months of invisible procurement compressed offscreen, weeks of configuration as the phase work, and a **~2-hour cutover with 1-2 minutes of user downtime, old box left racked** (section 5.2). It has a rollback that is literally moving a cable back, a "scream test" phase that generates tickets from your own change (the delayed-consequence settlers in section 3.12 already do this), and an ending the player reaches. Second choice: a Windows version rollout via **deployment rings** (pilot -> early adopters -> departmental -> full), which is universal-by-negation completion (`not exists(machine where os=old)`) and needs no new assertion grammar at all. An M365 tenant migration is a better third: its truthful failure - "they moved mail cleanly and never planned OneDrive, Teams and sharing links" - is a superb twist but a punishing first lesson.
- **E9 slice 2 - the tension.** Utilisation/timesheet (G8, already designed in `estate-and-customers.md` and `msp-arc.md` and built nowhere), so that project time and ticket time compete for the same minutes. This is the slice that decides whether the mechanic is fun; slice 1 without it is a second queue. It is also the best-evidenced mechanic in the whole of this research - a 75% billable target that engineers actually hit in the mid-60s, an interrupt costing two context switches and roughly two hours of real output, and Google's 50% toil cap (section 5.4). Pair it with the benign/malignant interruption axis (section 6.8): pulled onto a ticket AT a phase boundary is cheap, mid-phase is expensive.

  Slice 2 is also where the **watermelon** belongs (section 5.5): a REPORTED RAG status distinct from the true state, where reporting Red is punished by the org and rewarded by outcomes. Workgrumble already has the machinery for a lie with a delayed cost - the CYA/manager-override and conduct systems from E8, and `settleSecurityFallout` firing on the NEXT morning specifically so a consequence does not read as punishment for the click. A green status you knew was red, coming due on Thursday, is that pattern applied to a project, and it is the single most recognisable thing in the corpus.
- **E9 slice 3 - the feasibility gate (G9)** and, if the fiction demands it, cross-week carry (G5 fork B).
- **E7 then ships as designed** - consoles, IAM, buckets, billing alarms, plan/apply, three incident classes - as TICKETS, exactly as `modern-stack.md` scoped it, **plus** one cloud-migration project authored on the E9 machine. The plan/apply diff becomes the phase readout for free, and the migration's honest never-quite-finished ending is available as a late-game beat once players already know what a finished project feels like.
- **Keep the per-provider dated research spike as E7's data-scoped gate regardless.** Nothing here changes that requirement.

**The strongest counterargument to my own recommendation:** E9-before-E7 spends the biggest engine budget in the project's history on a mechanic whose fiction is thin at the tiers that exist today. The game currently ships two player tiers and one promotion; service-desk and systems-engineer work is genuinely ticket-shaped, and a project bolted onto a service desk is exactly the "second queue" failure I warn about. Cloud/DevOps consultancy is the first employer archetype whose fiction is *natively* project-shaped - `estate-and-customers.md:32` says so in the game's own design docs - so building projects inside E7 means building them where they are load-bearing rather than where they are decorative, and it means the phase readout (terraform plan) and the phase content (the 7 Rs, assess/mobilize/migrate) arrive already fused instead of being retrofitted. If the owner's real appetite is "the career ladder should change shape at the top" rather than "projects should exist at every rung", E7-with-projects is the cheaper and more coherent answer and my sequencing is over-engineering.

The tiebreaker question for the owner: **does a Systems Engineer (E6, shipped) do projects, or only a cloud consultant (E7, unbuilt)?** If the answer is "yes, E6 does too", build E9 first. If it is "no, projects are what the cloud rung IS", fold them into E7 and accept the epic getting expensive.
