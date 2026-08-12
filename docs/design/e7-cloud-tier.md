# E7 cloud/devops tier: synthesis + the decisions it needs

Dated 2026-08-12. Merges the two research threads - docs/research/e7-cloud-work.md
(the work + the fun) and docs/research/e7-cloud-engine-fit.md (the engine fit,
file:line throughout) - into one design picture and ONE deduplicated owner-
decision list. Nothing here is decided; this is the epic's build-ready
proposal, framed for discussion (ideas are discussions).

## 1. The one-sentence finding

The epic's "terraform is nearly free by design" is **half true, about the
wrong half**: the graph and the diff are cheap (a security-group rule already
ships, by hand, as the Arden firewall rules; a one-job `terraform plan`
already exists as `fwRuleLines`), but the **bill is the epic** - player money
cannot go down today, and "monthly" does not exist in a five-day-week game.
So E7 splits cleanly into a cheap, high-value FIRST half (the estate, the
console, plan/drift - the thing that teaches terraform's mental model) and an
expensive SECOND half (money) that is a real economy change and wants its own
owner call.

## 2. What the research settled (no decision needed)

- **Docker before Kubernetes, by data not opinion** (Docker 92% / Compose 71%
  / k8s 42%; k8s is a minority of the same population). The "I learned this
  from a game" claim is most defensible at the Docker/Compose rung. k8s can
  slip to a later version without weakening the tier.
- **The k8s junior surface is a four-verb ladder** (`get` -> `describe` ->
  `logs` -> `logs --previous`); every failure class is a status field + one
  hidden cause. No new engine grammar.
- **The E10 phase chain already IS the migration chain** - audit / staging /
  cutover / scream_test / handover maps 1:1 onto AWS assess/mobilize/migrate.
  The cloud project is content on shipped machinery.
- **The AI beat needs no exaggeration** - incident.io's SRE Agent joins real
  on-call rotas; ~49% of AI terraform validates, ~29% of runs hallucinate an
  argument name; the true stories (Amazon Q's shipped wiper prompt, Replit's
  agent deleting prod then self-rating 95/100, Cursor's invented policy) are
  the comedy.
- **The fun principles**: the blueprint/module-capture rule (Factorio's
  blueprint = the terraform module: earn it by hand, then stamp it forever, or
  the tier is a job); private per-run histograms over a grade (Zachtronics);
  the Wheel of Misfortune (Google's own practice - replaying a lived incident).

## 3. What the engine says (the traps, named before they bite)

- **Most cloud resources need no new node kind** - fields are open; a
  security-group rule is the shipped Arden firewall rule. ONE new kind
  (storage). Missing fields: provider, region, cost_per_hour, tags.
- **No diff code exists** and `Expr` cannot enumerate, so the plan LIST is TS
  and the convergence GATE stays `not(exists(...))` - but the pattern ships
  twice by hand already.
- **`applySetup` bypasses the action registry**: an apply routed that way
  bills zero minutes and leaves no audit trail. Apply MUST be a registry
  action.
- **The dispatch log is drained every clock-off** - it is the only actor-
  bearing record, so the drift whodunit uses the shipped on-node `id@tick`
  trail idiom, not the log.
- **Player money cannot go down** (`net = Math.max(0, gross - deducted)`, four
  write sites) - the surprise-bill blocker, and the reason money is its own
  decision.
- **MERIDIAN-SAAS is already canonically in the cloud** - the estate exists;
  do not invent a customer.

## 4. The decisions (deduplicated - both threads' D-E7 lists merged)

Fourteen, each decidable, each with a recommendation. Grouped by what they
gate. The two threads asked several of these twice from different angles;
merged and numbered fresh as **DE7-1..14**.

### A. Scope of the first release

- **DE7-1. Docker/Compose the first rung; is Kubernetes in the first E7
  release at all?** Rec: Docker+Compose first, k8s a later version. (thread 1
  D-E7-1)
- **DE7-2. Is the YAML/HCL editor a real parser or a text field?** Rec: real
  parser, one manifest kind at a time - the difference between teaching the
  skill and miming it. (t1 D-E7-2)
- **DE7-3. Does the module/blueprint capture verb ship in v1?** The mechanic
  that makes IaC fun rather than admin. Rec: yes, scoped to one parameter;
  owner call on which slice. (t1 D-E7-3)
- **DE7-4. Does the first cloud project fit one week (3 days like Arden) or
  wait for more of E11's week-2 content?** The real migration is weeks-to-
  never; the shipped phase machine argues ship-now. Rec: one-week authored
  slice, honest that it is a small real migration. (t2 D-E7-9)

### B. The bill (the economy question - the expensive half)

- **DE7-5. Does a cloud bill move `farm_fund` (real money) or not?** (a)
  employer eats it - E7 stays a content pack; (b) change the `max(0,...)`
  invariant so money can fall - E7 is an economy change; (c) the bill is a
  ticket + reputation hit, no money moves. Rec: (c) for v1 (keeps E7 a content
  pack, the surprise-bill still teaches), (b) as a later, owner-gated economy
  epic. **This is the pivotal decision - it decides what E7 IS.** (t2 D-E7-3)
- **DE7-6. What is "monthly"?** Weekly-called-the-invoice-run (cheap, honest),
  calendar-month off the E11 arc (needs the carry), or a planted legacy
  artifact. Rec: weekly invoice-run + one planted artifact for flavour. (both
  threads: t1 implicit, t2 D-E7-4)
- **DE7-7. Error budget: flavour or full mechanic?** Rec: start (a) a burn-
  rate column retrofitted onto the shipped sysadmin alert queue; (b) the full
  budget bar + exhaustion freeze later. (t1 D-E7-4)

### C. Naming and surfaces

- **DE7-8. One provider dialect or several?** AWS-shaped resource plane is the
  market truth + richest incident literature; identity plane stays Okta-class
  (already shipped). Rec: one deep provider in v1, a worse copy as an employer
  variation later. (both: t1 D-E7-9, t2 D-E7-1)
- **DE7-9. The provider's NAME.** House style is a mundane noun + version
  (DeskPro, Orchard, Hubbub); the epic's Nimbus-WS/Cerulean/Giga read as jokes
  about real names. Rec: pick a mundane-noun provider name in the house
  register, not a pun. (t2 D-E7-2)
- **DE7-10. The storage noun.** `bucket` is already the timesheet's player-
  facing word. Rec: give the cloud thing a different noun (store/blob-class),
  leave the timesheet's bucket alone. (t2 D-E7-6)
- **DE7-11. Console as its own app or browser sites?** Browser is `slack:true`
  (a console there = skiving). Rec: one non-slack Console app + N browser
  sites for marketing/pricing/status. (t2 D-E7-5)
- **DE7-12. Is the state file diegetic?** A `file` node the player can read,
  lose and corrupt, or invisible bookkeeping. Rec: diegetic - the lost/locked-
  state incident is real and cheap once it is a file. (t2 D-E7-8)

### D. Tier and the AI beat

- **DE7-13. Content pack on the Engineer tier, or a third rung?** D3 said
  content pack; e6-sysadmin.md sketched a next unlock. `isSystemsEngineer` is
  a boolean not an ordering, so a third rung means auditing 8 gate sites for
  ordering semantics. Rec: content pack on the Engineer tier for v1 (honors
  D3, ships fastest); revisit a rung when the title ladder (E9) is real. (both:
  t1 implicit, t2 D-E7-7)
- **DE7-14. How wrong is the Assistant, and does it go on the rota?** Rec:
  keep the hallucination RATE honest but make the tell always findable in the
  plan (skill decides, not dice); the AI-on-rota teammate is a late-tier
  employer variation, not a baseline. Four-axis project histogram (cost /
  blast radius / downtime / speed) at project end = cheap replay hook, ship
  it. Wheel of Misfortune = a senior-rung teaching verb (fits E9's "you stop
  resolving and start teaching" shape break). (t1 D-E7-6/7/8/10)

## 5. Slice ladder (if the epic gets a GO)

From the engine-fit thread, adjusted for the decisions above:

- **Spike 0** (blocking, data-scoped rule): the dated per-provider research
  spike into docs/spikes/ - real console screens, real resource fields, real
  bill line items, real drift messages. One provider (DE7-8/9).
- **Slice 1 - the estate + the console, read-only.** MERIDIAN-SAAS's cloud
  estate as nodes with provider/region/cost_per_hour; one new kind (storage);
  a non-slack tier-gated Console app (list over nodesOfKind + the shipped
  region filter). This is the honest test of the premise.
- **Slice 2 - plan + drift.** The declared graph, the TS diff, plan as a
  readout, the manual-change drift whodunit on the on-node trail idiom. The
  best cloud ticket in one mechanic, exercising the declared-vs-actual engine.
- **Slice 3 - apply.** A registry ACTION (never applySetup) with a when-guarded
  op batch; the E10 phase machine for apply-in-progress.
- **Slice 4 - money** (gated on DE7-5). Derived cost + start/stop ledger
  reusing the timesheet segment encoding; the surprise bill; the invoice run.
- **Slice 5 - the cloud project.** One migration authored on the E10 phase
  machine; plan/apply becomes the phase readout for free.
- **Slice 6 - content.** The public bucket, security-group/IAM access requests
  (the password-reset of cloud), the AI beat, the histogram.

**Slices 1-2 are the honest test of the epic's premise**: if the plan readout
is not fun to read, the tier is a job and we stop. Everything past slice 3 is
committed only if slices 1-2 land.

## 6. Recommendation to the owner

E7 is a GO-shaped epic with one fork that changes its nature (DE7-5, the bill).
The cheap half - estate, console, plan, drift - is high-value, teaches the real
terraform mental model, and rides shipped machinery. Propose: **answer DE7-5,
DE7-8, DE7-9 first** (they gate the spike), run Spike 0, build slices 1-2, and
decide the rest against a playable plan readout rather than on paper. But E7 is
the LAST tech epic and it wants E11 (week-2 content, in flight) and ideally E9
(the title ladder that a cloud rung would sit above) to land first - so this is
next-after-those, not next.
