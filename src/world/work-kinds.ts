/**
 * What KIND of work a ticket is, derived rather than transcribed (E9, 0.35.0
 * slice 1).
 *
 * D2 decided that lower-tier work does not disappear when the player is
 * promoted - it LESSENS, and it lessens by the title AND by the kind of the
 * work ("a senior still resets the odd password; an architect rarely sees one
 * but still catches the outage-adjacent basics"). A ratio per kind is
 * meaningless without a kind, and this module is the kind: four classes over
 * everything the queue can deal, answered for any ticket the build ships.
 *
 * THE ANSWER IS THE VERB, NOT THE FLAVOUR, and that is the one decision here
 * everything else follows from. A ticket's title is comedy, its reporter is a
 * person and its estate is whatever happens to be broken - none of the three
 * says what the work IS. What says it is the hands: the actions the advertised
 * path takes to close it (`ticket.paths`), which are authored, gated by the
 * solvability auditor, and already the thing the game means by "the fix". A
 * password reset is `account.reset_password` whoever raised it and whatever it
 * is called; a disk clear-down is `directory.purge` on somebody's workstation
 * even when the ticket says the machine is lying about space.
 *
 * TWO SIGNALS, because one is not enough. The verb decides the FAMILY, and for
 * the verbs whose family depends on where they land - restarting a service is
 * desk work on a receptionist's PC and server work on the file server - the
 * TARGET decides which: a service or a unit is classed by the box it runs on.
 * Without that second signal every `service.restart` in the game would count as
 * server work, and half of them are somebody's spooler.
 *
 * THE FALLBACK IS THE ESTATE. A handful of tickets close with no fix at all -
 * an alert escalated to the tier above, a question answered with a reply - and
 * they are real work with a real kind: the kind of the thing they are about.
 * Those are classed off their first estate node, which is the one the roster
 * writes first ("what is broken, and anything broken with it").
 *
 * Nothing here reads a clock, a graph or the RNG: a ticket's kind is a fact
 * about the content, decided the same way on every run and in every session.
 */

import type { SetupOp } from '../engine-api';
import { EMPLOYER_IDS, employerFor } from './employers';
import { FIELDS, isServerRole, machineRoleOf } from './fields';
import { ONBOARDINGS } from './onboarding';
import { findWorldTicket, WORLD_TICKETS } from './tickets';
import type { WorkKind } from './titles';

/**
 * The verb families, by the namespace the action id carries.
 *
 * The namespace is not a convention this module invented - every action in the
 * registry is `family.verb` and has been since M0 - so this table is a reading
 * of the verb set rather than a second copy of it. It is exhaustive over the
 * families a TICKET PATH can use, which is a much smaller set than the registry:
 * the rest of the ids are the day's own bookkeeping (`day.`, `meters.`) and
 * never appear as a step.
 */
const VERB_FAMILIES: Readonly<Record<string, WorkKind>> = {
  /* Identity, permission and licence: the password-reset class. */
  account: 'access',
  share: 'access',
  mail_rule: 'access',
  recert: 'access',
  /* Hands on a box or the thing on somebody's desk. */
  device: 'device',
  machine: 'device',
  printer: 'device',
  mdm: 'device',
  software: 'device',
  desk: 'device',
  facilities: 'device',
  demo: 'device',
  /* And the drive, which is a box's own contents rather than an estate of its
   * own: moving a file out of Temp and clearing a full disk are done standing
   * at (or remoted into) the machine that holds them. */
  file: 'device',
  directory: 'device',
  /* Project work is its own class by definition (E10): planned, phased, and on
   * a baked date rather than a customer's clock. */
  project: 'project',
};

/**
 * The verb families whose kind depends on WHERE they land, and are therefore
 * answered by the step's target rather than by the family.
 *
 * `service` and `unit` are the whole reason this exists - the same restart is
 * desk work on a workstation and server work on a server - and the Linux
 * families that only ever appear on an engineer's boxes are here for honesty
 * rather than need: they are classed by the box too, so a day when somebody
 * authors an `fs.chmod` on a laptop does not quietly count as server work.
 */
const HOSTED_FAMILIES: ReadonlySet<string> = new Set([
  'service', 'unit', 'fs', 'selinux', 'incident', 'rollback', 'apt',
]);

/**
 * The families that are not WORK: the ticket's own paperwork, the day's
 * machinery, and the signatures.
 *
 * They are skipped when the fix is being read off a path, and a path made of
 * nothing else falls through to the estate. `risk_acceptance` is here on
 * purpose and it is the interesting one: signing for a risk is the price of
 * doing something, not the doing - the tablet ticket signs and then sets the
 * mail up by hand, and it is the second of those that says what the job was.
 */
const PAPERWORK: ReadonlySet<string> = new Set([
  'ticket', 'interruption', 'request', 'reporter', 'change', 'risk_acceptance',
  'invoice', 'timesheet', 'career', 'consumable', 'day', 'boss', 'world',
  'meters', 'presence', 'security',
]);

/** The class of one node of the estate, or nothing this module can class. */
type NodeClass = 'access' | 'device' | 'server';

/**
 * The node kinds that ARE the access surface: a person, their account, the
 * groups and shares and rules that decide what it can reach, and the customer
 * a contract is with.
 */
const ACCESS_NODE_KINDS: ReadonlySet<string> = new Set([
  'account', 'person', 'group', 'share', 'mail_rule', 'customer',
]);

interface Index {
  readonly classes: ReadonlyMap<string, NodeClass>;
}

let INDEX: Index | null = null;

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
 * The estate, classed once.
 *
 * Built lazily and kept, because it walks every shop's construction ops and
 * there is no reason to do that twice - and built from the SETUP rather than
 * from a live graph, because a ticket's kind is a fact about the content and
 * has to answer the same way in a generator that has no world to look at.
 */
function index(): Index {
  if (INDEX !== null) {
    return INDEX;
  }

  const classes = new Map<string, NodeClass>();
  const hosted = new Map<string, string>();

  for (const ops of everySetup()) {
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
      }

      // What a service or unit runs on, and what a drive holds: both answer
      // "which box is this" for a node that is not a box.
      if (op.op === 'addEdge'
        && (op.edge.kind === 'runs_on' || op.edge.kind === 'contains')) {
        const [child, box] = op.edge.kind === 'runs_on'
          ? [op.edge.from, op.edge.to]
          : [op.edge.to, op.edge.from];

        if (!hosted.has(child)) {
          hosted.set(child, box);
        }
      }
    }
  }

  // A hosted thing is whatever its box is, resolved through however many hops
  // the drive puts between a file and the machine holding it.
  for (const child of hosted.keys()) {
    const seen = new Set<string>();
    let at: string | undefined = child;

    while (at !== undefined && !seen.has(at) && classes.get(at) === undefined) {
      seen.add(at);
      at = hosted.get(at);
    }

    const settled = at === undefined ? undefined : classes.get(at);

    if (settled !== undefined) {
      classes.set(child, settled);
    }
  }

  INDEX = { classes };

  return INDEX;
}

/** The family half of an action id: `account.unlock` is `account`. */
function familyOf(action: string): string {
  return action.split('.')[0] ?? '';
}

/** The class of one node, services and files resolved to the box they are on. */
function classOf(node: string): NodeClass | undefined {
  return index().classes.get(node);
}

/**
 * What kind of work a ticket is: the verb its fix takes, on the box it takes it
 * on, and the estate it is about when there is no fix at all.
 *
 * Refuses rather than guesses. A ticket nobody can class is a ticket that would
 * sit outside every ratio in the rung table - it would not break a quota, it
 * would silently not count towards one - and a work mix with a hole in it is
 * exactly the kind of quiet wrongness this codebase spends its refusals on.
 */
export function workKindOf(ticketId: string): WorkKind {
  const known = KINDS.get(ticketId);

  if (known !== undefined) {
    return known;
  }

  const answered = classify(ticketId);
  KINDS.set(ticketId, answered);

  return answered;
}

/**
 * Kept, because the generator asks this of every candidate at every step of
 * every day of every week it tries, and the answer cannot change: a ticket's
 * kind is a fact about content that is compiled into the build.
 */
const KINDS = new Map<string, WorkKind>();

function classify(ticketId: string): WorkKind {
  const ticket = findWorldTicket(ticketId);

  if (ticket === undefined) {
    throw new Error(
      `There is no ticket "${ticketId}" to say what kind of work it is. A `
      + 'week cannot be measured against a mix it cannot classify.',
    );
  }

  // A project task is project work whatever its verbs are, and its verbs say so
  // too: the flag and the `project.` family agree, and the flag is the one the
  // engine acts on, so it is the one read first.
  if (ticket.project !== undefined) {
    return 'project';
  }

  const steps = (ticket.paths[0]?.steps ?? []).filter(
    (step) => !PAPERWORK.has(familyOf(step.action)),
  );
  // The LAST work step, because that is the one that closes it: a path that
  // verifies who it is talking to and then registers the authenticator is an
  // access job, and a path that signs for the risk and then sets the mail up by
  // hand is a device job.
  const fix = steps[steps.length - 1];

  if (fix !== undefined) {
    const family = familyOf(fix.action);

    if (HOSTED_FAMILIES.has(family)) {
      const where = classOf(fix.target);

      if (where !== undefined) {
        return where === 'access' ? 'server' : where;
      }
    }

    const kind = VERB_FAMILIES[family];

    if (kind !== undefined) {
      return kind;
    }

    // A hosted verb whose target this module cannot place, or a family nobody
    // has classed. Both are content that has outgrown this table, and both are
    // said out loud rather than dropped into whichever class is nearest.
    throw new Error(
      `"${ticketId}" closes with "${fix.action}" on "${fix.target}" and nothing `
      + 'here knows what kind of work that is. A verb family the mix cannot '
      + 'class is a ratio that quietly stops counting.',
    );
  }

  // No fix: an alert passed up the tier, or a question answered with a reply.
  // The work is about the estate, and the roster writes the estate primary
  // first.
  for (const node of ticket.nodes) {
    const where = classOf(node);

    if (where !== undefined) {
      return where === 'access' ? 'access' : where;
    }
  }

  throw new Error(
    `"${ticketId}" closes with no fix and names no estate this build can `
    + 'class. Nothing can say what kind of work it is, so nothing should '
    + 'pretend to.',
  );
}

/**
 * The kinds a day script's arrivals are, counted.
 *
 * ARRIVALS ONLY - the inherited pile and the drip - because they are what lands
 * on the desk with a clock on it, and they are the two columns the week's own
 * "this shop deals nothing today" rule already counts. A room post about a
 * ticket is not a second ticket, and counting it would double one arrival and
 * skew every ratio measured off it.
 */
export function mixOfWeek(
  week: readonly {
    readonly inherited: readonly string[];
    readonly drip: readonly { readonly ticketId: string }[];
  }[],
  /**
   * How a ticket is classed, injected for the same reason the generator's
   * pricer is: a fixture week deals tickets the shipped roster has never heard
   * of, and a measurement that could only answer for the shipped roster would
   * make every fixture week unmeasurable.
   */
  kindOf: (ticketId: string) => WorkKind = workKindOf,
): Readonly<Record<WorkKind, number>> {
  const counts: Record<WorkKind, number> = {
    access: 0, device: 0, server: 0, project: 0,
  };

  for (const day of week) {
    for (const id of [
      ...day.inherited,
      ...day.drip.map((slot) => slot.ticketId),
    ]) {
      counts[kindOf(id)] += 1;
    }
  }

  return counts;
}
