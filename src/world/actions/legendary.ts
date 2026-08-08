/**
 * The legendary manager / implement-then-revert verbs (E8, 0.25.0), and the reuse
 * they turn on.
 *
 * The mechanic is a seagull manager's sweeping mandate you IMPLEMENT and later
 * REVERT, scored on whether you kept the rollback the first time. Three verbs
 * carry it, and none invents a new artifact:
 *
 *  - `serviceSetStartup` is the real state change. It sets a Windows service's
 *    startup type (Automatic / Manual / Disabled), the ordinary config verb the
 *    mandate uses to flatten the estate to Automatic and the painful revert uses
 *    to reconstruct each service's correct discipline by hand.
 *
 *  - `captureRollback` is the DILIGENT step. It reads a service's CURRENT startup
 *    type off the graph and writes it into the rollback record - a change_request
 *    node, the 0.10.0 artifact reused as the `rollback_record` variant, storing
 *    the prior config in `cr_rollback`. It is a genuine dynamic capture (the value
 *    is copied off the live service, not authored), so the record holds the real
 *    prior state only if this ran, and only before the mandate overwrote it.
 *
 *  - `restoreFromRecord` is the CLEAN revert. It reads the prior startup type back
 *    off the record and sets it on the service in one step. Its guard is the whole
 *    of the mechanic: it REFUSES a record that holds no captured value, so the
 *    clean path exists only where the rollback was kept. Reverting that guard
 *    would let the clean restore run against an empty record - which is the teeth.
 */

import type { ActionData } from '../../engine-api';
import { CHANGE_REQUEST_KINDS, FIELDS } from '../fields';
import { fieldIs, HELPDESK_TIER, not, param, paramNodeGuards, TARGET, targetGuards } from './helpers';
import { HELPDESK_ACTIONS } from './ids';

/** The startup type to set, as a string param - one of `STARTUP_TYPES`. */
export const STARTUP_PARAM = 'startup';

/** The rollback record a capture writes to and a restore reads from. */
export const RECORD_PARAM = 'record';

export const LEGENDARY_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.serviceSetStartup,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      {
        when: { pred: 'param_string_missing', param: STARTUP_PARAM },
        reason: 'This action needs a startup type - Automatic, Manual or '
          + 'Disabled - in its "startup" field, and it arrived empty.',
      },
      {
        when: {
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.startupType,
          value: { param: STARTUP_PARAM },
        },
        reason: '"{target.label}" is already set to that startup type. Setting it '
          + 'to what it already is would be theatre.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.startupType,
        value: { param: STARTUP_PARAM },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.captureRollback,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      ...paramNodeGuards(RECORD_PARAM, 'change_request'),
      {
        when: not(fieldIs(
          param(RECORD_PARAM),
          FIELDS.crKind,
          CHANGE_REQUEST_KINDS.rollbackRecord,
        )),
        reason: `"{p:${RECORD_PARAM}.label}" is not a rollback record. The prior `
          + 'config is captured onto the rollback record the mandate arrives with, '
          + 'not onto any change request that happens to be to hand.',
      },
      {
        // Present already means the prior config was captured; capturing again
        // would overwrite it with whatever the service is set to NOW, which after
        // the mandate is the very bad state the record exists to undo.
        when: not({ pred: 'field_missing', node: param(RECORD_PARAM), field: FIELDS.crRollback }),
        reason: `"{p:${RECORD_PARAM}.label}" already holds a captured prior `
          + 'config. Capturing it a second time would record the current state, '
          + 'not the state you are keeping a way back to.',
      },
    ],
    apply: [
      // The dynamic capture: the service's CURRENT startup type, copied onto the
      // record. Run before the mandate, it stores the real prior config; the value
      // is read off the live service, so a record is genuinely full iff this ran.
      {
        op: 'set_field',
        node: param(RECORD_PARAM),
        field: FIELDS.crRollback,
        value: { field: { node: TARGET, field: FIELDS.startupType } },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.restoreFromRecord,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      ...paramNodeGuards(RECORD_PARAM, 'change_request'),
      {
        when: not(fieldIs(
          param(RECORD_PARAM),
          FIELDS.crKind,
          CHANGE_REQUEST_KINDS.rollbackRecord,
        )),
        reason: `"{p:${RECORD_PARAM}.label}" is not a rollback record, so there `
          + 'is no captured prior config to restore from it.',
      },
      {
        // The load-bearing guard, and the whole of the mechanic: a rollback record
        // nobody captured onto holds no prior config, so there is nothing to
        // restore. Reverting this guard would let the clean restore run against an
        // empty record and wrongly stand in for keeping the rollback.
        when: { pred: 'field_missing', node: param(RECORD_PARAM), field: FIELDS.crRollback },
        reason: `"{p:${RECORD_PARAM}.label}" is empty - the rollback was never `
          + 'captured, so there is no prior config to restore. Reconstruct the '
          + 'correct startup type by hand instead.',
      },
    ],
    apply: [
      // The clean, one-step revert: the prior startup type read back off the
      // record and set on the service.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.startupType,
        value: { field: { node: param(RECORD_PARAM), field: FIELDS.crRollback } },
      },
    ],
  },
];
