import { describe, expect, it } from 'vitest';

import type { Expr } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession, type WorldSession } from '../session';
import { slaTierForTicketNodes } from '../customers';
import { tierResolutionTicks, tierTargetsFor } from '../priority';
import { vipForcedPriority } from '../vip';
import { inheritedTicketIds } from '../week';
import { mspInheritedTicketIds } from '../msp-week';
import { corporateInheritedTicketIds } from '../corporate-week';
import { bodgeInheritedTicketIds } from '../second-week';
import { BODGE_TICKETS } from './bodge';
import { CORPORATE_TICKETS } from './corporate';
import { MSP_CUSTOMERS, mspOnboardingSetup } from '../msp-company';
import { MSP_TICKETS } from './msp';
import { acceptsEscalation } from './escalation';
import { allowsEscalation, spawnWorldTicket, WORLD_TICKETS } from './index';
import type { WorldTicket } from './types';

/**
 * The roster is shared across all three employers (0.6.0 slice 3, 0.8.0), so a
 * ticket has to be spawned into the estate it is ABOUT. These name which shop
 * each ticket belongs to and stand up the right world for it - only one world is
 * ever up at a time, and a Bodgeworth or MSP fault in the probation estate is a
 * missing reporter.
 */
const BODGE_TICKET_IDS = new Set(BODGE_TICKETS.map((entry) => entry.def.id));
const BODGE_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'bodgeworth',
});
const MSP_TICKET_IDS = new Set(MSP_TICKETS.map((entry) => entry.def.id));
const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});
const CORPORATE_TICKET_IDS = new Set(
  CORPORATE_TICKETS.map((entry) => entry.def.id),
);
const CORPORATE_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'corporate',
});

function carryForTicket(entry: WorldTicket): Readonly<{
  farmFund: number; attempt: number; arcWeek: number; employer: string;
}> | undefined {
  if (BODGE_TICKET_IDS.has(entry.def.id)) {
    return BODGE_CARRY;
  }

  if (CORPORATE_TICKET_IDS.has(entry.def.id)) {
    return CORPORATE_CARRY;
  }

  return MSP_TICKET_IDS.has(entry.def.id) ? MSP_CARRY : undefined;
}

function sessionForTicket(entry: WorldTicket): WorldSession {
  const session = createWorldSession(carryForTicket(entry));

  // The onboarding customer (0.13.0) signs mid-week and is not in the MSP boot
  // estate, so its ticket has no reporter or nodes to spawn against until the
  // event has fired. Stand the signed-up client up the way the day driver does,
  // then spawn the ticket into it.
  if (MSP_TICKET_IDS.has(entry.def.id)) {
    session.engine.applySetup(mspOnboardingSetup());
  }

  if (session.engine.graph.getNode(entry.def.id) === undefined) {
    spawnWorldTicket(session.engine, entry.def.id);
  }

  return session;
}

/**
 * Puts a ticket in the world that the morning does not.
 *
 * Not every shipped ticket is in the queue at 08:00 any more: a summoned one
 * is raised mid-shift by the system that raises it - the lead, in chat - and
 * this is the same call the day driver makes when he does. Everything below
 * still drives the real registry against the real world; the only difference
 * is which minute the ticket arrived in.
 */
function spawnIfAbsent(session: WorldSession, entry: WorldTicket): void {
  if (session.engine.graph.getNode(entry.def.id) === undefined) {
    // The onboarding customer (0.13.0) signs mid-week and is absent from the MSP
    // boot estate, so its ticket has no reporter to spawn against - stand the
    // signed-up client up the way the day driver does before spawning it.
    if (MSP_TICKET_IDS.has(entry.def.id)
      && session.engine.graph.getNode(MSP_CUSTOMERS.tillman) === undefined) {
      session.engine.applySetup(mspOnboardingSetup());
    }

    // Through the real spawn seam, so a customer ticket lands with its tier
    // scaled onto the clock the way the day driver spawns it - a raw
    // registerTicket would skip the 0.12.0 tier and stamp the authored budget.
    spawnWorldTicket(session.engine, entry.def.id);
  }
}

/**
 * A world with the named tickets already in it.
 *
 * Monday's queue is one ticket now - the week deals the rest across five days -
 * so a test about a ticket has to put that ticket in the world first. It is the
 * same call the day driver makes at the minute the week says it arrives, and it
 * carries the ticket's setup mutations with it: the rotated screen, the locked
 * account and the wedged spooler are FAULTS THE TICKET BRINGS, so a world
 * without the ticket is a world where nothing is broken yet.
 */
function sessionWith(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession();

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
}

function sessionWithEveryTicket(): WorldSession {
  // The probation world, with every PROBATION ticket in it. Bodgeworth's
  // tickets are about a different estate and are spawned into their own world
  // (0.6.0 slice 3), so a helper that mixed them would be a world where half
  // the tickets name nodes that do not exist.
  return sessionWith(
    ...WORLD_TICKETS
      .filter((entry) => !BODGE_TICKET_IDS.has(entry.def.id)
        && !MSP_TICKET_IDS.has(entry.def.id)
        && !CORPORATE_TICKET_IDS.has(entry.def.id))
      .map(({ def }) => def.id),
  );
}

/**
 * How long a per-ticket sweep is allowed to take.
 *
 * The three tests below stand up a WHOLE EMPLOYER WORLD for every row in the
 * roster - four estates, seventy-odd tickets - and the roster grows with every
 * version. Five seconds was the default and the roster crossed it, which is a
 * fact about how much content this game now has rather than about anything
 * being slow; a sweep that started skipping rows to fit inside a default would
 * be a gate quietly covering less than it says it does.
 */
const ROSTER_SWEEP_MS = 30_000;

describe('shipped tickets', () => {
  it('spawns every shipped ticket open, with a live SLA', () => {
    for (const entry of WORLD_TICKETS) {
      // Each ticket into its own employer's fresh world, before anybody has
      // clicked anything (0.6.0 slice 3). Creating the session points the day
      // readers at that shop's week, so `inheritedTicketIds(1)` is that shop's
      // Monday pile.
      const session = createWorldSession(carryForTicket(entry));

      // The morning pile is in the world before anybody has clicked anything.
      // The one that drips in and the one the lead summons are not there yet,
      // and asserting they WERE would be asserting the queue lies about the
      // day: the whole point of an arrival is that it arrives.
      expect(
        session.engine.ticketState(entry.def.id),
        entry.def.id,
      ).toBe(
        // Each shop's own Monday pile: a Bodgeworth or MSP ticket is judged
        // against ITS inherited list, not the probation shop's.
        (BODGE_TICKET_IDS.has(entry.def.id)
          ? bodgeInheritedTicketIds()
          : CORPORATE_TICKET_IDS.has(entry.def.id)
            ? corporateInheritedTicketIds()
            : MSP_TICKET_IDS.has(entry.def.id)
              ? mspInheritedTicketIds()
              : inheritedTicketIds(1)
        ).includes(entry.def.id)
          ? 'open'
          : undefined,
      );

      spawnIfAbsent(session, entry);
      expect(session.engine.ticketState(entry.def.id)).toBe('open');
      // Spawned at tick 0, so the deadline IS the resolution budget it landed
      // with - and since 0.12.0 that budget is the customer's TIER (Gold tighter
      // than Bronze), read off the same estate its clock is. A tier-less
      // in-house ticket resolves no tier and keeps its authored `sla_ticks`, so
      // `tierResolutionTicks(null) === UNTRIAGED_SLA_TICKS` and the probation and
      // Bodgeworth deadlines do not move.
      const tier = slaTierForTicketNodes(session.engine.graph, entry.nodes);
      // And since 0.26.0 a VIP caller's ticket lands on the FORCED priority's
      // budget instead - tighter than the untriaged one, before anybody has read
      // it, which is the queue-jump's whole mechanic said as a number. It is
      // asserted here, across the WHOLE roster, so it is also the proof that no
      // other ticket moved: every reporter but one is off the list, and every one
      // of their deadlines is the number it was.
      // And since 0.37.0 the flag is read off whoever the ticket is FOR, where
      // it names somebody: the assistant's ticket for the executive lands on his
      // budget rather than on hers, which is the rule the audit rung bills a
      // junior for missing. Everything that names nobody is the reporter's own
      // flag, as it always was - which is what makes this line the proof that
      // the change moved exactly one ticket.
      const forced = vipForcedPriority(
        session.engine.graph,
        entry.beneficiary ?? entry.def.reporter,
      );
      // And a PROJECT TASK (E10, 0.29.0) keeps the date it was PLANNED with,
      // whichever customer it is for: the tier ladder answers "how fast is a
      // fault of theirs answered", which is not a question anybody asked about
      // a job scheduled three days ago. It is asserted in the same line as the
      // other two so the exemption is visible beside what it is an exemption
      // from - a project task on a four-hour Silver clock breaches on the
      // afternoon it is issued, and the queue would be right to say so.
      expect(
        session.engine.graph.getField(entry.def.id, FIELDS.slaDeadline),
        entry.def.id,
      ).toBe(
        entry.project !== undefined
          ? entry.def.sla_ticks
          : forced !== null
            ? tierTargetsFor(tier, forced).resolution
            : tier === null ? entry.def.sla_ticks : tierResolutionTicks(tier),
      );
    }

    // The roster, in spawn order, written out so that adding or losing a
    // ticket is a decision somebody made rather than a diff nobody read.
    expect(WORLD_TICKETS.map(({ def }) => def.id)).toEqual([
      'ticket:fan-noise',
      'ticket:rotated-screen',
      'ticket:locked-account',
      'ticket:wedged-spooler',
      'ticket:tidied-list',
      'ticket:boss-phone',
      'ticket:mfa-reregister',
      'ticket:must-change-password',
      'ticket:stale-device-relock',
      'ticket:mailbox-access',
      'ticket:sendas-missing',
      'ticket:licence-exhausted',
      'ticket:vpn-cert-expired',
      'ticket:vpn-cert-dup-ada',
      'ticket:vpn-cert-dup-gary',
      'ticket:share-maintenance',
      'ticket:share-dup-terry',
      'ticket:vacuum-tuesday',
      'ticket:vacuum-thursday',
      'ticket:flat-mouse',
      'ticket:coverup-backup',
      'ticket:hr-report-macro',
      'ticket:phishing-report',
      // The two the drive brought: an afternoon's work saved exactly where the
      // machine was told to save it, and a directory that has quietly eaten a
      // box since 1997.
      'ticket:saved-into-temp',
      'ticket:disk-full',
      // And the two that come from people rather than from faults: a request
      // raised five minutes before everybody goes home, and the restart that
      // only exists because somebody was asked to raise it.
      'ticket:vpn-month-end',
      'ticket:gary-restart',
      // And the one nobody's day schedules at all: the ticket a linked request
      // becomes when the player converts it rather than answering the human off
      // the books (0.5.0 slice 2). Summoned, like Gary's restart - it exists
      // only if you did the right thing with the cross-posted noise.
      'ticket:bev-vpn-request',
      // And the probation shop's pool (E11, 0.34.0 slice 2): twenty the
      // surplus can deal on any day but the authored one. Six of the estate's
      // baseline services read six ways, eight pieces of the job's own texture
      // (a lockout, an expired password, a battery, a screen somebody turned
      // over, a printer at the wall, a queue, a restart, a drive nobody was
      // ever added to), and the awkward remainder - a disabled update service,
      // a certificate that ran out on a Sunday, a tender in a temp directory.
      'ticket:pool-sales-restart',
      'ticket:pool-sales-spooler',
      'ticket:pool-payroll-clock',
      'ticket:pool-payroll-share',
      'ticket:pool-hercules-dead',
      'ticket:pool-despatch-lpd',
      'ticket:pool-reception-locked',
      'ticket:pool-reception-badges',
      'ticket:pool-despatch-queue',
      'ticket:pool-despatch-expired',
      'ticket:pool-facilities-disabled',
      'ticket:pool-accounts-updates',
      'ticket:pool-accounts-drives',
      'ticket:pool-estimating-rotated',
      'ticket:pool-estimating-tender',
      'ticket:pool-portal-cert',
      'ticket:pool-accounts-browse',
      'ticket:pool-warehouse-schedule',
      'ticket:pool-warehouse-tablet',
      'ticket:pool-sales-new-mfa',
      // And the four the morning pile was short of. The exclusion window costs
      // five inherited tickets a week and eleven in the pool left the second
      // week drawing from a remainder with no room to be wrong about which day
      // each was allowed on - which the generator found out at week 564.
      'ticket:pool-finance-sound',
      'ticket:pool-logistics-share',
      'ticket:pool-marketing-trust',
      'ticket:pool-hr-print-group',
      // The shop's one escalate-only fault (E9, 0.36.0).
      'ticket:pool-product-login-down',
      // And the second employer's five (0.6.0 slice 3), in the one roster
      // because the gates read one roster - spawned into the Bodgeworth world,
      // not this one.
      'ticket:office-login-locked',
      'ticket:accounts-package-down',
      'ticket:yard-printer-wedged',
      'ticket:the-share-down',
      'ticket:vernon-mouse',
      // And Bodgeworth's pool (E11, 0.34.0 slice 2): the surplus a second week
      // is drawn out of, dealt by no authored day. The client half of a share,
      // a login the yard printer keeps shutting, and three the shop has every
      // week of its life.
      'ticket:front-desk-no-network',
      'ticket:kev-relock',
      'ticket:baz-locked-out',
      'ticket:trev-switched-off',
      'ticket:yard-printer-unplugged',
      // And the MSP's ten (0.8.0, Pass B), spawned into the MSP world: the law
      // firm's three (matter access, the iManage check-out deadlock, the e-filing
      // panic), the SaaS shop's four (SSO loop, offboarding gap, MFA lockout, and
      // the prod-down that can only be escalated), and the clinic's three
      // monitoring-only alerts.
      'ticket:fontaine-matter-access',
      'ticket:fontaine-checkout-deadlock',
      'ticket:fontaine-efiling',
      'ticket:meridian-app-assignment',
      'ticket:meridian-offboarding',
      'ticket:meridian-mfa-lockout',
      'ticket:meridian-prod-down',
      'ticket:northwind-backup-alert',
      'ticket:northwind-cert-alert',
      'ticket:northwind-disk-alert',
      // And the two remaining scope tiers, made real (0.11.0): the fully-managed
      // practice's three (the shared-drive server fix a helpdesk contract walls
      // off, a workstation spooler, a user lockout), and the co-managed
      // manufacturer's two (the RACI hand-back and the coordinate-then-act
      // after-hours portal gap).
      'ticket:holloway-shared-drive',
      'ticket:holloway-spooler',
      'ticket:holloway-lockout',
      'ticket:arden-lockout-handback',
      'ticket:arden-portal-afterhours',
      // And the onboarding capstone (0.13.0): the discovery of a silently-failing
      // backup at the customer that signs mid-week, spawned into the estate the
      // onboarding event stands up.
      'ticket:tillman-backup-discovery',
      // And the dental vertical (0.14.0): the fully-managed clinic's three
      // hands-on tickets - the chair-side X-ray sensor reseat, the imaging-bridge
      // vendor escalation, and the HIPAA access-review report.
      'ticket:elmwood-xray-sensor',
      'ticket:elmwood-imaging-bridge',
      'ticket:elmwood-hipaa-audit',
      // And the creative vertical (0.32.0): the Mac agency's three, one per
      // thing a Windows-shaped desk gets wrong about a Mac shop - the Screen
      // Recording consent no console can grant, the Gatekeeper refusal that is
      // not a malware detection, and the Named User seat that followed the
      // person out of the door.
      'ticket:marlowe-screen-recording',
      'ticket:marlowe-gatekeeper-plugin',
      'ticket:marlowe-seat-expired',
      // And the engineer's first fix (E6, Pass B): the MSP's OWN client portal
      // down on FC-RMM-01. Summoned - raised by the promotion, not by a scripted
      // day - and the payoff of the whole tier crossing.
      'ticket:syseng-first-incident',
      // And the characteristic sysadmin incidents (E6, 0.19.0): the disk that
      // fills with logs, the cert that expired (a process failure), and the
      // deploy that "worked in staging", closed by the blameless postmortem. All
      // summoned by the promotion, on the MSP's own box.
      'ticket:syseng-disk-full',
      'ticket:syseng-cert-expiry',
      'ticket:syseng-failed-deploy',
      // The permission-denied incident (E6, 0.21.0): a service down on a
      // wrong-owned config file - chown/chmod it readable, then restart.
      'ticket:syseng-permission-denied',
      // ARDEN-MFG's edge firewall replacement (E10, 0.29.0): the first PROJECT.
      // The delivery row and its four phase tasks - which arrive with the
      // project rather than on any day - then the two tickets a factory raises
      // the morning after a cutover that left a rule behind.
      'ticket:arden-fw-project',
      'ticket:arden-fw-audit',
      'ticket:arden-fw-staging',
      'ticket:arden-fw-cutover',
      'ticket:arden-fw-handover',
      'ticket:arden-fw-scream-brenmark',
      'ticket:arden-fw-scream-scanners',
      // And the MSP's pool (E11, 0.34.0 slice 2): the surplus each customer
      // scope can be dealt on a drawn week - the two helpdesk shops' walls, the
      // monitoring-only clinic's escalate-only alerts, the co-managed plant's
      // RACI hand-backs, and the Mac agency's own texture.
      'ticket:msp-pool-fontaine-partner-lockout',
      'ticket:msp-pool-fontaine-file-server-full',
      'ticket:msp-pool-fontaine-supervising-partner',
      'ticket:msp-pool-meridian-restart-prompt',
      'ticket:msp-pool-meridian-wrong-groups',
      'ticket:msp-pool-meridian-status-page',
      'ticket:msp-pool-northwind-portal-stopped',
      'ticket:msp-pool-northwind-server-service',
      'ticket:msp-pool-holloway-payroll-export',
      'ticket:msp-pool-holloway-workstation-service',
      'ticket:msp-pool-holloway-disabled-account',
      'ticket:msp-pool-elmwood-reception-spooler',
      'ticket:msp-pool-elmwood-task-scheduler',
      'ticket:msp-pool-arden-reset-handback',
      'ticket:msp-pool-arden-server-service',
      'ticket:msp-pool-marlowe-share-access',
      'ticket:msp-pool-marlowe-password-expired',
      'ticket:msp-pool-marlowe-nas-capacity',
      // And the corporate employer's three VIP exceptions (E8, 0.22.0), spawned
      // into the Halcyon world: the CEO's MFA off, the EA's mailbox delegate, and
      // the CEO taken off the mail filter - the setup a later BEC incident reads.
      'ticket:halcyon-ceo-mfa-off',
      'ticket:halcyon-ea-delegate',
      'ticket:halcyon-ceo-filter',
      // The BEC incident (E8, 0.22.0, Pass B): the summoned P1 that follows the
      // delegate grant - the payoff the three exceptions above set up.
      'ticket:halcyon-ceo-bec',
      // The access recertification (E8, 0.23.0): the Q3 review whose queue is the
      // classic findings (leaver / creep / SoD / over-privileged service
      // account), and the summoned broken-job it raises when the load-bearing
      // service account is killed rather than right-sized.
      'ticket:halcyon-recert',
      'ticket:halcyon-recert-followup',
      // The manager override / CYA (E8, 0.24.0): the Head of IT orders the
      // contractor given Domain Admin, and the only path that is neither
      // insubordination nor owning-the-incident is the signed risk acceptance.
      'ticket:halcyon-override',
      // The legendary manager / implement-then-revert (E8, 0.25.0): the seagull's
      // mandate to flatten every service to Automatic, and the revert it summons
      // when he leaves and the audit flags it - clean if the rollback was kept,
      // painful reconstruct if not.
      'ticket:halcyon-mandate',
      'ticket:halcyon-revert',
      // And the VIP tier (E8, 0.26.0): the collision - the flagged caller's
      // trivial request and the ordinary user's real one, dealt in the same
      // minute - and the shadow-IT tail behind them.
      'ticket:halcyon-ceo-earbuds',
      'ticket:halcyon-finance-ledger',
      'ticket:halcyon-ceo-tablet',
      // And the shadow VIP (E9, 0.37.0): the assistant's immaculate ticket for
      // the executive's other earbuds, forced by his flag rather than by hers.
      'ticket:halcyon-ea-earbuds-again',
      // And Halcyon's pool (E11, 0.34.0 slice 2): the housekeeping the
      // governance is supposed to produce and does not - a morning where no
      // name resolves, a fortnight's cover with no end date, an account that
      // outlived the director, and a password that expired on schedule.
      'ticket:halcyon-dns-down',
      'ticket:halcyon-ap-cover',
      'ticket:halcyon-interim-leaver',
      'ticket:halcyon-colm-password',
      // And the three that close in two steps rather than one. They are here
      // because a day at this shop tops out at four arrivals, and four
      // one-step arrivals cannot reach the floor of its load-2 Thursday - so
      // the surplus needed weight rather than volume before the exclusion
      // window could be honoured at all.
      'ticket:halcyon-dfs-disabled',
      'ticket:halcyon-bits-disabled',
      'ticket:halcyon-audio-disabled',
      // The senior rung's audit queue (E9, 0.36.0): somebody else's filings,
      // on ordinary tickets.
      'ticket:audit-print-task',
      'ticket:audit-marketing-spooler',
      'ticket:audit-lead-locked',
      'ticket:audit-print-workstation',
      'ticket:audit-print-browser',
    ]);
  }, ROSTER_SWEEP_MS);

  it('leaves the reported symptom in the world it spawns into', () => {
    const session = sessionWithEveryTicket();

    expect(
      session.engine.graph.getField(COMPANY_IDS.adaMachine, FIELDS.displayRotation),
    ).toBe(90);
    expect(session.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toBe(true);
    expect(session.engine.graph.getField(COMPANY_IDS.spooler, FIELDS.status))
      .toBe('wedged');
    expect(session.engine.graph.getField(COMPANY_IDS.printer, FIELDS.queueLen))
      .toBe(47);
  });
});

/**
 * Content honesty at graph level: the estate contains one thing that looks
 * like a service and is not, and no verb on the helpdesk tier may pretend
 * otherwise or quietly close the ticket that hangs off it.
 */
describe('hardware that reports a status', () => {
  it('refuses to restart the chassis fan and leaves its ticket open', () => {
    const session = sessionWith('ticket:fan-noise');
    const before = session.engine.snapshotHash();

    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.fan,
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('It will not help.');
    expect(session.engine.snapshotHash()).toBe(before);
    expect(session.engine.graph.getField(COMPANY_IDS.fan, FIELDS.status))
      .toBe('wedged');
    expect(session.engine.ticketState('ticket:fan-noise')).toBe('open');
  });

  it('still restarts the software on the same estate', () => {
    const session = sessionWith('ticket:wedged-spooler');

    // The queue goes first - and clearing it stops the spooler, which is the
    // spooler ticket's whole lesson.
    session.engine.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      { spooler: COMPANY_IDS.spooler },
    );

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.serviceRestart,
        COMPANY_IDS.player,
        COMPANY_IDS.spooler,
        {},
      ).ok,
    ).toBe(true);
  });
});

/**
 * Content honesty at flavour level: the deflection layer's pre-chew tells the
 * player what the portal bot already tried, and nothing it says may be false in
 * THIS game's own model.
 *
 * The bug it guards: the locked-account pre-chew used to say the bot reset the
 * password and it changed nothing "because the account is locked" - but a real
 * reset (`account.ts`) CLEARS the lock, so a reset that was carried out cannot
 * have left him locked. The truthful flavour is that he never completed the
 * self-service reset, because being locked out is what blocks the sign-in the
 * self-service reset needs; the bot only kept OFFERING the fix its own lockout
 * put out of reach.
 */
describe('the deflection pre-chew is true in this game\'s own model', () => {
  const locked = WORLD_TICKETS.find(
    (entry) => entry.def.id === 'ticket:locked-account',
  );

  it('a real password reset clears the lockout the ticket describes', () => {
    const session = sessionWith('ticket:locked-account');
    expect(session.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toBe(true);

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.accountResetPassword,
        COMPANY_IDS.player,
        COMPANY_IDS.garyAccount,
        {},
      ).ok,
    ).toBe(true);

    // A reset that WAS carried out ends the lockout - so any flavour claiming a
    // reset was done and yet left him locked is false in-model.
    expect(session.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toBe(false);
  });

  it('never says a reset was carried out and left the account locked', () => {
    const stillBroken = locked?.def.flavor.preChew?.stillBroken ?? '';
    expect(stillBroken.length).toBeGreaterThan(0);

    // The category error the fix removes: a reset that was DONE ("reset it" /
    // "reset the account" / "reset his password") cleared the lock, by the test
    // above, so the flavour may not pair a completed reset with a still-locked
    // outcome. The bot OFFERING or suggesting a reset it could not complete is
    // the comedy and stays; carrying one out and staying locked is the lie.
    expect(stillBroken).not.toMatch(/reset (it|the account|his password)\b/i);
  });
});

describe('escalation policy', () => {
  it('offers escalation only where the ticket rules accept it', () => {
    const escalatable = WORLD_TICKETS
      .filter((entry) => acceptsEscalation(entry.def.resolved_when, entry.def.id))
      .map(({ def }) => def.id);

    // Each for an honest reason: a fan whose bearing is going wants a
    // screwdriver and somebody on site; a report that has not run since March
    // wants the people whose job the job is; the SaaS shop's prod-down is on a
    // Linux server out of reach on OS and contract both, so escalation is the
    // only ending; all three of the clinic's monitoring-only alerts are
    // escalate-ONLY by contract - remediation is out of scope, so escalation is
    // not a fallback there but the whole of the job; and the co-managed
    // manufacturer's user lockout is the RACI hand-back - a daytime user reset is
    // their own helpdesk's, so handing it back is the resolution, not a reset;
    // and the onboarding discovery is a finding to RAISE, not a desk fix - a
    // backup that never worked is escalated to whoever owns the remediation plan;
    // and the dental clinic's imaging bridge is a vendor integration a PMS update
    // broke - a restart cannot reconcile it even on a fully-managed contract, so
    // escalating it to the imaging vendor is the job, not a fallback; and the
    // creative agency's expired seat is the same shape one step further out - a
    // Named User licence that lapsed at the VENDOR cannot be conjured by any
    // verb on any estate, so raising it with the licensing desk is the work.
    // And the probation shop's own escalate-ONLY pool ticket (E9, 0.36.0): the
    // product is on a Linux box, so the desk's tools stop at its operating
    // system and ssh stops at the tier - out of reach on both counts, which
    // makes the handoff the whole of the job rather than a fallback. It is the
    // only escalatable thing this shop has after week one, and without it the
    // escalate button is decoration at every rung that plays a drawn week.
    expect(escalatable).toEqual([
      'ticket:fan-noise',
      'ticket:hr-report-macro',
      'ticket:pool-product-login-down',
      'ticket:meridian-prod-down',
      'ticket:northwind-backup-alert',
      'ticket:northwind-cert-alert',
      'ticket:northwind-disk-alert',
      'ticket:arden-lockout-handback',
      'ticket:tillman-backup-discovery',
      'ticket:elmwood-imaging-bridge',
      'ticket:marlowe-seat-expired',
      // And the MSP pool's six that close ONLY by escalation (E11, 0.34.0
      // slice 2), each for the same reason as one above: the two helpdesk
      // shops' out-of-scope work goes back to the client (a file server they
      // own; a status page on a Linux box), the monitoring-only clinic's two
      // alerts are escalate-by-contract, the co-managed plant's user reset is
      // the RACI hand-back, and the project NAS at capacity is a purchase
      // nobody at the desk can authorise.
      'ticket:msp-pool-fontaine-file-server-full',
      'ticket:msp-pool-meridian-status-page',
      'ticket:msp-pool-northwind-portal-stopped',
      'ticket:msp-pool-northwind-server-service',
      'ticket:msp-pool-arden-reset-handback',
      'ticket:msp-pool-marlowe-nas-capacity',
    ]);
  });

  /**
   * The rule has to be about the ticket being asked about. A clause reading
   * ANOTHER ticket's `escalated` flag used to count, which offered a button
   * that marked this ticket escalated, did not close it, and refused the
   * second press: a ticket the player could neither finish nor escalate.
   */
  it('reads the selector, not just the field name', () => {
    const own: Expr = {
      op: 'eq',
      selector: { id: 'ticket:mine' },
      field: FIELDS.escalated,
      value: true,
    };
    const other: Expr = {
      op: 'eq',
      selector: { id: 'ticket:somebody-else' },
      field: FIELDS.escalated,
      value: true,
    };
    const wandering: Expr = {
      op: 'eq',
      selector: { kind: 'ticket', where: [{ field: FIELDS.state, value: 'open' }] },
      field: FIELDS.escalated,
      value: true,
    };

    expect(acceptsEscalation(own, 'ticket:mine')).toBe(true);
    expect(acceptsEscalation(other, 'ticket:mine')).toBe(false);
    expect(acceptsEscalation(wandering, 'ticket:mine')).toBe(false);
    expect(acceptsEscalation({ op: 'or', exprs: [other, own] }, 'ticket:mine'))
      .toBe(true);
    expect(acceptsEscalation({ op: 'or', exprs: [other, wandering] }, 'ticket:mine'))
      .toBe(false);
    expect(acceptsEscalation({ op: 'not', expr: own }, 'ticket:mine')).toBe(false);
    expect(acceptsEscalation({ op: 'exists', kind: 'ticket' }, 'ticket:mine'))
      .toBe(false);
  });

  /**
   * The button and the engine are ONE rule, so they have to agree on every
   * shipped ticket. A button that greys out for one reason while the engine
   * refuses for another is two rules pretending to be one.
   */
  it('agrees with the engine on every shipped ticket', () => {
    for (const entry of WORLD_TICKETS) {
      const session = sessionForTicket(entry);
      const offered = allowsEscalation(entry.def.id);
      const result = session.engine.dispatch(
        HELPDESK_ACTIONS.ticketEscalate,
        COMPANY_IDS.player,
        entry.def.id,
        {
          reported: 'It makes a noise like a bag of spanners.',
          tried: 'Turned it off and on again',
        },
      );

      expect(result.ok, `${entry.def.id} offered=${String(offered)}`)
        .toBe(offered);

      // And where it was offered, it actually CLOSED the ticket rather than
      // leaving it escalated and open.
      if (offered) {
        expect(session.engine.ticketState(entry.def.id)).toBe('resolved');
      }
    }
  }, ROSTER_SWEEP_MS);

  it('refuses to escalate a ticket that is fixable from the desk', () => {
    const session = sessionWith('ticket:locked-account');
    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      'ticket:locked-account',
      {
          reported: 'It makes a noise like a bag of spanners.',
          tried: 'Turned it off and on again',
        },
    );

    expect(result).toEqual({
      ok: false,
      reason: 'This is fixable from your desk, and everyone downstream knows '
        + 'it. Escalating it would be a career-limiting move.',
    });
    expect(session.engine.ticketState('ticket:locked-account')).toBe('open');
  });
});

describe('waiting on the user', () => {
  /**
   * The CYA rule against the SHIPPED world: the toggle cannot buy back a
   * minute of SLA until the reporter has actually been asked something, and
   * the refusal leaves the deadline exactly where it was.
   */
  it('will not stop a shipped ticket clock before the question is asked', () => {
    const ticketId = 'ticket:locked-account';
    const session = sessionWith(ticketId);
    const before = session.engine.snapshotHash();
    const deadline = session.engine.graph.getField(ticketId, FIELDS.slaDeadline);

    const refused = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketSetWaiting,
      COMPANY_IDS.player,
      ticketId,
      {},
    );

    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason)
      .toContain('You have not actually asked them anything yet.');
    expect(session.engine.snapshotHash()).toBe(before);
    expect(session.engine.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(deadline);
    expect(session.engine.ticketState(ticketId)).toBe('open');

    // Ten minutes later the clock has eaten ten minutes, exactly as if the
    // player had never touched the toggle.
    session.engine.advance(10);
    expect(session.engine.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(deadline);
  });

  it('pushes the SLA deadline out while the ticket is parked', () => {
    const ticketId = 'ticket:locked-account';
    const session = sessionWith(ticketId);
    const before = session.engine.graph.getField(ticketId, FIELDS.slaDeadline);

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketAddComment,
        COMPANY_IDS.player,
        ticketId,
        { comment: 'Is it still doing it now?' },
      ),
    ).toEqual({ ok: true });

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketSetWaiting,
        COMPANY_IDS.player,
        ticketId,
        {},
      ),
    ).toEqual({ ok: true });
    session.engine.advance(10);

    expect(session.engine.ticketState(ticketId)).toBe('waiting_on_user');
    expect(session.engine.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(
      typeof before === 'number' ? before + 10 : before,
    );

    // And the clock bites again the moment the ticket comes back to you.
    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketClearWaiting,
        COMPANY_IDS.player,
        ticketId,
        {},
      ),
    ).toEqual({ ok: true });
    session.engine.advance(5);
    expect(session.engine.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(
      typeof before === 'number' ? before + 10 : before,
    );
  });
});
