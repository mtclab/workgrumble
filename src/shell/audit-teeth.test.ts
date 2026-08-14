/**
 * The second queue, PLAYED (E9, 0.36.0 - the SD-senior rung).
 *
 * `world/audit.test.ts` proves the content: five filings, each wrong in exactly
 * one findable way against the real estate. This file drives the shipped thing
 * - the real session stood up off the real start carry, the real day driver
 * dealing the real week - and asserts the four claims the mechanic is made of,
 * each one written so that reverting the line it is about turns it red.
 *
 *  1. CONFIRM-WRONG BILLS LATER. Sign a wrong filing off, let the clock the
 *     filing bought run out, and the bill lands with the fault named. Teeth:
 *     the settler reads the FAULT stamped at the deal, so a filing with no
 *     fault on it breaches without billing - which is the same assertion from
 *     the other side, and it is what a build that billed every breach would
 *     fail.
 *  2. CORRECT-NOW COSTS MINUTES. Re-triaging somebody else's filing moves
 *     `refocus_until`; triaging one of your own does not. Teeth: take
 *     `AUDIT_CORRECTION_TAX` off the classify verb and the first half goes red;
 *     put it on unconditionally and the second half does.
 *  3. THE WRITE-UP COMPOUNDS. Write the class up and the last instance arrives
 *     correctly filed with the article on it; do not, and it arrives wrong like
 *     the other two. Teeth: the branch in `spawnAudits` is the only thing that
 *     makes those two runs differ, and both are driven here.
 *  4. THE OTHER RUNGS DO NOT SEE ANY OF IT. A junior's week and an engineer's
 *     week deal no audit item at all, which is what "byte-identical starts"
 *     has to mean once a second queue exists.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  AUDIT_ARTICLE,
  AUDIT_CLASS,
  AUDIT_VERDICTS,
  auditTickets,
  filedOn,
  verdictOn,
} from '../world/audit';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { createWorldSession, type WorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { carryForStart } from './start';

beforeAll(() => {
  loadEngineForTests();
});

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly notices: string[];
}

/**
 * A world at whichever rung, stood up the way the SHELL stands one up.
 *
 * Through `carryForStart`, which is the start select's own road: a test that
 * built a senior by writing the tier and the title onto the player node would
 * be testing a second way to be a senior, and the whole of `start.ts` is that
 * there is only one.
 */
function rig(rung: 'sd_junior' | 'sd_senior' | 'systems_engineer'): Rig {
  const session = createWorldSession(carryForStart(rung));
  const notices: string[] = [];
  // The session's OWN week and rooms, rather than the default: an engineer
  // starts at the MSP, and a driver handed the probation shop's table would be
  // scheduling a week nobody in that world is playing.
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onNotice: (title, body) => {
        notices.push(`${title}: ${body}`);
      },
    },
    undefined,
    session.week,
    session.channels,
  );

  return { session, driver, notices };
}

/** Runs the shift out, minute by minute, the way the shell's clock does. */
function playTheDay(rigged: Rig): void {
  rigged.driver.startShift();

  while (rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/** Today finished, and tomorrow opened. */
function nextDay(rigged: Rig): void {
  rigged.driver.clockOff();
  playTheDay(rigged);
}

const field = (rigged: Rig, node: string, name: string): unknown =>
  rigged.session.engine.graph.getField(node, name);

const player = (rigged: Rig, name: string): unknown =>
  field(rigged, COMPANY_IDS.player, name);

describe('the second queue arrives at the senior rung and nowhere else', () => {
  it('deals other people\'s filings on the senior\'s Monday', () => {
    const rigged = rig('sd_senior');
    playTheDay(rigged);

    const dealt = auditTickets(rigged.session.engine.graph);
    expect(dealt.length).toBeGreaterThan(0);

    for (const ticket of dealt) {
      // Somebody's name, a filing, and no verdict until the player rules.
      expect(typeof field(rigged, ticket, FIELDS.auditOf)).toBe('string');
      expect(filedOn(rigged.session.engine.graph, ticket)).not.toBeNull();
      expect(verdictOn(rigged.session.engine.graph, ticket)).toBeNull();
    }
  });

  /**
   * The byte-identical claim, said the only way it can be said now that a
   * second queue exists: the other two rungs deal NONE of it. A build that
   * gated the deal on the employer rather than on the rung would put five
   * filings on a probationer's Monday and this would go red.
   */
  it.each(['sd_junior', 'systems_engineer'] as const)(
    'deals nothing of it at %s',
    (rung) => {
      const rigged = rig(rung);
      playTheDay(rigged);
      nextDay(rigged);

      expect(auditTickets(rigged.session.engine.graph)).toEqual([]);
      expect(player(rigged, FIELDS.kbAuthored)).toBeUndefined();
    },
  );
});

describe('confirming a wrong filing comes due later', () => {
  /**
   * The whole delayed-consequence claim in one run: agree with every filing on
   * the board, then let the day run past the clocks those filings bought.
   */
  it('bills the desk when the clock the filing bought runs out', () => {
    const rigged = rig('sd_senior');
    rigged.driver.startShift();

    // Run to the point where the morning's items have been dealt, then agree
    // with all of them - which is the tempting answer, because it is free.
    for (let minute = 0; minute < 340; minute += 1) {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    const dealt = auditTickets(rigged.session.engine.graph);
    expect(dealt.length).toBeGreaterThan(0);

    const before = Number(player(rigged, FIELDS.reputation) ?? 0);

    for (const ticket of dealt) {
      expect(rigged.driver.confirmAudit(ticket).ok, ticket).toBe(true);
      expect(verdictOn(rigged.session.engine.graph, ticket))
        .toBe(AUDIT_VERDICTS.confirmed);
    }

    // Confirming costs NOTHING this minute. That is the trap, and it has to be
    // true or the choice is not a choice.
    expect(player(rigged, FIELDS.reputation)).toBe(before);

    while (rigged.driver.state() === 'shift') {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    nextDay(rigged);

    const billed = auditTickets(rigged.session.engine.graph).filter(
      (ticket) => typeof field(rigged, ticket, FIELDS.auditFalloutAt) === 'number',
    );

    expect(billed.length).toBeGreaterThan(0);
    expect(Number(player(rigged, FIELDS.reputation) ?? 0)).toBeLessThan(before);
    expect(rigged.notices.some((line) => line.includes('QA sign-off')))
      .toBe(true);

    // And the finding is ON THE FILE, durably - the notice is a bounded
    // history a busy day evicts from (a box run watched it happen), so the
    // bill's teaching half lives on the ticket's own record. Revert the
    // fallout worknote and this is the half that goes red.
    for (const ticket of billed) {
      expect(String(field(rigged, ticket, FIELDS.worknotes)))
        .toContain('QA sign-off came back');
    }

    /**
     * TEETH. The bill is charged off the FAULT stamped at the deal, not off the
     * breach - so every ticket that was billed carries one, and no ticket
     * without one was billed. Revert the fault stamp (or bill on the breach
     * alone) and one half of this goes red.
     */
    for (const ticket of auditTickets(rigged.session.engine.graph)) {
      const fault = field(rigged, ticket, FIELDS.auditFault);
      const bill = field(rigged, ticket, FIELDS.auditFalloutAt);

      if (typeof bill === 'number') {
        expect(typeof fault, ticket).toBe('string');
      }

      if (fault === undefined) {
        expect(bill, ticket).toBeUndefined();
      }
    }
  });
});

describe('correcting costs the rest of the thought you were having', () => {
  it('charges the attention tax for somebody else\'s filing', () => {
    const rigged = rig('sd_senior');
    rigged.driver.startShift();

    for (let minute = 0; minute < 200; minute += 1) {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    const [ticket] = auditTickets(rigged.session.engine.graph);
    expect(ticket).toBeDefined();

    const before = Number(player(rigged, FIELDS.refocusUntil) ?? 0);
    const now = rigged.session.engine.now();

    // Through the SHIPPED triage form's verb - there is no audit-correct verb,
    // which is the point.
    const result = rigged.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      ticket ?? '',
      { impact: 3, urgency: 2, priority: 2 },
    );

    expect(result.ok).toBe(true);
    expect(verdictOn(rigged.session.engine.graph, ticket ?? ''))
      .toBe(AUDIT_VERDICTS.corrected);
    expect(Number(player(rigged, FIELDS.refocusUntil) ?? 0))
      .toBeGreaterThan(Math.max(before, now));
  });

  /**
   * TEETH, from the other side: the tax is guarded on `audit_of`, so triaging
   * one of YOUR OWN tickets is the triage it always was. A build that charged
   * unconditionally would make every triage in the game cost twenty-three
   * minutes of attention, and this goes red.
   */
  it('charges nothing for triaging one of your own', () => {
    const rigged = rig('sd_senior');
    rigged.driver.startShift();

    for (let minute = 0; minute < 200; minute += 1) {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    const graph = rigged.session.engine.graph;
    const mine = graph.nodesOfKind('ticket')
      .filter((node) => typeof node.fields[FIELDS.auditOf] !== 'string')
      .filter((node) => node.fields[FIELDS.state] === 'open');

    expect(mine.length).toBeGreaterThan(0);

    const before = player(rigged, FIELDS.refocusUntil);

    rigged.driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      mine[0]?.id ?? '',
      { impact: 1, urgency: 1, priority: 4 },
    );

    expect(player(rigged, FIELDS.refocusUntil)).toEqual(before);
  });
});

describe('writing the class up makes the next one arrive right', () => {
  /**
   * Both runs of the same week, and the only difference between them is whether
   * the player wrote the article. That is the compounding beat, and driving
   * only one of the two would prove nothing about it.
   */
  function playToTheLastInstance(write: boolean): Rig {
    const rigged = rig('sd_senior');

    // Monday to Wednesday, which is where the class's first two instances
    // land, ruling on both so the prompt reaches KCS's threshold.
    playTheDay(rigged);
    nextDay(rigged);
    nextDay(rigged);

    for (const ticket of auditTickets(rigged.session.engine.graph)) {
      if (field(rigged, ticket, FIELDS.auditClass) === AUDIT_CLASS
        && verdictOn(rigged.session.engine.graph, ticket) === null) {
        rigged.driver.confirmAudit(ticket);
      }
    }

    // The desk is now asking for it. Whether it gets it is the variable.
    expect(rigged.driver.writeUpClass()).toBe(AUDIT_CLASS);

    if (write) {
      expect(rigged.driver.writeUpArticle().ok).toBe(true);
      expect(rigged.driver.writeUpClass()).toBeNull();
    }

    // Thursday and Friday, and the class's last instance is the Friday one.
    nextDay(rigged);
    nextDay(rigged);

    return rigged;
  }

  it('arrives correctly filed, with the article on it, once it is written', () => {
    const rigged = playToTheLastInstance(true);
    const last = 'ticket:audit-print-browser';

    expect(field(rigged, last, FIELDS.auditFault)).toBeUndefined();
    expect(field(rigged, last, FIELDS.kbRef)).toBe(AUDIT_ARTICLE);
    expect(filedOn(rigged.session.engine.graph, last)?.impact).toBe(3);
  });

  it('arrives wrong like the other two when nobody wrote it', () => {
    const rigged = playToTheLastInstance(false);
    const last = 'ticket:audit-print-browser';

    expect(field(rigged, last, FIELDS.auditFault)).toBe('impact');
    expect(field(rigged, last, FIELDS.kbRef)).not.toBe(AUDIT_ARTICLE);
    expect(filedOn(rigged.session.engine.graph, last)?.impact).toBe(1);
  });
});
