/**
 * The repaint gate for the ticket queue, driven headlessly through the shipped
 * driver and the shipped engine - the box-independent half of `repaint.spec`.
 *
 * The e2e proves element IDENTITY: a marker written on the live detail node has
 * to survive a minute of the clock. It went red at 0.5.0 not because the detail
 * pane started rebuilding on a tick, but because the world started MOVING on one
 * that the queue does not draw: the attention drip (slice 3) charges a stress
 * point on the PLAYER node the meter tick after an unread Hubbub message lands,
 * and the tickets detail pane - alone among this shell's panes - rebuilt on
 * every world change, so that legitimate stress point threw the pane away under
 * the player's cursor.
 *
 * The fix is `ticketQueueFingerprint`: the app rebuilds the detail only when the
 * world moved something the queue draws, and the meters live on the player node,
 * never on a ticket. These tests hold that down without a browser.
 *
 * TEETH:
 * - Widen the fingerprint to read the player node (or any meter field) and the
 *   first test reds: the charge would change it and the pane would rebuild.
 * - Drop `sla_deadline`/`held_ticks`/`off_hours_ticks` from `LIVE_CLOCK_FIELDS`
 *   and the second reds: a parked ticket's per-minute deadline creep would
 *   rebuild the window once a minute, the exact churn the countdown cells are
 *   updated in place to avoid.
 * - Make the fingerprint constant (never change) and the third reds: a real
 *   edit has to still rebuild the pane, or a pane that never repaints is a worse
 *   bug than one that repaints too much.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../../engine-api';
import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { unreadIds } from '../../world/channels';
import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import { createWorldSession } from '../../world/session';
import { channelFeedThrough } from '../../world/week';
import { DayDriver, TICK_INTERVAL_MS } from '../day-driver';
import { ticketQueueFingerprint } from './tickets';

/** The ticket the e2e opens and marks - a day-1 inherited one, on the pile from 09:00. */
const SELECTED = 'ticket:locked-account';

beforeAll(() => {
  loadEngineForTests();
});

interface World {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
}

/**
 * A driver wired the way the shell wires it for attention: the unread pile is
 * the channel feed against a read ledger the window advances (empty here - the
 * player is in the queue, not in Hubbub), and the charged ledger is the
 * watermark the driver advances so no message is billed twice.
 */
function start(): World {
  const { engine, seed } = createWorldSession();
  // The read ledger stays empty: the player is in the queue, not in Hubbub, so
  // the room messages sit unread and the meters charge for them.
  const read: readonly string[] = [];
  let charged: readonly string[] = [];

  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    unreadChannels: () => unreadIds(channelFeedThrough(engine.now()), read),
    attentionCharged: () => charged,
    noteAttentionCharged: (ids) => { charged = [...charged, ...ids]; },
  });

  return { driver, engine };
}

/** The ticket nodes, in a stable order, so two fingerprints are comparable. */
function ticketNodes(world: World): ReturnType<EngineApi['graph']['nodesOfKind']> {
  return [...world.engine.graph.nodesOfKind('ticket')].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
}

function fingerprint(world: World): string {
  return ticketQueueFingerprint(ticketNodes(world), SELECTED);
}

function stress(world: World): number {
  const value = world.engine.graph.getField(COMPANY_IDS.player, FIELDS.stress);
  return typeof value === 'number' ? value : 0;
}

/** Steps the shift one tick at a time until `now` reaches `tick`. */
function stepTo(world: World, tick: number): void {
  while (world.engine.now() < tick && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

describe('a minute passing does not rebuild the ticket detail', () => {
  it('holds the queue fingerprint across the meter tick that charges an unread message', () => {
    const world = start();
    world.driver.startShift();

    // 09:38, one minute short of the tick the day-1 Hubbub messages start
    // landing on (09:40) - the window the e2e runs the clock across.
    stepTo(world, 98);
    const before = fingerprint(world);
    const stressBefore = stress(world);

    // Across 09:40 and 09:48, where the second and third room messages arrive
    // unread and the meters charge a point each. This is the world genuinely
    // moving - the regression trigger, reproduced.
    stepTo(world, 110);

    expect(stress(world)).toBeGreaterThan(stressBefore);
    // ...and yet nothing the queue draws changed, so the pane must not rebuild.
    expect(fingerprint(world)).toBe(before);
  });

  it('holds the fingerprint across a parked ticket\'s per-minute deadline creep', () => {
    const world = start();
    world.driver.startShift();
    stepTo(world, 70);

    // Put a question to the reporter and park the ticket on it. Both are
    // content changes and move the fingerprint (the parked read is captured
    // after them), but every quiet minute after only walks the deadline out -
    // the live-clock fields the countdown cells own and the fingerprint drops.
    expect(world.driver.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      SELECTED,
      { comment: 'Which account, and when did it lock?' },
    ).ok).toBe(true);
    expect(world.driver.dispatch(
      HELPDESK_ACTIONS.ticketSetWaiting,
      COMPANY_IDS.player,
      SELECTED,
      {},
    ).ok).toBe(true);

    const afterPark = fingerprint(world);
    const deadlineBefore = world.engine.graph.getField(SELECTED, FIELDS.slaDeadline);

    // A single quiet minute (no arrival, no meter tick): the engine walks the
    // parked ticket's deadline out by one and nothing else moves.
    stepTo(world, 72);

    expect(world.engine.graph.getField(SELECTED, FIELDS.slaDeadline))
      .not.toBe(deadlineBefore);
    expect(fingerprint(world)).toBe(afterPark);
  });

  it('DOES change the fingerprint when a ticket the queue draws is edited', () => {
    const world = start();
    world.driver.startShift();
    stepTo(world, 70);

    const before = fingerprint(world);
    // A word put to the reporter is a customer-visible change - exactly the
    // kind of thing the detail pane exists to show, so the pane must rebuild.
    const commented = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      SELECTED,
      { comment: 'Looking into it now.' },
    );
    expect(commented.ok).toBe(true);

    expect(fingerprint(world)).not.toBe(before);
  });
});
