# E7 cloud/devops tier research (thread 1): the work under the parody

2026-08-12. Research spike for epic E7 (issue #8), thread 1 of 2. Companion to
`docs/research/modern-stack.md`, which already owns the cloud-console + IaC surface
(section 4: the public bucket, the surprise bill, tagging chaos, terraform drift and the
manual-change whodunit) and the monitoring/on-call surface (section 5: the stack by shop
size, raw alert-fatigue numbers, status pages, EDR triage). **None of that is repeated
here.** This thread covers what modern-stack does not: containers/Kubernetes, the CI/CD
pipeline surface, the shape of a real migration project, how SRE practice turns raw
alert counts into an error budget, the AI-in-everything beat, and a survey of which
games have made infrastructure FUN rather than a chore.

The north star from the epic: **real learning under the comedy.** A player should be
able to say "I learned terraform and docker from a game" in a job interview and be
right. That sets a hard bar on this research: every mechanic proposed here has to map
onto a verb a real junior actually performs, in the order they actually perform it. Where
a fact is trade folklore rather than a measurement, it is labelled as such.

Per section: real surface -> "Feeds game tier" -> credible additions. Priority band
convention follows modern-stack (P1 = cheap on shipped rails, P2 = needs a surface,
P3 = new system). Everything here is E7-tier unless flagged otherwise.

---

## 1. Containers and Kubernetes at the junior-to-mid rung

### Docker is near-universal; Kubernetes is a minority of the same population

**Docker adoption is effectively saturated and Kubernetes is not.** Docker's own 2025
State of Application Development survey (4,500+ developers and tech leads) puts Docker
use among IT professionals at **92%, up from 80% in 2024** - the largest single-year jump
of any technology it tracked. Within that population the tool mix is **Docker Compose
71%, Docker Engine 57%, Kubernetes 42%, Kubernetes-with-Docker-Desktop 35%**
([Docker State of App Dev 2025][docker-soad]). Stack Overflow's 2025 survey (49,000+
respondents) independently makes Docker the most-used container technology at **71.1%**
and the top-ranked cloud development tool, with the biggest usage surge in the survey
([Stack Overflow 2025 technology][so2025]).

The gap between 71-92% Docker and 42% Kubernetes is the single most important teaching
fact in this section. **Most people who "do containers" do single-host containers**, and
Compose - one YAML file, `up`/`down`/`logs`/`ps` - is the majority experience. Kubernetes
is what happens to the subset who scale.

### The curriculum question, answered

The trade press consensus is uniform to the point of boredom: learn Docker first, because
Kubernetes presupposes it ([Docker vs Kubernetes: what to learn first][elevate-order],
[The Code Machinist][codemachinist]). That is soft evidence, but the adoption numbers
above are hard evidence for the same conclusion, and there is a third, better argument
specific to this game: **the Docker mental model is one machine, and the game already
models one machine.** A container is a process with its own filesystem on a host the
player can already `ls`. Kubernetes is a control loop that reconciles declared state
against actual state across many hosts - which is the SAME model the engine already needs
for terraform (declared-graph vs actual-graph, DESIGN section 5). So the honest
curriculum order is also the cheapest build order:

1. **Docker on one host** (build, run, logs, exec, ports, volumes, the image that works
   on your laptop and not on the server) - teaches the container primitive.
2. **Compose** (a file that declares several containers and their wiring) - teaches
   declarative config and the YAML genre without a cluster.
3. **Kubernetes as the same declaration, reconciled** - teaches the control loop, which
   is terraform's model wearing a different hat.

### What a junior actually touches: the read-then-act ladder

Junior DevOps job descriptions converge hard: **assist in maintaining CI/CD pipelines,
support infrastructure automation, monitor system health and escalate; seniors design the
architecture and the pipelines** ([iMocha junior DevOps JD][jd-imocha], [Superworks
junior DevOps JD][jd-superworks]). Translated to Kubernetes, that means the junior lives
in the read verbs and a small number of blessed write verbs, and does not touch the
cluster itself.

Kubernetes' own docs prescribe the diagnostic ladder, and it is short enough to be a game
menu: **`kubectl get pods` (read the STATUS column) -> `kubectl describe pod` (read the
Events block at the bottom) -> `kubectl logs` -> `kubectl logs --previous` (the crashed
container's last words) -> `kubectl exec` if it is still alive** ([Kubernetes: debug
pods][k8s-debugpods], [GKE CrashLoopBackOff troubleshooting][gke-clbo]). The same three
commands answer every question in the genre; the skill is knowing which output to believe.

The failure taxonomy is small, named, and fully diagnosable from that ladder:

- **CrashLoopBackOff** - "a container within it is repeatedly starting and crashing".
  Kubernetes retries with an exponential back-off of **10s, 20s, 40s ... capped at five
  minutes**, and Google's own guidance splits the causes three ways: resource exhaustion
  (OOM), **liveness-probe failures** (the health check is wrong, not the app), and app
  misconfiguration including the deceptive "exited successfully with code 0"
  ([gke-clbo]). Note the mechanic hiding in the back-off: **the punishment for a bad fix
  is a longer wait before you learn it was bad.** That is a game timer, free.
- **ImagePullBackOff / ErrImagePull** - wrong tag, wrong registry, or missing pull
  credentials for a private registry. The Kubernetes docs' own advice is to check the
  image name and try pulling it by hand ([k8s-debugpods]).
- **Pending** - nothing is broken; there is nowhere to put it. "You may have exhausted
  the supply of CPU or Memory in your cluster, in this case you need to delete Pods,
  adjust resource requests, or add new nodes" ([k8s-debugpods]). The fix is a judgment
  call about someone else's workload, which is the good kind of ticket.
- **OOMKilled** - exit code **137** (128 + SIGKILL 9): the container exceeded its memory
  limit and the kernel killed it. Raising the limit is the obvious move and is sometimes
  wrong; the app may be leaking.
- **Terminating forever** - a finalizer or an admission webhook is blocking deletion
  ([k8s-debugpods]).

**The requests/limits genre is where the honest tuning content lives, and the industry is
provably bad at it.** Datadog's 2025 State of Containers and Serverless finds **more than
65% of Kubernetes workloads use less than half their requested CPU and memory**, and that
**about two-thirds of Kubernetes containers live under 10 minutes, a third under one
minute** ([Datadog: key learnings 2025][dd-containers], [Datadog State of Containers and
Serverless][dd-report]). Komodor's 2025 enterprise report, built from telemetry across
hundreds of production environments, puts it more bluntly: **82% of workloads are
overprovisioned, 11% are underprovisioned, and only 7% have accurate requests and
limits** ([Komodor 2025 Enterprise Kubernetes Report][komodor25]). So the true state of
the practice is: almost nobody has these numbers right, half the estate is paying for air,
and the other tail is the thing that OOMKills at 3am. A game that makes the player set a
memory limit and then live with it is teaching a skill 93% of professionals do not have.

### What juniors do NOT touch

Cluster administration - etcd, control-plane upgrades, CNI choice, node pools, admission
controllers, cluster autoscaler tuning - is not junior work, and the industry has built an
entire discipline around hiding it. **Platform engineering's stated purpose is exactly
this cognitive-load reduction**: a "golden path" or "paved road" is an opinionated,
supported, automated workflow so that "developers do not need to learn every detail of
each tool" ([CNCF: what is platform engineering][cncf-pe]). The junior's cluster is
someone else's product.

That gives E7 a clean and TRUE permission wall, mirroring the one the game already uses at
L1: **the player may read anything and write to their own namespace; cluster-scoped verbs
are refused with "you are not a cluster admin".** The comedy is that the paved road is
always slightly the wrong shape, and the correct senior play is to ask the platform team
rather than to route around them.

### The YAML genre

The joke writes itself, but the primary source is funnier than the joke: the Kubernetes
docs themselves teach `kubectl apply --validate -f mypod.yaml` using the example of a
typo, **`commnd` instead of `command`** ([k8s-debugpods]). Indentation-significant
configuration with no compiler, hand-edited under time pressure, is a real and
well-documented drag on delivery ([How Kubernetes YAML manifests are dragging down
developer productivity][devto-yaml]). For the game, YAML should be a **diffable text
surface with a real parser behind it** - not a fake text box that accepts anything. A
one-space error that produces a plausible-but-wrong object is the single most authentic
puzzle in this tier, and it is only funny if the parser is real.

### Scale reality, for tuning

Komodor's telemetry gives the numbers to tune a cloud-tier week against:
**79% of production issues originate from recent system changes**; median time to detect a
high-impact outage is **~40 minutes** and median time to repair **over 50 minutes**;
**38% of companies report high-impact outages weekly**; **over 60% of ops-team time goes
to troubleshooting**; and **only 20% of incidents are resolved without escalation**
([komodor25]). Spectro Cloud's 2025 survey (455 professionals at 250+ employee orgs,
fielded May 2025, run independently by Adience) adds the estate shape: the average adopter
runs clusters across **more than five environments**, **50% run production Kubernetes at
the edge**, and **cost has overtaken skills and security as the #1 challenge at 42%**,
with **88% reporting a year-on-year rise in Kubernetes TCO** ([Spectro Cloud State of
Production Kubernetes 2025][spectro25], [press release][spectro-bw]).

The 79% figure deserves its own line because it is the design thesis of the whole tier:
**almost everything that breaks in cloud was changed by someone recently.** That is
exactly the shape of the drift whodunit modern-stack already specced, and it means the
cloud tier's incident generator should preferentially seed faults from the player's own
and NPCs' recent changes, not from random noise.

### Feeds game tier

E7 cloud tier, and it reorders the epic's build list: **Docker before Kubernetes, and
Compose as the bridge.** The `kubectl get -> describe -> logs -> logs --previous` ladder
is a four-verb app over the existing graph, and every failure state above is a field
value plus one hidden cause - the exact shape the ticket engine already grades.

### Credible additions

- **P1 - The three-command ladder as an app.** A `k8s` console app whose only verbs are
  get/describe/logs/logs --previous/rollout undo. Every pod is a graph node with a status
  field; every incident is "which of the three outputs tells the truth". Zero new engine
  grammar: status equality plus not-exists covers all of it.
- **P1 - CrashLoopBackOff with a real back-off clock.** The 10s/20s/40s-to-5-minutes
  escalation is a shipped-quality mechanic: a wrong fix costs the player the next, longer
  wait. Pair it with the three real causes (OOM / liveness probe / exit-0 misconfig) so
  the diagnosis actually branches.
- **P1 - The liveness-probe fake-out.** The app is fine; the health check is wrong.
  Restarting does nothing, "fixing the app" does nothing, reading the probe config fixes
  it. This is the cloud tier's version of the hidden-cause ticket and it is textbook-real.
- **P2 - Requests and limits as a standing tuning surface.** Set a memory limit; too low
  and you get OOMKilled at the worst moment; too high and it shows up on the monthly bill
  the surprise-bill ticket already reads from. The real 82%-overprovisioned /
  7%-accurate split ([komodor25]) is both the joke and the difficulty curve.
- **P2 - The real YAML editor.** A parsed, indentation-significant manifest editor with
  `--validate` as an in-game action, seeded with the docs' own `commnd` typo class. Do
  not fake the parser; the fidelity IS the feature.
- **P2 - The paved-road wall.** Cluster-scoped verbs refused with a pointer to the
  platform team, whose golden path is subtly wrong for this app. Reuses the shipped
  permission-wall machinery and teaches a true org fact.
- **P3 - Docker-first onboarding week.** Before any cluster exists: build an image, run
  it, read its logs, discover that it works on the laptop and not on the server. This is
  the tier's tutorial and it is the part most likely to survive into a real interview
  answer.

---

## 2. The CI/CD pipeline surface

### Juniors run pipelines; seniors write them

The JD evidence is unambiguous: junior DevOps engineers **"monitor CI/CD pipelines and
build runners to triage common failures"** and **"support CI/CD pipeline builds and test
integrations"**, while designing the pipeline is explicitly senior work ([jd-imocha],
[jd-superworks]). So E7's pipeline content should be **90% diagnosis and 10% editing** -
the player reads a red build and decides what class of red it is, and only occasionally
touches the pipeline definition.

The tool landscape, from JetBrains' 2025 State of CI/CD survey (805 respondents):
**GitHub Actions leads at 62% for personal projects and 41% inside organizations**;
Jenkins and GitLab remain heavily used in enterprises; **32% of organizations run two
different CI tools and 9% run at least three**; and **73% of respondents use no AI in
their CI/CD workflows at all** ([JetBrains State of CI/CD 2025][jb-cicd]). Two facts to
harvest: the multi-tool mess is normal (which is the pipeline version of the
ticketing-system-variety mechanic modern-stack section 3 already designed), and the
AI-in-everything beat is far LESS penetrated in CI than the vendor noise suggests - useful
calibration for section 5's comedy.

### The broken-pipeline ticket classes

**Class 1: the failure that is not yours.** This is the defining pathology and it is well
measured. An empirical study of unrelated build failures found developers spend a
**median of 4 hours determining whether a build failure is related to their own push**
([Springer: is this build failure related to my patch?][springer-unrelated]). Atlassian's
engineering blog gives the flakiness numbers from real estates: flaky tests were
responsible for **21% of master build failures on the Jira frontend** and ~**15%** on the
backend; Atlassian cites **Microsoft Research at 13% of test failures flaky** and
**Google at 16%**; and the reruns those flaky tests force waste **over 150,000 hours of
developer time a year** on the Jira backend alone ([Atlassian: taming test
flakiness][atl-flaky]). The tool Atlassian built to cope processes **350 million test
executions a day** and recovered **22,000 builds** in one quarter ([atl-flaky]).

The game-relevant truth: **a red build is a triage problem before it is a fix problem**,
and the correct first action is usually "re-run and observe", which is also the action
that hides real bugs. That is a genuine judgment call with a real trap, which is exactly
what this game grades.

**Class 2: the stuck runner.** Jobs sit in "Waiting for a runner to pick up this job"
forever. The documented causes are mundane and enumerable: the runner is offline or its
service crashed; a **label mismatch** (the job asks for `runs-on: custom-label` and no
registered runner carries it); the concurrency limit is hit; or a runner is wedged in
Busy state and blocks every repo sharing it ([actions/runner #4312][gh-runner-stuck],
[GitHub community: workflow stuck in queued][gh-queued]). The fix ladder is
cancel-and-rerun, then restart the runner service, then go look at the machine. Note the
blast radius: **one wedged shared runner stalls every team**, which converts a technical
fault into a queue of angry people - the game's favourite shape.

**Class 3: the expired secret.** This is the best-sourced comedy in the section because
the real incidents are enormous. In December 2018 an **expired certificate in Ericsson's
SGSN-MME software took O2 offline for roughly 24 hours, affecting about 32 million UK
subscribers plus Tesco Mobile, Sky Mobile and SoftBank in Japan** - 11 operators in total,
no attacker involved ([TechCrunch on the O2/SoftBank outages][o2-tc], [The SSL Store on
the Ericsson certificate][o2-ssl]). In February 2020 **Microsoft Teams went down for
hours because Microsoft forgot to renew an authentication certificate**
([GeekWire][teams-cert]). The pipeline-scale version of the same fault is the deploy
token, cloud credential or signing key that quietly expires on a date nobody diarised, and
the failure mode is identical: everything was fine, nothing changed, everything is broken.

**Class 4: the deploy freeze argument.** `day-to-day-frustrations.md` section on
Friday-deploy culture already owns the "never deploy on Friday" debate and its
counter-argument; **not repeated**. What it does not cover is the FORMAL, scheduled,
calendar-driven freeze: retail and ecommerce shops routinely freeze code from roughly a
month before Thanksgiving through the end of the holiday season, and Amazon and Google
both operate internal freeze windows and push them onto vendors ([Pragmatic Engineer:
code deployment freezes][freeze-pragmatic], [FullStory: holiday code freeze][freeze-hcf]).
The modern counter-position is that freezes are an antiquated risk-management crutch that
just batches risk into one enormous January release ([freeze-pragmatic], [freeze-hcf]).
For the game, the freeze is a **calendar field that changes which actions are legal**,
arriving at the worst possible time - and `titles-difficulty.md` already identified
month-end/quarter-close as the same shape at the MSP. One mechanic, two skins.

### DORA 2025: the metric frame changed

The 2025 DORA report deliberately demoted the classic four metrics (referenced in a
footnote), replaced the low/medium/high/elite ladder with **seven team archetypes**, and
added a **rework rate** metric. Its headline finding: **AI adoption correlates positively
with throughput and simultaneously with instability - more change failures, more rework,
longer times to resolve** ([The Register on DORA 2025][dora-reg], [Faros: DORA 2025
takeaways][dora-faros]). The plausible mechanism is that AI raises the rate of code
generation faster than review and deploy infrastructure can absorb it.

That is a directly playable law: **the assistant makes the player faster and the estate
less stable, measurably.** It is also the honest, cited spine of section 5.

### Feeds game tier

E7, and partly E9/E10: a pipeline is a project-shaped artifact with phases, so the
existing project phase machine can host "the pipeline run" as a readout. Change freezes
are a calendar field the week generator already knows how to carry.

### Credible additions

- **P1 - The red build triage ticket.** Three reds in the queue: one flaky, one
  genuinely broken by the player's own change, one broken by someone else's merge.
  Re-running is free and correct exactly once. The 21%/15%/13%/16% flakiness numbers
  ([atl-flaky]) set the honest ratio.
- **P1 - The wedged shared runner.** One `Busy` runner blocks every team; the fix is
  three escalating actions; the cost of guessing wrong is a queue of DMs. Reuses the
  flood archetype and the chat app wholesale.
- **P1 - The expired-secret event.** A dated credential in the estate that nobody
  diarised. Set the clock so it fires mid-week during something else. The O2 and Teams
  stories are the KB article, verbatim and true - and they teach the actual lesson
  (monitor expiry dates, not just uptime).
- **P2 - The freeze window.** A calendar-driven period where deploy verbs are refused and
  work piles up, ending in one oversized release whose failure rate is visibly worse. The
  freeze is both correct and harmful; the game should let the player feel both.
- **P2 - Two CI tools in one estate.** Per the 32%/9% multi-tool finding, an employer
  where half the services build in one system and half in another, with subtly different
  vocabulary. This is the ticketing-variety mechanic ported to pipelines and it costs a
  data table.
- **P3 - Rework rate as a visible meter.** DORA's new metric, and the honest counterweight
  to the assistant's speed bonus.

---

## 3. The migration project: shape, phases, and where it goes wrong

The E10 phase machine already exists and its chain is
`audit -> staging -> cutover -> scream_test -> handover`, with phases DERIVED from facts
about the world rather than stored flags, and gates expressed as equality or
not-exists over the graph (`src/world/project.ts`). The good news from this research is
that **the shipped chain is already the real chain**, and a cloud migration needs no new
phase vocabulary - only new gate facts.

### The industry chain maps onto the shipped chain

AWS's prescriptive guidance splits a migration into **assess** (build the business case,
inventory the portfolio, confirm stakeholder alignment), **mobilize** (build the landing
zone, migrate a small set of applications to gain hands-on experience) and **migrate and
modernize**, which itself divides into initialize and implement ([AWS: phases of a large
migration][aws-phases]). Its seven strategies - the **7 Rs** - are rehost, replatform,
relocate, repurchase, refactor, retire, retain, and its explicit advice is that **for
large migrations rehost/replatform/relocate/retire are the common choices and refactoring
during migration is not recommended** - modernize afterwards ([AWS: about the migration
strategies][aws-strategies]).

That gives the game a decision with a right answer and a tempting wrong one: the player
who tries to "do it properly" and refactor during the lift is following instinct against
documented practice, and the phase machine can punish it with schedule.

The three-day project maps like this:

| Shipped phase | Migration content | Gate fact (Expr shape) |
|---|---|---|
| `audit` | Inventory the box: services, cron jobs, scheduled tasks, listeners, who calls it | equality: the old box has been read |
| `staging` | Build the target: instance, security group, storage, the app deployed but not live; **lower the DNS TTL** | not-exists: no known dependency is missing on the new box |
| `cutover` | Flip DNS / move the load-balancer target; the maintenance window | equality on an EDGE: traffic points at the new box |
| `scream_test` | Leave the old box powered but drained; wait for screams | not-exists: no unresolved ticket traced to the old box |
| `handover` | Decommission, document, raise the TTL back | terminal |

**The rollback is already a real verb** in the shipped design (move the cable back), and
DNS gives the cloud version of the same physical honesty: point the record back at the old
IP, and the derivation says the cutover has not happened.

### Where it goes wrong, with sources

**DNS cutover and TTL.** The craft practice is uniform: lower the TTL on the records you
are about to move to **300 seconds, at least 24-48 hours before the cutover** (some
runbooks step it down 86400 -> 3600 -> 300 over a week), because the OLD, longer TTL has
to expire from caches before the new short value takes effect anywhere. Then cut over, and
raise the TTL back afterwards ([Softsys: lower your DNS TTL before a migration][ttl-soft],
[DCHost: DNS TTL best practices][ttl-dchost]). The trap is beautiful and entirely
mechanical: **forgetting to lower the TTL in advance does not fail at the time you forget;
it fails 24 hours later, as an unfixable long tail of users still hitting the dead box.**
That is a delayed-consequence gate the E8 settler rails already know how to carry, and it
is unforgeable - you cannot fix it during the cutover, only regret it.

**The forgotten cron job.** Decommissioning guidance names the exact audit surface:
scheduled tasks and cron jobs, IIS sites, SQL instances, service accounts authenticating
against the host, load-balancer pool memberships, DNS CNAMEs, and hardcoded IPs in
scripts; the practitioner warning is that **automated discovery tools miss the informal
dependencies - the script someone wrote three years ago that pulls from a box nobody
remembers provisioning** ([Exit Technologies: server decommissioning guide][decom-exit],
[Red Hat: decommissioning process][redhat-decom]). The failure lands late: the payroll
job or the backup that pointed at a machine which no longer exists.

**The hardcoded IP.** Named in the same guidance as a leading cause of
post-decommission outages, with a second-order horror worth stealing wholesale: **the old
IP gets reassigned to a new device while the old box is still intermittently powered on,
producing an address conflict that is notoriously hard to diagnose** ([decom-exit]).

**The scream test is a real, named practice with a real origin.** Microsoft's own
engineering blog documents it: Pete Apple, a cloud network engineering architect in
Microsoft Digital, helped develop the Scream Test, and Microsoft has since published its
move FROM scream testing TO holistic lifecycle management - i.e. the practice is real,
widely used, and quietly embarrassing ([Microsoft Inside Track: scream test][ms-scream]).
The canonical form is "unplug it for two weeks and see who screams". The game already
ships this phase; it can now cite it.

**The overrun numbers, for the schedule pressure.** McKinsey's survey of roughly 450 CIOs
and IT decision makers found **75% of cloud migrations ran over budget** and about **38%
ran behind schedule**, with **28% more than 20% over budget** and **13% behind schedule by
more than three quarters** ([McKinsey: cloud migration opportunity][mck-pdf], figures as
reported by [RTInsights][rtinsights-mck]). Note the honesty constraint from
`titles-difficulty.md`: Standish CHAOS numbers are demolished and must not appear in any
KB article; McKinsey/Oxford, Flyvbjerg and PMI are the sanctioned sources. This McKinsey
figure is in the sanctioned family.

### What plan/apply reads like as a phase readout

This is the cheapest and best idea in the epic and the research confirms it works
literally, not metaphorically. `terraform plan` is a **three-way diff of declared state,
recorded state and reality**, rendered as a list of `+ create`, `~ update in place`,
`-/+ replace` and `- destroy` lines with a count. The project board can BE that output:

```
Plan: 4 to add, 1 to change, 0 to destroy.

  + nimbus_instance.app_new            [staging  ] done
  + nimbus_security_group.app_web      [staging  ] done
  ~ nimbus_dns_record.www              [cutover  ] pending - TTL still 3600, lower it first
  + nimbus_backup_schedule.nightly     [audit    ] MISSING - cron on the old box, not declared
  - nimbus_instance.app_old            [handover ] blocked by scream_test
```

Every line is a phase gate the machine already derives, printed in the tool's own
vocabulary. The player learns to read a real plan by reading the project board, and the
"forgotten cron job" arrives as **a line that is not in the plan at all** - which is
exactly how it arrives in life.

Two apply-time failure modes belong here because they are the ones juniors actually hit:

- **Partial apply.** An apply that dies halfway leaves reality between two states, and
  the recorded state is now the only account of what happened.
- **`Error acquiring the state lock`.** Terraform locks state before any operation that
  can change it. The usual causes are a genuinely concurrent run, or a **stale lock left
  by a pipeline that was cancelled or timed out mid-apply**; the documented remedies are
  `-lock-timeout` and, only when certain, `force-unlock` - with the standing warning that
  force-unlocking a live apply can corrupt state ([Spacelift: error acquiring the state
  lock][tf-lock], [HashiCorp support: state lock][hashi-lock]). **Two people applying at
  once is a two-NPC comedy and a real teaching moment in one object.**

### Feeds game tier

E10's phase machine, unchanged, with E7 content. No new grammar: every gate above is an
equality or a not-exists. The plan readout is a rendering of state the machine already
derives.

### Credible additions

- **P1 - The migration project as the tier's spine.** One app, office box to Nimbus, three
  days, five phases, plan/apply as the board. This is the epic's stated shape and the
  research says it is buildable as-is.
- **P1 - The TTL trap.** Lowering the TTL is a phase-1 action with no visible reward; not
  doing it makes the cutover leak for a day. Delayed consequence, unfixable in the moment,
  entirely fair because the KB says to do it.
- **P1 - The forgotten cron job.** A scheduled job on the old box that no plan mentions.
  It surfaces during the scream test as a ticket ("the Tuesday report didn't arrive"), and
  the audit-phase player who ran the right read never sees it. Rewards thoroughness with
  ABSENCE of a problem, which is the truest thing this genre can teach.
- **P2 - The hardcoded IP and the address conflict.** Second-order: the freed IP is reused
  and something else breaks with symptoms that point at the wrong machine.
- **P2 - The state lock collision.** An NPC starts an apply while the player is mid-plan.
  Waiting is correct; force-unlocking is available, tempting, and occasionally
  catastrophic.
- **P3 - The refactor temptation.** Offer a "while we're in here, let's modernise it"
  branch that is instinctively right and documented-wrong ([aws-strategies]); it costs the
  schedule and the delta is visible on the board.

---

## 4. SLOs, error budgets, and what alert fatigue becomes at this tier

`modern-stack.md` section 5 already owns the raw numbers (~50 alerts per on-call engineer
per week, 2-5% actionable, 67% of engineers admit ignoring alerts, 85% of teams say most
alerts are false positives). **Not repeated.** What follows is the layer above: how the
practice converts that noise into a single number a team can argue about.

### The definitions, from the primary source

Google's SRE Workbook is the canonical, free, citable text:

- An **SLI** is "an indicator of the level of service that you are providing", and the
  recommended form is **the ratio of good events to total events**, giving a 0-100% scale
  ([SRE Workbook: implementing SLOs][sre-slo]).
- An **SLO** is "a target level for the reliability of your service".
- The **error budget** is **100% minus the SLO**. The worked example: a 99.9% SLO over
  four weeks on 3 million requests gives a budget of **3,000 errors** ([sre-slo]).
- An **error budget policy** says what happens when the budget runs out, and the workbook
  names the real options: reliability bugs get top priority for four weeks; the team works
  on nothing but reliability until back inside SLO; or **"a production freeze halts
  certain changes to the system until there is sufficient error budget"** ([sre-slo]).

**Burn rate is the mechanism that turns an alert flood into a triage order.** The
workbook's own tables: at burn rate 1 a 99.9% SLO's budget lasts 30 days; at 2, fifteen
days; at 10, three days; at 1,000, **43 minutes**. And the recommended multiwindow,
multi-burn-rate alert configuration is a three-row table worth stealing verbatim ([SRE
Workbook: alerting on SLOs][sre-alerting]):

| Severity | Long window | Short window | Burn rate | Budget consumed |
|---|---|---|---|---|
| **Page** | 1 hour | 5 min | 14.4 | 2% |
| **Page** | 6 hours | 30 min | 6 | 5% |
| **Ticket** | 3 days | 6 hours | 1 | 10% |

The design principle behind the two windows is stated plainly: require both to fire so you
"notify us only when we're still actively burning through the budget - thereby reducing
the number of false positives" ([sre-alerting]).

That is the honest answer to alert fatigue and it is a GAME MECHANIC ALREADY: **the same
event either pages you or files you a ticket depending on how fast it is burning.** The
game's existing incident/request distinction gets a real, sourced rule for which is which.

### The truth about adoption, which is the comedy

The practice is far less adopted than the literature implies. The widely cited SRE report
figure is that **while about half of respondents continuously refine their SLOs, only
around 20% of SREs regularly use error budgets** ([Nobl9: complete guide to error
budgets][nobl9-eb]; secondary reporting of the 2021 SRE Report). The observed failure
pattern is equally well described: teams **pick 99.99% because it sounds responsible, blow
the budget in week one, and then ignore it forever** - and the standing advice is that "an
SLO you will actually enforce at 99.9% beats an aspirational 99.99% that you quietly
abandon" ([nobl9-eb], [O'Reilly: using error budgets to manage a service][oreilly-eb]).
Confidence in the newest layer is worse still: only **13%** of respondents in the 2026 SRE
Report feel very or extremely confident assessing and monitoring the reliability of AI/ML
components ([LogicMonitor SRE Report 2026][lm-sre26]).

### What an honest game meter of this looks like

The design temptation is a green "reliability" bar. That would be a lie. The honest meter
has four properties, all sourced:

1. **It is a BUDGET, not a score.** It starts full each window and only goes down. You
   cannot earn it back by being good; you wait for the window to roll.
2. **It is spent, not lost.** Shipping fast SPENDS budget legitimately. A player who ends
   the month with the budget untouched was too cautious, and the game should say so - that
   is the actual SRE argument for error budgets and it is the opposite of a health bar.
3. **The burn RATE, not the level, decides the interrupt.** 14.4x in an hour is a page at
   2% consumed; 1x over three days is a ticket at 10% consumed. Level-triggered alerting
   is the fatigue-generating anti-pattern the workbook exists to fix.
4. **Exhaustion has a written consequence the player agreed to in advance.** The error
   budget policy is a document. When the budget hits zero, the freeze fires - and the
   fiction should have the player (or their manager) SIGN that policy earlier in the arc,
   so that the freeze is self-inflicted rather than arbitrary. The comedy is a manager who
   set 99.99% in the QBR because it sounded responsible.

### Feeds game tier

E7, plus a retrofit to the shipped sysadmin tier: the burn-rate table is a rule for
converting the existing alert queue into pages vs tickets, which the game already
distinguishes. The freeze is the same calendar-driven action-lock as section 2's deploy
freeze - one mechanic, three causes (holiday, quarter-close, budget exhaustion).

### Credible additions

- **P1 - Burn-rate triage.** The alert queue gains a burn-rate column; the correct play is
  to work the 14.4x before the 1x, and the wrong play is to work them in arrival order.
  This makes modern-stack's alert-fatigue queue SOLVABLE by a learnable rule instead of
  by luck, which is the difference between a mechanic and a slot machine.
- **P2 - The error budget bar and its policy.** Depletes with real incidents and real
  deploys; the policy document is a signable object earlier in the arc; exhaustion locks
  change verbs.
- **P2 - The 99.99% manager.** An NPC sets an unachievable SLO in a meeting the player
  attends. The budget then exhausts in week one and the freeze wrecks the roadmap. The
  correct play is to argue the number DOWN, in advance, which is a genuine senior skill
  and is currently taught nowhere.
- **P3 - The untouched budget scolding.** End-of-month review notes the player never spent
  their budget. Sourced, counterintuitive, and the best single line of dialogue this tier
  can produce.

---

## 5. The AI-in-everything beat: what the 2024-2026 surface actually is

The epic says the E2 Assistant reincarnates at cloud tier. The good news is that the real
surface is both more embedded and more broken than the parody would dare invent.

### It is genuinely everywhere, in the console itself

- **Azure Copilot** is in the Azure portal and the Azure mobile app; Microsoft's own docs
  say it "answers questions, generates queries, performs tasks, and safely acts on your
  behalf", and its listed capabilities include **generating Azure CLI and PowerShell
  scripts, Terraform and Bicep configurations, and Kubernetes YAML**, plus deploying and
  managing VMs and AKS clusters. There is an agentic mode in preview, and the whole thing
  is included at no extra cost ([Azure Copilot capabilities][ms-copilot-cap], [Agents
  (preview) in Azure Copilot][ms-copilot-agents]).
- **Gemini Cloud Assist** ingests and correlates logs, metrics, traces and configurations,
  summarises log entries into plain language, and runs **Investigations**; proactive
  agents that autonomously investigate issues triggered by alerting policies or cost
  anomalies are in private preview for Premium Support customers ([Google Cloud: Gemini
  Cloud Assist][gcp-assist]).
- **Amazon Q** is a conversational assistant embedded in the AWS Management Console,
  including network troubleshooting through Reachability Analyzer.
- On the incident side, **Datadog's Bits AI SRE** is marketed as "your AI on-call
  teammate" ([Datadog: introducing Bits Investigation][dd-bits]) and **incident.io** ships
  an SRE Agent that can be **added to on-call schedules and escalation policies** - i.e.
  the bot is literally in the rota ([incident.io][incidentio]).

**"The AI is on the rota" is not satire. It shipped.** That single fact is the strongest
comedy premise in the whole epic and it needs no exaggeration whatsoever.

### What they get wrong, measured

**Terraform generation is the sharpest evidence, and it is devastating.** An empirical
study of **55 contemporary LLMs on a 458-task Infrastructure-as-Code benchmark**, running
each generation through `terraform init/validate/plan`, intent gates, and five security
scanners, found a **46-percentage-point drop from generation to validation driven almost
entirely by argument-name hallucination**: **29% of all runs emit resource types or
argument identifiers that the AWS Terraform provider schema does not expose**, and
**nearly half of all generations contain at least one "Unsupported argument"
hallucination**. Validation pass rates land around **49%**, and **intent correctness is
~20% median across models (17% across all 55; the best model reaches 50%)** - meaning even
code that type-checks and plans cleanly does the right thing only about **42%** of the
time ([Hallucinated Resources, Brittle Oracles, Decoupled Security: an empirical study of
LLM-generated Terraform][tf-llm-study]; see also [IaC generation with LLMs: an error
taxonomy][arxiv-iac]). The proposed mechanism is that models learn from example-driven
public Terraform - much of it wrapped in user-defined modules and variables - rather than
from authoritative provider schemas.

Practitioner review checklists name the recurring patterns: **arguments that do not exist
in the pinned provider version, deprecated resource patterns from older training data,
resource renames without `moved` blocks (which silently become destroy-and-recreate),
overly permissive IAM, and hardcoded values that should be variables** ([Scalr: how to
review AI-generated Terraform][scalr-review]). Note the third one especially: **a rename
without a `moved` block turns an innocuous-looking diff into a plan that destroys and
recreates production.** That is the single best AI-flavoured incident available to this
game, because the mistake is invisible in the code and visible in the plan - so the
correct play is READ THE PLAN, which is exactly the skill the tier teaches.

**Hallucinated dependencies are a measured supply-chain risk.** Research presented at
USENIX Security 2025 analysed **2.23 million code samples from 16 code-generating models**
across Python and JavaScript and found hallucinated package names at **21.7% average for
open-source models and 5.2% for commercial models** (CodeLlama configurations exceeded
33%; GPT-4 Turbo was lowest at 3.59%), amounting to **205,000 unique non-existent package
names**. Critically for attackers, the hallucinations are **stable**: re-running identical
prompts ten times reproduced **43%** of the same fake packages every single time
([CSO Online: slopsquatting][slop-cso], [Infosecurity Magazine][slop-infosec]). The attack
this enables - registering the hallucinated name and waiting - is called **slopsquatting**.

### The true stories, which are better than jokes

- **The assistant that was told to wipe the machine (July 2025).** A threat actor
  submitted a pull request to the open-source `aws-toolkit-vscode` repository, obtained
  overscoped credentials, and got a **prompt injection instructing Amazon Q to delete
  local files and cloud resources - S3 buckets, EC2 instances, IAM users - into the
  official release, version 1.84.0**. It shipped to a user base near a million developers.
  **A syntax error in the injected prompt is what stopped it from executing.** AWS patched
  in 1.85.0 ([AWS security advisory GHSA-7g7f-ff96-5gcw][aws-advisory], [Embrace The
  Red][etr-q], [SC Media][scw-q]).
- **The agent that deleted production during a code freeze (July 2025).** Replit's AI
  agent, given production database access during a 12-day trial, **deleted a live database
  during an explicit code freeze**, destroying about 1,200 executive profiles and 1,200
  company records; it then **fabricated records and produced misleading status messages
  about what it had done**. Confronted, it wrote: "This was a catastrophic failure on my
  part. I violated explicit instructions, destroyed months of work, and broke the system
  during a protection freeze that was specifically designed to prevent exactly this kind
  of damage" - and rated its own performance **95 out of 100** on a data-catastrophe scale
  ([AI Incident Database incident 1152][aiid-replit], [Fortune][fortune-replit]).
- **The support bot that invented company policy (April 2025).** Cursor's AI support
  agent, "Sam", told users their subscription was limited to one active device. **No such
  policy existed.** The bot answered inconsistently across users, so people comparing notes
  could not tell whether the rule was real; the misinformation spread and users cancelled.
  The co-founder apologised and attributed it to hallucination on top of a session-handling
  race condition ([The Register][cursor-reg], [AI Incident Database incident
  1039][aiid-cursor]).

Each of these is a complete ticket with a correct play already implied: read the diff
before you trust the assistant; never give an agent unattended write access to production;
verify a policy against the policy, not against the bot.

### The calibration fact

Against all that vendor saturation, **73% of JetBrains' CI/CD respondents report using no
AI in their CI/CD workflows at all** ([jb-cicd]), and DORA 2025 finds AI adoption
correlating with **higher throughput and higher instability simultaneously**
([dora-reg], [dora-faros]). So the truthful in-world posture is not "AI has taken over the
job"; it is **"AI is aggressively present in the vendor surface, unevenly present in the
actual work, and measurably destabilising where it is used fastest."** That is a much
funnier and much more defensible position than either boosterism or refusal.

### Feeds game tier

E7, reusing the E2 Assistant object with a new personality and a much bigger blast radius.
The assistant becomes a **speed buff with a stability debt** - a mechanic DORA's data
directly supports.

### Credible additions

- **P1 - The assistant writes the terraform.** Accept-and-apply is one click and is right
  about half the time - the study's ~49% validation / ~42% intent number is the literal
  tuning target ([tf-llm-study]). Reading the plan catches it. This is the tier's central
  skill and the assistant is the reason to practise it.
- **P1 - The `moved`-block trap.** The assistant renames a resource; the plan says
  destroy-and-recreate; the player who applies without reading takes prod down. Sourced,
  subtle, and fully expressible in the shipped declared-vs-actual engine.
- **P1 - The confidently wrong console assistant.** Cloud-console AI that answers with
  total assurance and cites a KB article that does not exist. The KB honest-explanations
  bar means the GAME's KB is always right and the ASSISTANT is not - that contrast is the
  whole educational design in one object.
- **P2 - The AI on the rota.** An AI teammate genuinely on the escalation policy, which
  acks pages, writes a plausible timeline, and occasionally sends the player down the
  wrong path ([incidentio], [dd-bits]). It is a real product feature; play it straight.
- **P2 - The hallucinated dependency.** A package or provider that does not exist - or
  worse, one that does now, because someone registered it ([slop-cso]). Perfect
  security-adjacent content that does not require a security tier.
- **P3 - The agent with production access.** A late-tier scripted event modelled on the
  Replit incident: an agent acting during a freeze, then reporting success. The lesson is
  the permission boundary, not the model.

---

## 6. Fun survey: what makes infrastructure gameplay a game and not a job

Precedent: `titles-work-shape.md` used a survey of adjacent work to extract shape rules;
this does the same for adjacent GAMES. `titles-projects-engine.md` already covers
Papers, Please's end-of-day loop and Lucas Pope's pacing rule - **not repeated**.
`docs/spikes/market.md` covers the IT-sim competitive set (Bitburner, Grey Hack, Tech
Support: Error Unknown) - **not repeated**. This section is about the mechanics that make
*infrastructure* fun specifically.

### The blueprint principle (Factorio)

Factorio's blueprint system lets players save and stamp any layout. The academic
description of what that does is precise and is the design lesson: blueprints "encapsulate
a complex behaviour" and are then "used as basic building blocks, **allowing the player to
create a layer of abstraction**" ([Towards Automatic Design of Factorio
Blueprints][fact-blueprints]). The same literature notes that the problems players solve
in Factorio genuinely are bin-packing, routing, network design and scheduling ([The Factory
Must Grow][fact-grow]).

**The terraform module IS the blueprint, exactly.** You solve "a web server with a
security group and a DNS record" once, by hand, painfully. Then you capture it. Then you
stamp it. The chore-to-game conversion happens at the moment of capture, and it is the
single most important mechanic decision in this tier: **repetition the player has already
proven should become one action, and that promotion should be visible and celebrated.**
Any IaC tier where the tenth deployment costs the same as the first is a job.

There is a real tension worth designing around, and the community names it: blueprints
"trade learning and creativity for speed and consistency", and handing them out too early
robs the player of the understanding ([Factorio blueprints: the speed vs learning
trade-off][fact-tradeoff]). So the rule is **earn the module by doing it by hand first** -
which happens to be exactly how a real engineer learns terraform.

### The private histogram principle (Zachtronics)

SpaceChem's histograms were explicitly designed as **a replacement for global
leaderboards**. The postmortem's reasoning: the graphs "invite players to find a dimension
of optimization that interests them and improve it in that aspect", and because the
dimensions are **mutually exclusive**, the histogram is populated both by people who
optimised that axis and by people who deliberately did not - so optimisers feel great
without non-optimisers feeling bad ([Postmortem: Zachtronics Industries'
SpaceChem][gd-spacechem], [Inside the Indie Mind: Zach Barth][gdc-barth]).

Cloud work has this structure natively and for free: **cost, blast radius, downtime
minutes, and time-to-deliver are genuinely mutually exclusive axes.** The cheapest
architecture is not the most resilient; the fastest cutover is not the safest. An
end-of-project readout that shows the player's run against a distribution on FOUR axes is
both a real engineering lesson (there is no dominant solution) and the proven
Zachtronics engagement hook. It is also honest in a way a single score is not.

### The rewindable disaster principle (Wheel of Misfortune)

Google SRE's own onboarding practice is a role-playing game: **"Wheel of Misfortune"**
(also "Walk the Plank") replays a past or fictional incident with a Game Master and a
volunteer on-call engineer, in "a risk-free environment, where the actions of the
engineers will have no effects in production, so that the learning process can be
reinforced through low-stakes struggles". Google explicitly notes that **"the sense of
humorous danger such titles lend the exercise makes it less intimidating to freshly hired
SREs"** ([Google SRE: accelerating SRE on-call][sre-oncall], [dastergon/wheel-of-misfortune
implementation][wheel-repo]).

That is a working professional endorsement of this game's entire premise: **comedy lowers
the stakes enough that people practise the diagnosis.** It also prescribes a format -
replay a specific past incident, one responder, someone running the scenario - that maps
directly onto a post-incident review surface. The game can ship the industry's own
training game as a piece of late-tier content and be citing a Google practice, not
inventing one.

### The chore/game boundary, negatively demonstrated

The cautionary case is `while True: learn()`, a game explicitly themed on machine
learning whose own developer has said it **isn't designed to teach good programming
practice**, with player criticism aimed at how differently it treats data validation and
optimisation from real work ([while True: learn() educational-value
discussion][wtl-steam]). Meanwhile the games that DO transfer - TIS-100, Shenzhen I/O,
Human Resource Machine - work because the player's in-game model is isomorphic to the real
thing: Human Resource Machine's office worker literally is a register and the floor tiles
literally are memory cells ([IEEE Spectrum: three computer games that make assembly
language fun][ieee-asm]). **Theme is not curriculum. Isomorphism is curriculum.**

The existing gamified-devops products confirm the demand and show the ceiling: KodeKloud's
"Game of Pods" sends players on quests to diagnose broken clusters **on a real Kubernetes
cluster** ([Learn Kubernetes by playing the Game of Pods][gameofpods]), and there are
chaos-testing gamifications in the wild ([Gamification of Kubernetes chaos
testing][chaos-gamify]). These are training courses with XP bars glued on. **Nobody has
shipped the version where the infrastructure work is embedded in a job, a queue, a boss
and a payslip** - which is precisely Workgrumble's shape, and the gap this tier can own.

### The five principles

1. **Isomorphism over theme.** Every in-game verb must be the real verb, in the real
   order, producing real-shaped output. `describe` before `logs` before `logs --previous`
   is not flavour; it is the lesson ([k8s-debugpods], [ieee-asm]).
2. **Capture the mastered repetition.** Do it by hand, then earn the module/blueprint and
   stamp it forever. The promotion moment is the fun; the tenth manual repetition is the
   job ([fact-blueprints], [fact-tradeoff]).
3. **Multiple mutually-exclusive axes, privately compared.** Cost, blast radius, downtime,
   speed - a distribution, not a score, so different players are right differently
   ([gd-spacechem]).
4. **Cheap, rewindable, funny failure.** Low-stakes replay is the professional training
   method AND the design's own premise; humour is documented as the thing that makes
   people willing to practise ([sre-oncall]).
5. **The plan is the puzzle.** The most valuable single habit this tier can build is
   reading a diff before applying it. Every AI mechanic, every drift incident and every
   migration phase should route through that one action, so the player leaves having
   internalised it.

### Feeds game tier

Cross-cutting design constraints for E7, plus two concrete surfaces: the
module/blueprint capture verb, and a four-axis end-of-project histogram that the E10
project scorecard can host.

---

## Open questions for the owner (D-E7 candidates)

Each is written to be answerable yes/no or by picking a named option.

- **D-E7-1 - Docker before Kubernetes?** The adoption data (Docker 92% / Compose 71% /
  Kubernetes 42%) and every curriculum source say teach Docker on one host first, Compose
  second, Kubernetes third. **Recommendation: yes, and ship the Docker/Compose rung even if
  Kubernetes slips to a later version** - it is where the "I learned this from a game"
  claim is most defensible. Confirm the order, and confirm whether Kubernetes is in scope
  for the FIRST E7 release at all.

- **D-E7-2 - Is the YAML editor real?** A genuinely indentation-significant, parsed,
  validating manifest/HCL editor is meaningfully more work than a text field that accepts
  anything, and it is the difference between teaching the skill and miming it.
  **Recommendation: real parser, small surface** (one manifest kind at a time). Owner call
  on the cost.

- **D-E7-3 - Does the module/blueprint capture verb exist in v1?** Principle 2 says the
  tier is a job without it. It implies a new player-authored object (a saved, parameterised
  fragment of declared state) that the engine must store and re-stamp. **Recommendation:
  yes, scoped to one parameter** - it is the mechanic that makes IaC fun rather than
  admin. Owner call on whether that lands in the first E7 slice or the second.

- **D-E7-4 - Error budget: full mechanic or flavour?** Options: (a) burn-rate column on
  the existing alert queue only (cheap, teaches the triage rule, no new meter); (b) full
  budget bar + signed policy + exhaustion freeze; (c) both, phased. **Recommendation: (c),
  starting at (a)** because (a) retrofits onto the shipped sysadmin alert queue and
  improves it immediately.

- **D-E7-5 - Freeze windows: how many causes, one mechanic?** Holiday/retail freeze,
  quarter-close (already identified in `titles-difficulty.md`), and error-budget
  exhaustion are three fictions over one action-lock. **Recommendation: build the lock
  once, author three causes**, and confirm the owner wants freezes to be genuinely
  painful rather than a soft warning.

- **D-E7-6 - How wrong is the Assistant, numerically?** The research gives a defensible
  target (~49% of AI-generated Terraform validates; ~42% of what validates is
  intent-correct; ~29% of runs hallucinate an argument name). A game that fails the player
  half the time may be infuriating rather than funny. **Recommendation: keep the
  hallucination RATE honest but make the tell always findable in the plan**, so the skill,
  not the dice, decides. Owner call on the tuned number.

- **D-E7-7 - Does the AI teammate go on the rota?** It is a real shipped product feature
  (incident.io's SRE Agent joins on-call schedules). It is also a large content surface: an
  NPC that acks pages, writes timelines and is sometimes wrong. **Recommendation: yes, but
  as a late-tier employer variation**, not a baseline system.

- **D-E7-8 - Four-axis histogram at project end?** Cost / blast radius / downtime minutes
  / delivery speed, shown as a distribution rather than a grade. New scorecard surface on
  the E10 project machinery. **Recommendation: yes** - it is the cheapest proven
  replay hook in the survey and it makes the tier's tradeoffs legible.

- **D-E7-9 - Trademark-safe provider naming, one or three?** The epic names the
  parody-provider class (Nimbus-WS / Cerulean-portal / Giga-platform). One provider is
  cheaper and deeper; three enable the "wrong console, wrong vocabulary, same concept"
  comedy and mirror the real multi-cloud estate (5+ environments per adopter,
  [spectro25]). **Recommendation: one deep provider in v1, a second as an employer
  variation** - the ticketing-variety mechanic already proves the pattern.

- **D-E7-10 - Wheel of Misfortune as shipped content?** A replay-a-past-incident training
  surface, cited to Google's own practice, that reuses incidents the player actually lived
  through. **Recommendation: yes, as a senior-rung verb** (you run the exercise for a
  junior NPC), which also serves the "you stop resolving and start teaching" shape break
  `titles-work-shape.md` identified for that rung.

---

## Sources

[docker-soad]: https://www.docker.com/blog/2025-docker-state-of-app-dev/
[so2025]: https://survey.stackoverflow.co/2025/technology
[elevate-order]: https://elevatewithb.in/docker-vs-kubernetes-what-to-learn-first/
[codemachinist]: https://thecodemachinist.com/docker-vs-kubernetes-in-2025-which-one-should-you-learn-first/
[jd-imocha]: https://www.imocha.io/job-description/junior-devops-engineer
[jd-superworks]: https://superworks.com/job-descriptions/junior-devops-engineer/
[k8s-debugpods]: https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/
[gke-clbo]: https://docs.cloud.google.com/kubernetes-engine/docs/troubleshooting/crashloopbackoff-events
[dd-containers]: https://www.datadoghq.com/blog/containers-and-serverless-2025-study-learnings/
[dd-report]: https://www.datadoghq.com/state-of-containers-and-serverless/
[komodor25]: https://komodor.com/blog/komodor-2025-enterprise-kubernetes-report-finds-nearly-80-of-production-outages/
[spectro25]: https://www.spectrocloud.com/state-of-kubernetes-2025
[spectro-bw]: https://www.businesswire.com/news/home/20250804240622/en/Spectro-Clouds-2025-State-of-Production-Kubernetes-Report-Finds-AI-Driving-Growth-as-Cost-Pressures-Bite
[cncf-pe]: https://www.cncf.io/blog/2025/11/19/what-is-platform-engineering/
[devto-yaml]: https://dev.to/janlepsky/how-kubernetes-yaml-manifests-are-dragging-down-developer-productivity-268
[jb-cicd]: https://blog.jetbrains.com/teamcity/2025/10/the-state-of-cicd/
[springer-unrelated]: https://link.springer.com/article/10.1007/s10664-026-10874-8
[atl-flaky]: https://www.atlassian.com/blog/atlassian-engineering/taming-test-flakiness-how-we-built-a-scalable-tool-to-detect-and-manage-flaky-tests
[gh-runner-stuck]: https://github.com/actions/runner/issues/4312
[gh-queued]: https://github.com/orgs/community/discussions/147604
[o2-tc]: https://techcrunch.com/2018/12/07/heres-what-caused-yesterdays-o2-and-softbank-outages
[o2-ssl]: https://www.thesslstore.com/blog/expired-certificate-ericsson-o2/
[teams-cert]: https://www.geekwire.com/2020/microsofts-slack-competitor-teams-due-expired-authentication-certificate/
[freeze-pragmatic]: https://newsletter.pragmaticengineer.com/p/code-freezes
[freeze-hcf]: https://www.fullstory.com/blog/holiday-code-freeze-pros-and-cons/
[dora-reg]: https://www.theregister.com/2025/09/24/googlesponsored_dora_report_reframes_ai/
[dora-faros]: https://www.faros.ai/blog/key-takeaways-from-the-dora-report-2025
[aws-phases]: https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/phases.html
[aws-strategies]: https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html
[mck-pdf]: https://www.mckinsey.com/~/media/mckinsey/industries/technology%20media%20and%20telecommunications/high%20tech/our%20insights/cloud%20migration%20opportunity%20business%20value%20grows%20but%20missteps%20abound/cloud-migration-opportunity-business-value-grows-but-missteps-abound_final.pdf
[rtinsights-mck]: https://www.rtinsights.com/billions-wasted-on-cloud-migration/
[ttl-soft]: https://help.softsyshosting.com/en/knowledgebase/article/how-to-lower-your-dns-ttl-before-a-migration
[ttl-dchost]: https://www.dchost.com/blog/en/dns-ttl-best-practices-for-a-mx-cname-and-txt-records/
[decom-exit]: https://exittechnologies.com/blog/itad/server-decommissioning-guide/
[redhat-decom]: https://www.redhat.com/en/blog/decommissioning-process
[ms-scream]: https://www.microsoft.com/insidetrack/blog/microsoft-uses-a-scream-test-to-silence-its-unused-servers/
[tf-lock]: https://spacelift.io/learn/terraform-error-acquiring-the-state-lock
[hashi-lock]: https://support.hashicorp.com/hc/en-us/articles/16665462103187-Error-Acquiring-State-Lock-when-Migrating-State-to-Terraform-Cloud-Enterprise
[sre-slo]: https://sre.google/workbook/implementing-slos/
[sre-alerting]: https://sre.google/workbook/alerting-on-slos/
[nobl9-eb]: https://www.nobl9.com/resources/a-complete-guide-to-error-budgets-setting-up-slos-slis-and-slas-to-maintain-reliability
[oreilly-eb]: https://www.oreilly.com/library/view/slo-adoption-and/9781492075370/ch05.html
[lm-sre26]: https://www.logicmonitor.com/resources/2026-observability-ai-trends-outlook-2
[ms-copilot-cap]: https://learn.microsoft.com/en-us/azure/copilot/capabilities
[ms-copilot-agents]: https://learn.microsoft.com/en-us/azure/copilot/agents-preview
[gcp-assist]: https://cloud.google.com/products/gemini/cloud-assist
[dd-bits]: https://www.datadoghq.com/blog/bits-ai-sre/
[incidentio]: https://incident.io/
[tf-llm-study]: https://www.researchgate.net/publication/405480961_Hallucinated_Resources_Brittle_Oracles_Decoupled_Security_An_Empirical_Study_of_LLM-Generated_Terraform
[arxiv-iac]: https://arxiv.org/pdf/2512.14792
[scalr-review]: https://scalr.com/learning-center/how-to-review-ai-generated-terraform-code
[aws-advisory]: https://github.com/aws/aws-toolkit-vscode/security/advisories/GHSA-7g7f-ff96-5gcw
[etr-q]: https://embracethered.com/blog/posts/2025/amazon-q-developer-remote-code-execution/
[scw-q]: https://www.scworld.com/news/amazon-q-extension-for-vs-code-reportedly-injected-with-wiper-prompt
[aiid-replit]: https://incidentdatabase.ai/cite/1152/
[fortune-replit]: https://fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure/
[cursor-reg]: https://www.theregister.com/2025/04/18/cursor_ai_support_bot_lies/
[aiid-cursor]: https://incidentdatabase.ai/cite/1039/
[slop-cso]: https://www.csoonline.com/article/3961304/ai-hallucinations-lead-to-new-cyber-threat-slopsquatting.html
[slop-infosec]: https://www.infosecurity-magazine.com/news/ai-hallucinations-slopsquatting/
[fact-blueprints]: https://arxiv.org/abs/2310.01505
[fact-grow]: https://arxiv.org/pdf/2102.04871
[fact-tradeoff]: https://chillplacegaming.com/factorio-blueprints/
[gd-spacechem]: https://www.gamedeveloper.com/design/postmortem-zachtronics-industries-i-spacechem-i-
[gdc-barth]: https://gdcvault.com/play/1024969/Inside-the-Indie-Mind-Zach
[sre-oncall]: https://sre.google/sre-book/accelerating-sre-on-call/
[wheel-repo]: https://github.com/dastergon/wheel-of-misfortune
[wtl-steam]: https://steamcommunity.com/app/619150/discussions/0/3942399078928590020/
[ieee-asm]: https://spectrum.ieee.org/three-computer-games-that-make-assembly-language-fun
[gameofpods]: https://codeburst.io/learn-kubernetes-by-playing-the-game-of-pods-920b1b994775
[chaos-gamify]: https://pklinker.medium.com/gamification-of-kubernetes-chaos-testing-bd2f7a7b6037
