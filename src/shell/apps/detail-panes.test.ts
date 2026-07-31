import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { createWorldSession } from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
import { directoryDetail, type DirectoryView } from './directory';
import { remoteSession, type RemoteSessionView } from './remote';
import type { GameApi } from './types';

beforeAll(() => {
  loadEngineForTests();
});

/**
 * The two detail panes, as the models they are now built from.
 *
 * Both panes are FORMS - a group dropdown in one, a rotation dropdown in the
 * other - and both were rebuilt on every world change. The meters move every
 * five minutes of a shift, so "on every world change" meant several times a
 * minute, and a dropdown the player had open shut in their hand.
 *
 * The fix is to rebuild only when the pane's own model changes, and the risk
 * that comes with it is drift: a fact the pane renders that the model cannot
 * see would be a fact that silently stops updating. So the shape of the tests
 * below is one case per fact - if a control can show it, moving it moves the
 * model.
 */

function session(): {
  readonly api: Pick<GameApi, 'graph'>;
  readonly engine: ReturnType<typeof createWorldSession>['engine'];
} {
  const world = createWorldSession();
  return { api: { graph: world.engine.graph }, engine: world.engine };
}

/** What the driver dispatches every few minutes, all shift, all week. */
function tickTheMeters(
  engine: ReturnType<typeof createWorldSession>['engine'],
): void {
  const result = engine.dispatch(
    DAY_ACTIONS.metersTick,
    COMPANY_IDS.player,
    null,
    {
      stress_up: 3,
      stress_down: 0,
      suspicion_up: 0,
      suspicion_down: 1,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 0,
      breaches_charged: 0,
      resolve_credit_paid: 0,
    },
  );

  expect(result).toEqual({ ok: true });
}

describe('the account pane', () => {
  const view: DirectoryView = {
    allGroups: [],
    selectedGroupId: null,
    outcome: null,
    refusal: null,
  };

  function paneOf(
    world: ReturnType<typeof session>,
    id = COMPANY_IDS.garyAccount,
  ): string {
    const account = world.api.graph.getNode(id);
    expect(account).toBeDefined();

    if (account === undefined) {
      throw new Error('The account is not in this world.');
    }

    return JSON.stringify(directoryDetail(world.api, account, {
      ...view,
      allGroups: world.api.graph.nodesOfKind('group'),
    }));
  }

  it('says exactly the same thing after the meters move', () => {
    const world = session();
    const before = paneOf(world);

    tickTheMeters(world.engine);
    world.engine.advance(30);

    expect(paneOf(world)).toBe(before);
  });

  /** One case per fault, because one fix per fault is the app's whole point. */
  it.each([
    ['unlocking it', HELPDESK_ACTIONS.accountUnlock],
    ['resetting the password', HELPDESK_ACTIONS.accountResetPassword],
  ])('changes when the world does: %s', (_name, action) => {
    // Gary's lockout is dealt on the Monday morning, so a fresh world already
    // has the fault on the account and both verbs have something to do.
    const world = session();
    const before = paneOf(world);

    const result = world.engine.dispatch(
      action,
      COMPANY_IDS.player,
      COMPANY_IDS.garyAccount,
      {},
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(paneOf(world)).not.toBe(before);
  });

  it('changes when a group membership moves either way', () => {
    const world = session();
    const member = new Set(world.api.graph.neighbors(COMPANY_IDS.garyAccount, {
      direction: 'out',
      edgeKind: 'member_of',
    }).map((entry) => entry.id));
    const group = world.api.graph
      .nodesOfKind('group')
      .find((entry) => !member.has(entry.id));
    expect(group).toBeDefined();
    const before = paneOf(world);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.accountAddToGroup,
      COMPANY_IDS.player,
      COMPANY_IDS.garyAccount,
      { group: group?.id ?? '' },
    ).ok).toBe(true);

    const added = paneOf(world);
    expect(added).not.toBe(before);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.accountRemoveFromGroup,
      COMPANY_IDS.player,
      COMPANY_IDS.garyAccount,
      { group: group?.id ?? '' },
    ).ok).toBe(true);

    expect(paneOf(world)).not.toBe(added);
  });

  it('changes when the player picks a different group, or is refused', () => {
    const world = session();
    const account = world.api.graph.getNode(COMPANY_IDS.garyAccount);

    if (account === undefined) {
      throw new Error('The account is not in this world.');
    }

    const groups = world.api.graph.nodesOfKind('group');
    const pane = (patch: Partial<DirectoryView>): string => JSON.stringify(
      directoryDetail(world.api, account, {
        ...view,
        allGroups: groups,
        ...patch,
      }),
    );

    expect(pane({ selectedGroupId: groups[0]?.id ?? null }))
      .not.toBe(pane({ selectedGroupId: groups[1]?.id ?? null }));
    expect(pane({ outcome: 'Done.' })).not.toBe(pane({}));
    expect(pane({ refusal: 'It is not locked.' })).not.toBe(pane({}));
  });
});

describe('the remote session pane', () => {
  const view: RemoteSessionView = {
    picked: null,
    outcome: null,
    refusal: null,
  };

  function paneOf(
    world: ReturnType<typeof session>,
    id = COMPANY_IDS.printServer,
  ): string {
    const machine = world.api.graph.getNode(id);

    if (machine === undefined) {
      throw new Error('The machine is not in this world.');
    }

    return JSON.stringify(remoteSession(world.api, machine, view));
  }

  /**
   * The one that matters most: their taskbar clock ticks over every minute,
   * and it must not drag the pane - and the dropdown - down with it.
   */
  it('says exactly the same thing a minute later', () => {
    const world = session();
    const before = paneOf(world);

    world.engine.advance(1);
    expect(paneOf(world)).toBe(before);

    world.engine.advance(59);
    tickTheMeters(world.engine);
    expect(paneOf(world)).toBe(before);
  });

  it('changes when the screen is turned', () => {
    const world = session();
    const before = paneOf(world);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.machineSetDisplayRotation,
      COMPANY_IDS.player,
      COMPANY_IDS.printServer,
      { rotation: 180 },
    ).ok).toBe(true);

    expect(paneOf(world)).not.toBe(before);
  });

  it('changes when the box is rebooted', () => {
    const world = session();
    world.engine.advance(10);
    const before = paneOf(world);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.machineReboot,
      COMPANY_IDS.player,
      COMPANY_IDS.printServer,
      {},
    ).ok).toBe(true);

    expect(paneOf(world)).not.toBe(before);
  });

  it('changes when a service or its queue moves', () => {
    const world = session();
    // The spooler ticket is what wedges the service and fills the queue.
    spawnWorldTicket(world.engine, 'ticket:wedged-spooler');
    const wedged = paneOf(world);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      {},
    ).ok).toBe(true);
    const drained = paneOf(world);
    expect(drained).not.toBe(wedged);

    expect(world.engine.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.spooler,
      {},
    ).ok).toBe(true);
    expect(paneOf(world)).not.toBe(drained);
  });

  it('changes when the player picks a rotation, or is refused', () => {
    const world = session();
    const machine = world.api.graph.getNode(COMPANY_IDS.printServer);

    if (machine === undefined) {
      throw new Error('The machine is not in this world.');
    }

    const pane = (patch: Partial<RemoteSessionView>): string => JSON.stringify(
      remoteSession(world.api, machine, { ...view, ...patch }),
    );

    expect(pane({ picked: 90 })).not.toBe(pane({}));
    expect(pane({ outcome: 'Rebooted.' })).not.toBe(pane({}));
    expect(pane({ refusal: 'Already upright.' })).not.toBe(pane({}));
  });
});
