import type { ActionDef } from '../../engine/actions';
import { DEMO_ACTIONS, DEMO_TIER, WORLD_IDS } from '../../world/demo-world';

/** The demo verbs as closures, for the parity harness only. */
export const DEMO_ACTION_DEFS: readonly ActionDef[] = [
  {
    id: DEMO_ACTIONS.diagnostics,
    tier: DEMO_TIER,
    validate: (context) => {
      if (context.graph.getNode(WORLD_IDS.machine) === undefined) {
        return 'There is no workstation here to diagnose.';
      }

      return null;
    },
    apply: (context) => {
      // The stamp comes from the simulation clock, not from a caller-supplied
      // parameter: a report is dated when it ran, not when the UI says so.
      context.graph.setField(
        WORLD_IDS.machine,
        'last_diagnostic',
        context.clock.now(),
      );
    },
  },
  {
    id: DEMO_ACTIONS.reseatFan,
    tier: DEMO_TIER,
    validate: (context) => {
      const status = context.graph.getField(WORLD_IDS.fan, 'status');

      if (status === undefined) {
        return 'No chassis fan is registered on this workstation.';
      }

      if (status === 'running') {
        return 'The fan already spins freely. Hitting it again is just violence.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(WORLD_IDS.fan, 'status', 'running');
    },
  },
];
