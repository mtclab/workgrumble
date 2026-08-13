import { describe, expect, it } from 'vitest';


import { COMPANY_IDS } from '../../world/company';
import { MSP_IDS } from '../../world/msp-company';
import { WasmEngine } from '../../engine-api';
import {
  FIELDS,
  MACHINE_OS,
  PLAYER_TIERS,
  type PlayerTier,
  SYSTEMD_STATES,
} from '../../world/fields';
import {
  SELINUX_RESTORED_CONTEXT,
  SELINUX_WEB_CONTEXT,
  selinuxNodeIds,
} from '../../world/selinux';
import { unitIdOn } from '../../world/services';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { AppStateStore } from '../app-state';
import {
  DISTROS,
  distroById,
  type DistroId,
  type PackageManager,
} from '../skins';
import { DayDriver } from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand, type CommandResult } from './cmd-run';
import {
  ed25519Fingerprint,
  executeUnix,
  parseUnixCommand,
  readInstalledPackages,
  readKnownHosts,
  sessionFamily,
  type SshSession,
  unixPrompt,
} from './cmd-unix';
import type { GameApi } from './types';
import { ENGINEER_TITLE, offeredAtFor } from '../../world/titles';

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
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
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
    value: offeredAtFor('systems_engineer'),
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
        .toBe(ENGINEER_TITLE);
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
      const { api, ssh } = onBox();
      expect(unixPrompt(ssh, sessionFamily(api, ssh))).toBe('pat@APP-01:~$');
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
        id: unitIdOn('machine:app', 'nginx.service'),
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
        .toBe(ENGINEER_TITLE);
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
        id: unitIdOn(MSP_IDS.meridianAppServer, 'nginx.service'),
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
        id: unitIdOn(MSP_IDS.meridianAppServer, 'nginx.service'),
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

describe('the characteristic-incident commands (E6, 0.19.0)', () => {
  describe('du: what a directory is eating, at the real size-tab-path shape', () => {
    it('du -sh <path> prints one summed size-tab-path line', () => {
      const { api, ssh } = onMsp();
      // On the disk-full box the journal is the ~26G runaway - a real read off
      // the node, in the `26G\t/var/log/journal` shape du actually prints.
      const out = unix(api, ssh, 'du -sh /var/log/journal').lines;

      expect(out).toHaveLength(1);
      expect(out[0]).toBe('26G\t/var/log/journal');
    });

    it('without -s it lists each directory under the path, then the total', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'du -h /var/log').lines;

      // The journal and the nginx logs, then the summed /var/log - the drill-down
      // that finds the runaway.
      expect(out.some((line) => line.endsWith('\t/var/log/journal'))).toBe(true);
      expect(out.some((line) => line.endsWith('\t/var/log/nginx'))).toBe(true);
      expect(out[out.length - 1]).toBe(`26G\t/var/log`);
    });

    it('a path with nothing under it is a small ordinary directory', () => {
      const { api, ssh } = onMsp();
      // The world seeds no directories under /etc for a Linux box; du reports the
      // 4K an empty ext4 directory takes, not an error.
      expect(unix(api, ssh, 'du -sh /etc').lines).toEqual(['4.0K\t/etc']);
    });
  });

  describe('certbot certificates: reading the box\'s cert state', () => {
    it('reports the certificate as EXPIRED on the cert-expiry box', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'certbot certificates').lines.join('\n');

      expect(out).toContain('Found the following certs');
      expect(out).toContain('EXPIRED');
    });
  });
});

/* ========================================================================= *
 * 0.20.0: apt / packages / patching - the not-installed gag, closed.
 * ========================================================================= */

/** Forces the box's installed-packages set, for the round-trip teeth. */
function setInstalled(
  world: WorldSession,
  hostId: string,
  value: string,
): void {
  world.engine.applySetup([{
    op: 'setField',
    id: hostId,
    field: FIELDS.installedPackages,
    value,
  }]);
}

describe('apt install closes the not-installed gag (E6, 0.20.0)', () => {
  it('parses a sudo prefix off a unix line, and only there', () => {
    const parsed = parseUnixCommand('sudo apt install htop');
    expect(parsed.kind).toBe('command');
    expect(parsed.kind === 'command' && parsed.spec.name).toBe('apt');
    expect(parsed.kind === 'command' && parsed.sub).toBe('install');
    expect(parsed.kind === 'command' && parsed.query).toBe('htop');
    expect(parsed.kind === 'command' && parsed.sudo).toBe(true);

    // Without the prefix the same line parses, with sudo absent - which is what
    // the privileged subcommands refuse on.
    const bare = parseUnixCommand('apt install htop');
    expect(bare.kind === 'command' && bare.sudo).toBeUndefined();

    // A bare "sudo" with nothing to run is not a command - it is the plain miss.
    expect(parseUnixCommand('sudo').kind).toBe('unknown');
  });

  it('the ROUND TRIP: htop gags, apt install runs it, flip it back and it gags', () => {
    const { world, api, ssh } = onMsp();

    // Before: the 0.16.0 gag, unchanged - command not found + the apt hint.
    const before = unix(api, ssh, 'htop').lines;
    expect(before[0]).toBe('Command \'htop\' not found, but can be installed with:');
    expect(before[1]).toBe('sudo apt install htop');

    // The install: the real apt NEW-packages shape, and the package recorded.
    const install = unix(api, ssh, 'sudo apt install htop').lines.join('\n');
    expect(install).toContain('The following NEW packages will be installed:');
    expect(install).toContain('Setting up htop (3.3.0-4build1) ...');
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toContain('htop');

    // After: the SAME command now RUNS - a curses snapshot, not the hint.
    const after = unix(api, ssh, 'htop').lines.join('\n');
    expect(after).toContain('Load average');
    expect(after).not.toContain('can be installed with');

    // Flip the box state back and it REVERTS to the gag - the field is the switch.
    setInstalled(world, ssh.hostId, '');
    expect(unix(api, ssh, 'htop').lines[1]).toBe('sudo apt install htop');
  });

  it('net-tools closes BOTH ifconfig and netstat in one install', () => {
    const { api, ssh } = onMsp();

    // Both gag first.
    expect(unix(api, ssh, 'ifconfig').lines[1]).toBe('sudo apt install net-tools');
    expect(unix(api, ssh, 'netstat -tlnp').lines[1])
      .toBe('sudo apt install net-tools');

    unix(api, ssh, 'sudo apt install net-tools');

    // ifconfig runs, in the DOTTED-netmask shape (the family diff from ip a /24).
    const ifc = unix(api, ssh, 'ifconfig').lines.join('\n');
    expect(ifc).toContain('netmask 255.255.255.0');
    expect(ifc).not.toContain('can be installed with');

    // netstat runs, in net-tools' older PID/Program shape over the box listeners.
    const net = unix(api, ssh, 'netstat -tlnp').lines.join('\n');
    expect(net).toContain('LISTEN');
    expect(net).toContain('/sshd');
  });

  it('traceroute installs and then traces the same-subnet host, unix shape', () => {
    const { api, ssh } = onMsp();
    expect(unix(api, ssh, 'traceroute FC-RMM-01').lines[1])
      .toBe('sudo apt install traceroute');

    unix(api, ssh, 'sudo apt install traceroute');
    const out = unix(api, ssh, 'traceroute FC-RMM-01').lines.join('\n');
    expect(out).toContain('hops max, 60 byte packets');
    expect(out).toContain('10.42.0'); // the estate's own derived address
  });

  it('is privileged: apt install with no sudo fails on the dpkg lock', () => {
    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'apt install htop').lines.join('\n');
    expect(out).toContain('are you root?');
    // And nothing was installed - the refusal is real, htop still gags.
    expect(unix(api, ssh, 'htop').lines[1]).toBe('sudo apt install htop');
  });

  it('says so when a package is already installed, and never double-appends', () => {
    const { api, ssh } = onMsp();
    unix(api, ssh, 'sudo apt install htop');
    const again = unix(api, ssh, 'sudo apt install htop').lines.join('\n');
    expect(again).toContain('htop is already the newest version');
    // Still exactly one line in the set - the shell guards the duplicate append.
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual(['htop']);
  });

  it('answers Unable to locate package for one outside the catalogue', () => {
    const { api, ssh } = onMsp();
    expect(unix(api, ssh, 'sudo apt install cowsay').lines.join('\n'))
      .toContain('Unable to locate package cowsay');
  });

  it('the install PERSISTS across a save (the installed set round-trips)', () => {
    const { world, api, ssh } = onMsp();
    unix(api, ssh, 'sudo apt install htop');

    // The installed set is a field on the box node, so the engine's own
    // serialization carries it - the string a save file holds verbatim.
    const saved = world.engine.serialize();
    const reloaded = new WasmEngine(WORLD_SEED);
    reloaded.restore(saved);

    expect(readInstalledPackages(
      reloaded.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toContain('htop');
  });
});

describe('apt update / list / upgrade: the pending-updates state (0.20.0)', () => {
  it('apt update reads the box is behind, incl a security update', () => {
    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'sudo apt update').lines.join('\n');
    expect(out).toMatch(/\d+ packages? can be upgraded/u);
    expect(out).toContain('security update');
  });

  it('apt list --upgradable lists the rows, incl the noble-security one', () => {
    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'apt list --upgradable').lines;
    expect(out[0]).toBe('Listing... Done');
    const body = out.join('\n');
    expect(body).toContain('[upgradable from:');
    // The security update is always in the set - it slices from the front.
    expect(body).toContain('libssl3t64/noble-updates,noble-security');
  });

  it('apt list needs no sudo, but apt update/upgrade do', () => {
    const { api, ssh } = onMsp();
    // Read-only: no sudo needed.
    expect(unix(api, ssh, 'apt list --upgradable').lines[0]).toBe('Listing... Done');
    // Privileged: the lock error names sudo.
    expect(unix(api, ssh, 'apt update').lines.join('\n')).toContain('are you root?');
    expect(unix(api, ssh, 'apt upgrade').lines.join('\n')).toContain('are you root?');
  });

  it('apt upgrade applies them and the box reads clean after', () => {
    const { api, ssh } = onMsp();
    const upgrade = unix(api, ssh, 'sudo apt upgrade').lines.join('\n');
    expect(upgrade).toContain('The following packages will be upgraded:');
    expect(upgrade).toContain('0 not upgraded');

    // The world wrote the flag; the box is clean.
    expect(api.graph.getField(ssh.hostId, FIELDS.updatesApplied)).toBe(true);
    expect(unix(api, ssh, 'sudo apt update').lines.join('\n'))
      .toContain('All packages are up to date.');
    expect(unix(api, ssh, 'apt list --upgradable').lines).toEqual(['Listing... Done']);
  });

  it('TEETH: the upgradable count reads a REAL state - flip it, nothing to upgrade', () => {
    const { world, api, ssh } = onMsp();
    // Behind by default.
    expect(unix(api, ssh, 'sudo apt update').lines.join('\n'))
      .toContain('can be upgraded');

    // Flip the real state directly (not via the command): the count follows it.
    world.engine.applySetup([{
      op: 'setField',
      id: ssh.hostId,
      field: FIELDS.updatesApplied,
      value: true,
    }]);
    expect(unix(api, ssh, 'sudo apt update').lines.join('\n'))
      .toContain('All packages are up to date.');
  });

  it('is deterministic and always carries the security update, per box', () => {
    const { api, ssh } = onMsp();
    const first = unix(api, ssh, 'apt list --upgradable').lines.join('\n');
    const second = unix(api, ssh, 'apt list --upgradable').lines.join('\n');
    expect(first).toBe(second); // no Math.random - stable across calls
    expect(first).toContain('noble-security');

    // A different box is behind on its own (possibly different) amount, but the
    // security update is always in it - it is the front of the pool.
    const other = onMsp('MERI-APP-01');
    expect(unix(other.api, other.ssh, 'apt list --upgradable').lines.join('\n'))
      .toContain('noble-security');
  });
});

describe('dpkg -l and unattended-upgrades (0.20.0)', () => {
  it('dpkg -l lists the base set, and apt-installed packages as ii', () => {
    const { api, ssh } = onMsp();
    const before = unix(api, ssh, 'dpkg -l').lines.join('\n');
    expect(before).toContain('ii  '); // the base set is there
    expect(before).not.toContain('ii  htop');

    unix(api, ssh, 'sudo apt install htop');
    const after = unix(api, ssh, 'dpkg -l').lines.join('\n');
    // The install shows up in the read - the two surfaces agree off one field.
    expect(after).toContain('ii  htop');
    expect(after).toContain('interactive processes viewer');
  });

  it('unattended-upgrades is a LOG, not a stdout command', () => {
    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'unattended-upgrades').lines.join('\n');
    // Its evidence is a log tail, not a fabricated interactive run.
    expect(out).toContain('evidence is a');
    expect(out).toContain('/var/log/unattended-upgrades/');
    expect(out).not.toContain('Setting up');
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

describe('identity and permissions (E6, 0.21.0)', () => {
  describe('id / whoami / getent - who is on the box', () => {
    it('whoami is the bare login, not the Windows domain\\user shape', () => {
      const { api, ssh } = onMsp();
      // The unix whoami answers the ssh login and nothing else - the family
      // difference from the desktop whoami's workgrumble\\pat.
      expect(unix(api, ssh, 'whoami').lines).toEqual(['pat']);
    });

    it('id prints the real uid/gid/groups shape, sudo and all', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'id').lines.join('\n');

      expect(out).toBe('uid=1000(pat) gid=1000(pat) groups=1000(pat),4(adm),'
        + '27(sudo)');
    });

    it('id <user> reads root off the box - uid=0(root)', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'id root').lines.join('\n'))
        .toBe('uid=0(root) gid=0(root) groups=0(root)');
    });

    it('id refuses a user the box does not have, the real way', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'id nobodyhere').lines.join('\n'))
        .toBe("id: 'nobodyhere': no such user");
    });

    it('getent passwd <user> is the 7 colon-fields of /etc/passwd', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'getent passwd root').lines.join('\n'))
        .toBe('root:x:0:0:root:/root:/bin/bash');
      // Seven fields, exactly - name:x:uid:gid:gecos:home:shell.
      expect(unix(api, ssh, 'getent passwd root').lines[0]?.split(':'))
        .toHaveLength(7);
    });

    it('getent reads the REAL user set - the box\'s units drive it (teeth)', () => {
      const { api, ssh } = onMsp();
      const all = unix(api, ssh, 'getent passwd').lines.join('\n');

      // The base account, the login, the daemons that run here (nginx -> www-data)
      // and the service account of a unit ON this box (fcauth, built by the
      // permission incident) are all present because they are read off the estate.
      expect(all).toContain('root:x:0:0:');
      expect(all).toContain('pat:x:1000:1000:');
      expect(all).toContain('www-data:x:33:33:');
      expect(all).toContain('fcauth:x:');
      // A service account for a unit that is NOT on this box does not appear -
      // the set is derived, not a fixed catalogue.
      expect(all).not.toContain('grumbleapp:x:');
      expect(unix(api, ssh, 'getent passwd fcauth').lines[0])
        .toContain(':/usr/sbin/nologin');
    });

    it('getent answers only the passwd database it models', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'getent group root').lines.join('\n'))
        .toContain('getent passwd');
    });
  });

  describe('chmod / chown + ls -la - the rwx model, no drift', () => {
    it('ls -la reads the wrong mode/owner off the incident file', () => {
      const { api, ssh } = onMsp();
      const out = unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n');

      // The bad deploy's state: readable only by root.
      expect(out).toContain('-rw-------');
      expect(out).toContain('root');
      expect(out).toContain('auth.env');
    });

    it('chmod writes the field ls -la reads - the listing follows it (no drift)', () => {
      const { world, api, ssh } = onMsp();

      expect(unix(api, ssh, 'chmod 640 /etc/fcauth/auth.env').lines).toEqual([]);
      // ls -la reflects the chmod - it reads the field the chmod wrote.
      expect(unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n'))
        .toContain('-rw-r-----');
      // And the field itself is the octal the chmod wrote.
      expect(world.engine.graph.getField(MSP_IDS.mspInfraAuthConfig, FIELDS.fsMode))
        .toBe('640');
    });

    it('chmod is symbolic too - g+r on 600 is 640', () => {
      const { api, ssh } = onMsp();
      unix(api, ssh, 'chmod g+r /etc/fcauth/auth.env');
      expect(unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n'))
        .toContain('-rw-r-----');
    });

    it('chown rewrites owner and group, and ls -la shows it', () => {
      const { api, ssh } = onMsp();
      unix(api, ssh, 'chown root:fcauth /etc/fcauth/auth.env');
      const out = unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n');
      expect(out).toContain('root');
      expect(out).toContain('fcauth');
    });

    it('chmod writes the real field - flip it and the listing changes (teeth)', () => {
      const { api, ssh } = onMsp();

      const before = unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n');
      expect(before).toContain('-rw-------');

      // A different mode gives a different listing - ls reads what chmod wrote,
      // not an invented column.
      unix(api, ssh, 'chmod 604 /etc/fcauth/auth.env');
      const after = unix(api, ssh, 'ls -la /etc/fcauth/auth.env').lines.join('\n');
      expect(after).toContain('-rw----r--');
      expect(after).not.toBe(before);
    });

    it('chown refuses a user the box does not have (the real error)', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'chown ghost:ghost /etc/fcauth/auth.env')
        .lines.join('\n')).toContain('invalid user');
    });

    it('chmod on a path the box does not hold is No such file', () => {
      const { api, ssh } = onMsp();
      expect(unix(api, ssh, 'chmod 640 /etc/nope/gone.env').lines.join('\n'))
        .toContain('No such file or directory');
    });
  });

  describe('the permission gate on systemctl restart', () => {
    it('restart is REFUSED while the file is unreadable, and the unit stays down', () => {
      const { world, api, ssh } = onMsp();

      // The unit is failed on the wrong permission.
      expect(world.engine.graph.getField(MSP_IDS.mspInfraAuthUnit, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.failed);

      const blocked = unix(api, ssh, 'systemctl restart fcauth').lines.join('\n');
      expect(blocked).toContain('Job for fcauth.service failed');
      // Not a retry: the unit is STILL failed, because the shell never dispatched.
      expect(world.engine.graph.getField(MSP_IDS.mspInfraAuthUnit, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.failed);
    });

    it('once the file is made readable, the SAME restart brings it up (teeth)', () => {
      const { world, api, ssh } = onMsp();

      // Fix the owner and the bits so the service account can read it.
      unix(api, ssh, 'chown root:fcauth /etc/fcauth/auth.env');
      unix(api, ssh, 'chmod 640 /etc/fcauth/auth.env');

      // Now the restart is silent-on-success and the unit comes up.
      expect(unix(api, ssh, 'systemctl restart fcauth').lines).toEqual([]);
      expect(world.engine.graph.getField(MSP_IDS.mspInfraAuthUnit, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
    });

    it('a healthy file has no block - the gate is the wrong-mode, nothing else', () => {
      const { world, api, ssh } = onMsp();

      // Flip the file healthy from the start: no wrong mode to diagnose.
      world.engine.applySetup([
        {
          op: 'setField',
          id: MSP_IDS.mspInfraAuthConfig,
          field: FIELDS.fsGroup,
          value: 'fcauth',
        },
        {
          op: 'setField',
          id: MSP_IDS.mspInfraAuthConfig,
          field: FIELDS.fsMode,
          value: '640',
        },
      ]);

      expect(unix(api, ssh, 'systemctl restart fcauth').lines).toEqual([]);
      expect(world.engine.graph.getField(MSP_IDS.mspInfraAuthUnit, FIELDS.unitState))
        .toBe(SYSTEMD_STATES.activeRunning);
    });
  });
});

/* ========================================================================= *
 * 0.27.0: the distro as dialect - the same mechanics, the other verb.
 * ========================================================================= */

/**
 * A promoted engineer who has put a distro on their OWN box, standing on it.
 *
 * The box is the machine the player's account owns (FC-DESK-07 at the MSP), and
 * the ONLY thing that makes it reachable is the install: the world still holds
 * it as the Windows workstation it was seeded as, because a desktop and a
 * distro are shell state and no golden may move for chrome.
 */
function onOwnBox(distro: DistroId): OnMsp {
  const world = createWorldSession(MSP_CARRY);
  const api = apiFor(world);
  earnPromotion(world);
  win(api, 'promotion accept');
  // The desktop the distro ships, or - for the one that ships none - the
  // desktop the player was made to pick. Which one is irrelevant to every
  // assertion below: a skin is chrome and the dialect is the distro's.
  api.appState.patch('desktop', {
    skin: distroById(distro).defaultDesktop ?? 'xfce',
    distro,
  });
  const ssh = connect(api, 'ssh engineer@FC-DESK-07');

  if (ssh === null) {
    throw new Error('ssh did not open a session on the player\'s own box');
  }

  return { world, api, ssh };
}

describe('the distro axis: apt, dnf, and the box that speaks one (0.27.0)', () => {
  it('TEETH: the box is only ssh-able once Linux is actually on it', () => {
    const world = createWorldSession(MSP_CARRY);
    const api = apiFor(world);
    earnPromotion(world);
    win(api, 'promotion accept');

    // Before the install: the issued box is a Windows workstation and says so
    // in openssh's own words. Revert the shell's half of `isLinuxHost` and this
    // is the assertion that stops passing.
    const refused = win(api, 'ssh engineer@FC-DESK-07').lines.join('\n');
    expect(refused).toContain('Connection refused');
    expect(refused).toContain('does not run sshd');
    expect(win(api, 'ssh engineer@FC-DESK-07').enterSession).toBeUndefined();

    // After it: the same box, the same world, a machine that answers on 22.
    api.appState.patch('desktop', { skin: 'gnome', distro: 'ubuntu' });
    expect(connect(api, 'ssh engineer@FC-DESK-07')).not.toBeNull();

    // And the world is untouched by any of it: the machine is still seeded
    // exactly as it was, which is what keeps every golden byte-identical.
    expect(api.graph.getField(MSP_IDS.playerMachine, FIELDS.machineOs))
      .toBe(MACHINE_OS.windows);
  });

  it('speaks apt on the Debian family, and dnf is simply not there', () => {
    const { api, ssh } = onOwnBox('mint');

    expect(unix(api, ssh, 'apt list --upgradable').lines[0])
      .toBe('Listing... Done');
    const wrong = unix(api, ssh, 'sudo dnf check-update').lines.join('\n');
    expect(wrong).toContain('dnf: command not found');
    expect(wrong).toContain('This box speaks apt');
  });

  it('speaks dnf on Fedora, and apt and dpkg are simply not there', () => {
    const { api, ssh } = onOwnBox('fedora');

    for (const line of ['sudo apt update', 'apt list --upgradable', 'dpkg -l']) {
      const out = unix(api, ssh, line).lines.join('\n');
      expect(out, line).toContain('command not found');
      expect(out, line).toContain('This box speaks dnf');
    }
  });

  it('every server on the estate still speaks apt, exactly as it did', () => {
    // The axis reaches the player's OWN box and nothing else: a customer's
    // server is the Ubuntu the world seeds it as, whatever the player has
    // installed on their desk.
    const { api, ssh } = onMsp();
    expect(unix(api, ssh, 'apt list --upgradable').lines[0])
      .toBe('Listing... Done');
    expect(unix(api, ssh, 'dnf check-update').lines.join('\n'))
      .toContain('dnf: command not found');
  });

  it('dnf install closes the same gag apt closes, in dnf\'s own words', () => {
    const { api, ssh } = onOwnBox('fedora');

    // The gag, hinted in the box's dialect rather than Ubuntu's.
    const gagged = unix(api, ssh, 'htop').lines;
    expect(gagged[0]).toBe('Command \'htop\' not found, but can be installed with:');
    expect(gagged[1]).toBe('sudo dnf install htop');

    // Privileged, in dnf's own refusal rather than apt's dpkg lock.
    expect(unix(api, ssh, 'dnf install htop').lines.join('\n'))
      .toContain('superuser privileges');

    const install = unix(api, ssh, 'sudo dnf install htop').lines.join('\n');
    expect(install).toContain('Dependencies resolved.');
    expect(install).toContain('Installing:');
    expect(install).toContain('htop-3.3.0-4.fc41.x86_64');
    expect(install).toContain('Complete!');

    // The SAME field on the SAME box: one truth, two dialects reading it.
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual(['htop']);
    // And the gag is closed - htop runs now.
    expect(unix(api, ssh, 'htop').lines.join('\n')).toContain('Tasks:');
    expect(unix(api, ssh, 'sudo dnf install htop').lines.join('\n'))
      .toContain('is already installed');
    expect(unix(api, ssh, 'sudo dnf install cowsay').lines.join('\n'))
      .toContain('No match for argument: cowsay');
  });

  it('dnf check-update lists what is pending, and goes SILENT once it is not', () => {
    const { api, ssh } = onOwnBox('fedora');

    const pending = unix(api, ssh, 'dnf check-update').lines;
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.join('\n')).toContain('openssl-libs.x86_64');

    // Privileged, and it writes the same flag apt upgrade writes.
    expect(unix(api, ssh, 'dnf upgrade').lines.join('\n'))
      .toContain('superuser privileges');
    const upgrade = unix(api, ssh, 'sudo dnf upgrade').lines.join('\n');
    expect(upgrade).toContain('Upgrading:');
    expect(upgrade).toContain('Complete!');
    expect(api.graph.getField(ssh.hostId, FIELDS.updatesApplied)).toBe(true);

    // A patched box's `dnf check-update` prints NOTHING, which is what a real
    // one does - the same family beat `systemctl restart` teaches.
    expect(unix(api, ssh, 'dnf check-update').lines).toEqual([]);
    expect(unix(api, ssh, 'sudo dnf upgrade').lines.join('\n'))
      .toContain('Nothing to do.');
  });

  it('is deterministic: the same box answers the same way every time', () => {
    const { api, ssh } = onOwnBox('fedora');
    const first = unix(api, ssh, 'dnf check-update').lines.join('\n');
    const second = unix(api, ssh, 'dnf check-update').lines.join('\n');

    expect(first).toBe(second);
  });
});

/* ========================================================================= *
 * 0.28.0: four more distros - zypper, pacman, the yum alias, and Debian's
 * temperament. Dialect as DATA over the one package engine.
 * ========================================================================= */

/** The verb each family's box speaks, keyed by the binary a player might type. */
const FAMILY_VERBS: Readonly<Record<PackageManager, string>> = {
  apt: 'apt list --upgradable',
  dnf: 'dnf check-update',
  zypper: 'zypper list-updates',
  pacman: 'pacman -Qu',
};

describe('the refusal matrix: one family per box, in both directions', () => {
  it('answers exactly one package manager and misses every other one', () => {
    // The sharpest thing the axis has, asserted as a MATRIX rather than as
    // four hand-written pairs: for every distro, the box runs its own verb and
    // does not have anybody else's - and the miss names the verb it DOES have,
    // so an engineer who typed the wrong one is told which is right. Adding a
    // fifth family with no wiring at the seam fails here rather than shipping
    // a binary that silently answers on every box.
    for (const distro of DISTROS) {
      const { api, ssh } = onOwnBox(distro.id);
      const mine = distro.packageManager;

      expect(
        unix(api, ssh, FAMILY_VERBS[mine]).lines.join('\n'),
        `${distro.id} runs ${mine}`,
      ).not.toContain('command not found');

      for (const other of Object.keys(FAMILY_VERBS) as PackageManager[]) {
        if (other === mine) {
          continue;
        }

        const out = unix(api, ssh, FAMILY_VERBS[other]).lines.join('\n');
        expect(out, `${distro.id} has no ${other}`)
          .toContain(`${other}: command not found`);
        expect(out, `${distro.id} points at ${mine}`)
          .toContain(`This box speaks ${mine}`);
      }

      // dpkg rides with apt: it is the Debian family's inventory tool and
      // nobody else's, which is why it is in the matrix rather than beside it.
      const dpkg = unix(api, ssh, 'dpkg -l').lines.join('\n');
      expect(dpkg.includes('command not found'), `${distro.id} dpkg`)
        .toBe(mine !== 'apt');
    }
  });

  it('leaves every server on the estate on apt, whatever the desk runs', () => {
    // The axis reaches the player's OWN box and nothing else. A customer's
    // server is the Ubuntu the world seeds it as even when the player is
    // sitting on Arch, because the world was never touched.
    const own = onOwnBox('arch');
    expect(unix(own.api, own.ssh, 'pacman -Qu').lines.join('\n'))
      .not.toContain('command not found');

    const { api, ssh } = onMsp();
    expect(unix(api, ssh, 'apt list --upgradable').lines[0])
      .toBe('Listing... Done');
    for (const verb of ['zypper list-updates', 'pacman -Qu', 'yum check-update']) {
      expect(unix(api, ssh, verb).lines.join('\n'), verb)
        .toContain('command not found');
    }
  });

  it('hints the gagged tools in each box\'s own install verb', () => {
    // The teaching half of the not-installed gag, per family. Arch is the one
    // that is not `<manager> install`: a hint offering "pacman install htop"
    // would be teaching a line that does not work.
    const hints: Readonly<Record<PackageManager, string>> = {
      apt: 'sudo apt install htop',
      dnf: 'sudo dnf install htop',
      zypper: 'sudo zypper install htop',
      pacman: 'sudo pacman -S htop',
    };

    for (const distro of DISTROS) {
      const { api, ssh } = onOwnBox(distro.id);
      expect(unix(api, ssh, 'htop').lines[1], distro.id)
        .toBe(hints[distro.packageManager]);
    }
  });
});

/**
 * Debian and Ubuntu speak the same apt and are not the same machine (0.28.0).
 *
 * The first cut of this row shipped SAMENESS - a Debian box printing
 * `archive.ubuntu.com`, the suite `noble` and `-0ubuntu3.4` version strings -
 * gated by a test that asserted the two boxes answered byte-identically. The
 * mechanics being identical was right; the OUTPUT being identical was a
 * factually wrong box, and a byte-identical gate is the one shape that could
 * never notice.
 *
 * So the gate is now per-dialect SHAPE, and it is two-sided on purpose: each box
 * must print its own archives, suites and versions, and must print NONE of the
 * other's. Either dialect drifting into the other reds here - which is exactly
 * the failure the old test was written to prevent, caught in the direction it
 * actually happened.
 */
describe('Debian and Ubuntu: one apt, two sets of words', () => {
  /** Every string that only a box on this distribution should ever print. */
  const DIALECT_TELLS: Readonly<Record<'ubuntu' | 'debian', readonly string[]>> = {
    ubuntu: [
      'archive.ubuntu.com',
      'security.ubuntu.com',
      'noble',
      'libssl3t64',
      '0ubuntu',
      'universe',
    ],
    debian: [
      'deb.debian.org',
      'security.debian.org',
      'bookworm',
      'deb12u',
    ],
  };

  const APT_SURFACE: readonly string[] = [
    'apt list --upgradable',
    'sudo apt update',
    'dpkg -l',
    'sudo apt install htop',
    'sudo apt upgrade',
  ];

  function transcript(distro: 'ubuntu' | 'debian'): string {
    const box = onOwnBox(distro);

    return APT_SURFACE
      .map((line) => unix(box.api, box.ssh, line).lines.join('\n'))
      .join('\n');
  }

  it('prints its own archives, suites and versions, and never the other\'s', () => {
    for (const distro of ['ubuntu', 'debian'] as const) {
      const other = distro === 'ubuntu' ? 'debian' : 'ubuntu';
      const said = transcript(distro);

      for (const tell of DIALECT_TELLS[distro]) {
        expect(said, `${distro} says ${tell}`).toContain(tell);
      }

      for (const tell of DIALECT_TELLS[other]) {
        expect(said, `${distro} must not say ${tell}`).not.toContain(tell);
      }
    }
  });

  it('keeps the MECHANICS one engine under the two vocabularies', () => {
    // The half the old sameness test was right about, asserted where it is
    // actually true: the same derived pending SET (same count, same security
    // row at the front), the same install writing the same field, the same
    // patched-clean answer afterwards. A second apt engine reds here.
    const debian = onOwnBox('debian');
    const ubuntu = onOwnBox('ubuntu');
    const rows = (box: typeof debian): readonly string[] => unix(
      box.api,
      box.ssh,
      'apt list --upgradable',
    ).lines.slice(1);

    expect(rows(debian)).toHaveLength(rows(ubuntu).length);
    expect(rows(debian)[0]).toContain('security');
    expect(rows(ubuntu)[0]).toContain('security');

    for (const box of [debian, ubuntu]) {
      expect(unix(box.api, box.ssh, 'sudo apt install htop').lines.join('\n'))
        .toContain('The following NEW packages will be installed:');
      expect(readInstalledPackages(
        box.api.graph.getField(box.ssh.hostId, FIELDS.installedPackages),
      )).toEqual(['htop']);

      unix(box.api, box.ssh, 'sudo apt upgrade');
      expect(unix(box.api, box.ssh, 'apt list --upgradable').lines)
        .toEqual(['Listing... Done']);
    }

    // And the box really is on Debian rather than relabelled: it is the pairing
    // and the manager that the axis carries, and both read Debian's.
    expect(debian.api.appState.get().desktop.distro).toBe('debian');
    expect(distroById('debian').packageManager).toBe('apt');
  });

  it('says the same thing about one package on both of its surfaces', () => {
    // The contradiction a per-dialect table can produce and a sameness test
    // never could: `apt install` printing bookworm's htop while `dpkg -l` lists
    // Ubuntu's, on the same box, four lines apart.
    const { api, ssh } = onOwnBox('debian');
    const install = unix(api, ssh, 'sudo apt install htop').lines.join('\n');
    const listed = unix(api, ssh, 'dpkg -l').lines
      .find((line) => line.includes('htop')) ?? '';

    expect(install).toContain('3.2.2-2');
    expect(listed).toContain('3.2.2-2');
  });

  it('leaves Mint on Ubuntu\'s archives, because Mint IS Ubuntu\'s', () => {
    const { api, ssh } = onOwnBox('mint');

    expect(unix(api, ssh, 'sudo apt update').lines.join('\n'))
      .toContain('archive.ubuntu.com');
  });
});

describe('zypper: openSUSE\'s words over the same engine', () => {
  it('installs in zypper\'s own shape, and closes the same gag', () => {
    const { api, ssh } = onOwnBox('opensuse');

    // Privileged, in zypper's own sentence - which names what it wanted the
    // privilege FOR, unlike apt's dpkg lock and dnf's flat refusal.
    expect(unix(api, ssh, 'zypper install htop').lines.join('\n'))
      .toContain('Root privileges are required for installing');

    const install = unix(api, ssh, 'sudo zypper install htop').lines.join('\n');
    expect(install).toContain('The following NEW package is going to be installed:');
    expect(install).toContain('Continue? [y/n/v/...? shows all options] (y): y');
    expect(install).toContain('htop-3.3.0-150600.1.4.x86_64');
    expect(install).toContain('[done]');

    // The SAME field on the SAME box, and the gag closed by it.
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual(['htop']);
    expect(unix(api, ssh, 'htop').lines.join('\n')).toContain('Tasks:');

    // Already installed, and a name the repos do not have - both in zypper's
    // own two-step miss rather than apt's or dnf's.
    expect(unix(api, ssh, 'sudo zypper install htop').lines.join('\n'))
      .toContain("'htop' is already installed.");
    const miss = unix(api, ssh, 'sudo zypper install cowsay').lines.join('\n');
    expect(miss).toContain("'cowsay' not found in package names.");
    expect(miss).toContain("No provider of 'cowsay' found.");
  });

  it('refreshes, lists and updates off the one derived pending set', () => {
    const { api, ssh } = onOwnBox('opensuse');

    expect(unix(api, ssh, 'zypper refresh').lines.join('\n'))
      .toContain('Root privileges are required for refreshing');
    const refresh = unix(api, ssh, 'sudo zypper refresh').lines.join('\n');
    expect(refresh).toContain('All repositories have been refreshed.');
    expect(refresh).toContain("Run 'zypper list-updates' to see them.");

    // The list, with SUSE's own names in it: libopenssl3 rather than Debian's
    // libssl3t64, and `timezone` rather than tzdata, which is the tell anybody
    // who has run one of these boxes knows.
    const list = unix(api, ssh, 'zypper list-updates').lines.join('\n');
    expect(list).toContain('Available Version');
    expect(list).toContain('libopenssl3');
    expect(list).not.toContain('libssl3t64');

    // TEETH (`zypperFromIsNotTo`): every row's CURRENT version differs from its
    // AVAILABLE one. Found as a real defect while writing this file - the
    // first cut rolled back the last component of a Leap version, which is the
    // build number and is `.1` on every string in the table, so the whole
    // column silently printed the version it was upgrading TO. A table that
    // says a package is upgrading from itself is a lie that looks entirely
    // plausible, and no other assertion here would have caught it.
    const rows = unix(api, ssh, 'zypper list-updates').lines
      .filter((line) => line.startsWith('v |'));

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const [, , , from, available] = row
        .split('|')
        .map((cell) => cell.trim());

      expect(from, row).toBeTruthy();
      expect(from, row).not.toBe(available);
    }

    // Privileged, and it writes the SAME flag apt upgrade and dnf upgrade write.
    expect(unix(api, ssh, 'zypper update').lines.join('\n'))
      .toContain('Root privileges are required');
    const update = unix(api, ssh, 'sudo zypper update').lines.join('\n');
    expect(update).toContain('going to be upgraded:');
    expect(update).toContain('[done]');
    expect(api.graph.getField(ssh.hostId, FIELDS.updatesApplied)).toBe(true);

    // And afterwards both halves read clean, in zypper's words rather than
    // dnf's silence - which is what the real one does.
    expect(unix(api, ssh, 'zypper list-updates').lines.join('\n'))
      .toContain('No updates found.');
    expect(unix(api, ssh, 'sudo zypper update').lines.join('\n'))
      .toContain('Nothing to do.');
    expect(unix(api, ssh, 'sudo zypper refresh').lines.join('\n'))
      .toContain('No updates found.');
  });

  it('answers its real two-letter aliases and names its verbs otherwise', () => {
    const { api, ssh } = onOwnBox('opensuse');

    expect(unix(api, ssh, 'zypper lu').lines.join('\n'))
      .toBe(unix(api, ssh, 'zypper list-updates').lines.join('\n'));
    expect(unix(api, ssh, 'sudo zypper ref').lines.join('\n'))
      .toBe(unix(api, ssh, 'sudo zypper refresh').lines.join('\n'));
    expect(unix(api, ssh, 'zypper dup').lines.join('\n'))
      .toContain('is not something this terminal does');
  });
});

describe('pacman: Arch, spelled in flags', () => {
  it('installs with -S, and reinstalls rather than shrugging', () => {
    const { api, ssh } = onOwnBox('arch');

    expect(unix(api, ssh, 'pacman -S htop').lines.join('\n'))
      .toContain('you cannot perform this operation unless you are root');
    expect(unix(api, ssh, 'sudo pacman -S cowsay').lines.join('\n'))
      .toBe('error: target not found: cowsay');

    const install = unix(api, ssh, 'sudo pacman -S htop').lines.join('\n');
    expect(install).toContain('resolving dependencies...');
    expect(install).toContain('Packages (1) htop-3.3.0-1');
    expect(install).toContain('installing htop...');
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual(['htop']);
    expect(unix(api, ssh, 'htop').lines.join('\n')).toContain('Tasks:');

    // pacman has no "already the newest version": it warns and reinstalls, so
    // that is what this says rather than an apt sentence in Arch's mouth.
    const again = unix(api, ssh, 'sudo pacman -S htop').lines.join('\n');
    expect(again).toContain('warning: htop-3.3.0-1 is up to date -- reinstalling');
    expect(again).toContain('reinstalling htop...');
  });

  it('TEETH: the flags are case-sensitive, so -s is not -S', () => {
    // The one place the unix grammar is not case-insensitive, and the reason
    // it is read off the raw argument rather than the parser's lower-cased
    // sub-command. `-s` is pacman's SEARCH; an install here would be the worst
    // answer a package manager can give. Read the raw flag through the real
    // parse rather than calling the dialect directly - the lower-casing this
    // forbids happens IN the parse.
    const { api, ssh } = onOwnBox('arch');
    const wrong = unix(api, ssh, 'sudo pacman -s htop').lines.join('\n');

    expect(wrong).toContain('is not something this terminal does');
    expect(wrong).toContain('The capitals matter.');
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual([]);
  });

  it('syncs on every -Syu, and upgrades through the shared verb', () => {
    const { api, ssh } = onOwnBox('arch');

    expect(unix(api, ssh, 'pacman -Syu').lines.join('\n'))
      .toContain('you cannot perform this operation unless you are root');

    const upgrade = unix(api, ssh, 'sudo pacman -Syu').lines.join('\n');
    expect(upgrade).toContain(':: Synchronising package databases...');
    expect(upgrade).toContain(':: Starting full system upgrade...');
    expect(upgrade).toContain('upgrading openssl...');
    expect(api.graph.getField(ssh.hostId, FIELDS.updatesApplied)).toBe(true);

    // The rolling beat, and the honest one: the SYNC still runs on a box with
    // nothing to do, because the repositories moved this morning the way they
    // move every morning - you just happen to be level with them today.
    const clean = unix(api, ssh, 'sudo pacman -Syu').lines;
    expect(clean[0]).toBe(':: Synchronising package databases...');
    expect(clean.join('\n')).toContain(':: Starting full system upgrade...');
    expect(clean.at(-1)).toBe(' there is nothing to do');
  });

  it('-Q reads the box, and -Qu reads what it is behind on', () => {
    const { api, ssh } = onOwnBox('arch');

    // -Qu is the read half, in pacman's own `name old -> new` shape.
    const behind = unix(api, ssh, 'pacman -Qu').lines;
    expect(behind.length).toBeGreaterThan(0);
    expect(behind[0]).toBe('openssl 3.3.1-1 -> 3.3.2-1');

    // -Q is the inventory: name and version, no legend, nothing else - and the
    // packages it is BEHIND on list at the version it is behind AT.
    const before = unix(api, ssh, 'pacman -Q').lines;
    expect(before).toContain('linux 6.11.5-1');
    expect(before).toContain('openssl 3.3.1-1');
    expect(before).not.toContain('htop 3.3.0-1');
    expect(before.every((line) => /^[a-z0-9-]+ \S+$/u.test(line))).toBe(true);

    // The two surfaces agree off the one field, both ways round: an install
    // shows up here, and an upgrade moves the version.
    unix(api, ssh, 'sudo pacman -S htop');
    unix(api, ssh, 'sudo pacman -Syu');
    const after = unix(api, ssh, 'pacman -Q').lines;
    expect(after).toContain('htop 3.3.0-1');
    expect(after).toContain('openssl 3.3.2-1');
    expect(after).not.toContain('openssl 3.3.1-1');
    // And a box with nothing behind prints NOTHING for -Qu, as the real one does.
    expect(unix(api, ssh, 'pacman -Qu').lines).toEqual([]);
  });

  it('sorts -Q, so the inventory is a list and not an accident', () => {
    const { api, ssh } = onOwnBox('arch');
    const listed = unix(api, ssh, 'pacman -Q').lines;

    expect(listed).toEqual([...listed].sort((left, right) => (
      left.localeCompare(right)
    )));
  });
});

describe('yum: the muscle memory, redirected', () => {
  it('answers as dnf, on the same box and the same field', () => {
    const { api, ssh } = onOwnBox('rhel');

    const check = unix(api, ssh, 'yum check-update').lines;
    expect(check[0]).toBe("Redirecting to '/usr/bin/dnf check-update'");
    // Everything after the redirect is dnf's answer, byte for byte.
    expect(check.slice(1))
      .toEqual(unix(api, ssh, 'dnf check-update').lines);

    // And it is not a read-only impersonation: it installs through the same
    // action, into the same set, closing the same gag.
    expect(unix(api, ssh, 'yum install htop').lines.join('\n'))
      .toContain('superuser privileges');
    const install = unix(api, ssh, 'sudo yum install htop').lines;
    expect(install[0]).toBe("Redirecting to '/usr/bin/dnf install htop'");
    expect(install.join('\n')).toContain('Complete!');
    expect(readInstalledPackages(
      api.graph.getField(ssh.hostId, FIELDS.installedPackages),
    )).toEqual(['htop']);

    expect(unix(api, ssh, 'sudo yum upgrade').lines.join('\n'))
      .toContain('Upgrading:');
    expect(api.graph.getField(ssh.hostId, FIELDS.updatesApplied)).toBe(true);
  });

  it('is on every dnf box and on no other family\'s', () => {
    const fedora = onOwnBox('fedora');
    expect(unix(fedora.api, fedora.ssh, 'yum check-update').lines[0])
      .toBe("Redirecting to '/usr/bin/dnf check-update'");

    for (const distro of ['ubuntu', 'opensuse', 'arch'] as const) {
      const { api, ssh } = onOwnBox(distro);
      expect(unix(api, ssh, 'yum check-update').lines.join('\n'), distro)
        .toContain('yum: command not found');
    }
  });
});

describe('subscription-manager: the register beat that gates nothing', () => {
  it('is a Red Hat binary, so only the Red Hat box has it', () => {
    const { api, ssh } = onOwnBox('rhel');
    expect(unix(api, ssh, 'subscription-manager status').lines.join('\n'))
      .toContain('Overall Status: Disabled');

    // Fedora speaks dnf and has never shipped this, which is the one place the
    // distro and the package manager genuinely come apart - so the check is on
    // the DISTRO, and this is the assertion that keeps it there.
    for (const distro of ['fedora', 'ubuntu', 'opensuse', 'arch'] as const) {
      const other = onOwnBox(distro);
      expect(
        unix(other.api, other.ssh, 'subscription-manager status').lines.join('\n'),
        distro,
      ).toContain('subscription-manager: command not found');
    }
  });

  it('TEETH: registering fails and NOTHING on the box depends on it', () => {
    const { api, ssh } = onOwnBox('rhel');

    const register = unix(api, ssh, 'subscription-manager register').lines.join('\n');
    expect(register).toContain('Registering to: subscription.rhsm.redhat.com');
    expect(register).toContain('Unable to register');

    // The whole point: dnf works exactly as well after the failure as before
    // it. If this ever became a gate, the install below would stop working and
    // this is the assertion that would say so.
    const install = unix(api, ssh, 'sudo dnf install htop').lines.join('\n');
    expect(install).toContain('Complete!');
    expect(unix(api, ssh, 'htop').lines.join('\n')).toContain('Tasks:');
    expect(unix(api, ssh, 'sudo dnf upgrade').lines.join('\n'))
      .toContain('Upgrading:');

    // And nothing was written by the register itself.
    expect(unix(api, ssh, 'subscription-manager list').lines.join('\n'))
      .toContain('Status:         Not Subscribed');
  });

  it('names its three verbs for anything else', () => {
    const { api, ssh } = onOwnBox('rhel');
    expect(unix(api, ssh, 'subscription-manager attach').lines.join('\n'))
      .toContain('is not something this terminal does');
  });
});

/* ========================================================================= *
 * 0.28.0 slice 3: SELinux enforcing on the RHEL family - one denial, on the
 * one box that can have it, and two fixes that both work and are not the same.
 * ========================================================================= */

/** The ids the beat's two nodes take on the player's own box at the MSP. */
const DESK_SELINUX = selinuxNodeIds('FC-DESK-07');

/** What the box answers a request for the mislabelled page with, in one line. */
function curlStatus(api: GameApi, ssh: SshSession): string {
  return unix(api, ssh, 'curl -I http://localhost/').lines[0] ?? '';
}

describe('SELinux: the mode a RHEL-family box is in (0.28.0)', () => {
  it('answers Enforcing on both RHEL-family distros, off the box\'s own field', () => {
    for (const distro of ['fedora', 'rhel'] as const) {
      const { api, ssh } = onOwnBox(distro);

      expect(unix(api, ssh, 'getenforce').lines, distro).toEqual(['Enforcing']);
      // A field on the machine and not a constant in the shell: the same read
      // `setenforce` writes, which is what makes the two verbs agree.
      expect(api.graph.getField(ssh.hostId, FIELDS.selinuxMode), distro)
        .toBe('enforcing');
    }
  });

  it('gives sestatus the fuller shape, and both mode lines', () => {
    const { api, ssh } = onOwnBox('rhel');
    const out = unix(api, ssh, 'sestatus').lines;

    expect(out[0]).toContain('SELinux status:');
    expect(out[0]).toContain('enabled');
    expect(out.join('\n')).toContain('Loaded policy name:');
    expect(out.join('\n')).toContain('targeted');
    expect(out.join('\n')).toContain('/sys/fs/selinux');
    // The two that are the point: what it is doing now, and what the config
    // file will make it do at the next boot.
    expect(out.some((line) => line.startsWith('Current mode:'))).toBe(true);
    expect(out.some((line) => line.startsWith('Mode from config file:')))
      .toBe(true);
  });

  it('is simply not there on any distro that does not ship it', () => {
    // The refusal matrix's sibling, and read off the DISTRO table rather than a
    // list here: exactly the rows whose security module is SELinux answer these
    // verbs, and every other box is a missing binary that names what it does
    // have instead. A new distro row wired wrong reds here.
    for (const distro of DISTROS) {
      const { api, ssh } = onOwnBox(distro.id);
      const mine = distro.securityModule === 'selinux';

      for (const verb of ['getenforce', 'sestatus', 'restorecon /etc/hosts',
        'sudo setenforce 0']) {
        const out = unix(api, ssh, verb).lines.join('\n');
        const name = verb.replace(/^sudo /u, '').split(' ')[0] ?? '';

        expect(out.includes(`${name}: command not found`), `${distro.id} ${verb}`)
          .toBe(!mine);

        if (mine) {
          continue;
        }

        expect(out, `${distro.id} ${verb} names what it has`).toContain(
          distro.securityModule === 'apparmor' ? 'AppArmor' : 'nothing else',
        );
      }
    }
  });

  it('is not on the estate\'s servers either, whatever the desk is running', () => {
    // The player on Fedora does not put SELinux on a customer's Ubuntu box:
    // the axis reaches the machine the player owns and no other.
    const own = onOwnBox('fedora');
    expect(unix(own.api, own.ssh, 'getenforce').lines).toEqual(['Enforcing']);

    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'getenforce').lines.join('\n');
    expect(out).toContain('getenforce: command not found');
    expect(out).toContain('AppArmor');
  });
});

describe('SELinux: the denial the rebuild left behind (0.28.0)', () => {
  it('builds the beat on the box the first time somebody logs into it', () => {
    // Nothing is seeded: the world holds the player's machine exactly as it
    // always did until an engineer stands on a RHEL-family install of it.
    const world = createWorldSession(MSP_CARRY);
    const api = apiFor(world);
    earnPromotion(world);
    win(api, 'promotion accept');

    expect(world.engine.graph.getNode(DESK_SELINUX.unit)).toBeUndefined();
    expect(world.engine.graph.getNode(DESK_SELINUX.file)).toBeUndefined();

    api.appState.patch('desktop', { skin: 'gnome', distro: 'fedora' });
    const ssh = connect(api, 'ssh engineer@FC-DESK-07');

    expect(ssh).not.toBeNull();
    expect(world.engine.graph.getNode(DESK_SELINUX.unit)?.kind).toBe('unit');
    expect(world.engine.graph.getNode(DESK_SELINUX.file)?.kind).toBe('file');
    // Up, not failed: nothing has crashed, and a failed unit on a box is an
    // active incident to everything that reads the estate.
    expect(world.engine.graph.getField(DESK_SELINUX.unit, FIELDS.unitState))
      .toBe(SYSTEMD_STATES.activeRunning);
  });

  it('is built once, however many times the box is logged into', () => {
    const { api, world } = onOwnBox('rhel');
    const before = world.engine.graph.getField(
      DESK_SELINUX.file,
      FIELDS.selinuxContext,
    );

    connect(api, 'ssh engineer@FC-DESK-07');
    connect(api, 'ssh engineer@FC-DESK-07');

    expect(world.engine.graph
      .neighbors(MSP_IDS.playerMachine, { direction: 'in', edgeKind: 'runs_on' })
      .filter((node) => node.kind === 'unit')).toHaveLength(1);
    expect(world.engine.graph.getField(DESK_SELINUX.file, FIELDS.selinuxContext))
      .toBe(before);
  });

  it('refuses the page while the permissions are visibly perfect', () => {
    const { api, ssh } = onOwnBox('fedora');

    // The refusal itself: up, answering, and answering 403 - not a 502 (nothing
    // is down behind it) and not a connection refused (nothing is off).
    const answer = unix(api, ssh, 'curl -I http://localhost/').lines;
    expect(answer[0]).toBe('HTTP/1.1 403 Forbidden');
    expect(answer[1]).toContain('Apache');
    expect(unix(api, ssh, 'systemctl status httpd').lines.join('\n'))
      .toContain('Active: active (running)');

    // And the trap: the permission columns are exactly right. Owner, group and
    // mode are all the ones that WOULD serve this file, which is why ls -la is
    // the wrong tool for this fault and why it is the first one everybody uses.
    const listed = unix(api, ssh, 'ls -la /var/www/html/index.html').lines[0]
      ?? '';
    expect(listed).toContain('-rw-r--r--');
    expect(listed).toContain('apache');
    expect(listed).not.toContain('user_home_t');
  });

  it('puts the diagnosis in the journal, in the kernel\'s own words', () => {
    const { api, ssh } = onOwnBox('fedora');
    const journal = unix(api, ssh, 'journalctl -u httpd').lines.join('\n');

    // The whole answer, already written down: the denial, both contexts, and
    // the enforcing flag that says it was refused rather than merely logged.
    expect(journal).toContain('avc:  denied  { read }');
    expect(journal).toContain('scontext=system_u:system_r:httpd_t:s0');
    expect(journal).toContain('tcontext=unconfined_u:object_r:user_home_t:s0');
    expect(journal).toContain('permissive=0');
    // And Apache's own line above it, which reads like a permission problem
    // and is the red herring this fault is famous for.
    expect(journal).toContain('AH00132: file permissions deny server access');
  });

  it('shows the label only when it is asked for it, which is ls -Z', () => {
    const { api, ssh } = onOwnBox('fedora');
    const plain = unix(api, ssh, 'ls -la /var/www/html').lines.join('\n');
    const labelled = unix(api, ssh, 'ls -laZ /var/www/html').lines.join('\n');

    expect(plain).not.toContain('user_home_t');
    expect(labelled).toContain('unconfined_u:object_r:user_home_t:s0');
    // Same row, same permissions: the label is a COLUMN beside them, not a
    // different reading of them.
    expect(labelled).toContain('-rw-r--r--');
  });

  it('TEETH: the fault IS the label field, and nothing else', () => {
    // Revert the denial - the file labelled what the policy says from the start
    // - and every assertion above has nothing to find: the page is served, and
    // the box is still enforcing while it serves it. If a 403 survived this, it
    // would be coming from somewhere other than the state the beat is about.
    const { api, ssh, world } = onOwnBox('fedora');

    world.engine.applySetup([{
      op: 'setField',
      id: DESK_SELINUX.file,
      field: FIELDS.selinuxContext,
      value: SELINUX_WEB_CONTEXT,
    }]);

    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);
  });

  it('TEETH: it is the ENFORCING half too - both gates, or no denial', () => {
    const { api, ssh, world } = onOwnBox('fedora');

    world.engine.applySetup([{
      op: 'setField',
      id: MSP_IDS.playerMachine,
      field: FIELDS.selinuxMode,
      value: 'permissive',
    }]);

    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');
    // And the label is still wrong, which is the difference between the two
    // fixes made visible in one assertion.
    expect(world.engine.graph.getField(DESK_SELINUX.file, FIELDS.selinuxContext))
      .toBe(SELINUX_RESTORED_CONTEXT);
  });
});

describe('SELinux: restorecon, the fix that changes one file (0.28.0)', () => {
  it('relabels to the POLICY\'s answer, and the page is served', () => {
    const { api, ssh, world } = onOwnBox('fedora');

    const out = unix(api, ssh, 'sudo restorecon -v /var/www/html/index.html')
      .lines.join('\n');

    expect(out).toContain('Relabeled /var/www/html/index.html');
    expect(out).toContain(`from ${SELINUX_RESTORED_CONTEXT}`);
    expect(out).toContain(`to ${SELINUX_WEB_CONTEXT}`);
    expect(world.engine.graph.getField(DESK_SELINUX.file, FIELDS.selinuxContext))
      .toBe(SELINUX_WEB_CONTEXT);

    // The goal, not the call: the thing the player wanted is now happening.
    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');
    // Nothing was restarted and nothing was switched off: the box is still
    // enforcing, which is the whole difference between this fix and the other.
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);
    expect(api.graph.getField(MSP_IDS.playerMachine, FIELDS.selinuxPermissiveAt))
      .toBeUndefined();
  });

  it('needs root, and changes nothing without it', () => {
    // Setting a context is a root operation on a real box, and this is the real
    // tool's own sentence for being asked to do it without one.
    const { api, ssh } = onOwnBox('fedora');

    expect(unix(api, ssh, 'restorecon -v /var/www/html/index.html').lines
      .join('\n')).toContain('Could not set context');
    expect(api.graph.getField(DESK_SELINUX.file, FIELDS.selinuxContext))
      .toBe(SELINUX_RESTORED_CONTEXT);
    expect(curlStatus(api, ssh)).toBe('HTTP/1.1 403 Forbidden');
  });

  it('is silent without -v, exactly as the real one is', () => {
    const { api, ssh } = onOwnBox('fedora');

    expect(unix(api, ssh, 'sudo restorecon /var/www/html/index.html').lines)
      .toEqual([]);
    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');
  });

  it('claims nothing when the label was already right', () => {
    // Run it twice. The second run changed nothing, so -v prints nothing - the
    // real tool reports files it RELABELLED, and a line claiming to have fixed
    // an already-correct file would be the terminal lying about its own work.
    const { api, ssh } = onOwnBox('fedora');
    unix(api, ssh, 'sudo restorecon -v /var/www/html/index.html');

    expect(unix(api, ssh, 'sudo restorecon -v /var/www/html/index.html').lines)
      .toEqual([]);
    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');
  });

  it('refuses a path the box does not hold, in lstat\'s own words', () => {
    const { api, ssh } = onOwnBox('fedora');

    expect(unix(api, ssh, 'sudo restorecon -v /srv/nothing/here').lines
      .join('\n')).toContain('No such file or directory');
  });
});

describe('SELinux: setenforce, the fix that changes the box (0.28.0)', () => {
  it('needs root, and changes nothing without it', () => {
    const { api, ssh } = onOwnBox('rhel');

    expect(unix(api, ssh, 'setenforce 0').lines)
      .toEqual(['setenforce: setenforce() failed']);
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);
    expect(api.graph.getField(MSP_IDS.playerMachine, FIELDS.selinuxPermissiveAt))
      .toBeUndefined();
  });

  it('works instantly, silently, and on the whole machine', () => {
    const { api, ssh } = onOwnBox('rhel');

    expect(unix(api, ssh, 'sudo setenforce 0').lines).toEqual([]);
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Permissive']);
    expect(curlStatus(api, ssh)).toBe('HTTP/2 200 ');

    // And the file is exactly as mislabelled as it was: nothing about the fault
    // was fixed, the box has stopped acting on labels.
    expect(api.graph.getField(DESK_SELINUX.file, FIELDS.selinuxContext))
      .toBe(SELINUX_RESTORED_CONTEXT);
    // sestatus says both halves: what it is doing, and what the config file
    // still says it should be doing at the next boot.
    const status = unix(api, ssh, 'sestatus').lines;
    expect(status.find((line) => line.startsWith('Current mode:')))
      .toContain('permissive');
    expect(status.find((line) => line.startsWith('Mode from config file:')))
      .toContain('enforcing');
  });

  it('is REMEMBERED - the minute it happened is on the box', () => {
    const { api, ssh, world } = onOwnBox('rhel');
    unix(api, ssh, 'sudo setenforce 0');

    expect(api.graph.getField(MSP_IDS.playerMachine, FIELDS.selinuxPermissiveAt))
      .toBe(world.engine.now());

    // Putting it back does not unhappen it. The report is about a control that
    // was off, and it was off.
    unix(api, ssh, 'sudo setenforce 1');
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);
    expect(api.graph.getField(MSP_IDS.playerMachine, FIELDS.selinuxPermissiveAt))
      .toBeTypeOf('number');
    // And the denial is back, because the label was never dealt with.
    expect(curlStatus(api, ssh)).toBe('HTTP/1.1 403 Forbidden');
  });

  it('takes the words too, and refuses anything that is neither', () => {
    const { api, ssh } = onOwnBox('rhel');

    expect(unix(api, ssh, 'sudo setenforce Permissive').lines).toEqual([]);
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Permissive']);
    expect(unix(api, ssh, 'sudo setenforce Enforcing').lines).toEqual([]);
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);

    const bad = unix(api, ssh, 'sudo setenforce maybe').lines.join('\n');
    expect(bad).toContain('invalid argument');
    expect(bad).toContain('[ Enforcing | Permissive | 1 | 0 ]');
    expect(unix(api, ssh, 'getenforce').lines).toEqual(['Enforcing']);
  });

  it('cannot be run on a box the player does not own', () => {
    // A customer's server is the Ubuntu the world seeds: there is no SELinux on
    // it to turn off, so the refusal is the missing binary rather than a
    // permission - and nothing is written to a machine somebody else owns.
    const { api, ssh } = onMsp();
    const out = unix(api, ssh, 'sudo setenforce 0').lines.join('\n');

    expect(out).toContain('setenforce: command not found');
    expect(out).toContain('AppArmor');
    expect(api.graph.getField(ssh.hostId, FIELDS.selinuxMode)).toBeUndefined();
    expect(api.graph.getField(ssh.hostId, FIELDS.selinuxPermissiveAt))
      .toBeUndefined();
  });
});

describe('SELinux: the box says so on the way in (0.28.0)', () => {
  it('prints the note-to-self while the mirror is refusing, and not after', () => {
    const { api, ssh } = onOwnBox('fedora');
    const banner = win(api, 'ssh engineer@FC-DESK-07').lines.join('\n');

    expect(banner).toContain('NOTE TO SELF');
    expect(banner).toContain('403');
    // It says the permissions look fine - which they do - and does not name the
    // answer. A banner that said "run restorecon" would be the game solving its
    // own puzzle in the greeting.
    expect(banner).toContain('permissions');
    expect(banner).not.toContain('restorecon');
    expect(banner).not.toContain('context');

    unix(api, ssh, 'sudo restorecon /var/www/html/index.html');
    expect(win(api, 'ssh engineer@FC-DESK-07').lines.join('\n'))
      .not.toContain('NOTE TO SELF');
  });

  it('says nothing at all on a box with no denial on it', () => {
    const ubuntu = onOwnBox('ubuntu');
    expect(win(ubuntu.api, 'ssh engineer@FC-DESK-07').lines.join('\n'))
      .not.toContain('NOTE TO SELF');

    const msp = onMsp();
    expect(win(msp.api, 'ssh pat@FC-RMM-01').lines.join('\n'))
      .not.toContain('NOTE TO SELF');
  });
});
