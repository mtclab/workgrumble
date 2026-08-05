/**
 * The employer, as a thing you can be handed a different one of.
 *
 * One company = one graph seed (`company.ts`, DESIGN_POC 6.4), and the E5
 * switch is the version where that stops being a comment and becomes a
 * parameter: `createWorldSession` is told WHICH employer to stand up, and an
 * employer is the four things a session needs that differ between one shop and
 * the next - the world graph, the pressure arc it runs, the install policy the
 * audit prices, and the pile of tickets already on the desk on the Monday.
 *
 * Slice 1 ships exactly one real employer, the probation shop, and the whole
 * of it is the seam: the registry has one entry, `employerFor` resolves it, and
 * the default carry names it. A second employer is a second entry in this
 * table (slice 3), and the switch mechanism can be driven today with a fixture
 * one passed straight in - which is what proves the parameter is real rather
 * than decorative before there is any shipped content behind it.
 *
 * Nothing here consumes the simulation RNG or reads the clock: an employer is
 * DATA the engine applies, the same as the company seed it wraps, so the same
 * carry and the same employer stand up the same world every time.
 */

import type { NodeId, SetupOp } from '../engine-api';
import { CHANNELS, type ChannelDef } from './channels';
import {
  COMPANY,
  companyInstallPolicy,
  companySetup,
  COMPANY_IDS,
  type InstallPolicy,
} from './company';
import { EMPLOYER_ARC, type EmployerArc } from './pressure';
import {
  mspChannels,
  MSP_COMPANY,
  MSP_IDS,
  mspSetup,
} from './msp-company';
import { mspInheritedTicketIds, MSP_WEEK } from './msp-week';
import {
  bodgeChannels,
  BODGE_COMPANY,
  BODGE_IDS,
  bodgeSetup,
} from './second-company';
import { bodgeInheritedTicketIds, SECOND_WEEK } from './second-week';
import {
  type DayScript,
  inheritedTicketIds,
  REVIEW_PASS_PERFORMANCE,
  WEEK,
} from './week';

/**
 * The employers this build ships. The probation shop, and - since 0.6.0 slice 2
 * - a SECOND one to switch to, so the transition surface has somewhere to land.
 * The list is the closed set the carry's employer id is checked against, so a
 * save that names an employer this build has never heard of is a refusal rather
 * than a silent fall back to the wrong world.
 */
export const EMPLOYER_IDS = ['workgrumble', 'bodgeworth', 'msp'] as const;

export type EmployerId = (typeof EMPLOYER_IDS)[number];

/** Where a career starts: the shop that hired the probationer. */
export const FIRST_EMPLOYER: EmployerId = 'workgrumble';

export function isEmployerId(value: unknown): value is EmployerId {
  return typeof value === 'string'
    && EMPLOYER_IDS.some((id) => id === value);
}

/**
 * One employer, as everything a session needs that is not the same between two
 * of them.
 *
 * `id` is a plain string rather than the `EmployerId` union on purpose: a
 * fixture employer built inside a test carries an id the shipped registry has
 * never heard of, and the switch mechanism has to work for it exactly as it
 * works for a real one. `employerFor` is where the closed set is enforced; an
 * `Employer` value handed in directly is trusted to be coherent.
 */
export interface Employer {
  readonly id: string;
  /**
   * What the offer letter and the arrival screen call the place, in words a
   * player reads. The graph carries a company name of its own; this is the one
   * the SWITCH surfaces name, because those screens run between two worlds and
   * cannot read either graph for it.
   */
  readonly name: string;
  /** The node the week's fund, meters and standing live on. */
  readonly playerId: NodeId;
  /** What the audit does about an install here. Read by the drip in the shell. */
  readonly installPolicy: InstallPolicy;
  /** The career arc this employer runs - one season of weather in it, or none. */
  readonly arc: EmployerArc;
  /**
   * This employer's five days, as data (0.6.0 slice 3). The session points the
   * day readers at it (`setActiveWeek`), so the shipped driver plays whichever
   * shop's week the carry names without learning a second table exists. The
   * probation employer's is the probation `WEEK`, which is what keeps its
   * goldens byte-identical.
   */
  readonly week: readonly DayScript[];
  /**
   * The rooms this employer's channel client rolled out - the channel-mix half
   * of the archetype contrast (0.6.0 slice 3, off the 0.5.0 per-employer seam).
   */
  readonly channels: readonly ChannelDef[];
  /**
   * The mark the Friday review is held against here. It is per-employer because
   * a different shop asks a different thing of a first week - though it never
   * drops below the published pass mark, which the review verbs enforce.
   */
  readonly reviewBar: number;
  /**
   * Whether this employer runs the probation lead's boss PINGS - the beat that
   * mints his concern as a ticket and messages you (0.6.0 slice 3). It is
   * probation content (a probation reporter, probation ping lines), so a shop
   * with a different lead turns it off: its boss still walks the floor and
   * catches slacking, but does not raise the probation lead's ticket into a
   * world that lead is not in.
   */
  readonly runsBossPings: boolean;
  /** The world graph - company, estate, accounts - as construction ops. */
  setup(): readonly SetupOp[];
  /** The ids of the tickets already waiting when the player sits down Monday. */
  mondayTicketIds(): readonly string[];
}

/**
 * The probation shop, wrapped as an employer.
 *
 * Every field reads through to what `session.ts` used to reach for directly, so
 * standing this employer up applies byte-for-byte the same ops in the same
 * order as before the switch existed - which is the whole of the claim the
 * probation goldens make.
 */
const PROBATION_EMPLOYER: Employer = Object.freeze({
  id: FIRST_EMPLOYER,
  name: COMPANY.name,
  playerId: COMPANY_IDS.player,
  installPolicy: companyInstallPolicy(),
  arc: EMPLOYER_ARC,
  week: WEEK,
  channels: CHANNELS,
  reviewBar: REVIEW_PASS_PERFORMANCE,
  runsBossPings: true,
  setup: companySetup,
  mondayTicketIds: () => inheritedTicketIds(1),
});

/**
 * The second employer, made REAL (0.6.0 slice 3).
 *
 * Slice 2 shipped this as a placeholder that reused the probation shop's own
 * content under a new id and name - enough to prove the transition flow stood a
 * second world up and seeded it from the carried career. Slice 3 is where the
 * placeholder becomes a genuinely different building: Bodgeworth & Batch, a
 * wild-west haulage firm with its own estate (`second-company.ts`), its own
 * five-day week and reply-all event day (`second-week.ts`), its own rooms, and
 * an install policy of `wild_west` - the 0.4.0 audit seam paying off by its
 * ABSENCE, and the 0.5.0 channel-mix seam paying off with one all-staff room
 * instead of three governed ones.
 *
 * The id is kept as `bodgeworth` from slice 2 (the name already read as a
 * bodge-shop, which is exactly the archetype), so no shipped save or slice-2
 * test has to move for the rename that was not needed. Everything ELSE moved:
 * the setup, the policy, the week, the channels and the Monday pile are all the
 * shop's own now, and the switch mechanism did not have to change to carry it -
 * which is the whole point of having proved the seam against the placeholder
 * first. `playerId` stays `person:pat`: it is the same person, a fortnight into
 * a very different job, and the career carry seeds their standing onto it.
 *
 * `reviewBar` is the published pass mark: the contrast Bodgeworth teaches is in
 * the building, not in a harder or softer Friday, and the review verbs forbid a
 * bar below the published figure anyway.
 */
const SECOND_EMPLOYER: Employer = Object.freeze({
  id: 'bodgeworth',
  name: BODGE_COMPANY.name,
  playerId: BODGE_IDS.player,
  installPolicy: 'wild_west',
  arc: EMPLOYER_ARC,
  week: SECOND_WEEK,
  channels: bodgeChannels(),
  reviewBar: REVIEW_PASS_PERFORMANCE,
  // Bodgeworth's lead is Vernon, and it authors no boss-ping beat: no probation
  // ticket to mint, no probation thread to write. The boss still walks the
  // floor and still catches you slacking; he just does not ping.
  runsBossPings: false,
  setup: bodgeSetup,
  mondayTicketIds: bodgeInheritedTicketIds,
});

/**
 * The MSP, made real (0.8.0, E5 #26) - a THIRD employer, reached the way
 * Bodgeworth is: a new entry on this registry, wrapped to next after Bodgeworth
 * by `nextEmployerAfter`. It is a Managed Service Provider serving many customer
 * companies (`msp-company.ts`), with its own estate spanning three customers,
 * its own light first week (`msp-week.ts`), and its own two governed rooms. The
 * player is `person:pat` still - the same career, now on a service desk - so a
 * switch seeds their standing onto it exactly as a switch to Bodgeworth does.
 *
 * `runsBossPings` is false: the MSP's lead is not the probation reporter, so it
 * authors no probation ping beat, the same as Bodgeworth. `installPolicy` is
 * `governed`, because an MSP tech's own workstation is a managed device with an
 * audit - the customer estates are what is new, not a wild-west desk.
 */
const MSP_EMPLOYER: Employer = Object.freeze({
  id: 'msp',
  name: MSP_COMPANY.name,
  playerId: MSP_IDS.player,
  installPolicy: MSP_COMPANY.installPolicy,
  arc: EMPLOYER_ARC,
  week: MSP_WEEK,
  channels: mspChannels(),
  reviewBar: REVIEW_PASS_PERFORMANCE,
  runsBossPings: false,
  setup: mspSetup,
  mondayTicketIds: mspInheritedTicketIds,
});

const REGISTRY: Readonly<Record<string, Employer>> = Object.freeze({
  [FIRST_EMPLOYER]: PROBATION_EMPLOYER,
  [SECOND_EMPLOYER.id]: SECOND_EMPLOYER,
  [MSP_EMPLOYER.id]: MSP_EMPLOYER,
});

/**
 * The employer a carry names, or the probation shop when it names none.
 *
 * A carry from before the switch existed has no employer on it, which is the
 * back-compat rule read forwards: absent is the first employer, because the
 * first employer is the only one those saves could have been written at. An id
 * this build does not ship is refused rather than defaulted - defaulting it
 * would stand up the probation shop's world under a career that belongs to a
 * different one, which is a silently wrong game rather than a stopped one.
 */
export function employerFor(id: string = FIRST_EMPLOYER): Employer {
  const employer = REGISTRY[id];

  if (employer === undefined) {
    throw new Error(
      `No employer in this build is called "${id}". A save that names one this `
      + 'version has never shipped cannot be stood up as the wrong company.',
    );
  }

  return employer;
}

/**
 * The name the switch surfaces print for an employer, or the id itself when the
 * build has never heard of it.
 *
 * A fixture employer built inside a test carries an id the registry does not
 * know, and the offer screen for it should still say SOMETHING rather than
 * throw - the id is a worse label than a name but a better one than a crash -
 * so this is deliberately tolerant where `employerFor` is strict.
 */
export function employerName(id: string): string {
  return REGISTRY[id]?.name ?? id;
}

/**
 * The employer a career moves to next, given the one it is leaving.
 *
 * The offer surface and the accept that follows it both have to agree on where
 * the next job is, so it is one function read from both rather than two guesses
 * that could drift. It walks `EMPLOYER_IDS` from the current shop to the next
 * one and wraps at the end - which, with two employers shipped, is the probation
 * shop again. That wrap is a PLACEHOLDER, the same as the second employer is: a
 * real career progression is slice-3-and-later content, and until it exists the
 * honest thing is a defined destination rather than a dead end. An id the build
 * does not ship (a fixture, a hand-edited save) leaves from the first employer,
 * because that is the only one it could coherently have been at.
 */
export function nextEmployerAfter(id: string): EmployerId {
  const at = EMPLOYER_IDS.indexOf(id as EmployerId);
  const from = at === -1 ? 0 : at;
  return EMPLOYER_IDS[(from + 1) % EMPLOYER_IDS.length] as EmployerId;
}
