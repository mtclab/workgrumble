import * as THREE from 'three';
import { sfx } from './audio';
import { TICKETS } from './content/tickets';
import { type DialogueNode, said } from './dialogue';
import { disposeTree } from './dispose';
import { type Actor, disposeActor, say, setMarker, walkClear } from './entities';
import type { Game } from './game';
import {
  advance,
  type Card,
  type CardBit,
  type CardKeys,
  cardFor,
  closingLines,
  type InductionEvent,
  type InductionState,
  MORAG,
  MORAG_NUDGE,
  MORAG_REACH,
  partOf,
  PARTS,
  PRACTICE_COMPLAINT,
  PRACTICE_NAME,
  PRACTICE_THANKS,
  PRACTICE_TICKET_FROM,
  SANITY_LINE,
} from './induction';
import { itemById } from './items';
import { cellCenter, flowField, type Interactable, type Level, lineOfSight, toCell } from './level';
import { inductionTerminalMesh } from './meshes';
import { keyName } from './settings';
import { screenTexture } from './textures';
import { cancelWindup } from './windup';

/**
 * Induction day on the screen (docs/SPEC_INDUCTION.md): Morag, a practice
 * colleague, Facilities' training dummy and a computer put in the lobby for
 * the morning, and the card at the top of the screen that says what to do
 * next. The rules (what moves a step on, when the floor wakes up, which
 * meters show) are in `induction.ts`; this is the part with a scene.
 *
 * Everything here exists only while the induction runs, and `dispose` takes
 * all of it away again: the people, the computer (its mesh, its materials,
 * its screen, its place in the grid and the list of things to use) and the
 * card. A reload builds it again from the saved step.
 */

/** The lobby computer's id: well clear of anything a level numbers itself. */
export const INDUCTION_TERMINAL_ID = 9_000_001;

/** Morag's clothes: the green cardigan the card mentions, and the lanyard of somebody who has seen it all. */
const MORAG_OUTFIT = {
  skin: 0xe8b98f, hair: 0x8a8a8a, top: 0xf0ece0, legs: 0x3a3a44, cardigan: 0x2e7d4f,
  lanyard: 0x2266cc, hairStyle: 'bun', glasses: true, face: 'neutral',
} as const;

const GREEN = '#7dff9a';
const PRACTICE = '#7dffea';

/** A cell in the grid, and the world point at its middle. */
interface Spot {
  readonly cx: number;
  readonly cz: number;
}

/** Where the morning's props go in the lobby. The computer is null only if no lobby cell can take it without cutting something off. */
export interface PropPlan {
  readonly morag: Spot;
  readonly colleague: Spot;
  readonly dummy: Spot;
  readonly terminal: (Spot & { readonly facing: number }) | null;
}

/**
 * Pick the props' cells in the lobby (room 0), the same way every time for
 * the same floor, so a reload puts everyone back where they were. Morag a
 * few steps in front of where you arrive, the colleague beside her, the
 * dummy with room round it, the computer against a wall where blocking the
 * cell cuts nothing off. Never the arrival cell or a doorway. A pure
 * function of the level's grid (the tests run it on generated floors).
 */
export function planProps(level: Level): PropPlan {
  const lobby = level.rooms[0];
  const sx = toCell(level.start.x);
  const sz = toCell(level.start.z);
  const free = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < level.w && z < level.h && level.floor[z * level.w + x] === 1 && level.solid[z * level.w + x] === 0;
  const inRoom = (x: number, z: number): boolean => lobby !== undefined && x >= lobby.x && z >= lobby.y && x < lobby.x + lobby.w && z < lobby.y + lobby.h;
  const doorway = (x: number, z: number): boolean => {
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!inRoom(x + ox, z + oz) && level.floor[(z + oz) * level.w + x + ox] === 1) return true;
    }
    return false;
  };
  const cells: Spot[] = [];
  if (lobby !== undefined) {
    for (let z = lobby.y; z < lobby.y + lobby.h; z++) {
      for (let x = lobby.x; x < lobby.x + lobby.w; x++) {
        if (free(x, z) && !(x === sx && z === sz) && !doorway(x, z)) cells.push({ cx: x, cz: z });
      }
    }
  }
  const taken: Spot[] = [];
  const dist = (a: Spot, bx: number, bz: number): number => Math.hypot(a.cx - bx, a.cz - bz);
  const apart = (c: Spot): boolean => taken.every((o) => dist(c, o.cx, o.cz) >= 1.5);
  /** The best-scoring free cell (lowest score), or a fallback near the arrival. */
  const pick = (score: (c: Spot) => number, fallback: Spot): Spot => {
    let best: Spot | null = null;
    let bestScore = Infinity;
    for (const c of cells) {
      if (taken.some((o) => o.cx === c.cx && o.cz === c.cz) || !apart(c)) continue;
      const v = score(c);
      if (v < bestScore) {
        bestScore = v;
        best = c;
      }
    }
    const out = best ?? fallback;
    taken.push(out);
    return out;
  };
  // You arrive facing +z: Morag three cells ahead, near enough to see at once.
  const morag = pick((c) => Math.abs(dist(c, sx, sz) - 3) + (c.cz < sz ? 2 : 0) + Math.abs(c.cx - sx) * 0.3, { cx: sx, cz: sz + 2 });
  const colleague = pick((c) => Math.abs(dist(c, morag.cx, morag.cz) - 2) + Math.abs(dist(c, sx, sz) - 3) * 0.3, { cx: sx + 1, cz: sz + 2 });
  // The dummy wants open floor on every side, so there is somewhere to stand in front of it.
  const open = (c: Spot): number => AROUND.slice(0, 4).filter(([ox, oz]) => free(c.cx + ox, c.cz + oz)).length;
  const dummy = pick((c) => (4 - open(c)) * 3 + Math.abs(dist(c, sx, sz) - 3), { cx: sx - 2, cz: sz });

  // The computer: against a wall, away from the doors and the lift, where
  // blocking the cell leaves everything that was reachable still reachable.
  // A cramped lobby relaxes that a rule at a time, down to any free cell.
  let terminal: PropPlan['terminal'] = null;
  if (lobby !== undefined) {
    const before = reachable(level, level.start.x, level.start.z);
    const edge = (c: Spot): boolean => c.cx === lobby.x || c.cx === lobby.x + lobby.w - 1 || c.cz === lobby.y || c.cz === lobby.y + lobby.h - 1;
    const byDoor = (c: Spot): boolean => AROUND.some(([ox, oz]) => inRoom(c.cx + ox, c.cz + oz) && doorway(c.cx + ox, c.cz + oz));
    // The lift you arrived by is on the top wall, in the middle.
    const byLift = (c: Spot): boolean => c.cz === lobby.y && Math.abs(c.cx - sx) <= 1;
    const crowds = (c: Spot): boolean => taken.some((o) => dist(c, o.cx, o.cz) < 1.5);
    const tier = (c: Spot): number => (edge(c) ? 0 : 2) + (byDoor(c) || byLift(c) ? 1 : 0) + (crowds(c) ? 4 : 0);
    const order = cells
      .filter((c) => !taken.some((o) => o.cx === c.cx && o.cz === c.cz))
      .map((c) => ({ c, rank: tier(c) * 1000 + dist(c, sx, sz) }))
      .sort((a, b) => a.rank - b.rank || a.c.cz - b.c.cz || a.c.cx - b.c.cx);
    for (const { c } of order) {
      const i = c.cz * level.w + c.cx;
      level.solid[i] = 1;
      const after = reachable(level, level.start.x, level.start.z);
      level.solid[i] = 0;
      if (after !== before - 1) continue;
      // A wall cell faces into the room; one standing free faces where you arrive.
      const facing = c.cz === lobby.y ? 0 : c.cz === lobby.y + lobby.h - 1 ? Math.PI
        : c.cx === lobby.x ? Math.PI / 2 : c.cx === lobby.x + lobby.w - 1 ? -Math.PI / 2
          : Math.atan2(sx - c.cx, sz - c.cz);
      terminal = { cx: c.cx, cz: c.cz, facing };
      break;
    }
  }
  return { morag, colleague, dummy, terminal };
}

const AROUND: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/** How many cells can be walked to from (x, z). */
function reachable(level: Level, x: number, z: number): number {
  let n = 0;
  for (const d of flowField(level, x, z, 32000)) if (d >= 0) n++;
  return n;
}

/** The easy ticket: a sideways screen, with a hunch pointing at the fix. */
function practiceTicket(): number {
  const i = TICKETS.findIndex((t) => t.id === 'ticket:rotated-screen');
  if (i >= 0) return i;
  // Whichever is least urgent, if that one ever goes.
  let best = 0;
  TICKETS.forEach((t, k) => { if (t.urgency < (TICKETS[best]?.urgency ?? Infinity)) best = k; });
  return best;
}

const MOUSE_SVG: Record<'left' | 'right' | 'wheel' | 'move', string> = {
  left: '<path d="M2 9h8V1.2C5.5 1.5 2 4.5 2 9z" fill="currentColor"/>',
  right: '<path d="M18 9h-8V1.2c4.5.3 8 3.3 8 7.8z" fill="currentColor"/>',
  wheel: '<rect x="8.4" y="3.5" width="3.2" height="6" rx="1.6" fill="currentColor"/>',
  move: '<path d="M10 11l-3.5-3h7zM10 23l-3.5-3h7z" fill="currentColor" transform="translate(0 -4)"/>',
};

/** The mouse, drawn: an outline with the button that matters filled in. */
function mouseGlyph(which: 'left' | 'right' | 'wheel' | 'move'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'induct-mouse';
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', which === 'move' ? 'mouse' : which === 'wheel' ? 'mouse wheel' : `${which} mouse button`);
  // Static markup from the table above, nothing from outside.
  s.innerHTML = `<svg viewBox="0 0 20 28" width="15" height="21" aria-hidden="true"><rect x="2" y="1" width="16" height="26" rx="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 9h16M10 1v8" stroke="currentColor" stroke-width="1.2"/>${MOUSE_SVG[which]}</svg>`;
  return s;
}

function bitEl(b: CardBit): HTMLElement {
  if ('key' in b) {
    const k = document.createElement('kbd');
    k.className = 'induct-key';
    k.textContent = b.key;
    return k;
  }
  if ('mouse' in b) return mouseGlyph(b.mouse);
  const t = document.createElement('span');
  t.textContent = b.text;
  return t;
}

export class InductionDay {
  private readonly g: Game;
  private readonly st: InductionState;
  morag: Actor | null = null;
  colleague: Actor | null = null;
  dummy: Actor | null = null;
  /** The lobby computer: its entry in the level, its mesh, and what its cell was before. */
  private terminal: { readonly it: Interactable; readonly mesh: THREE.Group; readonly cell: number; readonly wasSolid: number } | null = null;
  private readonly card: HTMLDivElement;
  /** What the card was last built for, so it is only rebuilt when that changes. */
  private shown = '';
  private complainIn = 1;
  private disposed = false;

  constructor(g: Game, st: InductionState) {
    this.g = g;
    this.st = st;
    const plan = planProps(g.level);
    const at = (s: Spot): [number, number] => [cellCenter(s.cx), cellCenter(s.cz)];
    const [mx, mz] = at(plan.morag);
    this.morag = g.spawnAt('npc', mx, mz, 0, false, { npc: { id: 'induction-morag', name: MORAG }, outfit: MORAG_OUTFIT });
    const [cx, cz] = at(plan.colleague);
    this.colleague = g.spawnAt('npc', cx, cz, 0, false, { npc: { id: 'induction-practice', name: PRACTICE_NAME } });
    const [dx, dz] = at(plan.dummy);
    this.dummy = g.spawnAt('dummy', dx, dz, 0, false);
    if (this.dummy !== null) this.dummy.yaw = Math.atan2(g.level.start.x - dx, g.level.start.z - dz);
    if (plan.terminal !== null) this.placeTerminal(plan.terminal);
    this.card = document.createElement('div');
    this.card.className = 'hud-induct';
    this.card.dataset.testid = 'induction-card';
    this.card.setAttribute('role', 'status');
    g.hud.root.append(this.card);
    g.hud.root.classList.add('has-induction');
    this.markers();
    if (st.step === 'ticket') this.ensureTicket();
    // Filled in at once: the card is on screen behind Morag's first words.
    this.render();
  }

  private placeTerminal(t: Spot & { readonly facing: number }): void {
    const g = this.g;
    const lv = g.level;
    const screen = typeof document === 'undefined' ? null : screenTexture(['WorkgrumbleOS', '', '> tickets: 1', '> press E'], '#0a3a8c');
    const mesh = inductionTerminalMesh(screen);
    const x = cellCenter(t.cx);
    const z = cellCenter(t.cz);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = t.facing;
    g.scene.add(mesh);
    const cell = t.cz * lv.w + t.cx;
    const wasSolid = lv.solid[cell] ?? 0;
    lv.solid[cell] = 1;
    const it: Interactable = { kind: 'terminal', x, z, id: INDUCTION_TERMINAL_ID, room: 0, used: false, mesh, lock: 0 };
    lv.interactables.push(it);
    this.terminal = { it, mesh, cell, wasSolid };
  }

  /** The keys as bound, for the card. */
  private keys(): CardKeys {
    const s = this.g.settings.keys;
    const weapons = this.g.save.gear.filter((x) => itemById(x.base)?.slot === 'weapon');
    const slot = weapons.findIndex((x) => x.base === 'labelmaker');
    return {
      forward: keyName(s.forward), left: keyName(s.left), back: keyName(s.back), right: keyName(s.right),
      interact: keyName(s.interact), map: keyName(s.map), labelSlot: String(slot >= 0 ? slot + 1 : 2),
    };
  }

  /** Once a frame of play. */
  update(dt: number): void {
    if (this.disposed) return;
    const g = this.g;
    const st = this.st;
    if (st.step === 'look') {
      const sens = 0.0022 * g.settings.sensitivity;
      const amount = (Math.abs(g.input.mouseDX) + Math.abs(g.input.mouseDY)) * sens;
      if (amount > 0) this.event({ type: 'look', amount });
    }
    const pp = g.player.pos;
    if (st.step === 'walk' && this.morag !== null && Math.hypot(this.morag.pos.x - pp.x, this.morag.pos.z - pp.z) < MORAG_REACH) this.event({ type: 'reached' });
    // The colleague rehearses the complaint until somebody listens.
    const c = this.colleague;
    if (c !== null && st.step === 'talk') {
      this.complainIn -= dt;
      if (this.complainIn <= 0) {
        this.complainIn = 7;
        if (Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 12) say(c, PRACTICE_COMPLAINT, 4);
      }
    }
    // The dummy swings only while it is the lesson.
    const d = this.dummy;
    if (d !== null) {
      const swinging = st.step === 'block' || st.step === 'parry';
      if (d.aggro && !swinging) cancelWindup(d);
      d.aggro = swinging;
    }
    this.render();
  }

  /** Something happened that the induction may be waiting for. */
  event(e: InductionEvent): void {
    if (this.disposed) return;
    const g = this.g;
    const r = advance(this.st, e);
    if (r.toldSanity) {
      g.hud.toast(SANITY_LINE, 'info');
      g.hud.pulseSanity();
    }
    if (!r.advanced) return;
    sfx.chime();
    this.markers();
    this.render();
    g.autosaveSoon();
    switch (this.st.step) {
      case 'block':
        g.tip('block');
        break;
      case 'ticket':
        this.ensureTicket();
        break;
      case 'done':
        g.openDialogue(said(MORAG, closingLines(this.st), 'good', 'Get to work'), () => g.endInduction());
        break;
      default:
        break;
    }
  }

  /** E on one of the morning's people. True if it was one (and the conversation is open). */
  talk(a: Actor): boolean {
    if (this.disposed) return false;
    const g = this.g;
    if (a === this.morag) {
      g.openDialogue(said(MORAG, this.st.step === 'walk' ? 'Here I am. That was walking.' : MORAG_NUDGE, 'neutral', 'Right'));
      return true;
    }
    if (a === this.colleague) {
      g.openDialogue(this.st.step === 'talk' ? this.practiceNode(a) : said(PRACTICE_NAME, 'I am back to being a normal user now. Please do not staple me.', 'neutral'));
      return true;
    }
    return false;
  }

  /**
   * The practice talk-down: the shape of a real one (walk them through the
   * fix, or ask for a ticket), except that it cannot fail. The real ones
   * print their odds in the same place.
   */
  private practiceNode(a: Actor): DialogueNode {
    const done = (): DialogueNode => {
      a.talked = true;
      this.event({ type: 'talked' });
      return said(PRACTICE_NAME, PRACTICE_THANKS, 'good', 'Glad to help');
    };
    return {
      speaker: PRACTICE_NAME,
      subtitle: 'Practice complaint',
      text: `"${PRACTICE_COMPLAINT}" Real people print the odds of each reply here. This one always works.`,
      options: [
        { label: 'Walk them through it: "Put the display back with rotate SALES-02 0."', tag: 'Practice 100%', pick: done },
        { label: 'Could you raise a ticket for that, please?', tag: 'Practice 100%', pick: done },
      ],
    };
  }

  /** The ticket step's one ticket: in the queue (once), with the right fix hinted. */
  private ensureTicket(): void {
    const g = this.g;
    const s = g.save;
    let q = s.queue.find((x) => x.from === PRACTICE_TICKET_FROM);
    if (q === undefined) {
      q = { t: practiceTicket(), sla: 3600, from: PRACTICE_TICKET_FROM, struck: [], gold: false };
      s.queue.push(q);
      sfx.phone();
      g.hud.toast('A ticket from Morag is waiting on the lobby computer.', 'info');
    }
    // An easy one: the hunch always points at the fix (and survives a reload,
    // which rebuilds the fix cache).
    const opts = g.fixOptions(q);
    const right = opts.find((o) => TICKETS[q.t]?.fixes.includes(o) === true) ?? null;
    g.fixCache.set(q, { opts, hint: right });
  }

  /** Who has a marker over their head: Morag until you reach her, the colleague until talked to. */
  private markers(): void {
    const st = this.st.step;
    if (this.morag !== null) setMarker(this.morag, st === 'look' || st === 'walk' ? '!' : null, GREEN);
    if (this.colleague !== null) setMarker(this.colleague, st === 'talk' ? 'PRACTICE' : null, PRACTICE);
  }

  private render(): void {
    const g = this.g;
    const st = this.st;
    const keys = this.keys();
    const card: Card = cardFor(st, keys);
    const key = `${st.step}|${String(st.sanityTold)}|${Object.values(keys).join(',')}`;
    g.hud.point(card.point);
    if (key === this.shown) return;
    this.shown = key;
    const el = this.card;
    el.dataset.step = st.step;
    el.replaceChildren();
    if (st.step === 'done') {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const head = document.createElement('div');
    head.className = 'induct-head';
    head.textContent = `Induction · ${partOf(st.step)} of ${PARTS}`;
    const sayEl = document.createElement('p');
    sayEl.className = 'induct-say';
    const who = document.createElement('b');
    who.textContent = 'Morag: ';
    sayEl.append(who, card.say);
    const doing = document.createElement('p');
    doing.className = 'induct-do';
    doing.append(...card.doing.map(bitEl));
    el.append(head, sayEl, doing);
    if (card.note !== null) {
      const note = document.createElement('p');
      note.className = 'induct-note';
      note.textContent = card.note;
      el.append(note);
    }
  }

  /**
   * For the browser tests: stand `dist` metres from one of the props, facing
   * it, on open lobby floor with a clear walk to it. The steps themselves are
   * then played with real keys and the real mouse. False if nowhere fits.
   */
  standBefore(which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number): boolean {
    const g = this.g;
    const lv = g.level;
    const target = which === 'terminal' ? (this.terminal === null ? null : { x: this.terminal.it.x, z: this.terminal.it.z }) : this[which]?.pos ?? null;
    if (target === null) return false;
    for (let k = 0; k < 24; k++) {
      const ang = (k * Math.PI) / 12;
      const x = target.x + Math.sin(ang) * dist;
      const z = target.z + Math.cos(ang) * dist;
      const cx = toCell(x);
      const cz = toCell(z);
      if (cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h || lv.solid[cz * lv.w + cx] !== 0 || lv.floor[cz * lv.w + cx] !== 1) continue;
      // Nothing between, and nobody else standing on the spot.
      if (!lineOfSight(lv, x, z, target.x, target.z) || (which !== 'terminal' && !walkClear(lv, x, z, target.x, target.z))) continue;
      if (g.actors.some((a) => !a.resolved && Math.hypot(a.pos.x - x, a.pos.z - z) < 0.9)) continue;
      g.player.pos.set(x, 0, z);
      // The player faces -sin(yaw), -cos(yaw).
      g.player.yaw = Math.atan2(x - target.x, z - target.z);
      g.player.pitch = 0;
      return true;
    }
    return false;
  }

  /**
   * Take the morning's scene away: people, computer, card. Safe to call
   * twice. The saved step (and a practice ticket still in the queue) stay:
   * this is also what a reload does before building it all again.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const g = this.g;
    const mine = [this.morag, this.colleague, this.dummy].filter((a): a is Actor => a !== null);
    for (const a of mine) disposeActor(g.scene, a);
    g.actors = g.actors.filter((a) => !mine.includes(a));
    this.morag = null;
    this.colleague = null;
    this.dummy = null;
    const t = this.terminal;
    if (t !== null) {
      g.scene.remove(t.mesh);
      disposeTree(t.mesh, true);
      const list = g.level.interactables;
      const i = list.indexOf(t.it);
      if (i >= 0) list.splice(i, 1);
      g.level.solid[t.cell] = t.wasSolid;
      if (g.currentTerminal === t.it) g.currentTerminal = null;
      g.loggedOn.delete(t.it.id);
      this.terminal = null;
    }
    this.card.remove();
    g.hud.root.classList.remove('has-induction');
    g.hud.point(null);
  }
}
