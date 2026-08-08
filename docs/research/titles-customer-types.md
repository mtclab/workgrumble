# THREAD B: Customer-Type Taxonomy - research

Research for WORKGRUMBLE. Question: what customer segmentation is TRUE in real support orgs, such that an arrival (ticket/incident) can carry a customer TYPE as data over the existing rails (VIP flag, MSP per-customer tenancy + scope walls, employer archetypes, timesheet/billing scrutiny).

**Evidence key used throughout:**
- **[FACT]** = documented in a vendor's own published support terms, a contract/ITSM practice document, or a named practitioner source with specifics.
- **[FOLKLORE]** = recognizable practitioner lore, widely repeated, but I could not land a primary citation in this pass. Marked so it can be used for comedy while knowing it is not a citable number.

Note on forum sourcing: the search tool available here does not surface r/msp or r/sysadmin threads reliably (site: queries returned job ads; old.reddit.com is blocked to WebFetch). Practitioner-lore items below are therefore sourced to MSP-industry blogs and vendor/analyst practice docs where they are stated in print, and marked FOLKLORE where they are not.

---

## 1. Taxonomy table

The single most useful finding: **there are two independent axes, not one.** Real orgs tier by WHO the requester is (person tier) AND by WHAT the contract is (relationship tier). WORKGRUMBLE already ships the first axis (VIP flag). Thread B is really about adding the second and letting them multiply.

| # | Customer type | Relationship | SLA profile (real numbers) | Scrutiny behavior | Tone / voice | Comedy hook (TRUE under it) |
|---|---|---|---|---|---|---|
| 1 | **Internal rank-and-file** | Employer = your own org | Whatever the standard internal target is; no contractual teeth, only manager annoyance | None. Nobody audits an internal ticket. | Apologetic, over-explaining, "sorry to bother you" | The honest P3 that sits behind five queue-jumpers forever |
| 2 | **Internal VIP (exec)** | Same org, named on a list | Faster targets by routing rule, not by impact [FACT: Info-Tech, itsm.tools] | Zero invoice scrutiny; infinite *social* scrutiny. Escalates by walking to the CIO. | Terse, assumes you know who they are, no repro steps | Priority is set by WHO asked. Already shipped as the VIP flag - the taxonomy makes it a *type*, not a boolean |
| 3 | **Shadow VIP (exec assistant / delegate)** | Same org, VIP-by-proxy | Inherits the VIP's tier [FACT: VIP lists are "executives and their assistants" - itsm.tools] | Proxy: reports upward on your behavior | Polished, precise, better repro steps than the exec, and *scheduling-aware* | The EA is the most competent user in the building and outranks you anyway. Also: the EA can revoke your VIP goodwill silently |
| 4 | **Internal VIR (very important ROLE)** | Same org, operationally critical | Should be top priority; usually is not | Consequence is a *business outage*, not a complaint | Flat, factual, under time pressure ("scanner is down, trucks are queued") | "A VP whose laptop freezes during a Teams call is inconvenienced. Whereas a warehouse coordinator whose handheld scanner stops syncing at 6am can halt an entire day's fulfillment operation." [FACT: itsm.tools] - the game's honest-P2 finance team is already this |
| 5 | **Calendar-critical department** | Same org, time-boxed importance | Normal 29 days a month, VIP for 2 | Change-freeze enforcement: only exception-approved changes proceed [FACT] | Normal, then suddenly not normal | Finance at month-end close, sales at quarter-close. Same user, same ticket, different month = different priority. Free comedy from a date field |
| 6 | **MSP: fully managed customer** | Contract, per-user/device flat fee | Contracted response targets, 24/7 typically included [FACT] | Watches SLA attainment, not hours | Entitled but not hostile - "it's all included, right?" | They believe the flat fee bought infinity. Every request is in scope by their reading |
| 7 | **MSP: co-managed customer** | Contract + their own internal IT | Tier 1/2 to the MSP, escalate to internal IT for on-site / business-critical apps [FACT] | Their internal IT reviews your work critically - a peer audience | Peer-to-peer, jargon-dense, occasionally territorial | You are being graded by another sysadmin. And half your commands bounce off a RACI line rather than a firewall. Maps *exactly* onto the existing scope-wall mechanic |
| 8 | **MSP: block-hours / retainer customer** | Prepaid bucket + overage rate | Whatever the block buys; overages bill at ~$150-250/hr [FACT] | **Highest invoice scrutiny of any type.** Counts the bucket. | Transactional, clock-aware, "how long will that take?" before you start | "Customers usually hate it because the overages compound" [FACT]. They watch the meter while you work |
| 9 | **MSP: time-and-materials customer** | No contract, pay per incident | None guaranteed. Reactive by nature. [FACT] | Disputes line items after the fact; wants date + person + task + hours per entry [FACT] | Suspicious, negotiating, "that took HOW long?" | The one who reads the invoice with a ruler. Feeds the padding-scrutiny mechanic directly |
| 10 | **MSP: gold-tier customer who knows it** | Premium contract tier | 24/7, onsite visits, vCIO, faster SLA [FACT: bronze/silver/gold structure] | Cites the SLA back at you, by clause | Confident, quotes the contract, name-drops the account manager | "We're on Gold." Said as a technical argument. It sometimes works |
| 11 | **MSP: SMB owner who calls you directly** | Any contract, bypasses all of it | Whatever they can extract by phone | No audit, but no ticket either - so *your* utilization looks bad | Warm, personal, relentless, calls your mobile | Makes the senior person "the most expensive Level 1 helpdesk agent in town" [FACT: Giant Rocketship] |
| 12 | **Enterprise external (vendor side): basic plan** | You are the vendor, they bought the cheap tier | Days, business hours, web only [FACT: Salesforce Standard = 2-day response, 12/5] | None available to them | Frustrated, escalates by tweeting | They have a Sev-1 and a Sev-4 entitlement |
| 13 | **Enterprise external: premium plan** | Named contacts, TAM | 15-30 min for critical [FACT: AWS Enterprise <15min; MS Performance 30min; Atlassian Premier 30min] | Their vendor-management office tracks your SLA attainment | Formal, references case numbers and named contacts | Only 3 humans are allowed to open a case, and none of them is the one with the problem [FACT: Atlassian named-contact caps] |
| 14 | **Enterprise external: CAB-governed** | Change is a committee | Response is fast; *change* is slow (weekly/biweekly CAB) [FACT] | Process audit: was there an approved change record? | Procedural, meeting-scheduling, RFC-numbered | Fix takes 4 minutes. Permission takes 8 days. Emergency CAB (eCAB) exists and is the only fast path [FACT] |

---

## 2. Internal IT: how orgs actually tier their own users

### 2.1 The VIP list is real, named, and admits it is about politics

Info-Tech Research Group ships a literal **"Service Desk VIP Procedures Template"** and a matching blueprint, *"Design a VIP Experience for Your Service Desk"* - i.e. VIP handling is formalized enough to be a purchasable consulting deliverable. [FACT]

The blueprint names three delivery models, which is a clean menu for game data:
1. **Dedicated support** - a named technician handles VIP tickets.
2. **Prioritized routing** - VIP tickets jump the queue through the normal escalation path.
3. **Enhanced responsiveness** - faster response/resolution targets than standard.

It explicitly says *"VIP service doesn't have to mean concierge service"* and tells you to *"talk to all relevant stakeholders to clarify their expectations before choosing a VIP service delivery model."* [FACT]

### 2.2 The documented downsides are the comedy, and they are documented

Info-Tech lists the risks of VIP handling in print. All four are directly usable as mechanics: [FACT]
- **Resource strain:** "Service desk resources stretched thin, or poor allocation of resources leads to degraded service for the majority of users."
- **Inappropriate prioritization:** non-critical executive issues handled ahead of critical, business-impacting ones.
- **Scope creep:** VIPs asking for *personal* device setup, "creating resentment among non-VIP users."
- **Process circumvention:** "VIPs circumvent the correct process and contact the CIO or service desk manager directly."

That last bullet is the escalation ladder for type 2, written by an analyst firm rather than by a comedian.

### 2.3 VIP vs VIR - the sharpest single idea found in this thread

itsm.tools argues internal tiering should be by **VIR (very important ROLE)**, not VIP (very important person), because *"organizational importance does not equal operational criticality."* Their example:

> "A VP whose laptop freezes during a Microsoft Teams call is inconvenienced. Whereas a warehouse coordinator whose handheld scanner stops syncing at 6am can halt an entire day's fulfillment operation." [FACT]

The article also states plainly that VIP lists *"typically include executives and their assistants who get expedited support, 'white glove' provisioning"* and exist **for risk management - avoiding upsetting important people - rather than optimizing service quality.** [FACT]

Named VIR roles from the same source: frontline logistics, payroll operations, cybersecurity analysts, customer-facing digital teams.

**Design read:** WORKGRUMBLE's shipped pairing (exec earbuds auto-P2 by WHO asked vs finance team's honestly-earned P2) is exactly the VIP/VIR split. The taxonomy should make it a two-value field, not an accident: `priority_source: vip | impact`. The joke lands harder when the player can *see* which lever moved the number.

### 2.4 The shadow VIP is real

- VIP lists include *"executives and their assistants."* [FACT: itsm.tools]
- Executive IT support job descriptions specify supporting *"VIP users and their assistants"* as a named duty, and describe on-site presence *"during critical meetings, presentations, town halls, and executive sessions."* [FACT: multiple current job postings]
- The EA typically submits **on behalf of** the exec, with better documentation than the exec would supply. [FOLKLORE for the "better repro steps" characterization; FACT that proxy submission on behalf of VIPs is a standard ticketing pattern]

**Design read:** a `requester` distinct from `beneficiary`. The VIP flag should key off the *beneficiary*, while tone/quality-of-report keys off the *requester*. That one split generates the EA joke for free: an immaculate ticket that is still an auto-P2 for a lost earbud.

### 2.5 White-glove desk: a real, staffed, hiring job title

Currently advertised roles include "Executive IT Support Professional | C-Suite, White-Glove, VIP Support", "Executive Desktop Support Specialist - VIP IT Concierge", "IT VIP Service Delivery Manager". [FACT]

Stated duties across postings: dedicated technician or small team as **single point of contact from first contact to full resolution**; on-site standby during exec meetings; proactive maintenance of VIP laptops/phones/conferencing kit; and required competencies including *"discretion and confidentiality"* and *"ability to calmly handle high-pressure scenarios."* [FACT]

Implementation mechanics named by vendors: **SLA tiering** with faster targets for VIP users, **routing rules** to designated agents, and **custom ticket forms** capturing extra context. [FACT: Giva] Those three are literally the three data fields you would add.

### 2.6 Department-based / calendar-based priority

This is real but works differently than expected - it shows up mostly as **change freezes** rather than as ticket priority bumps:

- A freeze period is "a defined span (weeks to months) during which only exception-approved changes may proceed, typically layered over a business-critical period like holiday retail or quarter-end close." [FACT]
- Public companies run a quarterly trading blackout from ~2 weeks before quarter-end to ~2 trading days after results; **change/compliance teams commonly layer an IT freeze on the same calendar window** because a customer-facing outage during earnings week draws exactly the scrutiny the blackout exists to manage. [FACT]
- Finance issues a blackout for structural changes until the first re-forecast; a "soft freeze" prevents changes that would cause data discrepancies when closing a period. [FACT]
- Universities publish dated IT change freezes (e.g. UC Berkeley, "IT Change Freeze: Aug. 8-15 and Aug. 18-29"). [FACT]

**Design read:** the truthful mechanic is not "finance tickets are P1 in the last week of the month". It is **"in the last week of the month, your ability to CHANGE anything drops, and finance tickets become un-deferrable"** - pressure from both ends at once. That is a better game beat than a priority multiplier, and it reuses the existing change/approval rails rather than needing new ones.

---

## 3. MSP customers: contract structures that change behavior

### 3.1 The four structures, and what each actually changes

| Structure | Who owns what | Money shape | What it changes for the tech |
|---|---|---|---|
| **Fully managed** | MSP assumes 100% of IT operations, SLAs, and outcomes [FACT] | Predictable per-user / per-device covering the core stack: identity, endpoint, backup, security monitoring, IR retainer. 24/7 and after-hours **fundamentally included**. [FACT] | Broad touch rights, no per-task billing question, but every hour you burn is margin you lose |
| **Co-managed** | Hybrid. Client's internal IT runs day-to-day + user support; MSP fills gaps in expertise, capacity, or tools. MSP responsible only for **specific functions, support tiers, or defined projects**. [FACT] | Variable: role-based blocks (Service Desk, Systems Engineer, vCISO hours), project SOWs, platform subscriptions [FACT] | **Scope walls with a peer on the other side.** RACI defines who touches what |
| **Block hours / retainer** | Monthly retainer covering monitoring plus a fixed bucket of hours | **Overages billed at $150-250/hr** [FACT]. "The model MSPs prefer for accounts where they can't predict scope. Customers usually hate it because the overages compound." [FACT] | Every minute is visible and consumes a shared, depleting resource |
| **Time & materials** | Nothing is owned. Pay as needed. | Per-incident. "Reactive by nature," appeals to orgs wanting flexibility and minimal upfront commitment. [FACT] | No SLA, no standing access, maximum invoice argument |

### 3.2 Co-managed = the scope-wall mechanic, already correct

The RACI detail is unusually game-shaped: [FACT]
- Mature providers RACI-map **every major function**: endpoint management, server/network patching, backup monitoring, cybersecurity tooling, end-user help desk, vendor management, IT procurement, strategic planning.
- Typical split: **internal IT keeps** on-site support, application ownership, new-hire onboarding, business-workflow knowledge. **MSP owns** infrastructure monitoring and patching, the security stack, 24/7 alert response, backup validation, escalated technical support.
- **Credential plan** specifies "which accounts the MSP needs, at what privilege level, and how credentials will be vaulted." One documented Apple-shop pattern: the *business* holds the top admin account, the MSP holds an admin-level account under it.
- Escalation rules are explicit: "which ticket categories, which escalation trigger, which contact, within what time threshold." Tier 1/2 goes to the provider's help desk first; escalates to internal IT when the ticket needs **on-site presence, direct access to a business-critical application, or knowledge of a custom system.**
- Both directions are policed: "Internal IT should not escalate routine requests, and the MSP should not handle requests that do not require specialist capability." [FACT]

**Design read:** WORKGRUMBLE's out-of-contract server that refuses your commands is the *fully-managed/no-contract* version of this wall. Co-managed adds a much funnier wall: the command **succeeds technically but violates the RACI**, and the consequence arrives later as a complaint from a peer sysadmin rather than as a permission denied. Two distinct refusal flavors from one `scope_model` field.

### 3.3 Gold / silver / bronze - the real inclusion ladder

Documented tier contents: [FACT]
- **Bronze:** remote monitoring, patching, business-hours help desk.
- **Silver:** adds unlimited remote support, monthly reporting, software updates, endpoint protection.
- **Gold:** everything below, **plus 24/7 support, cloud services, virtual CIO input, onsite visits, regular IT planning sessions.**

The recommended differentiators between tiers are exactly four: **response time and availability** (business hours vs 24/7), **support scope** (remote-only vs onsite), **reporting cadence** (monthly vs as-needed), **strategic services** (compliance docs, cloud, vCIO reserved for premium). [FACT]

Explicit MSP advice: "Clearly document what each tier includes, and just as importantly, what it doesn't," and treat consistent tier-limit overruns as **an upgrade opportunity, not something to absorb.** [FACT]

Guidance to MSPs on setting the numbers: "tie your faster response and resolution times to your premium offerings, and keep your lower-tiered offerings tied to more lenient goals." [FACT]

### 3.4 A real MSP SLA table with numbers (Louisville Geek, published)

[FACT] Priority definitions and targets, verbatim shape:

| Priority | Definition | Acknowledgment | Contact attempt | Resolution goal |
|---|---|---|---|---|
| P1 Critical | "prevents multiple users from conducting normal business operations" (server failure, major breach, network outage) | 30 min | 1 hr | Immediate / best effort |
| P2 Elevated | "prevents a single user from conducting normal business operations" (password reset, workstation failure) | 1 hr | 4 hrs | 4 hrs / best effort |
| P3 Standard | "does not immediately impact business operations" (new user setup, routine maintenance) | 2 hrs | 8 hrs | 8 hrs / best effort |

Two things worth stealing:
1. **"Acknowledgment" and "contact attempt" are separate clocks.** The SLA is met by *touching* the ticket, not by fixing it. Every resolution goal on that page is qualified "best effort."
2. A password reset is formally **P2** because it blocks one user completely. That is a genuinely funny truth: the most trivial task in IT carries a higher contractual priority than most real engineering work.

Broader MSP norms: "often 15 minutes for critical outages and four hours for low-priority requests"; a common published ladder is Critical (business down) 15-min response / 4-hr resolution, High (major impact) 1-hr / 8-hr. [FACT]

### 3.5 Out-of-scope handling: the script MSPs are told to use

[FACT] The standard remedies, from MSP-industry sources:
- Point at the signed SOW: *"I'm afraid this is out of scope."* Then immediately offer *"Would you like me to prepare a quote for this extra work?"*
- Inform, estimate time and cost, **get approval before proceeding.**
- Engagement letters carry a scope-of-work clause defining what is and is not included **and how additional work will be billed.**

Definition in circulation: scope creep is "the tiny request your client asks you to do once, outside your agreed-upon contract, that can balloon into many requests for which you aren't compensated." [FACT]

**Design read:** the truthful loop is a three-way choice on an out-of-scope arrival - **refuse / quote-and-wait / just do it**. "Just do it" is the fun one and the one that costs you: it is unbilled, it trains the customer, and it recurs. That is a real, cited consequence chain rather than an invented penalty.

---

## 4. Enterprise external support (vendor side): real published tiers

All numbers below are from vendors' own published support pages. [FACT]

### 4.1 AWS Support plans

| Plan | Critical / business-down response | Prod down | Prod impaired | System impaired | General guidance | Named resources |
|---|---|---|---|---|---|---|
| Basic | n/a | n/a | n/a | n/a | n/a (docs + core Trusted Advisor only) | none |
| Business+ | < 30 min | < 1 hr | < 4 hrs | < 12 hrs | < 24 hrs | unlimited cases/contacts, no TAM |
| Enterprise | **< 15 min** | < 1 hr | < 4 hrs | < 12 hrs | < 24 hrs | **designated TAM**, 24/7 white-glove billing concierge |
| Unified Operations | **< 5 min** (from an Incident Management Engineer) | < 1 hr | < 4 hrs | < 12 hrs | < 24 hrs | designated Domain Specialist Engineers + Incident Management Engineers, senior billing specialist |

Note the shape: **only the top severity band changes between tiers.** Sev-2 through Sev-5 are identical across Business+, Enterprise, and Unified Ops. Money buys you speed on exactly one row.

### 4.2 Microsoft Unified Support

| Tier | Severity A (critical) response | Other |
|---|---|---|
| Core | 1 hour | essential reactive support, basic proactive guidance |
| Advanced | 1 hour | dedicated Service Delivery Manager, health checks, advisory hours |
| Performance | **30 min (critical cases only)** | dedicated support engineers, most comprehensive proactive engagement |

An independent advisory notes the primary SLA difference is **at Severity A only**, and adds the deflating line that "for most organisations, the practical difference in incident resolution time between a 30-minute response and a 1-hour response is negligible." [FACT] That is a joke that wrote itself: the premium tier buys 30 minutes of *acknowledgment*.

### 4.3 Salesforce Success Plans

- **Standard:** 2-day response, 12/5 availability.
- **Premier:** 1-hour response for business-stopping issues.
- **Signature:** Sev-1/Sev-2 dev and config cases routed to 24/7 English support; **updates every 15 minutes for Sev-1, hourly for Sev-2.** [FACT]

Sev definitions: Sev-1 (Critical) = production issue affecting all users, system unavailable, or data-integrity issue. Sev-2 (Urgent) = persistent issue affecting many users or major functionality impact. [FACT]

The Signature detail is a great mechanic: the premium tier buys a **mandatory update cadence**, i.e. you must report every 15 minutes whether or not anything has changed. That converts a support plan into an interruption timer.

### 4.4 Atlassian Premier

- **3 named contacts** per $39,500/year (expandable to 5 via a solution partner). [FACT]
- L1 (production down) 30 min · L2 (serious degradation) 2 hr · L3 (moderate) 8 hr · L4 (limited) 24 hr. [FACT]
- 24/7 coverage; dedicated senior engineers 24x5, weekends handled by the Select/Priority teams. [FACT]
- Escalation privileges: **"priority placement in the development escalation queue"** and **"global warm handoffs for critical issues"** between regional offices. [FACT]
- Standard/Select by contrast: ~2 business hours for production-impacting issues. [FACT]

**Named contacts is the most under-used mechanic here.** A hard cap of 3 humans who are contractually allowed to open a case is a rich, true constraint: the person with the problem is usually not one of the three, so real work routes through whoever happens to be a named contact. Perfect for a scope-wall variant on the vendor side.

### 4.5 What tiers actually buy (synthesis across all four vendors)

Consistently, only five things vary by tier. This is the whole vendor-side design space:
1. **Top-severity response time** (and often *only* the top row).
2. **Coverage window** (business hours vs 24x5 vs 24x7 vs weekend).
3. **Named/assigned humans** (TAM, SDM, dedicated senior engineers, Incident Management Engineers).
4. **Who may open a case** (unlimited contacts vs a hard named-contact cap).
5. **Escalation rights** (queue placement, warm handoffs, forced update cadence, billing concierge).

Response *targets are acknowledgment targets*, never resolution guarantees, at every vendor checked.

---

## 5. Behavioral truth: how customer type changes the CONVERSATION

### 5.1 The SMB owner who calls the tech directly [FACT, with practitioner detail]

Giant Rocketship (MSP-tooling vendor, written from an MSP owner's account):
- The direct call is "never about small issues" - it is always the urgent one, e.g. *"the CEO's laptop won't boot, and he has a board meeting in five minutes."*
- Accepting them "was training clients to skip the proper process, undermining technicians," and made the owner **"the most expensive Level 1 helpdesk agent in town."**
- Documented remedies, all usable as dialogue options: **delay-and-redirect** (*"I went ahead and created a ticket for you because it's faster"*), **real-time capture** (log the call while they are on the phone), **coverage framing** (the helpdesk is more reliable than one person's availability), **policy lean** (invoke compliance as neutral enforcement), **silent assist** (fix it via ticket, do not return the direct call).
- Core strategy stated outright: **"make tickets appear faster, safer, and more thorough than direct contact."**

The bypass also has a mechanical cost that maps straight onto the planned timesheet system: untracked work is unbilled work and makes the tech's utilization look bad while they are in fact busier.

### 5.2 The enterprise CAB ceremony [FACT]

- Standard CAB convenes **weekly or biweekly** to evaluate/approve/reject normal changes. High-velocity shops run daily stand-ups or async digital approvals.
- **eCAB** (emergency CAB) exists specifically to assess urgent changes "outside the normal schedule," with some or all of the CAB membership.
- Modern practice shifts CAB "from inspecting individual changes to auditing processes," with **pre-approved standard change paths** for automated deployments that pass CI/CD, reserving manual review for high-risk changes.
- DevOps practitioners' criticism of CABs as slow and ineffective is itself documented in the practice literature. [FACT]

**Design read:** three change classes is the truthful model, and it is a tiny data field: `standard` (pre-approved, just do it) / `normal` (waits for the next CAB slot) / `emergency` (eCAB, fast but leaves a paper trail and someone asks about it later). The comedy is the mismatch between fix time and approval time, plus the temptation to mislabel a normal change as an emergency.

### 5.3 The T&M customer disputing hours [FACT]

- "Both the client and contractor struggle when invoices show '180 hours of electrical work' with no way to verify who was actually on-site or when they worked."
- "An invoice that states '40 hours - consulting services - $8,000' provides no basis for client verification, audit, or dispute resolution, as tax authorities and client finance teams both require itemized records."
- The demanded remedy: **line-level time log with date, personnel name or role, task description, and hours for every entry**, plus receipts for reimbursables.
- Best practice for avoiding it: **weekly timesheet approvals before invoicing**, because "clients dispute hours after invoicing when they should have approved earlier."
- Consistent reference IDs across timesheets, receipts and approvals improve "audit readiness."
- Where it goes legal: a firm that can show detailed time logs plus a trail of emails showing the client was informed and did not object is more likely to prevail.
- Scale context: average dispute value in North America rose 42% from 2021 to 2022 (Arcadis 2023 Construction Disputes Report - construction, not IT, but it is the citable number). [FACT]

**Design read for the padding mechanic:** the game already accrues per-customer scrutiny for padding. The truthful refinement is that **granularity is the defense**. A padded entry that carries date + name + task + hours survives challenge; a vague one does not, regardless of whether it was honest. So the player's choice is not just "pad / don't pad" but "how much detail do I write" - and detail costs time, which is itself billable. That is a genuinely nice loop and it is fully sourced.

### 5.4 The gold-tier customer who knows they are gold-tier

- FACT part: tiers are explicitly sold on faster SLAs, 24/7 access, onsite visits and vCIO time, and MSPs are advised to document what each tier includes *and excludes* precisely because customers argue the boundary. Detecting tier-limit overruns is a named practice.
- FACT part: premium vendor plans grant *nameable* rights the customer can cite - designated TAM, priority placement in the escalation queue, 15-minute update cadence, warm handoffs.
- [FOLKLORE] The specific behavior of quoting one's own SLA clause back at the tech mid-incident is universally recognized but I did not land a primary citation. Safe to use; do not present as sourced.

### 5.5 The "always an emergency" client [FACT, weakly sourced / FOLKLORE-adjacent]

A named archetype in service-industry practitioner writing: "every project is critical and needs to be completed yesterday... expects to be your top priority 100% of the time, even though he's well aware you have other clients," with the stated remedy being **not to overpromise**. Also described: clients who "scrutinize every detail of your invoice and try to get as much free work as possible." [FACT that the archetypes are published; the MSP-specific framing is FOLKLORE]

### 5.6 Churn behavior [FACT]

- "Clients who churn from managed service providers almost always cite one of two reasons: they didn't see the value, or they weren't sure about the budget anymore."
- The warning sign is **silence**: "It's often a churn signal when clients who once praised your team barely respond anymore." And: "Without regular QBRs, clients slowly forget why they're paying you. That silence eventually turns into churn."
- "When satisfaction scores trend downward but no one knows the reason, it's a sign your account management system lacks visibility."

**Design read:** the truthful churn signal is the *absence* of tickets and the *absence* of complaints, not an angry escalation. A customer that goes quiet is the one you lose. That is a lovely inversion for a game where the player is trained to treat inbound volume as the threat.

---

## 6. Scrutiny / consequence ladder per segment

Who audits, who escalates, who leaves quietly. Each rung below is either sourced above or marked.

### Internal rank-and-file
Auditor: nobody. Escalation: their own manager, to your manager. Terminal state: resentment and a bad internal-IT reputation (Info-Tech names resentment among non-VIP users as a documented VIP side-effect). [FACT]

### Internal VIP
Auditor: nobody financial. Escalation: **direct to the CIO or the service desk manager, bypassing the process entirely** - documented, not invented. [FACT] Terminal state: a conversation about you that you are not in. This is a pure *reputation* consequence with no paper trail, which is exactly what makes it scary and funny.

### Internal VIR / calendar-critical department
Auditor: the business outcome. Escalation: the incident escalates itself - trucks queue, close slips, payroll misses. Terminal state: a post-incident review where the question is why the exec's earbuds went first. [FACT via the itsm.tools framing]

### MSP fully managed
Auditor: **QBR every 90 days** with "the client's buying committee - typically the CEO, CFO, and IT lead." [FACT] Escalation: account manager. Terminal state: non-renewal citing value or budget. [FACT]

### MSP co-managed
Auditor: **their internal IT, continuously.** They see your tickets, your patch reports, and your RACI violations. Escalation: peer-to-peer first, then IT manager to account manager. Terminal state: functions get pulled back in-house one line of the RACI at a time - a partial churn that is invisible on a renewal date.

### MSP block hours
Auditor: whoever holds the bucket, usually monthly. Escalation: challenge at the point of overage, because "the overages compound." [FACT] Terminal state: renegotiation downward, or conversion to a flat contract on the client's terms. This is the segment where **padding is detected fastest**, because the bucket is a shared visible counter.

### MSP time-and-materials
Auditor: the client's finance team, line by line, after the fact. They require itemized records; so do tax authorities. [FACT] Escalation: refuse to pay the disputed line, then dispute the invoice, then (rarely) litigate on the strength of time logs and the email trail. [FACT] Terminal state: they pay once and never call again - and there is no contract to notice they are gone.

### Enterprise external, premium plan
Auditor: a vendor-management function tracking SLA attainment against the published targets, with the targets in writing on the vendor's own website. Escalation: the **designated TAM / SDM**, then the account exec, then contract renegotiation. [FACT] Terminal state: tier downgrade at renewal (a revenue hit that is visible to your management) rather than departure.

### Enterprise external, CAB-governed
Auditor: **process audit** - was there an approved change record for what you did? Escalation: change management, not support. Terminal state: your emergency change gets retro-reviewed and the finding is that it should have been a normal change. [FACT]

### The general shape
The ladder differs by segment in **who** and **how fast**, but its rungs are the same five everywhere:
`nobody notices` -> `the requester complains` -> `a named intermediary intervenes (manager / account manager / TAM / internal IT lead)` -> `the money is challenged (invoice line, SLA credit, tier)` -> `the relationship ends (renewal, non-renewal, or silence)`.

One asymmetry worth encoding: **internal segments escalate loudly and never leave; external segments escalate quietly and do leave.** That single rule gives the two employer archetypes distinct failure textures without new systems.

---

## 7. Minimal data fields on an arrival to carry all this

Design goal: pure data over existing rails. Everything below is either a small enum or a boolean, and each one is justified by a sourced behavior above. Nothing here needs a new subsystem.

### Tier A - on the CUSTOMER record (set once per customer, not per ticket)

| Field | Type | Values | Carries |
|---|---|---|---|
| `segment` | enum | `internal` \| `msp_client` \| `vendor_account` | Which of the three worlds this arrival lives in. Gates which of the rest apply. |
| `contract_model` | enum | `fully_managed` \| `co_managed` \| `block_hours` \| `time_and_materials` \| `none` | Section 3.1 in one field. Drives scope walls, billing scrutiny, and whether an SLA exists at all. |
| `service_tier` | enum | `bronze` \| `silver` \| `gold` (or `basic`/`business`/`enterprise` on the vendor side) | Response targets, coverage window, onsite rights, and whether they *know* they are gold. |
| `coverage_window` | enum | `business_hours` \| `24x5` \| `24x7` | Derivable from tier, but worth explicit - it is the second-most-varied thing across every real plan checked. |
| `scrutiny_profile` | enum | `none` \| `sla_attainment` \| `hours_bucket` \| `line_item_audit` \| `process_audit` | Section 6. Determines *what* the player can be caught on. Cleanly different per segment, which is the whole point of the taxonomy. |
| `escalation_target` | enum | `none` \| `their_manager` \| `cio_direct` \| `account_manager` \| `tam` \| `internal_it_lead` | Who intervenes when it goes wrong. Names the NPC. |
| `named_contacts` | int (nullable) | e.g. 3 | Vendor-side only. The Atlassian cap. Enables "the person with the problem is not allowed to file." |
| `relationship_health` | 0-100 | | Already implied by the churn mechanic; the churn signal is *declining inbound*, not complaints. |

### Tier B - on the ARRIVAL (per ticket)

| Field | Type | Values | Carries |
|---|---|---|---|
| `requester` | ref | person | Who filed it. |
| `beneficiary` | ref (nullable) | person | Who it is *for*. Non-null = shadow-VIP case. **This single split generates the EA joke.** |
| `priority_source` | enum | `impact` \| `vip` \| `contract_tier` \| `self_declared` | Makes the existing exec-earbuds-vs-finance-team contrast legible to the player instead of implicit. `self_declared` is the "everything is urgent" client. |
| `in_scope` | enum | `in` \| `out` \| `ambiguous` | Drives the refuse / quote / eat-it three-way from 3.5. `ambiguous` is where the game lives. |
| `raci_owner` | enum (nullable) | `us` \| `their_internal_it` \| `shared` | Co-managed only. Distinguishes "command refused" (hard wall, already shipped) from "command succeeded, wrong party did it" (soft wall, complaint arrives later). |
| `change_class` | enum (nullable) | `standard` \| `normal` \| `emergency` | CAB ceremony. Only populated for change-shaped work at CAB-governed customers. |
| `sla_ack_target` / `sla_contact_target` | duration | | Two clocks, not one - per the real MSP table in 3.4. Ack is met by *touching* the ticket. Resolution is "best effort" everywhere in the real world, so do not promise it. |
| `calendar_flag` | enum (nullable) | `month_end` \| `quarter_close` \| `freeze_window` | Section 2.6. Set by date, not by customer. Raises un-deferrability and *lowers* change latitude simultaneously. |

### Tier C - derived, do not store

- **Tone/voice template**: pick from `segment` + `service_tier` + `priority_source`. Fourteen row-combinations in the taxonomy table already have voices written.
- **Consequence ladder rung**: `scrutiny_profile` + `relationship_health`.
- **Response target numbers**: `service_tier` + `coverage_window`. Use real numbers from section 4 - they are already funny.

### Why this is the minimal set

Three fields do most of the work and would be a defensible first slice on their own:
1. `contract_model` - unlocks segments 6-9 and the whole billing-scrutiny differentiation.
2. `scrutiny_profile` - makes the padding mechanic mean something *different* per customer, which is Thread B's core promise.
3. `beneficiary` (separate from `requester`) - one nullable reference that generates the shadow VIP, the delegated request, and a sharper reading of the existing VIP flag.

`priority_source` is the fourth and it is the cheapest comedy in the list: it costs one enum and it lets the player *see* the injustice they already experience.

### What NOT to add
- Do not add per-customer SLA numbers as free-form data. Derive from tier. Real vendors vary only the top severity row (section 4.5) - copying that restraint keeps the table small and is more truthful than inventing a full matrix per customer.
- Do not model resolution-time SLAs as binding. Every real published target checked is an **acknowledgment** target; resolution is "best effort." Binding resolution SLAs would be the one untrue thing in the system.

---

## Sources

Internal IT / VIP:
- [VIR vs. VIP in ITSM: Smarter IT Support Prioritization - itsm.tools](https://itsm.tools/vir-vs-vip-it-support-prioritization/)
- [Design a VIP Experience for Your Service Desk - Info-Tech Research Group](https://www.infotech.com/research/ss/design-a-vip-experience-for-your-service-desk)
- [Service Desk VIP Procedures Template - Info-Tech Research Group](https://www.infotech.com/research/service-desk-vip-procedures-template)
- [White Glove Customer Service: Definition, Examples & How-To - Giva](https://www.givainc.com/blog/white-glove-customer-service/)
- [What is White Glove IT Support? - Coretelligent](https://www.coretelligent.com/blog/what-is-white-glove-it-support-why-do-you-need-it/)
- [Executive IT Support Professional | C-Suite, White-Glove, VIP Support - Dice](https://www.dice.com/job-detail/15caf9a7-4b88-42c6-8c96-581d6d554160)

Change freezes / calendar:
- [The change-window scheduling problem, and how teams actually solve it - changeriskintel.com](https://changeriskintel.com/posts/change-window-scheduling-how-teams-solve-it/)
- [IT Change Freeze: Aug. 8-15 and Aug. 18-29 - UC Berkeley](https://technology.berkeley.edu/node/2797)
- [Month End Close Process: The Practical Definition - Numeric](https://www.numeric.io/blog/what-really-is-the-month-end-close)

MSP contracts / SLA:
- [Co-Managed IT vs Managed IT - FusionTek](https://www.fusiontek.com/co-managed-it-vs-managed-it/)
- [Co-Managed IT: What Stays In-House, What Goes to the MSP - Flamingo](https://www.flamingo.run/blog/co-managed-it)
- [Co-Managed IT: Who Actually Owns What? A Responsibility Matrix - Dr Logic](https://drlogic.com/article/co-managed-it-who-actually-owns-what-a-responsibility-matrix-for-mac-first-businesses/)
- [Co-Managed IT Roles & Responsibilities through A Clear Ownership Matrix - LeafTech](https://www.leaftechit.com/co-managed-it-roles-responsibilities-through-a-clear-ownership-matrix/)
- [MSP Contracts Explained - IT Companies Network](https://itcompanies.net/blog/msp-contracts-explained)
- [MSP Tiered Pricing Model - Flexpoint](https://www.getflexpoint.com/blog/msp-billing/tiered-pricing)
- [MSP SLA Guide: Response Times and Key Best Practices - Louisville Geek](https://louisvillegeek.com/news/managed-service-provider-sla-guide/)
- [Understanding SLAs: Service Level Agreements For MSP Clients - Technology Marketing Toolkit](https://www.technologymarketingtoolkit.com/blog/understanding-slas-service-level-agreements-for-msp-clients/)
- [The Complete Guide to Service Level Agreements (SLAs) for MSPs - ScopeStack](https://scopestack.io/blog/the-complete-guide-to-service-level-agreements-slas-for-msps)
- [How to Handle Out-of-Scope Work Requests - ScopeStack](https://scopestack.io/blog/how-to-handle-out-of-scope-work-requests)
- [Crafting MSP Contracts: Essential Clauses and Best Practices - Syncro](https://syncrosecure.com/blog/msp-contracts/)

Vendor support plans:
- [AWS Support Plans](https://aws.amazon.com/premiumsupport/plans/)
- [Right-Tiering Microsoft Unified Support: Core vs. Advanced vs. Performance - Redress Compliance](https://redresscompliance.com/right-tiering-microsoft-unified-support-core-vs-advanced-vs-performance-tiers/)
- [Microsoft Support Ticket Severity Levels - US Cloud](https://www.uscloud.com/blog/microsoft-support-ticket-severity-levels-what-you-should-know/)
- [Premier Support Offering Details - Atlassian](https://confluence.atlassian.com/support/premier-support-offering-details-593035672.html)
- [Atlassian Support Offerings](https://confluence.atlassian.com/support/atlassian-support-offerings-193299636.html)
- [Premier Success Plan Guidance - Salesforce Trailhead](https://trailhead.salesforce.com/content/learn/modules/premier-success-plans/resolve-issues-fast-with-premier-support)
- [Salesforce Support and Success Plans - salesforcenegotiations.com](https://salesforcenegotiations.com/salesforce-support-and-success-plans-how-to-get-the-best-value-from-your-support-contracts-and-services/)

CAB / change:
- [What is Change Advisory Board (CAB)? - Freshworks](https://www.freshworks.com/freshservice/change-advisory-board/)
- [Change Advisory Boards in 2026: Roles, Challenges, and Best Practices - Faddom](https://faddom.com/change-advisory-boards-in-2026-roles-challenges-and-best-practices/)
- [What is the Change Advisory Board (CAB)? - InvGate](https://invgate.com/itsm/change-management/change-advisory-board)

Behavior / billing disputes / churn:
- [MSP Best Practices: When Clients Call Your Techs Instead of the Helpdesk - Giant Rocketship](https://giantrocketship.com/blog/msp-best-practices-when-clients-call-your-techs-instead-of-the-helpdesk)
- [Time and Materials Contracts: Billing, Pricing, and Best Practices - Invoice Fly](https://invoicefly.com/academy/time-and-materials/)
- [T&M Billing Guide for Construction Contractors - SmartBarrel](https://smartbarrel.io/blog/time-materials-billing-guide)
- [Time and Materials (T&M) Contracts - NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/time-materials-contract.shtml)
- [MSP Quarterly Business Review (QBR) Guide - LTVplus](https://www.ltvplus.com/msp/msp-qbr-guide/)
- [MSP QBR: Guide to Quarterly Business Reviews for MSPs - MSP360](https://www.msp360.com/resources/blog/msp-qbr/)
- [MSP Account Management: Reduce Churn & Grow Revenue - Foxcrow Group](https://www.foxcrowgroup.com/solutions/msp-account-management/)
- [How to Deal with Difficult Clients - Teamly](https://www.teamly.com/blog/how-to-deal-with-difficult-clients/)
