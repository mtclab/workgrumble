/**
 * Pool tickets for one shop (E11, 0.34.0 slice 2) - the surplus the exclusion
 * window needs, in the queue's own shape.
 *
 * Each one is self-contained: no arc, no chain, no beat. It lands on estate the
 * shop already has and closes through verbs the registry already holds, and the
 * day it is dealt on is the sampler's business rather than a table's.
 *
 * HALCYON GRANGE HOLDINGS, where the machines are fine and the organisation is
 * the vulnerability. The authored week is the exec weak spot end to end - three
 * exceptions, a rubber-stamp, an order you cannot refuse and a seagull - so the
 * surplus is deliberately the OTHER half of that building: the housekeeping the
 * governance is supposed to produce and does not. A cover arrangement with no
 * end date on it, a director's account that outlived the director, a password
 * that expired on schedule, and a morning where the whole floor says the
 * internet is down. Dry, procedural, and the comedy is always the paperwork.
 *
 * NOTHING HERE TOUCHES THE ARC. The three deliberately-hardened services belong
 * to the mandate and its revert; Roland is not a reporter here, because his
 * flag forces a priority and that mechanic is the VIP tier's to teach; and no
 * ticket below moves a group the access review has an opinion about, because a
 * pool ticket and a beat that both write the same membership would be two
 * tickets closing each other on whichever seed dealt them together.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { STARTUP_PARAM } from '../actions/legendary';
import { HALCYON_IDS } from '../corporate-company';
import { FIELDS, SERVICE_STATUS, STARTUP_TYPES } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { baselineServiceId } from '../services';
import type { WorldTicket } from './types';

/** The DNS Server role on the domain controller, which is a baseline service. */
const DC_DNS = baselineServiceId(HALCYON_IDS.dc, 'DNS');

/**
 * "The internet is down", which it is not.
 *
 * Every domain-joined machine in this building resolves through the domain
 * controller, because that is what a domain is: the DC holds the zone the
 * clients find each other in, and it forwards everything else on their behalf.
 * With the DNS Server service on it stopped, nothing resolves - not the file
 * server, not the ledger, not a news site - so the floor reports the one
 * symptom they all share and it is the wrong one.
 *
 * The tell is that addresses still work while names do not, and it is the whole
 * diagnosis: a box that can be reached by IP and not by name is a box whose
 * network is fine and whose directory of names is not answering.
 */
const HALCYON_DNS_DOWN: WorldTicket = {
  arrival: 'morning',
  nodes: [DC_DNS, HALCYON_IDS.dc],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: 'ticket:halcyon-dns-down',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Halcyon: the internet is down for the whole floor',
      body:
        'Bronwen reports that nothing works this morning - no shared drive, no '
        + 'ledger, no web - and that three people have already told her the '
        + 'internet is down, so she is passing that on as the fault. She adds, '
        + 'because she is the sort of person who notices, that the desk phones '
        + 'are fine and that somebody in Sales got to a supplier site by typing '
        + 'in a number they had written down.',
    },
    reporter: HALCYON_IDS.bronwen,
    setup: [
      {
        op: 'setField',
        id: DC_DNS,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: DC_DNS },
      field: FIELDS.status,
      value: SERVICE_STATUS.running,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 6 },
    kb_ref: 'kb/dns-is-not-the-internet',
  },
  cause: 'The DNS Server service on HALCYON-DC-01 is stopped. Every machine on '
    + 'this domain asks that box to turn a name into an address, and asks it '
    + 'for external names too, so with it down nothing resolves anywhere - '
    + 'which arrives at the desk as "the internet is down" because that is the '
    + 'part of it people have a phrase for. The line is up: what somebody '
    + 'reaches by typing an address is the proof.',
  dialogue_ref: 'dialogue/halcyon-bronwen',
  paths: [
    {
      id: 'start-dns-on-the-dc',
      app: 'cmd',
      label: 'Start the DNS Server service on HALCYON-DC-01',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: DC_DNS,
        },
      ],
    },
  ],
};

/**
 * The holiday cover, which is a segregation-of-duties change wearing a fortnight
 * as a disguise.
 *
 * Nothing is broken and the request is entirely reasonable: the AP clerk is on
 * leave, the supplier run has to go out, and the finance business partner is
 * the obvious person to cover it. Granting it is the only thing that closes the
 * ticket, exactly like every other exception in this building - what the desk
 * can do is see what it is, which is a payment-approval entitlement handed to
 * somebody whose job does not carry one, with an end date nobody has written
 * down anywhere a system can read.
 *
 * It is the review's own finding, arriving as a favour, two quarters early.
 */
const HALCYON_AP_COVER: WorldTicket = {
  arrival: 'drip',
  nodes: [HALCYON_IDS.margueriteAccount, HALCYON_IDS.paymentApprove],
  claimed_urgency: 2,
  true_urgency: 1,
  def: {
    id: 'ticket:halcyon-ap-cover',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: give Marguerite payment approval while Cass is away',
      body:
        'Miriam has asked the desk to put Marguerite into AP - Payment '
        + 'Approval for the fortnight Cass is on leave, so the supplier run '
        + 'still goes out while she is away. She is clear that it is temporary '
        + 'and that she is happy to be the one who asked. She has not said when '
        + 'it comes off again, and nothing about the request will remember.',
    },
    reporter: HALCYON_IDS.cfo,
    // Nothing is seeded: the estate is correct as it stands, and what the
    // ticket asks for is a change to a correct estate. That is the shape of
    // every exception in this building.
    setup: [],
    resolved_when: {
      op: 'edge',
      from: { id: HALCYON_IDS.margueriteAccount },
      to: { id: HALCYON_IDS.paymentApprove },
      kind: 'member_of',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/access-recertification',
  },
  cause: 'Nothing is wrong. Marguerite genuinely cannot approve a payment and '
    + 'genuinely has to for a fortnight, and the membership is how that is '
    + 'done. What makes it a finding rather than a favour is the half nobody '
    + 'files: she can already raise a supplier, so for those two weeks one '
    + 'person can create a vendor and pay it - and a temporary grant with no '
    + 'date on it is how every permanent one in this directory started.',
  dialogue_ref: 'dialogue/halcyon-miriam',
  paths: [
    {
      id: 'grant-the-cover',
      app: 'directory',
      label: 'Add Marguerite to AP - Payment Approval',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountAddToGroup,
          target: HALCYON_IDS.margueriteAccount,
          params: { group: HALCYON_IDS.paymentApprove },
        },
      ],
    },
  ],
};

/**
 * The account that outlived the engagement.
 *
 * The interim director went on to an exciting opportunity and the leaver
 * process did not notice, because he was never a joiner: he came in through a
 * different budget line, with a laptop nobody imaged and an account somebody
 * created as a favour on his first morning. It is still enabled, and it will be
 * next quarter too unless a ticket is raised about it, which is the whole
 * finding.
 *
 * The Head of IT raises it himself, in the queue, one issue per ticket, because
 * the room topic says even he has to - and because a ticket is the only thing
 * in this building that makes anything happen.
 */
const HALCYON_INTERIM_LEAVER: WorldTicket = {
  arrival: 'drip',
  nodes: [HALCYON_IDS.seagullAccount],
  // Ivor has filed it low, on the reasonable grounds that nobody is waiting on
  // it. Nobody being inconvenienced is not the same as nothing being at risk,
  // and a live account for a person who has gone is the finding every breach
  // report in the trade opens with.
  claimed_urgency: 1,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-interim-leaver',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: Vosper has left and his account has not',
      body:
        'Ivor has raised a ticket on his own team, properly, one issue per '
        + 'ticket: the interim transformation director moved on some weeks ago '
        + 'and his account is still enabled. He notes that there was no leaver '
        + 'form because there was never a joiner form, that this is being '
        + 'looked at as a process, and that in the meantime he would like the '
        + 'account switched off today.',
    },
    reporter: HALCYON_IDS.manager,
    // Nothing to seed: the account is enabled because nobody ever switched it
    // off, which is the fault, and it has been true of this estate since the
    // man arrived.
    setup: [],
    resolved_when: {
      op: 'eq',
      selector: { id: HALCYON_IDS.seagullAccount },
      field: FIELDS.enabled,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/offboarding-access-gap',
  },
  cause: 'Deprovisioning is disabling the ACCOUNT, and it never happened here: '
    + 'the engagement ended, the desk was told by nobody, and a working login '
    + 'for somebody with no reason to use it has been sitting in the directory '
    + 'ever since. Disabling it is the whole of what was asked for; what it '
    + 'does not do is take away anything he was ever put into, which is the '
    + 'half that has to be read line by line rather than assumed.',
  dialogue_ref: 'dialogue/halcyon-ivor',
  paths: [
    {
      id: 'disable-the-interim-account',
      app: 'directory',
      label: 'Disable the tvosper account in the directory',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountDisable,
          target: HALCYON_IDS.seagullAccount,
        },
      ],
    },
  ],
};

/**
 * The job's own texture at an enterprise: a password policy did exactly what it
 * was written to do, to somebody who was not at his desk on the day it warned
 * him. Short, one step, and the article the tech already carries - the same
 * three states, the same three fixes, in a building with a policy behind them.
 */
const HALCYON_COLM_PASSWORD: WorldTicket = {
  arrival: 'drip',
  nodes: [HALCYON_IDS.successorAccount],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-colm-password',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: locked out of everything this morning',
      body:
        'Colm reports that he is locked out and cannot get into anything. '
        + 'Pressed for what the screen actually says, he reads it out: his '
        + 'password has expired and must be changed. He has been in workshops '
        + 'off site all week and says he never saw a warning, which is true and '
        + 'is also what the warning is for.',
    },
    reporter: HALCYON_IDS.successor,
    setup: [
      {
        op: 'setField',
        id: HALCYON_IDS.successorAccount,
        field: FIELDS.passwordExpired,
        value: true,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: HALCYON_IDS.successorAccount },
      field: FIELDS.passwordExpired,
      value: false,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 2 },
    kb_ref: 'kb/three-ways-an-account-says-no',
  },
  cause: 'The password expired on the policy\'s own schedule. The account is '
    + 'not locked and not disabled, so unlocking it is a control that has '
    + 'nothing to act on: a policy clock ran out on the credential, and the fix '
    + 'is a new credential and the flag that makes him choose his own at the '
    + 'next sign-in.',
  dialogue_ref: 'dialogue/halcyon-colm',
  paths: [
    {
      id: 'reset-the-expired-password',
      app: 'directory',
      label: 'Reset the creddaway password and have him change it at logon',
      steps: [
        {
          action: HELPDESK_ACTIONS.accountResetPassword,
          target: HALCYON_IDS.successorAccount,
        },
      ],
    },
  ],
};

/* -- the three the Thursday is made of ------------------------------------ */

/**
 * Three services found Disabled, and why there are three of them.
 *
 * The mechanical shape is the same each time - a startup type that is wrong and
 * a service that is therefore not running - and that is a fact about this
 * building rather than a shortage of ideas. Halcyon rebuilds machines by hand
 * from a document, the document is out of date, and a service the rebuild set
 * to Disabled is a service nobody notices until somebody needs the thing it
 * does. What differs, and what each of them teaches, is WHICH service and
 * therefore which part of the day stops: a namespace, a download, a dial-in.
 *
 * They are also the shop's heavy content, and that is deliberate. A day here
 * may hold one inherited ticket and three drips, so four arrivals is the
 * ceiling - and four thirty-minute arrivals cannot reach the floor of a load-2
 * Thursday however they are arranged. A pool of nothing but one-step tickets
 * therefore cannot build this shop's heaviest day at all, whatever its size.
 * Two load-bearing steps is what makes an entry weigh enough to be dealt on the
 * day the week is shaped around.
 *
 * Both steps are necessary and the gate proves it: starting a Disabled service
 * leaves it Disabled and it will not come back after the next restart, and
 * changing the startup type of a stopped service does not start it. The
 * resolution rule asks for both, which is what the job actually is.
 */

/** The DFS namespace on the file server: the S: drive everybody maps. */
const SRV_DFS = baselineServiceId(HALCYON_IDS.fileServer, 'Dfs');

/** Background Intelligent Transfer, which is how updates actually arrive. */
const CFO_BITS = baselineServiceId(HALCYON_IDS.cfoPc, 'BITS');

/** And the audio stack on the machine the board dials in from. */
const EA_AUDIO = baselineServiceId(HALCYON_IDS.eaPc, 'Audiosrv');

/**
 * The mapped drive that is not a mapped-drive problem.
 *
 * Distributed File System is what turns one drive letter into the several
 * shares actually behind it. With the service stopped the namespace stops
 * answering, so the letter fails to map - and every machine in the building
 * fails the same way at once, which is why it reads as "the server is down"
 * when the server is serving perfectly well.
 */
const HALCYON_DFS_DISABLED: WorldTicket = {
  arrival: 'drip',
  nodes: [SRV_DFS, HALCYON_IDS.fileServer],
  // Filed calmly by the Head of IT, and it is the worst thing on the estate
  // this morning: the gap points the other way from the exec floor's.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:halcyon-dfs-disabled',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Halcyon: S: drive will not map for anybody this morning',
      body:
        'Ivor has had four people at his desk and has raised one ticket for '
        + 'all of them. The S: drive does not map. The server is up, he can '
        + 'reach it by name, and the shares underneath it open perfectly well '
        + 'if you know where they actually live - which he does, and nobody '
        + 'else in the building does.',
    },
    reporter: HALCYON_IDS.manager,
    setup: [
      {
        op: 'setField',
        id: SRV_DFS,
        field: FIELDS.startupType,
        value: STARTUP_TYPES.disabled,
      },
      {
        op: 'setField',
        id: SRV_DFS,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: SRV_DFS },
          field: FIELDS.startupType,
          value: STARTUP_TYPES.automatic,
        },
        {
          op: 'eq',
          selector: { id: SRV_DFS },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 5 },
    kb_ref: 'kb/disabled-is-not-stopped',
  },
  cause: 'The Distributed File System service on HALCYON-SRV-01 is set to '
    + 'Disabled and is stopped, so the namespace behind the S: drive answers '
    + 'nobody. The shares themselves were never affected.',
  dialogue_ref: 'dialogue/halcyon-ivor',
  paths: [
    {
      id: 'startup-then-start-dfs',
      app: 'cmd',
      label: 'Set DFS back to Automatic, then start it',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceSetStartup,
          target: SRV_DFS,
          params: { [STARTUP_PARAM]: STARTUP_TYPES.automatic },
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: SRV_DFS,
        },
      ],
    },
  ],
};

/**
 * The updates that are always about to download.
 *
 * Windows Update hands the actual transfer to BITS, so with BITS disabled the
 * machine keeps saying it is downloading and never gets anywhere. It is a
 * quiet, ordinary fault with a genuinely unpleasant tail - a finance director's
 * laptop several months behind - which is why the urgency on it is not the one
 * she gave it.
 */
const HALCYON_BITS_DISABLED: WorldTicket = {
  arrival: 'drip',
  nodes: [CFO_BITS, HALCYON_IDS.cfoPc],
  claimed_urgency: 1,
  true_urgency: 3,
  def: {
    id: 'ticket:halcyon-bits-disabled',
    archetype: 'hidden_cause',
    flavor: {
      title: 'Halcyon: updates have said 0% for a very long time',
      body:
        'Miriam mentions, as an afterthought at the end of a longer message '
        + 'about something else, that her machine has been saying it is '
        + 'downloading updates since roughly the spring. It has never asked '
        + 'her to restart. She would like it looked at when there is a moment '
        + 'and is clear that it is not urgent.',
    },
    reporter: HALCYON_IDS.cfo,
    setup: [
      {
        op: 'setField',
        id: CFO_BITS,
        field: FIELDS.startupType,
        value: STARTUP_TYPES.disabled,
      },
      {
        op: 'setField',
        id: CFO_BITS,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: CFO_BITS },
          field: FIELDS.startupType,
          value: STARTUP_TYPES.automatic,
        },
        {
          op: 'eq',
          selector: { id: CFO_BITS },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/disabled-is-not-stopped',
  },
  cause: 'Background Intelligent Transfer Service is Disabled on the CFO\'s '
    + 'machine, and it is the service Windows Update hands the download to - so '
    + 'the check succeeds, the transfer never starts, and nothing is ever ready '
    + 'to install.',
  dialogue_ref: 'dialogue/halcyon-miriam',
  paths: [
    {
      id: 'startup-then-start-bits',
      app: 'cmd',
      label: 'Set BITS back to Automatic, then start it',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceSetStartup,
          target: CFO_BITS,
          params: { [STARTUP_PARAM]: STARTUP_TYPES.automatic },
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: CFO_BITS,
        },
      ],
    },
  ],
};

/**
 * No sound on the machine the board dials in from, forty minutes before the
 * board dials in.
 *
 * The mundane one of the three, and the one with a clock on it. Windows Audio
 * being Disabled is not a driver fault and not a speaker fault, which is what
 * makes the half hour somebody would otherwise spend under the desk with a
 * cable the actual cost of it.
 */
const HALCYON_AUDIO_DISABLED: WorldTicket = {
  arrival: 'drip',
  nodes: [EA_AUDIO, HALCYON_IDS.eaPc],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:halcyon-audio-disabled',
    archetype: 'read_the_screen',
    flavor: {
      title: 'Halcyon: no sound at all on the EA machine, board call at two',
      body:
        'Denise has no sound. Not quiet - none, with a red cross on the '
        + 'speaker in the corner. She has tried the volume, she has tried '
        + 'headphones, and she has the board dial-in at two o\'clock.',
    },
    reporter: HALCYON_IDS.ea,
    setup: [
      {
        op: 'setField',
        id: EA_AUDIO,
        field: FIELDS.startupType,
        value: STARTUP_TYPES.disabled,
      },
      {
        op: 'setField',
        id: EA_AUDIO,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: EA_AUDIO },
          field: FIELDS.startupType,
          value: STARTUP_TYPES.automatic,
        },
        {
          op: 'eq',
          selector: { id: EA_AUDIO },
          field: FIELDS.status,
          value: SERVICE_STATUS.running,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/disabled-is-not-stopped',
  },
  cause: 'Windows Audio is Disabled and stopped on HALCYON-EA-PC. The red '
    + 'cross on the tray icon is the service being absent rather than any '
    + 'device being missing, which is why no amount of headphones helps.',
  dialogue_ref: 'dialogue/halcyon-denise',
  paths: [
    {
      id: 'startup-then-start-audio',
      app: 'remote',
      label: 'Set Windows Audio back to Automatic, then start it',
      steps: [
        {
          action: HELPDESK_ACTIONS.serviceSetStartup,
          target: EA_AUDIO,
          params: { [STARTUP_PARAM]: STARTUP_TYPES.automatic },
        },
        {
          action: HELPDESK_ACTIONS.serviceRestart,
          target: EA_AUDIO,
        },
      ],
    },
  ],
};

export const POOL_CORPORATE_TICKETS: readonly WorldTicket[] = [
  HALCYON_DNS_DOWN,
  HALCYON_AP_COVER,
  HALCYON_INTERIM_LEAVER,
  HALCYON_COLM_PASSWORD,
  HALCYON_DFS_DISABLED,
  HALCYON_BITS_DISABLED,
  HALCYON_AUDIO_DISABLED,
];

