/**
 * The BEC hunt's read surface (E8, 0.22.0): what is on a mailbox that a
 * password reset does not show you.
 *
 * The incident response turns on SEEING two things the attacker left behind - a
 * forwarding rule, and a standing delegate - so the desk can pull them. Neither
 * is visible from the account's login state (locked, enabled, expired), which is
 * exactly why the real fraud runs from inside a mailbox that looks fixed: the
 * rule and the delegate are permissions on the mailbox, not sessions on it, and
 * the only way to find them is to list them.
 *
 * This is that listing, as pure reads over the graph the shell (or a test)
 * renders. `mailbox_rules` is the `name|action|target` field the world holds one
 * rule per newline; a delegate is the `mailbox_delegate` field naming the account
 * that was granted FullAccess. Nothing here mutates - finding is not fixing, and
 * the fix is the verbs the response dispatches after the player has read this.
 */

import type { FieldValue, ReadOnlyGraphView } from '../engine-api';
import { FIELDS } from './fields';

/**
 * One inbox rule, split out of the `name|action|target` line the mailbox holds
 * it as. `raw` is the whole line unchanged, because that is what the remove verb
 * takes to name the rule it is pulling - a parsed part cannot be handed back to
 * the world without risking a rule that does not round-trip.
 */
export interface MailboxRule {
  readonly name: string;
  readonly action: string;
  readonly target: string;
  readonly raw: string;
}

function asString(value: FieldValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * One `name|action|target` line, parsed. A line that is not in that shape keeps
 * its whole self in every part rather than inventing empty ones, so a malformed
 * rule reads as itself in the listing instead of vanishing into blanks.
 */
function parseRule(raw: string): MailboxRule {
  const parts = raw.split('|');

  if (parts.length !== 3) {
    return { name: raw, action: raw, target: raw, raw };
  }

  const [name = '', action = '', target = ''] = parts;

  return { name, action, target, raw };
}

/**
 * Every inbox rule standing on a mailbox, oldest first, or an empty list for a
 * mailbox with none. The field is newline-joined, exactly as the audit trails
 * are, so this splits it the same way.
 */
export function mailboxRules(
  graph: ReadOnlyGraphView,
  accountId: string,
): readonly MailboxRule[] {
  const field = asString(graph.getField(accountId, FIELDS.mailboxRules));

  if (field === undefined) {
    return [];
  }

  return field.split('\n').filter((line) => line.length > 0).map(parseRule);
}

/**
 * Who holds a FullAccess delegate on a mailbox, by account id, or nothing when
 * nobody does. The persistence half of the hunt: a delegate the response has to
 * review and, when it is the standing access an incident found, remove.
 */
export function mailboxDelegate(
  graph: ReadOnlyGraphView,
  accountId: string,
): string | undefined {
  return asString(graph.getField(accountId, FIELDS.mailboxDelegate));
}
