/**
 * The two that are about a drive, and are diagnosed by looking at one.
 *
 * They are the pair the filesystem slice was built for and left for this one:
 * the file that has not gone anywhere, and the directory that has quietly
 * eaten a box. Neither of them is a fault in anything. In the first, every
 * piece of software involved did exactly what it was told; in the second, a
 * program has been doing its job once a month since 1997 and nobody ever wrote
 * down where the output goes.
 *
 * Both are read with `dir` and `tree` and closed with one verb, and in both
 * the interesting half is the refusal: a move across the network is a
 * different job, and a directory whose contents are the only copy of anything
 * is not one this desk empties.
 */

import { HELPDESK_ACTIONS, MACHINE_PARAM } from '../actions';
import { COMPANY_IDS, machineHostname } from '../company';
import { FIELDS } from '../fields';
import {
  fsEntryId,
  myDocumentsDirId,
  SCANNER_EXPORT_BYTES,
  scannerExportDirId,
  TEMP_SEGMENTS,
  tempDirId,
} from '../filesystem';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { WorldTicket } from './types';

/* -- the file that has not gone anywhere ---------------------------------- */

/** What she called it, which is not what the mail client called anything. */
const STATEMENT = 'STATEMENT.TXT';

/** Where it is, where she believes it is, and the file itself. */
const TEMP_DIR = tempDirId(COMPANY_IDS.priyaMachine);
const HER_DOCUMENTS = myDocumentsDirId(COMPANY_IDS.priyaMachine, 'praval');
export const LOST_STATEMENT = fsEntryId(
  COMPANY_IDS.priyaMachine,
  [...TEMP_SEGMENTS, STATEMENT],
  'file',
);

/**
 * Yesterday afternoon, in the file itself, so a tech can prove it is the right
 * one before moving anything. It is the whole reason `type` is worth typing on
 * a file you found by accident.
 */
const STATEMENT_TEXT = [
  'HOLLOWAY & SONS - STATEMENT TO 31 AUGUST 1998',
  '',
  'INV 4471   1,240.00   PAID',
  'INV 4478     880.00   PAID',
  'INV 4501   2,310.00   QUERIED - PR 10/09 they delivered two of these',
  'INV 4506     415.00   QUERIED - PR 10/09 this is the one from July again',
  'INV 4512   1,905.00   ok to pay',
  '',
  'PR: rang Sandra, she is sending credit notes for both queries.',
  'PR: do not pay 4501 or 4506 until they land.',
].join('\n');

export const SAVED_INTO_TEMP: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.priyaMachine, COMPANY_IDS.priyaAccount],
  // She says it is high because the supplier run goes today and the annotated
  // statement is the only record of what not to pay. She is right about the
  // consequence and wrong about the disaster: nothing has been lost at all.
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:saved-into-temp',
    archetype: 'hidden_cause',
    flavor: {
      title: 'All my work from yesterday has gone',
      body:
        'Priya opened the Holloway statement out of a mail yesterday '
        + 'afternoon, spent two hours going through it with the supplier on '
        + 'the phone, and pressed Save about nine times. This morning it is '
        + 'not in My Documents, it is not in the mail, and she would like '
        + 'somebody to tell her the machine has not thrown away an afternoon. '
        + 'She is quite clear that she saved it. She saved it.',
    },
    reporter: COMPANY_IDS.priya,
    // The fault, as it actually happened: the file is exactly where the mail
    // client put it when it opened the attachment, and Save wrote back to the
    // same place every one of those nine times.
    setup: [
      {
        op: 'addNode',
        node: {
          id: LOST_STATEMENT,
          kind: 'file',
          fields: {
            [FIELDS.name]: STATEMENT,
            [FIELDS.modified]: '10/09/1998  16:52',
            [FIELDS.volume]: machineHostname(COMPANY_IDS.priyaMachine),
            [FIELDS.content]: STATEMENT_TEXT,
          },
        },
      },
      {
        op: 'addEdge',
        edge: { from: TEMP_DIR, to: LOST_STATEMENT, kind: 'contains' },
      },
    ],
    // Closed when the file is where she thought it was all along.
    resolved_when: {
      op: 'edge',
      from: { id: HER_DOCUMENTS },
      to: { id: LOST_STATEMENT },
      kind: 'contains',
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/saved-into-temp',
  },
  cause: 'The mail client wrote the attachment into C:\\WINDOWS\\TEMP to open '
    + 'it, and Save wrote back to where the file was opened from. Nine times. '
    + 'Nothing was lost, nothing is broken, and the machine would have thrown '
    + 'it away at the next clear-out without ever mentioning it.',
  dialogue_ref: 'dialogue/accounts-payable',
  paths: [
    {
      id: 'move-it-back-out-of-temp',
      app: 'cmd',
      label: 'Move it out of TEMP into her own documents',
      steps: [
        {
          action: HELPDESK_ACTIONS.fileMove,
          target: LOST_STATEMENT,
          params: { from: TEMP_DIR, to: HER_DOCUMENTS },
        },
      ],
    },
  ],
};

/* -- the directory that has eaten a box ----------------------------------- */

/** The exports, and the box they have been piling up on. */
const SCANNER_EXPORT = scannerExportDirId(COMPANY_IDS.warehouseMachine);

/**
 * What is left on that drive the morning she cannot save anything: eight
 * kilobytes, which is a drive that has run out rather than a drive that is
 * nearly full.
 *
 * It is the ticket's own mutation - the box has been at three megabytes all
 * week, and today's scanning finally took the last of it - and it is why the
 * fault arrives with the ticket rather than being true from the Monday.
 */
export const WAREHOUSE_DISK_LEFT = 8_192;

/** And what the drive holds once the exports are off it. */
export const WAREHOUSE_DISK_AFTER = WAREHOUSE_DISK_LEFT + SCANNER_EXPORT_BYTES;

export const DISK_FULL: WorldTicket = {
  arrival: 'drip',
  nodes: [COMPANY_IDS.warehouseMachine, COMPANY_IDS.hildaAccount],
  // The warehouse cannot book anything in, which is lorries in the yard. She
  // has said medium, because she has been in this building eleven years and
  // has never once had a ticket answered faster for saying high.
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: 'ticket:disk-full',
    archetype: 'hidden_cause',
    flavor: {
      title: 'WHOUSE-01 says there is not enough space and it is lying',
      body:
        'Hilda reports that the warehouse machine will not save the booking-in '
        + 'sheet, will not print it, and puts up a box about disk space every '
        + 'time she tries. She points out that she has saved four things on '
        + 'that computer in her entire life, that the last one was a Christmas '
        + 'rota, and that it therefore cannot possibly be full of hers.',
    },
    reporter: COMPANY_IDS.hilda,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehouseMachine,
        field: FIELDS.diskFree,
        value: WAREHOUSE_DISK_LEFT,
      },
    ],
    // Closed when the drive has room on it again, to the byte - because what
    // was actually wrong was a number in the footer of a listing, and the
    // number it comes back to is the one the exports were holding.
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.warehouseMachine },
      field: FIELDS.diskFree,
      value: WAREHOUSE_DISK_AFTER,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/one-directory-ate-the-drive',
  },
  cause: 'The pallet scanner has written a monthly export into '
    + 'C:\\SCANNER\\EXPORT since 1997 and deleted none of them. Twelve of them '
    + 'are three hundred megabytes on a drive that had three left, and every '
    + 'one of them was uploaded to head office the night it was written.',
  dialogue_ref: 'dialogue/warehouse',
  paths: [
    {
      id: 'empty-the-export-directory',
      app: 'cmd',
      label: 'Empty the scanner exports, which went to head office in 1997',
      steps: [
        {
          action: HELPDESK_ACTIONS.directoryPurge,
          target: SCANNER_EXPORT,
          params: { [MACHINE_PARAM]: COMPANY_IDS.warehouseMachine },
        },
      ],
    },
  ],
};

export const DRIVE_TICKETS: readonly WorldTicket[] = [
  SAVED_INTO_TEMP,
  DISK_FULL,
];
