/**
 * The audit queue's content-truth gate, and the grader that makes it one.
 *
 * The mechanic is a quiz with a right answer, so the whole of what these tests
 * are for is that the right answer EXISTS and is findable: every authored
 * filing is graded against the shop's real estate, and an item whose declared
 * fault is not the one the world produces is a boot failure rather than a
 * player being marked wrong for reading the world correctly.
 */

import { describe, expect, it } from 'vitest';
import {
  assertAuditItems,
  AUDIT_CLASS,
  AUDIT_ITEMS,
  AUDIT_MINUTES,
  AUDIT_TICKET_IDS,
  auditItemsOn,
  auditTruth,
  faultOf,
  filingOf,
} from './audit';
import { dayLoad, loadForMinutes } from './load';
import { TITLE_TABLE } from './titles';
import { generatedWeek } from './week-gen';
import type { DayScript } from './week';
import { CAUGHT_MINUTES } from './boss';
import { REFOCUS_TICKS } from './meters';
import { priorityFor } from './priority';
import { createWorldSession } from './session';
import { findWorldTicket } from './tickets';
import { VIP_FORCED_PRIORITY } from './vip';

const world = createWorldSession().engine.graph;

const subjectFor = (id: string): { nodes: readonly string[]; true_urgency: 1 | 2 | 3 } | undefined => {
  const entry = findWorldTicket(id);

  return entry === undefined
    ? undefined
    : { nodes: entry.nodes, true_urgency: entry.true_urgency };
};

describe('the grader', () => {
  it('calls a filing that matches the world correct', () => {
    expect(faultOf(
      { impact: 2, urgency: 2, priority: 3 },
      { impact: 2, urgency: 2, priority: 3 },
      false,
    )).toBeNull();
  });

  it('names the estate when the urgency held and the impact did not', () => {
    expect(faultOf(
      { impact: 1, urgency: 2, priority: 4 },
      { impact: 3, urgency: 2, priority: 2 },
      false,
    )).toBe('impact');
  });

  it('names the table when the cell held and the number did not', () => {
    expect(faultOf(
      { impact: 1, urgency: 3, priority: 4 },
      { impact: 1, urgency: 3, priority: 3 },
      false,
    )).toBe('matrix');
  });

  it('names the beneficiary when everything held but the flag', () => {
    expect(faultOf(
      { impact: 1, urgency: 2, priority: 4 },
      { impact: 1, urgency: 2, priority: VIP_FORCED_PRIORITY },
      true,
    )).toBe('beneficiary');
  });

  /**
   * The one the whole gate hangs on. Two mistakes at once is not a harder
   * audit, it is an audit with no findable answer - so the grader refuses to
   * pick one of them and `assertAuditItems` refuses the item.
   */
  it('refuses to name one fault for a filing that is wrong in two ways', () => {
    expect(faultOf(
      { impact: 1, urgency: 1, priority: 1 },
      { impact: 3, urgency: 2, priority: 2 },
      false,
    )).toBe('mixed');
  });
});

describe('the authored queue', () => {
  it('is wrong in exactly one findable way, against the real estate', () => {
    expect(() => assertAuditItems(world, subjectFor)).not.toThrow();
  });

  /**
   * TEETH. Every one of the three faults has to be REACHED by the authored
   * content, or the gate above is passing on a queue that only exercises one of
   * them - and the fault a player never meets is the one the grader is wrong
   * about.
   */
  it('reaches all three faults and the correct filing', () => {
    const found = new Set(
      AUDIT_ITEMS.flatMap((item) => [
        filingOf(item, false).fault,
        filingOf(item, true).fault,
      ]),
    );

    expect([...found].sort()).toEqual(['beneficiary', 'impact', 'matrix', null]
      .sort() as unknown as string[]);
  });

  /**
   * And the settler needs somewhere to land: a confirmed-wrong filing only
   * bills if the clock it bought is LOOSER than the one the truth would have
   * cut, because a tighter wrong clock breaches on its own and teaches nothing
   * about the audit.
   */
  it('under-calls every wrong filing, which is what makes it billable', () => {
    for (const item of AUDIT_ITEMS) {
      const subject = subjectFor(item.ticket);
      expect(subject, item.ticket).toBeDefined();

      if (subject === undefined) {
        continue;
      }

      const { filed, fault } = filingOf(item, false);

      if (fault === null) {
        continue;
      }

      const truth = auditTruth(
        world,
        subject.nodes,
        subject.true_urgency,
        item.vip === true,
      );

      // A bigger priority number is a looser clock: P4 has eight hours where
      // P2 has two.
      expect(filed.priority, item.ticket).toBeGreaterThan(truth.priority);
    }
  });

  it('deals the class more than once, or there is nothing to write up', () => {
    const ofClass = AUDIT_ITEMS.filter((item) => item.auditClass === AUDIT_CLASS);

    expect(ofClass.length).toBeGreaterThanOrEqual(3);
    // The last instance is the one the article changes, and it is the only one
    // that carries a second filing.
    expect(ofClass.filter((item) => item.whenAuthored !== undefined))
      .toHaveLength(1);
  });

  it('lands its items in arrival order on the days it names', () => {
    for (const day of [1, 2, 3, 4, 5]) {
      const minutes = auditItemsOn(day).map((item) => item.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    }

    expect(auditItemsOn(1).map((item) => item.ticket)).toEqual([
      'ticket:audit-print-task',
      'ticket:audit-marketing-spooler',
    ]);
  });

  /**
   * The price is BORROWED, and this is the assertion that keeps it borrowed: a
   * figure somebody typed into the budget would be a tuning decision smuggled
   * in as arithmetic.
   */
  it('prices an audit off the two figures the day already uses', () => {
    expect(AUDIT_MINUTES).toBe(CAUGHT_MINUTES + REFOCUS_TICKS);
  });
});

/**
 * THE DAY STILL CLOSES.
 *
 * The audit queue adds work to a week that was already drawn inside a budget,
 * so the one thing that could quietly break is the budget itself: five items at
 * thirty-three minutes each is most of an hour, and an hour on a Thursday is
 * the difference between a hard day and a day nobody could have been given.
 *
 * It goes through the SHIPPED seam (`generatedWeek`) rather than through the
 * generator directly, because the overlay lives there - a gate that called
 * `generateWeek` would be measuring a week the player is never dealt.
 */
describe('the week the senior is actually dealt', () => {
  const seniorWeek = (): readonly DayScript[] => generatedWeek({
    employer: 'workgrumble',
    attempt: 1,
    arcWeek: TITLE_TABLE.sd_senior.startsAt ?? 2,
    rung: 'sd_senior',
  });

  it('deals every authored item, on the day that authored it', () => {
    const dealt = seniorWeek().flatMap((script) => script.audits ?? []);

    expect([...dealt].sort()).toEqual([...AUDIT_TICKET_IDS].sort());

    for (const script of seniorWeek()) {
      expect(script.audits ?? [], script.label)
        .toEqual(auditItemsOn(script.day).map((item) => item.ticket));
    }
  });

  it('still closes: every day inside a band, and the ramp intact', () => {
    let previous = 0;

    for (const script of seniorWeek()) {
      const priced = dayLoad(script, findWorldTicket);
      const band = loadForMinutes(priced.committedMinutes);

      // A day past the top band is a day nobody could have been given, which
      // the overlay refuses outright - this is the same claim from the outside.
      expect(band, script.label).not.toBeNull();
      // And the column follows the arithmetic, which is what the overlay
      // rewrites it for.
      expect(script.load, script.label).toBe(band);

      if (script.day <= 4) {
        expect(script.load, script.label).toBeGreaterThanOrEqual(previous);
      }

      previous = script.load;
    }
  });

  /**
   * TEETH on the price. The audit minutes are really in the budget: take
   * `AUDIT_MINUTES` out of `otherMinutes` and a day carrying two items prices
   * the same as one carrying none, which is what this refuses.
   */
  it('prices a day with audits on it above the same day without', () => {
    const carrying = seniorWeek().find(
      (script) => (script.audits ?? []).length > 0,
    );

    expect(carrying).toBeDefined();

    if (carrying === undefined) {
      return;
    }

    const withThem = dayLoad(carrying, findWorldTicket).committedMinutes;
    const without = dayLoad(
      { ...carrying, audits: [] },
      findWorldTicket,
    ).committedMinutes;

    expect(withThem - without)
      .toBe((carrying.audits ?? []).length * AUDIT_MINUTES);
  });

  /** And the other rungs are dealt none of it, through the same seam. */
  it.each(['sd_junior', 'systems_engineer'] as const)(
    'deals no audits to %s',
    (rung) => {
      const week = generatedWeek({
        employer: 'workgrumble',
        attempt: 1,
        arcWeek: 2,
        rung,
      });

      expect(week.flatMap((script) => script.audits ?? [])).toEqual([]);
    },
  );
});

describe('the truth read', () => {
  it('is the matrix, unless the flag is on the ticket', () => {
    const honest = auditTruth(world, ['machine:print'], 2, false);
    expect(honest.priority).toBe(priorityFor(honest.impact, 2));

    const flagged = auditTruth(world, ['machine:print'], 2, true);
    expect(flagged.impact).toBe(honest.impact);
    expect(flagged.priority).toBe(VIP_FORCED_PRIORITY);
  });
});
