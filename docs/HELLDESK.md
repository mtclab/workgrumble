# Workgrumble: Helldesk

An IT-career role-playing game built on the office sim's world. Doom's pace
and face-in-the-status-bar; old-Elder-Scrolls rules (skills that rise by use,
a level you earn by resting, persuasion checks with the odds printed,
standing with factions, crime with witnesses, choices that come due later);
Finnish sauna magic and a mökki to spend every weekend at. Every ticket in it
is a real ticket from `src/world/tickets`.

Play it: `npm run dev`, then open `/crawler.html`. It ships in the same
`vite build` as the office sim (a second page), behind the same Worker door.

## The loop

One floor of Workgrumble Ltd is one work week. Resolve the floor's boss in
the corner office, take the lift, and it is Friday: you drive to the **mökki**
for the weekend (salary, performance review, sauna, lake, grill, sleep, the
Saunatonttu), then drive back on Monday to the next floor. Beat the CEO on
floor 4 and you get one of several endings, then Overtime (endless floors).

## Character

**New starter form**: name, background, star sign, and the title you are
hired at.

- **Backgrounds** (CS graduate, forum legend, ex-hospitality, ex-army
  signals, nepotism hire, Finnish exchange worker) set attributes, three
  *major* skills (learned 50% faster), and sometimes starting runes, drinks,
  paperclips or standing.
- **Signs** (Patch Tuesday, The Friday Deploy, The Leap Second, Juhannus,
  The Year-End Freeze, The Blue Screen) are birthsigns with a trade-off.
- **Attributes**: Grit, Reflex, Tech, Charm, Patience, Liver.
- **Skills rise by use** (Morrowind): Hardware (melee), Scripting (ranged),
  Troubleshooting (terminal fixes, talking users through fixes), Soft Skills
  (persuasion), Sisu (damage reduction, rises as you get hurt), Hiding in
  Plain Sight (sneaking, sneak attacks), Security (lockpicking), Drinking
  (tolerance), Mökki Magic (casting), Athletics (sprinting).
- **Levelling**: every 8 skill increases, you can level - but only by resting
  (T in the office, or the mökki bed). You raise two attributes, each by
  ×1-×5 depending on how many increases its governed skills earned, and get
  a perk point.

## The career ladder is the difficulty

IT Trainee → Helpdesk Analyst → Senior Helpdesk Analyst → **choose a domain
(Systems, Network, Cloud, Security, Database) and a track (Operations
Specialist or Engineer)** → Senior … → Lead … → Principal … → {Domain}
Architect → Senior Architect. Each rung multiplies enemy strength (×0.65 up
to ×2.05) and salary. You can be hired at any rung, and every Friday Derek
phones with a performance review: promotion needs Management standing, skill
and level, and you may always decline. Warnings can demote you; three
warnings at trainee level and you are fired.

- **Operations Specialist**: longer SLA clocks, bigger queue, better healing,
  more Rep per desk fix.
- **Engineer**: more tool and spell damage, double ammo pickups.
- **Domain ability (G)**: Hard Reboot (shockwave), Ping Sweep (reveal and
  slow the whole floor), Autoscale (two clone helpers), Lockdown (stun
  everyone nearby), Rollback (restore position and sanity from 6 seconds ago).

## People and choices

- **Talk before you staple.** Walk up to an angry user and press E:
  walk them through their ticket's real fix (Troubleshooting), ask them to
  raise a ticket (Soft Skills), intimidate them (Hardware), bribe them with a
  biscuit or a service credit, or, if you are drunk enough, try to get a
  kebab with them. Every option shows its odds; failure enrages them.
- **Managers** can be met in a meeting (you are rooted, Management likes it),
  deflected, delegated to a helper, or pitched for a promotion.
- **Factions**: the Staff, Management, the Kitchen Cabinet (office ladies)
  and the IT Crowd. Stapling users pleases Management and annoys the Staff;
  desk fixes please both; SLA breaches cost both. Standing sets prices,
  helper loyalty, how hard users hit, whether some users will not bother you
  at all, heal sizes, and promotions.
- **One story per floor, with delayed consequences**: covering for Marcus's
  stopped backups (an audit finding), a "CFO" demanding an MFA reset (skip the
  check and the next floors get a phishing wave), admin rights for Sales
  (malware later), the Auditor's liaison offering to doctor the logs (or
  whistleblow), and the CEO's PA with an NDA (the Company Man ending).
  **Audit findings** make The Auditor boss tougher and more numerous.
- **HR**: witnessed theft, blackouts and being caught drunk earn warnings;
  three means a disciplinary hearing (demotion, a fine, or talk your way out).
- **Endings**: the Farm, the Distillery, the Whistleblower, the Architect
  Retires, Adopted by the Kitchen, the Company Man.

## The tightrope (drink)

BAC is shown in promille. Drinks are Finnish (keskari, lonkero, Koskenkorva,
Salmiakki Koskenkorva, sahti) and never sold by Internal IT; they come from
loot, the office fridge (theft, if anyone sees), Jukka from Finance, and the
mökki cool box.

- **Tipsy**: a little more damage and persuasion, sanity regen.
- **Ballmer Peak** (a narrow window, marked on the meter): more damage, more
  persuasion, and terminals strike a wrong fix off every ticket.
- **Merry**: aim sway, spells fail more, office ladies halve their help,
  managers can smell it.
- **Hammered**: heavy sway, stumbling, the terminal text swims, healers
  refuse you.
- **Blackout**: you wake up somewhere with less Rep, a warning and an
  anecdote.
- Afterwards: **hangover** (less max sanity, slower, take more damage) and
  **dependency** - high dependency means drinks heal more but being sober
  gives you the shakes. **Empties** are evidence that weighs 0.3 kg each;
  return them to a bottle machine (pantti) before a manager notices. Sauna,
  coffee, the lake and the Avanto rune all sober you up.

## Mökki magic

**Löyly** is your mana, restored by saunas (office saunas on most floors,
the real one at the mökki) and Salmiakki Koskenkorva. Runes are learned from
the **Saunatonttu** for Rep, or from rune stones in supply closets; casting
can fail (Mökki Magic skill, Tech, Liver, and drink all count): Löylyhenki
(steam burst), Vihtaisku (birch-whisk lifesteal), Salmiakkikirous (poison),
Sisu (half damage, cannot drop below 1), Avanto (freeze nova that also
sobers you), Hiljaisuus (invisibility), Mökkimerkki/Kotiinpaluu (Mark and
Recall), Väinämöisen laulu (everyone nearby forgets their problem), and
Tontun kutsu (summon the sauna elf). Sauna straight into the lake at the
mökki blesses the whole next floor.

## Stealth and crime

C to sneak: slower and harder to notice, and hits on anyone who has not
noticed you are sneak attacks (×2 and up). Supply closets are locked:
paperclips and a timing minigame (Security vs the lock), with runes, drinks,
gear and Rep inside. Doing it in front of someone costs you.

## Controls

WASD move · Mouse look · LMB tool · RMB shove · Shift sprint · Space jump ·
E interact / talk · F cast · X next rune · G domain ability · C sneak ·
T rest · Q quick-use supplies · 1-9 / wheel tools · V first/third person ·
Tab backpack & character sheet · M automap · Esc pause.

## Code

All of it lives in `src/crawler/` and depends on nothing in the office sim at
runtime:

| File | Role |
|---|---|
| `rpg.ts` | Pure rules: attributes, skills, careers and difficulty, factions, persuasion odds, inebriation bands, endings. |
| `state.ts` | The save (localStorage), derived stats, use-based skill progress, level-up. |
| `story.ts` | Every conversation: talk-downs, managers, office ladies, helpers, the Saunatonttu, the per-floor stories, HR, reviews, level-up. |
| `dialogue.ts` | The conversation window and the lockpicking minigame. |
| `chargen.ts` | The new starter form. |
| `magic.ts` | Runes and cast chance. |
| `mokki.ts` | The weekend cottage, built as a Level. |
| `content/tickets.ts` | GENERATED by `node scripts/crawler-content.mjs` from `src/world/tickets` + `src/world/kb`. |
| `level.ts` | Seeded floors (rooms, corridors, props, saunas, closets), grid collision, line of sight, flow-field navigation. |
| `entities.ts` | Every NPC: stats, AI, boss patterns, faction-aware behaviour. |
| `game.ts` | The loop, combat, spells, vices, interaction, floors, screens. |
| `os.ts` | WorkgrumbleOS: tickets, mail, KB, Internal IT, character sheet, HR portal, journal. |
| `hud.ts`, `player.ts`, `characters.ts` | Status bar and maps; camera rigs; the soft-voxel people with pixel faces. |
| `items.ts`, `audio.ts`, `textures.ts` | Gear tables; synthesised sound; canvas-painted textures (no asset files). |

`crawler.test.ts` proves 150 generated floors and the mökki are fully
connected with every interactable reachable, and covers the skill/level,
career, persuasion, inebriation, encumbrance and ending rules.
