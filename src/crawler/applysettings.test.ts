import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { generateLevel } from './level';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, type Settings } from './settings';
import { newSave } from './state';
import { THEMES } from './textures';

vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * The real `Game.applySettings` on a Game with no renderer: the parts it
 * talks to that need a GPU or a page are stand-ins, the lights, the scene and
 * the level are real. This is what the first launch's pick calls on each step
 * down, on the title, where play's light pass does not run.
 */
function titleGame(quality: Settings['quality']): Game {
  vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 800, innerHeight: 450 });
  const theme = THEMES[1];
  if (theme === undefined) throw new Error('no theme');
  const level = generateLevel(1, theme, 77, true);
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 8; i++) lights.push(new THREE.PointLight(0xffffff, 14, 16, 1.4));
  const save = newSave(3);
  save.floor = 1;
  save.location = 'office';
  const g = Object.create(Game.prototype) as Game;
  const noop = (): void => undefined;
  Object.assign(g, {
    settings: { ...DEFAULT_SETTINGS, quality, keys: { ...DEFAULT_KEYS } },
    save,
    level,
    lights,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    renderer: { setPixelRatio: noop, setSize: noop, getPixelRatio: () => 1, shadowMap: { enabled: false } },
    pipeline: { configure: noop, resize: noop },
    particles: { setViewport: noop, density: 1 },
    compass: { visible: true },
    player: { view: 'third', pos: new THREE.Vector3(level.start.x, 0, level.start.z) },
    input: { bind: noop },
    hud: { flashes: true },
    lightIn: 0,
  });
  return g;
}

const lit = (g: Game): number => g.lights.filter((l) => l.visible).length;
const shadowing = (g: Game): number => g.lights.filter((l) => l.visible && l.castShadow).length;

describe('a quality change runs as that quality at once, on the title too', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stepping High down to Medium and Low puts out lights and their shadow there and then', () => {
    const g = titleGame('high');
    g.applySettings();
    expect(lit(g)).toBe(8);
    expect(shadowing(g)).toBe(1);
    g.settings.quality = 'medium';
    g.applySettings();
    expect(lit(g)).toBe(5);
    expect(shadowing(g)).toBe(0);
    g.settings.quality = 'low';
    g.applySettings();
    expect(lit(g)).toBe(3);
    expect(shadowing(g)).toBe(0);
    expect(g.renderer.shadowMap.enabled).toBe(false);
  });
});
