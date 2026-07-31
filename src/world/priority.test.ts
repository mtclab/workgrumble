/**
 * Triage, exhaustively.
 *
 * The matrix is nine cells and every one of them is asserted, because a table
 * with a hole in it is a priority nobody can be assigned and a `throw` in the
 * middle of a click. The impact walk is driven against the SHIPPED estate:
 * anything else measures a fixture, and the number the player is judged on
 * comes off the real graph.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from './company';
import {
  affectedCount,
  cellLabel,
  classify,
  IMPACT_BANDS,
  impactForCount,
  isLevel,
  isMisclassified,
  isPriority,
  type Level,
  LEVELS,
  PRIORITIES,
  priorityFor,
  priorityLabel,
  PRIORITY_MATRIX,
  SLA_TARGETS,
  targetsFor,
  trueImpact,
  UNTRIAGED_PRIORITY,
} from './priority';
import { createWorldSession } from './session';
import { WORLD_TICKETS } from './tickets';

beforeAll(() => {
  loadEngineForTests();
});

describe('the priority matrix', () => {
  /** All nine cells, written out, so a table edited down fails here. */
  it.each([
    [3, 3, 1],
    [3, 2, 2],
    [3, 1, 3],
    [2, 3, 2],
    [2, 2, 3],
    [2, 1, 4],
    [1, 3, 3],
    [1, 2, 4],
    [1, 1, 4],
  ])('reads impact %i and urgency %i as P%i', (impact, urgency, priority) => {
    expect(priorityFor(impact as Level, urgency as Level)).toBe(priority);
    expect(classify(impact as Level, urgency as Level)).toEqual({
      impact,
      urgency,
      priority,
    });
  });

  it('covers every pair exactly once and nothing else', () => {
    expect(PRIORITY_MATRIX).toHaveLength(LEVELS.length * LEVELS.length);

    const seen = new Set(
      PRIORITY_MATRIX.map((cell) => `${String(cell.impact)}/${String(cell.urgency)}`),
    );
    expect(seen.size).toBe(PRIORITY_MATRIX.length);

    for (const impact of LEVELS) {
      for (const urgency of LEVELS) {
        expect(seen.has(`${String(impact)}/${String(urgency)}`)).toBe(true);
      }
    }
  });

  it('is monotonic: nothing gets less urgent by mattering more', () => {
    for (const urgency of LEVELS) {
      for (const impact of [1, 2] as const) {
        // Lower priority NUMBER is more serious, so more impact never raises it.
        expect(priorityFor((impact + 1) as Level, urgency))
          .toBeLessThanOrEqual(priorityFor(impact, urgency));
      }
    }

    for (const impact of LEVELS) {
      for (const urgency of [1, 2] as const) {
        expect(priorityFor(impact, (urgency + 1) as Level))
          .toBeLessThanOrEqual(priorityFor(impact, urgency));
      }
    }
  });

  it('knows what is a level and what is a priority', () => {
    expect(LEVELS.every(isLevel)).toBe(true);
    expect(PRIORITIES.every(isPriority)).toBe(true);
    expect(isLevel(0)).toBe(false);
    expect(isLevel(4)).toBe(false);
    expect(isLevel('3')).toBe(false);
    expect(isLevel(1.5)).toBe(false);
    expect(isPriority(0)).toBe(false);
    expect(isPriority(5)).toBe(false);
  });
});

describe('the SLA table', () => {
  it('gives every priority a response and a resolution target', () => {
    for (const priority of PRIORITIES) {
      const target = SLA_TARGETS[priority];
      expect(target.response).toBeGreaterThan(0);
      expect(target.resolution).toBeGreaterThan(target.response);
    }
  });

  /** Each tier is slower than the one above it, or the ladder means nothing. */
  it('gets slower with every step down the ladder', () => {
    for (const priority of [1, 2, 3] as const) {
      const next = (priority + 1) as 2 | 3 | 4;
      expect(SLA_TARGETS[next].response)
        .toBeGreaterThan(SLA_TARGETS[priority].response);
      expect(SLA_TARGETS[next].resolution)
        .toBeGreaterThan(SLA_TARGETS[priority].resolution);
    }
  });

  /**
   * A ticket nobody has looked at cannot be free of a clock: that would make
   * ignoring the queue the winning move.
   */
  it('holds an untriaged ticket to the middle of the ladder', () => {
    expect(targetsFor(null)).toEqual(SLA_TARGETS[UNTRIAGED_PRIORITY]);
    expect(targetsFor(1)).toEqual(SLA_TARGETS[1]);
    expect(priorityLabel(null)).toBe('Untriaged');
    expect(priorityLabel(2)).toBe('P2');
  });

  /** Every target has to be reachable inside one shift, or it never bites. */
  it('fits every target inside a working day', () => {
    for (const priority of PRIORITIES) {
      expect(SLA_TARGETS[priority].resolution).toBeLessThanOrEqual(8 * 60);
    }
  });
});

describe('impact, read off the estate', () => {
  it('bands a count into a level, at the edges', () => {
    expect(impactForCount(0)).toBe(1);
    expect(impactForCount(2)).toBe(1);
    expect(impactForCount(3)).toBe(2);
    expect(impactForCount(5)).toBe(2);
    expect(impactForCount(6)).toBe(3);
    expect(impactForCount(600)).toBe(3);

    // The bands have to cover zero, or a fault that hits nobody has no level.
    expect(IMPACT_BANDS[IMPACT_BANDS.length - 1]?.from).toBe(0);
  });

  /**
   * The one ticket in the pile that is what it says it is. A wedged spooler is
   * not a conversation between a service and a printer: it is everybody who
   * prints through that server, and the walk has to find them.
   */
  it('reads a wedged spooler as an office-wide outage', () => {
    const { engine } = createWorldSession();
    const nodes = [COMPANY_IDS.spooler, COMPANY_IDS.printer];

    expect(affectedCount(engine.graph, nodes)).toBeGreaterThanOrEqual(6);
    expect(trueImpact(engine.graph, nodes)).toBe(3);
  });

  /** And one sideways monitor is one person, however loudly it is reported. */
  it('reads one desk as one desk', () => {
    const { engine } = createWorldSession();

    expect(trueImpact(engine.graph, [COMPANY_IDS.adaMachine])).toBe(1);
    expect(trueImpact(engine.graph, [COMPANY_IDS.garyAccount])).toBe(1);
  });

  /**
   * The walk is directional on purpose. Following every edge both ways makes
   * the estate one component and every ticket maximally important, which
   * measures the office rather than the fault.
   */
  it('does not let a leaf inherit the blast radius of its hub', () => {
    const { engine } = createWorldSession();

    expect(affectedCount(engine.graph, [COMPANY_IDS.adaMachine]))
      .toBeLessThan(affectedCount(engine.graph, [COMPANY_IDS.printServer]));
  });

  it('says nothing about nodes that are not there', () => {
    const { engine } = createWorldSession();

    expect(affectedCount(engine.graph, [])).toBe(0);
    expect(affectedCount(engine.graph, ['device:imaginary'])).toBe(0);
  });

  /** Every shipped ticket has to have an impact somebody can read. */
  it('gives every shipped ticket a level', () => {
    const { engine } = createWorldSession();

    for (const entry of WORLD_TICKETS) {
      expect(isLevel(trueImpact(engine.graph, entry.nodes))).toBe(true);
    }
  });
});

describe('misclassification', () => {
  it('compares cells, not the number they happened to produce', () => {
    const truth = classify(1, 3);

    expect(isMisclassified(classify(1, 3), truth)).toBe(false);
    // Both of these are P3, and both of them are the wrong reading.
    expect(isMisclassified(classify(3, 1), truth)).toBe(true);
    expect(isMisclassified(classify(2, 3), truth)).toBe(true);
    expect(classify(3, 1).priority).toBe(truth.priority);
  });

  it('holds nothing against a ticket nobody has triaged', () => {
    expect(isMisclassified(null, classify(3, 3))).toBe(false);
  });

  it('says both cells out loud', () => {
    expect(cellLabel(classify(3, 1)))
      .toBe('High impact / Low urgency (P3)');
  });
});
