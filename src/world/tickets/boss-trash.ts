import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/**
 * The priority trap, as a ticket rather than as a script.
 *
 * The lead does not raise tickets; he raises concerns, in chat, at the moment
 * the thought occurs to him, and the concern is always top priority. This one
 * is genuinely broken and genuinely trivial: his account came out of the VPN
 * group when somebody tidied the groups, so the phone has nothing to sync
 * against. One desk is affected. That desk is the one that decides whether you
 * pass probation, which is the entire trap - the matrix says P4, the man says
 * now, and the player has to decide what to do with the gap.
 *
 * Nothing about it is special-cased: it is content with a claimed urgency of 3
 * and a true urgency of 1, the same two fields every other ticket carries. The
 * trap is mechanical.
 */
export const BOSS_PHONE: WorldTicket = {
  // Raised by the lead, mid-shift, in chat, by not raising it. The day
  // scheduler deals it no slot: the boss system puts it on the desk.
  arrival: 'summoned',
  nodes: [COMPANY_IDS.bossAccount],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:boss-phone',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'My phone has stopped getting email (top priority)',
      body:
        'Desmond reports, in chat, that his phone has not had a mail since '
        + 'yesterday and that he has the eleven o\'clock. He would like it '
        + 'treated as the most important thing on the desk. He has not '
        + 'mentioned it to anybody else, on the grounds that telling you is '
        + 'faster than writing it down, and telling you twice is faster still.',
    },
    reporter: COMPANY_IDS.boss,
    setup: [
      {
        op: 'removeEdge',
        edge: {
          from: COMPANY_IDS.bossAccount,
          to: COMPANY_IDS.vpnUsers,
          kind: 'member_of',
        },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.bossAccount },
      to: { id: COMPANY_IDS.vpnUsers },
      kind: 'member_of',
    },
    // Four hours, which is what the ladder gives a P4 that arrives at eleven -
    // and comfortably longer than the eleven o'clock he keeps mentioning.
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 1 },
    kb_ref: 'kb/mail-on-a-phone',
  },
  cause: 'Desmond\'s account came out of VPN Users in a group tidy-up, and the '
    + 'phone has had nothing to sync against since.',
  dialogue_ref: 'dialogue/the-lead',
  paths: [
    {
      id: 'directory-restore-group',
      app: 'directory',
      label: 'Put the account back in VPN Users in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.bossAccount,
          params: { group: COMPANY_IDS.vpnUsers },
        },
      ],
    },
  ],
};
