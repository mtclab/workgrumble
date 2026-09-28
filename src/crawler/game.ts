import * as THREE from 'three';
import { sfx } from './audio';
import { DEATH_LINES, HEALER_BARKS, RESOLVED_LINES } from './content/lines';
import { TICKETS } from './content/tickets';
import {
  type Actor,
  type ActorKind,
  createActor,
  disposeActor,
  type GameCtx,
  hurtActor,
  type ProjectileKind,
  type ProjectileSpec,
  say,
  updateActor,
} from './entities';
import { disposeTree } from './dispose';
import { Hud } from './hud';
import { Input } from './input';
import {
  ALL_ITEMS,
  AMMO,
  type AmmoKind,
  CONSUMABLES,
  itemById,
  PERKS,
  titleFor,
  type WeaponDef,
} from './items';
import {
  flowField,
  generateLevel,
  type Interactable,
  isSolidAt,
  type Level,
  lineOfSight,
  TILE,
  toCell,
  WALL_H,
} from './level';
import { type OsHost, Os } from './os';
import { EYE, Player } from './player';
import { fx, Rng } from './rng';
import {
  clearSave,
  derive,
  type Derived,
  grantXp,
  loadSave,
  newSave,
  perk,
  type QueuedTicket,
  type Quest,
  type SaveState,
  writeSave,
} from './state';
import { disposeSprite, textSprite, THEMES } from './textures';

interface Projectile {
  readonly kind: ProjectileKind;
  readonly mesh: THREE.Object3D;
  readonly vel: THREE.Vector3;
  readonly damage: number;
  readonly hostile: boolean;
  readonly owner: Actor | null;
  ttl: number;
  readonly splash: number;
  readonly gravity: number;
  readonly hitIds: Set<number>;
}

interface Pickup {
  readonly mesh: THREE.Object3D;
  readonly kind: 'ammo' | 'item';
  readonly id: string;
  readonly amount: number;
  t: number;
}

interface FxMesh {
  readonly mesh: THREE.Mesh;
  ttl: number;
  readonly life: number;
  readonly grow: number;
}

interface Floater {
  readonly sprite: THREE.Sprite;
  ttl: number;
}

type Screen = 'title' | 'play' | 'os' | 'paused' | 'dead' | 'win' | 'transition';

const QUEUE_MAX = 8;
const FINAL_FLOOR = 4;

export class Game implements GameCtx, OsHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly hud: Hud;
  readonly os: Os;
  readonly player: Player;
  save: SaveState;
  level!: Level;
  actors: Actor[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private fxMeshes: FxMesh[] = [];
  private floaters: Floater[] = [];
  private lights: THREE.PointLight[] = [];
  private hemi: THREE.HemisphereLight;
  private readonly overlay: HTMLDivElement;
  field: Int16Array = new Int16Array(0);
  private fieldIn = 0;
  private seenIn = 0;
  private lightIn = 0;
  private saveIn = 20;
  time = 0;
  private screen: Screen = 'title';
  private attackCd = 0;
  private shoveCd = 0;
  private rootT = 0;
  private rootReason = '';
  private coffeeT = 0;
  private wiredT = 0;
  private crashT = 0;
  private beerT = 0;
  private auraSlow = 0;
  private faceMood: 'normal' | 'hurt' | 'grin' | 'left' | 'right' = 'normal';
  private faceT = 0;
  private shakeAmt = 0;
  private boss: Actor | null = null;
  private elevatorOpen = false;
  private derivedCache: Derived;
  private currentTerminal: Interactable | null = null;
  private slackedTerminals = new Set<number>();
  private caughtPending = false;
  private fixCache = new WeakMap<QueuedTicket, string[]>();
  private prompt = '';
  private promptTarget: { kind: 'interact'; it: Interactable } | { kind: 'actor'; a: Actor } | null = null;
  private stepIn = 0;
  private last = performance.now();
  private readonly projGeo = new Map<ProjectileKind, [THREE.BufferGeometry, THREE.Material]>();
  private levelRng = new Rng(1);

  constructor(mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.append(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 120);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.2);
    this.scene.add(this.hemi);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffffff, 14, 16, 1.4);
      this.scene.add(l);
      this.lights.push(l);
    }
    const carry = new THREE.PointLight(0xfff0dd, 4, 8, 1.5);
    carry.position.set(0, 0.3, 0);
    this.camera.add(carry);

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(mount);
    this.os = new Os(mount, this);
    this.player = new Player(this.camera, this.scene);
    this.overlay = document.createElement('div');
    this.overlay.className = 'screen';
    mount.append(this.overlay);

    this.save = loadSave() ?? newSave(Date.now() >>> 0);
    this.derivedCache = derive(this.save);
    sfx.setVolume(this.save.volume);
    this.player.view = this.save.view;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === null && this.screen === 'play') this.showPause();
    });

    this.loadFloor(this.save.floor, true);
    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ floors

  floorName(): string {
    const theme = THEMES[this.save.floor % THEMES.length];
    const n = this.save.floor;
    return n > FINAL_FLOOR ? `Overtime ${n - FINAL_FLOOR} - ${theme?.name ?? ''}` : `Floor ${n === 0 ? 'B1' : n} - ${theme?.name ?? ''}`;
  }

  get floor(): number {
    return this.save.floor;
  }

  private loadFloor(n: number, fromSave: boolean): void {
    for (const a of this.actors) disposeActor(this.scene, a);
    this.actors = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    for (const f of this.floaters) {
      this.scene.remove(f.sprite);
      disposeSprite(f.sprite);
    }
    this.floaters = [];
    if (this.level !== undefined) {
      this.scene.remove(this.level.group);
      disposeTree(this.level.group, true);
    }

    this.save.floor = n;
    const theme = THEMES[n % THEMES.length] ?? THEMES[0];
    if (theme === undefined) throw new Error('no theme');
    const seed = (this.save.seed + n * 977) >>> 0;
    this.levelRng = new Rng(seed ^ 0x5bd1e995);
    this.level = generateLevel(n, theme, seed);
    this.scene.add(this.level.group);
    this.scene.fog = new THREE.Fog(theme.fog, 6, 42);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.setHex(theme.light);
    this.hemi.groundColor.setHex(theme.ambient);
    this.hemi.intensity = n === 0 ? 0.7 : 1.1;
    for (const l of this.lights) l.color.setHex(theme.light);

    for (const s of this.level.spawns) {
      if (s.kind === 'reply') {
        for (let i = 0; i < 3; i++) this.spawnAt(s.kind, s.x + fx.range(-1, 1), s.z + fx.range(-1, 1), s.room, false);
      } else {
        this.spawnAt(s.kind, s.x, s.z, s.room, false);
      }
    }
    const bossRoom = this.level.roomOf[toCell(this.level.bossSpawn.z) * this.level.w + toCell(this.level.bossSpawn.x)] ?? -1;
    this.boss = this.spawnAt('boss', this.level.bossSpawn.x, this.level.bossSpawn.z, bossRoom, false);
    this.elevatorOpen = false;
    this.slackedTerminals.clear();

    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    if (!fromSave) {
      this.save.queue = [];
    }
    this.save.quests = this.save.quests.filter((q) => q.kind !== 'boss' && q.kind !== 'printer' && q.kind !== 'deliver');
    delete this.save.consumables.laptop;
    const b = this.boss?.boss;
    if (b !== undefined && b !== null) {
      this.save.quests.unshift({
        id: this.save.nextQuestId++,
        kind: 'boss',
        title: `MAJOR INCIDENT: ${this.boss?.name ?? b.name}`,
        body: `${b.name} (${b.title}) is holding the corner office hostage. Resolve them to unlock the lift to the next floor.`,
        from: 'The Service Desk',
        goal: 1,
        progress: 0,
        reward: 0,
        xp: 0,
        done: false,
      });
    }
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    this.refreshDerived();
    this.markSeen();
    this.updateLights(true);
    sfx.setBoss(false);
    writeSave(this.save);
  }

  private spawnAt(kind: ActorKind | 'jam', x: number, z: number, room: number, aggro: boolean): Actor | null {
    if (isSolidAt(this.level, x, z) && kind !== 'boss') {
      // Try a nearby free spot.
      let placed = false;
      for (let t = 0; t < 12 && !placed; t++) {
        const nx = x + fx.range(-2, 2);
        const nz = z + fx.range(-2, 2);
        if (!isSolidAt(this.level, nx, nz)) {
          x = nx;
          z = nz;
          placed = true;
        }
      }
      if (!placed) return null;
    }
    const a = createActor(this, kind, x, z, room, this.levelRng, TICKETS.length);
    if (aggro) a.aggro = true;
    this.actors.push(a);
    return a;
  }

  spawn(kind: ActorKind, x: number, z: number, room: number): Actor | null {
    if (this.actors.filter((a) => !a.resolved && a.hostile).length > 70) return null;
    return this.spawnAt(kind, x, z, room, true);
  }

  // ------------------------------------------------------------------ screens

  private setOverlay(html: string, buttons: [string, () => void][]): void {
    this.overlay.innerHTML = html;
    const row = document.createElement('div');
    row.className = 'screen-buttons';
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.className = 'screen-btn';
      b.textContent = label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.unlock();
        fn();
      });
      row.append(b);
    }
    this.overlay.append(row);
    this.overlay.style.display = 'flex';
  }

  private hideOverlay(): void {
    this.overlay.style.display = 'none';
    this.overlay.replaceChildren();
  }

  private showTitle(): void {
    this.screen = 'title';
    const hasSave = loadSave() !== null && (this.save.floor > 0 || this.save.xp > 0 || this.save.level > 1);
    this.setOverlay(`
      <div class="title-logo">WORKGRUMBLE</div>
      <div class="title-sub">H E L L D E S K</div>
      <p class="title-blurb">You are <b>Pat Pending</b>, IT Support Analyst. The users have tickets. The tickets have users.
      Fight your way up five floors of Workgrumble Ltd, resolve everyone in person or at a terminal,
      requisition gear from Internal IT, dodge the meeting invites - and one day, buy that farm.</p>
      <div class="title-controls">
        <span><b>WASD</b> move</span><span><b>Mouse</b> look</span><span><b>LMB</b> fix (attack)</span><span><b>RMB</b> shove</span>
        <span><b>Shift</b> sprint</span><span><b>Space</b> jump</span><span><b>E</b> use / talk</span><span><b>Q</b> quick supplies</span>
        <span><b>1-9</b> tools</span><span><b>V</b> 1st/3rd person</span><span><b>Tab</b> backpack</span><span><b>M</b> map</span>
      </div>`, [
      ...(hasSave ? [[`Clock in (${this.floorName()}, Lv ${this.save.level})`, () => this.startPlay()] as [string, () => void]] : []),
      [hasSave ? 'New career' : 'Clock in', () => {
        if (hasSave) this.restart();
        else this.startPlay();
      }],
    ]);
  }

  private startPlay(): void {
    sfx.unlock();
    sfx.boot();
    this.hideOverlay();
    this.screen = 'play';
    this.input.enabled = true;
    this.input.requestLock();
    this.hud.toast(`${this.floorName()}. Find a computer (blue on the map) to work your ticket queue.`, 'info');
  }

  private showPause(): void {
    this.screen = 'paused';
    this.setOverlay(`<div class="title-logo small">PAUSED</div><p class="title-blurb">Taking a "comfort break". The SLA clocks are paused. Probably.</p>`, [
      ['Resume', () => this.resume()],
      ['Backpack & Career', () => this.openOs('pack')],
      ['Title screen', () => { writeSave(this.save); this.showTitle(); }],
    ]);
  }

  private resume(): void {
    this.hideOverlay();
    this.screen = 'play';
    this.input.enabled = true;
    this.input.requestLock();
  }

  private showDead(): void {
    this.screen = 'dead';
    this.input.releaseLock();
    sfx.error();
    const lost = Math.floor(this.save.rep * 0.25);
    this.save.rep -= lost;
    this.save.stats.burnouts++;
    this.setOverlay(`<div class="title-logo small dead">BURNOUT</div><p class="title-blurb">${fx.pick(DEATH_LINES)}</p>
      <p class="title-blurb">You lost ₡${lost} of Rep to the wellbeing webinar. Your queue was reassigned to someone else.</p>`, [
      ['Clock back in (restart floor)', () => {
        this.save.sanity = this.derivedCache.maxSanity;
        this.save.energy = 100;
        this.save.actionItems = 0;
        this.save.queue = [];
        this.rootT = 0;
        this.loadFloor(this.save.floor, false);
        this.resume();
      }],
    ]);
  }

  private showWin(): void {
    this.screen = 'win';
    this.input.releaseLock();
    this.save.won = true;
    writeSave(this.save);
    sfx.levelUp();
    const s = this.save.stats;
    this.setOverlay(`<div class="title-logo small">YOU BOUGHT THE FARM</div>
      <p class="title-blurb">Sir Reginald signs the cheque. You hand in your lanyard, walk out through reception
      (Linda cries, Brenda gives you the rest of the cake) and buy a smallholding with goats. The goats never raise tickets.</p>
      <p class="title-blurb">Field resolutions: ${s.resolvedField} · Desk resolutions: ${s.resolvedDesk} · SLA breaches: ${s.breaches} · Burnouts: ${s.burnouts} · Final title: ${titleFor(this.save.level)}</p>
      <p class="title-blurb">...Three weeks later, the goats' Wi-Fi goes down. Workgrumble calls. They are offering overtime.</p>`, [
      ['Accept the overtime (endless floors)', () => {
        this.transition(this.save.floor + 1);
      }],
      ['Retire (title screen)', () => this.showTitle()],
    ]);
  }

  private transition(next: number): void {
    this.screen = 'transition';
    this.input.releaseLock();
    sfx.ding();
    const theme = THEMES[next % THEMES.length];
    this.setOverlay(`<div class="lift"><div class="lift-num">${next === 0 ? 'B1' : next}</div>
      <div class="lift-name">${theme?.name ?? ''}</div>
      <p class="title-blurb">The lift plays a pan-pipe cover of a song you used to like.</p></div>`, [
      ['Step out', () => {
        this.loadFloor(next, false);
        this.resume();
        this.hud.toast(`Welcome to ${this.floorName()}.`, 'epic');
      }],
    ]);
  }

  private openOs(mode: 'desk' | 'itdesk' | 'pack'): void {
    this.screen = 'os';
    this.hideOverlay();
    this.input.enabled = false;
    this.input.releaseLock();
    if (mode === 'desk') sfx.boot();
    this.os.open(mode);
  }

  close(): void {
    this.os.hide();
    writeSave(this.save);
    this.currentTerminal = null;
    this.resume();
    if (this.caughtPending) {
      this.caughtPending = false;
      const back = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)).multiplyScalar(2.5);
      const m = this.spawn('manager', this.player.pos.x + back.x, this.player.pos.z + back.z, -1);
      if (m !== null) {
        say(m, 'Are those... CATS? My office. Now. Well, here. Now.', 4);
        this.hud.toast('CAUGHT! A manager saw the cat pictures. +1 action item.', 'bad');
        this.addActionItem(m.name);
      }
    }
  }

  restart(): void {
    clearSave();
    this.save = newSave(Date.now() >>> 0);
    this.fixCache = new WeakMap();
    this.os.hide();
    this.loadFloor(0, false);
    this.refreshDerived();
    this.startPlay();
  }

  // ------------------------------------------------------------------ loop

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.screen === 'play') {
      this.time += dt;
      this.update(dt);
    }
    sfx.music(this.screen === 'play' ? dt : 0);
    this.player.view = this.save.view;
    this.player.update(this.level, this.screen === 'play' ? dt : 0, this.beerT > 0 ? 1 : 0);
    if (this.shakeAmt > 0) {
      this.camera.position.x += fx.range(-1, 1) * this.shakeAmt * 0.15;
      this.camera.position.y += fx.range(-1, 1) * this.shakeAmt * 0.15;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2);
    }
    this.billboards();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    if (this.screen === 'play' || this.screen === 'os') {
      this.hud.update({
        save: this.save,
        d: this.derivedCache,
        px: this.player.pos.x,
        pz: this.player.pos.z,
        yaw: this.player.yaw,
        level: this.level,
        actors: this.actors,
        prompt: this.screen !== 'play' ? '' : this.input.locked ? this.prompt : 'Click to capture the mouse and look around',
        effects: this.effects(),
        boss: this.boss,
        face: this.faceMood,
        ammoText: this.ammoText(),
        floorName: this.floorName(),
        elevatorOpen: this.elevatorOpen,
        exitX: 0,
        exitZ: 0,
      }, dt);
    }
    this.hud.root.style.display = this.screen === 'play' || this.screen === 'os' ? 'block' : 'none';
    this.hud.crosshair.style.display = this.screen === 'play' ? 'block' : 'none';
  };

  private refreshDerived(): void {
    this.derivedCache = derive(this.save);
    this.player.setTool(this.derivedCache.weapon.id);
    if (this.save.sanity > this.derivedCache.maxSanity) this.save.sanity = this.derivedCache.maxSanity;
  }

  derived(): Derived {
    return this.derivedCache;
  }

  get playerPos(): THREE.Vector3 {
    return this.player.pos;
  }

  get stealth(): number {
    return this.derivedCache.stealth;
  }

  private update(dt: number): void {
    const inp = this.input;
    const s = this.save;
    const d = this.derivedCache;

    // Look.
    const sens = 0.0022 * s.mouseSens;
    this.player.yaw -= inp.mouseDX * sens;
    this.player.pitch = Math.max(-1.35, Math.min(1.35, this.player.pitch - inp.mouseDY * sens));

    if (inp.hit('KeyV')) {
      s.view = s.view === 'first' ? 'third' : 'first';
      this.hud.toast(s.view === 'first' ? 'First person' : 'Third person');
    }
    if (inp.hit('KeyM')) this.hud.mapOpen = !this.hud.mapOpen;
    if (inp.hit('Tab') || inp.hit('KeyI')) {
      this.openOs('pack');
      return;
    }
    if (inp.hit('Escape')) {
      this.input.releaseLock();
      this.showPause();
      return;
    }

    // Tool switching.
    const weapons = s.owned.filter((id) => itemById(id)?.slot === 'weapon');
    for (let i = 0; i < 9; i++) {
      if (inp.hit(`Digit${i + 1}`) && weapons[i] !== undefined) this.equip('weapon', weapons[i] ?? null);
    }
    if (inp.wheel !== 0 && weapons.length > 1) {
      const cur = weapons.indexOf(s.equipped.weapon);
      const next = weapons[(cur + inp.wheel + weapons.length) % weapons.length];
      if (next !== undefined) this.equip('weapon', next);
    }

    // Timers.
    this.attackCd -= dt;
    this.shoveCd -= dt;
    this.rootT = Math.max(0, this.rootT - dt);
    this.coffeeT = Math.max(0, this.coffeeT - dt);
    this.beerT = Math.max(0, this.beerT - dt);
    if (this.wiredT > 0) {
      this.wiredT -= dt;
      if (this.wiredT <= 0 && perk(s, 'caffeine') === 0) {
        this.crashT = 10;
        this.hud.toast('The Grumble Energy wears off. CRASH.', 'bad');
      }
    }
    this.crashT = Math.max(0, this.crashT - dt);
    this.faceT -= dt;
    if (this.faceT <= 0) this.faceMood = 'normal';

    // Manager auras.
    this.auraSlow = 0;
    for (const a of this.actors) {
      if (a.resolved || !a.aggro) continue;
      if (a.kind !== 'manager' && a.kind !== 'boss') continue;
      const dist = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z);
      if (dist < (a.kind === 'boss' ? 9 : 7)) this.auraSlow = Math.max(this.auraSlow, (a.kind === 'boss' ? 0.3 : 0.35) * (1 - d.auraResist));
    }

    // Movement.
    let fwd = 0;
    let side = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) fwd += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) fwd -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) side += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) side -= 1;
    const sy = Math.sin(this.player.yaw);
    const cy = Math.cos(this.player.yaw);
    const wx = -sy * fwd + cy * side;
    const wz = -cy * fwd - sy * side;
    let speed = 5.2 * d.speedMult;
    if (d.overEncumbered) speed *= 0.55;
    speed *= 1 - this.auraSlow;
    if (this.coffeeT > 0) speed *= 1.12;
    if (this.wiredT > 0) speed *= 1.3;
    if (this.crashT > 0) speed *= 0.75;
    const moving = fwd !== 0 || side !== 0;
    const sprint = inp.down('ShiftLeft') && moving && !d.overEncumbered && s.energy > 1;
    if (sprint) {
      speed *= 1.55;
      s.energy = Math.max(0, s.energy - 24 * dt);
    } else {
      s.energy = Math.min(100, s.energy + 11 * d.energyRegen * (this.coffeeT > 0 ? 1.8 : 1) * dt);
    }
    if (this.rootT > 0) speed = 0;
    this.player.move(this.level, wx, wz, speed, inp.hit('Space') && this.rootT <= 0, dt);
    if (moving && speed > 0 && this.player.onGround) {
      this.stepIn -= dt * speed;
      if (this.stepIn <= 0) {
        this.stepIn = 2.2;
        sfx.step();
      }
    }

    // Attacks.
    const atkRate = d.attackSpeed * (this.wiredT > 0 ? 1.3 : 1) * (this.crashT > 0 ? 0.8 : 1) * (this.auraSlow > 0 ? 0.85 : 1);
    if ((inp.lmb || inp.clicked()) && this.attackCd <= 0 && this.rootT <= 0) this.attack(d.weapon, atkRate);
    if (inp.rmb && this.shoveCd <= 0 && s.energy >= 8) this.shove();

    // Interaction.
    this.findPrompt();
    if (inp.hit('KeyE')) this.interact();
    if (inp.hit('KeyQ')) this.quickUse();

    // World.
    this.fieldIn -= dt;
    if (this.fieldIn <= 0) {
      this.fieldIn = 0.35;
      this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    }
    for (const a of this.actors) {
      const far = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) > 45;
      a.root.visible = !far;
      if (far && !a.aggro && !a.recruited) continue;
      updateActor(this, a, dt);
      if (a.hostile && !a.resolved && a.hp <= 0) this.resolveActor(a);
    }
    this.actors = this.actors.filter((a) => {
      if (a.resolved && a.removeIn <= 0) {
        disposeActor(this.scene, a);
        return false;
      }
      return true;
    });
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    // Ticket SLAs.
    for (const q of [...s.queue]) {
      q.sla -= dt;
      if (q.sla <= 0) this.breach(q);
    }

    if (this.boss !== null && this.boss.bossActive && !this.boss.resolved) sfx.setBoss(true);

    this.seenIn -= dt;
    if (this.seenIn <= 0) {
      this.seenIn = 0.25;
      this.markSeen();
    }
    this.updateLights(false);
    this.saveIn -= dt;
    if (this.saveIn <= 0) {
      this.saveIn = 20;
      writeSave(s);
    }

    if (s.sanity <= 0) this.showDead();
  }

  private effects(): string[] {
    const s = this.save;
    const d = this.derivedCache;
    const out: string[] = [];
    if (this.rootT > 0) out.push(`📅 ${this.rootReason} (${this.rootT.toFixed(1)}s)`);
    if (this.auraSlow > 0) out.push(`🐢 Manager nearby: -${Math.round(this.auraSlow * 100)}% speed`);
    if (d.overEncumbered) out.push('🎒 OVER-ENCUMBERED');
    if (s.actionItems > 0) out.push(`📋 ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''}`);
    if (this.coffeeT > 0) out.push(`☕ Coffee ${Math.ceil(this.coffeeT)}s`);
    if (this.wiredT > 0) out.push(`⚡ WIRED ${Math.ceil(this.wiredT)}s`);
    if (this.crashT > 0) out.push(`💤 Crash ${Math.ceil(this.crashT)}s`);
    if (this.beerT > 0) out.push(`🍺 Friday feeling ${Math.ceil(this.beerT)}s`);
    return out;
  }

  private ammoText(): string {
    const w = this.derivedCache.weapon;
    if (w.ammo !== undefined) return `${w.ammo}: ${this.save.ammo[w.ammo]}`;
    if (w.energyCost !== undefined) return `Energy ${Math.floor(this.save.energy)}/${w.energyCost} per use`;
    return 'Melee';
  }

  // ------------------------------------------------------------------ combat

  private aimPoint(): THREE.Vector3 {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const p = origin.clone();
    // Skip past the player in third person so we never aim at our own back.
    const startDist = this.save.view === 'third' ? origin.distanceTo(new THREE.Vector3(this.player.pos.x, origin.y, this.player.pos.z)) : 0;
    for (let t = startDist; t < 40; t += 0.25) {
      p.copy(origin).addScaledVector(dir, t);
      if (p.y < 0 || p.y > WALL_H) return p;
      const cx = toCell(p.x);
      const cz = toCell(p.z);
      const i = cz * this.level.w + cx;
      if (this.level.floor[i] !== 1 || this.level.opaque[i] === 1) return p;
      for (const a of this.actors) {
        if (!a.hostile || a.resolved) continue;
        const h = a.kind === 'boss' ? 3.8 : 2;
        if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < a.radius + 0.2 && p.y < h) return p;
      }
    }
    return p;
  }

  private attack(w: WeaponDef, rate: number): void {
    const s = this.save;
    if (w.ammo !== undefined && s.ammo[w.ammo] <= 0) {
      if (this.input.clicked()) {
        sfx.error();
        this.hud.toast(`Out of ${w.ammo}. Internal IT sells more (or pick them up).`, 'bad');
      }
      this.attackCd = 0.3;
      return;
    }
    if (w.energyCost !== undefined && s.energy < w.energyCost) {
      if (this.input.clicked()) {
        sfx.error();
        this.hud.toast('Not enough energy. Coffee?', 'bad');
      }
      this.attackCd = 0.3;
      return;
    }
    this.attackCd = w.cooldown / rate;
    this.player.swing = 1;
    const dmgMult = (this.wiredT > 0 ? 1.25 : 1) * (1 + (s.level - 1) * 0.04);
    const pp = this.player.pos;
    const yawFwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));

    switch (w.kind) {
      case 'melee': {
        sfx.swing();
        let hitAny = false;
        for (const a of this.actors) {
          if (!a.hostile || a.resolved) continue;
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          const dist = Math.hypot(dx, dz);
          if (dist > w.range + a.radius) continue;
          const dot = (dx * yawFwd.x + dz * yawFwd.z) / Math.max(dist, 1e-4);
          if (dist > 0.8 && Math.acos(Math.max(-1, Math.min(1, dot))) > (w.arc ?? 1) / 2 + 0.25) continue;
          if (!lineOfSight(this.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
          const knock = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(w.knockback ?? 2);
          hurtActor(this, a, w.damage * dmgMult, knock);
          hitAny = true;
          if (w.splash !== undefined) this.splash(a.pos, w.splash, w.damage * 0.5 * dmgMult, a.id);
        }
        if (hitAny) {
          sfx.hit();
          this.shake(0.15);
        }
        break;
      }
      case 'projectile':
      case 'lob': {
        if (w.ammo !== undefined) s.ammo[w.ammo] -= 1;
        const from = this.muzzle();
        const target = this.aimPoint();
        const dir = target.sub(from).normalize();
        dir.x += fx.range(-0.015, 0.015);
        dir.y += fx.range(-0.015, 0.015);
        if (w.kind === 'lob') dir.y += 0.18;
        dir.normalize();
        this.fire({
          kind: w.id === 'labelmaker' ? 'label' : w.id === 'toner' ? 'toner' : 'duck',
          from, dir, speed: w.speed ?? 20, damage: w.damage * dmgMult, hostile: false, owner: null,
          ...(w.kind === 'lob' ? { gravity: 12, splash: w.splash ?? 3 } : {}),
        });
        sfx.shoot();
        break;
      }
      case 'cone': {
        if (w.ammo !== undefined) s.ammo[w.ammo] -= 1;
        sfx.air();
        const fwd = this.camera.getWorldDirection(new THREE.Vector3());
        fwd.y = 0;
        fwd.normalize();
        for (const a of this.actors) {
          if (!a.hostile || a.resolved) continue;
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          const dist = Math.hypot(dx, dz);
          if (dist > w.range) continue;
          const dot = (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4);
          if (dot < Math.cos(w.arc ?? 0.5)) continue;
          if (!lineOfSight(this.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
          hurtActor(this, a, w.damage * dmgMult, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((w.knockback ?? 3) * 0.6));
        }
        const puff = this.muzzle().addScaledVector(fwd, 1.2 + fx.range(0, 2));
        this.fxBall(puff, 0xeef8ff, 0.25, 0.35, 3);
        break;
      }
      case 'nova': {
        s.energy -= w.energyCost ?? 0;
        sfx.nova();
        this.shake(0.4);
        const c = pp.clone();
        c.y = 1;
        this.fxRing(c, w.color, w.range);
        for (const a of this.actors) {
          if (!a.hostile || a.resolved) continue;
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          const dist = Math.hypot(dx, dz);
          if (dist > w.range || !lineOfSight(this.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
          hurtActor(this, a, w.damage * dmgMult * (1 - dist / (w.range * 2)), new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(8));
        }
        break;
      }
    }
  }

  private shove(): void {
    this.shoveCd = 0.8;
    this.save.energy -= 8;
    this.player.swing = 1;
    sfx.swing();
    const pp = this.player.pos;
    const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    for (const a of this.actors) {
      if (!a.hostile || a.resolved || a.kind === 'boss') continue;
      const dx = a.pos.x - pp.x;
      const dz = a.pos.z - pp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      if ((dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4) < 0.3) continue;
      a.push.add(new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(11));
      a.stunned = 0.5;
      a.cooldown = Math.max(a.cooldown, 0.8);
    }
  }

  private muzzle(): THREE.Vector3 {
    if (this.save.view === 'first') {
      const p = this.camera.getWorldPosition(new THREE.Vector3());
      const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
      return p.addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.15, 0));
    }
    const p = this.player.pos.clone();
    p.y += 1.3;
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    return p.addScaledVector(right, 0.35).addScaledVector(new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw)), 0.4);
  }

  private splash(at: THREE.Vector3, radius: number, dmg: number, skip = -1): void {
    for (const a of this.actors) {
      if (!a.hostile || a.resolved || a.id === skip) continue;
      const dist = Math.hypot(a.pos.x - at.x, a.pos.z - at.z);
      if (dist > radius) continue;
      hurtActor(this, a, dmg * (1 - dist / (radius * 1.5)), new THREE.Vector3(a.pos.x - at.x, 0, a.pos.z - at.z).normalize().multiplyScalar(5));
    }
  }

  private projMesh(kind: ProjectileKind): THREE.Mesh {
    let entry = this.projGeo.get(kind);
    if (entry === undefined) {
      const basic = (c: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c });
      switch (kind) {
        case 'ticket': entry = [new THREE.BoxGeometry(0.34, 0.03, 0.24), basic(0xffffff)]; break;
        case 'gold': entry = [new THREE.BoxGeometry(0.36, 0.03, 0.26), basic(0xffd700)]; break;
        case 'invite': entry = [new THREE.BoxGeometry(0.36, 0.36, 0.05), basic(0x4a8cff)]; break;
        case 'paper': entry = [new THREE.BoxGeometry(0.3, 0.02, 0.4), basic(0xf4f4f4)]; break;
        case 'label': entry = [new THREE.BoxGeometry(0.06, 0.02, 0.3), basic(0xfff27a)]; break;
        case 'toner': entry = [new THREE.SphereGeometry(0.12, 6, 4), basic(0x111111)]; break;
        case 'duck': entry = [new THREE.SphereGeometry(0.2, 8, 6), basic(0xffd400)]; break;
        case 'rtfm': entry = [new THREE.BoxGeometry(0.08, 0.08, 0.7), basic(0x40e0ff)]; break;
        case 'stun': entry = [new THREE.SphereGeometry(0.16, 8, 6), basic(0x8080ff)]; break;
        case 'po': entry = [new THREE.BoxGeometry(0.4, 0.3, 0.3), basic(0xb5835a)]; break;
        case 'laser': entry = [new THREE.BoxGeometry(0.1, 0.1, 1.4), basic(0xff2040)]; break;
        case 'ring': entry = [new THREE.SphereGeometry(0.22, 6, 4), basic(0xff8a00)]; break;
      }
      this.projGeo.set(kind, entry);
    }
    return new THREE.Mesh(entry[0], entry[1]);
  }

  fire(p: ProjectileSpec): void {
    const mesh = this.projMesh(p.kind);
    mesh.position.copy(p.from);
    mesh.lookAt(p.from.clone().add(p.dir));
    this.scene.add(mesh);
    this.projectiles.push({
      kind: p.kind,
      mesh,
      vel: p.dir.clone().multiplyScalar(p.speed),
      damage: p.damage,
      hostile: p.hostile,
      owner: p.owner,
      ttl: p.ttl ?? 3,
      splash: p.splash ?? 0,
      gravity: p.gravity ?? 0,
      hitIds: new Set(),
    });
    if (p.hostile && (p.kind === 'ticket' || p.kind === 'gold')) sfx.paper();
  }

  private updateProjectiles(dt: number): void {
    const pp = this.player.pos;
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.ttl -= dt;
      p.vel.y -= p.gravity * dt;
      const m = p.mesh;
      m.position.addScaledVector(p.vel, dt);
      if (p.kind === 'ticket' || p.kind === 'gold' || p.kind === 'paper') m.rotation.z += dt * 12;
      if (p.kind === 'invite') m.rotation.y += dt * 6;
      let dead = p.ttl <= 0;
      const pos = m.position;
      const cx = toCell(pos.x);
      const cz = toCell(pos.z);
      const idx = cz * this.level.w + cx;
      const inWall = cx < 0 || cz < 0 || cx >= this.level.w || cz >= this.level.h || this.level.floor[idx] !== 1
        || (this.level.opaque[idx] === 1) || (this.level.solid[idx] === 1 && pos.y < 1.0);
      if (inWall || pos.y < 0.02 || pos.y > WALL_H) dead = true;

      if (!dead && p.hostile) {
        const dx = pos.x - pp.x;
        const dz = pos.z - pp.z;
        if (dx * dx + dz * dz < 0.45 * 0.45 + 0.1 && pos.y > pp.y && pos.y < pp.y + 2) {
          dead = true;
          this.projectileHitsPlayer(p);
        }
      } else if (!dead) {
        for (const a of this.actors) {
          if (!a.hostile || a.resolved || p.hitIds.has(a.id)) continue;
          const h = a.kind === 'boss' ? 3.8 : a.kind === 'reply' ? 1.6 : 2;
          const dx = pos.x - a.pos.x;
          const dz = pos.z - a.pos.z;
          if (dx * dx + dz * dz < (a.radius + 0.25) ** 2 && pos.y < h) {
            p.hitIds.add(a.id);
            if (p.kind === 'stun') a.stunned = 2.2;
            hurtActor(this, a, p.damage, p.vel.clone().setY(0).normalize().multiplyScalar(p.kind === 'duck' ? 4 : 1.5));
            sfx.hit();
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        if (p.splash > 0) {
          if (p.hostile) {
            const dist = Math.hypot(pos.x - pp.x, pos.z - pp.z);
            if (dist < p.splash && !p.hitIds.has(-1)) {
              this.hurtPlayer(p.damage * 0.8, p.owner, 'boss');
              if (p.kind === 'po') this.addActionItem('Procurement');
            }
          } else {
            this.splash(pos, p.splash, p.damage);
          }
          sfx.boom();
          this.fxBall(pos.clone(), p.kind === 'po' ? 0xb5835a : 0xffd400, 0.3, 0.45, p.splash * 1.4);
          this.shake(0.25);
        }
        this.scene.remove(m);
      } else {
        keep.push(p);
      }
    }
    this.projectiles = keep;
  }

  private projectileHitsPlayer(p: Projectile): void {
    switch (p.kind) {
      case 'ticket':
        this.hurtPlayer(p.damage, p.owner, 'ticket');
        if (p.owner !== null) this.enqueueTicket(p.owner, false);
        break;
      case 'gold':
        this.hurtPlayer(p.damage, p.owner, 'ticket');
        if (p.owner !== null && p.owner.kind !== 'boss') this.enqueueTicket(p.owner, true);
        break;
      case 'invite':
        this.hurtPlayer(p.damage, p.owner, 'meeting');
        if (!this.derivedCache.noRoot) {
          const subjects = ['Quick sync re: the sync', 'Stand-up (sit-down)', 'Lessons learned: lessons', 'Alignment on alignment', 'KPI deep dive', '1:1 (with 14 people)'];
          this.rootPlayer(2.2 / (1 + perk(this.save, 'teflon')), `In a meeting: "${fx.pick(subjects)}"`);
        }
        break;
      case 'po':
        p.hitIds.add(-1);
        this.hurtPlayer(p.damage, p.owner, 'boss');
        this.addActionItem('Procurement');
        break;
      default:
        this.hurtPlayer(p.damage, p.owner, p.owner?.kind === 'boss' ? 'boss' : 'ticket');
    }
  }

  hurtPlayer(amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura'): void {
    if (this.screen !== 'play') return;
    const d = this.derivedCache;
    let dmg = amount * (1 - d.armor);
    if (from !== null && (from.kind === 'boss' || from.kind === 'manager' || kind === 'boss')) dmg *= 1 - d.bossResist;
    this.save.sanity -= dmg;
    this.hud.flash(kind === 'meeting' ? 'meeting' : 'hurt');
    sfx.hurt();
    this.shake(Math.min(0.5, dmg / 30));
    this.faceT = 0.6;
    if (from !== null) {
      const dx = from.pos.x - this.player.pos.x;
      const dz = from.pos.z - this.player.pos.z;
      const rightX = Math.cos(this.player.yaw);
      const rightZ = -Math.sin(this.player.yaw);
      const side = dx * rightX + dz * rightZ;
      const fwdDot = -dx * Math.sin(this.player.yaw) - dz * Math.cos(this.player.yaw);
      this.faceMood = fwdDot > Math.abs(side) ? 'hurt' : side > 0 ? 'right' : 'left';
    } else {
      this.faceMood = 'hurt';
    }
  }

  healPlayer(amount: number, from: string): void {
    const d = this.derivedCache;
    const before = this.save.sanity;
    this.save.sanity = Math.min(d.maxSanity, this.save.sanity + amount * d.healMult);
    const got = Math.round(this.save.sanity - before);
    if (got > 0) {
      sfx.heal();
      this.hud.flash('heal');
      this.floatText(this.player.pos.clone().setY(2.2), `+${got}`, '#7dff9a');
      if (from !== '') this.hud.toast(`${from}: +${got} sanity`, 'good');
    }
  }

  rootPlayer(seconds: number, reason: string): void {
    if (this.derivedCache.noRoot && reason.startsWith('In a meeting')) return;
    this.rootT = Math.max(this.rootT, seconds);
    this.rootReason = reason;
    sfx.meeting();
  }

  playerRooted(): boolean {
    return this.rootT > 0;
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  toast(text: string): void {
    this.hud.toast(text);
  }

  helperDamageMult(): number {
    return perk(this.save, 'delegate') > 0 ? 2 : 1;
  }

  healerFrequency(): number {
    return perk(this.save, 'delegate') > 0 ? 1.6 : 1;
  }

  ticketTitle(a: Actor): string {
    return TICKETS[a.ticket]?.title ?? 'It is broken';
  }

  private resolveActor(a: Actor): void {
    a.resolved = true;
    a.removeIn = a.kind === 'boss' ? 3 : 1.4;
    a.flash = 1;
    a.hpBar.visible = false;
    const s = this.save;
    const soft = 1 + perk(s, 'soft') * 0.25;
    const rep = Math.round(a.rep * soft);
    s.rep += rep;
    this.gainXp(a.xp);
    sfx.resolved();
    this.faceMood = 'grin';
    this.faceT = 1.2;
    const t = TICKETS[a.ticket];
    if (a.kind === 'boss' && a.boss !== null) {
      say(a, a.boss.defeat, 4, '#fff', 'rgba(0,100,40,0.92)');
      s.stats.bosses++;
      this.elevatorOpen = true;
      sfx.setBoss(false);
      sfx.levelUp();
      for (const q of s.quests) if (q.kind === 'boss') { q.progress = 1; q.done = true; }
      s.quests = s.quests.filter((q) => q.kind !== 'boss');
      this.hud.toast(`MAJOR INCIDENT RESOLVED: ${a.name}. +₡${rep}. The lift is unlocked.`, 'epic');
      const exit = this.level.interactables.find((i) => i.kind === 'elevator');
      exit?.mesh?.traverse((o) => {
        if (o.name === 'lamp' && o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(0x30ff60);
      });
      for (let i = 0; i < 4; i++) this.dropLoot(a.pos, true);
      // The whole floor calms down once the boss is dealt with.
      for (const o of this.actors) if (o.hostile && !o.resolved && o.kind !== 'boss' && fx.chance(0.5)) o.hp = 0;
      writeSave(s);
      return;
    }
    say(a, a.kind === 'reply' ? 'Unsubscribed.' : a.kind === 'jam' ? '*whirr* READY' : fx.pick(RESOLVED_LINES), 2, '#063', 'rgba(220,255,225,0.95)');
    s.stats.resolvedField++;
    const before = s.queue.length;
    s.queue = s.queue.filter((q) => q.from !== a.name);
    const cleared = before - s.queue.length;
    this.floatText(a.pos.clone().setY(2.6), `+₡${rep}`, '#7dff9a');
    if (a.kind !== 'reply') {
      this.hud.toast(`Resolved in person: "${t?.title ?? 'it'}" +₡${rep}${cleared > 0 ? ' (ticket closed)' : ''}`, 'good');
    }
    for (const q of s.quests) {
      if (q.kind === 'users' && !q.done && a.kind !== 'reply') {
        q.progress++;
        if (q.progress >= q.goal) this.questDone(q);
      }
    }
    if (fx.chance(a.kind === 'customer' || a.kind === 'manager' ? 0.7 : a.kind === 'reply' ? 0.05 : 0.3)) this.dropLoot(a.pos, false);
  }

  private gainXp(xp: number): void {
    const levels = grantXp(this.save, xp);
    if (levels > 0) {
      sfx.levelUp();
      this.refreshDerived();
      this.save.sanity = this.derivedCache.maxSanity;
      this.hud.toast(`PROMOTED: ${titleFor(this.save.level)} (Lv ${this.save.level}). Perk point available (Tab).`, 'epic');
    }
  }

  private dropLoot(at: THREE.Vector3, rich: boolean): void {
    const s = this.save;
    const ownedAmmo = ['labels', 'air', 'ducks', 'toner'].filter((k) =>
      s.owned.some((id) => { const w = itemById(id); return w?.slot === 'weapon' && w.ammo === k; })) as AmmoKind[];
    let mesh: THREE.Mesh;
    let pickup: Pickup;
    if (ownedAmmo.length > 0 && fx.chance(0.6)) {
      const k = fx.pick(ownedAmmo);
      const def = AMMO.find((a) => a.ammo === k);
      const amount = Math.ceil((def?.amount ?? 10) * (rich ? 0.8 : 0.35));
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), new THREE.MeshLambertMaterial({ color: 0x3aa0ff, emissive: 0x0a2a4a }));
      pickup = { mesh, kind: 'ammo', id: k, amount, t: 0 };
    } else {
      const pool = CONSUMABLES.filter((c) => c.minFloor <= s.floor && c.id !== 'beer' || (c.id === 'beer' && s.floor >= 2));
      const c = fx.pick(pool);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xffb0d0, emissive: 0x4a1a2a }));
      pickup = { mesh, kind: 'item', id: c.id, amount: 1, t: 0 };
    }
    mesh.position.set(at.x + fx.range(-0.8, 0.8), 0.4, at.z + fx.range(-0.8, 0.8));
    this.scene.add(mesh);
    this.pickups.push(pickup);
  }

  private updatePickups(dt: number): void {
    const pp = this.player.pos;
    this.pickups = this.pickups.filter((p) => {
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.4 + Math.sin(p.t * 3) * 0.1;
      const dist = Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z);
      if (dist < 3) {
        p.mesh.position.x += (pp.x - p.mesh.position.x) * dt * 6;
        p.mesh.position.z += (pp.z - p.mesh.position.z) * dt * 6;
      }
      if (dist < 0.8) {
        sfx.pickup();
        if (p.kind === 'ammo') {
          this.save.ammo[p.id as AmmoKind] += p.amount;
          this.hud.toast(`+${p.amount} ${p.id}`);
        } else {
          this.giveItem(p.id, 1, '');
        }
        this.scene.remove(p.mesh);
        disposeTree(p.mesh, true);
        return false;
      }
      return p.t < 90;
    });
  }

  giveItem(id: string, n: number, from: string): void {
    this.save.consumables[id] = (this.save.consumables[id] ?? 0) + n;
    this.refreshDerived();
    const name = itemById(id)?.name ?? id;
    this.hud.toast(from === '' ? `Picked up ${name}` : `${from} gave you ${name}`, 'good');
  }

  giveAmmo(): void {
    const s = this.save;
    s.ammo.labels += 20;
    if (s.owned.includes('aircan')) s.ammo.air += 30;
    if (s.owned.includes('duck')) s.ammo.ducks += 2;
    if (s.owned.includes('toner')) s.ammo.toner += 20;
    sfx.pickup();
  }

  // ------------------------------------------------------------------ fx

  private fxBall(at: THREE.Vector3, color: number, life: number, size: number, grow: number): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.fxMeshes.push({ mesh, ttl: life, life, grow });
  }

  private fxRing(at: THREE.Vector3, color: number, radius: number): void {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.fxMeshes.push({ mesh, ttl: 0.5, life: 0.5, grow: radius });
  }

  private updateFx(dt: number): void {
    this.fxMeshes = this.fxMeshes.filter((f) => {
      f.ttl -= dt;
      const k = 1 - f.ttl / f.life;
      f.mesh.scale.setScalar(0.2 + k * f.grow);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 * (1 - k));
      if (f.ttl <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    this.floaters = this.floaters.filter((f) => {
      f.ttl -= dt;
      f.sprite.position.y += dt * 1.2;
      f.sprite.material.opacity = Math.min(1, f.ttl * 2);
      if (f.ttl <= 0) {
        this.scene.remove(f.sprite);
        disposeSprite(f.sprite);
        return false;
      }
      return true;
    });
  }

  floatText(pos: THREE.Vector3, text: string, color: string): void {
    if (this.floaters.length > 40) return;
    const s = textSprite(text, { color, size: 30 });
    s.position.copy(pos);
    s.material.depthTest = false;
    this.scene.add(s);
    this.floaters.push({ sprite: s, ttl: 0.9 });
  }

  private billboards(): void {
    const q = this.camera.quaternion;
    const cam = this.camera.position;
    for (const a of this.actors) {
      if (a.hpBar.visible) {
        a.hpBar.quaternion.copy(a.root.quaternion).invert().multiply(q);
      }
      // A speech bubble in your face is a wall of text; keep them readable.
      if (a.bubble !== null) {
        const d = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z);
        a.bubble.visible = d > 3.2;
      }
    }
  }

  // ------------------------------------------------------------------ tickets

  enqueueTicket(from: Actor, gold: boolean): void {
    const s = this.save;
    if (s.queue.some((q) => q.from === from.name)) return;
    if (s.queue.length >= QUEUE_MAX) {
      this.hurtPlayer(6, null, 'ticket');
      this.hud.toast('Queue overflow! The tickets are coming from inside the queue.', 'bad');
      return;
    }
    const sla = (gold ? 80 : 130) - Math.min(40, s.floor * 8);
    s.queue.push({ t: from.ticket, sla, from: from.name, struck: [], gold });
    sfx.phone();
    this.hud.toast(`${gold ? '⭐ GOLD ' : ''}Ticket from ${from.name}: "${TICKETS[from.ticket]?.title ?? ''}" - solve it at a computer or resolve them in person.`, gold ? 'bad' : 'info');
  }

  private breach(q: QueuedTicket): void {
    const s = this.save;
    s.queue = s.queue.filter((x) => x !== q);
    s.stats.breaches++;
    this.hurtPlayer(q.gold ? 22 : 12, null, 'ticket');
    const title = TICKETS[q.t]?.title ?? '';
    this.hud.toast(`SLA BREACHED: "${title}". It has been escalated to a manager.`, 'bad');
    // Escalation: somebody with a lanyard is coming to see you.
    const ang = fx.range(0, Math.PI * 2);
    const m = this.spawn('manager', this.player.pos.x + Math.sin(ang) * 6, this.player.pos.z + Math.cos(ang) * 6, -1);
    if (m !== null) say(m, `I have been asked to follow up on "${title}".`, 4);
  }

  fixOptions(q: QueuedTicket): string[] {
    let opts = this.fixCache.get(q);
    if (opts === undefined) {
      const t = TICKETS[q.t];
      if (t === undefined) return [];
      const correct = fx.pick(t.fixes);
      const own = new Set(t.fixes);
      const decoys = new Set<string>();
      for (let guard = 0; decoys.size < 3 && guard < 50; guard++) {
        const other = fx.pick(TICKETS);
        const f = fx.pick(other.fixes);
        if (!own.has(f)) decoys.add(f);
      }
      let list = [...decoys];
      if (perk(this.save, 'cli') > 0) list = list.slice(1);
      opts = fx.shuffle([correct, ...list]);
      this.fixCache.set(q, opts);
    }
    return opts.filter((o) => !q.struck.includes(o));
  }

  resolve(q: QueuedTicket, label: string): { ok: boolean; message: string } {
    const s = this.save;
    const t = TICKETS[q.t];
    if (t === undefined) return { ok: false, message: 'That ticket no longer exists.' };
    if (t.fixes.includes(label)) {
      s.queue = s.queue.filter((x) => x !== q);
      const rep = Math.round((12 + t.urgency * 6 + s.floor * 5) * (q.gold ? 2 : 1) * (1 + perk(s, 'soft') * 0.25));
      s.rep += rep;
      s.stats.resolvedDesk++;
      this.gainXp(18 + s.floor * 6);
      this.healPlayer(6, '');
      sfx.resolved();
      for (const quest of s.quests) {
        if (quest.kind === 'resolve' && !quest.done) {
          quest.progress++;
          if (quest.progress >= quest.goal) this.questDone(quest);
        }
      }
      return { ok: true, message: `✔ Resolved. +₡${rep}. Root cause: ${t.cause}` };
    }
    q.struck.push(label);
    q.sla -= 10;
    s.stats.wrongFixes++;
    s.sanity -= 8;
    sfx.error();
    return { ok: false, message: '✖ That was not it. The user has reopened the ticket, with feeling. (-8 sanity, -10s SLA)' };
  }

  pullTickets(): number {
    const s = this.save;
    let n = 0;
    while (s.queue.length < QUEUE_MAX && n < 2) {
      const t = fx.int(0, TICKETS.length - 1);
      const tk = TICKETS[t];
      s.queue.push({ t, sla: 170, from: `${tk?.reporter ?? 'Backlog'} (backlog #${fx.int(1000, 9999)})`, struck: [], gold: false });
      n++;
    }
    if (n > 0) sfx.phone();
    return n;
  }

  // ------------------------------------------------------------------ quests

  newQuest(): Quest | null {
    const s = this.save;
    if (s.quests.filter((q) => q.kind !== 'boss').length >= 3) return null;
    const f = s.floor;
    const kinds: Quest['kind'][] = ['resolve', 'users'];
    const printer = this.level.interactables.find((i) => i.kind === 'printer' && !i.used);
    if (printer !== undefined && !s.quests.some((q) => q.kind === 'printer')) kinds.push('printer', 'printer');
    const healers = this.actors.filter((a) => a.kind === 'healer');
    if (healers.length > 0 && !s.quests.some((q) => q.kind === 'deliver')) kinds.push('deliver');
    const kind = fx.pick(kinds);
    const from = fx.pick(['Derek (Team Lead)', 'Service Desk Bot', 'Fiona (Head of Process)', 'Morag (Internal IT)', 'HR Wellbeing Team']);
    let q: Quest;
    const id = s.nextQuestId++;
    switch (kind) {
      case 'resolve': {
        const goal = fx.int(2, 4);
        q = { id, kind, title: `Close ${goal} tickets at a terminal`, body: 'The queue dashboard is red and the dashboard is on the big TV in reception. Close tickets from any computer.', from, goal, progress: 0, reward: 40 + goal * 15 + f * 25, xp: 30 + f * 15, done: false };
        break;
      }
      case 'users': {
        const goal = fx.int(5, 9);
        q = { id, kind, title: `Resolve ${goal} people in person`, body: 'Walk the floor. Be visible. "Proactive floor-walking", they call it. Resolve people with your tools.', from, goal, progress: 0, reward: 30 + goal * 8 + f * 20, xp: 25 + goal * 3 + f * 10, done: false };
        break;
      }
      case 'printer':
        q = { id, kind, title: 'Fix the printer in the print room', body: 'It says PC LOAD LETTER. Nobody knows what that means. Go and stand in front of it and press E with conviction. Beware of paper jams.', from, goal: 1, progress: 0, reward: 60 + f * 25, xp: 40 + f * 12, done: false };
        break;
      case 'deliver':
      default: {
        const target = fx.pick(healers);
        s.consumables.laptop = (s.consumables.laptop ?? 0) + 1;
        q = { id, kind: 'deliver', title: `Deliver a laptop to ${target.name}`, body: `${target.name} has been waiting for a replacement laptop since the spring. It is in your backpack (3 kg). Find her and press E.`, from, goal: 1, progress: 0, reward: 50 + f * 25, xp: 35 + f * 12, done: false, target: target.name };
        break;
      }
    }
    s.quests.push(q);
    this.refreshDerived();
    return q;
  }

  private questDone(q: Quest): void {
    q.done = true;
    sfx.coin();
    this.hud.toast(`Task complete: ${q.title}. Claim it at any computer (Mail).`, 'good');
  }

  claimQuest(q: Quest): void {
    const s = this.save;
    if (!q.done) return;
    s.rep += q.reward;
    this.gainXp(q.xp);
    s.quests = s.quests.filter((x) => x !== q);
    sfx.coin();
  }

  // ------------------------------------------------------------------ interaction

  private findPrompt(): void {
    const pp = this.player.pos;
    const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    let best: { kind: 'interact'; it: Interactable } | { kind: 'actor'; a: Actor } | null = null;
    let bestScore = Infinity;
    for (const it of this.level.interactables) {
      const dx = it.x - pp.x;
      const dz = it.z - pp.z;
      const dist = Math.hypot(dx, dz);
      const reach = it.kind === 'elevator' || it.kind === 'itdesk' ? 3.2 : 2.4;
      if (dist > reach) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4);
      if (dot < 0.2 && dist > 1.4) continue;
      const score = dist - dot;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'interact', it };
      }
    }
    for (const a of this.actors) {
      if (a.hostile || a.resolved) continue;
      const dx = a.pos.x - pp.x;
      const dz = a.pos.z - pp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      const score = dist - 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'actor', a };
      }
    }
    this.promptTarget = best;
    if (best === null) {
      this.prompt = '';
      return;
    }
    if (best.kind === 'actor') {
      const a = best.a;
      const deliver = this.save.quests.find((q) => q.kind === 'deliver' && q.target === a.name && !q.done);
      this.prompt = a.kind === 'healer'
        ? `E: Talk to ${a.name}${deliver !== undefined ? ' (deliver laptop)' : this.save.actionItems > 0 ? ' (hand over action items)' : ''}`
        : `E: ${a.recruited ? 'Dismiss' : 'Recruit'} ${a.name}`;
      return;
    }
    const it = best.it;
    const labels: Record<Interactable['kind'], string> = {
      terminal: 'E: Log on to WorkgrumbleOS (tickets, tasks, Internal IT)',
      printer: it.used ? 'Printer: READY (for now)' : 'E: Fix the printer',
      cooler: it.used ? 'Water cooler (empty)' : 'E: Drink from the water cooler',
      coffee: it.used ? 'Coffee machine (descaling)' : 'E: Coffee machine',
      vending: 'E: Vending machine (₡10)',
      itdesk: 'E: Internal IT Service Desk (buy gear)',
      elevator: this.elevatorOpen ? 'E: Take the lift up' : 'Lift locked - Major Incident in progress',
      crate: it.used ? 'Empty spares crate' : 'E: Rummage in the spares crate',
    };
    this.prompt = labels[it.kind];
  }

  private interact(): void {
    const target = this.promptTarget;
    if (target === null) return;
    const s = this.save;
    if (target.kind === 'actor') {
      const a = target.a;
      if (a.kind === 'healer') {
        const deliver = s.quests.find((q) => q.kind === 'deliver' && q.target === a.name && !q.done);
        if (deliver !== undefined && (s.consumables.laptop ?? 0) > 0) {
          s.consumables.laptop = (s.consumables.laptop ?? 1) - 1;
          if (s.consumables.laptop <= 0) delete s.consumables.laptop;
          deliver.progress = 1;
          this.questDone(deliver);
          say(a, 'Ooh, a new laptop! You are a treasure. Have a biscuit.', 3, '#5a0040', 'rgba(255,230,245,0.95)');
          this.giveItem('biscuits', 1, a.name);
          this.refreshDerived();
          return;
        }
        if (s.actionItems > 0) {
          const n = this.clearActionItems(a.name);
          say(a, `Give those here, love. I will minute them. (${n} action item${n > 1 ? 's' : ''} taken)`, 3, '#5a0040', 'rgba(255,230,245,0.95)');
          return;
        }
        if (!a.giftGiven) {
          a.giftGiven = true;
          const gift = fx.chance(0.4) ? 'cake' : 'biscuits';
          say(a, gift === 'cake' ? 'There is cake left from Jean\'s do. Take a slice.' : 'Here, take these. The good ones.', 3, '#5a0040', 'rgba(255,230,245,0.95)');
          this.giveItem(gift, 1, a.name);
          this.healPlayer(20, a.name);
          return;
        }
        say(a, fx.pick(HEALER_BARKS), 3, '#5a0040', 'rgba(255,230,245,0.95)');
        this.healPlayer(6, a.name);
        return;
      }
      a.recruited = !a.recruited;
      say(a, a.recruited ? (a.role === 'intern' ? 'Yes! I will follow you everywhere!' : a.role === 'security' ? 'Right behind you. Badges out.' : 'Fine. But I am not doing printers.') : 'I will be in the server room.', 3, '#003040', 'rgba(220,250,255,0.95)');
      this.hud.toast(a.recruited ? `${a.name} joined you.` : `${a.name} left.`, 'good');
      return;
    }
    const it = target.it;
    switch (it.kind) {
      case 'terminal':
        this.currentTerminal = it;
        this.openOs('desk');
        break;
      case 'itdesk':
        this.openOs('itdesk');
        break;
      case 'cooler':
        if (it.used) {
          this.hud.toast('Empty. Somebody should change the bottle. It will not be you.');
          break;
        }
        it.used = true;
        this.healPlayer(25, 'Water cooler');
        break;
      case 'coffee':
        if (it.used) {
          this.hud.toast('"DESCALING IN PROGRESS". It has said that since 2019.');
          break;
        }
        it.used = true;
        this.save.energy = 100;
        this.coffeeT = 30 * (perk(s, 'caffeine') > 0 ? 2 : 1);
        sfx.heal();
        this.hud.toast('Fresh filter coffee. Energy full, pep in step.', 'good');
        break;
      case 'vending':
        if (s.rep < 10) {
          sfx.error();
          this.hud.toast('Insufficient Rep. The machine judges you.', 'bad');
          break;
        }
        s.rep -= 10;
        this.giveItem(fx.chance(0.5) ? 'energy' : 'biscuits', 1, 'The vending machine');
        sfx.coin();
        break;
      case 'printer':
        if (it.used) {
          this.hud.toast('READY. For now.');
          break;
        }
        it.used = true;
        sfx.resolved();
        this.hud.toast('You open every tray, remove one crumpled sheet, and turn it off and on again. READY.', 'good');
        s.rep += 15;
        for (const q of s.quests) if (q.kind === 'printer' && !q.done) { q.progress = 1; this.questDone(q); }
        break;
      case 'crate':
        if (it.used) {
          this.hud.toast('Just some SCSI terminators and a Zip drive.');
          break;
        }
        it.used = true;
        this.giveAmmo();
        s.rep += 20;
        this.giveItem(fx.pick(['biscuits', 'coffee', 'energy', 'postit']), 1, '');
        this.hud.toast('Spares crate: ammo, snacks and ₡20 of resellable RAM.', 'good');
        break;
      case 'elevator':
        if (!this.elevatorOpen) {
          sfx.error();
          this.hud.toast(`The lift is locked while ${this.boss?.name ?? 'the boss'} is unresolved.`, 'bad');
          break;
        }
        writeSave(s);
        if (s.floor === FINAL_FLOOR && !s.won) this.showWin();
        else this.transition(s.floor + 1);
        break;
    }
  }

  private quickUse(): void {
    const s = this.save;
    const d = this.derivedCache;
    const order = s.sanity < d.maxSanity * 0.6 ? ['biscuits', 'cake', 'beer', 'coffee', 'energy'] : s.actionItems > 0 ? ['postit', 'coffee', 'energy', 'biscuits'] : ['coffee', 'energy', 'biscuits', 'cake'];
    for (const id of order) {
      if ((s.consumables[id] ?? 0) > 0) {
        this.use(id);
        return;
      }
    }
    sfx.error();
    this.hud.toast('Nothing in your pockets but a USB stick of unknown provenance.');
  }

  addActionItem(from: string): void {
    this.save.actionItems++;
    this.refreshDerived();
    this.hud.toast(`${from} assigned you an action item (+6 kg). An office lady or a sticky note can take it off you.`, 'bad');
  }

  clearActionItems(from: string): number {
    const n = this.save.actionItems;
    this.save.actionItems = 0;
    this.refreshDerived();
    if (n > 0) {
      sfx.heal();
      this.hud.toast(`${from} took ${n} action item${n > 1 ? 's' : ''} off your hands.`, 'good');
    }
    return n;
  }

  // ------------------------------------------------------------------ OsHost

  buy(id: string): string | null {
    const s = this.save;
    const item = ALL_ITEMS.find((i) => i.id === id);
    if (item === undefined) return 'Unknown item.';
    if (item.minFloor > s.floor) return 'Your clearance does not cover that yet.';
    if (s.rep < item.price) return `Requisition denied: needs ₡${item.price}, you have ₡${s.rep}.`;
    if ((item.slot === 'weapon' || item.slot === 'head' || item.slot === 'body' || item.slot === 'feet' || item.slot === 'trinket') && s.owned.includes(id)) {
      return 'Already issued. Internal IT keeps a spreadsheet.';
    }
    s.rep -= item.price;
    switch (item.slot) {
      case 'weapon':
        s.owned.push(id);
        s.equipped.weapon = id;
        if (item.ammo !== undefined && s.ammo[item.ammo] === 0) {
          const pack = AMMO.find((a) => a.ammo === item.ammo);
          s.ammo[item.ammo] += pack?.amount ?? 20;
        }
        break;
      case 'head':
      case 'body':
      case 'feet':
      case 'trinket':
        s.owned.push(id);
        if (s.equipped[item.slot] === null) s.equipped[item.slot] = id;
        break;
      case 'consumable':
        s.consumables[id] = (s.consumables[id] ?? 0) + 1;
        break;
      case 'ammo':
        s.ammo[item.ammo] += item.amount;
        break;
    }
    this.refreshDerived();
    return null;
  }

  equip(slot: 'weapon' | 'head' | 'body' | 'feet' | 'trinket', id: string | null): void {
    if (slot === 'weapon') {
      if (id !== null && this.save.owned.includes(id)) this.save.equipped.weapon = id;
    } else {
      this.save.equipped[slot] = id;
    }
    this.refreshDerived();
    this.attackCd = Math.max(this.attackCd, 0.15);
  }

  use(id: string): void {
    const s = this.save;
    const c = CONSUMABLES.find((x) => x.id === id);
    if (c === undefined || (s.consumables[id] ?? 0) <= 0) return;
    if (c.buff === 'beer' && s.floor < 2) {
      sfx.error();
      this.hud.toast('Not during probation. (Floor 3+)', 'bad');
      return;
    }
    s.consumables[id] = (s.consumables[id] ?? 1) - 1;
    if ((s.consumables[id] ?? 0) <= 0) delete s.consumables[id];
    if (c.heal !== undefined) this.healPlayer(c.heal, '');
    if (c.energy !== undefined) s.energy = Math.min(100, s.energy + c.energy);
    if (c.buff === 'coffee') this.coffeeT = 25 * (perk(s, 'caffeine') > 0 ? 2 : 1);
    if (c.buff === 'wired') {
      this.wiredT = 20;
      this.crashT = 0;
    }
    if (c.buff === 'beer') this.beerT = 30;
    if (c.clearsActionItem === true && s.actionItems > 0) s.actionItems--;
    sfx.pickup();
    this.hud.toast(`Used ${c.name}.`);
    this.refreshDerived();
  }

  spendPerk(id: string): void {
    const s = this.save;
    const p = PERKS.find((x) => x.id === id);
    if (p === undefined || s.perkPoints <= 0 || perk(s, id) >= p.max) return;
    s.perks[id] = perk(s, id) + 1;
    s.perkPoints--;
    sfx.levelUp();
    this.fixCache = new WeakMap();
    this.refreshDerived();
  }

  canSlack(): boolean {
    return this.currentTerminal !== null && !this.slackedTerminals.has(this.currentTerminal.id);
  }

  slackOff(): string {
    if (this.currentTerminal === null) return 'You cannot look at cats from your backpack.';
    this.slackedTerminals.add(this.currentTerminal.id);
    this.healPlayer(30, '');
    if (fx.chance(0.35)) {
      this.caughtPending = true;
      return 'Ahh. That is better. (+30 sanity) ...was that footsteps behind you?';
    }
    return 'Ahh. That is better. (+30 sanity). Nobody saw. Probably.';
  }

  setView(v: 'first' | 'third'): void {
    this.save.view = v;
  }

  setSens(v: number): void {
    this.save.mouseSens = v;
  }

  setVolume(v: number): void {
    this.save.volume = v;
    sfx.setVolume(v);
  }

  click(): void { sfx.click(); }
  error(): void { sfx.error(); }
  coin(): void { sfx.coin(); }

  // ------------------------------------------------------------------ world upkeep

  private markSeen(): void {
    const lv = this.level;
    const pcx = toCell(this.player.pos.x);
    const pcz = toCell(this.player.pos.z);
    const R = 9;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h) continue;
        if (dx * dx + dz * dz > R * R) continue;
        const i = cz * lv.w + cx;
        if (lv.seen[i] === 1) continue;
        if (lineOfSight(lv, this.player.pos.x, this.player.pos.z, cx * TILE + TILE / 2, cz * TILE + TILE / 2)) lv.seen[i] = 1;
        // Walls next to seen floor count as seen, for a tidy map.
        else if (lv.floor[i] === 1 && lv.opaque[i] === 1) {
          for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (lv.seen[(cz + oz) * lv.w + cx + ox] === 1) lv.seen[i] = 1;
          }
        }
      }
    }
  }

  private updateLights(force: boolean): void {
    this.lightIn -= 1 / 60;
    if (!force && this.lightIn > 0) return;
    this.lightIn = 0.5;
    const pp = this.player.pos;
    const spots = [...this.level.lightSpots].sort((a, b) =>
      Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z));
    this.lights.forEach((l, i) => {
      const s = spots[i];
      if (s === undefined) {
        l.visible = false;
        return;
      }
      l.visible = true;
      l.position.copy(s);
      l.intensity = this.save.floor === 0 ? 10 : 16;
    });
    // Flicker one light, because every office has one.
    const flick = this.lights[2];
    if (flick !== undefined && fx.chance(0.3)) flick.intensity *= fx.range(0.2, 1);
    void EYE;
  }
}
