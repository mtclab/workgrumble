/**
 * Fettle & Crane Managed IT, week one (0.8.0, Pass A).
 *
 * The MSP employer's week, and deliberately a LIGHT one - three tickets across
 * three customers, one each, enough to walk the customer dimension end to end:
 * open a ticket and land in that customer's context, work an in-scope helpdesk
 * job at one, hit the monitoring-only scope wall at another, and have the OS +
 * scope compose reachable at the SaaS shop. The rich per-vertical streams are a
 * later pass; this proves the mechanics on a real week.
 *
 * Same loader and rules as the other two employers' weeks: a morning pile of at
 * most two, every ticket arrives once, drips land inside the hours. The room set
 * passed to `validateWeek` is Fettle & Crane's, so a service-desk message is
 * legal here and one in another shop's room is the boot failure it should be.
 */

import { MSP_CHANNELS } from './msp-company';
import { type DayScript, validateWeek } from './week';

const MSP_ROOM_IDS = new Set(MSP_CHANNELS.map((room) => room.id));

export const MSP_WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    // One customer on the desk before nine: Fontaine's practice manager is
    // locked out with a filing at ten - the desk's own job, at a customer.
    inherited: ['ticket:fontaine-lockout'],
    drip: [],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    inherited: [],
    // Meridian's Theo locks himself out of his laptop mid-morning - in scope,
    // at a customer whose product fleet is out of reach on OS and contract both.
    drip: [{ ticketId: 'ticket:meridian-lockout', minute: 10 * 60 + 15 }],
    patrolSeed: 1_699,
    load: 1,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    // The monitoring-only wall: Northwind's backup service wedges and the board
    // goes red at ten. The job is to escalate, and the world refuses a fix.
    drip: [{ ticketId: 'ticket:northwind-backup-alert', minute: 10 * 60 }],
    patrolSeed: 4_057,
    load: 1,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: [],
    drip: [],
    patrolSeed: 6_421,
    load: 1,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    // Friday brings nothing new; it is the review, run against the same bar the
    // other shops' Fridays are.
    drip: [],
    patrolSeed: 2_939,
    load: 1,
  },
], MSP_ROOM_IDS);

/** Monday's inherited pile at the MSP, for the employer registry. */
export function mspInheritedTicketIds(): readonly string[] {
  return MSP_WEEK[0]?.inherited ?? [];
}
