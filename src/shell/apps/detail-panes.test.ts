import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { AppStateStore } from '../app-state';
import { createWorldSession } from '../../world/session';
import { spawnWorldTicket } from '../../world/tickets';
import { directoryDetail, type DirectoryView } from './directory';
import {
  remoteSession,
  type RemoteService,
  type RemoteSessionView,
} from './remote';
import type { GameApi } from './types';
import { nodeKey } from './ui';

beforeAll(() => {
  loadEngineForTests();
});

/** The browser suite, read as text: it names nodes, and nodes can be typos. */
const SPEC_DIR = 'e2e';

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
  readonly api: Pick<GameApi, 'graph' | 'appState' | 'actor'>;
  readonly engine: ReturnType<typeof createWorldSession>['engine'];
} {
  const world = createWorldSession();

  // The remote pane reads the open windows as well as the graph now: the
  // player's own box shows what is running on it, which is the boss's-eye view
  // of the slack mechanic. It is the shipped store rather than a stub, so a
  // pane that started reading something else out of it fails here too.
  return {
    api: {
      graph: world.engine.graph,
      appState: new AppStateStore(),
      actor: COMPANY_IDS.player,
    },
    engine: world.engine,
  };
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
      { spooler: COMPANY_IDS.spooler },
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

  /**
   * Every row in the services panel says what it is and what it is doing, and
   * every restart button that is not a button carries the reason it is not.
   *
   * This is the pane's half of the no-scenery rule: the engine refuses these
   * five for five different true reasons, and a panel that greyed a control
   * out without saying which would be the dead end the house rules forbid.
   */
  it('says of every service what it is, and why it will not be bounced', () => {
    const world = session();
    const machine = world.api.graph.getNode(COMPANY_IDS.playerMachine);

    if (machine === undefined) {
      throw new Error('The machine is not in this world.');
    }

    const model = remoteSession(world.api, machine, view);
    const find = (id: string): RemoteService | undefined => model.services
      .find((service) => service.id === id);

    expect(model.services.length).toBeGreaterThan(20);

    for (const service of model.services) {
      expect(service.name.length, service.id).toBeGreaterThan(0);

      if (service.listed) {
        // Everything in the table has both columns the table is headed with.
        expect(service.service, service.id).not.toBe('-');
        expect(service.startupLabel, service.id).not.toBe('-');
      }

      // Live, or refused in a sentence. Never quietly dead.
      if (service.blocked !== null) {
        expect(service.blocked.length, service.id).toBeGreaterThan(20);
      }
    }

    // A Manual service that is stopped is not a fault and IS restartable.
    expect(find('service:beige-box/bits')?.blocked).toBeNull();
    expect(find('service:beige-box/remoteregistry')?.blocked)
      .toContain('set to Disabled');
    expect(find('service:beige-box/rpcss')?.blocked)
      .toContain('will not take a stop control');
    expect(find('service:beige-box/dnscache')?.blocked).toContain('running');

    // And the fan, which is not in the table at all.
    const fan = find(COMPANY_IDS.fan);

    expect(fan?.listed).toBe(false);
    expect(fan?.blocked).toContain('not software');
  });

  /**
   * Every service row a browser test reaches for is a row this world has.
   *
   * The staging run found `remote-service-print-bits`, which is not a test id
   * this product has ever rendered: the ids are built from node ids, a service
   * on a box is `service:print/bits`, and a hyphen for the slash is a locator
   * that finds nothing in a browser and nothing in the offline gate either.
   * That is a whole class of failure - a spec naming a world that does not
   * exist - and it can only be caught here, because nothing else in the local
   * half of the gate reads what the specs ask for.
   */
  it('has a node behind every Remote Assist test id the e2e specs use', () => {
    const world = session();
    const keysOf = (kind: 'service' | 'machine' | 'device'): Set<string> => new Set(
      world.api.graph.nodesOfKind(kind).map((node) => nodeKey(node.id)),
    );
    // One pattern per family, because each family is built from a different
    // half of the world and a locator can only be checked against its own.
    const families: readonly {
      readonly pattern: RegExp;
      readonly keys: ReadonlySet<string>;
    }[] = [
      {
        pattern: /getByTestId\('remote-(?:service|restart)-([^']+)'\)/gu,
        keys: keysOf('service'),
      },
      { pattern: /getByTestId\('remote-machine-([^']+)'\)/gu, keys: keysOf('machine') },
      {
        pattern: /getByTestId\('remote-(?:clear|power|queue|battery|replace-battery)-([^']+)'\)/gu,
        keys: keysOf('device'),
      },
    ];
    const specs = readdirSync(SPEC_DIR).filter((file) => file.endsWith('.ts'));
    let checked = 0;

    for (const file of specs) {
      const source = readFileSync(join(SPEC_DIR, file), 'utf8');

      for (const { pattern, keys } of families) {
        for (const match of source.matchAll(pattern)) {
          const id = match[1] ?? '';

          // Families and placeholders are prose, not locators.
          if (id.includes('<') || id.includes('*')) {
            continue;
          }

          checked += 1;
          expect(keys.has(id), `${file}: nothing in this world is "${id}"`)
            .toBe(true);
        }
      }
    }

    expect(checked).toBeGreaterThan(10);
  });
});
