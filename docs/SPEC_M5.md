# M5 spec: polish + full-product proof (final POC milestone)

Contract. Context: `BUILD_PLAN.md` M5, all prior specs. Standing bars + git rules. Goldens: M0 immutable; scripted-day/week move only with justified dedicated commits.

## Lane A: debt + perf + QoL fixes

1. **Tickets app repaints**: rows rebuilt on every tick/world change (SLA countdowns). In-place text updates for countdown cells; row identity stable (no rebuild unless membership/state changes). Same discipline sweep over Directory/Events/Remote lists.
2. **Window-renderer nits (parked since M2)**: a throwing `mount()` leaves an orphan window element (clean up + refusal toast); a drag gesture outlives a window closed mid-drag (abort on close).
3. **Engine tidy**: SimClock's dead `paused`/`speed` fields (shell owns both since M3) - remove from core + save shape (ENGINE_VERSION bump + version-refusal test update).
4. **QoL walk items** (fix what's cheap, list what's not): every disabled control has a title reason (sweep for missing); ESC/keyboard reachability of caught/review/beer/weekend scenes; window cascade with 9+ windows open; Start-menu ordering (apps by use, not registration order); toast stack overflow behavior at day-end pileups; first-run experience (does Day 1 teach the boss-key BEFORE the first telegraph? if not, add one brief line to the Monday morning mail).
5. **Balance from play**: drive the scripted week at several skill levels (all-tickets, half-tickets, tickets-plus-heavy-slack); assert the review threshold separates them sensibly; tune drip/meter DATA only if a profile lands wrong - goldens move with justification.

## Lane B: play-every-function total walk

One e2e spec (may be long; own timeout budget; runs in the two-step gate protocol) that drives EVERY user-reachable function on the built artifact across a full week: every app opened, every action variant exercised at least once (every Cmd command incl. error paths, every Directory action, every Remote control, every consumable state, every scene, every triage cell reachable in content, save/load/retry, both review endings across two runs). Backed by a MANIFEST: a data list of every user-reachable function; the spec iterates it; adding an app/action without extending the manifest fails a completeness test (the play-every-function gate per house testing rules - generalized from the golden-journey seed).

## Close-out (overseer + codex)

- Codex adversarial re-walk of the WHOLE repo (correctness + workmanship + dead-code hunt, ranked; final POC verdict).
- Overseer visual walk: full screenshot set of every surface, eyeballed against the design bars (9x caricature, comedy voice, no dead ends).
- BUILD_PLAN updated: POC exit checklist ticked or itemized.
