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
   * The pressure meters. Lane B owns the arithmetic and the effects; the names
   * are declared here so the day-end scorecard can be wired to the real fields
   * now and start telling the truth the day they are populated, rather than
   * printing a confident zero in the meantime.
   */
  stress: 'stress',
  suspicion: 'suspicion',
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
   * Whether the reporter has actually been asked about their problem. The CYA
   * rule (DESIGN_POC section 7): the SLA only pauses if the question was put
   * to them, so parking a ticket needs this to be true.
   */
  questionAsked: 'question_asked',
  /** Clue lines revealed in chat, appended by the dialogue layer (lane B). */
  clues: 'clues',
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
