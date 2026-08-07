import type { ActionData, NodeRefData, OpData } from '../../engine-api';
import { FIELDS, SYSTEMD_STATES } from '../fields';
import { HELPDESK_TIER, not, targetGuards, TARGET } from './helpers';
import { INCIDENT_ACTIONS } from './ids';

/**
 * The characteristic-incident fixes (E6, 0.19.0): the three classic sysadmin
 * incidents the tier is measured on, each fixed the real way against a real node
 * state the diagnosis reads off the same fields.
 *
 * Nothing here fabricates a confirmation and nothing branches on policy: the
 * disk-full fix hands the runaway journal's bytes back to the box (`df` and `du`
 * read the same two fields the fix writes), the cert-expiry fix flips the expired
 * flag the served box refuses on, and the postmortem writes the blameless record
 * that CLOSES an incident once it is already resolved. Determinism and no DOM,
 * like every other action; the numbers are authored constants, one place.
 */

/* -- the disk-full numbers, shared with the incident that seeds them ------- */

/**
 * The size the runaway systemd journal has grown to in the disk-full incident,
 * in bytes (~26G): a crash-looping service floods journald and the journal eats
 * the root filesystem. It is the number `du -sh /var/log/journal` reads and the
 * one `journalctl --vacuum-size` hands back.
 */
export const INCIDENT_JOURNAL_BYTES = 27_917_287_424;

/**
 * What `journalctl --vacuum-size=200M` leaves behind, in bytes (200M): the real
 * command keeps the most recent journals up to the target and deletes the rest,
 * so the fix reduces the journal to this and frees the difference - it does not
 * zero it, because the real one does not.
 */
export const JOURNAL_VACUUM_TARGET = 209_715_200;

/**
 * The free space the disk-full incident leaves on FC-RMM-01, in bytes (~188M):
 * a 40G root at 100%, the fire drill `df -h` shows near-full.
 */
export const INCIDENT_DISK_FREE_LOW = 197_132_288;

/**
 * The ceiling `disk_free` is clamped to when the vacuum hands bytes back: the
 * box's own root size (40G), the total `df -h` reports. Larger than the Windows
 * drives' `VOLUME_CEILING` because a Linux server's root genuinely is.
 */
export const LINUX_DISK_CEILING = 42_949_672_960;

/* -- the reasons a fix refuses, written to be read ------------------------ */

export const JOURNAL_NOT_RUNAWAY_REASON = 'The journal on this box is already '
  + 'small - there is nothing for a vacuum to reclaim. journalctl --vacuum-size '
  + 'deletes archived journals down to a size cap; on a healthy box that is a '
  + 'no-op, and this one is healthy. Check "du -sh /var/log/journal" and "df -h" '
  + 'before you go looking for space that is not being eaten.';

export const CERT_NOT_EXPIRED_REASON = 'The certificate this service presents is '
  + 'valid - there is nothing to renew. A renew replaces an EXPIRED certificate; '
  + 'running it against a good one just churns the same cert. "curl -I" will show '
  + 'you whether the box is actually refusing on an expired certificate before '
  + 'you reach for certbot.';

export const POSTMORTEM_UNIT_STILL_DOWN_REASON = 'The service is still down - '
  + 'write the postmortem AFTER the incident is resolved, not during it. A '
  + 'blameless postmortem is the record of a fire that is out: bring the unit back '
  + 'up first (systemctl restart), confirm it with systemctl status, and then '
  + 'write it up. A postmortem on a live incident is a status update, not a review.';

export const POSTMORTEM_TWICE_REASON = 'A postmortem for this incident is already '
  + 'on the record. It is written once, when the fire is out - filing it again '
  + 'would be a second record of one incident, which is not what the trail is for.';

/* -- op-language helpers, local to this module ---------------------------- */

const ACTOR: NodeRefData = { ref: 'actor' };
const LINE_PARAM = 'line';

/** Appending the `unit@tick` line to the postmortem trail, the record itself. */
function recordPostmortem(): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field: FIELDS.postmortems,
    value: {
      append_line: {
        node: ACTOR,
        field: FIELDS.postmortems,
        value: { param: LINE_PARAM },
      },
    },
  };
}

/**
 * The three fixes.
 *
 * `journalVacuum` (the disk-full fix) hands the journal's bytes back to
 * `disk_free` and reduces the journal to the vacuum target - two reads of the
 * same field the disk-full ticket closes on. `certRenew` (the cert-expiry fix)
 * flips the expired flag the served box refuses on. `postmortemFile` writes the
 * blameless record to the append-only trail AND sets the close marker on the unit
 * it documents, once the unit is back up and only once.
 */
export const INCIDENT_ACTION_DATA: readonly ActionData[] = [
  {
    id: INCIDENT_ACTIONS.journalVacuum,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      // Nothing to reclaim unless the journal has actually run away past the
      // vacuum target - the honest "already small" refusal, so a vacuum on a
      // healthy box is a no-op that says so rather than pretending to free space.
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.journalBytes,
        }),
        reason: JOURNAL_NOT_RUNAWAY_REASON,
      },
      {
        when: {
          pred: 'field_at_most',
          node: TARGET,
          field: FIELDS.journalBytes,
          value: JOURNAL_VACUUM_TARGET,
        },
        reason: JOURNAL_NOT_RUNAWAY_REASON,
      },
    ],
    // The space first, while the journal still knows how much of it there was:
    // add the whole journal to free space, take the vacuum target back off (the
    // real command keeps that much), then set the journal to the target. Any
    // other order gives back the wrong number.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.diskFree,
        value: {
          add: {
            node: TARGET,
            field: FIELDS.diskFree,
            by: { field: { node: TARGET, field: FIELDS.journalBytes } },
            clamp: { min: 0, max: LINUX_DISK_CEILING },
          },
        },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.diskFree,
        value: {
          sub: {
            node: TARGET,
            field: FIELDS.diskFree,
            by: { const: JOURNAL_VACUUM_TARGET },
            clamp: { min: 0, max: LINUX_DISK_CEILING },
          },
        },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.journalBytes,
        value: { const: JOURNAL_VACUUM_TARGET },
      },
    ],
  },
  {
    id: INCIDENT_ACTIONS.certRenew,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('unit'),
      // A renew replaces an expired certificate; against a valid one it is churn,
      // and the world says so rather than quietly re-issuing a good cert.
      {
        when: not({
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.certExpired,
          value: { const: true },
        }),
        reason: CERT_NOT_EXPIRED_REASON,
      },
    ],
    // The renew: the expired flag clears, and the service - which was up the
    // whole time, refusing on the dead cert - serves again. A real replace +
    // reload, modelled as the one field the served box reads.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.certExpired,
        value: { const: false },
      },
    ],
  },
  {
    id: INCIDENT_ACTIONS.postmortemFile,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('unit'),
      // A postmortem is the record of a fire that is OUT: the unit has to be back
      // up first. Writing one on a still-failed unit is a status update, not a
      // review, and the refusal names the order.
      {
        when: not({
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.unitState,
          value: { const: SYSTEMD_STATES.activeRunning },
        }),
        reason: POSTMORTEM_UNIT_STILL_DOWN_REASON,
      },
      // Once only: an incident gets one postmortem, and the marker on the unit is
      // what a second attempt is refused against.
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.postmortemFiled,
          value: { const: true },
        },
        reason: POSTMORTEM_TWICE_REASON,
      },
    ],
    // The record on the player's own append-only trail, and the close marker on
    // the unit the postmortem documents - the two writes that make "written once,
    // and it closes the incident" true across a save and a replay.
    apply: [
      recordPostmortem(),
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.postmortemFiled,
        value: { const: true },
      },
    ],
  },
];
