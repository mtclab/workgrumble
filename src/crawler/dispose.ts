import * as THREE from 'three';

type AnyMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/** Free every geometry (and optionally material + map) under `root`. */
export function disposeTree(root: THREE.Object3D, materials: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as AnyMesh;
    // Shared (cached) geometry and materials belong to everyone; leave them.
    if (mesh.userData.shared === true) return;
    mesh.geometry.dispose();
    if (!materials) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshBasicMaterial) m.map?.dispose();
      m.dispose();
    }
  });
}
