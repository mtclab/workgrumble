# Design: titles as difficulty, the customer axis, and projects

**Dated 2026-08-08. Owner-seeded twice: 2026-07-31 ("difficulty scale = career titles,
each with its own win condition") and 2026-08-08 ("the titles and by them the different
customer types and tickets/tasks/projects"). Grounded in three research threads:
docs/research/titles-work-shape.md (A), titles-customer-types.md (B),
titles-projects-engine.md (C). STATUS: proposal under discussion - owner decisions
listed at the end. Nothing here is decided until the owner says so.**

## 1. The spine: a title is a SHAPE break, not a rate knob

The industry's own ladder (SFIA's 7 Levels of Responsibility, thread A section 0) says
what changes per rung is autonomy, influence and complexity - the level names are
verbs: Follow, Assist, Apply, Enable, Ensure/advise, Initiate/influence, Set strategy.
That is the design: each title changes WHAT KIND of work arrives and what the player
is allowed/required to do about it. Rate knobs (drip, SLA tightness, patrol cadence)
scale WITHIN a title; the title itself changes the board.

This merges three parked things exactly as the owner sketched in July: difficulty
select (start title), win-goal select (per-title win condition, farm = ultimate), and
the career ladder (titles above the start = content).

## 2. The rung table (thread A section 10, mapped to our rails)

| Title | The shape break | What exists | What is new |
|---|---|---|---|
| SD junior (shipped) | KB-rule-bound, permission walls everywhere | The whole probation week | - |
| SD senior | A SECOND QUEUE: other people's work. QA-audit juniors' triage/priority while your own clocks run; retained ownership after escalation; KB authoring; major-incident comms | Queue, triage matrix, KB app, escalation | The audit queue surface; authored junior-work content (pre-triaged WRONG) |
| L2 / desktop | Permission wall opens; arrivals come pre-diagnosed wrong | AD/services/terminal surfaces | Mostly content + gating data |
| Systems engineer (shipped) | Ticket TYPE becomes a choice (incident/request/change/problem); on-call | Incidents, change control, break-glass, postmortems | On-call weeks (SRE-true: an on-call week zeroes project work; max 2 incidents/12h); alert-fatigue tuning (2-5% of ~50 alerts/week actionable) |
| Senior engineer | You approve OTHER people's changes and eat their blast radius; two clocks that cannot both be green (billable 55-70% target vs delivery) | Change-request machinery, timesheet design (unbuilt) | Approval queue; utilisation mechanic |
| Team lead | You stop resolving and start ASSIGNING (who/what/where/when dispatch board); rota under the 8-engineer staffing rule you cannot staff | Roster/week machinery | Dispatch board surface; the designed conflict: dispatch doctrine says keep seniors off junior work, burnout truth says seniors are the safety net |
| Architect / vCIO | Delayed indirect consequences + DRIFT: decisions land 3 months later in someone else's incident; stop riding the elevator and your diagrams go quietly wrong | Delayed-consequence settlers (E8) | Projects (epic below); drift meter; QBR cadence |

Escalation gets a real cost at every rung: the sourced additive chain ($22 L1 + $69
desktop + $104 L3 per HDI/MetricNet) - escalating hands the COMPANY the sum, which the
week card can honestly print.

Three org-level events from the research, all true, all reshape the board, parked for
content versions: "we're going swarming" (tier walls down, escalation button replaced
by pulling colleagues whose clocks then also run), the emergency-change-rate audit
(the org notices the player's break-glass count), and the CAB-is-dead debate
(management abolishes and reinstates change control).

## 3. The customer axis (thread B): two axes, a handful of fields

Real orgs tier by WHO asks (person tier) and by WHAT the contract is (relationship
tier), independently. We ship axis 1 (the 0.26.0 VIP flag). Axis 2 is contract tier,
and the two multiply. Minimal data on an arrival:

- `requester` vs `beneficiary` (nullable) - the shadow-VIP truth: VIP lists cover
  "executives and their assistants"; the VIP flag keys off the BENEFICIARY, report
  quality keys off the requester. The EA's immaculate ticket that is still an auto-P2
  earbud comes free.
- `priority_source: impact | vip | contract_tier | self_declared` - the player can SEE
  which lever moved the number. VIP vs VIR (published distinction, thread B 2.3): the
  warehouse scanner at 6am outranks the VP's frozen Teams call on impact, and the
  queue says so out loud. This is the 0.26.0 collision generalised into data.
- `contract_tier` (MSP: managed / co-managed / T&M / block-hours; vendor-side:
  bronze..platinum with named-contact caps) - what the tech may touch, how fast ack
  must come, who audits the invoice.
- `raci_owner` (co-managed only) - the SOFT scope wall: the command SUCCEEDS but
  violated the RACI split, and a peer sysadmin's complaint arrives later. Sharper than
  the hard wall we shipped, because the mistake is quiet.

Consequence asymmetry (thread B finding 10): internal segments escalate loudly and
never leave; external segments escalate quietly and DO leave - churn is silence, and a
client leaving removes work from the world (the mechanic the timesheet design already
names). Month-end/quarter-close is truthfully a change FREEZE: finance becomes
un-deferrable exactly while your latitude to change anything drops - pressure from
both ends off one date field.

HONESTY FLAG the research surfaced: published external SLAs bind the ACKNOWLEDGMENT
clock; resolution is "best effort" everywhere. Internal ITSM tools do configure
resolution targets (our clocks mirror the tool, which is true), but external/vendor-
tier arrivals should bind ack + update cadence (Salesforce Signature: 15-minute update
cadence on Sev-1 - a clock on TALKING, not fixing), not resolution. Owner decision D4.

## 4. Projects (thread C): the work-shape engine, its own epic

Engine truth today: a ticket = precondition + ONE desired-state assertion, graded on
every mutation. The guard language can count; the assertion language cannot ("40 of 60
mailboxes" is inexpressible, "nothing left on the old box" is, via not-exists). Nothing
survives endWeek except the career carry; each employer has exactly one authored week.
Rich substrate exists: change-request.ts is a save-safe windowed state machine (the
phase-machine pattern), parent.ts does content-driven parent/child closure, the E8
delayed-consequence settlers are the lie-comes-due rail.

The model to adopt (thread C 5.1): HaloPSA's, not ConnectWise's - a project IS a
ticket type with project-task child tickets and milestones that LOCK downstream tasks.
Maps onto existing lifecycle + parent.ts reversed; no parallel work-item system.

- Slice 1: phase machine, ONE project, 3 working days inside a shipped week, zero
  core-rs assertion work (counter-field + eq, universal-by-negation). First content:
  the firewall/edge replacement - procurement offscreen, config as phase work, a
  2-hour cutover with minutes of downtime, rollback = moving a cable back, and a
  scream-test phase that generates tickets from your own change. Second: OS rollout
  by deployment rings (pure not-exists, no new grammar).
- Slice 2: THE TENSION - utilisation/timesheets (designed twice, built nowhere), so
  project minutes and ticket minutes compete. Also the watermelon: a REPORTED RAG
  status distinct from true state, green-you-knew-was-red coming due Thursday on the
  E8 rails. Thread C's verdict: slice 1 without slice 2 is just a second queue.
- Slice 3: solvability generalised to scheduling FEASIBILITY; cross-week carry only
  if the fiction demands it.
- E7 cloud then ships as designed (tickets, per the modern-stack research) PLUS one
  cloud-migration project authored on this machine - terraform plan/apply becomes the
  phase readout for free.

Content honesty note from the research: do not cite Standish CHAOS numbers in any KB
article (demolished, IEEE Software 2010); the safe sourced numbers are McKinsey/Oxford
2012, Flyvbjerg HBR 2011, PMI 2018 (52% scope creep), Flexera 2025.

## 5. Epic structure + sequencing proposal

TWO epics, because the dependency shapes differ:

- **E9 - Titles as difficulty + the customer axis.** Data-first over shipped rails:
  per-title config table (work-mix, customer-type mix, SLA profile, meter/patrol/drip
  rates, win condition), start-title as the difficulty select, SD-senior rung (the
  audit queue), customer-type fields + the soft RACI wall + consequence asymmetry,
  utilisation/timesheets (the bridge mechanic - per-title targets ARE the difficulty
  paperwork). Architect rung DEPENDS on E10.
- **E10 - Projects.** The phase machine + Projects app + feasibility gate, HaloPSA
  model, firewall replacement first. Sequenced BEFORE E7; E7 consumes it.

Near-term order stays: 0.28.0 (in flight) -> E9 first lanes (cheap, data over rails)
interleaved with the standing human play-test recommendation -> E10 -> E7.

## 6. Owner decisions (nothing recorded as decided)

- **D1** - Start-title = difficulty select at new game (the July sketch)? Confirm.
- **D2** - After promotion, does lower-tier work BLEND into the queue (research truth:
  seniors stay the safety net) or get replaced? Recommendation: blend, ratio per title.
- **D3** - The thread-C tiebreaker: does a Systems Engineer (shipped tier) do
  projects, or only the cloud rung? Recommendation: yes at syseng (the firewall
  replacement IS a syseng project at an MSP, truthfully) - which is what makes E10
  buildable before E7. If owner says "projects are what the cloud rung IS", E10 folds
  into E7 instead and gets more expensive.
- **D4** - External/vendor-tier arrivals: bind acknowledgment + update-cadence clocks
  instead of resolution (the honesty flag above)? Internal keeps tool-target
  resolution clocks either way.
- **D5** - The career fork (management track vs IC track, Larson's four archetypes,
  the org offering "just a small team") - in scope for E9 content or parked?
- **D6** - The three org-level events (swarming / change-rate audit / CAB debate) -
  E9 content pool or E8-leftovers pool?
