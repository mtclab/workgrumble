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
 * And one rule that is about the MECHANIC rather than the voice: no line may
 * claim more than the trigger can promise. What buys somebody their thought is
 * one successful piece of work-class dispatch - which can be a screen rotated
 * to the wrong angle and nothing closed at all - so a line saying "you have
 * closed three tickets" would be the office describing an afternoon that did
 * not necessarily happen. They say what is always true: that desk is
 * demonstrably doing something, and it is not this.
 *
 * Nothing here dispatches, reads a clock or knows what a window is.
 */

import { COMPANY_IDS } from '../company';
import { HALCYON_IDS } from '../corporate-company';
import { MSP_IDS } from '../msp-company';
import { BODGE_IDS } from '../second-company';
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
  [COMPANY_IDS.ada]: 'Your status says Away and something is quite clearly '
    + 'being done over there. I am not saying the two things are connected. I '
    + 'am saying I have noticed them, and I would like that noticed as well.',
  [COMPANY_IDS.gary]: 'Your little icon says Away. I have been sat here since '
    + 'I raised it, watching somebody at that desk get on with something else. '
    + 'I am not going to make a thing of it. I am mentioning it.',
  [COMPANY_IDS.nina]: 'You are marked Away. You are also plainly doing '
    + 'something. I have been here eleven years and Away has never once meant '
    + 'away.',
  [COMPANY_IDS.bev]: 'Away, is it? Love, I sit by the door. I can see the side '
    + 'of your monitor from here and I can see it changing.',
  [COMPANY_IDS.priya]: 'Your status is Away and there is a payment run at '
    + 'eleven. I do not need you all morning. I needed you for four minutes, '
    + 'about an hour ago, and you are evidently at the desk.',
  [COMPANY_IDS.terry]: 'I did read the bit where it says you are Away. I also '
    + 'read the activity down the side of the ticket, which says otherwise. I '
    + 'read everything, that is rather the problem.',
  [COMPANY_IDS.kwame]: 'Sorry - you are showing as Away so please ignore this. '
    + 'It is only that something does seem to be getting done, and mine is not '
    + 'it, and nobody has told me yet whether Away means away.',
  [COMPANY_IDS.hilda]: 'Says Away. It said Away the last time as well, while '
    + 'somebody was very obviously getting on with something in there. We can '
    + 'see the board from the warehouse, you know.',
  [COMPANY_IDS.rob]: 'You are set to Away. That is completely fine. It is my '
    + 'second week, so I do not know whether that means you are away or '
    + 'whether it means the other thing everybody keeps hinting at.',
  [COMPANY_IDS.owen]: 'Your dot has gone grey and the desk is clearly not. '
    + 'Mine has said Away since the day they gave me the login and nobody has '
    + 'ever asked. I am only saying I know what it means, and I am waiting.',
  [COMPANY_IDS.dennis]: 'You are Away, so this will keep, honestly. I only '
    + 'mention it because something is evidently happening over there, and I '
    + 'did wonder whether Away was the setting or the situation.',
  [COMPANY_IDS.marcus]: 'Your status says Away. The backup light is still red. '
    + 'One of those two things is being worked on this morning and it is not '
    + 'the one on my desk.',
  [COMPANY_IDS.yolanda]: 'I see you are marked unavailable. I also see that '
    + 'the desk marked unavailable is busy with something that is not my '
    + 'report. I will leave that with you rather than with anybody else.',
  [COMPANY_IDS.boss]: 'Pat. Your status says Away. You are demonstrably not '
    + 'away. I do not mind which of those two you fix, but I would like it to '
    + 'be one of them.',
  // Bodgeworth & Batch (0.6.0 slice 3). The same thought in the wild-west
  // register: nobody here has ever used a status dot for anything, so being
  // caught working while marked Away reads less as a lie and more as a mystery.
  [BODGE_IDS.sharon]: 'Your little dot has gone grey. I did not know we had '
    + 'dots. It says away, and yet something is very much being done over '
    + 'there, so I am going to assume the dot is new and you are not.',
  [BODGE_IDS.kev]: 'You are marked away. I set those dots up, I think, years '
    + 'ago, and nobody has touched one since - so you being away while the desk '
    + 'is clearly not is either a first for this firm or the dot is wrong.',
  [BODGE_IDS.baz]: 'Says you are away. You are sat right there doing a thing. '
    + 'Out in the yard we just shout, which has its problems but not this one.',
  [BODGE_IDS.trev]: 'Away, apparently. In my day away meant you had gone to '
    + 'the wholesaler. Now it means you are at the desk doing everything except '
    + 'the thing I asked. I preferred the wholesaler.',
  [BODGE_IDS.vernon]: 'Your status says away. I pay for that desk and the desk '
    + 'is working, so one of us is confused about what away means and I do not '
    + 'think it is me.',
  // The MSP customers (0.8.0). They are contacts at other companies, so the
  // thought is a paying customer's: the desk they are paying to watch is busy,
  // and it is busy with somebody else's tenant.
  [MSP_IDS.fontaineContact]: 'Your portal says you are away. I have a filing at '
    + 'ten and a desk that is clearly not away, so I will assume the status is '
    + 'for somebody else\'s emergency and mine is next.',
  [MSP_IDS.meridianContact]: 'You are showing as away. I do this for a living '
    + 'too, so I know away on a service desk means "in another customer" - I '
    + 'just would rather the other customer were us this minute.',
  [MSP_IDS.northwindContact]: 'Says away. We only pay you to watch, so I do not '
    + 'want to be a bother - it is only that the thing you were watching has '
    + 'gone red and the watching desk has gone quiet.',
  // The two remaining tiers (0.11.0): a fully-managed practice for whom the MSP
  // IS the IT department, and a co-managed IT manager who knows exactly what a
  // service desk being away means.
  [MSP_IDS.hollowayContact]: 'You are showing away. You are our entire IT '
    + 'department, so away is not a status I have anywhere else to route around - '
    + 'when your desk is quiet, ours simply is not covered.',
  [MSP_IDS.ardenContact]: 'Marked away. I run a desk too, so I get it - but we '
    + 'are co-managed, and the whole point is that one of us is always reachable. '
    + 'Right now neither of us is picking this up, which is the gap we pay to close.',
  [MSP_IDS.tillmanContact]: 'You are showing away. We only signed this week and '
    + 'you are the whole of our IT now - if away means nobody is looking, that is '
    + 'exactly the arrangement we thought we were getting away from.',
  [MSP_IDS.marloweContact]: 'Your status says away, which is a lovely thing to '
    + 'be looking at while three people sit at desks they cannot work at. We '
    + 'deliver today. I am not asking you to be quick, I am asking you to be '
    + 'here.',
  [MSP_IDS.elmwoodContact]: 'You are marked away, and I have a patient in the '
    + 'chair. I can see you working on something - just not on us - and "away" is '
    + 'not a word I can say to a surgery that is running behind because of it.',
  [MSP_IDS.mspLead]: 'You are showing away, and the portal is still down - '
    + 'customers cannot log in. You are on the tier now; "away" while our own box '
    + 'is on the floor is not a look I can carry upstairs for you.',
  [HALCYON_IDS.ea]: 'Your status is set to away, and Roland is asking me why his '
    + 'thing is not done. I cannot tell the CEO his IT has gone quiet - so I will '
    + 'just say it is being looked at, and you can imagine how that goes for both '
    + 'of us.',
  // The recert reporters (E8, 0.23.0): the CFO who owns the review and the office
  // manager whose backup broke.
  [HALCYON_IDS.cfo]: 'You are showing away, and I have compliance waiting on that '
    + 'access review with a deadline I did not set. Away on the one afternoon I '
    + 'need it signed off is not a status I can put in front of an auditor.',
  [HALCYON_IDS.bronwen]: 'Your dot says away, and the backup is still down. I do '
    + 'the door and the diary, not the servers - so if the desk that does the '
    + 'servers is away while a production job is broken, I have run out of people '
    + 'to ask.',
  // The manager override reporter (E8, 0.24.0): the Head of IT with the cutover
  // deadline, who reads the Away dot as the desk dodging his order.
  [HALCYON_IDS.manager]: 'You are marked away, and I have a contractor sitting on '
    + 'his hands and a board deadline on Monday. I am the one who asked you for '
    + 'this - I would rather you told me no to my face than went quiet on it. Away '
    + 'is the one answer I cannot take upstairs.',
  // The legendary-manager reporters (E8, 0.25.0): the seagull who wants his win by
  // Friday, and the successor left holding the audit finding.
  [HALCYON_IDS.seagull]: 'Your status is away, and I need the standardisation done '
    + 'today for the Friday deck. I do not much mind how - I mind that "away" is '
    + 'not a slide I can present as an operational-excellence win.',
  // The VIP himself (E8, 0.26.0). He does not threaten and he does not raise his
  // voice; he simply mentions, pleasantly, that he has already found the person
  // above you - which is what the flag is for and why the dot costs more here.
  [HALCYON_IDS.ceo]: 'Your little dot says away. I did wonder. I have mentioned '
    + 'it to Ivor - not a complaint, you understand, I just did not want to be '
    + 'left standing about. He says he will look into it.',
  [HALCYON_IDS.successor]: 'You are showing away, and I have a security finding '
    + 'with my name on it now and the person who caused it three job titles away. '
    + 'Away, while the thing I inherited is still on fire, is not a status I have '
    + 'anyone left to escalate to.',
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
