/**
 * The co-managed RACI's soft wall, PLAYED (E9, 0.37.0).
 *
 * `world/customers.test.ts` proves the matrix - which of the three things a
 * RACI map can say about a box comes out as which verdict. This file drives the
 * shipped thing: the real MSP session, the real day driver, and the REAL
 * terminal (`executeCommand(parseCommand(...))`), because the wall is not a
 * refusal and so cannot be proven by reading a refusal. It is a thing that
 * happens tomorrow, and the only way to know it happens is to play until
 * tomorrow.
 *
 * Four claims, each written so that reverting the line it is about turns it red:
 *
 *  1. THE SHORTCUT WORKS. Restarting the practice suite on their sysadmin's box
 *     with nobody told is not blocked, does not fail, and closes the ticket.
 *     Teeth: make the soft wall a hard one and the service stays stopped and
 *     the ticket stays open.
 *  2. AND IT IS WRITTEN DOWN. The box carries the `verb@tick` trail and the
 *     minute of the last unannounced touch. Teeth: take the stamp op out of
 *     `world.raci_violation` and this is the assertion that goes red - it is
 *     the one the revert was run against, by name.
 *  3. THE COMPLAINT ARRIVES THE NEXT MORNING, and costs reputation. Teeth: the
 *     settler is the only thing that fires it, and the charge is the verb's.
 *  4. THE HONEST PATH COSTS NOTHING. The same day, the same restart, with a
 *     `notify` in front of it: same close, no stamp, no complaint, and the
 *     morning's reputation reads exactly `RACI_COMPLAINT_REPUTATION` higher
 *     than the shortcut run's. Two runs of one week differing by one command is
 *     the sharpest form this claim has: a build that stamped regardless would
 *     make the two identical, and so would a build that stamped nothing.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  HELPDESK_ACTIONS,
  RACI_COMPLAINT_REPUTATION,
  WORLD_ACTIONS,
} from '../world/actions';
import { FIELDS, SERVICE_STATUS } from '../world/fields';
import { arrivedAt, findMailThread } from '../world/mail';
import { MSP_CUSTOMERS, MSP_IDS } from '../world/msp-company';
import { createWorldSession, type WorldSession } from '../world/session';
import { spawnWorldTicket } from '../world/tickets';
import { AppStateStore } from './app-state';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

const TICKET = 'ticket:pennington-practice-down';
/** How the terminal names the practice suite: the box, then the service. */
const LEDGERLINE = 'PENN-SRV-01\\LedgerlineSvc';

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly notices: string[];
}

/**
 * The MSP world, stood up the way the shell stands one up, with the customer
 * on screen the way opening their ticket puts it there - and one driver shared
 * by the day and the terminal, because a test with two of them would be a test
 * of a shell nobody ships.
 */
function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const notices: string[] = [];
  const appState = new AppStateStore();

  appState.setCustomerContext(MSP_CUSTOMERS.pennington);

  const driver = new DayDriver(
    session.engine,
    MSP_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onNotice: (title, body) => {
        notices.push(`${title}: ${body}`);
      },
    },
    undefined,
    session.week,
    session.channels,
  );

  const api: GameApi = {
    graph: session.engine.graph,
    appState,
    day: driver,
    dispatch: (id, actor, target, params) => session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    recordProbe: () => {},
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true }),
    uninstallApp: () => ({ ok: true }),
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
    employer: 'msp',
    actor: MSP_IDS.player,
  };

  return { session, driver, api, notices };
}

function run(rigged: Rig, input: string): string {
  return executeCommand(parseCommand(input), rigged.api).lines.join('\n');
}

/** Runs what is left of the shift out, minute by minute, as the clock does. */
function playOut(rigged: Rig): void {
  while (rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

const field = (rigged: Rig, node: string, name: string): unknown =>
  rigged.session.engine.graph.getField(node, name);

const reputation = (rigged: Rig): number => {
  const value = field(rigged, MSP_IDS.player, FIELDS.reputation);
  return typeof value === 'number' ? value : Number.NaN;
};

/**
 * A whole day at Pennington, with or without the heads-up - the two runs the
 * mechanic is the difference between, played identically otherwise.
 *
 * Returns the morning after: the reputation either side of the start of shift
 * that settles yesterday, so the charge can be read on its own rather than
 * through a day's worth of everything else moving the same meter.
 */
function playPenningtonDay(notifyFirst: boolean): {
  readonly rigged: Rig;
  readonly before: number;
  readonly after: number;
} {
  const rigged = rig();

  rigged.driver.startShift();
  spawnWorldTicket(rigged.session.engine, TICKET);

  if (notifyFirst) {
    const notified = run(rigged, `notify ${LEDGERLINE}`);
    expect(notified).toContain('PENNINGTON-ACCT');
  }

  const done = run(rigged, `restart ${LEDGERLINE}`);

  // CLAIM 1: nothing stopped it. The estate has no lock on this box and the
  // terminal does not invent one.
  expect(done).toContain('service reports RUNNING');
  expect(field(rigged, MSP_IDS.penningtonPracticeApp, FIELDS.status))
    .toBe(SERVICE_STATUS.running);
  expect(rigged.session.engine.ticketState(TICKET)).toBe('resolved');

  playOut(rigged);
  rigged.driver.clockOff();

  const before = reputation(rigged);
  // The settler runs at the start of the next shift, on the same rail as the
  // compliance sweep - so this one call is the whole of tomorrow's post.
  rigged.driver.startShift();

  return { rigged, before, after: reputation(rigged) };
}

describe('the RACI soft wall: the box you can touch, and the morning after', () => {
  it('lets the shortcut through, stamps it, and complains the next morning', () => {
    const { rigged, before, after } = playPenningtonDay(false);

    // CLAIM 2: the record. This is the assertion the revert was run against -
    // drop the `raci_violated_at` write from `world.raci_violation` and this
    // test fails here, on the stamp, before it ever reaches the complaint.
    const trail = field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolations);
    expect(typeof trail).toBe('string');
    expect(String(trail)).toContain(`${HELPDESK_ACTIONS.serviceRestart}@`);
    expect(typeof field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolatedAt))
      .toBe('number');

    // CLAIM 3: the word that comes back, by name, about the box, with the
    // charge on it.
    const complaint = rigged.notices.find(
      (notice) => notice.includes('The other IT team has been in touch'),
    );
    expect(complaint).toBeDefined();
    expect(complaint).toContain('Gil Farrant');
    expect(complaint).toContain('PENN-SRV-01');
    expect(
      typeof field(rigged, MSP_IDS.penningtonServer, FIELDS.raciComplainedAt),
    ).toBe('number');
    expect(before - after).toBeGreaterThanOrEqual(RACI_COMPLAINT_REPUTATION);
  });

  it('leaves nothing behind when their IT was told first', () => {
    const { rigged } = playPenningtonDay(true);

    // CLAIM 4, the half that keeps the mechanic honest: the ticket closed the
    // same way and the morning is quiet. A build that stamped every touch of
    // their box - rather than every UNANNOUNCED touch - reds all four of these
    // and would have made the notify decorative.
    expect(field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolations))
      .toBeUndefined();
    expect(field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolatedAt))
      .toBeUndefined();
    expect(field(rigged, MSP_IDS.penningtonServer, FIELDS.raciComplainedAt))
      .toBeUndefined();
    expect(
      rigged.notices.some((notice) => notice.includes('has been in touch')),
    ).toBe(false);
  });

  /**
   * And the two runs against each other, which is where the number lives.
   *
   * Everything about these weeks is the same - same seed, same estate, same
   * ticket, same restart, same minutes - except one command. So the gap between
   * the two mornings is the price of not typing it, exactly, rather than a
   * threshold that would still pass if the charge were half of what it says.
   */
  it('costs exactly the complaint, and only the shortcut pays it', () => {
    const shortcut = playPenningtonDay(false);
    const honest = playPenningtonDay(true);

    expect(honest.before).toBe(shortcut.before);
    expect(honest.after - shortcut.after).toBe(RACI_COMPLAINT_REPUTATION);
  });
});

/**
 * The second violation, and what it is allowed to move (0.37.1).
 *
 * The mechanic's repeat is deliberate - touch his box again without a word and
 * he says something again, and it costs again - but his FIRST letter is
 * evidence of the first morning and has to stay where it was written. It did
 * not: the mail hung off `raci_complained_at`, the latch the complaint verb
 * re-stamps, so the second complaint silently re-dated the one mail in the
 * inbox and floated it back to the top with the same words in it. One
 * consequence wearing the clothes of two.
 *
 * Played rather than reasoned about: two unannounced restarts on two days, the
 * real driver settling two mornings, and the arrival tick the inbox actually
 * reads.
 */
describe('a second complaint adds a word rather than moving the first', () => {
  const LETTER = 'mail/raci-unannounced';

  it('leaves the first mail\'s arrival where it was, and still charges', () => {
    const thread = findMailThread(LETTER);
    expect(thread).toBeDefined();

    const rigged = rig();
    const graph = rigged.session.engine.graph;
    const arrival = (): number | null => arrivedAt(
      thread as NonNullable<typeof thread>,
      graph,
    );

    // Day one: the shortcut, unannounced.
    rigged.driver.startShift();
    spawnWorldTicket(rigged.session.engine, TICKET);
    expect(run(rigged, `restart ${LEDGERLINE}`)).toContain('service reports RUNNING');
    expect(arrival()).toBeNull();

    playOut(rigged);
    rigged.driver.clockOff();

    // Morning two: he writes, and the letter has a date on it.
    rigged.driver.startShift();

    const firstArrival = arrival();
    const firstStamp = field(
      rigged,
      MSP_IDS.penningtonServer,
      FIELDS.raciFirstComplainedAt,
    );

    expect(typeof firstStamp).toBe('number');
    expect(firstArrival).toBe(firstStamp);

    const afterFirst = reputation(rigged);

    // Day two proper, a few minutes into the shift. The minute matters: the
    // complaint is settled in the shift's FIRST minute, and a violation
    // stamped in that same minute would read as already answered for.
    rigged.driver.step(TICK_INTERVAL_MS);
    rigged.driver.step(TICK_INTERVAL_MS);

    // It falls over again - the world's own verb, the same one a maintenance
    // window uses, because a healthy service cannot be restarted twice and the
    // point here is a SECOND unannounced touch rather than a second fault.
    expect(rigged.session.engine.dispatch(
      WORLD_ACTIONS.serviceStopped,
      MSP_IDS.player,
      MSP_IDS.penningtonPracticeApp,
      {},
    ).ok).toBe(true);
    expect(run(rigged, `restart ${LEDGERLINE}`)).toContain('service reports RUNNING');
    playOut(rigged);
    rigged.driver.clockOff();

    const beforeSecond = reputation(rigged);

    // Morning three: he says something again.
    rigged.driver.startShift();

    // The latch moved, because it is the latch and that is what buys the
    // repeat its teeth.
    const latch = field(rigged, MSP_IDS.penningtonServer, FIELDS.raciComplainedAt);
    expect(typeof latch).toBe('number');
    expect(Number(latch)).toBeGreaterThan(Number(firstStamp));

    // R1's cleared behaviour, unbroken: he says something a second time, and
    // the charging verb is what said it - the notice is written only on a
    // complaint the verb accepted, and it is written once per complaint.
    //
    // Counted in notices rather than in reputation, because two days of an
    // unattended MSP queue have already put that meter on its floor by here,
    // and a meter that cannot go lower cannot show a charge landing. The
    // charge itself is one op inside the verb and is proven against the number
    // by `costs exactly the complaint` above, on a morning where there is
    // still something to take.
    expect(rigged.notices.filter(
      (notice) => notice.includes('The other IT team has been in touch'),
    )).toHaveLength(2);
    expect(afterFirst).toBeGreaterThanOrEqual(reputation(rigged));
    expect(beforeSecond).toBeGreaterThanOrEqual(reputation(rigged));

    // And the whole of this gate: the letter did not move. Point the mail's
    // arrival back at `raci_complained_at` and these two go red together.
    expect(field(rigged, MSP_IDS.penningtonServer, FIELDS.raciFirstComplainedAt))
      .toBe(firstStamp);
    expect(arrival()).toBe(firstArrival);
  });
});

/**
 * The heads-up is for the day it was given (0.37.1).
 *
 * `isCoordinated` answers "is there a notice for this target", which is the
 * right question at the scope pre-flight and the wrong one here: it made the
 * first `notify` a player ever typed on a box a permanent exemption from ever
 * being noticed on that box again. The player who did the right thing once was
 * the one player who could never meet the mechanic, and the documented second
 * complaint was unreachable for them by construction.
 *
 * Played across two days, which is the only place the difference lives.
 */
describe('a heads-up covers the day it was given, and not the week', () => {
  it('goes quiet the day you say it, and speaks the day you do not', () => {
    const rigged = rig();

    // Day one, done properly: told, then touched. Nothing is stamped and
    // nobody writes - the shipped honest path, unchanged.
    rigged.driver.startShift();
    spawnWorldTicket(rigged.session.engine, TICKET);
    expect(run(rigged, `notify ${LEDGERLINE}`)).toContain('PENNINGTON-ACCT');
    expect(run(rigged, `restart ${LEDGERLINE}`)).toContain('service reports RUNNING');
    expect(field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolatedAt))
      .toBeUndefined();

    playOut(rigged);
    rigged.driver.clockOff();
    rigged.driver.startShift();

    expect(
      rigged.notices.some((notice) => notice.includes('has been in touch')),
    ).toBe(false);

    // Day two, on the same box, with yesterday's notice and nothing else.
    rigged.driver.step(TICK_INTERVAL_MS);
    rigged.driver.step(TICK_INTERVAL_MS);
    expect(rigged.session.engine.dispatch(
      WORLD_ACTIONS.serviceStopped,
      MSP_IDS.player,
      MSP_IDS.penningtonPracticeApp,
      {},
    ).ok).toBe(true);
    expect(run(rigged, `restart ${LEDGERLINE}`)).toContain('service reports RUNNING');

    // THE GATE. Yesterday's word is not today's word: the touch is stamped,
    // and his letter arrives on the morning after it. Take the freshness out
    // of the RACI read - go back to asking whether a notice exists at all -
    // and both of these go red, because the notice from day one covers
    // everything that ever happens on that box afterwards.
    expect(typeof field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolatedAt))
      .toBe('number');

    playOut(rigged);
    rigged.driver.clockOff();
    rigged.driver.startShift();

    expect(
      rigged.notices.filter((notice) => notice.includes('has been in touch')),
    ).toHaveLength(1);
  });
});

describe('the shipped co-managed refusal is reachable at the same customer', () => {
  /**
   * The other half of the find this slice closes: the 0.8.0 notify-first
   * sentence has to still fire somewhere. A RACI map that quietly turned every
   * co-managed target into a soft wall would have replaced one dead branch with
   * another - so an account at PENNINGTON-ACCT, which is in nobody's map, meets
   * the shipped refusal word for word.
   */
  it('refuses an unannounced account action, in the 0.8.0 words', () => {
    const rigged = rig();
    const output = run(rigged, 'unlock eroe');

    expect(output).toContain('co-managed');
    expect(output).toContain('notify them first');
    expect(output).toContain('the RACI says it is shared');
  });
});
