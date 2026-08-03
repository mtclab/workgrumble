import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER } from './helpers';
import { SOFTWARE_ACTIONS } from './ids';

/**
 * Installing and uninstalling, as the audit trail sees them.
 *
 * Both verbs are aimed at whoever dispatched them - the trail is a property of
 * the person doing the installing, and it lives on the player node beside the
 * meters and the interruption ledgers. Neither writes the RESOLVED MANIFEST
 * (which app is on the desktop): that is shell state, the same as which windows
 * are open, and the caller patches it alongside dispatching this. What the world
 * holds is the record, because the record has to survive a save, replay, and the
 * app's own removal.
 *
 * The lines are `id@tick` and NOTHING the world stitches together: the driver
 * builds the line in the minute the button was pressed and this appends it,
 * exactly the contract `interruption.defer` keeps for its spent-at ledger, so a
 * replay writes the identical string rather than rebuilding it against a clock
 * nobody saved. Whether the id names a real installable is the SHELL's question
 * (the store offers a fixed catalogue and the app-state parse refuses an
 * unknown one); the world trusts the line the same as it trusts a touch log.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/** The app, named once, so a record can be read back as being about something. */
const ID_PARAM = 'id';
/** The whole `id@tick` line the trail takes, built by the driver. */
const LINE_PARAM = 'line';

const NAMED: GuardData[] = [
  {
    when: { pred: 'param_blank', param: ID_PARAM },
    reason: 'Something was installed and nobody wrote down what. An audit line '
      + 'with no program on it is a record that cannot be read back, which is '
      + 'the same as no record at all.',
  },
  {
    when: { pred: 'param_blank', param: LINE_PARAM },
    reason: 'An install has to say which minute it happened on. A record with '
      + 'no stamp is one the audit cannot place, and the whole point of it is '
      + 'that it can.',
  },
];

/** The exact line already on the trail - the same minute cannot log twice. */
function alreadyLogged(field: string): PredData {
  return {
    pred: 'line_in_field',
    node: ACTOR,
    field,
    value: { param: LINE_PARAM },
  };
}

/** Appending the `id@tick` line to a trail, which IS the record. */
function record(field: string): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field,
    value: {
      append_line: {
        node: ACTOR,
        field,
        value: { param: LINE_PARAM },
      },
    },
  };
}

export const INSTALL_TWICE_REASON = 'That install is already on the audit for '
  + 'this minute. A program cannot be installed twice in the same minute it was '
  + 'installed in.';

export const UNINSTALL_TWICE_REASON = 'That removal is already on the audit for '
  + 'this minute. A program cannot be taken off twice in the same minute it '
  + 'came off in.';

/**
 * The two verbs.
 *
 * `install` writes the install onto `install_audit`, which only ever grows.
 * `uninstall` writes the removal onto `install_removed` and deliberately leaves
 * `install_audit` alone - the app comes off the machine, but the record that it
 * was there stays, because a trail that erased its own installs would make
 * covering your tracks free. There is no policy branch in either: an install
 * under a locked-down shop succeeds the same as under any other, and what the
 * policy decides - the suspicion drip, the lead's beat - is priced off this
 * trail by `world/software.ts` rather than enforced here.
 */
export const SOFTWARE_ACTION_DATA: readonly ActionData[] = [
  {
    id: SOFTWARE_ACTIONS.install,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      { when: alreadyLogged(FIELDS.installAudit), reason: INSTALL_TWICE_REASON },
    ],
    apply: [record(FIELDS.installAudit)],
  },
  {
    id: SOFTWARE_ACTIONS.uninstall,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      { when: alreadyLogged(FIELDS.installRemoved), reason: UNINSTALL_TWICE_REASON },
    ],
    apply: [record(FIELDS.installRemoved)],
  },
];
