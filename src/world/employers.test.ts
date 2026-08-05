import { describe, expect, it } from 'vitest';

import { companySetup } from './company';
import { EMPLOYER_ARC } from './pressure';
import {
  EMPLOYER_IDS,
  employerFor,
  FIRST_EMPLOYER,
  isEmployerId,
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
});
