import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveActor, standBeforeActor } from './combat';
import { deal, deckCard, FLOOR_P1, handIds, payRate } from './deck';
import { liftTo, pickUp, withDeck } from './deckplay';
import type { Actor } from './entities';
import type { Game } from './game';
import { DT, type Headless, headless, lift, newCareer, press } from './headlessgame';
import { HUB_GRACE, workstationOf } from './hub';
import { interact, standAt, standBy } from './interact';
import { generateLevel, type LevelRecipe } from './level';
import { levelPrint } from './levelprint';
import { questLines, questMarkers } from './questing';
import { readSlot } from './saves';
import { derive, normalizeSave, workload } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./mokki', async (orig) => {
  const mod = await orig<typeof import('./mokki')>();
  return { ...mod, generateMokki: (seed: number, _headless?: boolean, upgrades?: readonly string[]) => mod.generateMokki(seed, true, upgrades) };
});
vi.mock('./vision', async (orig) => ({ ...await orig<typeof import('./vision')>(), Vision: class { update(): null { return null; } } }));
vi.mock('./screens', async (orig) => ({
  ...await orig<typeof import('./screens')>(),
  showLoading: (_g: Game, _line: string, work: () => void) => work(),
  transitionTo: (_g: Game, _label: string, _big: string, _line: string, then: () => void) => then(),
}));

/**
 * The workstation and the weekly deck (docs/SPEC_HELLDESK_030_S1.md, S1b
 * gates 2, 4, 5 and 6) on the real Game, frame by frame through the
 * production loop (headlessgame.ts): the deal on Monday, your desk, taking
 * and turning down cards, a card handed over in person, the lift to a card
 * and back, after hours, a failed card's consequences on the hub, and a
 * reload mid-mission. The deal itself is deck.test.ts.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function slots(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
  return m;
}

/** A DOM just big enough for the burnout screen: its buttons can be pressed. */
function dom(): { press(label: RegExp): void } {
  const made: { textContent: string; click?: (e: unknown) => void }[] = [];
  const element = (): Record<string, unknown> => {
    const el: Record<string, unknown> = {
      className: '', textContent: '', style: {}, outerHTML: '', classList: { toggle: () => undefined, add: () => undefined },
      append: () => undefined, setAttribute: () => undefined, querySelector: () => null, replaceChildren: () => undefined, getContext: () => null,
      addEventListener: (_t: string, fn: (e: unknown) => void) => { el.click = fn; },
    };
    made.push(el as { textContent: string; click?: (e: unknown) => void });
    return el;
  };
  vi.stubGlobal('document', { createElement: element });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 0; });
  vi.stubGlobal('window', { setTimeout: (fn: () => void) => { fn(); return 0; } });
  return {
    press: (label: RegExp): void => {
      const b = made.find((x) => label.test(x.textContent) && x.click !== undefined);
      if (b === undefined) throw new Error(`no button ${String(label)}`);
      b.click?.({ stopPropagation: () => undefined });
    },
  };
}

const index = (h: Headless, id: string): number => h.g.save.deck.cards.findIndex((c) => c.id === id);

/** E on the hub's lift, and the card's button; the briefing taken. */
function upTo(h: Headless, id: string): void {
  const card = deckCard({ id })!;
  const labels = press(h, lift(h.g));
  expect(labels, 'the lift lists the card').toContain(`${card.title} (${card.place})`);
  h.pick(`${card.title} (${card.place})`);
  expect(h.g.save.location).toBe('mission');
  expect(h.g.mission?.card.id).toBe(id);
  expect(h.dialogues.at(-1)?.text, 'the briefing names the alarm rule').toContain('The alarm:');
  h.pick('Take the card');
}

const giver = (h: Headless, name: string): Actor | undefined => h.g.actors.find((a) => a.name === name && !a.resolved);

describe('gate 2: your workstation, and taking cards on', () => {
  it('Monday deals the week\'s deck (the P1 on it), next Monday deals another hand, and a save from before the deck gets one on load', () => {
    const h = newCareer();
    const s = h.g.save;
    expect(s.deck.week).toBe(1);
    expect(s.deck.cards[0]).toMatchObject({ id: FLOOR_P1, p1: true, state: 'accepted' });
    expect(s.deck).toEqual(deal({ careerSeed: s.seed, week: 1, floor: 0, rung: 0, previous: [], exclude: h.g.deckExclude() }));
    const before = handIds(s.deck);
    s.week = 2;
    h.g.startWeek(1);
    h.g.loadHub(false, true);
    expect(s.deck.week).toBe(2);
    expect(new Set(handIds(s.deck)), 'never last week\'s hand').not.toEqual(new Set(before));
    // A v4 save from before the deck.
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete raw.deck;
    const old = headless(normalizeSave(raw)!);
    old.g.loadWorld(true);
    expect(old.g.save.deck.week).toBe(2);
    expect(old.g.save.deck.cards.some((c) => c.p1)).toBe(true);
  });

  it('one desk of the hub is yours, the same every load and marked on the map; its computer opens the week\'s deck, every other the queue', () => {
    const h = newCareer();
    const g = h.g;
    const desk = workstationOf(g.level)!;
    expect(desk, 'a workstation').toBeDefined();
    expect(g.level.rooms[desk.room]?.kind, 'at a desk in an open-plan room').toBe('cubicles');
    const again = headless(normalizeSave(JSON.parse(JSON.stringify(g.save)))!);
    again.g.loadWorld(true);
    expect(workstationOf(again.g.level)?.id, 'the same desk after a reload').toBe(desk.id);
    expect(questMarkers(g).find((m) => m.label === 'Your desk'), 'on the map').toMatchObject({ x: desk.x, z: desk.z, mapLabel: 'YOUR DESK' });
    const open = vi.fn();
    (g.os as unknown as { open: typeof open }).open = open;
    expect(standBy(g, desk)).toBe(true);
    interact(g);
    expect(open).toHaveBeenLastCalledWith('desk', 'projects');
    expect(g.atWorkstation()).toBe(true);
    g.screen = 'play';
    // Any other computer: the queue, as always.
    expect(standAt(g, 'terminal')).toBe(true);
    expect(g.promptTarget?.kind === 'interact' && g.promptTarget.it.id).not.toBe(desk.id);
    interact(g);
    expect(open).toHaveBeenLastCalledWith('desk', undefined);
    expect(g.atWorkstation()).toBe(false);
  });

  it('the workstation shows each card: giver, size, style, band, pay, deadline, after hours and the alarm rule in words', () => {
    const h = newCareer();
    withDeck(h, [{ id: 'stapler', alarm: 'search' }, { id: 'postits', afterHours: true }, { id: 'vendor', alarm: 'cooldown' }]);
    const views = h.g.deckViews();
    expect(views[0]).toMatchObject({ p1: true, title: 'Floor B1: the major incident (Derek)', afterHours: false, deadline: 'before Friday (it unlocks Friday)' });
    expect(views[1]).toMatchObject({ title: 'The Red Stapler, Recovered', giver: 'Milton (Basement)', coworker: true, size: 'Task', style: 'Sneaky', band: 'Helpdesk', deadline: 'Friday', rule: 'Lose them and they search, then give up.', state: 'offered' });
    expect(views[1]?.pay).toBe('₡120, +₡48 and Management +3, Staff +2 if nobody notices');
    expect(views[2]).toMatchObject({ giver: 'Priya (InfoSec)', afterHours: true, rule: 'Lose them and they search, then give up.' });
    expect(views[2]?.pay, 'Priya pays half again after hours').toContain('₡165');
    expect(views[3]).toMatchObject({ giver: 'Procurement', coworker: false, style: 'Loud', band: 'Specialist', rule: 'It blows over.' });
  });

  it('accepted cards count toward workload capacity; over it, today\'s overload penalties; and the lift goes to each', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler' }, { id: 'postits' }, { id: 'phishing' }, { id: 'josh' }]);
    const cap = workload(g.save).capacity;
    expect(cap).toBe(3);
    expect(workload(g.save).active).toBe(0);
    const fresh = derive(g.save).maxSanity;
    for (const [k, id] of ['stapler', 'postits', 'phishing'].entries()) {
      expect(g.acceptCard(index(h, id)).ok).toBe(true);
      expect(workload(g.save).active, `${id} on the plate`).toBe(k + 1);
    }
    expect(derive(g.save).overload).toBe(0);
    expect(questLines(g)[0]).toBe('Workload 3/3');
    expect(g.acceptCard(index(h, 'josh')).ok, 'over capacity is still yours to take').toBe(true);
    expect(derive(g.save).overload).toBe(1);
    expect(derive(g.save).maxSanity, 'and it wears you down').toBeLessThan(fresh);
    expect(questLines(g)[0]).toBe('⚠ OVERALLOCATED 4/3');
    const labels = press(h, lift(g));
    expect(labels).toEqual(['Floor B1: the major incident', 'The Red Stapler, Recovered (HR corridor)', 'Password Hygiene Week (HR corridor)', 'Phishing Test Debrief (Meeting ring)', 'Josh\'s First Day, Again (The annex)', 'Not yet.']);
    h.pick('Not yet.');
    // The P1 was never on the plate to choose.
    expect(workload(g.save).active).toBe(4);
  });

  it('declining a coworker\'s card costs a little standing with that coworker, and with nobody else', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler' }, { id: 'phishing' }, { id: 'vendor' }]);
    const standing = { ...g.save.standing };
    expect(g.declineCard(index(h, 'stapler')).ok).toBe(true);
    expect(g.save.rapport).toEqual({ milton: -2 });
    expect(g.save.standing, 'no faction moves').toEqual(standing);
    expect(g.save.deck.cards[index(h, 'stapler')]?.state).toBe('declined');
    // A department's card: nobody to let down.
    expect(g.declineCard(index(h, 'vendor')).ok).toBe(true);
    expect(g.save.rapport).toEqual({ milton: -2 });
    expect(g.save.standing).toEqual(standing);
    // Gone from the board and the lift.
    expect(g.deckViews().find((v) => v.id === 'stapler')?.state).toBe('declined');
    expect(press(h, lift(g))).toEqual(['Floor B1: the major incident', 'Not yet.']);
  });

  it('a card handed over in person: only its giver offers it ("!" over them); the workstation says to ask them', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', inPerson: true }, { id: 'phishing' }]);
    const i = index(h, 'stapler');
    expect(g.cardView(i).inPerson).toBe(true);
    expect(g.acceptCard(i)).toEqual({ ok: false, text: 'Ask Milton (Basement): it is theirs to hand over.' });
    expect(g.declineCard(i).ok).toBe(false);
    expect(g.save.deck.cards[i]?.state).toBe('offered');
    const milton = giver(h, 'Milton (Basement)')!;
    const priya = giver(h, 'Priya (InfoSec)')!;
    expect(milton, 'the giver is on the hub').toBeDefined();
    expect(priya).toBeDefined();
    expect(milton.marker, 'a "!" over Milton').not.toBeNull();
    expect(priya.marker, 'nothing to hand over in person').toBeNull();
    expect(questMarkers(g).some((m) => m.label === 'Milton (Basement) (a card)')).toBe(true);
    // Somebody else: no card from them.
    g.promptTarget = { kind: 'actor', a: priya };
    interact(g);
    expect(h.dialogues.at(-1)?.options.map((o) => o.label)).toEqual(['Back to work']);
    h.pick('Back to work');
    // Milton: the card, taken from him.
    g.promptTarget = { kind: 'actor', a: milton };
    interact(g);
    const offer = h.dialogues.at(-1)!;
    expect(offer.subtitle).toBe('Task: #1 The Red Stapler, Recovered');
    expect(offer.text).toContain('Once they know, they know.');
    expect(offer.options.map((o) => o.label)).toEqual(['Leave it with me.', 'Not this week, sorry.', 'Let me think about it.']);
    h.pick('Leave it with me.');
    expect(g.save.deck.cards[i]?.state).toBe('accepted');
    expect(milton.marker, 'nothing left to hand over').toBeNull();
    h.pick(/./);
    expect(press(h, lift(g))).toContain('The Red Stapler, Recovered (HR corridor)');
  });
});

describe('the lift as mission select', () => {
  it('up to a card, its map and briefing; Abort keeps it on the board; Finish pays it and closes it; back on the hub each time', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits' }]);
    g.acceptCard(index(h, 'postits'));
    upTo(h, 'postits');
    expect(g.level.recipe?.id).toBe('officeRow');
    expect(h.missionHud?.rule, 'the HUD prints the rule').toBe('Lose them and they search, then give up.');
    // Not done: the lift offers Abort, and the card stays on the board.
    expect(press(h, lift(g))).toEqual(['Abort: back to the hub (the card stays on the board until Friday)', 'Not yet.']);
    h.pick(/^Abort/);
    expect(h.results?.head).toBe('CARD ABORTED');
    h.results!.buttons.get('Back to the hub')!();
    expect(g.save.location).toBe('hub');
    expect(g.save.deck.cards[index(h, 'postits')]?.state, 'still on the board').toBe('accepted');
    // Again, as it was left, and this time done.
    liftTo(h, 'postits');
    expect(h.toasts.at(-1)).toBe('Password Hygiene Week: as you left it.');
    pickUp(h, 8);
    expect(g.mission?.run.objectiveDone).toBe(true);
    const rep = g.save.rep;
    expect(press(h, lift(g))).toEqual(['Finish: close the card', 'Not yet.']);
    h.pick('Finish: close the card');
    expect(h.results?.head).toBe('CARD CLOSED');
    expect(g.save.rep - rep, 'the card paid').toBeGreaterThanOrEqual(110);
    expect(g.save.deck.cards[index(h, 'postits')]?.state).toBe('done');
    expect(g.save.location, 'the books are the hub\'s already').toBe('hub');
    h.results!.buttons.get('Back to the hub')!();
    expect(g.hub).not.toBeNull();
    expect(press(h, lift(g))).toEqual(['Floor B1: the major incident', 'Not yet.']);
  });
});

describe('gate 4: after hours', () => {
  it('half the crowd (the card\'s own people kept), the lights down, and the giver\'s after-hours pay', () => {
    const run = (afterHours: boolean): { crowd: Actor[]; essential: number; hemi: number; h: Headless } => {
      const h = newCareer();
      withDeck(h, [{ id: 'postits', afterHours }]);
      h.g.acceptCard(index(h, 'postits'));
      upTo(h, 'postits');
      const m = h.g.mission!;
      return { crowd: [...m.crowd], essential: m.specs.filter((s) => s.tag !== undefined).length, hemi: h.g.hemi.intensity, h };
    };
    const day = run(false);
    const night = run(true);
    const extras = (r: typeof day): number => r.crowd.length - r.essential;
    expect(day.essential).toBeGreaterThan(0);
    expect(night.essential, 'the card\'s own people are all there').toBe(day.essential);
    expect(extras(night), 'half the rest').toBe(Math.ceil(extras(day) / 2));
    expect(night.hemi / day.hemi, 'the lights down').toBeCloseTo(0.4, 5);
    expect(night.h.g.mission?.lightScale).toBe(0.4);
    expect(day.h.g.mission?.lightScale).toBe(1);
    // Paid at Priya's after-hours rate.
    const g = night.h.g;
    expect(payRate(g.save.deck.cards[index(night.h, 'postits')]!)).toBe(1.5);
    pickUp(night.h, 8);
    const rep = g.save.rep;
    press(night.h, lift(g));
    night.h.pick('Finish: close the card');
    const paid = g.save.rep - rep;
    expect(night.h.results?.rows.get('After hours')).toBe('pay x1.5');
    expect(paid === 165 || paid === 165 + 66, `the card at x1.5 (and its quiet bonus at x1.5): ${paid}`).toBe(true);
  });
});

describe('gate 5: a failed coworker card turns that coworker on the hub, announced', () => {
  it('burned out on Milton\'s card: the card has failed, its standing paid; back on the hub Milton is after you, said first, and no swing for 1.5 s', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler' }]);
    g.acceptCard(index(h, 'stapler'));
    upTo(h, 'stapler');
    const page = dom();
    const mgmt = g.save.standing.management;
    g.save.sanity = 0;
    g.checkBurnout();
    expect(g.screen).toBe('dead');
    expect(g.save.deck.cards[index(h, 'stapler')]?.state).toBe('failed');
    // The card's own standing loss and the burnout's.
    expect(g.save.standing.management).toBe(mgmt - 2 - 5);
    expect(g.save.rapport.milton).toBe(-5);
    expect(h.toasts.some((t) => t.startsWith('Card failed: The Red Stapler, Recovered.'))).toBe(true);
    h.toasts.length = 0;
    page.press(/Clock back in/);
    vi.unstubAllGlobals();
    slots();
    expect(g.save.location, 'you wake on the hub').toBe('hub');
    const milton = giver(h, 'Milton (Basement)')!;
    expect(milton.hostile).toBe(true);
    expect(h.toasts.some((t) => t.includes('Milton (Basement)') && t.includes('heard how "The Red Stapler, Recovered" went'))).toBe(true);
    expect(milton.bubble, 'he says so').not.toBeNull();
    expect(milton.marker, 'the "!"').not.toBeNull();
    expect(g.save.hub.hostile).toEqual([{ spawnIndex: milton.spawnIndex, reason: 'failed' }]);
    // Nobody else.
    expect(g.actors.filter((a) => a.hostile && !a.resolved)).toEqual([milton]);
    // No swing for HUB_GRACE seconds, and then it is a fight.
    standBeforeActor(g, milton, 1.5);
    const t0 = g.time;
    const before = h.hurts.length;
    for (let t = 0; t < 20 && h.hurts.length === before; t += DT) h.run(DT, () => { if (Math.hypot(milton.pos.x - g.player.pos.x, milton.pos.z - g.player.pos.z) > 2.5) standBeforeActor(g, milton, 1.5); });
    expect(h.hurts.length, 'he comes after you').toBeGreaterThan(before);
    expect((h.hurts[before]?.t ?? 0) - t0).toBeGreaterThan(HUB_GRACE);
    // Next week he had the weekend.
    g.save.week += 1;
    g.startWeek(g.save.floor + 1);
    g.loadHub(false, true);
    expect(g.actors.filter((a) => a.hostile && !a.resolved)).toEqual([]);
  });

  it('a card whose failure is not personal (Josh bolting) costs standing, and nobody turns', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'josh' }]);
    g.acceptCard(index(h, 'josh'));
    upTo(h, 'josh');
    const m = g.mission!;
    const josh = m.escortee!;
    // A vendor from the pitch, after you, right beside Josh.
    const vendor = m.crowd.find((a) => a.kind === 'vendor')!;
    g.player.pos.set(josh.pos.x + 1, 0, josh.pos.z);
    vendor.pos.set(josh.pos.x - 1, 0, josh.pos.z);
    vendor.aggro = true;
    const staff = g.save.standing.staff;
    h.run(10, () => { g.save.sanity = 100; vendor.pos.set(josh.pos.x - 1, 0, josh.pos.z); });
    expect(h.results?.head).toBe('CARD FAILED');
    expect(h.results?.rows.get('Finished')).toBe('Failed: Josh (Intern) panicked and took the lift');
    expect(g.save.deck.cards[index(h, 'josh')]?.state).toBe('failed');
    expect(g.save.standing.staff).toBeLessThanOrEqual(staff - 3);
    h.results!.buttons.get('Back to the hub')!();
    expect(g.actors.filter((a) => a.hostile && !a.resolved)).toEqual([]);
    expect(giver(h, 'Josh (Intern)')?.hostile).toBe(false);
  });

  it('Friday: a card taken and never finished is missed (its standing), and nobody is waiting on Monday', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler' }]);
    g.acceptCard(index(h, 'stapler'));
    g.save.floorState.bossDone = true;
    const mgmt = g.save.standing.management;
    g.goToMokki();
    while (g.screen === 'dialogue') h.pick(/./);
    expect(g.save.location).toBe('mokki');
    expect(g.save.deck.cards[index(h, 'stapler')]?.state).toBe('failed');
    expect(g.save.standing.management).toBeLessThanOrEqual(mgmt - 2);
    expect(h.toasts).toContain('1 card missed this week.');
    g.goToWork();
    expect(g.save.location).toBe('hub');
    expect(g.actors.filter((a) => a.hostile && !a.resolved)).toEqual([]);
  });
});

describe('gate 6: save and reload mid-mission', () => {
  it('the same map, tier, suspicion, people and objective progress, at the mission\'s lift', () => {
    const m0 = slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits', alarm: 'one-way' }]);
    g.acceptCard(index(h, 'postits'));
    upTo(h, 'postits');
    const m = g.mission!;
    pickUp(h, 3);
    expect(m.run.progress).toBe(3);
    // Somebody at a desk gets a good look (Noticed, not Alert): crouched in their view, a while.
    const w = [...m.watch.watchers.values()].find((x) => x.sort === 'desk')!;
    g.player.crouching = true;
    expect(m.standInView(w.actor.id, 6)).toBe(true);
    h.run(0.6, () => { m.standInView(w.actor.id, 6); });
    expect(w.suspicion).toBeGreaterThan(0);
    const people = m.crowd.map((a) => ({ x: a.pos.x, z: a.pos.z, suspicion: m.watch.watchers.get(a.id)?.suspicion ?? 0, mood: m.watch.watchers.get(a.id)?.mood }));
    const tier = m.watch.tier;
    const print = levelPrint(g.level);
    const seconds = m.run.seconds;
    g.save.rep += 0;
    expect(g.writeSlotFor('auto'), 'a mission is saved in a career').toBe(true);
    expect(m0.size).toBeGreaterThan(0);
    // Loaded fresh.
    const back = headless(normalizeSave(readSlot('auto')!.data)!);
    back.g.loadWorld(true);
    const b = back.g;
    expect(b.save.location).toBe('mission');
    expect(b.mission?.card.id).toBe('postits');
    expect(levelPrint(b.level), 'the same map').toBe(print);
    expect(b.player.pos.x).toBe(b.level.start.x);
    expect(b.player.pos.z, 'at the mission\'s lift').toBe(b.level.start.z);
    const bm = b.mission!;
    expect(bm.watch.tier).toBe(tier);
    expect(bm.run.progress, 'three post-its still collected').toBe(3);
    expect(bm.run.seconds).toBeCloseTo(seconds, 5);
    expect(bm.scatter.filter((c) => c.picked)).toHaveLength(3);
    expect(b.pickups.filter((p) => p.id.startsWith('card:')), 'and not lying there again').toHaveLength(9);
    expect(bm.crowd.map((a) => ({ x: a.pos.x, z: a.pos.z, suspicion: bm.watch.watchers.get(a.id)?.suspicion ?? 0, mood: bm.watch.watchers.get(a.id)?.mood }))).toEqual(people);
    // And it plays on: five more and it is done.
    pickUp(back, 5);
    expect(bm.run.objectiveDone).toBe(true);
  });

  it('an Alert person, and a closet already picked, come back as they were', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', alarm: 'one-way' }]);
    g.acceptCard(index(h, 'stapler'));
    upTo(h, 'stapler');
    const m = g.mission!;
    const w = [...m.watch.watchers.values()].find((x) => x.sort === 'desk')!;
    expect(m.standInView(w.actor.id, 3)).toBe(true);
    h.run(4, () => { g.save.sanity = 100; if (w.mood !== 'alert') m.standInView(w.actor.id, 3); });
    expect(w.mood).toBe('alert');
    expect(m.watch.tier).toBeGreaterThanOrEqual(2);
    const closet = g.level.interactables.find((it) => it.id === g.level.recipe?.closet)!;
    closet.used = true;
    g.save.mission!.used.push(closet.id);
    g.writeSlotFor('auto');
    const back = headless(normalizeSave(readSlot('auto')!.data)!);
    back.g.loadWorld(true);
    const bm = back.g.mission!;
    expect(bm.watch.tier).toBe(m.watch.tier);
    expect(bm.run.maxTier).toBe(m.run.maxTier);
    const i = m.crowd.indexOf(w.actor);
    const again = bm.crowd[i]!;
    expect(bm.watch.watchers.get(again.id)?.mood).toBe('alert');
    expect(again.aggro, 'still after you').toBe(true);
    expect(back.g.level.interactables.find((it) => it.id === closet.id)?.used).toBe(true);
    // The card's going-loud (the bolted closet, the Head of People) is not done twice.
    expect(bm.loudDone).toBe(m.loudDone);
    expect(bm.crowd.filter((a) => a.name === 'Head of People')).toHaveLength(m.crowd.filter((a) => a.name === 'Head of People').length);
  });

  it('a P1 card is never aborted, only left: the lift goes back to it as it was', () => {
    const h = newCareer();
    const g = h.g;
    const s = g.save;
    s.deck = { week: s.week, cards: [{ id: 'printer', p1: true, alarm: 'one-way', afterHours: false, inPerson: false, seed: 77, state: 'accepted' }] };
    g.loadHub(false);
    expect(g.save.quests[0]?.title).toBe('MAJOR INCIDENT: The Printer Uprising');
    expect(press(h, lift(g))).toEqual(['P1: The Printer Uprising (Print room 7B)', 'Not yet.']);
    h.pick('P1: The Printer Uprising (Print room 7B)');
    h.pick('Take the card');
    const m = g.mission!;
    const jams = m.crowd.filter((a) => a.kind === 'jam').slice(0, 2);
    for (const a of jams) {
      a.hp = 0;
      resolveActor(g, a);
    }
    h.run(DT * 2);
    expect(m.run.progress).toBe(2);
    expect(press(h, lift(g))).toEqual(['Back to the hub (the P1 waits as you left it)', 'Not yet.']);
    h.pick(/^Back to the hub/);
    expect(g.save.location).toBe('hub');
    expect(g.p1Done(), 'not resolved').toBe(false);
    expect(press(h, lift(g)), 'no Friday while it is open').toEqual(['P1: The Printer Uprising (Print room 7B)', 'Not yet.']);
    h.pick('P1: The Printer Uprising (Print room 7B)');
    expect(h.toasts.at(-1)).toBe('P1: The Printer Uprising: as you left it.');
    const again = g.mission!;
    expect(again.run.progress, 'the two jams still resolved').toBe(2);
    expect(again.crowd.filter((a) => a.kind === 'jam' && !a.resolved)).toHaveLength(5);
    // Resolved: Friday opens.
    for (const a of again.crowd.filter((x) => !x.resolved)) {
      a.hp = 0;
      resolveActor(g, a);
    }
    h.run(DT * 2);
    expect(again.run.objectiveDone).toBe(true);
    press(h, lift(g));
    h.pick('Finish: close the card');
    expect(g.p1Done()).toBe(true);
    h.results!.buttons.get('Back to the hub')!();
    expect(press(h, lift(g))).toEqual(['Friday: to the mökki', 'Not yet.']);
  });
});

describe('a deck dealt for a week already under way', () => {
  /** A Helpdesk career in Overtime whose week would deal the Printer Uprising as its P1 on a Monday. */
  function printerCareer(): Headless {
    const h = newCareer();
    const s = h.g.save;
    const floor = 6;
    const seed = Array.from({ length: 400 }, (_, k) => k + 1).find((x) => deal({ careerSeed: x, week: s.week, floor, rung: 0, previous: [], exclude: [] }).cards[0]?.id === 'printer');
    expect(seed, 'a career whose Monday would deal the printers').toBeDefined();
    s.seed = seed!;
    s.floor = floor;
    return h;
  }

  it('an Overtime Helpdesk save from before the deck, its floor\'s boss already beaten: Friday is still open after the load', () => {
    const h = printerCareer();
    const s = h.g.save;
    s.floorState = { ...s.floorState, floor: s.floor, bossDone: true };
    expect(h.g.p1Done(), 'Friday was open when it was saved').toBe(true);
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete raw.deck;
    const back = headless(normalizeSave(raw)!);
    back.g.loadWorld(true);
    expect(back.g.p1Done(), 'Friday is still open').toBe(true);
    expect(press(back, lift(back.g))).toContain('Friday: to the mökki');
    const p1 = back.g.save.deck.cards.find((c) => c.p1)!;
    expect(p1.id, 'the floor is the week\'s P1').toBe(FLOOR_P1);
  });

  it('a deck that did not read back, mid-week: the same', () => {
    const h = printerCareer();
    const s = h.g.save;
    s.floorState = { ...s.floorState, floor: s.floor, bossDone: true };
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.deck = { week: 'broken' };
    const back = headless(normalizeSave(raw)!);
    back.g.loadWorld(true);
    expect(back.g.p1Done(), 'Friday is still open').toBe(true);
    expect(back.g.save.deck.cards[0]?.id).toBe(FLOOR_P1);
  });
});

describe('the floor\'s P1 on the board', () => {
  it('shows Resolved once the floor\'s boss is beaten, back on the hub too', () => {
    const h = newCareer();
    const g = h.g;
    expect(g.deckViews()[0]).toMatchObject({ p1: true, state: 'accepted' });
    h.pick(press(h, lift(g)).find((l) => l.startsWith('Floor'))!);
    expect(g.save.location).toBe('office');
    const boss = g.boss!;
    boss.hp = 0;
    resolveActor(g, boss);
    expect(g.deckViews()[0]?.state, 'on the floor').toBe('done');
    g.liftToHub();
    expect(g.save.location).toBe('hub');
    expect(g.deckViews()[0]?.state, 'and on the hub\'s board').toBe('done');
  });

  it('shows Resolved when the Auditor settles it with a handshake instead', () => {
    const h = newCareer();
    const g = h.g;
    g.save.week += 1;
    g.startWeek(3);
    g.loadHub(false, true);
    g.loadFloor(3, false, true);
    expect(g.boss?.resolved).toBe(false);
    expect(g.deckViews()[0]?.state).toBe('accepted');
    g.auditorParley('ally');
    expect(g.deckViews()[0]?.state).toBe('done');
  });
});

describe('rapport with a coworker shows, and matters', () => {
  it('two of Priya\'s cards declined: her cards say she is cool on you, pay 10% less, and next week hers is on your desk, not handed over', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits' }, { id: 'phishing' }, { id: 'stapler' }]);
    expect(g.cardView(index(h, 'postits')).rapport, 'fine to start with').toBe('fine');
    expect(g.cardView(index(h, 'stapler')).rapport).toBe('fine');
    g.declineCard(index(h, 'postits'));
    expect(g.cardView(index(h, 'phishing')).rapport, 'one declined: still fine').toBe('fine');
    g.declineCard(index(h, 'phishing'));
    expect(g.cardView(index(h, 'phishing')).rapport, 'two: cool').toBe('cool');
    expect(g.cardView(index(h, 'stapler')).rapport, 'Milton is not Priya').toBe('fine');
    // Next week: a career whose Monday would have Priya hand one over in person.
    const s = g.save;
    const previous = handIds(s.deck);
    const exclude = g.deckExclude();
    const seed = Array.from({ length: 400 }, (_, k) => k + 1).find((x) => deal({ careerSeed: x, week: s.week + 1, floor: s.floor, rung: s.rung, previous, exclude })
      .cards.some((c) => c.inPerson && deckCard(c)?.giver.id === 'priya'));
    expect(seed, 'a Monday where Priya would hand hers over').toBeDefined();
    s.seed = seed!;
    s.week += 1;
    g.startWeek(s.floor);
    g.loadHub(false, true);
    const k = s.deck.cards.findIndex((c) => deckCard(c)?.giver.id === 'priya');
    const card = deckCard(s.deck.cards[k]!)!;
    const v = g.cardView(k);
    expect(s.deck.cards.filter((c) => deckCard(c)?.giver.id === 'priya' && c.inPerson), 'hers are on your desk, none handed over').toEqual([]);
    expect(v.rapport).toBe('cool');
    const hours = payRate(s.deck.cards[k]!);
    expect(v.pay.startsWith(`₡${Math.round(card.value * hours * 0.9)},`), v.pay).toBe(true);
    expect(v.pay).toContain('they are cool on you: 10% less');
    expect(h.g.hub?.giverActor('priya')?.marker ?? null, 'no "!" over her').toBeNull();
    expect(g.acceptCard(k).ok, 'taken at the workstation').toBe(true);
    // Up the lift to it: the card is played at nine tenths of its pay.
    liftTo(h, card.id);
    expect(g.mission?.rate, 'her card pays nine tenths').toBeCloseTo(hours * 0.9, 10);
  });
});

describe('a coworker who cannot hand their card over', () => {
  it('Milton turns on you before handing his card over: it goes to your desk, announced, with Accept and Decline there, for the rest of the week', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', inPerson: true }, { id: 'phishing' }]);
    const i = index(h, 'stapler');
    expect(g.acceptCard(i).ok, 'his to hand over').toBe(false);
    const milton = giver(h, 'Milton (Basement)')!;
    g.hub!.assault(milton);
    expect(milton.hostile).toBe(true);
    h.run(DT, () => { g.save.sanity = 100; });
    expect(g.cardView(i).inPerson, 'no "ask him" on the desk').toBe(false);
    expect(h.toasts).toContain('Milton (Basement) is not handing "The Red Stapler, Recovered" over now: it is on your desk.');
    // Resolved, and the hub built again: still on the desk.
    milton.hp = 0;
    h.run(DT * 2, () => { g.save.sanity = 100; });
    expect(milton.resolved).toBe(true);
    const back = headless(normalizeSave(JSON.parse(JSON.stringify(g.save)))!);
    back.g.loadWorld(true);
    expect(back.g.cardView(i).inPerson).toBe(false);
    expect(back.g.acceptCard(i).ok, 'taken at the workstation').toBe(true);
  });

  it('a save where the giver is gone this week with their card still waiting to be handed over: on load it is on your desk', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', inPerson: true }]);
    const milton = giver(h, 'Milton (Basement)')!;
    g.save.hub.resolved.push(milton.spawnIndex);
    const back = headless(normalizeSave(JSON.parse(JSON.stringify(g.save)))!);
    back.g.loadWorld(true);
    expect(giver(back, 'Milton (Basement)'), 'not on the floor').toBeUndefined();
    expect(back.g.cardView(index(back, 'stapler')).inPerson).toBe(false);
    expect(back.g.acceptCard(index(back, 'stapler')).ok).toBe(true);
  });
});

describe('a failed card is always answered for', () => {
  /** Up the lift to a card already taken, and burned out on it: the card has failed; you wake on the hub. */
  function burnOn(h: Headless, id: string): void {
    liftTo(h, id);
    const page = dom();
    h.g.save.sanity = 0;
    h.g.checkBurnout();
    expect(h.g.save.deck.cards[index(h, id)]?.state).toBe('failed');
    page.press(/Clock back in/);
    vi.unstubAllGlobals();
    slots();
    expect(h.g.save.location).toBe('hub');
  }

  /** Beaten on the hub: resolved, for the rest of the week. */
  function beat(h: Headless, a: Actor): void {
    a.hp = 0;
    h.run(DT * 2, () => { h.g.save.sanity = 100; });
    expect(a.resolved).toBe(true);
  }

  it('two of Priya\'s cards failed, and she was dealt with in between: she comes back for the second, announced', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits' }, { id: 'phishing' }]);
    g.acceptCard(index(h, 'postits'));
    g.acceptCard(index(h, 'phishing'));
    burnOn(h, 'postits');
    const priya = giver(h, 'Priya (InfoSec)')!;
    expect(priya.hostile, 'after you for the first').toBe(true);
    beat(h, priya);
    h.toasts.length = 0;
    burnOn(h, 'phishing');
    const again = giver(h, 'Priya (InfoSec)');
    expect(again, 'back at her desk').toBeDefined();
    expect(again!.hostile, 'after you for the second').toBe(true);
    expect(h.toasts).toContain('Priya (InfoSec) heard how "Phishing Test Debrief" went, and has been waiting for you.');
  });

  it('the second failed while she was still after you for the first: once she is dealt with, she is back for it the next time you are on the hub', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits' }, { id: 'phishing' }]);
    g.acceptCard(index(h, 'postits'));
    g.acceptCard(index(h, 'phishing'));
    burnOn(h, 'postits');
    expect(giver(h, 'Priya (InfoSec)')!.hostile).toBe(true);
    burnOn(h, 'phishing');
    expect(g.save.hub.failed, 'still to answer for').toEqual([{ giver: 'priya', card: 'Phishing Test Debrief' }]);
    beat(h, giver(h, 'Priya (InfoSec)')!);
    h.toasts.length = 0;
    // Up to the floor and back down: the hub again.
    g.loadFloor(g.save.floor, false, true);
    g.liftToHub();
    const back = giver(h, 'Priya (InfoSec)');
    expect(back?.hostile, 'back for the second').toBe(true);
    expect(h.toasts).toContain('Priya (InfoSec) heard how "Phishing Test Debrief" went, and has been waiting for you.');
    expect(g.save.hub.failed).toEqual([]);
  });
});
