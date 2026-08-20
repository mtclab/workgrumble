/**
 * THE ESTATE, READ OFF THE CONTENT RATHER THAN OFF A WORLD (E9, 0.39.0).
 *
 * Two questions get asked about a node by machinery that has no graph in front
 * of it: what CLASS of thing it is (a desk, a server, the access surface) and
 * WHOSE it is (which customer's estate it sits in). The week generator asks
 * both of every candidate at every step of every day of every week it tries,
 * and it runs before any world is stood up - so neither can be answered by
 * walking a graph, and both have to be answered from the setup ops the build
 * compiles in.
 *
 * The class half is 0.35.0's, moved here whole and unchanged (it was private to
 * `work-kinds.ts`). The customer half is new, and it is here rather than beside
 * it because the two are ONE WALK: a service is classed by the box it runs on
 * and belongs to the customer that box belongs to, and a file is both of those
 * things through the same contains chain. Two walks over every shop's
 * construction ops would be two answers to "which box is this", free to drift
 * the first time a node kind grew a new way of being hosted - which is the
 * exact defect `machineForTarget` was written to close on the graph side.
 *
 * IT IS NOT A SECOND COPY OF THE CUSTOMER DIMENSION. `customers.ts` answers
 * this off a live graph and stays the authority wherever there is one; this
 * answers the same question off the same field (`FIELDS.machineCustomer`) for
 * the callers that have no graph. Both read the field the seeds write, so
 * neither can invent an owner the content does not declare.
 *
 * Nothing here reads a clock, a graph or the RNG.
 */

import type { SetupOp } from '../engine-api';
import { EMPLOYER_IDS, employerFor } from './employers';
import { FIELDS, isServerRole, machineRoleOf } from './fields';
import { ONBOARDINGS } from './onboarding';
import { findWorldTicket, WORLD_TICKETS } from './tickets';

/** The class of one node of the estate, or nothing this module can class. */
export type NodeClass = 'access' | 'device' | 'server';

/**
 * The node kinds that ARE the access surface: a person, their account, the
 * groups and shares and rules that decide what it can reach, and the customer
 * a contract is with.
 */
const ACCESS_NODE_KINDS: ReadonlySet<string> = new Set([
  'account', 'person', 'group', 'share', 'mail_rule', 'customer',
]);

/**
 * The edge kinds that say "this thing lives on that thing", and which end of
 * each is the child.
 *
 * `connected_to` IS NOT ONE OF THEM IN GENERAL, and the exception below cost a
 * red test to learn. The edge means two different things depending on what is
 * at the near end of it. From a DEVICE it means plugged into - a USB X-ray
 * sensor is on the chair-side workstation, and therefore on that clinic's
 * estate, and a departure that left it behind would leave a sensor hanging in
 * a world with no clinic in it. From a SERVICE it means feeds: the probation
 * shop writes `service:spooler -> printer` to say which printer the queue
 * actually feeds, and that edge is authored BEFORE the spooler's `runs_on` to
 * the print server. Treated as hosting, first-wins put the spooler on the
 * printer and reclassified the whole wedged-spooler ticket from server work to
 * desk work - a mix quietly wrong at one shop, exactly the kind of quiet
 * wrongness this codebase refuses.
 *
 * So the rule is the honest one rather than the convenient one: a
 * `connected_to` hosts only when the thing at the near end is a device.
 */
const HOSTING_EDGES: Readonly<Record<string, 'from' | 'to'>> = {
  runs_on: 'from',
  contains: 'to',
};

/** And the kind for which `connected_to` genuinely means "lives on". */
const PLUGGED_IN_KIND = 'device';

interface EstateIndex {
  readonly classes: ReadonlyMap<string, NodeClass>;
  readonly customers: ReadonlyMap<string, string>;
}

let INDEX: EstateIndex | null = null;

/**
 * Every setup this build ships, in one list.
 *
 * The three sources are the three ways a node gets into a world: the shop's own
 * estate, a ticket standing up the thing it is about, and an onboarding signing
 * a customer up mid-week. The third was worth the line on its own - TILLMAN's
 * server is built by the onboarding rather than by the MSP, so without it the
 * one ticket about it had no estate to be classed by and came out unknown.
 */
function everySetup(): readonly (readonly SetupOp[])[] {
  return [
    ...EMPLOYER_IDS.map((id) => employerFor(id).setup()),
    ...ONBOARDINGS.map((event) => event.setup()),
    ...WORLD_TICKETS.map((ticket) => ticket.def.setup),
  ];
}

/**
 * The estate, walked once.
 *
 * Built lazily and kept, because it walks every shop's construction ops and
 * there is no reason to do that twice - and built from the SETUP rather than
 * from a live graph, because both answers are facts about the content and have
 * to come out the same in a generator that has no world to look at.
 */
function index(): EstateIndex {
  if (INDEX !== null) {
    return INDEX;
  }

  const classes = new Map<string, NodeClass>();
  const customers = new Map<string, string>();
  const hosted = new Map<string, string>();
  const kinds = new Map<string, string>();
  const setups = everySetup();

  // The node kinds first, in a pass of their own, because the edge rule below
  // has to know what is at the near end of a `connected_to` and an edge is
  // free to arrive before the node it names - a ticket's own setup wires a
  // device the shop seeded three files ago.
  for (const ops of setups) {
    for (const op of ops) {
      if (op.op === 'addNode') {
        kinds.set(op.node.id, op.node.kind);
      }
    }
  }

  for (const ops of setups) {
    for (const op of ops) {
      if (op.op === 'addNode') {
        const { id, kind, fields } = op.node;

        if (kind === 'machine') {
          // A machine's ROLE is the difference between a desk and a server room
          // and the world already writes it down, so this reads the field
          // rather than guessing from a hostname.
          classes.set(
            id,
            isServerRole(machineRoleOf(fields[FIELDS.machineRole]))
              ? 'server'
              : 'device',
          );
        } else if (kind === 'device') {
          classes.set(id, 'device');
        } else if (ACCESS_NODE_KINDS.has(kind)) {
          classes.set(id, 'access');
        }

        // A customer node is its own estate's root: the contract itself is the
        // first thing that leaves when the contract ends.
        if (kind === 'customer') {
          customers.set(id, id);
        }

        const owner = fields[FIELDS.machineCustomer];

        if (typeof owner === 'string' && owner.length > 0) {
          customers.set(id, owner);
        }
      }

      // What a service or unit runs on, what a drive holds, and what a device
      // is plugged into: all three answer "which box is this" for a node that
      // is not a box. The third only where the near end really is a device -
      // see HOSTING_EDGES for the ticket that taught us the difference.
      if (op.op === 'addEdge') {
        const side = op.edge.kind === 'connected_to'
          ? (kinds.get(op.edge.from) === PLUGGED_IN_KIND ? 'from' : undefined)
          : HOSTING_EDGES[op.edge.kind];

        if (side !== undefined) {
          const [child, box] = side === 'to'
            ? [op.edge.to, op.edge.from]
            : [op.edge.from, op.edge.to];

          if (!hosted.has(child)) {
            hosted.set(child, box);
          }
        }
      }
    }
  }

  // A hosted thing is whatever its box is, resolved through however many hops
  // the drive puts between a file and the machine holding it. Walked once per
  // answer so a chain of ten files costs ten steps rather than a hundred.
  for (const child of hosted.keys()) {
    settle(child, hosted, classes);
    settle(child, hosted, customers);
  }

  INDEX = { classes, customers };

  return INDEX;
}

/**
 * Walks a hosted node up to the first box that has an answer, and writes that
 * answer onto the child.
 *
 * Cycle-guarded, because a `connected_to` pair that points both ways is a
 * content mistake rather than an impossibility, and a generator that hangs is
 * worse than one that shrugs.
 */
function settle<Answer>(
  child: string,
  hosted: ReadonlyMap<string, string>,
  answers: Map<string, Answer>,
): void {
  const seen = new Set<string>();
  let at: string | undefined = child;

  while (at !== undefined && !seen.has(at) && answers.get(at) === undefined) {
    seen.add(at);
    at = hosted.get(at);
  }

  const found = at === undefined ? undefined : answers.get(at);

  if (found !== undefined) {
    answers.set(child, found);
  }
}

/** The class of one node, services and files resolved to the box they are on. */
export function nodeClassOf(node: string): NodeClass | undefined {
  return index().classes.get(node);
}

/**
 * The customer whose estate a node sits in, or null for the in-house half of
 * every world - the player's own desk, the MSP's infrastructure, and every node
 * at the three shops that have no customers at all.
 */
export function customerOfNode(node: string): string | null {
  return index().customers.get(node) ?? null;
}

/**
 * Kept, because the generator asks this of every candidate at every step of
 * every day of every week it tries, and the answer cannot change: whose a
 * ticket is is a fact about content that is compiled into the build.
 */
const TICKET_CUSTOMERS = new Map<string, string | null>();

/**
 * WHOSE a ticket is, off the content - the customer behind the estate it names,
 * or null for an in-house one.
 *
 * The graph-side answer (`customerIdForTicketNodes`) reads the same field off
 * the same nodes and is the authority wherever a world exists. This one exists
 * for the generator, which decides what a week deals before any world does, and
 * it answers over the SAME two sources a spawn does: the estate primary the
 * roster writes first, and then anything the ticket's own setup builds - which
 * is how the onboarding customer's ticket is answered at all, its server being
 * stood up by the signing rather than by the shop.
 *
 * Null rather than a throw for an unknown ticket, unlike `workKindOf`. A mix
 * with a hole in it is a ratio that silently stops counting; an OWNER with a
 * hole in it is a ticket that belongs to nobody, which is a real and common
 * answer here - most of the game's tickets are in-house.
 */
export function customerOfTicket(ticketId: string): string | null {
  const known = TICKET_CUSTOMERS.get(ticketId);

  if (known !== undefined) {
    return known;
  }

  const answered = resolveTicket(ticketId);
  TICKET_CUSTOMERS.set(ticketId, answered);

  return answered;
}

function resolveTicket(ticketId: string): string | null {
  const ticket = findWorldTicket(ticketId);

  if (ticket === undefined) {
    return null;
  }

  for (const node of ticket.nodes) {
    const owner = customerOfNode(node);

    if (owner !== null) {
      return owner;
    }
  }

  for (const op of ticket.def.setup) {
    const owner = customerOfNode(touchedBy(op));

    if (owner !== null) {
      return owner;
    }
  }

  return null;
}

/** The node a setup op is about, for the fallback read above. */
function touchedBy(op: Readonly<SetupOp>): string {
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
