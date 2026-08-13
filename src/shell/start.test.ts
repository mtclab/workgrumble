import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { employerFor } from '../world/employers';
import { FIELDS, isSystemsEngineer, PLAYER_TIERS } from '../world/fields';
import { isOnCall } from '../world/on-call';
import { createWorldSession, FIRST_WEEK } from '../world/session';
import { ENGINEER_OFFER_AT, TITLE_TABLE } from '../world/titles';
import {
  carryForStart,
  parseStartRecord,
  START_KEY,
  StartSlot,
  startsPromoted,
} from './start';

/**
 * THE START SELECT, from the record on disk to the world it stands up (E9,
 * 0.35.0 slice B).
 *
 * The claim under test is the one a select is worth nothing without: picking
 * the engineer's desk does not merely write "Systems Engineer" on a lanyard, it
 * hands the player the engineer's JOB - the tier, the pager, the servers, the
 * shop that has them - and it does it through the promotion's own machinery
 * rather than through a second implementation of being an engineer.
 */

beforeAll(() => {
  loadEngineForTests();
});

/** A storage that keeps what it is given, and one that refuses everything. */
function memoryStorage(): Storage {
  const held = new Map<string, string>();

  return {
    get length(): number {
      return held.size;
    },
    clear: (): void => {
      held.clear();
    },
    getItem: (key: string): string | null => held.get(key) ?? null,
    key: (index: number): string | null => [...held.keys()][index] ?? null,
    removeItem: (key: string): void => {
      held.delete(key);
    },
    setItem: (key: string, value: string): void => {
      held.set(key, value);
    },
  };
}

function refusingStorage(): Storage {
  return {
    ...memoryStorage(),
    setItem: (): void => {
      throw new Error('quota');
    },
  };
}

describe('the desk a career starts at', () => {
  it('leaves the standard desk exactly as it has always been', () => {
    // Byte-identical, and it has to be: the junior row IS the shipped game, so
    // a start at it must produce the carry a new game has always produced -
    // same fund, same attempt, same week of the arc, same shop, and none of the
    // career fields written at all.
    expect(carryForStart('sd_junior')).toEqual(FIRST_WEEK);
  });

  it('starts the engineer at the shop, the tier and the title of its row', () => {
    const carry = carryForStart('systems_engineer');
    const row = TITLE_TABLE.systems_engineer;

    expect(carry.employer).toBe(row.employer);
    expect(carry.playerTier).toBe(row.tier);
    expect(carry.title).toBe(row.title);
    // A first week at a first job: nothing carried from a career that has not
    // happened, and the arc at its beginning.
    expect(carry.farmFund).toBe(0);
    expect(carry.attempt).toBe(1);
    expect(carry.arcWeek).toBe(1);
  });

  it('does not hand the hire the standing a promotion is earned at', () => {
    // The title buys the WORK, not the reputation: a player hired as an
    // engineer starts on the shop's own figure, well below the bar the
    // promotion is offered at.
    expect(carryForStart('systems_engineer').reputation)
      .toBeLessThan(ENGINEER_OFFER_AT);
  });

  it('knows which starts cross the tier', () => {
    expect(startsPromoted({ rung: 'systems_engineer' })).toBe(true);
    expect(startsPromoted({ rung: 'sd_junior' })).toBe(false);
  });
});

/**
 * THE JOURNEY, not the transition. A carry with the right fields on it is not
 * evidence that anybody got a job: what counts is the world on the other side.
 */
describe('the world an engineer start stands up', () => {
  const session = createWorldSession(carryForStart('systems_engineer'));
  const tierOf = (): unknown => session.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.playerTier,
  );

  it('is at the MSP, with the engineer tier written on the player', () => {
    expect(session.employer).toBe('msp');
    expect(isSystemsEngineer(tierOf())).toBe(true);
    expect(session.engine.graph.getField(COMPANY_IDS.player, FIELDS.title))
      .toBe(TITLE_TABLE.systems_engineer.title);
  });

  it('carries the pager, which is what the rung says it does', () => {
    expect(isOnCall(tierOf())).toBe(TITLE_TABLE.systems_engineer.carriesPager);
  });

  it('deals a week with the pager beats in it', () => {
    // The MSP's week authors on-call pages, and an engineer is the only player
    // they fire for. A start that put the title on and left the nights empty
    // would be the difficulty select delivering a lanyard.
    const pages = session.week.flatMap((day) => day.onCall ?? []);

    expect(pages.length).toBeGreaterThan(0);
  });

  it('opens on the shop\'s own Monday pile rather than an empty desk', () => {
    const monday = session.week[0]?.inherited ?? [];

    expect(monday.length).toBeGreaterThan(0);

    for (const id of monday) {
      expect(session.engine.graph.getNode(id)).toBeDefined();
    }
  });

  /**
   * ONE WAY TO BE AN ENGINEER. The hired player and the promoted player are the
   * same player, field for field, because the start goes through the carry the
   * promotion's own switch uses. If a second implementation ever grows, this is
   * where it shows up as a difference.
   */
  it('writes exactly what the promotion writes', () => {
    const promoted = createWorldSession({ ...FIRST_WEEK, employer: 'msp' });

    promoted.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reputation,
      value: ENGINEER_OFFER_AT,
    }]);
    promoted.engine.dispatch(
      CAREER_ACTIONS.acceptPromotion,
      COMPANY_IDS.player,
      COMPANY_IDS.player,
      {},
    );

    for (const field of [FIELDS.playerTier, FIELDS.title]) {
      expect(promoted.engine.graph.getField(COMPANY_IDS.player, field))
        .toBe(session.engine.graph.getField(COMPANY_IDS.player, field));
    }
  });

  it('refuses the promotion, because there is nothing left to cross', () => {
    const again = session.engine.dispatch(
      CAREER_ACTIONS.acceptPromotion,
      COMPANY_IDS.player,
      COMPANY_IDS.player,
      {},
    );

    expect(again.ok).toBe(false);
  });

  it('needs no schema it did not already have', () => {
    // The whole of the start state is the three career fields the carry has
    // held since 0.6.0 and E6. Nothing here is new, which is why an engineer
    // start's save is the same file a promoted player's is.
    expect(Object.keys(carryForStart('systems_engineer')).sort()).toEqual([
      'arcWeek', 'attempt', 'employer', 'farmFund', 'playerTier', 'reputation',
      'title',
    ]);
  });
});

describe('the start slot', () => {
  it('keeps a desk and gives it back', () => {
    const storage = memoryStorage();
    const slot = new StartSlot(storage);

    expect(slot.write({ rung: 'systems_engineer' }).ok).toBe(true);
    expect(slot.peek()).toEqual({ rung: 'systems_engineer' });
    // Read and LEFT: the pick survives a refresh taken before the first day
    // boundary has written a save.
    expect(slot.peek()).toEqual({ rung: 'systems_engineer' });

    slot.clear();

    expect(slot.peek()).toBeNull();
  });

  it('answers rather than throwing when the browser will not keep it', () => {
    const outcome = new StartSlot(refusingStorage()).write({ rung: 'sd_junior' });

    expect(outcome.ok).toBe(false);
  });

  it('refuses a rung nobody has written, however it got into the slot', () => {
    // The teeth on the select's honesty: a hand-edited slot naming an unbuilt
    // rung must not stand up a world that calls somebody an architect and deals
    // them a probationer's week.
    const storage = memoryStorage();
    storage.setItem(START_KEY, JSON.stringify({ rung: 'architect' }));

    expect(new StartSlot(storage).peek()).toBeNull();

    for (const rubbish of [null, 42, 'sd_junior', {}, { rung: 'nonsense' }, []]) {
      expect(parseStartRecord(rubbish), JSON.stringify(rubbish)).toBeNull();
    }
  });

  it('reads back every rung that IS built', () => {
    for (const rung of ['sd_junior', 'systems_engineer'] as const) {
      expect(parseStartRecord({ rung })).toEqual({ rung });
      expect(TITLE_TABLE[rung].built).toBe(true);
    }
  });
});

/**
 * And the shop the engineer start names is a real one, standing up a real
 * estate - the check that would have caught a row pointing at a shop this build
 * does not ship, before a player found it as a white screen.
 */
describe('the row the select trusts', () => {
  it('names a shop that stands up', () => {
    const employer = employerFor(TITLE_TABLE.systems_engineer.employer ?? '');

    expect(employer.id).toBe('msp');
    expect(employer.setup().length).toBeGreaterThan(0);
    expect(TITLE_TABLE.sd_junior.tier).toBe(PLAYER_TIERS.serviceDesk);
  });
});
