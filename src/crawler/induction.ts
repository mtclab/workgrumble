/**
 * Induction day (docs/SPEC_INDUCTION.md): the first morning of a first
 * career, in the floor-0 lobby, one thing at a time.
 *
 * A new player used to get one dense paragraph from Morag and meet the first
 * hostile half a minute later, having been told nothing about swinging, the
 * label maker's ammo, blocking or what Sanity is. The induction teaches those
 * one step at a time, and each step moves on only when the player has done
 * the thing it asks - never on a timer, never on the next step's action.
 *
 * The rules live here, apart from the scene, so they can be tested without
 * one: the step machine, when the floor is allowed to notice you, which HUD
 * meters are showing yet, and what each card says. The props, the card on
 * screen and the wiring into the game are in `inductionday.ts`.
 */

// ================================================================== the steps

/** In order. The spec's eight parts, with "look and move" and "block and parry" as two steps each. */
export const STEPS = ['look', 'walk', 'talk', 'swing', 'heavy', 'label', 'block', 'parry', 'ticket', 'map'] as const;

export type StepId = (typeof STEPS)[number];

/** Which of the spec's eight parts a step belongs to, for "3 of 8" on the card. */
const PART: Record<StepId, number> = { look: 1, walk: 1, talk: 2, swing: 3, heavy: 4, label: 5, block: 6, parry: 6, ticket: 7, map: 8 };
export const PARTS = 8;

export function partOf(step: StepId): number {
  return PART[step];
}

/** Saved with the career: a reload mid-induction resumes at the same step. */
export interface InductionState {
  step: StepId | 'done';
  /** Radians of looking round done so far (the first step). */
  looked: number;
  /** The first unblocked practice hit has introduced Sanity. */
  sanityTold: boolean;
}

/** How much looking round (yaw and pitch together, radians) the first step wants: about a quarter turn. */
export const LOOK_NEEDED = 1.5;

/** How close to Morag counts as having walked over. */
export const MORAG_REACH = 2.6;

/** Everything the player can do that the induction listens for. */
export type InductionEvent =
  | { readonly type: 'look'; readonly amount: number }
  | { readonly type: 'reached' }
  | { readonly type: 'talked' }
  /** A hit on the dummy: a quick or heavy swing, a label, or anything else (a spell, another tool). */
  | { readonly type: 'hit'; readonly how: 'light' | 'heavy' | 'label' | 'other' }
  /** The dummy's swing arrived: blocked, parried, or taken on the chin. */
  | { readonly type: 'guard'; readonly how: 'blocked' | 'parried' | 'hurt' }
  | { readonly type: 'fixed' }
  | { readonly type: 'map' };

export function startInduction(): InductionState {
  return { step: 'look', looked: 0, sanityTold: false };
}

export function stepIndex(step: StepId | 'done'): number {
  return step === 'done' ? STEPS.length : STEPS.indexOf(step);
}

/** What an event did: moved the induction on, and whether this was the hit that introduces Sanity. */
export interface Advance {
  readonly advanced: boolean;
  readonly toldSanity: boolean;
}

/**
 * One event, against the step the induction is on. Only the step's own
 * event moves it on: a heavy swing does not count as the quick one, a block
 * held long does not count as a parry, and nothing counts for a step not
 * reached yet. Mutates `st`.
 */
export function advance(st: InductionState, e: InductionEvent): Advance {
  const step = st.step;
  if (step === 'done') return { advanced: false, toldSanity: false };
  let done = false;
  let toldSanity = false;
  switch (step) {
    case 'look':
      if (e.type === 'look' && e.amount > 0) {
        st.looked += e.amount;
        done = st.looked >= LOOK_NEEDED;
      }
      break;
    case 'walk': done = e.type === 'reached'; break;
    case 'talk': done = e.type === 'talked'; break;
    case 'swing': done = e.type === 'hit' && e.how === 'light'; break;
    case 'heavy': done = e.type === 'hit' && e.how === 'heavy'; break;
    case 'label': done = e.type === 'hit' && e.how === 'label'; break;
    case 'block':
    case 'parry':
      if (e.type === 'guard') {
        // A parry is a block done well: it answers the block step too. A
        // block is never a parry.
        done = step === 'block' ? e.how !== 'hurt' : e.how === 'parried';
        if (e.how === 'hurt' && !st.sanityTold) {
          st.sanityTold = true;
          toldSanity = true;
        }
      }
      break;
    case 'ticket': done = e.type === 'fixed'; break;
    case 'map': done = e.type === 'map'; break;
  }
  if (done) st.step = STEPS[STEPS.indexOf(step) + 1] ?? 'done';
  return { advanced: done, toldSanity };
}

/**
 * May anything hostile on the floor notice the player? Not until the block
 * and parry are done: the first thing to swing at a new starter is the
 * dummy, with Morag watching. A career with no induction (skipped, finished,
 * or from before there was one) has the floor awake as usual.
 */
export function floorAwake(st: InductionState | null): boolean {
  return st === null || stepIndex(st.step) > stepIndex('parry');
}

/** The morning's props that E can reach: Morag, the practice colleague, the lobby computer. */
export type PropId = 'morag' | 'colleague' | 'terminal';

/**
 * Which prop E is for at a step, if any. Only that one is live: it wins the
 * prompt over anything else in reach (the lobby's own computer, the other
 * props), and the others offer no prompt at all until their step. Otherwise
 * the computer placed for step 7 answers E while the card says to talk to
 * the colleague. The steps that want no E (swings, guards, the map) have none.
 */
export function eTarget(step: StepId | 'done'): PropId | null {
  switch (step) {
    case 'look':
    case 'walk': return 'morag';
    case 'talk': return 'colleague';
    case 'ticket': return 'terminal';
    default: return null;
  }
}

export function propLive(prop: PropId, step: StepId | 'done'): boolean {
  return eTarget(step) === prop;
}

/**
 * What loading a world does to an induction. On the lobby floor it runs.
 * Finished (the map step done; a reload may have come before Morag's last
 * words) it ends as a finished one. Anywhere else - the lift taken early once
 * the floor was awake, the mökki - it is abandoned: it ends without counting
 * as done, so the next career's form still offers it.
 */
export function inductionOnLoad(st: InductionState | null, location: 'office' | 'mokki', floor: number): 'none' | 'run' | 'finish' | 'abandon' {
  if (st === null) return 'none';
  if (st.step === 'done') return 'finish';
  return location === 'office' && floor === 0 ? 'run' : 'abandon';
}

/** Practice swings never take Sanity below this: an Ironman cannot burn out on the dummy. */
export const PRACTICE_SANITY_FLOOR = 10;

/** A practice hit's damage, clamped so Sanity stays at or above the floor (never heals). */
export function practiceDamage(dmg: number, sanity: number): number {
  return Math.max(0, Math.min(dmg, sanity - PRACTICE_SANITY_FLOOR));
}

/** Labels the label step guarantees, so the step can always be done. */
export const LABELS_FOR_STEP = 10;

/** The induction's ticket: never breaches, and comes back if anything takes it away mid-step. */
export function isPracticeTicket(q: { readonly from: string }): boolean {
  return q.from === PRACTICE_TICKET_FROM;
}

/** A save's induction, checked: anything malformed is no induction at all. */
export function normalizeInduction(raw: unknown): InductionState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const step = o.step;
  if (step !== 'done' && !(STEPS as readonly unknown[]).includes(step)) return null;
  return {
    step: step as StepId | 'done',
    looked: typeof o.looked === 'number' && Number.isFinite(o.looked) ? Math.max(0, o.looked) : 0,
    sanityTold: o.sanityTold === true,
  };
}

// ================================================================== the HUD, a meter at a time

/** The meters that wait until they matter. Sanity, the tool, the face and the career are there from the start. */
export const HUD_METERS = ['energy', 'rep', 'loyly', 'promille', 'caffeine'] as const;
export type HudMeter = (typeof HUD_METERS)[number];

/** What the reveal rules look at. */
export interface MeterFacts {
  /** The induction's step, or null with no induction running. */
  readonly step: StepId | 'done' | null;
  readonly loyly: number;
  readonly maxLoyly: number;
  /** Runes known: a background that arrives with runes needs the Löyly meter at once. */
  readonly runes: number;
  readonly bac: number;
  readonly stomach: number;
  readonly caffeine: number;
  readonly crash: number;
}

/** A meter has changed when it is this far off where a career starts it. */
const MOVED = 0.5;

/**
 * Which of `hidden` are still hidden. Energy comes with the heavy swing (it
 * is what a heavy swing costs), REP and the queue with the ticket; Löyly,
 * promille and caffeine the first time each changes. Once shown, a meter
 * stays: the list only ever shrinks. With no induction running, energy and
 * REP have nothing left to wait for.
 */
export function stillHidden<T extends readonly HudMeter[]>(hidden: T, f: MeterFacts): T | HudMeter[] {
  const at = f.step === null ? Infinity : stepIndex(f.step);
  const waits = (m: HudMeter): boolean => {
    switch (m) {
      case 'energy': return at < stepIndex('heavy');
      case 'rep': return at < stepIndex('ticket');
      case 'loyly': return f.runes === 0 && f.loyly >= f.maxLoyly - MOVED;
      case 'promille': return f.bac <= 0 && f.stomach <= 0;
      case 'caffeine': return f.caffeine <= 0 && f.crash <= 0;
    }
    return false;
  };
  // Asked every frame while anything waits: the same list back, unallocated,
  // until something is actually revealed.
  return hidden.every(waits) ? hidden : hidden.filter(waits);
}

// ================================================================== the cards

/** A piece of an instruction: words, a key drawn as a keycap, or the mouse. */
export type CardBit =
  | { readonly text: string }
  | { readonly key: string }
  | { readonly mouse: 'left' | 'right' | 'wheel' | 'move' };

/** The keys as the player has them bound, by name ('E', 'Left Shift'). */
export interface CardKeys {
  readonly forward: string;
  readonly left: string;
  readonly back: string;
  readonly right: string;
  readonly interact: string;
  readonly map: string;
  /** The number key that picks the label maker. */
  readonly labelSlot: string;
}

export interface Card {
  /** Morag's line: one or two sentences, the game's voice. */
  readonly say: string;
  readonly doing: readonly CardBit[];
  /** A HUD cell the card points at, if any. */
  readonly point: 'tool' | 'sanity' | null;
  /** A second line, under the instruction. */
  readonly note: string | null;
}

export const MORAG = 'Morag from Internal IT';

/** The practice colleague, and the dummy (the dummy's name is the actor's own). */
export const PRACTICE_NAME = 'Sam from Sales (practice)';

/** Who the induction's one ticket is from: how the game knows it is the practice one. */
export const PRACTICE_TICKET_FROM = 'Morag (induction)';

export const SANITY_LINE = 'Sanity is your health. At zero you burn out.';

const t = (text: string): CardBit => ({ text });
const k = (key: string): CardBit => ({ key });

export function cardFor(st: InductionState, keys: CardKeys): Card {
  const plain = (say: string, doing: readonly CardBit[], point: Card['point'] = null, note: string | null = null): Card => ({ say, doing, point, note });
  const sanity = st.sanityTold ? SANITY_LINE : null;
  switch (st.step) {
    case 'look':
      return plain('Morning. Before anybody on this floor learns your name, have a look round.', [{ mouse: 'move' }, t('Move the mouse to look around.')]);
    case 'walk':
      return plain('I am the one in the green cardigan, looking at my watch. Come over.', [k(keys.forward), k(keys.left), k(keys.back), k(keys.right), t('Walk over to Morag.')]);
    case 'talk':
      return plain('Sam from Sales has volunteered to complain at you. It is practice; whatever you say will work.', [k(keys.interact), t('Talk to the colleague marked PRACTICE, then pick a reply.')]);
    case 'swing':
      return plain('Facilities lent us a training dummy. It has been through worse than you.', [{ mouse: 'left' }, t('Tap to swing at the dummy.')]);
    case 'heavy':
      return plain('Now properly. A heavy swing costs energy, so it had better land.', [{ mouse: 'left' }, t('Hold until the ring fills, then let go on the dummy.')]);
    case 'label':
      return plain('The label maker is for things you would rather not stand next to. Labels run out: Internal IT sells more, and some turn up on the floor.', [k(keys.labelSlot), t('or'), { mouse: 'wheel' }, t('Switch to the label maker, then'), { mouse: 'left' }, t('fire at the dummy.')], 'tool', 'Your labels are counted under TOOL.');
    case 'block':
      return plain('The dummy has been told to swing back. Watch it wind up.', [{ mouse: 'right' }, t('Hold to block its swing. Face it.')], sanity === null ? null : 'sanity', sanity);
    case 'parry':
      return plain('Good. Now raise the block late, in the last moment of the wind-up: that is a parry.', [{ mouse: 'right' }, t('Press just before the swing lands.')], sanity === null ? null : 'sanity', sanity);
    case 'ticket':
      return plain('Real work now. One ticket is waiting on the lobby computer, and it is an easy one.', [k(keys.interact), t('Log on at the lobby computer and fix the ticket.')]);
    case 'map':
      return plain('Last thing. The building is bigger than it looks from here.', [k(keys.map), t('Open the map.')]);
    case 'done':
      return plain('', []);
  }
}

/** Morag at the door, before the first card. */
export function welcomeLine(name: string): string {
  return `Welcome to Workgrumble, ${name}. I am Morag from Internal IT, and this morning is your induction: nothing on this floor will notice you until we are done.`;
}

/** Morag once it is over. Sanity is told here if no practice hit ever got through. */
export function closingLines(st: InductionState): string {
  const base = 'That is your induction: the floor is open, and the lift goes up once the major incident is dealt with. Fridays are the mökki.';
  return st.sanityTold ? base : `${base} ${SANITY_LINE}`;
}

/** Morag, if you talk to her mid-induction: the step again, in other words. */
export const MORAG_NUDGE = 'I am not going anywhere until you have done the thing on the card. Neither are you.';

/** The colleague's complaint, before and after. */
export const PRACTICE_COMPLAINT = 'My screen has gone sideways and I would like it logged as a security incident.';
export const PRACTICE_THANKS = 'Oh. That was it. I will tell everyone you were very firm with me.';
