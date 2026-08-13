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
| SD senior (shipped 0.36.0) | A SECOND QUEUE: other people's work. QA-audit juniors' triage/priority while your own clocks run; retained ownership after escalation; KB authoring; major-incident comms | Queue, triage matrix, KB app, escalation | BUILT: the audit tab, five authored filings each wrong in one findable way, the confirm/correct pair, retained ownership, the KB write-up. NOT built: major-incident comms |
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

## 5a. What 0.36.0 settled about the SD-senior rung (built)

Four decisions the build made, recorded because they are the shape of the rung
rather than implementation detail:

- **The second queue is a TAB on the ticket window, not an app.** What doubles
  at this rung is the LIST; everything under it - the detail pane, the clocks,
  the estate, and above all the triage form - is shared. A window of its own
  would have had to carry its own copy of the two dropdowns, the nine cells and
  the deadline arithmetic, which is a second matrix free to drift from the one
  the game teaches. Corollary, and the load-bearing one: **there is no
  audit-correct verb.** Correcting a junior's filing IS `ticket.classify`, with
  a signature and an attention tax hung off the end of it, guarded on a field
  no other ticket carries.
- **The senior is hired at the probation shop, at ARC WEEK TWO.** It is the only
  shop in the build with a first line to audit. Week one is somebody's
  probation - the authored Monday the generator reproduces byte for byte, and
  the one week a rung's blend is forbidden to touch - so a senior starting there
  would carry ratios that mean nothing. Rows now name `startsAt`.
- **Two rungs stand on one PAM tier.** The tier is about privilege and a senior
  service desk analyst has a junior's; a third tier invented to make a lookup
  convenient would have handed this rung `sudo`. `rungFor` reads the TITLE
  beside the tier - both already on the career carry - and the table refuses two
  rows sharing a title.
- **An audit costs the day 33 minutes**, borrowed rather than invented:
  `CAUGHT_MINUTES` (the least clear air a piece of work needs) plus
  `REFOCUS_TICKS` (the tax the correction actually charges), priced as the
  heavier branch and kept out of the partition factor because the switch is
  already in the number. The five items are spread by that budget: two on the
  lightest drawn day, none at all on the heaviest, and the class's last instance
  on the Friday where the ramp does not bind.

Retained ownership is one field and one omission: at the senior title the
handoff GOES and the ticket stays, with no `set_waiting` - because parking it
would pause the deadline, and a rung that could escalate its way out of its own
clock is the opposite of retained ownership. Second line come back ninety
minutes later, which is inside a P3's budget and not reliably inside a P2's.

## 6. Owner decisions (ALL ANSWERED 2026-08-12; D3 earlier)

- **D1 - DECIDED (owner, 2026-08-12): YES** - start-title = the difficulty
  select at new game. **BUILT 0.35.0** (#58 slice B): the log-on box carries the
  whole ladder, the two built rungs are takeable and the five unwritten ones are
  greyed with the reason on them. Taking a rung other than the standard desk
  writes it to `workgrumble/start` and boots the shop its row names, already at
  the tier - through the promotion's own carry, so there is one implementation
  of being an engineer.
- **D2 - DECIDED (owner, 2026-08-12): BLEND, and it LESSENS by title and by
  the type of the work** - lower-tier work stays in the queue after
  promotion, with the ratio a function of both the title and the work kind
  (a senior still resets the odd password; an architect rarely sees one but
  still catches the outage-adjacent basics). Ratio table = build-time data.
  **BUILT 0.35.0** (#58 slices A and C): the ratios are `workMix` on each row of
  `src/world/titles.ts`, as FACTORS against the shop's own mix (1 = the shop as
  it deals it), over four work kinds - access, device, server, project - that
  `src/world/work-kinds.ts` derives from the verb each ticket's advertised path
  closes with. The week generator consumes them as a per-week share quota. Where
  a shop's pool cannot express a rung's blend the blend YIELDS to the week (the
  band is a promise about the day, the blend is a promise about the title);
  which shops carry which blend is measured by `mixAfforded` and ratcheted in
  `src/world/week-mix.test.ts`. Measured today: the engineer's blend holds at
  the MSP every week, at Halcyon Grange and Bodgeworth about half the time, and
  at the probation shop not at all (its surplus is desk work almost all the way
  down).
- **D3 - DECIDED (owner, 2026-08-09): yes, Systems Engineers do projects too.**
  E10 builds standalone, sequenced before E7; E7 ships as a content pack over it.
  First content: the firewall replacement at the MSP.
- **D4 - DECIDED (owner, 2026-08-12): YES** - external/vendor-tier arrivals
  bind acknowledgment + update-cadence clocks; internal keeps tool-target
  resolution clocks.
- **D5 - DECIDED (owner, 2026-08-12): MANAGEMENT TRACK PARKED** - the manager
  game is konttori's job, not this one's. The owner DOES want forks, but
  IT-shaped ones: IC specialisation tracks (the security / infra / cloud
  flavour of senior, not "just a small team"). Wants its own short design
  pass when E9 reaches the senior rungs.
- **D6 - DECIDED (overseer's call, owner delegated 2026-08-12): E9 content
  pool** - the three org-level events are title-flavoured (a CAB debate
  lands when you are senior enough to be in the room; swarming and the
  change-rate audit read differently per rung), so they ship with the title
  system rather than as E8 leftovers.
