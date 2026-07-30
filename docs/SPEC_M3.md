# M3 spec: pressure layer - day loop, boss, meters, slack, consumables

DRAFT (overseer). Contract for builder once M2 closes. Context: `DESIGN_POC.md` sections 3, 7; `BUILD_PLAN.md` M3. Inherits parked M2 items: window-local app state persistence, `device.power_cycle` content, two window-renderer nits (throwing mount orphans element; drag gesture outlives closed window).

## 1. Day loop

- Shift 09:00-17:00 sim time; `main.ts` day driver replaces the free-running clock: day states `morning_brief -> shift -> day_end`, all engine-side data (`src/world/day.ts`), shell renders them (brief = one comedy mail + queue preview; day_end = scorecard window: tickets closed, breaches, suspicion events, stress carried, salary line with caricature deductions, farm-fund progress bar).
- Ticket drip: scheduler data per day (spawn tick -> ticket def), seeded; lunch window 12:00-12:30 flagged (boss never patrols, stress drain doubled - the safe-slack tutorial window).
- Pause + speed toggle UI (taskbar): pause stops clock advance, speed x1/x2/x4 scales real-time->tick conversion ONLY (SimClock stays integer).
- Save/load: versioned localStorage snapshot at day boundaries + manual save; snapshot = graph serialization + dispatch-log hash + player stats + day state. Load-time version check with migration stub. Window-local app state (chat transcripts, mail read, kb selection) moves into a shell-owned store that survives window close AND is included in the save.

## 2. Meters (engine-side data, shell renders)

- `stress` 0-100: +per open ticket per interval, +breach event, +boss ping; -slack apps (per-app rate), -lunch, floor 0. At >80: fumble mode - cursor sway CSS on desktop + Cmd typo gag (visual only, actions still dispatch correctly; comedic not punishing - copy makes that explicit).
- `suspicion` 0-100: +while any slack:true window is OPEN (not minimized), rate per app; -clean work time. Caught event (see boss) resets to a floor and costs reputation.
- `reputation`: starts 50; -breach, -caught, +resolve (archetype-weighted); drives day-end review line. Fail state preview: reputation < threshold at Friday review = fired = retry-week screen (probation arc data lands M4; M3 ships the mechanism behind a single test day).
- All meter math = pure functions in `src/world/meters.ts`, unit-tested exhaustively; meter state lives in the graph (player node fields) so determinism/replay hold.

## 3. Boss system

- Boss patrol: seeded schedule per day (data), telegraph -> arrival -> departure. Telegraph = footsteps audio cue placeholder (visual: taskbar tremor + door reflection flash; no audio assets this milestone) giving a reaction window (tunable ticks).
- On arrival: if any slack:true window OPEN (not minimized) -> caught scene (comedy dialog window, one per slack app, data-driven), suspicion reset to floor, reputation hit. Boss-key during telegraph = the core skill.
- Boss pings: occasional chat nag (existing boss thread) adding stress; "urgent" trash ticket archetype wired here (priority trap from research).

## 4. Slack apps + consumables

- Browser app (slack:true): 2 fake sites (forum thread gag, cat pictures) - static parody pages, stress drain while focused.
- Minesweeper-like stays (already slack:true). Bubble Break keeps role.
- Desk consumables (desktop overlay, not windows): energy drink - buff (action speed feel: reduced fumble + higher stress ceiling for N ticks) then crash (stress spike + slow) with stacking tolerance; beer - LOCKED (probation), visible with comedy tooltip; unlock event = M4 Friday scene. Consumable state in graph; effects pure functions.
- Empties: energy-drink cans accumulate visibly on desk overlay; boss arrival with >N cans = minor suspicion bump (tidy-desk action clears).

## 5. Gates (M3 exit)

- Full-day journey e2e ON BUILT ARTIFACT: morning brief -> tickets drip in -> resolve some -> slack during lunch -> telegraph -> boss-key -> survive -> get caught once deliberately -> day-end scorecard reflects ALL of it -> save -> reload -> state identical (graph hash + meters + app state).
- Determinism: same seed + scripted day = identical end-of-day hash; golden hash for the test day.
- Meter unit suite: every transition, floors/ceilings, buff/crash/tolerance stacking.
- Caught-scene reachability: every slack app has a scene; test iterates manifest slack apps.
- All M0-M2 gates green (M0 golden hash unchanged).

## 6. Bars

Standing bars (strict TS, no new runtime deps, tokens-only, comedy voice EN, no emoji, git hygiene rules). Meters/boss/day = engine-data + pure functions first, DOM last. No dead ends: caught scene always dismissible, day_end always reachable, pause always available.
