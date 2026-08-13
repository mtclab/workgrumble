/**
 * The surplus: content a shop can be dealt that its authored week never uses
 * (E11, 0.34.0 slice 2).
 *
 * 0.31.0 took the four hand-written weeks apart into the units a generator can
 * move about, and the pools that came out were exactly week-sized: every entry
 * a shop held was an entry its own Monday-to-Friday already spent. That is a
 * decomposition with nothing left over, and a decomposition with nothing left
 * over cannot honour an exclusion window - bar the entries last week drew and
 * there is nothing to deal. Slice 1 shipped that fact honestly as
 * `PRODUCT_WINDOW = 0` with a ratchet on it. This module is the bill.
 *
 * WHAT A SPARE IS. One cell of one column, in the same `DayFragment` shape the
 * decomposition emits, with no home day: it can be drawn into any week but the
 * authored one, and the authored one is the table somebody wrote. Nothing here
 * is coupled - a spare is a single loose entry by construction, because the
 * arcs stay authored and pinned (the spike, section 7) and a beat is the one
 * thing a draw must not be able to take apart.
 *
 * WHAT A SPARE IS NOT. It is not novelty per slot. The owner's calibration on
 * D-E11-6 is exact - "boring shoveling and repetition is expected but not too
 * much" - so the surplus is deliberately half characterful and half the job's
 * own texture: the password nobody can remember, the printer at the end of the
 * yard, the certificate that expired on a Sunday. The mundane ones are SHORT.
 * A four-paragraph ticket about a flat battery would be the game insisting a
 * flat battery is interesting, which is a worse lie than the repetition.
 *
 * EVERY ENTRY LANDS ON THE ESTATE THAT ALREADY EXISTS. No new machines, no new
 * verbs, no new apps: a pool ticket that needed one would be a feature wearing
 * a ticket's clothes, and the ideas that needed one were dropped and written
 * down in the commit rather than built around.
 *
 * Nothing here dispatches, reads a clock, or consumes the engine's RNG.
 */

import type { AfterHoursSlot } from '../after-hours';
import type { ChannelMessageSlot } from '../channels';
import type { InterruptionSlot } from '../interruptions';
import type { OnCallPage } from '../on-call';
import type { DayFragment } from '../pools';
import type { LinkedRequestSlot } from '../requests';
import {
  arrivesBeforeClose,
  dripMinute,
  type DayScript,
  type DmSlot,
  type DripSlot,
  type IncidentSlot,
  type NoHelloSlot,
  type OnboardingSlot,
  type WalkUpSlot,
} from '../week';
import { SHIFT_END_MINUTE, SHIFT_START_MINUTE } from '../day';
import { BODGE_SPARES } from './bodge';
import { CORPORATE_SPARES } from './corporate';
import { DESK_SPARES } from './desk';
import { MSP_SPARES } from './msp';

/**
 * The surplus, per shop.
 *
 * Keyed on the employer id the registry uses. That the key names a shop this
 * build actually has is checked in `pools.ts`, next to the same refusal the
 * coupling table carries and for the same reason - a key nobody matches reads
 * as "that shop got no new content" rather than as a typo. It lives THERE
 * rather than here because this module is imported by the roster gate, which
 * is imported before the employer registry has finished standing itself up: a
 * top-level read of `EMPLOYER_IDS` from here is undefined at that moment, which
 * is a boot failure about module order rather than about content.
 */
const SPARES: Readonly<Record<string, readonly DayFragment[]>> = {
  workgrumble: DESK_SPARES,
  bodgeworth: BODGE_SPARES,
  msp: MSP_SPARES,
  corporate: CORPORATE_SPARES,
};

/** The shops the surplus is filed under, for the loader that can check them. */
export const SPARE_EMPLOYERS: readonly string[] = Object.freeze(
  Object.keys(SPARES),
);

/** What this shop can be dealt on top of the week it wrote. */
export function sparesFor(employerId: string): readonly DayFragment[] {
  return SPARES[employerId] ?? [];
}

function cellsOf(fragment: DayFragment, column: string): readonly unknown[] {
  return (fragment as Record<string, readonly unknown[] | undefined>)[column]
    ?? [];
}

/**
 * The surplus as five days, for the gates that read a WEEK.
 *
 * Two of them do, and neither can be skipped. `assertWeekTickets` refuses a
 * ticket that is "not in anybody's week" - the ships-dead check, and every pool
 * ticket would trip it, because a pool ticket is by definition dealt by no
 * authored day. And the same function is the only place that holds a dealt
 * ticket to arriving the way its roster entry says it does.
 *
 * So the surplus is handed over in the shape those gates read. It is NOT a week
 * anybody plays: no loads, no ramp, no budget, and `validateWeek` is never run
 * over it - the sampler's own gate does that, on the arrangements it actually
 * emits, where the answer means something. The day numbers are here because the
 * shape has a slot for them and the refusals quote them, and for nothing else.
 */
export function spareWeekFor(employerId: string): readonly DayScript[] {
  const held = sparesFor(employerId);

  return Array.from({ length: 5 }, (_, index) => {
    const mine = held.filter((_fragment, at) => at % 5 === index);
    const column = (name: string): readonly unknown[] => mine.flatMap(
      (fragment) => cellsOf(fragment, name),
    );

    return {
      day: index + 1,
      label: `surplus ${String(index + 1)}`,
      inherited: column('inherited') as readonly string[],
      drip: column('drip') as readonly DripSlot[],
      // Every other column too, and not for completeness: each one is read by
      // a gate. The greeting gate refuses a bare hello from somebody with no
      // greeting written, the roster gate refuses a room post about a ticket
      // nobody wrote, and both of those are content facts a spare can get
      // wrong exactly as an authored day can.
      incidents: column('incidents') as readonly IncidentSlot[],
      dms: column('dms') as readonly DmSlot[],
      interruptions: column('interruptions') as readonly InterruptionSlot[],
      walkUps: column('walkUps') as readonly WalkUpSlot[],
      noHello: column('noHello') as readonly NoHelloSlot[],
      channels: column('channels') as readonly ChannelMessageSlot[],
      requests: column('requests') as readonly LinkedRequestSlot[],
      afterHours: column('afterHours') as readonly AfterHoursSlot[],
      onCall: column('onCall') as readonly OnCallPage[],
      onboarding: column('onboarding') as readonly OnboardingSlot[],
      patrolSeed: 0,
      load: 1,
    };
  });
}

/** Every shop's surplus, in the shape the roster gate reads. */
export function spareWeeks(): readonly (readonly DayScript[])[] {
  return SPARE_EMPLOYERS.map((id) => spareWeekFor(id));
}

/**
 * The surplus, checked at load for the things a DRAW would only find on some
 * seeds.
 *
 * A spare is placed by the sampler rather than by a person, so the ordinary
 * loader only ever sees the handful that happened to be drawn together. Two
 * failures hide in that gap. An id that repeats - two interruptions, two pings,
 * two room posts, the same ticket dealt from two entries - is a shared record
 * in the world graph, so whichever of them is drawn second arrives already
 * answered or already open; `validateWeek` refuses it, but only in the weeks
 * where the draw happened to put both. And a minute outside the hours anybody
 * can start a ticket in is a refusal in the same shape: correct, loud, and only
 * on some seeds. Both are facts about the CONTENT rather than about an
 * arrangement, so both are settled here, once, at boot, where the failure names
 * the entry instead of naming a seed.
 */
function validateSpares(): void {
  for (const employer of SPARE_EMPLOYERS) {
    const held = sparesFor(employer);
    const seen = new Map<string, string>();

    const claim = (kind: string, id: string): void => {
      const already = seen.get(id);

      if (already !== undefined) {
        throw new Error(
          `${employer}'s surplus carries "${id}" as both ${already} and `
          + `${kind}. The world records what was done about one of these `
          + 'against its id, so two of them share a record and the second is '
          + 'drawn already answered.',
        );
      }

      seen.set(id, kind);
    };

    for (const fragment of held) {
      for (const id of cellsOf(fragment, 'inherited') as readonly string[]) {
        claim('a morning arrival', id);
      }

      for (const slot of cellsOf(fragment, 'drip') as readonly DripSlot[]) {
        claim('a drip', slot.ticketId);

        const minute = dripMinute(slot);

        if (minute < SHIFT_START_MINUTE || minute > SHIFT_END_MINUTE) {
          throw new Error(
            `${employer}'s surplus drips "${slot.ticketId}" at minute `
            + `${String(minute)}, which is outside the hours anybody is at the `
            + 'desk. A spare is placed by the draw, so this would be a refusal '
            + 'on some seeds and a clean boot on the rest.',
          );
        }

        if (!arrivesBeforeClose(slot) && (minute < 570 || minute > 930)) {
          throw new Error(
            `${employer}'s surplus drips "${slot.ticketId}" at minute `
            + `${String(minute)}, which is outside the window a ticket may be `
            + 'started in (09:30 to 15:30). Only the four-minutes-to-five '
            + 'class is exempt, and it says so in its own field.',
          );
        }
      }

      for (const slot of cellsOf(
        fragment, 'interruptions',
      ) as readonly InterruptionSlot[]) {
        claim('an interruption', slot.id);
      }

      for (const slot of cellsOf(
        fragment, 'afterHours',
      ) as readonly AfterHoursSlot[]) {
        claim('an after-hours ping', slot.id);
      }

      for (const slot of cellsOf(
        fragment, 'channels',
      ) as readonly ChannelMessageSlot[]) {
        claim('a room post', slot.id);
      }
    }
  }
}

validateSpares();
