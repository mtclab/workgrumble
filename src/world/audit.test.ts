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
  auditItemsOn,
  auditTruth,
  faultOf,
  filingOf,
} from './audit';
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

describe('the truth read', () => {
  it('is the matrix, unless the flag is on the ticket', () => {
    const honest = auditTruth(world, ['machine:print'], 2, false);
    expect(honest.priority).toBe(priorityFor(honest.impact, 2));

    const flagged = auditTruth(world, ['machine:print'], 2, true);
    expect(flagged.impact).toBe(honest.impact);
    expect(flagged.priority).toBe(VIP_FORCED_PRIORITY);
  });
});
