/**
 * The unix half of the terminal (E6): ssh, and the dialect an ssh session
 * switches the terminal into.
 *
 * This is the family difference the fidelity bar has been promising since
 * `SPEC_020`: a Linux box does not run the Windows command surface with unix
 * spelling on top, it answers in a DIFFERENT SHAPE. `systemctl status` prints
 * the richer ●-dot block, not `sc`'s flat STATE line; `ls -la` prints
 * mode/owner/group columns, not a volume header and a free-space footer; the
 * prompt says `user@host:~$`, not `C:\>`. The dialect is decided by DATA - the
 * box's `os` field - exactly as the 0.7.0 spike named it, so the terminal is in
 * the unix dialect precisely when it is in an ssh session on a linux box and
 * never otherwise.
 *
 * Pass A shipped the ENGINE: `ssh` (the trust-on-first-use mechanic, gated on
 * the player's tier), the promotion that unlocks it, and a proof-of-shape command
 * set (`systemctl status`, `ls -la`, `exit`/`logout`). Pass B fills the surface
 * out at fidelity - `systemctl restart/start/stop` (SILENT on success, the
 * sharpest family beat), `journalctl -u`, `df -h`, `ps aux`, `ip a` - and wires
 * THE FIRST FIX: a downed unit an engineer diagnoses and restarts over ssh, the
 * 0.7.0 "your tools do not reach a Linux box" wall finally down.
 *
 * Nothing here touches the DOM. Like `cmd-run.ts`, it is a pure function of the
 * world and the session it is handed, so both dialects are testable without a
 * browser.
 */

import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  CAREER_ACTIONS,
  PROMOTION_REPUTATION,
  SSH_HOST_PARAM,
  SYSTEMD_ACTIONS,
} from '../../world/actions';
import {
  changeControlGate,
} from '../../world/change-control';
import {
  changeRequestAuthorises,
  changeRequestListing,
} from '../../world/change-request';
import {
  scopeRefusalForMachine,
  wrongCustomerGuardLines,
} from '../../world/customers';
import {
  FIELDS,
  isSystemsEngineer,
  MACHINE_OS,
  machineOsOf,
  SYSTEMD_STATES,
  type SystemdState,
  UNIT_ENABLEMENTS,
  type UnitEnablement,
  unitEnablementOf,
} from '../../world/fields';
import { addressOf, fqdn, GATEWAY, stableHash } from './cmd-net';
import {
  type CommandSpec,
  type ParsedCommand,
  parseWith,
} from './cmd-parse';
import type { CommandResult } from './cmd-run';
import type { GameApi } from './types';
import { textValue } from './ui';

/**
 * Where the terminal is standing when it is on a server: which box, what it is
 * called, and who the ssh session is running as. It is WINDOW-local, the same
 * as the Windows working directory is (`cmd-run.ts`) and for the same reason -
 * a second terminal is a second shell at its own Windows prompt, and a reloaded
 * one comes back at the desktop, never mid-connection. So it rides on the
 * command result the way `cwd` does and no save carries it; what a save DOES
 * carry is the two durable halves of the mechanic - the promotion (a field on
 * the player) and the known_hosts ledger (another) - both of which the engine
 * serializes on the player node.
 */
export interface SshSession {
  readonly hostId: string;
  readonly hostname: string;
  readonly username: string;
}

/**
 * The unix dialect's registry - the parallel to the Windows `COMMANDS`. The
 * core sysadmin surface at fidelity: `systemctl` (status + the restart/start/stop
 * fix verbs), `journalctl`, `df`, `ps`, `ip`, `ls`, and `exit`/`logout`, plus
 * the network toolbox a sysadmin lives in - `ss` (the listeners), `dig`/`host`
 * (the DNS answer), `ping` (continuous, the sharpest family diff), `curl` (the
 * HTTP truth). The deeper surface (du, apt, users/perms) is the backlog later E6
 * slices work through; the not-installed gags (traceroute/ifconfig/netstat/htop)
 * are handled below at the command-not-found seam, on purpose - they are NOT in
 * this registry because a stock Ubuntu box does not have them either.
 */
export const UNIX_COMMANDS: readonly CommandSpec[] = [
  {
    name: 'systemctl',
    usage: 'systemctl <status|restart|start|stop> <unit>',
    summary: 'Read or work a systemd unit: the ●-dot block, and the fix verbs.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'journalctl',
    usage: 'journalctl -u <unit>',
    summary: 'Read a unit\'s journal: timestamped lines, and why it failed.',
    minArgs: 0,
    maxArgs: 4,
    joined: false,
  },
  {
    name: 'df',
    usage: 'df -h',
    summary: 'Show disk use: Filesystem/Size/Used/Avail/Use%/Mounted on.',
    minArgs: 0,
    maxArgs: 3,
    joined: false,
  },
  {
    name: 'ps',
    usage: 'ps aux',
    summary: 'List processes: USER/PID/%CPU/%MEM/.../STAT/START/TIME/COMMAND.',
    minArgs: 0,
    maxArgs: 2,
    joined: false,
  },
  {
    name: 'ip',
    usage: 'ip a',
    summary: 'Show the box\'s address, in CIDR - the family diff from ipconfig.',
    minArgs: 0,
    maxArgs: 2,
    joined: false,
  },
  {
    name: 'ls',
    usage: 'ls -la',
    summary: 'List a directory the long way: mode, owner, group, size, mtime.',
    minArgs: 0,
    maxArgs: 4,
    joined: false,
  },
  {
    name: 'ss',
    usage: 'ss -tlnp',
    summary: 'Show the box\'s listening sockets - the modern netstat.',
    minArgs: 0,
    maxArgs: 3,
    joined: false,
  },
  {
    name: 'dig',
    usage: 'dig <name>',
    summary: 'Resolve a name the long way: QUESTION/ANSWER sections and stats.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'host',
    usage: 'host <name>',
    summary: 'Resolve a name the terse way: "name has address addr".',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'ping',
    usage: 'ping [-c N] <host>',
    summary: 'Ping a host - continuous by default on Linux; -c N bounds it.',
    minArgs: 1,
    maxArgs: 4,
    joined: false,
  },
  {
    name: 'curl',
    usage: 'curl -I <url>',
    summary: 'Fetch a URL\'s response line and headers over a served box.',
    minArgs: 1,
    maxArgs: 3,
    joined: false,
  },
  {
    name: 'changereq',
    usage: 'changereq <file <unit> [restart|stop] | list>',
    summary: 'Raise a change to authorise risky prod work, and read what is filed.',
    minArgs: 1,
    maxArgs: 3,
    joined: true,
    subcommand: true,
  },
  {
    name: 'breakglass',
    usage: 'breakglass <unit>',
    summary: 'The emergency override: fix a DOWN service outside the window, audited.',
    minArgs: 1,
    maxArgs: 2,
    joined: true,
  },
  {
    name: 'exit',
    usage: 'exit',
    summary: 'Leave the ssh session, back to the desktop terminal.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
  {
    name: 'logout',
    usage: 'logout',
    summary: 'The same as exit: close the connection and come back to Windows.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
];

/** The unix grammar is the same grammar, pointed at the unix registry. */
export function parseUnixCommand(input: string): ParsedCommand {
  return parseWith(input, UNIX_COMMANDS);
}

/** The server prompt, a real family difference from the Windows `C:\>`. */
export function unixPrompt(session: Readonly<SshSession>): string {
  return `${session.username}@${session.hostname}:~$`;
}

function lines(...values: readonly string[]): CommandResult {
  return { lines: values, clear: false };
}

function labelOf(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(
    node.fields[FIELDS.hostname] ?? node.fields[FIELDS.name],
    node.id,
  );
}

/* -- known_hosts, the ssh client's trust ledger --------------------------- */

/** The known_hosts field, split into host ids the way the file is one per line. */
export function readKnownHosts(value: unknown): readonly string[] {
  return typeof value === 'string'
    ? value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
    : [];
}

/** Whether the player's ssh client has already trusted this host. */
function isKnownHost(api: GameApi, hostId: string): boolean {
  return readKnownHosts(api.graph.getField(api.actor, FIELDS.knownHosts))
    .includes(hostId);
}

/* -- the ED25519 fingerprint ---------------------------------------------- */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The host key fingerprint, derived from the box's id and nothing else.
 *
 * The estate has no key material in it, exactly as it has no IP addresses, so
 * the fingerprint is DERIVED the way `cmd-net.ts` derives an address: a pure
 * function of the id, stable across every session and every reload, and unable
 * to disagree with the graph because there is no second truth to disagree with.
 * A real `SHA256:` fingerprint is 32 bytes shown as unpadded base64 (43 chars),
 * and this is 32 derived bytes shown the same way.
 */
export function ed25519Fingerprint(hostId: string): string {
  const bytes = Array.from(
    { length: 32 },
    (_, index) => stableHash(`${hostId}:key:${String(index)}`) & 0xff,
  );

  let out = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;

    out += BASE64[(triple >> 18) & 0x3f];
    out += BASE64[(triple >> 12) & 0x3f];

    if (index + 1 < bytes.length) {
      out += BASE64[(triple >> 6) & 0x3f];
    }

    if (index + 2 < bytes.length) {
      out += BASE64[triple & 0x3f];
    }
  }

  // 32 bytes is 43 base64 characters and one pad; ssh drops the pad, so do we.
  return `SHA256:${out}`;
}

/* -- ssh, its own mechanic ------------------------------------------------ */

function machineByName(api: GameApi, query: string): ReadOnlyGraphNode | null {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    return null;
  }

  return api.graph.nodesOfKind('machine').find((node) => {
    const suffix = node.id.includes(':')
      ? node.id.slice(node.id.indexOf(':') + 1)
      : node.id;

    return node.id.toLowerCase() === needle
      || suffix.toLowerCase() === needle
      || labelOf(node).toLowerCase() === needle;
  }) ?? null;
}

/**
 * `ssh <user@host>` - the on-ramp to the server tier, and a mechanic in its own
 * right rather than a reskinned remote-desktop.
 *
 * The gate is the PROMOTION: a service-desk player is refused, because ssh to a
 * server is not service-desk access - it is the engineers' tier, and the whole
 * of what the promotion grants. Past the gate it does trust-on-first-use: the
 * first connection to a box shows its ED25519 fingerprint and records the box in
 * known_hosts (this terminal has no way to ask a yes/no question, so it records
 * and says so, in openssh's own words); the second connection finds it already
 * there and connects straight through. A successful connect returns the SESSION
 * the terminal now stands in, which is what flips the dialect to unix.
 */
export function sshLines(api: GameApi, query: string): CommandResult {
  // The tier gate, first and hardest: a service-desk player has no ssh at all.
  if (!isSystemsEngineer(api.graph.getField(api.actor, FIELDS.playerTier))) {
    return lines(
      'ssh: connect refused - this is not service-desk access.',
      'Reaching a server over ssh is the engineers\' tier, not the desk\'s. It '
        + 'arrives',
      'with the promotion, along with the unix tools to work the box once you '
        + 'are on it.',
    );
  }

  // `user@host`, or a bare host. The user is whoever the account is - a real
  // ssh takes it from the argument, and here it is the label before the @.
  const trimmed = query.trim();
  const at = trimmed.indexOf('@');
  const user = at >= 0 ? trimmed.slice(0, at).trim() : 'engineer';
  const hostQuery = at >= 0 ? trimmed.slice(at + 1).trim() : trimmed;

  const machine = machineByName(api, hostQuery);

  if (machine === null) {
    return lines(
      `ssh: Could not resolve hostname ${hostQuery}: Name or service not known.`,
    );
  }

  // ssh reaches a unix box. A Windows host does not run sshd on this estate -
  // it is reached the way the rest of the game reaches one, over remote desktop
  // - and saying so is the honest refusal rather than a fabricated connection.
  if (machineOsOf(machine.fields[FIELDS.machineOs]) !== MACHINE_OS.linux) {
    return lines(
      `ssh: connect to host ${labelOf(machine)} port 22: Connection refused.`,
      `${labelOf(machine)} is a Windows box; it does not run sshd. A Windows `
        + 'host is reached',
      'over remote desktop, which is a different tool and a different tier\'s '
        + 'wall.',
    );
  }

  const hostname = labelOf(machine);
  const session: SshSession = { hostId: machine.id, hostname, username: user };
  const connected = `Connected to ${hostname}. The terminal is on the server `
    + 'now; its dialect is unix. "exit" comes back to the desktop.';

  // Trust-on-first-use. A host already in known_hosts connects straight
  // through; a new one shows its fingerprint and is recorded, which is what
  // makes the SECOND ssh skip this block.
  if (isKnownHost(api, machine.id)) {
    return { ...lines(connected), enterSession: session };
  }

  const trust = api.dispatch(
    CAREER_ACTIONS.sshTrustHost,
    api.actor,
    api.actor,
    { [SSH_HOST_PARAM]: machine.id },
  );

  if (!trust.ok) {
    return lines(trust.reason);
  }

  return {
    ...lines(
      `The authenticity of host '${hostname}' can't be established.`,
      `ED25519 key fingerprint is ${ed25519Fingerprint(machine.id)}.`,
      `Warning: Permanently added '${hostname}' (ED25519) to the list of known `
        + 'hosts.',
      connected,
    ),
    enterSession: session,
  };
}

/* -- the promotion, the spine of the epic --------------------------------- */

/**
 * `promotion accept` - taking the Systems Engineer offer.
 *
 * The offer is EARNED and the acceptance is ONE-WAY, and neither of those is
 * enforced here: the world verb holds the reputation gate and the already-an-
 * engineer refusal (`actions/career.ts`), so a below-the-bar accept and a
 * second accept both come back as the world's own sentence. What this does is
 * resolve the verb and, on success, dramatise the weight - because the day you
 * cross this tier is the day `systemctl stop` on a box ten thousand people
 * depend on becomes a thing your hands can do.
 */
export function promotionLines(api: GameApi, sub: string): CommandResult {
  // Bare `promotion` (or `promotion status`) is the OFFER, framed: not a raw
  // command but the beat that reads whether you have earned it, so that
  // `promotion accept` lands as taking something offered rather than typing a
  // cheat. Earned or not is read live off the standing the world holds.
  if (sub === '' || sub === 'status') {
    return promotionOfferLines(api);
  }

  if (sub !== 'accept') {
    return lines(
      `"promotion ${sub}" is not something this terminal does.`,
      'It does "promotion" (the offer) and "promotion accept" (taking it).',
    );
  }

  const result = api.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    api.actor,
    api.actor,
    {},
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  // Crossing the tier is what raises the first incident: the engineer is paged
  // onto the MSP's own downed portal the moment the offer is taken. It is
  // idempotent and world-guarded, so it only lands where there is a box to down.
  api.day.raiseFirstIncident();

  return lines(
    'Promotion accepted. You are a Systems Engineer now - Tier 1.',
    'You keep the service desk and you gain the servers: ssh, the unix '
      + 'terminal,',
    'and an estate of Linux boxes to look after. The weight comes with it. '
      + '"systemctl',
    'stop" on the wrong box is a service ten thousand people were depending on, '
      + 'gone,',
    'and nobody upstream of you can undo it for you. Type carefully out there.',
    '',
    'And there is one waiting already: the client portal is down. Check your '
      + 'tickets.',
  );
}

/** Whether the player has earned the Systems Engineer offer this minute. */
export function promotionEarned(api: GameApi): boolean {
  if (isSystemsEngineer(api.graph.getField(api.actor, FIELDS.playerTier))) {
    return false;
  }

  const reputation = api.graph.getField(api.actor, FIELDS.reputation);

  return typeof reputation === 'number' && reputation >= PROMOTION_REPUTATION;
}

/**
 * The offer, as a beat the player reads rather than a command they guess at.
 *
 * Three states, all truthful and all off the world: already an engineer (the
 * crossing is one-way, and it says so), the offer earned (the engineering team
 * has been watching your queue - here is how you take it), and not yet (the
 * standing that earns it, named). It is the diegetic wrapper the promotion
 * needed - `promotion accept` stays the mechanism; this makes it read as taking
 * something you were offered.
 */
function promotionOfferLines(api: GameApi): CommandResult {
  if (isSystemsEngineer(api.graph.getField(api.actor, FIELDS.playerTier))) {
    return lines(
      'You are a Systems Engineer already - Tier 1. The crossing is one-way:',
      'the desk you keep, the servers you have. There is no offer left to take.',
    );
  }

  if (promotionEarned(api)) {
    return lines(
      'The engineering team have been reading your queue, and they want you on',
      'the server tier. This is the offer: you have earned it, and it is on the',
      'table now - the standing you have built is exactly what it is made at.',
      '',
      'Type "promotion accept" to take it. It is one-way: you keep the service',
      'desk and you gain ssh, the unix terminal, and the Linux estate to look',
      'after - along with the weight of being able to break prod.',
    );
  }

  return lines(
    'No Systems Engineer offer on the table yet. It is the payoff of a career',
    'built, not a free unlock - keep the standing up and it arrives, and when it',
    'does this is where you take it, with "promotion accept".',
  );
}

/* -- the unix command surface (Pass A: three verbs) ----------------------- */

/** The systemd unit a query names, on the box the session is standing on. */
function unitOnBox(
  api: GameApi,
  session: Readonly<SshSession>,
  query: string,
): ReadOnlyGraphNode | null {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    return null;
  }

  const units = api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit');

  // A unit answers to its full name (`nginx.service`) and to the base a player
  // types (`nginx`), the same courtesy the Windows service lookup gives - the
  // list on the screen calls it one thing and systemctl takes either.
  return units.find((node) => {
    const unit = textValue(node.fields[FIELDS.unitName], '').toLowerCase();
    const base = unit.endsWith('.service') ? unit.slice(0, -'.service'.length) : unit;

    return unit === needle || base === needle;
  }) ?? null;
}

/** The status dot systemctl prints in front of the unit name, per state. */
function statusDot(state: SystemdState): string {
  switch (state) {
    case SYSTEMD_STATES.failed:
      return '\u00d7'; // × - a unit that died
    case SYSTEMD_STATES.inactiveDead:
      return '\u25cb'; // ○ - stopped and idle
    default:
      return '\u25cf'; // ● - active, in one shade or another
  }
}

/** How systemctl spells the enablement in the Loaded line. */
function enablement(value: UnitEnablement): string {
  return value === UNIT_ENABLEMENTS.static
    ? 'static'
    : value === UNIT_ENABLEMENTS.disabled
      ? 'disabled'
      : 'enabled';
}

/**
 * `systemctl status <unit>` - the richer block, read off the seeded unit node.
 *
 * This is the family difference made concrete against `sc`. Where `sc query`
 * prints a flat `STATE : 4 RUNNING`, systemctl prints the dot, the Loaded line
 * (the unit file path and whether it starts at boot) and the Active line (the
 * state in systemd's own words), and for a running unit a Main PID line. Every
 * word of it is read from the graph or derived by a pure function of it - the
 * state and enablement are the seeded fields, the description is the unit's own,
 * and the PID is derived from the unit id the way `cmd-net.ts` derives an
 * address, because the estate holds no pid table and inventing one that could
 * disagree with nothing is the honest way to print the line the shape needs.
 */
function systemctlStatusLines(
  api: GameApi,
  session: Readonly<SshSession>,
  query: string,
): CommandResult {
  const unit = unitOnBox(api, session, query);

  if (unit === null) {
    return lines(
      `Unit ${query.trim()}.service could not be found.`,
    );
  }

  const name = textValue(unit.fields[FIELDS.unitName], labelOf(unit));
  const description = textValue(unit.fields[FIELDS.name], name);
  const state = textValue(
    unit.fields[FIELDS.unitState],
    SYSTEMD_STATES.inactiveDead,
  ) as SystemdState;
  const enabled = enablement(unitEnablementOf(unit.fields[FIELDS.unitEnabled]));
  const base = name.endsWith('.service') ? name.slice(0, -'.service'.length) : name;
  const running = state === SYSTEMD_STATES.activeRunning;
  // A plausible pid, derived from the unit id and stable for it - the same
  // move `cmd-net.ts` makes for an address, and honest for the same reason.
  const pid = unitPid(unit.id);
  const journal = readUnitJournal(unit.fields[FIELDS.unitJournal]);
  const tail = journal.slice(-STATUS_LOG_TAIL);

  return lines(
    `${statusDot(state)} ${name} - ${description}`,
    `     Loaded: loaded (/lib/systemd/system/${name}; ${enabled}; preset: `
      + 'enabled)',
    `     Active: ${state}`,
    ...(running ? [`   Main PID: ${String(pid)} (${base})`] : []),
    // The log tail systemctl status prints under the block, straight off the
    // unit's own journal. A unit the world holds none for prints no tail, which
    // is the honest omission rather than an invented startup line.
    ...(tail.length === 0 ? [] : ['', ...tail]),
  );
}

/** How many journal lines `systemctl status` tails under the block. */
const STATUS_LOG_TAIL = 4;

/** A unit's journal, split into lines the way journalctl prints one per line. */
export function readUnitJournal(value: unknown): readonly string[] {
  return typeof value === 'string'
    ? value.split('\n').filter((line) => line.length > 0)
    : [];
}

/** The eight-space `ls -l` permission column, the mode of a plain directory. */
const HOME_MODE = 'drwxr-xr-x';

/** The size ext4 reports for a directory, a constant rather than a fact held. */
const DIR_SIZE = '4096';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The estate's own clock, in `ls`'s date column (`Mon DD HH:MM`).
 *
 * The same anchor `dir` dates its listings from (`clock-format.ts`), so the two
 * families date the same estate the same way rather than inventing two
 * calendars. `ls` writes the month as a word and the day and time without a
 * year for a recent file, which is what this is.
 */
function lsDate(tick: number): string {
  const face = new Date(Date.UTC(1998, 8, 7));
  face.setUTCDate(face.getUTCDate() + Math.floor((540 + tick) / (24 * 60)));
  const minuteOfDay = (540 + tick) % (24 * 60);
  const month = MONTHS[face.getUTCMonth()] ?? 'Jan';
  const day = String(face.getUTCDate()).padStart(2, ' ');
  const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${
    String(minuteOfDay % 60).padStart(2, '0')
  }`;

  return `${month} ${day} ${time}`;
}

/**
 * `ls -la` - the home directory the long way, at the column shape that IS the
 * family difference from `dir`.
 *
 * Pass A lists the two entries any directory truly has - `.` and `..` - in the
 * real `ls -l` columns: mode, link count, owner, group, size, mtime, name. It
 * invents no files, because the estate holds no Linux files yet (they are Pass
 * B's, exactly as the Windows drive was seeded before its `dir` shipped); what
 * it proves is the SHAPE, which is what a player has to read differently from a
 * `dir` header and a free-space footer. `ls` with no `-a` hides the dotfiles,
 * so a listing with only dot-entries in it is empty - and it says so.
 */
function lsLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const flags = args.filter((arg) => arg.startsWith('-')).join('');
  const all = flags.includes('a');
  const long = flags.includes('l');
  const user = session.username;
  const when = lsDate(api.clock.now());

  if (!long) {
    // Without -l it is bare names in columns; without -a the dotfiles are
    // hidden, so the home directory the world holds is, for now, empty.
    return lines(
      all ? '.  ..' : '',
      `${session.hostname}: nothing but the dotfiles the world has not seeded `
        + 'yet - the box\'s own files arrive with the next slice.',
    );
  }

  const row = (name: string): string => `${HOME_MODE} 2 ${pad(user, 8)} ${
    pad(user, 8)
  } ${DIR_SIZE.padStart(6, ' ')} ${when} ${name}`;

  return lines(
    'total 8',
    ...(all ? [row('.'), row('..')] : []),
    `${session.hostname}: mode, owner, group, size and mtime - the columns `
      + 'a listing',
    'has here, where dir had a volume header and a free-space footer. The box\'s '
      + 'own',
    'files are the next slice\'s to seed; nothing is invented to fill the rows.',
  );
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, ' ');
}

/* -- systemctl restart/start/stop: the fix verbs, silent on success ------- */

/** The unix systemd action a subcommand maps to, or null for a non-verb. */
function systemdActionFor(sub: string): string | null {
  switch (sub) {
    case 'restart':
      return SYSTEMD_ACTIONS.unitRestart;
    case 'start':
      return SYSTEMD_ACTIONS.unitStart;
    case 'stop':
      return SYSTEMD_ACTIONS.unitStop;
    default:
      return null;
  }
}

/**
 * `systemctl restart|start|stop <unit>` - the engineer's remediation, and the
 * sharpest fidelity beat in the dialect: SILENT on success.
 *
 * A real `systemctl restart` prints nothing and returns to the prompt; the exit
 * code is the whole of the answer, and re-reading `systemctl status` is how you
 * confirm it. So on success this returns NO lines - never a fabricated "started
 * successfully", which is the Windows family's shape (`restart` prints
 * "service reports RUNNING") and a lie here. It runs the customer-scope guard
 * FIRST, so an engineer on a customer's out-of-scope server is refused the same
 * way the desk's Windows tools are: the ssh tier lets you LOOK at a box, but the
 * contract still governs what you may CHANGE on it. The MSP's own infra carries
 * no customer, so its own boxes are the engineer's to fix - which is the whole
 * of the non-bypassing story.
 */
function systemctlVerbLines(
  api: GameApi,
  session: Readonly<SshSession>,
  action: string,
  query: string,
): CommandResult {
  const unit = unitOnBox(api, session, query);

  if (unit === null) {
    return lines(`Failed to ${
      action === SYSTEMD_ACTIONS.unitRestart
        ? 'restart'
        : action === SYSTEMD_ACTIONS.unitStart ? 'start' : 'stop'
    } ${query.trim()}.service: Unit ${query.trim()}.service not found.`);
  }

  // The contract governs a change even over ssh: a wrong tenant, or a customer's
  // out-of-scope server, is refused before the action lands - the non-bypass the
  // 0.8.0 scope engine enforces, carried onto the unix path. An in-house box (the
  // MSP's own infra) carries no customer, so both guards pass and it is fixable.
  const box = api.graph.getNode(session.hostId);

  if (box !== undefined) {
    const tenant = wrongCustomerGuardLines(
      api.graph,
      box,
      api.appState.getCustomerContext(),
    );

    if (tenant !== null) {
      return lines(...tenant);
    }

    const scope = scopeRefusalForMachine(api.graph, box);

    if (scope !== null) {
      return lines(
        ...scope,
        '',
        'ssh reaches the box at the engineer tier, but the CONTRACT still '
          + 'governs',
        'what may change on it: this is a customer\'s server, and the fix is '
          + 'theirs',
        'or a change request, not a systemctl on our say-so.',
      );
    }
  }

  // Change control (E6, 0.18.0): on the engineer's OWN prod, a risky verb on a
  // LIVE customer-facing service in business hours is a NORMAL change and is
  // gated - refused unless an approved change request opens a window for it. A
  // DOWN unit is the fire (never gated, so the 0.17.0 on-call fix flows), and
  // out of hours is the window's own stretch. The one authorisation that lets it
  // through is the 0.10.0 change request, reused whole: an approved, in-window
  // request for this exact (unit, verb). Break-glass is the other door and is a
  // command of its own, so the gate deliberately does not know about it.
  const authorised = api.graph
    .nodesOfKind('change_request')
    .some((cr) => changeRequestAuthorises(cr, unit.id, action, api.clock.now()));
  const gate = changeControlGate({
    graph: api.graph,
    now: api.clock.now(),
    unitId: unit.id,
    verb: action,
    authorised,
  });

  if (!gate.allowed) {
    return lines(...gate.lines);
  }

  const result = api.dispatch(action, api.actor, unit.id, {});

  // Silent on success - systemd says nothing when it works, and neither does
  // this. A refusal is the world's own sentence.
  return result.ok ? { lines: [], clear: false } : lines(result.reason);
}

/* -- journalctl: the unit's journal, the why behind a failure ------------- */

/**
 * `journalctl -u <unit>` (and bare `journalctl`) - the timestamped journal.
 *
 * It reads the unit's `unit_journal` field, which holds the real journal lines
 * the world wrote when the unit fell over - the crash, systemd's retries, the
 * start-limit it hit. A unit the world holds no journal for answers exactly the
 * way the real one does when nothing matches: `-- No entries --`, an honest
 * omission rather than an invented startup log. Bare `journalctl` merges every
 * unit on the box, which for this estate is the one downed unit's log or none.
 */
function journalctlLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const flagAt = args.findIndex((arg) => arg === '-u' || arg === '--unit');
  const named = flagAt >= 0 ? (args[flagAt + 1] ?? '').trim() : '';

  if (flagAt >= 0 && named.length === 0) {
    return lines('journalctl: --unit requires a unit name.');
  }

  const units = api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit');

  // A named unit reads that unit's journal; a bare journalctl reads the box's -
  // every unit's, merged, oldest first, which on this estate is the one that
  // failed or nothing at all.
  const chosen = named.length === 0
    ? units
    : [unitOnBox(api, session, named)].filter(
      (node): node is ReadOnlyGraphNode => node !== null,
    );

  if (named.length > 0 && chosen.length === 0) {
    return lines(
      `Failed to add match 'UNIT=${named}.service': No such unit.`,
      `-- No entries --`,
    );
  }

  const journal = chosen.flatMap(
    (unit) => readUnitJournal(unit.fields[FIELDS.unitJournal]),
  );

  return journal.length === 0
    ? lines('-- No entries --')
    : lines(...journal);
}

/* -- df -h / ps aux / ip a: the box's disk, processes and address --------- */

/** A byte count as `df -h` prints it: a short human size (K/M/G/T). */
function humanSize(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const shown = value >= 10 || unit === 0
    ? String(Math.round(value))
    : value.toFixed(1);

  return `${shown}${units[unit] ?? 'B'}`;
}

/** The disk this box believes in: one root filesystem, the seeded free space. */
const DF_TOTAL_BYTES = 42_949_672_960; // 40G root, the size df reports.

/**
 * `df -h` - the disk, at the column shape that IS the family difference from a
 * `dir` free-space footer: Filesystem / Size / Used / Avail / Use% / Mounted on,
 * a device path and a mount point, no drive letter anywhere.
 *
 * The free space is the box's own seeded `disk_free`; the total is a fixed root
 * size, and Used is the difference, so the three agree the way a real df's do. A
 * later disk-full incident is a fact about this one number.
 */
function dfLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const box = api.graph.getNode(session.hostId);
  const free = box?.fields[FIELDS.diskFree];
  const avail = typeof free === 'number' ? free : DF_TOTAL_BYTES;
  const used = Math.max(0, DF_TOTAL_BYTES - avail);
  const usePct = Math.min(100, Math.round((used / DF_TOTAL_BYTES) * 100));

  return lines(
    `${pad('Filesystem', 22)}${pad('Size', 6)}${pad('Used', 6)}${
      pad('Avail', 6)
    }${pad('Use%', 5)}Mounted on`,
    `${pad('/dev/root', 22)}${pad(humanSize(DF_TOTAL_BYTES), 6)}${
      pad(humanSize(used), 6)
    }${pad(humanSize(avail), 6)}${pad(`${String(usePct)}%`, 5)}/`,
  );
}

/**
 * `ps aux` - the box's processes, in the real column shape (USER PID %CPU %MEM
 * VSZ RSS TTY STAT START TIME COMMAND), the family difference from tasklist.
 *
 * Derived from what the box actually runs: systemd as PID 1, then one row per
 * unit that is `active (running)` (a failed or exited one is NOT a process,
 * which is the honest half - a downed unit is absent from `ps` exactly as it is
 * on a real box), under the account the session is running as for the app rows.
 * The numbers are a pure function of the unit id, stable and invented-of-nothing
 * the way `cmd-net` derives an address.
 */
function psLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const header = `${pad('USER', 10)}${pad('PID', 6)}${pad('%CPU', 5)}${
    pad('%MEM', 5)
  }${pad('VSZ', 8)}${pad('RSS', 7)}${pad('TTY', 6)}${pad('STAT', 5)}${
    pad('START', 6)
  }${pad('TIME', 6)}COMMAND`;

  const running = runningUnitsOn(api, session);

  const row = (
    user: string,
    pid: number,
    cpu: string,
    mem: string,
    stat: string,
    command: string,
  ): string => `${pad(user, 10)}${pad(String(pid), 6)}${pad(cpu, 5)}${
    pad(mem, 5)
  }${pad(String(9000 + (pid % 900)), 8)}${pad(String(2000 + (pid % 700)), 7)}${
    pad('?', 6)
  }${pad(stat, 5)}${pad('08:32', 6)}${pad('0:00', 6)}${command}`;

  const procRows = running.map((unit) => {
    const name = textValue(unit.fields[FIELDS.unitName], unit.id);
    const base = name.endsWith('.service')
      ? name.slice(0, -'.service'.length)
      : name;
    const pid = unitPid(unit.id);
    // The app runs as the session's user; the base plumbing runs as root, the
    // way a real box splits them.
    const user = base === 'nginx' || base === 'cron' || base === 'ssh'
      || base === 'systemd-journald'
      ? 'root'
      : session.username;

    return row(user, pid, '0.0', '1.2', 'Ss', `/usr/bin/${base}`);
  });

  return lines(
    header,
    row('root', 1, '0.0', '0.4', 'Ss', '/sbin/init'),
    ...procRows,
  );
}

/**
 * `ip a` - the box's address, in the CIDR shape that IS the family difference
 * from `ipconfig`: the `2: eth0: <...> mtu 1500 ...` interface block and an
 * `inet X/24` line, no dotted subnet-mask row.
 *
 * The address is the estate's own, derived off the box id the way `cmd-net`
 * derives every other one, so `ip a` here and `ping`/`nslookup` on the desktop
 * agree about where the box is.
 */
function ipLines(session: Readonly<SshSession>): CommandResult {
  const address = addressOf(session.hostId);

  return lines(
    '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN '
      + 'group default qlen 1000',
    '    inet 127.0.0.1/8 scope host lo',
    '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state '
      + 'UP group default qlen 1000',
    `    inet ${address}/24 brd 10.42.0.255 scope global eth0`,
  );
}

/* -- the network toolbox: ss / dig / host / ping / curl ------------------- */

/**
 * A plausible pid for a unit, derived from its id and stable for it.
 *
 * The one derivation `systemctl status`, `ps aux` and `ss -p` all read, so the
 * three agree about a unit's pid the way three real commands reading the same
 * `/proc` do - and honest for the reason `cmd-net` derives an address: the
 * estate holds no pid table, so a derived one cannot disagree with a truth that
 * is not there.
 */
function unitPid(unitId: string): number {
  return 400 + (stableHash(unitId) % 9000);
}

/** The running units on the box the session is standing on, id-sorted. */
function runningUnitsOn(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit')
    .filter(
      (node) => textValue(node.fields[FIELDS.unitState], '')
        === SYSTEMD_STATES.activeRunning,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** The socket a unit listens on: the process name, the bind, the port, backlog. */
interface Listener {
  readonly proc: string;
  /** `*` for a wildcard bind, `127.0.0.1` for a loopback-only one. */
  readonly addr: string;
  readonly port: number;
  /** The listen backlog `ss` prints in Send-Q for a listening socket. */
  readonly backlog: number;
}

/** The base of a unit name: `nginx.service` -> `nginx`, kept whole otherwise. */
function unitBase(node: Readonly<ReadOnlyGraphNode>): string {
  const name = textValue(node.fields[FIELDS.unitName], node.id).toLowerCase();

  return name.endsWith('.service') ? name.slice(0, -'.service'.length) : name;
}

/**
 * The sockets a running unit listens on, by what the unit IS - the real ports
 * the daemons behind these units bind (sshd:22, nginx:80/443, postgres:5432,
 * the product app on a loopback 8000 behind nginx). A unit that listens on
 * nothing (cron, journald) returns none, so it is honestly absent from `ss` -
 * and a unit that is not running never reaches here, which is the whole teeth
 * of `ss`: down a service and its listener drops off the box.
 */
function listenersOf(node: Readonly<ReadOnlyGraphNode>): readonly Listener[] {
  const base = unitBase(node);

  if (base === 'ssh') {
    return [{ proc: 'sshd', addr: '*', port: 22, backlog: 128 }];
  }

  if (base === 'nginx') {
    return [
      { proc: 'nginx', addr: '*', port: 80, backlog: 511 },
      { proc: 'nginx', addr: '*', port: 443, backlog: 511 },
    ];
  }

  if (base === 'postgresql' || base.startsWith('postgresql@')) {
    return [{ proc: 'postgres', addr: '127.0.0.1', port: 5432, backlog: 244 }];
  }

  // The product app behind nginx - grumbleapp, fcportal - binds a loopback
  // upstream port nginx proxies to. Named by suffix rather than a hard list so a
  // new employer's `<name>app`/`<name>portal` unit is a listener without editing
  // this file; anything else the world runs listens on nothing until it says so.
  if (base.endsWith('app') || base.endsWith('portal')) {
    return [{ proc: base, addr: '127.0.0.1', port: 8000, backlog: 128 }];
  }

  return [];
}

/** Lays an `ss` row out in fixed columns; the last cell runs to the margin. */
function ssRow(cells: readonly string[]): string {
  const widths = [7, 7, 7, 22, 20];

  return cells
    .map((cell, index) => (index === cells.length - 1 ? cell : pad(cell, widths[index] ?? 8)))
    .join('');
}

/**
 * `ss -tlnp` - the box's listening sockets, in the real column shape and the
 * modern replacement for `netstat` (which is why net-tools is a not-installed
 * gag below).
 *
 * It reads the box's RUNNING units and prints one row per socket they listen
 * on: State/Recv-Q/Send-Q/Local Address:Port/Peer Address:Port, and with `-p`
 * the `users:(("proc",pid=,fd=))` process column. A failed or stopped unit is
 * not running, so it is not in `runningUnitsOn` and its listener is simply gone
 * - the honest half, and the diagnosis a downed service is read by: `ss` shows
 * the port it should hold is not held. The estate models listeners, not live
 * connections, so `ss` here always lists the listening set (documented in
 * `terminal-fidelity.md` beside the other honest omissions).
 */
function ssLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const withProc = args.join('').includes('p');
  const header = ssRow([
    'State', 'Recv-Q', 'Send-Q', 'Local Address:Port', 'Peer Address:Port',
    ...(withProc ? ['Process'] : []),
  ]);

  const rows = runningUnitsOn(api, session)
    .flatMap((unit) => listenersOf(unit).map((listener) => ({
      listener,
      pid: unitPid(unit.id),
    })))
    .sort((left, right) => left.listener.port - right.listener.port)
    .map(({ listener, pid }) => ssRow([
      'LISTEN',
      '0',
      String(listener.backlog),
      `${listener.addr}:${String(listener.port)}`,
      '*:*',
      ...(withProc
        ? [`users:(("${listener.proc}",pid=${String(pid)},fd=3))`]
        : []),
    ]));

  return lines(header, ...rows);
}

/** The DNS name a resolver command is aimed at: the first non-flag argument. */
function nameArg(args: readonly string[]): string {
  return (args.find((arg) => !arg.startsWith('-')) ?? '').trim();
}

/** A short, stable, plausible query time for a resolver, in whole msec. */
function queryMs(name: string): number {
  return stableHash(`${name}:dig`) % 5;
}

/**
 * `dig <name>` - name resolution the long way, over the SAME estate DNS graph
 * `nslookup`/`ping` walk, at the real DiG output shape.
 *
 * The QUESTION and ANSWER sections (`name. TTL IN A addr`) and the Query
 * time/SERVER/MSG SIZE footer are the shape a player has to read differently
 * from `nslookup`'s flat Name/Address pair. A name the estate holds answers
 * NOERROR with an ANSWER section; a name it does not answers the honest way a
 * real resolver does - NXDOMAIN, a QUESTION and no ANSWER. The EDNS OPT
 * pseudo-section and the WHEN line are omitted rather than faked, the same
 * honest-omission discipline the rest of the dialect keeps.
 */
function digLines(api: GameApi, name: string): CommandResult {
  const machine = machineByName(api, name);
  const id = stableHash(`${name}:id`) % 65536;
  const banner = [
    `; <<>> DiG 9.18.30 <<>> ${name}`,
    ';; global options: +cmd',
    ';; Got answer:',
  ];
  const footer = (bytes: number): readonly string[] => [
    '',
    `;; Query time: ${String(queryMs(name))} msec`,
    `;; SERVER: ${GATEWAY}#53(${GATEWAY}) (UDP)`,
    `;; MSG SIZE  rcvd: ${String(bytes)}`,
  ];

  if (machine === null) {
    return lines(
      ...banner,
      `;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: ${String(id)}`,
      ';; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 0',
      '',
      ';; QUESTION SECTION:',
      `;${name}.\t\t\tIN\tA`,
      ...footer(34),
    );
  }

  const canonical = fqdn(labelOf(machine));
  const address = addressOf(machine.id);

  return lines(
    ...banner,
    `;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: ${String(id)}`,
    ';; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0',
    '',
    ';; QUESTION SECTION:',
    `;${canonical}.\t\t\tIN\tA`,
    '',
    ';; ANSWER SECTION:',
    `${canonical}.\t300\tIN\tA\t${address}`,
    ...footer(canonical.length + 45),
  );
}

/**
 * `host <name>` - the terse resolver, the one-line answer to `dig`'s block. A
 * name the estate holds is `name has address addr`; one it does not is the real
 * `Host <name> not found: 3(NXDOMAIN)`.
 */
function hostLines(api: GameApi, name: string): CommandResult {
  const machine = machineByName(api, name);

  return machine === null
    ? lines(`Host ${name} not found: 3(NXDOMAIN)`)
    : lines(`${fqdn(labelOf(machine))} has address ${addressOf(machine.id)}`);
}

/** How many replies `ping` shows for a continuous (no -c) run before it teaches. */
const PING_CONTINUOUS_SAMPLE = 3;

/** The round-trip time for one ping, derived and stable, in tenths of a msec. */
function pingMs(hostId: string, seq: number): string {
  const tenths = 20 + ((stableHash(hostId) + seq * 13) % 40);

  return (tenths / 10).toFixed(1);
}

/** One `64 bytes from ...` reply row. */
function pingReply(address: string, hostId: string, seq: number): string {
  return `64 bytes from ${address}: icmp_seq=${String(seq)} ttl=57 time=${
    pingMs(hostId, seq)
  } ms`;
}

/**
 * `ping <host>` - and the sharpest single family difference in the whole
 * dialect: on Linux ping is CONTINUOUS. Windows sends four and stops; Linux
 * keeps sending until you press Ctrl-C, and `-c N` is how you bound it.
 *
 * So a bare `ping host` shows a few replies and then SAYS it would run forever
 * and names `-c` - it does not quietly send four and stop, which would be the
 * Windows shape and a lie about the family. `-c N` sends exactly N and prints
 * the transmitted/received/loss statistics block. Reachability is the estate's:
 * a resolvable box on this flat /24 answers; a name that is not a machine gets
 * the real `Name or service not known`. Times are derived off the host id, so
 * the run is deterministic.
 */
function pingLines(
  api: GameApi,
  args: readonly string[],
): CommandResult {
  const flagAt = args.findIndex((arg) => arg === '-c');
  const countRaw = flagAt >= 0 ? (args[flagAt + 1] ?? '') : null;
  // The host is the first bare argument that is NOT the `-c` count value - so
  // `ping -c 4 host` reads `host`, not the `4`.
  const host = nameArg(
    flagAt >= 0
      ? args.filter((_, index) => index !== flagAt && index !== flagAt + 1)
      : args,
  );

  const machine = machineByName(api, host);

  if (machine === null) {
    return lines(`ping: ${host}: Name or service not known`);
  }

  const address = addressOf(machine.id);
  const canonical = fqdn(labelOf(machine));
  const header = `PING ${canonical} (${address}) 56(84) bytes of data.`;

  // Continuous: a few replies, then the teaching. No statistics block, because
  // the run did not end - a real one would still be going.
  if (countRaw === null) {
    return lines(
      header,
      ...Array.from(
        { length: PING_CONTINUOUS_SAMPLE },
        (_, index) => pingReply(address, machine.id, index + 1),
      ),
      '',
      'This is Linux ping: it does not stop on its own - it would keep sending '
        + 'until',
      `you press Ctrl-C. Bound it with -c, e.g. "ping -c 4 ${host}", for a `
        + 'fixed run',
      'and a transmitted/received summary.',
    );
  }

  const count = Number.parseInt(countRaw, 10);

  if (!Number.isInteger(count) || count <= 0) {
    return lines('ping: bad number of packets to transmit.');
  }

  const capped = Math.min(count, 100);
  const times = Array.from({ length: capped }, (_, index) => Number(
    pingMs(machine.id, index + 1),
  ));
  const min = Math.min(...times).toFixed(1);
  const max = Math.max(...times).toFixed(1);
  const avg = (times.reduce((sum, time) => sum + time, 0) / capped).toFixed(1);
  const elapsed = (capped - 1) * 1000 + (stableHash(machine.id) % 20);

  return lines(
    header,
    ...times.map((_, index) => pingReply(address, machine.id, index + 1)),
    '',
    `--- ${canonical} ping statistics ---`,
    `${String(capped)} packets transmitted, ${String(capped)} received, `
      + `0% packet loss, time ${String(elapsed)}ms`,
    `rtt min/avg/max/mdev = ${min}/${avg}/${max}/0.050 ms`,
  );
}

/** The host part of a URL: scheme and path stripped, port dropped. */
function hostFromUrl(url: string): string {
  const withoutScheme = url.replace(/^[a-z]+:\/\//iu, '');
  const authority = withoutScheme.split('/')[0] ?? '';

  return (authority.split(':')[0] ?? '').trim().toLowerCase();
}

/** The names that mean "this box" to a curl running on it. */
const LOCALHOST_NAMES: ReadonlySet<string> = new Set([
  '', 'localhost', '127.0.0.1', '::1',
]);

/**
 * `curl -I <url>` - the HTTP truth over a box that serves it, the one command
 * here with no Windows cmd cousin.
 *
 * It reads the target box's web units: if nginx is up it answers, and whether
 * the answer is 200 or 502 is the honest state of the app BEHIND nginx - a
 * running product app is 200, a downed one is the 502 Bad Gateway nginx returns
 * when its upstream is gone. That is the diagnosis a downed portal is read by:
 * nginx answers (server: nginx) but 502, because the thing it proxies to is not
 * listening. A box not serving http at all is the real `curl: (7) Failed to
 * connect`; a host that does not resolve is `curl: (6) Could not resolve host`.
 * The estate models services, not content, so curl reports the response line
 * and headers (as `-I` does) rather than a fabricated body.
 */
function curlLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const url = args.find((arg) => !arg.startsWith('-')) ?? '';
  const host = hostFromUrl(url);
  const port = /^https:/iu.test(url) ? 443 : 80;

  const box = LOCALHOST_NAMES.has(host) || host === session.hostname.toLowerCase()
    ? api.graph.getNode(session.hostId)
    : machineByName(api, host);

  if (box === undefined || box === null) {
    return lines(`curl: (6) Could not resolve host: ${host}`);
  }

  const units = api.graph
    .neighbors(box.id, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit');
  const nginx = units.find((node) => unitBase(node) === 'nginx');
  const nginxUp = nginx !== undefined
    && textValue(nginx.fields[FIELDS.unitState], '') === SYSTEMD_STATES.activeRunning;

  if (!nginxUp) {
    return lines(
      `curl: (7) Failed to connect to ${host || box.id} port ${String(port)} `
        + 'after 0 ms: Connection refused',
    );
  }

  // nginx is up. Whether it can serve the app or must 502 is the app's own
  // state: the product unit behind it (an *app/*portal unit) being down is the
  // upstream failure nginx reports as 502.
  const app = units.find((node) => {
    const base = unitBase(node);

    return base.endsWith('app') || base.endsWith('portal');
  });
  const appDown = app !== undefined
    && textValue(app.fields[FIELDS.unitState], '') !== SYSTEMD_STATES.activeRunning;

  return appDown
    ? lines(
      'HTTP/2 502 ',
      'server: nginx',
      'content-type: text/html',
    )
    : lines(
      'HTTP/2 200 ',
      'server: nginx',
      'content-type: text/html',
    );
}

/* -- the not-installed gags: a refusal that teaches ----------------------- */

/**
 * The tools that are NOT on a stock Ubuntu 24.04 box, mapped to the package
 * that carries them.
 *
 * `traceroute` and net-tools (`ifconfig`/`netstat`) and `htop` are all absent
 * by default, and typing them on a real box does not silently succeed and does
 * not print a fake output - it prints `command not found` and the exact
 * `sudo apt install <pkg>` hint Ubuntu's command-not-found handler offers. That
 * refusal is the teaching: it steers the player to `ip`/`ss` as canonical (which
 * is what Ubuntu itself does) and names `apt` as the fix. They are deliberately
 * NOT in `UNIX_COMMANDS` - a stock box has no such command either, so they fall
 * through to `command not found`, where this map turns the generic miss into the
 * real hinted one. (Whether `apt install` then works is a later slice.)
 */
const NOT_INSTALLED: Readonly<Record<string, string>> = {
  traceroute: 'traceroute',
  ifconfig: 'net-tools',
  netstat: 'net-tools',
  htop: 'htop',
};

/** Ubuntu's command-not-found hint for a known-but-absent tool, or null. */
function notInstalledHint(name: string): CommandResult | null {
  const pkg = NOT_INSTALLED[name];

  return pkg === undefined
    ? null
    : lines(
      `Command '${name}' not found, but can be installed with:`,
      `sudo apt install ${pkg}`,
    );
}

/* -- change control: the change request, and the break-glass override ----- */

/** The systemd verb a `changereq file <unit> <word>` names, defaulting to restart. */
function changeVerbFor(word: string): string {
  if (word === 'stop') {
    return SYSTEMD_ACTIONS.unitStop;
  }

  if (word === 'start') {
    return SYSTEMD_ACTIONS.unitStart;
  }

  return SYSTEMD_ACTIONS.unitRestart;
}

/**
 * `changereq file <unit> [restart|stop]` and `changereq list` in the unix
 * dialect (E6, 0.18.0).
 *
 * The engineer's counterpart to the desktop `changereq`: on the box you are
 * ssh'd into, raise a change for the risky prod work the systemctl gate refused,
 * or read back what is filed. Filing is paperwork - it never dispatches the
 * action; the systemctl gate's consult of the approved-and-in-window request is
 * the only thing that ever lets it through, which is the whole 0.10.0 shape,
 * reused for the engineer's own prod.
 */
function changeReqUnixLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sub: string,
  query: string,
): CommandResult {
  if (sub === 'list') {
    return lines(...changeRequestListing(api.graph, api.clock.now()));
  }

  if (sub !== 'file') {
    return lines(
      `"changereq ${sub}" is not something this terminal does.`,
      'It does "changereq file <unit> [restart|stop]" - to raise a change for '
        + 'risky',
      'prod work - and "changereq list", to read back what has been filed.',
    );
  }

  const words = query.trim().split(/\s+/u).filter((word) => word.length > 0);
  const unitName = words[0] ?? '';
  const verb = changeVerbFor((words[1] ?? '').toLowerCase());

  if (unitName.length === 0) {
    return lines('usage: changereq file <unit> [restart|stop]');
  }

  const unit = unitOnBox(api, session, unitName);

  if (unit === null) {
    return lines(`Unit ${unitName}.service could not be found on this box.`);
  }

  return lines(...api.day.fileChangeRequest(unit.id, verb));
}

/**
 * `breakglass <unit>` - the emergency override (E6, 0.18.0).
 *
 * When a service is ACTIVELY DOWN in an incident, the fix is outside the normal
 * change window: break the glass, act now, and it is logged loudly for the
 * review after. The one thing that legitimises it is a real active incident (a
 * failed unit on the box); breaking it on a healthy service is refused and reads
 * as the abuse it is. The DRIVER decides which, off the estate, and does the
 * emergency restart and the audit; this only resolves which unit the player
 * meant on the box they are standing on.
 */
function breakGlassUnixLines(
  api: GameApi,
  session: Readonly<SshSession>,
  query: string,
): CommandResult {
  const unitName = query.trim();

  if (unitName.length === 0) {
    return lines('usage: breakglass <unit>');
  }

  const unit = unitOnBox(api, session, unitName);

  if (unit === null) {
    return lines(`Unit ${unitName}.service could not be found on this box.`);
  }

  return lines(...api.day.breakGlass(unit.id));
}

/**
 * Runs one parsed unix command against the world and the session. The twin of
 * `executeCommand` in `cmd-run.ts`, and DOM-free for the same reason.
 */
export function executeUnix(
  parsed: ParsedCommand,
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  switch (parsed.kind) {
    case 'empty':
      return { lines: [], clear: false };
    case 'unknown': {
      // The not-installed gags first: a stock Ubuntu box does not carry
      // traceroute/ifconfig/netstat/htop, so typing one is a real miss - and the
      // miss teaches, with Ubuntu's own `sudo apt install <pkg>` hint, not a fake
      // output. Only if it is not one of those does it fall to the generic miss.
      const hint = notInstalledHint(parsed.name);

      if (hint !== null) {
        return hint;
      }

      return lines(
        `${parsed.name}: command not found`,
        parsed.suggestion === null
          ? 'This dialect is the core sysadmin surface - the deeper tools '
            + '(du, apt, id/getent, chmod) are a later slice.'
          : `Did you mean "${parsed.suggestion}"?`,
      );
    }
    case 'usage':
      return lines(`usage: ${parsed.spec.usage}`, parsed.spec.summary);
    case 'command':
      break;
  }

  switch (parsed.spec.name) {
    case 'systemctl': {
      if (parsed.sub === 'status') {
        return systemctlStatusLines(api, session, parsed.query);
      }

      const action = systemdActionFor(parsed.sub);

      if (action !== null) {
        return systemctlVerbLines(api, session, action, parsed.query);
      }

      return lines(
        `Unknown command verb ${parsed.sub}.`,
        'This terminal does systemctl status, restart, start and stop.',
      );
    }
    case 'journalctl':
      return journalctlLines(api, session, parsed.args);
    case 'df':
      return dfLines(api, session);
    case 'ps':
      return psLines(api, session);
    case 'ip':
      return ipLines(session);
    case 'ss':
      return ssLines(api, session, parsed.args);
    case 'dig':
      return digLines(api, nameArg(parsed.args));
    case 'host':
      return hostLines(api, nameArg(parsed.args));
    case 'ping':
      return pingLines(api, parsed.args);
    case 'curl':
      return curlLines(api, session, parsed.args);
    case 'changereq':
      return changeReqUnixLines(api, session, parsed.sub, parsed.query);
    case 'breakglass':
      return breakGlassUnixLines(api, session, parsed.query);
    case 'ls':
      return lsLines(api, session, parsed.args);
    case 'exit':
    case 'logout':
      return {
        lines: [`logout`, `Connection to ${session.hostname} closed.`],
        clear: false,
        exitSession: true,
      };
    default:
      return lines(
        `${parsed.spec.name}: registered but not wired. That is our bug.`,
      );
  }
}
