/**
 * THE STANDING GATE: a season belongs to one building.
 *
 * The sibling of `mail.test.ts`'s "every inbox is one building's post", asked
 * on the other surface the same defect came out of. That one closed the mail
 * half of #59 - no more threads from a stranger in a shop's inbox - and left
 * the beat itself firing: all four employers pointed at one `EMPLOYER_ARC`, so
 * from arc week four at ANY shop the probation shop's redundancy round ran.
 * `pressureSummary` narrated it through Bev, Gary, Terry, Owen and Rob, who
 * work at exactly one of the four buildings, and at every other one the
 * evening scorecard printed `person:bev` because a truthful name lookup has
 * nothing else to print. `readTheMatrix` could end a career on that ranking.
 *
 * The class is wider than that season and wider than one shop: CONTENT
 * AUTHORED FOR ONE BUILDING'S CAST, SHOWN IN A WORLD THAT CAST IS NOT IN. So
 * the assertion is made over every employer this build ships, at every week of
 * the arc, through the shipped driver over a real world - and it asks three
 * questions of every beat that has fired:
 *
 * - is what it announced itself with in THIS building's inbox,
 * - does every person it names have a name in THIS building's graph,
 * - and does the sentence the screens print introduce anybody by node id.
 *
 * Plus the claim that makes the fix a fix rather than a mute: the round still
 * runs at the shop that wrote it, in exactly the weeks it always did, and the
 * three that wrote none reach the end of the arc with no season surface on
 * them at all - not a field left unset, but the summary and the scorecard's
 * criteria line still saying that nothing is being proposed.
 *
 * TEETH: point any other shop's `arc` back at `EMPLOYER_ARC` (the revert) and
 * this goes red at the MSP, Bodgeworth and Halcyon from the WEATHER week on -
 * first because `mail/round-weather` is not in those inboxes, then because
 * Marcus and Yolanda have no name there, then because the matrix names five
 * strangers. `employers.ts` refuses that revert at boot as well, so both ends
 * of the seam are held.
 *
 * A future employer, a future season and a future cast are inside this without
 * anybody remembering to come back.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPLOYER_IDS,
  type EmployerId,
  employerFor,
  FIRST_EMPLOYER,
} from '../world/employers';
import { FIELDS } from '../world/fields';
import { findMailThread, visibleMail } from '../world/mail';
import {
  ARC_WEEKS,
  beatsFiredBy,
  type PressureSeason,
  PROBATION_WEEK,
  REDUNDANCY_ROUND,
} from '../world/pressure';
import { createWorldSession, type WorldSession } from '../world/session';
import { DayDriver } from './day-driver';

/** A headless desk: no windows open, nothing on screen, nobody watching. */
const HANDLERS = {
  onDayBoundary: (): void => {},
  openSlackApps: (): readonly string[] => [],
  focusedSlackApp: (): string | null => null,
};

interface Shop {
  readonly session: WorldSession;
  readonly driver: DayDriver;
}

/**
 * One shop, stood up at one week of its arc, through the shipped path.
 *
 * The registry's own employer and the session's own resolved week, so the
 * world under this is the world a player at that shop in that week would have
 * - including the arc, which is the whole subject. The shell hands the same
 * four things in (`main.ts`); a driver that fell back to the defaults would be
 * testing the probation shop four times.
 */
function shopAt(employer: EmployerId, arcWeek: number): Shop {
  const shop = employerFor(employer);
  const session = createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek,
    employer,
  });

  return {
    session,
    driver: new DayDriver(
      session.engine,
      shop.playerId,
      session.seed,
      HANDLERS,
      undefined,
      session.week,
      session.channels,
      session.runsBossPings,
      shop.arc,
    ),
  };
}

/** Whoever this is, as the screens ask for them: a person with a name. */
function namedPerson(shop: Shop, id: string): string | null {
  const node = shop.session.engine.graph.getNode(id);
  const name = node?.fields[FIELDS.name];

  return node?.kind === 'person' && typeof name === 'string' && name.length > 0
    ? name
    : null;
}

/**
 * Everybody a beat that has fired would put in front of the player, and where
 * each of them comes from.
 *
 * The two announcement beats name whoever SENT them, which is read off the
 * shipped thread rather than off the inbox on purpose: the question is who the
 * season would introduce, and a thread the scoping has already hidden is
 * exactly the case this has to catch rather than skip. The two later beats name
 * the pool, which is read off the standing the screens themselves print.
 */
function peopleNamedBy(
  shop: Shop,
  season: Readonly<PressureSeason>,
  week: number,
): readonly string[] {
  const people: string[] = [];

  for (const beat of beatsFiredBy(season, week)) {
    if (beat === 'weather' || beat === 'notice') {
      const thread = findMailThread(
        beat === 'weather' ? season.weatherThread : season.noticeThread,
      );

      people.push(...(thread?.messages ?? []).map((message) => message.from));
      continue;
    }

    people.push(
      ...(shop.driver.pressureReading().standing?.rows ?? [])
        .map((row) => row.person),
    );
  }

  return people;
}

/** The thread an announcement beat arrives as, if it arrives at all. */
function threadFor(
  season: Readonly<PressureSeason>,
  beat: string,
): string | null {
  if (beat === 'weather') {
    return season.weatherThread;
  }

  return beat === 'notice' ? season.noticeThread : null;
}

describe('a season belongs to one building', () => {
  /**
   * Every shop, every week of the arc, over the real driver.
   *
   * One pass rather than three, because each position is a world with a wasm
   * engine under it and the three questions are asked of the same worlds. The
   * weeks the round is live in are collected as they go and asserted at the
   * end, which is what makes this two-sided: a fix that scoped the season away
   * from everybody - a mute rather than an ownership - fails on the same line
   * a leak does.
   */
  it('runs the round at the shop that wrote it and nowhere else', () => {
    // The sentence a shop with no round on prints, taken from the one week
    // every shop in this build is quiet in rather than typed out here: it is
    // the season layer saying nothing is happening, and it has to be the same
    // sentence at a building with no season as at a building before one.
    const quiet = shopAt(FIRST_EMPLOYER, PROBATION_WEEK)
      .driver.pressureSummary();
    const live: string[] = [];

    for (const employer of EMPLOYER_IDS) {
      for (let week = 1; week <= ARC_WEEKS; week += 1) {
        const where = `${employer} week ${String(week)}`;
        const shop = shopAt(employer, week);
        const reading = shop.driver.pressureReading();
        const summary = shop.driver.pressureSummary();

        // The symptom, stated as itself: the evening scorecard printing a raw
        // node id because the name lookup had nothing in this graph to find.
        expect(summary, where).not.toMatch(/person:/);
        // And the scorecard is not a second answer - it prints this sentence.
        expect(shop.driver.weekScorecard().criteria, where).toBe(summary);

        if (reading.season === null) {
          // A shop with no season has no season SURFACE either: no beat, no
          // matrix, and the same words in the same place all twelve weeks.
          expect(reading.beat, where).toBeNull();
          expect(reading.standing, where).toBeNull();
          expect(summary, where).toBe(quiet);
          continue;
        }

        live.push(where);
        expect(summary, where).not.toBe(quiet);

        for (const beat of beatsFiredBy(reading.season, week)) {
          const thread = threadFor(reading.season, beat);

          // Whatever a beat announced itself with is in the inbox of the
          // building it fired in - which is where the mail scoping and this
          // one have to agree, and where they did not.
          if (thread !== null) {
            expect(
              visibleMail(shop.session.engine.graph, employer)
                .some((entry) => entry.id === thread),
              `${where}: ${beat} announced as ${thread}`,
            ).toBe(true);
          }
        }

        for (const person of peopleNamedBy(shop, reading.season, week)) {
          expect(namedPerson(shop, person), `${where}: ${person}`)
            .not.toBeNull();
        }
      }
    }

    // Exactly the weeks the probation shop's season has always covered, at
    // exactly the one shop that authored it. Both halves of the seam in one
    // line: a season that leaked is longer than this list, a season that was
    // muted is shorter.
    const expected: string[] = [];

    for (
      let week = REDUNDANCY_ROUND.weather;
      week <= REDUNDANCY_ROUND.decision;
      week += 1
    ) {
      expected.push(`${FIRST_EMPLOYER} week ${String(week)}`);
    }

    expect(live).toStrictEqual(expected);
  }, 300_000);

  /**
   * And the round at the shop that owns it, still saying what it always said.
   *
   * The sweep above proves nobody is named who should not be; this proves
   * somebody IS. Without it, deleting the season entirely would pass every
   * assertion in this file.
   */
  it('still names the person one place above you, at the shop that has one', () => {
    const shop = shopAt(FIRST_EMPLOYER, REDUNDANCY_ROUND.criteriaFrom);
    const reading = shop.driver.pressureReading();
    const summary = shop.driver.pressureSummary();

    expect(reading.beat).toBe('criteria');
    expect(reading.standing?.rows).toHaveLength(REDUNDANCY_ROUND.pool);
    expect(summary).toContain('Consultation is open');
    // Owen, on the late shift, is the number on the screen that matters - by
    // name, out of the probation shop's own graph.
    expect(summary).toContain('Owen');
    // And both announcements are where they were: in this building's inbox.
    const inbox = visibleMail(shop.session.engine.graph, FIRST_EMPLOYER)
      .map((entry) => entry.id);

    expect(inbox).toContain(REDUNDANCY_ROUND.weatherThread);
    expect(inbox).toContain(REDUNDANCY_ROUND.noticeThread);
  }, 30_000);
});
