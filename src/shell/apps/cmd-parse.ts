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
    usage: 'verify <callback|code|inperson|contact> <account>',
    summary: 'Record HOW you proved who you were talking to.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
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
    name: 'sc',
    usage: 'sc query <service>',
    summary: 'Ask the service manager what it holds on one service.',
    minArgs: 2,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'audit',
    usage: 'audit <customer>',
    summary: 'Run discovery on a customer estate: machines, services, findings.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'tasklist',
    usage: 'tasklist',
    summary: 'List what is actually running on this desk, windows and all.',
    minArgs: 0,
    maxArgs: 2,
    joined: false,
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
    name: 'changereq',
    usage: 'changereq <file <service> | list>',
    summary: 'File a change request to authorise risky work, or list them.',
    minArgs: 1,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'fw',
    usage: 'fw <status | rules <box> | audit <box> | pack <box> '
      + '| migrate <rule> | cutover <box> | rollback <box>>',
    summary: 'Work an edge replacement: the plan, the rule set, and the cable.',
    minArgs: 1,
    maxArgs: 5,
    joined: true,
    subcommand: true,
  },
  {
    name: 'timesheet',
    usage: 'timesheet [claim <line> <minutes> | vague <line> | detail <line> '
      + '| submit]',
    summary: 'The week as the records have it, and what you say it was.',
    minArgs: 0,
    maxArgs: 3,
    joined: false,
    subcommand: true,
  },
  {
    name: 'notify',
    usage: 'notify <service>',
    summary: 'Tell a co-managed customer\'s own IT before you act, then act.',
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
    name: 'dir',
    usage: 'dir [path]',
    summary: 'List what is in a directory, with dates and sizes.',
    minArgs: 0,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'cd',
    usage: 'cd [path]',
    summary: 'Move around the drive, or say where you are standing.',
    minArgs: 0,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'type',
    usage: 'type <file>',
    summary: 'Print what is in a file.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'move',
    usage: 'move <file> <directory>',
    summary: 'Move a file to where somebody thought they had saved it.',
    minArgs: 2,
    maxArgs: 2,
    joined: false,
  },
  {
    name: 'purge',
    usage: 'purge <directory>',
    summary: 'Empty a directory a program filled, if what is in it is a copy.',
    minArgs: 1,
    maxArgs: 4,
    joined: true,
  },
  {
    name: 'tree',
    usage: 'tree [path] [/f]',
    summary: 'Draw the directories under a path, and the files with /f.',
    minArgs: 0,
    maxArgs: 4,
    joined: false,
  },
  {
    name: 'ssh',
    usage: 'ssh <user@host>',
    summary: 'Reach a Linux server - the engineers\' tier, not the desk\'s.',
    minArgs: 1,
    maxArgs: 1,
    joined: false,
  },
  {
    name: 'promotion',
    usage: 'promotion [accept]',
    summary: 'Read the Systems Engineer offer, and take it when you have earned it.',
    minArgs: 0,
    maxArgs: 1,
    joined: false,
    subcommand: true,
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
  | {
    kind: 'unknown';
    name: string;
    suggestion: string | null;
    /**
     * The arguments the unknown command was typed with. An unknown command
     * still has arguments, and the unix dialect reads them: a not-installed
     * tool that gets `apt install`ed later RUNS off the same seam a stock box
     * gags at (`cmd-unix.ts`), and running `traceroute FC-RMM-01` needs the
     * host the same way the gag never did. Empty for a bare unknown word.
     */
    args: readonly string[];
  }
  | {
    kind: 'usage';
    spec: CommandSpec;
    args: readonly string[];
    query: string;
    sub: string;
    /** Whether a `sudo` prefix was stripped (unix dialect only). */
    sudo?: boolean;
  }
  | {
    kind: 'command';
    spec: CommandSpec;
    args: readonly string[];
    query: string;
    /** The sub-command, lower-cased, or '' for the commands that have none. */
    sub: string;
    /**
     * Whether the line was prefixed with `sudo` (unix dialect only). The
     * privileged apt subcommands (install/update/upgrade) require it, and run
     * WITHOUT it fail with Ubuntu's own dpkg-lock permission error - which is
     * how the dialect teaches sudo. Absent on the Windows dialect, which has no
     * such prefix.
     */
    sudo?: boolean;
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

/**
 * The nearest command in a registry, or null when nothing is close. Takes the
 * registry rather than closing over `COMMANDS` because there are two of them
 * now - the Windows dialect this file ships and the unix dialect an ssh session
 * switches to (`cmd-unix.ts`) - and the grammar is the same for both.
 */
export function suggestFrom(
  name: string,
  commands: readonly CommandSpec[],
): string | null {
  let best: { name: string; distance: number } | null = null;

  for (const spec of commands) {
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

export function suggestCommand(name: string): string | null {
  return suggestFrom(name, COMMANDS);
}

export function findIn(
  name: string,
  commands: readonly CommandSpec[],
): CommandSpec | undefined {
  return commands.find((spec) => spec.name === name);
}

export function findCommand(name: string): CommandSpec | undefined {
  return findIn(name, COMMANDS);
}

/**
 * The line, split into arguments the way a shell splits one: on spaces, except
 * inside double quotes.
 *
 * Quotes are how the real thing is told that a path with spaces in it is ONE
 * path, and this estate has `Documents and Settings` and `My Documents` in
 * every profile on it - so a command that takes two paths cannot be parsed by
 * counting words. The quotes are kept on the token rather than stripped here,
 * because the path resolver already takes them off and a command that joins
 * its arguments back together has to get back exactly what was typed.
 */
export function splitArguments(input: string): readonly string[] {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  let started = false;

  for (const character of input.trim()) {
    if (character === '"') {
      quoted = !quoted;
      started = true;
      current += character;
      continue;
    }

    if (!quoted && /\s/u.test(character)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }

      continue;
    }

    current += character;
    started = true;
  }

  if (started) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * The grammar, over whichever registry it is handed. `parseCommand` is this
 * pointed at the Windows dialect; an ssh session points it at the unix one, so
 * the sub-command rule, the argument counting and the did-you-mean are one
 * implementation the two dialects share rather than two that can drift.
 */
export function parseWith(
  input: string,
  commands: readonly CommandSpec[],
): ParsedCommand {
  const tokens = splitArguments(input);
  const head = tokens[0];

  if (head === undefined) {
    return { kind: 'empty' };
  }

  const name = head.toLowerCase();
  const spec = findIn(name, commands);
  const args = tokens.slice(1);

  if (spec === undefined) {
    return {
      kind: 'unknown',
      name,
      suggestion: suggestFrom(name, commands),
      args,
    };
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

export function parseCommand(input: string): ParsedCommand {
  return parseWith(input, COMMANDS);
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
