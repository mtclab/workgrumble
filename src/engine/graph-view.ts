import {
  type EntityGraph,
  type NeighborOptions,
  type Node,
  type NodeId,
} from './graph';
import type {
  FieldValue,
  NodeKind,
} from './schema';

export interface ReadOnlyGraphNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

/**
 * The query half of `EntityGraph`, and nothing else. One implementation serves
 * both readers that must not write: the shell (apps read the world, and reach
 * it only through dispatched actions) and action validation (a validator that
 * mutates would make a refusal indistinguishable from a half-applied action).
 */
export interface ReadOnlyGraphView {
  getNode(id: NodeId): ReadOnlyGraphNode | undefined;
  getField(id: NodeId, field: string): FieldValue | undefined;
  nodesOfKind(kind: NodeKind): readonly ReadOnlyGraphNode[];
  allNodes(): readonly ReadOnlyGraphNode[];
  neighbors(
    id: NodeId,
    options: Readonly<NeighborOptions>,
  ): readonly ReadOnlyGraphNode[];
}

function freezeNode(node: Readonly<Node>): ReadOnlyGraphNode {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    fields: Object.freeze({ ...node.fields }),
  });
}

function freezeNodes(nodes: readonly Node[]): readonly ReadOnlyGraphNode[] {
  return Object.freeze(nodes.map(freezeNode));
}

export function createReadOnlyGraphView(
  graph: EntityGraph,
): ReadOnlyGraphView {
  return Object.freeze({
    getNode: (id: NodeId) => {
      const node = graph.getNode(id);
      return node === undefined ? undefined : freezeNode(node);
    },
    getField: (id: NodeId, field: string) => graph.getField(id, field),
    nodesOfKind: (kind: NodeKind) => freezeNodes(graph.nodesOfKind(kind)),
    allNodes: () => freezeNodes(graph.allNodes()),
    neighbors: (
      id: NodeId,
      options: Readonly<NeighborOptions>,
    ) => freezeNodes(graph.neighbors(id, options)),
  });
}
