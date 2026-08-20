# Thread 2: E7 cloud/devops - engine fit and gap list

Research + analysis, 2026-08-12. Read-only pass over `/home/kasm-user/repot/workgrumble`
at v0.33.0 (`d15dbfe`), against GitHub issue #8, `docs/ROADMAP.md:18`,
`docs/research/modern-stack.md` section 4, `docs/SPEC_CORE_RS.md` and
`docs/design/titles-difficulty.md`.

Every claim about the repo below is a FACT read off the code at the file:line given, in
the manner of `docs/research/titles-projects-engine.md`. Where a claim is a design
reading rather than a fact, it says INFERENCE. Where a design doc says something the
code contradicts, both are quoted.

Contents: 0 verdict · 1 graph vs cloud resources (G1-G6) · 2 declared-vs-actual
(G7-G12) · 3 time and money (G13-G17) · 4 the console (G18-G21) · 5 naming (G22-G25) ·
6 tier gating (G26-G28) · 7 gap index · 8 open questions · 9 slice ladder.

---

## 0. Verdict up front

**The epic's "nearly free by design" claim is half true, and it is true about the wrong
half.** The engine's SHAPE genuinely matches Terraform's mental model, and the estate
has already shipped the declared-vs-actual pattern twice by hand. But the cheap part is
the graph, not the diff; and the part the epic does not cost at all - **money accruing
over time** - is the only genuinely new engine surface in the whole epic.

Three shortest-path facts behind that:

- **Most cloud resources are not new node kinds.** Fields are OPEN: `assert_known_fields`
  validates only the fields it names per kind and returns `Ok(())` for everything else
  (`core-rs/src/schema.rs:167-171, :427`). A security-group rule is already shipped -
  it is the six firewall rules at `src/world/msp-company.ts:990-1047`, `kind: 'service'`
  edged `runs_on` to a box. An IAM role is a `group`; a policy binding is a `member_of`
  edge; a managed DB is a `service`; a cloud instance is a `machine`, and the world
  already says so in prose (`src/world/msp-company.ts:743`: `processor: 'A cloud instance
  running the product Meridian sells'`). What is genuinely missing is storage, a
  region dimension, and tags.
- **There is no diff code anywhere in the repo, and `Expr` cannot produce one.** Nothing
  takes two graph states, or a desired state and an actual one, and returns a
  difference. The assertion grammar can answer "is there drift" via
  `not(exists(kind, where))` and cannot answer "what drifted" - the constraint is
  written down in the project module itself (`src/world/project.ts:29-35`). A plan
  output is a LIST, so the diff must live in TS. That is a day of work, not zero, and
  it is not where the epic thinks the cost is.
- **The player's money cannot go down.** `daySlip` ends `net = Math.max(0, gross -
  deducted)` (`src/world/day.ts:601`), and `farm_fund` has exactly four write sites
  (`src/world/actions/day.ts:900-906`, `:864-870`, `:407-419`, `:519-531`). A surprise
  bill has nothing to hurt with. Also: the timesheet and invoice systems are entirely
  non-monetary today - zero pence references in either file - so cloud cost would be the
  first money the player's TECHNICAL decisions move. That is a design escalation, not a
  content pack.

Honest re-scope: **the estate work is cheap, the diff is small, the bill is the epic.**

---

## 1. The graph vs cloud resources

### 1.1 What the engine bans

Four closed sets, all in `core-rs/src/schema.rs`:

| Set | Count | Line | Refusal |
| --- | --- | --- | --- |
| `NODE_KINDS` | 16 | `:15-69` | `validate_node` refuses an unknown kind at load, `:448-450` |
| `EDGE_KINDS` | 6 | `:71-80` | `validate_edge` refuses, `:489-491` |
| `TICKET_STATES` | 4 | `:82` | `:405-407` |
| `TICKET_ARCHETYPES` | 5 | `:84-90` | `core-rs/src/tickets.rs` parse |

Field VALUES are also closed - `FieldValue` is `string | number | boolean | null`
(`src/engine-api/types.ts:97`, Rust `core-rs/src/value.rs`). No arrays, no objects.

**Fields themselves are OPEN.** `assert_known_fields` (`core-rs/src/schema.rs:171-429`)
type-checks only the fields it names per kind, and its final arm is `_ => Ok(())`
(`:427`). Adding `provider`, `region`, `cost_per_hour`, `iac_declared` to a `machine`
or a `service` costs **zero core-rs change** and no wasm rebuild. Adding a KIND costs a
Rust edit, a validator arm, a wasm rebuild and a save consideration - well-trodden
(five kinds added since M0: `unit` `:25`, `customer` `:32`, `change_request` `:40`,
`coordination` `:50`, `project` `:62`).

### 1.2 Cloud resource -> existing vocabulary

| Cloud resource | Maps to | Evidence | New kind? |
| --- | --- | --- | --- |
| Compute instance | `machine` + fields | `schema.rs:179-192`; already fictional at `src/world/msp-company.ts:743`, `:1545` | No |
| Security-group rule | `service` edged `runs_on` to a box, with class/order/documented fields | The shipped firewall rules: `src/world/msp-company.ts:990-1047`; fields `src/world/fields.ts:1062-1068` | **No - already built** |
| Managed DB / LB / NAT gateway | `service` with `status: running\|stopped\|wedged` | `schema.rs:198-211` | No |
| IAM role / group | `group` | `schema.rs:346`; Okta groups already shipped as `group` nodes, `src/world/msp-company.ts:1451-1452` | No |
| IAM user | `account` (`username`/`enabled`/`locked`) | `schema.rs:174-178` | No |
| Policy binding | `member_of` / `has_access` edge | `schema.rs:71-80` | No |
| Object store / bucket | **nothing** (`share` has only `name`/`path`, `schema.rs:342-345`) | - | **Yes, or overload `share`** |
| Region / zone | **nothing** - grep for `region`/`zone` across `src/world` returns zero non-comment hits | - | No (a field), but see G2 |
| Tags | **nothing**, and `FieldValue` cannot hold a map | `src/engine-api/types.ts:97` | See G3 |
| Cost per hour | a number field, free | `schema.rs:427` | No |

**G1. No storage kind, and the word `bucket` is already taken.** `bucket` is the
timesheet's primary key - `bucketOf` (`src/world/timesheet.ts:130`),
`SERVICE_DESK_BUCKET` (`:135`), `SheetShape = 'single_bucket' | 'per_customer' | 'per_customer_project'` (0.40.0),
`bucketParts` (`:766`) - and it is player-facing in the service-desk joke
(`src/shell/apps/timesheet.ts:188`: `'One bucket a day, seven and a half hours,
attributed to nobody.'`), plus ~40 non-test sites across `src/world/invoice.ts:90-660`.
Overloading it would collide with the invoice system, of all things. Either the cloud
noun changes or the timesheet's does. Cost: small, but it is a decision, not a rename
somebody can do quietly.

**G2. No region/zone dimension anywhere.** The `.5` joke the research wants - "resources
'missing' because wrong region" (`docs/research/modern-stack.md:333-334`) - needs (a) a
`region` field on resources, (b) a console that filters by it, and (c) the guarantee
that no OTHER surface leaks the hidden resources. (c) is the non-obvious cost: `cmd-run`
and `cmd-unix` both walk `nodesOfKind` directly (`src/shell/apps/cmd-run.ts:195, 608,
969`; `src/shell/apps/cmd-unix.ts:814, 1480, 5471-5472`), so the region filter has to be
a world-layer read every surface shares, not a console-local `.filter()`. Precedent
exists: `monitorBoard` and `projectPlan` are exactly that (`src/shell/apps/monitor.ts:210`,
`src/shell/day-driver.ts:4155`), and the projects app header states the rule -
`src/shell/apps/projects.ts:20-50`: *"this file holds no gate, no date arithmetic and no
reach into the graph beyond the player's own tier, so the board and `fw status` cannot
come to different conclusions."*

**G3. No set-valued field, so tags need an encoding.** The estate's convention for
multi-valued data in one field is a newline-delimited line list with a pipe-delimited
record - `timesheet_log` is `tick|kind|id|last` (`src/world/timesheet.ts:142-177`),
`invoice_ladder` is `customer|rung|tick` (`src/world/invoice.ts:408-410`),
`install_audit` is `id@tick` (`src/world/fields.ts:396`). The op language can append
(`append_line`, `core-rs/src/ops.rs:232`) and the guard language can test membership and
COUNT lines (`line_in_field`, `line_count_at_least`, `src/engine-api/types.ts:411-429`).
So `tags = "owner|dana\nenv|prod"` is idiomatic and testable today. The joke - "a
cost-by-tag view that is useless because nothing is tagged" - is then a pure TS fold.
Cost: small. Worth naming because inventing a `tag` node kind would be the wrong move
and is the obvious first instinct.

**G4. `SetupMutation` has no `removeNode`.** The four variants are `AddNode`,
`SetField`, `AddEdge`, `RemoveEdge` (`core-rs/src/tickets.rs:21-31`, wire names `:43-73`).
`remove_node` exists only as an action-level op (`core-rs/src/ops.rs:1094`, parsed
`:1197`). So a `terraform destroy`, or an apply that deletes a resource, cannot ride
the `applySetup` seam - it must be a registry action. See G9, which wants the same
thing for a different reason.

**G5. `RemoveEdge` in setup is tolerant, in ops it is strict.** `World::apply_setup_mutation`
silently accepts removing an edge that is not there (`core-rs/src/world.rs:309-320`,
with the comment *"Construction says what the world IS, not what to do to it ... The op
language's own `remove_edge` stays strict"*). An apply expressed as setup ops would
therefore be silently idempotent, which sounds convenient and is actually a bug factory
for a plan/apply mechanic where "this apply changed nothing" must be distinguishable
from "this apply did the thing". Another vote for apply-as-action.

**G6. Deciding the minimum new-kind set is the real slice-1 design task.** My reading:
**one** new kind (`store`, the object bucket), because it is the only cloud noun with no
honest home and it is the star of an incident class. Everything else rides `machine`,
`service`, `group`, `account` with new fields. INFERENCE, but it matches how `customer`
and `project` were justified in the schema comments (`schema.rs:26-32`, `:51-62`): a new
kind earns its place by being *a first-class world artifact the queue is organised by*,
not by being a new noun.

---

## 2. Declared-vs-actual: verifying "nearly free"

### 2.1 What exists

Ordered by how much it saves.

1. **The pattern is already shipped, twice, by hand.** The Arden firewall job models
   *declared* as `fw_rule_documented` on the rule (`src/world/fields.ts:1065`) and
   *actual* as the rule nodes edged to the live box. It is compared three ways:
   - as an `Expr` gate: `stagingGate` (`src/world/project.ts:266-309`), an `or` of two
     `and`s of `not(exists(service, where[...]))`;
   - as a `PredData` guard: `CUTOVER_LEAVES_SOMETHING_BEHIND`
     (`src/world/actions/project.ts:89-113`), a `neighbor_where` that traverses `runs_on`
     into the old box, binds the rule, and compares the neighbour's state against the
     parent's declared state in one predicate;
   - as a plan-shaped READOUT: `fwRuleLines` (`src/shell/apps/cmd-run.ts:1652-1700`)
     prints the pack's list before an audit and the live list after, with
     `unknown = rules.length - known.length` (`:1674`) and the line *"n of those were not
     in the pack"* (`:1694-1698`).

   **That third one is a terraform plan.** It is hand-written for one job, in the
   terminal, with no generalisation - but it proves the shape reads well and the content
   voice already exists.
2. **`change_request` is the working precedent for a declaration as a first-class node.**
   `cr_target` + `cr_verb` name what it authorises; the decision is baked at file time
   from what the contract allows (`src/world/change-request.ts:205-234`); the live status
   is DERIVED from baked ticks against the clock and never stored
   (`changeRequestState`, `:320-349`, doc `:314-319`); the maintenance window is
   `cr_window_open`/`cr_window_close`, seeded off the request id (`:639-668`).
3. **A canonical whole-graph serialisation already exists** - `stable_serialize_graph`
   (`core-rs/src/hash.rs:28-91`), nodes sorted, fields sorted, edges sorted. A diff would
   reuse it verbatim.
4. **A stored prior world already exists.** `CheckpointBaseline { rng_state, clock,
   graph, tickets }` (`core-rs/src/actions.rs:50-58`), with `graph` a whole
   `{nodes, edges}` JSON (`:55`), reachable via the `checkpoint_baseline` query
   (`core-rs/src/engine.rs:379-390`).
5. **Apply is already transactional.** `World::apply_setup` parses everything then runs
   one `transact` (`core-rs/src/world.rs:280-297`), with the comment *"Half a seeded
   world is not a world. The eighth mutation refusing must not leave the first seven
   standing."*
6. **Old-value/new-value pairs exist per mutation.** `GraphMutation`'s `field:set`
   variant carries `previous?: FieldValue` (`src/engine-api/types.ts:181`).
7. **Field-to-field comparison is expressible in the guard language today.** `field_eq`
   takes a `ValueData` (`src/engine-api/types.ts:346`), and `ValueData` includes
   `{ field: FieldRefData }` (`:330`), so `actual != declared` is `not(field_eq(node, f,
   {field: {node, field: iac_f}}))`. **No call site uses this**, so it is available and
   unproven. `field_at_least_field` (`:363-368`) is the only shipped cross-field
   predicate and is `>=` only.

### 2.2 What does not exist

**G7. There is no diff function anywhere in the repo.** Nothing returns a structured
difference between two graph states. Every comparison in the codebase is an equality
assertion (`src/parity/parity.test.ts:612-615, 665-674, 702-706`) or a hash
(`snapshot_hash`, `core-rs/src/engine.rs:212-214`). A hash answers "same or not" and
cannot localise. This is the single largest correction to the epic's cost estimate.

**G8. `Expr` cannot enumerate, so the plan output must be TS.** The assertion grammar is
six variants (`src/engine-api/types.ts:210-220`); `eq` takes a literal value, not a field
ref (`:214-218`); there is no quantifier. The project module records the constraint that
shaped 0.29.0 (`src/world/project.ts:29-35`): *"equality on a field, and
universal-quantification-by-negation - `not(exists(kind, where))`, which is what 'nothing
is left on the old thing' looks like when you cannot count."* So:
- the **plan LIST** is a pure TS function in `src/world/`, shaped like `monitorBoard` and
  `projectPlan`;
- the **convergence GATE** stays an `Expr`: `not(exists('store', where: [{iac_drifted,
  true}]))`, which is the shipped trick and needs no new grammar.

**G9. `applySetup` bypasses the action registry, so an apply done that way is invisible.**
The driver calls `engine.applySetup(...)` at eight runtime sites
(`src/shell/day-driver.ts:1736, 1754, 1864, 2191, 2328, 2359, 3543, 4054`). Nothing in
that path writes the dispatch log (which only records dispatches,
`core-rs/src/actions.rs:418-428`) and nothing writes a timesheet segment (recorded in
`DayDriver.dispatch`, `src/shell/day-driver.ts:2492-2500`). **An `apply` implemented as
`applySetup` would therefore bill the player zero minutes and leave no audit trail** -
which, for a mechanic whose whole point is "who applied what", is the wrong seam.
`apply` must be a registry ACTION whose op list is a `when`-guarded batch
(`core-rs/src/ops.rs:1116`, depth cap 8 at `:1141`).

**G10. The dispatch log is drained every night, so the whodunit cannot use it.** It is
the ONLY actor-bearing record - `DispatchLogEntry { tick, id, actor, target, params, ok,
reason }` (`core-rs/src/actions.rs:224-232`) - and `set_checkpoint` clears it
(`:444-457`, *"The entries are dropped rather than archived on purpose"*), called from
`clockOff` (`src/shell/day-driver.ts:2862`) and `endWeek` (`:2892`). A "who bumped this
at 2am three months ago" incident cannot be answered by a log query.
**The idiomatic fix is already shipped**: an append-only `id@tick` trail on the node
itself, written with `append_line` - `install_audit` (`src/world/fields.ts:396`, written
`src/world/actions/software.ts:105-107`), `break_glass_audit` (`fields.ts:579`, written
`src/world/actions/change.ts:105-115`). A drifted resource carries its own
`changed_by` trail, planted by the ticket's setup. Cheap, and it puts the evidence where
the player is already looking.

**G11. The state file, and what a lock can honestly be.** Three candidates:
- (a) `CheckpointBaseline.graph` - already a stored prior world, but it is engine
  bookkeeping, rewritten every `clockOff`, and invisible to fiction.
- (b) a `file` node holding rendered state - the filesystem is real
  (`src/world/filesystem.ts`, `src/world/fs.ts:519-571`), files carry a `content` string
  validated at load (`core-rs/src/schema.rs:358-360`), and the player can already read
  them. A state file that can be read, corrupted, and lost is diegetic gold.
- (c) `iac_*` fields on the resources themselves - state distributed onto the things.

  **Recommendation: (c) for the mechanics, (b) as the artifact.** (c) because the graph
  is hashed and saved whole (`core-rs/src/hash.rs`, `src/shell/save.ts:57` `SAVE_SCHEMA =
  4`) and a second graph would need a second hash, a second validator and a save bump;
  and because the estate's own idiom is already "the declaration is a field on the thing"
  (`fw_rule_documented`) or "a node filed against the thing" (`change_request`). (b)
  because "lost state" and "somebody hand-edited the state file" then become ordinary
  file mutations the world already supports.

  **The lock incident is NOT emergent and must be authored.** There is exactly one actor
  (`GameApi.actor`, `src/shell/apps/types.ts:162`, one person node). Two people applying
  at once cannot happen; a lock held by a named colleague can, as a `SetField` in a
  ticket's setup. Honest, and it is the same trick `arc.ts` uses for the cleaner who
  unplugs the printer.

**G12. Plan/apply/drift onto shipped machinery - the concrete mapping.**

| Terraform concept | Mechanism to build | Reuses | Cost |
| --- | --- | --- | --- |
| `plan` | pure TS read in `src/world/cloud-plan.ts` returning rows; a `plan` terminal verb + a console column | `fwRuleLines` shape (`cmd-run.ts:1652-1700`); `monitorBoard`/`projectPlan` read pattern | small |
| state file | `iac_*` fields + one `file` node re-rendered on apply | `src/world/fs.ts:519-571`, `filesystem.ts:122` | small |
| `apply` | a registry ACTION with a `when`-guarded op batch, NOT `applySetup` | `core-rs/src/ops.rs:1116`; refusal/guard idiom in `src/world/actions/project.ts` | medium (G4, G9) |
| apply out of hours | file a change request; the window is already baked | `change-request.ts:639-668`; `paperworkFor` already has a `PROJECT_ACTIONS.cutover` arm (`:275`) | **free** |
| apply-in-progress / multi-day | the E10 phase machine: derived-not-stored phase over baked due ticks | `PROJECT_PHASES` (`src/world/project.ts:74-80`), `projectSchedule` (`:159-178`), `projectStatus` (`:518-561`) | **free for a 3-day job** |
| drift detection | the same pure function; a `not(exists(where iac_drifted true))` gate for ticket resolution | `stagingGate` shape (`project.ts:266-309`) | small |
| drift whodunit | per-resource append-line `changed_by` trail planted by the ticket setup | `install_audit` / `break_glass_audit` (`fields.ts:396, :579`) | small |
| destroy | needs `remove_node` at action level, or a new `SetupMutation` variant | `ops.rs:1094` | small, but a core-rs edit |
| state lock | boolean + holder on the state file node, authored not emergent | `arc.ts` authored-coupling pattern | small |

---

## 3. Time and money

### 3.1 How money works today, precisely

- **One store, one unit.** `FIELDS.farmFund` on the player node
  (`src/world/fields.ts:22`), whole pence (`PENCE_PER_POUND = 100`,
  `src/world/day.ts:501`, with the doctrine at `:496-500`). There is no second balance
  anywhere.
- **Four write sites.** `DAY_ACTIONS.clockOff` (`src/world/actions/day.ts:900-906`),
  `endWeek` (`:864-870`), `reviewPassed` (+`PROBATION_BONUS_PENCE`, `:407-419`),
  `reviewRedundant` (`:519-531`). Nothing else moves it.
- **The payslip cannot be negative.** `daySlip` ends
  `net = Math.max(0, gross - deducted)` (`src/world/day.ts:601`). The only outgoing is
  vending spend, accrued on `FIELDS.consumableSpend` and applied as a payslip DEDUCTION
  clamped by gross (`day.ts:583-588`).
- **Rates:** `DAY_RATE_PENCE = 9_600` (`day.ts:504`), `CLOSED_TICKET_BONUS_PENCE = 250`
  (`:516`), `BREACH_DEDUCTION_PENCE = 400` (`:517`), `FARM_PRICE_PENCE = 24_500_000`
  (`:520`).
- **Timesheet and invoice are entirely non-monetary.** Zero pence references in
  `src/world/timesheet.ts` or `src/world/invoice.ts`; utilisation reaches the week card
  as a STRING deliberately (`src/world/week.ts:2151-2162`, `src/shell/day-driver.ts:2945`).
  The "invoice ladder" is a dispute escalation measured in minutes
  (`INVOICE_RUNGS`, `src/world/invoice.ts:338-345`), not a bill.

**G13. A surprise bill has nothing to hurt with.** With `net = max(0, ...)` the largest
possible consequence of any cost is "you earned nothing today", and then it stops. Three
honest options, all owner decisions:
- (a) **the employer eats it** - the bill lands on the week card and on standing /
  reputation, never on `farm_fund`. Cheapest, and truthful: a junior does not personally
  pay for a NAT gateway. Loses the sting.
- (b) **change the invariant** - allow `farm_fund` to fall. One line at `day.ts:601`
  plus the guards at `actions/day.ts:858-862, :890-898` (`param_is_whole_number banked >=
  0`), plus every place that assumes monotonic progress toward the farm
  (`farmProgress`, `day.ts:618-621`; the week card's `earnedPence = max(0, banked -
  opening)`, `week.ts:2244`). Real work, real teeth.
- (c) **the bill is a ticket, not pence** - a finance-department ticket with a deadline
  and a reputation consequence. Zero money work, and it is the funniest of the three
  ("So is the meeting about the bill" - the game's own roadmap card,
  `src/world/roadmap.ts:74-80`).

  INFERENCE: (c) for slice 1, (a) for the week card, and (b) only if the owner wants
  cloud to be the thing that can actually cost you the farm.

### 3.2 Accrual: where cost-over-time would live

**The only per-tick numeric accrual in the entire codebase is engine-side.**
`World::handle_tick` (`core-rs/src/world.rs:790-848`) increments `sla_deadline`,
`held_ticks` and `off_hours_ticks` on parked or off-hours tickets, holding the invariant
stated at `:788-789`: `sla_deadline == spawned_at + target + held_ticks +
off_hours_ticks`. It is called from `World::advance` at `:764`.

**TS never writes a field per minute, on purpose.** Every TS accumulator is a
watermark-plus-fold dispatched at a coarser boundary: meters fire only every fifth tick
(`METER_INTERVAL_TICKS = 5`, `src/world/meters.ts:23`, gate at `:570-574`, rationale at
`:11-15`); DND minutes fold between `dnd_billed_to` and now
(`src/shell/day-driver.ts:6267-6294`); timesheet segments are written only when the thing
being worked on CHANGES (`recordSegment` short-circuits an unchanged field,
`src/shell/day-driver.ts:4406-4408`).

**G14. Therefore cloud cost must be DERIVED, not accrued - and that is good news.** The
shape that fits the estate: `cost_per_hour` + a running-minutes ledger on the resource,
with the bill computed on read. This is the same "derive, never store" doctrine the
change-request status (`change-request.ts:314-319`) and the project phase
(`src/world/project.ts:508-517`) already follow, and it makes the number save-safe and
replay-identical for free.

The one thing that needs building: a **start/stop ledger** so a resource that was
stopped on Tuesday and restarted on Thursday bills honestly. That is the timesheet's
segment encoding exactly - `tick|kind|id|last` with an extend-in-place rule and a 600-line
cap (`src/world/timesheet.ts:122, :142-177, :222-251`) - and it should be reused rather
than reinvented. Cost: small.

The meter would be settled like the invoice ladder: a pure "what is due right now" read
called at `startShift` and `clockOff` (`settleInvoiceLadder`,
`src/shell/day-driver.ts:4673-4704`, called at `:2781` and `:2813`).

### 3.3 What "monthly" can honestly mean

Facts:
- The calendar is anchored at Monday 7 September 1998 (`WEEK_STARTS_ON`,
  `src/world/hours.ts:108-113`), rendered `DD/MM/YYYY` by `calendarDate`
  (`hours.ts:120-133`), UTC for determinism (`:121-123`).
- The week is five days, `WEEK_DAYS = 5`, `REVIEW_DAY = WEEK_DAYS`
  (`src/world/week.ts:75-79`). Saturday does not exist.
- **A cross-week grain EXISTS, and it is WEEKS.** `PressureSeason`'s beats are week
  numbers (`src/world/pressure.ts:422-439`), `EMPLOYER_ARC = { weeks: 12, ... }`
  (`:539-543`), position held in `FIELDS.arcWeek` (`src/world/fields.ts:55`).
  `arcDate(week, day) = calendarDate((week - 1) * 7 + day)` (`pressure.ts:925-931`)
  already maps arc weeks onto the real 1998 calendar, so weeks 1-4 are September, 5-8
  October.
- **There is no month grain anywhere.** The word "month" appears as a design unit in
  exactly one place - `validateArc` refusing two seasons in one arc, *"A merger and a
  redundancy round in the same month is real life and is unplayable"*
  (`pressure.ts:560-561`).
- **Every week is a fresh world**: a new graph, a new clock at tick 0, seeded from
  `WeekCarry` (`src/world/session.ts:68-123, :243-311`) and `CareerStanding`
  (`src/world/career.ts:76-89`). Nothing else crosses.

**G15. "Monthly bill" is not expressible today. Four honest options:**
- (a) **Weekly, called nothing** - a Friday line on the week card. Cheapest; loses the
  "£600/month for eight months" joke.
- (b) **Weekly, called the monthly run** - accrue in-week, bill at `endWeek`, and let the
  fiction call it the invoice run. The invoice system already says the line: *"It is on
  the invoice run now."* (`src/shell/apps/cmd-run.ts:1546`). Cheap, and nobody in a
  1998 accounts department would blink.
- (c) **Calendar-month, off the arc** - `arcDate` already dates arc weeks, so a bill
  fires on the arc week that crosses a month boundary. Costs a `WeekCarry` field for
  "billed through", an arc beat, and per-employer content. Honest and dated, but it
  needs E11's week-2+ content to be visible at all
  (`docs/research/week-generation.md:404-408`).
- (d) **The bill as a planted artifact** - a `file` or mail item describing eight months
  of accrual that happened before the player arrived. Zero engine work, keeps the joke
  whole, loses the causality (your own forgotten resource never bills you).

  INFERENCE: **(b) for the mechanic + (d) for the legacy joke.** (c) only after E11.

**G16. The bill needs a surface, and the mail thread already exists.** `invoiceThreads`
derives mail threads from state with nothing stored
(`src/world/invoice.ts:706-734`), spliced into the Mail app at
`src/shell/apps/mail.ts:52`. A cloud bill is one more derived thread. Free.

**G17. Money and time are two separate systems today, and cloud joins them.** The
timesheet meters minutes with no money in it; the payslip moves money with no minutes in
it. A cloud bill is the first artifact where a technical decision made at 11:04 on
Tuesday produces a number in pence on Friday. That is the interesting design in the epic
and it deserves to be named as such rather than filed under "billing alarms".

---

## 4. The console app

### 4.1 The contract

`AppDef` is six fields and one method (`src/shell/apps/types.ts:165-179`): `id`,
`title`, `icon`, `tier_required`, `slack`, `desktop?`, `mount(host, api)`. `mount`
returns `AppInstance { unmount(); receiveIntent?() }` (`:37-45`). `GameApi` (`:47-163`)
hands the app `graph` (read-only), `dispatch`, `clock`, `appState`, `day`, `notify`,
`openApp`, `actor`.

`APP_MANIFEST` (`src/shell/apps/index.ts:43-94`, 27 entries) runs through `loadManifest`
which validates and freezes (`src/shell/apps/manifest.ts:15-35`) and
`assertCaughtScenes`, which **throws at boot if a `slack: true` app has no caught scene**
(`src/world/scenes/caught.ts:368-381`). Window id equals app id
(`src/shell/launch.ts:13-15`); the window model is a pure reducer
(`src/shell/wm.ts:258-677`) with an invariant assert on every mutation (`:620-669`).

The read API is five methods with no where-clause: `getNode`, `getField`, `nodesOfKind`,
`allNodes`, `neighbors` (`src/engine-api/types.ts:123-136`). All filtering is TS
`.filter()`. Fine for a list of 40 resources.

### 4.2 What a console costs

**G18. The coverage manifest is the real price of a new app.** `COVERAGE` is 344 entries
(`src/shell/coverage.ts:186-3808`) and two gates hang off it:
- `coverage.test.ts:186` demands **set EQUALITY** between window-entry surfaces and
  `APP_IDS`, plus route rules (`:203-216`), plus `does` longer than 20 characters
  (`:128`), plus a `why` for anything outside the week run (`:147`);
- `e2e/total-walk.spec.ts:6015` demands `walked.size === COVERAGE.length` against the
  BUILT artifact, and `:6031-6046` demands every on-screen `data-testid` be declared in
  `PLAYER_CONTROLS` (`coverage.ts:4089-4295`).

  Empirical range: `monitor` is a whole app for **1** coverage entry plus 2 control
  families (`coverage.ts:3426-3442`, `:4193-4194`) because its verbs are driven in unit
  tests; `cmd` is 87 entries. A read-mostly console with a region filter and a couple of
  verbs lands nearer `events` (3 entries + 2 control families,
  `coverage.ts:1647-1669`, `:4166-4167`).

**G19. The region-filter shape is already built, in Event Viewer.** `events.ts` has a
`<select class="os-select">` with testid `events-filter` (`src/shell/apps/events.ts:110-111`),
an "Everything" sentinel (`:113-116`), a master list of machines beside the filtered rows
(`:131-135`), and the filter itself is three lines (`:144-148`). A cloud console's
region selector is that, verbatim. Note it is NOT persisted - no app persists a filter
into `AppState`; adding persistence costs a slice at `src/shell/app-state.ts:260-289`
plus `parseAppState` (`:605`) plus save round-trip (`:684`, `:694`).

**G20. The Browser is the cheaper host, and it is `slack: true`.** A `BrowserSite` is
`{id, title, url, page}` (`src/shell/apps/browser-sites.ts:78-84`), registered in a frozen
array (`:410-415`); the toolbar and bookmarks are generated from the registry
(`src/shell/apps/browser.ts:270-279`, `:109-115`), so a new site reusing an existing page
kind (`forum | gallery | store`) is **one file edit and one coverage entry**. A new page
kind costs a render function plus an arm in `renderPage` (`:224-242`).

  But `BROWSER_APP` is `slack: true` (`src/shell/apps/browser.ts:249`), which means the
  boss key minimises it (`minimizeSlackWindows`, `src/shell/wm.ts:572`) and being caught
  in it is a conduct event. **A work console inside the skiving browser is wrong both in
  fiction and in mechanics.**

  Recommendation: **split by what the thing IS.** The provider's *marketing site*, its
  *pricing page* and its *status page* are browser sites - one file each, free comedy,
  and the status page is mechanically useful (`modern-stack.md` names status-page
  publishing as a flood counter). The *console* is its own `AppDef`, `slack: false`,
  gated on `FIELDS.playerTier`, list-over-`nodesOfKind` with the `events.ts` filter.
  Total: one app + N sites.

**G21. `tier_required` cannot gate the cloud console.** See G27 - it is a different,
inert axis. The console gates by reading `FIELDS.playerTier` inside the app, the
`src/shell/apps/projects.ts:225-237` precedent (a mounted app that renders a refusal).

---

## 5. Provider dialect and naming

### 5.1 The estate's real rule for real-vs-parody

The written rule, `docs/research/modern-stack.md:14-15`:

> Rules of use: model the FIELDS and WORKFLOWS, not the vendors. No real product names
> in-game (parody names over real mechanics).

The rule the SHIPPED CODE actually follows is narrower, and it is a better rule:

1. **Proprietary desktop platforms and their trade dress -> parodied.** `DeskPro
   WorkGroup 98¾` (`src/shell/skins.ts:440`), `Orchard 15` (`:868`), `DeskPro BIOS 0.98¾`
   (`src/shell/boot-screen.ts:37`). The line is stated in code at `skins.ts:43-47`:
   *"The menu bar, the dock and the button side are interface LAYOUT - functional facts
   anybody may draw ... No logo, no wordmark ... **The name is a parody name.**"*
2. **Free/open-source distros, DEs and tools -> real, verbatim.** Ubuntu 24.04 LTS,
   Debian 12 (bookworm), Fedora 41, RHEL 9, openSUSE Leap, Arch (`skins.ts:331-388`);
   KDE/GNOME/Cinnamon/MATE/Xfce/LXQt (`:475-786`); systemd's own state strings stored
   verbatim (`src/world/fields.ts:2080-2084`); apt/dnf/zypper/pacman (`skins.ts:302`);
   SELinux (`src/world/selinux.ts:2`).
3. **Employers, customers, in-house apps, websites -> always invented.** `Workgrumble
   Ltd`, `Bodgeworth & Batch`, `Fettle & Crane Managed IT`, `Halcyon Grange Holdings`
   (`src/world/employers.ts:158-259`); `Hubbub` (`src/shell/apps/hubbub.ts:75`);
   `Active Dictionary` (`src/shell/apps/directory.ts:247`); every site on `.invalid`
   (`src/shell/apps/browser-sites.ts:89, 178, 240, 345`).
4. **Third-party products the player DIAGNOSES but does not brand-choose -> real, hedged
   as a class.** `'Dentrix-class PMS with a DEXIS-class imaging bridge'`
   (`src/world/fields.ts:2133`); Okta shipped as literal group names
   (`src/world/msp-company.ts:1451-1452`) but presented in the KB as an interchangeable
   list, `'An estate using Okta (or Entra ID / OneLogin)'`
   (`src/world/kb/articles.ts:1132`, `:1201`).
5. **Real outages cited as cautionary fact in KB prose -> allowed.**
   `'This is the trap worth learning, and it took down O2 and Microsoft Teams'`
   (`src/world/kb/articles.ts:1683`).

**Where cloud providers sit: category 1.** A provider is a platform you buy into, whose
console chrome IS the joke, and whose parody name carries the comedy. That confirms
issue #8's instinct. The naming CONVENTION should follow `DeskPro`/`Orchard`/`Hubbub`: a
plain English noun, mundane, with a version or a suffix - not a portmanteau. On that
evidence "Nimbus-WS / Cerulean-portal / Giga-platform" as literal names are off-house-style
(they read as jokes about the real names rather than as things a 1998 company would ship);
the epic's *classes* are right and the strings want a pass.

### 5.2 The cloud vocabulary already in the shipped world

Zero non-test hits anywhere in `src/` for `aws`, `amazon`, `azure`, `gcp`, `s3`, `ec2`,
`iam`, `terraform`, `vpc`, `m365`. **The provider namespace is completely unclaimed.**

What IS shipped:
- `saas` is a first-class `BUSINESS_TYPES` value (`src/world/fields.ts:2105`) with the
  label `'SaaS company'` (`:2157`) and the note *"Mac/Windows laptops in the office, a
  Linux product fleet in the cloud"* (`:2104`).
- **`MERIDIAN-SAAS` is a shipped MSP customer** (`src/world/msp-company.ts:116-117`)
  whose production box's `processor` reads `'A cloud instance running the product
  Meridian sells'` (`:743`).
- Fettle & Crane's own tooling likewise runs on `'A cloud instance'` (`:1545`), and one
  ticket already turns on *"a port a cloud service calls back on that was opened for a
  pilot and kept"* (`:986`).
- The in-game roadmap already promises the epic, in the game's own voice
  (`src/world/roadmap.ts:74-80`): *"somebody else's computers, billed by the minute,
  configured by describing what you want and hoping it matches what you get. The bill is
  a gameplay mechanic. So is the meeting about the bill."*

**G22. The hook already exists - use MERIDIAN-SAAS, do not invent a customer.** The world
has already said in shipped prose that this customer's product runs in the cloud. Making
their estate the first cloud estate costs nothing in fiction and earns continuity.

**G23. Three noun collisions, all load-bearing.**
- `bucket` = the timesheet's key (G1).
- `tenant` = the MSP wrong-customer guard, with a player-facing line
  (`src/world/customers.ts:328`: *"Are you in the right customer? Acting in the wrong
  tenant is the MSP horror"*) and enforcement across
  `src/shell/apps/cmd-run.ts:401-505`. This one is *coherent* - the shipped meaning is
  already the identity-tenant sense - so it should be kept, not renamed.
- `account` and `project` are both taken NODE KINDS
  (`core-rs/src/schema.rs:18, :62`), which removes the two obvious names for a cloud
  billing boundary. `subscription` and `organisation` are free.

**G24. There is no precedent for parodying a SERVICE, only an OS or an app.** Every
parody name in the estate is a product you install (`DeskPro`, `Orchard`, `Hubbub`,
`Download Depot`). A provider is a company plus a platform plus a console plus a bill,
and it needs a naming convention decision covering all four surfaces at once, or the
console will end up calling the same thing three names.

### 5.3 One dialect: AWS-shaped, with a carve-out

**Confirm AWS-shaped for the RESOURCE plane.** Four reasons:
1. **The incident literature the epic wants is AWS-shaped.** The public-bucket breaches
   with named victims and the 4%/42% figures (`modern-stack.md:269-283`); the NAT gateway
   as *"the star of the genre"* with the £600/month-for-eight-months and $10k-weekend
   anecdotes (`:284-292`); terraform state, drift and the 2am console edit
   (`:301-315`). All five ranked additions P3.1-P3.5 (`:319-337`) are written in that
   dialect.
2. **It is where the IaC model lives.** Terraform/OpenTofu plan-review-apply and the
   state file are the mechanic; that is the AWS-adjacent culture.
3. **The estate's parody convention is one platform drawn hard, not three sketched.**
   `DeskPro` and `Orchard` are complete caricatures with their own chrome, fonts and
   refusal voices. Three half-consoles would repeat the mistake 0.28.0 explicitly avoided
   with distros - each of the seven distros got real package managers and real quirks
   rather than a label.
4. **The second provider is only funny once the first is fully drawn** - a worse copy of
   a thing the player knows.

**The honest counter-argument, and the carve-out.** An MSP in this fiction would be a
Microsoft partner far more often than an AWS one: the shipped MSP already runs
Okta-class identity (`msp-company.ts:1451-1452`), and the customer scope model is
explicitly cited as coming from Azure Lighthouse / GDAP / PAM tiering
(`src/world/customers.ts:222`). So: **one dialect on the resource plane (AWS-shaped
compute/storage/IAM/IaC), and the identity plane stays exactly where it already is**
(Okta-class, shipped, unchanged). One console, two planes, no second dialect.

**G25. The per-provider dated research spike is still a blocking gate** (issue #8; the
standing `epics need data scoped` rule). Nothing in this document substitutes for it -
this is an engine-fit pass, not a provider spike.

---

## 6. Tier gating

### 6.1 How the E6 gate actually works

- **`PLAYER_TIERS` has exactly two members**: `serviceDesk: 'service_desk'`,
  `systemsEngineer: 'systems_engineer'` (`src/world/fields.ts:2048-2051`), labelled in
  inverted PAM order - `'Service Desk (Tier 2)'`, `'Systems Engineer (Tier 1)'`
  (`:2056-2057`). Doc at `:2039-2047`: *"The crossing is ONE-WAY."*
- **One action writes it**: `CAREER_ACTIONS.acceptPromotion`
  (`src/world/actions/career.ts:41-86`), gated at `PROMOTION_REPUTATION = 70` (`:33`,
  enforced `:60-70`), refusing a second crossing (`:51-56`), writing `player_tier` and
  `title` (`:72-85`). Confirmed sole writer at `src/world/fields.ts:2063-2064`.
- **Eight gate sites read it**: ssh (`src/shell/apps/cmd-unix.ts:927`), the `fw`/project
  verbs (`src/shell/apps/cmd-run.ts:1371`), the Projects app
  (`src/shell/apps/projects.ts:225-237`), the Linux/Mac desktop choice
  (`src/shell/desktop.ts:820-836`), on-call (`src/world/on-call.ts:289-291`), the
  timesheet SHAPE (`src/world/timesheet.ts:654-656`), the utilisation target
  (`:830-833`), the first incident (`src/shell/day-driver.ts:4041-4042`).
- **There is no tier 3 anywhere in code.** Higher rungs exist only as unbuilt design
  (`docs/design/titles-difficulty.md:25-33`).

**G26. `isSystemsEngineer` is a boolean, not an ordering.** `isSystemsEngineer` is a
strict equality test (`src/world/fields.ts:2075-2077`), so every one of the eight gate
sites asks *"is engineer"*, never *"is at least engineer"*. **Adding a third rung means
auditing all eight for ordering semantics**, or a cloud-tier player silently loses ssh.
Small, easily missed, and it is the kind of thing that ships green and breaks in play.

**G27. `tier_required` is a different, inert axis.** `AppDef.tier_required`
(`src/shell/apps/types.ts:169`) is filtered against `engine.tier()`
(`src/shell/apps/manifest.ts:37-47`), and `engine.setTier` is called **exactly once**,
with `HELPDESK_TIER = 1`, at world build (`src/world/session.ts:265`,
`src/world/actions/helpers.ts:9`). Every shipped app is 0 or 1. **The promotion does not
move it**, so no app changes visibility on promotion today. A cloud app must gate by
reading `FIELDS.playerTier` in its mount, per the Projects precedent.

### 6.2 Is cloud a rung or a content pack?

The design record answers this twice, and the two answers are not identical.

`docs/design/titles-difficulty.md:138-140`, **D3, decided by the owner 2026-08-09**:

> **D3 - DECIDED (owner, 2026-08-09): yes, Systems Engineers do projects too.**
> E10 builds standalone, sequenced before E7; E7 ships as a content pack over it.
> First content: the firewall replacement at the MSP.

and `:105-107`:

> E7 cloud then ships as designed (tickets, per the modern-stack research) PLUS one
> cloud-migration project authored on this machine - terraform plan/apply becomes the
> phase readout for free.

But `docs/design/e6-sysadmin.md:94-98`:

> SRE/DevOps = automation replacing toil (cloud consoles, IaC, error budgets, code that
> manages systems). Explicitly the NEXT unlock, defined by automation not by deeper
> access. E6 is manual/scripted server ops + on-call + change control.

**G28. D3 makes E7 content on the Engineer tier; e6-sysadmin.md calls devops "the NEXT
unlock". Both can be true, but only if somebody says which.** The reading that costs
least and contradicts neither: **E7 slice 1 is CONTENT on the Engineer tier** - no new
`PLAYER_TIER`, no ladder work, gated exactly like Projects - and the third rung is E9's
business, where the owner has already asked for IC specialisation tracks *"the security /
infra / cloud flavour of senior"* (`titles-difficulty.md:144-148`, D5). E7 then supplies
the CONTENT that a future cloud-flavoured senior rung is made of, rather than inventing
the rung itself. INFERENCE, and it wants a one-line owner confirmation (D-E7-7).

Note also `docs/research/week-generation.md:404-408`: **E11 is the enabling epic for
cross-week projects.** A cloud migration that spans weeks is blocked on it; a 3-day
cloud project inside one week is not (`PROJECT_DAYS = 3`, `src/world/project.ts:189`;
the week-fit gate at `src/shell/day-driver.ts:4047-4051`).

---

## 7. Gap index, ranked by cost

| # | Gap | Cost |
| --- | --- | --- |
| G13 | Player money cannot go down; a surprise bill has no teeth | **large (design)** |
| G15 | No month grain; five-day week; each week a fresh graph | **large (design)** |
| G7 | No diff function exists anywhere | medium |
| G9 | `applySetup` bypasses the registry - no audit, no billed minutes | medium |
| G18 | Coverage-manifest cost of a new app (equality gates) | medium |
| G26 | Tier is a boolean, not an ordering - 8 sites to audit for a 3rd rung | medium |
| G28 | D3 vs e6-sysadmin.md: content pack or new rung | medium (decision) |
| G14 | Cost must be derived + a start/stop ledger built | small-medium |
| G2 | No region dimension, and it must be a world-layer read, not a console filter | small-medium |
| G1 | No storage kind; `bucket` is taken by the timesheet | small |
| G4 | `SetupMutation` has no `removeNode` | small |
| G5 | Setup `RemoveEdge` is tolerant where an apply needs strict | small |
| G10 | Dispatch log drained nightly - whodunit needs an on-node trail | small |
| G11 | State file placement; a lock must be authored, not emergent | small |
| G3 | No set-valued field; tags need the encoded-line convention | small |
| G20 | Browser is `slack: true` - a console site would be skiving | small |
| G21 | `tier_required` cannot gate the console; read `playerTier` | small |
| G23 | `bucket` / `tenant` / `account` / `project` name collisions | small |
| G24 | No precedent for parodying a SERVICE (only OSes and apps) | small |
| G6 | Minimum new-kind set undecided | decision |
| G8 | Plan output must be TS, not `Expr` | (constraint, not work) |
| G12 | The concrete plan/apply/drift mapping | (the build) |
| G16 | Bill surface - the mail thread is free | trivial |
| G17 | Money and time are separate systems; cloud joins them | (the point) |
| G19 | Region filter shape already built in Event Viewer | trivial |
| G22 | Use MERIDIAN-SAAS, do not invent a customer | trivial |
| G25 | Per-provider dated spike still a blocking gate | (process) |
| G27 | `tier_required` axis is inert | (fact) |

---

## 8. Open questions for the owner

Sharp, decidable, D-E7 candidates.

- **D-E7-1 - One dialect: AWS-shaped resource plane, identity plane unchanged?** My
  recommendation is yes (section 5.3). The counter-case is that an MSP is a Microsoft
  partner and the shipped scope model already cites Azure Lighthouse
  (`src/world/customers.ts:222`).
- **D-E7-2 - The provider's name and naming convention.** House style is a mundane
  English noun with a version (`DeskPro`, `Orchard`, `Hubbub`). Issue #8's
  "Nimbus-WS / Cerulean-portal / Giga-platform" read as jokes about real names rather
  than as things a company would ship. One provider now, or one plus a worse copy later?
- **D-E7-3 - Does a cloud bill move `farm_fund`?** (a) employer eats it, (b) change the
  `max(0, ...)` invariant at `src/world/day.ts:601`, or (c) the bill is a ticket and a
  reputation hit. This decides whether E7 is a content pack or an economy change.
- **D-E7-4 - What is "monthly"?** Weekly-called-monthly (cheap), calendar-month off the
  arc (needs a carry and E11), or a planted artifact (zero engine, no causality).
- **D-E7-5 - Console as its own app, or as browser sites?** The Browser is `slack: true`.
  My recommendation is one non-slack console app plus N browser sites for the marketing,
  pricing and status pages.
- **D-E7-6 - The storage noun.** `bucket` belongs to the timesheet and is player-facing.
  Rename the cloud thing, or rename the timesheet's?
- **D-E7-7 - Content pack on the Engineer tier, or a third rung?** D3 says content;
  `e6-sysadmin.md:94-98` says next unlock. If a third rung, G26's eight gate sites need
  ordering semantics.
- **D-E7-8 - Is the state file diegetic?** A `file` node the player can read, lose and
  corrupt, or engine bookkeeping the player never sees. The first is more fun and costs
  a little more.
- **D-E7-9 - Does the first cloud project fit in one week (3 days, like Arden), or wait
  for E11's week-2+ content?** The truthful cloud migration is weeks-to-never
  (`titles-projects-engine.md:455`), which argues for waiting; the shipped phase machine
  argues for shipping.
- **D-E7-10 - MERIDIAN-SAAS as the cloud estate, or a new customer?** The world already
  says Meridian runs in the cloud (`src/world/msp-company.ts:743`).

---

## 9. Slice ladder, if the epic gets a GO

**Spike 0 (blocking, not a build slice).** The dated per-provider research spike into
`docs/spikes/`, per issue #8 and the standing data-scoped rule. Real console screens,
real resource fields, real bill line items, real drift messages.

**Slice 1 - the estate and the console, read-only.** MERIDIAN-SAAS's cloud estate as
`machine` / `service` / `group` / `account` nodes with `provider` + `region` +
`cost_per_hour` fields, plus at most one new kind for storage (G6). A non-slack,
`playerTier`-gated Console app: list over `nodesOfKind`, the `events.ts` region filter,
grouped by resource class. Two browser sites (the provider's marketing page, its status
page). Content: **P3.4, the security-group / IAM access request** - the password-reset of
cloud, on existing verbs and existing edge kinds. No new grammar, no new money.

**Slice 2 - plan and drift, read-only.** `iac_*` declared fields; a pure TS diff in
`src/world/`; a `plan` terminal verb and a drift column in the console; the state file as
a `file` node. Content: **P3.1, the drift whodunit**, with a per-resource `changed_by`
append-line trail planted by the ticket's setup (G10). Gate: a ticket resolving on
`not(exists(where iac_drifted true))`.

**Slice 3 - apply.** A registry ACTION with a `when`-guarded op batch (G4, G5, G9), so
the dispatch log sees it and the timesheet bills it. A production apply files a change
request and waits for the window - free, already built. This is the slice where the
educational arc lands: an apply you have to read before you run.

**Slice 4 - money.** Derived cost from `cost_per_hour` plus a start/stop ledger reusing
the timesheet segment encoding; the bill as a Friday item on the week card and a derived
mail thread; the billing alarm as the counter-verb. Content: **P3.3, the surprise bill**,
and the cost-by-tag view that is useless because nothing is tagged. Blocked on D-E7-3 and
D-E7-4.

**Slice 5 - the cloud project.** One migration authored on the E10 phase machine, whose
phase readout IS the plan diff. Three days inside a week, or cross-week if E11 has
landed (D-E7-9).

**Slice 6 - content only.** **P3.2, the public bucket** (one hosts the website, one holds
HR exports - a judgment call, not a fix); KB honest-explanation articles for terraform /
YAML / docker, with the staleness jokes; the Assistant's reincarnation as
AI-in-everything (E2). No engine work.

Slices 1-2 are the honest test of the epic's premise: if the plan readout is not fun to
read, the rest of the epic is a cost centre.
