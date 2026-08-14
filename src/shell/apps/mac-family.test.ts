import { describe, expect, it } from 'vitest';


import { SYSTEMD_ACTIONS } from '../../world/actions';
import { isRiskyProductionChange } from '../../world/change-control';
import { COMPANY_IDS } from '../../world/company';
import {
  FIELDS,
  isUnixFamily,
  MACHINE_OS,
  machineOsOf,
  MACHINE_ROLES,
  machineRoleOf,
} from '../../world/fields';
import { driveRootId } from '../../world/filesystem';
import { unitIdOn, MAC_BASELINE_UNITS } from '../../world/services';
import {
  createWorldSession,
  FIRST_WEEK,
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
  type SshSession,
} from './cmd-unix';
import type { GameApi } from './types';
import type { SetupOp } from '../../engine-api';
import { offeredAtFor } from '../../world/titles';

/**
 * The third OS family meets the tools that cannot reach it (0.32.0, lane A).
 *
 * 0.7.0 built the honesty engine on TWO families: a Windows tool aimed at a
 * Linux box refuses the way the real tool would, and says which other family it
 * has met. Every one of those checks was spelled `=== linux`, which is a
 * shorthand while there are two values and a BUG the moment there are three -
 * a Mac would have read as the Windows side of every one of them and been told
 * things about itself that are false.
 *
 * So this suite is the audit, run as a player would run it: a Mac on the estate
 * and every Windows surface aimed at it. Each refusal is asserted twice over -
 * it NAMES the Mac and what actually reaches one, and the normal output is
 * ABSENT - so a guard removed fails the test rather than passing it quietly.
 * The Linux boxes are re-asserted alongside, because the third family must cost
 * the second one nothing.
 *
 * Lane A seeds no Macs into any shipped estate (that is the creative vertical,
 * lane B), so the box here is built by the test - which is also the honest
 * shape of the check: it is the FAMILY RULE under test, not one seeded box.
 */

const MAC_BOX = 'machine:studio-04';
const MAC_HOST = 'STUDIO-04';

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
    employer: 'workgrumble',
    actor: COMPANY_IDS.player,
  };
}

/** Runs a unix-dialect line inside a session, as the terminal does on a box. */
function unix(
  api: GameApi,
  session: SshSession,
  input: string,
): CommandResult {
  return executeUnix(parseUnixCommand(input), api, session);
}

/**
 * A designer's Mac, put on the estate the way the seeders put a box on it: a
 * machine node with the family on it, its launchd jobs off the baseline map,
 * and a wire to the desk so the network layer can find it.
 *
 * No drive is built, which is not an omission - it is the family rule. A Mac
 * has no C:, so the drive family finds nothing there, exactly as it finds
 * nothing on a Linux box.
 */
function withMacBox(session: WorldSession): void {
  const ops: SetupOp[] = [
    {
      op: 'addNode',
      node: {
        id: MAC_BOX,
        kind: 'machine',
        fields: {
          [FIELDS.hostname]: MAC_HOST,
          [FIELDS.machineRole]: MACHINE_ROLES.workstation,
          [FIELDS.machineOs]: MACHINE_OS.mac,
          [FIELDS.displayRotation]: 0,
          [FIELDS.resolution]: '2560x1440',
          [FIELDS.pendingUpdates]: false,
          [FIELDS.processor]: 'The one on the design desk',
          [FIELDS.memory]: '32 GB',
          [FIELDS.diskFree]: 214_748_364_800,
        },
      },
    },
    {
      op: 'addEdge',
      edge: {
        from: MAC_BOX,
        to: COMPANY_IDS.playerMachine,
        kind: 'connected_to',
      },
    },
  ];

  for (const job of MAC_BASELINE_UNITS[MACHINE_ROLES.workstation] ?? []) {
    const id = unitIdOn(MAC_BOX, job.unit);

    ops.push({
      op: 'addNode',
      node: {
        id,
        kind: 'unit',
        fields: {
          [FIELDS.name]: job.name,
          [FIELDS.unitName]: job.unit,
          [FIELDS.unitState]: job.state,
          [FIELDS.unitEnabled]: job.enabled,
        },
      },
    });
    ops.push({ op: 'addEdge', edge: { from: id, to: MAC_BOX, kind: 'runs_on' } });
  }

  session.engine.applySetup(ops);
}

function macWorld(): { readonly world: WorldSession; readonly api: GameApi } {
  const world = createWorldSession();
  withMacBox(world);

  return { world, api: apiFor(world) };
}

function win(api: GameApi, input: string): CommandResult {
  return executeCommand(parseCommand(input), api);
}

function run(api: GameApi, input: string): string {
  return win(api, input).lines.join('\n');
}

describe('a Windows terminal meets a Mac', () => {
  it('takes the box onto the estate as a Mac, with launchd jobs on it', () => {
    const { world } = macWorld();
    const jobs = world.engine.graph
      .neighbors(MAC_BOX, { direction: 'in', edgeKind: 'runs_on' })
      .filter((node) => node.kind === 'unit')
      .map((node) => node.fields[FIELDS.unitName]);

    // Reverse-DNS labels, on the `unit` node kind the engine already has - the
    // whole of what the baseline map buys, and no engine change behind it.
    expect(jobs).toContain('com.apple.mDNSResponder');
    expect(jobs).toContain('com.jamf.management.daemon');
    expect(jobs.some((label) => typeof label === 'string'
      && label.startsWith('com.adobe.'))).toBe(true);
    // Not one of them is a systemd unit name.
    for (const label of jobs) {
      expect(String(label)).not.toMatch(/\.service$/u);
    }
  });

  it('refuses sc against a Mac, and names launchd - never systemd', () => {
    const { api } = macWorld();
    const output = run(api, `sc query ${MAC_HOST}\\com.apple.mDNSResponder`);

    expect(output).toContain(`${MAC_HOST} is not a Windows host`);
    expect(output).toContain('Windows Service Control Manager');
    expect(output).toContain('That is a Mac on the wire');
    expect(output).toContain('launchd');
    expect(output).toContain('launchctl');
    // The Linux tail would be a lie about this box, in both halves of it.
    expect(output).not.toContain('systemd');
    expect(output).not.toContain('systemctl');
    // And no manager answered: the real block never got printed.
    expect(output).not.toContain('SERVICE_NAME');
    expect(output).not.toContain('RUNNING');
  });

  it('refuses services against a Mac, and lists none of its jobs', () => {
    const { api } = macWorld();
    const output = run(api, `services ${MAC_HOST}`);

    expect(output).toContain(`${MAC_HOST} is not a Windows host`);
    expect(output).toContain('That is a Mac on the wire');
    expect(output).not.toContain('systemd');
    // The launchd jobs did not get dressed up as Windows services.
    expect(output).not.toContain('DISPLAY NAME');
    expect(output).not.toContain('com.apple.mDNSResponder');
    expect(output).not.toContain('com.jamf.management.daemon');
  });

  it('refuses restart against a Mac, and calls the target a launchd job', () => {
    const { api } = macWorld();
    const output = run(api, `restart ${MAC_HOST}\\com.jamf.management.daemon`);

    expect(output).toContain(`${MAC_HOST} is not a Windows host`);
    expect(output).toContain('does not reach a launchd job');
    expect(output).not.toContain('systemd unit');
    // Nothing was bounced: no stop/start pair ran.
    expect(output).not.toContain('reports RUNNING');
  });

  it('refuses systeminfo on a Mac rather than calling it Windows', () => {
    const { api } = macWorld();
    const output = run(api, `systeminfo ${MAC_HOST}`);

    expect(output).toContain(`${MAC_HOST} is not a Windows host`);
    expect(output).toContain('pull from a Mac');
    expect(output).not.toContain('a systemd one');
    // It never printed the Windows OS block for a box that is not one.
    expect(output).not.toContain('OS Version');
    expect(output).not.toContain('Registered Services');
  });

  it('keeps the Remote Registry reason on tasklist /s, and names launchd', () => {
    const { api } = macWorld();
    const output = run(api, `tasklist /s ${MAC_HOST}`);

    // The estate's own reason is unchanged; the deeper one is the Mac's.
    expect(output).toContain('Remote Registry is Disabled');
    expect(output).toContain(`${MAC_HOST} is not a Windows host besides`);
    expect(output).toContain('it runs launchd');
    expect(output).not.toContain('systemd');
  });

  it('names Screen Sharing and ssh as what reaches it, and RDP as what does not', () => {
    const { api } = macWorld();
    const output = run(api, `services ${MAC_HOST}`);

    // The refusal that teaches: what IS true about reaching a Mac, in the same
    // place the Linux refusal says systemctl-over-ssh and the next tier.
    expect(output).toContain('Screen Sharing');
    expect(output).toContain('ssh');
    expect(output).toContain('RDP');
  });

  it('still reaches the Mac on the wire - that layer is OS-agnostic', () => {
    const { api } = macWorld();

    const ping = run(api, `ping ${MAC_HOST}`);
    expect(ping).toContain(`Reply from ${MAC_HOST}`);
    expect(ping).toContain('nothing at all about what is running on it');

    expect(run(api, `nslookup ${MAC_HOST}`)).toContain('studio-04');
    expect(run(api, `tracert ${MAC_HOST}`)).toContain('Trace complete.');
  });

  it('finds no drive on a Mac, because a Mac has no drive letters', () => {
    const { api } = macWorld();

    // Same mechanism as a Linux box: the drive is ABSENT, so the four file
    // commands answer with the real shell's own not-found wording rather than
    // inventing a C: on a machine that has never had one.
    for (const line of [
      `dir \\\\${MAC_HOST}\\C$`,
      `tree \\\\${MAC_HOST}\\C$`,
      `type \\\\${MAC_HOST}\\C$\\WINDOWS\\WIN.INI`,
    ]) {
      const output = run(api, line);

      expect(output, line).toContain('The system cannot find the');
      expect(output, line).not.toContain('Volume Serial Number');
      expect(output, line).not.toContain('Directory of');
    }
  });

  it('does not regress the Linux boxes: they still meet systemd', () => {
    const { api } = macWorld();
    const output = run(api, 'sc query APP-01\\nginx');

    expect(output).toContain('APP-01 is not a Windows host');
    expect(output).toContain('systemd');
    expect(output).not.toContain('Mac');
    expect(output).not.toContain('launchd');
    // And the Windows boxes are untouched by any of it.
    expect(run(api, 'services INTRA-01')).toContain('DISPLAY NAME');
    expect(run(api, 'services INTRA-01')).not.toContain('not a Windows host');
  });
});

/**
 * The unix terminal and the Mac (0.32.0, and what 0.33.0 did to it).
 *
 * A Mac runs sshd - Remote Login is a checkbox, not a fiction - so the WINDOWS
 * refusal at this seam ("it does not run sshd") would be a flat lie about one,
 * and the audit's job was to stop the Mac reading as the Windows side. In
 * 0.32.0 what it got instead was its own refusal, because the terminal held
 * exactly one unix dialect and it was the Linux one, and that refusal WAS the
 * gate: no session, so no `apt` and no SELinux verb could be typed at a Mac.
 *
 * 0.33.0 brought the dialect, so the session opens - and the gate it replaces
 * the refusal with is the stronger statement of the same guarantee. It is no
 * longer "there is nowhere to type systemctl"; it is "you can type it, and the
 * box tells you the truth about itself". Every Linux-only verb is asserted
 * inside a real Mac session, twice over: the Linux answer is ABSENT, and the
 * refusal names the tool the Mac actually has. A dialect seam that quietly let
 * one through would fail here rather than pass quietly.
 */
describe('the unix terminal meets a Mac', () => {
  function promotedMac(): GameApi {
    const { world, api } = macWorld();

    world.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reputation,
      value: offeredAtFor('systems_engineer'),
    }]);
    win(api, 'promotion accept');

    return api;
  }

  /** The session an engineer gets on the Mac, or a failure the test can read. */
  function macSession(api: GameApi): SshSession {
    const session = win(api, `ssh pat@${MAC_HOST}`).enterSession;

    if (session === undefined) {
      throw new Error('ssh did not open a session on the Mac');
    }

    return session;
  }

  it('opens a session on a Mac, and never with the Windows words', () => {
    const api = promotedMac();
    const result = win(api, `ssh ${MAC_HOST}`);
    const output = result.lines.join('\n');

    expect(result.enterSession?.hostname).toBe(MAC_HOST);
    expect(output).toContain('That is a Mac');
    // The Windows refusal is false about a Mac in both of its claims, and it
    // must not be what a Mac gets - which was the whole of the 0.32.0 audit.
    expect(output).not.toContain('Connection refused');
    expect(output).not.toContain('is a Windows box');
    expect(output).not.toContain('does not run sshd');
  });

  it('keeps the tier gate: the desk has no ssh to a Mac either', () => {
    // The 0.32.0 refusal a service-desk player gets, unchanged. ssh is the
    // engineers' tier whatever is on the far end of it, so the Mac dialect
    // arriving does not open a door the promotion is supposed to.
    const { api } = macWorld();
    const result = win(api, `ssh ${MAC_HOST}`);

    expect(result.enterSession).toBeUndefined();
    expect(result.lines.join('\n')).toContain('not service-desk access');
  });

  it('answers every Linux-only verb with the truth about a Mac', () => {
    const api = promotedMac();
    const session = macSession(api);

    // One row per Linux-only verb: what the refusal must NAME, and a string
    // from the Linux answer that must be ABSENT. The second half is the half
    // that has teeth - a verb that quietly ran its Ubuntu branch on a Mac
    // would satisfy no row here.
    const cases: readonly (readonly [string, string, string])[] = [
      ['systemctl status com.apple.mDNSResponder', 'launchctl', 'Loaded:'],
      ['journalctl', 'log show', '-- No entries --'],
      ['apt update', 'MDM', 'Hit:'],
      ['dnf check-update', 'no system package manager', 'Last metadata'],
      ['zypper refresh', 'no system package manager', 'repositories'],
      ['pacman -Q', 'no system package manager', 'core'],
      ['dpkg -l', 'receipts', 'ii '],
      ['getenforce', 'SELinux is a Linux kernel module', 'Enforcing'],
      ['sestatus', 'SELinux is a Linux kernel module', 'SELinux status'],
      ['ip a', 'ifconfig', 'qdisc'],
      ['ss -tlnp', 'netstat -an', 'Peer Address'],
      ['getent passwd', 'dscl', 'root:x:0:0'],
    ];

    for (const [line, names, linuxAnswer] of cases) {
      const output = unix(api, session, line).lines.join('\n');

      expect(output, line).toContain('command not found');
      expect(output, line).toContain(names);
      expect(output, line).not.toContain(linuxAnswer);
    }
  });

  it('says zsh caught the miss, not bash - and never offers apt', () => {
    const api = promotedMac();
    const session = macSession(api);

    // The shells fail differently and both spellings are real: zsh names
    // itself and puts the command last. And the Ubuntu command-not-found
    // handler - the one that offers "sudo apt install net-tools" - is not on
    // this family at all, so nothing here may offer a package.
    expect(unix(api, session, 'systemctl status x').lines[0])
      .toBe('zsh: command not found: systemctl');
    expect(unix(api, session, 'ifconfig').lines.join('\n'))
      .not.toContain('apt install');
    expect(unix(api, session, 'netstat -an').lines.join('\n'))
      .not.toContain('apt install');
    expect(unix(api, session, 'htop').lines.join('\n'))
      .not.toContain('apt install');
  });

  it('still opens a session on the Linux boxes, unchanged', () => {
    const api = promotedMac();
    const session = win(api, 'ssh pat@APP-01').enterSession;

    expect(session?.hostname).toBe('APP-01');
    // And the Linux box is still a Linux box: the third dialect is refused
    // there in the same shape, which is the other direction of the same seam.
    if (session === undefined) {
      throw new Error('ssh did not open a session on the Linux box');
    }

    const output = unix(api, session, 'launchctl list').lines.join('\n');

    expect(output).toContain('launchctl: command not found');
    expect(output).toContain('systemd');
  });
});

/**
 * Change control and the third family (0.32.0).
 *
 * What puts a box under change control is that people depend on what it serves,
 * which is a fact about the box rather than about its service manager. Reading
 * `=== linux` there would have been the DANGEROUS half of the third family: an
 * in-house production Mac that quietly needed no change request. It is a hole
 * rather than a difference, and this is the assertion that keeps it shut.
 */
describe('change control governs an in-house Mac server too', () => {
  const MAC_SERVER = 'machine:render-01';
  const MAC_UNIT = `${MAC_SERVER}-nginx`;

  function withMacServer(session: WorldSession): void {
    session.engine.applySetup([
      {
        op: 'addNode',
        node: {
          id: MAC_SERVER,
          kind: 'machine',
          fields: {
            [FIELDS.hostname]: 'RENDER-01',
            [FIELDS.machineRole]: MACHINE_ROLES.appServer,
            [FIELDS.machineOs]: MACHINE_OS.mac,
            [FIELDS.displayRotation]: 0,
            [FIELDS.resolution]: '1920x1080',
          },
        },
      },
      {
        op: 'addNode',
        node: {
          id: MAC_UNIT,
          kind: 'unit',
          fields: {
            [FIELDS.name]: 'The render queue front door',
            [FIELDS.unitName]: 'nginx.service',
          },
        },
      },
      {
        op: 'addEdge',
        edge: { from: MAC_UNIT, to: MAC_SERVER, kind: 'runs_on' },
      },
    ]);
  }

  it('classes a risky verb on an in-house Mac prod box as a real change', () => {
    const world = createWorldSession();
    withMacServer(world);

    expect(isRiskyProductionChange(
      world.engine.graph,
      MAC_UNIT,
      SYSTEMD_ACTIONS.unitRestart,
    )).toBe(true);
    // And the low-risk verb is still the low-risk verb: bringing something up
    // is remediation on any family.
    expect(isRiskyProductionChange(
      world.engine.graph,
      MAC_UNIT,
      SYSTEMD_ACTIONS.unitStart,
    )).toBe(false);
  });
});

/**
 * The seeder half of the family rule, as a STANDING invariant over every estate
 * the game ships (0.32.0).
 *
 * Six sites in four seeders decide what a box gets built with, and all six used
 * to ask `=== linux`. They ask the FAMILY now, and lane A seeds no Mac for them
 * to fire on - so this is the assertion written ahead of the boxes: whatever
 * employer, whatever family, a unix box has no Windows C: drive and no Windows
 * service on it, and the units it does carry are the ones its family's table
 * says. The day the creative vertical seeds its first Mac, this is what catches
 * a seeder that forgot the third value.
 */
describe('every shipped estate keeps the family rule', () => {
  const EMPLOYERS = ['workgrumble', 'bodgeworth', 'msp', 'corporate'] as const;

  it('gives no unix box a C: drive, a Windows service or a stray unit', () => {
    let unixBoxes = 0;

    for (const employer of EMPLOYERS) {
      const world = createWorldSession({ ...FIRST_WEEK, employer });
      const { graph } = world.engine;

      for (const machine of graph.nodesOfKind('machine')) {
        const os = machineOsOf(machine.fields[FIELDS.machineOs]);

        if (!isUnixFamily(os)) {
          continue;
        }

        unixBoxes += 1;

        const attached = graph.neighbors(machine.id, {
          direction: 'in',
          edgeKind: 'runs_on',
        });

        // No Windows drive: the drive family finds nothing, which is what makes
        // its refusal on a unix box honest rather than a coincidence.
        expect(graph.getNode(driveRootId(machine.id)), machine.id)
          .toBeUndefined();
        // No Windows service, on either unix family. A firewall RULE is a
        // `service` node too (E10 reuses the kind, as the Mac reuses `unit`),
        // and it is not a Windows service - it is named out rather than left
        // to make the rule look softer than it is.
        expect(
          attached
            .filter((node) => node.kind === 'service')
            .filter((node) => node.fields[FIELDS.fwRuleClass] === undefined)
            .map((node) => node.id),
          machine.id,
        ).toEqual([]);

        // And what it does run is a unit, named the way its family names one.
        // The LIST is not asserted here: a box may carry hand-written units
        // instead of its role's table (Bodgeworth's camera box does, and that
        // is content rather than a rule). The VOCABULARY is the rule.
        const role = machineRoleOf(machine.fields[FIELDS.machineRole]);
        const macLabels = new Set(
          (MAC_BASELINE_UNITS[role] ?? []).map((job) => job.unit),
        );

        for (const unit of attached.filter((node) => node.kind === 'unit')) {
          const name = unit.fields[FIELDS.unitName];

          expect(typeof name, unit.id).toBe('string');
          // A Mac never carries a systemd unit name and a Linux box never
          // carries a launchd label, whatever else a ticket adds to the box.
          expect(
            os === MACHINE_OS.mac
              ? !String(name).endsWith('.service')
              : !macLabels.has(String(name)),
            `${machine.id}: ${String(name)}`,
          ).toBe(true);
        }
      }
    }

    // The sweep only means something if it swept something.
    expect(unixBoxes).toBeGreaterThan(0);
  });

  it('routes every customer machine from the MSP desk - the RMM tunnel', () => {
    /*
     * Found by the 0.32.0 box gate: MARL-WS-01 answered ping with 100% loss,
     * and the pull on that thread showed EVERY customer estate had been an
     * island since 0.8.0 - workstation wired to site server, site server
     * wired to nothing, and no test had ever pinged a customer box. The
     * Remote Assist window and the monitoring board already claim the desk
     * reaches these sites, so the wire exists in the fiction; this gate makes
     * the graph tell the same story, via the RMM tunnel edges the seeders now
     * lay. Drop the tunnel rule and this goes red on every customer.
     */
    const world = createWorldSession({ ...FIRST_WEEK, employer: 'msp' });
    const { graph } = world.engine;

    const desk = 'machine:msp-desk';
    const seen = new Set<string>([desk]);
    const queue = [desk];

    while (queue.length > 0) {
      const id = queue.pop();

      if (id === undefined) {
        break;
      }

      const wired = [
        ...graph.neighbors(id, { direction: 'out', edgeKind: 'connected_to' }),
        ...graph.neighbors(id, { direction: 'in', edgeKind: 'connected_to' }),
      ];

      for (const next of wired) {
        if (!seen.has(next.id)) {
          seen.add(next.id);
          queue.push(next.id);
        }
      }
    }

    let customerBoxes = 0;

    for (const machine of graph.nodesOfKind('machine')) {
      if (machine.fields[FIELDS.machineCustomer] === undefined) {
        continue;
      }

      customerBoxes += 1;
      expect(seen.has(machine.id), machine.id).toBe(true);
    }

    expect(customerBoxes).toBeGreaterThan(10);
  });
});
