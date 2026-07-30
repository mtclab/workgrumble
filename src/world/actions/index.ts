import type { ActionDef, ActionRegistry } from '../../engine/actions';
import { ACCOUNT_ACTIONS } from './account';
import { DEVICE_ACTIONS } from './device';
import { MACHINE_ACTIONS } from './machine';
import { MAIL_RULE_ACTIONS } from './mail-rule';
import { SERVICE_ACTIONS } from './service';
import { SHARE_ACTIONS } from './share';
import { createTicketActions, type TicketPolicy } from './ticket';

export { HELPDESK_TIER } from './helpers';
export {
  HELPDESK_ACTION_IDS,
  HELPDESK_ACTIONS,
  type HelpdeskActionId,
} from './ids';
export { clueLines } from './ticket';
export type { TicketPolicy } from './ticket';

/** Every tier-1 helpdesk action, in a stable order. */
export function helpdeskActions(
  policy: Readonly<TicketPolicy>,
): readonly ActionDef[] {
  return [
    ...ACCOUNT_ACTIONS,
    ...SERVICE_ACTIONS,
    ...MACHINE_ACTIONS,
    ...DEVICE_ACTIONS,
    ...MAIL_RULE_ACTIONS,
    ...SHARE_ACTIONS,
    ...createTicketActions(policy),
  ];
}

export function registerHelpdeskActions(
  registry: ActionRegistry,
  policy: Readonly<TicketPolicy>,
): void {
  for (const definition of helpdeskActions(policy)) {
    registry.register(definition);
  }
}
