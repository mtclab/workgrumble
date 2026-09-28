import * as THREE from 'three';
import { Rng } from './rng';

/**
 * Every surface is painted at load time on a canvas: no image assets, so the
 * whole game stays one bundle. Each floor theme re-tints the same painters.
 */

export interface Theme {
  readonly name: string;
  readonly carpet: string;
  readonly carpetFleck: string;
  readonly wall: string;
  readonly wallTrim: string;
  readonly ceiling: string;
  readonly fog: number;
  readonly light: number;
  readonly ambient: number;
}

export const THEMES: readonly Theme[] = [
  { name: 'Server Basement', carpet: '#3b3f45', carpetFleck: '#2b2e33', wall: '#6d7278', wallTrim: '#3a3f46', ceiling: '#55595e', fog: 0x0b0f14, light: 0x9fc6ff, ambient: 0x283444 },
  { name: 'Open-Plan Helldesk', carpet: '#4a5a73', carpetFleck: '#38465c', wall: '#c9c2b3', wallTrim: '#8c8474', ceiling: '#d8d6cf', fog: 0x1a1d22, light: 0xfff4dc, ambient: 0x3c3a36 },
  { name: 'Sales Floor', carpet: '#7a2f36', carpetFleck: '#5c2127', wall: '#d8cfb8', wallTrim: '#9a7a4a', ceiling: '#e0dccf', fog: 0x1f1414, light: 0xffe2b8, ambient: 0x3f2d2a },
  { name: 'Finance & Procurement', carpet: '#35584a', carpetFleck: '#27443a', wall: '#bfc9c0', wallTrim: '#6b7a6f', ceiling: '#d4dad3', fog: 0x111a16, light: 0xe8fff0, ambient: 0x2c3a34 },
  { name: 'Executive Suite', carpet: '#5a4632', carpetFleck: '#46362a', wall: '#e9e2d0', wallTrim: '#b08d4a', ceiling: '#f0ece0', fog: 0x1a150e, light: 0xffe9b0, ambient: 0x4a3e2c },
];

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

export function carpetTexture(theme: Theme, seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const r = new Rng(seed);
  g.fillStyle = theme.carpet;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r.chance(0.5) ? theme.carpetFleck : 'rgba(255,255,255,0.05)';
    g.fillRect(r.int(0, 127), r.int(0, 127), 1, 1);
  }
  // Carpet tile seams.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.strokeRect(0.5, 0.5, 127, 127);
  // The coffee stain every office floor has.
  if (r.chance(0.6)) {
    g.fillStyle = 'rgba(60,35,10,0.18)';
    g.beginPath();
    g.arc(r.int(20, 100), r.int(20, 100), r.int(6, 14), 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

export function ceilingTexture(theme: Theme): THREE.CanvasTexture {
  const [c, g] = canvas(64);
  g.fillStyle = theme.ceiling;
  g.fillRect(0, 0, 64, 64);
  const r = new Rng(7);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(r.int(0, 63), r.int(0, 63), 1, 1);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  return toTexture(c);
}

export function wallTexture(theme: Theme): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  g.fillStyle = theme.wall;
  g.fillRect(0, 0, 128, 128);
  const r = new Rng(3);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r.chance(0.5) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(r.int(0, 127), r.int(0, 127), 2, 2);
  }
  // Skirting board and dado rail.
  g.fillStyle = theme.wallTrim;
  g.fillRect(0, 116, 128, 12);
  g.fillRect(0, 70, 128, 3);
  // Blu-tack marks where a poster used to be.
  g.fillStyle = 'rgba(80,120,200,0.25)';
  for (let i = 0; i < 4; i++) g.fillRect(r.int(8, 118), r.int(10, 60), 3, 3);
  return toTexture(c);
}

export function rackTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64);
  g.fillStyle = '#16181c';
  g.fillRect(0, 0, 64, 64);
  const r = new Rng(11);
  for (let y = 2; y < 64; y += 6) {
    g.fillStyle = '#2a2e35';
    g.fillRect(4, y, 56, 4);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = r.chance(0.7) ? '#3cff6a' : r.chance(0.5) ? '#ffb020' : '#ff3030';
      g.fillRect(8 + k * 4, y + 1, 2, 2);
    }
  }
  const t = toTexture(c);
  return t;
}

export function screenTexture(lines: readonly string[], bg = '#0a3a8c'): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c0c0c0';
  g.fillRect(0, 116, 128, 12);
  g.fillStyle = '#008000';
  g.fillRect(2, 118, 20, 8);
  g.fillStyle = '#ffffff';
  g.font = 'bold 11px monospace';
  lines.forEach((line, i) => g.fillText(line, 6, 18 + i * 14));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function posterTexture(text: string, seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const r = new Rng(seed);
  const hue = r.int(0, 360);
  g.fillStyle = `hsl(${hue} 50% 35%)`;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = `hsl(${(hue + 180) % 360} 60% 70%)`;
  g.beginPath();
  g.arc(64, 50, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 14px sans-serif';
  g.textAlign = 'center';
  const words = text.split(' ');
  let line = '';
  let y = 96;
  for (const w of words) {
    if ((line + w).length > 14) {
      g.fillText(line.trim(), 64, y);
      line = '';
      y += 15;
    }
    line += w + ' ';
  }
  g.fillText(line.trim(), 64, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const POSTERS = [
  'SYNERGY', 'TEAMWORK makes the DREAM work', 'Have you raised a ticket?',
  'Think before you print', 'Hang in there', 'Is it plugged in?',
  'Wash your mug', 'Mandatory Fun Friday', 'Passwords are like pants',
  'Clean desk policy', 'Our people are our greatest asset',
];

/** A text label sprite: nameplates, speech bubbles, damage numbers. */
export function textSprite(
  text: string,
  opts: { color?: string; bg?: string; size?: number; maxWidth?: number } = {},
): THREE.Sprite {
  const size = opts.size ?? 28;
  const maxWidth = opts.maxWidth ?? 520;
  const measure = document.createElement('canvas').getContext('2d');
  if (measure === null) throw new Error('2d canvas unavailable');
  measure.font = `bold ${size}px "Tahoma", sans-serif`;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line.length === 0 ? w : `${line} ${w}`;
    if (measure.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  lines.push(line);
  const width = Math.min(maxWidth, Math.max(...lines.map((l) => measure.measureText(l).width))) + 24;
  const height = lines.length * (size + 6) + 14;
  const c = document.createElement('canvas');
  c.width = Math.ceil(width);
  c.height = Math.ceil(height);
  const g = c.getContext('2d');
  if (g === null) throw new Error('2d canvas unavailable');
  if (opts.bg !== undefined) {
    g.fillStyle = opts.bg;
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 10);
    g.fill();
  }
  g.font = `bold ${size}px "Tahoma", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.fillStyle = opts.color ?? '#fff';
  lines.forEach((l, i) => {
    if (opts.bg === undefined) g.strokeText(l, c.width / 2, 8 + i * (size + 6));
    g.fillText(l, c.width / 2, 8 + i * (size + 6));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.0045;
  sprite.scale.set(c.width * scale, c.height * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
