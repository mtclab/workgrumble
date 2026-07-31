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
   * Impact and urgency, in the player's judgement, with the priority the
   * matrix makes of them. The engine refuses any triple that is not a cell of
   * that matrix, which is what keeps priority a consequence rather than a
   * fourth thing somebody picked.
   */
  ticketClassify: 'ticket.classify',
  /**
   * The internal stream: what the player worked out, and what the reporter
   * let slip in chat. Nobody outside the helpdesk ever sees it, which is the
   * whole reason a real system has two of these.
   */
  ticketAddWorknote: 'ticket.add_worknote',
  /**
   * The customer-visible stream: what was actually put TO the reporter. The
   * CYA rule reads this one - a question nobody was asked cannot stop a clock
   * - and the first line written here stops the response clock.
   */
  ticketAddComment: 'ticket.add_comment',
  /**
   * The response clock stopped by something other than a comment: the first
   * dispatched action that touched the ticket's own nodes. The driver notices;
   * the world records it, because a clock is world state.
   */
  ticketRecordResponse: 'ticket.record_response',
  /** Second line sending a thin handoff back, with the bill attached. */
  ticketBounceHandoff: 'ticket.bounce_handoff',
} as const;

export type HelpdeskActionId =
  (typeof HELPDESK_ACTIONS)[keyof typeof HELPDESK_ACTIONS];

export const HELPDESK_ACTION_IDS: readonly HelpdeskActionId[] = Object.freeze(
  Object.values(HELPDESK_ACTIONS),
);

/**
 * The day's own verbs. Separate from the helpdesk set because they are not
 * work: they are the shape of the shift around the work, and the day loop
 * drives them rather than a button on a ticket.
 */
export const DAY_ACTIONS = {
  startShift: 'day.start_shift',
  endShift: 'day.end_shift',
  clockOff: 'day.clock_off',
  /**
   * One interval of pressure. The shell decides HOW MUCH from readable state;
   * the engine decides what the meters end up being, so the numbers replay
   * instead of being recomputed from a wall clock nobody wrote down.
   */
  metersTick: 'meters.tick',
} as const;

export type DayActionId = (typeof DAY_ACTIONS)[keyof typeof DAY_ACTIONS];

export const DAY_ACTION_IDS: readonly DayActionId[] = Object.freeze(
  Object.values(DAY_ACTIONS),
);
