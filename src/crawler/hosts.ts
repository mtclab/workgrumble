import * as THREE from 'three';
import { sfx } from './audio';
import { dropGear, EXTRA_BASE } from './combat';
import { questProgress } from './desk';
import { type Actor, say } from './entities';
import type { Game } from './game';
import { ALL_ITEMS, AMMO, CONSUMABLES, itemById, LINING_FOODS } from './items';
import { type GearInstance, plainInstance, RARITY_INFO, rollGear, sellValue, slotOf, uniqueInstance } from './loot';
import { bookById } from './books';
import { fx } from './rng';
import { adjustStanding, canTakePerk, levelUpReady } from './state';
import { levelUpNode, talkAuditor } from './story';
import { caffeinate, drink } from './vices';
import { treePerk } from './perks';
import { CAFFEINE_EFFECTS, caffeineBand } from './caffeine';

export { caughtCheck } from './vices';
export {
  claimQuest,
  deliverLaptop,
  enqueueTicket,
  fixHint,
  fixOptions,
  garble,
  newQuest,
  pullTickets,
  resolveTicket,
  questProgress as mailProgress,
} from './desk';
export { acceptQuest, recruitIntern, turnHostile } from './questing';

// ================================================================== the body

export function healPlayer(g: Game, amount: number, from: string): void {
  const d = g.derivedCache;
  const s = g.save;
  const before = s.sanity;
  s.sanity = Math.min(d.maxSanity, s.sanity + amount * d.healMult);
  const got = Math.round(s.sanity - before);
  if (got > 0) {
    sfx.heal();
    g.hud.flash('heal');
    g.particles.emit('heal', g.player.pos.clone().setY(1.2), 10, 0.5);
    g.floatText(g.player.pos.clone().setY(2.2), `+${got}`, '#7dff9a');
    if (from !== '') g.hud.toast(`${from}: +${got} sanity`, 'good');
  }
}

/**
 * Rooted: in a meeting, frozen, sat down. The Out-of-Office robe and the White
 * Monster shrug off anything forced on you; a meeting you accepted still happens.
 */
export function rootPlayer(g: Game, seconds: number, reason: string, resistible = true): void {
  if (resistible && g.derivedCache.noRoot) return;
  // No back-to-back meetings: after one, a short window where the next invite bounces off.
  if (resistible && g.time < g.rootImmuneUntil) return;
  if (resistible && g.save.perks.ironwill !== undefined) seconds *= 0.5;
  if (resistible) g.rootImmuneUntil = g.time + seconds + 2.5;
  // A longer hold restarts the card's countdown; a shorter one inside it changes nothing but the reason.
  if (seconds > g.rootT) g.rootMax = seconds;
  g.rootT = Math.max(g.rootT, seconds);
  g.rootReason = reason;
  sfx.meeting();
}

export function healerFrequency(g: Game): number {
  const s = g.save;
  return (s.perks.delegate !== undefined ? 1.6 : 1) * (1 + Math.max(0, s.standing.kitchen) / 100) * (g.derivedCache.band.healerMult > 0 ? g.derivedCache.band.healerMult : 0.01);
}

export function addActionItem(g: Game, from: string): void {
  g.save.actionItems++;
  g.refreshDerived();
  g.hud.toast(`${from} assigned you an action item. An office lady or a sticky note can take it off you.`, 'bad');
  g.tip('actionitem');
}

export function clearActionItems(g: Game, from: string): number {
  const n = g.save.actionItems;
  g.save.actionItems = 0;
  g.refreshDerived();
  if (n > 0) {
    sfx.heal();
    g.hud.toast(`${from} took ${n} action item${n > 1 ? 's' : ''} off your hands.`, 'good');
  }
  return n;
}

// ================================================================== things

export function giveItem(g: Game, id: string, n: number, from: string): void {
  const s = g.save;
  s.consumables[id] = (s.consumables[id] ?? 0) + n;
  g.refreshDerived();
  const name = itemById(id)?.name ?? id;
  g.hud.toast(from === '' ? `Picked up ${name}${n > 1 ? ` ×${n}` : ''}` : `${from} gave you ${name}${n > 1 ? ` ×${n}` : ''}`, id === 'whitemonster' ? 'epic' : 'good');
}

export function giveAmmo(g: Game): void {
  const s = g.save;
  const has = (base: string): boolean => s.gear.some((x) => x.base === base);
  s.ammo.labels += 20;
  if (has('aircan')) s.ammo.air += 30;
  if (has('duck')) s.ammo.ducks += 2;
  if (has('toner')) s.ammo.toner += 20;
  sfx.pickup();
}

function addGear(g: Game, inst: GearInstance, from: string): void {
  g.save.gear.push(inst);
  g.hud.toast(`${from}: ${inst.name} (${RARITY_INFO[inst.rarity].name}).`, inst.rarity === 'legendary' ? 'epic' : 'good');
  if (inst.rarity === 'legendary') g.achieve('legendary');
  g.refreshDerived();
}

export function giveUnique(g: Game, id: string): void {
  g.save.flags[`unique_${id}`] = true;
  const inst = uniqueInstance(id, g.lootRng);
  if (inst !== null) addGear(g, inst, 'Legendary');
}

export function giveRandomGear(g: Game, rarity: 'fine' | 'rare'): void {
  addGear(g, rollGear(g.lootRng, g.floor, 0, rarity), 'Received');
}

// ================================================================== people

export function stealRep(g: Game, a: Actor, amount: number): number {
  const s = g.save;
  const take = Math.min(s.rep, amount);
  s.rep -= take;
  if (take > 0) {
    g.floatText(g.player.pos.clone().setY(2.2), `-₡${take}`, '#ff9a3a');
    g.hud.toast(`${a.name} has billed you ₡${take}. Resolve them to get it back.`, 'bad');
  }
  return take;
}

export function resolvePeacefully(g: Game, a: Actor, how: 'fix' | 'ticket' | 'scared' | 'charmed' | 'meeting' | 'bribe'): void {
  if (a.resolved) return;
  const s = g.save;
  a.resolved = true;
  a.calm = true;
  a.removeIn = 3;
  a.hpBar.visible = false;
  a.talked = true;
  const rep = how === 'fix' ? Math.round(a.rep * 0.9) : how === 'ticket' || how === 'bribe' ? Math.round(a.rep * 0.3) : 0;
  if (rep > 0) g.addRep(rep);
  if (a.stolen > 0) s.rep += a.stolen;
  if (a.spawnIndex >= 0 && s.location === 'office' && !s.floorState.resolved.includes(a.spawnIndex)) s.floorState.resolved.push(a.spawnIndex);
  s.stats.resolvedPeace++;
  if (how === 'fix' || how === 'charmed' || how === 'bribe') adjustStanding(s, 'staff', how === 'fix' ? 2 : 1);
  if (how !== 'ticket') s.queue = s.queue.filter((q) => q.from !== a.name);
  questProgress(g, 'peace');
  g.questEvent({ type: 'resolve', kind: a.kind, peaceful: true, elite: a.elite !== null, tag: a.questTag });
  if (s.stats.resolvedPeace >= 10) g.achieve('pacifist');
  if (rep > 0) g.floatText(a.pos.clone().setY(2.6), `+₡${rep}`, '#7dff9a');
  sfx.resolved();
}

/**
 * A talk-down gone wrong: they come at you, angrier. True if it started a
 * fight. Mid-induction (the floor asleep) it does not: a failed talk-down is
 * a failed conversation and nothing more, so a new starter cannot talk
 * themselves into the fight the induction is keeping off them.
 */
export function enrage(g: Game, a: Actor): boolean {
  a.talked = true;
  adjustStanding(g.save, 'staff', -1);
  if (!g.floorAwake) {
    say(a, 'Fine. Later.', 1.5);
    return false;
  }
  a.enragedT = 10;
  a.aggro = true;
  a.docile = false;
  say(a, 'RIGHT.', 1.5);
  return true;
}

export function recruitedHelper(g: Game): Actor | null {
  return g.actors.find((a) => a.kind === 'helper' && a.recruited && !a.resolved && a.role !== 'clone' && a.role !== 'spirit' && a.role !== 'dog' && a.npcId === null) ?? null;
}

export function dismiss(_g: Game, a: Actor): void {
  a.recruited = false;
  a.resolved = true;
  a.calm = true;
  a.removeIn = 3;
}

export function spawnHostile(g: Game, kind: 'user' | 'manager' | 'reply' | 'customer', n: number, name?: string): void {
  for (let i = 0; i < n; i++) {
    const a = g.spawn(kind, g.player.pos.x + fx.range(-3, 3), g.player.pos.z + fx.range(-3, 3), -1);
    if (a === null) continue;
    if (name !== undefined) {
      a.name = name;
      a.hp *= 2;
      a.maxHp *= 2;
    }
  }
}

// ================================================================== bosses

export function bossStart(g: Game, a: Actor): void {
  if (a.boss === null) return;
  g.hud.showCard(a.name.toUpperCase(), a.boss.title);
  sfx.sting();
  sfx.bossRoar();
  sfx.setBoss(true);
  g.tip('boss');
  g.markersIn = 0;
}

export function bossLeash(g: Game, a: Actor): void {
  sfx.setBoss(false);
  g.hud.toast(`${a.name} has gone back to their office. The fight is waiting for you there.`, 'info');
  g.markersIn = 0;
}

export function bossParley(g: Game, a: Actor): void {
  g.openDialogue(talkAuditor(g, a));
}

export function auditorParley(g: Game, outcome: 'ally' | 'fight'): void {
  const s = g.save;
  const a = g.boss;
  if (a === null || a.resolved) return;
  if (outcome === 'fight') {
    s.flags.auditorFought = true;
    a.docile = false;
    return;
  }
  // The audit ends on a handshake. Nobody has ever seen that before.
  s.flags.auditorAlly = true;
  s.flags.whistleblower = true;
  g.clearFindings();
  a.resolved = true;
  a.calm = true;
  a.removeIn = 4;
  a.hpBar.visible = false;
  s.stats.bosses++;
  s.floorState.bossDone = true;
  g.elevatorOpen = true;
  s.quests = s.quests.filter((q) => q.kind !== 'boss');
  g.addRep(Math.round(a.rep * 0.8));
  g.journal('I gave the Auditor the Phoenix file. The audit ended with a handshake and a red pen.');
  g.hud.toast('AUDIT RESOLVED WITHOUT A FIGHT. The lift is unlocked.', 'epic');
  g.achieve('auditor');
  const exit = g.level.interactables.find((i) => i.kind === 'elevator');
  exit?.mesh?.traverse((o) => {
    if (o.name === 'lamp' && o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(0x30ff60);
  });
  if (s.flags.unique_redPen !== true) {
    const pen = uniqueInstance('redPen', g.lootRng);
    if (pen !== null) dropGear(g, a.pos, pen);
  }
  g.questEvent({ type: 'boss', floor: g.floor });
}

export function bossDeal(g: Game, kind: 'nda' | 'mokki' | 'expose' | 'parachute'): void {
  const s = g.save;
  switch (kind) {
    case 'nda':
    case 'parachute': {
      if (s.flags.ceoDeal === true || s.flags.goldenParachute === true) return;
      if (kind === 'nda') {
        s.flags.ceoDeal = true;
        g.journal('I signed the NDA. The Company Man.');
      } else {
        s.flags.goldenParachute = true;
        s.rep += 2000;
        g.journal('I showed the PA the Phoenix file and named a number. Sir Reginald paid it without coming out of his office.');
      }
      const prev = g.afterDialogue;
      g.afterDialogue = () => {
        prev?.();
        g.finishStory();
      };
      return;
    }
    case 'expose':
      if (s.flags.exposed === true) return;
      s.flags.whistleblower = true;
      s.flags.exposed = true;
      g.journal('I told Sir Reginald\'s PA the Phoenix file is going to the regulator. He is not taking it well.');
      g.rescaleBoss();
      g.hud.toast('The file is sent. Sir Reginald is coming apart: he fights at 60%.', 'epic');
      return;
    case 'mokki':
      s.flags.mokkiDeal = true;
      s.rep += 500;
      g.rescaleBoss();
      g.journal('I negotiated the mökki money out of Sir Reginald before the fight. He is distracted, counting it.');
  }
}

/** Choices made on earlier floors come due here. */
export function consequencesOnArrival(g: Game, n: number): void {
  const s = g.save;
  const f = s.flags;
  // Recorded on the floor, so a reload cannot make the consequence go away.
  const near = (kind: 'reply' | 'customer' | 'jam' | 'vendor', count: number, name?: string): void => {
    for (let i = 0; i < count; i++) {
      const x = g.level.start.x + fx.range(-6, 6);
      const z = g.level.start.z + fx.range(3, 10);
      const idx = EXTRA_BASE + s.floorState.extras.length;
      s.floorState.extras.push(name === undefined ? { kind, x, z } : { kind, x, z, name });
      const a = g.spawnAt(kind, x, z, 0, false, { spawnIndex: idx });
      if (a !== null && name !== undefined) a.name = name;
    }
  };
  if (f.mfaSkipped === true && f.mfaFallout !== true && n >= 2) {
    f.mfaFallout = true;
    near('reply', 8);
    near('customer', 2);
    g.journal('The "CFO" I enrolled was a phisher. This floor woke up to a phishing wave, and two very angry clients.');
    g.hud.toast('CONSEQUENCE: the fake CFO\'s account is sending phishing mail to the whole building.', 'bad');
  }
  if (f.adminGiven === true && f.adminFallout !== true && n >= 3) {
    f.adminFallout = true;
    near('reply', 6);
    near('jam', 2);
    near('vendor', 2);
    g.journal('Tristan\'s "free screensaver" was malware. Sales printers are possessed, every inbox is on fire, and the vendor who sold it wants a renewal.');
    g.hud.toast('CONSEQUENCE: Tristan\'s screensaver was malware. The printers are possessed.', 'bad');
  }
  if (f.reportedMarcus === true && f.marcusRevenge !== true && n >= 1) {
    f.marcusRevenge = true;
    near('customer', 1, 'Marcus (holding a grudge)');
    g.hud.toast('Marcus has not forgotten that you reported him.', 'bad');
  }
  if (f.caughtPhish === true && f.phishThanks !== true && n >= 2) {
    f.phishThanks = true;
    giveItem(g, 'monster', 2, 'The CFO\'s office');
    g.addRep(60);
    g.journal('The real CFO sent a thank-you hamper for catching the phisher.');
  }
}

// ================================================================== rest

function canRest(g: Game): string | null {
  const s = g.save;
  if (s.location === 'mokki') return 'At the mökki you sleep in the cottage (the red door).';
  if (CAFFEINE_EFFECTS[caffeineBand(s.caffeine, s.caffeineTol)].noRest && !g.derivedCache.ultra) return 'You are far too wired to sleep. Your eyelids are vibrating.';
  const pp = g.player.pos;
  if (g.actors.some((a) => a.hostile && !a.resolved && a.aggro && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 25)) return 'You cannot rest with people after you.';
  if (g.boss?.bossActive === true && !g.boss.resolved) return 'Not during a major incident.';
  return null;
}

export function tryRest(g: Game): void {
  const why = canRest(g);
  if (why !== null) {
    sfx.error();
    g.hud.toast(why, 'bad');
    return;
  }
  rest(g, false);
}

export function rest(g: Game, safe: boolean): void {
  const s = g.save;
  const d = g.derivedCache;
  sfx.snore();
  s.sanity = safe ? d.maxSanity : Math.min(d.maxSanity, s.sanity + d.maxSanity * 0.5);
  s.energy = 100;
  const loylyBefore = s.loyly;
  const loylyGain = safe ? d.maxLoyly : d.maxLoyly * 0.5;
  s.loyly = Math.min(d.maxLoyly, s.loyly + loylyGain);
  s.bac = Math.max(0, s.bac - (safe ? 100 : 35));
  s.stomach = 0;
  s.caffeine *= safe ? 0.1 : 0.5;
  s.crash = 0;
  if (safe) {
    s.hangover = 0;
    g.hud.toast('You sleep like a log, to the sound of the lake.', 'good');
  } else {
    // An hour under the desk: the queue does not sleep.
    for (const q of s.queue) q.sla -= 60;
    g.hud.toast('You nap under a desk for an hour. The SLA clocks did not.', 'info');
    g.tip('rest');
    if (fx.chance(0.25)) {
      const ang = fx.range(0, Math.PI * 2);
      const m = g.spawn('manager', g.player.pos.x + Math.sin(ang) * 3, g.player.pos.z + Math.cos(ang) * 3, -1);
      if (m !== null) {
        say(m, 'Are you ASLEEP? Under a DESK?', 3);
        adjustStanding(s, 'management', -4);
        g.hud.toast('Found napping! (Management -4)', 'bad');
      }
    }
  }
  g.refreshDerived();
  // Asked before any level-up talk opens; a vision it earns waits for play to resume.
  g.steamOverflow('rest', loylyBefore, loylyGain);
  if (levelUpReady(s)) g.openDialogue(levelUpNode(g));
}

// ================================================================== the backpack

export function quickUse(g: Game): void {
  const s = g.save;
  const d = g.derivedCache;
  const heal = ['biscuits', 'potatoes', 'fish-muikku', 'fish-ahven', 'cake', 'makkara', 'pipeline'];
  const wake = ['coffee', 'espresso', 'euroshopper', 'redbull', 'battery', 'batteryzero', 'monster', 'energy'];
  const order = s.sanity < d.maxSanity * 0.6 ? heal : s.actionItems > 0 ? ['postit', ...heal] : s.energy < 50 ? wake : [...heal, ...wake];
  for (const id of order) {
    if ((s.consumables[id] ?? 0) > 0) {
      use(g, id);
      return;
    }
  }
  sfx.error();
  g.hud.toast('Nothing quick in your pockets. (Drinks and the White Monster are never quick-used: choose them in the backpack.)');
}

export function use(g: Game, id: string): void {
  const s = g.save;
  const c = CONSUMABLES.find((x) => x.id === id);
  if (c === undefined || (s.consumables[id] ?? 0) <= 0) return;
  const consume = (): void => {
    s.consumables[id] = (s.consumables[id] ?? 1) - 1;
    if ((s.consumables[id] ?? 0) <= 0) delete s.consumables[id];
  };
  if (c.rune !== undefined) {
    if (s.spells.includes(c.rune)) {
      g.hud.toast('You already know this rune.');
      return;
    }
    consume();
    g.learnSpell(c.rune);
    g.refreshDerived();
    return;
  }
  if (c.book !== undefined) {
    consume();
    const b = bookById(id);
    if (!s.booksRead.includes(id)) s.booksRead.push(id);
    g.hud.toast(`You read "${b?.title ?? c.name}". ${b?.blurb ?? ''}`, 'good');
    g.bumpSkill(b?.skill ?? 'troubleshooting');
    g.refreshDerived();
    if (levelUpReady(s)) g.hud.toast('Rest to level up.', 'epic');
    return;
  }
  if (id === 'paperclip') {
    g.hud.toast('Paperclips are for supply-closet locks. Walk up to one and press E.');
    return;
  }
  if (id === 'laptop') {
    g.hud.toast('That laptop is for somebody else. Take it to them.');
    return;
  }
  consume();
  if (id === 'fish-boot') {
    s.rep += 5;
    g.hud.toast('The scrapyard gives you ₡5 for the boot. Nobody asks.', 'info');
    g.refreshDerived();
    return;
  }
  if (c.heal !== undefined) {
    if (c.heal > 0) healPlayer(g, c.heal, '');
    else s.sanity = Math.max(1, s.sanity + c.heal);
  }
  if (c.energy !== undefined) s.energy = Math.min(100, s.energy + c.energy);
  const loylyBefore = s.loyly;
  if (c.loyly !== undefined) s.loyly = Math.min(g.derivedCache.maxLoyly, s.loyly + c.loyly);
  if (LINING_FOODS.includes(id)) s.buffs.lined = Math.max(s.buffs.lined ?? 0, 90);
  if (c.buff === 'makkara') s.makkara = true;
  if (c.buff === 'hauki') s.hauki = true;
  if (c.clearsActionItem === true && s.actionItems > 0) s.actionItems--;
  if (c.mg !== undefined) caffeinate(g, c);
  if (c.bac !== undefined) drink(g, c);
  if (c.mg === undefined && c.bac === undefined) {
    sfx.pickup();
    g.hud.toast(`Used ${c.name}.`);
  } else if (c.bac === undefined && c.buff !== 'ultra') {
    sfx.glug();
    g.hud.toast(`${c.name}. ${Math.round(s.caffeine)} mg in the system.`, 'info');
    g.tip('caffeine');
  }
  g.refreshDerived();
  // A Salmari is the only thing in a pocket that gives Löyly.
  if (id === 'salmari' && c.loyly !== undefined) g.steamOverflow('salmari', loylyBefore, c.loyly);
}

export function takePerk(g: Game, id: string): void {
  const s = g.save;
  if (!canTakePerk(s, id)) return;
  s.perks[id] = (s.perks[id] ?? 0) + 1;
  s.perkPoints--;
  sfx.levelUp();
  g.hud.toast(`Perk: ${treePerk(id)?.name ?? id} (rank ${s.perks[id]}).`, 'epic');
  g.fixCache = new WeakMap();
  g.refreshDerived();
}

// ================================================================== Internal IT

export function price(g: Game, base: number): number {
  const s = g.save;
  const m = 1 - s.standing.itcrowd / 300 - (s.attrs.charm - 35) / 400;
  return Math.max(1, Math.round(base * Math.max(0.6, Math.min(1.4, m)) * g.derivedCache.priceMult));
}

export function buy(g: Game, id: string): string | null {
  const s = g.save;
  const item = ALL_ITEMS.find((i) => i.id === id);
  if (item === undefined) return 'Unknown item.';
  if (item.slot === 'consumable' && item.unsold === true) return 'Internal IT does not stock that.';
  if (item.minFloor > s.floor) return 'Your clearance does not cover that yet.';
  const cost = price(g, item.price);
  if (s.rep < cost) return `Requisition denied: needs ₡${cost}, you have ₡${s.rep}.`;
  s.rep -= cost;
  adjustStanding(s, 'itcrowd', 0.5);
  switch (item.slot) {
    case 'weapon': {
      const inst = plainInstance(id, g.lootRng);
      s.gear.push(inst);
      s.equipped.weapon = inst.uid;
      if (item.ammo !== undefined && s.ammo[item.ammo] === 0) s.ammo[item.ammo] += AMMO.find((a) => a.ammo === item.ammo)?.amount ?? 20;
      break;
    }
    case 'head':
    case 'body':
    case 'feet':
    case 'trinket': {
      const inst = plainInstance(id, g.lootRng);
      s.gear.push(inst);
      if (s.equipped[item.slot] === null) s.equipped[item.slot] = inst.uid;
      break;
    }
    case 'consumable':
      s.consumables[id] = (s.consumables[id] ?? 0) + 1;
      break;
    case 'ammo':
      s.ammo[item.ammo] += item.amount;
      break;
  }
  g.refreshDerived();
  return null;
}

export function sell(g: Game, uid: string): string | null {
  const s = g.save;
  const inst = s.gear.find((x) => x.uid === uid);
  if (inst === undefined) return 'You do not have that.';
  if (Object.values(s.equipped).includes(uid)) return 'Unequip it first.';
  const v = sellValue(inst);
  s.gear = s.gear.filter((x) => x.uid !== uid);
  s.rep += v;
  adjustStanding(s, 'itcrowd', 0.2);
  g.refreshDerived();
  sfx.coin();
  return null;
}

export function equipGear(g: Game, uid: string): void {
  const s = g.save;
  const inst = s.gear.find((x) => x.uid === uid);
  if (inst === undefined) return;
  const slot = slotOf(inst);
  if (slot === null) return;
  s.equipped[slot] = uid;
  g.refreshDerived();
  g.attackCd = Math.max(g.attackCd, 0.15);
  g.charging = false;
  if (g.derivedCache.specials.has('ceoCrown')) {
    for (const a of g.actors) if (a.kind === 'manager' && !a.aggro) a.docile = true;
  }
}

export function unequip(g: Game, slot: 'head' | 'body' | 'feet' | 'trinket'): void {
  g.save.equipped[slot] = null;
  g.refreshDerived();
}

export function slackOff(g: Game): string {
  if (g.currentTerminal === null) return 'You cannot look at cats from your backpack.';
  g.slackedTerminals.add(g.currentTerminal.id);
  healPlayer(g, 30, '');
  if (g.save.location === 'office' && fx.chance(0.35 - g.stealth * 0.2)) {
    g.caughtPending = true;
    return 'Ahh. That is better. (+30 sanity) ...was that footsteps behind you?';
  }
  return 'Ahh. That is better. (+30 sanity). Nobody saw. Probably.';
}
