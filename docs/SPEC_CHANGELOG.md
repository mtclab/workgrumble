# What changed (spec, Helldesk 0.2.0 slice 4)

Status: decided with the owner.

## Why

Players (and the owner's friends) cannot see what changed between builds.
Helldesk has no version number and no release notes. The office sim has
the machinery: `src/world/releases.ts` (`ReleaseNote`, `compareVersions`,
`releasesNewestFirst`, `releasesSince`), `src/shell/updates.ts`
(`VersionSlot`, `updateOnBoot`), `src/shell/apps/updates.ts` (rendering).

## Changes

- **Version line**: Helldesk gets its own version, starting at **0.2.0**,
  as a constant in `src/crawler/` (not `package.json`, which versions the
  office sim). Shown small on the title screen and in Help.
- **Notes**: `src/crawler/releases.ts`, reusing the `ReleaseNote` shape and
  `compareVersions` (import, do not copy). Written in the game's voice,
  like the office sim's notes: a one-line summary and a few lines each.
  - **0.2.0** covers: combat you can read (wind-ups, hit direction, weapon
    feel), the induction day, menus that answer the keyboard, SUO (the
    Löyly vision), the performance pass, the stuck-walking rebind fix,
    automatic graphics quality on first launch, the loading indicator,
    accessibility options. (Keep entries factual; the overseer checks them
    against what shipped.)
  - **0.1.0** summarises the first playtest build.
- **What's new**: the first time a player opens a newer version than they
  last saw, the title screen shows a small "What's new" panel with the
  notes since then; dismiss with a button, Enter or Esc. Nothing on a very
  first visit. The last-seen version lives in its own localStorage key
  (e.g. `workgrumble-helldesk-seen-version`), written when the panel is
  shown, following `updateOnBoot`'s rules.
- **Update History**: an OS app listing every release, newest first.

## Gates

- Unit: what counts as new (first visit -> nothing; same version ->
  nothing; older seen -> the notes since, newest first; malformed seen ->
  treated as oldest).
- Unit: every release has a valid version, a date, a summary, at least one
  line; versions strictly descending; the newest equals the version
  constant.
- e2e: a seeded older seen-version shows the panel once; a reload does
  not show it again; Update History lists 0.2.0.
