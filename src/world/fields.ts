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
   * Which week of the employer arc this one is, counting from 1.
   *
   * A career is a table of weeks the way a week is a table of days
   * (`src/world/pressure.ts`), and this is where the player is in it. It is
   * world state rather than a number the shell keeps because everything about
   * it has to survive a save: which piece of weather is live, which beats have
   * already been readable, and - the one that decides something - how long the
   * player has been here, which is a line on the redundancy matrix and the one
   * line nobody can move.
   *
   * `weekAttempt` is a different question and both are needed. The attempt is
   * how many goes somebody has had at THIS week; the arc week is where the
   * week sits in a career. A firing moves the attempt and leaves the arc where
   * it was, because a retry is the same week again.
   */
  arcWeek: 'arc_week',
  /**
   * When the two announcement beats landed, as ticks, or absent for a week
   * where they have not.
   *
   * They are mail arrival gates and nothing else: `mail/threads.ts` hangs the
   * weather thread and the notice thread off them, so an inbox cannot show
   * somebody an announcement about a round that has not been announced. Seeded
   * by `session.ts` from the arc rather than written by a verb, because both
   * are things that happened in a previous week and the week they happened in
   * is not the week being played.
   */
  pressureWeatherAt: 'pressure_weather_at',
  pressureNoticeAt: 'pressure_notice_at',
  /**
   * Where the player came in the pool, and the first position that goes.
   *
   * Two numbers rather than a flag, because the comparison between them IS the
   * rule and the guards can make it: in the cut is `review_position` at or
   * beyond `review_cut_from`, which is `field_at_least_field` and nothing
   * else. A flag would have been the shell's opinion written into the world;
   * this is the world holding the ranking and the line, and both of them are
   * on the criteria screen for three weeks before either decides anything.
   *
   * Absent in a week with no round on, which is every week the shipped game
   * currently reaches - and absent is the honest answer rather than a nought,
   * because there is no ranking to be first in.
   */
  reviewPosition: 'review_position',
  reviewCutFrom: 'review_cut_from',
  /** The matrix, in the sentence it was read out as. Written with the rest. */
  reviewCriteria: 'review_criteria',
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
   * The player's PAM tier (E6): `service_desk` (Tier 2, the desk you were
   * hired to) or `systems_engineer` (Tier 1, the server tier the promotion
   * crosses to). Absent reads as `service_desk`, which is the whole of why the
   * probation and MSP goldens are byte-identical until the promotion fires:
   * the default is written NOWHERE, exactly as the seeded title and reputation
   * are written nowhere on a fresh week. Only the promotion action ever writes
   * it, and only ever the one direction - it is permanent, so nothing sets it
   * back. On the player node because it has to survive a save and be replayed,
   * and it carries across an employer switch the way the title and standing do.
   */
  playerTier: 'player_tier',
  /**
   * The ssh known_hosts set (E6): the host ids the player's ssh client has
   * done trust-on-first-use against, joined by newlines the way a real
   * `~/.ssh/known_hosts` is one host per line. Absent reads as "trusts nobody
   * yet", so a fresh player and every existing golden carry no such field and
   * stay byte-identical. It is on the player node - a fact about the player's
   * client rather than about any one estate - so it survives a save through the
   * engine's own serialization and is deliberately NOT carried across an
   * employer switch: a new estate is new boxes, and last job's fingerprints
   * mean nothing at this one.
   */
  knownHosts: 'known_hosts',
  /**
   * WHERE THE WEEK'S MINUTES ACTUALLY WENT, as the world recorded them going.
   *
   * One line per change of what the player was doing - `tick|kind|id` - written
   * in the minute it changed, exactly the way a ticket's `touch_log` is written
   * in the minute the ticket was touched, and here for exactly the same reason
   * that field exists: the dispatch log is drained at every day boundary, and a
   * timesheet is a WEEK. A sheet built off the log alone would open on Friday
   * afternoon claiming nobody had done anything before this morning.
   *
   * It is the TRUTH half of the timesheet and the only source the derivation
   * has. It is not a summary and it holds no minutes: minutes are read off it
   * by `deriveTimesheet`, which is the one piece of arithmetic in the game that
   * turns records into hours, so the pre-fill and any later "what really
   * happened" reading are the same function called twice.
   */
  timesheetLog: 'timesheet_log',
  /**
   * And what the player SAYS happened, which is a different thing and is kept
   * as a different thing.
   *
   * One line per edited entry - `day|bucket|minutes|detail` - and it never
   * touches `timesheet_log`. A line the player padded, moved or wrote vaguely
   * is stored ALONGSIDE the derived truth rather than over it, because the
   * whole mechanic is the gap between the two and a claim that overwrote the
   * record would close the gap by destroying the evidence. A bucket with no
   * line here is claimed exactly as derived, in full detail, which is what
   * makes an untouched sheet an honest one.
   */
  timesheetClaim: 'timesheet_claim',
  /**
   * The minute the sheet went in, and whether anybody pressed anything.
   *
   * Submission FREEZES the claim - the world refuses an edit afterwards, the
   * way a filed invoice refuses one - so the minute is the fact both the
   * refusal and the reading turn on. `timesheetSubmittedAuto` is the honest
   * label on a sheet that went in because the week ended rather than because
   * the player filled it in: it is still submitted, it is still what the
   * customer gets, and it says which of those two it was.
   */
  timesheetSubmittedAt: 'timesheet_submitted_at',
  timesheetSubmittedAuto: 'timesheet_submitted_auto',
  /**
   * WHICH RUNG OF THE INVOICE LADDER HAS ALREADY BEEN HANDED OVER, per customer
   * - `customer|rung|tick`, one line per beat that actually happened.
   *
   * It is emphatically NOT a scrutiny meter. Where an account stands is derived
   * from the claim, the customer's own estate log and the conduct file every
   * time anybody asks (`world/invoice.ts`), so a padded line put back before
   * Friday takes the pressure off by arithmetic rather than by a counter
   * somebody has to remember to decrement. The one thing that cannot be
   * derived is what has already been SAID to the player, because that is a fact
   * about the past - so that, and only that, is written down.
   *
   * On the player rather than on the customer node, for two reasons: a customer
   * node's fields are a closed schema in `core-rs`, and this is a fact about
   * the player's invoices rather than about the client's business.
   */
  invoiceLadder: 'invoice_ladder',
  /**
   * WHAT THE PLAYER SAID THE PROJECT WAS DOING - `day|rag|tick`, one line per
   * report filed, the latest for a day winning.
   *
   * The watermelon (0.30.0, slice 3), and it is the timesheet's claim/record
   * split said again about a project: the phase, the dates and whether anything
   * has slipped are DERIVED in `world/project.ts` and never stored, and this is
   * the colour the player told the business. Nothing reads this to decide where
   * the project is. The only thing it is ever used for is the question that
   * comes the morning a slip goes public, which is answered out of BOTH - the
   * green on the report and the date on the plan - and never out of a second
   * copy of the truth, because there is not one.
   */
  projectReport: 'project_report',
  /**
   * The reports the org has already answered - `day|rag|tick` for the manager
   * beat, so a red said once is a meeting about it once.
   */
  projectReportAnswered: 'project_report_answered',
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
   * The minute the player stops looking for their place again, or absent when
   * they are not.
   *
   * An interruption that had nothing to do with the work in hand does not stop
   * costing when it ends: the honest, visible version of the twenty-three
   * minutes the research measures is a short window in which the fumble
   * threshold behaves as if stress were higher. One field with an expiry tick,
   * set by the verb that ends the interruption and read by
   * `meters.isRefocusing` - not a state the player manages, because it is a
   * cost rather than a mechanic to play around.
   *
   * It is a player-node field for the same reason the meters are: a save
   * carries it, a replay arrives at it, and nothing outside the op language
   * moves it.
   */
  refocusUntil: 'refocus_until',
  /**
   * What the player did about each interruption, as three lists of ids.
   *
   * Three fields rather than one line-per-event log, and the split is the
   * whole reason the guards work. The op language matches a WHOLE line
   * (`line_in_field`), so a record carrying a minute and a verb could only be
   * checked by a caller that already knew the minute - which is a caller
   * checking its own homework. An id on its own is a thing the world can be
   * asked about with nothing but the id: "has this been answered", "has this
   * been pushed once already". Which list an id is in is what the player did.
   *
   * A deferred interruption is not settled - it is coming back - so it stays
   * out of the other two lists until the second arrival is dealt with, and its
   * presence in this one is what makes the second arrival undeclinable.
   */
  interruptionAnswered: 'interruption_answered',
  interruptionDeferred: 'interruption_deferred',
  interruptionDeclined: 'interruption_declined',
  /**
   * The ledger behind the deferred list: one line per push, so the same id
   * appears as many times as it has been pushed.
   *
   * Two fields rather than one because they answer two different questions and
   * the guards need both. "Has this been pushed at all" is a set - it is what
   * makes a second arrival undeclinable - and a set cannot count. "How many of
   * the budget are left" is arithmetic on a count, and the count has to live
   * in the graph rather than in the driver: a budget the shell remembered
   * would be a budget that came back full after a load, which is the quiet
   * version of an interruption that can be pushed for ever.
   *
   * The count is the whole record. Nothing writes the REMAINDER, because a
   * remainder is a number two places would have to agree about; what is left
   * is the entry's authored budget minus the lines in here, computed wherever
   * it is asked.
   */
  interruptionPostpones: 'interruption_postpones',
  /**
   * And the same pushes again, with the minute each one was pressed on:
   * `id@tick`, one line per push, oldest first.
   *
   * A second record rather than a richer version of the one above, and the
   * reason is the guards. `line_in_field` and `line_count_at_least` match
   * WHOLE lines, so the list the world refuses from has to be ids and nothing
   * else - a ledger carrying minutes could only be counted by a caller that
   * already knew the minutes, which is a caller marking its own homework. So
   * the refusals read the ids, and the SCHEDULE reads this.
   *
   * It exists because a postpone buys its minutes from the PRESS. Measured
   * from the arrival instead, a player who read the dialog for eleven minutes
   * and then pushed a ten-minute window bought nothing at all: the budget went
   * down, the desk did not come back, and the callback landed in a minute that
   * had already gone. The minute is the driver's to report, exactly as a touch
   * log is, and the dispatch log carries it so a replay writes the same string
   * rather than rebuilding it against a clock nobody saved.
   */
  interruptionSpentAt: 'interruption_spent_at',
  /**
   * And the fourth: the ones nobody answered.
   *
   * A phone that rings out is not a decision, which is exactly why it needs a
   * record of its own rather than a place in the three above. It is evidence
   * in the same class as the conduct file - it costs nothing today, it is
   * written in the minute it happened, and it is the surface a later slice
   * reads when somebody asks how often this desk does not pick up. Without it
   * the cheapest thing a player can do about a ringing phone is nothing at
   * all, and a choice grammar whose best answer is "ignore it" is decoration.
   */
  interruptionMissed: 'interruption_missed',
  /**
   * The web store's paper trail: every install, `id@tick`, one line per install,
   * oldest first, and it is IT auditing IT.
   *
   * The same `id@tick` shape as `interruptionSpentAt` and read the same way -
   * the DRIVER builds the line in the minute the button was pressed and the
   * world appends it, so a replay writes the identical string rather than
   * rebuilding it against a clock nobody saved. It is what the lead's beat arms
   * off (`world/software.ts`), and it is deliberately WRITE-ONLY from the
   * player's chair: uninstalling takes the app off the machine and leaves this
   * untouched, because a record that vanished when you removed the evidence
   * would make covering your tracks free.
   */
  installAudit: 'install_audit',
  /**
   * And the other half of the trail: every uninstall, `id@tick`, one line per
   * removal.
   *
   * A separate field rather than a deletion from the one above, for the reason
   * the whole slice turns on: the removal is itself a thing that happened, and
   * a desk that quietly un-recorded its own installs would be a desk the audit
   * could not read. So `install_audit` only ever grows, and this is where the
   * "and then they took it off again" line lives - which is worse, not better,
   * evidence.
   */
  installRemoved: 'install_removed',
  /**
   * The install lines the lead has already been down to talk about: a COPY of
   * the audit trail as it stood at the last such conversation.
   *
   * The audit trail only grows and cannot be cleared - that is the whole point
   * of it - so the beat cannot close its evidence the way the do-not-disturb
   * beat clears its accrued minutes. This is how it closes instead: being spoken
   * to copies the whole audit trail into here, and the beat reads only the audit
   * lines this copy does NOT hold - the ones added since. It is a copy of an
   * append-only field rather than a watermark integer on purpose: there is no
   * number for a hand-edited save to set past the trail (hiding a real install)
   * or below the mark (replaying spent evidence), because the reader recomputes
   * the unspoken set off the audit itself and no value here can hide a line that
   * is genuinely on it. ABSENT is "nothing spoken about yet", which is what keeps
   * a scripted week - which installs nothing and so is never spoken to about
   * software - byte-identical to before the store existed.
   */
  installNoticed: 'install_noticed',
  /**
   * The dot: available, dnd or away, and ABSENT for anybody who has never
   * touched the tray.
   *
   * Absent is `available` (`presence.readPresence`) rather than a value seeded
   * onto the player node, and that is the determinism argument of the whole
   * slice rather than a saving: a field nothing writes is a field no scripted
   * walk carries, so the golden weeks are byte-identical to the ones from
   * before the dot existed. The moment a player sets one it is world state
   * like every other - it rides the save, it replays, and the boss reads it.
   */
  presence: 'presence',
  /**
   * The fifth interruption list: the ones the dot slid past, one line per
   * slide, `id@tick`.
   *
   * The same shape as `interruptionSpentAt` and for the same reason - the
   * SCHEDULE reads it, so it has to carry the minute - but a different record,
   * because it is a different thing that happened. A postpone is the player
   * asking for one; this is somebody seeing a red dot and deciding not to
   * ring, which costs no budget and offers no choice. Keeping them apart is
   * what stops a morning on do-not-disturb from quietly eating a workstation's
   * postpones.
   */
  interruptionDodged: 'interruption_dodged',
  /**
   * Minutes the dot said busy while the dispatch log said working, TODAY, and
   * since the last time somebody was spoken to about it.
   *
   * The evidence the lead's status beat is armed off, and it is INTEGRATED
   * rather than sampled: every minute that was do-not-disturb-while-working
   * goes in, counted between watermarks, so a dot flipped for one minute costs
   * one minute. It was an interval-endpoint sample once, and an endpoint sample
   * is a rule about two instants a day rather than about a morning - a player
   * who put the dot up just after each meter tick and took it down just before
   * the next one paid nothing at all for a morning of it.
   *
   * Day-scoped and CONSUMED: `start_shift` clears it and being spoken to
   * clears it, because the sentence it exists to justify is a claim about this
   * morning. Evidence from Monday cannot re-arm a beat on Thursday.
   */
  dndWorkingTicks: 'dnd_working_ticks',
  /**
   * The minute those minutes have been counted UP TO.
   *
   * The other half of integrating rather than sampling: the accrual window is
   * everything since this watermark, so no minute is counted twice and none is
   * skipped by a status change that happened to land between two meter ticks.
   * It is moved by the meter tick and by the status verb itself, which is what
   * closes the books on the dot being replaced at the minute it is replaced.
   */
  dndBilledTo: 'dnd_billed_to',
  /**
   * And the suspicion already billed against those minutes.
   *
   * A watermark rather than a rate applied per interval, the same shape the
   * breach counter uses: the drip is two points per five minutes, which is not
   * a whole number of points per minute, so the world charges the difference
   * between what the accumulated minutes are worth and what has already been
   * paid. Exact over any number of minutes, and impossible to erase by
   * changing the dot a moment before a boundary.
   */
  dndSuspicionCharged: 'dnd_suspicion_charged',
  /**
   * Who has already escalated about the Away dot today: one line per reporter,
   * and the line is the PERSON.
   *
   * "Per day" is the world clearing the record every morning rather than a
   * date written into each line by whoever dispatched it: the uniqueness key
   * is then the reporter alone, which the action already has as a parameter,
   * and there is nothing for a caller to get wrong or to spell differently.
   * Not a drumbeat: the same person watching the same desk work through the
   * same afternoon says it once.
   */
  presenceNoticed: 'presence_noticed',
  /**
   * The after-hours pings the player has answered, one id per line.
   *
   * A day does not end when the shift does: a ping or two lands overnight, in
   * the gap between clocking off and the next login, and the "while you were
   * out" surface on the morning brief is where they are read. Answering one is a
   * tiny reputation gain paid against a tiny stress carryover into the new day;
   * leaving it is free of both. This is the record that makes the trade once per
   * ping - the world refuses a second answer off this field, so the button
   * cannot be pressed twice for two lots of the same point, and a reload lands
   * on the same answered set the save carried.
   *
   * ABSENT for anybody who has answered nothing, which is everybody who has
   * never touched the surface - the same determinism argument the dot keeps: a
   * field nothing writes is a field no scripted walk carries, so the golden
   * weeks are byte-identical to the ones from before the tail existed.
   */
  afterHoursAnswered: 'after_hours_answered',
  /**
   * The on-call pages that have already FIRED, one page id per line (E6, 0.17.0).
   *
   * A promoted engineer carries the pager after hours: on an on-call night a
   * service falls over and a page fires - a real fire that downs a unit and
   * raises a ticket, or a flap that clears itself. This is the idempotency
   * record the driver writes when it raises a night's pages, so a reload or a
   * second clock-off cannot fire the same page twice - the same watermark shape
   * `raiseFirstIncident` guards the first incident with, made a list because a
   * career has many nights.
   *
   * ABSENT for a service-desk player and every pre-promotion save, which is the
   * whole of why on-call is byte-identical until the promotion: nobody below the
   * engineer tier is ever paged, so nothing is written and no golden carries it.
   */
  onCallFired: 'on_call_fired',
  /**
   * The pages the on-call day is DONE with, one bare page id per line (E6,
   * 0.17.0).
   *
   * The idempotency set every settling verb reads: a page is answered, missed,
   * cleared or scrambled exactly once, and this is the record that makes "once"
   * true across a reload and a re-tick. `line_in_field` refuses a second settle
   * against a bare id, so a jittery hand cannot pay the scramble twice and a
   * unit restarted, downed and restarted again cannot be answered twice for two
   * lots of reputation. It is the SET; which way each went is the parallel
   * record below, the same split `request_resolved` / `request_resolved_as`
   * keeps and for the same reason.
   */
  onCallSettled: 'on_call_settled',
  /**
   * And the same pages with HOW each ended, one `pageId@outcome` per line (E6,
   * 0.17.0), `outcome` one of answered / missed / cleared / scrambled.
   *
   * A second record rather than a richer version of the set above, because
   * `line_in_field` matches whole lines: the list a second settle is refused
   * against has to be bare ids, so the refusal reads `on_call_settled` and the
   * page SURFACE reads this to say whether the fire was caught or missed and
   * whether the flap was left or scrambled for. Absent for anybody never paged.
   */
  onCallSettledAs: 'on_call_settled_as',
  /**
   * The break-glass trail (E6, 0.18.0): every emergency change control was
   * broken for, `unit@tick`, one line per override, oldest first.
   *
   * The same append-only `id@tick` shape as `install_audit` and read the same
   * way - the DRIVER builds the line in the minute the glass was broken and the
   * world appends it, so a replay writes the identical string. Break-glass is
   * the emergency, audited override for a service ACTIVELY DOWN in an incident:
   * it acts outside the normal window and is LOGGED LOUDLY here for the review
   * after, exactly as a real break-glass account is. It only ever grows, because
   * a trail that could be cleared would defeat the point of breaking the glass
   * being a thing you answer for.
   *
   * ABSENT for a service-desk player and every pre-promotion save - nobody below
   * the engineer tier can break the glass, so nothing is written and no golden
   * carries it, which is the whole of why change control is byte-identical until
   * the promotion.
   */
  breakGlassAudit: 'break_glass_audit',
  /**
   * And the other half of the trail (E6, 0.18.0): every time the glass was
   * broken with NOTHING on fire, `unit@tick`, one line per attempt.
   *
   * A separate field rather than a marker on the trail above, for the reason the
   * slice turns on: breaking the glass for routine work is ABUSE, and it reads at
   * the review the way a morning on Do Not Disturb does - so the abuse is its own
   * record AND it costs suspicion when it happens. A legitimate emergency and an
   * abused override are two different things a review asks two different questions
   * about, so they are two different lists. Append-only and absent until an
   * engineer misuses the override.
   */
  breakGlassAbuse: 'break_glass_abuse',
  /**
   * The linked requests the player has resolved, one bare id per line.
   *
   * A linked request is the same question arriving on mail, chat and a Hubbub
   * room at once (0.5.0 slice 2); resolving it on ANY surface - converting it
   * to a ticket, answering the human, or sending them to the form - quietens
   * every copy, and this is the record that makes that dedupe true across all
   * three. It is the SET the guard reads: `line_in_field` refuses a second
   * resolution against a bare id, so a request cannot be resolved twice however
   * many windows it is showing in.
   *
   * ABSENT for anybody who has resolved nothing, which is everybody who has
   * left the cross-posted noise alone - the same determinism argument the dot
   * and the after-hours tail keep: a field nothing writes is a field no
   * scripted walk carries, so a week that ignores the requests is byte-identical
   * to one from before they existed.
   */
  requestResolved: 'request_resolved',
  /**
   * And the same resolutions with WHICH way each went: `id@kind`, one per line,
   * `kind` one of convert / answer / deflect.
   *
   * A second record rather than a richer version of the set above, and the
   * reason is the guard: `line_in_field` matches whole lines, so the list a
   * second resolution is refused against has to be bare ids - a ledger carrying
   * the kind could only be refused by a caller that already knew the kind. So
   * the refusal reads `request_resolved`, and every SURFACE reads this to say
   * whether the request was converted, answered off the books, or sent to the
   * form. The driver stamps the line the same way it stamps an install's
   * `id@tick`, so a replay writes the identical string.
   */
  requestResolvedAs: 'request_resolved_as',
  /**
   * The minute the room emptied after the mandatory sync, or absent while
   * nobody has sat through one.
   *
   * It is what the recap mail is gated on, so the thread exists exactly when
   * the meeting has actually happened and every line in it is stamped from
   * there. Absent is the whole answer for a week that has not reached the
   * Wednesday: an inbox holding minutes of a meeting nobody has been to is an
   * inbox telling the player their own future.
   */
  meetingRecapAt: 'meeting_recap_at',
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
   * When the manager-override audit finding landed (E8, 0.24.0) - the latch that
   * stops the CYA consequence charging twice, the same shape as
   * `security_fallout_at`. Written on the over-privileged account the moment the
   * audit flags the Domain Admin grant, whichever way it was granted.
   */
  overrideFalloutAt: 'override_fallout_at',
  /**
   * WHO owns the risk when the over-privileged grant is flagged (E8, 0.24.0):
   * the accepting owner's id when a signed risk acceptance named one, or the
   * `unauthorised` marker when the grant was made with nothing on file. The
   * whole of the sign-off's teeth is that this field - and the suspicion the
   * desk is or is not charged beside it - reads differently on the two paths.
   */
  incidentOwner: 'incident_owner',
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
   * Whether a live, attacker-held session is standing on this account (E8,
   * 0.22.0): the research truth the BEC incident turns on - a session or OAuth
   * token stolen in the phish SURVIVES a password reset, because a reset changes
   * the credential and not the sessions already minted from it.
   *
   * `true` is a stolen session still live; seeded by the BEC incident onto the
   * compromised exec, and cleared ONLY by `accountRevokeSessions` - not by a
   * reset, not by re-enabling. It is a real, eq-checkable state the incident's
   * resolution rule reads, which is what makes "revoke the sessions" a distinct
   * required step rather than a thing a password change quietly covers. Absent on
   * every ordinary account (the byte-clean default), and the revoke verb only
   * writes it where it is already present, so no other world moves an inch.
   */
  sessionLive: 'session_live',
  /**
   * Whether this account is holding one of the suite's seats.
   *
   * A seat is not a permission and it is not a group: it is a thing the company
   * bought a fixed number of, and the reason a new starter cannot open the
   * accounts package on their first morning is almost never the new starter.
   */
  licence: 'licence',
  /**
   * The exec weak spot (E8, 0.22.0): the three states a VIP security EXCEPTION
   * writes onto an account, and the persistence surface an inbox compromise
   * later hides in.
   *
   * The whole thesis of the org-dysfunction epic is that the exception IS the
   * vulnerability - a shipped, sanctioned bypass an executive demands and the
   * desk grants under pressure - so each of these is a real, granted state a
   * later incident reads, not a flag the game merely displays.
   *
   * `mailboxDelegate` is who has been given FullAccess to this mailbox, by
   * account id, or absent for the ordinary case of nobody. Granting the EA a
   * delegate is the everyday convenience that is also the persistence vector a
   * BEC hunt finds: a delegate keeps reading the mailbox after the owner's
   * password is reset, exactly as it does in the real product.
   *
   * `filterExempt` is whether this mailbox has been taken OFF the mail filter -
   * the exec-mail-skips-filtering bypass Mimecast/Defender ship as a feature.
   * `true` is the exemption granted (the hole open); absent/`false` is the
   * ordinary filtered mailbox. It is why the phish that compromises the exempted
   * exec reaches them at all.
   *
   * `mailboxRules` is the inbox rules on this mailbox, one rule per line, in the
   * shape a later hunt reads (`name|action|target`). Seeded EMPTY (absent) on
   * every account here: benign inbox rules are the ordinary case, and the
   * malicious forward-to-external rule the BEC attacker sets - the one that KEEPS
   * FORWARDING after a password reset - is a later pass's to seed and hunt. It is
   * a newline-joined list field, read with `line_in_field`, so it round-trips a
   * save through the engine's own serialization exactly as the audit trails do.
   */
  mailboxDelegate: 'mailbox_delegate',
  filterExempt: 'filter_exempt',
  mailboxRules: 'mailbox_rules',
  /**
   * The rubber-stamp (E8, 0.23.0): whether the access recertification was
   * "approved all" without working the queue.
   *
   * On the recert ticket, set only by `recertApproveAll` - the manager's "just
   * approve them all" made a real, dispatchable action. It records that the
   * audit was rubber-stamped and touches NO membership, so the recert's
   * resolution rule (which reads the findings, never this) stays false: the
   * blanket-approve fails closed, the findings stay live, and the review breaches.
   * Absent on every other ticket and never written by a scripted walk, so the
   * goldens are byte-identical to before the recert existed. It exists as world
   * state - rather than the approve-all being a pure no-op - so the dialogue and
   * a save can both read that the desk signed off without looking.
   */
  recertRubberStamped: 'recert_rubber_stamped',
  /**
   * The VIP flag (E8, 0.26.0) - the quietest injustice in the queue.
   *
   * On a PERSON, it is the ServiceNow-family VIP checkbox: this caller is on the
   * executive-support list. On a TICKET it is the same fact stamped at spawn from
   * the caller behind it (the engine writes it, like `sla_tier`), and it is what
   * FORCES that ticket's priority regardless of what actually broke - the real
   * mechanic, where the flag is not a bug and not an override anybody has to
   * type. Absent is the ordinary caller and the ordinary ticket, which is
   * everybody who came before it.
   */
  vip: 'vip',
  /**
   * When the queue-jump's cost landed (E8, 0.26.0): the latch that stops the
   * collision's fallout charging twice, the same shape as `override_fallout_at`.
   * Written on the ticket that was left waiting the minute its clock runs out -
   * the exec who went over your head, or the team that sat blocked - so the cost
   * of the choice lands once, on the one that waited.
   */
  queueJumpFalloutAt: 'queue_jump_fallout_at',
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
   * Which family of operating system this box runs: `windows` or `linux`.
   *
   * Orthogonal to the role and seeded per machine the same way, never guessed
   * from the hostname - `APP-01` being a Linux box is a fact about the estate,
   * not a naming convention. Absent reads as `windows`, so every save and
   * fixture that predates the heterogeneous estate stays a Windows building.
   *
   * It is the field the Windows-family tools read before they refuse: `sc`,
   * `services` and `restart` aimed at a Linux box answer the way the real tools
   * do - they cannot reach a service manager that is not Windows - and the
   * refusal names systemd, which is the lesson that there is another family here.
   */
  machineOs: 'os',
  /**
   * Which CUSTOMER of the MSP this box belongs to (0.8.0), by customer-node id.
   *
   * A machine dimension seeded per machine, exactly like `os` above and never
   * guessed - `FONT-DC-01` belonging to Fontaine & Associates is a fact about
   * whose estate it is, not a naming convention. Absent means NO customer: the
   * in-house probation estate and break-fix Bodgeworth boxes carry none, which
   * is why the customer dimension is purely additive and their goldens do not
   * move. It is the field the scope-of-touch honesty engine reads before it
   * refuses an out-of-contract action, and the field the wrong-customer guard
   * compares against the customer the open ticket put on screen.
   */
  machineCustomer: 'customer',
  /**
   * A customer node's business type (0.8.0): `law_firm`, `saas`, and so on.
   *
   * An open set on purpose - the estate research names more verticals than the
   * spine ships - so it is a plain string the display maps to a label, not a
   * closed enum like the scope below.
   */
  customerBusinessType: 'business_type',
  /**
   * A customer node's contract scope (0.8.0): `monitoring_only`, `helpdesk`,
   * `co_managed` or `fully_managed`.
   *
   * The gameplay-relevant field: the honesty engine reads it before an action
   * lands and refuses, truthfully, anything the contract does not cover - the
   * same engine 0.7.0 shipped for cross-OS refusals, generalised OS -> CONTRACT.
   */
  customerServiceScope: 'service_scope',
  /** A customer node's SLA tier (0.8.0): `bronze`, `silver`, or `gold`. */
  customerSlaTier: 'sla_tier',
  /* -- the co-managed RACI (E9, 0.37.0) ----------------------------------- */
  /**
   * Which of the two IT teams the RACI map hands THIS box to at a co-managed
   * customer: `msp` or `internal`.
   *
   * A machine dimension seeded per machine, exactly like `os` and `customer`
   * above, and read by the scope pre-flight and by nothing else. A mature
   * co-managed contract RACI-maps every major function - endpoint management,
   * server patching, backup monitoring, the help desk, application ownership -
   * and the commonest split leaves APPLICATION OWNERSHIP with the customer's own
   * team while the MSP takes infrastructure and the desk. This is that map, at
   * the grain a game can act on: a box.
   *
   * ABSENT is the shipped 0.8.0 behaviour and means the map says nothing about
   * this target, so the co-managed default stands - notify their IT, then act.
   * Every non-co-managed customer reads it as absent because nobody writes it
   * there, which is why the field is purely additive and no other estate moves.
   */
  raciOwner: 'raci_owner',
  /**
   * The trail of unilateral remediations on a box their own IT owns: one
   * `verb@tick` line per action taken without a coordination notice, oldest
   * first.
   *
   * The same append-only shape as `install_audit` and `break_glass_audit`, and
   * the SHELL builds the line in the minute the action was dispatched so a
   * replay writes the identical string. It only ever grows: the complaint that
   * comes back is answered and finished with, and what was done on somebody
   * else's box is not.
   */
  raciViolations: 'raci_violations',
  /**
   * The minute of the LATEST unilateral remediation on that box - the stamp the
   * peer sysadmin's complaint is due off.
   *
   * Latest rather than first, and that is the whole of how a second violation
   * gets a second complaint: the settler compares it against the minute of the
   * last complaint below, so a box that has been touched again since the last
   * word has a word owing, and one that has not is quiet.
   */
  raciViolatedAt: 'raci_violated_at',
  /**
   * The minute their sysadmin's complaint about that box landed.
   *
   * Absent until one has. At or after `raci_violated_at` it means every
   * unilateral touch on that box has already been answered for, which is what
   * the fallout verb refuses a second time on.
   */
  raciComplainedAt: 'raci_complained_at',
  /* -- the change request (0.10.0) ---------------------------------------- */
  /**
   * The exact action a change request authorises: the id of the node it is
   * aimed at, and the verb (a registered action id) it clears. The scope
   * pre-flight reads BOTH before it lets an out-of-scope action through - a
   * request that clears a restart of one service does not clear a restart of
   * another, which is the whole of what "for a specific action" means.
   */
  crTarget: 'cr_target',
  crVerb: 'cr_verb',
  /**
   * The paperwork the form is defined by: a stated RISK and a ROLLBACK note,
   * and the approver's REASON (an approval's rationale, or a rejection's why).
   * Content, read back on the request and in its refusal, never gameplay-typed.
   */
  crRisk: 'cr_risk',
  crRollback: 'cr_rollback',
  crReason: 'cr_reason',
  /**
   * The filed status - `draft`, `submitted`, `approved` or `rejected`. It is
   * `submitted` the moment a verb files one; the LIVE lifecycle (under review,
   * approved-but-not-in-window, open, closed) is derived from the tick fields
   * below against the clock, the same read-never-copy discipline the monitoring
   * board keeps, so it cannot drift from the review it is in.
   */
  crStatus: 'cr_status',
  /**
   * The decision the authority reached, baked at file time and deterministic:
   * `approve` for the risky/out-of-scope work a change request exists to gate,
   * `reject` for a request that asks a change to do a contract's job (a
   * monitoring-only remediation - which is a contract change, not a change
   * request).
   */
  crDecision: 'cr_decision',
  /**
   * When it was filed, and the tick the review clears on. Until `cr_review_until`
   * the request is under review; after it, the decision lands. Deterministic
   * (seeded off the request id, never a wall clock or Math.random), so a save
   * mid-review reloads to the same minute the paperwork was always going to
   * clear on.
   */
  crSubmittedAt: 'cr_submitted_at',
  crReviewUntil: 'cr_review_until',
  /**
   * The approval window, in absolute ticks - the maintenance slot an approved
   * change may be acted in. WRITTEN ONLY when the decision is `approve`, so it
   * is genuinely empty until approved; acting before it opens or after it closes
   * is refused with the window named, which is the emergency-you-cannot-touch
   * and the hour-nobody-wanted made mechanical.
   */
  crWindowOpen: 'cr_window_open',
  crWindowClose: 'cr_window_close',
  /** Which customer the request is for, by id, for the queue and the listing. */
  crCustomer: 'cr_customer',
  /**
   * Which VARIANT of change request this node is (E8, 0.24.0). Absent on the
   * 0.10.0 scope change request (the default, the maintenance-window kind);
   * `risk_acceptance` on the CYA / manager-override variant, where the artifact
   * is the SAME change_request node but the "approval" is not a scope decision
   * with a window - it is the ACCEPTING OWNER's signature. The scope pre-flight
   * and the change-request listing skip the risk-acceptance kind, because it is
   * not the maintenance-window mechanic and does not authorise a terminal verb.
   */
  crKind: 'cr_kind',
  /**
   * Who must SIGN a risk acceptance for it to mean anything (E8, 0.24.0): the id
   * of the ordering manager, the accepting owner. Seeded on the draft with the
   * order; the sign verb copies it into `cr_accepted_by`, which is the signature
   * landing. It is a distinct field from the accepted-by so that a draft carries
   * WHO is on the hook before anybody has actually put their name to it.
   */
  crRequiredSigner: 'cr_required_signer',
  /**
   * Whose signature is ON the risk acceptance (E8, 0.24.0) - the accepting owner
   * who signed, by id. Absent until the manager signs; written by the sign verb
   * from `cr_required_signer` alongside `cr_decision = approve`. This is the
   * field that records WHO signed, and the one a later consequence reads to land
   * the risk on the accepting owner rather than on the desk that did the work.
   */
  crAcceptedBy: 'cr_accepted_by',
  /**
   * The coordination notice a co-managed action is cleared by (0.11.0). The
   * target it clears (the id of the box or service the MSP told the customer's
   * own IT it was touching), the customer whose IT was notified, and the minute
   * the heads-up was given. The scope pre-flight reads `coord_target` before it
   * refuses a co-managed action - a notice on one box does not clear another,
   * the way "notify their IT first" is coordinate-then-act rather than a free
   * hand. Written by the `notify` verb; serialised whole, so a notice given
   * mid-day survives a reload.
   */
  coordTarget: 'coord_target',
  coordCustomer: 'coord_customer',
  coordNotifiedAt: 'coord_notified_at',
  /**
   * The PROJECT's schedule and its facts (0.29.0), on the `project` node.
   *
   * Two families and no third. The SCHEDULE - started, and the tick each phase
   * is due by - is baked ONCE at kickoff out of the business-hours calendar
   * (`serviceDeadline`), which is what makes a plan three days out survive a
   * save: reload at any minute and the dates the board draws are the dates it
   * always drew. The FACTS are the two one-off minutes a phase turns on: when
   * the cable actually moved, and when somebody moved it back.
   *
   * There is deliberately no `phase` here. The live phase is DERIVED from these
   * ticks, the clock and the state of the estate every time anybody asks
   * (`world/project.ts`), the same read-never-copy discipline a change request's
   * status keeps - so no surface can be showing a phase the world has left.
   */
  projectCustomer: 'project_customer',
  projectStartedAt: 'project_started_at',
  projectAuditDue: 'project_audit_due',
  projectStagingDue: 'project_staging_due',
  projectCutoverDue: 'project_cutover_due',
  projectHandoverDue: 'project_handover_due',
  projectCutoverAt: 'project_cutover_at',
  projectRolledBackAt: 'project_rolled_back_at',
  /**
   * The edge-replacement project's own estate fields (0.29.0).
   *
   * On the OLD edge box: whether anybody has established what is actually on it,
   * and - the field the whole beat turns on - WHERE that answer came from. A
   * handover pack is what somebody wrote down; the live config is what the box
   * is doing. Both count as an audit, both pass the audit gate, and only one of
   * them knows about the rules nobody wrote down.
   */
  fwAudited: 'fw_audited',
  fwAuditSource: 'fw_audit_source',
  fwAuditedAt: 'fw_audited_at',
  /**
   * On each RULE - a named thing the edge does, `runs_on` the box that does it.
   * The project it belongs to (so a gate can ask about this project's rules and
   * not every rule in the world), the order canon migrates in (routing, NAT,
   * policies, VPNs), whether the handover pack lists it, whether it has been
   * carried onto the new box, and - for the two that can be missed - the ticket
   * the morning after cutover raises about it, and the minute it did.
   */
  fwRuleProject: 'fw_rule_project',
  fwRuleClass: 'fw_rule_class',
  fwRuleOrder: 'fw_rule_order',
  fwRuleDocumented: 'fw_rule_documented',
  fwRuleMigrated: 'fw_rule_migrated',
  fwRuleScreamTicket: 'fw_rule_scream_ticket',
  fwRuleScreamedAt: 'fw_rule_screamed_at',
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
  /**
   * The shadow-IT tail (E8, 0.26.0): whether this device is ENROLLED in mobile
   * device management, and whether the corporate mailbox on it is working.
   *
   * `mdmEnrolled` is the whole of the honest tension. A company-issue phone is
   * enrolled, so the desk can push a mail profile to it from a console in a
   * second. The executive's PERSONAL tablet is not - nobody enrolled it, because
   * it is not the company's device - and no amount of clicking makes it one, so
   * the management verb refuses it and says why. It is also why the tablet cannot
   * simply be refused: enrolment is what the desk lacks, not responsibility, and
   * the company's mail is on it either way.
   *
   * `mailProfileOk` is whether the mailbox on the device is actually syncing. It
   * is written by the two ways there are to fix one - the MDM push (managed) and
   * the manual walkthrough with the person holding it (unmanaged) - so "the mail
   * works again" is one readable state whichever route got there. Absent on every
   * device that has no corporate mailbox on it at all, which is all of them until
   * a ticket says otherwise.
   */
  mdmEnrolled: 'mdm_enrolled',
  mailProfileOk: 'mail_profile_ok',
  /**
   * Whether the remote-support tool has been granted SCREEN RECORDING on this
   * Mac (0.32.0, the creative vertical).
   *
   * macOS keeps a short list of consents that no administrator can grant on
   * somebody's behalf, and this is the one a support desk meets first: a
   * management profile can pre-approve Accessibility for a support tool, and
   * it cannot pre-approve Screen Recording - that click belongs to the person
   * sitting at the keyboard, in System Settings > Privacy & Security. So the
   * field is not an MDM state and is not a fault of the box: it is what the
   * viewer is allowed to see, `false` being the black screen the ticket is
   * about.
   *
   * It carries on the MACHINE rather than on any tool node because that is
   * where the consent lives - it is granted per application on that Mac - and
   * it is what the MDM push verb reads to refuse a thing no console can do.
   * Absent everywhere but a managed Mac, so every other estate reads nothing
   * and behaves exactly as it did.
   */
  tccScreenRecording: 'tcc_screen_recording',
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
   * The name systemctl takes for a Linux unit: `nginx.service`,
   * `postgresql@16-main.service`. The `.service` suffix is part of the name,
   * because it is part of the name on a real box - a unit type is not decoration.
   *
   * On a `unit` node rather than reusing `service_name`, because a unit and a
   * Windows service are two different things a different manager knows about,
   * and a shared field would be the first step towards one shell in hats.
   */
  unitName: 'unit',
  /**
   * What systemd says a unit is doing, in the real words it prints:
   * `active (running)`, `active (exited)`, `inactive (dead)`, `failed`,
   * `activating`. The Linux analogue of a service `status`, and `failed` is the
   * honest word for a unit that died - unlike the invented `wedged`, it has a
   * real meaning in a real manager.
   */
  unitState: 'unit_state',
  /**
   * Whether a unit starts at boot, in systemctl's own vocabulary: `enabled`,
   * `disabled`, `static`. The Linux analogue of a Windows `startup_type`, and
   * `static` is the honest answer for a unit that cannot be enabled or disabled
   * because it is pulled in by another - which is what journald is.
   */
  unitEnabled: 'unit_enabled',
  /**
   * The launchd DOMAIN a job is bootstrapped into (0.33.0), on the `unit` nodes
   * of the third family and on nothing else.
   *
   * It is the half of a launchd job that has no systemd cousin at all. Every
   * modern `launchctl` verb takes a service TARGET rather than a name -
   * `launchctl print system/com.apple.mDNSResponder`, `launchctl kickstart -k
   * gui/501/com.adobe.ARMDC.Communicator` - and the domain in front of the
   * label is what says whether the job is a root DAEMON that runs whether or
   * not anybody is logged in, or a per-user AGENT that comes and goes with the
   * login session. Two things a tech has to get right, and the reason
   * `launchctl print` on the wrong domain fails rather than guessing.
   *
   * So it is DATA on the unit, the way the state and the enablement are, and
   * not something the dialect infers off a label prefix: which domain a job
   * lives in is a fact about the job, and `com.adobe.*` is in both of them on
   * the very estate this ships for. Absent means the node is not a launchd job
   * - every systemd unit on every Linux box carries none, and nothing reads it
   * there.
   */
  launchdDomain: 'launchd_domain',
  /**
   * A unit's journal (E6, Pass B): the lines `journalctl -u <unit>` prints and
   * the tail `systemctl status` shows, one journal line per newline, in the real
   * `MMM DD HH:MM:SS host process[pid]: message` shape.
   *
   * A real field the world holds rather than an invented one, and the honest
   * home for WHY a unit failed: a downed product unit carries its failure
   * cascade here (the process exit, systemd's retries, the start-limit it hit),
   * which is what a diagnosing engineer reads before the restart. Absent means
   * the world holds no journal for this unit, and `journalctl` says exactly that
   * - `-- No entries --`, the real answer - rather than inventing startup lines
   * for it. Seeded by the incident that downs a unit, the way every other fault
   * in this game arrives with its ticket; a healthy baseline unit carries none,
   * so the estate is byte-identical until an incident writes one.
   */
  unitJournal: 'unit_journal',
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
   * Whether SELinux is ENFORCING on this box, in SELinux's own two words:
   * `enforcing` or `permissive` (E6, 0.28.0).
   *
   * A field on the MACHINE and not a simulator, exactly like `cert_expired` is a
   * field on the unit: the whole of the mode is what `getenforce` prints, what
   * `sestatus` says twice, and whether a denial is refused or merely logged.
   * `setenforce` is the one thing that writes it. Absent means the box has no
   * SELinux on it at all - which is every box on this estate except a player's
   * own machine reinstalled onto the RHEL family - so every seeded world is
   * byte-identical until somebody puts Fedora on their workstation.
   */
  selinuxMode: 'selinux_mode',
  /**
   * The SELinux security context a file is LABELLED with, in the real four-part
   * `user:role:type:level` shape (E6, 0.28.0) - the label the kernel checks,
   * which is not the same question as the rwx bits and is the whole of why a
   * denial can happen on a file whose `ls -la` row is perfect.
   *
   * The one the estate cares about is the TYPE in the middle: content restored
   * out of somebody's home directory carries `user_home_t`, the web server runs
   * as `httpd_t`, and the policy does not let the second read the first. Written
   * by `restorecon`, which does not invent a label - it copies
   * `selinux_context_default` back, because that is precisely what a relabel is.
   */
  selinuxContext: 'selinux_context',
  /**
   * What the POLICY says this path should be labelled (E6, 0.28.0): the context
   * `restorecon` restores to, held on the file beside the label it currently
   * carries.
   *
   * Two fields rather than one because the two are genuinely different facts - a
   * file's label is state, the policy's answer for its path is not - and because
   * a relabel that took its target from anywhere else would be the shell
   * inventing the policy. Restoring a file that is already correct writes the
   * same value, which is why `restorecon` on a correct file is honest rather
   * than a lie about having fixed something.
   */
  selinuxContextDefault: 'selinux_context_default',
  /**
   * The minute SELinux was put in permissive mode on the player's own box (E6,
   * 0.28.0), stamped on the machine the moment `setenforce 0` runs.
   *
   * The same shape as `mfa_enrolled_at`: the record that it HAPPENED, which is
   * what makes the shortcut a thing the world remembers rather than a thing that
   * merely worked. `selinux_noticed_at` is the watermark beside it, and the two
   * together are the delayed-consequence rail the enrolment beat already runs
   * on - the mail hangs its arrival off the second one.
   */
  selinuxPermissiveAt: 'selinux_permissive_at',
  /** When somebody upstream noticed the enforcement was off (E6, 0.28.0). */
  selinuxNoticedAt: 'selinux_noticed_at',
  /**
   * Whether the last backup this service ran actually produced a RESTORABLE
   * backup, as opposed to a job that merely reported success (0.13.0).
   *
   * Its own field, and the whole of the onboarding horror, because the two facts
   * a real backup keeps are different questions that a running job conflates: the
   * job ran and exited zero (`status` says `running`, green), and the job left
   * something you could actually restore from (this). A backup that has been
   * FAILING SILENTLY is `status: running` and `backup_verified: false` - the
   * screen is green and the restore is empty, which is exactly the state a
   * discovery audit exists to find and a monitoring board that only reads
   * `status` walks straight past. Flip it true and the box is genuinely safe;
   * that is the field the audit's finding is read from and nothing else.
   */
  backupVerified: 'backup_verified',
  /**
   * When this backup last produced a verified restore point, as the date the
   * audit prints it (0.13.0). Flavour beside the machine-readable `backupVerified`
   * above: a stale date is what makes "months" a real number on the screen rather
   * than a word, and it is seeded, never computed, because the estate holds no
   * wall clock to subtract one from.
   */
  backupLastSuccess: 'backup_last_success',
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
  /**
   * How many bytes the systemd journal is eating on a Linux box (E6, 0.19.0).
   *
   * The disk-full incident's real state, and the number `du -sh /var/log/journal`
   * reads: a crash-looping service floods journald and the journal grows unbounded
   * until the root filesystem is at 100%. It is on the machine beside `disk_free`
   * and it is a REAL field du reads, not a printed string - change it and du
   * changes, which is the teeth of the diagnosis. Absent (a healthy box) reads as
   * a small baseline, so the estate is byte-identical until the incident seeds a
   * runaway. `journalctl --vacuum-size` reduces it to the vacuum target and frees
   * the difference back onto `disk_free`, exactly as the real command does.
   */
  journalBytes: 'journal_bytes',
  /**
   * The blameless post-incident record, one `unit@tick` line per postmortem
   * filed, oldest first (E6, 0.19.0).
   *
   * The same append-only `id@tick` trail as `break_glass_audit` and read the
   * same way - the DRIVER builds the line in the minute the postmortem was
   * written and the world appends it, so a replay writes the identical string.
   * After an incident resolves, the engineer writes a short post-incident record:
   * what happened, what the SYSTEM (never the person) let happen, the follow-up.
   * The prose itself is authored, blameless content (`world/postmortem.ts`), gated
   * so it names no person; this field is the world's proof that one was filed and
   * the record it closed the incident on. It only ever grows, because a postmortem
   * that could be un-filed would defeat the point of writing it. ABSENT for a
   * service-desk player and every pre-promotion save.
   */
  postmortems: 'postmortems',
  /**
   * Whether the failed-deploy incident's unit has had its postmortem written
   * (E6, 0.19.0).
   *
   * The close marker the failed-deploy incident's resolution rule reads: the fire
   * is out when the unit is back up AND the blameless postmortem has been filed,
   * because a postmortem is how that incident is CLOSED rather than merely fixed.
   * A boolean on the unit rather than a read of the append-only trail above,
   * because a ticket's `resolved_when` compares a field to a value and cannot walk
   * a line ledger - so the postmortem verb writes both, the prose to the trail and
   * this flag on the unit it documents. Absent (never filed) reads as false.
   */
  postmortemFiled: 'postmortem_filed',
  /**
   * The packages an engineer has `apt install`ed onto a Linux box (E6, 0.20.0),
   * one package name per line the way `dpkg` keeps one record per package.
   *
   * The state that CLOSES the 0.16.0 not-installed gags: `htop`/`traceroute`/
   * net-tools are absent on a stock box, so typing one is `command not found` +
   * the `sudo apt install <pkg>` hint - until the engineer installs it, which
   * appends the package here, after which the previously-gagged command RUNS.
   * On the machine because a package is installed on a box, not on the player,
   * and a REAL field the gag reads: append the package and the command resolves,
   * strip it and it reverts to the gag. Absent (a stock box, and every existing
   * save) reads as "nothing installed by hand yet", so the estate is byte-
   * identical until an engineer ssh's in and installs - the append is the only
   * thing that ever writes it, and it round-trips a save through the engine's own
   * serialization exactly as `known_hosts` and `postmortems` do.
   */
  installedPackages: 'installed_packages',
  /**
   * Whether a Linux box's pending security/package updates have been applied
   * (E6, 0.20.0): `false`/absent is a box BEHIND on patches, `true` is a box
   * that has run `apt upgrade` and is clean.
   *
   * A box drifts behind on updates the way real ones do, so the pending set is a
   * deterministic baseline DERIVED off the box id (`cmd-unix.ts`) rather than
   * seeded into the graph - which is what keeps every existing save byte-
   * identical, since the derivation writes no field. This one boolean is the
   * REAL state `apt update`/`apt list --upgradable` read (behind -> the N
   * upgradable rows incl a security one; applied -> nothing to upgrade) and
   * `apt upgrade` writes: flip it and the upgradable count flips with it. Absent
   * reads as `false` (behind), so a box is byte-identical until the engineer
   * patches it, and the flip round-trips a save like every other node field.
   */
  updatesApplied: 'updates_applied',
  /**
   * A Linux file or directory's permission bits, as the octal string `chmod`
   * takes and `ls -la` prints the rwx triad of (E6, 0.21.0): `"600"`, `"640"`,
   * `"755"`. The ONE truth the two commands share - `ls -la` renders it to the
   * `-rw-r-----` mode column, and `chmod` (octal `640` or symbolic `g+r`)
   * rewrites it - so a listing after a chmod cannot disagree with the chmod,
   * because it reads the field the chmod wrote. A meaningful bit: a config file a
   * service cannot read because its mode is wrong is the permission-denied
   * incident's real fault. Linux-only, absent on a Windows `file` node (dir shows
   * no rwx), so every existing world is byte-identical until an engineer ssh's in.
   */
  fsMode: 'fs_mode',
  /**
   * The owning user of a Linux file or directory (E6, 0.21.0): the third column
   * `ls -la` prints and what `chown user:group` rewrites. A plain user name
   * (`root`, `fcauth`), read against the box's passwd set. The owner half of the
   * rwx question - owner-read applies when the reading user IS the owner - so it
   * decides, with `fs_group` and `fs_mode`, whether a service can read its file.
   * Linux-only, absent on Windows file nodes.
   */
  fsOwner: 'fs_owner',
  /**
   * The owning group of a Linux file or directory (E6, 0.21.0): the fourth column
   * `ls -la` prints and the second half of `chown user:group`. Group-read applies
   * when the reading user is a MEMBER of this group - which, for a service account
   * whose primary group is its own name, is when the group equals the user. The
   * permission-denied fix restores the group (`chown root:fcauth`) so group-read
   * reaches the service. Linux-only, absent on Windows file nodes.
   */
  fsGroup: 'fs_group',
  /**
   * The config/key file a systemd unit must be able to READ to start (E6,
   * 0.21.0): the file node id its startup depends on. Present only on a unit
   * whose fault is a permission one - the permission-denied incident's unit
   * points here at its unreadable env file - and read by the shell's
   * `systemctl restart/start` gate, which refuses to bring the unit up while the
   * file is not readable by the unit's service account (the same `fs_mode`/
   * `fs_owner`/`fs_group` `ls -la` reads). Absent on every ordinary unit, so a
   * restart is ungated exactly as before; the estate is byte-identical until the
   * incident builds the unit that carries it.
   */
  requiresFile: 'requires_file',
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
   * The reporter's reaction to being snapped at, one line per snap, sharper the
   * second time.
   *
   * It is its OWN field and emphatically not `customer_visible`, because the
   * whole promise of the tone framework is that being rude changes nothing
   * mechanical - and `customer_visible` is not just a display stream, it is the
   * evidence the CYA rule reads to decide whether a question was put to the
   * reporter (`ticket.set_waiting`). A reporter reacting to being told off is
   * not the player asking them a diagnostic question, so it must not unlock
   * "waiting on user" that the neutral reply on the same beat cannot. Absent on
   * every ticket nobody has been rude on, so it never gates anything and never
   * appears on a golden.
   */
  reporterReaction: 'reporter_reaction',
  /**
   * How many times the player has snapped at this ticket's reporter - the
   * per-reporter counter behind the aggressive register.
   *
   * It lives on the ticket because a beat belongs to a ticket, and it is what
   * makes "repeating it escalates" a fact the world holds rather than a promise:
   * the first rude reply lands the reporter's reaction on their stream, and a
   * second one reads this and lands the SHARPER one. Absent on every ticket
   * nobody has been rude on, which is every ticket in every scripted week - so
   * the field never appears on a golden and the arithmetic that reads it treats
   * missing as nought.
   */
  rudeReplies: 'rude_replies',
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
  /* -- the audit queue (E9, 0.36.0) --------------------------------------- */
  /**
   * WHOSE triage this is, on a ticket somebody else already classified.
   *
   * The presence of this field is the whole of what makes a ticket an audit
   * item rather than one of yours: the queue splits on it, the audit panel
   * draws off it, the confirm verb is guarded on it and the correction hook on
   * `ticket.classify` fires on it. It holds the first-line analyst's NAME
   * rather than a node id, because the junior is content and not estate - a
   * person seeded into the building would move the impact walk under every
   * shipped ticket, and the whole of what this mechanic needs of them is a
   * signature.
   */
  auditOf: 'audit_of',
  /**
   * What is wrong with that filing, in one word, or absent for one that is
   * right.
   *
   * Stamped at the deal off the authored item, so the settler is a pure read of
   * the ticket rather than a re-derivation that could disagree with the
   * content. `impact` is a misreading of the estate, `matrix` is the table's
   * own arithmetic ignored, `beneficiary` is the VIP flag read off whoever
   * typed the ticket instead of whoever it is for.
   */
  auditFault: 'audit_fault',
  /**
   * Who the ticket is FOR, where that is not who raised it.
   *
   * The shadow-VIP truth the customer-axis research names: VIP lists cover
   * "executives and their assistants", the flag keys off the BENEFICIARY, and
   * report quality keys off the requester. It is a display line rather than a
   * node reference because that is what the queue needs of it - the flag it
   * decides is stamped on the ticket by the deal, and the shipped VIP rule
   * takes it from there.
   */
  beneficiary: 'beneficiary',
  /** `confirmed` or `corrected` - how the audit was ruled, and when. */
  auditVerdict: 'audit_verdict',
  auditVerdictAt: 'audit_verdict_at',
  /** When a confirmed-wrong triage came back as a breach with your name on it. */
  auditFalloutAt: 'audit_fallout_at',
  /**
   * The class of repeated fault this ticket belongs to, for the KB beat.
   *
   * A string on the ticket rather than a lookup, so "have I seen two of these"
   * is a question about the BOARD and not about the content tables - which is
   * what lets the prompt survive a save without a second record of it.
   */
  auditClass: 'audit_class',
  /**
   * The class the PLAYER has written the article for (KCS, on the player node).
   *
   * One class today and the field holds its id rather than a flag, because the
   * question the next arrival asks is "which one", not "any".
   */
  kbAuthored: 'kb_authored',
  /**
   * When an escalation was sent WITHOUT handing the ticket over (E9, 0.36.0).
   *
   * Retained ownership, the senior rung's second shape break: the junior hands
   * off and the ticket leaves the board, the senior "retains ownership of
   * request and incidents until resolution". The stamp is what the queue draws
   * the retained chip from, and the ABSENCE of `escalated` beside it is what
   * keeps the clock running - which is the whole mechanic, because you cannot
   * escalate your way out of a deadline that is still yours.
   */
  retainedAt: 'retained_at',
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
  /**
   * The chair-side kind (0.14.0). An intraoral X-ray sensor is a USB device on
   * the operatory workstation, and its whole failure mode is the one the dental
   * vertical is built on: "not detected", cleared by a reseat of the USB
   * connector - which is a power-cycle of the device in this world's terms.
   */
  sensor: 'sensor',
  /**
   * The executive's own kind (E8, 0.26.0). Wireless earbuds that will not pair
   * are the smallest thing on this estate and, on a VIP ticket, the one with the
   * tightest clock on it - which is the joke and the mechanic in one node.
   */
  earbuds: 'earbuds',
  /**
   * The company-issue phone: a MANAGED device, enrolled in MDM, and the contrast
   * the shadow-IT ticket is built on - the same mailbox on two devices, one the
   * desk can push a profile to and one it cannot touch.
   */
  phone: 'phone',
  /**
   * The one at the bottom of the comms cabinet (0.29.0): the ISP's fibre
   * handoff, the network terminating equipment the whole site's internet
   * arrives on. It is a device rather than a machine because nobody logs into
   * it and nobody may configure it - it has one cable out of it, and which box
   * that cable is in IS the cutover. Moving it is a real edge in the graph,
   * which is why the rollback can be a verb rather than an apology.
   */
  circuit: 'circuit',
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
  /** A Windows member server running IIS - the intranet, the timesheet portal. */
  iisServer: 'iis_server',
  /** A Linux box running the product the company sells. */
  appServer: 'app_server',
  /** A Linux box running the product's database. */
  dbServer: 'db_server',
  /**
   * The edge (0.29.0): the box the site's internet arrives through, and the
   * only one on an estate whose failure is everybody's at once. Its own role
   * rather than a server with a firewall on it, because what it IS decides
   * everything about it - nothing it runs is a service anybody logs into, and
   * the work it takes is rules rather than restarts.
   */
  firewall: 'firewall',
} as const;

export type MachineRole = (typeof MACHINE_ROLES)[keyof typeof MACHINE_ROLES];

export const MACHINE_ROLE_LABELS: Readonly<Record<MachineRole, string>> = {
  [MACHINE_ROLES.workstation]: 'Workstation',
  [MACHINE_ROLES.printServer]: 'Print server',
  [MACHINE_ROLES.fileServer]: 'File server',
  [MACHINE_ROLES.domainController]: 'Domain controller',
  [MACHINE_ROLES.iisServer]: 'IIS server',
  [MACHINE_ROLES.appServer]: 'Application server',
  [MACHINE_ROLES.dbServer]: 'Database server',
  [MACHINE_ROLES.firewall]: 'Edge firewall',
};

export function machineRoleOf(value: unknown): MachineRole {
  return value === MACHINE_ROLES.printServer
    || value === MACHINE_ROLES.fileServer
    || value === MACHINE_ROLES.domainController
    || value === MACHINE_ROLES.iisServer
    || value === MACHINE_ROLES.appServer
    || value === MACHINE_ROLES.dbServer
    || value === MACHINE_ROLES.firewall
    ? value
    : MACHINE_ROLES.workstation;
}

/**
 * The family of operating system a box runs. Three, because the estate is
 * heterogeneous: Windows workstations and servers, Linux product boxes, and -
 * since 0.32.0 - the Macs a creative shop runs on.
 *
 * Absent reads as `windows`, which is the back-compat rule - every box that
 * predates this dimension is a Windows box, exactly what it was before. A
 * value this list has never heard of reads as `windows` too, for the same
 * reason: the default is what the world was before anybody wrote a value.
 */
export const MACHINE_OS = {
  windows: 'windows',
  linux: 'linux',
  mac: 'mac',
} as const;

export type MachineOs = (typeof MACHINE_OS)[keyof typeof MACHINE_OS];

export const MACHINE_OS_LABELS: Readonly<Record<MachineOs, string>> = {
  [MACHINE_OS.windows]: 'Windows',
  [MACHINE_OS.linux]: 'Linux',
  [MACHINE_OS.mac]: 'macOS',
};

export function machineOsOf(value: unknown): MachineOs {
  return value === MACHINE_OS.linux || value === MACHINE_OS.mac
    ? value
    : MACHINE_OS.windows;
}

/**
 * Whether a box is in the UNIX family, which from 0.32.0 is two families and
 * not one.
 *
 * The question nearly every OS check in this codebase is actually asking is
 * "is this a Windows box", and while there were two values the answer was
 * spelled `=== linux` everywhere. A third value makes that spelling a bug
 * rather than a shorthand: a Mac would silently read as a Windows box and get
 * a C: drive, a Windows service list and the wrong refusal. So the membership
 * question has a name, and the sites that mean it say it.
 *
 * The sites that genuinely mean LINUX - systemd unit naming, apt and dnf, the
 * SELinux surface, anything distro-flavoured - keep the `=== linux` spelling,
 * because those are facts about a distribution and macOS has none of them.
 */
export function isUnixFamily(os: MachineOs): boolean {
  return os === MACHINE_OS.linux || os === MACHINE_OS.mac;
}

/**
 * The uid macOS gives the first human account on a box, and the one every
 * `gui/<uid>` domain target on this estate is spelled with.
 *
 * 501 rather than Linux's 1000, because that is the number: macOS starts local
 * accounts at 501 and a tech reads `gui/501` off a real Mac every day of the
 * week. It is a constant rather than a seeded field for the same reason the
 * baseline unit tables are tables - every Mac in this world is one desk with
 * one person at it, and a second uid would be a fact the estate does not hold.
 */
export const MAC_LOGIN_UID = 501;

/**
 * The two launchd domains this world holds, in the exact spelling `launchctl`
 * takes them.
 *
 * `system` is the root domain: LaunchDaemons, loaded at boot, running whether
 * anybody is logged in or not. `gui/<uid>` is the login session's: LaunchAgents,
 * which arrive when that user logs in and leave with them. (launchd has more -
 * `user/<uid>`, `pid/<pid>`, `login/<asid>` - and this world holds jobs in
 * neither of them, so neither is spelled anywhere.)
 */
export const LAUNCHD_DOMAINS = {
  system: 'system',
  gui: `gui/${String(MAC_LOGIN_UID)}`,
} as const;

export type LaunchdDomain = (typeof LAUNCHD_DOMAINS)[keyof typeof LAUNCHD_DOMAINS];

/** The domain a launchd job is bootstrapped into, or null for a systemd unit. */
export function launchdDomainOf(value: unknown): LaunchdDomain | null {
  return value === LAUNCHD_DOMAINS.system || value === LAUNCHD_DOMAINS.gui
    ? value
    : null;
}

/**
 * The player's PAM tier (E6), in Microsoft's own AD tier vocabulary - the same
 * model 0.8.0's customer scope already uses, now on the PLAYER. Tier 2 is the
 * workstation/helpdesk tier the player is hired to; Tier 1 is the server/
 * sysadmin tier the promotion crosses to. The crossing is ONE-WAY: you never
 * lose service-desk access, you GAIN server access, and once at the engineer
 * tier the player is permanently at least there. The server-tier capabilities
 * (ssh, the unix terminal) gate on `systemsEngineer`.
 */
export const PLAYER_TIERS = {
  serviceDesk: 'service_desk',
  systemsEngineer: 'systems_engineer',
} as const;

export type PlayerTier = (typeof PLAYER_TIERS)[keyof typeof PLAYER_TIERS];

export const PLAYER_TIER_LABELS: Readonly<Record<PlayerTier, string>> = {
  [PLAYER_TIERS.serviceDesk]: 'Service Desk (Tier 2)',
  [PLAYER_TIERS.systemsEngineer]: 'Systems Engineer (Tier 1)',
};

/**
 * The player's tier, read off the field with the back-compat default: absent is
 * `serviceDesk`, which is what every box, every golden and every save that
 * predates the promotion holds. Only the promotion action ever writes the field,
 * and only ever `systemsEngineer`.
 */
export function playerTierOf(value: unknown): PlayerTier {
  return value === PLAYER_TIERS.systemsEngineer ? value : PLAYER_TIERS.serviceDesk;
}

/**
 * Whether a player at this tier holds the server tier - the one predicate the
 * ssh mechanic and the unix terminal gate on. Reads the raw field value so a
 * caller with a node's field in hand does not have to spell the default twice.
 */
export function isSystemsEngineer(value: unknown): boolean {
  return playerTierOf(value) === PLAYER_TIERS.systemsEngineer;
}

/**
 * What systemd says a unit is doing, in the real words it prints - the Linux
 * analogue of `SERVICE_STATUS`, stored verbatim so a future `systemctl status`
 * prints exactly what the world holds and no label table has to keep them true.
 */
export const SYSTEMD_STATES = {
  activeRunning: 'active (running)',
  activeExited: 'active (exited)',
  inactiveDead: 'inactive (dead)',
  failed: 'failed',
  activating: 'activating',
} as const;

export type SystemdState = (typeof SYSTEMD_STATES)[keyof typeof SYSTEMD_STATES];

/**
 * The business a customer is in, which shapes the estate the MSP looks after
 * for them (0.8.0). An OPEN set - the estate research names a dozen verticals
 * and the spine ships three - so this is documentation of what 0.8.0 uses, not
 * a closed enum the engine enforces. Extending it is adding a value here and a
 * label below; the machine field carries the id whatever it is.
 */
export const BUSINESS_TYPES = {
  /** Windows-only: workstations, an AD domain controller, a file server. */
  lawFirm: 'law_firm',
  /** Mac/Windows laptops in the office, a Linux product fleet in the cloud. */
  saas: 'saas',
  /** A small estate the MSP only watches - the monitoring-only contrast. */
  monitoringTarget: 'monitoring_target',
  /**
   * A small Windows-only practice where the MSP is the WHOLE IT department
   * (0.11.0): a handful of workstations and a file server, and nobody in-house
   * to touch either - which is why the fully-managed contract reaches all of it.
   */
  accountancy: 'accountancy',
  /**
   * A mid-size manufacturer with its OWN internal IT (0.11.0): the MSP works
   * alongside it, co-managed - their team owns day-to-day user support, the MSP
   * fills the after-hours and specialist gaps, and touching their estate is a
   * coordinate-then-act rather than a free hand.
   */
  manufacturing: 'manufacturing',
  /**
   * A small trades business the MSP has just SIGNED and taken on undocumented
   * (0.13.0): a workstation or two and one server nobody wrote a runbook for.
   * The vertical the onboarding arc lands on because it is the one where "there
   * was a guy who set the backups up and left" is the whole story - the estate
   * is real, the documentation is thin or wrong, and discovery is how the MSP
   * earns or loses the client in the first ninety days.
   */
  trades: 'trades',
  /**
   * A managed dental practice (0.14.0): Windows-locked-down workstations at the
   * chairs and reception, and a practice-management/imaging server running a
   * Dentrix-class PMS with a DEXIS-class imaging bridge. The hands-on Windows
   * vertical - real, chair-side, time-pressured tickets (an X-ray sensor that
   * will not enumerate with a patient in the chair, an imaging bridge a PMS
   * update broke, a HIPAA access-review request) - and distinct from the
   * monitoring-only clinic the MSP only watches: this one is a MANAGED contract.
   */
  dentalClinic: 'dental_clinic',
  /**
   * A creative/media agency (0.32.0): the INVERSE estate, and the one the third
   * OS family was built for. Designers on Macs managed by an MDM at fleet
   * grain, a NAS the project files actually live on, and a creative suite
   * licensed per PERSON rather than per machine. It teaches the three things a
   * Windows-shaped desk gets wrong about a Mac shop - a consent only the user
   * can give, a policy enforced by the OS vendor rather than by the employer,
   * and a seat that follows a person out of the door - and it is the first
   * estate in the game where the workstations are not Windows at all.
   */
  creativeAgency: 'creative_agency',
} as const;

export type BusinessType = (typeof BUSINESS_TYPES)[keyof typeof BUSINESS_TYPES];

export const BUSINESS_TYPE_LABELS: Readonly<Record<BusinessType, string>> = {
  [BUSINESS_TYPES.lawFirm]: 'Law firm',
  [BUSINESS_TYPES.saas]: 'SaaS company',
  [BUSINESS_TYPES.monitoringTarget]: 'Monitored site',
  [BUSINESS_TYPES.accountancy]: 'Accountancy practice',
  [BUSINESS_TYPES.manufacturing]: 'Manufacturer',
  [BUSINESS_TYPES.trades]: 'Trades firm',
  [BUSINESS_TYPES.dentalClinic]: 'Dental clinic',
  [BUSINESS_TYPES.creativeAgency]: 'Creative agency',
};

/**
 * What a customer's CONTRACT lets the player do to their estate (0.8.0), and
 * therefore what the honesty engine refuses. A CLOSED set, validated at load in
 * the Rust schema the same way a service status is, because it is the axis the
 * scope-of-touch RBAC-403 turns on and a scope this build has never heard of is
 * a contract nobody can enforce.
 *
 * The order is widening authority: watch only, then the desk, then alongside
 * their own IT, then the whole stack.
 */
export const SERVICE_SCOPES = {
  /** Watch the board, acknowledge, escalate. Remediation is not contracted. */
  monitoringOnly: 'monitoring_only',
  /** Workstations and users. Servers and infrastructure are out of contract. */
  helpdesk: 'helpdesk',
  /** Alongside the customer's own IT - notify them, do not act unilaterally. */
  coManaged: 'co_managed',
  /** The whole stack, all creds, own the outcome. Nothing is out of reach. */
  fullyManaged: 'fully_managed',
} as const;

export type ServiceScope = (typeof SERVICE_SCOPES)[keyof typeof SERVICE_SCOPES];

export const SERVICE_SCOPE_LABELS: Readonly<Record<ServiceScope, string>> = {
  [SERVICE_SCOPES.monitoringOnly]: 'Monitoring only',
  [SERVICE_SCOPES.helpdesk]: 'Managed helpdesk',
  [SERVICE_SCOPES.coManaged]: 'Co-managed',
  [SERVICE_SCOPES.fullyManaged]: 'Fully managed',
};

/**
 * A service scope read defensively off a field: an unknown or absent value is
 * NOT silently treated as a permissive scope. Absent reads as `null` (no
 * contract known - the caller decides what that means), and only the four
 * closed values are ever returned, so a hand-edited save cannot widen a
 * contract by writing nonsense into it.
 */
export function serviceScopeOf(value: unknown): ServiceScope | null {
  return value === SERVICE_SCOPES.monitoringOnly
    || value === SERVICE_SCOPES.helpdesk
    || value === SERVICE_SCOPES.coManaged
    || value === SERVICE_SCOPES.fullyManaged
    ? value
    : null;
}

/**
 * Which team the co-managed RACI map hands a box to (E9, 0.37.0). Two values,
 * because a RACI line has two sides here: the provider and the customer's own
 * IT. Nobody is `both` - "we thought you had it" is the failure the map exists
 * to prevent, so a map that could say both would be the bug written down.
 *
 * The order is the one the escalation rules use: what the desk does, then what
 * gets handed over.
 */
export const RACI_OWNERS = {
  /** The MSP's under the map: the desk, the infrastructure, the monitoring. */
  msp: 'msp',
  /** Their own IT's: on-site, the custom systems, the applications they run. */
  internal: 'internal',
} as const;

export type RaciOwner = (typeof RACI_OWNERS)[keyof typeof RACI_OWNERS];

export const RACI_OWNER_LABELS: Readonly<Record<RaciOwner, string>> = {
  [RACI_OWNERS.msp]: 'MSP-owned under the RACI',
  [RACI_OWNERS.internal]: 'Customer IT-owned under the RACI',
};

/**
 * A RACI owner read defensively off a field: absent, or anything that is not
 * one of the two, reads as `null` - the map says nothing about this target -
 * and the caller decides what that means. It is never treated as permissive,
 * for the same reason `serviceScopeOf` is not: a hand-edited save must not be
 * able to hand itself a box by writing nonsense into the field.
 */
export function raciOwnerOf(value: unknown): RaciOwner | null {
  return value === RACI_OWNERS.msp || value === RACI_OWNERS.internal
    ? value
    : null;
}

/** The SLA tier a customer buys (0.8.0), a simple bronze/silver/gold enum. */
export const SLA_TIERS = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
} as const;

export type SlaTier = (typeof SLA_TIERS)[keyof typeof SLA_TIERS];

export const SLA_TIER_LABELS: Readonly<Record<SlaTier, string>> = {
  [SLA_TIERS.bronze]: 'Bronze',
  [SLA_TIERS.silver]: 'Silver',
  [SLA_TIERS.gold]: 'Gold',
};

/**
 * A field value read back as an SLA tier, or null when it is anything else.
 *
 * The defensive reader the tier machinery goes through - on a customer node
 * (`customerSlaTier`) and, since 0.12.0, on a ticket node stamped with the tier
 * it runs on. Null is the in-house case: a ticket with no tier reads null and
 * every tier consumer falls back to the default, which is the whole of why the
 * dimension is additive.
 */
export function slaTierOf(value: unknown): SlaTier | null {
  return value === SLA_TIERS.bronze
    || value === SLA_TIERS.silver
    || value === SLA_TIERS.gold
    ? value
    : null;
}

/**
 * The four states a change request is filed in (0.10.0). Only `submitted` is
 * ever WRITTEN by the filing verb; `approved`/`rejected` are the derived
 * lifecycle the tick fields carry, and `draft` is reserved for a form that is
 * being written but not yet filed. The engine validates the enum at load so a
 * hand-edited save cannot invent a fifth.
 */
export const CHANGE_REQUEST_STATUSES = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export type ChangeRequestStatus =
  (typeof CHANGE_REQUEST_STATUSES)[keyof typeof CHANGE_REQUEST_STATUSES];

/**
 * The decision an authority reaches on a change request (0.10.0): `approve` for
 * the risky/out-of-scope work a CR exists to gate, `reject` for a request that
 * asks a change to do a contract's job. Read defensively - an absent or unknown
 * value is `null` (no decision known), never a permissive default.
 */
export const CHANGE_REQUEST_DECISIONS = {
  approve: 'approve',
  reject: 'reject',
} as const;

export type ChangeRequestDecision =
  (typeof CHANGE_REQUEST_DECISIONS)[keyof typeof CHANGE_REQUEST_DECISIONS];

/**
 * The VARIANT a change_request node is (E8, 0.24.0). The scope change request
 * (0.10.0) carries no `cr_kind` - it is the default, the maintenance-window
 * gate - so only the CYA / manager-override variant is named here:
 * `risk_acceptance`, the artifact the accepting owner signs. Keeping it a field
 * on the SAME node kind is the reuse: one node, two variants, told apart by this
 * marker rather than forked into a second kind the engine would have to learn.
 */
export const CHANGE_REQUEST_KINDS = {
  riskAcceptance: 'risk_acceptance',
  /**
   * The ROLLBACK RECORD (E8, 0.25.0): the change_request node reused a third way,
   * as the captured prior configuration a mandated change is reverted from. It
   * carries `cr_target` (the service it is about) and `cr_rollback` (the prior
   * startup type, copied off the live service before the mandate overwrote it) -
   * the same append-only-record discipline as the risk acceptance, told apart by
   * this marker so the scope machinery skips it exactly as it skips the sign-off.
   */
  rollbackRecord: 'rollback_record',
} as const;

export type ChangeRequestKind =
  (typeof CHANGE_REQUEST_KINDS)[keyof typeof CHANGE_REQUEST_KINDS];

export function changeRequestDecisionOf(
  value: unknown,
): ChangeRequestDecision | null {
  return value === CHANGE_REQUEST_DECISIONS.approve
    || value === CHANGE_REQUEST_DECISIONS.reject
    ? value
    : null;
}

/**
 * Whether a machine role is a SERVER - infrastructure - rather than a
 * workstation. The helpdesk scope turns on exactly this line: the desk covers
 * workstations and users, and everything a server role names is out of that
 * contract. A pure function of the role so the queue, the refusal and any test
 * read the same answer.
 */
/**
 * Where an edge box's rule set came from (0.29.0), and the hinge of the first
 * project: a handover pack is what somebody wrote down and a live configuration
 * is what the box is doing, and the difference between them is two rules and a
 * phone call from a factory. A closed pair, beside every other closed enum this
 * world keeps, so the verb that writes it and the gate that reads it cannot
 * spell it differently.
 */
export const AUDIT_SOURCES = {
  /** Somebody read the live configuration off the box. */
  config: 'config',
  /** Somebody took the handover pack's rule list as read. */
  pack: 'pack',
} as const;

export type AuditSource = (typeof AUDIT_SOURCES)[keyof typeof AUDIT_SOURCES];

export function auditSourceOf(value: unknown): AuditSource | null {
  return value === AUDIT_SOURCES.config || value === AUDIT_SOURCES.pack
    ? value
    : null;
}

export function isServerRole(role: MachineRole): boolean {
  return role !== MACHINE_ROLES.workstation;
}

/**
 * Whether a unit starts at boot, in systemctl's own vocabulary - the Linux
 * analogue of `STARTUP_TYPES`. `static` is a unit that cannot be enabled or
 * disabled because something else pulls it in, which is what journald is.
 */
export const UNIT_ENABLEMENTS = {
  enabled: 'enabled',
  disabled: 'disabled',
  static: 'static',
} as const;

export type UnitEnablement =
  (typeof UNIT_ENABLEMENTS)[keyof typeof UNIT_ENABLEMENTS];

/**
 * A unit's enablement, read off the field with the back-compat default: an
 * absent or unrecognised value reads as `disabled`, which is the safest thing
 * to say about a unit systemctl cannot vouch for - it does not claim a box
 * starts something at boot that nothing recorded it would.
 */
export function unitEnablementOf(value: unknown): UnitEnablement {
  return value === UNIT_ENABLEMENTS.enabled || value === UNIT_ENABLEMENTS.static
    ? value
    : UNIT_ENABLEMENTS.disabled;
}

export const ROTATIONS = [0, 90, 180, 270] as const;

export type Rotation = (typeof ROTATIONS)[number];

export function isRotation(value: unknown): value is Rotation {
  return typeof value === 'number'
    && ROTATIONS.some((rotation) => rotation === value);
}
