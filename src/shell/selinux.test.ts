/**
 * The SELinux beat, end to end, both ways (E6, 0.28.0).
 *
 * `cmd-unix.test.ts` proves the four verbs' output shapes through the real
 * parse. This is the JOURNEY: a promoted engineer puts the RHEL family on their
 * own box, logs in, finds a page being refused, and fixes it - either by
 * relabelling the file or by switching the enforcement off - and the world
 * remembers only one of those. Everything runs through the shipped driver, the
 * shipped engine and the shipped terminal; nothing here touches the DOM.
 *
 * The two paths are the point. Both of them serve the page, which is why "the
 * fix worked" is not the assertion anywhere below: what is asserted is which
 * facts each one leaves on the estate the next morning.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { tickAtMinute } from '../world/day';
import { FIELDS } from '../world/fields';
import { visibleMail } from '../world/mail';
import { MSP_CHANNELS, MSP_IDS } from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import type { DistroId } from './skins';
import { selinuxNodeIds } from '../world/selinux';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import { executeUnix, parseUnixCommand, type SshSession } from './apps/cmd-unix';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { offeredAtFor } from '../world/titles';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

const MAIL_ID = 'mail/selinux-permissive';
const SWEEP_NOTICE = 'Compliance sweep';
const DESK = selinuxNodeIds('FC-DESK-07');

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly ssh: SshSession;
  readonly notices: string[];
}

/**
 * A promoted engineer, on Fedora, standing on their own box - which is the
 * whole precondition of this beat and, at every step of it, a real one: the
 * standing is earned, the promotion is the real dispatch, the desktop is the
 * shell store the chooser writes, and the session is the real ssh.
 */
function rig(distro: DistroId = 'fedora'): Rig {
  const session = createWorldSession(MSP_CARRY);
  const notices: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title) => {
      notices.push(title);
    },
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api: GameApi = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (id, actor, target, params) => driver.dispatch(
      id,
      actor,
      target,
      params,
    ),
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
    actor: COMPANY_IDS.player,
  };

  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: offeredAtFor('systems_engineer'),
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  driver.raiseFirstIncident();
  driver.startShift();

  api.appState.patch('desktop', { skin: 'gnome', distro });

  const ssh = executeCommand(
    parseCommand('ssh engineer@FC-DESK-07'),
    api,
  ).enterSession ?? null;

  if (ssh === null) {
    throw new Error('ssh did not open a session on the player\'s own box');
  }

  return { session, driver, api, ssh, notices };
}

function run(rigged: Rig, input: string): readonly string[] {
  return executeUnix(parseUnixCommand(input), rigged.api, rigged.ssh).lines;
}

function reputation(rigged: Rig): number {
  const value = rigged.session.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.reputation,
  );

  return typeof value === 'number' ? value : Number.NaN;
}

/**
 * Out at five, in again at nine - the night the consequence is read across, and
 * the standing on either side of the START of the shift.
 *
 * The reading is taken around `startShift` rather than around the whole night
 * because the night itself scores the day: an idle shift drains reputation on
 * its own, and a test that compared yesterday's standing with today's could not
 * tell that drain apart from a charge this beat is not supposed to make.
 */
function overnight(rigged: Rig): { readonly before: number; readonly after: number } {
  const target = tickAtMinute(rigged.driver.day(), 17 * 60);

  while (rigged.session.engine.now() < target
    && rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }

  rigged.driver.clockOff();
  const before = reputation(rigged);
  rigged.driver.startShift();

  return { before, after: reputation(rigged) };
}

function mailIds(rigged: Rig): readonly string[] {
  return visibleMail(rigged.session.engine.graph, rigged.session.employer)
    .map(({ id }) => id);
}

describe('the SELinux denial, walked both ways (E6, 0.28.0)', () => {
  it('the relabel: the page is served, and nobody ever hears about it', () => {
    const rigged = rig();

    // The fault, as the player meets it: a refusal from a service that is up.
    expect(run(rigged, 'curl -I http://localhost/')[0])
      .toBe('HTTP/1.1 403 Forbidden');

    run(rigged, 'sudo restorecon -v /var/www/html/index.html');

    expect(run(rigged, 'curl -I http://localhost/')[0]).toBe('HTTP/2 200 ');
    expect(run(rigged, 'getenforce')).toEqual(['Enforcing']);

    // A day later, and there is nothing: no sweep, no mail, no record. The box
    // was never non-compliant, because the control was never switched off.
    overnight(rigged);

    expect(rigged.notices).not.toContain(SWEEP_NOTICE);
    expect(mailIds(rigged)).not.toContain(MAIL_ID);
    expect(rigged.session.engine.graph.getField(
      MSP_IDS.playerMachine,
      FIELDS.selinuxPermissiveAt,
    )).toBeUndefined();
  });

  it('the switch: the page is served, and the sweep says so in the morning', () => {
    const rigged = rig();

    run(rigged, 'sudo setenforce 0');

    expect(run(rigged, 'curl -I http://localhost/')[0]).toBe('HTTP/2 200 ');
    expect(run(rigged, 'getenforce')).toEqual(['Permissive']);
    // Nothing lands the same afternoon: a consequence in the same hour would
    // read as a punishment for the keystroke rather than as the cost of it.
    expect(rigged.notices).not.toContain(SWEEP_NOTICE);
    expect(mailIds(rigged)).not.toContain(MAIL_ID);

    const standing = overnight(rigged);

    expect(rigged.notices).toContain(SWEEP_NOTICE);
    expect(mailIds(rigged)).toContain(MAIL_ID);
    expect(rigged.session.engine.graph.getField(
      MSP_IDS.playerMachine,
      FIELDS.selinuxNoticedAt,
    )).toBeTypeOf('number');

    // And it is about the machine and nothing else: the morning the report
    // lands charges no meter. The cost of the shortcut is that it is written
    // down, which is the beat - a reputation hit here would make it a
    // telling-off for a keystroke that fixed the thing in front of them.
    expect(standing.after).toBe(standing.before);
  });

  it('reads the same rail once, however many mornings go past', () => {
    const rigged = rig();
    run(rigged, 'sudo setenforce 0');
    overnight(rigged);

    const stamped = rigged.session.engine.graph.getField(
      MSP_IDS.playerMachine,
      FIELDS.selinuxNoticedAt,
    );

    overnight(rigged);

    expect(rigged.session.engine.graph.getField(
      MSP_IDS.playerMachine,
      FIELDS.selinuxNoticedAt,
    )).toBe(stamped);
    expect(rigged.notices.filter((title) => title === SWEEP_NOTICE))
      .toHaveLength(1);
  });

  it('TEETH: an untouched box is never swept, and the estate is unmoved', () => {
    // The whole beat is inert until somebody reaches for the switch. A player
    // who never logs into their own box, and every box that is not theirs, are
    // exactly as they were - which is what keeps this out of every other world.
    const rigged = rig();
    overnight(rigged);

    expect(rigged.notices).not.toContain(SWEEP_NOTICE);
    expect(mailIds(rigged)).not.toContain(MAIL_ID);
    expect(rigged.session.engine.graph.getField(
      MSP_IDS.mspInfraServer,
      FIELDS.selinuxMode,
    )).toBeUndefined();
  });

  it('TEETH: the beat is built by the login, and only on the RHEL family', () => {
    // The same login on the same box, twice, with the DISTRO as the only
    // difference between the two runs. On Ubuntu nothing is stood up at all -
    // no web server, no file, no mode - because a box with no SELinux on it
    // cannot have an SELinux denial, and materialising one there would be the
    // shell inventing an incident on a machine that cannot have it.
    const ubuntu = rig('ubuntu');

    expect(ubuntu.session.engine.graph.getNode(DESK.unit)).toBeUndefined();
    expect(ubuntu.session.engine.graph.getNode(DESK.file)).toBeUndefined();
    expect(ubuntu.session.engine.graph.getField(
      MSP_IDS.playerMachine,
      FIELDS.selinuxMode,
    )).toBeUndefined();
    expect(run(ubuntu, 'curl -I http://localhost/')[0])
      .toContain('Failed to connect');

    const fedora = rig('fedora');
    expect(fedora.session.engine.graph.getNode(DESK.unit)?.kind).toBe('unit');
  });
});
