# SUO - what the steam shows (spec, slice 1)

Status: decided with the owner, to build. Helldesk is the vision and the look;
this takes the good parts of the KAIRA-7 shooter idea and builds them the
Helldesk way (same renderer, same voxel people, same PBR office), not KAIRA's
posterized renderer.

## What we take from KAIRA

1. **SUO, the other side.** The same office, seen as the bog under it: peat
   walls, driven timber, roots, standing water, low amber light through steam.
   The people in it are "things that were colleagues".
2. **A meter's edge moves you, it never kills you.** In KAIRA an empty meter
   yanks you back to the floor. Here, too much Löyly takes you under, and the
   steam running out brings you back. Nothing is lost by it.
3. **The myth plays it straight.** The office is the joke; SUO is silence and
   understatement. The contrast is the point, so it only works if SUO never
   jokes. Enforced by a tone lint (below).
4. **The crossing is instant and loud.** One white frame, a short hitstop, and
   look, fog and sound change together. Never a loading screen.
5. **"It works" and "the player can tell it works" are different claims.**
   Both are tested.

## Löyly today

Löyly is the rune resource (max from Tech, perks, sign, savusauna). It rises
from a slow trickle, a sauna (+40, or full at the mökki), rest, a Salmari (+45)
and a little in combat, and every gain is clamped at the max: surplus is
silently wasted. At zero a rune just refuses ("Not enough Löyly").

## Overflow: the steam takes you under

**Trigger.** A single deliberate gain - a sauna throw, a Salmari, resting -
that finds Löyly already at 90% or more of max and would pass max by at least
10. Never the passive trickle or combat. Not while any hostile that has
noticed you is within 15 m (the steam waits; say so in one line). At most once
per floor visit in the office, once per weekend at the mökki.

**The vision.**

- The current place is redressed in place: walls, floor and ceiling take SUO
  materials (peat and timber walls, bog water floor, dark peat ceiling), the
  ceiling lights go out, one low amber light, amber-peat fog pulled in close.
  Props stay as they are, darkened: the office is still recognisably there.
- People on the floor stand still as dark silhouettes and slowly turn to face
  you. They do not act, attack or talk. Nothing hostile exists in SUO in this
  slice.
- The HUD is gone except one line of serif text and a thin steam meter.
- The Löylyhenki - a tall figure of steam and a little light - stands 10 to
  18 m away on a floor cell you can reach. Walking to it and pressing E gives
  the blessing and surfaces you.
- The steam meter is the time you have: 30 s, not paused by anything but the
  pause menu. When it runs out you surface without the blessing; Löyly is
  still full. Nothing is punished.
- Leaving restores exactly what was there (materials, lights, fog, exposure,
  HUD, people's visibility and pose). A vision is never saved: autosave,
  quicksave and slot saves wait until you are back; a reload mid-vision
  loads the normal world.

**The blessing (one, fixed for slice 1).** Sanity to full, and your next rune
costs no Löyly and always succeeds. Shown in the effects list until used.

**Entering / leaving.** One white frame, 0.07 s hitstop, a steam hiss that
falls into a low drone (enter) and rises back into the office hum (leave).
Enter line and leave line are SUO lines (see tone).

**Sound.** A SUO ambient bed alongside `office` and `mokki`: low filtered
noise (wind), a slow low drone, the odd drip. Synthesized, like the rest.

## Running dry: cold steam

When a rune needs more Löyly than you have, it no longer just refuses. If you
have the sanity for it you cast on **sisu**: the rune costs 1.5x its Löyly
cost in sanity, at a quarter worse odds. The line is SUO-voiced ("Cold steam.
You pay with yourself.") the first time per floor; after that just the cost.
If you have neither, the old refusal stands.

## Tone rule (lint)

Every SUO string (vision enter/leave lines, the Löylyhenki, the dry line):
at most 8 words, no exclamation marks, no emoji, none of the office's
vocabulary (ticket, SLA, meeting, KPI, stakeholder, sync, deliverable,
manager, HR, IT, email, Teams, synergy, deadline). A unit test fails the build
on any breach, and is proven to bite.

## Gates

- Trigger rules as unit tests: the 90% and +10 thresholds, the excluded
  sources, the hostile-nearby wait, the once-per-visit and once-per-weekend
  limits.
- A vision always ends: from any start, the steam meter reaches zero in
  30 s of play and the player surfaces (unit test on the timer; e2e below).
- Restore is exact: every material, light, fog value, exposure, HUD state and
  actor visibility after leaving equals what it was before (asserted by
  snapshot, unit or e2e).
- No save during a vision (quicksave, autosave, slot save all refused; a
  reload lands in the normal world).
- Sisu cast: sanity cost, odds penalty, the no-sanity refusal.
- Tone lint with teeth.
- e2e on the served build: at 95% Löyly, throw löyly at an office sauna ->
  the vision starts (serif line visible, HUD gone) -> walk to the
  Löylyhenki -> E -> back in the office, blessing in the effects list,
  the next rune costs nothing. And the timeout path: stand still 30 s ->
  back, no blessing, nothing lost.
- Screenshots of the vision on two floor themes and at the mökki, reviewed by
  eye before it ships (does it read as the same place, gone under?).

## Out of scope (later, if it earns it)

SUO enemies (bog-wardens, drowned things), a choice of blessings, sauna
manners and the tonttu's temper, visions triggered by anything but Löyly.
