/**
 * Your team: the IT crowd who follow you into the floor. Pure rules only -
 * morale, what treats and cans do to people, who counts as senior enough to
 * mentor and who is high enough up the food chain to delegate.
 */

/** Delegation is for architects: Associate Architect (rung 9) and up. */
export const DELEGATE_RUNG = 9;

export function canDelegate(rung: number): boolean {
  return rung >= DELEGATE_RUNG;
}

/**
 * Senior in your team: Senior Helpdesk Analyst (3), then Senior, Lead,
 * Principal and the architects (6+). At 4 and 5 you are the junior again,
 * in a new role.
 */
export function isSenior(rung: number): boolean {
  return rung === 3 || rung >= 6;
}

/** What the building remembers about one colleague, by name. */
export interface TeamMember {
  morale: number;
  /** Times you have mentored them. Once is enough to make a protégé. */
  mentored: number;
}

export const MORALE_START = 55;
/** Below this, a teammate following you goes on a break. */
export const MORALE_QUIT = 15;
/** Below this, they will not come with you until somebody feeds them. */
export const MORALE_REFUSE = 25;

export function moraleLabel(m: number): string {
  if (m >= 85) return 'On fire';
  if (m >= 65) return 'Keen';
  if (m >= 45) return 'Fine';
  if (m >= 25) return 'Flagging';
  return 'Running on empty';
}

/** How hard and how fast a teammate works. `boost` is an energy drink's power (1: none). */
export function teamPower(morale: number, boost: number, protege: boolean): { damage: number; haste: number } {
  const m = Math.max(0, Math.min(100, morale));
  const damage = (0.6 + m * 0.008) * boost * (protege ? 1.3 : 1);
  // Cooldown multiplier: under 1 is faster.
  const haste = (1.2 - m * 0.004) / Math.sqrt(boost);
  return { damage, haste };
}

export interface Treat {
  readonly morale: number;
  /** Everyone else in the team nearby gets this much too (a box of something). */
  readonly share?: number;
  /** Only Finns like it; everyone else takes this instead. */
  readonly finnOnly?: number;
  readonly line: string;
  readonly otherLine?: string;
}

/** Sweets (and coffee): morale. */
export const TREATS: Record<string, Treat> = {
  coffee: { morale: 6, line: 'Coffee! You remembered. Oat milk?' },
  biscuits: { morale: 12, line: 'The GOOD biscuits? From the locked cupboard? I would die for you.' },
  fazer: { morale: 15, line: 'Fazer Blue. The correct chocolate. You understand me.' },
  korvapuusti: { morale: 20, share: 10, line: 'Korvapuusti. Still warm. There is enough for everyone!' },
  donuts: { morale: 12, share: 20, line: 'A whole box? For the team? ...Who are you and what have you done with my senior?' },
  cake: { morale: 25, share: 15, line: 'Cake! Everybody, CAKE!' },
  salmiakkibag: { morale: 25, finnOnly: -6, line: 'Salmiakki! Proper salmiakki! Now we are talking.', otherLine: 'Why does it taste of... cleaning products? Thanks. I think.' },
};

export interface CanBoost {
  /** Damage multiplier while it lasts (fire rate improves with its square root). */
  readonly power: number;
  readonly seconds: number;
  readonly morale: number;
  /** Morale lost when it wears off. */
  readonly crash: number;
  readonly line: string;
}

const CAN: CanBoost = { power: 1.5, seconds: 40, morale: 5, crash: 6, line: 'Ohhh yes. Let\'s GO. Point me at a user.' };

/** Energy drinks: a timed boost, then a crash. The king makes them ascend. */
export const CAN_BOOSTS: Record<string, CanBoost> = {
  euroshopper: { power: 1.25, seconds: 30, morale: -4, crash: 4, line: 'The Euroshopper one. Wow. Thanks. Really.' },
  redbull: CAN,
  monster: CAN,
  pipeline: { ...CAN, morale: 8, line: 'Pipeline Punch! The pink one! You DO listen in stand-up.' },
  nocco: { ...CAN, power: 1.6, line: 'BCAA. Gains. Hold my lanyard.' },
  celsius: CAN,
  battery: { ...CAN, line: 'Battery. Tastes like a 9-volt. Feels like one too. LET\'S GO.' },
  batteryzero: CAN,
  energy: { ...CAN, line: 'Grumble Energy. The company drink. I can hear colours.' },
  kraken: { power: 1.75, seconds: 45, morale: 0, crash: 14, line: 'A LITRE? At once? Okay. Okay okay okay okay.' },
  whitemonster: { power: 2.6, seconds: 60, morale: 30, crash: 0, line: 'Is this... a WHITE MONSTER? For ME? ...I can see the code. I can see ALL the code.' },
};

/** A second can on top of the first: jittery, not stronger. */
export const DOUBLE_CAN_MORALE = -8;

/** Anybody on the team whose name says they grew up with salmiakki. */
export function isFinn(name: string): boolean {
  return /^(Mikko|Aino|Pekka|Jukka|Sanna|Tuula|Ville|Satu)\b/.test(name);
}

/** Mentoring milestones: the ranks of the Mentor perk are earned, not bought. */
export const MENTOR_MILESTONES: readonly number[] = [1, 3, 6];

export function mentorRankFor(mentored: number): number {
  return MENTOR_MILESTONES.filter((n) => mentored >= n).length;
}
