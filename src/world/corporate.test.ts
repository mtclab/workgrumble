import { describe, expect, it } from 'vitest';

import { DELEGATE_PARAM, HELPDESK_ACTIONS } from './actions';
import { HALCYON_IDS } from './corporate-company';
import {
  EMPLOYER_IDS,
  employerFor,
  employerName,
  nextEmployerAfter,
} from './employers';
import { FIELDS } from './fields';
import { createWorldSession, FIRST_WEEK, type WeekCarry } from './session';
import { findWorldTicket, spawnWorldTicket } from './tickets';
import { WasmEngine } from '../engine-api';

/**
 * The corporate employer, and the VIP exception - Pass A of the org-dysfunction
 * epic (E8, 0.22.0), driven through the REAL session/dispatch path.
 *
 * The goal, not the call: it is not enough that a grant verb returns ok. The
 * account has to ARRIVE in the exempted state a later BEC incident reads back -
 * the second factor gone, the delegate on, the filter off - so the assertions
 * read the graph the dispatch left, and the teeth run the grant backwards (leave
 * it out, and the state does not move; the ticket does not close).
 */

const CEO_MFA_TICKET = 'ticket:halcyon-ceo-mfa-off';
const EA_DELEGATE_TICKET = 'ticket:halcyon-ea-delegate';
const CEO_FILTER_TICKET = 'ticket:halcyon-ceo-filter';

/** A fresh corporate week, the way a first day at Halcyon stands up. */
function corporate(): ReturnType<typeof createWorldSession> {
  return createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: 'corporate',
  });
}

/** The carry a switch INTO the corporate employer produces (session-layer). */
function switchIntoCorporate(): WeekCarry {
  return {
    farmFund: 25_000,
    attempt: 1,
    arcWeek: 1,
    employer: 'corporate',
    reputation: 66,
    title: 'Systems Engineer',
  };
}

function field(
  engine: { graph: { getField(id: string, field: string): unknown } },
  id: string,
  name: string,
): unknown {
  return engine.graph.getField(id, name);
}

describe('the corporate employer is reachable via the 0.6.0 switch', () => {
  it('is the destination after the MSP, and moves no earlier transition', () => {
    // Appended to the closed set, so every existing hop is unmoved and only the
    // MSP's placeholder wrap becomes a real destination.
    expect(nextEmployerAfter('workgrumble')).toBe('bodgeworth');
    expect(nextEmployerAfter('bodgeworth')).toBe('msp');
    expect(nextEmployerAfter('msp')).toBe('corporate');
    expect(EMPLOYER_IDS).toContain('corporate');
  });

  it('resolves on the registry with a name the offer screen can print', () => {
    const employer = employerFor('corporate');
    expect(employer.id).toBe('corporate');
    expect(employer.name).toBe('Halcyon Grange Holdings');
    expect(employerName('corporate')).toBe(employer.name);
  });

  it('stands its estate up when a career switches into it', () => {
    // The goal: a second (fourth) employer's world stood up, seeded FROM the
    // carried career rather than fresh. The exec estate is real - the CEO's
    // account is there, enrolled like the enterprise it is - and the standing
    // walked in with the player.
    const arrival = createWorldSession(switchIntoCorporate());
    expect(arrival.employer).toBe('corporate');

    const engine = arrival.engine as WasmEngine;
    expect(field(engine, HALCYON_IDS.player, FIELDS.reputation)).toBe(66);
    expect(field(engine, HALCYON_IDS.player, FIELDS.title)).toBe('Systems Engineer');
    expect(field(engine, HALCYON_IDS.player, FIELDS.farmFund)).toBe(25_000);

    // The exec estate: the CEO exists, enrolled in the MFA everybody is on -
    // which is what makes the exception a hole removed from a wall.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.username))
      .toBe('rcushingvane');
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mfaEnrolled)).toBe(true);

    // A fresh probationer would NOT be at 66, and would not have a CEO to
    // support: the carry and the estate are what make the two different worlds.
    const fresh = createWorldSession(FIRST_WEEK).engine as WasmEngine;
    expect(field(fresh, HALCYON_IDS.player, FIELDS.reputation)).not.toBe(66);
    expect(fresh.snapshotHash()).not.toBe(engine.snapshotHash());
  });
});

describe('the VIP exception is a real action that sets world state', () => {
  it('takes the second factor off the CEO and closes the ticket', () => {
    const { engine } = corporate();

    // Before: the enterprise default - the CEO is enrolled, the ticket is open.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mfaEnrolled)).toBe(true);
    expect(field(engine, CEO_MFA_TICKET, FIELDS.state)).not.toBe('resolved');

    const done = engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    );
    expect(done.ok).toBe(true);

    // After: the exception granted - the state a later BEC incident lands on -
    // and the ticket the exec was pressing about is closed.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mfaEnrolled)).toBe(false);
    expect(field(engine, CEO_MFA_TICKET, FIELDS.state)).toBe('resolved');
  });

  it('grants the EA a mailbox delegate, naming her account, and closes it', () => {
    const { engine } = corporate();
    spawnWorldTicket(engine, EA_DELEGATE_TICKET);

    // Before: nobody else on the mailbox.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mailboxDelegate))
      .toBeUndefined();

    const done = engine.dispatch(
      HELPDESK_ACTIONS.accountGrantMailboxDelegate,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      { [DELEGATE_PARAM]: HALCYON_IDS.eaAccount },
    );
    expect(done.ok).toBe(true);

    // After: the FullAccess delegate, naming the EA - the persistence vector a
    // later inbox-rule hunt reads. The grant and the find are the same node.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mailboxDelegate))
      .toBe(HALCYON_IDS.eaAccount);
    expect(field(engine, EA_DELEGATE_TICKET, FIELDS.state)).toBe('resolved');
  });

  it('takes the CEO off the mail filter and closes the ticket', () => {
    const { engine } = corporate();
    spawnWorldTicket(engine, CEO_FILTER_TICKET);

    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.filterExempt)).toBe(false);

    const done = engine.dispatch(
      HELPDESK_ACTIONS.accountSetFilterExempt,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    );
    expect(done.ok).toBe(true);

    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.filterExempt)).toBe(true);
    expect(field(engine, CEO_FILTER_TICKET, FIELDS.state)).toBe('resolved');
  });
});

describe('the grant is the ONLY close - refusing forfeits the VIP ticket', () => {
  it('leaves the ticket open and the account unchanged when not granted', () => {
    // The teeth on "revert the grant -> unchanged": with no grant dispatched,
    // the CEO stays enrolled and the ticket the exec is pressing about stays
    // open - which is the social cost of refusing, an unworked VIP ticket left
    // to breach its clock on the account most able to make it hurt.
    const { engine } = corporate();
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mfaEnrolled)).toBe(true);
    expect(field(engine, CEO_MFA_TICKET, FIELDS.state)).not.toBe('resolved');
  });

  it('is not closed by an unrelated grant on another account', () => {
    // Each exception is its own decision on its own node: taking MFA off a
    // different account does not close the CEO's ticket, so a VIP exception
    // cannot be waved shut by any verb but the one that opens its hole.
    const { engine } = corporate();
    const done = engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.neilAccount,
      {},
    );
    expect(done.ok).toBe(true);
    expect(field(engine, CEO_MFA_TICKET, FIELDS.state)).not.toBe('resolved');
  });
});

describe('the grant verbs guard against a no-op, the way enrolment does', () => {
  it('refuses to remove a second factor that is not there', () => {
    const { engine } = corporate();
    expect(engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    ).ok).toBe(true);

    // Second time: there is nothing to take off, and it says so rather than
    // writing the same state twice.
    const again = engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    );
    expect(again.ok).toBe(false);
  });

  it('refuses a second delegate over the top of the first', () => {
    const { engine } = corporate();
    expect(engine.dispatch(
      HELPDESK_ACTIONS.accountGrantMailboxDelegate,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      { [DELEGATE_PARAM]: HALCYON_IDS.eaAccount },
    ).ok).toBe(true);

    const again = engine.dispatch(
      HELPDESK_ACTIONS.accountGrantMailboxDelegate,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      { [DELEGATE_PARAM]: HALCYON_IDS.bronwenAccount },
    );
    expect(again.ok).toBe(false);
    // And the first delegate is untouched - the refusal did not overwrite it.
    expect(field(engine, HALCYON_IDS.ceoAccount, FIELDS.mailboxDelegate))
      .toBe(HALCYON_IDS.eaAccount);
  });

  it('refuses to exempt a mailbox that is already off the filter', () => {
    const { engine } = corporate();
    expect(engine.dispatch(
      HELPDESK_ACTIONS.accountSetFilterExempt,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    ).ok).toBe(true);

    expect(engine.dispatch(
      HELPDESK_ACTIONS.accountSetFilterExempt,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    ).ok).toBe(false);
  });
});

describe('the account/mailbox model round-trips a save', () => {
  it('carries the granted exceptions through serialize and restore', () => {
    const { engine } = corporate();
    spawnWorldTicket(engine, EA_DELEGATE_TICKET);

    engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveMfa,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    );
    engine.dispatch(
      HELPDESK_ACTIONS.accountGrantMailboxDelegate,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      { [DELEGATE_PARAM]: HALCYON_IDS.eaAccount },
    );
    engine.dispatch(
      HELPDESK_ACTIONS.accountSetFilterExempt,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoAccount,
      {},
    );

    const wasm = engine as WasmEngine;
    const saved = wasm.serialize();
    const granted = wasm.snapshotHash();

    // A fresh engine that restores the save must come back to the exact granted
    // world - the three new account fields included, or the hash would differ.
    const reloaded = new WasmEngine(0);
    reloaded.restore(saved);

    expect(reloaded.snapshotHash()).toBe(granted);
    expect(field(reloaded, HALCYON_IDS.ceoAccount, FIELDS.mfaEnrolled)).toBe(false);
    expect(field(reloaded, HALCYON_IDS.ceoAccount, FIELDS.mailboxDelegate))
      .toBe(HALCYON_IDS.eaAccount);
    expect(field(reloaded, HALCYON_IDS.ceoAccount, FIELDS.filterExempt)).toBe(true);

    // Teeth: a world where the exceptions were never granted does NOT restore to
    // the same hash - so the round-trip is carrying the granted state, not a
    // constant.
    const ungranted = corporate().engine as WasmEngine;
    expect(ungranted.snapshotHash()).not.toBe(granted);
  });
});

describe('the corporate roster is coherent content', () => {
  it('registers all three VIP-exception tickets under the shared roster', () => {
    for (const id of [CEO_MFA_TICKET, EA_DELEGATE_TICKET, CEO_FILTER_TICKET]) {
      const entry = findWorldTicket(id);
      expect(entry, id).toBeDefined();
      expect(entry?.def.reporter).toBe(HALCYON_IDS.ea);
      expect(entry?.def.kb_ref).toBe('kb/exec-exception-risk');
    }
  });
});
