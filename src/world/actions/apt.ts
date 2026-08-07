/**
 * The package-management verbs (E6, 0.20.0): `apt install` and `apt upgrade`,
 * the two that change a Linux box's state.
 *
 * They close the loop the 0.16.0 not-installed gags opened. `aptInstall` appends
 * a package to the box's `installed_packages` set, and that one write is the
 * whole mechanic: a command the box gagged a minute ago (htop/traceroute/net-
 * tools) RUNS once its package is in the set. `aptUpgrade` sets the box's
 * `updates_applied` flag, applying the pending updates `apt update`/`apt list
 * --upgradable` read off the derived baseline. Both act on the MACHINE - a
 * package is installed on a box, updates are applied to a box - so their target
 * is the machine node and their effect is a field on it, which is what makes the
 * install and the patch survive a save and be rebuilt by a replay rather than
 * being a variable in the shell. Determinism and no DOM, like every other action.
 */

import type { ActionData } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER, targetGuards, TARGET } from './helpers';
import { APT_ACTIONS } from './ids';

/** The package `apt install` records, named in its one string parameter. */
export const APT_PACKAGE_PARAM = 'package';

export const APT_ACTION_DATA: readonly ActionData[] = [
  {
    id: APT_ACTIONS.aptInstall,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      {
        when: { pred: 'param_string_missing', param: APT_PACKAGE_PARAM },
        reason: 'A package to install arrived empty. apt records the package it '
          + 'just installed, and there is nothing here to record.',
      },
    ],
    apply: [
      // One line per package, the way dpkg keeps one record per package. The
      // shell only dispatches this for a package not already installed, so the
      // append is never a duplicate; append_line reads the existing set, adds
      // the package, and writes it back, which is what makes the previously-
      // gagged command find its package present and RUN.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.installedPackages,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.installedPackages,
            value: { param: APT_PACKAGE_PARAM },
          },
        },
      },
    ],
  },
  {
    id: APT_ACTIONS.aptUpgrade,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
    ],
    apply: [
      // The box is patched: the pending-updates baseline the shell derives off
      // the box id reads as clean once this flag is set. Idempotent by
      // construction - upgrading a clean box sets true again, which is a no-op -
      // so the shell can dispatch it without a guard against a second run.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.updatesApplied,
        value: { const: true },
      },
    ],
  },
];
