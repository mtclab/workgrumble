import { describe, expect, it } from 'vitest';

import { personKey } from './chat';
import { accountKey } from './directory';
import { machineKey } from './remote';
import { ticketKey } from './tickets';
import { formatDuration, textValue } from './ui';

describe('app formatting helpers', () => {
  it('renders sim ticks as shift durations, never as raw ticks', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(7)).toBe('7m');
    expect(formatDuration(60)).toBe('1h 00m');
    expect(formatDuration(479)).toBe('7h 59m');
    // A deadline that has passed reads as nothing left, not as negative time.
    expect(formatDuration(-12)).toBe('0m');
    expect(formatDuration(12.7)).toBe('12m');
  });

  it('falls back only for values that are not usable text', () => {
    expect(textValue('Pat Pending', 'nobody')).toBe('Pat Pending');
    expect(textValue('', 'nobody')).toBe('nobody');
    expect(textValue(undefined, 'nobody')).toBe('nobody');
    expect(textValue(47, 'nobody')).toBe('nobody');
  });

  it('derives stable element keys from node ids', () => {
    expect(ticketKey('ticket:locked-account')).toBe('locked-account');
    expect(ticketKey('locked-account')).toBe('locked-account');
    expect(accountKey('account:gary')).toBe('gary');
    expect(accountKey('gary')).toBe('gary');
    expect(personKey('person:ada')).toBe('ada');
    expect(personKey('ada')).toBe('ada');
    expect(machineKey('machine:print')).toBe('print');
    expect(machineKey('print')).toBe('print');
  });
});
