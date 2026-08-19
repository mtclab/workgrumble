/**
 * The day driver: the one place real time turns into simulation time.
 *
 * The clock in the engine counts whole ticks and nothing else - no speed, no
 * pause, no wall clock - because that is what makes a day replayable. Speed
 * and pause live here instead, on this side of the boundary, where they are a
 * property of how fast the player wants to watch rather than of the world.
 *
 * It also owns the shape of the day around those ticks: starting the shift,
 * dropping the scheduled arrivals in as their minute comes round, ending the
 * day at 17:00, and taking the checkpoint that lets the dispatch log start
 * again each morning.
 */

import type {
  DispatchResult,
  EngineApi,
  NodeId,
  ReadOnlyGraphNode,
  TicketState,
} from '../engine-api';
import {
  AUDIT_ACTIONS,
  CHANGE_ACTIONS,
  DAY_ACTIONS,
  HELPDESK_ACTIONS,
  INCIDENT_ACTIONS,
  INVOICE_ACTIONS,
  INVOICE_LADDER_PARAM,
  PROJECT_ACTIONS,
  PROJECT_ANSWERED_PARAM,
  PROJECT_CIRCUIT_PARAM,
  PROJECT_FROM_PARAM,
  PROJECT_PARAM,
  PROJECT_REPORT_PARAM,
  REQUEST_ACTIONS,
  SELINUX_ACTIONS,
  SOFTWARE_ACTIONS,
  SYSTEMD_ACTIONS,
  TIMESHEET_ACTIONS,
  WORLD_ACTIONS,
} from '../world/actions';
import {
  type LinkedRequest,
  REQUEST_CONVERT_MINUTES,
  type RequestKind,
  resolutionLine,
  resolutionsBy,
} from '../world/requests';
import {
  quoteAnswersDue,
  SCOPE_OUTCOMES,
  SCOPE_QUOTE_MINUTES,
  scopeRecurrencesDue,
} from '../world/out-of-scope';
import {
  type BossPing,
  type BossVisit,
  buildPatrolSchedule,
  CAUGHT_MINUTES,
  caughtBy,
  EMPTIES_SUSPICION_BUMP,
  emptiesNoticed,
  type PatrolPhase,
  type PatrolSchedule,
  patrolPhase,
  PING_STRESS,
  pingsBetween,
  TELEGRAPH_TICKS,
  ticksToArrival,
  visitsArrivingBetween,
  visitsTelegraphingBetween,
} from '../world/boss';
import {
  type AfterHoursArrival,
  afterHoursArrivals,
} from '../world/after-hours';
import {
  crashStartsAt,
  crashStress,
  DRINK_PRICE_PENCE,
  type DrinkState,
  drinkState,
  nextTolerance,
  NO_RUN,
} from '../world/consumables';
import {
  arrivalsBetween,
  buildDaySchedule,
  clockRuns,
  tickAtMinute,
  type DaySchedule,
  type DayState,
  dayForTick,
  dayLedger,
  dayOpensTick,
  daySlip,
  dueTransition,
  type PaySlip,
  isDayState,
  isLunchtime,
  shiftStartTick,
  type TickWindow,
} from '../world/day';
import { serviceMinutesBetween } from '../world/hours';
import { dayLoad } from '../world/load';
import {
  type ConductReading,
  conductLine,
  conductSummary,
  readConductFile,
} from '../world/conduct';
import { socialEngineeringDue, staleLogonsDue } from '../world/fallout';
import { legendaryRevertDue } from '../world/legendary';
import { OVERRIDE_RISK_ACCEPTANCE, overrideFalloutDue } from '../world/override';
import { raciComplaintDue, raciPeerOf } from '../world/raci';
import { recertFollowUpDue } from '../world/recert';
import {
  selinuxAuditDue,
  selinuxDenying,
  selinuxNodeIds,
  selinuxRelabelSetup,
} from '../world/selinux';
import { queueJumpFalloutDue } from '../world/vip';
import { type Rung, rungFor, utilisationTargetFor } from '../world/titles';
import {
  AUDIT_FAULT_NOTES,
  type AuditFault,
  auditFalloutDue,
  auditItemsOn,
  classAuthored,
  filingOf,
  SENIOR_RUNG,
  vendorRepliesDue,
  writeUpDue,
} from '../world/audit';
import {
  ARTICLE_PARAM,
  BENEFICIARY_PARAM,
  CLASS_PARAM,
  FAULT_PARAM,
  JUNIOR_PARAM,
} from '../world/actions/audit';
import { findIncident } from '../world/incidents';
import { findOnboarding } from '../world/onboarding';
import { postmortemFor } from '../world/postmortem';
import {
  arrivalStress,
  buildInterruptionSchedule,
  declineWithdrawn,
  dodgesUnderDnd,
  INTERRUPTION_SOURCES,
  type InterruptionSource,
  type InterruptionEntry,
  type InterruptionLedger,
  type InterruptionPlan,
  type InterruptionSchedule,
  isBenign,
  placeInterruptions,
} from '../world/interruptions';
import { matrixSummary, poolStanding } from '../world/pool';
import {
  AWAY_NOTICED_REPUTATION,
  DND_WORKING_TICKS,
  type DndBeatReading,
  dndBeat,
  dndEvidence,
  type Presence,
  presenceCode,
  readPresence,
} from '../world/presence';
import {
  beatAt,
  EMPLOYER_ARC,
  type EmployerArc,
  type PressureBeat,
  type PressureReading,
  type PressureSeason,
  PROBATION_WEEK,
  pressureSummary,
  seasonAt,
  telegraph,
} from '../world/pressure';
import { visibleMail } from '../world/mail';
import {
  caughtScene,
  DND_CAUGHT_SCENE,
  GENERIC_CAUGHT_SCENE,
  INSTALL_CAUGHT_KEY,
  INSTALL_CAUGHT_SCENE,
  PRESENCE_CAUGHT_KEY,
  RUDE_CAUGHT_KEY,
  RUDE_CAUGHT_SCENE,
} from '../world/scenes';
import {
  type InstallAuditReading,
  type InstallRecord,
  installAuditBeat,
  unspokenInstalls,
} from '../world/software';
import { type InstallPolicy } from '../world/company';
import { CHANNELS, type ChannelDef, type ChannelMessage } from '../world/channels';
import { channelFeedThrough } from '../world/week';
import {
  afterHoursOn,
  type DayScript,
  dayPlan,
  dayScript,
  directMessagesOn,
  findLinkedRequest,
  linkedRequestsThrough,
  incidentsOn,
  interruptionPlanFor,
  isReviewDay,
  onCallOn,
  WEEK_DAYS,
  onboardingsOn,
  isReviewOutcome,
  isWeekDay,
  noHelloOn,
  patrolSeedFor,
  type ReviewOutcome,
  REVIEW_PASS_PERFORMANCE,
  reviewOutcomeFor,
  reviewTick,
  WEEK,
  type WeekScorecard,
  weekScorecard,
  walkUpsOn,
  weekStanding,
  weekWorkThrough,
} from '../world/week';
import {
  formatPageTime,
  isOnCall,
  type OnCallOutcome,
  type OnCallPageArrival,
  ON_CALL_OUTCOMES,
  pagedAtMinute,
  pageKind,
  selfClearDelayMinutes,
  settledLine,
  severityLabel,
} from '../world/on-call';
import {
  stillTyping,
  typingLine,
  typingMinutesLeft,
} from '../world/no-hello';
import {
  type AuditSource,
  auditSourceOf,
  FIELDS,
  isSystemsEngineer,
  type PlayerTier,
  playerTierOf,
  SYSTEMD_STATES,
} from '../world/fields';
import {
  boxOfUnit,
  breakGlassAbuseLines,
  breakGlassLegitLines,
  hasActiveIncident,
} from '../world/change-control';
import {
  changeRequestAuthorises,
  changeRequestConsult,
  planChangeRequestFiling,
} from '../world/change-request';
import { planCoordination } from '../world/coordination';
import { seedForAttempt } from '../world/session';
import { ARDEN_EDGE_PROJECT, MSP_IDS } from '../world/msp-company';
import {
  ARDEN_EDGE_ESTATE,
  ardenEdgeKickoffSetup,
  type ProjectPhase,
  PROJECT_DAYS,
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  projectBoardLines,
  projectClockLabel,
  projectRules,
  projectStatus,
  type ProjectStatus,
  ruleIsKnown,
  ruleIsMigrated,
  screamTestDue,
} from '../world/project';
import {
  ARDEN_EDGE_TASKS,
  PROJECT_KICKOFF_TICKETS,
} from '../world/tickets/project';
import {
  breachWeightOf,
  isMeterTick,
  meterDeltas,
  type MeterState,
  movesAnything,
} from '../world/meters';
import { contractStampsDue } from '../world/cadence';
import {
  isActiveWork,
  isUnresolved,
  needsResponse,
  ticketClocks,
} from '../world/sla';
import {
  bounceLandsAt,
  cascadeComment,
  cascadesDue,
  countsAsWork,
  findWorldTicket,
  followUpTo,
  HANDOFF_BOUNCE,
  resolveCredit,
  spawnWorldTicket,
  ticketNodes,
  ticketProjectOf,
  ticketTitle,
  triedFromTouches,
  withTouch,
} from '../world/tickets';
import { customerIdForTicketNodes, customerName } from '../world/customers';
import {
  breakdownLines,
  type DeliveredRung,
  deliveredRungs,
  formerClients,
  INVOICE_RUNG_LABELS,
  type InvoiceRung,
  invoiceContact,
  invoiceLadderDue,
  type InvoiceRecords,
  invoiceRecords,
  type InvoiceThread,
  invoiceThreads,
  type LadderStep,
  rungDelivered,
  rungForScrutiny,
  scrutinyByCustomer,
  withDeliveredRung,
} from '../world/invoice';
import {
  answeredBeats,
  beatKey,
  honestRagFor,
  type ProjectRag,
  type StatusReport,
  reportsFrom,
  watermelonDue,
  type WatermelonDue,
  watermelonLines,
  watermelonReadout,
  withAnsweredBeat,
  withReport,
} from '../world/watermelon';
import {
  attributionFor,
  attributionSource,
  claimsFrom,
  type ClaimDetail,
  deriveTimesheet,
  lineAt,
  type SegmentKind,
  type SegmentRef,
  rebucketSource,
  segmentsFrom,
  type Timesheet,
  timesheetSheet,
  type TimesheetClaim,
  type TimesheetTruth,
  utilisationOf,
  type UtilisationReading,
  utilisationReviewLine,
  type WorkResolver,
  withClaim,
  withSegment,
  witnessesOf,
} from '../world/timesheet';

/** Real milliseconds one simulated minute takes at normal speed. */
export const TICK_INTERVAL_MS = 1_000;

/** How often the driver is asked to convert. Shorter than a tick so a faster
 * clock is a faster clock rather than a burst once a second. */
export const DRIVER_INTERVAL_MS = 250;

/**
 * What the three verbs answer when nothing is on the screen to answer about.
 *
 * A refusal rather than a throw, because the buttons that reach them live in a
 * window that can outlive the call it was opened for: a player still looking at
 * a conversation that ended a minute ago is a normal thing to be, and it is not
 * a reason to take the tab down.
 */
export const NOTHING_RINGING = 'Nothing is interrupting you. Whatever this '
  + 'was about, it has stopped being about it.';

/**
 * What the world says to anything the player tries to DO while a block owns
 * the screen.
 *
 * It is a refusal from the driver rather than a disabled button, and that is
 * the whole point of it. Making the desk unreachable with pointer-events was
 * making it unreachable with a MOUSE: a terminal that still had the keyboard
 * when the meeting started would take a command and Enter would still submit
 * it, so the half hour nobody can work through was a half hour anybody could
 * work through as long as they did not click anything. A rule that only holds
 * for one input device is a rule the product does not have.
 */
export const IN_A_MEETING_REASON = 'You are in a meeting. Not at the desk, '
  + 'not near the desk, and not in a position to do anything about any of it '
  + 'until the room empties - which is the entire cost of the half hour and '
  + 'is why everybody dreads it.';

/**
 * And what it says while the workstation is having its own morning.
 *
 * The same seam and the same rule - one sentence for everything the desk can
 * be asked to do while something else owns it - because the alternative is a
 * mechanic that holds for the mouse and not for the keyboard. The desk is
 * gone; the Start menu, the clock and the pause button are not, which is
 * 0.3.0's rule about a meeting taking the desk rather than the machine.
 */
export const INSTALLING_UPDATES_REASON = 'The workstation is installing '
  + 'updates. It said so. It is not sorry.';

/**
 * The sources that take the DESK rather than merely the attention, and the
 * sentence each of them refuses in.
 *
 * One table rather than a switch, because three different places have to agree
 * about it: the driver, which refuses every verb aimed at the desk; the shell,
 * which must not put a queued window up in front of a takeover; and the
 * harnesses, which wait a block out the way a person does. A meeting is a room
 * you are not at your desk during and a workstation is a desk that is not
 * there, so they refuse in different words - and a ringing phone is
 * deliberately in neither, because being on the phone has never been a defence
 * for anything.
 */
export const DESK_HELD_REASONS: Readonly<
  Partial<Record<InterruptionSource, string>>
> = {
  meeting: IN_A_MEETING_REASON,
  machine: INSTALLING_UPDATES_REASON,
};

/** What the desk answers with while this source holds it, or null. */
export function deskHeldReason(
  source: InterruptionSource | undefined,
): string | null {
  return source === undefined ? null : DESK_HELD_REASONS[source] ?? null;
}

/** Whether this source takes the desk at all. */
export function holdsTheDesk(source: InterruptionSource | undefined): boolean {
  return deskHeldReason(source) !== null;
}

/**
 * Which window an interruption is drawn in.
 *
 * Three sources, three surfaces, and they are genuinely different things: a
 * person on a phone, a room with people in it, and a machine that has decided.
 * It is a function rather than a conditional at each call site because the two
 * call sites are "open it" and "close it", and a window opened by one rule and
 * closed by another is a window left standing on the desk after the thing it
 * was about has finished - which is precisely the failure this exists to make
 * impossible.
 *
 * Every one of them is a screen the DAY opens and the DAY closes. None of them
 * is desk furniture: they have no desktop icon, they are not in the window
 * list a minute after the thing they were about ended, and the player never
 * asks for one.
 */
export function windowFor(source: InterruptionSource): string {
  switch (source) {
    case 'meeting':
      return 'meeting';
    case 'machine':
      return 'reboot';
    default:
      return 'call';
  }
}

/** The windows the day puts up for an interruption, and takes away again. */
export const TAKEOVER_WINDOWS: readonly string[] = Object.freeze([
  ...new Set(INTERRUPTION_SOURCES.map((source) => windowFor(source))),
]);

export const SPEEDS = [1, 2, 4] as const;

export type Speed = (typeof SPEEDS)[number];

export function isSpeed(value: unknown): value is Speed {
  return SPEEDS.some((speed) => speed === value);
}

/**
 * The speed the day drops to when something synchronous lands on it.
 *
 * x1 rather than a pause, because the thing that landed is a thing that is
 * HAPPENING: a phone rings for the minutes its row says whether or not
 * anybody is watching, a meeting is half an hour of the shift, and every
 * clock in this game runs through both. Stopping the world would be a
 * different mechanic and a kinder one than the game is about.
 */
export const EVENT_SPEED: Speed = 1;

/**
 * Whether an interruption of this source drops the clock when it ARRIVES.
 *
 * At x4 a six-minute ring window is a second and a half of real time, which is
 * not long enough for three buttons to be a choice - so the family of things
 * that are a CHOICE, or that simply take the screen, hand the player back
 * seconds they can use.
 *
 * Derived from the two families the shell already names rather than from a
 * second list of sources, because a second list is a list that can disagree:
 * `holdsTheDesk` is the meeting and the workstation, and `windowFor` is which
 * screen everything else is drawn on. Every source in this world is one or the
 * other, which is the correct answer rather than a coincidence - a source
 * nobody has to decide about is a source that does not interrupt anybody.
 *
 * What is NOT in it is the grace between a spent postpone and the arrival it
 * bought: those minutes are the player's desk time, paid for deliberately, and
 * they keep whatever speed the player chose. Nothing arrives during them, so
 * the exemption is a property of firing on the arrival EDGE rather than a case
 * this function has to carry - and the test that pins it is the proof.
 */
export function slowsTheClock(
  source: InterruptionSource | undefined,
): boolean {
  return source !== undefined
    && (holdsTheDesk(source) || windowFor(source) === 'call');
}

export interface ElapsedTicks {
  readonly ticks: number;
  /** Real time that did not add up to a whole tick yet. */
  readonly carriedMs: number;
}

/**
 * How many whole ticks a stretch of real time buys, and what is left over.
 *
 * The remainder is kept rather than dropped: throwing away 750ms four times a
 * second is a clock that runs slow, and at x4 it is a clock that runs at x3.
 */
export function ticksFromElapsed(
  elapsedMs: number,
  speed: number,
  carriedMs: number,
): ElapsedTicks {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new TypeError('Elapsed real time must be a non-negative number.');
  }

  if (!isSpeed(speed)) {
    throw new TypeError('The clock runs at x1, x2 or x4.');
  }

  if (!Number.isFinite(carriedMs) || carriedMs < 0) {
    throw new TypeError('Carried real time must be a non-negative number.');
  }

  const total = carriedMs + elapsedMs * speed;

  return {
    ticks: Math.floor(total / TICK_INTERVAL_MS),
    carriedMs: total % TICK_INTERVAL_MS,
  };
}

/** Where the lead is, as the taskbar needs to know it. */
export interface BossView {
  readonly phase: PatrolPhase;
  /** Minutes left to do something about it, while there are any. */
  readonly ticksToArrival: number | null;
}

/**
 * What is currently taking the screen off the player, as the two windows need
 * to know it.
 *
 * Every field is derived - from the day's seeded schedule and from the three
 * lists the world keeps of what was decided - and nothing about it is
 * remembered here. That is the whole reason a save taken mid-call restores
 * mid-call and a save taken mid-meeting restores mid-meeting: occupancy is
 * `f(schedule, world, tick)`, so there is nothing to save and nothing to get
 * out of step.
 */
export interface InterruptionView {
  readonly entry: InterruptionEntry;
  /** Minutes since it started, which is what a meeting is read by. */
  readonly minutesIn: number;
  /** Whether this is a later arrival, which is nobody's to decline. */
  readonly callback: boolean;
  /**
   * How many pushes are left in it, which is what an arrival has to be able to
   * say out loud: three, then two, then one, then nothing.
   *
   * Derived from the entry's authored budget and the ledger the world keeps,
   * so it is the same number on both sides of a save and there is nothing here
   * for a driver to get out of step with.
   */
  readonly postponesLeft: number;
  /** Whether the player has picked it up and the conversation is running. */
  readonly answered: boolean;
  /**
   * Whether it is about the work in hand RIGHT NOW - which is the cost model,
   * and which is a live question rather than a property of the row.
   */
  readonly benign: boolean;
  /** The ticket the touch log says the player is on, or nothing. */
  readonly ticketInHand: string | null;
}

/**
 * Somebody mid-greeting: they have said hello, they have not said what they
 * want, and the dots are going.
 *
 * Every field is derived from the week's table and the clock, so there is
 * nothing here to save and nothing to get out of step across a load. It is
 * about ONE person, because a window shows one conversation and a view of
 * "everybody currently typing" would be a list the chat panel had to search.
 */
export interface TypingView {
  readonly speaker: NodeId;
  /** The minute the greeting landed. */
  readonly landedAt: number;
  /** How long they take altogether, which is the week's number. */
  readonly typingMinutes: number;
  readonly minutesWaited: number;
  /** And how many are left, which is what the window says out loud. */
  readonly minutesLeft: number;
  /** What the indicator reads this minute, blank frames included. */
  readonly line: string;
}

/**
 * A workstation that has been pushed back, before it comes round again.
 *
 * It exists for exactly one surface and is deliberately narrow: the minutes
 * between the push and the return are the minutes the player BOUGHT, something
 * has to say how many are left, and it cannot be `interruption()` - that
 * answers what owns the screen NOW, and the whole point of a spent postpone is
 * that nothing does.
 *
 * There is no flag here for "has this been pushed", because an entry nobody
 * has pushed is not one of these at all: `pendingRestart` filters before it
 * selects, so an unmet call standing between now and the reboot cannot become
 * the answer and then be thrown away by a caller.
 *
 * Every field is derived from the day's schedule and the world's own ledger,
 * so it is the same answer on both sides of a save and there is nothing here
 * for a driver to get out of step with.
 */
export interface UpcomingInterruption {
  readonly entry: InterruptionEntry;
  /** Minutes until it takes the screen. Always one or more. */
  readonly ticksAway: number;
  /** How many pushes are left in it, which is what the countdown says. */
  readonly postponesLeft: number;
}

/**
 * One phone that did not ring, as the world recorded it.
 *
 * The entry is the AUTHORED row - the caller, the subject, the ticket it was
 * about - and the tick is the minute the dot sent it away, which is the only
 * thing that was not already content. `gaveUp` is the far end of the same
 * record: an entry that ran out of day and went into the missed list without
 * ever ringing, which is the one case where a slide is the last thing that
 * happened to somebody's problem.
 */
export interface DodgedInterruption {
  readonly entry: InterruptionEntry;
  /** The minute the dot turned it away. */
  readonly tick: number;
  /** Whether it never came back at all. */
  readonly gaveUp: boolean;
}

/* -- the project, as a surface can draw it (E10, 0.29.0) ------------------ */

/**
 * Where a phase stands in the chain, which is the only thing a plan row can
 * honestly say about itself.
 *
 * Three values and no fourth: the derivation defines the live phase as the
 * first gate that has not passed, so everything before it HAS passed, the one
 * you are in has not, and everything after it has not been established either
 * way. A board that marked a later phase done while an earlier one was still
 * standing would be lying about a rollback, which is the one thing this
 * mechanic must not do.
 */
export type ProjectPhaseState = 'done' | 'now' | 'ahead';

/**
 * A phase task, as a row: the ticket it is, and whether it has ARRIVED.
 *
 * The milestone lock is arrival rather than refusal (`world/tickets/project.ts`),
 * so "locked" here is `arrived: false` - a row that is on the plan and not yet
 * on the desk. It carries its title anyway, because the four tasks ARE the
 * plan and a player is told about them by the delivery ticket on day one; what
 * they cannot do is work one early.
 */
export interface ProjectTaskRow {
  readonly id: string;
  readonly title: string;
  readonly arrived: boolean;
  /** The ticket's own state, or null while it is still a line on the plan. */
  readonly state: TicketState | null;
  readonly resolved: boolean;
}

/** One phase of the plan, against the clock. */
export interface ProjectPhaseRow {
  readonly phase: ProjectPhase;
  readonly label: string;
  readonly state: ProjectPhaseState;
  /** The baked tick this phase was planned to be done by. */
  readonly due: number | null;
  /** That tick as a face - `Day 2 15:00` - or empty when there is none. */
  readonly dueLabel: string;
  /**
   * Working minutes between now and that date, SIGNED: negative once the date
   * has gone by. It is the number the whole surface is built around - a date
   * three days out is not legible on its own, and a slip has to be readable
   * while there is still a project to save.
   */
  readonly minutesLeft: number;
  readonly late: boolean;
  /** The ticket this phase is worked through, or null for the sign-off. */
  readonly task: ProjectTaskRow | null;
}

/**
 * One rule of the set being carried across - and ONLY one anybody knows about.
 *
 * The filter is `ruleIsKnown`, and it is the beat rather than a nicety: a rule
 * that exists only in the live configuration is invisible until somebody reads
 * the box, so a board that listed all six from the start would hand the player
 * the answer the audit is the question about.
 */
export interface ProjectRuleRow {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  /** Whether it is in the 2019 handover pack, or was found on the box. */
  readonly documented: boolean;
  readonly migrated: boolean;
}

/**
 * Everything a plan surface draws, read in one go.
 *
 * It is assembled HERE rather than in the app for the reason every other view
 * on this interface is: an app may not go rummaging in the graph. The phase,
 * the gates and the dates are the world's own derivation (`projectStatus`,
 * unchanged and shared with the terminal); what this adds is the shape a board
 * needs - a row per phase, the task that works it, and the rule set as far as
 * anybody knows it.
 */
export interface ProjectPlanView {
  readonly status: ProjectStatus;
  readonly name: string;
  readonly customer: string;
  readonly phases: readonly ProjectPhaseRow[];
  /** The parent delivery row, which closes on its four children. */
  readonly delivery: ProjectTaskRow;
  readonly rules: readonly ProjectRuleRow[];
  /** Where the rule list came from, or null while nobody has established one. */
  readonly ruleSource: AuditSource | null;
}

/**
 * The phases a PLAN has rows for: the four with a date of their own.
 *
 * `handover` is not one of them and that is the derivation's own shape - it is
 * the terminal state, the project being finished rather than a fifth thing to
 * do - so the board says so in the header instead of drawing a row that could
 * never be anything but pending or done. The terminal's `fw status` omits it
 * for the same reason and off the same list.
 */
const PLAN_PHASES: readonly ProjectPhase[] = PROJECT_PHASES.filter(
  (phase) => phase !== 'handover',
);

/**
 * Which of the baked dates each phase is measured against.
 *
 * The scream test shares the handover's date because it shares its deadline:
 * the sign-off is what both are due by, and inventing a fifth date for the
 * night in between would be a plan the kickoff never baked.
 */
const PHASE_DUE_FIELDS: Readonly<Record<ProjectPhase, string>> = {
  audit: FIELDS.projectAuditDue,
  staging: FIELDS.projectStagingDue,
  cutover: FIELDS.projectCutoverDue,
  scream_test: FIELDS.projectHandoverDue,
  handover: FIELDS.projectHandoverDue,
};

/** Which task ticket a phase is worked through. */
const PHASE_TASKS: Readonly<Record<ProjectPhase, string | null>> = {
  audit: ARDEN_EDGE_TASKS.audit,
  staging: ARDEN_EDGE_TASKS.staging,
  cutover: ARDEN_EDGE_TASKS.cutover,
  scream_test: ARDEN_EDGE_TASKS.handover,
  handover: null,
};

/**
 * Working minutes from here to there, signed.
 *
 * The difference of the two directions, which is how this codebase says
 * "before or after" with a function that only counts forwards - the same
 * expression `projectStatus` puts on its own `minutesLeft`, because a row of
 * the plan and the phase you are standing in have to agree about how much
 * afternoon is left.
 */
function signedServiceMinutes(now: number, due: number): number {
  return serviceMinutesBetween(now, due) - serviceMinutesBetween(due, now);
}

/**
 * What the apps and the taskbar may ask of the day. Reading is free; the
 * things that MOVE it - starting the shift, clocking off, opening a can,
 * clearing the desk - all go through the engine's action registry like every
 * other change to the world.
 */
export interface DayApi {
  day(): number;
  state(): DayState;
  schedule(): DaySchedule;
  paused(): boolean;
  speed(): Speed;
  setPaused(paused: boolean): void;
  setSpeed(speed: Speed): void;
  startShift(): void;
  clockOff(): void;
  /** Where the lead is this minute. Reading it is free and changes nothing. */
  boss(): BossView;
  /**
   * What is taking the screen off you this minute, or nothing at all.
   *
   * Free to read and changes nothing, like `boss()` above and for the same
   * reason: it is a function of the day's schedule and of what the world
   * already holds, so every surface that asks gets the same answer and none of
   * them can be showing a call the world has finished with.
   */
  interruption(): InterruptionView | null;
  /**
   * And the workstation that is coming back, if one has been pushed.
   *
   * Free to read and changes nothing, like everything else on this half of the
   * interface. The countdown that runs while a reboot is pushed back is the
   * only caller: the desk is the player's for those minutes and something has
   * to be counting them.
   */
  pendingRestart(): UpcomingInterruption | null;
  /**
   * The dot the office can see, which is `available` until somebody says
   * otherwise.
   *
   * Free to read and changes nothing, like everything else on this half of the
   * interface: it is a field on the player node, so the tray, the taskbar and
   * the lead all read the same one and none of them can be showing a status
   * the world has stopped holding.
   */
  presence(): Presence;
  /**
   * And setting it, which the world may refuse - outside a shift there is
   * nobody at a desk to show a dot to, and a desk that is currently a meeting
   * room refuses in the sentence the meeting already owns.
   *
   * A refusal rather than a throw, for the same reason the three interruption
   * answers are: it is a sentence the player reads.
   */
  setPresence(to: Presence): DispatchResult;
  /**
   * What the lead would have to go on if he asked about the status this
   * minute: the dot, the meter, and the minutes of do-not-disturb-while-working
   * the world has actually written down.
   *
   * Free to read and changes nothing. The scene it arms is the caught-scene
   * class's; what is here is the PREDICATE and the evidence under it, because
   * a telling-off nobody can trace to a number is a random scold and this game
   * does not have those.
   */
  dndBeat(): DndBeatReading;
  /**
   * Installing a program off the web store, and taking one back off.
   *
   * The verb, not the manifest: this writes the AUDIT TRAIL (`install_audit`,
   * one `id@tick` line the driver stamps in the minute the button is pressed),
   * and the shell patches which app the desktop mounts alongside it. An install
   * under a locked-down shop SUCCEEDS - the consequence is the drip and the beat,
   * not a wall - so both return the world's own answer, which the store reads
   * back to the player. The only refusal either carries is the same minute
   * logging twice.
   */
  install(id: string): DispatchResult;
  uninstall(id: string): DispatchResult;
  /**
   * Files a change request for an action (0.10.0): the diegetic form that gates
   * risky/out-of-scope work into a real path - request, approve, act in a window.
   *
   * It puts a `change_request` node into the world (via a setup op, the way a
   * ticket is spawned mid-day) with the decision the authority the real one needs
   * would reach baked in - approve for the server/co-managed work a change process
   * authorises, reject for a monitoring-only remediation a CR cannot grant - and a
   * deterministic review delay and window. It answers with the lines the terminal
   * prints; filing NEVER dispatches the risky action, and an in-scope target files
   * nothing at all. The scope pre-flight's CONSULT is the only thing that ever lets
   * the action through, once the request is approved and inside its window.
   */
  fileChangeRequest(targetId: string, verb: string): readonly string[];
  /**
   * Files a coordination notice for a target (0.11.0): the co-managed heads-up to
   * a customer's OWN IT that puts a `coordination` node into the world and thereby
   * clears the action the scope pre-flight would otherwise refuse. Coordinate-
   * then-act, the RACI "I thought you had it" gap closed. Like a change request it
   * NEVER dispatches the action - the scope pre-flight's consult is the only thing
   * that lets it through, once a notice for the target exists - and a target with
   * no co-managed customer files nothing at all, answering that no notice is
   * needed.
   */
  fileCoordination(targetId: string): readonly string[];
  /**
   * Breaks the glass on a unit (E6, 0.18.0): the emergency, audited override for
   * a service ACTIVELY DOWN in an incident, when the fix would normally need
   * change control.
   *
   * It decides legitimacy off the estate - `hasActiveIncident`, a failed unit on
   * the box, is a real fire - and only then acts: the emergency `unit.restart`,
   * and the `break_glass_audit` line that logs the override loudly for the review
   * after. Broken on a healthy service it does NOT act: it records the abuse on
   * `break_glass_abuse` and charges its suspicion, because an emergency override
   * pulled with no emergency is exactly what a review looks for. The one thing
   * that makes it legitimate is the active incident; that is the fail-closed
   * gate the teeth test proves. It answers with the lines the terminal prints.
   */
  breakGlass(unitId: string): readonly string[];
  /**
   * Raises the engineer's incidents (E6), the moment the promotion fires: the
   * MSP's own client portal down on FC-RMM-01 (Pass B), and the characteristic
   * sysadmin incidents (0.19.0) - the disk that filled with logs, the cert that
   * expired, and the deploy that "worked in staging" - all on FC-RMM-01, spawned
   * into the world the way a drip is, so the newly-promoted player has a real
   * estate to work over ssh. Idempotent per incident - it does nothing for one
   * already in the world (the promotion is one-way, so it fires once anyway) -
   * and it only raises them where the box exists, which is the MSP world; promoted
   * at another employer, there is no FC-RMM-01 to down, and it stays quiet. It is
   * the shell that raises them rather than the promotion ACTION, because spawning
   * a ticket is registering a def with the engine, a shell/driver job, not an op.
   */
  raiseFirstIncident(): void;
  /**
   * Materialises the SELinux beat on a box the player has just reinstalled onto
   * the RHEL family (E6, 0.28.0), the first time they actually stand on it.
   *
   * The same shape as `raiseFirstIncident` and for the same reason: building
   * nodes is registering state with the engine, a driver job rather than an op,
   * and the shell asks for it at the moment the fiction says it happened. That
   * moment is the ssh, not the reinstall - `setDesktop` is chrome and stays
   * dispatch-free, and the honest reading is that the restore mislabelled the
   * web root when the box was rebuilt and nobody has looked at it since.
   *
   * Idempotent by the unit node and world-guarded, so a second ssh, a reload, or
   * a distro switched away and back does not stand a second web server up. It
   * answers whether the box is currently REFUSING, which is what the connect
   * banner prints - a real box tells you on the way in.
   */
  raiseSelinuxRelabel(boxId: string, hostname: string): boolean;
  /**
   * The project's plan against the clock (E10, 0.29.0), as the lines a surface
   * prints and as the derived status behind them.
   *
   * Free to read and changes nothing, like `boss()` and `interruption()`: the
   * phase is a function of the baked schedule, the clock and the estate, so the
   * terminal, a board and a test all get the same answer and none of them can be
   * showing a phase the world has left. Empty when there is no project - which
   * is every world but an engineer's week at the MSP.
   */
  projectBoard(): readonly string[];
  projectView(): ProjectStatus | null;
  /**
   * The same project, as the model a BOARD draws (E10, 0.29.0, slice 2).
   *
   * `projectBoard()` is the terminal's answer - lines, already formatted - and
   * a window cannot render lines without pretending to be a terminal. This is
   * the same reads, handed over as data: a row per phase with its date and the
   * signed minutes to it, the task each phase is worked through and whether it
   * has arrived yet, and the rule set as far as the audit has established one.
   *
   * Null when there is no project, which is every world but an engineer's week
   * at the MSP - and the surface is expected to say which of those it is.
   */
  projectPlan(): ProjectPlanView | null;
  /**
   * Moving the site's circuit into the new edge box, and moving it back.
   *
   * The cutover consults the change window FIRST (`changeRequestAuthorises`,
   * the same one the systemctl gate runs) and refuses outside it, naming where
   * the paperwork has got to - the project gets its slot from the ordinary
   * change-request flow rather than from a calendar of its own. The rollback
   * needs no window: putting a site back on the box it was on an hour ago is
   * not a change anybody has to approve, and hesitating over it is the actual
   * risk. Both answer with the lines the terminal prints.
   */
  cutover(newBoxId: string): readonly string[];
  rollback(oldBoxId: string): readonly string[];
  /**
   * The timesheet (0.30.0, slice 1): the week as the records have it, the
   * player's claim beside it, and the two edits that make them differ.
   *
   * `timesheet()` is the whole sheet as data - a surface that wanted lines can
   * format it, and `world/timesheet.ts` ships the formatter the terminal uses -
   * shaped by the player's tier: one bucket a day at the service desk, one line
   * per customer plus the project code for an engineer. `timesheetTruth()` is
   * the derivation on its own, for anything that needs what actually happened
   * without the claim laid over it; both go through the same function, so a
   * pre-fill and a later reading cannot disagree.
   *
   * The two verbs answer rather than throw: a claim on a submitted sheet is a
   * sentence the player reads, and the refusal is the world's.
   */
  timesheet(): Timesheet;
  timesheetTruth(): TimesheetTruth;
  timesheetClaims(): readonly TimesheetClaim[];
  playerTier(): PlayerTier;
  claimTimesheet(
    handle: string,
    minutes: number | null,
    detail: ClaimDetail | null,
  ): DispatchResult;
  submitTimesheet(auto?: boolean): DispatchResult;
  /**
   * The two readings of the sheet (0.30.0, slice 2), and the status report the
   * project learns to lie with (slice 3).
   *
   * `timesheetUtilisation()` is the ORG's - what you said, over the hours you
   * were here, against what the tier is asked for, and it decides nothing.
   * `invoiceStanding()` and `invoiceBreakdown()` are the CUSTOMER's, both
   * derived off the sheet and the customer's own records with no stored meter
   * between them; `invoiceMail()` is the ladder as the post it arrives as.
   * `reportProject()` files a colour beside the derived phase, and
   * `projectReportReadout()` prints the two of them side by side.
   */
  timesheetUtilisation(): UtilisationReading;
  invoiceStanding(): readonly {
    readonly customer: string;
    readonly label: string;
    readonly scrutiny: number;
    readonly rung: InvoiceRung;
    readonly delivered: InvoiceRung;
  }[];
  invoiceBreakdown(customer: string): readonly string[];
  invoiceMail(): readonly InvoiceThread[];
  /**
   * The second queue's two verbs (E9, 0.36.0). The THIRD player answer -
   * correcting - is not here on purpose: it is `ticket.classify`, dispatched
   * from the triage panel like any other triage, because a correction is a
   * triage and a second road to it would be a second matrix.
   *
   * `writeUpClass()` is the prompt, a pure read of the board: the class the
   * desk is now asking for an article about, or nothing.
   */
  writeUpClass(): string | null;
  confirmAudit(ticketId: string): DispatchResult;
  writeUpArticle(): DispatchResult;
  projectReports(): readonly StatusReport[];
  projectHonestRag(): ProjectRag | null;
  projectReportReadout(): readonly string[];
  reportProject(rag: ProjectRag): DispatchResult;
  /**
   * Files the blameless postmortem for an incident (E6, 0.19.0): the append-only
   * post-incident record that CLOSES the failed-deploy incident once the fire is
   * out. It reads the authored, blameless prose for the unit (`world/postmortem.ts`,
   * gated so it names no person), builds the `unit@tick` audit line in the minute
   * it was written (the same contract break-glass keeps, so a replay writes the
   * identical string), and dispatches the postmortem verb - which refuses if the
   * unit is still down (a postmortem is written AFTER the fire is out) or already
   * filed. It answers with the record the terminal prints.
   */
  filePostmortem(unitId: string): readonly string[];
  /**
   * What the lead would have to go on if he read the install audit this minute:
   * the policy, the installs on the trail he has not already been down about,
   * and how long the longest of those has been on it.
   *
   * Free to read and changes nothing, the sibling of `dndBeat`. It arms the
   * caught-scene class's software conversation on evidence the world wrote down -
   * a program on the audit under a locked-down policy - and never at random. It
   * reads only the tail past the "already spoken about" watermark, so the same
   * install is not brought up every patrol.
   */
  installAuditBeat(): InstallAuditReading;
  /**
   * Every phone that did not ring today, oldest first.
   *
   * Free to read and changes nothing: it is the world's own ledger
   * (`interruption_dodged`, one `id@tick` line per slide) joined back to the
   * schedule those ids came out of, so a surface can name the caller and the
   * subject without learning anything the world has not already written down.
   *
   * It exists because a filter with no surface is a mechanic the player pays
   * suspicion for and never sees work - and because the honest record of a
   * call nobody took is a thing that ought to be readable at five o'clock,
   * exactly as the missed list is.
   */
  dodgedInterruptions(): readonly DodgedInterruption[];
  /**
   * The pings that landed after you clocked off last night, to be read on this
   * morning's brief - each with whether it has already been answered.
   *
   * Free to read and changes nothing: it is the authored night joined to the
   * dot the save carries and the answered record the world keeps, so the surface
   * that draws it, a test and a reload all get the same list. Empty off the
   * morning brief, empty on a morning with no night behind it (the first day),
   * and short a ping wherever an overnight Do Not Disturb turned a declinable one
   * away - which is the dot reaching across the night, not a fourth cost.
   */
  afterHoursPings(): readonly AfterHoursArrival[];
  /**
   * Answering one, from that surface. Answers rather than throws, like every
   * other verb on this half: a second answer is refused in a sentence the player
   * reads, and the world enforces the "once" off its own record.
   */
  answerAfterHours(id: string): DispatchResult;
  /**
   * The pages you were woken by on the night just gone (E6, 0.17.0) - each with
   * what the seed made it, whether its unit is still down, and how it settled.
   * Free to read and changes nothing; empty for anybody the pager was never
   * handed. The page surface on the morning brief draws it; the fix itself is
   * the terminal, and the cost is the world's, reconciled off this same state.
   */
  onCallPages(): readonly OnCallPageArrival[];
  /**
   * The linked requests the clock has passed - the same question arriving on
   * mail, chat and a Hubbub room at once (0.5.0 slice 2) - each with how it was
   * resolved, or null while it is still live.
   *
   * Free to read and changes nothing: it is the week's own table joined to the
   * world's resolution ledger, so the three surfaces that draw a request, a
   * test and a reload all get the same list and the same answer to "has this
   * been dealt with". The mail and chat copies come straight off this; the
   * Hubbub copy rides the channel feed as a normal message and reads its own
   * `resolvedAs` back through here by id.
   */
  liveRequests(): readonly LinkedRequest[];
  /**
   * Resolving one, from whichever surface it is showing on. Answers rather than
   * throws, like every other verb on this half: a request already dealt with is
   * refused in a sentence the player reads, because answering the same question
   * in three places is the mistake this whole beat exists to teach.
   *
   * `convert` mints the ticket the request becomes - the correct play, and the
   * only one Friday can see - after the world has recorded the resolution;
   * `answer` pays the human's gratitude and raises nothing; `deflect` sends them
   * to the form. All three quieten every copy, because the record is keyed on
   * the request id and every surface reads it.
   */
  resolveRequest(id: string, kind: RequestKind): DispatchResult;
  /**
   * Whether this person is mid-greeting: they have said hello, they have not
   * said what they want, and the dots are going.
   *
   * Free to read and changes nothing. It is arithmetic on the week's table and
   * the clock rather than a flag anybody sets, so the chat window painting it
   * and a save reloading into the middle of it are the same question with the
   * same answer.
   */
  typing(speaker: string): TypingView | null;
  /**
   * The choice grammar, aimed at whatever is on the screen right now.
   *
   * All three answer rather than throw: a refusal is a sentence the player
   * reads - the junior who cannot skip the sync, the callback that is not
   * declinable - and the refusals are the teaching, so they have to reach a
   * surface rather than a console.
   */
  answerInterruption(): DispatchResult;
  deferInterruption(): DispatchResult;
  declineInterruption(): DispatchResult;
  /**
   * A rude reply has just been sent, and the third of the tone's costs is the
   * one only the corridor can levy: if the lead is at your shoulder in the
   * minute you say it, he hears it, and it is the caught-scene class - a line on
   * the file, the minutes off the shift, the closeable window.
   *
   * The shell calls it whenever an aggressive option is picked; it answers
   * whether the beat fired, which is `true` only when he was actually present.
   * It arms on that ONE thing and nothing else - not a meter, not a schedule -
   * so it is telegraphed by the same footsteps every other conversation at this
   * desk is, and a reply sent while he is in his office costs the reputation and
   * the reporter's reaction and nothing here.
   */
  witnessedRudeReply(): boolean;
  /**
   * The desk. Both answer rather than throw: a refused can is a sentence the
   * player reads, not a crash, and the shell is the half that knows WHEN a can
   * is a bad idea while the engine is the half that knows whether it is legal.
   */
  drink(): DispatchResult;
  tidyDesk(): DispatchResult;
  /**
   * The bottle at the end of the week. Locked until a review says otherwise,
   * which is the engine's opinion rather than the button's - so this answers
   * with the refusal a player can read.
   */
  beer(): DispatchResult;
  /**
   * The week as the review would read it if it happened this minute: a mark
   * out of a hundred, half of it the queue closed and half of it the deadlines
   * kept, weighted toward how the week has been ending.
   */
  weekReading(): number;
  /**
   * The conduct file, and what it would be worth if somebody opened it this
   * minute. Free to read and changes nothing, which is the whole point of it
   * being on this interface: the file, the three reasons somebody might come
   * looking and the bar they would produce are readable all week, in a window,
   * before any of it decides anything.
   */
  conductReading(): ConductReading;
  /** The file itself, one line per thing that was noticed. */
  conductFile(): string;
  /**
   * The weather: which season is live, which of its four beats has landed, and
   * where the player stands in the pool if there is one to stand in.
   *
   * Free to read and changes nothing, for the same reason the conduct reading
   * is on this interface: the ranking, the line and the three scores that make
   * them are on a screen for three weeks before any of it decides anything.
   */
  pressureReading(): PressureReading;
  /** The same thing as the sentence the screens print. */
  pressureSummary(): string;
  /** How Friday at three went, as the world recorded it. */
  reviewOutcome(): ReviewOutcome;
  /** Whether the week has been clocked off for the last time. */
  weekEnded(): boolean;
  /** Five days, added up out of the tickets they were made of. */
  weekScorecard(): WeekScorecard;
  /**
   * This employer's channel rooms and the feed through a tick (0.6.0 slice 3).
   *
   * The Hubbub window reads its rooms and messages from HERE rather than from a
   * module global, so the client draws whichever employer's rooms the session
   * stood up - the probation shop's three, or a wild-west shop's one. Free to
   * read and changes nothing, like the rest of this half of the interface.
   */
  rooms(): readonly ChannelDef[];
  channelFeed(now: number): readonly ChannelMessage[];
  /** What the brief calls a day of THIS employer's week, or a bare number. */
  dayLabel(day: number): string;
  /**
   * How heavy today is, as the band the week's own arithmetic makes it - one
   * to four - or null on a day that is not one of this week's five (E11,
   * 0.34.0 slice 3).
   *
   * Free to read and changes nothing, like the rest of this half of the
   * interface, and computed rather than remembered for the reason `boss()` and
   * `typing()` are: it is a function of the day's table and the roster, so a
   * save carries nothing about it and a load lands on exactly the reading the
   * loaded day has. It is the SAME `dayLoad` the roster gate and the week
   * generator price days with - there is one answer to how heavy a day is, and
   * a second one on a screen would be the one nobody could check.
   */
  loadBand(): number | null;
  /** Fires when the day, its state, the pause or the speed changed. */
  onChanged(listener: () => void): () => void;
}

export interface DayDriverHandlers {
  /**
   * A day boundary has been crossed and the log has been checkpointed: the
   * moment a save is worth writing, and the cheapest one - the log is empty.
   */
  onDayBoundary(): void;
  /**
   * Slack apps with a window open and NOT minimised, by app id.
   *
   * The driver cannot see the screen and has no business doing so; the shell
   * can, and this is the one thing about it the pressure layer needs. A
   * minimised game is a game nobody is playing and nobody can catch you at,
   * which is why it is not in this list.
   */
  openSlackApps(): readonly string[];
  /**
   * The slack app the player is actually working in, or null when the window
   * with the keyboard in it is work - or when there is no window at all.
   *
   * The difference matters because the two meters ask different questions. The
   * lead sees every window that is up; the player is only being calmed down by
   * the one they are in.
   */
  focusedSlackApp(): string | null;
  /**
   * How many apps are installed against a locked-down policy and still on the
   * machine - the audit-risk drip of the web store.
   *
   * The driver cannot see the install set (shell state, like the open windows)
   * and has no business reading the employer's policy (pack data); the shell
   * knows both, and this is the one number the pressure layer needs off them.
   * It is the shell's job to return NOUGHT for a wild-west employer however much
   * is installed - the policy gates it here rather than in the meters, which
   * have no employer to read. Absent (a headless harness, a preflight) is
   * nought, which is what keeps a scripted week byte-identical.
   */
  installedAgainstPolicy?(): number;
  /**
   * The employer's install policy, for the beat that reads the audit trail.
   *
   * The DRIP reads a count the shell has already gated on the policy; the BEAT
   * reads the trail itself and so needs the policy on its own, because the trail
   * survives an uninstall and a wild-west employer's installs are logged and
   * cost nothing. The shell reads it off the pack (`companyInstallPolicy`); the
   * driver has no employer to read. Absent (a headless harness, a preflight) is
   * the strict one, `locked_down`, which matches `DEFAULT_INSTALL_POLICY` and
   * keeps a preflight honest about the probation employer it is standing in for.
   */
  installPolicy?(): InstallPolicy;
  /**
   * The channel messages that have arrived and are not in the read ledger - the
   * unread pile the attention drip prices (0.5.0 slice 3).
   *
   * Ids rather than a count, because the driver bills each message ONCE and has
   * to know which ones it has already billed - the difference against
   * `attentionCharged` below is what it charges this interval. The driver cannot
   * see the rooms (week data joined to the clock) or the read ledger (shell
   * state) and has no business reading either; the shell knows both, and these
   * two are the whole of what the pressure layer needs off them. Absent (a
   * headless harness, a preflight, a driver built before the client existed) is
   * an empty pile, which is what keeps such a run byte-identical to before the
   * drip existed.
   */
  unreadChannels?(): readonly string[];
  /** The ids already billed for attention - the drip's watermark. */
  attentionCharged?(): readonly string[];
  /**
   * Remember that these ids have now been billed, so the next interval does not
   * bill them again.
   *
   * The write half of the watermark. It is the shell's ledger the driver is
   * advancing, the same shape as the read ledger the window advances on paint -
   * and the driver calls it whether or not the meter dispatch it computed
   * actually moved a number, because a message the meters noticed is a message
   * they have noticed even if the stress it would have added was clamped away.
   */
  noteAttentionCharged?(ids: readonly string[]): void;
  /**
   * Whether there is a desktop session for any of this to be happening in.
   *
   * The clock does not convert real time while there is not, and that is not a
   * nicety: tick zero is 08:00 and one simulated minute costs one real second,
   * so a new player spending a minute on the login screen walked into a shift
   * that had started without them, and nine minutes anywhere near the boot
   * sequence was the whole day. Tickets breached before anybody had seen a
   * desktop, read the brief, or been given the pause button - which is on the
   * desktop, and is the one control the spec promises is always available.
   *
   * It is a QUESTION rather than a flag the shell sets, for the same reason
   * the two above it are: the driver cannot see a screen, the shell can, and a
   * mirrored copy is a copy that can be left disagreeing with the world. A
   * headless harness omits it and is at the desk by construction.
   *
   * The player's own pause is a separate thing and is deliberately untouched
   * by this, so logging off and back on lands on the pause state it left.
   */
  atDesk?(): boolean;
  /** Something the player ought to be told about. */
  onNotice?(title: string, body: string): void;
  /**
   * The clock was just dropped to x1, and by what.
   *
   * Fired ONLY on a real drop - a takeover landing while the clock is already
   * at x1 fires nothing - and never on the way back up, because there is no way
   * back up but the player's own hand. It is a telegraph rather than a notice
   * about the interruption: those exist already, and this is the separate fact
   * that the SPEED the afternoon was chosen at is gone and will not come back on
   * its own. The shell shows it self-dismissing; the cause is here so it can say
   * what came in.
   */
  onClockDropped?(cause: InterruptionSource | 'boss'): void;
  /**
   * The lead has arrived and there was something on the screen. The world has
   * already been told - suspicion, reputation and the count are moved before
   * this is called - and what is left is the scene, which is the shell's.
   */
  onCaught?(
    appId: string,
    tick: number,
    evidence: number | null,
    /**
     * The installs the software conversation is about, by app id, for the one
     * scene that names what was actually on the audit. Absent for every scene
     * that is about a screen or the dot - those have nothing to name.
     */
    software?: readonly string[],
  ): void;
  /**
   * He has sent one of his messages. The chat thread is the shell's memory of
   * what was said, so the driver hands over the line and the node the
   * conversation should be standing on rather than writing it itself.
   */
  onBossPing?(ping: Readonly<BossPing>): void;
  /**
   * One rung of the invoice ladder, handed over (0.30.0, slice 2).
   *
   * The world has already written down that the beat happened and has raised
   * the notice; this is the half the SHELL owns, which is the one rung that is
   * a conversation rather than a piece of post - the account manager, in the
   * chat window, on the shop's own side of it.
   */
  onInvoiceEscalation?(
    rung: InvoiceRung,
    customer: NodeId,
    label: string,
    breakdown: readonly string[],
  ): void;
  /**
   * And the org, answering a status report (0.30.0, slice 3): the meeting about
   * the meeting, or the question about the green one.
   */
  onWatermelon?(entry: Readonly<WatermelonDue>, lines: readonly string[]): void;
  /**
   * Somebody who is not the lead has messaged you directly, asking for a
   * favour instead of raising a ticket. Same shape and the same reason: the
   * transcript is screen state, so the driver says who and the shell opens the
   * conversation on the node their tree keeps for being summoned.
   */
  onDirectMessage?(speaker: NodeId, tick: number): void;
  /**
   * Somebody has opened a chat with the word "Hi." and nothing else.
   *
   * The same shape as the message above and for the same reason - the
   * transcript is screen state - with one difference that is the whole beat:
   * there is no question in it yet. The shell opens the conversation on the
   * node their tree keeps for a bare greeting, and the option on that node is
   * the player asking what they want.
   */
  onNoHello?(speaker: NodeId, tick: number): void;
  /**
   * And the minute they finish typing it, for a player who waited.
   *
   * It fires whether or not anybody waited, because the driver has no opinion
   * about a chat transcript: the shell is the half that knows where the
   * conversation is standing, and moves it only if it is still standing on the
   * greeting. A player who asked already had the question minutes ago and must
   * not be handed it twice.
   */
  onNoHelloQuestion?(speaker: NodeId, tick: number): void;
  /**
   * Something has taken the screen off the player: a phone ringing, or the
   * half hour that was in the summons mail on Monday.
   *
   * The world has already been told whatever the ARRIVAL costs - the stress a
   * malignant one charges for being reachable at all - and what is left is the
   * surface, which is a window like every other scene here. The three answers
   * are the player's and go back through `answerInterruption` and its two
   * siblings, so nothing about the decision is decided in the shell.
   */
  onInterruption?(view: Readonly<InterruptionView>): void;
  /**
   * And the minute the screen is the player's again, however it ended: picked
   * up, waved off, pushed twenty minutes out, or simply rung out.
   *
   * The driver has already settled everything the world owes for it by the
   * time this fires - the meeting has been sat through and minuted - so all
   * this is for is the window closing behind it.
   */
  onInterruptionEnded?(entry: Readonly<InterruptionEntry>): void;
  /**
   * A phone that did not ring, because the dot said not to.
   *
   * The world has already recorded the slide - and, if there was nowhere left
   * in the day for it to slide to, that it went unanswered - so there is
   * nothing here to decide. It exists because the player has to be able to
   * find out that the dot is doing something: a filter with no surface is a
   * mechanic the player pays suspicion for and never sees work.
   */
  onInterruptionDodged?(entry: Readonly<InterruptionEntry>, tick: number): void;
  /**
   * Somebody who has been waiting for a first word noticing that the desk they
   * are waiting on says Away and is demonstrably working.
   *
   * The world has already taken the reputation and written down that this
   * person has had their one thought about it today. What is left is what they
   * SAY, which is a chat line and therefore content.
   */
  onPresenceNoticed?(reporter: NodeId, ticketId: string, tick: number): void;
  /**
   * Friday, three o'clock, decided. The world already holds the outcome - the
   * reputation was read and the verb was dispatched - and what is left is the
   * conversation, which is a window like every other scene in this game.
   */
  onReview?(outcome: ReviewOutcome, tick: number): void;
  /**
   * Five o'clock on a Friday that went well: the probation is over and there
   * is a bottle in the fridge with your name on it. Fires once, at the day
   * end, and only when the review passed.
   */
  onBeerUnlocked?(): void;
  /** The week is over. There is no Saturday, so there is a screen instead. */
  onWeekEnd?(outcome: ReviewOutcome): void;
}

/**
 * The half of the driver a save touches. Narrow on purpose: the save system
 * has no business starting shifts or moving clocks.
 */
export interface DriverSaveSeam {
  driverState(): DriverState;
  restoreDriverState(state: Readonly<DriverState>): void;
  /**
   * Re-point the driver at the employer a loaded save names (0.6.0, P1-1).
   *
   * A load can restore a world from a DIFFERENT shop than the one this session
   * booted at - a Bodgeworth save opened in a tab that started at probation -
   * so the week the days deal, the rooms Hubbub draws and whether the lead pings
   * have to follow the file, not stay on the booted employer's content.
   */
  adoptEmployer(
    week: readonly DayScript[],
    channels: readonly ChannelDef[],
    runsBossPings: boolean,
    arc: Readonly<EmployerArc>,
  ): void;
}

/** What a save carries about how the player was watching. */
export interface DriverState {
  readonly paused: boolean;
  readonly speed: Speed;
}

export function parseDriverState(value: unknown): DriverState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { paused, speed } = value as Record<string, unknown>;

  return typeof paused === 'boolean' && isSpeed(speed)
    ? { paused, speed }
    : null;
}

export class DayDriver implements DayApi {
  private schedule_: DaySchedule;
  private patrol_: PatrolSchedule;
  private interruptions_: InterruptionSchedule;
  /** The minutes the day had already booked when the schedule was built. */
  private interruptionsBlocked_: readonly TickWindow[];
  private seed_: number;
  private paused_ = false;
  private speed_: Speed = 1;
  private carriedMs = 0;
  /**
   * Minutes of this shift that have been spent on somebody standing at the
   * desk and are not yet off the clock.
   *
   * It is never anything but nought between two calls to `step`: the drain is
   * in the same loop as the minute that created it, so nothing about a
   * conversation survives a save, a pause or a load. That is on purpose - the
   * cost is paid at the moment it is incurred, and a debt in driver state
   * would be a debt the world could not replay.
   */
  private owedMinutes_ = 0;
  private readonly listeners = new Set<() => void>();

  private readonly engine: EngineApi;
  private readonly actor: NodeId;
  private readonly handlers: Readonly<DayDriverHandlers>;
  /**
   * This session's employer content (0.6.0 slice 3), read off the session.
   *
   * Not `readonly`: a load can re-point it at a different shop's content
   * (`adoptEmployer`, P1-1). It is still per-instance, set at construction and
   * only ever changed by an explicit load - there is no module global to race,
   * which is the whole of what de-globalising it bought.
   */
  private week_: readonly DayScript[];
  private channels_: readonly ChannelDef[];
  /**
   * The career arc THIS shop runs, and therefore whose weather this driver is
   * allowed to narrate (#59a).
   *
   * On the driver beside the week and the rooms rather than read off a module
   * global, for the same reason those two are: it is per-shop content, a load
   * can re-point it, and the global default was how the probation shop's
   * redundancy round came to fire at three buildings that never authored one.
   * The arc also names the shop it belongs to, which is where every read below
   * gets the employer it needs - one fact, not two that can disagree.
   */
  private arc_: Readonly<EmployerArc>;
  /**
   * Whether this employer runs the probation lead's boss PINGS - the beat where
   * a round of the corridor mints his concern as a ticket and messages you
   * about it. It is probation content (`BOSS_TRAP_TICKET`, a probation reporter,
   * probation ping lines), so a second employer whose lead is a different person
   * and whose estate has none of that turns it OFF: its boss still walks the
   * floor and still catches slacking, but he does not raise Desmond's ticket or
   * send Desmond's messages into a world Desmond is not in.
   */
  private runsBossPings_: boolean;
  private readonly plans: (day: number, seed: number) => InterruptionPlan;

  public constructor(
    engine: EngineApi,
    actor: NodeId,
    seed: number,
    handlers: Readonly<DayDriverHandlers>,
    /**
     * Where a day's interruptions come from.
     *
     * The employer's week, in the shipped game, and it is a parameter for the
     * same reason the seed is one: a rule about what happens when two
     * takeovers collide, or when a countdown runs out of postpones, is a rule
     * about the MACHINERY, and pinning it to whichever row the week happens to
     * carry this month would be testing the content instead. A harness hands
     * in the day it needs; the shipped shell passes nothing and gets the
     * default, which binds this driver's own week.
     */
    plans?: (day: number, seed: number) => InterruptionPlan,
    /**
     * This session's employer content, defaulting to the probation shop's - so
     * every existing caller that stands a probation driver up is unchanged, and
     * the shell hands a second employer's week and rooms in off the session.
     */
    week: readonly DayScript[] = WEEK,
    channels: readonly ChannelDef[] = CHANNELS,
    runsBossPings = true,
    /**
     * And this shop's arc, defaulting to the probation shop's for the same
     * reason its week and rooms do: every existing caller stands a probation
     * driver up and is unchanged. The shell hands the session's employer's own
     * arc in, which is the only way any other shop's weather is ever read.
     */
    arc: Readonly<EmployerArc> = EMPLOYER_ARC,
  ) {
    this.engine = engine;
    this.actor = actor;
    this.handlers = handlers;
    this.week_ = week;
    this.channels_ = channels;
    this.runsBossPings_ = runsBossPings;
    this.arc_ = arc;
    // The default plan reader binds THIS driver's week, so an injected harness
    // day still wins and the shipped path deals the employer's own days.
    this.plans = plans
      ?? ((day, planSeed) => interruptionPlanFor(day, planSeed, this.week_));
    this.seed_ = seed;
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
    const plan = this.interruptionPlan(this.day());
    this.interruptionsBlocked_ = plan.blocked;
    this.interruptions_ = this.interruptionsFor(this.day(), plan);
    this.syncSlaClock();
  }

  public day(): number {
    return dayForTick(this.engine.now());
  }

  /**
   * The day state, read from the graph every time rather than mirrored here.
   * A copy on this side is a copy that a load, a replay or a refused dispatch
   * can leave disagreeing with the world.
   */
  public state(): DayState {
    const state = this.engine.graph.getField(this.actor, FIELDS.dayState);

    if (!isDayState(state)) {
      throw new Error(
        'The player node carries no day state. The world was seeded wrong.',
      );
    }

    return state;
  }

  public schedule(): DaySchedule {
    return this.schedule_;
  }

  /**
   * Where the lead is this minute, worked out from the day's seeded schedule
   * rather than from anything the driver has been remembering - which is why
   * a save carries no boss state and a load lands him exactly where the day
   * says he is.
   */
  public boss(): BossView {
    if (this.state() !== 'shift') {
      return { phase: 'clear', ticksToArrival: null };
    }

    const now = this.engine.now();

    return {
      phase: patrolPhase(this.patrol_, now),
      ticksToArrival: ticksToArrival(this.patrol_, now),
    };
  }

  /**
   * Opening a can. The shell decides which can of the run it is - a pure
   * function of the graph and the clock - and the engine decides what that
   * does to the desk, the money and the minute the crash is measured from.
   */
  public drink(): DispatchResult {
    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    const now = this.engine.now();

    return this.engine.dispatch(DAY_ACTIONS.consumableDrink, this.actor, null, {
      tolerance: nextTolerance(this.drinkRun(), now),
      pence: DRINK_PRICE_PENCE,
    });
  }

  public tidyDesk(): DispatchResult {
    const held = this.takeoverRefusal();

    return held !== null
      ? { ok: false, reason: held }
      : this.engine.dispatch(DAY_ACTIONS.deskTidy, this.actor, null, {});
  }

  /**
   * The dot, read off the player node every time rather than mirrored here.
   *
   * Absent is `available`, which is what everybody who has never touched the
   * tray is showing - and the reason no scripted walk in this suite writes the
   * field at all.
   */
  public presence(): Presence {
    return readPresence(this.engine.graph.getField(this.actor, FIELDS.presence));
  }

  /**
   * Setting it, through the same seam every other verb goes through.
   *
   * The takeover check is here rather than in the world for the same reason
   * `drink` and `tidyDesk` have it: the world knows there is a shift on, and
   * the DRIVER is the half that knows the desk is currently half an hour in a
   * room nobody can leave. A status changed from inside the sync would be a
   * dot set by somebody who is not at the desk it is about.
   */
  public setPresence(to: Presence): DispatchResult {
    // The books first, whatever happens next. The minutes the dot has been
    // showing are banked at the minute somebody reaches for the control, so a
    // status changed between two meter ticks costs exactly the minutes it was
    // up - and a refusal below leaves the record just as true, because what
    // was banked is what actually happened.
    this.settleDrip(this.engine.now());

    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.presenceSet,
      this.actor,
      null,
      { dot: presenceCode(to) },
    ));
  }

  /** What the lead has to go on about the status, this minute. */
  public dndBeat(): DndBeatReading {
    return dndBeat(
      this.presence(),
      this.playerNumber(FIELDS.suspicion),
      this.playerNumber(FIELDS.dndWorkingTicks),
    );
  }

  /**
   * Installing a program, and taking one back off.
   *
   * The driver stamps the `id@tick` line the world appends, in the minute the
   * button was pressed - the same contract the interruption ledger keeps, so a
   * replay writes the identical string. The line is `id@now`; the world trusts
   * it and refuses only the same minute logging twice. Which app the desktop
   * mounts is the shell's to patch alongside this; the world holds the record.
   */
  public install(id: string): DispatchResult {
    return this.softwareVerb(SOFTWARE_ACTIONS.install, id);
  }

  public uninstall(id: string): DispatchResult {
    return this.softwareVerb(SOFTWARE_ACTIONS.uninstall, id);
  }

  public fileChangeRequest(
    targetId: string,
    verb: string,
  ): readonly string[] {
    const plan = planChangeRequestFiling(
      this.engine.graph,
      targetId,
      verb,
      this.engine.now(),
    );

    if (plan.kind === 'filed') {
      // The same runtime addNode a ticket spawn uses, and serialised whole by a
      // save, so a request filed mid-day round-trips a reload. Filing is
      // paperwork - it adds the request and nothing else moves.
      this.engine.applySetup(plan.ops);
    }

    return plan.lines;
  }

  public fileCoordination(targetId: string): readonly string[] {
    const plan = planCoordination(
      this.engine.graph,
      targetId,
      this.engine.now(),
    );

    if (plan.kind === 'filed') {
      // The same runtime addNode filing a change request uses: the notice is a
      // node the save serialises whole, so a heads-up given mid-day round-trips
      // a reload. It adds the notice and nothing else moves - clearing the
      // action is the scope pre-flight's job, not this one's.
      this.engine.applySetup(plan.ops);
    }

    return plan.lines;
  }

  public breakGlass(unitId: string): readonly string[] {
    const unit = this.engine.graph.getNode(unitId);

    if (unit === undefined || unit.kind !== 'unit') {
      return [`${unitId} is not a unit this box knows about.`];
    }

    const box = boxOfUnit(this.engine.graph, unitId);

    if (box === null) {
      return [`${unitId} is not on any box I can see; there is no glass to break.`];
    }

    const now = this.engine.now();
    const line = `${unitId}@${String(now)}`;
    const unitName = typeof unit.fields[FIELDS.unitName] === 'string'
      ? unit.fields[FIELDS.unitName] as string
      : unitId;

    // Legitimacy is the fire: a failed unit on the box is a real active
    // incident, and only then does the glass break for real. This is the
    // fail-closed gate - remove it and break-glass would authorise anything.
    if (hasActiveIncident(this.engine.graph, box.id)) {
      // The emergency fix (the ordinary restart) and the loud audit line. The
      // restart is the same verb the fire is fixed with; break-glass is the
      // DECLARATION that it was done outside change control, and the record.
      this.engine.dispatch(SYSTEMD_ACTIONS.unitRestart, this.actor, unitId, {});
      this.announced(this.engine.dispatch(
        CHANGE_ACTIONS.breakGlassRecord,
        this.actor,
        null,
        { id: unitId, line },
      ));

      return breakGlassLegitLines(unitName, line);
    }

    // No fire: the glass does not break, the abuse is recorded, and it costs
    // suspicion - an emergency override with no emergency reads at the review.
    this.announced(this.engine.dispatch(
      CHANGE_ACTIONS.breakGlassAbuse,
      this.actor,
      null,
      { id: unitId, line },
    ));

    return breakGlassAbuseLines(unitName, this.hostnameOf(box.id));
  }

  public raiseFirstIncident(): void {
    // The MSP's own box has to exist to down anything on it - a promotion earned
    // at another employer raises nothing and stays byte-identical.
    if (this.engine.graph.getNode(MSP_IDS.mspInfraServer) === undefined) {
      return;
    }

    // The engineer's incidents, all on FC-RMM-01: the marquee portal-down (Pass
    // B) and the three characteristic incidents (0.19.0). Each is spawned only if
    // it is not already in the world, so the one-way promotion firing twice, or a
    // reload, is a no-op rather than a second down portal or a duplicate disk.
    const ids = [
      'ticket:syseng-first-incident',
      'ticket:syseng-disk-full',
      'ticket:syseng-cert-expiry',
      'ticket:syseng-failed-deploy',
      'ticket:syseng-permission-denied',
    ];

    let raised = false;

    for (const id of ids) {
      if (this.engine.graph.getNode(id) === undefined) {
        spawnWorldTicket(this.engine, id);
        raised = true;
      }
    }

    if (raised) {
      this.announce();
    }

    // And the project, if the week still has room for one (E10, 0.29.0). It is
    // here as well as at the start of shift because the promotion IS the moment
    // an engineer's work arrives - the incidents above are the same claim - and
    // a project that waited for tomorrow morning would be a mechanic a player
    // could be promoted on a Wednesday and never meet. Idempotent by the project
    // node, so whichever of the two moments comes first is the only one that
    // bakes anything.
    this.settleProjectKickoff();
  }

  /**
   * The SELinux beat, built on the box the moment somebody logs into it (E6,
   * 0.28.0). See `DayApi.raiseSelinuxRelabel` for why it is here and why it is
   * the ssh rather than the reinstall that asks.
   */
  public raiseSelinuxRelabel(boxId: string, hostname: string): boolean {
    const ids = selinuxNodeIds(hostname);

    if (this.engine.graph.getNode(boxId) === undefined) {
      return false;
    }

    if (this.engine.graph.getNode(ids.unit) === undefined) {
      this.engine.applySetup(selinuxRelabelSetup(boxId, hostname));
      this.announce();
    }

    // Whether the box is refusing THIS minute, which is a live read of the two
    // facts that decide it - the mode and the label - rather than a memory of
    // having built it. Either fix flips it, and the banner stops.
    return selinuxDenying(this.engine.graph, boxId, hostname);
  }

  public filePostmortem(unitId: string): readonly string[] {
    const unit = this.engine.graph.getNode(unitId);

    if (unit === undefined || unit.kind !== 'unit') {
      return [`${unitId} is not a unit this box knows about.`];
    }

    const doc = postmortemFor(unitId);
    const unitName = typeof unit.fields[FIELDS.unitName] === 'string'
      ? unit.fields[FIELDS.unitName] as string
      : unitId;

    // The postmortem is authored per incident: a unit with no blameless record
    // written for it has no incident to close this way, and says so rather than
    // filing an empty one.
    if (doc === undefined) {
      return [
        `There is no incident postmortem to file for ${unitName}.`,
        'A postmortem is the write-up of a specific incident; this unit is not '
          + 'one the tier has a record for.',
      ];
    }

    const now = this.engine.now();
    const line = `${unitId}@${String(now)}`;
    const result = this.engine.dispatch(
      INCIDENT_ACTIONS.postmortemFile,
      this.actor,
      unitId,
      { line },
    );

    // Refused - the fire is not out yet, or it is already written up. The verb's
    // own sentence is the honest answer.
    if (!result.ok) {
      return [result.reason];
    }

    this.announced(result);

    // The blameless record itself, printed as the engineer would read it back:
    // what happened, the timeline, what the SYSTEM let happen, the follow-up -
    // and never a name, which the load-time gate on the prose proves.
    return [
      `Postmortem filed for ${unitName}. The incident is closed.`,
      '',
      doc.title,
      '',
      'WHAT HAPPENED',
      ...doc.whatHappened,
      '',
      'TIMELINE',
      ...doc.timeline,
      '',
      'WHAT THE SYSTEM LET HAPPEN (blameless - we analyse the system, not a name)',
      ...doc.whatTheSystemLetHappen,
      '',
      'FOLLOW-UP',
      ...doc.followUp,
    ];
  }

  private softwareVerb(action: string, id: string): DispatchResult {
    const line = `${id}@${String(this.engine.now())}`;

    return this.announced(this.engine.dispatch(action, this.actor, null, {
      id,
      line,
    }));
  }

  /**
   * What the lead has to go on about the software on this machine, this minute.
   *
   * The sibling of `dndBeat`, and it reads the audit lines that are NOT in the
   * "already spoken about" copy (`install_noticed`): those are the installs no
   * conversation has covered yet. Records is how many of those there are; minutes
   * is how long the longest of them has sat on the list. The employer's policy
   * comes off the shell, defaulting to the strict one so a headless preflight
   * reads the probation employer it stands in for.
   */
  public installAuditBeat(): InstallAuditReading {
    const unspoken = this.unspokenInstalls();
    const now = this.engine.now();
    const minutes = unspoken.reduce(
      (longest, record) => Math.max(longest, Math.max(0, now - record.at)),
      0,
    );

    return installAuditBeat(this.installPolicy(), unspoken.length, minutes);
  }

  /** The installs on the audit no software conversation has covered yet. */
  private unspokenInstalls(): readonly InstallRecord[] {
    return unspokenInstalls(
      this.engine.graph.getField(this.actor, FIELDS.installAudit),
      this.engine.graph.getField(this.actor, FIELDS.installNoticed),
    );
  }

  private installPolicy(): InstallPolicy {
    return this.handlers.installPolicy?.() ?? 'locked_down';
  }

  /**
   * The phones that did not ring, read back off the world.
   *
   * Two lists joined, both of them the world's: the `id@tick` slides and the
   * ids nobody is going to hear from again. The AUTHORED half - who was
   * ringing and what about - comes off today's schedule by id, which is the
   * same place the ringing window would have got it, so this surface knows
   * precisely what a phone call knows and nothing else.
   *
   * Ids the schedule no longer holds are dropped rather than guessed at: a
   * save carried across a content change can name a call this build does not
   * author, and a line about a caller nobody can name is worse than a shorter
   * list.
   */
  public dodgedInterruptions(): readonly DodgedInterruption[] {
    const missed = new Set(
      this.playerText(FIELDS.interruptionMissed)
        .split('\n')
        .filter((id) => id.length > 0),
    );
    const dodged: DodgedInterruption[] = [];

    for (const [id, ticks] of Object.entries(this.stampedLines(FIELDS.interruptionDodged))) {
      const entry = this.interruptions_.entries.find(
        (candidate) => candidate.id === id,
      );

      if (entry === undefined) {
        continue;
      }

      // Giving up is a property of the LAST attempt rather than of the id. The
      // missed list is one line per call that never got through, so reading it
      // against every slide made a morning of a caller trying again and again
      // render as five separate people who did not try again - contradicted by
      // the very next line of the same list.
      const last = Math.max(...ticks);

      for (const tick of ticks) {
        dodged.push({ entry, tick, gaveUp: missed.has(id) && tick === last });
      }
    }

    return dodged.sort((left, right) => left.tick - right.tick);
  }

  /**
   * The pings from last night, as this morning's brief meets them.
   *
   * A pure read: the night just gone is `day - 1`, the authored pings for it are
   * joined to the dot the player left on and the answers already given, and the
   * result is the same on both sides of a save. Nothing here is written - the
   * dodge under Do Not Disturb is a filter rather than a record, which is the
   * round-trip the tail deliberately saves, and the only thing the world holds
   * is the answer.
   */
  public afterHoursPings(): readonly AfterHoursArrival[] {
    if (this.state() !== 'morning_brief') {
      return [];
    }

    const night = this.day() - 1;

    if (!isWeekDay(night)) {
      return [];
    }

    const answered = new Set(
      this.playerText(FIELDS.afterHoursAnswered)
        .split('\n')
        .filter((id) => id.length > 0),
    );

    return afterHoursArrivals(afterHoursOn(night, this.week_), this.presence(), answered);
  }

  /**
   * Answering one, through the same seam every other verb goes through.
   *
   * The id is checked against the pings that ACTUALLY arrived first, because the
   * verb cannot: the authored night is TS data rather than a node, so this seam
   * - which derives the arrived set from the night, the dot the save carries and
   * the answered record - is the only place that knows a real ping from a
   * planted, future or dot-dodged one, exactly as the driver is the only place
   * that knows a real interruption from an invented id. A refusal rather than a
   * throw, like every other verb on this half: it is a sentence the player would
   * read if a surface ever offered a ping this rejects.
   *
   * The trade itself is the world's - `afterHoursAnswer` bakes in the two
   * constants and refuses a second answer off its own list - so this passes
   * nothing but the id and lets the world price it.
   */
  public answerAfterHours(id: string): DispatchResult {
    const arrived = this.afterHoursPings().some(
      (ping) => ping.slot.id === id && !ping.answered,
    );

    if (!arrived) {
      return {
        ok: false,
        reason: 'That is not a ping you have waiting. It was never sent, it has '
          + 'already been dealt with, or the dot turned it away overnight - '
          + 'either way there is nothing there to answer.',
      };
    }

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.afterHoursAnswer,
      this.actor,
      null,
      { id },
    ));
  }

  /* -- on-call: the 3am page (E6, 0.17.0) --------------------------------- */

  /** Whether this player carries the pager - only a Systems Engineer is on call. */
  private onCall(): boolean {
    return isOnCall(this.engine.graph.getField(this.actor, FIELDS.playerTier));
  }

  /** A newline-list field off the player node, as a set of non-empty lines. */
  private playerSet(field: string): ReadonlySet<string> {
    return new Set(
      this.playerText(field).split('\n').filter((line) => line.length > 0),
    );
  }

  /** The systemd state a unit node currently holds, or the empty string. */
  private unitState(unitId: string): string {
    const value = this.engine.graph.getField(unitId, FIELDS.unitState);
    return typeof value === 'string' ? value : '';
  }

  /** The hostname a box is known by, for the pager line. */
  private hostnameOf(machineId: string): string {
    const value = this.engine.graph.getField(machineId, FIELDS.hostname);
    return typeof value === 'string' && value.length > 0 ? value : machineId;
  }

  /** How each settled page ended, by page id, off the `id@outcome` record. */
  private onCallOutcomes(): ReadonlyMap<string, OnCallOutcome> {
    const map = new Map<string, OnCallOutcome>();

    for (const line of this.playerSet(FIELDS.onCallSettledAs)) {
      const at = line.lastIndexOf('@');

      if (at > 0) {
        map.set(line.slice(0, at), line.slice(at + 1) as OnCallOutcome);
      }
    }

    return map;
  }

  /**
   * The pages you were woken by on the night just gone, read on this morning.
   *
   * The played twin of `afterHoursPings`, and pure the same way: the authored
   * night joined to what FIRED (the driver's record), what the seed made each
   * page (a fire or a flap), whether its unit is still down this minute, and how
   * it was settled. Empty for a desk player (never paged) and on a morning with
   * no on-call night behind it, which is what keeps the pre-promotion goldens
   * byte-identical.
   */
  public onCallPages(): readonly OnCallPageArrival[] {
    if (!this.onCall()) {
      return [];
    }

    const night = this.day() - 1;

    if (!isWeekDay(night)) {
      return [];
    }

    const fired = this.playerSet(FIELDS.onCallFired);
    const outcomes = this.onCallOutcomes();

    return onCallOn(night, this.week_)
      .filter((page) => fired.has(page.id))
      .map((page) => ({
        page,
        night,
        kind: pageKind(page.id, night, this.seed_),
        pagedAt: pagedAtMinute(page.id, night, this.seed_),
        unitFailed: this.unitState(page.unit) === SYSTEMD_STATES.failed,
        outcome: outcomes.get(page.id) ?? null,
      }));
  }

  /**
   * Fire the pages a night carries, once each. Real or flap, a page downs its
   * unit for real and writes the failure journal - so the two are told apart
   * only by looking (a `systemctl status`), which is the skill - and wakes the
   * player with a pager toast. Guarded on the tier and idempotent off the fired
   * record, so a desk player is never paged and a reload cannot fire the same
   * page twice. Called at the clock-off into the night, the way the after-hours
   * pings are authored against the same boundary.
   */
  private raiseOnCallPages(night: number): void {
    if (!this.onCall() || !isWeekDay(night)) {
      return;
    }

    const fired = new Set(this.playerSet(FIELDS.onCallFired));

    for (const page of onCallOn(night, this.week_)) {
      if (fired.has(page.id)) {
        continue;
      }

      fired.add(page.id);
      this.engine.applySetup([
        {
          op: 'setField',
          id: page.unit,
          field: FIELDS.unitState,
          value: SYSTEMD_STATES.failed,
        },
        ...(page.journal.length > 0
          ? [{
            op: 'setField' as const,
            id: page.unit,
            field: FIELDS.unitJournal,
            value: page.journal.join('\n'),
          }]
          : []),
        {
          op: 'setField',
          id: this.actor,
          field: FIELDS.onCallFired,
          value: [...fired].join('\n'),
        },
      ]);

      this.handlers.onNotice?.(
        `Pager: ${severityLabel(page.severity)} on ${this.hostnameOf(page.box)}`,
        `${formatPageTime(pagedAtMinute(page.id, night, this.seed_))} - ${
          page.note
        }`,
      );
    }
  }

  /**
   * Settle the pages you had all on-call day to answer, at the clock-off that
   * ends it. A real fire whose unit is up again was ANSWERED (the uptime saved);
   * one still failed was MISSED (downtime, a hit the review reads). A flap left
   * hanging settled itself while you were not looking, so it is marked cleared
   * for no charge. Reconciles the night whose morning was today - one clock-off
   * back from the one that fires tonight's pages.
   */
  private settleOnCallMisses(night: number): void {
    if (!this.onCall() || !isWeekDay(night)) {
      return;
    }

    const fired = this.playerSet(FIELDS.onCallFired);
    const settled = this.playerSet(FIELDS.onCallSettled);

    for (const page of onCallOn(night, this.week_)) {
      if (!fired.has(page.id) || settled.has(page.id)) {
        continue;
      }

      if (pageKind(page.id, night, this.seed_) === 'real') {
        // A last-minute restart at the frozen day-end still counts as caught.
        if (this.unitState(page.unit) === SYSTEMD_STATES.activeRunning) {
          this.settleOnCallPage(
            DAY_ACTIONS.onCallAnswer,
            page.id,
            ON_CALL_OUTCOMES.answered,
          );
        } else {
          this.settleOnCallPage(
            DAY_ACTIONS.onCallMiss,
            page.id,
            ON_CALL_OUTCOMES.missed,
          );
        }
      } else {
        this.markOnCallCleared(page.id);
      }
    }
  }

  /**
   * The minute-by-minute reconcile, run in the settle: a real fire answered the
   * moment its unit is back up, and a flap either settling ITSELF on its seeded
   * clock (if you left it) or caught having-been-restarted-early (the wasted
   * scramble, if you did not). The whole distinction the version turns on lives
   * here, off world state and a deterministic clear-time - no `Math.random`, so
   * a replay lands on the same page settled the same way.
   */
  private settleOnCall(now: number): void {
    if (this.playerText(FIELDS.onCallFired).length === 0 || !this.onCall()) {
      return;
    }

    const night = this.day() - 1;

    if (!isWeekDay(night)) {
      return;
    }

    const fired = this.playerSet(FIELDS.onCallFired);
    const settled = this.playerSet(FIELDS.onCallSettled);
    const shiftStart = shiftStartTick(this.day());

    for (const page of onCallOn(night, this.week_)) {
      if (!fired.has(page.id) || settled.has(page.id)) {
        continue;
      }

      const running = this.unitState(page.unit) === SYSTEMD_STATES.activeRunning;

      if (pageKind(page.id, night, this.seed_) === 'real') {
        // The uptime is saved the minute the unit answers again - a fabricated
        // confirmation could never trip this, only the real flip does.
        if (running) {
          this.settleOnCallPage(
            DAY_ACTIONS.onCallAnswer,
            page.id,
            ON_CALL_OUTCOMES.answered,
          );
        }

        continue;
      }

      // A flap. Its own clock is a few minutes into the shift, seeded off the id
      // and the night; the real ones have no such clock, which is the difference.
      const clearTick = shiftStart
        + selfClearDelayMinutes(page.id, night, this.seed_);

      if (running) {
        if (now < clearTick) {
          // Up before it would have settled: you got out of bed and restarted a
          // flap. The alert-fatigue cost, charged once.
          this.settleOnCallPage(
            DAY_ACTIONS.onCallScramble,
            page.id,
            ON_CALL_OUTCOMES.scrambled,
          );
        } else {
          this.markOnCallCleared(page.id);
        }
      } else if (now >= clearTick) {
        // It settles on its own - the flap you were right to leave alone.
        this.engine.applySetup([{
          op: 'setField',
          id: page.unit,
          field: FIELDS.unitState,
          value: SYSTEMD_STATES.activeRunning,
        }]);
        this.markOnCallCleared(page.id);
      }
    }
  }

  /** Dispatch one settling verb (answer/miss/scramble) and record the outcome. */
  private settleOnCallPage(
    action: string,
    id: string,
    outcome: OnCallOutcome,
  ): void {
    this.announced(this.engine.dispatch(action, this.actor, null, {
      id,
      line: settledLine(id, outcome),
    }));
  }

  /** Mark a flap settled with no meter move - it cleared, which costs nothing. */
  private markOnCallCleared(id: string): void {
    const settled = [...this.playerSet(FIELDS.onCallSettled), id];
    const settledAs = [
      ...this.playerSet(FIELDS.onCallSettledAs),
      settledLine(id, ON_CALL_OUTCOMES.cleared),
    ];

    this.engine.applySetup([
      {
        op: 'setField',
        id: this.actor,
        field: FIELDS.onCallSettled,
        value: settled.join('\n'),
      },
      {
        op: 'setField',
        id: this.actor,
        field: FIELDS.onCallSettledAs,
        value: settledAs.join('\n'),
      },
    ]);
  }

  /**
   * The linked requests as they stand this minute, joined to how each was
   * resolved.
   *
   * A pure read: the arrivals are `linkedRequestsThrough` against the clock,
   * and the answer is the world's own `request_resolved_as` ledger parsed by
   * id. Nothing here is written and nothing is remembered, so a save reloaded
   * mid-morning rebuilds the identical list - the same promise the channel feed
   * keeps, because a request is a reading of the table exactly as a message is.
   */
  public liveRequests(): readonly LinkedRequest[] {
    const resolved = resolutionsBy(this.playerText(FIELDS.requestResolvedAs));

    return linkedRequestsThrough(this.engine.now(), this.week_).map(({ day, slot }) => ({
      id: slot.id,
      reporter: slot.reporter,
      subject: slot.subject,
      raises: slot.raises,
      minute: slot.minute,
      mail: slot.mail,
      chat: slot.chat,
      day,
      resolvedAs: resolved.get(slot.id) ?? null,
    }));
  }

  /**
   * Resolving one, through the world verb its answer names.
   *
   * The id is checked against the requests that ACTUALLY exist first, because
   * the verb cannot: the week's requests are TS data rather than nodes, exactly
   * as the interruption ids and the after-hours pings are, so this seam - the
   * only place that holds the schedule - is where a real request is told from a
   * planted one. Convert then mints the ticket the request becomes, in the same
   * minute and only if the world recorded the resolution, so a refused convert
   * (off shift, already resolved) raises nothing.
   */
  public resolveRequest(id: string, kind: RequestKind): DispatchResult {
    const found = findLinkedRequest(id, this.week_);

    if (found === undefined) {
      return {
        ok: false,
        reason: 'That is not a request in front of you. It was never asked, or '
          + 'it is a copy of one you have already dealt with - either way there '
          + 'is nothing here to resolve.',
      };
    }

    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    const action = kind === 'convert'
      ? REQUEST_ACTIONS.convert
      : kind === 'answer'
        ? REQUEST_ACTIONS.answer
        : REQUEST_ACTIONS.deflect;

    const result = this.engine.dispatch(action, this.actor, null, {
      id,
      line: resolutionLine(id, kind),
    });

    // The ticket only when the world actually recorded the conversion. A
    // convert refused for being off-shift or already-resolved must not leave a
    // ticket behind it - that would be the wrong play earning the right play's
    // credit.
    if (result.ok && kind === 'convert') {
      this.raiseSummonedTicket(found.slot.raises);
      // And the paperwork costs minutes (SPEC_030): minting a ticket from a
      // chat is the correct play precisely because you did the writing-up, and
      // the writing-up is not free. It is owed against the shift exactly as a
      // caught lecture is - spent through `step`'s own drain, so the day still
      // ends at five and is `REQUEST_CONVERT_MINUTES` shorter. Answer and
      // deflect write no ticket, so neither owes this.
      this.owedMinutes_ += REQUEST_CONVERT_MINUTES;
    }

    return this.announced(result);
  }

  /**
   * Everything the player does to the world, and what it meant to the queue.
   *
   * The shell dispatches through here rather than at the engine directly so
   * that the two things a touch IS - the minute somebody first did something
   * about this ticket, and the line about it on a handoff form - are written in
   * the same minute as the action itself. Both used to be reconstructed later,
   * one from a five-minute sweep and one from the dispatch log, and both were
   * wrong in the same way: the record said when it was NOTICED rather than
   * when it happened, and the log is drained every night.
   */
  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, string | number | boolean | null>,
  ): DispatchResult {
    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    // Read BEFORE: this dispatch may resolve the ticket it is about, and a
    // fix that closes a ticket is still the first time anybody touched it.
    const witnesses = target === null ? [] : this.ticketsAbout(target);
    const result = this.engine.dispatch(id, actor, target, params);
    this.recordTouches(id, witnesses, result.ok);

    // And where the minute went (0.30.0). Only when the act actually landed: a
    // refusal costs no time worth charging anybody for, and one aimed at the
    // wrong customer's box would otherwise put a minute on an invoice for an
    // estate that was never touched.
    if (result.ok) {
      // Through the TICKET when the act was witnessed by one, because a ticket
      // knows something a box cannot: whether this is a project task, and so
      // whether the minutes belong on the project code or loose against the
      // customer. The last witness rather than the first, which is the one the
      // touch records leave last in the engine's own log - the two readings
      // have to land on the same bucket or the audit is arguing with itself.
      const attributed = attributionSource(target, witnesses);

      // And the minutes ALREADY recorded against it, if what just happened
      // changed the answer about whose they are - the scope answer that lands
      // after the work. First, so the corrected line is the one this minute
      // then extends rather than a second line beside it.
      this.settleAttributionDrift(attributed);
      this.noteWorkSegment(attributed);

      // And writing an estimate costs the shift its minutes (E9, 0.38.0), the
      // way minting a ticket from a chat does and for the same reason: scoping
      // a piece of work you have not done is the afternoon it sounds like, and
      // a quote that took no time at all would make the middle answer a strictly
      // better refusal. Owed against the clock and drained by `step`, so the
      // day still ends at five and is `SCOPE_QUOTE_MINUTES` shorter. Refusing
      // and obliging are both one sentence, so neither owes this.
      if (id === HELPDESK_ACTIONS.scopeQuote) {
        this.owedMinutes_ += SCOPE_QUOTE_MINUTES;
      }
    }
    // And, if the dot says Away while that was going on, the one person who
    // can see both halves of it.
    this.settleAwayNoticed(id, result.ok);
    // A fix that closed a parent has closed forty other people's tickets as
    // well, and they should hear about it in the minute it happened rather
    // than at the top of the next one.
    this.settleParentCascade();
    // And a mandate implemented is a manager gone and a mess revealed: the
    // legendary-manager revert, raised the minute the mandate closes. Before the
    // generic follow-up so it lands the manager-leaves notice rather than the
    // "same person, forty minutes later" one the plain chain carries.
    this.settleLegendaryRevert();
    // And a fix that finished one half of a chain has just raised the other
    // half. The new starter is back before the window has repainted, which is
    // both the joke and, in every shop this is drawn from, the truth.
    this.settleFollowUps();
    // And a careless revoke that closed the access review has just broken a
    // production job - a follow-up the world raises off the state it was left in.
    this.settleRecertFollowUp();
    // And a Domain Admin grant a manager ordered has just been flagged by the
    // audit - the finding lands on the accepting owner who signed, or on the desk
    // that granted it with nothing on file.
    this.settleOverrideFallout();
    return result;
  }

  public paused(): boolean {
    return this.paused_;
  }

  public speed(): Speed {
    return this.speed_;
  }

  public setPaused(paused: boolean): void {
    if (this.paused_ === paused) {
      return;
    }

    this.paused_ = paused;
    // Part-converted real time belongs to the stretch it was converted in.
    // Keeping it would let a paused clock hand over a tick on resume.
    this.carriedMs = 0;
    this.announce();
  }

  public setSpeed(speed: Speed): void {
    if (this.speed_ === speed) {
      return;
    }

    this.speed_ = speed;
    this.announce();
  }

  /**
   * Something is happening, so the day is handed back at a speed a person can
   * read it at.
   *
   * ON THE ARRIVAL EDGE, once, and never continuously. The player who puts the
   * clock back up to x4 with a phone still ringing has decided something about
   * their own afternoon, and a rule that dropped it again on the next minute
   * would be a control that fights the hand on it. The same reason there is no
   * automatic restore at the far end: the day slowed down because something
   * happened, which is legible, and a clock that re-accelerates behind the
   * player is not.
   *
   * Pause is untouched in both directions. A day that was stopped when the
   * phone rang is still stopped, and it is still stopped at x1.
   *
   * And the drop says so. The only signal it used to leave was the speed button
   * moving under nobody's hand, so an afternoon chosen at x4 could be run at x1
   * for the rest of the day without the player ever registering that it had
   * been dropped - and the no-auto-restore rule made that permanent. The
   * telegraph fires exactly when the clock ACTUALLY drops (a takeover that lands
   * while the clock is already at x1 changes nothing and says nothing), naming
   * what came in, so the change is a fact the player was told rather than one
   * they have to notice.
   */
  private slowDown(cause: InterruptionSource | 'boss'): void {
    const was = this.speed_;
    this.setSpeed(EVENT_SPEED);

    if (was !== EVENT_SPEED) {
      this.handlers.onClockDropped?.(cause);
    }
  }

  /** True while the clock is actually converting real time into ticks. */
  public running(): boolean {
    return this.atDesk() && !this.paused_ && clockRuns(this.state());
  }

  /**
   * Whether anybody is at the desk. Absent handler means yes: the headless
   * harnesses ARE the player, and there is no screen for them to be away from.
   */
  public atDesk(): boolean {
    return this.handlers.atDesk?.() !== false;
  }

  /**
   * One turn of the real clock. Ticks are applied one at a time so that
   * everything a tick causes - an arrival, a breach, the end of the day -
   * happens in the minute it belongs to rather than at the end of a batch.
   *
   * A minute can cost more than a minute. Being caught takes `CAUGHT_MINUTES`
   * off the shift, and they are spent HERE, through the same machinery every
   * other minute goes through: a conversation the clock skipped over would be
   * a conversation during which no ticket arrived, no deadline ran out and no
   * meter moved, which is not what standing at somebody's desk is like.
   */
  public step(elapsedMs: number): void {
    if (!this.running()) {
      this.carriedMs = 0;
      return;
    }

    const elapsed = ticksFromElapsed(elapsedMs, this.speed_, this.carriedMs);
    this.carriedMs = elapsed.carriedMs;

    for (let tick = 0; tick < elapsed.ticks; tick += 1) {
      if (!this.spendMinute()) {
        return;
      }

      // The rounds are `PATROL_MIN_GAP` apart and a conversation is shorter
      // than that, so this cannot cascade - but a drain whose bound is an
      // invariant somewhere else is a loop nobody has bounded, and the clock
      // is not the place to find out.
      for (let spent = 0; this.owedMinutes_ > 0 && spent < CAUGHT_MINUTES;) {
        this.owedMinutes_ -= 1;
        spent += 1;

        if (!this.spendMinute()) {
          return;
        }
      }
    }
  }

  /**
   * One simulated minute, spent, with everything it causes settled inside it.
   *
   * Answers whether the clock may keep going: false when the day ended in this
   * minute (the rest of the batch belongs to a tomorrow nobody has started) or
   * when the engine refused to move at all.
   */
  private spendMinute(): boolean {
    // Before the minute is spent, not after: the engine decides whether the
    // minute it is about to step counts against every open deadline, and it
    // decides it from the state the day is in as that minute begins.
    this.syncSlaClock();
    const before = this.engine.now();
    this.engine.advance(1);
    const now = this.engine.now();

    if (now === before) {
      return false;
    }

    this.spawnArrivals(before, now);
    // And the second queue with it (E9, 0.36.0), in the same minute and after
    // it: an audit item is an ordinary arrival wearing somebody else's filing,
    // so it goes where arrivals go. Inert by content off the senior rung.
    this.spawnAudits(before, now);
    // Before the floor and before the queue: the world breaking is not
    // something the player did, and everything else this minute has to see
    // the world as it now is.
    this.applyIncidents(before, now);
    // And the customer that signs mid-shift (0.13.0), for the same reason and in
    // the same place: it stands a whole estate up, and the ticket that drips
    // against it later this morning needs that estate to exist first.
    this.applyOnboardings(before, now);
    // The pager, reconciled: a real fire answered the moment its unit is up, a
    // flap settling on its own clock or caught having been scrambled for. Off
    // world state, once per page, and inert for anybody the pager was never
    // handed - so a week with no on-call night in it does not feel it.
    this.settleOnCall(now);
    this.settleDirectMessages(before, now);
    this.settleNoHello(before, now);
    this.settleStaleAuth(now);
    // The two halves of the out-of-scope ask that are NOT the player's move
    // (E9, 0.38.0): a customer answering an estimate, and a customer who was
    // obliged for nothing coming back for more. Both are minutes passing on
    // somebody else's timetable, which is what this stretch of the minute is
    // for, and both are settled before the queue is read so a ticket that has
    // just closed or just arrived is the queue's this minute rather than next.
    this.settleScopeQuotes(now);
    this.settleScopeRecurrence(now);
    this.settleLegendaryRevert();
    this.settleFollowUps();
    this.settleRecertFollowUp();
    this.settleOverrideFallout();
    // And the queue-jump's bill (E8, 0.26.0), which is a CLOCK event rather than
    // a dispatch one: it comes due the minute the deadline on whichever ticket
    // was left waiting runs out, so it is settled here beside the other things
    // the passing minute causes, and not in `dispatch` where the fallouts that
    // follow an action live.
    this.settleQueueJumpFallout();
    // And the audit queue's (E9, 0.36.0), which is the same kind of event and
    // therefore in the same place: a wrong triage you signed off costs nothing
    // until the clock it bought runs out, and that is a minute passing rather
    // than anything anybody did.
    this.settleAuditFallout();
    // And the external contract's clocks (E9, 0.37.0): an acknowledgment that
    // ran out untouched and an update window that passed in silence are both
    // things a minute causes, noticed here and stamped once - the meters read
    // the stamps.
    this.settleContractClocks(now);
    // And second line coming back on a ticket the senior KEPT (E9, 0.36.0),
    // which is the same kind of event again: somebody else finishing, on their
    // own timetable, noticed by a minute passing.
    this.settleVendorReplies(now);
    this.walkTheFloor(before, now);
    // After the corridor, in the same minute: the lead arriving is a takeover
    // too, and the assert inside this one is entitled to see it. Before the
    // meters, because being taken off the work is a thing that happened to
    // this minute and the interval that charges for the queue has to read a
    // world the interruption has already moved.
    this.settleInterruptions(before, now);
    // After it, because a walk-up's ask is measured from the minute she walked
    // away - which is a fact about where the interruption ended up, and the
    // pass above is what settles that.
    this.settleWalkUps(before, now);
    // Before the meters read the queue: a child closed by its parent is a
    // ticket off the pile this minute, and charging stress for it would be
    // charging for work that is finished.
    this.settleParentCascade();
    // And BOTH of these before the conversation at three o'clock. The mark the
    // review reads has to be the mark the minute has finished producing: a
    // ticket closed at 14:59 is paid at 15:00, a deadline crossed at 15:00 is
    // charged at 15:00, and a review that ran first read a number that was one
    // meter tick out of date. In the one direction that is somebody fired for
    // work they had already done.
    this.applyPressure(now);
    // After the meters, because it asks the same handler the same question and
    // the answer has to be about a minute that is finished happening: a window
    // the player is sitting in is a minute nobody can bill, and the sheet finds
    // that out at the same moment the suspicion meter does.
    this.trackSlackTime();
    this.settleReview(before, now);

    if (this.applyDueTransition()) {
      // The day ended inside this batch, and the minutes anybody still owed
      // for a conversation go with it: there is no shift left to take them off.
      this.owedMinutes_ = 0;
      this.carriedMs = 0;
      return false;
    }

    return true;
  }

  /**
   * Starts the shift on the player's say-so and puts the clock on nine.
   *
   * Reading the brief is not paid time. Whatever is left of the morning is
   * skipped rather than sat through, which is also what makes the journey
   * land on 09:00 exactly however long the player spent reading.
   */
  public startShift(): void {
    if (this.state() !== 'morning_brief') {
      return;
    }

    // The clock is moved to nine BEFORE the shift is started, and the two
    // lines are in that order for a reason a player would notice: whatever is
    // left of the morning is time nobody is being paid for, so it must not
    // come off anybody's SLA. Starting the shift first would sell the last
    // fifty minutes of the brief as working hours.
    const start = shiftStartTick(this.day());
    const now = this.engine.now();

    if (now < start) {
      this.syncSlaClock();
      // Same as the night, and the same reason: the brief is not paid time.
      this.engine.advanceOffHours(start - now);
      this.spawnArrivals(now, this.engine.now());
      this.spawnAudits(now, this.engine.now());
      // A window that opens at nine opens at nine, whether the player spent
      // the hour reading the brief or skipped it in four seconds.
      this.applyIncidents(now, this.engine.now());
    }

    // Yesterday's shortcut, arriving in this morning's post. It is settled at
    // the start of the shift rather than at last night's clock-off because a
    // day is how long it takes somebody else to notice, and because a
    // consequence that landed in the same evening would read as a punishment
    // for the click rather than as the cost of the omission.
    this.settleSecurityFallout();
    // And the other overnight read of yesterday's shortcuts (0.28.0): the sweep
    // that notices a box somebody left in permissive mode. Same rail, same
    // reason it is here and not at last night's clock-off.
    this.settleSelinuxAudit();
    // And the third overnight read (E9, 0.37.0): the co-managed peer who has
    // been through his own monitoring and found the MSP on a box the RACI says
    // is his. Same rail and the same reason for the timing - his morning is
    // when he reads it, and a complaint that arrived while the desk was still
    // typing would be a permission wearing a mail's clothes.
    this.settleRaciComplaint();
    // The project's two morning beats (E10, 0.29.0), in this order. The scream
    // test FIRST, because it is a consequence of yesterday and the kickoff is a
    // thing that happens today - and because a morning that is quiet has to be
    // quiet before anything else is put on the desk.
    this.settleScreamTest();
    this.settleProjectKickoff();
    // And the two 0.30.0 readings of what was written down yesterday: the
    // customer who has been through the invoice, and the org that has read the
    // status report. Both are the same rail and both are here for the same
    // reason as everything above them - a day is how long it takes somebody
    // else to notice, and a consequence in the same afternoon would read as a
    // punishment for the keystroke rather than as the cost of the claim.
    this.settleInvoiceLadder();
    this.settleWatermelon();
    this.dispatchDay(DAY_ACTIONS.startShift, {});
    this.syncSlaClock();
    this.carriedMs = 0;
    this.announce();
  }

  /**
   * Ends the day: pays it, banks it, sleeps through the night, and draws the
   * line the dispatch log starts again from.
   *
   * The checkpoint goes here because this is the one moment the history behind
   * it is finished with - the day has been scored and the money is in the
   * graph - so a save from tomorrow morning carries a baseline and an empty
   * log rather than every click of a career.
   */
  public clockOff(): void {
    if (this.state() !== 'day_end') {
      return;
    }

    const day = this.day();

    // The other half of the ladder's day (0.30.0, slice 2), and the reason
    // this settler has two contacts where every other one in this game has a
    // morning: the person reading your invoice does not work to your shift and
    // is not in this building. Accounts payable send the query with the post
    // and escalate at ten to five, which is when finance departments do that -
    // so the ladder gets a morning and an evening, the beats still arrive one
    // rung at a time, and a client can go from a question to a notice inside a
    // week the way they actually do.
    this.settleInvoiceLadder();

    if (isReviewDay(day)) {
      // A week that has already ended stays ended. The button is still on the
      // screen - the scorecard does not vanish when it is pressed - and a
      // second press must be a no-op rather than a refusal the driver throws.
      if (!this.weekEnded()) {
        this.endWeek(day);
      }

      return;
    }

    // The same slip the scorecard is showing, vending machine and all: a
    // banked total that disagreed with the screen it was read off would be a
    // lie the player could only catch by adding it up themselves.
    const banked = this.farmFund() + this.slipFor(day).net;

    // The day, folded into the week, before the world moves on to the next
    // one. It is written at the boundary rather than continuously because a
    // DAY is the unit the review weighs: an afternoon is not a day, and a
    // reading taken every five minutes would weigh the long days heaviest.
    this.recordWeekReading();
    this.dispatchDay(DAY_ACTIONS.clockOff, { banked });

    const morning = dayOpensTick(day + 1);
    const now = this.engine.now();

    if (now < morning) {
      // The night, in one call. Nobody is at the desk for any of it and the
      // service clock is held, so the only thing those nine hundred minutes do
      // is push every open deadline out by nine hundred - and living that a
      // minute at a time was most of the wait between clocking off and seeing
      // tomorrow morning.
      this.engine.advanceOffHours(morning - now);
    }

    this.schedule_ = this.scheduleFor(day + 1);
    this.patrol_ = this.patrolFor(day + 1);
    this.rebuildInterruptions(day + 1);
    this.spawnArrivals(now, this.engine.now());
    this.spawnAudits(now, this.engine.now());
    // On-call, at the one boundary that has a night in it: first settle the
    // pages whose on-call day just ended - a real fire still down is a miss, the
    // downtime read at the review - then fire tonight's, which the engineer
    // wakes to on tomorrow's brief. A desk player is paged with neither. Both are
    // additive and tier-gated, so a pre-promotion clock-off is byte-identical.
    this.settleOnCallMisses(day - 1);
    this.raiseOnCallPages(day);
    this.carriedMs = 0;
    this.engine.checkpoint();
    this.announce();
    this.handlers.onDayBoundary();
  }

  /**
   * Friday's clock-off, which is a different thing entirely.
   *
   * There is no night to sleep through and no queue to deal, because there is
   * no Saturday: the clock stays on Friday evening, the fund takes the last
   * day's pay, and what happens next is a screen rather than a morning. The
   * checkpoint is still taken - it is the cheapest save there is - and the
   * week is announced so the shell can put the scorecard up.
   */
  private endWeek(day: number): void {
    const banked = this.farmFund() + this.slipFor(day).net;

    this.recordWeekReading();
    // The sheet goes in whether or not anybody filled it in (0.30.0). Nothing
    // is invented and nothing is tidied: whatever the claim says at this minute
    // is what the customer is sent, labelled as having gone in on its own,
    // because a week that ended with the sheet still open is a week the payroll
    // deadline decided for you. The guard inside the verb makes a sheet the
    // player already submitted a no-op rather than a second submission.
    if (this.timesheetSubmittedAt() === null) {
      this.submitTimesheet(true);
    }

    this.dispatchDay(DAY_ACTIONS.endWeek, { banked });
    this.carriedMs = 0;
    this.engine.checkpoint();
    this.announce();
    this.handlers.onDayBoundary();
    this.handlers.onWeekEnd?.(this.reviewOutcome());
  }

  /** How the conversation on Friday went, as the world recorded it. */
  public reviewOutcome(): ReviewOutcome {
    const value = this.engine.graph.getField(this.actor, FIELDS.reviewOutcome);
    return isReviewOutcome(value) ? value : 'pending';
  }

  public weekEnded(): boolean {
    return this.engine.graph.getField(this.actor, FIELDS.weekEnded) === true;
  }

  /** The week, added up out of the days it was made of. */
  public weekScorecard(): WeekScorecard {
    const outcome = this.reviewOutcome();
    // The same rule the mark obeys, for the same reason. Before three o'clock
    // the honest answer is what the file WOULD be worth if somebody opened it
    // now; afterwards it is what it was worth when somebody did, because the
    // queue carries on all afternoon and a reason that had gone away would be
    // printed above the verdict it caused.
    const reading = this.conductReading();

    return weekScorecard(this.engine.graph.nodesOfKind('ticket'), {
      banked: this.farmFund(),
      opening: this.playerNumber(FIELDS.weekOpeningFund),
      bar: outcome === 'pending'
        ? reading.bar
        : this.playerNumber(FIELDS.reviewBar, REVIEW_PASS_PERFORMANCE),
      conduct: outcome === 'pending'
        ? conductSummary(reading)
        : this.playerText(FIELDS.reviewConduct),
      // The same rule again, for the same reason: live while there is still a
      // week to play, and the snapshot the ranking was actually read as once
      // somebody has read it. A closed ticket on a Friday afternoon moves the
      // player's own performance line, and a card that re-derived the matrix
      // would print a position that had moved since it decided anything.
      //
      // A finished week with nothing snapshotted is a week where no round was
      // ever on, and there the live sentence IS the honest one - it is the
      // same constant it was all week, because there was nothing to move.
      criteria: outcome === 'pending'
        ? this.pressureSummary()
        : this.playerText(FIELDS.reviewCriteria) || this.pressureSummary(),
      // LIVE, unlike the two above it, and the difference is the point. Those
      // two are inputs to a verdict, so they stop moving when the verdict is
      // taken; this one is an output of a sheet that is still open until the
      // week ends, and it decides nothing at all. A player who files a line at
      // four o'clock has moved their utilisation and moved nothing else, which
      // is the honest reading of what a timesheet is.
      // And EMPTY at a rung the business asks nothing of (0.39.0), which is how
      // a probationer's card comes out exactly as it did before the target
      // column existed: the surfaces leave the row off rather than print a
      // number against a blank.
      utilisation: utilisationReviewLine(this.timesheetUtilisation()),
      // The mark the conversation was decided on, which stopped moving when
      // the conversation happened. Reading it live let the week screen print
      // "37 of 45 needed" directly above "Probation: passed", because the week
      // carries on being worked all Friday afternoon. Before three o'clock
      // there is nothing to snapshot and the live number is the honest one -
      // it is what the review WOULD read.
      performance: outcome === 'pending'
        ? this.weekReading()
        : this.playerNumber(FIELDS.reviewReputation, this.weekReading()),
      outcome,
    }, this.week_);
  }

  /** This employer's rooms - what the Hubbub window draws (0.6.0 slice 3). */
  public rooms(): readonly ChannelDef[] {
    return this.channels_;
  }

  /** This employer's channel feed through a tick. */
  public channelFeed(now: number): readonly ChannelMessage[] {
    return channelFeedThrough(now, this.week_);
  }

  /** What the brief calls a day of this employer's week. */
  public dayLabel(day: number): string {
    return isWeekDay(day) ? dayScript(day, this.week_).label : `Day ${String(day)}`;
  }

  /**
   * How heavy today is, priced off this week's own table (E11, 0.34.0 slice 3).
   *
   * `dayLoad` rather than `script.load`, and the difference matters even though
   * the two agree: the authored column is checked AGAINST the arithmetic by
   * `assertWeekLoads` and by the generator's own gate, so reading the column
   * would be reading the copy that has to follow rather than the half that can
   * be checked. The lookup is the shipped roster, which is the same one both
   * gates and the sampler price with.
   */
  public loadBand(): number | null {
    const day = this.day();

    return isWeekDay(day)
      ? dayLoad(dayScript(day, this.week_), findWorldTicket).load
      : null;
  }

  /** The bottle in the fridge with your name on it. */
  public beer(): DispatchResult {
    const held = this.takeoverRefusal();

    return held !== null
      ? { ok: false, reason: held }
      : this.engine.dispatch(DAY_ACTIONS.consumableBeer, this.actor, null, {});
  }

  public driverState(): DriverState {
    return { paused: this.paused_, speed: this.speed_ };
  }

  /** Puts back how the player was watching, after a load. */
  public restoreDriverState(state: Readonly<DriverState>): void {
    this.paused_ = state.paused;
    this.speed_ = state.speed;
    this.resync();
  }

  /**
   * Re-point the driver at another employer's content on a load (0.6.0, P1-1).
   *
   * The save carries WHICH employer its world is at, but not the week, rooms or
   * ping flag - those are DATA the build owns (`session.ts`, `employers.ts`),
   * keyed to that id. A load that restored a Bodgeworth graph into a driver that
   * booted at probation would keep dealing the probation week over a Bodgeworth
   * estate - which is the `service:chassis-fan` crash the de-global exposed - so
   * the loader hands the loaded shop's content back in here. `resync` then
   * rebuilds the schedule, patrols and interruptions for the day the load landed
   * on, off the week just adopted. Nothing here is a module global: it is this
   * one driver instance following its own save, set only by an explicit load.
   *
   * The ARC came with the rest of it in 0.36.0 (#59a) and is required rather
   * than optional, because the one thing worse than a load that keeps dealing
   * the booted shop's week is a load that keeps running the booted shop's
   * WEATHER: a probation save opened over an MSP session would have carried
   * the round into a building whose cast it names none of. Required, so the
   * compiler asks every caller which shop's arc this world is running.
   */
  public adoptEmployer(
    week: readonly DayScript[],
    channels: readonly ChannelDef[],
    runsBossPings: boolean,
    arc: Readonly<EmployerArc>,
  ): void {
    this.week_ = week;
    this.channels_ = channels;
    this.runsBossPings_ = runsBossPings;
    this.arc_ = arc;
    this.resync();
  }

  /**
   * Picks the day back up from whatever the world now says it is. A load
   * replaces the clock and the day state wholesale, so the schedule this
   * driver was walking belongs to a session that is no longer running.
   */
  public resync(): void {
    // The seed first: everything below is built from it, and a load may have
    // replaced this session's week with a later attempt at the same one.
    this.seed_ = this.seedFromWorld();
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
    this.rebuildInterruptions(this.day());
    // A save carries the service clock, so this is a check rather than a
    // correction - but it is the check that catches a world restored into a
    // day it does not agree with, which is the one place the two halves could
    // drift apart without anybody seeing it happen.
    this.syncSlaClock();
    this.carriedMs = 0;
    this.announce();
  }

  public onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  /**
   * Keeps the engine's service clock in step with the day the world is in.
   *
   * The day state is the single truth - it is in the graph, it is saved, it is
   * replayed - and the engine's flag is the consequence of it. Deriving the
   * flag here rather than hanging it off the transitions is what makes a load,
   * a replay and a cold boot all agree: a session that starts at 08:00 on
   * Monday has to start with the clock stopped, and nothing transitioned to
   * get there.
   *
   * It dispatches only when the two disagree, so the log carries the moments
   * the clock started and stopped rather than one entry a minute.
   */
  private syncSlaClock(): void {
    const shouldRun = this.state() === 'shift';

    if (this.engine.slaRunning() === shouldRun) {
      return;
    }

    this.dispatchDay(
      shouldRun ? DAY_ACTIONS.slaClockRun : DAY_ACTIONS.slaClockHold,
      {},
    );
  }

  /**
   * Friday, three o'clock.
   *
   * The world decides which way it goes - both verbs are guarded on the mark
   * that earns them - so all this does is offer the one the week supports and
   * hand the answer to the shell, which is where a scene lives.
   * Reading the outcome back off the graph rather than trusting the dispatch
   * is what makes a refused review a review that did not happen.
   */
  private settleReview(after: number, now: number): void {
    const day = this.day();

    if (!isReviewDay(day) || this.state() !== 'shift') {
      return;
    }

    const due = reviewTick(day);

    if (due <= after || due > now || this.reviewOutcome() !== 'pending') {
      return;
    }

    // Friday's own day, folded in before anybody reads the file: the review
    // happens at three and the clock-off that would otherwise record it is two
    // hours away, so without this the conversation would be about a week that
    // stopped on Thursday evening.
    this.recordWeekReading();
    // And then somebody opens the file, which is a separate event with its own
    // verb: whether anybody had a reason to, what was in it, and what the bar
    // became are all written into the world in the minute before the
    // conversation, so the guards below compare against a number the world is
    // carrying and the window afterwards prints the world's own sentence.
    this.readTheFile();
    // And somebody scoring the pool, in the same minute and by the same rule:
    // written into the world BEFORE the conversation, so the guards compare
    // fields rather than arithmetic. In a quiet week it writes nothing, which
    // is what makes the two review verbs behave exactly as they did.
    const inTheCut = this.readTheMatrix();
    const outcome = reviewOutcomeFor(
      this.playerNumber(FIELDS.weekReputation),
      this.playerNumber(FIELDS.reviewBar, REVIEW_PASS_PERFORMANCE),
      inTheCut,
    );
    const result = this.engine.dispatch(
      outcome === 'passed'
        ? DAY_ACTIONS.reviewPassed
        : outcome === 'redundant'
          ? DAY_ACTIONS.reviewRedundant
          : DAY_ACTIONS.reviewFired,
      this.actor,
      null,
      {},
    );

    if (!result.ok) {
      throw new Error(`The review could not happen: ${result.reason}`);
    }

    this.announce();
    this.handlers.onReview?.(this.reviewOutcome(), due);
  }

  /**
   * The conduct file as it stands, and what it would be worth if somebody
   * opened it this minute.
   *
   * Free to call and changes nothing, which is the whole point: the caught
   * window shows it all week, the day scorecard says every evening whether
   * anybody has a reason to look, and neither of them is being shown a
   * different rule from the one that applies. Nothing here may fire from a
   * state the player could not read first.
   */
  public conductReading(): ConductReading {
    return readConductFile(
      this.tickets(),
      this.engine.graph.getField(this.actor, FIELDS.conductFile),
    );
  }

  /** The file itself, as the world holds it. */
  public conductFile(): string {
    return this.playerText(FIELDS.conductFile);
  }

  /**
   * Which week of the career this is. Week one is the probation week.
   *
   * Private because nothing outside needs the number on its own: what a screen
   * wants is the reading below, which carries the week INSIDE it beside the
   * season and the ranking, and a second way to ask the same question is a
   * second answer waiting to disagree.
   */
  private arcWeek(): number {
    return this.playerNumber(FIELDS.arcWeek, PROBATION_WEEK);
  }

  /**
   * The season, the beat and the ranking, worked out from the arc and the
   * world and nothing else.
   *
   * The matrix is only built once the criteria beat has landed, which is the
   * whole legibility rule in one condition: before the announcement there is
   * no pool, because there is nothing anybody has been told they are in.
   */
  public pressureReading(): PressureReading {
    const week = this.arcWeek();
    // THIS shop's arc, which since 0.36.0 is the only arc this driver can see
    // (#59a). A seasonless shop answers null here for every week of the
    // career, and every surface below - the summary, the scorecard's criteria
    // line, the review window's beat - is that null read out.
    const season = seasonAt(week, this.arc_);
    const beat = season === null ? null : beatAt(season, week);
    const scored = season !== null
      && (beat === 'criteria' || beat === 'decision');

    return {
      week,
      season,
      beat,
      standing: scored && season !== null
        ? poolStanding(
          {
            performance: this.weekReading(),
            file: this.engine.graph.getField(this.actor, FIELDS.conductFile),
            arcWeek: week,
          },
          season.cut,
        )
        : null,
    };
  }

  public pressureSummary(): string {
    return pressureSummary(this.pressureReading(), (person) => this.nameOf(person));
  }

  /** Somebody's name, as the graph holds it, for a screen that names them. */
  private nameOf(person: string): string {
    const value = this.engine.graph.getField(person, FIELDS.name);
    return typeof value === 'string' && value.length > 0 ? value : person;
  }

  /**
   * Whether a beat of the season actually left something the player could
   * look at, which is the half of the contract a calendar cannot answer.
   *
   * Two of the four are mail, and until 0.36.0 this asked the ARRIVAL FIELD
   * whether they had landed - which was the same question as "is it in the
   * inbox" for exactly as long as an inbox showed every thread. 0.35.2 ended
   * that: mail belongs to one building, the round's two announcements are the
   * probation shop's, and the field is on `person:pat`, who is the player at
   * every shop. So at the MSP the gate said the notice was readable while the
   * Mail app showed nothing, the telegraph passed on a beat the player could
   * not have seen, and a career could end on it. That is the reported gap
   * (#59), and the fix is to ask the surface the claim is about: is the thread
   * this season announces itself through actually IN this world's inbox.
   *
   * Same question, one truth. The arrival field is still what decides it -
   * `visibleMail` reads it through the thread's own gate - with the shop the
   * mail belongs to folded into the same read, so the gate and the inbox
   * cannot disagree again.
   *
   * The third is the matrix, which is readable exactly when there is a pool to
   * score. The fourth is the conversation itself, a scene on a Friday at three.
   */
  private readableBeat(
    season: Readonly<PressureSeason>,
    beat: PressureBeat,
  ): boolean {
    if (beat === 'weather') {
      return this.inThisInbox(season.weatherThread);
    }

    if (beat === 'notice') {
      return this.inThisInbox(season.noticeThread);
    }

    if (beat === 'criteria') {
      return (this.pressureReading().standing?.rows.length ?? 0) > 1;
    }

    return isReviewDay(this.day());
  }

  /**
   * Whether a thread is in the inbox of the building this driver is standing
   * in - the shop off the arc, which is the one seam that says whose season
   * this is.
   */
  private inThisInbox(thread: string): boolean {
    return visibleMail(this.engine.graph, this.arc_.employer)
      .some((entry) => entry.id === thread);
  }

  /**
   * Somebody scoring the pool, in the minute before the conversation, and only
   * if the season has been telegraphed.
   *
   * `telegraph` is the gate and it is a TYPE gate: it answers null unless all
   * four beats have fired in order and each of them left something readable,
   * and nothing below can be reached without the season it returns. So a round
   * that was never announced, or announced into an inbox that does not hold
   * the mail, writes no ranking - and a review with no ranking in the world is
   * the review this game has always had.
   *
   * Answers whether the player is in the cut, which is what the driver needs
   * to know which verb to offer.
   */
  private readTheMatrix(): boolean {
    const reading = this.pressureReading();
    const { season, standing } = reading;

    if (season === null || standing === null || reading.beat !== 'decision') {
      return false;
    }

    const telegraphed = telegraph(
      season,
      reading.week,
      (beat) => this.readableBeat(season, beat),
    );

    if (telegraphed === null) {
      return false;
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.reviewMatrixRead,
      this.actor,
      null,
      {
        position: standing.position,
        cut_from: standing.cutFrom,
        criteria: matrixSummary(standing, (person) => this.nameOf(person)),
      },
    );

    if (!result.ok) {
      throw new Error(`The pool could not be scored: ${result.reason}`);
    }

    return standing.inTheCut;
  }

  /**
   * Somebody opening it, in the minute before the conversation.
   *
   * The reading is taken here and written down, because everything it is
   * computed from carries on moving all Friday afternoon: a ticket closed at
   * half past three retires the customer whose grievance caused the whole
   * thing, and a window that re-derived the reason would print one that no
   * longer existed above a verdict it had caused.
   */
  private readTheFile(): void {
    const reading = this.conductReading();
    const result = this.engine.dispatch(
      DAY_ACTIONS.reviewFileRead,
      this.actor,
      null,
      { bar: reading.bar, conduct: conductSummary(reading) },
    );

    if (!result.ok) {
      throw new Error(`Nobody could open the file: ${result.reason}`);
    }
  }

  /**
   * The week as the review will read it, right now.
   *
   * The mark for the week to date - how much of what arrived was closed, and
   * how much of it never went red - folded into the days behind it, each of
   * those worth half of the one after. Free to call and changes nothing, which
   * is what lets the day scorecard show the player the number they are being
   * judged on every evening rather than for the first time on a Friday.
   */
  public weekReading(): number {
    return weekStanding(
      this.playerNumber(FIELDS.weekReputation),
      weekWorkThrough(this.engine.graph.nodesOfKind('ticket'), this.day()),
    );
  }

  /**
   * The same number, written into the world.
   *
   * Computed here and decided there, exactly as the meters are: the shell can
   * read the graph, the world says where a number stops, and the dispatch log
   * carries what was actually written so a replay arrives at the same Friday
   * instead of recomputing one.
   */
  private recordWeekReading(): void {
    const reading = this.weekReading();
    const result = this.engine.dispatch(
      DAY_ACTIONS.weekReading,
      this.actor,
      null,
      { reading },
    );

    if (!result.ok) {
      throw new Error(`The week could not be read: ${result.reason}`);
    }
  }

  /** What a day is worth, vending machine and all. */
  private slipFor(day: number): PaySlip {
    return daySlip(
      dayLedger(this.engine.graph.nodesOfKind('ticket'), day),
      this.playerNumber(FIELDS.consumableSpend),
    );
  }

  private scheduleFor(day: number): DaySchedule {
    // Off the end of the week there is nothing left to deal: the world stops
    // on Friday evening, and a driver asked for Saturday's queue is a driver
    // that has been left running past the end of its own week.
    return buildDaySchedule(
      day,
      this.seed_,
      isWeekDay(day) ? dayPlan(day, this.week_) : { inherited: [], drip: [] },
    );
  }

  private patrolFor(day: number): PatrolSchedule {
    return buildPatrolSchedule(
      day,
      isWeekDay(day) ? patrolSeedFor(day, this.seed_, this.week_) : this.seed_,
    );
  }

  /**
   * What the day authored, and the minutes it had already spoken for.
   *
   * The blocked half is kept beside the schedule rather than thrown away,
   * because a callback is placed at RUNTIME - twenty minutes after somebody
   * asked for one - and it has to get out of the way of exactly the same
   * bookings the authored entries did.
   */
  private interruptionPlan(day: number): InterruptionPlan {
    return this.plans(day, this.seed_);
  }

  private interruptionsFor(
    day: number,
    plan: Readonly<InterruptionPlan>,
  ): InterruptionSchedule {
    return buildInterruptionSchedule(this.seed_, day, plan);
  }

  /** Both halves of the day's interruptions, rebuilt for a new day or a load. */
  private rebuildInterruptions(day: number): void {
    const plan = this.interruptionPlan(day);
    this.interruptionsBlocked_ = plan.blocked;
    this.interruptions_ = this.interruptionsFor(day, plan);
  }

  /**
   * Which week this is, and therefore which minutes it deals.
   *
   * Read off the graph rather than remembered, because the graph is the half
   * that survives a load: the attempt number is written into the world when
   * the week is built, and a driver that kept its own copy handed a restored
   * second attempt the first attempt's drip jitter and the first attempt's
   * patrols. The engine restored the right world and the schedule beside it
   * belonged to a week nobody was playing.
   */
  private seedFromWorld(): number {
    return seedForAttempt(Math.max(1, this.playerNumber(FIELDS.weekAttempt, 1)));
  }

  private farmFund(): number {
    const banked = this.engine.graph.getField(this.actor, FIELDS.farmFund);
    return typeof banked === 'number' && Number.isSafeInteger(banked) && banked >= 0
      ? banked
      : 0;
  }

  /**
   * Spawns everything the clock has just passed. A ticket that is already in
   * the world is left alone: the shipped pool is the same four tickets every
   * day until M4's content arrives, and a queue that re-spawns yesterday's
   * work would be a lie about the day rather than a busy one.
   */
  private spawnArrivals(after: number, upTo: number): void {
    const gone = formerClients(this.playerText(FIELDS.invoiceLadder));

    for (const arrival of arrivalsBetween(this.schedule_, after, upTo)) {
      if (this.engine.graph.getNode(arrival.ticketId) !== undefined) {
        continue;
      }

      // A client who has left does not raise any more tickets (0.30.0). This
      // is the whole of what "their work leaves the world" means here, and it
      // is deliberately the ONLY thing it means: the estate stays in the graph,
      // the tickets already on the desk stay open, and the week they were part
      // of still reads as the week it was. Deleting a customer's nodes would
      // delete the record of what was done for them, which is the one thing an
      // engine built around evidence must never do - and an invoice ladder that
      // erased its own evidence would be the padding mechanic destroying the
      // proof of itself.
      //
      // Costs nothing in every world where nobody has left: the ledger is
      // absent, the set is empty, and the loop is the loop it always was.
      if (gone.size > 0 && this.customerOfTicket(arrival.ticketId) !== null
        && gone.has(this.customerOfTicket(arrival.ticketId) ?? '')) {
        continue;
      }

      spawnWorldTicket(this.engine, arrival.ticketId);
    }
  }

  /**
   * The second queue, dealt (E9, 0.36.0 - the SD-senior rung).
   *
   * Two dispatches per item and they are in this order for a reason: the ticket
   * spawns the ORDINARY way, through `spawnWorldTicket`, so an audit item is an
   * ordinary ticket in every respect the engine cares about - the estate is set
   * up, the clock starts, the customer tier and the VIP flag fold in exactly as
   * they do for anything else - and only then is somebody else's filing dealt
   * onto it. The alternative was a second spawn path for other people's
   * tickets, which is a second answer to "what is a ticket".
   *
   * It is GATED ON THE RUNG, and that gate is the load-bearing line rather
   * than a belt-and-braces one. The audit queue is the senior rung's whole
   * shape break, and its five tickets are faults on the probation shop's
   * estate: dealt anywhere else they would name a reporter that world has
   * never heard of. So the read asks who is sitting here - the tier and the
   * title, which is the same pair `rungFor` settles the week's blend with -
   * and answers with nothing for everybody else. That is what keeps a junior's
   * Monday and an engineer's Monday the ones they always were.
   *
   * The KB beat's compounding half is the one branch here: the last instance of
   * the class asks the world whether the player has written the article, and a
   * player who has gets a filing that is RIGHT, with the article already linked
   * on it. Take that branch out and the third one arrives mis-triaged like the
   * other two, which is what `audit-teeth.test.ts` proves by doing exactly that.
   */
  private spawnAudits(after: number, upTo: number): void {
    if (this.playerRung() !== SENIOR_RUNG) {
      return;
    }

    const day = this.day();
    const authored = classAuthored(this.engine.graph, this.actor);

    for (const item of auditItemsOn(day)) {
      const at = tickAtMinute(day, item.minute);

      if (at <= after || at > upTo
        || this.engine.graph.getNode(item.ticket) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, item.ticket);

      const { filed, fault, kbRef } = filingOf(item, authored);

      this.engine.dispatch(AUDIT_ACTIONS.auditDeal, this.actor, item.ticket, {
        [JUNIOR_PARAM]: item.junior,
        impact: filed.impact,
        urgency: filed.urgency,
        priority: filed.priority,
        ...(fault === null ? {} : { [FAULT_PARAM]: fault }),
        ...(item.auditClass === undefined
          ? {}
          : { [CLASS_PARAM]: item.auditClass }),
        ...(item.beneficiary === undefined
          ? {}
          : { [BENEFICIARY_PARAM]: item.beneficiary }),
        ...(kbRef === null ? {} : { [ARTICLE_PARAM]: kbRef }),
      });
    }
  }

  /** Whose estate a ticket that has not spawned yet is about, off the roster. */
  private customerOfTicket(ticketId: string): string | null {
    return customerIdForTicketNodes(this.engine.graph, ticketNodes(ticketId));
  }

  /* -- what the world does to itself -------------------------------------- */

  /**
   * The cleaner's trolley, and the maintenance window.
   *
   * Dispatched straight at the engine rather than through this driver's own
   * `dispatch`, because that one records touches and stops response clocks -
   * and a printer losing power in another building is emphatically not
   * somebody working a ticket. No jitter either: the whole of the recurring arc
   * is two outages at the SAME minute two days apart, and a schedule that
   * wandered would be a schedule with the clue taken out of it.
   */
  private applyIncidents(after: number, now: number): void {
    const day = this.day();

    for (const slot of incidentsOn(day, this.week_)) {
      const at = tickAtMinute(day, slot.minute);

      if (at <= after || at > now) {
        continue;
      }

      const incident = findIncident(slot.incidentId);

      if (incident === undefined) {
        continue;
      }

      for (const step of incident.steps) {
        this.engine.dispatch(
          step.action,
          this.actor,
          step.target,
          { ...step.params },
        );
      }

      if (incident.notice !== null) {
        this.handlers.onNotice?.(incident.notice.title, incident.notice.body);
      }
    }
  }

  /**
   * The customer that signs mid-shift (0.13.0), stood up when its minute lands.
   *
   * The onboarding equivalent of `applyIncidents`: a beat the day fires that
   * changes the WORLD rather than the queue. Where an incident dispatches steps
   * at the engine, this applies the customer's estate as SETUP OPS - the same
   * runtime `applySetup` a filed change request uses, which a save then
   * serialises whole - and shows the notice the client arrives with.
   *
   * Idempotent by the customer node: if the client is already in the graph the
   * onboarding is skipped, so a save reloaded back inside the day, or a minute
   * crossed twice, cannot stand the same estate up a second time. That guard is
   * what lets the event be a plain world mutation rather than a logged dispatch.
   */
  private applyOnboardings(after: number, now: number): void {
    const day = this.day();

    for (const slot of onboardingsOn(day, this.week_)) {
      const at = tickAtMinute(day, slot.minute);

      if (at <= after || at > now) {
        continue;
      }

      const event = findOnboarding(slot.onboardingId);

      if (event === undefined
        || this.engine.graph.getNode(event.customer) !== undefined) {
        continue;
      }

      this.engine.applySetup(event.setup());
      this.handlers.onNotice?.(event.notice.title, event.notice.body);
    }
  }

  /**
   * Somebody asking a favour, and the ticket they raise when you say no.
   *
   * Both halves are here because they are one beat with a gap in it. The
   * message lands, and ten minutes later either the world shows the favour was
   * done - a password actually reset, whichever surface did it - or the person
   * has got round to the form and there is a ticket, a clock and a resolution
   * worth eight points. Neither answer is punished and the scorecard is where
   * the difference shows up, which is the whole of the lesson.
   */
  private settleDirectMessages(after: number, now: number): void {
    const day = this.day();

    for (const slot of directMessagesOn(day, this.week_)) {
      const asked = tickAtMinute(day, slot.minute);
      const files = tickAtMinute(day, slot.minute + slot.filesAfter);

      if (asked > after && asked <= now) {
        this.handlers.onDirectMessage?.(slot.speaker, asked);
      }

      if (files <= after || files > now) {
        continue;
      }

      const done = this.engine.graph.getField(
        slot.doneWhen.node,
        slot.doneWhen.field,
      );

      // Done for them, off the books, since they asked: there is nothing left
      // to raise and nothing on the scorecard either.
      if (typeof done === 'number' && done >= asked) {
        continue;
      }

      if (this.engine.graph.getNode(slot.raises) === undefined) {
        spawnWorldTicket(this.engine, slot.raises);
      }
    }
  }

  /**
   * Where a walk-up STOOD, whatever was then decided about it.
   *
   * It is deliberately not `liveInterruptions`, and that is a fix rather than
   * a preference: the live list drops everything in the declined ledger, so a
   * player who said "not now" made the entry vanish, the settlement below
   * never found an end tick, and the ticket was never raised at all. Declining
   * was therefore strictly cheaper than every other answer - cheaper than
   * doing the job, cheaper than sending them to the form, and cheaper even
   * than ignoring them, which files correctly - which is an exploit rather
   * than a choice, in the one beat of this slice that is entirely about the
   * choice being real.
   *
   * So the placement is asked with this entry's decline taken back out of the
   * ledger: where would it be if nobody had waved it off. Everything else the
   * ledger holds - the pushes, the slides, the OTHER entries' decisions -
   * stays exactly as it is, because those genuinely move the day.
   */
  private walkUpStood(id: string): InterruptionEntry | null {
    const ledger = this.interruptionLedger();

    return placeInterruptions(
      this.interruptions_,
      this.interruptionsBlocked_,
      {
        ...ledger,
        declined: ledger.declined.filter((declined) => declined !== id),
      },
    ).find((entry) => entry.id === id) ?? null;
  }

  /**
   * Somebody who came to the desk instead of raising one, and the ticket they
   * raise when the job does not get done.
   *
   * The same beat as the message above, standing up, and settled by the same
   * rule for the same reason: the question is whether the WORLD shows the
   * favour was done, not which button was pressed. Restarting his machine from
   * Remote Assist an hour later counts; saying you will get to it and not
   * getting to it does not; being told not now does not; and ignoring somebody
   * standing at your desk is not a way of making the job go away either. That
   * is what makes every answer legitimate and exactly one of them credited.
   *
   * The minutes are read off the PLACED entry rather than off the authored
   * row, and that is not tidiness: a walk-up slides out of the lead's way and
   * can be pushed twenty minutes, so the minute he walks away is a fact about
   * the day rather than about the table. A ticket that arrived while he was
   * still standing there would be a conversation that decided nothing.
   */
  private settleWalkUps(after: number, now: number): void {
    const day = this.day();

    for (const walkUp of walkUpsOn(day, this.week_)) {
      const entry = this.walkUpStood(walkUp.slot.id);

      if (entry === null) {
        continue;
      }

      const files = entry.endsTick + walkUp.filesAfter;

      if (files <= after || files > now) {
        continue;
      }

      const done = this.engine.graph.getField(
        walkUp.doneWhen.node,
        walkUp.doneWhen.field,
      );

      // Done for him, off the books, since he asked: there is nothing left to
      // raise and nothing on the scorecard either, which IS the trade rather
      // than an oversight.
      if (typeof done === 'number' && done >= entry.tick) {
        continue;
      }

      if (this.engine.graph.getNode(walkUp.raises) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, walkUp.raises);

      // The one authored variant this beat gets, and it is spent on the answer
      // that used to be free. Being told not now is not being told no: he goes
      // back to his desk and raises it himself, and the sentence says who did
      // the raising rather than pretending the queue produced it.
      if (this.hasDecided(FIELDS.interruptionDeclined, walkUp.slot.id)) {
        this.handlers.onNotice?.(
          'They raised it themselves',
          'You said not now, and "not now" is not "no". It is in the queue '
          + 'with their name on it, a clock on it, and a subject line that '
          + 'mentions what time they came over.',
        );
      }
    }
  }

  /**
   * "Hi." - and then, several minutes later, the question.
   *
   * Both halves are here because they are one beat with a gap in it, exactly
   * as the favour is. Neither half costs the world anything: what a no-hello
   * charges is the minutes somebody spends watching a typing indicator, and
   * minutes are charged by the clock rather than by a meter. So this is two
   * announcements and no dispatch at all, which is why nothing about it moves
   * a hash.
   */
  private settleNoHello(after: number, now: number): void {
    const day = this.day();

    for (const slot of noHelloOn(day, this.week_)) {
      const said = tickAtMinute(day, slot.minute);
      const asked = said + slot.typingMinutes;

      if (said > after && said <= now) {
        this.handlers.onNoHello?.(slot.speaker, said);
      }

      if (asked > after && asked <= now) {
        this.handlers.onNoHelloQuestion?.(slot.speaker, asked);
      }
    }
  }

  /**
   * Whether this person is currently typing at you, and how far into it.
   *
   * Free to read and changes nothing, like every other view on this
   * interface: it is arithmetic on the week's own table and the clock, so the
   * chat window, a test and a save all get the same answer and none of them
   * has to remember anything. Null for everybody who is not mid-greeting,
   * which is everybody, almost always.
   */
  public typing(speaker: NodeId): TypingView | null {
    const day = this.day();
    const now = this.engine.now();

    for (const slot of noHelloOn(day, this.week_)) {
      if (slot.speaker !== speaker) {
        continue;
      }

      const said = tickAtMinute(day, slot.minute);
      const waited = now - said;

      if (!stillTyping(waited, slot.typingMinutes)) {
        continue;
      }

      return {
        speaker,
        landedAt: said,
        typingMinutes: slot.typingMinutes,
        minutesWaited: waited,
        minutesLeft: typingMinutesLeft(waited, slot.typingMinutes),
        line: typingLine(waited, slot.typingMinutes),
      };
    }

    return null;
  }

  /**
   * The tablet in the cupboard, offering the password it was set up with.
   *
   * It is the world typing rather than a person, so it goes through the world's
   * own verb and never through this driver's `dispatch`: a response clock
   * stopped by a scanner would be a clock stopped by nobody.
   */
  private settleStaleAuth(now: number): void {
    for (const attempt of staleLogonsDue(this.engine.graph, now)) {
      this.engine.dispatch(
        WORLD_ACTIONS.staleLogon,
        this.actor,
        attempt.account,
        { count: attempt.count },
      );
    }
  }

  /** The other half of a chain, raised by the fix that finished the first. */
  private settleFollowUps(): void {
    for (const ticket of this.tickets()) {
      if (ticket.fields[FIELDS.state] !== 'resolved') {
        continue;
      }

      const next = followUpTo(ticket.id);

      if (next === undefined || this.engine.graph.getNode(next) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, next);
      this.handlers.onNotice?.(
        'They are back',
        `${ticketTitle(next)} - raised by the same person, about the same `
        + 'request, forty minutes after you closed it.',
      );
    }
  }

  /**
   * The customer coming back on an estimate (E9, 0.38.0).
   *
   * The same conditional-settle shape as `settleStaleAuth`: the world decides
   * which asks are due an answer (`quoteAnswersDue`, a pure read over the
   * clock and the ticket's own stamp) and this dispatches the one the CONTENT
   * says that customer gives. Nothing is rolled here and nothing is remembered
   * - the answer is a fact about the ask, so the same quote gets the same reply
   * in a replay, in a test and on a second playthrough.
   *
   * Both answers end the wait. A yes takes the ticket off hold and leaves it
   * open, which is the point of it: the work is now a job somebody is paying
   * for and it still has to be done. A no takes it off hold and closes it,
   * because there is nothing left to do about a piece of work nobody bought.
   */
  private settleScopeQuotes(now: number): void {
    for (const due of quoteAnswersDue(this.engine.graph, now)) {
      const approved = due.answer === SCOPE_OUTCOMES.approved;
      const result = this.engine.dispatch(
        approved ? WORLD_ACTIONS.scopeApproved : WORLD_ACTIONS.scopeDeclined,
        this.actor,
        due.ticket,
        {},
      );

      if (!result.ok) {
        continue;
      }

      // The minutes already spent on it are re-read against the answer that
      // just landed (0.38.0 verifier round). Declining moves them off the
      // invoice - out-of-contract work never bills, whatever the answer, and
      // an estimate nobody bought is not billable time - and approving moves
      // them back on, because approval makes them retroactively true. The
      // player's own three answers come through `dispatch`, which does this
      // itself; the CUSTOMER's answer arrives here, and a correction that only
      // ran on the half a player pressed would be half a correction.
      this.settleAttributionDrift(due.ticket);

      this.handlers.onNotice?.(
        approved ? 'They have signed the estimate' : 'They have declined the estimate',
        `${ticketTitle(due.ticket)} - ${
          approved
            ? 'the customer has approved the quote. It is chargeable work now, '
              + 'and it is back on your queue to actually do.'
            : 'the customer has decided against it. Nothing is owed by anybody '
              + 'and the ticket is closed.'
        }`,
      );
    }
  }

  /**
   * And the customer who was obliged for nothing, coming back for more (E9,
   * 0.38.0) - the delayed half of what "just do it" costs.
   *
   * A conditional summon, exactly as `settleRecertFollowUp` is: the world says
   * whether a bigger ask is due (`scopeRecurrencesDue` - obliged, ninety
   * minutes gone, and the sequel not already raised) and this raises it. It is
   * due for the unbilled favour and for nothing else: refuse, quote, decline or
   * deliver, and nobody comes back, because none of those taught them anything
   * about what your afternoon is worth.
   *
   * It arrives ONCE. The sequels name no sequel of their own, so a player who
   * obliges twice is taught twice and the chain still ends - a lesson that fed
   * itself would be a grief loop rather than a consequence.
   */
  private settleScopeRecurrence(now: number): void {
    for (const ticketId of scopeRecurrencesDue(this.engine.graph, now)) {
      this.raiseSummonedTicket(ticketId);

      if (this.engine.graph.getNode(ticketId) === undefined) {
        continue;
      }

      this.handlers.onNotice?.(
        'They are asking for more',
        `${ticketTitle(ticketId)} - the same customer, about the same kind of `
        + 'work, and this time it is bigger. You did the last one for nothing, '
        + 'which is the reason they are asking.',
      );
    }
  }

  /**
   * The legendary manager's churn turning (E8, 0.25.0): the manager leaves and
   * the mandate becomes the mess it always was, so the org reverts.
   *
   * The same conditional-summon shape as `settleRecertFollowUp` and
   * `settleOverrideFallout`: the world decides whether the mandate has been
   * implemented and not yet reverted (`legendaryRevertDue`, a pure read that
   * returns nothing in every world but Halcyon), and this raises the revert when
   * it has - with the manager-leaves notice, which is why it runs BEFORE the
   * generic `settleFollowUps` that would otherwise raise this same chain with the
   * "same person, forty minutes later" line. It keys only on the mandate being
   * implemented, not on whether the rollback was kept: the manager is gone and the
   * finding is raised either way, and the rollback decides only whether the revert
   * is clean or painful - which is the revert ticket's own two paths.
   */
  private settleLegendaryRevert(): void {
    const due = legendaryRevertDue(this.engine.graph);

    if (due === undefined) {
      return;
    }

    this.raiseSummonedTicket(due);
    this.handlers.onNotice?.(
      'The mandate is being reversed',
      `${ticketTitle(due)} - the director who ordered the "everything Automatic" `
      + 'change has moved on to an exciting new opportunity, and a security '
      + 'finding has landed on the change itself. The org wants the prior config '
      + 'back.',
    );
  }

  /**
   * The wrong revoke biting back (E8, 0.23.0).
   *
   * A conditional summon, the same shape as `settleSecurityFallout`: the world
   * decides whether there is a consequence, and this raises the ticket when there
   * is. It is due only when the access recertification has been worked to a close
   * AND the service account was killed doing it - disabled, or taken out of the
   * group its scheduled job needs - rather than right-sized. Right-size it
   * correctly and nothing fires, so honest diligence is never punished; only a
   * careless revoke left standing at the close costs anything.
   *
   * `recertFollowUpDue` reads Halcyon-specific nodes, so it returns nothing in
   * every other world - the review is not there to be resolved - which is what
   * keeps this inert everywhere the recert does not live, exactly as the summoned
   * boss-phone ticket is inert away from the probation shop.
   */
  private settleRecertFollowUp(): void {
    const due = recertFollowUpDue(this.engine.graph);

    if (due === undefined) {
      return;
    }

    this.raiseSummonedTicket(due);
    this.handlers.onNotice?.(
      'A scheduled job has failed',
      `${ticketTitle(due)} - the access review took a permission a production `
      + 'job actually depended on. It needs restoring, right-sized.',
    );
  }

  /**
   * The manager override's audit finding landing (E8, 0.24.0) - and where the
   * sign-off's teeth bite BOTH ways.
   *
   * The same conditional-summon shape as `settleRecertFollowUp` and
   * `settleSecurityFallout`: the world decides whether the privileged grant has
   * been made and not yet flagged (`overrideFalloutDue`, a pure read that returns
   * nothing in every world but Halcyon), and this dispatches the finding when it
   * has. The finding lands whichever way the grant was made - a Domain Admin
   * change on an external contractor is what an audit flags, signed off or not -
   * and the `overrideFallout` verb reads the risk acceptance to land the risk on
   * the accepting owner (charging the desk nothing) or on the desk (charging
   * suspicion) when nothing was signed. Reading the sign-off's state here for the
   * NOTICE only; the charge and the attribution are the verb's, so a save and
   * replay rebuild them the same.
   */
  private settleOverrideFallout(): void {
    const due = overrideFalloutDue(this.engine.graph);

    if (due === undefined) {
      return;
    }

    const signed = this.engine.graph.getField(
      OVERRIDE_RISK_ACCEPTANCE,
      FIELDS.crDecision,
    ) === 'approve';

    const result = this.engine.dispatch(
      WORLD_ACTIONS.overrideFallout,
      this.actor,
      due,
      { risk_acceptance: OVERRIDE_RISK_ACCEPTANCE },
    );

    if (!result.ok) {
      return;
    }

    this.handlers.onNotice?.(
      'Privileged-access audit finding',
      signed
        ? 'The Domain Admin grant to the Meridian contractor has been flagged. '
        + 'The risk acceptance on file names the Head of IT as the accepting '
        + 'owner - the finding is his, not yours. This is what getting it in '
        + 'writing bought.'
        : 'The Domain Admin grant to the Meridian contractor has been flagged, '
        + 'and there is no risk acceptance on file. You granted it, so the '
        + 'finding is yours - with nobody\'s signature to point at.',
    );
  }

  /**
   * The queue-jump's cost landing (E8, 0.26.0) - the half of the collision that
   * makes the choice a choice.
   *
   * Two tickets arrive in the same minute, both legitimately closeable, one at P2
   * because the caller is flagged and one at P2 because four people cannot work.
   * There is one desk. This is what the OTHER one costs, and it is not the same
   * cost twice: the flagged caller rings the Head of IT (suspicion), the ordinary
   * reporter's team sits blocked through the payment run (reputation, on top of
   * the plain breach every missed deadline already carries). Both branches charge
   * - the verb has no third one - which is what "no free lunch" has to mean if
   * the choice is to be real.
   *
   * `queueJumpFalloutDue` is a pure read of Halcyon-only nodes, so this is inert
   * in every other world, exactly like the recert follow-up and the override
   * finding. The charge and the latch are the verb's, so a save and a replay
   * rebuild them the same; the NOTICE is read from the same flag afterwards.
   */
  private settleQueueJumpFallout(): void {
    for (const ticket of queueJumpFalloutDue(this.engine.graph)) {
      const vip = this.engine.graph.getField(ticket, FIELDS.vip) === true;
      const result = this.engine.dispatch(
        WORLD_ACTIONS.queueJumpFallout,
        this.actor,
        ticket,
        {},
      );

      if (!result.ok) {
        continue;
      }

      this.handlers.onNotice?.(
        vip ? 'The exec has gone over your head' : 'The floor noticed',
        vip
          ? `${ticketTitle(ticket)} - the clock on it has run out, and Roland `
          + 'has rung the Head of IT rather than you. It was a P2 because his '
          + 'name is on the VIP list, and that is exactly the sentence he used.'
          : `${ticketTitle(ticket)} - the clock on it has run out with the team `
          + 'still locked out, and the payment run missed its cut-off. Nobody '
          + 'has complained. They all saw which ticket got done first.',
      );
    }
  }

  /**
   * Second line answering on a ticket that never left the board.
   *
   * The verb closes it through the ticket's own resolution rule, so the ending
   * is the ordinary ending. The notice exists because the player has been
   * watching a clock they did not control for ninety minutes and is entitled to
   * be told it has stopped.
   */
  private settleVendorReplies(now: number): void {
    for (const ticket of vendorRepliesDue(this.engine.graph, now)) {
      const result = this.engine.dispatch(
        AUDIT_ACTIONS.vendorReply,
        this.actor,
        ticket,
        {},
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Second line have come back',
          `${ticketTitle(ticket)} - they have picked it up and finished it. It `
          + 'was yours the whole time it was theirs, which is the arrangement '
          + 'at this grade.',
        );
      }
    }
  }

  /**
   * The bill for a triage you signed off (E9, 0.36.0) - the half that makes
   * confirming a decision rather than a free click.
   *
   * The world decides whether there is one: the verb refuses a filing nobody
   * confirmed, a filing that was RIGHT, a clock that has not run out and a
   * ticket already charged, so this is a read followed by a dispatch. The
   * notice names the fault out loud, because the whole content of the mechanic
   * is that the wrong answer was findable at the time - a bill that said only
   * "you got it wrong" would teach nothing about which half to check next time.
   *
   * Inert everywhere the audit queue is not dealt, which is every rung but the
   * senior's and every world but the probation shop's.
   */
  private settleAuditFallout(): void {
    for (const ticket of auditFalloutDue(this.engine.graph)) {
      const fault = this.engine.graph.getField(ticket, FIELDS.auditFault);
      const result = this.engine.dispatch(
        AUDIT_ACTIONS.auditFallout,
        this.actor,
        ticket,
        {},
      );

      if (!result.ok) {
        continue;
      }

      this.handlers.onNotice?.(
        'The QA sign-off has come back',
        `${ticketTitle(ticket)} - the clock has run out on it, and the review `
        + 'of the breach says the priority was wrong before anybody started. '
        + `${AUDIT_FAULT_NOTES[fault as AuditFault] ?? ''} You signed it off, `
        + 'so the finding is yours as much as the analyst\'s.',
      );
    }
  }

  /**
   * The bill for an enrolment nobody checked, arriving the next morning.
   *
   * The world decides whether there is one: the verb refuses an account that
   * was verified, an account with nothing enrolled, and an account that has
   * already been charged, so this is a read followed by a dispatch rather than
   * a decision made here.
   */
  private settleSecurityFallout(): void {
    for (const account of socialEngineeringDue(this.engine.graph, this.engine.now())) {
      const result = this.engine.dispatch(
        WORLD_ACTIONS.securityFallout,
        this.actor,
        null,
        { account },
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Security incident report',
          'Somebody else\'s incident report has landed with your name in the '
          + 'timeline. An authenticator was enrolled yesterday for a person '
          + 'nobody checked the identity of, and it was not the person whose '
          + 'account it was.',
        );
      }
    }
  }

  /**
   * The peer sysadmin's complaint landing (E9, 0.37.0) - the whole cost of the
   * co-managed RACI's soft wall, and the reason it is a wall at all.
   *
   * The same conditional-dispatch shape as `settleSecurityFallout` and
   * `settleSelinuxAudit`: the world decides whether there is a consequence
   * (`raciComplaintDue` - his box, touched unannounced, a night gone by, not
   * yet answered for), the verb applies the charge and the latch, and this
   * writes the notice. Nothing here decides anything, which is what lets a save
   * and a replay land on the same morning.
   *
   * The notice names the man and the box, because that is the entire content of
   * the mechanic: what a co-managed customer buys with a RACI is a colleague on
   * the other side of it, and what he does when you go round him is not lock
   * you out - it is know. The mail from him is in the inbox by the time this is
   * read, hung off the same stamp the verb writes.
   */
  private settleRaciComplaint(): void {
    for (const box of raciComplaintDue(this.engine.graph, this.engine.now())) {
      const peer = raciPeerOf(this.engine.graph, box);
      const result = this.engine.dispatch(
        WORLD_ACTIONS.raciComplaint,
        this.actor,
        box,
        {},
      );

      if (!result.ok) {
        continue;
      }

      // And the date on his first letter, which is a different fact from the
      // latch above and is written once (0.37.1). Refused on every morning
      // after the first, deliberately and without comment: the stamp exists so
      // that the mail already in the inbox does not move when he writes again.
      this.engine.dispatch(
        WORLD_ACTIONS.raciFirstComplaint,
        this.actor,
        box,
        {},
      );

      const name = peer === null
        ? 'Their IT manager'
        : String(peer.fields[FIELDS.name] ?? 'Their IT manager');

      this.handlers.onNotice?.(
        'The other IT team has been in touch',
        `${name} has read his overnight monitoring and found the MSP on `
        + `${this.hostnameOf(box)} - his box under the RACI - with nobody `
        + 'having told him. Nothing was blocked and nothing was broken; he is '
        + 'simply the man whose application it is, and he found out afterwards.',
      );
    }
  }

  /**
   * The compliance sweep noticing a box left in permissive mode (E6, 0.28.0).
   *
   * The twin of `settleSecurityFallout`, deliberately: the world decides whether
   * there is a consequence (`selinuxAuditDue` - permissive since yesterday, not
   * yet reported), and this dispatches the verb that writes the record the mail
   * hangs off. It charges nothing. The cost of `setenforce 0` is that it is
   * WRITTEN DOWN, with a hostname on it, by somebody who was not asked - which
   * is what makes it a different fix from the relabel rather than a worse one.
   *
   * Inert everywhere it does not apply, and that is most places: no box on the
   * seeded estate has SELinux on it at all, so the read returns nothing until a
   * player has put the RHEL family on their own machine and reached for the
   * switch.
   */
  private settleSelinuxAudit(): void {
    for (const box of selinuxAuditDue(this.engine.graph, this.engine.now())) {
      const result = this.engine.dispatch(
        SELINUX_ACTIONS.selinuxNoticed,
        this.actor,
        box,
        {},
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Compliance sweep',
          `The overnight sweep has ${this.hostnameOf(box)} down as not `
          + 'enforcing. It is not a telling-off and nothing is being taken off '
          + 'you - it is a line on a list with a date beside it, and it is in '
          + 'your inbox.',
        );
      }
    }
  }

  /* -- the project (E10, 0.29.0) ------------------------------------------ */

  /**
   * The kickoff: the morning an engineer at the MSP is handed the edge job.
   *
   * It is a "what is due right now" read like every other settler on this rail -
   * the world decides, the driver acts - and the four conditions it reads are
   * the four honest ones. There has to be an estate to work on (the ARDEN boxes,
   * which exist only in the MSP world). The player has to be a Systems Engineer,
   * because a project is not service-desk work and the tier IS the line. The
   * project must not already exist, which is what makes a reload, a replay or a
   * second start of shift a no-op rather than a second set of dates. And there
   * has to be room in the WEEK: three working days, so a project handed out on a
   * Thursday is a project the week has nowhere to put, and it waits.
   *
   * The dates are baked HERE, against this minute, and never again - which is
   * the whole of why the phase machine survives a save. Standing the same
   * project up twice would re-bake them against a later clock and quietly move
   * every deadline the player had been planning against.
   */
  private settleProjectKickoff(): void {
    if (this.engine.graph.getNode(MSP_IDS.ardenEdgeOld) === undefined
      || this.engine.graph.getNode(ARDEN_EDGE_PROJECT) !== undefined
      || !isSystemsEngineer(
        this.engine.graph.getField(this.actor, FIELDS.playerTier),
      )) {
      return;
    }

    const day = this.day();

    if (day + PROJECT_DAYS - 1 > WEEK_DAYS) {
      return;
    }

    const now = this.engine.now();
    this.engine.applySetup(ardenEdgeKickoffSetup(now));

    for (const id of PROJECT_KICKOFF_TICKETS) {
      this.raiseSummonedTicket(id);
    }

    const status = projectStatus(this.engine.graph, ARDEN_EDGE_ESTATE, now);
    this.announce();
    this.handlers.onNotice?.(
      'Project assigned: ARDEN-MFG edge replacement',
      'Dev Sharma has signed off the swap of ARD-FW-01 for the box that has '
      + 'been in their comms cabinet since July. Three working days, four '
      + 'tasks, and a change window for the cutover. The audit is due by '
      + `${
        status === null || status.due === null
          ? 'lunchtime'
          : projectClockLabel(status.due)
      } - "fw status" has the whole plan against the clock.`,
    );
  }

  /**
   * The morning after, and the only phase of a project that makes work.
   *
   * `screamTestDue` decides - a night has gone by since the cable moved and a
   * rule is still only on the old box - and this raises the ticket that rule
   * names, one per rule, each about that rule and nothing else. Same rail and
   * same latency as the compliance sweep and the unverified enrolment, for the
   * reason written down there: a day is how long it takes somebody else to
   * notice, and a consequence that landed in the same afternoon would read as a
   * punishment for the keystroke rather than as the cost of the omission.
   *
   * A project that carried everything makes no work here at all. That morning is
   * meant to be quiet, it is reachable by doing the job properly, and nothing
   * below fires on it - which is the reward, and the only one this mechanic has.
   */
  private settleScreamTest(): void {
    for (const finding of screamTestDue(
      this.engine.graph,
      ARDEN_EDGE_PROJECT,
      this.engine.now(),
    )) {
      const result = this.engine.dispatch(
        PROJECT_ACTIONS.screamNoticed,
        this.actor,
        finding.rule,
        {},
      );

      if (!result.ok) {
        continue;
      }

      this.raiseSummonedTicket(finding.ticket);
      this.handlers.onNotice?.(
        'Arden are on the phone',
        `${ticketTitle(finding.ticket)} - it worked on the old box and it is `
        + 'not on the new one. Nobody at the plant knows a firewall was '
        + 'replaced; they know their line has stopped.',
      );
    }
  }

  /** The plan against the clock, for whatever surface is asking. */
  public projectBoard(): readonly string[] {
    return projectBoardLines(
      this.engine.graph,
      ARDEN_EDGE_ESTATE,
      this.engine.now(),
    );
  }

  public projectView(): ProjectStatus | null {
    return projectStatus(
      this.engine.graph,
      ARDEN_EDGE_ESTATE,
      this.engine.now(),
    );
  }

  /** One task ticket, as a row: what it is, and whether it is on the desk. */
  private projectTaskRow(id: string): ProjectTaskRow {
    // `ticketState` answers undefined for a node that is not there, which is
    // exactly the locked case: the milestone lock is arrival, so a task that
    // has not been raised has no state to report and is not a dead row - it is
    // a line on the plan that nothing has reached yet.
    const state = this.engine.ticketState(id) ?? null;

    return {
      id,
      title: ticketTitle(id),
      arrived: state !== null,
      state,
      resolved: state === 'resolved',
    };
  }

  /**
   * The plan, as a board draws it.
   *
   * Every fact here is read, none is stored, and the phase each row is measured
   * against comes from ONE derivation - `projectStatus` - rather than from four
   * gate reads of its own. That is what keeps this surface and `fw status`
   * incapable of disagreeing: the chain says the live phase is the first gate
   * that has not passed, so a row's state is its position against that phase,
   * and a rollback moves the whole board back with nothing to remember.
   */
  public projectPlan(): ProjectPlanView | null {
    const now = this.engine.now();
    const graph = this.engine.graph;
    const status = projectStatus(graph, ARDEN_EDGE_ESTATE, now);

    if (status === null) {
      return null;
    }

    const projectId = ARDEN_EDGE_ESTATE.projectId;
    const here = PROJECT_PHASES.indexOf(status.phase);
    const name = graph.getField(projectId, FIELDS.name);
    const customerId = graph.getField(projectId, FIELDS.projectCustomer);
    const customer = typeof customerId === 'string'
      ? graph.getField(customerId, FIELDS.name)
      : null;
    // What the audit established, and therefore what the board is allowed to
    // know: null until somebody has read the box or taken the pack as read.
    const source = auditSourceOf(
      graph.getField(ARDEN_EDGE_ESTATE.edgeBoxId, FIELDS.fwAuditSource),
    );

    const phases = PLAN_PHASES.map((phase): ProjectPhaseRow => {
      const index = PROJECT_PHASES.indexOf(phase);
      const state: ProjectPhaseState = index < here
        ? 'done'
        : index === here ? 'now' : 'ahead';
      const dueField = graph.getField(projectId, PHASE_DUE_FIELDS[phase]);
      const due = typeof dueField === 'number' ? dueField : null;
      const task = PHASE_TASKS[phase];

      return {
        phase,
        label: PROJECT_PHASE_LABELS[phase],
        state,
        due,
        dueLabel: due === null ? '' : projectClockLabel(due),
        minutesLeft: due === null ? 0 : signedServiceMinutes(now, due),
        // A phase that is done is not late whatever the clock says: it was
        // finished, and a board that kept shouting about a date somebody
        // already met is a board nobody reads the rest of.
        late: state !== 'done' && due !== null && now > due,
        task: task === null ? null : this.projectTaskRow(task),
      };
    });

    return {
      status,
      name: typeof name === 'string' ? name : projectId,
      customer: typeof customer === 'string' ? customer : '',
      phases,
      delivery: this.projectTaskRow(ARDEN_EDGE_TASKS.parent),
      rules: projectRules(graph, projectId)
        .filter((rule) => ruleIsKnown(rule, source))
        .map((rule): ProjectRuleRow => {
          const label = rule.fields[FIELDS.name];
          const short = rule.fields[FIELDS.serviceName];

          return {
            id: rule.id,
            label: typeof label === 'string' ? label : rule.id,
            short: typeof short === 'string' ? short : rule.id,
            documented: rule.fields[FIELDS.fwRuleDocumented] === true,
            migrated: ruleIsMigrated(rule),
          };
        }),
      ruleSource: source,
    };
  }

  /**
   * The cutover, and the one gate that is not in the verb.
   *
   * The window is consulted HERE, before the dispatch, with the same
   * `changeRequestAuthorises` the systemctl gate has used since 0.18.0 - one
   * question, one answer, one implementation. Without an approved request for
   * exactly this (box, verb), inside its window, the move is refused and the
   * refusal names where the paperwork has got to, because a dead end is not a
   * mechanic. The project does not get a private calendar: the slot comes from
   * the ordinary change-request flow, signed off by the customer's own IT.
   *
   * Fails CLOSED. Take the consult out and an unapproved cutover dispatches at
   * two in the afternoon, which is what the teeth test proves goes red.
   */
  public cutover(newBoxId: string): readonly string[] {
    const now = this.engine.now();
    const box = this.engine.graph.getNode(newBoxId);

    if (box === undefined || box.kind !== 'machine') {
      return [`${newBoxId} is not a box this estate knows about.`];
    }

    const authorised = this.engine.graph
      .nodesOfKind('change_request')
      .some((node) => changeRequestAuthorises(
        node,
        newBoxId,
        PROJECT_ACTIONS.cutover,
        now,
      ));

    if (!authorised) {
      const consult = changeRequestConsult({
        graph: this.engine.graph,
        now,
        targetId: newBoxId,
        verb: PROJECT_ACTIONS.cutover,
        verdict: 'co_managed',
      });

      return consult.allowed
        ? [
          'That change is approved, but not for this minute. A window is a '
            + 'window.',
        ]
        : [
          `Moving ${this.hostnameOf(newBoxId)} into the live path is an outage `
          + 'on somebody\'s whole site.',
          ...consult.lines,
        ];
    }

    // Through the driver's own dispatch rather than the engine's, because
    // closing a phase task RAISES the next one: the follow-up settler is what
    // turns the milestone lock from a comment into a mechanic, and it runs here.
    const result = this.dispatch(
      PROJECT_ACTIONS.cutover,
      this.actor,
      newBoxId,
      {
        [PROJECT_CIRCUIT_PARAM]: ARDEN_EDGE_ESTATE.circuitId,
        [PROJECT_FROM_PARAM]: ARDEN_EDGE_ESTATE.edgeBoxId,
        [PROJECT_PARAM]: ARDEN_EDGE_PROJECT,
      },
    );

    if (!result.ok) {
      return [result.reason];
    }

    this.announced(result);

    return [
      `Circuit moved: ${this.hostnameOf(ARDEN_EDGE_ESTATE.edgeBoxId)} -> `
      + `${this.hostnameOf(newBoxId)}. The site is behind the new box.`,
      'Two minutes of nothing, and then everything that is configured comes '
        + 'back. The old box stays racked until this is proven.',
      'What is NOT configured will not announce itself. You find that out from '
        + 'somebody who rings up, and it will not be today.',
    ];
  }

  /**
   * And back. A real verb with an honest price and no punishment in it.
   *
   * It undoes exactly one thing - the cable - and deliberately nothing else. The
   * cutover minute stays stamped, so the scream test still runs on the morning
   * after; anything the outage raised stands, because it happened. What it buys
   * is the site back on a box that was working an hour ago, which is what a
   * rollback is for, and the reason the old one was left in the rack.
   */
  public rollback(oldBoxId: string): readonly string[] {
    const result = this.dispatch(
      PROJECT_ACTIONS.rollback,
      this.actor,
      oldBoxId,
      {
        [PROJECT_CIRCUIT_PARAM]: ARDEN_EDGE_ESTATE.circuitId,
        [PROJECT_FROM_PARAM]: ARDEN_EDGE_ESTATE.newBoxId,
        [PROJECT_PARAM]: ARDEN_EDGE_PROJECT,
      },
    );

    if (!result.ok) {
      return [result.reason];
    }

    this.announced(result);

    return [
      `Circuit moved back: ${this.hostnameOf(ARDEN_EDGE_ESTATE.newBoxId)} -> `
      + `${this.hostnameOf(oldBoxId)}. The site is on the old edge again.`,
      'That is what the old box was left racked for, and using it is not a '
        + 'failure - deciding late is.',
      'The window is spent, though, and anything the last few minutes broke is '
        + 'still broken for the people who noticed. Book another one.',
    ];
  }

  /* -- the timesheet (0.30.0, slice 1) ------------------------------------ */

  /**
   * The two authored facts about a ticket the graph does not carry, handed to
   * the attribution as functions so the world module stays drivable from a
   * fixture with three nodes in it.
   */
  private workResolver(): WorkResolver {
    return { projectOfTicket: ticketProjectOf, nodesOfTicket: ticketNodes };
  }

  /**
   * One line of where the minutes went, written the minute what the player was
   * doing changed - and NOT written when it did not.
   *
   * It sits beside `recordTouches` because it answers the same question at a
   * different grain: that one is "what was tried on this fault" and this is
   * "whose afternoon was that". Both are written now rather than reconstructed
   * later, and both live on a node rather than in the dispatch log, because the
   * log is drained at every day boundary and a timesheet is a week long.
   *
   * Only during the shift. The morning brief is not paid, the evening is not
   * billable, and a sheet that opened a line for reading the post would be a
   * sheet inventing hours nobody worked.
   */
  private noteWorkSegment(target: NodeId | null): void {
    if (this.state() !== 'shift') {
      return;
    }

    const ref = attributionFor(
      this.engine.graph,
      target,
      this.workResolver(),
    );

    if (ref !== null && target !== null) {
      this.recordSegment(ref, target);
    }
  }

  /**
   * The ledger, re-read against what the world says NOW about the thing those
   * minutes were spent on (E9, 0.38.0 verifier round).
   *
   * The recorder writes a bucket in the minute the player acts, and for one
   * class of target that is a bucket the world has not decided yet. An
   * out-of-scope ask is `customer` - billable - until it is answered, and three
   * of the four answers make every minute ever spent on it unbillable, because
   * out-of-contract work never bills whatever the answer. The audit read
   * (`segmentsFromLog`) gets this right for free, since it re-resolves the
   * attribution off the ticket every time it runs; the ledger did not, so the
   * two disagreed about the half hour before the answer and the customer was
   * invoiced for it.
   *
   * BEFORE `noteWorkSegment` rather than after, so the corrected line and the
   * minute that corrected it are the same stretch: the player did not stop
   * working on the ask to answer it.
   *
   * Not gated on the shift. It corrects minutes already recorded, and whether
   * the correcting act happens to fall inside the shift is not a fact about
   * whose afternoon they were.
   */
  private settleAttributionDrift(source: NodeId | null): void {
    if (source === null) {
      return;
    }

    const existing = this.playerText(FIELDS.timesheetLog);

    if (existing.length === 0) {
      return;
    }

    const ref = attributionFor(this.engine.graph, source, this.workResolver());

    if (ref === null) {
      return;
    }

    const lines = rebucketSource(existing, source, ref);

    if (lines === existing) {
      return;
    }

    this.engine.dispatch(TIMESHEET_ACTIONS.record, this.actor, null, { lines });
  }

  /**
   * The ledger, moved on - or left exactly where it was, which is what happens
   * most minutes.
   *
   * The whole field is computed here and handed over as one parameter, the way
   * a touch record and a conduct line are: the encoding lives in one module,
   * the engine only insists it is a field, and a replay writes the identical
   * string rather than rebuilding it against a clock nobody saved. An unchanged
   * field dispatches nothing at all, so carrying on with what you were doing
   * costs the log nothing.
   */
  private recordSegment(
    ref: Readonly<SegmentRef>,
    source: NodeId | null,
  ): void {
    const existing = this.playerText(FIELDS.timesheetLog);
    const lines = withSegment(existing, this.engine.now(), ref, source);

    if (lines === existing) {
      return;
    }

    this.engine.dispatch(TIMESHEET_ACTIONS.record, this.actor, null, { lines });
  }

  /**
   * The other half, and the one that gives slacking its second cost: a window
   * the player is actually IN that is not work ends whatever segment was
   * running.
   *
   * Nothing is charged for it and nothing is refused. The forum simply owns the
   * minutes from here until the next thing the player does, and owning them is
   * how they stop being on anybody's invoice - which is the honest cost the
   * sheet was built to show, felt at the sheet rather than only when the lead
   * comes round the corner.
   *
   * The FOCUSED app rather than every open one, for the same reason the calm
   * meter reads that half: a browser behind the queue is a window, and the
   * minute belongs to whatever the keyboard is in.
   */
  private trackSlackTime(): void {
    if (this.state() !== 'shift') {
      return;
    }

    const app = this.handlers.focusedSlackApp();

    if (app !== null) {
      this.recordSegment({ kind: 'slack', id: app }, null);
    }
  }

  /** The player's tier, which is the only thing that shapes the sheet. */
  public playerTier(): PlayerTier {
    return playerTierOf(this.engine.graph.getField(this.actor, FIELDS.playerTier));
  }

  /**
   * What the week ACTUALLY was, read off the ledger and the clock.
   *
   * The single derivation. `timesheet()` below pre-fills from this and every
   * later "what really happened" reading calls this same method - there is no
   * second copy of the arithmetic and no stored summary for one to drift from.
   */
  public timesheetTruth(): TimesheetTruth {
    return deriveTimesheet(
      segmentsFrom(this.playerText(FIELDS.timesheetLog)),
      this.engine.now(),
    );
  }

  /** The claim as it stands: what the player says, line by line. */
  public timesheetClaims(): readonly TimesheetClaim[] {
    return claimsFrom(this.playerText(FIELDS.timesheetClaim));
  }

  /** The sheet: the truth and the claim side by side, in the tier's shape. */
  public timesheet(): Timesheet {
    return timesheetSheet(this.timesheetTruth(), this.timesheetClaims(), {
      tier: this.playerTier(),
      submittedAt: this.timesheetSubmittedAt(),
      submittedAuto:
        this.engine.graph.getField(this.actor, FIELDS.timesheetSubmittedAuto)
          === true,
      labelOf: (kind: SegmentKind, id: string) => this.workLabel(kind, id),
    });
  }

  private timesheetSubmittedAt(): number | null {
    const value = this.engine.graph.getField(
      this.actor,
      FIELDS.timesheetSubmittedAt,
    );

    return typeof value === 'number' ? value : null;
  }

  /** How a line of the sheet names what it is about. */
  private workLabel(kind: SegmentKind, id: string): string {
    if (kind === 'customer') {
      return customerName(this.engine.graph, id);
    }

    // The out-of-scope favour (E9, 0.38.0): the customer's name, and what the
    // hour actually was. The name has to be on it - "internal" would hide the
    // one fact worth reading, which is whose free afternoon this was - and the
    // words after it are what the line is for.
    if (kind === 'unbilled') {
      return `${customerName(this.engine.graph, id)} (off contract)`;
    }

    if (kind === 'project') {
      const name = this.engine.graph.getField(id, FIELDS.name);

      if (typeof name === 'string' && name.length > 0) {
        // The project's own name, up to the bracket: content writes it with the
        // customer already on the front ("ARDEN-MFG: edge firewall replacement
        // (ARD-FW-01 -> ARD-FW-02)"), and the two box names after it are the
        // plan's business rather than the invoice's.
        const bracket = name.indexOf(' (');
        return bracket === -1 ? name : name.slice(0, bracket);
      }

      const customer = this.engine.graph.getField(id, FIELDS.projectCustomer);

      return typeof customer === 'string'
        ? `${customerName(this.engine.graph, customer)} / ${id}`
        : id;
    }

    return 'Internal';
  }

  /**
   * The player's edit: this line is worth this many minutes, written to this
   * much detail.
   *
   * It writes the CLAIM field and nothing else. The derived minutes are still
   * exactly where they were a moment ago, which is the whole architecture of
   * the mechanic: what the customer is sent and what the engine recorded are
   * two separate pieces of paper from here on.
   */
  public claimTimesheet(
    handle: string,
    minutes: number | null,
    detail: ClaimDetail | null,
  ): DispatchResult {
    const sheet = this.timesheet();
    const found = lineAt(sheet, handle);

    if (found === null) {
      return {
        ok: false,
        reason: `There is no line "${handle}" on the sheet. The handles are `
          + 'day.line, and they are printed down the left of it.',
      };
    }

    const claim: TimesheetClaim = {
      day: found.day,
      bucket: found.line.bucket,
      minutes: minutes ?? found.line.claimed,
      detail: detail ?? found.line.detail,
    };

    return this.announced(this.engine.dispatch(
      TIMESHEET_ACTIONS.claim,
      this.actor,
      null,
      { claims: withClaim(this.playerText(FIELDS.timesheetClaim), claim) },
    ));
  }

  /**
   * The sheet, in.
   *
   * `auto` is the week ending on a sheet nobody filled in, and it is the same
   * verb because it is the same event: the customer is sent the same hours
   * either way. The only thing that differs is the label on it, and the label
   * is honest.
   */
  public submitTimesheet(auto = false): DispatchResult {
    return this.announced(this.engine.dispatch(
      TIMESHEET_ACTIONS.submit,
      this.actor,
      null,
      { auto: auto ? 1 : 0 },
    ));
  }

  /* -- the two readers of the sheet (0.30.0, slice 2) --------------------- */

  /**
   * The ORG's reading: what you SAID, over the hours you were here, against
   * what your tier is asked for.
   *
   * Live rather than snapshotted, unlike the mark and the conduct line beside
   * it on the same card - and that is the difference between a reading and a
   * verdict. The mark decides whether the player still has a job, so it stops
   * moving at three o'clock; this decides nothing at all, so it is honest for
   * it to keep answering what the sheet currently says. Filing a line at four
   * moves it, which is correct: the sheet is still open until the week ends.
   */
  public timesheetUtilisation(): UtilisationReading {
    return utilisationOf(this.timesheet(), utilisationTargetFor(this.playerRung()));
  }

  /**
   * Which rung the player is on, off the two things the career already carries.
   *
   * One read, in one place, because there are now two questions that turn on it
   * - whether the second queue deals anything, and what the business asks of
   * the hours - and a second copy of the pair would be the seam they start
   * disagreeing across.
   */
  private playerRung(): Rung {
    return rungFor(this.playerTier(), this.playerText(FIELDS.title));
  }

  /** Which project a bucket's minutes belong to a customer through. */
  private projectCustomerOf(projectId: string): string | null {
    const value = this.engine.graph.getField(projectId, FIELDS.projectCustomer);
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /**
   * The three records the customer's side reads, wired to this world: the
   * conduct file the shop keeps, the customer's own estate event log, and the
   * bucket a line is filed against. All shipped, none new.
   */
  private invoiceRecordsView(): InvoiceRecords {
    return invoiceRecords(
      this.engine.graph,
      this.playerText(FIELDS.conductFile),
      (projectId: string) => this.projectCustomerOf(projectId),
    );
  }

  private deliveredRungs(): readonly DeliveredRung[] {
    return deliveredRungs(this.playerText(FIELDS.invoiceLadder));
  }

  /** Where each account stands, derived - and what has been said to it. */
  public invoiceStanding(): readonly {
    readonly customer: string;
    readonly label: string;
    readonly scrutiny: number;
    readonly rung: InvoiceRung;
    readonly delivered: InvoiceRung;
  }[] {
    const delivered = this.deliveredRungs();
    const standing = scrutinyByCustomer(
      this.timesheet(),
      this.invoiceRecordsView(),
      this.day(),
    );
    const rows = [...standing].map(([customer, scrutiny]) => ({
      customer,
      label: customerName(this.engine.graph, customer),
      scrutiny,
      rung: rungForScrutiny(scrutiny),
      delivered: rungDelivered(delivered, customer),
    }));

    return Object.freeze(
      rows.sort((left, right) => left.customer.localeCompare(right.customer)),
    );
  }

  /**
   * The ladder as the post it arrives as, derived off the delivered ledger and
   * the sheet as it stands. The mail app draws it beside the authored inbox;
   * nothing about it is stored, so a reload rebuilds the identical thread.
   */
  public invoiceMail(): readonly InvoiceThread[] {
    return invoiceThreads({
      sheet: this.timesheet(),
      records: this.invoiceRecordsView(),
      delivered: this.deliveredRungs(),
      labelOf: (customer: string) => customerName(this.engine.graph, customer),
      contactOf: (customer: string) => invoiceContact(this.engine.graph, customer),
      accountManager: MSP_IDS.mspLead,
    });
  }

  /**
   * The itemised breakdown, answered out of the derivation - the rung whose
   * whole cost is being read out loud beside the real log.
   */
  public invoiceBreakdown(customer: string): readonly string[] {
    return breakdownLines(
      this.timesheet(),
      this.invoiceRecordsView(),
      customer,
      customerName(this.engine.graph, customer),
    );
  }

  /**
   * The morning's post from accounts payable: one rung, per account, in order.
   *
   * The ladder is DERIVED and only the delivery is written down, so this cannot
   * skip a rung, cannot deliver one twice, and stops entirely the moment the
   * sheet is put back - which is what makes every rung of it escapable.
   */
  private settleInvoiceLadder(): void {
    const due = invoiceLadderDue(
      this.timesheet(),
      this.invoiceRecordsView(),
      this.deliveredRungs(),
      this.day(),
    );

    for (const step of due) {
      const result = this.engine.dispatch(
        INVOICE_ACTIONS.escalate,
        this.actor,
        null,
        {
          [INVOICE_LADDER_PARAM]: withDeliveredRung(
            this.playerText(FIELDS.invoiceLadder),
            {
              customer: step.customer,
              rung: step.rung,
              tick: this.engine.now(),
            },
          ),
        },
      );

      if (!result.ok) {
        continue;
      }

      this.announceInvoiceStep(step);
    }
  }

  /** What the player is told, in the minute the rung is handed over. */
  private announceInvoiceStep(step: Readonly<LadderStep>): void {
    const label = customerName(this.engine.graph, step.customer);

    this.handlers.onInvoiceEscalation?.(
      step.rung,
      step.customer,
      label,
      step.rung === 'breakdown'
        ? this.invoiceBreakdown(step.customer)
        : [],
    );
    this.handlers.onNotice?.(
      `${label}: ${INVOICE_RUNG_LABELS[step.rung]}`,
      step.rung === 'left'
        ? `${label} have given notice. Their work stops arriving; what is `
          + 'already on your desk is still yours to finish, and the record of '
          + 'everything done for them stays exactly where it is.'
        : 'It is in the mail app, with the line they are asking about on it.',
    );
  }

  /* -- the watermelon (0.30.0, slice 3) ----------------------------------- */

  public projectReports(): readonly StatusReport[] {
    return reportsFrom(this.playerText(FIELDS.projectReport));
  }

  /**
   * The colour, filed. It changes nothing about the project and that is the
   * whole design: the phase, the dates and the slip are still derived, and
   * this is stored beside them as what the business was told.
   */
  public writeUpClass(): string | null {
    return writeUpDue(this.engine.graph, this.actor);
  }

  /**
   * The other answer to somebody else's filing. Through `this.dispatch` rather
   * than at the engine, because agreeing with a triage is WORK on that ticket -
   * it is a touch, it stops the response clock, and the timesheet is entitled
   * to know the minute went on the audit queue.
   */
  public confirmAudit(ticketId: string): DispatchResult {
    return this.dispatch(AUDIT_ACTIONS.auditConfirm, this.actor, ticketId, {});
  }

  /**
   * The article. Aimed at nothing, because it is about a class rather than a
   * ticket - and `announced` rather than `dispatch` for the same reason: there
   * is no ticket for a touch to go onto.
   */
  public writeUpArticle(): DispatchResult {
    return this.announced(
      this.engine.dispatch(AUDIT_ACTIONS.kbWriteUp, this.actor, null, {}),
    );
  }

  public reportProject(rag: ProjectRag): DispatchResult {
    return this.announced(this.engine.dispatch(
      PROJECT_ACTIONS.report,
      this.actor,
      null,
      {
        [PROJECT_REPORT_PARAM]: withReport(
          this.playerText(FIELDS.projectReport),
          { day: this.day(), rag, tick: this.engine.now() },
        ),
      },
    ));
  }

  /** What was reported today, beside what the plan says. Both derived reads. */
  public projectReportReadout(): readonly string[] {
    return watermelonReadout(
      this.projectView(),
      this.projectReports(),
      this.day(),
    );
  }

  /** The honest colour, off the derivation - never off the report. */
  public projectHonestRag(): ProjectRag | null {
    const status = this.projectView();
    return status === null ? null : honestRagFor(status);
  }

  /**
   * What the org owes an answer to this morning: the red it was told, and the
   * green it was told about a date that has since gone past.
   */
  private settleWatermelon(): void {
    const due = watermelonDue(
      this.projectView(),
      this.projectReports(),
      answeredBeats(this.playerText(FIELDS.projectReportAnswered)),
      this.engine.now(),
    );

    for (const entry of due) {
      const result = this.engine.dispatch(
        PROJECT_ACTIONS.reportAnswered,
        this.actor,
        null,
        {
          [PROJECT_ANSWERED_PARAM]: withAnsweredBeat(
            this.playerText(FIELDS.projectReportAnswered),
            beatKey(entry.beat, entry.report.day),
          ),
        },
      );

      if (!result.ok) {
        continue;
      }

      const lines = watermelonLines(entry);

      this.handlers.onWatermelon?.(entry, lines);
      this.handlers.onNotice?.(
        entry.beat === 'red_answered'
          ? 'Delivery would like half an hour'
          : 'A question about the status report',
        lines.join(' '),
      );
    }
  }

  /* -- the lead, doing his rounds ---------------------------------------- */

  /**
   * Everything the boss did in the minutes just gone: footsteps, arrivals, and
   * the messages he sends instead of raising tickets.
   *
   * All of it is keyed to the day's seeded schedule, and all of it is decided
   * against the world as it stands AT THE ARRIVAL - which is the mechanic: the
   * player's move is what is on their screen when he gets there, made several
   * minutes earlier, when the floor started creaking.
   */
  private walkTheFloor(after: number, now: number): void {
    if (this.state() !== 'shift') {
      return;
    }

    if (visitsTelegraphingBetween(this.patrol_, after, now).length > 0) {
      this.announceFootsteps();
    }

    for (const visit of visitsArrivingBetween(this.patrol_, after, now)) {
      this.settleVisit(visit);
    }

    // The pings are the probation lead's own beat - his concern minted as a
    // ticket, his messages - so an employer that does not run them (a different
    // lead, a different estate) fires none (0.6.0 slice 3, P1-4). His FOOTSTEPS
    // and his catching you slacking above are generic office life and stay.
    if (this.runsBossPings_) {
      for (const ping of pingsBetween(this.patrol_, after, now)) {
        this.settlePing(ping);
      }
    }
  }

  private announceFootsteps(): void {
    this.handlers.onNotice?.(
      'Footsteps',
      'Somebody is coming down the corridor at the pace of a man who has '
      + `nothing to do and a floor to walk. You have ${
        String(TELEGRAPH_TICKS)
      } minutes and one key.`,
    );
    // The taskbar and the door reflection are driven off `boss()`, which is a
    // function of the clock - so all this has to do is ask for a repaint.
    this.announce();
  }

  /**
   * The arrival: two observations, settled independently.
   *
   * Being caught is decided on what is genuinely on the screen. The empties
   * are a second, cheaper conversation about a desk that told the story on its
   * own - and a man who has just found a browser open does not stop noticing
   * the cans. Settling only the first one made the screen a hiding place for
   * the desk, which is the wrong way round.
   */
  private settleVisit(visit: Readonly<BossVisit>): void {
    const caught = caughtBy(this.handlers.openSlackApps());

    if (caught !== null) {
      const result = this.engine.dispatch(
        DAY_ACTIONS.bossCaught,
        this.actor,
        null,
        {
          file_line: conductLine(
            visit.arrivalTick,
            'screen',
            caughtScene(caught)?.fileSubject ?? GENERIC_CAUGHT_SCENE.fileSubject,
          ),
          // A conversation about a screen leaves the dot's own record exactly
          // where it was. He has not mentioned the status and has no reason
          // to: the morning it is evidence of is still going on.
          status_evidence_spent: 0,
        },
      );

      if (result.ok) {
        // A scene has just opened on somebody who was looking at something
        // else, and it is the third member of the family the ring rule names.
        // It is not an interruption ENTRY - the corridor is its own schedule -
        // so it says so here rather than through `slowsTheClock`, which is a
        // question about sources.
        this.slowDown('boss');
        // And the price, which is the clock rather than the scoreboard: he is
        // here now, and getting back to what you were doing is the rest of it.
        this.owedMinutes_ += CAUGHT_MINUTES;
        this.handlers.onCaught?.(caught, visit.arrivalTick, null);
        this.handlers.onNotice?.(
          `That is ${String(CAUGHT_MINUTES)} minutes`,
          'He was at the desk for a while and the queue was not. The shift is '
          + `${String(CAUGHT_MINUTES)} minutes shorter than it was and not one `
          + 'deadline moved with it. Nothing came off your reputation. A line '
          + 'has gone on your file, which you can read.',
        );
      }
    }

    // One conversation at a time, which is the precedence discipline the
    // takeover family already keeps: a man who has just found a forum open is
    // having THAT conversation, and the dot will still be there tomorrow.
    //
    // The two that are NOT on the screen - the install audit and the status -
    // are settled in that order when the screen turned nothing up, and only one
    // of them fires: a conversation about a program installed against policy is
    // a more concrete finding than one about a status inference, and the dot
    // will still be there tomorrow just as it would after a forum.
    if (caught === null && !this.settleSoftwareBeat(visit)) {
      this.settleStatusBeat(visit);
    }

    const cans = this.playerNumber(FIELDS.deskCans);

    if (!emptiesNoticed(cans)) {
      return;
    }

    const noticed = this.engine.dispatch(
      DAY_ACTIONS.bossNoticedEmpties,
      this.actor,
      null,
      {
        suspicion_up: EMPTIES_SUSPICION_BUMP,
        file_line: conductLine(
          visit.arrivalTick,
          'desk',
          `${String(cans)} empty cans`,
        ),
      },
    );

    if (noticed.ok) {
      this.handlers.onNotice?.(
        'He counted them',
        caught === null
          ? 'The lead looked at your screen, found nothing to say about it, '
            + 'and then looked at the cans. He did not mention the cans, '
            + 'which is worse than mentioning them.'
          : 'On his way back up the corridor he did the arithmetic on the '
            + 'cans as well. He did not mention those either.',
      );
    }
  }

  /**
   * The other thing he can find, which is not on the screen at all.
   *
   * The status beat, and it is the CAUGHT-SCENE CLASS rather than a new one:
   * the same verb, the same line on the file, the same minutes off the shift,
   * the same closeable window with the same button on it. What differs is what
   * he found - a dot saying busy over a dispatch log saying working - and that
   * is a sentence, not a mechanic.
   *
   * Three things keep it from being a random scold, and all three are the
   * world's rather than this driver's:
   *
   * - It fires on ARRIVAL, in the corridor's own schedule, so it is telegraphed
   *   exactly as every other conversation at this desk is.
   * - `armed` is a predicate over evidence the world wrote down: the dot is on
   *   NOW, the meter has actually climbed, and there is half an hour of
   *   do-not-disturb-while-working on the record.
   * - It cannot drum. `boss.caught` puts suspicion on the floor a spoken-to
   *   person sits at, which is below the threshold that armed it - so the next
   *   one costs another morning of the same behaviour rather than the next
   *   time he walks past.
   */
  private settleStatusBeat(visit: Readonly<BossVisit>): void {
    const beat = this.dndBeat();

    if (!beat.armed) {
      return;
    }

    // ONE reading, captured here, and both surfaces are handed it: the line
    // that goes on the file and the scene the player reads are two sentences
    // about the same morning, and a scene that recomputed the number live
    // would drift from the file the moment another minute of the dot went by.
    // The world is about to clear the record anyway - being spoken to closes
    // the morning it was about - so a live read afterwards is a read of
    // nothing at all.
    const minutes = beat.minutes;
    const result = this.engine.dispatch(DAY_ACTIONS.bossCaught, this.actor, null, {
      // The quantity goes on the FILE, where a quantity belongs; the scene
      // says the same thing in the words a man standing there would use.
      file_line: conductLine(
        visit.arrivalTick,
        'status',
        `${DND_CAUGHT_SCENE.fileSubject} for ${dndEvidence(minutes)}`,
      ),
      // And the morning is spent by having been mentioned.
      status_evidence_spent: 1,
    });

    if (!result.ok) {
      return;
    }

    this.slowDown('boss');
    this.owedMinutes_ += CAUGHT_MINUTES;
    this.handlers.onCaught?.(PRESENCE_CAUGHT_KEY, visit.arrivalTick, minutes);
    this.handlers.onNotice?.(
      `That is ${String(CAUGHT_MINUTES)} minutes`,
      'He did not find anything on your screen. He read your status instead, '
      + 'held it against a morning of dispatches, and came down to ask about '
      + `it. The shift is ${String(CAUGHT_MINUTES)} minutes shorter and a line `
      + 'has gone on your file, which you can read.',
    );
  }

  /**
   * The third thing he can find, and it is not on the screen either: the install
   * audit, a program on the list of software this workstation holds against a
   * locked-down policy.
   *
   * Same CAUGHT-SCENE CLASS as the status beat - the same verb, a line on the
   * file, the same minutes off the shift, the same closeable window - and the
   * same three things keep it from being a random scold:
   *
   * - It fires on ARRIVAL, telegraphed like every other conversation here.
   * - `armed` is a predicate over evidence the world wrote down: a program on
   *   the trail under a locked-down policy, read off `install_audit`.
   * - It cannot drum. Being spoken to copies the audit trail into the "spoken
   *   about" field, so every install on the list so far is closed; a fresh
   *   install lands as a line the copy does not hold and re-arms it. Answers
   *   whether it spoke, so the caller can fall through to the status beat.
   *
   * The surfaced records - the actual installs this conversation is about - are
   * handed to the scene so it can NAME them and say nothing false about them: the
   * generic "that game" the scene used to hardcode was a lie the moment the only
   * install was a media player, and a claimed removal was a lie the moment
   * nothing had been removed. The window reads the ids back to their titles and
   * their real removal state; the driver only says which records were covered.
   */
  private settleSoftwareBeat(visit: Readonly<BossVisit>): boolean {
    const beat = this.installAuditBeat();

    if (!beat.armed) {
      return false;
    }

    // The specific installs this conversation covers, deduped by app so a toy
    // installed twice is named once. Captured at the arrival, because the copy
    // below closes them and a window asking afterwards would ask about nothing.
    const covered = [...new Set(this.unspokenInstalls().map((r) => r.id))];

    const result = this.engine.dispatch(DAY_ACTIONS.bossCaught, this.actor, null, {
      file_line: conductLine(
        visit.arrivalTick,
        'software',
        INSTALL_CAUGHT_SCENE.fileSubject,
      ),
      // The flag that copies the audit into the "spoken about" field, closing
      // exactly what was on the trail. It is not the status conversation, so
      // that param stays absent.
      software_spoken: 1,
    });

    if (!result.ok) {
      return false;
    }

    this.slowDown('boss');
    this.owedMinutes_ += CAUGHT_MINUTES;
    this.handlers.onCaught?.(INSTALL_CAUGHT_KEY, visit.arrivalTick, null, covered);
    this.handlers.onNotice?.(
      `That is ${String(CAUGHT_MINUTES)} minutes`,
      'He did not find anything on your screen. He read the install log '
      + 'instead - a program on it this workstation is not allowed - and came '
      + `down about it. The shift is ${String(CAUGHT_MINUTES)} minutes shorter `
      + 'and a line has gone on your file, which you can read. Taking the '
      + 'program off does not take the line off.',
    );
    return true;
  }

  /**
   * The third of the aggressive register's costs, and the only one that is not
   * world-enforced by the reply itself: the lead heard it.
   *
   * The reputation and the reporter's reaction ride the `reporter.rebuff` effect
   * on the option, which pays whether or not anybody was listening. This is the
   * part that depends on WHERE HE IS in the minute it was said, so it lives here
   * with the rest of the corridor - and it is the caught-scene class, byte for
   * byte the shape of the status and install beats: the same verb, a line on the
   * file, the same minutes off the shift, the same closeable window.
   *
   * It arms on the one thing and never at random: `present` is he-is-at-your-
   * shoulder RIGHT NOW, off the same seeded schedule the footsteps came from, so
   * a reply sent while he is in his office fires nothing here. `bossCaught` puts
   * suspicion on the floor a spoken-to person sits at, so it cannot drum - the
   * next one costs another minute of him being in the room.
   */
  public witnessedRudeReply(): boolean {
    if (this.state() !== 'shift') {
      return false;
    }

    const now = this.engine.now();

    if (patrolPhase(this.patrol_, now) !== 'present') {
      return false;
    }

    const result = this.engine.dispatch(DAY_ACTIONS.bossCaught, this.actor, null, {
      file_line: conductLine(now, 'conduct', RUDE_CAUGHT_SCENE.fileSubject),
      // Not the status conversation and not the software one: those params stay
      // absent, so nothing about the dot's record or the install audit moves.
    });

    if (!result.ok) {
      return false;
    }

    this.slowDown('boss');
    this.owedMinutes_ += CAUGHT_MINUTES;
    this.handlers.onCaught?.(RUDE_CAUGHT_KEY, now, null);
    this.handlers.onNotice?.(
      `That is ${String(CAUGHT_MINUTES)} minutes`,
      'The lead was at your shoulder when you said it, and he heard every word. '
      + `The ticket still gets fixed; the shift is ${String(CAUGHT_MINUTES)} `
      + 'minutes shorter and a line has gone on your file about your tone, which '
      + 'you can read.',
    );
    return true;
  }

  private settlePing(ping: Readonly<BossPing>): void {
    if (ping.ticketId !== null) {
      this.raiseSummonedTicket(ping.ticketId);
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.bossPing,
      this.actor,
      null,
      { stress_up: PING_STRESS },
    );

    if (result.ok) {
      this.handlers.onBossPing?.(ping);
    }
  }

  /**
   * A ticket the day scheduler was never given a slot for.
   *
   * The boss's first ping raises one - his concern, made a ticket by his
   * mentioning it - and that ticket is a piece of a PARTICULAR shop's content:
   * the probation lead's `ticket:boss-phone`, reported by a probation person.
   * A second employer (0.6.0 slice 3) whose lead is not that man, and whose
   * estate does not contain that reporter, has no such ticket to raise - so the
   * driver only raises one whose reporter is actually in the world it is
   * standing in. In the probation world that reporter is present and nothing
   * changes; in a world without them there is simply nothing to summon, which
   * is the honest reading of a shop that never authored the beat. Everything
   * else the ping does - the stress, the thread - still happens, because the
   * lead is still at your shoulder whichever building it is.
   */
  private raiseSummonedTicket(ticketId: string): void {
    if (this.engine.graph.getNode(ticketId) !== undefined) {
      return;
    }

    const reporter = findWorldTicket(ticketId)?.def.reporter;

    if (reporter === undefined
      || this.engine.graph.getNode(reporter) === undefined) {
      return;
    }

    spawnWorldTicket(this.engine, ticketId);
  }

  /* -- being taken off the work ------------------------------------------ */

  /**
   * What is taking the screen off the player this minute.
   *
   * Derived on every call rather than remembered, from three things that all
   * survive a save: the day's seeded schedule, the clock, and the three lists
   * the world keeps of what was decided. That is what makes the mid-state
   * promise cheap - a save taken while the phone is ringing restores with the
   * phone ringing, because there was never anything to save.
   *
   * A declined entry stops owning the screen the minute it is declined, which
   * is the point of declining; a deferred one stops owning it and comes back
   * at the minute `placeDeferred` puts it, which is twenty minutes out and
   * clear of everything else the day had booked.
   */
  public interruption(): InterruptionView | null {
    if (this.state() !== 'shift') {
      return null;
    }

    const now = this.engine.now();

    for (const entry of this.liveInterruptions()) {
      if (now < entry.tick || now >= entry.endsTick) {
        continue;
      }

      const ticketInHand = this.ticketInHand();

      return {
        entry,
        minutesIn: now - entry.tick,
        callback: this.hasDecided(FIELDS.interruptionDeferred, entry.id),
        postponesLeft: Math.max(
          0,
          entry.postpones.length - this.postponesSpent(entry.id),
        ),
        answered: this.hasDecided(FIELDS.interruptionAnswered, entry.id),
        benign: isBenign(entry, ticketInHand),
        ticketInHand,
      };
    }

    return null;
  }

  /**
   * The workstation that has been pushed back and is on its way, if there is
   * one.
   *
   * FILTERED FIRST, selected after, and the order is the whole of the
   * contract. Asked for "the next interruption" and then filtered by the
   * caller, an unmet call sitting between now and a postponed reboot is the
   * nearest entry - so the answer would be the call, the caller would discard
   * it, and the countdown the player was promised would blink out until the
   * phone rang. What the surfaces want is not "what is next" but "when does
   * the workstation take the desk", which is a question about one entry.
   *
   * A machine nobody has pushed yet is deliberately not one of them: an entry
   * the player has not met is a surprise the week is entitled to keep, and a
   * chip counting down to it would be the seeded schedule reading itself out
   * loud.
   *
   * Same sources as `interruption()` and the same absence of memory: the
   * seeded schedule, the clock, and the ledger of what has been spent. A
   * countdown drawn off this comes back from a save on the same minute with
   * the same number on it, because the number was never written down.
   */
  public pendingRestart(): UpcomingInterruption | null {
    if (this.state() !== 'shift') {
      return null;
    }

    const now = this.engine.now();
    const ledger = this.interruptionLedger();
    let soonest: InterruptionEntry | null = null;

    for (const entry of this.liveInterruptions()) {
      const spends = ledger.spentAt[entry.id] ?? [];

      if (
        entry.tick <= now
        || entry.source !== 'machine'
        || spends.length === 0
      ) {
        continue;
      }

      if (soonest === null || entry.tick < soonest.tick) {
        soonest = entry;
      }
    }

    if (soonest === null) {
      return null;
    }

    return {
      entry: soonest,
      ticksAway: soonest.tick - now,
      postponesLeft: Math.max(
        0,
        soonest.postpones.length - this.postponesSpent(soonest.id),
      ),
    };
  }

  /**
   * Every entry of the day as it now stands: the ones nobody has settled at
   * their authored minute, and the ones somebody pushed at the minute they
   * come back on.
   *
   * Settled is answered or declined - both are decisions, and neither of them
   * rings twice. Deferred is not settled, which is the whole of what deferring
   * means, and a callback with nowhere left in the day to go is dropped rather
   * than squeezed into the last minute of the shift.
   */
  private liveInterruptions(): readonly InterruptionEntry[] {
    // WHERE everything is comes first, and it is asked of the world rather
    // than of what has been decided since. An entry somebody pushed back lives
    // at the minute the callback was placed on, and it goes on living there
    // once it has been answered - the conversation is happening, and it is
    // happening in the callback's window rather than in the one twenty minutes
    // earlier that nobody was in.
    //
    // Reading those two questions in the wrong order is a real bug and was
    // one: an answered callback fell back to the ORIGINAL entry, whose minutes
    // were long past, so `interruption()` went null the instant the player
    // picked the phone up and the conversation vanished out from under them.
    //
    // The whole day is placed in ONE call rather than one entry at a time, and
    // that is the other real bug: two callbacks pushed from different minutes
    // can want the same minute, and two placements that each looked at the
    // other's ORIGINAL window would both take it - which the runtime assert
    // then reports as a crashed clock. `placeInterruptions` books each
    // placement against the last, so the collision is impossible rather than
    // caught.
    //
    // Every input is the world's: the minutes the pushes were pressed at and
    // the ids that were waved off. Nothing here is remembered, which is what
    // makes a mid-countdown save land back on the same minute with the same
    // budget left.
    return placeInterruptions(
      this.interruptions_,
      this.interruptionsBlocked_,
      this.interruptionLedger(),
    );
  }

  /**
   * What the world has recorded about today's interruptions.
   *
   * Two lists, both off the player node, both written by the verbs: the minute
   * every push was pressed, and the ids nobody is going to hear from again. It
   * is rebuilt on every call rather than cached, because a cache is a number a
   * load can leave disagreeing with the world - which is the whole reason none
   * of this lives in the driver.
   */
  private interruptionLedger(): InterruptionLedger {
    const spentAt = this.stampedLines(FIELDS.interruptionSpentAt);

    // A push the ids-only ledger knows about and this one has no minute for
    // is a record from a save written before the minute was kept - or from a
    // caller that dispatched the verb without stamping one. It is NOT lost:
    // it falls back to the arrival, which is 0.3.0's arithmetic exactly, and
    // which is exactly right for every save that can carry one (a call has a
    // budget of one window, so one unstamped push is one window from the
    // arrival). Losing it would be worse than any of that: an entry the world
    // says was pushed and the schedule cannot place is an entry that quietly
    // stops existing.
    for (const entry of this.interruptions_.entries) {
      const known = spentAt[entry.id] ?? [];
      const spent = this.postponesSpent(entry.id);

      for (let missing = known.length; missing < spent; missing += 1) {
        known.unshift(entry.tick);
      }

      if (known.length > 0) {
        spentAt[entry.id] = known;
      }
    }

    return {
      spentAt,
      declined: this.playerText(FIELDS.interruptionDeclined)
        .split('\n')
        .filter((id) => id.length > 0),
      // The dot's own ledger, read the same way and kept apart for the same
      // reason it is written apart: a slide is not a push, it spends no
      // budget, and a morning on do not disturb must not quietly eat a
      // workstation's postpones.
      dodgedAt: this.stampedLines(FIELDS.interruptionDodged),
    };
  }

  /**
   * An `id@tick` list off the player node, as minutes by id.
   *
   * One reader for both ledgers rather than two, because they are the same
   * shape written by two verbs, and a second copy of this parsing is a second
   * answer to "which minute did that happen on" waiting to disagree with the
   * first.
   */
  private stampedLines(field: string): Record<string, number[]> {
    const stamped: Record<string, number[]> = {};

    for (const line of this.playerText(field).split('\n')) {
      const mark = line.lastIndexOf('@');

      if (mark <= 0) {
        continue;
      }

      const id = line.slice(0, mark);
      const at = Number(line.slice(mark + 1));

      if (!Number.isSafeInteger(at)) {
        continue;
      }

      (stamped[id] ??= []).push(at);
    }

    return stamped;
  }

  /**
   * What the desk answers with while something is holding it in a way that
   * makes work impossible rather than merely awkward - and null while the desk
   * is the player's.
   *
   * A MEETING holds it, and so does a workstation installing updates, and they
   * refuse in different words because they are different rooms to be locked
   * out of: one is a meeting you are not at your desk during, the other is a
   * desk that is not there. A ringing phone deliberately holds nothing: a call
   * is a window, the normal rules keep applying underneath one, and being on
   * the phone has never been a defence for anything. The line is drawn on the
   * source rather than on "is a takeover on" so that the two stay different
   * things.
   *
   * It is checked in the driver rather than in each surface because the shell
   * has five ways to reach a verb and a rule enforced in four of them is a
   * rule with a hole in it - which is exactly what the pointer-events version
   * of this was: a terminal with the keyboard still submitted commands.
   */
  private takeoverRefusal(): string | null {
    return deskHeldReason(this.interruption()?.entry.source);
  }

  /** Whether an id is in one of the lists the world keeps. */
  private hasDecided(field: string, id: string): boolean {
    return this.playerText(field).split('\n').includes(id);
  }

  /**
   * How many postpones this interruption has had spent on it, counted off the
   * world's ledger.
   *
   * One line per push, so the count is the number of lines that ARE this id.
   * Nothing here caches it: it is asked every minute, on both sides of a save,
   * and a driver that kept its own tally would be a driver handing a restored
   * countdown its budget back.
   */
  private postponesSpent(id: string): number {
    return this.playerText(FIELDS.interruptionPostpones)
      .split('\n')
      .filter((line) => line === id)
      .length;
  }

  /**
   * How many times the dot has slid this one, which is the other way an
   * interruption can be held off without being a fresh arrival.
   *
   * Read off the same stamped ledger the placement reads (`interruptionDodged`,
   * "id@tick" a line), and kept apart from the postpone count for the reason the
   * ledgers are kept apart: a slide spends no budget. What the two share is the
   * one thing the arrival cost cares about - that a return is a return, charged
   * once, not a new call charged again.
   */
  private dodgesSpent(id: string): number {
    return (this.stampedLines(FIELDS.interruptionDodged)[id] ?? []).length;
  }

  /**
   * The ticket the player is actually on, which is what the cost model reads.
   *
   * The touch log knows: it is the ticket somebody most recently did something
   * about and has not finished. A resolved one is deliberately not in the
   * running - a call about a ticket you closed ten minutes ago is a call about
   * something else now - and a world where nothing has been touched answers
   * nothing, which makes every interruption in it malignant. That is correct:
   * somebody who is not on anything has still lost their place.
   */
  private ticketInHand(): string | null {
    let held: string | null = null;
    let latest = -1;

    for (const ticket of this.tickets()) {
      if (!isUnresolved(ticket)) {
        continue;
      }

      const touches = triedFromTouches(ticket.fields[FIELDS.touchLog]);
      const last = touches[touches.length - 1];

      if (last !== undefined && last.tick > latest) {
        latest = last.tick;
        held = ticket.id;
      }
    }

    return held;
  }

  /**
   * Everything the schedule had to say about the minutes just gone.
   *
   * Arrivals are read off `liveInterruptions` rather than off the schedule, so
   * a callback the player asked for lands as an arrival exactly like a first
   * one - same window, same stress, same three buttons, minus the one that
   * says no. Interruptions fire during the shift and nowhere else: the morning
   * brief is not paid time and nobody rings a desk that has clocked off.
   */
  private settleInterruptions(after: number, now: number): void {
    if (this.state() !== 'shift') {
      return;
    }

    const settled = new Set<string>();
    const ended = new Set<string>();

    // The pass is a LOOP because a slide changes where everything else in the
    // day stands: the entry the dot pushed out stops being a booking, and
    // something that had been slid out of its way can come back to a minute
    // that is now clear - including this one. Walking a placement taken before
    // the slide would miss that arrival entirely.
    //
    // It terminates: a slide moves its own entry at least `DND_SLIDE_MINUTES`
    // later, so nothing can be slid twice in one minute, and the sets below
    // make each entry's arrival and end the driver's business exactly once.
    for (let pass = 0; pass <= this.interruptions_.entries.length; pass += 1) {
      let slid = false;

      for (const entry of this.liveInterruptions()) {
        if (
          entry.tick > after
          && entry.tick <= now
          && !settled.has(entry.id)
        ) {
          settled.add(entry.id);

          if (this.dodge(entry)) {
            slid = true;
            break;
          }

          this.arrive(entry);
        }

        // The far side of it, whatever happened in between. The meeting
        // settles what it owes the world here, which is why this runs on the
        // END rather than on a button: nobody presses "the meeting is over".
        if (
          entry.endsTick > after
          && entry.endsTick <= now
          && !ended.has(entry.id)
        ) {
          ended.add(entry.id);
          this.finish(entry);
        }
      }

      if (!slid) {
        return;
      }
    }
  }

  /**
   * The dot, doing the one thing it does: a phone that does not ring.
   *
   * Answers whether the day moved, because the caller has to re-read a
   * placement this changed. Nothing about the ARRIVAL happens - no stress, no
   * window, no three answers - which is exactly the trade: the quiet is real,
   * and what it costs is the drip the meters charge for showing a status that
   * disagrees with the log.
   *
   * A slide that runs out of day is a call that is simply not going to happen,
   * and it goes into the missed list like a phone that rang out - minus the
   * window, because nothing rang. The record is the honest trace of it: the
   * dot dodged it, and somebody can read later that this desk did not take it.
   */
  private dodge(entry: Readonly<InterruptionEntry>): boolean {
    if (!dodgesUnderDnd(entry, this.presence())) {
      return false;
    }

    const now = this.engine.now();
    const slid = this.engine.dispatch(
      DAY_ACTIONS.interruptionDodged,
      this.actor,
      null,
      {
        id: entry.id,
        // The whole line, stamped here because this is the only place that
        // knows the minute - the same contract the postpone ledger keeps, and
        // for the same reason: the schedule measures the next arrival from the
        // slide rather than from the minute it was originally due.
        dodged_at: `${entry.id}@${String(now)}`,
        declinable: entry.declinable ? 1 : 0,
      },
    );

    if (!slid.ok) {
      return false;
    }

    if (!this.liveInterruptions().some((live) => live.id === entry.id)) {
      this.engine.dispatch(DAY_ACTIONS.interruptionMissed, this.actor, null, {
        id: entry.id,
        benign: isBenign(entry, this.ticketInHand()) ? 1 : 0,
        // It never rang. The window a ring-out costs is the ringing itself,
        // and there was none of it - so the record is the whole of what this
        // one leaves behind.
        rang: 0,
      });
    }

    this.handlers.onInterruptionDodged?.(entry, now);
    this.announce();
    return true;
  }

  /**
   * One interruption, arriving.
   *
   * The precedence check is an ASSERT rather than a guard, and that is
   * deliberate: the schedule already guarantees one takeover at a time by
   * construction, so a second one here is not a case to handle - it is a bug
   * in the thing that placed them, and handling it quietly would be how that
   * bug ships. The only entry that is placed at runtime is a callback, and
   * `placeDeferred` gets it out of the way of the same bookings.
   */
  private arrive(entry: Readonly<InterruptionEntry>): void {
    this.assertOneTakeover(entry);

    if (slowsTheClock(entry.source)) {
      this.slowDown(entry.source);
    }

    const benign = isBenign(entry, this.ticketInHand());
    // An arrival the player HELD OFF is the same dread coming round again rather
    // than new dread, so it is charged once - at the first one. Two things can
    // hold an interruption off, and until 0.4.3 only one of them counted here: a
    // POSTPONE the player pressed, and a SLIDE the dot caused. A dodged call that
    // comes back when the dot goes green is not a fresh call - it is the same one
    // the status pushed away, arriving late - so charging its arrival stress
    // again made Do Not Disturb a way to pay the cost TWICE (the drip AND the
    // stress on return) rather than a way to trade one for the other. The dodge
    // has to actually dodge: a slide spends no postpone, so the ledger it writes
    // is read here as well, and an interruption that was ever slid is waived the
    // arrival it would otherwise be charged a second time for.
    const heldOff = this.postponesSpent(entry.id) > 0
      || this.dodgesSpent(entry.id) > 0;
    const stress = heldOff ? 0 : arrivalStress(entry, benign);

    if (stress > 0) {
      this.engine.dispatch(
        DAY_ACTIONS.interruptionArrived,
        this.actor,
        null,
        { id: entry.id, stress_up: stress },
      );
    }

    // A meeting is not a choice, so the driver does not offer one: the block
    // simply starts, and the two refusals exist to say why when the player
    // presses them anyway.
    const view = this.interruption();

    if (view !== null) {
      this.handlers.onInterruption?.(view);
    }

    this.announce();
  }

  /**
   * The end of a block, and the only place the world learns a meeting
   * happened.
   *
   * `accept` is dispatched HERE for a meeting and at the button for a call,
   * and the difference is the refocus window rather than an inconsistency:
   * the twenty-three minutes are measured from the moment the player is handed
   * their desk back, and for a call that is the moment they pick the phone up
   * while for half an hour in a room it is the moment the room empties.
   */
  private finish(entry: Readonly<InterruptionEntry>): void {
    // The two nobody presses a button on. A meeting is sat through and a
    // workstation reboots itself, so the world learns they HAPPENED at the
    // minute they stop happening - which is also the minute the desk comes
    // back, and therefore the minute the refocus window is measured from.
    if (entry.source === 'machine') {
      this.engine.dispatch(DAY_ACTIONS.interruptionAccept, this.actor, null, {
        id: entry.id,
      });
    }

    if (entry.source === 'meeting') {
      this.engine.dispatch(DAY_ACTIONS.interruptionAccept, this.actor, null, {
        id: entry.id,
      });
      this.engine.dispatch(DAY_ACTIONS.meetingRecap, this.actor, null, {});
      this.handlers.onNotice?.(
        'That could have been an email',
        'The recap is in your inbox. It is the meeting, in full, with '
        + 'nothing taken out of it, because nothing was said that could be.',
      );
    }

    const benign = isBenign(entry, this.ticketInHand());

    if (this.hasDecided(FIELDS.interruptionAnswered, entry.id)) {
      // The screen is the player's again, and THIS is the minute the
      // twenty-three start from. A window opened when the phone was picked up
      // would have spent a third of itself recovering from a conversation that
      // had not finished happening.
      //
      // Benign is asked here rather than remembered from the answer, for the
      // same reason it is asked at both ends everywhere else in this family:
      // somebody who took a call about the ticket on their screen and is
      // still on it when they put the phone down did not lose their place.
      if (!benign) {
        this.engine.dispatch(DAY_ACTIONS.interruptionRefocus, this.actor, null, {
          id: entry.id,
        });
      }
    } else {
      // Nobody got to it. That is not a decision and it is not free: the
      // ringing pulled the thread whether or not anybody answered, and the
      // world keeps a record that this desk did not pick up - which is what
      // stops "ignore it" from being the correct answer to every phone.
      const missed = this.engine.dispatch(
        DAY_ACTIONS.interruptionMissed,
        this.actor,
        null,
        { id: entry.id, benign: benign ? 1 : 0 },
      );

      if (missed.ok) {
        // A phone rings out; a message sits unread. Same record, same
        // non-mention, but nothing in this world may print the wrong one of
        // those two for the wrong source.
        this.handlers.onNotice?.(
          'You did not get to that one',
          entry.source === 'chat'
            ? 'It sat unread. Nobody is going to mention it, and it is written '
              + 'down, which is how most of the things nobody mentions work.'
            : 'It rang out. Nobody is going to mention it, and it is written '
              + 'down, which is how most of the things nobody mentions work.',
        );
      }
    }

    this.handlers.onInterruptionEnded?.(entry);
    this.announce();
  }

  /**
   * The runtime half of "one takeover at a time".
   *
   * Two things can own the screen and neither of them is this module's to
   * place: the lead standing at the desk, and another interruption. Both are
   * already avoided by construction, so this throws rather than skipping -
   * a screen holding a manager and a ringing phone at once is a bug that
   * would otherwise present as a player being unable to read either.
   */
  private assertOneTakeover(entry: Readonly<InterruptionEntry>): void {
    const now = this.engine.now();
    const clash = this.liveInterruptions().find(
      (other) => other.id !== entry.id
        && now >= other.tick
        && now < other.endsTick,
    );

    if (clash !== undefined) {
      throw new Error(
        `"${entry.id}" arrived at ${String(now)} while "${clash.id}" still `
        + 'owned the screen. The schedule places one takeover at a time and '
        + 'something has put a second one on top of it.',
      );
    }

    if (patrolPhase(this.patrol_, now) === 'present') {
      throw new Error(
        `"${entry.id}" arrived at ${String(now)} with the lead at the desk. `
        + 'The rounds are handed to the schedule as minutes already spoken '
        + 'for, so this is a booking that was not passed on.',
      );
    }
  }

  /**
   * Picking it up.
   *
   * Benign is asked again HERE rather than remembered from the arrival, and
   * the two answers are allowed to disagree. Somebody who was on the ticket
   * when it rang and has wandered off by the time they answer has genuinely
   * lost their place, and somebody who opened the ticket while it rang has
   * genuinely turned a cold call into the job - both are the honest reading,
   * and neither is a state anybody has to store.
   */
  public answerInterruption(): DispatchResult {
    const view = this.interruption();

    if (view === null) {
      return { ok: false, reason: NOTHING_RINGING };
    }

    const target = view.benign ? view.entry.relatedTicket : null;
    const ticket = target === null
      ? undefined
      : this.tickets().find((node) => node.id === target);

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.interruptionAccept,
      this.actor,
      target,
      {
        id: view.entry.id,
        // The whole bounded field, built where the shape of a ticket's
        // evidence is known, exactly as `recordTouches` builds it - so a
        // replay writes the identical string instead of rebuilding it against
        // a clock nobody saved.
        touches: ticket === undefined
          ? ''
          : withTouch(
            ticket.fields[FIELDS.touchLog],
            this.engine.now(),
            DAY_ACTIONS.interruptionAccept,
            true,
          ),
      },
    ));
  }

  /**
   * A choice, made, and every screen told about it in the same breath.
   *
   * The three verbs change what the day LOOKS like - a pushed interruption
   * stops owning the desk that instant and starts being a countdown - and
   * nothing else announces it, so the taskbar used to wait for the next minute
   * to find out. That is a full second at normal speed and, with the clock
   * paused, for ever: a player who postponed and immediately paused saw no
   * countdown at all and a desk that still looked taken. The windows never had
   * the problem because they repaint on world changes; the desktop reads the
   * DAY, so the day has to say something.
   *
   * Only on success, because a refused verb changed nothing.
   */
  private announced(result: DispatchResult): DispatchResult {
    if (result.ok) {
      this.announce();
    }

    return result;
  }

  public deferInterruption(): DispatchResult {
    const view = this.interruption();

    return view === null
      ? { ok: false, reason: NOTHING_RINGING }
      : this.announced(this.engine.dispatch(
        DAY_ACTIONS.interruptionDefer,
        this.actor,
        null,
        {
          id: view.entry.id,
          // The minute the button was pressed, stamped here because this is
          // the only place that knows it. A window buys its minutes from the
          // press, so a push at 14:21 against an arrival at 14:10 must still
          // buy the whole ten - and the world cannot work that out from a
          // count.
          spent_at: `${view.entry.id}@${String(this.engine.now())}`,
          // The same flag decline is given, because it answers the same
          // question for everything that carries no budget: an interruption
          // nobody may wave off is not one anybody may push twenty minutes out
          // either.
          declinable: view.entry.declinable ? 1 : 0,
          // And the budget it was AUTHORED with, never what is left of it. How
          // many are left is the world's arithmetic - this length, minus the
          // ledger - and a driver that sent the remainder would be a driver
          // telling the world how much of its own record to believe.
          postpones: view.entry.postpones.length,
        },
      ));
  }

  /**
   * Saying no, which the world decides the legality of.
   *
   * `declinable` is passed as the entry's own flag rather than checked here,
   * because the refusal has to come out of the action registry like every
   * other refusal in this game - the sentence a junior reads about not being
   * able to skip the sync is the WORLD's sentence, and a shell that hid the
   * button would have taught the same rule without ever saying it.
   */
  public declineInterruption(): DispatchResult {
    const view = this.interruption();

    if (view === null) {
      return { ok: false, reason: NOTHING_RINGING };
    }

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.interruptionDecline,
      this.actor,
      null,
      {
        id: view.entry.id,
        declinable: view.entry.declinable && !view.callback ? 1 : 0,
        // Which of the two true reasons this one refuses with. A machine's
        // decline was WITHDRAWN rather than never offered, and the sentence
        // the player reads is the world's either way - the shell only says
        // which register the entry is in, and `declineWithdrawn` decides that
        // off the source rather than off a content row.
        withdrawn: declineWithdrawn(view.entry) ? 1 : 0,
      },
    ));
  }

  /* -- the pressure layer ------------------------------------------------ */

  /**
   * Everything the shift does to you, at a fixed cadence.
   *
   * It runs on the tick rather than on real time, and only during the shift:
   * the morning brief is not paid and the scorecard is not work. Because it is
   * keyed to the simulation clock, a day replayed from the dispatch log
   * arrives at the same meters - which is the whole reason the deltas are
   * computed here and applied by the engine rather than the other way round.
   *
   * The order matters and is not arbitrary. Bounces first, so the reputation
   * they cost is in the world before anything reads it; the meters last, so
   * they see the day as it actually stands. Response marks are NOT here: they
   * belong to the minute the player touched the ticket, which is `dispatch`.
   */
  private applyPressure(now: number): void {
    if (this.state() !== 'shift' || !isMeterTick(now)) {
      return;
    }

    this.settleBounces(now);
    this.settleCrash(now);
    this.tickMeters(now);
  }

  /**
   * The bill for the can, billed once against the run that bought it.
   *
   * The watermark is the minute the can was opened, so a crash cannot be paid
   * for twice however often this runs - the same shape the meters use for
   * breaches, and for the same reason: this is a repeating tick settling a
   * one-off event.
   */
  private settleCrash(now: number): void {
    const run = this.drinkRun();

    if (run.startedAt === null) {
      return;
    }

    if (this.playerNumber(FIELDS.drinkCrashCharged, NO_RUN) === run.startedAt) {
      return;
    }

    if (now < crashStartsAt(run.startedAt, run.tolerance)) {
      return;
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.consumableCrash,
      this.actor,
      null,
      {
        stress_up: crashStress(run.tolerance),
        charged_for: run.startedAt,
      },
    );

    if (result.ok) {
      this.handlers.onNotice?.(
        'That is the can, then',
        'The lights are suddenly quite bright and the queue has not moved. '
        + 'It wears off. Everything does.',
      );
    }
  }

  private drinkRun(): DrinkState {
    return drinkState(
      this.engine.graph.getField(this.actor, FIELDS.drinkStartedAt),
      this.engine.graph.getField(this.actor, FIELDS.drinkTolerance),
    );
  }

  /** Text off the player node, or nothing at all when it is not there. */
  private playerText(field: string): string {
    const value = this.engine.graph.getField(this.actor, field);
    return typeof value === 'string' ? value : '';
  }

  /** A number off the player node, or the fallback when it is not one. */
  private playerNumber(field: string, fallback = 0): number {
    const value = this.engine.graph.getField(this.actor, field);
    return typeof value === 'number' && Number.isSafeInteger(value)
      ? value
      : fallback;
  }

  private tickets(): readonly ReadOnlyGraphNode[] {
    return this.engine.graph.nodesOfKind('ticket');
  }

  /**
   * The unresolved tickets this node is part of the story of.
   *
   * The rule moved to `world/timesheet.ts` in 0.38.1 - not because it belongs
   * to the sheet, but because the AUDIT read needs the identical answer and
   * had been making its own. One function, two callers.
   */
  private ticketsAbout(target: NodeId): readonly ReadOnlyGraphNode[] {
    return witnessesOf(this.engine.graph, target, this.workResolver());
  }

  /**
   * What one dispatch meant to the tickets it was aimed at.
   *
   * Two records, both written now rather than worked out later. The response
   * clock stops on the first touch, whether or not a word was said to the
   * reporter and whether or not that touch also closed the ticket - somebody
   * who fixed the printer without saying anything did respond, they just did
   * it in the order techs actually do it. And the touch itself goes onto the
   * ticket, refusals included, because that is the handoff form's evidence and
   * it has to survive tonight's checkpoint.
   */
  private recordTouches(
    id: string,
    witnesses: readonly ReadOnlyGraphNode[],
    ok: boolean,
  ): void {
    if (witnesses.length === 0 || !countsAsWork(id)) {
      return;
    }

    const now = this.engine.now();

    for (const ticket of witnesses) {
      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketRecordTouch,
        this.actor,
        ticket.id,
        {
          touches: withTouch(ticket.fields[FIELDS.touchLog], now, id, ok),
        },
      );

      if (ok && needsResponse(ticket)) {
        this.engine.dispatch(
          HELPDESK_ACTIONS.ticketRecordResponse,
          this.actor,
          ticket.id,
          {},
        );
      }
    }
  }

  /**
   * Diagnostic evidence from the terminal's read-only commands (0.36.0).
   *
   * `ping` and `ssh` never dispatch - they are reads, and half their value is
   * the refusal - so until this seam existed they left no evidence, and the
   * handoff form on a ticket whose whole journey IS those reads said "you have
   * not touched this one" to somebody who had done exactly what the ticket
   * asks. The probe goes onto the ticket's touch log under its own id, ok and
   * refused alike, because "ruled out" is the half of a handoff L2 actually
   * reads.
   *
   * Deliberately NOT `recordTouches`: a probe stops no response clock (pinging
   * a server is neither contact with the reporter nor a fix) and charges no
   * work segment - it is evidence, and only evidence.
   */
  /**
   * The external contract's clocks, settled (E9, 0.37.0 - D4).
   *
   * The customer-axis research is unambiguous: published external SLAs bind
   * the ACKNOWLEDGMENT and the update cadence; resolution is best effort at
   * every vendor checked. So a tiered ticket's misses are these two, each a
   * monotone stamp the meters derive a charge from - the ack miss once and
   * forever, the cadence count only ever up. Both reads live in
   * `world/cadence.ts`; this is the notice-and-dispatch half, the same shape
   * as every settler above it.
   */
  private settleContractClocks(now: number): void {
    const due = contractStampsDue(
      this.engine.graph,
      now,
      (node) => ticketClocks(node, now).response.breached,
    );

    for (const ticket of due.acks) {
      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketRecordAckMiss,
        this.actor,
        ticket,
        {},
      );
    }

    for (const miss of due.cadences) {
      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketRecordCadenceMiss,
        this.actor,
        miss.ticket,
        { misses: miss.misses },
      );
    }
  }

  public recordProbe(machineId: NodeId, probeId: string, ok: boolean): void {
    const now = this.engine.now();

    for (const ticket of this.ticketsAbout(machineId)) {
      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketRecordTouch,
        this.actor,
        ticket.id,
        {
          touches: withTouch(ticket.fields[FIELDS.touchLog], now, probeId, ok),
        },
      );
    }
  }

  /**
   * The bulk close, once the fault behind a flood has actually been fixed.
   *
   * Nobody presses a button for this: the children were attached to a parent
   * by the player, the parent closed because the world was repaired, and the
   * duplicates close the way the real workflow closes them - with the parent's
   * own last word to its reporter copied onto each of them.
   *
   * It is driven rather than derived because a comment is a WRITE, and writes
   * go through dispatched verbs. Each child is settled once: the marker on the
   * child is the watermark, the same shape the meters use for breaches, so
   * running this every tick and after every dispatch costs nothing and cannot
   * tell anybody twice.
   */
  private settleParentCascade(): void {
    const tickets = this.tickets();

    for (const due of cascadesDue(tickets)) {
      const parent = tickets.find((ticket) => ticket.id === due.parent);

      if (parent === undefined) {
        continue;
      }

      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketResolveWithParent,
        this.actor,
        due.child,
        {
          parent: due.parent,
          comment: cascadeComment(
            ticketTitle(parent.id),
            parent.fields[FIELDS.replyToReporter],
          ),
        },
      );
    }
  }

  /** Second line, getting round to it. */
  private settleBounces(now: number): void {
    for (const ticket of this.tickets()) {
      const bounced = ticket.fields[FIELDS.handoffBouncedAt];
      const settled = ticket.fields[FIELDS.handoffSettledAt];

      if (typeof bounced !== 'number' || typeof settled === 'number') {
        continue;
      }

      if (now < bounceLandsAt(bounced)) {
        continue;
      }

      const result = this.engine.dispatch(
        HELPDESK_ACTIONS.ticketBounceHandoff,
        this.actor,
        ticket.id,
        {},
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Returned by second line',
          `${ticketTitle(ticket.id)} - ${HANDOFF_BOUNCE.worknote}`,
        );
      }
    }
  }

  /** What the meters read on the player node right now. */
  private meterState(): MeterState {
    const read = (field: string): number => {
      const value = this.engine.graph.getField(this.actor, field);
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0;
    };

    return {
      stress: read(FIELDS.stress),
      suspicion: read(FIELDS.suspicion),
      reputation: read(FIELDS.reputation),
      suspicionEvents: read(FIELDS.suspicionEvents),
      breachesCharged: read(FIELDS.breachesCharged),
      resolveCreditPaid: read(FIELDS.resolveCreditPaid),
      dndWorkingTicks: read(FIELDS.dndWorkingTicks),
      dndSuspicionCharged: read(FIELDS.dndSuspicionCharged),
    };
  }

  /**
   * The unread channel messages this interval is billing for attention, and the
   * side effect of billing them: they join the charged ledger so no later
   * interval bills them twice.
   *
   * Both halves are here, in one place, because they are one fact: a message is
   * charged exactly when the meters first notice it unread, and "noticed" is
   * "added to the ledger". Advanced unconditionally - before the dispatch, and
   * whether or not the dispatch ends up moving a meter - because a message the
   * pressure layer saw sitting there is a message it has seen, and a stress
   * point clamped away at the ceiling is still a point it does not get to
   * charge again when the meter next has room.
   */
  private billAttention(): number {
    const unread = this.handlers.unreadChannels?.() ?? [];

    if (unread.length === 0) {
      return 0;
    }

    const charged = this.handlers.attentionCharged?.() ?? [];
    const fresh = unread.filter((id) => !charged.includes(id));

    if (fresh.length > 0) {
      this.handlers.noteAttentionCharged?.(fresh);
    }

    return fresh.length;
  }

  private tickMeters(now: number): void {
    const tickets = this.tickets();
    const state = this.meterState();
    const deltas = meterDeltas({
      // The sprawl of the third channel: the unread room messages the meters
      // have not billed yet, charged a point each, once. The ledger is advanced
      // as a side effect of asking, so a message counted here is a message that
      // will not be counted again.
      attentionCharges: this.billAttention(),
      // Everything that is still somebody's problem and is not parked - a
      // breached ticket very much included. The printer does not start working
      // because its SLA ran out, and a queue that stopped counting it would
      // pay the player to let the next one go the same way.
      openTickets: tickets.filter(isActiveWork).length,
      // What a miss weighs, and WHICH clock misses (D4, 0.37.0) - the whole
      // arithmetic lives in `breachWeightOf`, where it is a pure function a
      // test can hold still.
      breachedTickets: breachWeightOf(tickets),
      breachesCharged: state.breachesCharged,
      resolveCredit: resolveCredit(tickets),
      resolveCreditPaid: state.resolveCreditPaid,
      openSlackApps: this.handlers.openSlackApps(),
      focusedSlackApp: this.handlers.focusedSlackApp(),
      lunch: isLunchtime(now),
      // The dot's minutes, COUNTED rather than sampled here: everything the
      // meters are told about the status is a number of minutes that actually
      // were do-not-disturb-while-working, read off the graph a minute at a
      // time between watermarks. The pair of instant readings this used to be
      // made a rule about two moments a day.
      dndWorkingMinutes: this.dndAccrued(now),
      dndWorkingTicks: state.dndWorkingTicks,
      dndSuspicionCharged: state.dndSuspicionCharged,
      // The web store's drip: unauthorised software the audit can see sitting
      // on the machine. Nought on every scripted week, which is what keeps the
      // suspicion arithmetic byte-identical to before the store existed.
      installedAgainstPolicy: this.handlers.installedAgainstPolicy?.() ?? 0,
    });

    if (!movesAnything(state, deltas)) {
      return;
    }

    this.engine.dispatch(DAY_ACTIONS.metersTick, this.actor, null, {
      stress_up: deltas.stressUp,
      stress_down: deltas.stressDown,
      suspicion_up: deltas.suspicionUp,
      suspicion_down: deltas.suspicionDown,
      reputation_up: deltas.reputationUp,
      reputation_down: deltas.reputationDown,
      suspicion_events_up: deltas.suspicionEvent ? 1 : 0,
      breaches_charged: deltas.breachesCharged,
      resolve_credit_paid: deltas.resolveCreditPaid,
      // The evidence half of the drip. Nought on every interval of every day
      // nobody sets a dot on, and the world writes nothing for a nought -
      // which is what keeps this off the player node of a scripted week.
      dnd_ticks_up: deltas.dndWorkingTicks,
      dnd_charged: deltas.dndSuspicionCharged,
      dnd_billed_to: now,
    });
  }

  /**
   * How many of the minutes since the last watermark were the dot lying.
   *
   * The heart of the fix this slice needed after review: a minute counts when
   * the status was do not disturb, the touch log says the queue was being
   * worked, and it was not lunch - and it is counted ONE MINUTE AT A TIME
   * between two watermarks rather than read once at a meter boundary.
   *
   * The old shape sampled the pair at the boundary and charged for the whole
   * interval or none of it, which made the drip a rule about two instants a
   * day: a player who raised the dot just after each tick and dropped it just
   * before the next one dodged every call in the morning and paid nothing at
   * all for it, and one who dropped it a minute early erased five minutes they
   * had genuinely spent behind it. Every one of the inputs below is historical
   * - the touch log carries minutes, lunch is arithmetic, and the STATUS is
   * pinned to its own segment by `presence.set` moving the watermark - so the
   * question "how much of that window was a lie" has one answer, and it is the
   * same answer on both sides of a save.
   */
  private dndAccrued(now: number): number {
    if (this.presence() !== 'dnd') {
      return 0;
    }

    // Never earlier than this morning: a dot left on overnight is not a claim
    // about minutes nobody was at the desk for, and the record it is evidence
    // for is cleared every morning anyway.
    const from = Math.max(
      this.playerNumber(FIELDS.dndBilledTo),
      shiftStartTick(this.day()),
    );
    const touches = this.touchTicks();
    let minutes = 0;

    for (let tick = from + 1; tick <= now; tick += 1) {
      if (
        !isLunchtime(tick)
        && touches.some(
          (touch) => touch <= tick && tick - touch <= DND_WORKING_TICKS,
        )
      ) {
        minutes += 1;
      }
    }

    return minutes;
  }

  /** Every minute the queue was touched in, which is what "working" means. */
  private touchTicks(): readonly number[] {
    return this.tickets().flatMap(
      (ticket) => triedFromTouches(ticket.fields[FIELDS.touchLog])
        .map((touch) => touch.tick),
    );
  }

  /**
   * Closes the books on the status that is about to be replaced.
   *
   * Called before the dot changes, and that is what makes the integral above
   * exact: the minutes of the segment ending now are banked at the minute it
   * ends, so nothing about the next status can erase them and nothing about
   * the last one can be charged to it. It banks the MINUTES only - what they
   * are worth in suspicion is settled at the meter boundary off the total,
   * because the rate is two points per five minutes and a fraction of a point
   * is not a thing this world charges.
   */
  private settleDrip(now: number): void {
    const minutes = this.dndAccrued(now);
    const state = this.meterState();

    this.engine.dispatch(DAY_ACTIONS.metersTick, this.actor, null, {
      stress_up: 0,
      stress_down: 0,
      suspicion_up: 0,
      suspicion_down: 0,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 0,
      // Untouched: this is not the interval's settlement, it is the closing of
      // one status's books inside it, and handing back the watermarks it found
      // is what keeps it from billing anything twice.
      breaches_charged: state.breachesCharged,
      resolve_credit_paid: state.resolveCreditPaid,
      dnd_ticks_up: minutes,
      dnd_charged: state.dndSuspicionCharged,
      dnd_billed_to: now,
    });
  }

  /**
   * Somebody noticing the Away dot, which is what the Away dot costs.
   *
   * The trigger is a dispatch that COUNTS AS WORK - the same filter the touch
   * log uses - because the lie is not the status, it is the status held while
   * demonstrably doing the job on somebody else's ticket. Reading a knowledge
   * base article while away is being away.
   *
   * One person per dispatch and one per person per day, and the person is the
   * one who has been waiting longest for a first word. Stinging every waiting
   * reporter at once would be four reputation hits in one minute for one
   * click, which is the drumbeat the spec forbids; the queue has all afternoon
   * to work through them one at a time, which is also how it happens.
   */
  private settleAwayNoticed(id: string, ok: boolean): void {
    if (!ok || !countsAsWork(id) || this.presence() !== 'away') {
      return;
    }

    const already = this.playerText(FIELDS.presenceNoticed).split('\n');
    let waiting: { ticket: string; reporter: NodeId; since: number } | null = null;

    for (const ticket of this.tickets()) {
      if (!isUnresolved(ticket) || !needsResponse(ticket)) {
        continue;
      }

      const reporter = findWorldTicket(ticket.id)?.def.reporter;

      if (
        reporter === undefined
        // Nobody notices their own dot. The desk's own faults are raised by
        // the person sitting at it - the fan that has been grinding since
        // Monday is Pat's own ticket - and a reputation hit for keeping
        // YOURSELF waiting is a fine with nobody on the other end of it, plus
        // a chat line from the player to the player.
        || reporter === this.actor
        // The world keeps the same list and refuses the second one itself.
        // This is the driver picking somebody who has not already had their
        // thought rather than dispatching into a refusal, which is the only
        // reason it reads the record at all.
        || already.includes(reporter)
      ) {
        continue;
      }

      const since = ticket.fields[FIELDS.spawnedAt];
      const at = typeof since === 'number' ? since : 0;

      if (waiting === null || at < waiting.since) {
        waiting = { ticket: ticket.id, reporter, since: at };
      }
    }

    if (waiting === null) {
      return;
    }

    const noticed = this.engine.dispatch(
      WORLD_ACTIONS.presenceNoticed,
      this.actor,
      null,
      {
        // One parameter, and it is the person. The uniqueness key used to be a
        // `person@day` line assembled here, which put the world's own
        // once-per-day rule in the hands of whoever dispatched it; the record
        // is now cleared every morning by the shift starting, so the reporter
        // IS the key and there is nothing left to spell.
        reporter: waiting.reporter,
        reputation_down: AWAY_NOTICED_REPUTATION,
      },
    );

    if (!noticed.ok) {
      return;
    }

    this.handlers.onPresenceNoticed?.(
      waiting.reporter,
      waiting.ticket,
      this.engine.now(),
    );
    this.handlers.onNotice?.(
      'Somebody has noticed',
      `${ticketTitle(waiting.ticket)} - they can see the dot, they can see `
      + 'the ticket you just worked, and they have drawn the obvious '
      + 'conclusion about which of those two things you were doing instead of '
      + 'answering them.',
    );
  }

  /** Returns true when the transition it made ended the day. */
  private applyDueTransition(): boolean {
    const due = dueTransition(this.state(), this.engine.now());

    if (due === null) {
      return false;
    }

    this.dispatchDay(
      due === 'shift' ? DAY_ACTIONS.startShift : DAY_ACTIONS.endShift,
      {},
    );
    // The clock the deadlines are measured against follows the day it belongs
    // to, in the same breath as the transition rather than at the top of the
    // next minute: a shift that ended at 17:00 must not sell 17:01 as work.
    this.syncSlaClock();
    this.announce();

    if (due === 'day_end' && this.probationOver()) {
      this.handlers.onBeerUnlocked?.();
    }

    return due === 'day_end';
  }

  /** Friday evening, review passed: the fridge stops being a joke. */
  private probationOver(): boolean {
    return isReviewDay(this.day()) && this.reviewOutcome() === 'passed';
  }

  /**
   * A day verb the driver itself asked for. A refusal here is not a player
   * mistake the UI can explain away - it means the day state and the clock
   * disagree about what day it is, and every screen after it would be wrong.
   */
  private dispatchDay(id: string, params: Record<string, number>): void {
    const result = this.engine.dispatch(id, this.actor, null, params);

    if (!result.ok) {
      throw new Error(`The day could not move: ${result.reason}`);
    }
  }

  private announce(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
