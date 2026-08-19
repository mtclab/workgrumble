/**
 * The MSP customer mechanics, proven through the REAL terminal path (0.8.0).
 *
 * The 0.6.0 lesson - five wiring bugs shipped past 1600 green unit tests that
 * built state directly - means these drive the ACTUAL dispatch a player hits:
 * `executeCommand(parseCommand(...))` against a real MSP world, with the
 * customer context set the way opening a ticket sets it. Every assertion has
 * TEETH: revert the guard or the scope refusal and the terminal dispatches the
 * action, prints the success line, and these go red.
 */

import { describe, expect, it } from 'vitest';

import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { FIELDS, SERVICE_STATUS } from '../../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { baselineServiceId } from '../../world/services';
import { spawnWorldTicket } from '../../world/tickets';
import { planCoordination } from '../../world/coordination';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import { remediationRefusal } from './remediation';
import type { GameApi } from './types';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

function mspSession(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession(MSP_CARRY);

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
}

function apiFor(session: WorldSession, appState: AppStateStore): GameApi {
  return {
    graph: session.engine.graph,
    appState,
    day: new DayDriver(session.engine, MSP_IDS.player, WORLD_SEED, {
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
}

function run(api: GameApi, input: string): string {
  return executeCommand(parseCommand(input), api).lines.join('\n');
}

describe('MSP scope-of-touch, through the real terminal', () => {
  it('lets a helpdesk tech do the desk\'s own job at a customer', () => {
    // In-scope work at a customer proceeds exactly as it does in-house: the
    // Meridian MFA-lockout ticket locks an identity account, and unlocking it -
    // a user, squarely helpdesk - resolves it. This is the control the refusals
    // below are refusals AGAINST.
    const session = mspSession('ticket:meridian-mfa-lockout');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.meridian);
    const api = apiFor(session, appState);

    const output = run(api, 'unlock nprice');

    expect(output).toContain('nprice unlocked');
    expect(session.engine.graph.getField(MSP_IDS.meridianAnalystAccount, 'locked'))
      .toBe(false);
  });

  it('refuses a helpdesk tech reaching for a customer SERVER', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'restart FONT-FILE-01\\Dfs');

    expect(output).toContain('Servers are not in this contract');
    // Teeth: the service was NOT bounced. If the guard were reverted this would
    // dispatch and print the restart success line.
    expect(output).not.toContain('service reports RUNNING');
  });

  it('refuses a fix on a monitoring-only account and says escalate', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    const output = run(api, 'restart NW-SRV-01\\NWBackup');

    expect(output).toContain('monitoring-only');
    expect(output).toContain('notify-and-escalate');
    expect(output).not.toContain('service reports RUNNING');
  });

  it('refuses a SaaS Linux prod box on OS AND scope both', () => {
    // The compose-with-0.7.0 case: MERI-APP-01 is a Linux PROD server at a
    // helpdesk customer, so it is out of reach on BOTH counts, and both truths
    // are on screen.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.meridian);
    const api = apiFor(session, appState);

    const output = run(api, 'restart MERI-APP-01\\nginx');

    // Scope: servers not in the helpdesk contract.
    expect(output).toContain('Servers are not in this contract');
    // OS: a Windows stop control does not reach a systemd unit.
    expect(output).toContain('systemd');
    expect(output).not.toContain('service reports RUNNING');
  });
});

describe('the wrong-customer guard, through the real terminal', () => {
  it('STOPs an action aimed at a machine of a DIFFERENT customer', () => {
    // Fontaine is on screen, but the command aims at a Meridian box. The guard
    // names BOTH and refuses to send.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'restart MERI-WS-01\\Spooler');

    expect(output).toContain('STOP.');
    expect(output).toContain('FONTAINE-LAW');
    expect(output).toContain('MERIDIAN-SAAS');
    // Teeth: nothing was bounced. Revert the guard and this dispatches.
    expect(output).not.toContain('service reports RUNNING');
  });

  it('does NOT fire when the target is the customer already in context', () => {
    // Same customer, a workstation, in scope: the guard stands down and the
    // in-scope action proceeds - proof the guard bites the mismatch and only the
    // mismatch, not every MSP action.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.meridian);
    const api = apiFor(session, appState);

    const output = run(api, 'restart MERI-WS-01\\Spooler');

    // No STOP and no scope refusal: the guard stood down. The action REACHED the
    // engine, which then gives its own (customer-agnostic) answer about bouncing
    // a healthy service - proof the terminal sent it rather than refusing it.
    expect(output).not.toContain('STOP.');
    expect(output).not.toContain('is not in this contract');
    expect(output).toContain('already running');
  });

  it('does NOT fire on an in-house box with no customer', () => {
    // The MSP's own desk carries no customer, so aiming at it while a customer
    // is in context is not a wrong-tenant action - it belongs to no client.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    // FC-DESK-07 is the player's own managed desk. Its spooler is bounceable and
    // no guard should stop it.
    const output = run(api, 'restart FC-DESK-07\\Spooler');

    expect(output).not.toContain('STOP.');
    expect(output).not.toContain('is not in this contract');
  });
});

/**
 * The two compose/monitoring cases proven on REAL ticket content, end to end:
 * the Linux prod draw is refused (not silently unsolvable) and its ticket closes
 * only by escalating, and a monitoring-only alert refuses the fix and closes only
 * by escalating. These are the 0.6.0 lesson applied to Pass B content - the
 * ticket a player actually gets, driven through the real terminal and the real
 * engine.
 */
/**
 * The hole Pass A/B left: an account-targeted verb (unlock, resetpw, ...)
 * resolves to no MACHINE, so it used to skip the scope + tenant pre-flight
 * entirely - a monitoring-only customer's user could be reset in silent breach
 * of the contract. These drive the REAL terminal at a monitoring-only customer
 * and prove the account path now runs the SAME guard the machine path does.
 * Every assertion has teeth: revert the account customer field or the preflight
 * account branch and the action dispatches, prints its success line, and these
 * go red.
 */
describe('account-targeted actions run the same scope + tenant pre-flight', () => {
  it('refuses a resetpw on a monitoring-only account and says escalate', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    // Ivy is Northwind's contact - a monitoring-only customer. Resetting her
    // password is a REMEDIATION the contract forbids; absent the guard the
    // account is enabled, so the reset would dispatch and succeed.
    const output = run(api, 'resetpw iokafor');

    expect(output).toContain('monitoring-only');
    expect(output).toContain('notify-and-escalate');
    // Teeth: the reset did NOT happen. Revert the fix and this prints and sets.
    expect(output).not.toContain('Temporary password issued');
    expect(
      session.engine.graph.getField(MSP_IDS.northwindContactAccount, FIELDS.pwMustChange),
    ).toBe(false);
    expect(
      session.engine.graph.getField(
        MSP_IDS.northwindContactAccount,
        FIELDS.passwordResetAt,
      ),
    ).toBeUndefined();
  });

  it('refuses an unlock on a monitoring-only account (which would otherwise work)', () => {
    const session = mspSession();
    // Lock Ivy's account, so an unlock WOULD succeed if the guard were reverted -
    // the teeth are that it does not, on the monitoring-only contract.
    session.engine.applySetup([
      {
        op: 'setField',
        id: MSP_IDS.northwindContactAccount,
        field: FIELDS.locked,
        value: true,
      },
    ]);
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    const output = run(api, 'unlock iokafor');

    expect(output).toContain('monitoring-only');
    expect(output).toContain('notify-and-escalate');
    // Teeth: still locked. Revert the fix and the unlock dispatches and clears it.
    expect(output).not.toContain('unlocked');
    expect(
      session.engine.graph.getField(MSP_IDS.northwindContactAccount, FIELDS.locked),
    ).toBe(true);
  });

  it('lets a helpdesk-customer account action through (the control)', () => {
    // The in-scope control: a helpdesk customer's user is squarely helpdesk
    // work, so a resetpw on them proceeds and issues the temporary password.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.meridian);
    const api = apiFor(session, appState);

    const output = run(api, 'resetpw dchen');

    expect(output).toContain('Temporary password issued');
    expect(
      session.engine.graph.getField(MSP_IDS.meridianDevAccount, FIELDS.pwMustChange),
    ).toBe(true);
  });

  it('STOPs an account action aimed at a DIFFERENT customer', () => {
    // Fontaine is on screen; the account belongs to Meridian. The wrong-customer
    // guard fires on the account exactly as it does on a box, and names both.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'resetpw dchen');

    expect(output).toContain('STOP.');
    expect(output).toContain('FONTAINE-LAW');
    expect(output).toContain('MERIDIAN-SAAS');
    // Teeth: nothing was reset. Revert the fix and this dispatches.
    expect(output).not.toContain('Temporary password issued');
    expect(
      session.engine.graph.getField(MSP_IDS.meridianDevAccount, FIELDS.passwordResetAt),
    ).toBeUndefined();
  });
});

describe('the Linux prod draw closes by escalation, never by touching prod', () => {
  it('refuses the tempting prod fix, then resolves on a clean escalation', () => {
    const session = mspSession('ticket:meridian-prod-down');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.meridian);
    const api = apiFor(session, appState);

    // The draw: the ticket points at MERI-APP-01 and the instinct is to bounce
    // it. The terminal refuses on BOTH counts and the ticket stays open - it is
    // not silently unsolvable, it is refused with the true reasons.
    const refused = run(api, 'restart MERI-APP-01\\nginx');
    expect(refused).toContain('Servers are not in this contract');
    expect(refused).toContain('systemd');
    expect(refused).not.toContain('service reports RUNNING');
    expect(session.engine.ticketState('ticket:meridian-prod-down')).toBe('open');

    // The honest ending: escalate to the team that owns the box. That - and only
    // that - closes it. Teeth: make escalation stop closing it and this goes red.
    const escalate = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:meridian-prod-down',
      {
        reported: 'Product returning 502s; customer-visible outage.',
        tried: 'Confirmed MERI-APP-01 is the Linux prod app server\n'
          + 'Checked scope: out of reach on OS and contract both',
      },
    );
    expect(escalate.ok).toBe(true);
    expect(session.engine.ticketState('ticket:meridian-prod-down'))
      .toBe('resolved');
  });
});

/**
 * The dental clinic's imaging bridge (0.14.0), proven through the real terminal:
 * an integration a PMS update broke closes by ESCALATION, never by a restart -
 * even though the clinic is fully-managed and the server IS reachable.
 *
 * ELMWOOD-DENTAL is fully-managed, so scope does not wall the server off - which
 * is exactly why this needs proving: the honest close is a vendor escalation, and
 * the tempting restart is refused because the bridge is RUNNING (the fault is the
 * integration, not a downed service). Teeth: make escalation stop closing it, or
 * make a healthy-service restart close it, and this goes red.
 */
describe('the imaging bridge closes by vendor escalation, not by a restart', () => {
  it('refuses the tempting restart of a running bridge, then closes on escalation', () => {
    const session = mspSession('ticket:elmwood-imaging-bridge');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.elmwood);
    const api = apiFor(session, appState);

    // The instinct is to bounce the bridge. Fully-managed reaches the server, so
    // this is NOT a scope refusal - it is refused because the bridge is running:
    // the fault is a version mismatch the update caused, not a downed service.
    const refused = run(api, 'restart ELM-SRV-01\\DTXImagingBridge');
    expect(refused).toContain('already running');
    expect(refused).not.toContain('service reports RUNNING');
    expect(session.engine.ticketState('ticket:elmwood-imaging-bridge'))
      .toBe('open');

    // The honest ending: escalate to the imaging vendor with the update details.
    // That - and only that - closes it. Teeth: stop escalation closing it, red.
    const escalate = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:elmwood-imaging-bridge',
      {
        reported: 'DEXIS captures do not write to the Dentrix chart since the '
          + 'weekend PMS update; images lost.',
        tried: 'Confirmed the imaging bridge on ELM-SRV-01 is RUNNING\n'
          + 'A restart reloads the same version-mismatched integration - it is a '
          + 'vendor reconcile, not a desk fix',
      },
    );
    expect(escalate.ok).toBe(true);
    expect(session.engine.ticketState('ticket:elmwood-imaging-bridge'))
      .toBe('resolved');
  });
});

/**
 * The creative agency's expired seat (0.32.0), proven through the real terminal:
 * the licensing verbs a player actually types, refusing for the true reason.
 *
 * MARLOWE-STUDIO is fully-managed, so nothing here is a scope wall - the desk
 * administers their licensing exactly as it administers everything else, which
 * is what makes the refusal informative rather than bureaucratic. What refuses
 * is arithmetic the shop cannot argue with: the plan has no free seat. Teeth:
 * put a seat back in the pool (or leave the freelancer holding one) and the
 * first assertion goes green while the ticket closes on the wrong thing.
 */
describe('the studio\'s Named User seat is bought, not conjured', () => {
  it('refuses "licence give" while the plan is full, then closes on the raise', () => {
    const session = mspSession('ticket:marlowe-seat-expired');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.marlowe);
    const api = apiFor(session, appState);

    // The instinct, typed: hand the freelancer a seat. The pool is fully
    // subscribed, so the shipped guard refuses it with the reason - and the
    // ticket does not move, because nothing about the estate has.
    const refused = run(api, 'licence give lvasquez');
    expect(refused).toContain('no free seats');
    expect(refused).not.toContain('Seat assigned');
    expect(session.engine.ticketState('ticket:marlowe-seat-expired'))
      .toBe('open');

    // And the machine-shaped instinct is refused too, by the estate rather than
    // by a rule: the Macs are Macs, so the Windows service tools do not reach
    // them, and there was never a licence on the box to repair anyway.
    const wrongFamily = run(api, 'restart MARL-WS-03\\Spooler');
    expect(wrongFamily).toMatch(/Mac|Screen Sharing/u);

    // The honest ending: raise it with the licensing desk, with the account and
    // the date it lapsed. That - and only that - closes it.
    const escalate = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:marlowe-seat-expired',
      {
        reported: 'MARLOWE-STUDIO: Named User seat for lvasquez is not active.',
        tried: 'Sign-out/in and a second Mac, both by the studio\n'
          + 'Seats pool shows 0 free - no seat to assign and none to take back '
          + 'without blocking a working designer',
      },
    );
    expect(escalate.ok).toBe(true);
    expect(session.engine.ticketState('ticket:marlowe-seat-expired'))
      .toBe('resolved');
  });
});

/**
 * The fully-managed tier (0.11.0), proven through the real terminal: the server
 * fix a helpdesk contract WALLS OFF succeeds here, because the MSP owns the whole
 * estate. Teeth: the SAME server fix at a helpdesk customer is refused, so the
 * contrast is real and not an accident of the box.
 */
const HOLLOWAY_DFS = baselineServiceId(MSP_IDS.hollowayFileServer, 'Dfs');
const ARDEN_W3SVC = baselineServiceId(MSP_IDS.ardenServer, 'W3SVC');

describe('the fully-managed tier reaches the server a helpdesk contract walls off', () => {
  it('restarts a wedged server service at a fully-managed customer', () => {
    const session = mspSession('ticket:holloway-shared-drive');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.holloway);
    const api = apiFor(session, appState);

    // The DFS service on their server is wedged (the ticket's fault). At a
    // helpdesk customer this restart is refused as a server touch; on a fully-
    // managed contract it goes through, and the shared-drive ticket resolves.
    const output = run(api, 'restart HOLL-SRV-01\\Dfs');

    expect(output).toContain('service reports RUNNING');
    expect(session.engine.graph.getField(HOLLOWAY_DFS, FIELDS.status))
      .toBe(SERVICE_STATUS.running);
    expect(session.engine.ticketState('ticket:holloway-shared-drive'))
      .toBe('resolved');
  });

  it('refuses the SAME class of server fix at a helpdesk customer (the contrast)', () => {
    // The wall the fully-managed tier is defined against: a server service at
    // FONTAINE-LAW (helpdesk) is out of contract, and the identical verb that
    // just succeeded above is refused here.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'restart FONT-FILE-01\\Dfs');

    expect(output).toContain('Servers are not in this contract');
    expect(output).not.toContain('service reports RUNNING');
  });
});

/**
 * The co-managed tier (0.11.0), proven through the real terminal, and the seam
 * this version is built on: acting on a co-managed customer's estate is
 * coordinate-then-act. A unilateral action is CAUGHT; a `notify` to their own IT
 * clears it; and the gate FAILS CLOSED - the teeth are that the unilateral
 * attempt changes nothing, so reverting the coordinate check (dropping the
 * `isCoordinated` clause and allowing co-managed unconditionally) reds this.
 */
describe('co-managed is coordinate-then-act, and the gate fails closed', () => {
  it('catches a unilateral action, then the notify clears it and the fix lands', () => {
    const session = mspSession('ticket:arden-portal-afterhours');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.arden);
    const api = apiFor(session, appState);

    // Unilateral: no coordination notice filed. The portal service on ARDEN-
    // SRV-01 is wedged (the ticket's fault), but a co-managed action without a
    // heads-up to their IT is refused.
    const refused = run(api, 'restart ARDEN-SRV-01\\W3SVC');
    expect(refused).toContain('co-managed');
    expect(refused).toContain('notify them first');
    expect(refused).not.toContain('service reports RUNNING');
    // Teeth (fail-closed): nothing was restarted and the ticket is untouched.
    // Revert the coordinate check - allow co-managed with no notice - and this
    // dispatches, the service restarts, and both assertions red.
    expect(session.engine.graph.getField(ARDEN_W3SVC, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
    expect(session.engine.ticketState('ticket:arden-portal-afterhours'))
      .toBe('open');

    // Coordinate: notify their own IT. This files the notice and clears the
    // action; it dispatches nothing itself (the service is still wedged after).
    const notified = run(api, 'notify ARDEN-SRV-01\\W3SVC');
    expect(notified).toContain('ARDEN-MFG');
    expect(notified.toLowerCase()).toContain('notified');
    expect(session.engine.graph.getField(ARDEN_W3SVC, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);

    // Act: the same restart now goes through, and the portal ticket resolves.
    const done = run(api, 'restart ARDEN-SRV-01\\W3SVC');
    expect(done).toContain('service reports RUNNING');
    expect(session.engine.graph.getField(ARDEN_W3SVC, FIELDS.status))
      .toBe(SERVICE_STATUS.running);
    expect(session.engine.ticketState('ticket:arden-portal-afterhours'))
      .toBe('resolved');
  });

  it('a notice for one box does not clear an action on another', () => {
    // The coordinate gate is per-target: notifying about the portal service does
    // NOT license a unilateral touch of a different co-managed box. Fail-closed
    // means a notice clears exactly what it names and nothing else.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.arden);
    const api = apiFor(session, appState);

    run(api, 'notify ARDEN-SRV-01\\W3SVC');

    // A different service on the same customer, with no notice of its own.
    const output = run(api, 'restart ARDEN-SRV-01\\Spooler');
    expect(output).toContain('co-managed');
    expect(output).not.toContain('service reports RUNNING');
  });

  it('the hand-back ticket resolves the RACI way, and the reset is caught unilateral', () => {
    const session = mspSession('ticket:arden-lockout-handback');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.arden);
    const api = apiFor(session, appState);

    // Reaching to reset the floor supervisor directly is a co-managed action
    // with no coordination - caught. (Day-to-day user support is their team's
    // under the RACI, which is why the honest close is a hand-back, not a reset.)
    const reset = run(api, 'resetpw mvoss');
    expect(reset).toContain('co-managed');
    expect(reset).not.toContain('Temporary password issued');

    // The RACI-correct close: hand it back to their own IT. That - and only
    // that - resolves it, exactly as the prod-down escalation does.
    const escalate = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:arden-lockout-handback',
      {
        reported: 'Floor supervisor locked out; routed to the MSP in error.',
        tried: 'Confirmed it is a routine daytime user reset\n'
          + 'Checked the RACI: day-to-day user support is Arden\'s own helpdesk',
      },
    );
    expect(escalate.ok).toBe(true);
    expect(session.engine.ticketState('ticket:arden-lockout-handback'))
      .toBe('resolved');
  });
});

describe('a monitoring-only alert closes by escalation, never by a fix', () => {
  it('refuses the remediation and resolves on the escalation instead', () => {
    const session = mspSession('ticket:northwind-backup-alert');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    // Reaching to FIX the failed backup is refused by the monitoring-only scope,
    // and the ticket is untouched by the attempt.
    const refused = run(api, 'restart NW-SRV-01\\NWBackup');
    expect(refused).toContain('monitoring-only');
    expect(refused).toContain('notify-and-escalate');
    expect(refused).not.toContain('service reports RUNNING');
    expect(session.engine.graph.getField(MSP_IDS.northwindBackup, 'status'))
      .toBe('wedged');
    expect(session.engine.ticketState('ticket:northwind-backup-alert'))
      .toBe('open');

    // The winnable move on a monitoring-only account is to raise it. Escalation
    // is the resolution rule here, not a fallback.
    const escalate = session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:northwind-backup-alert',
      {
        reported: 'Backup job failed overnight on NW-SRV-01.',
        tried: 'Confirmed the failure on the board\n'
          + 'Checked the contract: monitoring-only, remediation out of scope',
      },
    );
    expect(escalate.ok).toBe(true);
    expect(session.engine.ticketState('ticket:northwind-backup-alert'))
      .toBe('resolved');
  });
});

/**
 * THE SHARE, WHICH THE WALLS COULD NOT SEE (0.38.0).
 *
 * `shareGrantAccess` aims at a `share`, and a share resolved to neither a
 * machine nor an account - so from 0.8.0 to here, the one verb that hands a
 * customer's document workspace to a person ran with no tenant STOP and no
 * contract behind it. It never showed, because the only two customer shares
 * that ship are at customers whose contracts allow the grant; that is the
 * definition of a latent hole, not a defence of one.
 *
 * The three claims, and what turns each red:
 *
 *  1. THE SHIPPED GRANT IS STILL THE SHIPPED GRANT, through the seam rather
 *     than around it. Teeth in the wrong direction: resolve a share to the file
 *     server behind it instead of reading its own customer, and this refuses as
 *     SERVER work and the Fontaine ticket becomes unclosable.
 *  2. THE WRONG TENANT IS THE WRONG TENANT for a permission too.
 *  3. AND THE CONTRACT DECIDES. Teeth: take the `share` branch back out of
 *     `remediationRefusal` and 2 and 3 both print the success line.
 */
describe('a share is somebody\'s, and the walls now know whose', () => {
  it('grants the matter workspace at the helpdesk customer and closes the '
    + 'ticket', () => {
    const session = mspSession('ticket:fontaine-matter-access');
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'grant ekhoury Delacroix');

    // Identity work at a helpdesk customer is squarely in contract, and the
    // ticket's own resolution rule is the edge this made.
    expect(output).toContain('now has Full Access to');
    expect(session.engine.ticketState('ticket:fontaine-matter-access'))
      .toBe('resolved');
  });

  it('STOPs a grant on a share belonging to the customer not on screen', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    // Pennington's ticket is what is open; the Delacroix matter is Fontaine's.
    appState.setCustomerContext(MSP_CUSTOMERS.pennington);
    const api = apiFor(session, appState);

    const output = run(api, 'grant ekhoury Delacroix');

    expect(output).toContain('STOP. PENNINGTON-ACCT is on your screen');
    expect(output).toContain('belongs to FONTAINE-LAW');
    expect(output).not.toContain('now has Full Access to');
    expect(api.dispatchLog().some(
      (entry) => entry.id === HELPDESK_ACTIONS.shareGrantAccess,
    )).toBe(false);
  });

  it('refuses a grant on a MONITORING-ONLY customer\'s share, in the shipped '
    + 'sentence', () => {
    const session = mspSession();
    // No monitoring-only customer ships a share, so the probe moves one rather
    // than inventing content: the same node, the same verb, one field changed
    // to the contract this wall is about. The field is the one a box and an
    // account already carry, so this is the world saying a true thing.
    session.engine.applySetup([{
      op: 'setField',
      id: MSP_IDS.fontaineMatterShare,
      field: FIELDS.machineCustomer,
      value: MSP_CUSTOMERS.northwind,
    }]);

    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    const output = run(api, 'grant ekhoury Delacroix');

    expect(output).toContain(
      'This account is monitoring-only - the contract is notify-and-escalate, '
      + 'not remediate.',
    );
    expect(output).not.toContain('now has Full Access to');
    // And the world did not move: the grant was never sent, so the edge the
    // ticket closes on does not exist.
    expect(api.dispatchLog().some(
      (entry) => entry.id === HELPDESK_ACTIONS.shareGrantAccess,
    )).toBe(false);
  });
});

/* -- the drive, at the seam (0.38.0 verifier round) ----------------------- */

/**
 * The three things the drive arm of the seam got wrong the version it was
 * written in, each of them a wall that was not one.
 *
 *  1. IT FAILED OPEN. A file or directory whose contains chain reaches no
 *     machine resolved to null, and null is the in-house case - so the one
 *     shape the walk cannot read was the one shape with no contract in front
 *     of it. A wall that opens when it cannot see is not a wall.
 *  2. IT NAMED A DOOR THAT IS NOT THERE. The refusal offered
 *     `changereq file <service>`, which resolves a firewall machine or a
 *     service and never a path - and the consult that would have to honour it
 *     matches `service.restart` and never `directory.purge`. A player would
 *     have spent the afternoon looking for the handle.
 *  3. COORDINATION COULD NOT SEE THE BOX AT ALL. `planCoordination` carried a
 *     private copy of the walk from before the drive arm existed, so it said
 *     "in-house, nobody to notify" about a box the seam beside it was
 *     refusing them on.
 *
 * The estate has no drive on a customer's SERVER today - both shipped drive
 * tickets are workstation faults - so these hang the nodes off the file server
 * that does ship, which is the same thing the next drive ticket at a server
 * will do. Nothing here changes what a played world holds.
 */
const CUSTOMER_DIR = 'directory:font-file-01/matters';
const ORPHAN_DIR = 'directory:nowhere/scratch';

function withDrive(session: WorldSession): void {
  session.engine.applySetup([
    {
      op: 'addNode',
      node: {
        id: CUSTOMER_DIR,
        kind: 'directory',
        fields: { [FIELDS.name]: 'MATTERS' },
      },
    },
    {
      op: 'addEdge',
      edge: {
        from: MSP_IDS.fontaineFileServer,
        to: CUSTOMER_DIR,
        kind: 'contains',
      },
    },
    // And the one with nothing holding it: a hand-edited save, a content bug,
    // a node built by a beat that forgot its edge. It is not reachable today
    // and that is exactly why the seam must not be generous about it.
    {
      op: 'addNode',
      node: {
        id: ORPHAN_DIR,
        kind: 'directory',
        fields: { [FIELDS.name]: 'SCRATCH' },
      },
    },
  ]);
}

describe('the drive meets the seam', () => {
  it('walks a directory home to the box it is on, and refuses server work', () => {
    const session = mspSession();
    withDrive(session);
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const refusal = remediationRefusal(
      api,
      CUSTOMER_DIR,
      HELPDESK_ACTIONS.directoryPurge,
    );

    expect(refusal?.wall).toBe('contract');
    expect(refusal?.lines.join(' '))
      .toContain('Servers are not in this contract');
  });

  /**
   * Teeth: put `changereq file <service>` back in `routeLines` for every kind
   * and this reds - the refusal offers a command this shell cannot be made to
   * accept for a path.
   */
  it('names a route that exists for a path, and not the change desk', () => {
    const session = mspSession();
    withDrive(session);
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const said = remediationRefusal(
      api,
      CUSTOMER_DIR,
      HELPDESK_ACTIONS.directoryPurge,
    )?.lines.join(' ') ?? '';

    expect(said).toContain('Escalate it');
    expect(said).not.toContain('changereq file');
  });

  /**
   * Teeth: return `null` from the seam's file/directory arm instead of the
   * unresolved refusal and this reds - `directory.purge` lands on a node
   * nothing can place, with no wall in front of it and no record of whose box
   * it was.
   */
  it('FAILS CLOSED on a drive node nothing can place on a box', () => {
    const session = mspSession();
    withDrive(session);
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const refusal = remediationRefusal(
      api,
      ORPHAN_DIR,
      HELPDESK_ACTIONS.directoryPurge,
    );

    expect(refusal, 'an unplaceable drive node is refused, not waved through')
      .not.toBeNull();
    expect(refusal?.wall).toBe('unresolved');
    expect(refusal?.lines.join(' '))
      .toContain('nothing on this estate says which box that lives on');
  });

  /**
   * Teeth: put `machineBehind` back in `coordination.ts` - the walk without
   * the file/directory arm - and this reds: the plan says there is nobody to
   * notify about a directory sitting on a customer's own file server.
   */
  it('lets coordination see the box a directory is on', () => {
    const session = mspSession();
    withDrive(session);

    const plan = planCoordination(
      session.engine.graph,
      CUSTOMER_DIR,
      session.engine.now(),
    );

    expect(plan.lines.join(' ')).not.toContain('in-house box with no customer');
    // Fontaine are helpdesk, so no notice is filed - but the sentence is now
    // about their CONTRACT rather than about a box the walk could not find.
    expect(plan.lines.join(' ')).toContain('FONTAINE-LAW');
  });
});
