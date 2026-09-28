import * as THREE from 'three';
import { sfx } from './audio';
import { fxBall, fxRing, muzzle, aimPoint, steamBurst, strike } from './combat';
import { type Actor, say, stun, TALKERS } from './entities';
import type { Game } from './game';
import { lineOfSight, toCell } from './level';
import { castChance, spellById } from './magic';
import { fx } from './rng';
import { perk, skill } from './state';

/** Mökki magic and the domain abilities (G). */

export function castOdds(g: Game, cost: number): number {
  const s = g.save;
  const kalevala = perk(s, 'kalevala') > 0 ? 15 : 0;
  return castChance(cost, skill(s, 'runecraft'), s.attrs.tech, s.attrs.liver, g.derivedCache.band.spell + kalevala);
}

export function cycleSpell(g: Game): void {
  const s = g.save;
  if (s.spells.length === 0) {
    g.hud.toast('You know no runes. Find the Saunatonttu in a sauna, or at the mökki.');
    return;
  }
  const i = s.spell === null ? -1 : s.spells.indexOf(s.spell);
  s.spell = s.spells[(i + 1) % s.spells.length] ?? null;
  const sp = s.spell === null ? undefined : spellById(s.spell);
  if (sp !== undefined) g.hud.toast(`${sp.name} (${sp.english}): ${sp.desc}`);
}

export function castSpell(g: Game): void {
  const s = g.save;
  const d = g.derivedCache;
  const sp = s.spell === null ? undefined : spellById(s.spell);
  if (sp === undefined) {
    g.hud.toast('No rune selected. The Saunatonttu teaches runes.');
    return;
  }
  const cost = Math.round(sp.cost * d.spellCost);
  if (s.loyly < cost) {
    sfx.fizzle();
    g.hud.toast('Not enough Löyly. Sit in a sauna, or drink a Salmari.', 'bad');
    return;
  }
  const odds = castOdds(g, sp.cost);
  if (!fx.chance(odds)) {
    if (perk(s, 'kalevala') === 0) s.loyly -= cost / 2;
    sfx.fizzle();
    g.hud.toast(`The rune fizzles. (${Math.round(odds * 100)}% chance)`, 'bad');
    g.exercise('runecraft', 0.4);
    return;
  }
  s.loyly -= cost;
  s.stats.spellsCast++;
  g.exercise('runecraft', 1 + sp.cost / 25);
  const pp = g.player.pos;
  const near = (r: number): Actor[] => g.actors.filter((a) => a.hostile && !a.resolved && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < r && lineOfSight(g.level, pp.x, pp.z, a.pos.x, a.pos.z));
  g.player.swing = 1;
  switch (sp.id) {
    case 'steam':
      sfx.hiss();
      steamBurst(g, pp.clone(), 5);
      for (const a of near(5.5)) {
        strike(g, a, 28 + skill(s, 'runecraft') * 0.8, new THREE.Vector3(a.pos.x - pp.x, 0, a.pos.z - pp.z).normalize().multiplyScalar(6), 'spell');
        stun(a, 1);
      }
      break;
    case 'vihta': {
      sfx.swing();
      const fwd = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
      let dealt = 0;
      for (const a of near(4)) {
        const dx = a.pos.x - pp.x;
        const dz = a.pos.z - pp.z;
        if ((dx * fwd.x + dz * fwd.z) / Math.max(0.01, Math.hypot(dx, dz)) < 0.4) continue;
        strike(g, a, 22, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(4), 'spell');
        dealt += 22 * d.spellMult;
      }
      fxBall(g, pp.clone().addScaledVector(fwd, 2).setY(1.2), 0x7aa84a, 0.4, 0.5, 3);
      if (dealt > 0) g.healPlayer(dealt / 3, '');
      break;
    }
    case 'salmiakki': {
      const from = muzzle(g);
      const dir = aimPoint(g).sub(from).normalize();
      g.fire({ kind: 'salmiakki', from, dir, speed: 20, damage: 7 * d.spellMult, hostile: false, owner: null });
      sfx.shoot();
      break;
    }
    case 'sisu':
      g.sisuT = 8;
      sfx.chime();
      g.hud.toast('SISU. Nothing gets through.', 'epic');
      break;
    case 'avanto':
      sfx.splash();
      fxRing(g, pp.clone().setY(0.5), 0x9ad8ff, 7);
      for (const a of near(7)) {
        a.slowT = 5;
        strike(g, a, 10, null, 'spell');
      }
      s.bac = Math.max(0, s.bac - 30);
      s.stomach = 0;
      s.hangover = 0;
      s.caffeine *= 0.6;
      g.refreshDerived();
      g.hud.toast('AVANTO! The cold hits like a truth. Sober, calm, and very awake.', 'good');
      break;
    case 'silence':
      g.invisT = 10;
      sfx.chime();
      g.hud.toast('Hiljaisuus. Nobody talks to you. Bliss.', 'good');
      break;
    case 'mark':
      g.mark = pp.clone();
      g.hud.toast('Mökkimerkki: this spot is remembered.', 'good');
      sfx.chime();
      break;
    case 'recall': {
      const to = g.mark ?? new THREE.Vector3(g.level.start.x, 0, g.level.start.z);
      steamBurst(g, pp.clone(), 2);
      g.player.pos.copy(to);
      steamBurst(g, to.clone(), 2);
      sfx.hiss();
      break;
    }
    case 'song':
      sfx.chime();
      g.hud.toast('You sing the old song. It goes on for a while. People forget why they came.', 'epic');
      for (const a of near(9)) {
        if (!TALKERS.includes(a.kind) && a.kind !== 'manager') continue;
        g.resolvePeacefully(a, 'charmed');
        say(a, '...what was I doing? Never mind.', 2);
      }
      break;
    case 'tonttu':
      sfx.chime();
      g.spawnAt('helper', pp.x + 1, pp.z + 1, -1, false, { role: 'spirit', ttl: 25 });
      steamBurst(g, pp.clone().add(new THREE.Vector3(1, 0, 1)), 1.5);
      break;
  }
}

/** A Domain Architect recharges twice as fast. */
export function domainCooldown(g: Game): number {
  const s = g.save;
  return s.rung >= 10 && s.arch === 'domain' ? 20 : 40;
}

export function domainAbility(g: Game): void {
  const s = g.save;
  if (s.rung < 4 || s.domain === null) {
    g.hud.toast('Domain abilities come with a specialism (from the fifth rung).');
    return;
  }
  if (g.abilityCd > 0) {
    g.hud.toast(`${s.domain} ability recharging (${Math.ceil(g.abilityCd)}s).`);
    return;
  }
  g.abilityCd = domainCooldown(g);
  const power = s.rung >= 10 && s.arch === 'domain' ? 2 : 1;
  const pp = g.player.pos;
  switch (s.domain) {
    case 'Systems':
      sfx.nova();
      fxRing(g, pp.clone().setY(1), 0x7dff9a, 7);
      for (const a of g.actors) {
        if (!a.hostile || a.resolved || Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) > 7) continue;
        strike(g, a, 55 * g.difficulty * power, new THREE.Vector3(a.pos.x - pp.x, 0, a.pos.z - pp.z).normalize().multiplyScalar(9), 'melee');
      }
      g.hud.toast('HARD REBOOT.', 'epic');
      break;
    case 'Network':
      sfx.chime();
      for (const a of g.actors) {
        if (!a.hostile || a.resolved) continue;
        a.revealT = 15 * power;
        if (Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 20) a.slowT = 3 * power;
        g.level.seen[toCell(a.pos.z) * g.level.w + toCell(a.pos.x)] = 1;
      }
      g.hud.mapOpen = true;
      g.hud.toast('PING SWEEP: everyone on the floor answered. Map open (M).', 'epic');
      break;
    case 'Cloud':
      sfx.chime();
      for (let i = 0; i < 2 * power; i++) g.spawnAt('helper', pp.x + fx.range(-1.5, 1.5), pp.z + fx.range(-1.5, 1.5), -1, false, { role: 'clone', ttl: 20 });
      g.hud.toast('AUTOSCALE: more of you. Billing is somebody else\'s problem.', 'epic');
      break;
    case 'Security':
      sfx.meeting();
      fxRing(g, pp.clone().setY(1), 0x8080ff, 9);
      for (const a of g.actors) {
        if (a.hostile && !a.resolved && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 9) stun(a, 3 * power);
      }
      g.hud.toast('LOCKDOWN.', 'epic');
      break;
    case 'Database': {
      const snap = g.history[0];
      if (snap === undefined) {
        g.abilityCd = 0;
        return;
      }
      steamBurst(g, pp.clone(), 1.5);
      g.player.pos.set(snap.x, 0, snap.z);
      s.sanity = Math.min(g.derivedCache.maxSanity, Math.max(s.sanity, snap.sanity * (power > 1 ? 1.25 : 1)));
      g.history = [];
      sfx.hiss();
      g.hud.toast('ROLLBACK: restored to a known good state.', 'epic');
      break;
    }
  }
}
