/**
 * Every verb the helpdesk tier can perform. UI buttons, terminal commands and
 * (from lane B) chat dialogue effects all name actions from this list - two
 * skins, one verb set, and nothing reaches the world any other way.
 */
export const HELPDESK_ACTIONS = {
  accountUnlock: 'account.unlock',
  accountResetPassword: 'account.reset_password',
  accountAddToGroup: 'account.add_to_group',
  accountRemoveFromGroup: 'account.remove_from_group',
  serviceRestart: 'service.restart',
  machineSetDisplayRotation: 'machine.set_display_rotation',
  machineSetResolution: 'machine.set_resolution',
  machineReboot: 'machine.reboot',
  devicePowerCycle: 'device.power_cycle',
  deviceReplaceBattery: 'device.replace_battery',
  mailRuleDelete: 'mail_rule.delete',
  shareGrantAccess: 'share.grant_access',
  printerClearQueue: 'printer.clear_queue',
  ticketSetWaiting: 'ticket.set_waiting',
  ticketClearWaiting: 'ticket.clear_waiting',
  ticketEscalate: 'ticket.escalate',
  /**
   * The CYA rule made mechanical: the reporter has actually been asked about
   * their problem, so the SLA may honestly be stopped on them. Nothing else
   * can set it, and `ticket.set_waiting` refuses without it.
   */
  ticketMarkAsked: 'ticket.mark_asked',
  /**
   * What the reporter just let slip, written onto the ticket. Chat reveals go
   * through here rather than through a back door into the graph: a clue is a
   * world mutation like any other, so it is an action like any other.
   */
  ticketAddClue: 'ticket.add_clue',
} as const;

export type HelpdeskActionId =
  (typeof HELPDESK_ACTIONS)[keyof typeof HELPDESK_ACTIONS];

export const HELPDESK_ACTION_IDS: readonly HelpdeskActionId[] = Object.freeze(
  Object.values(HELPDESK_ACTIONS),
);
