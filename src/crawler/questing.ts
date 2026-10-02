import { sfx } from './audio';
import { placeQuestPickup } from './combat';
import type { CompassMarker } from './compass';
import { type DialogueNode, type DialogueOption, said } from './dialogue';
import { type Actor, say, setMarker } from './entities';
import type { Game } from './game';
import { p1Resolved } from './hub';
import { freeSpotIn, type Room } from './level';
import {
  advance,
  currentObjective,
  EVIDENCE,
  type HuntTarget,
  isActive,
  mainChapter,
  type Objective,
  type Placement,
  type QuestDef,
  QUEST_ITEMS,
  type QuestEvent,
  questById,
  type QuestState,
  sideQuestsFor,
  STAFFED,
  STAFFERS,
  TRANSIENT_ITEMS,
  withName,
} from './quests';
import { fx } from './rng';
import { canDelegate } from './team';
import { menteeNearby, mentorMarkers, mentorSuffix, mentoringDone, settleMentoring, teamLines } from './teamwork';
import { pagerMarkers } from './pager';
import { checkChance } from './rpg';
import { adjustStanding, perk, skill, workload } from './state';

/**
 * Puts the journal quests into the building: evidence for Project Phoenix,
 * side-quest givers with their "!" and "?", the things they want found or
 * dealt with, and the markers on the compass and the map. And staffing: the
 * work that is handed to you whether you asked for it or not.
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

function randomSpot(g: Game, place: Placement | { readonly room?: string } | undefined): { x: number; z: number; room: number } | null {
  const want = place !== undefined && 'room' in place && place.room !== undefined ? roomsOfKind(g, place.room) : [];
  const pool = want.length > 0 ? want : g.level.rooms.filter((r) => r.id !== 0 && r.kind !== 'boss');
  for (let t = 0; t < 8 && pool.length > 0; t++) {
    const rm = g.levelRng.pick(pool);
    const spot = freeSpotIn(g.level, rm, g.levelRng);
    // Not right on top of you.
    if (spot !== null && Math.hypot(spot.x - g.player.pos.x, spot.z - g.player.pos.z) > 6) return { x: spot.x, z: spot.z, room: rm.id };
  }
  return null;
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
  const spot = randomSpot(g, place);
  if (spot !== null) placeQuestPickup(g, spot.x, spot.z, item);
}

/** Several copies of a thing to collect (compliance forms). */
function placeCopies(g: Game, item: string, n: number, place: Placement | undefined): void {
  const lying = g.pickups.filter((p) => p.kind === 'quest' && p.id === item).length;
  for (let i = lying; i < n; i++) {
    const spot = randomSpot(g, place);
    if (spot !== null) placeQuestPickup(g, spot.x + fx.range(-0.4, 0.4), spot.z + fx.range(-0.4, 0.4), item);
  }
}

/** Somebody the quest needs dealt with. Tagged, so resolving them counts. */
function spawnHunt(g: Game, st: QuestState, target: HuntTarget): void {
  if (g.actors.some((a) => a.questTag === st.id && !a.resolved)) return;
  const spot = randomSpot(g, target.room === undefined ? undefined : { room: target.room });
  if (spot === null) return;
  const a = g.spawnAt(target.kind, spot.x, spot.z, spot.room, false, { elite: target.elite ?? null });
  if (a === null) return;
  a.name = target.name;
  a.questTag = st.id;
  a.docile = false;
  setMarker(a, '☠', '#ffd54a');
}

/** Make sure there are enough of a kind on the floor for a staffed count. */
function ensureKind(g: Game, obj: Objective, st: QuestState): void {
  if (obj.ensure === undefined) return;
  // On the hub only the Kitchen Cabinet can be sent for: the trouble a count wants is on the P1 floor.
  if (g.save.location === 'hub' && obj.ensure.kind !== 'healer') return;
  const need = (obj.count ?? 1) - st.progress;
  // An office lady who has already signed cannot sign twice.
  const have = g.actors.filter((a) => a.kind === obj.ensure?.kind && !a.resolved && a.memo.questTalk !== true).length;
  for (let i = have; i < need; i++) {
    const spot = randomSpot(g, undefined);
    if (spot !== null) g.spawnAt(obj.ensure.kind, spot.x, spot.z, spot.room, false);
  }
}

/** Whatever a stage needs in the world when it becomes the current one. */
export function startStage(g: Game, st: QuestState): void {
  if (g.mission || g.save.location === 'mokki' || !isActive(st)) return;
  const obj = currentObjective(st);
  if (obj === undefined) return;
  if (obj.kind === 'item' && obj.item !== undefined && obj.place !== undefined) placeItem(g, obj.item, obj.place);
  if (obj.kind === 'collect' && obj.item !== undefined) placeCopies(g, obj.item, (obj.count ?? 1) - st.progress, obj.place);
  // A hunt's target waits on the P1 floor: nobody on the hub is after you without a reason of yours.
  if (obj.kind === 'hunt' && obj.hunt !== undefined && g.save.location === 'office') spawnHunt(g, st, obj.hunt);
  if (obj.kind === 'count') ensureKind(g, obj, st);
  if (obj.kind === 'escort') recruitIntern(g);
}

function spawnGiver(g: Game, questId: string): Actor | null {
  const def = questById(questId);
  if (def === undefined || def.staffed === true || def.mentor === true) return null;
  const s = g.save;
  const st = s.questLog.find((q) => q.id === questId);
  const existing = g.actors.find((a) => !a.resolved && a.npcId === def.npc);
  if (existing !== undefined) {
    giverOf.set(existing, questId);
    return existing;
  }
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
  if (g.mission) return;
  const s = g.save;
  const f = g.floor;
  // Main story evidence on this floor (the P1's; the hub is not where the story hides it).
  const ch = mainChapter(f);
  if (ch?.evidence !== undefined && s.location === 'office') placeItem(g, ch.evidence.item, ch.evidence.place);
  // Active quests follow you from floor to floor; so do their givers.
  for (const st of s.questLog) {
    if (!isActive(st)) continue;
    startStage(g, st);
    if (st.staffed !== true) spawnGiver(g, st.id);
  }
  // New offers: up to three per floor.
  const offers = sideQuestsFor(f, s.floorState.bossDone).filter((q) => !s.questLog.some((st) => st.id === q.id));
  for (const q of g.levelRng.shuffle(offers).slice(0, 3)) spawnGiver(g, q.id);
  refreshGiverMarkers(g);
}

export function refreshGiverMarkers(g: Game): void {
  for (const a of g.actors) {
    const id = giverOf.get(a);
    if (id === undefined || a.resolved) continue;
    const st = g.save.questLog.find((q) => q.id === id);
    const def = questById(id);
    if (st === undefined) setMarker(a, '!', '#ffd54a');
    else if (!isActive(st)) setMarker(a, null);
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
  const overBefore = workload(s).over;
  s.questLog.push({ id, stage: 0, progress: 0, done: false, floor: g.floor });
  sfx.chime();
  g.hud.toast(`New quest: ${def.title}. (Journal: J)`, 'epic');
  g.journal(`Quest taken: ${def.title}, for ${def.giver}.`);
  const st = s.questLog[s.questLog.length - 1];
  if (st !== undefined) startStage(g, st);
  refreshGiverMarkers(g);
  g.tip('quest');
  g.markersIn = 0;
  g.refreshDerived();
  if (workload(s).over > overBefore) g.hud.toast(`That puts you over capacity (${workload(s).active}/${workload(s).capacity}).`, 'bad');
}

export function recruitIntern(g: Game): void {
  const josh = g.actors.find((a) => a.npcId === 'josh' && !a.resolved);
  if (josh !== undefined && !josh.recruited) {
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
  // On the hub the new enemy is announced, like anyone there who turns.
  if (g.hub !== null) {
    g.hub.arrive('user', a.pos.x, a.pos.z, name, 'I could set the building on fire.');
    return;
  }
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
    const wants = s.questLog.some((st) => isActive(st) && (currentObjective(st)?.kind === 'room' || currentObjective(st)?.kind === 'escort'));
    if (!wants) return;
  }
  let any = false;
  for (const st of s.questLog) {
    // An escort only counts with the person you are escorting beside you.
    if (e.type === 'room' && currentObjective(st)?.kind === 'escort' && !joshNearby(g)) continue;
    // Mentoring only counts with the person you are mentoring there to see it.
    if (currentObjective(st)?.withMentee === true && !menteeNearby(g, st)) continue;
    const before = st.progress;
    const moved = advance(st, e, g.floor);
    const def = questById(st.id);
    if (def === undefined) continue;
    if (!moved) {
      const obj = currentObjective(st);
      if (st.progress > before && obj?.count !== undefined) g.hud.toast(`${st.staffed === true ? '📌 ' : st.mentor === true ? '🎓 ' : ''}${def.title}: ${st.progress}/${obj.count}`, 'info');
      continue;
    }
    any = true;
    sfx.coin();
    if (st.done) {
      completed(g, st, def);
    } else {
      const obj = currentObjective(st);
      g.hud.toast(`${def.title}: ${obj === undefined ? 'next step' : withName(obj.text, st)}`, 'good');
      startStage(g, st);
    }
  }
  if (e.type === 'pickup') {
    // Picked up somewhere else: the closet that was hiding a copy of it is just a closet now.
    for (const [id, item] of g.lockerItems) if (item === e.item) g.lockerItems.delete(id);
    const info = QUEST_ITEMS[e.item];
    if (info !== undefined && !TRANSIENT_ITEMS.includes(e.item)) {
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
    g.refreshDerived();
  }
}

function completed(g: Game, st: QuestState, def: QuestDef): void {
  const s = g.save;
  if (st.mentor === true) {
    mentoringDone(g, st, def);
    return;
  }
  if (st.staffed === true) {
    delete st.deadline;
    const rep = Math.round((60 + g.floor * 20) * (def.timeLimit !== undefined ? 1.6 : 1));
    g.addRep(rep);
    adjustStanding(s, 'management', 4);
    s.stats.staffedDone++;
    g.hud.toast(`📌 DELIVERED: ${def.title} (for ${st.by ?? 'management'}). Management +4.`, 'epic');
    g.journal(`Delivered "${def.title}" for ${st.by ?? 'management'}.`);
    if (s.stats.staffedDone >= 5) g.achieve('delivered');
    return;
  }
  g.hud.toast(`Quest complete: ${def.title}`, 'epic');
  g.journal(`Quest done: ${def.title}.`);
  if (s.questLog.filter((q) => q.done && q.staffed !== true && q.mentor !== true).length >= 8) g.achieve('questfan');
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
}

/** A drink with Sanna's bet still on: the bet is off. */
export function drankOnDuty(g: Game): void {
  const s = g.save;
  const bet = s.questLog.find((q) => q.id === 'dryweek' && isActive(q));
  if (bet === undefined) return;
  bet.failed = true;
  g.hud.toast('Dry Week: FAILED. Sanna will know. Sanna always knows.', 'bad');
  g.journal('I had a drink on Sanna\'s dry week. Jukka wins the bet.');
  refreshGiverMarkers(g);
  g.refreshDerived();
}

function joshNearby(g: Game): boolean {
  const josh = g.actors.find((a) => a.npcId === 'josh' && !a.resolved);
  return josh !== undefined && Math.hypot(josh.pos.x - g.player.pos.x, josh.pos.z - g.player.pos.z) < 6;
}

function currentObjectiveIsEscort(g: Game): boolean {
  return g.save.questLog.some((st) => isActive(st) && currentObjective(st)?.kind === 'escort');
}

// ================================================================== staffing

/** Templates that make sense on this floor, not already on your plate. */
function staffable(g: Game): QuestDef[] {
  const s = g.save;
  const minFloor: Record<string, number> = { 's-chatbot': 1, 's-vendor': 2, 's-consultant': 2, 's-shadow': 3 };
  return STAFFED.filter((d) => {
    if (s.questLog.some((st) => st.id === d.id && (isActive(st) || st.floor === g.floor))) return false;
    if ((minFloor[d.id] ?? 0) > g.floor) return false;
    if (d.needs === 'printer' && !g.level.interactables.some((i) => i.kind === 'printer' && !i.used)) return false;
    if (d.id === 's-dr' && roomsOfKind(g, 'server').length === 0) return false;
    return true;
  });
}

function staffedThisFloor(g: Game): number {
  return g.save.questLog.filter((st) => st.staffed === true && st.floor === g.floor).length;
}

/** The staffing clock: set when a floor starts, ticks while you work. */
export function scheduleStaffing(g: Game, first: boolean): void {
  const rung = g.save.rung;
  g.staffIn = first ? fx.range(25, 55) : fx.range(140, 240) * (1 - Math.min(0.3, rung * 0.02));
  g.staffFirst = first;
}

/** Is the week's major incident dealt with? Upstairs, its boss; on the hub, the P1's floor state. */
export function incidentResolved(g: Game): boolean {
  if (g.save.location === 'hub') return p1Resolved(g.save);
  return g.save.floorState.bossDone || g.boss === null || g.boss.resolved;
}

export function tickQuests(g: Game, dt: number): void {
  const s = g.save;
  if (s.location === 'mokki') return;
  if (g.screen !== 'play' && g.screen !== 'os') return;
  for (const st of s.questLog) {
    if (st.deadline === undefined || !isActive(st)) continue;
    st.deadline -= dt;
    if (st.deadline <= 0) missed(g, st, 'The clock ran out');
  }
  if (g.screen !== 'play') return;
  // New work arrives. Nobody asks.
  const bossDone = incidentResolved(g);
  // Nobody rings a new starter mid-induction: the clock starts once the floor is open.
  if (g.pendingStaff === null && !bossDone && s.induction === null) {
    g.staffIn -= dt;
    if (g.staffIn <= 0) {
      const chance = g.staffFirst ? Math.min(0.85, 0.45 + s.rung * 0.035) : 0.45;
      scheduleStaffing(g, false);
      if (staffedThisFloor(g) < 3 && fx.chance(chance)) offerStaffing(g, fx.pick(STAFFERS));
    }
  }
  // Deliver the call when you are not in the middle of something.
  if (g.pendingStaff !== null) {
    g.pendingStaff.wait += dt;
    const busy = g.actors.some((a) => a.hostile && a.aggro && !a.resolved && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 12);
    if (!busy && g.rootT <= 0) {
      const p = g.pendingStaff;
      g.pendingStaff = null;
      g.openDialogue(staffingNode(g, p.def, p.by));
    } else if (g.pendingStaff.wait > 25) {
      const p = g.pendingStaff;
      g.pendingStaff = null;
      assignStaffed(g, p.def, p.by);
      g.hud.toast(`${p.by} staffed you on "${p.def.title}" while you were busy. Silence is consent.`, 'bad');
    }
  }
}

/** Queue a staffing call (it rings once you are free to answer). */
export function offerStaffing(g: Game, by: string, id?: string): boolean {
  if (staffedThisFloor(g) >= 3) return false;
  const pool = staffable(g).filter((d) => id === undefined || d.id === id);
  if (pool.length === 0) return false;
  // P1s are rarer than the Friday kind.
  const weighted = pool.flatMap((d) => (d.timeLimit !== undefined ? [d] : [d, d]));
  g.pendingStaff = { def: fx.pick(weighted), by, wait: 0 };
  return true;
}

/** A manager, mid-meeting: "while I have you...". */
export function maybeStaff(g: Game, by: string, chance: number): void {
  // Not mid-induction, in person any more than by phone (tickQuests holds those).
  if (g.save.induction !== null) return;
  if (g.save.location === 'mokki' || g.pendingStaff !== null || staffedThisFloor(g) >= 3 || !fx.chance(chance)) return;
  const pool = staffable(g);
  if (pool.length === 0) return;
  const def = fx.pick(pool);
  g.afterDialogue = chain(g.afterDialogue, () => g.openDialogue(staffingNode(g, def, by, true)));
}

function chain(a: (() => void) | null, b: () => void): () => void {
  return () => {
    a?.();
    b();
  };
}

function pushBackOdds(g: Game): number {
  const s = g.save;
  const over = workload(s).over;
  const difficulty = 45 + s.rung * 3 - over * 15 - (perk(s, 'boundaries') > 0 ? 20 : 0);
  return checkChance(skill(s, 'soft'), s.attrs.charm, difficulty, g.derivedCache.persuade);
}

/** Who you could hand work to: anyone following you, except somebody you are mentoring. */
function helperFor(g: Game): Actor | null {
  const mentees = new Set(g.save.questLog.filter((q) => q.mentor === true && isActive(q)).map((q) => q.by));
  const h = g.recruitedHelper();
  if (h === null || !mentees.has(h.name)) return h;
  return g.actors.find((a) => a !== h && a.kind === 'helper' && a.recruited && !a.resolved && a.npcId === null && a.role !== 'dog' && a.role !== 'clone' && a.role !== 'spirit' && !mentees.has(a.name)) ?? null;
}

export function staffingNode(g: Game, def: QuestDef, by: string, inPerson = false): DialogueNode {
  const s = g.save;
  const load = workload(s);
  const obj = def.stages[0];
  const due = def.timeLimit !== undefined ? `You have ${Math.round(def.timeLimit / 60)} minutes.` : 'Due Friday.';
  const busy = load.active >= load.capacity ? ` I know you have ${load.active} things on. We all have a lot on.` : '';
  const odds = pushBackOdds(g);
  const opts: DialogueOption[] = [
    { label: 'Sure. Leave it with me.', pick: () => {
      assignStaffed(g, def, by);
      adjustStanding(s, 'management', 1);
      return said(by, 'Great stuff. I have told everyone you own it now.', 'good');
    } },
    { label: load.over > 0 ? `I am already at ${load.active}/${load.capacity}. I genuinely have no bandwidth.` : 'Can this go to someone with more capacity?', tag: `Soft Skills ${Math.round(odds * 100)}%`, pick: () => {
      g.exercise('soft', 1.5);
      if (fx.chance(odds)) {
        s.questLog.push({ id: def.id, stage: 0, progress: 0, done: false, floor: g.floor, staffed: true, by, pushed: true, returned: true });
        g.refreshDerived();
        g.achieve('boundaries');
        g.journal(`I pushed back on "${def.title}". It went to somebody else. Nothing caught fire.`);
        return said(by, 'Fine. Fine! I will find someone. Enjoy your "bandwidth".', 'neutral');
      }
      assignStaffed(g, def, by);
      adjustStanding(s, 'management', -2);
      return said(by, 'Noted. It is still yours. I have also noted the tone.', 'bad');
    } },
  ];
  const helper = helperFor(g);
  if (helper !== null && !canDelegate(s.rung)) {
    // Trainees do not delegate. Nobody below architect really does.
    opts.push({ label: `Put ${helper.name} on it.`, tag: 'Architects only', disabled: true, pick: () => null });
  } else if (helper !== null) {
    opts.push({ label: `Put ${helper.name} on it.`, tag: `Delegate: ${perk(s, 'delegate') > 0 ? 'full' : 'half'} credit, helper leaves`, pick: () => {
      assignStaffed(g, def, by, helper.name);
      g.dismiss(helper);
      g.refreshDerived();
      return said(by, `${helper.name}? Sure, as long as it gets done. It is still your name on it.`, 'neutral');
    } });
  }
  return {
    speaker: inPerson ? by : `${by} (Teams call)`,
    subtitle: `Staffing: ${def.title}`,
    mood: 'bad',
    text: `${inPerson ? 'Oh, and while I have you:' : 'Quick one.'} I have put you down for ${def.title}. ${obj?.text ?? ''} ${due}${busy}`,
    options: opts,
  };
}

/** Put an assignment on your plate - or, with `delegate`, on a helper's. */
export function assignStaffed(g: Game, def: QuestDef, by: string, delegate?: string): QuestState | null {
  const s = g.save;
  if (s.questLog.some((st) => st.id === def.id && (isActive(st) || st.floor === g.floor))) return null;
  const overBefore = workload(s).over;
  const wasFull = workload(s).active >= workload(s).capacity;
  const st: QuestState = { id: def.id, stage: 0, progress: 0, done: false, floor: g.floor, staffed: true, by };
  // Keep the log from growing forever: old assignments drop off after two floors.
  s.questLog = s.questLog.filter((q) => q.staffed !== true || isActive(q) || q.floor >= g.floor - 2);
  if (delegate !== undefined) {
    st.delegated = true;
    s.questLog.push(st);
    g.hud.toast(`📌 ${def.title}: delegated to ${delegate}. It lands on Friday.`, 'info');
    g.journal(`${by} staffed me on "${def.title}". I put ${delegate} on it.`);
    g.refreshDerived();
    return st;
  }
  if (def.timeLimit !== undefined) st.deadline = def.timeLimit;
  s.questLog.push(st);
  sfx.phone();
  g.hud.toast(`📌 STAFFED: ${def.title} (${by}) - ${def.timeLimit !== undefined ? `P1, ${Math.round(def.timeLimit / 60)} minutes` : 'due Friday'}.`, 'bad');
  g.journal(`${by} staffed me on "${def.title}".`);
  g.tip('staffed');
  if (wasFull) g.achieve('handsfull');
  startStage(g, st);
  g.refreshDerived();
  if (workload(s).over > overBefore) g.hud.toast(`OVERALLOCATED: ${workload(s).active}/${workload(s).capacity}. Max sanity and energy suffer until you clear some of it.`, 'bad');
  g.markersIn = 0;
  return st;
}

function missed(g: Game, st: QuestState, why: string): void {
  const s = g.save;
  const def = questById(st.id);
  st.failed = true;
  delete st.deadline;
  adjustStanding(s, 'management', -6);
  s.stats.staffedMissed++;
  g.hud.toast(`📌 MISSED: ${def?.title ?? st.id}. ${why}. (Management -6)`, 'bad');
  g.journal(`Missed "${def?.title ?? st.id}" for ${st.by ?? 'management'}. ${why}.`);
  g.refreshDerived();
}

/** At a computer: one more go at handing an assignment back. */
export function pushBack(g: Game, index: number): string {
  const st = g.save.questLog[index];
  if (st === undefined || st.staffed !== true || !isActive(st)) return 'Nothing to push back on.';
  if (st.pushed === true) return 'You already pushed back on this one. Asking twice is "not a team player".';
  st.pushed = true;
  const def = questById(st.id);
  g.exercise('soft', 1.5);
  if (fx.chance(pushBackOdds(g))) {
    st.returned = true;
    delete st.deadline;
    g.achieve('boundaries');
    g.journal(`I emailed ${st.by ?? 'management'} about "${def?.title ?? st.id}" and it went to somebody else.`);
    g.refreshDerived();
    return `✔ ${st.by ?? 'Management'} replied: "Fine, I will reassign it." It is off your plate.`;
  }
  adjustStanding(g.save, 'management', -2);
  return `✖ ${st.by ?? 'Management'} replied: "Let us discuss at your review." It stays on your plate. (Management -2)`;
}

/** Friday: what got delivered, what did not, and what that costs. */
export function settleWeek(g: Game): string {
  const s = g.save;
  let delivered = 0;
  let missedN = 0;
  for (const st of s.questLog) {
    if (st.staffed !== true || st.returned === true) continue;
    const withHelper = st.delegated === true && !st.done && st.failed !== true;
    // Settled weeks stay settled; anything still open is due now, wherever it came from.
    if (st.floor !== g.floor && !isActive(st) && !withHelper) continue;
    if (withHelper) {
      // The helper got it done. Mostly.
      st.done = true;
      const full = perk(s, 'delegate') > 0;
      g.addRep(Math.round((60 + g.floor * 20) * (full ? 1 : 0.5)));
      adjustStanding(s, 'management', full ? 4 : 2);
      s.stats.staffedDone++;
      delivered++;
      continue;
    }
    if (st.done) delivered++;
    else if (st.failed === true) missedN++;
    else {
      missed(g, st, 'Friday came');
      missedN++;
    }
  }
  if (missedN >= 2) g.warn(`Missed ${missedN} deliverables in one week`);
  const dropped = settleMentoring(g);
  // Settled work from long ago drops out of the log.
  s.questLog = s.questLog.filter((q) => (q.staffed !== true && q.mentor !== true) || isActive(q) || q.floor >= g.floor - 2);
  if (delivered + missedN + dropped === 0) return '';
  return `This week: ${delivered} delivered, ${missedN} missed.${dropped > 0 ? ` ${dropped} mentoring promise${dropped > 1 ? 's' : ''} broken.` : ''}`;
}

// ================================================================== what the HUD shows

export function questLines(g: Game): string[] {
  if (g.mission) return [];
  const s = g.save;
  const out: string[] = [];
  if (s.location !== 'mokki') {
    const load = workload(s);
    out.push(`${load.over > 0 ? '⚠ OVERALLOCATED' : 'Workload'} ${load.active}/${load.capacity}`);
    out.push(...teamLines(g));
    const ch = mainChapter(g.floor);
    if (ch !== undefined && !s.won) {
      const ev = ch.evidence;
      if (ev !== undefined && !s.questItems.includes(ev.item)) out.push(`◆ Phoenix: ${ev.hint}`);
    }
    for (const st of s.questLog) {
      if (!isActive(st)) continue;
      const def = questById(st.id);
      const obj = currentObjective(st);
      if (def === undefined || obj === undefined) continue;
      const count = obj.count !== undefined ? ` (${st.progress}/${obj.count})` : '';
      const clock = st.deadline !== undefined ? ` ⏱${Math.max(0, Math.ceil(st.deadline))}s` : '';
      out.push(`${st.staffed === true ? '📌' : st.mentor === true ? '🎓' : '◆'} ${def.title}${mentorSuffix(g, st)}${count}${clock}`);
    }
  }
  for (const q of s.quests) out.push(`${q.done ? '✔' : '•'} ${q.title}${q.goal > 1 ? ` (${Math.min(q.progress, q.goal)}/${q.goal})` : ''}`);
  return out.slice(0, 9);
}

export function questMarkers(g: Game): CompassMarker[] {
  if (g.mission) return g.mission.markers();
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
    if (a.questTag !== null) {
      out.push({ x: a.pos.x, z: a.pos.z, icon: '☠', color: gold, label: a.name });
    } else if (id !== undefined) {
      const st = s.questLog.find((q) => q.id === id);
      const obj = st === undefined ? undefined : currentObjective(st);
      if (st === undefined) out.push({ x: a.pos.x, z: a.pos.z, icon: '!', color: gold, label: a.name });
      else if (isActive(st) && obj?.kind === 'talk') out.push({ x: a.pos.x, z: a.pos.z, icon: '?', color: gold, label: a.name });
    } else if (a.kind === 'npc' && !a.talked) {
      out.push({ x: a.pos.x, z: a.pos.z, icon: '!', color: '#ffe07a', label: a.name });
    }
  }
  // Rooms a quest wants you in, and the escort's destination.
  for (const st of s.questLog) {
    if (!isActive(st)) continue;
    const obj = currentObjective(st);
    if ((obj?.kind === 'room' || obj?.kind === 'escort') && obj.room !== undefined) {
      const rm = roomsOfKind(g, obj.room)[0];
      if (rm !== undefined) out.push({ x: (rm.x + rm.w / 2) * 2, z: (rm.y + rm.h / 2) * 2, icon: st.staffed === true ? '📌' : st.mentor === true ? '🎓' : '◆', color: gold, label: questById(st.id)?.title ?? '' });
    }
    if (obj?.kind === 'use' && obj.use === 'printer') {
      const p = g.level.interactables.find((i) => i.kind === 'printer' && !i.used);
      if (p !== undefined) out.push({ x: p.x, z: p.z, icon: '📌', color: gold, label: 'Printer' });
    }
  }
  out.push(...mentorMarkers(g));
  if (currentObjectiveIsEscort(g)) {
    const desk = g.level.interactables.find((i) => i.kind === 'itdesk');
    if (desk !== undefined) out.push({ x: desk.x, z: desk.z, icon: '◆', color: gold, label: 'Internal IT (Josh)' });
  }
  const lift = g.level.interactables.find((i) => i.kind === 'elevator');
  if (lift !== undefined && g.elevatorOpen) out.push({ x: lift.x, z: lift.z, icon: '▲', color: '#ffffff', label: 'The lift (Friday!)' });
  // On the hub the lift is always going somewhere: up to the major incident.
  else if (lift !== undefined && s.location === 'hub') out.push({ x: lift.x, z: lift.z, icon: '▲', color: '#ffffff', label: 'The lift (major incident)' });
  if (g.boss !== null && g.boss.bossActive && !g.boss.resolved) out.push({ x: g.boss.pos.x, z: g.boss.pos.z, icon: '☠', color: '#ff5050', label: g.boss.name });
  if (s.location === 'mokki') {
    const board = g.level.interactables.find((i) => i.kind === 'board');
    if (board !== undefined) out.push({ x: board.x, z: board.z, icon: '⌂', color: '#7dffea', label: 'Upgrade board' });
    const car = g.level.interactables.find((i) => i.kind === 'car');
    if (car !== undefined) out.push({ x: car.x, z: car.z, icon: '▲', color: '#ffffff', label: 'The car (Monday)' });
    out.push(...pagerMarkers(g));
  }
  return out;
}
