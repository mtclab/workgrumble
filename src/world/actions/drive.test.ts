/**
 * The two verbs that move files, held to the thing that makes them different
 * from every other verb in this registry: they cannot be undone by doing them
 * again.
 *
 * So the tests are mostly refusals, and each one asserts two things - the
 * sentence the player is given, and that the world did not move. A refusal
 * that half-applied would be the worst bug this game could have, because the
 * only evidence of it would be a file nobody could find afterwards.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import {
  driveRootId,
  myDocumentsDirId,
  SCANNER_EXPORT_BYTES,
  scannerExportDirId,
  spoolDirId,
  tempDirId,
} from '../filesystem';
import { storedDisagreements } from '../fs';
import { createWorldSession, type WorldSession } from '../session';
import { spawnWorldTicket } from '../tickets';
import { LOST_STATEMENT, WAREHOUSE_DISK_AFTER } from '../tickets/drive';
import {
  ACROSS_VOLUMES_REASON,
  ALREADY_THERE_REASON,
  DESTINATION_IS_A_LISTING_REASON,
  HELPDESK_ACTIONS,
  MACHINE_PARAM,
  NOT_DISPOSABLE_REASON,
  NOT_IN_THAT_DIRECTORY_REASON,
  NOTHING_TO_EMPTY_REASON,
  WRONG_VOLUME_REASON,
} from './index';

beforeAll(() => {
  loadEngineForTests();
});

/** Where the statement actually is, and where she thought she had put it. */
const TEMP = tempDirId(COMPANY_IDS.priyaMachine);
const HER_DOCUMENTS = myDocumentsDirId(COMPANY_IDS.priyaMachine, 'praval');
const EXPORTS = scannerExportDirId(COMPANY_IDS.warehouseMachine);

function world(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession();

  for (const id of ticketIds) {
    spawnWorldTicket(session.engine, id);
  }

  return session;
}

function move(
  session: WorldSession,
  target: string,
  from: string,
  to: string,
): { ok: boolean; reason: string } {
  const result = session.engine.dispatch(
    HELPDESK_ACTIONS.fileMove,
    COMPANY_IDS.player,
    target,
    { from, to },
  );

  return result.ok
    ? { ok: true, reason: '' }
    : { ok: false, reason: result.reason };
}

function holds(
  session: WorldSession,
  directoryId: string,
  fileId: string,
): boolean {
  return session.engine.graph
    .neighbors(directoryId, { direction: 'out', edgeKind: 'contains' })
    .some((node) => node.id === fileId);
}

describe('moving a file', () => {
  it('takes it out of one directory and puts it in the other', () => {
    const session = world('ticket:saved-into-temp');
    const before = session.engine.graph.getField(
      LOST_STATEMENT,
      FIELDS.modified,
    );

    expect(holds(session, TEMP, LOST_STATEMENT)).toBe(true);
    expect(move(session, LOST_STATEMENT, TEMP, HER_DOCUMENTS).ok).toBe(true);

    expect(holds(session, TEMP, LOST_STATEMENT)).toBe(false);
    expect(holds(session, HER_DOCUMENTS, LOST_STATEMENT)).toBe(true);
    // A move keeps the stamp the file was written with. It is the only
    // evidence left of when the afternoon actually happened, and a verb that
    // touched it would be a verb that destroyed the answer to "which copy".
    expect(session.engine.graph.getField(LOST_STATEMENT, FIELDS.modified))
      .toBe(before);
  });

  it('refuses a move out of a directory the file is not in', () => {
    const session = world('ticket:saved-into-temp');
    const hash = session.engine.snapshotHash();
    const result = move(
      session,
      LOST_STATEMENT,
      driveRootId(COMPANY_IDS.priyaMachine),
      HER_DOCUMENTS,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      NOT_IN_THAT_DIRECTORY_REASON
        .replace('{target.label}', 'STATEMENT.TXT')
        .replace('{p:from.label}', 'C:'),
    );
    expect(session.engine.snapshotHash()).toBe(hash);
  });

  it('refuses to move a file to where it already is', () => {
    const session = world('ticket:saved-into-temp');

    expect(move(session, LOST_STATEMENT, TEMP, HER_DOCUMENTS).ok).toBe(true);

    const hash = session.engine.snapshotHash();
    const again = move(session, LOST_STATEMENT, HER_DOCUMENTS, HER_DOCUMENTS);

    expect(again.ok).toBe(false);
    expect(again.reason).toContain('is already in');
    expect(again.reason).toContain('two copies of a spreadsheet');
    expect(session.engine.snapshotHash()).toBe(hash);
  });

  /**
   * The refusal the volume field exists for. It is not pedantry: a file moved
   * between two boxes is a copy across the network and a delete afterwards,
   * which is two decisions, one of them on somebody else's disk - and the id
   * of every entry on a drive says which drive it is on.
   */
  it('refuses a move from one box to another', () => {
    const session = world('ticket:saved-into-temp');
    const hash = session.engine.snapshotHash();
    const result = move(
      session,
      LOST_STATEMENT,
      TEMP,
      myDocumentsDirId(COMPANY_IDS.playerMachine, 'ppending'),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      ACROSS_VOLUMES_REASON
        .replace('{p:from.label}', 'TEMP')
        .replace('{p:to.label}', 'My Documents'),
    );
    expect(session.engine.snapshotHash()).toBe(hash);
    expect(holds(session, TEMP, LOST_STATEMENT)).toBe(true);
  });

  /**
   * The refusal that keeps the two kinds of directory apart. A listing read
   * from a field is the only answer anything gets about that directory, so a
   * file moved into one would exist, belong to it, and appear in nothing -
   * which is a worse outcome than the lost file this verb exists to fix.
   *
   * Driven on the warehouse box, where the only stored directory in the estate
   * is, so that the answer is this one rather than the volume refusal.
   */
  it('refuses a directory whose listing is a field, not its children', () => {
    const local = world();
    const warehouseTemp = tempDirId(COMPANY_IDS.warehouseMachine);
    const setupLog = 'file:warehouse/c/windows/temp/setup.log';
    const hash = local.engine.snapshotHash();
    const result = local.engine.dispatch(
      HELPDESK_ACTIONS.fileMove,
      COMPANY_IDS.player,
      setupLog,
      { from: warehouseTemp, to: EXPORTS },
    );

    expect(result).toEqual({
      ok: false,
      reason: DESTINATION_IS_A_LISTING_REASON.replace(
        '{p:to.label}',
        'EXPORT',
      ),
    });
    expect(local.engine.snapshotHash()).toBe(hash);
  });

  it('refuses a directory whose rights are somebody else\'s', () => {
    const session = world();
    const readme = 'file:files/c/shares/common/readme.txt';
    const common = 'dir:files/c/shares/common';
    const payroll = 'dir:files/c/payroll';
    const hash = session.engine.snapshotHash();
    const result = move(session, readme, common, payroll);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('rights on "PAYROLL" are not yours');
    expect(session.engine.snapshotHash()).toBe(hash);
  });
});

describe('emptying a directory a program filled', () => {
  it('gives the space back to the drive it came off', () => {
    const session = world('ticket:disk-full');
    const graph = session.engine.graph;

    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      EXPORTS,
      { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
    );

    expect(result).toEqual({ ok: true });
    expect(graph.getField(COMPANY_IDS.warehouseMachine, FIELDS.diskFree))
      .toBe(WAREHOUSE_DISK_AFTER);
    expect(graph.getField(EXPORTS, FIELDS.storedBytes)).toBe(0);
    expect(graph.getField(EXPORTS, FIELDS.storedFiles)).toBe('');
    // The listing and the number the drive believes are two facts about one
    // pile, and emptying it has to move both in the same breath.
    expect(storedDisagreements(graph)).toEqual([]);
    expect(SCANNER_EXPORT_BYTES).toBeGreaterThan(0);
  });

  /**
   * The refusal this verb exists for. The pallet database is in the directory
   * next door, with the same software's name on it, and it is the only record
   * of where anything in that warehouse is.
   */
  it('refuses a directory whose contents are the only copy', () => {
    const session = world('ticket:disk-full');
    const hash = session.engine.snapshotHash();
    const data = 'dir:warehouse/c/scanner/data';

    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      data,
      { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
    );

    expect(result).toEqual({
      ok: false,
      reason: NOT_DISPOSABLE_REASON.replace('{target.label}', 'DATA'),
    });
    expect(session.engine.snapshotHash()).toBe(hash);
    expect(session.engine.ticketState('ticket:disk-full')).toBe('open');
  });

  /** And the same answer for the rest of the drive, which is most of it. */
  it('refuses the spool directory and the windows directory alike', () => {
    const session = world('ticket:wedged-spooler');

    for (const directory of [
      spoolDirId(COMPANY_IDS.printServer),
      'dir:print/c/windows',
      driveRootId(COMPANY_IDS.printServer),
    ]) {
      const hash = session.engine.snapshotHash();
      const result = session.engine.dispatch(
        HELPDESK_ACTIONS.directoryPurge,
        COMPANY_IDS.player,
        directory,
        { [MACHINE_PARAM]: COMPANY_IDS.printServer },
      );

      expect(result.ok, directory).toBe(false);
      expect(result.ok ? '' : result.reason, directory)
        .toContain('is not a second copy of anything');
      expect(session.engine.snapshotHash(), directory).toBe(hash);
    }
  });

  it('refuses a second helping once there is nothing in it', () => {
    const session = world('ticket:disk-full');

    session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      EXPORTS,
      { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
    );

    const hash = session.engine.snapshotHash();
    const again = session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      EXPORTS,
      { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
    );

    expect(again).toEqual({
      ok: false,
      reason: NOTHING_TO_EMPTY_REASON.replace('{target.label}', 'EXPORT'),
    });
    expect(session.engine.snapshotHash()).toBe(hash);
  });

  /**
   * Free space is a fact about a volume. Handing this directory's three
   * hundred megabytes to a box on the other side of the building would be a
   * number nobody could ever explain, and it is the second thing the volume
   * field is there to refuse.
   */
  it('refuses to give the space back to a box it did not come off', () => {
    const session = world('ticket:disk-full');
    const hash = session.engine.snapshotHash();

    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      EXPORTS,
      { [MACHINE_PARAM]: COMPANY_IDS.playerMachine },
    );

    expect(result).toEqual({
      ok: false,
      reason: WRONG_VOLUME_REASON
        .replace('{target.label}', 'EXPORT')
        .replace('{p:machine.label}', 'BEIGE-BOX'),
    });
    expect(session.engine.snapshotHash()).toBe(hash);
  });

  it('refuses anything that is not a directory at all', () => {
    const session = world('ticket:disk-full');
    const result = session.engine.dispatch(
      HELPDESK_ACTIONS.directoryPurge,
      COMPANY_IDS.player,
      COMPANY_IDS.warehouseMachine,
      { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('a workstation');
    expect(ALREADY_THERE_REASON.length).toBeGreaterThan(0);
  });
});
