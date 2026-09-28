import * as THREE from 'three';
import { fx } from './rng';

/**
 * One pooled particle cloud for the whole scene: paper confetti when a
 * problem is resolved, sparks off a hit, steam off the kiuas, dust drifting
 * under the fluorescent tubes, and the white shimmer of an ascended IT worker.
 * CPU-simulated, drawn as a single Points object.
 */

export type Burst = 'confetti' | 'sparks' | 'steam' | 'dust' | 'aura' | 'smoke' | 'splash' | 'heal' | 'gold';

interface Style {
  readonly colors: readonly number[];
  readonly size: [number, number];
  readonly life: [number, number];
  readonly speed: [number, number];
  readonly gravity: number;
  readonly drag: number;
  readonly up: number;
  readonly additive: boolean;
}

const STYLES: Record<Burst, Style> = {
  confetti: { colors: [0xffffff, 0xf4f4e8, 0xfff27a, 0x9fd8ff], size: [0.1, 0.18], life: [0.8, 1.6], speed: [2, 5], gravity: 5, drag: 1.8, up: 3, additive: false },
  sparks: { colors: [0xffe28a, 0xffb040, 0xffffff], size: [0.05, 0.09], life: [0.2, 0.45], speed: [4, 9], gravity: 9, drag: 2, up: 1.5, additive: true },
  steam: { colors: [0xf2f6ff, 0xe0e8f2], size: [0.5, 0.9], life: [1.2, 2.2], speed: [0.3, 1], gravity: -1.2, drag: 1, up: 0.8, additive: false },
  dust: { colors: [0xfff4d8, 0xdfe8ff], size: [0.03, 0.05], life: [4, 8], speed: [0.02, 0.12], gravity: -0.02, drag: 0.2, up: 0, additive: true },
  aura: { colors: [0xffffff, 0xe8f4ff], size: [0.06, 0.12], life: [0.6, 1.1], speed: [0.3, 1], gravity: -2, drag: 1, up: 1, additive: true },
  smoke: { colors: [0x9a9a9a, 0x7a7a7a], size: [0.4, 0.8], life: [1.5, 3], speed: [0.2, 0.6], gravity: -0.6, drag: 0.6, up: 0.5, additive: false },
  splash: { colors: [0xbfe6ff, 0xffffff, 0x8fc8f0], size: [0.08, 0.14], life: [0.5, 0.9], speed: [2, 4.5], gravity: 9, drag: 1, up: 4, additive: false },
  heal: { colors: [0x7dff9a, 0xc8ffd0], size: [0.07, 0.12], life: [0.7, 1.2], speed: [0.3, 1], gravity: -1.8, drag: 1, up: 0.8, additive: true },
  gold: { colors: [0xffd700, 0xfff08a], size: [0.08, 0.14], life: [0.6, 1.2], speed: [2, 5], gravity: 6, drag: 1.5, up: 3, additive: true },
};

const MAX = 2400;

export class Particles {
  readonly points: THREE.Points;
  readonly additive: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly style: Uint8Array;
  private readonly add: Uint8Array;
  private readonly geoms: [THREE.BufferGeometry, THREE.BufferGeometry];
  private cursor = 0;
  /** 0..1: fewer particles on low quality. */
  density = 1;
  private readonly styleIds = Object.keys(STYLES) as Burst[];

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.style = new Uint8Array(MAX);
    this.add = new Uint8Array(MAX);
    const make = (): THREE.BufferGeometry => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX), 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX), 1));
      g.setDrawRange(0, 0);
      return g;
    };
    this.geoms = [make(), make()];
    const mat = (additive: boolean): THREE.ShaderMaterial => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexColors: true,
      uniforms: { scale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.15, d);
          gl_FragColor = vec4(vColor, vAlpha * soft);
        }`,
    });
    this.points = new THREE.Points(this.geoms[0], mat(false));
    this.additive = new THREE.Points(this.geoms[1], mat(true));
    for (const p of [this.points, this.additive]) {
      p.frustumCulled = false;
      p.renderOrder = 5;
      scene.add(p);
    }
  }

  setViewport(height: number): void {
    for (const p of [this.points, this.additive]) {
      const u = (p.material as THREE.ShaderMaterial).uniforms.scale;
      if (u !== undefined) u.value = height * 0.6;
    }
  }

  emit(kind: Burst, at: THREE.Vector3, count: number, spread = 0.3): void {
    const st = STYLES[kind];
    const n = Math.max(1, Math.round(count * this.density));
    const color = new THREE.Color();
    const sid = this.styleIds.indexOf(kind);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const i3 = i * 3;
      this.pos[i3] = at.x + fx.range(-spread, spread);
      this.pos[i3 + 1] = at.y + fx.range(-spread, spread) * 0.5;
      this.pos[i3 + 2] = at.z + fx.range(-spread, spread);
      const a = fx.range(0, Math.PI * 2);
      const e = fx.range(-0.3, 1);
      const sp = fx.range(st.speed[0], st.speed[1]);
      this.vel[i3] = Math.cos(a) * Math.cos(e) * sp;
      this.vel[i3 + 1] = Math.sin(e) * sp + st.up;
      this.vel[i3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      color.setHex(st.colors[k % st.colors.length] ?? 0xffffff);
      this.col[i3] = color.r;
      this.col[i3 + 1] = color.g;
      this.col[i3 + 2] = color.b;
      this.size[i] = fx.range(st.size[0], st.size[1]);
      this.max[i] = fx.range(st.life[0], st.life[1]);
      this.life[i] = this.max[i];
      this.style[i] = sid;
      this.add[i] = st.additive ? 1 : 0;
    }
  }

  update(dt: number): void {
    const out: [number, number] = [0, 0];
    const attrs = this.geoms.map((g) => ({
      p: g.getAttribute('position') as THREE.BufferAttribute,
      c: g.getAttribute('color') as THREE.BufferAttribute,
      s: g.getAttribute('aSize') as THREE.BufferAttribute,
      a: g.getAttribute('aAlpha') as THREE.BufferAttribute,
    }));
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i] as number;
      if (l <= 0) continue;
      const left = l - dt;
      this.life[i] = left;
      if (left <= 0) continue;
      const st = STYLES[this.styleIds[this.style[i] as number] ?? 'dust'];
      const i3 = i * 3;
      const drag = Math.max(0, 1 - st.drag * dt);
      this.vel[i3] = (this.vel[i3] as number) * drag;
      this.vel[i3 + 1] = (this.vel[i3 + 1] as number) * drag - st.gravity * dt;
      this.vel[i3 + 2] = (this.vel[i3 + 2] as number) * drag;
      this.pos[i3] = (this.pos[i3] as number) + (this.vel[i3]) * dt;
      this.pos[i3 + 1] = Math.max(0.02, (this.pos[i3 + 1] as number) + (this.vel[i3 + 1] as number) * dt);
      this.pos[i3 + 2] = (this.pos[i3 + 2] as number) + (this.vel[i3 + 2] as number) * dt;
      const which = this.add[i] as 0 | 1;
      const o = out[which];
      const at = attrs[which];
      if (at === undefined) continue;
      const t = left / (this.max[i] as number);
      at.p.setXYZ(o, this.pos[i3], this.pos[i3 + 1] as number, this.pos[i3 + 2] as number);
      at.c.setXYZ(o, this.col[i3] as number, this.col[i3 + 1] as number, this.col[i3 + 2] as number);
      at.s.setX(o, (this.size[i] as number) * (st.gravity < 0 ? 1.6 - t * 0.6 : 1));
      at.a.setX(o, Math.min(1, t * 2) * (st.additive ? 0.9 : 0.8));
      out[which] = o + 1;
    }
    this.geoms.forEach((g, k) => {
      g.setDrawRange(0, out[k as 0 | 1]);
      for (const name of ['position', 'color', 'aSize', 'aAlpha']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    });
  }

  clear(): void {
    this.life.fill(0);
  }
}
