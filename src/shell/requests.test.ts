/**
 * The same question everywhere, driven headlessly through the shipped driver
 * and the shipped engine: the SHELL half of slice 2's gate.
 *
 * The world unit (`src/world/requests.test.ts`) holds the data down; this holds
 * down the goal the data exists for, on the real driver:
 *
 * - CONVERT mints a real ticket, and that ticket is what Friday can see: it
 *   arrives on the day it was minted and closes on the day it was fixed, so the
 *   day ledger counts it. This is the correct play, and it is the only one that
 *   moves the scorecard.
 * - ANSWER the human gives gratitude and NOTHING else: a point of reputation,
 *   no ticket, and the day ledger does not move. Grateful, invisible on Friday -
 *   the DM bypass, generalised.
 * - DEDUPE: resolving one copy quietens all of them. A second answer is refused
 *   off the world's own record, so answering the same question in three windows
 *   is one credit for three lots of minutes.
 *
 * Teeth: revert the `raiseSummonedTicket` call in `resolveRequest` and the
 * convert test reds (no ticket, ledger flat); drop the `answer` reputation op
 * and the gratitude test reds; drop the `ALREADY_RESOLVED` guard and the dedupe
 * test reds.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { dayLedger, tickAtMinute } from '../world/day';
import { FIELDS } from '../world/fields';
import { isRequestResolved } from '../world/requests';
import { createWorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const REQUEST_ID = 'req:bev-vpn';
const RAISES = 'ticket:bev-vpn-request';
/** Ten to ten on the Tuesday, the minute all three copies land. */
const ARRIVAL = tickAtMinute(2, 9 * 60 + 50);

interface World {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
}

function start(): World {
  const { engine, seed } = createWorldSession();
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });

  return { driver, engine };
}

/** Steps the current shift out to its 17:00, one tick at a time. */
function runToDayEnd(world: World): void {
  while (world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * Plays Monday in full and stops the Tuesday shift on the minute the request
 * arrives - the moment all three copies are on the desk and none is resolved.
 */
function reachTheRequest(): World {
  const world = start();
  world.driver.startShift();
  runToDayEnd(world);
  world.driver.clockOff();
  world.driver.startShift();

  while (world.engine.now() < ARRIVAL) {
    world.driver.step(TICK_INTERVAL_MS);
  }

  return world;
}

function tickets(world: World): ReturnType<EngineApi['graph']['nodesOfKind']> {
  return world.engine.graph.nodesOfKind('ticket');
}

function reputation(world: World): number {
  const value = world.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.reputation,
  );
  return typeof value === 'number' ? value : Number.NaN;
}

describe('the request arrives, and is one request', () => {
  it('is live on the Tuesday, unresolved, and known to the driver', () => {
    const world = reachTheRequest();
    const live = world.driver.liveRequests();
    const request = live.find((entry) => entry.id === REQUEST_ID);

    expect(request).toBeDefined();
    expect(request?.day).toBe(2);
    expect(request?.reporter).toBe(COMPANY_IDS.bev);
    expect(request?.resolvedAs).toBeNull();
    // And it is not yet a ticket: a request nobody has converted is a plea in
    // three windows, not a node in the queue.
    expect(world.engine.graph.getNode(RAISES)).toBeUndefined();
  });
});

describe('convert - the correct play', () => {
  it('mints the ticket, and the day counts it once it is fixed', () => {
    const world = reachTheRequest();
    const day = world.driver.day();
    expect(day).toBe(2);

    const result = world.driver.resolveRequest(REQUEST_ID, 'convert');
    expect(result.ok).toBe(true);

    // The ticket exists, arrived on the day it was minted, and every copy of
    // the request now reads converted.
    const minted = world.engine.graph.getNode(RAISES);
    expect(minted).toBeDefined();
    expect(dayLedger(tickets(world), day).arrived).toBeGreaterThanOrEqual(1);
    expect(
      world.driver.liveRequests().find((entry) => entry.id === REQUEST_ID)
        ?.resolvedAs,
    ).toBe('convert');

    // The arrival on its own is not the credit - a converted ticket left open
    // would HURT the mark. Fixing it is what the ledger closes on: the one
    // directory move that puts Bev in VPN Users.
    const closed = world.driver.dispatch(
      HELPDESK_ACTIONS.accountAddToGroup,
      COMPANY_IDS.player,
      COMPANY_IDS.bevAccount,
      { group: COMPANY_IDS.vpnUsers },
    );
    expect(closed.ok).toBe(true);

    const minor = tickets(world).find((ticket) => ticket.id === RAISES);
    expect(minor?.fields[FIELDS.state]).toBe('resolved');
    expect(
      dayLedger(tickets(world), day).closed,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('answer - grateful, and invisible on Friday', () => {
  it('pays a point of gratitude and raises no ticket at all', () => {
    const world = reachTheRequest();
    const day = world.driver.day();
    const repBefore = reputation(world);
    const arrivedBefore = dayLedger(tickets(world), day).arrived;

    const result = world.driver.resolveRequest(REQUEST_ID, 'answer');
    expect(result.ok).toBe(true);

    // The human is grateful...
    expect(reputation(world)).toBe(repBefore + 1);
    // ...and there is nothing on the scorecard: no ticket, and the day the
    // review reads did not move.
    expect(world.engine.graph.getNode(RAISES)).toBeUndefined();
    expect(dayLedger(tickets(world), day).arrived).toBe(arrivedBefore);
    expect(
      world.driver.liveRequests().find((entry) => entry.id === REQUEST_ID)
        ?.resolvedAs,
    ).toBe('answer');
  });

  it('deflecting costs goodwill and also raises nothing', () => {
    const world = reachTheRequest();
    const repBefore = reputation(world);

    expect(world.driver.resolveRequest(REQUEST_ID, 'deflect').ok).toBe(true);
    expect(reputation(world)).toBe(repBefore - 2);
    expect(world.engine.graph.getNode(RAISES)).toBeUndefined();
  });
});

describe('dedupe - one resolution, every copy quiet', () => {
  it('refuses a second answer to the same question', () => {
    const world = reachTheRequest();

    expect(world.driver.resolveRequest(REQUEST_ID, 'convert').ok).toBe(true);
    expect(isRequestResolved(
      REQUEST_ID,
      world.engine.graph.getField(COMPANY_IDS.player, FIELDS.requestResolved),
    )).toBe(true);

    // The chat copy, or the mail copy, pressed after the room copy was already
    // dealt with: refused, and it does not pay a second time.
    const second = world.driver.resolveRequest(REQUEST_ID, 'answer');
    expect(second.ok).toBe(false);
    expect(second.ok ? '' : second.reason).toContain('already dealt with');
  });

  it('refuses an unknown request and one pressed off shift', () => {
    const world = reachTheRequest();

    expect(world.driver.resolveRequest('req:nobody', 'convert').ok).toBe(false);

    // Off shift: play to the day end, where the desk is closed, and the verb
    // refuses in the sentence the guard owns.
    runToDayEnd(world);
    const offShift = world.driver.resolveRequest(REQUEST_ID, 'answer');
    expect(offShift.ok).toBe(false);
    expect(world.engine.graph.getNode(RAISES)).toBeUndefined();
  });
});
