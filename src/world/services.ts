/**
 * What is actually running on a box in this building.
 *
 * Found by the owner playing the live build: `services BEIGE-BOX` listed a
 * chassis fan and nothing else. A real workstation runs dozens of services, and
 * the first-line skill is not reading a list of one - it is reading a list of
 * twenty and finding the one line that is wrong. A world that shows only the
 * broken thing has done the diagnosis for the player and called it a game.
 *
 * So every machine on the estate carries a BASELINE: real service names, real
 * display names, a status and a startup type, seeded from the tables below by
 * the role the box has. Two classes live in the same list and both are honest:
 *
 * - Ticket-relevant services, written by hand in `company.ts`, which the world
 *   moves - the spooler that wedges, the backup agent that stopped itself, the
 *   report job nobody has run since the spring.
 * - Baseline services, from here, which are real and stable. They do not change
 *   on their own and no ticket is about them. What they are NOT is scenery: a
 *   baseline service asked to restart either restarts - the Manual ones that
 *   are legitimately stopped do exactly that - or refuses for a reason that is
 *   true of it, which is what `service_class` and `startup_type` are for.
 *
 * The startup types are the honest ones for each service, which is why three of
 * them are Disabled and four are Manual and stopped. A stopped Manual service
 * is not a fault; learning to walk past it is half the skill, and the other
 * half is knowing that an Automatic service which is stopped IS one.
 *
 * Sources: `docs/research/real-systems.md` section 3 (services.msc columns:
 * Name, Description, Status, Startup Type, Log On As) and the service names as
 * the real Service Control Manager spells them. Deliberate omissions - the
 * Description and Log On As columns, dependencies, recovery actions - are
 * written down in `docs/research/terminal-fidelity.md` rather than faked.
 */

import {
  type MachineRole,
  MACHINE_ROLES,
  SERVICE_CLASSES,
  SERVICE_STATUS,
  type ServiceClass,
  type ServiceStatus,
  STARTUP_TYPES,
  type StartupType,
} from './fields';

export interface BaselineService {
  /** What the machine calls it: `Spooler`, `Dnscache`, `wuauserv`. */
  readonly service: string;
  /** What a human calls it, and what a services list is sorted by. */
  readonly name: string;
  readonly startup: StartupType;
  readonly status: ServiceStatus;
  /** Ordinary services leave this off; the ones the manager guards say so. */
  readonly serviceClass?: ServiceClass;
}

/**
 * The list every box in this building runs, whatever it is for.
 *
 * Ordered the way a services list is: alphabetically by display name, because
 * that is how the real one opens and it is the order a player will scan.
 */
const WORKSTATION_SERVICES: readonly BaselineService[] = [
  {
    service: 'Audiosrv',
    name: 'Audio Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'wuauserv',
    name: 'Automatic Updates',
    // Delayed on purpose: it is what an update service is set to, and it is the
    // true answer to "it was not running two minutes after the reboot".
    startup: STARTUP_TYPES.delayed,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'BITS',
    name: 'Background Intelligent Transfer Service',
    startup: STARTUP_TYPES.manual,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'ClipSrv',
    name: 'ClipBook',
    startup: STARTUP_TYPES.manual,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'Browser',
    name: 'Computer Browser',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'Dhcp',
    name: 'DHCP Client',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'TrkWks',
    name: 'Distributed Link Tracking Client',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'Dnscache',
    name: 'DNS Client',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'EventLog',
    name: 'Event Log',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    // Everything that writes a line to the Event Viewer is holding this open.
    serviceClass: SERVICE_CLASSES.system,
  },
  {
    service: 'Messenger',
    name: 'Messenger',
    // Switched off across the estate the week somebody discovered net send.
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'Netlogon',
    name: 'Net Logon',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'PlugPlay',
    name: 'Plug and Play',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    serviceClass: SERVICE_CLASSES.system,
  },
  {
    service: 'Spooler',
    name: 'Print Spooler',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'ProtectedStorage',
    name: 'Protected Storage',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'RemoteRegistry',
    name: 'Remote Registry',
    // Disabled everywhere by a policy nobody can find the paperwork for, which
    // is also the reason nothing on this estate can read a box remotely.
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'RpcSs',
    name: 'Remote Procedure Call (RPC)',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    serviceClass: SERVICE_CLASSES.system,
  },
  {
    service: 'seclogon',
    name: 'Secondary Logon',
    startup: STARTUP_TYPES.manual,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'LanmanServer',
    name: 'Server',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'Schedule',
    name: 'Task Scheduler',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'Themes',
    name: 'Themes',
    // Turned off for performance in 2003 by somebody who read a magazine.
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'W32Time',
    name: 'Time Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'LanmanWorkstation',
    name: 'Workstation',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
];

/**
 * The same list on a box nobody sits at.
 *
 * A server with a sound card nobody has ever plugged a speaker into does not
 * run an audio service, and the two desktop toys are off for the same reason.
 * Written as overrides rather than a second table so that a change to the
 * baseline reaches every machine in the building, which is what a baseline is.
 */
const SERVER_OVERRIDES: Readonly<Record<string, Partial<BaselineService>>> = {
  Audiosrv: {
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
  ClipSrv: {
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
};

function withOverrides(
  services: readonly BaselineService[],
  overrides: Readonly<Record<string, Partial<BaselineService>>>,
): readonly BaselineService[] {
  return services.map((service) => {
    const change = overrides[service.service];
    return change === undefined ? service : { ...service, ...change };
  });
}

/** Alphabetical by display name, the way the real list opens. */
function ordered(
  services: readonly BaselineService[],
): readonly BaselineService[] {
  return [...services].sort(
    (left, right) => left.name.localeCompare(right.name),
  );
}

const SERVER_SERVICES = withOverrides(WORKSTATION_SERVICES, SERVER_OVERRIDES);

const PRINT_SERVER_SERVICES: readonly BaselineService[] = ordered([
  ...SERVER_SERVICES,
  {
    service: 'LPDSVC',
    name: 'TCP/IP Print Server',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
]);

const FILE_SERVER_SERVICES: readonly BaselineService[] = ordered([
  ...SERVER_SERVICES,
  {
    service: 'Dfs',
    name: 'Distributed File System',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'MSDTC',
    name: 'Distributed Transaction Coordinator',
    startup: STARTUP_TYPES.manual,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'NtmsSvc',
    name: 'Removable Storage',
    // The tape drive. Manual since somebody stopped changing the tapes.
    startup: STARTUP_TYPES.manual,
    status: SERVICE_STATUS.stopped,
  },
]);

const DOMAIN_CONTROLLER_SERVICES: readonly BaselineService[] = ordered([
  ...SERVER_SERVICES,
  {
    service: 'DHCPServer',
    name: 'DHCP Server',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'NTDS',
    name: 'Directory Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    // Stopping the directory on the only domain controller in the building is
    // not a thing the manager will take a control for, and it is the truest
    // "no" on this estate: everybody's logon is behind it.
    serviceClass: SERVICE_CLASSES.system,
  },
  {
    service: 'DNS',
    name: 'DNS Server',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'NtFrs',
    name: 'File Replication Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'IsmServ',
    name: 'Intersite Messaging',
    // One site, one building, one corridor. There is nothing to message.
    startup: STARTUP_TYPES.disabled,
    status: SERVICE_STATUS.stopped,
  },
  {
    service: 'kdc',
    name: 'Kerberos Key Distribution Center',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    serviceClass: SERVICE_CLASSES.system,
  },
]);

export const BASELINE_SERVICES: Readonly<
  Record<MachineRole, readonly BaselineService[]>
> = {
  [MACHINE_ROLES.workstation]: ordered(WORKSTATION_SERVICES),
  [MACHINE_ROLES.printServer]: PRINT_SERVER_SERVICES,
  [MACHINE_ROLES.fileServer]: FILE_SERVER_SERVICES,
  [MACHINE_ROLES.domainController]: DOMAIN_CONTROLLER_SERVICES,
};

/**
 * The id a baseline service gets on a given box.
 *
 * Every machine runs its own copy, because every machine does: the DNS Client
 * on the payroll clerk's desk and the one on the file server are two different
 * services that happen to share a name, and a world with one shared node would
 * let a fix on one box repair another.
 */
export function baselineServiceId(machineId: string, service: string): string {
  const box = machineId.includes(':')
    ? machineId.slice(machineId.indexOf(':') + 1)
    : machineId;

  return `service:${box}/${service.toLowerCase()}`;
}
