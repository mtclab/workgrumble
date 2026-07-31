# Workgrumble roadmap

Owner-confirmed order (2026-07-31). Rule of the road: complete gated slices, little by little; the parking lot obligates nothing. Fix waves from tester feedback and balance passes interleave throughout as minor OS updates.

## POC close (current)

- **M5** - polish, play-every-function walk, adversarial re-walk, visual pass (in flight).
- **Deploy milestone** -> tag v0.1, testers in: CF Worker under workgrumble.mtclab.net, badge-number accounts (anonymous, no personal data), KV saves (offline-first + sync), tester token links (per-link use limits + revocation), diegetic feedback (in-game "report a real problem" -> GitHub issue), releases delivered as in-game OS updates (real changelog in Windows-KB caricature voice).

## Post-deploy epics, in order

1. **E1 - Interruption family** ("Update 0.2: this update adds interruptions"). One engine feature - interruption events (source, related_to_open_ticket, postponable, severity) - unlocks the wave-3 P1 list: surprise calls/huddles, walk-up "while you're here", mandatory meeting blocks, presence status (Available/DND/Away vs suspicion), no-hello chat beats, THE FORCED-REBOOT EVENT (countdown, dwindling postpones, "Working on updates 30%" while SLA clocks run; real deploys ride the same animation), `arrives_minutes_before_close` archetype field, reply-all storm day, password-rotation day (NIST-honest KB). Research: docs/research/day-to-day-frustrations.md.
2. **E2 - The Assistant (9x half)** - useless-tips desk character (own design, not the paperclip), strictly flavor (KB owns real help), dismissal-memory gags. May fold into E1's release.
3. **E3 - Installables / TWID** - Browser web-store seam becomes real; company policy as world data (locked-down vs wild-west); forbidden installs = suspicion + audit trail; allowed installs = better stress drains. Tone reference: The Website Is Down.
4. **E4 - Channel sprawl** - multi-channel comms pathology (mail + chat + more simultaneously); attention-as-resource; same question in three places; extends the dm-bypass seed.
5. **E5 - Employer switching + era/skins** - the replayability unlock: company packs, ticket-system variety per employer archetype (email-first small shop / SaaS mid-size / enterprise / MSP multi-client), era-based OS skins (95 -> modern; changing jobs changes the decade), policy + channel mix per employer (needs E3/E4). Week-2+ content.
6. **E6 - Sysadmin tier** - the ladder's second rung: Linux boxes over ssh, services/DNS/backup tickets, monitoring dashboards + on-call (alert-fatigue numbers from research), escalated tickets returning to the player.
7. **E7 - Cloud/devops tier** - parody-named providers (trademark-safe), real-shaped systems (IAM, buckets, billing alarms, plan/apply = the engine's declared-vs-actual diff), per-provider dated research spikes, incident classes (public bucket, surprise bill, drift whodunit); the Assistant reincarnates as AI-in-everything.

## Standing references

Research: docs/research/ (real-systems, modern-stack, day-to-day-frustrations, ticket-material). Design: docs/DESIGN_POC.md. Gate protocol: README "Milestone gate".
