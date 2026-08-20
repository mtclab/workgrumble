/**
 * The rung table: a title is the difficulty, as data (E9, 0.35.0 slice 1).
 *
 * Two owner decisions stand behind this file. D1: the title you are hired at IS
 * the difficulty select. D2: the work of the rungs below you does not vanish
 * when you climb - it LESSENS, by the title and by the KIND of the work, "a
 * senior still resets the odd password; an architect rarely sees one but still
 * catches the outage-adjacent basics". Both are decided
 * (`docs/design/titles-difficulty.md` section 6), and both need the same thing
 * to be anything more than a sentence: one row per rung, in one place, that the
 * game READS rather than a document that describes it.
 *
 * WHAT A ROW IS FOR. Each row is the whole of what its rung changes, and every
 * field on it is either consumed today or is a REF into something shipped:
 *
 *  - `workMix` - D2's blend ratios, per work kind, CONSUMED by the week
 *    generator (`week-gen.ts`) as a per-week quota on what the draw may deal.
 *  - `utilisation` - what the business asks of the rung's HOURS, CONSUMED by
 *    the timesheet's own reading (`timesheet.ts`) and printed at the review.
 *    It was a map keyed by PAM tier until 0.39.0; per-rung is where it belongs
 *    whatever the figures are, because two rungs stand on the service desk's
 *    tier and a tier-keyed map cannot ever tell them apart. Today TWO rungs
 *    carry a figure - the senior desk and the engineer - and the probationer
 *    carries null, because the sheet that rung is handed records the whole day
 *    by construction (see the column's own docblock below).
 *  - `sheet` - WHICH SHEET the rung fills in, CONSUMED by the timesheet
 *    (`timesheetSheet` draws the shape this column names) and, through it, by
 *    every surface that prints one. It was a read of the PAM tier until 0.40.0,
 *    which is the same mistake the target's map was and had the same victim:
 *    the senior desk's sheet was the probationer's, so its target was cleared
 *    before the player did anything.
 *  - `tier`, `title`, `employer`, `carriesPager`, `offeredAt` - the state a rung
 *    IS. These were hardcoded in four places before this table existed and are
 *    here now instead of there, not as well as (see MOVED IN, below).
 *  - `customers`, `sla`, `rates` - refs into the shipped customer axis, the
 *    shipped clock rules and the shipped rate constants. A ref naming something
 *    this build does not have is a boot failure, which is what stops the table
 *    from describing a game we do not ship.
 *  - `winCondition` - an id per rung and no more. The per-rung goals are
 *    content nobody has written (E9 later slices); naming them here is what
 *    makes "each title has its own win condition" a thing with a place to land
 *    rather than a thing to remember.
 *
 * THE RATIOS ARE FACTORS, NOT SHARES, and that is the decision that makes the
 * junior row honest. A share ("35% of the week is password work") would have to
 * be true of every shop the rung can be played at, and the four shops are not
 * the same shape - Bodgeworth deals five arrivals a week and the corporate
 * in-house desk is nearly all identity work. A FACTOR is a claim about the
 * TITLE and nothing else: 1 is "the shop as it deals it", 0.6 is "this rung
 * sees three of those five", 0 is "never". So the junior row is all ones, which
 * is not a placeholder - it is the exact statement that the probation game is
 * the baseline every other rung is measured against, and it is why a junior's
 * weeks are byte-identical to the ones the generator drew before this file
 * existed.
 *
 * MOVED IN, and deleted where they were. One truth, per the house rule:
 *
 *  - `SYSTEMS_ENGINEER_TITLE` (was `actions/career.ts`) - the promotion writes
 *    the row's title.
 *  - `PROMOTION_REPUTATION` (was `actions/career.ts`) - the row's `offeredAt`.
 *  - the probationary title (was a literal in the probation roster,
 *    `company.ts`) - the junior row's title, which the roster reads.
 *  - the on-call tier gate (was `isSystemsEngineer` inside `on-call.ts`) - the
 *    row's `carriesPager`, which `isOnCall` reads.
 *  - `FRESH_CAREER_TIER` (was a second literal in `career.ts`) - the junior
 *    row's tier, which is what a career with no promotion on it stands on.
 *
 * WHAT IS NOT HERE. No patrol, drip or meter NUMBERS were moved in, because
 * none of them is per-title today: the boss walks the floor three times a day
 * for a probationer and for an engineer alike, and inventing a per-rung figure
 * to justify a column would be a tuning decision smuggled in as a refactor. The
 * `rates` ref is the seam - the day a rung earns its own cadence it gets a
 * second profile and the constants move then, once, with a reason.
 */

import {
  PLAYER_TIERS,
  SERVICE_SCOPES,
  SLA_TIERS,
  type PlayerTier,
  type ServiceScope,
  type SlaTier,
} from './fields';
import type { SheetShape, UtilisationTarget } from './timesheet';

/**
 * The kinds of work a week can deal, which is the axis D2's ratios are per.
 *
 * They live HERE rather than beside the machinery that classifies a ticket
 * (`work-kinds.ts`) because they are the table's own vocabulary: the classifier
 * answers a question this table asks. It also keeps this module a leaf over
 * `fields.ts`, which is what lets the probation roster read its own title off
 * the junior row without a cycle.
 */
export const WORK_KINDS = ['access', 'device', 'server', 'project'] as const;

export type WorkKind = (typeof WORK_KINDS)[number];

/** The ladder, bottom to top (design doc section 2, research thread A §10). */
export const RUNGS = [
  'sd_junior',
  'sd_senior',
  'l2_desktop',
  'systems_engineer',
  'senior_engineer',
  'team_lead',
  'architect',
] as const;

export type Rung = (typeof RUNGS)[number];

/** Local: the only question anything outside asks is `isBuiltRung`. */
function isRung(value: unknown): value is Rung {
  return typeof value === 'string' && RUNGS.some((rung) => rung === value);
}

/**
 * Which clocks a rung's arrivals run on.
 *
 * Two, because two is what the game has. `tool_targets` is the in-house case -
 * the resolution targets an ITSM tool is configured with, which is what every
 * shipped clock is. `contract_ladder` is the MSP case, where the customer's
 * bought tier decides the budget (`BREACH_TIER_COST`, the per-tier SLA the MSP
 * tickets already carry). The third one the research asks for - D4's
 * acknowledgment and update-cadence clocks for external tiers - is deliberately
 * NOT here: it is decided and unbuilt, and a profile pointing at machinery that
 * does not exist would be this table lying about the game.
 */
export const SLA_PROFILES = {
  toolTargets: 'tool_targets',
  contractLadder: 'contract_ladder',
} as const;

export type SlaProfile = (typeof SLA_PROFILES)[keyof typeof SLA_PROFILES];

/**
 * Which set of meter, patrol and drip rates a rung plays under.
 *
 * ONE, today, and named rather than assumed: every rung plays on the house
 * floor. The value of the ref is that the second one has somewhere to go and
 * that the table cannot quietly claim a cadence nobody wrote.
 */
export const RATES_PROFILES = {
  house: 'house',
} as const;

export type RatesProfile = (typeof RATES_PROFILES)[keyof typeof RATES_PROFILES];

/**
 * Who the work comes from at a rung, over the two shipped customer axes.
 *
 * `inHouse` is the colleague down the corridor - the probation shop, Bodgeworth
 * and the corporate desk. `scopes` and `slaTiers` are the contract axis the MSP
 * ships (`SERVICE_SCOPES`, `SLA_TIERS`), and they are checked against the
 * estate the rung is actually hired into, so a rung cannot claim to meet a
 * contract tier the world does not sell.
 */
export interface CustomerMix {
  readonly inHouse: boolean;
  readonly scopes: readonly ServiceScope[];
  readonly slaTiers: readonly SlaTier[];
}

export interface TitleRow {
  readonly id: Rung;
  /** What the ladder calls it, for a select and for a brief. */
  readonly label: string;
  /** The title the world writes on the player node at this rung. */
  readonly title: string;
  /** The shape break, one sentence - the research's own answer for this rung. */
  readonly shapeBreak: string;
  /**
   * Whether this rung has the content to be PLAYED, which is the only thing
   * that makes it selectable. Two are true and the honesty of the select
   * depends on the other five staying false until somebody writes them.
   */
  readonly built: boolean;
  /**
   * The PAM tier this rung stands on, or null where the build ships no tier for
   * it. Only two tiers exist (E6), which is exactly the two built rungs.
   */
  readonly tier: PlayerTier | null;
  /** The shop this rung is hired at, for the rungs that can be. */
  readonly employer: string | null;
  /**
   * WHICH WEEK OF THE SHOP'S ARC a hire at this rung opens on, or null for the
   * shop's first week (E9, 0.36.0).
   *
   * It exists because week one of every shop is a table somebody WROTE - the
   * probation Monday, which teaches the two basic tools and which the generator
   * is contractually obliged to reproduce byte for byte - and a hire who is not
   * a probationer has no business being dealt it. It is also the only way the
   * blend on this row can mean anything at all: the rung's work mix binds the
   * DRAW and never the authored week, so a rung that starts on week one starts
   * on a week its own ratios were not allowed to touch.
   *
   * A row naming one is refused unless the shop's content can actually carry
   * that week, which is what `PRODUCT_WINDOW` measures - see `titles.test.ts`.
   */
  readonly startsAt: number | null;
  /** Whether this rung carries the pager after hours (E6's on-call gate). */
  readonly carriesPager: boolean;
  /**
   * The standing the offer INTO this rung is made at, or null where there is no
   * promotion into it. The Systems Engineer's is the shipped
   * `PROMOTION_REPUTATION`, moved here.
   */
  readonly offeredAt: number | null;
  /** D2's blend ratios: a factor per work kind against the shop's own mix. */
  readonly workMix: Readonly<Record<WorkKind, number>>;
  /**
   * What the business asks of this rung's HOURS (E9/E10 bridge, 0.39.0), or
   * null where it asks nothing at all.
   *
   * It is a COLUMN rather than a branch in the reader for the same reason
   * `workMix` is: the target IS the difficulty knob the design named ("per-title
   * targets ARE the difficulty paperwork", `docs/design/titles-difficulty.md`
   * section 5), so it has to be tunable by editing one row rather than by
   * finding the place that decided it. It used to be a two-entry map keyed by
   * PAM TIER inside `timesheet.ts`, which could not express this at all: two
   * rungs stand on the service desk's tier and only one of them is asked for
   * anything.
   *
   * NULL IS A REAL ANSWER and not a gap. A rung with no target gets no row at
   * the review, no target clause on its sheet, and nothing to be under - which
   * is the honest thing to print for a rung whose sheet is a formality.
   *
   * Nothing anywhere computes a mark from it. See `utilisationReviewLine`.
   */
  readonly utilisation: UtilisationTarget | null;
  /**
   * WHICH SHEET this rung fills in (0.40.0) - the paperwork ramp, one row at a
   * time. The three shapes are written down where they are drawn
   * (`timesheet.ts`, `SheetShape`); this column is the whole of who gets which.
   *
   * It is a column for the reason `utilisation` is one, and it is the same
   * mechanic seen from the other side: the target is what the business ASKS of
   * the hours, and the shape is what the player can SAY about them, so a target
   * is only a difficulty knob where the shape leaves something to decide. They
   * were a tier read and a tier-keyed map respectively until this table, and
   * that pairing is exactly what broke - two rungs stand on the service desk's
   * PAM tier, so the senior's sheet was the probationer's, and a target over a
   * sheet that records the whole day by construction is a number that cannot
   * move (0.39.0 pulled the 85 off for it; the checks below now refuse the
   * combination outright).
   *
   * EVERY ROW CARRIES ONE, including the four unbuilt rungs, and that is not
   * the same claim `utilisation` and `tier` refuse to make on those rows. A
   * target is a claim about a WEEK nobody can play yet; a shape is a statement
   * about the PAPERWORK, and the honest default for an unbuilt rung is the
   * nearest built rung below it - the ramp does not go back down. So
   * `l2_desktop` fills in the senior desk's sheet and the three rungs above the
   * engineer fill in the engineer's, and the day one of them is built it starts
   * from the sheet its neighbour already has rather than from a blank.
   */
  readonly sheet: SheetShape;
  readonly customers: CustomerMix;
  readonly sla: SlaProfile;
  readonly rates: RatesProfile;
  /** The goal this rung is played towards. Content later; the id is the seam. */
  readonly winCondition: string;
}

/**
 * The ratios, and where each one comes from.
 *
 * Every figure below is a reading of `docs/research/titles-work-shape.md` -
 * section 9's sourced number table and section 10's shape breaks - turned into
 * the one quantity this game can act on. They are OVERSEER TUNING KNOBS and
 * they are deliberately conservative: the point of D2 is that the lower work
 * thins out, not that it disappears, so nothing but a junior's project work is
 * ever nought.
 *
 *  - **SD junior, all ones.** SFIA level 1 is "Follow": everything the shop
 *    deals arrives on this desk, which is why this rung IS the baseline. A
 *    junior does no project work (E10 projects are an engineer's), so that one
 *    kind is nought - and that nought has teeth: a drawn junior week that dealt
 *    a project task would be refused.
 *  - **SD senior, 0.9/0.9.** The senior service-desk shape break is a SECOND
 *    QUEUE (auditing other people's triage), not a different first queue - the
 *    JD keeps them on the same phones with mentoring and QA on top - so the mix
 *    barely moves.
 *  - **L2 desktop, access 0.8 / device 1.** The only rung where a factor goes
 *    back UP, and it is the honest shape rather than an oversight: desktop
 *    support is the device rung, so device work stays at the shop's own rate
 *    while every rung above it thins. Access barely moves because identity work
 *    is most of what the tier below escalates (L1 escalation 22%, and IAM 15.9%
 *    plus onboarding 16.6% of L1 volume, Fixify 2026).
 *  - **Systems engineer, access 0.75 / device 0.6.** Google SRE's polarisation
 *    puts at least half an engineer's week on engineering and caps ops-adjacent
 *    interrupt work; the desk classes thin without going away, which is exactly
 *    D2's "a senior still resets the odd password". Servers stay at the shop's
 *    rate and project work is now theirs (D3).
 *  - **Senior engineer, 0.5/0.4.** The rung's two clocks (55-70% billable
 *    utilisation against delivery, SPI) are the shape break; half the desk work
 *    is what falls out of the calendar first.
 *  - **Team lead, 0.4/0.3/0.8.** Dispatch doctrine says keep the seniors off
 *    junior work; the burnout literature says they are the safety net anyway,
 *    which is why it thins rather than stops - and why the server factor drops
 *    too: a lead who is assigning is not resolving.
 *  - **Architect, 0.2/0.15/0.5.** Hands-on is a tenth of the week and only if
 *    they fight for it (thread A §7), and the estate work that survives is the
 *    outage-adjacent kind D2 named - which is why server is a half and access a
 *    fifth rather than both being a tenth.
 */
/**
 * The utilisation targets, and where each one comes from.
 *
 * OVERSEER TUNING KNOBS, all of them, and the one the whole mechanic turns on:
 * being under target costs NOTHING anywhere in this game, so the target is the
 * only thing that decides how hard the paperwork reads. Three figures, and each
 * is a reading of the research rather than a number somebody liked.
 *
 *  - **SD junior - NONE.** Not an omission and not a rung nobody has got to
 *    yet. A probationer's sheet is `single_bucket`: one line a day at
 *    `WORKING_MINUTES_PER_DAY`, attributed to nobody, written by the shape of
 *    the sheet rather than by the week. Every basis over it is a constant - a
 *    hundred per cent recorded, nought per cent billable - so a target on it
 *    would be a row that cannot move, on a screen, above a mark it does not
 *    feed. The rung's own window already says the true thing ("there is nothing
 *    on it to decide"), and the review says it by having no row.
 *  - **SD senior - 85% RECORDED, and the sheet is what makes it a knob.** It
 *    shipped at this figure for one version and it was theatre, because the
 *    sheet was keyed on the PAM TIER: a senior service desk analyst stands on
 *    the junior's tier, so their sheet was `single_bucket` - one line a day at
 *    `WORKING_MINUTES_PER_DAY`, a hundred per cent recorded by construction,
 *    cleared before the player had done anything. 0.39.0 took the figure off
 *    rather than leave a number on a card that could not move, and named its
 *    dependency; 0.40.0 built it. The shape column above hands this rung
 *    `per_customer`, so the recorded percentage is now the LEDGER's answer -
 *    the minutes the week actually attributed, over the minutes on the clock -
 *    and a week spent present and idle comes in under this and says so.
 *    The figure is the sourced one: a service desk really is held to a
 *    utilisation number (MetricNet's balanced scorecard names technician
 *    utilisation, `docs/research/review-scoring.md` 2.1), the band is 75-85%
 *    and the top of it is the honest ask (Scoro/Teamwork, same section). It is
 *    RECORDED and not billable for a reason the table itself enforces: this is
 *    an in-house rung, nobody invoices the colleague down the corridor, and a
 *    billable target here would be a permanently red row.
 *  - **Systems engineer - 75% billable.** The sourced industry ask: "service
 *    executives aim for 75% billable ... and end up with yearly averages in the
 *    mid-60s" (Promys, `docs/research/titles-projects-engine.md` 5.4). It is
 *    the REAL one, and it is not reachable honestly: measured on the shipped
 *    MSP week played properly at x1, a week that closes its queue and carries
 *    its project lands between about 35% and 50% billable, because the engine
 *    only credits a minute somebody was demonstrably working. The only way to
 *    hit it is to claim time nobody worked - which is what the customer reads.
 *
 * The four UNBUILT rungs carry null, and that is the same refusal `tier` and
 * `employer` make on those rows. A target is a claim about a week, and there is
 * no week at those rungs to measure one against; picking a figure for a rung
 * nobody can play would be a tuning decision made with no evidence and then
 * inherited by whoever builds it. The seam is the column - the day
 * `senior_engineer` is built it brings the SPI 55-70% senior band with it.
 */
const TITLE_ROWS: readonly TitleRow[] = [
  {
    id: 'sd_junior',
    label: 'Service Desk (junior)',
    title: 'IT Support Technician (probationary)',
    shapeBreak: 'You may only do what the KB says; everything else is a '
      + 'permission wall.',
    built: true,
    tier: PLAYER_TIERS.serviceDesk,
    employer: 'workgrumble',
    startsAt: null,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 1, device: 1, server: 1, project: 0 },
    utilisation: null,
    // The joke the mechanic opens with: one line a day, seven and a half
    // hours, attributed to nobody. There is nothing on it to decide, which is
    // why the row above it asks for nothing either.
    sheet: 'single_bucket',
    customers: { inHouse: true, scopes: [], slaTiers: [] },
    sla: SLA_PROFILES.toolTargets,
    rates: RATES_PROFILES.house,
    winCondition: 'win:pass_probation',
  },
  {
    id: 'sd_senior',
    label: 'Service Desk (senior)',
    title: 'Senior Service Desk Analyst',
    shapeBreak: 'A second queue appears: other people\'s work, audited while '
      + 'your own clocks run.',
    built: true,
    // THE JUNIOR'S TIER, and that is the honest answer rather than an
    // oversight. The PAM tier is about PRIVILEGE - what the account may touch -
    // and a senior service desk analyst may touch exactly what a junior may:
    // the whole of what this rung buys is other people's work and the right to
    // disagree with it. A third tier invented to give the row a distinct value
    // would be the promotion mechanic used as a label, and it would hand a
    // service desk analyst `sudo`. It is why `rungFor` reads the TITLE beside
    // the tier since 0.36.0: two rungs on one tier is a thing this table
    // supports on purpose.
    tier: PLAYER_TIERS.serviceDesk,
    // AND THE PROBATION SHOP, which is the argument this row had to win. It is
    // the only shop in the build with a first line to audit: the MSP is an
    // engineers' shop, Bodgeworth is five arrivals and a man called Trev, and
    // Halcyon's desk is one person and it is you. A senior analyst is a service
    // desk's senior analyst, so the honest home is the service desk - and the
    // difference between a probationer and a senior at the same address is the
    // TITLE CARRY, which is machinery this game already ships and which
    // 0.35.0's start select is built out of.
    employer: 'workgrumble',
    // Week TWO, not one. Week one of that shop is somebody's probation - the
    // authored Monday that teaches the two basic tools, reproduced byte for
    // byte by the generator - and it is the one week a rung's blend is
    // forbidden to touch, so a senior starting there would carry ratios that
    // mean nothing. See `startsAt`.
    startsAt: 2,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.9, device: 0.9, server: 1, project: 0 },
    // THE RESEARCH FIGURE, back and meaning something (0.40.0). It stood here
    // at 0.38.0, came off at 0.39.0 because the tier-keyed sheet cleared it
    // before the player touched it, and returns now that the shape below is
    // the rung's own: recorded is the ledger's answer on a per-party sheet, so
    // an idle week comes in under it. See the targets docblock above.
    utilisation: { basis: 'recorded', percent: 85 },
    // The first rung of the paperwork ramp: the day has to ADD UP. Whose work
    // it was, with no project code and no billable split - a desk analyst has
    // no project and is on nobody's invoice.
    sheet: 'per_customer',
    customers: { inHouse: true, scopes: [], slaTiers: [] },
    sla: SLA_PROFILES.toolTargets,
    rates: RATES_PROFILES.house,
    winCondition: 'win:carry_the_queue',
  },
  {
    id: 'l2_desktop',
    label: 'Desktop Support (L2)',
    title: 'Desktop Support Engineer',
    shapeBreak: 'The permission wall opens, and tickets arrive pre-diagnosed '
      + 'wrong.',
    built: false,
    tier: null,
    employer: null,
    startsAt: null,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.8, device: 1, server: 1, project: 0 },
    utilisation: null,
    // The senior desk's, which is the nearest built rung below: the ramp does
    // not go back down, and the rung above this one is where the project code
    // and the billable split are earned.
    sheet: 'per_customer',
    customers: { inHouse: true, scopes: [], slaTiers: [] },
    sla: SLA_PROFILES.toolTargets,
    rates: RATES_PROFILES.house,
    winCondition: 'win:own_the_estate',
  },
  {
    id: 'systems_engineer',
    label: 'Systems Engineer',
    title: 'Systems Engineer',
    shapeBreak: 'Ticket TYPE becomes your choice - incident, request, change, '
      + 'problem - and you carry the pager.',
    built: true,
    tier: PLAYER_TIERS.systemsEngineer,
    employer: 'msp',
    startsAt: null,
    carriesPager: true,
    offeredAt: 70,
    workMix: { access: 0.75, device: 0.6, server: 1, project: 1 },
    utilisation: { basis: 'billable', percent: 75 },
    // The whole mechanic: per customer, the project on a line of its own with
    // its code, and the billable flag the 75% above is measured against.
    sheet: 'per_customer_project',
    customers: {
      inHouse: false,
      scopes: [
        SERVICE_SCOPES.monitoringOnly,
        SERVICE_SCOPES.helpdesk,
        SERVICE_SCOPES.coManaged,
        SERVICE_SCOPES.fullyManaged,
      ],
      slaTiers: [SLA_TIERS.bronze, SLA_TIERS.silver, SLA_TIERS.gold],
    },
    sla: SLA_PROFILES.contractLadder,
    rates: RATES_PROFILES.house,
    winCondition: 'win:keep_it_up',
  },
  {
    id: 'senior_engineer',
    label: 'Senior Engineer',
    title: 'Senior Systems Engineer',
    shapeBreak: 'You approve other people\'s changes and eat their blast '
      + 'radius; two clocks that cannot both be green.',
    built: false,
    tier: null,
    employer: null,
    startsAt: null,
    carriesPager: true,
    offeredAt: null,
    workMix: { access: 0.5, device: 0.4, server: 1, project: 1 },
    utilisation: null,
    // The engineer's, which is the nearest built rung below.
    sheet: 'per_customer_project',
    customers: {
      inHouse: false,
      scopes: [
        SERVICE_SCOPES.monitoringOnly,
        SERVICE_SCOPES.helpdesk,
        SERVICE_SCOPES.coManaged,
        SERVICE_SCOPES.fullyManaged,
      ],
      slaTiers: [SLA_TIERS.bronze, SLA_TIERS.silver, SLA_TIERS.gold],
    },
    sla: SLA_PROFILES.contractLadder,
    rates: RATES_PROFILES.house,
    winCondition: 'win:sign_it_off',
  },
  {
    id: 'team_lead',
    label: 'Team Lead',
    title: 'Service Delivery Lead',
    shapeBreak: 'You stop resolving and start assigning, on a rota you cannot '
      + 'staff.',
    built: false,
    tier: null,
    employer: null,
    startsAt: null,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.4, device: 0.3, server: 0.8, project: 1 },
    utilisation: null,
    // The engineer's, which is the nearest built rung below.
    sheet: 'per_customer_project',
    customers: {
      inHouse: false,
      scopes: [
        SERVICE_SCOPES.monitoringOnly,
        SERVICE_SCOPES.helpdesk,
        SERVICE_SCOPES.coManaged,
        SERVICE_SCOPES.fullyManaged,
      ],
      slaTiers: [SLA_TIERS.bronze, SLA_TIERS.silver, SLA_TIERS.gold],
    },
    sla: SLA_PROFILES.contractLadder,
    rates: RATES_PROFILES.house,
    winCondition: 'win:cover_the_rota',
  },
  {
    id: 'architect',
    label: 'Architect / vCIO',
    title: 'Solutions Architect',
    shapeBreak: 'Your decisions land three months later in somebody else\'s '
      + 'incident, and your diagrams go quietly wrong.',
    built: false,
    tier: null,
    employer: null,
    startsAt: null,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.2, device: 0.15, server: 0.5, project: 1 },
    utilisation: null,
    // The engineer's, which is the nearest built rung below.
    sheet: 'per_customer_project',
    customers: {
      inHouse: false,
      scopes: [
        SERVICE_SCOPES.monitoringOnly,
        SERVICE_SCOPES.helpdesk,
        SERVICE_SCOPES.coManaged,
        SERVICE_SCOPES.fullyManaged,
      ],
      slaTiers: [SLA_TIERS.bronze, SLA_TIERS.silver, SLA_TIERS.gold],
    },
    sla: SLA_PROFILES.contractLadder,
    rates: RATES_PROFILES.house,
    winCondition: 'win:ride_the_elevator',
  },
];

/**
 * The table, keyed, and refused at module load if it does not hold together.
 *
 * The checks are the ones a wrong row would otherwise pass silently: a rung
 * with no row (the union and the table drifting apart), a built rung with
 * nowhere to be hired or no tier to stand on, an unbuilt rung that has quietly
 * grown one, a ratio outside nought-to-one, and two rungs sharing a win
 * condition. Every one of them is a table that reads fine and means something
 * the game does not do.
 */
export const TITLE_TABLE: Readonly<Record<Rung, TitleRow>> = (() => {
  const table = {} as Record<Rung, TitleRow>;
  const goals = new Set<string>();
  const titles = new Set<string>();

  for (const rung of RUNGS) {
    const row = TITLE_ROWS.find((entry) => entry.id === rung);

    if (row === undefined) {
      throw new Error(
        `The ladder has a rung called "${rung}" and the table has no row for `
        + 'it. A rung nothing describes is a difficulty nobody can play.',
      );
    }

    if (row.built && (row.employer === null || row.tier === null)) {
      throw new Error(
        `"${rung}" says it is built and names no ${
          row.employer === null ? 'employer' : 'tier'
        }. A rung that can be selected has to have somewhere to start and a `
        + 'tier to start on.',
      );
    }

    if (!row.built && (row.employer !== null || row.tier !== null)) {
      throw new Error(
        `"${rung}" is not built and carries start state anyway. A rung with a `
        + 'start nobody can reach is a start that will be reached by accident.',
      );
    }

    for (const kind of WORK_KINDS) {
      const factor = row.workMix[kind];

      if (!Number.isFinite(factor) || factor < 0 || factor > 1) {
        throw new Error(
          `"${rung}" blends ${kind} work at ${String(factor)}. A blend ratio `
          + 'runs from nought (never) to one (as the shop deals it); above one '
          + 'is a rung inventing work the shop does not have.',
        );
      }
    }

    /**
     * And the target, refused for the same class of reason the ratios are: a
     * percentage outside one-to-a-hundred is a row asking for a week that
     * cannot be worked, and it would print as a target on a screen rather than
     * fail anywhere. Nought is refused too, and deliberately - a nought target
     * is met by doing nothing at all, which is not "no target", it is a target
     * that lies. The way to ask for nothing is null.
     */
    const target = row.utilisation;

    if (target !== null
      && (!Number.isFinite(target.percent)
        || target.percent <= 0
        || target.percent > 100)) {
      throw new Error(
        `"${rung}" asks for ${String(target.percent)}% of a week. A `
        + 'utilisation target is a percentage of the hours somebody is here '
        + 'for, so it runs from just above nought to a hundred; the way to ask '
        + 'for nothing is to name no target at all.',
      );
    }

    /**
     * And the basis, which is the one that would ship as a permanently red
     * row. `billable` over an IN-HOUSE rung is nought every week at every
     * in-house shop - the colleague down the corridor is on nobody's invoice -
     * so a row asking an in-house rung for billable minutes is asking for a
     * number the world cannot produce. It is refused here rather than
     * discovered at somebody's review.
     */
    /**
     * And the pairing of the two columns, which is the check that would have
     * refused what 0.39.0 had to delete by hand.
     *
     * A ONE-BUCKET SHEET IS A CONSTANT ON BOTH BASES. It writes one line a day
     * at `WORKING_MINUTES_PER_DAY` whatever the week was, so `recorded` is a
     * hundred per cent before the player has done anything and `billable` is
     * nought for ever. Either way the target does not measure the player: it
     * measures the shape of their sheet. That is a difficulty knob that cannot
     * turn, it shipped for one version, and the way it is refused now is the
     * whole class rather than the one figure.
     */
    if (target !== null && row.sheet === 'single_bucket') {
      throw new Error(
        `"${rung}" is asked for ${String(target.percent)}% of a week and `
        + 'fills in a one-bucket sheet. That sheet writes the same day every '
        + 'day whatever was worked, so the target is met - or missed - before '
        + 'the player does anything, which is a number on a card rather than '
        + 'something they can move.',
      );
    }

    /**
     * And the basis against a shape that makes no such split. Only the
     * engineer's sheet carries a billable flag; on either desk shape every
     * line is time nobody is invoiced for, so a billable target over one is
     * nought per cent every week for reasons the player cannot touch - the
     * same permanently-red row the in-house check below refuses, arriving by
     * the other column.
     */
    if (target !== null
      && target.basis === 'billable'
      && row.sheet !== 'per_customer_project') {
      throw new Error(
        `"${rung}" is asked for billable hours and fills in a sheet with no `
        + 'billable line on it. Nothing that rung records can ever be on an '
        + 'invoice, so the row would be red every week whatever they did.',
      );
    }

    if (target !== null && target.basis === 'billable' && row.customers.inHouse) {
      throw new Error(
        `"${rung}" is an in-house rung and is asked for billable hours. `
        + 'Nobody invoices the colleague down the corridor, so that target is '
        + 'nought every week for reasons the player cannot do anything about.',
      );
    }

    if (goals.has(row.winCondition)) {
      throw new Error(
        `Two rungs are played towards "${row.winCondition}". A win condition `
        + 'shared by two titles is one of them having no goal of its own.',
      );
    }

    /**
     * And the titles, which stopped being decoration at 0.36.0.
     *
     * Two rungs now stand on ONE PAM tier - the senior service desk analyst has
     * a junior's privileges and a senior's work - so the tier is no longer the
     * whole answer to "which rung is this", and `rungFor` reads the TITLE the
     * career already carries to settle it. That makes a duplicated title a rung
     * silently wearing another rung's week, which is the exact class of bug the
     * rest of these checks exist to refuse.
     */
    if (titles.has(row.title)) {
      throw new Error(
        `Two rungs are called "${row.title}". The title is what tells two `
        + 'rungs on one tier apart, so a shared one is a player being dealt '
        + 'somebody else\'s week under their own job description.',
      );
    }

    if (row.startsAt !== null
      && (!Number.isSafeInteger(row.startsAt) || row.startsAt < 1)) {
      throw new Error(
        `"${rung}" opens on week ${String(row.startsAt)} of its shop's arc. A `
        + 'week of an arc is numbered from one.',
      );
    }

    if (row.startsAt !== null && !row.built) {
      throw new Error(
        `"${rung}" is not built and names a week to start on anyway. A start `
        + 'nobody can reach is a start that will be reached by accident.',
      );
    }

    titles.add(row.title);
    goals.add(row.winCondition);
    table[rung] = row;
  }

  return Object.freeze(table);
})();

/** The rungs a new game may start at: the ones with the content to be played. */
export const BUILT_RUNGS: readonly Rung[] = Object.freeze(
  RUNGS.filter((rung) => TITLE_TABLE[rung].built),
);

export function isBuiltRung(value: unknown): value is Rung {
  return isRung(value) && TITLE_TABLE[value].built;
}

/** Where a career with no promotion on it starts: the bottom of the ladder. */
export const DEFAULT_RUNG: Rung = 'sd_junior';

/**
 * Which rung a player is on, read off the two things the career already
 * carries: the PAM tier, and the title.
 *
 * It was the tier alone until 0.36.0, and the comment where this one is said
 * the day a third rung was built it would bring a third tier with it. That
 * turned out to be wrong about THIS rung and right about the reasoning: the
 * senior service desk analyst has a junior's privileges, so giving it a tier of
 * its own would have handed it `sudo` to make a lookup convenient. The title is
 * the other half of the same carry - `FIELDS.title`, written by `carrySetup`,
 * taken across an employer by `carryForEmployer`, held in the save file since
 * 0.6.0 - so this needs no new field and no schema version either, and the
 * table refuses two rungs sharing a title so the read cannot be ambiguous.
 *
 * The TIER still decides first, because it is the fact that cannot be wrong: a
 * title nothing recognises (a hand-edited save, a build that has renamed a row)
 * falls back to the bottom of the ladder for the tier it stands on, which is
 * the same honest default the old function had.
 */
export function rungFor(tier: PlayerTier, title?: string | null): Rung {
  if (tier === PLAYER_TIERS.systemsEngineer) {
    return 'systems_engineer';
  }

  const named = typeof title === 'string'
    ? RUNGS.find(
      (rung) => TITLE_TABLE[rung].built
        && TITLE_TABLE[rung].tier === tier
        && TITLE_TABLE[rung].title === title,
    )
    : undefined;

  return named ?? DEFAULT_RUNG;
}

/** The row a player is playing under. */
export function rowFor(tier: PlayerTier, title?: string | null): TitleRow {
  return TITLE_TABLE[rungFor(tier, title)];
}

/**
 * The standing the offer INTO a rung is made at, refused for a rung nobody is
 * promoted into.
 *
 * A named read of the row rather than a number of its own: the promotion guard,
 * the terminal's offer beat and every test that seeds a promotable player all
 * ask this one question, and they now all ask the table.
 */
export function offeredAtFor(rung: Rung): number {
  const at = TITLE_TABLE[rung].offeredAt;

  if (at === null) {
    throw new Error(
      `Nobody is offered "${rung}" at a standing - the row names none. Asking `
      + 'for the bar of a promotion that does not exist is a guard that would '
      + 'have let everybody through.',
    );
  }

  return at;
}

/**
 * The tier a rung stands on, refused for a rung the build ships no tier for.
 *
 * The refusal is the same one `offeredAtFor` makes and for the same reason: a
 * null here means an unbuilt rung, and defaulting it would hand somebody the
 * service desk while calling them an architect.
 */
export function tierFor(rung: Rung): PlayerTier {
  const tier = TITLE_TABLE[rung].tier;

  if (tier === null) {
    throw new Error(
      `"${rung}" is a rung this build ships no tier for. Nothing can stand a `
      + 'player on it, and a default would stand them somewhere else under its '
      + 'name.',
    );
  }

  return tier;
}

/**
 * What the business asks of a rung's hours, or null where it asks nothing.
 *
 * A named read of the row rather than a lookup spelled out at every call site,
 * and NOT a throwing one like `tierFor` and `offeredAtFor` beside it: null here
 * is a decision the table made on purpose (see the row doc), not a rung the
 * build has not finished. Every reader of it has to be able to say nothing.
 */
export function utilisationTargetFor(rung: Rung): UtilisationTarget | null {
  return TITLE_TABLE[rung].utilisation;
}

/**
 * Which sheet a rung fills in.
 *
 * A named read of the row beside `utilisationTargetFor`, and NOT a nullable one
 * like it: every rung has a sheet, including the four nobody can play yet,
 * because a shape is a statement about the paperwork rather than a claim about
 * a week (see the column's docblock). There is nothing here to default and
 * nothing to refuse.
 *
 * It is the ONE question the sheet asks about whose week it is. `timesheet.ts`
 * takes the answer handed in, exactly as it takes the target, so that module
 * stays a leaf that knows how to draw a week without knowing whose it is.
 */
export function sheetShapeFor(rung: Rung): SheetShape {
  return TITLE_TABLE[rung].sheet;
}

/**
 * The standing the Systems Engineer offer is made at - the one promotion the
 * build ships, read off its row at load so the guard and the table cannot
 * disagree.
 */
export const ENGINEER_OFFER_AT: number = offeredAtFor('systems_engineer');

/** The title that promotion writes over whatever was held before it. */
export const ENGINEER_TITLE: string = TITLE_TABLE.systems_engineer.title;
