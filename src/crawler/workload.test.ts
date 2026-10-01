import { describe, expect, it, vi } from 'vitest';
import { claimQuest, questProgress } from './desk';
import { Game } from './game';
import { derive, newSave } from './state';

vi.mock('./audio', () => ({ sfx: { coin: () => undefined } }));

function host(): Game {
  const g = Object.create(Game.prototype) as Game;
  const save = newSave(1);
  Object.assign(g, { save, derivedCache: derive(save), player: { setTool: () => undefined }, hud: { toast: () => undefined } });
  return g;
}

describe('workload penalties', () => {
  it('completing and claiming the fourth task restores sanity capacity and energy regeneration immediately', () => {
    const g = host();
    const normal = g.derived();
    for (let i = 0; i < 4; i++) g.save.quests.push({ id: i, kind: i === 0 ? 'resolve' : 'users', title: 'Task', body: '', from: 'Desk', goal: 1, progress: 0, reward: 5, done: false });
    g.refreshDerived();
    expect(g.derived().overload).toBe(1);
    expect(g.derived().maxSanity).toBeLessThan(normal.maxSanity);
    const task = g.save.quests[0]!;
    questProgress(g, 'resolve');
    expect(g.derived().maxSanity, 'sanity capacity restored on completion').toBe(normal.maxSanity);
    expect(g.derived().energyRegen).toBe(normal.energyRegen);
    claimQuest(g, task);
    expect(g.derived().overload).toBe(0);
    expect(g.derived().maxSanity).toBe(normal.maxSanity);
  });

  it('any workload or capacity change refreshes the stats before they are shown or used', () => {
    const g = host();
    for (let i = 0; i < 4; i++) g.save.quests.push({ id: i, kind: 'users', title: 'Task', body: '', from: 'Desk', goal: 1, progress: 0, reward: 5, done: false });
    expect(g.derived().overload).toBe(1);
    g.save.perks.timemgmt = 1;
    expect(g.derived().overload).toBe(0);
    g.save.quests = [];
    expect(g.derived().workload).toBe(0);
  });
});
