# Helldesk 0.3.0 S2: floor layouts and a deck worth dealing

Parent: `docs/SPEC_HELLDESK_030.md` (proposal sections 2.6 and 3; owner decisions in 8a) and `docs/SPEC_HELLDESK_030_S1.md` (S1a hub and S1b deck, built). Two slices, built in order:

- **S2a: templates and recipes.** The remaining floor templates, and floors composed from them.
- **S2b: the card pool.** At least 18 non-P1 cards, so "a week needs to be random" (D2) holds.

## S2a: templates and recipes

### What the player gets

Floors stop being random rectangles. Every room shape has a job: a bullpen to fight in, a ring to loop round, offices off a corridor with a back way in, a kitchen everybody passes through, a server hall of aisles, an atrium you can see from everywhere. The hub becomes a recognisable office built from these, the same every week (it persists, D8), and mission maps are built from each card's recipe, so a sneaky card has a back corridor to its target and a loud card has an arena.

### Templates

Built in `templates.ts` as footprints like the spike's T2/T3 (and S1b's annex), with mirrored and rotated variants and seeded inner variety (pod count, box count, which offices have a spine door, where the landmark sits). Shapes and purposes as in the proposal, section 3.2:

| Id | Template | Must have |
|---|---|---|
| T1 | Open-plan bullpen | rows of desk pods with partitions (solid, not opaque, and blocking sight for a crouching player: a new partition-height rule), four doors so it loops |
| T2 | Meeting ring | built (spike) |
| T3 | Corner-office row + service spine | built (spike) |
| T4 | Kitchen hub | an island counter (cover), four spokes; a fight here costs Kitchen standing |
| T5 | Server hall | rack aisles (solid and opaque), one cross aisle; noise radius halved inside |
| T6 | Atrium loop | a planted void (solid, not opaque) with a walk all round; the landmark seen from every side |
| T7 | Lobby and lifts | the arrival lift(s), reception desk with sight over the lobby |
| T8 | Service spine | 2 cells wide, dim, locked service doors, at least one supply closet; generalised from T3's spine so any recipe can route one |
| T9 | Boss arena | today's boss room, kept |
| T10 | Print and post room | today's print room plus a `shredder` interactable (for plant/destroy objectives later) |
| annex | Josh's annex | built (S1b) |

### Composition

A **recipe** is an ordered list of templates plus rules; `generateLevel(..., recipe)` places them by rejection sampling, largest first, connects their doors with the existing MST-plus-loops corridor pass, adds loops until the recipe's loop count is met (a gate, not a hope), routes a spine when the recipe asks for one (entry template to the objective template, through service doors, never through a template interior), furnishes by room kind with the existing code, then runs the existing safety pass.

- **Hub recipe:** `[T7, T4, T1, T1, T2, T3, T5, T10, sauna?, IT counter]`, at least two independent loops. This replaces S1a's interim hub generator. The hub's persistent records (S1a: people by spawn index, hostility, decor-to-come) must keep working; an existing 0.3.0 dev save's hub may change shape once (0.3.0 is unreleased).
- **Mission recipes:** each card names its templates (3-5), its loop count (at least one), whether it has a spine, and which template holds the objective. Sneaky cards always have a spine touching the objective template, past at least one supply closet. Loud cards always have an arena (T1, T6 or T9).
- **Ordinary floors (no recipe) are unchanged:** the 300-floor fingerprint gate stays green. The week's floor P1 keeps today's generator.

### Gates (S2a)

Unit (each proven to fail with its behaviour removed):
1. Every template, every variant: footprints valid, doors on the edge, interior reachable from every door.
2. Every recipe x 150 seeds: connected (every walkable cell reachable from the entry lift), loop count met, objective template reachable, spine reaches the objective template without crossing a template interior, no furniture walk-through (extend `crawler.test.ts` ~58), no spawn or prop inside a wall.
3. Partition rule: a crouching player behind a partition is unseen by a standing person on the far side; a standing player is seen; a wall still blocks both.
4. Server-hall noise radius is halved inside T5 only.
5. The hub recipe: same career seed, same hub; hub people, hostility and records unchanged in behaviour (S1a gates still green on the new hub).
6. The 300-floor fingerprint gate stays green.
Browser (staging): a sweep spec renders each template once and screenshots it (the existing visual-sweep pattern); the hub walk (S1a gate 8) and the deck journey (S1b) still pass.

## S2b: the card pool

### What the player gets

Weeks that differ: at least 18 cards beyond the P1, across every style (sneaky, loud, mixed, social, escort, investigation), sizes (task and project) and bands, handed out by different coworkers, so two weeks in a row rarely share more than a card or two.

### The pool

Keep the S1b seven. Add the remaining proposal cards on their proper recipes: #6 The Change Freeze (mixed, T5 + T8), #8 The Auditor's Liaison (investigation/social, T3 + T5), #10 Karaoke Night Runs Late (sneaky, after hours only, T1 + T3 + T8, lights out), #11 The Migration Weekend (mixed, timed, Architect, T5 + T2 + T6), #12 P1 All-Hands, Executive Suite (loud, boss finale, Architect, T7 + T6 + T9; P1 subset). Then at least eight new cards in the same voice (ticket-speak and coworker grumbles, the existing quest writing as the tone reference), spread so that each band has at least six eligible non-P1 cards and every style appears in every band. Every card has: a giver from the hub's coworkers or a department, a style, a size, a recipe, an objective built from existing objective kinds (add new kinds only where a card needs one: `plant` with the T10 shredder, `observe`), optional rule constraints (which alarm rules it may be dealt), after-hours eligibility, and a failure consequence.

### Deal rules (S1b's, plus)

- **Overlap gate:** consecutive weeks share at most half of the smaller hand's non-P1 cards, whenever the eligible pool allows it (it always should at 18+).
- Over 8 weeks a career sees at least 75% of the cards eligible for its band.

### Gates (S2b)

Unit: the overlap and coverage rules over 200 career seeds x 8 weeks with the production exclusions; every card's data valid (giver exists, recipe exists, objective satisfiable on its recipe over 150 seeds); each new objective kind driven through the real game.
Bot (staging): every card x applicable approach completes on at least 80% of 10 seeds (the S1b matrix gate); report detection rate and quiet/loud Rep/min per card (targets enforced in S6).
Browser (staging): two new cards played end to end with real keys (one sneaky with a spine, one loud in an arena).
