/**
 * Every sound is synthesised on the fly with WebAudio: no audio assets.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private hum: GainNode | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private bossMode = false;
  private ambient: 'office' | 'mokki' | 'none' = 'none';
  private birdIn = 2;
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

  setAmbient(kind: 'office' | 'mokki' | 'none'): void {
    this.ambient = kind;
    if (this.hum !== null) this.hum.gain.value = kind === 'office' ? 0.018 : 0;
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
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
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
