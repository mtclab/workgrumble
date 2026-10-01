import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICKETS } from './content/tickets';
import { Game } from './game';
import { derive, newSave, type QueuedTicket } from './state';

vi.mock('./audio', () => ({ sfx: { error: () => undefined } }));

function host(sanity: number): { g: Game; q: QueuedTicket; events: string[] } {
  const element = () => ({ classList: { toggle: () => undefined }, style: {}, append: () => undefined, addEventListener: () => undefined, querySelector: () => null });
  vi.stubGlobal('document', { createElement: element });
  const g = Object.create(Game.prototype) as Game;
  const save = newSave(1);
  const q: QueuedTicket = { t: 0, sla: 100, from: 'User', struck: [], gold: false };
  save.queue = [q];
  save.sanity = sanity;
  const events: string[] = [];
  const noop = (): void => undefined;
  Object.assign(g, {
    save, derivedCache: derive(save), screen: 'os', sisuT: 0,
    currentTerminal: { id: 1 }, os: { hide: () => events.push('OS closed') },
    input: { releaseLock: noop }, overlay: element(), menuKeys: { open: noop },
    player: { setTool: noop }, exercise: noop, journal: noop,
    writeSlotFor: () => { events.push(g.currentTerminal === null ? 'burnout saved away from computer' : 'still at computer'); return true; },
    hud: { toast: noop },
  });
  return { g, q, events };
}

describe('burnout at a terminal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([8, 3])('a wrong fix from %s sanity closes the OS and burns out before another fix can heal', (sanity) => {
    const { g, q, events } = host(sanity);
    expect(TICKETS[q.t]?.fixes.includes('Wrong fix')).toBe(false);
    expect(g.resolve(q, 'Wrong fix').ok).toBe(false);
    expect(g.screen, 'terminal burnout screen').toBe('dead');
    expect(g.save.stats.burnouts).toBe(1);
    expect(g.save.queue).toEqual([]);
    expect(g.hasTerminal()).toBe(false);
    expect(events).toEqual(['OS closed', 'burnout saved away from computer']);
    expect(g.save.sanity).toBe(g.derived().maxSanity);
  });

  it('Unbreakable protects a terminal mistake just as it protects a hit in play', () => {
    const { g, q, events } = host(8);
    g.save.perks.unbreakable = 1;
    g.resolve(q, 'Wrong fix');
    expect(g.save.sanity).toBe(1);
    expect(g.save.floorState.unbreakableUsed).toBe(true);
    expect(g.save.stats.burnouts).toBe(0);
    expect(g.screen).toBe('os');
    expect(events).toEqual([]);
  });
});
