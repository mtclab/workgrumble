import * as THREE from 'three';
import { sfx } from './audio';
import type { CompassMarker } from './compass';
import { type DialogueNode, said } from './dialogue';
import { disposeTree } from './dispose';
import { type Actor, walkClear } from './entities';
import type { Game } from './game';
import { cellCenter, flowField, freeSpotIn, lineOfSight, type Room, toCell } from './level';
import { type CrowdSpec, type Finish, type MissionCard, MissionRun, type Outcome, payout, type Payout } from './mission';
import { QUEST_ITEMS } from './quests';
import { Rng } from './rng';
import * as screens from './screens';
import {
  ALERT_PAUSE,
  INVESTIGATE,
  type NoiseKind,
  type Point,
  SPRINT_NOISE_EVERY,
  type Tier,
  TIER_NAMES,
  Watch,
  type WatchView,
} from './stealth';

/**
 * A mission card in the game (the 0.3.0 spike, docs/SPEC_HELLDESK_030.md
 * 6.0): its people placed and watched, the escalation announced, the HUD eye
 * and the amber bars over heads, the lift that finishes or aborts it, and the
 * results card. Nothing here saves: a mission is played from
 * `crawler.html?mission=...` on a fresh trainee and leaves the career saves
 * alone. The rules are in mission.ts and stealth.ts.
 */

/** Lights go to this when the mission is Escalated (spec 2.3: "the alarm tint"). */
const ALARM_TINT = 0xff5a40;
/** Over a head: the amber suspicion bar, metres up. */
const BAR_Y = 2.5;

/**
 * Where a mission shows itself outside the 3D scene: the HUD panel (eye,
 * tier, objective) and the results card. The DOM one is `domView`; the unit
 * tests hand in their own.
 */
export interface MissionView {
  draw(tier: Tier, goal: string): void;
  show(on: boolean): void;
  result(head: string, dead: boolean, rows: readonly (readonly [string, string])[], again: () => void, title: () => void): void;
  dispose(): void;
}

interface Bar {
  readonly group: THREE.Group;
  readonly fill: THREE.Mesh;
  readonly mats: readonly THREE.MeshBasicMaterial[];
}

/** The eye in the HUD: closed (Quiet), half open (Noticed), open and red (Alert, Escalated). */
const EYES: Readonly<Record<Tier, string>> = {
  0: '<path d="M3 12 Q20 22 37 12" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M10 16 l-2 4 M20 18 v4 M30 16 l2 4" stroke="currentColor" stroke-width="2"/>',
  1: '<path d="M3 12 Q20 2 37 12 Q20 22 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="14" r="4.5" fill="currentColor"/><path d="M3 12 Q20 2 37 12 Q20 8 3 12 Z" fill="currentColor"/>',
  2: '<path d="M3 12 Q20 1 37 12 Q20 23 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="12" r="6" fill="currentColor"/><circle cx="20" cy="12" r="2.2" fill="#140606"/>',
  3: '<path d="M3 12 Q20 1 37 12 Q20 23 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="12" r="6" fill="currentColor"/><circle cx="20" cy="12" r="2.2" fill="#140606"/>',
};

export class MissionPlay {
  readonly run: MissionRun;
  readonly watch: Watch;
  /** The card's people, as placed. */
  readonly crowd: Actor[] = [];
  private readonly rng: Rng;
  private readonly bars = new Map<number, Bar>();
  private hudShown = '';
  private sprintIn = 0;
  private readonly repAtStart: number;
  private readonly standingAtStart: { management: number; staff: number };
  private tinted = false;
  private detectedAt: number | null = null;
  private noticedAt: number | null = null;
  private noiseEvents = 0;

  constructor(private readonly g: Game, readonly card: MissionCard, readonly seed: number, readonly pinned: boolean, private readonly view: MissionView = domView(g, card)) {
    this.rng = new Rng(seed ^ 0x6d697373);
    const start: Tier = card.style === 'loud' ? 3 : 0;
    this.run = new MissionRun(card, start);
    if (start >= 2) this.detectedAt = 0;
    if (start >= 1) this.noticedAt = 0;
    this.watch = new Watch(g.level, { view: () => this.seen(), tierChanged: (to, from, by, why) => this.tierChanged(to, from, by, why) }, start);
    this.repAtStart = g.save.rep;
    this.standingAtStart = { management: g.save.standing.management, staff: g.save.standing.staff };
    this.placeCrowd();
    if (card.objective.kind === 'take' && g.level.recipe !== undefined && g.level.recipe.closet >= 0) g.lockerItems.set(g.level.recipe.closet, card.objective.item);
    g.markers = this.markers();
    g.markersIn = 0;
    // The eye and the objective are up from the briefing on.
    this.drawHud();
  }

  /** What the watchers can know about the player. */
  private seen(): WatchView {
    const g = this.g;
    return { x: g.player.pos.x, z: g.player.pos.z, crouching: g.player.crouching, stealth: Math.min(0.9, g.derivedCache.stealth), invisible: g.invisible, time: g.time };
  }

  // ---------------------------------------------------------------- the crowd

  private placeCrowd(): void {
    const g = this.g;
    const layout = g.level.recipe;
    if (layout === undefined) return;
    const taken = new Set<number>();
    // Rooms of each tag in a seeded order, handed out in turn across the card's specs.
    const rooms: Record<string, number[]> = {};
    for (const [tag, ids] of Object.entries(layout.rooms)) rooms[tag] = this.rng.shuffle([...ids]);
    const turn: Record<string, number> = {};
    for (const spec of this.card.crowd) {
      for (let k = 0; k < (spec.count ?? 1); k++) {
        const n = turn[spec.room] ?? 0;
        turn[spec.room] = n + 1;
        const spot = this.spotFor(spec, n, rooms, taken);
        if (spot === null) continue;
        const a = g.spawnAt(spec.kind, spot.x, spot.z, spot.room, false);
        if (a === null) continue;
        taken.add(toCell(a.pos.z) * g.level.w + toCell(a.pos.x));
        if (spec.name !== undefined) a.name = spec.name;
        a.docile = false;
        const rm = g.level.rooms[spot.room];
        if (rm !== undefined) a.yaw = this.towardDoor(a, rm);
        const route = spec.sort === 'patrol' ? this.routeFrom(a) : [];
        this.watch.add(a, spec.sort, { tag: spec.tag ?? null, route, pauses: route.map(() => this.rng.range(2, 4)) });
        this.crowd.push(a);
      }
    }
  }

  private spotFor(spec: CrowdSpec, n: number, rooms: Readonly<Record<string, number[]>>, taken: ReadonlySet<number>): (Point & { room: number }) | null {
    const lv = this.g.level;
    if (spec.room === 'node') {
      const nodes = lv.recipe?.nodes ?? [];
      const cell = nodes[this.rng.int(0, Math.max(0, nodes.length - 1))];
      if (cell === undefined) return null;
      return { x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)), room: -1 };
    }
    const ids = rooms[spec.room] ?? [];
    const rm = lv.rooms[ids[n % Math.max(1, ids.length)] ?? -1];
    if (rm === undefined) return null;
    const s = freeSpotIn(lv, rm, this.rng, taken);
    return s === null ? null : { x: s.x, z: s.z, room: rm.id };
  }

  /** Desk-bound people face the way in: the nearest opening in their room's edge. */
  private towardDoor(a: Actor, rm: Room): number {
    const lv = this.g.level;
    let best: Point | null = null;
    let bestD = Infinity;
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (x !== rm.x && y !== rm.y && x !== rm.x + rm.w - 1 && y !== rm.y + rm.h - 1) continue;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + ox;
          const ny = y + oy;
          const outside = nx < rm.x || ny < rm.y || nx >= rm.x + rm.w || ny >= rm.y + rm.h;
          if (!outside || lv.floor[ny * lv.w + nx] !== 1) continue;
          const p = { x: cellCenter(nx), z: cellCenter(ny) };
          const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
    }
    return best === null ? a.yaw : Math.atan2(best.x - a.pos.x, best.z - a.pos.z);
  }

  /**
   * A patrol (spec 4.3): from their post to the corridor node nearest it,
   * two more nodes in a seeded order, the near node again, and home.
   */
  private routeFrom(a: Actor): Point[] {
    const lv = this.g.level;
    const at = (cell: number): Point => ({ x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)) });
    const nodes = [...(lv.recipe?.nodes ?? [])].sort((p, q) => {
      const pp = at(p);
      const qq = at(q);
      return Math.hypot(pp.x - a.pos.x, pp.z - a.pos.z) - Math.hypot(qq.x - a.pos.x, qq.z - a.pos.z);
    });
    const near = nodes[0];
    if (near === undefined) return [];
    const far = this.rng.shuffle(nodes.slice(1)).slice(0, 2);
    return [{ x: a.pos.x, z: a.pos.z }, at(near), ...far.map(at), at(near)];
  }

  // ---------------------------------------------------------------- the game's hooks

  /** One frame of play: the clock, sprint noise, resolves, the objective, the HUD. */
  update(dt: number, sprinting: boolean): void {
    if (this.run.over) return;
    const g = this.g;
    this.run.tick(dt);
    if (sprinting) {
      this.sprintIn -= dt;
      if (this.sprintIn <= 0) {
        this.noise('sprint');
        this.sprintIn = SPRINT_NOISE_EVERY;
      }
    } else {
      this.sprintIn = 0;
    }
    const wasDone = this.run.objectiveDone;
    for (const a of this.crowd) if (a.resolved && !a.expired) this.run.resolved(a.id, a.kind, a.rep);
    for (const w of this.watch.watchers.values()) if (w.peak >= INVESTIGATE) this.run.noticedBy(w.tag);
    const ob = this.card.objective;
    if (ob.kind === 'take' && g.save.questItems.includes(ob.item)) this.run.took(ob.item);
    if (!wasDone && this.run.objectiveDone) {
      sfx.chime();
      g.hud.toast(ob.kind === 'take' ? `${QUEST_ITEMS[ob.item]?.name ?? 'Got it'}. Now back to the lift.` : 'That is all of them. Back to the lift.', 'good');
    }
    if (this.watch.tier >= 3 && !this.tinted) {
      this.tinted = true;
      for (const l of g.lights) l.color.setHex(ALARM_TINT);
    }
    this.drawHud();
    this.drawBars();
  }

  noise(kind: NoiseKind): void {
    if (this.run.over) return;
    this.noiseEvents++;
    this.watch.noise(kind, this.g.player.pos.x, this.g.player.pos.z, this.g.time);
  }

  /** Somebody turned on you, by any road. */
  aggroed(a: Actor): void {
    this.watch.aggroed(a, this.g.time);
  }

  /** Who saw that: the watched who have you in their cone right now, near enough. */
  witnesses(range: number, kinds: readonly Actor['kind'][]): Actor[] {
    const pp = this.g.player.pos;
    return this.watch.witnesses().filter((a) => kinds.includes(a.kind) && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < range);
  }

  /** A crime with witnesses (a lock picked in view): each of them is Alert. */
  crime(seen: readonly Actor[]): void {
    for (const a of seen) {
      if (a.aggro || a.resolved) continue;
      a.aggro = true;
      a.docile = false;
      a.cooldown = Math.max(a.cooldown, ALERT_PAUSE);
      this.g.noticed(a);
      this.watch.aggroed(a, this.g.time);
    }
  }

  private tierChanged(to: Tier, _from: Tier, by: Actor | null, why: string): void {
    const g = this.g;
    this.run.tier(to);
    if (to >= 1 && this.noticedAt === null) this.noticedAt = this.run.seconds;
    if (to >= 2 && this.detectedAt === null) this.detectedAt = this.run.seconds;
    if (to === 1) {
      sfx.ding();
      g.hud.toast(`NOTICED: ${why}.`, 'bad');
    } else if (to === 2) {
      sfx.error();
      g.hud.toast(`ALERT: ${why}. Tannoy: "Security to floor 7B. Security to floor 7B."`, 'bad');
    } else if (to === 3) {
      sfx.setBoss(true);
      g.hud.toast(`ESCALATED: ${by === null ? 'the floor' : why}. Everyone is hostile on sight. The lift still works.`, 'epic');
    }
  }

  // ---------------------------------------------------------------- the lift, and the end

  liftPrompt(): string {
    return this.run.objectiveDone ? 'E: Take the lift - close the card' : 'E: The lift (the card is not done)';
  }

  /** E on the lift: done, the card closes; not, you may abort it. */
  lift(): void {
    if (this.run.over) return;
    if (this.run.objectiveDone) {
      this.finish('done');
      return;
    }
    const node: DialogueNode = {
      speaker: 'The lift',
      text: `The card is not done: ${this.card.objective.text} Leave anyway? An aborted card pays nothing.`,
      options: [
        { label: 'Abort the card.', pick: () => { this.g.afterDialogue = () => this.finish('aborted'); return null; } },
        { label: 'Not yet.', leave: true, pick: () => null },
      ],
    };
    this.g.openDialogue(node);
  }

  /** Close the card (`done` only once the objective is), pay it, and show what happened. */
  finish(how: Finish): void {
    const end = this.run.finish(how);
    if (end === null) return;
    const g = this.g;
    if (how === 'done') {
      g.addRep(end.pay.base + end.pay.bonus);
      if (end.pay.management !== 0) g.standing('management', end.pay.management);
      if (end.pay.staff !== 0) g.standing('staff', end.pay.staff);
    }
    sfx.setBoss(false);
    this.show(false);
    this.showResult(end.outcome, end.pay);
  }

  private showResult(o: Outcome, pay: Payout): void {
    const g = this.g;
    const s = g.save;
    const mins = Math.floor(o.seconds / 60);
    const secs = Math.floor(o.seconds % 60);
    const head = o.finish === 'done' ? 'CARD CLOSED' : o.finish === 'aborted' ? 'CARD ABORTED' : 'BURNED OUT';
    const how = o.finish !== 'done' ? (o.finish === 'aborted' ? 'Aborted at the lift' : 'Burned out on the card') : pay.quiet ? 'Finished quiet' : 'Finished loud';
    const rep = s.rep - this.repAtStart;
    const mgmt = s.standing.management - this.standingAtStart.management;
    const staff = s.standing.staff - this.standingAtStart.staff;
    const sign = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}`;
    const why = o.finish === 'done' && !pay.quiet ? (o.spoiled ? ' (HR noticed you)' : ` (it reached ${TIER_NAMES[o.maxTier]})`) : '';
    const rows: [string, string][] = [
      ['Card', `#${this.card.number} ${this.card.title}`],
      ['Finished', `${how}${why}`],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
      ['Rep', `${sign(rep)} (card ${pay.base}, quiet bonus ${pay.bonus}, resolves ${pay.perResolve})`],
      ['Standing', `Management ${sign(mgmt)}, Staff ${sign(staff)}`],
      ['Escalation reached', TIER_NAMES[o.maxTier]],
    ];
    const again = this.pinned ? this.seed : (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    this.view.result(head, o.finish === 'burnout', rows, () => startMission(g, this.card, again, this.pinned), () => screens.showTitle(g));
  }

  // ---------------------------------------------------------------- what the player sees

  /** Up in play only; the results card has its own screen. */
  show(visible: boolean): void {
    const on = visible && !this.run.over;
    this.view.show(on);
    for (const b of this.bars.values()) if (!on) b.group.visible = false;
  }

  private drawHud(): void {
    const t = this.watch.tier;
    const ob = this.card.objective;
    const goal = this.run.objectiveDone ? 'Back to the lift.' : ob.kind === 'resolve' ? `${ob.text} (${this.run.progress}/${ob.count})` : ob.text;
    const key = `${t}|${goal}`;
    if (key === this.hudShown) return;
    this.hudShown = key;
    this.view.draw(t, goal);
  }

  /**
   * The amber bar over each head as suspicion rises (spec 4.4). From
   * Investigate up it shows through walls: you always know who is coming.
   * Alert has its own "!", and Escalated needs no bars at all.
   */
  private drawBars(): void {
    const g = this.g;
    const q = g.camera.quaternion;
    for (const w of this.watch.watchers.values()) {
      const a = w.actor;
      let bar = this.bars.get(a.id);
      const shown = this.watch.tier < 3 && w.mood !== 'alert' && !a.resolved && w.suspicion > 0.5
        && (w.suspicion >= INVESTIGATE || a.root.visible);
      if (!shown) {
        if (bar !== undefined) bar.group.visible = false;
        continue;
      }
      if (bar === undefined) {
        bar = makeBar();
        g.scene.add(bar.group);
        this.bars.set(a.id, bar);
      }
      bar.group.visible = true;
      bar.group.position.set(a.pos.x, BAR_Y * (a.rig?.root.scale.y ?? 1), a.pos.z);
      bar.group.quaternion.copy(q);
      const k = Math.max(0.001, w.suspicion / 100);
      bar.fill.scale.x = k;
      bar.fill.position.x = -(1 - k) * 0.45;
      const through = w.suspicion >= INVESTIGATE;
      for (const m of bar.mats) m.depthTest = !through;
    }
  }

  markers(): CompassMarker[] {
    const lv = this.g.level;
    const gold = '#ffd54a';
    if (this.run.over) return [];
    const lift = lv.interactables.find((it) => it.kind === 'elevator');
    if (this.run.objectiveDone) return lift === undefined ? [] : [{ x: lift.x, z: lift.z, icon: '◆', color: gold, label: 'The lift' }];
    if (this.card.objective.kind === 'take') {
      const closet = lv.interactables.find((it) => it.id === lv.recipe?.closet);
      return closet === undefined ? [] : [{ x: closet.x, z: closet.z, icon: '◆', color: gold, label: 'HR\'s closet' }];
    }
    const who = this.card.objective.who;
    return this.crowd.filter((a) => a.kind === who && !a.resolved).map((a) => ({ x: a.pos.x, z: a.pos.z, icon: '◆', color: gold, label: a.name }));
  }

  dispose(): void {
    this.view.dispose();
    for (const b of this.bars.values()) {
      this.g.scene.remove(b.group);
      disposeTree(b.group, true);
    }
    this.bars.clear();
  }

  // ---------------------------------------------------------------- for the browser tests and the bot

  /**
   * Read-only state for the measurement bot and the browser tests: the tier,
   * every watched person's suspicion and route, the spine's cells, the run.
   */
  debug(): MissionDebug {
    const lv = this.g.level;
    const at = (cell: number): Point => ({ x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)) });
    return {
      card: this.card.id, seed: this.seed, style: this.card.style,
      tier: this.watch.tier, tierName: TIER_NAMES[this.watch.tier], maxTier: this.run.maxTier,
      seconds: this.run.seconds, objectiveDone: this.run.objectiveDone, progress: this.run.progress,
      spoiled: this.run.spoiled, over: this.run.over, finish: this.run.outcome?.finish ?? null,
      detectedAt: this.detectedAt, noticedAt: this.noticedAt, noiseEvents: this.noiseEvents,
      result: this.run.outcome === null ? null : {
        ...payout(this.card, this.run.outcome), repTotal: Math.round(this.g.save.rep - this.repAtStart),
      },
      actors: [...this.watch.watchers.values()].map((w) => ({
        id: w.actor.id, name: w.actor.name, kind: w.actor.kind, tag: w.tag, sort: w.sort,
        hostile: w.actor.hostile, aggro: w.actor.aggro, resolved: w.actor.resolved,
        suspicion: w.suspicion, mood: w.mood, seeing: w.seeing, bark: w.bark, barkAt: w.barkAt,
        x: w.actor.pos.x, z: w.actor.pos.z, yaw: w.actor.yaw,
        patrol: w.route.map((p) => ({ x: p.x, z: p.z })),
      })),
      spine: (lv.recipe?.spine ?? []).map(at),
    };
  }

  /**
   * Stand the player `dist` m in front of watcher `id`, inside their cone, in
   * their sight, facing away from them. It only moves the player.
   */
  standInView(id: number, dist: number): boolean {
    const g = this.g;
    const a = this.crowd.find((x) => x.id === id);
    if (a === undefined) return false;
    const lv = g.level;
    for (const off of [0, 0.25, -0.25, 0.5, -0.5]) {
      const yaw = a.yaw + off;
      const x = a.pos.x + Math.sin(yaw) * dist;
      const z = a.pos.z + Math.cos(yaw) * dist;
      const c = toCell(z) * lv.w + toCell(x);
      if (lv.floor[c] !== 1 || lv.solid[c] !== 0) continue;
      if (!lineOfSight(lv, a.pos.x, a.pos.z, x, z) || !walkClear(lv, a.pos.x, a.pos.z, x, z)) continue;
      g.player.pos.set(x, 0, z);
      // The player faces -sin(yaw), -cos(yaw): away from them.
      g.player.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
      g.player.pitch = 0;
      return true;
    }
    return false;
  }

  /**
   * Stand the player two cells into the service spine from the lobby's back
   * door, facing straight down it (along its row, to its far end). It only
   * moves the player. False on a card with no spine.
   */
  toSpine(): boolean {
    const g = this.g;
    const lv = g.level;
    const field = flowField(lv, lv.start.x, lv.start.z, 32000);
    const dist = (c: number): number => field[c] ?? -1;
    const open = (lv.recipe?.spine ?? []).filter((c) => lv.solid[c] === 0 && dist(c) >= 0).sort((p, q) => dist(p) - dist(q));
    const door = open[0];
    if (door === undefined) return false;
    const first = open.find((c) => dist(c) >= dist(door) + 2);
    if (first === undefined) return false;
    const row = Math.floor(first / lv.w);
    const end = open.filter((c) => Math.floor(c / lv.w) === row).sort((p, q) => dist(q) - dist(p))[0];
    if (end === undefined || end === first) return false;
    const x = cellCenter(first % lv.w);
    const z = cellCenter(row);
    g.player.pos.set(x, 0, z);
    // The player faces -sin(yaw), -cos(yaw).
    g.player.yaw = Math.atan2(x - cellCenter(end % lv.w), 0);
    g.player.pitch = 0;
    return true;
  }
}

/** The read-only picture `debug()` gives. */
export interface MissionDebug {
  readonly card: string;
  readonly seed: number;
  readonly style: string;
  readonly tier: Tier;
  readonly tierName: string;
  readonly maxTier: Tier;
  readonly seconds: number;
  readonly objectiveDone: boolean;
  readonly progress: number;
  readonly spoiled: boolean;
  readonly over: boolean;
  readonly finish: Finish | null;
  readonly detectedAt: number | null;
  readonly noticedAt: number | null;
  readonly noiseEvents: number;
  readonly result: (Payout & { readonly repTotal: number }) | null;
  readonly actors: readonly {
    readonly id: number; readonly name: string; readonly kind: string; readonly tag: string | null; readonly sort: string;
    readonly hostile: boolean; readonly aggro: boolean; readonly resolved: boolean;
    readonly suspicion: number; readonly mood: string; readonly seeing: boolean; readonly bark: string; readonly barkAt: number;
    readonly x: number; readonly z: number; readonly yaw: number; readonly patrol: readonly Point[];
  }[];
  readonly spine: readonly Point[];
}

function makeBar(): Bar {
  const group = new THREE.Group();
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x2a1a00, transparent: true, opacity: 0.75 });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), bgMat);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), fillMat);
  fill.position.z = 0.001;
  bg.renderOrder = 13;
  fill.renderOrder = 14;
  group.add(bg, fill);
  group.visible = false;
  return { group, fill, mats: [bgMat, fillMat] };
}

/** Take a card: the map behind the loading card, then the briefing. */
export function startMission(g: Game, card: MissionCard, seed: number, pinned: boolean): void {
  screens.showLoading(g, 'Taking the card', () => {
    g.loadMission(card, seed, pinned);
    screens.startPlay(g);
    g.openDialogue(said(card.source, `"${card.voice}" ${card.objective.text} ${card.loud}`, 'neutral', 'Take the card'));
  });
}

/** The mission's DOM: a HUD panel over the game, and the results card on the overlay. */
function domView(g: Game, card: MissionCard): MissionView {
  const el = document.createElement('div');
  el.className = 'mission-hud';
  el.setAttribute('data-testid', 'mission-hud');
  g.mount.append(el);
  return {
    draw(tier, goal) {
      el.dataset.tier = String(tier);
      el.innerHTML = `<div class="mission-eye-row"><svg class="mission-eye" viewBox="0 0 40 24" aria-hidden="true">${EYES[tier]}</svg><span class="mission-tier"></span></div><div class="mission-goal"></div>`;
      const label = el.querySelector('.mission-tier');
      if (label !== null) label.textContent = TIER_NAMES[tier].toUpperCase();
      const line = el.querySelector('.mission-goal');
      if (line !== null) line.textContent = `#${card.number} ${card.title}: ${goal}`;
    },
    show(on) {
      el.style.display = on ? 'block' : 'none';
    },
    result(head, dead, rows, again, title) {
      g.screen = 'ending';
      g.input.releaseLock();
      const list = document.createElement('dl');
      list.className = 'mission-result';
      list.setAttribute('data-testid', 'mission-result');
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        list.append(dt, dd);
      }
      screens.setOverlay(g, `<div class="title-logo small${dead ? ' dead' : ''}">${head}</div>`, [['Again', again], ['Title', title]], list, { menu: true });
    },
    dispose() {
      el.remove();
    },
  };
}
