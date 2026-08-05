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
import { FIELDS } from '../../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { spawnWorldTicket } from '../../world/tickets';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
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
