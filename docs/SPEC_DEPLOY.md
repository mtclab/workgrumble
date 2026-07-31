# Deploy spec: workgrumble.mtclab.net, tester build v0.1

Contract for the deploy milestone. Owner decisions recorded in `docs/ROADMAP.md`. Standing bars + git rules apply. Pipeline rule: staging box first, manual `wrangler deploy` from clean `main` only (private repo, **no CI workflows**).

## 1. Shape

One CF Worker serves everything: the static bundle (assets binding) plus a small API. The game stays client-side; the Worker owns the door, the badges and the saves.

- `wrangler.toml`: worker name `workgrumble`, custom domain `workgrumble.mtclab.net`, assets from `dist/`, KV namespaces `TOKENS`, `PLAYERS`, `SAVES`, secrets `FEEDBACK_GH_TOKEN`, `SIGNING_KEY`. **The feedback token already exists**: the owner extended vahti's feedback GH token to cover `mtclab/workgrumble` (2026-07-31), so the deploy step is `wrangler secret put FEEDBACK_GH_TOKEN` with that value - no new token is minted, and its issue-create scope on this repo is verified during the staging smoke before prod.
- Local dev + staging: `wrangler dev` **on the staging box** (never this workspace), Playwright over LAN as usual.

## 2. Door: tester tokens

- KV, **two keys with split ownership** (amended 2026-07-31 after a live defect: a single record let the door's read-modify-write restore a `revoked` flag it had read before the revocation):
  - `<token>` -> `{ label, uses_max: number|null, expires_at: number|null, revoked: boolean }` - the POLICY. Written by `scripts/tokens.mjs` and by nothing else.
  - `uses/<token>` -> the count. Written by the door and by nothing else. The slash is load-bearing: a token id cannot contain one, so the two can never be confused.
  - `uses_max: null` = a shared link; a number = N admissions. Revocation is checked on EVERY request, so a pass issued moments before a revoke dies on that browser's next request.
  - Known and accepted: two admissions in the same instant can both spend the same count, so a counted link may leak one extra admission. KV has no compare-and-swap; the policy cannot be lost either way, which is the property that matters.
- `GET /t/<token>` validates, increments `uses_count`, sets a signed HttpOnly session cookie (30 days), redirects to `/`. Any other path without a valid cookie = a plain, non-jokey "this build is invite-only" page. No enumeration hints, generic failure text, per-IP rate limit on `/t/`.
- Admin: a `scripts/tokens.mjs` CLI (mint/list/revoke via wrangler KV) - owner-run, never a web surface.

## 3. Identity: badge numbers

- `POST /api/register` -> mints `WG-####-XX` (crypto-random, checked for collision), stores KV `PLAYERS/<badge>` -> `{ created_at }`, returns the badge. NOTHING else is stored - no email, no name, no IP, no analytics.
- Login = typing the badge on the shipped login screen (which becomes real): `POST /api/login` returns a signed badge cookie. Lose the badge, lose the save - said plainly, once, at mint time, in the game's voice ("Write it down. IT cannot look it up, which is the point.").
- The diegetic frame: the badge IS the employee number. The existing login screen keeps its password field as the joke it already is (any password, "hunter2" welcome), but the badge is the credential.

## 4. Saves online

- `PUT /api/save` (badge cookie required) -> KV `SAVES/<badge>` = the existing save wrapper JSON, last-write-wins, size-capped (reject > 512 KB with a readable error); `GET /api/save` -> latest or 404.
- **Offline-first stays**: localStorage remains the primary store and the source of truth for the running session; the cloud copy is written on the same events that autosave today (day boundary, manual save) and read on login when local is empty or older. Conflict = newest `saved_at` wins, and the loser is kept locally under a `*/conflict` key rather than destroyed.
- Storage keys rename `it-career-sim/*` -> `workgrumble/*` NOW (pre-release, nobody has a save): `SAVE_KEY`, `RETRY_KEY`, plus the doc/test references.

## 5. Feedback

- In-game "Report a real problem" (Start menu + a scene entry), styled as filing a ticket about Workgrumble itself. `POST /api/feedback` -> GitHub issue in mtclab/workgrumble, label `tester-feedback`, title from the player's summary line.
- Body carries: free text, and auto-context that is non-personal only (game day, save schema + engine version, build revision, open app, last 5 dispatch-log action ids). Badge attached ONLY if the player ticks "let them contact my badge about this". Visible note: do not put personal information in the text.
- Per-badge rate limit (KV counter, e.g. 10/day) with a readable refusal. Reuse the vahti `/palaute` lessons - notably `redirect: "error"` kills Workers fetch.

## 6. Releases as OS updates

- Version injected at build time from the git tag (`v0.1.0`); `src/world/releases.ts` holds notes as data (one entry per version: version, date, bullet lines in Windows-KB caricature voice).
- First boot on a version newer than the save's `last_seen_version` -> the update window ("DeskPro WorkGroup Update 0.1.0 has been installed."), re-readable later from an Update history entry. Ships with the deploy: authoring the notes is a checklist step.

## 7. Resilience (already built, must be exercised here)

The close-out shipped the loading shell, retryable boot diagnostic, storage probe/fallback, durability latch and preflight+rollback load. The deploy gate must exercise them against the real Worker: bad wasm path, blocked storage, corrupt save, foreign save, absent save.

## 8. Gates (deploy exit)

1. Staging box: `wrangler dev` + full `gate:e2e` against the Worker (not a static server) - all 104 green, plus new deploy journeys: token admission (valid/expired/revoked/exhausted/absent), register-login-save-reload-load across a browser restart, feedback submission (mocked GH endpoint in staging), update window on version bump.
2. Local `npm run gate` green (unit + engine + solvability + coverage).
3. Prod: deploy from clean `main` == origin, then a live smoke: `/t/<token>` admits, badge mints, save round-trips, feedback creates a real issue (delete it after), `/` without cookie refuses.
4. Tag `v0.1.0` after the live smoke passes; release notes authored and shipped in the build being tagged.

## 9. Explicitly NOT in this milestone

Anything from `ROADMAP.md` E1-E7. No analytics, no accounts beyond the badge, no leaderboards, no payment, no CI workflows.
