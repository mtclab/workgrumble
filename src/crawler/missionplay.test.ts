import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markResolved } from './combat';
import type { DialogueNode } from './dialogue';
import { type Actor, createActor, type GameCtx, type SpawnOpts, updateActor, walkClear } from './entities';
import { Game } from './game';
import { Hud, type HudFrame } from './hud';
import { flowField, generateLevel, type Level, lineOfSight, NEIGHBOURS8, toCell } from './level';
import type { MissionCard } from './mission';
import { type MissionView, MissionPlay } from './missionplay';
import { MISSIONS, STAPLER, VENDOR_DAY } from './missions';
import { placeQuestContent, questMarkers, questOf, startStage } from './questing';
import { EVIDENCE, mainChapter } from './quests';
import { Rng } from './rng';
import { derive, freshFloorState, newSave, type SaveState } from './state';
import { INVESTIGATE, inCone, sightRange, type Tier } from './stealth';
import { THEMES } from './textures';

vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * The real MissionPlay (the 0.3.0 spike) on the real recipe floors, headless:
 * a stand-in for the Game with what a mission reaches for, the real enemy AI
 * (`updateActor`) frame by frame, and a view that records instead of drawing.
 */
const DT = 1 / 30;

interface Shown {
  head: string;
  rows: Map<string, string>;
}

class Host implements GameCtx {
  readonly level: Level;
  readonly scene = new THREE.Scene();
  readonly actors: Actor[] = [];
  readonly floor: number;
  readonly difficulty = 1;
  time = 0;
  readonly stealth = 0;
  invisible = false;
  readonly staffStanding = 0;
  readonly managementStanding = 0;
  readonly findings = 0;
  readonly floorAwake = true;
  field: Int16Array;
  readonly save: SaveState = newSave(3);
  readonly derivedCache = derive(this.save);
  readonly player = { pos: new THREE.Vector3(), crouching: false, yaw: 0, pitch: 0 };
  readonly lockerItems = new Map<number, string>();
  readonly lights = [new THREE.PointLight()];
  readonly camera = new THREE.PerspectiveCamera();
  readonly toasts: string[] = [];
  readonly hud = { toast: (t: string): void => { this.toasts.push(t); } };
  readonly dialogues: DialogueNode[] = [];
  afterDialogue: (() => void) | null = null;
  readonly hits: string[] = [];
  shown: Shown | null = null;
  tiersDrawn: Tier[] = [];
  readonly rng = new Rng(17);
  readonly mission: MissionPlay;
  markers: Game['markers'];
  markersIn = 0.3;

  constructor(readonly card: MissionCard, seed: number, markers: Game['markers'] = []) {
    this.markers = markers;
    const theme = THEMES[card.floor % THEMES.length];
    if (theme === undefined) throw new Error('theme');
    this.level = generateLevel(card.floor, theme, seed, true, false, card.recipe);
    this.floor = card.floor;
    this.save.floor = card.floor;
    this.save.floorState = freshFloorState(card.floor);
    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    const view: MissionView = {
      draw: (tier) => { this.tiersDrawn.push(tier); },
      show: () => undefined,
      result: (head, _dead, rows) => { this.shown = { head, rows: new Map(rows) }; },
      dispose: () => undefined,
    };
    this.mission = new MissionPlay(this as unknown as Game, card, seed, true, view);
  }

  get playerPos(): THREE.Vector3 { return this.player.pos; }
  get watch(): MissionPlay['watch'] { return this.mission.watch; }

  spawnAt(kind: Actor['kind'], x: number, z: number, room: number, _aggro: boolean, opts: SpawnOpts = {}): Actor {
    const a = createActor(this, kind, x, z, room, this.rng, 10, opts);
    this.actors.push(a);
    return a;
  }

  addRep(n: number): void { this.save.rep += n; }
  standing(f: 'management' | 'staff', n: number): void { this.save.standing[f] += n; }
  openDialogue(node: DialogueNode): void { this.dialogues.push(node); }
  noticed(a: Actor): void { this.mission.aggroed(a); }

  hurtPlayer(): void { this.hits.push('hurt'); }
  fire(p: { hostile: boolean }): void { if (p.hostile) this.hits.push('fire'); }
  hazard(): void { /* none */ }
  rootPlayer(): void { this.hits.push('root'); }
  markResolved(a: Actor): void { markResolved(this as unknown as Game, a); }
  spawn(): Actor | null { return null; }
  enqueueTicket(): void { /* rides on a hit */ }
  floatText(): void { /* nothing to draw */ }
  healPlayer(): void { /* none */ }
  addActionItem(): void { /* rides on a hit */ }
  shake(): void { /* camera only */ }
  giveItem(): void { /* none */ }
  giveAmmo(): void { /* none */ }
  helperDamageMult(): number { return 1; }
  healerFrequency(): number { return 1; }
  kitchenStanding(): number { return 0; }
  ticketTitle(): string { return 'My printer'; }
  bossStart(): void { /* no bosses */ }
  bossLeash(): void { /* no bosses */ }
  bossParley(): void { /* no bosses */ }
  stealRep(): number { return 0; }
  windupCue(): void { /* sound only */ }
  telegraph(): void { /* a marking */ }

  /** Play `seconds`: the people, and the mission's frame, as the game runs them. */
  step(seconds: number, each?: () => void): void {
    for (let t = 0; t < seconds; t += DT) {
      this.time += DT;
      each?.();
      for (const a of this.actors) updateActor(this, a, DT);
      this.mission.update(DT, false);
    }
  }

  hr(): Actor {
    const a = this.mission.crowd.find((x) => this.mission.watch.watchers.get(x.id)?.tag === 'hr');
    if (a === undefined) throw new Error('no HR');
    return a;
  }
}

function reachable(level: Level, field: Int16Array, x: number, z: number): boolean {
  const cx = toCell(x);
  const cz = toCell(z);
  if ((field[cz * level.w + cx] ?? -1) >= 0) return true;
  return NEIGHBOURS8.some(([ox, oz]) => (field[(cz + oz) * level.w + cx + ox] ?? -1) >= 0);
}

const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 6007);

class HudNode {
  className = '';
  textContent = '';
  children: HudNode[] = [];
  style = { display: '', setProperty: () => undefined };
  dataset = {};
  classList = { contains: () => false, toggle: () => undefined, add: () => undefined, remove: () => undefined };
  append(...children: HudNode[]): void { this.children.push(...children); }
  replaceChildren(...children: HudNode[]): void { this.children = children; }
  getContext(): object { return {}; }
}

/** The harness's world through the real Game HUD and quest entry points. */
function hudGame(h: Host): Game {
  const g = Object.create(Game.prototype) as Game;
  Object.assign(g, {
    save: h.save, level: h.level, scene: h.scene, actors: h.actors, player: h.player,
    mission: h.mission, derivedCache: h.derivedCache, lockerItems: h.lockerItems,
    pickups: [], floaters: [], levelRng: h.rng, lootRng: new Rng(7), boss: null, mentorAsk: null,
    markers: [], elevatorOpen: true, screen: 'play', input: { locked: true }, prompt: '',
    faceMood: 'normal', chargeT: 0, effects: () => [], ammoText: () => 'Melee',
    spawnAt: h.spawnAt.bind(h),
  });
  return g;
}

function drawHud(g: Game): { frame: HudFrame; quests: HudNode; floor: HudNode } {
  vi.stubGlobal('document', { createElement: () => new HudNode() });
  const drawing = Hud.prototype as unknown as { drawFace: () => void; drawMini: () => void };
  vi.spyOn(drawing, 'drawFace').mockImplementation(() => undefined);
  vi.spyOn(drawing, 'drawMini').mockImplementation(() => undefined);
  const mount = new HudNode();
  const hud = new Hud(mount as unknown as HTMLElement);
  g.derivedCache = derive(g.save);
  const frame = (g as unknown as { hudFrame(): HudFrame }).hudFrame();
  hud.update(frame, DT);
  const children = mount.children[0]!.children;
  return { frame, quests: children.find((n) => n.className === 'hud-quests')!, floor: children.find((n) => n.className === 'hud-floor')! };
}

describe.each(MISSIONS.map((m) => [m.id, m] as const))('mission HUD %s', (_id, card) => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('hides and empties the ordinary quest tracker', () => {
    const g = hudGame(new Host(card, 77));
    g.save.questLog.push({ id: 'descaler', stage: 0, progress: 0, done: false, floor: card.floor });
    const { frame, quests } = drawHud(g);
    expect(frame.questLines, 'mission HUD has no ordinary quest lines').toEqual([]);
    expect(quests.textContent).toBe('');
    expect(quests.style.display).toBe('none');
  });

  it('places no ordinary story evidence, side-quest givers or quest markers', () => {
    const g = hudGame(new Host(card, 77));
    const crowd = g.actors.map((a) => a.name);
    const lockers = [...g.lockerItems];
    placeQuestContent(g);
    expect(g.actors.map((a) => a.name), 'mission has only its own crowd, no ordinary quest givers').toEqual(crowd);
    expect([...g.lockerItems], 'mission has only its own closet item').toEqual(lockers);
    expect(g.pickups).toEqual([]);
    expect(g.actors.some((a) => questOf(a) !== undefined)).toBe(false);
  });

  it('cannot place an ordinary side quest when its stage starts', () => {
    const g = hudGame(new Host(card, 77));
    const lockers = [...g.lockerItems];
    const st = { id: 'descaler', stage: 0, progress: 0, done: false, floor: card.floor };
    g.save.questLog.push(st);
    startStage(g, st);
    expect([...g.lockerItems], 'ordinary side-quest items stay off a mission').toEqual(lockers);
    expect(g.pickups).toEqual([]);
  });

  it('shows only card objectives on the compass and map', () => {
    const g = hudGame(new Host(card, 77));
    const locker = g.level.interactables.find((it) => it.kind === 'locker' && !g.lockerItems.has(it.id))!;
    g.lockerItems.set(locker.id, 'descaler');
    g.save.questLog.push({ id: 's-printers', stage: 0, progress: 0, done: false, floor: card.floor, staffed: true });
    const expected = card.objective.kind === 'take' ? ["HR's closet"] : g.actors.filter((a) => a.kind === 'vendor').map((a) => a.name);
    expect(questMarkers(g).map((m) => m.label), 'mission compass has only card objectives').toEqual(expected);
    for (const a of g.actors) a.resolved = true;
    g.save.questItems.push('redstapler');
    g.mission!.update(DT, false);
    expect(questMarkers(g).map((m) => m.label)).toEqual(['The lift']);
  });

  it('replaces cached ordinary compass targets as soon as the card loads', () => {
    const h = new Host(card, 77, [{ x: 0, z: 0, icon: '!', color: '#ffd54a', label: 'Ordinary floor objective' }]);
    const expected = card.objective.kind === 'take' ? ["HR's closet"] : h.mission.crowd.filter((a) => a.kind === 'vendor').map((a) => a.name);
    expect(h.markers.map((m) => m.label), 'mission immediately replaces ordinary compass targets').toEqual(expected);
    expect(h.markersIn).toBe(0);
  });

  it('names the card place and title on the floor label', () => {
    const g = hudGame(new Host(card, 77));
    const place = card.id === 'stapler' ? 'HR corridor' : 'Atrium loop';
    expect(drawHud(g).floor.textContent, 'mission floor label names the card place').toBe(`${place} - ${card.title}`);
    g.mission = { card: { ...card, place: 'Test corridor' } } as MissionPlay;
    expect(drawHud(g).floor.textContent).toBe(`Test corridor - ${card.title}`);
  });

  it('keeps ordinary trackers, story evidence, givers and floor labels without a mission', () => {
    const g = hudGame(new Host(card, 77));
    g.mission = null;
    g.actors.length = 0;
    g.lockerItems.clear();
    g.save.questLog.push({ id: 'descaler', stage: 0, progress: 0, done: false, floor: card.floor });
    placeQuestContent(g);
    const { frame, quests, floor } = drawHud(g);
    expect(frame.questLines).toContain('Workload 1/3');
    expect(frame.questLines.some((line) => line.includes('Phoenix:'))).toBe(true);
    expect(frame.questLines.some((line) => line.includes('The Coffee Cartel'))).toBe(true);
    expect(quests.textContent).toContain('QUESTS & TASKS');
    expect(quests.style.display).toBe('block');
    expect(floor.textContent).toBe(`Floor ${card.floor === 0 ? 'B1' : card.floor} - ${THEMES[card.floor]!.name}`);
    const items = [...g.lockerItems.values(), ...g.pickups.filter((p) => p.kind === 'quest').map((p) => p.id)];
    expect(items).toContain(mainChapter(card.floor)!.evidence!.item);
    expect(items.some((id) => (EVIDENCE as readonly string[]).includes(id))).toBe(true);
    expect(items).toContain('descaler');
    expect(g.actors.some((a) => questOf(a) !== undefined)).toBe(true);
    expect(questMarkers(g).some((m) => m.label.includes('Descaler'))).toBe(true);
  });
});

describe.each(MISSIONS.map((m) => [m.id, m] as const))('card %s', (_id, card) => {
  it('places its whole crowd where the lift reaches, on 150 seeds', { timeout: 60_000 }, () => {
    const want = card.crowd.reduce((n, c) => n + (c.count ?? 1), 0);
    for (const seed of SEEDS) {
      const h = new Host(card, seed);
      const field = flowField(h.level, h.level.start.x, h.level.start.z, 32000);
      expect(h.mission.crowd, `seed ${seed}`).toHaveLength(want);
      for (const a of h.mission.crowd) {
        // People stand on open floor the lift reaches (no squeezing a neighbour in, as for a desk).
        expect(field[toCell(a.pos.z) * h.level.w + toCell(a.pos.x)], `seed ${seed}: ${a.kind} on a reachable cell`).toBeGreaterThanOrEqual(0);
        expect(a.hostile).toBe(true);
        expect(a.aggro, 'nobody arrives already after you').toBe(false);
        for (const p of h.mission.watch.watchers.get(a.id)?.route ?? []) expect(reachable(h.level, field, p.x, p.z), `seed ${seed}: patrol point`).toBe(true);
      }
      if (card.objective.kind === 'take') {
        const closet = h.level.recipe?.closet ?? -1;
        expect(h.lockerItems.get(closet), `seed ${seed}: the stapler is in HR's closet`).toBe(card.objective.item);
        expect(h.hr().name).toBe('Hilary from HR');
        expect(h.mission.watch.watchers.get(h.hr().id)?.route.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('the stapler (sneaky)', () => {
  it('HR walks a seeded patrol, pausing 2-4 s at each corridor node, the same route on a reload', () => {
    const h = new Host(STAPLER, 4242);
    const again = new Host(STAPLER, 4242);
    const w = h.mission.watch.watchers.get(h.hr().id);
    if (w === undefined) throw new Error('no watcher');
    expect(again.mission.watch.watchers.get(again.hr().id)?.route).toEqual(w.route);
    for (const p of w.pauses) {
      expect(p).toBeGreaterThanOrEqual(2);
      expect(p).toBeLessThanOrEqual(4);
    }
    // Out of everyone's sight: HR keeps to the route.
    h.invisible = true;
    const visits = new Set<number>();
    const dwell = new Map<number, number>();
    h.step(240, () => {
      const a = h.hr();
      w.route.forEach((p, i) => {
        if (Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 1) {
          visits.add(i);
          dwell.set(i, (dwell.get(i) ?? 0) + DT);
        }
      });
    });
    expect([...visits].sort()).toEqual(w.route.map((_, i) => i));
    expect(w.mood).toBe('calm');
    // Each stop is a pause of 2-4 s at least once (several laps add up).
    for (const [i, t] of dwell) expect(t, `stop ${i}`).toBeGreaterThanOrEqual(1.9);
    expect(h.mission.watch.tier).toBe(0);
  });

  it('a quiet finish at the lift pays the card plus 40%, and Management +3, Staff +2', () => {
    const h = new Host(STAPLER, 99);
    h.invisible = true;
    h.step(5);
    h.save.questItems.push('redstapler');
    h.step(0.2);
    const rep = h.save.rep;
    const { management, staff } = h.save.standing;
    h.mission.lift();
    expect(h.save.rep - rep).toBe(STAPLER.value + Math.round(STAPLER.value * 0.4));
    expect(h.save.standing.management - management).toBe(3);
    expect(h.save.standing.staff - staff).toBe(2);
    expect(h.shown?.head).toBe('CARD CLOSED');
    expect(h.shown?.rows.get('Finished')).toBe('Finished quiet');
    expect(h.shown?.rows.get('Escalation reached')).toBe('Quiet');
  });

  it('HR noticing you, even only to Noticed, loses the quiet bonus', () => {
    const h = new Host(STAPLER, 99);
    h.mission.watch.noise('gun', h.hr().pos.x, h.hr().pos.z, h.time);
    h.step(0.2);
    expect(h.mission.watch.watchers.get(h.hr().id)?.peak).toBeGreaterThanOrEqual(INVESTIGATE);
    h.save.questItems.push('redstapler');
    h.step(0.2);
    const rep = h.save.rep;
    h.mission.lift();
    expect(h.save.rep - rep).toBe(STAPLER.value);
    expect(h.shown?.rows.get('Finished')).toBe('Finished loud (HR noticed you)');
  });

  it('a loud finish pays the card and shows the resolves it paid on the way', () => {
    const h = new Host(STAPLER, 99);
    const [first, second] = h.mission.crowd.filter((a) => a.kind === 'user');
    if (first === undefined || second === undefined) throw new Error('no users');
    // Hit one (they are Alert), resolve two: what the combat code does, by hand.
    h.noticed(first);
    expect(h.mission.watch.tier).toBe(2);
    first.resolved = true;
    second.resolved = true;
    h.save.questItems.push('redstapler');
    h.step(0.2);
    const rep = h.save.rep;
    h.mission.lift();
    expect(h.save.rep - rep).toBe(STAPLER.value);
    expect(h.shown?.rows.get('Finished')).toBe('Finished loud (it reached Alert)');
    expect(h.shown?.rows.get('Rep')).toContain(`resolves ${first.rep + second.rep}`);
  });

  it('the lift before the stapler asks first; Abort closes the card unpaid', () => {
    const h = new Host(STAPLER, 99);
    const rep = h.save.rep;
    h.mission.lift();
    expect(h.shown).toBeNull();
    const node = h.dialogues[0];
    const abort = node?.options.find((o) => o.label.startsWith('Abort'));
    expect(node?.options.find((o) => o.leave === true)?.label).toBe('Not yet.');
    abort?.pick();
    h.afterDialogue?.();
    expect(h.shown?.head).toBe('CARD ABORTED');
    expect(h.save.rep).toBe(rep);
    expect(h.mission.run.over).toBe(true);
  });

  it('a lock picked in view is a crime: the witness is Alert', () => {
    const h = new Host(STAPLER, 99);
    const u = h.mission.crowd.find((a) => a.kind === 'user');
    if (u === undefined) throw new Error('no user');
    h.mission.crime([u]);
    expect(u.aggro).toBe(true);
    expect(h.mission.watch.watchers.get(u.id)?.mood).toBe('alert');
    expect(h.mission.run.maxTier).toBe(2);
    // ...and still nobody strikes inside the pause and a wind-up.
    h.player.pos.set(u.pos.x, 0, u.pos.z + 1.6);
    h.step(0.8);
    expect(h.hits).toEqual([]);
  });
});

describe('vendor day (loud)', () => {
  it('starts Escalated: the vendors and the consultant come for you on sight', () => {
    const h = new Host(VENDOR_DAY, 77);
    expect(h.mission.watch.tier).toBe(3);
    expect(h.mission.crowd.filter((a) => a.kind === 'vendor')).toHaveLength(4);
    expect(h.mission.crowd.filter((a) => a.kind === 'consultant')).toHaveLength(1);
    const v = h.mission.crowd.find((a) => a.kind === 'vendor');
    if (v === undefined) throw new Error('no vendor');
    h.player.pos.set(v.pos.x + 3, 0, v.pos.z);
    h.step(0.2);
    expect(v.aggro).toBe(true);
  });

  it('is done when the four vendors are resolved, and pays loud', () => {
    const h = new Host(VENDOR_DAY, 77);
    const vendors = h.mission.crowd.filter((a) => a.kind === 'vendor');
    for (const v of vendors.slice(0, 3)) v.resolved = true;
    h.step(0.1);
    expect(h.mission.run.objectiveDone).toBe(false);
    expect(h.mission.liftPrompt()).toContain('not done');
    vendors[3]!.resolved = true;
    h.step(0.1);
    expect(h.mission.run.objectiveDone).toBe(true);
    h.mission.lift();
    expect(h.shown?.rows.get('Finished')).toBe('Finished loud (it reached Escalated)');
    expect(h.shown?.rows.get('Escalation reached')).toBe('Escalated');
  });
});

describe('the browser test\'s setups (e2e/helldesk-mission.spec.ts) exist', () => {
  const seeds = [4242, ...SEEDS.slice(0, 40)];

  it.each(seeds)('stapler seed %i: nine metres down the spine are walkable and out of everyone\'s sight', (seed) => {
    const h = new Host(STAPLER, seed);
    expect(h.mission.toSpine()).toBe(true);
    const p = h.player.pos.clone();
    const fx = -Math.sin(h.player.yaw);
    const fz = -Math.cos(h.player.yaw);
    expect(walkClear(h.level, p.x, p.z, p.x + fx * 9, p.z + fz * 9), 'a straight walk').toBe(true);
    for (let d = 0; d <= 9; d += 0.5) {
      const x = p.x + fx * d;
      const z = p.z + fz * d;
      for (const a of h.mission.crowd) {
        const seen = Math.hypot(a.pos.x - x, a.pos.z - z) <= sightRange(a.kind) && inCone(a.yaw, a.pos.x, a.pos.z, x, z) && lineOfSight(h.level, a.pos.x, a.pos.z, x, z);
        expect(seen, `${a.name} sees ${d} m down the spine`).toBe(false);
      }
    }
  });

  it.each(seeds)('stapler seed %i: someone at a desk can be stood in front of, and notices you', (seed) => {
    const h = new Host(STAPLER, seed);
    const desk = h.mission.crowd.filter((a) => h.mission.watch.watchers.get(a.id)?.sort === 'desk' && h.mission.watch.watchers.get(a.id)?.tag === null);
    const who = desk.find((a) => h.mission.standInView(a.id, 3.5));
    expect(who, 'a desk with room in front of it').toBeDefined();
    if (who === undefined) return;
    expect(inCone(who.yaw, who.pos.x, who.pos.z, h.player.pos.x, h.player.pos.z)).toBe(true);
    h.step(4, () => { h.mission.standInView(who.id, 3.5); });
    expect(h.mission.watch.tier).toBeGreaterThanOrEqual(1);
    expect(h.mission.watch.watchers.get(who.id)?.bark).not.toBe('');
  });
});


describe('mission measurements match the results card', () => {
  it('keeps the first tier times, counts noise and exposes the actual Rep on the card', () => {
    const h = new Host(STAPLER, 17);
    const m = h.mission;
    m.run.tick(12);
    m.noise('swing');
    const hr = m.crowd[0]!;
    m.aggroed(hr);
    m.run.tick(9);
    m.aggroed(m.crowd[1]!);
    m.run.took('redstapler');
    m.finish('done');
    expect(m.debug()).toMatchObject({ seconds: 21, detectedAt: 12, noticedAt: 12, noiseEvents: 1,
      result: { repTotal: 120, base: 120, bonus: 0, perResolve: 0, quiet: false } });
    expect(h.shown?.rows.get('Rep')).toBe('+120 (card 120, quiet bonus 0, resolves 0)');
    expect(new Host(VENDOR_DAY, 17).mission.debug().detectedAt).toBe(0);
  });
});
