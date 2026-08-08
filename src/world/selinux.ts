/**
 * SELinux on the RHEL family (E6, 0.28.0): the one distro behaviour that is a
 * MECHANIC rather than a dialect, kept to a single authored beat.
 *
 * The distro axis is otherwise a table of words - the same install, the same
 * pending set, four spellings. This is the exception the spec carves out,
 * because "which words does this box use" and "what will this box REFUSE" are
 * different questions, and SELinux is the day the second one costs a real
 * engineer an afternoon. So there is exactly one denial in the game, on the one
 * box the player owns, and it is a real state on real nodes rather than a
 * simulator: a file with the wrong label, a service that will not serve it, and
 * the `avc: denied` line sitting in the journal saying so.
 *
 * WHY THE PLAYER'S OWN BOX, AND WHY THESE NODES. The estate's servers are the
 * Ubuntu the world seeds and they have no SELinux at all. The one machine that
 * can be on the RHEL family is the player's own, because the player is the only
 * person who gets to reinstall a workstation - and a reinstall is also the
 * honest CAUSE of this fault: you restore your files from a backup, the restore
 * carries them back as home-directory content, and the web server the local
 * portal copy runs behind is not allowed to read home-directory content. That
 * is not a contrivance, it is the single most common way a real engineer meets
 * SELinux.
 *
 * The nodes are built at RUNTIME, the first time the player actually stands on
 * the box (`ssh`, via the day driver), exactly the way the promotion builds the
 * MSP's incidents and an onboarding builds a customer's estate. Nothing is
 * seeded, so every golden world is byte-identical, and `setDesktop` stays what
 * 0.27.0 made it: chrome, dispatch-free, world-inert.
 */

import type { ReadOnlyGraphView, SetupOp } from '../engine-api';
import { FIELDS, SYSTEMD_STATES, UNIT_ENABLEMENTS } from './fields';
import { dayForTick } from './hours';

/** The two words `getenforce` answers with, and the field holds. */
export const SELINUX_MODES = {
  enforcing: 'enforcing',
  permissive: 'permissive',
} as const;

export type SelinuxMode = (typeof SELINUX_MODES)[keyof typeof SELINUX_MODES];

export function isSelinuxMode(value: unknown): value is SelinuxMode {
  return value === SELINUX_MODES.enforcing || value === SELINUX_MODES.permissive;
}

/**
 * The label a restore out of somebody's home directory carries, and the whole
 * of the fault: `user_home_t` is a real type, it is what `cp`/`tar` leaves on
 * content that came out of `/home`, and the targeted policy does not let
 * `httpd_t` read it. Nothing about the file's rwx bits is wrong, which is the
 * point.
 */
export const SELINUX_RESTORED_CONTEXT = 'unconfined_u:object_r:user_home_t:s0';

/** And what the policy says content under the web root is: the relabel target. */
export const SELINUX_WEB_CONTEXT = 'system_u:object_r:httpd_sys_content_t:s0';

/**
 * The one authored beat, as data.
 *
 * A local copy of the client portal, served by httpd off the RHEL web root, so
 * that changes can be tried without touching the customer-facing one. It is
 * `httpd` rather than nginx because on this family it genuinely is: the package
 * is httpd, the account is apache, and every SELinux boolean an engineer will
 * ever read about is named `httpd_*`.
 */
const SELINUX_SCENARIO = Object.freeze({
  unitName: 'httpd.service',
  unitDescription: 'The Apache HTTP Server',
  path: '/var/www/html/index.html',
  fileName: 'index.html',
  owner: 'apache',
  group: 'apache',
  /** 644: owner writes, everybody reads. There is nothing wrong with it. */
  mode: '644',
});

/** The ids the beat's two nodes take on a given box, derived off its hostname. */
export function selinuxNodeIds(hostname: string): {
  readonly unit: string;
  readonly file: string;
} {
  const host = hostname.toLowerCase();

  return {
    unit: `unit:${host}/${SELINUX_SCENARIO.unitName}`,
    file: `file:${host}${SELINUX_SCENARIO.path}`,
  };
}

/**
 * The journal the box has been writing since the restore: httpd's own
 * permission-denied line, and under it the kernel's raw AVC record.
 *
 * Both are here because they are what a real box shows and because they say
 * different things. Apache's line reads like a permission problem and is the
 * red herring the fault is famous for; the AVC line is the truth - it names the
 * source context (`httpd_t`), the target context (`user_home_t`) and
 * `permissive=0`, which is the whole diagnosis for anybody who reads it.
 */
function scenarioJournal(hostname: string): string {
  const host = hostname.toUpperCase();

  return [
    `Sep 07 14:02:11 ${host} systemd[1]: Started The Apache HTTP Server.`,
    `Sep 07 14:07:44 ${host} httpd[2118]: (13)Permission denied: [client `
      + '127.0.0.1:41022] AH00132: file permissions deny server access: '
      + '/var/www/html/index.html',
    `Sep 07 14:07:44 ${host} audit[2118]: AVC avc:  denied  { read } for  `
      + 'pid=2118 comm="httpd" name="index.html" dev="dm-0" ino=1179904 '
      + 'scontext=system_u:system_r:httpd_t:s0 '
      + `tcontext=${SELINUX_RESTORED_CONTEXT} tclass=file permissive=0`,
    `Sep 07 14:07:44 ${host} setroubleshoot[2204]: SELinux is preventing httpd `
      + 'from read access on the file index.html. For complete SELinux messages '
      + 'run: sealert -l 9f2a1c-e4d0',
  ].join('\n');
}

/**
 * The beat, as construction ops: the web server (UP - nothing has crashed), the
 * restored file (permissions right, label wrong), the edge that puts the unit on
 * the box, and SELinux switched on over the top of it.
 *
 * The unit is deliberately RUNNING. A failed unit on a box is an active incident
 * to everything that reads the estate - break-glass legitimacy, the boards - and
 * this is not that fault: the server is up, it is answering, and it is answering
 * 403. "Up and refusing" is also the honest shape of a label denial, and it is
 * what makes this beat different from the 0.21.0 permission one it rhymes with.
 */
export function selinuxRelabelSetup(
  boxId: string,
  hostname: string,
): readonly SetupOp[] {
  const ids = selinuxNodeIds(hostname);

  return [
    {
      op: 'addNode',
      node: {
        id: ids.file,
        kind: 'file',
        fields: {
          [FIELDS.name]: SELINUX_SCENARIO.fileName,
          [FIELDS.path]: SELINUX_SCENARIO.path,
          [FIELDS.volume]: hostname,
          [FIELDS.fsMode]: SELINUX_SCENARIO.mode,
          [FIELDS.fsOwner]: SELINUX_SCENARIO.owner,
          [FIELDS.fsGroup]: SELINUX_SCENARIO.group,
          // The whole fault, and the whole fix, in two fields: what it is
          // labelled, and what the policy says it should be.
          [FIELDS.selinuxContext]: SELINUX_RESTORED_CONTEXT,
          [FIELDS.selinuxContextDefault]: SELINUX_WEB_CONTEXT,
        },
      },
    },
    {
      op: 'addNode',
      node: {
        id: ids.unit,
        kind: 'unit',
        fields: {
          [FIELDS.name]: SELINUX_SCENARIO.unitDescription,
          [FIELDS.unitName]: SELINUX_SCENARIO.unitName,
          [FIELDS.unitState]: SYSTEMD_STATES.activeRunning,
          [FIELDS.unitEnabled]: UNIT_ENABLEMENTS.enabled,
          // The same field the 0.21.0 permission gate reads, pointed at the
          // same kind of file - which is the point. One file, two gates: the
          // rwx one says yes and the label one says no.
          [FIELDS.requiresFile]: ids.file,
          [FIELDS.unitJournal]: scenarioJournal(hostname),
        },
      },
    },
    { op: 'addEdge', edge: { from: ids.unit, to: boxId, kind: 'runs_on' } },
    {
      op: 'setField',
      id: boxId,
      field: FIELDS.selinuxMode,
      value: SELINUX_MODES.enforcing,
    },
  ];
}

/** Whether SELinux is on this box AND currently enforcing rather than logging. */
function selinuxEnforcing(
  graph: ReadOnlyGraphView,
  boxId: string,
): boolean {
  return graph.getField(boxId, FIELDS.selinuxMode) === SELINUX_MODES.enforcing;
}

/**
 * Whether a file is wearing a label the policy does not give its path - the
 * whole fault, read as the difference between the two fields rather than as a
 * flag somebody has to remember to clear.
 *
 * A file the policy holds no answer for is not mislabelled: there is nothing to
 * be wrong against.
 */
function selinuxMislabelled(
  graph: ReadOnlyGraphView,
  fileId: string,
): boolean {
  const wanted = graph.getField(fileId, FIELDS.selinuxContextDefault);

  return typeof wanted === 'string'
    && graph.getField(fileId, FIELDS.selinuxContext) !== wanted;
}

/**
 * Whether reading this file on this box is REFUSED this minute: both gates, in
 * the order the kernel asks them.
 *
 * The two fixes are exactly the two ways this goes false, which is why they are
 * one read rather than two flags - relabel the file, or stop the box enforcing,
 * and the same sentence answers no.
 */
export function selinuxDeniesFile(
  graph: ReadOnlyGraphView,
  boxId: string,
  fileId: string,
): boolean {
  return selinuxEnforcing(graph, boxId) && selinuxMislabelled(graph, fileId);
}

/** The same question asked of the authored beat's own file on a named box. */
export function selinuxDenying(
  graph: ReadOnlyGraphView,
  boxId: string,
  hostname: string,
): boolean {
  return selinuxDeniesFile(graph, boxId, selinuxNodeIds(hostname).file);
}

/**
 * The box whose enforcement was turned off yesterday and has not been noticed
 * yet, or nothing.
 *
 * The same shape as `socialEngineeringDue`, and on purpose the same rail: the
 * world decides whether there is a consequence and the driver settles it at the
 * next start of shift. A day is how long it takes somebody upstream to read a
 * compliance report, and a consequence that landed in the same afternoon would
 * read as a punishment for the keystroke rather than as the cost of the
 * shortcut.
 *
 * Turning enforcement back ON does not clear it. That is not spite: the report
 * says the control was off, and it was.
 */
export function selinuxAuditDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  const today = dayForTick(now);

  return graph.nodesOfKind('machine').flatMap((box) => {
    const at = box.fields[FIELDS.selinuxPermissiveAt];

    if (typeof at !== 'number' || dayForTick(at) >= today) {
      return [];
    }

    return typeof box.fields[FIELDS.selinuxNoticedAt] === 'number'
      ? []
      : [box.id];
  });
}
