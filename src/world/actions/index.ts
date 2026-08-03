import type { ActionData, ActionPayload } from '../../engine-api';
import { ACCOUNT_ACTIONS } from './account';
import { BOSS_ACTION_DATA } from './boss';
import { CONSUMABLE_ACTION_DATA } from './consumables';

export { BEER_TOO_EARLY_REASON, LATE_CAN_REASON } from './consumables';
import { DAY_ACTION_DATA } from './day';
import { DEVICE_ACTIONS } from './device';
import { DRIVE_ACTIONS } from './drive';
import { FACILITIES_ACTIONS } from './facilities';
import { KIND_LABELS } from './helpers';
import { INTERRUPTION_ACTION_DATA } from './interruptions';
import { MACHINE_ACTIONS } from './machine';
import { MAIL_RULE_ACTIONS } from './mail-rule';
import { METER_ACTION_DATA } from './meters';
import { PRESENCE_ACTION_DATA } from './presence';
import { SECURITY_ACTIONS } from './security';
import { SERVICE_ACTIONS } from './service';
import { SHARE_ACTIONS } from './share';
import { SOFTWARE_ACTION_DATA } from './software';
import { TICKET_ACTIONS } from './ticket';
import { WORLD_ACTION_DATA } from './world';

export {
  DISABLED_NEEDS_ENABLING_REASON,
  DISABLED_NOT_LOCKED_REASON,
  EXPIRED_NOT_LOCKED_REASON,
  NO_FREE_SEATS_REASON,
  NOT_DISABLED_REASON,
  NOT_LOCKED_REASON,
  REVOKE_WITHOUT_FACTOR_REASON,
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
export {
  DAY_ACTION_IDS,
  DAY_ACTIONS,
  type DayActionId,
  HELPDESK_ACTION_IDS,
  HELPDESK_ACTIONS,
  type HelpdeskActionId,
  SOFTWARE_ACTION_IDS,
  SOFTWARE_ACTIONS,
  type SoftwareActionId,
  WORLD_ACTION_IDS,
  WORLD_ACTIONS,
  type WorldActionId,
} from './ids';
export {
  INSTALL_TWICE_REASON,
  UNINSTALL_TWICE_REASON,
} from './software';
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
    ...DAY_ACTION_DATA,
    ...METER_ACTION_DATA,
    ...BOSS_ACTION_DATA,
    ...INTERRUPTION_ACTION_DATA,
    ...PRESENCE_ACTION_DATA,
    ...CONSUMABLE_ACTION_DATA,
    ...SOFTWARE_ACTION_DATA,
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
