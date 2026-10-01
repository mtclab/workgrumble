import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { Os, type OsHost } from './os';
import { treePerk } from './perks';
import { HELLDESK_RELEASES } from './releases';
import { endingFor } from './rpg';
import { ACHIEVEMENTS, TIPS } from './upgrades';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { Game } from './game';
import { SteamClock } from './suo';
import { Vision } from './vision';
import * as THREE from 'three';
import { derive, newSave } from './state';

class TextNode {
  children: (TextNode | string)[] = [];
  style = {};
  className = '';
  append(...children: (TextNode | string)[]): void { this.children.push(...children); }
  setAttribute(): void { /* attributes do not change the copy */ }
  addEventListener(): void { /* no clicks during rendering */ }
  get text(): string { return this.children.map((c) => typeof c === 'string' ? c : c.text).join(' '); }
}

function rendered(method: 'renderCharacter' | 'renderHelp', settings = DEFAULT_SETTINGS): string {
  vi.stubGlobal('document', { createElement: () => new TextNode(), createTextNode: (t: string) => t });
  const save = newSave(7);
  const os = Object.create(Os.prototype) as Os;
  Object.assign(os, { host: { save, settings, derived: () => derive(save), title: 'Trainee' } as OsHost });
  const body = new TextNode();
  (os as unknown as Record<typeof method, (b: HTMLElement) => void>)[method](body as unknown as HTMLElement);
  return body.text;
}

afterEach(() => vi.unstubAllGlobals());

it('the character sheet and Parkour say dodge is a chance to avoid projectiles', () => {
  expect(rendered('renderCharacter')).toContain('Projectile dodge chance');
  expect(treePerk('parkour')!.ranks[0]!.desc).toContain('chance to dodge projectiles');
});


it('release notes and the code map promise the seven playable endings', () => {
  const save = newSave(7);
  const base = { rung: 0, dependency: 0, warnings: 0, flags: {}, standing: save.standing };
  const endings = [
    base, { ...base, flags: { ceoDeal: true } }, { ...base, flags: { goldenParachute: true } },
    { ...base, dependency: 70 }, { ...base, flags: { whistleblower: true } },
    { ...base, rung: 10 }, { ...base, standing: { ...save.standing, kitchen: 50 } },
  ].map((e) => endingFor(e).title);
  expect(new Set(endings).size).toBe(7);
  expect(HELLDESK_RELEASES.flatMap((r) => r.lines).join(' ')).toContain('seven endings');
  expect(readFileSync('docs/HELLDESK.md', 'utf8')).toContain('one of seven endings');
});

it('the quest tip directs you to the offer marker', () => {
  expect(TIPS.quest).toContain('"!" over their head');
});

it('Hands Full describes being staffed at full capacity', () => {
  expect(ACHIEVEMENTS.find((a) => a.id === 'handsfull')!.desc).toContain('at full capacity');
});


it('a rebound block tip and Help Controls name the new keys', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, block: 'KeyB', interact: 'KeyZ', attack: 'KeyN' } };
  const tip = vi.fn();
  const g = Object.create(Game.prototype) as Game;
  Object.assign(g, { save: newSave(7), settings, hud: { tip } });
  g.tip('block');
  expect(tip).toHaveBeenCalledWith(expect.stringContaining('Hold B to block'));
  const help = rendered('renderHelp', settings);
  expect(help).toContain('B hold to block');
  expect(help).toContain('Z interact / talk');
  expect(help).toContain('N use tool');
});

it('the SUO hand prompt shows the rebound interact key', () => {
  const settings = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, interact: 'KeyZ' } };
  const line = vi.fn();
  const vision = Object.create(Vision.prototype) as Vision;
  Object.assign(vision, {
    g: { settings, player: { pos: new THREE.Vector3() }, look: vi.fn(), walk: vi.fn(), input: { hit: () => false }, hit: () => false },
    age: 4, noteT: 0, at: { x: 0, z: 0 }, clock: new SteamClock(),
    dress: { turnPeople: vi.fn() }, animateFigure: vi.fn(), veil: { set: line },
  });
  vision.update(0.1);
  expect(line).toHaveBeenCalledWith(expect.stringContaining('Give it your hand. (Z)'), expect.any(Number));
});
