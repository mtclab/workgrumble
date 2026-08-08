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
  APT_ACTIONS,
  APT_PACKAGE_PARAM,
  CAREER_ACTIONS,
  FS_ACTIONS,
  FS_GROUP_PARAM,
  FS_MODE_PARAM,
  FS_OWNER_PARAM,
  INCIDENT_ACTIONS,
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
import {
  type DistroId,
  type PackageManager,
  packageManagerFor,
} from '../skins';
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
    name: 'du',
    usage: 'du -sh <path>',
    summary: 'Show what a directory is eating: a size and a path per line.',
    minArgs: 0,
    maxArgs: 3,
    joined: false,
  },
  {
    name: 'apt',
    usage: 'apt <install <pkg> | update | list --upgradable | upgrade>',
    summary: 'Install a package, or read and apply the box\'s pending updates.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
    subcommand: true,
  },
  {
    // The other family's package manager (0.27.0). It is in the registry
    // because the grammar has to KNOW it - a box that speaks it must parse it -
    // and which of the two a given box actually has is decided at the seam in
    // `executeUnix`, off that box's distro, the way a real box decides it by
    // having one binary and not the other.
    name: 'dnf',
    usage: 'dnf <install <pkg> | check-update | upgrade>',
    summary: 'The RHEL family\'s package manager: install, read pending '
      + 'updates, apply them.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
    subcommand: true,
  },
  {
    name: 'dpkg',
    usage: 'dpkg -l',
    summary: 'List the packages installed on the box: ii name version arch desc.',
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
    name: 'id',
    usage: 'id [<user>]',
    summary: 'Print a user\'s uid, gid and groups - the box\'s own identity.',
    minArgs: 0,
    maxArgs: 1,
    joined: false,
  },
  {
    name: 'whoami',
    usage: 'whoami',
    summary: 'Print the login name of the user this ssh session is running as.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
  {
    name: 'getent',
    usage: 'getent passwd [<user>]',
    summary: 'Read the box\'s user database: the 7 colon-fields of /etc/passwd.',
    minArgs: 1,
    maxArgs: 2,
    joined: false,
    subcommand: true,
  },
  {
    name: 'chmod',
    usage: 'chmod <mode> <path>',
    summary: 'Change a file\'s permission bits - octal 640 or symbolic g+r.',
    minArgs: 2,
    maxArgs: 3,
    joined: false,
  },
  {
    name: 'chown',
    usage: 'chown <owner[:group]> <path>',
    summary: 'Change a file\'s owner (and group) - the fix for a wrong owner.',
    minArgs: 2,
    maxArgs: 3,
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
    name: 'certbot',
    usage: 'certbot <renew|certificates>',
    summary: 'Renew an expired TLS certificate, or read what is on the box.',
    minArgs: 1,
    maxArgs: 3,
    joined: true,
    subcommand: true,
  },
  {
    name: 'postmortem',
    usage: 'postmortem <file <unit> | list>',
    summary: 'Write the blameless post-incident record that closes an incident.',
    minArgs: 1,
    maxArgs: 3,
    joined: true,
    subcommand: true,
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

/** Matches a leading `sudo ` prefix, the one privilege escalation the dialect models. */
const SUDO_PREFIX = /^\s*sudo\s+/u;

/**
 * The unix grammar is the same grammar, pointed at the unix registry - plus the
 * one thing the Windows dialect has no cousin for: a `sudo` prefix.
 *
 * `sudo apt install htop` is the real spelling, and the `sudo` is not part of
 * the command - it is the privilege the command runs with. So it is stripped
 * before the grammar sees `apt install htop`, and the fact that it was there is
 * remembered on the parse, because the privileged apt subcommands need it (a
 * bare `apt install` on a real box fails on the dpkg lock, "are you root?") and
 * that refusal is how the dialect teaches sudo. A bare `sudo` with nothing after
 * it is left alone - there is no command to run privileged, so it is the plain
 * command-not-found miss.
 */
export function parseUnixCommand(input: string): ParsedCommand {
  const sudo = SUDO_PREFIX.test(input) && input.replace(SUDO_PREFIX, '').trim().length > 0;
  const line = sudo ? input.replace(SUDO_PREFIX, '') : input;
  const parsed = parseWith(line, UNIX_COMMANDS);

  return sudo && (parsed.kind === 'command' || parsed.kind === 'usage')
    ? { ...parsed, sudo: true }
    : parsed;
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
 * Whether a host is a box ssh can actually reach.
 *
 * The world's answer first - a machine seeded `os: linux` runs sshd, and every
 * Windows box on the estate does not. Then the one the player wrote themselves:
 * their OWN machine, once they have installed Linux on it (0.27.0). Nothing in
 * the graph says so, because a reinstall of your own workstation is chrome and
 * a dialect rather than a fact about the estate - so this is the single place
 * the two answers are joined, and it reads the same shell store the desktop
 * paints itself from.
 */
function isLinuxHost(
  api: GameApi,
  machine: Readonly<ReadOnlyGraphNode>,
): boolean {
  return machineOsOf(machine.fields[FIELDS.machineOs]) === MACHINE_OS.linux
    || (isOwnBox(api, machine.id) && ownBoxDistro(api) !== null);
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
  //
  // With ONE exception, and it is the player's own doing (0.27.0): a machine
  // the player has put Linux on is a Linux machine, and it answers on 22 like
  // any other. That is a SHELL fact rather than a world one - the estate's
  // seeded boxes are untouched, and so is every golden - and it is the only way
  // the distro the player chose is a thing they can actually stand on.
  if (!isLinuxHost(api, machine)) {
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

  // A path that names a seeded file/dir on the box lists it the long way (E6,
  // 0.21.0) - the mode/owner/group a chmod/chown then rewrites. A path the world
  // holds nothing for falls through to the shape-proving home listing below, so
  // a bare `ls -la` and browsing an unseeded box are byte-identical to before.
  const pathArg = args.find((arg) => !arg.startsWith('-'));

  if (pathArg !== undefined) {
    const listed = lsPathLines(api, session, pathArg, all, when);

    if (listed !== null) {
      return listed;
    }
  }

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

  // The permission gate (E6, 0.21.0): a unit that needs to READ a config/key
  // file cannot come up while that file is not readable by its service account -
  // a real box refuses the start and systemd reports it failed, so `restart`/
  // `start` here refuse the same way and leave the unit down. The fix is not a
  // retry: it is chmod/chown on the file, then this. `stop` is exempt - you can
  // always take a unit down. The gate reads the SAME fs fields `ls -la` shows, so
  // the diagnosis and the block agree, and an ordinary unit (no `requires_file`)
  // never reaches it and restarts as before.
  if (action !== SYSTEMD_ACTIONS.unitStop) {
    const blocked = permissionBlockingStart(api, unit);

    if (blocked !== null) {
      return blocked;
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
  // `journalctl --vacuum-size=<x>`: the disk-full fix. It deletes archived
  // journals down to a size cap and hands the space back - a real state change
  // on the box, not a read - so it dispatches the vacuum verb, which refuses on
  // a box whose journal is already small (nothing to reclaim).
  const vacuumAt = args.findIndex((arg) => arg.startsWith('--vacuum-size'));

  if (vacuumAt >= 0) {
    return journalVacuumLines(api, session);
  }

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

/**
 * `journalctl --vacuum-size=<x>` - the disk-full fix, over the box's real disk.
 *
 * It reads the box's `journal_bytes` before and after the vacuum verb so the
 * "freed" figure it prints is the true difference the world wrote, not a guess.
 * On a healthy box the verb refuses (the journal is already small, nothing to
 * reclaim) and its own sentence is the answer; on the disk-full box the runaway
 * archives are deleted, the space is handed back to the root filesystem, and
 * `df -h` reads free again.
 */
function journalVacuumLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const box = api.graph.getNode(session.hostId);

  if (box === undefined) {
    return lines('journalctl: this session is not standing on a box.');
  }

  const beforeValue = box.fields[FIELDS.journalBytes];
  const before = typeof beforeValue === 'number' ? beforeValue : 0;

  const result = api.dispatch(
    INCIDENT_ACTIONS.journalVacuum,
    api.actor,
    session.hostId,
    {},
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  const afterValue = api.graph.getField(session.hostId, FIELDS.journalBytes);
  const after = typeof afterValue === 'number' ? afterValue : 0;
  const freed = Math.max(0, before - after);

  return lines(
    'Deleted archived journal /var/log/journal/'
      + '3f2a1c9d8b7e6f5a4c3d2e1f0a9b8c7d/system@'
      + '00061a3c9e2b4d10-1c8e5f2a9d3b6c47.journal~ '
      + `(${humanSize(before / 2)}).`,
    'Deleted archived journal /var/log/journal/'
      + '3f2a1c9d8b7e6f5a4c3d2e1f0a9b8c7d/system@'
      + '00061a3d1f4e5a20-2b9f6c3d8e1a7b58.journal~ '
      + `(${humanSize(before / 2)}).`,
    `Vacuuming done, freed ${humanSize(freed)} of archived journals from `
      + '/var/log/journal.',
  );
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
 * A healthy box's journal size, in bytes (~40M): what `du -sh /var/log/journal`
 * reads when the machine holds no `journal_bytes` field - a normal, rotated
 * journal. The disk-full incident replaces it with the runaway ~26G.
 */
const DU_JOURNAL_BASELINE = 41_943_040;

/** One directory du knows the size of on a Linux box: a path and its bytes. */
interface DuLeaf {
  readonly path: string;
  readonly bytes: number;
}

/**
 * The directories `du` reads on the box, sizes and all.
 *
 * The journal's size is the box's REAL `journal_bytes` field - the one the
 * disk-full incident seeds and the vacuum shrinks - so `du -sh /var/log/journal`
 * reads a real state and CHANGES when it does, which is the teeth of the
 * diagnosis. The rest are fixed, plausible sizes for the directories a stock
 * app box carries, so a listing has context around the runaway; nothing here is
 * invented to disagree with a truth the world holds, because the world holds no
 * other directory sizes for a Linux box (the fs is not seeded), exactly as
 * `ls -la` says.
 */
function duLeaves(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly DuLeaf[] {
  const box = api.graph.getNode(session.hostId);
  const journal = box?.fields[FIELDS.journalBytes];
  const journalBytes = typeof journal === 'number' ? journal : DU_JOURNAL_BASELINE;

  return [
    { path: '/var/log/journal', bytes: journalBytes },
    { path: '/var/log/nginx', bytes: 12_582_912 },
    { path: '/var/lib/fcportal', bytes: 357_564_416 },
    { path: `/home/${session.username}`, bytes: 8_388_608 },
    { path: '/usr', bytes: 1_503_238_553 },
  ];
}

/** A du path, normalised: trailing slash and a trailing `/*` wildcard dropped. */
function duTarget(raw: string): string {
  const trimmed = raw.trim();
  const noWildcard = trimmed.endsWith('/*') ? trimmed.slice(0, -2) : trimmed;
  const noSlash = noWildcard.length > 1 && noWildcard.endsWith('/')
    ? noWildcard.slice(0, -1)
    : noWildcard;

  return noSlash.length === 0 ? '.' : noSlash;
}

/** Whether a leaf is at or under a path - the same containment du walks. */
function underPath(leafPath: string, target: string): boolean {
  return leafPath === target || leafPath.startsWith(`${target}/`);
}

/** One du row: the human size, a tab, and the path - the real `20K\t/path` shape. */
function duRow(bytes: number, path: string): string {
  return `${humanSize(bytes)}\t${path}`;
}

/**
 * `du -sh <path>` (and `du -h`/bare `du`) - what a directory is eating, the
 * command the disk-full fire drill is read by.
 *
 * `-s` summarises: one line, the total under the path. Without `-s` it lists each
 * directory under the path and then the total, the way you drill into `/var/log`
 * and find the journal. The size of the journal is the box's real `journal_bytes`
 * field, so the runaway is a fact du reads rather than a number it invented -
 * `du -sh /var/log/journal` on the disk-full box shows the ~26G that `df -h`'s
 * missing space went into. A bare `du` reads the home directory the ssh session
 * stands in. A path the box holds no directories under is an ordinary small
 * directory, and du says so - `4.0K`, an empty one - rather than erroring.
 */
function duLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const flags = args.filter((arg) => arg.startsWith('-')).join('');
  const summarise = flags.includes('s');
  const rawPath = args.find((arg) => !arg.startsWith('-'));
  const target = duTarget(rawPath ?? `/home/${session.username}`);

  const leaves = duLeaves(api, session);
  const under = leaves.filter((leaf) => underPath(leaf.path, target));
  const total = under.reduce((sum, leaf) => sum + leaf.bytes, 0);

  // A path with no directories under it is a small ordinary directory - du
  // reports the 4K an empty ext4 directory takes, not an error.
  if (under.length === 0) {
    return lines(duRow(4096, target));
  }

  // -s is the total alone; without it, every directory under the path and then
  // the summed total for the path, which is how the drill-down reads.
  if (summarise) {
    return lines(duRow(total, target));
  }

  const rows = under
    .filter((leaf) => leaf.path !== target)
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((leaf) => duRow(leaf.bytes, leaf.path));

  return lines(...rows, duRow(total, target));
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

  // nginx is up and listening. Before it can answer HTTP over TLS the
  // certificate has to be valid: an EXPIRED cert (the cert-expiry incident's
  // real state) fails the handshake, which is exactly what a browser refuses on
  // and what curl reports as (60) - the service is up, and it is still refused.
  const certExpired = nginx !== undefined
    && nginx.fields[FIELDS.certExpired] === true;

  if (port === 443 && certExpired) {
    return lines(
      'curl: (60) SSL certificate problem: certificate has expired',
      'More details here: https://curl.se/docs/sslcerts.html',
      '',
      'curl failed to verify the legitimacy of the server and therefore could '
        + 'not',
      'establish a secure connection to it. The service is up; the certificate '
        + 'it',
      'presents has expired. certbot renew replaces it.',
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

/* -- the not-installed gags, and the apt that CLOSES them (0.20.0) --------- */

/**
 * The tools that are NOT on a stock Ubuntu 24.04 box, mapped to the package
 * that carries them.
 *
 * `traceroute` and net-tools (`ifconfig`/`netstat`) and `htop` are all absent
 * by default, and typing one on a stock box does not silently succeed and does
 * not print a fake output - it prints `command not found` and the exact
 * `sudo apt install <pkg>` hint Ubuntu's command-not-found handler offers. That
 * refusal is the teaching: it steers the player to `ip`/`ss` as canonical (which
 * is what Ubuntu itself does) and names `apt` as the fix. They are deliberately
 * NOT in `UNIX_COMMANDS` - a stock box has no such command either, so they fall
 * through to `command not found`, where this map turns the generic miss into the
 * real hinted one.
 *
 * 0.20.0 CLOSES the loop: once the package is in the box's `installed_packages`
 * set (an `apt install` away), the command RUNS instead of gagging. The gag is a
 * door; apt is the key. So the seam below resolves BOTH ways off one real box
 * field - present, the tool works; absent, the hint - which is the whole teeth
 * of the round trip.
 */
const NOT_INSTALLED: Readonly<Record<string, string>> = {
  traceroute: 'traceroute',
  ifconfig: 'net-tools',
  netstat: 'net-tools',
  htop: 'htop',
};

/** The packages `installed_packages` holds, read one-per-line off the box field. */
export function readInstalledPackages(value: unknown): readonly string[] {
  return readKnownHosts(value);
}

/** Whether a package is installed on the box the session is standing on. */
function isPackageInstalled(
  api: GameApi,
  session: Readonly<SshSession>,
  pkg: string,
): boolean {
  return readInstalledPackages(
    api.graph.getField(session.hostId, FIELDS.installedPackages),
  ).includes(pkg);
}

/**
 * The names whose evidence is a LOG, not the stdout of an interactive run
 * (0.20.0, slice 3). `unattended-upgrades` is Ubuntu's automatic security-patch
 * service: it runs on a systemd timer and writes what it did to a log, so typing
 * it is not how you read it - the honest answer points at the log tail, which
 * reinforces the 0.16.0 "some evidence is a log, not a command" lesson rather
 * than fabricating an interactive screen. It is the manual `apt update && apt
 * upgrade` that patches by hand.
 */
function systemNoteFor(name: string): CommandResult | null {
  if (name !== 'unattended-upgrades' && name !== 'unattended-upgrade') {
    return null;
  }

  return lines(
    `${name}: this is not an interactive command you read the output of. It runs`,
    'as a systemd timer and writes what it patched to a LOG - its evidence is a',
    'log tail, not stdout: /var/log/unattended-upgrades/unattended-upgrades.log',
    '(and "journalctl -u unattended-upgrades"). To patch by hand, use "sudo apt',
    'update" then "sudo apt upgrade".',
  );
}

/**
 * The command-not-found hint for a known-but-absent tool, in the box's own
 * dialect (0.27.0).
 *
 * Ubuntu's handler offers `sudo apt install <pkg>`; a Fedora box's offers
 * `sudo dnf install <pkg>`, because that is the verb it has. The hint is the
 * teaching half of the gag, so a hint in the wrong dialect would teach the
 * wrong thing on the one box that speaks the other one.
 */
function notInstalledHint(
  name: string,
  pkg: string,
  manager: PackageManager,
): CommandResult {
  return lines(
    `Command '${name}' not found, but can be installed with:`,
    `sudo ${manager} install ${pkg}`,
  );
}

/**
 * The not-installed seam, resolved for the box (0.20.0). A gagged tool whose
 * package the engineer has NOT installed answers with Ubuntu's command-not-found
 * hint, exactly as before; one whose package is now in the box's installed set
 * RUNS - the gag the 0.16.0 slice opened, closed. Returns null for a name that
 * is not one of the four gagged tools, so a genuine miss still falls through to
 * the plain `command not found`.
 */
function resolveGaggedTool(
  api: GameApi,
  session: Readonly<SshSession>,
  name: string,
  args: readonly string[],
): CommandResult | null {
  const pkg = NOT_INSTALLED[name];

  if (pkg === undefined) {
    return null;
  }

  if (!isPackageInstalled(api, session, pkg)) {
    return notInstalledHint(name, pkg, packageManagerOn(api, session));
  }

  switch (name) {
    case 'htop':
      return htopLines(api, session);
    case 'traceroute':
      return tracerouteLines(api, nameArg(args));
    case 'ifconfig':
      return ifconfigLines(session);
    case 'netstat':
      return netstatLines(api, session, args);
    default:
      return null;
  }
}

/* -- the gagged tools, now that apt has installed them -------------------- */

/**
 * `htop` - a curses process view, once `apt install htop` has put it on the box.
 *
 * htop is a full-screen interactive app; this terminal cannot host one, so it
 * prints the SNAPSHOT htop opens on - the summary header (CPU/Mem/Swap gauges,
 * tasks, load average, uptime) and the process table - off the SAME data `ps aux`
 * reads: systemd as PID 1 and a row per running unit, the numbers derived off the
 * unit id the way the rest of the dialect derives them. It is the honest half of
 * "installed now" - a real-ish view of what the box is running, not a fabricated
 * empty screen.
 */
function htopLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const running = runningUnitsOn(api, session);
  const tasks = running.length + 1; // + systemd(1)
  const load = ((stableHash(session.hostId) % 40) / 100).toFixed(2);
  const upMinutes = 540 + api.clock.now();
  const upH = Math.floor(upMinutes / 60);
  const upM = upMinutes % 60;

  const header = `${pad('  PID USER', 16)}${pad('PRI', 4)}${pad('NI', 4)}${
    pad('VIRT', 7)
  }${pad('RES', 7)}${pad('SHR', 7)}${pad('S', 3)}${pad('CPU%', 6)}${
    pad('MEM%', 6)
  }${pad('TIME+', 9)}Command`;

  const row = (
    pid: number,
    user: string,
    cpu: string,
    mem: string,
    command: string,
  ): string => `${pad(`${String(pid).padStart(5, ' ')} ${user}`, 16)}${
    pad('20', 4)
  }${pad('0', 4)}${pad(`${String(9 + (pid % 90))}M`, 7)}${
    pad(`${String(2 + (pid % 20))}M`, 7)
  }${pad(`${String(1 + (pid % 9))}M`, 7)}${pad('S', 3)}${pad(cpu, 6)}${
    pad(mem, 6)
  }${pad('0:00.12', 9)}${command}`;

  const procRows = running.map((unit) => {
    const base = unitBase(unit);
    const pid = unitPid(unit.id);
    const user = base === 'nginx' || base === 'cron' || base === 'ssh'
      || base === 'systemd-journald'
      ? 'root'
      : session.username;

    return row(pid, user, '0.0', '1.2', `/usr/bin/${base}`);
  });

  return lines(
    `  0[                                        0.0%]   Tasks: ${
      String(tasks)
    }, 0 thr; 1 running`,
    `  Mem[||||||||||||                    1.024G/3.84G]   Load average: ${
      load
    } ${load} ${load}`,
    `  Swp[                                    0K/0K]   Uptime: ${
      String(upH).padStart(2, '0')
    }:${String(upM).padStart(2, '0')}:00`,
    '',
    header,
    row(1, 'root', '0.0', '0.4', '/sbin/init'),
    ...procRows,
  );
}

/**
 * `traceroute <host>` - the trace, once net-tools' cousin is installed, in the
 * UNIX shape (the family difference from the Windows `tracert`'s `Tracing route`
 * header and star-timeout rows).
 *
 * The estate is one flat /24, so a box and its neighbour are on the same subnet -
 * directly connected, one hop, which is exactly what a real traceroute to a
 * same-subnet host shows: the destination itself as hop 1, no router in between.
 * The address is the estate's own derived one and the three probe times are
 * derived off the host id, so the run is deterministic.
 */
function tracerouteLines(api: GameApi, host: string): CommandResult {
  if (host.length === 0) {
    return lines('Usage: traceroute [OPTIONS] HOST');
  }

  const machine = machineByName(api, host);

  if (machine === null) {
    return lines(`traceroute: unknown host ${host}`);
  }

  const address = addressOf(machine.id);
  const canonical = fqdn(labelOf(machine));
  const probe = (sample: number): string => (
    (5 + ((stableHash(machine.id) + sample * 7) % 30)) / 10
  ).toFixed(3);

  return lines(
    `traceroute to ${canonical} (${address}), 30 hops max, 60 byte packets`,
    ` 1  ${canonical} (${address})  ${probe(1)} ms  ${probe(2)} ms  ${
      probe(3)
    } ms`,
  );
}

/**
 * `ifconfig` - net-tools' interface view, once it is installed, over the box's
 * own address. The family difference the gag was teaching AGAINST is right here:
 * ifconfig prints the DOTTED `netmask 255.255.255.0` where `ip a` prints the
 * CIDR `/24`. Same address, older tool - which is why `ip` is canonical.
 */
function ifconfigLines(session: Readonly<SshSession>): CommandResult {
  const address = addressOf(session.hostId);

  return lines(
    'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
    `        inet ${address}  netmask 255.255.255.0  broadcast 10.42.0.255`,
    '        ether 02:42:0a:2a:00:01  txqueuelen 1000  (Ethernet)',
    '        RX packets 18432  bytes 2113536 (2.1 MB)',
    '        TX packets 12094  bytes 1508722 (1.5 MB)',
    '',
    'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
    '        inet 127.0.0.1  netmask 255.0.0.0',
    '        loop  txqueuelen 1000  (Local Loopback)',
  );
}

/**
 * `netstat -tlnp` - net-tools' listener view, once it is installed. It reads the
 * SAME running-unit listeners `ss` does and prints them in netstat's older column
 * shape - `Proto Recv-Q Send-Q Local Address Foreign Address State PID/Program
 * name`, the `PID/Program` cell where ss prints `users:(("proc",pid=,fd=))`. The
 * gag steered the player to ss as the modern tool; installed, netstat is the same
 * truth in the old shape, a downed unit honestly absent from both.
 */
function netstatLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const withProc = args.join('').includes('p');
  const header = `${pad('Proto', 6)}${pad('Recv-Q', 7)}${pad('Send-Q', 7)}${
    pad('Local Address', 24)
  }${pad('Foreign Address', 24)}${pad('State', 8)}${
    withProc ? 'PID/Program name' : ''
  }`;

  const rows = runningUnitsOn(api, session)
    .flatMap((unit) => listenersOf(unit).map((listener) => ({
      listener,
      pid: unitPid(unit.id),
    })))
    .sort((left, right) => left.listener.port - right.listener.port)
    .map(({ listener, pid }) => `${pad('tcp', 6)}${pad('0', 7)}${pad('0', 7)}${
      pad(`${listener.addr === '*' ? '0.0.0.0' : listener.addr}:${
        String(listener.port)
      }`, 24)
    }${pad('0.0.0.0:*', 24)}${pad('LISTEN', 8)}${
      withProc ? `${String(pid)}/${listener.proc}` : ''
    }`);

  return lines(
    'Active Internet connections (only servers)',
    header,
    ...rows,
  );
}

/* -- the distro axis: the dialect a box's package manager speaks (0.27.0) - */

/**
 * The box the player was issued: the machine their own account owns.
 *
 * The same walk `cmd-run` makes for `hostname`/`ipconfig`, because it is the
 * same question - which of the estate's machines is THIS desk - and the answer
 * has to agree across the two dialects.
 */
function ownBoxId(api: GameApi): string | null {
  return api.graph
    .neighbors(api.actor, { direction: 'out', edgeKind: 'owns' })
    .find((node) => node.kind === 'machine')?.id ?? null;
}

/**
 * Whether the player has put Linux on their own machine (0.27.0).
 *
 * It is a SHELL fact, not a world one: the desktop and the distro ride the
 * save-carried screen store, so nothing in the graph moves when somebody
 * reinstalls their own workstation, and every golden world stays identical.
 * What it changes is what that one box will answer to - it runs sshd now, and
 * it speaks its distro's package manager.
 */
function ownBoxDistro(api: GameApi): DistroId | null {
  return api.appState.get().desktop.distro;
}

function isOwnBox(api: GameApi, hostId: string): boolean {
  return ownBoxId(api) === hostId;
}

/**
 * The package-manager verb a box speaks.
 *
 * Every server on the estate is the Ubuntu the world seeds, so every one of
 * them speaks `apt` exactly as it always has. The one box that can speak
 * anything else is the player's OWN, because the player is the only person who
 * gets to reinstall it - which is the whole of the distro axis, wired thin:
 * Ubuntu and Mint speak apt, Fedora and the RHEL family speak dnf, and the
 * mechanics underneath the two verbs are the same mechanics.
 */
function packageManagerOn(
  api: GameApi,
  session: Readonly<SshSession>,
): PackageManager {
  const distro = isOwnBox(api, session.hostId) ? ownBoxDistro(api) : null;

  return packageManagerFor(distro) ?? 'apt';
}

/**
 * What a box says when you use the OTHER family's package manager on it.
 *
 * `apt` on a Fedora box and `dnf` on an Ubuntu one are both just missing
 * binaries, and bash says so in one line. It is the sharpest thing the dialect
 * axis has: the mechanics are identical and the words are not, which is exactly
 * what walking onto an unfamiliar box feels like.
 */
function wrongPackageManager(
  name: string,
  manager: PackageManager,
): CommandResult {
  return lines(
    `${name}: command not found`,
    `This box speaks ${manager}. ${name} is the other family's package `
      + 'manager; the mechanics are the same, the words are not.',
  );
}

/* -- apt / dpkg: install, and the box's pending-updates state ------------- */

/** One upgradable package as `apt list --upgradable` prints one. */
interface Upgradable {
  readonly pkg: string;
  /** The apt pocket(s) the update is in - `noble-security` is a security one. */
  readonly pocket: string;
  readonly arch: string;
  readonly from: string;
  readonly to: string;
  readonly bytes: number;
}

/**
 * The pool of real Ubuntu 24.04 (noble) upgradable packages a box can be behind
 * on, security update FIRST so it is always in a box's pending set. Real package
 * names, pockets and version bumps - nothing invented - so `apt list --upgradable`
 * reads like a real one. A `noble-security` pocket is what marks the security
 * update, exactly as apt does.
 */
const UPGRADABLE_POOL: readonly Upgradable[] = [
  {
    pkg: 'libssl3t64',
    pocket: 'noble-updates,noble-security',
    arch: 'amd64',
    from: '3.0.13-0ubuntu3.1',
    to: '3.0.13-0ubuntu3.4',
    bytes: 1_938_432,
  },
  {
    pkg: 'openssh-server',
    pocket: 'noble-updates',
    arch: 'amd64',
    from: '1:9.6p1-3ubuntu13.4',
    to: '1:9.6p1-3ubuntu13.5',
    bytes: 512_000,
  },
  {
    pkg: 'curl',
    pocket: 'noble-updates',
    arch: 'amd64',
    from: '8.5.0-2ubuntu10.5',
    to: '8.5.0-2ubuntu10.6',
    bytes: 227_328,
  },
  {
    pkg: 'tzdata',
    pocket: 'noble-updates',
    arch: 'all',
    from: '2024a-0ubuntu0.24.04.1',
    to: '2024b-0ubuntu0.24.04.1',
    bytes: 274_432,
  },
  {
    pkg: 'vim-common',
    pocket: 'noble-updates',
    arch: 'all',
    from: '2:9.1.0016-1ubuntu7.7',
    to: '2:9.1.0016-1ubuntu7.8',
    bytes: 98_304,
  },
];

/** Whether an upgradable row is a security update, off its pocket. */
function isSecurity(row: Readonly<Upgradable>): boolean {
  return row.pocket.includes('security');
}

/**
 * The updates a box is behind on: a deterministic slice of the pool sized off
 * the box id (so different boxes are behind on different amounts) and ALWAYS
 * including the security one, because it slices from the front where the security
 * row lives. It is DERIVED, not seeded into the graph, which is what keeps every
 * existing world byte-identical - and once the engineer runs `apt upgrade` the
 * box's `updates_applied` flag reads clean and this returns none.
 */
function pendingUpdatesFor(boxId: string): readonly Upgradable[] {
  const spread = UPGRADABLE_POOL.length - 2; // 3..POOL.length inclusive
  const count = 3 + (stableHash(`${boxId}:apt`) % spread);

  return UPGRADABLE_POOL.slice(0, count);
}

/** The box's pending updates - the derived baseline, or none once patched. */
function boxPending(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly Upgradable[] {
  const applied = api.graph.getField(session.hostId, FIELDS.updatesApplied)
    === true;

  return applied ? [] : pendingUpdatesFor(session.hostId);
}

/**
 * The packages `apt install` can actually put on this box - the three the
 * not-installed gags point at, each with the real version and sizes apt prints.
 * A package outside this catalogue is `Unable to locate package`, exactly as a
 * real box answers for one it has no source for.
 */
interface Installable {
  readonly version: string;
  readonly arch: string;
  readonly component: string;
  readonly downloadBytes: number;
  readonly installBytes: number;
}

const INSTALLABLE_PACKAGES: Readonly<Record<string, Installable>> = {
  htop: {
    version: '3.3.0-4build1',
    arch: 'amd64',
    component: 'universe',
    downloadBytes: 176_128,
    installBytes: 495_616,
  },
  traceroute: {
    version: '1:2.1.5-1',
    arch: 'amd64',
    component: 'main',
    downloadBytes: 46_080,
    installBytes: 153_600,
  },
  'net-tools': {
    version: '2.10-0.1ubuntu4',
    arch: 'amd64',
    component: 'main',
    downloadBytes: 208_896,
    installBytes: 829_440,
  },
};

/** A byte count as apt prints an archive size (`176 kB`, `1,938 kB`). */
function aptSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${String(Math.round(bytes / 1000))} kB`;
}

/** The three "Reading..." lines apt opens every run with. */
const APT_PREAMBLE: readonly string[] = [
  'Reading package lists... Done',
  'Building dependency tree... Done',
  'Reading state information... Done',
];

/** The dpkg-lock permission error apt prints when a privileged run has no sudo. */
function aptNeedsRoot(): CommandResult {
  return lines(
    ...APT_PREAMBLE,
    'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: '
      + 'Permission denied)',
    'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), '
      + 'are you root?',
  );
}

/**
 * `apt install <pkg>` - the key that closes the not-installed gag.
 *
 * It is privileged, so without `sudo` it fails on the dpkg lock ("are you
 * root?"), which is how the dialect teaches sudo. With it: a package outside the
 * catalogue is `Unable to locate package`; one already installed says so (apt's
 * own "already the newest version"); and one that installs prints the real apt
 * NEW-packages shape and records the package in the box's `installed_packages`
 * set - the write that makes the previously-gagged command run. The shell guards
 * the already-installed case, so the dispatched append is never a duplicate.
 */
function aptInstallLines(
  api: GameApi,
  session: Readonly<SshSession>,
  pkg: string,
  sudo: boolean,
): CommandResult {
  if (pkg.length === 0) {
    return lines('apt install: a package name is required.');
  }

  if (!sudo) {
    return aptNeedsRoot();
  }

  const spec = INSTALLABLE_PACKAGES[pkg];

  if (spec === undefined) {
    return lines(
      ...APT_PREAMBLE,
      `E: Unable to locate package ${pkg}`,
    );
  }

  const notUpgraded = boxPending(api, session).length;

  if (isPackageInstalled(api, session, pkg)) {
    return lines(
      ...APT_PREAMBLE,
      `${pkg} is already the newest version (${spec.version}).`,
      `0 upgraded, 0 newly installed, 0 to remove and ${
        String(notUpgraded)
      } not upgraded.`,
    );
  }

  const result = api.dispatch(
    APT_ACTIONS.aptInstall,
    api.actor,
    session.hostId,
    { [APT_PACKAGE_PARAM]: pkg },
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  return lines(
    ...APT_PREAMBLE,
    'The following NEW packages will be installed:',
    `  ${pkg}`,
    `0 upgraded, 1 newly installed, 0 to remove and ${
      String(notUpgraded)
    } not upgraded.`,
    `Need to get ${aptSize(spec.downloadBytes)} of archives.`,
    `After this operation, ${
      aptSize(spec.installBytes)
    } of additional disk space will be used.`,
    `Get:1 http://archive.ubuntu.com/ubuntu noble/${spec.component} ${
      spec.arch
    } ${pkg} ${spec.arch} ${spec.version} [${aptSize(spec.downloadBytes)}]`,
    `Fetched ${aptSize(spec.downloadBytes)} in 0s (0 B/s)`,
    `Selecting previously unselected package ${pkg}.`,
    '(Reading database ... 41234 files and directories currently installed.)',
    `Preparing to unpack .../${pkg}_${spec.version}_${spec.arch}.deb ...`,
    `Unpacking ${pkg} (${spec.version}) ...`,
    `Setting up ${pkg} (${spec.version}) ...`,
    'Processing triggers for man-db (2.12.0-4build2) ...',
  );
}

/**
 * `apt update` - refreshing the package lists. Privileged (no sudo -> the lock
 * error), and it reads the box's pending state to print the "N packages can be
 * upgraded" summary a box behind on patches shows, or "All packages are up to
 * date." once `apt upgrade` has cleared it.
 */
function aptUpdateLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sudo: boolean,
): CommandResult {
  if (!sudo) {
    return aptNeedsRoot();
  }

  const pending = boxPending(api, session);
  const security = pending.filter(isSecurity).length;

  return lines(
    'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease',
    'Hit:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease',
    'Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]',
    `Fetched 126 kB in 0s (0 B/s)`,
    'Reading package lists... Done',
    'Building dependency tree... Done',
    'Reading state information... Done',
    ...(pending.length === 0
      ? ['All packages are up to date.']
      : [
        `${String(pending.length)} package${
          pending.length === 1 ? '' : 's'
        } can be upgraded. Run 'apt list --upgradable' to see them.`,
        ...(security > 0
          ? [`${String(security)} of these updates ${
            security === 1 ? 'is a security update' : 'are security updates'
          }.`]
          : []),
      ]),
  );
}

/**
 * `apt list --upgradable` - the list itself, one `pkg/pocket ver arch [upgradable
 * from: old]` row per pending update, off the box's real pending state. Read-only,
 * so no sudo needed. A patched box lists nothing but the `Listing... Done` line.
 */
function aptListLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const pending = boxPending(api, session);

  return lines(
    'Listing... Done',
    ...pending.map((row) => `${row.pkg}/${row.pocket} ${row.to} ${row.arch} `
      + `[upgradable from: ${row.from}]`),
  );
}

/**
 * `apt upgrade` - applying the pending updates. Privileged (no sudo -> the lock
 * error). It prints the real upgrade shape off the box's pending set and
 * dispatches the verb that sets `updates_applied`, after which the box reads
 * clean; run on an already-clean box it is the honest no-op apt prints ("0
 * upgraded ... 0 not upgraded").
 */
function aptUpgradeLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sudo: boolean,
): CommandResult {
  if (!sudo) {
    return aptNeedsRoot();
  }

  const pending = boxPending(api, session);

  if (pending.length === 0) {
    return lines(
      ...APT_PREAMBLE,
      'Calculating upgrade... Done',
      '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.',
    );
  }

  const result = api.dispatch(
    APT_ACTIONS.aptUpgrade,
    api.actor,
    session.hostId,
    {},
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  const totalBytes = pending.reduce((sum, row) => sum + row.bytes, 0);

  return lines(
    ...APT_PREAMBLE,
    'Calculating upgrade... Done',
    'The following packages will be upgraded:',
    `  ${pending.map((row) => row.pkg).join(' ')}`,
    `${String(pending.length)} upgraded, 0 newly installed, 0 to remove and `
      + '0 not upgraded.',
    `Need to get ${aptSize(totalBytes)} of archives.`,
    'After this operation, 0 B of additional disk space will be used.',
    ...pending.map(
      (row) => `Setting up ${row.pkg} (${row.to}) ...`,
    ),
    'Processing triggers for man-db (2.12.0-4build2) ...',
    'Processing triggers for libc-bin (2.39-0ubuntu8.3) ...',
  );
}

/** Dispatches an `apt <sub>`, or names the four subcommands for an unknown one. */
function aptLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sub: string,
  query: string,
  args: readonly string[],
  sudo: boolean,
): CommandResult {
  switch (sub) {
    case 'install':
      return aptInstallLines(api, session, query.trim(), sudo);
    case 'update':
      return aptUpdateLines(api, session, sudo);
    case 'upgrade':
      return aptUpgradeLines(api, session, sudo);
    case 'list':
      // `apt list --upgradable` is the one this dialect answers; a bare `apt
      // list` on a real box is every package, which the dpkg -l surface covers.
      return args.some((arg) => arg === '--upgradable')
        ? aptListLines(api, session)
        : lines(
          'apt list: this terminal answers "apt list --upgradable" - the '
            + 'pending updates. For the installed set, use "dpkg -l".',
        );
    default:
      return lines(
        `"apt ${sub}" is not something this terminal does.`,
        'It does "apt install <pkg>", "apt update", "apt list --upgradable" '
          + 'and "apt upgrade".',
      );
  }
}

/* -- dnf: the same mechanics, the other dialect (0.27.0) ------------------ */

/**
 * The RPM face of the same packages.
 *
 * The dnf overlay is exactly that - an OVERLAY. It reads the same derived
 * pending set `apt` reads, guards on the same `installed_packages` field and
 * dispatches the same two registered actions; what differs is the words, the
 * table and the package strings, because a Fedora box genuinely names and
 * versions its packages differently. Nothing about the mechanics is duplicated,
 * which is the whole point of the axis being a dialect rather than a second
 * system: `dnf upgrade` on a box that `apt upgrade` has already patched finds
 * nothing to do, because there is one truth on the machine and both verbs read
 * it.
 */
interface RpmName {
  readonly pkg: string;
  readonly version: string;
  readonly repo: string;
}

/** The pending pool's Debian names, as the RPM the same software ships as. */
const RPM_UPDATES: Readonly<Record<string, RpmName>> = {
  libssl3t64: {
    pkg: 'openssl-libs',
    version: '1:3.2.2-3.fc41',
    repo: 'updates',
  },
  'openssh-server': {
    pkg: 'openssh-server',
    version: '9.8p1-2.fc41',
    repo: 'updates',
  },
  curl: { pkg: 'curl', version: '8.9.1-2.fc41', repo: 'updates' },
  tzdata: { pkg: 'tzdata', version: '2024b-1.fc41', repo: 'updates' },
  'vim-common': {
    pkg: 'vim-common',
    version: '2:9.1.802-1.fc41',
    repo: 'updates',
  },
};

/** And the installables, as the RPM `dnf install` would put on the box. */
const RPM_PACKAGES: Readonly<Record<string, RpmName>> = {
  htop: { pkg: 'htop', version: '3.3.0-4.fc41', repo: 'fedora' },
  traceroute: { pkg: 'traceroute', version: '3:2.1.5-2.fc41', repo: 'fedora' },
  'net-tools': { pkg: 'net-tools', version: '2.10-9.fc41', repo: 'fedora' },
};

/** The architecture every box in this estate is on. */
const RPM_ARCH = 'x86_64';

/** A byte count as dnf prints one: `190 k`, `1.9 M`. */
function rpmSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} M`
    : `${String(Math.round(bytes / 1000))} k`;
}

/** The rule dnf draws its transaction table between. */
const DNF_RULE = '='.repeat(80);

const DNF_TABLE_HEAD = ` ${pad('Package', 15)}${pad('Arch', 9)}${
  pad('Version', 21)
}${pad('Repository', 13)}Size`;

function dnfRow(name: Readonly<RpmName>, bytes: number): string {
  return ` ${pad(name.pkg, 15)}${pad(RPM_ARCH, 9)}${pad(name.version, 21)}${
    pad(name.repo, 13)
  }${rpmSize(bytes)}`;
}

/** dnf's own refusal when a privileged subcommand is run without root. */
function dnfNeedsRoot(): CommandResult {
  return lines(
    'Error: This command has to be run with superuser privileges (under the '
      + 'root user on most systems).',
  );
}

/**
 * `dnf install <pkg>` - the same key that closes the not-installed gag, cut for
 * the other lock.
 *
 * Privileged (no sudo -> dnf's superuser error rather than apt's dpkg lock, and
 * the difference is the dialect); a package outside the catalogue is dnf's own
 * `No match for argument`; one already installed is its `Package ... is already
 * installed`. A real install dispatches `apt.install` - the SAME registered
 * action, because what changes on the box is the same fact.
 */
function dnfInstallLines(
  api: GameApi,
  session: Readonly<SshSession>,
  pkg: string,
  sudo: boolean,
): CommandResult {
  if (pkg.length === 0) {
    return lines('dnf install: a package name is required.');
  }

  if (!sudo) {
    return dnfNeedsRoot();
  }

  const spec = INSTALLABLE_PACKAGES[pkg];
  const name = RPM_PACKAGES[pkg];

  if (spec === undefined || name === undefined) {
    return lines(
      `No match for argument: ${pkg}`,
      'Error: Unable to find a match: ' + pkg,
    );
  }

  if (isPackageInstalled(api, session, pkg)) {
    return lines(
      `Package ${name.pkg}-${name.version}.${RPM_ARCH} is already installed.`,
      'Dependencies resolved.',
      'Nothing to do.',
      'Complete!',
    );
  }

  const result = api.dispatch(
    APT_ACTIONS.aptInstall,
    api.actor,
    session.hostId,
    { [APT_PACKAGE_PARAM]: pkg },
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  return lines(
    'Dependencies resolved.',
    DNF_RULE,
    DNF_TABLE_HEAD,
    DNF_RULE,
    'Installing:',
    dnfRow(name, spec.downloadBytes),
    '',
    'Transaction Summary',
    DNF_RULE,
    'Install  1 Package',
    '',
    `Total download size: ${rpmSize(spec.downloadBytes)}`,
    `Installed size: ${rpmSize(spec.installBytes)}`,
    'Downloading Packages:',
    'Running transaction check',
    'Transaction check succeeded.',
    'Running transaction test',
    'Transaction test succeeded.',
    'Running transaction',
    `  Installing       : ${name.pkg}-${name.version}.${RPM_ARCH}`,
    `  Verifying        : ${name.pkg}-${name.version}.${RPM_ARCH}`,
    '',
    'Installed:',
    `  ${name.pkg}-${name.version}.${RPM_ARCH}`,
    '',
    'Complete!',
  );
}

/**
 * `dnf check-update` - the read half, and the one that is SILENT when there is
 * nothing to say.
 *
 * A real `dnf check-update` on a patched box prints nothing at all and exits
 * zero, and this prints nothing at all too - the same family beat `systemctl
 * restart` teaches, where the answer to "it worked" is silence. On a box behind
 * on patches it prints the `name.arch version repo` rows, which is the shape it
 * actually has. Read-only, so no sudo.
 */
function dnfCheckUpdateLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  return lines(
    ...boxPending(api, session).flatMap((row) => {
      const name = RPM_UPDATES[row.pkg];

      return name === undefined
        ? []
        : [`${pad(`${name.pkg}.${RPM_ARCH}`, 30)}${
          pad(name.version, 24)
        }${name.repo}`];
    }),
  );
}

/**
 * `dnf upgrade` - applying the pending updates, through the same verb `apt
 * upgrade` dispatches.
 *
 * Privileged. On a clean box it is dnf's honest two words ("Nothing to do."),
 * and on one behind on patches it prints the upgrade transaction and sets the
 * box's `updates_applied` flag - after which `dnf check-update` and `apt list
 * --upgradable` both read clean, because they are reading the same box.
 */
function dnfUpgradeLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sudo: boolean,
): CommandResult {
  if (!sudo) {
    return dnfNeedsRoot();
  }

  const pending = boxPending(api, session);

  if (pending.length === 0) {
    return lines('Dependencies resolved.', 'Nothing to do.', 'Complete!');
  }

  const result = api.dispatch(
    APT_ACTIONS.aptUpgrade,
    api.actor,
    session.hostId,
    {},
  );

  if (!result.ok) {
    return lines(result.reason);
  }

  const rows = pending.flatMap((row) => {
    const name = RPM_UPDATES[row.pkg];

    return name === undefined ? [] : [{ name, bytes: row.bytes }];
  });
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);

  return lines(
    'Dependencies resolved.',
    DNF_RULE,
    DNF_TABLE_HEAD,
    DNF_RULE,
    'Upgrading:',
    ...rows.map((row) => dnfRow(row.name, row.bytes)),
    '',
    'Transaction Summary',
    DNF_RULE,
    `Upgrade  ${String(rows.length)} Package${rows.length === 1 ? '' : 's'}`,
    '',
    `Total download size: ${rpmSize(totalBytes)}`,
    'Running transaction check',
    'Transaction check succeeded.',
    'Running transaction test',
    'Transaction test succeeded.',
    'Running transaction',
    ...rows.map(
      (row) => `  Upgrading        : ${row.name.pkg}-${row.name.version}.${
        RPM_ARCH
      }`,
    ),
    '',
    'Complete!',
  );
}

/** Dispatches a `dnf <sub>`, or names the three subcommands it does. */
function dnfLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sub: string,
  query: string,
  sudo: boolean,
): CommandResult {
  switch (sub) {
    case 'install':
      return dnfInstallLines(api, session, query.trim(), sudo);
    case 'check-update':
      return dnfCheckUpdateLines(api, session);
    case 'upgrade':
    case 'update':
      // `dnf update` is the alias every RHEL-era finger types; dnf keeps it.
      return dnfUpgradeLines(api, session, sudo);
    default:
      return lines(
        `"dnf ${sub}" is not something this terminal does.`,
        'It does "dnf install <pkg>", "dnf check-update" and "dnf upgrade".',
      );
  }
}

/**
 * The base packages every Ubuntu 24.04 box carries, as `dpkg -l` rows: real
 * package names and versions. Representative rather than exhaustive - a real
 * dpkg -l is hundreds of lines - the same honest abstraction `ps aux` makes by
 * listing the units rather than every kernel thread.
 */
const DPKG_BASE: readonly (readonly [string, string, string, string])[] = [
  ['apt', '2.7.14build2', 'amd64', 'commandline package manager'],
  ['bash', '5.2.21-2ubuntu4', 'amd64', 'GNU Bourne Again SHell'],
  ['coreutils', '9.4-3ubuntu6', 'amd64', 'GNU core utilities'],
  ['dpkg', '1.22.6ubuntu6', 'amd64', 'Debian package management system'],
  ['libc6', '2.39-0ubuntu8.3', 'amd64', 'GNU C Library: Shared libraries'],
  ['nginx', '1.24.0-2ubuntu7', 'amd64', 'small, powerful, scalable web server'],
  ['openssh-server', '1:9.6p1-3ubuntu13.4', 'amd64', 'secure shell (SSH) server'],
  ['systemd', '255.4-1ubuntu8', 'amd64', 'system and service manager'],
];

/** The descriptions for the packages apt can install, for their dpkg -l rows. */
const DPKG_INSTALLED_DESC: Readonly<Record<string, string>> = {
  htop: 'interactive processes viewer',
  traceroute: 'Traces the route taken by packets over a network',
  'net-tools': 'NET-3 networking toolkit',
};

/**
 * `dpkg -l` - the installed-package list, in dpkg's `ii name version arch desc`
 * shape under its four-line status legend. It lists the base set every box
 * carries PLUS the packages the engineer has `apt install`ed here, so a package
 * installed a moment ago shows up in dpkg -l as `ii` - the two surfaces agreeing
 * off the one real box field.
 */
function dpkgLines(
  api: GameApi,
  session: Readonly<SshSession>,
): CommandResult {
  const installed = readInstalledPackages(
    api.graph.getField(session.hostId, FIELDS.installedPackages),
  );
  const extras = installed
    .map((pkg): readonly [string, string, string, string] | null => {
      const spec = INSTALLABLE_PACKAGES[pkg];

      return spec === undefined
        ? null
        : [pkg, spec.version, spec.arch, DPKG_INSTALLED_DESC[pkg] ?? pkg];
    })
    .filter((row): row is readonly [string, string, string, string] => row !== null);

  const rows = [...DPKG_BASE, ...extras]
    .slice()
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, version, arch, desc]) => `ii  ${pad(name, 22)}${
      pad(version, 24)
    }${pad(arch, 8)}${desc}`);

  return lines(
    'Desired=Unknown/Install/Remove/Purge/Hold',
    '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/'
      + 'Trig-pend',
    '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)',
    `||/ ${pad('Name', 22)}${pad('Version', 24)}${pad('Architecture', 8)}`
      + 'Description',
    `+++-${'='.repeat(21)}-${'='.repeat(23)}-${'='.repeat(7)}-${'='.repeat(33)}`,
    ...rows,
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

/* -- certbot: the cert-expiry fix ----------------------------------------- */

/**
 * The unit on the box that terminates TLS - nginx, the reverse proxy the cert is
 * presented by. The cert-expiry incident's `cert_expired` flag lives on it, and
 * this is what curl refuses on and certbot renews.
 */
function certBearingUnit(
  api: GameApi,
  session: Readonly<SshSession>,
): ReadOnlyGraphNode | null {
  return api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit')
    .find((node) => unitBase(node) === 'nginx') ?? null;
}

/**
 * `certbot renew` / `certbot certificates` - the cert-expiry fix, and reading
 * the box's certificate state.
 *
 * `renew` replaces an EXPIRED certificate and reloads the service, which is a
 * real state change (the `cert_expired` flag the served box refuses on) - it
 * dispatches the renew verb, silent-on-refusal in the verb's own words when the
 * cert is valid (certbot really does say "not yet due for renewal"). `certificates`
 * reads the box's cert state without changing it, the diagnosis half.
 */
function certbotLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sub: string,
): CommandResult {
  const unit = certBearingUnit(api, session);

  if (unit === null) {
    return lines(
      'certbot: no web server with a certificate on this box - there is nothing '
        + 'here to renew.',
    );
  }

  const expired = unit.fields[FIELDS.certExpired] === true;
  const domain = fqdn(session.hostname);

  if (sub === 'certificates') {
    return lines(
      'Found the following certs:',
      `  Certificate Name: ${domain}`,
      `    Domains: ${domain}`,
      `    Expiry Date: ${expired
        ? 'EXPIRED (renew now: certbot renew)'
        : 'valid (not yet due for renewal)'}`,
      '    Certificate Path: /etc/letsencrypt/live/'
        + `${domain}/fullchain.pem`,
    );
  }

  if (sub !== 'renew') {
    return lines(
      `"certbot ${sub}" is not something this terminal does.`,
      'It does "certbot renew" (replace an expired certificate) and "certbot '
        + 'certificates" (read what is on the box).',
    );
  }

  const result = api.dispatch(
    INCIDENT_ACTIONS.certRenew,
    api.actor,
    unit.id,
    {},
  );

  // A valid cert refuses the renew with the verb's own reason - certbot's real
  // "not yet due for renewal" is that same honest non-event.
  if (!result.ok) {
    return lines(
      `Certificate not yet due for renewal; no action taken for ${domain}.`,
      '',
      result.reason,
    );
  }

  return lines(
    'Processing /etc/letsencrypt/renewal/'
      + `${domain}.conf`,
    `Renewing an existing certificate for ${domain}`,
    '',
    'Congratulations, all renewals succeeded:',
    `  /etc/letsencrypt/live/${domain}/fullchain.pem (success)`,
    '',
    'Reloading nginx to pick up the new certificate. The service was up the '
      + 'whole time - it is the certificate that was refused, and now it is not.',
  );
}

/* -- postmortem: the blameless record that closes an incident -------------- */

/**
 * `postmortem file <unit>` / `postmortem list` (E6, 0.19.0).
 *
 * `file` writes the blameless post-incident record that closes an incident once
 * the fire is out - it resolves the unit on the box and hands off to the driver,
 * which reads the authored (gated) prose, records the filing on the append-only
 * trail and prints the write-up. `list` reads back how many postmortems are on
 * the player's own trail. The verb refuses a postmortem on a unit still down, or
 * one already written - a postmortem is the record of a fire that is OUT.
 */
function postmortemUnixLines(
  api: GameApi,
  session: Readonly<SshSession>,
  sub: string,
  query: string,
): CommandResult {
  if (sub === 'list') {
    const filed = readKnownHosts(
      api.graph.getField(api.actor, FIELDS.postmortems),
    );

    return filed.length === 0
      ? lines('No postmortems on the record yet.')
      : lines(
        `${String(filed.length)} postmortem(s) on the record:`,
        ...filed,
      );
  }

  if (sub !== 'file') {
    return lines(
      `"postmortem ${sub}" is not something this terminal does.`,
      'It does "postmortem file <unit>" - to write the blameless record that '
        + 'closes an incident once it is resolved - and "postmortem list", to '
        + 'read back what has been filed.',
    );
  }

  const unitName = query.trim();

  if (unitName.length === 0) {
    return lines('usage: postmortem file <unit>');
  }

  const unit = unitOnBox(api, session, unitName);

  if (unit === null) {
    return lines(`Unit ${unitName}.service could not be found on this box.`);
  }

  return lines(...api.day.filePostmortem(unit.id));
}

/* -- id / whoami / getent: who is on the box (E6, 0.21.0) ----------------- */

/**
 * One entry in the box's user database - a row of /etc/passwd, plus the group
 * membership `id` prints. Derived from the box, never seeded: a Linux box's user
 * set is a real function of what runs on it (the daemons' service accounts) and
 * who logged in (the ssh session), so it reads off the estate the way `ps aux`
 * and `ss` do rather than adding a field every existing world would have to carry.
 */
interface PasswdEntry {
  readonly name: string;
  readonly uid: number;
  readonly gid: number;
  /** The primary group's name, for the `gid=G(name)` id column. */
  readonly group: string;
  readonly gecos: string;
  readonly home: string;
  readonly shell: string;
  /** Primary + supplementary groups, the `groups=` list `id` prints. */
  readonly groups: readonly (readonly [number, string])[];
}

/**
 * The real service account each stock daemon runs as: nginx is `www-data`,
 * postgres is `postgres`, and the base plumbing (cron, sshd, journald) is root.
 * A product unit that is not one of these runs as its OWN account, named after
 * the unit - the convention a real deployment follows and the one `ps aux`
 * already splits on.
 */
const DAEMON_USERS: Readonly<Record<string, string>> = {
  nginx: 'www-data',
  cron: 'root',
  ssh: 'root',
  sshd: 'root',
  'systemd-journald': 'root',
  postgresql: 'postgres',
};

/** The account a unit's daemon runs as - a real service user, off the unit name. */
function serviceUserOf(node: Readonly<ReadOnlyGraphNode>): string {
  const base = unitBase(node);
  const postgres = base.startsWith('postgresql@') ? 'postgres' : undefined;

  return postgres ?? DAEMON_USERS[base] ?? base;
}

/** Every unit on the box the session stands on, running or not, id-sorted. */
function unitsOnBox(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(session.hostId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit')
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** A stable, plausible sysuser uid for a service account (adduser --system range). */
function serviceUid(name: string): number {
  return 900 + (stableHash(`${name}:uid`) % 90);
}

/**
 * The box's user database, derived from the estate: the base system accounts
 * every Ubuntu box carries (root, daemon, nobody), the service accounts of the
 * daemons that actually run on THIS box (www-data if nginx is here, postgres if
 * postgresql is, and a dedicated account per product unit), and the login user
 * the ssh session is running as. Deterministic and off the graph - the same box
 * always answers the same set, and a box running a different product answers a
 * different one.
 */
function boxUsers(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly PasswdEntry[] {
  const login = session.username;
  const services = new Set(unitsOnBox(api, session).map(serviceUserOf));

  const entries: PasswdEntry[] = [
    {
      name: 'root',
      uid: 0,
      gid: 0,
      group: 'root',
      gecos: 'root',
      home: '/root',
      shell: '/bin/bash',
      groups: [[0, 'root']],
    },
    {
      name: 'daemon',
      uid: 1,
      gid: 1,
      group: 'daemon',
      gecos: 'daemon',
      home: '/usr/sbin',
      shell: '/usr/sbin/nologin',
      groups: [[1, 'daemon']],
    },
  ];

  if (services.has('www-data')) {
    entries.push({
      name: 'www-data',
      uid: 33,
      gid: 33,
      group: 'www-data',
      gecos: 'www-data',
      home: '/var/www',
      shell: '/usr/sbin/nologin',
      groups: [[33, 'www-data']],
    });
  }

  if (services.has('postgres')) {
    entries.push({
      name: 'postgres',
      uid: 114,
      gid: 120,
      group: 'postgres',
      gecos: 'PostgreSQL administrator',
      home: '/var/lib/postgresql',
      shell: '/bin/bash',
      groups: [[120, 'postgres']],
    });
  }

  // A dedicated service account per product unit - anything not a stock daemon
  // and not the login user, in name order so the listing is stable.
  const productAccounts = [...services]
    .filter((name) => name !== 'root' && name !== 'www-data'
      && name !== 'postgres' && name !== login)
    .sort((left, right) => left.localeCompare(right));

  for (const name of productAccounts) {
    const uid = serviceUid(name);

    entries.push({
      name,
      uid,
      gid: uid,
      group: name,
      gecos: '',
      home: '/nonexistent',
      shell: '/usr/sbin/nologin',
      groups: [[uid, name]],
    });
  }

  entries.push({
    name: 'nobody',
    uid: 65534,
    gid: 65534,
    group: 'nobody',
    gecos: 'nobody',
    home: '/nonexistent',
    shell: '/usr/sbin/nologin',
    groups: [[65534, 'nobody']],
  });

  // The human at the keyboard - the ssh login, a real user with a home and a
  // shell, and a sudoer (they ssh in to work the box, and apt needs it).
  entries.push({
    name: login,
    uid: 1000,
    gid: 1000,
    group: login,
    gecos: '',
    home: `/home/${login}`,
    shell: '/bin/bash',
    groups: [[1000, login], [4, 'adm'], [27, 'sudo']],
  });

  return entries;
}

/** The passwd entry for a named user on the box, or null. */
function userNamed(
  api: GameApi,
  session: Readonly<SshSession>,
  name: string,
): PasswdEntry | null {
  const needle = name.trim();

  return boxUsers(api, session).find((entry) => entry.name === needle) ?? null;
}

/** The `id` line for one user: uid, gid and the groups list, in id's shape. */
function idLineFor(entry: Readonly<PasswdEntry>): string {
  const groups = entry.groups
    .map(([gid, name]) => `${String(gid)}(${name})`)
    .join(',');

  return `uid=${String(entry.uid)}(${entry.name}) gid=${String(entry.gid)}(${
    entry.group
  }) groups=${groups}`;
}

/**
 * `id [<user>]` - who a user is on this box, at fidelity: the real
 * `uid=1000(user) gid=1000(user) groups=1000(user),4(adm),27(sudo)` shape. Bare
 * `id` is the ssh session's own login; `id <name>` is that user, read off the
 * box's derived user set, with the real `id: 'x': no such user` for one the box
 * does not have.
 */
function idLines(
  api: GameApi,
  session: Readonly<SshSession>,
  query: string,
): CommandResult {
  const name = query.trim();
  const entry = name.length === 0
    ? userNamed(api, session, session.username)
    : userNamed(api, session, name);

  if (entry === null) {
    return lines(`id: '${name}': no such user`);
  }

  return lines(idLineFor(entry));
}

/**
 * `whoami` (unix) - just the login name, and a family difference from the
 * Windows whoami's `domain\user`: a Linux box answers the bare login the ssh
 * session is running as, nothing else.
 */
function unixWhoamiLines(session: Readonly<SshSession>): CommandResult {
  return lines(session.username);
}

/** The 7 colon-fields of one /etc/passwd line: name:x:uid:gid:gecos:home:shell. */
function passwdLine(entry: Readonly<PasswdEntry>): string {
  return `${entry.name}:x:${String(entry.uid)}:${String(entry.gid)}:${
    entry.gecos
  }:${entry.home}:${entry.shell}`;
}

/**
 * `getent passwd [<user>]` - the box's user database in /etc/passwd's exact
 * 7-colon-field shape. `getent passwd` lists every account; `getent passwd root`
 * is the one line for that user, and a name the box does not have is the honest
 * empty answer getent gives (no output, the way its non-zero exit reads on a
 * terminal). Only the `passwd` database is answered here - the box's user set is
 * the one this slice models.
 */
function getentLines(
  api: GameApi,
  session: Readonly<SshSession>,
  database: string,
  query: string,
): CommandResult {
  if (database !== 'passwd') {
    return lines(
      `getent: this terminal answers "getent passwd" - the box's user database. `
        + `"${database}" is a database it does not model here.`,
    );
  }

  const users = boxUsers(api, session);
  const name = query.trim();

  if (name.length === 0) {
    return lines(...users.map(passwdLine));
  }

  const entry = users.find((user) => user.name === name);

  return entry === undefined
    ? { lines: [], clear: false }
    : lines(passwdLine(entry));
}

/* -- the Linux filesystem: mode / owner / group (E6, 0.21.0) --------------- */

/** The mode a file/dir carries if the world holds none - a sensible ext4 default. */
function modeOf(node: Readonly<ReadOnlyGraphNode>): string {
  const seeded = textValue(node.fields[FIELDS.fsMode], '');

  if (seeded.length > 0) {
    return seeded;
  }

  return node.kind === 'directory' ? '755' : '644';
}

/** The owner a file/dir carries, defaulting to root the way a fresh file does. */
function ownerOf(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(node.fields[FIELDS.fsOwner], 'root');
}

/** The group a file/dir carries, defaulting to root. */
function groupOf(node: Readonly<ReadOnlyGraphNode>): string {
  return textValue(node.fields[FIELDS.fsGroup], 'root');
}

/** The last path segment - the name `ls` prints for an entry. */
function basename(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const at = trimmed.lastIndexOf('/');

  return at >= 0 ? trimmed.slice(at + 1) : trimmed;
}

/** A file's size in bytes, derived and stable off its path - deterministic. */
function fileSize(node: Readonly<ReadOnlyGraphNode>): number {
  if (node.kind === 'directory') {
    return 4096;
  }

  const path = textValue(node.fields[FIELDS.path], node.id);

  return 200 + (stableHash(`${path}:size`) % 600);
}

/** Whether a mode string is octal (`640`, `0640`) rather than symbolic (`g+r`). */
function isOctalMode(mode: string): boolean {
  return /^[0-7]{3,4}$/u.test(mode.trim());
}

/** The three permission digits of a mode string, owner/group/other. */
function modeDigits(mode: string): [number, number, number] {
  const octal = mode.trim().slice(-3).padStart(3, '0');

  return [
    Number.parseInt(octal[0] ?? '0', 8) || 0,
    Number.parseInt(octal[1] ?? '0', 8) || 0,
    Number.parseInt(octal[2] ?? '0', 8) || 0,
  ];
}

/**
 * A mode as `ls -la` renders it: the type char (`-` file, `d` directory) and
 * three rwx triads read off the octal digits. `640` on a file is `-rw-r-----`.
 */
function octalToSymbolic(mode: string, isDir: boolean): string {
  const triad = (digit: number): string => `${(digit & 4) === 4 ? 'r' : '-'}${
    (digit & 2) === 2 ? 'w' : '-'
  }${(digit & 1) === 1 ? 'x' : '-'}`;
  const [owner, group, other] = modeDigits(mode);

  return `${isDir ? 'd' : '-'}${triad(owner)}${triad(group)}${triad(other)}`;
}

/**
 * A symbolic chmod (`g+r`, `u-w`, `o=rx`, comma-separated) applied to the file's
 * CURRENT octal mode, to a new octal string - the arithmetic a real chmod does
 * that the op language cannot, kept in the shell so the engine action stays the
 * single write `ls -la` reads back. Null for a clause it cannot parse, which the
 * caller reports as chmod's own `invalid mode`.
 */
function applySymbolic(current: string, spec: string): string | null {
  const digits = modeDigits(current);
  const clauses = spec.split(',').map((clause) => clause.trim());

  for (const clause of clauses) {
    const match = /^([ugoa]*)([+\-=])([rwx]*)$/u.exec(clause);

    if (match === null) {
      return null;
    }

    const who = (match[1] ?? '').length === 0 ? 'a' : (match[1] ?? '');
    const op = match[2] ?? '+';
    const perms = match[3] ?? '';
    const bits = (perms.includes('r') ? 4 : 0)
      + (perms.includes('w') ? 2 : 0)
      + (perms.includes('x') ? 1 : 0);
    const targets = new Set<number>();

    if (who.includes('u') || who.includes('a')) {
      targets.add(0);
    }

    if (who.includes('g') || who.includes('a')) {
      targets.add(1);
    }

    if (who.includes('o') || who.includes('a')) {
      targets.add(2);
    }

    for (const index of targets) {
      const before = digits[index] ?? 0;
      digits[index] = op === '+'
        ? before | bits
        : op === '-' ? before & ~bits : bits;
    }
  }

  return `${String(digits[0] ?? 0)}${String(digits[1] ?? 0)}${
    String(digits[2] ?? 0)
  }`;
}

/**
 * Whether a user can READ a file, off its mode/owner/group - the real rwx test:
 * owner-read applies when the user IS the owner, group-read when the user is in
 * the file's group (which, for a service account whose primary group is its own
 * name, is when the group equals the user), else the other-read bit. The one
 * function the permission gate reads, off the same three fields `ls -la` shows.
 */
function canRead(
  user: string,
  mode: string,
  owner: string,
  group: string,
): boolean {
  const [ownerBits, groupBits, otherBits] = modeDigits(mode);

  if (user === owner) {
    return (ownerBits & 4) === 4;
  }

  if (user === group) {
    return (groupBits & 4) === 4;
  }

  return (otherBits & 4) === 4;
}

/** A path, trimmed and with a lone trailing slash dropped, the way ls reads one. */
function normalizeFsPath(raw: string): string {
  const trimmed = raw.trim();

  return trimmed.length > 1 && trimmed.endsWith('/')
    ? trimmed.slice(0, -1)
    : trimmed;
}

/** Every file/directory node the box the session stands on holds, by volume. */
function fsNodesOnBox(
  api: GameApi,
  session: Readonly<SshSession>,
): readonly ReadOnlyGraphNode[] {
  const host = session.hostname.toLowerCase();

  return [
    ...api.graph.nodesOfKind('file'),
    ...api.graph.nodesOfKind('directory'),
  ].filter(
    (node) => textValue(node.fields[FIELDS.volume], '').toLowerCase() === host,
  );
}

/** The file/dir node at an exact path on the box, or null. */
function fsNodeAt(
  api: GameApi,
  session: Readonly<SshSession>,
  path: string,
): ReadOnlyGraphNode | null {
  const target = normalizeFsPath(path);

  return fsNodesOnBox(api, session).find(
    (node) => textValue(node.fields[FIELDS.path], '') === target,
  ) ?? null;
}

/** One `ls -la` row for a seeded file/dir node, in the real column shape. */
function fsRow(node: Readonly<ReadOnlyGraphNode>, when: string): string {
  const isDir = node.kind === 'directory';
  const path = textValue(node.fields[FIELDS.path], node.id);

  return `${octalToSymbolic(modeOf(node), isDir)} ${isDir ? '2' : '1'} ${
    pad(ownerOf(node), 8)
  } ${pad(groupOf(node), 8)} ${String(fileSize(node)).padStart(6, ' ')} ${
    when
  } ${basename(path)}`;
}

/**
 * `ls -la <path>` over the box's seeded filesystem (E6, 0.21.0): a path that
 * names a seeded file lists that one row, and one that names a directory (or a
 * prefix the box holds files under) lists its entries the long way - the
 * mode/owner/group a chmod/chown then rewrites. Null when the path names nothing
 * the world holds, so a bare `ls -la` and browsing an unseeded box fall through
 * to the shape-proving home listing exactly as before, and every existing world
 * is byte-identical.
 */
function lsPathLines(
  api: GameApi,
  session: Readonly<SshSession>,
  target: string,
  all: boolean,
  when: string,
): CommandResult | null {
  const path = normalizeFsPath(target);
  const node = fsNodeAt(api, session, path);
  const prefix = `${path}/`;
  const children = fsNodesOnBox(api, session)
    .filter((child) => {
      const childPath = textValue(child.fields[FIELDS.path], '');

      if (!childPath.startsWith(prefix)) {
        return false;
      }

      const rest = childPath.slice(prefix.length);

      return rest.length > 0 && !rest.includes('/');
    })
    .sort((left, right) => textValue(left.fields[FIELDS.path], '')
      .localeCompare(textValue(right.fields[FIELDS.path], '')));

  // A named file, with nothing under it: `ls -la <file>` prints just its row.
  if (node !== null && node.kind === 'file' && children.length === 0) {
    return lines(fsRow(node, when));
  }

  // A directory (a seeded dir node, or a path the box holds files directly
  // under): the long listing, with the dot-entries when -a is set.
  if (node?.kind === 'directory' || children.length > 0) {
    const dotMode = node !== null
      ? octalToSymbolic(modeOf(node), true)
      : HOME_MODE;
    const owner = node !== null ? ownerOf(node) : 'root';
    const group = node !== null ? groupOf(node) : 'root';
    const dot = (name: string): string => `${dotMode} 2 ${pad(owner, 8)} ${
      pad(group, 8)
    } ${DIR_SIZE.padStart(6, ' ')} ${when} ${name}`;

    return lines(
      'total 8',
      ...(all ? [dot('.'), dot('..')] : []),
      ...children.map((child) => fsRow(child, when)),
    );
  }

  return null;
}

/**
 * The refusal a unit's `systemctl restart`/`start` gets while the config file it
 * needs is not readable by its service account (E6, 0.21.0), or null when there
 * is no such block. A real box's systemd reports the start failed and leaves the
 * unit down - so this returns systemd's own job-failed message and the shell
 * does NOT dispatch, which is what keeps the unit `failed` until the permission
 * is fixed. The read is off the SAME fs fields `ls -la` shows, so the block and
 * the diagnosis cannot disagree.
 */
function permissionBlockingStart(
  api: GameApi,
  unit: Readonly<ReadOnlyGraphNode>,
): CommandResult | null {
  const fileId = textValue(unit.fields[FIELDS.requiresFile], '');

  if (fileId.length === 0) {
    return null;
  }

  const file = api.graph.getNode(fileId);

  if (file === undefined) {
    return null;
  }

  const user = serviceUserOf(unit);

  if (canRead(user, modeOf(file), ownerOf(file), groupOf(file))) {
    return null;
  }

  const name = textValue(unit.fields[FIELDS.unitName], labelOf(unit));

  return lines(
    `Job for ${name} failed because the control process exited with error code.`,
    `See "systemctl status ${name}" and "journalctl -xeu ${name}" for details.`,
  );
}

/* -- chmod / chown: mutate the rwx state ls -la reads (E6, 0.21.0) --------- */

/**
 * `chmod <mode> <path>` - rewrite a file's permission bits, octal (`640`) or
 * symbolic (`g+r`, applied to the current mode). It resolves the target file on
 * the box, computes the new octal (the symbolic arithmetic lives here so the
 * engine action stays a single write), and dispatches the chmod that writes the
 * SAME `fs_mode` field `ls -la` reads - so a listing after it reflects it with no
 * drift. Silent on success, the way a real chmod is.
 */
function chmodLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const mode = (positional[0] ?? '').trim();
  const rawPath = positional[1] ?? '';

  if (mode.length === 0 || rawPath.length === 0) {
    return lines('usage: chmod <mode> <path>');
  }

  const file = fsNodeAt(api, session, rawPath);

  if (file === null) {
    return lines(
      `chmod: cannot access '${normalizeFsPath(rawPath)}': No such file or `
        + 'directory',
    );
  }

  const octal = isOctalMode(mode)
    ? mode.slice(-3).padStart(3, '0')
    : applySymbolic(modeOf(file), mode);

  if (octal === null) {
    return lines(`chmod: invalid mode: '${mode}'`);
  }

  const result = api.dispatch(
    FS_ACTIONS.chmod,
    api.actor,
    file.id,
    { [FS_MODE_PARAM]: octal },
  );

  return result.ok ? { lines: [], clear: false } : lines(result.reason);
}

/**
 * `chown <owner[:group]> <path>` - rewrite a file's owner and group. A bare
 * `chown user` leaves the group where it was; `chown user:group` sets both; a
 * trailing colon (`chown user:`) sets the group to the user's own. The owner and
 * group are validated against the box's real user set (a chown to a user the box
 * does not have is refused, the way a real one is), then dispatched to write the
 * SAME `fs_owner`/`fs_group` fields `ls -la` reads. Silent on success.
 */
function chownLines(
  api: GameApi,
  session: Readonly<SshSession>,
  args: readonly string[],
): CommandResult {
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const spec = (positional[0] ?? '').trim();
  const rawPath = positional[1] ?? '';

  if (spec.length === 0 || rawPath.length === 0) {
    return lines('usage: chown <owner[:group]> <path>');
  }

  const file = fsNodeAt(api, session, rawPath);

  if (file === null) {
    return lines(
      `chown: cannot access '${normalizeFsPath(rawPath)}': No such file or `
        + 'directory',
    );
  }

  const colon = spec.indexOf(':');
  const ownerPart = colon >= 0 ? spec.slice(0, colon) : spec;
  const groupPart = colon >= 0 ? spec.slice(colon + 1) : '';
  const owner = ownerPart.length > 0 ? ownerPart : ownerOf(file);
  // No colon: leave the group. Trailing colon: the group is the user's own.
  const group = colon < 0
    ? groupOf(file)
    : groupPart.length > 0 ? groupPart : owner;

  if (userNamed(api, session, owner) === null) {
    return lines(`chown: invalid user: '${spec}'`);
  }

  if (!isKnownGroup(api, session, group)) {
    return lines(`chown: invalid group: '${spec}'`);
  }

  const result = api.dispatch(
    FS_ACTIONS.chown,
    api.actor,
    file.id,
    { [FS_OWNER_PARAM]: owner, [FS_GROUP_PARAM]: group },
  );

  return result.ok ? { lines: [], clear: false } : lines(result.reason);
}

/** The groups a chown will accept: the box's user-eponymous groups, plus stock. */
const STOCK_GROUPS: ReadonlySet<string> = new Set([
  'root', 'daemon', 'adm', 'sudo', 'www-data', 'postgres', 'nogroup',
  'users', 'ssl-cert', 'nobody',
]);

/** Whether a group name is one this box would accept for a chown. */
function isKnownGroup(
  api: GameApi,
  session: Readonly<SshSession>,
  group: string,
): boolean {
  return STOCK_GROUPS.has(group) || userNamed(api, session, group) !== null;
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
      // The not-installed seam (0.16.0, closed 0.20.0): a stock Ubuntu box does
      // not carry traceroute/ifconfig/netstat/htop, so typing one is a real miss
      // that teaches, with Ubuntu's own `sudo apt install <pkg>` hint. Once the
      // engineer has `apt install`ed its package the SAME seam RUNS it instead -
      // the gag closed. Only a name that is not one of the four falls through to
      // the generic miss.
      const tool = resolveGaggedTool(api, session, parsed.name, parsed.args);

      if (tool !== null) {
        return tool;
      }

      // The log-not-a-command names (unattended-upgrades): its evidence is a log
      // tail, not stdout, so the honest answer points there rather than faking a
      // run - the 0.16.0 "some evidence is a log" lesson, on the patching surface.
      const note = systemNoteFor(parsed.name);

      if (note !== null) {
        return note;
      }

      return lines(
        `${parsed.name}: command not found`,
        parsed.suggestion === null
          ? 'This dialect is the core sysadmin surface - the deeper filesystem '
            + 'browsing (cat/cd beyond what a fix needs) is a later slice.'
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
    case 'du':
      return duLines(api, session, parsed.args);
    // The dialect seam (0.27.0): a box has ONE package manager, so the other
    // family's verb is a missing binary here exactly as it is on a real box.
    // Every server on the estate speaks apt, so this changes nothing anywhere
    // except on a machine the player has reinstalled themselves.
    case 'apt':
      return packageManagerOn(api, session) === 'apt'
        ? aptLines(
          api,
          session,
          parsed.sub,
          parsed.query,
          parsed.args,
          parsed.sudo === true,
        )
        : wrongPackageManager('apt', 'dnf');
    case 'dnf':
      return packageManagerOn(api, session) === 'dnf'
        ? dnfLines(
          api,
          session,
          parsed.sub,
          parsed.query,
          parsed.sudo === true,
        )
        : wrongPackageManager('dnf', 'apt');
    case 'dpkg':
      return packageManagerOn(api, session) === 'apt'
        ? dpkgLines(api, session)
        : wrongPackageManager('dpkg', 'dnf');
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
    case 'certbot':
      return certbotLines(api, session, parsed.sub);
    case 'postmortem':
      return postmortemUnixLines(api, session, parsed.sub, parsed.query);
    case 'ls':
      return lsLines(api, session, parsed.args);
    case 'id':
      return idLines(api, session, parsed.query);
    case 'whoami':
      return unixWhoamiLines(session);
    case 'getent':
      return getentLines(api, session, parsed.sub, parsed.query);
    case 'chmod':
      return chmodLines(api, session, parsed.args);
    case 'chown':
      return chownLines(api, session, parsed.args);
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
