import type { ActionData } from '../../engine-api';
import { FIELDS, SYSTEMD_STATES } from '../fields';
import { HELPDESK_TIER, targetGuards, TARGET } from './helpers';
import { SYSTEMD_ACTIONS } from './ids';

/**
 * The systemd verbs (E6, Pass B): restart, start and stop a unit on a Linux box.
 *
 * The Linux analogue of `SERVICE_ACTIONS`' `serviceRestart`, and deliberately
 * NOT the same action with a different spelling - a unit is a different node
 * kind (`unit`, with systemd's own `unit_state` words) that a different manager
 * knows about, so it is its own verb reading and writing its own field. Each is
 * a pure `set_field` on the target unit's state: a real `systemctl restart` on a
 * healthy box does exactly this and nothing the estate would need to invent.
 *
 * There is no "already running" refusal the way the Windows restart has one:
 * `systemctl restart` is legal on a running unit (it is the everyday way to pick
 * up new config), and `start`/`stop` on a unit already in the target state are
 * silent no-ops on a real box, not errors - so the guard is only that the target
 * IS a unit. The shell prints NOTHING on success, because systemd does; a
 * fabricated confirmation line is the Windows family's shape and forbidden here.
 */
export const SYSTEMD_ACTION_DATA: readonly ActionData[] = [
  {
    id: SYSTEMD_ACTIONS.unitRestart,
    tier: HELPDESK_TIER,
    validate: [...targetGuards('unit')],
    // Restart brings the unit up whatever it was doing - a failed unit's
    // start-limit is cleared, an inactive one is started, a running one is
    // bounced - which is a single set to active(running).
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.unitState,
        value: { const: SYSTEMD_STATES.activeRunning },
      },
    ],
  },
  {
    id: SYSTEMD_ACTIONS.unitStart,
    tier: HELPDESK_TIER,
    validate: [...targetGuards('unit')],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.unitState,
        value: { const: SYSTEMD_STATES.activeRunning },
      },
    ],
  },
  {
    id: SYSTEMD_ACTIONS.unitStop,
    tier: HELPDESK_TIER,
    validate: [...targetGuards('unit')],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.unitState,
        value: { const: SYSTEMD_STATES.inactiveDead },
      },
    ],
  },
];
