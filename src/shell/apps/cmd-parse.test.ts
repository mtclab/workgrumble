import { describe, expect, it } from 'vitest';

import {
  COMMANDS,
  findCommand,
  fumbleTypo,
  parseCommand,
  suggestCommand,
} from './cmd-parse';

describe('command parser', () => {
  it('treats blank input as nothing at all', () => {
    expect(parseCommand('')).toEqual({ kind: 'empty' });
    expect(parseCommand('    ')).toEqual({ kind: 'empty' });
    expect(parseCommand('\t \n')).toEqual({ kind: 'empty' });
  });

  it('parses a command, its case and its spacing', () => {
    const parsed = parseCommand('  UnLock   gpoole  ');

    expect(parsed.kind).toBe('command');

    if (parsed.kind !== 'command') {
      return;
    }

    expect(parsed.spec.name).toBe('unlock');
    expect(parsed.args).toEqual(['gpoole']);
    expect(parsed.query).toBe('gpoole');
  });

  it('joins the arguments of name-shaped commands', () => {
    const parsed = parseCommand('clearqueue Hercules 400');

    expect(parsed.kind).toBe('command');

    if (parsed.kind !== 'command') {
      return;
    }

    expect(parsed.args).toEqual(['Hercules', '400']);
    expect(parsed.query).toBe('Hercules 400');
  });

  it('keeps positional commands positional', () => {
    const parsed = parseCommand('rotate SALES-02 0');

    expect(parsed.kind).toBe('command');

    if (parsed.kind !== 'command') {
      return;
    }

    expect(parsed.args).toEqual(['SALES-02', '0']);
    expect(parsed.query).toBe('SALES-02');
  });

  /**
   * `net user gpoole` is three tokens and two of them are the command. A
   * parser that hands "user gpoole" to the account lookup looks up nobody, so
   * the sub-command comes off the front here rather than in the runner.
   */
  it('takes the sub-command off the front of a net line', () => {
    const parsed = parseCommand('NET User  gpoole');

    expect(parsed.kind).toBe('command');

    if (parsed.kind !== 'command') {
      return;
    }

    expect(parsed.spec.name).toBe('net');
    expect(parsed.sub).toBe('user');
    expect(parsed.query).toBe('gpoole');
    // And a name with a space in it still arrives whole.
    expect(parseCommand('net user Gary Poole')).toMatchObject({
      sub: 'user',
      query: 'Gary Poole',
    });
    // `net` on its own is a usage problem, not a lookup of nothing.
    expect(parseCommand('net').kind).toBe('usage');
    expect(parseCommand('net user').kind).toBe('usage');
  });

  it('leaves every other command without a sub-command', () => {
    expect(parseCommand('users gpoole')).toMatchObject({
      sub: '',
      query: 'gpoole',
    });
    expect(parseCommand('ipconfig /all')).toMatchObject({
      sub: '',
      query: '/all',
    });
  });

  it('parses the reading commands with and without their switches', () => {
    expect(parseCommand('ipconfig').kind).toBe('command');
    expect(parseCommand('whoami').kind).toBe('command');
    expect(parseCommand('systeminfo').kind).toBe('command');
    expect(parseCommand('ipconfig /all /flushdns').kind).toBe('usage');
    expect(parseCommand('tracert').kind).toBe('usage');
    expect(parseCommand('nslookup').kind).toBe('usage');
    expect(parseCommand('tracert PRINT-01')).toMatchObject({
      kind: 'command',
      query: 'PRINT-01',
    });
  });

  it('flags too few and too many arguments as a usage problem', () => {
    expect(parseCommand('rotate SALES-02').kind).toBe('usage');
    expect(parseCommand('ver now').kind).toBe('usage');
    expect(parseCommand('unlock').kind).toBe('usage');
    expect(parseCommand('unlock a b c d e').kind).toBe('usage');
  });

  it('suggests the command the player probably meant', () => {
    expect(parseCommand('unlok gpoole')).toEqual({
      kind: 'unknown',
      name: 'unlok',
      suggestion: 'unlock',
    });
    expect(parseCommand('restrat spooler')).toEqual({
      kind: 'unknown',
      name: 'restrat',
      suggestion: 'restart',
    });
    expect(suggestCommand('serv')).toBe('services');
    expect(suggestCommand('q')).toBe('queue');
  });

  it('gives up on input that is not a typo of anything', () => {
    // Not "sudo" any more: the M4 verb set put "rule" in the list, which is
    // three edits away, and three edits is what this terminal is willing to
    // guess at. The probe has to be genuinely far from everything or it is
    // measuring the command set rather than the giving-up.
    expect(parseCommand('xyzzy the mainframe')).toEqual({
      kind: 'unknown',
      name: 'xyzzy',
      suggestion: null,
    });
  });

  it('ships a curated, unique command set that documents itself', () => {
    const names = COMMANDS.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('help');
    expect(names).toContain('ver');

    for (const spec of COMMANDS) {
      expect(findCommand(spec.name)).toBe(spec);
      expect(spec.usage.startsWith(spec.name)).toBe(true);
      expect(spec.summary.endsWith('.')).toBe(true);
      expect(spec.minArgs).toBeLessThanOrEqual(spec.maxArgs);
    }
  });
});

/**
 * The fumble gag is a look, not a mechanic: whatever the terminal prints, the
 * line that runs is the line that was typed. These pin the half that IS
 * visible - it changes something, it changes one thing, and it changes the
 * same thing twice for the same minute.
 */
describe('fumbling', () => {
  it('swaps two adjacent letters, deterministically', () => {
    const typed = 'restart spooler';
    const typo = fumbleTypo(typed, 7);

    expect(typo).not.toBe(typed);
    expect(typo).toHaveLength(typed.length);
    expect([...typo].sort()).toEqual([...typed].sort());
    expect(fumbleTypo(typed, 7)).toBe(typo);
    // A different minute fumbles differently, so the same command twice
    // running does not read as a broken renderer.
    expect(fumbleTypo(typed, 8)).not.toBe(typo);
  });

  it('leaves a line with nothing to swap exactly as it was', () => {
    expect(fumbleTypo('', 3)).toBe('');
    expect(fumbleTypo('a', 3)).toBe('a');
    expect(fumbleTypo('4 2', 3)).toBe('4 2');
  });
});
