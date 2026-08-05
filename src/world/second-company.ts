/**
 * The SECOND employer, and the whole reason the switch spine was built: a shop
 * that is nothing like the first one (0.6.0 slice 3, E5 #24).
 *
 * Bodgeworth & Batch is a family haulage firm with a yard, a portacabin office,
 * and an IT estate that grew the way a hedge grows. Where Workgrumble Ltd is an
 * enterprise that has an OPINION about everything - a domain, a licence pool, a
 * quarantine rule somebody wrote and never switched on, an audit that logs your
 * installs - Bodgeworth is the opposite building: no domain controller, no MFA
 * rollout, one login the whole front office shares, a "server" that is a tower
 * under Kev's desk, and an install policy of `wild_west`, which is to say no
 * policy at all. The web store is fair game here and nobody is watching, which
 * is the 0.4.0 audit seam paying off by its ABSENCE.
 *
 * The contrast is the teaching. The same skills - read the twenty lines, find
 * the wrong one, restart the thing, unlock the account, tell the human the
 * truth - close tickets here exactly as they did there. What changed is the
 * building around them, and a tech who has learned one shop has learned the
 * shape of the other. Everything below is DATA the engine applies, the same as
 * the probation seed it sits beside, and it shares not one node id with it: the
 * two estates are two worlds, and only one is ever stood up at a time.
 *
 * Nothing here consumes the simulation RNG or reads the clock.
 */

import type { Edge, GraphNode, SetupOp } from '../engine-api';
import type { ChannelDef } from './channels';
import { NO_RUN } from './consumables';
import { VERIFICATION_METHODS, verificationChannels } from './fallout';
import { driveSetup } from './filesystem';
import {
  DEVICE_TYPES,
  FIELDS,
  type MachineRole,
  MACHINE_ROLES,
  SERVICE_CLASSES,
  SERVICE_STATUS,
  STARTUP_TYPES,
} from './fields';
import { STARTING_REPUTATION } from './meters';
import { BASELINE_SERVICES, baselineServiceId } from './services';

/**
 * What Bodgeworth has on file to prove who you are: a phone number, and nothing
 * else. There was no June rollout here - no recovery envelopes, no nominated
 * contacts - because nobody ever ran one. A caller who has lost their phone is
 * verified by Kev recognising their voice, which is exactly how a twelve-person
 * firm with no IT department actually does it.
 */
const VERIFICATION_CHANNELS_ON_FILE = verificationChannels([
  VERIFICATION_METHODS.callback,
]);

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

/**
 * What Bodgeworth thinks about you installing software: nothing. `wild_west` is
 * a shop with no audit, so an install here carries no suspicion drip and leaves
 * no record - the exact opposite of the probation shop, and the 0.4.0 seam read
 * off the pack rather than flipped at runtime.
 */
export const BODGE_COMPANY = {
  name: 'Bodgeworth & Batch',
  domain: 'BODGE',
  motto: 'Hauliers since the war. Computers since Kev did a course.',
  installPolicy: 'wild_west',
} as const;

export const BODGE_IDS = {
  /** The player, same person as ever, a fortnight into a very different job. */
  player: 'person:pat',
  playerAccount: 'account:pat-bodge',
  playerMachine: 'machine:the-spare-one',
  playerMonitor: 'device:bodge-monitor',

  /**
   * Vernon Bodgeworth. Owns the firm, signs the cheques, and is the player's
   * boss - there is no service-delivery lead here, there is Vernon, who thinks
   * IT is a thing you should have sorted by now.
   */
  vernon: 'person:vernon',
  vernonAccount: 'account:vernon',
  vernonLaptop: 'machine:vernon-laptop',
  vernonMouse: 'device:vernon-mouse',

  /** Trevor Batch, the "& Batch". Semi-retired, still on every mailing list. */
  trev: 'person:trev',
  trevAccount: 'account:trev',

  /**
   * Kevin Sump. Does the invoicing, "knows computers", and built the server
   * under his desk in 2011. Every clever thing in this estate is his, and so
   * is every haunted one.
   */
  kev: 'person:kev',
  kevAccount: 'account:kev',
  kevPc: 'machine:kev-pc',

  /** Sharon Diss. Runs the office off the front desk everybody shares. */
  sharon: 'person:sharon',
  sharonAccount: 'account:sharon',

  /** Barry "Baz" Coker. In the yard, at the printer, never at a desk. */
  baz: 'person:baz',
  bazAccount: 'account:baz',

  /**
   * The login the whole front office shares. There is no domain to make
   * individual accounts on, so Sharon, Baz and whoever is covering reception
   * all sign in as OFFICE - which is why a lockout takes down the whole desk
   * rather than one person.
   */
  officeAccount: 'account:office',
  frontDesk: 'machine:front-desk',

  /**
   * The server. A tower under Kev's desk that holds the shared drive and the
   * accounts package, has a fan that has been getting louder for a year, and
   * has never once been backed up by anything but Kev meaning to.
   */
  server: 'machine:the-server',
  serverFan: 'service:server-fan',
  theShare: 'service:the-share',
  accountsPackage: 'service:accounts-package',

  /** The one printer, in the yard, that everybody walks to. */
  printer: 'device:office-printer',
  spooler: 'service:bodge-spooler',
} as const;

export type BodgeNodeId = (typeof BODGE_IDS)[keyof typeof BODGE_IDS];

interface StaffSeed {
  readonly person: string;
  readonly account: string;
  readonly name: string;
  readonly title: string;
  readonly username: string;
  readonly desk: string;
  readonly lastLogon?: number;
}

const STAFF: readonly StaffSeed[] = [
  {
    person: BODGE_IDS.player,
    account: BODGE_IDS.playerAccount,
    name: 'Pat Pending',
    title: 'IT (all of it)',
    username: 'pat',
    desk: 'The corner of the portacabin with the good chair',
    lastLogon: 0,
  },
  {
    person: BODGE_IDS.vernon,
    account: BODGE_IDS.vernonAccount,
    name: 'Vernon Bodgeworth',
    title: 'Owner',
    username: 'vernon',
    desk: 'The office with the calendar of lorries',
    lastLogon: 0,
  },
  {
    person: BODGE_IDS.trev,
    account: BODGE_IDS.trevAccount,
    name: 'Trevor Batch',
    title: 'Partner (semi-retired)',
    username: 'trev',
    desk: 'Not in most days, and on every mailing list every day',
    lastLogon: 0,
  },
  {
    person: BODGE_IDS.kev,
    account: BODGE_IDS.kevAccount,
    name: 'Kevin Sump',
    title: 'Accounts, and computers, apparently',
    username: 'kev',
    desk: 'The desk the server lives under',
    lastLogon: 0,
  },
  {
    person: BODGE_IDS.sharon,
    account: BODGE_IDS.sharonAccount,
    name: 'Sharon Diss',
    title: 'Office Manager',
    username: 'sharon',
    desk: 'The front desk, and the shared login on it',
    lastLogon: 0,
  },
  {
    person: BODGE_IDS.baz,
    account: BODGE_IDS.bazAccount,
    name: 'Barry Coker',
    title: 'Yard',
    username: 'baz',
    desk: 'The yard, and the printer at the end of it',
    lastLogon: 0,
  },
];

/**
 * The shared front-office login, seeded beside the staff because it is nobody's
 * and everybody's. It owns the front desk the way a person owns a machine, so a
 * lockout on it has a machine to be about.
 */
const OFFICE_LOGIN = {
  account: BODGE_IDS.officeAccount,
  username: 'office',
} as const;

interface MachineSeed {
  readonly id: string;
  readonly hostname: string;
  readonly role: MachineRole;
  readonly owner?: string;
  readonly wiredTo?: string;
  readonly resolution?: string;
  readonly pendingUpdates?: boolean;
  readonly processor: string;
  readonly memory: string;
  readonly diskFree: number;
}

const DESK_PROCESSOR = 'Pentagon 90 MHz (it came with the desk)';
const DESK_MEMORY = '32 MB';

const MACHINES: readonly MachineSeed[] = [
  {
    id: BODGE_IDS.playerMachine,
    hostname: 'THE-SPARE-ONE',
    role: MACHINE_ROLES.workstation,
    owner: BODGE_IDS.player,
    wiredTo: BODGE_IDS.server,
    resolution: '800x600',
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 210_763_776,
  },
  {
    id: BODGE_IDS.vernonLaptop,
    hostname: 'VERNON-LAP',
    role: MACHINE_ROLES.workstation,
    owner: BODGE_IDS.vernon,
    wiredTo: BODGE_IDS.server,
    processor: 'Pentagon 120 MHz (a laptop, and he takes it home)',
    memory: '48 MB',
    diskFree: 402_653_184,
  },
  {
    id: BODGE_IDS.kevPc,
    hostname: 'KEV',
    role: MACHINE_ROLES.workstation,
    owner: BODGE_IDS.kev,
    wiredTo: BODGE_IDS.server,
    pendingUpdates: true,
    processor: 'Pentagon 133 MHz (the good one, because Kev built it)',
    memory: '64 MB',
    diskFree: 512_204_800,
  },
  {
    id: BODGE_IDS.frontDesk,
    hostname: 'FRONT-DESK',
    role: MACHINE_ROLES.workstation,
    // Signed in as OFFICE, by whoever is on the desk, all day.
    owner: BODGE_IDS.sharon,
    wiredTo: BODGE_IDS.server,
    resolution: '800x600',
    processor: DESK_PROCESSOR,
    memory: DESK_MEMORY,
    diskFree: 96_468_992,
  },
  {
    // The server: a desktop, on the floor, doing a server's job, with the
    // whole yard's shared drive on it and a fan nobody has cleaned since it
    // went in. Nearly full, because a haulage firm keeps every scan of every
    // delivery note it has ever printed.
    id: BODGE_IDS.server,
    hostname: 'BODGE-SRV',
    role: MACHINE_ROLES.fileServer,
    processor: 'Pentagon 166 MHz (under a desk, holding everything)',
    memory: '128 MB',
    diskFree: 41_943_040,
  },
];

const NAMED_SERVICE_TWINS: Readonly<Record<string, readonly string[]>> = {
  [BODGE_IDS.server]: ['LanmanServer'],
};

/**
 * Somebody's name off the same table the seed builds them from, for the one
 * kind of caller that cannot read the graph: static content naming a person in
 * a paragraph it wrote before there was a world.
 */
export function bodgeStaffName(personId: string): string {
  const member = STAFF.find((candidate) => candidate.person === personId);

  if (member === undefined) {
    throw new Error(`Nobody at Bodgeworth is called "${personId}".`);
  }

  return member.name;
}

export function bodgeMachineHostname(machineId: string): string {
  const machine = MACHINES.find((candidate) => candidate.id === machineId);

  if (machine === undefined) {
    throw new Error(`No machine at Bodgeworth is called "${machineId}".`);
  }

  return machine.hostname;
}

/**
 * The rooms Bodgeworth's channel client has, which is the whole of the channel
 * mix contrast (0.6.0 slice 3, off the 0.5.0 per-employer seam). The probation
 * shop rolled out three governed rooms with a single-source-of-truth topic and
 * a keep-tickets-in-the-ticket-system rule; Bodgeworth has ONE room the whole
 * firm is in and no rule about anything, which is why the reply-all storm has
 * somewhere to happen. The id prefix is `room:` rather than `chan:` so the two
 * employers' rooms cannot be confused for one another.
 */
export const BODGE_CHANNELS: readonly ChannelDef[] = Object.freeze([
  Object.freeze({
    id: 'room:office',
    name: '#office',
    topic: 'everyone. yard, office, Kev. keep it civil (Sharon)',
  }),
  Object.freeze({
    id: 'room:yard',
    name: '#yard',
    topic: 'loads, keys, who has the forklift charger',
  }),
]);

/** The rooms Bodgeworth rolled out, for the employer registry to hand over. */
export function bodgeChannels(): readonly ChannelDef[] {
  return BODGE_CHANNELS;
}

/** The Bodgeworth estate as construction ops. */
export function bodgeSetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];

  for (const member of STAFF) {
    addNode(ops, {
      id: member.person,
      kind: 'person',
      fields: {
        [FIELDS.name]: member.name,
        [FIELDS.title]: member.title,
        [FIELDS.desk]: member.desk,
        ...(member.person === BODGE_IDS.player
          ? {
            // The player's opening position, seeded exactly as the probation
            // shop seeds it: the op language moves a field it can read, so
            // every meter and week counter has to start as a number. A switch
            // OVERWRITES reputation and title from the carried career
            // (session.ts); everything else here is the fresh Monday it is.
            [FIELDS.dayState]: 'morning_brief',
            [FIELDS.farmFund]: 0,
            [FIELDS.stress]: 0,
            [FIELDS.suspicion]: 0,
            [FIELDS.reputation]: STARTING_REPUTATION,
            [FIELDS.weekReputation]: STARTING_REPUTATION,
            [FIELDS.suspicionEvents]: 0,
            [FIELDS.breachesCharged]: 0,
            [FIELDS.resolveCreditPaid]: 0,
            [FIELDS.caughtEvents]: 0,
            [FIELDS.deskCans]: 0,
            [FIELDS.drinkStartedAt]: NO_RUN,
            [FIELDS.drinkTolerance]: 0,
            [FIELDS.drinkCrashCharged]: NO_RUN,
            [FIELDS.consumableSpend]: 0,
            [FIELDS.weekAttempt]: 1,
            [FIELDS.weekOpeningFund]: 0,
            [FIELDS.reviewOutcome]: 'pending',
            [FIELDS.weekEnded]: false,
            [FIELDS.beerUnlocked]: false,
            [FIELDS.beerOpened]: false,
          }
          : {}),
      },
    });
    addNode(ops, accountNode(member.account, member.username));
    addEdge(ops, {
      from: member.person,
      to: member.account,
      kind: 'owns',
    });
  }

  // The shared front-office login, and the front desk it owns. Seeded as an
  // account with no person - it is the login, not a colleague - and given the
  // machine so a lockout on it is a fault about a box the player can touch.
  addNode(ops, accountNode(OFFICE_LOGIN.account, OFFICE_LOGIN.username));

  for (const machine of MACHINES) {
    addNode(ops, {
      id: machine.id,
      kind: 'machine',
      fields: {
        [FIELDS.hostname]: machine.hostname,
        [FIELDS.machineRole]: machine.role,
        [FIELDS.displayRotation]: 0,
        [FIELDS.resolution]: machine.resolution ?? '1024x768',
        [FIELDS.pendingUpdates]: machine.pendingUpdates === true,
        [FIELDS.processor]: machine.processor,
        [FIELDS.memory]: machine.memory,
        [FIELDS.diskFree]: machine.diskFree,
      },
    });
  }

  for (const machine of MACHINES) {
    const owner = STAFF.find((member) => member.person === machine.owner);

    ops.push(...driveSetup({
      machineId: machine.id,
      hostname: machine.hostname,
      role: machine.role,
      ...(owner === undefined ? {} : { ownerUsername: owner.username }),
      supportDesk: machine.id === BODGE_IDS.playerMachine,
    }));
  }

  for (const machine of MACHINES) {
    if (machine.owner !== undefined) {
      addEdge(ops, { from: machine.owner, to: machine.id, kind: 'owns' });
    }

    if (machine.wiredTo !== undefined) {
      addEdge(ops, {
        from: machine.id,
        to: machine.wiredTo,
        kind: 'connected_to',
      });
    }
  }

  // The shared login owns the front desk, so the desk has an account to lock.
  addEdge(ops, {
    from: OFFICE_LOGIN.account,
    to: BODGE_IDS.frontDesk,
    kind: 'owns',
  });

  addNode(ops, {
    id: BODGE_IDS.playerMonitor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'A monitor off a skip',
      [FIELDS.type]: DEVICE_TYPES.monitor,
      [FIELDS.powered]: true,
    },
  });
  addNode(ops, {
    id: BODGE_IDS.vernonMouse,
    kind: 'device',
    fields: {
      [FIELDS.name]: "Vernon's mouse",
      [FIELDS.type]: DEVICE_TYPES.mouse,
      [FIELDS.powered]: true,
      [FIELDS.batteryPct]: 6,
    },
  });
  addNode(ops, {
    id: BODGE_IDS.printer,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Yard printer',
      [FIELDS.type]: DEVICE_TYPES.printer,
      [FIELDS.powered]: true,
      [FIELDS.wedged]: false,
      [FIELDS.queueLen]: 0,
      [FIELDS.spoolJobs]: '',
    },
  });

  // The named services - the ones a ticket is about. The fan first, because it
  // is the same trap the probation shop's is: it reports a status like software
  // and it is a lump of spinning plastic. The share is the server's Server
  // service under the name the firm calls it; the accounts package is Kev's
  // pride and the thing that stops when the box is full.
  addNode(ops, {
    id: BODGE_IDS.serverFan,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Server fan',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.serviceClass]: SERVICE_CLASSES.hardware,
    },
  });
  addNode(ops, {
    id: BODGE_IDS.theShare,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'The Share',
      [FIELDS.serviceName]: 'LanmanServer',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addNode(ops, {
    id: BODGE_IDS.accountsPackage,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Accounts package',
      [FIELDS.serviceName]: 'SumpAccounts',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });
  addNode(ops, {
    id: BODGE_IDS.spooler,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Print Spooler',
      [FIELDS.serviceName]: 'Spooler',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.startupType]: STARTUP_TYPES.automatic,
    },
  });

  addEdge(ops, {
    from: BODGE_IDS.playerMonitor,
    to: BODGE_IDS.playerMachine,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: BODGE_IDS.vernonMouse,
    to: BODGE_IDS.vernonLaptop,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: BODGE_IDS.printer,
    to: BODGE_IDS.frontDesk,
    kind: 'connected_to',
  });
  addEdge(ops, {
    from: BODGE_IDS.spooler,
    to: BODGE_IDS.printer,
    kind: 'connected_to',
  });

  addEdge(ops, {
    from: BODGE_IDS.serverFan,
    to: BODGE_IDS.server,
    kind: 'runs_on',
  });
  addEdge(ops, {
    from: BODGE_IDS.spooler,
    to: BODGE_IDS.frontDesk,
    kind: 'runs_on',
  });
  for (const service of [BODGE_IDS.theShare, BODGE_IDS.accountsPackage]) {
    addEdge(ops, { from: service, to: BODGE_IDS.server, kind: 'runs_on' });
  }

  // And the baseline services every box has run since it was built, from the
  // table for its role - the noise the one wrong line hides in.
  for (const machine of MACHINES) {
    const named = NAMED_SERVICE_TWINS[machine.id] ?? [];

    for (const service of BASELINE_SERVICES[machine.role]) {
      if (named.includes(service.service)) {
        continue;
      }

      const id = baselineServiceId(machine.id, service.service);

      addNode(ops, {
        id,
        kind: 'service',
        fields: {
          [FIELDS.name]: service.name,
          [FIELDS.serviceName]: service.service,
          [FIELDS.status]: service.status,
          [FIELDS.startupType]: service.startup,
          ...(service.serviceClass === undefined
            ? {}
            : { [FIELDS.serviceClass]: service.serviceClass }),
        },
      });
      addEdge(ops, { from: id, to: machine.id, kind: 'runs_on' });
    }
  }

  return ops;
}

/**
 * One account node, wild-west flavour: no MFA (there was never a rollout), one
 * verification channel, nothing locked or expired in the seed. Every fault
 * arrives with the ticket about it, exactly as the probation shop's do.
 */
function accountNode(id: string, username: string): GraphNode {
  return {
    id,
    kind: 'account',
    fields: {
      [FIELDS.username]: username,
      [FIELDS.locked]: false,
      [FIELDS.enabled]: true,
      [FIELDS.passwordExpired]: false,
      [FIELDS.badPwCount]: 0,
      [FIELDS.pwMustChange]: false,
      // No second factor anywhere in this building: nobody ever set it up,
      // which is the wild-west truth and the reason a lost phone here is a
      // shrug rather than a support call.
      [FIELDS.mfaEnrolled]: false,
      [FIELDS.verificationChannels]: VERIFICATION_CHANNELS_ON_FILE,
    },
  };
}
