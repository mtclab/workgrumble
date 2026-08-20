/**
 * WHAT LEAVES THE WORLD, AND WHAT STOPS ARRIVING (E9, 0.39.0).
 *
 * The mechanical half of churn. `patience.ts` decides that an account has gone
 * quiet or given notice; this turns those two words into the only two things
 * they can honestly mean to an estate:
 *
 *  - QUIET deweights the account's entries in the drip and surplus pool. Their
 *    tickets do not stop, they THIN - which is what a client winding down
 *    actually looks like from a service desk, and it is deliberately not
 *    announced anywhere. The player notices the queue.
 *  - LEAVING takes the account's estate out of the world at the next build.
 *
 * THE DEPARTURE IS A SEED FILTER, NOT A DELETION, and that is the load-bearing
 * decision of the whole lane. Nothing removes nodes from a live graph: a week
 * is stood up from `employer.setup()` and this drops the ops that would have
 * built the departed estate, exactly as `createWorldSession` already
 * parameterises the whole seed on WHICH employer (0.6.0). So the world a player
 * is inside never changes shape under them, every save is a world that was
 * built that way, and the evidence of what was done for that client is not
 * destroyed - it is simply a building the desk no longer has a key to. A
 * remnant that does mention them (a KB article, a ticket somebody kept open)
 * still reads and the scope guards still refuse honestly, because the guards
 * read the CONTRACT off a node that is no longer there and a customer with no
 * node is a customer with no scope - which is the same answer they give for
 * anything they cannot place.
 *
 * THE CLOSURE IS THE INTERESTING PART. A customer's estate is not the set of
 * nodes carrying its id: it is those nodes and everything that hangs off them -
 * the services on their servers, the drive under their file shares, the
 * monitor plugged into their reception PC, and the people whose whole presence
 * in the world was owning one of those. So the filter walks the ops to a
 * fixpoint rather than filtering them once, and an edge with a dropped end is
 * dropped with it. Half a departure - a service with no box, a person with no
 * account - is a broken world, and a broken world is worse than a client who
 * never left.
 *
 * Nothing here mutates, dispatches, reads a clock or consumes the RNG.
 */

import type { SetupOp } from '../engine-api';
import { customerOfTicket } from './estate-index';
import { FIELDS } from './fields';
import { findOnboarding } from './onboarding';
import {
  COLUMNS,
  type Beat,
  type Column,
  type ContentEntry,
  type EmployerContent,
} from './pools';
import type { DmSlot, DripSlot, OnboardingSlot, WalkUpSlot } from './week';
import type { LinkedRequestSlot } from './requests';

/* -- the estate that goes -------------------------------------------------- */

/**
 * The edge kinds that mean "this hangs off that", and which end is the hanger.
 *
 * The same rule the static index keeps, read here for the same reason one step
 * further on: the index answers whose a node is, and this answers what goes
 * with it. `contains` is written holder-first, `runs_on` child-first.
 *
 * AND `connected_to` IS NOT ON THE LIST, because it means two different things
 * depending on what is at the near end. From a DEVICE it means plugged into,
 * and the sensor on a clinic's chair-side workstation leaves when the clinic
 * does. From a SERVICE it means feeds - the probation shop writes
 * `service:spooler -> printer` to record which printer the queue fills - and a
 * service does not leave the world because the thing it feeds did. The index
 * learned that difference from a red test; this is the same rule, kept once
 * rather than discovered twice.
 */
const HANGS_OFF: Readonly<Record<string, 'from' | 'to'>> = {
  runs_on: 'from',
  contains: 'to',
};

/** And the kind for which `connected_to` genuinely means "lives on". */
const PLUGGED_IN_KIND = 'device';

/** The node a setup op is about. */
function subjectOf(op: Readonly<SetupOp>): string {
  switch (op.op) {
    case 'addNode':
      return op.node.id;
    case 'setField':
      return op.id;
    case 'addEdge':
    case 'removeEdge':
      return op.edge.from;
  }
}

/**
 * Every node one departure takes with it, walked to a fixpoint over the ops.
 *
 * Three rules, and the third is the one that needed thinking about:
 *
 *  1. the customer node itself, and anything carrying its id;
 *  2. anything hanging off a node already going - however many hops the drive
 *     puts between a file and the machine holding it;
 *  3. a PERSON whose every possession is going. A receptionist at a firm that
 *     has left owns an account on an estate that is leaving and nothing else,
 *     and a person with no account, no box and no reason to be in the building
 *     is a name the directory would list and nobody could do anything with.
 *     The clause is deliberately "every" rather than "any": the MSP's own staff
 *     own MSP accounts and stay, and so would anybody who happened to hold one
 *     of each.
 */
function nodesLeavingWith(
  ops: readonly SetupOp[],
  departed: ReadonlySet<string>,
): ReadonlySet<string> {
  const going = new Set<string>(departed);
  const owned = new Map<string, Set<string>>();
  const kinds = new Map<string, string>();

  for (const op of ops) {
    if (op.op === 'addNode') {
      kinds.set(op.node.id, op.node.kind);

      const owner = op.node.fields[FIELDS.machineCustomer];

      if (typeof owner === 'string' && departed.has(owner)) {
        going.add(op.node.id);
      }
    }

    if (op.op === 'addEdge' && op.edge.kind === 'owns') {
      const held = owned.get(op.edge.from) ?? new Set<string>();
      held.add(op.edge.to);
      owned.set(op.edge.from, held);
    }
  }

  /** Which end of an edge hangs off the other, or nothing for a peer link. */
  const hangerOf = (
    edge: Readonly<{ readonly from: string; readonly kind: string }>,
  ): 'from' | 'to' | undefined => (
    edge.kind === 'connected_to'
      ? (kinds.get(edge.from) === PLUGGED_IN_KIND ? 'from' : undefined)
      : HANGS_OFF[edge.kind]
  );

  let moved = true;

  while (moved) {
    moved = false;

    for (const op of ops) {
      if (op.op !== 'addEdge') {
        continue;
      }

      const side = hangerOf(op.edge);

      if (side === undefined) {
        continue;
      }

      const [child, holder] = side === 'from'
        ? [op.edge.from, op.edge.to]
        : [op.edge.to, op.edge.from];

      if (going.has(holder) && !going.has(child)) {
        going.add(child);
        moved = true;
      }
    }

    for (const [person, holdings] of owned) {
      if (going.has(person) || holdings.size === 0) {
        continue;
      }

      if ([...holdings].every((held) => going.has(held))) {
        going.add(person);
        moved = true;
      }
    }
  }

  return going;
}

/**
 * The shop's own seed, with a departed customer's estate left out of it.
 *
 * Returns the SAME array when nothing has left, which is not an optimisation:
 * it is the byte-identical claim made structurally. Every world at every
 * employer that has never lost a client applies exactly the ops it always
 * applied, and no golden can move because nothing ran.
 */
export function withoutDeparted(
  ops: readonly SetupOp[],
  departed: ReadonlySet<string>,
): readonly SetupOp[] {
  if (departed.size === 0) {
    return ops;
  }

  const going = nodesLeavingWith(ops, departed);

  return ops.filter((op) => {
    if (op.op === 'addEdge' || op.op === 'removeEdge') {
      return !going.has(op.edge.from) && !going.has(op.edge.to);
    }

    return !going.has(subjectOf(op));
  });
}

/* -- the content that stops arriving --------------------------------------- */

/** The tickets one cell of one column puts on the desk. */
function ticketsOfCell(column: Column, cell: unknown): readonly string[] {
  switch (column) {
    case 'inherited':
      return [cell as string];
    case 'drip':
      return [(cell as DripSlot).ticketId];
    case 'dms':
      return [(cell as DmSlot).raises];
    case 'walkUps':
      return [(cell as WalkUpSlot).raises];
    case 'requests':
      return [(cell as LinkedRequestSlot).raises];
    default:
      return [];
  }
}

/**
 * Whose content one entry is - every account it would put work on the desk for.
 *
 * Two sources, and the second is not a courtesy. Most entries answer through
 * their tickets. An ONBOARDING answers through the customer it stands up, and
 * without that clause a client who signed and then left would be signed up
 * again by a drawn week, estate and all, three days after the notice - the
 * departure undone by the one piece of content that builds a customer instead
 * of using one.
 */
export function customersOfEntry(
  entry: Readonly<ContentEntry>,
  customerOf: (ticketId: string) => string | null = customerOfTicket,
): ReadonlySet<string> {
  const held = entry.fragment as Record<string, readonly unknown[] | undefined>;
  const accounts = new Set<string>();

  for (const column of COLUMNS) {
    for (const cell of held[column] ?? []) {
      if (column === 'onboarding') {
        const signing = findOnboarding((cell as OnboardingSlot).onboardingId);

        if (signing !== undefined) {
          accounts.add(signing.customer);
        }

        continue;
      }

      for (const ticket of ticketsOfCell(column, cell)) {
        const owner = customerOf(ticket);

        if (owner !== null) {
          accounts.add(owner);
        }
      }
    }
  }

  return accounts;
}

/**
 * What an entry weighs once the quiet accounts have been thinned.
 *
 * The scale is applied to EVERY entry or to none, and that is what keeps a
 * world with nobody quiet drawing byte-identically: with no quiet account the
 * whole content is handed back untouched, weights of one and all, and the draw
 * is the arithmetic it has always been. The moment there is one, every entry
 * is multiplied up and the quiet account's are not - which is the same ratio
 * expressed in the whole numbers the draw's modulo needs.
 */
export const QUIET_WEIGHT = 1;

/**
 * And what everything else weighs beside them. FOUR: a quiet account's work
 * turns up about a quarter as often, which over a five-day week is the
 * difference between three of their tickets and none - visible in the queue,
 * and not so absolute that the account vanishes without having left.
 * OVERSEER TUNING KNOB.
 */
export const NORMAL_WEIGHT = 4;

function reweighted(
  entry: Readonly<ContentEntry>,
  quiet: ReadonlySet<string>,
  customerOf: (ticketId: string) => string | null,
): ContentEntry {
  const accounts = customersOfEntry(entry, customerOf);
  const thin = [...accounts].some((account) => quiet.has(account));

  return {
    ...entry,
    weight: entry.weight * (thin ? QUIET_WEIGHT : NORMAL_WEIGHT),
  };
}

export interface ChurnState {
  /** Accounts whose estate is not in this world at all. */
  readonly departed: ReadonlySet<string>;
  /** Accounts still here, whose work has thinned. */
  readonly quiet: ReadonlySet<string>;
}

/** Nothing has happened to anybody - the state every shipped world is in. */
export const NO_CHURN: ChurnState = Object.freeze({
  departed: new Set<string>(),
  quiet: new Set<string>(),
});

function keptBeat(
  beat: Readonly<Beat>,
  churn: Readonly<ChurnState>,
  customerOf: (ticketId: string) => string | null,
): Beat | null {
  const gone = beat.members.some((member) =>
    [...customersOfEntry(member.entry, customerOf)]
      .some((account) => churn.departed.has(account)));

  if (gone) {
    // A beat is content that COUPLES, and half of one is the arc with its
    // point taken out - the loader refuses a room post whose ticket is not
    // dealt, and it is right to. So a beat touching a departed estate goes
    // whole, which is also what a departure is: the whole story stops.
    return null;
  }

  if (churn.quiet.size === 0) {
    return beat;
  }

  return {
    ...beat,
    members: beat.members.map((member) => ({
      at: member.at,
      entry: reweighted(member.entry, churn.quiet, customerOf),
    })),
  };
}

/**
 * The shop's content as it stands after the churn: the departed accounts' work
 * out of the pool entirely, the quiet accounts' thinned.
 *
 * THE QUOTAS DO NOT MOVE, and that is deliberate rather than an oversight. A
 * quota is a claim about what a week at this shop IS - two things on the desk
 * every morning - and losing a client does not lower the desk's day, it moves
 * the work to whoever is left. Keeping them is also the stricter test: the
 * shrunken pool has to fill the same week, which is exactly what the
 * post-churn sweep exists to prove it can.
 *
 * Returns the SAME content object when nothing has churned, for the reason
 * `withoutDeparted` returns the same ops: the byte-identical claim made
 * structurally rather than promised.
 */
export function contentAfterChurn(
  content: Readonly<EmployerContent>,
  churn: Readonly<ChurnState> = NO_CHURN,
  customerOf: (ticketId: string) => string | null = customerOfTicket,
): EmployerContent {
  if (churn.departed.size === 0 && churn.quiet.size === 0) {
    return content;
  }

  const pool: ContentEntry[] = [];

  for (const entry of content.pool) {
    const accounts = customersOfEntry(entry, customerOf);

    if ([...accounts].some((account) => churn.departed.has(account))) {
      continue;
    }

    pool.push(
      churn.quiet.size === 0
        ? entry
        : reweighted(entry, churn.quiet, customerOf),
    );
  }

  const beats: Beat[] = [];

  for (const beat of content.beats) {
    const kept = keptBeat(beat, churn, customerOf);

    if (kept !== null) {
      beats.push(kept);
    }
  }

  return { ...content, pool, beats };
}

/**
 * The customers an employer's authored week and surplus can even be about.
 *
 * A read for the gates rather than for the product: the post-churn sweep needs
 * to know which accounts a shop HAS before it can deal it a week with one of
 * them missing, and reading it off the content is the only way that list
 * cannot drift from the content it is about.
 */
export function customersInContent(
  content: Readonly<EmployerContent>,
  customerOf: (ticketId: string) => string | null = customerOfTicket,
): readonly string[] {
  const accounts = new Set<string>();

  for (const entry of [
    ...content.pool,
    ...content.beats.flatMap((beat) => beat.members.map((member) => member.entry)),
  ]) {
    for (const account of customersOfEntry(entry, customerOf)) {
      accounts.add(account);
    }
  }

  return Object.freeze([...accounts].sort((left, right) =>
    left.localeCompare(right)));
}
