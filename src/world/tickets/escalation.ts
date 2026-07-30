import type { Expr, NodeId, Selector } from '../../engine-api';
import { FIELDS } from '../fields';

/** Whether a selector NAMES this node rather than describing something. */
function names(selector: Readonly<Selector>, ticketId: NodeId): boolean {
  // A `kind` + `where` selector is resolved against the graph and can point at
  // a different node after the next mutation. An escalate button that appears
  // and vanishes as the world moves is not a rule anybody can play against, so
  // only a selector naming the ticket counts - which is also exactly what the
  // engine's own `resolution_refuses_field` guard accepts.
  return 'id' in selector && selector.id === ticketId;
}

/**
 * Whether a ticket's own resolution rule accepts an escalation, read straight
 * off the rule rather than kept in a second list that can drift from it. If
 * closing the ticket by setting `escalated` is impossible, the escalate button
 * has no business being offered and the action has no business succeeding.
 *
 * The rule has to be about THIS ticket. A clause reading another node's
 * `escalated` flag is a rule about that node: honouring it here offered a
 * button that marked the ticket escalated, did not close it, and then refused
 * the second press - a ticket the player could neither finish nor escalate.
 */
export function acceptsEscalation(
  expr: Readonly<Expr>,
  ticketId: NodeId,
): boolean {
  switch (expr.op) {
    case 'and':
    case 'or':
      return expr.exprs.some((inner) => acceptsEscalation(inner, ticketId));
    case 'not':
      return false;
    case 'eq':
      return names(expr.selector, ticketId)
        && expr.field === FIELDS.escalated
        && expr.value === true;
    case 'exists':
    case 'edge':
      return false;
  }
}
