import { describe, expect, it } from 'vitest';
import type { DialogueNode } from './dialogue';
import {
  advanceRota,
  answerPage,
  BODGE_DIFFICULTY,
  drunkOnCall,
  freshOnCall,
  livePage,
  MISSES_FOR_WARNING,
  missPage,
  normalizeOnCall,
  ONCALL_FROM_WEEK,
  onCallChance,
  type OnCallState,
  type Page,
  PAGE_INCIDENTS,
  PAGE_WINDOW,
  pageModifier,
  pagePay,
  pageRep,
  pageSchedule,
  rollOnCall,
  startRota,
  TALK_DIFFICULTY,
} from './oncall';
import { DRUNK_PAGE_LINE, PAGER_ACHIEVEMENT_PAGES, pageNode, type PagerHost } from './pager';
import { TREE_PERKS } from './perks';
import { type Attribute, type Band, bandFor, checkChance, type Faction, RUNG_COUNT, type Skill, SKILLS } from './rpg';
import { newSave, normalizeSave, type SaveState } from './state';
import { ACHIEVEMENTS } from './upgrades';

/** Every weekend of a career, from the first Friday: the rota as the game runs it. */
function career(seed: number, rung: number, weeks: number): boolean[] {
  let oc = freshOnCall();
  const out: boolean[] = [];
  for (let week = 1; week <= weeks; week++) {
    oc = startRota(seed, week, rung, oc);
    out.push(oc.active);
  }
  return out;
}

function rate(rung: number): number {
  let on = 0;
  let n = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const weeks = career(seed * 7919, rung, 40).slice(ONCALL_FROM_WEEK - 1);
    on += weeks.filter(Boolean).length;
    n += weeks.length;
  }
  return on / n;
}

/** A rota with a live page, as if the pager had just gone off. */
function paged(incident = 0): { oc: OnCallState; page: Page } {
  const page: Page = { at: 30, incident, status: 'live', left: PAGE_WINDOW };
  return { oc: { week: 3, active: true, lastWeek: 3, clock: 30, pages: [page], missed: 0 }, page };
}

/** The Game, reduced to what a page's conversation can touch. */
class FakeHost implements PagerHost {
  readonly save: SaveState = newSave(42);
  band: Band = 'sober';
  succeed = true;
  asked: number[] = [];
  rep = 0;
  standings: [Faction, number][] = [];
  journals: string[] = [];
  achieved: string[] = [];
  odds(skill: Skill, attr: Attribute, difficulty: number): number {
    this.asked.push(difficulty);
    return checkChance(this.save.skills[skill].value, this.save.attrs[attr], difficulty);
  }
  check(): boolean { return this.succeed; }
  standing(f: Faction, delta: number): void { this.standings.push([f, delta]); }
  addRep(n: number): void { this.rep += n; }
  journal(text: string): void { this.journals.push(text); }
  toast(): void { /* nobody is watching */ }
  achieve(id: string): void { this.achieved.push(id); }
  drinkBand(): Band { return this.band; }
}

function pick(node: DialogueNode, i: number): DialogueNode | null {
  const o = node.options[i];
  if (o === undefined) throw new Error(`no option ${i}`);
  return o.pick();
}

describe('Helldesk on call: the rota', () => {
  it('nobody is on call their first weekend, and the rota is the same after a reload', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let rung = 0; rung < RUNG_COUNT; rung++) expect(rollOnCall(seed, 1, rung, -1), `seed ${seed} rung ${rung}`).toBe(false);
      expect(career(seed, 3, 30)).toEqual(career(seed, 3, 30));
    }
    expect(ONCALL_FROM_WEEK).toBe(2);
  });

  it('is never on call two weekends in a row', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const rung of [0, 6, 11]) {
        const weeks = career(seed * 31, rung, 50);
        weeks.forEach((on, i) => { if (i > 0 && on) expect(weeks[i - 1], `seed ${seed} rung ${rung} week ${i + 1}`).toBe(false); });
      }
    }
    // Even a sure thing waits a week.
    expect(rollOnCall(5, 8, RUNG_COUNT - 1, 7)).toBe(false);
  });

  it('is about one weekend in three from the second week, and more often up the ladder', () => {
    const bottom = rate(0);
    const top = rate(RUNG_COUNT - 1);
    expect(bottom).toBeGreaterThan(0.29);
    expect(bottom).toBeLessThan(0.38);
    expect(top).toBeGreaterThan(bottom + 0.06);
    expect(top).toBeLessThanOrEqual(0.5);
    for (let r = 1; r < RUNG_COUNT; r++) expect(onCallChance(r)).toBeGreaterThanOrEqual(onCallChance(r - 1));
    expect(onCallChance(0)).toBeCloseTo(0.5, 5);
  });

  it('a weekend off has no pages, and remembers the last weekend on', () => {
    const prev = { ...freshOnCall(), lastWeek: 4 };
    const off = startRota(1, 5, 0, prev);
    expect(off.active).toBe(false);
    expect(off.pages).toEqual([]);
    expect(off.lastWeek).toBe(4);
  });
});

describe('Helldesk on call: the pages', () => {
  it('one to three a weekend, all different, the first early and never two going off at once', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      for (let week = 2; week <= 12; week++) {
        const pages = pageSchedule(seed, week);
        counts.add(pages.length);
        expect(pages.length).toBeGreaterThanOrEqual(1);
        expect(pages.length).toBeLessThanOrEqual(3);
        expect(new Set(pages.map((p) => p.incident)).size).toBe(pages.length);
        for (const p of pages) {
          expect(PAGE_INCIDENTS[p.incident]).toBeDefined();
          expect(p.status).toBe('pending');
          expect(p.left).toBe(PAGE_WINDOW);
        }
        expect(pages[0]?.at ?? 0).toBeGreaterThanOrEqual(25);
        expect(pages[0]?.at ?? 99).toBeLessThanOrEqual(70);
        // The next one only goes off once the window on the last has closed.
        for (let i = 1; i < pages.length; i++) expect((pages[i]?.at ?? 0) - (pages[i - 1]?.at ?? 0)).toBeGreaterThan(PAGE_WINDOW);
        expect(pageSchedule(seed, week)).toEqual(pages);
      }
    }
    expect([...counts].sort()).toEqual([1, 2, 3]);
  });

  it('play time sets pages off, and a window left to run out is a missed page', () => {
    const oc: OnCallState = { ...freshOnCall(), week: 2, active: true, lastWeek: 2, pages: pageSchedule(99, 2) };
    const first = oc.pages[0];
    if (first === undefined) throw new Error('no page');
    let fired = 0;
    let t = 0;
    while (first.status === 'pending') {
      const out = advanceRota(oc, 0.5);
      t += 0.5;
      fired += out.fired.length;
      expect(oc.pages.filter((p) => p.status === 'live').length).toBeLessThanOrEqual(1);
    }
    expect(fired).toBe(1);
    expect(t).toBeGreaterThanOrEqual(first.at);
    expect(t).toBeLessThan(first.at + 0.5 + 1e-9);
    expect(livePage(oc)).toBe(first);
    // Answer nothing: 90 seconds later it is gone.
    advanceRota(oc, PAGE_WINDOW - 1);
    expect(first.status).toBe('live');
    const out = advanceRota(oc, 1.01);
    expect(out.missed).toEqual([first]);
    expect(first.status).toBe('missed');
    expect(oc.missed).toBe(1);
    // Off the rota, nothing moves.
    const off = { ...freshOnCall(), pages: pageSchedule(99, 2) };
    advanceRota(off, 1000);
    expect(off.clock).toBe(0);
    expect(off.pages.every((p) => p.status === 'pending')).toBe(true);
  });

  it('an answered page stops the clock', () => {
    const { oc, page } = paged();
    answerPage(page);
    const out = advanceRota(oc, PAGE_WINDOW * 3);
    expect(out.missed).toEqual([]);
    expect(page.status).toBe('answered');
    expect(livePage(oc)).toBeUndefined();
  });

  it('two missed pages in one weekend is one HR warning', () => {
    expect(MISSES_FOR_WARNING).toBe(2);
    const oc: OnCallState = { ...freshOnCall(), active: true, pages: [0, 1, 2].map((incident) => ({ at: 0, incident, status: 'live' as const, left: 1 })) };
    const [a, b, c] = oc.pages;
    if (a === undefined || b === undefined || c === undefined) throw new Error('pages');
    expect(missPage(oc, a)).toBe(false);
    // Missing the same page twice counts once.
    expect(missPage(oc, a)).toBe(false);
    expect(oc.missed).toBe(1);
    expect(missPage(oc, b)).toBe(true);
    expect(missPage(oc, c)).toBe(false);
    expect(oc.missed).toBe(3);
    // An answered page cannot be missed afterwards.
    const { oc: oc2, page } = paged();
    answerPage(page);
    expect(missPage(oc2, page)).toBe(false);
    expect(oc2.missed).toBe(0);
    // The clock running out on the second is the warning.
    const timed: OnCallState = { ...freshOnCall(), active: true, missed: 1, pages: [{ at: 0, incident: 3, status: 'live', left: 2 }] };
    expect(advanceRota(timed, 1).warn).toBe(false);
    expect(advanceRota(timed, 1.5).warn).toBe(true);
  });
});

describe('Helldesk on call: answering', () => {
  it('past Merry every fix is harder; on the Ballmer Peak every fix is easier', () => {
    expect(pageModifier('sober')).toBe(0);
    expect(pageModifier('tipsy')).toBe(0);
    expect(pageModifier('peak')).toBeLessThan(0);
    expect(pageModifier('merry')).toBeGreaterThan(0);
    expect(pageModifier('hammered')).toBeGreaterThan(pageModifier('merry'));
    expect(pageModifier('blackout')).toBeGreaterThan(pageModifier('hammered'));
    expect(['sober', 'tipsy', 'peak', 'merry', 'hammered', 'blackout'].map((b) => drunkOnCall(b as Band))).toEqual([false, false, false, true, true, true]);
    expect(drunkOnCall(bandFor(42))).toBe(true);
    expect(drunkOnCall(bandFor(41, true))).toBe(false);

    const difficulties = (band: Band): number[] => {
      const h = new FakeHost();
      h.band = band;
      pageNode(h, paged(2).page, 'terminal');
      return h.asked;
    };
    const sober = difficulties('sober');
    expect(sober).toHaveLength(3);
    const inc = PAGE_INCIDENTS[2];
    expect(sober).toEqual([inc?.fix.difficulty, TALK_DIFFICULTY, BODGE_DIFFICULTY]);
    expect(difficulties('merry')).toEqual(sober.map((d) => d + pageModifier('merry')));
    expect(difficulties('hammered')).toEqual(sober.map((d) => d + pageModifier('hammered')));
    expect(difficulties('peak')).toEqual(sober.map((d) => d + pageModifier('peak')));
  });

  it('the first page answered three lonkeros in goes in the journal, once', () => {
    const h = new FakeHost();
    h.band = 'merry';
    pick(pageNode(h, paged(0).page, 'terminal'), 0);
    expect(h.journals.filter((j) => j === DRUNK_PAGE_LINE)).toHaveLength(1);
    expect(DRUNK_PAGE_LINE).toBe('I answered a P1 page three lonkeros in.');
    pick(pageNode(h, paged(1).page, 'village'), 1);
    expect(h.journals.filter((j) => j === DRUNK_PAGE_LINE)).toHaveLength(1);
    // Sober, or on the peak, it never comes up.
    for (const band of ['sober', 'peak'] as const) {
      const s = new FakeHost();
      s.band = band;
      pick(pageNode(s, paged(0).page, 'terminal'), 2);
      expect(s.journals).not.toContain(DRUNK_PAGE_LINE);
    }
  });

  it('a fix pays Rep and Management, a failure costs Management, and Pager Duty doubles the Rep', () => {
    const h = new FakeHost();
    h.save.rung = 5;
    const { page } = paged(4);
    expect(pick(pageNode(h, page, 'terminal'), 0)?.mood).toBe('good');
    expect(page.status).toBe('answered');
    expect(h.save.stats.pagesAnswered).toBe(1);
    expect(h.rep).toBe(pageRep(5, false));
    expect(h.standings).toEqual([['management', 3]]);
    // Picking again from a stale window does nothing.
    expect(pick(pageNode(h, page, 'terminal'), 0)?.mood).toBe('neutral');
    expect(h.save.stats.pagesAnswered).toBe(1);

    const f = new FakeHost();
    f.succeed = false;
    for (const i of [0, 1, 2]) pick(pageNode(f, paged(i).page, 'terminal'), i);
    expect(f.rep).toBe(0);
    expect(f.standings.every(([fac, d]) => fac === 'management' && d < 0)).toBe(true);
    expect(f.save.stats.pagesAnswered).toBe(3);

    for (const fix of ['fix', 'talk', 'bodge'] as const) {
      const plain = pagePay(fix, 3, false);
      const duty = pagePay(fix, 3, true);
      expect(plain.rep).toBeGreaterThan(0);
      expect(plain.management).toBeGreaterThan(0);
      expect(plain.fail).toBeLessThan(0);
      expect(duty.rep).toBeGreaterThanOrEqual(plain.rep * 2 - 1);
      expect(duty.rep).toBeLessThanOrEqual(plain.rep * 2 + 1);
    }
    expect(pagePay('fix', 0, false).rep).toBeGreaterThan(pagePay('talk', 0, false).rep);
    expect(pagePay('talk', 0, false).rep).toBeGreaterThan(pagePay('bodge', 0, false).rep);
    expect(pageRep(RUNG_COUNT - 1, false)).toBeGreaterThan(pageRep(0, false));
    const d = new FakeHost();
    d.save.perks.pagerduty = 1;
    pick(pageNode(d, paged().page, 'terminal'), 0);
    expect(d.rep).toBe(pageRep(0, true));
    expect(d.rep).toBe(pageRep(0, false) * 2);
  });

  it('the tenth answered page is Sleeps With The Pager', () => {
    const h = new FakeHost();
    for (let i = 0; i < PAGER_ACHIEVEMENT_PAGES; i++) {
      pick(pageNode(h, paged(i % PAGE_INCIDENTS.length).page, 'terminal'), 2);
      expect(h.achieved.includes('pager')).toBe(i === PAGER_ACHIEVEMENT_PAGES - 1);
    }
    expect(PAGER_ACHIEVEMENT_PAGES).toBe(10);
  });
});

describe('Helldesk on call: content and saves', () => {
  it('enough incidents, every fix a real skill check, and the perk and achievement exist', () => {
    expect(PAGE_INCIDENTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PAGE_INCIDENTS.map((i) => i.id)).size).toBe(PAGE_INCIDENTS.length);
    for (const inc of PAGE_INCIDENTS) {
      expect((SKILLS as readonly string[]).includes(inc.fix.skill), inc.id).toBe(true);
      expect(inc.fix.difficulty).toBeGreaterThan(BODGE_DIFFICULTY);
      for (const text of [inc.title, inc.detail, inc.fix.label, inc.talk, inc.bodge, inc.fixed]) expect(text.length, inc.id).toBeGreaterThan(8);
    }
    const perk = TREE_PERKS.find((p) => p.id === 'pagerduty');
    expect(perk?.name).toBe('Pager Duty');
    expect(perk?.tree).toBeNull();
    expect(perk?.earned).toBeUndefined();
    expect(ACHIEVEMENTS.find((a) => a.id === 'pager')?.name).toBe('Sleeps With The Pager');
  });

  it('an old save without the rota loads with it off, and a live page survives a save and reload', () => {
    const s = newSave(11);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.oncall;
    const oldStats = old.stats as Record<string, unknown>;
    delete oldStats.pagesAnswered;
    delete oldStats.pagesMissed;
    const loaded = normalizeSave(old);
    expect(loaded?.oncall).toEqual(freshOnCall());
    expect(loaded?.stats.pagesAnswered).toBe(0);
    expect(loaded?.stats.pagesMissed).toBe(0);

    // Mid-weekend: one page answered, one going off with 41 seconds left, one still to come.
    s.location = 'mokki';
    s.week = 4;
    s.oncall = { week: 4, active: true, lastWeek: 4, clock: 212.5, missed: 0, pages: [
      { at: 40, incident: 1, status: 'answered', left: PAGE_WINDOW },
      { at: 164, incident: 5, status: 'live', left: 41.5 },
      { at: 300, incident: 7, status: 'pending', left: PAGE_WINDOW },
    ] };
    s.stats.pagesAnswered = 3;
    s.flags.pagedDrunk = true;
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back?.oncall).toEqual(s.oncall);
    expect(back?.stats.pagesAnswered).toBe(3);
    expect(back?.flags.pagedDrunk).toBe(true);
    expect(back === null ? undefined : livePage(back.oncall)?.left).toBe(41.5);
  });

  it('a damaged rota is repaired, not trusted', () => {
    const r = normalizeOnCall({ active: true, week: 'x', clock: Number.NaN, pages: [null, { incident: 999 }, { incident: 2, status: 'weird', at: 10 }] });
    expect(r.active).toBe(true);
    expect(r.week).toBe(0);
    expect(r.clock).toBe(0);
    expect(r.pages).toEqual([{ at: 10, incident: 2, status: 'pending', left: PAGE_WINDOW }]);
    expect(normalizeOnCall(undefined)).toEqual(freshOnCall());
  });
});
