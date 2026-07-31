import type { ActionData, ActionPayload } from '../../engine-api';
import { ACCOUNT_ACTIONS } from './account';
import { BOSS_ACTION_DATA } from './boss';
import { CONSUMABLE_ACTION_DATA } from './consumables';

export { LATE_CAN_REASON } from './consumables';
import { DAY_ACTION_DATA } from './day';
import { DEVICE_ACTIONS } from './device';
import { KIND_LABELS } from './helpers';
import { MACHINE_ACTIONS } from './machine';
import { MAIL_RULE_ACTIONS } from './mail-rule';
import { METER_ACTION_DATA } from './meters';
import { SERVICE_ACTIONS } from './service';
import { SHARE_ACTIONS } from './share';
import { TICKET_ACTIONS } from './ticket';

export { FULL_BATTERY } from './device';
export { HELPDESK_TIER, KIND_LABELS } from './helpers';
export {
  DAY_ACTION_IDS,
  DAY_ACTIONS,
  type DayActionId,
  HELPDESK_ACTION_IDS,
  HELPDESK_ACTIONS,
  type HelpdeskActionId,
} from './ids';
export {
  CLASSIFY_BREACHED_REASON,
  CLASSIFY_CLOSED_REASON,
  CLASSIFY_ON_HOLD_REASON,
  fieldLines,
  LINK_CLOSED_REASON,
  WAITING_NEEDS_QUESTION_REASON,
} from './ticket';

/** Every tier-1 helpdesk action, in a stable order. */
export function helpdeskActions(): readonly ActionData[] {
  return [
    ...ACCOUNT_ACTIONS,
    ...SERVICE_ACTIONS,
    ...MACHINE_ACTIONS,
    ...DEVICE_ACTIONS,
    ...MAIL_RULE_ACTIONS,
    ...SHARE_ACTIONS,
    ...TICKET_ACTIONS,
    ...DAY_ACTION_DATA,
    ...METER_ACTION_DATA,
    ...BOSS_ACTION_DATA,
    ...CONSUMABLE_ACTION_DATA,
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
