import { beforeAll, describe, expect, it } from 'vitest';

import { DELEGATE_PARAM, HELPDESK_ACTIONS, RULE_PARAM } from './actions';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS } from './fields';
import { mailboxDelegate, mailboxRules } from './mailbox';
import { createWorldSession, type WorldSession } from './session';
import { spawnWorldTicket } from './tickets';
import { BEC_MALICIOUS_RULE } from './tickets/corporate';
import { DayDriver } from '../shell/day-driver';
import { loadEngineForTests } from '../engine-api/load-node';

/**
 * The BEC incident - Pass B of the org-dysfunction epic (E8, 0.22.0), driven
 * through the REAL chain and the REAL dispatch path.
 *
 * The goal, not the call. The con is the point, so the assertions are about the
 * con: the incident only fires when the exec was actually exempted (the delegate
 * granted); the persistence the hunt finds IS the delegate the player granted,
 * the same node; and the incident does not close until the forwarding rule is
 * removed - a password reset leaves it running, which is the exact bug the rule
 * clause exists to forbid. Each teeth runs the mechanic backwards: skip a step,
 * or reach for the reset instead of the hunt, and the fire is still burning.
 */

const BEC = 'ticket:halcyon-ceo-bec';
const DELEGATE_TICKET = 'ticket:halcyon-ea-delegate';

beforeAll(() => {
  loadEngineForTests();
});

/** A fresh corporate week, the way a first day at Halcyon stands up. */
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

/**
 * Raise the BEC the way the game does: grant the EA delegate through the real
 * driver, which closes the delegate ticket and raises the follower in the same
 * minute. This is the only state a player can meet the incident in - the one
 * where the exemption has actually been granted.
 */
function raiseBec(session: WorldSession): void {
  const driver = driverFor(session);
  spawnWorldTicket(session.engine, DELEGATE_TICKET);

  const granted = driver.dispatch(
    HELPDESK_ACTIONS.accountGrantMailboxDelegate,
    HALCYON_IDS.player,
    HALCYON_IDS.ceoAccount,
    { [DELEGATE_PARAM]: HALCYON_IDS.eaAccount },
  );
  expect(granted.ok).toBe(true);
}

function field(session: WorldSession, id: string, name: string): unknown {
  return session.engine.graph.getField(id, name);
}

function disable(session: WorldSession): void {
  expect(session.engine.dispatch(
    HELPDESK_ACTIONS.accountDisable,
    HALCYON_IDS.player,
    HALCYON_IDS.ceoAccount,
    {},
  ).ok).toBe(true);
}

function revoke(session: WorldSession): boolean {
  return session.engine.dispatch(
    HELPDESK_ACTIONS.accountRevokeSessions,
    HALCYON_IDS.player,
    HALCYON_IDS.ceoAccount,
    {},
  ).ok;
}

function removeRule(session: WorldSession): boolean {
  return session.engine.dispatch(
    HELPDESK_ACTIONS.accountRemoveMailboxRule,
    HALCYON_IDS.player,
    HALCYON_IDS.ceoAccount,
    { [RULE_PARAM]: BEC_MALICIOUS_RULE },
  ).ok;
}

function removeDelegate(session: WorldSession): void {
  expect(session.engine.dispatch(
    HELPDESK_ACTIONS.accountRemoveMailboxDelegate,
    HALCYON_IDS.player,
    HALCYON_IDS.ceoAccount,
    {},
  ).ok).toBe(true);
}

describe('the BEC incident fires on the exempted exec, and only then', () => {
  it('is raised by the delegate grant - the exemption is what keys it', () => {
    const session = corporate();
    // Nothing granted yet: no delegate, no incident. The con has not been set.
    expect(session.engine.graph.getNode(BEC)).toBeUndefined();

    raiseBec(session);

    // The grant closed the delegate ticket and raised the incident, seeded with
    // the two things a password reset cannot touch.
    expect(session.engine.ticketState(DELEGATE_TICKET)).toBe('resolved');
    expect(session.engine.graph.getNode(BEC)).toBeDefined();
    expect(session.engine.ticketState(BEC)).toBe('open');
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.sessionLive)).toBe(true);
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.mailboxRules))
      .toBe(BEC_MALICIOUS_RULE);
  });

  it('does not exist while no exemption has been granted', () => {
    // A desk that refused the delegate never sees this incident: the fire is
    // keyed on the exec being exempted, so declining the exception dodges it.
    const session = corporate();
    expect(session.engine.graph.getNode(BEC)).toBeUndefined();
    expect(session.engine.ticketState(BEC)).not.toBe('open');
  });
});

describe('the hunt surface shows what a reset would not', () => {
  it('lists the malicious forwarding rule and the delegate persistence', () => {
    const session = corporate();
    raiseBec(session);

    const rules = mailboxRules(session.engine.graph, HALCYON_IDS.ceoAccount);
    expect(rules).toHaveLength(1);
    // The real BEC shape: forward finance mail to an external address, mark it
    // read, and hide it in Deleted.
    expect(rules[0]?.action).toContain('forward');
    expect(rules[0]?.target).toContain('@');
    expect(rules[0]?.raw).toBe(BEC_MALICIOUS_RULE);

    // Teeth (b): the persistence the hunt finds IS the delegate the player
    // granted - the same account node, the slice-2 grant and the slice-3 find.
    expect(mailboxDelegate(session.engine.graph, HALCYON_IDS.ceoAccount))
      .toBe(HALCYON_IDS.eaAccount);
  });
});

describe('the ordered response resolves the incident', () => {
  it('closes on disable -> revoke -> remove rule -> remove delegate', () => {
    const session = corporate();
    raiseBec(session);

    disable(session);
    expect(session.engine.ticketState(BEC)).toBe('open');
    expect(revoke(session)).toBe(true);
    expect(session.engine.ticketState(BEC)).toBe('open');
    expect(removeRule(session)).toBe(true);
    expect(session.engine.ticketState(BEC)).toBe('open');
    removeDelegate(session);

    // Only the fourth verb, on top of the other three, closes it.
    expect(session.engine.ticketState(BEC)).toBe('resolved');
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.enabled)).toBe(false);
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.sessionLive)).toBe(false);
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.mailboxRules))
      .toBeUndefined();
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.mailboxDelegate))
      .toBeUndefined();
  });
});

describe('the teeth: the forward survives a password reset', () => {
  it('a password reset stops neither the forward nor the session', () => {
    // The exact bug the rule clause forbids: reach for the reflex fix - RESET
    // THE PASSWORD - and it changes the credential and nothing the attacker
    // left. The forward keeps forwarding and the stolen session stays live, both
    // from inside an account whose password has just been "fixed".
    const session = corporate();
    raiseBec(session);

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.accountResetPassword,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    ).ok).toBe(true);

    // The reset landed - and the two things that actually run the fraud are
    // untouched, so the incident is still open.
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.passwordResetAt))
      .toBeDefined();
    expect(session.engine.ticketState(BEC)).toBe('open');
    expect(mailboxRules(session.engine.graph, HALCYON_IDS.ceoAccount))
      .toHaveLength(1);
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.mailboxRules))
      .toBe(BEC_MALICIOUS_RULE);
    expect(field(session, HALCYON_IDS.ceoAccount, FIELDS.sessionLive)).toBe(true);

    // The real response, on top of the reset, is what closes it - and pulling
    // the rule is the step the reset could never stand in for.
    disable(session);
    expect(revoke(session)).toBe(true);
    expect(session.engine.ticketState(BEC)).toBe('open');
    expect(removeRule(session)).toBe(true);
    removeDelegate(session);
    expect(session.engine.ticketState(BEC)).toBe('resolved');
  });

  it('stays open when any single ordered step is skipped', () => {
    // Necessity, said plainly per step: leave one out, the fire burns on.
    for (const skip of ['disable', 'revoke', 'rule', 'delegate'] as const) {
      const session = corporate();
      raiseBec(session);

      if (skip !== 'disable') {
        disable(session);
      }
      if (skip !== 'revoke') {
        expect(revoke(session)).toBe(true);
      }
      if (skip !== 'rule') {
        expect(removeRule(session)).toBe(true);
      }
      if (skip !== 'delegate') {
        removeDelegate(session);
      }

      expect(session.engine.ticketState(BEC), `skipping ${skip}`).toBe('open');
    }
  });
});

describe('the revoke verb: the wrong-flavour refusal, made precise', () => {
  it('still refuses a live, un-MFA account (the lost-authenticator trap holds)', () => {
    // The preserved trap: an ordinary account with its second factor gone and
    // nobody containing it - revoking signs its owner out of their only way in.
    const session = corporate();
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    ).ok).toBe(true);

    const refused = session.engine.dispatch(
      HELPDESK_ACTIONS.accountRevokeSessions,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    );
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('new enrolment');
  });

  it('allows the revoke once the account is disabled (the BEC case)', () => {
    // The refinement: on a contained account there is no legitimate user to lock
    // out, so the fix for a session somebody else is holding is exactly right.
    const session = corporate();
    session.engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    );
    session.engine.dispatch(
      HELPDESK_ACTIONS.accountDisable,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    );

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.accountRevokeSessions,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    ).ok).toBe(true);
  });
});

describe('the remove-rule verb names the rule it pulls', () => {
  it('refuses a mailbox that does not carry the named rule', () => {
    // Read the mailbox, remove the rule that is actually there - a rule you
    // cannot see is a rule you cannot pull.
    const session = corporate();
    raiseBec(session);

    const refused = session.engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMailboxRule,
      HALCYON_IDS.player,
      HALCYON_IDS.cfoAccount,
      { [RULE_PARAM]: BEC_MALICIOUS_RULE },
    );
    expect(refused.ok).toBe(false);
  });
});
