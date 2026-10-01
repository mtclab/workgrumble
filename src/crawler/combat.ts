import * as THREE from 'three';
import { hitPauseFor } from './a11y';
import { sfx } from './audio';
import { RESOLVED_LINES } from './content/lines';
import { TICKETS } from './content/tickets';
import { disposeTree } from './dispose';
import {
  type Actor,
  type ActorKind,
  type HazardKind,
  allyIgnores,
  hurtActor,
  type ProjectileKind,
  shrugsOff,
  stun,
  type ProjectileSpec,
  say,
  type TelegraphSpec,
  walkClear,
} from './entities';
import { type Game, POWER_TIME } from './game';
import { AMMO, type AmmoKind, BOOK_IDS, CONSUMABLES, DRINKS, ENERGY_DRINKS, itemById, RUNES, type WeaponDef } from './items';
import { lineOfSight, toCell, WALL_H } from './level';
import { BOSS_UNIQUES, type GearInstance, RARITY_INFO, RARITY_SHAPE, rollGear, uniqueInstance, WORLD_UNIQUES } from './loot';
import { questItemMesh } from './meshes';
import { MAIN, TRANSIENT_ITEMS } from './quests';
import { fx } from './rng';
import { adjustStanding, perk, skill } from './state';
import { disposeSprite, textSprite } from './textures';
import { questEvent } from './questing';
import { questProgress } from './desk';
import { practiceDamage } from './induction';
import { cancelWindup, chargeShown, isParry, meleeStep, screenAngle, telegraphOpacity } from './windup';

export interface Projectile {
  readonly kind: ProjectileKind;
  readonly mesh: THREE.Object3D;
  readonly vel: THREE.Vector3;
  readonly damage: number;
  readonly hostile: boolean;
  readonly owner: Actor | null;
  ttl: number;
  readonly splash: number;
  readonly gravity: number;
  readonly hitIds: Set<number>;
}

export interface Pickup {
  readonly mesh: THREE.Object3D;
  readonly kind: 'ammo' | 'item' | 'gear' | 'quest';
  readonly id: string;
  readonly amount: number;
  readonly gear: GearInstance | null;
  t: number;
  /** Quest items never time out. */
  readonly permanent: boolean;
}

export interface FxMesh {
  readonly mesh: THREE.Mesh;
  ttl: number;
  readonly life: number;
  readonly grow: number;
  readonly rise: number;
}

export interface Floater {
  readonly sprite: THREE.Sprite;
  ttl: number;
}

export interface Hazard {
  readonly mesh: THREE.Mesh;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  ttl: number;
  readonly life: number;
  /** null: a landing marker, which only warns (the hit is on its way separately). */
  readonly kind: HazardKind | null;
  /** Seconds before it bites: a hazard's telegraph; a marker's whole life. */
  readonly armAt: number;
  tick: number;
}

const fwdOf = (yaw: number): THREE.Vector3 => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

// ================================================================== the player's hands

/**
 * LMB: tap for a quick swing; hold a melee tool to wind up a heavy one and
 * release to let it go (the swing comes on the release, so a press is never
 * a quick swing and a heavy one both). Ranged tools fire while held. RMB:
 * tap to shove, hold to block; raising the block just before a strike lands
 * is a parry.
 */
export function playerAttackInput(g: Game, dt: number): void {
  const inp = g.input;
  const s = g.save;
  const d = g.derivedCache;
  const w = d.weapon;
  const atkRate = d.attackSpeed * (g.auraSlow > 0 ? 0.85 : 1);
  const canAct = g.rootT <= 0;
  g.dryFire = false;

  // Right button.
  if (inp.rmb) {
    g.rmbT += dt;
    g.blocking = s.energy > 0;
    // The tip comes with the first block; an induction brings it at its own block step instead.
    if (g.blocking && s.induction === null) g.tip('block');
  } else {
    if (g.rmbT > 0 && g.rmbT < 0.2 && g.shoveCd <= 0 && s.energy >= 8 && canAct) shove(g);
    g.rmbT = 0;
    g.blocking = false;
  }
  if (g.blocking) {
    // Blocking puts the swing down: nothing half-charged goes off when the guard drops.
    g.charging = false;
    g.chargeT = 0;
    g.swingQueued = false;
    g.player.charge = 0;
    return;
  }

  if (w.kind === 'melee') {
    const act = meleeStep(g, { pressed: inp.clicked(), down: inp.lmb, dt, ready: g.attackCd <= 0, canAct }, POWER_TIME);
    if (act === 'charged') sfx.charge();
    else if (act === 'light') attack(g, w, atkRate, false);
    else if (act === 'heavy') {
      const cost = perk(s, 'powercycle') > 0 ? 10 : 20;
      if (s.energy >= cost || d.ultra) {
        if (!d.ultra) s.energy -= cost;
        g.attackCd = 0;
        attack(g, w, atkRate, true);
      } else {
        // Too tired to put your back into it: it still goes, as a quick one.
        g.hud.toast('Too tired for a heavy swing. (Energy)', 'bad');
        g.attackCd = 0;
        attack(g, w, atkRate, false);
      }
    }
    g.player.charge = chargeShown(g, POWER_TIME);
    return;
  }
  g.charging = false;
  g.chargeT = 0;
  g.swingQueued = false;
  g.player.charge = 0;
  // Holding the trigger on an empty tool: the crosshair says so for as long as you hold it.
  g.dryFire = inp.lmb && !canFire(g, w);
  if ((inp.lmb || inp.clicked()) && g.attackCd <= 0 && canAct) {
    const race = perk(s, 'racecondition') > 0 ? 1.2 : 1;
    attack(g, w, atkRate * (w.kind === 'nova' ? 1 : race), false);
  }
}

/** Is there ammo (or energy) for another go with this tool? */
function canFire(g: Game, w: WeaponDef): boolean {
  if (w.ammo !== undefined && g.save.ammo[w.ammo] <= 0) return false;
  return w.energyCost === undefined || g.save.energy >= w.energyCost || g.derivedCache.ultra;
}

export function aimPoint(g: Game): THREE.Vector3 {
  const origin = g.camera.getWorldPosition(new THREE.Vector3());
  const dir = g.camera.getWorldDirection(new THREE.Vector3());
  const p = origin.clone();
  const startDist = g.settings.view === 'third' ? origin.distanceTo(new THREE.Vector3(g.player.pos.x, origin.y, g.player.pos.z)) : 0;
  const ceiling = g.player.outdoor ? 40 : WALL_H;
  for (let t = startDist; t < 40; t += 0.25) {
    p.copy(origin).addScaledVector(dir, t);
    if (p.y < 0 || p.y > ceiling) return p;
    const cx = toCell(p.x);
    const cz = toCell(p.z);
    const i = cz * g.level.w + cx;
    if (g.level.floor[i] !== 1 || g.level.opaque[i] === 1) return p;
    for (const a of g.actors) {
      if (!a.hostile || a.resolved) continue;
      const h = a.kind === 'boss' ? 3.8 : 2;
      if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < a.radius + 0.2 && p.y < h) return p;
    }
  }
  return p;
}

export function muzzle(g: Game): THREE.Vector3 {
  const yaw = g.player.yaw;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (g.settings.view === 'first') {
    const p = g.camera.getWorldPosition(new THREE.Vector3());
    return p.addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.15, 0));
  }
  const p = g.player.pos.clone();
  p.y += 1.3 - g.player.crouch * 0.4;
  return p.addScaledVector(right, 0.35).addScaledVector(fwdOf(yaw), 0.4);
}

/**
 * Every hit the player lands goes through here: sneak attacks, skills,
 * buffs, auras, and the legendary specials.
 */
export function strike(g: Game, a: Actor, base: number, knock: THREE.Vector3 | null, kind: 'melee' | 'ranged' | 'spell', power = false): void {
  if (a.resolved || !a.hostile || shrugsOff(g, a)) return;
  const s = g.save;
  const d = g.derivedCache;
  let dmg = base * (kind === 'melee' ? d.meleeMult : kind === 'ranged' ? d.rangedMult : d.spellMult);
  // Nobody sneaks up on the training dummy: it is never looking anyway.
  if (!a.aggro && a.kind !== 'boss' && a.kind !== 'turret' && a.kind !== 'dummy') {
    let mult = (2 + skill(s, 'stealth') / 40) * (perk(s, 'surprise') > 0 ? 1.5 : 1);
    if (kind === 'ranged' && perk(s, 'criticalpath') > 0) mult = Math.max(mult, 3);
    dmg *= mult;
    floatText(g, a.pos.clone().setY(2.9), `SNEAK ×${mult.toFixed(1)}`, '#b58cff');
    g.exercise('stealth', 2);
  }
  if (a.memo.marked === true) dmg *= 1.5;
  if (a.shielded) dmg *= 0.5;
  // A heavy swing is the whole of its press now (it used to come after a free
  // quick swing): x3 keeps a charged cycle worth what it was.
  if (power) dmg *= 3 * (perk(s, 'powercycle') > 0 ? 1.25 : 1);
  hurtActor(g, a, dmg, knock);
  g.particles.emit('sparks', a.pos.clone().setY(a.kind === 'boss' ? 2.4 : 1.3), power ? 16 : kind === 'spell' ? 4 : 7, 0.25);
  // Legendary specials.
  if (kind === 'melee') {
    if (d.specials.has('rubberStamp')) {
      stun(a, 0.8);
      floatText(g, a.pos.clone().setY(3.1), 'APPROVED', '#ff5050');
    }
    if (d.specials.has('whisk')) {
      s.sanity = Math.min(d.maxSanity, s.sanity + 2);
      s.loyly = Math.min(d.maxLoyly, s.loyly + 2);
    }
    if (perk(s, 'cablemgmt') > 0 || power) stun(a, power ? 0.6 : 0.3);
  }
  if (kind === 'ranged' && d.specials.has('redPen') && a.memo.marked !== true) {
    a.memo.marked = true;
    floatText(g, a.pos.clone().setY(3.1), 'MARKED', '#ff3030');
  }
  if (kind === 'melee') g.exercise('hardware', power ? 2 : 1);
  if (kind === 'ranged') g.exercise('scripting', 1);
}

export function attack(g: Game, w: WeaponDef, rate: number, power: boolean): void {
  const s = g.save;
  const d = g.derivedCache;
  // Empty: a dry click on every go (the 0.3 s recovery spaces them), and the reason on a fresh press.
  if (w.ammo !== undefined && s.ammo[w.ammo] <= 0) {
    sfx.empty();
    if (g.input.clicked()) g.hud.toast(`Out of ${w.ammo}. Internal IT sells more (or pick them up).`, 'bad');
    g.attackCd = 0.3;
    return;
  }
  if (w.energyCost !== undefined && s.energy < w.energyCost && !d.ultra) {
    sfx.empty();
    if (g.input.clicked()) g.hud.toast('Not enough energy. Coffee? A can of something?', 'bad');
    g.attackCd = 0.3;
    return;
  }
  g.attackCd = (w.cooldown / rate) * (power ? 1.3 : 1);
  g.player.swing = 1;
  if (g.invisT > 0) g.invisT = 0;
  // Heard on a mission: a swing carries 8 m, anything fired 18 m.
  g.mission?.noise(w.kind === 'melee' ? 'swing' : 'gun');
  const pp = g.player.pos;
  const yawFwd = fwdOf(g.player.yaw);
  // Shaky hands: the jitters and the drink both spoil your aim.
  const jitter = d.caffeine.jitter;
  const useAmmo = (): void => {
    if (w.ammo === undefined) return;
    if (perk(s, 'batchjob') > 0 && fx.chance(0.25)) return;
    s.ammo[w.ammo] -= 1;
  };

  switch (w.kind) {
    case 'melee': {
      if (power) sfx.heavy();
      let hitAny = false;
      const range = w.range * (power ? 1.2 : 1);
      const arc = (w.arc ?? 1) * (power ? 1.4 : 1);
      const hit: Actor[] = [];
      for (const a of g.actors) {
        if (!a.hostile || a.resolved) continue;
        const dx = a.pos.x - pp.x;
        const dz = a.pos.z - pp.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range + a.radius) continue;
        const dot = (dx * yawFwd.x + dz * yawFwd.z) / Math.max(dist, 1e-4);
        if (dist > 0.8 && Math.acos(Math.max(-1, Math.min(1, dot))) > arc / 2 + 0.25) continue;
        if (!lineOfSight(g.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
        // Drunk swings sometimes miss the person entirely.
        if (d.band.sway >= 1.5 && fx.chance(0.2)) {
          floatText(g, a.pos.clone().setY(2.4), 'MISS', '#bbbbbb');
          continue;
        }
        const knock = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((w.knockback ?? 2) * (power ? 2.2 : 1));
        strike(g, a, w.damage, knock, 'melee', power);
        hit.push(a);
        hitAny = true;
        if (w.splash !== undefined) splash(g, a.pos, w.splash, w.damage * 0.5 * d.meleeMult, a.id);
        if (a.kind === 'dummy') g.practice({ type: 'hit', how: power ? 'heavy' : 'light' });
      }
      // Milton's stapler goes through: the person behind gets stapled too.
      if (d.specials.has('redstapler')) {
        for (const a of hit) {
          const behind = g.actors.find((o) => o.hostile && !o.resolved && !hit.includes(o)
            && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 2.2
            && ((o.pos.x - pp.x) * yawFwd.x + (o.pos.z - pp.z) * yawFwd.z) > ((a.pos.x - pp.x) * yawFwd.x + (a.pos.z - pp.z) * yawFwd.z));
          if (behind !== undefined) strike(g, behind, w.damage * 0.5, null, 'melee');
        }
      }
      // Ballmer's chair: a heavy swing throws everyone around you.
      if (power && d.specials.has('ballmerChair')) {
        fxRing(g, pp.clone().setY(1), 0xb04bff, 4.5);
        for (const a of g.actors) {
          if (!a.hostile || a.resolved || hit.includes(a)) continue;
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          if (Math.hypot(dx, dz) > 4.5) continue;
          strike(g, a, w.damage * 0.5, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(12), 'melee');
        }
      }
      if (hitAny) {
        if (!power) sfx.swing();
        sfx.hit();
        g.shake(power ? 0.45 : 0.15);
        g.hitStop = hitPauseFor(power, g.settings.hitPause);
      } else {
        // A miss answers too: a whiff, and a puff of dust where the swing ran out.
        sfx.whiff();
        g.particles.emit('puff', pp.clone().addScaledVector(yawFwd, range).setY(1.1), power ? 14 : 8, 0.25);
      }
      break;
    }
    case 'projectile':
    case 'lob': {
      useAmmo();
      const from = muzzle(g);
      const target = aimPoint(g);
      const dir = target.sub(from).normalize();
      const spread = 0.015 + d.band.sway * 0.03 + jitter * 0.06;
      dir.x += fx.range(-spread, spread);
      dir.y += fx.range(-spread, spread);
      if (w.kind === 'lob') dir.y += 0.18;
      dir.normalize();
      const net = s.domain === 'Network' && s.rung >= 4 ? 1.3 : 1;
      const race = perk(s, 'racecondition') > 0 ? 1.3 : 1;
      fire(g, {
        kind: w.id === 'labelmaker' ? 'label' : w.id === 'toner' ? 'toner' : 'duck',
        from, dir, speed: (w.speed ?? 20) * net * race, damage: w.damage, hostile: false, owner: null,
        ttl: 3 * net,
        ...(w.kind === 'lob' ? { gravity: 12, splash: w.splash ?? 3 } : {}),
      });
      break;
    }
    case 'cone': {
      useAmmo();
      sfx.air();
      const fwd = g.camera.getWorldDirection(new THREE.Vector3());
      fwd.y = 0;
      fwd.normalize();
      for (const a of g.actors) {
        if (!a.hostile || a.resolved) continue;
        const dx = a.pos.x - pp.x;
        const dz = a.pos.z - pp.z;
        const dist = Math.hypot(dx, dz);
        if (dist > w.range) continue;
        const dot = (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4);
        if (dot < Math.cos(w.arc ?? 0.5)) continue;
        if (!lineOfSight(g.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
        strike(g, a, w.damage, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((w.knockback ?? 3) * 0.6), 'ranged');
      }
      fxBall(g, muzzle(g).addScaledVector(fwd, 1.2 + fx.range(0, 2)), 0xeef8ff, 0.25, 0.35, 3);
      break;
    }
    case 'nova': {
      if (!d.ultra) s.energy -= w.energyCost ?? 0;
      sfx.nova();
      g.shake(0.4);
      fxRing(g, pp.clone().setY(1), w.color, w.range);
      for (const a of g.actors) {
        if (!a.hostile || a.resolved) continue;
        const dx = a.pos.x - pp.x;
        const dz = a.pos.z - pp.z;
        const dist = Math.hypot(dx, dz);
        if (dist > w.range || !lineOfSight(g.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
        strike(g, a, w.damage * (1 - dist / (w.range * 2)), new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(8), 'melee');
      }
      break;
    }
  }
}

export function shove(g: Game): void {
  g.shoveCd = 0.8;
  g.save.energy -= 8;
  g.player.swing = 1;
  sfx.shove();
  const pp = g.player.pos;
  const fwd = fwdOf(g.player.yaw);
  // A small ring pushed out in front: the reach of the shove.
  fxRing(g, pp.clone().addScaledVector(fwd, 1.1).setY(1), 0xdfe8ff, 1.5);
  for (const a of g.actors) {
    if (!a.hostile || a.resolved || a.kind === 'boss' || a.kind === 'turret') continue;
    const dx = a.pos.x - pp.x;
    const dz = a.pos.z - pp.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.6) continue;
    if ((dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4) < 0.3) continue;
    a.push.add(new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(11));
    if (a.shoveImmune <= 0) {
      stun(a, 0.5);
      a.cooldown = Math.max(a.cooldown, 0.8);
      a.shoveImmune = 2.5;
    }
    // A shoved dummy rocks on its base; it does not start swinging because of it.
    if (a.kind !== 'dummy') a.aggro = true;
  }
}

export function splash(g: Game, at: THREE.Vector3, radius: number, dmg: number, skip = -1, ally = false): void {
  for (const a of g.actors) {
    if (!a.hostile || a.resolved || a.id === skip || (ally && allyIgnores(g, a))) continue;
    const dist = Math.hypot(a.pos.x - at.x, a.pos.z - at.z);
    if (dist > radius) continue;
    hurtActor(g, a, dmg * (1 - dist / (radius * 1.5)) * (a.shielded ? 0.5 : 1), new THREE.Vector3(a.pos.x - at.x, 0, a.pos.z - at.z).normalize().multiplyScalar(5));
  }
}

// ================================================================== projectiles

function projMesh(g: Game, kind: ProjectileKind): THREE.Mesh {
  let entry = g.projGeo.get(kind);
  if (entry === undefined) {
    const basic = (c: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c });
    switch (kind) {
      case 'ticket': entry = [new THREE.BoxGeometry(0.34, 0.03, 0.24), basic(0xffffff)]; break;
      case 'gold': entry = [new THREE.BoxGeometry(0.36, 0.03, 0.26), basic(0xffd700)]; break;
      case 'invite': entry = [new THREE.BoxGeometry(0.36, 0.36, 0.05), basic(0x4a8cff)]; break;
      case 'paper': entry = [new THREE.BoxGeometry(0.3, 0.02, 0.4), basic(0xf4f4f4)]; break;
      case 'label': entry = [new THREE.BoxGeometry(0.06, 0.02, 0.3), basic(0xfff27a)]; break;
      case 'toner': entry = [new THREE.SphereGeometry(0.12, 6, 4), basic(0x111111)]; break;
      case 'duck': entry = [new THREE.SphereGeometry(0.2, 8, 6), basic(0xffd400)]; break;
      case 'rtfm': entry = [new THREE.BoxGeometry(0.08, 0.08, 0.7), basic(0x40e0ff)]; break;
      case 'stun': entry = [new THREE.SphereGeometry(0.16, 8, 6), basic(0x8080ff)]; break;
      case 'po': entry = [new THREE.BoxGeometry(0.4, 0.3, 0.3), basic(0xb5835a)]; break;
      case 'laser': entry = [new THREE.BoxGeometry(0.1, 0.1, 1.4), basic(0xff2040)]; break;
      case 'ring': entry = [new THREE.SphereGeometry(0.22, 6, 4), basic(0xff8a00)]; break;
      case 'steam': entry = [new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.7 })]; break;
      case 'salmiakki': entry = [new THREE.OctahedronGeometry(0.2), basic(0x1a1a1a)]; break;
      case 'deck': entry = [new THREE.BoxGeometry(0.5, 0.36, 0.04), basic(0x5dade2)]; break;
      // Thick and bright enough to see coming across a dim office.
      case 'code': entry = [new THREE.BoxGeometry(0.16, 0.16, 0.65), new THREE.MeshBasicMaterial({ color: 0x9dffc4, toneMapped: false })]; break;
      case 'chat': entry = [new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.8 })]; break;
    }
    g.projGeo.set(kind, entry);
  }
  return new THREE.Mesh(entry[0], entry[1]);
}

export function fire(g: Game, p: ProjectileSpec): void {
  const mesh = projMesh(g, p.kind);
  mesh.position.copy(p.from);
  mesh.lookAt(p.from.clone().add(p.dir));
  g.scene.add(mesh);
  g.projectiles.push({
    kind: p.kind, mesh, vel: p.dir.clone().multiplyScalar(p.speed), damage: p.damage, hostile: p.hostile, owner: p.owner,
    ttl: p.ttl ?? 3, splash: p.splash ?? 0, gravity: p.gravity ?? 0, hitIds: new Set(),
  });
  // Everything that flies makes a sound as it leaves (a ring of them makes one).
  sfx.projectile(p.kind);
}

export function updateProjectiles(g: Game, dt: number): void {
  const pp = g.player.pos;
  const keep: Projectile[] = [];
  const ceiling = g.player.outdoor ? 40 : WALL_H;
  const lv = g.level;
  for (const p of g.projectiles) {
    p.ttl -= dt;
    p.vel.y -= p.gravity * dt;
    const m = p.mesh;
    m.position.addScaledVector(p.vel, dt);
    if (p.kind === 'ticket' || p.kind === 'gold' || p.kind === 'paper' || p.kind === 'deck') m.rotation.z += dt * 12;
    if (p.kind === 'invite' || p.kind === 'salmiakki') m.rotation.y += dt * 6;
    let dead = p.ttl <= 0;
    const pos = m.position;
    const cx = toCell(pos.x);
    const cz = toCell(pos.z);
    const idx = cz * lv.w + cx;
    const inWall = cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h || lv.floor[idx] !== 1
      || lv.opaque[idx] === 1 || (lv.solid[idx] === 1 && pos.y < 1.0 && !g.player.outdoor);
    if (inWall || pos.y < 0.02 || pos.y > ceiling) dead = true;

    if (!dead && p.hostile) {
      const dx = pos.x - pp.x;
      const dz = pos.z - pp.z;
      if (dx * dx + dz * dz < 0.45 * 0.45 + 0.1 && pos.y > pp.y && pos.y < pp.y + 2) {
        dead = true;
        if (fx.chance(g.derivedCache.dodge)) {
          floatText(g, pp.clone().setY(2.2), 'DODGE', '#9ad0ff');
          g.exercise('athletics', 0.5);
        } else {
          projectileHitsPlayer(g, p);
        }
      }
    } else if (!dead) {
      for (const a of g.actors) {
        if (!a.hostile || a.resolved || p.hitIds.has(a.id)) continue;
        // An ally's shot goes past whoever the ally may not touch (the dummy; the calm, while the floor sleeps).
        if (p.owner !== null && allyIgnores(g, a)) continue;
        const h = a.kind === 'boss' ? 3.8 : a.kind === 'reply' || a.kind === 'mosquito' ? 1.8 : 2;
        const dx = pos.x - a.pos.x;
        const dz = pos.z - a.pos.z;
        if (dx * dx + dz * dz < (a.radius + 0.25) ** 2 && pos.y < h) {
          p.hitIds.add(a.id);
          if (p.kind === 'stun' && !shrugsOff(g, a)) stun(a, 2.2);
          const knock = p.vel.clone().setY(0).normalize().multiplyScalar(p.kind === 'duck' ? 4 : 1.5);
          if (p.kind === 'salmiakki') {
            if (!shrugsOff(g, a)) {
              a.poisonT = 6;
              a.poisonDps = p.damage;
            }
            hurtActor(g, a, p.damage * 0.5, knock);
          } else if (p.owner === null) {
            strike(g, a, p.damage, knock, 'ranged');
            if (a.kind === 'dummy') g.practice({ type: 'hit', how: p.kind === 'label' ? 'label' : 'other' });
          } else {
            hurtActor(g, a, p.damage * (a.shielded ? 0.5 : 1), knock);
          }
          sfx.hit();
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      if (p.splash > 0) {
        if (p.hostile) {
          const dist = Math.hypot(pos.x - pp.x, pos.z - pp.z);
          if (dist < p.splash && !p.hitIds.has(-1)) {
            hurtPlayer(g, p.damage * 0.8, p.owner, 'boss', pos);
            if (p.kind === 'po') g.addActionItem('Procurement');
          }
        } else {
          splash(g, pos, p.splash, p.damage * (p.owner === null ? g.derivedCache.rangedMult : 1), -1, p.owner !== null);
        }
        sfx.boom();
        fxBall(g, pos.clone(), p.kind === 'po' ? 0xb5835a : p.kind === 'steam' ? 0xffffff : 0xffd400, 0.3, 0.45, p.splash * 1.4);
        g.shake(0.25);
      }
      g.scene.remove(m);
    } else {
      keep.push(p);
    }
  }
  g.projectiles = keep;
}

const SUBJECTS = ['Quick sync re: the sync', 'Stand-up (sit-down)', 'Lessons learned: lessons', 'Alignment on alignment', 'KPI deep dive', '1:1 (with 14 people)'];

/** Where a projectile came from: a little back along its flight. */
const cameFrom = new THREE.Vector3();

function projectileHitsPlayer(g: Game, p: Projectile): void {
  const s = g.save;
  const src = cameFrom.copy(p.mesh.position).addScaledVector(p.vel, -0.2);
  switch (p.kind) {
    case 'ticket':
      hurtPlayer(g, p.damage, p.owner, 'ticket', src);
      if (p.owner !== null) g.enqueueTicket(p.owner, false);
      break;
    case 'gold':
      hurtPlayer(g, p.damage, p.owner, 'ticket', src);
      if (p.owner !== null && p.owner.kind !== 'boss') g.enqueueTicket(p.owner, true);
      break;
    case 'invite':
      if (hurtPlayer(g, p.damage, p.owner, 'meeting', src) && !g.derivedCache.noRoot) {
        const resist = (s.sign === 'freeze' ? 0.5 : 1) / (1 + perk(s, 'teflon')) * (1 - s.attrs.liver * 0.004) * (perk(s, 'ironwill') > 0 ? 0.5 : 1);
        g.rootPlayer(2.2 * resist, `In a meeting: "${fx.pick(SUBJECTS)}"`);
        g.tip('manager');
      }
      break;
    case 'po':
      p.hitIds.add(-1);
      hurtPlayer(g, p.damage, p.owner, 'boss', src);
      g.addActionItem('Procurement');
      break;
    case 'chat':
      // The chatbot's answer is never the answer. It is, however, very slow.
      if (hurtPlayer(g, p.damage, p.owner, 'ticket', src)) {
        g.slowT = Math.max(g.slowT, 2);
        g.rootPlayer(0.4, 'Reading 14 suggested articles');
      }
      break;
    case 'deck':
      if (hurtPlayer(g, p.damage, p.owner, 'meeting', src) && fx.chance(0.35)) g.addActionItem(p.owner?.name ?? 'A consultant');
      break;
    default:
      hurtPlayer(g, p.damage, p.owner, p.owner?.kind === 'boss' ? 'boss' : 'ticket', src);
  }
}

/**
 * All damage to you. Returns false when it was blocked or parried outright.
 * `src` is where it came from, for the arc on the screen's edge (the
 * attacker when not given; with neither, a faint ring all round).
 */
export function hurtPlayer(g: Game, amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura' | 'bite', src: THREE.Vector3 | null = null): boolean {
  if (g.screen !== 'play') return false;
  const s = g.save;
  const d = g.derivedCache;
  void d;
  // Blocking: anything coming at you from the front.
  if (g.blocking && from !== null && kind !== 'aura') {
    const dx = from.pos.x - g.player.pos.x;
    const dz = from.pos.z - g.player.pos.z;
    const f = fwdOf(g.player.yaw);
    const facing = (dx * f.x + dz * f.z) / Math.max(1e-4, Math.hypot(dx, dz));
    if (facing > 0.2) {
      // Timed on the strike: the guard went up in the last moment before it landed.
      if (isParry(g.rmbT)) {
        sfx.parry();
        floatText(g, g.player.pos.clone().setY(2.3), 'PARRY', '#7dffea');
        g.particles.emit('sparks', g.player.pos.clone().addScaledVector(fwdOf(g.player.yaw), 0.7).setY(1.4), 14, 0.2);
        if (Math.hypot(dx, dz) < 3.5 && from.kind !== 'boss') {
          stun(from, 1.2);
          from.push.add(new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(6));
        }
        g.exercise('sisu', 1);
        const n = Number(s.flags.parries ?? 0) + 1;
        s.flags.parries = n;
        if (n >= 10) g.achieve('parry');
        if (from.kind === 'dummy') g.practice({ type: 'guard', how: 'parried' });
        return false;
      }
      sfx.block();
      s.energy = Math.max(0, s.energy - amount * 0.5);
      // A blocked practice swing costs the guard its energy and nothing else.
      if (from.kind === 'dummy') {
        g.practice({ type: 'guard', how: 'blocked' });
        return false;
      }
      amount *= 0.35;
      g.exercise('sisu', 0.4);
    }
  }
  // A practice swing that got through: a little, and the moment Sanity is explained.
  if (from?.kind === 'dummy') g.practice({ type: 'guard', how: 'hurt' });
  let dmg = amount * (1 - d.armor);
  if (from !== null && (from.kind === 'boss' || from.kind === 'manager' || kind === 'boss')) dmg *= 1 - d.bossResist;
  if (g.sisuT > 0) dmg *= 0.5;
  if (s.hangover > 0 && !d.ultra) dmg *= 1.1;
  // Practice never burns anybody out, Ironman included.
  if (from?.kind === 'dummy') dmg = practiceDamage(dmg, s.sanity);
  s.sanity -= dmg;
  g.hurtFlash = Math.min(1, g.hurtFlash + 0.25 + dmg / 40);
  g.exercise('sisu', Math.min(1, dmg / 20));
  if (from?.elite === 'passive') s.energy = Math.max(0, s.energy - 12);
  if (kind === 'bite' && fx.chance(0.3)) g.hud.toast('Bzzz. *slap*', 'info');
  g.hud.flash(kind === 'meeting' ? 'meeting' : 'hurt');
  sfx.hurt();
  g.shake(Math.min(0.5, dmg / 30));
  g.faceT = 0.6;
  const at = src ?? from?.pos ?? null;
  if (at !== null && kind !== 'aura') {
    const dx = at.x - g.player.pos.x;
    const dz = at.z - g.player.pos.z;
    const ang = screenAngle(dx, dz, g.player.yaw);
    g.faceMood = Math.abs(ang) < Math.PI / 4 ? 'hurt' : ang > 0 ? 'right' : 'left';
    g.hud.hitFrom(dx, dz);
  } else {
    g.faceMood = 'hurt';
    g.hud.hitAround();
  }
  if (s.sanity <= 0) lastStand(g);
  return true;
}

/**
 * The things that stand between you and a burnout, whatever brought you to
 * zero: a hit, the jitters, the shakes, a wrong fix. True if one held.
 */
export function lastStand(g: Game): boolean {
  const s = g.save;
  const fs = s.floorState;
  if (g.sisuT > 0) {
    s.sanity = 1;
    return true;
  }
  if (perk(s, 'unbreakable') > 0 && !fs.unbreakableUsed) {
    fs.unbreakableUsed = true;
    s.sanity = 1;
    g.sisuT = 3;
    g.hud.toast('UNBREAKABLE. Not today.', 'epic');
    return true;
  }
  if (g.derivedCache.specials.has('nokia') && !fs.nokiaUsed) {
    fs.nokiaUsed = true;
    s.sanity = 1;
    g.hud.toast('The Nokia 3310 takes the hit. It is fine. It is always fine.', 'epic');
    return true;
  }
  return false;
}

/** Spawn indices of people who came because of an earlier choice start here. */
export const EXTRA_BASE = 100000;

/** Remember that a level spawn is dealt with, so a reload does not bring it back. */
export function markResolved(g: Game, a: Actor): void {
  if (a.spawnIndex >= 0 && g.save.location === 'office' && !g.save.floorState.resolved.includes(a.spawnIndex)) g.save.floorState.resolved.push(a.spawnIndex);
}

/**
 * Reloading a floor whose boss is already resolved: the boss's legendary and
 * its evidence are put back where the boss fell, if you never picked them up.
 */
export function redropBossLoot(g: Game): void {
  const s = g.save;
  const at = new THREE.Vector3(g.level.bossSpawn.x, 0, g.level.bossSpawn.z);
  const u = BOSS_UNIQUES[g.floor % BOSS_UNIQUES.length];
  if (u !== undefined && s.flags[`unique_${u}`] !== true && !g.pickups.some((p) => p.gear?.unique === u)) {
    const inst = uniqueInstance(u, g.lootRng);
    if (inst !== null) dropGear(g, at, inst);
  }
  const drop = MAIN[g.floor]?.bossDrop;
  if (drop !== undefined && g.floor <= 4 && !s.questItems.includes(drop) && !s.floorState.picked.includes(drop)) dropQuestItem(g, at, drop);
}

// ================================================================== resolving people

/** Resolved in combat: the core loop. */
export function resolveActor(g: Game, a: Actor): void {
  const s = g.save;
  a.resolved = true;
  // Whatever they were winding up goes with them, glow and all.
  cancelWindup(a);
  a.removeIn = a.kind === 'boss' ? 3 : 1.4;
  a.flash = 1;
  a.hpBar.visible = false;
  markResolved(g, a);
  if (a.expired) return;
  const rep = Math.round(a.rep * (1 + perk(s, 'listening') * 0.05));
  g.addRep(rep);
  sfx.resolved();
  g.faceMood = 'grin';
  g.faceT = 1.2;
  const t = TICKETS[a.ticket];
  if (a.stolen > 0) {
    // Your own money back, exactly: no employer bonus on a refund.
    s.rep += a.stolen;
    g.hud.toast(`The vendor's "workshop fee" is refunded: +₡${a.stolen}.`, 'good');
  }
  if (a.kind === 'boss' && a.boss !== null) {
    resolveBoss(g, a, rep);
    return;
  }
  const line = a.kind === 'reply' ? 'Unsubscribed.' : a.kind === 'jam' ? '*whirr* READY' : a.kind === 'mosquito' ? '*splat*'
    : a.kind === 'turret' ? '*decommissioned*' : a.kind === 'chatbot' ? 'Was this conversation helpful? 👍' : fx.pick(RESOLVED_LINES);
  say(a, line, 2, '#063', 'rgba(220,255,225,0.95)');
  g.particles.emit(a.gold ? 'gold' : a.kind === 'turret' ? 'sparks' : a.kind === 'mosquito' ? 'splash' : 'confetti', a.pos.clone().setY(1.4), a.kind === 'mosquito' ? 4 : a.elite !== null ? 60 : 26, 0.4);
  if (a.kind === 'mosquito' || a.kind === 'turret') return;
  s.stats.resolvedField++;
  // Throughput pleases management; being stapled does not please staff.
  if (a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer') {
    adjustStanding(s, 'staff', -0.4);
    adjustStanding(s, 'management', 0.3);
  }
  const before = s.queue.length;
  s.queue = s.queue.filter((q) => q.from !== a.name);
  const cleared = before - s.queue.length;
  floatText(g, a.pos.clone().setY(2.6), `+₡${rep}`, '#7dff9a');
  if (a.kind !== 'reply') g.hud.toast(`Resolved in person: "${t?.title ?? 'it'}" +₡${rep}${cleared > 0 ? ' (ticket closed)' : ''}`, 'good');
  questProgress(g, 'users');
  questEvent(g, { type: 'resolve', kind: a.kind, peaceful: false, elite: a.elite !== null, tag: a.questTag });
  if (a.elite !== null) {
    s.stats.elites++;
    g.achieve('elite');
    for (let i = 0; i < 2; i++) dropLoot(g, a.pos, true);
    dropGearFrom(g, a.pos, g.lootRng.chance(0.12) ? 'legendary' : 'rare');
    return;
  }
  const lootChance = a.kind === 'customer' || a.kind === 'manager' || a.kind === 'consultant' ? 0.7 : a.kind === 'reply' ? 0.05 : 0.3;
  if (fx.chance(lootChance)) dropLoot(g, a.pos, false);
  if (fx.chance(a.kind === 'customer' || a.kind === 'consultant' || a.kind === 'shadowit' ? 0.12 : 0.04)) dropGearFrom(g, a.pos);
}

function resolveBoss(g: Game, a: Actor, rep: number): void {
  const s = g.save;
  const def = a.boss;
  if (def === null) return;
  say(a, def.defeat, 4, '#fff', 'rgba(0,100,40,0.92)');
  g.particles.emit('gold', a.pos.clone().setY(2.5), 90, 1);
  g.particles.emit('confetti', a.pos.clone().setY(2.5), 120, 1.2);
  s.stats.bosses++;
  s.floorState.bossDone = true;
  g.elevatorOpen = true;
  sfx.setBoss(false);
  sfx.levelUp();
  s.quests = s.quests.filter((q) => q.kind !== 'boss');
  adjustStanding(s, 'management', 6);
  g.journal(`Resolved the major incident: ${a.name}.`);
  g.hud.toast(`MAJOR INCIDENT RESOLVED: ${a.name}. +₡${rep}. The lift is unlocked - the weekend awaits.`, 'epic');
  const exit = g.level.interactables.find((i) => i.kind === 'elevator');
  exit?.mesh?.traverse((o) => {
    if (o.name === 'lamp' && o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(0x30ff60);
  });
  for (let i = 0; i < 4; i++) dropLoot(g, a.pos, true);
  // Phase two's hazards go out with the boss.
  for (const h of g.hazards) h.ttl = Math.min(h.ttl, 0.4);
  // Every boss carries its legendary, once per career (it counts once you pick it up).
  const u = BOSS_UNIQUES[g.floor % BOSS_UNIQUES.length];
  if (u !== undefined && s.flags[`unique_${u}`] !== true) {
    const inst = uniqueInstance(u, g.lootRng);
    if (inst !== null) dropGear(g, a.pos, inst);
  } else {
    dropGearFrom(g, a.pos, 'rare');
  }
  // The king of cans: bosses keep one in their desk drawer.
  if (g.lootRng.chance(0.35)) dropItem(g, a.pos, 'whitemonster');
  // Evidence the boss was carrying.
  const drop = MAIN[g.floor]?.bossDrop;
  if (drop !== undefined && g.floor <= 4 && !s.questItems.includes(drop)) dropQuestItem(g, a.pos, drop);
  if (s.floorState.drinksHere === 0) g.achieve('sober');
  questEvent(g, { type: 'boss', floor: g.floor });
  for (const o of g.actors) if (o.hostile && !o.resolved && o.kind !== 'boss' && o.kind !== 'dummy' && fx.chance(0.5)) o.hp = 0;
  g.autosaveSoon();
}

// ================================================================== loot on the floor

function pickupMesh(color: number, emissive: number, size = 0.3): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshLambertMaterial({ color, emissive }));
}

function placeDrop(g: Game, at: THREE.Vector3, mesh: THREE.Object3D, pickup: Omit<Pickup, 'mesh' | 't'>, scatter = true): void {
  mesh.position.set(at.x + (scatter ? fx.range(-0.8, 0.8) : 0), 0.4, at.z + (scatter ? fx.range(-0.8, 0.8) : 0));
  g.scene.add(mesh);
  g.pickups.push({ ...pickup, mesh, t: 0 });
  if (pickup.gear !== null && !g.save.floorState.gearDrops.some((p) => p.gear.uid === pickup.gear?.uid)) {
    g.save.floorState.gearDrops.push({ gear: pickup.gear, x: mesh.position.x, z: mesh.position.z });
  }
}

export function dropItem(g: Game, at: THREE.Vector3, id: string): void {
  const king = id === 'whitemonster';
  const drink = DRINKS.includes(id);
  const can = ENERGY_DRINKS.includes(id);
  const mesh = king ? whiteMonsterMesh() : pickupMesh(drink ? 0xd4af37 : can ? 0x3aff6a : 0xffb0d0, drink ? 0x4a3a0a : can ? 0x0a4a1a : 0x4a1a2a);
  placeDrop(g, at, mesh, { kind: 'item', id, amount: 1, gear: null, permanent: false });
}

/** The White Monster gets a proper can: white, glowing, unmistakable. */
function whiteMonsterMesh(): THREE.Group {
  const grp = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 16), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a9a9a }));
  grp.add(can);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.01), new THREE.MeshBasicMaterial({ color: 0xc8c8c8 }));
  claw.position.set(0, 0, 0.132);
  grp.add(claw);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.34;
  grp.add(halo);
  return grp;
}

export function dropLoot(g: Game, at: THREE.Vector3, rich: boolean): void {
  const s = g.save;
  const r = g.lootRng;
  // Rarest of all: the king of energy drinks.
  if (r.chance(rich ? 0.04 : 0.008)) {
    dropItem(g, at, 'whitemonster');
    return;
  }
  const ownedAmmo = (['labels', 'air', 'ducks', 'toner'] as const).filter((k) =>
    s.gear.some((gi) => { const w = itemById(gi.base); return w?.slot === 'weapon' && w.ammo === k; }));
  if (ownedAmmo.length > 0 && r.chance(0.5)) {
    const k = r.pick(ownedAmmo);
    const def = AMMO.find((a) => a.ammo === k);
    const eng = s.track === 'engineer' && s.rung >= 4 ? 2 : 1;
    const amount = Math.ceil((def?.amount ?? 10) * (rich ? 0.8 : 0.35) * eng);
    placeDrop(g, at, pickupMesh(0x3aa0ff, 0x0a2a4a, 0.4), { kind: 'ammo', id: k, amount, gear: null, permanent: false });
    return;
  }
  if (r.chance(rich ? 0.12 : 0.03)) {
    const unread = BOOK_IDS.filter((b) => !s.booksRead.includes(b));
    dropItem(g, at, r.pick(unread.length > 0 ? unread : BOOK_IDS));
    return;
  }
  if (rich && r.chance(0.06)) {
    const unknown = RUNES.filter((id) => (s.consumables[id] ?? 0) === 0 && !s.spells.includes(itemRune(id)));
    if (unknown.length > 0) {
      dropItem(g, at, r.pick(unknown));
      return;
    }
  }
  const pool = ['biscuits', 'coffee', 'espresso', 'postit', 'paperclip', 'paperclip', 'beer', 'lonkero', rich ? 'cake' : 'biscuits', ...ENERGY_DRINKS.slice(0, 6)];
  dropItem(g, at, r.pick(pool));
}

export function dropGear(g: Game, at: THREE.Vector3, inst: GearInstance, scatter = true): void {
  const col = parseInt(RARITY_INFO[inst.rarity].color.slice(1), 16);
  // The shape says the rarity as well as the colour does (RARITY_SHAPE).
  const shape = RARITY_SHAPE[inst.rarity];
  const geo = shape === 'tetra' ? new THREE.TetrahedronGeometry(0.3)
    : shape === 'octa' ? new THREE.OctahedronGeometry(0.28)
      : shape === 'dodeca' ? new THREE.DodecahedronGeometry(0.26)
        : new THREE.IcosahedronGeometry(0.3);
  const mesh = new THREE.Mesh(geo,new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 }));
  placeDrop(g, at, mesh, { kind: 'gear', id: inst.base, amount: 1, gear: inst, permanent: true }, scatter);
}

/** Rebuild saved drops without scattering them or rolling another item. */
export function restoreGearDrops(g: Game): void {
  for (const p of g.save.floorState.gearDrops) dropGear(g, new THREE.Vector3(p.x, 0, p.z), p.gear, false);
}

/** A random piece of kit, scaled to the floor; elites and closets roll better. */
export function dropGearFrom(g: Game, at: THREE.Vector3, force?: 'fine' | 'rare' | 'legendary'): void {
  const s = g.save;
  if (force === 'legendary') {
    const lying = new Set(g.pickups.map((p) => p.gear?.unique).filter((x): x is string => x !== undefined));
    const unowned = WORLD_UNIQUES.filter((u) => s.flags[`unique_${u}`] !== true && !lying.has(u));
    const u = unowned.length > 0 ? g.lootRng.pick(unowned) : null;
    if (u !== null) {
      const inst = uniqueInstance(u, g.lootRng);
      if (inst !== null) {
        dropGear(g, at, inst);
        return;
      }
    }
    force = 'rare';
  }
  const luck = skill(s, 'security') * 0.001 + s.attrs.charm * 0.0005;
  dropGear(g, at, rollGear(g.lootRng, g.floor, luck, force));
}

export function dropQuestItem(g: Game, at: THREE.Vector3, id: string): void {
  const mesh = questItemMesh(0xffd98a);
  placeDrop(g, at, mesh, { kind: 'quest', id, amount: 1, gear: null, permanent: true });
}

/** A quest item placed exactly (not scattered). */
export function placeQuestPickup(g: Game, x: number, z: number, id: string): void {
  const mesh = questItemMesh(0xffd98a);
  mesh.position.set(x, 0.4, z);
  g.scene.add(mesh);
  g.pickups.push({ mesh, kind: 'quest', id, amount: 1, gear: null, t: 0, permanent: true });
}

export function updatePickups(g: Game, dt: number): void {
  const pp = g.player.pos;
  const s = g.save;
  g.pickups = g.pickups.filter((p) => {
    p.t += dt;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 0.4 + Math.sin(p.t * 3) * 0.1;
    const dist = Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z);
    if (dist < 3 && p.kind !== 'quest') {
      p.mesh.position.x += (pp.x - p.mesh.position.x) * dt * 6;
      p.mesh.position.z += (pp.z - p.mesh.position.z) * dt * 6;
    }
    if (p.gear !== null) {
      const record = s.floorState.gearDrops.find((r) => r.gear.uid === p.gear?.uid);
      if (record !== undefined) {
        record.x = p.mesh.position.x;
        record.z = p.mesh.position.z;
      }
    }
    const remove = (): false => {
      if (p.gear !== null) s.floorState.gearDrops = s.floorState.gearDrops.filter((r) => r.gear.uid !== p.gear?.uid);
      g.scene.remove(p.mesh);
      disposeTree(p.mesh, true);
      return false;
    };
    if (dist < (p.kind === 'quest' ? 1.4 : 0.8)) {
      sfx.pickup();
      switch (p.kind) {
        case 'ammo':
          s.ammo[p.id as AmmoKind] += p.amount;
          g.hud.toast(`+${p.amount} ${p.id}`);
          break;
        case 'gear':
          if (p.gear !== null) {
            s.gear.push(p.gear);
            if (p.gear.unique !== undefined) s.flags[`unique_${p.gear.unique}`] = true;
            g.hud.toast(`Found: ${p.gear.name} (${RARITY_INFO[p.gear.rarity].name}). Equip it from your backpack (Tab).`, p.gear.rarity === 'legendary' ? 'epic' : 'good');
            if (p.gear.rarity === 'legendary') g.achieve('legendary');
            g.tip('loot');
            g.refreshDerived();
          }
          break;
        case 'quest':
          // Paperwork is counted by the quest, not carried.
          if (!TRANSIENT_ITEMS.includes(p.id)) {
            if (!s.questItems.includes(p.id)) s.questItems.push(p.id);
            if (!s.floorState.picked.includes(p.id)) s.floorState.picked.push(p.id);
          }
          questEvent(g, { type: 'pickup', item: p.id });
          g.autosaveSoon();
          break;
        default:
          g.giveItem(p.id, 1, '');
          if (p.id === 'whitemonster') g.hud.toast('⚪ A WHITE MONSTER. The king of cans. Save it for when it matters.', 'epic');
      }
      return remove();
    }
    // Loot lies about for a few minutes; quest things and gear wait for you.
    if (!p.permanent && p.t > 180) return remove();
    return true;
  });
}

// ================================================================== hazards (boss phase two)

const HAZARD_COLOR: Record<HazardKind, number> = { coffee: 0x6b3a1a, fire: 0xff5a1a, meeting: 0x4a8cff, freeze: 0x9ad8ff };

export function spawnHazard(g: Game, x: number, z: number, radius: number, seconds: number, kind: HazardKind): void {
  if (g.hazards.filter((h) => h.kind !== null).length > 14) return;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ color: HAZARD_COLOR[kind], transparent: true, opacity: 0.0, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.04, z);
  g.scene.add(mesh);
  g.hazards.push({ mesh, x, z, radius, ttl: seconds, life: seconds, kind, armAt: 0.9, tick: 0.8 });
}

/**
 * A landing marker: the same fade-in as a boss hazard's telegraph, where a
 * PO bomb will come down or along a laser's line, gone as the hit arrives.
 */
export function spawnTelegraph(g: Game, t: TelegraphSpec): void {
  if (g.hazards.length > 60) return;
  const geo = t.beam === undefined ? new THREE.CircleGeometry(t.radius, 32) : new THREE.PlaneGeometry(t.radius * 2, t.beam.length);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2;
  if (t.beam === undefined) {
    mesh.position.set(t.x, 0.05, t.z);
  } else {
    // A strip from (x, z) out along the bearing: centred half its length out.
    const half = t.beam.length / 2;
    mesh.position.set(t.x + Math.sin(t.beam.angle) * half, 0.05, t.z + Math.cos(t.beam.angle) * half);
    mesh.rotation.z = t.beam.angle;
  }
  g.scene.add(mesh);
  g.hazards.push({ mesh, x: t.x, z: t.z, radius: t.radius, ttl: t.seconds, life: t.seconds, kind: null, armAt: t.seconds, tick: 0 });
}

export function updateHazards(g: Game, dt: number): void {
  const pp = g.player.pos;
  const s = g.save;
  g.hazardSlow = 0;
  g.hazards = g.hazards.filter((h) => {
    h.ttl -= dt;
    const age = h.life - h.ttl;
    // A telegraph: it fades in before it bites (a hazard's first second; a marker's whole life).
    const armed = age > h.armAt;
    const m = h.mesh.material as THREE.MeshBasicMaterial;
    m.opacity = telegraphOpacity(age, h.armAt, g.time);
    if (h.kind !== null && h.ttl < 1) m.opacity *= h.ttl;
    if (armed && h.kind !== null && Math.hypot(pp.x - h.x, pp.z - h.z) < h.radius && pp.y < 0.5) {
      switch (h.kind) {
        case 'coffee':
          g.hazardSlow = Math.max(g.hazardSlow, 0.45);
          break;
        case 'freeze':
          g.hazardSlow = Math.max(g.hazardSlow, 0.65);
          break;
        case 'meeting':
          g.hazardSlow = Math.max(g.hazardSlow, 0.3);
          s.energy = Math.max(0, s.energy - 18 * dt);
          break;
        case 'fire':
          h.tick -= dt;
          if (h.tick <= 0) {
            h.tick = 0.5;
            hurtPlayer(g, (4 + g.floor * 1.5) * g.difficulty, null, 'aura');
          }
          break;
      }
    }
    if (h.ttl <= 0) {
      g.scene.remove(h.mesh);
      h.mesh.geometry.dispose();
      m.dispose();
      return false;
    }
    return true;
  });
}

// ================================================================== fx

export function fxBall(g: Game, at: THREE.Vector3, color: number, life: number, size: number, grow: number, rise = 0): void {
  if (g.fxMeshes.length > 80) return;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
  mesh.position.copy(at);
  g.scene.add(mesh);
  g.fxMeshes.push({ mesh, ttl: life, life, grow, rise });
}

export function fxRing(g: Game, at: THREE.Vector3, color: number, radius: number): void {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.copy(at);
  g.scene.add(mesh);
  g.fxMeshes.push({ mesh, ttl: 0.5, life: 0.5, grow: radius, rise: 0 });
}

export function steamBurst(g: Game, at: THREE.Vector3, radius: number): void {
  g.particles.emit('steam', at.clone().setY(1), Math.round(12 + radius * 6), radius * 0.5);
  for (let i = 0; i < 4; i++) {
    const p = at.clone().add(new THREE.Vector3(fx.range(-1, 1) * radius * 0.6, fx.range(0.3, 1.6), fx.range(-1, 1) * radius * 0.6));
    fxBall(g, p, 0xf4f8ff, fx.range(0.6, 1.1), fx.range(0.3, 0.6), 2.5, 1.2);
  }
}

export function updateFx(g: Game, dt: number): void {
  g.fxMeshes = g.fxMeshes.filter((f) => {
    f.ttl -= dt;
    const k = 1 - f.ttl / f.life;
    f.mesh.scale.setScalar(0.2 + k * f.grow);
    f.mesh.position.y += f.rise * dt;
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 * (1 - k));
    if (f.ttl <= 0) {
      g.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
      return false;
    }
    return true;
  });
  g.floaters = g.floaters.filter((f) => {
    f.ttl -= dt;
    f.sprite.position.y += dt * 1.2;
    f.sprite.material.opacity = Math.min(1, f.ttl * 2);
    if (f.ttl <= 0) {
      g.scene.remove(f.sprite);
      disposeSprite(f.sprite);
      return false;
    }
    return true;
  });
}

export function floatText(g: Game, pos: THREE.Vector3, text: string, color: string): void {
  if (g.floaters.length > 40) return;
  // Plain numbers are damage numbers, which the settings can turn off.
  if (!g.settings.damageNumbers && /^\d+$/.test(text)) return;
  const sp = textSprite(text, { color, size: 30 });
  sp.position.copy(pos);
  sp.material.depthTest = false;
  g.scene.add(sp);
  g.floaters.push({ sprite: sp, ttl: 0.9 });
}

function itemRune(id: string): string {
  return CONSUMABLES.find((c) => c.id === id)?.rune ?? '';
}

// ================================================================== a duel, for the browser tests

/**
 * Put one of `kind` in front of the player, `dist` metres off and already
 * after them, with everyone else on the floor told to leave it: the setup
 * the combat tests play out with real keys. The player is turned to face a
 * direction with room to strafe right. Returns the newcomer's id, or -1.
 */
export function stageDuel(g: Game, kind: ActorKind, dist: number): number {
  for (const a of g.actors) {
    if (!a.hostile || a.resolved) continue;
    a.aggro = false;
    a.docile = true;
    cancelWindup(a);
  }
  const pp = g.player.pos;
  const lv = g.level;
  for (let k = 0; k < 16; k++) {
    const yaw = g.player.yaw + (k * Math.PI) / 8;
    const ex = pp.x - Math.sin(yaw) * dist;
    const ez = pp.z - Math.cos(yaw) * dist;
    // Room to step three metres right, and a clear line to the newcomer.
    const rx = pp.x + Math.cos(yaw) * 3;
    const rz = pp.z - Math.sin(yaw) * 3;
    if (!walkClear(lv, pp.x, pp.z, ex, ez) || !walkClear(lv, pp.x, pp.z, rx, rz) || !walkClear(lv, ex, ez, rx, rz)) continue;
    if (!lineOfSight(lv, pp.x, pp.z, ex, ez) || lv.solid[toCell(ez) * lv.w + toCell(ex)] !== 0 || lv.solid[toCell(rz) * lv.w + toCell(rx)] !== 0) continue;
    // Nothing to press E on ahead of you and nearer than they are (the lift
    // doors, a terminal): a duel is the two of you.
    const between = lv.interactables.some((it) => {
      const d = Math.hypot(it.x - pp.x, it.z - pp.z);
      const ahead = ((it.x - pp.x) * -Math.sin(yaw) + (it.z - pp.z) * -Math.cos(yaw)) / Math.max(d, 1e-4);
      return d < dist + 1 && ahead > 0;
    });
    if (between) continue;
    const a = g.spawnAt(kind, ex, ez, lv.roomOf[toCell(ez) * lv.w + toCell(ex)] ?? -1, true);
    if (a === null) continue;
    g.player.yaw = yaw;
    g.player.pitch = 0;
    a.docile = false;
    a.cooldown = 0;
    a.yaw = Math.atan2(pp.x - a.pos.x, pp.z - a.pos.z);
    g.save.sanity = g.derivedCache.maxSanity;
    return a.id;
  }
  return -1;
}

/**
 * Stand the player `dist` metres from `a` on open floor, facing them, with
 * nothing between: where a browser test starts the walk-up to somebody who
 * will not hold still (a boss). It moves only the player; whatever happens
 * next is the game's. False if no such spot is free.
 */
export function standBeforeActor(g: Game, a: Actor, dist: number): boolean {
  const lv = g.level;
  for (let k = 0; k < 24; k++) {
    const ang = (k * Math.PI) / 12;
    const x = a.pos.x + Math.sin(ang) * dist;
    const z = a.pos.z + Math.cos(ang) * dist;
    const cx = toCell(x);
    const cz = toCell(z);
    if (cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h || lv.solid[cz * lv.w + cx] !== 0 || lv.floor[cz * lv.w + cx] !== 1) continue;
    if (!lineOfSight(lv, x, z, a.pos.x, a.pos.z) || !walkClear(lv, x, z, a.pos.x, a.pos.z)) continue;
    g.player.pos.set(x, 0, z);
    // The player faces -sin(yaw), -cos(yaw).
    g.player.yaw = Math.atan2(x - a.pos.x, z - a.pos.z);
    g.player.pitch = 0;
    return true;
  }
  return false;
}
