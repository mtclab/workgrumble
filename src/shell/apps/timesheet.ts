import { TIMESHEET_SUBMITTED_REASON } from '../../world/actions';
import { arcWeekOf } from '../../world/arc-week';
import { arcDate } from '../../world/hours';
import {
  hoursLabel,
  lineFlag,
  lineHandle,
  type SheetDay,
  type SheetLine,
  type SheetShape,
  type Timesheet,
  utilisationLine,
} from '../../world/timesheet';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  element,
  KeyedRows,
  type KeyedRow,
  osButton,
  outcomeLine,
  refusalLine,
  setAvailability,
  setFlag,
  setText,
} from './ui';

/**
 * The Timesheet (0.30.0, slice 1): the second door onto the sheet.
 *
 * The terminal already prints it. This window exists because the sheet is the
 * one surface in this game where TWO NUMBERS ABOUT THE SAME AFTERNOON have to
 * be looked at together, and a column of monospace rows is the wrong shape for
 * a comparison a player is meant to feel bad about. Everything here is a read
 * of `day.timesheet()` plus the three shipped verbs; this file computes no
 * minutes, keeps no copy of a claim, and writes nothing to the world that
 * `claimTimesheet` and `submitTimesheet` do not write themselves.
 *
 * THE READING, which is the whole design job and each half of it is a rule:
 *
 *  - THE TWO NUMBERS SIT SIDE BY SIDE ONLY WHERE THE PLAYER HAS SAID SOMETHING.
 *    An untouched line has one number on it, because "7h 30m worked, 7h 30m
 *    claimed" is a column of noise that teaches nobody anything. The moment a
 *    claim is filed the row grows its second figure and keeps it - including
 *    when the claim happens to MATCH the record, because a sheet that quietly
 *    forgot you had been in there would be lying by omission about the one
 *    thing it is for. That is `gapOf` reading `edited` rather than comparing
 *    the numbers, and it is the difference the unit test stands on.
 *  - A VAGUE LINE LOOKS VAGUE. Every row carries the sentence it will actually
 *    go out as - "11/09/1998, Arden Manufacturing, 2h 30m", or the word
 *    "consulting" and nothing else. The research says granularity is the
 *    defence rather than honesty, so the choice has to be VISIBLE as a choice:
 *    a full invoice line beside a three-word one is the argument, made without
 *    a single word of advice.
 *  - THE TIME NOBODY CAN BILL IS ON THE SHEET, and only when there is some. It
 *    is a subtraction rather than a punishment - the walk, the forum, the
 *    twenty minutes after the phone call - and it appears under the day it
 *    happened in, in the same column as everything else.
 *  - THE STAMP IS HONEST. Due, due today, submitted at a minute, or submitted
 *    by the week ending because nobody got round to it. The fourth of those is
 *    a real thing that happens to this sheet and it says so in those words.
 *
 * THE SHAPE IS THE RUNG'S (0.40.0), and the three shapes are three different
 * windows. `single_bucket` is the probation desk and it is the joke - one
 * bucket a day at seven and a half hours, nothing attributed to anybody, no
 * line to argue with and one button - so this window offers NO edit
 * affordances on it. That is not the gate being hidden: there is nothing on a
 * probationer's sheet to decide, the window says so in its own sentence, and
 * the terminal's verbs are still there for anybody who insists. `per_customer`
 * is the senior desk's, and it is where the argument starts: a line per party
 * the day was actually spent on, edits on every row, and no billable word at
 * the end of one because that rung is on nobody's invoice.
 * `per_customer_project` is the engineer's, and it is the whole mechanic: the
 * project on a line of its own with its code, and the billable flag with it.
 *
 * WHY THIS ONE DOES NOT REPAINT WHOLESALE, unlike the plan surface next door.
 * The derived column MOVES - a line grows while the player is on it - so the
 * window redraws every minute, and at x4 that is four times a second. There is
 * a number field in every row here. Rebuilding it once a tick would take the
 * caret out of the middle of a half-typed figure four times a second, which is
 * the exact case `KeyedRows` was written for: a row that has changed what it
 * SAYS has not changed what it IS. So the masthead is built once and written
 * into, the rows are keyed by (day, bucket) - the thing being claimed, never
 * the handle, which moves when a new bucket sorts in front of it - and the
 * only DOM this window replaces is a row that has genuinely arrived or gone.
 */

/* -- the readings, which the offline suite drives ------------------------- */

/**
 * Where a line's claim stands against the record.
 *
 * `unedited` is not "the numbers match" - it is "the player has not been in
 * here", which is a different fact and the one the row is drawn from. Filing a
 * claim for exactly what the records say, or flipping a line to vague without
 * moving a minute, leaves a line whose numbers are level and whose claim is
 * the player's own; the sheet shows both figures on it either way.
 */
export type ClaimGap = 'unedited' | 'level' | 'over' | 'under';

export function gapOf(line: Readonly<SheetLine>): ClaimGap {
  if (!line.edited) {
    return 'unedited';
  }

  if (line.claimed > line.derived) {
    return 'over';
  }

  return line.claimed < line.derived ? 'under' : 'level';
}

/**
 * The sentence a line goes out as - the whole of the detail mechanic.
 *
 * The date is the ARC's (0.40.0). A day number here is a day of THIS week, and
 * an invoice line dated the eleventh of September in the fourth week of a
 * career is a line the customer would query - the sheet is the one document in
 * this game that leaves the building, so it is the last place a week-one date
 * belongs.
 */
export function lineReads(
  arcWeek: number,
  day: number,
  line: Readonly<SheetLine>,
): string {
  return line.detail === 'vague'
    ? 'consulting'
    : `${arcDate(arcWeek, day)}, ${line.label}, ${hoursLabel(line.claimed)}`;
}

/**
 * The rest of the day, named and only when there is some of it.
 *
 * Never a scolding and never a red number: an hour on the forum is an hour
 * nobody can put on an invoice, and that sentence is the entire consequence.
 */
export function unattributedLine(day: Readonly<SheetDay>): string | null {
  return day.unattributed > 0
    ? `${hoursLabel(day.unattributed)} of this day is on nobody's invoice. `
      + 'Nothing is charged for it - it is time that cannot be billed to '
      + 'anybody, which is not the same thing as time nobody worked.'
    : null;
}

/** A day's or a week's two totals, with the second one only when it differs. */
export function totalsLine(derived: number, claimed: number): string {
  return derived === claimed
    ? `${hoursLabel(derived)} worked`
    : `${hoursLabel(derived)} worked, ${hoursLabel(claimed)} claimed`;
}

export type StampState = 'due' | 'due-today' | 'submitted' | 'auto-submitted';

export interface SheetStamp {
  readonly state: StampState;
  readonly line: string;
}

/**
 * Where the paper has got to, in the four states it can actually be in.
 *
 * The auto one is a real outcome of this mechanic rather than an error state -
 * the week ends and whatever is on the sheet goes in - so it is said plainly
 * and in the same place as the others, with the minute on it.
 */
export function sheetStamp(
  sheet: Readonly<Timesheet>,
  today: number,
): SheetStamp {
  if (sheet.submittedAt !== null) {
    const when = formatSimTime(sheet.submittedAt);

    return sheet.submittedAuto
      ? {
        state: 'auto-submitted',
        line: `Nobody filled it in. The week ended at ${when.time} on ${
          when.day.toLowerCase()
        } and it went in exactly as it stood.`,
      }
      : {
        state: 'submitted',
        line: `Submitted at ${when.time} on ${when.day.toLowerCase()}. The `
          + 'copy on this machine is not the one anybody is looking at any '
          + 'more.',
      };
  }

  return today >= sheet.dueDay
    ? {
      state: 'due-today',
      line: `Due at the end of today, day ${String(sheet.dueDay)}. Nothing has `
        + 'gone in yet.',
    }
    : {
      state: 'due',
      line: `Due at the end of day ${String(sheet.dueDay)}. Nothing has gone `
        + 'in yet.',
    };
}

/** What the window is for, said differently to each rung it is for. */
export function shapeLine(sheet: Readonly<Timesheet>): string {
  if (sheet.shape === 'single_bucket') {
    return 'One bucket a day, seven and a half hours, attributed to nobody. '
      + 'There is nothing on it to decide and one thing to do with it.';
  }

  // The senior desk's sentence says the two things that are actually different
  // about it, and neither is the engineer's: the day has to add up, and the
  // hours are the ones the records have rather than a number the sheet writes
  // for you. No project code and no billable flag are named because there are
  // none to name - a window that advertised a column it does not draw would be
  // the engineer's sheet with the lights off.
  return sheet.shape === 'per_customer'
    ? 'A line for each account the day went on, off the records rather than '
      + 'off the clock. What is left over is nobody\'s. What you say is what '
      + 'goes in.'
    : 'A line per customer, the project on a line of its own, and a billable '
      + 'flag. What the records say is on the left. What you say is what goes '
      + 'out.';
}

/**
 * Whether this window offers an edit at all.
 *
 * Two ways to be false and they are different sentences: a PROBATIONER's sheet
 * has nothing on it to argue with - it writes the same day every day whatever
 * was worked - and a submitted one is somebody else's piece of paper now. Both
 * are said in the window rather than left as dead controls.
 *
 * The senior desk gets the edits (0.40.0) and that is the point of the rung
 * rather than an oversight: the moment a sheet says whose day it was, there is
 * something on it to disagree with, and the disagreement is the mechanic.
 */
export function editsOffered(sheet: Readonly<Timesheet>): boolean {
  return sheet.shape !== 'single_bucket' && sheet.submittedAt === null;
}

/** Why the sheet cannot be sent, in the world's own words, or null. */
export function submitRefusal(sheet: Readonly<Timesheet>): string | null {
  return sheet.submittedAt === null ? null : TIMESHEET_SUBMITTED_REASON;
}

/* -- the rows, as the window lays them out -------------------------------- */

export interface DayItem {
  readonly kind: 'day';
  readonly key: string;
  readonly day: SheetDay;
  readonly today: boolean;
}

export interface LineItem {
  readonly kind: 'line';
  readonly key: string;
  readonly day: number;
  /** `3.2` - the address the terminal knows this line by, and the test hook. */
  readonly handle: string;
  readonly line: SheetLine;
  readonly editable: boolean;
  /**
   * The sheet's shape, carried onto the row because the word at the END of a
   * row is the shape's and not the line's: a sheet that makes no billable
   * split prints no register there (`lineFlag`). The row cannot read it off
   * the line, which is why it rides here.
   */
  readonly shape: SheetShape;
}

export interface GapItem {
  readonly kind: 'gap';
  readonly key: string;
  readonly day: SheetDay;
}

export type SheetItem = DayItem | LineItem | GapItem;

/**
 * The sheet as the rows the window draws, in order.
 *
 * One flat list rather than a tree, because the reconciler that keeps a
 * half-typed figure alive across a repaint works on one, and because a
 * timesheet IS a flat list: a day heading, its lines, and what is left of the
 * day underneath them.
 *
 * The key is the (day, bucket) pair and never the handle. The handle is a
 * POSITION - `lineHandle(day, index)` - so it moves the moment a bucket sorts
 * in front of it, and a row keyed on one would hand a half-typed claim for the
 * clinic to the account next door.
 */
export function sheetItems(
  sheet: Readonly<Timesheet>,
  today: number,
): readonly SheetItem[] {
  const editable = editsOffered(sheet);
  const items: SheetItem[] = [];

  for (const day of sheet.days) {
    items.push({
      kind: 'day',
      key: `day:${String(day.day)}`,
      day,
      today: day.day === today,
    });

    for (const [index, line] of day.lines.entries()) {
      items.push({
        kind: 'line',
        key: `line:${String(day.day)}:${line.bucket}`,
        day: day.day,
        handle: lineHandle(day.day, index),
        line,
        editable,
        shape: sheet.shape,
      });
    }

    const rest = unattributedLine(day);

    if (rest !== null) {
      items.push({ kind: 'gap', key: `gap:${String(day.day)}`, day });
    }
  }

  return items;
}

/** Whole minutes, or null for anything that is not a number of them. */
function minutesFrom(said: string): number | null {
  const minutes = Number(said);

  return said.trim().length > 0
    && Number.isSafeInteger(minutes)
    && minutes >= 0
    ? minutes
    : null;
}

export const TIMESHEET_APP: AppDef = {
  id: 'timesheet',
  title: 'Timesheet',
  icon: 'icon-timesheet',
  // The helpdesk tier, and no gate inside the window either - which is the
  // difference between this and the plan surface next door. EVERY tier fills
  // one of these in; the promotion changes its SHAPE, not whether the player
  // has to do it. A sheet that told a service-desk player this was not their
  // work would be a lie about the one piece of admin nobody escapes.
  tier_required: 1,
  slack: false,
  mount: (host, api: GameApi): AppInstance => {
    /**
     * Figures the player is in the middle of typing, by row key.
     *
     * The field cannot simply show the world's number: the world's number is
     * what they are disagreeing with, and a repaint that overwrote a
     * half-typed one every minute would make the row impossible to edit while
     * the clock ran. A draft is dropped the moment its claim goes in, so the
     * field falls back to what the sheet says rather than to what was typed.
     */
    const drafts = new Map<string, string>();
    let outcome: string | null = null;
    let refusal: string | null = null;

    const root = element('section', 'app-page timesheet-app', 'timesheet-app');

    const toolbar = element('div', 'timesheet-toolbar');
    const heading = element('span', 'timesheet-heading');
    heading.textContent = 'Timesheet';
    const stance = element('span', 'timesheet-stance', 'timesheet-stance');
    toolbar.append(heading, stance);

    /* -- the masthead, built once and written into ------------------------ */

    const masthead = element('header', 'timesheet-masthead');
    const mark = element('span', 'timesheet-mark');
    const markIcon = createIcon('icon-timesheet');
    markIcon.classList.add('svg-icon-lg');
    mark.append(markIcon);

    const copy = element('div', 'timesheet-masthead-copy');
    const title = element('h2', 'timesheet-week', 'timesheet-week');
    const stamp = element('p', 'timesheet-stamp', 'timesheet-stamp');
    /**
     * What the business makes of the total (0.30.0, slice 2).
     *
     * A row and not a verdict, and it says so by carrying no colour, no icon
     * and no second sentence: the number, the target, and the arithmetic
     * behind it. Under target is not a state this window has a style for,
     * because being under target is not a state the game does anything about.
     */
    const utilisation = element(
      'p',
      'timesheet-utilisation',
      'timesheet-utilisation',
    );
    copy.append(title, stamp, utilisation);

    const actions = element('div', 'app-action-row timesheet-actions');
    const submit = osButton('Send the sheet in', 'timesheet-submit', {
      primary: true,
    });
    submit.addEventListener('click', () => {
      const result = api.day.submitTimesheet();

      outcome = result.ok
        ? 'Timesheet submitted. What the records say is still on the records, '
          + 'which is the half nobody edits.'
        : null;
      refusal = result.ok ? null : result.reason;
      render();
    });
    actions.append(submit);

    const said = outcomeLine('timesheet-outcome', null);
    const refused = refusalLine('timesheet-refusal', null, null);

    masthead.append(mark, copy, actions, said, refused);

    /* -- the sheet itself ------------------------------------------------- */

    const viewport = element('div', 'timesheet-viewport', 'timesheet-viewport');
    const columns = element('div', 'timesheet-columns');

    for (const label of ['', '', '', 'worked', 'claimed']) {
      const cell = element('span');
      cell.textContent = label;
      columns.append(cell);
    }

    const list = element('div', 'timesheet-rows', 'timesheet-rows');
    viewport.append(columns, list);
    root.append(toolbar, masthead, viewport);

    const empty = element('p', 'timesheet-empty', 'timesheet-empty');
    empty.textContent = 'Nothing on it yet. The week has not started, and a '
      + 'sheet is derived from what you have actually done.';

    /** A day heading with the day's own two totals on it. */
    const dayRow = (): KeyedRow<DayItem, HTMLElement> => {
      const row = element('div', 'timesheet-day');
      const name = element('span', 'timesheet-day-name');
      const totals = element('span', 'timesheet-day-totals');
      row.append(name, totals);

      return {
        element: row,
        update: (item: Readonly<DayItem>): void => {
          row.dataset.testid = `timesheet-day-${String(item.day.day)}`;
          setFlag(row, 'today', String(item.today));
          setText(name, `Day ${String(item.day.day)}${
            item.today ? ' - today' : ''
          }`);
          setText(totals, totalsLine(item.day.derived, item.day.claimed));
        },
      };
    };

    /** The rest of a day, which is only ever a reading. */
    const gapRow = (): KeyedRow<GapItem, HTMLElement> => {
      const row = element('div', 'timesheet-gap');
      const label = element('span', 'timesheet-gap-label');
      label.textContent = 'unattributed';
      const hours = element('span', 'timesheet-gap-hours');
      const note = element('p', 'timesheet-gap-note');
      row.append(label, hours, note);

      return {
        element: row,
        update: (item: Readonly<GapItem>): void => {
          row.dataset.testid = `timesheet-unattributed-${
            String(item.day.day)
          }`;
          setText(hours, hoursLabel(item.day.unattributed));
          setText(note, unattributedLine(item.day) ?? '');
        },
      };
    };

    /**
     * One line of the sheet: what the records say, what you say, what it goes
     * out as, and - on a sheet that is still open, in the shape that has
     * anything to argue about - the two edits.
     */
    const lineRow = (
      seed: Readonly<LineItem>,
    ): KeyedRow<LineItem, HTMLElement> => {
      const row = element('div', 'timesheet-line');
      const handle = element('span', 'timesheet-line-handle');
      const label = element('span', 'timesheet-line-label');
      const flag = element('span', 'timesheet-line-flag');
      const worked = element('span', 'timesheet-line-worked');
      const claimed = element('span', 'timesheet-line-claimed');
      const reads = element('p', 'timesheet-line-reads');
      const edit = element('div', 'timesheet-line-edit');

      const minutes = element(
        'input',
        'os-input timesheet-minutes',
        `timesheet-minutes-${seed.handle}`,
      );
      minutes.type = 'number';
      minutes.min = '0';
      minutes.step = '15';
      minutes.setAttribute('aria-label', 'Minutes to claim on this line');

      const put = osButton(
        'Put it in',
        `timesheet-put-${seed.handle}`,
        { compact: true },
      );
      const detail = element(
        'select',
        'os-select timesheet-detail',
        `timesheet-detail-${seed.handle}`,
      );

      for (const [value, text] of [
        ['detailed', 'Written out in full'],
        ['vague', 'Just "consulting"'],
      ] as const) {
        const option = element('option');
        option.value = value;
        option.textContent = text;
        detail.append(option);
      }

      edit.append(minutes, put, detail);
      row.append(handle, label, flag, worked, claimed, reads);

      // The row's own copy of what it is currently about. The listeners below
      // fire long after `update` last ran, and reaching for the item through
      // this is what stops a click landing on the line that USED to be here.
      let current: LineItem = seed;

      minutes.addEventListener('input', () => {
        drafts.set(current.key, minutes.value);
      });

      put.addEventListener('click', () => {
        const asked = minutesFrom(minutes.value);

        if (asked === null) {
          outcome = null;
          refusal = minutes.value.trim().length === 0
            ? 'Nothing was typed against that line. A line is claimed in '
              + 'whole minutes - 120 is two hours.'
            : `"${minutes.value}" is not a number of minutes. A line is `
              + 'claimed in whole minutes - 120 is two hours.';
          render();
          return;
        }

        const result = api.day.claimTimesheet(current.handle, asked, null);

        if (result.ok) {
          drafts.delete(current.key);
          outcome = asked > current.line.derived
            ? `${current.line.label}: ${hoursLabel(asked)} claimed against ${
              hoursLabel(current.line.derived)
            } worked. The records still say what they said.`
            : `${current.line.label}: ${hoursLabel(asked)} claimed. Under what `
              + 'the records have, or level with it. Nobody queries that.';
          refusal = null;
        } else {
          outcome = null;
          refusal = result.reason;
        }

        render();
      });

      detail.addEventListener('change', () => {
        const wanted = detail.value === 'vague' ? 'vague' : 'detailed';
        const result = api.day.claimTimesheet(current.handle, null, wanted);

        if (result.ok) {
          outcome = wanted === 'vague'
            ? `${current.line.label} now reads "consulting" - quicker to `
              + 'write, and the first thing a finance team picks out of an '
              + 'invoice.'
            : `${current.line.label} carries the date, the estate and the job `
              + 'again. A line that says what was done survives being gone '
              + 'through.';
          refusal = null;
        } else {
          outcome = null;
          refusal = result.reason;
        }

        render();
      });

      return {
        element: row,
        update: (item: Readonly<LineItem>): void => {
          current = item;
          const gap = gapOf(item.line);

          row.dataset.testid = `timesheet-line-${item.handle}`;
          setFlag(row, 'handle', item.handle);
          setFlag(row, 'gap', gap);
          setFlag(row, 'edited', String(item.line.edited));
          setFlag(row, 'detail', item.line.detail);
          setFlag(row, 'billable', String(item.line.billable));
          // The record, as a number a test can act on rather than parse back
          // out of "2h 30m": padding a line means claiming MORE than this, and
          // a walk that had to do arithmetic on a label would be a walk that
          // broke the first time the label got a comma in it.
          setFlag(row, 'worked', String(item.line.derived));

          setText(handle, item.handle);
          setText(label, item.line.label);
          setText(flag, lineFlag(item.line, item.shape));
          worked.dataset.testid = `timesheet-worked-${item.handle}`;
          setText(worked, hoursLabel(item.line.derived));

          // Both numbers only where the player has been in: see `gapOf`.
          claimed.hidden = gap === 'unedited';
          claimed.dataset.testid = `timesheet-claimed-${item.handle}`;
          setText(claimed, gap === 'unedited'
            ? ''
            : hoursLabel(item.line.claimed));

          reads.dataset.testid = `timesheet-reads-${item.handle}`;
          setText(
            reads,
            lineReads(arcWeekOf(api.graph, api.actor), item.day, item.line),
          );

          if (!item.editable) {
            edit.remove();
            return;
          }

          minutes.dataset.testid = `timesheet-minutes-${item.handle}`;
          put.dataset.testid = `timesheet-put-${item.handle}`;
          detail.dataset.testid = `timesheet-detail-${item.handle}`;

          const shown = drafts.get(item.key) ?? String(item.line.claimed);

          // Assigning an identical value to a field the player is standing in
          // puts the caret back at the end of it, so both of these only write
          // when the value has actually moved.
          if (minutes.value !== shown) {
            minutes.value = shown;
          }

          if (detail.value !== item.line.detail) {
            detail.value = item.line.detail;
          }

          if (!row.contains(edit)) {
            row.append(edit);
          }
        },
      };
    };

    /**
     * One row per item, of the kind its key says.
     *
     * The kind is part of the key, so a row is only ever handed items of the
     * kind it was built for - which is what lets each builder take the type it
     * actually draws instead of every row re-narrowing a union it cannot be.
     */
    const rowFor = (
      item: Readonly<SheetItem>,
    ): KeyedRow<SheetItem, HTMLElement> => {
      if (item.kind === 'day') {
        const row = dayRow();

        return {
          element: row.element,
          update: (next) => {
            if (next.kind === 'day') {
              row.update(next);
            }
          },
        };
      }

      if (item.kind === 'gap') {
        const row = gapRow();

        return {
          element: row.element,
          update: (next) => {
            if (next.kind === 'gap') {
              row.update(next);
            }
          },
        };
      }

      const row = lineRow(item);

      return {
        element: row.element,
        update: (next) => {
          if (next.kind === 'line') {
            row.update(next);
          }
        },
      };
    };

    const rows = new KeyedRows<SheetItem, HTMLElement>(
      list,
      (item) => item.key,
      rowFor,
    );

    function render(): void {
      const sheet = api.day.timesheet();
      const today = api.day.day();
      const state = sheetStamp(sheet, today);

      setText(stance, shapeLine(sheet));
      setText(title, sheet.days.length === 0
        ? 'This week'
        : `This week - ${totalsLine(sheet.derived, sheet.claimed)}`);
      setFlag(masthead, 'shape', sheet.shape);
      // No column headings over a sheet with nothing under them.
      columns.hidden = sheet.days.length === 0;
      setFlag(masthead, 'state', state.state);
      setText(stamp, state.line);
      const reading = api.day.timesheetUtilisation();

      setText(utilisation, utilisationLine(reading));
      // Three states, not two (0.39.0): a rung the business asks nothing of is
      // not "met", it is unasked, and a flag that said `met` there would be the
      // window quietly claiming a target this player was never set.
      setFlag(
        masthead,
        'utilisation',
        reading.target === null ? 'unasked' : reading.met ? 'met' : 'under',
      );
      setAvailability(submit, submitRefusal(sheet));
      setText(submit, sheet.submittedAt === null
        ? 'Send the sheet in'
        : 'Sent');

      said.hidden = outcome === null;
      setText(said, outcome ?? '');
      refused.hidden = refusal === null;
      setText(refused, refusal ?? '');

      rows.sync(sheetItems(sheet, today), empty);
    }

    host.replaceChildren(root);
    render();

    // Three reasons the sheet moves and it listens for all three: a minute
    // passing (the line the player is on is one minute longer, which is the
    // half of this window that is a live record), a world change (a claim, a
    // submission, the week ending and filing it for you), and the state being
    // replaced underneath it. The fourth subscription is narrower on purpose:
    // a LOAD is the one moment a half-typed figure belongs to a week that no
    // longer exists, and `onReplaced` fires on ordinary external writes too.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });
    const unsubscribeReload = api.appState.onReloaded(() => {
      drafts.clear();
      outcome = null;
      refusal = null;
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        unsubscribeState();
        unsubscribeReload();
        root.remove();
      },
    };
  },
};
