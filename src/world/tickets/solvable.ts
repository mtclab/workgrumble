/**
 * The half of the solvability gate that runs at load.
 *
 * The other half - driving every advertised path through the real engine
 * against the real world - is `solvability.test.ts`, and it is the one that
 * proves anything. This is the cheap half that runs in the browser on every
 * boot, and it catches the class of content bug the expensive half cannot see
 * quickly: a path aimed at a node that does not exist.
 *
 * That bug is worth a load failure because of how it presents. A step aimed at
 * `account:priya ` with a trailing space, or at a machine that was renamed in
 * the pack six months ago, does not throw and does not look wrong in the file.
 * It arrives as a refusal - "nothing in the estate is called that" - in front
 * of a player who has followed the article, in the middle of a shift, on the
 * one ticket they cannot close.
 *
 * Everything here is pure and reads the seed rather than a live world.
 */

import type { SetupOp } from '../../engine-api';
import type { TicketActionStep, WorldTicket } from './types';

/** Node ids look like `kind:slug`, which is what makes them spottable. */
const NODE_ID = /^[a-z_]+:[a-z0-9-]+$/u;

/** Every node the company seed builds, by id. */
export function seededNodeIds(setup: readonly SetupOp[]): ReadonlySet<string> {
  return new Set(
    setup.flatMap((op) => (op.op === 'addNode' ? [op.node.id] : [])),
  );
}

/**
 * Everything a step names: what it is aimed at, and any parameter that is
 * itself a node - a group to add somebody to, a licence pool to take a seat
 * from, a parent incident to attach a duplicate to.
 *
 * Parameters are found by SHAPE rather than by a list of parameter names, on
 * purpose. A list would have to be kept in step with every new verb, and the
 * day it fell behind is the day this check would quietly stop covering the verb
 * that needed it most.
 */
export function nodesNamedBy(step: Readonly<TicketActionStep>): readonly string[] {
  return [
    step.target,
    ...Object.values(step.params ?? {}).filter(
      (value): value is string => typeof value === 'string' && NODE_ID.test(value),
    ),
  ];
}

/**
 * Every ticket that has to be in the world before a path can be driven.
 *
 * A duplicate's path attaches it to a parent and then closes it with that
 * parent, so the parent has to have been raised - which is true in play (the
 * flood arrives together) and has to be arranged in a test. Derived from the
 * steps rather than declared beside them, because a second list is a second
 * thing to forget.
 */
export function ticketsNeededFor(entry: Readonly<WorldTicket>): readonly string[] {
  const named = entry.paths.flatMap(
    (path) => path.steps.flatMap(nodesNamedBy),
  );

  return [
    entry.def.id,
    ...new Set(named.filter((id) => id.startsWith('ticket:'))),
  ];
}

/**
 * Load-time gate: every node an advertised path names is a node that exists -
 * in the estate, as one of the tickets the roster ships, or as something a
 * ticket's own setup builds.
 *
 * The third case is the file somebody saved into a temp directory: it is not
 * in the seed, because it was written on the Thursday afternoon and a world
 * that had it on the Monday morning would be a world with a file dated in the
 * future in it. It arrives with the ticket, exactly as every other fault in
 * this roster does, and the fact that a `setup` op builds it is what makes it
 * a real node rather than a typo.
 */
export function assertPathsAimAtRealNodes(
  entries: readonly WorldTicket[],
  seeded: ReadonlySet<string>,
): void {
  const tickets = new Set(entries.map(({ def }) => def.id));
  const built = new Set(
    entries.flatMap(({ def }) => [...seededNodeIds(def.setup)]),
  );

  for (const entry of entries) {
    for (const path of entry.paths) {
      for (const step of path.steps) {
        for (const id of nodesNamedBy(step)) {
          if (seeded.has(id) || tickets.has(id) || built.has(id)) {
            continue;
          }

          throw new Error(
            `Path "${path.id}" of "${entry.def.id}" aims "${step.action}" at `
            + `"${id}", which is not in the estate, is not a ticket anybody `
            + 'wrote, and is not built by any ticket\'s setup.',
          );
        }
      }
    }
  }
}
