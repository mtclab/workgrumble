import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { animateRig, buildRig, type Rig, viewmodelArm } from './characters';
import { disposeTree } from './dispose';
import { collideCircle, type Level, toCell, WALL_H } from './level';

export const EYE = 1.62;

const CLEARANCE: readonly (readonly [number, number])[] = [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]];

export const PLAYER_OUTFIT = {
  skin: 0xf1c9a5,
  hair: 0x4a3020,
  top: 0x2f4f7f,
  legs: 0x2a3f6a,
  lanyard: 0x2266cc,
  backpack: 0x3a3a3a,
  glasses: true,
  hairStyle: 'short' as const,
};

/** A prop you can hold: a mesh per tool, in both the hand and the viewmodel. */
export function toolMesh(id: string): THREE.Group {
  const g = new THREE.Group();
  const m = (c: number, e = 0, metal = 0.1, rough = 0.5): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, emissive: e, metalness: metal, roughness: rough });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const rb = (sx: number, sy: number, sz: number, r = 0.3): THREE.BufferGeometry => new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(sx, sy, sz) * r);
  switch (id) {
    case 'stapler': {
      add(rb(0.08, 0.035, 0.32), m(0x222222, 0, 0.3), 0, -0.02, 0.12);
      const arm = add(rb(0.075, 0.055, 0.3, 0.45), m(0xd0342c, 0, 0.1, 0.35), 0, 0.03, 0.12);
      arm.rotation.x = -0.06;
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.085, 10), m(0x999999, 0, 0.8, 0.3), 0, 0.01, -0.03).rotation.z = Math.PI / 2;
      break;
    }
    case 'keyboard':
      add(rb(0.17, 0.035, 0.62), m(0xd6d0bd), 0, 0, 0.28);
      for (let k = 0; k < 4; k++) add(rb(0.13, 0.018, 0.13, 0.4), m(0x8a8578), 0, 0.022, 0.08 + k * 0.14);
      break;
    case 'labelmaker':
      add(rb(0.1, 0.14, 0.24, 0.4), m(0xf2d024), 0, 0, 0.1);
      add(rb(0.08, 0.02, 0.1), m(0x111111, 0x0a2a0a), 0, 0.075, 0.12);
      add(rb(0.05, 0.015, 0.06), m(0xffffff), 0, 0.02, 0.25);
      break;
    case 'cat6': {
      const coil = add(new THREE.TorusGeometry(0.1, 0.02, 8, 20), m(0x3aa0ff), 0, 0, 0.05);
      coil.rotation.y = Math.PI / 2;
      add(new THREE.CapsuleGeometry(0.015, 0.48, 4, 8), m(0x3aa0ff), 0, 0, 0.35).rotation.x = Math.PI / 2;
      add(rb(0.04, 0.03, 0.05), m(0xdddddd, 0, 0, 0.2), 0, 0, 0.62);
      break;
    }
    case 'aircan':
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 16), m(0x3355aa, 0, 0.6, 0.3), 0, 0.05, 0.06);
      add(new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0x3355aa, 0, 0.6, 0.3), 0, 0.17, 0.06);
      add(new THREE.CapsuleGeometry(0.008, 0.14, 4, 6), m(0xff2222), 0, 0.2, 0.13).rotation.x = Math.PI / 2;
      break;
    case 'duck': {
      const tube = add(new THREE.CylinderGeometry(0.07, 0.08, 0.6, 16), m(0x555555, 0, 0.6, 0.35), 0, 0.02, 0.22);
      tube.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.07, 14, 10), m(0xffd400), 0, 0.12, 0.05);
      add(new THREE.SphereGeometry(0.045, 12, 8), m(0xffd400), 0, 0.19, 0.09);
      add(new THREE.ConeGeometry(0.02, 0.05, 8), m(0xff8c00), 0, 0.185, 0.14).rotation.x = Math.PI / 2;
      break;
    }
    case 'toner':
      add(rb(0.12, 0.12, 0.6), m(0x1a1a1a, 0, 0.2, 0.4), 0, 0, 0.25);
      add(rb(0.13, 0.04, 0.2), m(0xff7a00), 0, 0.07, 0.1);
      break;
    case 'powercycle': {
      const disc = add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 24), m(0x222222, 0x0a3a14, 0.4, 0.3), 0, 0, 0.12);
      disc.rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.07, 0.015, 8, 20, Math.PI * 1.6), m(0x7dff9a, 0x3a9a4a), 0, 0, 0.145);
      break;
    }
    case 'sudo':
      add(new THREE.CapsuleGeometry(0.025, 0.66, 4, 8), m(0x6b4a2a, 0, 0, 0.6), 0, 0, 0.3).rotation.x = Math.PI / 2;
      add(rb(0.22, 0.2, 0.34, 0.2), m(0xb04bff, 0x3a0a55, 0.5, 0.3), 0, 0, 0.66);
      break;
    default:
      add(rb(0.1, 0.1, 0.2), m(0xffffff), 0, 0, 0.1);
  }
  return g;
}

export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  velY = 0;
  onGround = true;
  readonly radius = 0.35;
  readonly rig: Rig;
  readonly model = new THREE.Group();
  private handTool: THREE.Group | null = null;
  readonly viewmodel = new THREE.Group();
  private vmTool: THREE.Group | null = null;
  private vmArm: THREE.Mesh;
  swing = 0;
  bob = 0;
  speedNow = 0;
  view: 'first' | 'third' = 'third';
  private camDist = 4;
  private toolId = '';
  /** 0..1, eased toward 1 while sneaking. */
  crouch = 0;
  crouching = false;
  outdoor = false;

  constructor(readonly camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.rig = buildRig(PLAYER_OUTFIT);
    this.model.add(this.rig.root);
    scene.add(this.model);
    // First-person arm: a voxel fist, cuff and sleeve in the IT polo, cut
    // from the same kit as everyone else and a little smaller than life.
    this.vmArm = viewmodelArm(PLAYER_OUTFIT);
    this.vmArm.scale.setScalar(0.62);
    this.vmArm.position.set(0, 0.015, 0.02);
    this.viewmodel.add(this.vmArm);
    this.viewmodel.position.set(0.3, -0.3, -0.48);
    camera.add(this.viewmodel);
  }

  setTool(id: string): void {
    if (id === this.toolId) return;
    this.toolId = id;
    if (this.handTool !== null) {
      this.rig.hand.remove(this.handTool);
      disposeTree(this.handTool, true);
    }
    if (this.vmTool !== null) {
      this.viewmodel.remove(this.vmTool);
      disposeTree(this.vmTool, true);
    }
    this.handTool = toolMesh(id);
    this.handTool.rotation.x = Math.PI / 2;
    this.handTool.scale.setScalar(1.3);
    this.rig.hand.add(this.handTool);
    this.vmTool = toolMesh(id);
    this.vmTool.rotation.y = Math.PI;
    this.vmTool.scale.setScalar(0.8);
    this.vmTool.position.set(0, 0.03, 0.02);
    this.viewmodel.add(this.vmTool);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** Move with desired planar direction (already in world space) and speed. */
  move(level: Level, wishX: number, wishZ: number, speed: number, jump: boolean, dt: number, jumpMult = 1): void {
    const len = Math.hypot(wishX, wishZ);
    let mx = 0;
    let mz = 0;
    if (len > 1e-4) {
      mx = (wishX / len) * speed;
      mz = (wishZ / len) * speed;
    }
    // Two passes so fast movement never tunnels a thin prop.
    for (let i = 0; i < 2; i++) {
      this.pos.x += (mx * dt) / 2;
      this.pos.z += (mz * dt) / 2;
      collideCircle(level, this.pos, this.radius);
    }
    if (jump && this.onGround) {
      this.velY = 6.2 * Math.sqrt(jumpMult);
      this.onGround = false;
    }
    this.velY -= 18 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.onGround = true;
    }
    this.speedNow = len > 1e-4 ? speed : 0;
  }

  update(level: Level, dt: number, wobble: number): void {
    this.swing = Math.max(0, this.swing - dt * 4);
    this.bob += dt * this.speedNow * 1.8;
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw + Math.PI;
    animateRig(this.rig, this.onGround ? this.speedNow : 0, dt, this.swing);
    this.rig.head.rotation.x = -this.pitch * 0.5;

    this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.rig.root.scale.y = 1 - this.crouch * 0.28;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + EYE - this.crouch * 0.55, this.pos.z);
    const bobY = Math.sin(this.bob * 2) * 0.04 * (this.onGround ? 1 : 0);
    // Drunk sway: a slow roll and a drift, the more the worse.
    const t = performance.now() / 1000;
    const wob = wobble > 0 ? Math.sin(t * 1.1) * 0.05 * wobble : 0;
    const drift = wobble > 0 ? Math.sin(t * 0.7) * 0.03 * wobble : 0;
    if (this.view === 'first') {
      this.model.visible = false;
      this.viewmodel.visible = true;
      this.camera.position.set(eye.x, eye.y + bobY, eye.z);
      this.camera.rotation.set(this.pitch + drift * 0.5, this.yaw + drift, wob, 'YXZ');
      this.viewmodel.position.set(0.24 + Math.sin(this.bob) * 0.015, -0.22 + bobY * 0.5, -0.55);
      this.viewmodel.rotation.set(0.15 - this.swing * 1.2, 0.25 + this.swing * 0.6, 0);
    } else {
      this.model.visible = true;
      this.viewmodel.visible = false;
      // Over-the-shoulder boom. The shoulder offset is walked out from the
      // eye first (a wall on your right pulls the camera in behind your
      // head), then the boom behind it is pulled in when a wall is in the way.
      const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const blockedAt = (p: THREE.Vector3): boolean => {
        if (p.y < 0.15 || (!this.outdoor && p.y > WALL_H - 0.15)) return true;
        // A little clearance all round, so the near plane never cuts a wall.
        for (const [ox, oz] of CLEARANCE) {
          const cx = toCell(p.x + ox);
          const cz = toCell(p.z + oz);
          const i = cz * level.w + cx;
          if (cx < 0 || cz < 0 || cx >= level.w || cz >= level.h || level.floor[i] !== 1 || level.opaque[i] === 1) return true;
        }
        return false;
      };
      const pivot = eye.clone();
      pivot.y += 0.3;
      if (blockedAt(pivot)) pivot.y = eye.y;
      for (let o = 0.1; o <= 0.95 + 1e-6; o += 0.1) {
        const p = pivot.clone().addScaledVector(right, 0.1);
        if (blockedAt(p)) break;
        pivot.copy(p);
      }
      let dist = 4.2;
      for (let d = 0.3; d <= 4.2; d += 0.15) {
        if (blockedAt(pivot.clone().addScaledVector(back, d))) {
          dist = Math.max(0.15, d - 0.3);
          break;
        }
      }
      this.camDist += (dist - this.camDist) * Math.min(1, dt * (dist < this.camDist ? 20 : 4));
      const cam = pivot.addScaledVector(back, this.camDist);
      this.camera.position.copy(cam);
      this.camera.rotation.set(this.pitch + drift * 0.5, this.yaw + drift, wob, 'YXZ');
      // Fade the model when the camera is inside the head.
      this.model.visible = this.camDist > 0.8;
    }
  }
}
