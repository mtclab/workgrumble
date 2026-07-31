import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import { addressOf, GATEWAY, macOf, NAME_SERVER } from './cmd-net';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
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
    day: new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }),
    dispatch: (id, dispatchActor, target, params) => session.engine.dispatch(
      id,
      dispatchActor,
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
    // Nothing in the terminal files a bug report; the seam exists so the one
    // window that does can be handed a function rather than a network.
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    restartWeek: () => {},
    actor,
  };
}

/**
 * A world with the named tickets in it.
 *
 * The week deals its queue across five days, so a terminal test about the
 * spooler has to put the spooler ticket in first - and with it the fault it
 * brings, because the ticket's setup is what wedges the service.
 */
function sessionWith(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession();

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
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
    const session = sessionWith('ticket:wedged-spooler');
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

  /**
   * The lockout trail: what a tech reads BEFORE deciding which of the three
   * fixes this is. The count and the timestamp are the diagnosis, and the last
   * logon is what says the phone in his pocket has been at it for a fortnight.
   */
  it('prints the lockout story, not just the word', () => {
    const session = sessionWith('ticket:locked-account');
    const api = apiFor(session);
    const output = run(api, 'users gpoole');

    expect(output).toContain('Status       : LOCKED OUT');
    expect(output).toContain('Bad passwords: 5');
    expect(output).toContain('Locked since : 08:00');
    expect(output).toContain('Last logon   : not since before this log starts');
    expect(output).toContain('Must change  : no');

    // Somebody who has been in this morning reads completely differently.
    expect(run(api, 'net user awhitlock')).toContain('Status       : OK');
    expect(run(api, 'net user awhitlock')).toContain('Last logon   : 08:00');
  });

  it('closes the locked-account ticket through unlock', () => {
    const session = sessionWith('ticket:locked-account');
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
    const session = sessionWith('ticket:wedged-spooler');
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
    const session = sessionWith('ticket:fan-noise');
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
    const session = sessionWith('ticket:locked-account');
    const api = apiFor(session);
    session.engine.advance(17);

    expect(run(api, 'resetpw gpoole')).toContain('Temporary password issued');
    expect(session.engine.graph.getField(COMPANY_IDS.garyAccount, 'password_reset_at'))
      .toBe(17);
    expect(run(api, 'users gpoole')).toContain('Password set : 08:17');
    // And it leaves behind the flag every real reset leaves, which is the
    // ticket after this one.
    expect(run(api, 'users gpoole')).toContain('Must change  : yes');
    expect(run(api, 'users gpoole')).toContain('Bad passwords: 0');
    expect(run(api, 'users gpoole')).toContain('Locked since : not locked');
  });

  /* -- the looking commands ---------------------------------------------- */

  it('prints this desk\'s address, and more of it on /all', () => {
    const api = apiFor(createWorldSession());
    const plain = run(api, 'ipconfig');

    expect(plain).toContain('IPv4 Address');
    expect(plain).toContain(addressOf(COMPANY_IDS.playerMachine));
    expect(plain).toContain(`Default Gateway . . . . . . . . . : ${GATEWAY}`);
    expect(plain).not.toContain('Physical Address');

    const all = run(api, 'ipconfig /all');
    expect(all).toContain(macOf(COMPANY_IDS.playerMachine));
    expect(all).toContain('DHCP Enabled');
    expect(all).toContain('BEIGE-BOX');

    expect(run(api, 'ipconfig /renew')).toContain('is not a switch');
  });

  /**
   * The gag with a straight face: it prints the sentence every tech has typed
   * a thousand times, and it changes nothing at all. A flushdns that quietly
   * fixed something would teach exactly the wrong lesson.
   */
  it('flushes a DNS cache and changes nothing whatsoever', () => {
    const session = createWorldSession();
    const api = apiFor(session);
    const before = session.engine.snapshotHash();
    const dispatched = session.engine.dispatchLog().length;
    const output = run(api, 'ipconfig /flushdns');

    expect(output).toContain('Successfully flushed the DNS Resolver Cache.');
    expect(session.engine.snapshotHash()).toBe(before);
    // Not one verb reached the world: the command is a sentence, not a fix.
    expect(session.engine.dispatchLog()).toHaveLength(dispatched);
  });

  it('says which account this session is actually running as', () => {
    const api = apiFor(createWorldSession());

    expect(run(api, 'whoami')).toContain('workgrumble\\ppending');
    expect(run(api, 'whoami /groups')).toContain('WORKGRUMBLE\\Print Users');
    expect(run(api, 'whoami /groups')).toContain('WORKGRUMBLE\\VPN Users');
    expect(run(api, 'whoami /elevate')).toContain('is not a switch');

    // Somebody with no account on file gets told so rather than a blank line.
    expect(run(apiFor(createWorldSession(), COMPANY_IDS.printServer), 'whoami'))
      .toContain('no record of');
  });

  it('reads a machine back off the graph, this one by default', () => {
    const session = sessionWith('ticket:wedged-spooler');
    const api = apiFor(session);
    const mine = run(api, 'systeminfo');

    expect(mine).toContain('BEIGE-BOX');
    expect(mine).toContain('1024x768');

    const server = run(api, 'systeminfo PRINT-01');
    expect(server).toContain('PRINT-01');
    // Everything on the box, including the one nobody remembers is on it.
    expect(server).toContain('Print Spooler');
    expect(server).toContain('VPN Concentrator');
    expect(server).toContain('Pending Updates:           Yes');
    expect(run(api, 'systeminfo SALES-99')).toContain('Unknown host');
  });

  /**
   * A reboot is the one thing in this world that sets an uptime, so the two
   * have to agree: the command is only worth typing if it can tell the player
   * whether the machine has actually been restarted since the fault started.
   */
  it('shows a boot time only once something has been rebooted', () => {
    const session = createWorldSession();
    const api = apiFor(session);

    expect(run(api, 'systeminfo SALES-02')).toContain('unrecorded');

    session.engine.advance(42);
    expect(
      api.dispatch(
        HELPDESK_ACTIONS.machineReboot,
        COMPANY_IDS.player,
        COMPANY_IDS.adaMachine,
        {},
      ).ok,
    ).toBe(true);

    expect(run(api, 'systeminfo SALES-02'))
      .toContain('System Boot Time:          08:42');
  });

  it('traces the route through the box everything goes through', () => {
    const api = apiFor(createWorldSession());
    const trace = run(api, 'tracert SALES-02');

    expect(trace).toContain('Tracing route to sales-02.workgrumble.local');
    expect(trace).toContain('print-01.workgrumble.local');
    expect(trace).toContain('Trace complete.');

    // Its own desk is one hop and says so instead of printing an empty list.
    expect(run(api, 'tracert BEIGE-BOX'))
      .toContain('It is this machine.');
    expect(run(api, 'tracert SALES-99')).toContain('Unknown host');
  });

  it('gives up on a route with stars, and blames the wire', () => {
    // Nobody has run a cable to the payroll machine in this fiction: it is
    // wired to the print server like everything else, so the honest way to
    // see a dead trace is from a desk that has no machine at all.
    const api = apiFor(createWorldSession(), COMPANY_IDS.nina);

    expect(run(api, 'tracert PRINT-01')).toContain('no workstation signed out');
  });

  it('resolves a name and refuses to call the box healthy for it', () => {
    const api = apiFor(createWorldSession());
    const found = run(api, 'nslookup PRINT-01');

    expect(found).toContain(`Server:  ${NAME_SERVER}`);
    expect(found).toContain(addressOf(COMPANY_IDS.printServer));
    expect(found).toContain('may still be on fire');

    const missing = run(api, 'nslookup wibble');
    expect(missing).toContain('Non-existent domain');
    expect(missing).toContain('only knows the machines');
  });

  it('answers net user with the same read as users', () => {
    const api = apiFor(createWorldSession());

    expect(run(api, 'net user gpoole')).toBe(run(api, 'users gpoole'));
    expect(run(api, 'net view PRINT-01')).toContain('is not something this '
      + 'terminal does');
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
