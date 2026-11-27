import { BOOKS } from './books';
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
  readonly buff?: 'makkara' | 'hauki' | 'ultra' | 'wings' | 'gymbro' | 'burn';
  /** Seconds a timed buff lasts. */
  readonly buffTime?: number;
  /** Caffeine in milligrams. */
  readonly mg?: number;
  /** A skill book: reading it raises this skill by one. */
  readonly book?: string;
  readonly clearsActionItem?: boolean;
  /** Blood alcohol it adds before tolerance. */
  readonly bac?: number;
  /** Löyly it restores. */
  readonly loyly?: number;
  /** A rune stone: using it teaches this spell. */
  readonly rune?: string;
  /** Internal IT will not requisition this for you. */
  readonly unsold?: boolean;
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

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'coffee', slot: 'consumable', name: 'Filter Coffee', desc: '90 mg caffeine, +40 energy, and it takes the edge off (-6 BAC).', price: 12, weight: 0.3, energy: 40, mg: 90, minFloor: 0 },
  { id: 'espresso', slot: 'consumable', name: 'Espresso Shot', desc: '65 mg caffeine, +20 energy. Small, sharp, Italian.', price: 10, weight: 0.1, energy: 20, mg: 65, minFloor: 0 },
  { id: 'battery', slot: 'consumable', name: 'Battery Energy Drink', desc: '160 mg caffeine, +70 energy. Finnish. Tastes like a charged 9-volt.', price: 20, weight: 0.35, energy: 70, mg: 160, minFloor: 0 },
  { id: 'batteryzero', slot: 'consumable', name: 'Battery No Calories', desc: '160 mg caffeine, +50 energy, and a clear conscience.', price: 22, weight: 0.35, energy: 50, mg: 160, minFloor: 0 },
  { id: 'energy', slot: 'consumable', name: 'Grumble Energy (Tropical)', desc: '200 mg caffeine, +100 energy. The company drink. It is the colour of a warning.', price: 24, weight: 0.35, energy: 100, mg: 200, minFloor: 0 },
  { id: 'kraken', slot: 'consumable', name: 'Kraken Mega Can (1 litre)', desc: '320 mg caffeine, +100 energy, +20 sanity. Straight to Wired, one step from the shakes.', price: 38, weight: 1, energy: 100, heal: 20, mg: 320, minFloor: 1 },
  { id: 'euroshopper', slot: 'consumable', name: 'Euroshopper Energy', desc: '80 mg caffeine, +35 energy, -5 sanity. Tastes like the tin it came in. Cheapest can in the building.', price: 6, weight: 0.35, energy: 35, heal: -5, mg: 80, minFloor: 0 },
  { id: 'redbull', slot: 'consumable', name: 'Red Bull', desc: '80 mg caffeine, +40 energy. It gives you wings: you jump much higher for a minute.', price: 16, weight: 0.25, energy: 40, mg: 80, buff: 'wings', buffTime: 60, minFloor: 0 },
  { id: 'monster', slot: 'consumable', name: 'Monster Energy (Green)', desc: '160 mg caffeine, +80 energy. Unleash the beast. The beast is mostly sugar.', price: 22, weight: 0.5, energy: 80, mg: 160, minFloor: 0 },
  { id: 'pipeline', slot: 'consumable', name: 'Monster Pipeline Punch', desc: '160 mg caffeine, +60 energy, +25 sanity. Pink, tropical, surprisingly kind.', price: 26, weight: 0.5, energy: 60, heal: 25, mg: 160, minFloor: 1 },
  { id: 'nocco', slot: 'consumable', name: 'NOCCO BCAA', desc: '180 mg caffeine, +50 energy. Gym bro in a can: +20% melee damage for 90 seconds.', price: 24, weight: 0.33, energy: 50, mg: 180, buff: 'gymbro', buffTime: 90, minFloor: 1 },
  { id: 'celsius', slot: 'consumable', name: 'Celsius', desc: '200 mg caffeine, +60 energy. "Burns calories": energy comes back twice as fast for two minutes.', price: 24, weight: 0.35, energy: 60, mg: 200, buff: 'burn', buffTime: 120, minFloor: 1 },
  { id: 'whitemonster', slot: 'consumable', name: 'WHITE MONSTER (Ultra)', desc: 'The king of energy drinks. Zero sugar, infinite power. 45 seconds ASCENDED: +40% damage, +30% speed, faster hands, free sprinting, sanity regen, immune to meetings and to the jitters. Never sold. Rarely found. Worshipped.', price: 0, weight: 0.5, energy: 100, heal: 30, mg: 150, buff: 'ultra', buffTime: 45, unsold: true, minFloor: 0 },
  { id: 'vodkabattery', slot: 'consumable', name: 'Vodka Battery', desc: '120 mg caffeine and BAC +14. Wired and drunk: managers struggle to smell it, but the crash is legendary.', price: 0, weight: 0.4, energy: 60, mg: 120, bac: 14, unsold: true, minFloor: 0 },
  { id: 'biscuits', slot: 'consumable', name: 'Chocolate Digestives', desc: '+30 sanity. The good biscuits, from the locked cupboard.', price: 12, weight: 0.3, heal: 30, minFloor: 0 },
  { id: 'cake', slot: 'consumable', name: 'Leftover Birthday Cake', desc: '+70 sanity. Nobody knows whose birthday it was. Give it to your team (E on a teammate): everyone nearby gets a slice.', price: 45, weight: 0.5, heal: 70, minFloor: 0 },
  { id: 'fazer', slot: 'consumable', name: 'Fazer Blue (200 g)', desc: '+20 sanity. The correct chocolate. Teammates love it.', price: 10, weight: 0.2, heal: 20, minFloor: 0 },
  { id: 'korvapuusti', slot: 'consumable', name: 'Korvapuusti', desc: '+35 sanity. A cardamom cinnamon bun, still warm. Give one to a teammate and the rest of the team gets a bite.', price: 16, weight: 0.2, heal: 35, minFloor: 0 },
  { id: 'donuts', slot: 'consumable', name: 'Box of Donuts', desc: '+25 sanity. A box for the team: give it to a teammate and everyone nearby cheers up.', price: 40, weight: 0.8, heal: 25, minFloor: 0 },
  { id: 'salmiakkibag', slot: 'consumable', name: 'Bag of Salmiakki', desc: '+10 sanity. Salty liquorice. Finnish teammates adore it. Everyone else will be polite about it.', price: 8, weight: 0.2, heal: 10, minFloor: 0 },
  { id: 'postit', slot: 'consumable', name: 'Sticky Note', desc: 'Write the action item down and it stops weighing on you. Clears one action item.', price: 20, weight: 0.05, clearsActionItem: true, minFloor: 0 },
  { id: 'paperclip', slot: 'consumable', name: 'Paperclip', desc: 'A lockpick, if you have the Security for it. Breaks on a failed pin.', price: 6, weight: 0.01, minFloor: 0 },
  { id: 'potatoes', slot: 'consumable', name: 'New Potatoes with Dill', desc: '+30 sanity. From your own patch at the mökki.', price: 0, weight: 0.2, heal: 30, unsold: true, minFloor: 0 },
  { id: 'fish-muikku', slot: 'consumable', name: 'Fried Muikku', desc: '+25 sanity. Fried in rye flour, eaten with fingers.', price: 0, weight: 0.2, heal: 25, unsold: true, minFloor: 0 },
  { id: 'fish-ahven', slot: 'consumable', name: 'Grilled Ahven', desc: '+35 sanity and +20 energy.', price: 0, weight: 0.3, heal: 35, energy: 20, unsold: true, minFloor: 0 },
  { id: 'fish-hauki', slot: 'consumable', name: 'Smoked Hauki', desc: '+60 sanity and +15 max sanity for the rest of the week.', price: 0, weight: 0.8, heal: 60, buff: 'hauki', unsold: true, minFloor: 0 },
  { id: 'fish-boot', slot: 'consumable', name: 'An Old Boot', desc: 'Not food. Sell it to the scrapyard (use it for ₡5).', price: 0, weight: 0.8, unsold: true, minFloor: 0 },
  { id: 'makkara', slot: 'consumable', name: 'Grilled Makkara', desc: '+40 sanity and +20 max sanity until the end of the floor. Mustard is not optional.', price: 30, weight: 0.3, heal: 40, buff: 'makkara', unsold: true, minFloor: 0 },
  { id: 'beer', slot: 'consumable', name: 'Keskari (Lager)', desc: '+22 sanity, BAC +12. The Friday classic.', price: 0, weight: 0.5, heal: 22, bac: 12, unsold: true, minFloor: 0 },
  { id: 'lonkero', slot: 'consumable', name: 'Lonkero (Long Drink)', desc: '+16 sanity, +25 energy, BAC +10. Grapefruit and gin, as the Olympics intended.', price: 0, weight: 0.4, heal: 16, energy: 25, bac: 10, unsold: true, minFloor: 0 },
  { id: 'kossu', slot: 'consumable', name: 'Koskenkorva Shot', desc: '+10 sanity, BAC +22. Clear, honest, dangerous.', price: 0, weight: 0.1, heal: 10, bac: 22, unsold: true, minFloor: 0 },
  { id: 'salmari', slot: 'consumable', name: 'Salmiakki Koskenkorva', desc: '+45 Löyly, BAC +18. Black, sweet, magical.', price: 0, weight: 0.2, loyly: 45, bac: 18, unsold: true, minFloor: 0 },
  { id: 'sahti', slot: 'consumable', name: 'Farmhouse Sahti', desc: '+50 sanity, BAC +26. Brewed through juniper by someone\'s grandmother.', price: 0, weight: 0.8, heal: 50, bac: 26, unsold: true, minFloor: 0 },
  { id: 'rune-salmiakki', slot: 'consumable', name: 'Rune Stone: Salmiakkikirous', desc: 'Read it to learn the Salmiakki Curse.', price: 0, weight: 1, rune: 'salmiakki', unsold: true, minFloor: 0 },
  { id: 'rune-silence', slot: 'consumable', name: 'Rune Stone: Hiljaisuus', desc: 'Read it to learn Comfortable Silence.', price: 0, weight: 1, rune: 'silence', unsold: true, minFloor: 0 },
  { id: 'rune-sisu', slot: 'consumable', name: 'Rune Stone: Sisu', desc: 'Read it to learn Sisu.', price: 0, weight: 1, rune: 'sisu', unsold: true, minFloor: 0 },
  { id: 'rune-avanto', slot: 'consumable', name: 'Rune Stone: Avanto', desc: 'Read it to learn the Ice Hole.', price: 0, weight: 1, rune: 'avanto', unsold: true, minFloor: 0 },
];

for (const b of BOOKS) {
  CONSUMABLES.push({ id: b.id, slot: 'consumable', name: `Book: ${b.title}`, desc: `${b.blurb} Reading it raises a skill by one.`, price: 0, weight: 0.5, book: b.skill, unsold: true, minFloor: 0 });
}

export const DRINKS = CONSUMABLES.filter((c) => c.bac !== undefined).map((c) => c.id);
export const BOOK_IDS = CONSUMABLES.filter((c) => c.book !== undefined).map((c) => c.id);
export const RUNES = CONSUMABLES.filter((c) => c.rune !== undefined).map((c) => c.id);
/** Cans you can find lying about (not the king: he has his own odds). */
export const ENERGY_DRINKS = ['euroshopper', 'redbull', 'monster', 'pipeline', 'nocco', 'celsius', 'battery', 'batteryzero', 'energy'];

/** Food in your stomach slows how fast a drink reaches your blood. */
export const LINING_FOODS = ['biscuits', 'cake', 'korvapuusti', 'donuts', 'makkara', 'potatoes', 'fish-muikku', 'fish-ahven', 'fish-hauki'];

export const BUFF_INFO: Record<string, { icon: string; name: string }> = {
  lined: { icon: '🥔', name: 'Lined stomach (drinks hit slower)' },
  ultra: { icon: '⚪', name: 'ASCENDED (White Monster)' },
  wings: { icon: '🪽', name: 'Wings' },
  gymbro: { icon: '💪', name: 'Gym Bro' },
  burn: { icon: '🔥', name: 'Burning calories' },
};

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


