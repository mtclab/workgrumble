# Helldesk 0.3.0 spike: result

Status: measured on the staging machine (software renderer, headless bot), branch `helldesk-030-spike`. Proposal: `docs/SPEC_HELLDESK_030.md` (section 6.0). Nothing here is an owner decision.

## 1. How much of today's game is fighting

`scripts/helldesk-balance/combat-share.mjs`, today's floors (unchanged by the spike: 300 floors are fingerprint-pinned), 3 seeds x 3 floors per career. Combat = game time with a hostile, aggro person within 14 m, or the player dealing or taking damage in the last 2 s.

| Career | Floors | Combat share, mean | Range | Fights (episodes) per floor |
|---|---|---|---|---|
| Trainee (rung 0) | 9 | 51% | 37-73% | 2-6 |
| Senior (rung 6, cat6 + cardigan) | 8 of 9 | 50% | 41-70% | 3-6 |

The ninth senior floor (2159 s, almost all of it "walking") is a bot path stall, not play; it is left out and noted below. Mean per seed: trainee 57% / 55% / 42%, so seed-to-seed spread is about 15 points, above the 10-point reproducibility target; individual floors vary a lot by layout. The same seed reproduces the same floor exactly (two passes matched).

Reading: half of a floor is fighting, at both ends of the career. This is the friend's complaint as a number, and it matches the proposal's 50-65% estimate. The 0.3.0 target is about 25% averaged over a week (hub at or under 5%).

## 2. The two prototype cards

`crawler.html?mission=stapler|vendor`, `scripts/helldesk-balance/mission-matrix.mjs`. The quiet bot reads only what the HUD shows.

| Card / approach | Runs | Finish | Game time | Rep/min (mean) | Combat | Lowest sanity |
|---|---|---|---|---|---|---|
| #1 Red Stapler, quiet | 30 | 30 quiet | 45-48 s | 245 | 0 s | 100% |
| #1 Red Stapler, loud | 10 | 10 loud | 19-29 s | 435 | 0-12 s | 94-100% |
| #7 Vendor Day, loud | 10 | 10 loud | 32-51 s | 599 | 22-40 s | 53-85% |

- Detection rate on the stapler, quiet: **0%** (target 30-45%).
- Quiet vs loud Rep/min on the stapler: **0.56** (target 0.85-1.15).
- Cards last under a minute (target 4-8 minutes): the prototype maps are two templates, not a full mission.

## 3. Verdict

- **Direction: go.** The measurement confirms the problem the RPG pass is for.
- **Escalation model: works, needs tuning, keep it one-way for now (D7).** Tiers rise and are announced, nobody goes from Quiet to a hit inside 1.5 s, runs are deterministic per seed, normal floors are untouched. The quiet bot never reached Alert, so there is no evidence yet for or against a cool-down.
- **The stapler card is too easy and sneaking does not pay.** Causes, from the runs and the code:
  1. The service spine is a guaranteed blind route: nobody's cone covers it, so the quiet route has no risk at all.
  2. Loud is faster: the loud bot runs straight to the closet, and nobody stops it in a 20-second card; the +40% quiet bonus does not cover crouch speed.
  3. The card is a two-room template, so time-based rewards are dominated by walking.

## 4. Changes before S3/S4 (proposals, to tune with the bot)

- Give the quiet route exposure on purpose: one patroller crossing or a desk with a view of the spine on each card, so detection is a skill, not zero.
- Crouch speed 0.55 to about 0.7 of walking (spec risk 7 already suggests it), measured.
- Loud must cost: HR going loud should lock the closet (Security check under pressure) or summon, so loud is not a shortcut.
- Pay the quiet bonus on what quiet costs (time), or add a quiet-only optional goal, and re-measure the 0.85-1.15 band on full-size cards, not prototypes.
- Fix the bot's walking stall (one senior floor) before the S6 balance pass.

## 5. What was built (all behind `?mission=`, normal play unchanged)

Templates T2 (meeting ring) and T3 (corner offices + service spine) behind a `recipe` argument; per-person suspicion (110 degree cone, crouch, noise), patrols, four one-way escalation tiers with HUD eye, bars and toasts; two cards with results; mission HUD replacing the floor's; balance bot: combat share, activity breakdown, seeded runs, quiet/loud mission policies, mission matrix. Gates: 910 unit tests, 70 bot tests, 42 browser tests on staging (the 39 of 0.2.0 plus 3 mission tests).
