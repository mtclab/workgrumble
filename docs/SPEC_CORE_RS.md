# core-rs spec: Rust/WASM engine port

Owner decision 2026-07-31: game will grow; engine moves to Rust BEFORE M3 so no later rewrite. Forge-family pattern (Rust core + TS view). Shell/apps/world CONTENT stay TS; the ENGINE (graph, schema, actions dispatch, assertions, tickets, clock, rng, hash) moves to Rust compiled to WASM.

## Shape

- `core-rs/` cargo crate at repo root; `wasm-bindgen` + `wasm-pack build --target web` -> `core-rs/pkg/` consumed by Vite (file import, no npm publish). No external crate deps beyond wasm-bindgen (+ serde/serde_json allowed - the boundary is JSON).
- Boundary = ONE exported `Engine` class (wasm-bindgen):
  - `new Engine(seed: u32)`
  - `apply_setup(json)` - graph construction ops (node/edge/field), replaces direct TS graph mutation for world seeding
  - `register_actions(json)` - action DEFINITIONS move to data: each world action becomes `{ id, tier, validate: rule-expr, apply: op-list }` in a small declarative op language (set_field, add_edge, remove_edge, clear_field, guard exprs reusing the assertion tree + a few predicates: field_eq, has_edge, kind_is, param_int_in, field_missing). The 18 world actions MUST be expressible; if one genuinely cannot, expose it as a named built-in in Rust and justify in notes.
  - `dispatch(json {action, actor, target, params}) -> json {ok, reason?, events[]}`
  - `spawn_ticket(def json) -> events[]`, `set_tier(n)`, `advance(ticks) -> events[]`, `now()`, `snapshot_hash() -> string`, `query(json) -> json` (get_node/get_field/nodes_of_kind/neighbors/all_nodes/evaluate_expr), `dispatch_log() -> json`, `serialize() / restore(json)` (save seam for M3).
- Events returned, never callbacks (determinism + simple boundary): every mutation/ticket event in order.
- TS side: `src/engine-api/` defines `EngineApi` interface + `WasmEngine` adapter wrapping pkg. Existing TS engine gets an adapter too (`TsEngine`) ONLY for the parity harness; shell + world switch to `EngineApi` everywhere (this is the real refactor - read-only view, dispatch, ticket policy, onWorldChange derive from adapter events).

## Parity gates (blocking, in order)

1. **Golden-hash parity**: the M0 determinism fixture (scenario + scripted dispatch log) run through core-rs produces EXACTLY `4a07e554b7acbd22`. Same FNV-1a 64 over the same stable serialization (nodes sorted by id, fields sorted by key, edges sorted; identical field-value rendering incl. bool/int/float/null formatting). Mulberry32 + fork(label) bit-identical (same FNV-32 label hash, same mix).
2. **Dual-engine parity harness** (vitest): every existing engine-level scenario (determinism, replay, ticket lifecycle incl. waiting/breach/mark_asked, tier gating, selector ambiguity, orphan-ticket refusal, all 18 world actions accept+reject paths, all pilot-ticket path tests) executed against BOTH TsEngine and WasmEngine - identical hashes, event streams, refusal strings.
3. **Full suite**: all 236 unit + 44 e2e green with the shell running ON WASM (e2e on staging box by overseer; wasm asset served same-origin - hygiene gate must still pass).
4. After 1-3 green: TS engine internals DELETED (src/engine/* except types re-exported from the adapter layer); parity harness reduces to the wasm-only suite; golden hash stays as the permanent gate.

## Rust quality bars

- `cargo test` native suite mirroring the engine unit tests (graph/actions/assertions/tickets/rng/hash) - run in `npm run gate` via a `gate:core` script (cargo test + wasm-pack build). No `unsafe`. `cargo clippy -D warnings`. rustfmt default.
- Deterministic: no HashMap iteration reaching output order anywhere (BTreeMap or explicit sort), no SystemTime/thread_rng.
- Error handling: boundary never panics on bad input - every JSON parse/validation failure returns a typed refusal. A panic across the wasm boundary = P0.

## Process

- Builder works on branch main, commits per slice (crate skeleton -> graph+hash -> rng/clock -> assertions -> actions+op-language -> tickets -> boundary -> TS adapter -> world-action migration -> parity green -> TS engine removal). DO NOT push.
- Toolchain: verify rustup/cargo/wasm-pack present; install wasm-pack locally if missing (dev tooling only).
- Standing git rules apply (no history rewrites, explicit-path staging, stop-and-report on foreign files).
