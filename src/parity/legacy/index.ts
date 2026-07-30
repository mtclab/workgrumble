import type { ActionDef, ActionRegistry } from '../../engine/actions';
import { ACCOUNT_ACTIONS } from './account';
import { DEVICE_ACTIONS } from './device';
import { MACHINE_ACTIONS } from './machine';
import { MAIL_RULE_ACTIONS } from './mail-rule';
import { SERVICE_ACTIONS } from './service';
import { SHARE_ACTIONS } from './share';
import { createTicketActions, type TicketPolicy } from './ticket';

export { DEMO_ACTION_DEFS } from './demo';
export type { TicketPolicy } from './ticket';

/**
 * The original closure implementation of every helpdesk verb, kept for one
 * purpose: the parity harness drives it beside the Rust core running the same
 * verbs as DATA. Nothing shipped imports this folder - `src/world/actions` is
 * the real one - and it goes when the retired engine goes.
 */
export function legacyHelpdeskActions(
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

export function registerLegacyActions(
  registry: ActionRegistry,
  policy: Readonly<TicketPolicy>,
): void {
  for (const definition of legacyHelpdeskActions(policy)) {
    registry.register(definition);
  }
}
