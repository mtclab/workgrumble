# Spike: the heterogeneous estate (Windows + Linux)

**Dated 2026-08-05. Data-scoped gate for E5's estate half (epic #6).** Nothing in
the build slice below ships until this records the real facts it stands on -
same discipline as `docs/research/terminal-fidelity.md` (one row, real shape,
cited behaviour, deliberate omissions).

## The decision this spike serves

Owner (2026-08-05): the estate is MIXED, not a player-desktop reskin. Windows
workstations + Windows servers (AD, IIS, the frustrating enterprise stuff) +
**Linux servers running the actual product the company sells**. Company
archetype is a world axis (workstation-only shops vs SaaS/product shops with a
Linux fleet), which sits on the employer registry shipped in 0.6.0.

Sequencing DECIDED: build the estate as WORLD DATA now, truthful in the
read-only surfaces a Service-Desk player already has. The player's own Linux
DESKTOP and hands-on Linux-server MANAGEMENT (ssh + `systemctl`/`journalctl`)
gate on the Engineer tier (E6), which is not built - 0.6.0 was a lateral
employer switch, not a promotion. So this slice adds Linux to the WORLD and to
what the SD player can SEE and honestly CANNOT DO YET; it does not add the unix
terminal or server management. Those arrive with the promotion that unlocks
them.

The load-bearing rule stays the family rule from `terminal-fidelity.md`:
**families are not one shell in hats.** A Linux box is not a Windows box with a
penguin on it - a Windows-family tool aimed at one answers the way the real tool
answers a host it cannot manage, and that refusal is itself the lesson that
there is another family here and another set of tools to learn.

## 1. Model change: an `os` dimension orthogonal to role

Today every machine is implicitly Windows; `FIELDS.machineRole` (`role`) selects
a baseline service set (`workstation` / `print_server` / `file_server` /
`domain_controller`) in `services.ts`. Add:

- `FIELDS.machineOs` (`os`): `windows` | `linux`. Seeded per machine, never
  guessed from the hostname (same rule the role already follows). Absent = 
  `windows` for back-compat with any save/fixture that predates it.
- New Windows role: `iis_server` (an application/web server - the intranet, the
  timesheet portal, the thing that breaks on a Friday).
- New Linux roles: `app_server` (the product), `db_server` (its database). Both
  carry `os: linux`.
- The baseline map becomes os-aware: a Windows role selects a Windows service
  set (as now); a Linux role selects a **systemd unit** set (below). The
  existing four roles keep their exact current service sets - the goldens for
  the fourteen existing boxes move only because a new field was added to them,
  which is a conscious diff, not new content on those boxes.

Goldens: this MOVES EVERY GOLDEN (new field on every machine + new nodes). A
deliberate slice, called out the way `services.ts` and the filesystem slice were.

## 2. Windows servers - what a small corporate estate really runs

The estate already has `DC-01` (domain_controller). This spike CITES the real
service names so the AD and IIS boxes are honest, not decoration. All are
FAITHFUL names, SHAPED estate.

### Domain Controller (AD DS) - already present, confirm the baseline is real

A real DC runs, on top of the server baseline:

| Service (key) | Display name | Note |
| --- | --- | --- |
| `NTDS` | Active Directory Domain Services | the directory itself |
| `DNS` | DNS Server | already modelled on the DC via `DOMAIN_CONTROLLER_SERVICES` |
| `Netlogon` | Netlogon | secure channel; already on every workstation baseline |
| `Kdc` | Kerberos Key Distribution Center | auth |
| `DFSR` | DFS Replication | SYSVOL replication |
| `W32Time` | Windows Time | the DC is the time authority; skew breaks Kerberos - a real ticket class, deferred |

Deliberate omission for this slice: no second DC, no replication FAULT content
(that is Engineer/E6 material - `repadmin`, USN rollback). The DC is present and
NAMED correctly so the estate is coherent; its failure modes are not this slice.

### IIS application server (new: `iis_server`)

Windows member server running IIS. Real services on top of the server baseline:

| Service (key) | Display name | Note |
| --- | --- | --- |
| `W3SVC` | World Wide Web Publishing Service | the web server |
| `WAS` | Windows Process Activation Service | W3SVC depends on it - stop WAS and W3SVC goes too, a real dependency lesson |
| `AppHostSvc` | Application Host Helper Service | applicationHost.config |

IIS **application pools** are NOT services - they are managed with
`appcmd list apppool` / `appcmd recycle apppool` or the IIS Manager GUI. A
recycled app pool is the canonical "the intranet is slow / throwing 503s" L1-L2
fix. For THIS slice the box exists and its services are honest; `appcmd` and the
app-pool recycle are Engineer content (they are a real management verb, and this
slice deliberately ships no management of servers). The honest refusal path (3)
covers a player who tries `sc` against it - which DOES work, it is Windows - but
the app-pool concept is named as "not a service" the way `services.ts` already
lists a chassis fan below the table.

## 3. Linux product servers (Ubuntu 24.04 LTS) - systemd units, cited

The product runs here. Real systemd units on an Ubuntu 24.04 app server:

| Unit | What it is | Note |
| --- | --- | --- |
| `nginx.service` | reverse proxy / web front | the public face of the product |
| `<product>.service` | the app (gunicorn/uwsgi/node under systemd) | named per employer's product; a real unit, `Type=notify` or `simple` |
| `ssh.service` | OpenSSH daemon (`sshd`) | how an Engineer reaches it - E6 |
| `systemd-journald.service` | the log; `journalctl` reads it | maps to the SAME `event_log` a Windows box's Event Viewer reads |
| `cron.service` | scheduled jobs | the 3am batch that fails silently - deferred content |
| `ufw.service` | firewall | "the port is closed" tickets - deferred |

DB server (`db_server`): `postgresql.service` (+ `postgresql@16-main` templated
unit on 24.04) or `mysql.service`. One or the other per employer, cited at seed
time.

Status vocabulary (systemd, real): `active (running)`, `active (exited)`,
`inactive (dead)`, `failed`, `activating`. This is the Linux analogue of the
world's `RUNNING`/`STOPPED`/`WEDGED` - `failed` is the honest word for a unit
that died, and unlike the invented `WEDGED` it has a real systemd meaning. The
Linux service model is DATA the same way the Windows one is; nothing is printed
that the graph does not hold.

**Key truth for this slice:** these units EXIST on the boxes as world data (so a
future `systemctl status nginx` at E6 reads them), but the SD player has no
`systemctl` and no ssh, so they are not yet READABLE by the player. They are the
estate being real ahead of the tools to touch it - exactly how the filesystem
slice seeded files before every command that reads them existed.

## 4. Cross-OS command honesty (what the SD player experiences NOW)

The SD player's terminal is Windows-family (`cmd`/`sc`/`net`/`tasklist`). The
change they SEE this slice is: those tools, aimed at a Linux box, refuse the way
the real tools do - and the refusal names the other family.

| Player action at a Linux host | Honest response | Why |
| --- | --- | --- |
| `sc query APP-01\nginx` | refused: `APP-01 is not a Windows host. sc queries the Windows Service Control Manager; this box runs systemd, which this terminal does not speak.` | `sc` genuinely cannot reach a non-Windows SCM |
| `services APP-01` | same refusal shape | `services.msc` is Windows-only |
| `tasklist /s APP-01` | already refused (Remote Registry Disabled) - now ALSO honest that it is not Windows | real tasklist `/s` needs Windows RPC |
| `restart APP-01\nginx` | refused: a Windows stop/start verb does not reach a systemd unit; named as Engineer/ssh work | truthful capability boundary |
| `ping APP-01`, `nslookup app-01`, `tracert APP-01` | WORK normally | the network layer is OS-agnostic; the box is reachable and named, and the reply proves the wire and nothing about the service (same closing truth `ping` already tells) |

This is the whole player-facing payload of the slice, and it is honest on both
sides: the Windows reads that are network-level succeed; the Windows management
tools refuse a box they were never able to manage, and say why. A player learns
"there are Linux boxes here, my current tools stop at the wire, and there is a
toolset I do not have yet" - which is the exact on-ramp to E6, taught by the
world refusing rather than by a tutorial.

## 5. Employer estate archetypes (on the 0.6.0 registry)

Estate shape becomes a property of the employer, read the way `installPolicy`
and `reviewBar` already are:

- **Corporate / workstation-heavy** (probation shop today): many workstations +
  DC (AD) + file/print + ONE IIS intranet box + ONE or two Linux product boxes
  the company barely acknowledges. The default, and what the fourteen-box estate
  already almost is - this slice adds the IIS box and the Linux box(es).
- **Wild-west** (Bodgeworth): a smaller, undocumented mix - a Linux box in the
  corner running something nobody wrote down, no DC worth the name. Fits the
  shop's character and teaches that "no map of the estate" is itself a condition.
- **SaaS / product shop** (a FUTURE employer, not this slice): mostly Linux
  fleet running the product, a thin Windows presence for the office. Named here
  as the archetype the axis exists for; building the employer is its own slice
  like Bodgeworth was.

This slice makes the EXISTING two employers' estates honest and heterogeneous;
it does not add a new employer.

## 6. The SD-visible / Engineer-gated line (explicit, so the slice stays honest)

SD player gets, this slice: the boxes EXIST, are reachable and nameable, appear
in topology/DNS, can be referenced by tickets ("customers say the product is
down" -> the SD move is to confirm reachability and ESCALATE, not to fix), and
the honest refusals of section 4.

Engineer (E6) gets, later: the unix terminal (`ls`/`systemctl`/`journalctl`/
`ss`/`ip`/`dig` at real fidelity), ssh to reach the Linux boxes, the player's
own Linux DESKTOP as a choosable skin, IIS app-pool recycles, AD replication
faults, on-call. The Ubuntu 24.04 command-surface research (dir->ls -la shape,
ipconfig->ip a, sc->systemctl status, net stop->systemctl restart, tasklist->ps,
the continuous-ping / traceroute-not-installed / cd-goes-home divergences) is
recorded when E6 builds it - it is NOT needed for this slice, because this slice
ships no unix commands. Flagged here so the boundary is a decision, not a drift.

## Feasibility verdict

BUILD-READY for the estate slice. No external data dependency - every fact above
is a stable, real service/unit name held as world data, printed only where the
graph holds it. The one genuine engineering item is the os-aware baseline map in
`services.ts` and the honest cross-OS refusals; both sit on seams that already
exist (`machineRole` selection, the refusal vocabulary `sc`/`services`/`restart`
already carry). Goldens move once, deliberately.
