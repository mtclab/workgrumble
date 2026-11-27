import * as THREE from 'three';

type AnyMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/** Free every geometry (and optionally material + map) under `root`. */
export function disposeTree(root: THREE.Object3D, materials: boolean): void {
  const textures = new Set<unknown>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as AnyMesh;
    // Shared (cached) geometry and materials belong to everyone; leave them.
    if (mesh.userData.shared === true) return;
    mesh.geometry.dispose();
    if (!materials) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m.userData.shared === true || m.userData.cached === true) continue;
      for (const value of Object.values(m)) {
        if (!(value instanceof THREE.Texture) || value.userData.cached === true || value.userData.shared === true || textures.has(value)) continue;
        textures.add(value);
        value.dispose();
      }
      m.dispose();
    }
  });
}
