import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hud, type HudFrame } from './hud';
import { derive, newSave } from './state';

class Node {
  className = '';
  textContent = '';
  children: Node[] = [];
  style = { setProperty: () => undefined };
  dataset = {};
  classList = { contains: () => false, toggle: () => undefined, add: () => undefined, remove: () => undefined };
  append(...children: Node[]): void { this.children.push(...children); }
  replaceChildren(...children: Node[]): void { this.children = children; }
  getContext(): object { return {}; }
}

function host(): { hud: Hud; effects: Node; frame: HudFrame } {
  vi.stubGlobal('document', { createElement: () => new Node() });
  const drawing = Hud.prototype as unknown as { drawFace: () => void; drawMini: () => void };
  vi.spyOn(drawing, 'drawFace').mockImplementation(() => undefined);
  vi.spyOn(drawing, 'drawMini').mockImplementation(() => undefined);
  const parent = new Node();
  const hud = new Hud(parent as unknown as HTMLElement);
  const effects = parent.children[0]!.children.find((n) => n.className === 'hud-effects')!;
  const save = newSave(1);
  const frame: HudFrame = {
    save, d: derive(save), px: 0, pz: 0, yaw: 0, level: {} as HudFrame['level'], actors: [], prompt: '', effects: ['Sneaking', 'Sisu'], boss: null, face: 'normal', ammoText: 'Melee', floorName: 'Office', elevatorOpen: false, title: 'Trainee', spellText: '', abilityText: '', hidden: null, bandLabel: 'Sober', promille: '0', bacForecast: 0, peakZone: [26, 36], caffeine: 0, caffeineLabel: 'Decaf', caffeineZone: [50, 300], crash: 0, questLines: [], overload: 0, markers: [], charge: 0, blocking: false, dry: false, oncall: null, hiddenMeters: [],
  };
  return { hud, effects, frame };
}

describe('HUD effect labels', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('unchanged effects across two updates keep the same nodes', () => {
    const { hud, effects, frame } = host();
    hud.update(frame, 0.016);
    const labels = [...effects.children];
    hud.update({ ...frame, effects: [...frame.effects] }, 0.016);
    expect(effects.children[0], 'unchanged effect node survives').toBe(labels[0]);
    expect(effects.children[1]).toBe(labels[1]);
    hud.update({ ...frame, effects: ['Sisu'] }, 0.016);
    expect(effects.children.map((n) => n.textContent)).toEqual(['Sisu']);
    hud.update({ ...frame, effects: [] }, 0.016);
    expect(effects.children).toEqual([]);
  });

  it('changing the contents of the same effect array updates the shown labels', () => {
    const { hud, effects, frame } = host();
    const labels = ['Sneaking'];
    hud.update({ ...frame, effects: labels }, 0.016);
    labels[0] = 'Sisu';
    hud.update({ ...frame, effects: labels }, 0.016);
    expect(effects.children[0]!.textContent).toBe('Sisu');
  });
});


describe('learned patrol routes on the automap', () => {
  it('draws the HUD-visible route in amber for the player', () => {
    const paths: { color: string; points: number[][] }[] = [];
    let points: number[][] = [];
    const ctx = {
      strokeStyle: '',
      fillRect: () => undefined, fillText: () => undefined,
      beginPath: () => { points = []; },
      moveTo: (x: number, z: number) => { points.push([x, z]); },
      lineTo: (x: number, z: number) => { points.push([x, z]); },
      stroke: () => { paths.push({ color: ctx.strokeStyle, points: [...points] }); },
      save: () => undefined, translate: () => undefined, rotate: () => undefined,
      closePath: () => undefined, fill: () => undefined, restore: () => undefined,
    };
    const hud = Object.create(Hud.prototype) as { drawMap: (frame: HudFrame) => void };
    Reflect.set(hud, 'mapCtx', ctx);
    const frame = {
      level: { w: 4, h: 4, seen: new Uint8Array(16), floor: new Uint8Array(16), rooms: [], interactables: [] },
      markers: [], px: 1, pz: 1, yaw: 0,
      patrolRoutes: [[{ x: 1, z: 1 }, { x: 3, z: 1 }]],
    } as unknown as HudFrame;
    hud.drawMap(frame);
    expect(paths).toEqual([{ color: '#ffb020', points: [[80, 80], [240, 80]] }]);
  });
});
