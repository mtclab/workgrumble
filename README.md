# Workgrumble

Parody IT-career simulator in a fake-OS UI, in the browser. Start as a helpdesk drone at Workgrumble Ltd, solve absurd-but-real tickets under SLA pressure, slack off without getting caught, and save up to quit and buy that farm.

(The game is named after its own fictional employer - you do not work at the game, you work at Workgrumble.)

## Helldesk (the dungeon crawler)

`crawler.html` is a second game on the same world: a first/third-person
Doom-meets-Elder-Scrolls crawler up the five floors of Workgrumble Ltd, where
the users throw real tickets at you, managers encumber you, office ladies heal
you, and the computers still run the fake OS - that is where you work your
queue, pick up tasks and requisition gear from Internal IT. `npm run dev` and
open `/crawler.html`. Design and code map: `docs/HELLDESK.md`.

- Design: `docs/DESIGN_POC.md`
- Build plan: `docs/BUILD_PLAN.md`
- Market case: `docs/spikes/market.md`

Status: POC complete, deploy milestone built. Tester build v0.1.

PRIVATE repo - no GitHub Actions workflows by policy; all gates run locally.

## What ships

One Cloudflare Worker serves the whole thing: the static bundle plus a small
API (`worker/`, `wrangler.toml`). The GAME is still entirely client-side and
still offline-first - the week lives in this browser's `localStorage`, is
loaded from there, and plays identically with the server switched off, missing
or refusing to answer. What the Worker adds is the three things a tester build
needs and a static file cannot do:

- **a door** - `/t/<token>` admits a tester link and everything else refuses
  without a pass. Links are minted, listed and revoked with `scripts/tokens.mjs`
  on the owner's machine; there is no web surface anywhere that writes one.
- **a badge number** - `WG-####-XX`, which is the whole of an account. No email,
  no name, no analytics, no IP. Lose the badge and you lose the save, said once
  at the moment it is issued. An account is durable but not immortal: the badge
  and the week under it carry a 180-day KV TTL, re-armed on every login and
  every cloud save, and the log-on screen states when the badge was issued, when
  it was last used and the date it gets cleared out. No cron, no cleanup
  endpoint - the expiry rides on the write.
- **a copy of the save on that badge** - written on the same events that already
  autosave, read once at boot. Newest stamp wins and the loser is kept, never
  destroyed.

Plus an in-game "Report a real problem" form, and releases delivered in-fiction
as operating-system updates (`src/world/releases.ts`).

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
`src/shell/scripted-day.test.ts`, and the Worker's own units in `worker/`.
Everything in it is offline and browserless: no wrangler, no network, no
Cloudflare account.

**2. Against the served Worker, on the staging box:**

```
npm run build
# on the box, from the repo root (the local KV lives in ./.wrangler):
npx wrangler dev --ip 0.0.0.0 \
  --var SIGNING_KEY:any-long-throwaway-string-for-staging \
  --var FEEDBACK_DRY_RUN:true
node scripts/tokens.mjs seed-fixtures --local
# then, pointed at it:
PLAYWRIGHT_BASE_URL=http://<box>:8787 npm run gate:e2e
```

The venue changed with the deploy milestone: the shipped artifact is now a
Worker with a door on it, so the served half runs against `wrangler dev` rather
than against a directory of files. `PLAYWRIGHT_BASE_URL` is still the only
environment input - the suite lets itself in through a fixture link whose id is
a constant in `e2e/tokens.ts`, seeded from the same file the CLI reads.

Run it FROM THE HOST SERVING `wrangler dev`, in the repo root. Both the seeding
step and `revocation.spec.ts` reach the simulated KV under `.wrangler/`
directly - revoking a link is administration, and there is deliberately no web
surface that does it, so the one journey that proves revocation works uses the
owner's own CLI the way a human would.

The journey suite in `e2e/` drives the SHIPPED artifact through a real browser
as a player: the day loop, the boss key, the caught scene, triage, the handoff
form, the scorecard, a save/reload that has to come back to the same world, and
- since the deploy milestone - the door, a badge carrying a week to a second
browser, the report form and the update window.

It is deliberately NOT wired into `npm run gate` - this workspace does not run
browsers, and a gate that silently skips the half nobody can run here is worse
than a gate with two named halves. `gate:e2e` refuses to start without
`PLAYWRIGHT_BASE_URL`, so it cannot pass by having tested nothing.

`FEEDBACK_DRY_RUN` is a STAGING-ONLY flag: the report form is checked and
accepted and nothing is filed. It is an explicit flag rather than "post if
there is a token, otherwise pretend", because that fallback turns an expired
token in production into feedback that silently goes nowhere.

Both halves are required before a milestone is called done. Neither substitutes
for the other: the local half proves the world is deterministic and the rules
hold, and the served half proves a player can reach any of it.
