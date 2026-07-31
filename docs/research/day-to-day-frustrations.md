# Day-to-day frustrations research (wave 3): the interruption-and-attention layer

2026-07-31. Third research wave (owner mandate: the basic day-to-day frustrations of modern
office/IT work - the interruption/attention layer, not the tooling layer; named seeds:
surprise calls/huddles landing mid-task, meetings that could have been emails). Companion to
`real-systems.md` (wave 1: tool fidelity) and `modern-stack.md` (wave 2: 2020s surface -
owns multi-channel intake, the DM-bypass pathology, and alert-fatigue NUMBERS; not repeated
here). Facts only, everything cited; comedy layered elsewhere.

Per area: what published/discussed sources say -> how it maps to EXISTING mechanics
(stress/suspicion/reputation meters, day loop, chat, tickets, boss patrols -
`DESIGN_POC.md` sections 3 + 7) -> credible additions ranked:
- **P1** = cheap, fits current systems (event system, chat app, meters)
- **P2** = needs a new system/surface (calendar app, new mini-app, employer variation)
- **P3** = flavor only

Register note: some of this layer's truths live in studies (interruption science, meeting
science); others live in essays, community lore and named micro-sites (nohello, read-only
Friday). Both registers are cited as what they are - a well-known essay is a legitimate
source for "this is a recognized shared experience", not for a number.

---

## 1. Interruption science: what a context switch actually costs

### What the sources say

**The famous 23 minutes - and its real provenance.** The number everyone quotes ("it takes
23 minutes and 15 seconds to get back on task") traces to Gloria Mark (UC Irvine). The
paper usually cited for it, Mark/Gudith/Klocke CHI 2008 "The Cost of Interrupted Work:
More Speed and Stress", defines resumption lag but never actually prints the number - the
23:15 figure comes from Mark's interviews about her observational datasets, a sourcing gap
documented in detail by a debunk that chased every citation chain ([oberien: 23 minutes
15 seconds, right?][oberien], [Mark et al. CHI 2008 PDF][chi08]). What the underlying
observation work says: interrupted work that gets resumed the same day (81.9% of it) is
resumed on average in ~23 minutes - and NOT directly; people typically pass through about
two intervening tasks before returning ([oberien], [Addy Osmani summary][addyo]). So the
honest model is not "23 minutes of staring into space" but "the interrupted thing sinks in
the stack and resurfaces ~23 min later, two tasks deep".

**What the 2008 experiment actually found** is arguably better game material: interrupted
people finished the interrupted task FASTER (they compensate by working faster) - but at
the price of significantly higher stress, frustration, time pressure and effort
([chi08]). Interruption cost is paid in the stress meter, not only the clock.

**Interruption frequency, 2025 numbers**: Microsoft's 2025 Work Trend Index telemetry
across 30k+ knowledge workers puts it at an interruption every ~2 minutes during the
workday - ~275 meetings/emails/notifications per day ([Microsoft WTI: infinite
workday][wti-infinite], [SUCCESS summary][success-wti]).

**Attention spans on screens** (Mark's longitudinal observation): ~2.5 minutes on one
screen before switching in 2004, 75 seconds by 2012, ~47 seconds in recent data; and
about 44% of interruptions are SELF-interruptions - people break their own focus with no
external trigger ([University of California interview][uc-mark], [Dropbox/Mark
interview][dropbox-mark], [Steelcase podcast transcript][steelcase-mark]).

**Programmers specifically** (Parnin, ~10k programming sessions from 86 programmers +
414-programmer survey): after an interruption a programmer takes 10-15 minutes to make
the first edit; when interrupted mid-edit of a method, only 10% resumed in under a
minute; a programmer gets about ONE uninterrupted 2-hour session per day; people rebuild
context by re-navigating code, and some deliberately leave a compile error as a
breadcrumb ([Parnin: Programmer Interrupted][parnin], [InfoQ summary][infoq-parnin]).

**Benign vs malignant interruptions** - the literature distinguishes on two axes:
- **Relevance**: interruptions RELEVANT to the current task are less aversive and can even
  be beneficial (they carry usable context); irrelevant ones carry most of the damage
  ([daily synchronous work interruptions study][tandf-daily], [AoM Annals review of
  interruptions/task transitions][aom-annals]).
- **Timing**: interrupting at a subtask BOUNDARY is measurably less disruptive than
  interrupting mid-subtask ([opportune moments for task interruptions][opportune]).
The malignant archetype is therefore: unrelated topic, mid-subtask, demanding synchronous
response - which is exactly the surprise call (section 3).

### Maps to Workgrumble

The game already has the receiving end (stress meter, fumble mechanic >80) but no
interruption SOURCE beyond boss pings, and no cost model for being yanked off a task. The
science gives an honest, simple cost model: interruption mid-action = stress up + a short
refocus penalty; interruption between actions or on-topic = cheap or free. The 2008
finding (faster but stressed) maps directly onto the existing meters: interruptions
should rarely cost the player the SLA outright - they should cost stress, which cascades
into fumbles, which is the game's existing failure texture.

### Credible additions

- **P1 - Refocus penalty on forced interruption**: any event that steals the active
  window mid-action (call, walk-up, boss ping) applies a short "refocusing" state - next
  1-2 actions slower / fumble chance up - plus a stress tick. Scaled-down honest version
  of resumption lag; reuses the fumble machinery wholesale.
- **P1 - Benign/malignant distinction in event data**: interruption events carry
  `related_to_open_ticket: bool`. Related interruptions (reporter of your open ticket
  calls you) skip the refocus penalty - they ARE progress. Unrelated ones pay full price.
  Cheap field, teaches the real distinction ([tandf-daily]).
- **P1 - Timing model**: the event scheduler prefers firing interruptions mid-action
  (malignant) for antagonist events and between actions for neutral ones - one scheduler
  rule, mirrors the boundary finding ([opportune]).
- **P2 - Self-interruption temptation**: the slack apps already model this - surface it:
  idle slack-app icons occasionally badge/bounce, inviting a self-interruption (44% of
  the real problem is self-inflicted [uc-mark]). Resisting is free; the tell is the point.
- **P3 - Stack-not-void resumption flavor**: when the player returns to an interrupted
  ticket, the ticket detail shows "where was I..." with the last action highlighted -
  cosmetics of the two-intervening-tasks reality.

## 2. Meeting pathology

### What the sources say

**Meetings that could have been emails, quantified**: Rogelberg's survey work with
Otter.ai (632 employees across industries) found people spend ~18 hours/week in meetings
and rate about a THIRD of them unnecessary - they'd skip ~6h/week if kept in the loop -
with a projected waste of ~$25k per employee per year, ~$101M/year for a 5000+ employee
org ([Fortune on the Rogelberg/Otter study][fortune-mtg]). Broader survey aggregation:
over 55% of remote workers say a majority of their meetings could have been an email or
other async channel ([meeting overload statistics roundup][breeze-mtg]). Rogelberg's
larger body of work: only ~50% of meeting time is rated effective and engaging
([APA Monitor interview][apa-mtg]).

**Volume**: since Feb 2020 the average Teams user's number of weekly meetings roughly
tripled (+192%) and weekly meeting TIME rose 252%; average meeting length grew 35 -> 45
minutes ([Microsoft WTI hybrid work][wti-hybrid], [Microsoft: regain work-life
balance][wti-balance]).

**Back-to-back meetings measurably stress the brain**: Microsoft Human Factors Lab EEG
study (14 participants, four consecutive half-hour video meetings vs the same with
10-minute breaks): beta-wave activity (stress-associated) accumulates across
back-to-backs and SPIKES at meeting transitions; short breaks reset it and improve
engagement markers ([Microsoft WTI brain research][wti-brain], [CNBC
summary][cnbc-brain]).

**Meeting recovery syndrome**: Rogelberg's term for the cooling-off time after a bad
meeting - rumination plus co-rumination (finding a colleague to vent with); UK survey: 54%
say a poorly run meeting hurts their productivity afterwards, 53% need to talk to
colleagues to refocus ([apa-mtg], [Workplace Insight][wpi-mtg]). A bad meeting costs its
own duration PLUS a recovery tail.

**Maker's schedule vs manager's schedule** (Paul Graham, 2009 - the canonical essay):
managers live in one-hour slots; makers need half-day blocks; "a single meeting can blow
a whole afternoon, by breaking it into two pieces each too small to do anything hard in";
even a MERELY SCHEDULED afternoon meeting taxes the morning, because you can't commit to
anything ambitious with a wall coming ([Graham: Maker's Schedule, Manager's
Schedule][pg-maker], [Cal Newport commentary][newport-maker]).

**Recurring meetings nobody cancels ("zombie meetings")**: the asymmetry is structural -
a one-off meeting needs a reason to exist, a standing series needs a reason to STOP
existing, and nobody wants to be the person who cancels it; orphan series survive their
organizer leaving the company ([OfficeMaps: zombie meetings][zombie-faq], [Forbes: ban
the zombie meeting][zombie-forbes]). The famous field experiment: Shopify's 2023 purge
script deleted ~12,000 recurring meetings of 3+ people in one night (~322k hours/year)
and made organizers re-justify recreation; they also embedded a meeting-cost calculator
into the calendar invite flow showing the salary cost of the attendee list
([CNN][shopify-cnn], [Bloomberg][shopify-bloomberg], [Fast Company][shopify-fc]).

**Camera-on fatigue**: Bailenson's (Stanford VHIL) nonverbal-overload account - excessive
close-up eye gaze, constant self-view ("all-day mirror"), reduced mobility, and the
effort of consciously producing/reading nonverbal cues ([Stanford: why Zoom fatigue]
[stanford-zoom]); empirically supported at scale (9,787 participants) ([Bailenson et al.
follow-up, CHB Reports][vhil-pdf]). The causal field experiment: Shockley et al.,
Journal of Applied Psychology 2021, within-person design - camera ON predicts higher
same-day fatigue, and that fatigue reduces meeting voice and engagement; it is the
CAMERA, not the meeting count, doing the damage ([ScienceDaily on Shockley et
al.][shockley], [UGA summary][uga-camera]).

**Scheduling friction ("calendar Tetris")**: Doodle's State of Meetings work: organizing
a meeting takes ~30 minutes of back-and-forth on average and the iteration count grows
with participant count; 71% of professionals lose time weekly to unnecessary or
cancelled meetings; ~2h/week sits in meetings rated pointless ([Doodle State of Meetings
2019][doodle]).

### Maps to Workgrumble

The POC has NO meeting surface at all - and per the owner seed this is the wave's core
gap. The day loop (09:00-17:00, queue drip, lunch window) is exactly the structure a
meeting block perturbs: a mandatory 30-minute block mid-morning while the queue keeps
dripping and SLA clocks keep burning IS the maker/manager collision, mechanically. The
EEG finding (stress accumulates across back-to-backs, resets with gaps) is literally a
rule for the stress meter. Meeting recovery syndrome = a post-meeting stress tail unless
the player takes a slack-app breather - which makes the existing slack loop the honest
countermeasure, reinforcing the design's "slacking is genuinely optimal play".

### Credible additions

- **P1 - The mandatory meeting block**: calendar-less v1 - a morning mail/chat summons
  ("Team sync 10:30, camera on please"); at 10:30 a meeting window takes over, sim time
  advances, queue keeps dripping, SLA keeps burning. Attendance is compulsory (declining
  = boss event). Content = comedy dialogue; cost = time + stress; the could-have-been-
  an-email payoff lands when the meeting's entire outcome arrives as a 2-line recap mail.
  One scripted event + one window. The single most-requested authenticity beat of this
  wave.
- **P1 - Back-to-back stress rule**: meetings/interruption events within N sim-minutes of
  each other apply a stacking stress multiplier; any gap resets it ([wti-brain]). One
  scheduler check against the existing stress meter.
- **P1 - Meeting recovery tail**: after a bad-flavored meeting, stress decays SLOWER for
  a while unless the player opens a slack app or chats with the coworker NPC
  (co-rumination, [apa-mtg]) - wiring the real phenomenon into the existing
  stress-drain economy.
- **P1 - Camera-on modifier**: `camera_required: bool` on the meeting event; camera-on
  meetings cost more stress ([shockley]). One flag, one line of copy ("cameras on,
  please - we're a face-first culture").
- **P2 - Calendar app + zombie recurring series**: a real calendar surface showing the
  week; a recurring "Weekly Alignment Sync" whose original purpose nobody remembers; a
  multi-day social maneuver (ask around, find the orphaned organizer left the company,
  get it killed) = a recurring_arc ticket in meeting clothing ([zombie-faq]). Needs a
  new app surface - the natural M-later home for calendar Tetris and double-booking
  texture.
- **P2 - Meeting-cost gag with real numbers**: the calendar app shows attendee-salary
  cost per meeting (Shopify's real mechanism [shopify-fc]) - authentic satire, needs the
  calendar first.
- **P3 - Maker/manager flavor**: the dev NPCs in chat visibly guard their calendar
  blocks and mourn broken afternoons ([pg-maker]); pure characterization that IT players
  will recognize.

## 3. Notification and presence culture

### What the sources say

**Unannounced calls read as norm violations**: the etiquette consensus across advice
columns and worker forums is consistent - a cold video/Teams call without a heads-up
message reads as intrusive ("like dropping by someone's doorstep without warning"), and
because cold calls are the emergency channel, an unannounced one triggers an adrenaline
spike before the caller's (usually trivial) purpose is even known; the expected protocol
is ping-first ("got 10 min for a quick call?") ([Ask a Manager: what's up with
unannounced video calls][aam-calls], [Glassdoor forum thread][glassdoor-calls],
[Blind thread][blind-calls]).

**Huddles institutionalize the drop-in**: Slack's huddle feature is explicitly designed
for unscheduled, drop-in-anytime audio ([Slack on ad-hoc meetings][slack-adhoc]); the
practitioner countermeasure literature exists precisely because the drop-in couples
badly with focus work - each ping can cost minutes of reorientation, and surveyed
workers majority-report that chat tools hamper deep work ([Online Tool Guides: huddles
without constant interruptions][otg-huddles], [Thread Patrol: why Slack is
distracting][threadpatrol]).

**The no-hello problem**: named and codified by a family of micro-sites - the classic
[nohello.com][nohello-com] (2013), plus [nohello.net][nohello-net] and
[nohello.club][nohello-club]. The mechanism: a bare "hi" forces the recipient into a
synchronous wait while the sender types the actual question - "like calling someone and
putting THEM on hold" - and defeats async entirely (if the sender leaves, the recipient
faces a naked "hello" with nothing actionable). The fix is one rule: put the question in
the first message.

**Green-dot presence as performance theater**: presence indicators quietly became a
proxy for effort - people keep the app open to stay green, respond fast to LOOK engaged,
and feel status anxiety about showing Away while actually working ([Mattlar: Slack
status anxiety][mattlar], [Idle Pilot: beyond the green dot][idlepilot]). A whole
gray-market tool category exists just to fake the dot ([Status Holder: always
active][statusholder]) - the mouse-jiggler economy is the tell that the metric is load-
bearing somewhere it shouldn't be.

**After-hours pings and the "infinite workday"**: Microsoft 2025 WTI telemetry - the
average worker sends/receives 50+ messages outside business hours; meetings after 8pm up
16% year-over-year; by 10pm ~29% of active workers are back in their inbox; the workday
now starts at the first phone-glance before getting up ([wti-infinite], [HR Dive-class
summary][hcamag-wti]). The legal counter-wave is real: France's right-to-disconnect
(2017) and Australia's (2024 - employees may refuse "unreasonable" after-hours contact)
([CNBC: right to disconnect][cnbc-r2d], [CBC on Australia][cbc-r2d]).

**Urgency inflation**: when requesters self-rate priority, everything drifts to URGENT
and the tier becomes meaningless - the documented fix is exactly wave 1's model: let the
user claim urgency, have the agent set the real one ([Supportbench: priority
inflation][supportbench], wave-1 impact x urgency matrix).

### Maps to Workgrumble

This is the richest fit of the wave because the surfaces already exist. Chat is a POC
app; boss pings are an event class; suspicion is a meter. The missing piece is that the
player currently has no PRESENCE - no status of their own, and no incoming synchronous
demands. Adding a player status (Available/Away/DND) creates a genuinely novel meter
tradeoff: DND protects focus (fewer interruption events) but reads as slacking to the
boss (suspicion pressure) and as rudeness to users (reputation pressure) - the green-dot
anxiety literature says exactly this triangle is the real experience. The surprise call
is the owner's named seed and lands almost free on the existing event + chat machinery.

### Credible additions

- **P1 - The surprise call**: full-screen incoming-call modal (ringtone, the works)
  firing mid-action - the malignant interruption par excellence (section 1: unrelated +
  mid-subtask + synchronous). Options: accept (time + stress + refocus penalty; caller's
  matter is usually trivial - "could have been a chat message" as the recurring
  punchline), decline (caller-dependent: user = small rep sting, boss = suspicion event),
  or send "in a call, message me?" (the etiquette-correct play, unlocked as a learnable).
  Related-to-open-ticket calls (section 1 flag) are the benign exception that pays off
  knowing the difference. Owner seed #1, near-zero new surface.
- **P1 - Player presence status**: three-state toggle in the fake-OS tray. Available =
  normal event rates; DND = interruption events halved BUT suspicion ticks up while
  active and one boss archetype ("saw you were on Do Not Disturb all morning?") arms;
  Away-while-working = users escalate faster ("I can see you're not even online").
  One enum + event-rate modifiers on existing systems; encodes the whole green-dot
  literature ([mattlar], [idlepilot]).
- **P1 - No-hello beats**: chat NPCs open with a bare "Hi" / "Hello" / "quick
  question" and then... nothing, typing indicator cycling. Waiting costs sim time;
  replying "what's up?" starts the timer on their real question; a veteran-coworker NPC
  links the nohello page as flavor ([nohello-com]). Pure dialogue-data content on the
  existing chat app - the CYA "did you actually ask?" machinery already handles the
  question-asking mechanics.
- **P1 - Urgency inflation as data**: every user-filed ticket arrives claiming URGENT;
  the wave-1 priority matrix (player sets impact/urgency at triage) is the already-
  planned counter-mechanic - this wave just confirms the claimed-urgency field should be
  comedically uniform ([supportbench]).
- **P2 - After-hours ping tail**: at day end, a couple of pings land "overnight" and are
  shown at next-morning login (50+ messages outside hours is the real number
  [wti-infinite]); answering from the review screen = tiny rep gain, tiny stress
  carryover - the boundary-erosion tradeoff in miniature. Needs end-of-day surface work.
- **P3 - Right-to-disconnect poster** in the office art / an HR mail nobody follows
  ([cnbc-r2d]); mouse-jiggler gag item in a coworker's drawer ([statusholder]).

## 4. IT-specific daily friction: the desk as an intake channel

(Wave 2 owns the DM-bypass version of this pathology and the alert-fatigue statistics -
this section covers the PHYSICAL and affective layer only.)

### What the sources say

**The walk-up / shoulder tap**: formal literature is thin here by nature - the register
is worker forums and engineering-management practice. Worker threads document the
constant-interruption office as a top complaint and the shoulder tap as its emblem
([Blind: constant interruptions][blind-interrupt], [Blind: shoulder tap ok?]
[blind-shoulder]); the standard management prescription is channel-funneling - route
interruptions into tickets/queues so they become schedulable ([Blind threads above; the
prescription is also wave 1's whole ticketing model]). The ITSM version is the "please
put in a ticket" ritual: official service desks explicitly instruct users that
walk-ups/direct contact bypass prioritization and SLA tracking - the same
queue-invisibility argument as wave 2's DM bypass, in person ([UFIT ticket
prioritization][ufit]). The folk taxonomy ("while you're here...", the hallway ambush,
being the office printer person) lives in meme culture and is instantly recognized
([IT-support meme compilations][tiktok-meme]) - cite-able as shared experience, not as
data.

**On-call bleed - the feeling, not the numbers**: the sleep literature shows on-call
DAMAGES REST EVEN WHEN NOTHING HAPPENS: on-call nights show longer sleep onset, more
awakenings, lower subjective sleep quality even with zero actual calls - anticipatory
vigilance is the mechanism, and the effect is strongest when being on-call is
experienced as stressful ([Ziebertz et al., J Sleep Research][ziebertz], [pre-bed
anxiety and missing-the-alarm study][prebed]). Practitioner writing adds the texture:
inability to plan free time, the phantom-page check, the partner who also sleeps worse
([Rootly: on-call wellbeing][rootly]).

### Maps to Workgrumble

The boss-patrol machinery (footsteps cue, reaction window, desk-space presence) is
EXACTLY the machinery a walk-up NPC needs - same audio cue class, same interruption
shape, different payload: instead of catching you slacking, they hand you work outside
the queue. This gives the physical sibling of wave 2's DM bypass with near-total code
reuse, and the same honest dilemma (help now = goodwill but no ticket credit; "please
file a ticket" = credit but social cost). On-call proper is sysadmin-tier (wave 2 P3),
but the FEELING finding (anticipation alone degrades recovery) is a ready-made rule for
whenever that tier lands: on-call days should tax stress recovery, not just fire pages.

### Credible additions

- **P1 - The walk-up event**: coworker sprite appears at the desk edge (boss-patrol
  machinery reskinned), audio cue = approaching footsteps that resolve into a friendly
  "heyyy, while you're here..." - a mid-tier request delivered face-to-face. Choices
  mirror the DM bypass exactly (do it now / convert to ticket / decline), sharing its
  scoring rules so the two pathologies read as one system. The "while you're here"
  second-ask is the signature beat: resolving the walk-up's request spawns a follow-up
  ask ~50% of the time ("oh and one more thing-").
- **P1 - The printer-person tax**: one recurring NPC treats the player as their
  personal printer support regardless of ticket history - all their intake arrives as
  walk-ups/DMs, never tickets. A character built from the meme layer ([tiktok-meme]),
  running on the walk-up event, zero new mechanics.
- **P2 - Ticket-vs-tap policy as employer variation**: the small-shop employer (wave 2
  section 3) has NO enforced ticket policy - walk-ups are the norm and the queue is
  vestigial; the enterprise employer fines untracked work. Employer-switch content.
- **P3 - On-call dread rule (deferred to sysadmin tier)**: on nominal on-call days,
  stress decays slower all day even if no page fires ([ziebertz]) - one modifier to
  carry into wave 2's P3 on-call loop when built.

## 5. The small stuff with big texture

### What the sources say

**The 4:55pm request**: no dedicated study - the mechanism is the documented after-hours
boundary erosion (section 3, [wti-infinite]) meeting service-desk hour boundaries
(after-hours coverage only for genuine emergencies; a 4:55 Friday "urgent" request is
structurally a Monday ticket unless it's a real outage) ([MSU after-hours support
policy example][msu-hours]). The register is folklore; the game already seeded it - the
`friday-17:55 P1` cliffhanger ticket in DESIGN section 8 is this exact trope.

**Friday-deploy culture**: "never deploy on Friday" / read-only Friday is a genuine
community institution with a live counter-debate - the traditionalist case (no coverage
over the weekend, burnout lives in Friday deploys) vs the modern-DevOps case ("if you
can't deploy on Friday, your process is broken") ([HackerNoon: Deploy on Fridays, or
Don't][hackernoon-friday], [Fenton: go ahead, deploy on Friday][devto-friday], [AWS
Builder: 12 practices that make Friday deploys less scary][aws-friday]).

**Password-rotation day**: NIST SP 800-63B (finalized through Rev 4, 2024) explicitly
DROPS mandatory periodic rotation - forced 60/90-day changes push users into weak
incremental passwords (Summer2024! -> Summer2025!); the only sanctioned forced change is
compromise-driven ([Enzoic on 800-63B Rev 4][enzoic], [NIST guidelines
explainer][passwordus]). Orgs that still enforce rotation are out of step with the
standard - which is precisely the authentic texture: the player's own IT department
enforcing a policy the player's KB knows is deprecated.

**Hot-desking / desk booking**: hot-deskers waste ~18 minutes/day finding a workable
desk (~2 weeks/year); 67% report anxiety about finding a spot; 1 in 5 workers cite desk
shortage among their top reasons to avoid the office; a review of two dozen studies
found flexible-desking arrangements uniformly breed discontent ([Archie hot-desking
statistics][archie], [Korn Ferry: not so hot][kornferry], [FloorPlan Mapper: why
employees hate hot desking][floorplan]).

**Reply-all storms**: the canon incident is Microsoft's "Bedlam DL3" (Oct 14, 1997) - an
employee asked a 13,000-member distribution list to remove him, reply-alls (including
reply-all "stop replying all" scolds) generated an estimated 15M+ messages and downed
the Exchange infrastructure ([Bliss: I survived Bedlam3][bedlam], [Email storm,
Wikipedia][emailstorm]). It recurred at Microsoft via a GitHub notification
misconfiguration ensnaring 11,000+ employees in 2019 ([CBS News][cbs-replyall]).
Exchange Online now ships Reply-All Storm Protection - triggered at 10 reply-alls to
5,000+ recipients within 60 minutes, blocking further replies for hours
([Microsoft Tech Community][ms-rasp]).

**Timesheet / expense friction**: GBTA-cited processing research - one expense report
takes ~20 minutes and ~$58 to process; ~19% contain errors, each costing another ~18
minutes and ~$52 to fix; the friction is severe enough that some employees stop filing
small expenses entirely ([GBTA: pain points and expense reports][gbta], [Corpay
summary][corpay]).

**Mandatory training modules**: Gallup - of employees who took ethics/compliance
training, only 1 in 10 strongly agree they learned anything that changed how they work;
digital compliance training scores worst of all formats (17% rate it excellent); a
federal evidence review of mandatory computer-based trainings found little evidence of
effectiveness ([Gallup: hard truths about compliance training][gallup-training],
[VA evidence brief on mandatory CBTs][pubmed-cbt]). The lived texture - click-next-
click-next-quiz - is the mechanism behind those numbers.

**Calendar Tetris / double-booking**: organizing one meeting averages ~30 minutes of
back-and-forth, scaling with attendee count; 71% of professionals lose time weekly to
unnecessary or cancelled meetings ([doodle]) - the double-booked slot and the
"finding a time that works for 6 people" spiral are the felt version of those numbers.

### Maps to Workgrumble

These are mostly EVENT-DAY material: single scripted days or recurring micro-events that
ride the existing day loop and mail/chat/ticket apps, each one a recognition beat. The
Friday-17:55 seed already in DESIGN section 8 shows the pattern; this section supplies
its siblings. The reply-all storm is mechanically a mail-app flood (wave-1 `flood`
archetype in the inbox instead of the queue). Password-rotation day inverts the game's
usual direction: the player becomes the USER of a bad IT policy - strong comedy with an
honest KB payoff (the game's KB can cite the real NIST position, since the design
already commits to honest KB articles). Timesheets/training are end-of-week compliance
pressure that competes with ticket time - a real prioritization texture, not filler.

### Credible additions

- **P1 - Password-rotation day event**: mid-shift, the player's own fake-OS session
  demands a password change (with parody complexity rules rejecting attempts); a
  same-day KB article notes rotation is deprecated by the standards body - the honest
  layer under the joke ([enzoic]). One modal + one KB entry; also mechanically primes
  players for the wave-1 lockout ticket class (they now viscerally know why users
  write passwords on sticky notes).
- **P1 - Reply-all storm day**: a facilities all-staff mail ("cake in kitchen 3") starts
  the cascade; the inbox floods in real time (mail-app sibling of the flood archetype);
  correct player play = do nothing/mute, and a scripted colleague who replies-all
  "please stop replying all" makes it worse ([bedlam]). Ticket payoff: "my mailbox is
  full" tickets spawn from the storm - a hidden-cause chain riding existing systems.
- **P1 - The 4:55pm request class**: generalize the seeded friday-17:55 P1 into a data
  archetype - `arrives_minutes_before_close` tickets any day, with the real decision
  (start it and eat carryover stress vs triage honestly to tomorrow and eat the
  reporter's displeasure). The seed already exists; this is a field, not a feature.
- **P1 - Timesheet Friday**: before Friday close, a "submit your time" nag; filling it
  is a 1-minute mini-form (categories never match what the player actually did - honest
  comedy [gbta]); skipping = Monday escalation mail. Rides the mail app + day close.
- **P2 - Mandatory training module**: a "Cyber Awareness Annual Refresher - due
  Friday" window: N screens, Next buttons, a 3-question quiz whose answers are
  guessable without reading ([gallup-training]) - eats sim time against the queue, due-
  date pressure across the week. Needs a small new window/mini-app, hence P2, but the
  content writes itself and the time-vs-queue tension is real gameplay.
- **P2 - Hot-desk morning (employer variation)**: at the hot-desking employer, the day
  starts with a find-a-desk beat (booking app says one thing, reality another; monitor/
  dock missing at the booked desk = self-ticket) ([archie], [kornferry]). Employer-
  switch content with real numbers behind it.
- **P3 - Friday-deploy flavor**: the dev channel in chat runs the eternal argument
  (read-only-Friday believer vs continuous-deploy believer, both quoting real slogans
  [hackernoon-friday], [devto-friday]); the one Friday change that does slip through
  feeds the following Monday's queue - flavor now, sysadmin-tier mechanic later.
- **P3 - Expense-report gag**: monthly "your expense report was returned: receipt
  unreadable" mail loop ([gbta]) - payslip-adjacent joke surface, no mechanics.

---

## Cross-cutting: candidate game mechanics

### The interruption event family (one system, five payloads)

Sections 1-4 converge on ONE new engine feature: a first-class **interruption event**
that can fire mid-action, carrying `source` (call / huddle / walk-up / boss / no-hello
ping), `related_to_open_ticket`, `declinable` and `synchronous` flags. Every payload
then reuses the same cost model (refocus penalty + stress tick, waived when related),
the same choice grammar (accept / defer / decline, each with meter consequences), and
existing machinery (chat windows, boss-patrol presence, event scheduler). The science
justifies the shared model ([chi08], [tandf-daily], [opportune]); the owner's named
seeds (surprise call, huddle) are just two payloads of it. Build the family once and
this entire wave's P1 list becomes content data.

### Presence as the fourth meter surface

Stress, suspicion and reputation all gain a shared input: the player's presence status.
DND lowers interruption pressure but feeds suspicion; visible-Available invites the
queue-jumpers but reads as diligent; Away-while-active angers reporters. No new meter -
one enum modulating existing ones - but it converts the green-dot literature
([mattlar], [idlepilot]) into a continuous strategic choice the player re-evaluates all
day, which is precisely what the real anxiety feels like.

### The meeting block as the day loop's antagonist

The day loop's tension today is queue-vs-slack. The meeting block adds queue-vs-
compulsory-absence: a summons the player cannot decline that consumes prime mid-morning
time while clocks burn ([pg-maker], [fortune-mtg]). Because it is scheduled (visible in
advance), it also creates the Graham effect - the player plans AROUND it, deferring long
fix-paths because "the sync is coming" - emergent maker-schedule behavior from one
event type. Back-to-back stacking and camera-on flags scale its cost with cited
mechanisms ([wti-brain], [shockley]). This is the single largest missing day-texture
in the POC and needs no calendar app to start.

---

## Top 10 by authenticity-per-effort - for the CURRENT helpdesk game

1. **The surprise call modal** (owner seed) - incoming-call takeover mid-action with
   accept/decline/message-first grammar; malignant-interruption science in one event;
   chat + event machinery already exist.
2. **The mandatory meeting block** (owner seed) - compulsory mid-morning sink while SLA
   burns, recap-mail punchline; the could-have-been-an-email truth as mechanics, no
   calendar app needed.
3. **Refocus penalty + benign/malignant flag** - interruption cost model on the existing
   fumble/stress systems; one state + one bool, carries the whole interruption-science
   layer.
4. **Player presence status (Available/DND/Away)** - one enum modulating interruption
   rates, suspicion and reputation; the green-dot triangle as a standing strategic
   choice.
5. **The walk-up event** - boss-patrol machinery reskinned into "while you're here...";
   physical sibling of wave 2's DM bypass sharing its scoring; near-total code reuse.
6. **No-hello beats** - bare-"hi" chat openers that burn time until answered; dialogue
   data only; names the classic in-fiction.
7. **The 4:55pm archetype field** - generalize the existing friday-17:55 seed into
   `arrives_minutes_before_close` ticket data; a field, not a feature.
8. **Password-rotation day** - the player as victim of deprecated policy, with the
   NIST-honest KB article; one modal, primes the lockout ticket class.
9. **Reply-all storm day** - inbox flood event with the canonical escalation script and
   mailbox-full follow-up tickets; flood archetype ported to the mail app.
10. **Back-to-back stress stacking + camera-on modifier** - two scheduler/flag rules
    porting the EEG and JAP findings straight onto the stress meter.

---

## Sources

[oberien]: https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html
[chi08]: https://ics.uci.edu/~gmark/chi08-mark.pdf
[addyo]: https://addyo.substack.com/p/it-takes-23-mins-to-recover-after
[wti-infinite]: https://www.microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday
[success-wti]: https://www.success.com/infinite-workday-microsoft-report
[uc-mark]: https://www.universityofcalifornia.edu/news/cant-pay-attention-youre-not-alone
[dropbox-mark]: https://blog.dropbox.com/topics/work-culture/gloria-mark-how-to-get-your-attention-span-back
[steelcase-mark]: https://www.steelcase.com/research/articles/our-47-second-attention-span-with-gloria-mark-s5-ep3-transcript/
[parnin]: https://blog.ninlabs.com/blog/programmer-interrupted/
[infoq-parnin]: https://www.infoq.com/news/2013/01/Interruptions/
[tandf-daily]: https://www.tandfonline.com/doi/full/10.1080/1359432X.2024.2427052
[aom-annals]: https://journals.aom.org/doi/10.5465/annals.2017.0146
[opportune]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11775001/
[fortune-mtg]: https://fortune.com/2022/09/27/are-business-meetings-useless-survey-remote-work-burnout-zoom/
[breeze-mtg]: https://www.breeze.pm/articles/meeting-overload-statistics
[apa-mtg]: https://www.apa.org/monitor/2016/12/great-meetings
[wti-hybrid]: https://www.microsoft.com/en-us/worklab/work-trend-index/hybrid-work
[wti-balance]: https://www.microsoft.com/en-us/worklab/guides/how-to-regain-work-life-balance-in-the-age-of-hybrid
[wti-brain]: https://www.microsoft.com/en-us/worklab/work-trend-index/brain-research
[cnbc-brain]: https://www.cnbc.com/2021/04/20/microsofts-new-outlook-fix-to-end-brain-drain-of-work-meetings.html
[wpi-mtg]: https://workplaceinsight.net/bad-meetings-lead-to-problems-away-from-the-meeting-itself/
[pg-maker]: http://www.paulgraham.com/makersschedule.html
[newport-maker]: https://calnewport.com/why-are-maker-schedules-so-rare/
[zombie-faq]: https://www.officemaps.com/faqs/what-are-zombie-meetings
[zombie-forbes]: https://www.forbes.com/councils/forbesbusinesscouncil/2025/10/22/ban-the-zombie-meeting-a-30-day-culture-experiment-to-reclaim-focus/
[shopify-cnn]: https://www.cnn.com/2023/01/03/tech/shopify-meetings/index.html
[shopify-bloomberg]: https://www.bloomberg.com/news/newsletters/2023-02-14/how-shopify-cut-320-000-hours-of-unnecessary-meetings
[shopify-fc]: https://www.fastcompany.com/90888605/shopify-exec-this-is-what-happened-when-we-canceled-all-meetings
[stanford-zoom]: https://neuroscience.stanford.edu/node/1518
[vhil-pdf]: https://vhil.stanford.edu/sites/g/files/sbiybj29011/files/media/file/zoom-fatigue-2023-chbr-100271.pdf
[shockley]: https://www.sciencedaily.com/releases/2021/08/210830092203.htm
[uga-camera]: https://news.uga.edu/?p=74866
[doodle]: https://doodle.com/en/resources/research-and-reports-/the-state-of-meetings-2019/
[aam-calls]: https://www.askamanager.org/2022/06/whats-up-with-unannounced-video-calls.html
[glassdoor-calls]: https://www.glassdoor.co.uk/Community/consulting/is-it-considered-rude-to-call-someone-unexpectedly-on-teams-or-is-it-the-same-as-calling-them-on-the-phone-i-find-it-easier-to
[blind-calls]: https://www.teamblind.com/post/how-do-you-deal-with-people-calling-randomly-during-work-t2zr4dz7
[slack-adhoc]: https://slack.com/blog/productivity/ad-hoc-meetings-how-to-transform-impromptu-conversations-into-action
[otg-huddles]: https://onlinetoolguides.com/slack-huddles-focus/
[threadpatrol]: https://thread-patrol.com/blog/slack-distractions-guide
[nohello-com]: https://www.nohello.com/2013/01/please-dont-say-just-hello-in-chat.html
[nohello-net]: https://nohello.net/en/
[nohello-club]: https://nohello.club/
[mattlar]: https://medium.com/@mattlar.jari/slack-status-anxiety-when-online-becomes-a-performance-metric-c9054a8cace4
[idlepilot]: https://idlepilot.com/slack-presence-and-team-trust
[statusholder]: https://www.statusholder.com/en/slack-always-active-in-2-steps/
[hcamag-wti]: https://www.hcamag.com/us/specialization/employee-engagement/infinite-workday-microsoft-finds-after-hours-contact-surge-globally/539465
[cnbc-r2d]: https://www.cnbc.com/2024/08/27/these-countries-grant-workers-the-right-to-ignore-bosses-after-work.html
[cbc-r2d]: https://www.cbc.ca/news/business/right-to-disconnect-after-work-1.7306238
[supportbench]: https://www.supportbench.com/prevent-priority-inflation-customer-submitted-tickets/
[blind-interrupt]: https://www.teamblind.com/post/how-do-you-influence-your-company-to-be-less-about-constant-interruptions-kdswlbcj
[blind-shoulder]: https://www.teamblind.com/post/shoulder-tap-ok-f4nvi1kj
[ufit]: https://it.ufl.edu/tss/receiving-help/ticket-prioritization
[tiktok-meme]: https://www.tiktok.com/discover/it-guy-memes
[ziebertz]: https://onlinelibrary.wiley.com/doi/10.1111/jsr.12519
[prebed]: https://www.sciencedirect.com/science/article/abs/pii/S0301051118300929
[rootly]: https://rootly.com/blog/on-call-policy-wellbeing-sleep-time-off-and-the-human-side-of-support
[msu-hours]: https://tdx.msu.edu/TDClient/32/Portal/KB/ArticleDet?ID=1889
[hackernoon-friday]: https://hackernoon.com/deploy-on-fridays-or-dont-qg2y32jk
[devto-friday]: https://dev.to/_steve_fenton_/go-ahead-deploy-on-friday-2n5j
[aws-friday]: https://builder.aws.com/content/2fmLHThOhoYEONmzGUFsx1qVKKd/deploy-on-friday-devops-best-practices
[enzoic]: https://www.enzoic.com/blog/nist-sp-800-63b-rev4/
[passwordus]: https://password.us/guides/nist-password-guidelines/
[archie]: https://archieapp.co/blog/hot-desking-statistics/
[kornferry]: https://www.kornferry.com/insights/this-week-in-leadership/hot-desking-not-so-hot-with-employees
[floorplan]: https://floorplanmapper.com/employees-hate-hot-desking/
[bedlam]: https://rodneymbliss.com/2013/10/17/i-survived-bedlam3/
[emailstorm]: https://en.wikipedia.org/wiki/Email_storm
[cbs-replyall]: https://www.cbsnews.com/news/more-than-11000-at-microsoft-said-ensnared-in-reply-all-email-loop/
[ms-rasp]: https://techcommunity.microsoft.com/blog/exchange/reply-all-storm-protection-in-exchange-online/1369811
[gbta]: https://gbta.org/pain-points-and-expense-reports/
[corpay]: https://www.corpay.com/resources/blog/expense-report
[gallup-training]: https://www.gallup.com/workplace/357113/hard-truths-ethics-compliance-training.aspx
[pubmed-cbt]: https://pubmed.ncbi.nlm.nih.gov/27606391/
