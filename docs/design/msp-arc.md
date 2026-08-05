# Design: the MSP employer arc (customers, scope-of-touch, multi-tenancy)

**Dated 2026-08-05. Builds on docs/design/estate-and-customers.md (the three-axis
model). Grounded in six research syntheses (two rounds; sources cited inline).
Owner: "my suggestions are the bare minimum - research and plan." This is the
plan for the game's biggest structural arc.**

Proposal for convergence, not locked - ideas are discussions.

## The shape

A NEW employer archetype (Path A, owner-decided): an **MSP** - a Managed Service
Provider serving many customer companies. The player is a Tier-1 tech on its
service desk. This is a THIRD employer alongside the in-house probation shop and
break-fix Bodgeworth (introduced the way Bodgeworth was - a new employer on the
0.6.0 registry), NOT a reframe of what ships today. It is also the real junior
on-ramp the round-1 research named: helpdesk at an MSP is where the career starts.

The arc is large. It phases across versions; this doc defines the SPINE and the
first version, then the backlog.

## The one big new idea, and why it is cheap

Almost everything MSP work needs, the game already has. The round-2 tooling
research maps the real MSP stack onto surfaces that already ship:

| Real MSP tool | What it does | Already in Workgrumble |
| --- | --- | --- |
| PSA (ConnectWise/Autotask/Halo) | ticket queue, SLA timers, time entry, billing | the tickets app + P1-P4 SLA + the timesheet/utilisation mechanic (designed) |
| RMM (NinjaOne/Datto) | endpoint monitoring, alerts, remote | the estate + a monitoring board is the one genuinely new surface |
| IT Glue / Hudu | per-customer runbooks, passwords, assets | the KB + the estate (per 0.7.0) |
| ScreenConnect / Splashtop | remote into a customer's box | the remote/RDP surface already used |
| Service boards, escalation | tier routing, "waiting on customer", SLA pause | the ticket lifecycle already has states |

So the NEW world concept is essentially ONE thing: the **CUSTOMER**, and a few
mechanics that hang off it. That is what makes a huge-sounding arc buildable in
slices.

## The CUSTOMER entity (first-class)

A customer is a company the MSP serves. It carries:

- **business-type** -> its ESTATE (reusing the 0.7.0 os/role machinery whole):
  a Windows-only law firm, a SaaS/Linux shop, a Mac creative agency, a clinic,
  etc. The estate research (round 1) + the ticket research (round 2) give real
  compositions and real tickets per type.
- **service-scope / contract** -> what the player may DO: monitoring-only /
  helpdesk / co-managed / fully-managed. This is the axis-2 constraint.
- **SLA tier** (Bronze/Silver/Gold) x severity (P1-P4) -> response/resolution
  clocks (the game's SLA already has severities; tier is a multiplier).
- its own **estate, credentials/context, and ticket stream**.

## The mechanic: scope-of-touch as an RBAC-403, not flavour text

The scope research is unambiguous: real scope is enforced like Azure Lighthouse /
GDAP - "access denial isn't a policy note, it's an RBAC 403." So in-game, scope
is a real permission check, and an out-of-scope action REFUSES with the true
reason - the SAME honesty engine 0.7.0 shipped for cross-OS refusals, generalised
from OS to CONTRACT. The refusal reasons are all real:

| Situation | Truthful refusal |
| --- | --- |
| Monitoring-only customer, you try to fix | "This account is monitoring-only. The contract is notify-and-escalate; remediation is out of scope until it is authorised as billable work. Raise it." |
| Helpdesk scope, you reach for a server | "Helpdesk covers workstations and users here. Servers are not in this contract - escalate, or the customer engages their infrastructure provider." (PAM tiering: workstation creds never cross to the server tier.) |
| Co-managed, you act unilaterally | "This is co-managed. Their own IT owns this - notify them first; the RACI says this is theirs." |
| Anything risky/out-of-scope | "That needs a change request: scope, risk, rollback, sign-off. You do not have authorisation yet." |

This is not a wall - it is the shape of the job, taught by the world refusing,
exactly as the 0.7.0 Linux refusals teach "there is another toolset." And it
COMPOSES with 0.7.0: a helpdesk player at the SaaS customer who tries to touch
the Linux prod fleet is refused on BOTH counts (not your OS family AND not your
contract scope) - the two honesty engines stack truthfully.

## The mechanic that writes its own comedy: "which customer am I in?"

The single sharpest finding across all research: MSP work is defined by
context-switching across customers, and the NAMED danger is acting in the WRONG
customer's environment. Real tooling runs a pre-action tenant-match check that
"halts the script if a mismatch is detected." In-game this becomes a mechanic
that is funny, tense and true at once: you have a CURRENTLY-SELECTED customer
(loaded from the ticket you opened), and an action aimed at a machine belonging
to a DIFFERENT customer gets caught by a pre-flight check - "STOP. FONTAINE-LAW
is on your screen but WHOUSE-01 belongs to MERIDIAN-LOGISTICS. Are you in the
right customer?" A rushed player who ignores it and acts in the wrong tenant is
the MSP horror story, made mechanical. High value, cheap to build (one guard).

## What reuses what (no rebuilds)

- Estate = 0.7.0 (os/role/services), now OWNED BY a customer instead of "the
  company." Each customer gets its own estate stood up.
- Tickets/SLA/lifecycle = existing, plus a `customer` field.
- Scope refusals = the 0.7.0 honesty engine, second dimension.
- Interruptions/walk-ups = the "customer calls you direct bypassing the ticket"
  frustration is an existing interruption variant.
- Timesheets/utilisation (designed) = the billable-vs-non-billable pressure MSP
  techs are scored on; scope-creep unbilled work feeds it.

## Version phasing (the spine, then the backlog)

**0.8.0 - the MSP employer + the customer dimension + scope-of-touch (the spine).**
Introduce the MSP as a third employer. Ship 2-3 customers spanning the poles: a
Windows-only law firm (helpdesk), a SaaS/Linux shop (helpdesk, prod out of reach
- reuses 0.7.0), and ONE monitoring-only account (the sharpest scope contrast:
you get the alert, you may only acknowledge + escalate). The ticket queue gains a
customer dimension; opening a ticket loads that customer's context. Scope-of-touch
refuses out-of-contract actions truthfully. The "wrong customer" pre-flight guard.
A starter set of REAL tickets per customer (from the vertical research), each
scoped correctly. This is complete and playable: a day at an MSP, three customers,
the scope constraint felt.

**Backlog (later versions, one slice each):**
- More verticals: the Mac creative agency (teaches Jamf/Adobe/fonts), the dental
  clinic (imaging bridge, the backup-verification gap, HIPAA-adjacent tension).
- The change-request / authorisation moment (scope -> risk -> rollback -> sign-off
  -> maintenance window) as a real gate on risky/out-of-scope work.
- The RMM/monitoring board as a richer surface (alert triage, alert fatigue, the
  noisy-threshold comedy), feeding E6 on-call.
- Customer ONBOARDING content (discovery/audit of a messy new client; the "their
  backups were never actually working" horror-discovery).
- Co-managed coordination (the notify-internal-IT step; the RACI "I thought you
  had it" gap).
- SLA-per-customer tiers (Bronze/Silver/Gold), the service-credit consequence,
  the clock pausing on "waiting on customer".
- The e-filing-deadline / chairside-reliability class: tickets where the SLA is
  genuinely career-consequential for the CUSTOMER, not just a meter.

## Open sub-questions for 0.8.0 (converge before build)

1. Which 2-3 customers first? Recommend: law firm (Windows-only helpdesk) + SaaS/
   Linux shop (helpdesk, prod out of reach) + one monitoring-only account. The
   three make the scope + OS + tenant mechanics all legible on day one.
2. Does 0.8.0 include the monitoring/RMM BOARD as a surface, or does monitoring-
   only start as a scope-refusal on the existing ticket/estate surfaces with the
   board deferred? Recommend: refusal first, board its own later slice (keeps
   0.8.0 to the customer dimension + scope, not a whole new app).
3. Is the MSP a switch-to employer (via the existing 0.6.0 offer/switch) or does
   the player start there in a new game? Recommend: a switch-to employer, reached
   the way Bodgeworth is - the arc is the same career the game already moves through.
