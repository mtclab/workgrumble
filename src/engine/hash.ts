import type { Edge, Node } from './graph';

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function hashByte(hash: bigint, byte: number): bigint {
  return ((hash ^ BigInt(byte)) * FNV64_PRIME) & FNV64_MASK;
}

export function fnv1a64(value: string): string {
  let hash = FNV64_OFFSET;

  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      hash = hashByte(hash, codePoint);
    } else if (codePoint <= 0x7ff) {
      hash = hashByte(hash, 0xc0 | (codePoint >>> 6));
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      hash = hashByte(hash, 0xe0 | (codePoint >>> 12));
      hash = hashByte(hash, 0x80 | ((codePoint >>> 6) & 0x3f));
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f));
    } else {
      hash = hashByte(hash, 0xf0 | (codePoint >>> 18));
      hash = hashByte(hash, 0x80 | ((codePoint >>> 12) & 0x3f));
      hash = hashByte(hash, 0x80 | ((codePoint >>> 6) & 0x3f));
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f));
    }
  }

  return hash.toString(16).padStart(16, '0');
}

export function stableSerializeGraph(
  nodes: Iterable<Readonly<Node>>,
  edges: Iterable<Readonly<Edge>>,
): string {
  const serializedNodes = [...nodes]
    .sort((left, right) => compareText(left.id, right.id))
    .map((node) => [
      node.id,
      node.kind,
      Object.entries(node.fields)
        .sort(([left], [right]) => compareText(left, right)),
    ]);

  const serializedEdges = [...edges]
    .sort((left, right) => (
      compareText(left.from, right.from)
      || compareText(left.to, right.to)
      || compareText(left.kind, right.kind)
    ))
    .map((edge) => [edge.from, edge.to, edge.kind]);

  return JSON.stringify({
    nodes: serializedNodes,
    edges: serializedEdges,
  });
}

export function graphSnapshotHash(
  nodes: Iterable<Readonly<Node>>,
  edges: Iterable<Readonly<Edge>>,
): string {
  return fnv1a64(stableSerializeGraph(nodes, edges));
}

