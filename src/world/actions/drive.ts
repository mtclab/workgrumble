/**
 * The two verbs that change what is ON a drive.
 *
 * Everything else in this registry moves a field: an account unlocks, a
 * service restarts, a display goes back the right way up. These two move
 * FILES, which is the one class of change on a helpdesk that cannot be undone
 * by doing it again - so both of them are written to refuse more often than
 * they act, and every refusal names the true reason rather than the rule.
 *
 * Both lean on one field that every directory and every file carries: the
 * volume it is on, by hostname. Containment in this world is a chain of
 * `contains` edges of no fixed length, and a guard can only look a fixed
 * number of hops - so "are these two paths on the same drive" and "is this
 * directory on that box" are questions the op language cannot walk to and can
 * read. Without it, a move across the network would look exactly like a move
 * across a directory, and the free space from an emptied directory could be
 * handed to a machine on the other side of the building.
 */

import type { ActionData } from '../../engine-api';
import { FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  param,
  paramNodeGuards,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

/** The directory a file is moving out of, and the one it is moving into. */
const FROM_PARAM = 'from';
const TO_PARAM = 'to';

/** The box whose free space an emptied directory gives back. */
export const MACHINE_PARAM = 'machine';

/**
 * The largest a volume on this estate could be, for the clamp on free space.
 *
 * Every arithmetic op in this language carries a range because every number in
 * this world is a number somebody reads back, and free space is bounded by the
 * drive it is on. Two gigabytes is what the partitions in this building were
 * cut at, and nothing here has ever been anywhere near it.
 */
export const VOLUME_CEILING = 2_147_483_648;

export const NOT_IN_THAT_DIRECTORY_REASON = '"{target.label}" is not in '
  + `"{p:${FROM_PARAM}.label}". A move starts from where the file actually is, `
  + 'and a listing of the directory it is in is how anybody knows that.';

export const ALREADY_THERE_REASON = '"{target.label}" is already in '
  + `"{p:${TO_PARAM}.label}". Moving a file to where it is is how one copy `
  + 'becomes two, and two copies of a spreadsheet is a fortnight of somebody '
  + 'editing the wrong one.';

export const ACROSS_VOLUMES_REASON = `"{p:${FROM_PARAM}.label}" and `
  + `"{p:${TO_PARAM}.label}" are on two different drives. Moving a file `
  + 'between boxes is a copy over the network and a delete afterwards, which '
  + 'is two decisions and somebody else\'s disk - this verb moves a file '
  + 'around the drive it is already on.';

export const DESTINATION_IS_A_LISTING_REASON = 'What is in '
  + `"{p:${TO_PARAM}.label}" is whatever the program that fills it has `
  + 'written there, and that listing is the only answer anything gets about '
  + 'that directory. A file put in there would be in there and would not '
  + 'appear in it, which is worse than losing it.';

export const DESTINATION_DENIED_REASON = 'The rights on '
  + `"{p:${TO_PARAM}.label}" are not yours, so nothing you put in there would `
  + 'be yours to take out again. That is a permission somebody grants rather '
  + 'than one you work around.';

export const SOURCE_DENIED_REASON = 'The rights on '
  + `"{p:${FROM_PARAM}.label}" are not yours. You can see that there is `
  + 'something in there and you cannot take it out.';

export const NOT_DISPOSABLE_REASON = 'What is in "{target.label}" is not a '
  + 'second copy of anything. It is the only copy there is, somebody works '
  + 'off it, and emptying it would be the last thing you did here. The '
  + 'directory whose contents have already been sent somewhere else is the '
  + 'one this verb will empty, and the software that writes them says which '
  + 'that is in its own configuration.';

export const NOTHING_TO_EMPTY_REASON = 'There is nothing in "{target.label}" '
  + 'taking up room. Whatever has filled that drive, it is not this.';

export const WRONG_VOLUME_REASON = '"{target.label}" is not on the drive in '
  + `"{p:${MACHINE_PARAM}.label}". Free space belongs to a volume, and giving `
  + 'this one back to the wrong box would be a number nobody could explain.';

export const DRIVE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.fileMove,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('file'),
      ...paramNodeGuards(FROM_PARAM, 'directory'),
      ...paramNodeGuards(TO_PARAM, 'directory'),
      {
        when: not({
          pred: 'has_edge',
          from: param(FROM_PARAM),
          to: TARGET,
          kind: 'contains',
        }),
        reason: NOT_IN_THAT_DIRECTORY_REASON,
      },
      {
        when: {
          pred: 'has_edge',
          from: param(TO_PARAM),
          to: TARGET,
          kind: 'contains',
        },
        reason: ALREADY_THERE_REASON,
      },
      // Both ends, because both ends are a thing somebody can be refused: a
      // directory you may not read and a directory you may not write into are
      // two different sentences and the player is owed the right one.
      {
        when: fieldIs(param(FROM_PARAM), FIELDS.accessDenied, true),
        reason: SOURCE_DENIED_REASON,
      },
      {
        when: fieldIs(param(TO_PARAM), FIELDS.accessDenied, true),
        reason: DESTINATION_DENIED_REASON,
      },
      // A directory whose listing is a field cannot also hold a file: the
      // listing is what every surface reads, so the file would exist, belong
      // to that directory, and appear in nothing.
      {
        when: not({
          pred: 'field_missing',
          node: param(TO_PARAM),
          field: FIELDS.storedFiles,
        }),
        reason: DESTINATION_IS_A_LISTING_REASON,
      },
      {
        when: not({
          pred: 'field_eq',
          node: param(TO_PARAM),
          field: FIELDS.volume,
          value: { field: { node: param(FROM_PARAM), field: FIELDS.volume } },
        }),
        reason: ACROSS_VOLUMES_REASON,
      },
    ],
    // Out of one directory and into the other, and nothing else: a move keeps
    // the stamp the file was written with, which is what makes the stamp worth
    // reading afterwards.
    apply: [
      {
        op: 'remove_edge',
        from: param(FROM_PARAM),
        to: TARGET,
        kind: 'contains',
      },
      {
        op: 'add_edge',
        from: param(TO_PARAM),
        to: TARGET,
        kind: 'contains',
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.directoryPurge,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('directory'),
      ...paramNodeGuards(MACHINE_PARAM, 'machine'),
      // The refusal that matters, and it is first of the three: this verb
      // deletes things, and the only question worth asking about a deletion is
      // whether what is going is the only copy.
      {
        when: not(fieldIs(TARGET, FIELDS.disposable, true)),
        reason: NOT_DISPOSABLE_REASON,
      },
      {
        when: {
          pred: 'any',
          of: [
            not({
              pred: 'field_is_number',
              node: TARGET,
              field: FIELDS.storedBytes,
            }),
            {
              pred: 'field_at_most',
              node: TARGET,
              field: FIELDS.storedBytes,
              value: 0,
            },
          ],
        },
        reason: NOTHING_TO_EMPTY_REASON,
      },
      {
        when: not({
          pred: 'field_eq',
          node: TARGET,
          field: FIELDS.volume,
          value: { field: { node: param(MACHINE_PARAM), field: FIELDS.hostname } },
        }),
        reason: WRONG_VOLUME_REASON,
      },
    ],
    // The space first, while the directory still knows how much of it there
    // was, and the listing last. Any other order gives back nothing and says
    // it gave back everything.
    apply: [
      {
        op: 'set_field',
        node: param(MACHINE_PARAM),
        field: FIELDS.diskFree,
        value: {
          add: {
            node: param(MACHINE_PARAM),
            field: FIELDS.diskFree,
            by: { field: { node: TARGET, field: FIELDS.storedBytes } },
            clamp: { min: 0, max: VOLUME_CEILING },
          },
        },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.storedBytes,
        value: { const: 0 },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.storedFiles,
        value: { const: '' },
      },
    ],
  },
];
