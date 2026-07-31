import type { ActionData } from '../../engine-api';
import { DEVICE_TYPES, FIELDS, SERVICE_STATUS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

const BACKLOG = 'backlog';

export const SERVICE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.serviceRestart,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      // Hardware first: a fan is not "already running", it is not a service
      // at all, and telling the player the wrong true thing helps nobody.
      {
        when: not(fieldIs(TARGET, FIELDS.restartable, true)),
        reason: '"{target.label}" is a piece of hardware that reports a '
          + 'status, not software you can stop and start. You cannot turn a '
          + 'fan off and on again. Well. You can. It will not help.',
      },
      {
        when: not({
          pred: 'any',
          of: [
            fieldIs(TARGET, FIELDS.status, SERVICE_STATUS.wedged),
            fieldIs(TARGET, FIELDS.status, SERVICE_STATUS.stopped),
          ],
        }),
        reason: '"{target.label}" is already running. '
          + 'Restarting a healthy service is how a small ticket becomes a '
          + 'big one.',
      },
      // Queued work survives a restart on purpose, so a service brought back
      // in front of a full queue is handed the job that jammed it within
      // seconds. The real order is stop, clear, start - and `printer.clear_queue`
      // does the stopping, so from here the instruction is simply "clear it
      // first, then start this".
      //
      // "The backlog" is specifically a PRINTER on the other end of the wire.
      // Binding whatever connected node happens to carry a `queue_len` first
      // means refusing a restart because of a number on an unrelated box, in
      // a sentence naming a device the player never touched.
      {
        when: {
          pred: 'neighbor_where',
          node: TARGET,
          direction: 'out',
          edge_kind: 'connected_to',
          bind: BACKLOG,
          matching: {
            pred: 'all',
            of: [
              { pred: 'kind_is', node: { bind: BACKLOG }, kind: 'device' },
              fieldIs({ bind: BACKLOG }, FIELDS.type, DEVICE_TYPES.printer),
              {
                pred: 'field_is_number',
                node: { bind: BACKLOG },
                field: FIELDS.queueLen,
              },
              not({
                pred: 'field_at_most',
                node: { bind: BACKLOG },
                field: FIELDS.queueLen,
                value: 0,
              }),
            ],
          },
        },
        reason: `{b:${BACKLOG}.f:${FIELDS.queueLen}} job(s) are still queued `
          + `on "{b:${BACKLOG}.label}". It will just choke on the same job `
          + 'again. Clearing that queue stops this service and drops the '
          + 'files; starting it again is this button, afterwards.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.status,
        value: { const: SERVICE_STATUS.running },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.serviceRenewCertificate,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      {
        when: not(fieldIs(TARGET, FIELDS.certExpired, true)),
        reason: 'The certificate on "{target.label}" is in date. Issuing a new '
          + 'one because forty people are complaining is how a service ends up '
          + 'with two, and one of them wrong.',
      },
    ],
    // A new certificate, and the service picks it up: that is what makes this
    // its own verb rather than a restart. Restarting it puts the same expired
    // certificate back in front of the same forty people, which is why the
    // flood keeps arriving while somebody keeps restarting things.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.certExpired,
        value: { const: false },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.status,
        value: { const: SERVICE_STATUS.running },
      },
    ],
  },
];
