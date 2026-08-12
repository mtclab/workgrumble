# E11 endings: what happens when the arc runs out (D-E11-3 proposal)

Dated 2026-08-12. The owner's answer to D-E11-3 was "we need to come up with
multiple ways" - so this is a proposal for a SET of post-arc exits, framed
for discussion, nothing here decided. It assumes the six-week season
(D-E11-2, pending the nod) and per-week variety (D-E11-4, decided).

## What runs out, exactly

The employer arc: six weeks at one shop, the redundancy round somewhere in
the back half, the Friday reviews passed or not. When week 6 closes at an
employer, TODAY the code wraps to the probation shop - documented as a
placeholder (`employers.ts:328-332`). These are the candidate replacements,
designed to COEXIST rather than compete: which one fires is the player's own
state answering, which is how everything else in this game already works.

## The set (all four, chosen by state, not by menu)

1. **The offer** (the ladder continues): pass the arc cleanly and an offer
   letter arrives - the 0.6.0 employer-switch machinery, pointed at the next
   shop with arcWeek reset and the carry doing what it does today. This is
   the default GOOD exit and it already ships; the only new thing is that
   the offer is EARNED by the arc rather than scripted mid-week. Rising
   titles ride this exit (E9's start-title table decides what the next shop
   offers).

2. **The escape fund** (the ENDING ending): the owner's farm. The fund
   exists since the POC; the arc gives it a real denominator. When the fund
   crosses the price at an arc boundary, the game offers - never forces -
   the walk-out. Price tags per ending = the difficulty select the July
   sketch wanted (farm hardest). Taking it rolls credits (the scorecard
   machinery, one last time, whole-career grain). Declining it is a CHOICE
   the file remembers - comedy and consequence both.

3. **The loop, made legal** (the owner's "legal wrap" reading): staying in
   the trade. arcWeek keeps climbing; the shop's week 9 is not its week 1
   because composition is arcWeek-keyed and pools are big enough (D-E11-6).
   No new machinery at all - this exit is the generator doing its job. The
   honest cost: titles stall if the player never moves. That is true of the
   real trade too, and the review copy can say so once without preaching.

4. **The way out nobody chooses** (the fail state, already shipped):
   unemployable-after-reputation-trail is the POC's own fail design.
   Post-arc it gets one refinement: a fired-at-week-6 player re-enters the
   market with the arc's reputation trailing, so the next offer is a worse
   shop rather than a game over - until it is. (Game over stays possible;
   the trail just makes the slope real.)

## What this buys

- No single wrap answer, per the owner's instinct: the four exits are the
  four things that happen to real careers (move up, get out, stay put,
  slide down), and every one reuses shipped machinery (switch, fund,
  generator, reputation).
- The probation-shop wrap placeholder dies: week 6+1 at a shop is either an
  offer, an ending, week 7 at the same desk, or a worse offer - never a
  silent teleport to Monday-week-1.

## Open questions for the owner (small, none blocking slice 1-3)

- **Q1**: does the escape-fund ending require an arc BOUNDARY, or can a
  player walk out mid-week the day the fund crosses? (Rec: boundary - the
  Friday review as the natural "is this enough?" beat.)
- **Q2**: after the farm ending, does the save become a trophy (read-only
  career card) or does new-game+ exist (same badge, new career, records
  kept)? (Rec: trophy card now, NG+ is its own epic.)
- **Q3**: exit 3's title stall - silently true, or does the lead say it at
  a review once ("you've been here a while, Pat") as the one nudge?
