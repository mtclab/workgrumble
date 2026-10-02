import type { RoomKind } from './level';
import type { Rng } from './rng';

/**
 * Level templates with a purpose (docs/SPEC_HELLDESK_030.md 3.2), hand-placed
 * as footprints: the 0.3.0 spike's two, behind `generateLevel`'s recipe
 * argument. A footprint is drawn the way the spec draws it, one character a
 * 2 m cell, and furnished afterwards by room kind with the existing code.
 *
 *   #  wall                      .  corridor           D  door (a corridor cell)
 *   =  glass: blocks the way, not the view (a cell class of its own)
 *   s  the service spine (corridor)   v  a service door onto it (open: no doors in the spike)
 *   p  a node on the spine: the one point a patrol crosses it (S1b's stapler tuning)
 *   n  a corridor node (patrols walk between them; each also hangs a light)
 *   L  lobby, the entry lift's room (always room 0)
 *   H  HR's office   O  an office   C  open-plan desks   M  a meeting room behind glass
 *   I  Internal IT's counter   V  an open pitch area (the vendors' pocket)
 *
 * Every run of one room letter must be a filled rectangle: that is the room.
 * Variety is a mirror image, picked by the level's seed.
 */
export type RecipeId = 'officeRow' | 'meetingRing' | 'annex';

/** Every recipe, for the gates that walk them all. */
export const RECIPES: readonly RecipeId[] = ['officeRow', 'meetingRing', 'annex'];

/** What a letter is: its room kind, and the tag the mission finds it by. */
const ROOMS: Readonly<Record<string, { readonly kind: RoomKind; readonly tag: string }>> = {
  L: { kind: 'lobby', tag: 'lobby' },
  H: { kind: 'office', tag: 'hr' },
  O: { kind: 'office', tag: 'office' },
  C: { kind: 'cubicles', tag: 'open' },
  M: { kind: 'meeting', tag: 'meeting' },
  I: { kind: 'it', tag: 'it' },
  V: { kind: 'lobby', tag: 'pitch' },
  // The S2a templates' rooms (composed floors only).
  K: { kind: 'kitchen', tag: 'kitchen' },
  S: { kind: 'server', tag: 'server' },
  A: { kind: 'lobby', tag: 'atrium' },
  B: { kind: 'boss', tag: 'arena' },
  P: { kind: 'print', tag: 'print' },
  U: { kind: 'sauna', tag: 'sauna' },
};

/**
 * T3, the corner-office row (spec 3.2), with a stub of T8, the service spine:
 * four offices off a corridor, HR's at the far end, and a cleaner's corridor
 * behind them that runs from the lobby's back door to HR's back door and
 * nowhere else. The open plan across the corridor has a view of it.
 */
const OFFICE_ROW = [
  '####################################',
  '##ssssssssssssssssssssssspssssss####',
  '##ssssssssssssssssssssssssssssss####',
  '##v##########################v######',
  '#LLLLLLL#OOOOO#OOOOO#OOOOO#HHHHH####',
  '#LLLLLLL#OOOOO#OOOOO#OOOOO#HHHHH####',
  '#LLLLLLL#OOOOO#OOOOO#OOOOO#HHHHH####',
  '#LLLLLLL#OOOOO#OOOOO#OOOOO#HHHHH####',
  '#LLLLLLL###D#####D#####D#####D######',
  '#LLLLLLL...n.....n.....n.....n....##',
  '#LLLLLLL..........................##',
  '############D#################D#####',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '#########CCCCCCCCCCCCCCCCCCCCCCCCC##',
  '####################################',
];

/**
 * T2, the meeting ring (spec 3.2): three glass boxes with a corridor looping
 * round all of them, so there is always another way round. Larger than the
 * spec's sketch so each box holds a table (furnishing needs 5 x 5).
 */
const MEETING_RING = [
  '##########################################',
  '#########n.........n.........n..........n#',
  '#########................................#',
  '#LLLLLLL#..========..========..========..#',
  '#LLLLLLL#..=MMMMMM=..=MMMMMM=..=MMMMMM=..#',
  '#LLLLLLL...=MMMMMM=..=MMMMMM=..=MMMMMM=..#',
  '#LLLLLLL...=MMMMMMD..=MMMMMMD..=MMMMMMD..#',
  '#LLLLLLL#..=MMMMMM=..=MMMMMM=..=MMMMMM=..#',
  '#LLLLLLL#..=MMMMMM=..=MMMMMM=..=MMMMMM=..#',
  '#LLLLLLL#..========..========..========..#',
  '#########................................#',
  '#########n.........n.........n..........n#',
  '##########################################',
];

/**
 * The annex (Josh's First Day, card #3): T2's loop round a straight way
 * from the lift to Internal IT's counter. The straight way runs through an
 * open pitch area (the vendors' pocket, walled off from the loop); the loop
 * goes round it, past glass on either side of the straight way.
 */
const ANNEX = [
  '##################################################',
  '#########n.........n.........n.........n.#########',
  '#########........################........#########',
  '#LLLLLLL#..======####VVVVVVVV####======..#IIIIIII#',
  '#LLLLLLL#..======####VVVVVVVV####======..#IIIIIII#',
  '#LLLLLLL.............VVVVVVVV............DIIIIIII#',
  '#LLLLLLL.............VVVVVVVV............DIIIIIII#',
  '#LLLLLLL#..======####VVVVVVVV####======..#IIIIIII#',
  '#LLLLLLL#..======####VVVVVVVV####======..#IIIIIII#',
  '#########..############################..#########',
  '#########........################........#########',
  '#########n.........n.........n.........n.#########',
  '##################################################',
];

const FOOTPRINTS: Readonly<Record<RecipeId, readonly string[]>> = {
  officeRow: OFFICE_ROW,
  meetingRing: MEETING_RING,
  annex: ANNEX,
};

export interface PlanRoom {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly kind: RoomKind;
  readonly tag: string;
}

/** A recipe laid out: the grid to carve and what the mission needs to find in it. */
export interface RecipePlan {
  readonly id: RecipeId | ComposedId;
  readonly w: number;
  readonly h: number;
  /** The footprint as laid (mirrored or not), one string a row. */
  readonly rows: readonly string[];
  /** Rooms, the lobby first. */
  readonly rooms: readonly PlanRoom[];
  /** Cell indices of glass, the spine (with its doors) and the corridor nodes. */
  readonly glass: readonly number[];
  readonly spine: readonly number[];
  readonly nodes: readonly number[];
  /** Nodes on the spine itself: where a patrol that crosses it goes. */
  readonly spineNodes: readonly number[];
  /** A composed floor's (compose.ts): the templates as placed, and what they hold. */
  readonly composed?: ComposedExtras;
}

/** What a floor composed from templates carries besides the footprint. */
export interface ComposedExtras {
  readonly templates: readonly PlacedTemplate[];
  /** The objective's template (an index into `templates`), or -1 (the hub has none). */
  readonly objective: number;
  /** Structure inside the templates, as world cells: the furnishing places these first. */
  readonly features: readonly PlacedFeature[];
  /** Alcove cells off the service spine, each for a supply closet. */
  readonly closets: readonly number[];
}

/** A template where the composer put it. */
export interface PlacedTemplate {
  readonly id: TemplateId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Room ids (indices into the plan's rooms). */
  readonly rooms: readonly number[];
  /** Its edge doors, every one opened onto a corridor (cells). */
  readonly doors: readonly number[];
  /** Its service doors the spine came in by (cells), usually none. */
  readonly service: readonly number[];
}

export interface PlacedFeature {
  readonly kind: FeatureKind;
  readonly cell: number;
}

// ---------------------------------------------------------------------------
// S2a: templates with a purpose (docs/SPEC_HELLDESK_030.md 3.2), as pieces a
// floor is composed from (compose.ts), and the recipes that list them.

/**
 * The templates. T8, the service spine, is not a piece: the composer routes
 * it between two templates' service doors when a recipe asks for one.
 *
 *   T1  open-plan bullpen: rows of desk pods, aisles between, four doors
 *   T2  meeting ring: glass boxes with a walk all round them
 *   T3  corner-office row: offices (HR's at the end) off a corridor, service doors behind
 *   T4  kitchen hub: an island counter (cover) and four spokes
 *   T5  server hall: rack aisles (solid and opaque), one cross aisle, the hum
 *   T6  atrium loop: a planted void with a walk round it and a landmark in it
 *   T7  lobby and lift: the arrival, a reception desk facing the lift
 *   T9  boss arena: today's boss room
 *   T10 print and post room: today's print room, plus the shredder
 *   sauna, it: the hub's sauna and Internal IT's counter
 */
export type TemplateId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T9' | 'T10' | 'sauna' | 'it';

export const TEMPLATES: readonly TemplateId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T9', 'T10', 'sauna', 'it'];

/**
 * Structure a template places before the room's own furnishing:
 * an aisle kept clear of furniture, a counter (solid, see-over, chest-high
 * cover), a planter (solid, see-through), the landmark, a server rack (solid
 * and opaque), the hall's terminal and spares crate, the shredder, and a
 * corridor node inside the template (patrols and lights).
 */
export type FeatureKind = 'aisle' | 'counter' | 'planter' | 'landmark' | 'rack' | 'terminal' | 'crate' | 'shredder' | 'node';

export interface Feature {
  readonly kind: FeatureKind;
  readonly x: number;
  readonly y: number;
}

/** A door on a template's edge, and the way out of it. */
export interface Door {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** A template laid: its footprint in the variant the dice picked. */
export interface Piece {
  readonly id: TemplateId;
  readonly w: number;
  readonly h: number;
  /**
   * One string a row, the footprint's characters: `#` wall, `.` floor that is
   * no room's, a room letter, `=` glass, `D` a door (on the edge: onto a
   * corridor; inside: between a room and the template's own floor), `v` a
   * service door (edge only: the spine's way in).
   */
  readonly rows: readonly string[];
  readonly rooms: readonly PlanRoom[];
  readonly doors: readonly Door[];
  readonly service: readonly Door[];
  readonly features: readonly Feature[];
  /** How it was laid: mirrored left-right, top-bottom, and turned (transposed). */
  readonly variant: { readonly flipX: boolean; readonly flipY: boolean; readonly turn: boolean };
}

/** A footprint being drawn: all wall to begin with. */
class Sketch {
  readonly cells: string[][];
  readonly features: Feature[] = [];
  constructor(readonly w: number, readonly h: number) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => '#'));
  }

  set(x: number, y: number, c: string): void {
    const row = this.cells[y];
    if (row === undefined || x < 0 || x >= this.w) throw new Error(`sketch: ${x},${y} is outside`);
    row[x] = c;
  }

  fill(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  mark(kind: FeatureKind, x: number, y: number): void {
    this.features.push({ kind, x, y });
  }

  rows(): string[] {
    return this.cells.map((row) => row.join(''));
  }
}

/** An edge spot for a service door: off the middle (where the doors are), never a corner. */
function offMiddle(r: Rng, len: number): number {
  const mid = len >> 1;
  const reach = Math.max(2, mid - 2);
  return mid + (r.chance(0.5) ? -1 : 1) * r.int(2, reach);
}

/**
 * T1, the open-plan bullpen: 11 rows of desks (the open plan's furnishing
 * lays a row of desks with a partition every third row), split into pods by
 * aisles. The aisles between the four doors cross in the middle, so the
 * room loops; pods are 3 to 5 desks long.
 */
function sketchBullpen(r: Rng): Sketch {
  const iw = r.pick([17, 19, 21, 23]);
  const ih = 11;
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'C');
  const midX = 1 + (iw >> 1);
  const midY = 1 + (ih >> 1);
  s.set(0, midY, 'D');
  s.set(iw + 1, midY, 'D');
  s.set(midX, 0, 'D');
  s.set(midX, ih + 1, 'D');
  s.set(offMiddle(r, iw) + 1, ih + 1, 'v');
  for (let x = 1; x <= iw; x++) s.mark('aisle', x, midY);
  const pod = r.int(3, 5);
  const gaps = new Set<number>([midX]);
  // Pods out from the middle aisle each way: a gap every `pod` desks.
  for (let x = midX + pod + 1; x < iw; x += pod + 1) gaps.add(x);
  for (let x = midX - pod - 1; x > 1; x -= pod + 1) gaps.add(x);
  for (const x of gaps) for (let y = 1; y <= ih; y++) if (y !== midY) s.mark('aisle', x, y);
  return s;
}

/**
 * T2, the meeting ring: two or three glass boxes (a table in each) with a
 * corridor two cells wide all round them, and a door on every side.
 */
function sketchRing(r: Rng): Sketch {
  const n = r.pick([2, 3]);
  const iw = 10 * n + 2;
  const ih = 11;
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, '.');
  for (let k = 0; k < n; k++) {
    const bx = 3 + k * 10;
    s.fill(bx, 3, 8, 7, '=');
    s.fill(bx + 1, 4, 6, 5, 'M');
    s.set(r.chance(0.5) ? bx + 7 : bx, 6, 'D');
    s.mark('node', bx + 3, 1);
    s.mark('node', bx + 4, ih);
  }
  const midX = 1 + (iw >> 1);
  s.set(midX, 0, 'D');
  s.set(midX, ih + 1, 'D');
  s.set(0, 6, 'D');
  s.set(iw + 1, 6, 'D');
  s.set(offMiddle(r, iw) + 1, ih + 1, 'v');
  for (const [x, y] of [[1, 1], [iw, 1], [1, ih], [iw, ih]] as const) s.mark('node', x, y);
  return s;
}

/**
 * T3, the corner-office row: three or four offices and HR's at the end,
 * each 5 x 4 with its door onto a corridor that runs the length of the row.
 * Service doors on the back edge open straight into the offices from
 * behind: HR's always, the others as the dice say.
 */
function sketchOfficeRow(r: Rng): Sketch {
  const k = r.int(3, 4);
  const iw = (k + 1) * 6 - 1;
  const s = new Sketch(iw + 2, 9);
  for (let j = 0; j <= k; j++) {
    const ox = 1 + j * 6;
    s.fill(ox, 1, 5, 4, j === k ? 'H' : 'O');
    s.set(ox + 2, 5, 'D');
    s.mark('node', ox + 2, 6);
    if (j === k || r.chance(0.5)) s.set(ox + 2, 0, 'v');
  }
  s.fill(1, 6, iw, 2, '.');
  const side = r.pick([6, 7]);
  s.set(0, side, 'D');
  s.set(iw + 1, side, 'D');
  s.set(1 + (iw >> 1), 8, 'D');
  return s;
}

/** T4, the kitchen hub: an island counter in the middle (cover), a door on every side (the spokes). */
function sketchKitchen(r: Rng): Sketch {
  const iw = r.pick([11, 13]);
  const ih = r.pick([9, 11]);
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'K');
  for (let y = 4; y <= ih - 3; y++) for (let x = 4; x <= iw - 3; x++) s.mark('counter', x, y);
  const midX = 1 + (iw >> 1);
  const midY = 1 + (ih >> 1);
  s.set(midX, 0, 'D');
  s.set(midX, ih + 1, 'D');
  s.set(0, midY, 'D');
  s.set(iw + 1, midY, 'D');
  s.set(iw + 1, r.pick([2, ih - 1]), 'v');
  return s;
}

/**
 * T5, the server hall: racks in lines with one-cell aisles between them
 * (pure corridors: the racks are solid and opaque), and one cross aisle two
 * cells wide. The hall's terminal and spares crate stand in two rack slots
 * at opposite corners (where a rack would be, so no aisle is cut off);
 * doors open into the aisles.
 */
function sketchServerHall(r: Rng): Sketch {
  const iw = r.pick([11, 13, 15]);
  const ih = r.pick([10, 12]);
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'S');
  const m = ih >> 1;
  for (let ix = 0; ix < iw; ix++) {
    for (let iy = 0; iy < ih; iy++) {
      const cross = iy === m - 1 || iy === m;
      const slot = ix % 2 === 1 && !cross;
      const terminal = ix === 1 && iy === 0;
      const crate = ix === iw - 2 && iy === ih - 1;
      s.mark(terminal ? 'terminal' : crate ? 'crate' : slot ? 'rack' : 'aisle', ix + 1, iy + 1);
    }
  }
  const aisles = Array.from({ length: (iw - 1) / 2 - 1 }, (_, k) => 2 * (k + 1));
  s.set(1 + r.pick(aisles), 0, 'D');
  s.set(1 + r.pick(aisles), ih + 1, 'D');
  s.set(0, m + 1, 'D');
  s.set(iw + 1, m, 'v');
  return s;
}

/**
 * T6, the atrium loop: a planted void (solid, see-through) with a walk three
 * cells wide all round it, and the landmark planted in the void, in sight
 * from every side.
 */
function sketchAtrium(r: Rng): Sketch {
  const iw = r.pick([15, 17]);
  const ih = r.pick([11, 13]);
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'A');
  const lx = 1 + (iw >> 1) + r.pick([-2, 0, 2]);
  const ly = 1 + (ih >> 1);
  for (let y = 4; y <= ih - 3; y++) for (let x = 4; x <= iw - 3; x++) s.mark(x === lx && y === ly ? 'landmark' : 'planter', x, y);
  const midX = 1 + (iw >> 1);
  const midY = 1 + (ih >> 1);
  s.set(midX, 0, 'D');
  s.set(midX, ih + 1, 'D');
  s.set(0, midY, 'D');
  s.set(iw + 1, midY, 'D');
  s.set(offMiddle(r, iw) + 1, 0, 'v');
  return s;
}

/**
 * T7, the lobby and the lift: the lift doors go on the top wall (the
 * generator's lift rule), the reception desk (chest-high, see-over) stands
 * between them and the front door, and a back door near the lift.
 */
function sketchLobby(r: Rng): Sketch {
  const iw = r.pick([12, 14]);
  const ih = 7;
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'L');
  const midX = 1 + (iw >> 1);
  for (let x = midX - 1; x <= midX + 1; x++) s.mark('counter', x, 5);
  s.set(0, 4, 'D');
  s.set(iw + 1, 4, 'D');
  s.set(midX, ih + 1, 'D');
  s.set(r.pick([2, iw - 1]), 0, 'v');
  return s;
}

/** T9, the boss arena: today's boss room (pillars in its corners), doors front and back. */
function sketchArena(r: Rng): Sketch {
  const iw = r.pick([9, 11]);
  const s = new Sketch(iw + 2, iw + 2);
  s.fill(1, 1, iw, iw, 'B');
  const mid = 1 + (iw >> 1);
  s.set(mid, 0, 'D');
  s.set(mid, iw + 1, 'D');
  s.set(0, mid, 'v');
  return s;
}

/** T10, the print and post room: today's print room, with the shredder in its far corner. */
function sketchPrintRoom(r: Rng): Sketch {
  const iw = r.pick([7, 9]);
  const ih = 7;
  const s = new Sketch(iw + 2, ih + 2);
  s.fill(1, 1, iw, ih, 'P');
  s.mark('shredder', iw, 1);
  // Kept clear of the room's own furniture, so the shredder is always within reach.
  s.mark('aisle', iw - 1, 1);
  s.mark('aisle', iw, 2);
  s.set(0, 4, 'D');
  s.set(1 + (iw >> 1), ih + 1, 'D');
  s.set(2, 0, 'v');
  return s;
}

/** The hub's sauna: benches along one wall, one door. */
function sketchSauna(): Sketch {
  const s = new Sketch(9, 7);
  s.fill(1, 1, 7, 5, 'U');
  s.set(4, 6, 'D');
  return s;
}

/** Internal IT's counter: the counter runs along the top, so the doors are below it. */
function sketchItCounter(): Sketch {
  const s = new Sketch(11, 8);
  s.fill(1, 1, 9, 6, 'I');
  s.set(5, 7, 'D');
  s.set(0, 4, 'D');
  s.set(10, 5, 'v');
  return s;
}

const SKETCHES: Readonly<Record<TemplateId, (r: Rng) => Sketch>> = {
  T1: sketchBullpen,
  T2: sketchRing,
  T3: sketchOfficeRow,
  T4: sketchKitchen,
  T5: sketchServerHall,
  T6: sketchAtrium,
  T7: sketchLobby,
  T9: sketchArena,
  T10: sketchPrintRoom,
  sauna: sketchSauna,
  it: sketchItCounter,
};

/** Templates that only mirror left-right: Internal IT's counter is furnished along its top wall. */
const MIRROR_ONLY: ReadonlySet<TemplateId> = new Set(['it']);

/** Lay a template: its footprint drawn by the dice, then mirrored and turned by them. */
export function layTemplate(id: TemplateId, r: Rng): Piece {
  const s = SKETCHES[id](r);
  const flipX = r.chance(0.5);
  const flipY = !MIRROR_ONLY.has(id) && r.chance(0.5);
  const turn = !MIRROR_ONLY.has(id) && r.chance(0.5);
  return orient(id, s, { flipX, flipY, turn });
}

/** A sketch in one of its variants (exported for the gates, which lay every one). */
export function orient(id: TemplateId, s: { readonly w: number; readonly h: number; readonly features: readonly Feature[]; rows(): string[] }, variant: Piece['variant']): Piece {
  const { flipX, flipY, turn } = variant;
  const base = s.rows();
  const w = turn ? s.h : s.w;
  const h = turn ? s.w : s.h;
  // Where a base cell lands.
  const to = (x: number, y: number): [number, number] => {
    const fx = flipX ? s.w - 1 - x : x;
    const fy = flipY ? s.h - 1 - y : y;
    return turn ? [fy, fx] : [fx, fy];
  };
  const cells = Array.from({ length: h }, () => Array.from({ length: w }, () => '#'));
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const [nx, ny] = to(x, y);
      (cells[ny] as string[])[nx] = base[y]?.[x] ?? '#';
    }
  }
  const rows = cells.map((row) => row.join(''));
  const features = s.features.map((f) => {
    const [x, y] = to(f.x, f.y);
    return { kind: f.kind, x, y };
  });
  const doors: Door[] = [];
  const service: Door[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const c = rows[y]?.[x];
      if (!edge || (c !== 'D' && c !== 'v')) continue;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner) throw new Error(`${id}: a door in a corner`);
      const door = { x, y, dx: x === 0 ? -1 : x === w - 1 ? 1 : 0, dy: y === 0 ? -1 : y === h - 1 ? 1 : 0 };
      (c === 'D' ? doors : service).push(door);
    }
  }
  return { id, w, h, rows, rooms: scanRooms(id, rows), doors, service, features, variant };
}

/** Every variant of a template a sketch can be laid in (the gates walk them all). */
export function variantsOf(id: TemplateId): Piece['variant'][] {
  const out: Piece['variant'][] = [];
  for (const flipX of [false, true]) {
    for (const flipY of [false, true]) {
      for (const turn of [false, true]) {
        if (MIRROR_ONLY.has(id) && (flipY || turn)) continue;
        out.push({ flipX, flipY, turn });
      }
    }
  }
  return out;
}

/** A template's sketch alone, for the gates: the dice draw its inner variety. */
export function sketchOf(id: TemplateId, r: Rng): { readonly w: number; readonly h: number; readonly features: readonly Feature[]; rows(): string[] } {
  return SKETCHES[id](r);
}

// ---------------------------------------------------------------------------
// Recipes: floors composed from templates (compose.ts).

/** What a recipe's floor is for: the style its cards are (or the hub, or one template on show). */
export type RecipeStyle = 'hub' | 'sneaky' | 'loud' | 'mixed' | 'social' | 'escort' | 'investigation' | 'show';

/** A template in a recipe; `chance` below 1 is a template only some floors have (the hub's sauna). */
export interface RecipeSlot {
  readonly id: TemplateId;
  readonly chance?: number;
}

export interface ComposedRecipe {
  readonly style: RecipeStyle;
  /** The templates, the entry (the lobby, T7) first. */
  readonly templates: readonly RecipeSlot[];
  /** Independent loops the floor has at least (counted by `loopCount`). */
  readonly loops: number;
  /** Route a service spine from the lobby to the objective's template. */
  readonly spine: boolean;
  /** The template the objective is in, or null (the hub). */
  readonly objective: TemplateId | null;
}

const slots = (...ids: TemplateId[]): RecipeSlot[] => ids.map((id) => ({ id }));

/**
 * The floors composed from templates. The hub (docs/SPEC_HELLDESK_030_S2.md):
 * the lobby, the kitchen, two bullpens, a meeting ring, an office row, the
 * server hall, the print room, the sauna (at today's odds) and Internal IT,
 * with at least two loops. The mission recipes are the proposal's maps
 * (section 2.6), for the cards to move onto (S2b): a sneaky one always has a
 * spine to its objective, a loud one always has an arena (T1, T6 or T9).
 */
export const COMPOSED = {
  hub: { style: 'hub', templates: [...slots('T7', 'T4', 'T1', 'T1', 'T2', 'T3', 'T5', 'T10'), { id: 'sauna', chance: 0.7 }, { id: 'it' }], loops: 2, spine: false, objective: null },
  /** #1 The Red Stapler, #10 Karaoke Night: offices with a spine behind them. */
  officeSpine: { style: 'sneaky', templates: slots('T7', 'T3', 'T1'), loops: 1, spine: true, objective: 'T3' },
  /** #2 The Printer Uprising: the print room, a bullpen, the kitchen. */
  printFloor: { style: 'loud', templates: slots('T7', 'T10', 'T1', 'T4'), loops: 1, spine: false, objective: 'T10' },
  /** #3 Josh's First Day: a ring to go round, Internal IT at the end. */
  annexRing: { style: 'escort', templates: slots('T7', 'T2', 'it'), loops: 1, spine: false, objective: 'it' },
  /** #4 Password Hygiene Week: two bullpens and the kitchen, quietly. */
  bullpens: { style: 'sneaky', templates: slots('T7', 'T1', 'T1', 'T4'), loops: 1, spine: true, objective: 'T1' },
  /** #5 Phishing Test Debrief: a meeting ring, the kitchen on the way. */
  meetingFloor: { style: 'social', templates: slots('T7', 'T2', 'T4'), loops: 1, spine: false, objective: 'T2' },
  /** #6 The Change Freeze: the server hall, with the spine past the turrets. */
  serverSpine: { style: 'mixed', templates: slots('T7', 'T5', 'T1'), loops: 1, spine: true, objective: 'T5' },
  /** #7 Vendor Day: the atrium and a meeting ring. */
  atriumRing: { style: 'loud', templates: slots('T7', 'T6', 'T2'), loops: 1, spine: false, objective: 'T6' },
  /** #8 The Auditor's Liaison: offices and the server hall. */
  auditFloor: { style: 'investigation', templates: slots('T7', 'T3', 'T5'), loops: 1, spine: false, objective: 'T3' },
  /** #9 Marcus and the Backups: offices and the kitchen, quietly. */
  backupsFloor: { style: 'sneaky', templates: slots('T7', 'T3', 'T4'), loops: 1, spine: true, objective: 'T3' },
  /** #11 The Migration Weekend: the hall, a ring, the atrium. */
  migration: { style: 'mixed', templates: slots('T7', 'T5', 'T2', 'T6'), loops: 1, spine: false, objective: 'T5' },
  /** #12 All-Hands, Executive Suite: the atrium, then the arena. */
  execSuite: { style: 'loud', templates: slots('T7', 'T6', 'T9'), loops: 1, spine: false, objective: 'T9' },
  // One template on show (the visual sweep, `crawler?template=`): the lobby and it.
  'show-T1': { style: 'show', templates: slots('T7', 'T1'), loops: 1, spine: false, objective: 'T1' },
  'show-T2': { style: 'show', templates: slots('T7', 'T2'), loops: 1, spine: false, objective: 'T2' },
  'show-T3': { style: 'show', templates: slots('T7', 'T3'), loops: 1, spine: true, objective: 'T3' },
  'show-T4': { style: 'show', templates: slots('T7', 'T4'), loops: 1, spine: false, objective: 'T4' },
  'show-T5': { style: 'show', templates: slots('T7', 'T5'), loops: 1, spine: false, objective: 'T5' },
  'show-T6': { style: 'show', templates: slots('T7', 'T6'), loops: 1, spine: false, objective: 'T6' },
  'show-T7': { style: 'show', templates: slots('T7', 'T4'), loops: 1, spine: false, objective: 'T7' },
  'show-T9': { style: 'show', templates: slots('T7', 'T9'), loops: 1, spine: false, objective: 'T9' },
  'show-T10': { style: 'show', templates: slots('T7', 'T10'), loops: 1, spine: false, objective: 'T10' },
  'show-sauna': { style: 'show', templates: slots('T7', 'sauna'), loops: 1, spine: false, objective: 'sauna' },
  'show-it': { style: 'show', templates: slots('T7', 'it'), loops: 1, spine: false, objective: 'it' },
} as const satisfies Record<string, ComposedRecipe>;

export type ComposedId = keyof typeof COMPOSED;

/** Every composed recipe, for the gates that walk them all. */
export const COMPOSED_IDS = Object.keys(COMPOSED) as ComposedId[];

/** The mission recipes (not the hub, not a template on show). */
export const MISSION_RECIPES: readonly ComposedId[] = COMPOSED_IDS.filter((id) => COMPOSED[id].style !== 'hub' && COMPOSED[id].style !== 'show');

export function isComposed(id: string): id is ComposedId {
  return Object.hasOwn(COMPOSED, id);
}

/**
 * The rooms of a footprint: every run of one room letter, which must be a
 * filled rectangle. Throws on one that is not.
 */
function scanRooms(id: string, rows: readonly string[]): PlanRoom[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== w)) throw new Error(`${id}: ragged footprint`);
  const at = (x: number, y: number): string => rows[y]?.[x] ?? '#';
  const rooms: PlanRoom[] = [];
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      const room = ROOMS[c];
      if (room === undefined || seen[y * w + x] === 1) continue;
      // A room is a run of its letter: the rectangle it starts at the top left of.
      let rw = 0;
      while (at(x + rw, y) === c) rw++;
      let rh = 0;
      while (at(x, y + rh) === c) rh++;
      for (let yy = y; yy < y + rh; yy++) {
        for (let xx = x; xx < x + rw; xx++) {
          if (at(xx, yy) !== c || seen[yy * w + xx] === 1) throw new Error(`${id}: room ${c} at ${x},${y} is not a rectangle`);
          seen[yy * w + xx] = 1;
        }
      }
      rooms.push({ x, y, w: rw, h: rh, kind: room.kind, tag: room.tag });
    }
  }
  return rooms;
}

/** Lay a recipe's footprint, mirrored or not by the dice. Throws on a footprint that breaks its own rules. */
export function layRecipe(id: RecipeId, r: Rng): RecipePlan {
  const source = FOOTPRINTS[id];
  const mirror = r.chance(0.5);
  const rows = mirror ? source.map((row) => [...row].reverse().join('')) : [...source];
  const rooms = scanRooms(id, rows);
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const glass: number[] = [];
  const spine: number[] = [];
  const nodes: number[] = [];
  const spineNodes: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y]?.[x] ?? '#';
      const i = y * w + x;
      if (c === '=') glass.push(i);
      if (c === 's' || c === 'v' || c === 'p') spine.push(i);
      if (c === 'p') spineNodes.push(i);
      if (c === 'n') nodes.push(i);
    }
  }
  // The lift's room by its tag: a pitch area is furnished like a lobby, but nobody arrives there.
  const lobby = rooms.findIndex((rm) => rm.tag === 'lobby');
  if (lobby < 0) throw new Error(`${id}: no lobby`);
  rooms.unshift(...rooms.splice(lobby, 1));
  return { id, w, h, rows, rooms, glass, spine, nodes, spineNodes };
}

/** Is this footprint character walkable floor? */
export function walkableCell(c: string): boolean {
  return c !== '#' && c !== '=' && c !== ' ';
}
