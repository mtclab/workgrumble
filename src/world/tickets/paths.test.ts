import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession, type WorldSession } from '../session';
import { acceptsEscalation } from './escalation';
import { WORLD_TICKETS } from './index';
import type { TicketActionStep } from './types';

function drive(session: WorldSession, step: Readonly<TicketActionStep>): void {
  const result = session.registry.dispatch(
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
      expect(session.tickets.getState(entry.def.id)).toBe('open');
      expect(session.graph.getField(entry.def.id, FIELDS.slaDeadline))
        .toBe(entry.def.sla_ticks);
    }

    expect(WORLD_TICKETS.map(({ def }) => def.id)).toEqual([
      'ticket:fan-noise',
      'ticket:rotated-screen',
      'ticket:locked-account',
      'ticket:wedged-spooler',
    ]);
  });

  it('leaves the reported symptom in the world it spawns into', () => {
    const session = createWorldSession();

    expect(
      session.graph.getField(COMPANY_IDS.adaMachine, FIELDS.displayRotation),
    ).toBe(90);
    expect(session.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toBe(true);
    expect(session.graph.getField(COMPANY_IDS.spooler, FIELDS.status))
      .toBe('wedged');
    expect(session.graph.getField(COMPANY_IDS.printer, FIELDS.queueLen))
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
        expect(session.tickets.getState(ticketId)).toBe('open');

        path.steps.forEach((step, index) => {
          drive(session, step);

          const finalStep = index === path.steps.length - 1;
          // A multi-step path must NEED every step: if the ticket closes early
          // the extra steps are decoration and the assertion is too loose.
          expect(session.tickets.getState(ticketId)).toBe(
            finalStep ? 'resolved' : 'open',
          );
        });
      },
    );

    it('stays open until a path is actually driven', () => {
      const session = createWorldSession();
      session.clock.advance(1);
      expect(session.tickets.getState(ticketId)).toBe('open');
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
    const before = session.graph.snapshotHash();

    const result = session.registry.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.fan,
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('It will not help.');
    expect(session.graph.snapshotHash()).toBe(before);
    expect(session.graph.getField(COMPANY_IDS.fan, FIELDS.status))
      .toBe('wedged');
    expect(session.tickets.getState('ticket:fan-noise')).toBe('open');
  });

  it('still restarts the software on the same estate', () => {
    const session = createWorldSession();

    // The queue goes first, which is the spooler ticket's whole lesson.
    session.registry.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      {},
    );

    expect(
      session.registry.dispatch(
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
      .filter((entry) => acceptsEscalation(entry.def.resolved_when))
      .map(({ def }) => def.id);

    expect(escalatable).toEqual(['ticket:fan-noise']);
  });

  it('refuses to escalate a ticket that is fixable from the desk', () => {
    const session = createWorldSession();
    const result = session.registry.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      'ticket:locked-account',
      {},
    );

    expect(result).toEqual({
      ok: false,
      reason: 'This is fixable from your desk, and everyone downstream knows '
        + 'it. Escalating it would be a career-limiting move.',
    });
    expect(session.tickets.getState('ticket:locked-account')).toBe('open');
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
    const before = session.graph.snapshotHash();
    const deadline = session.graph.getField(ticketId, FIELDS.slaDeadline);

    const refused = session.registry.dispatch(
      HELPDESK_ACTIONS.ticketSetWaiting,
      COMPANY_IDS.player,
      ticketId,
      {},
    );

    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason)
      .toContain('You have not actually asked them anything yet.');
    expect(session.graph.snapshotHash()).toBe(before);
    expect(session.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(deadline);
    expect(session.tickets.getState(ticketId)).toBe('open');

    // Ten minutes later the clock has eaten ten minutes, exactly as if the
    // player had never touched the toggle.
    session.clock.advance(10);
    expect(session.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(deadline);
  });

  it('pushes the SLA deadline out while the ticket is parked', () => {
    const session = createWorldSession();
    const ticketId = 'ticket:locked-account';
    const before = session.graph.getField(ticketId, FIELDS.slaDeadline);

    expect(
      session.registry.dispatch(
        HELPDESK_ACTIONS.ticketMarkAsked,
        COMPANY_IDS.player,
        ticketId,
        {},
      ),
    ).toEqual({ ok: true });

    expect(
      session.registry.dispatch(
        HELPDESK_ACTIONS.ticketSetWaiting,
        COMPANY_IDS.player,
        ticketId,
        {},
      ),
    ).toEqual({ ok: true });
    session.clock.advance(10);

    expect(session.tickets.getState(ticketId)).toBe('waiting_on_user');
    expect(session.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(
      typeof before === 'number' ? before + 10 : before,
    );

    // And the clock bites again the moment the ticket comes back to you.
    expect(
      session.registry.dispatch(
        HELPDESK_ACTIONS.ticketClearWaiting,
        COMPANY_IDS.player,
        ticketId,
        {},
      ),
    ).toEqual({ ok: true });
    session.clock.advance(5);
    expect(session.graph.getField(ticketId, FIELDS.slaDeadline)).toBe(
      typeof before === 'number' ? before + 10 : before,
    );
  });
});
