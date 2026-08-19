import type { ActionData, ActionPayload, NodeKind } from '../../engine-api';
import { REMEDIATION_TARGET_KINDS } from '../customers';
import { ACCOUNT_ACTIONS } from './account';
import { APT_ACTION_DATA } from './apt';
import { BOSS_ACTION_DATA } from './boss';
import { CAREER_ACTION_DATA } from './career';
import { CHANGE_ACTION_DATA } from './change';
import { CONSUMABLE_ACTION_DATA } from './consumables';

export { BEER_TOO_EARLY_REASON, LATE_CAN_REASON } from './consumables';
export { APT_PACKAGE_PARAM } from './apt';
export { FS_GROUP_PARAM, FS_MODE_PARAM, FS_OWNER_PARAM } from './fs';
export { SELINUX_MODE_PARAM } from './selinux';
export { RACI_COMPLAINT_REPUTATION, RACI_LINE_PARAM } from './raci';
export {
  CUTOVER_INCOMPLETE_REASON,
  PROJECT_ANSWERED_PARAM,
  PROJECT_CIRCUIT_PARAM,
  PROJECT_FROM_PARAM,
  PROJECT_PARAM,
  PROJECT_REPORT_PARAM,
  RULE_BEFORE_AUDIT_REASON,
} from './project';
export { INVOICE_LADDER_PARAM } from './invoice';
export {
  TIMESHEET_AUTO_PARAM,
  TIMESHEET_CLAIMS_PARAM,
  TIMESHEET_LINES_PARAM,
  TIMESHEET_SUBMITTED_REASON,
} from './timesheet';
export { SSH_HOST_PARAM } from './career';
import { DAY_ACTION_DATA } from './day';
import { DEVICE_ACTIONS } from './device';
import { DRIVE_ACTIONS } from './drive';
import { FACILITIES_ACTIONS } from './facilities';
import { FS_ACTION_DATA } from './fs';
import { KIND_LABELS } from './helpers';
import { INCIDENT_ACTION_DATA } from './incidents';
import { INVOICE_ACTION_DATA } from './invoice';
import { INTERRUPTION_ACTION_DATA } from './interruptions';
import { LEGENDARY_ACTIONS } from './legendary';
import { MACHINE_ACTIONS } from './machine';
import { MAIL_RULE_ACTIONS } from './mail-rule';
import { METER_ACTION_DATA } from './meters';
import { OVERRIDE_ACTIONS } from './override';
import { PRESENCE_ACTION_DATA } from './presence';
import { PROJECT_ACTION_DATA } from './project';
import { RACI_ACTION_DATA } from './raci';
import { REQUEST_ACTION_DATA } from './request';
import { SCOPE_ACTION_DATA } from './scope';
import { SECURITY_ACTIONS } from './security';
import { SELINUX_ACTION_DATA } from './selinux';
import { SERVICE_ACTIONS } from './service';
import { SHARE_ACTIONS } from './share';
import { SOFTWARE_ACTION_DATA } from './software';
import { SYSTEMD_ACTION_DATA } from './systemd';
import { TICKET_ACTIONS } from './ticket';
import { TIMESHEET_ACTION_DATA } from './timesheet';
import { TONE_ACTION_DATA } from './tone';
import { AUDIT_ACTION_LIST } from './audit';
import { VIP_ACTIONS } from './vip';
import { WORLD_ACTION_DATA } from './world';

export {
  DELEGATE_PARAM,
  DISABLED_NEEDS_ENABLING_REASON,
  DISABLED_NOT_LOCKED_REASON,
  EXPIRED_NOT_LOCKED_REASON,
  NO_FREE_SEATS_REASON,
  NOT_DISABLED_REASON,
  NOT_LOCKED_REASON,
  REVOKE_WITHOUT_FACTOR_REASON,
  RULE_PARAM,
  SEATS_PARAM,
} from './account';
export {
  ACROSS_VOLUMES_REASON,
  ALREADY_THERE_REASON,
  DESTINATION_DENIED_REASON,
  DESTINATION_IS_A_LISTING_REASON,
  MACHINE_PARAM,
  NOT_DISPOSABLE_REASON,
  NOT_IN_THAT_DIRECTORY_REASON,
  NOTHING_TO_EMPTY_REASON,
  SOURCE_DENIED_REASON,
  VOLUME_CEILING,
  WRONG_VOLUME_REASON,
} from './drive';
export { STICKY_NOTE_ALREADY_REASON } from './facilities';
export {
  ALREADY_DEFERRED_REASON,
  ALREADY_SETTLED_REASON,
  NO_POSTPONES_LEFT_REASON,
  NOT_DECLINABLE_REASON,
  UPDATES_WITHDRAWN_REASON,
} from './interruptions';
export {
  AWAY_ALREADY_NOTICED_REASON,
  DOT_IGNORED_REASON,
  DOT_NOT_ON_REASON,
  NOT_AWAY_REASON,
  PRESENCE_OFF_SHIFT_REASON,
  PRESENCE_UNKNOWN_REASON,
} from './presence';
export {
  PHISH_CLICK_STRESS,
  PHISH_CLICK_SUSPICION,
  SOCIAL_ENGINEERING_REPUTATION,
} from './security';
export { FULL_BATTERY } from './device';
export { HELPDESK_TIER, KIND_LABELS } from './helpers';
export { BREAK_GLASS_TWICE_REASON } from './change';
export {
  CERT_NOT_EXPIRED_REASON,
  INCIDENT_DISK_FREE_LOW,
  INCIDENT_JOURNAL_BYTES,
  JOURNAL_NOT_RUNAWAY_REASON,
  JOURNAL_VACUUM_TARGET,
  LINUX_DISK_CEILING,
  POSTMORTEM_TWICE_REASON,
  POSTMORTEM_UNIT_STILL_DOWN_REASON,
} from './incidents';
export {
  APT_ACTION_IDS,
  APT_ACTIONS,
  type AptActionId,
  CAREER_ACTION_IDS,
  CAREER_ACTIONS,
  type CareerActionId,
  CHANGE_ACTION_IDS,
  CHANGE_ACTIONS,
  type ChangeActionId,
  DAY_ACTION_IDS,
  DAY_ACTIONS,
  type DayActionId,
  FS_ACTION_IDS,
  FS_ACTIONS,
  type FsActionId,
  HELPDESK_ACTION_IDS,
  HELPDESK_ACTIONS,
  type HelpdeskActionId,
  INCIDENT_ACTION_IDS,
  INCIDENT_ACTIONS,
  type IncidentActionId,
  INVOICE_ACTION_IDS,
  INVOICE_ACTIONS,
  type InvoiceActionId,
  PROJECT_ACTION_IDS,
  PROJECT_ACTIONS,
  type ProjectActionId,
  REQUEST_ACTION_IDS,
  REQUEST_ACTIONS,
  type RequestActionId,
  SELINUX_ACTION_IDS,
  SELINUX_ACTIONS,
  type SelinuxActionId,
  SOFTWARE_ACTION_IDS,
  SOFTWARE_ACTIONS,
  type SoftwareActionId,
  SYSTEMD_ACTION_IDS,
  SYSTEMD_ACTIONS,
  type SystemdActionId,
  AUDIT_ACTION_IDS,
  AUDIT_ACTIONS,
  type AuditActionId,
  TIMESHEET_ACTION_IDS,
  TIMESHEET_ACTIONS,
  type TimesheetActionId,
  WORLD_ACTION_IDS,
  WORLD_ACTIONS,
  type WorldActionId,
} from './ids';
export {
  INSTALL_TWICE_REASON,
  UNINSTALL_TWICE_REASON,
} from './software';
export {
  REQUEST_ALREADY_RESOLVED_REASON,
  REQUEST_OFF_SHIFT_REASON,
} from './request';
export {
  SCOPE_ANSWERED_REASON,
  SCOPE_CLOSED_REASON,
  SCOPE_NOT_AN_ASK_REASON,
  SCOPE_NOT_QUOTED_REASON,
  SCOPE_QUOTE_OUT_REASON,
} from './scope';
export {
  REBUFF_AGAIN_PARAM,
  REBUFF_FIRST_PARAM,
} from './tone';
export {
  CLASSIFY_BREACHED_REASON,
  CLASSIFY_CLOSED_REASON,
  CLASSIFY_ON_HOLD_REASON,
  fieldLines,
  LINK_CLOSED_REASON,
  LINK_PARENT_REFUSED_REASON,
  WAITING_NEEDS_QUESTION_REASON,
} from './ticket';

/** Every tier-1 helpdesk action, in a stable order. */
export function helpdeskActions(): readonly ActionData[] {
  return [
    ...ACCOUNT_ACTIONS,
    ...SERVICE_ACTIONS,
    ...MACHINE_ACTIONS,
    ...DEVICE_ACTIONS,
    ...DRIVE_ACTIONS,
    ...MAIL_RULE_ACTIONS,
    ...SHARE_ACTIONS,
    ...FACILITIES_ACTIONS,
    ...SECURITY_ACTIONS,
    ...TICKET_ACTIONS,
    ...TONE_ACTION_DATA,
    ...DAY_ACTION_DATA,
    ...METER_ACTION_DATA,
    ...BOSS_ACTION_DATA,
    ...INTERRUPTION_ACTION_DATA,
    ...PRESENCE_ACTION_DATA,
    ...CONSUMABLE_ACTION_DATA,
    ...SOFTWARE_ACTION_DATA,
    ...REQUEST_ACTION_DATA,
    // The career the player crosses (E6): the promotion, and the ssh trust
    // ledger. Player-initiated verbs on the player's own node, so they sit with
    // the helpdesk set rather than the world's own timetable verbs below.
    ...CAREER_ACTION_DATA,
    // The systemd verbs (E6, Pass B): restart/start/stop a unit over ssh. The
    // engineer's remediation surface, the Linux twin of `serviceRestart`.
    ...SYSTEMD_ACTION_DATA,
    // The change-control verbs (E6, 0.18.0): break-glass and its abuse record.
    // Player-initiated verbs on the player's own trail, like the software audit.
    ...CHANGE_ACTION_DATA,
    // The characteristic-incident fixes (E6, 0.19.0): the disk-full vacuum, the
    // cert renew, and the blameless postmortem that closes an incident.
    ...INCIDENT_ACTION_DATA,
    // The package-management verbs (E6, 0.20.0): apt install (closing the not-
    // installed gag) and apt upgrade (applying the pending updates). Player-
    // initiated verbs on the box's own state, like the systemd fix verbs above.
    ...APT_ACTION_DATA,
    // The filesystem-permission verbs (E6, 0.21.0): chmod and chown, rewriting a
    // Linux file's rwx state the way ls -la reads it - the fix half of the
    // permission-denied incident.
    ...FS_ACTION_DATA,
    // The SELinux verbs (E6, 0.28.0): the relabel and the enforcement switch -
    // two player verbs that both fix the denial and are not the same thing - and
    // the compliance report that notices the second one a day later, which is a
    // world verb the day driver settles at the next start of shift.
    ...SELINUX_ACTION_DATA,
    // The manager override / CYA verbs (E8, 0.24.0): the risk-acceptance
    // signature (a player verb, the getting-it-in-writing) and the audit-finding
    // fallout (a world verb the day driver settles, below the line with the rest
    // of the world's own timetable).
    ...OVERRIDE_ACTIONS,
    // The co-managed RACI's two verbs (E9, 0.37.0): the trail a remediation on
    // the customer's OWN box leaves when nobody was told, and the complaint
    // their sysadmin makes about it the next morning. Both world verbs - one
    // dispatched by the terminal after the act it records, one settled by the
    // day driver - because neither is a move anybody in this building chooses.
    ...RACI_ACTION_DATA,
    // The legendary manager / implement-then-revert verbs (E8, 0.25.0): the
    // startup-type config change the mandate makes, the rollback capture (the
    // diligent step onto the reused change_request record), and the clean restore
    // that reads it back. All player verbs; the mandate arc is proven in
    // `legendary.test.ts`.
    ...LEGENDARY_ACTIONS,
    // The VIP tier's verbs (E8, 0.26.0): the MDM push that refuses an unenrolled
    // device and the manual walkthrough that does not - both player verbs - and
    // the queue-jump's bill, a world verb the day loop settles when the clock on
    // whichever ticket was left waiting runs out.
    ...VIP_ACTIONS,
    // The audit queue's verbs (E9, 0.36.0): the confirm and the write-up are
    // the player's (the third player answer, correcting, is the shipped triage
    // form), and the deal and the fallout are the world's - one dealt by the
    // day in the minute an item arrives, one settled by the day when a
    // signed-off wrong priority finally breaches.
    ...AUDIT_ACTION_LIST,
    // The project verbs (E10, 0.29.0): the audit (two of them, and they are not
    // the same act), the per-rule migration, and the cutover and its rollback -
    // the cable, moved and moved back. All player verbs bar the last, which is
    // the world noticing a rule nobody carried, settled the next morning by the
    // day loop on the same rail the compliance sweep runs on.
    ...PROJECT_ACTION_DATA,
    // The timesheet verbs (0.30.0): the claim and the submit are the player's,
    // and the record is the world's - written by the day loop in the minute
    // what the player was doing changed, the way a touch record is. It is the
    // one verb here nobody presses, and it sits with the player's two because
    // all three write the player's own node.
    ...TIMESHEET_ACTION_DATA,
    // The invoice ladder's one verb (0.30.0, slice 2), which nobody presses:
    // the record of which rung a customer has already been taken to, settled
    // by the day loop at the start of a shift. Where an account STANDS is
    // derived off the sheet and the customer's own records every time anybody
    // asks, so there is no scrutiny meter here to fall out of step with it.
    ...INVOICE_ACTION_DATA,
    // The out-of-scope ask's five (E9, 0.38.0): the player's three answers to a
    // request nobody signed for - refuse and offer the estimate, quote and
    // wait, or just do it - and the customer's two answers to the estimate,
    // which the day driver settles off the minute the quote was stamped with.
    // All five in one list because they are one mechanic, and the two world
    // verbs at the end of it rather than below the line because they are about
    // the same ticket the three above are.
    ...SCOPE_ACTION_DATA,
    // The world's own verbs go in last and are offered by nothing: a cleaner's
    // trolley and a maintenance window are not things a first-line tech does.
    ...WORLD_ACTION_DATA,
  ];
}

/**
 * The verb set as one payload: the actions themselves plus the words a
 * refusal calls each node kind by. The engine knows which kind it refused;
 * the world knows what to call it.
 */
export function helpdeskActionPayload(): ActionPayload {
  return {
    kind_labels: KIND_LABELS,
    actions: helpdeskActions(),
  };
}

/* -- which verbs are REMEDIATIONS, read off the registry ------------------ */

/**
 * The kind an action's target guard says it only works on, or null for a verb
 * that is not aimed at a node kind at all.
 *
 * Read off the guard `targetGuards` writes - the `not(kind_is TARGET x)` refusal
 * that names what the action is for - rather than off a second table beside the
 * registry. A verb declares what it aims at exactly once, in the place the
 * refusal is written, and this reads that declaration back.
 */
function targetKindOf(action: Readonly<ActionData>): NodeKind | null {
  for (const guard of action.validate ?? []) {
    if (guard.when.pred !== 'not') {
      continue;
    }

    const inner = guard.when.of;

    if (inner.pred === 'kind_is' && 'ref' in inner.node
      && inner.node.ref === 'target') {
      return inner.kind;
    }
  }

  return null;
}

/**
 * Every verb that is a REMEDIATION - an action aimed at a node the customer
 * walls can find a customer behind (`REMEDIATION_TARGET_KINDS`).
 *
 * Derived, never listed. A hand-kept list would be a second answer to a
 * question the registry already answers, and it would go stale the first time
 * somebody registered a verb without remembering it existed - which is the
 * failure mode this whole set is here to prevent.
 *
 * What reads it: the dialogue dispatcher's load-time gate. A scripted
 * conversation dispatches through the shell's own dispatcher and NOT through
 * the remediation seam, so an option that offered to reboot a customer's server
 * would reach the estate with none of the walls in front of it. The gate refuses
 * to load a tree carrying one of these unless it is named in an allowance, so
 * the first MSP dialogue that offers a fix has to be written where somebody is
 * looking at the walls.
 */
export function remediationActionIds(): readonly string[] {
  return helpdeskActions()
    .map((action) => ({ id: action.id, kind: targetKindOf(action) }))
    .filter(({ kind }) => kind !== null
      && REMEDIATION_TARGET_KINDS.includes(kind))
    .map(({ id }) => id);
}

const REMEDIATION_IDS: ReadonlySet<string> = new Set(remediationActionIds());

/** Whether this verb changes an estate the customer walls apply to. */
export function isRemediationAction(action: string): boolean {
  return REMEDIATION_IDS.has(action);
}
