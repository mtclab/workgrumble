import type { ReadOnlyGraphNode } from '../../engine-api';
import type { NodeKind } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY } from '../../world/company';
import {
  VERIFICATION_METHOD_LABELS,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from '../../world/fallout';
import {
  DEVICE_TYPES,
  FIELDS,
  isRotation,
  isService,
  MACHINE_ROLE_LABELS,
  machineRoleOf,
  SERVICE_CLASSES,
  serviceClassOf,
  SERVICE_STATUS,
  STARTUP_TYPE_LABELS,
  startupTypeOf,
} from '../../world/fields';
import { formatSimTime } from '../clock-format';
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
import { runningPrograms } from './processes';
import type { GameApi } from './types';
import { textValue } from './ui';

export interface CommandResult {
  readonly lines: readonly string[];
  readonly clear: boolean;
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

/** `3204` -> `3,204`, which is how a process list has always written it. */
function thousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

function lines(...values: readonly string[]): CommandResult {
  return { lines: values, clear: false };
}

function labelOf(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(
    node.fields[FIELDS.hostname]
      ?? node.fields[FIELDS.name]
      ?? node.fields[FIELDS.username],
    node.id,
  );
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
function scLines(api: GameApi, sub: string, query: string): CommandResult {
  if (sub !== 'query') {
    return lines(
      `"sc ${sub}" is not something this terminal does.`,
      'It does "sc query <service>". Starting and stopping are one verb here '
        + '- "restart <service>" - because a service left stopped is a change '
        + 'with a form attached, and a startup type is a change with two.',
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
    return lines(
      'tasklist /s asks another machine what it is running, over the remote '
        + 'registry.',
      'Remote Registry is Disabled on every box in this building, which you '
        + 'can',
      'see for yourself in any services list. Nothing here can answer it.',
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

function queueLines(api: GameApi, query: string): CommandResult {
  const found = printerOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const printer = found.node;
  const depth = printer.fields[FIELDS.queueLen];
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

  return lines(
    `${labelOf(printer)}: ${
      typeof depth === 'number' ? String(depth) : 'an unknown number of'
    } job(s) queued.`,
    spooler === undefined
      ? 'No spooler is registered for it, which explains a great deal.'
      : `Spooler on ${labelOf(host ?? printer)} reports ${
        statusWord(spooler)
      }.`,
  );
}

function dispatchLines(
  api: GameApi,
  action: string,
  target: string,
  params: Record<string, string | number>,
  success: readonly string[],
): CommandResult {
  const result = api.dispatch(action, api.actor, target, params);
  return result.ok ? lines(...success) : lines(result.reason);
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

  const booted = machine.fields[FIELDS.uptimeSince];
  const services = api.graph.neighbors(machine.id, {
    direction: 'in',
    edgeKind: 'runs_on',
  });
  const devices = api.graph.neighbors(machine.id, {
    direction: 'in',
    edgeKind: 'connected_to',
  });
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
 * Runs one parsed command against the world. Kept DOM-free on purpose: the
 * terminal is the second skin over the same verb set, and both skins are worth
 * testing without a browser.
 */
export function executeCommand(
  parsed: ParsedCommand,
  api: GameApi,
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
    case 'tasklist':
      return tasklistLines(api, parsed.args);
    case 'queue':
      return queueLines(api, parsed.query);
    case 'rotate':
      return rotateLines(api, parsed.args);
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
