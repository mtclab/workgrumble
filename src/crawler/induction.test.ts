import { describe, expect, it } from 'vitest';
import {
  advance,
  cardFor,
  type CardKeys,
  closingLines,
  eTarget,
  floorAwake,
  HUD_METERS,
  inductionOnLoad,
  type HudMeter,
  type InductionEvent,
  type InductionState,
  LOOK_NEEDED,
  type MeterFacts,
  normalizeInduction,
  partOf,
  PARTS,
  practiceDamage,
  PRACTICE_SANITY_FLOOR,
  type PropId,
  propLive,
  SANITY_LINE,
  startInduction,
  STEPS,
  type StepId,
  stillHidden,
} from './induction';
import * as THREE from 'three';
import { disposeTree } from './dispose';
import { generateLevel, flowField, toCell } from './level';
import { dummyMesh, inductionTerminalMesh } from './meshes';
import { planProps, TERMINAL_CLEARANCE } from './inductionday';
import { newSave, normalizeSave } from './state';
import { THEMES } from './textures';

/**
 * Induction day (docs/SPEC_INDUCTION.md): the step machine, the meters that
 * wait until they matter, and where the morning's props go. The aggro gate
 * (nothing notices you before step 6) is played against the real enemy AI in
 * attacks.test.ts.
 */

/** The one event that finishes each step. */
const OWN: Record<StepId, InductionEvent> = {
  look: { type: 'look', amount: LOOK_NEEDED },
  walk: { type: 'reached' },
  talk: { type: 'talked' },
  swing: { type: 'hit', how: 'light' },
  heavy: { type: 'hit', how: 'heavy' },
  label: { type: 'hit', how: 'label' },
  block: { type: 'guard', how: 'blocked' },
  parry: { type: 'guard', how: 'parried' },
  ticket: { type: 'fixed' },
  map: { type: 'map' },
};

/** Every kind of event there is, including the near misses (a stray hit, a hit taken, a glance round). */
const ALL: readonly InductionEvent[] = [
  ...Object.values(OWN),
  { type: 'hit', how: 'other' },
  { type: 'guard', how: 'hurt' },
];

const at = (step: StepId | 'done'): InductionState => ({ step, looked: 0, sanityTold: false });
const same = (a: InductionEvent, b: InductionEvent): boolean => JSON.stringify(a) === JSON.stringify(b);

describe('the step machine', () => {
  it('starts at the first step with nothing done', () => {
    expect(startInduction()).toEqual({ step: 'look', looked: 0, sanityTold: false });
  });

  it.each(STEPS.map((s) => [s]))('%s advances on its own event and on nothing else', (step) => {
    for (const e of ALL) {
      if (same(e, OWN[step])) continue;
      // A parry is a block done well: the block step takes it (and only the block step).
      if (step === 'block' && same(e, OWN.parry)) continue;
      const st = at(step);
      expect(advance(st, e).advanced, `${step} on ${JSON.stringify(e)}`).toBe(false);
      expect(st.step).toBe(step);
    }
    const st = at(step);
    expect(advance(st, OWN[step]).advanced).toBe(true);
    expect(st.step).toBe(STEPS[STEPS.indexOf(step) + 1] ?? 'done');
  });

  it('a parry answers the block step too, but a block never answers the parry step', () => {
    const b = at('block');
    expect(advance(b, OWN.parry).advanced).toBe(true);
    expect(b.step).toBe('parry');
    const p = at('parry');
    expect(advance(p, OWN.block).advanced).toBe(false);
    expect(p.step).toBe('parry');
  });

  it('no skipping ahead: every later step\'s action, done first, leaves the induction where it was', () => {
    const st = startInduction();
    for (const step of STEPS.slice(1)) advance(st, OWN[step]);
    expect(st.step).toBe('look');
    // And from the middle: the ticket and the map do nothing before the dummy.
    const mid = at('swing');
    advance(mid, OWN.ticket);
    advance(mid, OWN.map);
    advance(mid, OWN.heavy);
    expect(mid.step).toBe('swing');
  });

  it('played in order, the whole morning ends done, one step per action', () => {
    const st = startInduction();
    STEPS.forEach((step, i) => {
      expect(st.step).toBe(step);
      advance(st, OWN[step]);
      expect(st.step).toBe(STEPS[i + 1] ?? 'done');
    });
    // Done is done: nothing moves it again.
    for (const e of ALL) expect(advance(st, e).advanced).toBe(false);
  });

  it('looking round adds up: small glances finish the first step once they come to enough', () => {
    const st = startInduction();
    advance(st, { type: 'look', amount: LOOK_NEEDED / 2 });
    expect(st.step).toBe('look');
    advance(st, { type: 'look', amount: 0 });
    expect(st.step).toBe('look');
    advance(st, { type: 'look', amount: LOOK_NEEDED / 2 });
    expect(st.step).toBe('walk');
  });

  it('the first unblocked practice hit introduces Sanity, once, and does not move the step', () => {
    const st = at('block');
    const first = advance(st, { type: 'guard', how: 'hurt' });
    expect(first).toEqual({ advanced: false, toldSanity: true });
    expect(st.sanityTold).toBe(true);
    expect(advance(st, { type: 'guard', how: 'hurt' }).toldSanity).toBe(false);
    expect(st.step).toBe('block');
    expect(cardFor(st, KEYS).note).toBe(SANITY_LINE);
    expect(cardFor(st, KEYS).point).toBe('sanity');
  });
});

describe('saved and resumed', () => {
  it.each(STEPS.map((s) => [s]))('a career saved at %s loads at %s and carries on from there', (step) => {
    const s = newSave(42);
    s.induction = { step, looked: 0.4, sanityTold: step === 'parry' };
    s.hudHidden = ['promille', 'caffeine'];
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back?.induction).toEqual(s.induction);
    expect(back?.hudHidden).toEqual(['promille', 'caffeine']);
    const st = back?.induction;
    if (st === null || st === undefined) throw new Error('lost the induction');
    advance(st, OWN[step]);
    expect(st.step).toBe(STEPS[STEPS.indexOf(step) + 1] ?? 'done');
  });

  it('a save from before inductions has none, and shows every meter', () => {
    const s = newSave(7) as unknown as Record<string, unknown>;
    delete s.induction;
    delete s.hudHidden;
    const back = normalizeSave(s);
    expect(back?.induction).toBeNull();
    expect(back?.hudHidden).toEqual([]);
    expect(floorAwake(back?.induction ?? null)).toBe(true);
  });

  it('anything malformed is no induction (the floor stays awake), never a stuck one', () => {
    for (const raw of [null, 7, 'look', {}, { step: 'dance' }, { step: 3 }]) expect(normalizeInduction(raw)).toBeNull();
    expect(normalizeInduction({ step: 'heavy', looked: -3, sanityTold: 'yes' })).toEqual({ step: 'heavy', looked: 0, sanityTold: false });
    const s = newSave(3) as unknown as Record<string, unknown>;
    s.hudHidden = ['energy', 'hat', 4];
    expect(normalizeSave(s)?.hudHidden).toEqual(['energy']);
  });
});

describe('the floor wakes after step 6', () => {
  it('asleep through the block and parry, awake from the ticket on, and awake with no induction', () => {
    for (const step of STEPS) expect(floorAwake(at(step)), step).toBe(STEPS.indexOf(step) > STEPS.indexOf('parry'));
    expect(floorAwake(at('done'))).toBe(true);
    expect(floorAwake(null)).toBe(true);
  });
});

describe('meters appear when they first matter', () => {
  const calm: MeterFacts = { step: 'look', loyly: 50, maxLoyly: 50, runes: 0, ability: false, bac: 0, stomach: 0, caffeine: 0, crash: 0 };
  const all = [...HUD_METERS];

  it('a new starter sees none of them', () => {
    expect(stillHidden(all, calm)).toEqual(all);
  });

  it('energy with the heavy swing, REP and the queue with the ticket', () => {
    const shown = (step: StepId | 'done' | null): HudMeter[] => HUD_METERS.filter((m) => !stillHidden(all, { ...calm, step }).includes(m));
    expect(shown('swing')).toEqual([]);
    expect(shown('heavy')).toEqual(['energy']);
    expect(shown('parry')).toEqual(['energy']);
    expect(shown('ticket')).toEqual(['energy', 'rep']);
    // No induction running: nothing left to wait for but the three tightropes.
    expect(shown(null)).toEqual(['energy', 'rep']);
  });

  it('Löyly, promille and caffeine the first time each changes, and not before', () => {
    expect(stillHidden(['loyly'], { ...calm, loyly: 49.9 })).toEqual(['loyly']);
    expect(stillHidden(['loyly'], { ...calm, loyly: 30 })).toEqual([]);
    expect(stillHidden(['loyly'], { ...calm, runes: 2 })).toEqual([]);
    // The domain ability (and its cooldown) lives in that cell: whoever has one sees it from the start.
    expect(stillHidden(['loyly'], { ...calm, ability: true })).toEqual([]);
    expect(stillHidden(['promille'], { ...calm, stomach: 3 })).toEqual([]);
    expect(stillHidden(['promille'], { ...calm, bac: 1 })).toEqual([]);
    expect(stillHidden(['caffeine'], { ...calm, caffeine: 90 })).toEqual([]);
    expect(stillHidden(['caffeine'], { ...calm, crash: 4 })).toEqual([]);
  });

  it('a shown meter never hides again, and a skipper (nothing hidden) sees everything', () => {
    expect(stillHidden(['promille'], calm)).toEqual(['promille']);
    expect(stillHidden([], calm)).toEqual([]);
  });
});

const KEYS: CardKeys = { forward: 'W', left: 'A', back: 'S', right: 'D', interact: 'E', map: 'M', labelSlot: '2', attack: 'Mouse0', block: 'Mouse2' };

describe('the cards', () => {
  it.each(STEPS.map((s) => [s]))('%s: one or two sentences from Morag, and something to do with a key or the mouse drawn', (step) => {
    const c = cardFor(at(step), KEYS);
    const sentences = c.say.split(/(?<=[.?!])\s+/).filter((x) => x.trim() !== '');
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(c.doing.some((b) => 'key' in b || 'mouse' in b)).toBe(true);
    expect(partOf(step)).toBeGreaterThanOrEqual(1);
    expect(partOf(step)).toBeLessThanOrEqual(PARTS);
  });

  it('draws the keys as bound, and the label card points at the ammo', () => {
    const walk = cardFor(at('walk'), { ...KEYS, forward: 'Z', left: 'Q' });
    expect(walk.doing.filter((b) => 'key' in b).map((b) => ('key' in b ? b.key : ''))).toEqual(['Z', 'Q', 'S', 'D']);
    const label = cardFor(at('label'), { ...KEYS, labelSlot: '3' });
    expect(label.doing).toContainEqual({ key: '3' });
    expect(label.point).toBe('tool');
    expect(label.say).toMatch(/run out/);
  });

  it('draws attack and block as bound: the mouse while they are the buttons, the keycap once rebound to a key', () => {
    expect(cardFor(at('swing'), KEYS).doing).toContainEqual({ mouse: 'left' });
    expect(cardFor(at('block'), KEYS).doing).toContainEqual({ mouse: 'right' });
    const swing = cardFor(at('swing'), { ...KEYS, attack: 'KeyK' });
    expect(swing.doing).toContainEqual({ key: 'K' });
    expect(swing.doing).not.toContainEqual({ mouse: 'left' });
    expect(cardFor(at('parry'), { ...KEYS, block: 'Mouse4' }).doing).toContainEqual({ key: 'Mouse 5' });
  });

  it('Morag closes with the floor, the lift and the mökki, and tells about Sanity if no hit ever did', () => {
    const told = { ...at('done'), sanityTold: true };
    expect(closingLines(told)).toMatch(/lift/);
    expect(closingLines(told)).toMatch(/mökki/);
    expect(closingLines(told)).not.toContain(SANITY_LINE);
    expect(closingLines(at('done'))).toContain(SANITY_LINE);
  });
});

describe('where the props go', () => {
  it.each([1, 2, 3, 77, 1234, 99991, 424242, 7919 * 5, 7919 * 131])('seed %i: four distinct lobby cells, none on the arrival, and the computer cuts nothing off', (seed) => {
    const lv = generateLevel(0, THEMES[0] ?? THEMES[1] ?? (() => { throw new Error('no theme'); })(), seed, true);
    const lobby = lv.rooms[0];
    if (lobby === undefined) throw new Error('no lobby');
    const plan = planProps(lv);
    // Every lobby gets its computer, cramped or not.
    expect(plan.terminal).not.toBeNull();
    const spots = [plan.morag, plan.colleague, plan.dummy, ...(plan.terminal === null ? [] : [plan.terminal])];
    const start = [toCell(lv.start.x), toCell(lv.start.z)];
    const keys = new Set(spots.map((s) => `${s.cx},${s.cz}`));
    expect(keys.size).toBe(spots.length);
    for (const s of spots) {
      expect(`${s.cx},${s.cz}`).not.toBe(`${start[0]},${start[1]}`);
      expect(lv.floor[s.cz * lv.w + s.cx]).toBe(1);
    }
    // The computer well clear of the people, so no spot reaches both E prompts.
    if (plan.terminal !== null) {
      const t = plan.terminal;
      expect(Math.min(Math.hypot(t.cx - plan.morag.cx, t.cz - plan.morag.cz), Math.hypot(t.cx - plan.colleague.cx, t.cz - plan.colleague.cz))).toBeGreaterThanOrEqual(TERMINAL_CLEARANCE);
    }
    // Same floor, same places: a reload puts everyone back.
    expect(planProps(lv)).toEqual(plan);
    if (plan.terminal !== null) {
      const count = (): number => [...flowField(lv, lv.start.x, lv.start.z, 32000)].filter((d) => d >= 0).length;
      const before = count();
      const i = plan.terminal.cz * lv.w + plan.terminal.cx;
      lv.solid[i] = 1;
      expect(count()).toBe(before - 1);
      lv.solid[i] = 0;
    }
  });
});

describe('the props leave nothing behind', () => {
  it.each([
    ['the dummy', (): THREE.Object3D => dummyMesh()],
    ['the lobby computer', (): THREE.Object3D => inductionTerminalMesh(new THREE.Texture())],
  ])('%s: every geometry, material and texture it made is disposed with it', (_name, build) => {
    const root = build();
    const made: { dispose: () => void; disposed: boolean }[] = [];
    const watch = (x: { dispose: () => void }): void => {
      if (made.some((m) => m === x)) return;
      const entry = x as unknown as { dispose: () => void; disposed: boolean };
      entry.disposed = false;
      const orig = x.dispose.bind(x);
      entry.dispose = (): void => { entry.disposed = true; orig(); };
      made.push(entry);
    };
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.shared === true) return;
      watch(o.geometry as THREE.BufferGeometry);
      const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
      for (const m of mats) {
        watch(m);
        const map = (m as THREE.Material & { map?: THREE.Texture | null }).map;
        if (map !== undefined && map !== null) watch(map);
      }
    });
    expect(made.length).toBeGreaterThan(3);
    disposeTree(root, true);
    expect(made.filter((m) => !m.disposed)).toEqual([]);
  });
});

describe('E at each step: only the step\'s own prop answers', () => {
  const PROPS: readonly PropId[] = ['morag', 'colleague', 'terminal'];
  const WANTS: Record<StepId, PropId | null> = {
    look: 'morag', walk: 'morag', talk: 'colleague', swing: null, heavy: null, label: null, block: null, parry: null, ticket: 'terminal', map: null,
  };

  it.each(STEPS.map((s) => [s]))('%s', (step) => {
    expect(eTarget(step)).toBe(WANTS[step]);
    // At most one prop is live, and it is the step's own.
    expect(PROPS.filter((p) => propLive(p, step))).toEqual(WANTS[step] === null ? [] : [WANTS[step]]);
  });

  it('the lobby computer answers E only from the ticket step, the colleague only at the talk step', () => {
    expect(STEPS.filter((s) => propLive('terminal', s))).toEqual(['ticket']);
    expect(STEPS.filter((s) => propLive('colleague', s))).toEqual(['talk']);
    expect(PROPS.some((p) => propLive(p, 'done'))).toBe(false);
  });
});

describe('loading a world with an induction running', () => {
  const st = (step: StepId | 'done'): InductionState => ({ step, looked: 0, sanityTold: false });
  it('runs in the hub\'s lobby in week one, finishes once the map step is done, and is abandoned anywhere else', () => {
    expect(inductionOnLoad(null, 'hub', 1)).toBe('none');
    expect(inductionOnLoad(st('swing'), 'hub', 1)).toBe('run');
    expect(inductionOnLoad(st('done'), 'hub', 1)).toBe('finish');
    expect(inductionOnLoad(st('done'), 'office', 1)).toBe('finish');
    // Up the lift to the P1 floor, a later week, or the mökki: abandoned, never counted as done.
    expect(inductionOnLoad(st('swing'), 'office', 1)).toBe('abandon');
    expect(inductionOnLoad(st('map'), 'hub', 2)).toBe('abandon');
    expect(inductionOnLoad(st('ticket'), 'mokki', 1)).toBe('abandon');
  });
});

describe('practice damage', () => {
  it('never takes Sanity below the floor, never heals, and is untouched well above it', () => {
    expect(practiceDamage(5, 100)).toBe(5);
    expect(practiceDamage(50, PRACTICE_SANITY_FLOOR + 3)).toBe(3);
    expect(practiceDamage(5, PRACTICE_SANITY_FLOOR)).toBe(0);
    expect(practiceDamage(5, PRACTICE_SANITY_FLOOR - 4)).toBe(0);
  });
});

describe('the meter reveal allocates nothing while nothing changes', () => {
  it('the same list comes back until a meter is revealed', () => {
    const hidden = [...HUD_METERS];
    const f = { step: 'look' as const, loyly: 50, maxLoyly: 50, runes: 0, ability: false, bac: 0, stomach: 0, caffeine: 0, crash: 0 };
    expect(stillHidden(hidden, f)).toBe(hidden);
    expect(stillHidden(hidden, { ...f, caffeine: 90 })).not.toBe(hidden);
  });
});
