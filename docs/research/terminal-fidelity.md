# Terminal fidelity: one row per command

Standing bar, added in `docs/SPEC_020.md`. Every command this terminal admits to having
declares a TIER, and no new command ships without a row here.

- **FAITHFUL** - real syntax, real flags, real output shape, real error wording. A player who
  knows the tool recognises it and learns nothing false.
- **SHAPED** - the right concept and the right shape over smaller data, or over data this
  world has and the real one does not. Nothing in it is false; some of it is missing, and
  what is missing is written in the omissions column.
- **REFUSED HONESTLY** - answers the way a real shell answers something it cannot do, or says
  plainly that it is not simulated. A refusal teaches nothing; a fake teaches something wrong.

The house rules that apply to every row:

- **Families are not one shell in hats.** This estate is a Windows-family parody, so the
  spelling is `cmd`/`sc`/`net`, not `systemctl`. The unix skins arrive with the machines that
  would run them, and they will differ in output shape rather than in spelling.
- **No invented state.** Where a column would need a fact the world does not hold - a
  binary path, a service account, a dependency list - the column is left out rather than
  filled in. An omission is a gap; an invention is a lie the player learns.
- **The world is the only source.** Everything printed is read from the graph or derived by a
  pure function of it (`cmd-net.ts` derives every address). Nothing is a string in a switch.

| Command | Real syntax | Real output (cited) | Tier | Deliberate omissions |
| --- | --- | --- | --- | --- |
| `help` | none - `help` in cmd lists built-ins | `For more information on a specific command, type HELP command-name` | SHAPED | Ours lists this terminal's own verbs with usage and summary. There is no `help <command>` form; the usage line is printed by any command called wrong. |
| `ver` | `ver` | `Microsoft Windows [Version 10.0.19045.3803]` | FAITHFUL | Shape and bracket form kept; the name and the number are the parody OS's own. |
| `cls` | `cls` | clears the screen | FAITHFUL | none |
| `ping` | `ping <host>` | `Reply from 10.42.0.9: bytes=32 time=3ms TTL=57` / `Request timed out.` / `Packets: Sent = 4, Received = 4, Lost = 0` | SHAPED | Three packets rather than four, no `-t`/`-n`/`-l` switches, and the route it walks is the estate's `connected_to` graph. The closing line says out loud that a reply proves the network layer and nothing about the services on the box. |
| `tracert` | `tracert <host>` | `Tracing route to x [10.42.0.9] over a maximum of 30 hops:` then `  1    3 ms    4 ms    3 ms  gw.local [10.42.0.1]`, `Trace complete.` | FAITHFUL | Hop timings are a pure function of the hop and the host rather than measured; `*  *  *  Request timed out.` for an unreachable target, exactly as the real one gives up. No `-d`/`-h`. |
| `nslookup` | `nslookup <name>` | `Server:  gw.local` / `Address:  10.42.0.1` / `Name:` / `Address:` / `*** gw can't find x: Non-existent domain` | FAITHFUL | Non-interactive mode only; no record types, no `set type=`. Only machines have names - people, printers and grievances resolve nowhere, and it says so. |
| `ipconfig` | `ipconfig [/all] [/flushdns]` | `Windows IP Configuration`, `Ethernet adapter Local Area Connection:`, `   IPv4 Address. . . . . . . . . . . : 10.42.0.9`, `Successfully flushed the DNS Resolver Cache.` | FAITHFUL | `/all` and `/flushdns` only; `/renew`, `/release`, `/registerdns` are refused in the real shape (`"x" is not a switch this ipconfig has`). `/flushdns` changes nothing in the world, which is the joke and the truth. |
| `whoami` | `whoami [/groups]` | `workgrumble\ppending`, then `GROUP INFORMATION` / `-----------------` | FAITHFUL | `/groups` prints group names only - no SIDs, no attributes columns, because the estate has neither. No `/user`, `/priv`, `/all`. |
| `systeminfo` | `systeminfo [/S machine]` | `Host Name:`, `OS Name:`, `OS Version:`, `System Boot Time:`, `Processor(s):`, `Total Physical Memory:` | SHAPED | Label-and-value shape and the real field names, over the fields this world holds. The machine is named as a bare argument rather than `/S`. Hotfixes, network cards, BIOS, page file and domain role are omitted. `Registered Services:` is a COUNT with the name of the list beside it - the real one does not print services at all, and twenty-three names on one line is not a readout. `Attached Hardware:` is DEVICES only: a printer plugged into that box is attached hardware, and the thirteen machines that print through it are clients on the other end of a wire, which is a different question and not one this row answers. |
| `services` | `services.msc` (a window, not a command) | Columns: Name, Description, Status (`Running` / blank), Startup Type (`Automatic` / `Automatic (Delayed Start)` / `Manual` / `Disabled`), Log On As | SHAPED | A terminal listing of the services.msc columns. Display name, status and startup type are kept; **Description** and **Log On As** are omitted - this estate has no service accounts and inventing them would imply a fault class we do not simulate. Status words are this world's (`RUNNING`, `STOPPED`, `WEDGED`); `WEDGED` is the world's third state and has no code in a real manager. Things that report a status and are not services - a chassis fan, a licence pool - are listed BELOW the table with the reason, never in it. |
| `sc` | `sc [\\machine] query <service>` | `SERVICE_NAME: Spooler` / `        TYPE               : 10  WIN32_OWN_PROCESS` / `        STATE              : 4  RUNNING` / `                                (STOPPABLE, PAUSABLE, ACCEPTS_SHUTDOWN)` / `        WIN32_EXIT_CODE    : 0  (0x0)` | FAITHFUL | `query` only, with the block printed verbatim in shape. The machine is named as `PRINT-01\Spooler` rather than `sc \\PRINT-01`, which is the one deviation and the form every service-taking command here uses. `qc`, `config`, `start`, `stop`, `queryex` are refused honestly - starting and stopping are one verb in this world (`restart`), and a startup type is a change with a form attached. `PAUSABLE` is reported as `NOT_PAUSABLE`, because nothing here pauses. |
| `tasklist` | `tasklist [/s machine]` | `Image Name                     PID Session Name        Session#    Mem Usage` / `========================= ======== ================ =========== ============` / `System Idle Process              0 Console                    0         16 K` | FAITHFUL | Column widths and the `=` rule are the real ones. The list is the machine's own four processes plus one per OPEN WINDOW, which is what a process list is. No `/svc`, `/m`, `/fi`, `/v`. `/s` is refused with the estate's own reason: Remote Registry is Disabled on every box, which the player can see in any services list. |
| `users` | `net user <account>` (there is no `users`) | `User name`, `Account active`, `Account expires`, `Password last set`, `Local Group Memberships` | SHAPED | A plain-language read of the account, in label-and-value shape, over the fields this directory holds. Kept as its own verb because the game teaches the read before it teaches the spelling; `net user` is the same read under the real name. |
| `net` | `net user <account>`, `net use`, `net share`, `net start` | `The command completed successfully.` | SHAPED (one sub-command) | `net user <account>` only. Every other sub-command is refused by name, because `net use` and `net share` are a different job with different consequences and a stub of either would teach the wrong thing. |
| `restart` | `net stop <s>` + `net start <s>`, or `sc stop` / `sc start` | `The <name> service is stopping.` / `The <name> service was started successfully.` | SHAPED | One verb for the pair, because a service left stopped is a change with a form attached. Prints `Stopping ... / Starting ... service reports RUNNING`, which is the real pair's shape. Refuses with a reason true of the thing: a fan is hardware, a licence pool is somebody else's box, the manager will not take a stop control for `RpcSs`-class services, a `Disabled` service cannot be started by anything, a healthy service should not be bounced in front of a user, and a queue still full will jam the same service again. |
| `queue` | `wmic printjob list` / the printer's own queue window | `Document Name  Status  Owner  Pages  Size  Submitted` - the real queue window's columns | SHAPED | The job LIST, in the two columns this world has: a size and the minute it landed, under the job number the spooler gave it - which is the number on the spool file, so `queue` and `dir` on the spool directory cannot disagree about which job is which. Deliberately absent, and named on the last line of the output rather than left to be noticed: owner, document name, pages, port and per-job status. The estate has never known any of them, and a queue that invented forty-seven document names would be inventing the one thing this world deliberately does not hold - what anybody was printing. An empty queue prints the count and the spooler, because a table with no rows in it is not a readout. |
| `clearqueue` | `net stop spooler` + `del %systemroot%\System32\spool\PRINTERS\*` + `net start spooler` | the canonical L1 runbook (Microsoft Q&A, PaperCut) | SHAPED | One verb for the first two steps, and it SAYS it stopped the spooler and left it stopped, because the spool files belong to that service. Step three is `restart`. The files it drops are now a real directory - `\\PRINT-01\C$\WINDOWS\SYSTEM32\SPOOL\PRINTERS` - and emptying the queue empties it, which is asserted after every mutation that touches a queue rather than left to be noticed. |
| `dir` | `dir [path]` | ` Volume in drive C has no label.` / ` Volume Serial Number is 1A2B-3C4D` / ` Directory of C:\WINDOWS` / `07/09/1998  08:41    <DIR>          .` / `14/03/1997  11:02             1,024 WIN.INI` / `               1 File(s)          1,024 bytes` / `               2 Dir(s)     341,458,944 bytes free` | FAITHFUL | The header, the `.` and `..` rows, the date-and-time column, the `<DIR>` marker, the right-aligned thousand-separated size and both footer lines are the real shape, in the real columns. A path names a file lists that one file under its own directory's header, as the real one does. Deliberately absent: every switch (`/s`, `/b`, `/a`, `/o`, `/w`) and wildcards, both refused by name rather than stubbed - a `/s` that walked one level would teach a recursion that is not there. The date column is the estate's own calendar (day one is Monday 7 September 1998, in `hours.ts`), because the clock this game counts on has no year in it and a listing has to have one. A file's SIZE is the bytes `type` would print, so the two commands cannot disagree; `bytes free` is a seeded number on the machine, because a drive is mostly things nobody lists. Case is folded to find a name and echoed to print the path, which is this family's behaviour; the drive letter comes back as `C:` however it was typed. |
| `cd` | `cd [path]` | bare `cd` prints the working directory; `cd \\server\share` answers `CMD does not support UNC paths as current directories.` | FAITHFUL | Bare `cd` printing the path is the real Windows quirk and is the one place this family and a unix shell disagree outright - `cd` on its own goes home there and says the name of the room here. `..` at the root is silently nothing, exactly as the real one. Refusals are the real wording: `The system cannot find the path specified.` for a missing path, `The directory name is invalid.` for a file, `Access is denied.` for rights somebody else holds, and the UNC sentence above - which is why a remote path can be listed and read and never stood in. No `/d` and no second drive: this estate has one, and a letter that is not `C:` is refused rather than invented. `~` is not expanded; it is refused with the real not-found sentence and a line naming `%USERPROFILE%`, which is the spelling this family has. |
| `type` | `type <file>` | the file, and `Access is denied.` when the path is a directory | FAITHFUL | Prints the content and nothing around it. The directory refusal is the real one's, word for word, and is not a mistake in the shell: a directory is opened rather than read. `The system cannot find the file specified.` says "file" where `dir` says "path", because the real pair does. Deliberately absent: multiple files and wildcards, and the binary case - a spool file says out loud that it is the print job itself rather than putting a screenful of a printer's opinions on the screen and calling it a file. |
| `tree` | `tree [path] [/f]` | `Folder PATH listing` / `Volume serial number is 1A2B-3C4D` / `C:\WINDOWS` / `└───SYSTEM32` / `    ├───LOGFILES` | FAITHFUL | The header pair, the box-drawing branches and `/f` for files are the real ones; an unlabelled volume prints `Folder PATH listing` with no "for volume X" after it, which is what `dir` has already said about this drive. `No subfolders exist` is the real empty answer. Deliberately absent: `/a` (the ASCII form) and every other switch. A directory this account may not read is drawn as a branch that says `Access is denied.` rather than as an empty one, because an empty branch would be a lie about what is in there. |
| `move` | `move [/y] <source> <destination>` | `        1 file(s) moved.`, and `The system cannot find the file specified.` | SHAPED | The success line is the real one, spaces and all, and the destination is a DIRECTORY: the rename form (`move a.txt b.txt`) is not here, because a rename and a move are two jobs and only one of them is the ticket this verb exists for. Deliberately absent: `/y` and `/-y`, wildcards, and moving a directory - all three refused by name. The real one silently copies-and-deletes across drives; this one refuses, because on this estate the other drive is another box, that is a copy over the network with somebody else's disk on the far end, and the refusal says so. It will not overwrite: the real one prompts `Overwrite ...? (Yes/No/All)` and a terminal with no prompt in it cannot ask, so a destination that already holds that file is refused rather than answered for the player. The two entries this world derives - a spool file, a program's own output - refuse in their own words, because neither is a file anything can pick up. |
| `purge` | `del <path>\*.*` / `rd /s /q` - there is no `purge` | `Are you sure (Y/N)?`, then nothing | SHAPED | A verb for the one deletion a first-line tech should have, rather than a wildcard `del` that would delete whatever it was pointed at. It empties a directory whose contents are a SECOND copy of something and refuses every other directory on the estate by name, which is the entire judgement in it; the spool directory is refused separately and sent to the runbook, because those files belong to a running service. It prints what went, in the columns a listing's footer uses, and the free space afterwards - which is the number the diagnosis was made on. Deliberately absent: every switch, wildcards, deleting a named file, and recursion. There is no confirmation prompt: this terminal has no way to ask a question, so the check is in the refusals and in the fact that the verb has to be told, out loud, what it is emptying. |
| `rotate` | display settings, or `Ctrl+Alt+arrow` on the driver | no console equivalent | SHAPED | A verb for the fix rather than a fiction of a console command that does not exist. Refuses any angle that is not 0/90/180/270, which is what a monitor stand actually offers. |
| `unlock` | `net user <account> /active:yes` unlocks nothing; the real unlock is ADUC or `Unlock-ADAccount` | `Unlock-ADAccount -Identity x` | SHAPED | A verb for the desk's most common job. Deliberately distinct from `resetpw` and from enabling a disabled account, because those are three different faults that wear the same face at the login box. |
| `resetpw` | `net user <account> *` / `Set-ADAccountPassword` | prompts for the password twice | SHAPED | Issues a temporary password without prompting, and says out loud that it also clears the lockout and sets "must change at next logon" - three things a real reset dialog asks about separately. |
| `verify` | no command exists anywhere | - | SHAPED | The identity check is a process, not a tool, and this is the game's one verb for a thing that happens on the phone. It records WHICH approved channel was used, because "verified" has never been an answer to "how". |
| `mfa` | Entra: "Require re-register multifactor authentication" | portal action, no console form | SHAPED | One verb for the blade's button. Invalidates the previous binding and notifies the account owner, both of which the real one does and neither of which is optional. |
| `revoke` | `Revoke-AzureADUserAllRefreshToken` / "Revoke sessions" | portal action | SHAPED | Sessions only. It is the right fix for a session somebody else is holding and the wrong fix for a dead authenticator, which is why it is a verb of its own. |
| `licence` | vendor licence console; M365 Billing > Licenses | portal | SHAPED | `take` and `give` over a pool with a seat count. No SKUs, no service plans, no usage location. |
| `grant` | `Add-MailboxPermission -AccessRights FullAccess` | PowerShell | SHAPED | Full Access only, and it says in the outcome that Send As is a different permission with a different name - which is the entire lesson of the week's two-ticket chain. |
| `forget` | `cmdkey /delete` / the device's own credential store | `CMDKEY: Credential deleted successfully.` | SHAPED | One verb aimed at a device, because the device is where the stored password lives on this estate. |
| `renewcert` | `certreq` / the vendor appliance's own console | varies | SHAPED | A verb for the fix. It exists separately from `restart` because restarting a service puts the same expired certificate back in front of the same forty people. |
| `rule` | `Set-TransportRule -Enabled $true` | PowerShell | SHAPED (one direction) | `rule on` only. Switching a rule OFF is refused, because that is a change with a form attached - the same reason the world's transport rule was written in March and never enabled. |

## The unix half of the filesystem slice, and why it is not here

`SPEC_020` 0.2.3 lists `ls`, `cd`, `pwd`, `cat` and `less` beside the four above. They are
NOT shipped, and the reason is the first house rule on this page: families are not one shell
in hats. There is no Linux skin in this estate - every box in the building is a Windows-family
box, from `services.msc` down to the `Netlogon` on every workstation - so a `ls` would be a
unix spelling over a cmd-shaped world, printing this world's columns under another family's
name. That is the exact failure the bar exists to forbid, and it is worse than the absence:
the absence teaches nothing, and half a dialect teaches something wrong.

They arrive with the machines that would run them, and when they do they have to differ in
OUTPUT SHAPE rather than in spelling: `dir` prints a volume header, a date-and-size column
and a free-space footer; `ls` prints columns and nothing else, and `cd` on its own takes a
unix shell home rather than printing where it is.

## What the drive is, underneath these four

One paragraph, because every row above leans on it. Directories and files are nodes in the
same graph as everything else, joined by `contains` edges, and a listing is READ from it -
there is no second tree anywhere to keep true. Two entries are read from somewhere else in
the world rather than from a `content` field, and both are derived by a pure function of a
field another surface already paints:

- the spool directory on a print server IS the queue on the printer plugged into it, so what
  `dir` shows and what `queue` reports cannot come apart. The world holds one line per job -
  a size and a minute, nothing more, because that is what a listing prints - and the
  agreement between that list and the queue length is asserted after every mutation that
  touches either, including after every step of every advertised path in the solvability
  harness;
- `C:\WINDOWS\SYSTEM32\LOGFILES\SYSTEM.LOG` IS the machine's own event log, off the field the
  Event Viewer paints, so the file and the window are two views of one truth. Both windows now
  date a line the same way - `09/09/1998  16:56` - because a log line and a directory listing
  describing the same evening had no business making the player convert "Day 3" into a date.

There is a third directory whose listing is read rather than walked, and it is not derived from
another surface: a directory a PROGRAM fills. The world holds one line per file - a name, a size
and a minute - and holds nothing else, for the same reason the queue does: a file's size on these
drives is what `type` would print, so a directory of text files can never be a directory that has
eaten a drive, and a drive eaten by one directory is a real fault whose diagnosis is a listing's
own byte total held against the free space in its own footer. `type` on one of those files refuses
in the shape the spool refusal has, and for the same true reason - the world knows how big it is
and when it was written, and nothing else. The byte total the drive believes in is a second field
beside the list, exactly as `queue_len` sits beside `spool_jobs`, and `storedDisagreements` is the
gate that keeps the two in step after every mutation that touches either.

Reaching another box is `\\HOST\C$`, the administrative share, which works here for the
reason it works in the trade: the Server service is running on every box in this building and
the player can see that it is in any services list. It is a different mechanism from the
Remote Registry that `tasklist /s` is refused for, which is Disabled everywhere - and that
difference is the point.
