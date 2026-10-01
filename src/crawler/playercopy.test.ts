import { afterEach, expect, it, vi } from 'vitest';
import { Os, type OsHost } from './os';
import { treePerk } from './perks';
import { DEFAULT_SETTINGS } from './settings';
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

function rendered(method: 'renderCharacter' | 'renderHelp'): string {
  vi.stubGlobal('document', { createElement: () => new TextNode(), createTextNode: (t: string) => t });
  const save = newSave(7);
  const os = Object.create(Os.prototype) as Os;
  Object.assign(os, { host: { save, settings: DEFAULT_SETTINGS, derived: () => derive(save), title: 'Trainee' } as OsHost });
  const body = new TextNode();
  (os as unknown as Record<typeof method, (b: HTMLElement) => void>)[method](body as unknown as HTMLElement);
  return body.text;
}

afterEach(() => vi.unstubAllGlobals());

it('the character sheet and Parkour say dodge is a chance to avoid projectiles', () => {
  expect(rendered('renderCharacter')).toContain('Projectile dodge chance');
  expect(treePerk('parkour')!.ranks[0]!.desc).toContain('chance to dodge projectiles');
});
