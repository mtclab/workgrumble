import type { ReadOnlyGraphNode } from '../../engine-api';
import type { NodeKind } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY } from '../../world/company';
import { DEVICE_TYPES, FIELDS, isRotation } from '../../world/fields';
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

  return node.id.toLowerCase() === needle
    || suffix.toLowerCase() === needle
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

function serviceOf(api: GameApi, query: string): Lookup {
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

function servicesLines(api: GameApi, query: string): CommandResult {
  const found = machineOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const services = api.graph.neighbors(found.node.id, {
    direction: 'in',
    edgeKind: 'runs_on',
  });

  if (services.length === 0) {
    return lines(
      `Nothing is registered as running on ${labelOf(found.node)}.`,
      'This is either very clean or very wrong.',
    );
  }

  // Hardware sits in this list because it reports a status, so the list says
  // which of them a "restart" would actually mean anything to.
  return lines(
    `Services on ${labelOf(found.node)}:`,
    ...services.map(
      (service) => `  ${pad(labelOf(service), USAGE_COLUMN)}${
        statusWord(service)
      }${
        service.fields[FIELDS.restartable] === true
          ? ''
          : '   [hardware, not restartable]'
      }`,
    ),
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
  const spooler = host === undefined
    ? undefined
    : api.graph
      .neighbors(host.id, { direction: 'in', edgeKind: 'runs_on' })
      .find((node) => node.fields[FIELDS.name] === 'Print Spooler');

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
 * The three account verbs the modern half of the week needs, and the sentences
 * they answer with.
 *
 * `verify` is the one that changes nothing anybody can see. That is the point:
 * it writes down that a human being checked, on a ticket, at a minute, and the
 * only thing it ever affects is what a report says about you a day later.
 */
function accountVerbLines(
  api: GameApi,
  verb: 'verify' | 'mfa' | 'revoke',
  query: string,
): CommandResult {
  const found = accountOf(api, query);

  if (!found.ok) {
    return lines(found.reason);
  }

  const label = labelOf(found.node);

  switch (verb) {
    case 'verify':
      return dispatchLines(
        api,
        HELPDESK_ACTIONS.accountVerifyIdentity,
        found.node.id,
        {},
        [
          `Identity check recorded against ${label}.`,
          'Nothing else about the account has changed, which is the whole of',
          'what this verb is for.',
        ],
      );
    case 'mfa':
      return dispatchLines(
        api,
        HELPDESK_ACTIONS.accountRegisterMfa,
        found.node.id,
        {},
        [
          `New authenticator enrolled for ${label}.`,
          'The old binding is gone. Whoever holds the new one is, as far as',
          'this directory is concerned, them.',
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

  return lines(
    `Host Name:                 ${labelOf(machine)}`,
    `OS Name:                   ${COMPANY.domain} Workstation`,
    'OS Version:                4.10.1998, Service Pack (declined)',
    `Domain:                    ${DNS_SUFFIX}`,
    `System Boot Time:          ${
      typeof booted === 'number'
        ? formatSimTime(booted).time
        : 'unrecorded - it has been up since before anybody here was'
    }`,
    `Display Resolution:        ${
      textValue(machine.fields[FIELDS.resolution], 'whatever it came with')
    }`,
    `Pending Updates:           ${
      machine.fields[FIELDS.pendingUpdates] === true
        ? 'Yes (scheduled for a convenient moment, since 1998)'
        : 'None outstanding'
    }`,
    `Registered Services:       ${
      services.length === 0 ? 'none' : services.map(labelOf).join(', ')
    }`,
    `Attached Hardware:         ${
      devices.length === 0 ? 'none' : devices.map(labelOf).join(', ')
    }`,
    'Total Physical Memory:     as much as it shipped with, which nobody '
      + 'wrote down',
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
          `Temporary password issued for ${labelOf(found.node)} and the `
            + 'lockout cleared with it.',
          'It will be on a sticky note by lunchtime.',
        ],
      );
  }

  if (parsed.spec.name === 'verify' || parsed.spec.name === 'mfa'
    || parsed.spec.name === 'revoke') {
    return accountVerbLines(api, parsed.spec.name, parsed.query);
  }

  if (parsed.spec.name === 'licence') {
    return licenceLines(api, parsed.sub, parsed.query);
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

    return dispatchLines(
      api,
      HELPDESK_ACTIONS.printerClearQueue,
      found.node.id,
      {},
      [
        `Queue on ${labelOf(found.node)} emptied: ${
          typeof depth === 'number' ? String(depth) : 'all'
        } job(s) dropped.`,
        'They went wherever the odd socks go. Nobody will re-send more than',
        'four of them. The spooler can be started now that there is nothing',
        'left for it to choke on.',
      ],
    );
  }

  return lines(
    `"${parsed.spec.name}" is registered but not wired up. That is a bug, and `
      + 'it is ours.',
  );
}
