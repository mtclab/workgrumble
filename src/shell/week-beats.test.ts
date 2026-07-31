/**
 * The week's set pieces, played rather than described.
 *
 * The solvability gate proves every ticket can be closed. It says nothing about
 * the beats those tickets were written FOR - a shortcut whose bill arrives the
 * next morning, a favour that means there is no ticket at all, a flood that
 * closes forty people's reports with one repair, an outage that happens twice
 * at the same minute, and a door that shuts again four minutes after you open
 * it. Each of those is a journey with a fork in it, and a fork is exactly the
 * thing a per-ticket test cannot see.
 *
 * So every one of them is driven here, through the shipped driver and the
 * shipped engine, at the minute of the week it belongs to, with both answers
 * taken where there are two. Nothing touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import {
  HELPDESK_ACTIONS,
  SEATS_PARAM,
  SOCIAL_ENGINEERING_REPUTATION,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { MINUTES_PER_DAY, shiftEndTick, tickAtMinute } from '../world/day';
import { EVENT_IDS, readEventLog } from '../world/events';
import { FIELDS, LOCKOUT_THRESHOLD } from '../world/fields';
import { visibleMail } from '../world/mail';
import { createWorldSession } from '../world/session';
import { linkNote } from '../world/tickets';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface World {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly notices: string[];
}

function world(): World {
  const { engine, seed } = createWorldSession();
  const notices: string[] = [];
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title) => {
      notices.push(title);
    },
  });

  return { driver, engine, notices };
}

/** Runs to a minute of the day that is on screen, a tick at a time. */
function runTo(scene: World, minute: number): void {
  const target = tickAtMinute(scene.driver.day(), minute);

  while (scene.engine.now() < target && scene.driver.state() === 'shift') {
    scene.driver.step(TICK_INTERVAL_MS);
  }
}

/** Opens the day, and clocks off at five without doing anything else. */
function idleThroughToday(scene: World): void {
  scene.driver.startShift();
  runTo(scene, 17 * 60);
  scene.driver.clockOff();
}

/** Monday morning to the morning of `day`, doing nothing on the way. */
function skipTo(day: number): World {
  const scene = world();

  while (scene.driver.day() < day) {
    idleThroughToday(scene);
  }

  scene.driver.startShift();
  return scene;
}

function dispatch(
  scene: World,
  action: string,
  target: string | null,
  params: Record<string, string | number | boolean | null> = {},
): void {
  const result = scene.driver.dispatch(
    action,
    COMPANY_IDS.player,
    target,
    params,
  );

  expect(result, `${action} on ${String(target)}`).toEqual({ ok: true });
}

function meter(scene: World, field: string): number {
  const value = scene.engine.graph.getField(COMPANY_IDS.player, field);
  return typeof value === 'number' ? value : Number.NaN;
}

/* -- the enrolment nobody checked ----------------------------------------- */

describe('the shortcut on the new phone', () => {
  /**
   * Both answers close the ticket in the same minute and neither is refused.
   * The whole difference is a field on an account and what it costs tomorrow,
   * which is the honest version of this lesson and the only one worth shipping.
   */
  function enrolPriya(verify: boolean): World {
    const scene = skipTo(3);
    runTo(scene, 11 * 60);
    expect(scene.engine.ticketState('ticket:mfa-reregister')).toBe('open');

    if (verify) {
      dispatch(
        scene,
        HELPDESK_ACTIONS.accountVerifyIdentity,
        COMPANY_IDS.priyaAccount,
      );
    }

    dispatch(
      scene,
      HELPDESK_ACTIONS.accountRegisterMfa,
      COMPANY_IDS.priyaAccount,
    );

    expect(scene.engine.ticketState('ticket:mfa-reregister')).toBe('resolved');
    return scene;
  }

  it('closes the ticket whether or not anybody checked who she was', () => {
    for (const verified of [true, false]) {
      const scene = enrolPriya(verified);
      expect(
        scene.engine.graph.getField(COMPANY_IDS.priyaAccount, FIELDS.mfaEnrolled),
        `verified=${String(verified)}`,
      ).toBe(true);
    }
  });

  it('sends the bill the next morning when nobody checked', () => {
    const scene = enrolPriya(false);

    // Wednesday out, Thursday in. The cost lands at the start of the shift
    // rather than at last night's clock-off, because a day is how long it
    // takes somebody else to notice - so the meter is read across the night
    // rather than across the day the enrolment happened in.
    runTo(scene, 17 * 60);
    scene.driver.clockOff();
    expect(scene.driver.day()).toBe(4);
    const before = meter(scene, FIELDS.reputation);
    scene.driver.startShift();

    expect(meter(scene, FIELDS.reputation))
      .toBe(before - SOCIAL_ENGINEERING_REPUTATION);
    expect(scene.notices).toContain('Security incident report');
    expect(
      scene.engine.graph.getField(
        COMPANY_IDS.priyaAccount,
        FIELDS.securityFalloutAt,
      ),
    ).toBeTypeOf('number');
    // And the mail that says so exists, stamped at the minute it landed.
    expect(visibleMail(scene.engine.graph).map(({ id }) => id))
      .toContain('mail/security-incident');

    // Once. A second morning does not bill it again - asserted on the
    // watermark and the report rather than on the meter, because a week
    // nobody worked drains reputation to the floor on its own and a floor
    // cannot show whether something was charged twice.
    const stamped = scene.engine.graph.getField(
      COMPANY_IDS.priyaAccount,
      FIELDS.securityFalloutAt,
    );
    runTo(scene, 17 * 60);
    scene.driver.clockOff();
    scene.driver.startShift();
    expect(
      scene.engine.graph.getField(
        COMPANY_IDS.priyaAccount,
        FIELDS.securityFalloutAt,
      ),
    ).toBe(stamped);
    expect(
      scene.notices.filter((title) => title === 'Security incident report'),
    ).toHaveLength(1);
  });

  it('sends nothing at all when somebody did', () => {
    const scene = enrolPriya(true);

    runTo(scene, 17 * 60);
    scene.driver.clockOff();
    const before = meter(scene, FIELDS.reputation);
    scene.driver.startShift();

    expect(meter(scene, FIELDS.reputation)).toBe(before);
    expect(scene.notices).not.toContain('Security incident report');
    expect(visibleMail(scene.engine.graph).map(({ id }) => id))
      .not.toContain('mail/security-incident');
  });

  /** And the wrong flavour of fix says which fix it is the wrong flavour of. */
  it('refuses a session revoke on an account with no working factor', () => {
    const scene = skipTo(3);
    runTo(scene, 11 * 60);

    const refused = scene.driver.dispatch(
      HELPDESK_ACTIONS.accountRevokeSessions,
      COMPANY_IDS.player,
      COMPANY_IDS.priyaAccount,
      {},
    );

    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason)
      .toContain('the fix for that is a new enrolment');
    expect(scene.engine.ticketState('ticket:mfa-reregister')).toBe('open');
  });
});

/* -- the favour, and the ticket it costs ---------------------------------- */

describe('somebody who would rather message you than file', () => {
  it('files it properly when the favour is not done', () => {
    const scene = skipTo(2);
    runTo(scene, 14 * 60 + 25);

    // He asked at ten past two and got round to the form by twenty past.
    expect(scene.engine.ticketState('ticket:must-change-password')).toBe('open');
    expect(
      scene.engine.graph.getField(
        'ticket:must-change-password',
        FIELDS.spawnedAt,
      ),
    ).toBe(tickAtMinute(2, 14 * 60 + 20));
  });

  it('raises nothing at all when it is done off the books', () => {
    const scene = skipTo(2);
    runTo(scene, 14 * 60 + 12);

    // The message has landed; the favour is done in the conversation, which is
    // the same verb the ticket would have been closed with.
    dispatch(
      scene,
      HELPDESK_ACTIONS.accountResetPassword,
      COMPANY_IDS.terryAccount,
    );

    runTo(scene, 14 * 60 + 40);

    expect(scene.engine.graph.getNode('ticket:must-change-password'))
      .toBeUndefined();
    // Which is the entire cost of being helpful: the work happened and the
    // week has no record that it did.
    expect(
      scene.engine.graph.nodesOfKind('ticket')
        .filter((ticket) => ticket.fields[FIELDS.state] === 'resolved')
        .map(({ id }) => id),
    ).not.toContain('ticket:must-change-password');
  });
});

/* -- the chain ------------------------------------------------------------ */

describe('the request that was granted exactly as written', () => {
  it('brings the same person back the minute the first one closes', () => {
    const scene = skipTo(2);
    runTo(scene, 13 * 60 + 20);
    expect(scene.engine.ticketState('ticket:mailbox-access')).toBe('open');
    expect(scene.engine.graph.getNode('ticket:sendas-missing')).toBeUndefined();

    dispatch(
      scene,
      HELPDESK_ACTIONS.shareGrantAccess,
      COMPANY_IDS.salesMailbox,
      { account: COMPANY_IDS.kwameAccount },
    );

    expect(scene.engine.ticketState('ticket:mailbox-access')).toBe('resolved');
    expect(scene.engine.ticketState('ticket:sendas-missing')).toBe('open');
    expect(scene.notices).toContain('They are back');

    dispatch(
      scene,
      HELPDESK_ACTIONS.accountAddToGroup,
      COMPANY_IDS.kwameAccount,
      { group: COMPANY_IDS.salesSendAs },
    );

    expect(scene.engine.ticketState('ticket:sendas-missing')).toBe('resolved');
  });
});

/* -- the seat a leaver is still holding ----------------------------------- */

describe('the new starter and the man who left in April', () => {
  it('refuses the seat until one comes back, and says why', () => {
    const scene = skipTo(3);

    const full = scene.driver.dispatch(
      HELPDESK_ACTIONS.accountAssignLicence,
      COMPANY_IDS.player,
      COMPANY_IDS.robAccount,
      { [SEATS_PARAM]: COMPANY_IDS.suiteLicences },
    );

    expect(full.ok).toBe(false);
    expect(full.ok ? '' : full.reason).toContain('no free seats');
    expect(scene.engine.ticketState('ticket:licence-exhausted')).toBe('open');

    dispatch(
      scene,
      HELPDESK_ACTIONS.accountRevokeLicence,
      COMPANY_IDS.colinAccount,
      { [SEATS_PARAM]: COMPANY_IDS.suiteLicences },
    );
    dispatch(
      scene,
      HELPDESK_ACTIONS.accountAssignLicence,
      COMPANY_IDS.robAccount,
      { [SEATS_PARAM]: COMPANY_IDS.suiteLicences },
    );

    expect(scene.engine.ticketState('ticket:licence-exhausted'))
      .toBe('resolved');
  });
});

/* -- the door that shuts again -------------------------------------------- */

describe('the account that relocks', () => {
  it('shuts again within the shift when only the door is opened', () => {
    const scene = skipTo(4);
    expect(scene.engine.ticketState('ticket:stale-device-relock')).toBe('open');

    dispatch(scene, HELPDESK_ACTIONS.accountUnlock, COMPANY_IDS.hildaAccount);
    expect(scene.engine.graph.getField(COMPANY_IDS.hildaAccount, FIELDS.locked))
      .toBe(false);

    // The tablet is still offering the old one, so the count climbs back to
    // the threshold and the directory does exactly what it is for.
    runTo(scene, 10 * 60);

    expect(scene.engine.graph.getField(COMPANY_IDS.hildaAccount, FIELDS.locked))
      .toBe(true);
    expect(scene.engine.graph.getField(
      COMPANY_IDS.hildaAccount,
      FIELDS.badPwCount,
    )).toBe(LOCKOUT_THRESHOLD);
    expect(scene.engine.ticketState('ticket:stale-device-relock')).toBe('open');

    // And the machine has been writing it down the whole time.
    const log = readEventLog(scene.engine.graph.getField(
      COMPANY_IDS.warehouseMachine,
      FIELDS.eventLog,
    ));
    expect(log.filter((event) => event.id === EVENT_IDS.logonFailed).length)
      .toBeGreaterThan(1);
  });

  it('holds once the thing that was typing has been silenced', () => {
    const scene = skipTo(4);

    dispatch(
      scene,
      HELPDESK_ACTIONS.deviceForgetCredentials,
      COMPANY_IDS.warehouseTablet,
    );
    dispatch(scene, HELPDESK_ACTIONS.accountUnlock, COMPANY_IDS.hildaAccount);

    expect(scene.engine.ticketState('ticket:stale-device-relock'))
      .toBe('resolved');

    runTo(scene, 11 * 60);
    expect(scene.engine.graph.getField(COMPANY_IDS.hildaAccount, FIELDS.locked))
      .toBe(false);
  });
});

/* -- the flood ------------------------------------------------------------ */

describe('Thursday, and forty people with one fault', () => {
  it('closes the duplicates with the parent, in the parent\'s own words', () => {
    const scene = skipTo(4);
    runTo(scene, 11 * 60);

    const children = ['ticket:vpn-cert-dup-ada', 'ticket:vpn-cert-dup-gary'];

    for (const id of children) {
      expect(scene.engine.ticketState(id)).toBe('open');
    }

    // Restarting it is the first thing anybody tries, and it is refused with
    // the sentence that explains why the flood keeps arriving.
    const restart = scene.driver.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.vpn,
      {},
    );
    expect(restart.ok).toBe(false);
    expect(restart.ok ? '' : restart.reason).toContain('already running');

    for (const id of children) {
      dispatch(scene, HELPDESK_ACTIONS.ticketLinkToParent, id, {
        parent: 'ticket:vpn-cert-expired',
        note: linkNote('Nobody working from home can connect',
          'ticket:vpn-cert-expired'),
      });
    }

    // The parent's last word to its own reporter, which is what the copies get.
    dispatch(scene, HELPDESK_ACTIONS.ticketAddComment,
      'ticket:vpn-cert-expired',
      { comment: 'The certificate had expired. It has been replaced.' });

    dispatch(scene, HELPDESK_ACTIONS.serviceRenewCertificate, COMPANY_IDS.vpn);

    expect(scene.engine.ticketState('ticket:vpn-cert-expired'))
      .toBe('resolved');

    for (const id of children) {
      expect(scene.engine.ticketState(id), id).toBe('resolved');
      expect(
        scene.engine.graph.getField(id, FIELDS.customerVisible),
      ).toContain('The certificate had expired. It has been replaced.');
    }
  });

  it('refuses to attach a ticket that is nobody\'s duplicate', () => {
    const scene = skipTo(4);
    runTo(scene, 11 * 60);

    const refused = scene.driver.dispatch(
      HELPDESK_ACTIONS.ticketLinkToParent,
      COMPANY_IDS.player,
      'ticket:stale-device-relock',
      { parent: 'ticket:vpn-cert-expired', note: 'Same morning, surely.' },
    );

    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('not a duplicate');
  });
});

/* -- the maintenance window ------------------------------------------------ */

describe('Wednesday, announced and broken anyway', () => {
  it('takes the service down at nine and leaves it down past eleven', () => {
    const scene = skipTo(3);

    // The window is a world incident, not a ticket: it happens at nine
    // whether or not anybody was watching, and the reports arrive later.
    expect(scene.engine.graph.getField(COMPANY_IDS.fileShare, FIELDS.status))
      .toBe('stopped');
    expect(scene.notices).toContain('Maintenance window');

    runTo(scene, 11 * 60 + 30);
    expect(scene.engine.ticketState('ticket:share-maintenance')).toBe('open');
    expect(scene.engine.ticketState('ticket:share-dup-terry')).toBe('open');

    dispatch(scene, HELPDESK_ACTIONS.ticketLinkToParent,
      'ticket:share-dup-terry',
      {
        parent: 'ticket:share-maintenance',
        note: linkNote('The common drive has gone', 'ticket:share-maintenance'),
      });
    dispatch(scene, HELPDESK_ACTIONS.serviceRestart, COMPANY_IDS.fileShare);

    expect(scene.engine.ticketState('ticket:share-maintenance'))
      .toBe('resolved');
    expect(scene.engine.ticketState('ticket:share-dup-terry')).toBe('resolved');
  });
});

/* -- the arc --------------------------------------------------------------- */

describe('the same thing every Tuesday and Thursday', () => {
  it('is a printer on the Tuesday and a timetable by the Thursday', () => {
    const scene = skipTo(2);

    // Monday evening: the trolley wanted the socket at four minutes to five.
    expect(scene.engine.graph.getField(
      COMPANY_IDS.warehousePrinter,
      FIELDS.powered,
    )).toBe(false);
    expect(scene.engine.ticketState('ticket:vacuum-tuesday')).toBe('open');

    dispatch(
      scene,
      HELPDESK_ACTIONS.devicePowerCycle,
      COMPANY_IDS.warehousePrinter,
    );
    expect(scene.engine.ticketState('ticket:vacuum-tuesday')).toBe('resolved');

    while (scene.driver.day() < 4) {
      runTo(scene, 17 * 60);
      scene.driver.clockOff();

      if (scene.driver.day() < 4) {
        scene.driver.startShift();
      }
    }

    scene.driver.startShift();
    expect(scene.engine.ticketState('ticket:vacuum-thursday')).toBe('open');

    // Power alone is a standing appointment rather than a fix, and the ticket
    // says so by staying open.
    dispatch(
      scene,
      HELPDESK_ACTIONS.devicePowerCycle,
      COMPANY_IDS.warehousePrinter,
    );
    expect(scene.engine.ticketState('ticket:vacuum-thursday')).toBe('open');

    dispatch(
      scene,
      HELPDESK_ACTIONS.facilitiesStickyNote,
      COMPANY_IDS.warehousePrintServer,
    );
    expect(scene.engine.ticketState('ticket:vacuum-thursday')).toBe('resolved');
  });

  /**
   * And the correlation is READABLE: two outages on that box, on different
   * days, at the same minute. It is the only clue the arc has, it is the only
   * trace a socket in another corridor ever leaves, and it is the one thing a
   * player is expected to notice for themselves.
   */
  it('writes both outages into the same log at the same minute', () => {
    const scene = skipTo(2);

    // Tuesday's is fixed, as it would be: the printer is brought back and the
    // ticket closes. That matters here, because a socket that is already dead
    // cannot be unplugged again - Thursday's outage only exists because
    // somebody turned it back on in between, which is the arc in one line.
    dispatch(
      scene,
      HELPDESK_ACTIONS.devicePowerCycle,
      COMPANY_IDS.warehousePrinter,
    );

    while (scene.driver.day() < 4) {
      runTo(scene, 17 * 60);
      scene.driver.clockOff();

      if (scene.driver.day() < 4) {
        scene.driver.startShift();
      }
    }

    const log = readEventLog(scene.engine.graph.getField(
      COMPANY_IDS.warehousePrintServer,
      FIELDS.eventLog,
    ));
    const outages = log.filter((event) => event.id === EVENT_IDS.powerLost);

    expect(outages).toHaveLength(2);

    const minutes = outages.map((event) => event.tick % MINUTES_PER_DAY);
    const days = outages.map(
      (event) => Math.floor(event.tick / MINUTES_PER_DAY),
    );

    // Same minute of the day, two days apart. That sentence is the ticket, and
    // it is the only place in the game it is written down.
    expect(new Set(minutes).size).toBe(1);
    expect(days[1] ?? 0).toBe((days[0] ?? 0) + 2);
    // And the restore in between, so the log reads as a story rather than as
    // two identical lines.
    expect(log.some((event) => event.id === EVENT_IDS.devicePowered)).toBe(true);
  });
});

/* -- the shift that ends at five ------------------------------------------ */

describe('Friday', () => {
  it('deals three tickets and the conversation at three', () => {
    const scene = skipTo(5);

    expect(scene.engine.ticketState('ticket:phishing-report')).toBe('open');

    runTo(scene, 12 * 60);
    expect(scene.engine.ticketState('ticket:coverup-backup')).toBe('open');
    expect(scene.engine.ticketState('ticket:hr-report-macro')).toBe('open');

    dispatch(scene, HELPDESK_ACTIONS.mailRuleEnable, COMPANY_IDS.phishBlock);
    dispatch(scene, HELPDESK_ACTIONS.serviceRestart, COMPANY_IDS.backupAgent);
    dispatch(scene, HELPDESK_ACTIONS.serviceRestart, COMPANY_IDS.reportJob);

    for (const id of [
      'ticket:phishing-report',
      'ticket:coverup-backup',
      'ticket:hr-report-macro',
    ]) {
      expect(scene.engine.ticketState(id), id).toBe('resolved');
    }

    runTo(scene, 17 * 60);
    expect(scene.engine.now()).toBe(shiftEndTick(5));
    expect(scene.driver.reviewOutcome()).not.toBe('pending');
  });
});
