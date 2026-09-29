import { Rng } from './rng';
import { type Attribute, type Band, salaryFor, type Skill } from './rpg';

/**
 * The on-call rota: some weekends at the mökki the pager comes too. Pure
 * rules only - who is on call which week, when the pager goes off, how long
 * you have to get to a computer, what the drink does to your fix, and what
 * a page pays - so all of it is unit-tested. The weekend itself (toasts, the
 * dialogue, the drive to the village) is in `pager.ts`.
 */

/** Nobody is on the rota their first weekend. */
export const ONCALL_FROM_WEEK = 2;

/** Seconds of play from the pager going off to it counting as missed. */
export const PAGE_WINDOW = 90;

/** Missed pages in one on-call weekend that make it an HR matter. */
export const MISSES_FOR_WARNING = 2;

export type PageStatus = 'pending' | 'live' | 'answered' | 'missed';

export interface Page {
  /** When it goes off, in seconds of play at the mökki since the weekend began. */
  readonly at: number;
  /** Index into PAGE_INCIDENTS. */
  readonly incident: number;
  status: PageStatus;
  /** Seconds left to answer while it is live. */
  left: number;
}

export interface OnCallState {
  /** The weekend (week number) this is the rota for. */
  week: number;
  /** On call this weekend. */
  active: boolean;
  /** The last weekend you were on call: the rota never gives you two in a row. */
  lastWeek: number;
  /** Seconds of play at the mökki since the weekend began. */
  clock: number;
  pages: Page[];
  /** Pages missed this weekend. */
  missed: number;
}

export function freshOnCall(): OnCallState {
  return { week: 0, active: false, lastWeek: -1, clock: 0, pages: [], missed: 0 };
}

/** Fill in an older save's rota (or a damaged one) so every field is there. */
export function normalizeOnCall(raw: unknown): OnCallState {
  const out = freshOnCall();
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  out.week = num(o.week, out.week);
  out.active = o.active === true;
  out.lastWeek = num(o.lastWeek, out.lastWeek);
  out.clock = num(o.clock, 0);
  out.missed = num(o.missed, 0);
  const statuses: readonly PageStatus[] = ['pending', 'live', 'answered', 'missed'];
  if (Array.isArray(o.pages)) {
    for (const p of o.pages as unknown[]) {
      if (typeof p !== 'object' || p === null) continue;
      const q = p as Record<string, unknown>;
      const incident = num(q.incident, -1);
      if (PAGE_INCIDENTS[incident] === undefined) continue;
      const status = statuses.find((x) => x === q.status) ?? 'pending';
      out.pages.push({ at: num(q.at, 0), incident, status, left: num(q.left, PAGE_WINDOW) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the rota

/**
 * The chance of being on call on a weekend you are eligible for (you were
 * not on call the weekend before). Half, at the bottom of the ladder: with
 * the rule against two in a row that is one weekend in three. The higher you
 * climb, the more often the pager is yours: about four in nine at the top.
 */
export function onCallChance(rung: number): number {
  return Math.min(0.85, 0.5 + Math.max(0, rung) * 0.03);
}

/** Each weekend's dice come from the save's seed, so reloading cannot reroll the rota. */
function weekRng(seed: number, week: number, salt: number): Rng {
  return new Rng(((seed ^ salt) + Math.imul(week, 0x9e3779b1)) >>> 0);
}

/** Are you on call the weekend of `week`? `lastWeek`: the last weekend you were. */
export function rollOnCall(seed: number, week: number, rung: number, lastWeek: number): boolean {
  if (week < ONCALL_FROM_WEEK || lastWeek === week - 1) return false;
  return weekRng(seed, week, 0x0ca11ed).next() < onCallChance(rung);
}

/**
 * The weekend's pages: one to three, each a different incident. The first
 * goes off within the first minute or so; each after it only once the one
 * before has been answered or missed, so the pager never has two live.
 */
export function pageSchedule(seed: number, week: number): Page[] {
  const r = weekRng(seed, week, 0x9a6e5);
  const n = r.int(1, 3);
  const incidents = r.shuffle(PAGE_INCIDENTS.map((_, i) => i)).slice(0, n);
  const out: Page[] = [];
  let at = r.range(25, 70);
  for (const incident of incidents) {
    out.push({ at: Math.round(at), incident, status: 'pending', left: PAGE_WINDOW });
    at += PAGE_WINDOW + r.range(20, 100);
  }
  return out;
}

/** Friday: the rota for this weekend, from last weekend's. */
export function startRota(seed: number, week: number, rung: number, prev: OnCallState): OnCallState {
  const active = rollOnCall(seed, week, rung, prev.lastWeek);
  return {
    week,
    active,
    lastWeek: active ? week : prev.lastWeek,
    clock: 0,
    pages: active ? pageSchedule(seed, week) : [],
    missed: 0,
  };
}

/** The page going off right now, if any. */
export function livePage(oc: OnCallState): Page | undefined {
  return oc.active ? oc.pages.find((p) => p.status === 'live') : undefined;
}

/** Count a missed page. True when this is the miss that makes it an HR warning (once a weekend). */
export function missPage(oc: OnCallState, p: Page): boolean {
  if (p.status === 'answered' || p.status === 'missed') return false;
  p.status = 'missed';
  p.left = 0;
  oc.missed += 1;
  return oc.missed === MISSES_FOR_WARNING;
}

export function answerPage(p: Page): void {
  if (p.status === 'live') p.status = 'answered';
}

/**
 * Play time passes at the mökki: pages go off when their moment comes, and
 * a live one whose window runs out is missed. `warn`: one of those misses
 * was the second of the weekend.
 */
export function advanceRota(oc: OnCallState, dt: number): { fired: Page[]; missed: Page[]; warn: boolean } {
  const fired: Page[] = [];
  const missed: Page[] = [];
  let warn = false;
  if (!oc.active) return { fired, missed, warn };
  oc.clock += dt;
  for (const p of oc.pages) {
    if (p.status === 'live') {
      p.left -= dt;
      if (p.left <= 0) {
        if (missPage(oc, p)) warn = true;
        missed.push(p);
      }
    } else if (p.status === 'pending' && oc.clock >= p.at) {
      p.status = 'live';
      p.left = PAGE_WINDOW;
      fired.push(p);
    }
  }
  return { fired, missed, warn };
}

// ---------------------------------------------------------------- answering

/** At or past Merry, you are answering a P1 drunk. */
export function drunkOnCall(band: Band): boolean {
  return band === 'merry' || band === 'hammered' || band === 'blackout';
}

/**
 * How much harder every fix is, by where the drink has you. The Ballmer Peak
 * is the one place it helps: the answer is suddenly, beautifully obvious.
 */
export function pageModifier(band: Band): number {
  switch (band) {
    case 'peak': return -15;
    case 'merry': return 20;
    case 'hammered': return 35;
    case 'blackout': return 50;
    default: return 0;
  }
}

/** How you deal with it: fix it properly, talk it down to a P3, or bodge it until Monday. */
export type PageFix = 'fix' | 'talk' | 'bodge';

/** Difficulty of the talk-down and the bodge; the proper fix depends on the incident. */
export const TALK_DIFFICULTY = 40;
export const BODGE_DIFFICULTY = 5;

/** A proper fix pays this much Rep (Pager Duty doubles it). */
export function pageRep(rung: number, pagerDuty: boolean): number {
  return Math.round((20 + salaryFor(rung) * 0.3) * (pagerDuty ? 2 : 1));
}

/** What an answered page pays on success, and the Management it costs on a failure. */
export function pagePay(fix: PageFix, rung: number, pagerDuty: boolean): { rep: number; management: number; fail: number } {
  const full = pageRep(rung, pagerDuty);
  switch (fix) {
    case 'fix': return { rep: full, management: 3, fail: -2 };
    case 'talk': return { rep: Math.round(full * 0.5), management: 2, fail: -3 };
    case 'bodge': return { rep: Math.round(full * 0.35), management: 1, fail: -1 };
  }
}

/** Management standing lost for a missed page. */
export const MISSED_PAGE_MANAGEMENT = -5;

// ---------------------------------------------------------------- incidents

export interface PageIncident {
  readonly id: string;
  /** What the pager says. */
  readonly title: string;
  /** What you find once you are logged on. */
  readonly detail: string;
  /** The proper fix: a skill check. */
  readonly fix: { readonly label: string; readonly skill: Skill; readonly attr: Attribute; readonly difficulty: number };
  /** Talking it down (Soft Skills). */
  readonly talk: string;
  /** The sticking plaster (an easy Troubleshooting check). */
  readonly bodge: string;
  /** How a proper fix ends. */
  readonly fixed: string;
}

export const PAGE_INCIDENTS: readonly PageIncident[] = [
  {
    id: 'payroll',
    title: 'Payroll is paying everyone one cent',
    detail: 'The Friday payroll batch fell over halfway and retried with the decimal point somewhere new. Two thousand people have been paid €0.01. Finance is typing in capitals.',
    fix: { label: 'Roll the batch back and rerun it with the right locale.', skill: 'scripting', attr: 'reflex', difficulty: 45 },
    talk: 'Tell Finance the cent was a "test transaction" and the real run is Monday.',
    bodge: 'Freeze payroll and email Finance "investigating".',
    fixed: 'The rerun lands at 23:40. Two thousand people get paid, and nobody ever knows how close it was.',
  },
  {
    id: 'yacht',
    title: 'The CEO\'s yacht has no Wi-Fi',
    detail: 'Sir Reginald is somewhere off Antibes and cannot reach his Candy Crush. The ticket says BUSINESS CRITICAL four times, once in the subject line.',
    fix: { label: 'Walk the deckhand through resetting the satellite router.', skill: 'troubleshooting', attr: 'tech', difficulty: 40 },
    talk: 'Explain, gently, that the Mediterranean is outside our SLA.',
    bodge: 'Get him tethered to the deckhand\'s phone.',
    fixed: 'The router blinks green. Sir Reginald sends a thumbs-up emoji, and the board hears about it.',
  },
  {
    id: 'printer',
    title: 'A printer is printing HELP',
    detail: 'The third-floor printer woke up at nine and has printed four thousand pages, each one saying HELP. Security wants to know whether it is a driver issue or a hostage situation.',
    fix: { label: 'Purge the spooler remotely and roll the driver back.', skill: 'troubleshooting', attr: 'tech', difficulty: 35 },
    talk: 'Convince Security it is an art installation until Monday.',
    bodge: 'Have Security pull the plug and put a bin bag over it.',
    fixed: 'The spooler empties with a sigh. The last page in the tray says THANK YOU.',
  },
  {
    id: 'cert',
    title: 'The certificate for everything expired',
    detail: 'Every internal site says NOT SECURE in red. The renewal reminders went to the mailbox of somebody who left in 2021. He has been getting them. He has been laughing.',
    fix: { label: 'Issue a new certificate and deploy it by hand.', skill: 'security', attr: 'tech', difficulty: 45 },
    talk: 'Talk the duty manager into calling the red padlocks "a known cosmetic issue".',
    bodge: 'Email everyone: click "Proceed anyway (unsafe)".',
    fixed: 'Green padlocks everywhere. You set a renewal reminder for next year, in three calendars.',
  },
  {
    id: 'dns',
    title: 'It is DNS',
    detail: 'Nothing resolves. The monitoring cannot tell you what is down, because the monitoring cannot resolve the monitoring. It is always DNS.',
    fix: { label: 'Find the zone file somebody "tidied" and restore it.', skill: 'troubleshooting', attr: 'tech', difficulty: 50 },
    talk: 'Persuade the incident bridge it is "a network thing" and hand it over.',
    bodge: 'Email everyone a hosts file with the six addresses that matter.',
    fixed: 'The zone comes back and the whole company resolves at once. It was DNS. It is always DNS.',
  },
  {
    id: 'chatbot',
    title: 'The HR chatbot is replying to the board',
    detail: 'The HR chatbot has joined the board\'s group chat and answers every message with "14 suggested articles" and a link to the resignation form. The chairman has clicked it once.',
    fix: { label: 'Revoke the bot\'s token and purge what it posted.', skill: 'scripting', attr: 'reflex', difficulty: 40 },
    talk: 'Tell the chairman it was a phishing-awareness exercise, and he passed.',
    bodge: 'Switch the whole Teams integration off until Monday.',
    fixed: 'The bot goes quiet mid-suggestion. The chairman\'s resignation, luckily, needed a second signature.',
  },
  {
    id: 'serverroom',
    title: 'The server room is at 41 degrees',
    detail: 'The air conditioning died, and somebody propped the door open with a desk fan pointing in. It is pointing out. The racks are screaming.',
    fix: { label: 'Talk Security through reseating the AC controller, then shed the test racks.', skill: 'hardware', attr: 'grit', difficulty: 40 },
    talk: 'Get Facilities to own it. It is, technically, a radiator.',
    bodge: 'Shut down everything with "test" in its name.',
    fixed: 'The AC coughs back to life. The racks stop screaming and go back to humming, which is how you like them.',
  },
  {
    id: 'replyall',
    title: 'Reply-all storm: 12,000 people',
    detail: 'Somebody emailed Everyone@ to ask whose Tupperware is in the fourth-floor fridge. Eleven thousand people have replied "please remove me from this list". Exchange is on its knees.',
    fix: { label: 'Write a transport rule that quarantines the thread.', skill: 'scripting', attr: 'reflex', difficulty: 45 },
    talk: 'Reply all, once, so calmly that everyone stops.',
    bodge: 'Pause mail for the whole company until Monday.',
    fixed: 'The storm dies in quarantine. The Tupperware is Jukka\'s. Of course it is.',
  },
  {
    id: 'coffee',
    title: 'The smart coffee machine joined a botnet',
    detail: 'The fourth-floor bean-to-cup is sending forty thousand requests a second to a bank in Tallinn and has stopped making coffee. The coffee is why it is a P1.',
    fix: { label: 'Put it on its own VLAN and reflash the firmware.', skill: 'security', attr: 'tech', difficulty: 40 },
    talk: 'Convince the duty manager that Monday can be a tea day.',
    bodge: 'Have Security unplug it and tape a sign to it.',
    fixed: 'Reflashed, quarantined and descaled for good measure. At 23:14 it makes one perfect espresso, for nobody.',
  },
  {
    id: 'lift',
    title: 'The lift is stuck in demo mode',
    detail: 'A firmware update rebooted the lift into showroom mode. It visits every floor, forever, doors open, playing the pan-pipes. Somebody is inside. It is Derek.',
    fix: { label: 'Roll the controller back over the maintenance modem.', skill: 'troubleshooting', attr: 'tech', difficulty: 50 },
    talk: 'Keep Derek calm on the phone until the lift engineer gets there.',
    bodge: 'Hit the fire-service override and send it to the ground floor.',
    fixed: 'The lift settles at the ground floor and the pan-pipes stop. Derek walks out and says nothing, the nicest thing he has ever said to you.',
  },
  {
    id: 'kiuas',
    title: 'The office sauna is stuck at 110 degrees',
    detail: 'The smart kiuas in the basement took a firmware update and a dislike to its thermostat. Finance\'s Friday löyly has become a trial by fire, and they are staying in out of pride.',
    fix: { label: 'Talk to the kiuas the old way, down the phone.', skill: 'runecraft', attr: 'liver', difficulty: 45 },
    talk: 'Talk Finance out of the sauna. Nobody has ever talked a Finn out of a sauna.',
    bodge: 'Trip the breaker for the whole basement.',
    fixed: 'The kiuas hisses, settles at a respectable 80, and Finance come out pink and grateful. The löyly spirits approve.',
  },
];
