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

  /**
   * The finding this slice exists for: `services BEIGE-BOX` listed a chassis
   * fan and nothing else. A real workstation runs dozens, and finding the
   * broken one among them is the job - so the gate is on the LIST being a
   * list, in the columns a services window has.
   */
  describe('the services list', () => {
    it('lists a real workstation, in the columns a services window has', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'services BEIGE-BOX');
      const rows = output.split('\n');

      expect(rows[0]).toContain('Services on BEIGE-BOX (workstation)');
      expect(output).toContain('DISPLAY NAME');
      expect(output).toContain('STARTUP TYPE');
      // Twenty-odd of them, not one.
      expect(rows.length).toBeGreaterThan(20);
      expect(output).toContain('Print Spooler');
      expect(output).toContain('DNS Client');
      expect(output).toContain('Automatic (Delayed Start)');
      expect(output).toContain('Disabled');

      // And the fan is under the table with the reason, not in it: a services
      // list with a lump of spinning plastic in it is teaching the player
      // something false about every other line.
      const [table, hardware] = output.split(
        'Also on this box, reporting a status and not services:',
      );

      expect(table).not.toContain('Chassis fan');
      expect(hardware).toContain('Chassis fan');
      expect(hardware).toContain('[hardware, not restartable]');
    });

    it('gives each kind of box the services that kind of box runs', () => {
      const api = apiFor(createWorldSession());
      const desk = run(api, 'services BEIGE-BOX');
      const print = run(api, 'services PRINT-01');
      const files = run(api, 'services FILES-01');
      const dc = run(api, 'services DC-01');

      expect(print).toContain('(print server)');
      expect(files).toContain('(file server)');
      expect(dc).toContain('(domain controller)');

      expect(print).toContain('TCP/IP Print Server');
      expect(desk).not.toContain('TCP/IP Print Server');
      expect(files).toContain('Distributed File System');
      expect(desk).not.toContain('Distributed File System');
      expect(dc).toContain('Directory Service');
      expect(dc).toContain('Kerberos Key Distribution Center');
      expect(desk).not.toContain('Kerberos Key Distribution Center');

      // The licence pool is on the file server and is not a service on it.
      expect(files).toContain('Accounts Suite licence pool');
      expect(files.split('Also on this box')[0])
        .not.toContain('Accounts Suite licence pool');
    });

    it('says how to name one of them, because the name is not enough', () => {
      const api = apiFor(createWorldSession());

      expect(run(api, 'services BEIGE-BOX'))
        .toContain('"restart BEIGE-BOX\\<name>"');
    });
  });

  describe('sc query', () => {
    it('prints the service manager\'s own block', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'sc query PRINT-01\\spooler');

      expect(output).toContain('SERVICE_NAME: Spooler');
      expect(output).toContain('TYPE               : 10  WIN32_OWN_PROCESS');
      expect(output).toContain('STATE              : 4  RUNNING');
      expect(output).toContain('(STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)');
      expect(output).toContain('WIN32_EXIT_CODE    : 0  (0x0)');
    });

    it('reads a stopped one as stopped, with the controls it will take', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'sc query BEIGE-BOX\\RemoteRegistry');

      expect(output).toContain('STATE              : 1  STOPPED');
      expect(output).toContain('IGNORES_SHUTDOWN');
    });

    /** A fan has no service record, because it is not software. */
    it('refuses the thing the manager has never heard of', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'sc query chassis fan');

      expect(output).toContain('has never heard of');
      expect(output).not.toContain('SERVICE_NAME');
    });

    it('refuses the sub-commands this terminal does not have', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'sc stop spooler');

      expect(output).toContain('"sc stop" is not something this terminal does');
      expect(output).toContain('restart <service>');
    });
  });

  describe('tasklist', () => {
    it('lists the windows that are open, and drops them when they close', () => {
      const api = apiFor(createWorldSession());

      expect(run(api, 'tasklist')).toContain('System Idle Process');
      expect(run(api, 'tasklist')).not.toContain('NAVIGATE.EXE');

      api.appState.patch('windows', {
        open: [
          { appId: 'browser', minimized: false },
          { appId: 'bubbles', minimized: true },
        ],
        focusedId: 'browser',
      });

      const open = run(api, 'tasklist');

      expect(open).toContain('Image Name');
      expect(open).toContain('NAVIGATE.EXE');
      // Minimised is still running, which is the whole truth about the panic
      // key and the reason this list is worth reading before somebody else
      // reads it back to you.
      expect(open).toContain('BUBBLES.EXE');
      expect(open).toContain('A minimised window is a running program.');
    });

    it('refuses to ask another box, for the estate\'s own reason', () => {
      const api = apiFor(createWorldSession());
      const output = run(api, 'tasklist /s PRINT-01');

      expect(output).toContain('Remote Registry is Disabled');
      expect(run(api, 'tasklist /v')).toContain('is not a switch this tasklist has');
    });
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

    // The queue is a LIST now, in the columns a queue has: a job number, a
    // size and the minute it landed. The four identical sizes are the same
    // delivery note sent four times, which is the diagnosis and is invisible
    // in a count.
    const queue = run(api, 'queue hercules');

    expect(queue).toContain('Print queue on Hercules 400');
    expect(queue).toContain('     1         12,288  07/09/1998  07:58');
    expect(queue).toContain('47 job(s) queued, 1,393,664 bytes.');
    expect(queue.split('\n').filter((line) => line.includes('40,960')))
      .toHaveLength(4);
    // The same pile the spool directory lists, numbered the same way, so the
    // two windows cannot disagree about which job is which.
    expect(queue.split('\n').filter(
      (line) => /^ +\d+ +[\d,]+ {2}\d{2}\/\d{2}\/\d{4}/u.test(line),
    )).toHaveLength(47);
    expect(run(api, 'dir \\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS'))
      .toContain('00047.SPL');

    // The wrong order is refused, not quietly accepted and half-useful.
    expect(run(api, 'restart PRINT-01\\spooler'))
      .toContain('It will just choke on the same job again.');
    expect(session.engine.graph.getField(COMPANY_IDS.spooler, 'status'))
      .toBe('wedged');

    // And clearing alone is not a fix either: the service is still wedged.
    expect(run(api, 'clearqueue hercules')).toContain('47 job(s) dropped');
    expect(session.engine.ticketState('ticket:wedged-spooler')).toBe('open');

    expect(run(api, 'restart PRINT-01\\spooler')).toContain('RUNNING');
    expect(session.engine.ticketState('ticket:wedged-spooler')).toBe('resolved');
  });

  /**
   * Every box in this building runs a spooler, because every box does. So the
   * bare name is not an answer to WHICH, and the refusal has to hand back
   * something the player can type rather than telling them to be specific and
   * leaving them to guess how.
   */
  it('refuses a service name a dozen machines answer to, and says how to ask', () => {
    const session = sessionWith('ticket:wedged-spooler');
    const api = apiFor(session);
    const refusal = run(api, 'restart spooler');

    expect(refusal).toContain('matches 14 of them');
    expect(refusal).toContain('ACCTS-01, ACCTS-03, BEIGE-BOX');
    expect(refusal).toContain('the way sc makes you');
    // And the qualified form works, on the box that was named.
    expect(run(api, 'sc query PRINT-01\\spooler')).toContain('SERVICE_NAME: Spooler');
    // A name that box has never run is refused by the box rather than by the
    // estate, which is the difference between "where" and "what".
    expect(run(api, 'restart PRINT-01\\backup agent'))
      .toContain('Nothing called "backup agent" is registered on PRINT-01');
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
    // What is in the case, which is what the real one prints - and a COUNT of
    // the services with the list's name beside it, because twenty-three
    // service names on one line is not a readout of anything.
    expect(server).toContain('Processor(s):              Pentagon 200 MHz');
    expect(server).toContain('Total Physical Memory:     128 MB');
    expect(server).toMatch(/Registered Services: {7}\d+ \("services PRINT-01"/u);
    expect(server).toContain('Pending Updates:           Yes');
    // Attached hardware is hardware. The printer is plugged into that box;
    // the thirteen machines that PRINT through it are clients on the other
    // end of a wire, and a heading that called them hardware was a heading
    // that lied about every line under it.
    expect(server).toContain('Attached Hardware:         Hercules 400');
    expect(server).not.toContain('SALES-02');
    expect(server).not.toContain('BEIGE-BOX');
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

  /**
   * The drive, through the terminal rather than through the shapes.
   *
   * What each of the four commands PRINTS is held to its fidelity row in
   * `cmd-files.test.ts`. What is asserted here is the wiring: the terminal
   * starts in the support directory, the commands read the drive of the box
   * this session is actually on, and `cd` is the one command in the whole
   * grammar that hands something back to the window that ran it.
   */
  it('reads the drive of the box this terminal is on, and moves around it', () => {
    const session = sessionWith('ticket:wedged-spooler');
    const api = apiFor(session);
    const before = session.engine.snapshotHash();

    expect(run(api, 'dir')).toContain('Directory of C:\\SUPPORT');
    expect(run(api, 'cd')).toBe('C:\\SUPPORT');
    expect(run(api, 'type RUNBOOK.TXT')).toContain('PRINT SPOOLER');

    const moved = executeCommand(parseCommand('cd ..'), api, ['SUPPORT']);

    expect(moved).toEqual({ lines: [], clear: false, cwd: [] });

    // And the command that followed it is answered from where it left the
    // terminal, which is the whole of what a working directory is.
    expect(executeCommand(parseCommand('cd'), api, moved.cwd ?? []).lines)
      .toEqual(['C:\\']);
    expect(executeCommand(parseCommand('dir'), api, moved.cwd ?? []).lines)
      .toContain(' Directory of C:\\');

    // The queue on somebody else's box, as the directory it actually is.
    expect(run(
      api,
      'dir \\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS',
    )).toContain('00047.SPL');

    // Not one of them writes anything: this family reads the world.
    expect(session.engine.snapshotHash()).toBe(before);
  });

  /**
   * The two file verbs that DO write, wired the same way and reaching the
   * world the same way: three typed paths in, node ids out, and the world's
   * own refusal back when it says no.
   */
  it('moves a file and empties a directory, from the same prompt', () => {
    const session = sessionWith('ticket:saved-into-temp', 'ticket:disk-full');
    const api = apiFor(session);

    expect(run(api, 'dir \\\\ACCTS-01\\C$\\WINDOWS\\TEMP'))
      .toContain('STATEMENT.TXT');
    expect(run(
      api,
      'move \\\\ACCTS-01\\C$\\WINDOWS\\TEMP\\STATEMENT.TXT '
      + '"\\\\ACCTS-01\\C$\\Documents and Settings\\praval\\My Documents"',
    )).toContain('1 file(s) moved.');
    expect(session.engine.ticketState('ticket:saved-into-temp'))
      .toBe('resolved');

    expect(run(api, 'purge \\\\WHOUSE-01\\C$\\SCANNER\\DATA'))
      .toContain('is not a second copy of anything');
    expect(session.engine.ticketState('ticket:disk-full')).toBe('open');

    expect(run(api, 'purge \\\\WHOUSE-01\\C$\\SCANNER\\EXPORT'))
      .toContain('310,902,784 bytes deleted');
    expect(session.engine.ticketState('ticket:disk-full')).toBe('resolved');
  });
});
