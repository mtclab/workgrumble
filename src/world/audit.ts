/**
 * THE SECOND QUEUE: other people's work, and what it costs to disagree with it
 * (E9, 0.36.0 - the SD-senior rung).
 *
 * The rung table's row for the senior service desk says one thing and it is not
 * "harder tickets": a SECOND QUEUE appears, holding work that is already
 * somebody else's. The real job description spells it out - "perform quality
 * checks to ensure that all incidents have been correctly categorised,
 * prioritised and escalated" - and the research's own reading of what that
 * makes mechanically is the design this module is (thread A section 2): the
 * player's clocks keep running while they work somebody else's ticket, and the
 * tension IS the mechanic.
 *
 * WHAT AN AUDIT ITEM IS. A ticket a first-line analyst has already triaged,
 * dealt to the senior for QA with that triage on it. The player can CONFIRM the
 * filing or CORRECT it, and both answers cost:
 *
 *  - correcting costs minutes NOW. It goes through the queue's own triage
 *    controls - the same two dropdowns, the same matrix, the same verb - and
 *    the verb charges the attention tax the whole interruption family is built
 *    on (`REFOCUS_TICKS`, twenty-three minutes), because pulling your head out
 *    of your own work to re-read somebody else's estate is the interruption
 *    Google SRE priced at "a couple of hours of truly productive work" and this
 *    game already prices at twenty-three minutes.
 *  - confirming costs nothing now and comes due LATER, on the delayed-
 *    consequence rails E8 built: a triage nobody corrected keeps the clock the
 *    junior bought it, and when that clock runs out the breach lands on the
 *    desk with the audit decision named on it - the same shape as
 *    `queueJumpFalloutDue` and `socialEngineeringDue`. Every authored filing
 *    UNDER-calls for exactly that reason, and the gate below proves it: a wrong
 *    priority that bought a TIGHTER clock breaches on its own and teaches
 *    nothing about the audit.
 *
 * WRONG IN EXACTLY ONE FINDABLE WAY, and that is a load-time gate rather than
 * an intention. There are three ways to get a triage wrong in this game and
 * every authored item is wrong in one of them, provably, from what is on the
 * player's screen:
 *
 *  - `impact` - the cell's urgency is right and its impact is not. The junior's
 *    arithmetic is fine; their reading of the estate is not, and the estate is
 *    the half a player can check (`trueImpact` walks the same graph the monitor
 *    and the directory draw).
 *  - `matrix` - the cell is right and the priority does not follow from it. The
 *    3x3 table is printed in the triage panel and shipped as `PRIORITY_MATRIX`;
 *    a filing that disagrees with it is wrong by arithmetic alone.
 *  - `beneficiary` - the cell is right, the arithmetic is right, and the VIP
 *    flag was read off whoever TYPED the ticket rather than whoever it is FOR.
 *    This is the shadow-VIP truth the customer-axis research names: VIP lists
 *    cover "executives and their assistants", the flag keys off the
 *    beneficiary, and report quality keys off the requester.
 *
 * `faultOf` grades a filing against the world into exactly those three (or
 * none), `assertAuditItems` refuses any authored item whose declared fault is
 * not the one the grader finds, and both run over a REAL world in the suite.
 * Content truth is absolute here: the wrong answer has to be provably wrong or
 * the whole mechanic is a quiz with the answer key missing.
 *
 * THE KB BEAT. One class of fault repeats, because that is what a class is, and
 * the second time the player corrects it the desk asks them to write it up -
 * KCS's own rule, and the rung's own duty ("manages content in the KM system,
 * authors Knowledge Articles"). Writing it costs the same attention tax; what
 * it buys is that the NEXT instance of the class arrives already triaged
 * correctly, with the article linked on it, because the junior could look it
 * up. That is the research's "your work compounds" mechanic, and it is the one
 * beat in this game where the player's output makes somebody else better at
 * their job.
 *
 * Everything here is a pure read or a table. Nothing dispatches, nothing
 * mutates and nothing touches a clock, which is the shape every settler in this
 * codebase has for the same reason - a replay has to arrive at the same
 * numbers.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { CAUGHT_MINUTES } from './boss';
import { FIELDS } from './fields';
import { REFOCUS_TICKS } from './meters';
import {
  isLevel,
  isPriority,
  type Level,
  priorityFor,
  type Priority,
  trueImpact,
} from './priority';
import { VIP_FORCED_PRIORITY } from './vip';

/* -- what a filing is, and the three ways it goes wrong ------------------- */

/**
 * The three findable faults, and no fourth.
 *
 * They are the three independent things a triage is made of in this game - the
 * estate reading, the table lookup, and whose name the flag was read off - so
 * the list is closed by construction rather than by taste. A fault outside it
 * would be a mistake the player has no surface to check.
 */
export const AUDIT_FAULTS = ['impact', 'matrix', 'beneficiary'] as const;

export type AuditFault = (typeof AUDIT_FAULTS)[number];

export function isAuditFault(value: unknown): value is AuditFault {
  return typeof value === 'string'
    && AUDIT_FAULTS.some((fault) => fault === value);
}

/** How the audit was ruled. Two answers, because there are two verbs. */
export const AUDIT_VERDICTS = {
  confirmed: 'confirmed',
  corrected: 'corrected',
} as const;

export type AuditVerdict = (typeof AUDIT_VERDICTS)[keyof typeof AUDIT_VERDICTS];

export function isAuditVerdict(value: unknown): value is AuditVerdict {
  return value === AUDIT_VERDICTS.confirmed || value === AUDIT_VERDICTS.corrected;
}

/** A triage as somebody filed it: the cell, and the number they wrote down. */
export interface AuditFiling {
  readonly impact: Level;
  readonly urgency: Level;
  /**
   * Written down separately from the cell ON PURPOSE. Everywhere else in this
   * codebase the priority is a consequence of the pair and the engine refuses a
   * third opinion (`MATRIX_GUARD`); here the third opinion is the whole point,
   * because the ITSM tools this world is a parody of all let somebody override
   * the calculated number, and the `matrix` fault is that override used badly.
   */
  readonly priority: Priority;
}

/**
 * The correct triage for a ticket, read off the world rather than authored.
 *
 * The cell is the estate's own answer crossed with the ticket's TRUE urgency
 * (the content's honest reading, which is what the scorecard has always graded
 * a player's triage against), and the priority is the matrix's - unless the
 * ticket carries the VIP flag, in which case it is the forced one, because that
 * is what the shipped business rule does to a flagged ticket and arguing with
 * it gets nobody anywhere.
 */
export function auditTruth(
  graph: ReadOnlyGraphView,
  nodes: readonly string[],
  trueUrgency: Level,
  vip: boolean,
): AuditFiling {
  const impact = trueImpact(graph, nodes);
  const matrix = priorityFor(impact, trueUrgency);

  return {
    impact,
    urgency: trueUrgency,
    priority: vip ? VIP_FORCED_PRIORITY : matrix,
  };
}

/**
 * What is wrong with a filing: one of the three, or nothing.
 *
 * The order of the tests is the order of the questions a person auditing a
 * ticket asks, and each one is exclusive of the others, so a filing wrong in
 * two ways falls out of the bottom as `mixed` rather than being reported as
 * whichever test ran first. `assertAuditItems` refuses `mixed` at load, which
 * is what keeps every authored item findable: an item wrong twice is an item a
 * player cannot be right about.
 */
export function faultOf(
  filed: Readonly<AuditFiling>,
  truth: Readonly<AuditFiling>,
  vip: boolean,
): AuditFault | 'mixed' | null {
  const cellHeld = filed.impact === truth.impact && filed.urgency === truth.urgency;
  const arithmeticHeld = filed.priority === priorityFor(filed.impact, filed.urgency);

  if (cellHeld && filed.priority === truth.priority) {
    return null;
  }

  // The estate misread: the urgency the reporter claimed is taken as filed and
  // the number follows the table, so the ONLY thing that moved is how far the
  // fault reaches - which is the one half of a triage a player can check by
  // walking the world.
  if (!cellHeld
    && filed.urgency === truth.urgency
    && arithmeticHeld
    && !vip) {
    return 'impact';
  }

  // The table ignored: the same cell as the truth, a different number beside it.
  if (cellHeld && !arithmeticHeld) {
    return 'matrix';
  }

  // The flag read off the wrong person: everything about the fault is right,
  // and the ticket is for somebody the list covers.
  if (cellHeld && arithmeticHeld && vip) {
    return 'beneficiary';
  }

  return 'mixed';
}

/**
 * The sentence the bill says about each fault.
 *
 * Content rather than a lookup in the driver, because it is the same claim the
 * audit panel makes and the same claim the grader enforces: the wrong answer
 * was findable, and this is WHICH half to have checked. A bill that said only
 * "you got it wrong" would teach nothing, which is the difference between a
 * consequence and a punishment.
 */
export const AUDIT_FAULT_NOTES: Readonly<Record<AuditFault, string>> = {
  impact: 'The impact was filed as one desk and the estate says otherwise - '
    + 'the walk was there to be done.',
  matrix: 'The cell was right and the number beside it is not the one the '
    + 'matrix makes of it.',
  beneficiary: 'The flag was read off whoever typed the ticket. It keys off '
    + 'whoever the ticket is for.',
};

/* -- the authored items --------------------------------------------------- */

/**
 * The class the KB beat is about, and the article that ends it.
 *
 * One class, named here rather than spelled at four sites, because three
 * different things have to agree about it: the items that belong to it, the
 * prompt that counts them, and the article the write-up produces.
 */
export const AUDIT_CLASS = 'class:the-server-read-as-one-desk';

export const AUDIT_ARTICLE = 'kb/impact-is-the-estate-not-the-fault';

/**
 * WHOSE queue this is.
 *
 * Named here rather than spelled in the driver, because the rung and the
 * content are one decision: these five filings are faults on the probation
 * shop's estate dealt to the one rung whose job is other people's work, and a
 * driver that dealt them to anybody else would be naming reporters that world
 * has never heard of.
 */
export const SENIOR_RUNG = 'sd_senior';

/** How many of a class have to have been ruled before the desk asks for one. */
export const WRITE_UP_AFTER = 2;

export interface AuditItem {
  /** The ticket, which is an ordinary roster ticket with a triage already on it. */
  readonly ticket: string;
  /** Whose filing it is. A name and not a node - see `FIELDS.auditOf`. */
  readonly junior: string;
  /** Which day of the week it lands on, and at what minute of the shift. */
  readonly day: number;
  readonly minute: number;
  /** What was filed, and what is wrong with it. */
  readonly filed: AuditFiling;
  readonly fault: AuditFault | null;
  /** The repeated class this belongs to, for the KB beat. */
  readonly auditClass?: string;
  /**
   * Who the ticket is FOR, where that is not who raised it, and whether that
   * person is on the VIP list. The pair is what the spawn stamps: the line the
   * queue prints, and the flag the shipped VIP rule then acts on.
   */
  readonly beneficiary?: string;
  readonly vip?: boolean;
  /**
   * The filing this item arrives with once the player has written the class up.
   *
   * The compounding half of the KB beat, and the only place an item is not one
   * fixed filing: with the article on the shelf the junior looks it up and gets
   * it right, so the audit is a confirm rather than a correction and the
   * article is already linked on the ticket. Absent on every item that is not
   * the class's last instance.
   */
  readonly whenAuthored?: {
    readonly filed: AuditFiling;
    readonly fault: null;
    readonly kbRef: string;
  };
}

/**
 * The week's audit queue, in the order it lands.
 *
 * Five items over four days, which is the shape the research's own work-mix
 * puts on this rung - "~20% other people's tickets" against a week that is
 * still mostly your own - rather than a second full queue. Three of them are
 * the three faults, one each; the other two are the second and third instances
 * of the class the KB beat is about.
 *
 * WHY THESE FIVE TICKETS. Every one is a fault on estate that already exists,
 * and each was chosen because the world gives a checkable answer about it: the
 * print server carries eleven people, which is the difference between a desk
 * and a floor, and a workstation's own spooler carries one. That contrast IS
 * the class - the junior files "a spooler has stopped" the same way whichever
 * box it stopped on - and it is the one lesson this rung has that the junior
 * rung structurally cannot teach, because a junior has nobody else's triage to
 * read.
 */
export const AUDIT_ITEMS: readonly AuditItem[] = Object.freeze([
  {
    // The class, instance one: the whole floor, filed as the one person who
    // happened to ring about it.
    ticket: 'ticket:audit-print-task',
    junior: 'Callum Vance (first line)',
    day: 1,
    minute: 620,
    filed: { impact: 1, urgency: 2, priority: 4 },
    fault: 'impact',
    auditClass: AUDIT_CLASS,
  },
  {
    // The table ignored. One desk, genuinely - and the number underneath it is
    // not the one the nine cells make of it.
    ticket: 'ticket:audit-marketing-spooler',
    junior: 'Callum Vance (first line)',
    day: 1,
    minute: 795,
    filed: { impact: 1, urgency: 3, priority: 4 },
    fault: 'matrix',
  },
  {
    // The flag read off the person who typed it.
    ticket: 'ticket:audit-lead-locked',
    junior: 'Sasha Bright (first line)',
    day: 3,
    minute: 605,
    filed: { impact: 1, urgency: 2, priority: 4 },
    fault: 'beneficiary',
    beneficiary: 'Desmond Frisk, Service Delivery Lead',
    vip: true,
  },
  {
    // The class, instance two. The same misreading on the same box, which is
    // what makes it a class and what makes the desk ask for the article.
    ticket: 'ticket:audit-print-workstation',
    junior: 'Callum Vance (first line)',
    day: 3,
    minute: 640,
    filed: { impact: 1, urgency: 2, priority: 4 },
    fault: 'impact',
    auditClass: AUDIT_CLASS,
  },
  {
    // The class, instance three - and the one the article changes.
    ticket: 'ticket:audit-print-browser',
    junior: 'Callum Vance (first line)',
    // FRIDAY, and the spread of all five is a BUDGET decision rather than a
    // taste one - measured against the drawn week rather than chosen, and
    // re-measured every time the pool changes shape.
    //
    // The senior's week (Workgrumble, arc week two) is drawn at loads 1/3/3/4/2
    // with 14/19/75/17/24 minutes of slack in those bands. Two items fit the
    // Monday, which is the lightest day and has room to move up a band without
    // passing the Tuesday; two fit the Wednesday inside its own band; the
    // Thursday takes NONE, because it is the heaviest day in the game and one
    // item on top of it prices past the top band, which the overlay refuses
    // outright; the Tuesday takes none either, because a single item there
    // crosses into band four and the Wednesday behind it would then be a day
    // going backwards before Thursday, which the ramp forbids. That leaves the
    // Friday, where the ramp does not bind - and the class's last instance is
    // the one that belongs there, because its only hard requirement is landing
    // AFTER the prompt is earned on the Wednesday.
    //
    // None of that is a promise this comment keeps: `audit.test.ts` prices the
    // shipped week and refuses a spread that has drifted.
    day: 5,
    minute: 640,
    filed: { impact: 1, urgency: 2, priority: 4 },
    fault: 'impact',
    auditClass: AUDIT_CLASS,
    whenAuthored: {
      filed: { impact: 3, urgency: 2, priority: 2 },
      fault: null,
      kbRef: AUDIT_ARTICLE,
    },
  },
]);

/** Every ticket the audit queue deals, for the reservations and the gates. */
export const AUDIT_TICKET_IDS: readonly string[] = Object.freeze(
  AUDIT_ITEMS.map((item) => item.ticket),
);

export function auditItemFor(ticket: string): AuditItem | undefined {
  return AUDIT_ITEMS.find((item) => item.ticket === ticket);
}

/** The items a given day of the week deals, in arrival order. */
export function auditItemsOn(day: number): readonly AuditItem[] {
  return AUDIT_ITEMS
    .filter((item) => item.day === day)
    .slice()
    .sort((left, right) => left.minute - right.minute);
}

/**
 * The filing an item actually arrives with, given whether the class has been
 * written up. One branch, and only the class's last instance has one.
 */
export function filingOf(
  item: Readonly<AuditItem>,
  authored: boolean,
): {
  readonly filed: AuditFiling;
  readonly fault: AuditFault | null;
  readonly kbRef: string | null;
} {
  return authored && item.whenAuthored !== undefined
    ? {
      filed: item.whenAuthored.filed,
      fault: item.whenAuthored.fault,
      kbRef: item.whenAuthored.kbRef,
    }
    : { filed: item.filed, fault: item.fault, kbRef: null };
}

/* -- what it costs the day ------------------------------------------------ */

/**
 * What one audit item is expected to take off the shift, in minutes.
 *
 * BORROWED, like every figure in `load.ts`, and for the same reason: an
 * invented number would make the day's budget a thing nobody could argue with.
 * `CAUGHT_MINUTES` (10) is what the worst-schedule auditor already calls the
 * least clear air a piece of work needs before the day has really dealt it -
 * here it is reading somebody else's ticket, walking the estate and deciding.
 * `REFOCUS_TICKS` (23) is the attention tax the correction actually charges,
 * and it is in the price because the budget prices the HEAVIER branch, which is
 * the same worst-case discipline `dealtOrRaised` uses for a walk-up that might
 * become a ticket.
 *
 * It is NOT multiplied by the partition factor, for the reason the interruption
 * column is not: the context switch is already in the number, and charging it
 * again through the count term would be charging the same switch twice.
 */
export const AUDIT_MINUTES = CAUGHT_MINUTES + REFOCUS_TICKS;

/* -- the reads the world and the driver make ------------------------------ */

/** Every audit item on the board this minute, ruled or not. */
export function auditTickets(graph: ReadOnlyGraphView): readonly string[] {
  return graph.nodesOfKind('ticket')
    .filter((node) => typeof node.fields[FIELDS.auditOf] === 'string')
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));
}

/** Whether this ticket is somebody else's filing rather than one of yours. */
export function isAuditTicket(
  graph: ReadOnlyGraphView,
  ticket: string,
): boolean {
  return typeof graph.getField(ticket, FIELDS.auditOf) === 'string';
}

/** The filing on a ticket, read back off the node the deal stamped. */
export function filedOn(
  graph: ReadOnlyGraphView,
  ticket: string,
): AuditFiling | null {
  const impact = graph.getField(ticket, FIELDS.impact);
  const urgency = graph.getField(ticket, FIELDS.urgency);
  const priority = graph.getField(ticket, FIELDS.priority);

  return isLevel(impact) && isLevel(urgency) && isPriority(priority)
    ? { impact, urgency, priority }
    : null;
}

export function verdictOn(
  graph: ReadOnlyGraphView,
  ticket: string,
): AuditVerdict | null {
  const verdict = graph.getField(ticket, FIELDS.auditVerdict);

  return isAuditVerdict(verdict) ? verdict : null;
}

/**
 * Every confirmed-wrong triage whose bill has come due, and not yet been paid.
 *
 * The four clauses are the mechanic written as a query: it is somebody else's
 * filing, the player SIGNED IT OFF, the filing was wrong (the fault stamped at
 * the deal, so the settler and the content cannot disagree), and the clock the
 * wrong filing bought has run out. It fires on the BREACH rather than on the
 * confirmation, for the reason `queueJumpFalloutDue` does: a wrong priority
 * nothing ever tested cost nobody anything, and a consequence that arrives
 * before the omission has had a chance to matter is a punishment for the click.
 *
 * Inert on every other rung and in every other world, because nothing but the
 * audit deal writes `audit_of` on a ticket.
 */
export function auditFalloutDue(
  graph: ReadOnlyGraphView,
): readonly string[] {
  return auditTickets(graph).filter((ticket) => {
    if (verdictOn(graph, ticket) !== AUDIT_VERDICTS.confirmed) {
      return false;
    }

    if (!isAuditFault(graph.getField(ticket, FIELDS.auditFault))) {
      return false;
    }

    if (graph.getField(ticket, FIELDS.breached) !== true) {
      return false;
    }

    return typeof graph.getField(ticket, FIELDS.auditFalloutAt) !== 'number';
  });
}

/**
 * The class the desk is now asking for an article about, or nothing.
 *
 * Both conditions are about the BOARD rather than about the content tables:
 * enough of the class have been ruled on to make it a class, and nobody has
 * written it up. KCS's own rule is that you write it the second time you solve
 * it, which is where the threshold comes from - and reading it off the board
 * rather than off a counter is what makes it survive a save with no second
 * record of it to keep true.
 */
export function writeUpDue(
  graph: ReadOnlyGraphView,
  actor: string,
): string | null {
  if (typeof graph.getField(actor, FIELDS.kbAuthored) === 'string') {
    return null;
  }

  const ruled = auditTickets(graph).filter(
    (ticket) => graph.getField(ticket, FIELDS.auditClass) === AUDIT_CLASS
      && verdictOn(graph, ticket) !== null,
  );

  return ruled.length >= WRITE_UP_AFTER ? AUDIT_CLASS : null;
}

/** Whether the player has the class written up, which the next deal asks. */
export function classAuthored(
  graph: ReadOnlyGraphView,
  actor: string,
): boolean {
  return graph.getField(actor, FIELDS.kbAuthored) === AUDIT_CLASS;
}

/* -- retained ownership (E9, 0.36.0) -------------------------------------- */

/**
 * How long second line take to come back on a ticket you kept.
 *
 * OVERSEER TUNING KNOB, and ninety minutes is chosen against the one thing it
 * has to be true relative to: the SLA ladder. A P2 has two hours and a P3 has
 * four, so a retained escalation comes back inside a P3's budget and NOT
 * reliably inside a P2's - which is the whole tension of the rung. Escalating
 * a P2 and keeping it means watching a clock you no longer control, and that
 * is what "yours until the vendor answers" costs.
 */
export const VENDOR_REPLY_MINUTES = 90;

/**
 * Every retained escalation second line have now answered.
 *
 * Two clauses: it was sent and kept (`retained_at`), and long enough has
 * passed. Nothing about the verdict, because retained ownership is not an audit
 * thing - it is the rung's other shape break, and it applies to your own queue
 * as much as to somebody else's.
 *
 * Inert everywhere nothing is retained, which is every rung but the senior's,
 * because nothing else writes the stamp.
 */
export function vendorRepliesDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  return graph.nodesOfKind('ticket')
    .filter((node) => {
      const sent = node.fields[FIELDS.retainedAt];

      return typeof sent === 'number'
        && node.fields[FIELDS.escalated] !== true
        && now - sent >= VENDOR_REPLY_MINUTES;
    })
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));
}

/* -- the load-time gate --------------------------------------------------- */

/** The shape this gate needs of a ticket: its estate and its honest urgency. */
export interface AuditSubject {
  readonly nodes: readonly string[];
  readonly true_urgency: Level;
}

/**
 * Every authored item graded against a real world, and refused where the claim
 * and the grader disagree.
 *
 * This is the content-truth gate and it is the reason the mechanic can be
 * played at all: an item whose declared fault is not the one the world supports
 * is an audit with no right answer, and the player would be marked wrong for
 * reading the estate correctly. It refuses four things, all of them silent
 * otherwise - an item naming a ticket nobody wrote, a declared fault the world
 * does not produce, a filing wrong in two ways at once, and an item that claims
 * a fault while being perfectly correct.
 *
 * It takes the world and the lookup as parameters rather than reaching for
 * them, so it can be run against the shop's real estate in the suite without
 * this module importing the roster it is content for.
 */
export function assertAuditItems(
  graph: ReadOnlyGraphView,
  lookup: (id: string) => AuditSubject | undefined,
  items: readonly AuditItem[] = AUDIT_ITEMS,
): readonly AuditItem[] {
  for (const item of items) {
    const subject = lookup(item.ticket);

    if (subject === undefined) {
      throw new Error(
        `The audit queue deals "${item.ticket}" and nobody wrote that ticket. `
        + 'An audit of a filing on a ticket that does not exist is a queue '
        + 'with nothing in it.',
      );
    }

    const vip = item.vip === true;

    for (const authored of [false, true]) {
      const { filed, fault } = filingOf(item, authored);
      const truth = auditTruth(graph, subject.nodes, subject.true_urgency, vip);
      const found = faultOf(filed, truth, vip);

      if (found === 'mixed') {
        throw new Error(
          `"${item.ticket}" is filed wrong in more than one way at once. An `
          + 'audit item has to be wrong in exactly one findable way, or the '
          + 'player cannot be right about it.',
        );
      }

      if (found !== fault) {
        throw new Error(
          `"${item.ticket}" is authored as ${
            fault === null ? 'a correct filing' : `a "${fault}" fault`
          } and the world grades it as ${
            found === null ? 'correct' : `a "${found}" fault`
          }. The world is the half that can be checked, so the item follows it.`,
        );
      }
    }
  }

  return Object.freeze([...items]);
}
