import type { ReadOnlyGraphNode } from '../../engine-api';
import type { NodeKind } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { DEVICE_TYPES, FIELDS, isRotation } from '../../world/fields';
import { formatSimTime } from '../clock-format';
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

  return lines(
    `Account      : ${labelOf(account)}`,
    `Owner        : ${textValue(
      owner?.fields[FIELDS.name],
      'unclaimed',
    )} (${textValue(owner?.fields[FIELDS.title], 'role unrecorded')})`,
    `Status       : ${
      account.fields[FIELDS.enabled] === false
        ? 'DISABLED'
        : account.fields[FIELDS.locked] === true
          ? 'LOCKED OUT'
          : 'OK'
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
    case 'users':
      return usersLines(api, parsed.query);
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
