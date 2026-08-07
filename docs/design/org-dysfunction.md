# Design: the org / people dysfunction epic (E8)

**Dated 2026-08-07. Owner-seeded (2026-08-07): "access hell, executives being a
weak spot, hard managers who don't know anything in the way, the legendary
manager who makes a mess and leaves, changes reverted." Grounded in two research
syntheses (access/privilege dysfunction; the same as IT mechanics). The game's
comedy-and-truth heart - the HUMAN failure modes, not the technical ones.**

Proposal for convergence, not locked - ideas are discussions.

## The finding: this is the richest vein suggested in a long while, and it's cheap

Every technical system the game has (E1-E6) simulates the MACHINE going wrong.
This epic simulates the ORGANISATION going wrong - the part every IT person will
tell you is the actual job. And it is CHEAP because it reuses everything:

| The dysfunction | Reuses (already shipped) |
| --- | --- |
| Access hell / privilege creep | the 0.8.0 PAM tier model + the account/group model + the 0.3.x MFA/revoke/unlock verbs |
| The exec who clicks (BEC) | the account/session/MFA verbs + mailbox rules (a new small surface) + the tone/phishing content |
| The manager override you can't refuse | the 0.10.0 change-request / the CYA-email-as-artifact |
| Implement-then-revert | the 0.10.0 change-control + rollback + a cross-version ticket chain |
| The VIP tier | the ticket queue + SLA + the customer/scope model |

The research handed each one its REAL vocabulary and, crucially, "the ticket
this becomes" - so this is authorable content on proven rails, not new engine.

## The five mechanics (each a real ticket/incident)

### 1. The exec BEC compromise (the headline incident)
An executive clicked the phish / approved a fraudulent wire. A P1 that forces the
ORDERED response, each step a real verb: disable the account -> REVOKE SESSIONS/
TOKENS (the research's key truth: "a live session/OAuth token survives a password
reset" - reuse the 0.3.x revoke verb) -> **HUNT THE INBOX RULES** (the real BEC
tell: a forward-to-external / move-finance-to-deleted rule the attacker set, which
KEEPS FORWARDING after the password reset - a new small mailbox-rule surface) ->
check delegates -> scope what it touched -> notify. FAILS if you skip the inbox-
rule hunt (the silent forward survives). The politics: you are locking out and
interrogating the CEO's own account, mid-crisis, while they insist "I didn't click
anything." [Sources: incidentresponse.com BEC runbook, MS Defender inbox-forwarding
playbook, FBI IC3 $2.77B/yr.]

### 2. The exec weak spot / the VIP exception (the setup + the theme)
The exec who DEMANDS the hole: "I'm the CEO - I don't do MFA / give me local admin
/ don't filter my mail." The killer real detail: the **VIP-bypass is a shipped
product feature** (Mimecast/Defender exec-mail-skips-filtering) - the exception IS
the vulnerability. The player is pressured to grant it; granting it is what SETS UP
the BEC incident later (the exempted exec is the one who gets phished). The EA-
delegate onboarding ("give the assistant FullAccess") is the same trap - the
persistence vector the BEC hunt later finds. A slow-burn thread: grant the
exception now, pay for it later.

### 3. Access hell / the recertification (the access-review incident)
A "Q3 access recertification" ticket: clear a queue of who-has-what, and correctly
FLAG the three classic findings - the leaver still enabled (orphaned account; avg
116 days to deprovision, cases at 2 years), the person who changed roles 3x and
kept every role's access (privilege creep), the service account sitting in Domain
Admins nobody dares touch (the textbook least-privilege violation), plus a SoD
conflict (one person who can both create a vendor and approve its payment). The
friction is HUMAN: the manager replies "approve all" (rubber-stamp - refuse to
just accept it); nobody self-reports; and revoking the WRONG thing breaks a
scheduled job 48h later (a follow-up ticket). Reuses the PAM tier + account/group
model. [Sources: Keeper/Orca privilege creep, adsecurity.org service accounts,
SailPoint/Okta recertification, the rubber-stamp UAR.]

### 4. The manager override you can't refuse (the CYA mechanic)
A manager/VP orders something against best practice (grant the access, skip the
window, exempt the VIP, ship the risky change now). The ONLY progress path,
truthful to the profession: the **CYA email / risk-acceptance sign-off** - name
the risk, name why it can't be fixed now, and get the ACCEPTING owner's SIGNATURE
(not just their request). Refusing outright FAILS (insubordination) AND silently
complying FAILS (you own the incident). Get it in writing, then execute. Reuses
the 0.10.0 change-request as the artifact. [Sources: ISC2 risk-acceptance, USNH
standard, The Register "Who Me" CYA.]

### 5. The legendary manager / implement-then-revert (the cross-version churn)
The seagull swoops in with a mandate (a forced tool migration, a permission reorg
- **resume-driven development**, picked for their CV not the org), the player is
made to IMPLEMENT it, the manager gets **percussive-sublimated** (kicked upstairs)
or leaves, and later the player is made to REVERT it because the prior state was
better. A TWO-PART ticket chain across versions, scored on whether the player kept
the rollback docs/backup the FIRST time (which decides how painful part two is).
The "we told you so" + the churn cost eaten twice. [Sources: Wikipedia seagull
management + Peter principle + percussive sublimation, resume-driven-development.]

## The spine: a slow-burn con the player half-sees coming

The mechanics chain into an ARC, not just a ticket bag: grant the VIP the MFA
exception + the EA the delegate access (#2, feels harmless, pressured) -> the
exempted exec gets phished, the BEC fires, and the hunt finds the persistence in
the very delegate access you set up (#1) -> the access review would have caught
the creep that widened the blast radius (#3) -> and the manager who ordered the
exception faces no consequence while you write the postmortem (the #4/#5 theme).
The lesson the whole epic teaches: the technical controls are easy; the org is
the vulnerability, and "no" is a political act.

## Where it sits + how it ships

This is E8 (a new epic - the human layer, above E6 sysadmin / alongside E7 cloud;
it is not a tier of ACCESS but a tier of POLITICS, so it can ride any employer/
title). It phases across versions like the MSP arc:

**First version - the exec weak spot + the BEC incident (the headline).** Ship #2
(the VIP demands the exception, you grant it under pressure) + #1 (the exec gets
compromised, the ordered BEC response with the inbox-rule-hunt teeth) as one arc -
the setup and the payoff, the epic's thesis in one playable slice. Reuses the
account/MFA/revoke verbs + a small mailbox-rule surface.

**Backlog (later versions, one slice each):** the access recertification (#3); the
CYA / manager-override mechanic (#4); the legendary-manager implement-then-revert
chain (#5); the VIP support tier (the queue-jump); deeper politics (the assistant,
shadow IT, the personal-device-with-corporate-mail).

## Open sub-questions for the first version (converge before build)

1. WHICH employer hosts it? The exec/VIP dysfunction fits an IN-HOUSE corporate
   employer best (you support the execs directly). Recommend: the probation shop
   or a new corporate employer - NOT the MSP (where the execs are the customer's,
   a layer removed). OR make it employer-agnostic (execs exist everywhere).
2. Does the BEC hunt need a real MAILBOX-RULES surface, or can it reuse an existing
   read/list surface? Recommend: a small mailbox-rules read (list the rules on the
   account, spot the malicious forward) - it is the one genuinely new small
   surface, and the inbox-rule hunt is the incident's whole teeth.
3. How player-facing is the "grant the exception -> pay later" con - same version
   (setup + payoff in one arc) or across versions? Recommend: same version for the
   first slice (the thesis lands in one playable arc), the longer cons later.
