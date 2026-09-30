# Workgrumble: Helldesk

An IT-career role-playing game built on the office sim's world. Doom's pace
and face-in-the-status-bar; old-Elder-Scrolls rules (skills that rise by use,
a level you earn by resting, persuasion checks with the odds printed,
standing with factions, crime with witnesses, choices that come due later);
Skyrim-shaped perk trees; loot with rarity; Finnish sauna magic; and a mökki
you build up, weekend by weekend. Every ticket in it is a real ticket from
`src/world/tickets`.

Play it: `npm run dev`, then open `/crawler.html`. It ships in the same
`vite build` as the office sim (a second page), behind the same Worker door.

## The loop

One floor of Workgrumble Ltd is one work week. Work the floor (your ticket
queue at any computer, the people who bring their problems to you in person,
the quests people hand you), resolve the boss in the corner office, take the
lift, and it is Friday: you drive to the **mökki** (salary, HR, the
performance review, sauna, lake, grill, fishing, sleep and level-up, the
upgrade board, the Saunatonttu). On Monday you drive back to the next floor.
Floor 4 ends the story (one of eight endings); after it comes Overtime:
endless floors, stronger every loop.

## Difficulty: three dials

- **The career ladder (12 rungs).** IT Trainee → Junior Helpdesk Analyst →
  Helpdesk Analyst → Senior Helpdesk Analyst → *choose a domain (Systems,
  Network, Cloud, Security, Database) and a track (Operations Specialist or
  Engineer)* → Junior … → {Domain} {Track} → Senior … → Lead … → Principal …
  → Associate Architect → *choose Solutions, Enterprise or {Domain}
  Architect* → Senior Architect. Each rung multiplies enemy strength (×0.55 up
  to ×2.15) and salary. You can be hired at any rung (with the experience
  that implies). Every Friday Derek phones with a performance review:
  promotion needs Management standing, top skills and level, and you may
  always decline. Warnings can demote you; a trainee with three is fired.
- **The employer.** Four-Day Week (gentle), Standard, Crunch Time, Death
  March: enemy strength, SLA clocks, pay and what a burnout costs.
- **Ironman.** One autosave, no quicksave or loading; a burnout ends the
  career.

Tracks and paths change how you play: Operations Specialists get longer
SLAs, a bigger queue and better healing; Engineers more damage and ammo.
Solutions Architects talk (+20 persuasion, desk Rep), Enterprise Architects
get double Management standing and half the manager auras, Domain Architects
recharge their domain ability (G: Hard Reboot, Ping Sweep, Autoscale,
Lockdown, Rollback) twice as fast and hit twice as hard.

## Character

**New starter form**: name, background (six), star sign (six), the rung you
are hired at, domain/track/architect path if the rung calls for it, the
employer, Ironman.

- **Attributes**: Grit, Reflex, Tech, Charm, Patience, Liver.
- **Skills rise by use** (Morrowind): Hardware (melee), Scripting (ranged),
  Troubleshooting (terminal fixes, talking users through fixes), Soft Skills
  (persuasion), Sisu (rises as you get hurt), Hiding in Plain Sight
  (sneaking), Security (lockpicking), Drinking (tolerance), Mökki Magic
  (casting), Athletics. Skill books (found, and one a weekend from the
  reading nook) and the Saunatonttu add a point directly.
- **Levelling**: every 8 skill increases, rest (T, or the mökki bed) to
  level: raise two attributes by ×1-×5 depending on the skills that rose,
  Patience +1, and a perk point.
- **Perk trees** (Tab → Character): a General tree plus four perks for each
  skill, many with ranks, each rank gated by the skill's level - Percussive
  Maintenance, Batch Job, Root Cause, Executive Presence, Unbreakable, Ghost
  Mode, Master Key, Iron Liver, Kalevala, Marathon, and forty more.

## Combat

LMB swings or fires your tool; **hold LMB with a melee tool to wind up a
heavy swing** (more damage and knockback, a stagger, costs energy). **Hold
RMB to block** (frontal hits, costs energy, slows you); **block just as a
hit lands to parry** (no damage, the attacker is staggered); tap RMB to
shove. Hits land with a hit-stop. Sneak attacks on anyone who has not
noticed you do ×2 and up.

**The people** (every one of them can be talked to first - E):

| Who | What they do |
|---|---|
| Users, callers, customers | Throw their real tickets at you (it joins your queue) or come at you in person. Gold customers pay and hurt more. |
| Managers | Slow you with an aura, send meeting invites (rooted), give you action items (6 kg each), summon their team. |
| Consultants (floor 2+) | A shield aura: everyone near them takes half damage. Take the consultant out first. |
| Shadow IT (floor 3+) | Blinks away when hurt, deploys unsanctioned turrets. |
| Vendors (floor 2+) | Rush you and bill you: steal Rep. Resolve them to get it back. |
| Chatbots (floor 1+) | Slow bubbles of "14 suggested articles". |
| Reply-All storms, paper jams, mosquitoes | Swarms. |
| **Elites (★)** | Relentless, Tenured, VIP, CC-Everyone, Escalating or Passive-Aggressive: tougher, one trick each, much better loot. |
| **Bosses** | Derek, Karen, Gordon, The Auditor, Sir Reginald Workgrumble. A title card, boss music, patterns, and at half health **phase two**: hazard zones on the carpet (meetings, fires, freezes, spilt executive espresso). Stuns only stagger them. A boss summons no second wave while the first is still standing (a few adds, more on higher floors). Leave the boss's room and stay well clear for six seconds and they go back to their office: the damage you did stays done, so you can back off, heal and come back. |

Office ladies heal you (if you are sober enough and the Kitchen likes you);
sysadmins, security guards and interns can be recruited; Musti the
Lapphund, once you have him, comes to work and bites managers.

## Loot

Gear drops as instances with a rarity: **Common**, **Fine** (1 affix),
**Rare** (2 affixes) and **Legendary** (named, with a special: Milton's Red
Swingline pierces, Derek's Lanyard makes action items weightless, Karen's
Gold Card triples gold tickets, Gordon's APPROVED stamp roots, the Auditor's
Red Pen marks, Sir Reginald's hat keeps managers docile, the Nokia 3310
survives a burnout once a floor, the Koskenkorva Flask widens the Ballmer
Peak, and four more). Each boss carries its legendary; the rest turn up in
supply closets and on elites. Internal IT sells plain kit and buys anything
back.

## Quests

- **Project Phoenix** (the main story): a chapter per floor, with evidence
  to find (a server room, an office, a hard lock, a boss's pockets). Carry
  three pieces and the Auditor would rather talk than fight, and Sir
  Reginald's PA listens to you differently (expose it: the Whistleblower;
  sell it: the Golden Parachute).
- **Side quests** from people with a "!" over their head: Milton's red
  stapler, Brenda's mug, the printer exorcism, the password sweep, escorting
  Josh the intern to Internal IT, the Reply-All apocalypse, the phishing
  test, who drank Jukka's lonkero, the ticket sprint, Maureen's descaler
  (or sell it to the capsule vendor), Bev's lost all-floors badge (or keep
  it, and the Auditor hears), Graham's leaving card, karaoke with Kev (only
  at the exact Ballmer Peak), the Ghost of Exchange 2003 in the server room,
  Pekka's löyly inspection, rubber-duck debugging, Sanna's Dry Week bet (one
  drink in the office and it fails), the "prince" vendor, Fiona's ergonomic
  survey and Nik's cable ties. Several end in a choice. "?" means go back to
  them. Up to three are on offer per floor, and ones you took follow you up
  the building.
- **Staffing** (📌): nobody asks. Every so often, and more often the higher
  you climb, a manager rings (a Teams call, once you are not mid-fight) or
  corners you after a meeting: "while I have you". War rooms, Patch
  Tuesday, audit prep (three compliance forms scattered on the floor),
  vendor evaluations, printer "refreshes", the DR walkthrough, chatbot
  training data, the Shadow IT amnesty, a consultant to onboard (no
  stapling), the all-hands catering. The P1s (war room, customer visit,
  incident bridge) run on a clock that keeps ticking at a computer; the rest
  are due Friday. Take it, or push back (a Soft Skills check: harder the
  higher you climb, easier when you really are over capacity). Delegating is
  for architects: from Associate Architect up you can hand it to whoever is
  following you (half credit, full with Delegation; they go off to do it),
  and send them to a manager's meeting in your place. Ignore a call
  and after 25 seconds silence is consent. From any computer you can email
  one push-back per assignment. Delivered: Rep and Management. Missed:
  Management -6; two missed in a week is an HR warning.
- **Mentoring** (🎓): once you are the senior in your role (Senior Helpdesk
  Analyst, then Senior, Lead, Principal and the architects - at Junior and
  plain Specialist/Engineer you are the new one again), your team comes to you
  when they are stuck. A teammate walks over, busy or not: pair on two tickets,
  shadow two talk-downs, a server room induction, cover their on-call, lock
  picking 101, backing them up against a manager, the intern's grand tour.
  Take it on (it counts against your workload, and most of it only counts
  with them beside you), give them five minutes on the spot (a
  Troubleshooting check, no workload, no reward), or send them to the KB.
  See it through by Friday and you get a perk point (one a week; a second
  mentee that week pays double Rep instead), they become a protégé
  (they hit 30% harder for you from then on), and the Mentor perk grows on
  its own at 1, 3 and 6 people: allies hit harder and tire slower, +1
  workload capacity, then morale never drops below 40 and treats count
  double. Never finding the time costs their morale and the IT crowd's
  goodwill - nobody writes you up, they just stop asking.
- **Workload**: side quests, staffing, mentoring and inbox tasks all count
  against a capacity of 3 (+1 for the specialist track, +2 from Time
  Management, +1 from Healthy Boundaries, +1 from Mentor rank 2). Over capacity, max sanity and energy regeneration
  drop for every item too many, and the HUD panel turns red. The journal has
  the meter.
- **One story per floor, with delayed consequences**: Marcus's stopped
  backups, the "CFO" demanding an MFA reset, admin rights for Sales, the
  Auditor's liaison offering to doctor the logs, the CEO's PA. Audit
  findings make the Auditor tougher.
- **Mail tasks** at any computer, for a Rep bonus.

The compass (top of the screen), the minimap and the automap (M) show quest
markers; the journal (J, or at any computer) keeps the story.

## The team

The IT crowd on each floor (sysadmins, security, interns) will follow you if
you ask. The building remembers each of them by name, and so does their
morale, from floor to floor. Morale sets how hard and how fast they work (a
flagging teammate hits at 60%, a keen one at 140%); fights and a senior who
is over capacity wear it down, the weekend brings it back. Below 15 they go
on a break mid-floor, and below 25 they will not come with you at all.

- **Sweets** (E on a teammate, then pick from your backpack): digestives,
  Fazer Blue, a korvapuusti or a box of donuts (the rest of the team nearby
  gets some too), birthday cake (everyone gets a slice), coffee. Salmiakki:
  Finns love it; everyone else is polite about it.
- **Energy drinks**: a timed boost to damage and fire rate, then a crash that
  costs morale. The Euroshopper one does less and they notice. A second can
  while they are still buzzing gives them the jitters, not more power. A
  **White Monster** makes them ascend: 2.6× for a minute, glowing, and they
  will never forget it.

## The two tightropes

**Drink.** BAC in promille. Finnish drinks (keskari, lonkero, Koskenkorva,
Salmari, sahti), never sold by Internal IT. A drink goes into your stomach
first and reaches your blood over the next half-minute (the hatched ghost on
the meter is where you are heading), so it is easy to overshoot; food lines
your stomach and slows it down. Tipsy → **Ballmer Peak** (a
narrow window: damage, persuasion, and terminals strike a wrong fix) →
Merry (sway, managers can smell it) → Hammered (stumbling, swimming text,
healers refuse you) → Blackout (you wake somewhere with less Rep, a warning
and an anecdote). Then the hangover, dependency and the shakes. Empties are
evidence (0.3 kg each): return them to a pantti machine.

**Caffeine.** Milligrams, with tolerance that builds over the week and
drains at weekends. Alert → **WIRED** (the green zone: faster feet and
hands) → Jittery (aim shakes, sanity frays) → Palpitations (sanity drains
fast; push further and you end up sitting on the carpet counting
heartbeats). Every big high ends in a **crash** unless you drink through it
- which is how it gets you. Wired enough, managers struggle to smell the
drink. The cans: filter coffee, espresso, Euroshopper, Red Bull (wings:
jump higher), Battery, Battery No Calories, Monster, Pipeline Punch, NOCCO
(+20% melee), Celsius (energy regen), Grumble Energy, the Kraken litre, the
Vodka Battery - and **the White Monster**: never sold, rarely found (bosses,
elites, the odd closet, a 1.5% vending jackpot), and 45 seconds
**ASCENDED**: +40% damage, +30% speed, faster hands, free sprinting,
sanity regen, immune to meetings and to the jitters.

## Mökki magic

**Löyly** is your mana, restored by saunas (office saunas on most floors,
the real one at the mökki) and Salmari. Runes are learned from the
**Saunatonttu** or rune stones; casting can fail: Löylyhenki (steam burst),
Vihtaisku (lifesteal), Salmiakkikirous (poison), Sisu, Avanto (freeze nova
that sobers you), Hiljaisuus (invisibility), Mark and Recall, Väinämöisen
laulu (everyone nearby forgets their problem), Tontun kutsu (summon the
elf). Sauna straight into the lake blesses the whole next floor.

## The mökki

Spend Rep on the upgrade board and the plot changes: a wood shed (two
saunas a weekend, double grill), a smoke sauna (+Löyly, blessed without the
lake), a longer laituri and a boat (fishing: muikku, ahven, the legendary
hauki, or a boot), a potato patch, a palju (+15% max sanity for the week), a
guest room (an office lady visits with cake and gossip), Musti the dog, a
rune garden (runes half price), a satellite dish (a terminal in the
cottage), and a reading nook (a skill book every weekend).

## On call

Some weekends the pager comes to the mökki. Nobody is on the rota their
first weekend; from the second, a weekend you were not on call for the week
before is yours half the time (so about one weekend in three), three points
more for every rung you climb (83% for a Senior Architect: about four
weekends in nine), and never two weekends running. The rota is rolled from the save's seed, so reloading cannot dodge
it. On Friday a toast and the journal say whether you are on call; at the
mökki the HUD shows **📟 ON CALL** under the floor name (and, while a page
is going off, the incident, the seconds left and where to answer it).

On call, the pager goes off one to three times (the first within about a
minute of play, the next only after the last one's window has closed):
payroll paying everyone a cent, the CEO's yacht Wi-Fi, a printer printing
HELP, the certificate for everything, DNS (it is always DNS), the HR chatbot
in the board's chat, a 41-degree server room, a reply-all storm, a botnet
coffee machine, Derek in a lift stuck in demo mode, and the office sauna at
110 degrees. The pager beeps (its own beep, not the phone) and the screen
flashes. From the page going off you have **90 seconds of play** (time
stops in dialogue, menus and pause) to get to a computer: the satellite
terminal in the cottage, if you built the dish (E on it answers the page
before anything else), or else the car: **"Drive to the village and find
Wi-Fi"** answers it from the K-Market car park and costs the rest of the
weekend's sauna and grill. The compass points at whichever it is.

Answering is a choice of three fixes, each a check with the odds printed:
the proper fix (a skill that suits the incident; full Rep and Management
+3), talking it down to a P3 (Soft Skills; half Rep, Management +2) or the
bodge (an easy Troubleshooting check; a third of the Rep, Management +1). A
failed check still counts as answered but costs Management. At Merry or
worse every fix is harder (+20, +35 at Hammered, +50 blacked out), and the
first time it happens the journal says "I answered a P1 page three lonkeros
in."; on the Ballmer Peak every fix is 15 easier. A missed page (the window
runs out, you drive back to work with it going off, or you black out) costs
Management -5 and goes in the journal and the on-call record; two missed in
one on-call weekend is an HR warning. Leaving early is not a way off the
rota: drive back to work while pages are still to come and the next one goes
off on the motorway, with no signal, and counts as missed (the car says so
on the "Drive back to work" option). **Pager Duty** (General tree) doubles
the Rep a page pays, and answering ten pages earns **Sleeps With The
Pager**. `__helldesk.page()` puts you on call and sets the next page off, for
testing.

## Stealth and crime

C to sneak. Supply closets are locked: paperclips and a timing minigame
(Security vs the lock), with runes, drinks, books, gear, quest items and
Rep inside. The office fridge is always Jukka's. Doing any of it in front of
someone earns an HR warning.

## Looks

Everything is procedural (no image or model files). People are hand-built
voxel figures, in the spirit of Cube World and MagicaVoxel: chunky and crisp,
heads a little big, each part sculpted cell by cell on a 4.5 cm lattice,
greedy-meshed into flat quads and painted through vertex colours that carry
ambient occlusion (including the shade each part catches from its
neighbours: armpits, the crotch, under the chin), a top-lit gradient and a
hint of grain in cloth, knitwear and hair. Faces are bold pixel art in
half-size voxels that change with their mood (neutral, angry, happy, smug,
kind, stern, tired), with eye whites on dark skin and brows lifted clear of
glasses. Hair (short, long, a bun, bald, a hoodie's hood, the tonttu's cap),
suits, ties, lanyards with ID badges, knitted cardigans, glasses, headsets,
beards and backpacks go on top; managers get a paunch and everyone holds
their head a little differently. Shapes are cached per option set and only
recoloured per outfit, so a person is a handful of draw calls with one
material, and a soft light cap keeps white shirts and pale faces from
glowing under the lamps. Musti the dog and your own first-person arm are
built from the same kit. The
office has rounded furniture (swivel chairs on five-star bases, monitors on
stands, one-slab meeting tables, potted plants), door frames, dado rails and
cornices; the mökki has log cabins with gable roofs, tiered pines, birches,
a kettle grill, a plank dock and tufted grass. A post-processing
pipeline adds ambient occlusion, bloom and a "mood" pass that is how your
body feels: the room breathes and doubles when you drink, shakes when you
are jittery, tunnels in when you are close to burning out, goes grey in a
crash and green in a hangover, and glows when you are ascended. Real shadows
(the low white-night sun at the mökki, the nearest ceiling light in the
office), PBR materials with normal maps generated from the painted textures,
a different floor for each kind of room, blinking server racks, particles (paper confetti when a problem is resolved, sparks,
steam, dust in the light), a sky, a rippling lake and swaying grass.
Quality (low / medium / high) scales all of it.

## Saves and options

An autosave, a quicksave (F5, F9 to load) and three slots, all in this
browser. v2 saves are migrated. Options (Tab → Settings, or the pause menu):
first/third person, field of view, sensitivity, invert Y, render scale,
bloom, quality (lights), screen shake, damage numbers, tips, compass, music
and effects volume, autosave.

## Controls

WASD move · Mouse look · LMB tool (hold: heavy swing) · RMB block (tap:
shove) · Shift sprint · Space jump · E use / talk · F cast · X next rune ·
G domain ability · C sneak · T rest · Q quick supplies · 1-9 / wheel tools ·
V first/third person · Tab backpack · J journal · M map · F5/F9 quicksave /
quickload · Esc pause.

## Balance testing

`scripts/helldesk-balance/` is a bot that plays whole careers on the real
game code, headlessly and fast (a floor in seconds): it walks the floor on
its own path-finding, fights or talks people down, blocks, backs off to heal,
works the ticket queue at terminals, takes or pushes back on staffing,
accepts mentoring, rides the lift, levels up and shops at the weekend. It
records, per floor: time, burnouts and what caused them, lowest sanity, time
spent over capacity, staffing offered/delivered/missed, mentoring, side
quests, fixes, Rep, perk points, team morale and how much of the floor was
cleared. The game has a `headless` mode and a `step(dt)` for it, and a few
debug handles on `window.__helldesk`.

```
npx vite build --outDir /tmp/helldesk && npx vite preview --outDir /tmp/helldesk --port 4179 &
node scripts/helldesk-balance/run.mjs '{"name":"trainee","floors":5,"wallMinutes":15}'
node scripts/helldesk-balance/run.mjs '{"name":"senior","rung":6,"kit":["cat6","cardigan"]}'
```

It is a mediocre player on purpose: what kills it kills a new player. What
it found so far: the first boss's summons had no cap, a woken boss chased
you round the whole floor for ever, managers could chain meeting invites
into a lock, and floor 3 (index 3) was a wall - all fixed (see Combat).

## Code

All of it lives in `src/crawler/` and depends on nothing in the office sim at
runtime:

| File | Role |
|---|---|
| `rpg.ts` | Pure rules: attributes, skills, the 12-rung ladder, workplaces, factions, persuasion odds, inebriation bands, endings. |
| `caffeine.ts` | The caffeine bands, decay, tolerance and crash. |
| `perks.ts` | The perk trees. |
| `loot.ts`, `books.ts` | Rarity, affixes, legendaries, skill books. |
| `quests.ts` | Side quests, Project Phoenix, quest stages and turn-in dialogue. |
| `upgrades.ts` | Mökki upgrades, fish, achievements, tips. |
| `state.ts` | The save (v3), migration from v2, derived stats, skills and level-up. |
| `saves.ts`, `settings.ts` | Save slots; global options. |
| `story.ts` | Every other conversation: talk-downs, managers, office ladies, helpers, the Saunatonttu, the per-floor stories, the Auditor, HR, reviews, level-up. |
| `game.ts` | The Game: world loading, the loop, saves, settings, and the host interfaces the rest call into. |
| `combat.ts` | Attacks (heavy, block, parry), projectiles, damage both ways, resolving people, loot on the floor, hazards, effects. |
| `vices.ts` | Drink and caffeine ticks, timed can buffs, blackouts. |
| `spells.ts` | Runes and domain abilities. |
| `interact.ts` | Everything E does, the upgrade board, fishing, lockers, the fridge. |
| `questing.ts` | Puts quests into the world: evidence, givers, hunt targets, markers, events; staffing calls, deadlines, push-back and the Friday settlement. |
| `team.ts`, `teamwork.ts` | The team: morale, treats and cans, seniority and delegation rules (pure); morale ticks, treat dialogue, mentoring requests and payouts (in the game). |
| `oncall.ts`, `pager.ts` | The on-call rota: who is on call which weekend, the page schedule and clock, the drink modifiers, payouts and the incidents (pure); the Friday notice, pages going off, the page dialogue (`PagerHost`), the terminal and the village drive, misses and the HUD badge (in the game). |
| `desk.ts` | The ticket queue and mail tasks. |
| `hosts.ts` | Shop, inventory, perks, rest, deals, the small world effects. |
| `screens.ts` | Title, load and save menus, pause, burnout, endings, lifts. |
| `level.ts`, `mokki.ts` | Seeded floors and the cottage plot (grid collision, line of sight, flow fields). |
| `entities.ts` | Every NPC: stats, elites, AI, boss patterns and phases. |
| `os.ts` | WorkgrumbleOS: tickets, mail, KB, Internal IT (buy/sell), inventory, character and perks, HR, journal, achievements, settings, help. |
| `graphics.ts`, `particles.ts` | The render pipeline and mood shader, generated normal maps; the particle pool. |
| `hud.ts`, `compass.ts`, `player.ts`, `characters.ts`, `voxels.ts`, `meshes.ts` | Status bar and maps; compass; camera rigs; the voxel people; the voxel kit they, Musti and your arm are built with; the dog, turrets, chatbots and mökki buildings. |
| `dialogue.ts`, `minigames.ts`, `chargen.ts` | Conversations and lockpicking; fishing; the new starter form. |
| `items.ts`, `audio.ts`, `textures.ts` | Item tables; synthesised sound (music and effects buses, ambience); canvas-painted textures (no asset files). |
| `content/tickets.ts` | GENERATED by `node scripts/crawler-content.mjs` from `src/world/tickets` + `src/world/kb`. |

`crawler.test.ts` proves 150 generated floors and the mökki (bare and fully
built) are connected with every interactable and spawn reachable and no
machine made walk-through, and covers the skill/level, perk, career,
workplace, save-migration, persuasion, inebriation, caffeine, White Monster,
loot, quest and ending rules. `oncall.test.ts` covers the on-call rota (never
week one, never two running, the rate by rung), the page schedule and clock,
the drunk and Ballmer Peak modifiers, the missed-page warning rule, the pay,
and old and mid-weekend saves.
