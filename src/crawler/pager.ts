import { sfx } from './audio';
import type { CompassMarker } from './compass';
import { type DialogueNode, type DialogueOption, said } from './dialogue';
import type { Game } from './game';
import {
  advanceRota,
  answerPage,
  BODGE_DIFFICULTY,
  drunkOnCall,
  livePage,
  MISSED_PAGE_MANAGEMENT,
  missPage,
  ONCALL_FROM_WEEK,
  type Page,
  PAGE_INCIDENTS,
  PAGE_WINDOW,
  type PageFix,
  pageModifier,
  pagePay,
  pageSchedule,
  startRota,
  TALK_DIFFICULTY,
} from './oncall';
import { type Attribute, type Band, BAND_EFFECTS, type Faction, type Skill, SKILL_INFO } from './rpg';
import { adjustStanding, perk, type SaveState } from './state';

/**
 * The on-call weekend in the game: the rota read out on Friday, the pager
 * going off at the mökki, getting to a computer in time (the satellite
 * terminal, or the car and the village Wi-Fi), the fix, and what a missed
 * page costs. The rules themselves are in `oncall.ts`.
 */

/** What a page's conversation is allowed to do to the world. Game implements it. */
export interface PagerHost {
  readonly save: SaveState;
  /** Odds for a check, before rolling (persuasion bonuses included). */
  odds(skill: Skill, attr: Attribute, difficulty: number): number;
  /** Roll a check, exercising the skill. */
  check(skill: Skill, attr: Attribute, difficulty: number): boolean;
  standing(f: Faction, delta: number): void;
  addRep(n: number): void;
  journal(text: string): void;
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'epic'): void;
  achieve(id: string): void;
  /** Where the drink has you right now (the Koskenkorva Flask widens the peak). */
  drinkBand(): Band;
}

/** The journal, the first time you answer a page at Merry or worse. */
export const DRUNK_PAGE_LINE = 'I answered a P1 page three lonkeros in.';

/** Answered pages for Sleeps With The Pager. */
export const PAGER_ACHIEVEMENT_PAGES = 10;

const PAGER = '📟 PagerDuty';
const WARN_WHY = 'Missed two on-call pages in one weekend';

const pct = (p: number): string => `${Math.round(p * 100)}%`;

export type PageVia = 'terminal' | 'village';

// ================================================================== the conversation

/** Logged on, with the pager going: how do you deal with it? Every fix is a check. */
export function pageNode(h: PagerHost, page: Page, via: PageVia): DialogueNode {
  const inc = PAGE_INCIDENTS[page.incident];
  if (inc === undefined) return said(PAGER, 'The page has cleared itself. That never happens.', 'neutral');
  const band = h.drinkBand();
  const mod = pageModifier(band);
  const where = via === 'village'
    ? 'Twenty minutes of gravel later, in the K-Market car park, you hold the laptop out of the window for one bar of Wi-Fi.'
    : 'The satellite terminal in the cottage wakes up with a groan.';
  const drink = mod > 0
    ? ` The screen is swimming a little. (${BAND_EFFECTS[band].label}: every fix is ${mod} harder.)`
    : mod < 0 ? ` The Ballmer Peak: the answer is suddenly, beautifully obvious. (Every fix is ${-mod} easier.)` : '';
  const option = (label: string, fix: PageFix, skill: Skill, attr: Attribute, difficulty: number): DialogueOption => ({
    label,
    tag: `${SKILL_INFO[skill].name} ${pct(h.odds(skill, attr, difficulty + mod))}`,
    pick: () => settlePage(h, page, fix, () => h.check(skill, attr, difficulty + mod), band),
  });
  return {
    speaker: PAGER,
    subtitle: `P1 · ${inc.title}`,
    mood: 'bad',
    text: `${where} ${inc.detail}${drink}`,
    options: [
      option(inc.fix.label, 'fix', inc.fix.skill, inc.fix.attr, inc.fix.difficulty),
      option(inc.talk, 'talk', 'soft', 'charm', TALK_DIFFICULTY),
      option(inc.bodge, 'bodge', 'troubleshooting', 'tech', BODGE_DIFFICULTY),
    ],
  };
}

const FAILED: Record<PageFix, string> = {
  fix: 'You fix it, then it breaks, then you fix it again. By two in the morning it is up, and the post-mortem has your name in it twice.',
  talk: 'They do not buy it. You spend the evening on a bridge call explaining why you tried.',
  bodge: 'It does not hold. It falls over again at one in the morning, and so do you.',
};

const DONE: Record<Exclude<PageFix, 'fix'>, string> = {
  talk: 'They buy it. It is a P3 now, and P3s are Monday\'s problem.',
  bodge: 'It holds. It is not pretty, but it will hold until Monday.',
};

/** An option picked: the page is answered, whatever happens next. */
function settlePage(h: PagerHost, page: Page, fix: PageFix, roll: () => boolean, band: Band): DialogueNode {
  const s = h.save;
  const inc = PAGE_INCIDENTS[page.incident];
  if (page.status !== 'live' || inc === undefined) return said(PAGER, 'That page has already been dealt with.', 'neutral');
  answerPage(page);
  s.stats.pagesAnswered++;
  if (drunkOnCall(band) && s.flags.pagedDrunk !== true) {
    s.flags.pagedDrunk = true;
    h.journal(DRUNK_PAGE_LINE);
  }
  const ok = roll();
  const pay = pagePay(fix, s.rung, perk(s, 'pagerduty') > 0);
  if (ok) {
    h.addRep(pay.rep);
    h.standing('management', pay.management);
    h.toast(`📟 RESOLVED: ${inc.title}.`, 'good');
    h.journal(`On call: "${inc.title}" - ${fix === 'fix' ? 'fixed properly' : fix === 'talk' ? 'talked down to a P3' : 'bodged until Monday'}.`);
  } else {
    h.standing('management', pay.fail);
    h.journal(`On call: "${inc.title}" - answered, but it did not go well.`);
  }
  if (s.stats.pagesAnswered >= PAGER_ACHIEVEMENT_PAGES) h.achieve('pager');
  return said(PAGER, ok ? (fix === 'fix' ? inc.fixed : DONE[fix]) : FAILED[fix], ok ? 'good' : 'bad', 'Back to the weekend');
}

// ================================================================== the weekend

export function hasDish(g: Game): boolean {
  return g.save.upgrades.includes('satellite');
}

/** Friday, on arrival at the mökki: whose pager is it this weekend? */
export function startOnCall(g: Game): void {
  const s = g.save;
  s.oncall = startRota(s.seed, s.week, s.rung, s.oncall);
  if (s.oncall.active) {
    g.hud.toast('📟 ON CALL this weekend. The pager is charged. So is the guilt.', 'bad');
    g.journal(`Weekend ${s.week}: on call. The pager is on the bedside table, charging, watching me.`);
  } else if (s.week < ONCALL_FROM_WEEK) {
    g.hud.toast('Not on call: you are not on the rota yet.', 'good');
    g.journal(`Weekend ${s.week}: not on call. New starters are not on the rota yet.`);
  } else {
    g.hud.toast('Not on call this weekend. Somebody else\'s pager, somebody else\'s problem.', 'good');
    g.journal(`Weekend ${s.week}: not on call. Somebody else's pager, somebody else's problem.`);
  }
}

/** Monday: the rota is over. A page still going off as you drive away is a missed one. */
export function endOnCall(g: Game): void {
  abandonPage(g, 'I drove back to work with it still going off');
  g.save.oncall.active = false;
}

/** Play time at the mökki: pages go off, and windows run out. */
export function tickPager(g: Game, dt: number): void {
  const s = g.save;
  if (s.location !== 'mokki' || !s.oncall.active) return;
  const { fired, missed, warn } = advanceRota(s.oncall, dt);
  for (const p of fired) pageFired(g, p);
  for (const p of missed) pageMissed(g, p, 'Nobody got to a computer in time');
  if (warn) g.warn(WARN_WHY);
}

/** A live page you are in no state to answer (driving off, blacking out) is missed. */
export function abandonPage(g: Game, why: string): void {
  const oc = g.save.oncall;
  const p = livePage(oc);
  if (p === undefined) return;
  const warn = missPage(oc, p);
  pageMissed(g, p, why);
  if (warn) g.warn(WARN_WHY);
}

function pageFired(g: Game, p: Page): void {
  const title = PAGE_INCIDENTS[p.incident]?.title ?? 'P1';
  sfx.phone();
  g.hud.toast(`📟 PAGE: ${title}. ${PAGE_WINDOW} seconds to get to a computer (${hasDish(g) ? 'the terminal in the cottage' : 'no dish: take the car to the village Wi-Fi'}).`, 'bad');
  g.tip('pager');
  g.markersIn = 0;
}

function pageMissed(g: Game, p: Page, why: string): void {
  const s = g.save;
  const title = PAGE_INCIDENTS[p.incident]?.title ?? 'P1';
  adjustStanding(s, 'management', MISSED_PAGE_MANAGEMENT);
  s.stats.pagesMissed++;
  sfx.error();
  g.hud.toast(`📟 MISSED PAGE: ${title}. (Management ${MISSED_PAGE_MANAGEMENT})`, 'bad');
  g.journal(`Missed a page: "${title}". ${why}.`);
  g.markersIn = 0;
}

// ================================================================== getting to a computer

/** At the satellite terminal, a live page comes before anything else. True if it opened one. */
export function answerAtTerminal(g: Game): boolean {
  const p = g.save.location === 'mokki' ? livePage(g.save.oncall) : undefined;
  if (p === undefined) return false;
  g.openDialogue(pageNode(g, p, 'terminal'));
  return true;
}

/**
 * No dish, pager going: the village has Wi-Fi. Answering from the K-Market
 * car park costs the rest of the weekend's sauna and grill.
 */
export function villageOption(g: Game): DialogueOption | null {
  const s = g.save;
  const p = s.location === 'mokki' ? livePage(s.oncall) : undefined;
  if (p === undefined || hasDish(g)) return null;
  return {
    label: 'Drive to the village and find Wi-Fi.',
    tag: 'Answers the page; no more sauna or grill this weekend',
    pick: () => {
      s.weekend.saunas = Math.max(s.weekend.saunas, s.upgrades.includes('woodshed') ? 2 : 1);
      s.weekend.grill = true;
      g.saunaT = 0;
      g.journal('Drove to the village to answer a page from the K-Market car park. The sauna went cold and the grill went out without me.');
      return pageNode(g, p, 'village');
    },
  };
}

/** What the car says about the pager before you drive off. */
export function carNote(g: Game): string {
  const s = g.save;
  if (s.location !== 'mokki' || !s.oncall.active) return '';
  if (livePage(s.oncall) === undefined) return ' You are on call until you leave.';
  return hasDish(g)
    ? ' The pager is going off, and the terminal is in the cottage. Drive back to work now and it counts as missed.'
    : ' The pager is going off. The village has Wi-Fi, twenty minutes up the gravel. Drive back to work instead and it counts as missed.';
}

// ================================================================== what the HUD shows

export function pagerHud(g: Game): { text: string; alarm: boolean } | null {
  const s = g.save;
  if (s.location !== 'mokki' || !s.oncall.active) return null;
  const p = livePage(s.oncall);
  if (p === undefined) return { text: '📟 ON CALL', alarm: false };
  return { text: `📟 ON CALL · PAGE ${Math.max(0, Math.ceil(p.left))}s · ${hasDish(g) ? 'terminal in the cottage' : 'car → village Wi-Fi'}`, alarm: true };
}

/** The computer to run for, on the compass and the map. */
export function pagerMarkers(g: Game): CompassMarker[] {
  const s = g.save;
  if (s.location !== 'mokki' || livePage(s.oncall) === undefined) return [];
  const dish = hasDish(g);
  const it = g.level.interactables.find((i) => i.kind === (dish ? 'terminal' : 'car'));
  return it === undefined ? [] : [{ x: it.x, z: it.z, icon: '📟', color: '#ff5a4a', label: dish ? 'Answer the page' : 'The car (village Wi-Fi)' }];
}

/** Smoke tests and the curious: be on call, and have the next page go off now. */
export function pageNow(g: Game): boolean {
  const s = g.save;
  if (s.location !== 'mokki') return false;
  const oc = s.oncall;
  if (!oc.active || oc.week !== s.week) {
    s.oncall = { week: s.week, active: true, lastWeek: s.week, clock: 0, pages: pageSchedule(s.seed, s.week), missed: 0 };
  }
  if (livePage(s.oncall) !== undefined) return true;
  const next = s.oncall.pages.find((p) => p.status === 'pending');
  if (next === undefined) return false;
  s.oncall.clock = Math.max(s.oncall.clock, next.at);
  tickPager(g, 0);
  return true;
}
