import type {
  ProjectPhaseRow,
  ProjectPlanView,
  ProjectRuleRow,
  ProjectTaskRow,
} from '../day-driver';
import { AUDIT_SOURCES, FIELDS, isSystemsEngineer } from '../../world/fields';
import { type ProjectPhase, projectClockLabel } from '../../world/project';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  element,
  formatDuration,
  osButton,
  setAvailability,
  withFocusRestored,
} from './ui';

/**
 * Projects (E10, 0.29.0): the plan surface.
 *
 * The queue is the other window: one fault, one clock, close it and it is
 * gone. This one is the work that arrives with DATES on it - four phases, a
 * change window in the middle of them, and three working days that were baked
 * the morning the job was handed over. It is read-mostly in the `monitor.ts`
 * sense: the verbs live where the work does (the terminal's `fw`, and the task
 * tickets in the queue), and what this window owns is the one thing neither of
 * those can show - the shape of the plan against the clock.
 *
 * THE DESIGN JOB, which the research says decides whether the mechanic is fun:
 * a date three days out has to be legible at a glance, and slipping has to be
 * visible BEFORE it is fatal. Three things do that work here, and none of them
 * is a colour on its own:
 *
 *  - every phase carries its DATE and the working time to it in the same row -
 *    "Day 2 15:00" answers "when", "4h 20m of working time" answers "how much
 *    afternoon is that", and the second one is the half a human can act on;
 *  - the count is SIGNED and the row says which side of the date it is on, so
 *    a slip reads as "1h 05m past its date" rather than as a number that has
 *    quietly stopped counting down;
 *  - between the two there is a TIGHT state, at an hour of working time left,
 *    which is the whole of "before it is fatal": the warning arrives while
 *    there is still a phase's worth of day to fix it in, not at the deadline.
 *
 * Everything drawn here comes from `day.projectPlan()` - one read, assembled by
 * the driver off the world's own derivation. This file holds no gate, no date
 * arithmetic and no reach into the graph beyond the player's own tier, so the
 * board and `fw status` cannot come to different conclusions about a phase.
 */

/** What the phase is, in the words somebody doing it would use. */
const PHASE_BLURBS: Readonly<Record<ProjectPhase, string>> = {
  audit: 'Establish what the old box is actually doing. There is a handover '
    + 'pack on the desk, written by the contractor who installed it; the pack '
    + 'is a record of what somebody meant to configure in 2019, and the box is '
    + 'what is running this morning. Either one closes the task.',
  staging: 'Carry the rule set onto the new box, one rule at a time, in the '
    + 'order it goes in. Nothing here is live for anybody until the circuit '
    + 'moves - which is what makes it the phase worth being slow in.',
  cutover: 'Two minutes of downtime and the plant is behind the new box. It '
    + 'goes inside a window their own IT signs off, and it is refused outside '
    + 'one. The old box stays racked: the cable goes back the way it came.',
  scream_test: 'The night after, and the part every project drops. Whatever '
    + 'the audit missed rings in the morning; carry it over, then write the '
    + 'as-built down, because the next engineer here pays for the discovery '
    + 'twice otherwise.',
  handover: 'Signed off. Nothing left on the old box.',
};

/** The phase-state chip, in the words a board uses. */
const STATE_LABELS: Readonly<Record<ProjectPhaseRow['state'], string>> = {
  done: 'DONE',
  now: 'NOW',
  ahead: 'TO DO',
};

/**
 * An hour of working time: the point at which a phase stops being "later" and
 * starts being today's problem.
 *
 * One shift is eight of these, so an hour left is the last eighth of a day to
 * do something in - late enough to mean it, early enough to still be a warning
 * rather than a verdict.
 */
const TIGHT_MINUTES = 60;

/**
 * How much of somebody's afternoon a date is, said either side of it.
 *
 * The four mapping functions below are exported for the same reason the
 * monitoring board's two verbs are: there is no DOM in the offline suite, so
 * `projects.test.ts` drives THESE against a real driven world rather than a
 * copy of them, and a wrong reading of a late phase or a locked task goes red
 * where it is written.
 */
export function slackLine(row: Readonly<ProjectPhaseRow>): string {
  if (row.due === null) {
    return '';
  }

  if (row.state === 'done') {
    return 'Done.';
  }

  return row.minutesLeft < 0
    ? `${formatDuration(-row.minutesLeft)} past its date`
    : `${formatDuration(row.minutesLeft)} of working time`;
}

/** `ahead`, `tight` or `late`: what the row is styled and read by. */
export function slipOf(row: Readonly<ProjectPhaseRow>): string {
  if (row.state === 'done') {
    return 'done';
  }

  if (row.late) {
    return 'late';
  }

  return row.minutesLeft <= TIGHT_MINUTES ? 'tight' : 'ahead';
}

/** Where a task has got to, in words rather than in a state machine's. */
export function taskLine(task: Readonly<ProjectTaskRow>): string {
  if (!task.arrived) {
    return 'Not yet raised. It arrives when the task before it closes.';
  }

  switch (task.state) {
    case 'resolved':
      return 'Closed.';
    case 'breached':
      return 'On the desk, and past its date.';
    case 'waiting_on_user':
      return 'On the desk, parked on somebody else.';
    default:
      return 'On the desk.';
  }
}

/**
 * Why nothing can happen this minute, said in words.
 *
 * Only the cutover has one, and both answers are worth a sentence: waiting on
 * a window is the honest state of a project that is ready and may not move,
 * and being INSIDE one is the forty minutes the whole phase was arranged for.
 */
export function blockedLine(view: Readonly<ProjectPlanView>): string | null {
  switch (view.status.blocked) {
    case 'awaiting_change_window':
      return 'Waiting on a change window. The work is ready and the paperwork '
        + 'decides when it happens - file the change against the new box, let '
        + 'their IT sign it off, and cut over inside the slot.';
    case 'in_change_window':
      return 'Inside the change window. This is the slot: the circuit can move '
        + 'now, and when it shuts it shuts.';
    default:
      return null;
  }
}

/** One rule of the set, as the staging phase thinks of it. */
function renderRule(rule: Readonly<ProjectRuleRow>): HTMLElement {
  const item = element('li', 'projects-rule', `projects-rule-${rule.short}`);
  item.dataset.migrated = String(rule.migrated);

  const head = element('div', 'projects-rule-head');
  const short = element('strong', 'projects-rule-short');
  short.textContent = rule.short;
  const where = element('span', 'projects-rule-where');
  where.textContent = rule.migrated
    ? 'carried'
    : 'on the old box only';
  const source = element('span', 'projects-rule-source');
  // Where this rule came from - and it only ever says "found on the box" for a
  // rule a live-config audit turned up, because a rule nobody has found is not
  // on this list at all.
  source.textContent = rule.documented
    ? 'in the pack'
    : 'found on the box';
  head.append(short, where, source);

  const label = element('p', 'projects-rule-label');
  label.textContent = rule.label;

  item.append(head, label);
  return item;
}

export const PROJECTS_APP: AppDef = {
  id: 'projects',
  title: 'Projects',
  icon: 'icon-projects',
  // The helpdesk tier, like every other tool - and then the ENGINEER gate is
  // said inside the window, which is the shipped pattern for an app rather
  // than a verb. Display Properties keeps it: the tier decides what the window
  // can DO, and the window is where a player is told so, because a tool nobody
  // can find is a tool that teaches nobody why they cannot have it. The
  // manifest's number cannot express the promotion in any case - it is the
  // hired/not-hired axis, and the PAM tier is a field on the player.
  tier_required: 1,
  slack: false,
  mount: (host, api: GameApi): AppInstance => {
    /**
     * The phase whose detail is open, once the player has picked one.
     *
     * Null means "wherever the project is", which is the right answer on every
     * paint until somebody says otherwise: a board that opened on the audit
     * for the rest of the week would make the player re-pick the present every
     * time they looked at it.
     */
    let picked: ProjectPhase | null = null;

    const root = element('section', 'app-page projects-app', 'projects-app');

    const toolbar = element('div', 'projects-toolbar');
    const heading = element('span', 'projects-heading');
    heading.textContent = 'Projects';
    const stance = element('span', 'projects-stance', 'projects-stance');
    stance.textContent = 'Planned work, with dates on it. The plan is here; '
      + 'the work is tickets, like everything else.';
    toolbar.append(heading, stance);

    const viewport = element('div', 'projects-viewport', 'projects-viewport');
    root.append(toolbar, viewport);

    /** The window with nothing in it, which is two different sentences. */
    const renderEmpty = (): HTMLElement => {
      const empty = element('div', 'projects-empty', 'projects-empty');
      const engineer = isSystemsEngineer(
        api.graph.getField(api.actor, FIELDS.playerTier),
      );

      const line = element('p', 'projects-empty-line');
      line.textContent = engineer
        ? 'No project is running. A project is assigned rather than picked up '
          + '- three working days have to fit in the week before anybody hands '
          + 'one over - and when there is one, this is the plan against the '
          + 'clock.'
        : 'This is not service-desk work. Projects are the engineers\' tier: '
          + 'planned work with dates on it and a change window in the middle. '
          + 'It arrives with the promotion, along with ssh.';
      empty.append(line);
      return empty;
    };

    /** The masthead: what the job is, and where it has got to this minute. */
    const renderHeader = (view: Readonly<ProjectPlanView>): HTMLElement => {
      const header = element('header', 'projects-masthead');

      const mark = element('span', 'projects-mark');
      const markIcon = createIcon('icon-projects');
      markIcon.classList.add('svg-icon-lg');
      mark.append(markIcon);

      const group = element('div', 'projects-masthead-copy');
      const title = element('h2', 'projects-name', 'projects-name');
      title.textContent = view.name;
      const customer = element('p', 'projects-customer', 'projects-customer');
      customer.textContent = view.customer === ''
        ? 'The delivery row and its four tasks are in the queue.'
        : `${view.customer} · the delivery row and its four tasks are in the `
          + 'queue.';
      group.append(title, customer);
      header.append(mark, group);

      const now = element('p', 'projects-now', 'projects-now');
      now.dataset.phase = view.status.phase;
      now.dataset.late = String(view.status.late);
      now.textContent = view.status.complete
        ? 'Signed off. Nothing left on the old box.'
        : `Now: ${
          view.phases.find((row) => row.state === 'now')?.label
            ?? view.status.phase
        }${view.status.late ? ' - past its date' : ''}`;
      header.append(now);

      const blocked = blockedLine(view);

      if (blocked !== null) {
        const line = element('p', 'projects-blocked', 'projects-blocked');
        line.dataset.blocked = view.status.blocked ?? 'none';
        line.append(createIcon('icon-day'), (() => {
          const copy = element('span');
          copy.textContent = blocked;
          return copy;
        })());
        header.append(line);
      }

      // The two stamps: the minute the cable moved, and the minute it moved
      // back. They appear once they exist and never come off - a rollback is
      // not an undo, and the board is the place that says so.
      const stamps = element('p', 'projects-stamps', 'projects-stamps');
      const said: string[] = [];

      if (view.status.cutoverAt !== null) {
        said.push(`Cut over at ${projectClockLabel(view.status.cutoverAt)}.`);
      }

      if (view.status.rolledBackAt !== null) {
        said.push(
          `Rolled back at ${projectClockLabel(view.status.rolledBackAt)} - the `
          + 'window was spent, and what it raised stands.',
        );
      }

      stamps.textContent = said.join(' ');
      stamps.hidden = said.length === 0;
      header.append(stamps);

      return header;
    };

    /** One phase, as a row of the plan you can stand on. */
    const renderPhaseRow = (
      row: Readonly<ProjectPhaseRow>,
      selected: ProjectPhase,
      repaint: () => void,
    ): HTMLElement => {
      const item = element('li', 'projects-phase-row');
      const button = element(
        'button',
        'projects-phase',
        `projects-phase-${row.phase}`,
      );
      button.type = 'button';
      button.dataset.state = row.state;
      button.dataset.slip = slipOf(row);
      button.dataset.selected = String(row.phase === selected);
      button.setAttribute('aria-pressed', String(row.phase === selected));

      const chip = element(
        'span',
        'projects-phase-chip',
        `projects-phase-state-${row.phase}`,
      );
      chip.dataset.state = row.state;
      chip.textContent = STATE_LABELS[row.state];

      const label = element('span', 'projects-phase-label');
      label.textContent = row.label;

      const due = element(
        'span',
        'projects-phase-due',
        `projects-phase-due-${row.phase}`,
      );
      due.textContent = row.dueLabel;

      const slack = element(
        'span',
        'projects-phase-slack',
        `projects-phase-slack-${row.phase}`,
      );
      slack.dataset.slip = slipOf(row);
      slack.textContent = slackLine(row);

      button.append(chip, label, due, slack);
      button.addEventListener('click', () => {
        picked = row.phase;
        repaint();
      });

      item.append(button);
      return item;
    };

    /** The pane: what this phase is, when it is due, and its ticket. */
    const renderDetail = (row: Readonly<ProjectPhaseRow>): HTMLElement => {
      const pane = element('section', 'projects-detail', 'projects-detail');
      pane.dataset.phase = row.phase;
      pane.dataset.state = row.state;

      const title = element('h3', 'projects-detail-name');
      title.textContent = row.label;

      const when = element(
        'p',
        'projects-detail-when',
        'projects-detail-when',
      );
      when.dataset.slip = slipOf(row);
      when.textContent = row.dueLabel === ''
        ? 'No date of its own.'
        : row.state === 'done'
          ? `Was due ${row.dueLabel}. Done.`
          : row.minutesLeft < 0
            ? `Due ${row.dueLabel} - ${formatDuration(-row.minutesLeft)} ago.`
            : `Due ${row.dueLabel} - ${formatDuration(row.minutesLeft)} of `
              + 'working time from now.';

      const blurb = element('p', 'projects-detail-blurb');
      blurb.textContent = PHASE_BLURBS[row.phase];

      pane.append(title, when, blurb);

      if (row.task !== null) {
        pane.append(renderTask(row.task));
      }

      return pane;
    };

    /** The task row: its state, and the way into the ticket itself. */
    const renderTask = (task: Readonly<ProjectTaskRow>): HTMLElement => {
      const panel = element('div', 'projects-task', 'projects-task');
      panel.dataset.arrived = String(task.arrived);
      panel.dataset.state = task.state ?? 'locked';

      const title = element('p', 'projects-task-title', 'projects-task-title');
      title.textContent = task.title;

      const state = element('p', 'projects-task-state', 'projects-task-state');
      state.textContent = taskLine(task);

      const actions = element('div', 'app-action-row');
      const open = osButton(
        'Open the ticket',
        `projects-open-task-${key(task.id)}`,
        { compact: true },
      );
      setAvailability(
        open,
        task.arrived
          ? null
          // Not a dead row and not a refusal either: the ticket does not exist
          // yet, and saying which one it is waiting on is the whole of what a
          // milestone lock has to communicate.
          : 'This task has not been raised. Project tasks arrive as the one '
            + 'before them closes - that is the milestone, and it is why there '
            + 'is nothing here to open.',
      );
      // The work itself is a ticket like every other ticket, so this is a link
      // rather than a verb: the queue opens AT the row, and nothing about the
      // world changes on the way there.
      open.addEventListener('click', () => {
        api.openApp('tickets', { kind: 'queue-ticket', id: task.id });
      });
      actions.append(open);

      panel.append(title, state, actions);
      return panel;
    };

    /** What anybody knows about the rule set, which is the pack-vs-box beat. */
    const renderRules = (view: Readonly<ProjectPlanView>): HTMLElement => {
      const panel = element('section', 'projects-rules', 'projects-rules');
      panel.dataset.source = view.ruleSource ?? 'none';

      const title = element('h3', 'projects-rules-name');
      title.textContent = 'The rule set';

      const source = element(
        'p',
        'projects-rules-source',
        'projects-rules-source',
      );
      source.textContent = view.ruleSource === AUDIT_SOURCES.config
        ? `Read off the box: ${String(view.rules.length)} rule(s), which is `
          + 'what is actually running on it.'
        : view.ruleSource === AUDIT_SOURCES.pack
          ? `Per the handover pack: ${String(view.rules.length)} rule(s), as `
            + 'written down in 2019. The audit was signed off on the pack, so '
            + 'this is the list the job is being done against.'
          : `From the handover pack: ${String(view.rules.length)} rule(s), `
            + 'as written down in 2019. Nobody has read the box yet.';

      const list = element('ul', 'projects-rules-list', 'projects-rules-list');

      for (const rule of view.rules) {
        list.append(renderRule(rule));
      }

      panel.append(title, source, list);
      return panel;
    };

    const render = (): void => {
      withFocusRestored(root, () => {
        const view = api.day.projectPlan();

        if (view === null) {
          viewport.replaceChildren(renderEmpty());
          return;
        }

        // "Wherever the project is" until the player picks, and the sign-off
        // has no row of its own - a finished project opens on the last phase
        // there was something to do in.
        const live = view.phases.find((row) => row.state === 'now')?.phase
          ?? view.phases[view.phases.length - 1]?.phase
          ?? 'audit';
        const selected = picked ?? live;

        const board = element('div', 'projects-board');
        const plan = element('ul', 'projects-phases', 'projects-phases');

        for (const row of view.phases) {
          plan.append(renderPhaseRow(row, selected, render));
        }

        const shown = view.phases.find((row) => row.phase === selected)
          ?? view.phases[0];

        board.append(renderHeader(view), plan);

        if (shown !== undefined) {
          board.append(renderDetail(shown));
        }

        board.append(renderRules(view));
        viewport.replaceChildren(board);
      });
    };

    host.replaceChildren(root);
    render();

    // Three reasons this board moves, and it listens for all three: a minute
    // passing (every countdown on it is a minute older, which is the whole
    // point of the surface), a world change (a rule carried, a cable moved, a
    // task closing and the next one arriving), and a save being loaded under
    // it. A wholesale repaint is honest here in a way it would not be in the
    // queue: there is nothing on this window to type into and nothing half
    // entered to lose, only four buttons - and the keyboard is put back on the
    // one it was standing on.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        unsubscribeState();
        root.remove();
      },
    };
  },
};

/** A ticket id as a test id's tail: `ticket:arden-fw-audit` -> `arden-fw-audit`. */
function key(id: string): string {
  return id.startsWith('ticket:') ? id.slice('ticket:'.length) : id;
}
