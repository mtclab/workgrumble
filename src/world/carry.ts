/**
 * What the estate takes with it into next week (E11, 0.34.0 slice 1).
 *
 * D-E11-1 is answered YES: the estate persists across a week at the same
 * employer. The world is not rebuilt from nothing every Monday, because the
 * whole design idiom of this game is that the fault exists whether or not
 * anybody was watching - and a printer you got Facilities to write DO NOT
 * UNPLUG on, back on Thursday, being un-noted again on Monday with nobody
 * having taken the marker to it is the world lying about the one thing it has
 * always been honest about.
 *
 * IT IS NOT THE WHOLE GRAPH, and that is the decision rather than a saving.
 * Persisting everything makes the world at week N a function of everything the
 * player did in weeks one to N-1, which no golden can pin and no solvability
 * proof can reason about - and it opens a death spiral, where a player who
 * breaks something in week two carries an unwinnable estate into week three
 * through a channel nobody enumerated. So what crosses is a DECLARED LIST:
 * per employer, field by field, node by node, written down here where it can be
 * read and argued with. Everything not on the list is rebuilt from
 * `employer.setup()` exactly as it always was.
 *
 * The list is the same discipline `carrySetup` keeps for the career fields
 * (`session.ts`): a carry with nothing on it emits no ops, so a week with an
 * empty delta is byte-identical to the week before this module existed - which
 * is every week one of every career, which is every golden in the project.
 *
 * THE THREE QUESTIONS EVERY CANDIDATE FIELD IS PUT TO, and the reason the list
 * is short:
 *
 *  1. Is it a fact about the WORLD, or a fact about a WEEK? A repair to a
 *     building is the first. A counter of how many times a box lost power this
 *     week, a day meter, a ticket's state, the minutes the lead has been round
 *     - all of them the second, and all of them reset.
 *  2. Does it carry a CLOCK in it? Every week restarts its clock on the Monday,
 *     so a field holding a tick, or a sentence stamped with one, arrives in the
 *     next week describing a minute that has not happened. Those reset, however
 *     permanent the thing they record.
 *  3. Could it make a week UNPLAYABLE? A ticket's setup runs when the ticket
 *     spawns, which is after this, so a carried value is a baseline a ticket can
 *     still overwrite. But a carried value that satisfies a resolution rule the
 *     ticket does not re-seed is a ticket that arrives already fixed, which the
 *     solvability gate forbids for a reason.
 *
 * Where the doc was silent the answer is RESET, and every decision - carried
 * and reset alike - is written into the commit that shipped it.
 */

import type { FieldValue, NodeId, ReadOnlyGraphView, SetupOp } from '../engine-api';
import { FIELDS } from './fields';

/** One world fact an employer has declared survives its own week boundary. */
export interface CarriedField {
  readonly node: NodeId;
  readonly field: string;
}

/** The same fact with the value it held on the Friday. */
export interface CarriedValue extends CarriedField {
  readonly value: FieldValue;
}

/**
 * The delta, read off the world that is ending.
 *
 * Only fields the graph is actually HOLDING are read: an absent field carries
 * nothing rather than carrying `null`, because absent is a real answer in this
 * world (the default tier, the empty audit, the dot nobody has touched) and
 * writing a null over it would be the carry inventing state on a machine
 * nobody had touched. That is what keeps a career whose player did nothing
 * carrying an EMPTY delta, and an empty delta byte-identical.
 */
export function readCarried(
  graph: ReadOnlyGraphView,
  whitelist: readonly CarriedField[],
): readonly CarriedValue[] {
  const values: CarriedValue[] = [];

  for (const { node, field } of whitelist) {
    const value = graph.getField(node, field);

    if (value !== undefined && value !== null) {
      values.push({ node, field, value });
    }
  }

  return Object.freeze(values);
}

/**
 * The delta, written into the world that is starting.
 *
 * It goes in AFTER `employer.setup()` and before the Monday pile is spawned, so
 * the shop's own seed is the baseline and the carried values are what last week
 * left on top of it - and a ticket that re-seeds the same field when it spawns
 * still wins, because a ticket's setup is the fault it is reporting.
 */
export function carriedSetup(
  values: readonly CarriedValue[],
): readonly SetupOp[] {
  return values.map(({ node, field, value }) => ({
    op: 'setField' as const,
    id: node,
    field,
    value,
  }));
}

/**
 * A delta read back off whatever it was written to, or refused.
 *
 * The same shape of guard `parseCareer` and `parseRetryRecord` are: every entry
 * is checked and a list with rubbish in it is refused WHOLE rather than
 * silently shortened. Half a delta is worse than none - it is a world that came
 * back with the note by the socket and without the software on the machine, and
 * nothing on any screen would say which half went missing. A file with no delta
 * in it at all is a legal empty one, because that is what every save written
 * before this existed is.
 */
export function parseCarried(value: unknown): readonly CarriedValue[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const values: CarriedValue[] = [];

  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null;
    }

    const { node, field, value: held } = entry as Record<string, unknown>;

    if (
      typeof node !== 'string' || node.length === 0
      || typeof field !== 'string' || field.length === 0
      || (typeof held !== 'string' && typeof held !== 'number'
        && typeof held !== 'boolean')
    ) {
      return null;
    }

    values.push({ node, field, value: held });
  }

  return Object.freeze(values);
}

/**
 * What every employer carries about the PLAYER, as opposed to about its estate.
 *
 * One field, and it is on the list for the reason its own documentation gives
 * for keeping it OFF the employer switch: "a new estate is new boxes, and last
 * job's fingerprints mean nothing at this one". Read the other way round, a box
 * you did trust-on-first-use against on the Tuesday is a box you have trusted,
 * and being asked again on the Monday would be the client forgetting something
 * a client does not forget.
 *
 * It is absent for every service-desk player and every save that predates the
 * tier, so it writes nothing in any week the goldens walk.
 */
export function playerCarries(player: NodeId): readonly CarriedField[] {
  return Object.freeze([
    { node: player, field: FIELDS.knownHosts },
  ]);
}
