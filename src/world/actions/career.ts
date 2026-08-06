/**
 * The career the player crosses (E6): the promotion, and the ssh trust ledger.
 *
 * Both act on the player's OWN node - the person the shell dispatches as - so
 * their target is that node and their effects are a field on it. They are here,
 * in the registry, for the reason everything is: the flipped tier and the
 * recorded host have to survive a save and be rebuilt by a replay, and a change
 * that arrived from outside the registry would not.
 *
 * The PROMOTION is the spine of the epic. It is EARNED - the world refuses it
 * below the reputation the offer is made at - and it is ONE-WAY: it refuses once
 * the player is already an engineer, so nothing anywhere can walk the tier back.
 * That is what makes "you never lose service-desk access, you gain server
 * access, permanently" a property the world enforces rather than a sentence in a
 * design doc. The weight is dramatised where the player reads it (the terminal
 * copy); the mechanic is this: a field flips, and the ssh mechanic that was
 * refused a minute ago is allowed.
 */

import type { ActionData } from '../../engine-api';
import { FIELDS, PLAYER_TIERS } from '../fields';
import { fieldIs, HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { CAREER_ACTIONS } from './ids';

/**
 * The reputation the Systems Engineer offer is made at. An OVERSEER TUNING KNOB,
 * and deliberately high on the nought-to-a-hundred scale the reputation meter
 * runs: the promotion is the payoff of career progression, not a free unlock, so
 * the world holds the door shut until the standing behind it is real. A player
 * arriving at the MSP with the standing they built across the arc clears it; a
 * fresh probationer nowhere near it does not, which is the whole of "earned".
 */
export const PROMOTION_REPUTATION = 70;

/** The title the promotion writes over whatever the player held before it. */
export const SYSTEMS_ENGINEER_TITLE = 'Systems Engineer';

/** The ssh host the trust action records, named in its one string parameter. */
export const SSH_HOST_PARAM = 'host';

export const CAREER_ACTION_DATA: readonly ActionData[] = [
  {
    id: CAREER_ACTIONS.acceptPromotion,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('person'),
      // One-way, enforced by the world: once an engineer, the offer is spent.
      // A promotion that could be accepted twice would be a tier the player
      // could be talked out of, and the whole point of a PAM tier crossing is
      // that it is not.
      {
        when: fieldIs(TARGET, FIELDS.playerTier, PLAYER_TIERS.systemsEngineer),
        reason: 'You are already a Systems Engineer. The promotion crosses the '
          + 'tier once and does not un-cross it - service-desk access you keep, '
          + 'server access you have.',
      },
      // Earned, enforced by the world: below the standing the offer is made at,
      // there is no offer to take. The number is the reputation the promotion
      // is offered at, and the refusal says so rather than dead-ending.
      {
        when: not({
          pred: 'field_at_least',
          node: TARGET,
          field: FIELDS.reputation,
          value: PROMOTION_REPUTATION,
        }),
        reason: 'The Systems Engineer offer is not on the table yet. It is the '
          + 'payoff of a career built, not a free unlock - keep the standing up '
          + 'and it arrives.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.playerTier,
        value: { const: PLAYER_TIERS.systemsEngineer },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.title,
        value: { const: SYSTEMS_ENGINEER_TITLE },
      },
    ],
  },
  {
    id: CAREER_ACTIONS.sshTrustHost,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('person'),
      {
        when: { pred: 'param_string_missing', param: SSH_HOST_PARAM },
        reason: 'A host to trust arrived empty. ssh records the box it just '
          + 'connected to, and there is nothing here to record.',
      },
    ],
    apply: [
      // One line per host, the way ~/.ssh/known_hosts is. The shell only
      // dispatches this for a host not already in the ledger, so the append is
      // never a duplicate; append_line reads the existing field, adds the id,
      // and writes it back, which is what makes the SECOND ssh to the same box
      // find it already there and skip the fingerprint.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.knownHosts,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.knownHosts,
            value: { param: SSH_HOST_PARAM },
          },
        },
      },
    ],
  },
];
