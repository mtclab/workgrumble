import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EMPLOYER_IDS, employerFor } from './employers';
import { contentFor } from './pools';
import { WORLD_TICKETS } from './tickets';
import { WORK_KINDS, type WorkKind } from './titles';
import { generateWeek, PRODUCT_WINDOW } from './week-gen';
import { mixOfWeek, workKindOf } from './work-kinds';

/**
 * The classifier, against the whole of the shipped content (E9, 0.35.0).
 *
 * The rung table's ratios are per work kind, so a ticket the classifier cannot
 * place is a ticket that quietly counts towards nothing: it would not break a
 * quota, it would sit outside every one of them. That is the failure this file
 * exists to make impossible, and the assertion is the blunt one - EVERY ticket
 * this build ships gets a kind, today and after the next content wave.
 */
describe('every ticket in the game has a kind', () => {
  it('classifies all of them, with nothing left over', () => {
    const refused: string[] = [];

    for (const ticket of WORLD_TICKETS) {
      try {
        expect(WORK_KINDS).toContain(workKindOf(ticket.def.id));
      } catch (failure: unknown) {
        refused.push(`${ticket.def.id}: ${String(failure)}`);
      }
    }

    expect(refused).toEqual([]);
    // A floor rather than an exact count, because the roster grows: what is
    // being asserted is that the walk above walked something.
    expect(WORLD_TICKETS.length).toBeGreaterThan(100);
  });

  it('refuses a ticket nobody wrote rather than guessing at one', () => {
    expect(() => workKindOf('ticket:not-a-ticket')).toThrow(/no ticket/u);
  });
});

/**
 * The two signals, on the tickets that prove each of them is needed.
 *
 * These are not examples chosen to pass - each one is a case where the cheap
 * rule gives the wrong answer, and they are the reason the classifier reads
 * both the verb and the box it lands on.
 */
describe('the verb says what the work is, and the box says where', () => {
  it('reads the fix rather than the reporter', () => {
    // Named on the ticket: Hilda's account. Done by the fix: a full disk on a
    // warehouse workstation. It is device work, and the estate alone would have
    // called it access work because an account is in the list.
    expect(workKindOf('ticket:disk-full')).toBe('device');
    // The mirror: a licence problem whose estate includes a machine and a
    // service, and whose fix is two account verbs.
    expect(workKindOf('ticket:licence-exhausted')).toBe('access');
  });

  it('classes a restart by the box it is on, not by the word restart', () => {
    // The same verb, twice. The spooler on the print SERVER is server work.
    expect(workKindOf('ticket:wedged-spooler')).toBe('server');
    // The backup agent on Marcus's WORKSTATION is desk work.
    expect(workKindOf('ticket:coverup-backup')).toBe('device');
  });

  it('falls back to the estate when the answer is not a fix', () => {
    // Escalated rather than fixed: no work verb in the path at all, and the
    // estate is a customer's server.
    expect(workKindOf('ticket:northwind-disk-alert')).toBe('server');
    // Answered with a reply, and the estate is somebody's account.
    expect(workKindOf('ticket:arden-lockout-handback')).toBe('access');
  });

  it('knows a project task from a ticket', () => {
    expect(workKindOf('ticket:arden-fw-cutover')).toBe('project');
  });

  it('places an estate the ONBOARDING builds, not just the shop', () => {
    // TILLMAN's server is stood up by the onboarding mid-week rather than by
    // the MSP's own setup. Before the onboarding setups were in the index this
    // was the one ticket in the game with no kind at all.
    expect(workKindOf('ticket:tillman-backup-discovery')).toBe('server');
  });
});

/**
 * THE MEASURED MIXES, transcribed.
 *
 * The junior rung's ratios are all ones, which means the junior's difficulty IS
 * whatever the probation shop deals - so the numbers below are the load-bearing
 * fact behind that row, and they are written down here rather than inferred. If
 * a content change moves them, this test is where somebody finds out, and the
 * rung table is what has to be looked at rather than this expectation.
 */
describe('the shipped weeks, measured', () => {
  const MEASURED: Readonly<Record<string, Record<WorkKind, number>>> = {
    workgrumble: { access: 8, device: 8, server: 7, project: 0 },
    bodgeworth: { access: 1, device: 2, server: 2, project: 0 },
    msp: { access: 8, device: 5, server: 9, project: 0 },
    corporate: { access: 5, device: 2, server: 2, project: 0 },
  };

  it.each(EMPLOYER_IDS)('%s deals the mix its row is measured from', (id) => {
    expect(mixOfWeek(employerFor(id).week)).toEqual(MEASURED[id]);
  });

  it('deals no project work anywhere the draw can reach', () => {
    // The flat claim behind the junior row's project nought: project tasks are
    // raised by the phase machine (E10), never dealt by a week. If that ever
    // stops being true, the junior's quota is the thing that catches it - and
    // this is the assertion that says the quota is not vacuous by accident.
    for (const id of EMPLOYER_IDS) {
      const content = contentFor(employerFor(id));

      for (let week = 2; week <= 6; week += 1) {
        const drawn = generateWeek(
          { employer: id, attempt: 1, arcWeek: week },
          content,
          { window: PRODUCT_WINDOW },
        );

        expect(mixOfWeek(drawn).project).toBe(0);
      }
    }
  });
});

/**
 * And the seam kept clean: the classifier answers off CONTENT, so it must not
 * learn to read a live world. A version of this that took a graph would answer
 * differently inside a session than the generator does outside one, and the
 * quota would hold in one place and not the other.
 */
describe('it is a fact about the content', () => {
  it('reads no graph, no clock and no random', () => {
    const source = readFileSync('src/world/work-kinds.ts', 'utf8');

    expect(source).not.toContain('ReadOnlyGraphView');
    expect(source).not.toContain('Math.random');
    expect(source).not.toContain('.graph');
    expect(source).not.toContain('now()');
  });
});
