/**
 * The customer walls, PLAYED FROM THE WINDOWS (#64 P1-3, 0.37.1).
 *
 * `raci-teeth.test.ts` plays the same mechanic through the terminal, and that
 * is how the hole this file closes stayed green for nine versions: the walls
 * were written at the terminal's dispatch seam, and every gate on them drove
 * the terminal. Remote Assist sent the same verbs at the same boxes through its
 * own `api.dispatch` and met none of them - a Restart on a monitoring-only
 * clinic server simply worked, and one on a co-managed customer's own box
 * closed the ticket with no trail and no complaint the next morning. A suite
 * that proves a rule at one caller has proved a property of that caller.
 *
 * So these drive the WINDOWS' own write paths - `remoteRemediation` and
 * `directoryRemediation`, the functions the buttons in those panes call - over
 * a session wired the way `main.ts` wires the shipped one: `api.dispatch` goes
 * through `DayDriver.dispatch`, not at the raw engine. The raw-engine rig is
 * what a hole ships behind, because the driver is where a touch is recorded, a
 * minute is billed and tomorrow's post is decided.
 *
 * What each claim is worth, and what reverting turns it red:
 *
 *  1. THE SOFT WALL REACHES THIS WINDOW. Restarting the practice suite from
 *     Remote Assist works, is written down, and is complained about the next
 *     morning at the shipped price. Take the seam back out of
 *     `remoteRemediation` and the trail assertion goes first.
 *  2. THE HARD WALLS REACH IT TOO, in the shipped sentences, word for word.
 *     These were UNREACHABLE from this window before - no test could have
 *     printed them, because nothing in the app could produce them.
 *  3. A REFUSED REMEDIATION LEAVES THE WORLD ALONE. The wedged service is still
 *     wedged, the ticket is still open, and the verb is not in the dispatch log
 *     at all - not even as a refusal, because it was never sent.
 *  4. THE WRONG TENANT IS STILL THE WRONG TENANT with a mouse in your hand.
 *  5. AND THE SEAM IS THE ONLY WAY THROUGH. The list of files allowed to reach
 *     `api.dispatch` directly is asserted, so the next window with a Restart
 *     button on it cannot re-open this by being written the obvious way.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  HELPDESK_ACTIONS,
  RACI_COMPLAINT_REPUTATION,
} from '../world/actions';
import { FIELDS, SERVICE_STATUS } from '../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../world/msp-company';
import { createWorldSession, type WorldSession } from '../world/session';
import { spawnWorldTicket } from '../world/tickets';
import { AppStateStore } from './app-state';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { directoryRemediation } from './apps/directory';
import { remoteRemediation } from './apps/remote';
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

const PENNINGTON_TICKET = 'ticket:pennington-practice-down';
const NORTHWIND_TICKET = 'ticket:northwind-backup-alert';

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly notices: string[];
}

/**
 * The MSP world, stood up the way the shell stands one up - and the ONE
 * difference from the terminal's rig that matters: `dispatch` is the day
 * driver's, exactly as `main.ts` wires it, so what these windows send lands
 * where the shipped ones land.
 */
function rig(customerOnScreen: string): Rig {
  const session = createWorldSession(MSP_CARRY);
  const notices: string[] = [];
  const appState = new AppStateStore();

  // What an open ticket puts on screen. The tenant guard reads it, so a rig
  // with nothing on screen would be a rig with the guard switched off.
  appState.setCustomerContext(customerOnScreen);

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
    dispatch: (id, actor, target, params) => driver.dispatch(
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

/** A control in Remote Assist, clicked - the app's own write path. */
function remote(
  rigged: Rig,
  action: string,
  target: string,
  params: Record<string, string | number> = {},
): { readonly refusal: string | null; readonly outcome: string | null } {
  return remoteRemediation(rigged.api, action, target, params, 'Done.');
}

const field = (rigged: Rig, node: string, name: string): unknown =>
  rigged.session.engine.graph.getField(node, name);

const reputation = (rigged: Rig): number => {
  const value = field(rigged, MSP_IDS.player, FIELDS.reputation);
  return typeof value === 'number' ? value : Number.NaN;
};

/** Whether the world was ever ASKED - a refused remediation is never sent. */
const wasDispatched = (rigged: Rig, action: string, target: string): boolean =>
  rigged.session.engine
    .dispatchLog()
    .some((entry) => entry.id === action && entry.target === target);

/** Runs what is left of the shift out, minute by minute, as the clock does. */
function playOut(rigged: Rig): void {
  while (rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

describe('Remote Assist meets the customer walls', () => {
  /**
   * CLAIM 1. The soft wall is soft here too - the window is not a lock the
   * estate does not have - and the price arrives on the same schedule.
   *
   * The whole finding in one test: this exact click used to resolve a ticket on
   * somebody else's box and cost nothing, ever.
   */
  it('lets the co-managed shortcut through, stamps it, and is complained '
    + 'about the next morning', () => {
    const rigged = rig(MSP_CUSTOMERS.pennington);

    rigged.driver.startShift();
    spawnWorldTicket(rigged.session.engine, PENNINGTON_TICKET);

    const clicked = remote(
      rigged,
      HELPDESK_ACTIONS.serviceRestart,
      MSP_IDS.penningtonPracticeApp,
    );

    expect(clicked.refusal).toBeNull();
    expect(clicked.outcome).toBe('Done.');
    expect(field(rigged, MSP_IDS.penningtonPracticeApp, FIELDS.status))
      .toBe(SERVICE_STATUS.running);
    expect(rigged.session.engine.ticketState(PENNINGTON_TICKET))
      .toBe('resolved');

    // The record - the assertion the revert was run against. Take the seam back
    // out of `remoteRemediation` and this is the line that reds: the restart
    // still works, the ticket still closes, and nothing is written down.
    const trail = field(rigged, MSP_IDS.penningtonServer, FIELDS.raciViolations);
    expect(typeof trail).toBe('string');
    expect(String(trail)).toContain(`${HELPDESK_ACTIONS.serviceRestart}@`);

    playOut(rigged);
    rigged.driver.clockOff();

    const before = reputation(rigged);
    rigged.driver.startShift();

    const complaint = rigged.notices.find(
      (notice) => notice.includes('The other IT team has been in touch'),
    );
    expect(complaint).toBeDefined();
    expect(complaint).toContain('PENN-SRV-01');
    expect(before - reputation(rigged))
      .toBeGreaterThanOrEqual(RACI_COMPLAINT_REPUTATION);
  });

  /**
   * CLAIM 2 + 3, on the wall the whole Northwind account exists to teach: the
   * monitoring-only contract, in the words the terminal refuses in, and a world
   * that did not move.
   */
  it('refuses a restart on the monitoring-only clinic, in the shipped words, '
    + 'and leaves the box alone', () => {
    const rigged = rig(MSP_CUSTOMERS.northwind);

    rigged.driver.startShift();
    // The alert that wedges the backup service: without it this restart would
    // be refused for being a restart of a healthy service, and the test would
    // pass for a reason that has nothing to do with the contract.
    spawnWorldTicket(rigged.session.engine, NORTHWIND_TICKET);
    expect(field(rigged, MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);

    const clicked = remote(
      rigged,
      HELPDESK_ACTIONS.serviceRestart,
      MSP_IDS.northwindBackup,
    );

    expect(clicked.outcome).toBeNull();
    expect(clicked.refusal).toBe(
      'This account is monitoring-only - the contract is notify-and-escalate, '
      + 'not remediate. Raise it; remediation is out of scope until authorised '
      + 'as billable work.',
    );

    // And the world is where it was. Not "the ticket is unresolved" alone - the
    // verb never reached the engine at all, which is what makes the refusal a
    // pre-flight rather than an undo.
    expect(field(rigged, MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
    expect(rigged.session.engine.ticketState(NORTHWIND_TICKET)).not.toBe('resolved');
    expect(wasDispatched(
      rigged,
      HELPDESK_ACTIONS.serviceRestart,
      MSP_IDS.northwindBackup,
    )).toBe(false);
  });

  /**
   * The other hard wall, on the other write this window has: a REBOOT of a
   * server at a helpdesk-scope customer. Two verbs through one seam is the
   * claim - a fix that only guarded the Restart button would leave the reboot
   * exactly as it was.
   */
  it('refuses a reboot of a helpdesk customer\'s server, in the shipped words', () => {
    const rigged = rig(MSP_CUSTOMERS.fontaine);

    rigged.driver.startShift();

    const clicked = remote(
      rigged,
      HELPDESK_ACTIONS.machineReboot,
      MSP_IDS.fontaineFileServer,
    );

    expect(clicked.outcome).toBeNull();
    expect(clicked.refusal).toContain(
      'Helpdesk covers workstations and users here. Servers are not in this '
      + 'contract - escalate, or the customer engages their infrastructure '
      + 'provider.',
    );
    expect(clicked.refusal).toContain(
      '(Workstation creds never cross into the server tier, which is why this '
      + 'is refused and not merely discouraged.)',
    );
    expect(wasDispatched(
      rigged,
      HELPDESK_ACTIONS.machineReboot,
      MSP_IDS.fontaineFileServer,
    )).toBe(false);
  });

  /**
   * CLAIM 4. The sharpest hazard in the job, with a mouse in your hand: a
   * Pennington ticket on screen and a Holloway box under the cursor.
   *
   * HOLLOWAY-ACCT is fully-managed on purpose - nothing about its own contract
   * refuses this - so the STOP is the tenant guard and can be nothing else.
   */
  it('stops a remediation aimed at the customer who is not on screen', () => {
    const rigged = rig(MSP_CUSTOMERS.pennington);

    rigged.driver.startShift();

    const clicked = remote(
      rigged,
      HELPDESK_ACTIONS.machineReboot,
      MSP_IDS.hollowayFileServer,
    );

    expect(clicked.outcome).toBeNull();
    expect(clicked.refusal).toContain(
      'STOP. PENNINGTON-ACCT is on your screen but HOLL-SRV-01 belongs to '
      + 'HOLLOWAY-ACCT.',
    );
    expect(clicked.refusal).toContain(
      'Acting in the wrong tenant is the MSP horror story;',
    );
    expect(wasDispatched(
      rigged,
      HELPDESK_ACTIONS.machineReboot,
      MSP_IDS.hollowayFileServer,
    )).toBe(false);
  });

  /**
   * The half of the finding that is NOT a wall: the estate stays visible.
   *
   * A monitoring-only customer is one the desk is paid to watch, so filtering
   * their boxes out of the list would have broken the job in the name of fixing
   * it. Seeing is not touching, and only the touching is gated.
   */
  it('still lists every machine, including the ones it will not touch', () => {
    const rigged = rig(MSP_CUSTOMERS.pennington);
    const hostnames = rigged.api.graph
      .nodesOfKind('machine')
      .map((machine) => machine.fields[FIELDS.hostname]);

    expect(hostnames).toContain('NW-SRV-01');
    expect(hostnames).toContain('FONT-FILE-01');
    expect(hostnames).toContain('HOLL-SRV-01');
  });
});

/**
 * The directory pane, which had the identical hole on the other target kind:
 * identity work is helpdesk work, so the scope walls treat it differently from
 * a server - but "differently" has never meant "not at all", and a
 * monitoring-only account is not remediated by anybody's mouse.
 */
describe('the directory pane meets them too', () => {
  it('refuses an unlock at the monitoring-only customer, and never asks the '
    + 'world', () => {
    const rigged = rig(MSP_CUSTOMERS.northwind);

    rigged.driver.startShift();

    const clicked = directoryRemediation(
      rigged.api,
      HELPDESK_ACTIONS.accountUnlock,
      MSP_IDS.northwindContactAccount,
      {},
      'Done.',
    );

    expect(clicked.outcome).toBeNull();
    expect(clicked.refusal).toContain('This account is monitoring-only');
    expect(wasDispatched(
      rigged,
      HELPDESK_ACTIONS.accountUnlock,
      MSP_IDS.northwindContactAccount,
    )).toBe(false);
  });
});

/**
 * CLAIM 5, and the reason this slice is a seam rather than a patch.
 *
 * Remote Assist was not special. It was simply the window somebody wrote next,
 * the obvious way, with `api.dispatch` in it - and that is how the hole would
 * come back. So the files allowed to reach the engine directly are NAMED here,
 * and a new one has to argue with this test before it ships.
 *
 * The listed ones are not remediation surfaces: the two terminal dialects run
 * the seam themselves for estate verbs (and speak a whole shell besides), the
 * ticket and monitor panes act on TICKETS rather than on anybody's estate, chat
 * and the phone hand a dispatcher to scripted dialogue effects, and `about`
 * runs the two diagnostics this fake OS lies to you with. Anything else with a
 * button that changes a customer's estate calls `dispatchRemediation`.
 */
describe('the seam is the only way an app reaches the world', () => {
  const APPS_DIR = 'src/shell/apps';

  const ALLOWED = new Set([
    // The seam itself: the one place a remediation is sent from.
    'remediation.ts',
    // The terminal, both dialects - they call the seam for estate verbs.
    'cmd-run.ts',
    'cmd-unix.ts',
    // Ticket-grain work: escalation, classification, the handoff form.
    'tickets.ts',
    'monitor.ts',
    // Dialogue effects, which the world scripts and the player only agrees to.
    'chat.ts',
    'call.ts',
    // The fake OS lying about itself: the diagnostics and the percussion fix.
    'about.ts',
  ]);

  it('names every file that dispatches for itself', () => {
    const offenders = readdirSync(APPS_DIR)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .filter((name) => readFileSync(join(APPS_DIR, name), 'utf8')
        .includes('api.dispatch('))
      .filter((name) => !ALLOWED.has(name));

    expect(offenders).toEqual([]);
  });

  /**
   * And the two this slice moved, by name: a window that goes back to
   * `api.dispatch` fails here as well as in the played gates above, so the
   * revert is caught whether or not the estate it touches has a wall on it.
   */
  it('keeps the two windows that had the hole off the engine entirely', () => {
    for (const name of ['remote.ts', 'directory.ts']) {
      const source = readFileSync(join(APPS_DIR, name), 'utf8');

      expect(source).not.toContain('api.dispatch(');
      expect(source).toContain('dispatchRemediation');
    }
  });
});
