import { describe, expect, it } from 'vitest';

import {
  raciOwnerOfMachine,
  scopeRefusalLines,
  scopeVerdict,
  wrongCustomerGuardLines,
} from './customers';
import { EMPLOYER_IDS } from './employers';
import { FIELDS, MACHINE_ROLES, RACI_OWNERS, SERVICE_SCOPES } from './fields';
import { MSP_IDS, SHARE_CUSTOMERS } from './msp-company';
import { createWorldSession } from './session';

const CO_MANAGED_DIR = 'directory:penn-srv-01/ledger';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

describe('scope-of-touch verdicts', () => {
  it('lets a helpdesk contract touch workstations but not servers', () => {
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.workstation, null))
      .toBe('allowed');
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.fileServer, null))
      .toBe('helpdesk_server');
    expect(
      scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.domainController, null),
    ).toBe('helpdesk_server');
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.appServer, null))
      .toBe('helpdesk_server');
    // And a RACI marker on a helpdesk customer's box changes nothing at all:
    // the map is a co-managed artifact, and a contract with one IT team in it
    // has nothing to divide. A build that read the owner before the scope
    // would hand a helpdesk tech a server here.
    expect(
      scopeVerdict(
        SERVICE_SCOPES.helpdesk,
        MACHINE_ROLES.fileServer,
        RACI_OWNERS.msp,
      ),
    ).toBe('helpdesk_server');
  });

  it('refuses ANY remediation under a monitoring-only contract', () => {
    expect(
      scopeVerdict(SERVICE_SCOPES.monitoringOnly, MACHINE_ROLES.workstation, null),
    ).toBe('monitoring_only');
    expect(
      scopeVerdict(SERVICE_SCOPES.monitoringOnly, MACHINE_ROLES.fileServer, null),
    ).toBe('monitoring_only');
    expect(
      scopeVerdict(
        SERVICE_SCOPES.monitoringOnly,
        MACHINE_ROLES.fileServer,
        RACI_OWNERS.internal,
      ),
    ).toBe('monitoring_only');
  });

  it('notifies-first under co-managed and allows everything fully-managed', () => {
    expect(scopeVerdict(SERVICE_SCOPES.coManaged, MACHINE_ROLES.fileServer, null))
      .toBe('co_managed');
    expect(
      scopeVerdict(SERVICE_SCOPES.fullyManaged, MACHINE_ROLES.fileServer, null),
    ).toBe('allowed');
  });

  /**
   * The RACI matrix (E9, 0.37.0) - the whole of the soft wall, in three rows.
   *
   * Each row is a different thing the map can say about a box, and each has to
   * come out differently or the map is decoration: the function they kept is
   * allowed and remembered, the function they contracted out is simply
   * allowed, and the box nobody wrote down keeps the 0.8.0 wall - which is the
   * row that makes the shipped sentence reachable rather than dead.
   */
  it('reads the co-managed RACI map: theirs, ours, and unwritten', () => {
    expect(
      scopeVerdict(
        SERVICE_SCOPES.coManaged,
        MACHINE_ROLES.fileServer,
        RACI_OWNERS.internal,
      ),
    ).toBe('raci_internal');
    expect(
      scopeVerdict(
        SERVICE_SCOPES.coManaged,
        MACHINE_ROLES.fileServer,
        RACI_OWNERS.msp,
      ),
    ).toBe('allowed');
    expect(scopeVerdict(SERVICE_SCOPES.coManaged, MACHINE_ROLES.fileServer, null))
      .toBe('co_managed');
  });

  it('treats no contract (in-house) as allowed', () => {
    // A box with no customer is an in-house box: there is no contract to be out
    // of, so nothing is refused. This is the line that keeps the two other
    // employers byte-identical.
    expect(scopeVerdict(null, MACHINE_ROLES.fileServer, null)).toBe('allowed');
    expect(scopeVerdict(null, MACHINE_ROLES.workstation, null)).toBe('allowed');
  });

  it('gives each refusal its true reason, and none to an allowed action', () => {
    const { engine } = createWorldSession(MSP_CARRY);
    const { graph } = engine;
    const box = MSP_IDS.penningtonServer;

    expect(scopeRefusalLines('allowed', graph, box)).toBeNull();
    expect(scopeRefusalLines('monitoring_only', graph, box)?.join(' '))
      .toContain('notify-and-escalate');
    expect(scopeRefusalLines('helpdesk_server', graph, box)?.join(' '))
      .toContain('Servers are not in this contract');
    expect(scopeRefusalLines('co_managed', graph, box)?.join(' '))
      .toContain('notify them first');
    // And the verdict that refuses nothing: a box their own IT owns is not
    // walled off, it is watched. A build that gave this one lines would be
    // back to a permission the estate does not have.
    expect(scopeRefusalLines('raci_internal', graph, box)).toBeNull();
  });

  /**
   * THE CO-MANAGED REFUSAL, AT A PATH (0.38.1).
   *
   * The sentence said "notify <target>", and `notify` resolves a SERVICE - so
   * on a drive node, which this bundle's own drive arm made reachable, it was
   * naming a command the shell cannot be made to accept. `routeLines` had
   * already solved this exact shape for the change desk; this is the other
   * refusal that needed it, off the same predicate rather than a second copy
   * of "is this a path".
   *
   * Teeth: return the flat line for every kind and this reds.
   */
  it('does not tell a path to be notified about', () => {
    const { engine } = createWorldSession(MSP_CARRY);

    engine.applySetup([
      {
        op: 'addNode',
        node: {
          id: CO_MANAGED_DIR,
          kind: 'directory',
          fields: { name: 'LEDGER' },
        },
      },
      {
        op: 'addEdge',
        edge: {
          from: MSP_IDS.penningtonServer,
          to: CO_MANAGED_DIR,
          kind: 'contains',
        },
      },
    ]);

    const said = scopeRefusalLines('co_managed', engine.graph, CO_MANAGED_DIR)
      ?.join(' ') ?? '';

    expect(said).toContain('This is co-managed');
    expect(said).not.toContain('notify <target>');
    expect(said).toContain('Escalate it');
    // And the box arm is untouched - the wording only changes where it was
    // untypeable, which is what keeps every shipped refusal what it was.
    expect(scopeRefusalLines(
      'co_managed',
      engine.graph,
      MSP_IDS.penningtonServer,
    )?.join(' ')).toContain('notify <target>');
  });
});

describe('the RACI map, over the real MSP graph', () => {
  it('reads the split off the boxes PENNINGTON-ACCT actually has', () => {
    const { engine } = createWorldSession(MSP_CARRY);
    const server = engine.graph.getNode(MSP_IDS.penningtonServer);
    const desk = engine.graph.getNode(MSP_IDS.penningtonReception);
    const arden = engine.graph.getNode(MSP_IDS.ardenServer);

    expect(server).toBeDefined();
    expect(desk).toBeDefined();
    expect(arden).toBeDefined();

    if (server === undefined || desk === undefined || arden === undefined) {
      return;
    }

    expect(raciOwnerOfMachine(server)).toBe(RACI_OWNERS.internal);
    expect(raciOwnerOfMachine(desk)).toBe(RACI_OWNERS.msp);
    // And the other co-managed customer, whose map was never written: it reads
    // null and keeps the shipped refusal, which is what "purely additive" has
    // to mean for an estate that shipped nine versions ago.
    expect(raciOwnerOfMachine(arden)).toBeNull();
  });
});

describe('the wrong-customer guard, over the real MSP graph', () => {
  it('fires on a machine of a different customer and names both', () => {
    const { engine } = createWorldSession(MSP_CARRY);
    const meridianBox = engine.graph.getNode('machine:meri-ws-01');
    expect(meridianBox).toBeDefined();

    if (meridianBox === undefined) {
      return;
    }

    // Fontaine is on screen; the box is Meridian's.
    const stop = wrongCustomerGuardLines(
      engine.graph,
      meridianBox,
      'customer:fontaine',
    );
    expect(stop?.join(' ')).toContain('STOP.');
    expect(stop?.join(' ')).toContain('FONTAINE-LAW');
    expect(stop?.join(' ')).toContain('MERIDIAN-SAAS');
  });

  it('stands down when the box is the customer in context', () => {
    const { engine } = createWorldSession(MSP_CARRY);
    const meridianBox = engine.graph.getNode('machine:meri-ws-01');

    expect(
      meridianBox === undefined
        ? null
        : wrongCustomerGuardLines(engine.graph, meridianBox, 'customer:meridian'),
    ).toBeNull();
  });

  it('stands down with no customer in context, and on an in-house box', () => {
    const { engine } = createWorldSession(MSP_CARRY);
    const meridianBox = engine.graph.getNode('machine:meri-ws-01');
    const ownDesk = engine.graph.getNode('machine:msp-desk');

    // Nothing on screen: no wrong tenant to be in.
    expect(
      meridianBox === undefined
        ? null
        : wrongCustomerGuardLines(engine.graph, meridianBox, null),
    ).toBeNull();

    // The MSP's own desk belongs to no customer, so aiming at it while a
    // customer is in context is not a wrong-tenant action.
    expect(
      ownDesk === undefined
        ? null
        : wrongCustomerGuardLines(engine.graph, ownDesk, 'customer:fontaine'),
    ).toBeNull();
  });
});

/**
 * The invariant behind the 0.38.1 carried-save migration, made a gate (its own
 * verifier's P2): a share seeded WITHOUT a customer is the 0.38.0 defect
 * reopened - `customerIdOfShare` reads null off it, which is the in-house
 * answer, so the grant meets neither the tenant STOP nor the contract wall.
 * And it is worse than the original, because such a world's saves are written
 * at the CURRENT schema, so the 5->6 migration that repaired the 0.38.0 files
 * will never run over them - no later correction to the table can reach a
 * save already on a disk. The seed stamps FROM `SHARE_CUSTOMERS`; this holds
 * the two ends of that arrangement together, both directions, over every
 * shipped employer's real graph.
 */
describe('every seeded share knows its customer', () => {
  it.each(EMPLOYER_IDS.map((id) => [id] as const))(
    'at %s, and the table names only shares that exist',
    (employer) => {
      const { engine } = createWorldSession(Object.freeze({
        farmFund: 0,
        attempt: 1,
        arcWeek: 1,
        employer,
      }));
      const shares = engine.graph.nodesOfKind('share');

      // The rule holds where CUSTOMERS exist: an in-house world's share
      // (probation's `share:common`) is legitimately bare, because null IS
      // the in-house answer there. A world that seeds customer nodes is a
      // world where a bare share is the fail-open wall.
      if (engine.graph.nodesOfKind('customer').length > 0) {
        for (const share of shares) {
          expect(
            share.fields[FIELDS.machineCustomer],
            `${share.id} is seeded without a customer - the walls fail open `
            + 'on it, and no carried-save migration can ever repair a file '
            + 'saved this way',
          ).toBeTypeOf('string');
        }
      }

      if (employer === 'msp') {
        // The subject guard: the world this gate exists for actually has
        // shares in it, and the migration table points at real nodes.
        expect(shares.length).toBeGreaterThan(0);
        const ids = new Set(shares.map((share) => share.id));
        for (const key of Object.keys(SHARE_CUSTOMERS)) {
          expect(
            ids.has(key),
            `SHARE_CUSTOMERS names ${key}, which the msp seed does not create`,
          ).toBe(true);
        }
      }
    },
  );
});
