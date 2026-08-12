import { describe, expect, it } from 'vitest';

import { companySetup } from './company';
import { EMPLOYER_ARC } from './pressure';
import {
  EMPLOYER_IDS,
  employerFor,
  employerName,
  FIRST_EMPLOYER,
  isEmployerId,
  nextEmployerAfter,
} from './employers';

describe('the employer registry', () => {
  it('resolves the probation shop by name and by default', () => {
    const byName = employerFor(FIRST_EMPLOYER);
    const byDefault = employerFor();

    expect(byName).toBe(byDefault);
    expect(byName.id).toBe(FIRST_EMPLOYER);
  });

  it('stands the probation shop up as the company seed, unchanged', () => {
    // The employer is a wrapper, not a rewrite: standing it up has to be the
    // same ops the session used to reach for directly, or the probation goldens
    // would move. The cheapest proof is that the setup IS the company seed.
    expect(employerFor().setup()).toEqual(companySetup());
    expect(employerFor().arc).toBe(EMPLOYER_ARC);
  });

  it('refuses an employer this build has never shipped', () => {
    // The back-compat rule is "absent means the first employer" - NOT "unknown
    // means the first employer". A save that names a company this version does
    // not have would otherwise be stood up as the wrong world, silently. If the
    // guard is dropped, this throw stops.
    expect(() => employerFor('a-shop-that-does-not-exist')).toThrow();
  });

  it('knows its own ids and nobody else', () => {
    for (const id of EMPLOYER_IDS) {
      expect(isEmployerId(id)).toBe(true);
    }

    expect(isEmployerId('nope')).toBe(false);
    expect(isEmployerId(undefined)).toBe(false);
    expect(isEmployerId(0)).toBe(false);
  });

  it('ships a second employer to switch to', () => {
    // Slice 2 needs somewhere to arrive; the second entry is a PLACEHOLDER that
    // reuses the probation content under its own id and name, and slice 3
    // replaces the content. What has to be true today is that it resolves, it is
    // a different id, and it has a name of its own for the offer to print.
    expect(EMPLOYER_IDS.length).toBeGreaterThan(1);
    const second = employerFor('bodgeworth');
    expect(second.id).toBe('bodgeworth');
    expect(second.id).not.toBe(FIRST_EMPLOYER);
    expect(second.name.length).toBeGreaterThan(0);
    expect(second.name).not.toBe(employerFor(FIRST_EMPLOYER).name);
  });

  it('ships the MSP as a third employer, reached after Bodgeworth', () => {
    // 0.8.0: the MSP is a real third entry, resolves to its own id and name, and
    // is where a career lands after Bodgeworth via the same offer/switch hop.
    // Drop it from the registry and this whole block goes red.
    const msp = employerFor('msp');
    expect(msp.id).toBe('msp');
    expect(msp.name.length).toBeGreaterThan(0);
    expect(msp.name).not.toBe(employerFor(FIRST_EMPLOYER).name);
    expect(msp.name).not.toBe(employerFor('bodgeworth').name);
    expect(nextEmployerAfter('bodgeworth')).toBe('msp');
    // Its Monday pile is its own customer's ticket, not another shop's - read
    // off the shop's own week, which since 0.34.0 is the single answer to what
    // a Monday deals (the session spawns the resolved week's first day, so a
    // second list here could disagree with the queue and used to).
    expect(msp.week[0]?.inherited).toContain('ticket:fontaine-matter-access');
  });

  it('names an employer, and falls back to the id for a stranger', () => {
    expect(employerName(FIRST_EMPLOYER)).toBe(employerFor(FIRST_EMPLOYER).name);
    // Tolerant where employerFor is strict: a fixture id gets its own id back
    // rather than a crash, because the offer screen has to say SOMETHING.
    expect(employerName('fixture-shop')).toBe('fixture-shop');
  });

  it('points a career at the next employer, and defines every hop', () => {
    // From the probation shop, the next job is the second employer - the whole
    // of what slice 2 drives.
    expect(nextEmployerAfter(FIRST_EMPLOYER)).toBe('bodgeworth');
    // Every id resolves to a shipped employer, wrap included: a dead end here
    // would be a switch that reloaded into `employerFor(undefined)`.
    for (const id of EMPLOYER_IDS) {
      expect(isEmployerId(nextEmployerAfter(id))).toBe(true);
    }
    // A stranger id leaves from the first employer, the only one it could have
    // coherently been at.
    expect(nextEmployerAfter('a-shop-that-does-not-exist'))
      .toBe(nextEmployerAfter(FIRST_EMPLOYER));
  });
});
