# Helldesk vision: the consultant

Status: vision draft from an owner design discussion (2026-11-18). Each item is marked **DECIDED** (the owner converged on it) or **UNDER DISCUSSION** (an idea still being thought through together). Nothing here changes the shipped game or the 0.3.0 plan until it is turned into specs.

Related: `docs/SPEC_030.md` (the "a bit less Doom, much more RPG" pass), `docs/design/msp-arc.md` (multi-client work), `docs/design/exit-endings.md`, `docs/design/estate-and-customers.md`.

## Why rethink

Helldesk is a first/third-person crawler over a satirical office. The owner's feeling: it could do more. The 0.3.0 spike found about half of floor time is fighting, which pulls it toward a shooter. This vision settles the end goal first, so the genre and scope follow from it.

## The end goal - DECIDED

- **You are a consultant.** You move between client companies instead of being stuck in one office.
- **The goal is freedom, the truth, and fixing it.** Every client is a broken company you are hired to sort out. Piece by piece, their problems turn out to share one source (possibly your own consulting firm). Fixing things is the job; uncovering the source is the story; getting free is the ending.
- **A real ending, then an endless post-game.** The story finishes (target 15-30 hours); afterwards the game keeps going for players who want more.
- **The four best moments the game must deliver** (owner: all of them, and they must feel satisfying):
  1. a clever solution (talk, sneak, hack your way past what others would fight),
  2. a punchline (the satire lands),
  3. a great fight (when it comes to that),
  4. building something (your place, your life, your reputation).

## The daily loop - DECIDED in shape

- **Day: consulting gigs = the quests.** Each gig takes you into a client company (the crawler interior). Gigs have deadlines and can be solved several ways. Failing a gig is a normal outcome, not a game over.
- **Evening: life in the city.** Stores, arcades, your home, buying things, gaming on your home PC.
- **Stress is the linking resource.** Gigs build it up; too much makes you worse at work (failed checks, shaky hands, worse lines). City life and relationships bring it down.
- **Friends and family favours.** "Can you fix my xyz" tech support, helping someone move. Unpaid; the payment is the relationship (goodwill, favours back, a home-cooked meal that lowers stress, a guilt trip when you say no). It costs evening time, so it is a real choice.

## Side content for the post-game - DECIDED in principle

The post-game is only worth playing with plenty of side content. Three layers:

1. **Authored arcs** (the reason to care): friends and family storylines (3-6 steps each), memorable client stories, the main truth storyline. Target 10-20 arcs.
2. **Generated gigs and favours** (the endless part): templates such as "client X has problem Y in department Z, deadline N days", "relative needs a device fixed", "friend is moving", filled with different people, places and complications. Target 20-40 templates with several variants each. Recipe: each character has a small fact sheet; roles are cast by fit; cooldowns stop repeats; failure writes an outcome the world remembers.
3. **Life systems** (always something to do): arcades, home PC games, improving your home, relationships, collections, a consultant reputation that unlocks better clients.

## The endgame - UNDER DISCUSSION

- **A farm or countryside place.** "Quit IT and buy a farm" is a real running joke among IT people; here it is freedom made literal.
- Life there: gardening, fishing, walks, a village arcade, the home PC; friends and family visit (and still ask you to fix things).
- Gigs and favours continue, but **by choice**, not necessity. Stress flips from pressure to earned calm.
- Keep it light and cosy: a small plot, a few crops or animals, fishing, a couple of leisure activities. A reward, not a second game to grind.
- Open: farm only, or a small consultancy run from the farm.

## Money pressure - UNDER DISCUSSION

- **The player must keep taking gigs; money must not pile up easily.**
- "Endorsements" (owner's word; meaning to confirm): recurring living costs (rent, bills, a satirical pile of subscriptions, maybe a loan) and/or **expiring IT certifications** that better gigs require and that must be renewed (paid and studied for).
- **The farm is the savings goal**: the down payment is what the money is for; living costs are why it is hard.
- **Stocks as the risky route to wealth**: a small market including your own clients; fixing or botching a client moves its share price (an insider-trading joke, with consequences if pushed). Keep it volatile, with fees, so it cannot break the economy; the truth storyline may crash the market at some point.
- Loop: gigs -> living costs and certifications -> save or invest -> buy the farm.

## World and scope - UNDER DISCUSSION

- **A sectioned open world.** Outdoors: a business district or small city streamed in chunks. Indoors: each client company is its own loaded area with floors - the existing crawler becomes the interior. This is how large open-world RPGs keep cost bounded (a small grid of outdoor cells around the player, interiors loaded through doors), and it suits a web build.
- **Scope risk is the main risk.** Start small: one district, a hub, 3-4 client companies, a few deep life activities (one arcade with 2-3 games, one store type, the home with its PC). Grow one client and one activity at a time. Client interiors from modular office pieces so each new client is not a full art job.
- Open: is the original office the first client or the firm you work for? Free travel around the district or clients picked from a map?

## Still open (to decide next)

1. **Genre balance**: action RPG, story/immersive RPG, or a hybrid. Plan: two reference studies (action-RPG and story-RPG systems) are running; from them, three concrete pitches against this vision (each with a sample play session, what existing code survives, rough cost); the owner picks by gut.
2. **Open-world scope** for the first playable version.
3. **Meaning of "endorsements"** (living costs, certifications, or both).
4. **Farm endgame**: farm only, or farm plus a small consultancy.

## How this connects to existing work

- The 0.3.0 decisions (persistent hub floor, weekly mission deck, missions, disguises, neutral colleagues, fight budget per floor) carry over: the hub becomes your consultancy or home, the weekly deck becomes client contracts, the crawler becomes client interiors.
- The office sim (Workgrumble) stays as its own mode; its satire, ticket systems and multi-client arc (`docs/design/msp-arc.md`) are natural sources for gig content.
