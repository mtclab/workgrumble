import {
  type EntityGraph,
  type NeighborOptions,
  type Node,
  type NodeId,
} from '../engine/graph';
import type {
  FieldValue,
  NodeKind,
} from '../engine/schema';

export interface ReadonlyGraphNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface ReadonlyGraph {
  getNode(id: NodeId): ReadonlyGraphNode | undefined;
  getField(id: NodeId, field: string): FieldValue | undefined;
  nodesOfKind(kind: NodeKind): readonly ReadonlyGraphNode[];
  neighbors(
    id: NodeId,
    options: Readonly<NeighborOptions>,
  ): readonly ReadonlyGraphNode[];
}

function freezeNode(node: Readonly<Node>): ReadonlyGraphNode {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    fields: Object.freeze({ ...node.fields }),
  });
}

function freezeNodes(nodes: readonly Node[]): readonly ReadonlyGraphNode[] {
  return Object.freeze(nodes.map(freezeNode));
}

export function createReadonlyGraph(
  graph: EntityGraph,
): ReadonlyGraph {
  return Object.freeze({
    getNode: (id: NodeId) => {
      const node = graph.getNode(id);
      return node === undefined ? undefined : freezeNode(node);
    },
    getField: (id: NodeId, field: string) => graph.getField(id, field),
    nodesOfKind: (kind: NodeKind) => freezeNodes(graph.nodesOfKind(kind)),
    neighbors: (
      id: NodeId,
      options: Readonly<NeighborOptions>,
    ) => freezeNodes(graph.neighbors(id, options)),
  });
}
