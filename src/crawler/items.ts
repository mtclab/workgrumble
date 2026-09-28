/** Everything Internal IT will issue you, if the budget code clears. */

export type AmmoKind = 'labels' | 'air' | 'ducks' | 'toner';
export type WeaponKind = 'melee' | 'projectile' | 'cone' | 'nova' | 'lob';
export type Slot = 'weapon' | 'head' | 'body' | 'feet' | 'trinket' | 'consumable' | 'ammo';

export interface WeaponDef {
  readonly id: string;
  readonly slot: 'weapon';
  readonly name: string;
  readonly desc: string;
  readonly price: number;
  readonly weight: number;
  readonly kind: WeaponKind;
  readonly damage: number;
  readonly cooldown: number;
  readonly range: number;
  readonly arc?: number;
  readonly ammo?: AmmoKind;
  readonly speed?: number;
  readonly splash?: number;
  readonly knockback?: number;
  readonly energyCost?: number;
  readonly color: number;
  readonly minFloor: number;
}

export interface GearDef {
  readonly id: string;
  readonly slot: 'head' | 'body' | 'feet' | 'trinket';
  readonly name: string;
  readonly desc: string;
  readonly price: number;
  readonly weight: number;
  readonly armor?: number;
  readonly auraResist?: number;
  readonly speed?: number;
  readonly stealth?: number;
  readonly maxSanity?: number;
  readonly healMult?: number;
  readonly noRoot?: boolean;
  readonly bossResist?: number;
  readonly duck?: boolean;
  readonly energyRegen?: number;
  readonly minFloor: number;
}

export interface ConsumableDef {
  readonly id: string;
  readonly slot: 'consumable';
  readonly name: string;
  readonly desc: string;
  readonly price: number;
  readonly weight: number;
  readonly heal?: number;
  readonly energy?: number;
  readonly buff?: 'coffee' | 'wired' | 'beer';
  readonly clearsActionItem?: boolean;
  readonly minFloor: number;
}

export interface AmmoDef {
  readonly id: string;
  readonly slot: 'ammo';
  readonly name: string;
  readonly desc: string;
  readonly price: number;
  readonly weight: number;
  readonly ammo: AmmoKind;
  readonly amount: number;
  readonly minFloor: number;
}

export type ItemDef = WeaponDef | GearDef | ConsumableDef | AmmoDef;

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'stapler', slot: 'weapon', name: 'Swingline Stapler', desc: 'Red. Heavy. Yours. Staples a fix straight onto the problem.', price: 0, weight: 1, kind: 'melee', damage: 16, cooldown: 0.38, range: 2.3, arc: 0.9, color: 0xd0342c, minFloor: 0 },
  { id: 'keyboard', slot: 'weapon', name: 'Model M Keyboard', desc: 'Buckling springs. Wide swing, big knockback. Keys fly off, you have spares.', price: 60, weight: 3, kind: 'melee', damage: 28, cooldown: 0.6, range: 2.7, arc: 1.4, knockback: 6, color: 0xd6d0bd, minFloor: 0 },
  { id: 'labelmaker', slot: 'weapon', name: 'Label Maker', desc: 'Fires labels at 30 m/s. "NOT A BUG". "USER ERROR". "PC LOAD LETTER".', price: 110, weight: 1.5, kind: 'projectile', damage: 12, cooldown: 0.17, range: 40, ammo: 'labels', speed: 30, color: 0xfff27a, minFloor: 0 },
  { id: 'cat6', slot: 'weapon', name: 'Cat6 Whip (15m, unterminated)', desc: 'Reaches the user at the back of the queue. Hits everything in the arc.', price: 150, weight: 2, kind: 'melee', damage: 22, cooldown: 0.5, range: 4.2, arc: 1.2, color: 0x3aa0ff, minFloor: 1 },
  { id: 'aircan', slot: 'weapon', name: 'Compressed Air Duster', desc: 'Blows the dust, and the users, right out of the room. Cone, heavy knockback.', price: 180, weight: 1.2, kind: 'cone', damage: 7, cooldown: 0.08, range: 6, arc: 0.5, ammo: 'air', knockback: 5, color: 0xdff6ff, minFloor: 1 },
  { id: 'duck', slot: 'weapon', name: 'Rubber Duck Launcher', desc: 'Lobbed debugging. The duck listens, then explodes. Splash damage.', price: 300, weight: 4, kind: 'lob', damage: 60, cooldown: 0.85, range: 30, ammo: 'ducks', speed: 16, splash: 3.8, color: 0xffd400, minFloor: 1 },
  { id: 'toner', slot: 'weapon', name: 'Toner Cannon', desc: 'Salvaged from a Hercules 400. Rapid fire, it gets everywhere.', price: 480, weight: 6, kind: 'projectile', damage: 17, cooldown: 0.09, range: 40, ammo: 'toner', speed: 36, color: 0x222222, minFloor: 2 },
  { id: 'powercycle', slot: 'weapon', name: 'The Power Cycle', desc: 'Have you tried turning it off and on again? Everything nearby is resolved. Costs energy.', price: 520, weight: 3, kind: 'nova', damage: 75, cooldown: 2.8, range: 8, energyCost: 45, color: 0x7dff9a, minFloor: 2 },
  { id: 'sudo', slot: 'weapon', name: 'sudo Hammer', desc: 'Runs as root. Enormous. Slow. Nobody argues with it.', price: 700, weight: 9, kind: 'melee', damage: 95, cooldown: 1.05, range: 3, arc: 1.3, splash: 2.2, knockback: 9, color: 0xb04bff, minFloor: 3 },
];

export const GEAR: readonly GearDef[] = [
  { id: 'hoodie', slot: 'body', name: 'Company Hoodie', desc: 'Hood up = do not disturb. Users notice you from 30% less far away.', price: 80, weight: 2, stealth: 0.3, armor: 0.05, minFloor: 0 },
  { id: 'cardigan', slot: 'body', name: 'Kevlar Cardigan', desc: 'Knitted by Brenda. Stops 25% of everything.', price: 240, weight: 4, armor: 0.25, minFloor: 1 },
  { id: 'oooRobe', slot: 'body', name: 'Out-of-Office Robe', desc: 'Auto-reply woven into the fabric. 20% armour, immune to meeting invites.', price: 520, weight: 3, armor: 0.2, noRoot: true, minFloor: 2 },
  { id: 'headphones', slot: 'head', name: 'Noise-Cancelling Headphones', desc: 'Halves manager encumbrance auras. You genuinely did not hear them.', price: 140, weight: 1, auraResist: 0.5, armor: 0.05, minFloor: 0 },
  { id: 'hardhat', slot: 'head', name: 'Cable-Pull Hard Hat', desc: 'For under-floor work. 15% armour.', price: 160, weight: 2, armor: 0.15, minFloor: 1 },
  { id: 'crown', slot: 'head', name: 'Domain Admin Crown', desc: 'Bosses deal 30% less. It is a paper crown from a cracker.', price: 600, weight: 0.5, bossResist: 0.3, armor: 0.1, minFloor: 3 },
  { id: 'trainers', slot: 'feet', name: 'Standing-Desk Trainers', desc: '+15% move speed.', price: 110, weight: 1.5, speed: 0.15, minFloor: 0 },
  { id: 'crocs', slot: 'feet', name: 'Server Room Crocs', desc: '+25% speed and faster energy regen. Sport mode engaged.', price: 320, weight: 1, speed: 0.25, energyRegen: 0.5, minFloor: 2 },
  { id: 'mug', slot: 'trinket', name: 'Mug: World\'s Okayest Sysadmin', desc: 'All healing +50%. The tea tastes better in it.', price: 120, weight: 0.5, healMult: 0.5, minFloor: 0 },
  { id: 'duckcharm', slot: 'trinket', name: 'Rubber Duck (Desk Edition)', desc: 'Explain the ticket to the duck: terminals show you the cause for free.', price: 150, weight: 0.3, duck: true, minFloor: 0 },
  { id: 'yubikey', slot: 'trinket', name: 'YubiKey Amulet', desc: '+25 max sanity. Something you have AND something you are.', price: 260, weight: 0.1, maxSanity: 25, minFloor: 1 },
  { id: 'lanyard', slot: 'trinket', name: 'Lanyard of Authority', desc: 'Managers and bosses deal 25% less and auras are halved.', price: 380, weight: 0.2, bossResist: 0.25, auraResist: 0.5, minFloor: 2 },
];

export const CONSUMABLES: readonly ConsumableDef[] = [
  { id: 'coffee', slot: 'consumable', name: 'Filter Coffee', desc: '+50 energy and a 25 second pep in your step.', price: 15, weight: 0.3, energy: 50, buff: 'coffee', minFloor: 0 },
  { id: 'energy', slot: 'consumable', name: 'Grumble Energy (Tropical)', desc: 'WIRED: faster everything for 20s. Then the crash.', price: 25, weight: 0.3, energy: 100, buff: 'wired', minFloor: 0 },
  { id: 'biscuits', slot: 'consumable', name: 'Chocolate Digestives', desc: '+30 sanity. The good biscuits, from the locked cupboard.', price: 12, weight: 0.3, heal: 30, minFloor: 0 },
  { id: 'cake', slot: 'consumable', name: 'Leftover Birthday Cake', desc: '+70 sanity. Nobody knows whose birthday it was.', price: 45, weight: 0.5, heal: 70, minFloor: 0 },
  { id: 'postit', slot: 'consumable', name: 'Sticky Note', desc: 'Write the action item down and it stops weighing on you. Clears one action item.', price: 20, weight: 0.05, clearsActionItem: true, minFloor: 0 },
  { id: 'beer', slot: 'consumable', name: 'Friday Beer', desc: '+100 sanity, but the room will not stay still. Not during probation (floor 3+).', price: 40, weight: 0.5, heal: 100, buff: 'beer', minFloor: 2 },
];

export const AMMO: readonly AmmoDef[] = [
  { id: 'ammo-labels', slot: 'ammo', name: 'Label Tape x40', desc: 'For the Label Maker.', price: 18, weight: 0.2, ammo: 'labels', amount: 40, minFloor: 0 },
  { id: 'ammo-air', slot: 'ammo', name: 'Air Duster Can x80', desc: 'For the Air Duster.', price: 22, weight: 0.4, ammo: 'air', amount: 80, minFloor: 1 },
  { id: 'ammo-ducks', slot: 'ammo', name: 'Rubber Ducks x6', desc: 'For the Duck Launcher.', price: 40, weight: 0.6, ammo: 'ducks', amount: 6, minFloor: 1 },
  { id: 'ammo-toner', slot: 'ammo', name: 'Toner Cartridge x60', desc: 'For the Toner Cannon.', price: 35, weight: 0.8, ammo: 'toner', amount: 60, minFloor: 2 },
];

export const ALL_ITEMS: readonly ItemDef[] = [...WEAPONS, ...GEAR, ...CONSUMABLES, ...AMMO];

export function itemById(id: string): ItemDef | undefined {
  return ALL_ITEMS.find((i) => i.id === id);
}

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? (WEAPONS[0] as WeaponDef);
}

export interface PerkDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly max: number;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'patience', name: 'Infinite Patience', desc: '+25 max sanity per rank.', max: 3 },
  { id: 'typing', name: 'Touch Typing', desc: '+15% attack speed per rank.', max: 3 },
  { id: 'back', name: 'Strong Back (Server Lifting)', desc: '+15 kg carry capacity per rank.', max: 3 },
  { id: 'soft', name: 'Soft Skills', desc: '+30% healing received and +25% Rep from tickets per rank.', max: 2 },
  { id: 'cli', name: 'Command Line Fu', desc: 'Terminals strike one wrong fix off every ticket.', max: 1 },
  { id: 'caffeine', name: 'Caffeine Tolerance', desc: 'No crash after energy drinks. Coffee lasts twice as long.', max: 1 },
  { id: 'stealth', name: 'Invisible at Desk', desc: 'Users notice you 20% later per rank.', max: 2 },
  { id: 'teflon', name: 'Teflon', desc: 'Action items weigh half and meetings end twice as fast per rank.', max: 2 },
  { id: 'delegate', name: 'Delegation', desc: 'Allies hit twice as hard; office ladies heal more often.', max: 1 },
];

export const TITLES = [
  'Helpdesk Drone',
  'IT Support Analyst',
  'Senior Support Analyst',
  'Desktop Engineer',
  'Systems Administrator',
  'Senior Sysadmin',
  'DevOps Engineer',
  'Site Reliability Engineer',
  'Cloud Architect',
  'Head of IT',
  'CTO (Acting)',
];

export function titleFor(level: number): string {
  return TITLES[Math.min(level - 1, TITLES.length - 1)] ?? 'CTO (Acting)';
}

export function xpForLevel(level: number): number {
  return Math.floor(80 * Math.pow(level, 1.45));
}
