import type { ActionData } from '../../engine-api';
import { FIELDS, ROTATIONS } from '../fields';
import {
  HELPDESK_TIER,
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const ROTATION_PARAM = 'rotation';
const RESOLUTION_PARAM = 'resolution';

export const MACHINE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.machineSetDisplayRotation,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      {
        when: not({
          pred: 'param_int_in',
          param: ROTATION_PARAM,
          values: [...ROTATIONS],
        }),
        reason: 'A screen can be turned to '
          + `${ROTATIONS.map(String).join(', ')} degrees and nothing in `
          + 'between. The monitor stand is not that ambitious.',
      },
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.displayRotation,
          value: { param: ROTATION_PARAM },
        },
        reason: `"{target.label}" is already at {v:${ROTATION_PARAM}} `
          + 'degrees. Setting it again would be theatre.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.displayRotation,
        value: { param: ROTATION_PARAM },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.machineSetResolution,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      {
        when: not({
          pred: 'param_format',
          param: RESOLUTION_PARAM,
          format: 'resolution',
        }),
        reason: 'Resolutions look like 1024x768. Anything else and the driver '
          + 'will pick something worse out of spite.',
      },
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.resolution,
          value: { param: RESOLUTION_PARAM },
        },
        reason: `"{target.label}" already runs at {v:${RESOLUTION_PARAM}}.`,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.resolution,
        value: { param: RESOLUTION_PARAM },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.machineReboot,
    tier: HELPDESK_TIER,
    validate: [...targetGuards('machine')],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.pendingUpdates,
        value: { const: false },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.uptimeSince,
        value: { now: true },
      },
    ],
  },
];
