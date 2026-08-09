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
  SYSTEMD_STATES,
  type SystemdState,
  UNIT_ENABLEMENTS,
  type UnitEnablement,
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
    // The real display name of the NTDS service, and the honest one: this box
    // IS the directory. "Directory Service" was the Windows 2000 wording; the
    // estate names Active Directory the way a current DC's services list does.
    name: 'Active Directory Domain Services',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
    // Stopping the directory on the only domain controller in the building is
    // not a thing the manager will take a control for, and it is the truest
    // "no" on this estate: everybody's logon is behind it.
    serviceClass: SERVICE_CLASSES.system,
  },
  {
    service: 'DFSR',
    name: 'DFS Replication',
    // SYSVOL replication the modern way. It sits beside the legacy FRS below
    // because this estate migrated and, like everything here, never cleaned up
    // the service it replaced - which is exactly how real DCs are found.
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
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

/**
 * The IIS member server: the server baseline plus the web stack.
 *
 * `WAS` is `W3SVC`'s dependency - stop the activation service and the web
 * server goes with it, which is the real dependency lesson a recycled app pool
 * teaches. The app pools themselves are NOT services (they are `appcmd` /
 * IIS Manager objects), so they are not in this list any more than a chassis
 * fan is; recycling one is Engineer work and arrives with the tools for it.
 */
const IIS_SERVER_SERVICES: readonly BaselineService[] = ordered([
  ...SERVER_SERVICES,
  {
    service: 'W3SVC',
    name: 'World Wide Web Publishing Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'WAS',
    name: 'Windows Process Activation Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
  {
    service: 'AppHostSvc',
    name: 'Application Host Helper Service',
    startup: STARTUP_TYPES.automatic,
    status: SERVICE_STATUS.running,
  },
]);

/**
 * A systemd unit on a Linux box.
 *
 * A parallel shape to `BaselineService`, not the same one, because a unit and a
 * Windows service are two different things two different managers know about -
 * a unit has systemd's own state words and a `.service` name that carries its
 * type. Sharing a type would be the first step towards one shell in hats, which
 * is the exact failure the terminal-fidelity bar forbids.
 *
 * These units EXIST on the boxes as world data - a future `systemctl status` at
 * the Engineer tier reads them - but the Service-Desk player has no `systemctl`
 * and no ssh, so nothing here is READABLE yet. The estate is real ahead of the
 * tools to touch it, exactly how the filesystem slice seeded files first.
 */
export interface LinuxUnit {
  /** What systemctl takes: `nginx.service`, `postgresql@16-main.service`. */
  readonly unit: string;
  /** The unit's `Description=`, what `systemctl status` prints on the top line. */
  readonly name: string;
  readonly state: SystemdState;
  readonly enabled: UnitEnablement;
}

/**
 * The units any Ubuntu 24.04 box runs whatever it is for - the Linux analogue
 * of the workstation baseline. The product and the database sit on top of these.
 */
export const UBUNTU_BASE_UNITS: readonly LinuxUnit[] = [
  {
    unit: 'cron.service',
    name: 'Regular background program processing daemon',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'ssh.service',
    name: 'OpenBSD Secure Shell server',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'systemd-journald.service',
    name: 'Journal Service',
    state: SYSTEMD_STATES.activeRunning,
    // Pulled in by systemd itself; it cannot be enabled or disabled, which is
    // what `static` means and what `systemctl is-enabled` says for it.
    enabled: UNIT_ENABLEMENTS.static,
  },
];

/** Alphabetical by unit name, the way `systemctl list-units` sorts. */
function orderedUnits(units: readonly LinuxUnit[]): readonly LinuxUnit[] {
  return [...units].sort((left, right) => left.unit.localeCompare(right.unit));
}

/**
 * The product application server: nginx out front, the product behind it, on
 * the base units. `grumbleapp.service` is Workgrumble Ltd's own line-of-business
 * app - the thing customers log into - run under systemd the way a gunicorn or
 * uwsgi app is (`Type=notify`). A different employer's app server names its own
 * product; the base stack below it is the same on any Ubuntu box.
 */
const APP_SERVER_UNITS: readonly LinuxUnit[] = orderedUnits([
  {
    unit: 'nginx.service',
    name: 'A high performance web server and a reverse proxy server',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'grumbleapp.service',
    name: 'Workgrumble product application',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  ...UBUNTU_BASE_UNITS,
]);

/**
 * The database server. The `postgresql.service` meta-unit is a `Type=oneshot`
 * that shows `active (exited)` - it does no work itself, it just brings up the
 * real cluster, `postgresql@16-main.service`, which is the one that is running.
 * Both are real, and both being present is the honest shape on Ubuntu 24.04.
 */
const DB_SERVER_UNITS: readonly LinuxUnit[] = orderedUnits([
  {
    unit: 'postgresql.service',
    name: 'PostgreSQL RDBMS',
    state: SYSTEMD_STATES.activeExited,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'postgresql@16-main.service',
    name: 'PostgreSQL Cluster 16-main',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  ...UBUNTU_BASE_UNITS,
]);

/**
 * The edge (0.29.0). A modern small-business firewall is a Linux box with a
 * packet filter and a VPN daemon on it, and those are the two units on it worth
 * naming: `nftables.service` loads the rule set at boot, `strongswan.service` is
 * what the site-to-site tunnels actually run on. Everything else it does is
 * rules, which are not units - they are the rule nodes the project migrates.
 *
 * Both boxes in a replacement carry this list, old and new, and neither of them
 * has anything wrong with it: the NEW box boots with its daemons running and no
 * rules at all, which is exactly what makes it a project rather than a restart.
 */
const FIREWALL_UNITS: readonly LinuxUnit[] = orderedUnits([
  {
    unit: 'nftables.service',
    name: 'nftables-based firewall',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'strongswan.service',
    name: 'strongSwan IPsec IKEv1/IKEv2 daemon',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  ...UBUNTU_BASE_UNITS,
]);

/**
 * Fettle & Crane's OWN infrastructure box (E6, Pass B): the MSP's internal
 * Linux server, running the client portal customers log into behind nginx, on
 * the same Ubuntu base every other Linux box carries.
 *
 * `fcportal.service` is the MSP's own line-of-business app - not a customer's,
 * which is the whole point: an engineer fixing the employer's OWN infra crosses
 * no customer contract, so the box is the honest place the 0.7.0 "your tools do
 * not reach a Linux box" wall comes down. Seeded HEALTHY here; the first-fix
 * incident downs `fcportal.service` when it arrives, the way every fault in this
 * game arrives with its ticket.
 */
export const FC_INFRA_UNITS: readonly LinuxUnit[] = orderedUnits([
  {
    unit: 'nginx.service',
    name: 'A high performance web server and a reverse proxy server',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  {
    unit: 'fcportal.service',
    name: 'Fettle & Crane client portal',
    state: SYSTEMD_STATES.activeRunning,
    enabled: UNIT_ENABLEMENTS.enabled,
  },
  ...UBUNTU_BASE_UNITS,
]);

/**
 * The Windows service baseline per role. Partial because a role is either a
 * Windows role (here) or a Linux role (`BASELINE_UNITS` below), never both - the
 * seeder reads the machine's `os` and picks the matching map.
 */
export const BASELINE_SERVICES: Readonly<
  Partial<Record<MachineRole, readonly BaselineService[]>>
> = {
  [MACHINE_ROLES.workstation]: ordered(WORKSTATION_SERVICES),
  [MACHINE_ROLES.printServer]: PRINT_SERVER_SERVICES,
  [MACHINE_ROLES.fileServer]: FILE_SERVER_SERVICES,
  [MACHINE_ROLES.domainController]: DOMAIN_CONTROLLER_SERVICES,
  [MACHINE_ROLES.iisServer]: IIS_SERVER_SERVICES,
};

/** The systemd unit baseline per Linux role. */
export const BASELINE_UNITS: Readonly<
  Partial<Record<MachineRole, readonly LinuxUnit[]>>
> = {
  [MACHINE_ROLES.appServer]: APP_SERVER_UNITS,
  [MACHINE_ROLES.dbServer]: DB_SERVER_UNITS,
  [MACHINE_ROLES.firewall]: FIREWALL_UNITS,
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

/**
 * The id a systemd unit gets on a given box - the `unit:` analogue of
 * `baselineServiceId`, so every Linux box runs its own copy of `nginx.service`
 * the way every Windows box runs its own `Spooler`.
 */
export function linuxUnitId(machineId: string, unit: string): string {
  const box = machineId.includes(':')
    ? machineId.slice(machineId.indexOf(':') + 1)
    : machineId;

  return `unit:${box}/${unit.toLowerCase()}`;
}
