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
import {
  companyInstallPolicy,
  companySetup,
  COMPANY_IDS,
  type InstallPolicy,
} from './company';
import { EMPLOYER_ARC, type EmployerArc } from './pressure';
import { inheritedTicketIds } from './week';

/**
 * The employers this build ships. One for now - the probation shop - and the
 * list is the closed set the carry's employer id is checked against, so a save
 * that names an employer this build has never heard of is a refusal rather than
 * a silent fall back to the wrong world.
 */
export const EMPLOYER_IDS = ['workgrumble'] as const;

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
  /** The node the week's fund, meters and standing live on. */
  readonly playerId: NodeId;
  /** What the audit does about an install here. Read by the drip in the shell. */
  readonly installPolicy: InstallPolicy;
  /** The career arc this employer runs - one season of weather in it, or none. */
  readonly arc: EmployerArc;
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
  playerId: COMPANY_IDS.player,
  installPolicy: companyInstallPolicy(),
  arc: EMPLOYER_ARC,
  setup: companySetup,
  mondayTicketIds: () => inheritedTicketIds(1),
});

const REGISTRY: Readonly<Record<string, Employer>> = Object.freeze({
  [FIRST_EMPLOYER]: PROBATION_EMPLOYER,
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
