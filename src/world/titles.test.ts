import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CAREER_ACTION_DATA } from './actions/career';
import { CAREER_ACTIONS } from './actions/ids';
import { FRESH_CAREER_TIER } from './career';
import { employerFor, isEmployerId } from './employers';
import {
  FIELDS,
  PLAYER_TIERS,
  serviceScopeOf,
  slaTierOf,
} from './fields';
import { isOnCall } from './on-call';
import {
  BUILT_RUNGS,
  DEFAULT_RUNG,
  ENGINEER_OFFER_AT,
  ENGINEER_TITLE,
  offeredAtFor,
  RATES_PROFILES,
  RUNGS,
  rowFor,
  rungFor,
  SLA_PROFILES,
  sheetShapeFor,
  tierFor,
  TITLE_TABLE,
  utilisationTargetFor,
  WORK_KINDS,
} from './titles';

/**
 * The table itself: that it holds together, and that what it says is true of
 * the game rather than true of the document it came from (E9, 0.35.0 slice 1).
 */
describe('the rung table', () => {
  it('has a row per rung of the ladder, and seven of them', () => {
    expect(RUNGS).toHaveLength(7);

    for (const rung of RUNGS) {
      expect(TITLE_TABLE[rung].id).toBe(rung);
      expect(TITLE_TABLE[rung].label.length).toBeGreaterThan(0);
      expect(TITLE_TABLE[rung].title.length).toBeGreaterThan(0);
      // The shape break is the reason the rung exists as a difficulty rather
      // than as a name, so a row without one is a rung nobody has designed.
      expect(TITLE_TABLE[rung].shapeBreak.length).toBeGreaterThan(20);
    }
  });

  it('says exactly three rungs are built, and they all have tiers', () => {
    expect(BUILT_RUNGS).toEqual(['sd_junior', 'sd_senior', 'systems_engineer']);

    for (const rung of RUNGS) {
      const row = TITLE_TABLE[rung];

      // The one-to-one that makes a rung need no field of its own on the player
      // node: a built rung has a PAM tier the world already carries, and an
      // unbuilt one has nothing to stand on.
      expect(row.built, rung).toBe(row.tier !== null);
      expect(row.built, rung).toBe(row.employer !== null);
    }
  });

  it('starts every built rung at a shop this build ships', () => {
    for (const rung of BUILT_RUNGS) {
      expect(isEmployerId(TITLE_TABLE[rung].employer), rung).toBe(true);
    }
  });

  it('blends every kind of work between never and as-the-shop-deals-it', () => {
    for (const rung of RUNGS) {
      for (const kind of WORK_KINDS) {
        const factor = TITLE_TABLE[rung].workMix[kind];

        expect(factor, `${rung}/${kind}`).toBeGreaterThanOrEqual(0);
        expect(factor, `${rung}/${kind}`).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * D2, as an assertion rather than as prose: the desk classes LESSEN going up
   * the ladder and never reach nought. This is the decision the whole table is
   * for, and it is the one a well-meaning tuning pass would break first.
   *
   * Device work is held to the same rule only from the DESKTOP rung up, because
   * that rung is the one exception in the ladder and it is a designed one: L2 is
   * the device rung, so its device factor goes back up to the shop's own rate
   * before every rung above it thins. Asserting a single monotone line over all
   * four kinds would be asserting a ladder we do not believe in.
   */
  it('lessens the lower work up the ladder, and never deletes it', () => {
    const ladder = RUNGS.map((rung) => TITLE_TABLE[rung]);

    for (const [index, row] of ladder.entries()) {
      const above = ladder[index + 1];

      if (above === undefined) {
        continue;
      }

      expect(above.workMix.access, above.id).toBeLessThanOrEqual(row.workMix.access);

      if (index >= RUNGS.indexOf('l2_desktop')) {
        expect(above.workMix.device, above.id)
          .toBeLessThanOrEqual(row.workMix.device);
      }
    }

    expect(TITLE_TABLE.l2_desktop.workMix.device)
      .toBe(TITLE_TABLE.sd_junior.workMix.device);

    for (const rung of RUNGS) {
      // "A senior still resets the odd password; an architect rarely sees one
      // but still catches the outage-adjacent basics."
      expect(TITLE_TABLE[rung].workMix.access, rung).toBeGreaterThan(0);
      expect(TITLE_TABLE[rung].workMix.server, rung).toBeGreaterThan(0);
    }
  });

  it('gives the junior rung the shop exactly as it deals it', () => {
    // The row that has to be transcription rather than design: the probation
    // game IS the junior difficulty, so every factor but project work is one.
    expect(TITLE_TABLE.sd_junior.workMix)
      .toEqual({ access: 1, device: 1, server: 1, project: 0 });
    expect(DEFAULT_RUNG).toBe('sd_junior');
  });

  it('gives every rung its own goal', () => {
    const goals = RUNGS.map((rung) => TITLE_TABLE[rung].winCondition);

    expect(new Set(goals).size).toBe(goals.length);

    for (const goal of goals) {
      expect(goal).toMatch(/^win:[a-z_]+$/u);
    }
  });

  it('refers only to profiles this build has', () => {
    const slas = new Set(Object.values(SLA_PROFILES));
    const rates = new Set(Object.values(RATES_PROFILES));

    for (const rung of RUNGS) {
      expect(slas.has(TITLE_TABLE[rung].sla), rung).toBe(true);
      expect(rates.has(TITLE_TABLE[rung].rates), rung).toBe(true);
    }
  });

  it('refuses to answer for a rung that has no tier or no offer', () => {
    expect(() => tierFor('architect')).toThrow(/no tier/u);
    expect(() => offeredAtFor('sd_junior')).toThrow(/no standing|names none/u);
  });

  /* -- the utilisation column (E9/E10 bridge, 0.39.0) --------------------- */

  /**
   * The target as SHIPPED, pinned rung by rung.
   *
   * Literals rather than a read of the table, deliberately: this is the one
   * column that is purely a difficulty knob, so a change to any figure has to
   * be a change somebody came here and made on purpose rather than one that
   * slid past behind a green suite.
   */
  it('asks each built rung for what the research says it is asked for', () => {
    // NONE. One bucket a day at seven and a half hours, so every basis over a
    // probationer's sheet is a constant and a target could not be moved by
    // anything they did.
    expect(TITLE_TABLE.sd_junior.utilisation).toBeNull();
    expect(utilisationTargetFor('sd_junior')).toBeNull();
    // 85% RECORDED at the senior desk (MetricNet's 75-85 band, the top of it
    // the honest ask). It is the figure that stood here at 0.38.0, came off at
    // 0.39.0 because the tier-keyed sheet cleared it before the player did
    // anything, and came back at 0.40.0 with the per-party sheet that makes it
    // the ledger's answer instead of the shape's.
    expect(TITLE_TABLE.sd_senior.utilisation)
      .toEqual({ basis: 'recorded', percent: 85 });
    expect(utilisationTargetFor('sd_senior'))
      .toEqual({ basis: 'recorded', percent: 85 });
    // REAL: the industry ask an honest week does not reach (Promys, 75%).
    expect(utilisationTargetFor('systems_engineer'))
      .toEqual({ basis: 'billable', percent: 75 });
  });

  it('names no target at a rung nobody can play yet', () => {
    // A target is a claim about a WEEK, and there is no week at those rungs to
    // measure one against. The same refusal `tier` and `employer` make on the
    // same rows, and the seam is the column for the day one is built.
    for (const rung of RUNGS) {
      if (TITLE_TABLE[rung].built) {
        continue;
      }

      expect(utilisationTargetFor(rung), rung).toBeNull();
    }
  });

  it('keeps every target a percentage of a week somebody could work', () => {
    for (const rung of RUNGS) {
      const target = TITLE_TABLE[rung].utilisation;

      if (target === null) {
        continue;
      }

      // Nought is refused as hard as a hundred and one: a nought target is met
      // by doing nothing at all, which is a target that lies rather than no
      // target. The way to ask for nothing is null.
      expect(target.percent, rung).toBeGreaterThan(0);
      expect(target.percent, rung).toBeLessThanOrEqual(100);
      // And the basis a rung's own customers can produce. `billable` over an
      // in-house rung is nought every week for reasons the player cannot touch,
      // which is a permanently red row rather than a difficulty.
      if (TITLE_TABLE[rung].customers.inHouse) {
        expect(target.basis, rung).toBe('recorded');
      }
    }
  });

  /* -- the sheet a rung fills in (0.40.0) -------------------------------- */

  /**
   * The shape column, and the pairing with the target that is the whole reason
   * it is a column at all.
   *
   * Literals per rung for the reason the targets above are literals: this is
   * the paperwork ramp, so a rung changing which sheet it fills in has to be
   * somebody's decision rather than a thing that slid past behind a green
   * suite.
   */
  it('walks the paperwork ramp one rung at a time', () => {
    expect(sheetShapeFor('sd_junior')).toBe('single_bucket');
    expect(sheetShapeFor('sd_senior')).toBe('per_customer');
    expect(sheetShapeFor('systems_engineer')).toBe('per_customer_project');
    // And the unbuilt rungs carry the nearest built rung BELOW them, which is
    // the honest default: the ramp does not go back down, and a rung built
    // later starts from the sheet its neighbour already has rather than from a
    // blank. It is why every row carries a shape while four carry no target.
    expect(sheetShapeFor('l2_desktop')).toBe('per_customer');
    expect(sheetShapeFor('senior_engineer')).toBe('per_customer_project');
    expect(sheetShapeFor('team_lead')).toBe('per_customer_project');
    expect(sheetShapeFor('architect')).toBe('per_customer_project');

    for (const rung of RUNGS) {
      expect(TITLE_TABLE[rung].sheet, rung).toBe(sheetShapeFor(rung));
    }
  });

  /*
   * NO LOOP TESTS FOR THE TARGET-AGAINST-SHAPE PAIRINGS, and the absence is
   * deliberate (0.40.0 verifier round): `TITLE_TABLE` refuses a target over a
   * one-bucket sheet and a billable basis over a sheet with no billable line
   * AT MODULE LOAD, so a test restating either condition can never fail with
   * its own message - the import throws first. The load guards are the gate
   * (proven: a bad row on either condition fails the whole file at import,
   * naming the rung), and a test that reads as teeth while being unreachable
   * is decoration this suite does not keep.
   */
});

/**
 * The customer mix, checked against the estate each built rung is hired into.
 *
 * A declaration nobody checks is decoration. These two assertions are what make
 * the field mean something: an in-house rung's shop sells no contracts, and a
 * contract rung's shop sells exactly the scopes and tiers the row claims -
 * neither more (a rung claiming a contract that does not exist) nor fewer (a
 * shop that grew a tier nobody's row knows about).
 */
describe('the customer mix is the shop\'s own', () => {
  const customersAt = (
    employer: string,
  ): { scopes: Set<string>; tiers: Set<string> } => {
    const scopes = new Set<string>();
    const tiers = new Set<string>();

    for (const op of employerFor(employer).setup()) {
      if (op.op === 'addNode' && op.node.kind === 'customer') {
        const scope = serviceScopeOf(op.node.fields[FIELDS.customerServiceScope]);
        const tier = slaTierOf(op.node.fields[FIELDS.customerSlaTier]);

        if (scope !== null) {
          scopes.add(scope);
        }

        if (tier !== null) {
          tiers.add(tier);
        }
      }
    }

    return { scopes, tiers };
  };

  it.each(BUILT_RUNGS)('%s meets the customers its shop actually has', (rung) => {
    const row = TITLE_TABLE[rung];
    const { scopes, tiers } = customersAt(row.employer ?? '');

    if (row.customers.inHouse) {
      expect(scopes.size, `${rung} is in-house`).toBe(0);
      expect(row.customers.scopes).toEqual([]);
      expect(row.customers.slaTiers).toEqual([]);
      return;
    }

    expect([...row.customers.scopes].sort()).toEqual([...scopes].sort());
    expect([...row.customers.slaTiers].sort()).toEqual([...tiers].sort());
  });
});

/**
 * ONE TRUTH: the constants that moved into the table are gone from where they
 * were, and the game reads the row.
 *
 * Both halves matter. The behaviour assertions prove the game is reading the
 * table (change a row and they move with it); the source assertions prove the
 * old copy is DELETED rather than left behind agreeing with it, which is the
 * failure a behaviour test cannot see.
 */
describe('the constants moved in, and their old homes are dead', () => {
  it('writes the promotion off the row rather than off a constant', () => {
    const promotion = CAREER_ACTION_DATA.find(
      (action) => action.id === CAREER_ACTIONS.acceptPromotion,
    );
    const writes = promotion?.apply ?? [];

    expect(JSON.stringify(writes)).toContain(TITLE_TABLE.systems_engineer.title);
    expect(ENGINEER_TITLE).toBe(TITLE_TABLE.systems_engineer.title);
    expect(ENGINEER_OFFER_AT).toBe(TITLE_TABLE.systems_engineer.offeredAt);
    expect(JSON.stringify(promotion?.validate ?? []))
      .toContain(String(ENGINEER_OFFER_AT));
  });

  it('seeds the probationer with the junior row\'s title', () => {
    const seeded = employerFor('workgrumble').setup().find(
      (op) => op.op === 'addNode' && op.node.id === 'person:pat',
    );

    expect(JSON.stringify(seeded)).toContain(TITLE_TABLE.sd_junior.title);
  });

  it('carries the pager because the row says so, not because of a tier', () => {
    expect(isOnCall(PLAYER_TIERS.systemsEngineer))
      .toBe(TITLE_TABLE.systems_engineer.carriesPager);
    expect(isOnCall(PLAYER_TIERS.serviceDesk))
      .toBe(TITLE_TABLE.sd_junior.carriesPager);
    // And the back-compat default every tier reader keeps: an absent tier is
    // the desk, and the desk does not carry a pager.
    expect(isOnCall(undefined)).toBe(false);
  });

  /**
   * `isOnCall` reads the tier and no title, which is a shortcut - and this is
   * what makes it a safe one rather than a lucky one. Two rungs will share the
   * service desk tier, so the shortcut is only honest while every rung on a
   * tier agrees about the pager. The day one of them disagrees, this goes red
   * here rather than a senior analyst being quietly paged at two in the
   * morning.
   */
  it('lets every rung on one tier agree about the pager', () => {
    const byTier = new Map<string, boolean>();

    for (const rung of RUNGS) {
      const row = TITLE_TABLE[rung];

      if (row.tier === null) {
        continue;
      }

      const seen = byTier.get(row.tier);
      expect(seen ?? row.carriesPager, rung).toBe(row.carriesPager);
      byTier.set(row.tier, row.carriesPager);
    }
  });

  it('starts a fresh career on the bottom rung\'s tier', () => {
    expect(FRESH_CAREER_TIER).toBe(tierFor(DEFAULT_RUNG));
    expect(rungFor(PLAYER_TIERS.systemsEngineer)).toBe('systems_engineer');
    expect(rowFor(PLAYER_TIERS.serviceDesk).id).toBe('sd_junior');
    // And the title is the OTHER half of the read since 0.36.0, for the rung
    // that shares the desk tier. Nothing recognised - a title from an
    // unbuilt row, a hand-edited save, a build that has renamed a row - falls
    // back to the bottom of the ladder rather than guessing, which is the whole
    // of what the fallback is for.
    expect(rungFor(PLAYER_TIERS.serviceDesk, TITLE_TABLE.sd_senior.title))
      .toBe('sd_senior');
    expect(rungFor(PLAYER_TIERS.serviceDesk, 'Chief Beverage Officer'))
      .toBe('sd_junior');

    // The read is only ambiguous if two rows can be told apart by their title,
    // so the table refuses a shared one - proven rather than assumed, because
    // the day the senior rung opens this is what stops it being dealt the
    // probationer's week.
    const titles = RUNGS.map((rung) => TITLE_TABLE[rung].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('leaves nothing behind at the old homes', () => {
    const career = readFileSync('src/world/actions/career.ts', 'utf8');

    expect(career).not.toContain('export const PROMOTION_REPUTATION');
    expect(career).not.toContain('export const SYSTEMS_ENGINEER_TITLE');
    // Not merely undeclared: not written down at all, in either place.
    expect(career).not.toContain('= 70');
    expect(career).not.toContain("'Systems Engineer'");

    const company = readFileSync('src/world/company.ts', 'utf8');

    expect(company).not.toContain('IT Support Technician (probationary)');

    const onCall = readFileSync('src/world/on-call.ts', 'utf8');

    expect(onCall).not.toContain('isSystemsEngineer(');

    const careerCarry = readFileSync('src/world/career.ts', 'utf8');

    expect(careerCarry).not.toContain('FRESH_CAREER_TIER: PlayerTier = PLAYER_TIERS');

    const barrel = readFileSync('src/world/actions/index.ts', 'utf8');

    expect(barrel).not.toContain('PROMOTION_REPUTATION');
    expect(barrel).not.toContain('SYSTEMS_ENGINEER_TITLE');
  });
});
