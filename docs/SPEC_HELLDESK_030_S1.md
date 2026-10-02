# Helldesk 0.3.0 S1: the hub

Parent: `docs/SPEC_HELLDESK_030.md` (proposal) and its section 8a (owner decisions D1-D9, 2026-10-02). Spike result: `docs/spikes/helldesk-030-spike.md`.

S1 is split into three slices so each can be built, gated and played on its own:

- **S1a: the persistent hub** (this spec, build-ready).
- **S1b: the workstation and the weekly deck** (outline at the end; spec after S1a lands).
- **S1c: decor, special items and buffs** (outline at the end; spec after S1b).

## S1a: the persistent hub

### What the player gets

A career has one office floor, the hub, that stays theirs for the whole career. Monday starts there. Nobody in the hub attacks you unless you give them a reason, and every reason is announced before anyone swings. The week's major incident (P1) is reached by the lift: for S1a the P1 is today's floor for that week, played exactly as today, so the whole existing game becomes the P1 and nothing is lost while missions are built in S1b. Friday is unlocked by resolving the P1, and the lift takes you back to the hub at any time.

### The week (S1a)

1. **Monday:** the lift opens onto the hub. Toast: "Monday. This week's major incident: <boss name>, floor <n>." The P1 quest line is in the tracker, as today's MAJOR INCIDENT line.
2. **The hub:** terminals and the ticket queue, the kitchen, the IT counter, the sauna room if it rolled, quest givers ("!"), the story NPC of the week, staffing calls and mentoring, as today. Everyone is neutral.
3. **The lift in the hub** offers: "Floor <n>: the major incident" (always), and "Friday: to the mokki" once the P1 is resolved.
4. **The lift on the P1 floor** offers: "Back to the hub" (always) and "Friday: to the mokki" once the boss is resolved (today's behaviour).
5. **Friday to Sunday:** as today. **Next Monday:** `goToWork` increments the week and the P1 floor index (today's `floor + 1`) and lands in the hub, not on the new floor.

The P1 floor keeps today's `FloorState` (resolved people, used props, boss hp and phase), so leaving it for the hub and coming back resumes it. Burnout on the P1 floor: "Clock back in" restarts that floor as today. Burnout in the hub: you wake at the hub's lift.

### The hub floor

- **Generation:** `generateLevel` with a new `recipe: 'hub'`, seeded once per career (`save.seed`, a fixed hub salt), so the same career always gets the same hub. Until S2's templates exist, the hub recipe is today's room generator with: a lobby (with the lift) as room 0; guaranteed kitchen, IT counter and at least two open-plan rooms; the sauna room at today's odds; no boss room; and **no `hostile` spawns at all** (`rollHostile` is not called for the hub). The 300-floor fingerprint gate (`levelprint.test.ts`) must stay green: ordinary floors are unchanged.
- **Theme:** one theme per career, picked from `THEMES` by the career seed.
- **People:** colleagues spawned from the existing neutral kinds (npc, healer, helpers, quest givers, the story NPC), plus "workers": users, callers and managers spawned **neutral** (`hostile: false`), who wander and sit at desks. Their names and looks are seeded by spawn index (same rule as the spike's resolved-spawn fix), so a reload and next week show the same people.
- **What persists** (new `save.hub`, see Save): which people are hostile and why, who has been resolved this week, per-person ignores (with when each was counted), this week's arrivals (a story's enemy, a visiting manager, a breach's reporter up the lift: each with a unique index from a counter in `save.hub` that is never reused, its kind, name and why, kept until resolved or Monday across reloads and lift trips), used interactables (reset each Monday: the coffee machine refills over the weekend), each person's once-a-week beats (a leaving-card signature, a gift, a talk-down, who has gone cold on you), and the hub's own once-a-floor things (Unbreakable, the Nokia, the SUO vision, the cold-steam line), separate from the P1 floor's and fresh each Monday.

### Hostility is earned (proposal 1.4, D4)

Every source below is announced before anyone attacks: a toast naming who and why, a bark, a visible "!" and the existing wind-up rule (nobody hits within 1.5 s of turning).

| Source | Today's code | In the hub |
|---|---|---|
| SLA breach | `desk.ts breach` | The ticket's reporter (by name, `q.from`) turns hostile and comes to find you. Toast: "<name> is on the way up, and is not happy." If they were resolved earlier this week, the same person turns again (announced), never a duplicate; only if the hub has had nobody of that name this week does a user arrive by the lift with that name. A ticket raised on the hub that breaches while you are on the P1 floor is the hub's: nobody is sent upstairs, and its reporter is after you on the hub when you return (announced then). |
| Ignored walk-up | none | A neutral worker with a problem walks up (`seek` state, "?" bubble, a line). Talking to them resolves it (a small Rep reward, or a ticket added to your queue: the option states its SLA, "SLA about 2 min"). They reach you only by standing within 1.8 m, in sight of you, with their line said (the bubble up) for at least 1 s; only then does walking away (past 4 m) count one ignore. Walking past them is not ignoring them, and a walk-up who gives up without reaching you counts nothing. Each ignore is forgotten 10 minutes of hub time after it was counted; the third ignore turns them hostile with a bark. No walk-up starts while you are in a fight (anyone after you within 20 m, or damage dealt or taken in the last 10 s), and one already under way counts nothing until the fight is over (they have to reach you again). At most one walk-up at a time; one every 60-120 s of hub time. |
| Failed talk-down | `story.ts failTalk` | Unchanged (enrage). |
| Attacking a neutral person (D4) | sneak attack exists | Only a deliberate melee swing or shove at a neutral person (nobody hostile in its reach) is the crime; your shots, splash and area effects pass through neutral people (no damage, no crime), and a swing at an enemy does not catch the colleague beside them. The crime: the victim turns hostile, every combat-capable neutral (users, callers, managers, consultants, any kind with an attack) within 12 m who can see it turns hostile, every non-combat neutral who sees it (healers, quest givers, the story NPC, helpers) goes cold instead (for the rest of the week they refuse to talk, heal or give quests, with a line saying so), and HR issues a warning (existing warning path). |
| Witnessed crime | `vices.ts caughtCheck` | Unchanged, plus a combat-capable witness is hostile for the rest of the week; a non-combat witness goes cold for the week instead (as for an assault). |
| Low Staff standing | grudge | Below -40 Staff, one random worker turns hostile each Monday (announced). |
| Story choice | story.ts | A story choice that makes an enemy (for example blaming Derek) brings them to the hub, announced like the others. |

Hostility lasts until that person is resolved (talked down or beaten) or until next Monday. Resolved hub people come back next Monday, neutral (they had the weekend).

### Save (version 4)

- `save.version` becomes 4. New `save.hub`: `{ hostile: {spawnIndex: reason}[], resolved: number[], ignores: Record<number, number>, used: number[], lastWalkUp: number }`, plus `save.location` gains `'hub'`.
- **Migration from v3 (gate):** a v3 save on an office floor loads into the hub of the same week, with its `floorState` kept, so taking the lift to the P1 resumes that floor exactly; a v3 save at the mokki stays at the mokki and next Monday lands in the hub. No v3 save loses Rep, items, quests, standing or its floor progress.
- Autosave, F5/F9 and slots work in the hub and on the P1 floor; saves still keep no player position (owner decision pending; loads land at the location's start).

### Induction

The induction day (`inductionday.ts`) runs in the hub's lobby on week 1 instead of on floor 0. When it ends, Morag points at the lift for the first P1. "Skip the induction" lands in the hub. The induction's own rules and gates are unchanged; its props are placed in the hub lobby.

### Out of scope for S1a

The workstation's task/project list and the weekly deck (S1b); mission maps for P1s (S1b; until then the P1 is today's floor); decor, special items and buffs (S1c); templates (S2); stealth in the hub (S4: the hub uses the simple announced-hostility rules above).

### Gates (S1a)

Unit (vitest, driving the real code; each proven to fail with its behaviour removed):

1. A hub floor has zero hostile actors on load, for 150 career seeds.
2. The same career seed builds the same hub (cells, rooms, interactables, people's names) every time; ordinary floors are unchanged (the existing fingerprint gate stays green).
3. Every hostility source in the table turns exactly the right person hostile, announces it first, and nobody strikes within 1.5 s of turning; nothing else turns anyone hostile in the hub.
4. Walk-ups: a third ignore turns the walker hostile; talking resolves it; never two at once.
5. Week flow: Monday lands in the hub; the hub lift offers the P1 floor and, only after the P1 is resolved, Friday; leaving the P1 floor and returning resumes it (`FloorState` kept).
6. Save v4 round-trip in the hub and on the P1 floor; v3 to v4 migration keeps every field listed above, for saved fixtures from the hub, mid-floor, and the mokki.
7. Burnout in the hub wakes you in the hub; on the P1 floor it restarts that floor.

Browser (staging, real keys, e2e/helldesk-hub.spec.ts; the existing suite updated where the flow changed):

8. New career (induction skipped) lands in the hub; three minutes of walking the hub takes no damage.
9. A walk-up, ignored three times, turns hostile with the bark first; talking to the next one resolves it.
10. The lift to the P1 floor, a fight there, the lift back to the hub, the lift back again: the floor is as it was left.
11. Every existing Helldesk e2e spec passes, updated only where the shipped flow now goes through the hub (the playthrough's first day and week, induction, saves).

Bot (staging): a hub-only week (`approach: 'hub-only'`: tickets, talk, walk-ups, no lift to the P1) has combat share at most 5%.

## S1b: the workstation and the weekly deck (build-ready)

### What the player gets

Monday on the hub, your workstation (your own desk, with its computer) shows **this week's deck**: a different random hand of tasks and projects every week, small and big, quiet and loud, from different people, some after hours. The week's major incident is always one of them. Some cards are handed to you in person by a coworker with a "!" instead. You choose what to take on (up to your workload capacity), take the lift to it, play it, and come back to the hub with the pay and the consequences. Missions do not all play the same: each card says how its alarm behaves.

### Your workstation

- **One desk in the hub is yours** (generated with the hub, persistent, marked on the map as "your desk"). Its terminal opens WorkgrumbleOS with a new **Projects** tab: the week's cards. Every other hub terminal still works the ticket queue as today; only your workstation shows the deck (so it is a place you go back to).
- **A card shows:** title, giver, size (task or project), style, difficulty band, pay (Rep, plus standing if quiet), deadline (P1: a clock once started; others: Friday), after-hours or not, and **the alarm rule** (D7) in plain words. Buttons: Accept / Decline (declining a coworker's card costs a little standing with them).
- **Accepted cards** count toward workload capacity (existing `Derived.capacity`); over capacity gives today's overload penalties.

### The weekly deck (D2)

- **Dealt each Monday**, seeded by career seed and week (same career, same week, same deck): the P1 plus 2-6 others (count by rung band: Helpdesk 3-4 total, Specialist 4-5, Architect 5-7), drawn without repeats from the card pool by band, with style weights so a week is never all one style (at least one non-loud card and at least one non-sneaky card whenever the pool allows).
- **No two consecutive weeks deal the same set** of non-P1 cards.
- **In-person cards:** about a third of the non-P1 cards are attributed to a hub coworker (their giver) who carries a "!"; talking to them offers the card. They also appear on the workstation as "ask <name>".
- **Staffing** (today's phone calls) keeps working as today in S1b; turning staffing into cards is S5.

### Cards

- **Data:** `MissionCard` (mission.ts) extended with: `size: 'task' | 'project'`, `band`, `giver` (id + name, hub coworker or department), `afterHours?: boolean` with the giver's after-hours pay multiplier (D6: some givers pay 1.5x after hours, some 1.0x; a table in the giver data), `alarm` (D7, below), `recipe`, `style` (extend to 'sneaky' | 'loud' | 'mixed' | 'social' | 'escort'), `failure` (what happens when it fails: giver hostile on the hub next visit (announced), standing loss, card gone).
- **S1b pool** (built on maps that exist: the spike's T2 meeting ring and T3 office row, plus today's generator as a "large" recipe):
  1. #1 The Red Stapler (sneaky, task, T3), with the spike's tuning applied: one patroller whose route crosses the spine at one point, crouch speed raised to 0.7 of walking, and going loud locks HR's closet (a Security check under pressure) and calls HR's manager.
  2. #7 Vendor Day (loud, task, T2).
  3. #4 Password Hygiene Week (sneaky, task, T3: collect 8 of 12 post-its unnoticed).
  4. #5 Phishing Test Debrief (social, task, T2: three talk-downs at the meeting table, printed odds; a failed check goes loud).
  5. #3 Josh's First Day, Again (escort/mixed, project, T2 + T3: escort Josh past a hostile vendor pocket).
  6. #9 Marcus and the Backups (sneaky/social, project, T3: reach Marcus's office unnoticed, fix the agent, the existing three-way choice).
  7. #2 P1 The Printer Uprising (loud, project, large recipe: today's generator, 6 jams and the elite).
  8. **The week's P1:** a card whose map is the week's floor exactly as today (today's floor and boss, P1 rules), so the story bosses keep their floors. On a week where #2 is the P1 it replaces the floor P1 at Helpdesk band only; otherwise the floor P1 is the P1.
  After-hours versions: any card except the floor P1 may be dealt after hours: half the crowd, dimmer lights (lighting only; light-affects-sight is S4), the giver's after-hours pay.

### The alarm rule per card (D7)

Each card names one of three rules, shown on the card and in the mission HUD:

| Rule | Plain words on the card | Behaviour |
|---|---|---|
| `one-way` | "Once they know, they know." | Today's spike model: tiers only go up. |
| `search` | "Lose them and they search, then give up." | A person at Alert who has not seen you for 8 s starts **searching** (visible countdown over their head, 20 s, walking to your last seen spot); at 0 they drop to Noticed. Escalated (everyone) stays. The mission tier follows the highest person. |
| `cooldown` | "It blows over." | Any tier, Escalated included, drops one step after 45 s with nobody seeing you or fighting; announced like a rise. |

Loud cards are dealt `one-way` or `cooldown`; sneaky and social cards any of the three; the deck weights so a week has at least two different rules when it has three or more non-P1 cards.

### The lift as mission select

The hub lift lists: each accepted card ("<title> (<place>)"), "Floor <n>: the major incident" when the P1 is the floor card, and Friday once the P1 is resolved. On a mission map the lift offers "Finish" (objective done), "Abort" (card stays on the board until Friday; a P1 cannot be aborted, only left), and Friday when allowed. Results card as in the spike, then back to the hub.

### Saves

Saving works on a mission map (the spike refused it): `save.mission` holds the card, seed, run state (objective progress, tier, per-person suspicion and mood, resolved, used, picked), so a reload mid-mission lands at the mission's lift with everything as it was. `save.deck` holds the week's deal and each card's state (offered, accepted, done, failed, declined). Save version stays 4 with additive fields (old v4 saves get an empty deck dealt on load).

### Gates (S1b)

Unit, each proven to fail with its behaviour removed:
1. The deal: same career and week give the same deck; P1 always present; card count by band; style mix rule; two consecutive weeks never deal the same non-P1 set; over 200 career seeds x 8 weeks.
2. Accept/decline: capacity counts accepted cards; declining a coworker's card costs standing with that coworker only; in-person cards are only offered by their giver.
3. Alarm rules: one-way never drops; search drops an Alert person to Noticed only after 8 s unseen plus the 20 s countdown, never Escalated; cooldown drops one tier after 45 s unseen and no fighting, announced.
4. After hours: half crowd, the giver's multiplier applied to pay, the floor P1 never after hours.
5. Failure: a failed coworker card turns that coworker hostile on the hub next visit, announced (a new S1a hostility source: add the row).
6. Save and reload mid-mission: same map, tier, suspicion, objective progress.
Browser (staging): take a card at the workstation, ride the lift, finish it quiet, come back paid; take a loud card and abort it: it is still on the board; a coworker's in-person card offered by talking to them.
Bot (staging): every card in the pool completes with approach quiet (where the style allows) and loud, over 10 seeds each, no errors; report detection rate and quiet/loud Rep/min per card (targets are enforced in S6, reported now).

## S1c outline: decor, special items and buffs

- **Decor (D8):** the hub persists, so decor sticks: a placement mode for decor items on free cells in the hub (desk, kitchen, lobby), stored in `save.hub`.
- **Special items:** boss and P1 cards drop special items and trophies; some give percentage or flat buffs (for example +5% Rep from quiet finishes, -10% caffeine crash), all applied through `state.ts derive` so the character sheet shows them.
- Gates: a placed decor item is in the same place after a reload and next week; each buff changes the derived stat it names and nothing else.
