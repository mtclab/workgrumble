/**
 * The RMM / monitoring board, as the pure functions that read it (0.9.0, the
 * MSP arc).
 *
 * In 0.8.0 a monitoring-only customer was a terminal REFUSAL - you reached to
 * fix and the scope engine said no. This is the surface the contract is
 * actually defined by: "eyes on glass". For every monitoring-only customer the
 * board lists the WATCHED THINGS - a backup job, a TLS certificate, a disk -
 * each as a row whose STATUS is read live off the estate node 0.8.0 already
 * seeds (`msp-company.ts`). Nothing here holds a second copy of that status:
 * the board and the alert ticket are two reads of one node and one ticket, so
 * they cannot drift - the spool-is-the-queue discipline, applied to a board.
 *
 * The board has no fix - by contract and by design. Its whole verb set is
 * acknowledge (a seen-flag the shell carries) and escalate (the 0.8.0 escalate
 * verb, resolving the alert ticket). Both live where they already lived; this
 * module only READS, and returns the rows a board draws and the sentences an
 * escalation carries.
 *
 * Slice 3 is the alert fatigue: alongside the real rows the board carries
 * NOISE - a transient CPU spike, a flapping check - that is benign and clears
 * itself. The noise is DETERMINISTIC (a function of the day and the check id,
 * the way the network map is a function of a host id in `cmd-net.ts`; the
 * engine bans `Math.random`) and auto-clears on its own clock. The real alerts
 * do NOT auto-clear - they need escalating. The skill, and the joke, is triage.
 *
 * Nothing here consumes the simulation RNG or mutates anything: it reads the
 * graph and returns verdicts, exactly as `customers.ts` does for the scope
 * engine it is the played twin of.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { customerName } from './customers';
import {
  FIELDS,
  SERVICE_SCOPES,
  SERVICE_STATUS,
  serviceScopeOf,
} from './fields';
import {
  DAY_OPENS_MINUTE,
  MINUTES_PER_DAY,
  minuteOfDay,
  SHIFT_END_MINUTE,
  SHIFT_MINUTES,
  SHIFT_START_MINUTE,
} from './hours';
import { MSP_CUSTOMERS, MSP_IDS } from './msp-company';
import { allowsEscalation } from './tickets';

/**
 * The RMM status vocabulary, the real one: a check is healthy, over a warning
 * threshold, or failed. "Firing" - the word an alerting system uses for a rule
 * that is currently triggered - is any of these that is not ok, which is what
 * `firing` on a row means. Held only as a read of a node, never as a string a
 * board owns.
 */
export type CheckStatus = 'ok' | 'warning' | 'failed';

/** A watched thing (a real alert) versus the benign noise slice 3 mixes in. */
export type BoardRowKind = 'alert' | 'noise';

export interface BoardRow {
  /** Stable per customer + check, so a row keeps its element across repaints. */
  readonly id: string;
  /**
   * What ACKNOWLEDGE remembers. A real alert is one standing thing, so its ack
   * id is stable; a noise instance is a per-day flare, so its ack id carries the
   * day - acknowledging today's flap does not silence a fresh one tomorrow.
   */
  readonly ackId: string;
  readonly label: string;
  /** The box the check is on, by hostname, the way a NOC board names a node. */
  readonly target: string;
  /** What is being watched, in a phrase: "backup job", "TLS certificate". */
  readonly check: string;
  readonly status: CheckStatus;
  /** True when the status is anything but ok - the alert is firing. */
  readonly firing: boolean;
  readonly kind: BoardRowKind;
  /** One line of what this is, for the board to print under the row. */
  readonly note: string;
  /** The 0.8.0 alert ticket escalate resolves, or null for noise. */
  readonly ticket: string | null;
  /** Escalate is offered: a firing real alert, open and not already raised. */
  readonly escalatable: boolean;
  /** Read off the ticket's own `escalated` field, the other side of the coin. */
  readonly escalated: boolean;
  /** Whether the player has marked this alert seen (shell state). */
  readonly acknowledged: boolean;
}

export interface BoardCustomer {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly BoardRow[];
}

/** How a watched thing reads its status off the estate node behind it. */
type CheckKind = 'service' | 'cert' | 'disk';

interface WatchedSeed {
  /** Short id, unique within a customer, stable across days. */
  readonly id: string;
  readonly label: string;
  readonly check: string;
  /** The estate node the status is read from - the SAME node a fault wedges. */
  readonly node: string;
  /** The machine whose hostname names the row. */
  readonly machine: string;
  readonly readAs: CheckKind;
  /** Below this many free bytes a disk check is a warning. */
  readonly diskThreshold?: number;
  /** The 0.8.0 alert ticket the escalate raises and closes. */
  readonly ticket: string;
  readonly note: string;
}

interface NoiseSeed {
  readonly id: string;
  readonly label: string;
  readonly check: string;
  readonly machine: string;
  readonly status: CheckStatus;
  readonly note: string;
}

/**
 * The watched things per monitoring-only customer, by customer id.
 *
 * Authored world data - which node to read and which alert ticket to raise -
 * exactly as the tickets themselves are authored (`tickets/msp.ts`). It is not a
 * copy of the STATUS (that is read live off the node below); it is the
 * description of what the contract has the MSP watching. Northwind Clinic is the
 * one monitoring-only account 0.8.0 shipped; a second would be a second key.
 */
const WATCHED: Readonly<Record<string, readonly WatchedSeed[]>> = {
  [MSP_CUSTOMERS.northwind]: [
    {
      id: 'backup',
      label: 'Backup job',
      check: 'nightly backup',
      node: MSP_IDS.northwindBackup,
      machine: MSP_IDS.northwindServer,
      readAs: 'service',
      ticket: 'ticket:northwind-backup-alert',
      note: 'The overnight backup service. Failed is failed - a job that does '
        + 'not run is a restore nobody has.',
    },
    {
      id: 'cert',
      label: 'TLS certificate',
      check: 'clinic portal certificate',
      node: MSP_IDS.northwindPortal,
      machine: MSP_IDS.northwindServer,
      readAs: 'cert',
      ticket: 'ticket:northwind-cert-alert',
      note: 'The public portal\'s certificate, watched for expiry. Renewing it '
        + 'is theirs; raising it in time is ours.',
    },
    {
      id: 'disk',
      label: 'Disk space',
      check: 'free space',
      node: MSP_IDS.northwindServer,
      machine: MSP_IDS.northwindServer,
      readAs: 'disk',
      diskThreshold: 2 * 1024 * 1024 * 1024,
      ticket: 'ticket:northwind-disk-alert',
      note: 'Free space on the box, watched against a low-water mark. Emptying '
        + 'it is out of contract; the early warning is the whole product.',
    },
  ],
};

/**
 * The benign, self-clearing noise per monitoring-only customer.
 *
 * A couple, not a wall (the design bar: do not over-noise). These carry no
 * ticket and never resolve into one - a player who escalates a flapping ping is
 * the boy who cried wolf. They fire on a deterministic window and clear on their
 * own, which is what makes triage a skill rather than a reflex.
 */
const NOISE: Readonly<Record<string, readonly NoiseSeed[]>> = {
  [MSP_CUSTOMERS.northwind]: [
    {
      id: 'cpu',
      label: 'CPU spike',
      check: 'processor load',
      machine: MSP_IDS.northwindServer,
      status: 'warning',
      note: 'Processor over threshold for a few minutes. It is a report run, '
        + 'and it clears itself - which is exactly why it is not worth a call.',
    },
    {
      id: 'ping',
      label: 'Reachability flapping',
      check: 'ICMP check',
      machine: MSP_IDS.northwindServer,
      status: 'warning',
      note: 'The ping check going down and up. A flap is the monitoring '
        + 'twitching, not the box falling over; it settles on its own.',
    },
  ],
};

/* -- deterministic noise, a function of the day and the check id ---------- */

/**
 * How long a noise flare can last, in sim-minutes, and the least it lasts.
 *
 * Bounded well inside a shift so a flare authored for a day both starts and
 * clears within it - the auto-clear the player has to SEE for the joke to land.
 */
const NOISE_MIN_MINUTES = 12;
const NOISE_MAX_MINUTES = 30;

/**
 * A stable hash of a string to a 32-bit number - FNV-1a, the same construction
 * `cmd-net.ts` uses to make the network map a deterministic function of a host
 * id. Kept local rather than imported so the world layer does not reach up into
 * the shell for it; it is six lines and it is the standard one.
 */
function noiseHash(value: string): number {
  let hash = 0x811c_9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return hash;
}

/** Which shift day a tick belongs to (day one is tick zero, at 08:00). */
function dayOf(tick: number): number {
  return Math.floor((DAY_OPENS_MINUTE + tick) / MINUTES_PER_DAY) + 1;
}

/**
 * Whether a noise seed is firing at this tick, and the id acknowledging it
 * remembers - both a pure function of the day and the seed, no clock read and
 * no RNG. The window is scattered across the shift by the hash and lasts a
 * bounded few minutes; outside it the flare has cleared. A real alert has no
 * such window, which is the whole difference between the two halves of a board.
 */
export function noiseFiring(
  seedId: string,
  tick: number,
): { readonly firing: boolean; readonly ackId: string } {
  const day = dayOf(tick);
  const ackId = `noise:${seedId}:day-${String(day)}`;
  const hash = noiseHash(ackId);

  // Room to start and fully clear inside the shift.
  const span = Math.max(1, SHIFT_MINUTES - NOISE_MAX_MINUTES);
  const start = SHIFT_START_MINUTE + (hash % span);
  const duration = NOISE_MIN_MINUTES
    + ((hash >>> 8) % (NOISE_MAX_MINUTES - NOISE_MIN_MINUTES + 1));
  const end = Math.min(SHIFT_END_MINUTE, start + duration);

  const now = minuteOfDay(tick);
  return { firing: now >= start && now < end, ackId };
}

/* -- reading a watched thing's status off the estate ---------------------- */

function stringField(
  graph: ReadOnlyGraphView,
  node: string,
  field: string,
): string {
  const value = graph.getField(node, field);
  return typeof value === 'string' ? value : '';
}

/** The live status of one watched thing, read from the node behind it. */
function watchedStatus(
  graph: ReadOnlyGraphView,
  seed: Readonly<WatchedSeed>,
): CheckStatus {
  switch (seed.readAs) {
    case 'service': {
      const status = graph.getField(seed.node, FIELDS.status);
      // A running service is ok; anything else - wedged, stopped - is failed.
      return status === SERVICE_STATUS.running ? 'ok' : 'failed';
    }
    case 'cert': {
      // A certificate inside the expiry threshold is a warning, not an outage:
      // the portal still serves, but the clock is running.
      return graph.getField(seed.node, FIELDS.certExpired) === true
        ? 'warning'
        : 'ok';
    }
    case 'disk': {
      const free = graph.getField(seed.node, FIELDS.diskFree);
      const threshold = seed.diskThreshold ?? 0;
      return typeof free === 'number' && free < threshold ? 'warning' : 'ok';
    }
  }
}

/** The hostname a row names its box by, from the machine node. */
function hostnameOf(graph: ReadOnlyGraphView, machine: string): string {
  const hostname = stringField(graph, machine, FIELDS.hostname);
  return hostname.length > 0 ? hostname : machine;
}

/** Whether a ticket has been escalated, from its own latched field. */
function ticketEscalated(graph: ReadOnlyGraphView, ticket: string): boolean {
  return graph.getField(ticket, FIELDS.escalated) === true;
}

/** Whether a ticket is still open (the state a board can still act on). */
function ticketOpen(graph: ReadOnlyGraphView, ticket: string): boolean {
  const node = graph.getNode(ticket);
  return node !== undefined && node.fields[FIELDS.state] === 'open';
}

/* -- the board ------------------------------------------------------------ */

/** The monitoring-only customers in this world, in a stable order. */
export function monitoringCustomers(
  graph: ReadOnlyGraphView,
): readonly Readonly<{ id: string; name: string }>[] {
  return graph
    .nodesOfKind('customer')
    .filter(
      (node) => serviceScopeOf(node.fields[FIELDS.customerServiceScope])
        === SERVICE_SCOPES.monitoringOnly,
    )
    .map((node) => ({ id: node.id, name: customerName(graph, node.id) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function watchedRow(
  graph: ReadOnlyGraphView,
  customerId: string,
  seed: Readonly<WatchedSeed>,
  acknowledged: ReadonlySet<string>,
): BoardRow {
  const status = watchedStatus(graph, seed);
  const firing = status !== 'ok';
  const escalated = ticketEscalated(graph, seed.ticket);
  const id = `${customerId}:${seed.id}`;

  return {
    id,
    ackId: id,
    label: seed.label,
    target: hostnameOf(graph, seed.machine),
    check: seed.check,
    status,
    firing,
    kind: 'alert',
    note: seed.note,
    ticket: seed.ticket,
    // Escalate is the contracted move, offered only on a firing alert that is
    // still open and whose own resolution rule accepts an escalation - and not
    // once it has already been raised.
    escalatable: firing
      && ticketOpen(graph, seed.ticket)
      && allowsEscalation(seed.ticket)
      && !escalated,
    escalated,
    acknowledged: acknowledged.has(id),
  };
}

function noiseRow(
  graph: ReadOnlyGraphView,
  customerId: string,
  seed: Readonly<NoiseSeed>,
  ackId: string,
  acknowledged: ReadonlySet<string>,
): BoardRow {
  return {
    id: `${customerId}:${seed.id}`,
    ackId,
    label: seed.label,
    target: hostnameOf(graph, seed.machine),
    check: seed.check,
    status: seed.status,
    firing: true,
    kind: 'noise',
    note: seed.note,
    // Noise raises no ticket and offers no escalate: the move is to acknowledge
    // it and let it clear, never to send a van after a flap.
    ticket: null,
    escalatable: false,
    escalated: false,
    acknowledged: acknowledged.has(ackId),
  };
}

/**
 * The whole board: every monitoring-only customer, each with its watched things
 * (always shown, ok included - eyes on glass) and whatever noise is firing at
 * this tick. Status and escalation are read off the graph here and nowhere
 * cached, so the board a player reads and the ticket they escalate can never
 * disagree.
 */
export function monitorBoard(
  graph: ReadOnlyGraphView,
  acknowledged: ReadonlySet<string>,
  now: number,
): readonly BoardCustomer[] {
  return monitoringCustomers(graph).map((customer) => {
    const watched = (WATCHED[customer.id] ?? []).map(
      (seed) => watchedRow(graph, customer.id, seed, acknowledged),
    );

    const noise: BoardRow[] = [];

    for (const seed of NOISE[customer.id] ?? []) {
      const { firing, ackId } = noiseFiring(seed.id, now);

      if (firing) {
        noise.push(noiseRow(graph, customer.id, seed, ackId, acknowledged));
      }
    }

    // Watched things first, in their authored order, then the noise beneath -
    // the real work above the din, which is the reading the board is for.
    return {
      id: customer.id,
      name: customer.name,
      rows: [...watched, ...noise],
    };
  });
}

/**
 * The two sentences an escalation off the board carries into the 0.8.0 handoff.
 *
 * The board raises a real alert with what it can honestly say: what the check
 * reported and that the contract was checked. Both halves are non-empty, so the
 * handoff is complete rather than thin - which is what lets it set `escalated`
 * and close the alert ticket, the same as the terminal path does with the same
 * verb.
 */
export function boardEscalation(
  row: Readonly<BoardRow>,
): { readonly reported: string; readonly tried: string } {
  return {
    reported: `${row.label} on ${row.target}: ${row.check} is ${row.status} `
      + '(monitoring alert).',
    tried: 'Confirmed the alert on the board\n'
      + 'Checked the contract: monitoring-only, remediation out of scope',
  };
}
