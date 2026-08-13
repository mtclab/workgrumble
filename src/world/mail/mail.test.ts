import { describe, expect, it } from 'vitest';

import { formatSimTime } from '../../shell/clock-format';
import { COMPANY_IDS } from '../company';
import { shiftStartTick } from '../day';
import { EMPLOYER_IDS, type EmployerId, FIRST_EMPLOYER } from '../employers';
import { FIELDS } from '../fields';
import { PROBATION_WEEK, REDUNDANCY_ROUND } from '../pressure';
import { createWorldSession } from '../session';
import { spawnWorldTicket } from '../tickets';
import {
  arrivedAt,
  findMailThread,
  latestTick,
  mailFor,
  mailKey,
  messageTick,
  validateMailThreads,
  visibleMail,
  WORLD_MAIL,
} from './index';
import type { MailThread } from './types';

function thread(overrides: Partial<MailThread> = {}): MailThread {
  return {
    id: 'mail/fixture',
    subject: 'Fixture',
    employer: FIRST_EMPLOYER,
    messages: [
      {
        id: 'mail/fixture#1',
        from: COMPANY_IDS.boss,
        tick: 0,
        body: ['A message.'],
      },
    ],
    ...overrides,
  };
}

describe('mail content gate', () => {
  it('accepts the shipped inbox', () => {
    expect(validateMailThreads(WORLD_MAIL)).toHaveLength(WORLD_MAIL.length);
  });

  it('refuses duplicates and empty threads', () => {
    expect(() => validateMailThreads([thread(), thread()]))
      .toThrow('Duplicate mail thread');
    expect(() => validateMailThreads([thread({ messages: [] })]))
      .toThrow('no messages');
    expect(() => validateMailThreads([thread({ subject: '  ' })]))
      .toThrow('no subject');
  });

  /**
   * A thread addressed to a building this game does not have is a thread
   * nobody is ever sent - the quiet half of the leak this field closed, and
   * the one a typo would cause.
   */
  it('refuses a thread addressed to an employer nobody ships', () => {
    expect(() => validateMailThreads([
      thread({ employer: 'workgrumbel' as EmployerId }),
    ])).toThrow('not an employer this build ships');
  });

  it('refuses a stamp the shift clock cannot render', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: -1,
            body: ['A message.'],
          },
        ],
      }),
    ])).toThrow('outside the shift clock');
  });

  it('refuses a thread that runs backwards', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: 30,
            body: ['Later.'],
          },
          {
            id: 'mail/fixture#2',
            from: COMPANY_IDS.boss,
            tick: 5,
            body: ['Earlier.'],
          },
        ],
      }),
    ])).toThrow('runs backwards');
  });

  it('refuses a message with nothing in it', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: 0,
            body: ['  '],
          },
        ],
      }),
    ])).toThrow('empty paragraph');
  });
});

describe('shipped inbox', () => {
  it('ships the onboarding thread and the boss nag', () => {
    expect(findMailThread('mail/onboarding')).toBeDefined();
    expect(findMailThread('mail/queue-nag')?.messages[0]?.from)
      .toBe(COMPANY_IDS.boss);
    expect(mailKey('mail/queue-nag')).toBe('queue-nag');
  });

  /**
   * The first-run gate: the panic key is taught before it is needed.
   *
   * Everything else in this game can be learned by being caught. Not this one
   * - the boss key IS the skill the corridor tests, and a player who has not
   * been told about it is not being tested, they are being ambushed. It was
   * only ever mentioned inside the slack apps themselves, which is to say only
   * to players who had already opened one and had already started building
   * suspicion. This says it in the inbox, before the shift starts, in the
   * voice of the person who would say it.
   */
  it('teaches the boss key in the Monday inbox before the shift starts', () => {
    const onboarding = findMailThread('mail/onboarding');
    const taught = onboarding?.messages.filter(
      (message) => message.body.some(
        (line) => /left of the 1/i.test(line),
      ),
    ) ?? [];

    expect(taught).toHaveLength(1);
    // Before 09:00, so it cannot arrive after the first patrol of the week.
    expect(taught[0]?.tick).toBeLessThan(shiftStartTick(1));
  });

  it('stamps every message at a time the shift clock can show', () => {
    const { engine } = createWorldSession();

    for (const entry of WORLD_MAIL) {
      for (const message of entry.messages) {
        expect(formatSimTime(message.tick).time).toMatch(/^\d{2}:\d{2}$/);
      }
    }

    expect(latestTick({
      id: 'mail/x',
      subject: 'x',
      messages: [
        { id: 'a', from: COMPANY_IDS.boss, tick: 3, body: ['a'] },
        { id: 'b', from: COMPANY_IDS.boss, tick: 40, body: ['b'] },
      ],
    }, engine.graph)).toBe(40);
  });

  /**
   * A consequence cannot be stamped by a content file, because nobody knows
   * when the player will earn it. Until the field says otherwise the thread
   * does not exist - an inbox that shows a bounce-back before anything has
   * bounced is telling the player their future.
   */
  it('hides a gated thread until the world says it arrived, then stamps it', () => {
    const { engine } = createWorldSession();
    // The gate is a field on a ticket, so the ticket has to be in the world:
    // the fan arrives mid-morning on Monday rather than with the pile.
    spawnWorldTicket(engine, 'ticket:fan-noise');
    const gated: MailThread = {
      id: 'mail/gated',
      subject: 'Sent back',
      employer: FIRST_EMPLOYER,
      arrival: { node: 'ticket:fan-noise', field: 'handoff_settled_at' },
      messages: [
        { id: 'mail/gated#1', from: COMPANY_IDS.boss, tick: 0, body: ['No.'] },
      ],
    };

    expect(arrivedAt(gated, engine.graph)).toBeNull();
    expect(
      visibleMail(engine.graph, FIRST_EMPLOYER)
        .some((entry) => entry.arrival !== undefined),
    ).toBe(false);

    // A thin handoff, followed by second line getting round to it.
    engine.dispatch('ticket.escalate', COMPANY_IDS.player, 'ticket:fan-noise', {
      reported: '',
      tried: '',
    });
    engine.advance(30);
    engine.dispatch(
      'ticket.bounce_handoff',
      COMPANY_IDS.player,
      'ticket:fan-noise',
      {},
    );

    const landed = arrivedAt(gated, engine.graph);
    expect(landed).toBe(30);
    expect(messageTick(gated, 0, engine.graph)).toBe(30);
    expect(latestTick(gated, engine.graph)).toBe(30);
    expect(
      visibleMail(engine.graph, FIRST_EMPLOYER)
        .some((entry) => entry.id === 'mail/x'),
    ).toBe(false);
  });
});

/**
 * THE STANDING GATE: nobody in an inbox is a stranger to the building.
 *
 * The instance was Desmond. An ungated thread had no employer on it, so it was
 * visible in EVERY world, and an engineer starting at the MSP opened the Mail
 * app on the probation shop's onboarding and its lead's queue nag - then the
 * morning brief printed the sender as `person:desmond`, because the name lookup
 * had nothing in that graph to find and the raw node id is what a truthful
 * fallback prints.
 *
 * The class is wider than that thread and wider than mail: content authored for
 * one shop's cast, shown in a world that cast is not in. So the assertion is
 * made over EVERY employer this build ships, at every position in the arc where
 * a beat fires, against EVERY thread that world can show - and it asks the one
 * question the shell asks: does this sender have a NAME here. A future thread,
 * a future employer and a future season are all inside it without anybody
 * remembering to come back.
 *
 * TEETH: drop the employer filter in `visibleMail` and this goes red at the MSP
 * naming `mail/onboarding` and `person:bev`, which is exactly what the visual
 * sweep found on the shipped artifact.
 */
describe('every inbox is one building\'s post', () => {
  /**
   * The arc positions worth standing a world up at: the Monday of a career, and
   * the four weeks a season has a beat in. The season's own numbers rather than
   * a hand-typed list, so a round that moves drags this with it.
   */
  const ARC_WEEKS: readonly number[] = [
    PROBATION_WEEK,
    REDUNDANCY_ROUND.weather,
    REDUNDANCY_ROUND.notice,
    REDUNDANCY_ROUND.criteriaFrom,
    REDUNDANCY_ROUND.decision,
  ];

  function worldAt(employer: EmployerId, arcWeek: number): ReturnType<
    typeof createWorldSession
  > {
    return createWorldSession({
      farmFund: 0,
      attempt: 1,
      arcWeek,
      employer,
    });
  }

  /** Whoever this is, as the screens ask for them: a person with a name. */
  function namedPerson(
    world: ReturnType<typeof createWorldSession>,
    id: string,
  ): string | null {
    const node = world.engine.graph.getNode(id);
    const name = node?.fields[FIELDS.name];

    return node?.kind === 'person' && typeof name === 'string'
      && name.length > 0
      ? name
      : null;
  }

  it('shows nobody a message from somebody it has no name for', () => {
    for (const employer of EMPLOYER_IDS) {
      for (const arcWeek of ARC_WEEKS) {
        const world = worldAt(employer, arcWeek);

        for (const entry of visibleMail(world.engine.graph, employer)) {
          for (const message of entry.messages) {
            expect(
              namedPerson(world, message.from),
              `${employer} week ${String(arcWeek)}: ${message.id}`,
            ).not.toBeNull();
          }
        }
      }
    }
  });

  /**
   * And the same question asked of the threads a fresh world cannot show yet,
   * which is where the gated ones live: whoever wrote it is on the floor of the
   * shop it is addressed to. A thread whose gate never opens in this build is
   * still checked, because it will open in the next one.
   */
  it('is written, thread by thread, by people who work there', () => {
    for (const employer of EMPLOYER_IDS) {
      const world = worldAt(employer, PROBATION_WEEK);

      for (const entry of mailFor(employer)) {
        for (const message of entry.messages) {
          expect(namedPerson(world, message.from), message.id).not.toBeNull();
        }
      }
    }

    // Every thread is somebody's: no thread falls out of the game because its
    // employer is spelled in a way no world asks for.
    expect(EMPLOYER_IDS.flatMap((employer) => [...mailFor(employer)]))
      .toHaveLength(WORLD_MAIL.length);
  });

  /**
   * The leak, stated as itself, so the fix cannot be undone quietly.
   *
   * The probation shop's inbox is unchanged to the byte - it owns all but one
   * of the shipped threads and every one of them is still in it - and the other
   * three shops are shown none of it.
   */
  it('keeps the probation shop\'s post out of every other shop', () => {
    const probation = worldAt(FIRST_EMPLOYER, PROBATION_WEEK);
    const home = visibleMail(probation.engine.graph, FIRST_EMPLOYER)
      .map(({ id }) => id);

    expect(home).toStrictEqual([
      'mail/onboarding',
      'mail/queue-nag',
      'mail/maintenance-window',
      'mail/hygiene-sync',
    ]);

    for (const employer of EMPLOYER_IDS.filter((id) => id !== FIRST_EMPLOYER)) {
      const elsewhere = visibleMail(
        worldAt(employer, PROBATION_WEEK).engine.graph,
        employer,
      ).map(({ id }) => id);

      for (const id of home) {
        expect(elsewhere, employer).not.toContain(id);
      }
    }
  });
});
