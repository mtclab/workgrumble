import { afterEach, describe, expect, it, vi } from 'vitest';
import { Compass, type CompassMarker } from './compass';

class Node {
  className = '';
  innerHTML = '';
  title = '';
  clientWidth = 560;
  style = { display: '', left: '', color: '' };
  children: Node[] = [];
  append(child: Node): void { this.children.push(child); }
}

function host(width = 560): { compass: Compass; shown: () => Node[] } {
  vi.stubGlobal('document', { createElement: () => { const node = new Node(); node.clientWidth = width; return node; } });
  const parent = new Node();
  const compass = new Compass(parent as unknown as HTMLElement);
  const strip = parent.children[0]!.children[0]!;
  return { compass, shown: () => strip.children.filter((n) => n.className.startsWith('compass-marker') && n.style.display !== 'none') };
}

const marker = (x: number, z: number): CompassMarker => ({ x, z, color: '#fff', icon: '!', label: 'Objective' });

describe('compass readability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('overlapping objectives show the nearest distance without running labels together', () => {
    const { compass, shown } = host();
    compass.update(0, 0, 0, [marker(0, -41), marker(0, -6)]);
    expect(shown(), 'overlapping distance labels').toHaveLength(1);
    expect(shown()[0]!.innerHTML).toBe('!<small>6m</small>');
    compass.update(0, 0, 0, [marker(0, -6), marker(6, -6)]);
    expect(shown()).toHaveLength(2);
  });

  it('pinned objectives keep their distance inside a narrow strip and share no label space', () => {
    const { compass, shown } = host(240);
    compass.update(0, 0, 0, [marker(0, 6), marker(0, 41), marker(-100, 0)]);
    const labels = shown();
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(parseFloat(label.style.left)).toBeGreaterThan(0);
    for (const label of labels) expect(parseFloat(label.style.left)).toBeLessThan(100);
  });
});
