/**
 * The characteristic sysadmin incidents, driven end to end through the shipped
 * driver, the shipped engine and the shipped unix terminal (E6, 0.19.0).
 *
 * Each incident is diagnosed and fixed the way a player reaches it - ssh in, read
 * the estate with the real commands, run the real fix - and the teeth are here:
 * every incident is a REAL estate state, so flipping it healthy leaves the
 * diagnosis nothing to find; du reads the box's real journal size, so changing it
 * changes du; and the blameless postmortem that closes the failed-deploy incident
 * names no person. Nothing below touches the DOM, so the driver runs exactly as it
 * does in the browser. A service-desk player is raised none of it, which is the
 * whole of why the estate is byte-identical until the promotion.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  CAREER_ACTIONS,
  INCIDENT_JOURNAL_BYTES,
  JOURNAL_VACUUM_TARGET,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS, PLAYER_TIERS, SYSTEMD_STATES } from '../world/fields';
import { MSP_CHANNELS, MSP_IDS } from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import { namesLeaked } from '../world/postmortem';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import { executeUnix, parseUnixCommand, type SshSession } from './apps/cmd-unix';
import type { GameApi } from './apps/types';
import { DayDriver } from './day-driver';
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

const DISK = 'ticket:syseng-disk-full';
const CERT = 'ticket:syseng-cert-expiry';
const DEPLOY = 'ticket:syseng-failed-deploy';
const PERM = 'ticket:syseng-permission-denied';
const WORKER = MSP_IDS.mspInfraWorkerUnit;
const NGINX = MSP_IDS.mspInfraNginxUnit;
const AUTH = MSP_IDS.mspInfraAuthUnit;
const AUTHCFG = MSP_IDS.mspInfraAuthConfig;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
}

function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: () => {},
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api: GameApi = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
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
    actor: COMPANY_IDS.player,
  };

  return { session, driver, api };
}

/** Promote to the engineer tier and raise the incidents, the real dispatch. */
function promoteAndRaise(rigged: Rig): void {
  rigged.session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: offeredAtFor('systems_engineer'),
  }]);
  rigged.session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  rigged.driver.raiseFirstIncident();
}

/** ssh onto FC-RMM-01, the real path the fixes run over. */
function ssh(api: GameApi): SshSession {
  const session = executeCommand(
    parseCommand('ssh engineer@FC-RMM-01'),
    api,
  ).enterSession;

  if (session === undefined) {
    throw new Error('ssh did not open a session on FC-RMM-01');
  }

  return session;
}

/** Run one unix line over the session and return its output as one string. */
function run(api: GameApi, session: SshSession, line: string): string {
  return executeUnix(parseUnixCommand(line), api, session).lines.join('\n');
}

function field(session: WorldSession, node: string, name: string): unknown {
  return session.engine.graph.getField(node, name);
}

describe('the characteristic incidents, on the real path (E6, 0.19.0)', () => {
  describe('tier-gate: a service-desk player is raised none of it', () => {
    it('has no incident in the world and cannot ssh to reach one', () => {
      const { session, api } = rig();

      // No promotion: the incidents are summoned by the promotion, so a
      // service-desk player has none of them - and the estate that carries their
      // state is byte-identical to before 0.19.0.
      expect(field(session, COMPANY_IDS.player, FIELDS.playerTier))
        .not.toBe(PLAYER_TIERS.systemsEngineer);
      expect(session.engine.graph.getNode(DISK)).toBeUndefined();
      expect(session.engine.graph.getNode(CERT)).toBeUndefined();
      expect(session.engine.graph.getNode(DEPLOY)).toBeUndefined();
      expect(session.engine.graph.getNode(PERM)).toBeUndefined();
      // The auth unit and its config file are BUILT by the permission incident,
      // so with no incident there is neither - the box is as it was before 0.21.0.
      expect(session.engine.graph.getNode(AUTH)).toBeUndefined();
      expect(session.engine.graph.getNode(AUTHCFG)).toBeUndefined();
      // The worker unit is built by the failed-deploy incident, so with no
      // incident there is no such unit - the box is as it was before 0.19.0.
      expect(session.engine.graph.getNode(WORKER)).toBeUndefined();
      expect(field(session, NGINX, FIELDS.certExpired)).not.toBe(true);
      expect(field(session, MSP_IDS.mspInfraServer, FIELDS.journalBytes))
        .toBeUndefined();

      // And the whole server surface is behind the ssh wall: a desk player is
      // refused, so even the diagnosis is on the far side of the promotion.
      const refused = executeCommand(
        parseCommand('ssh engineer@FC-RMM-01'),
        api,
      );
      expect(refused.enterSession).toBeUndefined();
      expect(refused.lines.join('\n')).toContain('not service-desk access');
    });
  });

  describe('slice 1 - the disk-full incident (df -h -> du -> vacuum)', () => {
    it('diagnoses with df/du and clears with the vacuum, on the real path', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // df -h shows the root filesystem near full - the fire drill's first read.
      const df = run(api, s, 'df -h');
      expect(df).toContain('Mounted on');
      expect(df).toMatch(/9\d%|100%/u); // Use% near full off the low disk_free

      // du -sh /var/log/journal finds the runaway - the ~26G eating the disk.
      const du = run(api, s, 'du -sh /var/log/journal');
      expect(du).toContain('/var/log/journal');
      expect(du).toContain('26G'); // humanSize(INCIDENT_JOURNAL_BYTES)

      // The vacuum clears it and hands the space back; the ticket closes on the
      // journal being down to the vacuum target.
      expect(session.engine.ticketState(DISK)).toBe('open');
      const out = run(api, s, 'journalctl --vacuum-size=200M');
      expect(out).toContain('Vacuuming done');
      expect(field(session, MSP_IDS.mspInfraServer, FIELDS.journalBytes))
        .toBe(JOURNAL_VACUUM_TARGET);
      expect(session.engine.ticketState(DISK)).toBe('resolved');
    });

    it('du reads the REAL journal size - change it and du changes (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      const before = run(api, s, 'du -sh /var/log/journal');
      expect(before).toContain('26G');

      // Halve the runaway on the node: du has to follow it, because it reads the
      // field and does not invent a number.
      session.engine.applySetup([{
        op: 'setField',
        id: MSP_IDS.mspInfraServer,
        field: FIELDS.journalBytes,
        value: Math.round(INCIDENT_JOURNAL_BYTES / 2),
      }]);

      const after = run(api, s, 'du -sh /var/log/journal');
      expect(after).toContain('13G');
      expect(after).not.toBe(before);
    });

    it('flipped healthy, the vacuum has nothing to reclaim (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // Flip the box healthy: a small journal and free disk. Now the diagnosis
      // finds nothing and the fix refuses - there is no fire to fight.
      session.engine.applySetup([
        {
          op: 'setField',
          id: MSP_IDS.mspInfraServer,
          field: FIELDS.journalBytes,
          value: JOURNAL_VACUUM_TARGET,
        },
        {
          op: 'setField',
          id: MSP_IDS.mspInfraServer,
          field: FIELDS.diskFree,
          value: 20_000_000_000,
        },
      ]);

      const out = run(api, s, 'journalctl --vacuum-size=200M');
      expect(out).toContain('already small');
    });
  });

  describe('slice 2 - the cert-expiry incident (a process failure)', () => {
    it('diagnoses the expired cert with curl and renews it, on the real path', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // The service is UP and refused: curl -I over https shows the expired cert,
      // the running-and-refusing state a browser sees.
      const curl = run(api, s, 'curl -I https://fc-rmm-01');
      expect(curl).toContain('certificate has expired');

      // It reads as a process failure, not a crash: nginx is still running.
      expect(field(session, NGINX, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);

      // certbot renew replaces it and the ticket closes on the flag it clears.
      expect(session.engine.ticketState(CERT)).toBe('open');
      const renew = run(api, s, 'certbot renew');
      expect(renew).toContain('renewals succeeded');
      expect(field(session, NGINX, FIELDS.certExpired)).toBe(false);
      expect(session.engine.ticketState(CERT)).toBe('resolved');

      // And now curl no longer refuses - the service was up the whole time.
      expect(run(api, s, 'curl -I https://fc-rmm-01'))
        .not.toContain('certificate has expired');
    });

    it('flipped healthy, curl does not refuse and renew is churn (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // A valid cert: the incident's real state flipped off. curl serves and the
      // renew has nothing to do, the honest non-event certbot really reports.
      session.engine.applySetup([{
        op: 'setField',
        id: NGINX,
        field: FIELDS.certExpired,
        value: false,
      }]);

      expect(run(api, s, 'curl -I https://fc-rmm-01'))
        .not.toContain('certificate has expired');
      expect(run(api, s, 'certbot renew')).toContain('not yet due for renewal');
    });
  });

  describe('slice 3 - the failed-deploy incident + the blameless postmortem', () => {
    it('rolls back, and closes on the blameless postmortem, on the real path', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // The real state: the worker failed after the deploy, with the "worked in
      // staging" cascade in its journal.
      expect(field(session, WORKER, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.failed);
      const journal = run(api, s, 'journalctl -u fcworker');
      expect(journal).toContain('worked in staging');

      // The rollback + restart brings it up - but does NOT close the incident:
      // the tier closes it with the postmortem, not the restart.
      expect(run(api, s, 'systemctl restart fcworker')).toBe('');
      expect(field(session, WORKER, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
      expect(session.engine.ticketState(DEPLOY)).toBe('open');

      // The postmortem closes it, and reads back blamelessly.
      const pm = run(api, s, 'postmortem file fcworker');
      expect(pm).toContain('The incident is closed.');
      expect(pm).toContain('WHAT THE SYSTEM LET HAPPEN');
      expect(session.engine.ticketState(DEPLOY)).toBe('resolved');
      // The record is on the append-only trail.
      expect(field(session, COMPANY_IDS.player, FIELDS.postmortems))
        .toContain(WORKER);
    });

    it('the postmortem names NO person (blameless, teeth on the copy)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { api } = rigged;
      const s = ssh(api);

      run(api, s, 'systemctl restart fcworker');
      const pm = run(api, s, 'postmortem file fcworker');

      // The write-up analyses the system - staging parity, no rollback - and
      // names nobody. If it ever leaked a name, this reds.
      expect(pm.toLowerCase()).toContain('staging');
      expect(namesLeaked(pm)).toEqual([]);
    });

    it('refuses a postmortem while the fire is still burning (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // The unit is still failed - a postmortem is written AFTER the fire is out.
      expect(field(session, WORKER, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.failed);
      const pm = run(api, s, 'postmortem file fcworker');
      expect(pm).toContain('still down');
      expect(session.engine.ticketState(DEPLOY)).toBe('open');
    });
  });

  describe('slice 4 - the permission-denied incident (chmod/chown + restart)', () => {
    it('diagnoses the wrong-mode config and fixes it, on the real path', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // The real state: the auth service failed, and the journal names the denied
      // path - not a crash, a file it cannot read.
      expect(field(session, AUTH, FIELDS.unitState)).toBe(SYSTEMD_STATES.failed);
      expect(run(api, s, 'journalctl -u fcauth')).toContain('Permission denied');

      // ls -la shows the wrong owner and mode - readable only by root.
      const before = run(api, s, 'ls -la /etc/fcauth/auth.env');
      expect(before).toContain('-rw-------');
      expect(before).toContain('root');
      expect(before).toContain('auth.env');

      // A restart BEFORE the fix fails again and does not close the incident - the
      // fix is the permission, not the retry.
      expect(session.engine.ticketState(PERM)).toBe('open');
      expect(run(api, s, 'systemctl restart fcauth'))
        .toContain('Job for fcauth.service failed');
      expect(field(session, AUTH, FIELDS.unitState)).toBe(SYSTEMD_STATES.failed);
      expect(session.engine.ticketState(PERM)).toBe('open');

      // Fix the owner and the bits, least privilege - the group reads, the world
      // does not - then restart. Now it comes up and the ticket closes.
      expect(run(api, s, 'chown root:fcauth /etc/fcauth/auth.env')).toBe('');
      expect(run(api, s, 'chmod 640 /etc/fcauth/auth.env')).toBe('');
      // ls -la reflects the fix - it reads the fields chown/chmod wrote.
      const after = run(api, s, 'ls -la /etc/fcauth/auth.env');
      expect(after).toContain('-rw-r-----');
      expect(after).toContain('fcauth');

      expect(run(api, s, 'systemctl restart fcauth')).toBe('');
      expect(field(session, AUTH, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
      expect(session.engine.ticketState(PERM)).toBe('resolved');
    });

    it('chmod/chown write the real fields ls -la reads - no drift (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      run(api, s, 'chmod 604 /etc/fcauth/auth.env');
      // The listing follows the field, not an invented column.
      expect(field(session, AUTHCFG, FIELDS.fsMode)).toBe('604');
      expect(run(api, s, 'ls -la /etc/fcauth/auth.env')).toContain('-rw----r--');
    });

    it('flipped healthy, the restart is not blocked and there is nothing to fix (teeth)', () => {
      const rigged = rig();
      promoteAndRaise(rigged);
      const { session, api } = rigged;
      const s = ssh(api);

      // Make the file readable by the service account from the start: the gate is
      // the wrong permission and nothing else, so now there is no block.
      session.engine.applySetup([
        { op: 'setField', id: AUTHCFG, field: FIELDS.fsOwner, value: 'root' },
        { op: 'setField', id: AUTHCFG, field: FIELDS.fsGroup, value: 'fcauth' },
        { op: 'setField', id: AUTHCFG, field: FIELDS.fsMode, value: '640' },
      ]);

      expect(run(api, s, 'systemctl restart fcauth')).toBe('');
      expect(field(session, AUTH, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
      expect(session.engine.ticketState(PERM)).toBe('resolved');
    });
  });
});
