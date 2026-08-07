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
   * Taking the second factor BACK OFF an account, at the account owner's
   * insistence (E8, 0.22.0).
   *
   * The inverse of `accountRegisterMfa`, and its own verb for the same reason
   * every exception here is: turning MFA off is a real, granted state a later
   * incident reads, not a display flag. The whole trap of the org epic is that
   * this is the path of least resistance - the exec will not do MFA, the desk is
   * leaned on, and the account that loses its second factor is the one that gets
   * phished. Nothing about it is a wall; it records what was done at the desk.
   */
  accountRemoveMfa: 'account.remove_mfa',
  /**
   * Giving somebody FullAccess to another account's mailbox (E8, 0.22.0).
   *
   * The EA-delegate onboarding, and the persistence vector a BEC hunt later
   * finds: a delegate keeps reading the mailbox after the owner's password is
   * reset, exactly as it does in the real product. Its own verb because the
   * grant is the setup - the slice-2 grant and the slice-3 find are the same
   * node's field - and because "who can read this mailbox" is a question an
   * incident report asks and a display flag has never answered.
   */
  accountGrantMailboxDelegate: 'account.grant_mailbox_delegate',
  /**
   * Taking a mailbox OFF the mail filter (E8, 0.22.0).
   *
   * The exec-mail-skips-filtering bypass, made a real granted state: `true` is
   * the exemption the exec demanded and the reason the phish that compromises
   * them reaches them at all. Its own verb because the exemption IS the
   * vulnerability the epic is about, and a later incident reads the field it
   * sets rather than a sentence somebody typed.
   */
  accountSetFilterExempt: 'account.set_filter_exempt',
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
  /**
   * Putting a file back where the person who saved it thought they had.
   *
   * A move rather than a copy, because the file in the temp directory is the
   * only one there is and a second copy of it in two places is how a person
   * ends up editing the wrong one for a week. It names the directory it is
   * moving OUT of as well as the one it is moving into: the op language writes
   * to nodes it has been given, and "where was it" is a fact the surface
   * dispatching this can see and the world can check.
   */
  fileMove: 'file.move',
  /**
   * Emptying a directory a program has been filling since 1997.
   *
   * It refuses everything whose contents are not a second copy of something,
   * which is the only kind of "delete" a first-line tech should have. The
   * space goes back to the drive it came off, which is why the machine is
   * named: free space is a fact about a volume, and a directory cannot be
   * walked back to its own box in a guard.
   */
  directoryPurge: 'directory.purge',
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
   * The one verb the aggressive register adds, and the only thing a toned reply
   * does that its neutral twin does not.
   *
   * It is a SOCIAL cost and nothing else: it takes reputation off the player,
   * lands the reporter's reaction on their stream (sharper the second time), and
   * counts the snap. It never touches the ticket's estate - the fix is carried
   * by the SAME effects the neutral reply runs, which is what makes "you never
   * lose a ticket for being rude" a structural guarantee rather than a promise.
   * `dialogue/types.ts` lists it in `SOCIAL_ACTIONS`, and the tone gate proves
   * an aggressive option's ticket work is identical to a neutral one's.
   */
  reporterRebuff: 'reporter.rebuff',
  /**
   * Writing BACK to the reporter: a statement rather than a question.
   *
   * Its own verb, and the difference is not decoration. Everything else that
   * reaches the customer-visible stream is a question - "when exactly did it
   * go?" - so the last line on that stream is not the explanation of anything,
   * and it was being copied onto forty duplicates as the reason their tickets
   * had closed. This is the one that leaves a mark a resolution rule can
   * watch, which is how a ticket whose fix IS a sentence to somebody - the man
   * who reported the phish and got nothing back - can say so where it binds.
   */
  ticketReplyToReporter: 'ticket.reply_to_reporter',
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
   * The week's standing, weighted, written down at the end of each day and
   * once more in the minute the review happens.
   *
   * Same split as the meters: the shell works out the number from readable
   * state, the world decides what it ends up being (and where it stops), and
   * the number is in the dispatch log so a replay arrives at it rather than
   * recomputing it against days it no longer has.
   */
  weekReading: 'day.week_reading',
  /**
   * The lead arriving to find something on the screen. Suspicion drops to a
   * floor - being spoken to does not launder the morning, it resets the meter
   * to somebody who has just been spoken to - and one dated line goes onto the
   * conduct file, which is all it costs the world. What it costs the PLAYER is
   * `CAUGHT_MINUTES` off the shift, charged by the driver on the clock.
   */
  bossCaught: 'boss.caught',
  /** He noticed the empties rather than the screen. Cheaper. Not free. */
  bossNoticedEmpties: 'boss.noticed_empties',
  /** A chat nag, which costs a few points of stress and raises no ticket. */
  bossPing: 'boss.ping',
  /**
   * The three answers to being interrupted, which are the same three answers
   * whether it is a call, a summons or somebody at your shoulder.
   *
   * They are verbs rather than a flag on a window because what the player did
   * is world state: it has to survive a save, it has to replay, and the second
   * arrival of a deferred call has to be able to ask the world whether it is
   * the second arrival. The schedule itself stays stateless
   * (`src/world/interruptions.ts`) - the world holds the DECISIONS, never the
   * timetable.
   *
   * `accept` takes the related ticket as its target when the interruption is
   * about the work in hand, and nothing at all when it is not: that is the
   * whole cost model in one parameter. A benign one writes touch evidence onto
   * the ticket, because a call can be how a ticket moves; a malignant one
   * writes `refocus_until` onto the player, because the twenty-three minutes
   * afterwards are the real price of being taken off the work.
   */
  interruptionAccept: 'interruption.accept',
  /** "Can I call you back?" - once, and the world remembers that it was. */
  interruptionDefer: 'interruption.defer',
  /** "No." Legal only where the entry says it is, and never on a callback. */
  interruptionDecline: 'interruption.decline',
  /**
   * The moment a malignant one ARRIVES, which is charged whatever is done
   * about it.
   *
   * Its own verb rather than a branch of `accept`, because the three answers
   * are answers to something that has already happened: the phone has rung,
   * the room has gone quiet, and declining it does not un-ring it. The refocus
   * window is the price of HANDLING one; this is the price of being reachable.
   */
  interruptionArrived: 'interruption.arrived',
  /**
   * The screen coming back, and the twenty-three minutes starting from there.
   *
   * Its own verb rather than a branch of `accept`, and the reason is a minute
   * rather than tidiness: `accept` happens when the player picks the phone up
   * and the debuff is measured from when they put it DOWN. Writing both in one
   * action meant a six-minute call spent six of its own window recovering from
   * itself, which is not what the research measures and is not what the spec
   * says. The meeting already worked this way - it is answered at the end of
   * its block - and this is what makes a call behave the same.
   */
  interruptionRefocus: 'interruption.refocus',
  /**
   * A phone that rang out. Not a decision and not a refusal: a record that it
   * happened and nobody was there, plus the shorter window the ringing costs
   * on its own.
   */
  interruptionMissed: 'interruption.missed',
  /**
   * The dot, set by the player, refused by the world outside a shift.
   *
   * One verb rather than three because the three are one decision made three
   * ways, and it takes the dot as a NUMBER: the op language enumerates numbers
   * and cannot compare strings, so the caller picks an index out of
   * `PRESENCE_VALUES` and the world writes the canonical word. A caller cannot
   * invent a fourth status, and no surface has to be trusted to spell the
   * three.
   */
  presenceSet: 'presence.set',
  /**
   * A declinable interruption sliding past a red dot instead of ringing.
   *
   * A verb rather than a filter in the driver because it is a thing that
   * HAPPENED and the schedule has to know: the minute it slid at is what the
   * next arrival is measured from, so it rides the world graph exactly as a
   * spent postpone does, and a save taken mid-morning comes back with the same
   * call on the same minute. Nobody presses it - the day loop settles it in
   * the minute the phone would have rung.
   */
  interruptionDodged: 'interruption.dodged',
  /**
   * The mail that goes round after the sync, stamped by the world at the
   * minute the room emptied.
   *
   * A verb rather than a content gate on the calendar because the recap is a
   * CONSEQUENCE: it exists exactly when a meeting has actually finished, so a
   * player looking at Monday's inbox is not reading Wednesday's minutes. The
   * same shape every other consequence-gated thread in this world keeps.
   */
  meetingRecap: 'interruption.meeting_recap',
  /**
   * Somebody opening the conduct file, a minute before the conversation.
   *
   * It writes down what the bar became and why, so that both review verbs are
   * guarded against a number in the graph rather than against arithmetic
   * whichever screen happened to do. Its own verb because it is its own event:
   * the file is opened because somebody had a reason to, and the reason is
   * written beside the number it produced.
   */
  reviewFileRead: 'day.review_file_read',
  /**
   * Somebody reading the selection matrix, in the same minute as the file.
   *
   * The sibling of `reviewFileRead` and it exists for the same reason: the
   * ranking, the line it is held against and the sentence explaining both are
   * written into the world BEFORE the conversation, so the three review verbs
   * are guarded against numbers the graph is carrying rather than against
   * arithmetic whichever screen happened to do. It is only dispatched in a
   * week where a round is actually being decided; in every other week the
   * fields it writes are absent, and absent is "there is no ranking to be in".
   */
  reviewMatrixRead: 'day.review_matrix_read',
  /**
   * Friday, three o'clock, all three ways it goes.
   *
   * Three verbs rather than one with an outcome parameter, because the outcome
   * is not something a caller gets to pick: each one is guarded on the mark
   * that earns it against the bar the world is holding - and, since 0.2.7, on
   * the place in the pool the world is holding as well - so the decision is
   * enforced by the world rather than by whichever screen happened to do the
   * arithmetic. The three sets of guards are mutually exclusive by
   * construction: below the bar is a firing, at or above it and in the cut is
   * a redundancy, and at or above it and out of the cut is a pass.
   */
  reviewPassed: 'day.review_passed',
  reviewFired: 'day.review_fired',
  reviewRedundant: 'day.review_redundant',
  /**
   * Answering a ping that landed after you clocked off, from the morning brief.
   *
   * A verb rather than a shell flag because what it does is world state: a tiny
   * reputation gain paid against a tiny stress carryover into the new day, and
   * the record that keeps the trade once per ping. The world enforces the
   * "once" off its own list, so a button pressed twice is a no-op with a
   * sentence rather than two lots of the same point.
   */
  afterHoursAnswer: 'day.after_hours_answer',
  /**
   * The three ways a night's page is settled (E6, 0.17.0), all driver-raised
   * off the world's own state rather than pressed on a button: a real fire
   * ANSWERED (the unit is up again - uptime saved, standing up), a real fire
   * MISSED (still failed at the on-call day's clock-off - downtime, a hit the
   * review reads), and a flap SCRAMBLED for (you ssh'd in and restarted one that
   * would have settled itself - the alert-fatigue cost). Each moves one meter
   * and each is once, off `on_call_settled`, so a re-tick or a reload cannot pay
   * or charge the same page twice. The flap that settles on its own is marked
   * settled with no verb at all: it costs nothing, so there is nothing to bill.
   */
  onCallAnswer: 'day.on_call_answer',
  onCallMiss: 'day.on_call_miss',
  onCallScramble: 'day.on_call_scramble',
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
  /**
   * Somebody who has been waiting for a first word noticing that the desk they
   * are waiting on is marked Away and is demonstrably working on something
   * else.
   *
   * It is a WORLD verb rather than a day one because nobody in this building
   * does it: it is what happens to you, on somebody else's timetable, because
   * of a dot you set and a dispatch you made. Once per reporter per day, which
   * the world enforces off its own record rather than trusting the caller to
   * count.
   */
  presenceNoticed: 'world.presence_noticed',
} as const;

/**
 * The web store's two verbs: putting software on this machine, and taking it
 * off again.
 *
 * Player-facing helpdesk verbs - installing something IS a thing a first-line
 * tech does - and both are guarded and dispatched through the op language like
 * every other change to the world. What they write is the AUDIT TRAIL, which is
 * world state because it has to survive a save, replay, and outlive the app it
 * is about: uninstalling takes the toy off the machine (which is shell state,
 * the resolved manifest) but the record that it was ever there stays on the
 * graph, because covering your tracks is itself a tell.
 *
 * The install SUCCEEDS under a locked-down policy - it is not a wall - so
 * neither verb branches on the policy: they record what happened, and the
 * CONSEQUENCE (the suspicion drip, the lead's beat) is priced by
 * `world/software.ts` off the trail these verbs write.
 */
export const SOFTWARE_ACTIONS = {
  install: 'software.install',
  uninstall: 'software.uninstall',
} as const;

export type SoftwareActionId =
  (typeof SOFTWARE_ACTIONS)[keyof typeof SOFTWARE_ACTIONS];

export const SOFTWARE_ACTION_IDS: readonly SoftwareActionId[] = Object.freeze(
  Object.values(SOFTWARE_ACTIONS),
);

/**
 * The three answers to the same question arriving everywhere (0.5.0 slice 2).
 *
 * Three verbs rather than one with a kind parameter, exactly as the review's
 * three endings are and for the same reason: each records the SAME dedupe fact
 * - the request is resolved, every copy goes quiet - and differs only in the
 * social effect, which the op language cannot branch on a string param to
 * choose. Convert mints a ticket (its credit comes from that ticket, so it
 * moves no meter here); answer pays gratitude; deflect costs goodwill. All
 * three refuse a request that has already been resolved, off the world's own
 * `request_resolved` set, which is what makes answering-in-three-places waste
 * minutes rather than earn three answers.
 */
export const REQUEST_ACTIONS = {
  convert: 'request.convert',
  answer: 'request.answer',
  deflect: 'request.deflect',
} as const;

export type RequestActionId =
  (typeof REQUEST_ACTIONS)[keyof typeof REQUEST_ACTIONS];

export const REQUEST_ACTION_IDS: readonly RequestActionId[] = Object.freeze(
  Object.values(REQUEST_ACTIONS),
);

export type WorldActionId = (typeof WORLD_ACTIONS)[keyof typeof WORLD_ACTIONS];

export const WORLD_ACTION_IDS: readonly WorldActionId[] = Object.freeze(
  Object.values(WORLD_ACTIONS),
);

/**
 * The career the player crosses (E6): the PROMOTION out of the service desk and
 * the ssh client's trust ledger.
 *
 * Player-initiated verbs on the player's OWN node - accepting the promotion is a
 * decision the player makes, and trusting a host is what their ssh client does
 * on the first connection - so they go through the registry like everything else
 * that changes the world, which is what makes the flipped tier and the recorded
 * host survive a save and a replay rather than being a variable in the shell.
 */
export const CAREER_ACTIONS = {
  /**
   * Accepting the Systems Engineer offer: crossing Tier 2 -> Tier 1. Earned
   * (the world refuses it below the reputation the promotion is offered at) and
   * one-way (it refuses once the player is already an engineer), which is what
   * makes "permanent" a property of the world rather than a promise.
   */
  acceptPromotion: 'career.accept_promotion',
  /**
   * The ssh client trusting a host on first use: appending its id to the
   * known_hosts ledger so the second connection to it skips the fingerprint.
   * The shell only dispatches it for a host not already trusted, which is what
   * keeps the ledger one line per host.
   */
  sshTrustHost: 'career.ssh_trust_host',
} as const;

export type CareerActionId =
  (typeof CAREER_ACTIONS)[keyof typeof CAREER_ACTIONS];

export const CAREER_ACTION_IDS: readonly CareerActionId[] = Object.freeze(
  Object.values(CAREER_ACTIONS),
);

/**
 * The systemd verbs the engineer works a Linux box with (E6, Pass B): the Linux
 * analogue of `serviceRestart`, on a `unit` node rather than a Windows service.
 *
 * They are their own group because a unit is not a Windows service and systemd
 * is not the Service Control Manager - the whole terminal-fidelity point is that
 * the two families differ in shape, and one shared verb would be the first step
 * towards one shell in hats. Each flips the unit node's `unit_state` the way
 * `serviceRestart` flips a `status`, and each is SILENT on success in the shell,
 * because a real `systemctl restart` prints nothing and returns to the prompt -
 * a fabricated "started successfully" line is the Windows family's shape and a
 * lie here. Engine tier is helpdesk like every other verb; the ENGINEER gate is
 * the shell's (there is no ssh, and so no unix terminal, below the promotion).
 */
export const SYSTEMD_ACTIONS = {
  /** `systemctl restart <unit>`: flips a failed/inactive unit to active(running). */
  unitRestart: 'unit.restart',
  /** `systemctl start <unit>`: brings an inactive/failed unit up. */
  unitStart: 'unit.start',
  /** `systemctl stop <unit>`: takes a running unit down to inactive(dead). */
  unitStop: 'unit.stop',
} as const;

export type SystemdActionId =
  (typeof SYSTEMD_ACTIONS)[keyof typeof SYSTEMD_ACTIONS];

export const SYSTEMD_ACTION_IDS: readonly SystemdActionId[] = Object.freeze(
  Object.values(SYSTEMD_ACTIONS),
);

/**
 * The change-control verbs (E6, 0.18.0): break-glass and its abuse record.
 *
 * `breakGlassRecord` writes the legitimate emergency onto `break_glass_audit`;
 * `breakGlassAbuse` writes an override pulled with no fire onto
 * `break_glass_abuse` and charges its suspicion. Both aimed at the player - the
 * trail is a property of who broke the glass - and both append-only, the same
 * shape the software audit keeps. The systemctl gate and the maintenance window
 * reuse the 0.10.0 change request; only these two are new verbs.
 */
export const CHANGE_ACTIONS = {
  breakGlassRecord: 'change.break_glass_record',
  breakGlassAbuse: 'change.break_glass_abuse',
} as const;

export type ChangeActionId =
  (typeof CHANGE_ACTIONS)[keyof typeof CHANGE_ACTIONS];

export const CHANGE_ACTION_IDS: readonly ChangeActionId[] = Object.freeze(
  Object.values(CHANGE_ACTIONS),
);

/**
 * The characteristic-incident verbs (E6, 0.19.0): the fixes for the three
 * classic sysadmin incidents the tier is measured on.
 *
 * `journalVacuum` clears a runaway systemd journal and hands its bytes back to
 * the box's free space (the disk-full fix); `certRenew` replaces an expired TLS
 * certificate and the service serves again (the cert-expiry fix); `postmortemFile`
 * writes the blameless post-incident record that CLOSES an incident once it is
 * resolved. Each is a real state change on a real node - the diagnosis reads the
 * same fields the fix writes, so a fabricated confirmation could never close one.
 * Engine tier is helpdesk like every other verb; the ENGINEER gate is the shell's
 * (there is no ssh, and so no unix terminal, below the promotion).
 */
export const INCIDENT_ACTIONS = {
  /** `journalctl --vacuum-size`: shrink a runaway journal, free the disk. */
  journalVacuum: 'incident.journal_vacuum',
  /** `certbot renew`: replace an expired certificate, the service serves again. */
  certRenew: 'incident.cert_renew',
  /** `postmortem file <unit>`: write the blameless record that closes it. */
  postmortemFile: 'incident.postmortem_file',
} as const;

export type IncidentActionId =
  (typeof INCIDENT_ACTIONS)[keyof typeof INCIDENT_ACTIONS];

export const INCIDENT_ACTION_IDS: readonly IncidentActionId[] = Object.freeze(
  Object.values(INCIDENT_ACTIONS),
);

/**
 * The package-management verbs (E6, 0.20.0): the two that change a Linux box's
 * state, so the two that have to survive a save and be rebuilt by a replay.
 *
 * `aptInstall` records a package in the box's `installed_packages` set - the
 * write that CLOSES the 0.16.0 not-installed gag, after which the previously-
 * absent command (htop/traceroute/net-tools) runs. `aptUpgrade` sets the box's
 * `updates_applied` flag, clearing the pending-updates state `apt update`/
 * `apt list --upgradable` read. `apt update` and `apt list --upgradable` are
 * reads and dispatch nothing; `dpkg -l` is a read too. Both verbs target the
 * MACHINE (a package is installed on a box) and both are guarded and dispatched
 * through the op language like every other change to the world. Engine tier is
 * helpdesk like every other verb; the ENGINEER gate is the shell's - there is no
 * ssh, and so no apt, below the promotion.
 */
export const APT_ACTIONS = {
  /** `sudo apt install <pkg>`: record the package, closing the not-installed gag. */
  aptInstall: 'apt.install',
  /** `sudo apt upgrade`: apply the pending updates, the box is clean after. */
  aptUpgrade: 'apt.upgrade',
} as const;

export type AptActionId = (typeof APT_ACTIONS)[keyof typeof APT_ACTIONS];

export const APT_ACTION_IDS: readonly AptActionId[] = Object.freeze(
  Object.values(APT_ACTIONS),
);

/**
 * The filesystem-permission verbs (E6, 0.21.0): the two that change a Linux
 * file or directory's rwx state, so the two that have to survive a save and be
 * rebuilt by a replay.
 *
 * `chmod` rewrites a node's `fs_mode` (the octal `ls -la` renders to `-rw-r-----`);
 * `chown` rewrites its `fs_owner` and `fs_group`. Both target a `file`/`directory`
 * node and both are pure `set_field`s: the shell does the symbolic-to-octal
 * arithmetic (`g+r` -> the octal) and the "leave this half alone" reads of a bare
 * `chown user`, then dispatches the resolved values, so the engine action is the
 * single write `ls -la` then reads back - no drift. Engine tier is helpdesk like
 * every other verb; the ENGINEER gate is the shell's, since there is no ssh and
 * so no chmod below the promotion.
 */
export const FS_ACTIONS = {
  /** `chmod <mode> <path>`: rewrite the file's permission bits. */
  chmod: 'fs.chmod',
  /** `chown <owner[:group]> <path>`: rewrite the file's owner and group. */
  chown: 'fs.chown',
} as const;

export type FsActionId = (typeof FS_ACTIONS)[keyof typeof FS_ACTIONS];

export const FS_ACTION_IDS: readonly FsActionId[] = Object.freeze(
  Object.values(FS_ACTIONS),
);

export type DayActionId = (typeof DAY_ACTIONS)[keyof typeof DAY_ACTIONS];

export const DAY_ACTION_IDS: readonly DayActionId[] = Object.freeze(
  Object.values(DAY_ACTIONS),
);
