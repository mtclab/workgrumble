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
- **What persists** (new `save.hub`, see Save): which people are hostile and why, who has been resolved this week, per-person ignores (with when each was counted), this week's arrivals (a story's enemy, a visiting manager, a breach's reporter up the lift: each with a unique index from a counter in `save.hub` that is never reused, its kind, name and why, kept until resolved or Monday across reloads and lift trips), used interactables (reset each Monday: the coffee machine refills over the weekend), and the hub's own once-a-floor things (Unbreakable, the Nokia, the SUO vision, the cold-steam line), separate from the P1 floor's and fresh each Monday.

### Hostility is earned (proposal 1.4, D4)

Every source below is announced before anyone attacks: a toast naming who and why, a bark, a visible "!" and the existing wind-up rule (nobody hits within 1.5 s of turning).

| Source | Today's code | In the hub |
|---|---|---|
| SLA breach | `desk.ts breach` | The ticket's reporter (by name, `q.from`) turns hostile and comes to find you. Toast: "<name> is on the way up, and is not happy." If they were resolved earlier this week, the same person turns again (announced), never a duplicate; only if the hub has had nobody of that name this week does a user arrive by the lift with that name. A ticket raised on the hub that breaches while you are on the P1 floor is the hub's: nobody is sent upstairs, and its reporter is after you on the hub when you return (announced then). |
| Ignored walk-up | none | A neutral worker with a problem walks up (`seek` state, "?" bubble, a line). Talking to them resolves it (a small Rep reward, or a ticket added to your queue: the option states its SLA, "SLA about 2 min"). They reach you only by standing within 1.8 m, in sight of you, with their line said (the bubble up) for at least 1 s; only then does walking away (past 4 m) count one ignore. Walking past them is not ignoring them, and a walk-up who gives up without reaching you counts nothing. Each ignore is forgotten 10 minutes of hub time after it was counted; the third ignore turns them hostile with a bark. No walk-up starts while you are in a fight (anyone after you within 20 m, or damage dealt or taken in the last 10 s), and one already under way counts nothing until the fight is over (they have to reach you again). At most one walk-up at a time; one every 60-120 s of hub time. |
| Failed talk-down | `story.ts failTalk` | Unchanged (enrage). |
| Attacking a neutral person (D4) | sneak attack exists | Only a deliberate melee swing or shove at a neutral person (nobody hostile in its reach) is the crime; your shots, splash and area effects pass through neutral people (no damage, no crime), and a swing at an enemy does not catch the colleague beside them. The crime: the victim turns hostile, every neutral within 12 m who can see it turns hostile, and HR issues a warning (existing warning path). |
| Witnessed crime | `vices.ts caughtCheck` | Unchanged, plus the witness is hostile for the rest of the week. |
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

## S1b outline: the workstation and the weekly deck

- **Your workstation:** a desk in the hub that is yours (the terminal you log on to there opens a Projects tab in WorkgrumbleOS). It lists the week's cards: tasks (small, short) and projects (bigger, multi-stage), each with size, difficulty, style, giver, pay and deadline. Coworkers with "!" also hand you cards in person.
- **The weekly deck (D2):** each Monday deals a random mix by band and week (seeded per career and week): 3-7 cards, varied in size, style (sneaky, loud, mixed, social, investigation, escort), giver and after-hours or not (D6: pay by giver). The P1 is always one of them and unlocks Friday.
- **Mission maps:** a taken card sends you by lift to a fresh map built from its recipe (the spike's T2/T3 first; S2 adds the rest). The P1 becomes a card whose finale is the week's boss.
- **Alarm rule per card (D7):** one-way, search-then-calm, or full cool-down, shown on the card.
- Gates: deck variety over seeds (no two consecutive weeks deal the same mix), every card reachable and completable by the bot quiet and loud where allowed, P1 always present.

## S1c outline: decor, special items and buffs

- **Decor (D8):** the hub persists, so decor sticks: a placement mode for decor items on free cells in the hub (desk, kitchen, lobby), stored in `save.hub`.
- **Special items:** boss and P1 cards drop special items and trophies; some give percentage or flat buffs (for example +5% Rep from quiet finishes, -10% caffeine crash), all applied through `state.ts derive` so the character sheet shows them.
- Gates: a placed decor item is in the same place after a reload and next week; each buff changes the derived stat it names and nothing else.
