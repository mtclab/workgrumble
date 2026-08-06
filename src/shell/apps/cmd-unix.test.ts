import { describe, expect, it } from 'vitest';

import {
  PROMOTION_REPUTATION,
  SYSTEMS_ENGINEER_TITLE,
} from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { MSP_IDS } from '../../world/msp-company';
import { WasmEngine } from '../../engine-api';
import {
  FIELDS,
  PLAYER_TIERS,
  type PlayerTier,
  SYSTEMD_STATES,
} from '../../world/fields';
import { linuxUnitId } from '../../world/services';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand, type CommandResult } from './cmd-run';
import {
  ed25519Fingerprint,
  executeUnix,
  parseUnixCommand,
  readKnownHosts,
  type SshSession,
  unixPrompt,
} from './cmd-unix';
import type { GameApi } from './types';

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

/** Sets the player's standing so the promotion offer is on the table. */
function earnPromotion(session: WorldSession): void {
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
}

/** Runs a Windows-dialect line, as the desktop terminal does. */
function win(api: GameApi, input: string): CommandResult {
  return executeCommand(parseCommand(input), api);
}

/** Runs a unix-dialect line inside a session, as the terminal does on a box. */
function unix(
  api: GameApi,
  session: SshSession,
  input: string,
): CommandResult {
  return executeUnix(parseUnixCommand(input), api, session);
}

/** The session an ssh connect hands back, or a failure for the test to see. */
function connect(api: GameApi, line: string): SshSession | null {
  return win(api, line).enterSession ?? null;
}

describe('the promotion, ssh, and the unix terminal (E6)', () => {
  describe('the promotion: earned, one-way, through the real dispatch', () => {
    it('refuses the promotion below the reputation it is offered at', () => {
      const api = apiFor(createWorldSession());
      const out = win(api, 'promotion accept').lines.join('\n');

      expect(out).toContain('not on the table yet');
      // The world did NOT flip the tier: a below-the-bar accept changes nothing.
      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBeUndefined();
    });

    it('flips the tier and the title once it is earned', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);

      const out = win(api, 'promotion accept').lines.join('\n');
      expect(out).toContain('Systems Engineer now');

      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);
      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.title))
        .toBe(SYSTEMS_ENGINEER_TITLE);
    });

    it('refuses a second promotion - the crossing is one-way', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const out = win(api, 'promotion accept').lines.join('\n');
      expect(out).toContain('already a Systems Engineer');
    });

    it('refuses an unknown promotion sub-command', () => {
      const api = apiFor(createWorldSession());
      expect(win(api, 'promotion decline').lines.join('\n'))
        .toContain('promotion accept');
    });
  });

  describe('ssh: the tier gate', () => {
    it('refuses a service-desk player - server access is the engineers\' tier', () => {
      const api = apiFor(createWorldSession());
      const result = win(api, 'ssh pat@APP-01');

      expect(result.enterSession).toBeUndefined();
      expect(result.lines.join('\n')).toContain('not service-desk access');
    });

    it('connects once promoted - the same box, the gate now open', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const opened = win(api, 'ssh pat@APP-01');
      expect(opened.enterSession).toBeDefined();
      expect(opened.enterSession?.hostname).toBe('APP-01');
      expect(opened.enterSession?.username).toBe('pat');
    });

    it('refuses ssh to a Windows box - it does not run sshd', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const out = win(api, 'ssh pat@BEIGE-BOX');
      expect(out.enterSession).toBeUndefined();
      expect(out.lines.join('\n')).toContain('does not run sshd');
    });

    it('refuses a host nothing answers to', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      expect(win(api, 'ssh pat@nowhere').lines.join('\n'))
        .toContain('Could not resolve hostname');
    });
  });

  describe('ssh: trust-on-first-use', () => {
    function promotedApi(): GameApi {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');
      return api;
    }

    it('shows the fingerprint and records the host on the FIRST connect', () => {
      const api = promotedApi();
      const first = win(api, 'ssh pat@APP-01');

      expect(first.lines.join('\n')).toContain('ED25519 key fingerprint is');
      expect(first.lines.join('\n')).toContain('Permanently added');

      // The ledger now holds the box, one line, off the real graph field.
      const known = readKnownHosts(
        api.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      );
      expect(known).toContain('machine:app');
    });

    it('skips the fingerprint on the SECOND connect to the same host', () => {
      const api = promotedApi();
      win(api, 'ssh pat@APP-01');
      const second = win(api, 'ssh pat@APP-01');

      expect(second.enterSession).toBeDefined();
      expect(second.lines.join('\n')).not.toContain('key fingerprint');
      // Still exactly one line in the ledger - trusting a known host is a no-op.
      expect(readKnownHosts(
        api.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      )).toEqual(['machine:app']);
    });

    it('derives a stable ED25519 fingerprint from the host id', () => {
      const fp = ed25519Fingerprint('machine:app');
      expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/u);
      // Deterministic: the same box has the same fingerprint every session.
      expect(ed25519Fingerprint('machine:app')).toBe(fp);
      expect(ed25519Fingerprint('machine:db')).not.toBe(fp);
    });
  });

  describe('the unix dialect on a box', () => {
    interface OnBox {
      readonly world: WorldSession;
      readonly api: GameApi;
      readonly ssh: SshSession;
    }

    function onBox(host = 'APP-01'): OnBox {
      const world = createWorldSession();
      const api = apiFor(world);
      earnPromotion(world);
      win(api, 'promotion accept');
      const ssh = connect(api, `ssh pat@${host}`);
      if (ssh === null) {
        throw new Error('ssh did not open a session');
      }
      return { world, api, ssh };
    }

    it('prompts as user@host, a real family difference from C:\\>', () => {
      const { ssh } = onBox();
      expect(unixPrompt(ssh)).toBe('pat@APP-01:~$');
    });

    it('systemctl status reads the seeded unit as the richer ●-dot block', () => {
      const { api, ssh } = onBox();
      const out = unix(api, ssh, 'systemctl status nginx').lines;

      // The dot, then the Loaded and Active lines and the Main PID - not sc's
      // flat STATE line. The description and state are the seeded fields.
      expect(out[0]).toContain('\u25cf nginx.service - ');
      expect(out[0]).toContain('high performance web server');
      expect(out.join('\n')).toContain('Loaded: loaded (/lib/systemd/system/'
        + 'nginx.service; enabled;');
      expect(out.join('\n')).toContain('Active: active (running)');
      expect(out.join('\n')).toContain('Main PID:');
    });

    it('takes the full unit name as well as the base', () => {
      const { api, ssh } = onBox();
      expect(unix(api, ssh, 'systemctl status nginx.service').lines[0])
        .toContain('nginx.service');
    });

    it('reads the state off the node - flip it and the status changes (teeth)', () => {
      const { world, api, ssh } = onBox();

      const before = unix(api, ssh, 'systemctl status nginx').lines.join('\n');
      expect(before).toContain('active (running)');

      // The world is the only source: re-seed the unit as failed (the state the
      // Pass B fix task will find it in) and the block changes with it.
      world.engine.applySetup([{
        op: 'setField',
        id: linuxUnitId('machine:app', 'nginx.service'),
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      }]);

      const after = unix(api, ssh, 'systemctl status nginx').lines.join('\n');
      expect(after).toContain('Active: failed');
      expect(after).toContain('\u00d7 nginx.service'); // the × dot, not ●
      // A failed unit has no Main PID line - the block is honest about it.
      expect(after).not.toContain('Main PID:');
    });

    it('ls -la prints the mode/owner/group columns, not a dir header', () => {
      const { api, ssh } = onBox();
      const out = unix(api, ssh, 'ls -la').lines.join('\n');

      expect(out).toContain('drwxr-xr-x');
      expect(out).toContain('pat');
      // The family difference, said out loud, with no invented files.
      expect(out).toContain('mode, owner, group, size and mtime');
      expect(out).not.toContain('Volume in drive');
    });

    it('exit and logout leave the session, back to the desktop', () => {
      const { api, ssh } = onBox();
      const exited = unix(api, ssh, 'exit');
      expect(exited.exitSession).toBe(true);
      expect(exited.lines.join('\n')).toContain('Connection to APP-01 closed');

      expect(unix(api, ssh, 'logout').exitSession).toBe(true);
    });

    it('systemctl restart is SILENT on success - it never fakes a line', () => {
      const { api, ssh } = onBox();
      const result = unix(api, ssh, 'systemctl restart nginx');
      // The sharpest fidelity beat: systemd says nothing when it works, so this
      // prints NOTHING - no fabricated "started successfully", which is the
      // Windows family's shape (`restart` prints "reports RUNNING") and a lie
      // here. Re-reading status is how a real engineer confirms it.
      expect(result.lines).toEqual([]);
      expect(result.lines.join('\n')).not.toContain('reports RUNNING');
      expect(result.lines.join('\n')).not.toContain('successfully');
    });

    it('answers an unknown unix command in the unix shape', () => {
      const { api, ssh } = onBox();
      // A name that is not a command and not a known-but-absent tool: the plain
      // miss. (htop and friends have their own not-installed shape, tested below.)
      expect(unix(api, ssh, 'frobnicate').lines.join('\n'))
        .toContain('command not found');
    });
  });

  describe('the crossing survives a save', () => {
    it('a reload keeps the promotion, the title and the known_hosts', () => {
      const world = createWorldSession();
      const api = apiFor(world);
      earnPromotion(world);
      win(api, 'promotion accept');
      win(api, 'ssh pat@APP-01'); // records the host in known_hosts

      // The two durable halves are fields on the player node, so the engine's
      // own serialization carries them - which is exactly the string a save
      // file holds verbatim (`save.ts`).
      const saved = world.engine.serialize();
      const reloaded = new WasmEngine(WORLD_SEED);
      reloaded.restore(saved);

      expect(reloaded.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);
      expect(reloaded.graph.getField(COMPANY_IDS.player, FIELDS.title))
        .toBe(SYSTEMS_ENGINEER_TITLE);
      expect(readKnownHosts(
        reloaded.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      )).toContain('machine:app');
    });

    it('the promotion crosses an employer switch, permanently', () => {
      // The career carry is what makes the tier follow the player to the next
      // job. A promoted standing arriving at a new employer seeds the engineer
      // tier onto its fresh player node; a service-desk one writes nothing.
      const promoted = createWorldSession(carryFor(PLAYER_TIERS.systemsEngineer));
      expect(promoted.engine.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);

      const deskCarry = createWorldSession(carryFor(PLAYER_TIERS.serviceDesk));
      // The desk default writes nothing - byte-identical to before the tier.
      expect(deskCarry.engine.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBeUndefined();
    });
  });
});

/* ========================================================================= *
 * Pass B: the full command surface, and THE FIRST FIX (the payoff).
 * ========================================================================= */

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

interface OnMsp {
  readonly world: WorldSession;
  readonly api: GameApi;
  readonly ssh: SshSession;
}

/**
 * The MSP world, promoted, ssh'd onto a box. The promotion RAISES the first
 * incident (`day.raiseFirstIncident`), which downs fcportal.service on the MSP's
 * own FC-RMM-01 - so this is the real path a player walks to the fix.
 */
function onMsp(host = 'FC-RMM-01'): OnMsp {
  const world = createWorldSession(MSP_CARRY);
  const api = apiFor(world);
  earnPromotion(world);
  win(api, 'promotion accept');
  const ssh = connect(api, `ssh pat@${host}`);

  if (ssh === null) {
    throw new Error(`ssh did not open a session on ${host}`);
  }

  return { world, api, ssh };
}

describe('the sysadmin command surface (E6, Pass B)', () => {
  describe('journalctl', () => {
    it('reads a failed unit\'s journal - the timestamped why', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'journalctl -u fcportal').lines.join('\n');

      // The real MMM DD HH:MM:SS host process[pid]: message shape, and the
      // start-limit that is the actual reason a restart is the fix.
      expect(out).toMatch(/^Sep 07 08:44:\d\d FC-RMM-01 /mu);
      expect(out).toContain('Start request repeated too quickly');
      expect(out).toContain('Failed to start Fettle & Crane client portal');
    });

    it('says "-- No entries --" for a unit the world holds no journal for', () => {
      const { api, ssh } = onMsp();
      // nginx is healthy and carries no seeded journal - the honest omission,
      // the real journalctl answer, not an invented startup line.
      expect(unix(api, ssh, 'journalctl -u nginx').lines.join('\n'))
        .toContain('-- No entries --');
    });
  });

  describe('df -h / ps aux / ip a', () => {
    it('df -h prints the Mounted-on shape off the box\'s seeded disk', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'df -h').lines.join('\n');

      expect(out).toContain('Filesystem');
      expect(out).toContain('Mounted on');
      expect(out).toContain('/dev/root');
      // A mount point, not a drive letter - the family difference.
      expect(out).not.toContain('C:');
    });

    it('ps aux lists systemd as PID 1 and running units, a downed one absent', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'ps aux').lines.join('\n');

      expect(out).toContain('USER');
      expect(out).toContain('COMMAND');
      expect(out).toContain('/sbin/init'); // PID 1
      expect(out).toContain('/usr/bin/nginx'); // a running unit
      // fcportal is FAILED at this point - a downed unit is not a process, and
      // ps is honest about it.
      expect(out).not.toContain('/usr/bin/fcportal');
    });

    it('ip a prints the CIDR shape, not ipconfig\'s dotted mask', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'ip a').lines.join('\n');

      expect(out).toContain('eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500');
      expect(out).toMatch(/inet 10\.42\.0\.\d+\/24 /u);
      expect(out).not.toContain('Subnet Mask');
    });
  });

  describe('THE FIRST FIX: diagnose and fix the downed portal', () => {
    it('walks status(failed) -> journalctl(why) -> restart(silent) -> resolved', () => {
      const { world, api, ssh } = onMsp();
      const unitId = MSP_IDS.mspInfraPortalUnit;
      const ticket = 'ticket:syseng-first-incident';

      // The incident is real and the unit is genuinely failed at seed: the
      // promotion raised it and its setup downed the portal node.
      expect(world.engine.graph.getNode(ticket)).toBeDefined();
      expect(world.engine.graph.getField(unitId, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.failed);
      expect(world.engine.ticketState(ticket)).not.toBe('resolved');

      // systemctl status shows it failed, with the journal tail under the block.
      const status = unix(api, ssh, 'systemctl status fcportal').lines.join('\n');
      expect(status).toContain('Active: failed');
      expect(status).toContain('× fcportal.service');
      expect(status).not.toContain('Main PID:');
      expect(status).toContain('Failed to start Fettle & Crane client portal');

      // journalctl shows WHY.
      expect(unix(api, ssh, 'journalctl -u fcportal').lines.join('\n'))
        .toContain('Start request repeated too quickly');

      // systemctl restart brings it back - SILENT on success.
      const restart = unix(api, ssh, 'systemctl restart fcportal');
      expect(restart.lines).toEqual([]);

      // The node flipped to active(running) - and the ticket resolved off it.
      expect(world.engine.graph.getField(unitId, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
      expect(world.engine.ticketState(ticket)).toBe('resolved');

      // And status now reads running, with a Main PID.
      const after = unix(api, ssh, 'systemctl status fcportal').lines.join('\n');
      expect(after).toContain('Active: active (running)');
      expect(after).toContain('Main PID:');
    });

    it('restart READS and WRITES the node (teeth): revert the flip, status reverts', () => {
      const { world, api, ssh } = onMsp();
      const unitId = MSP_IDS.mspInfraPortalUnit;

      unix(api, ssh, 'systemctl restart fcportal');
      expect(world.engine.graph.getField(unitId, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);

      // Re-seed it failed (what reverting the fix would leave) and the status
      // reads failed again - the block is a function of the node, not hardcoded.
      world.engine.applySetup([{
        op: 'setField',
        id: unitId,
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      }]);
      expect(unix(api, ssh, 'systemctl status fcportal').lines.join('\n'))
        .toContain('Active: failed');
    });

    it('is genuinely broken at seed: with no restart, the ticket stays open', () => {
      const { world } = onMsp();
      // A minute passes, nothing is done - the fix journey has something to fix.
      expect(world.engine.ticketState('ticket:syseng-first-incident'))
        .not.toBe('resolved');
    });
  });

  describe('the scope wall stays up over ssh (non-bypassing)', () => {
    it('refuses systemctl restart on a customer\'s out-of-scope server', () => {
      // MERI-APP-01 is a helpdesk customer's Linux prod box: the engineer can
      // ssh in and LOOK, but the CONTRACT still governs what may change on it -
      // so a restart is refused, exactly as the desk's Windows tools are. This
      // is what keeps the fix on the MSP's OWN infra non-bypassing.
      const { api, ssh } = onMsp('MERI-APP-01');
      const result = unix(api, ssh, 'systemctl restart grumbleapp');

      // A refusal is NOT silent - a successful restart prints nothing, so
      // non-empty lines prove the action was stopped before it landed.
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines.join('\n')).toContain('CONTRACT still governs');
      // And the unit was not touched: still running, because nothing dispatched.
      expect(api.graph.getField(
        MSP_IDS.meridianAppServer.replace('machine:', 'unit:') + '/grumbleapp.service',
        FIELDS.unitState,
      )).not.toBe(SYSTEMD_STATES.failed);
    });

    it('lets the engineer fix the MSP\'s OWN box - no customer to be out of', () => {
      // The same verb on FC-RMM-01 (no customer) is allowed and silent: the
      // employer's own infra is the engineer's to fix.
      const { api, ssh } = onMsp('FC-RMM-01');
      expect(unix(api, ssh, 'systemctl restart fcportal').lines).toEqual([]);
    });
  });

  describe('the diegetic promotion offer', () => {
    it('bare "promotion" reads as an earned OFFER once the standing is there', () => {
      const session = createWorldSession(MSP_CARRY);
      const api = apiFor(session);
      earnPromotion(session);

      const out = win(api, 'promotion').lines.join('\n');
      expect(out).toContain('they want you on');
      expect(out).toContain('promotion accept');
    });

    it('bare "promotion" says not-yet below the standing', () => {
      const api = apiFor(createWorldSession(MSP_CARRY));
      expect(win(api, 'promotion').lines.join('\n'))
        .toContain('No Systems Engineer offer on the table yet');
    });

    it('bare "promotion" tells an engineer the crossing is one-way', () => {
      const session = createWorldSession(MSP_CARRY);
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      expect(win(api, 'promotion').lines.join('\n'))
        .toContain('Systems Engineer already');
    });
  });
});

/* ========================================================================= *
 * 0.16.0: the network toolbox (ss/dig/host/ping/curl) and the not-installed
 * gags (traceroute/ifconfig/netstat/htop). Content on the Pass B engine.
 * ========================================================================= */

describe('the sysadmin network toolbox (E6, 0.16.0)', () => {
  describe('ss -tlnp: the box\'s listeners', () => {
    it('reads the running units\' listening sockets in the real shape', () => {
      // MERI-APP-01 is healthy: sshd, nginx and the product app are all up, so
      // their listeners are on the box. The header is ss's own columns.
      const { api, ssh } = onMsp('MERI-APP-01');
      const out = unix(api, ssh, 'ss -tlnp').lines.join('\n');

      expect(out).toContain('State');
      expect(out).toContain('Recv-Q');
      expect(out).toContain('Local Address:Port');
      expect(out).toContain('Peer Address:Port');
      // The listeners the running units hold, at their real ports.
      expect(out).toMatch(/LISTEN\s+0\s+128\s+\*:22\s+\*:\*/u); // sshd
      expect(out).toMatch(/LISTEN\s+0\s+511\s+\*:80\s+\*:\*/u); // nginx
      expect(out).toContain('*:443'); // nginx tls
      expect(out).toContain('127.0.0.1:8000'); // the product app upstream
    });

    it('-p appends the process column, -tln does not', () => {
      const { api, ssh } = onMsp('MERI-APP-01');

      const withProc = unix(api, ssh, 'ss -tlnp').lines.join('\n');
      expect(withProc).toContain('Process');
      expect(withProc).toContain('users:(("sshd",pid=');
      expect(withProc).toContain('fd=3))');

      const noProc = unix(api, ssh, 'ss -tln').lines.join('\n');
      expect(noProc).not.toContain('Process');
      expect(noProc).not.toContain('users:((');
    });

    it('a downed unit is NOT listening (teeth): flip nginx, *:80 drops', () => {
      const { world, api, ssh } = onMsp('MERI-APP-01');

      const before = unix(api, ssh, 'ss -tlnp').lines.join('\n');
      expect(before).toContain('*:80');

      // The world is the only source: down nginx and its listeners must vanish
      // from ss, because a stopped service holds no port. A fabricated static
      // listing would still show *:80 here and fail.
      world.engine.applySetup([{
        op: 'setField',
        id: linuxUnitId(MSP_IDS.meridianAppServer, 'nginx.service'),
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      }]);

      const after = unix(api, ssh, 'ss -tlnp').lines.join('\n');
      expect(after).not.toContain('*:80');
      expect(after).not.toContain('*:443');
      // ssh is still up, so the box still listens on 22 - only nginx dropped.
      expect(after).toContain('*:22');
    });

    it('the downed portal is not listening, and restart brings its port back', () => {
      // The diagnosis touch: on FC-RMM-01 the portal is failed at seed, so its
      // 8000 upstream is absent from ss - the read that says "the thing nginx
      // proxies to is not there" - and the restart brings the listener back.
      const { api, ssh } = onMsp('FC-RMM-01');

      const down = unix(api, ssh, 'ss -tlnp').lines.join('\n');
      expect(down).toContain('*:80'); // nginx is up
      expect(down).not.toContain('127.0.0.1:8000'); // fcportal is failed

      expect(unix(api, ssh, 'systemctl restart fcportal').lines).toEqual([]);

      const up = unix(api, ssh, 'ss -tlnp').lines.join('\n');
      expect(up).toContain('127.0.0.1:8000'); // now it listens
    });
  });

  describe('dig / host: DNS over the estate graph', () => {
    it('dig prints the QUESTION/ANSWER sections and the stats footer', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'dig FC-RMM-01').lines.join('\n');

      expect(out).toContain(';; QUESTION SECTION:');
      expect(out).toContain(';; ANSWER SECTION:');
      expect(out).toContain('status: NOERROR');
      // The `name. TTL IN A addr` answer row, over the estate's own address.
      expect(out).toMatch(/fc-rmm-01\.workgrumble\.local\.\s+300\s+IN\s+A\s+10\.42\.0\.\d+/u);
      // The stats footer the shape requires.
      expect(out).toContain(';; Query time:');
      expect(out).toContain(';; SERVER: 10.42.0.1#53');
      expect(out).toContain(';; MSG SIZE  rcvd:');
    });

    it('dig answers NXDOMAIN for a name the world does not hold', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'dig nowhere-at-all').lines.join('\n');

      expect(out).toContain('status: NXDOMAIN');
      expect(out).toContain(';; QUESTION SECTION:');
      // NXDOMAIN carries a question and no answer - the honest empty reply.
      expect(out).not.toContain(';; ANSWER SECTION:');
    });

    it('host is the terse answer, and the terse not-found', () => {
      const { api, ssh } = onMsp();

      expect(unix(api, ssh, 'host FC-RMM-01').lines.join('\n'))
        .toMatch(/fc-rmm-01\.workgrumble\.local has address 10\.42\.0\.\d+/u);
      expect(unix(api, ssh, 'host nowhere-at-all').lines.join('\n'))
        .toContain('not found: 3(NXDOMAIN)');
    });
  });

  describe('ping: continuous by default (the sharpest family diff)', () => {
    it('bare ping says it is CONTINUOUS and names -c - not 4-and-stop (teeth)', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'ping FC-RMM-01').lines.join('\n');

      // The real reply shape.
      expect(out).toMatch(/64 bytes from 10\.42\.0\.\d+: icmp_seq=1 ttl=57 time=/u);
      // The family teeth: it does NOT stop on its own, and it says so, and it
      // does NOT print a Windows-style completed statistics block. A 4-and-stop
      // like Windows would have a transmitted/received summary here and no
      // "keep sending" line - so this reds a Windows-shaped ping.
      expect(out).toContain('does not stop on its own');
      expect(out).toContain('Ctrl-C');
      expect(out).toContain('-c');
      expect(out).not.toContain('packets transmitted');
    });

    it('ping -c N sends exactly N and prints the statistics block', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'ping -c 4 FC-RMM-01').lines.join('\n');

      expect(out).toContain('icmp_seq=4');
      expect(out).not.toContain('icmp_seq=5');
      expect(out).toContain('4 packets transmitted, 4 received, 0% packet loss');
      expect(out).toContain('rtt min/avg/max/mdev =');
      // Bounded: no "keep sending" teaching when -c ended the run.
      expect(out).not.toContain('does not stop on its own');
    });

    it('refuses a name nothing answers to, the real ping way', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'ping nowhere-at-all').lines.join('\n'))
        .toContain('Name or service not known');
    });

    it('is deterministic: the same host pings the same times', () => {
      const first = unix(onMsp().api, onMsp().ssh, 'ping -c 3 FC-RMM-01');
      const second = unix(onMsp().api, onMsp().ssh, 'ping -c 3 FC-RMM-01');
      expect(first.lines).toEqual(second.lines);
    });
  });

  describe('curl -I: the HTTP truth over the box\'s web units', () => {
    it('nginx up and the app up is HTTP 200, server: nginx', () => {
      const { api, ssh } = onMsp('MERI-APP-01');
      const out = unix(api, ssh, 'curl -I http://localhost').lines.join('\n');

      expect(out).toContain('HTTP/2 200');
      expect(out).toContain('server: nginx');
    });

    it('nginx up but the app DOWN is a 502 - the portal diagnosis', () => {
      // FC-RMM-01: nginx is up, fcportal is failed, so nginx answers but 502s
      // because its upstream is gone. curl reads it, and the restart fixes it.
      const { api, ssh } = onMsp('FC-RMM-01');

      const down = unix(api, ssh, 'curl -I http://localhost').lines.join('\n');
      expect(down).toContain('HTTP/2 502');
      expect(down).toContain('server: nginx');

      expect(unix(api, ssh, 'systemctl restart fcportal').lines).toEqual([]);
      expect(unix(api, ssh, 'curl -I http://localhost').lines.join('\n'))
        .toContain('HTTP/2 200');
    });

    it('a box not serving http is the real "Failed to connect"', () => {
      const { world, api, ssh } = onMsp('MERI-APP-01');
      // Down nginx entirely: nothing is answering on 80/443 now.
      world.engine.applySetup([{
        op: 'setField',
        id: linuxUnitId(MSP_IDS.meridianAppServer, 'nginx.service'),
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      }]);

      expect(unix(api, ssh, 'curl -I http://localhost').lines.join('\n'))
        .toContain('Failed to connect');
    });
  });

  describe('the not-installed gags (a refusal that teaches)', () => {
    it('htop is not installed - command not found + the real apt hint', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'htop').lines;

      // Ubuntu's own command-not-found shape, exactly - NOT a silent success and
      // NOT a fabricated process table (a fake htop screen would fail here).
      expect(out[0]).toBe('Command \'htop\' not found, but can be installed with:');
      expect(out[1]).toBe('sudo apt install htop');
    });

    it('ifconfig and netstat point at net-tools (ip/ss are canonical)', () => {
      const { api, ssh } = onMsp();

      expect(unix(api, ssh, 'ifconfig').lines).toEqual([
        'Command \'ifconfig\' not found, but can be installed with:',
        'sudo apt install net-tools',
      ]);
      expect(unix(api, ssh, 'netstat -tlnp').lines).toEqual([
        'Command \'netstat\' not found, but can be installed with:',
        'sudo apt install net-tools',
      ]);
    });

    it('traceroute is not installed either - its own package', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'traceroute FC-RMM-01').lines).toEqual([
        'Command \'traceroute\' not found, but can be installed with:',
        'sudo apt install traceroute',
      ]);
    });

    it('teeth: the gag is a refusal, never a fabricated output', () => {
      const { api, ssh } = onMsp();
      // Every not-installed tool answers with the hint and nothing that looks
      // like real tool output - no interface block, no route table, no header.
      for (const tool of ['htop', 'ifconfig', 'netstat', 'traceroute']) {
        const out = unix(api, ssh, tool).lines.join('\n');
        expect(out).toContain('not found, but can be installed with');
        expect(out).toContain('sudo apt install');
        expect(out).not.toContain('inet ');
        expect(out).not.toContain('LISTEN');
      }
    });
  });
});

/** A first-week carry arriving with the given tier, for the switch test. */
function carryFor(tier: PlayerTier): Parameters<typeof createWorldSession>[0] {
  return {
    farmFund: 0,
    attempt: 1,
    employer: 'workgrumble',
    reputation: 80,
    title: 'Systems Engineer',
    playerTier: tier,
  };
}
