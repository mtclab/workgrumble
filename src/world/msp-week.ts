/**
 * Fettle & Crane Managed IT, week one (0.8.0).
 *
 * Pass A stood this up as three skeleton lockouts to prove the customer
 * mechanics; Pass B fills it with the real per-vertical queue - ten tickets
 * across three customers, spread over five days the way every other employer's
 * week is. It is still a Tier-1 service-desk week: a morning pile of at most
 * two, drips landing inside the hours, the ramp climbing Monday-light to a
 * Thursday that carries the tense e-filing deadline and the prod-down escalation
 * at once, and a lighter Friday for the review.
 *
 * The week teaches the shape of the job by where it puts its tickets: two
 * customers before nine on the first morning (the tenant switch, made routine),
 * the monitoring-only wall on every day Northwind speaks, and - on Thursday - the
 * one the whole arc is built to reach: the product down on a Linux box the desk
 * may not, and could not, touch, whose only honest ending is to escalate.
 *
 * Same loader and rules as the other two employers' weeks. The room set passed
 * to `validateWeek` is Fettle & Crane's, so a service-desk message is legal here
 * and one in another shop's room is the boot failure it should be.
 */

import { MSP_CHANNELS } from './msp-company';
import { type DayScript, validateWeek } from './week';

const MSP_ROOM_IDS = new Set(MSP_CHANNELS.map((room) => room.id));

export const MSP_WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    // Two customers before the kettle has boiled: Fontaine's new associate
    // cannot open her first matter, and Northwind's backup failed overnight.
    // One in-scope grant, one monitoring-only wall - the tenant switch and the
    // scope constraint, both on the first morning.
    inherited: ['ticket:fontaine-matter-access'],
    drip: [{ ticketId: 'ticket:northwind-backup-alert', minute: 10 * 60 }],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    // Meridian's analyst is locked out of Okta before her ten o'clock call, and
    // mid-morning Fontaine surfaces the iManage deadlock a partner left behind.
    inherited: ['ticket:meridian-mfa-lockout'],
    drip: [{ ticketId: 'ticket:fontaine-checkout-deadlock', minute: 10 * 60 + 20 }],
    patrolSeed: 1_699,
    load: 2,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    // The weekend SSO change catches up with a Meridian engineer, and the
    // afternoon brings Northwind's certificate ticking towards expiry.
    drip: [
      { ticketId: 'ticket:meridian-app-assignment', minute: 9 * 60 + 40 },
      { ticketId: 'ticket:northwind-cert-alert', minute: 13 * 60 + 30 },
    ],
    patrolSeed: 4_057,
    load: 2,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: [],
    // The heavy day, and the one the arc was built to reach: an offboarding gap
    // to close, the e-filing deadline at eleven, and - after lunch - the product
    // down on a Linux box the desk may only escalate.
    drip: [
      { ticketId: 'ticket:meridian-offboarding', minute: 9 * 60 + 50 },
      { ticketId: 'ticket:fontaine-efiling', minute: 11 * 60 },
      { ticketId: 'ticket:meridian-prod-down', minute: 14 * 60 },
    ],
    patrolSeed: 6_421,
    load: 3,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    // A lighter Friday, the way every week's is: one last monitoring alert -
    // Northwind's disk crossing its threshold - and then the review.
    drip: [{ ticketId: 'ticket:northwind-disk-alert', minute: 10 * 60 + 30 }],
    patrolSeed: 2_939,
    load: 2,
  },
], MSP_ROOM_IDS);

/** Monday's inherited pile at the MSP, for the employer registry. */
export function mspInheritedTicketIds(): readonly string[] {
  return MSP_WEEK[0]?.inherited ?? [];
}
