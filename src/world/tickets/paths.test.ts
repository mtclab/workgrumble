import { describe, expect, it } from 'vitest';

import type { Expr } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession, type WorldSession } from '../session';
import { inheritedTicketIds } from '../week';
import { acceptsEscalation } from './escalation';
import { allowsEscalation, spawnWorldTicket, WORLD_TICKETS } from './index';
import type { WorldTicket } from './types';

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
    session.engine.registerTicket(entry.def);
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
  return sessionWith(...WORLD_TICKETS.map(({ def }) => def.id));
}

describe('shipped tickets', () => {
  it('spawns every shipped ticket open, with a live SLA', () => {
    const session = createWorldSession();

    for (const entry of WORLD_TICKETS) {
      // The morning pile is in the world before anybody has clicked anything.
      // The one that drips in and the one the lead summons are not there yet,
      // and asserting they WERE would be asserting the queue lies about the
      // day: the whole point of an arrival is that it arrives.
      expect(
        session.engine.ticketState(entry.def.id),
        entry.def.id,
      ).toBe(
        inheritedTicketIds(1).includes(entry.def.id) ? 'open' : undefined,
      );

      spawnIfAbsent(session, entry);
      expect(session.engine.ticketState(entry.def.id)).toBe('open');
      expect(session.engine.graph.getField(entry.def.id, FIELDS.slaDeadline))
        .toBe(entry.def.sla_ticks);
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
    ]);
  });

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

describe('escalation policy', () => {
  it('offers escalation only where the ticket rules accept it', () => {
    const escalatable = WORLD_TICKETS
      .filter((entry) => acceptsEscalation(entry.def.resolved_when, entry.def.id))
      .map(({ def }) => def.id);

    // Two, and both for the same honest reason: a fan whose bearing is going
    // wants a screwdriver and somebody on site, and a report that has not run
    // since March wants the people whose job the job is.
    expect(escalatable).toEqual([
      'ticket:fan-noise',
      'ticket:hr-report-macro',
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
      const session = sessionWith(entry.def.id);
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
  });

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
