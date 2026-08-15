/**
 * Workgrumble Ltd's surplus (E11, 0.34.0 slice 2): thirty entries the authored
 * week never deals, in the same shape the decomposition emits.
 *
 * Twenty of them put one of the shop's twenty pool tickets on the desk - six in
 * a morning pile, fourteen dripped across the hours a ticket can be started in.
 * The other ten are the day AROUND the queue, which is the half a week made
 * only of tickets does not have: five things the workstation decides to do to
 * itself, two people opening a chat with the word "Hi." and nothing else, two
 * pings after everybody has gone home, and one post in a room nobody needed.
 *
 * WHY THE TEN CARRY NO TICKET. A spare is a loose entry by construction: the
 * draw may put it in a week that does not deal the ticket it would otherwise be
 * about, so `relatedTicket` is null on every interruption here. That makes all
 * five malignant in the cost model - they are about no work anybody is holding,
 * so each costs its own minutes and the refocus window at the far end - and it
 * is why every one of them is SHORT. Four to eleven minutes: a day that drew
 * three of them is a bad day, not an impossible one.
 *
 * WHY THEY ARE ALL MACHINES. A ringing phone needs a person, a person needs a
 * conversation, and a conversation about a call that may or may not be in the
 * same week as the ticket it concerns is a beat that reads as a wrong number.
 * A workstation deciding to defragment itself at half past ten needs nobody:
 * there is no one on the other end of it to be reasonable with, which is what
 * makes it the one source whose refusal cannot be a social one - and the reason
 * none of them is declinable.
 *
 * The drip minutes are spread deliberately across 09:30 to 15:30 rather than
 * clustered, because the sampler places what it is given: a pool whose fourteen
 * drips all wanted half past ten would deal every drawn week the same morning.
 */

import { FLAVOR } from '../interruptions';
import type { DayFragment } from '../pools';

export const DESK_SPARES: readonly DayFragment[] = [
  /* -- the morning pile: six tickets that were true before anybody arrived - */

  // The printer that is off at the wall, found by the first person to try it.
  { inherited: ['ticket:pool-hercules-dead'] },
  // Reception, locked out, with two visitors already standing there.
  { inherited: ['ticket:pool-reception-locked'] },
  // The despatch queue the late shift gave up on at some point before six.
  { inherited: ['ticket:pool-despatch-queue'] },
  // And the password that expired overnight on the man who starts at six.
  { inherited: ['ticket:pool-despatch-expired'] },
  // Facilities, switched off by a leavers run that read the payroll list.
  { inherited: ['ticket:pool-facilities-disabled'] },
  // And head office ringing the warehouse about a file nobody has sent since
  // the scheduler stopped.
  { inherited: ['ticket:pool-warehouse-schedule'] },

  /* -- the drips ---------------------------------------------------------- */

  // 09:32. The first thing anybody raises is never the worst thing.
  { drip: [{ ticketId: 'ticket:pool-sales-restart', minute: 572 }] },
  // 09:45. And the one nobody at this grade can do anything about but hand on
  // (E9, 0.36.0) - early, because a clean handoff on a production outage is
  // worth more at a quarter to ten than at four.
  { drip: [{ ticketId: 'ticket:pool-product-login-down', minute: 585 }] },
  // 10:00.
  { drip: [{ ticketId: 'ticket:pool-sales-spooler', minute: 600 }] },
  // 10:27.
  { drip: [{ ticketId: 'ticket:pool-payroll-clock', minute: 627 }] },
  // 10:54.
  { drip: [{ ticketId: 'ticket:pool-payroll-share', minute: 654 }] },
  // 11:22.
  { drip: [{ ticketId: 'ticket:pool-despatch-lpd', minute: 682 }] },
  // 11:49, which leaves two hours to decide whether to restart the box the
  // whole building prints through before the auditors arrive at two.
  { drip: [{ ticketId: 'ticket:pool-reception-badges', minute: 709 }] },
  // 12:17.
  { drip: [{ ticketId: 'ticket:pool-accounts-updates', minute: 737 }] },
  // 12:44.
  { drip: [{ ticketId: 'ticket:pool-accounts-drives', minute: 764 }] },
  // 13:11.
  { drip: [{ ticketId: 'ticket:pool-estimating-rotated', minute: 791 }] },
  // 13:39, and the tender goes at four.
  { drip: [{ ticketId: 'ticket:pool-estimating-tender', minute: 819 }] },
  // 14:06.
  { drip: [{ ticketId: 'ticket:pool-portal-cert', minute: 846 }] },
  // 14:34.
  { drip: [{ ticketId: 'ticket:pool-accounts-browse', minute: 874 }] },
  // 15:01.
  { drip: [{ ticketId: 'ticket:pool-warehouse-tablet', minute: 901 }] },
  // 15:28, which is the last minute of the window and the right one for a man
  // who has spent all afternoon apologising for asking.
  { drip: [{ ticketId: 'ticket:pool-sales-new-mfa', minute: 928 }] },

  /* -- what the workstation decides to do to your morning ----------------- */

  {
    interruptions: [{
      id: 'machine:pool-scandisk',
      source: 'machine',
      minute: 585,
      minutes: 6,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      // Two short pushes rather than one long one. The worst a non-declinable
      // entry may cost is its whole budget plus its own minutes on top of the
      // latest minute it can start, and the shift has to hold all of it.
      postpones: [5, 2],
      flavor: {
        [FLAVOR.subject]: 'ScanDisk is checking drive C: after an improper '
          + 'shutdown',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-defrag',
      source: 'machine',
      minute: 655,
      minutes: 9,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [10, 5],
      flavor: {
        [FLAVOR.subject]: 'Disk Defragmenter, on a schedule somebody set in '
          + '1996',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-agent-update',
      source: 'machine',
      minute: 725,
      minutes: 5,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5],
      flavor: {
        [FLAVOR.subject]: 'WorkgrumbleAgent is updating itself and has taken '
          + 'the screen to say so',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-virus-sweep',
      source: 'machine',
      minute: 795,
      minutes: 11,
      relatedTicket: null,
      declinable: false,
      severity: 3,
      postpones: [8, 4],
      flavor: {
        [FLAVOR.subject]: 'The monthly virus sweep, at the minute somebody '
          + 'typed into it in 1997',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-driver-install',
      source: 'machine',
      minute: 865,
      minutes: 4,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5, 2],
      flavor: {
        [FLAVOR.subject]: 'A print driver is being reinstalled from PRINT-01',
      },
    }],
  },

  /* -- "Hi." -------------------------------------------------------------- */

  // Both of them are people whose conversation already carries a greeting to
  // open on, because a bare hello from somebody with nothing written for it is
  // a minute in which nothing whatever happens - and a spare is placed by a
  // draw, so it would only be that on the seeds that dealt it.
  { noHello: [{ speaker: 'person:owen', minute: 595, typingMinutes: 4 }] },
  { noHello: [{ speaker: 'person:kwame', minute: 860, typingMinutes: 3 }] },

  /*
   * And four more of the morning pile, which is the column the window actually
   * ran out of.
   *
   * Every other column had room. This one costs five entries a week - a day
   * owes at least one and there are five days - so two consecutive weeks drawn
   * from different halves of the pool need ten of them with somewhere legal to
   * put each, and eleven was not enough margin to be wrong about a day. The
   * generator found that out at week five hundred and sixty-four and said so.
   */
  { inherited: ['ticket:pool-finance-sound'] },
  { inherited: ['ticket:pool-logistics-share'] },
  { inherited: ['ticket:pool-marketing-trust'] },
  { inherited: ['ticket:pool-hr-print-group'] },

  /* -- and after you have gone home --------------------------------------- */

  {
    afterHours: [{
      id: 'after:pool-nina-depot',
      speaker: 'person:nina',
      subject: 'Sorry - not urgent, tomorrow is fine. The depot lot say the '
        + 'notes came out eventually. I have no idea whether that was you.',
      declinable: true,
    }],
  },
  {
    afterHours: [{
      id: 'after:pool-marcus-month-end',
      speaker: 'person:marcus',
      subject: 'Are the timesheets in by Friday or on Friday? I have asked '
        + 'three people and I have three answers.',
      declinable: true,
    }],
  },

  /*
   * -- four more of the workstation taking the screen ----------------------
   *
   * Here for an arithmetic reason rather than a comic one, and the arithmetic
   * is worth writing down because it is what sizes this whole file.
   *
   * A day at this shop may hold at most two inherited tickets and five drips,
   * and the budget multiplies the ticket half by the count of them - so the
   * step from six arrivals to seven is a jump of a hundred and sixty minutes,
   * which vaults a load-3 Wednesday straight over the top of its band. The band
   * between them can only be reached by something that costs minutes WITHOUT
   * being a ticket, and on this estate that is a beige box deciding to do
   * something to itself. Five of these were not enough to bridge two load-3
   * days and a load-2 Friday on every seed; nine are.
   *
   * All `machine`, which is the one source that needs no conversation written
   * for it, and all non-declinable with short shrinking pushes: there is nobody
   * on the other end of a workstation to be reasonable with, and the worst case
   * of every push still has to land inside the shift.
   */
  {
    interruptions: [{
      id: 'machine:pool-print-driver',
      source: 'machine',
      minute: 610,
      minutes: 7,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [10, 5],
      flavor: {
        [FLAVOR.subject]: 'Installing a printer driver the print server has '
          + 'decided this workstation is missing',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-profile-sync',
      source: 'machine',
      minute: 700,
      minutes: 8,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [5, 2],
      flavor: {
        [FLAVOR.subject]: 'Your roaming profile is being copied to the server '
          + 'and the desktop is not yours until it has finished',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-licence-check',
      source: 'machine',
      minute: 760,
      minutes: 5,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5],
      flavor: {
        [FLAVOR.subject]: 'The suite is checking its licence with a server it '
          + 'can reach on Tuesdays',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-backup-catalogue',
      source: 'machine',
      minute: 860,
      minutes: 10,
      relatedTicket: null,
      declinable: false,
      severity: 3,
      postpones: [8, 4],
      flavor: {
        [FLAVOR.subject]: 'The backup agent is rebuilding its catalogue and '
          + 'would like the machine to itself while it does',
      },
    }],
  },

  /*
   * -- and the margin, which is what a window actually costs ---------------
   *
   * The four above moved the first unbuildable week from 564 to 572 and no
   * further, which was the answer to a question worth asking out loud: the
   * shortage was never one column, it was MARGIN. A window of one means every
   * consecutive pair of weeks has to be built out of two disjoint halves of the
   * pool, and a pool only twice the size of a week has no room for the draw to
   * be unlucky about which half it took. Roughly two and a half to three times
   * a week's draw is what stops that being a matter of luck.
   *
   * Everything below is deliberately NOT a ticket. Minutes that are not an
   * arrival are the cheapest margin this shop has - they cost no queue row, no
   * conversation and no article - and they are the ones the budget actually
   * wants, because the count term means the step from six arrivals to seven
   * overshoots a load-3 day's band entirely. This is the shape of the bill for
   * the next window, and it is a much smaller bill than "fifty more tickets".
   */
  {
    interruptions: [{
      id: 'machine:pool-index-rebuild',
      source: 'machine',
      minute: 625,
      minutes: 6,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5],
      flavor: {
        [FLAVOR.subject]: 'The Indexing Service is rebuilding its catalogue '
          + 'and has said so in a window on top of everything else',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-mapi-repair',
      source: 'machine',
      minute: 670,
      minutes: 9,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [10, 5],
      flavor: {
        [FLAVOR.subject]: 'The mail client is repairing its local folders and '
          + 'will not be interrupted',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-cert-store',
      source: 'machine',
      minute: 715,
      minutes: 5,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5],
      flavor: {
        [FLAVOR.subject]: 'A certificate in the machine store expires in '
          + 'thirty days, according to a box that will say so daily',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-disk-check',
      source: 'machine',
      minute: 780,
      minutes: 8,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [8, 4],
      flavor: {
        [FLAVOR.subject]: 'A scheduled surface scan has started on drive C: '
          + 'and would rather you did not type',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-policy-refresh',
      source: 'machine',
      minute: 830,
      minutes: 6,
      relatedTicket: null,
      declinable: false,
      severity: 2,
      postpones: [5, 2],
      flavor: {
        [FLAVOR.subject]: 'Group policy is refreshing and the desktop has gone '
          + 'grey while it thinks about it',
      },
    }],
  },
  {
    interruptions: [{
      id: 'machine:pool-inventory-agent',
      source: 'machine',
      minute: 890,
      minutes: 7,
      relatedTicket: null,
      declinable: false,
      severity: 1,
      postpones: [5],
      flavor: {
        [FLAVOR.subject]: 'The inventory agent is counting what is installed '
          + 'on this machine, in the foreground, for some reason',
      },
    }],
  },
  {
    afterHours: [{
      id: 'after:pool-hilda-forklift',
      speaker: 'person:hilda',
      subject: 'The scanner in the yard has stopped talking to the system '
        + 'again. Not tonight - I am going home. Tomorrow.',
      declinable: true,
    }],
  },
  {
    afterHours: [{
      id: 'after:pool-priya-statements',
      speaker: 'person:priya',
      subject: 'Did the statements run? I can log in and look if you would '
        + 'rather not, I just do not want to find out on Monday.',
      declinable: true,
    }],
  },
  {
    channels: [{
      id: 'hub:pool-parking',
      channel: 'chan:announcements',
      author: 'person:vic',
      body: 'The bay by the fire door is not a bay. It has never been a bay. '
        + 'There is a line painted on it because it is where the lorry turns.',
      minute: 9 * 60 + 35,
    }],
  },
  {
    channels: [{
      id: 'hub:pool-printer-etiquette',
      channel: 'chan:helpdesk',
      author: 'person:bev',
      body: 'If your job does not come out, please do not press print four '
        + 'more times. They are all in there. They all come out at once. It is '
        + 'always the same four people and they know who they are.',
      minute: 11 * 60 + 15,
    }],
  },
  {
    channels: [{
      id: 'hub:pool-fire-drill',
      channel: 'chan:announcements',
      author: 'person:vic',
      body: 'Fire alarm test tomorrow at eleven. It is a test. Nobody needs to '
        + 'leave, and nobody needs to ring the desk about it, which is what '
        + 'happened last time and the time before that.',
      minute: 13 * 60 + 5,
    }],
  },
  {
    channels: [{
      id: 'hub:pool-biscuits',
      channel: 'chan:water-cooler',
      author: 'person:marcus',
      body: 'Somebody has taken the tin and left the lid. I am not accusing '
        + 'anybody. I am simply noting that the lid is here and the tin is not.',
      minute: 14 * 60 + 40,
    }],
  },

  /* -- and the room nobody needed ----------------------------------------- */

  {
    channels: [{
      id: 'hub:pool-kettle',
      channel: 'chan:water-cooler',
      author: 'person:bev',
      body: 'The kettle in the second-floor kitchen has been descaled. It '
        + 'will taste strange for a day and then it will taste correct. '
        + 'Please do not descale it again.',
      minute: 9 * 60 + 55,
    }],
  },
];
