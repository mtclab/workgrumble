# M0 spec: skeleton + engine core

Contract for builder. Deviations need overseer sign-off. Design context: `DESIGN_POC.md` sections 5-7; plan: `BUILD_PLAN.md` M0.

## Deliverables

1. Tooling scaffold (repo root, this repo, no subfolder):
   - Vite + TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`), ES2022 target.
   - vitest (unit), ESLint (typescript-eslint recommended-type-checked, no style bikeshed rules), Playwright installed + configured but NO tests yet (M1).
   - `npm run gate` = typecheck && lint && vitest run. Must exit non-zero on any failure.
   - `index.html` + `src/main.ts` placeholder ("engine loaded" console) so Vite builds. No UI work.
2. Engine modules under `src/engine/` (no DOM imports anywhere in engine - enforce via ESLint `no-restricted-imports`/`no-restricted-globals` on `src/engine/**`):

### `events.ts`
Typed sync event bus. `on(type, fn): () => void` (returns unsubscribe), `emit(type, payload)`. No async, no wildcards.

### `rng.ts`
Seeded PRNG (mulberry32 acceptable). `createRng(seed: number): Rng` with `next(): number` [0,1), `int(min, max)`, `pick<T>(arr)`. `fork(label: string): Rng` - deterministic child stream derived from parent seed + label hash. No `Math.random` anywhere in src (ESLint-banned).

### `graph.ts`
`EntityGraph`. Data:
- `Node = { id: NodeId, kind: NodeKind, fields: Record<string, FieldValue> }`, `FieldValue = string | number | boolean | null`.
- `Edge = { from: NodeId, to: NodeId, kind: EdgeKind }` (directed; duplicates by (from,to,kind) forbidden).
- `NodeKind`/`EdgeKind` = string unions declared in `schema.ts` with POC kinds: nodes `person | account | machine | device | service | share | group | mail_rule | ticket`; edges `owns | member_of | connected_to | runs_on | has_access`. Field schemas per kind (typed interfaces + runtime validator for data-loaded content).

API (ONLY mutation path; every mutation emits `graph:mutated` with a discriminated-union payload):
`addNode`, `removeNode` (cascades its edges), `setField`, `addEdge`, `removeEdge`, `getNode`, `getField`, `nodesOfKind(kind)`, `neighbors(id, { edgeKind?, direction: 'out' | 'in' })`, `snapshotHash(): string`.

`snapshotHash` = stable serialization (nodes sorted by id, fields sorted by key, edges sorted) -> FNV-1a 64-bit hex. In `hash.ts`.

### `actions.ts`
`ActionRegistry`.
- `ActionDef = { id: string, tier: number, validate(ctx): string | null, apply(ctx): void }`, `ctx = { graph, rng, actor: NodeId, target: NodeId | null, params: Record<string, FieldValue> }`.
- `dispatch(id, actor, target, params)` -> `{ ok: true } | { ok: false, reason: string }`. Unknown action / tier above current / validate-fail => `ok: false`, graph untouched.
- Append-only dispatch log: `{ tick, id, actor, target, params, ok, reason? }`. Log is replay input for determinism gate.
- Registry holds current tier (`setTier`). No actions defined here beyond test fixtures - real actions land in M2.

### `assertions.ts`
JSON-serializable expression tree evaluated against graph:
```
Expr = { op: 'and' | 'or', exprs: Expr[] }
     | { op: 'not', expr: Expr }
     | { op: 'eq', selector: Selector, field: string, value: FieldValue }
     | { op: 'exists', kind: NodeKind, where?: FieldMatch[] }
     | { op: 'edge', from: Selector, to: Selector, kind: EdgeKind }
Selector = { id: NodeId } | { kind: NodeKind, where: FieldMatch[] }   // must resolve to exactly one node; zero/many => eval false for eq/edge
FieldMatch = { field: string, value: FieldValue }
```
`evaluate(graph, expr): boolean`. Total function - malformed selector never throws.

### `clock.ts`
`SimClock`: pure tick counter. `advance(ticks: number)` (integer), `now(): number`, `pause()/resume()`, `speed` multiplier applied by the CALLER when converting real time to ticks (clock itself stays integer-deterministic), `onTick(fn)`. No `Date`, no timers.

### `tickets.ts`
`TicketEngine(graph, clock, bus)`.
- `TicketDef = { id, archetype: 'hidden_cause' | 'read_the_screen' | 'deadline_absurdity' | 'recurring_arc' | 'flood', flavor: { title, body }, reporter: NodeId, setup: SetupMutation[], resolved_when: Expr, sla_ticks: number, reward: { reputation: number, money: number }, kb_ref: string }` + runtime validator (content is data; invalid defs rejected loudly).
- `SetupMutation` = serializable graph ops (`addNode/setField/addEdge/removeEdge`) applied on spawn.
- `spawn(def)`: applies setup, creates `ticket` node (fields: `state`, `spawned_at`, `sla_deadline`).
- States: `open -> resolved` (assertion true, checked on every `graph:mutated` AND on spawn - pre-solved setup must resolve immediately), `open -> breached` at deadline tick (breached tickets stay solvable; breach flag latches for scoring), `open <-> waiting_on_user` via explicit API (`setWaiting(id, true/false)`); while waiting, SLA deadline extends by ticks spent waiting.
- Emits `ticket:spawned | ticket:resolved | ticket:breached`.

## Tests (vitest, colocated `*.test.ts`)

Per-module units plus these MANDATORY suite-level tests:
1. **Determinism gate**: fixture scenario (~8 nodes) + scripted dispatch log (~15 actions incl. rng-consuming ones) + clock advances -> run twice fresh -> `snapshotHash` identical; hash also asserted against committed golden constant (update = conscious diff).
2. **Replay**: dispatch log captured from run A, replayed into fresh graph B => same hash.
3. **Ticket lifecycle**: spawn -> mutate wrong field (stays open) -> mutate right field (resolves exactly once) -> event emitted once. Breach: advance past deadline -> breached event, latches, then still resolvable. Waiting: deadline extends by exactly the waiting ticks.
4. **Pre-solved spawn** resolves immediately (guards bad content).
5. **Tier gating**: tier-2 action at tier 1 => `ok: false`, graph hash unchanged.
6. **Selector ambiguity**: eq over selector matching 2 nodes => false, no throw.

## Bars

- No `any` (incl. tests), no `@ts-ignore`/`@ts-expect-error`, no eslint-disable without inline justification comment.
- Engine has zero deps beyond dev tooling (no lodash/immer/etc.).
- Commit granularity: scaffold commit, then engine commit(s). Conventional messages. Do NOT push.
- `npm run gate` green at the end. Print final gate output.
