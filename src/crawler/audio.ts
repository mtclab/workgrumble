import type { ProjectileKind } from './entities';

/**
 * Every sound is synthesised on the fly with WebAudio: no audio assets.
 */

/** The bed under everything: the office's hum, the lake's birds, the bog, or nothing. */
export type Ambient = 'office' | 'mokki' | 'suo' | 'none';

/** White noise from a fixed seed (the repo bans Math.random in src/). */
function noiseBuffer(ctx: AudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let x = seed;
  for (let i = 0; i < len; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (x / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private hum: GainNode | null = null;
  /** SUO's bed: wind over the bog and a slow drone, faded in and out as one. */
  private suoBed: GainNode | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private bossMode = false;
  private ambient: Ambient = 'none';
  private birdIn = 2;
  private dripIn = 3;
  /** When each kind of projectile last made its sound: a ring of eighteen makes one. */
  private readonly lastShot = new Map<ProjectileKind, number>();
  volume = 0.7;
  musicVolume = 0.5;

  unlock(): void {
    if (this.ctx !== null) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.ctx.destination);
      // The fluorescent hum of every office ever built: a quiet 100 Hz buzz.
      this.hum = this.ctx.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.musicBus);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 100;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      o.connect(f);
      f.connect(this.hum);
      o.start();
      this.suoBed = this.buildSuoBed(this.ctx, this.musicBus);
      this.setAmbient(this.ambient);
    } catch {
      this.ctx = null;
    }
  }

  /** Sound effects volume. */
  setVolume(v: number): void {
    this.volume = v;
    if (this.master !== null) this.master.gain.value = v;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicBus !== null) this.musicBus.gain.value = v;
  }

  setAmbient(kind: Ambient): void {
    this.ambient = kind;
    if (this.hum !== null) this.hum.gain.value = kind === 'office' ? 0.018 : 0;
    // The bog fades rather than cuts: the crossing's hiss covers the seam.
    if (this.ctx !== null && this.suoBed !== null) this.suoBed.gain.setTargetAtTime(kind === 'suo' ? 1 : 0, this.ctx.currentTime, 0.25);
  }

  /**
   * The bog's bed, built once and left running silent until a vision: wind
   * (noise through a low-pass that a slow LFO opens and closes) and a low
   * drone of two sines a hair apart, so it beats.
   */
  private buildSuoBed(ctx: AudioContext, bus: GainNode): GainNode {
    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(bus);
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 2, 7654321);
    wind.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 220;
    lfo.connect(depth);
    depth.connect(lp.frequency);
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    wind.connect(lp);
    lp.connect(windGain);
    windGain.connect(bed);
    const drone = ctx.createGain();
    drone.gain.value = 0.035;
    drone.connect(bed);
    for (const f of [55, 55.4]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(drone);
      o.start();
    }
    wind.start();
    lfo.start();
    return bed;
  }

  /**
   * The crossing: a steam hiss that falls into the bog's drone on the way
   * under, and rises back into the office hum on the way out.
   */
  crossing(under: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const t0 = ctx.currentTime;
    const dur = 1.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur, 2468013);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(under ? 7000 : 300, t0);
    f.frequency.exponentialRampToValueAtTime(under ? 260 : 6000, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    // The tone underneath lands where the next place's bed sits: the drone, or the hum.
    this.tone(under ? 220 : 55, 1.2, 'sine', 0.12, under ? -165 : 45);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0, bus: 'sfx' | 'music' = 'sfx'): void {
    const ctx = this.ctx;
    const master = bus === 'music' ? this.musicBus : this.master;
    if (ctx === null || master === null) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter = 1200, delay = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur, 1234567);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  swing(): void { this.noise(0.12, 0.25, 2500); }
  hit(): void { this.tone(180, 0.1, 'square', 0.2, -100); this.noise(0.06, 0.2, 800); }
  shoot(): void { this.tone(900, 0.07, 'square', 0.08, -500); }
  air(): void { this.noise(0.09, 0.08, 5000); }
  boom(): void { this.noise(0.5, 0.5, 400); this.tone(80, 0.4, 'sine', 0.4, -40); }
  nova(): void { this.tone(200, 0.6, 'sawtooth', 0.2, 800); this.tone(100, 0.8, 'sine', 0.3, -60, 0.1); }
  hurt(): void { this.tone(220, 0.18, 'sawtooth', 0.2, -120); }
  resolved(): void { this.tone(660, 0.1, 'triangle', 0.2); this.tone(880, 0.15, 'triangle', 0.2, 0, 0.08); }
  pickup(): void { this.tone(1200, 0.06, 'square', 0.1); this.tone(1600, 0.08, 'square', 0.1, 0, 0.05); }
  coin(): void { this.tone(988, 0.07, 'square', 0.12); this.tone(1319, 0.2, 'square', 0.12, 0, 0.07); }
  phone(): void { for (let i = 0; i < 4; i++) this.tone(i % 2 === 0 ? 1400 : 1100, 0.05, 'square', 0.06, 0, i * 0.06); }
  /** The pager: two rounds of three high beeps. */
  pager(): void { for (let i = 0; i < 6; i++) this.tone(2300, 0.08, 'square', 0.07, 0, i * 0.12 + (i >= 3 ? 0.25 : 0)); }
  paper(): void { this.noise(0.08, 0.1, 3000); }
  heal(): void { this.tone(523, 0.12, 'sine', 0.2); this.tone(659, 0.12, 'sine', 0.2, 0, 0.1); this.tone(784, 0.2, 'sine', 0.2, 0, 0.2); }
  levelUp(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, 0, i * 0.1)); }
  error(): void { this.tone(160, 0.25, 'square', 0.15); this.tone(120, 0.3, 'square', 0.15, 0, 0.12); }
  click(): void { this.tone(1800, 0.02, 'square', 0.05); }
  boot(): void { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, 0, i * 0.15)); }
  meeting(): void { this.tone(880, 0.1, 'sine', 0.2); this.tone(660, 0.3, 'sine', 0.2, 0, 0.12); }
  ding(): void { this.tone(1046, 0.4, 'sine', 0.2); this.tone(784, 0.6, 'sine', 0.2, 0, 0.25); }
  step(): void { this.noise(0.04, 0.03, 500); }
  bossRoar(): void { this.tone(70, 1.2, 'sawtooth', 0.3, 30); this.noise(0.8, 0.2, 300); }
  block(): void { this.tone(420, 0.06, 'square', 0.15, -200); this.noise(0.05, 0.12, 1800); }
  parry(): void { this.tone(1500, 0.08, 'triangle', 0.18); this.tone(2200, 0.12, 'triangle', 0.12, 0, 0.05); }
  charge(): void { this.tone(220, 0.25, 'sawtooth', 0.08, 440); }
  heavy(): void { this.noise(0.18, 0.4, 900); this.tone(90, 0.25, 'square', 0.25, -40); }
  bark(): void { this.tone(520, 0.07, 'square', 0.12, -250); this.tone(480, 0.08, 'square', 0.1, -250, 0.12); }
  poof(): void { this.noise(0.2, 0.15, 4000); this.tone(600, 0.15, 'sine', 0.08, 600); }
  bite(): void { this.tone(900, 0.05, 'sine', 0.2); this.tone(700, 0.05, 'sine', 0.2, 0, 0.08); }
  reel(): void { this.noise(0.05, 0.06, 6000); }
  sting(): void { [196, 185, 175, 98].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.12, 0, i * 0.12)); }
  achievement(): void { [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.12, 0, i * 0.07)); }
  jitter(): void { this.tone(60, 0.12, 'sine', 0.2); this.tone(60, 0.1, 'sine', 0.16, 0, 0.18); }
  /** Someone drawing back to hit you: a short rise, lower and slower for a boss. */
  windup(seconds: number, big = false): void { this.tone(big ? 110 : 240, Math.min(0.45, seconds), 'triangle', big ? 0.14 : 0.09, big ? 150 : 420); }
  /** A swing that hits nothing: air, and a soft drop. */
  whiff(): void { this.noise(0.16, 0.16, 1500); this.tone(340, 0.12, 'sine', 0.05, -200); }
  /** Pulling the trigger on nothing. */
  empty(): void { this.tone(2600, 0.015, 'square', 0.07); this.noise(0.03, 0.08, 4200); }
  shove(): void { this.noise(0.1, 0.3, 600); this.tone(150, 0.12, 'sine', 0.25, -70); }

  /** The sound of something leaving a hand (or a turret, or a boss). */
  projectile(kind: ProjectileKind): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const last = this.lastShot.get(kind) ?? -1;
    if (ctx.currentTime - last < 0.06) return;
    this.lastShot.set(kind, ctx.currentTime);
    switch (kind) {
      case 'ticket': case 'gold': case 'paper': case 'deck': this.paper(); break;
      case 'invite': this.tone(990, 0.09, 'sine', 0.08, -120); break;
      case 'code': this.tone(1500, 0.07, 'square', 0.05, -1000); break;
      case 'chat': this.tone(480, 0.12, 'sine', 0.08, 320); break;
      case 'laser': this.tone(1900, 0.14, 'sawtooth', 0.05, -1300); break;
      case 'ring': this.tone(170, 0.2, 'square', 0.08, -70); break;
      case 'po': this.tone(210, 0.1, 'square', 0.1, -90); this.noise(0.06, 0.1, 900); break;
      case 'rtfm': this.tone(700, 0.06, 'square', 0.05, 300); break;
      case 'stun': this.tone(520, 0.12, 'sine', 0.08, 500); break;
      case 'steam': this.noise(0.25, 0.12, 6000); break;
      case 'salmiakki': this.tone(300, 0.08, 'triangle', 0.08, -120); break;
      case 'label': case 'toner': case 'duck': this.shoot(); break;
    }
  }

  fizzle(): void { this.noise(0.25, 0.15, 900); this.tone(300, 0.2, 'sawtooth', 0.08, -200); }
  hiss(): void { this.noise(0.9, 0.25, 7000); }
  glug(): void { for (let i = 0; i < 3; i++) this.tone(180 + i * 40, 0.08, 'sine', 0.2, -60, i * 0.12); }
  snore(): void { this.noise(0.6, 0.12, 300); this.noise(0.6, 0.08, 500, 0.9); }
  splash(): void { this.noise(0.5, 0.35, 2500); this.tone(400, 0.3, 'sine', 0.1, -300); }
  chime(): void { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.08)); }
  lockClick(): void { this.tone(2400, 0.03, 'square', 0.08); }
  snap(): void { this.tone(1200, 0.05, 'square', 0.12, -900); }

  setBoss(on: boolean): void { this.bossMode = on; }

  /** A tiny grim office-muzak sequencer, ticked from the game loop. */
  music(dt: number): void {
    if (this.ctx === null) return;
    if (this.ambient === 'suo') {
      // No tune under the steam: the bed, and now and then a drip.
      if (dt <= 0) return;
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = 2.5 + (this.musicStep % 5) * 1.3;
        this.musicStep++;
        this.tone(1400 + (this.musicStep % 3) * 180, 0.12, 'sine', 0.05, -700, 0, 'music');
      }
      return;
    }
    if (this.ambient === 'mokki' && dt > 0) {
      // Birds over the lake, and the odd loon.
      this.birdIn -= dt;
      if (this.birdIn <= 0) {
        this.birdIn = 2 + (this.musicStep % 7) * 0.9;
        const base = 1800 + (this.musicStep % 5) * 260;
        for (let i = 0; i < 3; i++) this.tone(base + i * 120, 0.07, 'sine', 0.025, 300, i * 0.1, 'music');
        if (this.musicStep % 23 === 0) this.tone(620, 1.4, 'sine', 0.03, 180, 0.5, 'music');
      }
    }
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    if (this.ambient === 'mokki' && !this.bossMode) {
      // The weekend: a slow kantele tune in a minor pentatonic, and a drone.
      const kantele = [440, 0, 523, 587, 0, 659, 587, 0, 523, 440, 0, 392, 440, 0, 0, 0];
      const k = kantele[this.musicStep % kantele.length] ?? 0;
      if (k > 0) {
        this.tone(k, 0.9, 'triangle', 0.035, 0, 0, 'music');
        this.tone(k * 2, 0.4, 'sine', 0.012, 0, 0.02, 'music');
      }
      if (this.musicStep % 16 === 0) this.tone(110, 5, 'sine', 0.03, 0, 0, 'music');
      this.musicStep++;
      this.musicTimer = 0.42;
      return;
    }
    const bass = this.bossMode ? [55, 55, 58, 55, 65, 55, 52, 49] : [110, 0, 98, 0, 87, 0, 98, 82];
    const lead = this.bossMode ? [220, 0, 233, 0, 262, 247, 0, 196] : [0, 330, 0, 294, 0, 0, 262, 0];
    const i = this.musicStep % 8;
    const b = bass[i] ?? 0;
    const l = lead[i] ?? 0;
    if (b > 0) this.tone(b, 0.22, this.bossMode ? 'sawtooth' : 'triangle', this.bossMode ? 0.07 : 0.05, 0, 0, 'music');
    if (l > 0 && this.musicStep % 16 < 12) this.tone(l, 0.15, 'square', 0.025, 0, 0, 'music');
    if (this.bossMode && i % 2 === 0) this.noise(0.05, 0.06, 6000);
    this.musicStep++;
    this.musicTimer = this.bossMode ? 0.16 : 0.32;
  }
}

export const sfx = new Sfx();
