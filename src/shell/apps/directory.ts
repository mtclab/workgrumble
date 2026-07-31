import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  DISABLED_NEEDS_ENABLING_REASON,
  DISABLED_NOT_LOCKED_REASON,
  EXPIRED_NOT_LOCKED_REASON,
  HELPDESK_ACTIONS,
  NOT_DISABLED_REASON,
  NOT_LOCKED_REASON,
} from '../../world/actions';
import { FIELDS } from '../../world/fields';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, GameApi } from './types';
import {
  definitionRow,
  element,
  type KeyedRow,
  KeyedRows,
  osButton,
  outcomeLine,
  refusalLine,
  resolveSelection,
  setAvailability,
  setFlag,
  setText,
  textValue,
} from './ui';

export function accountKey(id: string): string {
  return id.startsWith('account:') ? id.slice('account:'.length) : id;
}

function ownerOf(
  api: Pick<GameApi, 'graph'>,
  account: Readonly<ReadOnlyGraphNode>,
): ReadOnlyGraphNode | undefined {
  return api.graph.neighbors(account.id, {
    direction: 'in',
    edgeKind: 'owns',
  }).find((node) => node.kind === 'person');
}

function usernameOf(account: Readonly<ReadOnlyGraphNode>): string {
  return textValue(account.fields[FIELDS.username], accountKey(account.id));
}

/**
 * Which of the three it is, in the order a tech has to read them.
 *
 * Disabled first because it beats everything - an account somebody switched
 * off is off whatever else is true of it - then the lockout, then the expiry.
 * The order is the diagnosis: it is what stops "locked" being the answer to
 * every complaint that starts "it will not let me in".
 */
export function statusOf(account: Readonly<ReadOnlyGraphNode>): string {
  if (account.fields[FIELDS.enabled] === false) {
    return 'Disabled';
  }

  if (account.fields[FIELDS.locked] === true) {
    return 'Locked out';
  }

  return account.fields[FIELDS.passwordExpired] === true
    ? 'Password expired'
    : 'Fine';
}

/** A tick a field is holding, or nothing when it holds no such thing. */
function tickField(
  account: Readonly<ReadOnlyGraphNode>,
  field: string,
): number | null {
  const value = account.fields[field];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * One line of the directory, as data.
 *
 * Same rule as the ticket queue: the list is modelled before it is drawn, so a
 * repaint driven by something happening elsewhere in the building can be seen
 * for what it usually is - every one of these values unchanged.
 */
export interface AccountRow {
  readonly id: string;
  readonly key: string;
  readonly username: string;
  readonly owner: string;
  readonly state: string;
  readonly locked: boolean;
  readonly selected: boolean;
}

export function accountRows(
  api: Pick<GameApi, 'graph'>,
  nodes: readonly Readonly<ReadOnlyGraphNode>[],
  selectedId: string | null,
): readonly AccountRow[] {
  return nodes.map((account) => ({
    id: account.id,
    key: accountKey(account.id),
    username: usernameOf(account),
    owner: textValue(
      ownerOf(api, account)?.fields[FIELDS.name],
      'No owner on file',
    ),
    state: statusOf(account).toLowerCase().replace(' ', '-'),
    locked: account.fields[FIELDS.locked] === true,
    selected: account.id === selectedId,
  }));
}

export interface DirectoryGroup {
  readonly id: string;
  readonly name: string;
}

export interface DirectoryView {
  readonly allGroups: readonly Readonly<ReadOnlyGraphNode>[];
  readonly selectedGroupId: string | null;
  readonly outcome: string | null;
  readonly refusal: string | null;
}

/**
 * The account pane, as data.
 *
 * Everything the pane renders is in here and the pane reads NOTHING else,
 * which is what lets the app compare two of these and skip a rebuild. The
 * comparison is the point: this pane holds a group dropdown, and it was being
 * rebuilt on every world change - which, with the meters moving every five
 * minutes of the shift, meant the dropdown shut in the player's hand while
 * they were choosing from it.
 *
 * Nothing here reads the clock. `formatSimTime` is applied to stamps the world
 * wrote down, not to now, so a passing minute cannot move a single field.
 */
export function directoryDetail(
  api: Pick<GameApi, 'graph'>,
  account: Readonly<ReadOnlyGraphNode>,
  view: Readonly<DirectoryView>,
): DirectoryDetail {
  const groups = api.graph.neighbors(account.id, {
    direction: 'out',
    edgeKind: 'member_of',
  });
  const shares = api.graph.neighbors(account.id, {
    direction: 'out',
    edgeKind: 'has_access',
  });
  const owner = ownerOf(api, account);
  const reset = account.fields[FIELDS.passwordResetAt];
  const badPasswords = account.fields[FIELDS.badPwCount];
  const lockedSince = tickField(account, FIELDS.lockedSince);
  const lastLogon = tickField(account, FIELDS.lastLogon);
  const disabled = account.fields[FIELDS.enabled] === false;
  const locked = account.fields[FIELDS.locked] === true;
  const expired = account.fields[FIELDS.passwordExpired] === true;
  const stamp = (tick: number): string => `${formatSimTime(tick).time} (${
    formatSimTime(tick).day
  })`;

  return {
    id: account.id,
    username: usernameOf(account),
    owner: textValue(owner?.fields[FIELDS.name], 'Nobody admits to it'),
    title: textValue(owner?.fields[FIELDS.title], 'Unrecorded'),
    status: statusOf(account),
    state: disabled
      ? 'disabled'
      : locked
        ? 'locked'
        : expired
          ? 'expired'
          : 'fine',
    locked,
    disabled,
    expired,
    badPasswords: typeof badPasswords === 'number'
      ? `${String(badPasswords)} since it was last cleared`
      : 'Not counted on this account',
    lockedSince: lockedSince === null ? 'Not locked' : stamp(lockedSince),
    lastLogon: lastLogon === null
      ? 'Not since before this log starts'
      : stamp(lastLogon),
    mustChange: account.fields[FIELDS.pwMustChange] === true
      ? 'Yes, at next logon. Expect a second ticket about it.'
      : 'No',
    reset: typeof reset === 'number'
      ? formatSimTime(reset).time
      : 'Not this decade',
    groups: groups.length === 0
      ? 'None'
      : groups
        .map((group) => textValue(group.fields[FIELDS.name], group.id))
        .join(', '),
    shares: shares.length === 0
      ? 'None'
      : shares
        .map((share) => textValue(share.fields[FIELDS.name], share.id))
        .join(', '),
    allGroups: view.allGroups.map((group) => ({
      id: group.id,
      name: textValue(group.fields[FIELDS.name], group.id),
    })),
    selectedGroupId: view.selectedGroupId,
    member: groups.some((group) => group.id === view.selectedGroupId),
    outcome: view.outcome,
    refusal: view.refusal,
  };
}

export interface DirectoryDetail {
  readonly id: string;
  readonly username: string;
  readonly owner: string;
  readonly title: string;
  readonly status: string;
  readonly state: string;
  readonly locked: boolean;
  readonly disabled: boolean;
  readonly expired: boolean;
  readonly badPasswords: string;
  readonly lockedSince: string;
  readonly lastLogon: string;
  readonly mustChange: string;
  readonly reset: string;
  readonly groups: string;
  readonly shares: string;
  readonly allGroups: readonly DirectoryGroup[];
  readonly selectedGroupId: string | null;
  readonly member: boolean;
  readonly outcome: string | null;
  readonly refusal: string | null;
}

/**
 * "Active Dictionary" - the directory caricature. Everything on screen is read
 * live from the graph, and every button dispatches a registered action, so a
 * fix made here is the same fix the terminal makes.
 */
export const DIRECTORY_APP: AppDef = {
  id: 'directory',
  title: 'Active Dictionary',
  icon: 'icon-directory',
  tier_required: 1,
  slack: false,
  mount: (host, api) => {
    let selectedId: string | null = null;
    let selectedGroupId: string | null = null;
    let refusal: string | null = null;
    let outcome: string | null = null;
    let query = '';

    const root = element('section', 'app-page directory-app', 'directory-app');

    const toolbar = element('div', 'directory-toolbar');
    const searchLabel = element('label', 'directory-search-label');
    const searchText = element('span');
    searchText.textContent = 'Find';
    const search = element('input', 'directory-search', 'directory-search');
    search.type = 'search';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.placeholder = 'name or username';
    search.setAttribute('aria-label', 'Search accounts');
    searchLabel.append(searchText, search);
    const count = element('span', 'directory-count', 'directory-count');
    toolbar.append(searchLabel, count);

    const list = element('ul', 'directory-list', 'directory-list');
    const detail = element('section', 'directory-detail', 'directory-detail');
    const columns = element('div', 'directory-columns');
    columns.append(list, detail);
    root.append(toolbar, columns);

    const accounts = (): readonly ReadOnlyGraphNode[] => {
      const needle = query.trim().toLowerCase();

      return api.graph.nodesOfKind('account').filter((account) => {
        if (needle.length === 0) {
          return true;
        }

        const owner = ownerOf(api, account);
        const haystack = [
          usernameOf(account),
          textValue(owner?.fields[FIELDS.name], ''),
        ].join(' ').toLowerCase();

        return haystack.includes(needle);
      });
    };

    const run = (
      action: string,
      target: string,
      params: Record<string, string> = {},
      success = 'Done.',
    ): void => {
      const result = api.dispatch(action, api.actor, target, params);
      refusal = result.ok ? null : result.reason;
      outcome = result.ok ? success : null;
      render();
    };

    const emptyRow = element('li', 'directory-empty', 'directory-empty');
    emptyRow.textContent = 'Nobody matches that. Try fewer letters, or try '
      + 'the name they actually use.';

    const createRow = (
      first: Readonly<AccountRow>,
    ): KeyedRow<AccountRow, HTMLLIElement> => {
      const id = first.id;
      const item = element('li');
      const row = element('button', 'directory-row', `directory-row-${first.key}`);
      row.type = 'button';

      const name = element('strong');
      const owner = element('span', 'directory-row-owner');
      const lock = createIcon('icon-lock');
      lock.classList.add('directory-row-lock');
      row.append(name, owner, lock);

      row.addEventListener('click', () => {
        selectedId = id;
        refusal = null;
        outcome = null;
        render();
      });
      item.append(row);

      return {
        element: item,
        update: (next: Readonly<AccountRow>): void => {
          setFlag(row, 'selected', String(next.selected));
          setFlag(row, 'locked', String(next.locked));
          // The row says WHICH fault, because a list where every unhappy
          // account looks the same is a list that teaches "click unlock and
          // see".
          setFlag(row, 'state', next.state);
          setText(name, next.username);
          setText(owner, next.owner);
          lock.style.display = next.locked ? '' : 'none';
        },
      };
    };

    const rows = new KeyedRows<AccountRow, HTMLLIElement>(
      list,
      (model) => model.id,
      createRow,
    );

    const renderList = (nodes: readonly ReadOnlyGraphNode[]): void => {
      count.textContent = `${String(nodes.length)} accounts`;
      rows.sync(accountRows(api, nodes, selectedId), emptyRow);
    };

    /**
     * The pane is rebuilt only when what it SAYS has changed.
     *
     * It is built from the model above and from nothing else, which is what
     * makes the signature honest: a fact this pane can show and the signature
     * cannot see would be a fact that stops updating. The rebuild itself is
     * unavoidable - the pane is a form, not a row - so the answer is to do it
     * rarely rather than to do it cheaply.
     */
    let painted: string | null = null;

    const renderDetail = (model: DirectoryDetail | null): void => {
      const signature = JSON.stringify(model);

      if (signature === painted) {
        return;
      }

      painted = signature;
      detail.replaceChildren();

      if (model === null) {
        const empty = element(
          'p',
          'directory-placeholder',
          'directory-detail-empty',
        );
        empty.textContent = 'Pick an account to see what is actually wrong '
          + 'with it, as opposed to what was reported.';
        detail.append(empty);
        return;
      }

      const username = model.username;
      const heading = element('h2', undefined, 'directory-detail-username');
      heading.textContent = username;

      const facts = element('dl', 'directory-facts');
      definitionRow(facts, 'Owner', 'directory-detail-owner')
        .textContent = model.owner;
      definitionRow(facts, 'Job title', 'directory-detail-title')
        .textContent = model.title;
      const statusRow = definitionRow(
        facts,
        'Status',
        'directory-detail-status',
      );
      statusRow.textContent = model.status;
      statusRow.dataset.state = model.state;
      // The lockout trail, which is what turns an unlock from a button press
      // into a read: how many wrong passwords, when the door shut, and whether
      // this account is even in use.
      definitionRow(facts, 'Bad passwords', 'directory-detail-bad-passwords')
        .textContent = model.badPasswords;
      definitionRow(facts, 'Locked since', 'directory-detail-locked-since')
        .textContent = model.lockedSince;
      definitionRow(facts, 'Last logon', 'directory-detail-last-logon')
        .textContent = model.lastLogon;
      definitionRow(facts, 'Must change password', 'directory-detail-must-change')
        .textContent = model.mustChange;
      definitionRow(facts, 'Password reset', 'directory-detail-reset')
        .textContent = model.reset;
      definitionRow(facts, 'Groups', 'directory-detail-groups')
        .textContent = model.groups;
      definitionRow(facts, 'Shares', 'directory-detail-shares')
        .textContent = model.shares;

      detail.append(heading, facts);

      const actions = element('div', 'app-action-row');
      const unlock = osButton('Unlock account', 'directory-unlock', {
        primary: true,
      });
      setAvailability(
        unlock,
        model.disabled
          ? DISABLED_NOT_LOCKED_REASON.replace('{target.label}', username)
          : model.locked
            ? null
            : model.expired
              ? EXPIRED_NOT_LOCKED_REASON.replace('{target.label}', username)
              : NOT_LOCKED_REASON.replace('{target.label}', username),
      );
      unlock.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountUnlock,
          model.id,
          {},
          `Unlocked ${username}. They are logging in already and they will `
            + 'not say thank you.',
        );
      });

      const resetPassword = osButton(
        'Reset password',
        'directory-reset-password',
      );
      setAvailability(
        resetPassword,
        model.disabled
          ? DISABLED_NEEDS_ENABLING_REASON.replace('{target.label}', username)
          : null,
      );
      resetPassword.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountResetPassword,
          model.id,
          {},
          'Temporary password issued, the lockout cleared with it, and they '
            + 'must change it at next logon. It will be on a sticky note by '
            + 'lunchtime.',
        );
      });

      // The third fix, for the third fault. It is its own button because it
      // is its own decision: somebody switched that account off on purpose.
      const enable = osButton('Enable account', 'directory-enable');
      setAvailability(
        enable,
        model.disabled
          ? null
          : NOT_DISABLED_REASON.replace('{target.label}', username),
      );
      enable.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountEnable,
          model.id,
          {},
          `Enabled ${username}. Whoever disabled it had a reason, and it is `
            + 'now your name in the log next to putting it back.',
        );
      });

      actions.append(unlock, resetPassword, enable);
      detail.append(actions);

      const groupRow = element('div', 'directory-group-row');
      const picker = element(
        'select',
        'directory-group-picker',
        'directory-group-picker',
      );
      picker.setAttribute('aria-label', 'Group');

      for (const group of model.allGroups) {
        const option = element('option');
        option.value = group.id;
        option.textContent = group.name;
        picker.append(option);
      }

      if (model.selectedGroupId !== null) {
        picker.value = model.selectedGroupId;
      }

      picker.addEventListener('change', () => {
        selectedGroupId = picker.value;
        // Repaint: the add/remove buttons describe THIS group, so their
        // availability and their refusal reasons have to move with it.
        render();
      });

      const member = model.member;
      const addGroup = osButton('Add to group', 'directory-add-group');
      const removeGroup = osButton(
        'Remove from group',
        'directory-remove-group',
      );
      setAvailability(
        addGroup,
        model.selectedGroupId === null
          ? 'There are no groups in this directory yet.'
          : member
            ? 'Already a member of that group. Adding them twice is not how '
              + 'permissions work.'
            : null,
      );
      setAvailability(
        removeGroup,
        model.selectedGroupId === null
          ? 'There are no groups in this directory yet.'
          : member
            ? null
            : 'They were never in that group, so there is nothing to take '
              + 'away.',
      );
      addGroup.addEventListener('click', () => {
        if (selectedGroupId !== null) {
          run(
            HELPDESK_ACTIONS.accountAddToGroup,
            model.id,
            { group: selectedGroupId },
            'Group membership added. It will apply at next logon, which is a '
              + 'sentence that has ended many conversations.',
          );
        }
      });
      removeGroup.addEventListener('click', () => {
        if (selectedGroupId !== null) {
          run(
            HELPDESK_ACTIONS.accountRemoveFromGroup,
            model.id,
            { group: selectedGroupId },
            'Group membership removed. Somebody will notice in about a week.',
          );
        }
      });

      groupRow.append(picker, addGroup, removeGroup);
      detail.append(groupRow);

      detail.append(
        outcomeLine('directory-outcome', model.outcome),
        refusalLine('directory-refusal', model.refusal, createIcon('icon-lock')),
      );
    };

    const render = (): void => {
      const nodes = accounts();
      // The selection has to follow the LIST, not the graph: an account the
      // search has filtered out still exists, and a detail pane with live
      // buttons aimed at somebody the player cannot see is how a password
      // gets reset for the wrong person.
      const selection = resolveSelection(nodes, selectedId);

      if (selection.changed) {
        selectedId = selection.id;
        refusal = null;
        outcome = null;
      }

      // The group the picker is standing on, resolved before the pane is
      // modelled: a group that has gone takes the selection with it, and the
      // model is a description rather than a decision.
      const allGroups = api.graph.nodesOfKind('group');

      if (
        selectedGroupId === null
        || !allGroups.some((group) => group.id === selectedGroupId)
      ) {
        selectedGroupId = allGroups[0]?.id ?? null;
      }

      const focusedTestId = document.activeElement instanceof HTMLElement
        && root.contains(document.activeElement)
        ? document.activeElement.dataset.testid ?? null
        : null;

      const account = nodes.find((candidate) => candidate.id === selectedId);
      renderList(nodes);
      renderDetail(account === undefined ? null : directoryDetail(api, account, {
        allGroups,
        selectedGroupId,
        outcome,
        refusal,
      }));

      if (focusedTestId !== null && focusedTestId !== 'directory-search') {
        const restored = root.querySelector(
          `[data-testid="${focusedTestId}"]`,
        );

        if (restored instanceof HTMLElement) {
          restored.focus();
        }
      }
    };

    // The search box is never rebuilt, so typing in it survives every repaint
    // the simulation triggers underneath.
    search.addEventListener('input', () => {
      query = search.value;
      render();
    });

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
