# THREAD A - The work-shape of each career title

Research for WORKGRUMBLE. Question: if difficulty scaling = career titles, what actually CHANGES in the work at each rung, so the per-title work-mix table is true rather than a rate knob?

Date: 2026-08-08. Method: web research (job descriptions, ITIL/ITSM practice docs, benchmark reports, MSP operations blogs, SRE book, career-ladder literature).

## Evidence conventions used throughout

- **[FACT]** - a number or definition traceable to a named source. URL given in the claim cluster.
- **[FOLKLORE]** - practitioner consensus from blogs, vendor writeups, community-sourced articles. Directionally reliable, numerically not.
- **[DESIGN]** - my synthesis / proposal for the game. Not sourced, do not present in-game as a "real number".

**Method caveat that matters:** reddit.com is blocked to this tool (`r/sysadmin`, `r/msp` cannot be fetched or searched). All FOLKLORE below is therefore from practitioner blogs, MSP-operations vendors, and support-industry writers rather than raw forum threads. That is a weaker grade of folklore - it is the industry talking about itself, sometimes with a product to sell. Flagged where it matters. If forum-grade material is wanted, it needs a human paste or a different fetch route.

---

## 0. The spine: what a "rung" actually is

Before the per-title table, the single most useful framing found. The IT industry already has a formal answer to "what changes as you go up", and it is NOT speed or ticket difficulty.

**[FACT]** SFIA (Skills Framework for the Information Age) defines 7 generic **Levels of Responsibility**, and the thing that changes level to level is a bundle of generic attributes: **autonomy, influence, complexity, business skills, knowledge**. The level names are verbs:

| SFIA | Name | Gist |
|---|---|---|
| 1 | Follow | Works under close direction, receives specific instructions, work is closely reviewed |
| 2 | Assist | Supports others in completing tasks |
| 3 | Apply | Varied, sometimes complex non-routine tasks using standard methods; general direction; own discretion within deadlines |
| 4 | Enable | Enables others to accomplish objectives |
| 5 | Ensure, advise | Works under broad direction; ensures quality; expert guidance |
| 6 | Initiate, influence | Drives change, influences strategy |
| 7 | Set strategy, inspire, mobilise | Organisational direction |

Autonomy = "level of independence, discretion and accountability for results". Influence = "reach and impact of your decisions and actions, both within and outside the organisation". Complexity = "range and intricacy of tasks".
Sources: https://sfia-online.org/en/about-sfia/how-sfia-works , https://sfia-online.org/en/sfia-9/responsibilities/level-1 , https://sfia-online.org/en/sfia-9/responsibilities/level-3 , https://sfia-online.org/en/sfia-9/responsibilities/level-5

**Why this is the load-bearing finding for the game:** SFIA says the rung ladder is a **permissions and review ladder**, not a difficulty ladder. Level 1 is "your work is checked". Level 3 is "you choose the method". Level 5 is "you approve other people's work". That maps directly onto game mechanics you already have (change control, break-glass, scope walls) and it is a real framework a player can name afterwards. **[DESIGN]** Recommend making the per-title gate literally "what you may do without asking" + "whose work you must now check", not "tickets are harder now".

---

## 1. Service Desk L1 - JUNIOR

### Work mix

**[FACT]** Ticket categories at the modern help desk, from the Fixify 2026 IT Help Desk Benchmark Report (aggregated real ticket data):
- Software & Applications: **38.2%** of total tickets
- Onboarding & Offboarding: **16.6%**
- IAM (identity/access): **15.9%**
- App assignment alone: **more than 1 in 4 tickets**
- 483 distinct applications appear in the ticket data
- Productivity-blocking tickets: **22%** of all tickets
Source: https://www.fixify.com/it-help-desk-benchmark-report-2026

**[FACT]** Throughput: "the average Tier 1 technician handles between 30 and 50 tickets per day".
Source: https://www.supportsave.com/blog/tier-1-vs-tier-2-it-helpdesk-support/

**[FACT]** Timing shape (real distribution, excellent for a game's arrival curve):
- Peak hour **11am = 11% of daily volume**; the 10am-1pm window = **31% of daily volume**
- **76-80%** of tickets arrive 9am-6pm weekdays
- Busiest day **Tuesday = 23.5%** of weekly volume; **Monday+Tuesday = 45%** of the week
- July peaks **+29%** above average month; Feb-Mar troughs **-20 to -24%**
Source: https://www.fixify.com/it-help-desk-benchmark-report-2026

**[FACT]** Response expectations at L1 are minutes, not hours: median first response **5 min**, p75 **8 min**, p90 **15 min**.
Source: https://www.fixify.com/it-help-desk-benchmark-report-2026

**[FACT]** Resolution/escalation split: MetricNet benchmarking puts service desk First Contact Resolution at roughly **70-75% average**, **85%+** for high performers. Industry-average escalation rate L1 -> L2 is quoted at **22%**; HDI research says top performers hold tier-1 escalation **below 15%**; some sources argue below 10% is the aspiration.
Sources: https://www.metricnet.com/desktop-support-metrics-part-5/ , https://count.co/metric/escalation-rate , https://blog.invgate.com/escalation-rate

Suggested work-mix for the junior rung **[DESIGN, anchored on the above]**:
- ~55% password/account/access + app assignment (the IAM + app-assignment block, ~42% measured, plus the informal share of "software & apps" that is really access)
- ~20% hardware/peripheral/connectivity
- ~15% onboarding/offboarding checklist steps (handed down, not owned)
- ~10% "how do I" / user education
- 0% change, 0% problem, 0% project

### Unique verbs and surfaces

Things ONLY this rung does, or does as its whole job:
- **Log, categorise, prioritise, escalate.** The four canonical L1 verbs.
- Works from **scripts, runbooks and the knowledge base**, not from judgment. "Tier 1 agents rely on standardized workflows, scripts, and knowledge bases to deliver consistent service." (https://www.supportsave.com/blog/tier-1-vs-tier-2-it-helpdesk-support/)
- Owns the **phone/chat/portal intake** surface. Average Speed of Answer is a metric that exists only here.
- Cannot make **system-level changes**. Escalation triggers from the tier docs: unresolved within SLA; **requires system-level access or configuration change**; recurring pattern across multiple users; involves network/server/cloud components. (https://blog.invgate.com/tier-2-help-desk , https://www.supportsave.com/blog/tier-1-vs-tier-2-it-helpdesk-support/)

### Pains / comedy material

- **[FACT]** Cost asymmetry is the real joke and it is a real number: fully loaded cost per ticket in North America is **$22 service desk / $69 desktop support / $104 level 3**, and a ticket logged at L1 then escalated costs the SUM, not the max. So every escalation is literally money on fire. (https://www.thinkhdi.com/~/media/HDICorp/Files/Library-Archive/Insider%20Articles/Cost%20per%20Ticket.pdf , referenced via https://www.thinkhdi.com/~/media/HDICorp/Files/Library-Archive/Insider%20Articles/First%20Level%20Resolution.pdf)
- **[FACT]** The single app most responsible for tickets is the identity provider: **Okta = 12.8% of app-tagged tickets**, ahead of Salesforce 6.7%, Slack 5.1%, Microsoft 365 4.5%. The SSO that was supposed to end password tickets is the top source of tickets. (https://www.fixify.com/it-help-desk-benchmark-report-2026)
- **[FACT]** Sentiment: **8.7%** of tickets arrive with negative sentiment, rising to **25% for hardware** and 22% for connectivity. Resolution in the **15min-4hr** band converts 93-97% of frustrated users. Under 1 hour and "more than a third become actively positive". A real, gameable "mood meter".
- **[FACT]** Onboarding is the sludge: median resolution for employee onboarding is **76.3 hours** vs 0.8h for group management. The new-hire ticket that sits for three days is documented, not a stereotype.
- **[FOLKLORE]** The recognisable L1 pain set: password resets as identity-destroying repetition, being measured on call handle time while being told to delight the customer, and the knowledge base that is either empty or wrong.

### What the game should gate on this title

**[DESIGN]**
1. No `sudo`, no server access, no AD write beyond password reset. Attempting them produces a permission-denied that is *correct* and instructive.
2. Escalation is a **button with a cost**: escalating costs the player something (score/budget/"the L2 sighs") because the real cost is additive ($22 + $69).
3. KB-driven resolution: the player can only close a ticket type they have a KB article for. Discovering/being given articles IS the progression.
4. FCR% and escalation rate as the visible scoreboard, target FCR 70-75%, escalation under ~20%.
5. Arrival curve: Tuesday 11am is hell. Ship the real distribution.

---

## 2. Service Desk L1 - SENIOR (the interesting one)

The brief asked specifically: what does an L1 SENIOR uniquely do that a junior does not? This is the best-evidenced rung difference found, because real job descriptions spell it out.

### [FACT] Duties that appear in senior-service-desk-analyst JDs and NOT in the standard analyst JD

From aggregated JD text (VelvetJobs "Senior Service Desk Analyst"), https://www.velvetjobs.com/job-descriptions/senior-service-desk-analyst :

1. **Mentor junior analysts and assist in training of new analysts** - technical guidance to first-line staff.
2. **Ownership across the escalation boundary**: "retains ownership of request and incidents until resolution, communicating status to customers and coordinating resolution with relevant support teams". The junior hands off; the senior stays attached after the handoff.
3. **Acts as backup to the Service Desk Manager**: "insuring ticket queue is properly managed, staff is appropriately distributed amongst tasks".
4. **Quality checks on other people's tickets**: "perform quality checks to ensure that all incidents have been correctly categorised, prioritised and escalated".
5. **Knowledge management ownership**: manages content in the KM system, authors Knowledge Articles.
6. **Escalation point + major incident response**: "respond to escalated, complex and high impact incidents", particularly during major service outages.
7. **After-hours request handling** (per Zippia/Alloy comparison writeups).

**[FACT]** Time-in-grade: progression L1 -> L2 typically cited as **6-18 months** of consistent performance plus demonstrated familiarity with escalation procedures.
Sources: https://www.zippia.com/senior-help-desk-analyst-jobs/senior-help-desk-analyst-vs-service-desk-analyst-differences/ , https://www.alloysoftware.com/blog/what-does-a-service-desk-analyst-do/

**[FACT]** Shift-lead / team-leader duties in the adjacent real JD (public sector service desk team leader): incident quality audits and **call monitoring**, manage staffing levels for peaks and troughs, ensure calls answered/resolved/passed within SLA, monitor QA systems.
Source: https://spotterful.com/en/blog/job-description-template/support-team-lead-responsibilities-and-required-skills (and Swindon BC role profiles at jobs.swindon.gov.uk, PDFs did not render for extraction)

### Work mix

**[DESIGN, anchored]** The senior L1 is the first rung where **your own queue is no longer the whole job**:
- ~45% own tickets (but skewed to the hard/angry/VIP end)
- ~20% other people's tickets (QA audits, re-categorising, un-sticking)
- ~15% mentoring / shoulder-surfing / answering "quick question"
- ~10% knowledge article authoring
- ~10% queue management + major-incident comms when the manager is out

### Unique verbs and surfaces

- **Re-prioritise / re-categorise someone else's ticket** (a write action on another agent's object - a genuinely new UI surface).
- **Approve or reject an escalation** before it leaves the tier.
- **Author a KB article** - and then other agents' resolution speed changes because of it. This is the single best "your work compounds" mechanic available at this rung.
- **Call/ticket quality scoring** - grade a junior's ticket against categorisation/priority correctness.
- **Take the major-incident comms role** - status updates to customers while someone else fixes.
- **Adjust the rota / redistribute the queue** when volume spikes.

### Pains / comedy material

- **[FOLKLORE, strong]** The defining senior-L1 pain: **you are still measured on your own ticket count while half your day is spent unblocking other people.** MSP-operations writeups state it plainly: "when help desks are understaffed, technicians carry the pressure; when tickets pile up, senior people become the safety net; and when clients complain, experienced engineers get dragged into lower-level work." (https://www.ltvplus.com/msp/msp-technician-burnout/)
- **[FACT-adjacent, SRE canon]** The mechanism behind that pain has a real citation: a 20-minute interrupt does not cost 20 minutes, it costs "a couple hours of truly productive work", which is why Google SRE's rule is that interrupt duty and project work must be **polarized** - one person is on interrupts, and their projects are written off for the period. "A person should never be expected to be on-call and also make progress on projects." (https://sre.google/sre-book/dealing-with-interrupts/)
- **[FOLKLORE]** Quality auditing = being the person who tells colleagues their priority field is wrong. Universally beloved.
- The KB paradox: the senior writes the article that makes their unique knowledge no longer unique.

### What the game should gate on this title

**[DESIGN]** This rung is where the SHAPE break should be most visible, because it is the first time the player's actions are *about other agents*:
1. **Introduce a second queue: other people's tickets.** The player's own SLA clocks keep running while they work it. This is the mechanical statement of "seniors drown in escalations".
2. **Interrupt tax, explicit and honest.** Every time the player is pulled into a junior's ticket, apply a focus/context-switch penalty to their own in-progress work, sized well above the wall-clock time taken. Justified by the SRE citation - and label it in the postmortem screen so the player learns *why*.
3. **KB authoring as a permanent buff**: writing an article raises junior NPC FCR on that category for the rest of the run. Compounding, visible, true.
4. **Escalation approval rights**: junior escalations now land in the player's inbox first. Rejecting one correctly is a win; rejecting one wrongly breaches an SLA and someone else takes the blame - which is the actual moral hazard of the rung.
5. **Quality-audit minigame**: grade a categorisation/priority. Use the real priority matrix already in the game, but from the marking side.

---

## 3. Service Desk L2 / Desktop Support

**[FACT]** Definitional boundary: L2 is "where requests get more technical, staffed by specialists or experienced technicians, handling tickets that require in-depth troubleshooting, **system-level access**, or familiarity with departmental workflows"; performs root cause analysis, works with backend systems, assists L1.
Sources: https://blog.invgate.com/tier-2-help-desk , https://redriver.com/managed-services/tier-1-vs-tier-2-vs-tier-3-help-desk , https://itbd.net/blog/helpdesk/it-support-tiers-tier1-vs-tier2-vs-tier3/

**[FACT]** Desktop support First Contact/First Visit Resolution averages ~**84%** worldwide, ranging ~70% to ~97%. (https://www.metricnet.com/desktop-support-metrics-part-5/)

**[FACT]** Cost per ticket **$69** vs $22 at L1 - i.e. an L2 hour is priced at ~3x an L1 hour. (HDI/MetricNet, links above)

### The model fork worth knowing about

**[FACT]** Tiered support is not the only model, and the alternative is a real, named, adopted practice: **Intelligent Swarming** - one specialist owns the case end to end and pulls experts in around it rather than handing it up a ladder. Cited benefit: eliminates escalation queue-sitting and the context loss that occurs at each handoff; Coveo reported a **37% improvement in resolution times** on shifting to swarming, plus a further 27% from AI expert-matching. Tiered remains better for high-volume repetitive intake.
Sources: https://www.thinkhdi.com/library/supportworld/2017/evaluating-technical-support-models-tiered-support-vs-swarming-part-2 , https://freshservice.com/itsm/three-tier-support-vs-swarming-blog/ , https://www.givainc.com/blog/what-is-swarming-it-customer-support-teams/ , https://blogs.helixops.ai/swarming-support-tiered-support-differences/

**[DESIGN]** This is a free, true, and funny late-game org event: management announces "we're going swarming", the tier walls come down, and the player's escalation button disappears - replaced by "pull in a colleague, whose own clock now also runs". It teaches a genuine ITSM debate and it reshapes the board rather than retuning it.

### What the game should gate on this title

**[DESIGN]**
1. Grant **system-level access** as the literal unlock (registry, AD objects, GPO, local admin, imaging). The junior's permission-denied wall becomes passable.
2. Introduce **root-cause language** - the first "this is the 4th ticket like this" pattern-detection surface, which is the on-ramp to Problem management at the next rung.
3. Tickets arrive **pre-chewed and wrong**: an L2 ticket should start with a junior's incorrect diagnosis attached, and unpicking it is part of the work.

---

## 4. Systems Engineer / Sysadmin (the tier the game just shipped)

### 4.1 The practice categories are real and named

**[FACT]** ITIL 4 has **17 service-management practices**. The four that generate work items are:
- **Incident management** - restore normal service ASAP, minimise business impact.
- **Service request management** - user asks for something that is NOT a disruption (password reset, new laptop, access).
- **Problem management** - identify and eliminate root causes; produces known errors and workarounds.
- **Change enablement** (the ITIL 4 name; "change management" in ITIL v3) - plan, approve, execute, review changes.
The clean test practitioners actually use: "if it's a break-fix issue, it's an Incident. If you're asking for something to be provided, it's a Service Request."
Sources: https://itsm.tools/34-itil-4-management-practices/ , https://www.beyond20.com/resources/blog/an-overview-of-the-incident-management-practice-in-itil-4/ , https://pdcaconsulting.com/itil-ticket-types-incident-problem-change-service-request/ , https://blogs.helixops.ai/ticket-vs-incident-vs-problem-vs-service-request/

**[FACT]** Change types, three of them, with different approval paths:
- **Standard** - pre-approved, low-risk, repeatable, documented in a runbook or automated. No CAB.
- **Normal** - requires risk assessment and approval, scheduled.
- **Emergency** - time-critical, expedited via an **eCAB**, still requires a post-implementation review.
Sources: https://itsm.tools/change-enablement/ , https://www.manageengine.com/products/service-desk/it-change-management/it-change-types.html , https://trustedinstitute.com/concept/itil-4-foundation/change-enablement/standard-normal-emergency-changes/

### 4.2 Realistic proportions

Honest finding: **there is no clean public industry benchmark for incident:request:change:problem ratios.** Reports either don't publish it or paywall it. What exists:

- **[FACT]** A published monthly operational report from one university IT service: **803 incidents / 691 requests = 1,494 tickets**, i.e. **54% incident / 46% request**. Same source notes request volume is growing while incident volume stays flat.
  Source: https://it.wp.worc.ac.uk/wp-content/uploads/2025/04/IT-Service-Summary-Report-September-2024.pdf (and https://warwick.ac.uk/services/its/servicessupport/itil/latestmetrics for a second public ITIL metrics feed)
- **[FACT]** Problem management barely exists in the wild: only **12% of enterprises** describe their ITSM as fully mature and proactive; **>40%** are partially structured or ad hoc; nearly **40%** operate without consistent processes; **62-63%** report low maturity in automation and self-service. "ITIL maturity is - candidly - rather low, globally."
  Sources: https://itsm.tools/itsm-maturity/ , https://blog.invgate.com/itsm-statistics , https://www.teamdynamix.com/blog/how-to-advance-your-it-service-management-maturity/

**[DESIGN, honest label]** Proposed sysadmin-tier work mix. Roughly half/half incident:request is the only sourced anchor; the change and problem shares are a designed extrapolation and should be presented in-game as flavour, not as "the industry number":
- 40% incidents (break-fix, alerts)
- 35% service requests (provisioning, access, "can I get a VM")
- 20% changes (mostly standard, some normal, occasional emergency)
- 5% problem records - **and it should be visibly *optional*, the thing everyone skips.** Making problem management the neglected practice is both funnier and truer than making it routine.

### 4.3 On-call reality - the best-sourced part of this whole thread

**[FACT]** Google SRE's published rules, which are the industry's reference point even where nobody follows them:
- At least **50% of SRE time on engineering**; **no more than 25% on-call**; up to another 25% on other operational non-project work.
- Sustainable 24/7 primary+secondary coverage needs **8 engineers minimum single-site** (each on-call ~1 week/month) or **6 per site multi-site**.
- **Maximum 2 incidents per 12-hour shift**, because "dealing with the tasks involved in an on-call incident... takes 6 hours" on average. The target median is effectively **0 incidents per day**.
- Response targets: **5 minutes** for user-facing/critical, **30 minutes** for less time-sensitive. Tied to availability maths - 99.99% allows roughly 13 minutes of downtime per quarter.
- Compensation: time-off-in-lieu or cash, capped at a proportion of salary, explicitly to prevent burnout.
Source: https://sre.google/sre-book/being-on-call/

**[FACT]** Measured toil at Google: quarterly SRE surveys put average toil at about **33%**, with a spread from 0% to 80%, and **interrupts are the top source of toil**. (https://sre.google/sre-book/eliminating-toil/)

**[FACT]** Alert quality, the reason on-call is miserable: the average on-call engineer receives roughly **50 alerts per week**, of which only **2-5% require human intervention**. In many organisations **>50% of alerts are false positives**; in security ops **46%** are false positives, with 63% of orgs fighting duplicate alerts.
Sources: https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view , https://www.atlassian.com/incident-management/on-call/alert-fatigue , https://alertops.com/articles/alert-fatigue/

**[FACT]** A global survey puts median annual downtime response at **280 hours/year**, "about a third of their time responding to disruptions". (https://devops.com/survey-it-teams-spend-about-a-third-of-time-responding-to-disruptions/)

### 4.4 Maintenance windows and patching cadence

**[FACT]** Patch Tuesday is the **second Tuesday of each month**, formalised by Microsoft in **October 2003**, released at 10:00 Pacific. Microsoft chose Tuesday deliberately: Monday to clear the previous week, and the rest of the week to test, deploy and respond to fallout. It is "common to schedule patching for both Windows and Linux instances relative to Patch Tuesday, often on the first or second weekends after Patch Tuesday".
Sources: https://en.wikipedia.org/wiki/Patch_Tuesday , https://techcommunity.microsoft.com/blog/windows-itpro-blog/windows-10-update-servicing-cadence/222376 , https://docs.aws.amazon.com/managedservices/latest/accelerate-guide/acc-p-maint-window-ams-console.html

**[FACT]** There is no universal cadence; it depends on attack surface, change risk and operational capacity. A cadence "becomes operational when it's written down": which component is on which cadence, the maintenance window slot, **the rollback path, and the owner engineer**.
Source: https://stackharbor.com/en/blog/2025-06-21-patching-cadence-decision/

**[FACT]** Change failure rate as a real benchmark: DORA 2024 - elite performers deploy on demand, lead time under a day, change failure rate **near 5%**. Elite ~19% of respondents; the high cluster shrank 31% -> 22% and the low cluster grew 17% -> 25%.
Sources: https://dora.dev/research/2024/dora-report/ , https://getdx.com/blog/2024-dora-report/ , https://octopus.com/blog/2024-devops-performance-clusters

### Unique verbs and surfaces

- `ssh`, root/sudo, package manager, systemd, certificate renewal, disk/LVM, log grep - already in the game.
- **Raise an RFC**; pick change type (standard / normal / emergency); attach a **rollback plan**; book a **maintenance window**; get CAB approval; run **post-implementation review**.
- **Acknowledge a page**; escalate to secondary; declare a major incident; write a **blameless postmortem** - already in the game.
- **Silence / tune an alert** - a verb no other rung has, and the direct mechanical answer to alert fatigue.
- **Raise a problem record** from N linked incidents; publish a **known error + workaround**.

### Pains / comedy material

- **[FACT]** The 50-alerts-a-week / 2-5% actionable ratio is the joke, sourced. So is 2 incidents per 12h shift being the documented *maximum* while everyone runs above it.
- **[FACT]** Onboarding is 76 hours and offboarding is 25 hours of median resolution time - the leaver whose account is still live is a documented statistic. (Fixify 2026)
- **[FOLKLORE, MSP-vendor grade] The named structural causes of MSP tech burnout**: too many tickets per technician, too many monitoring alerts with no filtering, on-call rotations that destroy sleep, role definitions that lack clarity, and **constant context switching across multiple client environments**. (https://www.getthread.com/blog/msp-burnout , https://www.ltvplus.com/msp/msp-technician-burnout/ , https://www.channelinsider.com/channel-business/running-an-msp/msp-service-desk-burnout/)
- **[FOLKLORE]** CAB criticism is a genuine industry argument, not a strawman: approvals "turn into rubber stamps, where changes are approved without meaningful scrutiny because the culture treats the CAB as a compliance checkbox rather than a risk filter"; DevOps practitioners call CABs slow and ineffective; "when teams treat the CAB as the final and only decision-maker, they risk turning Change Management into a bottleneck". (https://www.teamdynamix.com/blog/is-the-change-advisory-board-dead-rethinking-cab-for-agile-it-teams/ , https://www.itilnews.com/index.php?pagename=ITIL_Change_Advisory_Board_Is_it_killing_your_Business)
- **[FOLKLORE]** Emergency change rate as a culture smell: "frequent use can indicate a reactive culture or poor planning"; a high emergency share means standard/normal changes aren't being identified early enough. (https://www.freshworks.com/change-management/metrics/ , https://blog.invgate.com/change-management-kpis)

### What the game should gate on this title

**[DESIGN]**
1. **Ticket TYPE becomes a player decision, and it is scored.** The same inbound event can be filed as incident vs request vs change; mis-filing has consequences (a change filed as an incident bypasses approval = the break-glass exploit; a request filed as an incident poisons the availability stats).
2. **Emergency change rate as a visible, judged metric.** Break-glass already exists - now count it. Above a threshold, the org labels the player "reactive" and the CAB tightens, which is a real feedback loop.
3. **Alert tuning as a first-class action** with the true payoff: silence a noisy check and future night pages drop; silence the wrong one and you miss a real outage. Seed the alert stream at the real ratio (~50/week, 2-5% actionable).
4. **On-call weeks should ZERO OUT project progress**, per the SRE rule, and the game should say so. Then hand the player projects anyway. That is both the comedy and the lesson.
5. **Problem management is optional and unrewarded short-term.** Make it pay only on repeat runs. Then let the org praise the firefighter who reopens the same incident weekly.
6. **Patch Tuesday as a calendar event** - second Tuesday, work lands the following weekend, and the maintenance window requires a written rollback path and a named owner before it can be booked.

---

## 5. Senior Engineer

### Work mix

**[FACT]** The nearest real number for "seniors bill less": SPI Research's Professional Services Maturity Benchmark work shows senior consultants/managers carrying utilization targets of **55-70%**, versus a firm-wide optimum around **75%**, "because their time often includes business development, mentoring, and oversight that doesn't bill directly to clients".
Sources: https://www.saibongroup.com/blogs/consultant-utilization-rate-benchmark , https://get.kantata.com/rs/677-LEJ-696/images/2025-ps-maturity-benchmark.pdf , https://www.kantata.com/blog/article/professional-services-utilization-benchmarks

**[FACT]** Industry-wide billable utilization actually achieved: **68.9% in 2024** (lowest since 2019, SPI, 403 firms), falling to **66.4% in 2025**. Healthy band quoted as **74-84%**; below 74% revenue per consultant drops below break-even for most cost structures; above 85% firms risk burnout and quality decline.
Sources: https://get.kantata.com/rs/677-LEJ-696/images/2025-ps-maturity-benchmark.pdf , https://www.saibongroup.com/blogs/consultant-utilization-rate-benchmark , https://www.runn.io/blog/utilization-rate-benchmarks

**[DESIGN, anchored]** Senior engineer work mix:
- ~35% own tickets/incidents (the escalated end only)
- ~25% project/change delivery
- ~20% escalations and unblocking others (the tax)
- ~10% design review / documentation / runbook authoring
- ~10% meetings

### Unique verbs and surfaces

- **Approve** another engineer's change (first time the player is the CAB, not the petitioner).
- **Review** a design or a runbook before it ships.
- **Own an architecture decision within one domain** - the SFIA "Ensure, advise" step.
- **Be the named escalation path** on the rota rather than a name in it.
- **Cross-customer visibility** at an MSP: the scope walls the game already has become partly passable, which is itself a promotion mechanic and a compliance hazard.

### Pains / comedy material

- **[FOLKLORE, well-attested across MSP sources]** The senior's core grievance is that they are the shock absorber: understaffing -> "senior people become the safety net" -> "experienced engineers get dragged into lower-level work" (https://www.ltvplus.com/msp/msp-technician-burnout/). This is the single most repeated complaint at this rung across every source consulted.
- **[FACT]** And the arithmetic that makes it unfair is citable: interrupts are the **top source of toil** in Google's own SRE surveys, and a 20-minute interrupt costs hours. (https://sre.google/sre-book/eliminating-toil/ , https://sre.google/sre-book/dealing-with-interrupts/)
- **[FACT]** The utilization pincer: a senior's target is 55-70% because of mentoring and oversight, but firms only actually hit 66-69% overall, so there is permanent pressure to bill more of exactly the time that was supposed to be non-billable.
- **[FOLKLORE]** "Mentoring" as a line item you are not given time for, followed by a performance review that mentions you did not mentor enough.

### What the game should gate on this title

**[DESIGN]**
1. **Two clocks, permanently.** A utilization clock (billable %) and a delivery clock. Making both green is impossible; the game should be honest that the trade is structural, not a skill issue.
2. **Approval authority over other engineers' changes** - and the player eats the blast radius when they approve badly. This is the real content of the rung.
3. **Interrupt shield mechanic**: the player can declare "project day" and route interrupts to someone else. It works (per SRE polarization) and it costs goodwill. A genuine strategic choice with a real citation behind it.
4. **The escalation floor rises**: junior-tier tickets stop appearing in the player's queue *except* when the desk is over capacity, at which point they flood in. That is the safety-net dynamic, mechanised.

---

## 6. Team Lead / Service Delivery Lead

### Work mix

**[FACT]** Duties recurring across real IT team lead / service desk team leader / service delivery lead JDs:
- **Rota and capacity**: "ensuring resource availability (rota) and capability... to meet KPIs and adherence to SLAs"; "manage staffing levels to cope with peaks and troughs in demand".
- **Performance management**: analyse team performance to find problem areas, regular coaching, one-to-one training, performance improvement plans.
- **Timesheet approval** as an explicit duty.
- **Quality**: incident quality audits and call monitoring via monitoring tools.
- **Metrics/reporting**: schedule adherence, operational metrics, individual performance metrics.
- **Succession**: "develop and mentor teams to build broad and deep bench strength in skills needed to meet succession needs".
Sources: https://www.velvetjobs.com/job-descriptions/it-team-lead , https://www.velvetjobs.com/job-descriptions/service-desk-team-leader , https://www.velvetjobs.com/job-descriptions/service-delivery-lead , https://spotterful.com/en/blog/job-description-template/support-team-lead-responsibilities-and-required-skills

Honest gap: **no source found gives a percentage split of technical vs management time for this role.** Every JD lists duties, none quantifies. Treat any split in-game as [DESIGN].

### The MSP-specific version: dispatcher / service coordinator

**[FACT]** At MSPs there is a distinct, real, non-management role that owns the board: the **dispatcher**. "Triage, or assigning tickets to Techs, is the main function of a dispatcher." They answer client calls, initiate triage, assign and escalate tickets, and **shuffle engineers' schedules**. Explicitly *not* a management position - they enforce procedures set by the service delivery manager. The service desk manager is the "big-picture" role; the dispatcher is the detail role.
Sources: https://www.supportadventure.com/dispatcher-vs-service-desk-manager/ , https://chartec.net/msp-dispatcher-increasing-service-workflow/ , https://www.getthread.com/blog/msps-should-rethink-dispatchers-coordinators-and-triage

**[FACT]** The dispatcher's documented triage framework - **who / what / where / when**:
- **Who**: scope of impact (individual, department, whole site) - "the scope of impact determines urgency more reliably than the ticket subject line alone"
- **What**: break/fix vs monitoring alert vs project vs change request
- **Where**: queue position relative to technician workload
- **When**: SLA deadline for that client tier and issue type
Assignment goal: "the right ticket to the right technician at the right time", tracking availability, skill level and client familiarity - explicitly to stop senior techs doing junior work and to stop juniors drowning. Dispatchers also flag tickets "trending toward a breach" *before* they breach.
Source: https://www.bmkcommunity.com/blog-msp-dispatcher-role-responsibilities/

**[FACT]** The MSP day starts with a **daily huddle** covering schedule changes and what's coming up. (https://chartec.net/blogs/blog/msp-service-desk-it-service)

**[DESIGN]** This is the strongest single find for a lead-tier game loop. The dispatcher's who/what/where/when is a **four-axis assignment puzzle** that is genuinely a different game from resolving tickets, is fully documented, and directly extends the priority matrix the game already teaches. The lead tier should be a board-management game, not a faster ticket game.

### Pains / comedy material

- **[FOLKLORE]** Timesheet policing is literally in the JD ("managers approve timesheets from their phones"), so the parody writes itself: the lead spends the morning chasing engineers for the 15 minutes they did not account for, in order to hit a utilization number that the industry misses anyway (66-69% actual vs 74-84% "healthy").
- **[FOLKLORE]** Rota Tetris versus holiday requests versus the on-call minimum of 8 engineers (SRE) when you have 5.
- **[FOLKLORE]** Being accountable for KPIs while the levers (headcount, alert quality, client behaviour) all sit with someone else.
- **[FACT]** Real tension to dramatise: the dispatcher's job is to *prevent* senior techs from handling junior-level work, while burnout literature says that is exactly what happens under load. Two sourced facts in direct opposition = a designed conflict.

### What the game should gate on this title

**[DESIGN]**
1. **The player stops resolving and starts assigning.** Ticket resolution becomes NPC-executed with success probability driven by the who/what/where/when match quality. Hard shape break, fully sourced.
2. **Rota builder** with the SRE constraint made explicit: 8 engineers for sustainable 24/7 primary+secondary, 6 per site multi-site. Give the player 5 and let them discover why the rule exists.
3. **Timesheet approval as a real (annoying) action**, with the utilization target visible and unreachable.
4. **Daily huddle** as the run-start planning screen.
5. **Pre-breach flagging**: the lead sees SLA trend lines, not just breaches, and intervening early is the skill.

---

## 7. Architect / Principal / vCIO

### Work mix

**[FACT]** No public source gives a meetings-vs-hands-on percentage for architects. Repeated qualitative finding instead: "If an architect is only in meetings, they lose the pulse of the product and the team." Typical entry bar is 5-10 years hands-on. Day-in-the-life descriptions list: creating plans for new security architecture, conducting risk assessments, sitting in on meetings and giving presentations.
Sources: https://medium.com/@krambek/it-architecture-in-real-life-chapter-9-the-hands-on-architect-5bd2b2b34bbc , https://www.computerscience.org/careers/information-technology-architect/day-in-the-life/ , https://www.leanix.net/en/wiki/it-architecture/it-architects

**[FACT]** Solutions architect duties from JD aggregates: high-level and low-level architectural documentation (diagrams, design patterns, technical specifications); solution design docs, technical guides and training material; client meetings from scope definition to final presentation; **pre-sales discussions**; system integration plans; technical lead across the solution lifecycle.
Sources: https://www.indeed.com/hire/job-description/solution-architect , https://www.keka.com/solution-architect-job-description , https://www.4cornerresources.com/job-descriptions/solution-architect/

**[FACT]** The MSP-flavoured architect is the **vCIO**, and it is well documented. Core content: IT strategy, goal setting, IT budgeting; a **3-year technology roadmap and budget** per client; **Quarterly Business Reviews** covering environment health, spend, risk posture and roadmap progress, presented in business terms - "the format ensures that IT gets onto the executive agenda four times a year on a predictable cadence rather than only during a crisis"; vendor review and negotiation; annual IT budget development with justification and prioritisation. Explicitly: "They're not the person resetting passwords, troubleshooting your printer, or responding to help desk tickets."
Sources: https://superops.com/blog/what-does-being-vcio-mean , https://www.inscnet.com/blog/what-is-a-vcio-how-msps-provide-virtual-cio-services-to-smbs/ , https://qbrstudio.com/what-is-a-vcio , https://www.propelyourmsp.com/what-is-a-vcio/

**[DESIGN, anchored]** Architect work mix:
- ~40% meetings (design review, stakeholder, pre-sales, QBR)
- ~25% documentation and diagrams
- ~15% review and approval of others' designs
- ~10% roadmap and budget
- ~10% hands-on, and only if they fight for it

### Unique verbs and surfaces

- **Produce a diagram** that becomes binding on other people.
- **Set a standard** - and then watch NPC engineers either comply or route around it.
- **Sit a QBR** - present environment health, spend, risk and roadmap to a client exec who wants to talk about the printer.
- **Build a 3-year roadmap and budget**; defend a line item; get it cut.
- **Pre-sales**: scope a deal your own delivery team will have to live inside. The architect promising what the sysadmin tier must deliver is a whole comedy engine, and a true one.
- **Vendor negotiation.**

### Pains / comedy material

- **[FACT, named anti-pattern with a literature]** The **ivory tower architect**: architects "sit in the penthouse to define how developers should design and build software, without developing any software themselves". The diagnosis is precise and gameable - "it doesn't provide feedback to the architects as to the effectiveness nor the cost of their decisions"; architects "set binding guidelines that don't help anyone but actually cause projects to slow down or system performance to suffer"; "developers start building workarounds or ignore the guidelines altogether" and the tower never finds out.
  Sources: https://blog.alexewerlof.com/p/ivory-tower-architect , https://www.ben-morris.com/enterprise-architecture-anti-patterns/ , https://martinfowler.com/articles/architect-elevator.html , https://agilemodeling.com/essays/enterprisemodelingantipatterns.htm
- **[FACT]** Gregor Hohpe's **Architect Elevator** is the counter-model and is the single best frame for a top-rung game mechanic: the architect's value is riding between the penthouse and the engine room, and losing either floor is the failure state. (https://martinfowler.com/articles/architect-elevator.html)
- **[FOLKLORE]** Contributing factor with comedic legs: "central architecture teams have to cover a broad scope, so it's difficult for them to stay close to the details", and architecture became accessible to business analysts and product owners, which "raised the level of abstraction" - i.e. the meetings got vaguer.
- **[FOLKLORE]** The QBR where the CEO's only IT concern is their own laptop.

### What the game should gate on this title

**[DESIGN]**
1. **The elevator, literally.** Two floors: penthouse (QBR, budget, roadmap) and engine room (the servers the player used to own). Time spent on one is time not spent on the other, and a **drift meter** tracks how out-of-date the architect's mental model of the estate is. If drift is high, their diagrams are silently wrong and NPC engineers start routing around them - the ivory tower failure state, mechanised and sourced.
2. **Decisions are delayed-consequence.** An architect's action resolves 3 in-game months later, in someone else's incident. That is the true shape change: the top rung's feedback loop is long and indirect, which is exactly why it is a hard job and why the tower forms.
3. **Pre-sales promise mechanic**: scope a deal. The delivery tier then has to live inside it, and the player may see their own past promise arrive as an impossible ticket.
4. **Standards as buffs/debuffs on NPC engineers.** A good standard raises the whole team's success rate; a bad one gets ignored and the player is not told.
5. **Hands-on is now a spend, not a default.** Let the player choose to fix something themselves; it feels great, it fixes one thing, and it costs the roadmap.

---

## 8. Where careers FORK

### The fork is real, formalised, and has a name

**[FACT]** The **dual career ladder** is a documented HR structure: "a parallel promotion path that lets individual contributors advance to senior levels with compensation, recognition, and influence equivalent to management track", creating an IC track (Staff -> Principal -> Distinguished) alongside management (EM -> Director -> VP). "Engineering managers focus on people. Staff engineers focus on technology."
Sources: https://www.allvoices.co/glossary/dual-career-ladder-track , https://testlify.com/hr-glossary/dual-career-ladder-track/ , https://staffeng.com/guides/overview-overview/

**[FACT]** Will Larson's four **staff archetypes** - the most useful thing found for making an IC-architect track *playable*, because they are four genuinely different jobs at the same rung:
- **Tech Lead** - guides one team's technical approach and execution
- **Architect** - sets technical direction for a broader area, spanning teams
- **Solver** - drops into the hardest, most ambiguous problems
- **Right Hand** - extends a senior leader's capacity, does whatever the org most needs
Sources: https://staffeng.com/guides/staff-archetypes/ , https://lethain.com/static/blog/staffeng/staffeng-2020-12-16.pdf

**[FACT]** Staff+ ICs "spend less time writing code and more time writing documents, reviewing designs, building consensus, and mentoring".

**[FACT]** The three-way version exists too: Pat Kua's **Trident Model** (tech lead / IC specialist / people manager) as an alternative to a two-pronged ladder. (https://www.patkua.com/blog/the-trident-model-of-career-development/)

### Is the IC-architect track *credible*? The honest answer is: contested, and that is the content

**[FACT / cited critique]** The ceiling is not symmetric: "Where the two tracks split is the ceiling, not the floor. Climb management past director into VP and SVP of engineering and the comp keeps going... The IC track mostly tops out at principal, with a thin distinguished tier above it at a few big companies." IC ladders "get steep near the top, and the number of roles shrinks fast", and many orgs cap IC ladders earlier than manager ladders. **Only 1-2% of software engineers reach principal level.**
Sources: https://hroasis.com/tech-career-paths-ic-vs-manager-2026/ , https://harmny.ai/resources/engineering-career-ladder , https://www.smithspektrum.com/blog/career-ladders-engineers-2026

**[FACT / cited critique]** The fake-ladder failure mode, described in the literature: "many organizations claim to have IC tracks but in reality they stop meaningfully supporting IC growth after senior engineer. You might get a Staff Engineer title but no clear path to Principal, no budget for your initiatives, and constant pressure to 'just take a small team' if you want to keep advancing."

**[FOLKLORE, from the critique side]** The archetypes themselves are disputed - practitioners argue they can become anti-patterns or self-serving labels. (https://blog.alexewerlof.com/p/staff-archetypes-are-anti-patterns , https://www.seangoedecke.com/staff-engineer-archetypes/) Worth knowing so the game does not present them as gospel.

### What the game should gate on the fork

**[DESIGN]**
1. **Fork at senior engineer**, which is where every source says the split occurs, and make it a genuine branch of MECHANICS, not a stat choice:
   - **Management branch**: the board game. Rota, assignment, timesheets, headcount, KPIs you don't control. Verbs act on people.
   - **IC branch**: the estate game. Standards, designs, long-feedback decisions, drift. Verbs act on systems.
2. **Ship the fake-ladder joke, because it is sourced.** Offer the IC promotion, then have management quietly withhold the budget and repeatedly suggest the player "just take a small team". The player who holds the IC line pays a real cost - which is exactly what the literature says happens.
3. **The four archetypes as IC sub-builds** - Tech Lead / Architect / Solver / Right Hand. Four different late-game loops at one rung, already named and described by the canonical source. The **Right Hand** in particular ("does whatever the org most needs") is a superb parody engine at a dysfunctional org, and slots straight into the existing E8 org-dysfunction content.
4. **Make the ceiling asymmetry visible** - the management branch keeps going, the IC branch narrows to one seat. That is the true fact, it is bleak, and it is funny in a parody.
5. **Do not present the archetypes as truth** - the critique that they are labels people wear rather than jobs people do is itself good material.

---

## 9. Cross-cutting number table (the sourced ones, for tuning)

| Number | Value | Rung | Source |
|---|---|---|---|
| Tickets/day, tier 1 tech | 30-50 | L1 | supportsave |
| First response median | 5 min (p75 8, p90 15) | L1 | Fixify 2026 |
| FCR service desk | 70-75% avg, 85%+ top | L1 | MetricNet |
| FCR desktop support | ~84% (70-97%) | L2 | MetricNet |
| Escalation rate L1->L2 | 22% avg; <15% top performers | L1 | count.co / HDI |
| Cost per ticket | $22 / $69 / $104 (L1 / desktop / L3), additive on escalation | all | HDI-MetricNet |
| Ticket mix | Software+apps 38.2%, onboard/offboard 16.6%, IAM 15.9% | L1/L2 | Fixify 2026 |
| Top ticket-generating app | Okta 12.8% of app-tagged | L1 | Fixify 2026 |
| Onboarding median resolution | 76.3 h (offboarding 25.1 h) | L1/L2 | Fixify 2026 |
| Weekly peak | Tue 23.5%; Mon+Tue 45%; 11am = 11% of day | all | Fixify 2026 |
| IT staff ratio | 1.6 per 100 employees median (0.7-4.3) | org | Fixify 2026 |
| Incident vs request | ~54% / 46% (single published org) | sysadmin | Univ. of Worcester report |
| ITSM maturity | 12% fully mature; >40% ad hoc | org | itsm.tools / InvGate |
| SRE ops cap | >=50% engineering, <=25% on-call, <=25% other ops | sysadmin | Google SRE |
| On-call staffing minimum | 8 single-site / 6 per site multi-site | sysadmin | Google SRE |
| Incidents per 12h shift | max 2 (an incident costs ~6h) | sysadmin | Google SRE |
| Page response target | 5 min critical / 30 min otherwise | sysadmin | Google SRE |
| Measured toil | ~33% avg (0-80%), interrupts the top source | sysadmin | Google SRE |
| Alerts per on-call engineer | ~50/week, 2-5% actionable | sysadmin | oneuptime / Atlassian |
| False positive alerts | >50% many orgs; 46% in security ops | sysadmin | AlertOps / Vectra |
| Downtime response | 280 h/yr median, ~1/3 of team time | sysadmin | DevOps.com survey |
| Change failure rate, elite | ~5%; elite = 19% of respondents | devops | DORA 2024 |
| Billable utilization actual | 68.9% (2024) -> 66.4% (2025) | MSP | SPI / Kantata |
| Billable utilization healthy | 74-84%; 75% optimum; >85% burnout | MSP | SPI / Saibon / Runn |
| Senior/manager utilization target | 55-70% | senior | SPI-derived |
| MSP utilization target (practice) | 65-75% | MSP | BrightGauge / MSP coaching |
| Billed hours per tech per year | 1,250-1,325 | MSP | insidetherepairshop |
| Best-in-class minutes per ticket | ~30 min | MSP | evolvedmgmt |
| Patch Tuesday | 2nd Tuesday, 10:00 PT, since Oct 2003 | sysadmin | Wikipedia / MS |
| Reach principal level | 1-2% of engineers | IC track | smithspektrum |
| Time in grade L1 -> L2 | 6-18 months | L1 | Zippia / Alloy |

---

## 10. Consolidated recommendation: the shape break per rung

One sentence per rung - what NEW MECHANIC (not new number) defines it. This is the answer to the design question.

| Title | The shape break | Sourced justification |
|---|---|---|
| L1 junior | You may only do what the KB says; everything else is a permission wall | SFIA L1 "Follow"; escalation triggers require system-level access |
| L1 senior | **A second queue appears: other people's work.** Your clock runs while you fix theirs | Senior SDA JD: QA checks, mentoring, retained ownership, manager backup |
| L2 | The permission wall opens (system-level access) and tickets arrive pre-diagnosed WRONG | Tier definitions; L2 = system access + root cause |
| Sysadmin | **Ticket TYPE becomes a player choice with consequences** (incident/request/change/problem) + on-call weeks zero out project work | ITIL 4 practices; Google SRE polarization + 25% on-call cap |
| Senior eng | You approve other people's changes and eat their blast radius; two clocks (billable vs delivery) that cannot both be green | SPI 55-70% senior utilization vs 74-84% healthy; safety-net folklore |
| Team lead | **You stop resolving and start assigning** - the who/what/where/when board game; rota under the 8-engineer rule you cannot staff | MSP dispatcher triage framework; SRE staffing minimum; JD timesheet/rota duties |
| Architect / vCIO | **Delayed, indirect consequences + a drift meter.** Your decisions land 3 months later in someone else's incident, and if you stop riding the elevator your diagrams go quietly wrong | Ivory tower anti-pattern; Hohpe architect elevator; vCIO QBR/roadmap cadence |
| The fork | Branch at senior: management verbs act on PEOPLE, IC verbs act on SYSTEMS; the IC ladder visibly narrows and the org keeps offering you "just a small team" | Dual ladder literature; Larson archetypes; documented IC ceiling + fake-ladder critique |

### Three org-level events worth building (all true, all reshape the board)

1. **"We're going swarming"** - tier walls come down, escalation button removed, replaced by pulling colleagues whose clocks then also run. Real named practice with real cited results and real cited failure modes.
2. **Emergency change rate audit** - the org notices the player's break-glass count and tightens the CAB. Real metric, real cultural interpretation ("reactive culture or poor planning").
3. **The CAB-is-dead debate** - management alternately abolishes and reinstates change control. Genuine, ongoing, unresolved industry argument.

---

## Sources

- Fixify 2026 IT Help Desk Benchmark Report - https://www.fixify.com/it-help-desk-benchmark-report-2026
- MetricNet desktop support metrics (FCR) - https://www.metricnet.com/desktop-support-metrics-part-5/
- MetricNet service desk metric definitions - https://www.metricnet.com/introduction-service-desk-metrics-definitions-key-correlations/
- HDI "Metric of the Month: Cost per Ticket" - https://www.thinkhdi.com/~/media/HDICorp/Files/Library-Archive/Insider%20Articles/Cost%20per%20Ticket.pdf
- HDI "Metric of the Month: First Level Resolution Rate" - https://www.thinkhdi.com/~/media/HDICorp/Files/Library-Archive/Insider%20Articles/First%20Level%20Resolution.pdf
- HDI tiered vs swarming - https://www.thinkhdi.com/library/supportworld/2017/evaluating-technical-support-models-tiered-support-vs-swarming-part-2
- Escalation rate benchmarks - https://count.co/metric/escalation-rate , https://blog.invgate.com/escalation-rate
- Tier definitions - https://blog.invgate.com/tier-2-help-desk , https://blog.invgate.com/tier-1-help-desk , https://redriver.com/managed-services/tier-1-vs-tier-2-vs-tier-3-help-desk , https://itbd.net/blog/helpdesk/it-support-tiers-tier1-vs-tier2-vs-tier3/ , https://www.supportsave.com/blog/tier-1-vs-tier-2-it-helpdesk-support/ , https://www.topdesk.com/en/blog/service-desk-tiers-explained/
- Senior Service Desk Analyst JD - https://www.velvetjobs.com/job-descriptions/senior-service-desk-analyst
- Senior vs standard analyst comparison - https://www.zippia.com/senior-help-desk-analyst-jobs/senior-help-desk-analyst-vs-service-desk-analyst-differences/ , https://www.alloysoftware.com/blog/what-does-a-service-desk-analyst-do/
- Team lead / service delivery JDs - https://www.velvetjobs.com/job-descriptions/it-team-lead , https://www.velvetjobs.com/job-descriptions/service-desk-team-leader , https://www.velvetjobs.com/job-descriptions/service-delivery-lead , https://spotterful.com/en/blog/job-description-template/support-team-lead-responsibilities-and-required-skills
- SFIA levels of responsibility - https://sfia-online.org/en/about-sfia/how-sfia-works , https://sfia-online.org/en/sfia-9/responsibilities/level-1 , https://sfia-online.org/en/sfia-9/responsibilities/level-3 , https://sfia-online.org/en/sfia-9/responsibilities/level-5
- ITIL 4 practices - https://itsm.tools/34-itil-4-management-practices/ , https://www.beyond20.com/resources/blog/an-overview-of-the-incident-management-practice-in-itil-4/ , https://pdcaconsulting.com/itil-ticket-types-incident-problem-change-service-request/ , https://blogs.helixops.ai/ticket-vs-incident-vs-problem-vs-service-request/
- Change enablement / change types - https://itsm.tools/change-enablement/ , https://www.manageengine.com/products/service-desk/it-change-management/it-change-types.html , https://trustedinstitute.com/concept/itil-4-foundation/change-enablement/standard-normal-emergency-changes/
- CAB criticism - https://www.teamdynamix.com/blog/is-the-change-advisory-board-dead-rethinking-cab-for-agile-it-teams/ , https://www.itilnews.com/index.php?pagename=ITIL_Change_Advisory_Board_Is_it_killing_your_Business , https://en.wikipedia.org/wiki/Change-advisory_board
- Change metrics / emergency change rate - https://www.freshworks.com/change-management/metrics/ , https://blog.invgate.com/change-management-kpis
- ITSM maturity - https://itsm.tools/itsm-maturity/ , https://blog.invgate.com/itsm-statistics , https://www.teamdynamix.com/blog/how-to-advance-your-it-service-management-maturity/
- Published ITIL metrics from real orgs - https://it.wp.worc.ac.uk/wp-content/uploads/2025/04/IT-Service-Summary-Report-September-2024.pdf , https://warwick.ac.uk/services/its/servicessupport/itil/latestmetrics
- Google SRE: being on-call - https://sre.google/sre-book/being-on-call/
- Google SRE: eliminating toil - https://sre.google/sre-book/eliminating-toil/
- Google SRE: dealing with interrupts - https://sre.google/sre-book/dealing-with-interrupts/
- Alert fatigue - https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view , https://www.atlassian.com/incident-management/on-call/alert-fatigue , https://alertops.com/articles/alert-fatigue/ , https://www.vectra.ai/topics/alert-fatigue
- Unplanned work / disruption time - https://devops.com/survey-it-teams-spend-about-a-third-of-time-responding-to-disruptions/
- Patching cadence - https://en.wikipedia.org/wiki/Patch_Tuesday , https://techcommunity.microsoft.com/blog/windows-itpro-blog/windows-10-update-servicing-cadence/222376 , https://stackharbor.com/en/blog/2025-06-21-patching-cadence-decision/ , https://docs.aws.amazon.com/managedservices/latest/accelerate-guide/acc-p-maint-window-ams-console.html
- DORA 2024 - https://dora.dev/research/2024/dora-report/ , https://getdx.com/blog/2024-dora-report/ , https://octopus.com/blog/2024-devops-performance-clusters
- Utilization benchmarks - https://get.kantata.com/rs/677-LEJ-696/images/2025-ps-maturity-benchmark.pdf , https://www.kantata.com/blog/article/professional-services-utilization-benchmarks , https://www.saibongroup.com/blogs/consultant-utilization-rate-benchmark , https://www.runn.io/blog/utilization-rate-benchmarks , https://www.mosaicapp.com/post/billable-utilization-rate-statistics-in-professional-services-firms , https://promys.com/billable-labor-utilization-industry-averages-for-techs-engineers/
- MSP utilization practice - https://www.brightgauge.com/blog/kpi-of-the-week-billable-percentage-per-tech , https://www.evolvedmgmt.com/blog/msp-service-metrics-you-need/ , https://insidetherepairshop.substack.com/p/gut-checking-the-ceiling-are-your
- MSP dispatcher / triage - https://www.bmkcommunity.com/blog-msp-dispatcher-role-responsibilities/ , https://www.supportadventure.com/dispatcher-vs-service-desk-manager/ , https://chartec.net/msp-dispatcher-increasing-service-workflow/ , https://chartec.net/blogs/blog/msp-service-desk-it-service , https://www.getthread.com/blog/msps-should-rethink-dispatchers-coordinators-and-triage , https://adamhannemann.com/triage-and-dispatch-are-critical-for-your-msp/
- MSP burnout - https://www.getthread.com/blog/msp-burnout , https://www.ltvplus.com/msp/msp-technician-burnout/ , https://www.channelinsider.com/channel-business/running-an-msp/msp-service-desk-burnout/ , https://deskday.com/how-the-tech-shortage-is-contributing-to-msp-burnout-key-insights-for-2025/
- Swarming - https://freshservice.com/itsm/three-tier-support-vs-swarming-blog/ , https://www.givainc.com/blog/what-is-swarming-it-customer-support-teams/ , https://blogs.helixops.ai/swarming-support-tiered-support-differences/ , https://www.supportbench.com/swarming-support-model-when-it-works-fails/
- Architect role - https://medium.com/@krambek/it-architecture-in-real-life-chapter-9-the-hands-on-architect-5bd2b2b34bbc , https://www.computerscience.org/careers/information-technology-architect/day-in-the-life/ , https://www.leanix.net/en/wiki/it-architecture/it-architects , https://www.indeed.com/hire/job-description/solution-architect , https://www.keka.com/solution-architect-job-description
- Ivory tower / architect elevator - https://martinfowler.com/articles/architect-elevator.html , https://blog.alexewerlof.com/p/ivory-tower-architect , https://www.ben-morris.com/enterprise-architecture-anti-patterns/ , https://agilemodeling.com/essays/enterprisemodelingantipatterns.htm
- vCIO - https://superops.com/blog/what-does-being-vcio-mean , https://www.inscnet.com/blog/what-is-a-vcio-how-msps-provide-virtual-cio-services-to-smbs/ , https://qbrstudio.com/what-is-a-vcio , https://www.propelyourmsp.com/what-is-a-vcio/
- Career fork - https://staffeng.com/guides/staff-archetypes/ , https://staffeng.com/guides/overview-overview/ , https://lethain.com/static/blog/staffeng/staffeng-2020-12-16.pdf , https://www.allvoices.co/glossary/dual-career-ladder-track , https://testlify.com/hr-glossary/dual-career-ladder-track/ , https://www.patkua.com/blog/the-trident-model-of-career-development/ , https://hroasis.com/tech-career-paths-ic-vs-manager-2026/ , https://harmny.ai/resources/engineering-career-ladder , https://www.smithspektrum.com/blog/career-ladders-engineers-2026
- Archetype critique - https://blog.alexewerlof.com/p/staff-archetypes-are-anti-patterns , https://www.seangoedecke.com/staff-engineer-archetypes/
