import { sfx } from './audio';
import type { CompassMarker } from './compass';
import { type DialogueNode, type DialogueOption, said } from './dialogue';
import { type Actor, onTeam, say, setMarker } from './entities';
import type { Game } from './game';
import { itemById } from './items';
import { treePerk } from './perks';
import { currentObjective, isActive, MENTOR_PITCH, MENTORING, type QuestDef, type QuestState } from './quests';
import { fx } from './rng';
import { checkChance } from './rpg';
import { adjustStanding, perk, skill, workload } from './state';
import {
  CAN_BOOSTS,
  DOUBLE_CAN_MORALE,
  isFinn,
  isSenior,
  mentorRankFor,
  MORALE_QUIT,
  MORALE_REFUSE,
  MORALE_START,
  moraleLabel,
  type TeamMember,
  teamPower,
  TREATS,
} from './team';

/**
 * Your team on the floor: morale that rises with sweets and falls with
 * fights and overwork, energy drinks for a short hard boost, and - once you
 * are senior - the people who come to you when they are stuck.
 */

const ALLY: [string, string] = ['#003040', 'rgba(220,250,255,0.95)'];
const ULTRA_GLOW = 0x8a9aae;

const first = (name: string | undefined): string => (name ?? 'them').split(' (')[0] ?? 'them';

// ================================================================== morale

export function memberOf(g: Game, name: string): TeamMember {
  const s = g.save;
  let m = s.team[name];
  if (m === undefined) {
    m = { morale: Math.max(30, Math.min(80, MORALE_START + Math.round(s.standing.itcrowd / 5))), mentored: 0 };
    s.team[name] = m;
  }
  return m;
}

/** A teammate walks onto the floor with the morale they left the last one with. */
export function initTeammate(g: Game, a: Actor): void {
  if (!onTeam(a)) return;
  const m = memberOf(g, a.name);
  a.morale = m.morale;
  a.protege = m.mentored > 0;
}

export function changeMorale(g: Game, a: Actor, delta: number): void {
  const floor = perk(g.save, 'mentor') >= 3 ? 40 : 0;
  a.morale = Math.max(floor, Math.min(100, a.morale + delta));
  memberOf(g, a.name).morale = Math.round(a.morale * 10) / 10;
}

/** How hard an ally hits: Delegation, the Mentor perk, and a teammate's morale and cans. */
export function helperMult(g: Game, a: Actor): number {
  const s = g.save;
  const base = perk(s, 'delegate') > 0 ? 2 : 1;
  if (!onTeam(a)) return base;
  const p = teamPower(a.morale, a.boostT > 0 ? a.boost : 1, a.protege);
  return base * p.damage * (perk(s, 'mentor') >= 1 ? 1.25 : 1);
}

export function teamNote(a: Actor): string {
  if (!onTeam(a)) return '';
  return `Morale ${Math.round(a.morale)} (${moraleLabel(a.morale)})${a.boostT > 0 ? ` · ⚡ ${Math.ceil(a.boostT)}s` : ''}${a.protege ? ' · Protégé' : ''}`;
}

/** Will they come with you? Not on an empty tank. */
export function tooTired(a: Actor): boolean {
  return onTeam(a) && a.morale < MORALE_REFUSE;
}

function takeOne(g: Game, id: string): boolean {
  const s = g.save;
  const n = s.consumables[id] ?? 0;
  if (n <= 0) return false;
  if (n <= 1) delete s.consumables[id];
  else s.consumables[id] = n - 1;
  return true;
}

/** What you could hand them from your backpack: sweets first, then cans (the king on top). */
export function treatOptions(g: Game, a: Actor): DialogueOption[] {
  if (!onTeam(a)) return [];
  const s = g.save;
  const have = (id: string): boolean => (s.consumables[id] ?? 0) > 0;
  const twice = perk(s, 'mentor') >= 3 ? 2 : 1;
  const out: DialogueOption[] = [];
  for (const id of Object.keys(TREATS).filter(have).slice(0, 3)) {
    const t = TREATS[id];
    if (t === undefined) continue;
    const val = t.finnOnly !== undefined && !isFinn(a.name) ? t.finnOnly : t.morale * twice;
    out.push({
      label: `Have some ${itemById(id)?.name ?? id}.`,
      tag: `${val >= 0 ? '+' : ''}${val} morale${t.share !== undefined ? `, team +${t.share * twice}` : ''}`,
      pick: () => giveTreat(g, a, id),
    });
  }
  const cans = Object.keys(CAN_BOOSTS).filter(have).sort((x, y) => (CAN_BOOSTS[y]?.power ?? 0) - (CAN_BOOSTS[x]?.power ?? 0)).slice(0, 2);
  for (const id of cans) {
    const c = CAN_BOOSTS[id];
    if (c === undefined) continue;
    const tag = id === 'whitemonster' ? `ASCEND for ${c.seconds}s`
      : a.boostT > 0 ? 'Already buzzing: the jitters'
        : `×${c.power} for ${c.seconds}s, then a crash`;
    out.push({ label: `Here, have a ${itemById(id)?.name ?? id}.`, tag, pick: () => giveTreat(g, a, id) });
  }
  return out;
}

function giveTreat(g: Game, a: Actor, id: string): DialogueNode {
  const s = g.save;
  if (!takeOne(g, id)) return said(a.name, 'You... do not have one of those.', 'neutral');
  s.stats.treats++;
  if (s.stats.treats >= 10) g.achieve('snacks');
  // The IT crowd remember who fed them. Once a floor each.
  if (a.memo.treated !== true) {
    a.memo.treated = true;
    adjustStanding(s, 'itcrowd', 1);
  }
  g.refreshDerived();
  const twice = perk(s, 'mentor') >= 3 ? 2 : 1;
  const t = TREATS[id];
  if (t !== undefined) {
    const polite = t.finnOnly !== undefined && !isFinn(a.name);
    changeMorale(g, a, polite ? (t.finnOnly ?? 0) : t.morale * twice);
    sfx.heal();
    if (t.share !== undefined && !polite) {
      for (const o of g.actors) {
        if (o === a || !onTeam(o) || o.resolved || Math.hypot(o.pos.x - g.player.pos.x, o.pos.z - g.player.pos.z) > 10) continue;
        changeMorale(g, o, t.share * twice);
        say(o, fx.pick(['Ooh, is that for us?', 'Legend.', 'Kiitos!', 'Best. Senior. Ever.', 'I will do printers for this.']), 2.5, ...ALLY);
      }
    }
    g.floatText(a.pos.clone().setY(2.4), polite ? 'morale −' : 'morale +', polite ? '#ffb070' : '#7dffea');
    return said(a.name, polite ? (t.otherLine ?? t.line) : t.line, polite ? 'neutral' : 'good');
  }
  const c = CAN_BOOSTS[id];
  if (c === undefined) return said(a.name, 'Thanks?', 'neutral');
  if (a.boostT > 0 && id !== 'whitemonster') {
    changeMorale(g, a, DOUBLE_CAN_MORALE);
    a.boostT += 10;
    a.boostCrash += 6;
    return said(a.name, 'Another one? My hands are... vibrating. I can hear the lights. I can hear the lights, man.', 'bad');
  }
  a.boost = c.power;
  a.boostT = c.seconds;
  a.boostCrash = c.crash;
  changeMorale(g, a, c.morale > 0 ? c.morale * twice : c.morale);
  sfx.hiss();
  if (id === 'whitemonster') {
    a.glowBase = ULTRA_GLOW;
    g.particles.emit('gold', a.pos.clone().setY(1.4), 50, 0.6);
    g.achieve('kinggift');
    g.journal(`I gave ${a.name} a White Monster. They ascended. I have never seen anyone close a ticket with their mind before.`);
  } else {
    g.particles.emit('sparks', a.pos.clone().setY(1.6), 18, 0.4);
  }
  return said(a.name, c.line, 'good');
}

const CRASH_LINES = ['...and that is the crash. Need a nap. Under the desk.', 'Why is everything so heavy now.', 'I can taste my heartbeat.', 'Is it Friday? It feels like Friday.'];

/** Every frame on the floor: cans wear off, fights and overwork wear people down, and people get stuck. */
export function tickTeam(g: Game, dt: number): void {
  const s = g.save;
  const mentor = perk(s, 'mentor');
  const over = s.location === 'office' ? workload(s).over : 0;
  for (const a of g.actors) {
    if (!onTeam(a) || a.resolved) continue;
    if (a.boostT > 0) {
      a.boostT -= dt;
      if (a.boostT <= 0) {
        a.boostT = 0;
        a.boost = 1;
        if (a.glowBase === ULTRA_GLOW) a.glowBase = 0;
        if (a.boostCrash > 0) {
          changeMorale(g, a, -a.boostCrash);
          say(a, fx.pick(CRASH_LINES), 3, ...ALLY);
        }
        a.boostCrash = 0;
      }
    }
    if (a.recruited) {
      const fighting = g.actors.some((h) => h.hostile && h.aggro && !h.resolved && Math.hypot(h.pos.x - a.pos.x, h.pos.z - a.pos.z) < 14);
      // A fight wears people down; so does a senior who is snapping at everyone because they are over capacity.
      let drain = (fighting ? 0.18 : 0) + over * 0.05;
      if (mentor >= 1) drain *= 0.5;
      if (a.boostT > 0) drain *= 0.3;
      if (drain > 0) changeMorale(g, a, -drain * dt);
      if (a.morale < MORALE_QUIT) {
        a.recruited = false;
        say(a, 'I need a break. A long one. Please do not follow me.', 3.5, ...ALLY);
        g.hud.toast(`${a.name} has gone on a break (morale ${Math.floor(a.morale)}). Something sweet might bring them round.`, 'bad');
        g.tip('team');
      }
    } else if (a.morale < 45) {
      changeMorale(g, a, 0.02 * dt);
    }
  }
  tickMentoring(g, dt);
}

/** The weekend: everybody comes back on Monday a bit more human. */
export function restTeam(g: Game): void {
  for (const m of Object.values(g.save.team)) m.morale = Math.round(m.morale + (65 - m.morale) * 0.5);
}

/** The HUD line for whoever is following you. */
export function teamLines(g: Game): string[] {
  const team = g.actors.filter((a) => onTeam(a) && a.recruited && !a.resolved);
  if (team.length === 0) return [];
  return [`👥 ${team.map((a) => `${first(a.name)} ${Math.round(a.morale)}%${a.boostT > 0 ? ` ⚡${Math.ceil(a.boostT)}s` : ''}`).join(' · ')}`];
}

// ================================================================== mentoring

export function scheduleMentoring(g: Game, first_: boolean): void {
  g.mentorIn = first_ ? fx.range(50, 100) : fx.range(200, 320);
}

function mentoringThisFloor(g: Game): number {
  return g.save.questLog.filter((q) => q.mentor === true && q.floor === g.floor).length;
}

function tickMentoring(g: Game, dt: number): void {
  const s = g.save;
  if (s.location !== 'office' || !isSenior(s.rung)) return;
  const ask = g.mentorAsk;
  if (ask !== null) {
    ask.wait += dt;
    if (ask.actor.resolved || ask.wait > 150) {
      // Nobody came. They figure it out alone, or they do not.
      if (!ask.actor.resolved) {
        changeMorale(g, ask.actor, -6);
        say(ask.actor, 'Never mind. I will figure it out. Probably.', 3, ...ALLY);
      }
      clearAsk(g);
    }
    return;
  }
  if (s.floorState.bossDone || g.boss === null || g.boss.resolved) return;
  g.mentorIn -= dt;
  if (g.mentorIn > 0) return;
  scheduleMentoring(g, false);
  if (mentoringThisFloor(g) < 2) requestMentoring(g);
}

/** Somebody on the team is stuck, and you are the senior. Returns false if nobody is around to ask. */
export function requestMentoring(g: Game, id?: string): boolean {
  const s = g.save;
  const busy = new Set(s.questLog.filter((q) => q.mentor === true && isActive(q)).map((q) => q.by));
  const people = g.actors.filter((a) => onTeam(a) && !a.resolved && !a.recruited && !busy.has(a.name));
  for (const a of fx.shuffle(people)) {
    const pool = MENTORING.filter((d) => (id === undefined || d.id === id) && a.role !== null && d.roles?.includes(a.role) === true
      && !s.questLog.some((q) => q.id === d.id && (isActive(q) || q.floor === g.floor)));
    if (pool.length === 0) continue;
    g.mentorAsk = { actor: a, def: fx.pick(pool), wait: 0 };
    a.memo.seeking = true;
    setMarker(a, '🎓', '#7dffea');
    say(a, 'Got a minute? I am stuck.', 4, ...ALLY);
    g.hud.toast(`🎓 ${a.name} is stuck, and coming to find you.`, 'info');
    g.tip('mentor');
    g.markersIn = 0;
    return true;
  }
  return false;
}

function clearAsk(g: Game): void {
  const ask = g.mentorAsk;
  if (ask === null) return;
  ask.actor.memo.seeking = false;
  setMarker(ask.actor, null);
  g.mentorAsk = null;
  g.markersIn = 0;
}

export function mentorRequestNode(g: Game, a: Actor): DialogueNode {
  const s = g.save;
  const ask = g.mentorAsk;
  const def = ask?.def;
  if (ask === null || def === undefined) return said(a.name, 'Oh, never mind, sorted it. Thanks though!');
  const load = workload(s);
  const name = first(a.name);
  const busy = load.active >= load.capacity ? ` (You are at ${load.active}/${load.capacity}. ${name} knows you are busy. They asked anyway.)` : '';
  const quick = checkChance(skill(s, 'troubleshooting'), s.attrs.tech, 45 + g.floor * 4);
  return {
    speaker: a.name,
    subtitle: `Mentoring: ${def.title}`,
    text: `${MENTOR_PITCH[def.id] ?? 'Have you got a minute? I am stuck.'}${busy}`,
    options: [
      { label: 'Of course. Show me.', tag: '+1 workload · a perk point if you see it through by Friday', pick: () => {
        clearAsk(g);
        acceptMentoring(g, a, def);
        return said(a.name, 'Thank you. Really. I will try not to waste your time.', 'good');
      } },
      { label: 'Five minutes, right here.', tag: `Troubleshooting ${Math.round(quick * 100)}% · no workload, no perk`, pick: () => {
        clearAsk(g);
        g.exercise('troubleshooting', 1);
        g.exercise('soft', 0.5);
        if (fx.chance(quick)) {
          changeMorale(g, a, 10);
          adjustStanding(s, 'itcrowd', 1);
          return said(a.name, 'Oh! OH. That is so obvious now. Thank you!', 'good');
        }
        changeMorale(g, a, -4);
        return said(a.name, 'I think I am more confused now. That is fine. It is fine.', 'neutral');
      } },
      { label: 'Not now, sorry. Have you tried the KB?', pick: () => {
        clearAsk(g);
        changeMorale(g, a, -8);
        return said(a.name, 'Right. The KB. Sure. Thanks.', 'bad');
      } },
    ],
  };
}

function acceptMentoring(g: Game, a: Actor, def: QuestDef): void {
  const s = g.save;
  const overBefore = workload(s).over;
  const st: QuestState = { id: def.id, stage: 0, progress: 0, done: false, floor: g.floor, by: a.name, mentor: true };
  s.questLog.push(st);
  a.recruited = true;
  changeMorale(g, a, 8);
  sfx.chime();
  g.hud.toast(`🎓 Mentoring ${first(a.name)}: ${def.title}. A perk point if you see it through by Friday.`, 'epic');
  g.journal(`${a.name} asked me for help ("${def.title}"). I said yes.`);
  g.startQuestStage(st);
  g.refreshDerived();
  if (workload(s).over > overBefore) g.hud.toast(`That puts you over capacity (${workload(s).active}/${workload(s).capacity}).`, 'bad');
  g.markersIn = 0;
}

/** The person you are mentoring, if they are on this floor. */
function menteeOf(g: Game, st: QuestState): Actor | undefined {
  return g.actors.find((a) => a.name === st.by && !a.resolved);
}

export function menteeNearby(g: Game, st: QuestState): boolean {
  const m = menteeOf(g, st);
  return m !== undefined && Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z) < 9;
}

/** Seen through: the teammate gets it, and so, it turns out, do you. */
export function mentoringDone(g: Game, st: QuestState, def: QuestDef): void {
  const s = g.save;
  const name = st.by ?? '';
  const m = memberOf(g, name);
  m.mentored++;
  const a = menteeOf(g, st);
  if (a !== undefined) {
    a.protege = true;
    changeMorale(g, a, 25);
    say(a, fx.pick(['I get it now. I actually get it. Thank you.', 'I am going to do this for the next person. Promise.', 'You make it look easy. One day I will too.']), 4, ...ALLY);
  } else {
    m.morale = Math.min(100, m.morale + 25);
  }
  // One perk point a week from mentoring; a second mentee that week pays in Rep and goodwill.
  const weekKey = `mentorPerk_${s.week}`;
  const perkPoint = s.flags[weekKey] !== true;
  if (perkPoint) {
    s.flags[weekKey] = true;
    s.perkPoints += 1;
  }
  s.stats.mentored++;
  g.addRep((40 + g.floor * 15) * (perkPoint ? 1 : 2));
  adjustStanding(s, 'itcrowd', 4);
  sfx.levelUp();
  g.hud.toast(perkPoint ? `🎓 ${first(name)} gets it now. Teaching is learning: +1 perk point.` : `🎓 ${first(name)} gets it now. (One perk point a week from mentoring; this one pays double Rep.)`, 'epic');
  g.journal(`I mentored ${name} through "${def.title}". They get it now. So, it turns out, do I.`);
  g.achieve('mentor');
  if (s.stats.mentored >= 6) g.achieve('servant');
  const rank = mentorRankFor(s.stats.mentored);
  if (rank > perk(s, 'mentor')) {
    s.perks.mentor = rank;
    const desc = treePerk('mentor')?.ranks[rank - 1]?.desc ?? '';
    g.hud.toast(`PERK EARNED - ${desc}`, 'epic');
    g.journal(`Perk earned by mentoring: ${desc}`);
  }
  g.refreshDerived();
}

/** Telling them you do not have time after all. */
export function dropMentoring(g: Game, index: number): string {
  const s = g.save;
  const st = s.questLog[index];
  if (st === undefined || st.mentor !== true || !isActive(st)) return 'Nothing to drop.';
  st.failed = true;
  const a = menteeOf(g, st);
  if (a !== undefined) {
    changeMorale(g, a, -12);
    a.recruited = false;
    say(a, 'No, I get it. You are busy. It is fine.', 3, ...ALLY);
  } else {
    const m = memberOf(g, st.by ?? '');
    m.morale = Math.max(0, m.morale - 12);
  }
  adjustStanding(s, 'itcrowd', -1);
  g.journal(`I told ${st.by ?? 'them'} I did not have time for "${MENTORING.find((d) => d.id === st.id)?.title ?? st.id}" after all.`);
  g.refreshDerived();
  return `You told ${first(st.by)} you do not have time. They said it is fine. It is not quite fine. (Morale -12)`;
}

/** Friday: mentoring you never got round to. Nobody writes you up. They just remember. */
export function settleMentoring(g: Game): number {
  const s = g.save;
  let dropped = 0;
  for (const st of s.questLog) {
    if (st.mentor !== true || !isActive(st)) continue;
    st.failed = true;
    dropped++;
    const m = memberOf(g, st.by ?? '');
    m.morale = Math.max(0, m.morale - 20);
    adjustStanding(s, 'itcrowd', -3);
    g.journal(`I never found the time to help ${st.by ?? 'them'}. They stopped asking.`);
  }
  if (dropped > 0) g.hud.toast(`🎓 ${dropped} mentoring promise${dropped > 1 ? 's' : ''} never kept. Your team noticed. (IT Crowd -${dropped * 3})`, 'bad');
  return dropped;
}

/** The HUD line for a mentoring objective: who, and whether they need fetching. */
export function mentorSuffix(g: Game, st: QuestState): string {
  if (st.mentor !== true) return '';
  const obj = currentObjective(st);
  const away = obj?.withMentee === true && !menteeNearby(g, st) ? ' - bring them' : '';
  return ` (${first(st.by)})${away}`;
}

export function mentorMarkers(g: Game): CompassMarker[] {
  const out: CompassMarker[] = [];
  const cyan = '#7dffea';
  const ask = g.mentorAsk;
  if (ask !== null && !ask.actor.resolved) out.push({ x: ask.actor.pos.x, z: ask.actor.pos.z, icon: '🎓', color: cyan, label: `${ask.actor.name} (stuck)` });
  for (const st of g.save.questLog) {
    if (st.mentor !== true || !isActive(st)) continue;
    const m = menteeOf(g, st);
    if (m !== undefined && !m.recruited) out.push({ x: m.pos.x, z: m.pos.z, icon: '🎓', color: cyan, label: `${m.name} (your mentee)` });
  }
  return out;
}

