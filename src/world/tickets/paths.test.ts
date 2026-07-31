import { describe, expect, it } from 'vitest';

import type { Expr } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession, type WorldSession } from '../session';
import { acceptsEscalation } from './escalation';
import { allowsEscalation, WORLD_TICKETS } from './index';
import type { TicketActionStep, WorldTicket } from './types';

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

function drive(session: WorldSession, step: Readonly<TicketActionStep>): void {
  const result = session.engine.dispatch(
    step.action,
    COMPANY_IDS.player,
    step.target,
    { ...step.params },
  );

  if (!result.ok) {
    throw new Error(
      `Advertised step "${step.action}" was refused: ${result.reason}`,
    );
  }
}

describe('shipped tickets', () => {
  it('spawns every shipped ticket open, with a live SLA', () => {
    const session = createWorldSession();

    for (const entry of WORLD_TICKETS) {
      // The morning pile is in the world before anybody has clicked anything;
      // the summoned one is not there until it is raised, and asserting it
      // WERE there would be asserting the queue lies about the day.
      expect(
        session.engine.ticketState(entry.def.id),
        entry.def.id,
      ).toBe(entry.arrival === 'summoned' ? undefined : 'open');

      spawnIfAbsent(session, entry);
      expect(session.engine.ticketState(entry.def.id)).toBe('open');
      expect(session.engine.graph.getField(entry.def.id, FIELDS.slaDeadline))
        .toBe(entry.def.sla_ticks);
    }

    expect(WORLD_TICKETS.map(({ def }) => def.id)).toEqual([
      'ticket:fan-noise',
      'ticket:rotated-screen',
      'ticket:locked-account',
      'ticket:wedged-spooler',
      'ticket:boss-phone',
    ]);
  });

  it('leaves the reported symptom in the world it spawns into', () => {
    const session = createWorldSession();

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
 * The M2 half of the solvability gate: every path the content advertises is
 * driven, step by step, through the real registry against the real world - and
 * the ticket has to actually close at the end of it.
 */
describe.each(WORLD_TICKETS.map((entry) => [entry.def.id, entry] as const))(
  'ticket %s',
  (ticketId, entry) => {
    it.each(entry.paths.map((path) => [path.id, path] as const))(
      'closes through the %s path',
      (_pathId, path) => {
        const session = createWorldSession();
        spawnIfAbsent(session, entry);
        expect(session.engine.ticketState(ticketId)).toBe('open');

        path.steps.forEach((step, index) => {
          drive(session, step);

          const finalStep = index === path.steps.length - 1;
          // A multi-step path must NEED every step: if the ticket closes early
          // the extra steps are decoration and the assertion is too loose.
          expect(session.engine.ticketState(ticketId)).toBe(
            finalStep ? 'resolved' : 'open',
          );
        });
      },
    );

    it('stays open until a path is actually driven', () => {
      const session = createWorldSession();
      spawnIfAbsent(session, entry);
      session.engine.advance(1);
      expect(session.engine.ticketState(ticketId)).toBe('open');
    });
  },
);

/**
 * Content honesty at graph level: the estate contains one thing that looks
 * like a service and is not, and no verb on the helpdesk tier may pretend
 * otherwise or quietly close the ticket that hangs off it.
 */
describe('hardware that reports a status', () => {
  it('refuses to restart the chassis fan and leaves its ticket open', () => {
    const session = createWorldSession();
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
    const session = createWorldSession();

    // The queue goes first, which is the spooler ticket's whole lesson.
    session.engine.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      {},
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

    expect(escalatable).toEqual(['ticket:fan-noise']);
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
      const session = createWorldSession();
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
    const session = createWorldSession();
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
    const session = createWorldSession();
    const ticketId = 'ticket:locked-account';
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
    const session = createWorldSession();
    const ticketId = 'ticket:locked-account';
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
