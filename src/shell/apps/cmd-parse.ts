/**
 * The terminal's grammar, as a pure function. Everything the parser decides -
 * which command, how many arguments, what to suggest when the player invents
 * one - is decided here and unit-tested here, with no DOM and no world.
 */

export interface CommandSpec {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  /** When true the arguments are one value that happens to contain spaces. */
  readonly joined: boolean;
  /**
   * When true the FIRST argument is a sub-command rather than part of the
   * value: `net user awhitlock` is the `net` command doing `user` to an
   * account, and the account is everything after it.
   *
   * It exists because the real tools spell it that way and the player types
   * what they know. Left off everywhere else, because one command in eighteen
   * having a verb of its own is a property of that command rather than a shape
   * the parser should impose on the other seventeen.
   */
  readonly subcommand?: boolean;
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'help',
    usage: 'help',
    summary: 'List the commands this terminal admits to having.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
  {
    name: 'ping',
    usage: 'ping <host>',
    summary: 'Ask a machine whether it is still on the network.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'ipconfig',
    usage: 'ipconfig [/all | /flushdns]',
    summary: 'Print this workstation\'s address, or all of it.',
    minArgs: 0,
    maxArgs: 1,
    joined: false,
  },
  {
    name: 'tracert',
    usage: 'tracert <host>',
    summary: 'Follow the wire hop by hop until it stops.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'nslookup',
    usage: 'nslookup <name>',
    summary: 'Ask the name server whether a name is anybody.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'whoami',
    usage: 'whoami [/groups]',
    summary: 'Print the account you are actually logged in as.',
    minArgs: 0,
    maxArgs: 1,
    joined: false,
  },
  {
    name: 'systeminfo',
    usage: 'systeminfo [machine]',
    summary: 'Print what a machine is and how long it has been up.',
    minArgs: 0,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'users',
    usage: 'users <account>',
    summary: 'Print an account, its state and its groups.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'net',
    usage: 'net user <account>',
    summary: 'The same read as users, spelled the way the trade spells it.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'unlock',
    usage: 'unlock <account>',
    summary: 'Clear a lockout.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'resetpw',
    usage: 'resetpw <account>',
    summary: 'Issue a temporary password and clear the lockout with it.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'verify',
    usage: 'verify <account>',
    summary: 'Record that you checked who you were talking to.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'mfa',
    usage: 'mfa <account>',
    summary: 'Enrol a new authenticator when the old one is gone.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'revoke',
    usage: 'revoke <account>',
    summary: 'Sign an account out of every device it is on.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'licence',
    usage: 'licence <take|give> <account>',
    summary: 'Move a seat of the accounts suite between people.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'grant',
    usage: 'grant <account> <share>',
    summary: 'Give somebody access to a share or a shared mailbox.',
    minArgs: 2,
    maxArgs: 2,
    joined: false,
  },
  {
    name: 'forget',
    usage: 'forget <device>',
    summary: 'Clear the password a device has been offering for months.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'renewcert',
    usage: 'renewcert <service>',
    summary: 'Issue a new certificate to a service that ran out of one.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'rule',
    usage: 'rule on <mail rule>',
    summary: 'Switch on a mail rule somebody wrote and never enabled.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'services',
    usage: 'services <machine>',
    summary: 'List what is meant to be running on a machine.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'restart',
    usage: 'restart <service>',
    summary: 'Restart a stopped or wedged service.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'rotate',
    usage: 'rotate <machine> <0|90|180|270>',
    summary: 'Put a display back the way a human can read it.',
    minArgs: 2,
    maxArgs: 2,
    joined: false,
  },
  {
    name: 'queue',
    usage: 'queue <printer>',
    summary: 'Show how much work a printer is refusing to do.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'clearqueue',
    usage: 'clearqueue <printer>',
    summary: 'Empty a print queue and everyone in it.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'ver',
    usage: 'ver',
    summary: 'Print the version. It is not reassuring.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
  {
    name: 'cls',
    usage: 'cls',
    summary: 'Clear the screen. The tickets remain.',
    minArgs: 0,
    maxArgs: 0,
    joined: false,
  },
];

export type ParsedCommand =
  | { kind: 'empty' }
  | { kind: 'unknown'; name: string; suggestion: string | null }
  | {
    kind: 'usage';
    spec: CommandSpec;
    args: readonly string[];
    query: string;
    sub: string;
  }
  | {
    kind: 'command';
    spec: CommandSpec;
    args: readonly string[];
    query: string;
    /** The sub-command, lower-cased, or '' for the commands that have none. */
    sub: string;
  };

/** Longest typo we are willing to read the player's mind about. */
const MAX_SUGGESTION_DISTANCE = 3;

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= right.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0)
        + (left[row - 1] === right[column - 1] ? 0 : 1);
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (current[column - 1] ?? 0) + 1;
      current[column] = Math.min(substitution, deletion, insertion);
    }

    previous = current;
  }

  return previous[right.length] ?? Math.max(left.length, right.length);
}

export function suggestCommand(name: string): string | null {
  let best: { name: string; distance: number } | null = null;

  for (const spec of COMMANDS) {
    const distance = spec.name.startsWith(name)
      ? 1
      : editDistance(name, spec.name);

    if (best === null || distance < best.distance) {
      best = { name: spec.name, distance };
    }
  }

  return best !== null && best.distance <= MAX_SUGGESTION_DISTANCE
    ? best.name
    : null;
}

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((spec) => spec.name === name);
}

export function parseCommand(input: string): ParsedCommand {
  const tokens = input.trim().split(/\s+/u).filter((token) => token.length > 0);
  const head = tokens[0];

  if (head === undefined) {
    return { kind: 'empty' };
  }

  const name = head.toLowerCase();
  const spec = findCommand(name);
  const args = tokens.slice(1);

  if (spec === undefined) {
    return { kind: 'unknown', name, suggestion: suggestCommand(name) };
  }

  // A sub-command is not part of the value it is aimed at: `net user gpoole`
  // looks up gpoole, and looking up an account called "user gpoole" is the bug
  // this line exists to not have.
  const subcommand = spec.subcommand === true;
  const sub = subcommand ? (args[0] ?? '').toLowerCase() : '';
  const value = subcommand ? args.slice(1) : args;
  const query = spec.joined ? value.join(' ') : (value[0] ?? '');

  return args.length < spec.minArgs || args.length > spec.maxArgs
    ? { kind: 'usage', spec, args, query, sub }
    : { kind: 'command', spec, args, query, sub };
}

/**
 * What a shaking hand types.
 *
 * Two adjacent letters swapped, at a position that is a function of the line
 * and the minute - so the same line at the same minute always fumbles the same
 * way, and a line typed twice in a row does not fumble identically. It is a
 * GAG: the command that actually runs is the one that was typed, and the
 * terminal says so on the next line. Nothing here reaches the world.
 */
export function fumbleTypo(line: string, tick: number): string {
  const letters = [...line];
  const swappable: number[] = [];

  for (let index = 0; index + 1 < letters.length; index += 1) {
    if (/[a-z]/iu.test(letters[index] ?? '') && /[a-z]/iu.test(letters[index + 1] ?? '')) {
      swappable.push(index);
    }
  }

  const at = swappable[(Math.abs(tick) + line.length) % swappable.length];

  if (at === undefined) {
    return line;
  }

  const left = letters[at];
  const right = letters[at + 1];

  if (left === undefined || right === undefined) {
    return line;
  }

  letters[at] = right;
  letters[at + 1] = left;
  return letters.join('');
}
