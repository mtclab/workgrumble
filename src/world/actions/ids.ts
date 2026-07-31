/**
 * Every verb the helpdesk tier can perform. UI buttons, terminal commands and
 * (from lane B) chat dialogue effects all name actions from this list - two
 * skins, one verb set, and nothing reaches the world any other way.
 */
export const HELPDESK_ACTIONS = {
  accountUnlock: 'account.unlock',
  /**
   * Putting back an account somebody switched off.
   *
   * Its own verb rather than a flag on unlock, because it is its own DECISION:
   * a disabled account was disabled deliberately - a leaver, a security hold,
   * a contract that ended - and enabling one without knowing who turned it off
   * is the sort of thing that appears in an audit log with your name on it.
   */
  accountEnable: 'account.enable',
  accountResetPassword: 'account.reset_password',
  accountAddToGroup: 'account.add_to_group',
  accountRemoveFromGroup: 'account.remove_from_group',
  /**
   * Checking that the person on the other end of the call is the person whose
   * account you are about to hand a new key to.
   *
   * A verb of its own, and deliberately not a parameter on the enrolment,
   * because the whole failure mode is that it is SKIPPABLE: nothing refuses an
   * enrolment for want of it, the ticket closes either way, and the difference
   * only shows up a day later in somebody else's incident report. A tick-box on
   * another action would have made it a thing the game insisted on, which is
   * the one thing this trap must not be.
   */
  accountVerifyIdentity: 'account.verify_identity',
  /** Binding a new authenticator to an account whose old one is gone. */
  accountRegisterMfa: 'account.register_mfa',
  /**
   * Signing an account out of everything, everywhere.
   *
   * The right fix for a session somebody else is holding and the wrong one for
   * a dead authenticator - and it says so, in a refusal, which is the only
   * honest way to ship a wrong-flavour trap.
   */
  accountRevokeSessions: 'account.revoke_sessions',
  /** Giving an account one of the seats the company actually bought. */
  accountAssignLicence: 'account.assign_licence',
  /** And taking one back off somebody who has not needed it since April. */
  accountRevokeLicence: 'account.revoke_licence',
  serviceRestart: 'service.restart',
  /**
   * A new certificate on a service that is running perfectly and refusing
   * everybody. Its own verb because it is its own fault: restarting it puts
   * the same expired certificate back up, in front of the same forty people.
   */
  serviceRenewCertificate: 'service.renew_certificate',
  machineSetDisplayRotation: 'machine.set_display_rotation',
  machineSetResolution: 'machine.set_resolution',
  machineReboot: 'machine.reboot',
  /**
   * One line into a machine's own log, written as the thing happened.
   *
   * The whole bounded field arrives already built, from the one place that
   * knows what a machine's history looks like - the same contract
   * `ticket.record_touch` keeps, and for the same reason: a replay writes the
   * identical string rather than recomputing it from a clock nobody saved.
   */
  machineRecordEvent: 'machine.record_event',
  devicePowerCycle: 'device.power_cycle',
  deviceReplaceBattery: 'device.replace_battery',
  /**
   * Taking the password out of a machine that has been offering it for months.
   *
   * The fix for an account that relocks minutes after every unlock, and the one
   * that nobody looks for, because the thing typing the wrong password is not a
   * person and is not in the room.
   */
  deviceForgetCredentials: 'device.forget_credentials',
  mailRuleDelete: 'mail_rule.delete',
  /**
   * Switching on a rule somebody wrote, tested once, and left off because
   * switching it on was a change and a change needed a form.
   */
  mailRuleEnable: 'mail_rule.enable',
  /**
   * The fix made of paper: a note by the socket saying which plug is not
   * yours. It is a real verb because it is a real repair - the outage stops -
   * and it is the only one in the game that happens in the corridor.
   */
  facilitiesStickyNote: 'facilities.sticky_note',
  /**
   * Clicking the link in the suspicious mail, to see what it does.
   *
   * It is in the registry because it HAPPENS, and because a consequence the
   * world does not record is a consequence the player can argue with. Nothing
   * offers it but a conversation, and the conversation warns you first.
   */
  securityFollowLink: 'security.follow_link',
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
  /**
   * What was done to the ticket's estate, written onto the TICKET as it is
   * done. The dispatch log knows the same thing until the day boundary drains
   * it; the ticket has to still know tomorrow, because that is when the
   * handoff form asks.
   */
  ticketRecordTouch: 'ticket.record_touch',
  /** Second line sending a thin handoff back, with the bill attached. */
  ticketBounceHandoff: 'ticket.bounce_handoff',
  /**
   * The KCS solve: the article that was actually used, put on the ticket.
   *
   * It writes the reference and a work note in one move, because those are two
   * halves of one act - the reference is what a report counts and the note is
   * what the next human reads. Nothing about it is scored: linking the right
   * article is worth doing because the ticket after this one is the same
   * ticket, which is a lesson a reward would get in the way of.
   */
  ticketLinkArticle: 'ticket.link_article',
  /**
   * Attaching a duplicate to the incident it is a duplicate OF.
   *
   * The whole of first line's job in a flood: forty reports, one fault, and
   * the work is bookkeeping rather than repair. It refuses any ticket whose
   * own resolution rule does not accept a parent, which is what stops a bulk
   * close being a way to shift work nobody did.
   */
  ticketLinkToParent: 'ticket.link_to_parent',
  /**
   * The parent has been fixed, so the child is told and closed.
   *
   * Dispatched by the day loop rather than by a button: nobody presses
   * "resolve" in this game, and a child closes because the fault behind it
   * stopped existing - which is the same rule every other ticket closes by.
   */
  ticketResolveWithParent: 'ticket.resolve_with_parent',
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
   * The service clock, started and stopped with the desk.
   *
   * Two verbs rather than one with a parameter, because each of them is only
   * legal in one half of the day and the engine is the half that says so: the
   * clock runs during a shift and stops the moment one is not on. The driver
   * keeps them in step with the day state, so a load, a replay and a fresh
   * session all arrive at the same answer to "is anybody at the desk".
   */
  slaClockRun: 'day.sla_clock_run',
  slaClockHold: 'day.sla_clock_hold',
  /**
   * One interval of pressure. The shell decides HOW MUCH from readable state;
   * the engine decides what the meters end up being, so the numbers replay
   * instead of being recomputed from a wall clock nobody wrote down.
   */
  metersTick: 'meters.tick',
  /**
   * The lead arriving to find something on the screen. Suspicion drops to a
   * floor - being spoken to does not launder the morning, it resets the meter
   * to somebody who has just been spoken to - and the price is taken off
   * reputation, which is the meter that does not drain.
   */
  bossCaught: 'boss.caught',
  /** He noticed the empties rather than the screen. Cheaper. Not free. */
  bossNoticedEmpties: 'boss.noticed_empties',
  /** A chat nag, which costs a few points of stress and raises no ticket. */
  bossPing: 'boss.ping',
  /**
   * Friday, three o'clock, both ways it goes.
   *
   * Two verbs rather than one with an outcome parameter, because the outcome
   * is not something a caller gets to pick: each one is guarded on the
   * reputation that earns it, so the threshold is enforced by the world rather
   * than by whichever screen happened to do the arithmetic.
   */
  reviewPassed: 'day.review_passed',
  reviewFired: 'day.review_fired',
  /** Friday's clock-off. There is no Saturday, so the week stops here. */
  endWeek: 'day.end_week',
  /** Opening a can: money out, empties up, and a clock the crash reads. */
  consumableDrink: 'consumable.drink',
  /** The one at the end of the week, and only once the probation is over. */
  consumableBeer: 'consumable.beer',
  /** The bill for the can, billed once against the run that bought it. */
  consumableCrash: 'consumable.crash',
  /** The empties, into the bin, before somebody counts them. */
  deskTidy: 'desk.tidy',
} as const;

/**
 * Things the WORLD does, on its own timetable, to itself.
 *
 * A cleaner unplugs a socket at four minutes to five. A tablet in a cupboard
 * offers a password nobody has typed. A maintenance window opens at nine and
 * takes a service down with it. None of that is the player working, and none of
 * it is offered on a button anywhere - but all of it has to be a dispatched
 * action, because everything that changes this world goes through the registry
 * and gets written into the log a replay is rebuilt from.
 *
 * They are separated from the helpdesk verbs so that "what can a first-line tech
 * do" stays an answerable question: this list is the answer to a different one,
 * which is "what happens to you while you are answering it".
 */
export const WORLD_ACTIONS = {
  /** The socket, and the trolley that wanted it. */
  powerCut: 'world.power_cut',
  /** A maintenance window opening on top of a service somebody was using. */
  serviceStopped: 'world.service_stopped',
  /** One more wrong password from something that is not a person. */
  staleLogon: 'world.stale_logon',
  /**
   * The bill for an enrolment nobody checked, arriving a day late in somebody
   * else's incident report - which is exactly how long it takes in real life.
   */
  securityFallout: 'world.security_fallout',
} as const;

export type WorldActionId = (typeof WORLD_ACTIONS)[keyof typeof WORLD_ACTIONS];

export const WORLD_ACTION_IDS: readonly WorldActionId[] = Object.freeze(
  Object.values(WORLD_ACTIONS),
);

export type DayActionId = (typeof DAY_ACTIONS)[keyof typeof DAY_ACTIONS];

export const DAY_ACTION_IDS: readonly DayActionId[] = Object.freeze(
  Object.values(DAY_ACTIONS),
);
