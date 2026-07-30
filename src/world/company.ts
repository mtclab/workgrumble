import type { EntityGraph } from '../engine/graph';
import { DEVICE_TYPES, FIELDS, SERVICE_STATUS } from './fields';

/**
 * The employer. One company = one graph seed (DESIGN_POC section 6.4), so a
 * later employer switch loads a different pack rather than a different engine.
 *
 * The seed is a fixed literal: same nodes, same fields, same edges, same order,
 * every boot. Nothing here consumes the simulation RNG, which keeps the world
 * replayable and leaves the RNG stream to the systems that vary outcomes.
 */
export const COMPANY = {
  name: 'Workgrumble Ltd',
  domain: 'WORKGRUMBLE',
  motto: 'Established 1987. Refurbished 1994. Untouched since.',
} as const;

export const COMPANY_IDS = {
  /** The player. */
  player: 'person:pat',
  playerAccount: 'account:pat',
  playerMachine: 'machine:beige-box',
  monitor: 'device:monitor',
  fan: 'service:chassis-fan',

  /** The boss. Mail nags now, boss mechanics in M3. */
  boss: 'person:desmond',
  bossAccount: 'account:desmond',

  ada: 'person:ada',
  adaAccount: 'account:ada',
  adaMachine: 'machine:ada',
  adaMouse: 'device:ada-mouse',

  gary: 'person:gary',
  garyAccount: 'account:gary',
  garyMachine: 'machine:gary',
  garyMailRule: 'mail_rule:gary-autofile',

  nina: 'person:nina',
  ninaAccount: 'account:nina',

  bev: 'person:bev',
  bevAccount: 'account:bev',

  printServer: 'machine:print',
  printer: 'device:printer',
  spooler: 'service:spooler',
  vpn: 'service:vpn',

  printUsers: 'group:print-users',
  vpnUsers: 'group:vpn-users',
  commonShare: 'share:common',
} as const;

export type CompanyNodeId = (typeof COMPANY_IDS)[keyof typeof COMPANY_IDS];

interface StaffSeed {
  readonly person: string;
  readonly account: string;
  readonly name: string;
  readonly title: string;
  readonly username: string;
  readonly locked: boolean;
  readonly desk: string;
}

const STAFF: readonly StaffSeed[] = [
  {
    person: COMPANY_IDS.player,
    account: COMPANY_IDS.playerAccount,
    name: 'Pat Pending',
    title: 'IT Support Technician (probationary)',
    username: 'ppending',
    locked: false,
    desk: 'The cupboard with the good kettle',
  },
  {
    person: COMPANY_IDS.boss,
    account: COMPANY_IDS.bossAccount,
    name: 'Desmond Frisk',
    title: 'Service Delivery Lead',
    username: 'dfrisk',
    locked: false,
    desk: 'The office with the door',
  },
  {
    person: COMPANY_IDS.ada,
    account: COMPANY_IDS.adaAccount,
    name: 'Ada Whitlock',
    title: 'Senior Account Manager',
    username: 'awhitlock',
    locked: false,
    desk: 'Sales, by the window she will not stop opening',
  },
  {
    person: COMPANY_IDS.gary,
    account: COMPANY_IDS.garyAccount,
    name: 'Gary Poole',
    title: 'Payroll Clerk',
    username: 'gpoole',
    locked: true,
    desk: 'Payroll, behind the plant',
  },
  {
    person: COMPANY_IDS.nina,
    account: COMPANY_IDS.ninaAccount,
    name: 'Nina Okafor',
    title: 'Logistics Coordinator',
    username: 'nokafor',
    locked: false,
    desk: 'Logistics, nearest the printer and regretting it',
  },
  {
    person: COMPANY_IDS.bev,
    account: COMPANY_IDS.bevAccount,
    name: 'Bev Tannock',
    title: 'Reception',
    username: 'btannock',
    locked: false,
    desk: 'Reception, guarding the visitor biscuits',
  },
];

const GROUP_MEMBERSHIPS: readonly { account: string; group: string }[] = [
  { account: COMPANY_IDS.playerAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.playerAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.bossAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.adaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.adaAccount, group: COMPANY_IDS.vpnUsers },
  { account: COMPANY_IDS.garyAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.ninaAccount, group: COMPANY_IDS.printUsers },
  { account: COMPANY_IDS.bevAccount, group: COMPANY_IDS.printUsers },
];

/** Gary is deliberately left off the share: it gives grant_access a job. */
const SHARE_ACCESS: readonly string[] = [
  COMPANY_IDS.playerAccount,
  COMPANY_IDS.bossAccount,
  COMPANY_IDS.adaAccount,
  COMPANY_IDS.ninaAccount,
];

export function seedCompanyWorld(graph: EntityGraph): void {
  for (const member of STAFF) {
    graph.addNode({
      id: member.person,
      kind: 'person',
      fields: {
        [FIELDS.name]: member.name,
        [FIELDS.title]: member.title,
        [FIELDS.desk]: member.desk,
      },
    });
    graph.addNode({
      id: member.account,
      kind: 'account',
      fields: {
        [FIELDS.username]: member.username,
        [FIELDS.locked]: member.locked,
        [FIELDS.enabled]: true,
      },
    });
    graph.addEdge({
      from: member.person,
      to: member.account,
      kind: 'owns',
    });
  }

  graph.addNode({
    id: COMPANY_IDS.playerMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'BEIGE-BOX',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '1024x768',
      [FIELDS.pendingUpdates]: false,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.adaMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'SALES-02',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '1024x768',
      [FIELDS.pendingUpdates]: true,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.garyMachine,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'PAYROLL-04',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '800x600',
      [FIELDS.pendingUpdates]: true,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.printServer,
    kind: 'machine',
    fields: {
      [FIELDS.hostname]: 'PRINT-01',
      [FIELDS.displayRotation]: 0,
      [FIELDS.resolution]: '640x480',
      [FIELDS.pendingUpdates]: true,
    },
  });

  graph.addNode({
    id: COMPANY_IDS.monitor,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Trinitrend 15"',
      [FIELDS.type]: DEVICE_TYPES.monitor,
      [FIELDS.powered]: true,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.printer,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Hercules 400',
      [FIELDS.type]: DEVICE_TYPES.printer,
      [FIELDS.powered]: true,
      [FIELDS.wedged]: false,
      [FIELDS.queueLen]: 0,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.adaMouse,
    kind: 'device',
    fields: {
      [FIELDS.name]: 'Sales spare mouse',
      [FIELDS.type]: DEVICE_TYPES.mouse,
      [FIELDS.powered]: true,
      [FIELDS.batteryPct]: 4,
    },
  });

  // The fan reports a status like everything else on this box, and that is
  // the whole trap: it is a lump of spinning plastic, not a service. Saying
  // so here is what keeps "restart it" honest everywhere downstream.
  graph.addNode({
    id: COMPANY_IDS.fan,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Chassis fan',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: false,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.spooler,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'Print Spooler',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });
  graph.addNode({
    id: COMPANY_IDS.vpn,
    kind: 'service',
    fields: {
      [FIELDS.name]: 'VPN Concentrator',
      [FIELDS.status]: SERVICE_STATUS.running,
      [FIELDS.restartable]: true,
    },
  });

  graph.addNode({
    id: COMPANY_IDS.printUsers,
    kind: 'group',
    fields: { [FIELDS.name]: 'Print Users' },
  });
  graph.addNode({
    id: COMPANY_IDS.vpnUsers,
    kind: 'group',
    fields: { [FIELDS.name]: 'VPN Users' },
  });

  graph.addNode({
    id: COMPANY_IDS.commonShare,
    kind: 'share',
    fields: {
      [FIELDS.name]: 'Common Drive',
      [FIELDS.path]: `\\\\${COMPANY.domain}\\common`,
    },
  });

  graph.addNode({
    id: COMPANY_IDS.garyMailRule,
    kind: 'mail_rule',
    fields: {
      [FIELDS.name]: 'Anything from Desmond, file under Later',
      [FIELDS.enabled]: true,
      [FIELDS.target]: 'Later (a folder nobody opens)',
    },
  });

  graph.addEdge({
    from: COMPANY_IDS.player,
    to: COMPANY_IDS.playerMachine,
    kind: 'owns',
  });
  graph.addEdge({
    from: COMPANY_IDS.ada,
    to: COMPANY_IDS.adaMachine,
    kind: 'owns',
  });
  graph.addEdge({
    from: COMPANY_IDS.gary,
    to: COMPANY_IDS.garyMachine,
    kind: 'owns',
  });
  // The lead signed for the print server years ago and has never once looked
  // at it. Ownership on paper, ownership in practice: not the same graph.
  graph.addEdge({
    from: COMPANY_IDS.boss,
    to: COMPANY_IDS.printServer,
    kind: 'owns',
  });
  graph.addEdge({
    from: COMPANY_IDS.gary,
    to: COMPANY_IDS.garyMailRule,
    kind: 'owns',
  });

  graph.addEdge({
    from: COMPANY_IDS.monitor,
    to: COMPANY_IDS.playerMachine,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: COMPANY_IDS.printer,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: COMPANY_IDS.adaMouse,
    to: COMPANY_IDS.adaMachine,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: COMPANY_IDS.playerMachine,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: COMPANY_IDS.adaMachine,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: COMPANY_IDS.garyMachine,
    to: COMPANY_IDS.printServer,
    kind: 'connected_to',
  });

  // Which printer the spooler actually feeds. Written down rather than
  // guessed from "whatever else is plugged into that box", because the VPN
  // shares the same server and has nothing to do with anybody's backlog.
  graph.addEdge({
    from: COMPANY_IDS.spooler,
    to: COMPANY_IDS.printer,
    kind: 'connected_to',
  });

  graph.addEdge({
    from: COMPANY_IDS.fan,
    to: COMPANY_IDS.playerMachine,
    kind: 'runs_on',
  });
  graph.addEdge({
    from: COMPANY_IDS.spooler,
    to: COMPANY_IDS.printServer,
    kind: 'runs_on',
  });
  // The VPN concentrator shares the print server because it was the only box
  // with a free slot the week it arrived. This is load-bearing beige.
  graph.addEdge({
    from: COMPANY_IDS.vpn,
    to: COMPANY_IDS.printServer,
    kind: 'runs_on',
  });

  for (const membership of GROUP_MEMBERSHIPS) {
    graph.addEdge({
      from: membership.account,
      to: membership.group,
      kind: 'member_of',
    });
  }

  for (const account of SHARE_ACCESS) {
    graph.addEdge({
      from: account,
      to: COMPANY_IDS.commonShare,
      kind: 'has_access',
    });
  }
}
