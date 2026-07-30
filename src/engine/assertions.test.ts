import { describe, expect, it } from 'vitest';

import { evaluate, type Expr } from './assertions';
import { EntityGraph } from './graph';

function assertionGraph(): EntityGraph {
  const graph = new EntityGraph();
  graph.addNode({
    id: 'person:ada',
    kind: 'person',
    fields: { name: 'Ada' },
  });
  graph.addNode({
    id: 'account:ada',
    kind: 'account',
    fields: { username: 'ada', locked: true, department: 'ops' },
  });
  graph.addNode({
    id: 'account:bob',
    kind: 'account',
    fields: { username: 'bob', locked: true, department: 'ops' },
  });
  graph.addEdge({
    from: 'person:ada',
    to: 'account:ada',
    kind: 'owns',
  });
  return graph;
}

describe('evaluate', () => {
  it('evaluates logical, existence, equality, and edge expressions', () => {
    const graph = assertionGraph();
    const expression: Expr = {
      op: 'and',
      exprs: [
        {
          op: 'exists',
          kind: 'person',
          where: [{ field: 'name', value: 'Ada' }],
        },
        {
          op: 'edge',
          from: { id: 'person:ada' },
          to: {
            kind: 'account',
            where: [{ field: 'username', value: 'ada' }],
          },
          kind: 'owns',
        },
        {
          op: 'not',
          expr: {
            op: 'eq',
            selector: { id: 'account:ada' },
            field: 'locked',
            value: false,
          },
        },
      ],
    };

    expect(evaluate(graph, expression)).toBe(true);
  });

  it('returns false without throwing for a selector matching two nodes', () => {
    const graph = assertionGraph();
    const ambiguous: Expr = {
      op: 'eq',
      selector: {
        kind: 'account',
        where: [{ field: 'department', value: 'ops' }],
      },
      field: 'locked',
      value: true,
    };

    expect(() => evaluate(graph, ambiguous)).not.toThrow();
    expect(evaluate(graph, ambiguous)).toBe(false);
  });

  it('is total for malformed and cyclic expression input', () => {
    const graph = assertionGraph();
    const malformed: unknown = {
      op: 'eq',
      selector: { kind: 'account' },
      field: 'locked',
      value: true,
    };
    const cyclic: Record<string, unknown> = { op: 'not' };
    cyclic.expr = cyclic;

    expect(() => evaluate(graph, malformed)).not.toThrow();
    expect(evaluate(graph, malformed)).toBe(false);
    expect(evaluate(graph, cyclic)).toBe(false);
  });
});

