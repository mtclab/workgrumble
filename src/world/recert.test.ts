import { beforeAll, describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from './actions';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS } from './fields';
import { RECERT_FOLLOWUP, RECERT_TICKET } from './recert';
import { createWorldSession, type WorldSession } from './session';
import { spawnWorldTicket } from './tickets';
import { DayDriver } from '../shell/day-driver';
import { loadEngineForTests } from '../engine-api/load-node';

/**
 * The Q3 access recertification (E8, 0.23.0), driven through the REAL session and
 * the REAL dispatch path.
 *
 * The goal, not the call. The mechanic is the JUDGEMENT, so the assertions are
 * about the graph the dispatches leave, not about a verb returning ok: the
 * findings are real account/group state (flip one healthy and it has nothing to
 * flag); the correct recert resolves and the careless one does not; the
 * rubber-stamp fails closed (the findings stay live); and killing the load-bearing
 * service account - rather than right-sizing it - fires the broken-job follow-up
 * through the driver, while right-sizing it fires nothing.
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

/** The recert as a player meets it: spawned, findings seeded, open. */
function recertReady(): { session: WorldSession; driver: DayDriver } {
  const session = corporate();
  spawnWorldTicket(session.engine, RECERT_TICKET);
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

function state(session: WorldSession, id: string): unknown {
  return session.engine.graph.getField(id, FIELDS.state);
}

/** Remove one account from one group, through the driver's real dispatch path. */
function removeFromGroup(
  driver: DayDriver,
  account: string,
  group: string,
): boolean {
  return driver.dispatch(
    HELPDESK_ACTIONS.accountRemoveFromGroup,
    HALCYON_IDS.player,
    account,
    { group },
  ).ok;
}

/**
 * The correct recert, as an ordered list of the six decisions. Returned as
 * callables so a test can run all of them, or all-but-one, against the same
 * fresh world.
 */
function correctSteps(driver: DayDriver): readonly (() => boolean)[] {
  return [
    // The leaver, deprovisioned.
    () => driver.dispatch(
      HELPDESK_ACTIONS.accountDisable,
      HALCYON_IDS.player,
      HALCYON_IDS.gordonAccount,
      {},
    ).ok,
    // Privilege creep, stripped - three groups she no longer needs.
    () => removeFromGroup(driver, HALCYON_IDS.margueriteAccount, HALCYON_IDS.salesCrm),
    () => removeFromGroup(driver, HALCYON_IDS.margueriteAccount, HALCYON_IDS.opsShare),
    () => removeFromGroup(driver, HALCYON_IDS.margueriteAccount, HALCYON_IDS.legacyAdmin),
    // The service account, right-sized OUT of Domain Admins (kept in Backup Operators).
    () => removeFromGroup(driver, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins),
    // The SoD conflict, split - one side revoked.
    () => removeFromGroup(driver, HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove),
  ];
}

describe('the recert findings are real account/group state', () => {
  it('seeds every finding live at spawn, and the benign access it must keep', () => {
    const { session } = recertReady();

    // The review is open, with nothing yet flagged.
    expect(state(session, RECERT_TICKET)).not.toBe('resolved');

    // The leaver: still enabled, still in a privileged group.
    expect(field(session, HALCYON_IDS.gordonAccount, FIELDS.enabled)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.gordonAccount, HALCYON_IDS.financeAdmins))
      .toBe(true);

    // Privilege creep: three stale groups, plus the one she legitimately keeps.
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.salesCrm)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.opsShare)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.legacyAdmin)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.finance)).toBe(true);

    // The service account: over-privileged AND load-bearing.
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.backupOperators)).toBe(true);

    // The SoD conflict: both sides at once.
    expect(memberOf(session, HALCYON_IDS.cassAccount, HALCYON_IDS.vendorCreate)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove)).toBe(true);

    // The benign access the same group carries for the person who belongs in it:
    // Neil is genuinely in Sales CRM, which Marguerite only holds by history.
    expect(memberOf(session, HALCYON_IDS.neilAccount, HALCYON_IDS.salesCrm)).toBe(true);
  });

  it('needs every finding worked - leave one out and the review does not close', () => {
    // Teeth (c): each clause tracks a real state. Do all six correct decisions
    // except one, and the review stays open - so no finding can be a decoration,
    // and flipping any one healthy would be what closes it.
    for (let omitted = 0; omitted < 6; omitted += 1) {
      const { session, driver } = recertReady();
      const steps = correctSteps(driver);

      steps.forEach((step, index) => {
        if (index !== omitted) {
          expect(step(), `step ${index}`).toBe(true);
        }
      });

      expect(state(session, RECERT_TICKET), `omitting step ${omitted}`)
        .not.toBe('resolved');
    }
  });
});

describe('the correct recert closes, and raises nothing', () => {
  it('resolves on the six decisions and right-sizes the service account', () => {
    const { session, driver } = recertReady();

    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }

    // The review is signed off, worked line by line.
    expect(state(session, RECERT_TICKET)).toBe('resolved');

    // The leaver is off; the creep is gone; the legit access is KEPT.
    expect(field(session, HALCYON_IDS.gordonAccount, FIELDS.enabled)).toBe(false);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.salesCrm)).toBe(false);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.finance)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.neilAccount, HALCYON_IDS.salesCrm)).toBe(true);

    // The service account is right-sized: out of Domain Admins, still enabled and
    // still in the Backup Operators group its job needs.
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins)).toBe(false);
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.backupOperators)).toBe(true);
    expect(field(session, HALCYON_IDS.svcBackupAccount, FIELDS.enabled)).toBe(true);

    // The SoD conflict is split to exactly one entitlement.
    expect(memberOf(session, HALCYON_IDS.cassAccount, HALCYON_IDS.vendorCreate)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove)).toBe(false);

    // And nothing bit back: honest diligence raises no follow-up.
    expect(session.engine.graph.getNode(RECERT_FOLLOWUP)).toBeUndefined();
  });

  it('blanket-revoke is wrong too - stripping benign access never closes it', () => {
    // Least-privilege is graded: revoke-everything breaks the legitimate access
    // the review must keep. Strip Neil's by-right Sales CRM as part of an
    // over-zealous sweep, then work every finding correctly - the review still
    // does not close, because "benign kept" is a real clause of the rule and a
    // revoked benign membership fails it.
    const { session, driver } = recertReady();

    expect(removeFromGroup(driver, HALCYON_IDS.neilAccount, HALCYON_IDS.salesCrm)).toBe(true);

    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }

    // Every finding is worked, and it STILL does not close: the benign access was
    // broken, so least-privilege was not reached.
    expect(state(session, RECERT_TICKET)).not.toBe('resolved');

    // Put the benign access back and now it closes - proving that one clause was
    // the whole of what stood in the way.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.accountAddToGroup,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      { group: HALCYON_IDS.salesCrm },
    ).ok).toBe(true);
    expect(state(session, RECERT_TICKET)).toBe('resolved');
  });
});

describe('the rubber-stamp fails closed', () => {
  it('leaves every finding live and the review unresolved', () => {
    // Teeth (a): accepting the manager's "just approve them all" records the
    // sign-off and touches NO entitlement, so the review cannot close - revert
    // this (let approve-all satisfy the rule) and the rubber-stamp wrongly passes.
    const { session, driver } = recertReady();

    const stamped = driver.dispatch(
      HELPDESK_ACTIONS.recertApproveAll,
      HALCYON_IDS.player,
      RECERT_TICKET,
      {},
    );
    expect(stamped.ok).toBe(true);

    // The sign-off is on the record - and the review is still open.
    expect(field(session, RECERT_TICKET, FIELDS.recertRubberStamped)).toBe(true);
    expect(state(session, RECERT_TICKET)).not.toBe('resolved');

    // Every finding is exactly as it was: nothing was actually reviewed.
    expect(field(session, HALCYON_IDS.gordonAccount, FIELDS.enabled)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.margueriteAccount, HALCYON_IDS.legacyAdmin)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.cassAccount, HALCYON_IDS.paymentApprove)).toBe(true);
  });

  it('refuses a second stamp on a review already signed', () => {
    const { session, driver } = recertReady();

    expect(driver.dispatch(
      HELPDESK_ACTIONS.recertApproveAll,
      HALCYON_IDS.player,
      RECERT_TICKET,
      {},
    ).ok).toBe(true);

    expect(driver.dispatch(
      HELPDESK_ACTIONS.recertApproveAll,
      HALCYON_IDS.player,
      RECERT_TICKET,
      {},
    ).ok).toBe(false);
    void session;
  });
});

describe('the wrong revoke bites back', () => {
  it('right-sizing the service account raises no follow-up', () => {
    // The clean path: the correct recert leaves the account enabled and in Backup
    // Operators, so the broken-job ticket is never raised.
    const { session, driver } = recertReady();
    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }

    expect(state(session, RECERT_TICKET)).toBe('resolved');
    expect(session.engine.graph.getNode(RECERT_FOLLOWUP)).toBeUndefined();
  });

  it('DISABLING the service account fires the broken-job follow-up', () => {
    // Teeth (b): the over-revoke. The account is correctly taken out of Domain
    // Admins AND carelessly disabled - the review still closes (it is out of
    // Domain Admins) but the load-bearing account is dead, so the driver raises
    // the follow-up. Revert the driver hook and this careless kill costs nothing.
    const { session, driver } = recertReady();
    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }
    expect(state(session, RECERT_TICKET)).toBe('resolved');

    expect(driver.dispatch(
      HELPDESK_ACTIONS.accountDisable,
      HALCYON_IDS.player,
      HALCYON_IDS.svcBackupAccount,
      {},
    ).ok).toBe(true);

    // The broken-job ticket is now in the world, open.
    expect(session.engine.graph.getNode(RECERT_FOLLOWUP)).toBeDefined();
    expect(state(session, RECERT_FOLLOWUP)).toBe('open');
  });

  it('STRIPPING the job group also fires the follow-up', () => {
    // The other way to kill it: right-size out of Domain Admins, then also take
    // the account out of the Backup Operators group its job actually needs.
    const { session, driver } = recertReady();
    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }
    expect(state(session, RECERT_TICKET)).toBe('resolved');

    expect(removeFromGroup(
      driver,
      HALCYON_IDS.svcBackupAccount,
      HALCYON_IDS.backupOperators,
    )).toBe(true);

    expect(session.engine.graph.getNode(RECERT_FOLLOWUP)).toBeDefined();
    expect(state(session, RECERT_FOLLOWUP)).toBe('open');
  });

  it('the follow-up closes by restoring the access right-sized', () => {
    // The fix, and the whole lesson: put the account back the way the recert
    // should have left it - enabled and in Backup Operators - and NOT back in
    // Domain Admins.
    const { session, driver } = recertReady();
    for (const step of correctSteps(driver)) {
      expect(step()).toBe(true);
    }
    driver.dispatch(
      HELPDESK_ACTIONS.accountDisable,
      HALCYON_IDS.player,
      HALCYON_IDS.svcBackupAccount,
      {},
    );
    expect(session.engine.graph.getNode(RECERT_FOLLOWUP)).toBeDefined();

    // The follow-up normalises the account to fully broken, so both moves are
    // needed: re-enable it, and return it to Backup Operators.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.accountEnable,
      HALCYON_IDS.player,
      HALCYON_IDS.svcBackupAccount,
      {},
    ).ok).toBe(true);
    expect(state(session, RECERT_FOLLOWUP)).toBe('open');

    expect(driver.dispatch(
      HELPDESK_ACTIONS.accountAddToGroup,
      HALCYON_IDS.player,
      HALCYON_IDS.svcBackupAccount,
      { group: HALCYON_IDS.backupOperators },
    ).ok).toBe(true);

    // Restored, and still right-sized: back in Backup Operators, NOT in Domain Admins.
    expect(state(session, RECERT_FOLLOWUP)).toBe('resolved');
    expect(field(session, HALCYON_IDS.svcBackupAccount, FIELDS.enabled)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.backupOperators)).toBe(true);
    expect(memberOf(session, HALCYON_IDS.svcBackupAccount, HALCYON_IDS.domainAdmins)).toBe(false);
  });
});
