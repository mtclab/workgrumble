import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../../world/company';
import { AppStateStore } from '../app-state';
import { createWorldSession, type WorldSession } from '../../world/session';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { GameApi } from './types';

function apiFor(
  session: WorldSession,
  actor: string = COMPANY_IDS.player,
): GameApi {
  return {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    dispatch: (id, dispatchActor, target, params) => session.engine.dispatch(
      id,
      dispatchActor,
      target,
      params,
    ),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    openApp: () => {},
    hasApp: () => false,
    actor,
  };
}

function run(api: GameApi, input: string): string {
  return executeCommand(parseCommand(input), api).lines.join('\n');
}

describe('support terminal commands', () => {
  it('documents every command it accepts', () => {
    const api = apiFor(createWorldSession());
    const output = run(api, 'help');

    for (const command of ['ping', 'unlock', 'rotate', 'clearqueue', 'ver']) {
      expect(output).toContain(command);
    }
  });

  it('answers an unknown command with a suggestion, not a shrug', () => {
    const api = apiFor(createWorldSession());

    expect(run(api, 'unlok gpoole')).toContain('Did you mean "unlock"?');
    expect(run(api, 'unlock')).toContain('Usage: unlock <account>');
  });

  it('pings a reachable host and routes through the print server', () => {
    const api = apiFor(createWorldSession());
    const output = run(api, 'ping SALES-02');

    expect(output).toContain('via PRINT-01');
    expect(output).toContain('Reply from SALES-02');
    expect(run(api, 'ping SALES-99')).toContain('Unknown host "SALES-99"');
  });

  /**
   * A reply proves the box answered at the network layer and nothing else.
   * The print server answers happily with its spooler wedged and 47 jobs
   * stuck behind it, so a terminal that says "the machine is fine" teaches
   * the player to stop looking exactly where the fault is.
   */
  it('never calls a host healthy on the strength of a ping', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(session.engine.graph.getField(COMPANY_IDS.spooler, 'status'))
      .toBe('wedged');

    const output = run(api, 'ping PRINT-01');
    expect(output).toContain('Reply from PRINT-01');
    expect(output).toContain('It is alive.');
    expect(output).not.toContain('fine');
    expect(output).not.toContain('healthy');
    expect(output).not.toContain('OK');
  });

  it('times out when the caller has no workstation of their own', () => {
    const api = apiFor(createWorldSession(), COMPANY_IDS.nina);

    expect(run(api, 'ping SALES-02')).toContain('Request timed out.');
  });

  it('reads an account back with its real state', () => {
    const api = apiFor(createWorldSession());
    const output = run(api, 'users gpoole');

    expect(output).toContain('Gary Poole');
    expect(output).toContain('LOCKED OUT');
    expect(output).toContain('Print Users');
  });

  it('closes the locked-account ticket through unlock', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(session.engine.ticketState('ticket:locked-account')).toBe('open');
    expect(run(api, 'unlock gpoole')).toContain('unlocked');
    expect(session.engine.ticketState('ticket:locked-account')).toBe('resolved');

    // A second attempt explains itself instead of pretending to work.
    expect(run(api, 'unlock gpoole')).toContain('is not locked');
  });

  it('closes the rotated-screen ticket through rotate', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(run(api, 'rotate SALES-02 45')).toContain('not an angle');
    expect(session.engine.ticketState('ticket:rotated-screen')).toBe('open');

    expect(run(api, 'rotate SALES-02 0')).toContain('set to 0 degrees');
    expect(session.engine.ticketState('ticket:rotated-screen')).toBe('resolved');
  });

  it('needs both halves of the spooler fix, in the right order', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(run(api, 'services PRINT-01')).toContain('WEDGED');
    expect(run(api, 'queue hercules')).toContain('47 job(s) queued');

    // The wrong order is refused, not quietly accepted and half-useful.
    expect(run(api, 'restart spooler'))
      .toContain('It will just choke on the same job again.');
    expect(session.engine.graph.getField(COMPANY_IDS.spooler, 'status'))
      .toBe('wedged');

    // And clearing alone is not a fix either: the service is still wedged.
    expect(run(api, 'clearqueue hercules')).toContain('47 job(s) dropped');
    expect(session.engine.ticketState('ticket:wedged-spooler')).toBe('open');

    expect(run(api, 'restart spooler')).toContain('RUNNING');
    expect(session.engine.ticketState('ticket:wedged-spooler')).toBe('resolved');
  });

  /**
   * The terminal is the second skin over the same verbs, so the hardware
   * truth has to survive the trip through it: `restart fan` was a third,
   * unadvertised way to close the fan ticket and a lie about a fan.
   */
  it('refuses to restart the chassis fan and leaves its ticket open', () => {
    const session = createWorldSession();
    const api = apiFor(session);
    const before = session.engine.snapshotHash();

    expect(run(api, 'services BEIGE-BOX')).toContain('[hardware, not restartable]');
    expect(run(api, 'restart fan')).toContain('It will not help.');
    expect(session.engine.snapshotHash()).toBe(before);
    expect(session.engine.ticketState('ticket:fan-noise')).toBe('open');
  });

  it('passes engine refusals straight through to the player', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(run(api, 'restart vpn')).toContain('is already running');
    expect(run(api, 'clearqueue monitor')).toContain('No printer matches');
    expect(run(api, 'users nobody')).toContain('No account matches');
  });

  it('issues a temporary password and clears the lockout with it', () => {
    const session = createWorldSession();
    const api = apiFor(session);
    session.engine.advance(17);

    expect(run(api, 'resetpw gpoole')).toContain('Temporary password issued');
    expect(session.engine.graph.getField(COMPANY_IDS.garyAccount, 'password_reset_at'))
      .toBe(17);
    expect(run(api, 'users gpoole')).toContain('Password set : 08:17');
  });

  it('clears the screen without touching the world', () => {
    const session = createWorldSession();
    const api = apiFor(session);
    const before = session.engine.snapshotHash();
    const result = executeCommand(parseCommand('cls'), api);

    expect(result).toEqual({ lines: [], clear: true });
    expect(session.engine.snapshotHash()).toBe(before);
  });

  it('prints a version nobody should feel reassured by', () => {
    const api = apiFor(createWorldSession());

    expect(run(api, 'ver')).toContain('4.10.1998');
  });
});
