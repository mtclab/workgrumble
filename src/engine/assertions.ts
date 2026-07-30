import type { EntityGraph, Node, NodeId } from './graph';
import {
  type EdgeKind,
  type FieldValue,
  isEdgeKind,
  isFieldValue,
  isNodeKind,
  isRecord,
  type NodeKind,
} from './schema';

export interface FieldMatch {
  field: string;
  value: FieldValue;
}

export type Selector =
  | { id: NodeId }
  | { kind: NodeKind; where: FieldMatch[] };

export type Expr =
  | { op: 'and' | 'or'; exprs: Expr[] }
  | { op: 'not'; expr: Expr }
  | {
    op: 'eq';
    selector: Selector;
    field: string;
    value: FieldValue;
  }
  | { op: 'exists'; kind: NodeKind; where?: FieldMatch[] }
  | { op: 'edge'; from: Selector; to: Selector; kind: EdgeKind };

function isFieldMatch(value: unknown): value is FieldMatch {
  return isRecord(value)
    && typeof value.field === 'string'
    && value.field.length > 0
    && isFieldValue(value.value);
}

function isFieldMatchArray(value: unknown): value is FieldMatch[] {
  return Array.isArray(value) && value.every(isFieldMatch);
}

function isSelector(value: unknown): value is Selector {
  if (!isRecord(value)) {
    return false;
  }

  const hasId = Object.hasOwn(value, 'id');
  const hasKind = Object.hasOwn(value, 'kind');
  const hasWhere = Object.hasOwn(value, 'where');

  if (hasId) {
    return !hasKind
      && !hasWhere
      && typeof value.id === 'string'
      && value.id.length > 0;
  }

  return hasKind
    && hasWhere
    && isNodeKind(value.kind)
    && isFieldMatchArray(value.where);
}

function isExprInternal(value: unknown, active: Set<object>): value is Expr {
  if (!isRecord(value) || typeof value.op !== 'string' || active.has(value)) {
    return false;
  }

  active.add(value);
  let valid: boolean;

  switch (value.op) {
    case 'and':
    case 'or':
      valid = Array.isArray(value.exprs)
        && value.exprs.every((expr) => isExprInternal(expr, active));
      break;
    case 'not':
      valid = isExprInternal(value.expr, active);
      break;
    case 'eq':
      valid = isSelector(value.selector)
        && typeof value.field === 'string'
        && value.field.length > 0
        && isFieldValue(value.value);
      break;
    case 'exists':
      valid = isNodeKind(value.kind)
        && (
          !Object.hasOwn(value, 'where')
          || isFieldMatchArray(value.where)
        );
      break;
    case 'edge':
      valid = isSelector(value.from)
        && isSelector(value.to)
        && isEdgeKind(value.kind);
      break;
    default:
      valid = false;
  }

  active.delete(value);
  return valid;
}

export function isExpr(value: unknown): value is Expr {
  return isExprInternal(value, new Set<object>());
}

function matchesFields(node: Readonly<Node>, matches: readonly FieldMatch[]): boolean {
  return matches.every(
    (match) => Object.is(node.fields[match.field], match.value),
  );
}

function resolveSelector(
  graph: EntityGraph,
  selector: unknown,
): Node | undefined {
  if (!isSelector(selector)) {
    return undefined;
  }

  if ('id' in selector) {
    return graph.getNode(selector.id);
  }

  const matches = graph.nodesOfKind(selector.kind)
    .filter((node) => matchesFields(node, selector.where));

  return matches.length === 1 ? matches[0] : undefined;
}

function evaluateInternal(
  graph: EntityGraph,
  value: unknown,
  active: Set<object>,
): boolean {
  if (!isRecord(value) || typeof value.op !== 'string' || active.has(value)) {
    return false;
  }

  active.add(value);
  let result: boolean;

  switch (value.op) {
    case 'and':
      result = Array.isArray(value.exprs)
        && value.exprs.every((expr) => evaluateInternal(graph, expr, active));
      break;
    case 'or':
      result = Array.isArray(value.exprs)
        && value.exprs.some((expr) => evaluateInternal(graph, expr, active));
      break;
    case 'not':
      result = !evaluateInternal(graph, value.expr, active);
      break;
    case 'eq': {
      const node = resolveSelector(graph, value.selector);
      result = node !== undefined
        && typeof value.field === 'string'
        && isFieldValue(value.value)
        && Object.is(node.fields[value.field], value.value);
      break;
    }
    case 'exists': {
      if (!isNodeKind(value.kind)) {
        result = false;
        break;
      }

      const where = Object.hasOwn(value, 'where') ? value.where : [];
      result = isFieldMatchArray(where)
        && graph.nodesOfKind(value.kind)
          .some((node) => matchesFields(node, where));
      break;
    }
    case 'edge': {
      const from = resolveSelector(graph, value.from);
      const to = resolveSelector(graph, value.to);
      result = from !== undefined
        && to !== undefined
        && isEdgeKind(value.kind)
        && graph.neighbors(
          from.id,
          { direction: 'out', edgeKind: value.kind },
        ).some((node) => node.id === to.id);
      break;
    }
    default:
      result = false;
  }

  active.delete(value);
  return result;
}

export function evaluate(graph: EntityGraph, expr: unknown): boolean {
  if (!isExpr(expr)) {
    return false;
  }

  return evaluateInternal(graph, expr, new Set<object>());
}
