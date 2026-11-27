# Induction day (spec, Helldesk 0.2.0 slice 2)

Status: decided with the owner (a playable induction, skippable), to build
after slice 1 (`SPEC_COMBAT_READ.md`), whose wind-ups the parry step uses.

## Why

A new player gets one dense paragraph from Morag, then meets the first
hostile about 30 seconds later, in the first room past the lobby, having
been told nothing about attacking, the label maker's ammo, blocking or
what Sanity is. That is where the panic came from.

## Shape

A new career (unless skipped) starts the **induction**: a short guided
first morning in the floor-0 lobby, before the floor opens up. Morag runs
it. Each step shows one short instruction card at the top of the screen
with the key drawn as a keycap (and the mouse button as a mouse glyph),
and advances only when the player has done it. Morag's lines stay in the
game's voice, one or two sentences each.

1. **Look and move** - look around (mouse), then walk to Morag (WASD).
2. **Talk someone down** - a colleague (friendly, marked "practice") is
   staging a complaint; press E and pick a reply. It always succeeds.
3. **Swing** - a practice dummy ("Facilities training dummy") stands in
   the lobby: hit it with LMB.
4. **Heavy swing** - hold LMB until the ring is ready, release on the
   dummy.
5. **Label maker** - press 2 (or the wheel) to switch, fire at the dummy;
   the card points at the ammo count and says labels run out and are
   bought or found.
6. **Block and parry** - the dummy winds up and swings (slice 1 wind-up):
   hold RMB to block it, then raise block on the wind-up to parry.
   Blocked or parried practice hits do no Sanity damage; an unblocked one
   takes a little, and that first hit is where Sanity is introduced as
   your health ("Sanity is your health. At zero you burn out.").
7. **A ticket** - log on at the lobby computer (placed for the induction)
   and fix the one easy ticket waiting there.
8. **The map** - press M.

Then Morag: the floor is open, the lift goes up once the major incident is
dealt with, the mökki is on Fridays. The induction card disappears and
normal play starts.

## Rules

- **No hostile on the floor notices the player until step 6 is done** (no
  aggro, no approach). After that, normal rules.
- HUD meters appear when they first matter instead of all at once: Sanity
  and the tool cell from the start; energy with the heavy swing (step 4);
  REP and the queue with the ticket (step 7); Löyly, promille and caffeine
  the first time each changes. A returning player (induction skipped)
  sees everything.
- Wire the two tips that are never shown: `block` (at step 6, or the first
  block for a skipper) and `elite` (first elite seen).
- The induction is saved with the career: a reload mid-induction resumes
  at the same step. Quick/auto save work as normal.
- **Skip**: a checkbox on the New Starter Form, "Skip the induction". Off
  by default for someone who has never finished it; on by default once
  they have (remembered in settings, across careers). Skipping gives the
  floor as today (with the step-6 aggro gate lifted at once).
- The induction props (practice colleague, dummy, lobby computer) exist
  only while it runs and are removed cleanly after.

## Gates

- Unit: the step machine (each step advances only on its own event; no
  skipping ahead; resume from a saved step).
- Unit: the aggro gate (a hostile in range and in sight does not aggro
  before step 6, does after).
- e2e (shipped page, real keys and mouse where possible): play the whole
  induction from New career to normal play; assert each card appears,
  advances on the action, and the floor opens after.
- e2e: with skip ticked, New career lands straight in normal play, all
  meters visible, no induction props.
- e2e: reload mid-induction resumes at the same step.
- Each proven to fail with its fix reverted.
