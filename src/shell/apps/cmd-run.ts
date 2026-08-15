import type {
  DispatchResult,
  NodeKind,
  ReadOnlyGraphNode,
} from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY } from '../../world/company';
import { PROBES } from '../../world/tickets/handoff';
import {
  VERIFICATION_METHOD_LABELS,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from '../../world/fallout';
import {
  AUDIT_SOURCES,
  auditSourceOf,
  type BusinessType,
  BUSINESS_TYPE_LABELS,
  DEVICE_TYPES,
  FIELDS,
  isRotation,
  isSystemsEngineer,
  isService,
  isUnixFamily,
  MACHINE_OS,
  MACHINE_OS_LABELS,
  MACHINE_ROLE_LABELS,
  MACHINE_ROLES,
  type MachineOs,
  machineRoleOf,
  machineOsOf,
  SERVICE_CLASSES,
  serviceClassOf,
  SERVICE_SCOPE_LABELS,
  SERVICE_STATUS,
  SLA_TIER_LABELS,
  STARTUP_TYPE_LABELS,
  startupTypeOf,
} from '../../world/fields';
import {
  customerIdOfMachine,
  customerName,
  scopeOfCustomer,
  scopeRefusalForMachine,
  slaTierOfCustomer,
  wrongCustomerGuardLines,
} from '../../world/customers';
import { changeRequestListing } from '../../world/change-request';
import {
  ARDEN_EDGE_ESTATE,
  projectRules,
  ruleIsKnown,
  ruleIsMigrated,
} from '../../world/project';
import { PROJECT_ACTIONS } from '../../world/actions';
import {
  hoursLabel,
  lineAt,
  timesheetLines as renderTimesheet,
  utilisationLine,
} from '../../world/timesheet';
import { INVOICE_RUNG_LABELS } from '../../world/invoice';
import { isProjectRag, RAG_LABELS } from '../../world/watermelon';
import { formatSimTime } from '../clock-format';
import { DEFAULT_CWD } from '../../world/filesystem';
import { readSpoolJobs, type TerminalSession } from '../../world/fs';
import {
  cdLines,
  dirLines,
  type FileCommandResult,
  moveLines,
  purgeLines,
  // The same grouping a listing uses, because a process list and a directory
  // listing have always written a thousand the same way.
  thousands,
  treeLines,
  typeLines,
} from './cmd-files';
import {
  addressOf,
  DNS_SUFFIX,
  fqdn,
  GATEWAY,
  macOf,
  NAME_SERVER,
  traceLine,
} from './cmd-net';
import { COMMANDS, type ParsedCommand } from './cmd-parse';
import {
  promotionLines,
  sshLines,
  type SshSession,
} from './cmd-unix';
import { runningPrograms } from './processes';
// The one remediation seam, shared with the windows that send the same verbs:
// the terminal decides nothing about scope on its own any more.
import { dispatchRemediation, labelOf } from './remediation';
import type { GameApi } from './types';
import { textValue } from './ui';

export interface CommandResult {
  readonly lines: readonly string[];
  readonly clear: boolean;
  /**
   * Where the terminal is standing afterwards, when `cd` moved it.
   *
   * The working directory belongs to the WINDOW rather than to the world: it
   * is not a fact about the estate, no save carries it, and a second terminal
   * would open where a second terminal opens. Nothing else in this file has an
   * opinion about it, which is why it travels back out as a result rather than
   * being written anywhere.
   */
  readonly cwd?: readonly string[];
  /**
   * An `ssh` that connected: the server session the terminal now stands in
   * (E6). The window holds it and switches to the unix dialect while it is set,
   * the same way it holds the working directory - a window-local fact no save
   * carries, because a reloaded terminal is a fresh shell at the desktop.
   */
  readonly enterSession?: SshSession;
  /** An `exit`/`logout` inside a session: leave it, back to the Windows prompt. */
  readonly exitSession?: boolean;
}

type Lookup =
  | { ok: true; node: ReadOnlyGraphNode }
  | { ok: false; reason: string };

const PING_PACKETS = 3;
const USAGE_COLUMN = 34;
/** How many matches a refusal names before it starts counting instead. */
const AMBIGUITY_LIMIT = 6;

/** The services list, in the columns the real one has room for. */
const NAME_COLUMN = 41;
const STATUS_COLUMN = 9;
const STARTUP_COLUMN = 20;

/** And the process list, in the columns the real one prints. */
const IMAGE_COLUMN = 26;
const PID_COLUMN = 8;
const SESSION_COLUMN = 17;
const SESSION_NUMBER_COLUMN = 11;
const MEMORY_COLUMN = 12;

function lines(...values: readonly string[]): CommandResult {
  return { lines: values, clear: false };
}

function matches(node: Readonly<ReadOnlyGraphNode>, query: string): boolean {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    return false;
  }

  const suffix = node.id.includes(':')
    ? node.id.slice(node.id.indexOf(':') + 1)
    : node.id;
  const label = labelOf(node).toLowerCase();
  // The name the MACHINE knows it by, as well as the one on the screen. A
  // player types `wuauserv` because that is what the list they are looking at
  // calls it, and a terminal that only answered to "Automatic Updates" would
  // be a terminal that prints one vocabulary and accepts another.
  const short = node.fields[FIELDS.serviceName];

  return node.id.toLowerCase() === needle
    || suffix.toLowerCase() === needle
    || (typeof short === 'string' && short.toLowerCase() === needle)
    || label === needle
    || label.includes(needle);
}

function lookup(
  api: GameApi,
  kind: NodeKind,
  query: string,
  missing: string,
  filter: (node: Readonly<ReadOnlyGraphNode>) => boolean = () => true,
): Lookup {
  const candidates = api.graph
    .nodesOfKind(kind)
    .filter((node) => filter(node) && matches(node, query));
  const first = candidates[0];

  if (first === undefined) {
    return { ok: false, reason: missing };
  }

  if (candidates.length > 1) {
    // Services are the one kind where "be more specific" needs somewhere to
    // go: every box in the building runs a spooler and a DNS client, so the
    // name alone can never pick one and no amount of trying harder will. The
    // refusal names the boxes and then the FORM, which is what to type next.
    if (kind === 'service') {
      const hosts = candidates
        .map((node) => api.graph
          .neighbors(node.id, { direction: 'out', edgeKind: 'runs_on' })
          .find((owner) => owner.kind === 'machine'))
        .map((host) => (host === undefined ? 'nowhere' : labelOf(host)))
        .sort((left, right) => left.localeCompare(right));
      const listed = hosts.slice(0, AMBIGUITY_LIMIT);
      const rest = hosts.length - listed.length;

      return {
        ok: false,
        reason: `"${query}" matches ${String(candidates.length)} of them `
          + `(${listed.join(', ')}${
            rest > 0 ? `, and ${String(rest)} more` : ''
          }). Name the box as well - "${listed[0] ?? 'HOST'}\\${query}" - `
          + 'the way sc makes you.',
      };
    }

    return {
      ok: false,
      reason: `"${query}" matches ${String(candidates.length)} of them `
        + `(${candidates.map(labelOf).join(', ')}). Be more specific than the `
        + 'people who file these tickets.',
    };
  }

  return { ok: true, node: first };
}

function machineOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'machine',
    query,
    `Unknown host "${query}". Check the name, then check the plug.`,
  );
}

/**
 * The box a Windows-family command is aimed at, when that box is NOT a Windows
 * host - which every Windows service tool in here has to refuse, because the
 * family it speaks stops at the wire.
 *
 * A service query arrives qualified - `APP-01\nginx` - so the host is the part
 * before the slash; a bare machine name is the whole of it. Returns the box's
 * name AND its family so the refusal can name both, or null when the target is
 * a Windows box or no box at all - in which case the command's own refusal is
 * already the right one (`sc` has never managed a service manager that is not
 * Windows, and it does not pretend the Linux box is missing either).
 *
 * The family comes back with the name because the refusal is not one refusal
 * (0.32.0): a systemd box and a Mac are both not-Windows and they are not the
 * same not-Windows, and a Mac told it runs systemd would be the invention the
 * whole honesty engine exists to forbid.
 */
interface UnixTarget {
  readonly host: string;
  readonly os: MachineOs;
}

function unixHostOf(api: GameApi, query: string): UnixTarget | null {
  const qualified = /^(.+?)[\\/](.+)$/u.exec(query.trim());
  const hostQuery = (qualified?.[1] ?? query).trim();

  if (hostQuery.length === 0) {
    return null;
  }

  const found = machineOf(api, hostQuery);

  if (!found.ok) {
    return null;
  }

  const os = machineOsOf(found.node.fields[FIELDS.machineOs]);

  return isUnixFamily(os) ? { host: labelOf(found.node), os } : null;
}

/**
 * The machine a service-taking query names - the host part of `APP-01\nginx`,
 * or the whole of a bare `APP-01`. Returns the node so a refusal can read its
 * customer, or null when the query names no box. It is the node behind
 * `unixHostOf`, factored out so the customer guards can compose with the
 * cross-OS refusal on the same box.
 */
function hostMachineOfQuery(
  api: GameApi,
  query: string,
): Readonly<ReadOnlyGraphNode> | null {
  const qualified = /^(.+?)[\\/](.+)$/u.exec(query.trim());
  const hostQuery = (qualified?.[1] ?? query).trim();

  if (hostQuery.length === 0) {
    return null;
  }

  const found = machineOf(api, hostQuery);
  return found.ok ? found.node : null;
}

/**
 * What the box IS, in the phrase a refusal drops into its own sentence.
 *
 * The Linux phrase is the one the shipped refusals have always said, kept word
 * for word so the third family costs the second one nothing.
 */
function familyPhrase(os: MachineOs): string {
  return os === MACHINE_OS.mac ? 'a Mac' : 'a systemd one';
}

/** What a manager on that box calls the thing a Windows verb was aimed at. */
function managedThing(os: MachineOs): string {
  return os === MACHINE_OS.mac ? 'a launchd job' : 'a systemd unit';
}

/** The name of the thing that starts and stops software on that box. */
function serviceManagerOf(os: MachineOs): string {
  return os === MACHINE_OS.mac ? 'launchd' : 'systemd';
}

/**
 * The common tail of every "not a Windows host" refusal: it names the other
 * family's service manager and toolset, says the box is real and findable, and
 * says what will not reach it. The lead line is the tool's own reason it cannot
 * reach the box.
 *
 * Two tails, one mechanism (0.32.0). The Linux tail also points at the tier
 * that HAS systemctl - the on-ramp to E6, taught by the world refusing rather
 * than by a tutorial. The Mac tail does not make that promise, because it would
 * be a false one: launchctl is not in this game yet, and the true thing to say
 * about a Mac is which of the tools in the player's hands reach it and which
 * never will.
 */
function notWindowsHost(
  target: UnixTarget,
  why: string,
): CommandResult {
  return target.os === MACHINE_OS.mac
    ? lines(
      `${target.host} is not a Windows host. ${why}`,
      'That is a Mac on the wire. It runs launchd - a different service manager,',
      'reached with launchctl over Screen Sharing or ssh, a family this terminal',
      'does not speak. It is real and findable (ping and nslookup answer for it);',
      'RDP and the Windows service tools are not what gets you onto it.',
    )
    : lines(
      `${target.host} is not a Windows host. ${why}`,
      'This box runs systemd - a different service manager, reached with systemctl',
      'over ssh, a family this terminal does not speak. It is real and on the wire',
      '(ping and nslookup find it); managing it is the next tier\'s job, not this one.',
    );
}

function accountOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'account',
    query,
    `No account matches "${query}". The directory is many things, but it is `
      + 'not imaginative.',
  );
}

/**
 * A service, on a box.
 *
 * Every machine in this building runs its own DNS Client and its own spooler,
 * because every machine does - so a bare name matches a dozen services and the
 * terminal has to be told WHICH box, exactly as `sc` has to be told. The
 * qualified form is `PRINT-01\\Spooler`, it is what the ambiguity refusal
 * prints back, and the bare form still works whenever only one box has one.
 */
function serviceOf(api: GameApi, query: string): Lookup {
  const qualified = /^(.+?)[\\/](.+)$/u.exec(query.trim());

  if (qualified !== null) {
    const [, host = '', name = ''] = qualified;
    const machine = machineOf(api, host);

    if (!machine.ok) {
      return machine;
    }

    const running = new Set(
      api.graph
        .neighbors(machine.node.id, { direction: 'in', edgeKind: 'runs_on' })
        .map((node) => node.id),
    );

    return lookup(
      api,
      'service',
      name,
      `Nothing called "${name}" is registered on ${labelOf(machine.node)}. `
        + `"services ${labelOf(machine.node)}" is the list.`,
      (node) => running.has(node.id),
    );
  }

  return lookup(
    api,
    'service',
    query,
    `No service called "${query}" is registered anywhere in the estate.`,
  );
}

function printerOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'device',
    query,
    `No printer matches "${query}". There is only one, and it is furious.`,
    (node) => node.fields[FIELDS.type] === DEVICE_TYPES.printer,
  );
}

function deviceOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'device',
    query,
    `Nothing plugged in anywhere matches "${query}".`,
  );
}

function mailRuleOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'mail_rule',
    query,
    `No mail rule matches "${query}". They are named by what they do, which `
      + 'is the one mercy in this part of the system.',
  );
}

/**
 * The licence pool. There is one, it is not a thing anybody names in a ticket,
 * and asking the player to type its id would be asking them to know a schema.
 */
function licencePool(api: GameApi): ReadOnlyGraphNode | undefined {
  return api.graph
    .nodesOfKind('service')
    .find((node) => typeof node.fields[FIELDS.seatsFree] === 'number');
}

function playerMachine(api: GameApi): ReadOnlyGraphNode | undefined {
  return api.graph
    .neighbors(api.actor, { direction: 'out', edgeKind: 'owns' })
    .find((node) => node.kind === 'machine');
}

/** Reachability is the `connected_to` graph, walked in both directions. */
function routeTo(
  api: GameApi,
  target: Readonly<ReadOnlyGraphNode>,
): readonly string[] | null {
  const origin = playerMachine(api);

  if (origin === undefined) {
    return null;
  }

  const queue: { id: string; path: string[] }[] = [
    { id: origin.id, path: [origin.id] },
  ];
  const seen = new Set<string>([origin.id]);

  while (queue.length > 0) {
    const step = queue.shift();

    if (step === undefined) {
      break;
    }

    if (step.id === target.id) {
      return step.path;
    }

    const neighbors = [
      ...api.graph.neighbors(step.id, {
        direction: 'out',
        edgeKind: 'connected_to',
      }),
      ...api.graph.neighbors(step.id, {
        direction: 'in',
        edgeKind: 'connected_to',
      }),
    ];

    for (const neighbor of neighbors) {
      if (!seen.has(neighbor.id)) {
        seen.add(neighbor.id);
        queue.push({ id: neighbor.id, path: [...step.path, neighbor.id] });
      }
    }
  }

  return null;
}

function statusWord(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(node.fields[FIELDS.status], 'unknown').toUpperCase();
}

function pad(value: string, width: number): string {
  return value.length >= width ? `${value} ` : value.padEnd(width, ' ');
}

function helpLines(): CommandResult {
  return lines(
    'Commands this terminal admits to having:',
    ...COMMANDS.map((spec) => `  ${pad(spec.usage, USAGE_COLUMN)}${spec.summary}`),
    'Everything here does exactly what the buttons do. Same verbs, fewer',
    'mouse movements, considerably more credibility in the corridor.',
  );
}

function pingLines(api: GameApi, query: string): CommandResult {
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const label = labelOf(found.node);
  const route = routeTo(api, found.node);

  // The answer is EVIDENCE (0.36.0): a box proven up - or proven silent - is
  // a line on the handoff form of every open ticket about that box, which is
  // the difference between "you have not touched this one" and the truth.
  api.recordProbe(
    found.node.id,
    route === null ? PROBES.pingDead : PROBES.ping,
    true,
  );

  if (route === null) {
    return lines(
      `Pinging ${label} with ${String(PING_PACKETS)} packets of hope:`,
      ...Array.from({ length: PING_PACKETS }, () => 'Request timed out.'),
      `Packets: sent = ${String(PING_PACKETS)}, received = 0, `
        + 'lost = 3 (100% loss). Somewhere, a cable is lying on the floor.',
    );
  }

  const hops = route
    .slice(1, -1)
    .map((id) => {
      const node = api.graph.getNode(id);
      return node === undefined ? id : labelOf(node);
    });

  return lines(
    `Pinging ${label}${
      hops.length > 0 ? ` [via ${hops.join(', ')}]` : ''
    } with ${String(PING_PACKETS)} packets of hope:`,
    ...Array.from(
      { length: PING_PACKETS },
      (_, index) => `Reply from ${label}: bytes=32 time=${String(3 + index)}ms `
        + 'TTL=57',
    ),
    // A reply proves one thing: the box answered at the network layer. It
    // says nothing about the services on it, and a terminal that reports
    // "the machine is fine" teaches the player to stop looking.
    `Packets: sent = ${String(PING_PACKETS)}, received = `
      + `${String(PING_PACKETS)}, lost = 0. It is alive. This says nothing `
      + 'about its mood, and nothing at all about what is running on it.',
  );
}

function usersLines(api: GameApi, query: string): CommandResult {
  const found = accountOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const account = found.node;
  const owner = api.graph
    .neighbors(account.id, { direction: 'in', edgeKind: 'owns' })
    .find((node) => node.kind === 'person');
  const groups = api.graph.neighbors(account.id, {
    direction: 'out',
    edgeKind: 'member_of',
  });
  const shares = api.graph.neighbors(account.id, {
    direction: 'out',
    edgeKind: 'has_access',
  });
  const reset = account.fields[FIELDS.passwordResetAt];

  const badPasswords = account.fields[FIELDS.badPwCount];
  const lockedSince = account.fields[FIELDS.lockedSince];
  const lastLogon = account.fields[FIELDS.lastLogon];

  return lines(
    `Account      : ${labelOf(account)}`,
    `Owner        : ${textValue(
      owner?.fields[FIELDS.name],
      'unclaimed',
    )} (${textValue(owner?.fields[FIELDS.title], 'role unrecorded')})`,
    // Three states, three words, because three different jobs hang off them.
    `Status       : ${
      account.fields[FIELDS.enabled] === false
        ? 'DISABLED'
        : account.fields[FIELDS.locked] === true
          ? 'LOCKED OUT'
          : account.fields[FIELDS.passwordExpired] === true
            ? 'PASSWORD EXPIRED'
            : 'OK'
    }`,
    `Bad passwords: ${
      typeof badPasswords === 'number' ? String(badPasswords) : 'not counted'
    }`,
    `Locked since : ${
      typeof lockedSince === 'number'
        ? formatSimTime(lockedSince).time
        : 'not locked'
    }`,
    `Last logon   : ${
      typeof lastLogon === 'number'
        ? `${formatSimTime(lastLogon).time} (${formatSimTime(lastLogon).day})`
        : 'not since before this log starts'
    }`,
    `Must change  : ${
      account.fields[FIELDS.pwMustChange] === true
        ? 'yes, at next logon'
        : 'no'
    }`,
    `Password set : ${
      typeof reset === 'number'
        ? formatSimTime(reset).time
        : 'not since the carpet was new'
    }`,
    `Groups       : ${
      groups.length === 0 ? 'none' : groups.map(labelOf).join(', ')
    }`,
    `Shares       : ${
      shares.length === 0 ? 'none' : shares.map(labelOf).join(', ')
    }`,
  );
}

/**
 * The services list, in the shape a services list has.
 *
 * Four columns rather than two, because the fourth is the one that turns a
 * list into a diagnosis: a stopped service set to Manual is a machine
 * behaving itself, and a stopped service set to Automatic is the line the
 * ticket is about. Twenty-odd of these on every box is not padding - finding
 * the one wrong line among the right ones IS the first-line skill, and a list
 * of one had already done it for the player.
 *
 * What is NOT a service goes under the table with the reason: a fan reports a
 * status and is a lump of spinning plastic, and a licence pool is somebody
 * else's box answering over the wire.
 */
function servicesLines(api: GameApi, query: string): CommandResult {
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  // A Windows service list on a unix box is a category error the real
  // services.msc cannot make either - it manages the Windows Service Control
  // Manager, and neither family runs one.
  const unix = unixHostOf(api, query);

  if (unix !== null) {
    return notWindowsHost(
      unix,
      'services.msc lists the Windows Service Control Manager, which this box '
        + 'has none of.',
    );
  }

  const host = labelOf(found.node);
  const registered = api.graph.neighbors(found.node.id, {
    direction: 'in',
    edgeKind: 'runs_on',
  });

  if (registered.length === 0) {
    return lines(
      `Nothing is registered as running on ${host}.`,
      'This is either very clean or very wrong.',
    );
  }

  // Sorted by the column the table is headed with, which is how the real list
  // opens: the graph hands them back in id order, and a player scanning for a
  // name should not have to know that ids are short names.
  const byName = [...registered].sort(
    (left, right) => labelOf(left).localeCompare(labelOf(right)),
  );
  const services = byName.filter(
    (service) => isService(service.fields[FIELDS.serviceClass]),
  );
  const others = byName.filter(
    (service) => !isService(service.fields[FIELDS.serviceClass]),
  );
  const running = services.filter(
    (service) => service.fields[FIELDS.status] === SERVICE_STATUS.running,
  ).length;
  const role = machineRoleOf(found.node.fields[FIELDS.machineRole]);

  const row = (service: Readonly<ReadOnlyGraphNode>): string => {
    const startup = startupTypeOf(service.fields[FIELDS.startupType]);

    return `${pad(labelOf(service), NAME_COLUMN)}${
      pad(statusWord(service), STATUS_COLUMN)
    }${startup === null ? 'not recorded' : STARTUP_TYPE_LABELS[startup]}`;
  };

  return lines(
    `Services on ${host} (${MACHINE_ROLE_LABELS[role].toLowerCase()}) - ${
      String(services.length)
    } registered, ${String(running)} running`,
    '',
    `${pad('DISPLAY NAME', NAME_COLUMN)}${
      pad('STATUS', STATUS_COLUMN)
    }STARTUP TYPE`,
    `${pad('-'.repeat(NAME_COLUMN - 2), NAME_COLUMN)}${
      pad('-'.repeat(STATUS_COLUMN - 2), STATUS_COLUMN)
    }${'-'.repeat(STARTUP_COLUMN)}`,
    ...services.map(row),
    ...(others.length === 0
      ? []
      : [
        '',
        'Also on this box, reporting a status and not services:',
        ...others.map(
          (other) => `  ${pad(labelOf(other), NAME_COLUMN - 2)}${
            pad(statusWord(other), STATUS_COLUMN)
          }${
            serviceClassOf(other.fields[FIELDS.serviceClass])
              === SERVICE_CLASSES.hardware
              ? '[hardware, not restartable]'
              : '[not a service on this box]'
          }`,
        ),
      ]),
    '',
    `Bouncing one of these means naming the box too: "restart ${host}\\<name>".`,
    'Every machine in this building runs most of this list, so the name on '
      + 'its own',
    'is not an answer to which one you mean.',
  );
}

/**
 * `sc query <service>`, in the block the real one prints.
 *
 * It is here because it is the command a tech types when the list is not
 * enough, and because the state line answers a question the list cannot: the
 * manager's own word for what the service is doing, with the controls it will
 * accept beside it. Our third status - wedged - has no code of its own in a
 * real manager, and the honest reading of it is exactly what the block says:
 * running, and not answering.
 */
/**
 * The customer a discovery audit is aimed at, resolved by name (TILLMAN-FREIGHT)
 * or by id (`customer:tillman`, or the `tillman` after the colon) - the same
 * resolver every other target uses, pointed at the customer kind.
 *
 * The refusal is the honest base-desk answer as well: probation and Bodgeworth
 * have no customers, so `audit` there names nobody and says so - `audit` is an
 * MSP tool, and the desk it is typed on has none to map.
 */
function customerOf(api: GameApi, query: string): Lookup {
  return lookup(
    api,
    'customer',
    query,
    `No customer called "${query}". "audit" maps a managed customer's estate; `
      + 'this desk has none by that name.',
  );
}

/**
 * Discovery: the onboarding audit that enumerates a customer's estate off the
 * graph and surfaces what nobody wrote down (0.13.0).
 *
 * It reads the estate the same way `services` does - the machines that carry the
 * customer's id, and the services/units on each by its `runs_on` edges - so it
 * invents nothing; it is the map you did not have. The FINDINGS section is the
 * point of it: any backup service whose `backup_verified` field is false is a job
 * that reports success and cannot restore, and that is read straight off the node
 * (flip the field true and the finding is gone). The honest move on a finding is
 * to raise it, which the note says and the discovery ticket resolves on.
 */
function auditLines(api: GameApi, query: string): CommandResult {
  const found = customerOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const customerId = found.node.id;
  const name = customerName(api.graph, customerId);
  const scope = scopeOfCustomer(api.graph, customerId);
  const tier = slaTierOfCustomer(api.graph, customerId);
  const businessRaw = textValue(
    found.node.fields[FIELDS.customerBusinessType],
    'unrecorded',
  );
  const business = BUSINESS_TYPE_LABELS[businessRaw as BusinessType]
    ?? businessRaw;

  const machines = api.graph
    .nodesOfKind('machine')
    .filter((node) => customerIdOfMachine(node) === customerId)
    .sort((left, right) => labelOf(left).localeCompare(labelOf(right)));

  const out: string[] = [
    `Discovery audit - ${name} (${customerId})`,
    `Contract: ${scope === null ? 'unrecorded' : SERVICE_SCOPE_LABELS[scope]}`
      + `  |  SLA: ${tier === null ? 'unrecorded' : SLA_TIER_LABELS[tier]}`
      + `  |  Business: ${business}`,
    `Estate: ${String(machines.length)} machine(s), enumerated off the wire - `
      + 'no runbook required.',
    '',
  ];

  const findings: string[] = [];

  for (const machine of machines) {
    const host = labelOf(machine);
    const role = machineRoleOf(machine.fields[FIELDS.machineRole]);
    const os = machineOsOf(machine.fields[FIELDS.machineOs]);
    const services = api.graph
      .neighbors(machine.id, { direction: 'in', edgeKind: 'runs_on' })
      .filter((node) => node.kind === 'service' || node.kind === 'unit')
      .sort((left, right) => labelOf(left).localeCompare(labelOf(right)));

    out.push(
      `${host}  [${MACHINE_ROLE_LABELS[role]}, ${MACHINE_OS_LABELS[os]}]  - `
      + `${String(services.length)} service(s)`,
    );

    for (const service of services) {
      // A Windows service reads its status; a Linux unit reads its state, the
      // vocabulary each manager actually prints (0.7.0). The audit shows both,
      // because the estate is mixed and the point is an honest map.
      const state = service.kind === 'unit'
        ? textValue(service.fields[FIELDS.unitState], 'unknown')
        : statusWord(service);

      out.push(`    ${pad(labelOf(service), NAME_COLUMN - 4)}${state}`);

      // The horror, read off the node and nowhere else: a backup that reports
      // running while `backup_verified` says it has restored nothing.
      if (service.fields[FIELDS.backupVerified] === false) {
        const short = textValue(service.fields[FIELDS.serviceName], labelOf(service));
        const last = textValue(service.fields[FIELDS.backupLastSuccess], 'never');

        findings.push(
          `  ! ${host}\\${short}: backup job is ${statusWord(service)} and `
          + 'reports success nightly, but has no verified restore point since '
          + `${last} - it has been failing silently for months. Configured, `
          + 'green, and empty.',
        );
      }
    }

    out.push('');
  }

  out.push('FINDINGS');
  out.push('-'.repeat(NAME_COLUMN));

  if (findings.length === 0) {
    out.push(
      '  Nothing flagged. The estate reads clean - which, on a handover with no '
      + 'documentation behind it, is a thing to have checked rather than assumed.',
    );
  } else {
    out.push(...findings);
    out.push('');
    out.push(
      'A backup that reports success is not a backup you can restore from. '
      + 'Monitoring the job was never testing the restore. Raise the finding on '
      + 'the onboarding plan - do not just restart it and hope.',
    );
  }

  return lines(...out);
}

function scLines(api: GameApi, sub: string, query: string): CommandResult {
  if (sub !== 'query') {
    return lines(
      `"sc ${sub}" is not something this terminal does.`,
      'It does "sc query <service>". Starting and stopping are one verb here '
        + '- "restart <service>" - because a service left stopped is a change '
        + 'with a form attached, and a startup type is a change with two.',
    );
  }

  // `sc` genuinely cannot reach a service manager that is not Windows: it talks
  // to the Windows Service Control Manager, and no unix box runs one.
  const unix = unixHostOf(api, query);

  if (unix !== null) {
    return notWindowsHost(
      unix,
      'sc queries the Windows Service Control Manager, which this box does not '
        + 'run.',
    );
  }

  const found = serviceOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const service = found.node;
  const status = textValue(service.fields[FIELDS.status], SERVICE_STATUS.stopped);
  const stopped = status === SERVICE_STATUS.stopped;
  const short = service.fields[FIELDS.serviceName];

  if (typeof short !== 'string') {
    return lines(
      `The service manager has never heard of "${labelOf(service)}".`,
      'It reports a status because somebody wired a sensor to it, not because '
        + 'it is software. There is no service record to query.',
    );
  }

  return lines(
    `SERVICE_NAME: ${short}`,
    '        TYPE               : 10  WIN32_OWN_PROCESS',
    `        STATE              : ${stopped ? '1  STOPPED' : '4  RUNNING'}`,
    `                                (${
      stopped
        ? 'NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN'
        : 'STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN'
    })`,
    '        WIN32_EXIT_CODE    : 0  (0x0)',
    '        SERVICE_EXIT_CODE  : 0  (0x0)',
    '        CHECKPOINT         : 0x0',
    '        WAIT_HINT          : 0x0',
    ...(status === SERVICE_STATUS.wedged
      ? [
        '',
        'The manager says it is running. Everybody in the building says it is '
          + 'not,',
        'and both are true: it is up, it is not answering, and that is what '
          + 'this',
        'status means every time you meet it.',
      ]
      : []),
  );
}

/**
 * `tasklist`: what is OPEN on this desk, which is the boss's-eye view of the
 * slack mechanic.
 *
 * The browser is a process. Bubble Break is a process. They are on this list
 * while their windows are up and off it when they are closed, and a minimised
 * window is still running - which is the whole truth about the boss key, said
 * by the machine rather than by a tooltip. If the lead can read this box, so
 * can the player.
 */
function tasklistLines(api: GameApi, args: readonly string[]): CommandResult {
  const flag = (args[0] ?? '').toLowerCase();

  if (flag === '/s') {
    // The estate's own reason first - Remote Registry is Disabled everywhere -
    // and, when the box named is a unix one, the deeper one: tasklist /s speaks
    // Windows RPC to a Windows box, and neither half of it reaches this one.
    // The manager is named off the box, because "it runs systemd" said about a
    // Mac would be a second falsehood stacked on the first.
    const unix = unixHostOf(api, args[1] ?? '');

    return lines(
      'tasklist /s asks another machine what it is running, over the remote '
        + 'registry.',
      'Remote Registry is Disabled on every box in this building, which you '
        + 'can',
      'see for yourself in any services list. Nothing here can answer it.',
      ...(unix === null
        ? []
        : [
          '',
          `And ${unix.host} is not a Windows host besides: it runs `
            + `${serviceManagerOf(unix.os)}, and tasklist /s`,
          'speaks Windows RPC to a Windows box. Neither half of this reaches it.',
        ]),
    );
  }

  if (flag !== '') {
    return lines(
      `"${args[0] ?? ''}" is not a switch this tasklist has.`,
      'It knows /s, and it refuses that honestly.',
    );
  }

  const machine = playerMachine(api);

  if (machine === undefined) {
    return noWorkstation();
  }

  const programs = runningPrograms(api.appState.get().windows.open);

  return lines(
    `Processes on ${labelOf(machine)}:`,
    '',
    `${pad('Image Name', IMAGE_COLUMN)}${
      'PID'.padStart(PID_COLUMN)
    } ${pad('Session Name', SESSION_COLUMN)}${
      'Session#'.padStart(SESSION_NUMBER_COLUMN)
    } ${'Mem Usage'.padStart(MEMORY_COLUMN)}`,
    `${'='.repeat(IMAGE_COLUMN - 1)} ${'='.repeat(PID_COLUMN)} ${
      '='.repeat(SESSION_COLUMN - 1)
    } ${'='.repeat(SESSION_NUMBER_COLUMN)} ${'='.repeat(MEMORY_COLUMN)}`,
    ...programs.map(
      (program) => `${pad(program.image, IMAGE_COLUMN)}${
        String(program.pid).padStart(PID_COLUMN)
      } ${pad('Console', SESSION_COLUMN)}${
        '0'.padStart(SESSION_NUMBER_COLUMN)
      } ${`${thousands(program.memoryKb)} K`.padStart(MEMORY_COLUMN)}`,
    ),
    '',
    'A minimised window is a running program. The panic key moves what is on '
      + 'the',
    'screen and nothing at all on this list, which is worth knowing before '
      + 'somebody',
    'with a login and a grievance reads it back to you.',
  );
}

/** The queue's own columns: a job number, a size, and the minute it landed. */
const JOB_COLUMN = 6;
const JOB_SIZE_COLUMN = 14;

/**
 * `queue <printer>` - the jobs on it, and the spooler behind them.
 *
 * The world holds one line per job, a size and a minute, because that is what
 * a listing prints - and the spool directory on the print server IS that list,
 * so these rows and a `dir` on that directory are the same pile counted twice.
 * The job number is the spool file's own number for the same reason: a queue
 * that called job 3 something else from the file called 00003.SPL would be two
 * windows disagreeing about one thing.
 *
 * What is not here is what the world does not hold: nobody's name, no document
 * titles, no page counts. A real queue window has all three and this estate has
 * never known any of them.
 */
function queueLines(api: GameApi, query: string): CommandResult {
  const found = printerOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const printer = found.node;
  const depth = printer.fields[FIELDS.queueLen];
  const jobs = readSpoolJobs(printer.fields[FIELDS.spoolJobs]);
  const host = api.graph
    .neighbors(printer.id, { direction: 'out', edgeKind: 'connected_to' })
    .find((node) => node.kind === 'machine');
  // The spooler on the box this printer is plugged into, found by the name the
  // MACHINE knows it by rather than by the one on the screen: every print
  // server in this building runs a `Spooler`, and the one on PRINT-01 is
  // called "Print Spooler" because a ticket is about it.
  const spooler = host === undefined
    ? undefined
    : api.graph
      .neighbors(host.id, { direction: 'in', edgeKind: 'runs_on' })
      .find((node) => node.fields[FIELDS.serviceName] === 'Spooler');

  const total = jobs.reduce((sum, job) => sum + job.bytes, 0);
  const spoolerLine = spooler === undefined
    ? 'No spooler is registered for it, which explains a great deal.'
    : `Spooler on ${labelOf(host ?? printer)} reports ${statusWord(spooler)}.`;

  if (jobs.length === 0) {
    return lines(
      `${labelOf(printer)}: ${
        typeof depth === 'number' ? String(depth) : 'an unknown number of'
      } job(s) queued.`,
      spoolerLine,
    );
  }

  return lines(
    `Print queue on ${labelOf(printer)}`,
    '',
    `${'Job'.padStart(JOB_COLUMN)} ${
      'Size'.padStart(JOB_SIZE_COLUMN)
    }  Submitted`,
    `${'-'.repeat(JOB_COLUMN)} ${'-'.repeat(JOB_SIZE_COLUMN)}  ${
      '-'.repeat(17)
    }`,
    ...jobs.map((job, index) => `${
      String(index + 1).padStart(JOB_COLUMN)
    } ${thousands(job.bytes).padStart(JOB_SIZE_COLUMN)}  ${job.modified}`),
    '',
    `${labelOf(printer)}: ${
      typeof depth === 'number' ? String(depth) : 'an unknown number of'
    } job(s) queued, ${thousands(total)} bytes.`,
    spoolerLine,
    // The half a count never said out loud, and the half that is the
    // diagnosis: four jobs of exactly the same size are one delivery note
    // somebody has now sent four times.
    'Nobody\'s name is on any of these. A spool file is numbered and sized '
      + 'and nothing else, which is why the sizes are worth reading.',
  );
}

/**
 * Every mutating verb this terminal sends, as the lines it prints back.
 *
 * The decision behind it - the wrong-tenant STOP, the contract's scope walls,
 * and the RACI stamp written after a success on somebody else's box - lives in
 * `remediation.ts` and is shared with the windows that send the same verbs at
 * the same boxes. This function is what the terminal ADDS to it: three kinds of
 * result turned into three kinds of printed page. The guards themselves are not
 * the terminal's, and were only ever the terminal's by accident.
 */
function dispatchLines(
  api: GameApi,
  action: string,
  target: string,
  params: Record<string, string | number>,
  success: readonly string[],
): CommandResult {
  const result = dispatchRemediation(api, action, target, params);

  switch (result.kind) {
    // The seam's own refusal - the tenant STOP or the contract wall - printed
    // on the lines it was written to be wrapped onto, and nothing moved.
    case 'refused':
      return lines(...result.lines);
    // The world's refusal: its reason, in its words.
    case 'failed':
      return lines(result.reason);
    case 'done':
      return lines(...success);
  }
}

/**
 * The change-request verb (0.10.0): `changereq file <service>` files one for
 * restarting that service - the risky/out-of-scope action the 0.8.0 scope engine
 * refuses - and `changereq list` reads back what has been filed and where each
 * one's review has got to.
 *
 * Filing is paperwork: it always succeeds (or answers that no request is needed
 * for an in-scope target), and it never dispatches the risky action - the CONSULT
 * in the scope pre-flight is the only thing that ever lets that through, once the
 * request it names is approved and inside its window. The world does the deciding
 * and applies the node; this only resolves which service the player meant.
 */
function changeRequestCommandLines(
  api: GameApi,
  sub: string,
  query: string,
): CommandResult {
  if (sub === 'list') {
    return lines(...changeRequestListing(api.graph, api.clock.now()));
  }

  if (sub !== 'file') {
    return lines(
      `"changereq ${sub}" is not something this terminal does.`,
      'It does "changereq file <service>" - to authorise restarting one the '
        + 'contract',
      'does not cover - and "changereq list", to read back what has been filed.',
    );
  }

  // An EDGE BOX is the one machine you can file against (E10, 0.29.0), and the
  // verb it authorises is the cutover rather than a restart: moving a site's
  // circuit is the change, and it is a change on a box rather than on anything
  // running on one. Everything else still resolves a service, so no existing
  // filing moves - a query that names no firewall never reaches this branch.
  const box = machineOf(api, query);

  if (box.ok
    && machineRoleOf(box.node.fields[FIELDS.machineRole]) === MACHINE_ROLES.firewall) {
    return lines(
      ...api.day.fileChangeRequest(box.node.id, PROJECT_ACTIONS.cutover),
    );
  }

  const found = serviceOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  return lines(
    ...api.day.fileChangeRequest(found.node.id, HELPDESK_ACTIONS.serviceRestart),
  );
}

/* -- the edge replacement (E10, 0.29.0) ----------------------------------- */

/**
 * `fw` - the project's verbs, and the only surface slice 1 gives them.
 *
 * Seven sub-commands, and the split between them is the split in the job: two
 * READS that change nothing (`status`, the plan against the clock; `rules`, what
 * the box is carrying), two AUDITS that are the same task done two different
 * ways, one per-rule migration, and the cable, out and back.
 *
 * It is gated on the PROMOTION, like ssh and for the same reason: a project is
 * not service-desk work. A Tier-2 player typing this gets told so rather than
 * finding a verb that half works.
 */
function fwLines(
  api: GameApi,
  sub: string,
  query: string,
): CommandResult {
  if (!isSystemsEngineer(api.graph.getField(api.actor, FIELDS.playerTier))) {
    return lines(
      'fw: this is not service-desk work.',
      'Projects are the engineers\' tier - planned work, with dates on it and a '
        + 'change',
      'window in the middle. It arrives with the promotion, along with ssh.',
    );
  }

  if (sub === 'status') {
    const board = api.day.projectBoard();

    return board.length === 0
      ? lines(
        'No project is running.',
        'A project is assigned, not picked up: when there is one, this is the '
          + 'plan against the clock.',
      )
      // And the two colours side by side (0.30.0, slice 3): what was reported
      // today, and what the plan says. Both are reads - the second is the same
      // derivation the board above it is drawn from - and putting them on the
      // same screen is the whole of the watermelon being legible.
      : lines(...board, ...api.day.projectReportReadout());
  }

  /**
   * `fw report <green|amber|red>` - the weekly status, filed.
   *
   * It lives in the `fw` family rather than on the Projects board because the
   * board is read-mostly by design: the verbs live where the work does, and
   * this is a verb. It is the only one in the family that changes nothing about
   * the estate - what it writes is a COLOUR, beside the derivation, never over
   * it - and the terminal says out loud what the plan says in the same breath,
   * because a report filed without the truth beside it is a mechanic the player
   * cannot see the shape of.
   */
  if (sub === 'report') {
    const rag = query.trim().toLowerCase();

    if (!isProjectRag(rag)) {
      return lines(
        `"${query}" is not a status. It is green, amber or red.`,
        'Green is on track, amber is at risk, red is in trouble. What the plan '
          + 'says is on "fw status"; what you file here is what the business '
          + 'is told.',
      );
    }

    if (api.day.projectView() === null) {
      return lines('There is no project to report on.');
    }

    const honest = api.day.projectHonestRag();
    const result = api.day.reportProject(rag);

    return result.ok
      ? lines(
        `Status filed: ${RAG_LABELS[rag].toUpperCase()}.`,
        ...api.day.projectReportReadout(),
        rag === honest
          ? 'Which is what the dates say. Nobody will ever ask you about it.'
          : rag === 'red'
            ? 'Which is worse than the dates say. Somebody will want half an '
              + 'hour on it in the morning.'
            : 'Which is better than the dates say. It costs nothing today.',
      )
      : lines(result.reason);
  }

  if (sub === 'rules') {
    return fwRuleLines(api, query);
  }

  if (sub === 'audit' || sub === 'pack') {
    const found = machineOf(api, query);

    if (!found.ok) {
      return lines(found.reason);
    }

    return sub === 'audit'
      ? fwAuditLines(api, found.node.id)
      : fwPackLines(api, found.node.id);
  }

  if (sub === 'migrate') {
    const found = serviceOf(api, query);

    if (!found.ok) {
      return lines(found.reason);
    }

    const result = api.dispatch(
      PROJECT_ACTIONS.migrateRule,
      api.actor,
      found.node.id,
      {},
    );

    return result.ok
      ? lines(
        `Carried onto ${
          labelOf(api.graph.getNode(ARDEN_EDGE_ESTATE.newBoxId)
            ?? found.node)
        }: ${labelOf(found.node)}`,
        'One rule. It does not take effect for anybody until the circuit moves.',
      )
      : lines(result.reason);
  }

  if (sub === 'cutover') {
    const found = machineOf(api, query);
    return found.ok ? lines(...api.day.cutover(found.node.id)) : lines(found.reason);
  }

  if (sub === 'rollback') {
    const found = machineOf(api, query);
    return found.ok ? lines(...api.day.rollback(found.node.id)) : lines(found.reason);
  }

  return lines(
    `"fw ${sub}" is not something this terminal does.`,
    'It does "fw status" (the plan against the clock), "fw rules <box>" (what a '
      + 'box',
    'is carrying), "fw audit <box>" (read the live configuration) and "fw pack '
      + '<box>"',
    '(take the handover pack as the audit), "fw migrate <rule>", "fw report '
      + '<green|amber|red>",',
    'and "fw cutover <box>" with "fw rollback <box>" behind it.',
  );
}

/**
 * `timesheet` - the week as the records have it, and what you say it was
 * (0.30.0, slice 1).
 *
 * The terminal is the minimum surface, deliberately: the sheet is a READ of the
 * derivation plus three edits, and the whole of what this file does is print
 * the one and pass the other three through the driver's verbs. Nothing here
 * computes an hour - it cannot, there is exactly one place that turns records
 * into minutes and it is `deriveTimesheet` - so a sheet on a screen and a sheet
 * a customer is sent are the same arithmetic by construction.
 */
function timesheetLines(
  api: GameApi,
  sub: string,
  args: readonly string[],
): CommandResult {
  const sheet = api.day.timesheet();

  if (sub === '' || sub === 'status') {
    // And the two OTHER readers of the same week (0.30.0, slice 2), under it
    // rather than in it: what the business makes of the total, and any account
    // that has got as far as asking about a line. Both are reads of the same
    // sheet - nothing here recomputes a minute - and the accounts row is empty
    // in every week nobody padded, which is most of them.
    return lines(...renderTimesheet(sheet, api.day.day(), {
      utilisation: utilisationLine(api.day.timesheetUtilisation()),
      accounts: api.day.invoiceStanding()
        .filter((row) => row.delivered !== 'none')
        .map((row) => `    ${row.label}: ${
          INVOICE_RUNG_LABELS[row.delivered].toLowerCase()
        }. It is in the mail.`),
    }));
  }

  if (sub === 'submit') {
    const result = api.day.submitTimesheet();

    return result.ok
      ? lines(
        'Timesheet submitted.',
        sheet.shape === 'single_bucket'
          ? 'One line a day, seven and a half hours each, and it was done before '
            + 'the sigh finished.'
          : 'It is on the invoice run now. What the records say is still on the '
            + 'records, which is the half nobody edits.',
      )
      : lines(result.reason);
  }

  if (sub === 'claim' || sub === 'vague' || sub === 'detail') {
    const handle = args[1] ?? '';

    if (handle.length === 0) {
      return lines(
        `"timesheet ${sub}" needs a line to be about.`,
        'The handles are day.line and they are printed down the left of the '
          + 'sheet: "timesheet claim 3.2 120".',
      );
    }

    if (sub !== 'claim') {
      const result = api.day.claimTimesheet(
        handle,
        null,
        sub === 'vague' ? 'vague' : 'detailed',
      );

      return result.ok
        ? lines(
          sub === 'vague'
            ? `Line ${handle} now reads "consulting".`
            : `Line ${handle} carries the date, the estate and the job again.`,
          sub === 'vague'
            ? 'It is quicker to write and it is the first thing a finance team '
              + 'picks out of an invoice, whether or not it was true.'
            : 'A line that says what was done survives being gone through, '
              + 'which is what detail is actually for.',
        )
        : lines(result.reason);
    }

    const said = args[2] ?? '';
    const minutes = Number(said);

    if (
      said.length === 0
      || !Number.isSafeInteger(minutes)
      || minutes < 0
    ) {
      return lines(
        `"${said}" is not a number of minutes.`,
        'Claim a line in whole minutes: "timesheet claim 3.2 120" is two hours '
          + 'against line 3.2.',
      );
    }

    const found = lineAt(sheet, handle);
    const result = api.day.claimTimesheet(handle, minutes, null);

    if (!result.ok) {
      return lines(result.reason);
    }

    const derived = found?.line.derived ?? 0;

    return lines(
      `Line ${handle}: ${hoursLabel(minutes)} claimed against ${
        hoursLabel(derived)
      } worked.`,
      minutes > derived
        ? 'The records still say what they said. So will the breakdown, if '
          + 'anybody asks for one.'
        : 'Under what the records have. Nobody will ever query that.',
    );
  }

  return lines(
    `"timesheet ${sub}" is not something this terminal does.`,
    'It does "timesheet" (the week so far, worked against claimed), "timesheet '
      + 'claim',
    '<line> <minutes>", "timesheet vague <line>" and "timesheet detail <line>", '
      + 'and',
    '"timesheet submit", which is due at the end of Friday whether you press it '
      + 'or not.',
  );
}

/** One rule as a listing row: what it is, and where it has got to. */
function fwRuleRow(
  rule: Readonly<ReadOnlyGraphNode>,
  migrated: boolean,
): string {
  const short = textValue(rule.fields[FIELDS.serviceName], rule.id);
  const kind = textValue(rule.fields[FIELDS.fwRuleClass], 'rule');

  return `  ${pad(short, 16)}${pad(kind, 9)}${
    migrated ? 'carried' : 'on the old box only'
  }  ${labelOf(rule)}`;
}

/**
 * `fw rules <box>` - what this box is carrying, AS FAR AS ANYBODY KNOWS.
 *
 * The qualification is the mechanic. Before anybody has read the box, the only
 * list that exists is the handover pack's, so that is the list this prints - and
 * it says so, in the line underneath, without saying what is missing from it.
 * After a live-config read it prints everything, and flags what the pack never
 * had. The terminal is not allowed to know more than the world does.
 */
function fwRuleLines(api: GameApi, query: string): CommandResult {
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const box = found.node;
  const source = auditSourceOf(box.fields[FIELDS.fwAuditSource]);
  const rules = projectRules(api.graph, ARDEN_EDGE_ESTATE.projectId)
    .filter((rule) => api.graph
      .neighbors(rule.id, { direction: 'out', edgeKind: 'runs_on' })
      .some((owner) => owner.id === box.id));

  if (rules.length === 0) {
    return lines(
      `${labelOf(box)} is not carrying a rule set this desk has a copy of.`,
      'The box a replacement is FROM carries the rules; the one it is to '
        + 'carries what you have put on it.',
    );
  }

  const known = rules.filter((rule) => ruleIsKnown(rule, source));
  const unknown = rules.length - known.length;

  return lines(
    `Rule set - ${labelOf(box)}`,
    ...known.map((rule) => fwRuleRow(rule, ruleIsMigrated(rule))),
    '',
    source === AUDIT_SOURCES.config
      ? `Read off the box. ${String(rules.length)} rule(s), which is what is `
        + 'actually running on it.'
      : `From the handover pack: ${String(known.length)} rule(s), as written `
        + 'down in 2019.',
    ...(source === AUDIT_SOURCES.config
      ? []
      : [
        'A pack is a record of what somebody meant to configure on the day they '
          + 'wrote it.',
        `"fw audit ${labelOf(box)}" reads the live configuration instead, which `
          + 'is the',
        'only source that knows what the box is doing this morning.',
      ]),
    ...(unknown > 0 && source === AUDIT_SOURCES.config
      ? [
        `${String(unknown)} of those were not in the pack.`,
      ]
      : []),
  );
}

/** `fw audit <box>` - the live-config read, and what it turns up. */
function fwAuditLines(api: GameApi, boxId: string): CommandResult {
  const result = api.dispatch(PROJECT_ACTIONS.auditConfig, api.actor, boxId, {});

  if (!result.ok) {
    return lines(result.reason);
  }

  const rules = projectRules(api.graph, ARDEN_EDGE_ESTATE.projectId)
    .filter((rule) => api.graph
      .neighbors(rule.id, { direction: 'out', edgeKind: 'runs_on' })
      .some((owner) => owner.id === boxId));
  const undocumented = rules.filter(
    (rule) => rule.fields[FIELDS.fwRuleDocumented] !== true,
  );
  const box = api.graph.getNode(boxId);

  return lines(
    `Live configuration read off ${box === undefined ? boxId : labelOf(box)}.`,
    ...rules.map((rule) => fwRuleRow(rule, ruleIsMigrated(rule))),
    '',
    `${String(rules.length)} rule(s) on the box.`,
    ...(undocumented.length === 0
      ? ['Every one of them is in the handover pack, which is rarer than it '
        + 'sounds.']
      : [
        `${String(undocumented.length)} of them are not in the handover pack. `
        + 'They are',
        'running anyway, and something on that site is depending on each one.',
      ]),
    'The audit is signed off. What is on this list is what has to be on the new '
      + 'box.',
  );
}

/** `fw pack <box>` - signing the audit off on somebody else's paperwork. */
function fwPackLines(api: GameApi, boxId: string): CommandResult {
  const result = api.dispatch(PROJECT_ACTIONS.auditPack, api.actor, boxId, {});

  if (!result.ok) {
    return lines(result.reason);
  }

  const box = api.graph.getNode(boxId);
  const known = projectRules(api.graph, ARDEN_EDGE_ESTATE.projectId)
    .filter((rule) => rule.fields[FIELDS.fwRuleDocumented] === true);

  return lines(
    `Handover pack accepted as the audit of ${
      box === undefined ? boxId : labelOf(box)
    }.`,
    ...known.map((rule) => fwRuleRow(rule, ruleIsMigrated(rule))),
    '',
    `${String(known.length)} rule(s), per the pack. The audit is signed off and `
      + 'the',
    'staging config is the list above - which is a bet that the pack is '
      + 'current.',
  );
}

/**
 * The coordinate-then-act verb (0.11.0): `notify <service>` tells a co-managed
 * customer's OWN IT that the MSP is about to touch that service's box, files the
 * coordination notice, and thereby clears the action the scope pre-flight would
 * otherwise refuse - the RACI heads-up made a real step rather than a courtesy.
 *
 * Filing is paperwork, exactly like a change request: it never dispatches the
 * action itself - the CONSULT in the scope pre-flight is the only thing that
 * lets that through, once a notice for the target exists. On an in-house box, or
 * a customer whose contract is not co-managed, it answers that no notice is
 * needed rather than filing one nobody's IT would know what to do with. The
 * world does the deciding and applies the node; this only resolves which service
 * the player meant.
 */
function notifyCommandLines(api: GameApi, query: string): CommandResult {
  const found = serviceOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  return lines(...api.day.fileCoordination(found.node.id));
}

/**
 * How the terminal spells the four approved identity-proofing channels.
 *
 * Short words because a player types them, and a fixed list because the point
 * of an approved channel is that it is a list. `verify praval` used to be the
 * whole command, which recorded that somebody had been proved to be themselves
 * on the strength of nothing at all.
 */
const VERIFY_SUBCOMMANDS: Readonly<Record<string, VerificationMethod>> = {
  callback: VERIFICATION_METHODS.callback,
  code: VERIFICATION_METHODS.recoveryCode,
  inperson: VERIFICATION_METHODS.inPerson,
  contact: VERIFICATION_METHODS.recoveryContact,
};

/**
 * The three account verbs the modern half of the week needs, and the sentences
 * they answer with.
 *
 * `verify` is the one that changes nothing anybody can see. That is the point:
 * it writes down HOW a human being checked, on a ticket, at a minute, and the
 * only thing it ever affects is what a report says about you a day later.
 */
function accountVerbLines(
  api: GameApi,
  verb: 'verify' | 'mfa' | 'revoke',
  query: string,
  method = '',
): CommandResult {
  const found = accountOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const label = labelOf(found.node);

  switch (verb) {
    case 'verify': {
      const chosen = VERIFY_SUBCOMMANDS[method];

      if (chosen === undefined) {
        return lines(
          `"${method}" is not a way of proving who somebody is.`,
          `Pick one of: ${Object.keys(VERIFY_SUBCOMMANDS).join(', ')}.`,
          'What an account HAS was arranged before the call. What a caller',
          'can tell you was not, however much of it they know.',
        );
      }

      return dispatchLines(
        api,
        HELPDESK_ACTIONS.accountVerifyIdentity,
        found.node.id,
        { method: chosen },
        [
          `Identity check recorded against ${label}: ${
            VERIFICATION_METHOD_LABELS[chosen]
          }.`,
          'Nothing else about the account has changed, which is the whole of',
          'what this verb is for - and the METHOD is on the record, because',
          '"verified" is not an answer to how.',
        ],
      );
    }
    case 'mfa':
      return dispatchLines(
        api,
        HELPDESK_ACTIONS.accountRegisterMfa,
        found.node.id,
        {},
        [
          `New authenticator enrolled for ${label}.`,
          'The previous binding has been invalidated, and a recovery notice',
          'has gone to the address on file - so if this was not them, they',
          'find out today rather than in somebody else\'s report.',
          'Whoever holds the new one is, as far as this directory is',
          'concerned, them.',
        ],
      );
    default:
      return dispatchLines(
        api,
        HELPDESK_ACTIONS.accountRevokeSessions,
        found.node.id,
        {},
        [
          `Every session for ${label} has been signed out.`,
          'They will be asked for a code on the next thing they touch, which',
          'is fine if they have one.',
        ],
      );
  }
}

/** Moving a seat, which is two halves and only ever works in one order. */
function licenceLines(
  api: GameApi,
  sub: string,
  query: string,
): CommandResult {
  if (sub !== 'take' && sub !== 'give') {
    return lines(
      `"licence ${sub}" is not something this terminal does.`,
      'It does "licence take <account>" and "licence give <account>", in '
        + 'that order, because the second one is refused while the pool is '
        + 'full.',
    );
  }

  const pool = licencePool(api);

  if (pool === undefined) {
    return lines(
      'There is no licence pool on this estate, which would be a relief if it '
        + 'were true.',
    );
  }

  const found = accountOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const free = pool.fields[FIELDS.seatsFree];
  const seats = typeof free === 'number' ? free : 0;

  return sub === 'take'
    ? dispatchLines(
      api,
      HELPDESK_ACTIONS.accountRevokeLicence,
      found.node.id,
      { pool: pool.id },
      [
        `Seat reclaimed from ${labelOf(found.node)}.`,
        `${String(seats + 1)} seat(s) free on ${labelOf(pool)}.`,
      ],
    )
    : dispatchLines(
      api,
      HELPDESK_ACTIONS.accountAssignLicence,
      found.node.id,
      { pool: pool.id },
      [
        `Seat assigned to ${labelOf(found.node)}.`,
        `${String(Math.max(0, seats - 1))} seat(s) free on ${labelOf(pool)}.`,
      ],
    );
}

/**
 * Access on a share, which is the only two-noun verb on this terminal: the
 * person and the thing, in the order a human says them.
 */
function grantLines(api: GameApi, args: readonly string[]): CommandResult {
  const account = accountOf(api, args[0] ?? '');

  if (!account.ok) {
    return lines(account.reason);
  }

  const share = lookup(
    api,
    'share',
    args[1] ?? '',
    `No share matches "${args[1] ?? ''}". They are named after what is in `
      + 'them, which is the last helpful thing about any of them.',
  );

  if (!share.ok) {
    return lines(share.reason);
  }

  return dispatchLines(
    api,
    HELPDESK_ACTIONS.shareGrantAccess,
    share.node.id,
    { account: account.node.id },
    [
      `${labelOf(account.node)} now has Full Access to `
        + `${labelOf(share.node)}.`,
      'Which lets them open it and read it. Whether it lets them SEND from',
      'it is a different permission with a different name, and they will be',
      'back about it within the hour.',
    ],
  );
}

function rotateLines(
  api: GameApi,
  args: readonly string[],
): CommandResult {
  const found = machineOf(api, args[0] ?? '');

  if (!found.ok) {
    return lines(found.reason);
  }

  const requested = Number(args[1]);

  if (!isRotation(requested)) {
    return lines(
      `"${args[1] ?? ''}" is not an angle this monitor stand recognises.`,
      'Pick one of 0, 90, 180 or 270.',
    );
  }

  return dispatchLines(
    api,
    HELPDESK_ACTIONS.machineSetDisplayRotation,
    found.node.id,
    { rotation: requested },
    [
      `${labelOf(found.node)} display set to ${String(requested)} degrees.`,
      requested === 0
        ? 'It is readable from the intended chair again. No hackers were '
          + 'involved at any point.'
        : 'Whoever asked for this had better be sure.',
    ],
  );
}

/* -- the looking commands ------------------------------------------------- */

/**
 * The address family, and the one thing they all have in common: they READ.
 *
 * Not one of them dispatches. That is the shape of the job rather than a
 * limitation of the terminal - first line looks with `ipconfig`, `tracert`,
 * `nslookup`, `whoami` and `systeminfo`, and fixes with about four verbs - and
 * `ipconfig /flushdns` is in here rather than beside `restart` precisely
 * because it is the most-typed command in support that has never once fixed
 * anything the person typing it was looking at.
 */

/** The maximum a real tracert prints in its header, and never reaches here. */
const MAX_HOPS = 30;

function accountOfActor(api: GameApi): ReadOnlyGraphNode | undefined {
  return api.graph
    .neighbors(api.actor, { direction: 'out', edgeKind: 'owns' })
    .find((node) => node.kind === 'account');
}

function noWorkstation(): CommandResult {
  return lines(
    'There is no workstation signed out to you, which the asset register '
      + 'has always insisted is fine.',
    'Whatever you are typing this on does not officially exist.',
  );
}

function adapterLines(
  machine: Readonly<ReadOnlyGraphNode>,
  all: boolean,
): readonly string[] {
  const hostname = labelOf(machine);
  const address = addressOf(machine.id);

  return [
    `${COMPANY.domain} IP Configuration`,
    '',
    'Ethernet adapter Local Area Connection:',
    '',
    `   Connection-specific DNS Suffix  . : ${DNS_SUFFIX}`,
    ...(all
      ? [
        '   Description . . . . . . . . . . . : Beige Ethernet Adapter (rev C)',
        `   Physical Address. . . . . . . . . : ${macOf(machine.id)}`,
        '   DHCP Enabled. . . . . . . . . . . : Yes',
      ]
      : []),
    `   IPv4 Address. . . . . . . . . . . : ${address}`,
    '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
    `   Default Gateway . . . . . . . . . : ${GATEWAY}`,
    ...(all
      ? [
        `   DHCP Server . . . . . . . . . . . : ${GATEWAY}`,
        `   DNS Servers . . . . . . . . . . . : ${GATEWAY}`,
        `   Host Name . . . . . . . . . . . . : ${hostname}`,
        '',
        'One subnet, one gateway, one box doing all three jobs. Every '
          + 'address in this building',
        'is on the other side of that one plug.',
      ]
      : []),
  ];
}

function ipconfigLines(api: GameApi, flag: string): CommandResult {
  const switchName = flag.toLowerCase();

  if (switchName === '/flushdns') {
    // A gag, and a true one: it prints the sentence, it changes nothing in the
    // world, and it is the most-typed command in support for that reason.
    return lines(
      `${COMPANY.domain} IP Configuration`,
      '',
      'Successfully flushed the DNS Resolver Cache.',
      'Nothing that was wrong a moment ago is right now. The ritual has been',
      'observed and may be reported as such.',
    );
  }

  if (switchName !== '' && switchName !== '/all') {
    return lines(
      `"${flag}" is not a switch this ipconfig has.`,
      'It knows /all and /flushdns. The rest were on the other machine.',
    );
  }

  const machine = playerMachine(api);

  return machine === undefined
    ? noWorkstation()
    : lines(...adapterLines(machine, switchName === '/all'));
}

function whoamiLines(api: GameApi, flag: string): CommandResult {
  const switchName = flag.toLowerCase();

  if (switchName !== '' && switchName !== '/groups') {
    return lines(
      `"${flag}" is not a switch this whoami has. It knows /groups.`,
    );
  }

  const account = accountOfActor(api);

  if (account === undefined) {
    return lines(
      `${COMPANY.domain}\\nobody`,
      'You are logged in as an account the directory has no record of, which '
        + 'is either a bug or a promotion.',
    );
  }

  const identity = `${COMPANY.domain.toLowerCase()}\\${labelOf(account)}`;

  if (switchName !== '/groups') {
    return lines(
      identity,
      // The whole point of the command in the trade: people fix the wrong
      // account for twenty minutes because they never checked this line.
      'That is the account this session is running as, whatever the sticker '
        + 'on the front of the machine says.',
    );
  }

  const groups = api.graph.neighbors(account.id, {
    direction: 'out',
    edgeKind: 'member_of',
  });

  return lines(
    identity,
    '',
    'GROUP INFORMATION',
    '-----------------',
    ...(groups.length === 0
      ? ['(none, which is why half of this building does not work for you)']
      : groups.map(
        (group) => `  ${COMPANY.domain}\\${labelOf(group)}`,
      )),
  );
}

function systeminfoLines(api: GameApi, query: string): CommandResult {
  // No argument means this desk, which is what a tech types nine times out of
  // ten; a name means somebody else's, and a name nobody answers to is the
  // same refusal `ping` gives, in the same words.
  const found = query.trim().length > 0 ? machineOf(api, query) : null;

  if (found !== null && !found.ok) {
    return lines(found.reason);
  }

  const machine = found === null ? playerMachine(api) : found.node;

  if (machine === undefined) {
    return noWorkstation();
  }

  // systeminfo reads a Windows box - its version, services and hardware are WMI
  // facts a unix box does not hold in a form this terminal can pull. Printing
  // this world's Windows labels over a systemd box or a Mac would invent the one
  // thing the family rule forbids: a fact the box does not hold.
  const systeminfoOs = machineOsOf(machine.fields[FIELDS.machineOs]);

  if (query.trim().length > 0 && isUnixFamily(systeminfoOs)) {
    return notWindowsHost(
      { host: labelOf(machine), os: systeminfoOs },
      'systeminfo reads a Windows box; its version and services are not facts '
        + `this terminal can pull from ${familyPhrase(systeminfoOs)}.`,
    );
  }

  const booted = machine.fields[FIELDS.uptimeSince];
  const services = api.graph.neighbors(machine.id, {
    direction: 'in',
    edgeKind: 'runs_on',
  });
  // Attached hardware is hardware that is attached: the printer plugged into
  // the print server, the monitor on the desk. The thirteen boxes that PRINT
  // through that server are on the other end of a wire and are clients, not
  // hardware - listing them under this heading was the row saying something
  // false about every machine on it.
  const devices = api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'connected_to' })
    .filter((node) => node.kind === 'device');
  const role = machineRoleOf(machine.fields[FIELDS.machineRole]);

  return lines(
    `Host Name:                 ${labelOf(machine)}`,
    `OS Name:                   ${COMPANY.domain} ${MACHINE_ROLE_LABELS[role]}`,
    'OS Version:                4.10.1998, Service Pack (declined)',
    `Domain:                    ${DNS_SUFFIX}`,
    `System Boot Time:          ${
      typeof booted === 'number'
        ? formatSimTime(booted).time
        : 'unrecorded - it has been up since before anybody here was'
    }`,
    `Processor(s):              ${
      textValue(machine.fields[FIELDS.processor], 'one, presumably')
    }`,
    `Total Physical Memory:     ${
      textValue(
        machine.fields[FIELDS.memory],
        'as much as it shipped with, which nobody wrote down',
      )
    }`,
    `Display Resolution:        ${
      textValue(machine.fields[FIELDS.resolution], 'whatever it came with')
    }`,
    `Pending Updates:           ${
      machine.fields[FIELDS.pendingUpdates] === true
        ? 'Yes (scheduled for a convenient moment, since 1998)'
        : 'None outstanding'
    }`,
    // A count and where the list is, rather than the list: twenty-odd service
    // names on one line is not a readout, and the real systeminfo has never
    // printed services at all.
    `Registered Services:       ${String(
      services.filter(
        (service) => isService(service.fields[FIELDS.serviceClass]),
      ).length,
    )} ("services ${labelOf(machine)}" for the list)`,
    `Attached Hardware:         ${
      devices.length === 0 ? 'none' : devices.map(labelOf).join(', ')
    }`,
  );
}

function tracertLines(api: GameApi, query: string): CommandResult {
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const target = found.node;
  const header = `Tracing route to ${fqdn(labelOf(target))} [${
    addressOf(target.id)
  }]`;
  const origin = playerMachine(api);

  if (origin === undefined) {
    return noWorkstation();
  }

  if (origin.id === target.id) {
    return lines(
      header,
      `over a maximum of ${String(MAX_HOPS)} hops:`,
      '',
      traceLine(1, labelOf(target), target.id),
      '',
      'Trace complete. It is this machine. You are sitting on the far end of '
        + 'that route.',
    );
  }

  const route = routeTo(api, target);

  if (route === null) {
    // Three stars and a stop, exactly as the real one gives up - and the last
    // line says the useful half: the wire, not the name, is what failed.
    return lines(
      header,
      `over a maximum of ${String(MAX_HOPS)} hops:`,
      '',
      '  1     *        *        *     Request timed out.',
      '  2     *        *        *     Request timed out.',
      '  3     *        *        *     Request timed out.',
      '',
      `Trace incomplete. Nothing on this network admits to knowing a way to ${
        labelOf(target)
      },`,
      'which is a cabling answer rather than a name-resolution one.',
    );
  }

  const hops = route.slice(1).map((id, index) => {
    const node = api.graph.getNode(id);
    return traceLine(index + 1, node === undefined ? id : labelOf(node), id);
  });

  return lines(
    header,
    `over a maximum of ${String(MAX_HOPS)} hops:`,
    '',
    ...hops,
    '',
    // The gag IS the estate: everything in this building goes through the one
    // box, and the trace is where a player sees that for themselves.
    'Trace complete. Every route out of this desk goes through the same box, '
      + 'which is',
    'either elegant or the reason Thursday happens.',
  );
}

function nslookupLines(api: GameApi, query: string): CommandResult {
  const header = [
    `Server:  ${NAME_SERVER}`,
    `Address:  ${GATEWAY}`,
    '',
  ];
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(
      ...header,
      `*** ${NAME_SERVER} can't find ${query}: Non-existent domain`,
      'The name server only knows the machines. People, printers and '
        + 'grievances are filed elsewhere.',
    );
  }

  return lines(
    ...header,
    `Name:    ${fqdn(labelOf(found.node))}`,
    `Address:  ${addressOf(found.node.id)}`,
    '',
    // Resolution proves a name maps to a number. It proves nothing else, and
    // the terminal has one job here: not to let the player stop looking.
    'The name resolves. That is all it means - the box behind it may still be '
      + 'on fire.',
  );
}

/**
 * The four commands that read the drive.
 *
 * They are the one family that needs to know WHERE the terminal is standing,
 * so they take a session and hand back the one it leaves behind. Everything
 * about paths, listings and file contents is decided in `world/fs.ts` and
 * shaped in `cmd-files.ts`; what happens here is the same thing that happens
 * for every other command - the workstation this terminal is on is found, or
 * the estate admits it does not have one.
 */
function fileCommandLines(
  parsed: Extract<ParsedCommand, { kind: 'command' }>,
  api: GameApi,
  cwd: readonly string[],
): CommandResult {
  const machine = playerMachine(api);

  if (machine === undefined) {
    return noWorkstation();
  }

  const account = accountOfActor(api);
  const session: TerminalSession = {
    machineId: machine.id,
    cwd,
    username: account === undefined ? null : labelOf(account),
  };

  const dispatch = (
    action: string,
    target: string,
    params: Readonly<Record<string, string>>,
  ): DispatchResult => api.dispatch(action, api.actor, target, { ...params });

  const result = ((): FileCommandResult => {
    switch (parsed.spec.name) {
      case 'dir':
        return dirLines(api.graph, session, parsed.query);
      case 'cd':
        return cdLines(api.graph, session, parsed.query);
      case 'tree':
        return treeLines(api.graph, session, parsed.args);
      case 'move':
        return moveLines(api.graph, session, parsed.args, dispatch);
      case 'purge':
        return purgeLines(api.graph, session, parsed.query, dispatch);
      default:
        return typeLines(api.graph, session, parsed.query);
    }
  })();

  return {
    lines: result.lines,
    clear: false,
    ...(result.cwd === undefined ? {} : { cwd: result.cwd }),
  };
}

/**
 * Runs one parsed command against the world. Kept DOM-free on purpose: the
 * terminal is the second skin over the same verb set, and both skins are worth
 * testing without a browser.
 *
 * The working directory comes in and, for the one command that moves it, goes
 * back out: the terminal owns where it is standing, and this function stays a
 * function of what it was handed.
 */
export function executeCommand(
  parsed: ParsedCommand,
  api: GameApi,
  cwd: readonly string[] = DEFAULT_CWD,
): CommandResult {
  switch (parsed.kind) {
    case 'empty':
      return { lines: [], clear: false };
    case 'unknown':
      return lines(
        `"${parsed.name}" is not a command on this terminal.`,
        parsed.suggestion === null
          ? 'Try "help". It is a short list and a long day.'
          : `Did you mean "${parsed.suggestion}"? Try "help" for the rest.`,
      );
    case 'usage':
      return lines(
        `Usage: ${parsed.spec.usage}`,
        parsed.spec.summary,
      );
    case 'command':
      break;
  }

  switch (parsed.spec.name) {
    case 'help':
      return helpLines();
    case 'cls':
      return { lines: [], clear: true };
    case 'ver':
      return lines(
        'WORKGRUMBLE Support Terminal [Version 4.10.1998]',
        '(c) Workgrumble Ltd. All rights reserved. None exercised.',
        'Support contract expired before you were hired.',
      );
    case 'ping':
      return pingLines(api, parsed.query);
    case 'ipconfig':
      return ipconfigLines(api, parsed.query);
    case 'whoami':
      return whoamiLines(api, parsed.query);
    case 'systeminfo':
      return systeminfoLines(api, parsed.query);
    case 'tracert':
      return tracertLines(api, parsed.query);
    case 'nslookup':
      return nslookupLines(api, parsed.query);
    case 'users':
      return usersLines(api, parsed.query);
    case 'net':
      // One sub-command, and a refusal that lists it rather than pretending
      // the whole `net` family is in here. `net use`, `net share` and the rest
      // are a different job with a different set of consequences.
      return parsed.sub === 'user'
        ? usersLines(api, parsed.query)
        : lines(
          `"net ${parsed.sub}" is not something this terminal does.`,
          'It answers "net user <account>", which is the same read as '
            + '"users <account>".',
        );
    case 'services':
      return servicesLines(api, parsed.query);
    case 'sc':
      return scLines(api, parsed.sub, parsed.query);
    case 'audit':
      return auditLines(api, parsed.query);
    case 'tasklist':
      return tasklistLines(api, parsed.args);
    case 'queue':
      return queueLines(api, parsed.query);
    case 'rotate':
      return rotateLines(api, parsed.args);
    case 'ssh':
      // The on-ramp to the server tier (E6). Gated on the promotion inside
      // sshLines, and on success it hands back the session the terminal enters
      // - which is what flips the dialect to unix.
      return sshLines(api, parsed.query);
    case 'promotion':
      return promotionLines(api, parsed.sub);
    case 'dir':
    case 'cd':
    case 'type':
    case 'tree':
    case 'move':
    case 'purge':
      return fileCommandLines(parsed, api, cwd);
    default:
      break;
  }

  if (parsed.spec.name === 'unlock' || parsed.spec.name === 'resetpw') {
    const found = accountOf(api, parsed.query);

    if (!found.ok) {
      return lines(found.reason);
    }

    return parsed.spec.name === 'unlock'
      ? dispatchLines(
        api,
        HELPDESK_ACTIONS.accountUnlock,
        found.node.id,
        {},
        [
          `${labelOf(found.node)} unlocked.`,
          'They are logging in already. They will not say thank you.',
        ],
      )
      : dispatchLines(
        api,
        HELPDESK_ACTIONS.accountResetPassword,
        found.node.id,
        {},
        [
          `Temporary password issued for ${labelOf(found.node)}.`,
          'This box ticks both boxes for you every time: the lockout is',
          'cleared and "must change at next logon" is set. A real reset',
          'dialog asks; this one has never asked anybody anything.',
          'It will be on a sticky note by lunchtime.',
        ],
      );
  }

  if (parsed.spec.name === 'verify' || parsed.spec.name === 'mfa'
    || parsed.spec.name === 'revoke') {
    return accountVerbLines(api, parsed.spec.name, parsed.query, parsed.sub);
  }

  if (parsed.spec.name === 'changereq') {
    return changeRequestCommandLines(api, parsed.sub, parsed.query);
  }

  if (parsed.spec.name === 'fw') {
    return fwLines(api, parsed.sub, parsed.query);
  }

  if (parsed.spec.name === 'timesheet') {
    return timesheetLines(api, parsed.sub, parsed.args);
  }

  if (parsed.spec.name === 'notify') {
    return notifyCommandLines(api, parsed.query);
  }

  if (parsed.spec.name === 'licence') {
    return licenceLines(api, parsed.sub, parsed.query);
  }

  if (parsed.spec.name === 'grant') {
    return grantLines(api, parsed.args);
  }

  if (parsed.spec.name === 'forget') {
    const found = deviceOf(api, parsed.query);

    return found.ok
      ? dispatchLines(
        api,
        HELPDESK_ACTIONS.deviceForgetCredentials,
        found.node.id,
        {},
        [
          `Stored credentials cleared on ${labelOf(found.node)}.`,
          'It will carry on asking for one, which is somebody else\'s',
          'afternoon, and it will stop offering the old one, which is this',
          'one.',
        ],
      )
      : lines(found.reason);
  }

  if (parsed.spec.name === 'renewcert') {
    const found = serviceOf(api, parsed.query);

    return found.ok
      ? dispatchLines(
        api,
        HELPDESK_ACTIONS.serviceRenewCertificate,
        found.node.id,
        {},
        [
          `New certificate issued to ${labelOf(found.node)} and picked up.`,
          'Everybody who has been told the connection could not be verified',
          'can be told, truthfully, that it can now.',
        ],
      )
      : lines(found.reason);
  }

  if (parsed.spec.name === 'rule') {
    if (parsed.sub !== 'on') {
      return lines(
        `"rule ${parsed.sub}" is not something this terminal does.`,
        'It does "rule on <mail rule>", and it does not do off, because '
          + 'switching a rule off is a change with a form attached.',
      );
    }

    const found = mailRuleOf(api, parsed.query);

    return found.ok
      ? dispatchLines(
        api,
        HELPDESK_ACTIONS.mailRuleEnable,
        found.node.id,
        {},
        [
          `${labelOf(found.node)} is now on.`,
          'It was written in March, tested once, and left off because',
          'switching it on was a change and a change needed a form.',
        ],
      )
      : lines(found.reason);
  }

  if (parsed.spec.name === 'restart') {
    // A Windows stop/start pair does not reach a systemd unit or a launchd job
    // - that is systemctl or launchctl on the far side, a verb this terminal
    // does not have. The box is up; bouncing a unit on it is Engineer work.
    const unix = unixHostOf(api, parsed.query);

    if (unix !== null) {
      // The box is a unix host AND it may belong to a customer whose contract
      // does not cover it. Both are true and both are taught: a wrong-tenant
      // aim stops here (the STOP is the more urgent truth), and a helpdesk
      // player reaching for a SaaS customer's Linux PROD is refused on BOTH
      // counts - the scope reason, then the systemd one - which is the
      // compose-with-0.7.0 case the arc is built around.
      const host = hostMachineOfQuery(api, parsed.query);
      const current = api.appState.getCustomerContext();
      const osRefusal = notWindowsHost(
        unix,
        'restart is the Windows stop/start pair, and a Windows stop control '
          + `does not reach ${managedThing(unix.os)}.`,
      );

      if (host === null) {
        return osRefusal;
      }

      const tenant = wrongCustomerGuardLines(api.graph, host, current);

      if (tenant !== null) {
        return lines(...tenant);
      }

      const scope = scopeRefusalForMachine(api.graph, host);

      return scope === null
        ? osRefusal
        : lines(...scope, '', ...osRefusal.lines);
    }

    const found = serviceOf(api, parsed.query);

    if (!found.ok) {
      return lines(found.reason);
    }

    return dispatchLines(
      api,
      HELPDESK_ACTIONS.serviceRestart,
      found.node.id,
      {},
      [
        `Stopping ${labelOf(found.node)} ...`,
        `Starting ${labelOf(found.node)} ... service reports RUNNING.`,
        'It came back in the one configuration anybody ever tested, with',
        'nothing left waiting to jam it.',
      ],
    );
  }

  if (parsed.spec.name === 'clearqueue') {
    const found = printerOf(api, parsed.query);

    if (!found.ok) {
      return lines(found.reason);
    }

    const depth = found.node.fields[FIELDS.queueLen];
    // The spool files belong to the service, so the command stops it and says
    // so, in the order the machine did it. Starting it again is the third step
    // and it is deliberately not this command's.
    const spooler = api.graph
      .neighbors(found.node.id, { direction: 'in', edgeKind: 'connected_to' })
      .find((node) => node.kind === 'service');

    return dispatchLines(
      api,
      HELPDESK_ACTIONS.printerClearQueue,
      found.node.id,
      spooler === undefined ? {} : { spooler: spooler.id },
      [
        ...(spooler === undefined
          ? []
          : [`Stopping ${labelOf(spooler)} ... service reports STOPPED.`]),
        `Queue on ${labelOf(found.node)} emptied: ${
          typeof depth === 'number' ? String(depth) : 'all'
        } job(s) dropped.`,
        'They went wherever the odd socks go. Nobody will re-send more than',
        'four of them.',
        ...(spooler === undefined
          ? []
          : [
            `${labelOf(spooler)} is still stopped, which is where the`,
            'procedure leaves it. "restart spooler" is step three.',
          ]),
      ],
    );
  }

  return lines(
    `"${parsed.spec.name}" is registered but not wired up. That is a bug, and `
      + 'it is ours.',
  );
}
