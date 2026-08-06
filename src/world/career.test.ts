import { describe, expect, it } from 'vitest';

import { PLAYER_TIERS } from './fields';
import { STARTING_REPUTATION } from './meters';
import { PROBATION_WEEK } from './pressure';
import {
  careerAfter,
  carryForEmployer,
  type CareerStanding,
  type EmployerCareer,
  EMPLOYER_EXITS,
  FIRED_REPUTATION_PENALTY,
  parseCareer,
  serializeCareer,
} from './career';

const STANDING: CareerStanding = Object.freeze({
  reputation: 62,
  title: 'IT Support Technician',
  farmFund: 42_000,
  tier: PLAYER_TIERS.serviceDesk,
});

describe('the exit -> carry mapping', () => {
  it('carries a completed probation clean', () => {
    const career = careerAfter('completed', STANDING);

    expect(career.reputation).toBe(STANDING.reputation);
    expect(career.title).toBe(STANDING.title);
    expect(career.trail).toBeNull();
  });

  it('carries a resignation with a trail but no reputation hit', () => {
    const career = careerAfter('resigned', STANDING);

    // A resign is on the record - the next employer's offer is allowed to read
    // it - but it is not a mark against the standing you earned.
    expect(career.reputation).toBe(STANDING.reputation);
    expect(career.trail).toBe('resigned');
  });

  it('dents the standing on a firing and leaves a trail', () => {
    const career = careerAfter('fired', STANDING);

    expect(career.reputation).toBe(STANDING.reputation - FIRED_REPUTATION_PENALTY);
    expect(career.trail).toBe('fired');
  });

  it('never lets the firing penalty push the standing below the floor', () => {
    const career = careerAfter('fired', { ...STANDING, reputation: 3 });

    // Clamped, not negative: a graph refuses a reputation below nought, so a
    // carry that produced one would refuse to stand the next employer up.
    expect(career.reputation).toBe(0);
  });

  it('carries the farm fund through EVERY exit - the one joke', () => {
    for (const exit of EMPLOYER_EXITS) {
      expect(careerAfter(exit, STANDING).farmFund).toBe(STANDING.farmFund);
    }
  });

  it('turns a career into the next employer\'s week-one seed', () => {
    const career = careerAfter('completed', STANDING);
    const carry = carryForEmployer(career, 'workgrumble');

    // A new employer is a fresh probation there: attempt one, week one of ITS
    // arc, and the standing and title ride across as the world-seed fields.
    expect(carry.attempt).toBe(1);
    expect(carry.arcWeek).toBe(PROBATION_WEEK);
    expect(carry.employer).toBe('workgrumble');
    expect(carry.reputation).toBe(STANDING.reputation);
    expect(carry.title).toBe(STANDING.title);
    expect(carry.farmFund).toBe(STANDING.farmFund);
  });
});

describe('a career across a switch, written down and read back', () => {
  const ROUND: readonly EmployerCareer[] = EMPLOYER_EXITS.map(
    (exit) => careerAfter(exit, STANDING),
  );

  it('round-trips every exit\'s career through its own bytes', () => {
    for (const career of ROUND) {
      const back = parseCareer(JSON.parse(serializeCareer(career)));

      expect(back).toEqual(career);
    }
  });

  it('refuses a record that has lost a piece of itself', () => {
    const good = serializeCareer(careerAfter('fired', STANDING));
    const bag = JSON.parse(good) as Record<string, unknown>;

    expect(parseCareer(good)).toBeNull(); // a string is not a record
    expect(parseCareer({ ...bag, reputation: -1 })).toBeNull();
    expect(parseCareer({ ...bag, reputation: 'high' })).toBeNull();
    expect(parseCareer({ ...bag, title: '' })).toBeNull();
    expect(parseCareer({ ...bag, farmFund: undefined })).toBeNull();
    expect(parseCareer(null)).toBeNull();
    expect(parseCareer([])).toBeNull();
  });

  it('reads an unknown trail as no trail rather than refusing the fund', () => {
    const bag = JSON.parse(
      serializeCareer(careerAfter('completed', STANDING)),
    ) as Record<string, unknown>;
    const back = parseCareer({ ...bag, trail: 'sabbatical' });

    // A save from a later build with a third trail is still a fund and a
    // standing somebody earned; the mark this build cannot read drops to null.
    expect(back?.trail).toBeNull();
    expect(back?.farmFund).toBe(STANDING.farmFund);
  });

  it('starts a fresh career at the meter floor for a standing, by construction', () => {
    // Nothing here should read below the meter's own starting point as a
    // "standing" - a career begins at STARTING_REPUTATION, and the parse guard
    // accepts it.
    const fresh: EmployerCareer = {
      reputation: STARTING_REPUTATION,
      title: 'Probationer',
      farmFund: 0,
      trail: null,
      tier: PLAYER_TIERS.serviceDesk,
    };

    expect(parseCareer(JSON.parse(serializeCareer(fresh)))).toEqual(fresh);
  });

  it('reads an absent or unknown tier as the desk rather than refusing', () => {
    const bag = JSON.parse(
      serializeCareer(careerAfter('completed', STANDING)),
    ) as Record<string, unknown>;

    // A switch record written before the tier existed - every one any prior
    // build wrote - is a career at the service desk, which is what it was.
    expect(parseCareer({ ...bag, tier: undefined })?.tier)
      .toBe(PLAYER_TIERS.serviceDesk);
    expect(parseCareer({ ...bag, tier: 'principal_architect' })?.tier)
      .toBe(PLAYER_TIERS.serviceDesk);
  });
});

describe('the promotion crosses the switch permanently', () => {
  const ENGINEER: CareerStanding = {
    ...STANDING,
    title: 'Systems Engineer',
    tier: PLAYER_TIERS.systemsEngineer,
  };

  it('carries the engineer tier through every exit - even a firing', () => {
    // The tier is not a thing you are fired out of: a Systems Engineer let go
    // is still a Systems Engineer at the next desk, dented reputation and all.
    for (const exit of EMPLOYER_EXITS) {
      expect(careerAfter(exit, ENGINEER).tier)
        .toBe(PLAYER_TIERS.systemsEngineer);
    }
  });

  it('seeds the next week from the carried tier', () => {
    const carry = carryForEmployer(careerAfter('fired', ENGINEER), 'bodgeworth');

    expect(carry.playerTier).toBe(PLAYER_TIERS.systemsEngineer);
  });
});
