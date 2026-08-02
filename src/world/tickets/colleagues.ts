/**
 * The two tickets that come from people rather than from faults.
 *
 * Neither of them is anything BREAKING. That is the whole reason they are in
 * one file: most of a real first-line queue is requests, and a roster made
 * entirely of broken things is a roster about a building rather than about a
 * job. What these two are about is WHEN a request arrives and HOW - five
 * minutes before home time, and in person at your shoulder - which are the two
 * shapes of ask that nothing in the queue can teach.
 *
 * - The month-end VPN request lands at 16:55 on a Wednesday, carries an
 *   honest hour of response target, and is therefore not late until twenty
 *   to ten tomorrow morning. Nobody did anything wrong and nobody can do
 *   anything about it tonight, and the business-hours arithmetic says so
 *   without anybody having to script a cruelty.
 * - Gary's restart is the ticket that only exists if you ask for it. He comes
 *   to the desk with it; doing it there and then is faster, free and
 *   invisible, and sending him to the form is slower, credited, and the only
 *   version of it Friday can read.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/**
 * Five to five on a Wednesday, from a man who has just realised.
 *
 * There is no fault here at all: Marcus has never had remote access because
 * Marcus has never worked from home, and month-end is the week he does. The
 * request is reasonable, the timing is not his fault either - he found out at
 * half four that month-end had moved - and the only thing that makes it hurt
 * is the clock, which is exactly the point of the class.
 */
export const VPN_MONTH_END: WorldTicket = {
  arrival: 'drip',
  // The account and nothing else. It is one man's remote access rather than
  // the VPN service being down, and putting the service in this list would
  // have read as an office-wide outage on a request nobody else can feel.
  nodes: [COMPANY_IDS.marcusAccount],
  // He has ticked the top box, because month-end is the top box as far as he
  // is concerned. It is one desk and it is not broken.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:vpn-month-end',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Need VPN before tomorrow please - working from home for '
        + 'month-end',
      body:
        'Raised at 16:55. Marcus is doing month-end from home tomorrow and '
        + 'has just tried the remote client for the first time, which told '
        + 'him he is not permitted. He has added that he is not in tomorrow '
        + 'until half eight and would rather not ring anybody at half eight.',
    },
    reporter: COMPANY_IDS.marcus,
    // Nothing to break. He is not in the group because nobody ever put him in
    // it, which is the honest shape of most access requests and the reason
    // this one has an empty setup rather than a manufactured fault.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.marcusAccount },
      to: { id: COMPANY_IDS.vpnUsers },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/the-one-that-lands-at-five',
  },
  cause: 'Nothing is broken. He is not a member of VPN Users, has never been '
    + 'a member of VPN Users, and has never needed to be until this week.',
  dialogue_ref: 'dialogue/accounts',
  paths: [
    {
      id: 'directory-add-to-vpn',
      app: 'directory',
      label: 'Put the account into VPN Users in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.marcusAccount,
          params: { group: COMPANY_IDS.vpnUsers },
        },
      ],
    },
  ],
};

/**
 * The ticket Gary raises when you send him to the form.
 *
 * Summoned, like everything raised by somebody who asked you first: it does
 * not exist unless the conversation at the desk went that way, and if the job
 * was simply done there and then it never exists at all. That absence is the
 * mechanic rather than an optimisation - work with no ticket behind it is work
 * Friday cannot see, and Friday is where the difference is felt.
 */
export const GARY_RESTART: WorldTicket = {
  arrival: 'summoned',
  nodes: [COMPANY_IDS.garyMachine],
  // He said it was not urgent, which is unusual enough that it is worth
  // recording. It is also, genuinely, not urgent.
  claimed_urgency: 1,
  true_urgency: 1,
  def: {
    id: 'ticket:gary-restart',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Restart request - PAYROLL-04 (raised as asked)',
      body:
        'Gary has raised this because he was asked to. The machine has been '
        + 'asking him to restart to finish installing updates since before '
        + 'his fortnight off; he has been clicking Later ever since, because '
        + 'payroll is open on that machine most of the day. He has listed the '
        + 'two half-hours it is not.',
    },
    reporter: COMPANY_IDS.gary,
    // Re-asserted rather than assumed: a machine somebody restarted earlier in
    // the week for another reason would otherwise deal this ticket already
    // resolved, which is a free point and looks exactly like content working.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.garyMachine,
        field: FIELDS.pendingUpdates,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.garyMachine },
      field: FIELDS.pendingUpdates,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-restart-nobody-does',
  },
  cause: 'Updates were staged a fortnight ago and want the machine to go '
    + 'round once. Nothing else is wrong with it, and nothing else will be '
    + 'until somebody restarts it.',
  dialogue_ref: 'dialogue/payroll',
  paths: [
    {
      id: 'remote-restart-payroll-04',
      app: 'remote',
      label: 'Restart PAYROLL-04 from Remote Assist',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineReboot,
          target: COMPANY_IDS.garyMachine,
        },
      ],
    },
  ],
};

export const COLLEAGUE_TICKETS: readonly WorldTicket[] = [
  VPN_MONTH_END,
  GARY_RESTART,
];
