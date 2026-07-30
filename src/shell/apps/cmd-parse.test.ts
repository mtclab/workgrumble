import { describe, expect, it } from 'vitest';

import {
  COMMANDS,
  findCommand,
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
    expect(parseCommand('sudo rm -rf /')).toEqual({
      kind: 'unknown',
      name: 'sudo',
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
