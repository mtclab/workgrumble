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
 *
 * THE WALK ITSELF IS NOT HERE ANY MORE (0.39.0). Classing a node means walking
 * every shop's construction ops to find the box behind it, and churn asks the
 * SECOND question of exactly the same walk - whose estate that box is on. Both
 * answers now come off one pass in `estate-index.ts`, because two walks would
 * be two answers to "which box is this", free to drift the first time a node
 * kind grew a new way of being hosted.
 */

import { nodeClassOf } from './estate-index';
import { findWorldTicket } from './tickets';
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
  // The out-of-scope answers (E9, 0.38.0), and they belong here for a reason
  // that is not "they are admin". Two of the three are plainly paperwork - a
  // refusal and an estimate - and the third says only that the work was done,
  // never what it was. What KIND of work an ask is is decided by what it would
  // touch: a floor of desks at a law firm is device work and a data migration
  // off a practice server is server work, and both of those are the ticket's
  // own estate, which is where these fall through to.
  'scope',
]);

/** The family half of an action id: `account.unlock` is `account`. */
function familyOf(action: string): string {
  return action.split('.')[0] ?? '';
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
      const where = nodeClassOf(fix.target);

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
    const where = nodeClassOf(node);

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
