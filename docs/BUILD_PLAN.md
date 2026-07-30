# POC build plan (helpdesk slice, fully built)

Status: DRAFT 2026-07-30. Design: `DESIGN_POC.md`. Every milestone ends GREEN on its gates before next starts (no corner cutting; gates are blocking).

Model lanes per house split: Fable = specs/design/review/gate decisions; opus builders + codex = implementation slices with tight specs; haiku = mechanical (fixture gen, batch file ops).

## M0 - Skeleton + engine core (foundation, no dead ends start here)

- Repo scaffold: TS + Vite, strict tsconfig, vitest, Playwright, ESLint. PRIVATE, no workflows; local gate script `npm run gate` (typecheck + lint + unit + journey).
- Entity graph: node/edge store, typed node kinds, mutation API, event bus (mutation -> listeners).
- Action registry: `action(actor, target, params)` contract, tier gating, dispatch log.
- Assertion evaluator: declarative expression tree (`eq/and/or/exists/not`) over graph.
- Ticket engine: spawn (apply setup mutations), auto-resolve check on every mutation, SLA clock.
- Deterministic sim clock (pause + speed toggle) + seeded RNG service.
- **Gate**: unit suite on graph/actions/assertions; determinism gate (same seed + scripted actions = identical final graph hash).

## M1 - Fake OS shell

- Boot/login screens, desktop, taskbar, start menu, notifications, draggable/resizable/z-ordered windows.
- App plugin contract `{ id, icon, tier_required, mount(window, gameApi) }` + manifest loader.
- Theme tokens (9x caricature) - one theme file, Linux skin seam later.
- Boss-key (instant hide all slack windows).
- **Gate**: Playwright - boot to desktop, open/move/close windows, two apps coexist, boss-key journey.

## M2 - Helpdesk apps over the graph

Order: Tickets -> User Directory -> Chat -> Mail -> Remote Assist -> Cmd -> KB Wiki.
- Remote Assist = the risky one, build early inside this block: render target machine's fake desktop (same shell engine, restricted app set) in a window, actions dispatched as that machine's context.
- Cmd: ~12 registry-backed commands with parody-honest output.
- **Gate**: 3 pilot tickets (rotated screen, locked account, spooler) solvable end-to-end via Playwright through REAL UI, each with 2 paths where designed (GUI + cmd).

## M3 - Pressure layer: day loop + boss + consumables

- Shift clock, ticket drip scheduler, lunch window, day-end scorecard, salary + farm counter.
- Stress + suspicion meters, fumble effects (>80), boss event system (footstep cue -> reaction window -> caught scene).
- Slack apps (Browser slack sites, Minesweeper-like) + consumables: energy drink buff/crash/tolerance; beer LOCKED (probation), unlock scene end of week, hide-the-empties action behind flag.
- **Gate**: full-day journey (tickets + slack + caught-once + survive), scripted; determinism holds across day.

## M4 - Content + meta arc

- 20 tickets as data (schema-validated), KB articles, dialogue trees, boss/user voice pass (English office comedy).
- Mon-Fri arc: difficulty ramp, Friday review (fail = fired = retry week), Friday beer scene.
- Save/load: versioned localStorage schema + migration stub; pause persistence.
- **Gates**: solvability property (every shipped ticket machine-proven reachable from setup via registered actions); journey gate EVERY ticket through built artifact; save/load round-trip mid-day.

## M5 - Polish + full-product proof

- QoL pass per house bar: flow, no dead-end UI states, redirects preserve intent, load fast.
- Play-every-function run: scripted end-to-end that drives every app, every action, every ticket, every consumable, caught+clean days, fired+passed reviews - on the built artifact.
- Adversarial review wave (code logic + workmanship) + bug->gate conversion, proven by revert.
- Balance pass: SLA timings, meter rates, energy-drink numbers - from playing, not spreadsheets.
- **Exit**: demo playable start-to-farm-counter, all gates green, review findings closed or ticketed.

## Sizing (honest guess)

M0-M1 ~2-3 focused sessions; M2 biggest block ~3-4; M3 ~2; M4 ~2-3 (content parallelizable across builder lanes); M5 ~2. POC total ~11-14 working sessions. Extension cost after POC (sysadmin tier) = new node kinds + actions + apps + content ONLY if seams hold - M0/M1 correctness is what we're really buying.

## Post-POC parking lot

Sysadmin tier (ssh app, Linux remote boxes, dns/backup/service tickets), employer switching, win-goal select, devops/terraform tier (declared-vs-actual diff), Linux desktop skin, audio pass, mobile, cloud saves, naming/branding pass (branding repo), public deploy pipeline (staging box), monetization decision.
