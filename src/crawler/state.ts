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
import { type Deck, emptyDeck, heldCards, normalizeDeck } from './deck';
import type { PlaySave } from './mission';
import { ALARM_RULES, type AlarmRule } from './mission';
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
  /** Raised on the hub: its breach is the hub's (the reporter comes for you there), wherever you are when it falls due. */
  readonly hub?: true;
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
/**
 * Once-a-floor things: the saves that hold you up once (Unbreakable, the
 * Nokia), the steam taking you under (SUO), the cold-steam line. The P1
 * floor keeps its own (`FloorState`) and the hub its own (`HubState.once`,
 * fresh each Monday): using one on the hub does not spend the P1's.
 */
export interface OncePerFloor {
  unbreakableUsed: boolean;
  nokiaUsed: boolean;
  suo: boolean;
  coldSteam: boolean;
}

export interface FloorState extends OncePerFloor {
  floor: number;
  bossDone: boolean;
  boss?: { hp: number; phase: 1 | 2 };
  /** Interactable ids already used, looted or picked. */
  used: number[];
  /** Quest pickups already taken. */
  picked: string[];
  /** Level spawns (by index) already resolved: they stay resolved on a reload. */
  resolved: number[];
  /** Uncollected gear, at its current spot on this floor. */
  gearDrops: { gear: GearInstance; x: number; z: number }[];
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

/** Why somebody on the hub turned on you (docs/SPEC_HELLDESK_030_S1.md, "Hostility is earned"). */
export type HubReason = 'breach' | 'ignored' | 'assault' | 'witness' | 'caught' | 'grudge' | 'story' | 'failed';

/** Somebody on the hub who is after you, until they are resolved or Monday comes. */
export interface HubHostile {
  /** Their level spawn's index, or an arrival's (HUB_EXTRA_BASE and up). */
  readonly spawnIndex: number;
  readonly reason: HubReason;
}

/** Arrivals' indices start here, above every level spawn's. */
export const HUB_EXTRA_BASE = 200000;

/**
 * The week's card givers on the hub (S1b) have indices of their own from
 * here, one per giver (missions.ts GIVERS), the same every week: the same
 * person whenever their cards are dealt. Never an arrival's.
 */
export const HUB_GIVER_BASE = 900000;

/** What somebody new on the hub can be. */
export type HubArrivalKind = 'user' | 'manager' | 'reply' | 'customer';

/**
 * Somebody new on the hub this week, not one of the level's own people: a
 * story choice's enemy, a manager who caught you napping, an SLA breach's
 * reporter up the lift. Kept until they are resolved or Monday comes, so a
 * reload and the lift bring back the same person.
 */
export interface HubArrival {
  /** Unique for the career: taken from `HubState.nextArrival`, never handed out twice. */
  readonly index: number;
  readonly kind: HubArrivalKind;
  readonly name: string;
  readonly why: 'breach' | 'story' | 'visit';
}

/**
 * The hub, the career's own office floor: what has happened on it, so a
 * reload and the trips to the P1 floor keep it. Everything but the gear
 * left lying about belongs to one week; Monday starts it again (the coffee
 * machine refills over the weekend, and everybody had the weekend).
 */
export interface HubState {
  /** The week this belongs to. */
  week: number;
  /** The PA's ending resolved this week's major incident on the hub. */
  bossDone: boolean;
  hostile: HubHostile[];
  /** Hub spawns resolved this week (the hostile ones, talked down or beaten): back next Monday. */
  resolved: number[];
  /** Walk-ups ignored, by spawn index: the hub clock at each ignore. The third turns them; each is forgotten after ten minutes of hub time. */
  ignores: Record<number, number[]>;
  /** Interactable ids used this week. */
  used: number[];
  /** Quest pickups taken and drinks had on the hub this week. */
  picked: string[];
  drinksHere: number;
  /** Seconds of hub play this week, and that clock at the last walk-up. */
  clock: number;
  lastWalkUp: number;
  /** Uncollected gear on the hub, where it lies. It is your floor: it waits. */
  gearDrops: { gear: GearInstance; x: number; z: number }[];
  /** Hub tickets that breached while you were upstairs: their reporters come for you when you are back (announced then). */
  breaches: { t: number; from: string }[];
  /** Coworkers whose card you failed (S1b): after you when you are next on the hub (announced then), by giver id. */
  failed: { giver: string; card: string }[];
  /** This week's arrivals (resolved ones too: `resolved` says who is gone). */
  arrivals: HubArrival[];
  /** The next arrival's index: it only ever counts up, across weeks. */
  nextArrival: number;
  /** The hub's own once-a-floor things, this week. */
  once: OncePerFloor;
  /** People (by `hub.ts personKey`) who saw a crime and are not ones to fight: cold on you for the week. */
  cold: string[];
  /**
   * What happened with each person this week that happens once (by
   * `hub.ts personKey`): their one-off conversation beats (a leaving-card
   * signature, the tea, the lecture), a gift given, a talk-down had.
   */
  people: Record<string, HubPerson>;
}

/** One person's once-a-week beats on the hub. */
export interface HubPerson {
  memo: string[];
  gift?: true;
  talked?: true;
}

/**
 * A card being played (S1b): which card of the week's deck, its map's seed
 * and its dealt rules, what has been used and picked up on its map, and the
 * run as last saved, so a reload mid-mission lands at its lift with
 * everything as it was.
 */
export interface MissionSave extends OncePerFloor {
  readonly card: string;
  /** Its place in this week's deck. */
  readonly index: number;
  readonly seed: number;
  readonly alarm: AlarmRule;
  readonly afterHours: boolean;
  used: number[];
  picked: string[];
  drinksHere: number;
  gearDrops: { gear: GearInstance; x: number; z: number }[];
  /** Written by the game before every save (`MissionPlay.note`); null before the first. */
  run: PlaySave | null;
}

export function freshMission(card: string, index: number, seed: number, alarm: AlarmRule, afterHours: boolean): MissionSave {
  return { card, index, seed, alarm, afterHours, used: [], picked: [], drinksHere: 0, gearDrops: [], run: null, unbreakableUsed: false, nokiaUsed: false, suo: false, coldSteam: false };
}

/** A saved mission, checked: anything broken and it is dropped (the card stays on the board). */
export function normalizeMission(raw: unknown): MissionSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Partial<Record<keyof MissionSave, unknown>>;
  if (typeof o.card !== 'string' || typeof o.index !== 'number' || typeof o.seed !== 'number' || !ALARM_RULES.includes(o.alarm as AlarmRule)) return null;
  const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
  const m = freshMission(o.card, o.index, o.seed >>> 0, o.alarm as AlarmRule, o.afterHours === true);
  m.used = nums(o.used);
  m.picked = Array.isArray(o.picked) ? o.picked.filter((x): x is string => typeof x === 'string') : [];
  m.drinksHere = typeof o.drinksHere === 'number' ? o.drinksHere : 0;
  m.gearDrops = Array.isArray(o.gearDrops) ? o.gearDrops as MissionSave['gearDrops'] : [];
  m.run = typeof o.run === 'object' && o.run !== null ? o.run as PlaySave : null;
  for (const k of ['unbreakableUsed', 'nokiaUsed', 'suo', 'coldSteam'] as const) m[k] = o[k] === true;
  return m;
}

/** The cards left before they were done (`SaveState.left`), checked; a save from before them kept only a P1 left, as `p1Run`. */
function normalizeLeft(m: { left?: unknown; p1Run?: unknown }): MissionSave[] {
  const raw = Array.isArray(m.left) ? m.left as unknown[] : [m.p1Run];
  return raw.map(normalizeMission).filter((x): x is MissionSave => x !== null);
}

/** The once-a-floor things of where you are at work: the hub's, a mission map's, or the P1 floor's. */
export function onceHere(s: SaveState): OncePerFloor {
  if (s.location === 'mission' && s.mission !== null) return s.mission;
  return s.location === 'hub' ? s.hub.once : s.floorState;
}

/** Pickups and drinks on the hub this week, on a mission map, or on the P1 floor. */
export function activityHere(s: SaveState): Pick<FloorState, 'picked' | 'drinksHere'> {
  if (s.location === 'mission' && s.mission !== null) return s.mission;
  return s.location === 'hub' ? s.hub : s.floorState;
}

/** Interactables used where you are (kept by the floor, the hub's week, or the mission), or null at the mökki. */
export function usedHere(s: SaveState): number[] | null {
  if (s.location === 'mission') return s.mission?.used ?? null;
  return s.location === 'office' ? s.floorState.used : s.location === 'hub' ? s.hub.used : null;
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
  version: 4;
  careerId?: string | undefined;
  name: string;
  background: string;
  sign: string;
  workplace: Workplace;
  ironman: boolean;
  floor: number;
  /** The week number: the hub all week, that week's P1 floor up the lift, the weekend at the mökki. */
  week: number;
  /** The hub, the week's P1 floor ('office': `floor` and `floorState`), a card's map ('mission': `mission`), or the mökki. */
  location: 'hub' | 'office' | 'mission' | 'mokki';
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
  hub: HubState;
  /** This week's deck of cards (S1b, D2): dealt on Monday, the workstation shows it. */
  deck: Deck;
  /** The card being played, while on its map (and kept across a reload). */
  mission: MissionSave | null;
  /**
   * Cards of this week's deck left before they were done, each as it was
   * left (a P1 left at its lift, a card aborted): the lift goes back to it,
   * with everyone already dealt with still dealt with and everything already
   * paid still paid. One per card; Monday's deal clears them.
   */
  left: MissionSave[];
  /** How each coworker who hands out cards feels about you (by giver id): a declined card costs a little. */
  rapport: Record<string, number>;
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
  return { floor, bossDone: false, used: [], picked: [], resolved: [], gearDrops: [], extras: [], unbreakableUsed: false, nokiaUsed: false, drinksHere: 0, suo: false, coldSteam: false };
}

export function freshHub(week: number): HubState {
  return { week, bossDone: false, hostile: [], resolved: [], ignores: {}, used: [], picked: [], drinksHere: 0, clock: 0, lastWalkUp: 0, gearDrops: [], breaches: [], failed: [], arrivals: [], nextArrival: HUB_EXTRA_BASE, once: { unbreakableUsed: false, nokiaUsed: false, suo: false, coldSteam: false }, cold: [], people: {} };
}

/** Monday on the hub: the week's people and props start again; the gear on the floor is still there, and arrivals' indices go on counting. */
export function hubWeek(h: HubState, week: number): HubState {
  return { ...freshHub(week), gearDrops: h.gearDrops, nextArrival: h.nextArrival };
}

const ARRIVAL_KINDS: readonly HubArrivalKind[] = ['user', 'manager', 'reply', 'customer'];

const HUB_REASONS: readonly HubReason[] = ['breach', 'ignored', 'assault', 'witness', 'caught', 'grudge', 'story', 'failed'];

/** A saved hub, checked field by field (a field from an older build, or a broken one, is fresh). */
export function normalizeHub(raw: unknown, week: number): HubState {
  const fresh = freshHub(week);
  if (typeof raw !== 'object' || raw === null) return fresh;
  const o = raw as Partial<Record<keyof HubState, unknown>>;
  const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const h: HubState = {
    week: num(o.week, week),
    bossDone: o.bossDone === true,
    hostile: [],
    resolved: nums(o.resolved),
    ignores: {},
    used: nums(o.used),
    picked: Array.isArray(o.picked) ? o.picked.filter((x): x is string => typeof x === 'string') : [],
    drinksHere: Math.max(0, Math.floor(num(o.drinksHere, 0))),
    clock: num(o.clock, 0),
    lastWalkUp: num(o.lastWalkUp, 0),
    gearDrops: Array.isArray(o.gearDrops) ? o.gearDrops as HubState['gearDrops'] : [],
    breaches: Array.isArray(o.breaches) ? (o.breaches as unknown[]).filter((x): x is { t: number; from: string } => {
      const b = x as { t?: unknown; from?: unknown } | null;
      return typeof b === 'object' && b !== null && typeof b.t === 'number' && typeof b.from === 'string';
    }).map((b) => ({ t: b.t, from: b.from })) : [],
    failed: Array.isArray(o.failed) ? (o.failed as unknown[]).filter((x): x is { giver: string; card: string } => {
      const f = x as { giver?: unknown; card?: unknown } | null;
      return typeof f === 'object' && f !== null && typeof f.giver === 'string' && typeof f.card === 'string';
    }).map((f) => ({ giver: f.giver, card: f.card })) : [],
    arrivals: Array.isArray(o.arrivals) ? (o.arrivals as unknown[]).filter((x): x is HubArrival => {
      const r = x as Partial<HubArrival> | null;
      return typeof r === 'object' && r !== null && typeof r.index === 'number' && r.index >= HUB_EXTRA_BASE && typeof r.name === 'string'
        && ARRIVAL_KINDS.includes(r.kind as HubArrivalKind) && (r.why === 'breach' || r.why === 'story' || r.why === 'visit');
    }).map((r) => ({ index: r.index, kind: r.kind, name: r.name, why: r.why })) : [],
    nextArrival: HUB_EXTRA_BASE,
    once: { unbreakableUsed: false, nokiaUsed: false, suo: false, coldSteam: false },
    cold: Array.isArray(o.cold) ? (o.cold as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    people: {},
  };
  if (typeof o.people === 'object' && o.people !== null) {
    for (const [k, v] of Object.entries(o.people as Record<string, unknown>)) {
      const p = v as { memo?: unknown; gift?: unknown; talked?: unknown } | null;
      if (typeof p !== 'object' || p === null) continue;
      const memo = Array.isArray(p.memo) ? p.memo.filter((x): x is string => typeof x === 'string') : [];
      h.people[k] = { memo, ...(p.gift === true ? { gift: true as const } : {}), ...(p.talked === true ? { talked: true as const } : {}) };
    }
  }
  if (typeof o.once === 'object' && o.once !== null) {
    const once = o.once as Partial<Record<keyof OncePerFloor, unknown>>;
    for (const k of ['unbreakableUsed', 'nokiaUsed', 'suo', 'coldSteam'] as const) h.once[k] = once[k] === true;
  }
  if (Array.isArray(o.hostile)) {
    for (const x of o.hostile as unknown[]) {
      const e = x as { spawnIndex?: unknown; reason?: unknown; name?: unknown } | null;
      if (typeof e !== 'object' || e === null || typeof e.spawnIndex !== 'number' || !HUB_REASONS.includes(e.reason as HubReason)) continue;
      const reason = e.reason as HubReason;
      h.hostile.push({ spawnIndex: e.spawnIndex, reason });
      // An earlier 0.3.0 build kept somebody up the lift by name on the hostile list: they are an arrival now.
      if (e.spawnIndex >= HUB_EXTRA_BASE && e.spawnIndex < HUB_GIVER_BASE && typeof e.name === 'string' && !h.arrivals.some((r) => r.index === e.spawnIndex)) {
        h.arrivals.push({ index: e.spawnIndex, kind: 'user', name: e.name, why: reason === 'story' ? 'story' : 'breach' });
      }
    }
  }
  // Never behind an index already handed out.
  h.nextArrival = Math.max(num(o.nextArrival, HUB_EXTRA_BASE), ...h.arrivals.map((r) => r.index + 1), ...h.hostile.map((e) => (e.spawnIndex >= HUB_EXTRA_BASE && e.spawnIndex < HUB_GIVER_BASE ? e.spawnIndex + 1 : HUB_EXTRA_BASE)));
  if (typeof o.ignores === 'object' && o.ignores !== null) {
    for (const [k, v] of Object.entries(o.ignores)) {
      if (!/^\d+$/.test(k)) continue;
      // A count from an earlier 0.3.0 build: that many ignores, counted now.
      const at = typeof v === 'number' && Number.isInteger(v) && v > 0 ? new Array<number>(Math.min(v, 3)).fill(h.clock) : nums(v);
      if (at.length > 0) h.ignores[Number(k)] = at;
    }
  }
  // A hub saved in another week is that week's: this one starts fresh.
  return h.week === week ? h : hubWeek(h, week);
}

/**
 * Somebody from the level's spawns dealt with: kept by the P1 floor, or by
 * the hub for the week (and no longer after you), so a reload and the lift
 * do not bring them back.
 */
export function noteResolved(s: SaveState, spawnIndex: number): void {
  // On a mission map the card keeps its own people (missionplay.ts), by their place in its crowd.
  if (spawnIndex < 0 || s.location === 'mission') return;
  const list = s.location === 'office' ? s.floorState.resolved : s.location === 'hub' ? s.hub.resolved : null;
  if (list !== null && !list.includes(spawnIndex)) list.push(spawnIndex);
  if (s.location === 'hub') s.hub.hostile = s.hub.hostile.filter((h) => h.spawnIndex !== spawnIndex);
}

/** Gear lying on the floor you are on: the P1's, or the hub's (which keeps it from week to week). */
export function gearDropsHere(s: SaveState): { gear: GearInstance; x: number; z: number }[] {
  if (s.location === 'mission' && s.mission !== null) return s.mission.gearDrops;
  return s.location === 'hub' ? s.hub.gearDrops : s.floorState.gearDrops;
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
    version: 4,
    careerId: crypto.randomUUID(),
    name: setup?.name ?? 'Pat Pending',
    background: bg?.id ?? 'grad',
    sign: setup?.sign ?? 'patch',
    workplace: setup?.workplace ?? 'standard',
    ironman: setup?.ironman ?? false,
    floor: 0,
    week: 1,
    location: 'hub',
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
    hub: freshHub(1),
    deck: emptyDeck(),
    mission: null,
    left: [],
    rapport: {},
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

/**
 * v3 to v4 (0.3.0, the hub): a career on an office floor is now on the hub
 * of the same week, its floor (and everything done on it) waiting up the
 * lift as that week's P1; one at the mökki stays there, and lands on the hub
 * on Monday. Nothing else changes: Rep, items, quests, standing and the
 * floor's progress are carried as they were.
 */
function toV4(v3: Record<string, unknown>): SaveState {
  const week = typeof v3.week === 'number' ? v3.week : 1;
  return { ...v3, version: 4, location: v3.location === 'mokki' ? 'mokki' : 'hub', hub: freshHub(week) } as unknown as SaveState;
}

/** Upgrade an older save in place. v2 saves (one flat slot) become v3, and v3 saves v4. */
export function migrate(raw: unknown): SaveState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version === 4) return raw as SaveState;
  if (o.version === 3) return toV4(o);
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
  merged.version = 4;
  delete merged.careerId;
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
  // A v2 career was on a floor or at the mökki: as a v3 one, it goes on through the hub.
  return toV4(merged);
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
    careerId: m.careerId,
    stats: { ...fresh.stats, ...m.stats },
    weekend: { ...fresh.weekend, ...m.weekend },
    oncall: normalizeOnCall((m as Partial<SaveState>).oncall),
    floorState: { ...freshFloorState(m.floor ?? 0), ...m.floorState },
    hub: normalizeHub((m as Partial<SaveState>).hub, typeof m.week === 'number' ? m.week : 1),
    // S1b's fields are additive to v4: a save from before them gets a deck dealt on load (`Game.loadWorld`).
    deck: normalizeDeck((m as Partial<SaveState>).deck),
    mission: normalizeMission((m as Partial<SaveState>).mission),
    left: normalizeLeft(m),
    rapport: normalizeRapport((m as Partial<SaveState>).rapport),
    ammo: { ...fresh.ammo, ...m.ammo },
    standing: { ...fresh.standing, ...m.standing },
    attrUps: { ...fresh.attrUps, ...m.attrUps },
    induction: normalizeInduction((m as Partial<SaveState>).induction),
    hudHidden: Array.isArray((m as Partial<SaveState>).hudHidden) ? (m.hudHidden as unknown[]).filter((x): x is HudMeter => (HUD_METERS as readonly unknown[]).includes(x)) : [],
  };
  // A mission with nothing to come back to (no card of that week's deck) lands on the hub instead.
  if (out.location === 'mission' && (out.mission === null || out.deck.week !== out.week || out.deck.cards[out.mission.index]?.id !== out.mission.card)) {
    out.location = 'hub';
    out.mission = null;
  }
  if (out.location !== 'mission') out.mission = null;
  // A card left with nothing to go back to (another week's deck, another card there) is gone.
  out.left = out.left.filter((r, k) => out.deck.week === out.week && out.deck.cards[r.index]?.id === r.card && out.left.findIndex((x) => x.index === r.index) === k);
  for (const k of SKILLS) if (out.skills[k] === undefined) out.skills[k] = { value: 5, progress: 0 };
  for (const a of ATTRIBUTES) if (typeof out.attrs[a] !== 'number') out.attrs[a] = 35;
  if (out.gear.length === 0) out.gear = fresh.gear;
  if (gearByUid(out, out.equipped.weapon) === undefined) out.equipped.weapon = out.gear.find((g) => baseOf(g)?.slot === 'weapon')?.uid ?? fresh.equipped.weapon;
  return out;
}

function normalizeRapport(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
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
  // Cards you accepted from the week's deck are on the plate too (S1b); the P1 never was a choice.
  const active = s.questLog.filter(isActive).length + s.quests.filter((q) => !q.done && q.kind !== 'boss').length + heldCards(s.deck).length;
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
