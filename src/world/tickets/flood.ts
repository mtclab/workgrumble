/**
 * The two floods: forty reports, one fault, twice.
 *
 * Thursday's is a certificate. It expired at half past nine on a Thursday
 * morning, as certificates do, and every person who works from home found out
 * within ten minutes of each other. The service is running perfectly and
 * refusing everybody, which is why restarting it - the first thing anybody
 * tries - puts the same expired certificate back in front of the same people.
 *
 * Wednesday's is smaller and funnier: a maintenance window that was announced
 * in a mail everybody deleted, opened at nine, took the file sharing service
 * down exactly as promised, and then ended without anybody starting it again.
 * The complaints are correct AND the announcement was correct, which is the
 * only kind of blindness worth writing a ticket about.
 *
 * First line's job in both is bookkeeping, not repair: attach the duplicates to
 * the parent, fix the parent once, and let the copies close with the parent's
 * own words to its reporter. A duplicate in here therefore closes ONLY by that
 * route - its resolution rule is the parent marker and nothing else - because a
 * child that could also close on its own would make the linking optional, and
 * the linking is the entire skill being taught.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { linkNote } from './parent';
import type { TicketActionStep, WorldTicket } from './types';

export const VPN_PARENT = 'ticket:vpn-cert-expired';
export const SHARE_PARENT = 'ticket:share-maintenance';

/** The words a duplicate's reporter gets when the parent is finally closed. */
const VPN_CLOSING_WORD = 'The certificate on the concentrator had expired. It '
  + 'has been replaced and remote access is back. Nothing was wrong with your '
  + 'laptop, your password or your home broadband, whatever it said.';

const SHARE_CLOSING_WORD = 'The file sharing service was taken down by this '
  + 'morning\'s announced maintenance window and did not come back up when the '
  + 'window closed. It is running again and nothing was lost.';

/**
 * How a duplicate is closed, as the three moves it actually is: attach it,
 * repair the one fault, tell everybody at once. Written once because writing it
 * per child is how four tickets end up advertising three different workflows.
 */
function duplicatePath(
  child: string,
  parent: string,
  parentTitle: string,
  comment: string,
  fix: Readonly<TicketActionStep>,
): readonly TicketActionStep[] {
  return [
    {
      action: HELPDESK_ACTIONS.ticketLinkToParent,
      target: child,
      params: { parent, note: linkNote(parentTitle, parent) },
    },
    fix,
    {
      action: HELPDESK_ACTIONS.ticketResolveWithParent,
      target: child,
      params: { parent, comment },
    },
  ];
}

const RENEW_VPN_CERT: TicketActionStep = {
  action: HELPDESK_ACTIONS.serviceRenewCertificate,
  target: COMPANY_IDS.vpn,
};

const START_FILE_SHARING: TicketActionStep = {
  action: HELPDESK_ACTIONS.serviceRestart,
  target: COMPANY_IDS.fileShare,
};

const VPN_PARENT_TITLE = 'Nobody working from home can connect';
const SHARE_PARENT_TITLE = 'The common drive has gone';

export const VPN_CERT_EXPIRED: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.vpn, COMPANY_IDS.printServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: VPN_PARENT,
    archetype: 'flood',
    flavor: {
      title: VPN_PARENT_TITLE,
      body:
        'Nina is at the depot and cannot get in. Neither, in the last eleven '
        + 'minutes, can anybody else who is not in this building. The client '
        + 'says the connection could not be verified, which is the politest '
        + 'possible way of saying the certificate ran out this morning.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.vpn,
        field: FIELDS.certExpired,
        value: true,
      },
    ],
    // Deliberately NOT the service status. The concentrator is up, answering,
    // and turning everybody away - which is what makes "restart it" the wrong
    // fix and the refusal on the restart the first honest thing anybody says.
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.vpn },
      field: FIELDS.certExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 8 },
    kb_ref: 'kb/expired-certificate',
  },
  cause: 'The certificate the VPN concentrator presents expired this morning. '
    + 'The service is running and rejecting every connection, politely.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'renew-the-certificate',
      app: 'cmd',
      label: 'renewcert vpn - a new certificate, not a restart',
      steps: [RENEW_VPN_CERT],
    },
  ],
};

export const VPN_CERT_DUP_ADA: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.vpn],
  duplicate: true,
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:vpn-cert-dup-ada',
    archetype: 'flood',
    flavor: {
      title: 'VPN not working from home (URGENT)',
      body:
        'Ada is at home with the good coffee and cannot reach anything. She '
        + 'has restarted her laptop, her router and, at one point, her phone, '
        + 'and would like it noted that she did all of that before contacting '
        + 'anybody, which is true and which she will mention again.',
    },
    reporter: COMPANY_IDS.ada,
    setup: [],
    // Only the parent. A duplicate that could close itself is a duplicate
    // nobody has to attach to anything, and attaching it is the job.
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:vpn-cert-dup-ada' },
      field: FIELDS.parentResolved,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/expired-certificate',
  },
  cause: 'The same expired certificate as everybody else this morning.',
  dialogue_ref: 'dialogue/sales',
  paths: [
    {
      id: 'link-and-close-with-parent',
      app: 'tickets',
      label: 'Attach it to the incident, fix that, and tell her with the rest',
      steps: duplicatePath(
        'ticket:vpn-cert-dup-ada',
        VPN_PARENT,
        VPN_PARENT_TITLE,
        VPN_CLOSING_WORD,
        RENEW_VPN_CERT,
      ),
    },
  ],
};

export const VPN_CERT_DUP_GARY: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.vpn],
  duplicate: true,
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:vpn-cert-dup-gary',
    archetype: 'flood',
    flavor: {
      title: 'Remote access has stopped working again',
      body:
        'Gary is working from home on the payroll run and the connection will '
        + 'not come up. He suspects it is the same thing as his password, on '
        + 'the grounds that both of them are computers and both of them have '
        + 'now let him down in the same fortnight.',
    },
    reporter: COMPANY_IDS.gary,
    setup: [],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:vpn-cert-dup-gary' },
      field: FIELDS.parentResolved,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/expired-certificate',
  },
  cause: 'The same expired certificate as everybody else this morning.',
  dialogue_ref: 'dialogue/payroll',
  paths: [
    {
      id: 'link-and-close-with-parent',
      app: 'tickets',
      label: 'Attach it to the incident, fix that, and tell him with the rest',
      steps: duplicatePath(
        'ticket:vpn-cert-dup-gary',
        VPN_PARENT,
        VPN_PARENT_TITLE,
        VPN_CLOSING_WORD,
        RENEW_VPN_CERT,
      ),
    },
  ],
};

export const SHARE_MAINTENANCE: WorldTicket = {
  arrival: 'drip',
  nodes: [
    COMPANY_IDS.fileShare,
    COMPANY_IDS.fileServer,
    COMPANY_IDS.commonShare,
  ],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: SHARE_PARENT,
    archetype: 'flood',
    flavor: {
      title: SHARE_PARENT_TITLE,
      body:
        'Bev cannot reach the visitor list, which lives on the common drive, '
        + 'which has not existed since nine o\'clock. There is a mail in your '
        + 'own inbox saying the drive would be unavailable from nine until '
        + 'eleven. It is now well past eleven, which is the part of this that '
        + 'is actually a fault.',
    },
    reporter: COMPANY_IDS.bev,
    // The window itself is a scheduled world incident and stops the service at
    // nine. The setup says the same thing, so the fault exists whether or not
    // anybody was watching at nine - a ticket that is only broken when the
    // clock happened to pass through the right minute is a ticket that cannot
    // be tested.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.fileShare,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.fileShare },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6 },
    kb_ref: 'kb/announced-maintenance',
  },
  cause: 'The announced maintenance window took the file sharing service down '
    + 'at nine and nobody started it again when the window closed.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'start-the-service',
      app: 'cmd',
      label: 'Start file sharing again - the window closed an hour ago',
      steps: [START_FILE_SHARING],
    },
  ],
};

export const SHARE_DUP_TERRY: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.fileShare],
  duplicate: true,
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:share-dup-terry',
    archetype: 'flood',
    flavor: {
      title: 'All my files have been deleted',
      body:
        'Terry reports that his files have been deleted. On being asked which '
        + 'files, he says all of them. On being asked where they were, he says '
        + 'on the drive. The drive is not there, so from where he is sitting '
        + 'this is an accurate report of a catastrophe.',
    },
    reporter: COMPANY_IDS.terry,
    setup: [],
    resolved_when: {
      op: 'eq',
      selector: { id: 'ticket:share-dup-terry' },
      field: FIELDS.parentResolved,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/announced-maintenance',
  },
  cause: 'The same maintenance window as everybody else, seen from a desk '
    + 'where a missing drive and a deleted file look identical.',
  dialogue_ref: 'dialogue/estimating',
  paths: [
    {
      id: 'link-and-close-with-parent',
      app: 'tickets',
      label: 'Attach it to the drive incident and close it with that one',
      steps: duplicatePath(
        'ticket:share-dup-terry',
        SHARE_PARENT,
        SHARE_PARENT_TITLE,
        SHARE_CLOSING_WORD,
        START_FILE_SHARING,
      ),
    },
  ],
};

export const FLOOD_TICKETS: readonly WorldTicket[] = [
  VPN_CERT_EXPIRED,
  VPN_CERT_DUP_ADA,
  VPN_CERT_DUP_GARY,
  SHARE_MAINTENANCE,
  SHARE_DUP_TERRY,
];
