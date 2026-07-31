/**
 * Three tickets about permissions, two of which are the same ticket twice.
 *
 * The chain is the lesson. Somebody asks for access to a shared mailbox, you
 * give them access to the shared mailbox, and an hour later they are back
 * because sending FROM it is a different permission with a different name in a
 * different place. Nobody has done anything wrong. The request was granted
 * exactly as it was written, which is the whole reason it comes back.
 *
 * The third is the licence seat, which is the same shape one floor up: the new
 * starter's first morning is being spent on a man who left in April.
 */

import { HELPDESK_ACTIONS, SEATS_PARAM } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

export const MAILBOX_ACCESS: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.kwameAccount, COMPANY_IDS.salesMailbox],
  // Sales cover the mailbox between them and he is on it from tomorrow. Real,
  // and not on fire.
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:mailbox-access',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Please add me to the Sales mailbox',
      body:
        'Kwame is on the Sales mailbox rota from tomorrow and cannot see it. '
        + 'Ada has forwarded the request with the words "as discussed", which '
        + 'refers to a discussion nobody has minuted and which Kwame was not '
        + 'in. He is being extremely polite about all of it.',
    },
    reporter: COMPANY_IDS.kwame,
    // The fault, written down where every other missing-permission ticket in
    // this world writes it: the access is not there when the ticket arrives,
    // whatever anybody did with it beforehand. An empty setup made the fault
    // "the absence of something nobody recorded", so a player who granted this
    // proactively on Monday was dealt a ticket that spawned already closed.
    setup: [
      {
        op: 'removeEdge',
        edge: {
          from: COMPANY_IDS.kwameAccount,
          to: COMPANY_IDS.salesMailbox,
          kind: 'has_access',
        },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.kwameAccount },
      to: { id: COMPANY_IDS.salesMailbox },
      kind: 'has_access',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3, money: 12 },
    kb_ref: 'kb/shared-mailbox-permissions',
  },
  cause: 'Nobody has ever granted him access. The mailbox is fine and the '
    + 'request is the whole of the fault.',
  dialogue_ref: 'dialogue/sales-new-starter',
  paths: [
    {
      id: 'grant-full-access',
      app: 'cmd',
      label: 'Grant Full Access on the Sales mailbox to kboateng',
      steps: [
        {
          action: HELPDESK_ACTIONS.shareGrantAccess,
          target: COMPANY_IDS.salesMailbox,
          params: { account: COMPANY_IDS.kwameAccount },
        },
      ],
    },
  ],
};

/**
 * And an hour later.
 *
 * It is summoned rather than scheduled because it is not a thing that happens
 * on a Tuesday - it is a thing that happens when the first one is fixed, and a
 * week table that dealt it at half past one would be a week table that knew the
 * player's future. `follows` is the whole mechanism: the roster says which
 * ticket raises it, and the day loop raises it in the minute that one closes.
 */
export const SENDAS_MISSING: WorldTicket = {
  arrival: 'summoned',
  nodes: [COMPANY_IDS.kwameAccount, COMPANY_IDS.salesMailbox],
  claimed_urgency: 3,
  true_urgency: 2,
  follows: 'ticket:mailbox-access',
  def: {
    id: 'ticket:sendas-missing',
    archetype: 'hidden_cause',
    flavor: {
      title: 'I can see the Sales mailbox now but it will not let me send',
      body:
        'Kwame can read everything, file everything and reply to nothing. The '
        + 'error is one line long and mentions neither permissions nor the '
        + 'mailbox. He has apologised twice for coming back, which is two more '
        + 'apologies than this deserves from him.',
    },
    reporter: COMPANY_IDS.kwame,
    // The second permission going missing as the second ticket arrives, for
    // the same reason as the first: the follower is raised by the fix, so a
    // world where somebody had already added him to the group would have
    // spawned it resolved in the same breath as it raised it - a chain closing
    // itself, twice, for free.
    setup: [
      {
        op: 'removeEdge',
        edge: {
          from: COMPANY_IDS.kwameAccount,
          to: COMPANY_IDS.salesSendAs,
          kind: 'member_of',
        },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.kwameAccount },
      to: { id: COMPANY_IDS.salesSendAs },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4, money: 14 },
    kb_ref: 'kb/shared-mailbox-permissions',
  },
  cause: 'Full Access lets somebody open a mailbox. Sending as it is a second '
    + 'permission, granted somewhere else - on this estate, by a group - and '
    + 'the first request never mentioned it because nobody ever does.',
  dialogue_ref: 'dialogue/sales-new-starter',
  paths: [
    {
      id: 'add-send-as-group',
      app: 'directory',
      label: 'Put kboateng into Sales Mailbox - Send As',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.kwameAccount,
          params: { group: COMPANY_IDS.salesSendAs },
        },
      ],
    },
  ],
};

/**
 * The new starter, the licence pool, and the leaver.
 *
 * Nothing is broken. Six seats were bought, six seats are in use, and one of
 * them belongs to a man whose account was correctly switched off in April by a
 * process that did its job and stopped one step short. The refusal on the
 * assign is the ticket: it says there are no free seats, and the only place to
 * find one is a directory full of people, sorted by nothing useful.
 */
export const LICENCE_EXHAUSTED: WorldTicket = {
  arrival: 'morning',
  nodes: [
    COMPANY_IDS.robAccount,
    COMPANY_IDS.suiteLicences,
    COMPANY_IDS.robMachine,
  ],
  // A person who cannot start, on the day they were told to start, in front of
  // the manager who hired them.
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:licence-exhausted',
    archetype: 'hidden_cause',
    flavor: {
      title: 'New starter cannot open the accounts package',
      body:
        'Rob started this morning. Everything works except the one program his '
        + 'entire job is, which opens, thinks about it, and says it cannot '
        + 'obtain a licence. His manager has been standing behind him for '
        + 'twenty minutes saying it was fine last time.',
    },
    reporter: COMPANY_IDS.rob,
    setup: [],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.robAccount },
      field: FIELDS.licence,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5, money: 20 },
    kb_ref: 'kb/licence-seats',
  },
  cause: 'Every seat in the pool is held, and one of them is held by an '
    + 'account that was disabled in April. Disabling somebody does not hand '
    + 'their licence back; nothing does, until a person does.',
  dialogue_ref: 'dialogue/finance-new-starter',
  paths: [
    {
      id: 'reclaim-then-assign',
      app: 'cmd',
      label: 'Take the seat back off the leaver, then give it to the new '
        + 'starter',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountRevokeLicence,
          target: COMPANY_IDS.colinAccount,
          params: { [SEATS_PARAM]: COMPANY_IDS.suiteLicences },
        },
        {
          action: HELPDESK_ACTIONS.accountAssignLicence,
          target: COMPANY_IDS.robAccount,
          params: { [SEATS_PARAM]: COMPANY_IDS.suiteLicences },
        },
      ],
    },
  ],
};

export const ACCESS_TICKETS: readonly WorldTicket[] = [
  MAILBOX_ACCESS,
  SENDAS_MISSING,
  LICENCE_EXHAUSTED,
];
