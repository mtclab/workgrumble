/**
 * The SECOND employer's week, driven headlessly through the shipped driver and
 * engine (0.6.0 slice 3, E5 #24).
 *
 * This is the second-employer half of the version gate. The probation week's
 * goldens prove the switch is ADDITIVE (byte-identical, in `scripted-week.test`);
 * this proves the second world is REAL and PLAYS: Bodgeworth & Batch stands up
 * from a carry that names it, its five days deal its own tickets, the reply-all
 * storm fires on the Wednesday, the queue is winnable, and the Friday review
 * goes the right way. It asserts the OUTCOME the player reaches - a passed
 * review at a wild-west shop - not merely that a function returned ok.
 *
 * The archetype CONTRAST is asserted mechanically alongside: the install policy
 * is `wild_west` (no audit), the room roster is not the probation shop's, and
 * the estate has neither a domain controller nor the probation nodes. Same
 * skills, a different building - which is the teaching the whole spine was for.
 *
 * Nothing below touches the DOM; the real driver runs as it does in the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { unreadIds } from '../world/channels';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { employerFor } from '../world/employers';
import { BODGE_IDS } from '../world/second-company';
import { BODGE_EVENT_DAY } from '../world/second-week';
import { isUnresolved } from '../world/sla';
import { createWorldSession, type WeekCarry } from '../world/session';
import { findWorldTicket } from '../world/tickets';
import { channelFeedThrough, REVIEW_DAY } from '../world/week';
import { AppStateStore } from './app-state';
import { DayDriver, holdsTheDesk, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

/**
 * The reply-all storm's true size: the ten #office messages the Wednesday table
 * authors (`second-week.ts` day 3) - root, the cake replies, the three scolds,
 * the two more-cake replies, and the one buried signal. NOT the whole week's
 * room traffic; Monday's two welcomes and Tuesday's printer chat are separate.
 */
const BODGE_STORM_MESSAGES = 10;

/** A carry that names Bodgeworth, fresh (no career) - a first real week there. */
const BODGE_CARRY: WeekCarry = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'bodgeworth',
});

interface Week {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
}

function startWeek(): Week {
  const { engine, seed } = createWorldSession(BODGE_CARRY);
  const bodge = employerFor('bodgeworth');
  const appState = new AppStateStore();
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    // The attention drip wired exactly as the shell wires it, so the storm's
    // unread pile is priced the way it is in the browser: the walk never opens
    // Hubbub, so every storm message is billed once.
    unreadChannels: () => unreadIds(
      // Bodgeworth's own feed, threaded like the shell threads it - the default
      // is the probation week, which for this shop is no messages at all.
      channelFeedThrough(engine.now(), bodge.week),
      appState.get().hubbub.read,
    ),
    attentionCharged: () => appState.get().hubbub.charged,
    noteAttentionCharged: (ids) => {
      appState.patch('hubbub', {
        charged: [...appState.get().hubbub.charged, ...ids],
      });
    },
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    // Bodgeworth is wild-west: the shell returns NOUGHT installed-against-policy
    // however much is installed, and the policy the audit beat reads is the
    // shop's own.
    installedAgainstPolicy: () => 0,
    installPolicy: () => bodge.installPolicy,
  },
  // The driver drives the REAL Bodgeworth week, rooms and ping flag - threaded
  // in the same way the shipped shell threads them off the session (main.ts),
  // NOT the probation defaults. Without this the driver deals the probation
  // week over the Bodgeworth estate and spawns `service:chassis-fan`, a node
  // that shop does not have - the exact shipped-wiring bug the de-global
  // exposed (0.6.0, P1-2).
  undefined,
  bodge.week,
  bodge.channels,
  bodge.runsBossPings);

  return { driver, engine, appState };
}

/** Runs the clock to a tick of the current day, a tick at a time. */
function runTo(world: Week, tick: number): void {
  while (world.engine.now() < tick && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/** Drives the first advertised path of everything still open in the queue. */
function workTheQueue(world: Week): void {
  for (const ticket of world.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    const path = findWorldTicket(ticket.id)?.paths[0];

    if (path === undefined) {
      continue;
    }

    for (const step of path.steps) {
      world.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

/** The queue worked once the desk is actually the player's (no takeover held). */
function workWhenAble(world: Week): void {
  for (let waited = 0; waited < 60; waited += 1) {
    if (!holdsTheDesk(world.driver.interruption()?.entry.source)) {
      break;
    }

    world.driver.step(TICK_INTERVAL_MS);
  }

  workTheQueue(world);
}

/** Two sweeps a day - one mid-morning, one mid-afternoon - catches pile + drip. */
function workedDay(world: Week, day: number): void {
  const start = shiftStartTick(day);
  runTo(world, start + 120);
  workWhenAble(world);
  runTo(world, start + 300);
  workWhenAble(world);
}

interface Walked {
  readonly hash: string;
  readonly outcome: string;
  readonly stormFired: boolean;
  readonly shareClosedInWorkedWeek: boolean;
  readonly attentionCharged: readonly string[];
}

function walk(): Walked {
  const world = startWeek();
  let stormFired = false;

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    expect(world.driver.day()).toBe(day);
    world.driver.startShift();
    workedDay(world, day);

    if (day === BODGE_EVENT_DAY) {
      // The event day fires: by mid-morning the reply-all storm has arrived in
      // #office, root and scolds and the one buried signal, all of it a reading
      // of the week's WEDNESDAY table against the clock. Counted as the
      // Wednesday storm exactly - not "every bodge room message so far", which
      // folds in Monday's welcome and Tuesday's printer chat and let a loose
      // `>= 8` pass without ever seeing the real storm.
      const storm = world.driver.channelFeed(world.engine.now())
        .filter((message) => message.day === BODGE_EVENT_DAY);
      const scolds = storm.filter(
        (message) => message.body.toUpperCase().includes('REPLYING ALL')
          || message.body.toUpperCase().includes('REPLYING. ALL'),
      );
      const buried = storm.some(
        (message) => message.relatedTicket === 'ticket:the-share-down',
      );
      stormFired = storm.length === BODGE_STORM_MESSAGES
        && scolds.length >= 2 && buried;
    }

    runTo(world, shiftEndTick(day));
    expect(world.driver.state()).toBe('day_end');
    world.driver.clockOff();
  }

  return {
    hash: world.engine.snapshotHash(),
    outcome: world.driver.reviewOutcome(),
    stormFired,
    // The buried ticket was closed by ordinary play - the signal was findable
    // and fixable in the middle of the noise.
    shareClosedInWorkedWeek:
      world.engine.ticketState('ticket:the-share-down') === 'resolved',
    attentionCharged: world.appState.get().hubbub.charged,
  };
}

/**
 * The Bodgeworth week golden.
 *
 * A NEW hash, argued rather than inherited: it is the world at Friday 17:00 of
 * a wild-west week worked to a pass. The numbers behind it: five tickets across
 * Mon-Thu, all closed on the day they arrive (two inherited Monday, one dripped
 * each of Tue/Wed/Thu), nothing red, so the weighted review reaches a pass over
 * the published bar; the week's THIRTEEN room messages are each billed once for
 * attention (two welcomes Monday, the printer chat Tuesday, and the reply-all
 * storm's ten in #office on the Wednesday - the walk never opens Hubbub); and
 * the fund carries the probation joke forward from nought with the shop's own
 * survival bonus on the Friday.
 *
 * It MOVED from the slice-3 commit (`dcd232bc72ea5535` -> `7436e592a668181d`)
 * for one reason, and a conscious one: the probation lead's boss-PING beat is
 * now OFF at Bodgeworth (P1-4). Bodgeworth's lead is Vernon and it authors no
 * ping content, so the driver no longer runs the probation ping loop into a
 * shop whose estate has none of it - the boss still walks the floor and still
 * catches slacking, he just does not mint Desmond's ticket or send Desmond's
 * lines. The week content, the storm and the winnable queue are unchanged;
 * what left the world is the ping beat's side effects. The probation goldens do
 * NOT move (the switch is additive) - proven byte-identical in
 * `scripted-week.test` / `session.test`. If this moves again, it is a conscious
 * diff, read the same way the probation goldens are.
 *
 * It MOVED again with 0.7.0 (`7436e592a668181d` -> `3ca933392632fc62`) for the
 * heterogeneous estate and that alone: Bodgeworth gained BODGE-CAM, the
 * undocumented Linux box on the yard camera Kev never wrote down, and every
 * Bodge machine gained an `os` field. The camera box brings four systemd
 * `unit` nodes (motion.service plus the base stack) and no Windows drive; it is
 * reachable and nameable and the Windows tools stop at its wire, which is the
 * wild-west estate's version of the same lesson. The five-ticket week, the
 * storm and the thirteen room messages are untouched - nothing plays a command
 * against the corner box - so this moved for new nodes and one field, nothing else.
 *
 * It MOVED once more with 0.30.0 (`3ca933392632fc62` -> `6c6fcc7c0feb2344`) for
 * the timesheet ledger, which the day loop now writes on every shop: two new
 * fields on the player node holding where the minutes went and the sheet that
 * went in when the week ended. The five-ticket week, the storm and the thirteen
 * room messages are again untouched - a record of the week is not a change to
 * it - so this moved for a record and nothing else.
 *
 * And it MOVED with 0.31.0 slice 1 (`6c6fcc7c0feb2344` -> `8316c429d314a2da`)
 * for the seeded spreader and nothing else: `seededOffset` now names its stream
 * before it hashes and avalanches the result before the modulo reads its bottom
 * bits, so every jittered minute in the product moved exactly once, here. This
 * shop's five tickets, its storm, its thirteen room messages, its pass and the
 * signal buried in the noise are every one of them what they were - the walk
 * below asserts all of that beside the hash. What moved is which minute Vernon
 * walks past on and which minute the yard printer lands on. The probation
 * goldens moved for the same one cause on the same commit, enumerated as the
 * NINETEENTH MOVE in `scripted-week.test.ts`.
 */
/*
 * And it MOVED again with 0.38.0's verifier round
 * (`8316c429d314a2da` -> `57fc40713286846f`) for the timesheet ledger's fifth
 * column and nothing else - the same one-field cause enumerated on the worked
 * probation golden in `scripted-week.test.ts`. This shop's five tickets, its
 * storm, its thirteen room messages, its pass and its buried signal are every
 * one of them what they were, and the walk below asserts all of that beside
 * the hash.
 */
const BODGE_GOLDEN_HASH = '57fc40713286846f';

describe('the second employer plays, and differs', () => {
  it('stands up as a genuinely different archetype', () => {
    const employer = employerFor('bodgeworth');

    // Policy contrast: wild-west, no audit - the 0.4.0 seam paying off by its
    // absence, and NOT the probation shop's locked-down.
    expect(employer.installPolicy).toBe('wild_west');
    expect(employerFor('workgrumble').installPolicy).toBe('locked_down');

    // Channel-mix contrast: a different room roster from the probation shop's.
    const bodgeRooms = employer.channels.map((room) => room.id).sort();
    const probationRooms = employerFor('workgrumble')
      .channels.map((room) => room.id).sort();
    expect(bodgeRooms).not.toEqual(probationRooms);
    expect(bodgeRooms).toContain('room:office');

    // Estate contrast: the Bodgeworth world exists and is not the probation one.
    const { engine } = createWorldSession(BODGE_CARRY);
    expect(engine.graph.getNode(BODGE_IDS.server)?.kind).toBe('machine');
    expect(engine.graph.getNode(BODGE_IDS.officeAccount)?.kind).toBe('account');
    // No domain controller in a wild-west shop, and none of the probation
    // estate's boxes.
    expect(engine.graph.getNode('machine:dc')).toBeUndefined();
    expect(engine.graph.getNode(COMPANY_IDS.fileServer)).toBeUndefined();
  });

  it('plays its week to a pass, with the storm firing on the way', () => {
    const walked = walk();

    // Winnable: the queue closes and Vernon keeps you on.
    expect(walked.outcome).toBe('passed');
    // The event day fired: the reply-all storm arrived, scolds and all, with
    // the one real ticket buried in it.
    expect(walked.stormFired).toBe(true);
    // And the buried signal was found and fixed by ordinary play.
    expect(walked.shareClosedInWorkedWeek).toBe(true);
    // Every one of the week's room messages was priced once for attention, and
    // exactly the week's worth: two welcomes Monday, the printer chat Tuesday,
    // and the storm's ten in #office on the Wednesday - thirteen, the walk never
    // opening Hubbub to read any of them clear.
    expect(walked.attentionCharged.length).toBe(13);
  });

  it('is deterministic: the same carry stands up the same week', () => {
    const first = walk();
    const second = walk();
    expect(first.hash).toBe(second.hash);
    expect(first.outcome).toBe(second.outcome);
    expect(first.attentionCharged).toEqual(second.attentionCharged);
  });

  it('lands on its committed golden hash', () => {
    // The world at Friday 17:00 of the worked wild-west week, pinned. A
    // conscious diff if it ever moves, read the way the probation goldens are.
    expect(walk().hash).toBe(BODGE_GOLDEN_HASH);
  });

  it('the fresh probation week is untouched by the second employer', () => {
    // The switch is additive: standing up Bodgeworth changes nothing about how
    // a fresh probation stands up. Its own byte-identical goldens are in
    // scripted-week.test / session.test; this is the cheap cross-check that the
    // active-week pointer is reset by creating a probation session.
    createWorldSession(BODGE_CARRY);
    const probation = createWorldSession();
    expect(probation.employer).toBe('workgrumble');
    // The probation Monday still deals its own inherited pile, not Bodgeworth's.
    expect(
      probation.engine.ticketState('ticket:rotated-screen'),
    ).toBe('open');
    expect(
      probation.engine.ticketState('ticket:office-login-locked'),
    ).toBeUndefined();
  });
});
