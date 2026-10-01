import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/crawler/state';

const source = readFileSync('scripts/helldesk-balance/bot.js', 'utf8');
const DT = 1 / 30;

interface Floor {
  floor: number; reason: string;
  floorSec: number; combatSec: number; combatShare: number; aggroEpisodes: number;
  aggroSec: number; aggroShare: number;
  activitySec: Record<'fighting' | 'walking' | 'terminal' | 'dialogue' | 'staffing' | 'idle' | 'other', number>;
  talkdowns: number; resolvesByForce: number;
}
interface Bot {
  run: (sec: number, floors?: number) => { steps: number };
  seed: (seed: number) => void;
  floors: Floor[];
  cur: Floor | null;
  policy: { buy: boolean; approach?: string };
  quiet?: boolean;
}

function career(mode = false) {
  const save = newSave(1);
  save.sanity = 20;
  const actor = { kind: 'user', hostile: true, resolved: false, aggro: true, pos: { x: 14, z: 0 } };
  const game = {
    save, time: 0, screen: 'play', actors: [actor], boss: null, projectiles: [],
    hitStop: 0,
    attackCd: 0, currentTerminal: null as object | null, lockpick: { open: false },
    loggedOn: new Set<string>(),
    markers: [] as { x: number; z: number; icon: string; color: string; label: string }[],
    input: { keys: new Set<string>(), pressed: new Set<string>(), holdAttack: () => undefined, holdBlock: () => undefined, tapAttack: () => undefined },
    settings: { keys: { forward: 'w', left: 'a', right: 'd', sprint: 'shift', quickuse: 'q', sneak: 'c', interact: 'e' } },
    player: { crouching: false, yaw: 0, pitch: 0, pos: { x: 0, z: 0, clone: () => ({ x: 0, z: 0 }) } },
    promptTarget: null as { kind: string; it: object } | null,
    level: {
      start: { x: 0, z: 0 }, w: 20, h: 1, roomOf: new Int16Array(20), solid: new Uint8Array(20),
      rooms: [], interactables: [] as { id: number; kind: string; x: number; z: number }[],
    },
    derivedCache: { maxSanity: 100, overload: 0, workload: 0, capacity: 3, weapon: { kind: 'melee', range: 2.5 } },
    hurtPlayer: () => undefined,
    onCombatDamage: () => undefined,
    close: () => { game.screen = 'play'; },
    goToWork: () => { game.screen = 'transition'; },
    step: (dt: number) => {
      if (game.screen !== 'play') return;
      if (game.hitStop > 0) { game.hitStop -= dt; return; }
      game.time += dt;
      onStep();
    },
  };
  let onStep = () => undefined;
  let onOverlay = () => undefined;
  const mission = { card: 'stapler', objectiveDone: false, over: false, spine: [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 5, z: 1 }],
    hud: { tier: 0, actors: [] as { id: number; visible: boolean; sort: string; x: number; z: number; patrol: { x: number; z: number }[] }[] },
  };
  const lock = { marker: '20%', left: '40%', width: '20%', clicks: 0 };
  const window = { __crawler: game, __helldesk: { rest: () => undefined, findPrompt: () => undefined,
    ...(mode ? { mission: () => mission } : {}),
  } };
  const document = {
    querySelectorAll: (selector: string) => selector === '.screen-btn' ? [{ click: () => onOverlay() }]
      : selector === '.dlg-opt' && game.screen === 'dialogue' ? [{ disabled: false, textContent: 'Continue', click: () => undefined }] : [],
    querySelector: (selector: string) => selector === '.lock-marker' ? { style: { left: lock.marker } }
      : selector === '.lock-zone' ? { style: { left: lock.left, width: lock.width } }
      : selector === '.lock-bar' ? { dispatchEvent: () => { lock.clicks++; } } : null,
  };
  runInNewContext(source, { window, document, performance: { now: () => 1000 }, MouseEvent: class { constructor(readonly type: string) {} } });
  const bot = (window as unknown as { __bot: Bot }).__bot;
  const tick = (n = 1, floors?: number) => { for (let i = 0; i < n; i++) bot.run(DT / 2, floors); };
  const finish = (floors?: number) => {
    onStep = () => { save.location = 'mokki'; };
    tick(1, floors);
    onStep = () => undefined;
    return bot.floors.at(-1);
  };
  return { game, actor, bot, tick, finish, mission, lock, onStep: (fn: () => undefined) => { onStep = fn; }, overlay: (fn: () => undefined) => { onOverlay = fn; } };
}

describe('floor combat measurements', () => {
  it('reports nearby aggro time including a boss, with force and talk-down deltas', () => {
    const c = career();
    c.game.save.stats.resolvedPeace = 7;
    c.game.save.stats.resolvedField = 11;
    c.tick(); // Exactly 14 m counts.
    c.actor.kind = 'boss';
    c.tick();
    c.actor.pos.x = 14.01;
    c.tick();
    c.actor.pos.x = 0;
    c.actor.resolved = true;
    c.tick();
    c.actor.resolved = false;
    c.actor.hostile = false;
    c.tick();
    c.actor.hostile = true;
    c.actor.aggro = false;
    c.tick();
    c.game.save.stats.resolvedPeace += 2;
    c.game.save.stats.resolvedField += 3;
    const floor = c.finish();
    expect(floor?.floorSec).toBeCloseTo(7 * DT);
    expect(floor?.combatSec).toBeCloseTo(2 * DT);
    expect(floor?.combatShare).toBeCloseTo(2 / 7);
    expect(floor?.aggroSec).toBeCloseTo(2 * DT);
    expect(floor?.aggroShare).toBeCloseTo(2 / 7);
    expect(floor).toMatchObject({ aggroEpisodes: 1, talkdowns: 2, resolvesByForce: 3 });
  });

  it('counts damage without nearby aggro, including the hit tick and exactly two more game seconds', () => {
    const c = career();
    c.actor.aggro = false;
    c.onStep(() => { c.game.onCombatDamage(); });
    c.tick();
    c.onStep(() => undefined);
    c.tick(60);
    const afterDamage = c.bot.cur!;
    expect(afterDamage.combatSec).toBeCloseTo(61 * DT);
    c.tick(30);
    const floor = c.finish()!;
    expect(floor.combatSec).toBeCloseTo(61 * DT);
    expect(floor.combatShare).toBeCloseTo(61 / 92);
    expect(floor.aggroSec).toBe(0);
    expect(floor.aggroShare).toBe(0);
    expect(floor.aggroEpisodes).toBe(1);
  });

  it('closes damage-only episodes after three quiet game seconds and forgets damage between floors', () => {
    const c = career();
    c.actor.aggro = false;
    const hit = () => {
      c.onStep(() => { c.game.onCombatDamage(); });
      c.tick();
      c.onStep(() => undefined);
    };
    hit();
    c.tick(149); // Two seconds of damage tail, then a gap shorter than three seconds.
    hit();
    c.tick(150);
    hit();
    expect(c.bot.cur?.aggroEpisodes).toBe(2);
    c.finish();
    c.game.save.location = 'office';
    c.game.save.floor = 1;
    c.tick();
    expect(c.bot.cur?.combatSec).toBe(0);
    expect(c.bot.cur?.aggroEpisodes).toBe(0);
  });

  it('merges short quiet gaps but starts a new fight after exactly 3 game seconds', () => {
    const c = career();
    c.tick();
    c.actor.aggro = false;
    c.tick(89);
    c.actor.aggro = true;
    c.tick();
    c.actor.aggro = false;
    c.tick(90);
    c.actor.aggro = true;
    c.tick();
    c.actor.aggro = false;
    const floor = c.finish();
    expect(floor?.aggroEpisodes).toBe(2);
    expect(floor?.combatSec).toBeCloseTo(3 * DT);
    expect(floor?.floorSec).toBeCloseTo(183 * DT);
  });

  it('excludes bot clock advances in menus and hit stop from both time counters', () => {
    const c = career();
    c.tick();
    c.game.screen = 'paused';
    c.tick(120);
    c.game.screen = 'play';
    c.game.hitStop = DT;
    expect(c.bot.run(DT / 2).steps).toBe(2);
    c.actor.aggro = false;
    const floor = c.finish();
    expect(c.game.time).toBeGreaterThan(4);
    expect(floor?.floorSec).toBeCloseTo(3 * DT);
    expect(floor?.combatSec).toBeCloseTo(2 * DT);
    expect(floor?.combatShare).toBeCloseTo(2 / 3);
    expect(floor?.aggroEpisodes).toBe(1);
  });

  it('stops at the requested floor count before starting another weekend', () => {
    const c = career();
    c.finish();
    c.game.screen = 'ending';
    expect(c.bot.run(60, 1).steps).toBe(1);
    expect(c.bot.floors).toHaveLength(1);
  });

  it('counts three real work floors across Friday, mokki and delayed Monday loading', () => {
    const c = career();
    c.game.save.seed = 1700000000;
    c.bot.seed(1700000000);
    c.bot.policy.buy = false;
    c.overlay(() => { c.game.screen = 'loading'; });
    const betweenFloors: (Floor | null)[] = [];
    for (let floor = 0; floor < 3; floor++) {
      c.tick(5, 3);
      c.finish(3);
      betweenFloors.push(c.bot.cur);
      if (floor === 2) break;
      c.tick(4, 3); // Loading waits for the next event-loop turn, with the old floor index.
      betweenFloors.push(c.bot.cur);
      c.game.save.location = 'office';
      c.tick(2, 3);
      betweenFloors.push(c.bot.cur);
      c.game.screen = 'play';
      c.tick(2, 3); // A closed Friday floor must not reopen before Monday arrives.
      betweenFloors.push(c.bot.cur);
      c.game.save.floor = floor + 1;
    }
    expect(c.bot.floors.map((f) => f.floor)).toEqual([0, 1, 2]);
    expect(c.bot.floors.every((f) => f.reason === 'friday' && f.floorSec > 0 && f.combatSec > 0)).toBe(true);
    expect(betweenFloors.every((f) => f === null)).toBe(true);
    expect(c.game.save).toMatchObject({ floor: 2, location: 'mokki' });
    expect(c.game.screen).toBe('play');
    expect(c.bot.run(60, 3).steps).toBe(1);
    expect(c.bot.floors).toHaveLength(3);
    expect(c.game.save.location).toBe('mokki');
  });

  it('starts the next floor with fresh fight time, episodes and resolve baselines', () => {
    const c = career();
    c.tick(5);
    c.game.save.stats.resolvedPeace = 4;
    c.finish();
    c.game.save.location = 'office';
    c.game.save.floor = 1;
    c.tick();
    const floor = c.bot.cur!;
    expect(floor.floorSec).toBeCloseTo(DT);
    expect(floor.combatSec).toBeCloseTo(DT);
    expect(floor.aggroEpisodes).toBe(1);
    expect(c.finish()).toMatchObject({ talkdowns: 0, resolvesByForce: 0 });
  });

  it('repeats the same fight or talk decisions on a fixed bot seed', () => {
    const decisions = (seed: number) => {
      const c = career();
      c.bot.seed(seed);
      c.game.save.sanity = 100;
      Object.assign(c.game.derivedCache, { weapon: { kind: 'melee' } });
      Object.assign(c.game.level, { w: 1, h: 1, roomOf: [0], solid: [0] });
      const choices: string[] = [];
      for (let i = 0; i < 24; i++) {
        const actor = { ...c.actor, pos: { x: 0, z: 0 }, resolved: false, talked: true, __bot: undefined as string | undefined };
        c.game.actors = [actor];
        c.tick();
        choices.push(actor.__bot ?? 'none');
        actor.resolved = true;
      }
      return choices;
    };
    const first = decisions(123);
    expect(first).toContain('talk');
    expect(first).toContain('fight');
    expect(decisions(123)).toEqual(first);
    expect(decisions(124)).not.toEqual(first);
  });
});

describe('floor activity breakdown', () => {
  it('separates approaching a hostile from fighting, staffing travel, waiting and other interactions', () => {
    const c = career();
    c.game.save.sanity = 100;
    c.bot.seed(1);
    c.tick(); // Walking toward an aggro actor is movement, not a fighting decision.
    c.actor.pos.x = 1;
    c.tick();
    c.actor.resolved = true;
    c.tick();
    c.game.markers = [{ x: 10, z: 0, icon: '📌', color: '#ffd54a', label: 'Staffed room' }];
    c.tick();
    c.game.player.pos.x = 10;
    c.tick();
    c.actor.resolved = false;
    c.actor.hostile = false;
    c.actor.pos.x = 11;
    c.game.markers = [{ x: 11, z: 0, icon: '!', color: '#ffe07a', label: 'Person' }];
    c.tick();
    const floor = c.finish()!;
    expect(floor.activitySec?.walking).toBeCloseTo(DT);
    expect(floor.activitySec.fighting).toBeCloseTo(DT);
    expect(floor.activitySec.staffing).toBeCloseTo(2 * DT);
    expect(floor.activitySec.idle).toBeCloseTo(DT);
    expect(floor.activitySec.other).toBeCloseTo(2 * DT);
    expect(Object.values(floor.activitySec).reduce((a, b) => a + b, 0)).toBeCloseTo(floor.floorSec);
    expect(floor.combatSec).toBeGreaterThan(floor.activitySec.fighting);
  });

  it('accounts for terminal reading, dialogue and paused waiting in game seconds, excluding hit stop and weekends', () => {
    const c = career();
    c.tick();
    c.game.screen = 'os';
    c.game.currentTerminal = {};
    c.tick(3);
    c.game.screen = 'dialogue';
    c.tick(3);
    c.game.screen = 'paused';
    c.tick(2);
    c.game.screen = 'play';
    c.game.hitStop = DT;
    expect(c.bot.run(DT / 2).steps).toBe(2);
    const floor = c.finish()!;
    expect(floor.activitySec?.terminal).toBeCloseTo(3 * DT);
    expect(floor.activitySec.dialogue).toBeCloseTo(3 * DT);
    expect(floor.activitySec.idle).toBeCloseTo(5 * DT);
    expect(floor.floorSec).toBeCloseTo(3 * DT);
    expect(Object.values(floor.activitySec).reduce((a, b) => a + b, 0)).toBeCloseTo(11 * DT);
    const recorded = { ...floor.activitySec };
    c.game.screen = 'loading';
    c.tick(3);
    expect(floor.activitySec).toEqual(recorded);
    c.game.save.location = 'office';
    c.game.save.floor = 1;
    c.game.screen = 'play';
    c.tick();
    expect(c.bot.cur?.activitySec.terminal).toBe(0);
    expect(c.bot.cur?.activitySec.dialogue).toBe(0);
    expect(c.bot.cur?.activitySec.idle).toBeCloseTo(DT);
  });

  it('reveals a thirty-minute wait when low sanity repeatedly sends the bot to a fallback that cannot heal it', () => {
    const c = career();
    c.bot.run(1800);
    const floor = c.finish()!;
    expect(floor.floorSec).toBeGreaterThanOrEqual(1800);
    expect(floor.activitySec?.idle).toBeCloseTo(floor.floorSec);
    expect(floor.activitySec.walking).toBe(0);
    expect(floor.activitySec.fighting).toBe(0);
  });
});


describe('mission approaches', () => {
  function card() {
    const c = career(true);
    c.game.save.sanity = 100;
    c.game.player.pos.x = 1; c.game.player.pos.z = 1;
    c.actor.hostile = false;
    c.game.markers = [{ x: 7, z: 1, icon: '◆', color: '#ffd54a', label: 'Closet' }];
    c.game.level.interactables = [{ id: 1, kind: 'locker', x: 7, z: 1 }, { id: 2, kind: 'elevator', x: 1, z: 1 }];
    return c;
  }

  it('crouches immediately, follows the spine without sprinting or attacking neutrals, uses the closet and returns to the lift', () => {
    const c = card();
    c.bot.policy.approach = 'quiet';
    let swings = 0;
    c.game.input.tapAttack = () => { swings++; };
    c.tick();
    expect(c.game.input.pressed.has('c')).toBe(true);
    expect(c.bot.quiet).toBe(true);
    expect(c.game.player.yaw).toBeCloseTo(-Math.PI / 2);
    expect(c.game.input.keys.has('w')).toBe(true);
    expect(c.game.input.keys.has('shift')).toBe(false);
    for (const x of [3, 5, 7]) { c.game.player.pos.x = x; c.tick(); }
    c.game.promptTarget = { kind: 'interact', it: c.game.level.interactables[0]! };
    c.tick();
    expect(c.game.input.pressed.has('e')).toBe(true);
    expect(swings).toBe(0);
    c.game.input.pressed.clear();
    c.game.promptTarget = null;
    c.mission.objectiveDone = true;
    c.game.markers = [{ x: 1, z: 1, icon: '◆', color: '#ffd54a', label: 'Lift' }];
    c.tick();
    expect(c.game.player.yaw).toBeCloseTo(Math.PI / 2);
    for (const x of [5, 3, 1]) { c.game.player.pos.x = x; c.tick(); }
    c.game.promptTarget = { kind: 'interact', it: c.game.level.interactables[1]! };
    c.tick();
    expect(c.game.input.pressed.has('e')).toBe(true);
  });

  it('waits at a route node for a learned nearby patroller moving toward the next node', () => {
    const c = card();
    const patrol = { id: 4, visible: true, sort: 'patrol', x: 8, z: 1, patrol: [{ x: 3, z: 1 }] };
    c.mission.hud.actors = [patrol];
    c.game.player.pos.x = 0;
    c.tick();
    c.game.player.pos.x = 1;
    patrol.x = 7;
    c.tick();
    expect(c.game.input.keys.has('w')).toBe(false);
    patrol.x = 8; // Moving away: carry on.
    c.tick();
    expect(c.game.input.keys.has('w')).toBe(true);
  });

  it.each(['quiet', 'auto'])('finishes by fighting after Alert with approach %s', (approach) => {
    const c = card();
    c.bot.policy.approach = approach;
    c.tick();
    c.game.player.crouching = true;
    c.actor.hostile = true; c.actor.pos.x = 1; c.actor.pos.z = 1;
    c.mission.hud.tier = 2;
    c.bot.policy.approach = approach;
    let swings = 0;
    c.game.input.tapAttack = () => { swings++; };
    c.bot.seed(1);
    c.tick();
    expect(c.bot.quiet).toBe(false);
    expect(swings).toBe(1);
    c.mission.over = true;
    c.tick();
    expect(swings).toBe(1); // Leave the results card up.
  });

  it('attempts a lock only with the visible marker inside the green zone', () => {
    const c = card();
    c.game.lockpick.open = true;
    c.tick();
    expect(c.lock.clicks).toBe(0);
    c.lock.marker = '50%';
    c.tick();
    expect(c.lock.clicks).toBe(1);
  });
});


describe('quiet policy honesty', () => {
  it('ignores hidden suspicion and raw patrol state, even if they claim Alert', () => {
    const c = career(true);
    c.game.save.sanity = 100;
    c.bot.policy.approach = 'quiet';
    c.game.player.pos.x = 1; c.game.player.pos.z = 1;
    c.game.markers = [{ x: 15, z: 1, icon: '◆', color: '#ffd54a', label: 'Closet' }];
    c.actor.hostile = false;
    const hidden = { suspicion: 100, patrol: [{ x: 3, z: 1 }] };
    Object.defineProperty(c.mission, 'actors', { get: () => { throw new Error('quiet read hidden suspicion'); } });
    Object.defineProperty(c.actor, 'suspicion', { get: () => { throw new Error('quiet read hidden suspicion'); } });
    Reflect.set(c.mission, 'hidden', hidden);
    c.tick();
    expect(c.bot.quiet).toBe(true);
    expect(c.game.input.keys.has('w')).toBe(true);
    expect(c.game.input.keys.has('shift')).toBe(false);
    c.game.input.keys.clear();
    hidden.suspicion = 0;
    c.tick();
    expect(c.bot.quiet).toBe(true);
    expect(c.game.input.keys.has('w')).toBe(true);
  });

  it('does not wait on a raw patrol route before the HUD reveals it or on a hidden patroller', () => {
    for (const visible of [true, false]) {
      const c = career(true);
      c.game.save.sanity = 100;
      c.game.markers = [{ x: 15, z: 1, icon: '◆', color: '#ffd54a', label: 'Closet' }];
      c.game.player.pos.x = 0; c.game.player.pos.z = 1;
      const a = { id: 4, visible, sort: 'patrol', x: 8, z: 1, patrol: visible ? [] : [{ x: 3, z: 1 }] };
      c.mission.hud.actors = [a];
      c.tick();
      c.game.player.pos.x = 1; a.x = 7;
      c.tick();
      expect(c.game.input.keys.has('w')).toBe(true);
    }
  });
});
