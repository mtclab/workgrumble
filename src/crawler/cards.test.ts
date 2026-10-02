import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveActor } from './combat';
import { CROUCH_SPEED, type Game } from './game';
import { DT, type Headless, headless } from './headlessgame';
import { interact, standBy } from './interact';
import { cellCenter, generateLevel, type LevelRecipe, toCell } from './level';
import type { MissionCard } from './mission';
import { JOSH, MARCUS, PHISHING, POSTITS, PRINTER, STAPLER } from './missions';
import { fx } from './rng';
import { newSave } from './state';
import { ALERT_PAUSE } from './stealth';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});

/**
 * The S1b pool, card by card (docs/SPEC_HELLDESK_030_S1.md, S1b "Cards"),
 * on the real Game and its loop (headlessgame.ts): the stapler's tuning
 * from the spike (HR crosses the spine at one point, sneaking at 0.7 of
 * walking, going loud bolts the closet and calls HR's manager), and each
 * new card's objective done the way a player does it.
 */

afterEach(() => vi.restoreAllMocks());

const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 7331);

function play(card: MissionCard, seed = 4242): Headless {
  // The feel dice too (who wanders where): the same card plays the same way every run.
  fx.reseed(seed);
  const h = headless(newSave(1));
  h.g.loadMission(card, seed, true);
  h.g.screen = 'play';
  return h;
}

const onSpine = (g: Game, x: number, z: number): boolean => (g.level.recipe?.spine ?? []).includes(toCell(z) * g.level.w + toCell(x));

describe('#1 The Red Stapler: the spike\'s tuning', () => {
  it('HR\'s round crosses the service spine at one point, on 150 seeds, and HR really walks there', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const h = play(STAPLER, seed);
      const m = h.g.mission!;
      const hr = [...m.watch.watchers.values()].find((w) => w.tag === 'hr')!;
      const points = hr.route.filter((p) => onSpine(h.g, p.x, p.z));
      expect(points, `seed ${seed}: one point on the spine`).toHaveLength(1);
      const node = h.g.level.recipe!.spineNodes[0]!;
      expect(points[0], `seed ${seed}: the spine's node`).toEqual({ x: cellCenter(node % h.g.level.w), z: cellCenter(Math.floor(node / h.g.level.w)) });
      // Nobody else's round goes near it.
      for (const w of m.watch.watchers.values()) if (w !== hr) expect(w.route.some((p) => onSpine(h.g, p.x, p.z))).toBe(false);
    }
    // In play: within one round HR stands on the spine (the player out of the way, in the lobby).
    const h = play(STAPLER);
    const hr = [...h.g.mission!.watch.watchers.values()].find((w) => w.tag === 'hr')!;
    let reached = false;
    h.run(90, () => { if (onSpine(h.g, hr.actor.pos.x, hr.actor.pos.z)) reached = true; });
    expect(reached, 'HR steps onto the spine').toBe(true);
  });

  it('sneaking moves at 0.7 of walking', () => {
    const walk = (crouch: boolean): number => {
      const h = play(STAPLER);
      const g = h.g;
      g.player.crouching = crouch;
      g.player.yaw = Math.PI / 2;
      // Down the corridor in front of the lobby, a straight run.
      const from = g.player.pos.clone();
      g.input.keys.add(g.settings.keys.forward);
      h.run(0.8, () => { g.save.sanity = 100; });
      g.input.keys.clear();
      return Math.hypot(g.player.pos.x - from.x, g.player.pos.z - from.z);
    };
    expect(CROUCH_SPEED).toBe(0.7);
    const ratio = walk(true) / walk(false);
    expect(ratio).toBeCloseTo(0.7, 2);
  });

  it('going loud bolts HR\'s closet (a harder lock) and calls the Head of People, announced, once; the call is not a second alarm', () => {
    const h = play(STAPLER);
    const g = h.g;
    const m = g.mission!;
    const closet = g.level.interactables.find((it) => it.id === g.level.recipe?.closet)!;
    const lock = closet.lock;
    const w = [...m.watch.watchers.values()].find((x) => x.sort === 'desk')!;
    expect(m.standInView(w.actor.id, 3)).toBe(true);
    const others = (): void => { for (const a of m.crowd) if (a !== w.actor) a.stunned = 1e9; };
    for (let t = 0; t < 8 && m.watch.tier < 2; t += DT) {
      others();
      h.run(DT, () => { g.save.sanity = 100; m.standInView(w.actor.id, 3); });
    }
    expect(m.watch.tier).toBe(2);
    h.run(DT * 2, () => { g.save.sanity = 100; others(); });
    expect(closet.lock, 'bolted: a harder lock').toBe(lock + 25);
    const boss = m.crowd.filter((a) => a.name === 'Head of People');
    expect(boss, 'HR\'s manager called in').toHaveLength(1);
    expect(boss[0]!.aggro, 'and after you').toBe(true);
    expect(boss[0]!.cooldown, 'not swinging at once').toBeGreaterThanOrEqual(0);
    expect(h.toasts.some((t) => t.startsWith('HR has bolted the closet and called the Head of People.') && t.includes(`lock ${lock + 25}`))).toBe(true);
    expect(m.watch.tier, 'the call does not make it Escalated').toBe(2);
    // Once.
    h.run(3, () => { g.save.sanity = 100; others(); });
    expect(m.crowd.filter((a) => a.name === 'Head of People')).toHaveLength(1);
    expect(closet.lock).toBe(lock + 25);
    expect(ALERT_PAUSE).toBeGreaterThan(0);
  });
});

describe('#4 Password Hygiene Week', () => {
  it('twelve post-its on the floor; walk over eight and it is done', () => {
    const h = play(POSTITS);
    const m = h.g.mission!;
    expect(m.scatter).toHaveLength(12);
    expect(h.g.pickups.filter((p) => p.id.startsWith('card:postit'))).toHaveLength(12);
    for (const c of m.scatter.slice(0, 7)) {
      h.g.player.pos.set(c.x, 0, c.z);
      h.run(DT * 3);
    }
    expect(m.run.progress).toBe(7);
    expect(m.run.objectiveDone).toBe(false);
    expect(h.missionHud?.goal).toContain('(7/8)');
    expect(h.g.save.questItems, 'the card\'s, not yours to carry').not.toContain('postit');
    const c = m.scatter[7]!;
    h.g.player.pos.set(c.x, 0, c.z);
    h.run(DT * 3);
    expect(m.run.objectiveDone).toBe(true);
  });

  it('a step from a copy, facing it (the browser test\'s placement): W walks onto it, and that is the pickup', () => {
    const h = play(POSTITS);
    const g = h.g;
    const m = g.mission!;
    g.player.crouching = true;
    for (let n = 1; n <= 3; n++) {
      expect(m.toCopy(2.2)).toBe(true);
      g.input.keys.add(g.settings.keys.forward);
      for (let t = 0; t < 5 && m.run.progress < n; t += DT) h.run(DT);
      g.input.keys.clear();
      expect(m.run.progress, `copy ${n}, walked onto`).toBe(n);
    }
  });
});

describe('#5 Phishing Test Debrief', () => {
  const sales = (h: Headless) => h.g.mission!.crowd.filter((_a, i) => h.g.mission!.specs[i]?.tag === 'sales');

  it('three from Sales at one table, expecting you; each talked down with the odds printed counts; done at three, and nothing went loud', () => {
    const h = play(PHISHING);
    const g = h.g;
    const m = g.mission!;
    const three = sales(h);
    expect(three).toHaveLength(3);
    expect(new Set(three.map((a) => a.room)).size, 'one meeting table').toBe(1);
    vi.spyOn(g, 'check').mockReturnValue(true);
    for (const a of three) {
      // Stood in front of them a while: they expect you, so nothing rises.
      g.player.crouching = false;
      m.standInView(a.id, 1.6);
      h.run(1.5, () => { m.standInView(a.id, 1.6); });
      expect(m.watch.watchers.get(a.id)?.suspicion, `${a.name} expects you`).toBe(0);
      g.promptTarget = { kind: 'actor', a };
      interact(g);
      const node = h.dialogues.at(-1)!;
      const odds = node.options.find((o) => /%$/.test(o.tag ?? ''));
      expect(odds, 'the odds printed').toBeDefined();
      h.pick(odds!.label);
      while (g.screen === 'dialogue') h.pick(/./);
      h.run(DT * 2);
    }
    expect(m.run.progress).toBe(3);
    expect(m.run.objectiveDone).toBe(true);
    expect(m.run.maxTier, 'talking them down is not a fight').toBeLessThan(2);
  });

  it('a failed check enrages them: Alert, and it is loud', () => {
    const h = play(PHISHING);
    const g = h.g;
    const m = g.mission!;
    const a = sales(h)[0]!;
    vi.spyOn(g, 'check').mockReturnValue(false);
    m.standInView(a.id, 1.6);
    g.promptTarget = { kind: 'actor', a };
    interact(g);
    const odds = h.dialogues.at(-1)!.options.find((o) => /%$/.test(o.tag ?? ''))!;
    h.pick(odds.label);
    while (g.screen === 'dialogue') h.pick(/./);
    h.run(DT * 2, () => { g.save.sanity = 100; });
    expect(a.aggro).toBe(true);
    expect(m.watch.watchers.get(a.id)?.mood).toBe('alert');
    expect(m.watch.tier).toBeGreaterThanOrEqual(2);
  });
});

describe('#3 Josh\'s First Day, Again', () => {
  it('Josh follows you to Internal IT\'s counter, and that is the card', () => {
    const h = play(JOSH);
    const g = h.g;
    const m = g.mission!;
    const josh = m.escortee!;
    expect(josh.name).toBe('Josh (Intern)');
    expect(josh.recruited).toBe(true);
    expect(m.crowd.filter((a) => a.kind === 'vendor')).toHaveLength(2);
    const desk = g.level.interactables.find((it) => it.kind === 'itdesk')!;
    // The way round the loop, not through the pitch: a walk cell by cell (the vendors' room left out), Josh behind.
    const lv = g.level;
    const pitch = new Set(lv.recipe!.rooms.pitch ?? []);
    const goal = toCell(desk.z + 2.2) * lv.w + toCell(desk.x);
    const prev = new Map<number, number>([[toCell(g.player.pos.z) * lv.w + toCell(g.player.pos.x), -1]]);
    const queue = [...prev.keys()];
    for (let i = 0; i < queue.length && !prev.has(goal); i++) {
      const c = queue[i]!;
      for (const n of [c - 1, c + 1, c - lv.w, c + lv.w]) {
        if (prev.has(n) || lv.floor[n] !== 1 || lv.solid[n] === 1 || pitch.has(lv.roomOf[n] ?? -1)) continue;
        prev.set(n, c);
        queue.push(n);
      }
    }
    const path: number[] = [];
    for (let c = goal; c !== -1 && c !== undefined; c = prev.get(c)!) path.unshift(c);
    expect(path.length, 'a way round').toBeGreaterThan(10);
    for (const c of path) {
      g.player.pos.set(cellCenter(c % lv.w), 0, cellCenter(Math.floor(c / lv.w)));
      // Wait for Josh to keep up.
      for (let k = 0; k < 20 && Math.hypot(josh.pos.x - g.player.pos.x, josh.pos.z - g.player.pos.z) > 3.5; k++) h.run(0.2, () => { g.save.sanity = 100; });
      h.run(0.2, () => { g.save.sanity = 100; });
      if (m.run.objectiveDone) break;
    }
    h.run(3, () => { g.save.sanity = 100; });
    expect(m.run.objectiveDone, 'Josh at the counter').toBe(true);
    expect(m.nerve).toBeGreaterThan(0);
    // Delivered: he stays at the counter with his badge while you go back to the lift, and a fight on the
    // way back is not his to panic at: the card is done, not failed.
    const at = { x: josh.pos.x, z: josh.pos.z };
    expect(josh.recruited, 'not following you any more').toBe(false);
    g.player.pos.set(lv.start.x, 0, lv.start.z);
    const vendor = m.crowd.find((a) => a.kind === 'vendor')!;
    vendor.aggro = true;
    h.run(10, () => { g.save.sanity = 100; vendor.pos.set(josh.pos.x + 1, 0, josh.pos.z); });
    expect(m.run.over, 'the card is not failed').toBe(false);
    expect(Math.hypot(josh.pos.x - at.x, josh.pos.z - at.z), 'still at the counter').toBeLessThan(1.5);
  });
});

describe('#9 Marcus and the Backups', () => {
  it('Marcus\'s computer is the card\'s: the backup agent, then his three-way choice; any other computer is a desk', () => {
    const h = play(MARCUS);
    const g = h.g;
    const m = g.mission!;
    const t = m.fixTerminal()!;
    expect(t, 'a computer in Marcus\'s office').toBeDefined();
    const marcus = m.crowd.find((_a, i) => m.specs[i]?.tag === 'marcus')!;
    expect(marcus.room).toBe(t.room);
    const open = vi.fn();
    (g.os as unknown as { open: typeof open }).open = open;
    const other = g.level.interactables.find((it) => it.kind === 'terminal' && it.id !== t.id)!;
    expect(standBy(g, other)).toBe(true);
    interact(g);
    expect(open).toHaveBeenCalled();
    g.screen = 'play';
    expect(standBy(g, t)).toBe(true);
    interact(g);
    const node = h.dialogues.at(-1)!;
    expect(node.speaker).toBe('Marcus from Sales');
    expect(node.options.map((o) => o.label)).toEqual(['Your secret is safe with me.', 'I have to log it properly, Marcus.', 'Let us fix it together - and you write the incident note yourself.']);
    h.pick('I have to log it properly, Marcus.');
    expect(m.run.objectiveDone).toBe(true);
    expect(g.save.flags.reportedMarcus).toBe(true);
  });
});

describe('#2 P1: The Printer Uprising', () => {
  it('today\'s generator, six jams and Hercules 400; resolve all seven and it is done', () => {
    const h = play(PRINTER);
    const g = h.g;
    const m = g.mission!;
    expect(g.level.recipe, 'today\'s generator').toBeUndefined();
    const jams = m.crowd.filter((a) => a.kind === 'jam');
    expect(jams).toHaveLength(7);
    expect(jams.filter((a) => a.name === 'Hercules 400' && a.elite !== null)).toHaveLength(1);
    expect(m.watch.tier, 'loud from the start').toBe(3);
    for (const a of jams) {
      a.hp = 0;
      resolveActor(g, a);
    }
    h.run(DT * 2);
    expect(m.run.objectiveDone).toBe(true);
  });

  it('the SLA (240 s of play) running out fails the card', () => {
    const h = play(PRINTER);
    const g = h.g;
    h.run(239, () => { g.save.sanity = 100; for (const a of g.mission!.crowd) a.stunned = 1e9; });
    expect(g.mission!.run.over).toBe(false);
    expect(h.missionHud?.goal).toMatch(/\(SLA [12] s\)$/);
    h.run(1.5, () => { g.save.sanity = 100; });
    expect(h.results?.head).toBe('CARD FAILED');
    expect(h.results?.rows.get('Finished')).toBe('Failed: The SLA ran out');
  });
});
