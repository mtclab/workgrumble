import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeTree } from './dispose';

describe('floor texture disposal', () => {
  it('unloading frees Standard material maps and normal maps but keeps cached textures', () => {
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const roughnessMap = new THREE.Texture();
    const cached = new THREE.Texture();
    cached.userData.cached = true;
    const shared = new THREE.Texture();
    shared.userData.shared = true;
    const disposed = [map, normalMap, roughnessMap, cached, shared].map((t) => vi.spyOn(t, 'dispose'));
    const material = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, emissiveMap: cached, metalnessMap: shared });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
    disposeTree(root, true);
    expect(disposed.map((f) => f.mock.calls.length), 'owned texture disposal counts').toEqual([1, 1, 1, 0, 0]);
  });

  it('shared meshes keep their textures for the next floor', () => {
    const map = new THREE.Texture();
    const disposed = vi.spyOn(map, 'dispose');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map }));
    mesh.userData.shared = true;
    disposeTree(mesh, true);
    expect(disposed).not.toHaveBeenCalled();
  });
});
