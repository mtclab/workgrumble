# M4 spec: content + arc - the probation week

Contract for builders, three lanes (A: week mechanics, B: depth apps, C: ticket content). Context: `DESIGN_POC.md` sections 3-8, `SPEC_M3.md`, `docs/research/real-systems.md` + `modern-stack.md` (binding reference for depth items), `docs/research/ticket-material.md` (voice/archetypes). All standing bars + git rules apply. Golden hashes: M0 `4a07e554b7acbd22` immutable; the M3 scripted-day golden WILL move with these changes - update once per lane with a justified diff, then binding again.

## LANE A: week arc + SLA truth

1. **Business-hours SLA** (fixes the carried M3 flag: inherited 08:00 tickets spawn at their response deadline). SLA clocks (response + resolution) advance ONLY during `shift` state ticks. Implementation may reuse the waiting-style deadline-extension mechanism keyed to `day_state != 'shift'`, driven deterministically; replay-safe; both clocks in the scripted-day golden. Consequence: pre-shift arrivals owe their response from 09:00; overnight/day-boundary carryover stops eating SLA.
2. **Week structure**: Mon-Fri probation arc as data (`src/world/week.ts`): per-day drip scripts (spawn tick -> ticket id), per-day boss patrol seeds, difficulty ramp (Mon light -> Thu heavy -> Fri review day). Day scripts land in lane C's content; lane A ships the machinery + the existing tickets redistributed sensibly (morning pile SHRINKS - at most 2 inherited tickets per morning, rest drip).
3. **Friday review**: at Friday 15:00 a review meeting event (dialog window, data-driven): reputation >= threshold = passed (probation ends -> beer unlock scene at 17:00 day_end, farm-fund bonus, "week 2 continues" stub screen); below threshold = FIRED scene -> retry-week screen (restart Monday with seed variation, farm fund kept - the joke is the fund survives every firing). Both outcomes reachable, both journeys gated.
4. **Beer scene + unlock**: post-review Friday, beer consumable unlocks (the M3 locked tooltip pays off): first-use scene, beer = big stress drain + high suspicion + empties (mechanics exist); Saturday does not exist - clocking off Friday = week end screen w/ week scorecard (aggregates the five days).
5. **Week determinism**: scripted-WEEK test (drive all five days headless at the vitest level) -> committed golden (hash + week scorecard numbers). Bounded runtime (target < 30s).
6. **Retry-week**: fired -> retry keeps farm fund + KB read state, resets world/tickets/meters; seed offset so the week differs slightly (drip jitter reseeded).

## LANE B: depth apps (research-mandated, helpdesk-tier)

1. **Event Viewer app** (`events` app, slack:false; research wave-1's top depth-per-effort find): per-machine chronological log rendered as time/level/source/message rows. Source = a bounded per-machine `event_log` field (same pattern as touch_log: driver appends at dispatch/world-event time - service state changes, reboots, lockouts, breaches touching that machine; latest ~30). Filter by level; comedy-honest messages ("7031: The Print Spooler service terminated unexpectedly. It has done this 4 time(s). It will do it again."). The recurring-arc ticket class (lane C's vacuum ticket) must be SOLVABLE by reading this log (timestamps correlate).
2. **Cmd expansion**: `ipconfig` (+`/all`, `/flushdns` gag), `whoami`, `systeminfo`, `tracert` (hop gag through the graph edges), `nslookup` - all graph reads, parody-honest output, KB cross-refs. `net user <account>` as alias for `users`.
3. **AD lockout story** (Directory + schema): accounts gain `bad_pw_count`, `locked_since`, `last_logon`, `pw_must_change`, and `disabled` as a DISTINCT state from locked and from expired (three different things, three different fixes - render the story, refuse the wrong fix with the right explanation). Reset password sets `pw_must_change`; unlock does not fix expired; etc. Existing tickets updated where touched.
4. **KCS article shape**: KB articles restructured to Issue / Environment / Resolution / Cause sections + article states (draft/published gag) + "link article to ticket" action (writes kb_ref onto the ticket, counts as a worknote touch - the KCS "link is the solve" practice).
5. **Parent/child incidents**: ticket schema gains optional `parent` link; Tickets app: select N tickets sharing a cause -> "link to parent" -> resolving the parent auto-resolves children with a copied customer-visible comment (via actions; engine assertion pattern unchanged - children's resolved_when include `or(parent resolved marker)` written by the link action). Powers lane C's flood day.

## LANE C: ticket content + solvability

1. **Roster to ~20 tickets** across the week, each = data + KB (KCS shape) + dialogue hooks + per-path graph tests. New set (voice: English office comedy; research-grounded):
   - `mfa-reregister` (modern flagship): new phone, authenticator dead. TWO traps: wrong-flavor (session revoke does nothing - refusal explains), and the VERIFY-IDENTITY beat - chat offers a shortcut ("just do it, I am in a hurry"); skipping verification = ticket resolves BUT a day later a security-incident consequence mail + reputation hit lands (social-engineering truth, teaches without preaching).
   - `sendas-missing` chain: shared-mailbox access granted (Full Access) but "cannot send" follow-up spawns - the chain IS the lesson; both tickets data-linked.
   - `license-exhausted`: new hire cannot activate; cause = offboarded user still holding a seat (Directory: disabled account with license field) - ties to the AD story.
   - `stale-device-relock`: account relocks minutes after unlock; cause = old tablet with stored password hammering auth (bad_pw_count climbs in Event Viewer!); fix = disable the device node or clear its stored credential.
   - `vacuum-friday` (recurring_arc, spans Tue+Thu): PRINT-01 offline at the same evening tick; Event Viewer correlation reveals the cleaner; fix = sticky-note action (facilities chat). The research-lore classic.
   - `vpn-cert-flood` (Thursday event): cert expiry -> flood of identical tickets + parent/child bulk-close + maintenance-mail announcement; L1 job = comms + linking, not fixing.
   - `phishing-report`: user reports suspicious mail; correct = KB-guided verify + praise reply (customer-visible), wrong = clicking the gaudy link in the preview (immediate comedy consequence + stress).
   - `dm-bypass` (event, not ticket): a user DMs asking to skip the queue; helping = gratitude + zero ticket credit + boss nag if seen; refusing politely = they file properly. Both paths legitimate; scorecard shows the difference.
   - `coverup` ticket: "it did that by itself" - touch history/Event Viewer contradicts; fixing silently vs calling it out = dialogue tone choice, same reward.
   - Plus: 2-3 read_the_screen fillers, 1 deadline_absurdity ("known since spring, needed by 15:00"), maintenance-blindness mini-flood (Wednesday), and the existing five redistributed.
2. **Week scripts**: fill lane A's per-day drip tables; difficulty ramp; every day beatable to review-pass by competent play (hand-verify via scripted week).
3. **Solvability harness** (BLOCKING, the M4 signature gate): load-time + test harness proving EVERY shipped ticket resolvable from its spawn state via EACH advertised path using only registered actions (graph-level execution, not UI); plus assertion sanity (no ticket resolvable at spawn unless archetype says so). CI-less: part of `npm run gate`.
4. **Journeys**: one e2e per NEW ticket (at least one path each), the flood day, the recurring arc (two-day), review PASS and FIRED journeys, beer scene, retry-week. Week-level e2e kept lean (fake timers + speed).

## Cross-cutting

- Employer-pack seam untouched but respected: week scripts/content live under `src/world/` as data keyed by the company pack.
- Scorecard/week-scorecard gain nothing hardcoded: all numbers traceable to graph/ledger.
- Content truth: every trope grounded per research docs; parody voice, honest mechanics; no real company names.
- Suggested lane order A -> B -> C (C depends on both). Each lane: full gate green + overseer box e2e before next.
