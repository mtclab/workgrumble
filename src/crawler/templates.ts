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
 *   n  a corridor node (patrols walk between them; each also hangs a light)
 *   L  lobby, the entry lift's room (always room 0)
 *   H  HR's office   O  an office   C  open-plan desks   M  a meeting room behind glass
 *
 * Every run of one room letter must be a filled rectangle: that is the room.
 * Variety in the spike is a mirror image, picked by the level's seed.
 */
export type RecipeId = 'officeRow' | 'meetingRing';

/** What a letter is: its room kind, and the tag the mission finds it by. */
const ROOMS: Readonly<Record<string, { readonly kind: RoomKind; readonly tag: string }>> = {
  L: { kind: 'lobby', tag: 'lobby' },
  H: { kind: 'office', tag: 'hr' },
  O: { kind: 'office', tag: 'office' },
  C: { kind: 'cubicles', tag: 'open' },
  M: { kind: 'meeting', tag: 'meeting' },
};

/**
 * T3, the corner-office row (spec 3.2), with a stub of T8, the service spine:
 * four offices off a corridor, HR's at the far end, and a cleaner's corridor
 * behind them that runs from the lobby's back door to HR's back door and
 * nowhere else. The open plan across the corridor has a view of it.
 */
const OFFICE_ROW = [
  '####################################',
  '##ssssssssssssssssssssssssssssss####',
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

const FOOTPRINTS: Readonly<Record<RecipeId, readonly string[]>> = {
  officeRow: OFFICE_ROW,
  meetingRing: MEETING_RING,
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
  readonly id: RecipeId;
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
}

/** Lay a recipe's footprint, mirrored or not by the dice. Throws on a footprint that breaks its own rules. */
export function layRecipe(id: RecipeId, r: Rng): RecipePlan {
  const source = FOOTPRINTS[id];
  const mirror = r.chance(0.5);
  const rows = mirror ? source.map((row) => [...row].reverse().join('')) : [...source];
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== w)) throw new Error(`${id}: ragged footprint`);
  const at = (x: number, y: number): string => rows[y]?.[x] ?? '#';
  const rooms: PlanRoom[] = [];
  const seen = new Uint8Array(w * h);
  const glass: number[] = [];
  const spine: number[] = [];
  const nodes: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      const i = y * w + x;
      if (c === '=') glass.push(i);
      if (c === 's' || c === 'v') spine.push(i);
      if (c === 'n') nodes.push(i);
      const room = ROOMS[c];
      if (room === undefined || seen[i] === 1) continue;
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
  const lobby = rooms.findIndex((rm) => rm.kind === 'lobby');
  if (lobby < 0) throw new Error(`${id}: no lobby`);
  rooms.unshift(...rooms.splice(lobby, 1));
  return { id, w, h, rows, rooms, glass, spine, nodes };
}

/** Is this footprint character walkable floor? */
export function walkableCell(c: string): boolean {
  return c !== '#' && c !== '=' && c !== ' ';
}
