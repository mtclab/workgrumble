import {
  type AmmoKind,
  GEAR,
  type GearDef,
  itemById,
  weaponById,
  type WeaponDef,
  xpForLevel,
} from './items';

export interface QueuedTicket {
  /** Index into TICKETS. */
  readonly t: number;
  /** Seconds left before the SLA breaches. */
  sla: number;
  readonly from: string;
  /** Fix labels already tried and wrong. */
  struck: string[];
  /** A VIP/customer ticket pays more and breaches harder. */
  readonly gold: boolean;
}

export type QuestKind = 'resolve' | 'printer' | 'deliver' | 'boss' | 'users' | 'cake';

export interface Quest {
  readonly id: number;
  readonly kind: QuestKind;
  readonly title: string;
  readonly body: string;
  readonly from: string;
  readonly goal: number;
  progress: number;
  readonly reward: number;
  readonly xp: number;
  done: boolean;
  /** Delivery target name, for 'deliver' quests. */
  readonly target?: string;
}

export interface SaveState {
  version: 1;
  floor: number;
  rep: number;
  xp: number;
  level: number;
  perkPoints: number;
  perks: Record<string, number>;
  owned: string[];
  consumables: Record<string, number>;
  ammo: Record<AmmoKind, number>;
  equipped: { weapon: string; head: string | null; body: string | null; feet: string | null; trinket: string | null };
  hotbar: string[];
  sanity: number;
  energy: number;
  actionItems: number;
  queue: QueuedTicket[];
  quests: Quest[];
  nextQuestId: number;
  stats: { resolvedField: number; resolvedDesk: number; breaches: number; burnouts: number; bosses: number; wrongFixes: number };
  seed: number;
  won: boolean;
  view: 'first' | 'third';
  mouseSens: number;
  volume: number;
}

const KEY = 'workgrumble-crawler-v1';

export function newSave(seed: number): SaveState {
  return {
    version: 1,
    floor: 0,
    rep: 40,
    xp: 0,
    level: 1,
    perkPoints: 0,
    perks: {},
    owned: ['stapler', 'labelmaker'],
    consumables: { coffee: 1, biscuits: 2 },
    ammo: { labels: 60, air: 0, ducks: 0, toner: 0 },
    equipped: { weapon: 'stapler', head: null, body: null, feet: null, trinket: null },
    hotbar: ['stapler', 'labelmaker'],
    sanity: 100,
    energy: 100,
    actionItems: 0,
    queue: [],
    quests: [],
    nextQuestId: 1,
    stats: { resolvedField: 0, resolvedDesk: 0, breaches: 0, burnouts: 0, bosses: 0, wrongFixes: 0 },
    seed,
    won: false,
    view: 'third',
    mouseSens: 1,
    volume: 0.6,
  };
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as SaveState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSave(s: SaveState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or full storage: the run just is not saved.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function perk(s: SaveState, id: string): number {
  return s.perks[id] ?? 0;
}

function gearOn(s: SaveState): GearDef[] {
  const out: GearDef[] = [];
  for (const slot of ['head', 'body', 'feet', 'trinket'] as const) {
    const id = s.equipped[slot];
    if (id === null) continue;
    const g = GEAR.find((x) => x.id === id);
    if (g !== undefined) out.push(g);
  }
  return out;
}

export interface Derived {
  maxSanity: number;
  armor: number;
  auraResist: number;
  bossResist: number;
  speedMult: number;
  stealth: number;
  healMult: number;
  noRoot: boolean;
  duck: boolean;
  energyRegen: number;
  attackSpeed: number;
  carry: number;
  weight: number;
  overEncumbered: boolean;
  weapon: WeaponDef;
}

export const ACTION_ITEM_KG = 6;

export function derive(s: SaveState): Derived {
  const gear = gearOn(s);
  const sum = (f: (g: GearDef) => number | undefined): number => gear.reduce((a, g) => a + (f(g) ?? 0), 0);
  let weight = 0;
  for (const id of s.owned) weight += itemById(id)?.weight ?? 0;
  for (const [id, n] of Object.entries(s.consumables)) weight += (itemById(id)?.weight ?? 0) * n;
  weight += (s.ammo.labels * 0.005) + (s.ammo.air * 0.005) + (s.ammo.ducks * 0.1) + (s.ammo.toner * 0.013);
  weight += s.actionItems * ACTION_ITEM_KG * (perk(s, 'teflon') > 0 ? 0.5 : 1);
  const carry = 40 + perk(s, 'back') * 15;
  return {
    maxSanity: 100 + perk(s, 'patience') * 25 + sum((g) => g.maxSanity) + (s.level - 1) * 5,
    armor: Math.min(0.7, sum((g) => g.armor)),
    auraResist: Math.min(0.85, sum((g) => g.auraResist)),
    bossResist: Math.min(0.6, sum((g) => g.bossResist)),
    speedMult: 1 + sum((g) => g.speed),
    stealth: Math.min(0.7, sum((g) => g.stealth) + perk(s, 'stealth') * 0.2),
    healMult: 1 + sum((g) => g.healMult) + perk(s, 'soft') * 0.3,
    noRoot: gear.some((g) => g.noRoot === true),
    duck: gear.some((g) => g.duck === true),
    energyRegen: 1 + sum((g) => g.energyRegen),
    attackSpeed: 1 + perk(s, 'typing') * 0.15,
    carry,
    weight: Math.round(weight * 10) / 10,
    overEncumbered: weight > carry,
    weapon: weaponById(s.equipped.weapon),
  };
}

/** Returns the number of levels gained. */
export function grantXp(s: SaveState, xp: number): number {
  s.xp += xp;
  let gained = 0;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level);
    s.level += 1;
    s.perkPoints += 1;
    gained += 1;
  }
  return gained;
}
