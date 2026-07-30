# M2 spec: helpdesk apps over the graph

Contract for builder. Deviations need overseer sign-off. Context: `DESIGN_POC.md` sections 4-7, `BUILD_PLAN.md` M2. M0 engine + M1 shell exist; M1 fix-wave findings (see git log) must stay fixed - do not regress their gates.

## 0. Engine extensions (the ONLY src/engine/ changes allowed, spec'd here)

1. `ActionContext` gains `clock: { now(): number }` (read-only). Existing fixture actions updated; demo-world stops passing tick as a param.
2. `EntityGraph.allNodes(): Node[]` (id-sorted clones).
3. `ActionRegistry` validation stops cloning the graph: introduce `ReadOnlyGraphView` in `src/engine/graph-view.ts` (move/adapt the shell's read-only view; shell imports it from engine - one implementation, no duplicate). `validate(ctx)` receives the view type; `apply(ctx)` receives the real graph. Type-level: `ActionDef.validate(ctx: ValidationContext)` where the graph field is the view. Unit tests: validator cannot mutate (type + runtime), behavior identical to M0 clone semantics, determinism suite still green with UNCHANGED golden hash (validation must not consume rng or mutate).

## 1. Helpdesk action registry (tier 1, `src/world/actions/`)

Real actions, each `{ id, tier: 1, validate, apply }`, all graph-only, deterministic:
`account.unlock`, `account.reset_password` (sets `password_reset_at` tick, clears `locked`), `account.add_to_group`, `account.remove_from_group`, `service.restart` (wedged|stopped -> running), `machine.set_display_rotation`, `machine.set_resolution`, `machine.reboot` (clears `pending_updates`, sets `uptime_since`), `device.power_cycle` (powered false->true, clears `wedged`), `device.replace_battery`, `mail_rule.delete`, `share.grant_access` (adds has_access edge), `printer.clear_queue` (device field `queue_len` -> 0), `ticket.set_waiting` / `ticket.clear_waiting` (wraps TicketEngine.setWaiting - the CYA mechanic hook), `ticket.escalate` (sets ticket field `escalated`, resolves via assertion where a ticket's resolved_when accepts escalation - used by hardware tickets).
Every action: validate rejects wrong node kind / missing prerequisites with a HUMAN reason string (shown in UI); unit test per action (accept + at least one reject).

## 2. Apps (all plug into M1 manifest, tier_required: 1)

Build order: Tickets -> User Directory -> Chat -> Mail -> Remote Assist -> Cmd -> KB. Remote Assist is the risk - do not leave it last.

- **Tickets** (`tickets` app): queue list (title, reporter, SLA countdown in sim-ticks rendered as clock time, state badge incl. waiting/breached), detail view (flavor body, reporter link -> opens Chat, KB link -> opens KB article, waiting toggle button wired to ticket.set_waiting/clear). NO direct resolve button - resolution happens by fixing the world (engine auto-resolve), the app just reflects it (toast on ticket:resolved already exists). Escalate button where the ticket def allows it.
- **User Directory** ("Active Dictionary"): searchable account list, account detail (fields, group memberships via edges, owning person), action buttons: unlock, reset password, add/remove group (group picker). Refusal reasons rendered inline.
- **Chat**: conversation per person node. Dialogue = DATA (`src/world/dialogue/`): tree of `{ id, npc_line, options: [{ label, next?, effect?: { action, target, params } | { reveal: string } }] }`. Effects dispatch registered actions only. `reveal` appends a clue line to the ticket detail (stored as ticket field). Reporter of each pilot ticket has a tree that (a) comedy-voices the problem, (b) can reveal the hidden cause, (c) reacts after resolution (assert via ticket state). Vague-ticket support: asking the right question = the option carrying the reveal.
- **Mail**: read-only inbox rendered from data (`src/world/mail/`), sim-time stamps; used for flavor + maintenance-announcement pattern later. One onboarding-flavor thread + one boss nag now.
- **Remote Assist**: THE signature. Opens on a machine node; renders that machine's screen as a restricted desktop INSIDE the window (reuse M1 shell primitives - theme + window chrome at reduced scale is fine, no nested WM needed: the remote screen is a static-layout parody desktop with the target machine's state visible: rotation applied as CSS transform on the remote viewport (the gag must be visible), resolution text, taskbar showing running services, a fake system tray). Interactions: buttons/menus on the remote screen dispatch the same registered actions (e.g. right-click printer -> restart spooler equivalent). Every pilot ticket solvable via Remote Assist path where specified.
- **Cmd**: terminal window, prompt `C:\SUPPORT>`, curated commands (registry-backed, tier-gated): `help`, `ping <host>` (reachable = connected_to edges), `users <account>` (fields + groups), `unlock <account>`, `resetpw <account>`, `services <machine>`, `restart <service>` (dispatches service.restart), `rotate <machine> <0|90|180|270>`, `queue <printer>` + `clearqueue <printer>`, `ver` (gag). Output parody-honest, errors = validate refusal reasons. Command parse = pure function, unit-tested; unknown command gag suggestions.
- **KB Wiki**: articles from data (`src/world/kb/`), one per pilot-ticket cause + 2 evergreen gags; honest explanations (learner path), linked from ticket detail via kb_ref.

## 3. Pilot tickets (DATA, `src/world/tickets/`)

Three, exercising the archetype field:
1. `rotated-screen` (hidden_cause): reporter insists "hacked"; cause `machine.display_rotation=90`. Paths: Remote Assist (visible rotated content, fix via remote) OR Cmd `rotate`. Chat reveal available.
2. `locked-account` (read_the_screen): vacation lockout. Paths: User Directory unlock OR Cmd `unlock`. SLA generous; comedy in chat.
3. `wedged-spooler` (hidden_cause): "printer is haunted", queue 47, spooler wedged. Paths: Cmd `restart` OR Remote Assist services panel. Requires clear_queue too (two-step: assertion = spooler running AND queue empty).
Ticket JSON validated by the M0 validator at load; a load-time dev check asserts every shipped ticket resolvable (solvability harness lands fully in M4 - here a hand-written per-ticket unit test drives graph-level action sequences for EACH advertised path and asserts resolution).

## 4. World

`src/world/company.ts`: one company seed replacing demo-world (keep demo apps working): ~6 persons, accounts, 3 machines, printer + monitor devices, spooler + vpn services, 2 groups, 1 share, edges. Seeded deterministic. Boss person node exists (used by Mail nag; boss MECHANICS are M3 - no meters this milestone).

## 5. Gates (M2 exit)

- All M0/M1 gates green (incl. unchanged determinism golden hash).
- Unit: every action accept+reject; command parser; dialogue-effect dispatcher refuses unregistered actions.
- Per-ticket path tests (section 3) at graph level.
- E2e journeys (authored, PLAYWRIGHT_BASE_URL, run on staging box by overseer): for EACH pilot ticket, full player journey queue-click -> diagnose -> fix via EACH advertised path -> ticket auto-resolves -> toast + queue updates. Plus: chat reveal journey (vague ticket -> right question -> clue appears); refusal path (wrong action -> human reason visible); Remote Assist rotation gag visibly applied (CSS transform assertion).
- No regression to M1 e2e suite.

## 6. Bars

M1 bars apply (strict TS, tokens-only styling, no new runtime deps, no emoji, comedy voice English, commit-per-slice, DO NOT push). App quality: these are the product now, not demos - QoL bar per house rules (no dead ends, refusals always explained, everything reachable by mouse).
