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
   * The mark the conversation at three o'clock was actually decided on.
   *
   * Snapshotted by the review itself, because the week carries on being worked
   * afterwards: a ticket closed at half past three moves it up, a deadline
   * missed at four moves it down, and the week screen was reading it live. It
   * could therefore say "37 of 45 needed" directly above "Probation: passed",
   * which is a screen arguing with itself about something the player cannot
   * check.
   */
  reviewReputation: 'review_reputation',
  /**
   * The mark the conversation actually had to clear, and the reason it was
   * that number.
   *
   * The bar used to be a constant in a guard, because a bar that only ever
   * says 45 is a constant. It is not one any more: it starts at
   * `REVIEW_PASS_PERFORMANCE`, and if somebody had a reason to open the
   * conduct file it is raised by what was in it (`src/world/conduct.ts`). It
   * has to be world state rather than arithmetic in the driver for the same
   * reason `review_reputation` does - three screens read it, the guards of
   * both review verbs enforce it, and a threshold the world applies and the
   * screen re-derives is a threshold that can drift.
   *
   * `reviewConduct` is the sentence that goes beside the verdict, written in
   * the same breath and never recomputed: the queue carries on all Friday
   * afternoon, so a summary re-read at five would describe a different week
   * from the one that decided anything.
   */
  reviewBar: 'review_bar',
  reviewConduct: 'review_conduct',
  /**
   * The file: one dated line per thing the lead noticed, for the whole week.
   *
   * The week-cumulative sibling of `caughtEvents`, which is cleared every
   * clock-off because it is a fact about a day. This is not cleared, because
   * the whole point of it is that it accumulates while nothing happens - and
   * because the thing that eventually reads it is reading a WEEK.
   *
   * It costs nothing when it is written. Being seen with a forum up used to
   * take six points off the reputation meter, which 0.2.5 stopped the review
   * reading, so the price had nothing on the other end of it. The price is now
   * the minutes the conversation takes (`CAUGHT_MINUTES`) and this line, and
   * the line only converts into anything when somebody has a reason to look.
   */
  conductFile: 'conduct_file',
  /**
   * The week as the review reads it: a mark out of a hundred for the week to
   * date, folded into the days before it, each older day counting half as much
   * as the one after it.
   *
   * What it HOLDS changed in 0.2.5 and the id did not, on purpose. It used to
   * be the reputation meter folded day over day; it is now `weekPerformance` -
   * how much of the week's own work was closed, and how much of it was closed
   * in time - folded the same way. A field id is save state: every week saved
   * mid-probation by a shipped build carries this key, and renaming it would
   * quietly hand those weeks a standing of nought while the graph still held
   * the old one under the old name. The name is a fossil of what the number
   * used to be; the number is what this comment says it is.
   *
   * It exists because the meter was a sum. Every ticket added to the roster
   * put more credit on the table, so the mark a week had to beat drifted with
   * the content, and the day the roster grew past about twenty-six the week
   * that slacked openly would have overtaken the week that quietly did half
   * the job. A ratio has a denominator that grows with the numerator, so it
   * cannot drift - and it has no ceiling problem either: it is a fresh
   * question every day, and the last day asks it loudest.
   */
  weekReputation: 'week_reputation',
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
  /**
   * WHICH approved method the check was made with, written beside the minute.
   *
   * A stamp on its own says a box was ticked. The verb used to write only the
   * stamp, and the KB used to call a payroll number, a hiring manager and a
   * desk "something only they have" - three facts an attacker reads off a
   * signature block, a company blog and a seating plan. So the check now
   * NAMES its channel and the world holds the answer, because "how did you
   * verify them" is the question the incident report asks, and "verified" has
   * never been an answer to it.
   */
  identityVerifiedMethod: 'identity_verified_method',
  /**
   * The identity-proofing channels this account actually has registered, one
   * per line.
   *
   * Prearranged, on the record, and a property of the ACCOUNT rather than of
   * the conversation - which is the whole distinction the lesson turns on. A
   * caller can supply a payroll number; a caller cannot supply the number the
   * directory already holds for that person, a recovery code issued before
   * they rang, or a face at the desk.
   */
  verificationChannels: 'verification_channels',
  /**
   * The minute the OLD binding was explicitly destroyed, and the minute the
   * account owner was told an authenticator had been re-enrolled.
   *
   * Two separate facts, both written by the enrolment. The KB used to say the
   * old binding "is gone the moment the new one exists", which is a hopeful
   * description of a directory rather than a control: the invalidation is a
   * thing somebody does, and account-recovery notification is a thing the
   * account owner is owed - through a channel already on file, so that a
   * recovery nobody asked for is a recovery they hear about.
   */
  mfaPreviousRevokedAt: 'mfa_previous_revoked_at',
  recoveryNoticeAt: 'recovery_notice_at',
  /**
   * Whether anybody had checked, AT THE MOMENT the authenticator was bound.
   *
   * The latch is the whole of the lesson. `identityVerifiedAt` is a field that
   * can be written at any time, so reading it later answered a different
   * question - "has anybody ever checked" - and both wrong answers were
   * reachable: verifying the next morning cancelled a consequence that had
   * already been earned, and a speculative check on Monday excused an
   * enrolment on Wednesday. What happened at the desk happened; this is the
   * record of it, written once, by the enrolment, and never revised.
   */
  mfaEnrolmentVerified: 'mfa_enrolment_verified',
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
   * What this box is FOR, which is what decides the services on it.
   *
   * A workstation, a print server, a file server and a domain controller do
   * not run the same list, and a first-line tech who has learned one list has
   * learned the shape of the other three. It is seeded per machine rather than
   * guessed from the hostname, because `FILES-01` being a file server is a
   * fact about the estate and not about a naming convention somebody could
   * break with the next box they bought.
   */
  machineRole: 'role',
  /**
   * What is inside the case, as two lines a support call reads out.
   *
   * They are fields rather than strings in the About dialog because two
   * surfaces print them - the dialog and `systeminfo` - and a workstation whose
   * memory depends on which window you opened is not a workstation.
   */
  processor: 'processor',
  memory: 'memory',
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
  /**
   * How many times this device has lost power without being shut down.
   *
   * A count rather than a line in a log, because the log is bounded and this
   * is the one fact the week's two-day arc turns on: a socket that took the
   * warehouse printer down ONCE is an accident, and the same socket taking it
   * down twice is somebody's round. It is what the note on the wall is earned
   * by - the repair is a diagnosis, and a diagnosis needs two timestamps.
   */
  powerLosses: 'power_losses',
  type: 'type',
  powered: 'powered',
  wedged: 'wedged',
  batteryPct: 'battery_pct',
  queueLen: 'queue_len',
  /**
   * The jobs behind that number, one per line: `bytes|stamp`.
   *
   * A count on its own cannot fill a spool directory, and a directory that
   * invented forty-seven sizes and forty-seven times would be exactly the fake
   * the fidelity bar exists to forbid. So the world holds the jobs, the count
   * and the list are written in the same breath by everything that touches
   * either, and a test asserts they agree - which is the only reason a count
   * and a list may live beside each other at all.
   *
   * Nothing here is a document name or an owner: a spool file is named after
   * its job number and the estate holds no job table, so what it holds is what
   * a listing prints. The four identical sizes ARE the four re-sent copies of
   * the same delivery note, which is the diagnosis rather than a decoration.
   */
  spoolJobs: 'spool_jobs',
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
   * The short name the machine knows a service by, beside the long one a human
   * reads: `Spooler` for Print Spooler, `Dnscache` for DNS Client.
   *
   * Both, because both are real and they are used for different things - the
   * long one is what a services list is sorted by and what a user quotes, the
   * short one is what a command takes and what a log entry names. A world with
   * only the long name makes `sc query` a fiction.
   */
  serviceName: 'service_name',
  /**
   * Automatic, Automatic (Delayed Start), Manual or Disabled - what the machine
   * intends to do about this service at the NEXT boot, which is a different
   * question from what it is doing now.
   *
   * It is the field behind a whole class of real ticket: the service somebody
   * set to Manual in 2003, which works perfectly until the box is rebooted and
   * then never comes back. A list with only a status cannot express that, and a
   * status of "stopped" beside a startup type of "Manual" is not a fault at all
   * - which is the other half of the same skill.
   */
  startupType: 'startup_type',
  /**
   * WHAT this thing is, which is what decides whether "restart it" is even a
   * sentence about it. Four answers, four different true refusals:
   *
   * - `service`: software the service manager will stop and start on request.
   * - `system`: software it will NOT, because other running services depend on
   *   it and the stop control is not one it accepts.
   * - `hardware`: a lump of spinning plastic that reports a status. A fan.
   * - `appliance`: somebody else's box answering over the wire - a licence
   *   pool - which has a status and nothing this estate can bounce.
   *
   * It replaced a boolean `restartable`, which could only say no and never why,
   * so a licence pool was refused in the words written for a fan.
   */
  serviceClass: 'service_class',
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
   * How much of this drive is not being used, in bytes.
   *
   * On the machine, because that is what a disk belongs to, and seeded rather
   * than counted off the files on it: the listing shows the handful of things
   * worth naming and a real drive is mostly things nobody names. It is what
   * the footer of a directory listing quotes, and it is the number the
   * disk-full ticket will be about.
   */
  diskFree: 'disk_free',
  /** directory + file */
  /**
   * Which drive this entry is on, by the hostname of the box it belongs to.
   *
   * Every directory and every file carries it, because it is the one fact
   * about a path that the op language cannot walk to: containment is a chain
   * of `contains` edges of no fixed length, and a guard can only look a fixed
   * number of hops. Two verbs need the answer and both need it to refuse
   * rather than to act - a move from one box to another is a copy over the
   * network and a different job, and a directory emptied "on" a machine it is
   * not on would hand free space to the wrong drive.
   */
  volume: 'volume',
  /**
   * The stamp a listing prints beside the entry, as the estate writes dates:
   * `07/09/1998  08:41`.
   *
   * A string rather than a tick, because every file seeded here was written
   * before the Monday this world starts counting on and a negative tick is not
   * a date. What the world CAN date - the log a machine is still writing - is
   * stamped from the clock by `fileStamp`, in the same shape.
   */
  modified: 'modified',
  /**
   * What is in the file, as lines. Absent means an empty file.
   *
   * There is no size beside it on purpose: a listing counts the bytes it would
   * print, so what `dir` says a file is and what `type` puts on the screen
   * cannot come apart. The two entries the world holds no text for - a spool
   * job, a machine's own log - are sized by the thing they are read from.
   */
  content: 'content',
  /**
   * A directory whose contents are OUTPUT rather than text, one line per file:
   * `name|bytes|stamp`.
   *
   * The second directory in this estate whose listing is read from a field
   * rather than from `contains` edges, and it exists for the same reason the
   * first one does. A file's size in this world IS what `type` would print, so
   * a directory of small text files cannot be a directory that has eaten a
   * drive - and a drive eaten by one directory is a real fault with a real
   * diagnosis, which is a listing's own byte total held against the free space
   * in its footer. So the world holds what a listing prints for these - a name,
   * a size and a minute - and holds nothing else, because it knows nothing
   * else: what is inside a scanner's monthly export is the scanner's business.
   *
   * `storedBytes` is the same pile as a number, beside the list, exactly as a
   * printer holds `queue_len` beside `spool_jobs` and for the same two
   * reasons: the op language adds numbers and cannot sum a list, and a gate
   * asserts the two agree after every mutation that touches either.
   */
  storedFiles: 'stored_files',
  storedBytes: 'stored_bytes',
  /**
   * Whether what is in this directory is a SECOND copy of something.
   *
   * A fact about the contents rather than about the directory: the warehouse
   * scanner's monthly exports went to head office the night each of them was
   * written and nobody has opened one since, and the pallet database in the
   * directory next door is the only record of where anything in the building
   * is. Emptying the first kind is a Tuesday afternoon; emptying the second is
   * an incident with your name on it, so the verb that empties a directory
   * reads this and refuses everything that does not say yes.
   */
  disposable: 'disposable',
  /**
   * Whether the account at this terminal is allowed to read it.
   *
   * The estate has exactly one kind of "no" on the filesystem and it is an
   * ACL: the payroll directory on the file server is readable by payroll and
   * by nobody at first line, which is a true fact about a support desk rather
   * than a locked door for its own sake. It is on the entry rather than a
   * group edge because the world holds no file-level directory service and
   * inventing one would imply a fault class this game does not simulate.
   */
  accessDenied: 'access_denied',
  /** share + group + mail_rule */
  path: 'path',
  target: 'target',
  /** ticket */
  state: 'state',
  slaDeadline: 'sla_deadline',
  spawnedAt: 'spawned_at',
  breached: 'breached',
  /**
   * The minutes the two one-off ticket events happened in, written by the
   * ENGINE in the same breath as the state they describe.
   *
   * `spawned_at` used to be the only tick a ticket carried, so every daily
   * count except "arrived" was really a question about NOW wearing a day's
   * name: a Monday ticket that resolved on Tuesday was reported as Monday's
   * close, on a Monday whose pay had been banked at 17:00 without it, and the
   * week card at the end rewrote Monday to disagree with the money. A day is
   * answerable for what HAPPENED in it, and these are how it can tell.
   */
  resolvedAt: 'resolved_at',
  breachedAt: 'breached_at',
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
   * The minute the triage above was filed in.
   *
   * A day's scorecard reports what THAT day got wrong, and the cells are
   * mutable - a ticket can be re-triaged any time it is open - so reading them
   * without a stamp reported Monday's misreading again on Tuesday's clean
   * scorecard, and again at the review. The stamp is what makes each filing
   * count once, on the day somebody filed it.
   */
  classifiedAt: 'classified_at',
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
   * The last thing said TO the reporter that was a statement rather than a
   * question, and the marker that one was said at all.
   *
   * Both streams above are appended to by questions - "when exactly did it
   * go?" is customer-visible, because it is the only place a question the
   * reporter could have seen can live - so the last customer-visible line is
   * not the explanation of anything. It was being copied onto forty duplicates
   * as the reason their tickets closed, which read as the service desk asking
   * forty people when their VPN went and then shutting the ticket.
   *
   * `replied` is what a resolution rule can watch, which is how a ticket whose
   * fix is a sentence to somebody - the man who reported the phish - can say
   * so in the only place that binds.
   */
  replied: 'replied',
  replyToReporter: 'reply_to_reporter',
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

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

/**
 * What a services list is allowed to say about starting a thing at boot, in
 * the four words the real one uses.
 *
 * `Automatic (Delayed Start)` is its own answer rather than a flag on
 * Automatic, because it is what an update service is set to and it is the
 * honest explanation of why something that is meant to be running is not, two
 * minutes after a reboot.
 */
export const STARTUP_TYPES = {
  automatic: 'automatic',
  delayed: 'automatic_delayed',
  manual: 'manual',
  disabled: 'disabled',
} as const;

export type StartupType = (typeof STARTUP_TYPES)[keyof typeof STARTUP_TYPES];

export const STARTUP_TYPE_LABELS: Readonly<Record<StartupType, string>> = {
  [STARTUP_TYPES.automatic]: 'Automatic',
  [STARTUP_TYPES.delayed]: 'Automatic (Delayed Start)',
  [STARTUP_TYPES.manual]: 'Manual',
  [STARTUP_TYPES.disabled]: 'Disabled',
};

export const SERVICE_CLASSES = {
  service: 'service',
  system: 'system',
  hardware: 'hardware',
  appliance: 'appliance',
} as const;

export type ServiceClass = (typeof SERVICE_CLASSES)[keyof typeof SERVICE_CLASSES];

/**
 * The class of a node that reports a status, with the ordinary answer as the
 * default: everything on this estate is a service the manager will stop and
 * start unless its seed says otherwise.
 */
export function serviceClassOf(value: unknown): ServiceClass {
  return value === SERVICE_CLASSES.system
    || value === SERVICE_CLASSES.hardware
    || value === SERVICE_CLASSES.appliance
    ? value
    : SERVICE_CLASSES.service;
}

export function startupTypeOf(value: unknown): StartupType | null {
  return value === STARTUP_TYPES.automatic
    || value === STARTUP_TYPES.delayed
    || value === STARTUP_TYPES.manual
    || value === STARTUP_TYPES.disabled
    ? value
    : null;
}

/**
 * Whether this thing is a SERVICE - something the service control manager
 * knows about, whether or not it will take a stop control for it. A fan and a
 * licence pool report a status and are not, which is why neither of them
 * belongs in a services list.
 */
export function isService(value: unknown): boolean {
  const kind = serviceClassOf(value);
  return kind === SERVICE_CLASSES.service || kind === SERVICE_CLASSES.system;
}

/**
 * Whether the service manager on that box will take a stop and a start for
 * this thing at all. It is a question about WHAT it is, not about how it is
 * doing: a service that is running is still restartable, and the refusal for
 * asking is a different sentence with a different reason.
 */
export function isRestartable(value: unknown): boolean {
  return serviceClassOf(value) === SERVICE_CLASSES.service;
}

export const MACHINE_ROLES = {
  workstation: 'workstation',
  printServer: 'print_server',
  fileServer: 'file_server',
  domainController: 'domain_controller',
} as const;

export type MachineRole = (typeof MACHINE_ROLES)[keyof typeof MACHINE_ROLES];

export const MACHINE_ROLE_LABELS: Readonly<Record<MachineRole, string>> = {
  [MACHINE_ROLES.workstation]: 'Workstation',
  [MACHINE_ROLES.printServer]: 'Print server',
  [MACHINE_ROLES.fileServer]: 'File server',
  [MACHINE_ROLES.domainController]: 'Domain controller',
};

export function machineRoleOf(value: unknown): MachineRole {
  return value === MACHINE_ROLES.printServer
    || value === MACHINE_ROLES.fileServer
    || value === MACHINE_ROLES.domainController
    ? value
    : MACHINE_ROLES.workstation;
}

export const ROTATIONS = [0, 90, 180, 270] as const;

export type Rotation = (typeof ROTATIONS)[number];

export function isRotation(value: unknown): value is Rotation {
  return typeof value === 'number'
    && ROTATIONS.some((rotation) => rotation === value);
}
