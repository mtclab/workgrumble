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
  /** account */
  username: 'username',
  locked: 'locked',
  enabled: 'enabled',
  passwordResetAt: 'password_reset_at',
  /** machine */
  hostname: 'hostname',
  displayRotation: 'display_rotation',
  resolution: 'resolution',
  pendingUpdates: 'pending_updates',
  uptimeSince: 'uptime_since',
  /** device */
  type: 'type',
  powered: 'powered',
  wedged: 'wedged',
  batteryPct: 'battery_pct',
  queueLen: 'queue_len',
  /** service */
  status: 'status',
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
} as const;

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
