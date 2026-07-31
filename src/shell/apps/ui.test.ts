import { describe, expect, it } from 'vitest';

import { personKey } from './chat';
import { accountKey } from './directory';
import { machineKey } from './remote';
import { ticketKey } from './tickets';
import {
  formatDuration,
  type KeyedRow,
  KeyedRows,
  resolveSelection,
  textValue,
} from './ui';

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

/**
 * The reconciler behind every list in this shell, driven without a document.
 *
 * The thing being proven is element IDENTITY: a repaint that changes what a
 * row says must not change which row it is. Every one of these apps repaints on
 * every world change and the queue repaints on every minute of the shift, and
 * the old answer - empty the container, build it all again - threw away the
 * checkbox the player had just ticked, the keyboard focus and any selection
 * standing on the row, sixty times an hour.
 */
describe('a keyed list', () => {
  interface Item {
    readonly id: string;
    readonly text: string;
  }

  /** A container that records what it was handed, and how often. */
  class Host {
    public children: readonly object[] = [];
    public paints = 0;

    public replaceChildren(...nodes: object[]): void {
      this.children = nodes;
      this.paints += 1;
    }
  }

  interface Harness {
    readonly host: Host;
    readonly rows: KeyedRows<Item, object>;
    readonly built: string[];
    readonly told: string[];
  }

  function harness(): Harness {
    const host = new Host();
    const built: string[] = [];
    const told: string[] = [];
    const rows = new KeyedRows<Item, object>(
      host,
      (item) => item.id,
      (item): KeyedRow<Item, object> => {
        built.push(item.id);
        const node = { id: item.id, text: '' };

        return {
          element: node,
          update: (next) => {
            told.push(`${next.id}:${next.text}`);
            node.text = next.text;
          },
        };
      },
    );

    return { host, rows, built, told };
  }

  it('builds each row once and tells it the news after that', () => {
    const { host, rows, built, told } = harness();
    rows.sync([{ id: 'a', text: '4h left' }, { id: 'b', text: '2h left' }]);
    const first = host.children;

    rows.sync([{ id: 'a', text: '3h 59m left' }, { id: 'b', text: '1h 59m left' }]);

    expect(built).toEqual(['a', 'b']);
    expect(told).toEqual([
      'a:4h left',
      'b:2h left',
      'a:3h 59m left',
      'b:1h 59m left',
    ]);
    // The countdown moved and the rows did not: same objects, same order, and
    // the container was never handed a new set of children.
    expect(host.children).toEqual(first);
    expect(host.children[0]).toBe(first[0]);
    expect(host.paints).toBe(1);
  });

  it('keeps the rows it already has when the order changes', () => {
    const { host, rows, built } = harness();
    rows.sync([{ id: 'a', text: 'open' }, { id: 'b', text: 'open' }]);
    const [rowA, rowB] = host.children;

    // A ticket breaching sorts it down the queue: the row moves, it is not
    // built again.
    rows.sync([{ id: 'b', text: 'open' }, { id: 'a', text: 'breached' }]);

    expect(built).toEqual(['a', 'b']);
    expect(host.paints).toBe(2);
    expect(host.children[0]).toBe(rowB);
    expect(host.children[1]).toBe(rowA);
  });

  it('builds only what arrived and drops only what left', () => {
    const { host, rows, built } = harness();
    rows.sync([{ id: 'a', text: 'open' }, { id: 'b', text: 'open' }]);
    const [rowA, rowB] = host.children;

    rows.sync([{ id: 'a', text: 'open' }, { id: 'c', text: 'new' }]);

    expect(built).toEqual(['a', 'b', 'c']);
    expect(host.children[0]).toBe(rowA);
    expect(host.children).not.toContain(rowB);
    // And a row that came back is a new row, not the one that was dropped.
    rows.sync([{ id: 'b', text: 'open' }]);
    expect(built).toEqual(['a', 'b', 'c', 'b']);
    expect(host.children[0]).not.toBe(rowB);
  });

  it('shows the empty line when there is nothing, and takes it away again', () => {
    const { host, rows } = harness();
    const empty = { id: 'empty', text: 'Queue empty.' };

    rows.sync([], empty);
    expect(host.children).toEqual([empty]);

    rows.sync([{ id: 'a', text: 'open' }], empty);
    expect(host.children).not.toContain(empty);
    expect(host.paints).toBe(2);
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
