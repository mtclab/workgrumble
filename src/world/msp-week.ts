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

import { MSP_CHANNELS, MSP_IDS } from './msp-company';
import type { OnCallPage } from './on-call';
import { type DayScript, validateWeek } from './week';

const MSP_ROOM_IDS = new Set(MSP_CHANNELS.map((room) => room.id));

/**
 * The two on-call pages the first engineer week carries (E6, 0.17.0), both on
 * Fettle & Crane's OWN box (FC-RMM-01, no customer, the engineer's to fix
 * without crossing a contract). They fire only once the player carries the pager
 * - a service-desk week never sees them - and whether each is a real fire or a
 * flap that settles itself is deterministic and seeded, not decided here.
 *
 * The reverse proxy goes on Tuesday night and the nightly-jobs timer on
 * Wednesday night, so the arc has a page on two separate nights rather than a
 * wall of them. Under the shipped seed the proxy is a real fire (the whole
 * portal dark - ssh in and restart nginx) and the timer is a flap (it twitches
 * and settles on its own by morning - the one you learn NOT to jump for); a
 * retry's fresh seed can flip which is which, which is the point of seeding it.
 */
const PAGE_FC_NGINX_DOWN: OnCallPage = {
  id: 'page/fc-nginx-down',
  severity: 'sev1',
  box: MSP_IDS.mspInfraServer,
  unit: MSP_IDS.mspInfraNginxUnit,
  service: 'the reverse proxy in front of the client portal',
  note: 'nginx is down on FC-RMM-01 and the whole client portal is dark - every '
    + 'customer request is hitting a closed door. ssh in, read the unit, and '
    + 'bring it back up.',
  journal: [
    'Sep 08 02:50:03 FC-RMM-01 nginx[1180]: nginx: [alert] worker process 1182 '
      + 'exited on signal 11',
    'Sep 08 02:50:03 FC-RMM-01 systemd[1]: nginx.service: Main process exited, '
      + 'code=killed, status=11/SEGV',
    'Sep 08 02:50:03 FC-RMM-01 systemd[1]: nginx.service: Failed with result '
      + '\'signal\'.',
    'Sep 08 02:50:04 FC-RMM-01 systemd[1]: nginx.service: Scheduled restart job, '
      + 'restart counter is at 5.',
    'Sep 08 02:50:04 FC-RMM-01 systemd[1]: nginx.service: Start request repeated '
      + 'too quickly.',
    'Sep 08 02:50:04 FC-RMM-01 systemd[1]: Failed to start A high performance '
      + 'web server and a reverse proxy server.',
  ],
};

const PAGE_FC_BACKUP_FLAP: OnCallPage = {
  id: 'page/fc-backup-flap',
  severity: 'sev2',
  box: MSP_IDS.mspInfraServer,
  unit: MSP_IDS.mspInfraCronUnit,
  service: 'the nightly-jobs timer on FC-RMM-01',
  note: 'The cron daemon that runs the overnight jobs went unresponsive and the '
    + 'monitoring paged it. It is the kind of check that flaps and settles - look '
    + 'before you leap: a status will tell you whether it is really down or '
    + 'already back.',
  journal: [
    'Sep 09 03:10:41 FC-RMM-01 cron[912]: (CRON) INFO (running with inotify '
      + 'support)',
    'Sep 09 03:11:02 FC-RMM-01 systemd[1]: cron.service: A process of this unit '
      + 'has been killed by the OOM killer.',
    'Sep 09 03:11:02 FC-RMM-01 systemd[1]: cron.service: Failed with result '
      + '\'oom-kill\'.',
  ],
};

export const MSP_WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    // Two customers before the kettle has boiled: Fontaine's new associate
    // cannot open her first matter, and Northwind's backup failed overnight.
    // One in-scope grant, one monitoring-only wall - the tenant switch and the
    // scope constraint, both on the first morning. And Holloway's bookkeeper is
    // locked out before payroll: the fully-managed tier, opening on its most
    // ordinary work (a user), so the server fix later in the week reads as the
    // contrast it is.
    // And in the afternoon, ELMWOOD-DENTAL's imaging bridge: the weekend Dentrix
    // update has stopped X-rays writing to the chart, and the surgery has been
    // writing them on paper since. A restart will not fix a vendor integration
    // the update moved the interface under - the honest close is to escalate.
    inherited: ['ticket:fontaine-matter-access', 'ticket:holloway-lockout'],
    drip: [
      { ticketId: 'ticket:northwind-backup-alert', minute: 10 * 60 },
      { ticketId: 'ticket:elmwood-imaging-bridge', minute: 13 * 60 + 30 },
    ],
    patrolSeed: 0,
    // ONE, and all five days of this week are one, where every one of them was
    // authored three (0.31.0, when the column became arithmetic). Four tickets
    // a day at 270 committed minutes of a 480-minute shift is a busy-looking
    // week that is not a heavy one: the MSP deals more ROWS than the probation
    // shop and fewer MINUTES, because nothing here takes the screen away - no
    // takeovers, no walk-ups, no meeting - and four tickets that each close in
    // one dispatch is four tickets. The flat three was a claim about how the
    // week FEELS; the flat one is what it costs. What that says about the MSP
    // week is a content finding and it is written up in the commit, not fixed
    // by moving the number back.
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    // Meridian's analyst is locked out of Okta before her ten o'clock call,
    // mid-morning Fontaine surfaces the iManage deadlock a partner left behind,
    // and Holloway's reception spooler wedges - a fully-managed workstation fix
    // beside the helpdesk ones, the same work with no wall on the server half.
    // And the chair-side emergency: ELMWOOD-DENTAL's X-ray sensor drops off the
    // USB bus with a patient in the chair. On the tightest clock in the game -
    // Gold clinic, high severity - and closed by the reseat every practice knows.
    inherited: ['ticket:meridian-mfa-lockout'],
    drip: [
      { ticketId: 'ticket:elmwood-xray-sensor', minute: 11 * 60 },
      { ticketId: 'ticket:fontaine-checkout-deadlock', minute: 10 * 60 + 20 },
      { ticketId: 'ticket:holloway-spooler', minute: 13 * 60 + 15 },
    ],
    // And the first night on the pager, once you carry it: the reverse proxy on
    // the MSP's own box falls over in the small hours. Read on Wednesday's brief,
    // fired only for an engineer - a desk player's Tuesday night is silent.
    onCall: [PAGE_FC_NGINX_DOWN],
    patrolSeed: 1_699,
    load: 1,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    // The weekend SSO change catches up with a Meridian engineer, the afternoon
    // brings Northwind's certificate ticking towards expiry, Holloway's whole
    // office loses the shared drive - and, at ten, the capstone: a new customer
    // signs. TILLMAN-FREIGHT is taken on undocumented; the onboarding event
    // stands their estate up mid-morning and the discovery ticket lands twenty
    // minutes later, once there is a client to audit. The horror the audit finds
    // is a real state on that estate, not a line in the ticket.
    drip: [
      { ticketId: 'ticket:meridian-app-assignment', minute: 9 * 60 + 40 },
      { ticketId: 'ticket:tillman-backup-discovery', minute: 10 * 60 + 20 },
      { ticketId: 'ticket:holloway-shared-drive', minute: 11 * 60 + 30 },
      { ticketId: 'ticket:northwind-cert-alert', minute: 13 * 60 + 30 },
    ],
    // The customer that signs mid-shift, the way Bodgeworth's storm is a beat the
    // Wednesday fires. It stands up TILLMAN's estate at ten, before the discovery
    // ticket drips - so the audit has something to enumerate and the runbook it
    // contradicts is already thin.
    onboarding: [
      { onboardingId: 'onboarding:tillman', minute: 10 * 60 },
    ],
    // The second night's page: the nightly-jobs timer flaps. Under the shipped
    // seed this is the one that settles itself - read on Thursday's brief, it is
    // the page you learn not to scramble for.
    onCall: [PAGE_FC_BACKUP_FLAP],
    patrolSeed: 4_057,
    load: 1,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: [],
    // The heavy day, and the one the arc was built to reach: an offboarding gap
    // to close, the e-filing deadline at eleven, the product down on a Linux box
    // the desk may only escalate - and Arden's misrouted user lockout, the RACI
    // hand-back that teaches co-managed is coordinate-then-act by first teaching
    // what the MSP does NOT touch.
    drip: [
      { ticketId: 'ticket:meridian-offboarding', minute: 9 * 60 + 50 },
      { ticketId: 'ticket:fontaine-efiling', minute: 11 * 60 },
      { ticketId: 'ticket:arden-lockout-handback', minute: 12 * 60 + 30 },
      { ticketId: 'ticket:meridian-prod-down', minute: 14 * 60 },
    ],
    patrolSeed: 6_421,
    load: 1,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    // A lighter Friday, the way every week's is: one last monitoring alert -
    // Northwind's disk crossing its threshold - Elmwood's HIPAA access review (a
    // patient asking who opened their chart, answered from the audit trail, not a
    // fix), and Arden's shop-floor portal wedged as their IT clocks off, the
    // co-managed gap the MSP fills by notifying their team first and then acting.
    // Then the review.
    drip: [
      { ticketId: 'ticket:northwind-disk-alert', minute: 10 * 60 + 30 },
      { ticketId: 'ticket:elmwood-hipaa-audit', minute: 11 * 60 },
      { ticketId: 'ticket:arden-portal-afterhours', minute: 14 * 60 + 45 },
    ],
    patrolSeed: 2_939,
    load: 1,
  },
], MSP_ROOM_IDS);

/** Monday's inherited pile at the MSP, for the employer registry. */
export function mspInheritedTicketIds(): readonly string[] {
  return MSP_WEEK[0]?.inherited ?? [];
}
