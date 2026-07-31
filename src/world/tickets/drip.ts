/**
 * The ticket that arrives while you are working.
 *
 * Everything else in the shipped queue was waiting at 08:00: it is the pile
 * you inherit, and a player can read all of it before the shift starts. This
 * one lands in the early afternoon, on a minute the day's seeded schedule
 * picks, with a notification and a row in a queue the player had just got down
 * to a length they were happy with. That is the other half of what a queue does
 * to you, and it is the half a morning pile cannot teach.
 *
 * Its lifecycle is its own. Nothing is broken: no service is down, no account
 * is locked, no hardware is making a noise. Somebody tidied a list, months ago,
 * and every system downstream of that list has been doing exactly what it was
 * told ever since - which is the only fault in the world that gets ANGRIER the
 * more correctly everything works.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

export const TIDIED_LIST: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.bevAccount],
  // She says it is urgent because the thing she cannot print is the visitor
  // list, and the auditors are on it. It is one desk, and there is a printer
  // on the floor above that nobody has told her about.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:tidied-list',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The printer works for everyone except me',
      body:
        'Bev on reception reports that her print jobs go nowhere. She has '
        + 'watched Nina print the same document from the next desk, on the '
        + 'same printer, while hers did not arrive. She has already been told '
        + 'twice this morning that the printer is fixed, and would like it '
        + 'noted that she is not making it up.',
    },
    reporter: COMPANY_IDS.bev,
    // The fault, as it actually happened: somebody went through the group in
    // March and took out the names they did not recognise.
    setup: [
      {
        op: 'removeEdge',
        edge: {
          from: COMPANY_IDS.bevAccount,
          to: COMPANY_IDS.printUsers,
          kind: 'member_of',
        },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.bevAccount },
      to: { id: COMPANY_IDS.printUsers },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/print-permissions',
  },
  cause: 'Bev\'s account was taken out of Print Users during a tidy-up in '
    + 'March, and the print server has been obeying that ever since.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'directory-add-to-group',
      app: 'directory',
      label: 'Put the account back into Print Users in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.bevAccount,
          params: { group: COMPANY_IDS.printUsers },
        },
      ],
    },
  ],
};
