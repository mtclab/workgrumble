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
