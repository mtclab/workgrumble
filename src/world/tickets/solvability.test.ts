/**
 * The solvability gate: every shipped ticket, every advertised path, driven.
 *
 * This is the milestone's signature gate and it is deliberately paranoid,
 * because the failure it exists to catch is the worst one this product has. A
 * ticket that cannot be closed is not a crash and not a wrong number: it is a
 * row in a queue, with a clock on it, in front of somebody who has read the
 * article, tried the thing the article says, watched it be refused, and
 * concluded that they have misunderstood their own job. Nothing else in the
 * build can find that, because from every other angle the content looks fine.
 *
 * So it asserts the OUTCOME rather than the call. For each ticket and each of
 * the ways its own content advertises closing it:
 *
 * - the ticket spawns OPEN. Nothing in this world ships an archetype that
 *   arrives already solved, so a ticket that resolves the moment it is raised
 *   is content whose fault does not exist yet - the commonest way a rewritten
 *   setup goes wrong, and invisible in play except as a free point;
 * - every step of the path is DRIVEN, through the shipped action registry,
 *   against the shipped world, in order, with the shipped guards;
 * - every step but the last leaves it open, so a path cannot quietly carry a
 *   decorative step nobody needs;
 * - the last one closes it.
 *
 * It runs at the graph level and not through the UI on purpose: this is the
 * proof that the CONTENT is coherent, and a UI test would be proving the
 * buttons as well and failing for two reasons at once. The buttons have their
 * own journeys.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { COMPANY_IDS } from '../company';
import { createWorldSession, type WorldSession } from '../session';
import {
  ticketsNeededFor,
  WORLD_TICKETS,
  spawnWorldTicket,
} from './index';
import type { TicketActionStep, WorldTicket } from './types';

beforeAll(() => {
  loadEngineForTests();
});

/**
 * A world with this ticket in it, and with anything its paths need beside it.
 *
 * A duplicate is attached to a parent and then closed with that parent, so the
 * parent has to have been raised - which is true in play, where a flood arrives
 * together, and has to be arranged here. The list comes off the path's own
 * steps rather than out of a table beside them.
 */
function worldFor(entry: Readonly<WorldTicket>): WorldSession {
  const session = createWorldSession();

  for (const id of ticketsNeededFor(entry)) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
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
      `Advertised step "${step.action}" on "${step.target}" was refused: `
      + result.reason,
    );
  }
}

describe('every shipped ticket is solvable', () => {
  describe.each(WORLD_TICKETS.map((entry) => [entry.def.id, entry] as const))(
    '%s',
    (ticketId, entry) => {
      it.each(entry.paths.map((path) => [path.id, path] as const))(
        'closes through the %s path, and needs every step of it',
        (_pathId, path) => {
          const session = worldFor(entry);
          expect(session.engine.ticketState(ticketId)).toBe('open');

          path.steps.forEach((step, index) => {
            drive(session, step);

            const last = index === path.steps.length - 1;
            expect(
              session.engine.ticketState(ticketId),
              `${ticketId} after step ${String(index + 1)} (${step.action})`,
            ).toBe(last ? 'resolved' : 'open');
          });
        },
      );

      /**
       * And it does not close on its own. A minute of clock, no dispatches:
       * anything that resolves here has a resolution rule the world already
       * satisfies, which is a ticket about a fault that is not there.
       */
      it('stays open until somebody actually does something', () => {
        const session = worldFor(entry);
        session.engine.advance(1);
        expect(session.engine.ticketState(ticketId)).toBe('open');
      });
    },
  );

  /**
   * The same claim once more over the whole roster, in one assertion, so the
   * failure message names every offender at once rather than the first.
   *
   * No archetype in this world ships pre-solved. If one ever does - a ticket
   * that exists to be triaged and closed with a word, say - this is the test
   * that has to say so out loud, by naming it, rather than being deleted.
   */
  it('ships nothing that is already fixed when it arrives', () => {
    const session = createWorldSession();
    const solvedOnArrival: string[] = [];

    for (const entry of WORLD_TICKETS) {
      if (session.engine.graph.getNode(entry.def.id) === undefined) {
        spawnWorldTicket(session.engine, entry.def.id);
      }

      if (session.engine.ticketState(entry.def.id) === 'resolved') {
        solvedOnArrival.push(entry.def.id);
      }
    }

    expect(solvedOnArrival).toEqual([]);
  });

  /**
   * Every ticket in the roster gets driven by the block above. Asserted rather
   * than assumed, because `describe.each` over an empty list passes in silence
   * and a filter typed into this file at four in the afternoon would turn the
   * milestone's signature gate into a test that runs nothing.
   */
  it('covers the whole roster and more than one way through it', () => {
    expect(WORLD_TICKETS.length).toBeGreaterThanOrEqual(20);
    expect(
      WORLD_TICKETS.flatMap((entry) => entry.paths).length,
    ).toBeGreaterThan(WORLD_TICKETS.length);
  });
});
