/**
 * The mökki is the farm the office sim was always saving up for. Every
 * weekend you can spend Rep on it, and every upgrade changes how the next
 * week goes.
 */

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly price: number;
  /** Needs this upgrade first. */
  readonly requires?: string;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'woodshed', name: 'Wood Shed', desc: 'A proper stack of birch logs. The sauna can be heated twice a weekend, and the grill gives double.', price: 180 },
  { id: 'savusauna', name: 'Savusauna (Smoke Sauna)', desc: 'The old way: heated for six hours, vented, then pure. +20 max Löyly permanently, and every sauna blesses you even without the lake.', price: 450, requires: 'woodshed' },
  { id: 'laituri', name: 'Longer Laituri and a Rowing Boat', desc: 'Extend the dock and buy a boat with a rod in it. Unlocks fishing at the end of the dock.', price: 220 },
  { id: 'potatoes', name: 'Potato and Dill Patch', desc: 'New potatoes every weekend (+sanity, and they weigh almost nothing).', price: 120 },
  { id: 'palju', name: 'Palju (Wood-Fired Hot Tub)', desc: 'Soak under the white night. Start every week with +15% max sanity.', price: 380, requires: 'woodshed' },
  { id: 'guestroom', name: 'Guest Room', desc: 'One of the office ladies visits at weekends, bringing cake and gossip. +Kitchen standing every weekend.', price: 300 },
  { id: 'dog', name: 'Musti the Lapphund', desc: 'A good dog from the neighbour\'s litter. Musti comes to work with you and bites anyone who raises their voice.', price: 400 },
  { id: 'runegarden', name: 'Rune Garden', desc: 'Standing stones for the tonttu. Runes cost half, and Mökki Magic training is cheaper.', price: 350 },
  { id: 'satellite', name: 'Satellite Dish', desc: 'Remote work, God help you. A WorkgrumbleOS terminal in the cottage.', price: 260 },
  { id: 'library', name: 'Reading Nook', desc: 'A shelf, a lamp, a chair. Every weekend you find a skill book on it.', price: 280 },
];

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export interface FishDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** Zone width multiplier: smaller is harder to land. */
  readonly difficulty: number;
  readonly weight: number;
}

export const FISH: readonly FishDef[] = [
  { id: 'fish-muikku', name: 'Muikku (Vendace)', desc: 'Fried in rye flour: +25 sanity.', difficulty: 1, weight: 0.6 },
  { id: 'fish-ahven', name: 'Ahven (Perch)', desc: '+35 sanity and +20 energy.', difficulty: 0.8, weight: 0.3 },
  { id: 'fish-hauki', name: 'Hauki (Pike)', desc: 'A monster. +60 sanity and +15 max sanity for the week.', difficulty: 0.55, weight: 0.08 },
  { id: 'fish-boot', name: 'An Old Boot', desc: 'Not food. Worth ₡5 at the scrapyard.', difficulty: 1.2, weight: 0.02 },
];

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'firstfix', name: 'Have You Tried...', desc: 'Close your first ticket at a terminal.' },
  { id: 'pacifist', name: 'Use Your Words', desc: 'Talk 10 people down without a fight.' },
  { id: 'ballmer', name: 'The Ballmer Peak', desc: 'Reach the Ballmer Peak.' },
  { id: 'blackout', name: 'What Happened at Pikkujoulu', desc: 'Black out at work.' },
  { id: 'sauna', name: 'Löylyä!', desc: 'Use a sauna.' },
  { id: 'avanto', name: 'Sauna, Then Lake', desc: 'Go straight from the sauna into the lake.' },
  { id: 'rune', name: 'Old Magic', desc: 'Learn a rune.' },
  { id: 'lock', name: 'Paperclip Engineer', desc: 'Pick a supply-closet lock.' },
  { id: 'promoted', name: 'Off the Helpdesk', desc: 'Choose a domain and a track.' },
  { id: 'architect', name: 'Senior Architect', desc: 'Reach the top of the ladder.' },
  { id: 'legendary', name: 'Legendary', desc: 'Own a legendary item.' },
  { id: 'evidence', name: 'The Phoenix File', desc: 'Hold three pieces of evidence.' },
  { id: 'auditor', name: 'Friend of the Auditor', desc: 'Resolve the audit without a fight.' },
  { id: 'fish', name: 'Hauki!', desc: 'Land a pike.' },
  { id: 'dog', name: 'Good Dog', desc: 'Bring Musti to work.' },
  { id: 'mokki', name: 'The Farm', desc: 'Buy five mökki upgrades.' },
  { id: 'sober', name: 'Dry January', desc: 'Resolve a boss with zero drinks on the floor.' },
  { id: 'ending', name: 'Clocked Out', desc: 'Reach an ending.' },
  { id: 'ultra', name: 'The King', desc: 'Drink a White Monster.' },
  { id: 'elite', name: 'Senior Stakeholder', desc: 'Resolve an elite.' },
  { id: 'parry', name: 'Per My Last Email', desc: 'Parry ten attacks.' },
  { id: 'handsfull', name: 'Hands Full', desc: 'Get staffed on something while already over capacity.' },
  { id: 'delivered', name: 'Resource-Efficient', desc: 'Deliver 5 staffed assignments.' },
  { id: 'boundaries', name: 'Boundaries', desc: 'Push back on an assignment, and win.' },
  { id: 'questfan', name: 'Go-To Person', desc: 'Finish 8 side quests.' },
];

export interface TipDef {
  readonly id: string;
  readonly text: string;
}

/** First-time tips: shown once per save, when the thing first happens. */
export const TIPS: Record<string, string> = {
  start: 'Blue squares on the map are computers: log on to work your ticket queue. Most angry people can be talked down with E before you reach for the stapler.',
  ticket: 'A ticket has joined your queue. Solve it at any computer before its SLA runs out, or resolve the person who raised it.',
  manager: 'Managers slow you with their aura and bury you in action items (+6 kg each). Accept their meeting (E) to get rid of them peacefully.',
  actionitem: 'Action items weigh 6 kg. An office lady will minute them for you, or use a sticky note.',
  drink: 'Drinking is a tightrope. The Ballmer Peak (green on the promille meter) is a real bonus; past it, managers smell it and the floor starts to move.',
  hangover: 'Hangovers cut your max sanity and speed. A sauna, coffee, the lake or the Avanto rune clear them.',
  levelup: 'You have learned enough to level up. Rest (T) somewhere quiet, or sleep at the mökki.',
  lowsanity: 'Sanity low! Eat something (Q), find an office lady, rest (T) or use a sauna.',
  encumbered: 'Over-encumbered: slow, no sprinting. Drop action items with an office lady, return empties, or store things at the mökki.',
  sauna: 'An office sauna! Throw löyly (E) to restore sanity and Löyly and sober up. The Saunatonttu here teaches runes.',
  boss: 'A Major Incident. Resolve the boss to unlock the lift - and the weekend.',
  mokki: 'The mökki. Sauna then lake for a week-long blessing, grill for food, sleep to level up, the stash to store things, and the upgrade board to build your farm. The car takes you back on Monday.',
  warning: 'HR warnings: three means a disciplinary hearing. Demotion, a fine, or talk your way out.',
  sneak: 'Sneaking: people who have not noticed you take sneak attacks. Watch the eye in the middle of the screen.',
  quest: 'Somebody with a "?" over their head has a job for you. Quests are in the Journal (at any computer) and on the compass.',
  loot: 'Loot has rarity: green Fine, blue Rare, orange Legendary. Equip it from your backpack (Tab); sell spares at Internal IT.',
  rest: 'Resting in the office costs an hour of SLA time, and somebody might find you napping.',
  caffeine: 'Caffeine is the second tightrope. Alert and WIRED (the green zone) make you faster; past it come the jitters and palpitations, and every big high ends in a crash. Tolerance builds up over the week.',
  elite: 'An elite (★): tougher, with a trick of its own, and much better loot.',
  staffed: 'You have been STAFFED: management hands you work whether you have room or not. Assignments are due Friday (P1s have a clock). Over capacity, you lose max sanity and energy regen. Push back when they call, at a computer (Journal), or delegate to a helper - but a missed deliverable costs Management standing.',
  block: 'Hold the right mouse button to block (frontal hits, costs energy). Block just as a hit lands to PARRY it and stagger them. Tap it to shove.',
};
