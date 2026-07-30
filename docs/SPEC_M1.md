# M1 spec: fake OS shell

Contract for builder. Deviations need overseer sign-off. Context: `DESIGN_POC.md` sections 4+6; M0 engine is on main - build ON it, do not modify `src/engine/` (any engine gap = note it, overseer decides).

## Scope

Parody 9x-era desktop OS shell in the browser, DOM-only (no canvas/WebGL), fullscreen. View layer over the M0 engine: the shell NEVER mutates the graph directly - user intents go through `ActionRegistry.dispatch` (M1 has no real actions yet; demo apps may register fixture actions).

## Deliverables

### 1. Shell flow
Boot screen (fake POST/loading gag, skippable with any key) -> login screen (single fixture user, any password, comedy hint) -> desktop. All three = states of one state machine, unit-testable without DOM.

### 2. Desktop
- Wallpaper (theme token), desktop icons (double-click opens app), taskbar: start button, one button per open window (click = focus/minimize toggle), clock area reading `SimClock` ticks via a display formatter (sim time, not wall time).
- Start menu: lists installed apps from manifest, ESC or outside-click closes.
- Notifications: `notify(title, body)` -> toast (auto-dismiss + manual close) + unread badge on taskbar. Exposed via gameApi.

### 3. Window manager
Pure state model (`src/shell/wm.ts`, no DOM imports) + thin DOM renderer:
- open/close/focus (z-order), drag by titlebar, resize by edge/corner handles, minimize to taskbar, maximize/restore.
- Constraints: windows stay within viewport (titlebar always reachable), min sizes, focused window on top, focus follows open and click.
- Keyboard: ESC closes menus/dialogs (not apps); boss-key (default `~`, single const) instantly minimizes ALL windows whose app is flagged `slack: true` - one keypress, no animation delay.
- State model unit-tested exhaustively (open/close/focus/z-order/minimize/bounds-clamp invariants).

### 4. App plugin contract
```
AppDef = {
  id: string, title: string, icon: string /* inline SVG id, drawn in-repo */,
  tier_required: number, slack: boolean,
  mount(host: HTMLElement, api: GameApi): AppInstance
}
AppInstance = { unmount(): void }
GameApi = { graph (read-only view), dispatch, clock: { now }, notify, openApp(id) }
```
- Manifest = ordered `AppDef[]`; desktop + start menu render from it, filtered by `tier_required <= currentTier`.
- Graph read-only view: `getNode/getField/nodesOfKind/neighbors` only - no mutation methods exposed to apps.
- Two demo apps proving the contract (kept, become dev tools): `about` (system info gag page, slack: false) and `bubbles` (trivial click-the-bubble toy, slack: true - boss-key test target). Demo quality bar still applies: they must feel like OS apps, not lorem placeholders.

### 5. Theme
- Single `src/shell/theme.css` with CSS custom properties (tokens): spacing, radii, bevel shadows, palette, type stack.
- Look: 9x caricature - beveled raised/sunken borders, titlebar gradient allowed as the ONE deliberate retro gag, chunky controls. System font stack (no downloads, no external anything).
- Palette: pick a desaturated retro base + ONE accent that is NOT generic-blue `#1458d4` family. No emoji as icons anywhere - small inline SVGs drawn in-repo.
- All colors/spacing through tokens; hardcoded values in components = review reject.

### 6. Wiring
`main.ts`: construct engine (graph, clock, rng, registry, bus, ticket engine), boot shell with manifest. Vite build stays static, `npm run build` works, zero network requests at runtime (check in e2e).

## Tests

- Unit (vitest): shell state machine; WM state model invariants; manifest loader + tier filtering; read-only graph view rejects mutation (type-level + runtime).
- Playwright journeys AUTHORED in `e2e/` reading `PLAYWRIGHT_BASE_URL` env (no hardcoded host; no webServer block - the server venue is the overseer's concern, staging box per house pipeline):
  1. boot -> skip -> login -> desktop visible.
  2. Open both demo apps via start menu AND desktop icon; drag one, resize one, assert positions/z-order; minimize + restore via taskbar.
  3. Boss-key: `bubbles` open + focused, press `~` -> bubbles minimized, `about` untouched, taskbar still shows bubbles.
  4. Notification toast appears via a demo-app trigger, badge increments, dismiss works.
  5. No console errors + no network requests beyond same-origin static assets across the whole run.
- `npm run gate` (typecheck+lint+unit) stays green and stays DOM-free-for-engine; add `test:e2e` script (playwright test, expects PLAYWRIGHT_BASE_URL).

## Bars

Same as M0 (strict TS, no any/ts-ignore, no new runtime deps, conventional commits, DO NOT push, do not touch docs/). QoL bar: no dead-end UI state - every state reachable from every other without reload; if you find one, fix or note it.
