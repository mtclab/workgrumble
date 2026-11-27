# Combat you can read (spec, Helldesk 0.2.0 slice 1)

Status: decided with the owner, to build. Part of the 0.2.0 polish plan.

## Why

A new playtester panicked and could not tell how the weapon worked. The
code says why: every enemy's attack animation starts on the frame its
damage lands (a follow-through, not a wind-up), so nothing can be seen
coming, dodged or parried on purpose; the only hit-direction cue is the
32 px face portrait glancing sideways; a melee click always swings once
before a heavy charge can start; a miss makes almost no feedback; an empty
weapon only complains on the click.

The rule this slice establishes: **every hit on the player is announced
before it lands, and every action the player takes answers.**

## Enemy wind-ups

- Every enemy melee or contact attack becomes two phases: **wind-up** then
  **strike**. Damage is decided at the strike, from where the player is
  then (so stepping away during the wind-up avoids it). The wind-up shows:
  the arm (or body, for non-humanoids) drawing back, a brief warm tint or
  flash on the attacker, and a short rising sound.
- Wind-up length per kind, never under **0.35 s**; bigger hits wind up
  longer (a boss slam 0.6-0.8 s). Tune by kind in one table.
- Contact damage (reply-all, mosquito bite, vendor, customer, boss contact)
  gets the same treatment: a visible lunge or buzz-up before it bites.
- Ranged throwers get a short aim/raise (>= 0.3 s) before the projectile
  leaves. Every projectile gets a sound. The code shots become thicker and
  brighter.
- Bosses: "QUICK sync!" charge gets a 0.6 s crouch before it starts; laser
  rings and PO bombs get a landing marker that fades in before they hurt
  (reuse the phase-2 hazard fade-in in `combat.ts`).
- **Parry** is timed on the strike: raising block in the last 0.25 s before
  a strike lands parries it (stagger, the existing PARRY feedback). The
  current "block pressed in the last 0.3 s" rule is replaced by this.

## The player learns where it came from

- A **hit-direction arc** on the screen edge, pointing to the damage
  source, fading over ~0.8 s. Shape carries it, not colour. Damage with no
  source (auras) shows a full faint ring instead.

## The player's weapon answers

- Melee: **holding LMB starts the charge without a light swing first**; a
  release before 0.2 s is a light swing, a release after the charge is
  ready is the heavy. The charge ring appears only once a hold passes
  0.2 s (no flicker on taps). Releasing early (between 0.2 s and ready)
  is a light swing, not silence.
- A melee **miss** plays a whiff and throws a small dust puff where the
  swing ended.
- The first-person viewmodel draws back while charging.
- **Out of ammo or energy while holding fire**: an empty click on each
  attempted shot (throttled) and the crosshair changes shape while held.
- Shove (tap RMB) gets its own sound and a small push ring.

## Gates

- Unit: a table-driven test that every enemy kind's attack (melee,
  contact, ranged, each boss pattern) has a wind-up >= its floor before
  damage; proven to fail if a wind-up is set to 0.
- Unit: damage at the strike is decided from the player's position then,
  not at wind-up start.
- Unit: the melee input rules (tap = light, hold past ready = heavy,
  early release = light, never both a light and a heavy from one press).
- e2e (shipped page, real keys): an enemy winds up, the player strafes out
  during the wind-up, sanity does not drop; the same setup standing still
  does take the hit (the control).
- e2e: raising block on the wind-up parries (PARRY shown, attacker
  staggered); blocking long before does not parry.
- Each gate proven to fail with its fix reverted.

## Out of scope

Tutorial (slice 2), accessibility toggles and non-colour cues (slice 5).
