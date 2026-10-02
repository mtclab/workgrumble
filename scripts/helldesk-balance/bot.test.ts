import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/crawler/state';
import { type DialogueNode } from '../../src/crawler/dialogue';
import { type Actor } from '../../src/crawler/entities';
import { type StoryHost, talkHealer, talkHelper, talkTonttu } from '../../src/crawler/story';
import { type QuestHost, talkGiver } from '../../src/crawler/quests';
import { teamNote } from '../../src/crawler/teamwork';

const source = readFileSync('scripts/helldesk-balance/bot.js', 'utf8');
const DT = 1 / 30;

interface Floor {
  where: string; floor: number; reason: string;
  floorSec: number; combatSec: number; combatShare: number; aggroEpisodes: number;
  aggroSec: number; aggroShare: number;
  activitySec: Record<'fighting' | 'walking' | 'terminal' | 'dialogue' | 'staffing' | 'idle' | 'other', number>;
  talkdowns: number; resolvesByForce: number;
  longestDialogue: { speaker: string; title: string; seconds: number } | null;
}
interface Bot {
  run: (sec: number, floors?: number) => { steps: number; longestDialogue: Floor['longestDialogue'] };
  seed: (seed: number) => void;
  floors: Floor[];
  cur: Floor | null;
  policy: { buy: boolean; approach?: string; talk?: number; hubMinutes?: number };
  ended?: boolean;
  quiet?: boolean;
}

function career(mode = false) {
  const save = newSave(1);
  // On the week's P1 floor (a new career's save starts on the hub).
  save.location = 'office';
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
    promptTarget: null as { kind: 'interact'; it: object } | { kind: 'actor'; a: object } | null,
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
  let dialogue: DialogueNode | null = null;
  const answers: string[] = [];
  const openDialogue = (node: DialogueNode) => { dialogue = node; game.screen = 'dialogue'; };
  const options = () => dialogue?.options.map((o, i) => ({
    disabled: o.disabled === true,
    textContent: `${i + 1}. ${o.tag === undefined ? '' : `[${o.tag}] `}${o.label}`,
    click: () => {
      if (o.disabled) return;
      answers.push(o.label);
      const next = o.pick();
      if (next === null) { dialogue = null; game.screen = 'play'; }
      else openDialogue(next);
    },
  })) ?? [{ disabled: false, textContent: 'Continue', click: () => undefined }];
  const mission = { card: 'stapler', objectiveDone: false, over: false, spine: [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 5, z: 1 }],
    hud: { tier: 0, actors: [] as { id: number; visible: boolean; sort: string; x: number; z: number; patrol: { x: number; z: number }[] }[] },
  };
  const lock = { marker: '20%', left: '40%', width: '20%', clicks: 0 };
  const window = { __crawler: game, __helldesk: { rest: () => undefined, findPrompt: () => undefined,
    ...(mode ? { mission: () => mission } : {}),
  } };
  const document = {
    querySelectorAll: (selector: string) => selector === '.screen-btn' ? [{ click: () => onOverlay() }]
      : selector === '.dlg-opt' && game.screen === 'dialogue' ? options() : [],
    querySelector: (selector: string) => selector === '.lock-marker' ? { style: { left: lock.marker } }
      : selector === '.lock-zone' ? { style: { left: lock.left, width: lock.width } }
      : selector === '.lock-bar' ? { dispatchEvent: () => { lock.clicks++; } }
      : selector === '.dlg' && dialogue ? { innerText: `${dialogue.speaker}\n${dialogue.subtitle ?? ''}\n${dialogue.text}` }
      : selector === '.dlg-head b' && dialogue ? { textContent: dialogue.speaker }
      : selector === '.dlg-head span' && dialogue ? { textContent: dialogue.subtitle ?? '' } : null,
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
  return { game, actor, bot, tick, finish, mission, lock, openDialogue, answers, helldesk: window.__helldesk as Record<string, unknown>, onStep: (fn: () => undefined) => { onStep = fn; }, overlay: (fn: () => undefined) => { onOverlay = fn; } };
}

describe('work-floor dialogues', () => {
  it('gets back to work instead of reopening Kev\'s not-at-the-Peak refusal on every tick, including next floor', () => {
    const c = career();
    c.game.save.sanity = 100;
    Object.assign(c.actor, { id: 1, name: 'Kev from Sales', kind: 'npc', hostile: false, npcId: 'kev', questTag: null, pos: { x: 0, z: 0 } });
    const quest = { id: 'karaoke', stage: 0, progress: 0, done: false, floor: 0 };
    c.game.save.questLog.push(quest);
    c.game.markers = [{ x: 0, z: 0, icon: '?', color: '#ffd54a', label: 'Kev from Sales' }];
    c.game.promptTarget = { kind: 'actor', a: c.actor };
    let peak = false;
    const host = {
      questLog: c.game.save.questLog,
      atPeak: () => peak,
      standing: () => undefined,
      addRep: (n: number) => { c.game.save.rep += n; },
      journal: () => undefined,
      questEvent: () => { quest.done = true; c.game.markers = []; },
    } as unknown as QuestHost;
    const answer = () => {
      if (c.game.input.pressed.delete('e')) c.openDialogue(talkGiver(host, 'karaoke', 'Kev from Sales'));
      return undefined;
    };
    for (let floor = 0; floor < 2; floor++) {
      c.game.save.floor = floor;
      delete (c.actor as typeof c.actor & { __talkedAt?: number }).__talkedAt;
      c.onStep(answer);
      c.tick(300);
      expect(c.answers, 'Kev must not hold the floor in repeated refusal dialogues').toHaveLength(floor + 1);
      expect(c.bot.cur?.activitySec.dialogue).toBeLessThan(1);
      expect(c.bot.cur?.floorSec).toBeGreaterThan(9);
      expect(c.game.screen).toBe('play');
      expect(quest.done).toBe(false);
      c.finish();
      c.game.save.location = 'office';
    }
    c.game.save.floor = 2;
    c.onStep(answer);
    c.tick(300);
    peak = true;
    c.tick(1800);
    expect(quest.done, 'A later visit at the Peak must still complete the quest').toBe(true);
    expect(c.game.markers).toHaveLength(0);
    expect(c.game.screen).toBe('play');
  });

  function colleague(c: ReturnType<typeof career>) {
    const actor = { name: 'Test colleague', kind: 'helper', role: 'intern', npcId: null, recruited: false, morale: 50, memo: {}, giftGiven: true } as Actor;
    const host = {
      save: c.game.save,
      runeDiscount: () => 1,
      addRep: (n: number) => { c.game.save.rep += n; },
      learnSpell: (id: string) => { c.game.save.spells.push(id); return true; },
      trainSkill: () => { c.game.save.skills.runecraft.value++; },
      teamNote,
      treatOptions: () => [],
      tooTired: () => false,
      tip: () => undefined,
      standing: () => undefined,
      evidence: () => 0,
      healPlayer: (n: number) => { c.game.save.sanity += n; },
    } as unknown as StoryHost;
    return { actor, host };
  }

  it.each([0, 100])('takes at most one sauna lesson and leaves within a few seconds at magic skill %i', (skill) => {
    const c = career();
    c.tick();
    const { actor, host } = colleague(c);
    c.game.save.rep = 1000000;
    c.game.save.skills.runecraft.value = skill;
    c.openDialogue(talkTonttu(host, actor));
    for (let n = 0; n < 90 && c.game.screen === 'dialogue'; n++) c.tick();
    expect(c.game.screen, 'The sauna elf must let the bot return to work').toBe('play');
    expect(c.answers).toHaveLength(2);
    expect(c.answers.at(-1)).toBe('Heippa. (Leave)');
    expect(c.bot.cur?.longestDialogue?.seconds).toBeLessThan(3);
    expect(c.game.save.rep).toBeGreaterThan(999000);
  });

  it('leaves the sauna without spending when purchases are off or no lesson is affordable', () => {
    const c = career();
    c.tick();
    const { actor, host } = colleague(c);
    for (const buy of [false, true]) {
      c.bot.policy.buy = buy;
      c.game.save.rep = buy ? 0 : 1000;
      const rep = c.game.save.rep;
      c.openDialogue(talkTonttu(host, actor));
      c.tick();
      expect(c.answers.at(-1)).toBe('Heippa. (Leave)');
      expect(c.game.screen).toBe('play');
      expect(c.game.save.rep).toBe(rep);
    }
  });

  it('walks away from an optional colleague when recruitment does not apply', () => {
    const c = career();
    c.tick();
    const { actor, host } = colleague(c);
    actor.role = 'spirit';
    Object.assign(c.bot.policy, { recruit: false });
    c.openDialogue(talkHelper(host, actor));
    c.tick();
    expect(c.game.screen, 'An unwanted recruitment conversation must close').toBe('play');
    expect(actor.recruited).toBe(false);
    expect(c.answers).toEqual(['Not now.']);
  });

  it('returns to work with tea instead of asking for gossip when no kitchen task applies', () => {
    const c = career();
    c.tick();
    const { actor, host } = colleague(c);
    c.game.save.sanity = 50;
    c.openDialogue(talkHealer(host, actor));
    c.tick();
    expect(c.game.screen, 'The kitchen visit must finish once there is nothing to ask for').toBe('play');
    expect(c.game.save.sanity).toBe(56);
    expect(c.answers).toEqual(['Thanks. Back to it.']);
  });

  it('names the longest continuous dialogue across run calls, keeps its opening title and resets next floor', () => {
    const c = career();
    c.tick();
    const { actor, host } = colleague(c);
    c.game.save.rep = 1000;
    c.openDialogue(talkTonttu(host, actor));
    c.tick(2);
    const longest = c.bot.cur?.longestDialogue;
    expect(longest, 'Every work floor must name its longest dialogue').toMatchObject({ speaker: 'Saunatonttu', title: 'The sauna elf' });
    expect(longest?.seconds).toBeCloseTo(3 * DT);
    c.openDialogue({ speaker: 'Test caller', subtitle: 'Short call', text: '', options: [{ label: 'Hang up', pick: () => null }] });
    c.tick();
    const floor = c.finish()!;
    expect(floor.longestDialogue).toEqual(longest);
    c.game.save.location = 'office';
    c.game.save.floor++;
    c.tick();
    expect(c.bot.cur?.longestDialogue).toBeNull();
    expect(floor.longestDialogue).toEqual(longest);
  });

  it('records an ongoing stall before the dialogue or floor ends', () => {
    const c = career();
    c.tick();
    const node: DialogueNode = {
      speaker: 'Test caller', subtitle: 'Unfinished call', text: '',
      options: [{ label: 'Continue', pick: () => node }],
    };
    c.openDialogue(node);
    c.tick(149);
    const status = c.bot.run(DT / 2);
    expect(c.game.screen).toBe('dialogue');
    expect(status.longestDialogue, 'Runner snapshots must name a live stall').toMatchObject({ speaker: 'Test caller', title: 'Unfinished call' });
    expect(status.longestDialogue?.seconds).toBeCloseTo(5);
    expect(c.bot.cur?.longestDialogue, 'A live stall must identify itself in the current floor').toMatchObject({ speaker: 'Test caller', title: 'Unfinished call' });
    expect(c.bot.cur?.longestDialogue?.seconds).toBeCloseTo(5);
    expect(c.bot.cur?.activitySec.dialogue).toBeCloseTo(5);
  });
});

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


describe('the hub', () => {
  /** The lift's buttons as the game offers them (interact.ts liftNode), each recording what it did. */
  function liftNode(labels: string[], did: string[]): DialogueNode {
    return { speaker: 'The lift', subtitle: 'The hub', text: '', options: labels.map((label) => ({ label, ...(label === 'Not yet.' ? { leave: true } : {}), pick: () => { did.push(label); return null; } })) };
  }

  it('a career on the hub walks to the lift and goes up; on the P1, with its boss resolved, it takes Friday', () => {
    const c = career();
    const did: string[] = [];
    const lift = { id: 90, kind: 'elevator', x: 2, z: 0 };
    c.game.level.interactables.push(lift);
    c.game.actors = [];
    c.game.save.sanity = 100;
    c.game.save.location = 'hub';
    c.game.promptTarget = { kind: 'interact', it: lift };
    c.onStep(() => {
      if (c.game.input.pressed.delete('e')) c.openDialogue(liftNode(c.game.save.location === 'hub' ? ['Floor B1: the major incident', 'Not yet.'] : ['Back to the hub', 'Friday: to the mökki', 'Not yet.'], did));
      return undefined;
    });
    for (let i = 0; i < 60 && did.length === 0; i++) c.tick();
    expect(did, 'up to the major incident').toEqual(['Floor B1: the major incident']);
    expect(c.bot.floors, 'nothing measured on the hub').toEqual([]);
    // Upstairs, its boss resolved: the lift is for Friday.
    c.game.save.location = 'office';
    Object.assign(c.game, { elevatorOpen: true });
    for (let i = 0; i < 60 && did.length === 1; i++) c.tick();
    expect(did).toEqual(['Floor B1: the major incident', 'Friday: to the mökki']);
  });

  it('a hub-only week answers walk-ups, never takes the lift, and ends with the hub\'s combat share', () => {
    const c = career();
    const did: string[] = [];
    const lift = { id: 90, kind: 'elevator', x: 2, z: 0 };
    c.game.level.interactables.push(lift);
    const walker = { id: 7, name: 'Pia from Sales', kind: 'user', colleague: true, hostile: false, resolved: false, aggro: false, talked: false, enragedT: 0, memo: {}, pos: { x: 1, z: 0 } };
    c.game.actors = [walker];
    c.game.save.sanity = 100;
    c.game.save.location = 'hub';
    // Even with Friday's lift lit, a hub-only week never takes it.
    Object.assign(c.game, { elevatorOpen: true });
    const hub = { clock: 0, walker: 7 as number | null, reached: true, ignores: [], hostile: [] };
    c.helldesk.hub = () => hub;
    Object.assign(c.bot.policy, { approach: 'hub-only', hubMinutes: 0.1, talk: 0 });
    c.onStep(() => {
      c.game.save.hub.clock += DT;
      hub.clock = c.game.save.hub.clock;
      const t = c.game.promptTarget;
      if (c.game.input.pressed.delete('e')) {
        if (t?.kind === 'interact') c.openDialogue(liftNode(['Floor B1: the major incident', 'Not yet.'], did));
        else if (t?.kind === 'actor' && t.a === walker) {
          c.openDialogue({ speaker: walker.name, subtitle: 'A walk-up', text: '', options: [
            { label: 'Walk them through it: "Reboot"', tag: '+₡8', pick: () => { did.push('walk-up'); hub.walker = null; c.game.promptTarget = { kind: 'interact', it: lift }; return null; } },
            { label: 'Could you raise a ticket for that? (SLA about 2 min)', pick: () => { did.push('ticket'); hub.walker = null; return null; } },
          ] });
        }
      }
      return undefined;
    });
    c.game.promptTarget = { kind: 'actor', a: walker };
    for (let i = 0; i < 600 && !c.bot.ended; i++) c.tick();
    expect(did, 'the walk-up talked to, the lift never taken').toEqual(['walk-up']);
    expect(c.bot.ended).toBe(true);
    expect(c.bot.floors).toHaveLength(1);
    expect(c.bot.floors[0]).toMatchObject({ where: 'hub', reason: 'hub-week', combatSec: 0, combatShare: 0 });
    expect(c.bot.floors[0]?.floorSec).toBeGreaterThan(5.9);
  });

  it('counts a hub fight in the hub week\'s combat share', () => {
    const c = career();
    c.game.save.location = 'hub';
    c.game.save.sanity = 100;
    Object.assign(c.bot.policy, { approach: 'hub-only', hubMinutes: 0.05, talk: 0 });
    c.helldesk.hub = () => ({ walker: null, reached: false });
    c.onStep(() => { c.game.save.hub.clock += DT; return undefined; });
    for (let i = 0; i < 400 && !c.bot.ended; i++) c.tick();
    // The career's hostile (14 m off, after you) was there the whole week.
    expect(c.bot.floors[0]).toMatchObject({ where: 'hub', reason: 'hub-week' });
    expect(c.bot.floors[0]?.combatShare).toBeGreaterThan(0.9);
  });

  it('does not swing while a colleague is in the arc: it steps round them', () => {
    const swings = (withColleague: boolean): number => {
      const c = career();
      let taps = 0;
      (c.game.input as unknown as { tapAttack: () => void }).tapAttack = () => { taps++; };
      c.game.save.sanity = 100;
      c.game.save.location = 'hub';
      Object.assign(c.bot.policy, { approach: 'hub-only', hubMinutes: 10, talk: 0 });
      c.helldesk.hub = () => ({ walker: null, reached: false });
      Object.assign(c.actor, { id: 3, pos: { x: 1, z: 0 }, aggro: true, talked: true });
      const bystander = { id: 4, kind: 'user', colleague: true, hostile: false, resolved: false, pos: { x: 1.6, z: 0.2 } };
      c.game.actors = (withColleague ? [c.actor, bystander] : [c.actor]) as unknown as typeof c.game.actors;
      c.tick(20);
      return taps;
    };
    expect(swings(false), 'the control: it swings').toBeGreaterThan(0);
    expect(swings(true), 'a colleague in the way: no swing').toBe(0);
  });
});
