/**
 * The tickets that only exist if you convert a channel request into one.
 *
 * A linked request (0.5.0 slice 2) is the same question arriving on mail, chat
 * and a Hubbub room at once. It is not a ticket - it is a plea in three
 * windows - and the correct play is to MINT it into one, which keeps the human
 * happy and earns the credit. These are the tickets that minting raises.
 *
 * `summoned`, like everything raised by a decision rather than by a schedule:
 * the ticket does not exist unless the player converted the request, and if the
 * player answered the human off the books instead it never exists at all. That
 * absence is the mechanic - work with no ticket behind it is work Friday cannot
 * see - and it is the same shape the direct-message favour and the walk-up
 * already teach, one intake surface over.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/**
 * Bev on reception, who needs the VPN for a day working from home and has said
 * so everywhere at once.
 *
 * There is no fault: she has simply never had remote access, because reception
 * has never worked from home until the week the boiler is off. The request is
 * reasonable, and the only question is whether it becomes a ticket the review
 * can see or a favour nobody wrote down. Adding her to VPN Users is the whole
 * of the fix, exactly as Marcus's month-end request is - the same article
 * covers both - which is what keeps this a request rather than a puzzle.
 */
export const BEV_VPN_REQUEST: WorldTicket = {
  arrival: 'summoned',
  nodes: [COMPANY_IDS.bevAccount],
  // She has ticked the middle box, because working from home tomorrow is a
  // middle-box sort of problem as far as she is concerned. One desk, not broken.
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: 'ticket:bev-vpn-request',
    archetype: 'hidden_cause',
    flavor: {
      title: 'VPN for working from home (raised from a channel request)',
      body:
        'Bev is on reception and is working from home on Thursday while the '
        + 'boiler is off. She has never used the remote client and it will not '
        + 'have her. She asked in mail, in chat and in the helpdesk room, all '
        + 'within a couple of minutes, because she was not sure which one '
        + 'anybody actually reads - and this ticket exists because somebody '
        + 'turned the asking into one.',
    },
    reporter: COMPANY_IDS.bev,
    // Nothing to break: she is not in the group because nobody ever put her in
    // it, the honest shape of most access requests.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.bevAccount },
      to: { id: COMPANY_IDS.vpnUsers },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-one-that-lands-at-five',
  },
  cause: 'Nothing is broken. Bev is not a member of VPN Users, has never been '
    + 'a member of VPN Users, and has never needed to be until this week.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'directory-add-bev-to-vpn',
      app: 'directory',
      label: 'Put the account into VPN Users in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.bevAccount,
          params: { group: COMPANY_IDS.vpnUsers },
        },
      ],
    },
  ],
};

export const CHANNEL_REQUEST_TICKETS: readonly WorldTicket[] = [
  BEV_VPN_REQUEST,
];
