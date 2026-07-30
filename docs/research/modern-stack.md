# Modern-stack research (wave 2): the 2020s IT surface

2026-07-31. Second research wave (owner mandate: the game must reflect what IT work looks
like in the 2020s - cloud consoles, SaaS identity, multiple ticketing systems - while
acknowledging that legacy coexists everywhere). Companion to
`docs/research/real-systems.md` (wave 1: ServiceNow/AD/services.msc/RMM/KCS classics -
NOT repeated here). Facts only, everything cited; comedy layered elsewhere.

Per area: the real 2020s surface -> which game tier it feeds -> ranked credible additions:
- **P1** = helpdesk-POC-relevant NOW (fits the existing engine)
- **P2** = sysadmin tier (M-later)
- **P3** = devops/cloud tier

Rules of use: model the FIELDS and WORKFLOWS, not the vendors. No real product names
in-game (parody names over real mechanics).

---

## 1. Identity / SaaS helpdesk (Entra ID + M365 admin class) -> HELPDESK tier, NOW

This is the single biggest wave-1 gap: wave 1 modeled on-prem AD unlock/reset; the actual
2020s L1 day is dominated by *cloud identity* work in the Entra / M365 admin portals,
layered ON TOP of the on-prem directory (hybrid - see section 7).

### Real surface

**Volume reality**: password/lockout issues alone are 20-50% of all help desk contacts
(Gartner figures cited across the industry; HDI put password-triggered calls at over 30%
of volume in 2024) ([Avatier reset volume][avatier-resets], [ManageEngine SSPR
cost][me-sspr], [Avatier SSPR adoption][avatier-sspr]). Vendor breakdowns consistently
put "Tier-0/Tier-1 identity + access" requests (password resets, access grants, VPN, MFA)
at 30-60% of total L1 volume ([Workativ service-desk chatbot guide][workativ]). Hardware
is a shrinking minority share; identity/SaaS is the modern queue's bread and butter.

**MFA reset / re-registration** - the modern equivalent of "unlock my account". User gets
a new phone -> Authenticator is device-bound -> they cannot approve sign-in prompts ->
helpdesk opens the user's Authentication Methods blade and clicks **"Require re-register
multifactor authentication"**, which wipes registered methods (Authenticator apps, phone
numbers, OATH tokens) and forces fresh setup at next sign-in ([MS Learn manage auth
methods][ms-authmethods], [MS TechCommunity re-register MFA][tc-reregister]). There are
distinct flavors of reset (revoke MFA sessions vs re-register vs deleting a single
method) and picking the wrong one is a classic L1 stumble ([Kuehn: three flavors of MFA
reset][kuehn-mfa]). Delegating this to helpdesk without full admin rights is its own
recurring pain (needs Privileged Authentication Admin class roles) ([MS Q&A helpdesk MFA
delegation][msqa-mfadeleg]). Verification matters: MFA resets are a prime social-
engineering vector, so real shops mandate identity-verification checklists before any
reset ([IT Support Group MFA reset checklist][itsg-mfa], [Nametag recovery gap][nametag]).

**MFA fatigue / push-bombing** - attacker spams push prompts until the user approves one
to make it stop; sometimes calls the user posing as IT support ("please approve the
prompt, we're troubleshooting"). Defense = number matching: instead of blind Approve,
the user types a code shown on the sign-in screen ([DeepStrike MFA fatigue][deepstrike],
[BeyondTrust MFA fatigue][beyondtrust], [Ping Identity][ping-mfa]).

**Self-service password reset (SSPR)** exists precisely to deflect the reset flood
(each manual reset costs ~$15-70; Forrester's number is ~$70) - but adoption is the
whole battle: users never register their security info, so they call anyway; the L1
reality is "reset their password AND nag them to register for SSPR" ([BleepingComputer
SSPR][bleeping-sspr], [Avatier SSPR adoption][avatier-sspr], [Specops SSPR registration
challenges][specops-sspr]).

**Conditional-access lockouts** - the modern "why can't I sign in": a CA policy blocks
the sign-in (untrusted location, non-compliant device, legacy auth client). Diagnosis
is real detective work: open Entra sign-in logs, filter to the failed sign-in, open its
**Conditional Access tab** to see which policy applied and why; the **What If tool**
simulates a sign-in (user + app + IP + device state) to predict which policies would hit
without needing a live failure ([MS Learn CA troubleshooting][ms-ca], [EasyEntra
which-policy-blocked][easyentra], [OneUptime What-If guide][oneuptime-ca]). House rule at
real shops: never disable a live policy to debug - use report-only mode ([oneuptime-ca]).

**License assignment** - the unglamorous constant: new hire has no mailbox / Office
won't activate ("license not assigned") -> check Billing > Licenses -> all E3/Business
Premium seats consumed -> free one (offboarded user still holding a license) or tell the
boss to buy more. Gotchas that generate tickets: usage location must be set before a
license can assign; group-based licensing fails silently when seats run out or service
plans conflict ([MS Learn assign licenses][ms-licenses], [MS Learn group-licensing
problems][ms-grouplic], [MS Learn license-not-assigned][ms-licerror]). SKU tiers
(E3/E5/Business Premium/F3) differ by features - "user can't use X because they're on
the cheap license" is a real ticket class.

**Shared mailboxes** - "give me access to info@" is a top-5 request. Two separate
permissions that everyone confuses: **Full Access** (open/read the mailbox) does NOT
include **Send As** (send mail as the mailbox) - grant only the first and the user files
a second ticket when their reply bounces ([MS Learn can't-send with Full
Access][ms-fullaccess], [Practical365 shared mailbox permissions][p365-shared],
[MS Learn shared mailboxes][ms-shared]). Auto-mapping means the mailbox just appears in
Outlook after a grant... eventually (propagation delay = "it doesn't work" ticket filed
five minutes after the grant) ([p365-shared]).

**OneDrive sync** - the modern "my files are gone": stuck "Processing changes", repeated
sign-in prompts, duplicate files, broken folder map. Root causes are corrupted local
cache / broken token; the canonical fix ladder is check portal first (files safe in
cloud?) -> re-auth -> `onedrive.exe /reset` full client reset ([USNH KB OneDrive
reset][usnh-od], [MS Learn OneDrive sync troubleshooting][ms-od], [MS Support repair sync
connections][ms-od2]). Known Folder Move means Desktop/Documents ARE OneDrive - so sync
trouble reads to the user as "my desktop vanished".

**Teams problems** - the canonical L1 move is clearing the Teams cache (close Teams,
delete the cache folder, relaunch); fixes stuck sign-in loops, missing meeting add-in in
Outlook, ghost profile pictures, general lag ([MS Learn clear Teams cache][ms-teams]).
Camera/audio device pickers and "can't join meeting" round out the class.

**Phishing-report handling** - users get a "Report Phishing" button in Outlook; reports
land in a security mailbox / quarantine pipeline and are re-evaluated to a verdict
(clean / phishing / inconclusive) ([Check Point user-reported phishing][cp-phish]). What
L1 actually does on a report or a "I clicked a weird link" call: capture sender +
original message, ask THE two questions (did you click? did you enter credentials?),
then act - if credentials entered: reset password + revoke sessions + check mailbox
rules; notify security ([Phin triage guide][phin-phish], [Abnormal reported-phishing
playbook][abnormal-phish]). Mail-rule persistence (attacker adds a rule forwarding or
deleting mail) ties directly to our existing `mail_rule` node kind.

### Feeds game tier

HELPDESK, now. This section is the modern half of the POC's ticket pool. The engine
needs almost nothing new: accounts already exist; MFA method, license, mailbox
permission, sync state are new FIELDS on existing node kinds plus a handful of registry
actions.

### Credible additions

- **P1 - MFA reset ticket class**: `account.mfa_methods` list + "require re-register"
  action; ticket = "new phone, can't approve sign-in". Wrong-flavor trap (revoking
  sessions instead of re-registering does nothing) mirrors the real stumble. Plus the
  verification beat: confirm identity in chat before resetting (CYA rule reuse).
- **P1 - License assignment**: `license_pool` node (total/assigned) + assign/unassign
  actions; "no seats left" forces the real fix - find the offboarded user still holding
  one. Joins the existing offboarding chain beautifully.
- **P1 - Shared mailbox Full Access vs Send As**: two separate grant actions; granting
  only Full Access resolves ticket A and spawns ticket B ("my reply bounced") unless the
  player knows the pairing. Textbook hidden-cause material, one edge type.
- **P1 - OneDrive sync ticket**: `machine.sync_status` field; fix ladder = check cloud
  (reassure user files exist) -> reset sync client. The "my desktop vanished" flavor
  is free comedy that is also literally real.
- **P1 - Phishing report ticket**: user reports mail -> two-question chat triage -> if
  credentials entered: reset password + remove attacker mail rule (existing `mail_rule`
  node!) + revoke sessions. Multi-step, teaches the real playbook.
- **P1 - Teams cache clear**: one action on the machine node, one recognizable fix.
- **P2 - Conditional-access lockout**: policy nodes with conditions; sign-in log surface
  showing which policy blocked; What-If-style simulator as a tier-2 tool. Needs a policy
  layer - sysadmin-tier depth.
- **P2 - MFA-fatigue incident**: user reports prompt spam -> correct play = do NOT tell
  them to approve; reset credentials, report to security. Security-arc seed.
- **P2 - SSPR nag mechanic**: tickets resolved faster if player sends the SSPR
  registration link; unregistered users keep coming back (repeat-contact texture).
- **P3 - Sign-in risk / impossible-travel events** as EDR-adjacent ticket sources.

## 2. Endpoint management (Intune / MDM / Autopilot class) -> HELPDESK + SYSADMIN

### Real surface

Modern fleets are enrolled in MDM (Intune class): compliance policies (encryption, OS
version, PIN) gate access - Conditional Access requires the device be marked compliant,
so a non-compliant device = user locked out of mail/Teams with a cryptic message
([MS Learn enrollment troubleshooting][ms-intune-enroll]). Classic failure texture:
device sits switched off for weeks -> falls out of compliance ("not active") -> user
returns from leave to a locked-out laptop ([MS Q&A autopilot non-compliant][msqa-intune]).
**Autopilot** = new laptop ships straight to the user, self-provisions on first boot;
when it fails it fails with hex codes (e.g. 80180014 = enrollment restrictions block the
device type) and the helpdesk gets "my new laptop is stuck on a spinner"
([WME Autopilot 80180014][wme-autopilot], [TechTarget Autopilot
troubleshooting][tt-autopilot]). In hybrid shops the Intune Connector for AD must be
running on an on-prem server or hybrid-join enrollment silently fails - a cloud symptom
with an on-prem cause ([ms-intune-enroll]). **Remote wipe** for lost/stolen devices is
the L1-visible big red button; devices that never enrolled can't be wiped, which is the
real sting of enrollment failures ([ManageEngine Intune enrollment KB][me-intune]).

### Feeds game tier

Split: compliance-lockout and "new laptop stuck" tickets are HELPDESK-shaped (diagnose,
re-enroll, escalate); policy authorship is SYSADMIN tier.

### Credible additions

- **P1 - Device compliance field**: `machine.compliant: bool` + `enrolled: bool`; ticket
  "can't open email on laptop after vacation" - cause is compliance lapse, fix =
  re-check-in action, not a password reset. Hidden-cause gold: the symptom says mail,
  the cause says MDM.
- **P1 - Remote wipe as offboarding step**: joins the existing offboarding chain; wiping
  the WRONG device is the obvious comedy failure with real-world weight.
- **P2 - Autopilot arrival ticket**: new-hire laptop provisioning with a hex-code error;
  fix at sysadmin tier (enrollment restriction), L1 play = correct escalation with the
  code captured (escalation-form reuse).
- **P2 - Hybrid-join connector**: on-prem connector service stopped = cloud enrollment
  fails; the legacy server strikes again (section 7 synergy).

## 3. Ticketing-system VARIETY -> the employer-switching mechanic

Owner design hook: different employer = different ticket app skin + workflow. The real
market splits into four families that FEEL genuinely different to the working tech.
Wave 1 documented the ServiceNow-class enterprise model (impact x urgency matrix, work
notes, assignment groups); this section maps the other families against it.

### The four families

**1. Enterprise ITSM (ServiceNow / BMC class)** - the wave-1 model. Process-maximal:
computed priority, change advisory boards, CMDB, mandatory categorization, SLAs on
everything. ServiceNow's automation depth "can practically run entire departments"
([Monrocloud honest reviews][monro], [Kanini ITSM comparison][kanini]). Feels like:
forms with twelve required fields; the process IS the product. Fits: the mega-corp
employer.

**2. Dev-adjacent ITSM (Jira Service Management class)** - queues + highly customizable
workflows, built for engineering-led IT; tickets link to dev issues, and the workflow
states are whatever the admin dreamed up ([Deviniti JSM vs Zendesk][deviniti],
[Monday SN vs JSM][monday-jsm]). Feels like: a kanban-ish queue where your ticket can be
"Blocked on DEV-4521". Fits: the tech-company employer where IT sits next to developers.

**3. Support-desk SaaS (Zendesk / Freshservice class)** - built for speed and simplicity;
Zendesk excels at customer-style support but is thin on deep ITSM ([Kanini][kanini],
[Corptec ITSM tools][corptec]). Freshservice = mid-market ITIL-lite with AI-assisted
auto-assignment ([Freshworks service desk][freshworks-sd]). Feels like: email-thread-
with-a-status, few mandatory fields, chirpy macros. Fits: the mid-size modern SaaS-first
employer.

**4. MSP PSA (HaloPSA / Autotask / ConnectWise class)** - the structurally different
one. Multi-tenant: one queue serves MANY client companies, strictly isolated (client A
must never see client B); a dispatcher (or routing rules) assigns by client, skill and
priority; tickets carry billable-time entries because time IS revenue; techs bounce
between unrelated client environments all day ([Syncro MSP ticketing][syncro-msp],
[OneIO MSP integration model][oneio], [Kaseya PSA guide][kaseya-psa], [ManageEngine PSA
ticketing][me-psa]). Feels like: same queue, five company names, timer running on every
ticket. Fits: the MSP employer - the biggest genuine workflow change available.

**5. Small-shop open source (osTicket / Zammad / GLPI class)** - free/cheap, email-first.
osTicket = "if your workflow fits on a whiteboard in five minutes" ([OTOBO open-source
comparison][otobo]); Zammad = the modern omnichannel one; GLPI = asset management that
happens to include ticketing (the inventory/CMDB angle) ([OpenMSP open-source ticketing
roundup][openmsp], [otobo]). Feels like: a shared inbox with numbers stapled on; half
the "process" lives in people's heads. Fits: the scrappy first employer.

### The intake pipeline differs too

Email-to-ticket is its own texture: systems thread replies via In-Reply-To/References
headers plus an encoded ticket ID in the subject; when threading breaks, a reply spawns
a duplicate ticket, and out-of-office auto-replies can loop ([Zendesk how emails
thread][zd-thread], [Freshdesk threading logic][fd-thread], [Natero why replies create
new tickets][natero]). Portal intake gives structured fields; email intake gives "HELP"
with no body (our vague-ticket archetype is literally the email-intake failure mode).
Small shops are email-first; enterprises push the portal; MSPs take everything including
phone calls the dispatcher types in.

### As a game mechanic (design synthesis)

- The engine already treats tickets as data and apps as plugins; a "ticket app skin" per
  employer is a UI + rules layer over the same graph:
  - **Small shop**: email-first intake (more vague tickets), no priority matrix, no SLA
    timers visible - the ANXIETY is social (owner walks over), not clock-driven.
  - **Mid-size SaaS shop**: Freshservice-class app, auto-assignment sometimes wrong
    (mis-routed tickets as content), portal + email mix, CSAT surveys.
  - **Enterprise**: full wave-1 model - matrix priority, work notes vs public comments,
    assignment groups, change windows. Process comedy ("ticket rejected: category
    missing").
  - **MSP**: multi-client queue with per-client SLAs and a billable-time timer - a
    genuinely new resource to manage (utilization %), plus the cross-client context-switch
    as difficulty. This is the most different and should be a mid-career employer.
- Employer switch = same verbs (the registry doesn't change), different form shapes,
  intake mixes, and metrics. That is exactly the real experience of changing jobs in IT:
  you know the work, you relearn the tool.
- P2 overall (needs employer-switch scaffolding), but the POC should keep ticket-app
  chrome behind a theme boundary NOW so the skin swap stays cheap (same rule as OS skins,
  DESIGN section 11).

## 4. Cloud consoles + IaC (AWS / Azure / GCP + Terraform class) -> DEVOPS/CLOUD tier

### Real surface

**What a junior cloud engineer actually touches**: EC2/VM instance lists (state, type,
tags), security groups / NSGs (inbound rule edits - "open 443 to the app subnet"), IAM
users/roles/policies (access requests: "give the contractor read access to the bucket"),
S3/storage buckets, RDS instances, load balancers; plus responding to monitoring alerts,
reviewing IAM access requests, fixing security findings (GuardDuty/Security Hub class),
and cost monitoring ([Velvet Jobs AWS engineer JD][velvet], [ITJobsWatch junior AWS
role][itjobswatch]). Console-first at junior level, migrating to IaC with seniority.

**Incident class: the public bucket.** Storage buckets misconfigured public are the
canonical cloud breach: Booz Allen (60k DoD files), Verizon (6M+ customer records, twice
in months), and a 2025 case of 273k bank-transfer PDFs sitting open ([Lightspin S3
risks][lightspin], [CloudStorageSecurity 273k PDFs exposure][css-s3]). Roughly 4% of the
average company's buckets are public and ~42% of objects COULD be public - "is this
bucket supposed to be public?" is a standing audit question ([lightspin]). Block Public
Access exists as the account-level seatbelt; someone disabling it for a "quick share" is
the incident seed ([Resourcely S3 incident review][resourcely]).

**Incident class: the surprise bill.** Forgotten resources burn silently: GPU instance
at $24/h left running, the test RDS running 24/7, and the star of the genre - the NAT
gateway (charges even when idle; one forgotten NAT gateway cost a 5-person startup
$600/month for eight months; a misconfigured one can do $10k in a weekend)
([PointFive bill root causes][pointfive], [RightSpend billing mistakes][rightspend]).
Data transfer (NAT, cross-AZ, cross-region) is the #1 driver of unexpected bills; the
defense is billing alarms/budgets - which someone has to have actually set up
([pointfive], [StackCost billing alerts][stackcost]).

**Incident class: tagging chaos.** Untagged resources = "who owns this?" - unallocated
spend (orgs can typically attribute only 40-60% of cloud spend), unknown security
posture, and the recurring ritual of mailing the whole engineering org about a mystery
VM ([Firefly cloud tagging][firefly-tags], [LeanOps unowned spend][leanops]). Tag
policies decay: compliance drops below 50% within months of the policy memo
([firefly-tags]).

**Terraform/OpenTofu workflow reality**: plan -> review the diff -> apply; state file
tracks code-to-reality mapping. **Drift** = reality diverging from state, and its #1
cause is the mid-incident console edit: engineer bumps an autoscaling group by hand at
2am, fix works, nobody backports it; three months later `terraform plan` shows a diff
nobody remembers, and applying would silently REVERT the emergency fix ([Encore
Terraform drift][encore-drift], [Spacelift drift detection][spacelift-drift],
[HashiCorp resource drift tutorial][hashi-drift]). "Who applied manually?" is thus a
real incident archetype with a built-in whodunit structure. State itself is a failure
surface (locked state, lost state, two people applying at once)
([Dev.to Terraform state explained][devto-state]).

### Feeds game tier

DEVOPS/CLOUD tier (P3 by definition), but the ENGINE seam matters now: the design's
"declared-graph vs actual-graph diff" (DESIGN section 5) is exactly Terraform's
state-vs-reality model - the research confirms the planned architecture matches the real
tool's mental model, no rework needed.

### Credible additions (all P3, ranked within tier)

- **P3.1 - The manual-change drift incident**: plan shows an unexplained diff; applying
  blind reverts someone's emergency fix and BREAKS prod; correct play = read the audit
  log, find who/why, codify the fix first. The best cloud-tier ticket in one mechanic,
  and it exercises the declared-vs-actual engine directly.
- **P3.2 - The public bucket**: security finding fires -> is it supposed to be public?
  (one bucket genuinely hosts the website; one holds HR exports). Judgment call +
  blast-radius comedy.
- **P3.3 - The surprise bill**: monthly bill event; hunt the forgotten resource via a
  cost-by-tag view that is useless because nothing is tagged; fix = tag sweep + kill the
  orphan + set the billing alarm that should have existed.
- **P3.4 - Security-group / IAM access requests** as the cloud tier's bread-and-butter
  ticket class (the password-reset of cloud): open port X, grant role Y, least-privilege
  pushback as the correct play.
- **P3.5 - Console skins**: AWS-ish / Azure-ish parody consoles as apps over the same
  graph; region selector showing resources "missing" because wrong region = free
  authentic comedy.

## 5. Monitoring / alerting / on-call / EDR -> SYSADMIN + DEVOPS tiers

### Real surface

**The stack by shop size**: Uptime Kuma class for "is it up + status page" at small
scale; PRTG (sensor-based, Windows-first; 5 servers + a switch already eat 100 sensors)
and Zabbix in SME on-prem; Prometheus + Grafana as the dashboard layer; Datadog-class
SaaS where budget allows (host-based pricing gets expensive fast: 50 hosts = $1.5-3k/mo)
([Yamanlar Zabbix vs PRTG vs Grafana][yamanlar], [Hyperping server monitoring
picks][hyperping], [CloudPap Uptime Kuma vs Grafana][cloudpap]).

**Alert fatigue is the defining pathology**: the average on-call engineer receives ~50
alerts/week of which only 2-5% need a human; teams report 2000+/week with 3% actionable;
67% of engineers admit ignoring alerts without investigating; 85% of teams say the
majority of their alerts are false positives ([OneUptime alert fatigue + PagerDuty 2025
State of Digital Operations figures][oneuptime-fatigue], [incident.io 2025 alert-fatigue
survey][incidentio], [PagerDuty alert fatigue][pd-fatigue], [Atlassian alert
fatigue][atl-fatigue]). The real skill is triage: which of the 50 is the one. Paging
(PagerDuty/Opsgenie class) adds escalation policies - unacknowledged page escalates up
the chain, which is how the sleeping tech's phone becomes their manager's phone.

**Status pages** (Statuspage/Uptime Kuma class): during an outage the status page is the
deflection tool - post "investigating" early and the "is it down?" ticket flood drops;
forget to post and the queue drowns ([Status.io status page as support agent][statusio],
[OpenStatus reduce tickets][openstatus], [Atlassian incident communication][atl-comms]).
This is mechanically our `flood` archetype with a publish-the-banner counter-action.

**EDR alerts as ticket source** (Defender/CrowdStrike class): endpoint detections land
in a queue; triage = classify (process/network/file), check if it's a known admin tool
or IT script behaving suspiciously (huge false-positive class), then contain (isolate
host, quarantine file) if real ([Prophet Security EDR triage][prophet-edr]). From the
user's side: "my file vanished / a scary red popup says threat quarantined" - and the
helpdesk-facing workflow is the false-positive/exclusion request path ([UMD CrowdStrike
false-positive KB][umd-cs]). Isolating a host cuts the user off mid-work - correct
security action, guaranteed angry ticket: built-in tension.

### Feeds game tier

SYSADMIN tier primarily (the player becomes the person the alerts page); EDR-origin
tickets work at HELPDESK tier now as ticket flavor; full on-call loop is sysadmin/devops.

### Credible additions

- **P1 - EDR-flavored tickets**: "antivirus ate my file" ticket where the fix is restore
  from quarantine + report false positive (scareware-popup ticket's honest sibling -
  one is fake, one is real, teaching the difference IS the content).
- **P2 - Monitoring dashboard app**: per-service up/down + history from the graph's
  existing mutation log (wave-1 event-log surface reused at fleet scale); maintenance-
  window banner action = the flood counter.
- **P2 - Alert queue with fatigue as gameplay**: N alerts arrive, 2-5% real (the actual
  ratio, cited above); acking everything blindly = miss the real one; the skill is
  correlating (three disk alerts, one host). Alert fatigue is the sysadmin tier's
  version of the helpdesk queue.
- **P2 - Status page publish action**: during an outage, posting "investigating" halves
  incoming flood tickets; forgetting it doubles them. One boolean, real dynamics.
- **P3 - On-call rotation + paging**: after-hours page events with escalate-if-unacked
  timers; the sleep-interruption economy as the devops tier's stress mechanic.

## 6. Comms reality (Teams/Slack as the actual support channel) -> HELPDESK tier, NOW

### Real surface

**The DM bypass** is the defining modern workflow pathology: users DM a tech they know
instead of filing a ticket; DMs kill queue visibility, SLA tracking and auditability,
and the work becomes invisible ("you didn't close anything today" says the dashboard,
after eight hours of DM support) ([Suzan's field notes: the Slack DM
problem][slackdm], [ClearFeed conversational ticketing][clearfeed], [Siit Slack
ticketing][siit]). The countermeasure industry ("conversational ticketing") exists to
intercept DMs/threads and mint tickets from them so the chat stays but the queue sees it
([clearfeed]).

**Chatbot / self-service deflection**: Tier-0 bots + KB deflect 20-40% at baseline and
40-70% when the bot can actually DO things (reset a password); password-reset-class
requests hit 70-90% containment ([InvGate ticket deflection][invgate-defl], [Chatbase
service-desk chatbots][chatbase], [DevRev deflection][devrev]). The user-side texture:
everyone has fought a bot that won't hand them to a human.

### Feeds game tier

HELPDESK, now - Chat is already a POC app; this is content + one mechanic, not new
surface.

### Credible additions

- **P1 - The DM bypass mechanic**: NPCs sometimes DM the player directly instead of
  filing tickets. Fixing DM-work earns gratitude but NO ticket credit (the day scorecard
  can't see it); correct play = "please file a ticket" (costs goodwill) or convert the
  DM to a ticket (small time cost, keeps both). This is the single most modern-feeling
  workflow truth available and it fits the existing chat app.
- **P1 - "Have you tried the portal" beat**: some tickets arrive pre-chewed by the
  self-service bot ("Bot tried: password reset. User says: still broken") - deflection
  as flavor that also sets up why the surviving queue is the WEIRD stuff (which
  justifies the game's whole ticket mix, mechanically).
- **P2 - Bot-frustrated user archetype**: user arrives pre-angry from a deflection-bot
  loop; opening move in chat matters more (QoL/UX texture, cheap).

## 7. Legacy coexistence -> WORLD-BUILDING texture (owner mandate)

### Real surface

The authentic 2020s shop is NOT all-modern: it is modern SaaS + a haunted on-prem layer.

**The numbers**: 62% of organizations still run legacy software (2025 survey of 500 US
IT pros); 79% say legacy apps hinder their modernization; 60-80% of IT budgets go to
keeping existing systems running; 52% of orgs still run more than half their workloads
on-prem ([Saritasa 2025 legacy survey][saritasa], [VentureBeat legacy report][vb-legacy],
[DreamFactory modernization stats][dreamfactory]). Windows Server 2012/2012 R2 went EOL
October 2023 and 2008/2008 R2 years earlier, yet both persist in production behind paid
Extended Security Updates and, past even those, behind nothing at all ([Lansweeper
Windows Server EOL][lansweeper], [IsItPatched EOL table][isitpatched]). The blockers are
human: lack of skills (33%), budget (26%) - not ignorance ([saritasa]). The classic
shape: ONE critical line-of-business app (the ERP, the door-badge system, the label
printer server) that only runs on the old box, vendor long dead ([Stromasys legacy OS
support][stromasys], [ModLogix who still runs legacy][modlogix]).

**Hybrid identity is the default company shape**: mid-size orgs run on-prem AD DS AND
Entra ID simultaneously, synced by Entra Connect; identities originate on-prem (AD is
authoritative; Entra is effectively a synced replica), while M365/SaaS auth happens in
the cloud ([Adcyma hybrid AD + Entra][adcyma], [IS Decisions hybrid identity][isdec],
[Zluri hybrid IGA at 2000 users][zluri]). Practical L1 consequence: a password reset
done on-prem takes a sync cycle to reach the cloud ("I reset it but Office still says
wrong password"); some attributes can only be fixed on the AD side; and when the sync
service on its on-prem box stalls, cloud symptoms appear with an on-prem cause.

### As world-building (design synthesis)

- **The default employer IS the hybrid shop**: on-prem AD (wave-1 directory app) AND
  cloud identity (section 1) in one company. This is not a compromise between eras - it
  is the statistically dominant real shape, and it lets both research waves' content
  coexist in one ticket pool.
- **The haunted legacy server as recurring character**: one Windows-Server-2008-class
  box ("do not reboot - runs the door badges / label printer / ERP") that appears across
  the whole career: at helpdesk tier it explains weird tickets (the one printer that
  needs the old driver share); at sysadmin tier the player inherits KEEPING it alive
  (ESU renewal mail, full disk, the UPS it's plugged into); at devops tier the
  migration-that-never-happens is the running gag with a real punchline (62% of shops,
  cited above). Persistent named machine node in the company graph = cheap to build,
  compounding narrative value.
- **Sync as mechanic (P2)**: `synced_to_cloud` state on directory changes with a
  sim-minutes delay; the "reset worked but cloud says no" ticket teaches hybrid reality
  honestly; the stalled sync service on the legacy box is a hidden-cause archetype that
  unifies sections 1, 2 and 7 in one incident.
- **Tone guardrail**: per the owner's mandate this is AUTHENTIC texture, not a joke
  about incompetence - real shops keep the old box for rational reasons (budget, skills,
  the app has no successor). The comedy is recognition: everyone has met this server.

## 8. VPN / zero-trust -> HELPDESK now (flavor) + SYSADMIN tier (infra)

### Real surface

**Classic VPN client reality**: the POC already seeds "expired VPN password"; the deeper
truth is certificate plumbing. Always-On VPN class failures: expired machine cert on the
RAS server, missing root cert on the client, NPS server cert expired, server-name
mismatch - and the signature incident: ALL clients suddenly fail with "certificate
verification failed" because a cert in the chain expired at once ([MS Learn AOVPN
troubleshooting][ms-aovpn], [ConfigJon AOVPN troubleshooting][configjon], [OpenVPN
server-failure guide][openvpn-cert]). Cert expiry is the "everyone at once, on a
schedule nobody watched" outage class - a perfect recurring-arc seed. Plus the eternal
user-side classics: works in office / fails at home, captive-portal hotel wifi, "VPN
slow" (it's the hairpin routing).

**ZTNA replacement wave** (Tailscale / Cloudflare Access class): identity-based,
per-application access replacing the network-wide tunnel; device posture + user identity
checked continuously; some modes clientless entirely ([TechnologyMatch ZTNA
comparison][ztna-cmp], [Cloudflare VPN replacement][cf-vpn], [Tailscale zero-trust
networking][ts-zt]). Support-side effect: fewer "VPN down for everyone" events, but a
new failure vocabulary (device not compliant -> access denied per-app - which loops back
to section 2's compliance mechanics). Transitions run 6-18 months with both systems live
([ztna-cmp]) - meaning the REALISTIC shop runs classic VPN AND the new thing during a
migration, which is itself authentic texture (two remote-access systems, tickets about
which one to use).

### Credible additions

- **P1 - VPN cert-expiry flood**: all-remote-workers-down morning; bulk-close via the
  parent/child + announcement machinery already planned (wave-1 section 1); the fix is
  sysadmin-tier, L1's real job is comms + flood management. Teaches what L1 actually
  does in a mass outage.
- **P2 - Cert expiry dates as graph state**: `cert.expires` on service nodes with a
  watchable calendar - the sysadmin-tier "renew before it burns" plate-spinning
  mechanic (same shape as password expiry, bigger blast radius).
- **P2/P3 - ZTNA migration arc**: employer rolls out the zero-trust thing mid-game; both
  systems coexist; tickets shift from "VPN broken" to "access denied: device not
  compliant". A whole modernization story told in ticket flavor, riding on section 2's
  compliance fields.

---

## Top 10 additions by authenticity-per-effort - HELPDESK tier

(Modern-identity/SaaS focus; complements the wave-1 top-10, which remains valid.)

1. **MFA reset ticket class** ("new phone, locked out") - the signature 2020s L1 ticket;
   one list field + one action + a verification chat beat.
2. **The DM bypass mechanic** - NPCs DM-ing the player around the queue, with the
   no-ticket-credit sting; the most modern workflow truth, nearly free on the existing
   chat app.
3. **Phishing-report playbook ticket** - two-question triage, password reset + attacker
   mail-rule removal on "yes I clicked"; reuses `mail_rule` nodes wholesale.
4. **License assignment with an empty pool** - find the departed user still holding a
   seat; joins the existing offboarding chain; pure graph work.
5. **Shared mailbox Full Access vs Send As split** - grant one without the other and a
   follow-up ticket spawns; textbook hidden-cause from one extra edge type.
6. **OneDrive sync ticket** ("my desktop vanished") - reassure-then-reset fix ladder;
   one machine field.
7. **Device compliance lockout** ("email broken after vacation") - MDM cause behind a
   mail symptom; one boolean field, big hidden-cause payoff.
8. **VPN cert-expiry flood morning** - mass outage where L1's real job is comms +
   bulk-close; rides entirely on wave-1's planned parent/child machinery.
9. **EDR quarantine ticket** ("antivirus ate my file") - honest sibling of the seeded
   scareware ticket; restoring vs deleting teaches real-vs-fake threat reading.
10. **Self-service deflection flavor** - tickets arriving pre-chewed by the bot,
    justifying in-fiction why the player's queue is the weird stuff; pure flavor text,
    zero engine cost.

---

## Sources

[avatier-resets]: https://www.avatier.com/blog/password-resets-for-help-desk-tickets/
[me-sspr]: https://www.manageengine.com/products/self-service-password/blog/mfa/how-much-does-sspr-cost-your-organization.html
[avatier-sspr]: https://www.avatier.com/blog/self-service-password-reset-adoption-rates/
[workativ]: https://workativ.com/ai-agent/blog/service-desk-chatbot
[ms-authmethods]: https://learn.microsoft.com/en-us/entra/identity/authentication/howto-mfa-userdevicesettings
[tc-reregister]: https://techcommunity.microsoft.com/blog/nonprofittechies/how-to-re-register-mfa/4359805
[kuehn-mfa]: https://www.shankuehn.io/post/resetting-mfa-in-microsoft-entra-id-the-three-flavors-of-reset
[msqa-mfadeleg]: https://learn.microsoft.com/en-us/answers/questions/1919567/allow-helpdesk-workers-to-reset-require-re-registr
[itsg-mfa]: https://thisisanitsupportgroup.com/blog/mfa-reset-checklist-it-support-2026/
[nametag]: https://getnametag.com/newsroom/the-recovery-gap-addressing-the-security-risks-in-mfa-password-resets
[deepstrike]: https://deepstrike.io/blog/what-is-mfa-fatigue
[beyondtrust]: https://www.beyondtrust.com/resources/glossary/mfa-fatigue-attack
[ping-mfa]: https://www.pingidentity.com/en/resources/blog/post/mfa-bombing-dismantled.html
[bleeping-sspr]: https://www.bleepingcomputer.com/news/security/can-users-reset-their-own-passwords-without-sacrificing-security/
[specops-sspr]: https://specopssoft.com/blog/sspr-registration-challenges/
[ms-ca]: https://learn.microsoft.com/en-us/entra/identity/conditional-access/troubleshoot-conditional-access
[easyentra]: https://easyentra.com/how-to-identify-which-conditional-access-policy-is-blocking-user-sign-in/
[oneuptime-ca]: https://oneuptime.com/blog/post/2026-02-16-how-to-troubleshoot-microsoft-entra-conditional-access-policy-conflicts-using-the-what-if-tool/view
[ms-licenses]: https://learn.microsoft.com/en-us/microsoft-365/admin/manage/assign-licenses-to-users?view=o365-worldwide
[ms-grouplic]: https://learn.microsoft.com/en-us/entra/fundamentals/licensing-groups-resolve-problems
[ms-licerror]: https://learn.microsoft.com/en-us/office/troubleshoot/activation/license-not-assigned
[ms-fullaccess]: https://learn.microsoft.com/en-us/troubleshoot/exchange/mailflow/cannot-send-email-with-full-access
[p365-shared]: https://practical365.com/understanding-exchange-shared-mailbox-permissions/
[ms-shared]: https://learn.microsoft.com/en-us/exchange/collaboration-exo/shared-mailboxes
[usnh-od]: https://td.usnh.edu/TDClient/60/Portal/KB/Article/3953/OneDrive-Troubleshooting-Fixing-Sync-Issues-by-Resetting-OneDrive
[ms-od]: https://learn.microsoft.com/en-us/troubleshoot/sharepoint/sync/troubleshoot-sync-issues
[ms-od2]: https://support.microsoft.com/en-us/office/repair-sync-connections-in-onedrive-for-work-or-school-21aac895-9f32-4e3e-a75a-6f12824f0975
[ms-teams]: https://learn.microsoft.com/en-us/troubleshoot/microsoftteams/teams-administration/clear-teams-cache
[cp-phish]: https://sc1.checkpoint.com/documents/Harmony_Email_and_Collaboration/Topics-Harmony-Email-Collaboration-Admin-Guide/Managing-Security-Events/User-Reported-Phishing-Emails.htm
[phin-phish]: https://www.phinsecurity.com/blog/a-step-by-step-guide-to-analyze-and-triage-reported-phishing-emails
[abnormal-phish]: https://abnormal.ai/learning/user-reported-phishing-response-ai
[ms-intune-enroll]: https://learn.microsoft.com/en-us/troubleshoot/mem/intune/device-enrollment/troubleshoot-windows-enrollment-errors
[msqa-intune]: https://learn.microsoft.com/en-us/answers/questions/820461/auto-pilot-device-turning-non-compliant
[wme-autopilot]: https://windowsmanagementexperts.com/fix-intune-autopilot-error-80180014/
[tt-autopilot]: https://www.techtarget.com/searchenterprisedesktop/tip/How-to-troubleshoot-Intune-enrollment-with-Autopilot
[me-intune]: https://www.manageengine.com/products/active-directory-audit/kb/microsoft-intune/intune-enrollment-troubleshooting.html
[monro]: https://monrocloud.com/corporate-it/help-desk-software-comparison/
[kanini]: https://kanini.com/blog/itsm-software-comparison-2025-servicenow-vs-jira-vs-freshservice-vs-zendesk-vs-ivanti-vs-solarwinds/
[deviniti]: https://deviniti.com/blog/customer-it-service/jira-service-management-vs-zendesk/
[monday-jsm]: https://monday.com/blog/service/servicenow-vs-jira-service-management/
[corptec]: https://corptec.com.au/blog/atlassian/jira-service-management-vs-servicenow-zendesk-bmc-freshservice-top-itsm-tools/
[freshworks-sd]: https://www.freshworks.com/it-service-desk/software/
[syncro-msp]: https://syncrosecure.com/blog/msp-ticketing-system/
[oneio]: https://www.oneio.cloud/blog/msp-ticketing-system-integration
[kaseya-psa]: https://www.kaseya.com/blog/professional-services-automation-psa/
[me-psa]: https://www.manageengine.com/products/service-desk-msp/psa-ticketing-system.html
[otobo]: https://otobo-docs.softoft.de/en/ecosystem/open-source-ticket-systems-comparison/
[openmsp]: https://www.openmsp.ai/blog/ticketing-system-open-source
[zd-thread]: https://support.zendesk.com/hc/en-us/articles/8396827889946-How-are-incoming-emails-threaded-to-tickets
[fd-thread]: https://support.freshdesk.com/support/solutions/articles/50000011687-understand-threading-logic
[natero]: https://support.natero.com/support/solutions/articles/50000007998-why-is-a-customer-s-reply-to-a-ticket-creating-a-new-ticket-email-threading-
[velvet]: https://www.velvetjobs.com/job-descriptions/aws-cloud-engineer
[itjobswatch]: https://www.itjobswatch.co.uk/jv/Investigo/Junior-AWS-Engineer-Job-City-of-London-London-UK-4sg73h?jr=8n4--284
[lightspin]: https://blog.lightspin.io/risks-of-misconfigured-s3-buckets
[css-s3]: https://cloudstoragesecurity.com/news/anatomy-of-an-s3-exposure-273k-bank-transfer-pdfs-left-open-online
[resourcely]: https://www.resourcely.io/post/incident-review-s3-buckets-exposed
[pointfive]: https://www.pointfive.co/guides/why-your-aws-bill-jumped-2026-guide
[rightspend]: https://rightspend.ai/blog/7-aws-billing-mistakes-that-cost-companies-millions-2025.html
[stackcost]: https://stackcost.dev/how-to-set-up-aws-billing-alerts-to-avoid-surprise-cloud-bills/
[firefly-tags]: https://www.firefly.ai/academy/cloud-tagging
[leanops]: https://leanopstech.com/blog/cloud-cost-tagging-strategy-finops-2026/
[encore-drift]: https://encore.dev/articles/terraform-drift
[spacelift-drift]: https://spacelift.io/blog/terraform-drift-detection
[hashi-drift]: https://developer.hashicorp.com/terraform/tutorials/state/resource-drift
[devto-state]: https://dev.to/pandey-raghvendra/terraform-state-explained-what-it-is-how-it-works-and-why-it-breaks-1omp
[yamanlar]: https://yamanlarbilisim.com.tr/en/blog/server-health-monitoring-zabbix-vs-prtg-vs-grafana
[hyperping]: https://hyperping.com/blog/8-server-performance-monitoring-tools-to-consider-in-2026
[cloudpap]: https://cloudpap.com/blog/uptime-kuma-vs-grafana/
[oneuptime-fatigue]: https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view
[incidentio]: https://incident.io/blog/alert-fatigue-solutions-for-dev-ops-teams-in-2025-what-works
[pd-fatigue]: https://www.pagerduty.com/resources/digital-operations/learn/alert-fatigue/
[atl-fatigue]: https://www.atlassian.com/incident-management/on-call/alert-fatigue
[statusio]: https://blog.status.io/2025/03/25/why-a-status-page-is-your-best-support-agent-during-incidents/
[openstatus]: https://www.openstatus.dev/use-case/reduce-support-tickets
[atl-comms]: https://www.atlassian.com/incident-management/tutorials/incident-communication
[prophet-edr]: https://www.prophetsecurity.ai/blog/how-to-investigate-edr-alerts-triage-and-response
[umd-cs]: https://itsupport.umd.edu/itsupport/?id=kb_article_view&sysparm_article=KB0015961
[slackdm]: https://suzansfieldnotes.substack.com/p/the-slack-dm-problem
[clearfeed]: https://clearfeed.ai/blogs/conversational-ticketing-slack-guide
[siit]: https://www.siit.io/blog/slack-ticketing-system
[invgate-defl]: https://blog.invgate.com/ticket-deflection-itsm
[chatbase]: https://www.chatbase.co/blog/chatbot-service-desk
[devrev]: https://devrev.ai/blog/ticket-deflection
[saritasa]: https://www.saritasa.com/insights/legacy-software-modernization-in-2025-survey-of-500-u-s-it-pros
[vb-legacy]: https://venturebeat.com/business/report-79-of-orgs-report-legacy-apps-hinder-digital-transformation
[dreamfactory]: https://www.dreamfactory.com/hub/legacy-system-modernization-statistics
[lansweeper]: https://www.lansweeper.com/blog/eol/windows-server-end-of-life/
[isitpatched]: https://www.isitpatched.com/eol/windows-server
[stromasys]: https://www.stromasys.com/resources/legacy-operating-system/
[modlogix]: https://modlogix.com/blog/who-still-uses-legacy-software-and-why/
[adcyma]: https://adcyma.com/en/active-directory-entra-id-hybrid
[isdec]: https://www.isdecisions.com/en/blog/mfa/hybrid-identity-extend-on-premise-active-directory-identity-to-entra-id
[zluri]: https://www.zluri.com/eye-on-identity/iga-hybrid-active-directory-entra-id-lifecycle-management
[ms-aovpn]: https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/troubleshoot-always-on-vpn
[configjon]: https://www.configjon.com/always-on-vpn-troubleshooting/
[openvpn-cert]: https://openvpn.net/as-docs/server-failure.html
[ztna-cmp]: https://technologymatch.com/blog/tailscale-vs-twingate-vs-cloudflare-access-vs-zscaler-private-access-ztna
[cf-vpn]: https://www.cloudflare.com/sase/use-cases/vpn-replacement/
[ts-zt]: https://tailscale.com/use-cases/zero-trust-networking
