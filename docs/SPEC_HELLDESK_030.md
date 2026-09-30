# Helldesk 0.3.0 "the RPG pass" - design proposal

Status: PROPOSAL for discussion. Nothing here is decided. Owner decisions are collected in section 8.

Naming note: `docs/SPEC_030.md` in the repo is the OFFICE SIM's 0.3.0 (interruptions). Helldesk versions on its own line (`docs/SPEC_CHANGELOG.md`: 0.2.0). This spec should land as `docs/SPEC_HELLDESK_030.md` to avoid the clash.

Grounding: every claim about "today" cites `src/crawler/` in the deploy worktree. Numbers marked (target) are proposals to be measured, not facts.

## 0. The one-paragraph version

Today a floor is a dungeon: `generateLevel` (`level.ts:403`) rejection-samples 9-17 rectangles, joins them with an MST plus loops, and every room that is not lobby/boss/it/sauna rolls 0 to 3 hostiles on top of fixed ones (`level.ts:903-912`, `rollHostile` at 382). Everyone spawned by `rollHostile` is `hostile: true` from birth (`entities.ts:566`) and attacks at 11-16 m on line of sight (`aggroRange`, `entities.ts:1086`). The friend is right: it is Doom with a ticket queue. The proposal: the floor becomes a HUB where nobody attacks you, and the fighting moves into MISSIONS the player picks from a board and from people. Missions come in styles; every sneaky mission can be played loud; hostility in the hub is EARNED (breached tickets, ignored people, failed work). The week, the lift, the mökki, the review, on-call, staffing, mentoring, loot, perks, runes, vices, SUO: all stay, rewired to the hub/mission split. Level generation gets templates with a purpose instead of rectangles. Balance is measured, not felt: the balance bot learns a stealth path and a loud path and reports combat share, fights, detection and reward per style.

## 1. Core loop: hub and missions

### 1.1 The week, rewired

| Today | 0.3.0 | Kept / changed / cut |
|---|---|---|
| One floor = one week; clear rooms, kill boss, lift, Friday | One HUB FLOOR = one week; do missions from it; the week's **P1 (major incident)** is the mandatory mission that opens the lift | Week, lift, Friday, salary, review, HR, on-call, mökki: KEPT verbatim (`game.ts:1725 goToMokki`, `1760 goToWork`) |
| Boss waits in the far room (`level.ts:495`) | Boss is the finale of the P1 mission; the P1 is on the board from Monday, but you choose when | Boss code, patterns, phases, leash, parley: KEPT (`entities.ts updateBoss`, `hosts.ts:193-250`) |
| Hostiles in nearly every room | Hub: everyone neutral. Missions: hostiles by style | `rollHostile` CUT from hub gen; reused as the mission "crowd" roller |
| Aggro at 11-16 m on sight | Hub: no aggro unless earned (1.4). Missions: the suspicion model (section 4) | `aggroRange` CHANGED into the detection model |
| Side quests: 3 offered per floor, "!" givers (`quests.ts:127`, `sideQuestsFor`) | Side quests become **NPC-given missions** or **hub errands**; the same `QuestDef` shape, plus a `mission` block | KEPT, extended |
| Staffing: phone rings, "silence is consent" (`questing.ts:368-405`) | Staffing PUTS A CARD ON THE BOARD (management-assigned mission, deadline attached); the call still rings and still defaults to consent; push-back unchanged | KEPT, rerouted |
| Mentoring (`teamwork.ts`) | Hub-side unchanged; "shadow two talk-downs" and "server room induction" become "bring the mentee on a mission" | KEPT |
| Ticket queue at terminals (`desk.ts`) | Hub work between missions; an SLA breach is now a hostility source (1.4) | KEPT, made consequential |
| Team follows you (`team.ts`) | Team can be TAKEN on a mission (loud) or LEFT behind (stealth: they are noisy; only an intern can tag along quietly) | KEPT, given a choice |

Where the player lives: **the hub floor**, not the mökki. The mökki stays the weekend (upgrades, sauna, pager). Reason: the hub already has the terminals, Internal IT, the kitchen, the sauna room, the story NPC; and "Monday morning, what do I take on" is the loop the owner described. The mökki as hub would put a car drive between every mission and kill the office satire.

### 1.2 A week, concretely

1. Monday: lift opens onto the hub floor (`loadFloor`). Toast: the board has N cards. The P1 card is red. Staffing may add cards during the week (existing clock, `scheduleStaffing`).
2. Player walks the hub: tickets at a terminal, talks to people with "!" (NPC missions), the board at the Internal IT counter (or the Projects tab of WorkgrumbleOS at any terminal: `os.ts` already has tabs).
3. Player accepts a card, takes the lift, picks the card's destination (a second lift stop: "7B annex", "the data hall", "the client site", "basement"). A mission map is generated for that card. Mission runs to success/failure/abort. Lift back to the hub. Autosave both ends.
4. Repeat. When the P1 is resolved the lift's "Friday" option unlocks (today's `elevatorOpen`). The player may stay for more cards (Friday is due whenever they go; staffed cards still settle on Friday: `settleWeek`).
5. Friday to Sunday: as today.

Workload capacity (`Derived.capacity`, `state.ts:538`) caps how many cards you can HOLD open at once; it already exists and already punishes over-commitment. Cards on the board you have not taken cost nothing.

### 1.3 What a "floor" is now

Two generators, one `Level` type (`level.ts:95`):

- **Hub floor**: one per week, theme by `THEMES` (`textures.ts:21`), composed from the hub recipe (section 3). Rooms: lobby with lifts, board/IT counter, kitchen hub, open plan, one meeting ring, one office row, print room, server room, sauna (70%). People: colleagues (users, callers, managers, healers, helpers, story NPC) all neutral. Size like today (44-60 cells square).
- **Mission map**: generated per card from the card's recipe (template list + style + crowd). Smaller on average (30-48 cells), one entry lift, one or more exits (stealth extraction points). Persisted like `floorState` today (used interactables, resolved, picked) under `save.mission` so a reload mid-mission works (same pattern as `FloorState`, `state.ts:97`).

Overtime (floors 5+) keeps working: hub recipe scales crowd and the mission deck draws harder cards.

### 1.4 Hostility is earned (hub rules)

The hub has no `hostile` spawns. Hostility sources, all already partly in code:

| Source | Today | 0.3.0 |
|---|---|---|
| SLA breach (`desk.ts:37 breach`) | Management -3, Staff -2 | Plus: the ticket's reporter (by name, `q.from`) turns hostile and comes to find you. One person, telegraphed ("Kev from Sales is on his way up, and he is not happy"). Resolve it any way. |
| Ignored walk-up | Nobody walks up in the hub today | Neutral people with a problem approach (existing `wander` + a `seek` state); a "?" bubble; ignore three approaches (or sprint past them 3 times) and they turn hostile |
| Failed talk-down (`story.ts:103 failTalk`) | Enrage | Unchanged; Executive Presence still saves it |
| Failed / missed staffed work (`questing.ts:523 missed`) | Management -6 | Plus: the staffer's team (2 users) hostile next hub visit |
| Failed NPC mission | n/a | The giver and their allies hostile; the giver's later cards gone |
| Witnessed crime (`interact.ts:469 witnesses`, `vices.ts:103 caughtCheck`) | HR warning | Unchanged, plus the witness is hostile for the week |
| Low Staff standing (`entities.ts grudge`, 1206) | Angrier hits | Unchanged in missions; in the hub, below -40 Staff, one random hostile per day |

So the hub is not safe by fiat; it is safe if you do your job. That is the RPG.

## 2. Missions

### 2.1 Sources and voice

- **The board** (a `board` interactable already exists for the mökki upgrade board, `mokki.ts:359`; reuse the kind on the IT counter). Cards from: the Service Desk (the P1 of the week, always), Projects/the PMO (management missions, also what staffing now posts), Facilities, InfoSec, Procurement, "Anonymous (printed, left on the counter)". Voice: ticket-speak. "P1 - MAJOR INCIDENT - Owner: you, apparently."
- **People** (the "!" givers, `questing.ts:133 spawnGiver`): Milton, Brenda, Frank, Gary, Josh, Denise, Priya, Sanna, Maureen, Bev, Graham, Kev, Pekka, Fiona, Nik, Jukka; plus the story NPC of the floor (`story.ts:372`) whose floor story becomes a mission with a choice at the end. Voice: as their existing quests, with the "or don't" endings kept.
- **Management** (staffing): Derek, Fiona, Tristan, Clive, the PMO, Karen's EA (`quests.ts:306 STAFFERS`). They do not ask; the card appears with "assigned by".

### 2.2 Styles

A card carries a **style** (its intended play) and **allowed approaches**. Rule from the owner: every sneaky card allows loud. Corollary: every loud card allows talking where a talk-down exists today.

| Style | What the map and crowd look like | Win the intended way | Loud fallback |
|---|---|---|---|
| **Sneaky** (Quiet) | Crowd neutral-but-vigilant (section 4), patrols, a manager or two, cameras (screens that "see"), locked closets, a service spine | Reach/take/plant the objective with escalation below Alert | Always allowed: escalation to Alert turns the crowd hostile; finish anyway, extract via lift |
| **Loud** (Doom) | Crowd hostile on sight (today's behaviour), arenas and choke points, ammo and cans placed | Resolve the named targets / the boss | n/a (this IS loud); talk-downs still work per person |
| **Mixed** | Neutral crowd, a hostile pocket (a war room, a vendor pitch) and a quiet objective elsewhere | Both parts; order free | Loud everywhere is fine, costs the quiet bonus |
| **Social** (Negotiation) | Meeting ring; a table of people; no combat unless it goes wrong | A dialogue tree with printed odds (`checkOption`, `story.ts:86`), items as leverage (evidence, biscuits, a service credit) | Failing the check enrages the table: a loud finish is allowed |
| **Investigation** | Hub-like map, evidence in lockers/desks/terminals, people to question | Collect 3 of 5 evidence pieces (Project Phoenix already does this: `quests.ts:103 EVIDENCE`) and name the cause | Optional; forcing a witness (Hardware check) is loud-adjacent and costs standing |
| **Escort / delivery** | Any map; a companion (Josh, a laptop, a consultant) | Deliver intact | Fights happen; companion morale drops |

### 2.3 Escalation model (how sneaky degrades into loud)

One mission-wide **escalation** value with four tiers, plus per-person suspicion (section 4). Escalation only ever goes UP within a mission; it is the mission's memory.

| Tier | Name | Entered by | What changes | The player can tell because |
|---|---|---|---|---|
| 0 | Quiet | start | Neutral crowd, patrols on their routes | HUD eye closed |
| 1 | Noticed | any person's suspicion reaches Investigate | That person walks over, asks "can I help you?"; a talk option (Soft Skills) or a disguise check clears it | Eye half open, that person's over-head bar amber, a bark |
| 2 | Alert | a person reaches Alert (saw a crime, saw you sneaking in a restricted room, saw a fight, heard a shot) | That person hostile; everyone within earshot (12 m, walls halve) is Noticed; the manager on the map starts a "sweep" patrol | Eye open red, "!" bark, 0.5 s pause before the first attack (the wind-up rule), the tannoy: "Security to floor 7B" |
| 3 | Escalated | 2 people Alert, or a fight lasting 20 s, or a breached mission SLA | Everyone hostile on sight (today's game), a manager summons (existing `summonIn`), doors to the objective may lock (Security minigame to reopen), extraction lifts still work | Fluorescent panels flicker to the alarm tint, the music switches to the boss layer, HUD reads ESCALATED |

There is no going back down inside a mission; Noticed clears to Quiet only per person (talk it off), Alert does not clear. This keeps the rule readable: you always know which game you are in.

### 2.4 Rewards: stealth worth it, loud not punished

Both paths must pay about the same Rep for the same time. They pay in different currencies.

| | Quiet finish (never above Noticed) | Loud finish (Alert or Escalated) |
|---|---|---|
| Base Rep | card value x 1.0 | card value x 1.0 |
| Quiet bonus | +40% Rep, +3 Management, +2 Staff ("nobody noticed, nobody complained") | none |
| Per-person Rep (`STATS.rep`, `entities.ts:338`) | none (nobody resolved) | as today, per resolve |
| Loot (`loot.ts`, drops on resolve) | closets only (the quiet route passes more closets: design rule in section 3) | drops as today, elites carry the best |
| Skill use | Hiding in Plain Sight, Security, Soft Skills rise | Hardware, Scripting, Sisu rise |
| Costs | time (sneaking is slow), Löyly (Hiljaisuus), consumables (distractions) | sanity, ammo, energy, HR risk (witnessed crime), Staff standing |
| Optional goals | more of them reachable quietly | "resolve the elite" style goals |

Target: at the same rung, Quiet and Loud finishes of the same card land within +/-15% of each other in Rep per minute (measured, section 5). Loud yields more loot, Quiet more standing. Neither is a tax.

### 2.5 Mission structure

- **Objective(s)**: 1-3 stages, the existing `Objective` kinds (`quests.ts:60`: item, talk, count, boss, room, escort, fix, use, hunt, collect) plus three new: `plant` (put an item somewhere), `extract` (reach a lift with the item), `observe` (stand in sight of X for N seconds unnoticed).
- **Optional goals**: 0-3 per card, each a small Rep/standing/loot bonus. Examples: "no HR warnings", "resolve the elite", "leave with 3 evidence not 2", "keep Josh above 50 morale".
- **Failure states**: the mission SLA runs out (P1 cards; existing `deadline` on `QuestState`), the objective is destroyed (paper shredded, the server wiped), the companion downed, a burnout inside the mission (Ironman: career; else: wake in the hub, card failed). A failed card: Management/giver consequences (1.4), the card is gone.
- **Abort**: lift back at any time. An aborted card stays on the board until Friday; aborting a P1 does not.
- **Time / SLA**: P1 cards carry a clock (180-300 s like today's `timeLimit`s). Others are due Friday. Inside a mission the clock stops in dialogue and menus (today's rule for pages).

### 2.6 Starter catalogue (12 cards)

Rung bands: Helpdesk (rungs 0-3), Specialist/Engineer (4-9), Architect (10-11). Card value = Rep in the band's scale (today's boss pays 300 + 120/floor times difficulty).

| # | Card | Source, voice | Style | Band | Map recipe | Objective / optional / fail |
|---|---|---|---|---|---|---|
| 1 | **The Red Stapler, Recovered** | Milton, muttering: "It is in HR's closet. They said it was 'confiscated'. I said nothing." | Sneaky | Helpdesk | corner-office row + service spine | Take the stapler from a locked closet in HR without being Noticed by HR. Optional: also lift the HR "flexible seating" memo. Fail: HR warning (witnessed theft). Loud: HR turn hostile, 4 users and a manager. |
| 2 | **P1: The Printer Uprising** | Service Desk: "Print room 7B. Every printer is printing HELP. Facilities have locked themselves in the kitchen." | Loud | Helpdesk | print room + open-plan + kitchen hub | Resolve 6 paper jams and the elite jam "Hercules 400". Optional: fix the print room printer with the screwdriver (`use printer`). Fail: SLA 240 s. |
| 3 | **Josh's First Day, Again** | Josh, terrified: "They moved Internal IT to the annex and I have a laptop and no badge." | Escort / mixed | Helpdesk | lobby + meeting ring + IT counter | Escort Josh to the counter; a vendor pitch blocks the direct route (hostile pocket), the ring goes round it. Optional: Josh arrives above 60 morale. Fail: Josh downed. |
| 4 | **Password Hygiene Week** | Priya (InfoSec): "Twelve sticky notes on twelve monitors. Photograph them. Do not get seen doing it; it looks bad for me." | Sneaky / investigation | Helpdesk | open-plan x2 + kitchen hub | Collect 8 of 12 post-its unnoticed (`collect`, existing item `postit`). Optional: all 12; find the one that says "Password1!" and talk its owner into changing it (Soft). Fail: none (loud just loses the bonus). |
| 5 | **Phishing Test Debrief** | Priya: "Half of Sales clicked. Talk three of them through it. They are... defensive." | Social | Helpdesk | meeting ring | Three talk-downs at a meeting table, odds printed; each success is a `peaceful` resolve (today's phishtest quest). Fail check: one enraged salesperson, allowed loud. Optional: all three without a biscuit. |
| 6 | **The Change Freeze** | Clive (Ops), staffed: "Shadow IT have a rack in the annex. Bring it back under control. Amnesty applies. Mostly." | Mixed | Specialist | server hall + service spine | Reach the rogue rack (behind 2 turrets and a shadowit) and `use terminal` to re-image it. Quiet: Hiljaisuus or the spine past the turrets. Loud: turrets and blink-tag. Optional: talk the shadowit through change control (Troubleshooting). |
| 7 | **Vendor Day** | Procurement: "Four vendors on the floor 'pitching'. Evaluate them." | Loud (Doom) | Specialist | atrium loop + meeting ring | Resolve 4 vendors (they steal Rep, `stealRep`); a consultant shields them (take the consultant first). Optional: no Rep lost. Fail: none. |
| 8 | **The Auditor's Liaison** | Derek (Audit Liaison), floor 3 story: "The logs. A few lines. Nobody would know." | Investigation / social | Specialist | corner-office row + server hall | Find 3 of 5 evidence pieces (memo, schedule, emails, PO: `EVIDENCE`), then the choice: doctor the logs (Security check, findings cleared, `coverup` flag) or file them (Management). Loud: forcing Derek's PA for the safe key. |
| 9 | **Marcus and the Backups** | Marcus, floor 0 story: "I may have stopped the backup agent. Come and look. Bring nobody." | Sneaky / social | Helpdesk | corner-office row + kitchen hub | Reach Marcus's office unnoticed (his manager is patrolling), fix the agent at his terminal, then the existing three-way choice (`story.ts:396`). Optional: Marcus writes the incident note himself. |
| 10 | **Karaoke Night Runs Late** | Kev, 22:14, from the kitchen: "The building is empty. Except Security. And Gordon, who lives here." | Sneaky (after hours) | Specialist | dark floor variant: open-plan + corner offices + service spine, lights out | Retrieve Kev's phone from Gordon's office at the exact Ballmer Peak (existing karaoke rule) without Security noticing. Light matters (section 4). Loud: two security guards and Gordon (boss-lite). |
| 11 | **The Migration Weekend** | Tristan (Delivery), staffed, P1: "The cutover is at 02:00. You are the bridge." | Mixed, timed | Architect | server hall + meeting ring + atrium loop | Close 3 terminal fixes across 3 rooms in 300 s while a war room (hostile pocket) tries to pull you into meetings (rooted). Delegation: an architect may send a follower to one terminal (existing `delegated`). |
| 12 | **P1: All-Hands, Executive Suite** | Sir Reginald's PA: "The all-hands is in ten minutes. The Wi-Fi is down. The CEO is in the lift." | Loud, boss finale | Architect | lobby + atrium loop + boss arena | Fight through managers (auras, invites) to the arena; Sir Reginald with phase two. With 3 evidence: the parley path (existing `docile` boss and `bossParley`). |

Each floor's mandatory P1 is drawn from the "P1" subset (#2, #12, plus today's five bosses recast as P1 finales); the weekly deck offers 3-5 other cards by band and floor, plus staffed ones.

## 3. Levels: templates with a purpose

### 3.1 Why templates

Today's rooms are rectangles with a kind painted on afterwards (`level.ts:521 plan`). Nothing about a room's SHAPE means anything. A template is a room-and-corridor motif with a job: where cover is, where sightlines run, where the loop goes. Furnishing stays procedural per room kind (the existing `case 'cubicles'` etc. at `level.ts:600-880` keep doing that), so no throwaway.

### 3.2 The templates

Cells are 2 m (`TILE`). `#` wall, `.` floor, `=` glass (see-through, not walkable: `opaque=0, solid=1`, a new cell class), `o` pillar/partition (solid, not opaque: today's rule at `wallBetween`), `D` door cell, `v` service door (locked, Security), `L` lift, `*` landmark.

**T1 Open-plan bullpen** (loud arena; stealth: partition cover)
```
###############D#######
#..o..o..o..o..o..o...#
#.oo..oo..oo..oo..oo..#     desks in rows of pods; 1.4 m partitions
#..o..o..o..o..o..o...#     block sight when crouched, not standing
D.....................D     (a new rule: crouch height vs partition height)
#..o..o..o..o..o..o...#
#.oo..oo..oo..oo..oo..#
###############D#######
```
Purpose: the big fight room; low cover everywhere; four doors so it loops. Sneaky: crouch-walk pod to pod; a manager patrols the middle aisle.

**T2 Meeting ring** (loop + glass sightlines)
```
##############D##############
#...........................#
#..=======..=======..=====..#
#..=.....=..=.....=..=...=..#    glass boxes: you see in, they see out
#..=..*..D..=..*..D..=.*.D..#    the corridor loops around all of them
#..=======..=======..=====..#
D...........................D
##############D##############
```
Purpose: the guaranteed loop; social missions; stealth tension (seen through glass unless the blinds are down: a "blinds" interactable per box).

**T3 Corner-office row** (dead ends off a spine, with a back corridor)
```
#############################
#.....#.....#.....#.....#...#    offices (manager + guest each)
#..*..D..*..D..*..D..*..D...#
##D#####D#####D#####D######.#    <- door row onto the main corridor
#...........................D
##v######################v###    <- cleaner's back corridor, locked ends
#...........................#
#############################
```
Purpose: targets behind doors; the service spine (bottom) lets you reach any office from behind. Loud: each office is a pocket, the spine is an escape.

**T4 Kitchen hub** (landmark, hub-and-spoke)
```
#####D#####
#....*....#     the big island counter (cover), coffee machine, fridge
D..#####..D     (healers live here; Kitchen standing gates healing)
#..#...#..#
#..#####..#
#....*....#
#####D#####
```
Purpose: four spokes; neutral ground (nobody fights in the kitchen: a fight here costs Kitchen standing); the place the player learns the map from.

**T5 Server hall** (aisles = choke points and cover)
```
#####D#####
#.#.#.#.#.#     racks in aisles (today's `case 'server'`, `level.ts:791`),
#.#.#.#.#.#     racks are solid AND opaque: pure corridors
#.#.#.#.#.#
#.........#     the cross aisle
#.#.#.#.#.#
#####D#####
```
Purpose: turrets and a shadowit (loud: one-at-a-time); quiet: the hum masks noise (noise radius halved in this room).

**T6 Atrium loop** (landmark + big loop, open sightlines)
```
#######D#######
#.............#
#..#########..#      the atrium: a planted void (solid, not opaque:
#..#...*...#..#      the "pillar" rule) with a walk all round
#..#..***..#..#
#..#...*...#..#
#..#########..#
D.............D
#######D#######
```
Purpose: the "where am I" landmark seen from every side; loud arena with a pillar to kite around; stealth: long sightlines, bad place to be.

**T7 Lobby and lifts** (arrival, reception sight-heavy)
```
######LL######
#............#     the lift doors; reception desk facing them
#....####....#     (a receptionist who NOTICES badges: disguise check)
D............D
#....*..*....#     plants
######DD######
```

**T8 Service spine** (the back corridor; vents, the stealth affordance)
```
v.....................v      2 cells wide, dim (light 0.3), locked doors,
                             junction boxes (a `fusebox` interactable:
                             lights out in the adjoining template for 30 s)
```
Purpose: the stealth route. Design rule: every Sneaky card's recipe includes exactly one spine touching the objective's template; the spine passes at least one supply closet (the quiet loot).

**T9 Boss arena** (today's `case 'boss'`, pillars in corners: keep as is).

**T10 Print and post room** (today's `case 'print'`, plus a `shredder` interactable for `plant`/destroy objectives).

### 3.3 Composition: templates on a graph

Replace the rectangle sampler with a **recipe**: an ordered list of templates plus a connection graph, laid out by the existing MST-plus-loops corridor pass (`level.ts:447-490`) between template DOORS instead of room centres. Steps:

1. Pick the recipe (hub: fixed `[T7, T4, T1, T2, T3, T5, T10, sauna, T9]`; mission: per card, 3-5 templates; Overtime adds one).
2. Place templates by rejection sampling like today's rooms (the templates are still rectangles with a footprint), largest first, hub-first (T4/T6 near the centre).
3. Connect: MST between template doors; add loops until the graph has >= 2 independent cycles for a hub and >= 1 for a mission (today: `rooms/3` random extras; make the loop count a gate, not a hope).
4. Spine pass (missions with a spine): route a 2-wide corridor from the entry lift's template to the objective's template through service doors, never through a template interior.
5. Furnish by room kind (existing code), then place people by STYLE (2.2) and route patrols along the corridor graph (section 4.3).
6. Safety pass as today (`level.ts:966`, flood from start; the 150-floor connectivity test in `crawler.test.ts:58` extends to every recipe x seed).

Procedural variety inside a template: mirrored/rotated variants, pod count, glass box count, which offices have a spine door, where the landmark sits. Enough that two T2s do not look the same; not so much that the purpose is lost.

### 3.4 Affordances, listed

Stealth: partitions (crouch cover), glass with blinds, doors (open/closed state; a closed door blocks sight, opening one makes noise), the spine, closets you can hide in (extend the `locker` interactable: E while sneaking = get in), lights-out via fusebox, the server hum, plants (partial cover), the receptionist's badge check (disguise).
Loud: bullpen and atrium arenas, server aisles and door rows as choke points, the kitchen island to kite around, ammo and cans placed on loud recipes only, an elite per loud card.

## 4. Stealth model

### 4.1 Detection: three inputs, one meter per person

Every neutral or vigilant person carries `suspicion` 0-100 (a new Actor field beside `aggro`, `entities.ts:131`). Per frame it rises by the sum of:

- **Sight**: inside a 110 degree cone (a real cone, today it is 360 degrees on line of sight) and within range R, rise = `base * lightAt(player) * (crouching ? 0.5 : 1) * (1 - stealth)`. R by kind: user 9, manager 13, security 15, receptionist 12, camera-screen 10, boss 16 (today's `aggroRange` numbers roughly kept). `stealth` is today's derived stat (`state.ts:605`, plus crouch bonus at `game.ts:392`). Beyond 0.6 R the rise is halved (peripheral).
- **Noise**: sprinting, swinging, firing, doors, breaking things, a jam printing emit a noise event with radius (sprint 6 m, swing 8, gun 18, door 4, Power Cycle 20). Inside the radius, suspicion jumps by a fixed amount (sprint 15, swing 30, gun 60) and the person turns to face the source (they investigate the SPOT, not you).
- **Place**: standing in a restricted room (boss office, server hall on a sneaky card, HR) while seen doubles the sight rise.

Decay: -8/s when unseen, only below the Investigate threshold. Thresholds: 0-40 Glance (head turns, the existing look-at code at `entities.ts:1046`), 40-80 Investigate (walks to where they saw you, bark, "?" over head; talk option available), 80+ Alert (escalation tier 2). The tiers map onto the escalation model in 2.3.

Light: per-cell light 0.3-1.0 from the existing `lightSpots` (`level.ts:1193`); dark variant maps (card #10) and the fusebox lower it. Lights affect sight only, never noise.

### 4.2 What the player can do

| Action | Input | Exists today | Change |
|---|---|---|---|
| Sneak | C | yes (`game.ts:1129`) | crouch also hides behind partitions (height rule) |
| Sneak attack | LMB on unaware | yes (`combat.ts:200`, x2 to x3.5) | on a neutral person it is a CRIME: witnessed => HR, and Alert |
| Hide | E on a closet or under a desk while sneaking | closets exist as loot | new: inside, you are unseen; a person who saw you enter opens it |
| Distract | Q with a can/duck/paperclip: throw | throw exists for weapons | new: a thrown can is a noise event for THEM, not you; the printer's `jam` can be triggered remotely from a terminal (prints HELP, draws people) |
| Social engineer | E on a Noticed person | talk-down exists | new "Can I help you?" node: "I am from IT" (Soft Skills), "I have a ticket for this room" (Troubleshooting, needs a queued ticket from that room), "I am with the consultants" (needs the lanyard) |
| Disguise | wear a disguise item (body/head slot) | gear slots exist | new items: consultant lanyard (consultants and managers ignore you; users do not), hi-vis (Facilities), the all-floors badge (Bev's quest item: the receptionist waves you through) |
| Vanish | Ghost Mode perk, Hiljaisuus rune | yes | unchanged; invisibility clears aggro today (`entities.ts:1137`), it should also freeze suspicion |
| Lights out | fusebox | no | new interactable, Security check |
| Blinds | E on a glass box's blinds | no | new, silent |

### 4.3 Patrols

Neutral people in a mission are of three sorts: **desk-bound** (sit, look around, a 90 degree cone sweep), **wanderers** (today's wander, 3 m jitter), **patrollers** (managers, security: a route along corridor-graph nodes, a pause at each, the route shown on the automap once observed for 5 s from cover). Patrollers are the stealth clock: the player reads the route, then moves. Routes are seeded so a reload does not change them.

### 4.4 Readable feedback (the wind-up rule, extended)

The combat rule was: every hit is announced before it lands. The stealth rule: **every detection is announced before it counts.**

- A person's over-head bar fills amber as suspicion rises; it is visible through walls at Investigate or above (you always know who is coming).
- The HUD eye (closed / half / open red) mirrors the highest suspicion in sight range. Existing `hidden` HUD field (`game.ts:1067`) becomes this.
- Investigate always begins with a bark and a 1.0 s walk before any check; Alert always precedes the first attack by the wind-up (0.35 s+), plus the "!" bark. Nobody goes from Quiet to hitting you inside 1.5 s.
- Noise events show as a ring on the minimap where they happened.
- Escalation tier changes are announced by the tannoy and the light tint, never silently.
- The "spotted you" toast (`game.ts:1663 noticed`) stays, with who and why ("Gary saw you in the server hall").

## 5. Balance framework

### 5.1 The numbers that matter (targets per style, mid rung, Standard workplace)

| Metric | Today (estimated from code; MEASURE in the spike) | Sneaky target | Loud target | Mixed target | Hub target |
|---|---|---|---|---|---|
| Combat share (time with a hostile aggro within 14 m / total) | ~50-65% of floor time | <= 10% (quiet finish), <= 40% if it goes loud | 45-60% | 25-40% | <= 5% |
| Fights per card (distinct aggro episodes) | 10-16 hostiles per floor | 0-2 | 4-8 grunts + 1 elite or boss | 3-5 | 0-1 |
| Time-to-kill a user (rung 6, keyboard) | 40 hp x 1.3 diff = 52 hp / 28 dmg = 2 hits, ~1.3 s | same | 1.2-2.5 s grunts, 25-45 s boss | same | n/a |
| Damage taken per card | unknown; bot records `minSanityPct` | <= 15% of max sanity | 40-70% of max, 0-1 burnouts per 5 cards | 25-45% | <= 10% per week |
| Detection rate (a sneaky card ending at Alert+) | n/a | 30-45% at the card's band, first attempt; <= 15% with Ghost Mode + spine | n/a | n/a | n/a |
| Talk-down share of resolutions | bot policy `talk: 0.3` | n/a | 10-25% | 30-50% | 60%+ |
| Card length (minutes of play) | floor 8-14 min (bot `maxFloorMinutes: 22`) | 4-7 | 5-8 | 6-10 | week total 25-40 |
| Rep per minute, same card | n/a | within +/-15% of loud | reference | same | tickets: 60% of a card's rate |
| Ammo economy (loud) | `giveAmmo` on drops | n/a | leave a loud card with 20-50% of the ammo you arrived with; never zero before the finale | | |
| Sanity / Löyly economy | | Hiljaisuus costs a full quiet route's Löyly once per card, never twice | healers 1 per loud card | | sauna room restores |
| Cards per week | n/a | 3-5 taken of 5-7 offered; capacity (3-7) binds | | | |

Hub combat share and "fights per card" are the friend's complaint in numbers: the game moves from ~55% fighting to ~25% averaged over a week that mixes styles, without any single loud card feeling thinner than today.

### 5.2 Scaling with the career rung

`difficultyFor(rung)` (0.55 to 2.15, `rpg.ts:143`) keeps scaling hp and damage. Add three stealth dials by band:

| Band | Cone range mult | Patrollers per card | Restricted rooms | Cameras |
|---|---|---|---|---|
| Helpdesk 0-3 | 0.8 | 1 | 1 | 0 |
| Specialist 4-9 | 1.0 | 2 | 2 | 1 |
| Architect 10-11 | 1.15 | 3 | 3 | 2 |

And a deck rule: the P1 is always loud-or-mixed; Sneaky cards are never mandatory (an owner-level guarantee that a pure Doom player never has to sneak, and a pure sneak player only fights the P1 finale, where the parley path exists on floors with evidence).

### 5.3 Measuring it: what the balance bot must learn

`scripts/helldesk-balance/bot.js` today picks targets by a priority list (`pickTarget`, line 238) and fights whatever is aggro. Additions:

1. **Per-card records** (`newFloor`/`endFloor`, line 410-440): key by card id and style; add `combatSec`, `aggroEpisodes`, `maxEscalation`, `detectedAt` (seconds), `noiseEvents`, `repPerMin`, `lootCount`, `standingDelta`, `ammoIn/Out`, `loylyIn/Out`, `talkdowns`, `quietFinish: bool`.
2. **Policy `approach: 'quiet' | 'loud' | 'auto'`**. Quiet: crouch at mission start, path along the spine where one exists (a new debug handle `__helldesk.spine()` returns the route cells), wait at corridor nodes until the nearest patroller's route point is > 8 m (the bot reads `a.patrol`), never sprint, never swing on a neutral, use blinds/fusebox if adjacent, hide when a person's suspicion > 50 and a closet is within 4 m, talk at Investigate with the "I am from IT" option. Loud: today's behaviour plus "take the team". Auto: quiet until Alert, then loud.
3. **A stealth flow field**: `field()` (line 27) weighted by light and by patroller cone coverage sampled every 0.5 s (cells in a cone cost x6). The bot "sees" what the player sees; nothing it reads is hidden from the HUD.
4. **Scenarios**: `{"name":"quiet-helpdesk","policy":{"approach":"quiet"},"deck":["stapler","postits","marcus"]}` and the loud twin on the same seed. `run.mjs` gains a `deck` key that pins the board's cards (a `__helldesk.deck(ids)` handle).
5. **Detection-rate runs**: 50 seeds x each sneaky card x band, reported as % detected and median `detectedAt`. This is the number that tunes cone range and patrol density.
6. **Hub runs**: a week with `approach: 'hub-only'` (tickets, talk, no cards): combat share must be ~0 and Rep/min ~60% of a card's.

The bot stays "a mediocre player on purpose"; the quiet policy is deliberately simple (no cone prediction beyond one node ahead), so its detection rate is the ceiling a new player will see, not the floor.

## 6. Delivery plan

### 6.0 Spike (1 slice, before any decision is final)

- Add `combatSec` and `aggroEpisodes` to the bot's floor record and run trainee/senior careers on today's build (`npx vite build` to a temp dir is a verification build on the staging box, not a deploy). Output: today's combat share by floor and rung. Gate: the number exists and is reproducible across 3 seeds within 10 points.
- Prototype T2 (meeting ring) and T3 (corner-office row) as hand-placed template footprints inside `generateLevel` behind a `recipe` argument; furnish with existing room kinds.
- Prototype two cards on those templates: #1 stapler (sneaky, T3 + a spine stub) and #7 vendor day (loud, T2). Minimum suspicion model (cone + noise, no light, no disguise) and the four escalation tiers.
- Playable by the owner from a `?mission=stapler` query on `crawler.html`. Bot runs both with `approach: quiet/loud`.
- Output: a one-page result (combat share today; detection rate on #1 over 30 seeds; Rep/min for both cards) and a go/no-go on the escalation model.

### 6.1 Slices, in order (each ships behind the Helldesk version line, `releases.ts`)

| # | Slice | Scope | Gates (player outcomes, asserted) |
|---|---|---|---|
| S1 | Hub floor and neutral colleagues | hub recipe; `hostile` spawns removed from hub; earned-hostility sources (1.4); board interactable + WorkgrumbleOS Projects tab; lift as mission select; `save.mission` state | Unit: a hub floor has zero `hostile` actors on load for 150 seeds. Journey (e2e, real keys): walk a hub floor for 3 minutes, take no damage, get one walk-up, ignore it thrice, it turns hostile with the bark first. Bot: hub combat share <= 5%. Save: quit mid-mission, reload, same map, same used/resolved. |
| S2 | Templates and recipes | T1-T10, composition, spine pass, loop-count gate, glass/blinds cell class, doors | Unit: every recipe x 150 seeds connected, loop count >= spec, spine reaches the objective template without crossing an interior, no machine walk-through (extend `crawler.test.ts:58`). Visual: a sweep spec renders each template once (existing `visual-sweep` pattern). |
| S3 | Missions: cards, styles, escalation | `mission` block on `QuestDef`; the deck; new objective kinds; escalation tiers; rewards table; failure states; the 12 cards | Unit: quiet finish pays +40% and standing; loud finish pays per-resolve; equal Rep/min within 15% in a scripted run. Journey: card #1 quiet, card #7 loud, card #3 escort, each to completion with real keys; abort returns to the hub with the card still on the board. |
| S4 | Stealth model | suspicion, cones, noise, light, patrols, hide, distract, social engineering, disguises, readable feedback | Unit (like `attacks.test.ts`): drive the real AI; assert nobody goes Quiet to strike inside 1.5 s, every Investigate has a bark, suspicion never rises with no line of sight and no noise, invisibility freezes it. Journey: sneak the stapler card past a patroller by waiting at a node; get seen sprinting; talk it off at Investigate. Bot: detection rate on 50 seeds inside 30-45%. |
| S5 | Staffing, mentoring, team on the board | staffing posts cards; delegation to a follower runs a card without you; team taken/left; mentee-on-mission | Journey: a staffing call adds a card with a deadline; Friday settles it as today (`settleWeek`); delegate a card as an architect and see it done at half credit. |
| S6 | Balance pass | bot policies (5.3), scenario decks, targets in a table in `docs/`, tuning | Bot: every row of 5.1 inside its target band at rungs 0, 6, 11 on 3 workplaces; any row outside fails the slice. |
| S7 | Release: notes, help, tips, save migration v3 to v4 | `releases.ts` 0.3.0 entry; help text; tips for eye/escalation; migrate `floorState` | Unit: a v3 save loads into a hub week with no cards lost. |

Each slice's gate includes the standing rule: every bug found gets a permanent assertion proven to fail with the fix reverted.

### 6.2 What is thrown away

`rollHostile` as a hub function (kept for crowds), the rectangle sampler (kept only as the placement step for template footprints), `aggroRange` (subsumed). Everything else is rewired, not rewritten.

## 7. Risks and open questions

- **Two games in one engine.** Stealth AI and Doom AI share `updateHostile`. Risk: a person who is neutral, then Noticed, then Alert, then hostile has four behaviour states where today there are two; bugs live at the seams. Mitigation: escalation is one-way and the `attacks.test.ts` pattern drives every transition.
- **Sneaking is slow and a bored player is worse than a scared one.** Silent Keyboard exists (`perks.ts:71`) but is rank 50. Mitigation: crouch speed 0.55 to 0.7 base; patrol pauses 2-4 s not 8; a quiet card is 4-7 minutes by design.
- **The hub can feel empty.** Neutral people who only wander are set dressing. Mitigation: walk-ups, gossip barks, healers, the story NPC, tickets; measure hub Rep/min and interaction count in the bot.
- **Generation regressions.** Templates cut the seed space; a bad recipe seals a room. The 150-seed gate stays and gets recipes.
- **Balance bot honesty.** A quiet policy that reads internal state the HUD does not show would overrate stealth. Rule: it reads only what the HUD shows (the bar, the eye, the automap route once observed).
- **Save size and migration.** `save.mission` plus the deck; v4 schema; Ironman saves mid-mission.
- **Scope.** S1-S4 are the release; S5-S7 could slip to 0.3.x without breaking the promise. The 12 cards are a starter; the deck needs ~25 for Overtime not to repeat.
- **Open**: should the hub be one persistent floor per week (as proposed) or one persistent BUILDING (the same hub every week, only the deck changes)? A persistent hub would let the office remember furniture, damage and people across weeks (the team already persists by name); it costs the theme-per-floor variety. Not needed for 0.3.0.
- **Open**: do bosses stay one per week, or do P1 cards sometimes end without a boss (a war room, a cutover)? Proposal: one boss per week for floors 0-4 (the story needs them), Overtime alternates.

## 8. Owner decisions needed (with my recommendation)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Where the player lives | hub floor / the mökki / both | **Hub floor**; mökki stays the weekend (1.1) |
| D2 | Week structure | P1 mandatory + free cards / all cards free, Friday whenever / fixed card count | **P1 mandatory + free cards, capacity-bound** |
| D3 | Team on stealth cards | never / intern only / anyone with a morale cost | **Intern only** (a quiet card is a solo thing; loud takes the team) |
| D4 | Sneak attack on a neutral | allowed as a crime / not allowed | **Allowed as a crime** (witness rule, HR, Alert): the RPG choice is the point |
| D5 | Disguises | none / lanyard, hi-vis, badge (3 items) / full outfit system | **The 3 items**; full outfits are 0.4 |
| D6 | Dark variants (after hours) | none / one card (#10) / a deck-wide modifier | **One card** in 0.3.0, the light input is built anyway |
| D7 | Escalation is one-way | yes / cools down after 60 s | **One-way** (readability), revisit after the spike |
| D8 | Hub: one floor per week (theme variety) or one persistent building | | **One floor per week** for 0.3.0 |
| D9 | Release cut | S1-S4 / S1-S7 | **S1-S7 is the plan, S1-S4 is the line below which it is not "the RPG pass"** |
| D10 | Spike first | yes / go straight to S1 | **Spike first**; the combat-share number and the escalation feel decide D7 and the targets in 5.1 |
