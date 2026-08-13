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

export const WORK_KIND_LABELS: Readonly<Record<WorkKind, string>> = {
  access: 'Passwords and access',
  device: 'Desktops and devices',
  server: 'Servers and services',
  project: 'Project work',
};

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

export function isRung(value: unknown): value is Rung {
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
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 1, device: 1, server: 1, project: 0 },
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
    built: false,
    tier: null,
    employer: null,
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.9, device: 0.9, server: 1, project: 0 },
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
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.8, device: 1, server: 1, project: 0 },
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
    carriesPager: true,
    offeredAt: 70,
    workMix: { access: 0.75, device: 0.6, server: 1, project: 1 },
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
    carriesPager: true,
    offeredAt: null,
    workMix: { access: 0.5, device: 0.4, server: 1, project: 1 },
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
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.4, device: 0.3, server: 0.8, project: 1 },
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
    carriesPager: false,
    offeredAt: null,
    workMix: { access: 0.2, device: 0.15, server: 0.5, project: 1 },
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

    if (goals.has(row.winCondition)) {
      throw new Error(
        `Two rungs are played towards "${row.winCondition}". A win condition `
        + 'shared by two titles is one of them having no goal of its own.',
      );
    }

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
 * Which rung a player is on, read off the PAM tier they carry.
 *
 * The tier is the closed set the world already writes, saves and carries across
 * an employer (`FIELDS.playerTier`), and it maps one-to-one onto the two BUILT
 * rungs - which is why the rung needs no field of its own on the player node
 * and no schema version to go with it. The day a third rung is built it will
 * bring a third tier with it, and this is the one function that changes.
 */
export function rungForTier(tier: PlayerTier): Rung {
  return tier === PLAYER_TIERS.systemsEngineer ? 'systems_engineer' : DEFAULT_RUNG;
}

/** The row a player at this tier is playing under. */
export function rowForTier(tier: PlayerTier): TitleRow {
  return TITLE_TABLE[rungForTier(tier)];
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
 * The standing the Systems Engineer offer is made at - the one promotion the
 * build ships, read off its row at load so the guard and the table cannot
 * disagree.
 */
export const ENGINEER_OFFER_AT: number = offeredAtFor('systems_engineer');

/** The title that promotion writes over whatever was held before it. */
export const ENGINEER_TITLE: string = TITLE_TABLE.systems_engineer.title;
