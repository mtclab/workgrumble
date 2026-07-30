import type { Expr } from '../../engine-api';
import { FIELDS } from '../fields';

/**
 * Whether a ticket's own resolution rule accepts an escalation, read straight
 * off the rule rather than kept in a second list that can drift from it. If
 * closing the ticket by setting `escalated` is impossible, the escalate button
 * has no business being offered and the action has no business succeeding.
 */
export function acceptsEscalation(expr: Readonly<Expr>): boolean {
  switch (expr.op) {
    case 'and':
    case 'or':
      return expr.exprs.some(acceptsEscalation);
    case 'not':
      return false;
    case 'eq':
      return expr.field === FIELDS.escalated && expr.value === true;
    case 'exists':
    case 'edge':
      return false;
  }
}
