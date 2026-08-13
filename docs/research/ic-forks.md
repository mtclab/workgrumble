# THREAD - the IT-shaped IC specialisation forks

Research for WORKGRUMBLE, E9. Question set by the owner at D5 (2026-08-12): the
management track is parked (konttori's game), but the fork is still wanted -
"IT-shaped ones: IC specialisation tracks (the security / infra / cloud flavour
of senior, not 'just a small team')". So: where does an IT career actually
specialise, into what, what does each specialism DO that a generalist engineer
does not, and which of them is a different GAME rather than a different set of
ticket titles.

Date: 2026-08-13. Method: web research (SFIA 9 skill definitions, vendor
certification pages, published post-mortems, industry surveys, practitioner
writing), plus a read of the shipped code the recommendations have to land on.

Companion to `docs/research/titles-work-shape.md` (thread A, the LEVEL axis)
and `docs/design/titles-difficulty.md` (the rung table, D1-D6). Thread A asked
what changes as you go UP. This asks what changes as you go SIDEWAYS.

## Evidence conventions used throughout

- **[FACT]** - a number or definition traceable to a named source. URL given.
- **[FOLKLORE]** - practitioner consensus from blogs, vendor writeups, industry
  press. Directionally reliable, numerically not.
- **[DESIGN]** - my synthesis / proposal for the game. Not sourced, never to be
  presented in-game as a "real number".

**Method caveats that matter.**

1. The session's web-search budget ran out partway through. Everything below is
   either a page fetched directly or a claim returned by a research lane with
   its URL. Where a figure could not be verified from the primary vendor page it
   says so, by name, in the text. **Three numbers are flagged DO-NOT-SHIP-UNVERIFIED**
   and are listed together in section 3.5.
2. reddit.com remains blocked to this tool, so the folklore grade is the same as
   thread A's: the industry talking about itself, sometimes with a product to
   sell.
3. cisco.com, gartner.com, bls.gov, skillsoft.com and cisa.gov all return 403 to
   automated fetch. Claims sourced through them are tagged with that fact where
   they are load-bearing.

---

## 0. The finding, before the detail

The rung table is one axis of a framework that has two, and the industry
publishes both. **SFIA is a grid**: seven Levels of Responsibility (thread A
section 0, already the game's rung table) crossed with a catalogue of named
professional SKILLS, each defined only at the levels where it is a real job.
[FACT] "Levels of responsibility ... represent increasing responsibility,
accountability and impact in the workplace"; professional skills are separately
"defined at relevant levels of responsibility" because "not all skills are
defined at all seven levels, aligning with actual workplace needs".
https://sfia-online.org/en/about-sfia/how-sfia-works

So the fork is not a branch off the ladder. **The fork is the second axis of the
same table**, and the game already has the first axis as data (`src/world/titles.ts`).
That is the cheapest structural finding in this document and everything else
hangs off it.

The second finding is that the level ranges are not the same per skill, and the
differences are the honest answer to "which forks have a ceiling":

| SFIA 9 skill | Code | Defined at levels | Source |
|---|---|---|---|
| Information security | SCTY | **2-7** | https://sfia-online.org/en/sfia-9/skills/information-security |
| Security operations | SCAD | **1-6** | https://sfia-online.org/en/sfia-9/skills/security-operations |
| Infrastructure design | IFDN | **2-6** | https://sfia-online.org/en/sfia-9/skills/infrastructure-design |
| Network design | NTDS | **2-6** | https://sfia-online.org/en/sfia-9/skills/network-design |
| Infrastructure operations | ITOP | **1-5** | https://sfia-online.org/en/sfia-9/skills/infrastructure-operations |
| Network support | NTAS | **1-5** | https://sfia-online.org/en/sfia-9/skills/network-support |
| Database administration | DBAD | **2-5** | https://sfia-online.org/en/sfia-9/skills/database-administration |

[FACT, all seven fetched 2026-08-13.] Read the column: **every OPERATE skill
stops at level 5 and every DESIGN skill runs to 6, and only security's governance
skill reaches 7.** The framework is saying, in its own structure, that you cannot
be promoted indefinitely for running things - only for deciding things - and that
security is the one specialism whose governance arm goes all the way to the top
of the ladder. That is thread A's "the IC ladder narrows" finding, restated by a
different body, per-fork, and it is a directly authorable difficulty statement.

Third finding, the one that decides the recommendation: **one of the forks is
already half-built and nobody called it a fork.** `src/world/monitoring.ts` ships
a board whose rows are `'alert' | 'noise'`, whose "whole verb set is acknowledge
and escalate", which has "no fix - by contract and by design", and whose noise is
deterministic and self-clearing while real alerts are not. That is a verdict
queue. A verdict queue over a noisy stream, scored on triage rather than on
fixing, IS the security-operations loop. See section 5.

---

## 1. THE FORK POINT

### 1.1 The generalist-until-senior claim is true, and the number exists

**[FACT]** ISC2's 2024 Cybersecurity Workforce Study: **70% of new entrants to
cybersecurity come from an IT role**; 18% come from a non-IT position. The
workforce is estimated at 5,468,173 (a 0.1% increase on 2023, down from 8.7%
growth the year before), against a gap of 4,763,963 (up 19.1%). 25% reported
layoffs in their security departments, 37% budget cuts, 67% staffing shortages,
and 90% reported one or more skills gaps on the team.
https://www.isc2.org/Insights/2024/10/ISC2-2024-Cybersecurity-Workforce-Study

That 70% is the load-bearing sentence for the game's fiction: **the security
specialist used to work the desk.** The fork is entered from where the player
already is, not from a different school. Note also the tonal gift in the rest of
that paragraph - the "critical skills shortage" is being reported alongside
layoffs and budget cuts by the same respondents, which is exactly the kind of
true, unresolvable thing this game likes.

### 1.2 Where the fork sits relative to our rung table

Three sourced anchors put it after Systems Engineer and at-or-before Senior
Engineer:

- **[FACT]** SFIA's operate/design split above: `ITOP`/`NTAS` end at level 5 and
  `IFDN`/`NTDS` begin at level 2 but only become the WHOLE JOB where operations
  runs out. Level 5 is "Ensure, advise" - thread A already mapped that to Senior
  Engineer.
- **[FACT]** Thread A's dual-ladder sources put the split at senior: "Where the
  two tracks split is the ceiling, not the floor."
  https://hroasis.com/tech-career-paths-ic-vs-manager-2026/
- **[FACT]** SANS's SOC-tier literature and the Tier-1/2/3 vendor definitions run
  a whole junior ladder INSIDE security (see 2.1), i.e. security is unusual in
  having its own bottom rung rather than only a senior fork. `SCAD` being defined
  from level 1 is the framework agreeing.

**[DESIGN] Recommendation: the fork lands ON the senior_engineer row, not
between rows.** In our table, `senior_engineer` currently has one shape break
("you approve other people's changes and eat their blast radius; two clocks that
cannot both be green"). Make the fork a CHOICE MADE AT that promotion: the same
rung, a different specialism, and the shape break becomes fork-specific. That
keeps the ladder seven rungs long, keeps D1's select honest, and means the fork
costs no new rung, no new PAM tier and no `isSystemsEngineer`-style boolean
audit (the trap named in DE7-13).

### 1.3 The counter-truth: early tracking exists and it is a trap

**[FACT]** The certification gate can force a specialism before anyone chooses
one. The US DoD's baseline-certification regime made an IAT-level certificate the
precondition for *privileged access*, not merely for a job title: personnel not
qualified "within 6 months ... shall not be permitted privileged access", and
contractors "shall obtain the appropriate DoD-approved IA baseline certification
prior to being engaged". DoD 8570.01-M was formally cancelled and replaced by
DoDM 8140.03 (15 Feb 2023), which is harsher on contractors still - "Contractors
must be qualified in accordance with this issuance at the commencement of work" -
and which gives 9 months to foundational and 12 months to resident qualification,
after which personnel "must be removed from duties associated with the work role".
https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/857001m.pdf and
https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/814003p.pdf

**[FOLKLORE]** And the industry has not noticed: job boards and MSP hiring copy
still say "8570 IAT II" three and a half years after the document died. That is a
free joke with a real citation behind it.

**[FACT]** The vendor-partner version, which is the MSP-flavoured one and
therefore ours: Microsoft's Solutions Partner for Security designation contains
two steps that are mandatory but worth **zero points** - two people must hold the
security-engineer certification and two the security-operations-analyst
certification - and Microsoft's own worked example ends "Total points = 0" when
one body is missing.
https://learn.microsoft.com/en-us/partner-center/membership/solutions-partner-security
AWS's tiers are headcount too: Select 2 certified individuals, Advanced 6 (at
least 3 Professional or Specialty), Premier **25** technical certified (at least
10 Professional or Specialty).
https://aws.amazon.com/partners/services-tiers/

### Feeds game

**[DESIGN]** The fork offer should arrive as a BUSINESS need, not a careers
conversation, because that is what the partner-tier data says actually happens.
The MSP needs two certified bodies to keep a partner tier it is already selling
against; the player is one of the two bodies available; the "choice" arrives
pre-shaped. That is truer, funnier and cheaper than a skill-tree screen, and it
reuses the shipped offer beat.

---

## 2. THE TRACKS, HONESTLY ENUMERATED

Six candidates. Each gets: the day at senior grade, **the QUEUE shape break**
(the thread-A question, asked sideways), 2-3 signature work classes we could
author, the shipped rails that carry it, and what is genuinely new engine.

### 2.1 SECURITY (SOC analyst -> security engineer -> the CISO-adjacent IC)

**The day.** Security is the only fork with a published internal ladder, and it
is a triage ladder: Tier 1 monitors and triages alerts, Tier 2 investigates what
Tier 1 passes up, Tier 3 hunts for what nobody alerted on. The escalation
boundary is *confidence*, not permission - which is the exact inverse of the L1/L2
boundary the game already ships (thread A section 3: L2 = system-level access).
[FOLKLORE, vendor-definitional; the specific vendor explainer pages I tried
(CrowdStrike, Splunk, Exabeam) all 404'd or 403'd on fetch this session, so the
tier taxonomy is asserted here from the survey literature below rather than from a
single citable definition page. **Flagged: if this fork is greenlit, re-source the
tier definitions before authoring copy off them.**]

**[FACT]** What the day is measurably made of: Tines' Voice of the SOC 2023
(n=900 full-time security professionals, companies of 200+, US/UK/Ireland/
Benelux/Nordics) - **63% report some level of burnout, one in five "very burned
out"; 55% say they are likely to switch jobs within the year; 25% spend more than
half their time on tedious manual work** (down from 64% in 2022); 93% believe
more automation would improve work-life balance. The tasks they most want
automated are intelligence analysis (17%), threat hunting (12%), EDR (11%), risk
assessments (11%), vulnerability management (10%).
https://www.tines.com/reports/voice-of-the-soc-2023/

**[FACT, already in thread A and load-bearing here]** In security operations
specifically, **46% of alerts are false positives**, and 63% of organisations
fight duplicate alerts. https://www.vectra.ai/topics/alert-fatigue

**THE QUEUE SHAPE BREAK: the queue stops being work and becomes EVIDENCE.** At
every other rung an arrival is a thing to fix. In security operations an arrival
is a thing to *decide about*, most of them are nothing, and the score is the
quality of the verdict rather than the speed of the fix. Nothing in the game does
this today except - see below - the monitoring board, in miniature.

**Signature work classes, authorable:**

1. **The verdict queue.** A stream where the majority are benign, the tell is
   findable, and closing one as "no action" is a POSITIVE outcome. Sourced tuning
   anchor: 46% false positives in security ops (Vectra), 2-5% of ~50 weekly
   alerts actionable (thread A section 4.3). The comedy is that the correct play
   most of the time is to do nothing, and the boss's patrol does not understand
   that.
2. **The pyramid-of-pain escalation.** David J. Bianco, 1 March 2013 (updated
   17 Jan 2014): six indicator classes, bottom to top - hash values, IP
   addresses, domain names, network/host artifacts, tools, TTPs - ordered by what
   they cost the ADVERSARY. Hashes are "the most accurate type of indicator" but
   "any change to a file ... results in a completely different hash value";
   blocking at the top forces the adversary to do "the most time-consuming thing
   possible: learn new behaviors".
   https://detect-respond.blogspot.com/2013/03/the-pyramid-of-pain.html
   **[DESIGN]** This is a ready-made scoring ladder: the same incident can be
   closed at six different heights, the cheap close works and expires, and the
   expensive close is the one that stops the thing recurring in a later week. It
   is the KB-authoring compounding mechanic (thread A section 2) pointed at an
   adversary instead of at juniors, and it is *sourced*.
3. **The security tool that causes the outage.** CrowdStrike, 19 July 2024:
   Channel File 291 deployed 04:09 UTC with two new IPC Template Instances; "due
   to a bug in the Content Validator, one of the two Template Instances passed
   validation despite containing problematic content data"; the Content
   Interpreter hit "an out-of-bounds memory read triggering an exception ...
   resulting in a Windows operating system crash (BSOD)"; reverted 05:27 UTC, a
   78-minute window.
   https://www.crowdstrike.com/en-us/blog/falcon-content-update-preliminary-post-incident-report/
   Microsoft, 20 July 2024: "We currently estimate that CrowdStrike's update
   affected 8.5 million Windows devices, or less than one percent of all Windows
   machines."
   https://blogs.microsoft.com/blog/2024/07/20/helping-our-customers-through-the-crowdstrike-outage/
   **[DESIGN]** The best security ticket available to us, because the fix is a
   DESK job (boot to safe mode, delete a file, on every machine) while the cause
   is a security job, and our estate already has machines and our MSP already has
   customers who will each want theirs first.

**Which shipped rails carry it.** More than any other fork:
- `src/world/monitoring.ts` - the board is already `'alert' | 'noise'`, already
  has no fix verb, already carries deterministic self-clearing noise against
  standing real alerts, and already reads status live off estate nodes rather
  than holding a copy. The security verdict queue is this module generalised from
  RMM checks to detections.
- E8's whole design doc (`docs/design/org-dysfunction.md`) is security content
  already specified: the BEC ordered response, the inbox-rule hunt, the access
  recertification, the VIP MFA exception. `src/world/bec.ts`, `mail_rule` nodes
  and `src/world/recert.ts` ship.
- `src/world/incidents.ts`, `postmortem.ts`, `on-call.ts`, the P1 machinery and
  the break-glass counter - an incident is an incident.
- The customer/scope engine gives the multi-tenant version for free: a detection
  fires in one tenant, and the "which customer am I in" pre-flight guard already
  exists.

**What is genuinely new.** (a) A verdict as a first-class close reason - today
every ticket closes by a fix or an escalation, and "correctly nothing" has no
representation. (b) An adversary that is not a fault: something in the world that
is actively hidden rather than merely broken, which is a content-authoring shape
the solvability auditor has never had to reason about. (c) A `security` work kind,
because `work-kinds.ts` currently lists `security` in `PAPERWORK` and has no
verb family that would class a detection - see 5.4.

**The CISO-adjacent IC, honestly.** SFIA says this arm goes to level 7 (`SCTY`
2-7) where every other fork's design skill stops at 6. What the role does, from
aggregated Security Architect JDs: "Develops, communicates, maintains, and
enforces the overall security architecture"; "Monitor each phase of software
development process and attest to successful completion of each security
requirement"; performs risk assessments and security architecture reviews;
produces "design and architecture documents for technical governance review",
threat models, and incident response plans.
https://www.velvetjobs.com/job-descriptions/security-architect
**[DESIGN]** Read that list against thread A's architect rung and they are the
same job with a different noun - which is the honest finding, and the reason the
security fork's TOP does not need separate machinery from the architect rung. The
fork differs at the middle, not at the top.

### 2.2 INFRA / PLATFORM (sysadmin -> SRE / platform engineer)

**The day.** **[FACT]** Google's own framing: "SRE is what happens when you ask a
software engineer to design an operations team", 50-60% of Google SREs are
standard software engineers and the remainder are engineers with deep "UNIX
system internals and networking (Layer 1 to Layer 3)" - i.e. the second group is
the sysadmin lineage, hired for it explicitly. Scope list: "availability, latency,
performance, efficiency, change management, monitoring, emergency response, and
capacity planning". https://sre.google/sre-book/introduction/ and
https://sre.google/workbook/how-sre-relates/

**[FACT]** Platform engineering is a different customer, not a different stack:
"the discipline of designing and building toolchains and workflows that enable
self-service capabilities for software engineering organizations"
(https://platformengineering.org/blog/what-is-platform-engineering); Team
Topologies' platform team provides "a compelling internal product to accelerate
delivery by Stream-aligned teams" consumed as X-as-a-Service
(https://teamtopologies.com/key-concepts); CNCF's platform attributes include
"documentation and onboarding", "self-service on demand" and "reduced cognitive
load for users" (https://tag-app-delivery.cncf.io/whitepapers/platforms/) - none
of which appear in an SRE or sysadmin brief.

**[FACT]** Gartner predicted "by 2026, 80% of software engineering organizations
will establish platform teams", up from 45% in 2022 (Hype Cycle press release,
28 Nov 2023; gartner.com 403s direct fetch, text via search index).
https://www.gartner.com/en/newsroom/press-releases/2023-11-28-gartner-hype-cycle-shows-ai-practices-and-platform-engineering-will-reach-mainstream-adoption-in-software-engineering-in-two-to-five-years

**THE QUEUE SHAPE BREAK: your customer becomes another engineer, and adoption
becomes the score.** You stop closing tickets and start building the thing that
closes tickets - and then find out whether anyone uses it.

**Signature work classes:**

1. **The certificate expiry.** Microsoft Teams, 3 Feb 2020, down roughly three
   hours on an expired authentication certificate
   (https://www.geekwire.com/2020/microsofts-slack-competitor-teams-due-expired-authentication-certificate/);
   Ericsson, 6 Dec 2018, expired software certificates in SGSN-MME software took
   out ~32 million O2 subscribers in the UK and caused a nationwide SoftBank
   outage in Japan
   (https://www.itnews.com.au/news/expired-ericsson-cert-causes-uk-and-japan-mega-outages-516617).
   And the treadmill is tightening on a published schedule: CA/Browser Forum
   ballot SC-081v3 passed April 2025 (29-0), stepping maximum TLS validity from
   398 days to 200 (15 Mar 2026), 100 (2027) and **47 days** (15 Mar 2029).
   https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/
   **The rail is already there**: `monitoring.ts` has a `cert` check kind.
2. **The monitoring that dies with the thing it monitors.** Slack, 4 Jan 2021 -
   dashboards ran in a different VPC from the backend databases and therefore
   depended on the same Transit Gateways that were failing, so engineers debugged
   with CLI tools and raw metric queries; and the autoscaler scaled DOWN first
   because CPU fell, then tried to add 1,200 servers between 07:01 and 07:15 PST
   and hit provisioning limits. https://slack.engineering/slacks-outage-on-january-4th-2021/
   AWS S3, 28 Feb 2017 - "one of the inputs to the command was entered incorrectly
   and a larger set of servers was removed than intended", and the Service Health
   Dashboard could not be updated because its console depended on S3 in
   us-east-1. https://aws.amazon.com/message/41926/
3. **The paved road nobody walks.** Spotify's golden path is explicitly opt-out:
   "If you are an adventurer you can of course leave the Golden Path and do your
   own thing, but then you will not have the same support"
   (https://engineering.atspotify.com/2020/08/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem),
   while **51% of Puppet's 2024 respondents say platform teams enforce software
   and tool versions**
   (https://www.prnewswire.com/news-releases/puppets-2024-state-of-devops-report-reveals-security-is-strengthened-by-platform-engineering-302092299.html).
   Those two facts in the same fork are the designed conflict, the way the
   dispatcher-versus-burnout pair was for team lead.

**The sting worth building the whole fork around. [FACT]** DORA 2024: "Utilizing
an internal developer platform improves individual productivity, team
performance, and overall organizational performance. However, it can also lead to
decreased change stability and throughput." https://dora.dev/research/2024/dora-report/
**[DESIGN]** A meter that goes up while the delivery meter goes down, both
correctly, from one true source. That is the watermelon mechanic (E10 slice 2)
with a different colour of lie.

**Toil, measured. [FACT]** Google's own quarterly surveys: average toil ~33%
against a 50% cap, spread 0-80% (https://sre.google/sre-book/eliminating-toil/).
Catchpoint's SRE Report 2025 (n=301, surveyed Jul-Aug 2024, 68% North America):
median share of work spent on toil rose to **30%, up from 25%**, breaking a
five-year decline; over two-thirds frequently feel pressured to prioritise
release schedules over reliability; 40% handled 1-5 incidents in the last 30 days.
https://www.catchpoint.com/press-releases/the-sre-report-2025-highlighting-critical-trends-in-site-reliability-engineering
And when Catchpoint gave respondents Google's exact six-part toil definition,
some answered 90-100%.
https://www.catchpoint.com/blog/sre-report-2023-findings-from-the-field-toil

**Rails.** Change control, rollback, on-call, postmortems, the alert stream, the
E10 phase machine, `monitoring.ts`'s cert/disk/service checks. **New:** an NPC
adoption model - the platform's score is whether other engineers use it, and the
game has no NPC-engineer-behaviour model at all today. That is the cost.

**The anti-pattern list, ready to author against. [FACT]** InfoWorld's eight
platform-engineering anti-patterns end with "Rebranding the operations team" and
include "Lacking a product mindset", "No shared ownership" (top-down technology
mandates), "Not surveying users" and "Tracking the wrong metrics" (adoption rate
instead of impact). https://www.infoworld.com/article/4064273/8-platform-engineering-anti-patterns.html
**[FACT]** 48% of Puppet's 2023 respondents said senior management does not
understand the value platform engineering brings.
https://www.prnewswire.com/news-releases/2023-state-of-devops-report-finds-platform-engineering-unlocks-devops-success-in-the-enterprise-301724764.html

### 2.3 CLOUD / DEVOPS

Already researched to build-ready depth: `docs/research/e7-cloud-work.md`,
`docs/research/e7-cloud-engine-fit.md`, `docs/design/e7-cloud-tier.md`. Nothing
in this pass contradicts it. Two additions from a fork perspective:

**[DESIGN] The fork framing answers DE7-13 differently, and better.** DE7-13
asked "content pack on the Engineer tier, or a third rung?" and recommended
content pack, partly to dodge the `isSystemsEngineer` ordering audit. The fork
answers it a third way: **not a rung above, a rung BESIDE.** Same level, same
tier, different skill - which is what SFIA says a specialism is, needs no
ordering semantics at all, and gets the cloud tier out of the position of
implicitly claiming to be more senior than security or network work.

**[FACT] The network fork's cloud-shaped death is the cloud fork's content.** AWS
Transit Gateway publishes the numbers an on-prem network team used to own: 5,000
attachments, 20 route tables, 10,000 routes, 5 CIDR blocks, up to 100 Gbps per VPC
attachment per AZ, 7,500,000 pps. Getting more is a Service Quotas request, or
"Contact your Solutions Architect (SA) or Technical Account Manager (TAM)".
https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-limits.html
**[DESIGN]** Capacity planning became quota management, and that is one authorable
ticket ("we need more; the answer is a form") that says the whole thing.

**The QUEUE shape break** is E7's own: declared-versus-actual. The plan readout,
the drift whodunit, and the bill nobody approved.

### 2.4 NETWORK (the certs-heavy guild)

**The day.** **[FACT]** A senior network engineer JD is a dual mandate - "Design
and deploy functional networks (LAN, WLAN, WAN)" AND "Resolve issues tiers of
support have escalated" - and requires "Professional certification (e.g. CCNP,
CCDP)" plus "Knowledge of coding languages for scripting (e.g Python, Perl)".
https://resources.workable.com/senior-network-engineer-job-description
Notable negative finding: that template mentions neither on-call nor maintenance
windows, which are the two things the job is actually made of.

**THE QUEUE SHAPE BREAK: the dashboard is green and the service is broken, and
your job is to prove a negative.** Every signature fault in this fork shares one
property - **the link reports up/up.** Spanning-tree loops, MTU black holes,
duplex mismatch, dirty optics, asymmetric routing through a stateful firewall:
all of them present as "fine" to every monitor the game currently models.

**[FOLKLORE]** The track's own name for its core metric is **Mean Time To
Innocence**: "It's always the network until you prove that it's not ... you have
to prove that all of the traffic is being delivered, and in a timely manner,
before you can say, 'no, server team, go look at the way you have your
application scaled on this box.'"
https://bluecatnetworks.com/blog/it-pros-debate-guilty-networks-speaking-up-the-stack-and-essential-career-skills/
Tom Hollingsworth: "The network is usually the first to get blamed and the last
to keep its innocence"; his prescription is "Fix the problem, not the blame."
https://networkingnerd.net/2016/12/23/is-it-really-always-the-network/

**[FACT]** And the blame is measurably unfair. One large enterprise's real ticket
data (Michelin): ~65% of issues came from applications, 35% from infrastructure,
and **networks were only 15-20% of total problems**.
https://blogit.michelin.io/actually-its-not-the-network/ Meanwhile ~40% of
network teams say a typical issue takes more than four hours to troubleshoot, and
roughly 80% of MTTR is *identifying* rather than repairing.
https://www.apmdigest.com/network-teams-guilty-until-proven-innocent-just-ask-the-application-team

**Signature work classes:**

1. **The MTU black hole**, which is the best small puzzle in this entire
   document. RFC 2923 names both cause and symptom exactly: "Firewalls are often
   misconfigured to suppress all ICMP messages", and "The short SYN packet has no
   trouble traversing the network, due to its small size ... Large data packets
   fail to traverse the network." https://www.rfc-editor.org/rfc/rfc2923.html
   PMTUD depends on ICMP Type 3 Code 4 with the next-hop MTU in what RFC 1191
   calls "the low-order 16 bits of the ICMP header field that is labelled
   'unused'" (https://www.rfc-editor.org/rfc/rfc1191.html). Exact overheads for
   authoring: GRE 24 bytes (1476 tunnel MTU)
   (https://blog.ipspace.net/kb/Internet/PMTUD/40-tunnels/), VXLAN 50 bytes with
   a 24-bit VNI against 4094 VLANs
   (https://www.juniper.net/documentation/us/en/software/junos/evpn/topics/topic-map/sdn-vxlan.html).
   *Ping works, the file copy hangs* is a complete, teachable, fully sourced
   ticket.
2. **The change window and the router you locked yourself out of.** Junos `commit
   confirmed` rolls back after a default 10 minutes (range 1-65,535) and "a
   broadcast message is sent to all logged-in users"
   (https://www.juniper.net/documentation/us/en/software/junos/cli/topics/ref/command/commit.html).
   Cisco's equivalent is `configure terminal revert time <minutes>` plus
   `configure confirm`, and requires `archive`/`path`/`maximum` configured first
   (https://iosxrjunos.wordpress.com/2025/05/16/how-cisco-ios-ios-xe-implements-juniper-like-commit-and-rollback-behavior/).
   The folk method is `reload in <hh:mm:ss>` before the risky change - the whole
   point being that you have NOT saved the startup config
   (https://yurisk.info/2024/12/07/fortigate-revert-configuration-as-a-safety-measure-analog-to-cisco-reload-in-or-juniper-commit-confirmed/).
   **[DESIGN]** "Did you save the config?" is the same act with opposite sign
   depending on whether you are still inside the window. That is a genuinely
   novel, genuinely true mechanic and it fits the shipped change-request phase
   machine exactly.
3. **The route leak.** Cloudflare/Verizon, 26 June 2019: DQE's BGP optimizer
   split `104.20.0.0/20` into more-specifics, Allegheny forwarded them, Verizon
   failed to filter and "proceeded to tell the entire Internet about these
   'better' routes"; Cloudflare lost ~15% of global traffic.
   https://blog.cloudflare.com/how-verizon-and-a-bgp-optimizer-knocked-large-parts-of-the-internet-offline-today/
   Rogers, 8 July 2022 (CRTC): staff deleted an ACL policy filter, BGP
   redistributed full routing tables into OSPF, core-router CPU and memory
   exhausted; the missing control was an overload limit.
   https://crtc.gc.ca/eng/publications/reports/xonarp2023.htm

**Is the track shrinking?** Both halves are US-government sourced and they point
opposite ways. **[FACT]** Network and Computer Systems Administrators: projected
to **decline 4% from 2024 to 2034**, 331,500 jobs (2024), median $96,800, with
BLS stating all ~14,300 annual openings come from replacement rather than growth,
and naming DevOps, Networks-as-a-Service outsourcing and automation as the causes.
https://www.bls.gov/ooh/computer-and-information-technology/network-and-computer-systems-administrators.htm
**[FACT]** Computer Network Architects: **+7% or higher through 2034**, 179,200
employed, median $134,050. https://www.onetonline.org/link/summary/15-1241.00
(bls.gov 403s automated fetch; both figures came through the search index.)
**The operating half is shrinking and the designing half is growing** - which is
the SFIA operate-caps-at-5 finding in employment data.

**Rails.** The estate graph has typed edges (`runs_on`, `contains`) and
`cmd-net.ts` already generates a deterministic network map from a host id.
**New:** a path model and a trace verb. A fault whose signature is "the graph
says fine" needs a second, physical layer under the estate - link nodes, MTU as a
field, a packet-path solver. That is real engine, and it is why this fork ranks
where it does in section 5.

### 2.5 DATA / DBA (dying? changed?)

**The honest answer: not dying, but it stopped being a fork and became a
skill.** **[FACT]** BLS projects Database Administrators and Architects to grow
**4% 2024-2034**, ~7,800 openings a year, most from replacement - and BLS itself
names the drag: demand "may be limited as fewer of these workers are expected to
be needed as many companies operate in the cloud, allowing fewer administrators
to serve more companies at the same time."
https://www.bls.gov/ooh/computer-and-information-technology/database-administrators.htm
Note the classification sleight of hand: BLS merged DBA (15-1242) with Database
Architect (15-1243) into one published occupation, and O*NET flags only the
*architect* half as Bright Outlook (https://www.onetonline.org/help/bright/15-1243.00).
The operate/design split again.

**[FACT]** Pay says it is not dead: Stack Overflow 2025 medians - Database
administrator or engineer **$85,168.50**, data engineer $81,210, data scientist
$82,910, DevOps engineer $87,011. https://survey.stackoverflow.co/2025/work/
The DBA out-earns the data engineer who supposedly replaced them.

**[FACT]** What it became has a canonical text: *Database Reliability
Engineering* (Campbell & Majors, O'Reilly, 2017), which deliberately chose
"reliability engineer" over "administrator" and attacked the silo where DBAs used
different tools, hardware and languages from the rest of engineering; there is a
companion chapter in *Seeking SRE*.
https://www.oreilly.com/library/view/database-reliability-engineering/9781491925935
and https://www.oreilly.com/library/view/seeking-sre/9781491978856/ch16.html
**[FACT]** The other exit is analytics engineering, dated to the Locally
Optimistic community in 2018 and institutionalised by dbt Labs: "neither data
engineering, nor analysis. It's somewhere in the middle, and it needed a new
title." https://www.getdbt.com/blog/what-is-analytics-engineering

**Signature work classes, and they are excellent even if the fork is not:**

1. **Transaction ID wraparound** - a real countdown with two published
   thresholds and quotable error strings. At 40 million transactions out:
   `WARNING: database "mydb" must be vacuumed within 39985967 transactions`. At
   under 3 million: `ERROR: database is not accepting commands that assign new
   transaction IDs to avoid wraparound data loss in database "mydb"` - reads
   still work, writes stop. `autovacuum_freeze_max_age` defaults to 200 million;
   32-bit XIDs wrap at ~2 billion.
   https://www.postgresql.org/docs/current/routine-vacuuming.html
   Sentry, 20 July 2015, lived it: down most of a US working day, tried
   single-user-mode VACUUM, gave up at "going on 24 hours" and TRUNCATEd the
   offending table. https://blog.sentry.io/transaction-id-wraparound-in-postgres/
   And the joke writes itself: current Postgres docs now say "it is not necessary
   or desirable to stop the postmaster or enter single user-mode", so the
   veteran's ritual is the wrong fix.
2. **The restore that takes eighteen hours.** GitLab, 31 Jan 2017 - the wipe ran
   on the primary, "around 300 GB" gone in seconds, and **five backup and
   replication techniques, of which exactly one accidental LVM snapshot worked**:
   pg_dump failed silently on a 9.2-against-9.6 version mismatch, its cron error
   mail was rejected because DMARC was not enabled, Azure disk snapshots were
   never enabled on DB servers, replication had failed on WAL lag, and the
   secondary was wiped during recovery. Loss: roughly 5,000 projects, 5,000
   comments, 700 accounts. "Copying the data from the staging to the production
   host took around 18 hours" over a ~60 Mbps link.
   https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/
   **[DESIGN]** This is the single best authorable incident in this whole
   document, and note WHY: the mechanic is a CLOCK, and this game is made of
   clocks. Four dead backups is content; eighteen hours the player has to sit
   through, deciding what to tell the customer, is a mechanic.
3. **The migration that locks the hot table.** Postgres `ALTER TABLE`: "An
   ACCESS EXCLUSIVE lock is acquired unless explicitly noted"; adding a column
   with a volatile default or changing a column type "will cause the entire table
   and its indexes to be rewritten"; ACCESS EXCLUSIVE "conflicts with locks of all
   modes". https://www.postgresql.org/docs/current/sql-altertable.html and
   https://www.postgresql.org/docs/current/explicit-locking.html
   The MySQL escape hatch exists because of it: gh-ost "differs from all existing
   tools by not using triggers ... We have recognized the triggers to be the
   source of many limitations and risks", reading the binlog instead.
   https://github.com/github/gh-ost

**[DESIGN] Verdict: do not ship data as a fork. Harvest it.** Wraparound, the
9002 full transaction log (`sys.databases.log_reuse_wait_desc` is a ready-made
cause table:
https://learn.microsoft.com/en-us/sql/relational-databases/logs/troubleshoot-a-full-transaction-log-sql-server-error-9002),
the eighteen-hour restore and the locking migration are all SERVER work in our
`work-kinds.ts` sense and belong in the engineer rung's pool. The fork identity
around them is thin - no distinct queue shape, no distinct verb set, and its own
practitioners say the role dissolved into reliability engineering.

The one thing that IS fork-shaped here is the Oracle licence audit, and it is
purely comedic: the audit-defence industry names VMware estates as the most
valuable targets, because a VM could theoretically migrate onto an unlicensed
host. https://palisadecompliance.com/oracle-license-audit-support/ and
https://www.riministreet.com/wp-content/uploads/2024/09/Oracle-License-Audit-White-Paper-GLAS.pdf

### 2.6 THE STAFF/PRINCIPAL GENERALIST (Larson's archetypes, management reading removed)

Thread A already sourced the four archetypes. Re-fetched for the two that survive
the owner's D5 cut, because Tech Lead and Architect are the management-adjacent
pair and the other two are not:

**[FACT] Solver** - "goes deep into knotty problems, continuing to work on them
until they're resolved" on issues identified by organisational leadership; unlike
the others they "generally operate on problems that are already identified as
organizational priorities"; they move to the next problem once resolved,
"creating transience".
**[FACT] Right Hand** - the rarest, emerging at hundreds of engineers, operating
"with the borrowed authority of a senior leader", attending executive staff
meetings, on problems that "are never purely technical and instead involve the
intersection of the business, technology, people, culture, and process".
https://staffeng.com/guides/staff-archetypes/

**THE QUEUE SHAPE BREAK, and it is the cheapest one in this document: the queue
becomes ONE ITEM.** The Solver's week has no drip, no mix and no SLA ladder - it
has the worst open thing in the company and however long it takes. Everything the
week generator does is switched off, and that IS the shape break.

**[FACT] The selection discipline that goes with it**, from the same author: work
is "snacking" when it is "easy and low-impact"; "preening" is the "particularly
seductive subset" that is "low-impact, high-visibility", and companies "conflate
high-visibility and high-impact"; when something existential is happening "that's
the place to be engaged. Nothing else will matter if it doesn't get addressed."
https://lethain.com/work-on-what-matters/
**[DESIGN]** Three named categories of work, one of which the ORG rewards and the
scoreboard should not, is a scoring model we could ship almost as-is - and it is
the honest counter to a game whose meters currently reward visible closure.

**[FOLKLORE, and thread A already flagged it]** The archetypes are disputed as
self-serving labels (https://blog.alexewerlof.com/p/staff-archetypes-are-anti-patterns,
https://www.seangoedecke.com/staff-engineer-archetypes/). Ship them as what the
org calls things, not as truth.

**Rails.** All of them - this fork adds no domain. **New:** a week-generator mode
where the mix quota is replaced by a single long item, plus the Right Hand's
version where the queue is whatever the exec asked for this morning, which is
E8's org-dysfunction engine pointed at the player's own week rather than at one
ticket.

---

## 3. THE CERT / IDENTITY LAYER

The forks are legible in real life mostly through certificates, and this is the
cheapest diegetic surface in the whole epic: a CV screen, a KB page, a line under
a name in a mail signature, and one date field.

### 3.1 What the certs actually cost and how long they last

All [FACT] from the vendor pages named, fetched by the research lane 2026-08-13.

| Cert | Fork | Price | Validity | Renewal |
|---|---|---|---|---|
| CompTIA Security+ SY0-701 | security | $439 (from 1 Jun 2026; secondary source, CompTIA publishes no price page) | 3 years | 50 CEUs + $150 per cycle |
| CompTIA CySA+ CS0-004 | security | not officially sourced | 3 years | 60 CEUs + $150 |
| CISSP (ISC2) | security/govern | $749 Americas | continuous | **$135/year AMF** + 120 CPE per 3 years (90 Group A) |
| OSCP (PEN-200) | security | $1,749 course+cert, $1,699 exam standalone, Learn One $2,749/yr | **never expires** ("+" designation expires in 3 years) | CPE + annual fee for the "+" |
| GIAC | security | $999 attempt, $899 retake, **$499 renewal**, $175 missed-appointment reseat | 4 years | 36 CPE |
| SANS SEC504 course | security | **$8,780** | n/a | n/a |
| Cisco CCNA 200-301 | network | $300 (secondary) | 3 years | 30 CE credits or re-exam |
| Cisco CCNP / CCIE | network | see 3.5 | 3 years | 80 / 120 CE credits |
| Juniper JNCIA-Junos JN0-106 | network | $200 (secondary) | 3 years | retake or pass any JNCIS |
| AWS SAA-C03 | cloud | $150 | 3 years | retake, or earn the Professional |
| AWS Professional SAP-C02 | cloud | $300 | 3 years | as above |
| Microsoft AZ-104 | cloud | not published by Microsoft | **12 months** | **free, unproctored, open book, unlimited attempts** |
| Google Prof. Cloud Architect | cloud | $200 | **2 years** | $100 renewal exam |
| CKA / CKAD | cloud/platform | **$445** each | **2 years** | retake; no CE path |
| RHCSA EX200 / RHCE EX294 | infra | not published (country-gated) | 3 years "current", never "invalid" | retake, advance, or expand - all cost a full fee |
| LPIC-1 / LPIC-2 | infra | $200/exam, $400/level | **5 years** | 20 PDUs/yr + membership, or next level, or retake |
| CompTIA A+ V15 | generalist | $274 per exam, $548 the pair | 3 years | 20 CEUs + $75 |
| ITIL 4 Foundation | generalist | EUR 649 bundle; no USD price published | 3 years | 60 CPD points |

Sources, in order: https://www.comptia.org/en-us/certifications/security/ ,
https://www.comptia.org/en-us/resources/ce/learn/continuing-education-renewal-fees/ ,
https://www.comptia.org/en-us/certifications/cybersecurity-analyst/v4/ ,
https://www.isc2.org/register-for-exam/isc2-exam-pricing ,
https://www.isc2.org/policies-procedures/amfs-overview ,
https://www.offsec.com/courses/pen-200/ ,
https://help.offsec.com/hc/en-us/articles/29840452210580-Changes-to-the-OSCP ,
https://www.giac.org/pricing , https://www.giac.org/renewal ,
https://www.sans.org/cyber-security-courses/hacker-techniques-incident-handling ,
https://www.cisco.com/site/us/en/learn/training-certifications/certifications/recertification/index.html ,
https://learningportal.juniper.net/juniper/user_activity_info.aspx?id=14354 ,
https://aws.amazon.com/certification/certified-solutions-architect-associate/ ,
https://aws.amazon.com/certification/recertification/ ,
https://learn.microsoft.com/en-us/credentials/certifications/renew-your-microsoft-certification ,
https://cloud.google.com/learn/certification/cloud-architect ,
https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/ ,
https://www.redhat.com/en/services/certification/renewal ,
https://www.lpi.org/our-certifications/renewal/ ,
https://www.comptia.org/en-us/certifications/a/core-1-v15/ ,
https://www.peoplecert.org/browse-certifications/it-governance-and-service-management/ITIL-1/itil-4-foundation-2565

### 3.2 The three facts that make this a MECHANIC and not a list

1. **[FACT] Certs go stale on a clock, and the vendors disagree wildly about how
   painful that is.** Microsoft renews free, unproctored and open book, annually.
   The Linux Foundation makes you re-sit a two-hour live-terminal exam every two
   years. ISC2 bills $135 a year to keep a certificate you already earned. Red
   Hat's language is the best of all: certifications "do not 'expire,' or become
   'terminated' or 'invalid,' but they can become **'non-current'**".
   https://www.redhat.com/en/services/certification/renewal
   **[DESIGN] "Non-current" is the exact word the game should use for a fork the
   player walked away from.** It is real, it is Red Hat's, and it is funnier than
   anything we would invent.

2. **[FACT] Certs gate hiring FAR harder in some forks than others, and the gap
   is measurable.** UK job ads, six months to 13 Aug 2026, one aggregator, same
   period: Network Engineer ads name Cisco 49.65%, a Cisco certification 38.97%,
   CCNA 29.92%, CCNP 13.41%. Systems Administrator ads name a Microsoft
   certification **0.40%**, AWS certification 0.79%, RHCSA 1.58% - no CCNA, no
   ITIL in the top list.
   https://www.itjobswatch.co.uk/jobs/uk/network%20engineer.do and
   https://www.itjobswatch.co.uk/jobs/uk/systems%20administrator.do
   Roughly 39% of network ads demand a vendor certificate against under 1% of
   sysadmin ads. **That single contrast is the cert layer's whole design: it
   should be per-fork, not global.**

3. **[FACT] The certificate is sometimes the employer's, not yours.** See 1.3 -
   the partner-tier headcount rules. Your certificate is a line item in your
   employer's compliance posture, and when it lapses THEY lose something.

### 3.3 The honest comedy in cert culture

- **[FACT] The impossible job ad, verified.** IBM Global Technology Services
  posted an advert requiring "a minimum 12+ years' experience in Kubernetes
  administration and management". Kubernetes' first GitHub commit was 7 June
  2014, making it roughly six years old at the time. In the same piece FastAPI's
  creator Sebastian Ramirez described a posting demanding "4+ years of experience
  in FastAPI" and noted "I couldn't apply as I only have 1.5+ years of experience
  since I created that thing".
  https://www.theregister.com/2020/07/13/ibm_kubernetes_experience_job_ad/
  (The date is 2020. Get it right.)
- **[FACT] The cumulative treadmill, costed from vendor pages.** A modest
  three-fork stack over one three-year cycle: CISSP AMF $405 + Security+ CE $150 +
  one GIAC renewal $499 + a CKA retake $445 every two years + Cisco CE credits +
  AWS recert at half price + Microsoft's free annual assessment. All components
  cited in 3.1.
- **[FACT] Sequential public numbering.** CCIE numbers are issued in sequence and
  are public; the programme passed 60,000 issued numbers in 2019. Cisco does not
  publish active counts.
  https://www.cbtnuggets.com/blog/certifications/cisco/how-many-ccies-are-there-in-the-world
  **[DESIGN]** A low number is a visible flex with no gameplay attached - which is
  precisely why an NPC should have one.
- **[FACT] Holder counts, where published.** ISC2: "more than 265,000 certified
  members, and associates" across all its credentials (undated page).
  https://www.isc2.org/About/Member-Counts
- **[FACT] The salary table exists and is a marketing asset.** Skillsoft's IT
  Skills and Salary Report is an opt-in online survey (5,100+ complete responses,
  May-Sept 2024, distributed via Skillsoft's own blogs, newsletters and social
  media) run by a training vendor with a commercial interest in the answer.
  https://investor.skillsoft.com/news-events/press-releases/detail/413/skillsofts-new-it-skills-salary-report-highlights-trends-impacting-technology-careers-investments-and-talent-strategies-for-2025
  **[DESIGN] If any cert salary figure ever appears in-game, the survey's
  self-selection must appear beside it** - per the content-truth policy. Better:
  have an NPC quote the number and have the KB article quietly note the
  methodology. That is the house voice doing its job.

### 3.4 The surface, and why it is cheap

**[DESIGN]** Three shipped screens can carry the entire identity layer with no
new app:
- the **log-on box**, which already prints the whole ladder with reasons on the
  greyed rungs (0.35.0 slice B) - the fork belongs there as a second column;
- the **KB**, which is already per-employer pooled (`src/world/kb/pool-*.ts`) -
  a "what the letters after your name mean" article per fork, in house voice;
- **mail**, where the post-nominal soup lives in real life. An NPC whose
  signature grows a letter each version is free characterisation.

**[FACT, thin]** The badge economy is real and vendor-issued - Linux Foundation
lists "PDF certificate and digital badge upon passing" as part of the $445
(https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/).
Credly/Open Badges specifics and CV formatting conventions: **not sourced.**

### 3.5 DO NOT SHIP UNVERIFIED

Three numbers in this section came through blocked-domain intermediaries and
conflict across sources. Re-verify from the vendor before any of them appears in
a KB article or a screen:

1. **The CCIE lab fee.** Sources cite $1,500, $1,600 and $1,900, all attributed
   to Cisco. cisco.com 403s. **CCIE pass rates appear not to be published at all.**
2. **The Cisco Gold partner headcount** (reported as 12 certified FTEs including
   four CCIEs; Cisco's own blog corroborates the four-CCIE goal but not the twelve).
3. **The Skillsoft top-paying-certification figures**, retrieved via search
   snippet only.

Also not sourced and not to be written from memory: vendor braindump and
decertification policies, named-practitioner cert-versus-experience commentary,
the CISSP-as-management-cert critique, and bootcamp pricing.

---

## 4. CROSS-FORK TRUTH

### 4.1 How much stays shared: most of it, and there is a number

**[FACT]** 70% of security entrants come from IT (ISC2, section 1.1) - the shared
base is not a nicety, it is the normal path in.

**[FACT]** The password reset really does find you everywhere: the single app
most responsible for tickets is the identity provider (Okta = 12.8% of app-tagged
tickets, ahead of Salesforce 6.7%, Slack 5.1%, Microsoft 365 4.5%), and IAM is
15.9% of L1 volume with onboarding/offboarding another 16.6% (Fixify 2026, via
thread A). Identity work is the substrate every fork stands on, and it is
*security* work misfiled as desk work, which is the joke.

**[FACT]** The forks share incidents, not just chores. The 4 Oct 2021 Meta outage
is simultaneously a network incident (a backbone audit command), a DNS incident
(DNS servers withdrew their own BGP routes by design), a platform incident ("the
total loss of DNS broke many of the internal tools we'd normally use to
investigate"), and a physical-access incident (engineers travelled to data
centres because out-of-band was down too).
https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/
**[DESIGN]** One authored incident, four fork-specific readings of it, is the
highest-leverage content shape in this document.

### 4.2 The D2 question: blend factors per fork

D2 decided the ratios are per title and per work kind. The fork adds a third
term, and here is the engine truth, which is a constraint rather than a
suggestion.

**Engine finding 1.** `src/world/titles.ts` refuses a `workMix` factor outside
0..1 at module load ("above one is a rung inventing work the shop does not have").
A fork therefore **cannot raise** a kind above the shop's own rate under today's
loader. Two ways out, and they are different designs:
- (a) **Fork rows replace rung rows.** A fork is a full `TitleRow` with its own
  mix, not a multiplier over one. Cheapest, keeps the invariant, costs a row per
  fork per rung.
- (b) **Add work kinds.** `WORK_KINDS` is four; a security fork wants a fifth,
  and then the factor stays a factor because the shop deals security work at some
  rate of its own. Truer, but it touches every mix measurement and re-baselines
  `week-mix.test.ts`.

**Engine finding 2.** `src/world/work-kinds.ts` lists `security` in `PAPERWORK`,
so a ticket closing with `security.follow_link` is skipped as a work step and
falls through to estate classification. There is no verb family that would class
a detection, a triage verdict or a network trace. **Any fork that ships new verbs
ships a `work-kinds.ts` change with them, or its tickets silently misclassify** -
and that module's own comment says exactly why that is the bad outcome ("a ratio
that quietly stops counting").

**[DESIGN] Recommendation: (a) now, (b) when a second fork lands.** One fork over
replacement rows proves the shape without re-baselining every measured mix; the
fifth kind earns its cost only when two forks are competing for the same week.

### 4.3 Fork-switching cost in real careers

**[FACT]** Charity Majors, on the track she was writing about (management, but
the mechanism is general): "the best frontline eng managers in the world are the
ones that are never more than 2-3 years removed from hands-on work", and "your
engineering skills and context-sharpness are decaying the longer you do it". She
explicitly rejects permanence - it is "a lateral move onto a parallel track" -
and prescribes cycling: "Do it as long as it makes you happy ... Then stop. Go
back to building things." https://charity.wtf/2017/05/11/the-engineer-manager-pendulum/

**[FACT]** The mechanised version of that decay is the cert clock in section 3.1,
and it is per-fork: Microsoft's lapses in 12 months and costs nothing to fix; the
Linux Foundation's lapses in 24 and costs a two-hour live exam; Red Hat's goes
"non-current" at 3 years; LPI's lasts 5.

**[FACT]** And the market has already made one switch harder than the other: 39%
of network ads want a vendor certificate against under 1% of sysadmin ads
(3.2). Coming back INTO the network fork after a lapse has a real toll gate;
coming back into generalist sysadmin does not.

### 4.4 Is a fork a one-way door in the fiction?

**[DESIGN] Recommendation: NO - reversible, with a real and diegetic cost, and
the cost is the cert clock.** Three reasons:

1. It is truer. Every source above says people move: 70% of security people came
   from IT; Majors says go back; SFIA models a person as a *profile of skills at
   levels*, not as a class.
2. It is cheaper. A one-way door forces every fork to be complete before it
   ships, because a player who walks through a door into thin content is stuck.
   A reversible fork can ship one fork and let the player return to the queue
   they know.
3. It is funnier, and the joke is free and sourced. Walk away from the network
   fork for two versions and your CCNA goes non-current; the game does not stop
   you doing network work, it just stops the MSP being able to *sell* it, because
   the partner tier needs two certified bodies and you were one of them (1.3).
   **The cost of switching lands on the employer, not on the player's stats.**
   That is the game's whole thesis about IT work, expressed as a career mechanic.

---

## 5. FUN SHAPE: which forks are a different GAME

The owner will not ship six. This section ranks them, and the ranking criterion
is **new gameplay per unit of new ENGINE**, not per unit of new content - content
is authorable, engine is not.

### 5.1 The ranking

| Fork | The gameplay, in one line | Distinct? | New engine cost | Rails already shipped |
|---|---|---|---|---|
| **Security** | The queue becomes a verdict queue: mostly nothing, and being right about nothing is the score | **High** - no other rung scores a non-action | **Low-medium** - `monitoring.ts` is this loop already; needs a verdict close reason + a work kind | monitoring board, E8 content, incidents, on-call, recert, mail rules, customer scope |
| **Staff generalist (Solver)** | The queue becomes ONE item and every week mechanic switches off | **Medium-high** - a pacing break nothing else does | **Lowest** - a week-generator mode, no domain at all | everything; adds nothing |
| **Cloud (E7)** | Declared versus actual: the plan readout and the drift whodunit | **High** | **High, but already funded** as E7 | E10 phase machine, estate, firewall rules |
| **Network** | Topology puzzle: the dashboard is green, prove where the packet dies | **Highest, honestly** | **Highest** - needs a physical layer under the estate and a path solver | typed estate edges, `cmd-net.ts` map |
| **Infra / platform** | Your customer is another engineer, and adoption is the score | Medium-high | **High** - needs an NPC-adoption model the game has none of | change control, cert/disk checks, phase machine |
| **Data / DBA** | Countdowns and restores | **Low as a fork** - no distinct queue shape | Low | incidents, clocks |

### 5.2 Why security wins on this criterion and it is not close

The security fork's core loop is a *generalisation of a module that already
ships*. `src/world/monitoring.ts` was written for the MSP's monitoring-only
contract and its docstring describes, without meaning to, the SOC:

- rows are `'alert' | 'noise'`;
- "The board has no fix - by contract and by design. Its whole verb set is
  acknowledge and escalate";
- the noise is deterministic, self-clearing, and mixed in among standing real
  alerts;
- "The skill, and the joke, is triage."

That is a verdict queue with a false-positive rate, built, tested and
deterministic. The security fork needs it pointed at a different stream (a
detection instead of a disk check), given a third verb (close as benign, and be
SCORED for it), and given the pyramid-of-pain ladder so the same alert can be
closed at six different heights with six different futures. Everything else the
fork wants - the incident, the ordered response, the politics, the customer
blast radius - is already designed in E8 or shipped in E6.

The one thing security asks for that nothing else does is **an adversary that
hides**, and that is a genuine new authoring shape (the solvability auditor has
only ever reasoned about faults, which do not conceal themselves). It is the real
cost and it should be scoped deliberately, not discovered.

### 5.3 Why network is the best pure puzzle and still should not go first

The MTU black hole, the up/up-but-broken condition and Mean Time To Innocence are
the most *game-like* material in this entire document - a genuine deduction puzzle
with a physical model, exact numbers, and a comedy premise (proving a negative to
people who have already decided). But the engine bill is a second graph under the
estate: link nodes, per-hop MTU, a path solver, and a trace verb whose output has
to be readable enough to reason over. That is E7-sized, and E7 is already queued.
**Recommendation: park network as the fork AFTER the first two land, and harvest
its incident classes into the engineer pool meanwhile** - a duplex mismatch or a
dirty optic is a server-kind ticket today with no new engine at all.

### 5.4 The concrete engine notes any fork slice must carry

1. `titles.ts` refuses `workMix` factors above 1 - a fork cannot raise a kind
   (4.2). Fork rows replace rung rows for the first fork.
2. `work-kinds.ts` has `security` in `PAPERWORK` and no verb family for a
   detection - new verbs ship with a classification change or the mix silently
   stops counting.
3. `rungForTier` maps PAM tier one-to-one onto rung, and `TITLE_TABLE` refuses a
   built row with a null tier. A fork at the same LEVEL does not need a new PAM
   tier, which is exactly why the fork should be beside the rung and not above it
   (1.2) - it dodges the `isSystemsEngineer`-ordering audit DE7-13 flagged.
4. `monitoring.ts` holds no copy of status - it reads the estate node. Any
   detection stream must keep that discipline or the board and the ticket drift.
5. The engine bans `Math.random`; the noise in the board is a function of the day
   and the check id. A false-positive rate must be seeded the same way, or the
   week stops being reproducible and `gate:seeds` stops meaning anything.

---

## Open questions for the owner

**F1. Is the fork a rung or a row?** Recommend: **a choice made AT the
`senior_engineer` promotion, same level, same PAM tier, different specialism** -
so the ladder stays seven rungs and no ordering semantics are invented. The
alternative (a fork = a new rung above Systems Engineer) buys nothing SFIA
supports and costs the `isSystemsEngineer` audit.

**F2. Which fork first?** Recommend: **security**, on the grounds in 5.2 - the
verdict loop already exists as `monitoring.ts`, the content already exists as E8,
and it is the only fork whose governance arm reaches SFIA level 7 (so it can
later feed the architect rung rather than competing with it).

**F3. One-way door, yes or no?** Recommend: **no - reversible, and the cost is
the cert clock going "non-current"** (4.4). Decidable now, and it changes how
much content a fork must have before it can ship.

**F4. Does the cert layer ship WITH the first fork or after it?** Recommend:
**with it, minimally** - one field (a cert and a date), the log-on box column,
and one KB article. It is what makes the fork legible and it is the cheapest
thing in this document. The full renewal treadmill is a later slice.

**F5. D2 blend: replacement rows or a fifth work kind?** Recommend: **replacement
rows now, the fifth kind when a second fork lands** (4.2). This one gates the
first slice's shape and wants answering before build.

**F6. Does the security fork get an ADVERSARY, or only a noisy stream?** The
noisy stream is cheap and rides shipped machinery; the adversary that actively
hides is the thing that makes the fork a different game and is a new authoring
shape for the solvability auditor. Recommend: **stream first, adversary as the
second slice, gated on whether the verdict queue is fun to read** - the same
"slices 1-2 are the honest test" discipline E7 adopted.

**F7. What happens to the DATA fork?** Recommend: **not a fork - harvest it.**
Wraparound, the 9002 log-full, the eighteen-hour restore and the locking
migration go into the engineer rung's server pool as content. Owner call because
it is a deletion from the candidate list, not a deferral.

**F8. Does the network fork's physical layer ever get built,** or does the track
live permanently as harvested content in the engineer pool? Not urgent; it
decides whether we ever write a path solver, which is a real engine commitment.

---

## Slice-shaped recommendation

**Ship ONE fork, security, in two slices, on the MSP rails, at the
`senior_engineer` row - and declare E7 the cloud fork rather than a rung above.**

- **Slice 1 - the verdict queue.** Generalise `monitoring.ts` from RMM checks to
  a detection stream at the MSP: same determinism, same read-the-node discipline,
  same alert/noise split, seeded at the sourced 46%-false-positive rate for
  security ops. Add the one thing it lacks: **a close-as-benign verdict that is
  SCORED**, so being correctly idle is a positive outcome for the first time in
  this game. Add the fork row to `titles.ts` (replacement mix, per F5), the
  `work-kinds.ts` classification that goes with any new verb, and the cert field
  + log-on-box column + one KB article (F4). No adversary yet. This is the honest
  test of the premise: **if a queue you are supposed to mostly close as nothing
  is not fun, the fork is a job and we stop.**

- **Slice 2 - the pyramid, and the thing that hides.** The same alert closable at
  six heights (Bianco's ladder), with the cheap close expiring and the expensive
  close removing the class from later weeks - the KB-compounding mechanic pointed
  at an adversary. Then one authored intrusion where part of the world is
  concealed rather than merely broken, joined to E8's BEC arc (which is already
  the setup: the exempted exec, the delegate access, the inbox rule that survives
  the password reset).

- **Then, and only then, the second fork.** Cloud is already E7 and needs no fork
  work beyond the framing in 2.3. Network is the best puzzle and the biggest
  engine bill - it goes after E7, and until then its incidents are harvested into
  the engineer pool. Platform waits on an NPC-adoption model. Data is harvested,
  not forked (F7). The Solver shape (2.6) is the cheapest thing on the list and
  is the right filler between forks: a week-generator mode, no domain, and it
  bridges `senior_engineer` to `architect` for free.

The whole recommendation in one sentence: **the fork is the second axis of a
table we already ship, the first fork should be the one whose loop is already
half-written in `monitoring.ts`, and the way out of a fork is a certificate
quietly going non-current.**

---

## Sources

**Frameworks and the fork point**
- SFIA 9 how it works - https://sfia-online.org/en/about-sfia/how-sfia-works
- SFIA 9 skills A-Z - https://sfia-online.org/en/sfia-9/all-skills-a-z
- SFIA 9 Information security (SCTY) - https://sfia-online.org/en/sfia-9/skills/information-security
- SFIA 9 Security operations (SCAD) - https://sfia-online.org/en/sfia-9/skills/security-operations
- SFIA 9 Infrastructure operations (ITOP) - https://sfia-online.org/en/sfia-9/skills/infrastructure-operations
- SFIA 9 Infrastructure design (IFDN) - https://sfia-online.org/en/sfia-9/skills/infrastructure-design
- SFIA 9 Network support (NTAS) - https://sfia-online.org/en/sfia-9/skills/network-support
- SFIA 9 Network design (NTDS) - https://sfia-online.org/en/sfia-9/skills/network-design
- SFIA 9 Database administration (DBAD) - https://sfia-online.org/en/sfia-9/skills/database-administration
- ISC2 2024 Cybersecurity Workforce Study - https://www.isc2.org/Insights/2024/10/ISC2-2024-Cybersecurity-Workforce-Study
- StaffEng archetypes - https://staffeng.com/guides/staff-archetypes/
- Larson, Work on what matters - https://lethain.com/work-on-what-matters/
- Majors, The engineer/manager pendulum - https://charity.wtf/2017/05/11/the-engineer-manager-pendulum/
- Archetype critique - https://blog.alexewerlof.com/p/staff-archetypes-are-anti-patterns , https://www.seangoedecke.com/staff-engineer-archetypes/

**Security**
- Tines Voice of the SOC 2023 - https://www.tines.com/reports/voice-of-the-soc-2023/
- Vectra alert fatigue - https://www.vectra.ai/topics/alert-fatigue
- Bianco, Pyramid of Pain - https://detect-respond.blogspot.com/2013/03/the-pyramid-of-pain.html
- MITRE ATT&CK - https://attack.mitre.org/ (fetched 2026-08-13: 15 Enterprise tactics, 312 techniques; the matrix versions, so re-check counts before printing them)
- NIST SP 800-61r3, April 2025, supersedes r2 (Aug 2012) - https://csrc.nist.gov/pubs/sp/800/61/r3/final
- CVSS v4.0, released 1 Nov 2023; bands None 0.0 / Low 0.1-3.9 / Medium 4.0-6.9 / High 7.0-8.9 / Critical 9.0-10.0 - https://www.first.org/cvss/v4-0/specification-document
- Detection engineering as a discipline - https://www.splunk.com/en_us/blog/learn/detection-engineering.html
- Security architect JD aggregate - https://www.velvetjobs.com/job-descriptions/security-architect
- CrowdStrike Falcon preliminary PIR - https://www.crowdstrike.com/en-us/blog/falcon-content-update-preliminary-post-incident-report/
- Microsoft on the 8.5M figure - https://blogs.microsoft.com/blog/2024/07/20/helping-our-customers-through-the-crowdstrike-outage/

**Infra / platform**
- Google SRE book, introduction - https://sre.google/sre-book/introduction/
- Google SRE, eliminating toil - https://sre.google/sre-book/eliminating-toil/
- SRE vs DevOps - https://sre.google/workbook/how-sre-relates/
- platformengineering.org, what is platform engineering - https://platformengineering.org/blog/what-is-platform-engineering
- Team Topologies key concepts - https://teamtopologies.com/key-concepts
- CNCF platforms white paper - https://tag-app-delivery.cncf.io/whitepapers/platforms/
- CNCF platform engineering maturity model - https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/
- Gartner platform-teams prediction (403 to fetch; via search index) - https://www.gartner.com/en/newsroom/press-releases/2023-11-28-gartner-hype-cycle-shows-ai-practices-and-platform-engineering-will-reach-mainstream-adoption-in-software-engineering-in-two-to-five-years
- Spotify golden paths - https://engineering.atspotify.com/2020/08/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem
- Humanitec DevOps benchmarking 2023 - https://humanitec.com/whitepapers/devops-benchmarking-study-2023
- Puppet State of DevOps 2023 / 2024 - https://www.prnewswire.com/news-releases/2023-state-of-devops-report-finds-platform-engineering-unlocks-devops-success-in-the-enterprise-301724764.html , https://www.prnewswire.com/news-releases/puppets-2024-state-of-devops-report-reveals-security-is-strengthened-by-platform-engineering-302092299.html
- DORA 2024 - https://dora.dev/research/2024/dora-report/
- Catchpoint SRE Report 2025 - https://www.catchpoint.com/press-releases/the-sre-report-2025-highlighting-critical-trends-in-site-reliability-engineering
- Catchpoint on the toil definition - https://www.catchpoint.com/blog/sre-report-2023-findings-from-the-field-toil
- InfoWorld, 8 platform engineering anti-patterns - https://www.infoworld.com/article/4064273/8-platform-engineering-anti-patterns.html
- Fowler, SnowflakeServer - https://martinfowler.com/bliki/SnowflakeServer.html
- CentOS Stream announcement - https://blog.centos.org/2020/12/future-is-centos-stream/
- RHEL lifecycle - https://access.redhat.com/support/policy/updates/errata
- Ubuntu release cycle - https://ubuntu.com/about/release-cycle
- Teams cert expiry - https://www.geekwire.com/2020/microsofts-slack-competitor-teams-due-expired-authentication-certificate/
- Ericsson cert expiry - https://www.itnews.com.au/news/expired-ericsson-cert-causes-uk-and-japan-mega-outages-516617
- CA/Browser Forum ballot SC-081v3 - https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/
- Slack Jan 2021 outage - https://slack.engineering/slacks-outage-on-january-4th-2021/
- AWS S3 Feb 2017 - https://aws.amazon.com/message/41926/
- Vogels, "you build it, you run it" - https://queue.acm.org/detail.cfm?id=1142065
- OVHcloud backup co-location ruling - https://www.blocksandfiles.com/data-protection/2023/03/23/ovhcloud-must-pay-damages-for-lost-backup-data/1594496
- Delta Aug 2016 - https://availabilitydigest.com/public_articles/1109/delta.pdf
- Cloudflare leap second 2017 - https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/

**Network**
- Senior network engineer JD - https://resources.workable.com/senior-network-engineer-job-description
- ITJobsWatch network engineer / sysadmin / CCIE / network administrator - https://www.itjobswatch.co.uk/jobs/uk/network%20engineer.do , https://www.itjobswatch.co.uk/jobs/uk/systems%20administrator.do , https://www.itjobswatch.co.uk/jobs/uk/ccie.do , https://www.itjobswatch.co.uk/jobs/uk/network%20administrator.do
- BLS network and computer systems administrators (403; via search index) - https://www.bls.gov/ooh/computer-and-information-technology/network-and-computer-systems-administrators.htm
- O*NET computer network architects - https://www.onetonline.org/link/summary/15-1241.00
- Uptime Institute Annual Outage Analysis 2026 - https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2026.AnnualOutageAnalysis.pdf
- Michelin, "actually it's not the network" - https://blogit.michelin.io/actually-its-not-the-network/
- APMdigest, guilty until proven innocent - https://www.apmdigest.com/network-teams-guilty-until-proven-innocent-just-ask-the-application-team
- BlueCat, Mean Time To Innocence - https://bluecatnetworks.com/blog/it-pros-debate-guilty-networks-speaking-up-the-stack-and-essential-career-skills/
- Hollingsworth, is it really always the network - https://networkingnerd.net/2016/12/23/is-it-really-always-the-network/
- McNamara, response - https://blog.michaelfmcnamara.com/2017/01/response-is-it-really-always-the-network-itnf/
- RFC 1191 (PMTUD) - https://www.rfc-editor.org/rfc/rfc1191.html
- RFC 2923 (PMTUD problems) - https://www.rfc-editor.org/rfc/rfc2923.html
- RFC 4821 (PLPMTUD) - https://www.rfc-editor.org/rfc/rfc4821.html
- GRE overhead - https://blog.ipspace.net/kb/Internet/PMTUD/40-tunnels/
- VXLAN overhead - https://www.juniper.net/documentation/us/en/software/junos/evpn/topics/topic-map/sdn-vxlan.html
- AWS Transit Gateway quotas - https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-limits.html
- Junos commit confirmed - https://www.juniper.net/documentation/us/en/software/junos/cli/topics/ref/command/commit.html
- Cisco revert/confirm - https://iosxrjunos.wordpress.com/2025/05/16/how-cisco-ios-ios-xe-implements-juniper-like-commit-and-rollback-behavior/
- reload-in as a safety net - https://yurisk.info/2024/12/07/fortigate-revert-configuration-as-a-safety-measure-analog-to-cisco-reload-in-or-juniper-commit-confirmed/
- Cloudflare / Verizon BGP leak 2019 - https://blog.cloudflare.com/how-verizon-and-a-bgp-optimizer-knocked-large-parts-of-the-internet-offline-today/
- Meta Oct 2021 - https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/
- CRTC on Rogers July 2022 - https://crtc.gc.ca/eng/publications/reports/xonarp2023.htm
- Spanning tree / loop protection - https://www.juniper.net/documentation/us/en/software/junos/stp-l2/topics/topic-map/spanning-tree-overview.html , https://networklessons.com/spanning-tree/spanning-tree-loopguard-udld , https://www.ciscopress.com/articles/article.asp?p=2995351&seqNum=3
- Duplex mismatch - https://en.wikipedia.org/wiki/Duplex_mismatch
- Dell on returned optics (83% no fault) - https://www.dell.com/support/kbdoc/en-us/000246018/contaminants-such-as-dust-on-fiber-optic-connector-end-face-causes-poor-io-performance
- Wool firewall misconfiguration studies - https://www.cse.iitd.ac.in/~siy107537/sil765/readings/computer2004.pdf , https://arxiv.org/pdf/0911.1240
- RFC 1925 / RFC 1149 - https://www.rfc-editor.org/rfc/rfc1925.txt , https://www.rfc-editor.org/rfc/rfc1149.txt
- Cisco TAC severity SLOs - https://www.ciscolive.com/c/dam/r/ciscolive/global-event/docs/2025/pdf/TACCX-1001.pdf

**Data / DBA**
- BLS database administrators and architects (403; via search index) - https://www.bls.gov/ooh/computer-and-information-technology/database-administrators.htm
- O*NET bright outlook, database architects - https://www.onetonline.org/help/bright/15-1243.00
- Stack Overflow Developer Survey 2025, work - https://survey.stackoverflow.co/2025/work/
- Database Reliability Engineering - https://www.oreilly.com/library/view/database-reliability-engineering/9781491925935
- Seeking SRE ch.16 - https://www.oreilly.com/library/view/seeking-sre/9781491978856/ch16.html
- dbt Labs, what is analytics engineering - https://www.getdbt.com/blog/what-is-analytics-engineering
- Ozar, DBAs in the cloud - https://www.brentozar.com/archive/2019/06/what-happens-to-dbas-when-we-move-to-the-cloud/
- Postgres routine vacuuming / wraparound - https://www.postgresql.org/docs/current/routine-vacuuming.html
- Sentry wraparound postmortem - https://blog.sentry.io/transaction-id-wraparound-in-postgres/
- Postgres ALTER TABLE / explicit locking - https://www.postgresql.org/docs/current/sql-altertable.html , https://www.postgresql.org/docs/current/explicit-locking.html
- gh-ost - https://github.com/github/gh-ost
- SQL Server error 9002 - https://learn.microsoft.com/en-us/sql/relational-databases/logs/troubleshoot-a-full-transaction-log-sql-server-error-9002
- GitLab Jan 2017 postmortem - https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/
- GitHub Oct 2018 post-incident analysis - https://github.blog/news-insights/company-news/oct21-post-incident-analysis/
- Salesforce NA14 May 2016 - https://www.theregister.com/2016/05/13/salesforcecom_crash_caused_data_loss/
- Oracle audit defence industry - https://palisadecompliance.com/oracle-license-audit-support/ , https://www.riministreet.com/wp-content/uploads/2024/09/Oracle-License-Audit-White-Paper-GLAS.pdf

**Certs and the identity layer**
- CompTIA Security+ / CySA+ / A+ and CE fees - https://www.comptia.org/en-us/certifications/security/ , https://www.comptia.org/en-us/certifications/cybersecurity-analyst/v4/ , https://www.comptia.org/en-us/certifications/a/core-1-v15/ , https://www.comptia.org/en-us/resources/ce/learn/continuing-education-renewal-fees/
- ISC2 pricing / AMF / experience / member counts - https://www.isc2.org/register-for-exam/isc2-exam-pricing , https://www.isc2.org/policies-procedures/amfs-overview , https://www.isc2.org/certifications/cissp/cissp-experience-requirements , https://www.isc2.org/About/Member-Counts
- OffSec PEN-200 and the OSCP+ expiry - https://www.offsec.com/courses/pen-200/ , https://help.offsec.com/hc/en-us/articles/29840452210580-Changes-to-the-OSCP
- GIAC pricing and renewal - https://www.giac.org/pricing , https://www.giac.org/renewal
- SANS SEC504 price - https://www.sans.org/cyber-security-courses/hacker-techniques-incident-handling
- Cisco recertification (403; secondary) - https://www.cisco.com/site/us/en/learn/training-certifications/certifications/recertification/index.html
- Juniper JNCIA-Junos - https://learningportal.juniper.net/juniper/user_activity_info.aspx?id=14354
- AWS certification pricing / recertification / partner tiers - https://aws.amazon.com/certification/certified-solutions-architect-associate/ , https://aws.amazon.com/certification/recertification/ , https://aws.amazon.com/partners/services-tiers/
- Microsoft renewal model and Solutions Partner for Security - https://learn.microsoft.com/en-us/credentials/certifications/renew-your-microsoft-certification , https://learn.microsoft.com/en-us/partner-center/membership/solutions-partner-security
- Google Professional Cloud Architect - https://cloud.google.com/learn/certification/cloud-architect
- Linux Foundation CKA/CKAD - https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/
- Red Hat "non-current" - https://www.redhat.com/en/services/certification/renewal
- LPI renewal - https://www.lpi.org/our-certifications/renewal/
- ITIL 4 Foundation - https://www.peoplecert.org/browse-certifications/it-governance-and-service-management/ITIL-1/itil-4-foundation-2565
- DoD 8570.01-M and DoDM 8140.03 - https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/857001m.pdf , https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/814003p.pdf
- PCI QSA/ISA qualification - https://listings.pcisecuritystandards.org/documents/QSA_Qualification_Requirements_v4.0.pdf
- NCSC CHECK - https://www.ncsc.gov.uk/schemes/check/information-for-providers
- The Register, IBM's 12-years-of-Kubernetes ad - https://www.theregister.com/2020/07/13/ibm_kubernetes_experience_job_ad/
- CCIE numbering - https://www.cbtnuggets.com/blog/certifications/cisco/how-many-ccies-are-there-in-the-world
- Skillsoft IT Skills and Salary methodology - https://investor.skillsoft.com/news-events/press-releases/detail/413/skillsofts-new-it-skills-salary-report-highlights-trends-impacting-technology-careers-investments-and-talent-strategies-for-2025
