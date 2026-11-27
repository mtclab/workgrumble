# First launch: graphics, loading, accessibility (spec, Helldesk 0.2.0 slice 5)

Status: decided with the owner (auto-pick graphics on first launch).

## Why

The game defaults to `quality: 'high'`, about twice medium's GPU cost; on a
laptop's built-in graphics that is roughly 25-40 fps. New career and
Continue freeze with no indicator while the level generates. Accessibility
gaps: shake "off" still leaves 20%; no flash or hitstop toggle; hurt/heal,
loot rarity and charge-ready are colour-only; LMB/RMB cannot be rebound.

## Changes

- **Auto quality** (first launch only, i.e. no saved settings): on the
  title screen, sample frame times for ~3 s (skipping the first 0.5 s of
  warm-up). If the median frame time is over the target (~20 ms, i.e.
  below ~50 fps), step down one level (high -> medium -> low), re-sample,
  repeat; stop at low. Save the result with a flag "chosen automatically";
  Settings shows that note and the player can override it (an override
  clears the flag). Never runs again once settings exist. Pure decision
  logic in its own module with unit tests; the sampling is a thin wrapper.
- **Loading indicator**: New career, Continue, Load and floor changes show
  a short "badging you in" card before the heavy work, and the heavy work
  runs on the next frame so the card actually paints.
- **Accessibility settings** (Control Panel):
  - Camera shake off means none (not 20%).
  - A "Screen flashes" toggle (hurt/heal vignette, white frames).
  - A "Hit pause" toggle (hitstop).
  - Non-colour cues: loot rarity gets a letter or small mark beside the
    colour; hurt and heal vignettes differ by shape/edge, not only hue;
    charge-ready pulses as well as changing colour.
  - LMB and RMB can be rebound like the other actions (with the same
    swap-on-clash rule and the fixed pending-rebind behaviour).

## Gates

- Unit: the quality picker (fast machine keeps high; slow steps down to
  medium; very slow to low; never below low; no run when settings exist).
- e2e: a first launch records a quality and the "automatic" note; a second
  launch keeps it and does not resample.
- e2e: shake off -> the camera does not move on a hit; flashes off -> no
  vignette element shown on a hit.
- Unit/e2e: rebinding attack to another button attacks with it.
- Each proven to fail with its fix reverted.
