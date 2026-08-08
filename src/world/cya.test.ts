import { beforeAll, describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from './actions';
import { riskAcceptanceSignedFor } from './change-request';
import { HALCYON_IDS } from './corporate-company';
import { CHANGE_REQUEST_DECISIONS, CHANGE_REQUEST_KINDS, FIELDS } from './fields';
import {
  OVERRIDE_RISK_ACCEPTANCE,
  OVERRIDE_TICKET,
  UNAUTHORISED_OWNER,
} from './override';
import { OVERRIDE_FALLOUT_SUSPICION } from './actions/override';
import { createWorldSession, type WorldSession } from './session';
import { spawnWorldTicket } from './tickets';
import { DayDriver } from '../shell/day-driver';
import { loadEngineForTests } from '../engine-api/load-node';

/**
 * The manager override you cannot refuse (E8, 0.24.0) - the CYA / risk-acceptance
 * gate, driven through the REAL session and the REAL dispatch path.
 *
 * The goal, not the call. The mechanic is that refusing outright AND silently
 * complying BOTH fail, and the win is getting it in writing - so the assertions
 * are about the graph the dispatches leave, not a verb returning ok:
 *
 *  - the order arrives with a risk-acceptance draft (a change_request node, the
 *    0.10.0 artifact reused as the risk_acceptance variant) seeded unsigned;
 *  - REFUSING (granting nothing) does not resolve - the ticket breaches;
 *  - SILENTLY COMPLYING (the bare grant, nothing signed) does not resolve, and
 *    the audit finding lands on the DESK (suspicion charged, owner `unauthorised`);
 *  - the WIN is signing the risk acceptance (the ordering manager's approval on
 *    the change_request) THEN granting - and the finding lands on the SIGNER;
 *  - the gate fails closed BOTH ways (each clause is the whole of what is missing
 *    on its path), and the sign-off attributes the risk (the two paths read
 *    differently at the consequence).
 *
 * Because everything runs against the Halcyon estate through the driver, the
 * fallout the day loop settles fires by itself the moment the grant is on the
 * graph - which is exactly how a player meets it.
 */

beforeAll(() => {
  loadEngineForTests();
});

function corporate(): WorldSession {
  return createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: 'corporate',
  });
}

/** A driver over the session, wired to nothing: this watches the graph. */
function driverFor(session: WorldSession): DayDriver {
  return new DayDriver(session.engine, HALCYON_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });
}

/** The override as a player meets it: spawned, the draft seeded, open. */
function overrideReady(): { session: WorldSession; driver: DayDriver } {
  const session = corporate();
  spawnWorldTicket(session.engine, OVERRIDE_TICKET);
  return { session, driver: driverFor(session) };
}

function field(session: WorldSession, id: string, name: string): unknown {
  return session.engine.graph.getField(id, name);
}

function memberOf(session: WorldSession, account: string, group: string): boolean {
  return session.engine.graph
    .neighbors(account, { direction: 'out', edgeKind: 'member_of' })
    .some((node) => node.id === group);
}

function ticketState(session: WorldSession, id: string): unknown {
  return session.engine.graph.getField(id, FIELDS.state);
}

function suspicion(session: WorldSession): number {
  const value = field(session, HALCYON_IDS.player, FIELDS.suspicion);
  return typeof value === 'number' ? value : Number.NaN;
}

/** Get the ordering manager's signature on the risk acceptance. */
function sign(driver: DayDriver): boolean {
  return driver.dispatch(
    HELPDESK_ACTIONS.riskAcceptanceSign,
    HALCYON_IDS.player,
    OVERRIDE_RISK_ACCEPTANCE,
    {},
  ).ok;
}

/** Do the risky thing: make the contractor a Domain Admin. */
function grant(driver: DayDriver): boolean {
  return driver.dispatch(
    HELPDESK_ACTIONS.accountAddToGroup,
    HALCYON_IDS.player,
    HALCYON_IDS.contractorAccount,
    { group: HALCYON_IDS.domainAdmins },
  ).ok;
}

describe('the order arrives with an unsigned risk acceptance', () => {
  it('seeds the risk-acceptance draft as a change request, unsigned, naming the '
    + 'accepting owner', () => {
    const { session } = overrideReady();

    // The order is open, nothing granted yet.
    expect(ticketState(session, OVERRIDE_TICKET)).not.toBe('resolved');
    expect(memberOf(session, HALCYON_IDS.contractorAccount, HALCYON_IDS.domainAdmins))
      .toBe(false);

    // The artifact is the 0.10.0 change_request node, reused as the variant.
    const draft = session.engine.graph.getNode(OVERRIDE_RISK_ACCEPTANCE);
    expect(draft?.kind).toBe('change_request');
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crKind))
      .toBe(CHANGE_REQUEST_KINDS.riskAcceptance);

    // It names WHO must accept the risk - and is not signed yet.
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crRequiredSigner))
      .toBe(HALCYON_IDS.managerAccount);
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crDecision))
      .toBeUndefined();
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crAcceptedBy))
      .toBeUndefined();
  });
});

describe('the three paths through the real dispatch', () => {
  it('REFUSING outright does not resolve - the ticket breaches unworked', () => {
    const { session } = overrideReady();

    // Nothing granted, nothing signed: the insubordination path. The order stays
    // open and no finding is raised, because nothing was granted to flag.
    expect(ticketState(session, OVERRIDE_TICKET)).not.toBe('resolved');
    expect(field(session, HALCYON_IDS.contractorAccount, FIELDS.overrideFalloutAt))
      .toBeUndefined();
  });

  it('SILENTLY COMPLYING does not resolve, and the finding lands on the desk', () => {
    const { session, driver } = overrideReady();
    const before = suspicion(session);

    // The bare grant with nothing signed.
    expect(grant(driver)).toBe(true);

    // It does not close - the sign-off clause is unmet - so silent compliance
    // fails the ticket.
    expect(ticketState(session, OVERRIDE_TICKET)).not.toBe('resolved');
    expect(memberOf(session, HALCYON_IDS.contractorAccount, HALCYON_IDS.domainAdmins))
      .toBe(true);
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crDecision))
      .toBeUndefined();

    // The audit finding has landed on the DESK: the owner is `unauthorised` and
    // the suspicion is charged to the person who granted it on their own
    // authority.
    expect(field(session, HALCYON_IDS.contractorAccount, FIELDS.incidentOwner))
      .toBe(UNAUTHORISED_OWNER);
    expect(suspicion(session)).toBe(before + OVERRIDE_FALLOUT_SUSPICION);
  });

  it('SIGNING then granting wins, and the finding lands on the signer', () => {
    const { session, driver } = overrideReady();
    const before = suspicion(session);

    // Get it in writing first, then do the risky thing.
    expect(sign(driver)).toBe(true);
    expect(grant(driver)).toBe(true);

    // Both clauses met: the grant is done AND a signed risk acceptance names the
    // accepting owner.
    expect(ticketState(session, OVERRIDE_TICKET)).toBe('resolved');
    expect(memberOf(session, HALCYON_IDS.contractorAccount, HALCYON_IDS.domainAdmins))
      .toBe(true);

    // The signature is on the record - the ordering manager's approval, on the
    // 0.10.0 change_request reused as the artifact.
    const signedNode = session.engine.graph.getNode(OVERRIDE_RISK_ACCEPTANCE);
    expect(signedNode).toBeDefined();
    expect(
      signedNode !== undefined
        && riskAcceptanceSignedFor(signedNode, HALCYON_IDS.contractorAccount),
    ).toBe(true);
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crAcceptedBy))
      .toBe(HALCYON_IDS.managerAccount);

    // The finding is the SIGNER's, and the desk is charged nothing - the CYA is
    // never the thing that is punished.
    expect(field(session, HALCYON_IDS.contractorAccount, FIELDS.incidentOwner))
      .toBe(HALCYON_IDS.managerAccount);
    expect(suspicion(session)).toBe(before);
  });
});

describe('the gate fails closed both ways', () => {
  it('comply-without-sign-off does not resolve - the sign-off is the whole of '
    + 'what is missing', () => {
    // Teeth (a), the comply guard. The grant is made and the ticket does NOT
    // close; add ONLY the sign-off and it closes - so the sign-off clause is
    // load-bearing, and reverting it (dropping the exists on the signed risk
    // acceptance) would let silent compliance wrongly pass.
    const { session, driver } = overrideReady();

    expect(grant(driver)).toBe(true);
    expect(ticketState(session, OVERRIDE_TICKET)).not.toBe('resolved');

    expect(sign(driver)).toBe(true);
    expect(ticketState(session, OVERRIDE_TICKET)).toBe('resolved');
  });

  it('sign-off-without-the-grant does not resolve - the grant is the whole of '
    + 'what is missing', () => {
    // Teeth (a), the refuse guard. The risk acceptance is signed and the ticket
    // does NOT close (paperwork without the work is not the job done); add ONLY
    // the grant and it closes - so the action clause is load-bearing, and
    // reverting it (dropping the member_of edge) would let refusing/paperwork-only
    // wrongly pass.
    const { session, driver } = overrideReady();

    expect(sign(driver)).toBe(true);
    expect(ticketState(session, OVERRIDE_TICKET)).not.toBe('resolved');
    expect(memberOf(session, HALCYON_IDS.contractorAccount, HALCYON_IDS.domainAdmins))
      .toBe(false);

    expect(grant(driver)).toBe(true);
    expect(ticketState(session, OVERRIDE_TICKET)).toBe('resolved');
  });
});

describe('the sign-off attributes the risk', () => {
  it('the signed path and the silent path read DIFFERENTLY at the consequence', () => {
    // Teeth (b). Two worlds, one grant each, and the finding reads differently:
    // the signed grant lands on the accepting owner and charges the desk nothing;
    // the silent grant lands on the desk and charges suspicion. Reverting the
    // attribution (charging regardless, or naming the same owner either way) would
    // make these two reads identical - which is the accountability lost.
    const signedWorld = overrideReady();
    const signedBefore = suspicion(signedWorld.session);
    expect(sign(signedWorld.driver)).toBe(true);
    expect(grant(signedWorld.driver)).toBe(true);

    const silentWorld = overrideReady();
    const silentBefore = suspicion(silentWorld.session);
    expect(grant(silentWorld.driver)).toBe(true);

    // The owner recorded on the finding differs.
    const signedOwner = field(
      signedWorld.session,
      HALCYON_IDS.contractorAccount,
      FIELDS.incidentOwner,
    );
    const silentOwner = field(
      silentWorld.session,
      HALCYON_IDS.contractorAccount,
      FIELDS.incidentOwner,
    );
    expect(signedOwner).toBe(HALCYON_IDS.managerAccount);
    expect(silentOwner).toBe(UNAUTHORISED_OWNER);
    expect(signedOwner).not.toBe(silentOwner);

    // And the suspicion charged differs: none on the signed path, the full charge
    // on the silent one.
    expect(suspicion(signedWorld.session)).toBe(signedBefore);
    expect(suspicion(silentWorld.session)).toBe(silentBefore + OVERRIDE_FALLOUT_SUSPICION);
    expect(suspicion(signedWorld.session)).not.toBe(suspicion(silentWorld.session));
  });

  it('lands the finding once - the latch holds across further dispatch', () => {
    const { session, driver } = overrideReady();

    expect(grant(driver)).toBe(true);
    const charged = suspicion(session);
    expect(field(session, HALCYON_IDS.contractorAccount, FIELDS.overrideFalloutAt))
      .toEqual(expect.any(Number));

    // Another turn of the driver does not re-charge it: once is how often a
    // finding lands.
    expect(sign(driver)).toBe(true);
    expect(suspicion(session)).toBe(charged);
  });
});

describe('signing the risk acceptance', () => {
  it('records the ordering manager\'s approve decision - the reused 0.10.0 '
    + 'signature', () => {
    const { session, driver } = overrideReady();

    expect(sign(driver)).toBe(true);
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crDecision))
      .toBe(CHANGE_REQUEST_DECISIONS.approve);
    expect(field(session, OVERRIDE_RISK_ACCEPTANCE, FIELDS.crAcceptedBy))
      .toBe(HALCYON_IDS.managerAccount);
  });

  it('refuses to sign a risk acceptance that is already signed', () => {
    const { driver } = overrideReady();

    expect(sign(driver)).toBe(true);
    expect(sign(driver)).toBe(false);
  });
});
