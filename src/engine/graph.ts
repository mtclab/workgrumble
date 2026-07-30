import {
  createEngineEventBus,
  type EngineEventBus,
} from './events';
import { graphSnapshotHash } from './hash';
import {
  type EdgeKind,
  type FieldValue,
  isEdgeKind,
  type NodeKind,
  validateNode,
} from './schema';

export type { EdgeKind, FieldValue, NodeKind } from './schema';

export type NodeId = string;

export interface Node {
  id: NodeId;
  kind: NodeKind;
  fields: Record<string, FieldValue>;
}

export interface Edge {
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
}

export type GraphMutation =
  | { type: 'node:added'; node: Node }
  | { type: 'node:removed'; node: Node; edges: Edge[] }
  | {
    type: 'field:set';
    id: NodeId;
    field: string;
    previous: FieldValue | undefined;
    value: FieldValue;
  }
  | { type: 'edge:added'; edge: Edge }
  | { type: 'edge:removed'; edge: Edge };

export interface NeighborOptions {
  edgeKind?: EdgeKind;
  direction: 'out' | 'in';
}

function cloneNode(node: Readonly<Node>): Node {
  return {
    id: node.id,
    kind: node.kind,
    fields: { ...node.fields },
  };
}

function cloneEdge(edge: Readonly<Edge>): Edge {
  return { ...edge };
}

function edgeKey(edge: Readonly<Edge>): string {
  return JSON.stringify([edge.from, edge.to, edge.kind]);
}

function validateEdge(edge: Edge): Edge {
  if (edge.from.length === 0 || edge.to.length === 0) {
    throw new TypeError('Edge endpoints must be non-empty node ids.');
  }

  if (!isEdgeKind(edge.kind)) {
    throw new TypeError('Edge kind is not supported.');
  }

  return cloneEdge(edge);
}

export class EntityGraph {
  private readonly nodeStore = new Map<NodeId, Node>();
  private readonly edgeStore = new Map<string, Edge>();

  public constructor(
    private readonly bus: EngineEventBus = createEngineEventBus(),
  ) {}

  public addNode(node: Node): void {
    const validated = validateNode(node);

    if (this.nodeStore.has(validated.id)) {
      throw new Error(`Node "${validated.id}" already exists.`);
    }

    this.nodeStore.set(validated.id, validated);
    this.bus.emit('graph:mutated', {
      type: 'node:added',
      node: cloneNode(validated),
    });
  }

  public removeNode(id: NodeId): void {
    const node = this.nodeStore.get(id);

    if (node === undefined) {
      throw new Error(`Node "${id}" does not exist.`);
    }

    const removedEdges: Edge[] = [];

    for (const [key, edge] of this.edgeStore) {
      if (edge.from === id || edge.to === id) {
        removedEdges.push(cloneEdge(edge));
        this.edgeStore.delete(key);
      }
    }

    this.nodeStore.delete(id);
    this.bus.emit('graph:mutated', {
      type: 'node:removed',
      node: cloneNode(node),
      edges: removedEdges,
    });
  }

  public setField(id: NodeId, field: string, value: FieldValue): void {
    if (field.length === 0) {
      throw new TypeError('Field name must be a non-empty string.');
    }

    const node = this.nodeStore.get(id);

    if (node === undefined) {
      throw new Error(`Node "${id}" does not exist.`);
    }

    const previous = node.fields[field];
    const validated = validateNode({
      ...node,
      fields: {
        ...node.fields,
        [field]: value,
      },
    });

    this.nodeStore.set(id, validated);
    this.bus.emit('graph:mutated', {
      type: 'field:set',
      id,
      field,
      previous,
      value,
    });
  }

  public addEdge(edge: Edge): void {
    const validated = validateEdge(edge);

    if (
      !this.nodeStore.has(validated.from)
      || !this.nodeStore.has(validated.to)
    ) {
      throw new Error('Both edge endpoints must exist.');
    }

    const key = edgeKey(validated);

    if (this.edgeStore.has(key)) {
      throw new Error('Duplicate edges are not allowed.');
    }

    this.edgeStore.set(key, validated);
    this.bus.emit('graph:mutated', {
      type: 'edge:added',
      edge: cloneEdge(validated),
    });
  }

  public removeEdge(edge: Edge): void {
    const validated = validateEdge(edge);
    const key = edgeKey(validated);
    const existing = this.edgeStore.get(key);

    if (existing === undefined) {
      throw new Error('Edge does not exist.');
    }

    this.edgeStore.delete(key);
    this.bus.emit('graph:mutated', {
      type: 'edge:removed',
      edge: cloneEdge(existing),
    });
  }

  public getNode(id: NodeId): Node | undefined {
    const node = this.nodeStore.get(id);
    return node === undefined ? undefined : cloneNode(node);
  }

  public getField(id: NodeId, field: string): FieldValue | undefined {
    return this.nodeStore.get(id)?.fields[field];
  }

  public nodesOfKind(kind: NodeKind): Node[] {
    return this.allNodes().filter((node) => node.kind === kind);
  }

  /** Every node, id-sorted, as clones. Sorting keeps readers deterministic. */
  public allNodes(): Node[] {
    return [...this.nodeStore.values()]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map(cloneNode);
  }

  public neighbors(id: NodeId, options: NeighborOptions): Node[] {
    if (!this.nodeStore.has(id)) {
      return [];
    }

    const neighborIds = new Set<NodeId>();

    for (const edge of this.edgeStore.values()) {
      if (options.edgeKind !== undefined && edge.kind !== options.edgeKind) {
        continue;
      }

      if (options.direction === 'out' && edge.from === id) {
        neighborIds.add(edge.to);
      }

      if (options.direction === 'in' && edge.to === id) {
        neighborIds.add(edge.from);
      }
    }

    return [...neighborIds]
      .sort()
      .map((neighborId) => this.nodeStore.get(neighborId))
      .filter((node): node is Node => node !== undefined)
      .map(cloneNode);
  }

  public snapshotHash(): string {
    return graphSnapshotHash(
      this.nodeStore.values(),
      this.edgeStore.values(),
    );
  }
}
