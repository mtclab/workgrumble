# Review scoring: how the Friday conversation should read a week

2026-08-01. Engineering/design reference for the probation-review decision and the career-layer
scoring it grows into, written against the shipped system (v0.2.4). Facts cited; the
recommendation at the bottom is a proposal for the owner to decide from, not a decision.

Scope: how the review turns a played week into a pass or a fire, whether that method survives
content growth, and what the same machinery has to become once there is more than one week and
more than one employer. It does not propose new ticket content, new apps, or new meters beyond
what a scoring change requires.

---

## 1. The problem, precisely

### 1.1 What the review reads today

One number. `day.review_passed` and `day.review_fired` are guarded on
`field_at_least(player, week_reputation, 40)` (`src/world/actions/day.ts:158-166, 213-221`), and
`week_reputation` is the reputation meter folded day over day at `REVIEW_WEIGHT = 0.5`
(`src/world/week.ts:95-118`), so Friday is half the answer, Thursday a quarter, Monday about a
sixteenth.

The meter it folds moves from three places only (`src/world/meters.ts:182-193`,
`src/world/boss.ts:67-68`):

| Event | Reputation | Where |
|---|---|---|
| Ticket resolved | `+ reward.reputation` (1 to 8, mean 3.84 over the shipped roster) | `meterDeltas.reputationUp` |
| SLA deadline missed | `- 3` (`REPUTATION_PER_BREACH`) | `meterDeltas.reputationDown` |
| Caught with a slack window open | `- 6` (`CAUGHT_REPUTATION_COST`) | boss visit, `day-driver.ts:1113-1124` |

The meter starts at 50 and clamps to 0..100.

### 1.2 The asymmetry

Resolution credit is a function of the roster. The shipped 26 ticket definitions carry 96 points
of `reward.reputation` between them, and every ticket added puts more credit on the table for
anybody who closes it.

The caught penalty is a function of the clock. `PATROLS_PER_DAY = 3` (`src/world/boss.ts:40`),
five days, so the lead's rounds are 15 per week whether the week holds 20 tickets or 60. The
maximum a week of continuous, visible slacking can cost is 15 x 6 = 90 points, permanently.

Breach cost sits in the middle and is the weaker term: a ticket ignored costs its own credit
(mean 3.84) plus 3, which is why ignoring work is cheaper per unit than being seen.

### 1.3 The arithmetic, and where it crosses

The meter is very nearly linear in those three terms. Reconstructing the five measured profiles
from `50 + credit - 6*caught - 3*breached`:

| Profile | Model | Measured meter |
|---|---|---|
| worked properly | 50 + 96 - 6 - 0 = 140 -> clamps to 100 | 100 |
| half the roster | 50 + ~49 - 0 - 36 = 63 | 63 |
| worked, browser up all week | 50 + 96 - 90 - 0 = 56 | 57 |
| half, browser up all week | 50 + ~49 - 90 - 36 = -27 -> clamps to 0 | 0 |
| nothing at all | 50 + 0 - 72 - 72 -> clamps to 0 | 0 |

(`src/shell/scripted-week.test.ts:727-782`.)

The committed table in that file records the same two profiles at two roster sizes:

```
roster    worked   half   slacked   both     gap (half - slacked)
23        96       67     51        5        16
25        97       63     56        5         7
```

Two independent readings of the trend agree:

- Measured: the gap falls 4.5 points per ticket added, reaching zero at about 26.6 tickets.
- Modelled: `half(T) = 50 + (T/2)(3.84 - 3)` versus `slacked(T) = 50 + 3.84T - 90`, which cross
  at `T = 90/3.42 = 26.3`.

**The crossover is at roughly 26 to 28 tickets, depending on the credit weights of whatever is
added next.** The shipped roster is 25. This is not a defect that arrives eventually; it arrives
in the next content slice.

### 1.4 Two more consequences of the same shape, worth naming

- **The pass bar drifts.** `half(T) = 50 + 0.42T` rises with the roster. A week that quietly
  lets half the queue go red scores 63 at 25 tickets, about 67 at 40, and can never fall below
  50. Under the current model a half-effort week is unconditionally safe and gets safer as
  content is added. That is the textbook "more content, easier win threshold" failure.
- **The slacking week already flipped once.** `slacked(T) >= 40` from about T = 21. Below
  roughly 21 tickets, closing the whole roster with the browser up all week was a firing. It is
  now a pass with 16 points of room. Nobody decided that; the roster grew.

### 1.5 The question

Not "is 40 the right number". The threshold is fine and the weighting is fine. The question is
whether the review should keep reading **one summed absolute score** at all, given that one of
its terms scales with content and another does not - and, given the career arc in
`DESIGN_POC.md` sections 2 and 6, what that mechanism has to become when there is a second
employer and a fifth year.

---

## 2. Findings A: how service organisations actually judge a first-line worker

### 2.1 The metric set that is actually used

The published frameworks converge on a small set, and it is not "tickets closed".

MetricNet's service desk balanced scorecard, published through HDI, names six: **cost per
ticket, customer satisfaction, technician utilisation, first contact resolution rate, technician
job satisfaction, average speed of answer** ([MetricNet balanced scorecard][metricnet]). Contact
centre practice (COPC) spans five categories at site level: **quality (evaluated interaction
scores), service (speed of answer, accessibility), efficiency (handle time, occupancy,
utilisation), customer experience (CSAT, NPS, resolution), and cost**
([COPC balanced scorecard][copc]).

At the individual analyst level the operational set in common use is: **FCR, SLA attainment,
reopen rate, CSAT, backlog age/ageing profile, tickets per analyst**
([Zendesk help desk metrics][zd-metrics], [SIIT service desk metrics][siit],
[Asset Management Global 2026 guide][amg]).

Benchmarks worth having in hand, because they are what a "bar" looks like in the trade:

- FCR: industry benchmark around 70 percent, 74 percent a common average, 80 percent+ strong
  ([SQM FCR][sqm], [Zendesk FCR][zd-fcr] - already cited in `real-systems.md` section 8).
- SLA compliance: typically above 90 to 95 percent for standard incidents ([siit], [amg]).
- CSAT: above 85 percent, or 4/5 ([siit]).
- Backlog age: an internal objective of no more than 5 percent of tickets older than 7 days
  ([siit]).
- Utilisation: senior technical staff target 75 to 85 percent billable; above ~90 percent is
  read as a burnout signal, not an achievement ([Scoro billable utilisation][scoro],
  [Teamwork utilisation][teamwork]).

The SDI Service Desk Analyst Professional Standard (v8, 2020) is the closest thing to a named
competency standard for the individual. Its four assessed sections are **Professionalism,
Analyst Skills, Processes/Practices/Procedures, and Resources** - professionalism is the *first*
and separately weighted section, not a modifier on the performance sections
([SDI SDA standard][sdi-sda]). That structural fact matters more here than any single metric.

### 2.2 Volume-dependent versus volume-independent measures

**Volume-dependent (counts):** tickets closed, tickets per analyst, contacts handled. These are
capacity and workload measures. Every published caution about them says the same thing: they
describe throughput, not performance, and they are the ones that get gamed.

**Volume-independent (ratios):** FCR percentage, SLA attainment percentage, reopen rate, CSAT
average, backlog-age percentage, utilisation percentage. Each is a fraction of what was
available, so a busier month and a quieter month produce comparable figures. This is exactly the
property the Friday review is missing.

MetricNet's method is the canonical way these are combined, and it is worth stating precisely
because it is directly portable:

1. Choose the metrics.
2. Assign a weight to each by relative importance (their guidance: overweight cost and customer
   satisfaction as the foundation metrics).
3. Set a **range of performance, worst case to best case**, for each metric, taken from a
   benchmark.
4. Enter actual performance.
5. Interpolate each metric's position in its range into a score.
6. Multiply by weight, sum.

"Your balanced score will always range from 0 to 100 percent (or, the worst possible performance
for every metric in the scorecard to the best possible performance for every metric)"
([metricnet]). Running hundreds of service desks through it produces a normal distribution
centred at 50 percent; above 61 percent is top quartile, 39 to 50 percent third quartile, below
39 percent bottom quartile.

That is a normalised, volume-independent, weighted composite with a published distribution and
published quartile bands. It is the single most directly applicable finding in this document.

COPC add one implementation rule that reads straight across to game design: the composite uses
**weighted, not averaged** category scores, and agents are measured on **controllable** metrics
only - not on call volume patterns or system outages they did not cause ([copc]).

### 2.3 The documented pathologies of each metric

Every one of these is Goodhart's law with a job title attached: when a measure becomes a target
it ceases to be a good measure ([Splunk on Goodhart][splunk], [KPI Tree][kpitree]).

- **Closed-ticket volume -> cherry-picking.** Agents skip hard tickets for easy ones. "An agent
  who clears 50 simple tickets might look more productive than one resolving 20 complex cases,
  even though the latter provides more value" ([Supportbench][supportbench]). The recommended
  counters are FIFO queue discipline, touches-per-ticket, and evaluating FCR team-wide rather
  than individually ([Nicereply cherry-picking][nicereply]).
- **Closed-ticket volume -> premature closure.** Teams measured on closure rate "rush or
  prematurely close tickets" and produce "hasty, copy-pasted responses" ([splunk]); developers
  told to close 100 bugs a month "close tickets that are not truly resolved or split a single
  bug into multiple tickets to inflate numbers" ([kpitree]). This is why **reopen rate is the
  standing companion metric**: "reporting high ticket closure rates can be misleading until you
  examine the re-open rate, the average number of contacts per resolution, or the CSAT score of
  those closed tickets" ([siit]).
- **Reassignment / ticket ping-pong.** Tracking reassignment rate reveals agents pushing
  difficult work back into the queue ([supportbench]). ServiceNow keeps a reassignment count on
  the incident for this reason (`real-systems.md` section 1).
- **Utilisation -> timesheet padding.** "If a business stops recording non-billable time, its
  utilisation rate will always be 100 percent"; targets pushed near 100 percent produce "quality
  issues, burnout, or timesheet gaming" ([scoro], [teamwork]).
- **FCR itself** is not immune - it can be inflated by declaring things resolved that the user
  will come back about, which is why it is paired with repeat-contact and CSAT ([sprinklr] via
  `real-systems.md` section 8).

The general mitigation, stated the same way by several sources: **pair every efficiency metric
with a quality or outcome metric, so that gaming one shows up as a cost in the other**
([splunk]).

### 2.4 Conduct is a separate track, not a subtraction

- **Separate by category.** "Misconduct involves intentional or negligent conduct... whereas
  poor performance is actually doing the job poorly. While it may impact the work, misconduct is
  separate and apart from the actual work" ([SHRM][shrm]). "You may be able to train away poor
  performance, but you can't train an employee to get to work on time, not lie to you, or not
  steal from you" ([UKG][ukg]).
- **Separate by process.** Using the annual evaluation as a disciplinary mechanism is described
  as improper, because it lets undesirable behaviour continue until the end of an evaluation
  period; a separate immediate process is required ([Sports Management Resources][smr]). US
  federal guidance keeps performance issues and misconduct on different statutory tracks
  entirely ([OPM][opm]).
- **Separate inside the scorecard, as a veto.** Call-centre QA scorecards implement conduct as
  **auto-fail** ("fatal error") items: "if an agent gets zero points for an auto-fail question,
  they automatically get an overall Fail grade for that particular customer service interaction"
  ([MaestroQA auto-fail][maestro]). The guidance is explicit that these "operate independently
  from standard scoring", that 3 to 5 of them plus 6 to 10 graded behavioural criteria is the
  working shape, and that **mixing critical and graded criteria into one number is the most
  common scorecard design mistake** ([maestro], [Call Centre Journal][ccj],
  [VereQuest][verequest]).

### 2.5 How conduct actually converts - the latent record

The veto in 2.4 is real and severe, and it applies to almost nothing, because almost nothing is
looked at.

- **Coverage.** Contact centre QA reviews 1 to 3 percent of interactions, commonly 1 to 2
  percent; "more than 98 percent untouched" ([Spoke][spoke],
  [Medium: QA is statistically meaningless][qa-math]).
- **Targeting.** The rest is covered by **trigger-based review**: post-complaint follow-up,
  supervisor transfers routed to an automatic review queue, escalation signals, repeat contacts,
  compliance-sensitive categories ([AI QMS on coverage][aiqms], [Enthu][enthu]). Being looked at
  is caused by something surfacing, not by a schedule.
- **Monitoring without sanction.** A longitudinal field quasi-experiment on internet monitoring
  and cyberloafing records "the relative scarcity of enforced sanctions" and that "most firms
  adopt monitoring but do not apply the associated sanctions"
  ([Information Systems Research][isr]). Personal web use between tasks is described in
  practitioner guidance as a non-issue for most workplaces ([CurrentWare][currentware]).
- **Tolerance until an event.** Vaughan's normalisation of deviance: officially prohibited but
  tolerated practices go "unaddressed until critical events... brought them to public
  attention", and deviance becomes acceptable "in the absence of perceived losses or harm"
  ([Vaughan syntheses][deviance], [PsychSafety][psychsafety]).
- **Contribution as shield, with a name.** Hollander's **idiosyncrasy credit** (1958): credits
  are "increased each time an individual conforms to a group's expectations, and decreased each
  time an individual deviates"; accumulated credit is "the degree to which an individual may
  deviate from the common expectancies of the group" without sanction
  ([Idiosyncrasy credit][ic], [Sage Encyclopedia of Leadership][sage-ic]).
- **The record is built before it is used.** Progressive discipline is documentation-first:
  informal counselling, documented verbal warning, written warning; the file accumulates and is
  drawn on when action is taken ([Nevada HR][nvhr], [Washoe County][washoe],
  [Michigan SPG 201.12][umich]).

### 2.6 How survival is actually decided when the pressure is systemic

Everything above describes a steady state. It is not how most first-line people actually leave a
job. The systemic case has its own formal machinery, and that machinery is unusually well suited
to being modelled, because **the law requires it to be legible**.

**The selection matrix.** A redundancy scoring matrix is "a structured table employers use to
assess all employees at risk of redundancy on fair, pre-defined criteria, with each employee in a
selection pool scored using factual, business-relevant measures". The criteria in common use are
**skills, qualifications, performance, attendance, disciplinary record, and length of service**;
performance is scored from "recent performance appraisals, productivity, or objective KPI
results"; disciplinary record is scored but only where "current and relevant", with expired or
informal warnings excluded ([DavidsonMorris redundancy matrix][dm-matrix],
[DavidsonMorris selection criteria][dm-criteria], [Sprintlaw scoring matrix][sl-matrix]).

That is the owner's model with a legal citation attached: **when somebody has to go, the latent
conduct record, the performance numbers and the working relationships are read at once, against
a pool, and the question is comparative.** An honest week does not buy safety; it buys a
position in the matrix.

**The announcement is statutory.** Collective consultation is required when 20 or more
redundancies are proposed within 90 days, and must start at least **30 days** before the first
dismissal for 20-99 roles, or **45 days** for 100+ ([Acas collective consultation][acas-cc],
[GOV.UK redundancy consultation][gov-cc], [Farrer][farrer]). The employer must notify the
Secretary of State on form HR1 on the same timetable. So the sequence a first-line worker
actually experiences is: announcement with a number and a date, then a fixed consultation
window, then scoring, then the conversation. **Redundancy is the most heavily telegraphed thing
that happens in a working life.** Anything the game does here that is not telegraphed is less
realistic, not more dramatic.

**Outsourcing has its own shape.** Where a service desk is outsourced, TUPE transfers the staff
to the supplier with continuity of service and terms intact; both employers must inform and
consult; where ten or more are affected it goes through elected representatives; and a dismissal
whose sole or principal reason is the transfer is automatically unfair
([Acas TUPE][acas-tupe], [Personnel Today TUPE and outsourcing][pt-tupe]). From the chair this
means the job usually does not end - it changes employer, which is exactly the seam
`DESIGN_POC.md` section 6.4 already reserves.

**Mergers decide by duplication, and knowledge is the shield.** In post-merger integration "the
buyer looks for duplication first because that is where cost savings appear fastest"; middle
management carries meaningful risk "because integration tends to flatten reporting lines"; and
crucially: "your risk falls if you own customer relationships, specialized product knowledge,
hard-to-replace technical skills, regulated workflows, or key transition work. People who know
how legacy systems operate... often stay longer, sometimes with retention pay attached"
([Graham, what happens to employees after M&A][mrg], [IMAA on IT in PMI][imaa]).

**Comparative evaluation has a known failure mode.** Forced ranking (the GE 20-70-10 vitality
curve, "rank and yank") is the industrial form of comparative survival, and its central,
repeatedly stated criticism is that "someone is always forced to be in the bottom 5-10 percent,
even if every team member is exceeding their targets" ([Vitality curve][vitality],
[Betterworks][betterworks]). Usage peaked at roughly 75 percent of the Fortune 500 around 2002
and is below 15 percent today, with Microsoft, Adobe, GE and Gap abandoning it after finding it
damaged collaboration. **A game that makes survival comparative inherits this criticism as a
design risk**, and the fix is the same as the real one: keep the pool small, named, and
inspectable, and make the criteria things the player controls.

**Summary of A:** organisations score performance with weighted, normalised, volume-independent
ratios; they hold conduct on a separate track as a latent record; that record converts when
something causes somebody to look; and when the cause is systemic the decision is explicitly
comparative, scored against a pool on published criteria, after a statutory period of warning.

---

## 3. Findings B: game design - scoring that stays honest as content grows

### 3.1 Absolute versus normalised scoring

If a threshold is fixed and the score is a sum over content, adding content moves every player's
score in the same direction and the threshold silently re-rates. The generic fix is to score **as
a fraction of what was available**, so the denominator grows with the numerator.

Normalised scoring is described exactly this way in competitive scoring practice: "points in
themselves don't matter - you win with relative numbers, not absolute numbers", and normalised
score is "the ratio of the player raw score value to the game-specific target score value
expressed as a percentage" ([Normalized scoring][normscore]). The same source notes the
time-dependence problem that motivates it: an identical event can be worth 50 percent of the
available points early and 6.25 percent later, purely because the denominator changed.

The cost of normalisation is real: it **compresses**. Two players who both clear everything
available are identical under a percentage. Percentage-of-available answers "did you do the
job" and cannot answer "how". Anything to be distinguished beyond completion needs a second axis.

**Par** is the same idea with a hand-authored denominator. Overcooked's star thresholds are
per-level and additionally normalised by player count ([Overcooked star requirements][oc-guide],
[Overcooked player-count thresholds][oc-steam]); researchers studying the game note that "one way
to make levels more comparable might be to normalize the game score" precisely because each level
has its own challenge and time limit ([CHAOPT][chaopt]). Par is more expressive than
percentage-of-available and more expensive: one authored number per unit of content, and a stale
par is a silently mis-rated level.

### 3.2 How games avoid "more content, easier threshold"

1. **Percentage of possible.** Immune by construction. Cost: compression.
2. **Curve-fitted or authored thresholds per unit of content (par).** Immune if maintained;
   becomes a content-authoring obligation.
3. **Separate pass conditions rather than one summed score.** The threshold is not a number: it
   is a list of conditions, each with its own denominator or its own binary test. Adding content
   cannot inflate a condition it does not appear in.

Two Point Hospital is the readable example of (3): each star carries its own objective set, one
star is basic completion and progression, and further stars carry distinct bonus objectives that
vary by location ([TPH walkthrough][tph], [PC Gamer][pcgamer]). The player is told three separate
things about their hospital, not one score.

Hitman applies the same principle to conduct: the rating is computed from noise, witnesses,
recordings and fatalities by category, and Silent Assassin is a **condition set** rather than a
high score - you do not out-earn a witness with extra kills ([Hitman ratings][hitman-ratings],
[Silent Assassin conditions][hitman-sa]). Architecturally identical to the auto-fail scorecard in
2.4.

### 3.3 Multi-axis evaluation, and what makes it readable

- **Few axes, named in the fiction.** Two or three, each with a word the player already
  understands from the setting.
- **Each axis gets its own bar and its own line on the results screen**, separately actionable.
- **The axes must be causally separable by the player.** If the player cannot tell which action
  moved which axis, the second axis reads as noise. Same rule as COPC's "controllable metrics".
- **Show the axis before the verdict, every day.** A number first seen at the review is a number
  the player cannot have played toward.

### 3.4 Latent state converted by a trigger

- **Crusader Kings III secrets.** A secret is acquired by doing something criminal or shunned,
  sits on the character doing nothing, and becomes consequential only when another character
  *discovers* it and then *chooses* to act: expose (effects scaled to severity) or blackmail (a
  weak hook for shunned, a strong hook for criminal) ([CK3 hooks][ck3-hooks],
  [CK3 intrigue guide][ck3-intrigue]). The game shows who knows what: the latent risk is
  inspectable before it fires.
- **Hitman evidence.** Being recorded creates a durable artefact, inert unless the level ends
  with it intact; the player can destroy it, at risk ([Camera recorder][hitman-cam],
  [deleting footage][hitman-delete]). The instructive part is a design regression: the 2016 game
  bound each camera to its own recorder, which was truer and was simplified because players could
  not tell which recorder held their evidence ([surveillance rework mod][hitman-mod]). **The
  legibility of the latent record made or broke that mechanic**, not its severity.

Transferable rules: the record must be **inspectable**; the conversion must be **caused by
something the player can see coming**; severity should scale with the record, not with a die roll.

### 3.5 Dominant strategies when one axis scales and another does not

Sirlin defines balance as "a reasonably large number of options available to the player are
viable", and diagnoses imbalance by dominance: "if an expert player can consistently beat other
experts by just doing one move or one tactic, we have to call that game imbalanced because there
aren't enough viable options" ([Sirlin][sirlin]). Alternatives that "all accomplish the same
thing, or nothing, or all lose to the dominant move" are noise rather than choices
([Skeleton Code Machine][scm], [DevX][devx]).

Workgrumble is the textbook generator of this: two competing lines, one whose payoff scales with
content and one whose cost does not. No single larger constant can answer it, because the two
lines diverge at a rate set by content growth.

The design pillar this threatens is explicit in `DESIGN_POC.md` section 3.2: slacking is meant to
be "genuinely optimal play, not naughty extra". The current arithmetic drifts toward slacking
being correct and, at sufficient roster size, free - the degenerate version of the same idea.

### 3.6 Difficulty that comes from success, and failure that is not a loss state

Two further pieces of design literature bear directly on the systemic layer proposed below.

**Scaling difficulty off the player's own success is powerful and is the most-complained-about
mechanic in the games that use it.** RimWorld's storyteller derives raid points from colony
wealth, so a richer colony is attacked harder; the standing community objection is "progression
is punished", and the standing defence is that it only punishes players who grow wealth faster
than capability ([RimWorld wealth management][rw-wiki], [Steam: progression is punished][rw-steam]).
The lesson is not "do not do it": RimWorld shipped a settings toggle to switch to time-based
scaling and exposes the wealth figure in the history tab. **The lesson is that success-scaled
difficulty is only tolerable when the scaling quantity is visible and the player is told it is
the scaling quantity.**

**Failure lands as story when it continues the story.** In emergent-narrative games "failing
forward is delightful", and Dwarf Fortress's "losing is fun" works because a lost fortress
becomes the next fortress's history; the same essay identifies where it fails - Darkest
Dungeon-style death spirals, where "you can't roll with the punches if every punch is effectively
a knock-out blow" ([When failing forward fails][fff]). The distinction is whether the failure
produces a next chapter or a wall.

---

## 4. Recommendation

All profile predictions use the linear model validated in 1.3, which reproduces the shipped
meters within about 3 points. They are estimates; any option adopted needs a re-walk of
`scripted-week.test.ts` and a conscious golden diff.

Reference row - what ships today at 25 tickets:

```
worked properly ............ 25/25, 0 breached,  1 caught ... 97  passed
half the roster ............ 13/24, 12 breached, 0 caught ... 63  passed
worked, browser all week ... 25/25, 0 breached, 15 caught ... 56  passed
half + browser all week .... 13/24, 12 breached, 15 caught ... 5  FIRED
nothing at all ............. 0/24,  24 breached, 12 caught ... 4  FIRED
```

Four options follow. **A and D are the recommendation and are one system**; B and C are the
alternatives it is being chosen over, and are written up so the choice is visible.

---

### Option A - Normalised performance: percentage of available work

Replace the accumulating meter as the review's input with a weighted composite of ratios, in the
MetricNet shape (2.2). Minimum viable version, using only figures `weekScorecard` already
computes:

```
resolution rate  = closed / arrived
sla attainment   = (arrived - breached) / arrived
P                = 100 * (0.5 * resolution + 0.5 * sla attainment)
```

Keep the day-over-day fold at `REVIEW_WEIGHT = 0.5` (it models recency in appraisal honestly and
is already load-bearing). Keep the bar near 40 to 45: MetricNet's distribution puts 50 percent at
the median of hundreds of real service desks and below 39 percent in the bottom quartile
([metricnet]), so a probation bar just under half is defensible and quotable in fiction.

**The five profiles:**

| Profile | resolution | SLA | P | Outcome |
|---|---|---|---|---|
| worked properly | 100% | 100% | 100 | passed |
| half the roster | 54% | 50% | 52 | passed |
| worked, browser all week | 100% | 100% | 100 | passed |
| half + browser | 54% | 50% | 52 | passed |
| nothing at all | 0% | 0% | 0 | FIRED |

The two pairs collapse: conduct has been removed from the score, so the two-by-two the current
gate protects (`scripted-week.test.ts:860-884`) is gone. **A is necessary but not sufficient.**
That is a feature: it forces the conduct decision to be made explicitly instead of smuggled in as
a coefficient.

**Cost:** small. One new pure function in `src/world/week.ts` beside `weightedWeekReputation`;
change the writer of `week_reputation` in `src/world/actions/meters.ts:137-166` to fold the ratio
instead of the meter; the review guards keep their shape (`field_at_least` on one field). Stress,
suspicion and reputation are untouched and continue to drive fumble and the caught scene. Golden
weeks re-pin, a ritual the test file already documents nine times over.

**Teaches:** that a service desk is judged on the proportion of its work it got through and its
SLA attainment, not on a tally. Puts the two most-cited real metrics on screen under their real
names.

**Failure mode:** compression (3.1) - a light Friday and a heavy Thursday look identical. And the
denominator is gameable in a way absolute credit is not: anything reducing `arrived` (deferring,
escalating, "waiting on user") improves the ratio. The trade has exactly this pathology and
exactly one answer - pair the ratio with a quality metric (2.3).

---

### Option B - Conduct as a hard pass/fail axis (auto-fail)

Performance as today or as A; conduct as a binary veto - a week-cumulative caught count at or
above N is a firing regardless of the numbers. The call-centre auto-fail model (2.4), the Hitman
rating model (3.2).

**The five profiles** (A performance, conduct bar N = 5):

| Profile | P | caught | Outcome |
|---|---|---|---|
| worked properly | 100 | 1 | passed |
| half the roster | 52 | 0 | passed |
| worked, browser all week | 100 | 15 | **FIRED** (conduct) |
| half + browser | 52 | 15 | FIRED (both) |
| nothing at all | 0 | 12 | FIRED (both) |

**Cost:** smallest of the four. One week-cumulative caught field, one extra guard clause in each
review verb, one line on the review screen.

**Teaches:** true and worth teaching - conduct is a different kind of thing from performance, and
some behaviour is not tradable against output. This is literally how QA scorecards are built.

**Failure mode:** it inverts the third profile relative to both the shipped game and the owner's
experience; it makes N the entire difficulty of the slack system; and it contradicts the design
pillar that slacking is optimal play, because the correct strategy becomes "never open a window
near a patrol". It also over-states reality: the veto exists, and it is applied to a two percent
sample (2.5).

---

### Option C - Caught penalty scaled to the roster

Make the constant derived rather than fixed:

```
CAUGHT_REPUTATION_COST = round(TOTAL_ROSTER_CREDIT / (PATROLS_PER_DAY * WEEK_DAYS))
```

At the current roster that is 96/15 = 6.4 -> 6, bit-identical today and self-correcting tomorrow.
The invariant is clean: **a week of being caught on every round costs about what the week's work
is worth.**

**The five profiles:** unchanged today by construction. At a hypothetical 40-ticket roster
(credit ~154, cost per catch 10):

| Profile | Today (25) | At 40, Option C | At 40, unchanged |
|---|---|---|---|
| worked properly | 97 | 100 | 100 |
| half the roster | 63 | 67 | 67 |
| worked, browser all week | 56 | 54 | 88 |
| half + browser | 5 | 0 | 22 |
| nothing at all | 4 | 0 | 0 |

**Cost:** trivial. One derived constant plus an invariant test. Golden weeks do not move today.

**Teaches:** nothing. It is a balance patch, and the number it produces is not a fact about the
trade.

**Failure mode:** two. The penalty is opaque - the same event costs 6 this build and 10 next, for
reasons the player cannot see, which breaks the project rule that a risk must be legible before
it is taken. And it keeps conduct and output on the same summed axis, so the player is still
being told that enough closes buy off being seen. It fixes the arithmetic and leaves the wrong
lesson standing.

---

### Option D - Latent record, social and systemic triggers, comparative survival

One system in four parts. Conduct stops being points. The record is latent and inspectable.
Something has to make somebody look, and that something is either social or systemic. And when it
is systemic, the question is not whether you were good enough but whether you were **harder to
justify losing than the person at the next desk**.

#### D.1 The record

Every catch appends to a durable, readable **file** on the player: which app, which day, which
minute. It costs zero reputation. It still costs everything it costs now that is not score - the
presence window (`PRESENCE_TICKS`), the interrupted work, the suspicion floor at 15.

#### D.2 Social triggers

A conversion condition evaluated from world state, deterministically, never from a die roll (the
determinism gate in `DESIGN_POC.md` section 10.5 requires this; 3.4 says legibility requires it
too). Three sources, all buildable from shipped systems:

- **A customer with a grievance.** A ticket that breached whose reporter you spoke to, or one
  closed wrongly. Mail threads and dialogue trees exist.
- **A colleague who resents it.** Terry, whose favour was refused, already has a scheduled DM and
  a ticket he files out of spite.
- **A manager who goes looking.** The lead reads the file only when something else has drawn him
  to the desk.

#### D.3 Systemic triggers: the pressure catalogue

External pressure does not create the record. It creates the **reason to use it**. Nine entries,
each with what it looks like from a first-line chair, the legible signal that precedes it, and
what it changes mechanically. Several are opportunities as well as threats; the "cuts" column
says which.

| Event | From the chair | Legible signal, before | Changes mechanically | Cuts |
|---|---|---|---|---|
| **Client funding cut / account loss** | The queue from one account thins, then stops. The people you knew there stop replying. | A thread going quiet; a monthly usage report requested; an account manager in the corridor who never comes down here | Removes a slice of the roster; reduces the headcount the desk is funded for -> raises the comparative bar | Threat |
| **Downturn** | Nothing is bought. Licences are not renewed, the ageing estate stays. | A cost-discipline mail; a frozen requisition; a "no new licences this quarter" reply on a ticket | Closes some fix paths (buying a licence, replacing hardware) so more tickets need the harder route; raises the bar | Threat |
| **New leadership with a mandate** | A new lead who does not know you, and likes to be seen saving money. | An introduction mail with the word "efficiencies" in it; a sudden request for ticket statistics by analyst; a consultant with a lanyard nobody recognises | Your accumulated latitude is discounted - the new lead did not watch you earn it (2.5, idiosyncrasy credit is held by *observers*). Bar rises | **Both** - a new lead also does not know about your file |
| **Redundancy round** | An all-staff mail with a number in it and a date. Then a fixed window in which nothing is decided and everybody is polite. | The statutory announcement: "a proposed reduction of N roles in first line", with a consultation end date (2.6: 30 or 45 days by law) | N cut from a pool of M, scored on the matrix. Not a per-person verdict - a ranking | Threat, but **voluntary redundancy is a lump sum into the farm fund** |
| **Downsizing / reorg** | Six on first line becomes four. The queue does not become four-sixths of a queue. | An org-chart mail; a rota change; a leaving-do; two weeks of the queue not shrinking | The player's share of `arrived` rises - the honest difficulty increase, and precisely what a normalised axis measures correctly and an absolute one does not | **Both** - fewer people means more visible, and the desk's memory becomes valuable |
| **Bad leadership decisions** | Your tools change mid-week. The KB is wrong. Tickets arrive for a system you have no article on. | A project mail with a go-live date; twenty minutes of training and a PDF; a countdown nobody asked for | Degrades tooling for a period: KB coverage gaps, an app replaced by a worse one, actions relocated. Degrades it for the NPCs too | **Both** - whoever adapts first gains position |
| **Acquisition / merger** | Two ticket systems, two estates, two of everybody. | Rumour in chat; an announcement mail; a town-hall invite; two logos on the intranet; a data-migration notice | The largest: new estate nodes, a second ticket family (the variety seam in `modern-stack.md` section 3), duplicate roles. Duplication is what makes the comparative question sharp (2.6) | **Both** - legacy knowledge is retention-positive; a merger can be a promotion |
| **Contract WIN** | Congratulations. Here are four hundred more users, on the same rota, from the fourteenth. | A celebratory all-staff mail; an onboarding plan with a date; a manager who has promised numbers | Roster grows sharply for a period with unchanged SLA targets. Under normalisation this is honest difficulty; under absolute scoring it would be free points | **Both** - growth funds headcount and makes a promotion case |
| **Offshoring / outsourcing of first line** | A supplier's people shadow you, then ask you to document your job. | Time-and-motion observers; a request for ticket volumes by category; a "knowledge transfer" workshop in which you write the articles that replace you | Ends the job by **transfer, not dismissal** (TUPE, 2.6): the player moves to a different employer with continuity - the on-ramp to employer switching | **Both** - the person who knows the estate is the one the supplier keeps |

The recurring truth across the catalogue, and the honest joke: **the workload never shrinks with
the headcount.** Every entry either raises the denominator, lowers the number of hands, or moves
the bar - and only one of them (client loss) reduces the actual work.

#### D.4 Comparative survival

The desk has named colleagues. Each carries the same performance figure the player does, derived
the same way, and a file of their own. When a systemic event says "two of six", the review reads
a **ranking**, not a threshold.

This is the redundancy matrix of 2.6 rendered as a game screen: skills, performance, attendance,
disciplinary record. It is also - deliberately - the thing that answers section 1's defect at the
root, because a ranking has no absolute number in it to inflate.

Mechanically the simplest honest form is that a fired systemic trigger replaces the fixed bar
with a **positional bar**: survive if your composite is above the Nth-from-bottom in the pool.
The social trigger of D.2 continues to work as a bar shift, so both kinds of trigger act on the
same quantity and the screen only ever has to explain one thing.

#### D.5 The legibility contract - the minimum signal set

The project rule is that a risk must be readable before it is taken. For this layer that means a
**four-beat contract**, and no systemic event may change an outcome unless all four beats have
fired:

1. **WEATHER**, two or more weeks out. Ambient, no numbers, costs nothing, changes nothing: a
   client thread going quiet, a remark in chat, a budget note in a mail nobody read. This is the
   beat that makes an attentive player feel clever later.
2. **NOTICE**, one week out at minimum. Named, dated, explicit, **with a number in it**: "a
   proposed reduction of two roles on first line, consultation closes Friday the 14th". This is
   the statutory shape (2.6) and it is not optional. A game may not be less legible than
   employment law.
3. **CRITERIA**, during. The game states, in the fiction's own words, what will be read - and the
   player can see their own standing on each line of it, and the pool's. The redundancy matrix is
   a screen, not a secret.
4. **DECISION**, at the review, read from state the player could see all along, with the reasons
   printed beside the verdict.

The single most important of these is beat 2. A "sudden interest in ticket statistics" is the
most authentic signal in the whole catalogue and it is also the most useful one mechanically,
because it tells the player, in-fiction, that the metrics they have been watching all week are
about to be read by somebody who does not know them.

#### D.6 Being cut for reasons beyond your control: fairness, and where it lands

Being made redundant is unfair by construction, which is why it must not be a loss state.

The design answer is already half-built. The game has a retry-week flow that keeps the farm fund,
`REVIEW_OUTCOMES` is an enum with two terminal values, and employer switching is a declared seam
(`DESIGN_POC.md` 6.4: employer = graph seed + ticket pool + boss personality params).

**Recommendation: add a third outcome, `redundant`, which is not a loss state.** It is the
on-ramp:

- The farm fund is kept, plus a **redundancy payment** - which, in a game whose win condition is
  buying a farm, makes losing your job a genuine and morally complicated step toward winning.
- The player arrives at a new employer with their skills, their KB knowledge, and - the good part
  - **a clean file**. The latent record lives with the observers who made it (2.5). That is both
  true and mechanically generous: a fresh start is the reward for having been unlucky.
- What does *not* transfer is the accumulated latitude. You are the new person again, and the
  first weeks are the probation week again with better tools.

`fired` stays a loss state and stays reserved for cause: the numbers, or a conduct trigger that
landed because the numbers were not there to shield it. That distinction is the moral spine of
the whole system. **Being cut for the weather changes your employer; being cut for cause ends the
run.**

#### D.7 Pacing: pressure is a season, not weather

The single biggest risk in this layer is that it becomes a random-disaster generator. Rules:

- **At most one systemic event live at a time.** Never two overlapping. A merger and a
  redundancy round in the same month is real life and is unplayable.
- **One systemic event per employer arc**, sized to the arc. If an employer is eight to twelve
  weeks, that is one season of pressure and the rest is the job.
- **The probation week carries none.** The POC's five days are the tutorial for the social layer
  only. The first systemic event should not arrive until the player has had at least two quiet
  weeks to learn what normal looks like - a redundancy round means nothing to somebody who has no
  baseline.
- **Guaranteed quiet after resolution.** A minimum of two clear weeks following any resolved
  event, enforced by the scheduler rather than by a probability. Recovery is not a random
  variable.
- **The shape of a season**: quiet, weather, notice, consultation, decision, quiet. Five or six
  weeks, with the middle three carrying the tension. The player should be able to feel the season
  turn, which is a different sensation from being rained on.

Half the catalogue cuts both ways (D.3), so a well-paced career should contain at least one
systemic event that the player ends up *better* for. If every entry that fires is a threat, the
game is a misery simulator, and that is not this game.

#### D.8 Tier scaling: the difficulty axis and the reward axis are the same axis

The owner has separately proposed career tiers (service desk up to architect) with rising
billable-hour expectations as the difficulty ramp. That fits this system exactly, and cheaply:

- **Utilisation target rises with tier.** The trade's own numbers: 75 to 85 percent billable for
  senior technical staff, above 90 percent read as a burnout signal rather than an achievement
  ([scoro], [teamwork]). So the ramp is literally "the target percentage goes up", which is
  legible, real, and free to implement on a normalised axis.
- **A senior costs more, so is easier to clean.** Post-merger integration flattens reporting
  lines and middle management "carries meaningful risk" ([mrg]). Mechanically: the higher the
  tier, the smaller the pool and the higher the positional bar, because there are fewer of you
  and you each cost more.
- **The shield changes with the tier.** At first line the shield is throughput. Higher up it is
  the M&A retention list, verbatim: customer relationships, specialised knowledge, hard-to-replace
  skills, regulated workflows, key transition work ([mrg]). That is a genuinely different game at
  each tier, produced by the same system.

This gives the career one difficulty axis rather than several, and it is the same axis as the
reward: promotion raises pay and raises the bar in the same breath. It is also RimWorld's
wealth-scaled raiding (3.6) - which means it must obey RimWorld's lesson: **the scaling quantity
must be on screen and named as the scaling quantity.** The payslip and the title screen are where
that goes.

#### D.9 The five profiles

Under A performance plus D conduct, in a **quiet** week (no systemic event, bar 40, trigger = at
least one breached ticket whose reporter is aggrieved, shift = +25 scaled by file size):

| Profile | P | file | trigger fires? | effective bar | Outcome |
|---|---|---|---|---|---|
| worked properly | 100 | 1 | no (nothing went red) | 40 | passed |
| half the roster | 52 | 0 | yes, but empty file | 40 | passed |
| worked, browser all week | 100 | 15 | no (nothing went red) | 40 | **passed** |
| half + browser | 52 | 15 | yes, thick file | 65 | **FIRED** |
| nothing at all | 0 | 12 | yes, thick file | 65 | FIRED |

**All five shipped outcomes reproduced exactly**, including keeping profile 3 a pass, and without
conduct ever entering an arithmetic race with closes.

The same five in a **pressure** week (a redundancy round, two of six, pool of five NPC colleagues
whose composites sit at roughly 45, 55, 62, 70, 78):

| Profile | P | rank in pool of 6 | Outcome |
|---|---|---|---|
| worked properly | 100 | 1st | survives |
| half the roster | 52 | 4th | survives, narrowly |
| worked, browser all week | 100 | 1st, with a file the matrix scores | survives - and the file is read aloud |
| half + browser | 52 | 4th on numbers, last once the file is scored | **made redundant** |
| nothing at all | 0 | 6th | **made redundant** (and fired for cause is also available) |

Note what the pressure week does to the third profile: it survives, and it is the first time the
file has ever been mentioned. That is the moment the whole system exists to produce - the player
learns that the thing which never mattered has been written down all along, and that this time it
was close.

**Should profile 3 pass in a quiet week?** Yes, on both the owner's experience and the
literature. Fifteen catches in a week where everything closed, nothing breached and nobody
complained is a week in which the monitoring recorded everything and nobody applied a sanction -
the documented norm ([isr]) - and in which accumulated contribution bought the latitude, which is
idiosyncrasy credit by its formal definition ([ic]). It is also the better game: learning that
you got away with it *this time* is a different and more interesting feeling than learning that
it cost you six points.

#### D.10 Cost against current code

Medium, and most of the machinery exists.

- **The file.** `caught_events` exists but is cleared each clock-off (`src/world/fields.ts:100`);
  needs a week-cumulative sibling. Adding a field written by an op is a documented move in this
  codebase - `week_reputation` was added exactly this way in M5 (`scripted-week.test.ts:381-395`).
  The file's *contents* need no new subsystem: the M4 evidence work already records what happened
  and when, so "the forum, Wednesday, 11:40" is a read.
- **`CAUGHT_REPUTATION_COST` drops to 0** or becomes suspicion-only. One constant.
- **The triggers** are pure functions over the graph, the same shape as `fallout.ts`, which
  already answers "what is due right now" from world state and the tick, deterministically.
- **The pressure catalogue is a table.** `WEEK` in `src/world/week.ts` is already a table of
  scheduled beats with `incidents` and `dms` per day, validated at load; a career arc is the same
  table one level up, and `IncidentSlot` is the exact shape a pressure beat needs. `INCIDENTS` is
  the registry pattern to copy.
- **The signals are content.** Mail threads exist (`src/world/mail/threads.ts`), dialogue trees
  exist, the boss and colleague NPCs exist as company nodes.
- **The pool** is a derived figure per colleague node, computed by the same function as the
  player's. No new node kinds.
- **The review** is already a scene with two variants and a guarded verb pair. Adding
  `'redundant'` to `REVIEW_OUTCOMES` touches `isReviewOutcome`, the scene map, and one verb; the
  bar becomes a `review_bar` field written at three o'clock beside `review_reputation`
  (`src/world/actions/day.ts:180-186`), which the guard already knows how to compare against.
- **Employer switching** is a declared seam, not new architecture (`DESIGN_POC.md` 6.4), and the
  retry-week flow and `week_attempt` field already exist.

The genuinely new work is: one cumulative field, two pure functions (trigger, pool ranking), one
scheduled-beat table with a validator, one outcome value, and content - one mail thread and one
scene per catalogue entry shipped.

#### D.11 Failure modes, and what keeps agency real

- *Fired by a trigger the player did not see.* Answered by D.5, absolutely and without exception.
  Four beats or no effect, and the review prints the reason beside the verdict.
- *"Nothing I do matters in a downturn."* This is the forced-ranking criticism (2.6) and the
  RimWorld criticism (3.6) arriving together, and it is the one that would sink the layer.
  Four defences, all structural:
  1. **The comparison is against named people with visible standings, all week.** Not a curve,
     not a percentile of an invisible population - five colleagues with names, a screen, and
     numbers that move when the player does something. The player is always playing *for
     position*.
  2. **The levers are the ones the player controls**: the performance ratios, the file, and the
     relationships built through the favour, DM and escalation systems that already exist. This
     is COPC's "controllable metrics" rule (2.2) as a design constraint.
  3. **Every event has at least one signposted survival path**, and it is different per event:
     throughput for a downturn, legacy knowledge for a merger, adaptation speed for a tool
     migration, relationships for a new lead. This is what stops the layer collapsing into one
     dominant strategy (3.5).
  4. **Redundancy is not a loss state** (D.6). The worst outcome of the worst event is a new
     employer, a lump sum, and a clean file.
- *The player learns conduct never matters and stops pressing the boss key.* Answered below,
  because it is the question the corridor depends on.

#### D.12 What still makes the boss key worth pressing

Move the price of being caught off the scoreboard and onto the clock, where it belongs and where
it is truer.

Being caught already costs, in shipped code, everything except score: the lead stands there for
`PRESENCE_TICKS` (`boss.ts:36`), the modal takes the player out of what they were doing, and
suspicion resets to a floor of 15 rather than zero, so the drain back to safety costs the rest of
the morning's medicine. Under D those costs stay and become the *whole* cost.

That is the coupling that keeps the corridor alive: **minutes are the scarce resource, because
SLA clocks run in minutes, and the performance axis is made of SLA attainment.** Being caught
does not cost conduct points. It costs two minutes, the concentration, and the suspicion headroom
- and those come out of the axis that actually decides the review. The threat is indirect and
completely real. It is also the true thing about the job: nobody docks you for being seen on a
forum, but ten minutes of being asked how you are getting on is ten minutes the queue did not
stop for.

Three reinforcements if the loop still feels slack:

- **The file is a loaded gun on the wall.** A player caught eleven times has a visible, growing
  reason to want the twelfth not to happen, because the catalogue means a matrix could be along
  at any point in the season.
- **Keep one trigger that fires reliably in a normal week** - a breached ticket is enough - so
  the player *sees* the shield work at least once per playthrough. Nobody believes in a threat
  they have never seen a near-miss from.
- **The suspicion floor compounds**: a second catch arrives sooner than the first, within the
  same shift.

---

## 5. Recommended option

**Take A and D as one system: a normalised, volume-independent performance axis; conduct held as a
latent, inspectable record; conversion driven by social and systemic triggers; and, under systemic
pressure, survival decided comparatively against a named pool rather than against a number.**

Reasons, in order of weight:

1. **It fixes the defect at the root rather than at the crossover.** B and C fix the measured
   symptom. Only D takes conduct off the summed axis; only A takes content-scaling off the
   performance axis. Together no term remains whose growth re-rates the threshold - and under
   systemic pressure there is no threshold at all, only a ranking, which cannot inflate.
2. **It preserves all five shipped outcomes, for stated reasons.** The two-by-two in
   `scripted-week.test.ts:679-712` is currently an emergent property of two constants nobody
   chose. Under A+D it is the design: two ways to lose the job, either forgiven alone, neither
   forgiven together, with the mechanism written down.
3. **It is the most truthful option, and truth is this project's wedge.** It reproduces, in
   mechanics, six separately documented findings: normalised weighted scorecards
   ([metricnet], [copc]); conduct on a separate track ([shrm], [ukg], [opm]); monitoring without
   sanction ([isr]) and tolerance until an event ([deviance]); contribution as latitude ([ic]);
   the redundancy selection matrix reading performance, conduct and skills against a pool
   ([dm-matrix], [dm-criteria]); and statutory advance notice ([acas-cc], [gov-cc]). A player who
   internalises this has learned something correct about how they will actually be judged, which
   is what the KB and the learner path exist for.
4. **The costs are largely already paid.** Suspicion is a meter, catches are events, the NPCs
   exist with dialogue, the week is already a validated table of scheduled beats, the evidence
   work means the game can say what was noticed and when, `week_reputation` is a worked example
   of the field to add, and employer switching is a declared seam.
5. **It gives the career one difficulty axis instead of several**, and it is the same axis as the
   reward: a promotion raises the pay and the bar in the same breath (D.8).
6. **It makes the corridor more interesting, not less.** The catch stops being a fine and becomes
   a fact about you that is now on file, which somebody may one day have a reason to read.

**Sequencing.** Three slices, in this order, each shippable alone:

1. **A alone.** Small, testable in isolation, and it collapses the profiles in a way that makes
   the conduct decision unavoidable and obvious on the scorecard. Do not stop here: A alone
   deletes the conduct distinction.
2. **D.1, D.2, D.12** - the latent file, social triggers, and the caught cost moved onto the
   clock. This restores the two-by-two on purpose and completes the POC-scope system.
3. **D.3 to D.8** - the pressure catalogue, the pool, the positional bar, `redundant` as an
   outcome, and the employer-switching on-ramp. This is career-layer work and belongs with the
   employer-switching epic, not with the probation week. Ship one catalogue entry first
   (recommended: the redundancy round, because it is the most legible and the most citable), and
   only widen once the four-beat contract has been proven on it.

**Gates the work must carry** (per the standing rule that every found defect becomes a permanent
assertion, proven by revert):

- A **scaling invariant**: the five-profile table re-walked at the shipped roster *and* at a
  synthetic doubled roster, asserting order and margins hold at both. This is the assertion that
  would have caught the present defect, and it must fail if the summed model is restored.
- A **legibility assertion**: for any week in which any trigger converts, the causing artefact
  exists in the player's mail before the review tick; and for any systemic event that changes an
  outcome, all four beats of D.5 fired, beat 2 named a number and a date, and beat 3 was
  inspectable. A trigger that fires from nothing is a test failure.
- A **pacing assertion**: never two systemic events live at once; a minimum quiet interval after
  each resolution; none during probation.
- **Determinism**: unchanged, and no trigger may touch the RNG.

---

## 6. What I would not do

- **Do not raise `CAUGHT_REPUTATION_COST`.** It buys one content slice and the race resumes.
- **Do not scale `PATROLS_PER_DAY` with the roster.** It fixes the arithmetic by making the game
  worse: more modal interruptions, more scenes seen more often, content growth punished with
  tedium. Pacing is not a balance knob.
- **Do not add more terms to a single summed score.** Adding CSAT and FCR as further additive
  contributions preserves the whole defect class. If they arrive later they arrive as *ratios in
  the composite*, never as points.
- **Do not make any trigger random.** It breaks the determinism gate, it is unreadable, and it
  converts the best moment in the game into a slot machine. This applies twice over to the
  systemic layer, where a random redundancy would be both unfair and less realistic than the
  truth.
- **Do not make conduct a hard veto on its own (B alone).** It contradicts the owner's
  experience, the 1-to-3-percent enforcement reality, and the design pillar that slacking is
  optimal play.
- **Do not remove the caught scene's non-score costs when the score cost is removed.** The
  presence window, the interruption and the suspicion floor are the entire remaining tension in
  the corridor.
- **Do not make redundancy a loss state.** A player cut by the weather must land in a new job
  with the fund, a payment, and a clean file. `fired` is reserved for cause, and that distinction
  is the moral spine of the system.
- **Do not run more than one systemic event at a time, and do not put one in the probation week.**
  Pressure without a baseline is noise.
- **Do not ship the pressure catalogue as threats only.** At least half the entries must be able
  to leave the player better off, and a career arc should reliably contain one that does.
- **Do not change the pass threshold and the scoring method in the same slice.** One conscious
  golden diff at a time, or the diff stops being reviewable.

---

## Sources

[metricnet]: https://www.metricnet.com/metric-of-the-month-service-desk-balanced-scorecard/
[copc]: https://www.copc.com/using-a-balanced-scorecard-for-performance-management/
[zd-metrics]: https://www.zendesk.com/blog/customer-service/help-desk/help-desk/top-10-help-desk-metrics/
[siit]: https://www.siit.io/blog/service-desk-metrics
[amg]: https://assetmanagement.global/blog/service-desk-management/service-desk-kpis-performance-metrics-2026-the-complete-enterprise-guide/
[sqm]: https://www.sqmgroup.com/resources/library/blog/fcr-metric-operating-philosophy
[zd-fcr]: https://www.zendesk.com/blog/customer-experience/retention/first-contact-resolution-friend-foe-frenemy/
[sprinklr]: https://www.sprinklr.com/blog/first-contact-resolution/
[scoro]: https://www.scoro.com/blog/billable-utilization/
[teamwork]: https://www.teamwork.com/blog/utilization-rate/
[sdi-sda]: https://www.servicedeskinstitute.com/wp-content/uploads/2024/08/SDA-Professional-Standards-v8-2020.pdf
[splunk]: https://www.splunk.com/en_us/blog/learn/goodharts-law.html
[kpitree]: https://kpitree.co/guides/frameworks/goodharts-law
[supportbench]: https://www.supportbench.com/preventing-agent-cherry-picking-enforcing-fair-ticket-distribution/
[nicereply]: https://www.nicereply.com/blog/cherry-picking/
[shrm]: https://www.shrm.org/topics-tools/news/managing-smart/critical-to-distinguish-performance-conduct-issues
[ukg]: https://www.ukg.com/blog/hr-leaders/discipline-vs-performance-spotting-differences-and-finding-solutions
[smr]: https://sportsmanagementresources.com/library/misuse-annual-employee-performance-evaluation-and-failure-utilize-progressive-disciplinary
[opm]: https://www.opm.gov/policy-data-oversight/employee-relations/reference-materials/managing-federal-employees-performance-issues-or-misconduct.pdf
[maestro]: https://www.maestroqa.com/blog/auto-fail-in-call-center-quality-assurance
[ccj]: https://callcenterjournal.com/qa-scorecards/
[verequest]: https://www.verequest.com/post/designing-a-call-center-quality-assurance-scorecard
[spoke]: https://www.getspoke.com/post/the-real-cost-of-manual-call-qa-in-regulated-contact-centres
[qa-math]: https://medium.com/@acertain/your-call-center-qa-is-statistically-meaningless-heres-the-math-367e19759251
[aiqms]: https://www.theaiqms.com/blog/contact-center-qa-coverage-scaling-risk/
[enthu]: https://enthu.ai/blog/how-to-reduce-call-center-qa-review-time/
[isr]: https://pubsonline.informs.org/doi/10.1287/isre.2020.0216
[currentware]: https://www.currentware.com/blog/personal-use-of-the-internet/
[deviance]: https://www.sciencedirect.com/science/article/pii/S0022437522001827
[psychsafety]: https://psychsafety.com/normalisation-of-deviance/
[ic]: https://en.wikipedia.org/wiki/Idiosyncrasy_credit
[sage-ic]: https://sk.sagepub.com/ency/edvol/leadership/chpt/idiosyncrasy-credit
[nvhr]: https://hr.nv.gov/Resources/Publications/HR123/performMgmt/Discipline/
[washoe]: https://www.washoecounty.gov/humanresources/files/hrfiles/Performance_Improvement_and_Progressive_Discipline_Guide.pdf
[umich]: https://spg.umich.edu/policy/201.12
[dm-matrix]: https://www.davidsonmorris.com/redundancy-matrix/
[dm-criteria]: https://www.davidsonmorris.com/redundancy-selection-criteria/
[sl-matrix]: https://sprintlaw.co.uk/articles/how-to-use-a-redundancy-scoring-matrix-for-fair-and-compliant-employee-selection/
[acas-cc]: https://www.acas.org.uk/collective-consultation-redundancy
[gov-cc]: https://www.gov.uk/redundancy-your-rights/consultation
[farrer]: https://www.farrer.co.uk/news-and-insights/collective-redundancy-consultation-when-the-duty-arises-and-what-is-changing/
[acas-tupe]: https://www.acas.org.uk/tupe/advice-for-employers-and-employees
[pt-tupe]: https://www.personneltoday.com/hr/tupe-and-outsourcing-advice-on-two-common-scenarios/
[mrg]: https://markrgraham.net/what-happens-to-employees-after-a-merger-or-acquisition/
[imaa]: https://www.imaa-institute.org/publications/make-or-break-the-critical-role-of-it-in-post-merger-integration/
[vitality]: https://en.wikipedia.org/wiki/Vitality_curve
[betterworks]: https://www.betterworks.com/magazine/never-grade-on-a-curve
[normscore]: https://ericjwdchen.org/2017/12/16/normalized-scoring/
[oc-guide]: https://steamcommunity.com/sharedfiles/filedetails/?id=1832823209
[oc-steam]: https://steamcommunity.com/app/728880/discussions/0/1745594817431869486/
[chaopt]: https://par.nsf.gov/servlets/purl/10173020
[tph]: https://www.neoseeker.com/two-point-hospital/walkthrough
[pcgamer]: https://www.pcgamer.com/two-point-hospital-hands-on-theme-hospital-fans-are-getting-the-exact-game-they-want-with-a-few-twists/
[hitman-ratings]: https://hitman.fandom.com/wiki/Ratings
[hitman-sa]: https://hitman.fandom.com/wiki/Difficulty_Level/Silent_Assassin
[hitman-cam]: https://hitman.fandom.com/wiki/Camera_Recorder
[hitman-delete]: https://attackofthefanboy.com/guides/hitman-2-how-to-delete-security-footage/
[hitman-mod]: https://www.nexusmods.com/hitman3/mods/860
[ck3-hooks]: https://ck3.paradoxwikis.com/Hooks
[ck3-intrigue]: https://www.pcinvasion.com/crusader-kings-3-intrigue-schemes-hooks-secrets/
[sirlin]: https://www.sirlin.net/articles/balancing-multiplayer-games-part-1-definitions
[scm]: https://www.skeletoncodemachine.com/p/degenerate-game
[devx]: https://www.devx.com/terms/degenerate-strategy/
[rw-wiki]: https://rimworldwiki.com/wiki/Wealth_management
[rw-steam]: https://steamcommunity.com/app/294100/discussions/0/3192495424138424030/
[fff]: https://auguryignored.wordpress.com/2022/03/19/when-failing-forward-fails/
