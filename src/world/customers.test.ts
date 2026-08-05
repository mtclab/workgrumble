import { describe, expect, it } from 'vitest';

import {
  scopeRefusalLines,
  scopeVerdict,
  wrongCustomerGuardLines,
} from './customers';
import { MACHINE_ROLES, SERVICE_SCOPES } from './fields';
import { createWorldSession } from './session';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

describe('scope-of-touch verdicts', () => {
  it('lets a helpdesk contract touch workstations but not servers', () => {
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.workstation))
      .toBe('allowed');
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.fileServer))
      .toBe('helpdesk_server');
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.domainController))
      .toBe('helpdesk_server');
    expect(scopeVerdict(SERVICE_SCOPES.helpdesk, MACHINE_ROLES.appServer))
      .toBe('helpdesk_server');
  });

  it('refuses ANY remediation under a monitoring-only contract', () => {
    expect(scopeVerdict(SERVICE_SCOPES.monitoringOnly, MACHINE_ROLES.workstation))
      .toBe('monitoring_only');
    expect(scopeVerdict(SERVICE_SCOPES.monitoringOnly, MACHINE_ROLES.fileServer))
      .toBe('monitoring_only');
  });

  it('notifies-first under co-managed and allows everything fully-managed', () => {
    expect(scopeVerdict(SERVICE_SCOPES.coManaged, MACHINE_ROLES.fileServer))
      .toBe('co_managed');
    expect(scopeVerdict(SERVICE_SCOPES.fullyManaged, MACHINE_ROLES.fileServer))
      .toBe('allowed');
  });

  it('treats no contract (in-house) as allowed', () => {
    // A box with no customer is an in-house box: there is no contract to be out
    // of, so nothing is refused. This is the line that keeps the two other
    // employers byte-identical.
    expect(scopeVerdict(null, MACHINE_ROLES.fileServer)).toBe('allowed');
    expect(scopeVerdict(null, MACHINE_ROLES.workstation)).toBe('allowed');
  });

  it('gives each refusal its true reason, and none to an allowed action', () => {
    expect(scopeRefusalLines('allowed')).toBeNull();
    expect(scopeRefusalLines('monitoring_only')?.join(' '))
      .toContain('notify-and-escalate');
    expect(scopeRefusalLines('helpdesk_server')?.join(' '))
      .toContain('Servers are not in this contract');
    expect(scopeRefusalLines('co_managed')?.join(' '))
      .toContain('notify them first');
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
