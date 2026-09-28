/**
 * Mökki magic: the old sauna runes, powered by Löyly (the steam off the
 * kiuas). Learned from the Saunatonttu, or from rune stones found in supply
 * closets. Casting can fail, as it could in Morrowind; a failed cast still
 * costs half the steam.
 */

export type SpellId =
  | 'steam'
  | 'vihta'
  | 'sisu'
  | 'avanto'
  | 'song'
  | 'silence'
  | 'mark'
  | 'recall'
  | 'tonttu'
  | 'salmiakki';

export interface SpellDef {
  readonly id: SpellId;
  readonly name: string;
  readonly english: string;
  readonly desc: string;
  readonly cost: number;
  /** Rep the Saunatonttu charges to teach it. */
  readonly price: number;
  /** Mökki Magic skill needed before the tonttu will teach it. */
  readonly minSkill: number;
}

export const SPELLS: readonly SpellDef[] = [
  { id: 'steam', name: 'Löylyhenki', english: 'Spirit of the Steam', desc: 'A burst of scalding löyly around you: damage and a short stun.', cost: 18, price: 60, minSkill: 0 },
  { id: 'vihta', name: 'Vihtaisku', english: 'Birch Whisk', desc: 'A lashing cone of birch twigs. Heals you for a third of the damage dealt.', cost: 12, price: 60, minSkill: 0 },
  { id: 'salmiakki', name: 'Salmiakkikirous', english: 'Salmiakki Curse', desc: 'A bolt of salty liquorice. Poisons the target for 6 seconds.', cost: 14, price: 90, minSkill: 10 },
  { id: 'sisu', name: 'Sisu', english: 'Grim Resolve', desc: '8 seconds: take half damage and you cannot be dropped below 1 sanity.', cost: 25, price: 140, minSkill: 15 },
  { id: 'avanto', name: 'Avanto', english: 'The Ice Hole', desc: 'A freezing nova: slows everyone near you. You plunge in too: sobers you up and cures a hangover.', cost: 28, price: 140, minSkill: 15 },
  { id: 'silence', name: 'Hiljaisuus', english: 'Comfortable Silence', desc: '10 seconds unseen. Nobody talks to you. Very Finnish.', cost: 30, price: 180, minSkill: 20 },
  { id: 'mark', name: 'Mökkimerkki', english: 'Mark', desc: 'Remember where you are standing.', cost: 10, price: 100, minSkill: 20 },
  { id: 'recall', name: 'Kotiinpaluu', english: 'Recall', desc: 'Return to your Mark (or the lift) in a puff of steam.', cost: 25, price: 120, minSkill: 20 },
  { id: 'song', name: 'Väinämöisen laulu', english: 'Song of Väinämöinen', desc: 'Sing the old song: people near you forget their problem and wander off. No Rep, but the Staff like it.', cost: 40, price: 260, minSkill: 30 },
  { id: 'tonttu', name: 'Tontun kutsu', english: 'Summon Saunatonttu', desc: 'The sauna elf fights beside you for 25 seconds, throwing steam.', cost: 45, price: 320, minSkill: 35 },
];

export function spellById(id: string): SpellDef | undefined {
  return SPELLS.find((s) => s.id === id);
}

/** Morrowind-shaped cast chance, 0..1. */
export function castChance(cost: number, runecraft: number, tech: number, liver: number, bandBonus: number): number {
  const c = 35 + runecraft * 1.6 + tech * 0.25 + liver * 0.15 - cost * 0.6 + bandBonus;
  return Math.max(0.05, Math.min(1, c / 100));
}
