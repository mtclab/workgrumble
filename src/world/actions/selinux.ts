import type { ActionData, GuardData } from '../../engine-api';
import { FIELDS } from '../fields';
import { SELINUX_MODES } from '../selinux';
import { HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { SELINUX_ACTIONS } from './ids';

/**
 * The SELinux verbs (E6, 0.28.0): the two fixes, and the report that lands a
 * day after one of them.
 *
 * Both fixes work. That is the whole beat, and it is why they are two verbs
 * rather than one with a flag: `restorecon` changes ONE FILE's label back to
 * what the policy says the path should carry, and `setenforce 0` changes what
 * the BOX does about labels at all. The first is the fix; the second is the
 * afternoon back, and a control switched off on a machine somebody else audits.
 *
 * `selinux.noticed` is the world's own verb, offered by nothing: the day driver
 * settles it at the next start of shift off `selinuxAuditDue`, exactly the rail
 * the unverified-enrolment bill already runs on. It charges no meter on purpose
 * - the consequence is the RECORD, in an inbox, with the player's box named in
 * it, and a reputation hit would turn a lesson about technical debt into a
 * telling-off for a keystroke that fixed the problem in front of them.
 */

/** `setenforce` takes the same 0/1 the real one does. */
export const SELINUX_MODE_PARAM = 'mode';

/** A box that has no SELinux on it has nothing for either verb to write. */
const BOX_HAS_SELINUX: GuardData = {
  when: { pred: 'field_missing', node: TARGET, field: FIELDS.selinuxMode },
  reason: 'This box is not running SELinux, so there is no enforcement on it '
    + 'to set. That is a fact about the distribution, not a permission.',
};

export const SELINUX_ACTION_DATA: readonly ActionData[] = [
  {
    id: SELINUX_ACTIONS.restorecon,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('file'),
      // The relabel target comes off the FILE, so a path the policy holds no
      // answer for is a refusal rather than a label invented on the spot.
      {
        when: {
          pred: 'field_missing',
          node: TARGET,
          field: FIELDS.selinuxContextDefault,
        },
        reason: 'The policy holds no context for "{target.id}", so there is '
          + 'nothing to restore it to. restorecon does not invent labels.',
      },
    ],
    // The one write: the policy's own answer, copied back onto the file. Run on
    // a file that is already correct it writes the same string, which is why
    // running it twice is honest rather than a claim to have fixed something.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.selinuxContext,
        value: { field: { node: TARGET, field: FIELDS.selinuxContextDefault } },
      },
    ],
  },
  {
    id: SELINUX_ACTIONS.setenforce,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      BOX_HAS_SELINUX,
      {
        when: not({
          pred: 'param_int_in',
          param: SELINUX_MODE_PARAM,
          values: [0, 1],
        }),
        reason: 'setenforce: invalid argument. It takes 0 (Permissive) or 1 '
          + '(Enforcing), and nothing else.',
      },
    ],
    apply: [
      {
        op: 'when',
        cond: { pred: 'param_int_in', param: SELINUX_MODE_PARAM, values: [0] },
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.selinuxMode,
            value: { const: SELINUX_MODES.permissive },
          },
          // The minute it happened, written in the same act. Two verbs could
          // not guarantee this: a save could exist with enforcement off and
          // nothing remembering that anybody turned it off.
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.selinuxPermissiveAt,
            value: { now: true },
          },
        ],
      },
      {
        op: 'when',
        cond: { pred: 'param_int_in', param: SELINUX_MODE_PARAM, values: [1] },
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.selinuxMode,
            value: { const: SELINUX_MODES.enforcing },
          },
        ],
      },
    ],
  },
  {
    id: SELINUX_ACTIONS.selinuxNoticed,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.selinuxPermissiveAt,
        }),
        reason: 'Nothing was ever put in permissive mode on that box, so there '
          + 'is nothing for a report to say about it.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.selinuxNoticedAt,
        },
        reason: 'That one has already come round. Once is the arrangement.',
      },
    ],
    // One write, on the box the report is about: the minute somebody upstream
    // read it. The player is charged nothing - the consequence is the record,
    // and the mail hangs its arrival off exactly this field.
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.selinuxNoticedAt,
        value: { now: true },
      },
    ],
  },
];
