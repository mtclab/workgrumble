# IT Career Sim - POC design (helpdesk slice)

Status: DRAFT for owner review, 2026-07-30. Name TBD (branding repo pass later).
Market case: `docs/spikes/market.md` - wedge = only comedy IT-career sim, free, browser, slacking as core mechanic.

## 1. Vision

You are a fresh helpdesk drone at a caricature IT company (English flavor text throughout). The whole game is your work computer: a parody Windows desktop, fullscreen in the browser. Solve tickets before SLA timers burn you, keep stress down by slacking (beer, browser games, forums) without the boss catching you, collect salary, and one day quit to buy that farm.

Career arc (post-POC): helpdesk -> sysadmin -> devops/cloud, employer hopping, richer tooling per tier. POC ships helpdesk only, on an architecture that provably extends.

Tone: parody/caricature throughout. Tickets are absurd-but-real (every one grounded in an actual IT trope). Never mean-spirited toward users - the comedy is recognition, not contempt.

## 2. Player fantasy + audience

One system, two playstyles:
- **Veteran power fantasy**: everything is fixable, speedrun tickets, maximize slack window.
- **Learner sandbox**: KB (knowledge base) app explains every fix honestly; you genuinely learn what a print spooler is.

No mode switch - the KB is there or not read. Difficulty selection comes later via win-goal price tags.

## 3. Core loops

### 3.1 Ticket loop (minutes)
Ticket arrives in queue -> read it (comedy premise) -> diagnose via tools (remote assist view, user directory, chat with user) -> mutate world state to desired state -> ticket auto-resolves -> reputation + closes toward daily quota.

### 3.2 Slack loop (minutes, interleaved)
Stress rises from open tickets, SLA pressure, boss pings. Slack apps (beer, browser game, forum) drain stress but build **suspicion** while open. Boss proximity events ("footsteps" audio cue + hallway reflection in monitor) give a reaction window to hide evidence (close window / boss-key). Caught = reputation hit + comedy scene. High stress = misclicks/slower actions (fumble mechanic), so slacking is genuinely optimal play, not naughty extra.

### 3.3 Day loop (one session, ~15-25 min)
Shift 09:00-17:00 sim time (compressed). Morning queue + drip arrivals. Lunch break (free slack window - teach the mechanic safely). 17:00 = day score: tickets closed, SLA breaches, suspicion events, stress carried over. Salary lands per day.

### 3.4 Meta loop (POC = one week)
POC demo arc: Mon-Fri probation week ending in performance review (fail state preview: bad week = fired = demo over, retry). Money accrues toward the farm counter (visible, absurdly far away - the joke and the hook). Career/employer switching OUT of POC scope but its seam is built (section 6).

## 4. The fake OS (POC surface)

Parody Windows desktop ("not-Windows"; visual language 9x-era caricature, name/branding decided later). Boot -> login -> desktop with taskbar, start-ish menu, draggable/resizable windows, notifications.

POC app roster (each app = plugin, see section 6):

| App | Role | Loop |
|---|---|---|
| **Tickets** (helpdesk tool) | Queue, SLA timers, ticket detail, resolve/escalate | ticket |
| **Mail** | Onboarding/offboarding requests, boss nags, comedy flavor | ticket |
| **Chat** | Talk to ticket users (canned dialogue trees) + boss channel | ticket |
| **User Directory** ("Active Dictionary") | AD caricature: accounts, unlock, password reset, groups | ticket |
| **Remote Assist** | View user's screen (rendered fake desktop of THEIR machine), click their UI, run fixes | ticket |
| **Cmd** | Tiny terminal: ~12 commands (ping, nslookup-ish, restart-service, etc.) | ticket |
| **KB Wiki** | Honest explanations of every fix; learner path | ticket |
| **Browser** | Slack sites (forum, cat pictures) + "web store" for future app installs (seam) | slack |
| **Minesweeper-like** | In-OS game; moderate stress drain, instant-hide boss key | slack |
| **Clock/Calendar** | Shift time, day plan | day |

Plus **desk consumables** (not apps - desk overlay items):

- **Energy drink**: legal, no suspicion. Buff: faster actions + higher stress ceiling + fumble immunity for a window ("wired"). Then energy-drink truths: crash debuff (slower, stress spike) and stacking tolerance - chaining cans = jitters (cursor shake) and harder crash. Risk/reward within legal play.
- **Beer**: LOCKED at start ("not during probation"). Unlocks end of POC arc (post-review Friday scene) and post-POC properly. When active: big stress drain, high suspicion, empties pile on desk as evidence player must hide (trash-run action) before boss events. The illicit tier of slack play.

Remote Assist is the signature move: user machines are the same fake-OS component rendered in a window, driven by the same entity graph. One desktop engine, every machine in the game.

## 5. Simulation core: entity-state graph

Single authoritative world graph. Everything else is view.

- **Nodes**: `person`, `account`, `machine`, `device` (printer/monitor/mouse...), `service` (spooler, VPN, mail), `share`, `group`, `mail_rule`, `ticket`.
- **Edges**: `owns`, `member_of`, `connected_to`, `runs_on`, `has_access`.
- **State**: typed fields per node kind (`account.locked: bool`, `service.status: running|stopped|wedged`, `machine.display_rotation: 0|90|...`).
- **Actions** (the ONLY way anything changes): registry of `action(actor, target, params) -> graph mutation`, each gated by tier + app. UI buttons and cmd commands both dispatch registry actions - two skins, one verb set. Fired with seeded RNG where outcomes vary.
- **Tickets = data**: `{ id, flavor (title/body/user dialogue), setup: graph-mutations applied on spawn, resolved_when: assertion over graph, sla, reward, kb_ref }`. Assertions = small declarative expression tree (`eq`, `and`, `exists`...), NO code per ticket.
- Resolution check runs automatically on every mutation -> multi-path solutions free (GUI or cmd, either mutates graph, assertion doesn't care).
- Deterministic + seeded end to end (replayable days, testable).

This is the no-dead-end core: sysadmin tier later = new node kinds (`dns_record`, `backup_job`) + new actions + new apps. Terraform tier = declared-graph vs actual-graph diff. Same engine, zero rework.

## 6. Extensibility seams (built in POC, exploited later)

1. **App plugin contract**: `{ id, icon, tier_required, mount(window, gameApi) }`. Desktop shell iterates a manifest; installing future apps = manifest entries (surfaced in-fiction via Browser "web store").
2. **Action registry** tier-gated; new tier ships actions, not engine changes.
3. **Tickets as data files**; content scales by writing JSON, validated by schema + auto-solvability check.
4. **World/company as data**: employer = a graph seed + ticket pool + boss personality params. Employer switch = load different company pack, carry player stats. POC ships one company but loads it through this path.
5. **Career layer separate**: player stats (money, reputation, stress baseline, tier) live outside the world graph.
6. **OS skin as theme**: Linux-desktop variant later = second theme + app set over same engine; remote Linux boxes arrive at sysadmin tier as terminal-only machines (no second desktop build).

## 7. Systems detail

- **SLA**: per-ticket timer visible; breach = reputation hit, comedy escalation mail. Priorities conflict on purpose (boss "urgent" trash vs real P1) - triage IS gameplay.
- **Stress** 0-100: +open tickets, +breaches, +boss pings; - slack, - lunch. >80 = fumble effects (cursor sway, typo'd commands - comedic, not punishing-opaque). Energy drink raises ceiling/suppresses fumbles temporarily, then crash (see consumables, section 4).
- **Suspicion** 0-100: + slack apps open (rate per app), - clean work time. Boss events roll against current suspicion; caught scene + reputation hit + reset.
- **Reputation** drives performance review, later job offers. Fail state: review < threshold = fired. Demo scope: retry week.
- **Money**: daily salary minus caricature deductions (payslip is a joke surface). Farm price on the wall.
- **Escalate action**: legit resolution for hardware/field tickets (coffee-in-keyboard) - teaches real helpdesk truth, costs small reputation vs solving remotely when solvable.
- **"Waiting on user" state** (from `docs/research/ticket-material.md`): vague tickets ("it's broken", no body) require asking the right chat question; SLA pauses ONLY if question actually asked (CYA rule); user may reply late/never, angry escalation mail lands regardless - comedy + triage texture.
- **Ticket archetypes** (data field, drives pacing): `hidden_cause` (symptom node != faulty node - bread and butter), `read_the_screen` (answer verbatim on user's screen, instant-win filler), `deadline_absurdity` ("broken 6 months, fix in 2 hours" - correct play = negotiate/escalate via chat), `recurring_arc` (multi-day mystery, e.g. cleaner-unplugs-rack-every-Friday class - solved by spotting schedule correlation), `flood` (maintenance-blindness: many identical tickets, bulk-close with announcement link).
- **NPC mirror comedy**: users slack and hide evidence too - Remote Assist occasionally reveals their solitaire/shopping being panic-closed; coverup tickets where graph history contradicts user's story. Pure flavor, thematic echo of player's own slack loop.

## 8. POC content target

~20 launch tickets, each `trope + hidden cause + fix path(s)`. Seed list: rotated "hacked" screen; caps-lock password; vacation-locked account; spooler wedge; unplugged monitor power; mouse battery; toolbar-infested "slow" PC; new-hire onboarding chain (mail-driven); offboarding while user still logged in; missing share = group membership; scareware popup "virus!"; meeting-room wrong HDMI input; expired VPN password; gibberish printer driver; files "deleted" (saved to weird folder); coffee keyboard (escalate); boss phone sync (priority trap); friday-17:55 P1 (cliffhanger for review day).

**The seed list is FUTURE CONTENT, not the shipped roster.** What actually ships is `src/world/tickets/`; the list above is where the lane picked from and what it may pick from next. Two entries were struck rather than left standing - resolution "everything tiny" and mail-rule "all my email gone" - because the verbs they would have needed (`machine.set_resolution`, `mail_rule.delete`) were registered, reachable from nothing, and are deleted as of M5 close-out. Restoring either ticket means restoring its verb, its control and its walk with it.

Each ticket: flavor text (English office-comedy voice), KB article, assertion, 1-3 valid paths.

## 9. Tech + pipeline

- Web, fully client-side static; TypeScript + Vite; no backend; saves = localStorage (versioned schema from day one, migration-ready per save-system practice). Framework: minimal - custom window manager over vanilla TS components (fake-OS chrome is bespoke anyway); revisit only if UI state pain proves it wrong.
- Deterministic sim + seeded RNG; sim tick decoupled from render.
- Repo: mtclab org, PRIVATE, **no workflows** (owner CI mandate). Local gates only.
- Deploy target later: CF (static). Staging-box pipeline when it ships publicly.

## 10. Gates (blocking, per house rules)

1. **Journey gate**: Playwright drives the REAL built artifact through every shipped ticket from queue-click to auto-resolve via UI - player goal reached, not action-returned-ok.
2. **Solvability property**: CI-less local suite proves every ticket's assertion reachable from its setup via registered actions (graph-level exhaustive check) - content can't ship broken.
3. **Slack/boss journey**: full day sim including getting caught + surviving review, driven end-to-end.
4. **Every found bug -> permanent gate**, proven by revert.
5. **Determinism gate**: same seed + same input script = identical end state.

## 11. Out of POC scope (explicit)

Sysadmin/devops tiers, Linux desktop skin, employer switching UI (seam only), cloud/terraform, multi-win-goal select (farm counter only), audio beyond minimal cues, mobile layout, cloud saves, monetization.

Owner-added future items (2026-07-31): **selectable OS skins** (95/98 confirmed as the base look; XP/Vista/etc as selectable themes later - tokens-only styling is the seam, no component may hardcode chrome); **engine = Rust/WASM core** (decided, ported pre-M3, `docs/SPEC_CORE_RS.md`) so tier growth never forces a rewrite; **realism depth mandate** - in-game apps must be researched against real tooling (ServiceNow/AD/services.msc/RMM/RDP class), not invented barebones (`docs/research/real-systems.md`).

## 12. Owner decisions (answered 2026-07-30)

1. Flavor language: **English**.
2. Demo bar: **probation week (5 days, ~90 min) confirmed**.
3. Drinks: **two-item design.** Energy drink = legal buff (better handling / more capacity) with crash/tolerance downsides. Beer = illicit, LOCKED at start, must be hidden when unlocked. Spec in section 4 consumables.
4. Pause: **allowed**, plus speed toggle.
