import { describe, expect, it } from 'vitest';

import type { EmployerCareer } from '../world/career';
import {
  carryForSwitch,
  parseSwitchRecord,
  switchRecord,
  SwitchSlot,
} from './switch';

/** A storage that keeps things, and one that refuses to. */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

class HostileStorage extends MemoryStorage {
  public override setItem(): void {
    throw new Error('no room at the inn');
  }
}

const CAREER: EmployerCareer = {
  reputation: 58,
  title: 'IT Support Technician',
  farmFund: 25_000,
  trail: 'fired',
};

describe('the switch slot', () => {
  it('round-trips a career across a change of employer', () => {
    const slot = new SwitchSlot(new MemoryStorage());
    const written = slot.write(switchRecord('bodgeworth', CAREER));

    expect(written.ok).toBe(true);

    const back = slot.peek();
    expect(back).not.toBeNull();
    expect(back?.employer).toBe('bodgeworth');
    expect(back?.career).toEqual(CAREER);
  });

  it('leaves the record in place on a peek, like the retry slot', () => {
    // The arrival is used once, but "used" means the arrival is durable - not
    // that a variable read the record. Clearing on read would lose the career in
    // the seconds between boot and the first save.
    const slot = new SwitchSlot(new MemoryStorage());
    slot.write(switchRecord('bodgeworth', CAREER));

    expect(slot.peek()).not.toBeNull();
    expect(slot.peek()).not.toBeNull();

    slot.clear();
    expect(slot.peek()).toBeNull();
  });

  it('refuses a record that names an employer this build does not ship', () => {
    // The same rule employerFor keeps, one layer out: a record naming a company
    // this version has never heard of would stand the WRONG world up under a
    // real career. If the closed-set check is dropped, this stops being null.
    expect(parseSwitchRecord({ employer: 'a-ghost-shop', career: CAREER }))
      .toBeNull();
  });

  it('refuses a record whose career is rubbish', () => {
    expect(parseSwitchRecord({ employer: 'bodgeworth', career: null }))
      .toBeNull();
    expect(parseSwitchRecord({
      employer: 'bodgeworth',
      career: { reputation: 'lots', title: 'Tech', farmFund: 0, trail: null },
    })).toBeNull();
    expect(parseSwitchRecord('not a record')).toBeNull();
  });

  it('answers rather than throwing when storage will not keep it', () => {
    const slot = new SwitchSlot(new HostileStorage());
    const written = slot.write(switchRecord('bodgeworth', CAREER));

    expect(written.ok).toBe(false);
  });

  it('seeds the next employer from the carried career', () => {
    // The bridge to `createWorldSession`: the arriving employer's first week is
    // the career's standing, at that employer, week one, attempt one.
    const carry = carryForSwitch(switchRecord('bodgeworth', CAREER));

    expect(carry.employer).toBe('bodgeworth');
    expect(carry.reputation).toBe(CAREER.reputation);
    expect(carry.title).toBe(CAREER.title);
    expect(carry.farmFund).toBe(CAREER.farmFund);
    expect(carry.attempt).toBe(1);
  });
});
