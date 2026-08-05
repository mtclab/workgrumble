# Design: employers, customers, estates - the three-axis world model

**Dated 2026-08-05. Grounds owner's refinement (2026-08-05): "customers with
different services - some SD, some server upkeep, some monitoring, some cloud"
and "research what kind of estates we build; what I gave you is the minimum."**

Backed by three research syntheses (transcripts in the session; sources cited
inline below). This doc is a PROPOSAL for convergence, not a locked decision -
house rule: ideas are discussions.

## The finding

What looked like one feature ("add Linux servers") is actually the game's whole
mid-to-late structure. Real IT work is organised on THREE independent axes, and
the game's remaining epics (E5 employer switching, E6 sysadmin, E7 cloud) all
live inside them. Modelling the three axes cleanly is what makes those epics
content instead of rewrites.

### Axis 1 - EMPLOYER archetype (who pays the player, and your relationship to estates)

From the service-delivery research. An employer is an IT-services *business* with
an archetype that decides how many estates you touch and how:

| Archetype | Estates you touch | Character | Fits |
| --- | --- | --- | --- |
| In-house / corporate IT | ONE (the company's own) | depth of one stack, same faces daily, becomes "strategic partner" | the current probation shop, as-is |
| MSP (managed services) | MANY customer estates | context-switching, T1->T2->T3 ladder, SLA-bound, proactive | **the junior on-ramp** - the richest archetype |
| Break-fix / solo | one job, then walk away | reactive, per-incident, no ongoing access | Bodgeworth's character |
| Product / SaaS - corporate IT | ONE office estate | Mac-heavy laptops, SaaS admin | a later employer |
| Product / SaaS - SRE / platform | the company's OWN product infra | on-call, SLOs, cloud-native, software-eng bar | E6/E7 territory, a DIFFERENT job than SaaS corporate IT |
| MSSP | many, security-only | SOC shifts, alert triage, IR | a specialisation branch |
| Cloud / DevOps consultancy | project engagements | migrations, billable hours, hand off and leave | E7 |

The classic career (T1 helpdesk at an MSP -> T2 -> T3 -> sysadmin / cloud / SRE,
or MSP -> in-house for depth) IS the game's title ladder. The employer archetype
is the META-progression that employer switching (0.6.0) already moves the player
between.
[Sources: cyberhusky.io, superops.com, crowdstrike MSP-vs-MSSP, tigera SRE-vs-platform, msp360 helpdesk tiers.]

### Axis 2 - CUSTOMER service-scope (what you're allowed to DO for them)

From the service-catalog research. For MSP/break-fix employers, each CUSTOMER
buys a scope, and the scope is a HARD CONSTRAINT on the player's actions - the
single most gameplay-relevant finding. This generalises the 0.7.0 "you can't
touch that box" honesty from OS to CONTRACT:

| Scope | What the player may do | What is OUT OF SCOPE (game refuses, truthfully) |
| --- | --- | --- |
| Monitoring-only / NOC-lite | watch the alert board, acknowledge, ESCALATE / notify the customer | fixing anything - remediation is not contracted; the move is to raise it, not solve it |
| Managed helpdesk / SD | tickets, password resets, workstation-level admin (this is where the player STARTS) | servers, infrastructure - a Tier-1 account by design (PAM: workstation-only creds never cross into server tier) |
| Managed infrastructure | server/network admin, patch windows, maintenance | security-incident authority, end-user tickets maybe out |
| Co-managed | act ALONGSIDE the customer's own IT - shared creds, must coordinate | acting unilaterally; you fill gaps (T3, after-hours), they own T1/T2 |
| Fully managed | the whole stack, all creds, own the outcome | nothing - you ARE their IT |
| Break-fix | the one job you were called for | anything else; no ongoing access, walk away after |
| MSSP / security | SOC alerts, IR playbook, security tools | general infra - security scope only |
| BDR | backup verification, DR test drills, (rarely) a real failover | - |
| Cloud management | the tenant/console the customer DELEGATED (Azure Lighthouse: exactly what was granted) | anything outside the delegation |

This is the same honesty engine as 0.7.0's cross-OS refusals, driven by a second
field. A monitoring-only customer whose product is down = you get the alert, you
escalate, and the game REFUSES a fix with a true reason ("not contracted; raise
it"). That refusal is gameplay, not a wall - it teaches the shape of the job.
Access maps to real PAM tiering (T1 workstation accounts vs T2 server/cloud admin
accounts, never crossed) - the same thing that gates the player's TITLE.
SLA is already P1-P4 in the game; pricing (per-user / per-device / tiered) feeds
the timesheet/utilisation mechanic already designed.
[Sources: getflexpoint monitoring-only, securden PAM tiers, MS Learn Azure Lighthouse, meriplex co-managed, brocent P1-P4 SLA.]

### Axis 3 - CUSTOMER business-type (what their estate IS MADE OF)

From the estate-composition research. Business type DETERMINES the estate, and
each type is a CURRICULUM MODULE - the north-star learning claim, made concrete:

| Business type | Estate shape | Teaches | OS mix |
| --- | --- | --- | --- |
| Law / accounting firm | 1-2 Windows Servers (AD DC + file/print), M365, Windows-only LOB apps | AD, M365, the Windows monoculture | **Windows-only** (purest) |
| Dental / clinic | locked-down Windows, imaging server, practice-mgmt DB, HIPAA segmentation | compliance, segmentation | Windows-only |
| Retail / multi-site | per-store stack, POS (Win/Android), LTE failover, VLAN/PCI segmentation | networks, multi-site, POS | Windows + embedded |
| Generalist SMB | AD + file + maybe SQL, M365, Mac pockets | hybrid identity (AD + Entra Connect) | Windows-dominant + Mac |
| Manufacturing / logistics | Win ERP/WMS + SQL, rugged handhelds, OT (PLC/SCADA), IT/OT firewall | OT segmentation, ERP/WMS | Windows office + Linux/embedded OT |
| Creative / media agency | Mac ~100%, 10GbE NAS, Jamf, Adobe CC | Mac fleet mgmt (Jamf), the INVERSE estate | **Mac-heavy** + Windows admin |
| SaaS / software company | Linux prod fleet in cloud + Mac laptops + light Windows office | Linux, cloud, IaC - two estates (SRE vs corporate IT) | **Linux prod + Mac laptops** |
| Cloud-native startup | laptops (Mac) + Google/M365 + SaaS, ~zero on-prem | SaaS/IdP admin, cloud-first | Mac + Linux-in-cloud |
| Enterprise branch | full AD forest, IIS, SQL Server, Exchange hybrid, VMware, SAN | the full classic Windows stack at scale | Windows-heavy + Linux appliances |

This is where Windows/Linux/Mac EARN their place truthfully: a law firm is
Windows because law firms ARE; a creative agency is Macs because they ARE; the
product runs on Linux because it DOES. The OS skins (the original E5 idea) stop
being costumes and become the estates the work happens in.
[Sources: attorneyatwork law-firm IT, cubittech design-agency Mac, AWS startup architecture, Dell IT/OT shop-floor, DEV AD-forest design, isdecisions AD-vs-Entra.]

## How this maps to what exists + what's built

- **0.7.0 (built, committed local, NOT pushed)** = the ESTATE SUBSTRATE: os
  dimension, Win/Linux server roles, os-aware service baselines, cross-OS
  honesty. It survives whole. In the three-axis model it is: "an estate can be
  Windows + Linux, and tools refuse across families truthfully." That is axis-3
  machinery + the honesty engine axis-2 will reuse. Nothing wasted.
- **0.6.0 employer switching** = axis-1 movement, already shipped. Employers
  already carry per-employer policy/channel/estate. Archetype is one more field.
- **SLA P1-P4, timesheets/utilisation, title-as-difficulty, boss/suspicion** =
  all already designed or shipped; axis-2 scope and axis-3 variety feed them
  rather than replacing them.
- **E6 sysadmin / E7 cloud** = the upper reaches of axis-1 (SRE/cloud archetypes)
  and axis-2 (infra/cloud scopes) and the tools they unlock (ssh, systemctl,
  the cloud console). The player's Linux DESKTOP + Linux-server management still
  gate here.

## Phasing recommendation (the convergence question)

The full three-axis model is the game's whole remaining spine - not one version.
It must phase in without a rewrite. Two honest paths:

**Path A (recommended) - substrate now, customers as the MSP employer next.**
Ship 0.7.0 as the heterogeneous ESTATE for the CURRENT in-house employer (the
probation shop is in-house corporate IT - one estate, which the built 0.7.0 fits
exactly). Then introduce the CUSTOMER / service-scope / business-type model as
its own arc via a NEW employer archetype: an MSP employer, where customers are
first-class, each with a scope (axis 2) and a business-type estate (axis 3).
This is exactly how Bodgeworth was introduced - a new employer - and it keeps
every slice complete and shippable. The junior-at-an-MSP reality (research: the
classic on-ramp) becomes a mid-game employer the player switches to.

**Path B - reframe now.** Make customer/contract/business-type the core world
model immediately and retrofit the current employers as estates/customers.
Bigger, delays shipping, but centres the model sooner. Risk: a large rewrite of
company.ts/second-company.ts before the payoff is playable.

My read: Path A. It respects "complete slices, no rush," keeps the built estate
substrate shippable, and the customer model is big enough to deserve its own
well-scoped arc rather than being crammed into an estate slice. It also matches
the career truth - you don't start by architecting an MSP; you start on a
helpdesk and grow into the breadth.

Open sub-questions for whichever path (decide at build time, per axis):
- Is the probation shop in-house, or already a small MSP? (Path A says in-house.)
- How many customer business-types to ship first (start with 2-3: a Windows-only
  law firm, a mixed SMB, a SaaS/Linux shop - the three OS-mix poles).
- Does scope-of-touch refusal reuse the exact 0.7.0 honesty surface? (Yes - same
  engine, second field.)
