import {
  CAFFEINE_EFFECTS,
  caffeineBand,
  type CaffeineEffects,
} from './caffeine';
import {
  type AmmoKind,
  GEAR,
  type GearDef,
  itemById,
  type WeaponDef,
  weaponById,
} from './items';
import {
  type AffixStat,
  baseOf,
  type GearInstance,
  plainInstance,
  sumAffix,
} from './loot';
import { HUD_METERS, type HudMeter, type InductionState, normalizeInduction } from './induction';
import { freshOnCall, normalizeOnCall, type OnCallState } from './oncall';
import { canTake, treePerk } from './perks';
import type { TeamMember } from './team';
import { isActive, type QuestState } from './quests';
import { Rng } from './rng';
import {
  type ArchPath,
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
  type Workplace,
  WORKPLACES,
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

/** Mail tasks: radiant, repeatable, claimed at a computer. */
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
  readonly arch?: ArchPath | null;
  readonly workplace?: Workplace;
  readonly ironman?: boolean;
}

/** What has already happened on the floor you are on, so a reload keeps it. */
export interface FloorState {
  floor: number;
  bossDone: boolean;
  /** Interactable ids already used, looted or picked. */
  used: number[];
  /** Quest pickups already taken. */
  picked: string[];
  /** Level spawns (by index) already resolved: they stay resolved on a reload. */
  resolved: number[];
  /** People who turned up because of an earlier choice, so a reload keeps them. */
  extras: { kind: 'reply' | 'customer' | 'jam' | 'vendor'; x: number; z: number; name?: string }[];
  /** Once-a-floor saves already spent. */
  unbreakableUsed: boolean;
  nokiaUsed: boolean;
  drinksHere: number;
  /** The steam already took you under on this floor visit (SUO: once a visit). */
  suo: boolean;
  /** The cold-steam line has been said on this floor (after that, just the cost). */
  coldSteam: boolean;
}

export interface WeekendState {
  saunas: number;
  grill: boolean;
  lake: boolean;
  palju: boolean;
  fish: number;
  visitorDone: boolean;
  book: boolean;
  potatoes: boolean;
  /** The steam already took you under this weekend (SUO: once a weekend at the mökki). */
  suo: boolean;
}

export interface SaveState {
  version: 3;
  name: string;
  background: string;
  sign: string;
  workplace: Workplace;
  ironman: boolean;
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
  arch: ArchPath | null;
  standing: Record<Faction, number>;
  warnings: number;
  gear: GearInstance[];
  equipped: { weapon: string; head: string | null; body: string | null; feet: string | null; trinket: string | null };
  consumables: Record<string, number>;
  stash: Record<string, number>;
  ammo: Record<AmmoKind, number>;
  sanity: number;
  energy: number;
  loyly: number;
  bac: number;
  /** Alcohol drunk but not yet in the blood: it arrives over the next half-minute. */
  stomach: number;
  peakBac: number;
  dependency: number;
  hangover: number;
  empties: number;
  caffeine: number;
  caffeinePeak: number;
  caffeineTol: number;
  crash: number;
  actionItems: number;
  spells: string[];
  spell: string | null;
  queue: QueuedTicket[];
  quests: Quest[];
  nextQuestId: number;
  questLog: QuestState[];
  questItems: string[];
  journal: JournalEntry[];
  flags: Record<string, boolean | number>;
  /** Auditor findings: shady choices come back to haunt you. */
  findings: number;
  makkara: boolean;
  hauki: boolean;
  palju: boolean;
  saunaBuff: boolean;
  /** The Löylyhenki's blessing: the next rune costs no Löyly and cannot fail. */
  suoBlessing: boolean;
  /** Timed can buffs (White Monster, Red Bull wings...), seconds left. */
  buffs: Record<string, number>;
  floorState: FloorState;
  weekend: WeekendState;
  /** The on-call rota: whether the pager comes to the mökki this weekend, and its pages. */
  oncall: OnCallState;
  upgrades: string[];
  achievements: string[];
  tipsShown: string[];
  booksRead: string[];
  stats: {
    resolvedField: number; resolvedDesk: number; resolvedPeace: number; breaches: number; burnouts: number;
    bosses: number; wrongFixes: number; drinks: number; blackouts: number; locks: number; spellsCast: number;
    cans: number; fish: number; elites: number;
    staffedDone: number; staffedMissed: number;
    mentored: number; treats: number;
    pagesAnswered: number; pagesMissed: number;
  };
  /** Your colleagues, by name: morale, and who you have mentored. */
  team: Record<string, TeamMember>;
  /** Induction day, while it runs (null: skipped, finished, or a career from before it). */
  induction: InductionState | null;
  /** HUD meters not shown yet: each appears when it first matters. Empty: everything shows. */
  hudHidden: HudMeter[];
  seed: number;
  won: boolean;
}

export function freshFloorState(floor: number): FloorState {
  return { floor, bossDone: false, used: [], picked: [], resolved: [], extras: [], unbreakableUsed: false, nokiaUsed: false, drinksHere: 0, suo: false, coldSteam: false };
}

export function freshWeekend(): WeekendState {
  return { saunas: 0, grill: false, lake: false, palju: false, fish: 0, visitorDone: false, book: false, potatoes: false, suo: false };
}

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

/** Hire rung → the tools you arrive with. */
const HIRE_KIT: readonly [number, string][] = [[3, 'keyboard'], [5, 'cat6'], [7, 'duck'], [9, 'aircan']];

export function newSave(seed: number, setup?: CharacterSetup): SaveState {
  const bg = BACKGROUNDS.find((b) => b.id === setup?.background) ?? BACKGROUNDS[0];
  const r = new Rng(seed);
  const stapler = plainInstance('stapler', r);
  const label = plainInstance('labelmaker', r);
  const s: SaveState = {
    version: 3,
    name: setup?.name ?? 'Pat Pending',
    background: bg?.id ?? 'grad',
    sign: setup?.sign ?? 'patch',
    workplace: setup?.workplace ?? 'standard',
    ironman: setup?.ironman ?? false,
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
    arch: setup?.arch ?? null,
    standing: { staff: 0, management: 0, kitchen: 10, itcrowd: 0 },
    warnings: 0,
    gear: [stapler, label],
    equipped: { weapon: stapler.uid, head: null, body: null, feet: null, trinket: null },
    consumables: { coffee: 1, biscuits: 2, paperclip: 2 },
    stash: {},
    ammo: { labels: 60, air: 0, ducks: 0, toner: 0 },
    sanity: 100,
    energy: 100,
    loyly: 40,
    bac: 0,
    stomach: 0,
    peakBac: 0,
    dependency: 0,
    hangover: 0,
    empties: 0,
    caffeine: 0,
    caffeinePeak: 0,
    caffeineTol: 0,
    crash: 0,
    actionItems: 0,
    spells: [],
    spell: null,
    queue: [],
    quests: [],
    nextQuestId: 1,
    questLog: [],
    questItems: [],
    journal: [],
    flags: {},
    findings: 0,
    makkara: false,
    hauki: false,
    palju: false,
    saunaBuff: false,
    suoBlessing: false,
    buffs: {},
    floorState: freshFloorState(0),
    weekend: freshWeekend(),
    oncall: freshOnCall(),
    upgrades: [],
    achievements: [],
    tipsShown: [],
    booksRead: [],
    stats: { resolvedField: 0, resolvedDesk: 0, resolvedPeace: 0, breaches: 0, burnouts: 0, bosses: 0, wrongFixes: 0, drinks: 0, blackouts: 0, locks: 0, spellsCast: 0, cans: 0, fish: 0, elites: 0, staffedDone: 0, staffedMissed: 0, mentored: 0, treats: 0, pagesAnswered: 0, pagesMissed: 0 },
    team: {},
    induction: null,
    hudHidden: [],
    seed,
    won: false,
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
  const rung = s.rung;
  if (rung > 0) {
    for (const a of ATTRIBUTES) s.attrs[a] = Math.min(100, s.attrs[a] + Math.round(rung * 2.2));
    for (const sk of SKILLS) s.skills[sk].value = Math.min(100, s.skills[sk].value + rung * 3);
    s.level = 1 + rung;
    s.perkPoints = Math.floor(rung / 2);
    s.rep += rung * 45;
    s.standing.management += rung * 2;
    for (const [minRung, base] of HIRE_KIT) if (rung >= minRung) s.gear.push(plainInstance(base, r));
    if (rung >= 7) s.ammo.ducks = 6;
    if (rung >= 9) s.ammo.air = 80;
  }
  if (s.spells.length > 0) s.spell = s.spells[0] ?? null;
  s.sanity = derive(s).maxSanity;
  s.loyly = derive(s).maxLoyly;
  return s;
}

// ---------------------------------------------------------------- persistence

/** Upgrade an older save in place. v2 saves (one flat slot) become v3. */
export function migrate(raw: unknown): SaveState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version === 3) return raw as SaveState;
  if (o.version !== 2) return null;
  const old = raw as Record<string, unknown> & { owned?: string[]; equipped?: Record<string, string | null>; perks?: Record<string, number>; rung?: number };
  const fresh = newSave(typeof o.seed === 'number' ? o.seed : 1);
  const r = new Rng(typeof o.seed === 'number' ? o.seed : 1);
  const gear: GearInstance[] = [];
  const uidFor: Record<string, string> = {};
  for (const id of old.owned ?? []) {
    const inst = plainInstance(id, r);
    gear.push(inst);
    uidFor[id] = inst.uid;
  }
  const eq = old.equipped ?? {};
  const pick = (id: string | null | undefined): string | null => (id === null || id === undefined ? null : uidFor[id] ?? null);
  // Old nine-rung ladder onto the new twelve.
  const RUNG_MAP = [0, 2, 3, 4, 6, 7, 8, 10, 11];
  // Perks that no longer exist are refunded.
  const perks: Record<string, number> = {};
  let refund = 0;
  for (const [id, n] of Object.entries(old.perks ?? {})) {
    if (treePerk(id) !== undefined) perks[id] = n;
    else refund += n;
  }
  const merged = { ...fresh, ...(raw) };
  merged.version = 3;
  merged.gear = gear.length > 0 ? gear : fresh.gear;
  merged.equipped = {
    weapon: pick(eq.weapon) ?? merged.gear[0]?.uid ?? '',
    head: pick(eq.head), body: pick(eq.body), feet: pick(eq.feet), trinket: pick(eq.trinket),
  };
  merged.perks = perks;
  merged.perkPoints = (typeof o.perkPoints === 'number' ? o.perkPoints : 0) + refund;
  merged.rung = RUNG_MAP[Math.max(0, Math.min(8, old.rung ?? 0))] ?? 0;
  merged.stats = { ...fresh.stats, ...(o.stats as object) };
  delete (merged as unknown as Record<string, unknown>).owned;
  return merged;
}

/**
 * Fill in anything a save from an older build of v3 is missing, so a field
 * added later never reads as undefined.
 */
export function normalizeSave(raw: unknown): SaveState | null {
  const m = migrate(raw);
  if (m === null) return null;
  const fresh = newSave(typeof m.seed === 'number' ? m.seed : 1);
  const out: SaveState = {
    ...fresh,
    ...m,
    stats: { ...fresh.stats, ...m.stats },
    weekend: { ...fresh.weekend, ...m.weekend },
    oncall: normalizeOnCall((m as Partial<SaveState>).oncall),
    floorState: { ...freshFloorState(m.floor ?? 0), ...m.floorState },
    ammo: { ...fresh.ammo, ...m.ammo },
    standing: { ...fresh.standing, ...m.standing },
    attrUps: { ...fresh.attrUps, ...m.attrUps },
    induction: normalizeInduction((m as Partial<SaveState>).induction),
    hudHidden: Array.isArray((m as Partial<SaveState>).hudHidden) ? (m.hudHidden as unknown[]).filter((x): x is HudMeter => (HUD_METERS as readonly unknown[]).includes(x)) : [],
  };
  for (const k of SKILLS) if (out.skills[k] === undefined) out.skills[k] = { value: 5, progress: 0 };
  for (const a of ATTRIBUTES) if (typeof out.attrs[a] !== 'number') out.attrs[a] = 35;
  if (out.gear.length === 0) out.gear = fresh.gear;
  if (gearByUid(out, out.equipped.weapon) === undefined) out.equipped.weapon = out.gear.find((g) => baseOf(g)?.slot === 'weapon')?.uid ?? fresh.equipped.weapon;
  return out;
}

const LEGACY_KEY = 'workgrumble-crawler-v2';

/** A v2 save from before slots existed, if there is one. */
export function loadLegacy(): SaveState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function perk(s: SaveState, id: string): number {
  return s.perks[id] ?? 0;
}

export function canTakePerk(s: SaveState, id: string): boolean {
  const p = treePerk(id);
  if (p === undefined || s.perkPoints <= 0) return false;
  return canTake(p, perk(s, id), p.tree === null ? 100 : s.skills[p.tree].value);
}

// ---------------------------------------------------------------- gear

export function gearByUid(s: SaveState, uid: string | null): GearInstance | undefined {
  return uid === null ? undefined : s.gear.find((g) => g.uid === uid);
}

export function equippedGear(s: SaveState): GearInstance[] {
  const out: GearInstance[] = [];
  for (const slot of ['weapon', 'head', 'body', 'feet', 'trinket'] as const) {
    const g = gearByUid(s, s.equipped[slot]);
    if (g !== undefined) out.push(g);
  }
  return out;
}

export function hasUnique(s: SaveState, id: string): boolean {
  return equippedGear(s).some((g) => g.unique === id);
}

function gearDefsOn(s: SaveState): GearDef[] {
  const out: GearDef[] = [];
  for (const slot of ['head', 'body', 'feet', 'trinket'] as const) {
    const g = gearByUid(s, s.equipped[slot]);
    const def = g === undefined ? undefined : GEAR.find((x) => x.id === g.base);
    if (def !== undefined) out.push(def);
  }
  return out;
}

function affix(s: SaveState, stat: AffixStat): number {
  return sumAffix(equippedGear(s), stat);
}

/** Effective attribute, including gear. */
export function attr(s: SaveState, a: Attribute): number {
  return s.attrs[a] + affix(s, a);
}

/** Effective skill, including gear and domain passives. */
export function skill(s: SaveState, k: Skill): number {
  let v = s.skills[k].value + affix(s, k);
  if (s.domain === 'Security' && s.rung >= 4 && (k === 'security' || k === 'stealth')) v += k === 'security' ? 15 : 10;
  if (s.domain === 'Database' && s.rung >= 4 && k === 'troubleshooting') v += 10;
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
  spellCost: number;
  persuade: number;
  priceMult: number;
  carry: number;
  weight: number;
  overEncumbered: boolean;
  weapon: WeaponDef;
  weaponInst: GearInstance | undefined;
  band: BandEffects;
  caffeine: CaffeineEffects;
  /** White Monster: ascended. */
  ultra: boolean;
  /** Jump height multiplier (Red Bull wings, Parkour). */
  jump: number;
  slaMult: number;
  queueMax: number;
  deskRepMult: number;
  dodge: number;
  specials: Set<string>;
  /** Things on your plate, your capacity, and how far over it you are. */
  workload: number;
  capacity: number;
  overload: number;
}

/**
 * Workload: every quest in play and every mail task not yet done is on your
 * plate. Management does not check the plate before adding to it.
 */
export function workload(s: SaveState): { active: number; capacity: number; over: number } {
  const active = s.questLog.filter(isActive).length + s.quests.filter((q) => !q.done && q.kind !== 'boss').length;
  const specialist = s.rung >= 4 && s.track === 'specialist';
  const capacity = 3 + (specialist ? 1 : 0) + perk(s, 'timemgmt') + (perk(s, 'boundaries') > 0 ? 1 : 0) + (perk(s, 'mentor') >= 2 ? 1 : 0);
  return { active, capacity, over: Math.max(0, active - capacity) };
}

export const ACTION_ITEM_KG = 6;
export const EMPTY_KG = 0.3;

export function derive(s: SaveState): Derived {
  const defs = gearDefsOn(s);
  const sum = (f: (g: GearDef) => number | undefined): number => defs.reduce((a, g) => a + (f(g) ?? 0), 0);
  const specials = new Set<string>();
  for (const g of equippedGear(s)) if (g.unique !== undefined) specials.add(g.unique);
  const A = (a: Attribute): number => attr(s, a);
  const weaponInst = gearByUid(s, s.equipped.weapon);
  const weapon = weaponById(weaponInst?.base ?? 'stapler');

  let weight = 0;
  for (const g of s.gear) {
    const w = baseOf(g)?.weight ?? 0;
    const heavy = perk(s, 'rackmount') > 0 && (baseOf(g)?.slot === 'weapon') && w >= 4;
    weight += heavy ? 0 : w;
  }
  for (const [id, n] of Object.entries(s.consumables)) weight += (id === 'laptop' ? 3 : itemById(id)?.weight ?? 0) * n;
  weight += (s.ammo.labels * 0.005) + (s.ammo.air * 0.005) + (s.ammo.ducks * 0.1) + (s.ammo.toner * 0.013);
  const actionKg = specials.has('derekLanyard') ? 0 : ACTION_ITEM_KG * Math.pow(0.5, perk(s, 'teflon'));
  weight += s.actionItems * actionKg;
  weight += s.empties * EMPTY_KG;
  const carry = Math.round(25 + A('grit') * 0.45 + perk(s, 'back') * 15 + (perk(s, 'rackmount') > 0 ? 25 : 0));
  const rungTrack = s.rung >= 4;
  const specialist = rungTrack && s.track === 'specialist';
  const engineer = rungTrack && s.track === 'engineer';
  const hang = s.hangover > 0 ? 0.8 : 1;
  const band = BAND_EFFECTS[bandFor(s.bac, specials.has('flask'))];
  const functional = perk(s, 'functional') > 0 && bandFor(s.bac) === 'merry';
  const caff = CAFFEINE_EFFECTS[caffeineBand(s.caffeine, s.caffeineTol)];
  const crash = s.crash > 0;
  const sign = s.sign;
  const archSol = s.rung >= 10 && s.arch === 'solutions';
  const archEnt = s.rung >= 10 && s.arch === 'enterprise';
  const tier = (id: string, per: number): number => perk(s, id) * per;
  const buff = (id: string): boolean => (s.buffs[id] ?? 0) > 0;
  // Overallocated: every assignment past your capacity wears you down.
  const load = workload(s);
  const strain = Math.max(0.55, 1 - load.over * 0.07);
  // The White Monster: the king of cans. Ascended, nothing shakes you.
  const ultra = buff('ultra');
  const caffeine = ultra ? { ...caff, jitter: 0, drain: 0, speed: Math.max(caff.speed, 0.08), attack: Math.max(caff.attack, 0.08) } : caff;
  const powerUp = (ultra ? 1.4 : 1) * (s.saunaBuff ? 1.25 : 1);
  return {
    maxSanity: Math.round((50 + A('patience') * 1.3 + tier('patience', 25) + sum((g) => g.maxSanity) + affix(s, 'maxSanity') + (s.level - 1) * 4
      + (sign === 'bsod' ? 25 : 0) + (s.makkara ? 20 : 0) + (s.hauki ? 15 : 0)) * hang * (s.palju ? 1.15 : 1) * strain),
    maxLoyly: Math.round(20 + A('tech') * 0.8 + (sign === 'juhannus' ? 30 : 0) + affix(s, 'maxLoyly') + tier('loylywell', 15) + (s.upgrades.includes('savusauna') ? 20 : 0)),
    armor: Math.min(0.8, sum((g) => g.armor) + affix(s, 'armor') + skill(s, 'sisu') * 0.0025 + tier('thickskin', 0.06)),
    auraResist: Math.min(0.9, sum((g) => g.auraResist) + affix(s, 'auraResist') + A('liver') * 0.002 + (perk(s, 'stakeholder') > 0 ? 0.5 : 0) + (archEnt ? 0.5 : 0)),
    bossResist: Math.min(0.6, sum((g) => g.bossResist)),
    speedMult: (1 + sum((g) => g.speed) + affix(s, 'speed') + (A('reflex') - 35) * 0.003 + tier('cardio', 0.05) + caffeine.speed - (crash && !ultra ? 0.25 : 0) + (ultra ? 0.3 : 0)) * (s.hangover > 0 && !ultra ? 0.92 : 1),
    stealth: Math.min(0.85, sum((g) => g.stealth) + affix(s, 'stealth') + skill(s, 'stealth') * 0.003 + tier('greyhoodie', 0.08)),
    healMult: 1 + sum((g) => g.healMult) + affix(s, 'heal') + (specialist ? 0.2 : 0),
    noRoot: ultra || defs.some((g) => g.noRoot === true),
    duck: defs.some((g) => g.duck === true),
    energyRegen: (1 + sum((g) => g.energyRegen) + (s.domain === 'Cloud' && rungTrack ? 0.3 : 0) + caffeine.energyRegen + (perk(s, 'marathon') > 0 ? 0.5 : 0) + (buff('burn') ? 1 : 0)) * (s.hangover > 0 && !ultra ? 0.5 : 1) * (crash && !ultra ? 0.3 : 1) * (ultra ? 3 : 1) * Math.max(0.4, 1 - load.over * 0.15),
    attackSpeed: (1 + affix(s, 'attackSpeed') + (A('reflex') - 35) * 0.002 + caffeine.attack + (ultra ? 0.25 : 0)) * (crash && !ultra ? 0.8 : 1),
    meleeMult: (1 + (A('grit') - 35) * 0.008 + skill(s, 'hardware') * 0.006 + affix(s, 'damage') + tier('percussive', 0.2)) * (1 + band.damage) * (engineer ? 1.2 : 1) * (sign === 'deploy' ? 1.2 : 1) * (s.domain === 'Systems' && rungTrack ? 1.1 : 1) * powerUp * (buff('gymbro') ? 1.2 : 1),
    rangedMult: (1 + (A('reflex') - 35) * 0.008 + skill(s, 'scripting') * 0.006 + affix(s, 'damage') + tier('automation', 0.2)) * (1 + band.damage * 0.5) * (engineer ? 1.2 : 1) * (sign === 'deploy' ? 1.2 : 1) * powerUp,
    spellMult: (1 + skill(s, 'runecraft') * 0.008 + (A('tech') - 35) * 0.005) * (engineer ? 1.15 : 1) * (perk(s, 'steamlord') > 0 ? 1.25 : 1) * powerUp,
    spellCost: perk(s, 'runeeconomy') > 0 ? 0.8 : 1,
    persuade: tier('listening', 10) + (archSol ? 20 : 0) + band.persuade,
    priceMult: perk(s, 'charmoffensive') > 0 ? 0.85 : 1,
    carry,
    weight: Math.round(weight * 10) / 10,
    overEncumbered: weight > carry,
    weapon,
    weaponInst,
    band: functional ? { ...band, sway: 0 } : band,
    caffeine,
    ultra,
    jump: (buff('wings') ? 1.8 : 1) * (perk(s, 'parkour') > 0 ? 1.3 : 1),
    slaMult: (specialist ? 1.4 : 1) * WORKPLACES[s.workplace].sla,
    queueMax: 8 + (specialist ? 2 : 0),
    deskRepMult: (specialist ? 1.25 : 1) * (1 + perk(s, 'runbook') * 0.5) * (archSol ? 1.25 : 1) * (specials.has('hoodie10x') ? 2 : 1),
    dodge: Math.min(0.35, Math.max(0, (A('reflex') - 30) * 0.004 + (perk(s, 'parkour') > 0 ? 0.1 : 0))),
    specials,
    workload: load.active,
    capacity: load.capacity,
    overload: load.over,
  };
}

export function adjustStanding(s: SaveState, f: Faction, delta: number): void {
  const mult = f === 'management' && delta > 0 && s.rung >= 10 && s.arch === 'enterprise' ? 2 : 1;
  s.standing[f] = Math.round(clampStanding(s.standing[f] + delta * mult) * 10) / 10;
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

/** A skill book or a trainer: one point, no questions, still counts toward levelling. */
export function raiseSkill(s: SaveState, k: Skill): number | null {
  const st = s.skills[k];
  if (st.value >= 100) return null;
  st.value += 1;
  st.progress = 0;
  s.skillUps += 1;
  s.attrUps[SKILL_INFO[k].attr] += 1;
  return st.value;
}

export function levelUpReady(s: SaveState): boolean {
  return s.skillUps >= SKILL_UPS_PER_LEVEL;
}

/** Patience always creeps up by one at a level-up, on top of any choice. */
export const PATIENCE_BONUS = 1;

/** Apply a level-up: raise the two chosen attributes by their multipliers. */
export function applyLevelUp(s: SaveState, chosen: readonly Attribute[]): void {
  if (!levelUpReady(s)) return;
  for (const a of chosen.slice(0, 2)) s.attrs[a] = Math.min(100, s.attrs[a] + attributeMultiplier(s.attrUps[a]));
  s.attrs.patience = Math.min(100, s.attrs.patience + PATIENCE_BONUS);
  s.level += 1;
  s.perkPoints += 1;
  s.skillUps = Math.max(0, s.skillUps - SKILL_UPS_PER_LEVEL);
  for (const a of ATTRIBUTES) s.attrUps[a] = 0;
}

export function skillSum(s: SaveState): number {
  return [...SKILLS].map((k) => s.skills[k].value).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
}

export { FACTIONS };
