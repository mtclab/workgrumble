/**
 * Graph field names the helpdesk layer reads and writes.
 *
 * The engine schema validates the shape of the fields it knows about and lets
 * a world add its own, so these live here rather than in `src/engine`. One
 * spelling per field: a typo in a string literal is a silent no-op bug, and
 * this is the list the apps, the actions and the ticket assertions all share.
 */
export const FIELDS = {
  /** person */
  name: 'name',
  title: 'title',
  desk: 'desk',
  /**
   * The player's day: `morning_brief`, `shift` or `day_end`. It lives in the
   * graph rather than in the shell because a day has to survive a save and be
   * replayable - a day state re-derived from the clock on load would forget
   * that the player had not finished reading the scorecard.
   */
  dayState: 'day_state',
  /** Everything banked towards the farm, in whole pence. */
  farmFund: 'farm_fund',
  /**
   * The probation week, on the player node because all of it has to survive a
   * save and be replayed.
   *
   * `weekAttempt` counts the goes the player has had at it - a firing does not
   * end the game, it starts the week again with the seed moved on.
   * `weekOpeningFund` is what the fund held on Monday morning, so the week
   * scorecard can report what the WEEK was worth rather than what the player
   * has ever earned. `reviewOutcome` is how Friday at three went - `pending`
   * until it has. `weekEnded` is the Friday clock-off: there is no Saturday,
   * so the week stops rather than rolling into one.
   */
  weekAttempt: 'week_attempt',
  weekOpeningFund: 'week_opening_fund',
  reviewOutcome: 'review_outcome',
  weekEnded: 'week_ended',
  /**
   * The beer: visible from the first morning, locked until the probation ends,
   * and the whole reason the tooltip on it is worth reading. `beerOpened` is
   * whether the one at the end of the week has been had, which is what the
   * scene at 17:00 on Friday shows the second half of.
   */
  beerUnlocked: 'beer_unlocked',
  beerOpened: 'beer_opened',
  /**
   * The pressure meters, on the player node so that a save carries them and a
   * replay arrives at the same numbers. Nothing outside the op language moves
   * them: the shell decides how much, the engine decides what the field ends
   * up being.
   */
  stress: 'stress',
  suspicion: 'suspicion',
  reputation: 'reputation',
  /**
   * How many suspicious minutes the day has had: intervals in which something
   * the boss would rather not see was open on the screen. The scorecard counts
   * these rather than the meter, because a meter that drained back to zero
   * over lunch still happened.
   */
  suspicionEvents: 'suspicion_events',
  /**
   * What the meters have already been billed for.
   *
   * A breach and a resolution are one-off events, and the meter tick is a
   * repeating one, so the tick needs to know which of them it has already
   * charged. Keeping the watermark in the graph rather than in the driver is
   * what makes it survive a save and come back the same after a load.
   */
  breachesCharged: 'breaches_charged',
  resolveCreditPaid: 'resolve_credit_paid',
  /**
   * How many times the lead came round the corner and found something on the
   * screen. Counted per day, like the suspicious minutes, because it is a thing
   * that happened to a day rather than a level the player is at.
   */
  caughtEvents: 'caught_events',
  /**
   * The desk itself. `deskCans` is the empties standing on it - evidence, and
   * the reason there is a tidy-desk action at all. `drinkStartedAt` is the
   * minute the current can was opened (-1 when there is no run), and
   * `drinkTolerance` is how many cans that run is up to, which is what makes
   * each additional one a weaker buff and a harder crash.
   */
  deskCans: 'desk_cans',
  drinkStartedAt: 'drink_started_at',
  drinkTolerance: 'drink_tolerance',
  /**
   * Which run's crash has already been paid for. The crash is a one-off event
   * and the day driver is a repeating one, so it needs a watermark to bill
   * against - the same shape the meters use for breaches.
   */
  drinkCrashCharged: 'drink_crash_charged',
  /** What the machine has had off you today, in whole pence. */
  consumableSpend: 'consumable_spend',
  /**
   * account
   *
   * Three of these are three DIFFERENT faults that wear the same face at the
   * login box, and the whole lockout story rests on them staying apart:
   *
   * - `locked` is automatic and temporary. The directory counted the bad
   *   attempts in `bad_pw_count`, gave up at `locked_since`, and an unlock
   *   clears both. The password is still the password.
   * - `enabled` false is deliberate and permanent until somebody reverses it:
   *   a leaver, a security hold, a contract that ended. Nothing but enabling
   *   it helps, and enabling it is a decision rather than a button.
   * - `passwordExpired` is a policy clock running out on the credential while
   *   the account itself is perfectly healthy. A reset fixes it; an unlock
   *   does not, because there was never a lockout.
   *
   * `pwMustChange` is what a reset leaves behind - the "user must change
   * password at next logon" tick box every real reset sets - and it is a
   * follow-up ticket waiting to happen rather than a fault. `lastLogon` is
   * how a tech answers "is this account even used", and is absent for
   * somebody who has not been in since before the log starts.
   */
  username: 'username',
  locked: 'locked',
  enabled: 'enabled',
  passwordResetAt: 'password_reset_at',
  badPwCount: 'bad_pw_count',
  lockedSince: 'locked_since',
  lastLogon: 'last_logon',
  pwMustChange: 'pw_must_change',
  passwordExpired: 'password_expired',
  /**
   * The modern half of the account, and the one the week's flagship ticket is
   * about.
   *
   * `mfaEnrolledAt` is the minute the second factor was bound to a device -
   * absent means the account has nothing but a password on it. `identityVerifiedAt`
   * is the minute somebody PROVED they were who they said they were before that
   * binding happened, and it is deliberately a separate field: re-enrolling
   * somebody's authenticator on a phone call is the single easiest way to hand
   * an account to a stranger, and a world that recorded "we did the enrolment"
   * without recording "we checked" could not tell the difference afterwards.
   * `securityFalloutAt` is when the consequence of not checking landed - the
   * watermark that stops one skipped check being billed twice, and the field
   * the consequence mail hangs its arrival off.
   */
  mfaEnrolled: 'mfa_enrolled',
  mfaEnrolledAt: 'mfa_enrolled_at',
  identityVerifiedAt: 'identity_verified_at',
  securityFalloutAt: 'security_fallout_at',
  /**
   * When every device this account was signed in on was signed out again.
   *
   * The right fix for a session somebody else is holding, and the wrong fix for
   * an authenticator that died with a phone - which is why it is a verb of its
   * own rather than a flag on the enrolment, and why its refusal is written to
   * be read.
   */
  sessionsRevokedAt: 'sessions_revoked_at',
  /**
   * Whether this account is holding one of the suite's seats.
   *
   * A seat is not a permission and it is not a group: it is a thing the company
   * bought a fixed number of, and the reason a new starter cannot open the
   * accounts package on their first morning is almost never the new starter.
   */
  licence: 'licence',
  /** machine */
  hostname: 'hostname',
  /**
   * What this machine has written down about itself: services that stopped,
   * reboots, lockouts, print queues that gave up, service levels the agent
   * noticed nobody else was watching.
   *
   * Bounded and kept ON THE MACHINE rather than read back out of the dispatch
   * log, exactly like a ticket's touch log and for the same reason: the log is
   * drained at every day boundary, and a fault that only shows up as two
   * outages four days apart is unreadable from a machine that forgets
   * overnight.
   */
  eventLog: 'event_log',
  displayRotation: 'display_rotation',
  resolution: 'resolution',
  pendingUpdates: 'pending_updates',
  uptimeSince: 'uptime_since',
  /**
   * The one fix in this game made of paper.
   *
   * A machine that loses power at the same minute every Tuesday and Thursday
   * does not have a fault; it has an appointment, and the repair is a note on
   * the wall by the socket telling the next person with a vacuum cleaner which
   * plug is not theirs. It is on the machine because that is where the socket
   * is, and it is world state because the fix has to survive the night.
   */
  stickyNote: 'sticky_note',
  /** device */
  type: 'type',
  powered: 'powered',
  wedged: 'wedged',
  batteryPct: 'battery_pct',
  queueLen: 'queue_len',
  /**
   * Whether this device is holding somebody's password and trying it.
   *
   * The classic relock: an account is unlocked, and four minutes later it is
   * locked again, because a tablet in a cupboard has been offering the same
   * wrong password every few minutes since the day it was reset. The device
   * carries the credential, the directory carries the count, and the Event
   * Viewer is where the two meet.
   */
  storedCredential: 'stored_credential',
  /** service */
  status: 'status',
  /**
   * Whether the certificate this service presents has run out.
   *
   * Its own field rather than a stopped status because it is its own fault
   * with its own fix: the service is running perfectly and refusing everybody,
   * which is exactly what an expired certificate looks like from a laptop in
   * somebody's spare room.
   */
  certExpired: 'cert_expired',
  /**
   * How many seats of a licence pool are unclaimed.
   *
   * On the pool rather than counted off the accounts, because the number is
   * what the vendor's console shows and what the refusal has to quote - and
   * because counting edges is not something the op language does, which is the
   * honest reason as well as the practical one.
   */
  seatsFree: 'seats_free',
  /**
   * Whether this is software that can be stopped and started again. Hardware
   * reports a status too - a chassis fan has one - and saying so in the data
   * is what stops "restart it" from being a lie about the physical world.
   */
  restartable: 'restartable',
  /** share + group + mail_rule */
  path: 'path',
  target: 'target',
  /** ticket */
  state: 'state',
  slaDeadline: 'sla_deadline',
  spawnedAt: 'spawned_at',
  breached: 'breached',
  escalated: 'escalated',
  /**
   * The triage the PLAYER assigned: how many people this hits and how fast it
   * has to move, each 1 (low), 2 (medium) or 3 (high). Priority is computed
   * from the pair by a lookup matrix and written alongside them, exactly as a
   * real incident form does it - the field is read-only to the player, because
   * priority is a consequence of the classification rather than an opinion.
   */
  impact: 'impact',
  urgency: 'urgency',
  priority: 'priority',
  /**
   * When the ticket was first touched in a way the reporter could see: a
   * customer-visible comment, or a dispatched action on the ticket's own
   * nodes. It is what stops the RESPONSE clock; the resolution clock carries
   * on regardless, which is the whole point of there being two.
   */
  respondedAt: 'responded_at',
  /**
   * Why the ticket is parked - `awaiting_user` or `awaiting_vendor`. The
   * engine's own state says only that a clock is stopped; the reason is what a
   * review asks for, and it is the difference between "they have not answered"
   * and "it is with the field team".
   */
  holdReason: 'hold_reason',
  /**
   * The two comment streams a real incident carries. `worknotes` is internal -
   * what the player worked out, what the reporter let slip - and
   * `customerVisible` is what was actually put TO the reporter. The CYA rule
   * reads the second one: a question nobody was asked does not stop a clock.
   */
  worknotes: 'worknotes',
  customerVisible: 'customer_visible',
  /**
   * How long this ticket has been parked ALTOGETHER, in simulated minutes.
   *
   * The engine adds a minute to it every minute the ticket spends on hold, in
   * the same breath as it pushes the deadline out. The deadline on its own
   * cannot say this: triaging a ticket re-cuts the deadline from the minute it
   * arrived, and without the counter that hands back every pause the ticket had
   * earned - which made "take it off hold, then triage it" a punishment for
   * following the instruction.
   */
  heldTicks: 'held_ticks',
  /**
   * And how long it has spent waiting for somebody to come back to WORK, in
   * simulated minutes: nights, the morning brief, the hour after the scorecard.
   *
   * The engine keeps it in the same breath as `held_ticks` and for the same
   * reason - both are minutes the deadline was pushed out by, and the triage
   * re-cut has to add both back or it hands the ticket a night's grace it
   * already spent. Two counters rather than one because they answer two
   * different questions: "how long were they sitting on it" and "how much of
   * this ticket's life happened while the office was dark".
   */
  offHoursTicks: 'off_hours_ticks',
  /**
   * The deadline being rebuilt, mid-triage, and never anything else.
   *
   * A re-cut deadline is four terms - the minute the ticket arrived, the
   * target its new priority buys, the pause it has already earned and the
   * hours the office was dark - and the op language adds one term at a time.
   * Writing those partial sums into `sla_deadline` itself put the ticket, for
   * one mutation, on a deadline in the past: the engine breached it on a
   * number it was never actually on, and the breach latches. So the sum is
   * built here, the real deadline is written once, and this is cleared again
   * in the same action - it exists in the graph for three mutations and never
   * appears on a screen.
   */
  slaRecut: 'sla_recut',
  /**
   * What has been done to this ticket's estate, kept on the ticket.
   *
   * One line per dispatched action that touched a node the ticket is about,
   * written at the moment it was dispatched: `tick|action|ok`. It is the
   * handoff form's evidence, and it lives HERE rather than being read back out
   * of the dispatch log because the log is drained at every day boundary - a
   * ticket worked yesterday and escalated today would otherwise arrive at
   * second line claiming nobody had touched it.
   */
  touchLog: 'touch_log',
  /**
   * The parent incident this ticket has been attached to as a duplicate, and
   * the marker that says the parent has been fixed.
   *
   * Two fields because they answer two questions: `parent` is a decision the
   * player made and can be read back at a review, and `parent_resolved` is the
   * fact that closes the ticket - it is the field the child's own resolution
   * rule watches, which is what keeps a bulk close a consequence of the world
   * being fixed rather than of a button being pressed.
   */
  parent: 'parent',
  parentResolved: 'parent_resolved',
  /**
   * The knowledge article this ticket was actually solved with.
   *
   * A ticket is WRITTEN with a `kb_ref` in its definition - the article whose
   * cause it is - and this is the one somebody linked while working it, which
   * is not always the same article and is the only one that counts as
   * evidence. KCS calls the link the solve: an article with tickets on it is
   * an article that has earned its shelf space, and one with none is a draft
   * somebody's notice period produced.
   */
  kbRef: 'kb_ref',
  /** The escalation handoff: what the user reported, and what was tried. */
  handoffReported: 'handoff_reported',
  handoffTried: 'handoff_tried',
  /** When L2 sent a thin handoff back, and when that bounce actually landed. */
  handoffBouncedAt: 'handoff_bounced_at',
  handoffSettledAt: 'handoff_settled_at',
} as const;

export const DEVICE_TYPES = {
  printer: 'printer',
  monitor: 'monitor',
  mouse: 'mouse',
  /**
   * The forgotten kind. A tablet is the only thing on this estate that holds a
   * password of its own, which is what makes it the answer to an account that
   * relocks four minutes after every unlock.
   */
  tablet: 'tablet',
} as const;

/**
 * How many wrong passwords this directory takes before it shuts the door.
 *
 * It lives beside the field names because it is the directory's own policy
 * rather than any one ticket's: the account that arrives locked on Monday, the
 * tablet that hammers its way to a lockout on Thursday and the sentence a KB
 * article uses to explain both are the same number, and a lockout story is only
 * a story if the count in the world and the count in the fiction agree.
 */
export const LOCKOUT_THRESHOLD = 5;

export const SERVICE_STATUS = {
  running: 'running',
  stopped: 'stopped',
  wedged: 'wedged',
} as const;

export const ROTATIONS = [0, 90, 180, 270] as const;

export type Rotation = (typeof ROTATIONS)[number];

export function isRotation(value: unknown): value is Rotation {
  return typeof value === 'number'
    && ROTATIONS.some((rotation) => rotation === value);
}
