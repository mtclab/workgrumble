import { TICKETS } from './content/tickets';
import type { Actor } from './entities';
import { SKILL_UPS_PER_LEVEL } from './rpg';
import { type Level, TILE } from './level';
import type { Derived, SaveState } from './state';

export interface HudFrame {
  readonly save: SaveState;
  readonly d: Derived;
  readonly px: number;
  readonly pz: number;
  readonly yaw: number;
  readonly level: Level;
  readonly actors: readonly Actor[];
  readonly prompt: string;
  readonly effects: readonly string[];
  readonly boss: Actor | null;
  readonly face: 'normal' | 'hurt' | 'grin' | 'left' | 'right';
  readonly ammoText: string;
  readonly floorName: string;
  readonly elevatorOpen: boolean;
  readonly title: string;
  readonly spellText: string;
  readonly abilityText: string;
  /** null when not sneaking; else whether anyone has noticed you. */
  readonly hidden: boolean | null;
  readonly bandLabel: string;
  readonly promille: string;
}

function div(cls: string, parent: HTMLElement, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  parent.append(d);
  return d;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly face: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly sanity: HTMLDivElement;
  private readonly sanityFill: HTMLDivElement;
  private readonly energyFill: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly rep: HTMLDivElement;
  private readonly weapon: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly queue: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly weight: HTMLDivElement;
  private readonly loylyFill: HTMLDivElement;
  private readonly loylyText: HTMLDivElement;
  private readonly spell: HTMLDivElement;
  private readonly ability: HTMLDivElement;
  private readonly bac: HTMLDivElement;
  private readonly bacFill: HTMLDivElement;
  private readonly bacLabel: HTMLDivElement;
  private readonly eye: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly effects: HTMLDivElement;
  private readonly quests: HTMLDivElement;
  private readonly slas: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  readonly crosshair: HTMLDivElement;
  private readonly floorLabel: HTMLDivElement;
  private vignetteT = 0;
  private vignetteColor = 'rgba(255,0,0,';
  private faceBlink = 0;
  mapOpen = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.append(this.root);
    this.vignette = div('hud-vignette', this.root);
    this.crosshair = div('hud-crosshair', this.root, '+');
    this.prompt = div('hud-prompt', this.root);
    this.effects = div('hud-effects', this.root);
    this.quests = div('hud-quests', this.root);
    this.slas = div('hud-slas', this.root);
    this.toasts = div('hud-toasts', this.root);
    this.floorLabel = div('hud-floor', this.root);
    this.bossBar = div('hud-boss', this.root);
    this.bossName = div('hud-boss-name', this.bossBar);
    const bossTrack = div('hud-boss-track', this.bossBar);
    this.bossFill = div('hud-boss-fill', bossTrack);

    this.mini = document.createElement('canvas');
    this.mini.className = 'hud-mini';
    this.mini.width = 180;
    this.mini.height = 180;
    this.root.append(this.mini);
    const mc = this.mini.getContext('2d');
    if (mc === null) throw new Error('2d canvas unavailable');
    this.miniCtx = mc;

    this.map = document.createElement('canvas');
    this.map.className = 'hud-map';
    this.map.width = 640;
    this.map.height = 640;
    this.root.append(this.map);
    const mapc = this.map.getContext('2d');
    if (mapc === null) throw new Error('2d canvas unavailable');
    this.mapCtx = mapc;

    const bar = div('hud-bar', this.root);
    const left = div('hud-cell hud-cell-weapon', bar);
    div('hud-label', left, 'TOOL');
    this.weapon = div('hud-big hud-weapon', left);
    this.ammo = div('hud-small', left);

    const sanCell = div('hud-cell', bar);
    div('hud-label', sanCell, 'SANITY');
    this.sanity = div('hud-big', sanCell);
    const st = div('hud-track', sanCell);
    this.sanityFill = div('hud-fill hud-fill-sanity', st);
    const et = div('hud-track hud-track-thin', sanCell);
    this.energyFill = div('hud-fill hud-fill-energy', et);

    const faceCell = div('hud-cell hud-cell-face', bar);
    this.face = document.createElement('canvas');
    this.face.width = 32;
    this.face.height = 32;
    this.face.className = 'hud-face';
    faceCell.append(this.face);
    const fc = this.face.getContext('2d');
    if (fc === null) throw new Error('2d canvas unavailable');
    this.faceCtx = fc;

    const repCell = div('hud-cell', bar);
    div('hud-label', repCell, 'REP');
    this.rep = div('hud-big hud-rep', repCell);
    this.queue = div('hud-small', repCell);

    const magicCell = div('hud-cell hud-cell-magic', bar);
    div('hud-label', magicCell, 'LÖYLY');
    this.loylyText = div('hud-small', magicCell);
    const lt = div('hud-track', magicCell);
    this.loylyFill = div('hud-fill hud-fill-loyly', lt);
    this.spell = div('hud-small', magicCell);
    this.ability = div('hud-small', magicCell);

    const bacCell = div('hud-cell hud-cell-bac', bar);
    div('hud-label', bacCell, 'PROMILLE');
    this.bac = div('hud-big hud-bac', bacCell);
    const bt = div('hud-track hud-track-bac', bacCell);
    // The Ballmer Peak window, marked on the meter.
    const peak = div('hud-bac-peak', bt);
    peak.style.left = '26%';
    peak.style.width = '10%';
    this.bacFill = div('hud-fill hud-fill-bac', bt);
    this.bacLabel = div('hud-small', bacCell);

    const lvlCell = div('hud-cell hud-cell-level', bar);
    div('hud-label', lvlCell, 'CAREER');
    this.level = div('hud-small', lvlCell);
    const xt = div('hud-track hud-track-thin', lvlCell);
    this.xpFill = div('hud-fill hud-fill-xp', xt);
    this.weight = div('hud-small', lvlCell);
    this.eye = div('hud-eye', this.root);
  }

  flash(kind: 'hurt' | 'heal' | 'meeting'): void {
    this.vignetteT = 1;
    this.vignetteColor = kind === 'hurt' ? 'rgba(255,0,0,' : kind === 'heal' ? 'rgba(80,255,140,' : 'rgba(80,140,255,';
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'epic' = 'info'): void {
    const t = div(`hud-toast hud-toast-${kind}`, this.toasts, text);
    window.setTimeout(() => t.classList.add('is-fading'), kind === 'epic' ? 5200 : 3400);
    window.setTimeout(() => t.remove(), kind === 'epic' ? 6000 : 4200);
    while (this.toasts.children.length > 6) this.toasts.firstChild?.remove();
  }

  update(f: HudFrame, dt: number): void {
    const s = f.save;
    const d = f.d;
    this.weapon.textContent = d.weapon.name;
    this.ammo.textContent = f.ammoText;
    this.sanity.textContent = `${Math.max(0, Math.ceil(s.sanity))}`;
    this.sanity.classList.toggle('is-low', s.sanity < d.maxSanity * 0.3);
    this.sanityFill.style.width = `${Math.max(0, Math.min(100, (s.sanity / d.maxSanity) * 100))}%`;
    this.energyFill.style.width = `${Math.max(0, Math.min(100, s.energy))}%`;
    this.rep.textContent = `₡${s.rep}`;
    this.queue.textContent = `Queue: ${s.queue.length}  ·  Action items: ${s.actionItems}`;
    this.level.textContent = `Lv ${s.level} ${f.title}${s.perkPoints > 0 ? `  (+${s.perkPoints} perk)` : ''}`;
    this.xpFill.style.width = `${Math.min(100, (s.skillUps / SKILL_UPS_PER_LEVEL) * 100)}%`;
    this.xpFill.classList.toggle('is-ready', s.skillUps >= SKILL_UPS_PER_LEVEL);
    this.loylyText.textContent = `${Math.floor(s.loyly)}/${d.maxLoyly}`;
    this.loylyFill.style.width = `${Math.min(100, (s.loyly / d.maxLoyly) * 100)}%`;
    this.spell.textContent = `F: ${f.spellText}`;
    this.ability.textContent = f.abilityText;
    this.bac.textContent = `${f.promille}‰`;
    this.bacFill.style.width = `${Math.min(100, s.bac)}%`;
    this.bacLabel.textContent = f.bandLabel;
    this.bac.dataset.band = f.bandLabel;
    this.bacLabel.classList.toggle('is-peak', f.bandLabel === 'BALLMER PEAK');
    this.bacLabel.classList.toggle('is-alarm', s.bac >= 42);
    this.eye.style.display = f.hidden === null ? 'none' : 'block';
    this.eye.textContent = f.hidden === true ? '👁 HIDDEN' : '👁 SEEN';
    this.eye.classList.toggle('is-seen', f.hidden === false);
    this.weight.textContent = `${d.weight}/${d.carry} kg${d.overEncumbered ? ' OVER-ENCUMBERED' : ''}`;
    this.weight.classList.toggle('is-alarm', d.overEncumbered);
    this.prompt.textContent = f.prompt;
    this.prompt.style.display = f.prompt === '' ? 'none' : 'block';
    this.effects.replaceChildren(...f.effects.map((e) => {
      const x = document.createElement('span');
      x.className = 'hud-effect';
      x.textContent = e;
      return x;
    }));
    this.floorLabel.textContent = f.floorName;

    // Tasks.
    const lines = s.quests.map((q) => `${q.done ? '✔' : '•'} ${q.title}${q.goal > 1 ? ` (${Math.min(q.progress, q.goal)}/${q.goal})` : ''}`);
    this.quests.textContent = lines.length > 0 ? `TASKS\n${lines.join('\n')}` : '';
    this.quests.style.display = lines.length > 0 ? 'block' : 'none';

    // SLA timers.
    const sl = s.queue.slice(0, 6).map((q) => {
      const t = TICKETS[q.t];
      const title = t === undefined ? '?' : t.title.length > 34 ? `${t.title.slice(0, 33)}…` : t.title;
      return `${q.sla < 30 ? '⚠' : q.gold ? '⭐' : '🎫'} ${Math.max(0, Math.ceil(q.sla))}s  ${title}`;
    });
    if (s.queue.length > 6) sl.push(`+${s.queue.length - 6} more`);
    this.slas.textContent = sl.length > 0 ? `TICKET QUEUE (solve at any computer)\n${sl.join('\n')}` : '';
    this.slas.style.display = sl.length > 0 ? 'block' : 'none';
    this.slas.classList.toggle('is-alarm', s.queue.some((q) => q.sla < 30));

    if (f.boss !== null && f.boss.bossActive && !f.boss.resolved) {
      this.bossBar.style.display = 'block';
      this.bossName.textContent = `${f.boss.name} - ${f.boss.boss?.title ?? ''}`;
      this.bossFill.style.width = `${Math.max(0, (f.boss.hp / f.boss.maxHp) * 100)}%`;
    } else {
      this.bossBar.style.display = 'none';
    }

    this.vignetteT = Math.max(0, this.vignetteT - dt * 2.5);
    const lowPulse = s.sanity < d.maxSanity * 0.25 ? 0.25 + Math.sin(performance.now() / 250) * 0.1 : 0;
    const a = Math.max(this.vignetteT * 0.55, lowPulse);
    const col = this.vignetteT > 0 ? this.vignetteColor : 'rgba(255,0,0,';
    this.vignette.style.boxShadow = `inset 0 0 160px 40px ${col}${a.toFixed(3)})`;

    this.drawFace(f.face, s.sanity / d.maxSanity, dt);
    this.drawMini(f);
    this.map.style.display = this.mapOpen ? 'block' : 'none';
    if (this.mapOpen) this.drawMap(f);
  }

  private drawFace(mood: HudFrame['face'], health: number, dt: number): void {
    const g = this.faceCtx;
    this.faceBlink -= dt;
    if (this.faceBlink < -0.15) this.faceBlink = 2 + (performance.now() % 3000) / 1000;
    const blinking = this.faceBlink < 0;
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = '#2a2a2a';
    g.fillRect(0, 0, 32, 32);
    // Skin gets greyer as sanity drains.
    const tired = 1 - Math.max(0, Math.min(1, health));
    const r = Math.round(241 - tired * 60);
    const gg = Math.round(201 - tired * 40);
    const b = Math.round(165 - tired * 10);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(8, 6, 16, 20);
    g.fillRect(7, 10, 1, 8);
    g.fillRect(24, 10, 1, 8);
    // Hair.
    g.fillStyle = '#4a3020';
    g.fillRect(7, 4, 18, 4);
    g.fillRect(7, 6, 2, 5);
    g.fillRect(23, 6, 2, 5);
    if (tired > 0.6) {
      g.fillStyle = '#6a5040';
      g.fillRect(12, 4, 3, 2);
    }
    // Glasses.
    g.fillStyle = '#111';
    g.fillRect(9, 12, 6, 1);
    g.fillRect(17, 12, 6, 1);
    g.fillRect(15, 13, 2, 1);
    g.fillRect(9, 12, 1, 4);
    g.fillRect(14, 12, 1, 4);
    g.fillRect(17, 12, 1, 4);
    g.fillRect(22, 12, 1, 4);
    g.fillRect(9, 16, 6, 1);
    g.fillRect(17, 16, 6, 1);
    // Eyes.
    const look = mood === 'left' ? -1 : mood === 'right' ? 1 : 0;
    g.fillStyle = blinking ? `rgb(${r},${gg},${b})` : '#fff';
    g.fillRect(10, 13, 4, 3);
    g.fillRect(18, 13, 4, 3);
    if (!blinking) {
      g.fillStyle = '#222';
      g.fillRect(11 + look + (mood === 'hurt' ? 0 : 0), 14, 2, 2);
      g.fillRect(19 + look, 14, 2, 2);
    }
    // Eye bags.
    if (tired > 0.35) {
      g.fillStyle = `rgba(90,60,90,${0.3 + tired * 0.5})`;
      g.fillRect(10, 17, 4, 1);
      g.fillRect(18, 17, 4, 1);
    }
    // Mouth.
    g.fillStyle = '#6a1f1f';
    if (mood === 'grin') {
      g.fillRect(12, 21, 8, 1);
      g.fillRect(13, 22, 6, 2);
      g.fillStyle = '#fff';
      g.fillRect(13, 22, 6, 1);
    } else if (mood === 'hurt') {
      g.fillRect(13, 20, 6, 4);
    } else if (tired > 0.7) {
      g.fillRect(12, 23, 8, 1);
      g.fillRect(11, 22, 1, 1);
      g.fillRect(20, 22, 1, 1);
    } else if (tired > 0.35) {
      g.fillRect(12, 22, 8, 1);
    } else {
      g.fillRect(12, 21, 1, 1);
      g.fillRect(19, 21, 1, 1);
      g.fillRect(13, 22, 6, 1);
    }
    // Sweat.
    if (tired > 0.5) {
      g.fillStyle = '#8fd0ff';
      g.fillRect(24, 8, 1, 3);
    }
    // Lanyard.
    g.fillStyle = '#2266cc';
    g.fillRect(12, 27, 1, 5);
    g.fillRect(19, 27, 1, 5);
  }

  private drawMini(f: HudFrame): void {
    const g = this.miniCtx;
    const lv = f.level;
    const scale = 5;
    const size = 180;
    g.clearRect(0, 0, size, size);
    g.fillStyle = 'rgba(10,14,12,0.75)';
    g.fillRect(0, 0, size, size);
    const pcx = f.px / TILE;
    const pcz = f.pz / TILE;
    const range = Math.ceil(size / scale / 2) + 1;
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const cx = Math.floor(pcx) + dx;
        const cz = Math.floor(pcz) + dz;
        if (cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h) continue;
        const i = cz * lv.w + cx;
        if (lv.seen[i] !== 1 || lv.floor[i] !== 1) continue;
        g.fillStyle = lv.solid[i] === 1 ? '#3a4a42' : (lv.roomOf[i] ?? -1) >= 0 ? '#5d7a6c' : '#4a6358';
        const sx = size / 2 + (cx - pcx) * scale;
        const sy = size / 2 + (cz - pcz) * scale;
        g.fillRect(sx, sy, scale, scale);
      }
    }
    for (const it of lv.interactables) {
      const sx = size / 2 + (it.x / TILE - pcx) * scale;
      const sy = size / 2 + (it.z / TILE - pcz) * scale;
      if (lv.seen[Math.floor(it.z / TILE) * lv.w + Math.floor(it.x / TILE)] !== 1) continue;
      g.fillStyle = it.kind === 'terminal' ? '#5fb6ff' : it.kind === 'itdesk' ? '#7dff9a' : it.kind === 'elevator' ? (f.elevatorOpen ? '#ffffff' : '#ff4040') : '#d0c080';
      g.fillRect(sx - 2, sy - 2, 5, 5);
    }
    for (const a of f.actors) {
      if (a.resolved) continue;
      const sx = size / 2 + (a.pos.x / TILE - pcx) * scale;
      const sy = size / 2 + (a.pos.z / TILE - pcz) * scale;
      if (sx < 0 || sy < 0 || sx > size || sy > size) continue;
      g.fillStyle = a.kind === 'boss' ? '#ff00ff' : a.kind === 'healer' ? '#ff9ad5' : a.kind === 'helper' ? '#6fe0ff' : a.kind === 'manager' ? '#ffa030' : a.kind === 'customer' ? '#ffd700' : '#ff4040';
      g.beginPath();
      g.arc(sx, sy, a.kind === 'boss' ? 4 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow.
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(-f.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = '#8d8779';
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);
  }

  private drawMap(f: HudFrame): void {
    const g = this.mapCtx;
    const lv = f.level;
    const size = 640;
    const scale = Math.floor(size / Math.max(lv.w, lv.h));
    const ox = (size - lv.w * scale) / 2;
    const oy = (size - lv.h * scale) / 2;
    g.fillStyle = 'rgba(6,10,8,0.92)';
    g.fillRect(0, 0, size, size);
    for (let z = 0; z < lv.h; z++) {
      for (let x = 0; x < lv.w; x++) {
        const i = z * lv.w + x;
        if (lv.seen[i] !== 1 || lv.floor[i] !== 1) continue;
        g.fillStyle = lv.solid[i] === 1 ? '#2d3a33' : (lv.roomOf[i] ?? -1) >= 0 ? '#4f6a5c' : '#3f564b';
        g.fillRect(ox + x * scale, oy + z * scale, scale, scale);
      }
    }
    g.font = 'bold 11px monospace';
    for (const rm of lv.rooms) {
      const i = (rm.y + 1) * lv.w + rm.x + 1;
      if (lv.seen[i] !== 1) continue;
      g.fillStyle = '#c8e0d0';
      const label = lv.rooms.length === 1 ? 'THE MOKKI' : { lobby: 'LIFT', cubicles: 'DESKS', meeting: 'MEETING', kitchen: 'KITCHEN', server: 'SERVERS', it: 'INTERNAL IT', office: 'OFFICE', boss: 'CORNER OFFICE', print: 'PRINT ROOM', sauna: 'SAUNA' }[rm.kind];
      g.fillText(label, ox + rm.x * scale + 2, oy + rm.y * scale + 11);
    }
    for (const it of lv.interactables) {
      const cx = Math.floor(it.x / TILE);
      const cz = Math.floor(it.z / TILE);
      if (lv.seen[cz * lv.w + cx] !== 1) continue;
      g.fillStyle = it.kind === 'terminal' ? '#5fb6ff' : it.kind === 'itdesk' ? '#7dff9a' : it.kind === 'elevator' ? (f.elevatorOpen ? '#ffffff' : '#ff4040') : '#d0c080';
      g.fillRect(ox + cx * scale, oy + cz * scale, scale, scale);
    }
    const px = ox + (f.px / TILE) * scale;
    const py = oy + (f.pz / TILE) * scale;
    g.save();
    g.translate(px, py);
    g.rotate(-f.yaw);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 6);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = '#c8e0d0';
    g.fillText('M: close map  ·  blue: computers  ·  green: Internal IT  ·  red/white: lift', 10, size - 10);
  }
}
