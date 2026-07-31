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
  osButton,
  outcomeLine,
  refusalLine,
  resolveSelection,
  setAvailability,
  textValue,
} from './ui';

export function accountKey(id: string): string {
  return id.startsWith('account:') ? id.slice('account:'.length) : id;
}

function ownerOf(
  api: GameApi,
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

    const renderList = (nodes: readonly ReadOnlyGraphNode[]): void => {
      list.replaceChildren();
      count.textContent = `${String(nodes.length)} accounts`;

      for (const account of nodes) {
        const item = element('li');
        const row = element(
          'button',
          'directory-row',
          `directory-row-${accountKey(account.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(account.id === selectedId);
        row.dataset.locked = String(account.fields[FIELDS.locked] === true);
        // The row says WHICH fault, because a list where every unhappy account
        // looks the same is a list that teaches "click unlock and see".
        row.dataset.state = statusOf(account).toLowerCase().replace(' ', '-');

        const name = element('strong');
        name.textContent = usernameOf(account);
        const owner = element('span', 'directory-row-owner');
        owner.textContent = textValue(
          ownerOf(api, account)?.fields[FIELDS.name],
          'No owner on file',
        );
        row.append(name, owner);

        if (account.fields[FIELDS.locked] === true) {
          const lock = createIcon('icon-lock');
          lock.classList.add('directory-row-lock');
          row.append(lock);
        }

        row.addEventListener('click', () => {
          selectedId = account.id;
          refusal = null;
          outcome = null;
          render();
        });
        item.append(row);
        list.append(item);
      }

      if (nodes.length === 0) {
        const empty = element('li', 'directory-empty', 'directory-empty');
        empty.textContent = 'Nobody matches that. Try fewer letters, or try '
          + 'the name they actually use.';
        list.append(empty);
      }
    };

    const renderDetail = (
      account: ReadOnlyGraphNode | undefined,
    ): void => {
      detail.replaceChildren();

      if (account === undefined) {
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

      const groups = api.graph.neighbors(account.id, {
        direction: 'out',
        edgeKind: 'member_of',
      });
      const shares = api.graph.neighbors(account.id, {
        direction: 'out',
        edgeKind: 'has_access',
      });
      const locked = account.fields[FIELDS.locked] === true;
      const disabled = account.fields[FIELDS.enabled] === false;
      const expired = account.fields[FIELDS.passwordExpired] === true;
      const reset = account.fields[FIELDS.passwordResetAt];
      const badPasswords = account.fields[FIELDS.badPwCount];
      const lockedSince = tickField(account, FIELDS.lockedSince);
      const lastLogon = tickField(account, FIELDS.lastLogon);

      const username = usernameOf(account);
      const heading = element('h2', undefined, 'directory-detail-username');
      heading.textContent = username;

      const facts = element('dl', 'directory-facts');
      definitionRow(facts, 'Owner', 'directory-detail-owner').textContent = textValue(
        ownerOf(api, account)?.fields[FIELDS.name],
        'Nobody admits to it',
      );
      definitionRow(facts, 'Job title', 'directory-detail-title').textContent = textValue(
        ownerOf(api, account)?.fields[FIELDS.title],
        'Unrecorded',
      );
      const statusRow = definitionRow(
        facts,
        'Status',
        'directory-detail-status',
      );
      statusRow.textContent = statusOf(account);
      statusRow.dataset.state = disabled
        ? 'disabled'
        : locked
          ? 'locked'
          : expired
            ? 'expired'
            : 'fine';
      // The lockout trail, which is what turns an unlock from a button press
      // into a read: how many wrong passwords, when the door shut, and whether
      // this account is even in use.
      definitionRow(facts, 'Bad passwords', 'directory-detail-bad-passwords')
        .textContent = typeof badPasswords === 'number'
          ? `${String(badPasswords)} since it was last cleared`
          : 'Not counted on this account';
      definitionRow(facts, 'Locked since', 'directory-detail-locked-since')
        .textContent = lockedSince === null
          ? 'Not locked'
          : `${formatSimTime(lockedSince).time} (${
            formatSimTime(lockedSince).day
          })`;
      definitionRow(facts, 'Last logon', 'directory-detail-last-logon')
        .textContent = lastLogon === null
          ? 'Not since before this log starts'
          : `${formatSimTime(lastLogon).time} (${
            formatSimTime(lastLogon).day
          })`;
      definitionRow(facts, 'Must change password', 'directory-detail-must-change')
        .textContent = account.fields[FIELDS.pwMustChange] === true
          ? 'Yes, at next logon. Expect a second ticket about it.'
          : 'No';
      definitionRow(facts, 'Password reset', 'directory-detail-reset')
        .textContent = typeof reset === 'number'
          ? formatSimTime(reset).time
          : 'Not this decade';
      definitionRow(facts, 'Groups', 'directory-detail-groups').textContent = groups.length === 0
        ? 'None'
        : groups
          .map((group) => textValue(group.fields[FIELDS.name], group.id))
          .join(', ');
      definitionRow(facts, 'Shares', 'directory-detail-shares').textContent = shares.length === 0
        ? 'None'
        : shares
          .map((share) => textValue(share.fields[FIELDS.name], share.id))
          .join(', ');

      detail.append(heading, facts);

      const actions = element('div', 'app-action-row');
      const unlock = osButton('Unlock account', 'directory-unlock', {
        primary: true,
      });
      setAvailability(
        unlock,
        disabled
          ? DISABLED_NOT_LOCKED_REASON.replace('{target.label}', username)
          : locked
            ? null
            : expired
              ? EXPIRED_NOT_LOCKED_REASON.replace('{target.label}', username)
              : NOT_LOCKED_REASON.replace('{target.label}', username),
      );
      unlock.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountUnlock,
          account.id,
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
        disabled
          ? DISABLED_NEEDS_ENABLING_REASON.replace('{target.label}', username)
          : null,
      );
      resetPassword.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountResetPassword,
          account.id,
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
        disabled
          ? null
          : NOT_DISABLED_REASON.replace('{target.label}', username),
      );
      enable.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountEnable,
          account.id,
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
      const allGroups = api.graph.nodesOfKind('group');

      for (const group of allGroups) {
        const option = element('option');
        option.value = group.id;
        option.textContent = textValue(group.fields[FIELDS.name], group.id);
        picker.append(option);
      }

      if (
        selectedGroupId === null
        || !allGroups.some((group) => group.id === selectedGroupId)
      ) {
        selectedGroupId = allGroups[0]?.id ?? null;
      }

      if (selectedGroupId !== null) {
        picker.value = selectedGroupId;
      }

      picker.addEventListener('change', () => {
        selectedGroupId = picker.value;
        // Repaint: the add/remove buttons describe THIS group, so their
        // availability and their refusal reasons have to move with it.
        render();
      });

      const member = groups.some((group) => group.id === selectedGroupId);
      const addGroup = osButton('Add to group', 'directory-add-group');
      const removeGroup = osButton(
        'Remove from group',
        'directory-remove-group',
      );
      setAvailability(
        addGroup,
        selectedGroupId === null
          ? 'There are no groups in this directory yet.'
          : member
            ? 'Already a member of that group. Adding them twice is not how '
              + 'permissions work.'
            : null,
      );
      setAvailability(
        removeGroup,
        selectedGroupId === null
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
            account.id,
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
            account.id,
            { group: selectedGroupId },
            'Group membership removed. Somebody will notice in about a week.',
          );
        }
      });

      groupRow.append(picker, addGroup, removeGroup);
      detail.append(groupRow);

      detail.append(
        outcomeLine('directory-outcome', outcome),
        refusalLine('directory-refusal', refusal, createIcon('icon-lock')),
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

      const focusedTestId = document.activeElement instanceof HTMLElement
        && root.contains(document.activeElement)
        ? document.activeElement.dataset.testid ?? null
        : null;

      renderList(nodes);
      renderDetail(nodes.find((account) => account.id === selectedId));

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
