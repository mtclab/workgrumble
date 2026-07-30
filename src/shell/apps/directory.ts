import type { ReadOnlyGraphNode } from '../../engine/graph-view';
import { HELPDESK_ACTIONS } from '../../world/actions';
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

function statusOf(account: Readonly<ReadOnlyGraphNode>): string {
  if (account.fields[FIELDS.enabled] === false) {
    return 'Disabled';
  }

  return account.fields[FIELDS.locked] === true ? 'Locked out' : 'Fine';
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
      const reset = account.fields[FIELDS.passwordResetAt];

      const heading = element('h2', undefined, 'directory-detail-username');
      heading.textContent = usernameOf(account);

      const facts = element('dl', 'directory-facts');
      definitionRow(facts, 'Owner', 'directory-detail-owner').textContent = textValue(
        ownerOf(api, account)?.fields[FIELDS.name],
        'Nobody admits to it',
      );
      definitionRow(facts, 'Job title', 'directory-detail-title').textContent = textValue(
        ownerOf(api, account)?.fields[FIELDS.title],
        'Unrecorded',
      );
      definitionRow(facts, 'Status', 'directory-detail-status').textContent = statusOf(account);
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
          ? 'This account is disabled. Unlocking it would achieve a very tidy '
            + 'nothing.'
          : locked
            ? null
            : 'This account is not locked. Whatever they are complaining '
              + 'about, it is something else.',
      );
      unlock.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountUnlock,
          account.id,
          {},
          `Unlocked ${usernameOf(account)}. They are logging in already and `
            + 'they will not say thank you.',
        );
      });

      const resetPassword = osButton(
        'Reset password',
        'directory-reset-password',
      );
      setAvailability(
        resetPassword,
        disabled
          ? 'This account is disabled. A new password still lets nobody in.'
          : null,
      );
      resetPassword.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.accountResetPassword,
          account.id,
          {},
          'Temporary password issued and the lockout cleared. It will be on a '
            + 'sticky note by lunchtime.',
        );
      });

      actions.append(unlock, resetPassword);
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
