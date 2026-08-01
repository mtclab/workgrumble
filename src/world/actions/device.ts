import type { ActionData, GuardData, PredData } from '../../engine-api';
import { DEVICE_TYPES, FIELDS, SERVICE_STATUS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  param,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

/** What a fresh set of batteries reads. The UI gates on the same number. */
export const FULL_BATTERY = 100;

/**
 * The spooler feeding the printer whose queue is being emptied.
 *
 * It is a parameter rather than something the action goes looking for because
 * the op language writes to nodes it has been NAMED, and because the surface
 * that offers the button is the surface that can see which service is on the
 * other end of the wire. The guards below make sure the one it names is
 * actually that service.
 */
const SPOOLER_PARAM = 'spooler';

/** The service found on the other end of the wire, for the refusal to name. */
const FEEDER = 'feeder';

/** True while nobody has named a spooler. */
const NO_SPOOLER_NAMED = {
  pred: 'param_string_missing',
  param: SPOOLER_PARAM,
} as const;

/** A service `connected_to` the printer this action is aimed at. */
const SPOOLER_FEEDS_TARGET = {
  pred: 'has_edge',
  from: param(SPOOLER_PARAM),
  to: TARGET,
  kind: 'connected_to',
} as const;

/**
 * Guards that only have an opinion once a spooler HAS been named.
 *
 * The parameter is optional on purpose: the warehouse printer hangs off no
 * spooler this estate models, and a printer with nothing feeding it is a queue
 * that can be dropped on its own. What is not optional is naming the spooler
 * when there is one - the guard above refuses that - and naming the right one.
 */
function namedSpoolerGuards(): readonly GuardData[] {
  const named = (of: PredData): PredData => ({
    pred: 'all',
    of: [not(NO_SPOOLER_NAMED), of],
  });

  return [
    {
      when: named({ pred: 'node_missing', node: param(SPOOLER_PARAM) }),
      reason: `There is no record of "{v:${SPOOLER_PARAM}}" anywhere in the `
        + 'estate, so there is nothing to stop before the queue goes.',
    },
    {
      when: named(not({
        pred: 'kind_is',
        node: param(SPOOLER_PARAM),
        kind: 'service',
      })),
      reason: `"{p:${SPOOLER_PARAM}.label}" is {p:${SPOOLER_PARAM}.kind_label}, `
        + 'not a service. A print queue is emptied by stopping the spooler '
        + 'that owns the files, and that is a service.',
    },
    {
      when: named(not(SPOOLER_FEEDS_TARGET)),
      reason: `"{p:${SPOOLER_PARAM}.label}" does not feed "{target.label}". `
        + 'Stopping somebody else\'s spooler takes their printing down and '
        + 'leaves this queue exactly where it was.',
    },
  ];
}

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
    id: HELPDESK_ACTIONS.deviceForgetCredentials,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: not(fieldIs(TARGET, FIELDS.storedCredential, true)),
        reason: '"{target.label}" is not holding anybody\'s password. '
          + 'Whatever is trying the old one, it is something else - and there '
          + 'is a list of what else is plugged in on the machine it hangs off.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.storedCredential,
        value: { const: false },
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
      // The order the trade actually works in, and the order Microsoft
      // documents: STOP the spooler, delete the spool files, start it again.
      // The queued jobs are files on disk owned by a running service, and
      // deleting them out from under it is exactly when deletion fails. This
      // action does the first two halves in one breath, so it has to be told
      // which service it is stopping.
      {
        when: {
          pred: 'all',
          of: [
            NO_SPOOLER_NAMED,
            {
              pred: 'neighbor_where',
              node: TARGET,
              direction: 'in',
              edge_kind: 'connected_to',
              bind: FEEDER,
              matching: {
                pred: 'kind_is',
                node: { bind: FEEDER },
                kind: 'service',
              },
            },
          ],
        },
        reason: `The jobs queued on "{target.label}" are files on disk that `
          + `"{b:${FEEDER}.label}" has open. Emptying the queue means stopping `
          + 'that service first and starting it again afterwards, and this '
          + `action will do the stopping - name it in "${SPOOLER_PARAM}".`,
      },
      ...namedSpoolerGuards(),
    ],
    // Stop, then clear. The service is deliberately LEFT stopped: starting it
    // again is the third step of the procedure and it is the player's, which
    // is what the ticket about the haunted printer is teaching.
    apply: [
      {
        op: 'when',
        cond: not(NO_SPOOLER_NAMED),
        ops: [
          {
            op: 'set_field',
            node: param(SPOOLER_PARAM),
            field: FIELDS.status,
            value: { const: SERVICE_STATUS.stopped },
          },
        ],
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.queueLen,
        value: { const: 0 },
      },
      // And the files themselves, in the same breath: the spool directory IS
      // this list, so a count that went to zero while the directory still held
      // forty-seven files would be a world arguing with itself in two windows.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.spoolJobs,
        value: { const: '' },
      },
    ],
  },
];
