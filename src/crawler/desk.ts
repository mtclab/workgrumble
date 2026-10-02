import { sfx } from './audio';
import { TICKETS } from './content/tickets';
import { type Actor, say } from './entities';
import type { Game } from './game';
import { isPracticeTicket } from './induction';
import { fx, Rng } from './rng';
import { bandFor, WORKPLACES } from './rpg';
import { adjustStanding, perk, type QueuedTicket, type Quest, skill } from './state';
import { questEvent } from './questing';

/**
 * The desk job: the ticket queue you work at any computer, and the radiant
 * mail tasks that pay a bonus. This is what the office sim was, before it
 * grew a dungeon around it.
 */

export interface FixEntry {
  readonly opts: string[];
  readonly hint: string | null;
}

export function enqueueTicket(g: Game, from: Actor, gold: boolean): void {
  const s = g.save;
  if (s.location === 'mokki') return;
  if (s.queue.some((q) => q.from === from.name)) return;
  if (s.queue.length >= g.derivedCache.queueMax) {
    g.hurtPlayer(6, null, 'ticket');
    g.hud.toast('Queue overflow! The tickets are coming from inside the queue.', 'bad');
    return;
  }
  const sla = ((gold ? 80 : 130) - Math.min(40, s.floor * 8)) * g.derivedCache.slaMult;
  s.queue.push({ t: from.ticket, sla, from: from.name, struck: [], gold });
  sfx.phone();
  g.hud.toast(`${gold ? '⭐ GOLD ' : ''}Ticket from ${from.name}: "${TICKETS[from.ticket]?.title ?? ''}" - solve it at a computer or resolve them in person.`, gold ? 'bad' : 'info');
  g.tip('ticket');
}

export function breach(g: Game, q: QueuedTicket): void {
  // The induction's ticket never breaches: it is the lesson, and the step waits on it.
  if (isPracticeTicket(q)) return;
  const s = g.save;
  s.queue = s.queue.filter((x) => x !== q);
  s.stats.breaches++;
  adjustStanding(s, 'management', -3);
  adjustStanding(s, 'staff', -2);
  g.hurtPlayer(q.gold ? 22 : 12, null, 'ticket');
  const title = TICKETS[q.t]?.title ?? '';
  // On the hub the person who raised it comes to find you, announced (hub.ts); upstairs, a manager is sent.
  if (g.hub !== null) {
    g.hud.toast(`SLA BREACHED: "${title}". (Management -3, Staff -2)`, 'bad');
    g.hub.breach(q);
    return;
  }
  g.hud.toast(`SLA BREACHED: "${title}". Escalated to a manager. (Management -3, Staff -2)`, 'bad');
  const ang = fx.range(0, Math.PI * 2);
  const m = g.spawn('manager', g.player.pos.x + Math.sin(ang) * 6, g.player.pos.z + Math.cos(ang) * 6, -1);
  if (m !== null) say(m, `I have been asked to follow up on "${title}".`, 4);
}

/**
 * The fixes on offer for a ticket: the right one, three plausible wrong
 * ones. Stable per ticket (the cache), so reopening a window never reshuffles.
 */
function entryFor(g: Game, q: QueuedTicket): FixEntry | null {
  let entry = g.fixCache.get(q);
  if (entry !== undefined) return entry;
  const t = TICKETS[q.t];
  if (t === undefined) return null;
  // Seeded by the ticket and who raised it, so a reload shows the same choices.
  let h = q.t * 7919;
  for (let i = 0; i < q.from.length; i++) h = (h * 31 + q.from.charCodeAt(i)) >>> 0;
  const r = new Rng(h);
  const correct = r.pick(t.fixes);
  const own = new Set(t.fixes);
  const decoys = new Set<string>();
  for (let guard = 0; decoys.size < 3 && guard < 60; guard++) {
    const f = r.pick(r.pick(TICKETS).fixes);
    if (!own.has(f)) decoys.add(f);
  }
  // Troubleshooting: sometimes you just know. Known Issue: more often.
  const hunch = (skill(g.save, 'troubleshooting') / 140) * (1 + perk(g.save, 'knownissue'));
  const hint = r.next() < hunch ? correct : null;
  entry = { opts: r.shuffle([correct, ...decoys]), hint };
  g.fixCache.set(q, entry);
  return entry;
}

export function fixOptions(g: Game, q: QueuedTicket): string[] {
  const entry = entryFor(g, q);
  if (entry === null) return [];
  let out = entry.opts.filter((o) => !q.struck.includes(o));
  // The Ballmer Peak: at exactly the right BAC, one wrong answer is obviously wrong.
  if (bandFor(g.save.bac, g.derivedCache.specials.has('flask')) === 'peak') {
    const t = TICKETS[q.t];
    const wrong = out.find((o) => !(t?.fixes.includes(o) ?? false));
    if (wrong !== undefined && out.length > 2) out = out.filter((o) => o !== wrong);
  }
  return out;
}

export function fixHint(g: Game, q: QueuedTicket): string | null {
  // Only reads the cache: asking for a hint never rolls a new one.
  return g.fixCache.get(q)?.hint ?? null;
}

/** Drunk enough and the words start to swim. */
export function garble(g: Game, label: string): string {
  const amt = g.derivedCache.band.garble;
  if (amt <= 0) return label;
  const rng = new Rng(label.length * 7919 + 13);
  return label.split(' ').map((w) => {
    if (w.length < 4 || !rng.chance(amt)) return w;
    const chars = w.split('');
    const i = rng.int(1, chars.length - 3);
    const a = chars[i] as string;
    chars[i] = chars[i + 1] as string;
    chars[i + 1] = a;
    return chars.join('');
  }).join(' ');
}

export function resolveTicket(g: Game, q: QueuedTicket, label: string): { ok: boolean; message: string } {
  const s = g.save;
  const t = TICKETS[q.t];
  if (t === undefined) return { ok: false, message: 'That ticket no longer exists.' };
  if (t.fixes.includes(label)) {
    s.queue = s.queue.filter((x) => x !== q);
    const gold = q.gold ? (g.derivedCache.specials.has('goldCard') ? 3 : 2) : 1;
    const rep = Math.round((12 + t.urgency * 6 + s.floor * 5) * gold * g.derivedCache.deskRepMult * (0.7 + g.difficulty * 0.3) * WORKPLACES[s.workplace].rep);
    s.rep += rep;
    s.stats.resolvedDesk++;
    adjustStanding(s, 'staff', 1);
    adjustStanding(s, 'management', 0.5);
    g.exercise('troubleshooting', 2);
    g.healPlayer(6, '');
    sfx.resolved();
    questProgress(g, 'resolve');
    questEvent(g, { type: 'fix' });
    g.achieve('firstfix');
    return { ok: true, message: `✔ Resolved. +₡${rep}. Root cause: ${t.cause}` };
  }
  q.struck.push(label);
  q.sla -= 10;
  s.stats.wrongFixes++;
  const hurt = perk(s, 'rootcause') > 0 ? 0 : 8;
  s.sanity -= hurt;
  adjustStanding(s, 'staff', -1);
  g.exercise('troubleshooting', 0.5);
  sfx.error();
  return { ok: false, message: `✖ That was not it. The user has reopened the ticket, with feeling. (${hurt > 0 ? `-${hurt} sanity, ` : ''}-10s SLA, Staff -1)` };
}

export function pullTickets(g: Game): number {
  const s = g.save;
  let n = 0;
  while (s.queue.length < g.derivedCache.queueMax && n < 2) {
    const t = fx.int(0, TICKETS.length - 1);
    const tk = TICKETS[t];
    s.queue.push({ t, sla: 170 * g.derivedCache.slaMult, from: `${tk?.reporter ?? 'Backlog'} (backlog #${fx.int(1000, 9999)})`, struck: [], gold: false });
    n++;
  }
  if (n > 0) sfx.phone();
  return n;
}

// ================================================================== mail tasks

export function newQuest(g: Game): Quest | null {
  const s = g.save;
  if (s.location === 'mokki') return null;
  if (s.quests.filter((q) => q.kind !== 'boss').length >= 3) return null;
  const f = s.floor;
  const kinds: Quest['kind'][] = ['resolve', 'users', 'peace'];
  if (g.level.interactables.some((i) => i.kind === 'printer' && !i.used) && !s.quests.some((q) => q.kind === 'printer')) kinds.push('printer', 'printer');
  const healers = g.actors.filter((a) => a.kind === 'healer' && !a.resolved);
  if (healers.length > 0 && !s.quests.some((q) => q.kind === 'deliver')) kinds.push('deliver');
  const kind = fx.pick(kinds);
  const from = fx.pick(['Derek (Team Lead)', 'Service Desk Bot', 'Fiona (Head of Process)', 'Morag (Internal IT)', 'HR Wellbeing Team']);
  const id = s.nextQuestId++;
  let q: Quest;
  switch (kind) {
    case 'resolve': {
      const goal = fx.int(2, 4);
      q = { id, kind, title: `Close ${goal} tickets at a terminal`, body: 'The queue dashboard is red and it is on the big TV in reception. Close tickets from any computer.', from, goal, progress: 0, reward: 40 + goal * 15 + f * 25, done: false };
      break;
    }
    case 'users': {
      const goal = fx.int(5, 9);
      q = { id, kind, title: `Resolve ${goal} people in person`, body: 'Walk the floor. Be visible. "Proactive floor-walking", they call it.', from, goal, progress: 0, reward: 30 + goal * 8 + f * 20, done: false };
      break;
    }
    case 'peace': {
      const goal = fx.int(2, 4);
      q = { id, kind, title: `Talk ${goal} people down without a fight`, body: 'HR has noticed the stapler incidents. Walk up to someone angry, press E, and use your words.', from: 'HR Wellbeing Team', goal, progress: 0, reward: 50 + goal * 20 + f * 20, done: false };
      break;
    }
    case 'printer':
      q = { id, kind, title: 'Fix the printer in the print room', body: 'It says PC LOAD LETTER. Nobody knows what that means. Beware of paper jams.', from, goal: 1, progress: 0, reward: 60 + f * 25, done: false };
      break;
    case 'deliver':
    default: {
      const target = fx.pick(healers);
      s.consumables.laptop = (s.consumables.laptop ?? 0) + 1;
      q = { id, kind: 'deliver', title: `Deliver a laptop to ${target.name}`, body: `${target.name} has been waiting for a replacement laptop since the spring. It is in your backpack (3 kg).`, from, goal: 1, progress: 0, reward: 50 + f * 25, done: false, target: target.name };
      break;
    }
  }
  s.quests.push(q);
  g.refreshDerived();
  return q;
}

export function questProgress(g: Game, kind: Quest['kind']): void {
  for (const q of g.save.quests) {
    if (q.kind === kind && !q.done) {
      q.progress++;
      if (q.progress >= q.goal) questDone(g, q);
    }
  }
}

function questDone(g: Game, q: Quest): void {
  q.done = true;
  sfx.coin();
  g.hud.toast(`Task complete: ${q.title}. Claim it at any computer (Mail).`, 'good');
}

export function claimQuest(g: Game, q: Quest): void {
  const s = g.save;
  if (!q.done) return;
  s.rep += Math.round(q.reward * WORKPLACES[s.workplace].rep);
  adjustStanding(s, 'management', 2);
  s.quests = s.quests.filter((x) => x !== q);
  sfx.coin();
}

export function deliverLaptop(g: Game, a: Actor): boolean {
  const s = g.save;
  const q = s.quests.find((x) => x.kind === 'deliver' && x.target === a.name && !x.done);
  if (q === undefined || (s.consumables.laptop ?? 0) <= 0) return false;
  delete s.consumables.laptop;
  q.progress = 1;
  questDone(g, q);
  adjustStanding(s, 'kitchen', 5);
  adjustStanding(s, 'staff', 2);
  g.giveItem('biscuits', 1, a.name);
  g.refreshDerived();
  return true;
}
