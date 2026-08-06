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
import { addressOf, stableHash } from './cmd-net';
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
 * fix verbs), `journalctl`, `df`, `ps`, `ip`, `ls`, and `exit`/`logout`. The
 * deeper surface (ss/dig, du, apt, users/perms, the not-installed gags) is the
 * backlog later E6 slices work through.
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
  const pid = 400 + (stableHash(unit.id) % 9000);
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

  const running = api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit')
    .filter(
      (node) => textValue(node.fields[FIELDS.unitState], '')
        === SYSTEMD_STATES.activeRunning,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

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
    const pid = 400 + (stableHash(unit.id) % 9000);
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
    case 'unknown':
      return lines(
        `${parsed.name}: command not found`,
        parsed.suggestion === null
          ? 'This dialect is the core sysadmin surface - the deeper tools '
            + '(ss, dig, du, apt) are a later slice.'
          : `Did you mean "${parsed.suggestion}"?`,
      );
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
