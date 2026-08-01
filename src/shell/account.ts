/**
 * What the badge screen says about the badge, in the building's voice.
 *
 * It is a RECORD CARD, not a privacy notice. Nothing here is about data
 * protection because there is no data to protect - the whole account is a
 * number and two dates - and a paragraph of policy on a log-on screen would be
 * the one place in this product that stopped being the joke. What it is, is the
 * thing every IT department on earth does and never tells anybody: dormant
 * accounts get cleared out, on a schedule, by somebody reclaiming a disk.
 *
 * The dates are formatted here rather than in the DOM so the wording is
 * something a test can hold, and the retention line is BUILT from the shared
 * constant rather than typed - a screen promising a hundred and eighty days
 * next to a KV record holding ninety is exactly the sort of drift nobody finds
 * until somebody's week is gone.
 */

import type { Account } from './api';
import { RETENTION_DAYS } from '../shared/retention';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * A date the way a person in an office writes one: 4 March 1998.
 *
 * Written out rather than handed to `Intl`, because the format has to be the
 * same sentence on every machine that reads it - a screen that says "3/4/2026"
 * to one tester and "4/3/2026" to another has told them different days.
 */
export function formatDay(stamp: number): string {
  const when = new Date(stamp);
  const month = MONTHS[when.getMonth()] ?? '';

  return `${String(when.getDate())} ${month} ${String(when.getFullYear())}`;
}

export interface AccountFact {
  readonly term: string;
  readonly value: string;
}

/** The three dates the record card holds, in the order they happened. */
export function accountFacts(
  account: Readonly<Account>,
): readonly AccountFact[] {
  return [
    { term: 'Badge', value: account.badge },
    { term: 'Issued', value: formatDay(account.createdAt) },
    { term: 'Last seen', value: formatDay(account.lastSeen) },
    { term: 'Cleared on', value: formatDay(account.lapsesAt) },
  ];
}

/**
 * The sentence under the dates. It has to do two things at once: say plainly
 * that the account expires, and be truthful that nothing happens to anybody who
 * keeps turning up - which is the fact that stops the date being a threat.
 */
export function retentionNote(): string {
  return `That date moves. Every time you log on, and every time a day is `
    + `kept against this badge, IT puts it another ${String(RETENTION_DAYS)} `
    + 'days out. Leave it alone for six months and the badge goes, and the '
    + 'week with it - dormant accounts are cleared out to reclaim the disk, '
    + 'which is the most realistic thing in this building.';
}
