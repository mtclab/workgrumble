/**
 * The employer switching SPINE (0.6.0 slice 1): the switch engine.
 *
 * What is proven here is the seam and nothing above it. There is no second
 * shipped employer and no transition surface - those are slices 2 and 3 - so the
 * switch mechanism is driven with a FIXTURE employer built right here: a minimal
 * second company graph, enough to seed a player node and no more. If the
 * parameter and the seed-from-carry path work for a company the shipped registry
 * has never heard of, they work.
 *
 * The load-bearing claim, made first, is that the switch is ADDITIVE: a fresh
 * probation, with no career on the carry, stands up a world byte-identical to
 * the one before any of this existed. The scripted-week/day/arc goldens are the
 * end-of-week half of that proof; the opening hash pinned here is the Monday
 * morning half.
 */

import { describe, expect, it } from 'vitest';

import {
  careerAfter,
  carryForEmployer,
  parseCareer,
  serializeCareer,
} from './career';
import type { Employer } from './employers';
import { FIELDS, PLAYER_TIERS } from './fields';
import { STARTING_REPUTATION } from './meters';
import { EMPLOYER_ARC, PROBATION_WEEK } from './pressure';
import {
  createWorldSession,
  FIRST_WEEK,
  type WeekCarry,
} from './session';
import { REVIEW_PASS_PERFORMANCE } from './week';

/**
 * The Monday-morning graph hash of a fresh probation, pinned.
 *
 * A CONSCIOUS diff, the same rule the golden weeks live by: if this moves, a
 * field leaked onto the probation world that was not there before - which is
 * exactly the failure "the switch is additive" forbids. It moved here because
 * the career carry fields default to writing NOTHING, so the graph is untouched.
 *
 * It moved with 0.7.0 (`c3504ada3edb1031` -> `66ecdc90a6e6b3a6`) for the
 * heterogeneous estate: the probation world now stands up with the IIS box and
 * the two Linux product boxes, every machine carries an `os` field, and the
 * Linux boxes carry systemd `unit` nodes. That is new seed, not a leak - the
 * carry fields still write nothing - and it is the same move the golden weeks
 * take, argued the same way.
 */
const PROBATION_OPENING_HASH = '66ecdc90a6e6b3a6';

/** A second employer that this build does not ship: the switch's test bench. */
const FIXTURE_PLAYER = 'person:fixture-pat';
const FIXTURE_TITLE = 'Second-shop Support Tech';

function fixtureEmployer(): Employer {
  return {
    id: 'fixture-shop',
    name: 'The Fixture Shop',
    playerId: FIXTURE_PLAYER,
    // A different archetype from the locked-down probation shop, which is what
    // slice 3 ships for real; here it just has to be a coherent, different value.
    installPolicy: 'wild_west',
    // Its own arc is slice 3's; for the switch engine the probation arc's shape
    // is fine, and week one of any arc is quiet, so nothing weathers here.
    arc: EMPLOYER_ARC,
    // The switch-engine tests read the arriving player node and never drive the
    // day loop, so the week and rooms can be empty here - a coherent value the
    // session can point the active pointers at, no more. Slice 3's real second
    // employer carries a genuine five-day week; this bench does not need one.
    week: [],
    channels: [],
    reviewBar: REVIEW_PASS_PERFORMANCE,
    runsBossPings: false,
    setup: () => [
      {
        op: 'addNode',
        node: {
          id: FIXTURE_PLAYER,
          kind: 'person',
          fields: {
            [FIELDS.name]: 'Pat Pending',
            // The employer's OWN seed for a fresh starter: a starting standing
            // and the shop's own title. A switch overwrites these from the
            // carry; a fresh start leaves them, which is the pair the tests
            // tell apart.
            [FIELDS.title]: FIXTURE_TITLE,
            [FIELDS.reputation]: STARTING_REPUTATION,
            [FIELDS.weekReputation]: STARTING_REPUTATION,
          },
        },
      },
    ],
    mondayTicketIds: () => [],
  };
}

function fieldOf(carry: Readonly<WeekCarry>, field: string): unknown {
  const { engine } = createWorldSession(carry, undefined, fixtureEmployer());
  return engine.graph.getField(FIXTURE_PLAYER, field);
}

describe('the switch is additive - the probation week is byte-identical', () => {
  it('stands the probation Monday up at the pinned hash', () => {
    expect(createWorldSession().engine.snapshotHash())
      .toBe(PROBATION_OPENING_HASH);
  });

  it('is unmoved by naming the first employer on the carry explicitly', () => {
    const named = createWorldSession({
      farmFund: 0,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'workgrumble',
    });

    expect(named.engine.snapshotHash()).toBe(PROBATION_OPENING_HASH);
    expect(named.employer).toBe('workgrumble');
  });

  it('is unmoved when the carry seeds the standing at the value already seeded', () => {
    // Seeding reputation FROM the carry at exactly the probation seed writes the
    // same value the company already wrote: same graph, same hash. This is the
    // seed-from-carry path proven inert at the default - if it wrote a stray
    // field or a different value, the hash would move.
    const seeded = createWorldSession({
      ...FIRST_WEEK,
      reputation: STARTING_REPUTATION,
    });

    expect(seeded.engine.snapshotHash()).toBe(PROBATION_OPENING_HASH);
  });

  it('reports the carry it was built from, career folded back to absent', () => {
    expect(createWorldSession(FIRST_WEEK).carry).toEqual(FIRST_WEEK);
  });
});

describe('a career rides the switch onto a second employer', () => {
  it('seeds the new player node FROM the carry, not fresh', () => {
    const carry: WeekCarry = {
      farmFund: 8_000,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
      reputation: 72,
      title: 'Senior Analyst',
    };

    // The standing and title CONTINUE across the swap: the second employer's own
    // seed (STARTING_REPUTATION, its own title) is overwritten by what the
    // player carried. Revert the seed-from-carry ops and these read the fixture's
    // fresh seed instead - which is the whole bug this gate forbids.
    expect(fieldOf(carry, FIELDS.reputation)).toBe(72);
    expect(fieldOf(carry, FIELDS.weekReputation)).toBe(72);
    expect(fieldOf(carry, FIELDS.title)).toBe('Senior Analyst');
    expect(fieldOf(carry, FIELDS.farmFund)).toBe(8_000);
  });

  it('leaves the employer\'s own seed when the carry carries no career', () => {
    const fresh: WeekCarry = {
      farmFund: 0,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
    };

    expect(fieldOf(fresh, FIELDS.reputation)).toBe(STARTING_REPUTATION);
    expect(fieldOf(fresh, FIELDS.title)).toBe(FIXTURE_TITLE);
  });

  it('clamps a carried firing penalty to the meter floor', () => {
    // A carry can arrive holding a below-floor standing only if something upstream
    // let it; the world must still stand up, at the floor, rather than refuse.
    const dented: WeekCarry = {
      farmFund: 0,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
      reputation: -5,
    };

    expect(fieldOf(dented, FIELDS.reputation)).toBe(0);
  });
});

describe('determinism per employer', () => {
  it('stands the same world up for the same carry and employer', () => {
    const carry: WeekCarry = {
      farmFund: 3_000,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
      reputation: 60,
      title: 'Analyst',
    };

    const a = createWorldSession(carry, undefined, fixtureEmployer());
    const b = createWorldSession(carry, undefined, fixtureEmployer());

    expect(a.engine.snapshotHash()).toBe(b.engine.snapshotHash());
  });

  it('stands a DIFFERENT world up when the carried standing differs', () => {
    // The teeth on the determinism claim: a hash that did not move with the
    // reputation would be a hash that had stopped depending on the carry.
    const base: WeekCarry = {
      farmFund: 3_000,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
      reputation: 60,
      title: 'Analyst',
    };

    const low = createWorldSession(base, undefined, fixtureEmployer());
    const high = createWorldSession(
      { ...base, reputation: 90 },
      undefined,
      fixtureEmployer(),
    );

    expect(low.engine.snapshotHash()).not.toBe(high.engine.snapshotHash());
  });

  it('stands a DIFFERENT world up for a different employer', () => {
    const carry: WeekCarry = {
      farmFund: 0,
      attempt: 1,
      arcWeek: PROBATION_WEEK,
      employer: 'fixture-shop',
    };

    const probation = createWorldSession();
    const second = createWorldSession(carry, undefined, fixtureEmployer());

    expect(second.employer).toBe('fixture-shop');
    expect(second.engine.snapshotHash())
      .not.toBe(probation.engine.snapshotHash());
  });
});

describe('the career carry survives a save across the switch', () => {
  it('resumes the second employer with the standing that was written down', () => {
    // The full round trip the switch needs: a probation ends, the career it
    // leaves is written to bytes, read back, and turned into the seed for the
    // next employer's first week - and the new world opens holding the standing
    // the player earned rather than a fresh one.
    const left = careerAfter('completed', {
      reputation: 81,
      title: 'Service Desk Analyst',
      farmFund: 55_000,
      tier: PLAYER_TIERS.serviceDesk,
    });

    const back = parseCareer(JSON.parse(serializeCareer(left)));
    expect(back).not.toBeNull();

    const carry = carryForEmployer(back as NonNullable<typeof back>, 'fixture-shop');
    const { engine, employer } = createWorldSession(
      carry,
      undefined,
      fixtureEmployer(),
    );

    expect(employer).toBe('fixture-shop');
    expect(engine.graph.getField(FIXTURE_PLAYER, FIELDS.reputation)).toBe(81);
    expect(engine.graph.getField(FIXTURE_PLAYER, FIELDS.title))
      .toBe('Service Desk Analyst');
    expect(engine.graph.getField(FIXTURE_PLAYER, FIELDS.farmFund)).toBe(55_000);
  });

  it('carries a firing\'s dented standing across the same round trip', () => {
    const left = careerAfter('fired', {
      reputation: 40,
      title: 'Probationer',
      farmFund: 12_000,
      tier: PLAYER_TIERS.serviceDesk,
    });

    const carry = carryForEmployer(
      parseCareer(JSON.parse(serializeCareer(left))) as NonNullable<
        ReturnType<typeof parseCareer>
      >,
      'fixture-shop',
    );
    const { engine } = createWorldSession(carry, undefined, fixtureEmployer());

    // The firing followed the fund across (it always does) and took a bite out
    // of the standing on the way.
    expect(engine.graph.getField(FIXTURE_PLAYER, FIELDS.farmFund)).toBe(12_000);
    expect(engine.graph.getField(FIXTURE_PLAYER, FIELDS.reputation)).toBe(25);
  });
});
