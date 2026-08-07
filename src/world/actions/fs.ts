import type { ActionData, GuardData } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER, not, TARGET } from './helpers';
import { FS_ACTIONS } from './ids';

/**
 * The filesystem-permission verbs (E6, 0.21.0): `chmod` and `chown`, the two
 * that change a Linux file or directory's rwx state.
 *
 * The Linux analogue of the systemd fix verbs, and the same shape: a pure
 * `set_field` on the target node, silent for the engine (the shell prints
 * `chmod`/`chown`'s real silence-on-success), reading and writing the SAME
 * `fs_mode`/`fs_owner`/`fs_group` fields `ls -la` renders - so a listing after a
 * chmod is the chmod, with no second truth to drift from.
 *
 * The mode arrives already resolved to an octal string and the owner/group
 * already split, because the shell (`cmd-unix.ts`) is where a real chmod's
 * grammar lives: symbolic `g+r` is applied against the current mode to an octal,
 * a bare `chown user` reads the existing group back so it is left alone, and the
 * resolved values are what dispatch here. The engine action does not parse rwx;
 * it records the answer, which is the honest split between grammar (the shell)
 * and state (the world). Both accept a `file` OR a `directory`, the two kinds a
 * path can name.
 */

/** `chmod`/`chown` accept either kind a path can name - a file or a directory. */
const FS_TARGET_GUARDS: readonly GuardData[] = [
  {
    when: { pred: 'target_missing' },
    reason: 'Pick a file or directory first. chmod and chown need a path to '
      + 'aim at.',
  },
  {
    when: { pred: 'node_missing', node: TARGET },
    reason: 'cannot access \'{target.id}\': No such file or directory.',
  },
  {
    when: not({
      pred: 'any',
      of: [
        { pred: 'kind_is', node: TARGET, kind: 'file' },
        { pred: 'kind_is', node: TARGET, kind: 'directory' },
      ],
    }),
    reason: '"{target.label}" is {target.kind_label}, not a file or a directory.',
  },
];

/** The parameters the shell resolves before it dispatches. */
export const FS_MODE_PARAM = 'mode';
export const FS_OWNER_PARAM = 'owner';
export const FS_GROUP_PARAM = 'group';

export const FS_ACTION_DATA: readonly ActionData[] = [
  {
    id: FS_ACTIONS.chmod,
    tier: HELPDESK_TIER,
    validate: [
      ...FS_TARGET_GUARDS,
      {
        when: { pred: 'param_string_missing', param: FS_MODE_PARAM },
        reason: 'chmod: missing operand. A mode (octal like 640, or symbolic '
          + 'like g+r) is what it changes the file to.',
      },
    ],
    // The one write ls -la reads back: the new octal mode, exactly as the shell
    // resolved it (an octal typed straight, a symbolic applied to the old mode).
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fsMode,
        value: { param_trim: FS_MODE_PARAM },
      },
    ],
  },
  {
    id: FS_ACTIONS.chown,
    tier: HELPDESK_TIER,
    validate: [
      ...FS_TARGET_GUARDS,
      {
        when: { pred: 'param_string_missing', param: FS_OWNER_PARAM },
        reason: 'chown: missing operand. An owner (user, or user:group) is what '
          + 'it changes the file to.',
      },
      {
        when: { pred: 'param_string_missing', param: FS_GROUP_PARAM },
        reason: 'chown: missing group. The shell resolves the group before it '
          + 'dispatches, so this arriving empty is our bug.',
      },
    ],
    // Owner and group together, both already resolved by the shell (a bare
    // `chown user` carries the existing group back so it is left where it was).
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fsOwner,
        value: { param_trim: FS_OWNER_PARAM },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fsGroup,
        value: { param_trim: FS_GROUP_PARAM },
      },
    ],
  },
];
