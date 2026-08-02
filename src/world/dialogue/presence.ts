/**
 * What the office says about your dot.
 *
 * Two tables, both of them CONTENT rather than mechanism, and the difference
 * between them is who is talking and why:
 *
 * - THE ANSWER. One line per person who can be left waiting for a first word,
 *   said when they have watched a desk marked Away do demonstrable work on
 *   somebody else's ticket. The world has already taken the reputation off
 *   (`world.presence_noticed`, once per person per day); this is the half that
 *   tells the player WHY a number moved, in the voice of the person who moved
 *   it. Without it the sting is a fine with no sender.
 * - THE CHATTER. A handful of lines from people with nothing at stake,
 *   reacting to a status they happened to see. Sparse on purpose: the office
 *   noticing is a joke and a chorus is a mechanic, and this slice's voice is
 *   the first one.
 *
 * House rules, the same ones the trees keep: nobody is cruel, nobody calls the
 * player anything, and every line is recognisable as the specific person who
 * says it - the receptionist who can see your monitor from the door, the man
 * on nights whose own status has said Away since 1997, the new starter who
 * apologises for being kept waiting.
 *
 * Nothing here dispatches, reads a clock or knows what a window is.
 */

import { COMPANY_IDS } from '../company';
import { WORLD_TICKETS } from '../tickets';
import { type Presence, PRESENCE_VALUES } from '../presence';

/* -- the answer ------------------------------------------------------------ */

/**
 * What each person says the once, keyed by who they are.
 *
 * Keyed by PERSON rather than by ticket, because the thought is about the desk
 * rather than about the fault: somebody who has raised two things this week
 * has the same thought about the dot both times, and the rule the world
 * enforces is one per person per day for exactly that reason.
 */
export const AWAY_NOTICED_LINES: Readonly<Record<string, string>> = Object.freeze({
  [COMPANY_IDS.ada]: 'Your status says Away. Tickets are being closed. I am '
    + 'not saying the two things are connected, I am saying I have noticed '
    + 'them, and I would like that noticed as well.',
  [COMPANY_IDS.gary]: 'Your little icon says Away. I have been sat here since '
    + 'I raised it, and I have watched two other things get sorted out. I am '
    + 'not going to make a thing of it. I am mentioning it.',
  [COMPANY_IDS.nina]: 'You are marked Away. The queue is not. I have been here '
    + 'eleven years and Away has never once meant away.',
  [COMPANY_IDS.bev]: 'Away, is it? Love, I sit by the door. I can see the side '
    + 'of your monitor from here and I can see it changing.',
  [COMPANY_IDS.priya]: 'Your status is Away and there is a payment run at '
    + 'eleven. I do not need you all morning. I needed you for four minutes, '
    + 'about an hour ago.',
  [COMPANY_IDS.terry]: 'I did read the bit where it says you are Away. I also '
    + 'read the ticket list, which has moved twice since I read the first '
    + 'thing. I read everything, that is rather the problem.',
  [COMPANY_IDS.hilda]: 'Says Away. It said Away the last time as well, while '
    + 'the numbers on the board went down one at a time. We can see the board '
    + 'from the warehouse, you know.',
  [COMPANY_IDS.kwame]: 'Sorry - you are showing as Away so please ignore this. '
    + 'It is only that things do seem to be getting done, and mine is not one '
    + 'of them, and nobody has told me yet whether Away means away.',
  [COMPANY_IDS.rob]: 'You are set to Away. That is completely fine. It is my '
    + 'second week, so I do not know whether that means you are away or '
    + 'whether it means the other thing everybody keeps hinting at.',
  [COMPANY_IDS.owen]: 'Your dot has gone grey. Mine has said Away since the '
    + 'day they gave me the login and nobody has ever asked. I am only saying '
    + 'I know what it means, and I am still waiting.',
  [COMPANY_IDS.dennis]: 'You are Away, so this will keep, honestly. I only '
    + 'mention it because the list at the side keeps ticking over, and I did '
    + 'wonder whether Away was the setting or the situation.',
  [COMPANY_IDS.marcus]: 'Your status says Away. The backup light is still red. '
    + 'One of those two things has moved this morning and it is not the one on '
    + 'my desk.',
  [COMPANY_IDS.yolanda]: 'I see you are marked unavailable. I also see that '
    + 'six tickets have been updated since mine was raised. I will leave that '
    + 'with you rather than with anybody else, for now.',
  [COMPANY_IDS.boss]: 'Pat. Your status says Away. You are demonstrably not '
    + 'away. I do not mind which of those two you fix, but I would like it to '
    + 'be one of them.',
});

/**
 * What this person says about it, or nothing at all.
 *
 * Nothing rather than a general-purpose sentence: a fallback line would be a
 * quiet way for a person to be given somebody else's voice, and the gate below
 * makes the absence unreachable for anybody the shipped week can leave
 * waiting.
 */
export function awayNoticedLine(reporter: string): string | null {
  return AWAY_NOTICED_LINES[reporter] ?? null;
}

/**
 * Load-time content gate: everybody the week can leave waiting has a line.
 *
 * The roster is read off the TICKETS rather than listed here, because that is
 * the list the sting is actually drawn from - the driver picks the reporter
 * who has been waiting longest for a first word - so a ticket authored for a
 * new person drags a line along behind it or stops the boot.
 */
export function assertAwayLines(
  reporters: readonly string[],
): readonly string[] {
  for (const reporter of reporters) {
    if (awayNoticedLine(reporter) === null) {
      throw new Error(
        `"${reporter}" reports a ticket and has nothing to say about being `
        + 'left waiting by a desk marked Away. Somebody can take a point of '
        + 'reputation off this player without a word on any screen.',
      );
    }
  }

  return reporters;
}

export const AWAY_LINE_ROSTER: readonly string[] = Object.freeze(
  assertAwayLines([
    ...new Set(
      WORLD_TICKETS
        .map((ticket) => ticket.def.reporter)
        // Everybody except the player, who raises the desk's own faults - the
        // fan that has been grinding since Monday is Pat's ticket - and who
        // cannot be kept waiting by his own dot. The driver skips him for the
        // same reason, and this gate would otherwise demand a line in which
        // the player is annoyed with himself.
        .filter((reporter) => reporter !== COMPANY_IDS.player),
    ),
  ]),
);

/* -- the chatter ----------------------------------------------------------- */

export interface PresenceRemark {
  /** The dot that prompts it. */
  readonly presence: Presence;
  /** Whose thread it lands in. */
  readonly speaker: string;
  readonly line: string;
}

/**
 * The office, noticing. Four lines for a whole week, deliberately.
 *
 * Each one lands ONCE - the shell only says a line that is not already in that
 * person's transcript - so the whole table is spent by a player who tries all
 * three dots, and nobody says anything twice. That is the sparseness rule made
 * structural rather than left to a die: there is no roll here, and a status
 * changed forty times is a status forty people have already commented on
 * exactly as many times as there are lines, which is four.
 */
export const PRESENCE_CHATTER: readonly PresenceRemark[] = Object.freeze([
  {
    presence: 'dnd',
    speaker: COMPANY_IDS.bev,
    line: 'You have gone red. I shall tell the next one who rings that you '
      + 'are in a meeting, which is what I tell them anyway.',
  },
  {
    presence: 'dnd',
    speaker: COMPANY_IDS.terry,
    line: 'Noted the red dot. I will not ring. I will send several messages '
      + 'instead, which I understand is a different thing.',
  },
  {
    presence: 'away',
    speaker: COMPANY_IDS.owen,
    line: 'You have gone Away. Nights here: mine has said that for four '
      + 'years. Nobody has ever come looking, which is either the best or the '
      + 'worst thing about this place.',
  },
  {
    presence: 'available',
    speaker: COMPANY_IDS.priya,
    line: 'You are green again. I have been refreshing that ticket page like '
      + 'somebody waiting on a hospital, so - thank you.',
  },
]);

/** Everything anybody might say about this dot, in the order it is said. */
export function presenceChatter(presence: Presence): readonly PresenceRemark[] {
  return PRESENCE_CHATTER.filter((remark) => remark.presence === presence);
}

/**
 * Load-time gate for the chatter: every dot has somebody who noticed it.
 *
 * A status with no line at all would be a control that visibly does nothing on
 * one of its three settings, which reads as the setting being broken rather
 * than as the office being quiet.
 */
export function assertPresenceChatter(
  remarks: readonly PresenceRemark[],
): readonly PresenceRemark[] {
  for (const presence of PRESENCE_VALUES) {
    if (!remarks.some((remark) => remark.presence === presence)) {
      throw new Error(
        `Nobody in this building has anything to say about "${presence}".`,
      );
    }
  }

  const said = new Set<string>();

  for (const remark of remarks) {
    if (said.has(remark.line)) {
      throw new Error('Two people say the same thing about the dot, and the '
        + 'shell says a line once - so one of them would never be heard.');
    }

    said.add(remark.line);
  }

  return remarks;
}

assertPresenceChatter(PRESENCE_CHATTER);
