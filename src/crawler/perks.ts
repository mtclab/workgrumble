import type { Skill } from './rpg';

/**
 * Skyrim-shaped perk trees: every skill has its own perks, some with several
 * ranks, each rank gated by how good you are at the skill. A level-up gives
 * one point; where you spend it is who you become.
 */

export interface PerkRank {
  /** Skill level needed for this rank. */
  readonly skill: number;
  readonly desc: string;
}

export interface TreePerk {
  readonly id: string;
  readonly name: string;
  /** null = the General tree, no skill needed. */
  readonly tree: Skill | null;
  readonly ranks: readonly PerkRank[];
  /** Earned by doing, never bought with points: how. */
  readonly earned?: string;
}

const r = (skill: number, desc: string): PerkRank => ({ skill, desc });

export const TREE_PERKS: readonly TreePerk[] = [
  // General (the old flat perks, no skill needed)
  { id: 'patience', name: 'Infinite Patience', tree: null, ranks: [r(0, '+25 max sanity'), r(0, '+25 max sanity'), r(0, '+25 max sanity')] },
  { id: 'back', name: 'Strong Back', tree: null, ranks: [r(0, '+15 kg carry'), r(0, '+15 kg carry'), r(0, '+15 kg carry')] },
  { id: 'caffeine', name: 'Caffeine Tolerance', tree: null, ranks: [r(0, 'Crashes are half as long; can buffs last 50% longer.')] },
  { id: 'teflon', name: 'Teflon', tree: null, ranks: [r(0, 'Action items weigh half; meetings end twice as fast.'), r(0, 'Action items weigh a quarter.')] },
  { id: 'delegate', name: 'Delegation', tree: null, ranks: [r(0, 'Allies hit twice as hard; office ladies heal more often; once you are an architect, what you delegate earns full credit.')] },
  { id: 'timemgmt', name: 'Time Management', tree: null, ranks: [r(0, '+1 workload capacity'), r(0, '+1 workload capacity')] },
  { id: 'mentor', name: 'Mentor', tree: null, earned: 'Earned by mentoring (1, 3, 6 people)', ranks: [
    r(0, 'Mentor: teammates who follow you hit 25% harder and tire half as fast.'),
    r(0, 'Force Multiplier: +1 workload capacity. Your team picks up the slack.'),
    r(0, 'Servant Leader: team morale never drops below 40, and treats do twice as much.'),
  ] },

  // Hardware
  { id: 'percussive', name: 'Percussive Maintenance', tree: 'hardware', ranks: [r(15, '+20% melee damage'), r(40, '+40% melee damage'), r(70, '+60% melee damage')] },
  { id: 'powercycle', name: 'Power Cycle', tree: 'hardware', ranks: [r(30, 'Power attacks cost half the energy and hit 25% harder.')] },
  { id: 'cablemgmt', name: 'Cable Management', tree: 'hardware', ranks: [r(50, 'Melee hits stagger people for a moment.')] },
  { id: 'rackmount', name: 'Rack Mount', tree: 'hardware', ranks: [r(75, 'Heavy tools weigh nothing; +25 kg carry.')] },
  // Scripting
  { id: 'automation', name: 'Automation', tree: 'scripting', ranks: [r(15, '+20% ranged damage'), r(40, '+40% ranged damage'), r(70, '+60% ranged damage')] },
  { id: 'batchjob', name: 'Batch Job', tree: 'scripting', ranks: [r(30, '25% chance a shot uses no ammo.')] },
  { id: 'racecondition', name: 'Race Condition', tree: 'scripting', ranks: [r(50, 'Ranged attacks 20% faster; projectiles 30% faster.')] },
  { id: 'criticalpath', name: 'Critical Path', tree: 'scripting', ranks: [r(75, 'Ranged sneak attacks deal triple.')] },
  // Troubleshooting
  { id: 'rootcause', name: 'Root Cause', tree: 'troubleshooting', ranks: [r(15, 'Wrong fixes cost no sanity.')] },
  { id: 'knownissue', name: 'Known Issue', tree: 'troubleshooting', ranks: [r(30, 'Hunches (💡) twice as often.'), r(60, 'Hunches three times as often.')] },
  { id: 'runbook', name: 'Runbook', tree: 'troubleshooting', ranks: [r(50, '+50% Rep from terminal fixes.')] },
  { id: 'fivewhys', name: 'The Five Whys', tree: 'troubleshooting', ranks: [r(75, 'Talk-downs that walk someone through a fix are 20 points easier.')] },
  // Soft Skills
  { id: 'listening', name: 'Active Listening', tree: 'soft', ranks: [r(15, '+10 to every persuasion'), r(40, '+20 to every persuasion'), r(70, '+30 to every persuasion')] },
  { id: 'stakeholder', name: 'Stakeholder Management', tree: 'soft', ranks: [r(30, 'Manager auras are halved.')] },
  { id: 'charmoffensive', name: 'Charm Offensive', tree: 'soft', ranks: [r(50, 'Internal IT prices -15%.')] },
  { id: 'presence', name: 'Executive Presence', tree: 'soft', ranks: [r(75, 'A failed talk-down no longer enrages anyone.')] },
  { id: 'boundaries', name: 'Healthy Boundaries', tree: 'soft', ranks: [r(30, '+1 workload capacity, and pushing back on an assignment is 20 points easier.')] },
  // Sisu
  { id: 'thickskin', name: 'Thick Skin', tree: 'sisu', ranks: [r(15, '+6% armour'), r(40, '+12% armour'), r(70, '+18% armour')] },
  { id: 'secondwind', name: 'Second Wind', tree: 'sisu', ranks: [r(30, 'Below a quarter sanity, it comes back three times as fast.')] },
  { id: 'ironwill', name: 'Iron Will', tree: 'sisu', ranks: [r(50, 'You never stumble, and meetings, freezes and hold-ups keep you half as long.')] },
  { id: 'unbreakable', name: 'Unbreakable', tree: 'sisu', ranks: [r(75, 'Once a floor, a burnout leaves you on 1 sanity instead.')] },
  // Stealth
  { id: 'greyhoodie', name: 'Grey Hoodie', tree: 'stealth', ranks: [r(15, '+8% stealth'), r(40, '+16% stealth'), r(70, '+24% stealth')] },
  { id: 'surprise', name: 'Surprise Stand-up', tree: 'stealth', ranks: [r(30, 'Sneak attacks hit 50% harder.')] },
  { id: 'silentkeys', name: 'Silent Keyboard', tree: 'stealth', ranks: [r(50, 'Sneaking is no slower than walking.')] },
  { id: 'ghost', name: 'Ghost Mode', tree: 'stealth', ranks: [r(75, 'Stand still while sneaking for 2 seconds to vanish.')] },
  // Security
  { id: 'savant', name: 'Paperclip Savant', tree: 'security', ranks: [r(15, 'Half of failed pins keep the paperclip.')] },
  { id: 'masterkey', name: 'Master Key', tree: 'security', ranks: [r(40, 'The sweet spot on every lock is 50% wider.')] },
  { id: 'socialeng', name: 'Social Engineering', tree: 'security', ranks: [r(60, 'While sneaking, nobody ever witnesses a theft.')] },
  // Drinking
  { id: 'ironliver', name: 'Iron Liver', tree: 'drinking', ranks: [r(15, '-10% BAC from drinks'), r(40, '-20% BAC from drinks'), r(70, '-30% BAC from drinks')] },
  { id: 'functional', name: 'Functional', tree: 'drinking', ranks: [r(30, 'Merry costs you no aim and no swaying.')] },
  { id: 'hardened', name: 'Hardened Drinker', tree: 'drinking', ranks: [r(50, 'Hangovers and withdrawal are halved.')] },
  { id: 'bartab', name: 'Bar Tab', tree: 'drinking', ranks: [r(75, 'Drinks heal twice as much.')] },
  // Mökki magic
  { id: 'loylywell', name: 'Löyly Well', tree: 'runecraft', ranks: [r(15, '+15 max Löyly'), r(40, '+30 max Löyly'), r(70, '+45 max Löyly')] },
  { id: 'steamlord', name: 'Steam Lord', tree: 'runecraft', ranks: [r(30, 'Runes 25% more powerful.')] },
  { id: 'runeeconomy', name: 'Rune Economy', tree: 'runecraft', ranks: [r(50, 'Runes cost 20% less Löyly.')] },
  { id: 'kalevala', name: 'Kalevala', tree: 'runecraft', ranks: [r(75, '+15% cast chance, and failed casts cost nothing.')] },
  // Athletics
  { id: 'cardio', name: 'Cardio', tree: 'athletics', ranks: [r(15, '+5% move speed'), r(40, '+10% move speed'), r(70, '+15% move speed')] },
  { id: 'stairsguy', name: 'The Stairs Guy', tree: 'athletics', ranks: [r(30, 'Sprinting costs 40% less energy.')] },
  { id: 'parkour', name: 'Parkour', tree: 'athletics', ranks: [r(50, 'Jump higher, +10% dodge.')] },
  { id: 'marathon', name: 'Marathon', tree: 'athletics', ranks: [r(75, 'Energy comes back 50% faster.')] },
];

export function treePerk(id: string): TreePerk | undefined {
  return TREE_PERKS.find((p) => p.id === id);
}

/** Can a character with this skill level and current rank take the next rank? */
export function canTake(p: TreePerk, rank: number, skillLevel: number): boolean {
  const next = p.ranks[rank];
  if (next === undefined || p.earned !== undefined) return false;
  return p.tree === null || skillLevel >= next.skill;
}
