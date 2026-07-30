import type { ActionData } from '../../engine-api';
import { DEVICE_TYPES, FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

/** What a fresh set of batteries reads. The UI gates on the same number. */
export const FULL_BATTERY = 100;

export const DEVICE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.devicePowerCycle,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: {
          pred: 'all',
          of: [
            fieldIs(TARGET, FIELDS.powered, true),
            not(fieldIs(TARGET, FIELDS.wedged, true)),
          ],
        },
        reason: '"{target.label}" is on and behaving itself. '
          + 'Switching it off and on again now is superstition, not support.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.powered,
        value: { const: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.wedged,
        value: { const: false },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.deviceReplaceBattery,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.batteryPct,
        }),
        reason: '"{target.label}" does not take batteries. '
          + 'It takes mains power and mild abuse.',
      },
      {
        when: {
          pred: 'field_at_least',
          node: TARGET,
          field: FIELDS.batteryPct,
          value: FULL_BATTERY,
        },
        reason: 'The batteries in "{target.label}" are fresh. '
          + 'The cupboard budget is not.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.batteryPct,
        value: { const: FULL_BATTERY },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.powered,
        value: { const: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.printerClearQueue,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: not(fieldIs(TARGET, FIELDS.type, DEVICE_TYPES.printer)),
        reason: '"{target.label}" is not a printer. '
          + 'It has no queue, only opinions.',
      },
      {
        when: {
          pred: 'any',
          of: [
            not({
              pred: 'field_is_number',
              node: TARGET,
              field: FIELDS.queueLen,
            }),
            {
              pred: 'field_at_most',
              node: TARGET,
              field: FIELDS.queueLen,
              value: 0,
            },
          ],
        },
        reason: 'The queue on "{target.label}" is already empty. '
          + 'Whatever is not printing, it is not the backlog.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.queueLen,
        value: { const: 0 },
      },
    ],
  },
];
