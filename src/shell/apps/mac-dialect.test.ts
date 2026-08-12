/**
 * The mac dialect, played (E5 slice 3, 0.33.0).
 *
 * 0.32.0 shipped the third OS family and refused it at the ssh seam, with the
 * reason written down: the terminal held exactly one unix dialect and it was
 * the Linux one, so a Mac session would have answered in systemd's, apt's and
 * SELinux's words. This is the slice that brought the dialect, so this suite
 * is the proof that the session it opens is HONEST - which is a different
 * claim from "the commands run".
 *
 * It drives the real path, the way `cmd-unix.test.ts` does: a real MSP world,
 * the promotion taken through the real dispatch, `ssh` typed at the terminal,
 * and every line run through `executeUnix(parseUnixCommand(...))`. The box is
 * MARLOWE-STUDIO's own MARL-WS-01, seeded by the shipped estate rather than
 * built here, because the question is what a player meets.
 *
 * Three things are asserted throughout, and they are the three that have teeth:
 *
 * - the launchctl verbs dispatch THE SAME registered actions systemctl's do,
 *   read off the engine's dispatch log rather than off the output, because a
 *   parallel implementation that printed the same words would pass any
 *   output-shaped assertion and be exactly the thing this slice must not be;
 * - every Linux-only answer is ABSENT from the Mac, not merely unrequested;
 * - every refusal is asserted by its exact words, because a refusal whose
 *   wording drifts is a refusal that has stopped teaching.
 */

import { describe, expect, it } from 'vitest';

import { PROMOTION_REPUTATION, SYSTEMD_ACTIONS } from '../../world/actions';
import {
  FIELDS,
  LAUNCHD_DOMAINS,
  MACHINE_OS,
  SYSTEMD_STATES,
} from '../../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { unitIdOn } from '../../world/services';
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
  executeUnix,
  parseUnixCommand,
  sessionFamily,
  type SshSession,
  unixPrompt,
} from './cmd-unix';
import type { GameApi } from './types';

/** The Mac the studio's senior designer sits at, and its Bonjour daemon. */
const MAC_HOST = 'MARL-WS-01';
const MDNS = 'com.apple.mDNSResponder';
const JAMF = 'com.jamf.management.daemon';
/** Adobe's login agent - the one job on the box that is NOT in the system domain. */
const ADOBE_AGENT = 'com.adobe.ARMDC.Communicator';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

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
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'msp',
    actor: MSP_IDS.player,
  };
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

/** The lines a unix command printed, joined the way the screen shows them. */
function out(api: GameApi, session: SshSession, input: string): string {
  return unix(api, session, input).lines.join('\n');
}

interface Rig {
  readonly world: WorldSession;
  readonly api: GameApi;
}

/** An MSP world with the promotion taken - the tier every ssh below needs. */
function promoted(): Rig {
  const world = createWorldSession(MSP_CARRY);
  const api = apiFor(world, new AppStateStore());

  world.engine.applySetup([{
    op: 'setField',
    id: MSP_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
  win(api, 'promotion accept');

  return { world, api };
}

/** Standing on the studio's Mac, through the real ssh. */
function onMac(): Rig & { readonly ssh: SshSession } {
  const rig = promoted();
  const ssh = win(rig.api, `ssh pat@${MAC_HOST}`).enterSession;

  if (ssh === undefined) {
    throw new Error('ssh did not open a session on the Mac');
  }

  return { ...rig, ssh };
}

/** Standing on the MSP's own Linux box, for the other side of every diff. */
function onLinux(): Rig & { readonly ssh: SshSession } {
  const rig = promoted();
  const ssh = win(rig.api, 'ssh pat@FC-RMM-01').enterSession;

  if (ssh === undefined) {
    throw new Error('ssh did not open a session on the Linux box');
  }

  return { ...rig, ssh };
}

/** The actions the engine was actually asked to run, newest last. */
function dispatched(api: GameApi): readonly string[] {
  return api.dispatchLog().filter((entry) => entry.ok).map((entry) => entry.id);
}

describe('the mac dialect: the session', () => {
  it('opens on a seeded Mac for an engineer, at the shipped estate', () => {
    const { ssh } = onMac();

    expect(ssh.hostname).toBe(MAC_HOST);
    expect(ssh.username).toBe('pat');
  });

  it('keeps the tier gate: the desk gets the same refusal it always did', () => {
    // The one predicate that did NOT move. ssh is the engineers' tier whatever
    // family is on the far end, so a service-desk player at the MSP is refused
    // for a Mac in the same words they are refused for a Linux server.
    const world = createWorldSession(MSP_CARRY);
    const api = apiFor(world, new AppStateStore());
    const result = win(api, `ssh pat@${MAC_HOST}`);

    expect(result.enterSession).toBeUndefined();
    expect(result.lines.join('\n'))
      .toContain('ssh: connect refused - this is not service-desk access.');
  });

  it('prompts the way zsh does, which is not the way bash does', () => {
    const { api, ssh } = onMac();
    const linux = onLinux();

    // macOS ships PS1="%n@%m %1~ %# " in /etc/zshrc: name, host, a SPACE, the
    // directory, and a percent. Debian's bash prompt is a colon and a dollar.
    // Nobody chose either one, which is exactly why they are worth knowing.
    expect(unixPrompt(ssh, sessionFamily(api, ssh)))
      .toBe(`pat@${MAC_HOST} ~ %`);
    expect(unixPrompt(linux.ssh, sessionFamily(linux.api, linux.ssh)))
      .toBe('pat@FC-RMM-01:~$');
  });

  it('says what it connected to, and never calls a designer\'s Mac a server', () => {
    const rig = promoted();
    const output = win(rig.api, `ssh pat@${MAC_HOST}`).lines.join('\n');

    expect(output).toContain('That is a Mac');
    expect(output).toContain('launchctl where systemctl would be');
    expect(output).not.toContain('The terminal is on the server');
  });

  it('reads the family off the box, not off the session', () => {
    const mac = onMac();
    const linux = onLinux();

    expect(sessionFamily(mac.api, mac.ssh)).toBe(MACHINE_OS.mac);
    expect(sessionFamily(linux.api, linux.ssh)).toBe(MACHINE_OS.linux);
  });
});

describe('launchctl: the third dialect column', () => {
  it('lists the loaded jobs in launchctl\'s own three columns', () => {
    const { api, ssh } = onMac();
    const lines = unix(api, ssh, 'launchctl list').lines;

    expect(lines[0]).toBe('PID\tStatus\tLabel');
    // Every seeded job, by its real reverse-DNS label, sorted the way the real
    // one reads - and a pid rather than a dash, because they are all running.
    expect(lines.slice(1).map((line) => line.split('\t')[2])).toEqual([
      'com.adobe.ARMDC.Communicator',
      'com.adobe.ARMDC.SMJobBlessHelper',
      MDNS,
      JAMF,
      'com.openssh.sshd',
    ]);

    for (const line of lines.slice(1)) {
      const [pid, status] = line.split('\t');

      expect(status).toBe('0');
      expect(Number(pid)).toBeGreaterThan(0);
    }

    // Not a unit name anywhere: the whole point of the label style.
    expect(lines.join('\n')).not.toContain('.service');
  });

  it('prints one job as the real block, off the domain the world holds', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, `launchctl print system/${MDNS}`);

    expect(output).toContain(`system/${MDNS} = {`);
    expect(output).toContain('\tstate = running');
    // The plist path is derived by the real convention, and the DOMAIN is what
    // decides it: a daemon lives under LaunchDaemons.
    expect(output).toContain(`\tpath = /Library/LaunchDaemons/${MDNS}.plist`);
    expect(output).toContain('\tpid = ');
    expect(output).toContain('\tlast exit code = 0');
    expect(output.endsWith('}')).toBe(true);
  });

  it('puts an AGENT in the gui domain, and under LaunchAgents', () => {
    const { api, ssh } = onMac();
    const output = out(
      api,
      ssh,
      `launchctl print ${LAUNCHD_DOMAINS.gui}/${ADOBE_AGENT}`,
    );

    // The daemon/agent split, which is the half of a launchd job that has no
    // systemd cousin: Adobe's Communicator is an agent in the login session
    // and its own privileged helper is a root daemon, same prefix, two domains.
    expect(output).toContain(`${LAUNCHD_DOMAINS.gui}/${ADOBE_AGENT} = {`);
    expect(output).toContain(`/Library/LaunchAgents/${ADOBE_AGENT}.plist`);
  });

  it('fails on the wrong domain, in launchctl\'s own sentence', () => {
    const { api, ssh } = onMac();

    // TEETH on the domain being DATA rather than decoration: asking for the
    // agent in the system domain does not quietly work.
    expect(out(api, ssh, `launchctl print system/${ADOBE_AGENT}`))
      .toBe(`Could not find service "${ADOBE_AGENT}" in domain for system`);
    expect(out(api, ssh, `launchctl print ${LAUNCHD_DOMAINS.gui}/${MDNS}`))
      .toBe(`Could not find service "${MDNS}" in domain for gui/501`);
    expect(out(api, ssh, 'launchctl print system/com.example.nothing'))
      .toBe('Could not find service "com.example.nothing" in domain for system');
  });

  it('refuses a bare label and says what a service target is', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, `launchctl print ${MDNS}`);

    expect(output).toContain('requires a service target, not a bare label');
    expect(output).toContain(`system/${MDNS}`);
    expect(output).toContain(`gui/501/${MDNS}`);
  });

  it('refuses the legacy pair by name rather than half-shipping it', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, `launchctl unload /Library/LaunchDaemons/${MDNS}.plist`);

    expect(output).toContain('launchctl: unrecognized subcommand: unload');
    expect(output).toContain('load and unload are the legacy pair');
  });
});

describe('launchctl reaches the SAME actions systemctl does', () => {
  /** The state of a job on the Mac, straight off the graph. */
  function stateOf(rig: Rig, label: string): unknown {
    return rig.world.engine.graph.getField(
      unitIdOn(MSP_IDS.marloweDesignMac, label),
      FIELDS.unitState,
    );
  }

  it('maps kickstart -k to unitRestart - the id, not a lookalike', () => {
    const rig = onMac();
    const before = dispatched(rig.api).length;

    const result = unix(rig.api, rig.ssh, `launchctl kickstart -k system/${JAMF}`);

    // Silent on success, exactly as systemctl restart is.
    expect(result.lines).toEqual([]);
    // THE assertion this slice exists for: the action REGISTERED in the world
    // is the one systemctl dispatches. A second implementation that printed
    // the same nothing would fail here, which is why it is read off the
    // dispatch log rather than off the screen.
    expect(dispatched(rig.api).slice(before)).toEqual([
      SYSTEMD_ACTIONS.unitRestart,
    ]);
  });

  it('maps bootout to unitStop and bootstrap to unitStart, and moves the world',
    () => {
      const rig = onMac();
      const target = `system/${JAMF}`;
      const plist = `/Library/LaunchDaemons/${JAMF}.plist`;

      expect(stateOf(rig, JAMF)).toBe(SYSTEMD_STATES.activeRunning);

      const gone = unix(rig.api, rig.ssh, `launchctl bootout ${target}`);

      expect(gone.lines).toEqual([]);
      expect(dispatched(rig.api).at(-1)).toBe(SYSTEMD_ACTIONS.unitStop);
      // The GOAL, not the call: the job is actually down, and every face of
      // the box agrees - `list` has no pid for it, `print` says not running.
      expect(stateOf(rig, JAMF)).not.toBe(SYSTEMD_STATES.activeRunning);
      expect(out(rig.api, rig.ssh, `launchctl print ${target}`))
        .toContain('state = not running');
      expect(out(rig.api, rig.ssh, 'launchctl list'))
        .toContain(`-\t0\t${JAMF}`);

      // And bootstrap puts it back, through the start verb, taking the PLIST
      // PATH rather than a target - which is the real asymmetry.
      const back = unix(rig.api, rig.ssh, `launchctl bootstrap system ${plist}`);

      expect(back.lines).toEqual([]);
      expect(dispatched(rig.api).at(-1)).toBe(SYSTEMD_ACTIONS.unitStart);
      expect(stateOf(rig, JAMF)).toBe(SYSTEMD_STATES.activeRunning);
    });

  it('maps a bare kickstart to unitStart, because -k is the kill half', () => {
    const rig = onMac();

    unix(rig.api, rig.ssh, `launchctl bootout system/${JAMF}`);
    const before = dispatched(rig.api).length;

    unix(rig.api, rig.ssh, `launchctl kickstart system/${JAMF}`);

    expect(dispatched(rig.api).slice(before)).toEqual([
      SYSTEMD_ACTIONS.unitStart,
    ]);
  });

  it('refuses bootstrap handed a service target, and says why', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, `launchctl bootstrap system/${JAMF}`);

    expect(output).toContain('does not take a service target');
    expect(output).toContain('bootout is the one that takes a target');
  });

  it('answers a plist the box has not got the way the real one does', () => {
    const { api, ssh } = onMac();
    const output = out(
      api,
      ssh,
      'launchctl bootstrap system /Library/LaunchDaemons/com.example.nope.plist',
    );

    expect(output).toContain('Bootstrap failed: 5: Input/output error');
  });

  it('runs the same guards the systemctl path runs - the wrong tenant wall', () => {
    // The contract governs a change over ssh whatever the dialect: the guards
    // are in the SHARED half, so a launchctl verb meets them rather than
    // slipping past a wall that was only ever written into systemctl's branch.
    const rig = onMac();

    rig.api.appState.setCustomerContext(MSP_CUSTOMERS.elmwood);
    const before = dispatched(rig.api).length;
    const output = out(rig.api, rig.ssh, `launchctl kickstart -k system/${JAMF}`);

    expect(output).toContain('STOP.');
    expect(output).toContain(MAC_HOST);
    // Teeth: nothing was dispatched at all.
    expect(dispatched(rig.api).slice(before)).toEqual([]);
  });
});

describe('log show: the third face of one log', () => {
  it('prints the real columns and the real count footer', () => {
    const { api, ssh } = onMac();
    const lines = unix(api, ssh, 'log show --last 1h').lines;

    expect(lines[0]).toContain('Timestamp');
    expect(lines[0]).toContain('Thread');
    expect(lines[0]).toContain('Activity');
    expect(lines[0]).toContain('TTL');
    expect(lines.join('\n')).toContain('Log      - Default:');
    // The window is not applied and the output says so rather than letting a
    // player believe a filter ran.
    expect(lines.join('\n')).toContain('--last 1h is the real flag');
  });

  it('never prints the Windows event log\'s sources on a Mac', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'log show');

    // The ruling behind the reader: the machine `event_log` field carries
    // Windows sources, and a Console face over them would be naming Service
    // Control Manager on a Mac - the exact lie the 0.32.0 audit exists to kill.
    expect(output).not.toContain('Service Control Manager');
    expect(output).not.toContain('Spooler');
  });

  it('refuses log stream, because this terminal cannot be interrupted', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'log stream');

    expect(output).toContain('log stream is a live tail');
    expect(output).toContain('"log show" is the read of the same log');
  });
});

describe('brew, and the tools this terminal will not fake', () => {
  it('says brew is not on a managed fleet Mac, and why that is true', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'brew install htop');

    expect(output).toContain('zsh: command not found: brew');
    expect(output).toContain('Homebrew is not part of macOS');
    expect(output).toContain('MDM-enrolled');
    // No fabricated package manager: nothing that reads as an install running.
    expect(output).not.toContain('Downloading');
    expect(output).not.toContain('Pouring');
  });

  it('does not claim a real macOS tool is missing', () => {
    const { api, ssh } = onMac();

    for (const name of ['open', 'pbcopy', 'softwareupdate', 'dscl', 'sw_vers']) {
      const output = out(api, ssh, name);

      // "command not found" would be a lie about a binary every Mac has, so
      // the refusal says the tool IS here and what it does.
      expect(output, name).toContain('is a real tool on this box');
      expect(output, name).not.toContain('command not found');
    }

    expect(out(api, ssh, 'softwareupdate --list'))
      .toContain('lists and installs Apple\'s own updates');
  });

  it('tells the whole truth about htop, which really is absent', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'htop');

    expect(output).toContain('zsh: command not found: htop');
    expect(output).toContain('htop is not part of macOS');
    expect(output).toContain('Activity Monitor');
  });
});

describe('the shared unix table, audited on a Mac', () => {
  it('df prints the BSD table, not the GNU one', () => {
    const mac = onMac();
    const linux = onLinux();
    const macOut = out(mac.api, mac.ssh, 'df -h');
    const linuxOut = out(linux.api, linux.ssh, 'df -h');

    expect(macOut).toContain('Capacity');
    expect(macOut).toContain('iused');
    expect(macOut).toContain('/dev/disk3s1s1');
    // The Linux answers must be absent, which is the half with teeth.
    expect(macOut).not.toContain('Use%');
    expect(macOut).not.toContain('/dev/root');
    // And the Linux box is untouched by any of it.
    expect(linuxOut).toContain('Use%');
    expect(linuxOut).toContain('/dev/root');
    expect(linuxOut).not.toContain('Capacity');
  });

  it('du reads a Mac\'s directories, and no journal that cannot exist', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'du -h /Users/pat');

    expect(output).toContain('/Users/pat/Library/Caches');
    expect(output).toContain('/Users/pat/Movies');
    // There is no journald on a Mac, so there is no /var/log/journal to eat a
    // disk - and a bare du stands in /Users, not /home.
    expect(output).not.toContain('/var/log/journal');
    expect(out(api, ssh, 'du -sh')).toContain('/Users/pat');
    expect(out(api, ssh, 'du -sh /home/pat')).not.toContain('/home/pat/Library');
  });

  it('ps aux says launchd is PID 1, and never systemd', () => {
    const mac = onMac();
    const linux = onLinux();
    const macOut = out(mac.api, mac.ssh, 'ps aux');

    expect(macOut).toContain('/sbin/launchd');
    expect(macOut).not.toContain('/sbin/init');
    // BSD's column words, and the job rows carry the labels the box holds.
    expect(macOut).toContain('STARTED');
    expect(macOut).not.toContain('START ');
    expect(macOut).toContain(MDNS);
    // The gui-domain agent runs as the logged-in user; the daemons run as root,
    // which is read off the domain rather than guessed off the label.
    const agentRow = macOut.split('\n').find((row) => row.includes(ADOBE_AGENT));
    const daemonRow = macOut.split('\n').find((row) => row.includes(JAMF));

    expect(agentRow?.startsWith('pat')).toBe(true);
    expect(daemonRow?.startsWith('root')).toBe(true);
    expect(out(linux.api, linux.ssh, 'ps aux')).toContain('/sbin/init');
  });

  it('ping is BSD ping: sequence from zero, stddev, no Linux wording', () => {
    const { api, ssh } = onMac();
    const bounded = out(api, ssh, 'ping -c 2 MARL-NAS-01');

    expect(bounded).toContain('56 data bytes');
    expect(bounded).toContain('icmp_seq=0');
    expect(bounded).toContain('round-trip min/avg/max/stddev');
    expect(bounded).not.toContain('56(84) bytes of data');
    expect(bounded).not.toContain('mdev');

    // Continuous on both families - the mechanic carries - and it says which
    // ping it is, because the two behave the same and print differently.
    expect(out(api, ssh, 'ping MARL-NAS-01')).toContain('This is BSD ping');
    expect(out(api, ssh, 'ping nowhere-at-all'))
      .toBe('ping: cannot resolve nowhere-at-all: Unknown host');
  });

  it('ifconfig and netstat are the base system here, not an apt away', () => {
    const { api, ssh } = onMac();
    const ifconfig = out(api, ssh, 'ifconfig');

    // On Ubuntu these are a not-installed gag pointing at ip/ss. On a Mac they
    // are the canonical tools and they RUN, with no package and no hint.
    expect(ifconfig).toContain('en0: flags=8863');
    expect(ifconfig).toContain('netmask 0xffffff00');
    expect(ifconfig).not.toContain('eth0');
    expect(ifconfig).not.toContain('not found');

    const netstat = out(api, ssh, 'netstat -an');

    expect(netstat).toContain('(state)');
    expect(netstat).toContain('tcp4');
    // BSD writes host.PORT with a dot; the sshd on this box is the proof.
    expect(netstat).toContain('*.22');
    expect(netstat).not.toContain('0.0.0.0:22');

    // And -p is a protocol flag on this family, not net-tools' process one.
    expect(out(api, ssh, 'netstat -p')).toContain('-p takes a PROTOCOL');

    expect(out(api, ssh, 'traceroute MARL-NAS-01'))
      .toContain('64 hops max, 52 byte packets');
  });

  it('id knows a Mac account is 501 in staff, not 1000 in its own group', () => {
    const { api, ssh } = onMac();

    expect(out(api, ssh, 'id')).toBe(
      'uid=501(pat) gid=20(staff) groups=20(staff),12(everyone),'
      + '61(localaccounts),80(admin),98(_lpadmin),399(com.apple.access_ssh)',
    );
    // root is in wheel here, which is where the old advice comes from.
    expect(out(api, ssh, 'id root')).toContain('gid=0(wheel)');
    expect(out(api, ssh, 'id')).not.toContain('sudo');
  });

  it('carries the verbs that genuinely are the same on both families', () => {
    const { api, ssh } = onMac();

    // ls, whoami and dig are POSIX-or-BSD-identical for what this dialect
    // prints, so they carry over untouched - which is the other half of the
    // audit: nothing is refused for being unfamiliar.
    expect(out(api, ssh, 'whoami')).toBe('pat');
    expect(out(api, ssh, 'ls -la')).toContain('total 8');
    expect(out(api, ssh, 'dig MARL-NAS-01')).toContain('ANSWER SECTION');
    expect(out(api, ssh, 'exit')).toContain(`Connection to ${MAC_HOST} closed.`);
  });

  it('never says .service about a job on a Mac, even in the shop\'s verbs', () => {
    const { api, ssh } = onMac();
    const output = out(api, ssh, 'changereq file com.example.nothing restart');

    expect(output).toBe(
      'No job labelled "com.example.nothing" is loaded on this box.',
    );
    expect(output).not.toContain('.service');
  });
});
