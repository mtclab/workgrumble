/**
 * Pool tickets for one shop (E11, 0.34.0 slice 2) - the surplus the exclusion
 * window needs, in the queue's own shape.
 *
 * Each one is self-contained: no arc, no chain, no beat. It lands on estate the
 * shop already has and closes through verbs the registry already holds, and the
 * day it is dealt on is the sampler's business rather than a table's.
 *
 * WHAT THIS SHOP'S SURPLUS IS MADE OF, and why it looks repetitive on the page.
 * Workgrumble Ltd is a 1998 Windows office: every box on the estate runs the
 * same twenty-odd baseline services, every account is in the same directory,
 * and everything in the building prints through one machine. A pool that
 * pretended otherwise - twenty exotic faults on an estate with fourteen boxes -
 * would be a different company. So six of these are a service that has stopped
 * or been disabled on six different boxes, and each one teaches a different
 * service: the local spooler is one desk's printing, Workstation is every
 * mapped drive on a box, Computer Browser is what fills Network Neighbourhood,
 * Task Scheduler is everything anybody set to run overnight, the Time Service
 * is the whole domain's logons, and TCP/IP Print Server is the one thing on the
 * print server that only the old system uses. That is not one ticket six times;
 * it is the estate, read six ways.
 *
 * EIGHT OF THEM ARE THE JOB'S OWN TEXTURE and they are deliberately short: a
 * lockout, an expired password, a flat battery, a screen somebody turned over,
 * a printer at the wall, a queue, a restart, a drive nobody was ever added to.
 * They get two or three sentences, one step, an article that already exists and
 * a small conversation, because padding a flat battery into a set-piece is a
 * worse lie about this job than the repetition is.
 *
 * The priority gap points BOTH ways on purpose. Some of these are shouted about
 * and trivial (a mouse, a sideways screen); some are filed as an afterthought
 * and are the worst thing on the estate that morning (a workstation that has
 * been unpatched since somebody disabled its update service, a portal
 * certificate that expired over a weekend). A trap that always points the same
 * way is not a trap, it is a rule.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { STARTUP_PARAM } from '../actions/legendary';
import { COMPANY_IDS, machineHostname } from '../company';
import { VERIFICATION_METHODS } from '../fallout';
import {
  FIELDS,
  LOCKOUT_THRESHOLD,
  SERVICE_STATUS,
  STARTUP_TYPES,
} from '../fields';
import {
  fsEntryId,
  myDocumentsDirId,
  TEMP_SEGMENTS,
  tempDirId,
} from '../filesystem';
import { stampAt } from '../hours';
import { encodeSpoolJob } from '../listings';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { baselineServiceId } from '../services';
import type { WorldTicket } from './types';

/* -- the baseline services these tickets are about ------------------------ */

/**
 * Named here rather than spelled at each use, because every one of them is a
 * service the ESTATE already runs on a box the estate already has: the pool
 * invents no machinery, and the ids are built by the same function the company
 * seed builds them with, so a ticket cannot name a service the box does not
 * carry.
 */
const SALES_SPOOLER = baselineServiceId(COMPANY_IDS.adaMachine, 'Spooler');
const PAYROLL_TIME = baselineServiceId(COMPANY_IDS.garyMachine, 'W32Time');
const PRINT_LPD = baselineServiceId(COMPANY_IDS.printServer, 'LPDSVC');
const ACCTS_UPDATES = baselineServiceId(COMPANY_IDS.priyaMachine, 'wuauserv');
const ACCTS_SMB = baselineServiceId(
  COMPANY_IDS.priyaMachine,
  'LanmanWorkstation',
);
const PORTAL_WEB = baselineServiceId(COMPANY_IDS.intranetServer, 'W3SVC');
const ACCTS3_BROWSER = baselineServiceId(COMPANY_IDS.marcusMachine, 'Browser');
const WHOUSE_SCHEDULE = baselineServiceId(
  COMPANY_IDS.warehouseMachine,
  'Schedule',
);

/* -- 1. the restart nobody does, again ------------------------------------ */

/**
 * The mundane one, kept mundane. Sales-02 has been staging updates for a
 * fortnight and the person at it has been pressing the other button, which is
 * the correct answer several days running and is how a machine ends up behind.
 */
export const POOL_SALES_RESTART: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.adaMachine],
  claimed_urgency: 1,
  true_urgency: 1,
  def: {
    id: 'ticket:pool-sales-restart',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Box about restarting - can somebody make it go away',
      body:
        'Ada has a dialog that says the updates are downloaded and it needs to '
        + 'restart to finish. She has read it, she does not disagree with it, '
        + 'and she has pressed Later every morning since the week before last '
        + 'because she is on the phone every morning since the week before '
        + 'last. She is free between twelve and half past.',
    },
    reporter: COMPANY_IDS.ada,
    // Re-asserted rather than assumed, exactly as Gary's restart is: a machine
    // somebody rebooted earlier in the week for another reason would otherwise
    // deal this ticket already resolved, which is a free point that looks like
    // content working.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.adaMachine,
        field: FIELDS.pendingUpdates,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.adaMachine },
      field: FIELDS.pendingUpdates,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-restart-nobody-does',
  },
  cause: 'Updates were staged a fortnight ago and are waiting for the machine '
    + 'to go round once. Nothing else is wrong with SALES-02 and nothing else '
    + 'will be.',
  dialogue_ref: 'dialogue/sales',
  paths: [
    {
      id: 'pool-remote-restart-sales-02',
      app: 'remote',
      label: 'Restart SALES-02 from Remote Assist, between twelve and half past',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineReboot,
          target: COMPANY_IDS.adaMachine,
        },
      ],
    },
  ],
};

/* -- 2. one desk cannot print, and it is that desk ------------------------ */

export const POOL_SALES_SPOOLER: WorldTicket = {
  arrival: 'drip',
  nodes: [SALES_SPOOLER, COMPANY_IDS.adaMachine],
  // She has reported it as the print server, because she has watched somebody
  // else print and concluded the building is broken in her direction. It is
  // one desk, and the desk is hers.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-sales-spooler',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The print server is down (for me)',
      body:
        'Ada reports that nothing she prints arrives and that the print server '
        + 'must therefore be down. She has watched Kwame print the same '
        + 'document from the next desk, on the same printer, and considers '
        + 'that a separate and rather suspicious matter. Her jobs vanish '
        + 'without an error of any kind.',
    },
    reporter: COMPANY_IDS.ada,
    setup: [
      {
        op: 'setField',
        id: SALES_SPOOLER,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: SALES_SPOOLER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Print Spooler service on SALES-02 is stopped. A job printed from '
    + 'that machine is handed to the spooler on that machine before it goes '
    + 'anywhere, so it never leaves the desk, and nothing on the print server '
    + 'ever hears about it.',
  dialogue_ref: 'dialogue/sales',
  paths: [
    {
      id: 'pool-restart-sales-spooler',
      app: 'cmd',
      label: 'Start the Print Spooler service on SALES-02',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: SALES_SPOOLER,
        },
      ],
    },
  ],
};

/* -- 3. the clock -------------------------------------------------------- */

export const POOL_PAYROLL_CLOCK: WorldTicket = {
  arrival: 'drip',
  nodes: [PAYROLL_TIME, COMPANY_IDS.garyMachine, COMPANY_IDS.domainController],
  // He has ticked the middle box because he assumes it is him. It is the
  // domain refusing a machine, and payroll is on that machine.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-payroll-clock',
    archetype: 'hidden_cause',
    flavor: {
      title: 'It keeps throwing me out and the timesheet says I was early',
      body:
        'Gary is being signed out of things he has only just signed into, and '
        + 'the timesheet portal has recorded him as arriving at twenty past '
        + 'seven, which he would like to correct on the record. He has also '
        + 'noticed that the clock in the corner of his screen disagrees with '
        + 'the clock on the wall, and has been setting it back by hand every '
        + 'few days without mentioning it to anybody.',
    },
    reporter: COMPANY_IDS.gary,
    setup: [
      {
        op: 'setField',
        id: PAYROLL_TIME,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PAYROLL_TIME },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/the-clock-is-the-fault',
  },
  cause: 'The Time Service on PAYROLL-04 is stopped, so nothing has been '
    + 'correcting that machine against DC-01 and the clock on the board has '
    + 'drifted. The directory refuses a logon timestamped too far from its own '
    + 'time, which is what every one of his symptoms actually is.',
  dialogue_ref: 'dialogue/payroll',
  paths: [
    {
      id: 'pool-restart-payroll-time',
      app: 'cmd',
      label: 'Start the Time Service on PAYROLL-04 and let it pull the clock '
        + 'back to the domain',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: PAYROLL_TIME,
        },
      ],
    },
  ],
};

/* -- 4. the drive he has never been on ------------------------------------ */

export const POOL_PAYROLL_SHARE: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.garyAccount, COMPANY_IDS.commonShare],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-payroll-share',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Common drive says access is denied',
      body:
        'Gary has been asked to put the quarter\'s figures on the common drive '
        + 'like everybody else. The common drive says access is denied. He has '
        + 'been emailing them to people for eleven years and would be perfectly '
        + 'happy to carry on doing that.',
    },
    reporter: COMPANY_IDS.gary,
    // Nothing to break. Payroll was never put on the common drive, which is a
    // fact about the seed rather than about anything that has gone wrong -
    // the same honest shape every other access request in this world has.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.garyAccount },
      to: { id: COMPANY_IDS.commonShare },
      kind: 'has_access',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-share-nobody-granted',
  },
  cause: 'Nobody has ever put his account on the common drive. It is not a '
    + 'fault and nothing has changed: payroll kept its own figures on its own '
    + 'machine, so the grant was never needed and was therefore never made.',
  dialogue_ref: 'dialogue/payroll',
  paths: [
    {
      id: 'pool-grant-common-drive',
      app: 'cmd',
      label: 'Put gpoole on the common drive\'s access list',
      steps: [
        {
          action: HELPDESK_ACTIONS.shareGrantAccess,
          target: COMPANY_IDS.commonShare,
          params: { account: COMPANY_IDS.garyAccount },
        },
      ],
    },
  ],
};

/* -- 5. the printer at the wall ------------------------------------------- */

export const POOL_HERCULES_DEAD: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.printer, COMPANY_IDS.printServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-hercules-dead',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Hercules is completely dead - no lights, nothing',
      body:
        'Nina reports that the Hercules has no lights on it at all. Not '
        + 'flashing, not humming: dead, the way a thing is dead when it is not '
        + 'plugged into anything. The whole floor prints through it and the '
        + 'whole floor has already been told.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.printer,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.printer },
      field: FIELDS.powered,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/power-cycle',
  },
  cause: 'The printer is off at the switch on the back of it, which is the '
    + 'switch nobody looks at because nobody has ever touched it on purpose.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'pool-power-cycle-hercules',
      app: 'remote',
      label: 'Power the Hercules back up from the hardware panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.devicePowerCycle,
          target: COMPANY_IDS.printer,
        },
      ],
    },
  ],
};

/* -- 6. the one service on the print server only one system uses ---------- */

export const POOL_DESPATCH_LPD: WorldTicket = {
  arrival: 'drip',
  nodes: [PRINT_LPD, COMPANY_IDS.printServer, COMPANY_IDS.printer],
  // She has said medium because everybody else is printing fine and she has
  // learned what happens to a ticket that says high about something only
  // logistics can see. It is every delivery note the depot gets.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-despatch-lpd',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Delivery notes out of the old system are not coming out',
      body:
        'Nina reports that everything she prints out of Windows is fine and '
        + 'everything the old delivery system prints is not. No error, no '
        + 'queue, nothing in the pending list - the notes simply do not '
        + 'appear. She has printed the same note out of Windows to prove the '
        + 'printer works, which it does, which she says makes it worse.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: PRINT_LPD,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PRINT_LPD },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The TCP/IP Print Server service on PRINT-01 is stopped. Windows '
    + 'machines hand their jobs to the spooler directly and are unaffected; '
    + 'the old delivery system is not a Windows machine and prints the only '
    + 'way it knows, which is to that service, which is not listening.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'pool-restart-lpd',
      app: 'cmd',
      label: 'Start the TCP/IP Print Server service on PRINT-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: PRINT_LPD,
        },
      ],
    },
  ],
};

/* -- 7. the lockout, and the light that has never worked ------------------ */

export const POOL_RECEPTION_LOCKED: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.bevAccount],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-reception-locked',
    archetype: 'read_the_screen',
    flavor: {
      title: 'It will not take my password and there are people in reception',
      body:
        'Bev cannot get in. She has typed the same password she has typed '
        + 'since March, several times, with increasing conviction, and the box '
        + 'has said no to all of them. There are two visitors standing in front '
        + 'of her and the sign-in book is in a drawer she needs the computer to '
        + 'know she is allowed to open.',
    },
    reporter: COMPANY_IDS.bev,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.bevAccount,
        field: FIELDS.badPwCount,
        value: LOCKOUT_THRESHOLD,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.bevAccount,
        field: FIELDS.lockedSince,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.bevAccount,
        field: FIELDS.locked,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.bevAccount },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/account-lockout',
  },
  cause: 'The lockout counter tripped after five attempts, all of them typed '
    + 'in capitals, on the reception keyboard whose Caps Lock light stopped '
    + 'working before the merger.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'pool-unlock-btannock',
      app: 'directory',
      label: 'Unlock btannock in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountUnlock,
          target: COMPANY_IDS.bevAccount,
        },
      ],
    },
  ],
};

/* -- 8. the restart that takes the building with it ----------------------- */

/**
 * The deadline class, in the shape this estate is built for.
 *
 * Nothing is broken. PRINT-01 has been asking to restart since September, the
 * badges will not print until it does, and the auditors are in at two - so a
 * thing that has been ignorable for four months has to be done inside the next
 * two hours, on the one box in the building that also carries the VPN. Both
 * halves are true at once, and the article the estate actually has for this box
 * is a draft whose second step is wrong, which is the other half of the joke.
 */
export const POOL_RECEPTION_BADGES: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.printServer, COMPANY_IDS.printer, COMPANY_IDS.vpn],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-reception-badges',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'Visitor badges will not print and the auditors are in at two',
      body:
        'Bev cannot print the visitor badges. The badge template has not '
        + 'printed since the autumn, she has been writing them out by hand '
        + 'since the autumn, and the auditors arriving at two are the first '
        + 'visitors in four months who will look at one. The print server has '
        + 'been asking to restart to finish installing updates since September.',
    },
    reporter: COMPANY_IDS.bev,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.printServer,
        field: FIELDS.pendingUpdates,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.printServer },
      field: FIELDS.pendingUpdates,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/vpn-on-the-print-server',
  },
  cause: 'PRINT-01 has been carrying staged updates since September and the '
    + 'badge template is one of the things waiting on them. The restart is two '
    + 'minutes; what makes it a decision is that the same box carries the VPN, '
    + 'so doing it now takes the depot off the network for those two minutes '
    + 'and doing it at one o\'clock does not.',
  dialogue_ref: 'dialogue/reception',
  paths: [
    {
      id: 'pool-restart-print-01',
      app: 'remote',
      label: 'Restart PRINT-01, having told the depot which two minutes it is',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineReboot,
          target: COMPANY_IDS.printServer,
        },
      ],
    },
  ],
};

/* -- 9. the despatch queue ------------------------------------------------ */

/**
 * What the despatch printer was holding when the late shift gave up on it.
 *
 * The big one is FIRST because the front of a queue is the oldest thing in it,
 * and the whole diagnosis is that the thing at the front is not a delivery
 * note: eleven jobs of exactly the same size behind one that is eighty times
 * bigger is a listing that says what happened without anybody being asked.
 */
const AJAX_JOB_BYTES: readonly number[] = [
  512_000,
  6_144, 6_144, 6_144, 6_144, 6_144, 6_144, 6_144, 6_144, 6_144, 6_144, 6_144,
];

/** The minute the thing at the front went on, which is before he sat down. */
const AJAX_FIRST_JOB_MINUTE = 6 * 60 + 4;

/**
 * The queue as the world holds it, one job every three minutes from just after
 * six. Written off the table above so the count and the listing cannot be
 * edited apart - the two are asserted to agree after every step of every
 * advertised path in the game, and a number that said twelve over a directory
 * holding eleven would be the world arguing with itself.
 */
function ajaxSpoolJobs(): string {
  return AJAX_JOB_BYTES.map(
    (bytes, index) => encodeSpoolJob({
      bytes,
      modified: stampAt(1, AJAX_FIRST_JOB_MINUTE + index * 3),
    }),
  ).join('\n');
}

export const POOL_DESPATCH_QUEUE: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.warehousePrinter, COMPANY_IDS.warehousePrintServer],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-despatch-queue',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Ajax has twelve things queued and is printing none of them',
      body:
        'Owen reports the despatch printer sitting with a stack of jobs on it '
        + 'and nothing coming out. He has read the queue out over the phone: '
        + 'eleven delivery notes, all the same size, and one thing at the front '
        + 'of it that is five hundred kilobytes and is not a delivery note.',
    },
    reporter: COMPANY_IDS.owen,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.queueLen,
        value: AJAX_JOB_BYTES.length,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.spoolJobs,
        value: ajaxSpoolJobs(),
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.warehousePrinter },
      field: FIELDS.queueLen,
      value: 0,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/print-spooler',
  },
  cause: 'Somebody sent a spreadsheet to the despatch printer at four minutes '
    + 'past six. It is at the front of the queue, the Ajax has been chewing on '
    + 'page one of it ever since, and the eleven delivery notes behind it are '
    + 'waiting their turn politely.',
  dialogue_ref: 'dialogue/late-shift',
  paths: [
    {
      id: 'pool-clear-ajax-queue',
      app: 'cmd',
      // Nothing on this estate feeds the Ajax, so there is no spooler to stop
      // first: the whole of the fix is dropping the jobs, and the notes behind
      // it are re-sent by the people who sent them.
      label: 'Empty the queue on the Ajax and tell despatch to send the notes '
        + 'again',
      steps: [
        {
          action: HELPDESK_ACTIONS.printerClearQueue,
          target: COMPANY_IDS.warehousePrinter,
        },
      ],
    },
  ],
};

/* -- 10. the password that expired at six in the morning ------------------ */

export const POOL_DESPATCH_EXPIRED: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.owenAccount],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-despatch-expired',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Message about my password at six this morning',
      body:
        'Owen has written down what the box said, because he has learned that '
        + 'is the useful thing to do: "Your password has expired. Click '
        + 'Continue to change it." He clicked Continue, was asked for the old '
        + 'password and two copies of a new one, and got as far as discovering '
        + 'that the new one has to be different from the old one.',
    },
    reporter: COMPANY_IDS.owen,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.owenAccount,
        field: FIELDS.passwordExpired,
        value: true,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.owenAccount,
        field: FIELDS.pwMustChange,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.owenAccount },
      field: FIELDS.passwordExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'The password policy expired his credential overnight. The account is '
    + 'not locked and not disabled: it is out of date, which is the third of '
    + 'the three and the only one a reset is the answer to.',
  dialogue_ref: 'dialogue/late-shift',
  paths: [
    {
      id: 'pool-reset-opryce',
      app: 'directory',
      label: 'Reset opryce in Active Dictionary and tell him what it will ask '
        + 'him next',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountResetPassword,
          target: COMPANY_IDS.owenAccount,
        },
      ],
    },
  ],
};

/* -- 11. the leaver who is still here ------------------------------------- */

export const POOL_FACILITIES_DISABLED: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.vicAccount],
  // He has ticked the top box, and for once the top box and the truth are
  // arguing rather than agreeing: it is one man, and the one man holds the
  // keys to the plant room.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-facilities-disabled',
    archetype: 'read_the_screen',
    flavor: {
      title: 'The computer says I do not work here',
      body:
        'Vic has read the message out and written it down: "Your account has '
        + 'been disabled. Please see your system administrator." He would like '
        + 'somebody to establish whether he still works here before he goes and '
        + 'unlocks the second floor, because if he does not, he would rather '
        + 'not have the keys.',
    },
    reporter: COMPANY_IDS.vic,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.vicAccount,
        field: FIELDS.enabled,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.vicAccount },
      field: FIELDS.enabled,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'Facilities came off the staff payroll and onto a contract at the end '
    + 'of the quarter, and the leavers run reads the payroll list. It did '
    + 'exactly what it is written to do to somebody who is still in the '
    + 'building five days a week.',
  dialogue_ref: 'dialogue/facilities',
  paths: [
    {
      id: 'pool-enable-vndlovu',
      app: 'directory',
      label: 'Switch vndlovu back on in Active Dictionary',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountEnable,
          target: COMPANY_IDS.vicAccount,
        },
      ],
    },
  ],
};

/* -- 12. disabled, which is not stopped ----------------------------------- */

/**
 * The two-step, and both steps are load-bearing in a way the player can feel.
 *
 * Starting a disabled service is refused and the refusal says why; setting the
 * startup type on its own changes what happens at the next boot and nothing at
 * all about this morning. So the fix is one decision about the future and one
 * about now, which is the whole of what a startup type is.
 */
export const POOL_ACCOUNTS_UPDATES: WorldTicket = {
  arrival: 'drip',
  nodes: [ACCTS_UPDATES, COMPANY_IDS.priyaMachine],
  // She has filed it as the lowest thing on the list, because from her chair
  // it is a message she can dismiss. It is the accounts payable workstation,
  // and it has not taken a patch since somebody read a magazine.
  claimed_urgency: 1,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-accounts-updates',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Little shield thing in the corner, probably nothing',
      body:
        'Priya mentions, at the end of a call about something else, that the '
        + 'update icon on ACCTS-01 has a cross through it and has had for as '
        + 'long as she can remember. She says the machine is otherwise '
        + 'perfectly happy and she does not want to make a fuss about an icon.',
    },
    reporter: COMPANY_IDS.priya,
    setup: [
      {
        op: 'setField',
        id: ACCTS_UPDATES,
        field: FIELDS.startupType,
        value: STARTUP_TYPES.disabled,
      },
      {
        op: 'setField',
        id: ACCTS_UPDATES,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ACCTS_UPDATES },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/disabled-is-not-stopped',
  },
  cause: 'Automatic Updates on ACCTS-01 is set to Disabled, so nothing has '
    + 'started it since whoever set it that way - and nothing ever will, '
    + 'including a reboot. The machine has been quietly out of date for as '
    + 'long as the icon has had a cross through it.',
  dialogue_ref: 'dialogue/accounts-payable',
  paths: [
    {
      id: 'pool-enable-then-start-updates',
      app: 'cmd',
      label: 'Set Automatic Updates back to Automatic (Delayed Start) on '
        + 'ACCTS-01, then start it',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceSetStartup,
          target: ACCTS_UPDATES,
          // Delayed rather than plain Automatic, because delayed is what the
          // update service is set to on every other box in this building and a
          // fix that leaves one machine different is a fix somebody has to
          // explain in six months.
          params: { [STARTUP_PARAM]: STARTUP_TYPES.delayed },
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ACCTS_UPDATES,
        },
      ],
    },
  ],
};

/* -- 13. every drive on the box, at once ---------------------------------- */

export const POOL_ACCOUNTS_DRIVES: WorldTicket = {
  arrival: 'drip',
  nodes: [ACCTS_SMB, COMPANY_IDS.priyaMachine, COMPANY_IDS.fileServer],
  // She says the file server is down, because from ACCTS-01 that is precisely
  // what it looks like. The file server is serving everybody else.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-accounts-drives',
    archetype: 'read_the_screen',
    flavor: {
      title: 'All my drives have red crosses on them',
      body:
        'Priya has three mapped drives and all three have gone at once. She '
        + 'has double-clicked each of them and written down what came back: '
        + '"The network path was not found." She points out that all three are '
        + 'on different servers, which she thinks makes it worse and which '
        + 'actually makes it simpler.',
    },
    reporter: COMPANY_IDS.priya,
    setup: [
      {
        op: 'setField',
        id: ACCTS_SMB,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ACCTS_SMB },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Workstation service on ACCTS-01 is stopped. That service IS the '
    + 'machine\'s ability to reach a network share at all, so every mapped '
    + 'drive on it fails in the same second and every server it names is fine.',
  dialogue_ref: 'dialogue/accounts-payable',
  paths: [
    {
      id: 'pool-restart-accts-workstation',
      app: 'cmd',
      label: 'Start the Workstation service on ACCTS-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ACCTS_SMB,
        },
      ],
    },
  ],
};

/* -- 14. the screen the other way up -------------------------------------- */

export const POOL_ESTIMATING_ROTATED: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.terryMachine],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:pool-estimating-rotated',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Everything is upside down',
      body:
        'Terry cleaned his keyboard this morning, which he would like noted as '
        + 'a thing he did for the good of the department, and his screen is now '
        + 'upside down. He has not touched anything since and is describing it '
        + 'to you while reading it upside down.',
    },
    reporter: COMPANY_IDS.terry,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.terryMachine,
        field: FIELDS.displayRotation,
        value: 180,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.terryMachine },
      field: FIELDS.displayRotation,
      value: 0,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/display-rotation',
  },
  cause: 'A wipe across a keyboard is Control, Alt and an arrow key held down '
    + 'together for as long as it takes to wipe a keyboard. The screen did '
    + 'exactly what that means.',
  dialogue_ref: 'dialogue/estimating',
  paths: [
    {
      id: 'pool-rotate-est-03',
      app: 'remote',
      label: 'Put EST-03 back to nought degrees',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineSetDisplayRotation,
          target: COMPANY_IDS.terryMachine,
          params: { rotation: 0 },
        },
      ],
    },
  ],
};

/* -- 15. the tender, and where the mail client put it --------------------- */

/** What he called it, which is not what the mail client called anywhere. */
const TENDER = 'DENBY2.XLS';

const EST_TEMP = tempDirId(COMPANY_IDS.terryMachine);
const EST_DOCUMENTS = myDocumentsDirId(COMPANY_IDS.terryMachine, 'tblunt');
export const LOST_TENDER = fsEntryId(
  COMPANY_IDS.terryMachine,
  [...TEMP_SEGMENTS, TENDER],
  'file',
);

/**
 * In the file itself, so a tech can prove it is the right one before moving
 * anything, and so the deadline on the ticket is a real deadline rather than a
 * number somebody typed in a flavour line.
 */
const TENDER_TEXT = [
  'DENBY - REVISED TENDER  (rev 2, this one)',
  '',
  'GROUNDWORKS        14,200.00',
  'STEEL              38,750.00   was 41,100 - Hallam matched it 11/09',
  'CLADDING           22,480.00',
  'M+E                31,900.00   PROV - waiting on Kerrigan',
  'PRELIMS             8,640.00',
  '',
  'TB: steel is the only reason we are within a mile of them.',
  'TB: rev 1 has the old steel figure in it. DO NOT SEND REV 1.',
].join('\n');

export const POOL_ESTIMATING_TENDER: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.terryMachine, COMPANY_IDS.terryAccount],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-estimating-tender',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'Denby tender has gone and it goes at four',
      body:
        'Terry has spent three days on the revised Denby tender and it is not '
        + 'in his documents. It goes to the client at four. The version that '
        + 'IS in his documents is last week\'s, with the steel figure they '
        + 'have already been beaten on, and he says he would rather send '
        + 'nothing than send that.',
    },
    reporter: COMPANY_IDS.terry,
    // The fault, as it actually happened: the mail client wrote the attachment
    // somewhere to open it, and every Save since has gone back to the copy it
    // opened. Built by the ticket rather than seeded, because a file dated
    // three days ago cannot be in a world that starts on Monday morning.
    setup: [
      {
        op: 'addNode',
        node: {
          id: LOST_TENDER,
          kind: 'file',
          fields: {
            [FIELDS.name]: TENDER,
            [FIELDS.modified]: '11/09/1998  17:04',
            [FIELDS.volume]: machineHostname(COMPANY_IDS.terryMachine),
            [FIELDS.content]: TENDER_TEXT,
          },
        },
      },
      {
        op: 'addEdge',
        edge: { from: EST_TEMP, to: LOST_TENDER, kind: 'contains' },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: EST_DOCUMENTS },
      to: { id: LOST_TENDER },
      kind: 'contains',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/saved-into-temp',
  },
  cause: 'The quantity surveyor mailed him rev 2 and he has worked in it out '
    + 'of the mail ever since. The mail client wrote it into C:\\WINDOWS\\TEMP '
    + 'to open it, and Save has gone back there every time. Nothing is lost, '
    + 'nothing is broken, and the machine would have thrown it away at the '
    + 'next clear-out without mentioning it to anybody.',
  dialogue_ref: 'dialogue/estimating',
  paths: [
    {
      id: 'pool-move-tender-out-of-temp',
      app: 'cmd',
      label: 'Move rev 2 out of TEMP into his own documents, and read the top '
        + 'of it back to him before he sends it',
      steps: [
        {
          action: HELPDESK_ACTIONS.fileMove,
          target: LOST_TENDER,
          params: { from: EST_TEMP, to: EST_DOCUMENTS },
        },
      ],
    },
  ],
};

/* -- 16. the certificate that expired over a weekend ---------------------- */

export const POOL_PORTAL_CERT: WorldTicket = {
  arrival: 'drip',
  nodes: [PORTAL_WEB, COMPANY_IDS.intranetServer],
  // He has filed it low because he assumes everybody else has already said
  // something. Nobody has, because everybody else assumed the same thing, and
  // the timesheets are due on Friday.
  claimed_urgency: 1,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-portal-cert',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Timesheet site is throwing a warning at everybody',
      body:
        'Marcus reports a warning page in front of the timesheet portal saying '
        + 'the site cannot be trusted. He has clicked through it, because '
        + 'everybody clicks through it, and would like somebody to know that '
        + 'the whole of Accounts has now been trained to click through a '
        + 'security warning to fill in a timesheet.',
    },
    reporter: COMPANY_IDS.marcus,
    setup: [
      {
        op: 'setField',
        id: PORTAL_WEB,
        field: FIELDS.certExpired,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: PORTAL_WEB },
      field: FIELDS.certExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/expired-certificate',
  },
  cause: 'The certificate on the intranet site expired on a Sunday. Nothing '
    + 'broke, nothing crashed and nothing sent anybody a warning beforehand - '
    + 'a certificate has a date on it, the date passed, and every browser in '
    + 'the building started saying so at nine on Monday.',
  dialogue_ref: 'dialogue/accounts',
  paths: [
    {
      id: 'pool-renew-portal-cert',
      app: 'cmd',
      label: 'Issue a new certificate for the portal on INTRA-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRenewCertificate,
          target: PORTAL_WEB,
        },
      ],
    },
  ],
};

/* -- 17. the empty network neighbourhood ---------------------------------- */

export const POOL_ACCOUNTS_BROWSE: WorldTicket = {
  arrival: 'drip',
  nodes: [ACCTS3_BROWSER, COMPANY_IDS.marcusMachine],
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: 'ticket:pool-accounts-browse',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Network Neighbourhood is empty - has the network gone',
      body:
        'Marcus opened Network Neighbourhood to find a machine whose name he '
        + 'half remembers and it is empty. Not an error: empty. His mail is '
        + 'fine, his drives are fine and he can print, all of which he offers '
        + 'as evidence that something serious has happened to the network.',
    },
    reporter: COMPANY_IDS.marcus,
    setup: [
      {
        op: 'setField',
        id: ACCTS3_BROWSER,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: ACCTS3_BROWSER },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Computer Browser service on ACCTS-03 is stopped. That service is '
    + 'the only thing that collects the list of machines Network Neighbourhood '
    + 'draws, so the list is empty - and everything that reaches a machine by '
    + 'name rather than by browsing carries on working perfectly.',
  dialogue_ref: 'dialogue/accounts',
  paths: [
    {
      id: 'pool-restart-browser',
      app: 'cmd',
      label: 'Start the Computer Browser service on ACCTS-03',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: ACCTS3_BROWSER,
        },
      ],
    },
  ],
};

/* -- 18. the job that has not run since somebody stopped the scheduler ---- */

export const POOL_WAREHOUSE_SCHEDULE: WorldTicket = {
  arrival: 'morning',
  nodes: [WHOUSE_SCHEDULE, COMPANY_IDS.warehouseMachine],
  // She has said low because she has no idea what it is and it has not stopped
  // her doing anything. Head office has not had a pallet figure for a month.
  claimed_urgency: 1,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-warehouse-schedule',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Head office says they have not had the pallet file',
      body:
        'Hilda has been rung by somebody at head office who wants last month\'s '
        + 'pallet export and has been waiting for it since the first. She has '
        + 'never sent it in her life - the machine in the corner sends it at '
        + 'midnight and always has - and she would like to know why she is '
        + 'the one being rung about it.',
    },
    reporter: COMPANY_IDS.hilda,
    setup: [
      {
        op: 'setField',
        id: WHOUSE_SCHEDULE,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: WHOUSE_SCHEDULE },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Task Scheduler service on WHOUSE-01 is stopped. The pallet '
    + 'scanner does not run its own export - it asks the scheduler to run it '
    + 'monthly, and the scheduler has not been there to be asked. Nothing '
    + 'failed and nothing wrote an error, because nothing ever started.',
  dialogue_ref: 'dialogue/warehouse',
  paths: [
    {
      id: 'pool-restart-whouse-scheduler',
      app: 'cmd',
      label: 'Start the Task Scheduler service on WHOUSE-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: WHOUSE_SCHEDULE,
        },
      ],
    },
  ],
};

/* -- 19. a flat battery, kept to the size of a flat battery --------------- */

export const POOL_WAREHOUSE_TABLET: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.warehouseTablet, COMPANY_IDS.warehouseMachine],
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: 'ticket:pool-warehouse-tablet',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Scanner in the cupboard has died',
      body:
        'Hilda reports the scanning tablet dark and unresponsive. The last '
        + 'thing on the screen, which she has written down, was a box about '
        + 'the battery being low. She read it, agreed with it, and put the '
        + 'tablet back in the cupboard.',
    },
    reporter: COMPANY_IDS.hilda,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehouseTablet,
        field: FIELDS.batteryPct,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.warehouseTablet,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.warehouseTablet },
      field: FIELDS.batteryPct,
      value: 100,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/reading-the-error',
  },
  cause: 'The battery is flat. The tablet said so, in a box, before it went '
    + 'dark.',
  dialogue_ref: 'dialogue/warehouse',
  paths: [
    {
      id: 'pool-replace-tablet-battery',
      app: 'remote',
      label: 'Put a battery in the scanning tablet from the hardware panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.deviceReplaceBattery,
          target: COMPANY_IDS.warehouseTablet,
        },
      ],
    },
  ],
};

/* -- 20. the second factor on a handset he has given back ----------------- */

export const POOL_SALES_NEW_MFA: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.kwameAccount, COMPANY_IDS.kwameMachine],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-sales-new-mfa',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The codes were on the agency phone and I have handed it back',
      body:
        'Kwame came through an agency for his first fortnight and has just '
        + 'been given a company handset. The authenticator was set up on the '
        + 'agency one, which he posted back on Friday in the envelope they '
        + 'provided, and he is apologising for this at some length.',
    },
    reporter: COMPANY_IDS.kwame,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.kwameAccount,
        field: FIELDS.mfaEnrolled,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.kwameAccount },
      field: FIELDS.mfaEnrolled,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/second-factor',
  },
  cause: 'The second factor was bound to a handset that is now in the post to '
    + 'an agency. Nothing is broken; the binding is simply not there any more, '
    + 'and only a new enrolment puts one back.',
  dialogue_ref: 'dialogue/sales-new-starter',
  paths: [
    {
      id: 'pool-verify-then-enrol-kwame',
      app: 'cmd',
      label: 'Prove who he is through a channel his account already has, then '
        + 'enrol the new handset with "mfa kboateng"',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountVerifyIdentity,
          target: COMPANY_IDS.kwameAccount,
          params: { method: VERIFICATION_METHODS.callback },
          // The enrolment closes this with or without the check, which is the
          // same trap the shipped one carries and the reason it is declared:
          // nothing in the system does the checking, and a new starter two
          // weeks in is exactly the voice nobody on this desk would recognise.
          optional_for_closure: true,
        },
        {
          action: HELPDESK_ACTIONS.accountRegisterMfa,
          target: COMPANY_IDS.kwameAccount,
        },
      ],
    },
  ],
};

/* -- the morning pile, and why there are six more of them ----------------- */

/**
 * Four that are waiting in the queue before nine, added after the first draw
 * was measured rather than guessed at.
 *
 * The exclusion window bars what last week dealt, so a shop needs enough of
 * every column to build two consecutive weeks out of different halves of its
 * pool. Every column here had room to spare except the morning pile: a day owes
 * at least one inherited ticket and there are five days, so a week costs five
 * of them, and eleven in the pool meant the second week was drawing from a
 * remainder of five or six with no room to be wrong about which days they were
 * allowed on. It composed for five hundred and sixty-three weeks and then found
 * the arrangement it could not make.
 *
 * That is a content shortage rather than a bug, and this is what paying it
 * looks like: four more of the queue somebody inherits at eight o'clock, spread
 * over the three people on this floor who had the least to say.
 */

/** Windows Audio on the finance new starter's box, and the Server service. */
const FIN_AUDIO = baselineServiceId(COMPANY_IDS.robMachine, 'Audiosrv');
const FILES_DFS = baselineServiceId(COMPANY_IDS.fileServer, 'Dfs');
const DC_NETLOGON = baselineServiceId(COMPANY_IDS.domainController, 'Netlogon');

/**
 * The mundane one, kept mundane: a service stopped, and a man too new to say
 * whether it was ever otherwise.
 */
export const POOL_FINANCE_SOUND: WorldTicket = {
  arrival: 'morning',
  nodes: [FIN_AUDIO, COMPANY_IDS.robMachine],
  claimed_urgency: 1,
  true_urgency: 1,
  def: {
    id: 'ticket:pool-finance-sound',
    archetype: 'read_the_screen',
    flavor: {
      title: 'No sound on FIN-02 - is that normal here?',
      body:
        'Rob has no sound at all and a red cross on the speaker in the '
        + 'corner. He is three weeks in and genuinely unsure whether this is a '
        + 'fault or simply how the machines are.',
    },
    reporter: COMPANY_IDS.rob,
    setup: [
      {
        op: 'setField',
        id: FIN_AUDIO,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: FIN_AUDIO },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'Windows Audio is stopped on FIN-02. The cross on the tray icon is '
    + 'the service being absent rather than a speaker or a lead being wrong.',
  dialogue_ref: 'dialogue/finance-new-starter',
  paths: [
    {
      id: 'pool-start-fin-audio',
      app: 'cmd',
      label: 'Start Windows Audio on FIN-02',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: FIN_AUDIO },
      ],
    },
  ],
};

/**
 * The drive letter that is not a drive, reported by the one person whose job
 * stops without it.
 *
 * Distributed File System is what turns one letter into the several folders
 * actually behind it. Stopped on the file server, the namespace answers nobody
 * and every mapped drive in the building fails at once - while the box itself
 * pings, logs anybody on at its own console and serves the folders perfectly
 * well to anyone who knows where they really live. Which is why it reads as the
 * network, and is not.
 */
export const POOL_LOGISTICS_SHARE: WorldTicket = {
  arrival: 'morning',
  nodes: [FILES_DFS, COMPANY_IDS.fileServer],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-logistics-share',
    archetype: 'hidden_cause',
    flavor: {
      title: 'The network is down - nobody can get at anything on FILES-01',
      body:
        'Nina got in at half seven and no mapped drive on the floor will '
        + 'open. She has established, before raising it, that the server is '
        + 'on, that she can ping it, and that the despatch notes she needs are '
        + 'on it. She has been doing this long enough to know that "the '
        + 'network is down" is not a diagnosis and has written it anyway, '
        + 'because it is what the floor is saying.',
    },
    reporter: COMPANY_IDS.nina,
    setup: [
      {
        op: 'setField',
        id: FILES_DFS,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: FILES_DFS },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'The Distributed File System service on FILES-01 is stopped, so the '
    + 'namespace the mapped drives resolve against answers nobody. The box is '
    + 'up, reachable and still serving the folders themselves - which is every '
    + 'mapped drive in the building failing for one reason nobody can see from '
    + 'a desk.',
  dialogue_ref: 'dialogue/logistics',
  paths: [
    {
      id: 'pool-start-files-dfs',
      app: 'cmd',
      label: 'Start Distributed File System on FILES-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: FILES_DFS },
      ],
    },
  ],
};

/**
 * The trust relationship, which is a sentence everybody has read and nobody has
 * been told the meaning of.
 */
export const POOL_MARKETING_TRUST: WorldTicket = {
  arrival: 'morning',
  nodes: [DC_NETLOGON, COMPANY_IDS.domainController],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:pool-marketing-trust',
    archetype: 'hidden_cause',
    flavor: {
      title: '"The trust relationship between this workstation and the '
        + 'primary domain failed"',
      body:
        'Dennis has photographed the message on his phone and attached it, '
        + 'which is more than most people do. He got in, could not log on, '
        + 'and borrowed the machine next to him - which let him on without '
        + 'complaint, so he has concluded the problem is his own machine and '
        + 'has apologised for it twice.',
    },
    reporter: COMPANY_IDS.dennis,
    setup: [
      {
        op: 'setField',
        id: DC_NETLOGON,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: DC_NETLOGON },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/the-service-that-stopped',
  },
  cause: 'Net Logon is stopped on DC-01. It is the service that maintains the '
    + 'secure channel a domain member authenticates over, so a machine that '
    + 'needs to re-establish it gets told the trust relationship failed while '
    + 'a machine holding a live one carries on as though nothing is wrong.',
  dialogue_ref: 'dialogue/marketing',
  paths: [
    {
      id: 'pool-start-netlogon',
      app: 'cmd',
      label: 'Start Net Logon on DC-01',
      steps: [
        { action: HELPDESK_ACTIONS.serviceRestart, target: DC_NETLOGON },
      ],
    },
  ],
};

/**
 * And the one that is nobody's machine at all: a starter who was set up in
 * every way but the one that matters to her on her first morning.
 */
export const POOL_HR_PRINT_GROUP: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.printUsers, COMPANY_IDS.printServer],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:pool-hr-print-group',
    archetype: 'read_the_screen',
    flavor: {
      title: 'New starter cannot print anything - everything else works',
      body:
        'Yolanda has a starter on the second floor who can log on, open her '
        + 'mail and reach the shared drives, and whose print jobs vanish '
        + 'without a message. Yolanda has checked the starter form twice and '
        + 'everything on it was done.',
    },
    reporter: COMPANY_IDS.yolanda,
    // Written the way every missing-permission ticket in this world writes it:
    // the access is absent when the ticket arrives, whatever the starter form
    // said, so the fault is real rather than "the absence of something nobody
    // recorded".
    setup: [
      {
        op: 'removeEdge',
        edge: {
          from: COMPANY_IDS.yolandaAccount,
          to: COMPANY_IDS.printUsers,
          kind: 'member_of',
        },
      },
    ],
    resolved_when: {
      op: 'edge',
      from: { id: COMPANY_IDS.yolandaAccount },
      to: { id: COMPANY_IDS.printUsers },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/print-permissions',
  },
  cause: 'The account is not in the print users group, so the print server '
    + 'accepts the connection and discards the job. Nothing on the starter '
    + 'form covers it, which is why every starter form is done correctly and '
    + 'this happens anyway.',
  dialogue_ref: 'dialogue/hr',
  paths: [
    {
      id: 'pool-add-print-users',
      app: 'directory',
      label: 'Add the account to the print users group',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: COMPANY_IDS.yolandaAccount,
          params: { group: COMPANY_IDS.printUsers },
        },
      ],
    },
  ],
};

export const POOL_DESK_TICKETS: readonly WorldTicket[] = [
  POOL_SALES_RESTART,
  POOL_SALES_SPOOLER,
  POOL_PAYROLL_CLOCK,
  POOL_PAYROLL_SHARE,
  POOL_HERCULES_DEAD,
  POOL_DESPATCH_LPD,
  POOL_RECEPTION_LOCKED,
  POOL_RECEPTION_BADGES,
  POOL_DESPATCH_QUEUE,
  POOL_DESPATCH_EXPIRED,
  POOL_FACILITIES_DISABLED,
  POOL_ACCOUNTS_UPDATES,
  POOL_ACCOUNTS_DRIVES,
  POOL_ESTIMATING_ROTATED,
  POOL_ESTIMATING_TENDER,
  POOL_PORTAL_CERT,
  POOL_ACCOUNTS_BROWSE,
  POOL_WAREHOUSE_SCHEDULE,
  POOL_WAREHOUSE_TABLET,
  POOL_SALES_NEW_MFA,
  // And the four the morning pile was short of (see the note above them).
  POOL_FINANCE_SOUND,
  POOL_LOGISTICS_SHARE,
  POOL_MARKETING_TRUST,
  POOL_HR_PRINT_GROUP,
];
