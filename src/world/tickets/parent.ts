/**
 * Parent and child incidents: forty complaints about one fault.
 *
 * When a certificate expires or a switch dies, a service desk does not get one
 * ticket. It gets one ticket per person who noticed, and first line's job stops
 * being repair and becomes bookkeeping: attach the duplicates to a parent, fix
 * the parent, and let the children close with the parent's own words copied
 * onto each of them. That is the real workflow, and it is the one thing that
 * makes a flood survivable rather than a punishment for being on shift.
 *
 * The mechanism is CONTENT-DRIVEN and the engine is untouched. A ticket that
 * may be somebody's duplicate says so in its own resolution rule - it carries
 * an extra `or` branch reading its `parent_resolved` marker - and the link
 * action refuses any ticket whose rule does not, using the engine's existing
 * `resolution_refuses_field` guard. So "can this be closed by closing that" is
 * answered by the ticket rather than by a list beside it, and a ticket nobody
 * wrote as a duplicate can never be bulk-closed by a player who has fixed
 * nothing.
 *
 * Everything here is derivation and content helpers. Nothing writes.
 */

import type { Expr, NodeId, ReadOnlyGraphNode, Selector } from '../../engine-api';
import { FIELDS } from '../fields';

/** Whether a selector NAMES this node rather than describing something. */
function names(selector: Readonly<Selector>, ticketId: NodeId): boolean {
  return 'id' in selector && selector.id === ticketId;
}

/**
 * The `or` branch that makes a ticket attachable to a parent.
 *
 * Written by the content, not by the link action - a resolution rule is fixed
 * at registration and the engine is the thing that owns it, so "the child's
 * rule gains a parent branch" means the author wrote one. Wrapping is done
 * here so every duplicate-capable ticket in the game says it the same way and
 * the loader can check it.
 */
export function closesWithParent(ticketId: NodeId, own: Readonly<Expr>): Expr {
  return {
    op: 'or',
    exprs: [
      own,
      {
        op: 'eq',
        selector: { id: ticketId },
        field: FIELDS.parentResolved,
        value: true,
      },
    ],
  };
}

/**
 * Whether a ticket's own rule accepts being closed by its parent, read off the
 * rule itself - the same shape (and the same reasoning) as `acceptsEscalation`.
 * The engine asks the identical question in its `resolution_refuses_field`
 * guard, so the button and the action cannot disagree.
 */
export function acceptsParent(
  expr: Readonly<Expr>,
  ticketId: NodeId,
): boolean {
  switch (expr.op) {
    case 'and':
    case 'or':
      return expr.exprs.some((inner) => acceptsParent(inner, ticketId));
    case 'not':
      return false;
    case 'eq':
      return names(expr.selector, ticketId)
        && expr.field === FIELDS.parentResolved
        && expr.value === true;
    case 'exists':
    case 'edge':
      return false;
  }
}

/** The parent this ticket has been attached to, or nothing. */
export function parentOf(node: Readonly<ReadOnlyGraphNode>): string | null {
  const value = node.fields[FIELDS.parent];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function isResolved(node: Readonly<ReadOnlyGraphNode>): boolean {
  return node.fields[FIELDS.state] === 'resolved';
}

/** The tickets attached to this one, in the order the graph reports them. */
export function childrenOf(
  tickets: readonly Readonly<ReadOnlyGraphNode>[],
  parentId: string,
): readonly Readonly<ReadOnlyGraphNode>[] {
  return tickets.filter((ticket) => parentOf(ticket) === parentId);
}

export interface Cascade {
  readonly child: string;
  readonly parent: string;
}

/**
 * Every child whose parent has been fixed and which has not been told yet.
 *
 * A pure read, so the driver can ask it every tick and after every dispatch
 * without the answer depending on which of those asked. A child that is
 * already resolved, or already marked, is not due: the marker is the
 * watermark, exactly as the meters use one for breaches.
 */
export function cascadesDue(
  tickets: readonly Readonly<ReadOnlyGraphNode>[],
): readonly Cascade[] {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  return tickets.flatMap((ticket) => {
    const parentId = parentOf(ticket);

    if (parentId === null || isResolved(ticket)) {
      return [];
    }

    if (ticket.fields[FIELDS.parentResolved] === true) {
      return [];
    }

    const parent = byId.get(parentId);

    // A parent that is itself unresolved, or is not in this world at all, is
    // not news. And a ticket that somehow names itself is inert by
    // construction: it can only be due once it is resolved, and a resolved
    // ticket is never due.
    return parent === undefined || !isResolved(parent) || parent.id === ticket.id
      ? []
      : [{ child: ticket.id, parent: parentId }];
  });
}

/**
 * What the reporter of a child ticket is actually told.
 *
 * The parent's own last word to ITS reporter, copied - which is the real
 * behaviour and the honest one: the forty people who reported the same outage
 * get the same explanation, in the same words, at the same minute. When the
 * parent was closed without a word to anybody, they get the plain fact
 * instead, because "resolved" with no sentence attached is how a service desk
 * earns its reputation.
 */
export function cascadeComment(
  parentTitle: string,
  parentComments: readonly string[],
): string {
  const last = [...parentComments].reverse()
    .find((line) => line.trim().length > 0);

  return last === undefined
    ? `Closed with the parent incident, "${parentTitle}". The fault behind `
      + 'this and everybody else\'s report has been fixed. Nothing further is '
      + 'needed from you.'
    : `Closed with the parent incident, "${parentTitle}": ${last}`;
}

/** The internal note the link itself leaves on the child. */
export function linkNote(parentTitle: string, parentId: string): string {
  return `Attached to ${parentId} ("${parentTitle}") as a duplicate. It closes `
    + 'when that one does, with the same words to the reporter.';
}
