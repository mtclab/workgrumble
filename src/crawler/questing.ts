import { sfx } from './audio';
import { placeQuestPickup } from './combat';
import type { CompassMarker } from './compass';
import { type Actor, say, setMarker } from './entities';
import type { Game } from './game';
import { freeSpotIn, type Room } from './level';
import {
  advance,
  currentObjective,
  EVIDENCE,
  mainChapter,
  type Placement,
  QUEST_ITEMS,
  type QuestEvent,
  questById,
  sideQuestsFor,
} from './quests';
import { adjustStanding } from './state';

/**
 * Puts the journal quests into the building: evidence for Project Phoenix,
 * side-quest givers with their "!" and "?", the things they want found, and
 * the markers on the compass and the map.
 */

/** Which quest a giver standing on this floor hands out. */
const giverOf = new WeakMap<Actor, string>();

export function questOf(a: Actor): string | undefined {
  return giverOf.get(a);
}

export function evidenceHeld(g: Game): number {
  return EVIDENCE.filter((e) => g.save.questItems.includes(e)).length;
}

function roomsOfKind(g: Game, kind: string): Room[] {
  return g.level.rooms.filter((r) => r.kind === kind && r.id !== 0);
}

/** Put a quest item into the world, where the placement says. */
function placeItem(g: Game, item: string, place: Placement): void {
  const s = g.save;
  if (s.questItems.includes(item) || s.floorState.picked.includes(item)) return;
  if ([...g.lockerItems.values()].includes(item) || g.pickups.some((p) => p.kind === 'quest' && p.id === item)) return;
  if ('locker' in place) {
    const lockers = g.level.interactables.filter((it) => it.kind === 'locker' && !it.used && !g.lockerItems.has(it.id));
    const it = lockers.length > 0 ? g.levelRng.pick(lockers) : undefined;
    if (it !== undefined) {
      it.lock = Math.min(95, Math.max(it.lock, place.locker));
      g.lockerItems.set(it.id, item);
      return;
    }
  }
  const want = 'room' in place ? roomsOfKind(g, place.room) : [];
  const pool = want.length > 0 ? want : g.level.rooms.filter((r) => r.id !== 0 && r.kind !== 'boss');
  for (let t = 0; t < 6 && pool.length > 0; t++) {
    const rm = g.levelRng.pick(pool);
    const spot = freeSpotIn(g.level, rm, g.levelRng);
    if (spot !== null) {
      placeQuestPickup(g, spot.x, spot.z, item);
      return;
    }
  }
}

function spawnGiver(g: Game, questId: string): Actor | null {
  const def = questById(questId);
  if (def === undefined) return null;
  const s = g.save;
  const st = s.questLog.find((q) => q.id === questId);
  // Josh starts at the lift, lost. Everyone else waits somewhere sensible.
  if (def.npc === 'josh') {
    const a = g.spawnAt('helper', g.level.start.x + 2, g.level.start.z + 2, 0, false, { role: 'intern', npc: { id: 'josh', name: 'Josh (Intern, first day)' } });
    if (a !== null) {
      giverOf.set(a, questId);
      if (st !== undefined && !st.done) a.recruited = true;
    }
    return a;
  }
  const rooms = g.level.rooms.filter((r) => r.id !== 0 && r.kind !== 'boss' && r.kind !== 'sauna');
  for (let t = 0; t < 8 && rooms.length > 0; t++) {
    const rm = g.levelRng.pick(rooms);
    const spot = freeSpotIn(g.level, rm, g.levelRng);
    if (spot === null) continue;
    const a = g.spawnAt('npc', spot.x, spot.z, rm.id, false, { npc: { id: def.npc, name: def.giver } });
    if (a !== null) giverOf.set(a, questId);
    return a;
  }
  return null;
}

/** Called on every floor load. */
export function placeQuestContent(g: Game): void {
  const s = g.save;
  const f = g.floor;
  // Main story evidence on this floor.
  const ch = mainChapter(f);
  if (ch?.evidence !== undefined) placeItem(g, ch.evidence.item, ch.evidence.place);
  // Active side quests follow you from floor to floor.
  for (const st of s.questLog) {
    if (st.done) continue;
    const obj = currentObjective(st);
    if (obj?.kind === 'item' && obj.item !== undefined && obj.place !== undefined) placeItem(g, obj.item, obj.place);
    spawnGiver(g, st.id);
  }
  // New offers: up to two per floor.
  const offers = sideQuestsFor(f).filter((q) => !s.questLog.some((st) => st.id === q.id));
  for (const q of g.levelRng.shuffle(offers).slice(0, 2)) spawnGiver(g, q.id);
  refreshGiverMarkers(g);
}

export function refreshGiverMarkers(g: Game): void {
  for (const a of g.actors) {
    const id = giverOf.get(a);
    if (id === undefined || a.resolved) continue;
    const st = g.save.questLog.find((q) => q.id === id);
    const def = questById(id);
    if (st === undefined) setMarker(a, '!', '#ffd54a');
    else if (st.done) setMarker(a, null);
    else {
      const obj = currentObjective(st);
      setMarker(a, obj?.kind === 'talk' && obj.npc === def?.npc ? '?' : null, '#ffd54a');
    }
  }
}

export function acceptQuest(g: Game, id: string): void {
  const s = g.save;
  if (s.questLog.some((q) => q.id === id)) return;
  const def = questById(id);
  if (def === undefined) return;
  s.questLog.push({ id, stage: 0, progress: 0, done: false, floor: g.floor });
  sfx.chime();
  g.hud.toast(`New quest: ${def.title}. (Journal: J)`, 'epic');
  g.journal(`Quest taken: ${def.title}, for ${def.giver}.`);
  const st = s.questLog[s.questLog.length - 1];
  const obj = st === undefined ? undefined : currentObjective(st);
  if (obj?.kind === 'item' && obj.item !== undefined && obj.place !== undefined) placeItem(g, obj.item, obj.place);
  if (obj?.kind === 'escort') recruitIntern(g);
  refreshGiverMarkers(g);
  g.tip('quest');
  g.markersIn = 0;
}

export function recruitIntern(g: Game): void {
  const josh = g.actors.find((a) => a.npcId === 'josh' && !a.resolved);
  if (josh !== undefined) {
    josh.recruited = true;
    say(josh, 'Lead on! I am right behind you!', 3);
  }
}

export function turnHostile(g: Game, npc: string, name: string): void {
  const a = g.actors.find((x) => x.npcId === npc && !x.resolved);
  if (a === undefined) return;
  a.resolved = true;
  a.calm = true;
  a.removeIn = 0.5;
  const h = g.spawnAt('user', a.pos.x, a.pos.z, a.room, true, { elite: 'escalating' });
  if (h !== null) {
    h.name = name;
    h.talked = true;
    say(h, 'I could set the building on fire.', 3, '#fff', 'rgba(140,20,0,0.92)');
  }
}

/** Anything that happened, offered to every quest in the journal. */
export function questEvent(g: Game, e: QuestEvent): void {
  const s = g.save;
  if (e.type === 'room') {
    // Cheap early out: this is called every frame you stand in a room.
    const wants = s.questLog.some((st) => !st.done && (currentObjective(st)?.kind === 'room' || currentObjective(st)?.kind === 'escort'));
    if (!wants) return;
    if (currentObjectiveIsEscort(g) && !joshNearby(g)) return;
  }
  let any = false;
  for (const st of s.questLog) {
    const before = st.progress;
    const moved = advance(st, e, g.floor);
    const def = questById(st.id);
    if (def === undefined) continue;
    if (!moved) {
      const obj = currentObjective(st);
      if (st.progress > before && obj?.count !== undefined) g.hud.toast(`${def.title}: ${st.progress}/${obj.count}`, 'info');
      continue;
    }
    any = true;
    sfx.coin();
    if (st.done) {
      g.hud.toast(`Quest complete: ${def.title}`, 'epic');
      g.journal(`Quest done: ${def.title}.`);
      // Quests that end on arriving somewhere pay out here; the rest pay at the turn-in.
      if (st.id === 'intern') {
        g.addRep(70);
        adjustStanding(s, 'staff', 4);
        adjustStanding(s, 'itcrowd', 3);
        const josh = g.actors.find((a) => a.npcId === 'josh' && !a.resolved);
        if (josh !== undefined) {
          josh.recruited = false;
          say(josh, 'This is it! Internal IT! Thank you! I will never forget this! What was your name again?', 4);
        }
      }
    } else {
      const obj = currentObjective(st);
      g.hud.toast(`${def.title}: ${obj?.text ?? 'next step'}`, 'good');
    }
  }
  if (e.type === 'pickup') {
    // Picked up somewhere else: the closet that was hiding a copy of it is just a closet now.
    for (const [id, item] of g.lockerItems) if (item === e.item) g.lockerItems.delete(id);
    const info = QUEST_ITEMS[e.item];
    if (info !== undefined) {
      g.hud.toast(`Found: ${info.name}`, 'epic');
      if ((EVIDENCE as readonly string[]).includes(e.item)) {
        g.journal(`Evidence: ${info.name}. ${info.desc}`);
        if (evidenceHeld(g) >= 3) g.achieve('evidence');
      }
    }
    any = true;
  }
  if (any) {
    refreshGiverMarkers(g);
    g.markersIn = 0;
  }
}

function currentObjectiveIsEscort(g: Game): boolean {
  return g.save.questLog.some((st) => !st.done && currentObjective(st)?.kind === 'escort');
}

function joshNearby(g: Game): boolean {
  const josh = g.actors.find((a) => a.npcId === 'josh' && !a.resolved);
  return josh !== undefined && Math.hypot(josh.pos.x - g.player.pos.x, josh.pos.z - g.player.pos.z) < 6;
}

// ================================================================== what the HUD shows

export function questLines(g: Game): string[] {
  const s = g.save;
  const out: string[] = [];
  if (s.location === 'office') {
    const ch = mainChapter(g.floor);
    if (ch !== undefined && !s.won) {
      const ev = ch.evidence;
      if (ev !== undefined && !s.questItems.includes(ev.item)) out.push(`◆ Phoenix: ${ev.hint}`);
    }
    for (const st of s.questLog) {
      if (st.done) continue;
      const def = questById(st.id);
      const obj = currentObjective(st);
      if (def === undefined || obj === undefined) continue;
      const count = obj.count !== undefined ? ` (${st.progress}/${obj.count})` : '';
      out.push(`◆ ${def.title}${count}`);
    }
  }
  for (const q of s.quests) out.push(`${q.done ? '✔' : '•'} ${q.title}${q.goal > 1 ? ` (${Math.min(q.progress, q.goal)}/${q.goal})` : ''}`);
  return out.slice(0, 7);
}

export function questMarkers(g: Game): CompassMarker[] {
  const s = g.save;
  const out: CompassMarker[] = [];
  const gold = '#ffd54a';
  for (const p of g.pickups) {
    if (p.kind === 'quest') out.push({ x: p.mesh.position.x, z: p.mesh.position.z, icon: '◆', color: gold, label: QUEST_ITEMS[p.id]?.name ?? 'Quest item' });
  }
  for (const [id, item] of g.lockerItems) {
    const it = g.level.interactables.find((x) => x.id === id);
    if (it !== undefined && !it.used) out.push({ x: it.x, z: it.z, icon: '◆', color: gold, label: `${QUEST_ITEMS[item]?.name ?? 'Quest item'} (locked)` });
  }
  for (const a of g.actors) {
    if (a.resolved) continue;
    const id = giverOf.get(a);
    if (id !== undefined) {
      const st = s.questLog.find((q) => q.id === id);
      const obj = st === undefined ? undefined : currentObjective(st);
      if (st === undefined) out.push({ x: a.pos.x, z: a.pos.z, icon: '!', color: gold, label: a.name });
      else if (!st.done && obj?.kind === 'talk') out.push({ x: a.pos.x, z: a.pos.z, icon: '?', color: gold, label: a.name });
    } else if (a.kind === 'npc' && !a.talked) {
      out.push({ x: a.pos.x, z: a.pos.z, icon: '!', color: '#ffe07a', label: a.name });
    }
  }
  // Escort: the IT counter.
  if (currentObjectiveIsEscort(g)) {
    const desk = g.level.interactables.find((i) => i.kind === 'itdesk');
    if (desk !== undefined) out.push({ x: desk.x, z: desk.z, icon: '◆', color: gold, label: 'Internal IT (Josh)' });
  }
  const lift = g.level.interactables.find((i) => i.kind === 'elevator');
  if (lift !== undefined && g.elevatorOpen) out.push({ x: lift.x, z: lift.z, icon: '▲', color: '#ffffff', label: 'The lift (Friday!)' });
  if (g.boss !== null && g.boss.bossActive && !g.boss.resolved) out.push({ x: g.boss.pos.x, z: g.boss.pos.z, icon: '☠', color: '#ff5050', label: g.boss.name });
  if (s.location === 'mokki') {
    const board = g.level.interactables.find((i) => i.kind === 'board');
    if (board !== undefined) out.push({ x: board.x, z: board.z, icon: '⌂', color: '#7dffea', label: 'Upgrade board' });
    const car = g.level.interactables.find((i) => i.kind === 'car');
    if (car !== undefined) out.push({ x: car.x, z: car.z, icon: '▲', color: '#ffffff', label: 'The car (Monday)' });
  }
  return out;
}
