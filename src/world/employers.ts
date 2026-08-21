/**
 * The employer, as a thing you can be handed a different one of.
 *
 * One company = one graph seed (`company.ts`, DESIGN_POC 6.4), and the E5
 * switch is the version where that stops being a comment and becomes a
 * parameter: `createWorldSession` is told WHICH employer to stand up, and an
 * employer is the four things a session needs that differ between one shop and
 * the next - the world graph, the pressure arc it runs, the install policy the
 * audit prices, and the five days it deals.
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
import { type CarriedField, playerCarries } from './carry';
import { CHANNELS, type ChannelDef } from './channels';
import { FIELDS } from './fields';
import {
  COMPANY,
  companyInstallPolicy,
  companySetup,
  COMPANY_IDS,
  type InstallPolicy,
} from './company';
import { EMPLOYER_ARC, type EmployerArc, seasonlessArc } from './pressure';
import {
  mspChannels,
  MSP_COMPANY,
  MSP_IDS,
  mspSetup,
} from './msp-company';
import { MSP_WEEK } from './msp-week';
import {
  bodgeChannels,
  BODGE_COMPANY,
  BODGE_IDS,
  bodgeSetup,
} from './second-company';
import { SECOND_WEEK } from './second-week';
import {
  halcyonChannels,
  HALCYON_COMPANY,
  HALCYON_IDS,
  halcyonSetup,
} from './corporate-company';
import { CORPORATE_WEEK } from './corporate-week';
import {
  type DayScript,
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
export const EMPLOYER_IDS = [
  'workgrumble',
  'bodgeworth',
  'msp',
  // The in-house corporate employer (E8, 0.22.0): the exec weak spot lives here,
  // reached after the MSP the way the MSP is reached after Bodgeworth. Appended,
  // so every existing transition (workgrumble -> bodgeworth -> msp) is unmoved
  // and only `nextEmployerAfter('msp')` gains a real destination instead of the
  // placeholder wrap.
  'corporate',
] as const;

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
  /**
   * The career arc this employer runs - one season of weather in it, or none.
   *
   * ITS OWN arc, since 0.36.0 (#59a). All four shops shared one until then,
   * which read as a saving of four lines and was in fact the probation shop's
   * redundancy round firing at every building in the game, narrated by a pool
   * of five colleagues who work at one of them. The arc names the shop it
   * belongs to and `REGISTRY` refuses a mismatch at load, so this field is a
   * declaration rather than a pointer anybody can re-use.
   */
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
  /**
   * The world facts that survive a week AT THIS EMPLOYER (E11, 0.34.0).
   *
   * D-E11-1's declared list, per shop, node by node and field by field. It is
   * DATA rather than a rule because a repair is a fact about a building: the
   * note by the socket in the probation shop's warehouse corridor is not a
   * concept the MSP has, and a whitelist that generalised over "machines" would
   * be a rule nobody could review. Everything not named here is rebuilt from
   * `setup()` on the Monday exactly as it always was, and a shop with an empty
   * list is byte-identical to the world before this existed.
   *
   * Read by `stayAnotherWeek` off the Friday's world and written back into the
   * Monday's; see `carry.ts` for the three questions each entry was put to.
   */
  readonly carries: readonly CarriedField[];
  /** The world graph - company, estate, accounts - as construction ops. */
  setup(): readonly SetupOp[];
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
  /**
   * What the probation shop's world keeps over the weekend.
   *
   * TWO entries, and both were argued for one at a time.
   *
   * `known_hosts` on the player: the ssh client's trust-on-first-use set. Not
   * an estate fact at all - a fact about the player's own client - and it is on
   * the list because the field's own documentation gives the argument for it
   * while making the opposite case about a SWITCH: "a new estate is new boxes,
   * and last job's fingerprints mean nothing at this one". At the same estate
   * they mean everything, and being asked to trust PRINT-02 again on the Monday
   * would be a client forgetting the one thing an ssh client does not forget.
   *
   * `sticky_note` on the warehouse print server: the DO NOT UNPLUG note by the
   * socket in the corridor. It is the sharpest case in the game for
   * persistence, which is why it is here rather than in the reset pile - it is
   * a REPAIR TO A BUILDING, made by a person with a marker who is not coming
   * back to un-make it, and it is the payoff of the one arc in the probation
   * week whose entire lesson is that the second occurrence needs a different
   * fix from the first. A Monday that had quietly taken it down would make that
   * lesson a coincidence.
   *
   * And everything else at this shop resets, including two that were close:
   * `power_losses` on the warehouse printer (a COUNT of what went off this
   * week, and the evidence gate the note is earned by - carried, it would hand
   * a Monday a timetable that Monday has not shown, which is the exact defect
   * `facilities.ts` added the evidence guard to close), and `conduct_file` on
   * the player (every line is `tick|kind|text` stamped by `conductStamp` with a
   * day NAME off a clock that restarts every Monday, so carrying it puts lines
   * reading "Wednesday 14:32" into a week where that minute has not happened -
   * and the bar reads only the file's SIZE, so it would silently raise next
   * week's pass mark by up to twenty-five points with no surface saying why in
   * that week's own words). The file crossing weeks needs its own week-stamped
   * archive and its own sentence on the review screen; that is content, not a
   * whitelist row.
   */
  carries: Object.freeze([
    ...playerCarries(COMPANY_IDS.player),
    { node: COMPANY_IDS.warehousePrintServer, field: FIELDS.stickyNote },
  ]),
  setup: companySetup,
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
  // Ten weeks and no weather on them. Bodgeworth has authored no season -
  // it has no Marcus in Accounts to forward the wrong board pack and no pool
  // to be scored in - so it runs the arc seasonless until it writes one, which
  // is the truthful shape rather than borrowing the probation shop's round.
  arc: seasonlessArc('bodgeworth'),
  week: SECOND_WEEK,
  channels: bodgeChannels(),
  reviewBar: REVIEW_PASS_PERFORMANCE,
  // Bodgeworth's lead is Vernon, and it authors no boss-ping beat: no probation
  // ticket to mint, no probation thread to write. The boss still walks the
  // floor and still catches you slacking; he just does not ping.
  runsBossPings: false,
  /**
   * Bodgeworth keeps the player's own client and nothing about the building.
   *
   * Walked field by field, the shop has no permanent repair in it to keep: its
   * week is five days of break-fix on machines whose faults are re-seeded by
   * whichever ticket reports them, its accounts are shared logins nobody ever
   * remediates, and its one distinguishing state is the ABSENCE of an install
   * audit, which is a policy rather than a fact anybody wrote down. A
   * wild-west shop that carries nothing but the fingerprints is the honest
   * answer, and an empty-but-for-the-player list is a real answer rather than
   * an unfinished one.
   */
  carries: playerCarries(BODGE_IDS.player),
  setup: bodgeSetup,
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
  // Seasonless, like Bodgeworth: the MSP is where the shared-arc defect was
  // FOUND (an inbox holding a redundancy announcement signed by two people at
  // another company), and a desk that serves three customer estates would want
  // a season about losing one of them - `client_loss` is in the catalogue,
  // written down and unbuilt - rather than this building's round.
  arc: seasonlessArc('msp'),
  week: MSP_WEEK,
  channels: mspChannels(),
  reviewBar: REVIEW_PASS_PERFORMANCE,
  runsBossPings: false,
  /**
   * The MSP keeps the player's own client and, for now, nothing of its
   * customers' estates.
   *
   * The two real candidates here are the project's phase state and the
   * firewall rules a migration documented (`fw_rule_documented`,
   * `fw_rule_migrated`), and both are deliberately OFF the list rather than
   * missing from it. A project that survives Friday is E10 fork B - it needs a
   * re-seed path that stands the in-flight project's world back up, not a row
   * in a whitelist - and a half-migrated rule set carried without the project
   * that was migrating it is an estate with a job half done and nobody doing
   * it. They go on this list the version the project carries, and not before.
   *
   * ONE THING JOINED IT (E9, 0.39.0): the patience ledger, which is the only
   * field in this game that HAS to cross a Friday. Everything else on any
   * carry list is an estate fact that could in principle be re-derived from a
   * world; this one is a fold over weeks that no longer exist - a client's
   * account of the last month, which cannot be read off a Monday's graph
   * because the tickets it is about were last week's. It passes the three
   * questions cleanly: it is a fact about the relationship rather than about a
   * week, it carries no clock (the fold zeroes every tick, see `patience.ts`),
   * and it cannot make a week unplayable - it can only take work OUT of one,
   * which the post-churn solvability sweep is there to prove stays feasible.
   *
   * It is on this shop's list and nobody else's, for the obvious reason: the
   * other three employers have no customers, so the field is never written
   * there, the delta is empty, and their weeks are byte-identical.
   */
  carries: Object.freeze([
    ...playerCarries(MSP_IDS.player),
    { node: MSP_IDS.player, field: FIELDS.customerPatience },
  ]),
  setup: mspSetup,
});

/**
 * The corporate employer, made real (E8, 0.22.0) - a FOURTH employer, reached
 * the way the MSP is: a new entry on this registry, wrapped to next after the
 * MSP by `nextEmployerAfter`. It is an in-house corporate IT desk at Halcyon
 * Grange Holdings (`corporate-company.ts`), where the player supports the
 * executives directly, and its distinguishing character is the POLITICS - the
 * exec who demands a security exception the desk is pressured to grant. The
 * player is `person:pat` still, so a switch seeds their standing onto it exactly
 * as a switch to Bodgeworth or the MSP does.
 *
 * `runsBossPings` is false: Halcyon's lead is not the probation reporter, so it
 * authors no probation ping beat, the same as Bodgeworth and the MSP.
 * `installPolicy` is `locked_down` - a corporate IT desk is a managed device
 * with an audit, exactly as watched as the probation shop; the exec politics are
 * what is new, not a wild-west desk.
 */
const CORPORATE_EMPLOYER: Employer = Object.freeze({
  id: 'corporate',
  name: HALCYON_COMPANY.name,
  playerId: HALCYON_IDS.player,
  installPolicy: HALCYON_COMPANY.installPolicy,
  // Seasonless, like the other two. Halcyon is the shop with the most obvious
  // season waiting to be written - `new_leadership` and `merger` are both
  // exec-politics weather and both are in the catalogue unbuilt - and none of
  // that is a reason to run somebody else's round in the meantime.
  arc: seasonlessArc('corporate'),
  week: CORPORATE_WEEK,
  channels: halcyonChannels(),
  reviewBar: REVIEW_PASS_PERFORMANCE,
  runsBossPings: false,
  /**
   * Halcyon keeps the player's own client, and its exceptions are reviewed and
   * NOT carried - which is the entry on this list it was hardest to leave off.
   *
   * `filter_exempt` and `mailbox_delegate` are the granted security exceptions
   * the whole org-dysfunction epic turns on, and in a real building they
   * absolutely persist: that is the thesis - the exception IS the
   * vulnerability, and it is still open next month. But they are not inert
   * state. They ARM a later incident: the phish reaches the exempted exec
   * because the exemption is open, and the delegate is the persistence vector
   * the hunt finds. Carrying them means a week-two world where an incident can
   * fire out of a decision made in a week the player cannot re-read, with no
   * beat between the two saying so. That is an E8 arc with its own gate, not a
   * row here, and the honest thing is to say which it is.
   */
  carries: playerCarries(HALCYON_IDS.player),
  setup: halcyonSetup,
});

/**
 * Load-time gate for the registry: every shop is filed under its own id, and
 * every arc belongs to the shop that runs it (#59a).
 *
 * The second half is the one with the history. `Employer.arc` is a reference,
 * and four references to one value are indistinguishable from four
 * declarations right up until the value has content on it - at which point
 * every building in the game is running one building's redundancy round and
 * nothing anywhere says so. Now the arc names its owner and this refuses the
 * mismatch at boot, so re-pointing a shop at another shop's season is a
 * stopped build rather than a career ended by five colleagues the player has
 * never met.
 */
export function validateRegistry(
  registry: Readonly<Record<string, Employer>>,
): Readonly<Record<string, Employer>> {
  for (const [id, employer] of Object.entries(registry)) {
    if (employer.id !== id) {
      throw new Error(
        `The employer registry files "${employer.id}" under "${id}". A shop is `
        + 'looked up by the id it carries, and two answers to which one this '
        + 'is would stand the wrong world up.',
      );
    }

    if (employer.arc.employer !== employer.id) {
      throw new Error(
        `"${employer.id}" runs the arc that belongs to `
        + `"${employer.arc.employer}". A season is content: its pool, its `
        + 'announcements and its cast are one building\'s, and a shop that has '
        + 'authored none runs a seasonless arc rather than borrowing one.',
      );
    }
  }

  return Object.freeze(registry);
}

const REGISTRY: Readonly<Record<string, Employer>> = validateRegistry({
  [FIRST_EMPLOYER]: PROBATION_EMPLOYER,
  [SECOND_EMPLOYER.id]: SECOND_EMPLOYER,
  [MSP_EMPLOYER.id]: MSP_EMPLOYER,
  [CORPORATE_EMPLOYER.id]: CORPORATE_EMPLOYER,
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
