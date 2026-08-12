# E11 spike: the week generator - pools under authored constraints

Research + analysis, 2026-08-09. Read-only pass over `/home/kasm-user/repot/workgrumble` at v0.29.0 (`801c05c`), plus web research.

Spike for E11 (issue #51). Every claim about the repo is a FACT read off the code at the `file:line` given. External claims are labelled **FACT** (published source, URL given) or **FOLKLORE** (practitioner lore / my own reasoning, no hard source). Regular hyphens throughout.

Contents: **0** recommendation - **Part 1** (1 how a week is authored - 2 the survivability invariants, I1-I52 - 3 pool-shaped vs pinned - 4 determinism seams - 5 the career carry) - **Part 2** (6 what the good ones do) - **Part 3** (7 the design - 8 week 2+ and the estate - 9 slice plan - 10 owner decisions).

---

## 0. Recommendation up front

**The proposed design is right, with three corrections and one addition.**

1. **Right:** pools + pinned beats is the pattern every content-heavy sim that survives repeat play actually uses. The repo is unusually ready for it - the week is already pure data, the loader already refuses quiet wrongness, the schedule is already a pure function of `(seed, day, key)`, and there is already a *worst-schedule feasibility auditor* (`auditDayTiming`, `solvability.test.ts:637`) that is 90% of the week-level survivability gate a generator needs.
2. **Correction 1 - the unit of sampling is not the ticket, it is the DAY SHAPE.** Sampling tickets into days is how you get two weeks with wildly different load. Sample a *day template* (a load budget + category quotas + slot layout), then fill its slots from pools. That is Against the Storm's glade-modifier composition and RimWorld's threat-points budget in the same move, and it is the only way the existing `load: 1..4` column stops being decorative.
3. **Correction 2 - `load` is currently a comment.** It is read by exactly one assertion (`week.test.ts:150`) and nothing else. Before a generator can budget against it, `load` has to become real arithmetic tied to the breach math. That is slice 1, and it is worth doing even if E11 stopped there.
4. **Correction 3 - the pinned-beat model must be a CALENDAR, not a day number.** Arcs are two coupled tickets two days apart (`arc.ts`), the project needs 3 consecutive working days (`project.ts:186`), org-dysfunction beats want an escalating order. Pinning "Tuesday" is too weak; pin *relations* (X on day D, Y on D+2, both at the same minute) and let the generator solve the placement.
5. **Correction 4 - constrain the DRAW, do not enlarge the pool.** This is the highest-leverage finding in the external research and it makes the epic materially cheaper. Uniform sampling needs a pool roughly 20x the per-session draw count before repeats stop being noticeable (section 6.5's arithmetic: ~95 entries just to keep a single week's repeat chance under 10%). No shipped game pays that. Slay the Spire uses a 3-encounter exclusion window, Left 4 Dead a shuffle bag with no successive repeats, Tetris a 7-bag with a hard 12-piece worst-case gap, RimWorld per-incident cooldowns of 8 to 140 days. With a 3-week recency window, a drip pool of **50-60 per employer** makes a repeat inside three weeks structurally impossible - roughly a 2-3x expansion of what each employer has now, not a 5x one.
6. **Addition - the golden does not die, it splits in three.** One pinned-seed byte-golden (regression), one property sweep over the seed space (survivability, budget, quotas), one committed *distribution* table (the five-skill-level balance table generalised: the mark a worked week earns must stay in a band across seeds). Section 7.3.
7. **One implementation warning with a 2026 citation.** Slay the Spire 2 shipped correlated PRNG streams because per-system generators derived from one run seed were not independent. This repo's spreader is FNV-1a with no finalizer over *additively* related seeds (`day.ts:194-202`, `session.ts:55`, `week.ts:2112`) - exactly that shape. Domain-separate the streams, derive `weekSeed` by hashing the tuple rather than summing it, and add a finalizer before the modulo. Section 6.9.

**The prize is bigger than variety.** `EMPLOYER_ARC` declares every employer as a **twelve-week** job with a redundancy round at weeks 4-10 (`pressure.ts:526-543`), and the game ships one week of the twelve. The whole systemic layer - nine catalogued pressures, the four-beat contract, the selection matrix, the `redundant` ending - is shipped, tested and **unreachable in play**, because no career reaches week 4. E11 is the only thing between that subsystem and a player.

**Week 2+ answer:** same employer, week N+1, with the estate PERSISTING (a machine fixed last week stays fixed) and the week generator forbidden from sampling a ticket whose fault the graph already holds as fixed. Argument both ways in section 8; the honest answer interacts with the fiction and the fiction wins here.

**Biggest risk, named:** the worst-schedule auditor is hardcoded to the probation week (`solvability.test.ts:613, :675` both call `dayPlan(day)` / `interruptionPlanFor(day, seed)` with the default `WEEK`). Bodgeworth, the MSP and Halcyon have NEVER been through it. Generalising it to take a week is a prerequisite, not a nice-to-have, and it will probably find existing defects in the three unaudited weeks.

---

# Part 1 - the repo as it stands

## 1. How a week is authored today

### 1.1 The shape

`DayScript` (`src/world/week.ts:492-600`) is the per-day content table. Fourteen columns:

| Column | `week.ts` line | What it schedules | Pool-shaped? |
| --- | --- | --- | --- |
| `day: number` | `:493` | 1..5, must equal index+1 | structural |
| `label: string` | `:495` | "Monday".."Friday" | structural |
| `inherited: string[]` | `:497` | queue at 08:00, **max 2** | **poolable** |
| `drip: DripSlot[]` | `:499` | mid-shift arrivals with a minute each | **poolable** |
| `incidents?: IncidentSlot[]` | `:501` | world changes, no jitter | pinned (arc clue) |
| `dms?: DmSlot[]` | `:503` | favour-or-form conversations | **poolable** |
| `interruptions?: InterruptionSlot[]` | `:518` | screen takeovers | **poolable, quota'd** |
| `walkUps?: WalkUpSlot[]` | `:529` | interruption + an ask | **poolable, quota'd** |
| `noHello?: NoHelloSlot[]` | `:531` | "Hi." then a typing indicator | **poolable** |
| `channels?: ChannelMessageSlot[]` | `:543` | Hubbub room posts | **poolable (coupled)** |
| `requests?: LinkedRequestSlot[]` | `:556` | one question in 3 windows | **poolable (coupled)** |
| `afterHours?: AfterHoursSlot[]` | `:566` | overnight pings, read next morning | **poolable** |
| `onCall?: OnCallPage[]` | `:580` | pager fires, engineer tier only | **poolable, quota'd** |
| `onboarding?: OnboardingSlot[]` | `:591` | a customer signs mid-shift | pinned (arc capstone) |
| `patrolSeed: number` | `:597` | twist on the world seed for the lead's rounds | derivable |
| `load: number` | `:599` | 1..4, "the ramp, written down" | **the budget knob** |

Four shipped weeks, one per employer, registered in `employers.ts`:

- `WEEK` - the probation shop, `week.ts:625-1088`, registered `employers.ts:163`. 28 tickets.
- `SECOND_WEEK` - Bodgeworth, `second-week.ts:38-224`, registered `employers.ts:203`. 5 tickets, one event day.
- `MSP_WEEK` - Fettle & Crane, `msp-week.ts:88-201`, registered `employers.ts:234`. ~17 tickets + 2 pager nights + 1 onboarding.
- `CORPORATE_WEEK` - Halcyon Grange, `corporate-week.ts:36-219`, registered `employers.ts:264`. 9 tickets, all org-dysfunction beats.

### 1.2 Drip slots and the two ways to say "when"

`DripSlot` (`week.ts:321-343`) carries **exactly one** of `minute` or `arrivesMinutesBeforeClose`. `dripMinute` (`:353`) is the single reader; `arrivesBeforeClose` (`:359`) is the "4:55 class" flag. The loader refuses both fields and refuses neither (`requireDripSlot`, `:1552-1595`), refuses `before < 1` (`:1578`, nought = the minute the shift ends = a ticket with no day left) and `before > SHIFT_MINUTES` (`:1588`).

Placement: `buildDaySchedule` (`day.ts:228-271`). An ordinary drip is `tickAtMinute(day, minute) + seededOffset(seed, day, ticketId, DRIP_JITTER)`, clamped into `dripWindow(day)`. A pinned one gets no jitter and is clamped only to the shift.

Windows (`day.ts:163-168, :210-215`):
- `DRIP_OPENS_AFTER = 30` - nothing new in the first half hour.
- `DRIP_CLOSES_BEFORE = 90` - nothing in the last 90 minutes; "a ticket you cannot start is a cheat".
- `DRIP_JITTER = 12` - +/- 12 minutes off the authored minute.

### 1.3 Patrol seeds

`patrolSeedFor(day, worldSeed, week)` = `(worldSeed + script.patrolSeed) >>> 0` (`week.ts:2107-2113`). Monday is authored `patrolSeed: 0` in all four weeks, so Monday takes the world seed as it comes and is "the day every other schedule is read against" (`week.ts:594-597`, asserted `week.test.ts:230-235`). The other four are arbitrary primes chosen per week (probation `1301/5927/8803/2141`; Bodgeworth and the MSP share `1699/4057/6421/2939`; Halcyon `3137/5501/7919/2357`).

`buildPatrolSchedule(day, seed)` (`boss.ts:208`) spreads `PATROLS_PER_DAY = 3` visits (`boss.ts:40`) across `[shift.from + 45, shift.to - 45]` (`boss.ts:43-45`) with `PATROL_JITTER = 18` (`:47`), pushing any that land in lunch to after it. Being caught costs `CAUGHT_MINUTES = 10` (`boss.ts:88`).

### 1.4 The ramp, and why it is currently decorative

`load` is documented as "how heavy the day is MEANT to be, 1-4. The ramp, written down" (`week.ts:598-599`), and the file header says it is "deliberately ahead of the roster: five tickets spread across five days is a thin week, and the numbers say what the week is FOR" (`week.ts:21-24`).

**It is read by exactly two things.** The loader checks it is a positive safe integer (`week.ts:1157-1159`), and one test asserts Monday < Thursday and that days 1-4 are non-decreasing (`week.test.ts:150-155`). Nothing in the simulation, the scheduler, the scorecard or the review touches it. It is an authorial intent field with no arithmetic behind it.

Shipped ramps:

| Employer | Mon | Tue | Wed | Thu | Fri | tickets/day |
| --- | --- | --- | --- | --- | --- | --- |
| probation | 1 | 2 | 3 | 4 | 2 | 4 / 4 / 6 / 5 / 4 |
| Bodgeworth | 1 | 2 | 3 | 2 | 1 | 2 / 1 / 1 / 1 / 0 |
| MSP | 3 | 3 | 3 | 3 | 3 | 4 / 4 / 4 / 4 / 3 |
| Halcyon | 1 | 2 | 4 | 4 | 1 | 1 / 1 / 3 / 3 / 1 |

Note the MSP's flat 3 and Bodgeworth's Friday 1 with zero tickets. The column already disagrees with itself across employers, which is what an unenforced field does.

### 1.5 Inherited tickets

`MAX_INHERITED = 2` (`week.ts:82`), enforced at `week.ts:1168-1175` with the reason written into the error: "A queue of four before nine o'clock is not a working day, it is a punishment for logging on, and it is what the first build shipped."

Monday's pile is separately spawned at session creation from `employer.mondayTicketIds()` (`session.ts:272-274`), which reads day 1's `inherited` (`employers.ts:168, :211, :239, :269`). Days 2-5's piles are spawned by the driver at the day boundary.

### 1.6 The pre-shift gap (the load-arithmetic lesson)

Tick 0 is 08:00; the shift starts at 09:00 (`hours.ts:19-33`). A ticket inherited at 08:00 therefore has an hour of clock before anybody is paid to look at it. Two places settle this and they must agree:

- **The clock.** `ticketClocks` computes `responseDueAt = serviceDeadline(spawnedAt, target.response)` in *business* minutes, so "a ticket inherited at 08:00 owes its first word by half past nine, not by half past eight with the office still dark" (`sla.ts:200-205`).
- **The feasibility gate.** `dealtOn` sets `workableFrom: Math.max(arrival.tick, shiftStartTick(day))` - "a ticket inherited at eight o'clock is a ticket nobody is paid to look at until nine" (`solvability.test.ts:622-627`).

An untriaged ticket is treated as P3 (`UNTRIAGED_PRIORITY = 3`, `priority.ts:114`) with a 60-minute response / 240-minute resolution target (`SLA_TARGETS`, `priority.ts:107-112`), or the tier ladder if it belongs to a customer (`TIER_SLA_TARGETS`, `priority.ts:148-167`; Gold P1 = 10/45, Bronze P4 = 240/480). `UNTRIAGED_SLA_TICKS` (`priority.ts:205`) is the resolution budget every in-house ticket spawns with, and content is required to name it rather than a number of its own - "a ticket written with its own `sla_ticks` is a ticket whose two clocks disagree" (`priority.ts:196-204`).

**Generator consequence:** a morning pile of 2 untriaged in-house tickets consumes 2 x 60 = 120 response-minutes of a 480-minute shift before the first drip lands, and the response clock is running from 08:00 while the workable window starts at 09:00. Any load budget has to be expressed in *business minutes of committed clock*, not in ticket counts.

---

## 2. What makes a week survivable by construction

Everything below is an invariant a generated week must preserve. Grouped by where it is enforced.

### 2.1 `validateWeek` - the boot-time loader (`week.ts:1116-1522`)

Called at MODULE LOAD by all four weeks (`week.ts:625`, `second-week.ts:38`, `msp-week.ts:88`, `corporate-week.ts:36`). Takes the employer's valid room-id set as a second argument (`week.ts:1127-1129`).

| # | Invariant | Line | Failure it prevents |
| --- | --- | --- | --- |
| I1 | Exactly `WEEK_DAYS = 5` scripts | `:1131` | a four-day week |
| I2 | `script.day === index + 1` | `:1147` | a mis-numbered day |
| I3 | Non-empty `label` | `:1153` | an unnamed day |
| I4 | `load` is a safe integer >= 1 | `:1157` | "a day with no difficulty on it" |
| I5 | `patrolSeed` is a safe integer >= 0 | `:1161` | a non-deterministic patrol |
| I6 | `inherited.length <= MAX_INHERITED` (2) | `:1168` | the morning-pile punishment |
| I7 | Each drip slot says when exactly once | `:1552-1595` | two answers / `?? 0` at 09:00 |
| I8 | Non-pinned drips inside `dripWindow(day)` | `:1193-1204` | a ticket nobody could start |
| I9 | Pinned (4:55 class) drips inside the SHIFT | `:1188-1190` | a 17:30 arrival at an empty desk |
| I10 | Every `incidentId` names a written incident | `:1212` | an incident that does nothing |
| I11 | Incidents at a working minute | `:1219` | a beat nobody sees |
| I12 | `onboardingId` is a real onboarding | `:1230` | a customer with no estate |
| I13 | Onboarding at a working minute | `:1237` | a client joining an empty desk |
| I14 | Onboarding ids week-wide unique | `:1239` | a silent second no-op stand-up |
| I15 | DM minute AND `minute + filesAfter` both working | `:1251-1258` | a summoned ticket after home time |
| I16 | noHello minute and `minute + typingMinutes` working | `:1266, :1280` | a question nobody reads |
| I17 | `typingMinutes >= 1` | `:1268` | "a gap that costs nothing" |
| I18 | after-hours ping has id/speaker/subject | `:1302, :1316, :1320` | a blank line on the brief |
| I19 | **No after-hours ping on the review day** | `:1308` | a ping read on a Saturday that does not exist |
| I20 | after-hours ids week-wide unique | `:1327` | second ping arrives pre-answered |
| I21 | on-call page has id/box/unit/service/note | `:1347, :1361, :1365` | an unreadable pager line |
| I22 | **No on-call page on the review day** | `:1353` | same Saturday problem |
| I23 | on-call ids week-wide unique | `:1372` | shared decision record |
| I24 | walk-up `filesAfter >= 1` | `:1398` | a conversation that decided nothing |
| I25 | walk-up's raised ticket lands inside the day **at the worst case** (`SHIFT_END - INTERRUPTION_CLOSES_BEFORE + slot.minutes + filesAfter`) | `:1393-1408` | a ticket pushed out of the day by a defer |
| I26 | walk-up's slot `source === 'walk_up'` | `:1410` | the dot exemption reads the source |
| I27 | Channel slots valid (room in the employer's set, author, body, working minute, thread answers something posted) | `:1424` -> `channels.ts:213` | a post in another shop's room |
| I28 | Linked requests valid (id, reporter, subject, two copies, working minute) | `:1440` -> `requests.ts:254` | a card with no buttons |
| I29 | Every channel message claiming `request:` names a request made that day | `:1452` | a button wired to nothing |
| I30 | Every linked request has **exactly one** Hubbub copy | `:1470` | the three-surface mechanic silently broken |
| I31 | Interruption + walk-up minutes are working minutes | `:1495` | a takeover at 18:30 |
| I32 | Meeting interruptions name a written scene AND the block is longer than the scene runs | `:1607-1632` | "a beat nobody hears is a beat nobody wrote" |
| I33 | Interruption ids week-wide unique (both columns folded) | `:1498` | second arrives already answered |
| I34 | **Every ticket arrives exactly once per week** | `:1509-1518` | "a day that quietly does nothing" |

The result is frozen (`:1521`).

### 2.1a The interruption module's own refusals (`interruptions.ts:582-680`, `:701-795`)

`validateWeek` delegates the takeover half to `requireSlot`, called from `buildInterruptionSchedule` (`:701`). These are week invariants too and a generator has to satisfy every one.

| # | Invariant | Line |
| --- | --- | --- |
| I43 | Non-empty id, known source, valid severity, whole non-negative minute | `:590-604` |
| I44 | `minutes >= MIN_INTERRUPTION_MINUTES` (1) - "a takeover nobody can read is not a takeover" | `:606-613` |
| I45 | `jitter` is a whole non-negative number of minutes | `:617-621` |
| I46 | Every `postpones` window >= 1 - "a postpone that buys no time is a button that lies" | `:623-630` |
| I47 | A `machine` source may not be `declinable` - "there is nobody on the other end of it" | `:636-641` |
| I48 | **A non-declinable slot's WORST CASE - every postpone spent as late as possible, every booking of the day in the way - must end inside the shift** | `:654-666` |
| I49 | Required flavour keys per source are present ("a surface drawn from words nobody wrote is a blank window with a clock running behind it") | `:142`, `:664-676` |
| I50 | No two slots in a day share an id | `:717` |
| I51 | **The built schedule self-checks: no interruption overlaps a patrol or another interruption** | `:791` -> `:1303` |
| I52 | A mandatory entry with nowhere left in the day throws rather than being silently dropped | `:1005-1015` |

I51's comment is the most relevant sentence in the codebase to this epic: "the builder checks its own work, exactly as the patrol does, and for the same reason: **a bad seed would not look like a bug. It would look like two takeovers on one screen once a fortnight**, which is precisely the sort of thing nobody reports" (`interruptions.ts:786-790`). The project has already reasoned about seed-space failure and already answered it with a runtime self-check. E11's gate story is a generalisation of that instinct, not a new one.

### 2.2 `assertWeekTickets` - the week against the roster (`week.ts:1660-1782`)

Called once at roster construction with **all four weeks** (`tickets/index.ts:378, :407`).

| # | Invariant | Line |
| --- | --- | --- |
| I35 | Every scheduled ticket id exists in the roster | `:1677` |
| I36 | No `summoned` ticket is given a day slot | `:1683` |
| I37 | Every DM/walk-up `raises` names a real ticket | `:1712` |
| I38 | Every DM/walk-up `raises` a ticket whose arrival IS `summoned` | `:1719` |
| I39 | Every channel `relatedTicket` names a real ticket | `:1735` |
| I40 | Every request `raises` names a real ticket | `:1753` |
| I41 | Every request `raises` a `summoned` ticket | `:1760` |
| I42 | **Every non-summoned roster ticket is dealt by SOME employer's week** ("content that ships dead") | `:1773` |

I42 is the one that changes character under generation: with pools, a ticket in the pool is *eligible* rather than *scheduled*, so the assertion has to become "every non-summoned ticket is reachable from some pool" plus "no pool references a ticket nobody wrote".

`assertWeekGreetings` (`week.ts:1797-1827`) adds: every `noHello` speaker has a dialogue tree with a `hello_root`.

### 2.2a Invariants that do NOT exist today, and that a generator needs

Named here because their absence is invisible while a human authors the table and becomes a live failure the moment a sampler does.

- **A day may deal nothing at all.** Bodgeworth's Friday is `inherited: []`, `drip: []`, `load: 1` (`second-week.ts:213-223`) and the loader accepts it. The only check that a week's days are non-empty is `solvability.test.ts:800`, and it runs over the probation week only. A generator that draws zero on a day would ship a silent blank Thursday.
- **`load` is not held to anything.** Section 1.4. Nothing relates it to what the day actually deals.
- **There is no cap on total takeovers per day**, only the no-overlap rule (`interruptions.ts:791`). Four calls that happen to fit are legal.
- **There is no aggregate feasibility check.** Section 2.4 gap 3.
- **Nothing checks that a ticket's `nodes` exist in the employer's estate.** It is true today because a human wrote each week against one shop; `assertWeekTickets` (I35-I42) checks the roster, not the graph. A sampler drawing a probation ticket into the MSP week would produce a ticket about machines that do not exist, and the loader would pass it.

### 2.3 Per-ticket solvability (`tickets/solvability.test.ts`)

Independent of the week. For every ticket and every advertised path (`:481-547`):

- the ticket spawns OPEN (nothing ships already-fixed, `:513`);
- every step is driven through the shipped registry against the shipped world;
- every step but the last leaves it open, the last closes it;
- **every step is left out once and the ticket must not close without it** (`:20-32`) - unless declared `optional_for_closure`, which is itself checked (`types.ts:19-38`).

This property is *week-independent*, which is the single most important fact for E11: **a generator cannot break per-ticket solvability**, because it does not touch tickets. Issue #51 says this and it is correct.

### 2.4 The worst-schedule feasibility auditor (`solvability.test.ts:600-908`)

This is the week-level survivability gate, and it is the thing E11 has to generalise.

`auditDayTiming(day, seed, extra, rounds, presence, daysAhead = 2)` (`:637`) returns a list of complaints. For each ticket the day deals:

- `workableFrom = max(arrival.tick, shiftStartTick(day))` (`:622-627`) - the pre-shift gap;
- `due = serviceDeadline(arrival.tick, entry.def.sla_ticks)` (`:628`);
- the day's booked minutes = the lead's patrol windows plus `worstCaseWindows(schedule, blocked, presence)` (`:673-683`) - i.e. every interruption placed at its LATEST possible landing;
- `clearMinutes(from, to, booked)` counted a minute at a time, skipping lunch (`interruptions.ts:1255-1272`), summed across up to `daysAhead = 2` following shifts because the longest ladder target spans two nights (`:697-717`);
- **the complaint fires if `clear < CLEAR_MINUTES_NEEDED = CAUGHT_MINUTES = 10`** (`:600`, `:721`).

Run over days 1-5 (`:738`) and over days 1-5 x each of the three presence values (`:763`), with two teeth-tests: a hand-built day whose blocks swallow a ticket must complain (`:853`), and the 4:55 class must fail the narrower `daysAhead = 0` question by name (`:841`).

**Three gaps in it, all relevant to E11:**

1. **It only covers the probation week.** `dealtOn` calls `dayPlan(day)` (`:613`) and `bookedOn` calls `interruptionPlanFor(on, seed)` (`:675`), both with the default `week = WEEK` argument. Bodgeworth, the MSP and Halcyon have never been audited.
2. **It audits the RESOLUTION clock only.** `due` is `serviceDeadline(arrival, sla_ticks)`. The RESPONSE clock (60 untriaged minutes, 10 for a Gold P1) is not checked at all, and it is the clock the review's SLA attainment half is scored against.
3. **It is per-ticket, not per-day-aggregate.** Every ticket individually having 10 clear minutes does not mean all of them together fit in the day. A day dealing 8 tickets each needing 10 minutes in overlapping windows passes today. This is exactly the failure a generator will produce and hand-authoring never did.

### 2.5 The review threshold (the percentage model)

`weekPerformance(work)` (`week.ts:272-286`):

```
resolution = closed / arrived
attainment = (arrived - breached) / arrived
mark       = round(100 * (0.5 * resolution + 0.5 * attainment))
```

`RESOLUTION_WEIGHT = SLA_WEIGHT = 0.5` (`week.ts:229-230`). Nought arrivals returns `null` - "no evidence" (`:273`).

**The scale-invariance property is the load-budget's best friend.** "A week twice the size scores exactly the same for the same proportion of work done" (`week.ts:262-265`), re-walked at a doubled roster in `week.test.ts:814-880`. The prior meter model was a SUM and therefore got *safer* with every ticket added; the ratio does not (`week.ts:239-253`). So a generator that varies ticket COUNT between weeks does not automatically vary difficulty - it varies *time pressure*, which is a different and more controllable thing.

Daily fold: `weekStanding(carried, work)` -> `weightedWeekPerformance(carried, today)` = `round(carried * 0.5 + today * 0.5)` (`week.ts:203-216`), so Friday is half the mark, Monday about a sixteenth (`:194-201`). Taken over the week TO DATE, not the day alone, because "a day's own counts do not divide" (`:299-304`).

Bar: `REVIEW_PASS_PERFORMANCE = 45` (`week.ts:107`), sourced to MetricNet's balanced scorecard distribution (median 50, Q3 39-50). Per-employer via `Employer.reviewBar` (`employers.ts:133`) - all four ship at 45. Raised by a conduct file (`conduct.ts`); the shipped table shows 70 when a folder is opened with lines in it (`scripted-week.test.ts:1526, :1540`).

`reviewOutcomeFor(performance, bar, inTheCut)` (`week.ts:182-192`) - bar first, then the redundancy ranking. Below bar = `fired` regardless of the round.

### 2.6 The breach arithmetic

- `BREACH_DEDUCTION_PENCE = 400` vs `CLOSED_TICKET_BONUS_PENCE = 250` and `DAY_RATE_PENCE = 9_600` (`day.ts:434-447`).
- The day ledger counts by EVENT, not cohort: `arrived` = spawned in this day, `closed` = resolved in this day whichever day it arrived, `breached` = went red in this day, `stillOpen` = a fact about the day's own close (`day.ts:286-317`). Immutable once the day is over, because the pay was banked on the day.
- Resolution deadline IS the engine's `sla_deadline`, pushed out minute by minute while parked; response clock stops on first touch (`sla.ts:230-250`).
- The night is one call: `advanceOffHours(morning - now)` (`day-driver.ts:2668-2678`) pushes every open deadline out by 900 minutes with the service clock held, so nothing can breach overnight.

### 2.7 The scripted-week golden (`src/shell/scripted-week.test.ts`)

Two weeks driven headlessly through the shipped driver and engine, pinned to committed numbers "because two runs agreeing only proves the run is repeatable" (`:13-17`).

`GOLDEN_WORKED` (`:951-1010`) pins: engine `snapshotHash` `e32b73663e53a3ba`, end tick 6300, outcome `passed`, per-day `[arrived, closed, breached]` = `[[5,5,0],[7,7,0],[6,5,0],[5,6,0],[5,5,0]]`, totals 28/28/0/0, `earnedPence: 77_775`, `reviewRead: 99`, `reviewBar: 45`, conduct lines 1, the meter map, the full event timeline, and the attention-charged room ids. `GOLDEN_IDLE` (`:1132-1263`) pins the mirror: hash `77813f87589dd468`, 26 arrived, 0 closed, 26 breached, read 5, bar 70, `fired`.

Every content change in the project's history is recorded as a numbered "MOVE" in the comment block (`:477-950`, seventeen of them), each naming exactly which of the pinned values moved and why. That discipline is what makes the golden a design artifact rather than a snapshot.

Below it, the **five-skill-level balance table** (`:1439-1590`), which is the more interesting gate for E11:

| Profile | closed | breached | reputation | reviewRead | bar | filed | outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worked properly | 28 | 0 | 100 | 99 | 45 | 1 | passed |
| half the roster | 13 | 14 | 57 | 54 | 45 | 0 | passed |
| worked, browser up all week | 27 | 0 | 100 | 99 | 45 | 15 | passed |
| half the roster + browser | 13 | 14 | 57 | 54 | **70** | 15 | **fired** |
| nothing at all | 0 | 26 | 0 | 5 | 70 | 12 | fired |

"Two ways to lose the job, either forgiven alone, neither forgiven together" (`:1519-1523`). This table is the *design claim* about what a week means, and it is the thing a generated week must continue to satisfy - not as exact numbers, but as a band and an ordering. Section 7.3.

Bodgeworth has its own week golden (`scripted-week-bodge.test.ts`); the MSP and Halcyon do not have one of this shape.

---

## 3. Pool-shaped vs pinned: an inventory

### 3.1 Already pool-shaped (interchangeable within a slot)

- **Flood tickets.** `flood.ts` ships two parent/duplicate clusters - the VPN certificate (parent + 2 duplicates, Thursday) and the share maintenance (parent + 2 duplicates, Wednesday). `duplicatePath(child, parent, parentTitle, comment, fix)` (`flood.ts:52-68`) is *already a factory*: three moves - attach, repair once, tell everybody. A flood is a cluster template with an arity, which is exactly a pool entry.
- **Drip tickets in general.** A drip is `{ticketId, minute}`. Any ticket whose `arrival` is `drip` can go in any drip slot on any day of an employer whose world contains its `nodes`. That last clause is the real constraint and it is per-employer, which is why pools must be per-employer.
- **Per-day piles.** `inherited` is a list of at most 2 ids; nothing in it is day-specific except by authorial intent.
- **noHello, DMs, walk-ups, after-hours pings.** Each is a self-contained beat with a speaker and a minute. Constrained only by "the speaker exists in this employer's graph" and the walking-minute arithmetic.
- **Channel chatter.** Room posts with no `request` and no `relatedTicket` are pure texture (Bodgeworth's storm is 9 of these plus 1 that matters).

### 3.2 Coupled - poolable only as a UNIT

- **Linked requests.** A request needs its mail copy, its chat copy, exactly one Hubbub copy carrying its id (I30), and a summoned ticket it converts into (I41). Four artifacts, one atom.
- **Flood clusters.** Parent + N duplicates, and the duplicates' `resolved_when` is the parent marker and nothing else (`flood.ts:17-22`), so a duplicate sampled without its parent is unclosable. Atom.
- **DM / walk-up + summoned ticket.** `raises` must be summoned (I38); `doneWhen` names a node and field the world holds. Atom.
- **Reply-all storm.** 10 channel messages one thread deep, with the signal (`bodge:share-down`) at message 8 and the drip it names landing the same minute (`second-week.ts:101, :171-181`). Atom, and one whose internal *ordering* is the content.

### 3.3 Pinned to a specific day (or a day RELATION)

- **The recurring arc.** `ticket:vacuum-tuesday` (day 2 inherited) and `ticket:vacuum-thursday` (day 4 inherited), with `INCIDENTS.cleanerNeedsTheSocket` fired at **16:56 on both Monday and Wednesday** (`week.ts:636-641, :845-851`). The clue is that the Event Viewer holds both power losses "four lines apart" (`arc.ts:9-14`) - so the second ticket does not close on power alone. This is a **day-relation constraint**: incident on D, ticket on D+1, incident on D+2, ticket on D+3, all four minutes pinned to the same clock minute. Not "Tuesday and Thursday" - the relation.
- **Incidents generally.** `IncidentSlot` takes no jitter by construction - "the whole point of the recurring arc is that the two outages are at the SAME minute two days apart, and a schedule that wandered by twelve minutes would be a schedule with the clue taken out of it" (`week.ts:431-444`).
- **The announced meeting.** `meeting:hygiene-sync` on Wednesday at `HYGIENE_SYNC_MINUTE`, no jitter, not declinable, not deferrable, and the summons mail sent from Monday says the time (`week.ts:852-871`). Pinned because a wandering appointment makes the mail a lie.
- **The 4:55 class.** `ticket:vpn-month-end` on Wednesday, `arrivesMinutesBeforeClose: 5`. Deliberately mid-week rather than Friday: "a field that only ever appeared on a Friday would be a Friday wearing a field's clothes" (`week.ts:836-842`). Constraint: not the last day, because the response window has to cross a night that exists.
- **The onboarding capstone.** `onboarding:tillman` at 10:00 Wednesday, with `ticket:tillman-backup-discovery` dripping at 10:20 - twenty minutes later, "once there is a client to audit" (`msp-week.ts:145-157`). Day-relation: onboarding at minute M, discovery drip at M+20, same day.
- **On-call pages.** Two nights, deliberately separated: Tuesday night and Wednesday night, "so the arc has a page on two separate nights rather than a wall of them" (`msp-week.ts:36-41`). Forbidden on day 5 (I22).
- **The project's 3-day span.** `PROJECT_DAYS = 3` (`project.ts:186`), and the kickoff gate refuses to start if `day + PROJECT_DAYS - 1 > WEEK_DAYS` (`day-driver.ts:3838-3841`) - "a three-day plan begun on a Thursday is not a challenge, it is a project the week has nowhere to put". Budgets `audit 180 / staging 480 / cutover 840 / handover 1260` service minutes from kickoff (`project.ts:151-155`), baked once at kickoff and never re-baked (`:12-18`).
- **Org-dysfunction beats (Halcyon).** An escalating authored ORDER across the five days: Mon CEO MFA-off (inherited), Tue EA mailbox delegate, Wed filter exemption + the interim director's mandate + the personal tablet, Thu the access recertification + the earbuds/ledger collision **at the same minute** (`corporate-week.ts:159-162`), Fri the manager override (inherited). The comments are explicit that order is content: the mandate's revert "FOLLOWS it, so it has to land early enough in the week for the man who sent it to have moved on" (`corporate-week.ts:104-107`).
- **The reply-all storm day.** `BODGE_EVENT_DAY = 3` (`second-week.ts:232`), exported and asserted by name.
- **Monday's teaching day.** "Monday is left alone because Monday is the day the two basic tools are taught" (`week.ts:513-516`). Load 1, no takeovers, four tickets.
- **Friday.** "Friday is about the conversation at three" (`week.ts:609-610`). `REVIEW_DAY = WEEK_DAYS` and `REVIEW_MINUTE = 900` are constants (`week.ts:78-79`).
- **The one-of-each-shape rule.** The probation week deliberately authors one of each interruption source across the week - call Tue, meeting Wed, chat+machine Thu, walk-up Fri (`week.ts:504-517`, `:1024-1032`) - and there is a test that asserts it (`week.test.ts:490`). That is a **category quota already written down**, and it is the single best precedent for what a generated week's quota table should look like.

---

## 4. Determinism seams

### 4.1 The seeds

- `WORLD_SEED = 0x5eed_1c01` (`session.ts:36`). "The working day is replayable, so the seed is a constant rather than a clock reading."
- `RETRY_SEED_STEP = 0x9e37_79b9` (`session.ts:47`) - the golden-ratio constant, odd, well away from the seed's bit pattern.
- `seedForAttempt(n) = (WORLD_SEED + (n-1) * RETRY_SEED_STEP) >>> 0` (`session.ts:50-56`).
- The engine itself is constructed with that seed: `new WasmEngine(seedForAttempt(carry.attempt))` (`session.ts:243`), and the session reports it as `session.seed` (`:279`), which the driver schedules on.

### 4.2 What derives from seed + day

`seededOffset(seed, day, key, spread)` (`day.ts:182-203`): FNV-1a over `"${seed}:${day}:${key}"`, returning `(hash % (spread*2+1)) - spread`. It is explicitly *not* the simulation RNG - "the engine's own generator is the only thing allowed to roll dice that the world remembers, and a schedule is decided before the day starts" (`:176-180`).

Consumers:
- **Drip jitter** - key = the ticket id, spread 12 (`day.ts:254`).
- **Patrol placement** - key = `'boss:patrol'`, spread 18, seeded with `patrolSeedFor(day, worldSeed)` (`boss.ts:221-228`).
- **Interruption placement** - `buildInterruptionSchedule(seed, day, plan)` (`interruptions.ts`), per-slot `jitter` authored on the slot (`week.ts:737` = 4, `:946` = 6; pinned slots author none).
- **On-call outcomes** - `pageSelfResolves(id, n, seed)`, `pagedAtMinute`, `selfClearDelayMinutes` (`on-call.test.ts:35-39`), so whether a page is a real fire or a flap flips with the attempt (`msp-week.ts:36-41`).
- **Change-request review delay and maintenance window** - seeded off the request id (`change-request.ts`, per `titles-projects-engine.md:203`).

### 4.3 What a per-week seed would touch

Today there is exactly one seed axis: the attempt. A generator needs a second axis - which week of the career this is - and it must not collide with the first.

The clean shape is a **derived week seed**, not a new stored one:

```
weekSeed(attempt, employer, arcWeek) = fnv1a(`${seedForAttempt(attempt)}:${employer}:${arcWeek}`)
```

Properties that matter:
- A retry of week 3 at the MSP with `attempt = 2` gets the same *composition* only if the composition is keyed on `(employer, arcWeek)` and the *minutes* are keyed on the attempt. That is exactly the existing retry contract read one level up: "a retried week has to be recognisably the same week - the same tickets, the same people, the same review on Friday - and not the same MINUTES" (`session.ts:40-45`). **Keep composition on `(employer, arcWeek)` and jitter on `attempt`.** This is the single most important determinism decision in the epic.
- `patrolSeed` per day stops being an authored column and becomes `hash(weekSeed, day)`; Monday's `patrolSeed: 0` convention (`week.test.ts:233-235`) either dies or becomes `day === 1 -> weekSeed`.
- Nothing in `seededOffset` needs to change: it already takes the seed as a parameter everywhere.

### 4.4 Save implications

`SAVE_SCHEMA = 4` (`save.ts:55`). The file is engine payload + app state + driver state, versioned, read strictly, all-or-nothing, with per-step upgraders (`save.ts:127-176`). Schema 4 added `employer` because "a career spans more than one and the standing/title are in the engine payload but the employer's IDENTITY is not" (`save.ts:49-55`).

A generated week needs the same treatment: **the composition must be reproducible from saved scalars, never serialised as a blob.** If `weekSeed` is derived from `(attempt, employer, arcWeek)` and all three are already saved - `attempt` is `FIELDS.weekAttempt`, `arcWeek` is `FIELDS.arcWeek`, both written in `carrySetup` (`session.ts:405-433`), `employer` is schema-4 - then **no save schema bump is needed for the generator itself**. That is a large win and it should be a hard design constraint.

A bump IS needed if week-2 carries estate state (section 8), because that is world data the carry does not hold.

`RetryRecord` (`retry.ts:43-74`) carries `attempt`, `farmFund`, `kbSelected`, `arcWeek`, `employer`. `carryFrom` (`:145-154`) turns it into a `WeekCarry`. Both already have every field the derivation needs. Note `arcWeek` is already carried "because assuming it is the probation week is only true while the probation week is the only week there is - and the day the second one exists, a firing in week five would silently restart a career rather than a Monday" (`retry.ts:49-57`). **That comment was written for E11.**

### 4.5 The employer-switch carry

`careerAfter(exit, standing)` (`career.ts:121-140`) -> `EmployerCareer {reputation, title, farmFund, trail, tier}`. `carryForEmployer(career, employer)` (`career.ts:153-166`) resets `attempt: 1` and `arcWeek: PROBATION_WEEK` - "a new employer is a fresh probation at that employer rather than the same week over".

Today `nextEmployerAfter` (`employers.ts:328-332`) wraps at the end of the four-employer list, back to `workgrumble`. That wrap is documented as a placeholder (`:319-327`). With a generator, arriving back at the probation shop at `arcWeek: 1` would replay Monday exactly - so **the wrap becomes a real bug the moment weeks are generated**, and E11 should either keep `arcWeek` across the wrap or make the wrap a refusal.

---

## 5. The career carry: what survives a week

`endWeek` (`day-driver.ts:2707-2717`) is a hard stop: it banks the last day's slip, records the week reading, dispatches `DAY_ACTIONS.endWeek`, checkpoints, and hands off to the shell.

**What crosses a week boundary today:**

| Thing | Where | Notes |
| --- | --- | --- |
| `farmFund` | `WeekCarry.farmFund` (`session.ts:67`) | the joke that survives everything |
| `attempt` | `WeekCarry.attempt` | moves the seed |
| `arcWeek` | `WeekCarry.arcWeek` | position in the pressure arc |
| `employer` | `WeekCarry.employer` | which world stands up |
| `reputation` | `WeekCarry.reputation` (switch only) | absent on retry, which keeps goldens byte-identical |
| `title` | `WeekCarry.title` (switch only) | same |
| `playerTier` | `WeekCarry.playerTier` (switch only) | only `systems_engineer` writes anything (`session.ts:216-218`) |
| `kbSelected` | `RetryRecord.kbSelected` | the article left up, on a retry |
| `trail` | `EmployerCareer.trail` | carry state, not world state; drops before the week seed |

**What does NOT cross:** no graph node, no ticket, no open work, no estate change, no mail read state (deliberately - `retry.ts:19-24`), no conduct file, no meters other than reputation-on-switch.

This is `titles-projects-engine.md` G5 (`:196-220`). Its fork:
- **Fork A** - projects fit inside one week. Shipped in 0.29.0.
- **Fork B** - projects carry across weeks. Needs a project-state carry in `WeekCarry`, a re-seed path standing the in-flight project's world back up (generalising `onboarding.ts`'s idempotent-setup pattern), a save-schema bump, and **week-2+ content per employer** - which is E11.

Section 2.4 of that doc adds the operational half: the graph, tickets, meters and clock all survive the *day* boundary (`scripted-week.test.ts:698` asserts a week ending with twenty-two still open), so multi-day ticket life is shipped behaviour. Only the *week* boundary is the wall.

**E11 is therefore the enabling epic for E10 fork B**, and the two should share one carry design even if E11 ships first without a project in it.


### 5.1 The blast radius of making a week generated

The driver reads the week **entirely** through one private field `this.week_` (`day-driver.ts:1433`, `:2826`), set at construction or by `adoptEmployer`. Every reader is `dayPlan(day, this.week_)`, `incidentsOn(day, this.week_)`, `onCallOn(night, this.week_)` etc. (`day-driver.ts:3185, :3274, :3319, :3351, :3432, :3491, :2025, :1919, :2256, :2780, :2785`).

`Employer.week` is consumed in exactly four production places:

- `session.ts:284` - `week: employer.week` onto the session
- `main.ts:533` - boot
- `save.ts:493` - preflight `adoptEmployer(employer.week, ...)`
- `save.ts:626` - commit `adoptEmployer(restored.week, ...)`

**So a generator that emits a `readonly DayScript[]` needs no driver change at all.** `Employer.week` becomes `weekFor(seed): readonly DayScript[]` and four call sites move. That is the strongest architectural fact in this spike.

**But `save.ts` is a named defect waiting to happen.** Both load paths resolve the week from the *employer registry alone* - `employerFor(file.employer).week` - with no seed. Under generation that reloads a DIFFERENT week than the one saved. The fix is already precedented: `resync()` opens with "The seed first: everything below is built from it, and a load may have replaced this session's week with a later attempt at the same one" and calls `seedFromWorld()` = `seedForAttempt(playerNumber(FIELDS.weekAttempt, 1))` (`day-driver.ts:2838-2841, :3232-3234`). `FIELDS.arcWeek` is a player-node field written by `carrySetup` (`session.ts:427-432`) and therefore inside the engine payload, restored before `adoptEmployer` runs. So the shape is: `adoptEmployer(employerId, ...)` -> `resync()` reads attempt AND arcWeek off the world -> derives the week. **No save schema bump.** But this must be an explicit slice gate ("a save taken in a generated week reloads into the same week, byte for byte"), because nothing today would catch it.

### 5.2 Content inventory, for pool-sizing arithmetic

Scheduled (non-summoned) tickets per employer, counted off the week tables:

| Employer | inherited/day | inherited total | drip slots | scheduled total |
| --- | --- | --- | --- | --- |
| probation | 2,2,1,2,1 | 8 | 17 | **25** |
| Bodgeworth | 2,0,0,0,0 | 2 | 3 | **5** |
| MSP | 2,1,0,0,0 | 3 | 16 | **19** |
| Halcyon | 1,0,0,1,1 | 3 | 6 | **9** |

Total scheduled across the whole game: **58**. Plus summoned tickets (raised by DMs, walk-ups, requests, follow-ups, project kickoff) that the weeks never slot.

The probation week's golden reports **28 arrivals** against 25 scheduled: the extra three are summoned (the lead's concern minted by a boss ping, Terry's password ticket when the favour is refused, Bev's converted cross-post, Gary's restart ticket).

Un-mined authored material for pool expansion: `docs/research/ticket-material.md` has nine trope categories (vague ticket, priority pathology, layer-8 hardware, power/physical, password/login, self-inflicted + coverup, paranoid VIP, maintenance blindness, IT-on-IT) with roughly forty distinct cases, all sourced and all explicitly licensed for rewriting into the game's voice. That is the raw feedstock for pool growth and it already exists.

---

# Part 2 - design research

Sourcing note. Several primary sources were unreachable from this environment and are flagged where used: `wiki.hoodedhorse.com` (Against the Storm official wiki) is Cloudflare-403, so its numbers come from search-engine extracts of those exact pages; `ftl.fandom.com` and `rimworld.fandom.com` return 402/403, same treatment; GDC Vault video sessions are paywalled (Subset Games' Into the Breach talk was NOT accessed and is not paraphrased); the Frictional Games "Problem of Repetition" post failed TLS verification. `rimworldwiki.com` was fetched in full, and the Booth and Sylvester GDC PDFs were pulled and text-extracted directly.

## 6. What the good ones actually do

### 6.1 The strongest single argument for the proposal, and it is Valve's

**FACT.** Mike Booth, GDC 2009, on the Left 4 Dead AI Director, states the case against the obvious cheaper alternative better than anyone: "Static placement of enemies and loot hinders replayability - players are good at memorizing all static locations ... Results in 'optimal strategy' that works every time." And then the part that matters here: "**Even multiple sets of manually placed triggers/scripts fails - players learn all of them, and if they don't see A, they prepare for B or C, etc.**" (https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)

Read against E11: authoring a second and third week per employer buys you two and three weeks, not replayability. The owner's instinct in issue #51 is right, and this is the citation for it.

Booth's own mechanism has a name worth stealing: "**Structured Unpredictability** ... Population functions where space and/or time varies based on designer-defined amount of randomization ... Structured Unpredictability = Superposition of several of these population functions", explicitly "not purely random, nor deterministically uniform". Frequency bands are authored per content class - Wanderers high, Mobs medium, Special Infected medium, Bosses low, Weapon Caches low - which is a category quota table by another name. (FACT, same source.)

### 6.2 Every good implementation pins the skeleton HARD

**FACT - Slay the Spire.** 17 floors per act. Floor 1 is a combat from the **easy pool only**; floor 9 is treasure, exclusively; floor 15 is a rest site, exclusively; floor 16 is the act boss; floor 17 the boss chest. Everything else is rolled (Normal 53% / Unknown 22% / Rest 12% / Elite 8% / Merchant 5% - community-datamined, the wiki page carries an "under construction" banner). There is always a rest site before the boss regardless of path. (https://slaythespire.wiki.gg/wiki/Map_Generation, https://slaythespire.wiki.gg/wiki/Map_Locations)

**FACT - Left 4 Dead.** "**Boss Encounters NOT affected by adaptive pacing** - overall pacing affected too much if they are missing." The three boss beats (Tank, Witch, Nothing) are shuffled and dealt with "successive repeats not allowed", positioned every N units along the escape route plus or minus a random amount. (Booth, above.)

**FACT - Against the Storm.** The Annual Cornerstone pick is **LEGENDARY in years 2, 4 and 6** and EPIC in every other year - the *year* is authored, the *contents* are drawn. Prestige is 20 authored, cumulative modifier levels over a randomized run. (https://wiki.hoodedhorse.com/Against_the_Storm/Cornerstones,_Perks_and_Effects, https://wiki.hoodedhorse.com/Against_the_Storm/World_Map_modifiers - via search extract)

**FACT - FTL.** 19-24 beacons per sector on a 6x4 grid with an 80% placement chance per cell; sector-type roll 48% civilian / 32% hostile / 20% nebula; **at least one guaranteed store per sector**; per-sector-type quest event pools. (https://ftl.fandom.com/wiki/Sectors, https://ftl.fandom.com/wiki/Beacons - via search extract)

**FACT - RimWorld.** A pinned 40-day difficulty ramp (Starting Factor 0.7 at day <=10 rising to 1.0 at day 40), and a per-incident cooldown table: Zzztt 8 days, Eclipse 15, Psychic drone 15, Flashstorm 15, Blight 30, Heat wave 30, Cold snap 30, Man in Black 60, Toxic fallout 90, Volcanic winter 140. (https://rimworldwiki.com/wiki/Raid_points, https://rimworldwiki.com/wiki/Events)

**Applied to E11:** Monday-as-teaching-day, Friday-as-review, the arc's Tuesday/Thursday coupling, the storm day, the project's three-day span - these are the game's floors 1/9/15/16, and they must be slots the sampler cannot touch and the budget cannot smooth.

### 6.3 The RimWorld storyteller claim, confirmed with numbers

The claim under test was: the storyteller paces *when* events fire via a scaled points budget, it does not generate event *content*, and incidents are hand-authored defs with weights and conditions. **Confirmed on both halves.**

**FACT - the budget.** `Raid Points = (Wealth Points + Pawn Points) * Threat Scale * Starting Factor * Adaption Factor`, floored at **35** and capped at **10,000**; 1 raid point is roughly 1 combat power, and points are *spent* buying raiders. Wealth Points interpolate 0 at 14,000 wealth -> 2,400 at 400,000 -> 3,600 at 700,000 -> 4,200 at 1,000,000 and flat after. Below 14k wealth contributes nothing at all. Pawn Points per colonist run 15 at <=10,000 wealth to 140 at 400,000 to 200 at 1,000,000. Threat Scale by difficulty: 0.10 / 0.30 / 0.60 / 1.00 / 1.55 / 2.20. Adaption Factor starts at 0.8 and is **clamped to 0.4-1.47** (narrowing to 0.75-1.19 at the default 40% Adaption Impact), driven by a day counter with a 30-day grace period; a colonist death subtracts 20-30 days from it. Calibration anchors: weakest raider 30 combat power, scyther 150, centipede 400. (https://rimworldwiki.com/wiki/Raid_points)

**FACT - the content is authored.** A finite enumerated incident list with fixed categories, per-event cooldowns (above), and hard preconditions that are content facts, not statistics: Ambrosia sprout is limited to six named biomes, Heat wave requires summer temperature above 20C, Cold snap requires 0-15C, Party requires a party or gathering spot, Prison break requires prisoners, Ancient danger is once per map. (https://rimworldwiki.com/wiki/Events)

**FACT - the three storytellers differ on pacing shape only, over one shared pool.** Cassandra "creates story events on a classic increasing curve of challenge and tension ... push, then breathing room, then push once more"; Phoebe "gives lots of time between disasters"; Randy "doesn't follow rules". Randy is also the only one that applies a post-cap variance multiplier, **50%-150% per event**; Cassandra and Phoebe apply none. (https://rimworldwiki.com/wiki/AI_Storytellers)

**Correction to the brief:** Sylvester's GDC 2017 talk "Contrarian, Ridiculous, and Impossible Game Design Methods" **does not describe the storyteller algorithm at all**. It is philosophy. Two lines from it are still worth having: "If you're generating the whole story, your mechanics must include loss and recovery", and the apophenia 2x2 whose interesting cell is "not present in game, perceived by player", achieved by "1. Abstracted feedback 2. Long-term relevance". (https://media.gdcvault.com/gdc2017/Presentations/Sylvester_Tynan_RimWorld_Contrarian_Ridiculous.pdf) Anyone citing that talk for threat-points detail is wrong.

**Applied to E11:** the load budget in section 7.1(c) is this pattern, and the pieces to copy are the ones most likely to be skipped - a hard floor and ceiling, a dead zone at the bottom, an authored early ramp, and a clamped adaptation term. Also note that RimWorld's per-incident cooldowns and biome preconditions are precisely the repo's `PoolEntry.excludes` / `employers` fields; that shape is not novel and does not need inventing.

### 6.4 Constrain the draw, do not enlarge the pool

This is the single highest-leverage finding in the external research.

**FACT - Slay the Spire's anti-repeat is a hard rule, not a probability tweak.** "The same monster encounter cannot be fought again in the next 2 monster encounters" (a 3-encounter exclusion window). The same elite may recur in an act but **cannot be encountered twice in a row**. There are additionally hand-specified cross-pool bans, e.g. Act 1 "3 Louses" cannot immediately follow "2 Louses"; Act 3's hard-pool "3 Darklings" cannot follow the identical easy-pool "3 Darklings". Encounters carry integer weights within their pool - the wiki's Act 2 example gives "Snake Plant" weight 6 against "The Maw" weight 1. (https://slaythespire.wiki.gg/wiki/Monsters)

Note the maintenance cost you would inherit: those cross-pool bans are **authored per pair**, not derived.

**FACT - the shuffle bag.** The Tetris Guideline's Random Generator puts one of each of the seven tetrominoes in a bag, shuffles, deals, refills. 7! = 5,040 permutations; the guarantee is that you never wait more than **12 pieces** for a specific piece, and S/Z runs are capped at 4. The stated purpose is eliminating droughts - bounding the worst case rather than improving the average. (https://tetris.wiki/Random_Generator)

**FACT - RimWorld's cooldowns**, 8 to 140 days, section 6.3.

**FACT - Left 4 Dead's bag**, Tank/Witch/Nothing shuffled, no successive repeats, section 6.2.

Four independent games, four versions of the same device. **None of them solves repetition by making the pool bigger.**

### 6.5 Pool sizing: the arithmetic, and why nobody pays it

**There is no published practitioner rule of the form "N events per hour of play."** The brief asked for one specifically; it does not exist in anything reachable. What exists is a small number of shipped content counts and a lot of spacing rules.

**FACT - the one big shipped number with the designer's rationale attached.** Hades ships **21,020 voice lines and 305,433 words** (~200,000 of it dialogue), and Greg Kasavin's stated reason is exactly this problem: hearing repeated dialogue is the moment that disappoints him in other games, so characters were given an enormous amount to say. The distribution is extremely skewed: Zagreus alone has ~8,500 of the 21,000 lines, Hades ~1,600, Tisiphone 190, Charon 120. (https://nintendowire.com/news/2020/12/30/hades-has-over-300000-words-of-voiced-dialogue-heres-a-handy-breakdown-of-who-speaks-most-and-least/) Hades 2 scaled to 400,000+ words and 30,000 lines, about 50% more. (https://www.gamesradar.com/games/hades/hades-2-has-an-epic-script-of-over-400-000-words-and-30-000-voice-lines-around-50-percent-more-than-the-original-roguelike/)

The skew is the actionable part, and it maps straight onto E11: **the frequently-drawn slot needs a pool an order of magnitude larger than the rare one.** A drip slot fires 3-4 times a day, 15-20 times a week; a pager night fires twice a week; an onboarding fires once an arc. Size the drip pool accordingly and do not waste authoring on the rare slots.

**FACT - barks, qualitative only.** The practitioner writing gives time thresholds, not counts: a bark that reads "slightly too theatrical ... curdles by hour three and becomes actively grating by hour ten", and "the more frequently barks are called ... the quicker the AI cycles through its response pool, meaning the quicker the whole pool repeats". (https://www.toosixmg.com/post/voice-direction-in-games-why-combat-barks-are-harder-than-cutscenes, https://sarah-beaulieu.com/en/writing-barks-for-video-games) These are trade-press blogs, not studio data, and there is no "N barks before players notice" figure anywhere I could reach.

**FOLKLORE (arithmetic, no source, but it is only the birthday problem).** For a pool of size N drawn uniformly with replacement k times, P(at least one duplicate) is approximately `1 - exp(-k(k-1)/(2N))`, and expected distinct items is `N(1 - (1-1/N)^k)`. Applied to a five-day week:

| Question | Requirement |
| --- | --- |
| k=5 draws in one week, P(repeat) <= 10% | **N >= ~95** |
| k=5, P(repeat) <= 25% | N >= ~35 |
| k=20 draws (four weeks), P(any repeat) <= 50% | **N >= ~275** |
| Coupon collector: see every item once | ~`N ln N` draws; a 100-pool needs ~460 draws = 92 weeks |

The honest read: **naive uniform sampling needs a pool roughly 20x the per-session draw count to feel fresh for a month, and no shipped game pays that.** The last row is the sting - at that pool size most authored content is never seen by a typical player, which is the worst possible return on authoring effort.

**Conclusion for E11, and it changes the epic's shape:** the drip pool per employer does not need to be 95 tickets. It needs an **exclusion window** plus a pool comfortably larger than the window. With a 3-week recency window and 15-20 drip draws a week, a pool of **50-60 per employer** makes a repeat inside three weeks structurally impossible, which is a far better product than a 95-ticket pool that repeats by luck. That is roughly a 2-3x expansion of each employer's current drip content, not a 5x one.

**FACT - the cost line, and it needs to be in front of the owner.** The two games that solved this by volume both did it with **hand-written** variation, not combinatorics. Wildermyth's designer: "Procedural plot is incredibly difficult to pull off"; they repeatedly considered procedural chapter structures and villains and "could never get past the concept phase", refocusing on character instead; and "all of the procedural story and event differences need to be hand-written (for example, they often write one line a different way for each personality type)", making the game "more hand-curated and less fully-procedural than something like Dwarf Fortress". (https://thousandscarsblog.wordpress.com/2019/12/04/game-dev-interview-wildermyth/) Unexplored's cyclic dungeon generator, the poster child for "procedural that reads as designed", is roughly **5,000 individual find-replace rules**. (https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-, https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/)

### 6.6 Difficulty variance from sampling

**FACT - budget with hard clamps**: RimWorld, section 6.3. The features worth copying in order of importance: a hard floor and ceiling; a dead zone at the bottom so the early game cannot spike; an authored early ramp; an adaptation term that is itself clamped; and a variance multiplier applied **last** and only where chaos is the brand.

**FACT - the partition matters as much as the total.** D&D 5e's encounter budget sums per-character XP thresholds (25/50/75/100 at level 1 up to 2,800/5,700/8,500/12,700 at level 20) and then multiplies the monsters' total XP by a group-size factor: 1 monster x1, 2 x1.5, 3-6 x2, 7-10 x2.5, 11-14 x3, 15+ x4. (DMG p.82, https://www.dndbeyond.com/sources/dnd/basic-rules-2014/building-combat-encounters)

**This is a direct warning about the `committedMinutes` formula in section 7.1(c).** Five small tickets and one big ticket with the same summed minutes are not the same day: five tickets means five triages, five response clocks, five context switches. The budget needs a **count term** as well as a minutes term, or it will call a shredder day and a deep-work day equivalent. Recommend `committedMinutes * f(arrivalCount)` with `f` rising like the 5e multiplier - and calibrate `f` against the shipped weeks in slice 1, since the shipped Wednesday (6 arrivals) and Thursday (5 arrivals plus three takeovers) are the two ends of it.

**FACT - category quota by position.** Slay the Spire's easy-pool/hard-pool split IS "guaranteed one of each type by slot": the first 2-3 combats of an act must come from the low-difficulty pool. Cheaper than rebalancing individual encounters. (https://slaythespire.wiki.gg/wiki/Monsters)

**FACT - the strongest single principle found, and it should be a design rule in the epic.** Booth's conclusion slide: "**Algorithm adjusts pacing, not difficulty - amplitude (difficulty) is not changed, frequency (pacing) is.**" Valve's director deliberately does not smooth the peaks; it smooths the rhythm. (https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)

**Applied to E11:** do NOT flatten Thursday to reduce cross-seed variance. The band on `load 4` should stay wide and high; what the budget controls is that Thursday is heavier than Monday on *every* seed, not that Thursday is the same weight on every seed.

**FACT - expect roughly half your naive samples to be invalid.** EA SEED validates generated match-3 levels by running a scripted bot offline; reported validity rates are **43.75% (vanilla model), 51.39% (their Avalon model), 46.15% (dataset baseline)** against the designers' 20-move limit. They used **30 games per level** for move-count convergence and allowed the bot 39 moves for headroom, noting "informal experiments indicate that the bot performs comparatively to human testers". (https://arxiv.org/html/2409.06349) This is the only hard industry number on rejection rates I could find, and it says: budget for reject-and-resample, or design so rejection is unnecessary.

### 6.7 Narrative flatness, and the named critique of exactly this pattern

**FACT - the arc has to be a first-class object.** Façade's drama manager "globally sequences beats chosen from a large pool in order to make story tension rise and fall to match an Aristotelian arc"; beats are hand-authored, gated by preconditions, selected by weight. (Mateas and Stern, https://cdn.aaai.org/ojs/18722/18722-52-22361-1-10-20210928.pdf) I could not extract the beat *count* from that paper - do not quote one.

**FACT - the shipped commercial version of the same idea.** L4D's pacing state machine: **Build Up** (full threat population until intensity crosses peak) -> **Sustain Peak** (continue full population 3-5 seconds past the peak, to guarantee a minimum build-up duration) -> **Peak Fade** (minimal population, wait for intensity to decay, and *will not let Relax start until a natural break in the action occurs*) -> **Relax** (minimal population for **30-45 seconds**, or until the team moves on). Mob spawns fire "at randomized interval between 90 and 180 seconds, located at a randomized spot 'behind' the Survivor team". (Booth, above.)

**FACT - Hades weights its pre-written events by situation.** Supergiant feed pre-written events based on the situation the player is in, weighting certain events to appear more frequently, in service of "reactivity has always been a goal of our narrative design, to have those moments where you feel the game is paying attention". (https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death)

**FACT - the named critique, and it is aimed at Against the Storm specifically.** Robert Yang's design review is the best-articulated statement of the failure mode E11 risks. On the randomized map modifiers ("no crops", "no meat") he writes that they feel "um, random? An arbitrary constraint dropped on you, rather than an interesting evolving problem", and argues that handcrafted levels with specific decks and varied objectives would give "more meaningful cohesive variation". He counts 50+ building types of which ~30 are near-identical tier-2 processors and calls it "deckbuilding oatmeal". (https://www.blog.radiator.debacle.us/2023/06/design-review-of-against-storm-by.html)

**FACT - the oatmeal reference itself.** Kate Compton: "I can easily generate 10,000 bowls of plain oatmeal, with each oat being in a different position and different orientation, and *mathematically speaking* they will all be completely unique" - and the player sees oatmeal. She separates **perceptual differentiation** (this is not identical to the last one - the easy bar) from **perceptual uniqueness** (this one is memorable and characterful - the hard bar), and her generator recipe is a defined possibility space plus stated desirable properties plus hard constraints: "**The most reliable generators are the ones where you can concretely describe constraints.**" Her two named techniques for an authored feel are tile/grammar systems that nest hand-made pieces so baseline quality is guaranteed and only *arrangement* varies, and making the evidence of process and forces visible so the world reads as having had causes. (https://procedural-generation.tumblr.com/post/139979646183/so-you-want-to-build-a-generator)

**Honest gap:** no source anywhere gives a minimum beat density per session. The closest usable principle is Sylvester's apophenia cell - abstracted feedback plus long-term relevance makes players manufacture narrative from content that is not there. **FOLKLORE (reasoning):** that suggests the lever is not more beats, it is making sampled fill *refer back* to pinned beats so the player stitches the arc themselves. Workgrumble is unusually well placed for that: channel messages, after-hours pings and DMs are already coats over tickets (`week.ts:543-556`), and a sampled ticket that arrives with a room post referencing the pinned arc costs one line of authored text.

**FACT - Ken Levine's "narrative Lego"** (break narrative into smallest non-abstract elements, NPCs carry percentage "Passion" bars, world events key off them, aiming at replayable systemic narrative "like a game of Civilization") is a useful framing device. (https://www.gamedeveloper.com/design/video-ken-levine-pitches-devs-on-the-idea-of-narrative-legos-) **FOLKLORE (assessment): this was a pitch, not a postmortem, and no shipped game demonstrates the system as described.** Cite it as framing, never as evidence.

### 6.8 Gates for generated content

**FACT - correct-by-construction beats generate-and-test where you can arrange it.** Derek Yu's first priority in Spelunky was "to make sure that there is a path from the entrance to the exit that is traversable without the use of bombs, rope, or other special equipment", and the mechanism is not a checker: 16 rooms in a 4x4 grid; a solution path is walked from a start room in the top row choosing left 40% / right 40% / down 20%; a horizontal move requires a type-1 room (guaranteed left/right exits); a downward move **converts the current room to type 2** (guaranteed bottom exit) and forces the room below to type 2 or 3; hitting the grid edge reverses direction and moves down; off-path cells get type-0 filler. **Spelunky never validates a level, because the path is laid down first and the content is filled in around it.** (https://tinysubversions.com/spelunkyGen/, and Yu's own account in Boss Fight Books' *Spelunky*)

This is the argument for the sampler order in section 7.2: pinned beats first, quotas second, fill last. Pinned beats and quotas are the traversable path; the fill is the filler rooms.

**FACT - constraints as the generator.** Smith and Mateas, "Answer Set Programming for Procedural Content Generation: A Design Space Approach", IEEE TCIAIG 2011: model the design space as a logic program and let a solver enumerate answer sets, so the constraints *define* the space rather than a procedure implicitly emerging one. (https://adamsmith.as/papers/tciaig-asp4pcg.pdf) Karth and Smith, "WaveFunctionCollapse is Constraint Solving in the Wild", FDG 2017 - with the caveat that the popular WFC implementation is **greedy and non-backtracking**, so it fails and must be restarted. (https://adamsmith.as/papers/wfc_is_constraint_solving_in_the_wild.pdf) Togelius et al., "Search-Based Procedural Content Generation: A Taxonomy and Survey", IEEE TCIAIG 3(3):172-186, 2011 is the canonical constructive-vs-generate-and-test framing. (https://dl.acm.org/doi/10.1007/978-3-642-12239-2_15)

**FACT - how many seeds is enough.** Hypothesis' `max_examples` **default is 100**, and the docs say the value "is chosen to suit a workflow where the test will be part of a suite that is regularly executed locally or on a CI server, balancing total running time against the chance of missing a bug"; it prints a `@reproduce_failure` blob (default true in CI) intended to be pasted into the suite. (https://hypothesis.readthedocs.io/en/latest/settings.html) QuickCheck's default `maxSuccess` is likewise **100**. (https://hackage.haskell.org/package/QuickCheck) The commit-vs-nightly split people actually run - "around 20 to 50 for fast pull-request feedback and 200 or more for scheduled nightly deep runs", plus corpus management, "save interesting inputs for regression testing" - is **community consensus, not measured**. (https://qaskills.sh/blog/schemathesis-property-based-api-testing-guide-2026)

**FACT - shrinking is the point, not the sample count.** Both frameworks reduce a failing input to a minimal reproducer, and Hypothesis emits the blob so the exact failing case becomes a permanent named test.

**FACT - the seed-replay discipline, and it is the exact model for a week generator.** Deterministic simulation testing: "simulation testing almost always involves running tests multiple times with different seeds"; when a run fails, "you can reproduce the exact failure by running with the same seed", and the failing seed is kept forever. FoundationDB's simulator and Antithesis are the reference implementations. (https://antithesis.com/docs/resources/deterministic_simulation_testing/, https://notes.eatonphil.com/2024-08-20-deterministic-simulation-testing.html) **This is the house rule "every bug becomes a permanent gate" restated in the vocabulary of seeded generation**, and it is what the property sweep in 7.3 should be built as.

**FACT - what a seed-pinned golden actually is.** Two pieces of evidence say the same thing. From the automated-testing literature: for games with procedurally generated levels, "a single change in the procedure can alter all levels, requiring retesting to ensure they remain completable". (https://www.researchgate.net/publication/346358948_Video_Game_Automated_Testing_Approaches_An_Assessment_Framework) And from the field: Slay the Spire 2's fix for correlated RNG replaced the PRNG with **xoshiro256\*\***, which by construction changes the output of every previously pinned seed. A seed-pinned golden is therefore a **change detector, never a correctness oracle** - which is exactly how `scripted-week.test.ts` already treats its hash, with seventeen numbered "MOVE" entries recording each deliberate change (`scripted-week.test.ts:477-950`).

**FACT - the snapshot-at-scale failure mode.** Teams "end up with hundreds of snapshot files that nobody reads, test suites where developers blindly press 'u' to update, and a false sense of coverage that catches nothing meaningful". (https://teachmeidea.com/snapshot-testing-benefits-pitfalls-when-to-use/; peer-reviewed treatment: https://www.sciencedirect.com/science/article/abs/pii/S0164121223001929) The mitigation this repo already practises - a small number of goldens, each change to which is a written, reasoned diff - is the right one and should not be abandoned when weeks become sampled.

**FACT - how Mega Crit validate their pools, which is the answer to "how do you know a pool is balanced".** A metric server tracking every decision, with two load-bearing metrics: **pick rate** and **win rate** per card. Giovannetti: a card with too low a pick rate is "basically not a card in our game at that point"; "in one hour we get more data than we had throughout the whole prototyping phase". Casey Yano: "the first time we made our metrics, we had three graphs; now we have at least 90." They explicitly supplement with qualitative feedback because "numbers ... are not telling us how things feel". (https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder) **Workgrumble has no telemetry and, given the product's privacy stance, should not acquire any for this.** The substitute is the headless simulator the repo already has: the five skill-level profiles in `scripted-week.test.ts` ARE a bot harness, and running them across seeds is the offline equivalent of a pick-rate/win-rate table.

### 6.9 The one finding that changes an implementation detail

**FACT, and it is 2026 and directly on point.** Slay the Spire 2 shipped **correlated PRNG streams**: separate per-system generators derived from the run seed were not independent, so knowing one outcome predicted another - knowing the opening Act narrowed which curse Neow's Bones would grant. Mega Crit's engineer: "everyone complaining about receiving Debt too often from Neow's Bones was right"; the studio confirmed "we did, in fact, have some unusual RNG problems". Their stated reason for fixing rather than shipping it: allowing it to persist would encourage "rote memorization of correlation tables, as it is tedious and unfun". (https://www.gosugamers.net/entertainment/news/78641-slay-the-spire-2-overhauls-rng-after-players-uncover-unexpected-run-correlations-removes-a-boss, discussion https://news.ycombinator.com/item?id=48552844)

**Applied directly to section 4.3's `weekSeed` proposal.** The repo's spreader is FNV-1a over `"${seed}:${day}:${key}"` (`day.ts:194-202`), a 32-bit multiplicative hash with no avalanche finalizer, and the existing seeds are *additively* related: `seedForAttempt(n) = WORLD_SEED + (n-1) * 0x9e3779b9` (`session.ts:55`), `patrolSeedFor = worldSeed + script.patrolSeed` (`week.ts:2112`). Adding a composition axis on top of additive seeds and a weak hash is exactly the shape that produced the StS2 correlation. Three mitigations, all cheap:

1. **Domain-separate every stream.** The composition draw, the drip jitter, the patrol placement and the interruption placement must each hash a distinct literal prefix (`"compose:"`, `"drip:"`, `"patrol:"`, `"interrupt:"`) so two streams cannot share a sequence.
2. **Derive, do not add.** `weekSeed` should be a hash of the tuple, not a sum of its parts, so attempt 2 of week 3 is not arithmetically near attempt 3 of week 2.
3. **Add a finalizer.** FNV-1a's low bits are poor; `% (spread*2+1)` on the raw hash (`day.ts:202`) is a modulo of a value with weak low-bit diffusion. A single xorshift-multiply finalizer before the modulo is three lines and removes the whole class. Note this **would move every existing golden hash**, so it is a deliberate one-time MOVE in `scripted-week.test.ts`'s ledger and belongs in slice 1, before any composition depends on it.

### 6.10 Daily-seed conventions

**FACT.** Spelunky's Daily Challenge gives every player in the world the same seed and a single attempt, locked until the next day (00:00 UTC), with leaderboards by depth, score or time. The stated purpose is removing the randomness that makes two players' skill incomparable: levels still generate unpredictably, but identically for everyone. (https://spelunky.fandom.com/wiki/Daily_Challenge_Mode)

**FOLKLORE (reasoning, no source).** The hidden requirement is that the seed-to-content mapping must be **frozen for the lifetime of the leaderboard**; any change to the generator or the RNG silently invalidates every historical daily. See 6.9 for what that costs in practice. Workgrumble has no leaderboard and no daily, so this constraint does not bind - but it is the reason D-E11-4 (composition keyed on `arcWeek` only vs a per-save seed) matters: the former makes weeks *shareable and discussable between players*, which is a small free win for an invite-only tester build.

### 6.11 Synthesis: what the evidence says about the proposal

1. **The proposal is the mainstream architecture, and the evidence for it is Booth's**: authoring more fixed weeks buys you those weeks and nothing else, because players learn all of them.
2. **Pin the skeleton hard and exempt it from smoothing.** Every good implementation does. Bosses are exempt from L4D's pacer; floors 1/9/15/16 of 17 are fixed in StS; the LEGENDARY cornerstone is pinned to years 2/4/6.
3. **Constrain the draw, do not enlarge the pool.** Exclusion windows and shuffle bags make a pool of 10-40 behave like a much larger one. This is the highest-leverage single decision in E11 and it materially reduces the authoring bill (section 6.5: 50-60 per employer with a 3-week window, not 95+).
4. **The budget needs hard clamps, an early ramp, and a count term as well as a minutes term.** RimWorld for the first two, D&D's group multiplier for the third.
5. **Adjust pacing, not amplitude.** Do not flatten Thursday to reduce cross-seed variance.
6. **Expect ~50% of naive draws to violate constraints** (EA SEED, 43-51%), and prefer Spelunky's answer: lay the required structure first so rejection is rare.
7. **The cost line for the owner:** the two games that beat repetition by volume did it with hand-written variation - Hades at 21,020 lines, Wildermyth writing one line per personality type and explicitly abandoning procedural plot; and the poster child for "procedural that reads authored", Unexplored, is ~5,000 hand-written rewrite rules. Pools do not remove authoring work; they change what is authored from *arrangements* to *pieces plus constraints*.

---

# Part 3 - the recommendation

## 7. The design

### 7.1 Pool taxonomy, per employer

Five things, and the ordering matters because each constrains the next.

```
EmployerContent {
  pinned:    PinnedBeat[]      // authored, placed by constraint, never sampled away
  quotas:    CategoryQuota[]   // "one of each shape across the week"
  budget:    LoadCurve         // per-day committed-minutes budget, from `load`
  pools:     Pool[]            // the fill, sampled without replacement
  atoms:     Atom[]            // multi-artifact units sampled as one
}
```

**(a) Pinned beats.** A beat is an authored bundle with a PLACEMENT CONSTRAINT, not a day number. Constraint kinds the shipped content already needs:

| Constraint | Shipped example | `file:line` |
| --- | --- | --- |
| `onDay(n)` | Friday's review | `week.ts:78` |
| `notOnDay(n)` | after-hours pings and pager fires may not be on day 5 | `week.ts:1308, :1353` |
| `notOnDay(1)` | the 4:55 class needs a night that exists | `week.ts:836-842` |
| `span(k)` consecutive working days | the project's `PROJECT_DAYS = 3` | `project.ts:186`, `day-driver.ts:3838` |
| `offset(other, +k)` | arc: incident D, ticket D+1, incident D+2, ticket D+3 | `week.ts:636, :713, :845, :891` |
| `sameMinute(other)` | the two cleaner outages at 16:56; the Halcyon earbuds/ledger collision at 10:00 | `week.ts:639, :849`; `corporate-week.ts:159-162` |
| `sameDay(other, +m)` | onboarding at 10:00, discovery drip at 10:20 | `msp-week.ts:147, :156` |
| `before(other)` | the mandate must land early enough for the sender to have moved on | `corporate-week.ts:104-107` |
| `separateNights(k)` | the two pager fires "on two separate nights rather than a wall of them" | `msp-week.ts:36-41` |
| `order([a,b,c,...])` | Halcyon's escalating exec-pressure sequence | `corporate-week.ts:36-219` |

A beat solver over five days with these constraints is small: 5 days, a handful of beats, brute force with backtracking is instant and - importantly - **deterministic and inspectable**, which is what the repo's culture demands. If no placement satisfies the constraints, the generator throws at load, exactly as `validateWeek` does.

**(b) Category quotas.** Already written down and already asserted for the probation week: one of each interruption SHAPE across the week - a call that can be benign, a mandatory block, a call about nothing, a chat that reads the dot, a walk-up (`week.ts:504-517`, `:1024-1032`, asserted `week.test.ts:490`). Generalise to a per-employer quota table:

```
quota: {
  interruptionSources: { call: [1,2], meeting: [0,1], machine: [0,1], chat: [0,2], walk_up: [0,1] },
  archetypes:          { hidden_cause: [2,4], read_the_screen: [3,6], deadline_absurdity: [0,2],
                         recurring_arc: [0,1], flood: [0,1] },
  benignCapable:       [1, 99],   // at least one interruption carrying a relatedTicket
  noHello:             [1, 2],
  afterHoursNights:    [1, 3],
}
```
Ranges, not counts, so the generator has room; the archetype set is already a closed array of five (`core-rs/src/schema.rs:72-78`).

**(c) The load budget - the arithmetic that has to be invented.**

Today `load: 1..4` means nothing mechanically. Make it a **committed-minutes budget** in the same units the feasibility gate counts in.

```
committedMinutes(day) =
    sum over arrivals of minTouchMinutes(archetype)                    // the work itself
  + sum over interruptions of (minutes + (relatedTicket === null ? REFOCUS_TICKS : 0))
  + sum over walkUps      of (slot.minutes + REFOCUS_TICKS)
  + sum over noHello      of typingMinutes
  + PATROLS_PER_DAY * CAUGHT_MINUTES                                   // 3 * 10 = 30, the floor
```

Every constant already exists: `REFOCUS_TICKS = 23` and `RING_OUT_REFOCUS_TICKS = 11` (`meters.ts:43, :61`), `PATROLS_PER_DAY = 3` (`boss.ts:40`), `CAUGHT_MINUTES = 10` (`boss.ts:88`), `SHIFT_MINUTES = 480` (`hours.ts:33`). A malignant interruption (one with `relatedTicket: null`, which the content authors deliberately - `week.ts:920-924`, `:982-986`, `:1034-1036`) costs its own minutes plus 23; a benign one costs its minutes and no focus (`interruptions.ts:1274-1290`). The only new number is `minTouchMinutes(archetype)`, and it should be measured off the solvability paths rather than invented - each path is a known number of dispatches.

and the budget is `load -> a target band as a fraction of SHIFT_MINUTES = 480`:

| `load` | target committed / 480 | reads as |
| --- | --- | --- |
| 1 | 0.45 - 0.65 | a Monday you can breathe in |
| 2 | 0.65 - 0.85 | ordinary |
| 3 | 0.85 - 1.05 | tight; something will slip |
| 4 | 1.05 - 1.30 | Thursday; you cannot do all of it |

**And a count term, which the external research says is not optional.** D&D 5e's encounter budget multiplies the summed XP by a group-size factor (1 monster x1, 2 x1.5, 3-6 x2, 7-10 x2.5, up to x4 at 15+) precisely because the same total partitioned differently is not the same difficulty (section 6.6). Five small tickets and one big ticket with equal summed minutes are not the same day: five tickets is five triages, five response clocks, five context switches. So the budget is `committedMinutes * f(arrivalCount)`, with `f` calibrated in slice 1 against the two ends the shipped content already provides - Wednesday's 6 arrivals and Thursday's 5 arrivals plus three takeovers.

Two properties this buys, both of which the existing math makes safe:

1. **The review mark is scale-invariant** (`week.ts:262-265`, `week.test.ts:814-880`), so a heavier day does not automatically score worse - it scores worse only if the player actually fails to close or breaches. That is the honest coupling: `load` controls *pressure*, `weekPerformance` measures *outcome*.
2. **`load > 1.0` is legitimate and must stay legitimate.** The shipped Thursday is meant to be undoable-in-full; the balance table's "half the roster" profile passes at 54 (`scripted-week.test.ts:1480-1497`). So the budget's job is not "everything fits", it is "the week's TOTAL is inside a band and the RAMP is monotone Monday-to-Thursday". This is Booth's rule restated: "**the algorithm adjusts pacing, not difficulty - amplitude (difficulty) is not changed, frequency (pacing) is**" (section 6.6). Flattening Thursday to reduce cross-seed variance would be pulling the wrong lever, and it would delete the day the week is shaped around.

Calibrate the four bands by measuring the shipped weeks first (slice 1's deliverable is that measurement, committed as a table). Do not invent the numbers.

**(d) Pools.** Per employer, per slot-kind, sampled **without replacement within a week** (I34 already forbids a ticket twice) and with a **recency penalty across weeks** (see 7.2). Each pool entry carries eligibility predicates:

```
PoolEntry {
  ticketId
  slots:      ('inherited' | 'drip' | 'pinnedClose')[]
  employers:  EmployerId[]           // its `nodes` must exist in that world
  archetype                          // for the quota
  weight:     number                 // authorial, not uniform
  requires?:  string[]               // atom siblings, world preconditions
  excludes?:  string[]               // "not in the same week as"
}
```

The `employers` field is the hard one and it is a **world-graph** question, not a taste question: a ticket's `nodes` (`types.ts:56-62`) must exist in the employer's estate. That check is mechanical and belongs in the loader.

**(e) Atoms.** The coupled bundles from section 3.2: flood clusters (parent + N duplicates), linked requests (mail + chat + Hubbub + summoned ticket), DM/walk-up + summoned ticket, the reply-all storm. An atom occupies one pool draw and expands into multiple slots across multiple columns. `duplicatePath` (`flood.ts:52-68`) is already a factory for the flood case.

### 7.2 The sampler, in order

```
1.  weekSeed = fnv1a(`${seedForAttempt(attempt)}:${employer}:${arcWeek}`)
2.  place pinned beats            (constraint solve; throw if unsatisfiable)
3.  choose day templates          (ramp shape from arcWeek; load curve per day)
4.  fill quotas                   (each category's minimum, cheapest-first)
5.  fill to budget                (weighted draw without replacement, recency-penalised)
6.  place minutes                 (slot layout: morning pile <= 2, drips inside dripWindow,
                                   pinnedClose outside it, one takeover at a time)
7.  derive patrolSeed per day     (hash(weekSeed, day))
8.  validateWeek(generated, employerRooms)     <- the existing loader, unchanged
9.  auditGeneratedWeek(generated, weekSeed)    <- the NEW week-level gate (7.3)
```

**Seed hygiene, and this is not optional** (section 6.9). Each of steps 2, 5, 6 and 7 must draw from a **domain-separated** stream: `hash("compose:" + weekSeed + ...)`, `hash("place:" + ...)`, `hash("patrol:" + ...)`, and the existing `drip:` / `interrupt:` keys made explicit. `weekSeed` must be a HASH of the tuple, not a sum of its parts, so attempt 2 of week 3 is not arithmetically adjacent to attempt 3 of week 2. And `seededOffset` (`day.ts:182-203`) needs a xorshift-multiply finalizer before its `% (spread*2+1)`, because FNV-1a's low bits are poor and that modulo reads exactly those bits. Slay the Spire 2 shipped the failure this prevents.

Steps 8 and 9 are the safety net: if either refuses, **reroll with a derived sub-seed and a bounded retry count, then throw**. Generate-and-test is the right pattern here and it is what the repo already does implicitly (`buildInterruptionSchedule` self-checks, `interruptions.ts:791`). A bounded retry with a hard throw is honest; an unbounded one hides a content bug. Expect the rejection rate to be non-trivial: EA SEED measured 43-51% validity on naively generated match-3 levels against a designer constraint (section 6.6). **The mitigation is the sampler's ORDER, which is Spelunky's answer** (section 6.8): lay the required structure down first - pinned beats, then quotas - and fill around it, so the fill step cannot break what the structure guarantees and rejection becomes rare rather than routine.

**The recency window** is the anti-repetition device, and per section 6.5 it is a better investment than pool size. Keep an N-week ring of drawn pool-entry ids on the career carry (a short string list, cheap to serialise, or - better - derive it by re-running the sampler for weeks `max(1, arcWeek-N) .. arcWeek-1`, which costs nothing to save because it is a pure function of the same three scalars). An entry drawn in week W is weight 0 for weeks W+1..W+N, then ramps back. This is the shuffle-bag / cooldown pattern that Slay the Spire, Left 4 Dead, Tetris and RimWorld all independently arrived at. Recommend **N = 3** and a per-employer drip pool of 50-60, which makes a repeat inside three weeks structurally impossible rather than merely unlikely.

### 7.3 What the gates become

**Gate A - the loader, unchanged.** `validateWeek` already refuses I1-I34 and `requireSlot` refuses I43-I52. Run it on **every generated week at generation time**, not just at module load. Zero new code, and it is the reason the generator is safe to write at all.

**Gate B - the golden splits in three.**

A framing point first, from section 6.8: **a seed-pinned golden is a change detector, never a correctness oracle.** A single change to the generator, or to the PRNG, alters every pinned seed at once - Slay the Spire 2's xoshiro256** swap did exactly that. This repo already treats its golden that way, with seventeen numbered "MOVE" entries recording each deliberate diff (`scripted-week.test.ts:477-950`), which is the right practice and should survive. Keep the goldens FEW (3-5, not hundreds) and move everything they currently prove *incidentally* into properties.

1. **A pinned-seed byte-golden.** Keep `scripted-week.test.ts` exactly as it is, but pin the composition seed as well as the attempt: `weekSeed(attempt=1, employer='workgrumble', arcWeek=1)` must produce a `DayScript[]` **deep-equal to the current hand-authored `WEEK`**. That is the strongest possible migration gate: the generator's first job is to reproduce the shipped week from the shipped pools. If it can, every existing golden - the hash, the 28/28/0, the £777.75, the timeline, the five-profile table - survives untouched. **Make this slice 2's acceptance criterion.** (FOLKLORE, but the reasoning is sound: it converts a rewrite into a refactor.)
2. **A property sweep over the seed space.** For `arcWeek` 1..8 x each employer x a fixed list of seeds, assert: `validateWeek` accepts, `auditGeneratedWeek` returns no complaints, quotas are inside their ranges, the load curve is monotone Mon-Thu, and every pinned beat landed. Per-commit: 100 seeds (the QuickCheck default). Deep sweep: 10 000, with the failing seed printed so it can be pinned as a new golden. When a seed fails, **shrink** by reducing the pool to the drawn subset and re-running - the minimal reproducer is a week table you can paste into a test.

   Two disciplines from the property-testing and deterministic-simulation-testing worlds (section 6.8) apply directly and both match house rules already in force. **Shrinking**: when a seed fails, reduce the pool to the drawn subset and re-run until you have a minimal week table you can paste into a test - Hypothesis emits a `reproduce_failure` blob for exactly this purpose. **Seed replay**: every seed that has ever broken an invariant becomes a permanent named regression, and is proven to have teeth by re-running it against the reverted fix. That is the standing "every bug becomes a permanent gate" rule stated in the vocabulary of seeded generation, and FoundationDB/Antithesis-style DST is the reference practice for it.

   Note on where the deep sweep runs: this repo has **no `.github/workflows` directory at all** and is private, so there is no CI to put a nightly on and the house rule forbids adding one. The deep sweep is a local gate script - `npm run gate:seeds` alongside the existing `gate` / `gate:core` / `gate:e2e` (`package.json`) - run by the overseer before a release, not on every commit. Also: the per-commit sweep must run under `--no-file-parallelism`, because parallel vitest false-fails under load in this repo.
3. **A committed distribution table.** The five-skill-level balance table (`scripted-week.test.ts:1439-1590`) generalised from exact numbers to **bands and orderings** over a seed sample. This generalises cheaply because **the five play-functions are already content-independent**: `workedWeek` / `slackWeek` / `idleWeek` are just sweep patterns, and `halfTheRoster(id)` picks its half by the parity of the ticket id's character-code sum (`scripted-week.test.ts:405-413`) - a pure function of the id, so it splits any generated roster in half without editing. Only the pinned NUMBERS are seed-dependent. Assert: "worked properly" scores >= 90 on every seed; "half the roster" scores 48-60 and passes; "nothing at all" scores <= 10 and is fired; the ordering `worked > half > nothing` holds on every seed; no seed produces a week where "worked properly" fails. That table is the design claim, and a band is the honest form of it once composition varies.

   **This is also the substitute for telemetry the repo will never have.** Mega Crit balance their pools off a metric server tracking pick rate and win rate per card, with "at least 90" graphs (section 6.8). Workgrumble is invite-only with a privacy stance and should not acquire play telemetry for this. The five profiles ARE a bot harness - driven headlessly through the shipped driver - and running them across a seed sample is the offline equivalent of a pick-rate table: if a pool entry never appears in any sampled week, or appears and is not closed by the profile that closes everything else, the sweep says so and no player has to.

**Gate C - `auditGeneratedWeek`, the generalised feasibility gate.** Three changes to `auditDayTiming` (`solvability.test.ts:637`), each of which is worth doing on its own merits:

- **C1. Take the week as a parameter.** `dealtOn(day, seed)` -> `dealtOn(day, seed, week)` and `bookedOn` -> `interruptionPlanFor(on, seed, week)`. Then run it over all four SHIPPED weeks as well. *Expect this to find existing defects*, because Bodgeworth, the MSP and Halcyon have never been audited. Do it in slice 1, before any generation, so the failures are attributable.
- **C2. Audit the RESPONSE clock too.** Today only the resolution deadline is checked (`:628`). The SLA-attainment half of the review mark scores `(arrived - breached) / arrived`; the response target is what the queue badge shows and what a player is chasing. Add a second complaint kind: a ticket whose response target has fewer than *k* clear minutes in it.
- **C3. Add the AGGREGATE check.** Per-ticket clear air does not compose. Add a day-level assertion: `sum over tickets of minTouchMinutes <= clearMinutesInTheDay`, where `minTouchMinutes` is a per-archetype constant (a `read_the_screen` ticket is 2 minutes, a `hidden_cause` is 10). This is the check that catches the generator's characteristic failure - eight individually-reachable tickets that together do not fit - and hand-authoring never needed it because a human counts.

**Gate D - per-ticket solvability is untouched.** `solvability.test.ts:481-547` proves every ticket closable from its own setup, independent of which day deals it. The generator does not write tickets. Issue #51 is right about this and it should be stated as a non-goal so nobody re-litigates it.

**Gate E - the save round-trip.** New, and mandatory: a save taken on day 3 of a generated week at `(employer, arcWeek, attempt)` reloads into a week deep-equal to the one saved. This is the `save.ts:493`/`:626` defect from section 5.1, and it is invisible without an explicit test.

## 8. Week 2+ at the same employer

### 8.1 What has to exist

Today `arcWeek` exists, is saved, is carried through a retry, and is *never incremented at the same employer*. A pass hands you the next shop (`weekend.ts:364-370`: `'Start Monday again'` / `` `Take the job at ${nextName}` `` / `'Week two'` as the unreachable pending fallback); a firing hands you the same Monday. So E11 has to add a third onward door: **stay, and it is week `arcWeek + 1`**.

That door is small: `weekend.ts` gains a button, `carryForEmployer`-equivalent keeps the employer and increments `arcWeek` instead of resetting it (`career.ts:153-166`), and `nextEmployerAfter`'s placeholder wrap (`employers.ts:328-332`) stops being the only forward path.

**And here is the sharpest way to state the wall.** `EMPLOYER_ARC` (`pressure.ts:539-543`) declares `weeks: 12` and carries one season, `REDUNDANCY_ROUND` (`:526-537`), whose beats fire at **weather week 4, notice week 6, criteria weeks 7-9, decision week 10**. All four employers use that same arc (`employers.ts:163, :203, :234, :264`). The loader enforces the pacing: nothing in the probation week, `QUIET_WEEKS_BEFORE = 2` so the earliest anything may happen is week 4, `QUIET_WEEKS_AFTER = 2`, one season per employer, four beats in order (`pressure.ts:458-472`, `:555-640`).

So: **each employer is authored as a twelve-week job with a redundancy round at weeks 4-10, and the game ships exactly one of those twelve weeks.** The entire systemic layer - nine catalogued pressures, the four-beat contract, the selection matrix in `pool.ts`, the `redundant` outcome and its statutory week's pay (`week.ts:161`) - is shipped, tested, documented and **unreachable in play**, because no career ever gets to week 4. E11 is the only thing standing between that subsystem and a player, and unlocking it is a bigger prize than variety.

### 8.2 Does a machine fixed last week stay fixed?

**The case for PERSISTENCE (estate carries).**

- It is what the fiction says. The whole design idiom is "the fault exists in the world whether or not anybody was watching" (`arc.ts:44-51`, `tickets/index.ts` precondition model). A printer you power-cycled on Friday being off again on Monday with no incident behind it is the world lying.
- It is what the *recurring arc already teaches*. The Tuesday/Thursday cleaner arc's entire lesson is that the second occurrence needs a different fix because the first one was only power. Reset the estate weekly and that lesson becomes a coincidence.
- It is the substrate the whole product is built on. Resolution is a boolean over the graph (`world.rs:988-1002`); the estate accumulating your fixes is the only way "you have been here nine weeks" is legible.
- E10 fork B (cross-week projects) **requires** it. A half-migrated OU has to survive Friday or there is no project.
- It gives the generator a natural anti-repetition constraint for free: a ticket whose `setup` would re-break something the graph already records as fixed is ineligible unless it has an authored recurrence reason.

**The case for RESET (fresh world each week).**

- Every golden in the project depends on a world built from `employer.setup()` and nothing else (`session.ts:249-254`). Persistence means the world at week N is a function of everything the player did in weeks 1..N-1, and no golden can pin it.
- It is a save-schema bump and a real one: the engine payload would have to carry across `endWeek`, which today it explicitly does not (`titles-projects-engine.md:150-153`, "Nothing else crosses a week boundary").
- It makes solvability *conditional*. A ticket's `setup` assumes a starting state; if the player has already changed that state, the setup's precondition may be unreachable or already satisfied. The gate at `solvability.test.ts:513` ("ships nothing that is already fixed when it arrives") becomes a per-world question rather than a per-ticket one.
- It risks a **death spiral**: a player who breaks something in week 2 and cannot fix it carries a broken estate into week 3, and the generator has no way to know the world is unwinnable.

**Recommendation: PERSIST, narrowly, with a whitelist.**

The honest answer is persistence, because the alternative is the world lying and because E10 needs it. But do not carry the whole graph. Carry a **declared estate delta**: a small, typed, per-employer list of fields whose values survive the week, written the same way `carrySetup` writes career fields - only the fields a content author has *named* as persistent (a machine's `powerLosses`, a note by the socket, an account's group membership, a service's start-mode, a project's phase state). Everything else is rebuilt from `employer.setup()`.

Why that shape:

- It keeps the goldens: a week with an empty delta is byte-identical to today, which is the same discipline `carrySetup` uses for the career fields (`session.ts:435-441`, "with no career on the carry nothing is pushed here").
- It keeps solvability decidable: the generator can ask "does this ticket's setup conflict with the declared delta?" against a small enumerable list, not against an arbitrary graph.
- It kills the death spiral: only whitelisted fields carry, so no amount of player damage can make week N+1 unwinnable through an unenumerated channel.
- It is a save-schema bump (schema 5), and that is fine - the upgrade path is "no delta", which is exactly what `save.ts:174-176` did for the employer id.

The narrower alternative, if the owner wants E11 without a schema bump: **persist nothing, but make the generator aware of arcWeek in the fiction** - week 2's tickets are written as follow-ons ("the printer is off again"), so the continuity is authored rather than simulated. This is cheaper and honest, and it is the Fork-A-equivalent for the estate. It does not unblock E10 fork B.

### 8.3 Retry semantics under generation

Unchanged in shape, and the existing comment already says how: composition keyed on `(employer, arcWeek)`, minutes keyed on `attempt` (section 4.3). A retry of week 3 is the same week - same tickets, same people, same review - and not the same minutes (`session.ts:40-45`). `RetryRecord` already carries all three scalars (`retry.ts:43-74`).

Two additions:

- **The retry must NOT reroll the pool draw.** If it did, the retry would be a different week, which breaks the contract the whole retry mechanic is built on, and would make the fund-preserving firing feel like a punishment lottery.
- **The estate delta on a retry** is the delta as it stood at the START of the failed week, not at its end. A firing does not hand you the damage you did in the week you were fired for. (`retry.ts:26-27`: "Everything else - the world, the meters, the queue, the reputation that got you fired - is built again from nothing.")

## 9. Slice plan

Each slice is independently shippable and independently gated. Versions are indicative bundles per the owner's larger-updates cadence.

**Slice 1 - make the ramp real, and audit what already ships.** (no generation yet)
- Generalise `auditDayTiming` to take a week (C1) and run it over all four shipped weeks under all three presence values.
- Add the response-clock complaint (C2) and the aggregate check (C3).
- Define `committedMinutes(day)` as a pure function and **measure** the four shipped weeks with it; commit the table.
- Turn `load` into an enforced band: `validateWeek` refuses a day whose committed minutes fall outside its `load` band, and refuses a non-monotone Mon-Thu ramp.
- **Seed hygiene, done here rather than later:** domain-separate the existing streams and add the finalizer to `seededOffset` (section 6.9). This moves every golden hash exactly once, as a deliberate eighteenth MOVE in the ledger, at the cheapest possible moment - before any composition depends on it.
- **Gate:** the four shipped weeks pass the generalised auditor (or the defects it finds are fixed first, which is the point of doing this before generation); the committed-minutes table is committed; a hand-broken week fails each new check by name; the golden hashes move once, deliberately, with the diff written down.
- **Risk:** this slice may fail on the shipped MSP or Halcyon weeks. That is a finding, not a blocker, and it is much cheaper to discover here.

**Slice 2 - the generator that reproduces what ships.**
- `EmployerContent` types (pools, quotas, budget, pinned beats, atoms) as data.
- The constraint solver for pinned placement; the weighted sampler; minute placement.
- Author each of the four employers' current weeks AS a pool + pinned-beat description whose only satisfying draw at `weekSeed(1, employer, 1)` is the shipped week.
- `Employer.week` becomes `weekFor(seed)`; four call sites move; `resync()` derives the week from `(weekAttempt, arcWeek, employer)` read off the world.
- **Gate:** `weekFor(weekSeed(1, e, 1))` deep-equals the shipped `WEEK` / `SECOND_WEEK` / `MSP_WEEK` / `CORPORATE_WEEK` for all four. Every existing golden - the hash, the counts, the pence, the timelines, the five-profile table, the Bodgeworth golden - passes untouched. Plus Gate E, the save round-trip. And the whole Playwright suite (`e2e/week.spec.ts`, `e2e/total-walk.spec.ts`, `e2e/full-day.spec.ts`, `e2e/msp.spec.ts`, `e2e/corporate.spec.ts`) passes unchanged, which it will only if the reproduction is exact - those specs assert on named tickets at named minutes against the real built artifact.
- **This is the slice that makes E11 safe.** If it lands, the rest is content.

**Slice 3 - variation inside week 1.**
- Grow the pools toward 50-60 drip entries per employer (2-3x today, section 6.5), drawing trope material from `docs/research/ticket-material.md`. Weight by author intent, not uniformly - Slay the Spire's pools run 6:1 within a tier.
- The 3-week recency window, the shuffle-bag draw, and the reroll-with-bounded-retry loop.
- **Gate:** the property sweep (Gate B2) at 100 seeds per commit, 10 000 nightly. Quotas in range, budget in band, all pinned beats placed, `validateWeek` + `auditGeneratedWeek` clean on every seed. Plus the distribution table (Gate B3) over a 20-seed sample.

**Slice 4 - week 2 at the same employer.**
- The `weekend.ts` onward door; `arcWeek` increments; the ramp shape varies by `arcWeek` (week 1 is the teaching week, week 2+ is not).
- The declared estate delta and save schema 5, IF the owner takes the persistence recommendation. If not, this slice is content-only.
- **Gate:** a two-week career walk driven headlessly end to end (the scripted-week golden's older brother): week 1 worked, week 2 generated, both survivable, the carry correct, the estate delta correct, a save mid-week-2 reloading into the same week. Plus: no ticket appears in both weeks unless it is an authored recurrence.

**Slice 5 - the arc reaches the player.**
- With `arcWeek` now able to reach 4+, the pressure layer fires for the first time in play: weather at week 3, notice, criteria, decision (`pressure.ts`, four-beat contract).
- **Gate:** a walk that reaches the redundancy round, the matrix is drawn, the `redundant` outcome is reachable and carries clean (`week.ts:117-134`, `career.ts:121-140`). This is proving a shipped subsystem, not building one.

**Slice 6 (optional, and the honest place for it) - cross-week projects.**
- E10 fork B on top of the estate delta.

## 10. Owner decisions the epic needs before build

**ANSWERED (owner, 2026-08-12) - recorded verbatim-in-substance, refinements
flagged where the answer was a direction rather than a value:**

- **D-E11-1: YES** - the estate persists; the recommendation as written
  (per-employer field whitelist, schema 5). Unblocks E10 fork B.
- **D-E11-2: SHORTEN** ("more fun that way"). The shorten option on the table
  was six weeks with the season re-timed; SIX is the overseer's instantiation
  of "shorten" and the re-time slice should present the exact number for a
  nod before the redundancy round moves.
- **D-E11-3: MULTIPLE WAYS** - not one wrap answer; the owner wants several
  post-arc exits designed together (new-employer offer, an ending, a legal
  wrap with rising arcWeek all candidates). Needs a short design proposal,
  not a pick.
- **D-E11-4: PER-WEEK** - composition keyed on arcWeek only; weeks shareable
  between testers; goldens keep.
- **D-E11-5: YES** - load becomes player-visible (the morning-brief reading).
- **D-E11-6: the recommendation stands with the owner's calibration** -
  "boring shoveling and repetition is expected but not too much": 3-week
  exclusion window, drip pools at 50-60 per employer, and the tone note that
  SOME repetition is the job's own texture, deliberately kept.
- **D-E11-7: E11 FIRST** - E9 inherits the pool machinery.

- **D-E11-1. Does the estate persist across a week at the same employer?** Section 8.2. My recommendation: yes, via a declared per-employer field whitelist, schema 5. The cheap alternative (authored continuity, no persistence) is legitimate and does not unblock E10 fork B. **This is the decision the slice plan branches on and it should be settled first.**
- **D-E11-2. Is the authored twelve-week arc the target, or is it too long?** The code already answers "twelve weeks, redundancy round at weeks 4-10" (`pressure.ts:526-543`), and that number sizes the pools. But twelve weeks x four employers is 48 weeks of play, and nobody has playtested even two. The honest options are: build to twelve and accept that most players will not see it; shorten the arc to 6 and re-time the season; or make `weeks` per-employer so the probation shop is short and the MSP is long. **Confirm before pool sizing, because pool size is a direct function of this number.**
- **D-E11-3. What replaces the `nextEmployerAfter` wrap?** Today it loops back to the probation shop (`employers.ts:328-332`, documented as a placeholder). Options: a fifth employer, a "you have run out of jobs" ending, or the wrap becomes legal because `arcWeek` keeps climbing and the probation shop's week 9 is not its week 1.
- **D-E11-4. Is variety per-week or per-career?** i.e. does a player replaying the whole game from scratch at attempt 1 get the same week 1 every time (composition keyed on `arcWeek` only, my recommendation - it keeps the goldens and matches the daily-seed convention) or a different one (composition keyed on a fresh per-save seed)?
- **D-E11-5. Does `load` become player-visible?** It is content-side today and invisible (`titles-projects-engine.md:207`, G6). A morning brief that says "today looks heavy" is a QoL win and a forecastability win (the fun survey's point 3, "the cost is forecastable mid-flight"), but it is also a number that invites optimisation.
- **D-E11-6. How many weeks before repetition is allowed to be noticeable?** Section 6.5 has the arithmetic; the owner supplies the number. My recommendation: **three**, delivered as an exclusion window rather than as pool size, which puts the drip pool at 50-60 per employer (2-3x today) instead of 95+ (5x). The alternative reading - "a player should never see the same ticket twice in a career" - costs roughly 250 entries per employer and, by the coupon-collector row in 6.5, means most of that authoring is never seen by anybody.
- **D-E11-7. Does E11 gate on E9's per-title work-mix?** `titles-difficulty.md:129-143` D2 ("blend ratio per title") and D6 ("E9 content pool or E8-leftovers pool") are the same taxonomy this spike proposes. If E9 lands first, E11 inherits its work-mix table as a quota source. If E11 lands first, E9 gets the pool machinery for free. **My recommendation: E11 first**, because the pool machinery is the general thing and a work-mix is one more quota row.
