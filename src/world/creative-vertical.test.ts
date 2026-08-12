/**
 * The creative agency's three mechanics, each with the check that makes it real
 * (0.32.0, E5 slice 2, #54 lane B).
 *
 * MARLOWE-STUDIO is the first estate in this game whose desks are not Windows,
 * and the vertical exists to teach the three things a Windows-shaped desk gets
 * wrong about a Mac shop. Each of them is a claim the world has to keep, so each
 * of them is asserted here where reverting it goes red:
 *
 *  - a CONSENT the desk cannot grant. `mdm.push_profile` refuses a managed Mac
 *    the Screen Recording approval, by name and for the true reason, and it
 *    refuses it whether the consent is currently held or not - because what is
 *    being refused is the CAPABILITY of a profile, not a state of the box.
 *    Teeth: drop the guard in `vip.ts` and the push either succeeds (writing a
 *    mail-profile field onto a workstation) or refuses with the kind quibble,
 *    and three assertions here go red.
 *  - a WORDING. Gatekeeper's refusal is quoted verbatim from the spike on the
 *    surfaces a player reads - the ticket and the article - because the whole
 *    skill being taught is reading the sentence and knowing what it claims.
 *    Teeth: paraphrase it anywhere and this goes red.
 *  - a SEAT that is attached to a person. The expiry is real state on the
 *    account and on the pool, so the shipped licensing verbs refuse it exactly
 *    as they refuse a full pool in-house - and moving a colleague's seat across
 *    does NOT close the ticket, because moving a problem is not solving it.
 *    Teeth: seed the seat back and the refusal disappears with it.
 *
 * Engine-level, through the real registry and the real world. The terminal half
 * of the seat trap - what a player actually types - is in `msp-scope.test.ts`,
 * beside every other MSP proof that goes through `executeCommand`.
 */

import { describe, expect, it } from 'vitest';

import type { DispatchResult } from '../engine-api';
import { HELPDESK_ACTIONS, SEATS_PARAM } from './actions';
import {
  FIELDS,
  MACHINE_OS,
  SERVICE_SCOPES,
  SLA_TIERS,
} from './fields';
import { findKbArticle } from './kb';
import { MSP_CUSTOMERS, MSP_IDS } from './msp-company';
import { createWorldSession, type WorldSession } from './session';
import { findWorldTicket, spawnWorldTicket } from './tickets';
import { unitIdOn } from './services';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

/** The exact macOS refusal, from `docs/research/mac-edition.md` section 4. */
const GATEKEEPER_LINE_ONE = 'cannot be opened because the developer cannot be '
  + 'verified.';
const GATEKEEPER_LINE_TWO = 'macOS cannot verify that this app is free from '
  + 'malware.';

/** The sentence a refusal gave, or the empty string if it did not refuse. */
function refusalOf(result: DispatchResult): string {
  return result.ok ? '' : result.reason;
}

function studio(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession(MSP_CARRY);

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
}

describe('MARLOWE-STUDIO, as an estate', () => {
  it('is Macs on the desks, a Linux NAS behind them, and a fully-managed contract', () => {
    const { graph } = studio().engine;

    const customer = graph.getNode(MSP_CUSTOMERS.marlowe);
    expect(customer?.fields[FIELDS.customerServiceScope])
      .toBe(SERVICE_SCOPES.fullyManaged);
    // Silver, and it is the first fully-managed customer that is not Gold: a
    // studio missing a delivery is worth paying above Bronze for and is not a
    // surgery with a patient in the chair.
    expect(customer?.fields[FIELDS.customerSlaTier]).toBe(SLA_TIERS.silver);

    for (const id of [
      MSP_IDS.marloweDesignMac,
      MSP_IDS.marloweEditMac,
      MSP_IDS.marloweStudioMac,
    ]) {
      const mac = graph.getNode(id);
      expect(mac?.fields[FIELDS.machineOs], id).toBe(MACHINE_OS.mac);
      // Managed at fleet grain, which is what makes the Screen Recording
      // refusal a statement about profiles rather than about enrolment.
      expect(mac?.fields[FIELDS.mdmEnrolled], id).toBe(true);
      // And the support tool can see them: the studio is a customer, not a
      // permanent outage.
      expect(mac?.fields[FIELDS.tccScreenRecording], id).toBe(true);
    }

    // The box the work is actually on. Linux, because a project NAS is, and
    // serving SMB, because that is what a Mac mounts.
    const nas = graph.getNode(MSP_IDS.marloweNas);
    expect(nas?.fields[FIELDS.machineOs]).toBe(MACHINE_OS.linux);
    expect(graph.getNode(unitIdOn(MSP_IDS.marloweNas, 'smbd.service')))
      .toBeDefined();
    expect(graph.getNode(MSP_IDS.marloweProjectShare)?.fields[FIELDS.path])
      .toBe('smb://marl-nas-01/projects');
  });
});

describe('the Screen Recording consent no console can push', () => {
  it('refuses the MDM push on a managed Mac, and says which consent and why', () => {
    const session = studio('ticket:marlowe-screen-recording');
    const { graph } = session.engine;

    // The ticket took the consent away, and nothing else about the Mac moved.
    expect(graph.getField(MSP_IDS.marloweDesignMac, FIELDS.tccScreenRecording))
      .toBe(false);
    expect(graph.getField(MSP_IDS.marloweDesignMac, FIELDS.mdmEnrolled))
      .toBe(true);

    const pushed = session.engine.dispatch(
      HELPDESK_ACTIONS.mdmPushProfile,
      MSP_IDS.player,
      MSP_IDS.marloweDesignMac,
      {},
    );

    expect(pushed.ok).toBe(false);
    // The refusal names the thing that cannot be pushed, the thing that CAN
    // (which is the half that makes it knowledge rather than a wall), and where
    // the person has to click instead.
    expect(refusalOf(pushed)).toContain('Screen Recording');
    expect(refusalOf(pushed)).toContain('Accessibility');
    expect(refusalOf(pushed)).toContain('Privacy & Security');
    // Teeth on the whole shape of it: the box is enrolled, so this is NOT the
    // shipped shadow-IT refusal wearing a new hat.
    expect(refusalOf(pushed)).not.toContain('not enrolled in device management');

    // And nothing was written. A push that fell through to the shipped apply
    // would have marked a WORKSTATION's mail profile healthy, which is the
    // quiet wrongness the guard's position in the list exists to prevent.
    expect(graph.getField(MSP_IDS.marloweDesignMac, FIELDS.tccScreenRecording))
      .toBe(false);
    expect(graph.getField(MSP_IDS.marloweDesignMac, FIELDS.mailProfileOk))
      .toBeUndefined();
  });

  it('refuses it on a Mac that already HAS the consent, because the limit is the same', () => {
    // The lesson is what a management profile can carry, and that does not
    // change with the current value of the consent. A guard keyed on "false"
    // would have read as a fault-specific special case and would have let a
    // push at any other Mac write a mail field onto a workstation.
    const session = studio();

    expect(session.engine.graph.getField(
      MSP_IDS.marloweEditMac,
      FIELDS.tccScreenRecording,
    )).toBe(true);

    const pushed = session.engine.dispatch(
      HELPDESK_ACTIONS.mdmPushProfile,
      MSP_IDS.player,
      MSP_IDS.marloweEditMac,
      {},
    );

    expect(pushed.ok).toBe(false);
    expect(refusalOf(pushed)).toContain('Screen Recording');
    expect(session.engine.graph.getField(
      MSP_IDS.marloweEditMac,
      FIELDS.mailProfileOk,
    )).toBeUndefined();
  });

  it('closes on the walkthrough, which is the only place the fix can happen', () => {
    const session = studio('ticket:marlowe-screen-recording');

    expect(session.engine.ticketState('ticket:marlowe-screen-recording'))
      .toBe('open');

    const replied = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      MSP_IDS.player,
      'ticket:marlowe-screen-recording',
      {
        comment: 'System Settings > Privacy & Security > Screen Recording, tick '
          + 'the support tool, and let it reopen. We cannot switch it on from '
          + 'here - macOS keeps that one for the person at the Mac.',
      },
    );

    expect(replied.ok).toBe(true);
    expect(session.engine.ticketState('ticket:marlowe-screen-recording'))
      .toBe('resolved');
  });
});

describe('the Gatekeeper refusal, quoted rather than paraphrased', () => {
  it('puts the exact macOS wording on the ticket the player reads', () => {
    const entry = findWorldTicket('ticket:marlowe-gatekeeper-plugin');
    const body = entry?.def.flavor.body ?? '';

    expect(body).toContain(GATEKEEPER_LINE_ONE);
    expect(body).toContain(GATEKEEPER_LINE_TWO);
  });

  it('puts it on the article too, and teaches the override rather than the switch', () => {
    const article = findKbArticle('kb/gatekeeper-unnotarized');

    expect(article).toBeDefined();
    expect(article?.issue).toContain(GATEKEEPER_LINE_ONE);
    expect(article?.issue).toContain(GATEKEEPER_LINE_TWO);

    const prose = [
      article?.summary ?? '',
      ...(article?.resolution ?? []),
      ...(article?.cause ?? []),
    ].join('\n');

    // The learning claim, in three parts: what notarization IS, that the
    // override is a supported path for software you trust, and that turning
    // Gatekeeper off to open one file is the wrong trade.
    expect(prose).toContain('Notarization is Apple\'s automated malware scan');
    expect(prose).toMatch(/reason to trust/u);
    expect(prose).toMatch(/Do not disable Gatekeeper/u);
    // And it does not invent a dialog. The article quotes exactly two macOS
    // sentences and both are the ones the spike verified - the refusal and its
    // other-build variant - so a third quotation would be somebody writing
    // Apple's copy for it.
    expect(article?.issue).toContain('because Apple cannot check it for '
      + 'malicious software.');
    expect((article?.issue ?? '').split('"')).toHaveLength(5);
  });

  it('closes when the studio has been told what the message means', () => {
    const session = studio('ticket:marlowe-gatekeeper-plugin');

    // Nothing is wedged: Gatekeeper is doing its job, so there is no state to
    // repair and a ticket that arrived already solved would be the commonest
    // way a rewritten setup goes wrong.
    expect(session.engine.ticketState('ticket:marlowe-gatekeeper-plugin'))
      .toBe('open');

    const replied = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      MSP_IDS.player,
      'ticket:marlowe-gatekeeper-plugin',
      {
        comment: 'It is unnotarized, not malware. Right-click the plugin in '
          + 'Finder, choose Open and confirm - and please leave Gatekeeper on.',
      },
    );

    expect(replied.ok).toBe(true);
    expect(session.engine.ticketState('ticket:marlowe-gatekeeper-plugin'))
      .toBe('resolved');
  });
});

describe('the Named User seat that followed the person', () => {
  it('seeds the expiry as real state on the person and on the plan', () => {
    const session = studio('ticket:marlowe-seat-expired');
    const { graph } = session.engine;

    // The seat is attached to a PERSON, and this person has not got one.
    expect(graph.getField(MSP_IDS.marloweFreelancerAccount, FIELDS.licence))
      .toBe(false);
    // The plan is fully subscribed, and its seats are held by designers who are
    // working - which is what makes "just give him one" refusable and "take
    // one off Corin" a decision rather than a fix.
    expect(graph.getField(MSP_IDS.marloweSuiteSeats, FIELDS.seatsFree)).toBe(0);
    expect(graph.getField(MSP_IDS.marloweDesignerAccount, FIELDS.licence))
      .toBe(true);
  });

  it('refuses the assign while the plan is full, and does not close on a seat moved across', () => {
    const session = studio('ticket:marlowe-seat-expired');

    const assigned = session.engine.dispatch(
      HELPDESK_ACTIONS.accountAssignLicence,
      MSP_IDS.player,
      MSP_IDS.marloweFreelancerAccount,
      { [SEATS_PARAM]: MSP_IDS.marloweSuiteSeats },
    );

    // The shipped licensing guard, refusing for the true reason. Teeth: seed a
    // free seat (or leave the freelancer holding one) and this goes green.
    expect(assigned.ok).toBe(false);
    expect(refusalOf(assigned)).toContain('no free seats');
    expect(session.engine.ticketState('ticket:marlowe-seat-expired'))
      .toBe('open');

    // Nothing STOPS a desk taking a working designer's seat and handing it
    // over - the same way nothing stops the rubber-stamp - and it does not
    // close this, because the studio's problem has been moved rather than
    // solved. The article says so in as many words.
    session.engine.dispatch(
      HELPDESK_ACTIONS.accountRevokeLicence,
      MSP_IDS.player,
      MSP_IDS.marloweDesignerAccount,
      { [SEATS_PARAM]: MSP_IDS.marloweSuiteSeats },
    );
    const moved = session.engine.dispatch(
      HELPDESK_ACTIONS.accountAssignLicence,
      MSP_IDS.player,
      MSP_IDS.marloweFreelancerAccount,
      { [SEATS_PARAM]: MSP_IDS.marloweSuiteSeats },
    );

    expect(moved.ok).toBe(true);
    expect(session.engine.ticketState('ticket:marlowe-seat-expired'))
      .toBe('open');
  });

  it('closes on the raise to the licensing desk', () => {
    const session = studio('ticket:marlowe-seat-expired');

    const escalated = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:marlowe-seat-expired',
      {
        reported: 'Named User seat for lvasquez is not active; creative suite '
          + 'will not open.',
        tried: 'Sign-out/in and a second Mac, both by the studio - a Named User '
          + 'seat follows the person\nPool shows 0 free: no seat to assign and '
          + 'none to take back without blocking a working designer',
      },
    );

    expect(escalated.ok).toBe(true);
    expect(session.engine.ticketState('ticket:marlowe-seat-expired'))
      .toBe('resolved');
  });
});
