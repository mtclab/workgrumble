import { describe, expect, it } from 'vitest';

import type { SetupOp } from '../engine-api';
import { companySetup } from './company';
import { FIELDS } from './fields';
import { ARC_WEEKS, EMPLOYER_ARC, seasonlessArc } from './pressure';
import {
  EMPLOYER_IDS,
  employerFor,
  employerName,
  FIRST_EMPLOYER,
  isEmployerId,
  nextEmployerAfter,
  validateRegistry,
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

  /**
   * A season belongs to the shop that authored it (#59a).
   *
   * All four employers pointed at `EMPLOYER_ARC` until 0.36.0, which cost four
   * lines and gave the probation shop's redundancy round to every building in
   * the game. Each shop now DECLARES its arc, the arc names its owner, and the
   * registry refuses a mismatch at boot - so the four-line saving cannot be
   * made again by accident.
   */
  it('gives every shop its own arc, and only the one that wrote a season has one', () => {
    expect(employerFor(FIRST_EMPLOYER).arc.seasons).toHaveLength(1);

    for (const id of EMPLOYER_IDS) {
      const arc = employerFor(id).arc;

      expect(arc.employer, id).toBe(id);
      // The same twelve weeks everywhere: a seasonless arc is this arc with
      // nothing on it, not a shorter job.
      expect(arc.weeks, id).toBe(ARC_WEEKS);
      expect(arc.seasons.length, id)
        .toBe(id === FIRST_EMPLOYER ? 1 : 0);
    }
  });

  it('refuses a shop that runs another shop\'s season', () => {
    // The revert, as a refusal: point Bodgeworth back at the probation shop's
    // arc and the build stops instead of shipping a round narrated by five
    // people who work somewhere else.
    expect(() => validateRegistry({
      bodgeworth: { ...employerFor('bodgeworth'), arc: EMPLOYER_ARC },
    })).toThrow('belongs to');
    // And the other half: a shop filed under somebody else's id.
    expect(() => validateRegistry({
      msp: { ...employerFor('bodgeworth'), arc: seasonlessArc('bodgeworth') },
    })).toThrow('files "bodgeworth" under "msp"');
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

/**
 * Who is who, across all four buildings (0.37.1).
 *
 * The Directory app prints and searches usernames, and mail, dialogue and the
 * audit all print display names, so an identity that collides or that belongs
 * to somebody else is a lie the player reads directly. Three of them have
 * shipped: two people who ended up with the same display name in two estates,
 * and an IT manager called Gil Farrant logging in as `cvance` - the login of a
 * first-line junior who works at a different company in a different city.
 *
 * None of the three is catchable by a content review of one file, because each
 * is a fact about a PAIR of files. They are catchable here, where every shop's
 * seed is in one place, so this is where they get forbidden as a class.
 */
interface EstateIdentities {
  /** Account node id -> the login on it. */
  readonly usernames: ReadonlyMap<string, string>;
  /** Person node id -> the name everything prints. */
  readonly people: ReadonlyMap<string, string>;
  /** Account node id -> the person who owns it, where anybody does. */
  readonly holders: ReadonlyMap<string, string>;
}

function identitiesOf(ops: readonly SetupOp[]): EstateIdentities {
  const usernames = new Map<string, string>();
  const people = new Map<string, string>();
  const holders = new Map<string, string>();

  for (const op of ops) {
    if (op.op === 'addNode') {
      const login = op.node.fields[FIELDS.username];
      const name = op.node.fields[FIELDS.name];

      if (typeof login === 'string') {
        usernames.set(op.node.id, login);
      }

      if (op.node.kind === 'person' && typeof name === 'string') {
        people.set(op.node.id, name);
      }
    }

    if (op.op === 'addEdge' && op.edge.kind === 'owns'
      && op.edge.to.startsWith('account:')) {
      holders.set(op.edge.to, op.edge.from);
    }
  }

  return { usernames, people, holders };
}

/**
 * The one login in the estate that is a nickname rather than a name, and is
 * meant to be: Barry Coker has been Baz to everyone at Bodgeworth since before
 * the domain existed, and his login says so. Named here rather than allowed by
 * a looser rule, so that adding a second one is a deliberate line in a test
 * rather than a shrug.
 */
const NICKNAME_LOGINS: ReadonlyMap<string, string> = new Map([
  ['account:baz', 'Barry Coker'],
]);

/**
 * Whether a login is one the person it is on could actually have been given:
 * first-initial-plus-surname (the house convention - `eroe`, `gfarrant`), or
 * their first name or a short form of it (`pat`, `vernon`, `trev`), optionally
 * with the `-ext` suffix the corporate estate hangs on a contractor.
 */
function loginSuitsHolder(username: string, personName: string): boolean {
  const login = username.toLowerCase().replace(/-ext$/, '');
  const parts = personName.toLowerCase().split(/\s+/).filter((p) => p !== '');
  const first = (parts[0] ?? '').replace(/[^a-z]/g, '');
  const surname = (parts.at(-1) ?? '').replace(/[^a-z]/g, '');

  if (parts.length > 1 && login === `${first.slice(0, 1)}${surname}`) {
    return true;
  }

  return login.length >= 3 && first.startsWith(login);
}

describe('identity across the estates', () => {
  it('gives every login to exactly one person, estate by estate and across them', () => {
    const seen = new Map<string, { holder: string; where: string }>();

    for (const employer of EMPLOYER_IDS) {
      const { usernames, holders } = identitiesOf(employerFor(employer).setup());
      const inEstate = new Set<string>();

      for (const [account, login] of usernames) {
        // Within one building a login is a login: two accounts answering to
        // the same string is the thing a domain itself refuses.
        expect(inEstate.has(login), `${employer}/${account}`).toBe(false);
        inEstate.add(login);

        // Across buildings it may repeat only when it is the SAME human -
        // which it is exactly once, because Pat carries from job to job and
        // keeps being Pat. Anybody else reusing a login is two people wearing
        // one name in a game that prints both.
        const holder = holders.get(account) ?? account;
        const prior = seen.get(login);

        expect(prior?.holder ?? holder, `${login} at ${employer}, ${prior?.where ?? ''}`)
          .toBe(holder);
        seen.set(login, { holder, where: `${employer}/${account}` });
      }
    }
  });

  it('puts a login on the person it belongs to', () => {
    for (const employer of EMPLOYER_IDS) {
      const { usernames, people, holders } = identitiesOf(
        employerFor(employer).setup(),
      );

      for (const [account, login] of usernames) {
        const holder = holders.get(account);

        // Accounts nobody owns are the shared and service ones - the office
        // login at Bodgeworth, the two service accounts at Halcyon - and a
        // person's name is not what those are named after.
        if (holder === undefined) {
          continue;
        }

        const name = people.get(holder);
        expect(name, `${employer}/${account}`).toBeDefined();

        const nickname = NICKNAME_LOGINS.get(account);
        expect(
          nickname === name || loginSuitsHolder(login, name ?? ''),
          `${employer}/${account}: "${login}" is not ${name ?? '?'}'s login`,
        ).toBe(true);
      }
    }
  });

  it('gives every person their own name, across the estates', () => {
    const named = new Map<string, string>();

    for (const employer of EMPLOYER_IDS) {
      for (const [id, name] of identitiesOf(employerFor(employer).setup()).people) {
        // Same name, same person: Pat is in all four buildings under one node
        // id. Two different ids under one name is the collision that has
        // shipped twice, and it reads as one person being in two places.
        const prior = named.get(name);

        expect(prior ?? id, `${name} at ${employer}`).toBe(id);
        named.set(name, id);
      }
    }
  });
});
