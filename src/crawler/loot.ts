import { GEAR, type GearDef, WEAPONS, type WeaponDef } from './items';
import type { Attribute, Skill } from './rpg';
import type { Rng } from './rng';

/**
 * Loot, the Diablo-and-Daggerfall way: every piece of gear you own is an
 * instance of a base item with a rarity and some affixes, and the bosses
 * guard hand-made legendaries with effects nothing else has.
 */

export type Rarity = 'common' | 'fine' | 'rare' | 'legendary';

export const RARITY_INFO: Record<Rarity, { name: string; color: string; affixes: number; value: number }> = {
  common: { name: 'Common', color: '#d8d0c0', affixes: 0, value: 1 },
  fine: { name: 'Fine', color: '#7dff9a', affixes: 1, value: 1.8 },
  rare: { name: 'Rare', color: '#6fb6ff', affixes: 2, value: 3 },
  legendary: { name: 'Legendary', color: '#ffae42', affixes: 0, value: 6 },
};

/**
 * Rarity without its colour, for anyone who cannot tell green from orange:
 * a mark beside the name in the backpack (more marks, rarer; a star for a
 * legendary), and a shape for the drop on the carpet (more faces, rarer).
 */
export const RARITY_MARK: Record<Rarity, string> = {
  common: '',
  fine: '◆',
  rare: '◆◆',
  legendary: '★',
};

export type DropShape = 'tetra' | 'octa' | 'dodeca' | 'icosa';

export const RARITY_SHAPE: Record<Rarity, DropShape> = {
  common: 'tetra',
  fine: 'octa',
  rare: 'dodeca',
  legendary: 'icosa',
};

export type AffixStat =
  | 'armor' | 'speed' | 'maxSanity' | 'maxLoyly' | 'damage' | 'stealth' | 'heal' | 'auraResist' | 'attackSpeed'
  | Attribute
  | Skill;

export interface Affix {
  readonly stat: AffixStat;
  readonly value: number;
}

export interface GearInstance {
  readonly uid: string;
  readonly base: string;
  readonly rarity: Rarity;
  readonly affixes: readonly Affix[];
  readonly name: string;
  /** Legendary id, for special effects. */
  readonly unique?: string;
}

interface AffixDef {
  readonly stat: AffixStat;
  readonly prefix: string;
  readonly suffix: string;
  readonly min: number;
  readonly max: number;
  readonly percent: boolean;
  readonly slots: readonly ('weapon' | 'head' | 'body' | 'feet' | 'trinket')[];
}

const ARMOUR = ['head', 'body', 'feet', 'trinket'] as const;
const ALL = ['weapon', 'head', 'body', 'feet', 'trinket'] as const;

const AFFIXES: readonly AffixDef[] = [
  { stat: 'damage', prefix: 'Sharpened', suffix: 'of Root Cause', min: 0.08, max: 0.25, percent: true, slots: ['weapon', 'trinket'] },
  { stat: 'attackSpeed', prefix: 'Overclocked', suffix: 'of Hotkeys', min: 0.06, max: 0.18, percent: true, slots: ['weapon', 'feet'] },
  { stat: 'armor', prefix: 'Reinforced', suffix: 'of the Change Freeze', min: 0.04, max: 0.12, percent: true, slots: ARMOUR },
  { stat: 'speed', prefix: 'Agile', suffix: 'of the Fire Drill', min: 0.04, max: 0.12, percent: true, slots: ['feet', 'body'] },
  { stat: 'maxSanity', prefix: 'Calm', suffix: 'of Inbox Zero', min: 10, max: 35, percent: false, slots: ARMOUR },
  { stat: 'maxLoyly', prefix: 'Steaming', suffix: 'of the Kiuas', min: 10, max: 30, percent: false, slots: ['head', 'trinket', 'weapon'] },
  { stat: 'stealth', prefix: 'Muted', suffix: 'of Do Not Disturb', min: 0.05, max: 0.15, percent: true, slots: ['body', 'feet', 'head'] },
  { stat: 'heal', prefix: 'Comforting', suffix: 'of Tea Breaks', min: 0.1, max: 0.3, percent: true, slots: ['trinket', 'body'] },
  { stat: 'auraResist', prefix: 'Deaf', suffix: 'of Headphones On', min: 0.1, max: 0.3, percent: true, slots: ['head', 'trinket'] },
  { stat: 'grit', prefix: 'Burly', suffix: 'of Server Lifting', min: 3, max: 8, percent: false, slots: ALL },
  { stat: 'reflex', prefix: 'Twitchy', suffix: 'of the Leap Second', min: 3, max: 8, percent: false, slots: ALL },
  { stat: 'tech', prefix: 'Clever', suffix: 'of the Man Page', min: 3, max: 8, percent: false, slots: ALL },
  { stat: 'charm', prefix: 'Charming', suffix: 'of the Smalltalk', min: 3, max: 8, percent: false, slots: ALL },
  { stat: 'patience', prefix: 'Stoic', suffix: 'of the Hold Music', min: 3, max: 8, percent: false, slots: ALL },
  { stat: 'liver', prefix: 'Seasoned', suffix: 'of the Pikkujoulu', min: 3, max: 8, percent: false, slots: ['trinket', 'body'] },
  { stat: 'hardware', prefix: 'Heavy', suffix: 'of the Rack', min: 3, max: 10, percent: false, slots: ['weapon', 'body'] },
  { stat: 'scripting', prefix: 'Scripted', suffix: 'of Bash', min: 3, max: 10, percent: false, slots: ['weapon', 'head'] },
  { stat: 'troubleshooting', prefix: 'Diagnostic', suffix: 'of the Logs', min: 3, max: 10, percent: false, slots: ['head', 'trinket'] },
  { stat: 'soft', prefix: 'Diplomatic', suffix: 'of Active Listening', min: 3, max: 10, percent: false, slots: ['body', 'trinket'] },
  { stat: 'runecraft', prefix: 'Runic', suffix: 'of Väinämöinen', min: 3, max: 10, percent: false, slots: ['trinket', 'head'] },
  { stat: 'drinking', prefix: 'Hardened', suffix: 'of the Friday Pub', min: 3, max: 10, percent: false, slots: ['trinket'] },
];

export interface UniqueDef {
  readonly id: string;
  readonly base: string;
  readonly name: string;
  readonly lore: string;
  readonly affixes: readonly Affix[];
  /** A short description of the special effect implemented in the game. */
  readonly special: string;
}

export const UNIQUES: readonly UniqueDef[] = [
  { id: 'redstapler', base: 'stapler', name: "Milton's Red Swingline", lore: 'He was told he could keep it.', affixes: [{ stat: 'damage', value: 1.2 }, { stat: 'hardware', value: 10 }], special: 'Staples pierce: every hit also staples the person behind.' },
  { id: 'derekLanyard', base: 'lanyard', name: "Derek's Lanyard of Delegation", lore: 'Every action item he ever took, he gave to someone else.', affixes: [{ stat: 'charm', value: 8 }, { stat: 'auraResist', value: 0.3 }], special: 'Action items weigh nothing.' },
  { id: 'goldCard', base: 'mug', name: "Karen's Gold Membership Card", lore: 'Not a mug. It does not matter. Karen used it as one.', affixes: [{ stat: 'soft', value: 12 }, { stat: 'heal', value: 0.25 }], special: 'Gold tickets pay triple Rep at the terminal.' },
  { id: 'rubberStamp', base: 'keyboard', name: "Gordon's APPROVED Stamp", lore: 'Net 90. Three quotes. Signed in triplicate.', affixes: [{ stat: 'damage', value: 0.5 }, { stat: 'grit', value: 6 }], special: 'Every hit roots the target for a second: APPROVED.' },
  { id: 'redPen', base: 'labelmaker', name: "The Auditor's Red Pen", lore: 'It has never written anything kind.', affixes: [{ stat: 'damage', value: 0.4 }, { stat: 'scripting', value: 12 }], special: 'Shots mark the target: marked people take +50% damage from your hits.' },
  { id: 'ceoCrown', base: 'crown', name: "Sir Reginald's Coronation Hat", lore: 'It was a gift from a supplier. So was the knighthood.', affixes: [{ stat: 'charm', value: 15 }, { stat: 'maxSanity', value: 60 }, { stat: 'armor', value: 0.1 }], special: 'Managers will not start a fight with you.' },
  { id: 'nokia', base: 'hardhat', name: 'Nokia 3310', lore: 'It survived the fall. It survived everything.', affixes: [{ stat: 'armor', value: 0.2 }, { stat: 'patience', value: 10 }], special: 'Indestructible: once per floor, a hit that would burn you out leaves you on 1 sanity.' },
  { id: 'flask', base: 'yubikey', name: 'The Koskenkorva Flask', lore: 'Engraved: "For emergencies. Every day is an emergency."', affixes: [{ stat: 'drinking', value: 20 }, { stat: 'liver', value: 10 }], special: 'The Ballmer Peak window is twice as wide.' },
  { id: 'whisk', base: 'cat6', name: 'Kalevala Birch Whisk', lore: 'Cut on Juhannus eve, bound with a Cat6 cable.', affixes: [{ stat: 'runecraft', value: 12 }, { stat: 'maxLoyly', value: 30 }], special: 'Every hit heals you a little and restores Löyly.' },
  { id: 'sandals', base: 'crocs', name: "The Sysadmin's Sandals", lore: 'Worn with socks. Worn in winter. Worn to the CEO\'s wedding.', affixes: [{ stat: 'speed', value: 0.3 }, { stat: 'hardware', value: 6 }, { stat: 'stealth', value: -0.1 }], special: 'Sprinting costs no energy.' },
  { id: 'hoodie10x', base: 'hoodie', name: 'Hoodie of the 10x Engineer', lore: 'Nobody has seen the face inside it since 2016.', affixes: [{ stat: 'damage', value: 0.25 }, { stat: 'charm', value: -10 }, { stat: 'tech', value: 10 }], special: 'Terminal fixes pay double Rep.' },
  { id: 'ballmerChair', base: 'sudo', name: "Ballmer's Chair", lore: 'DEVELOPERS. DEVELOPERS. DEVELOPERS.', affixes: [{ stat: 'damage', value: 0.6 }, { stat: 'grit', value: 12 }], special: 'Power attacks throw everyone around you.' },
];

export { BOOKS, bookById, type BookDef } from './books';

export function baseOf(inst: GearInstance): WeaponDef | GearDef | undefined {
  return WEAPONS.find((w) => w.id === inst.base) ?? GEAR.find((g) => g.id === inst.base);
}

export function slotOf(inst: GearInstance): 'weapon' | 'head' | 'body' | 'feet' | 'trinket' | null {
  return baseOf(inst)?.slot ?? null;
}

let uidCounter = 0;

export function newUid(r: Rng): string {
  uidCounter += 1;
  return `${Date.now().toString(36)}-${uidCounter.toString(36)}-${Math.floor(r.next() * 1e6).toString(36)}`;
}

/** A plain, affix-free instance of a base item: what Internal IT issues. */
export function plainInstance(base: string, r: Rng): GearInstance {
  const def = WEAPONS.find((w) => w.id === base) ?? GEAR.find((g) => g.id === base);
  return { uid: newUid(r), base, rarity: 'common', affixes: [], name: def?.name ?? base };
}

export function uniqueInstance(id: string, r: Rng): GearInstance | null {
  const u = UNIQUES.find((x) => x.id === id);
  if (u === undefined) return null;
  return { uid: newUid(r), base: u.base, rarity: 'legendary', affixes: u.affixes, name: u.name, unique: u.id };
}

export function rollRarity(r: Rng, luck: number): Rarity {
  const roll = r.next() + luck;
  if (roll > 1.02) return 'rare';
  if (roll > 0.72) return 'fine';
  return 'common';
}

/** Random loot: a base item that fits the floor, with rarity and affixes. */
export function rollGear(r: Rng, floor: number, luck: number, forceRarity?: Rarity): GearInstance {
  const pool = [...WEAPONS.filter((w) => w.price > 0 && w.minFloor <= floor + 1), ...GEAR.filter((g) => g.minFloor <= floor + 1)];
  const base = r.pick(pool);
  const rarity = forceRarity ?? rollRarity(r, luck);
  const n = RARITY_INFO[rarity].affixes;
  const options = AFFIXES.filter((a) => a.slots.includes(base.slot));
  const chosen: AffixDef[] = [];
  for (let i = 0; i < n && options.length > 0; i++) {
    const pickable = options.filter((o) => !chosen.includes(o));
    if (pickable.length === 0) break;
    chosen.push(r.pick(pickable));
  }
  const scale = 1 + floor * 0.12;
  const affixes: Affix[] = chosen.map((a) => {
    const raw = r.range(a.min, a.max) * scale;
    return { stat: a.stat, value: a.percent ? Math.round(raw * 100) / 100 : Math.round(raw) };
  });
  let name = base.name;
  const first = chosen[0];
  const second = chosen[1];
  if (first !== undefined) name = `${first.prefix} ${name}`;
  if (second !== undefined) name = `${name} ${second.suffix}`;
  return { uid: newUid(r), base: base.id, rarity, affixes, name };
}

const STAT_LABEL: Record<string, string> = {
  armor: 'armour', speed: 'speed', maxSanity: 'max sanity', maxLoyly: 'max Löyly', damage: 'damage', stealth: 'stealth',
  heal: 'healing', auraResist: 'aura resist', attackSpeed: 'attack speed', grit: 'Grit', reflex: 'Reflex', tech: 'Tech',
  charm: 'Charm', patience: 'Patience', liver: 'Liver', hardware: 'Hardware', scripting: 'Scripting',
  troubleshooting: 'Troubleshooting', soft: 'Soft Skills', sisu: 'Sisu', security: 'Security', drinking: 'Drinking',
  runecraft: 'Mökki Magic', athletics: 'Athletics',
};

const PERCENT_STATS = new Set<AffixStat>(['armor', 'speed', 'damage', 'stealth', 'heal', 'auraResist', 'attackSpeed']);

export function affixText(a: Affix): string {
  const sign = a.value >= 0 ? '+' : '';
  return PERCENT_STATS.has(a.stat) ? `${sign}${Math.round(a.value * 100)}% ${STAT_LABEL[a.stat] ?? a.stat}` : `${sign}${a.value} ${STAT_LABEL[a.stat] ?? a.stat}`;
}

export function uniqueSpecial(id: string | undefined): string {
  return id === undefined ? '' : UNIQUES.find((u) => u.id === id)?.special ?? '';
}

/** Internal IT's e-waste buy-back price. */
export function sellValue(inst: GearInstance): number {
  const base = baseOf(inst);
  const price = base === undefined ? 20 : Math.max(20, base.price);
  return Math.round(price * 0.35 * RARITY_INFO[inst.rarity].value);
}

export function sumAffix(items: readonly GearInstance[], stat: AffixStat): number {
  let v = 0;
  for (const it of items) for (const a of it.affixes) if (a.stat === stat) v += a.value;
  return v;
}

/** Which boss drops which legendary. */
export const BOSS_UNIQUES: readonly string[] = ['derekLanyard', 'goldCard', 'rubberStamp', 'redPen', 'ceoCrown'];
/** Legendaries that only turn up in supply closets and from elites. */
export const WORLD_UNIQUES: readonly string[] = ['nokia', 'flask', 'whisk', 'sandals', 'hoodie10x', 'ballmerChair'];
