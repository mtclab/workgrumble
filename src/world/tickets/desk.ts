/**
 * The four that are about people rather than systems.
 *
 * A mouse with no batteries in it, reported as a computer that has stopped
 * responding. A backup agent that stopped itself at nine oh seven, reported as
 * a thing that happened by itself. A report that has not run since the spring
 * and is now needed by three o'clock. And one person, once, who did exactly the
 * right thing with a suspicious mail and deserves to be told so in writing.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS, SERVICE_STATUS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/** Pacing filler: the answer is a battery and it is on the reporter's desk. */
export const FLAT_MOUSE: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.adaMouse, COMPANY_IDS.adaMachine],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:flat-mouse',
    archetype: 'read_the_screen',
    flavor: {
      title: 'My computer has frozen completely',
      body:
        'Ada reports that the machine has locked up entirely: nothing moves, '
        + 'nothing clicks, and the pointer is exactly where she left it after '
        + 'lunch. The screen is showing a low-battery notice for a wireless '
        + 'mouse, which she has read, and which she believes is a separate '
        + 'issue she will raise later.',
    },
    reporter: COMPANY_IDS.ada,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.adaMouse,
        field: FIELDS.batteryPct,
        value: 0,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.adaMouse,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.adaMouse },
      field: FIELDS.batteryPct,
      value: 100,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2, money: 8 },
    kb_ref: 'kb/reading-the-error',
  },
  cause: 'The mouse batteries are flat. The machine is fine and has been fine '
    + 'throughout, which is what makes "frozen" such a good word for it.',
  dialogue_ref: 'dialogue/sales',
  paths: [
    {
      id: 'replace-the-battery',
      app: 'remote',
      label: 'Put batteries in the mouse from the hardware panel',
      steps: [
        {
          action: HELPDESK_ACTIONS.deviceReplaceBattery,
          target: COMPANY_IDS.adaMouse,
        },
      ],
    },
  ],
};

/**
 * The coverup. It did that by itself, and the machine wrote down that it did
 * not.
 *
 * The fix is a restart and takes four seconds. What the ticket is actually for
 * is the sentence afterwards: the event log says the backup agent was stopped
 * from the console at nine oh seven, and the directory says who was signed in
 * at nine oh seven. Saying so and not saying so pay exactly the same, which is
 * the point - it is a tone choice, not a scoring one, and a game that paid for
 * the humiliation would be teaching something false about the job.
 */
export const COVERUP_BACKUP: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.backupAgent, COMPANY_IDS.marcusMachine],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:coverup-backup',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Backup light has gone red and I have not touched anything',
      body:
        'Marcus reports a red light in the corner of his screen and is at '
        + 'pains to say the machine did it by itself, over the weekend, while '
        + 'he was not here. He mentions unprompted that the fan had been very '
        + 'loud on Friday and that he had not done anything about that either.',
    },
    reporter: COMPANY_IDS.marcus,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.backupAgent,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.backupAgent },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4, money: 14 },
    kb_ref: 'kb/event-log',
  },
  cause: 'The backup agent was stopped from the console on ACCTS-03, on a '
    + 'morning the directory says he was signed in, about four minutes after '
    + 'the fan got loud.',
  dialogue_ref: 'dialogue/accounts',
  paths: [
    {
      id: 'cmd-restart-agent',
      app: 'cmd',
      label: 'restart the backup agent on ACCTS-03',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.backupAgent,
        },
      ],
    },
    {
      id: 'remote-restart-agent',
      app: 'remote',
      label: 'Start it from the services panel while he watches',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.backupAgent,
        },
      ],
    },
  ],
};

/**
 * Known since the spring; needed by three.
 *
 * The `deadline_absurdity` archetype, in the form everybody who has worked a
 * service desk has met: a thing that has been broken for months becomes, on a
 * Friday, the most urgent thing in the building, because somebody upstream has
 * a meeting. It is genuinely fixable from the desk AND genuinely a second-line
 * job to fix properly, so both are advertised and both close it.
 */
export const HR_REPORT_MACRO: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.reportJob, COMPANY_IDS.fileServer],
  claimed_urgency: 3,
  true_urgency: 1,
  def: {
    id: 'ticket:hr-report-macro',
    archetype: 'deadline_absurdity',
    flavor: {
      title: 'Headcount report has not run since March - needed by 15:00',
      body:
        'Yolanda needs the headcount report for a board pack at three. The '
        + 'report has not run since March. She has known since March. Nobody '
        + 'raised it in March because everybody has been doing it by hand '
        + 'since March, quietly, at home, on a Sunday.',
    },
    reporter: COMPANY_IDS.yolanda,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.reportJob,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    // Either the job runs again, or it goes to the people whose job the job
    // is. Both are real answers to a Friday afternoon; neither is a dodge.
    resolved_when: {
      op: 'or',
      exprs: [
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.reportJob },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
        {
          op: 'eq',
          selector: { id: 'ticket:hr-report-macro' },
          field: FIELDS.escalated,
          value: true,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4, money: 16 },
    kb_ref: 'kb/known-since-spring',
  },
  cause: 'The scheduled reports service on the file server has been stopped '
    + 'since a maintenance window in March, and the report is a thing it runs.',
  dialogue_ref: 'dialogue/hr',
  paths: [
    {
      id: 'cmd-start-the-job',
      app: 'cmd',
      label: 'Start the scheduled reports service and let it catch up',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: COMPANY_IDS.reportJob,
        },
      ],
    },
    {
      /**
       * Escalating is a workflow rather than a shrug, and the workflow has
       * required content: what the user reported, and what you TRIED. The
       * second half is not typed by anybody - the form fills it in from what
       * was actually dispatched at this ticket's estate - so the path has to
       * start with something genuinely attempted, or it is not the path the
       * button behind it can walk. A reboot of the file server is what a first
       * line tech does try, it is honest, and it does not fix a service that
       * was stopped on purpose in March.
       */
      id: 'escalate-with-the-date',
      app: 'tickets',
      label: 'Try the obvious thing, then send it up with the date it '
        + 'actually broke on',
      steps: [
        {
          action: HELPDESK_ACTIONS.machineReboot,
          target: COMPANY_IDS.fileServer,
          // The escalation closes the ticket with or without it AT GRAPH
          // LEVEL, because the form's two halves arrive as parameters here.
          // What the reboot buys is the half the shipped BUTTON does not let
          // anybody type: the Tickets app fills "what I tried" from the touch
          // log, and a handoff with nothing in that half is the thin one that
          // bounces. Declared, so the gate proves the claim rather than being
          // told to ignore the step - see `TicketActionStep`.
          optional_for_closure: true,
        },
        {
          action: HELPDESK_ACTIONS.ticketEscalate,
          target: 'ticket:hr-report-macro',
          params: {
            reported: 'Headcount report has not generated since March; needed '
              + 'for a board pack at 15:00 today.',
            tried: 'Rebooted FILES-01; the scheduled reports service is still '
              + 'stopped and has been since the March window',
          },
        },
      ],
    },
  ],
};

/**
 * The one person this week who did the right thing.
 *
 * He got a convincing mail, did not click it, and reported it. The correct
 * outcome is a rule switched on and a sentence back to him saying so - and the
 * sentence matters more than the rule, because the next hundred of these
 * depend on whether reporting one was worth his morning.
 *
 * The gaudy link is in his conversation, offered plainly, with a warning. It is
 * not a fail state. It costs stress, it costs a good deal of composure, and the
 * ticket still closes, because the fix was never the link.
 */
/**
 * The sentence the whole ticket is actually for.
 *
 * Exported because it is said in two places - the advertised path and Dennis's
 * own conversation - and the reporter must read the same words whichever one
 * the player got there by. It is customer-visible: he can see it, and that is
 * the point of it.
 */
export const PHISH_PRAISE = 'You did exactly the right thing, and you did it '
  + 'faster than the tools did. The sender domain was a lookalike, the '
  + 'quarantine rule is on now, and nobody else will see it. Please keep '
  + 'sending them - the ones that turn out to be nothing cost us a minute, and '
  + 'the one that does not costs everybody a fortnight.';

export const PHISHING_REPORT: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.phishBlock, COMPANY_IDS.dennisMachine],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:phishing-report',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Probably nothing, but this email looks wrong to me',
      body:
        'Dennis has forwarded a mail asking him to re-enter his password '
        + 'because of "unusual activity". It is from a domain one letter off '
        + 'ours. He has not clicked it, has told the two people either side of '
        + 'him not to click it, and is apologising for wasting your time.',
    },
    reporter: COMPANY_IDS.dennis,
    setup: [],
    // Two halves, and the second one is the ticket. Switching the rule on
    // stops this mail; writing back to the man who reported it is what decides
    // whether the next hundred get reported at all, and it is the only fix in
    // the week that is made entirely of a sentence. The ticket used to close
    // on the rule alone while the resolved conversation claimed "you wrote
    // back", which is the game telling the player they did something they did
    // not do.
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.phishBlock },
          field: FIELDS.enabled,
          value: true,
        },
        {
          op: 'eq',
          selector: { id: 'ticket:phishing-report' },
          field: FIELDS.replied,
          value: true,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5, money: 18 },
    kb_ref: 'kb/somebody-reported-a-phish',
  },
  cause: 'A lookalike domain, and a quarantine rule somebody wrote in March, '
    + 'tested once and never switched on because switching it on was a change '
    + 'and a change needed a form.',
  dialogue_ref: 'dialogue/marketing',
  paths: [
    {
      id: 'switch-the-rule-on',
      // The rule is a terminal job and the reply is a conversation, and the
      // second one is the half that closes it. The app a path advertises is
      // where the player ends up, not where they start.
      app: 'chat',
      label: 'Switch the quarantine rule on, then tell him he did the right '
        + 'thing',
      steps: [
        {
          action: HELPDESK_ACTIONS.mailRuleEnable,
          target: COMPANY_IDS.phishBlock,
        },
        {
          action: HELPDESK_ACTIONS.ticketReplyToReporter,
          target: 'ticket:phishing-report',
          params: { comment: PHISH_PRAISE },
        },
      ],
    },
  ],
};

export const DESK_TICKETS: readonly WorldTicket[] = [
  FLAT_MOUSE,
  COVERUP_BACKUP,
  HR_REPORT_MACRO,
  PHISHING_REPORT,
];
