import { describe, expect, it } from 'vitest';

import { personKey } from './chat';
import { accountKey } from './directory';
import { machineKey } from './remote';
import { ticketKey } from './tickets';
import { formatDuration, resolveSelection, textValue } from './ui';

/**
 * What a list app is allowed to have selected. The rule sounds trivial and it
 * is the one that decides whether the detail pane and its action buttons are
 * aimed at something the player can see - a selection that outlives its row
 * is a fix dispatched at a hidden target.
 */
describe('list selection', () => {
  const nodes = [
    { id: 'machine:ada' },
    { id: 'machine:beige-box' },
    { id: 'machine:print' },
  ];

  it('keeps a selection that is still on the list', () => {
    expect(resolveSelection(nodes, 'machine:print'))
      .toEqual({ id: 'machine:print', changed: false });
  });

  it('moves off a selection the list no longer offers', () => {
    // The Remote Assist case: the machine was removed from the world, or
    // filtered out from under the player, mid-session.
    const left = nodes.filter((node) => node.id !== 'machine:print');

    expect(resolveSelection(left, 'machine:print'))
      .toEqual({ id: 'machine:ada', changed: true });
    // Deterministic: the graph hands lists back id-sorted, so the fallback is
    // the same row on every machine and every replay.
    expect(resolveSelection([...left].reverse(), 'machine:print').id)
      .toBe('machine:beige-box');
  });

  it('selects the first row when nothing was selected yet', () => {
    expect(resolveSelection(nodes, null))
      .toEqual({ id: 'machine:ada', changed: true });
  });

  it('selects nothing at all when the list is empty', () => {
    expect(resolveSelection([], 'machine:print'))
      .toEqual({ id: null, changed: true });
    // And an empty list that was already showing nothing is not a change, so
    // an app repainting on every tick does not keep resetting its controls.
    expect(resolveSelection([], null)).toEqual({ id: null, changed: false });
  });
});

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
