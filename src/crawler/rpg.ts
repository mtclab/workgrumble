/**
 * The role-playing rules, in the old Elder Scrolls mould: attributes, skills
 * that improve by being used, a level-up you earn by resting, and a career
 * ladder that is also the difficulty. Pure data and arithmetic - no DOM, no
 * three.js - so all of it is unit-tested.
 */

// ---------------------------------------------------------------- attributes

export const ATTRIBUTES = ['grit', 'reflex', 'tech', 'charm', 'patience', 'liver'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_INFO: Record<Attribute, { name: string; desc: string }> = {
  grit: { name: 'Grit', desc: 'Melee damage and how much you can carry. Server-lifting muscle.' },
  reflex: { name: 'Reflex', desc: 'Ranged damage, move speed and a chance to dodge thrown tickets.' },
  tech: { name: 'Tech', desc: 'Maximum Löyly, spell success, and seeing through a ticket.' },
  charm: { name: 'Charm', desc: 'Persuasion, prices at Internal IT, and how much people forgive.' },
  patience: { name: 'Patience', desc: 'Maximum sanity and how fast it comes back.' },
  liver: { name: 'Liver', desc: 'Alcohol tolerance, luck, and resisting being dragged into meetings.' },
};

// ---------------------------------------------------------------- skills

export const SKILLS = [
  'hardware', 'scripting', 'troubleshooting', 'soft', 'sisu',
  'stealth', 'security', 'drinking', 'runecraft', 'athletics',
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_INFO: Record<Skill, { name: string; attr: Attribute; desc: string }> = {
  hardware: { name: 'Hardware', attr: 'grit', desc: 'Melee tools. Rises when you hit someone with one.' },
  scripting: { name: 'Scripting', attr: 'reflex', desc: 'Ranged tools. Rises when a shot lands.' },
  troubleshooting: { name: 'Troubleshooting', attr: 'tech', desc: 'Fixing tickets at a terminal, and talking users through a fix.' },
  soft: { name: 'Soft Skills', attr: 'charm', desc: 'Persuasion. Rises every time you try it.' },
  sisu: { name: 'Sisu', attr: 'patience', desc: 'Grim Finnish endurance. Reduces the sanity you lose. Rises as you take hits.' },
  stealth: { name: 'Hiding in Plain Sight', attr: 'reflex', desc: 'Sneaking (C). Sneak attacks on the unaware hit far harder.' },
  security: { name: 'Security', attr: 'tech', desc: 'Picking supply-closet locks with paperclips.' },
  drinking: { name: 'Drinking', attr: 'liver', desc: 'Tolerance. Rises per drink. You know what you are doing.' },
  runecraft: { name: 'Mökki Magic', attr: 'liver', desc: 'Casting the old sauna runes. Rises with every cast.' },
  athletics: { name: 'Athletics', attr: 'patience', desc: 'Sprinting and jumping. Rises while you run.' },
};

export interface SkillState {
  value: number;
  progress: number;
}

/** Uses needed for the next point. Gets slower the better you are. */
export function skillThreshold(value: number): number {
  return 6 + value * 0.45;
}

/** Morrowind: the attribute bonus you get at level-up for N skill increases. */
export function attributeMultiplier(increases: number): number {
  if (increases <= 0) return 1;
  if (increases <= 4) return 2;
  if (increases <= 7) return 3;
  if (increases <= 9) return 4;
  return 5;
}

/** Skill increases needed for a level. */
export const SKILL_UPS_PER_LEVEL = 8;

// ---------------------------------------------------------------- backgrounds & signs

export interface Background {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly attrs: Partial<Record<Attribute, number>>;
  readonly major: readonly Skill[];
  readonly rep?: number;
  readonly standing?: Partial<Record<Faction, number>>;
  readonly spells?: readonly string[];
  readonly items?: Readonly<Record<string, number>>;
}

export const BACKGROUNDS: readonly Background[] = [
  { id: 'grad', name: 'Computer Science Graduate', desc: 'Knows the theory. Has never seen a printer up close.', attrs: { tech: 10, reflex: 5, liver: -5 }, major: ['troubleshooting', 'scripting', 'runecraft'] },
  { id: 'forum', name: 'Self-Taught Forum Legend', desc: '40,000 posts. Can pick any lock and fix any fault, as long as nobody watches.', attrs: { tech: 5, reflex: 10, charm: -5 }, major: ['scripting', 'security', 'stealth'], items: { paperclip: 5 } },
  { id: 'bar', name: 'Ex-Hospitality (Bar Work)', desc: 'Pulled pints for a decade. People skills, iron liver.', attrs: { charm: 10, liver: 10, tech: -5 }, major: ['soft', 'drinking', 'athletics'], items: { beer: 2 } },
  { id: 'army', name: 'Ex-Army Signals', desc: 'Laid cable under fire. Nothing in an office frightens you.', attrs: { grit: 10, patience: 5, charm: -5 }, major: ['hardware', 'sisu', 'athletics'] },
  { id: 'nepo', name: 'Nepotism Hire', desc: 'Your uncle is on the board. Management loves you. Nobody else does.', attrs: { charm: 5, tech: -5 }, major: ['soft', 'drinking', 'security'], rep: 150, standing: { management: 25, staff: -15, itcrowd: -10 } },
  { id: 'finn', name: 'Finnish Exchange Worker', desc: 'Arrived with a birch whisk and a quiet certainty. Knows the old löyly runes.', attrs: { liver: 10, patience: 5, charm: -5 }, major: ['runecraft', 'sisu', 'drinking'], spells: ['steam', 'vihta'], items: { lonkero: 2 } },
];

export interface Sign {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
}

export const SIGNS: readonly Sign[] = [
  { id: 'patch', name: 'Patch Tuesday', desc: '+10 Tech. Things break predictably around you.' },
  { id: 'deploy', name: 'The Friday Deploy', desc: '+20% damage dealt, -10 Patience. Living dangerously.' },
  { id: 'leap', name: 'The Leap Second', desc: '+10 Reflex. You exist slightly out of time.' },
  { id: 'juhannus', name: 'Juhannus (Midsummer)', desc: '+30 max Löyly and saunas heal twice as much.' },
  { id: 'freeze', name: 'The Year-End Freeze', desc: 'Meeting invites hold you for half as long.' },
  { id: 'bsod', name: 'The Blue Screen', desc: '+25 max sanity, -5 Charm. You have seen things.' },
];

// ---------------------------------------------------------------- careers

export const DOMAINS = ['Systems', 'Network', 'Cloud', 'Security', 'Database'] as const;
export type Domain = (typeof DOMAINS)[number];
export type Track = 'specialist' | 'engineer';

export const DOMAIN_INFO: Record<Domain, { ability: string; desc: string }> = {
  Systems: { ability: 'Hard Reboot', desc: 'G: a power-cycle shockwave around you. Passive: +10% melee damage.' },
  Network: { ability: 'Ping Sweep', desc: 'G: reveals and marks every person on the floor for 15s, and slows them. Passive: faster, longer shots.' },
  Cloud: { ability: 'Autoscale', desc: 'G: spin up two helper instances for 20s. Passive: +30% energy regen.' },
  Security: { ability: 'Lockdown', desc: 'G: stuns everyone nearby for 3s. Passive: +15 Security, +10 Stealth.' },
  Database: { ability: 'Rollback', desc: 'G: restore your sanity and position to 6 seconds ago. Passive: +10 Troubleshooting.' },
};

export const TRACK_INFO: Record<Track, { name: string; desc: string }> = {
  specialist: { name: 'Operations Specialist', desc: 'Keeps the lights on: SLA clocks +40%, healing +20%, queue +2, terminal Rep +25%.' },
  engineer: { name: 'Engineer', desc: 'Builds and breaks things: +20% tool damage, +15% spell power, ammo pickups doubled.' },
};

/** Rung 0..8. The title you hold is the difficulty you play at. */
export const RUNG_COUNT = 9;
export const BRANCH_RUNG = 3;

export function difficultyFor(rung: number): number {
  return [0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.6, 1.8, 2.05][Math.max(0, Math.min(8, rung))] ?? 1;
}

export function salaryFor(rung: number): number {
  return [60, 90, 120, 170, 220, 280, 350, 430, 520][Math.max(0, Math.min(8, rung))] ?? 60;
}

export function titleFor(rung: number, domain: Domain | null, track: Track | null): string {
  const d = domain ?? 'Systems';
  const role = track === 'engineer' ? `${d} Engineer` : `${d} Operations Specialist`;
  switch (Math.max(0, Math.min(8, rung))) {
    case 0: return 'IT Trainee';
    case 1: return 'Helpdesk Analyst';
    case 2: return 'Senior Helpdesk Analyst';
    case 3: return role;
    case 4: return `Senior ${role}`;
    case 5: return `Lead ${role}`;
    case 6: return `Principal ${role}`;
    case 7: return `${d} Architect`;
    default: return 'Senior Architect';
  }
}

/** What a promotion to `rung` asks for. */
export interface PromotionNeeds {
  readonly management: number;
  readonly skillSum: number;
  readonly level: number;
}

export function promotionNeeds(rung: number): PromotionNeeds {
  return { management: -10 + rung * 6, skillSum: 60 + rung * 22, level: 1 + rung };
}

// ---------------------------------------------------------------- factions

export const FACTIONS = ['staff', 'management', 'kitchen', 'itcrowd'] as const;
export type Faction = (typeof FACTIONS)[number];

export const FACTION_INFO: Record<Faction, { name: string; desc: string }> = {
  staff: { name: 'The Staff', desc: 'Everyone who raises tickets. High: some users will not bother you, talk-downs succeed. Low: they hit harder.' },
  management: { name: 'Management', desc: 'Gatekeeps promotion. Low: more meetings, harsher managers. High: gentler auras.' },
  kitchen: { name: 'The Kitchen Cabinet', desc: 'The office ladies. High: bigger heals and cake. Low: they will not put the kettle on for you.' },
  itcrowd: { name: 'The IT Crowd', desc: 'Internal IT and the sysadmins. Sets your prices and whether helpers will follow you.' },
};

export function clampStanding(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function standingLabel(v: number): string {
  if (v >= 60) return 'Beloved';
  if (v >= 25) return 'Liked';
  if (v > -25) return 'Neutral';
  if (v > -60) return 'Disliked';
  return 'Loathed';
}

// ---------------------------------------------------------------- persuasion

/** Chance (0..1) that a check succeeds. */
export function checkChance(skill: number, attr: number, difficulty: number, bonus = 0): number {
  const score = skill + attr * 0.4 + bonus - difficulty;
  return Math.max(0.05, Math.min(0.95, 0.5 + score / 100));
}

// ---------------------------------------------------------------- inebriation

/** BAC is 0..100 internally; shown as promille (‰), the Finnish way. */
export function promille(bac: number): string {
  return (bac / 40).toFixed(2);
}

export type Band = 'sober' | 'tipsy' | 'peak' | 'merry' | 'hammered' | 'blackout';

export function bandFor(bac: number): Band {
  if (bac >= 88) return 'blackout';
  if (bac >= 65) return 'hammered';
  if (bac >= 42) return 'merry';
  if (bac >= 26 && bac <= 36) return 'peak';
  if (bac >= 14) return 'tipsy';
  return 'sober';
}

export interface BandEffects {
  readonly label: string;
  readonly damage: number;
  readonly persuade: number;
  readonly sway: number;
  readonly spell: number;
  readonly regen: number;
  readonly caughtChance: number;
  readonly garble: number;
  readonly healerMult: number;
}

export const BAND_EFFECTS: Record<Band, BandEffects> = {
  sober: { label: 'Sober', damage: 0, persuade: 0, sway: 0, spell: 0, regen: 0, caughtChance: 0, garble: 0, healerMult: 1 },
  tipsy: { label: 'Tipsy', damage: 0.12, persuade: 10, sway: 0.2, spell: 5, regen: 0.4, caughtChance: 0.15, garble: 0, healerMult: 1 },
  peak: { label: 'BALLMER PEAK', damage: 0.2, persuade: 15, sway: 0.25, spell: 12, regen: 0.8, caughtChance: 0.2, garble: 0, healerMult: 1 },
  merry: { label: 'Merry', damage: 0.25, persuade: 0, sway: 0.7, spell: -10, regen: 0.4, caughtChance: 0.6, garble: 0.15, healerMult: 0.5 },
  hammered: { label: 'Hammered', damage: 0.3, persuade: -20, sway: 1.6, spell: -35, regen: 0, caughtChance: 0.9, garble: 0.5, healerMult: 0 },
  blackout: { label: 'BLACKOUT', damage: 0.3, persuade: -40, sway: 2.5, spell: -60, regen: 0, caughtChance: 1, garble: 1, healerMult: 0 },
};

/** BAC added by a drink after tolerance. */
export function drinkBac(base: number, liver: number, drinking: number): number {
  return base * Math.max(0.35, 1 - (liver + drinking) / 260);
}

/** BAC burned per second. */
export function bacDecay(liver: number, drinking: number): number {
  return 0.22 + liver * 0.004 + drinking * 0.002;
}

// ---------------------------------------------------------------- endings

export interface EndingInput {
  readonly rung: number;
  readonly dependency: number;
  readonly warnings: number;
  readonly flags: Readonly<Record<string, boolean | number>>;
  readonly standing: Readonly<Record<Faction, number>>;
}

export interface Ending {
  readonly title: string;
  readonly text: string;
}

export function endingFor(e: EndingInput): Ending {
  if (e.flags.ceoDeal === true) {
    return { title: 'THE COMPANY MAN', text: 'You shook Sir Reginald\'s hand instead of fighting him. The golden handcuffs fit perfectly. You never see the mökki again, but you do get a parking space.' };
  }
  if (e.dependency >= 70) {
    return { title: 'THE DISTILLERY', text: 'You bought the farm. Within a year it was a sahti brewery, and within two you were its best customer. The goats are worried about you.' };
  }
  if (e.flags.whistleblower === true) {
    return { title: 'THE WHISTLEBLOWER', text: 'The Auditor\'s report had your name in the acknowledgements. Workgrumble Ltd is now in administration. You buy the mökki at the liquidation auction.' };
  }
  if (e.rung >= 7) {
    return { title: 'THE ARCHITECT RETIRES', text: 'The board offers you CTO. You look at the offer, at the lake photo on your desk, and resign by email with the subject line "löyly". You buy the mökki outright.' };
  }
  if ((e.standing.kitchen ?? 0) >= 50) {
    return { title: 'ADOPTED BY THE KITCHEN', text: 'Brenda, Linda and Maureen chip in for your leaving card, your deposit and, it turns out, most of the farm. They visit every Juhannus with cake.' };
  }
  return { title: 'YOU BOUGHT THE FARM', text: 'You hand in your lanyard and buy a smallholding with goats and a lakeside sauna. The goats never raise tickets. The sauna never breaches an SLA.' };
}
