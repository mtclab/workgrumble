import { describe, expect, it } from 'vitest';

import { SimClock } from './clock';
import { createEngineEventBus, type TicketEventPayload } from './events';
import { EntityGraph } from './graph';
import {
  isTicketDef,
  TicketEngine,
  type TicketDef,
  validateTicketDef,
} from './tickets';

interface TicketHarness {
  bus: ReturnType<typeof createEngineEventBus>;
  clock: SimClock;
  graph: EntityGraph;
  tickets: TicketEngine;
}

function createHarness(): TicketHarness {
  const bus = createEngineEventBus();
  const clock = new SimClock();
  const graph = new EntityGraph(bus);
  graph.addNode({
    id: 'person:reporter',
    kind: 'person',
    fields: { name: 'Reporter' },
  });
  graph.addNode({
    id: 'service:spooler',
    kind: 'service',
    fields: { name: 'Print Spooler', status: 'stopped' },
  });

  return {
    bus,
    clock,
    graph,
    tickets: new TicketEngine(graph, clock, bus),
  };
}

function serviceTicket(
  id: string,
  slaTicks = 4,
  setupStatus: 'running' | 'stopped' | 'wedged' = 'wedged',
): TicketDef {
  return {
    id,
    archetype: 'hidden_cause',
    flavor: {
      title: 'Printer has entered a reflective phase',
      body: 'Nothing comes out, including an error.',
    },
    reporter: 'person:reporter',
    setup: [
      {
        op: 'setField',
        id: 'service:spooler',
        field: 'status',
        value: setupStatus,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: 'service:spooler' },
      field: 'status',
      value: 'running',
    },
    sla_ticks: slaTicks,
    reward: {
      reputation: 2,
      money: 10,
    },
    kb_ref: 'kb/print-spooler',
  };
}

describe('TicketDef validation', () => {
  it('validates data-loaded content and rejects malformed definitions loudly', () => {
    const valid: unknown = serviceTicket('ticket:valid');
    const invalid: unknown = {
      ...serviceTicket('ticket:invalid'),
      archetype: 'surprise_me',
    };

    expect(isTicketDef(valid)).toBe(true);
    expect(isTicketDef(invalid)).toBe(false);
    expect(validateTicketDef(valid)).toEqual(valid);
    expect(() => validateTicketDef(invalid)).toThrow('archetype');
  });
});

describe('TicketEngine lifecycle', () => {
  it('stays open on a wrong mutation and resolves exactly once on the right one', () => {
    const { bus, graph, tickets } = createHarness();
    const resolved: TicketEventPayload[] = [];
    bus.on('ticket:resolved', (event) => {
      resolved.push(event);
    });

    tickets.spawn(serviceTicket('ticket:lifecycle'));
    expect(graph.getField('service:spooler', 'status')).toBe('wedged');
    expect(tickets.getState('ticket:lifecycle')).toBe('open');

    graph.setField('service:spooler', 'name', 'Still the Print Spooler');
    expect(tickets.getState('ticket:lifecycle')).toBe('open');
    expect(resolved).toEqual([]);

    graph.setField('service:spooler', 'status', 'running');
    graph.setField('service:spooler', 'status', 'running');

    expect(tickets.getState('ticket:lifecycle')).toBe('resolved');
    expect(resolved).toEqual([{ id: 'ticket:lifecycle' }]);
  });

  it('latches a breach at the deadline and remains solvable afterward', () => {
    const {
      bus,
      clock,
      graph,
      tickets,
    } = createHarness();
    const breached: TicketEventPayload[] = [];
    const resolved: TicketEventPayload[] = [];
    bus.on('ticket:breached', (event) => {
      breached.push(event);
    });
    bus.on('ticket:resolved', (event) => {
      resolved.push(event);
    });

    tickets.spawn(serviceTicket('ticket:breach', 2));
    clock.advance(3);

    expect(tickets.getState('ticket:breach')).toBe('breached');
    expect(tickets.wasBreached('ticket:breach')).toBe(true);
    expect(graph.getField('ticket:breach', 'breached')).toBe(true);
    expect(breached).toEqual([{ id: 'ticket:breach' }]);

    graph.setField('service:spooler', 'status', 'running');

    expect(tickets.getState('ticket:breach')).toBe('resolved');
    expect(tickets.wasBreached('ticket:breach')).toBe(true);
    expect(breached).toEqual([{ id: 'ticket:breach' }]);
    expect(resolved).toEqual([{ id: 'ticket:breach' }]);
  });

  it('extends the SLA deadline by exactly the ticks spent waiting', () => {
    const {
      bus,
      clock,
      graph,
      tickets,
    } = createHarness();
    const breached: TicketEventPayload[] = [];
    bus.on('ticket:breached', (event) => {
      breached.push(event);
    });

    tickets.spawn(serviceTicket('ticket:waiting', 4));
    expect(graph.getField('ticket:waiting', 'sla_deadline')).toBe(4);

    tickets.setWaiting('ticket:waiting', true);
    clock.advance(3);

    expect(tickets.getState('ticket:waiting')).toBe('waiting_on_user');
    expect(graph.getField('ticket:waiting', 'sla_deadline')).toBe(7);

    tickets.setWaiting('ticket:waiting', false);
    clock.advance(3);
    expect(tickets.getState('ticket:waiting')).toBe('open');
    expect(breached).toEqual([]);

    clock.advance(1);
    expect(tickets.getState('ticket:waiting')).toBe('breached');
    expect(breached).toEqual([{ id: 'ticket:waiting' }]);
  });

  it('resolves a pre-solved spawn immediately after the spawned event', () => {
    const { bus, tickets } = createHarness();
    const events: string[] = [];
    bus.on('ticket:spawned', ({ id }) => {
      events.push(`spawned:${id}`);
    });
    bus.on('ticket:resolved', ({ id }) => {
      events.push(`resolved:${id}`);
    });

    tickets.spawn(serviceTicket('ticket:pre-solved', 4, 'running'));

    expect(tickets.getState('ticket:pre-solved')).toBe('resolved');
    expect(events).toEqual([
      'spawned:ticket:pre-solved',
      'resolved:ticket:pre-solved',
    ]);
  });

  it('applies every serializable setup mutation through the graph API', () => {
    const { graph, tickets } = createHarness();
    graph.addNode({
      id: 'group:old',
      kind: 'group',
      fields: { name: 'Old printers' },
    });
    graph.addEdge({
      from: 'person:reporter',
      to: 'group:old',
      kind: 'member_of',
    });
    const definition: TicketDef = {
      ...serviceTicket('ticket:setup'),
      setup: [
        {
          op: 'addNode',
          node: {
            id: 'group:new',
            kind: 'group',
            fields: { name: 'New printers' },
          },
        },
        {
          op: 'setField',
          id: 'service:spooler',
          field: 'status',
          value: 'wedged',
        },
        {
          op: 'addEdge',
          edge: {
            from: 'person:reporter',
            to: 'group:new',
            kind: 'member_of',
          },
        },
        {
          op: 'removeEdge',
          edge: {
            from: 'person:reporter',
            to: 'group:old',
            kind: 'member_of',
          },
        },
      ],
    };

    tickets.spawn(definition);

    expect(graph.getNode('group:new')).toBeDefined();
    expect(
      graph.neighbors(
        'person:reporter',
        { direction: 'out', edgeKind: 'member_of' },
      ).map(({ id }) => id),
    ).toEqual(['group:new']);
  });
});
