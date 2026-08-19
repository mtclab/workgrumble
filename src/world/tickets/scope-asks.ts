/**
 * The out-of-scope asks (E9, 0.38.0): four tickets in which nothing is broken.
 *
 * Every other ticket in this game is a fault. These are a REQUEST - somebody at
 * a customer asking the desk for a piece of work their agreement does not
 * include - and the whole of the play is which of the three sourced answers the
 * player gives it (`world/out-of-scope.ts`, and
 * `docs/research/titles-customer-types.md` 3.5 for the script itself).
 *
 * TWO ARRIVALS AND TWO SEQUELS, and the pairing is the design:
 *
 *  - FONTAINE-LAW is a HELPDESK contract at a law firm - users and the machines
 *    they sit at, and nothing else - and the ask is the second floor they have
 *    just taken: wireless, the cabling contractor, the lot. They will not pay
 *    for it, which is the fact the estimate finds out. It is the ask that makes
 *    quoting a real risk rather than a slower yes.
 *  - PENNINGTON-ACCT is CO-MANAGED at an accountancy three sizes up, with one
 *    IT man of their own, and the ask is a data migration onto the new practice
 *    platform. They have budget, a deadline and a man who would rather it were
 *    somebody else's weekend, so this one approves - and then it is a job, on
 *    somebody's invoice, with the minutes attributed.
 *
 * The two sequels arrive only for the player who obliged, ninety minutes later,
 * with the precedent quoted back at them in the reporter's own words. Neither
 * sequel has a sequel: the customer is trained once and the lesson is over.
 *
 * WHY THE ADVERTISED PATHS ARE TWO RATHER THAN THREE. A path is a way the
 * PLAYER closes a ticket, driven end to end by the solvability gate, and only
 * two of the three answers are that: refusing closes it, doing the work closes
 * it, and quoting deliberately does not - it parks the ticket on the customer
 * and the thing that closes it afterwards is their answer, which is the
 * world's move and not a step anybody can take. So the quote route is
 * advertised in the conversation and in the ticket body, and it is held down
 * end to end by the driver gates in `src/shell/out-of-scope.test.ts` rather
 * than by a path that would have to lie about who pressed what.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { FIELDS } from '../fields';
import { MSP_IDS } from '../msp-company';
import { SCOPE_OUTCOMES } from '../out-of-scope';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { Expr } from '../../engine-api';
import type { TicketPath, WorldTicket } from './types';

/**
 * What closes one of these: any of the four TERMINAL outcomes, on the ticket
 * itself.
 *
 * Written once and shared, because "the ticket is closed when the ask has been
 * answered" is one rule and four copies of it in four files is four chances to
 * write `obliged` as `obliged_` and ship a ticket nobody can shut. The two
 * outcomes that are NOT in this list are the quote and the approval, which is
 * the whole of what makes the middle answer a wait.
 */
function answered(ticketId: string): Expr {
  return {
    op: 'or',
    exprs: [
      SCOPE_OUTCOMES.refused,
      SCOPE_OUTCOMES.declined,
      SCOPE_OUTCOMES.obliged,
      SCOPE_OUTCOMES.delivered,
    ].map((outcome) => ({
      op: 'eq' as const,
      selector: { id: ticketId },
      field: FIELDS.scopeOutcome,
      value: outcome,
    })),
  };
}

/** The two ways the player closes one of these on their own. */
function answerPaths(
  ticketId: string,
  copy: Readonly<{ refuse: string; oblige: string }>,
): readonly TicketPath[] {
  return [
    {
      id: 'refuse-and-offer-a-quote',
      app: 'chat',
      label: copy.refuse,
      steps: [{ action: HELPDESK_ACTIONS.scopeRefuse, target: ticketId }],
    },
    {
      id: 'just-do-it',
      app: 'chat',
      label: copy.oblige,
      steps: [{ action: HELPDESK_ACTIONS.scopeDoWork, target: ticketId }],
    },
  ];
}

/* -- FONTAINE-LAW: the floor they have just taken ------------------------- */

const FONTAINE_WIFI = 'ticket:fontaine-new-office-wifi';

const NEW_OFFICE_WIFI: WorldTicket = {
  arrival: 'drip',
  // The machine she is sitting at, which is what the contract actually covers
  // and the only estate of theirs this request touches at all. Nothing on it is
  // broken; it is here because a ticket has to be about somebody's estate for
  // the clock, the tier and the timesheet to know whose morning this is.
  nodes: [MSP_IDS.fontaineWorkstation],
  // She says it is urgent because the lease starts on the first. It is a
  // project with a date on it, which is not the same thing as a fault, and the
  // gap between those two numbers is the triage this ticket is really about.
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: FONTAINE_WIFI,
    archetype: 'read_the_screen',
    scope_ask: true,
    flavor: {
      title: 'Fontaine: "can you also sort the wifi in the new office"',
      body:
        'Nadia has the second floor from the first of next month - eleven '
        + 'desks, a meeting room and a print alcove - and would like the '
        + 'wireless "sorted" before anybody moves in: survey, access points, '
        + 'switch, and somebody to talk to the cabling contractor. Fontaine is '
        + 'on a helpdesk agreement. That agreement is users and the machines '
        + 'they sit at; a floor build is a project, and projects are quoted. '
        + 'Nothing here is broken and nothing here is refused - the answer is a '
        + 'conversation, and there are three of them: point at the agreement '
        + 'and offer to price it, price it and wait for an answer, or simply '
        + 'do it.',
    },
    reporter: MSP_IDS.fontaineContact,
    setup: [],
    resolved_when: answered(FONTAINE_WIFI),
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/out-of-scope-quote',
  },
  cause: 'Nothing has failed. A helpdesk agreement covers the people and the '
    + 'desks, and a floor build is additional work that has to be scoped, '
    + 'priced and approved before anybody starts - which is what the agreement '
    + 'says and what the estimate is for. The comedy is that the alternative '
    + 'to saying so is doing eleven desks for nothing and being asked for the '
    + 'cabling next.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: answerPaths(FONTAINE_WIFI, {
    refuse: 'Tell Nadia it is outside the agreement, and offer to price it',
    oblige: 'Just sort the wireless for them',
  }),
};

const FONTAINE_CABLING = 'ticket:fontaine-new-office-cabling';

/**
 * The bill for obliging, ninety minutes later and in her own words.
 *
 * Summoned rather than dealt: it arrives because of something the player did,
 * off `scopeRecurrencesDue`, and a week that dealt it a slot would be a week
 * putting the consequence in front of the decision. Bigger than the ask it
 * follows, because that is what the sources say scope creep does - "the tiny
 * request ... that can balloon into many requests for which you aren't
 * compensated" - and it names the precedent out loud, because the whole lesson
 * is that the precedent is what she is holding.
 */
const NEW_OFFICE_CABLING: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.fontaineWorkstation],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: FONTAINE_CABLING,
    archetype: 'read_the_screen',
    scope_ask: true,
    flavor: {
      title: 'Fontaine: "while you are doing the floor - the desks and the '
        + 'cabling too"',
      body:
        'Nadia is back. Since the wireless went so smoothly, the partners have '
        + 'asked whether the desk moves can go the same way: eleven machines '
        + 'lifted, the floor boxes run, the meeting-room screen mounted and '
        + 'the old suite stripped out on the Saturday. She is very pleasant '
        + 'about it and she is quite clear about why she is asking - you did '
        + 'the last one. The agreement has not changed. The same three answers '
        + 'are open, and the price of the last one has just gone up.',
    },
    reporter: MSP_IDS.fontaineContact,
    setup: [],
    resolved_when: answered(FONTAINE_CABLING),
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/out-of-scope-quote',
  },
  cause: 'A precedent is a contract nobody signed. The floor build was done '
    + 'once for nothing, so the desk moves are now the sort of thing the desk '
    + 'does - and the ask is larger, because the last one was free and the '
    + 'firm has no reason left to think this one is different.',
  dialogue_ref: 'dialogue/msp-nadia',
  paths: answerPaths(FONTAINE_CABLING, {
    refuse: 'Point at the agreement again, and offer to price the move',
    oblige: 'Do the desk moves as well',
  }),
};

/* -- PENNINGTON-ACCT: the migration they will actually pay for ------------ */

const PENNINGTON_MIGRATION = 'ticket:pennington-practice-migration';

const PRACTICE_MIGRATION: WorldTicket = {
  arrival: 'drip',
  // Their server, because that is where the data being moved lives. Nothing on
  // it is broken either - this is the box the WORK would be done on, which is
  // the honest answer to "whose estate is this ticket about".
  nodes: [MSP_IDS.penningtonServer],
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: PENNINGTON_MIGRATION,
    archetype: 'read_the_screen',
    scope_ask: true,
    flavor: {
      title: 'Pennington: move the practice data onto the new platform',
      body:
        'Esme asks whether the desk can move Ledgerline\'s data onto the '
        + 'hosted platform they have signed for - forty users, eleven years of '
        + 'client files, a weekend of downtime and a rehearsal first. Gil has '
        + 'a note from the vendor and no intention of spending his Saturday on '
        + 'it. Pennington is co-managed: the desks and the endpoints are the '
        + 'MSP\'s, the practice system is theirs, and a migration is in '
        + 'neither column because it is a project. The same three answers: '
        + 'point at the agreement and offer to price it, price it and wait, or '
        + 'get started.',
    },
    reporter: MSP_IDS.penningtonContact,
    setup: [],
    resolved_when: answered(PENNINGTON_MIGRATION),
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/out-of-scope-quote',
  },
  cause: 'Nothing has failed. A co-managed agreement divides the estate '
    + 'between two teams and says nothing at all about work that is neither '
    + 'side\'s day job - a migration is a piece of project work with a '
    + 'weekend, a rehearsal and a rollback in it, and the way it becomes '
    + 'somebody\'s is that it is scoped, priced and signed for.',
  dialogue_ref: 'dialogue/msp-esme',
  paths: answerPaths(PENNINGTON_MIGRATION, {
    refuse: 'Tell Esme it is project work, and offer to scope and price it',
    oblige: 'Start the migration',
  }),
};

const PENNINGTON_SECOND = 'ticket:pennington-second-migration';

const SECOND_MIGRATION: WorldTicket = {
  arrival: 'summoned',
  nodes: [MSP_IDS.penningtonServer],
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: PENNINGTON_SECOND,
    archetype: 'read_the_screen',
    scope_ask: true,
    flavor: {
      title: 'Pennington: "the branch office and the archive years, same as '
        + 'before"',
      body:
        'Esme has spoken to the partners. The branch office is on the same '
        + 'platform by the end of the month, and while it is happening they '
        + 'would like the archive years - 2011 to 2019, currently on a tape '
        + 'nobody has read since - brought across as well. She is not asking '
        + 'whether it is included; she is asking when you can start, because '
        + 'the first one went in without an invoice. Three answers, and one of '
        + 'them is how it got to this.',
    },
    reporter: MSP_IDS.penningtonContact,
    setup: [],
    resolved_when: answered(PENNINGTON_SECOND),
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/out-of-scope-quote',
  },
  cause: 'The first migration was done off the books, so the second one is '
    + 'not a question. A customer prices what they are asked to pay for and '
    + 'assumes the rest is included - and the honest reading of a firm asking '
    + 'for more is not that they are chancers, but that nobody has ever put a '
    + 'number in front of them.',
  dialogue_ref: 'dialogue/msp-esme',
  paths: answerPaths(PENNINGTON_SECOND, {
    refuse: 'Tell her the branch office is quoted, and offer the estimate',
    oblige: 'Take the branch office and the archive years on as well',
  }),
};

/**
 * The four, in the order they can happen in: each ask, then the sequel it earns
 * for the player who obliged it.
 */
export const SCOPE_ASK_TICKETS: readonly WorldTicket[] = [
  NEW_OFFICE_WIFI,
  NEW_OFFICE_CABLING,
  PRACTICE_MIGRATION,
  SECOND_MIGRATION,
];
