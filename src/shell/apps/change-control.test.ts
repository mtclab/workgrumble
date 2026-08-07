import { describe, expect, it } from 'vitest';

import { PROMOTION_REPUTATION } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { MSP_IDS } from '../../world/msp-company';
import {
  changeClass,
  changeControlGate,
  hasActiveIncident,
  isBusinessHours,
  isRiskyProductionChange,
} from '../../world/change-control';
import { SYSTEMD_ACTIONS } from '../../world/actions';
import { FIELDS, SYSTEMD_STATES } from '../../world/fields';
import { shiftStartTick } from '../../world/hours';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../../world/session';
import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand, type CommandResult } from './cmd-run';
import { executeUnix, parseUnixCommand, type SshSession } from './cmd-unix';
import type { GameApi } from './types';

/**
 * Change control (E6, 0.18.0), driven through the REAL dispatch path.
 *
 * The gate lives in the shell's systemctl verb, and the artifact it consults is
 * the 0.10.0 change request; break-glass is a driver method the terminal calls.
 * So the honest test is the one that ssh's onto the MSP's own prod as a promoted
 * engineer and types the commands - a live in-hours restart refused and naming
 * the path, an approved change acting in its window, a standard change proceeding
 * silent, and break-glass legitimate on a fire but abuse on a healthy service.
 * The pure classification underneath is tested here too, because the teeth of
 * both gates are one predicate each.
 */

function apiFor(session: WorldSession): GameApi {
  return {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }),
    dispatch: (id, actor, target, params) => session.engine.dispatch(
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
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'workgrumble',
    actor: COMPANY_IDS.player,
  };
}

const MSP_CARRY = { farmFund: 0, attempt: 1, arcWeek: 1, employer: 'msp' } as const;

function earnPromotion(session: WorldSession): void {
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
}

function win(api: GameApi, input: string): CommandResult {
  return executeCommand(parseCommand(input), api);
}

function unix(api: GameApi, session: SshSession, input: string): CommandResult {
  return executeUnix(parseUnixCommand(input), api, session);
}

interface OnMsp {
  readonly world: WorldSession;
  readonly api: GameApi;
  readonly ssh: SshSession;
}

/**
 * The MSP world, promoted, ssh'd onto the MSP's OWN FC-RMM-01, with the clock
 * moved into business hours (10:00). The promotion raises the first incident,
 * which downs fcportal.service - so the box has a real active fire on it, nginx
 * live in front of it, and the clock says people are on the service now.
 */
function onMsp(): OnMsp {
  const world = createWorldSession(MSP_CARRY);
  const api = apiFor(world);
  earnPromotion(world);
  win(api, 'promotion accept');
  const ssh = win(api, 'ssh pat@FC-RMM-01').enterSession ?? null;

  if (ssh === null) {
    throw new Error('ssh did not open a session on FC-RMM-01');
  }

  // Into business hours: the shift opens at tick 60 (09:00); tick 120 is 10:00,
  // squarely a live-service-in-hours minute.
  world.engine.advance(shiftStartTick(1) + 60 - world.engine.now());

  return { world, api, ssh };
}

function unitState(world: WorldSession, unitId: string): unknown {
  return world.engine.graph.getField(unitId, FIELDS.unitState);
}

function playerField(world: WorldSession, field: string): unknown {
  return world.engine.graph.getField(COMPANY_IDS.player, field);
}

describe('change control (E6, 0.18.0)', () => {
  describe('slice 1: a risky change to a live prod service needs a change + window', () => {
    it('refuses an in-hours restart of a LIVE prod service and names the path', () => {
      const { world, api, ssh } = onMsp();

      // nginx is up (live), FC-RMM-01 is in-house prod, and it is 10:00.
      expect(unitState(world, MSP_IDS.mspInfraNginxUnit))
        .toBe(SYSTEMD_STATES.activeRunning);

      const out = unix(api, ssh, 'systemctl restart nginx');
      const text = out.lines.join('\n');

      // Refused with the true reason and the change path named - not silent.
      expect(out.lines.length).toBeGreaterThan(0);
      expect(text).toContain('NORMAL change');
      expect(text).toContain('business hours');
      expect(text).toContain('changereq file nginx restart');
      // The world did NOT bounce it: a refused change changes nothing.
      expect(unitState(world, MSP_IDS.mspInfraNginxUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
    });

    it('lets the restart through IN the window of an approved change', () => {
      const { world, api, ssh } = onMsp();

      // Raise the change: an in-house prod normal change is filed approved with a
      // window, reusing the 0.10.0 machinery whole.
      const filed = unix(api, ssh, 'changereq file nginx restart').lines.join('\n');
      expect(filed).toContain('Change request filed');

      const cr = world.engine.graph
        .nodesOfKind('change_request')
        .find((node) => node.fields[FIELDS.crTarget] === MSP_IDS.mspInfraNginxUnit);
      expect(cr).toBeDefined();
      const open = cr?.fields[FIELDS.crWindowOpen];
      expect(typeof open).toBe('number');

      // Before the window opens, the same restart still refuses.
      const early = unix(api, ssh, 'systemctl restart nginx');
      expect(early.lines.length).toBeGreaterThan(0);

      // Move into the window; now the restart is ALLOWED - and silent on success,
      // the way systemd is.
      world.engine.advance((open as number) - world.engine.now());
      expect(isBusinessHours(world.engine.now())).toBe(true);

      const inWindow = unix(api, ssh, 'systemctl restart nginx');
      expect(inWindow.lines).toEqual([]);
      expect(unitState(world, MSP_IDS.mspInfraNginxUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
    });
  });

  describe('slice 2: standard vs normal', () => {
    it('a routine (non-critical) restart is a STANDARD change and proceeds silent', () => {
      const { world, api, ssh } = onMsp();

      // cron is not a customer-facing service, so restarting it in hours is a
      // standard change - it proceeds, silent, no request needed.
      expect(unitState(world, MSP_IDS.mspInfraCronUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
      const out = unix(api, ssh, 'systemctl restart cron');
      expect(out.lines).toEqual([]);
    });

    it('classifies the change by verb and criticality, deterministically', () => {
      const { world } = onMsp();
      const graph = world.engine.graph;

      // A risky verb on a live customer-facing prod unit is NORMAL...
      expect(changeClass(graph, MSP_IDS.mspInfraNginxUnit, SYSTEMD_ACTIONS.unitStop))
        .toBe('normal');
      expect(isRiskyProductionChange(
        graph,
        MSP_IDS.mspInfraNginxUnit,
        SYSTEMD_ACTIONS.unitRestart,
      )).toBe(true);
      // ...a start is not risky, so it is standard even on nginx...
      expect(changeClass(graph, MSP_IDS.mspInfraNginxUnit, SYSTEMD_ACTIONS.unitStart))
        .toBe('standard');
      // ...and a non-critical unit is standard whatever the verb.
      expect(changeClass(graph, MSP_IDS.mspInfraCronUnit, SYSTEMD_ACTIONS.unitRestart))
        .toBe('standard');
    });
  });

  describe('slice 3: break-glass, the emergency override', () => {
    it('breaks the glass on a real fire (a DOWN unit), acts, and audits loudly', () => {
      const { world, api, ssh } = onMsp();

      // fcportal is failed at seed (the promotion's first incident): a real fire.
      expect(unitState(world, MSP_IDS.mspInfraPortalUnit))
        .toBe(SYSTEMD_STATES.failed);
      expect(hasActiveIncident(world.engine.graph, MSP_IDS.mspInfraServer)).toBe(true);

      const out = unix(api, ssh, 'breakglass fcportal');
      const text = out.lines.join('\n');

      expect(text).toContain('BREAK-GLASS');
      expect(text).toContain('logged');
      // It acted: the unit is back up.
      expect(unitState(world, MSP_IDS.mspInfraPortalUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
      // And it wrote the append-only audit record for the review after.
      const audit = playerField(world, FIELDS.breakGlassAudit);
      expect(typeof audit).toBe('string');
      expect(audit as string).toContain(MSP_IDS.mspInfraPortalUnit);
    });

    it('refuses on a healthy service (no active incident) and reads as abuse', () => {
      const { world, api, ssh } = onMsp();

      // Put the fire out first, so the box has NO active incident.
      world.engine.applySetup([{
        op: 'setField',
        id: MSP_IDS.mspInfraPortalUnit,
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.activeRunning,
      }]);
      expect(hasActiveIncident(world.engine.graph, MSP_IDS.mspInfraServer)).toBe(false);

      const before = playerField(world, FIELDS.suspicion);
      const suspicionBefore = typeof before === 'number' ? before : 0;

      const out = unix(api, ssh, 'breakglass nginx');
      const text = out.lines.join('\n');

      expect(text).toContain('REFUSED');
      expect(text).toContain('no active incident');
      // It did NOT act: nginx is untouched.
      expect(unitState(world, MSP_IDS.mspInfraNginxUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
      // The abuse is recorded on its own trail and it cost suspicion - the way a
      // morning on Do Not Disturb reads at the review.
      const abuse = playerField(world, FIELDS.breakGlassAbuse);
      expect(typeof abuse).toBe('string');
      expect(abuse as string).toContain(MSP_IDS.mspInfraNginxUnit);
      const after = playerField(world, FIELDS.suspicion);
      expect(typeof after).toBe('number');
      expect(after as number).toBeGreaterThan(suspicionBefore);
    });
  });

  describe('the on-call fire is NOT blocked by change control', () => {
    it('restarts a DOWN unit in business hours, ungated (the 0.17.0 fix flows)', () => {
      const { world, api, ssh } = onMsp();

      // fcportal is failed and it is business hours - a service-desk-shaped read
      // of the gate would block this, but a DOWN unit is the fire, not a change.
      expect(unitState(world, MSP_IDS.mspInfraPortalUnit))
        .toBe(SYSTEMD_STATES.failed);
      expect(isBusinessHours(world.engine.now())).toBe(true);

      const out = unix(api, ssh, 'systemctl restart fcportal');
      // Allowed AND silent on success - the fix, unblocked.
      expect(out.lines).toEqual([]);
      expect(unitState(world, MSP_IDS.mspInfraPortalUnit))
        .toBe(SYSTEMD_STATES.activeRunning);
    });
  });

  describe('the teeth', () => {
    it('the window gate FAILS CLOSED: without authorisation a live in-hours change refuses', () => {
      const { world } = onMsp();
      const graph = world.engine.graph;
      const now = world.engine.now();

      // The exact bug a revert would introduce: an approved-and-in-window request
      // (authorised true) is the ONLY thing that lets it through. Flip that off
      // and the same live, in-hours, risky change refuses.
      const authorised = changeControlGate({
        graph,
        now,
        unitId: MSP_IDS.mspInfraNginxUnit,
        verb: SYSTEMD_ACTIONS.unitRestart,
        authorised: true,
      });
      expect(authorised.allowed).toBe(true);

      const unauthorised = changeControlGate({
        graph,
        now,
        unitId: MSP_IDS.mspInfraNginxUnit,
        verb: SYSTEMD_ACTIONS.unitRestart,
        authorised: false,
      });
      expect(unauthorised.allowed).toBe(false);
    });

    it('break-glass REQUIRES a real active incident (revert would authorise anything)', () => {
      const { world } = onMsp();
      const graph = world.engine.graph;

      // With a failed unit on the box, there is an incident - break-glass legit.
      expect(hasActiveIncident(graph, MSP_IDS.mspInfraServer)).toBe(true);

      // Put every unit back up: no failed unit, no incident, so break-glass on
      // this box is abuse. hasActiveIncident is the fail-closed predicate; a
      // revert that returned true unconditionally would authorise anything.
      world.engine.applySetup([{
        op: 'setField',
        id: MSP_IDS.mspInfraPortalUnit,
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.activeRunning,
      }]);
      expect(hasActiveIncident(graph, MSP_IDS.mspInfraServer)).toBe(false);
    });
  });

  describe('additive: byte-identical until the promotion, off-hours ungated', () => {
    it('a service-desk player cannot ssh, so nothing here is reachable', () => {
      const world = createWorldSession(MSP_CARRY);
      const api = apiFor(world);
      // No promotion earned/accepted: ssh refuses at the tier gate.
      const out = win(api, 'ssh pat@FC-RMM-01');
      expect(out.enterSession).toBeUndefined();
      expect(out.lines.join('\n')).toContain('not service-desk access');
    });

    it('the same risky change OUT of hours is not gated (the window\'s own stretch)', () => {
      const { world } = onMsp();
      const graph = world.engine.graph;

      // At 08:00 (the morning brief, before the shift) it is out of hours - the
      // stretch a maintenance window lives in - so the gate does not fire.
      const gate = changeControlGate({
        graph,
        now: 0,
        unitId: MSP_IDS.mspInfraNginxUnit,
        verb: SYSTEMD_ACTIONS.unitRestart,
        authorised: false,
      });
      expect(isBusinessHours(0)).toBe(false);
      expect(gate.allowed).toBe(true);
    });
  });
});
