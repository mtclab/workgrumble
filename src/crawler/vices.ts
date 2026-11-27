import { sfx } from './audio';
import { CAFFEINE_EFFECTS, caffeineBand, type CaffeineBand, caffeineDecay, crashSeconds, effectiveCaffeine, toleranceAfter } from './caffeine';
import { tintRig } from './characters';
import { say, type Actor } from './entities';
import type { Game } from './game';
import { BUFF_INFO, type ConsumableDef } from './items';
import { abandonPage } from './pager';
import { drankOnDuty } from './questing';
import { fx } from './rng';
import { BAND_EFFECTS, bandFor, bacDecay, drinkBac, promille } from './rpg';
import * as screens from './screens';
import { adjustStanding, perk, skill } from './state';

/**
 * The two tightropes: alcohol (the Ballmer Peak, then the floor starts
 * moving) and caffeine (Alert, then Wired, then the jitters and your heart
 * doing something it should not). Both have a morning after.
 */

// ================================================================== alcohol

export function tickVices(g: Game, dt: number): void {
  const s = g.save;
  const wide = g.derivedCache.specials.has('flask');
  const before = bandFor(s.bac, wide);
  // The pipeline: what you drank a moment ago is still on its way.
  if (s.stomach > 0) {
    const rate = (s.buffs.lined ?? 0) > 0 ? 0.55 : 1.1;
    const absorbed = Math.min(s.stomach, rate * dt);
    s.stomach -= absorbed;
    s.bac = Math.min(100, s.bac + absorbed);
  }
  if (s.bac > 0) s.bac = Math.max(0, s.bac - bacDecay(s.attrs.liver, skill(s, 'drinking')) * dt);
  s.peakBac = Math.max(s.peakBac, s.bac);
  const hardened = perk(s, 'hardened') > 0 ? 0.5 : 1;
  if (s.peakBac > 50 && s.bac < 10) {
    s.peakBac = 0;
    s.hangover = 110 * hardened;
    g.hud.toast('The hangover arrives like a Monday. (Sauna, coffee, the lake or the Avanto rune help.)', 'bad');
    g.journal('Hungover. Never again. (Again.)');
    g.tip('hangover');
    g.refreshDerived();
  }
  if (s.hangover > 0) {
    s.hangover = Math.max(0, s.hangover - dt);
    if (s.hangover === 0) g.refreshDerived();
  }
  s.dependency = Math.max(0, s.dependency - dt * 0.012);
  if (s.dependency >= 50 && s.bac < 5) {
    s.sanity -= ((s.dependency - 45) / 60) * dt * hardened;
    g.withdrawalT -= dt;
    if (g.withdrawalT <= 0) {
      g.withdrawalT = 25;
      g.hud.toast('The shakes. Something in you wants a drink. (Or a very long sauna.)', 'bad');
    }
  }
  const after = bandFor(s.bac, wide);
  if (after !== before) {
    g.refreshDerived();
    if (after === 'peak') {
      g.hud.toast('BALLMER PEAK: you can see the code behind the code. (+damage, +persuasion, terminals strike a wrong fix)', 'epic');
      g.achieve('ballmer');
    } else if (after === 'merry' && before !== 'hammered') {
      g.hud.toast('Merry. The office ladies will not approve. Managers can smell it.', 'bad');
    } else if (after === 'hammered') {
      g.hud.toast('HAMMERED. The floor is moving. Stop drinking.', 'bad');
    } else if (after === 'blackout') {
      blackout(g);
    }
  }
}

export function drink(g: Game, c: ConsumableDef): void {
  const s = g.save;
  if (c.bac === undefined) return;
  const wide = g.derivedCache.specials.has('flask');
  const liver = 1 - perk(s, 'ironliver') * 0.1;
  // It goes in the stomach first: the blood gets it over the next half-minute.
  s.stomach += drinkBac(c.bac, s.attrs.liver, skill(s, 'drinking')) * liver;
  s.dependency = Math.min(100, s.dependency + 3 + c.bac * 0.15);
  s.empties += 1;
  s.stats.drinks++;
  s.floorState.drinksHere++;
  drankOnDuty(g);
  if (s.hangover > 0) {
    s.hangover = 0;
    s.dependency = Math.min(100, s.dependency + 4);
    g.hud.toast('Hair of the dog. The hangover lifts. Something else takes hold.', 'bad');
  }
  // Hardened drinkers (and the Bar Tab perk) get more out of it.
  const heal = (c.heal ?? 0) * ((s.dependency >= 50 ? 0.5 : 0) + (perk(s, 'bartab') > 0 ? 1 : 0));
  if (heal > 0) g.healPlayer(heal, '');
  g.exercise('drinking', 1.5);
  if (s.stats.drinks % 12 === 0) s.attrs.liver = Math.min(100, s.attrs.liver + 1);
  sfx.glug();
  const forecast = Math.min(100, s.bac + s.stomach);
  g.hud.toast(`${c.name}. ${promille(s.bac)}‰ now, heading for ${promille(forecast)}‰ (${BAND_EFFECTS[bandFor(forecast, wide)].label}).`, bandFor(forecast, wide) === 'hammered' || bandFor(forecast, wide) === 'blackout' ? 'bad' : 'info');
  g.tip('drink');
  g.refreshDerived();
}

/** A manager close by, and you smell of lonkero. */
export function caughtCheck(g: Game, m: Actor): void {
  const s = g.save;
  const d = g.derivedCache;
  const band = d.band;
  const evidence = s.empties >= 4 ? 0.35 : 0;
  // Wired enough, you look too busy to be drunk. (Vodka Battery's whole pitch.)
  const mask = d.caffeine.speed >= 0.18 ? 0.6 : 1;
  const chance = Math.min(1, band.caughtChance * mask + evidence) * (1 - skill(s, 'drinking') / 250);
  g.caughtCd = 15;
  if (chance <= 0 || !fx.chance(chance)) return;
  say(m, s.bac >= 14 ? 'Have you been DRINKING? At WORK?' : 'Is that a bag of empties? In the office?', 3);
  adjustStanding(s, 'management', -8);
  g.warn(s.bac >= 14 ? 'Caught under the influence by a manager' : 'Caught with a bag of empties');
}

const INCIDENTS = [
  'You replied-all to the whole company with a single word: "löyly".',
  'You set the CEO\'s desktop wallpaper to a picture of a goat. It is still there.',
  'You signed up for the charity 10k. It is on Saturday.',
  'You told Derek what you really think of his stand-ups. In rhyme.',
  'You tried to reimage the vending machine.',
  'You drunk-dialled the CEO to pitch "sauna as a service". He wants a deck by Monday.',
  'You ate Jukka\'s yoghurt. The one from 2023.',
];

export function blackout(g: Game): void {
  if (g.screen !== 'play' && g.screen !== 'os') return;
  const s = g.save;
  s.stats.blackouts++;
  const lost = Math.floor(s.rep * 0.2);
  s.rep -= lost;
  s.bac = 45;
  s.stomach = 0;
  const what = fx.pick(INCIDENTS);
  g.journal(`Blackout. ${what}`);
  if (s.location === 'office') g.warn('Blackout at work');
  // On call, the pager went off into the void.
  if (s.location === 'mokki') abandonPage(g, 'I was face-down on the laituri');
  g.achieve('blackout');
  g.os.hide();
  g.screen = 'transition';
  g.input.releaseLock();
  screens.setOverlay(g, `<div class="title-logo small dead">BLACKOUT</div>
    <p class="title-blurb">You wake up ${s.location === 'mokki' ? 'face-down on the laituri' : 'under a desk in the lobby'}. You have lost ₡${lost}, most of your dignity, and some time.</p>
    <p class="title-blurb">Apparently: ${what}</p>`, [['Get up', () => {
    g.player.pos.set(g.level.start.x, 0, g.level.start.z);
    s.hangover = 60;
    g.refreshDerived();
    screens.resume(g);
  }]]);
}

// ================================================================== caffeine

const BAND_LINES: Partial<Record<CaffeineBand, [string, 'info' | 'good' | 'bad' | 'epic']>> = {
  alert: ['Alert. Eyes open, hands steady.', 'good'],
  wired: ['WIRED: faster feet, faster hands. The sweet spot - stop here.', 'epic'],
  jittery: ['Jittery. Your aim shakes and your sanity starts to fray. Ease off the cans.', 'bad'],
  palpitations: ['PALPITATIONS. Your heart is doing a drum solo. Sanity is draining fast.', 'bad'],
};

export function tickCaffeine(g: Game, dt: number): void {
  const s = g.save;
  const beforeBand = caffeineBand(s.caffeine, s.caffeineTol);
  s.caffeine = caffeineDecay(s.caffeine, dt);
  if (s.caffeine < 0.5) s.caffeine = 0;
  const eff = effectiveCaffeine(s.caffeine, s.caffeineTol);
  s.caffeinePeak = Math.max(s.caffeinePeak, eff);
  s.caffeineTol = Math.max(0, s.caffeineTol - dt * 0.0004);
  const ultra = (s.buffs.ultra ?? 0) > 0;
  // Coming down after a big peak: the crash.
  if (s.caffeinePeak >= 150 && eff < 50) {
    const secs = crashSeconds(s.caffeinePeak, perk(s, 'caffeine') > 0);
    s.caffeinePeak = 0;
    if (secs > 0 && !ultra) {
      s.crash = secs;
      g.hud.toast(`CAFFEINE CRASH. Everything is heavy for ${Math.round(secs)}s. (Another can would fix it. That is how it gets you.)`, 'bad');
      g.refreshDerived();
    }
  }
  if (s.crash > 0) {
    s.crash = Math.max(0, s.crash - dt);
    if (s.crash === 0) g.refreshDerived();
  }
  const band = caffeineBand(s.caffeine, s.caffeineTol);
  if (band !== beforeBand) {
    g.refreshDerived();
    const line = BAND_LINES[band];
    const rising = ['none', 'alert', 'wired', 'jittery', 'palpitations'].indexOf(band) > ['none', 'alert', 'wired', 'jittery', 'palpitations'].indexOf(beforeBand);
    if (line !== undefined && rising) g.hud.toast(ultra && band !== 'alert' && band !== 'wired' ? 'The White Monster holds your heart steady. For now.' : line[0], line[1]);
  }
  if (!ultra && (band === 'jittery' || band === 'palpitations')) {
    g.jitterT -= dt;
    if (g.jitterT <= 0) {
      g.jitterT = band === 'palpitations' ? 3 : 7;
      sfx.jitter();
      if (band === 'palpitations') g.hud.flash('hurt');
    }
  }
  // Way past sense: a proper scare.
  if (!ultra && eff > 650) {
    s.caffeine *= 0.55;
    if (caffeineBand(s.caffeine, s.caffeineTol) !== band) g.refreshDerived();
    s.sanity -= g.derivedCache.maxSanity * 0.35;
    g.rootPlayer(4, 'Sitting down, very suddenly');
    g.hud.toast('CARDIAC SCARE. You sit down on the carpet and count your heartbeats. There are a lot of them.', 'bad');
    g.journal('Too many cans. I had to sit on the floor for a while. Brenda brought me water and a look.');
    adjustStanding(s, 'kitchen', 1);
  }
  tickBuffs(g, dt);
}

function tickBuffs(g: Game, dt: number): void {
  const s = g.save;
  let changed = false;
  for (const [id, t] of Object.entries(s.buffs)) {
    const left = t - dt;
    if (left <= 0) {
      delete s.buffs[id];
      changed = true;
      g.hud.toast(`${BUFF_INFO[id]?.name ?? id} wears off.`, id === 'ultra' ? 'bad' : 'info');
    } else {
      s.buffs[id] = left;
    }
  }
  // Ascended: you glow a little. Everyone notices. Nobody says anything.
  const rig = g.player.rig;
  const glow = (s.buffs.ultra ?? 0) > 0 ? 0x3a3a3a : 0;
  if (rig.glow !== glow) {
    rig.glow = glow;
    tintRig(rig, 0, 0);
  }
  if (changed) g.refreshDerived();
}

/** Drinking a can (or a cup): the mg go in, tolerance creeps up, buffs start. */
export function caffeinate(g: Game, c: ConsumableDef): void {
  const s = g.save;
  if (c.mg === undefined) return;
  s.caffeine += c.mg;
  s.caffeineTol = toleranceAfter(s.caffeineTol, c.mg);
  // Drinking through the crash does end it. For now.
  if (s.crash > 0) {
    s.crash = 0;
    g.hud.toast('You drink through the crash. Your tolerance notices.', 'info');
  }
  if (c.id === 'coffee' || c.id === 'espresso') {
    s.bac = Math.max(0, s.bac - 6);
    s.hangover = Math.max(0, s.hangover - 30);
  }
  if (c.buff !== undefined && c.buffTime !== undefined && c.buff !== 'makkara' && c.buff !== 'hauki') {
    s.buffs[c.buff] = Math.max(s.buffs[c.buff] ?? 0, c.buffTime * (perk(s, 'caffeine') > 0 ? 1.5 : 1));
    if (c.buff === 'ultra') {
      s.energy = 100;
      s.crash = 0;
      g.rootT = 0;
      sfx.achievement();
      g.shake(0.3);
      g.hud.flash('heal');
      g.hud.showCard('ASCENDED', 'White Monster · Zero Sugar · Infinite Power');
      g.hud.toast('⚪ WHITE MONSTER. The world slows down. You do not.', 'epic');
      g.achieve('ultra');
    } else {
      g.hud.toast(`${BUFF_INFO[c.buff]?.icon ?? ''} ${BUFF_INFO[c.buff]?.name ?? c.buff}!`, 'good');
    }
  }
  g.refreshDerived();
}

export function caffeineLabel(g: Game): string {
  const s = g.save;
  return CAFFEINE_EFFECTS[caffeineBand(s.caffeine, s.caffeineTol)].label;
}
