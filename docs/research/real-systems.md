# Real-systems research: what the actual tools have vs what we ship

2026-07-30. Engineering reference for deepening the in-game apps (owner realism-depth mandate,
`DESIGN_POC.md` section 11). Facts only, everything cited; comedy gets layered elsewhere.
Per app: what the real tool has -> what we ship today (M2 state) -> credible additions ranked
P1 (cheap + high authenticity, fits M3/M4) / P2 (tier-2 sysadmin era) / P3 (flavor).

Rules of use: model the FIELDS and WORKFLOWS, not the vendors. No real product names in-game.

---

## 1. Ticketing (ServiceNow / Jira Service Management / Zendesk class)

### Real tool has

**Fields on an incident form** (ServiceNow default): number, caller, category/subcategory,
service/CI affected, short description + description, impact, urgency, priority (read-only,
computed), state, assignment group, assigned to, work notes, additional comments. Priority is
NOT hand-picked: it is derived from an impact x urgency lookup matrix and the field is
read-only on the form ([ServiceNow community][sn-prio], [Berkeley KB matrix][berkeley-kb],
[Snowball matrix guide][snowball]). Default 3x3: high impact + high urgency = P1 Critical;
both low = P4/P5; mixes land P2/P3 ([XAZA setup guide][xaza]).

**State model** is richer than open/closed: New -> In Progress -> On Hold -> Resolved ->
Closed. On Hold carries a mandatory reason sub-state: Awaiting Caller/User Info, Awaiting
Vendor, Awaiting Problem, Awaiting Evidence ([ServiceNow ITSM article][sn-workflow],
[Broadcom state values][broadcom-states]). Key real-world semantics:
- On Hold used correctly PAUSES the SLA clock - that is its whole point ([sn-workflow]).
- Resolved is not Closed: resolved = fix applied, awaiting user confirmation; auto-close
  happens days later if the user stays silent; reopening moves it back to In Progress
  ([sn-workflow]).

**SLA** is two separate timers per priority: response (first touch) and resolution. A common
ITIL-aligned baseline: P1 = 15 min response / 4 h resolution; P2 = 30 min / 8 business hours;
P3 = 2 bh / 24 bh; P4 = 8 bh / 72 bh. P1/P2 run 24x7, P3/P4 business hours
([Jitbit priority levels][jitbit], [Freshworks response-time guide][freshworks]). Response
SLA stops when the ticket is assigned/first answered; resolution SLA pauses On Hold and stops
at Resolved ([EasyDesk response vs resolution][easydesk]).

**Two comment streams**: work notes (internal only, rendered on a yellow background) vs
additional comments (customer-visible, may email the caller). Mixing them up is a classic
new-tech mistake ([Virginia Tech KB][vt-worknotes], [ServiceNow community][sn-comments]).

**Assignment**: tickets go to an assignment group (a queue) first, then a person picks up or
a dispatcher assigns; reassignment between groups is tracked (ServiceNow keeps a
reassignment count on the incident) and high counts are a "ticket ping-pong" smell
([sn-workflow]).

**Related tickets**: parent/child incidents - attach many identical incidents to one parent;
resolving the parent auto-resolves all children and copies the resolution comment to each
([ServiceNow community][sn-parent], [Rowan KB][rowan-parent]). Zendesk does the same with
Problem/Incident ticket types: solve the problem ticket, confirm, every linked incident
solves at once ([Zendesk problem-incident][zd-problem], [ScreenSteps guide][zd-screensteps]).
This is exactly the real mechanism behind our `flood` archetype.

**After resolution**: CSAT survey goes to the caller; ratings/comments land back on the
ticket record ([ServiceNow CSAT][sn-csat]).

### We ship today

Four states (open / waiting_on_user / breached / resolved), one SLA deadline, no priority
field, no assignment, no comment streams, clue lines, escalate flag, breach latch.

### Credible additions

- **P1 - Impact x urgency -> computed priority.** Ticket data carries impact + urgency;
  priority P1-P4 derived by the matrix, shown as a colored badge; SLA targets keyed off
  priority instead of a flat per-ticket number. The boss "urgent trash" trap becomes
  mechanical: high urgency + low impact = only P3. Cheap (data + one pure function) and the
  single highest-authenticity win.
- **P1 - Response vs resolution as two timers.** "First touch" (open the ticket / send any
  chat message to the reporter) stops the response timer; the resolution timer keeps running.
  Two SLA marks per ticket = triage texture for free.
- **P1 - On Hold reasons.** Rename waiting_on_user into an On Hold state with a reason enum
  (`awaiting_user`, `awaiting_vendor` for escalated hardware, `awaiting_change` later). SLA
  pause semantics already exist; the reason picker is UI only.
- **P1 - Worknotes vs customer-visible comments.** Ticket detail gets two text streams; the
  CYA mechanic ("did you actually ask?") becomes "is the question in the customer-visible
  stream?". Also the natural home for clue lines (worknotes) vs reporter dialogue (comments).
- **P2 - Assignment groups + reassignment.** Queues (Helpdesk L1, Desktop L2, Network) with
  an explicit reassign action; wrong-queue tickets as content; reassignment count on the
  scorecard.
- **P2 - Parent/child bulk-solve.** The maintenance-flood play implemented the real way:
  link identical tickets to a parent, resolve parent, children close with copied comment.
- **P2 - Resolved -> Closed with reopen window.** User confirms or ticket auto-closes after
  N sim-hours; occasional "it's still broken" reopen event.
- **P3 - CSAT.** Post-close star rating from the reporter feeding reputation; comedy surface
  but real mechanism ([sn-csat]).
- **P3 - Category/subcategory picker** on triage (Hardware/Software/Network/Access) feeding
  the day scorecard.

## 2. Directory ("Active Dictionary" vs real AD / Entra)

### Real tool has

**The account states techs actually distinguish** (and confuse at their peril):
- **Locked out** - automatic, from too many bad passwords; clears itself after the lockout
  duration or when a tech unlocks; caused by the lockout policy (threshold / duration /
  reset window) ([Specops lockout policy][specops-policy], [permSECURE locked vs
  disabled][permsecure]).
- **Disabled** - deliberate admin action (offboarding, security hold); a checkbox, never
  expires on its own ([permsecure], [windows-active-directory.com ADUC guide][wad-aduc]).
- **Expired password / expired account** - third and fourth distinct things
  ([windows-active-directory.com disabled vs expired][wad-expired]).

**Attributes on the lockout trail**: `badPwdCount` (bad attempts, kept per domain controller),
`lockoutTime`, last bad password attempt time; techs read these to answer "is it locked right
now and why" ([TheITBros unlock guide][itbros-unlock], [Specops unlock how-to][specops-unlock],
[Windows OS Hub lockout-source hunt][woshub-lockout]). The classic follow-up: account keeps
re-locking because a phone/mapped drive/scheduled task still holds the OLD password -
unlocking without finding the source just re-locks it ([woshub-lockout], [MS wiki frequent
lockouts][ms-lockouts]).

**ADUC Account tab** options techs touch daily: "Unlock account" checkbox, "User must change
password at next logon", "User cannot change password", "Password never expires", "Account is
disabled", account expiry date ([wad-aduc], [Jigsolving account-tab tour][jigsolving]).
Standard reset flow = set temp password + tick "must change at next logon".

**Structure**: users live in OUs (org tree); group membership via the Member Of tab; groups
have a scope (domain local / global / universal) and type (security / distribution)
([wad-aduc]). Profile tab holds profile path / home folder drive mapping. `lastLogonTimestamp`
answers "is this account even used".

**Delegation**: helpdesk gets delegated unlock/reset rights only, not domain admin - the
permission to unlock is literally read/write on `lockoutTime` ([4sysops delegation][4sysops]).
Unlock/reset IS the bread-and-butter L1 task ([Specops unlock how-to][specops-unlock]).

### We ship today

Account list + search, status line (Fine / Locked out / Disabled), owner person, group edges,
four actions (unlock, reset password, add/remove group).

### Credible additions

- **P1 - Lockout detail block**: bad password count, locked-since time, last logon. Turns
  unlock from a button press into a read: "3 bad attempts at 04:12 while on vacation" tells a
  story and teaches the real diagnosis.
- **P1 - Reset sets "must change at next logon"**: reset shows a temp password and sets the
  flag; a ticket class where the user then files "it says I must change my password, help"
  (the flag is the point).
- **P1 - Password expiry field**: `password expires: <date>`; expired-password tickets become
  visible in the directory instead of only in flavor text (vacation-expiry ticket already
  seeded).
- **P2 - The re-lock mystery**: account relocks minutes after unlock because a stale device
  keeps trying the old password; fix = find the device in the graph, not spam the unlock
  button. Real trope, perfect hidden-cause archetype ([woshub-lockout]).
- **P2 - OU tree navigation** + account expiry (contractor accounts), group scope labels on
  groups.
- **P3 - Profile path / home folder** fields (sets up the "files deleted = wrong folder" and
  missing-drive-mapping tickets), delegation flavor (buttons you do NOT have at tier 1,
  greyed with "insufficient rights" - the tier system in-fiction).

## 3. Services / spooler surface (services.msc class)

### Real tool has

**services.msc columns**: Name, Description, Status (Running / Stopped / blank), Startup Type
(Automatic / Automatic (Delayed) / Manual / Disabled), Log On As ([TheWindowsClub services
guide][twc-services]). Per-service properties tabs: General (start/stop/pause), Log On,
Recovery (first / second / subsequent failures -> restart service, run program, restart
computer, take no action), Dependencies (what this service needs, what needs it)
([twc-services], [Techbloat services walkthrough][techbloat]).

**Real spooler runbook** (the canonical L1 procedure):
1. `net stop spooler`
2. delete everything in `C:\Windows\System32\spool\PRINTERS` (the stuck jobs)
3. `net start spooler`
If it stays up, a corrupt job was the cause; if it crashes again, driver problem - go read
Event Viewer under `Applications and Services Logs > PrintService > Admin`
([Microsoft Q&A spooler reset][msqa-spooler], [Microsoft Learn spooler errors][ms-spooler],
[PaperCut spooler stability][papercut]).

**Event Viewer as the diagnosis surface**: System log, source Service Control Manager, Event
ID 7031 "service terminated unexpectedly" with exit code and recovery action taken; 7032 logs
the recovery attempt ([ManageEngine 7031][me-7031], [Anavem 7031 reference][anavem]). Levels:
Error / Warning / Information. The habit "service died -> check event log -> the event names
the culprit" is the actual troubleshooting loop.

### We ship today

Service nodes with running/stopped/wedged status, `restartable` data flag, printer
`queue_len`, honest two-step spooler fix (clear queue first, restart refuses on non-empty
queue), services shown in the Remote Assist taskbar and `services <machine>` in Cmd.

### Credible additions

- **P1 - Services panel on Remote Assist with real columns**: Name / Status / Startup Type /
  Log On As table instead of taskbar chips. Startup Type enables a whole ticket class:
  service set to Disabled or Manual "never starts after reboot" - fix = set startup type,
  not restart.
- **P1 - Event log (read-only) on the remote machine**: a scrolling list of
  time/level/source/event entries generated from graph mutation history (which the engine
  already records for determinism). Wedge events, lockout events, reboots all appear. This is
  the single best diagnosis surface we can add - see cross-cutting section.
- **P2 - Dependencies**: service A requires service B; stopping/starting order matters;
  ticket where the reported service is fine but its dependency is stopped (hidden-cause,
  mechanically real).
- **P2 - Recovery settings flavor**: "restart on first failure" as a visible property that
  explains why some services self-heal (and why the wedged one did not - recovery set to
  Take No Action).
- **P3 - Log On As failures**: service fails to start because its service-account password
  expired - joins the directory app to the services app in one ticket.

## 4. Remote support tooling (RDP / Quick Assist / TeamViewer / RMM class)

### Real tool has

**Attended session (Quick Assist / TeamViewer pattern)**: code-based connect; the USER must
consent to screen sharing, and view-only vs full control is a second, separate consent -
helper clicks "Request control", user grants it, and the user can revoke at any time
([Microsoft Learn Quick Assist][ms-qa], [Microsoft Support Quick Assist][ms-qa-support]).
In-session tools: laser pointer, annotation on the user's screen, text chat, pause/stop
([ms-qa-support]). Known real limitation: UAC elevation prompts appear on a secure desktop
the helper cannot see - the helper goes black-screen until the user (or admin creds) clears
it ([MS Q&A UAC black screen][msqa-uac]).

**Session toolbar (TeamViewer pattern)**: Ctrl+Alt+Del injection, monitor switching, file
transfer window, lock remote, notes left on the machine after session, and the reboot menu:
Log off / Reboot / Reboot in Safe Mode - with automatic reconnect after the reboot
([TeamViewer toolbar KB][tv-toolbar], [N-able safe-mode reboot][nable-safemode]).

**RMM background mode (NinjaOne/Datto class)** - the part most invisible to civilians: the
tech opens tools against the machine WITHOUT taking the screen at all. Device page shows CPU
graph, memory, disk, network adapters; background tools include Task Manager (PID, name,
CPU%), File Browser, Service Manager, Registry Editor, Event Viewer, remote
PowerShell/CMD - all while the user keeps working, none of it visible to them
([NinjaOne remote tools][ninja-tools], [NinjaOne background mode][ninja-bg],
[NinjaOne device details][ninja-device]).

### We ship today

Remote Assist opens straight onto the machine: static parody desktop, rotation CSS transform,
resolution text, service taskbar, tray. No consent step, no processes, no file transfer, no
reboot flow, no chat during session.

### Credible additions

- **P1 - Consent handshake**: connecting fires a chat beat - user must click Allow (they may
  be at lunch = forced On Hold; ties apps together). View first, "Request control" as a
  second step. Cheap (dialogue + one gate) and instantly recognizable to anyone who has done
  the job. Also the mechanical hook for the NPC-coverup gag already in the design (user
  panic-closes solitaire between consent and connect).
- **P1 - System info strip**: hostname, logged-on user, uptime ("last reboot: 47 days ago"),
  IP - all fields the graph already has or trivially adds. Uptime enables the eternal "have
  you tried turning it off and on" as honest diagnosis (pending_updates + huge uptime).
- **P1 - Reboot with reconnect**: reboot button, remote screen goes to a boot screen for N
  ticks, session resumes. Sells the fiction hard for one animation.
- **P2 - Background mode**: open Services/Processes/Event log panels on the machine WITHOUT
  the user's screen - the RMM reality, and mechanically the "diagnose without suspicion"
  path (user not interrupted = no chat consent needed, but you also cannot see what the user
  sees). Two modes = a real tradeoff.
- **P2 - Task manager panel**: processes with CPU% from graph state (the toolbar-infested
  slow-PC ticket gets an honest surface: 14 toolbars each eating CPU).
- **P2 - File transfer** (drop a driver/installer onto the remote machine as a fix step).
- **P3 - Ctrl+Alt+Del button, monitor count, session notes left behind, UAC black-screen gag
  as a ticket beat (real limitation, comedy-ready)** ([msqa-uac]).

## 5. Terminal (Cmd)

### Real tool has

The genuine L1 command set, all plausible on a helpdesk (CompTIA A+ syllabus tier,
[Professor Messer command-line troubleshooting][messer]):

| Command | What it is for | Output shape |
|---|---|---|
| `ipconfig` / `/all` | IP, mask, gateway; /all adds DNS, DHCP, MAC, lease times per adapter | labeled adapter blocks ([NetworksTraining IP commands][networkstraining]) |
| `ipconfig /flushdns` | clear stale DNS after a record change | one-line "Successfully flushed the DNS Resolver Cache." ([MilesWeb DNS commands][milesweb]) |
| `ping <host>` | reachability + latency | per-packet reply lines + loss/min/avg/max summary ([Utilize Windows][utilizewindows]) |
| `tracert <host>` | where the path dies | numbered hop list with 3 RTTs each ([utilizewindows]) |
| `nslookup <name>` | does DNS resolve, and via which server | server + resolved address block ([milesweb]) |
| `net user <user> /domain` | account status, last logon, password expiry, groups | labeled field list |
| `net stop/start spooler`, `sc query <svc>` | the spooler runbook + service state | sc prints STATE: 4 RUNNING etc. ([msqa-spooler]) |
| `gpupdate /force` | reapply all group policy now (mapped drives, printers arriving via GPO) | "Updating policy... Computer Policy update has completed successfully." ([NinjaOne gpupdate][ninja-gp], [InvGate gpupdate][invgate-gp]) |
| `sfc /scannow` | verify/repair protected system files; needs elevation | percent progress then one of three canonical verdict lines ([InventiveHQ repair guide][inventivehq]) |
| `chkdsk /f` | file-system repair; usually "schedule at next reboot?" | staged percentage output ([inventivehq]) |
| `whoami` / `whoami /groups` | who am I actually logged in as (wrong-account tickets) | `domain\user` + group table ([Learnmandu whoami][whoami-ref]) |
| `systeminfo` | OS version, uptime, RAM, hotfixes | long labeled list |

The pattern that matters: L1 rarely fixes via terminal alone - the commands are for LOOKING
(ipconfig, ping, nslookup, whoami, sc query) and a few blessed verbs (flushdns, gpupdate,
net stop/start).

### We ship today

11 commands: help, ping, users, unlock, resetpw, services, restart, rotate, queue,
clearqueue, ver. Ping exists; the entire ipconfig/DNS family, gpupdate, sfc, whoami,
systeminfo do not.

### Credible additions

- **P1 - `ipconfig` (+ `/all`, `/flushdns`)**: adapter blocks from machine `connected_to`
  edges; a stale-DNS ticket where flushdns is the fix. The most-typed command in the trade;
  its absence is the most visible gap.
- **P1 - `whoami` and `systeminfo`**: pure graph reads, high recognition, near-zero cost;
  `systeminfo` uptime feeds the reboot tickets.
- **P1 - `tracert` and `nslookup`**: walk `connected_to` edges hop by hop; a broken-DNS vs
  broken-route distinction becomes playable.
- **P1 - Rename toward real verbs**: `sc query`/`net user`-flavored aliases for the existing
  `services`/`users` commands (keep the friendly ones too) - costless authenticity.
- **P2 - `gpupdate /force`**: with a policy layer (mapped drives/printers as group-derived
  state), the classic "added to group but nothing changed until gpupdate/reboot" delay
  becomes honest mechanics.
- **P2 - `sfc /scannow` / `chkdsk`**: long-running commands with staged output = a real
  time-cost decision (terminal busy while SLA burns), verdict lines as loot.
- **P3 - Elevation**: some commands refuse without "run as administrator" - one refusal
  string, sells the whole Windows permission model.

## 6. Mail / comms

### Real tool has

Outage/maintenance comms follow a rigid template: system affected, scope of impact, current
status, workaround, next-update time - sent immediately on confirmation (before root cause is
known), then updates every 15-30 min for P1/P2 even when nothing changed, then a post-incident
summary ([StatusGator outage templates][statusgator], [Pickcel notification templates]
[pickcel]). Scheduled-maintenance mails go out well ahead, name the window and the affected
functionality, and STILL generate a flood of "internet broken" tickets during the window
(our `flood` archetype; trope already documented in `ticket-material.md`). Distribution lists
target all-staff vs affected groups ([DeskAlerts maintenance templates][deskalerts]).
Ticket systems also mail the caller automatically on state changes and public comments
([vt-worknotes] - additional comments email the customer).

### We ship today

Read-only inbox, one onboarding thread + one boss nag.

### Credible additions

- **P1 - Maintenance announcement mail + link-in-resolution**: the M3-planned flood beat,
  done the real way: announcement carries window + affected system; bulk-close action
  references it (pairs with parent/child from section 1).
- **P1 - SLA breach escalation mail**: already designed; template it like the real thing
  (which ticket, breached target, manager cc) - the CYA payoff surface.
- **P2 - Automated ticket-update mails**: reporter gets mail on your public comments (and
  replies to the ticket by replying to mail - late-reply mechanic gains a real channel).
- **P3 - Post-incident summary mail** after a recurring-arc ticket resolves (Friday-vacuum
  class) - the "what happened" note everyone at a real shop recognizes.

## 7. Knowledge base (KCS class)

### Real tool has

KCS v6 article structure: **Issue** (the problem in the user's words), **Environment** (what
product/OS/context it occurs in), **Resolution** (numbered steps), **Cause** (optional -
why), plus metadata ([Consortium KCS article structure][kcs-structure], [Consortium simple
template][kcs-template]). Article lifecycle states: Draft -> Review/Validated ->
Published (internal vs external visibility) -> Outdated/Retired ([BMC KCS overview][bmc-kcs],
[Jade Global KCS guide][jade-kcs]). Core loop: search the KB DURING ticket work, link the
article to the ticket when used ("link is the new solve"), flag-or-fix bad articles, create
a draft from the ticket when nothing matched ([kcs-structure], [Knowledge-base.software KCS
guide][kbs-kcs]).

### We ship today

Flat articles, one per pilot-ticket cause, linked from ticket detail via `kb_ref`.

### Credible additions

- **P1 - Issue/Environment/Resolution/Cause structure** on every article: it is a data-shape
  change, costs almost nothing, doubles as the learner path's pedagogy (Cause = the honest
  explanation the design already promises).
- **P1 - KB search from the ticket**: symptom-keyword search so the player can go
  ticket -> search -> article -> fix, the actual KCS loop, instead of only following a
  pre-baked link.
- **P2 - "Link article" as a scored action**: linking the right article on resolve = small
  reputation bonus (real-shop KCS metric); wrong-link = nothing (no punishment tax).
- **P2 - Article states**: a Draft article with a wrong step (flag-it side quest); validated
  vs draft badge.
- **P3 - "Create draft from ticket"** after solving a no-article ticket - pure flavor now,
  seam for a later contribution mechanic.

## 8. Helpdesk practice color (metrics, tiers, etiquette)

### Real tool has

- **L1/L2/L3**: L1 = first contact, runbook-driven, password resets/known issues, resolves
  30-60% of everything; L2 = deeper desktop/network work on escalations; L3 =
  engineering/root-cause tier ([EPAM support levels][epam], [DeskDay L0-L4 guide][deskday]).
- **The escalation handoff has required content**: what the user reported, what L1 tried,
  what did not work, logs/error codes attached; incomplete handoffs bounce back and burn
  time at L2 ([deskday], [Vertical Talent L1-L3 guide][vertical]).
- **First Contact Resolution (FCR)**: % of issues fully resolved on first interaction;
  industry standard 70-79%, 80%+ is world-class; each 1% FCR gain tracks with ~1% CSAT gain
  ([SQM Group FCR guide][sqm], [Zendesk FCR][zd-fcr]).
- **Queue management**: a dispatcher/shift-lead watches the unassigned queue, assigns by
  skill/load, chases aging tickets before breach, and owns the handover between shifts;
  managers track FCR alongside handle time and repeat-contact rate so speed does not eat
  quality ([Sprinklr FCR practices][sprinklr], [sn-workflow]).

### We ship today

Escalate = one flag; reputation is the only metric; no tiers, no FCR, no queue dynamics.

### Credible additions

- **P1 - Escalation form**: escalating requires filling "what I tried" (checkbox list built
  from actions actually dispatched on that ticket - the engine knows). Empty form = bounce-
  back mail from L2 with reputation sting. Teaches the single most real helpdesk lesson and
  reuses existing dispatch history.
- **P1 - FCR on the day scorecard**: solved-without-escalating-or-reopening %, with the real
  70-79% band as the review bar.
- **P2 - Shift-lead NPC**: assigns morning queue, pings about aging tickets pre-breach
  (a WARNING layer before the breach event - fairness + realism in one), runs the Friday
  review using the real metric names.
- **P3 - Repeat-contact tracking**: same user reopening = visible "3rd contact" badge.

---

## Cross-cutting: candidate game mechanics

### The impact/urgency -> priority matrix as triage gameplay

Real ticket systems make priority a COMPUTED value the tech influences by classifying impact
(how many affected) and urgency (how time-critical) ([sn-prio], [berkeley-kb]). As a
mechanic: tickets arrive with claimed urgency (the reporter always says high) but true
impact lives in the graph (one person vs a whole floor on that switch/printer/share).
The player sets impact+urgency at triage; the matrix assigns P1-P4; SLA clocks key off the
result. Mis-triage both ways has cost: over-prioritize boss trash = real P2s starve;
under-prioritize a real P1 = breach. This makes "triage IS gameplay" (DESIGN section 7)
mechanical instead of vibes, and the deadline-absurdity and boss-trap archetypes fall out of
the matrix for free. Effort: small (2 enum fields + 3x3 lookup + badge UI + SLA table).

### L1/L2/L3 escalation as gameplay AND career ladder

Real escalation is not failure - it is a workflow with required handoff content ([deskday]).
Mechanic: escalate opens a form; the "what I tried" list auto-populates from actions the
player actually dispatched on that ticket's nodes (engine dispatch log already exists for
determinism). Good handoff = clean transfer, small rep cost as designed; lazy handoff =
bounce-back with comedy L2 mail and bigger cost. The same tier model is the career arc
already in the design: the player IS L1 now, becomes L2 at sysadmin tier - meaning tickets
escalated in the helpdesk era can literally come back TO the player later (the game's own
tier system and the real-world model are the same shape, worth exploiting).

### Event Viewer as the diagnosis surface

The engine records every graph mutation with tick + actor for determinism. Rendered
per-machine as an event log (time, level, source, message: service terminated / account
locked / reboot / job stuck), that IS Event Viewer - the real tool where techs confirm
"service crashed at 09:14, exit code, restarted by recovery" ([me-7031], [ms-spooler]).
This upgrades the whole diagnosis game: recurring-arc tickets (Friday-vacuum class) become
solvable by READING (two outages, both Friday 17:00) instead of by being told; wedged vs
stopped becomes visible history; hidden-cause tickets get a second honest path next to chat
reveals. Highest depth-per-effort item in this document because the data already exists.

---

## Top 10 additions by authenticity-per-effort

1. **Impact x urgency -> computed priority matrix** (P1-P4 badges, SLA table keyed to it) -
   tiny code, transforms triage into the real thing.
2. **Per-machine event log from the existing mutation history** - data already recorded;
   biggest diagnosis-depth win available.
3. **Escalation handoff form auto-filled from dispatched actions** - reuses dispatch log,
   teaches the trade's most real lesson.
4. **`ipconfig` family + `whoami` + `systeminfo` in Cmd** - pure graph reads, the most
   recognizable commands in the profession.
5. **Remote Assist consent handshake + request-control step** - one dialogue gate, instantly
   authentic, and the mechanical hook for the NPC coverup gag.
6. **Response vs resolution as two SLA timers** - one extra timestamp, doubles SLA texture.
7. **Worknotes vs customer-visible comments** - two streams, upgrades the CYA mechanic to
   the real rule.
8. **Directory lockout detail (badPwdCount, locked-since, last logon) + reset sets
   must-change-at-next-logon** - fields on an existing panel; unlock becomes a read, not a
   button.
9. **KCS article shape (Issue/Environment/Resolution/Cause) + KB search** - data-shape
   change; the learner path becomes structurally identical to real KB work.
10. **Services panel with Startup Type column** - one column, one new action, one new ticket
    class (disabled service never starts after reboot).

---

## Sources

[sn-prio]: https://www.servicenow.com/community/itsm-forum/incident-priority-calculation-based-on-impact-and-urgency-weight/td-p/494691
[berkeley-kb]: https://berkeley.service-now.com/kb_view.do?sysparm_article=KB0014978
[snowball]: https://thesnowball.co/the-servicenow-priority-matrix-impact-and-urgency
[xaza]: https://xaza.tech/tips/servicenow-incident-priority-matrix-setup-guide
[sn-workflow]: https://www.servicenow.com/community/itsm-articles/servicenow-incident-workflow-how-incident-management-really-runs/ta-p/3469448
[broadcom-states]: https://knowledge.broadcom.com/external/article/142521/valid-values-for-status-for-servicenow-t.html
[jitbit]: https://www.jitbit.com/news/helpdesk-ticket-priority-levels/
[freshworks]: https://www.freshworks.com/itsm/sla/response-time/
[easydesk]: https://easydesk.app/blog/sla-response-time-vs-resolution-time
[vt-worknotes]: https://4help.vt.edu/sp?id=kb_article&sysparm_article=KB0013590
[sn-comments]: https://www.servicenow.com/community/itsm-forum/work-notes-additional-comments-visible-to-customer/td-p/396616
[sn-parent]: https://www.servicenow.com/community/it-service-management-forum/what-is-the-relationship-type-of-parent-child-incident/td-p/2418125
[rowan-parent]: https://support.rowan.edu/kb_view.do?sys_kb_id=a497b00fdb663600873cf6e9af9619a5&sysparm_media=print
[zd-problem]: https://support.zendesk.com/hc/en-us/articles/4408835103898-Working-with-problem-and-incident-tickets
[zd-screensteps]: https://www.screensteps.com/articles/problems-and-incidents-in-zendesk
[sn-csat]: https://www.servicenow.com/products/customer-service-management/what-are-csat-surveys.html
[specops-policy]: https://specopssoft.com/blog/active-directory-account-lockout-policy/
[permsecure]: https://permsecure.com/en/active-directory-users-locked-or-disabled-what-is-the-difference/
[wad-aduc]: https://www.windows-active-directory.com/complete-guide-to-active-directory-users-and-computers.html
[wad-expired]: https://www.windows-active-directory.com/difference-between-disabled-expired-and-locked-account.html
[itbros-unlock]: https://theitbros.com/unlock-user-account-in-active-directory-domain/
[specops-unlock]: https://specopssoft.com/blog/how-to-unlock-active-directory-account-lockouts/
[woshub-lockout]: https://woshub.com/troubleshooting-identify-source-of-active-directory-account-lockouts/
[ms-lockouts]: https://learn.microsoft.com/en-us/archive/technet-wiki/23497.active-directory-troubleshooting-frequent-account-lockout
[jigsolving]: https://jigsolving.com/user-account-attributes-part-5/
[4sysops]: https://4sysops.com/archives/delegate-permission-to-unlock-active-directory-accounts/
[twc-services]: https://www.thewindowsclub.com/open-windows-services
[techbloat]: https://www.techbloat.com/services-msc-step-by-step-guide-to-windows-services-management-in-2026.html
[msqa-spooler]: https://learn.microsoft.com/en-us/answers/questions/5876073/how-to-reset-or-stop-the-print-spooler-service-and
[ms-spooler]: https://learn.microsoft.com/en-us/troubleshoot/windows-server/printing/third-party-print-driver-print-spooler-error
[papercut]: https://www.papercut.com/kb/Main/FixingPrintSpoolerCrashes
[me-7031]: https://www.manageengine.com/products/eventlog/kb/event-7031-service-crash-help.html
[anavem]: https://www.anavem.com/en/windows-events/windows-event-id-7031-service-control-manager-service-terminated
[ms-qa]: https://learn.microsoft.com/en-us/windows/client-management/client-tools/quick-assist
[ms-qa-support]: https://support.microsoft.com/en-us/windows/apps/solve-pc-problems-remotely-using-quick-assist
[msqa-uac]: https://learn.microsoft.com/en-us/answers/questions/238459/uac-prompt-is-blocked-when-i-use-quick-assist
[tv-toolbar]: https://www.teamviewer.com/en/global/support/knowledge-base/teamviewer-remote/remote-control/remote-session-toolbar/
[nable-safemode]: https://documentation.n-able.com/remote-management/troubleshooting/Content/kb/How-to-Reboot-into-Safe-Mode-with-Networking-through-Take-Control-Teamviewer.htm
[ninja-tools]: https://www.ninjaone.com/docs/endpoint-management/remote-tools/remote-tools/
[ninja-bg]: https://www.ninjaone.com/docs/remote-and-quick-connect/background-mode/
[ninja-device]: https://www.ninjaone.com/docs/endpoint-management/device-details/
[messer]: https://www.professormesser.com/free-a-plus-training/220-901/network-troubleshooting-at-the-command-line-2/
[networkstraining]: https://www.networkstraining.com/windows-ip-commands/
[milesweb]: https://www.milesweb.com/blog/technology-hub/dns-commands-for-windows/
[utilizewindows]: https://utilizewindows.com/network-troubleshooting-using-ping-tracert-ipconfig-nslookup-commands/
[ninja-gp]: https://www.ninjaone.com/blog/gpupdate-how-to-force-a-group-policy-update/
[invgate-gp]: https://blog.invgate.com/gpupdate
[inventivehq]: https://inventivehq.com/blog/repair-windows-sfc-dism-chkdsk-commands
[whoami-ref]: https://learnmandu.com/blog/whoami
[statusgator]: https://statusgator.com/blog/it-outage-notification-templates/
[pickcel]: https://www.pickcel.com/blog/it-outage-notification-template/
[deskalerts]: https://www.alert-software.com/blog/scheduled-maintenance-email-template
[kcs-structure]: https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/040/010/020
[kcs-template]: https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/020/010
[bmc-kcs]: https://docs.bmc.com/xwiki/bin/view/Service-Management/IT-Service-Management/BMC-Helix-ITSM-Knowledge-Management/km262/Getting-started/Key-concepts/Knowledge-Centered-Service-overview/
[jade-kcs]: https://www.jadeglobal.com/blog/understanding-core-concepts-and-primary-principles-knowledge-centered-services-kcs
[kbs-kcs]: https://knowledge-base.software/guides/knowledge-centered-service-kcs-framework/
[epam]: https://www.epam.com/careers/blog/l1-l2-and-l3-support-what-you-should-know
[deskday]: https://deskday.com/understanding-it-support-levels-l0-l1-l2-l3-and-l4/
[vertical]: https://verticaltalentsolutions.com/l1-vs-l2-vs-l3-support-engineers-guide/
[sqm]: https://www.sqmgroup.com/resources/library/blog/fcr-metric-operating-philosophy
[zd-fcr]: https://www.zendesk.com/blog/customer-experience/retention/first-contact-resolution-friend-foe-frenemy/
[sprinklr]: https://www.sprinklr.com/blog/first-contact-resolution/
