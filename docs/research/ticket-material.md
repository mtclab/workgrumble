# Ticket material research: real "this can't be real" support cases

2026-07-30. Purpose: real-world trope mining for game tickets. Rules of use: tropes and causes are fair game; REWRITE all flavor in our own comedy voice, never lift distinctive prose, no real names/companies. Owner-contributed cases marked (owner).

## A. Vague ticket / information vacuum

The genre-defining trope. Ticket says nothing; user vanishes; user later furious nothing happened.

- "<Product> is not working" - user names the COMPANY, means the software (owner).
- Ticket body just "broken" / "not working", no response to follow-ups for days, then whining about inaction (owner).
- Real ticket titled "Myspacebarisbroken" - description written entirely without spaces (self-proving ticket).
- User opens ticket with minimal info, tech must physically investigate to learn anything.
- "TOP PRIORITY" ticket; author disappears for 1.5 weeks when asked for details.

**Game mapping**: dedicated mechanic, not just flavor - "waiting on user" ticket state. Player must ask right question in chat (dialogue tree), user replies late/never; SLA clock pauses ONLY if player actually asked. Later: angry-escalation mail lands regardless (comedy + teaches CYA documentation). Self-proving tickets (spacebar style) = instant-diagnosis reward for attentive players.

## B. Priority pathology

- "We've known this hasn't worked for 6 months, but NOW it must be fixed in X hours/days" (owner).
- Urgent-overnight: request filed at midnight, furious follow-up next morning.
- Everything marked URGENT; real P1 buried under boss's trivial "urgent".

**Game mapping**: triage-as-gameplay (already in design section 7). Add ticket archetype: `deadline_absurdity` - flavor states issue is ancient, SLA is comically short; correct play = escalate/negotiate via chat (new resolution path), brute-forcing it = stress spike.

## C. Layer-8 hardware confusion (classic legends)

- CD tray used as cup holder, snapped off, warranty demanded.
- "Where is the Any key?" (Compaq nearly renamed the prompt).
- Mouse used as foot pedal - "I keep pushing and nothing happens."
- Mouse "hard to control with the dust cover on" - the plastic packaging bag.
- USB stick "broken" - plugged into ethernet port.
- "Computer frozen" - mouse/keyboard battery dead.
- New PC "won't power on" even after replacement - extension lead plugged into itself.
- Updates "don't apply" - user turns monitor off/on, calls it a reboot.
- Disc "stuck", user attacked drive with butter knives + pliers; never found eject button.
- Printer "broken" - paper still in shipping bag inside tray.

**Game mapping**: bread-and-butter POC tickets. Hidden-cause pattern: reported symptom node != faulty node; diagnosis = inspecting graph via Remote Assist/chat questions. Butter-knife energy = escalate-path tickets (user already made it worse; extra step to undo damage first).

## D. Power / physical environment

- Cleaner unplugs server rack every Friday 5pm to plug in vacuum; weekly mystery outage; fixed with sticky note. (Recurring legend across Register On-Call, Computerworld, unix.com - multiple independent tellings.)
- "Internet gone" - unpaid ISP bill.
- Dog chewed the internet cables.
- Internet + Outlook + landline ALL down - all rode one connection.

**Game mapping**: recurring-pattern ticket = multi-day arc (same outage Mon+Wed, resolution = noticing schedule correlation, fix = chat with facilities/sticky-note action). Great probation-week Thursday puzzle. POC-compatible since diagnosis is remote (uptime log app view or event timestamps in ticket history).

## E. Password / login

- CAPS LOCK on (the eternal #1).
- IT manager's password = username; hint says so.
- Popup literally says "Password must be changed. Click Continue" - user files ticket "this keeps happening, I don't know what to do."
- Locked out after vacation (expired while away).

**Game mapping**: already seeded. Add read-the-screen archetype: solution is verbatim on user's screen in Remote Assist; player just clicks it. Comedy is the ticket having existed at all. Fast-win pacing filler between hard tickets.

## F. Self-inflicted + coverup

- User deleted ~90% of Windows directory, then reported "problems".
- User frantically deletes pirated movies/music from full network drive WHILE screen-sharing with IT.
- "I've been hacked!" - colleague used unlocked unattended PC as prank (theme music autoplay).
- CEO: scrambled Word font = "we are being hacked".

**Game mapping**: GOLD - thematic mirror. Users slack and hide evidence exactly like the player does. Remote Assist occasionally reveals user's solitaire/shopping mid-diagnosis; user closes it in a panic. Pure flavor, huge comedy return, teaches nothing false. Coverup tickets: user lies in ticket ("it did that by itself"), graph history shows truth; calling it out vs silently fixing = tone choice (reputation neutral, dialogue payoff differs).

## G. Paranoid VIP / boss tickets

- "Delete the CEO" - IT vs endlessly paranoid CEO's asinine requests.
- "Who is this Mailer Daemon and why is he blocking my emails?"

**Game mapping**: VIP ticket class (design section 7 boss-priority trap already exists). Mailer-Daemon-style personified-error tickets = dialogue comedy; resolution = KB link + patient explanation choice.

## H. Maintenance blindness

- "Internet issues" reported during long-announced scheduled maintenance; whole company knew.

**Game mapping**: cheap systemic comedy - maintenance banner visible in player's own Mail app; flood of identical tickets arrives anyway; correct play = bulk-close with linked announcement (teaches mass-communication reality). Nice Friday-morning beat.

## I. IT-on-IT

- IT professional calls support for help with knowledge-base article they authored themselves.

**Game mapping**: late-week easter egg ticket from a fellow helpdesk NPC. Sets up post-POC colleague system.

## Extracted new mechanics (feed back into design)

1. "Waiting on user" ticket state + ask-the-right-question dialogue + CYA rule (SLA pauses only if question actually asked). -> DESIGN section 7 addition.
2. `deadline_absurdity` archetype with escalate/negotiate resolution path.
3. Multi-day recurring-outage arc ticket (cleaner-vacuum class).
4. Read-the-screen instant tickets as pacing fillers.
5. NPC slacking/coverup mirror in Remote Assist (users hide THEIR beer too).
6. Bulk-close with announcement link (maintenance flood).

## Sources

[TOPdesk 9 funny requests](https://www.topdesk.com/en/blog/9-funny-it-support-requests/) · [Operum tech tales](https://operum.tech/blog/tech-support-tales-the-funniest-tickets-weve-seen-over-the-years/) · [MakeUseOf 10 reddit TFTS stories](https://www.makeuseof.com/tag/10-best-tech-support-stories-reddit/) · [Microsoft "Best of the Worst" (Delete the CEO)](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-best-of-the-worst-tales-from-tech-support/248957) · [Jargon File: cup holder](http://www.catb.org/jargon/html/C/cup-holder.html) · [Computer Stupidities: CD-ROMs](http://www.rinkworks.com/stupid/cs_cdroms.shtml) · [Register On-Call: hotel cleaner vs server](https://www.theregister.com/on-prem/2020/03/13/not-exactly-the-kind-of-housekeeping-you-want-when-it-means-the-hotels-server-uptime-is-scrubbed-clean/657024) · [Computerworld vacuum-unplug](https://www.computerworld.com/article/1689077/at-least-they-didnt-just-unplug-it-to-plug-in-the-vacuum.html) · [unix.com war story](https://www.unix.com/war-stories/277344-data-centre-meets-vacuum-cleaner.html) · [NotAlwaysRight tech support](https://notalwaysright.com/tag/tech-support/) · [AnandTech threads](https://forums.anandtech.com/threads/funniest-best-or-worst-tech-support-stories.757481/) · owner's own helpdesk history (vague-company ticket, 6-months-now-urgent)
