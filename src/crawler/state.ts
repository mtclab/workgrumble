import {
  type AmmoKind,
  GEAR,
  type GearDef,
  itemById,
  weaponById,
  type WeaponDef,
} from './items';
import {
  ATTRIBUTES,
  type Attribute,
  attributeMultiplier,
  BACKGROUNDS,
  bandFor,
  BAND_EFFECTS,
  type BandEffects,
  clampStanding,
  type Domain,
  type Faction,
  FACTIONS,
  SKILL_INFO,
  SKILL_UPS_PER_LEVEL,
  type Skill,
  SKILLS,
  type SkillState,
  skillThreshold,
  type Track,
} from './rpg';

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

export type QuestKind = 'resolve' | 'printer' | 'deliver' | 'boss' | 'users' | 'story' | 'peace';

export interface Quest {
  readonly id: number;
  readonly kind: QuestKind;
  readonly title: string;
  readonly body: string;
  readonly from: string;
  readonly goal: number;
  progress: number;
  readonly reward: number;
  done: boolean;
  /** Delivery target name, for 'deliver' quests. */
  readonly target?: string;
}

export interface JournalEntry {
  readonly floor: number;
  readonly text: string;
}

export interface CharacterSetup {
  readonly name: string;
  readonly background: string;
  readonly sign: string;
  readonly rung: number;
  readonly domain: Domain | null;
  readonly track: Track | null;
}

export interface SaveState {
  version: 2;
  name: string;
  background: string;
  sign: string;
  floor: number;
  /** The week number: one floor is one week, the weekend is at the mökki. */
  week: number;
  location: 'office' | 'mokki';
  rep: number;
  level: number;
  attrs: Record<Attribute, number>;
  skills: Record<Skill, SkillState>;
  major: Skill[];
  /** Skill increases since the last level-up, total and per governing attribute. */
  skillUps: number;
  attrUps: Record<Attribute, number>;
  perkPoints: number;
  perks: Record<string, number>;
  rung: number;
  domain: Domain | null;
  track: Track | null;
  standing: Record<Faction, number>;
  warnings: number;
  owned: string[];
  consumables: Record<string, number>;
  stash: Record<string, number>;
  ammo: Record<AmmoKind, number>;
  equipped: { weapon: string; head: string | null; body: string | null; feet: string | null; trinket: string | null };
  sanity: number;
  energy: number;
  loyly: number;
  bac: number;
  peakBac: number;
  dependency: number;
  hangover: number;
  empties: number;
  actionItems: number;
  spells: string[];
  spell: string | null;
  queue: QueuedTicket[];
  quests: Quest[];
  nextQuestId: number;
  journal: JournalEntry[];
  flags: Record<string, boolean | number>;
  /** Auditor findings: shady choices come back to haunt you. */
  findings: number;
  makkara: boolean;
  promotionOffered: boolean;
  stats: {
    resolvedField: number; resolvedDesk: number; resolvedPeace: number; breaches: number; burnouts: number;
    bosses: number; wrongFixes: number; drinks: number; blackouts: number; locks: number; spellsCast: number;
  };
  seed: number;
  won: boolean;
  view: 'first' | 'third';
  mouseSens: number;
  volume: number;
  bloom: boolean;
}

const KEY = 'workgrumble-crawler-v2';

function baseSkills(): Record<Skill, SkillState> {
  const out = {} as Record<Skill, SkillState>;
  for (const s of SKILLS) out[s] = { value: 5, progress: 0 };
  return out;
}

function zeroAttrs(v: number): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) out[a] = v;
  return out;
}

export function newSave(seed: number, setup?: CharacterSetup): SaveState {
  const bg = BACKGROUNDS.find((b) => b.id === setup?.background) ?? BACKGROUNDS[0];
  const s: SaveState = {
    version: 2,
    name: setup?.name ?? 'Pat Pending',
    background: bg?.id ?? 'grad',
    sign: setup?.sign ?? 'patch',
    floor: 0,
    week: 1,
    location: 'office',
    rep: 40 + (bg?.rep ?? 0),
    level: 1,
    attrs: zeroAttrs(35),
    skills: baseSkills(),
    major: [...(bg?.major ?? [])],
    skillUps: 0,
    attrUps: zeroAttrs(0),
    perkPoints: 0,
    perks: {},
    rung: setup?.rung ?? 0,
    domain: setup?.domain ?? null,
    track: setup?.track ?? null,
    standing: { staff: 0, management: 0, kitchen: 10, itcrowd: 0 },
    warnings: 0,
    owned: ['stapler', 'labelmaker'],
    consumables: { coffee: 1, biscuits: 2, paperclip: 2 },
    stash: {},
    ammo: { labels: 60, air: 0, ducks: 0, toner: 0 },
    equipped: { weapon: 'stapler', head: null, body: null, feet: null, trinket: null },
    sanity: 100,
    energy: 100,
    loyly: 40,
    bac: 0,
    peakBac: 0,
    dependency: 0,
    hangover: 0,
    empties: 0,
    actionItems: 0,
    spells: [],
    spell: null,
    queue: [],
    quests: [],
    nextQuestId: 1,
    journal: [],
    flags: {},
    findings: 0,
    makkara: false,
    promotionOffered: false,
    stats: { resolvedField: 0, resolvedDesk: 0, resolvedPeace: 0, breaches: 0, burnouts: 0, bosses: 0, wrongFixes: 0, drinks: 0, blackouts: 0, locks: 0, spellsCast: 0 },
    seed,
    won: false,
    view: 'third',
    mouseSens: 1,
    volume: 0.6,
    bloom: true,
  };
  if (bg !== undefined) {
    for (const [a, v] of Object.entries(bg.attrs)) s.attrs[a as Attribute] += v;
    for (const m of bg.major) s.skills[m].value = 20;
    for (const [f, v] of Object.entries(bg.standing ?? {})) s.standing[f as Faction] += v;
    for (const sp of bg.spells ?? []) s.spells.push(sp);
    for (const [id, n] of Object.entries(bg.items ?? {})) s.consumables[id] = (s.consumables[id] ?? 0) + n;
  }
  // Governing attribute nudges its skills a little, like a class would.
  for (const sk of SKILLS) s.skills[sk].value += Math.max(0, Math.floor((s.attrs[SKILL_INFO[sk].attr] - 35) / 3));
  switch (s.sign) {
    case 'patch': s.attrs.tech += 10; break;
    case 'leap': s.attrs.reflex += 10; break;
    case 'deploy': s.attrs.patience -= 10; break;
    case 'bsod': s.attrs.charm -= 5; break;
    default: break;
  }
  // Hired above trainee? You arrive with the experience the title implies.
  const r = s.rung;
  if (r > 0) {
    for (const a of ATTRIBUTES) s.attrs[a] += r * 3;
    for (const sk of SKILLS) s.skills[sk].value += r * 4;
    s.level = 1 + r;
    s.rep += r * 60;
    s.standing.management += r * 3;
    if (r >= 2) s.owned.push('keyboard');
    if (r >= 4) s.owned.push('cat6');
    if (r >= 5) { s.owned.push('duck'); s.ammo.ducks = 6; }
  }
  if (s.spells.length > 0) s.spell = s.spells[0] ?? null;
  s.sanity = derive(s).maxSanity;
  s.loyly = derive(s).maxLoyly;
  return s;
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as SaveState;
    if (parsed.version !== 2) return null;
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

/** Effective skill, including domain passives. */
export function skill(s: SaveState, k: Skill): number {
  let v = s.skills[k].value;
  if (s.domain === 'Security' && s.rung >= 3 && (k === 'security' || k === 'stealth')) v += k === 'security' ? 15 : 10;
  if (s.domain === 'Database' && s.rung >= 3 && k === 'troubleshooting') v += 10;
  return v;
}

export interface Derived {
  maxSanity: number;
  maxLoyly: number;
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
  meleeMult: number;
  rangedMult: number;
  spellMult: number;
  carry: number;
  weight: number;
  overEncumbered: boolean;
  weapon: WeaponDef;
  band: BandEffects;
  slaMult: number;
  queueMax: number;
  deskRepMult: number;
  dodge: number;
}

export const ACTION_ITEM_KG = 6;
export const EMPTY_KG = 0.3;

export function derive(s: SaveState): Derived {
  const gear = gearOn(s);
  const sum = (f: (g: GearDef) => number | undefined): number => gear.reduce((a, g) => a + (f(g) ?? 0), 0);
  const A = s.attrs;
  let weight = 0;
  for (const id of s.owned) weight += itemById(id)?.weight ?? 0;
  for (const [id, n] of Object.entries(s.consumables)) weight += (id === 'laptop' ? 3 : itemById(id)?.weight ?? 0) * n;
  weight += (s.ammo.labels * 0.005) + (s.ammo.air * 0.005) + (s.ammo.ducks * 0.1) + (s.ammo.toner * 0.013);
  weight += s.actionItems * ACTION_ITEM_KG * (perk(s, 'teflon') > 0 ? 0.5 : 1);
  weight += s.empties * EMPTY_KG;
  const carry = Math.round(25 + A.grit * 0.45 + perk(s, 'back') * 15);
  const specialist = s.rung >= 3 && s.track === 'specialist';
  const engineer = s.rung >= 3 && s.track === 'engineer';
  const hang = s.hangover > 0 ? 0.8 : 1;
  const band = BAND_EFFECTS[bandFor(s.bac)];
  const sign = s.sign;
  return {
    maxSanity: Math.round((50 + A.patience * 1.3 + perk(s, 'patience') * 25 + sum((g) => g.maxSanity) + (s.level - 1) * 4 + (sign === 'bsod' ? 25 : 0) + (s.makkara ? 20 : 0)) * hang),
    maxLoyly: Math.round(20 + A.tech * 0.8 + (sign === 'juhannus' ? 30 : 0)),
    armor: Math.min(0.75, sum((g) => g.armor) + skill(s, 'sisu') * 0.0025),
    auraResist: Math.min(0.85, sum((g) => g.auraResist) + A.liver * 0.002),
    bossResist: Math.min(0.6, sum((g) => g.bossResist)),
    speedMult: (1 + sum((g) => g.speed) + (A.reflex - 35) * 0.003) * (s.hangover > 0 ? 0.92 : 1),
    stealth: Math.min(0.8, sum((g) => g.stealth) + perk(s, 'stealth') * 0.2 + skill(s, 'stealth') * 0.003),
    healMult: 1 + sum((g) => g.healMult) + perk(s, 'soft') * 0.3 + (specialist ? 0.2 : 0),
    noRoot: gear.some((g) => g.noRoot === true),
    duck: gear.some((g) => g.duck === true),
    energyRegen: (1 + sum((g) => g.energyRegen) + (s.domain === 'Cloud' && s.rung >= 3 ? 0.3 : 0)) * (s.hangover > 0 ? 0.5 : 1),
    attackSpeed: 1 + perk(s, 'typing') * 0.15 + (A.reflex - 35) * 0.002,
    meleeMult: (1 + (A.grit - 35) * 0.008 + skill(s, 'hardware') * 0.006) * (1 + band.damage) * (engineer ? 1.2 : 1) * (sign === 'deploy' ? 1.2 : 1) * (s.domain === 'Systems' && s.rung >= 3 ? 1.1 : 1),
    rangedMult: (1 + (A.reflex - 35) * 0.008 + skill(s, 'scripting') * 0.006) * (1 + band.damage * 0.5) * (engineer ? 1.2 : 1) * (sign === 'deploy' ? 1.2 : 1),
    spellMult: (1 + skill(s, 'runecraft') * 0.008 + (A.tech - 35) * 0.005) * (engineer ? 1.15 : 1),
    carry,
    weight: Math.round(weight * 10) / 10,
    overEncumbered: weight > carry,
    weapon: weaponById(s.equipped.weapon),
    band,
    slaMult: specialist ? 1.4 : 1,
    queueMax: 8 + (specialist ? 2 : 0),
    deskRepMult: (specialist ? 1.25 : 1) * (1 + perk(s, 'soft') * 0.25),
    dodge: Math.min(0.3, Math.max(0, (A.reflex - 30) * 0.004)),
  };
}

export function adjustStanding(s: SaveState, f: Faction, delta: number): void {
  s.standing[f] = clampStanding(s.standing[f] + delta);
}

/**
 * Exercise a skill. Returns the new value when it goes up, else null. Every
 * increase counts toward the next level and toward its governing attribute's
 * level-up multiplier, the Morrowind way.
 */
export function useSkill(s: SaveState, k: Skill, amount = 1): number | null {
  const st = s.skills[k];
  if (st.value >= 100) return null;
  const major = s.major.includes(k) ? 1.5 : 1;
  st.progress += amount * major;
  if (st.progress < skillThreshold(st.value)) return null;
  st.progress = 0;
  st.value += 1;
  s.skillUps += 1;
  s.attrUps[SKILL_INFO[k].attr] += 1;
  return st.value;
}

export function levelUpReady(s: SaveState): boolean {
  return s.skillUps >= SKILL_UPS_PER_LEVEL;
}

/** Apply a level-up: raise the two chosen attributes by their multipliers. */
export function applyLevelUp(s: SaveState, chosen: readonly Attribute[]): void {
  if (!levelUpReady(s)) return;
  for (const a of chosen.slice(0, 2)) s.attrs[a] = Math.min(100, s.attrs[a] + attributeMultiplier(s.attrUps[a]));
  // Liver creeps up on its own if you drink. Patience always gets a point.
  s.attrs.patience = Math.min(100, s.attrs.patience + 1);
  s.level += 1;
  s.perkPoints += 1;
  s.skillUps = Math.max(0, s.skillUps - SKILL_UPS_PER_LEVEL);
  for (const a of ATTRIBUTES) s.attrUps[a] = 0;
}

export function skillSum(s: SaveState): number {
  return [...SKILLS].map((k) => s.skills[k].value).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
}

export { FACTIONS };
