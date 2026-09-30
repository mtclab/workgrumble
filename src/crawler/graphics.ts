import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * The render pipeline: ambient occlusion (so the blocks sit in the world),
 * bloom (so the fluorescent tubes hum), a "mood" pass that is how your body
 * feels (drink wobble, caffeine jitter, the tunnel of low sanity, the grey of
 * a crash, the white glow of the king of cans), and anti-aliasing. Every
 * expensive stage follows the quality setting.
 */

export type Quality = 'low' | 'medium' | 'high';

export interface Mood {
  /** 0..1+ drink wobble and blur. */
  drunk: number;
  /** 0..1 caffeine jitter. */
  jitter: number;
  /** 0..1 how close to a burnout (tunnel vision). */
  stress: number;
  /** 0..1 hangover (green, flat). */
  hangover: number;
  /** 0..1 caffeine crash (grey, heavy). */
  crash: number;
  /** 0..1 White Monster (bright, cool, clear). */
  ultra: number;
  /** 0..1 damage flash. */
  hurt: number;
}

const MoodShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    drunk: { value: 0 },
    jitter: { value: 0 },
    stress: { value: 0 },
    hangover: { value: 0 },
    crash: { value: 0 },
    ultra: { value: 0 },
    hurt: { value: 0 },
    grain: { value: 0.03 },
    tint: { value: new THREE.Color(1, 1, 1) },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, drunk, jitter, stress, hangover, crash, ultra, hurt, grain, aspect;
    uniform vec3 tint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      // Drink: the room breathes and slides.
      float d = clamp(drunk, 0.0, 2.5);
      uv += vec2(sin(uv.y * 9.0 + time * 1.3), cos(uv.x * 7.0 + time * 1.1)) * 0.0035 * d;
      // Caffeine: a fine high-frequency shake.
      uv += vec2(hash(vec2(time, 1.0)) - 0.5, hash(vec2(1.0, time)) - 0.5) * 0.004 * jitter;
      vec2 c = uv - 0.5;
      c.x *= aspect;
      float r = length(c);
      // Chromatic split: drink and jitters both pull the colours apart.
      float split = 0.0015 * d + 0.002 * jitter + 0.004 * hurt;
      vec2 dir = normalize(c + 1e-5) * split;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      // Drunk double vision.
      if (d > 0.6) {
        vec3 ghost = texture2D(tDiffuse, uv + vec2(0.012 * sin(time * 0.7), 0.004) * (d - 0.6)).rgb;
        col = mix(col, ghost, 0.3 * clamp(d - 0.6, 0.0, 1.0));
      }
      // Grading.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(luma), 0.55 * crash + 0.35 * hangover);
      col *= mix(vec3(1.0), vec3(0.85, 1.05, 0.8), hangover * 0.6);
      col = mix(col, col * vec3(0.95, 1.0, 1.08) + 0.04, ultra * 0.6);
      col *= tint;
      // Warm tipsy glow.
      col *= mix(vec3(1.0), vec3(1.08, 1.0, 0.9), clamp(d, 0.0, 1.0) * 0.5);
      // Vignette: always a little; a tunnel when you are close to burning out.
      float vig = smoothstep(0.35 + 0.5 * (1.0 - stress) - 0.2 * crash, 1.15, r * (1.0 + stress * 0.6));
      col *= 1.0 - vig * (0.35 + 0.55 * stress);
      col = mix(col, vec3(0.6, 0.0, 0.0), vig * hurt * 0.6);
      // Film grain, so the flat walls are never quite flat.
      col += (hash(vUv * 900.0 + time) - 0.5) * grain * (0.25 + dot(col, vec3(0.333)));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Pipeline {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly mood: ShaderPass;
  private gtao: GTAOPass | null = null;
  private aa: SMAAPass | FXAAPass | null = null;
  private readonly output: OutputPass;
  private quality: Quality = 'high';

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.55, 0.82);
    this.mood = new ShaderPass(MoodShader);
    this.output = new OutputPass();
  }

  /** Rebuild the pass chain for a quality level. */
  configure(quality: Quality, bloom: boolean): void {
    this.quality = quality;
    const c = this.composer;
    while (c.passes.length > 1) c.removePass(c.passes[c.passes.length - 1] as never);
    this.gtao?.dispose();
    this.gtao = null;
    this.aa?.dispose();
    this.aa = null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (quality === 'high') {
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      // Ambient occlusion is soft by nature, so it is worked out at half
      // resolution and blended over the full frame: measured on a desktop GPU
      // it was most of the high setting's GPU time at full size. The composer
      // sizes every pass to the canvas, so the halving happens here, and the
      // denoise radius (in the AO buffer's pixels) halves with it to blur the
      // same stretch of screen.
      const fullSize = gtao.setSize.bind(gtao);
      gtao.setSize = (width: number, height: number): void => fullSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, rings: 2, samples: 8 });
      c.addPass(gtao);
      this.gtao = gtao;
    }
    this.bloom.enabled = bloom;
    c.addPass(this.bloom);
    c.addPass(this.mood);
    c.addPass(this.output);
    if (quality === 'high') this.aa = new SMAAPass();
    else if (quality === 'medium') this.aa = new FXAAPass();
    if (this.aa !== null) c.addPass(this.aa);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.uniform('aspect').value = w / Math.max(1, h);
  }

  private uniform(name: string): THREE.IUniform {
    const u = this.mood.uniforms[name];
    if (u === undefined) throw new Error(`mood uniform ${name}`);
    return u;
  }

  setMood(m: Mood, time: number, tint: THREE.Color): void {
    this.uniform('time').value = time;
    this.uniform('drunk').value = m.drunk;
    this.uniform('jitter').value = m.jitter;
    this.uniform('stress').value = m.stress;
    this.uniform('hangover').value = m.hangover;
    this.uniform('crash').value = m.crash;
    this.uniform('ultra').value = m.ultra;
    this.uniform('hurt').value = m.hurt;
    this.uniform('grain').value = this.quality === 'low' ? 0 : 0.02;
    (this.uniform('tint').value as THREE.Color).copy(tint);
  }

  render(): void {
    this.composer.render();
  }
}

/**
 * A normal map from a painted canvas: its brightness read as height. Walls,
 * carpet and ceilings then catch the light like surfaces rather than prints.
 */
export function normalMapFrom(src: THREE.CanvasTexture | null, strength = 2, invert = false): THREE.CanvasTexture | null {
  const img = src?.image;
  if (img === undefined || typeof document === 'undefined') return null;
  const w = img.width;
  const h = img.height;
  const ctx = img.getContext('2d');
  if (ctx === null) return null;
  const data = ctx.getImageData(0, 0, w, h).data;
  const height = (x: number, y: number): number => {
    const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    const v = ((data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114) / 255;
    return invert ? 1 - v : v;
  };
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (octx === null) return null;
  const img2 = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img2.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      img2.data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      img2.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      img2.data[i + 3] = 255;
    }
  }
  octx.putImageData(img2, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.copy(src?.repeat ?? new THREE.Vector2(1, 1));
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
