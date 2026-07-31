# it-career-sim (working title)

Parody IT-career simulator in a fake-OS UI, in the browser. Start as a helpdesk drone, solve absurd-but-real tickets under SLA pressure, slack off without getting caught, and save up to quit and buy that farm.

- Design: `docs/DESIGN_POC.md`
- Build plan: `docs/BUILD_PLAN.md`
- Market case: `docs/spikes/market.md`

Status: design phase. POC scope = fully built helpdesk slice (probation week demo).

PRIVATE repo - no GitHub Actions workflows by policy; all gates run locally.

## Milestone gate

A milestone is green when BOTH halves of the gate are, and they are two
commands because they run in two places.

**1. Locally, on the machine the code is written on:**

```
npm run gate
```

Rust tests, clippy with warnings denied, the wasm build, the TypeScript
typecheck, the linter and the whole Vitest suite - including the headless
whole-day determinism run against the golden day in
`src/shell/scripted-day.test.ts`. Everything in it is offline and browserless.

**2. Against a served build, on the staging box:**

```
npm run build
# serve dist/ on the box, then, pointed at it:
PLAYWRIGHT_BASE_URL=http://<box>:<port> npm run gate:e2e
```

The journey suite in `e2e/` drives the SHIPPED artifact through a real browser
as a player: the day loop, the boss key, the caught scene, triage, the handoff
form, the scorecard, and a save/reload that has to come back to the same world.
It is deliberately NOT wired into `npm run gate` - this workspace does not run
browsers, and a gate that silently skips the half nobody can run here is worse
than a gate with two named halves. `gate:e2e` refuses to start without
`PLAYWRIGHT_BASE_URL`, so it cannot pass by having tested nothing.

Both halves are required before a milestone is called done. Neither substitutes
for the other: the local half proves the world is deterministic and the rules
hold, and the served half proves a player can reach any of it.
