import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { sfx } from './audio';
import { showCharGen } from './chargen';
import { DEATH_LINES, RESOLVED_LINES } from './content/lines';
import { TICKETS } from './content/tickets';
import { type DialogueNode, DialogueUI, LockpickUI, said } from './dialogue';
import { disposeTree } from './dispose';
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
  setMarker,
  type SpawnOpts,
  updateActor,
} from './entities';
import { Hud, type HudFrame } from './hud';
import { Input } from './input';
import {
  ALL_ITEMS,
  AMMO,
  type AmmoKind,
  CONSUMABLES,
  DRINKS,
  GEAR,
  itemById,
  PERKS,
  RUNES,
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
import { castChance, spellById } from './magic';
import { generateMokki } from './mokki';
import { type OsHost, Os } from './os';
import { Player } from './player';
import { fx, Rng } from './rng';
import {
  type Attribute,
  BAND_EFFECTS,
  bandFor,
  bacDecay,
  checkChance,
  difficultyFor,
  type Domain,
  drinkBac,
  endingFor,
  type Faction,
  FACTION_INFO,
  promille,
  salaryFor,
  type Skill,
  SKILL_INFO,
  titleFor,
  type Track,
} from './rpg';
import {
  adjustStanding,
  applyLevelUp,
  type CharacterSetup,
  clearSave,
  derive,
  type Derived,
  levelUpReady,
  loadSave,
  newSave,
  perk,
  type QueuedTicket,
  type Quest,
  type SaveState,
  skill,
  useSkill,
  writeSave,
} from './state';
import {
  disciplinary,
  levelUpNode,
  performanceReview,
  type StoryHost,
  storyNpcFor,
  talkHealer,
  talkHelper,
  talkHostile,
  talkManager,
  talkStory,
  talkTonttu,
} from './story';
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
  readonly rise: number;
}

interface Floater {
  readonly sprite: THREE.Sprite;
  ttl: number;
}

type Screen = 'title' | 'chargen' | 'play' | 'os' | 'dialogue' | 'paused' | 'dead' | 'ending' | 'transition';

const FINAL_FLOOR = 4;

export class Game implements GameCtx, OsHost, StoryHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly hud: Hud;
  readonly os: Os;
  readonly dialogue: DialogueUI;
  readonly lockpick: LockpickUI;
  readonly player: Player;
  save: SaveState;
  level!: Level;
  actors: Actor[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  fxMeshes: FxMesh[] = [];
  floaters: Floater[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly overlay: HTMLDivElement;
  private readonly mount: HTMLElement;
  field: Int16Array = new Int16Array(0);
  private fieldIn = 0;
  private seenIn = 0;
  private lightIn = 0;
  private saveIn = 20;
  time = 0;
  screen: Screen = 'title';
  private attackCd = 0;
  private shoveCd = 0;
  rootT = 0;
  private rootReason = '';
  private coffeeT = 0;
  private wiredT = 0;
  private crashT = 0;
  private sisuT = 0;
  private invisT = 0;
  private saunaT = 0;
  private saunaBuff = false;
  private abilityCd = 0;
  private auraSlow = 0;
  private athleticsT = 0;
  private stealthT = 0;
  private stumbleT = 3;
  private withdrawalT = 0;
  private caughtCd = 0;
  private faceMood: 'normal' | 'hurt' | 'grin' | 'left' | 'right' = 'normal';
  private faceT = 0;
  private shakeAmt = 0;
  boss: Actor | null = null;
  elevatorOpen = false;
  private derivedCache: Derived;
  private currentTerminal: Interactable | null = null;
  private slackedTerminals = new Set<number>();
  private caughtPending = false;
  private pendingHearing = false;
  private fixCache = new WeakMap<QueuedTicket, { opts: string[]; hint: string | null }>();
  private prompt = '';
  private promptTarget: { kind: 'interact'; it: Interactable } | { kind: 'actor'; a: Actor } | null = null;
  private stepIn = 0;
  private last = performance.now();
  private readonly projGeo = new Map<ProjectileKind, [THREE.BufferGeometry, THREE.Material]>();
  private levelRng = new Rng(1);
  private mark: THREE.Vector3 | null = null;
  private history: { x: number; z: number; sanity: number }[] = [];
  private historyIn = 0;
  private weekendDone = { sauna: false, grill: false, lake: false };
  private afterDialogue: (() => void) | null = null;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.append(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 160);
    this.scene.add(this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.55, 0.86));
    this.composer.addPass(new OutputPass());
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc890, 0);
    this.sun.position.set(-30, 40, 60);
    this.scene.add(this.sun);
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
    this.dialogue = new DialogueUI(mount);
    this.lockpick = new LockpickUI(mount);
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
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === null && this.screen === 'play') this.showPause();
      // A lock request that lands after a dialogue or menu opened would trap
      // the cursor behind it: give it straight back.
      if (document.pointerLockElement !== null && this.screen !== 'play') this.input.releaseLock();
    });

    this.loadWorld();
    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  // ================================================================== world

  get floor(): number {
    return this.save.floor;
  }

  get difficulty(): number {
    return difficultyFor(this.save.rung);
  }

  get playerPos(): THREE.Vector3 {
    return this.player.pos;
  }

  get stealth(): number {
    return Math.min(0.9, this.derivedCache.stealth + (this.player.crouching ? 0.3 + skill(this.save, 'stealth') * 0.003 : 0));
  }

  get invisible(): boolean {
    return this.invisT > 0;
  }

  get staffStanding(): number {
    return this.save.standing.staff;
  }

  get managementStanding(): number {
    return this.save.standing.management;
  }

  get findings(): number {
    return this.save.findings;
  }

  get title(): string {
    return titleFor(this.save.rung, this.save.domain, this.save.track);
  }

  floorName(): string {
    if (this.save.location === 'mokki') return `The Mökki - weekend ${this.save.week}`;
    const theme = THEMES[this.save.floor % THEMES.length];
    const n = this.save.floor;
    return n > FINAL_FLOOR ? `Overtime ${n - FINAL_FLOOR} - ${theme?.name ?? ''}` : `Floor ${n === 0 ? 'B1' : n} - ${theme?.name ?? ''}`;
  }

  private clearWorld(): void {
    for (const a of this.actors) disposeActor(this.scene, a);
    this.actors = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const p of this.pickups) {
      this.scene.remove(p.mesh);
      disposeTree(p.mesh, true);
    }
    this.pickups = [];
    for (const f of this.floaters) {
      this.scene.remove(f.sprite);
      disposeSprite(f.sprite);
    }
    this.floaters = [];
    for (const f of this.fxMeshes) this.scene.remove(f.mesh);
    this.fxMeshes = [];
    if (this.level !== undefined) {
      this.scene.remove(this.level.group);
      disposeTree(this.level.group, true);
    }
    this.mark = null;
    this.history = [];
    this.boss = null;
  }

  private loadWorld(): void {
    if (this.save.location === 'mokki') this.loadMokki();
    else this.loadFloor(this.save.floor, true);
  }

  private loadFloor(n: number, fromSave: boolean): void {
    this.clearWorld();
    const s = this.save;
    s.floor = n;
    s.location = 'office';
    const theme = THEMES[n % THEMES.length] ?? THEMES[0];
    if (theme === undefined) throw new Error('no theme');
    const seed = (s.seed + n * 977) >>> 0;
    this.levelRng = new Rng(seed ^ 0x5bd1e995);
    this.level = generateLevel(n, theme, seed);
    this.scene.add(this.level.group);
    this.scene.fog = new THREE.Fog(theme.fog, 6, 42);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.setHex(theme.light);
    this.hemi.groundColor.setHex(theme.ambient);
    this.hemi.intensity = n === 0 ? 0.7 : 1.05;
    this.sun.intensity = 0;
    this.player.outdoor = false;
    for (const l of this.lights) l.color.setHex(theme.light);

    const npc = storyNpcFor(n);
    for (const sp of this.level.spawns) {
      if (sp.kind === 'reply') {
        for (let i = 0; i < 3; i++) this.spawnAt(sp.kind, sp.x + fx.range(-1, 1), sp.z + fx.range(-1, 1), sp.room, false);
      } else if (sp.kind === 'npc') {
        if (s.flags[`story_${npc.id}_${n}`] !== true) this.spawnAt('npc', sp.x, sp.z, sp.room, false, { npc });
      } else {
        this.spawnAt(sp.kind, sp.x, sp.z, sp.room, false);
      }
    }
    const bossRoom = this.level.roomOf[toCell(this.level.bossSpawn.z) * this.level.w + toCell(this.level.bossSpawn.x)] ?? -1;
    this.boss = this.spawnAt('boss', this.level.bossSpawn.x, this.level.bossSpawn.z, bossRoom, false);
    if (this.boss !== null) {
      let mult = 1;
      if (s.flags.mokkiDeal === true && n === FINAL_FLOOR) mult *= 0.5;
      if (s.flags.whistleblower === true && n % 5 === 3) mult *= 0.6;
      if (this.boss.boss?.name === 'The Auditor') mult *= 1 + s.findings * 0.25;
      this.boss.hp *= mult;
      this.boss.maxHp *= mult;
    }
    this.elevatorOpen = false;
    this.slackedTerminals.clear();

    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    if (!fromSave) s.queue = [];
    s.quests = s.quests.filter((q) => q.kind !== 'boss' && q.kind !== 'printer' && q.kind !== 'deliver');
    delete s.consumables.laptop;
    const b = this.boss?.boss;
    if (b !== undefined && b !== null) {
      s.quests.unshift({
        id: s.nextQuestId++, kind: 'boss', title: `MAJOR INCIDENT: ${this.boss?.name ?? b.name}`,
        body: `${b.name} (${b.title}) is holding the corner office hostage. Resolve them to unlock the lift - and the weekend.`,
        from: 'The Service Desk', goal: 1, progress: 0, reward: 0, done: false,
      });
    }
    this.consequencesOnArrival(n);
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    this.refreshDerived();
    this.markSeen();
    this.updateLights(true);
    sfx.setBoss(false);
    writeSave(s);
  }

  /** Choices made on earlier floors come due here. */
  private consequencesOnArrival(n: number): void {
    const s = this.save;
    const f = s.flags;
    const near = (kind: ActorKind, count: number, name?: string): void => {
      for (let i = 0; i < count; i++) {
        const a = this.spawnAt(kind, this.level.start.x + fx.range(-6, 6), this.level.start.z + fx.range(3, 10), 0, false);
        if (a !== null && name !== undefined) a.name = name;
      }
    };
    if (f.mfaSkipped === true && f.mfaFallout !== true && n >= 2) {
      f.mfaFallout = true;
      near('reply', 8);
      near('customer', 2);
      this.journal('The "CFO" I enrolled was a phisher. This floor woke up to a phishing wave, and two very angry clients.');
      this.hud.toast('CONSEQUENCE: the fake CFO\'s account is sending phishing mail to the whole building.', 'bad');
    }
    if (f.adminGiven === true && f.adminFallout !== true && n >= 3) {
      f.adminFallout = true;
      near('reply', 6);
      near('jam', 2);
      this.journal('Tristan\'s "free screensaver" was malware. Sales printers are possessed and every inbox is on fire.');
      this.hud.toast('CONSEQUENCE: Tristan\'s screensaver was malware. The printers are possessed.', 'bad');
    }
    if (f.reportedMarcus === true && f.marcusRevenge !== true && n >= 1) {
      f.marcusRevenge = true;
      near('customer', 1, 'Marcus (holding a grudge)');
      this.hud.toast('Marcus has not forgotten that you reported him.', 'bad');
    }
    if (f.caughtPhish === true && f.phishThanks !== true && n >= 2) {
      f.phishThanks = true;
      this.giveItem('energy', 2, 'The CFO\'s office');
      this.addRep(60);
      this.journal('The real CFO sent a thank-you hamper for catching the phisher.');
    }
  }

  private loadMokki(): void {
    this.clearWorld();
    const s = this.save;
    s.location = 'mokki';
    this.level = generateMokki((s.seed ^ 0x6d6f6b6b) >>> 0);
    this.levelRng = new Rng(s.seed + s.week);
    this.scene.add(this.level.group);
    // The white night: the sun low in the north, a sky that never quite gets dark.
    this.scene.background = new THREE.Color(0xf2c6a4);
    this.scene.fog = new THREE.Fog(0xe8c0a8, 30, 150);
    this.hemi.color.setHex(0xbfd8ff);
    this.hemi.groundColor.setHex(0x3a5a2a);
    this.hemi.intensity = 1.1;
    this.sun.intensity = 2.2;
    this.player.outdoor = true;
    for (const l of this.lights) l.visible = false;
    for (const sp of this.level.spawns) this.spawnAt(sp.kind, sp.x, sp.z, 0, false);
    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.player.yaw = Math.PI;
    this.player.pitch = -0.05;
    this.elevatorOpen = true;
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    this.refreshDerived();
    sfx.setBoss(false);
    writeSave(s);
  }

  private spawnAt(kind: ActorKind, x: number, z: number, room: number, aggro: boolean, opts: SpawnOpts = {}): Actor | null {
    if (isSolidAt(this.level, x, z) && kind !== 'boss') {
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
    const a = createActor(this, kind, x, z, room, this.levelRng, TICKETS.length, { staffStanding: this.save.standing.staff, ...opts });
    if (aggro) a.aggro = true;
    this.actors.push(a);
    return a;
  }

  spawn(kind: ActorKind, x: number, z: number, room: number): Actor | null {
    if (this.actors.filter((a) => !a.resolved && a.hostile).length > 70) return null;
    return this.spawnAt(kind, x, z, room, true);
  }

  // ================================================================== screens

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
    this.input.releaseLock();
    const hasSave = loadSave() !== null;
    this.setOverlay(`
      <div class="title-logo">WORKGRUMBLE</div>
      <div class="title-sub">H E L L D E S K</div>
      <p class="title-blurb">An IT career role-playing game. Start as a trainee, climb to Senior Architect - or don't.
      Resolve the users, survive the managers, keep the office ladies sweet, walk the tightrope of Friday drinks,
      and spend every weekend at the mökki learning the old sauna magic.</p>
      <div class="title-controls">
        <span><b>WASD</b> move</span><span><b>Mouse</b> look</span><span><b>LMB</b> tool</span><span><b>RMB</b> shove</span>
        <span><b>E</b> use / talk</span><span><b>F</b> cast spell</span><span><b>X</b> next spell</span><span><b>G</b> domain ability</span>
        <span><b>C</b> sneak</span><span><b>T</b> rest</span><span><b>Q</b> quick supplies</span><span><b>V</b> 1st/3rd person</span>
        <span><b>Shift</b> sprint</span><span><b>1-9</b> tools</span><span><b>Tab</b> backpack</span><span><b>M</b> map</span>
      </div>`, [
      ...(hasSave ? [[`Continue: ${this.save.name}, ${this.title} (${this.floorName()})`, () => this.startPlay()] as [string, () => void]] : []),
      ['New career', () => this.showChargen()],
    ]);
  }

  private showChargen(): void {
    this.screen = 'chargen';
    this.hideOverlay();
    showCharGen(this.mount, (setup) => this.beginCareer(setup), () => this.showTitle());
  }

  private beginCareer(setup: CharacterSetup): void {
    clearSave();
    this.save = newSave(Date.now() >>> 0, setup);
    this.fixCache = new WeakMap();
    this.pendingHearing = false;
    this.os.hide();
    this.loadFloor(0, false);
    this.journal(`Day one. ${this.save.name}, ${this.title}. The badge photo is terrible.`);
    this.startPlay();
    this.openDialogue(said('Morag from Internal IT', `Welcome to Workgrumble, ${this.save.name}. Here is a stapler and a label maker. The users have tickets; the tickets have users. Computers are blue on the map; I am green. You can talk most people down (E) instead of stapling them. Every Friday you go to the mökki. Do not drink from the office fridge. Good luck.`, 'neutral', 'Clock in'));
  }

  private startPlay(): void {
    sfx.unlock();
    sfx.boot();
    this.hideOverlay();
    this.screen = 'play';
    this.input.enabled = true;
    this.input.requestLock();
    this.hud.toast(`${this.floorName()}.`, 'info');
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
    const s = this.save;
    const lost = Math.floor(s.rep * 0.25);
    s.rep -= lost;
    s.stats.burnouts++;
    adjustStanding(s, 'management', -5);
    this.journal('I burned out. HR sent a wellbeing webinar link.');
    this.setOverlay(`<div class="title-logo small dead">BURNOUT</div><p class="title-blurb">${fx.pick(DEATH_LINES)}</p>
      <p class="title-blurb">You lost ₡${lost} of Rep to the wellbeing webinar, and Management noticed. Your queue was reassigned.</p>`, [
      ['Clock back in (restart the floor)', () => {
        s.sanity = this.derivedCache.maxSanity;
        s.energy = 100;
        s.actionItems = 0;
        s.queue = [];
        s.bac = Math.min(s.bac, 20);
        this.rootT = 0;
        this.loadWorld();
        this.resume();
      }],
    ]);
  }

  private showEnding(): void {
    this.screen = 'ending';
    this.input.releaseLock();
    const s = this.save;
    s.won = true;
    writeSave(s);
    sfx.levelUp();
    const e = endingFor({ rung: s.rung, dependency: s.dependency, warnings: s.warnings, flags: s.flags, standing: s.standing });
    const st = s.stats;
    this.setOverlay(`<div class="title-logo small">${e.title}</div>
      <p class="title-blurb">${e.text}</p>
      <p class="title-blurb">${s.name}, ${this.title}, level ${s.level}. Field resolutions ${st.resolvedField} · Talked down ${st.resolvedPeace} · Desk fixes ${st.resolvedDesk} · SLA breaches ${st.breaches} · Drinks ${st.drinks} · Blackouts ${st.blackouts} · Burnouts ${st.burnouts}</p>
      <p class="title-blurb">...Three weeks later, the goats' Wi-Fi goes down. Workgrumble calls. They are offering overtime.</p>`, [
      ['Accept the overtime (keep playing)', () => this.goToMokki()],
      ['Retire (title screen)', () => this.showTitle()],
    ]);
  }

  private showFired(): void {
    this.screen = 'ending';
    this.input.releaseLock();
    clearSave();
    sfx.error();
    this.setOverlay(`<div class="title-logo small dead">P45</div>
      <p class="title-blurb">A trainee with three warnings and nowhere lower to go. Security walks you out holding a cardboard box with a stapler in it.</p>
      <p class="title-blurb">Your career is over. The mökki was always rented anyway.</p>`, [
      ['New career', () => this.showChargen()],
    ]);
  }

  private transitionTo(label: string, big: string, line: string, then: () => void): void {
    this.screen = 'transition';
    this.input.releaseLock();
    sfx.ding();
    this.setOverlay(`<div class="lift"><div class="lift-num">${big}</div>
      <div class="lift-name">${label}</div>
      <p class="title-blurb">${line}</p></div>`, [['Continue', then]]);
  }

  private goToMokki(): void {
    const s = this.save;
    this.transitionTo('Friday 17:00 - to the mökki', '🌲', 'Three hours up the motorway, the last one on gravel. The phone loses signal at the petrol station. Mostly.', () => {
      // Last week's blessings wear off on the drive; the weekend can grant new ones.
      this.saunaBuff = false;
      s.makkara = false;
      this.loadMokki();
      this.resume();
      this.weekendDone = { sauna: false, grill: false, lake: false };
      const pay = salaryFor(s.rung);
      s.rep += pay;
      this.hud.toast(`Salary: +₡${pay} (${this.title}).`, 'epic');
      this.journal(`Weekend ${s.week} at the mökki. Salary ₡${pay}.`);
      // Friday evening phone calls: HR first, then Derek with the review.
      const queue: (() => DialogueNode)[] = [];
      if (s.warnings >= 3) {
        this.pendingHearing = false;
        queue.push(() => disciplinary(this));
      }
      queue.push(() => performanceReview(this));
      this.chainDialogues(queue);
    });
  }

  private chainDialogues(queue: (() => DialogueNode)[]): void {
    const next = queue.shift();
    if (next === undefined) return;
    this.openDialogue(next(), () => this.chainDialogues(queue));
  }

  private goToWork(): void {
    const s = this.save;
    const next = s.floor + 1;
    s.week += 1;
    const theme = THEMES[next % THEMES.length];
    this.transitionTo(theme?.name ?? '', String(next), 'Monday. The lift plays a pan-pipe cover of a song you used to like.', () => {
      this.loadFloor(next, false);
      this.resume();
      this.hud.toast(`Welcome to ${this.floorName()}.`, 'epic');
    });
  }

  openDialogue(node: DialogueNode, after?: () => void): void {
    this.screen = 'dialogue';
    this.input.enabled = false;
    this.input.releaseLock();
    this.afterDialogue = after ?? null;
    this.dialogue.show(node, () => {
      writeSave(this.save);
      const cb = this.afterDialogue;
      this.afterDialogue = null;
      if (this.screen === 'dialogue') this.resume();
      cb?.();
    });
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
        this.hud.toast('CAUGHT! A manager saw the cat pictures.', 'bad');
        adjustStanding(this.save, 'management', -4);
        this.addActionItem(m.name);
      }
    }
  }

  restart(): void {
    this.os.hide();
    this.showChargen();
  }

  // ================================================================== loop

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
    this.player.update(this.level, this.screen === 'play' ? dt : 0, this.derivedCache.band.sway);
    if (this.shakeAmt > 0) {
      this.camera.position.x += fx.range(-1, 1) * this.shakeAmt * 0.15;
      this.camera.position.y += fx.range(-1, 1) * this.shakeAmt * 0.15;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2);
    }
    this.billboards();
    this.animateScenery();
    if (this.save.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    const visible = this.screen === 'play' || this.screen === 'os' || this.screen === 'dialogue';
    if (visible) this.hud.update(this.hudFrame(), dt);
    this.hud.root.style.display = visible ? 'block' : 'none';
    this.hud.crosshair.style.display = this.screen === 'play' ? 'block' : 'none';
  };

  private hudFrame(): HudFrame {
    const s = this.save;
    const sp = s.spell === null ? undefined : spellById(s.spell);
    const domainReady = s.rung >= 3 && s.domain !== null;
    return {
      save: s,
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
      title: this.title,
      spellText: sp === undefined ? 'No runes (find the Saunatonttu)' : `${sp.name} · ${sp.cost} · ${Math.round(this.castOdds(sp.cost) * 100)}%`,
      abilityText: domainReady ? `${s.domain ?? ''} (G): ${this.abilityCd > 0 ? `${Math.ceil(this.abilityCd)}s` : 'ready'}` : '',
      hidden: this.player.crouching ? !this.actors.some((a) => a.hostile && a.aggro && !a.resolved) : null,
      bandLabel: BAND_EFFECTS[bandFor(s.bac)].label,
      promille: promille(s.bac),
    };
  }

  private refreshDerived(): void {
    this.derivedCache = derive(this.save);
    this.player.setTool(this.derivedCache.weapon.id);
    if (this.save.sanity > this.derivedCache.maxSanity) this.save.sanity = this.derivedCache.maxSanity;
    if (this.save.loyly > this.derivedCache.maxLoyly) this.save.loyly = this.derivedCache.maxLoyly;
  }

  derived(): Derived {
    return this.derivedCache;
  }

  private update(dt: number): void {
    const inp = this.input;
    const s = this.save;
    const d = this.derivedCache;

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
    if (inp.hit('KeyC') || inp.hit('ControlLeft')) {
      this.player.crouching = !this.player.crouching;
      this.hud.toast(this.player.crouching ? 'Sneaking. Unaware people take sneak attacks.' : 'Standing up.');
    }
    if (inp.hit('KeyT')) this.tryRest();
    if (inp.hit('KeyX')) this.cycleSpell();
    if (inp.hit('KeyF')) this.castSpell();
    if (inp.hit('KeyG')) this.domainAbility();
    if (this.screen !== 'play') return;

    const weapons = s.owned.filter((id) => itemById(id)?.slot === 'weapon');
    for (let i = 0; i < 9; i++) {
      if (inp.hit(`Digit${i + 1}`) && weapons[i] !== undefined) this.equip('weapon', weapons[i] ?? null);
    }
    if (inp.wheel !== 0 && weapons.length > 1) {
      const cur = weapons.indexOf(s.equipped.weapon);
      const next = weapons[(cur + inp.wheel + weapons.length) % weapons.length];
      if (next !== undefined) this.equip('weapon', next);
    }

    this.tickTimers(dt);
    this.tickVices(dt);
    if (this.screen !== 'play') return;

    // Manager auras, and the smell test.
    this.auraSlow = 0;
    const mgmtEase = Math.max(0, s.standing.management) / 200;
    for (const a of this.actors) {
      if (a.resolved || !a.aggro) continue;
      if (a.kind !== 'manager' && a.kind !== 'boss') continue;
      const dist = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z);
      if (dist < (a.kind === 'boss' ? 9 : 7)) this.auraSlow = Math.max(this.auraSlow, (a.kind === 'boss' ? 0.3 : 0.35) * (1 - d.auraResist) * (1 - mgmtEase));
      if (a.kind === 'manager' && dist < 3.5 && this.caughtCd <= 0) this.caughtCheck(a);
    }
    if (this.screen !== 'play') return;

    // Movement.
    let fwd = 0;
    let side = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) fwd += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) fwd -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) side += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) side -= 1;
    const sy = Math.sin(this.player.yaw);
    const cy = Math.cos(this.player.yaw);
    let wx = -sy * fwd + cy * side;
    let wz = -cy * fwd - sy * side;
    let speed = 5.2 * d.speedMult;
    if (d.overEncumbered) speed *= 0.55;
    speed *= 1 - this.auraSlow;
    if (this.coffeeT > 0) speed *= 1.12;
    if (this.wiredT > 0) speed *= 1.3;
    if (this.crashT > 0) speed *= 0.75;
    if (this.player.crouching) speed *= 0.55;
    const moving = fwd !== 0 || side !== 0;
    const sprint = inp.down('ShiftLeft') && moving && !d.overEncumbered && s.energy > 1 && !this.player.crouching;
    if (sprint) {
      speed *= 1.45 + skill(s, 'athletics') * 0.004;
      s.energy = Math.max(0, s.energy - 24 * dt);
      this.athleticsT += dt;
      if (this.athleticsT > 2) {
        this.athleticsT = 0;
        this.exercise('athletics', 1);
      }
    } else {
      s.energy = Math.min(100, s.energy + 11 * d.energyRegen * (this.coffeeT > 0 ? 1.8 : 1) * dt);
    }
    // Hammered: the floor has opinions.
    if (d.band.sway >= 1.5 && moving) {
      this.stumbleT -= dt;
      if (this.stumbleT <= 0) {
        this.stumbleT = fx.range(2, 5);
        wx += fx.range(-1, 1) * 2;
        wz += fx.range(-1, 1) * 2;
        this.hud.toast('*hic* The floor moved.', 'info');
      }
    }
    if (this.rootT > 0) speed = 0;
    this.player.move(this.level, wx, wz, speed, inp.hit('Space') && this.rootT <= 0 && !this.player.crouching, dt);
    if (moving && speed > 0 && this.player.onGround) {
      this.stepIn -= dt * speed;
      if (this.stepIn <= 0) {
        this.stepIn = 2.2;
        if (!this.player.crouching) sfx.step();
      }
    }

    // Stealth practice: sneaking near people who have not noticed you.
    if (this.player.crouching && moving) {
      const near = this.actors.some((a) => a.hostile && !a.aggro && !a.resolved && Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) < 10);
      if (near) {
        this.stealthT += dt;
        if (this.stealthT > 1.5) {
          this.stealthT = 0;
          this.exercise('stealth', 1);
        }
      }
    }

    const atkRate = d.attackSpeed * (this.wiredT > 0 ? 1.3 : 1) * (this.crashT > 0 ? 0.8 : 1) * (this.auraSlow > 0 ? 0.85 : 1);
    if ((inp.lmb || inp.clicked()) && this.attackCd <= 0 && this.rootT <= 0) this.attack(d.weapon, atkRate);
    if (inp.rmb && this.shoveCd <= 0 && s.energy >= 8) this.shove();

    this.findPrompt();
    if (inp.hit('KeyE')) this.interact();
    if (inp.hit('KeyQ')) this.quickUse();
    if (this.screen !== 'play') return;

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

    if (s.location === 'office') {
      for (const q of [...s.queue]) {
        q.sla -= dt;
        if (q.sla <= 0) this.breach(q);
      }
    }
    if (this.boss !== null && this.boss.bossActive && !this.boss.resolved) sfx.setBoss(true);

    this.seenIn -= dt;
    if (this.seenIn <= 0) {
      this.seenIn = 0.25;
      this.markSeen();
    }
    this.historyIn -= dt;
    if (this.historyIn <= 0) {
      this.historyIn = 0.5;
      this.history.push({ x: this.player.pos.x, z: this.player.pos.z, sanity: s.sanity });
      if (this.history.length > 12) this.history.shift();
    }
    this.updateLights(false);
    this.saveIn -= dt;
    if (this.saveIn <= 0) {
      this.saveIn = 20;
      writeSave(s);
    }

    // Sisu: you cannot be dropped below 1 while it lasts.
    if (this.sisuT > 0 && s.sanity < 1) s.sanity = 1;
    if (s.sanity <= 0 && this.screen === 'play') this.showDead();
  }

  private tickTimers(dt: number): void {
    const s = this.save;
    this.attackCd -= dt;
    this.shoveCd -= dt;
    this.rootT = Math.max(0, this.rootT - dt);
    this.coffeeT = Math.max(0, this.coffeeT - dt);
    this.sisuT = Math.max(0, this.sisuT - dt);
    this.invisT = Math.max(0, this.invisT - dt);
    this.saunaT = Math.max(0, this.saunaT - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.caughtCd = Math.max(0, this.caughtCd - dt);
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
    // Löyly seeps back slowly; sanity trickles back with Patience.
    s.loyly = Math.min(this.derivedCache.maxLoyly, s.loyly + (0.35 + s.attrs.tech * 0.004) * dt);
    s.sanity = Math.min(this.derivedCache.maxSanity, s.sanity + (s.attrs.patience * 0.003 + this.derivedCache.band.regen) * dt);
  }

  private effects(): string[] {
    const s = this.save;
    const d = this.derivedCache;
    const out: string[] = [];
    if (this.rootT > 0) out.push(`📅 ${this.rootReason} (${this.rootT.toFixed(1)}s)`);
    if (this.auraSlow > 0) out.push(`🐢 Manager nearby: -${Math.round(this.auraSlow * 100)}% speed`);
    if (d.overEncumbered) out.push('🎒 OVER-ENCUMBERED');
    if (s.actionItems > 0) out.push(`📋 ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''}`);
    if (s.empties > 0) out.push(`🥫 ${s.empties} empties (evidence)`);
    if (this.coffeeT > 0) out.push(`☕ Coffee ${Math.ceil(this.coffeeT)}s`);
    if (this.wiredT > 0) out.push(`⚡ WIRED ${Math.ceil(this.wiredT)}s`);
    if (this.crashT > 0) out.push(`💤 Crash ${Math.ceil(this.crashT)}s`);
    if (s.hangover > 0) out.push(`🤕 Hangover ${Math.ceil(s.hangover)}s`);
    if (s.dependency >= 50 && s.bac < 5) out.push('🫨 THE SHAKES (withdrawal)');
    if (this.sisuT > 0) out.push(`🪨 Sisu ${Math.ceil(this.sisuT)}s`);
    if (this.invisT > 0) out.push(`🌫 Hiljaisuus ${Math.ceil(this.invisT)}s`);
    if (this.saunaBuff) out.push('🧖 Löyly-blessed (+25% damage)');
    if (s.makkara) out.push('🌭 Makkara-fed');
    if (this.player.crouching) out.push('🐾 Sneaking');
    if (s.warnings > 0) out.push(`⚠ ${s.warnings}/3 HR warnings`);
    return out;
  }

  private ammoText(): string {
    const w = this.derivedCache.weapon;
    if (w.ammo !== undefined) return `${w.ammo}: ${this.save.ammo[w.ammo]}`;
    if (w.energyCost !== undefined) return `Energy ${Math.floor(this.save.energy)}/${w.energyCost} per use`;
    return 'Melee';
  }

  // ================================================================== skills & standing

  /** Use a skill; announce when it goes up, Morrowind-style. */
  exercise(k: Skill, amount: number): void {
    const before = levelUpReady(this.save);
    const v = useSkill(this.save, k, amount);
    if (v === null) return;
    this.hud.toast(`Your ${SKILL_INFO[k].name} skill increased to ${v}.`, 'good');
    sfx.chime();
    this.refreshDerived();
    if (!before && levelUpReady(this.save)) {
      this.hud.toast('You should rest and meditate on what you have learned. (T to rest)', 'epic');
    }
  }

  odds(k: Skill, attr: Attribute, difficulty: number): number {
    return checkChance(skill(this.save, k), this.save.attrs[attr], difficulty);
  }

  check(k: Skill, attr: Attribute, difficulty: number): boolean {
    const ok = fx.chance(this.odds(k, attr, difficulty));
    this.exercise(k, ok ? 2 : 1);
    if (ok) sfx.chime();
    else sfx.error();
    return ok;
  }

  bandPersuade(): number {
    return this.derivedCache.band.persuade;
  }

  standing(f: Faction, delta: number): void {
    adjustStanding(this.save, f, delta);
    if (Math.abs(delta) >= 2) this.hud.toast(`${FACTION_INFO[f].name}: ${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'good' : 'bad');
  }

  addRep(n: number): void {
    this.save.rep = Math.max(0, this.save.rep + n);
    if (n !== 0) this.hud.toast(`${n > 0 ? '+' : ''}₡${n}`, n > 0 ? 'good' : 'bad');
  }

  flag(key: string, value: boolean | number = true): void {
    this.save.flags[key] = value;
  }

  journal(text: string): void {
    this.save.journal.push({ floor: this.save.floor, text });
    if (this.save.journal.length > 120) this.save.journal.shift();
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'epic' = 'info'): void {
    this.hud.toast(text, kind);
  }

  finding(n: number, why: string): void {
    this.save.findings += n;
    this.journal(`Audit finding: ${why}`);
    this.hud.toast(`The Auditor will hear about this. (${this.save.findings} finding${this.save.findings > 1 ? 's' : ''})`, 'bad');
  }

  warn(why: string): void {
    const s = this.save;
    s.warnings += 1;
    adjustStanding(s, 'management', -5);
    this.journal(`HR warning: ${why}.`);
    this.hud.toast(`HR WARNING ${s.warnings}/3: ${why}.`, 'bad');
    sfx.error();
    if (s.warnings >= 3) {
      this.pendingHearing = true;
      this.hud.toast('Three warnings. HR will see you at your next computer log-on, or on Friday.', 'bad');
    }
  }

  promote(domain: Domain | null, track: Track | null): void {
    const s = this.save;
    s.rung = Math.min(8, s.rung + 1);
    if (domain !== null) s.domain = domain;
    if (track !== null) s.track = track;
    adjustStanding(s, 'management', 4);
    sfx.levelUp();
    this.journal(`Promoted to ${this.title}. The building will take me more seriously now. Much more seriously.`);
    this.hud.toast(`PROMOTED: ${this.title}. Difficulty ×${difficultyFor(s.rung).toFixed(2)}.`, 'epic');
    this.refreshDerived();
  }

  demote(): void {
    const s = this.save;
    s.rung = Math.max(0, s.rung - 1);
    s.warnings = 0;
    this.pendingHearing = false;
    this.journal(`Demoted to ${this.title}.`);
    this.hud.toast(`DEMOTED to ${this.title}.`, 'bad');
    this.refreshDerived();
  }

  fireFromJob(): void {
    this.afterDialogue = () => this.showFired();
  }

  applyLevelUp(first: Attribute, second: Attribute): void {
    applyLevelUp(this.save, [first, second]);
    sfx.levelUp();
    this.refreshDerived();
    this.save.sanity = this.derivedCache.maxSanity;
    this.journal(`Reached level ${this.save.level}.`);
  }

  learnSpell(id: string): boolean {
    const s = this.save;
    if (s.spells.includes(id)) return false;
    s.spells.push(id);
    if (s.spell === null) s.spell = id;
    const sp = spellById(id);
    sfx.chime();
    this.hud.toast(`Learned ${sp?.name ?? id} (${sp?.english ?? ''}). X selects, F casts.`, 'epic');
    this.journal(`Learned the rune ${sp?.name ?? id}.`);
    return true;
  }

  trainSkill(k: Skill): void {
    this.save.skills[k].progress = 999;
    this.exercise(k, 0.001);
  }

  // ================================================================== combat

  private aimPoint(): THREE.Vector3 {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const p = origin.clone();
    const startDist = this.save.view === 'third' ? origin.distanceTo(new THREE.Vector3(this.player.pos.x, origin.y, this.player.pos.z)) : 0;
    const ceiling = this.player.outdoor ? 40 : WALL_H;
    for (let t = startDist; t < 40; t += 0.25) {
      p.copy(origin).addScaledVector(dir, t);
      if (p.y < 0 || p.y > ceiling) return p;
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

  /** Every hit the player lands goes through here: sneak attacks, skills, buffs. */
  private strike(a: Actor, base: number, knock: THREE.Vector3 | null, kind: 'melee' | 'ranged' | 'spell'): void {
    const d = this.derivedCache;
    let dmg = base * (kind === 'melee' ? d.meleeMult : kind === 'ranged' ? d.rangedMult : d.spellMult);
    if (this.saunaBuff) dmg *= 1.25;
    if (this.wiredT > 0) dmg *= 1.15;
    if (!a.aggro && a.kind !== 'boss') {
      const mult = 2 + skill(this.save, 'stealth') / 40;
      dmg *= mult;
      this.floatText(a.pos.clone().setY(2.9), `SNEAK ×${mult.toFixed(1)}`, '#b58cff');
      this.exercise('stealth', 2);
    }
    hurtActor(this, a, dmg, knock);
    if (kind === 'melee') this.exercise('hardware', 1);
    if (kind === 'ranged') this.exercise('scripting', 1);
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
    if (this.invisT > 0) this.invisT = 0;
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
          this.strike(a, w.damage, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(w.knockback ?? 2), 'melee');
          hitAny = true;
          if (w.splash !== undefined) this.splash(a.pos, w.splash, w.damage * 0.5 * this.derivedCache.meleeMult, a.id);
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
        const spread = 0.015 + this.derivedCache.band.sway * 0.03;
        dir.x += fx.range(-spread, spread);
        dir.y += fx.range(-spread, spread);
        if (w.kind === 'lob') dir.y += 0.18;
        dir.normalize();
        const net = s.domain === 'Network' && s.rung >= 3 ? 1.3 : 1;
        this.fire({
          kind: w.id === 'labelmaker' ? 'label' : w.id === 'toner' ? 'toner' : 'duck',
          from, dir, speed: (w.speed ?? 20) * net, damage: w.damage, hostile: false, owner: null,
          ttl: 3 * net,
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
          this.strike(a, w.damage, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((w.knockback ?? 3) * 0.6), 'ranged');
        }
        this.fxBall(this.muzzle().addScaledVector(fwd, 1.2 + fx.range(0, 2)), 0xeef8ff, 0.25, 0.35, 3);
        break;
      }
      case 'nova': {
        s.energy -= w.energyCost ?? 0;
        sfx.nova();
        this.shake(0.4);
        this.fxRing(pp.clone().setY(1), w.color, w.range);
        for (const a of this.actors) {
          if (!a.hostile || a.resolved) continue;
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          const dist = Math.hypot(dx, dz);
          if (dist > w.range || !lineOfSight(this.level, pp.x, pp.z, a.pos.x, a.pos.z)) continue;
          this.strike(a, w.damage * (1 - dist / (w.range * 2)), new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(8), 'melee');
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
      a.aggro = true;
    }
  }

  private muzzle(): THREE.Vector3 {
    if (this.save.view === 'first') {
      const p = this.camera.getWorldPosition(new THREE.Vector3());
      const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
      return p.addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.15, 0));
    }
    const p = this.player.pos.clone();
    p.y += 1.3 - this.player.crouch * 0.4;
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
        case 'steam': entry = [new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.7 })]; break;
        case 'salmiakki': entry = [new THREE.OctahedronGeometry(0.2), basic(0x1a1a1a)]; break;
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
      kind: p.kind, mesh, vel: p.dir.clone().multiplyScalar(p.speed), damage: p.damage, hostile: p.hostile, owner: p.owner,
      ttl: p.ttl ?? 3, splash: p.splash ?? 0, gravity: p.gravity ?? 0, hitIds: new Set(),
    });
    if (p.hostile && (p.kind === 'ticket' || p.kind === 'gold')) sfx.paper();
  }

  private updateProjectiles(dt: number): void {
    const pp = this.player.pos;
    const keep: Projectile[] = [];
    const ceiling = this.player.outdoor ? 40 : WALL_H;
    for (const p of this.projectiles) {
      p.ttl -= dt;
      p.vel.y -= p.gravity * dt;
      const m = p.mesh;
      m.position.addScaledVector(p.vel, dt);
      if (p.kind === 'ticket' || p.kind === 'gold' || p.kind === 'paper') m.rotation.z += dt * 12;
      if (p.kind === 'invite' || p.kind === 'salmiakki') m.rotation.y += dt * 6;
      let dead = p.ttl <= 0;
      const pos = m.position;
      const cx = toCell(pos.x);
      const cz = toCell(pos.z);
      const idx = cz * this.level.w + cx;
      const inWall = cx < 0 || cz < 0 || cx >= this.level.w || cz >= this.level.h || this.level.floor[idx] !== 1
        || (this.level.opaque[idx] === 1) || (this.level.solid[idx] === 1 && pos.y < 1.0 && !this.player.outdoor);
      if (inWall || pos.y < 0.02 || pos.y > ceiling) dead = true;

      if (!dead && p.hostile) {
        const dx = pos.x - pp.x;
        const dz = pos.z - pp.z;
        if (dx * dx + dz * dz < 0.45 * 0.45 + 0.1 && pos.y > pp.y && pos.y < pp.y + 2) {
          dead = true;
          if (fx.chance(this.derivedCache.dodge)) {
            this.floatText(pp.clone().setY(2.2), 'DODGE', '#9ad0ff');
            this.exercise('athletics', 0.5);
          } else {
            this.projectileHitsPlayer(p);
          }
        }
      } else if (!dead) {
        for (const a of this.actors) {
          if (!a.hostile || a.resolved || p.hitIds.has(a.id)) continue;
          const h = a.kind === 'boss' ? 3.8 : a.kind === 'reply' || a.kind === 'mosquito' ? 1.8 : 2;
          const dx = pos.x - a.pos.x;
          const dz = pos.z - a.pos.z;
          if (dx * dx + dz * dz < (a.radius + 0.25) ** 2 && pos.y < h) {
            p.hitIds.add(a.id);
            if (p.kind === 'stun') a.stunned = 2.2;
            const knock = p.vel.clone().setY(0).normalize().multiplyScalar(p.kind === 'duck' ? 4 : 1.5);
            if (p.kind === 'salmiakki') {
              a.poisonT = 6;
              a.poisonDps = p.damage;
              hurtActor(this, a, p.damage * 0.5, knock);
            } else if (p.owner === null) {
              this.strike(a, p.damage, knock, 'ranged');
            } else {
              hurtActor(this, a, p.damage, knock);
            }
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
            this.splash(pos, p.splash, p.damage * (p.owner === null ? this.derivedCache.rangedMult : 1));
          }
          sfx.boom();
          this.fxBall(pos.clone(), p.kind === 'po' ? 0xb5835a : p.kind === 'steam' ? 0xffffff : 0xffd400, 0.3, 0.45, p.splash * 1.4);
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
          const resist = (this.save.sign === 'freeze' ? 0.5 : 1) / (1 + perk(this.save, 'teflon')) * (1 - this.save.attrs.liver * 0.004);
          this.rootPlayer(2.2 * resist, `In a meeting: "${fx.pick(subjects)}"`);
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

  hurtPlayer(amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura' | 'bite'): void {
    if (this.screen !== 'play') return;
    const d = this.derivedCache;
    let dmg = amount * (1 - d.armor);
    if (from !== null && (from.kind === 'boss' || from.kind === 'manager' || kind === 'boss')) dmg *= 1 - d.bossResist;
    if (this.sisuT > 0) dmg *= 0.5;
    if (this.save.hangover > 0) dmg *= 1.1;
    this.save.sanity -= dmg;
    this.exercise('sisu', Math.min(1, dmg / 20));
    if (kind === 'bite' && fx.chance(0.3)) this.hud.toast('Bzzz. *slap*', 'info');
    this.hud.flash(kind === 'meeting' ? 'meeting' : 'hurt');
    sfx.hurt();
    this.shake(Math.min(0.5, dmg / 30));
    this.faceT = 0.6;
    if (from !== null) {
      const dx = from.pos.x - this.player.pos.x;
      const dz = from.pos.z - this.player.pos.z;
      const side = dx * Math.cos(this.player.yaw) - dz * Math.sin(this.player.yaw);
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
    this.rootT = Math.max(this.rootT, seconds);
    this.rootReason = reason;
    sfx.meeting();
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  helperDamageMult(): number {
    return perk(this.save, 'delegate') > 0 ? 2 : 1;
  }

  healerFrequency(): number {
    return (perk(this.save, 'delegate') > 0 ? 1.6 : 1) * (1 + Math.max(0, this.save.standing.kitchen) / 100) * (this.derivedCache.band.healerMult > 0 ? 1 : 0.01);
  }

  kitchenStanding(): number {
    // The ladies do not enable a hammered IT person.
    return this.derivedCache.band.healerMult === 0 ? -100 : this.save.standing.kitchen;
  }

  ticketTitle(a: Actor): string {
    return TICKETS[a.ticket]?.title ?? 'It is broken';
  }

  ticketFix(a: Actor): string {
    return TICKETS[a.ticket]?.fixes[0] ?? 'Turn it off and on again';
  }

  noticed(a: Actor): void {
    if (this.player.crouching && a.kind !== 'mosquito') this.hud.toast(`${a.name} spotted you.`, 'bad');
  }

  /** Resolved in combat: the core loop. */
  private resolveActor(a: Actor): void {
    a.resolved = true;
    a.removeIn = a.kind === 'boss' ? 3 : 1.4;
    a.flash = 1;
    a.hpBar.visible = false;
    const s = this.save;
    const rep = Math.round(a.rep * (1 + perk(s, 'soft') * 0.1));
    s.rep += rep;
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
      s.quests = s.quests.filter((q) => q.kind !== 'boss');
      adjustStanding(s, 'management', 6);
      this.journal(`Resolved the major incident: ${a.name}.`);
      this.hud.toast(`MAJOR INCIDENT RESOLVED: ${a.name}. +₡${rep}. The lift is unlocked - the weekend awaits.`, 'epic');
      const exit = this.level.interactables.find((i) => i.kind === 'elevator');
      exit?.mesh?.traverse((o) => {
        if (o.name === 'lamp' && o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(0x30ff60);
      });
      for (let i = 0; i < 4; i++) this.dropLoot(a.pos, true);
      for (const o of this.actors) if (o.hostile && !o.resolved && o.kind !== 'boss' && fx.chance(0.5)) o.hp = 0;
      writeSave(s);
      return;
    }
    say(a, a.kind === 'reply' ? 'Unsubscribed.' : a.kind === 'jam' ? '*whirr* READY' : a.kind === 'mosquito' ? '*splat*' : fx.pick(RESOLVED_LINES), 2, '#063', 'rgba(220,255,225,0.95)');
    if (a.kind === 'mosquito') return;
    s.stats.resolvedField++;
    // Throughput pleases management; being stapled does not please staff.
    if (a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer') {
      adjustStanding(s, 'staff', -0.4);
      adjustStanding(s, 'management', 0.3);
    }
    const before = s.queue.length;
    s.queue = s.queue.filter((q) => q.from !== a.name);
    const cleared = before - s.queue.length;
    this.floatText(a.pos.clone().setY(2.6), `+₡${rep}`, '#7dff9a');
    if (a.kind !== 'reply') this.hud.toast(`Resolved in person: "${t?.title ?? 'it'}" +₡${rep}${cleared > 0 ? ' (ticket closed)' : ''}`, 'good');
    this.questProgress('users');
    if (fx.chance(a.kind === 'customer' || a.kind === 'manager' ? 0.7 : a.kind === 'reply' ? 0.05 : 0.3)) this.dropLoot(a.pos, false);
  }

  resolvePeacefully(a: Actor, how: 'fix' | 'ticket' | 'scared' | 'charmed' | 'meeting' | 'bribe'): void {
    if (a.resolved) return;
    const s = this.save;
    a.resolved = true;
    a.calm = true;
    a.removeIn = 3;
    a.hpBar.visible = false;
    a.talked = true;
    const rep = how === 'fix' ? Math.round(a.rep * 0.9) : how === 'ticket' || how === 'bribe' ? Math.round(a.rep * 0.3) : 0;
    s.rep += rep;
    s.stats.resolvedPeace++;
    if (how === 'fix' || how === 'charmed' || how === 'bribe') adjustStanding(s, 'staff', how === 'fix' ? 2 : 1);
    if (how !== 'ticket') s.queue = s.queue.filter((q) => q.from !== a.name);
    this.questProgress('peace');
    if (rep > 0) this.floatText(a.pos.clone().setY(2.6), `+₡${rep}`, '#7dff9a');
    sfx.resolved();
  }

  enrage(a: Actor): void {
    a.enragedT = 10;
    a.aggro = true;
    a.talked = true;
    adjustStanding(this.save, 'staff', -1);
    say(a, 'RIGHT.', 1.5);
  }

  private questProgress(kind: Quest['kind']): void {
    for (const q of this.save.quests) {
      if (q.kind === kind && !q.done) {
        q.progress++;
        if (q.progress >= q.goal) this.questDone(q);
      }
    }
  }

  private dropLoot(at: THREE.Vector3, rich: boolean): void {
    const s = this.save;
    const ownedAmmo = (['labels', 'air', 'ducks', 'toner'] as const).filter((k) =>
      s.owned.some((id) => { const w = itemById(id); return w?.slot === 'weapon' && w.ammo === k; }));
    let mesh: THREE.Mesh;
    let pickup: Pickup;
    if (ownedAmmo.length > 0 && fx.chance(0.55)) {
      const k = fx.pick(ownedAmmo);
      const def = AMMO.find((a) => a.ammo === k);
      const eng = s.track === 'engineer' && s.rung >= 3 ? 2 : 1;
      const amount = Math.ceil((def?.amount ?? 10) * (rich ? 0.8 : 0.35) * eng);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), new THREE.MeshLambertMaterial({ color: 0x3aa0ff, emissive: 0x0a2a4a }));
      pickup = { mesh, kind: 'ammo', id: k, amount, t: 0 };
    } else {
      const pool = ['biscuits', 'coffee', 'energy', 'postit', 'paperclip', 'paperclip', 'beer', 'lonkero', rich ? 'cake' : 'biscuits'];
      const id = fx.pick(pool);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: DRINKS.includes(id) ? 0xd4af37 : 0xffb0d0, emissive: 0x4a1a2a }));
      pickup = { mesh, kind: 'item', id, amount: 1, t: 0 };
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

  // ================================================================== fx

  private fxBall(at: THREE.Vector3, color: number, life: number, size: number, grow: number, rise = 0): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.fxMeshes.push({ mesh, ttl: life, life, grow, rise });
  }

  private fxRing(at: THREE.Vector3, color: number, radius: number): void {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.fxMeshes.push({ mesh, ttl: 0.5, life: 0.5, grow: radius, rise: 0 });
  }

  private steamBurst(at: THREE.Vector3, radius: number): void {
    for (let i = 0; i < 10; i++) {
      const p = at.clone().add(new THREE.Vector3(fx.range(-1, 1) * radius * 0.6, fx.range(0.3, 1.6), fx.range(-1, 1) * radius * 0.6));
      this.fxBall(p, 0xf4f8ff, fx.range(0.6, 1.1), fx.range(0.3, 0.6), 2.5, 1.2);
    }
  }

  private updateFx(dt: number): void {
    this.fxMeshes = this.fxMeshes.filter((f) => {
      f.ttl -= dt;
      const k = 1 - f.ttl / f.life;
      f.mesh.scale.setScalar(0.2 + k * f.grow);
      f.mesh.position.y += f.rise * dt;
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

  private animateScenery(): void {
    if (this.save.location !== 'mokki') return;
    for (const child of this.level.group.children) {
      if (child.name === 'water' && child instanceof THREE.Mesh) {
        const m = child.material as THREE.MeshLambertMaterial;
        m.emissive.setRGB(0.04, 0.12 + Math.sin(this.time * 0.8) * 0.02, 0.18);
      }
      if (child.name === 'smoke') {
        child.children.forEach((c, i) => {
          c.position.y = (this.time * 0.4 + i * 0.5) % 2.5;
          c.position.x = Math.sin(this.time + i) * 0.3;
        });
      }
    }
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
      if (a.hpBar.visible) a.hpBar.quaternion.copy(a.root.quaternion).invert().multiply(q);
      if (a.bubble !== null) a.bubble.visible = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z) > 3.2;
      if (a.rig !== null && !a.resolved && a.flash <= 0) {
        // Network ping: revealed people glow through the gloom.
        const glow = a.revealT > 0 ? 0x2a4a99 : 0x000000;
        for (const m of a.rig.materials) m.emissive.setHex(glow);
      }
    }
  }

  // ================================================================== tickets

  enqueueTicket(from: Actor, gold: boolean): void {
    const s = this.save;
    if (s.location !== 'office') return;
    if (s.queue.some((q) => q.from === from.name)) return;
    if (s.queue.length >= this.derivedCache.queueMax) {
      this.hurtPlayer(6, null, 'ticket');
      this.hud.toast('Queue overflow! The tickets are coming from inside the queue.', 'bad');
      return;
    }
    const sla = ((gold ? 80 : 130) - Math.min(40, s.floor * 8)) * this.derivedCache.slaMult;
    s.queue.push({ t: from.ticket, sla, from: from.name, struck: [], gold });
    sfx.phone();
    this.hud.toast(`${gold ? '⭐ GOLD ' : ''}Ticket from ${from.name}: "${TICKETS[from.ticket]?.title ?? ''}" - solve it at a computer or resolve them in person.`, gold ? 'bad' : 'info');
  }

  private breach(q: QueuedTicket): void {
    const s = this.save;
    s.queue = s.queue.filter((x) => x !== q);
    s.stats.breaches++;
    adjustStanding(s, 'management', -3);
    adjustStanding(s, 'staff', -2);
    this.hurtPlayer(q.gold ? 22 : 12, null, 'ticket');
    const title = TICKETS[q.t]?.title ?? '';
    this.hud.toast(`SLA BREACHED: "${title}". Escalated to a manager. (Management -3, Staff -2)`, 'bad');
    const ang = fx.range(0, Math.PI * 2);
    const m = this.spawn('manager', this.player.pos.x + Math.sin(ang) * 6, this.player.pos.z + Math.cos(ang) * 6, -1);
    if (m !== null) say(m, `I have been asked to follow up on "${title}".`, 4);
  }

  fixOptions(q: QueuedTicket): string[] {
    let entry = this.fixCache.get(q);
    if (entry === undefined) {
      const t = TICKETS[q.t];
      if (t === undefined) return [];
      const correct = fx.pick(t.fixes);
      const own = new Set(t.fixes);
      const decoys = new Set<string>();
      for (let guard = 0; decoys.size < 3 && guard < 50; guard++) {
        const f = fx.pick(fx.pick(TICKETS).fixes);
        if (!own.has(f)) decoys.add(f);
      }
      let list = [...decoys];
      if (perk(this.save, 'cli') > 0) list = list.slice(1);
      // Troubleshooting: sometimes you just know.
      const hint = fx.chance(skill(this.save, 'troubleshooting') / 140) ? correct : null;
      entry = { opts: fx.shuffle([correct, ...list]), hint };
      this.fixCache.set(q, entry);
    }
    let out = entry.opts.filter((o) => !q.struck.includes(o));
    // The Ballmer Peak: at exactly the right BAC, one wrong answer is obviously wrong.
    if (bandFor(this.save.bac) === 'peak') {
      const t = TICKETS[q.t];
      const wrong = out.find((o) => !(t?.fixes.includes(o) ?? false));
      if (wrong !== undefined && out.length > 2) out = out.filter((o) => o !== wrong);
    }
    return out;
  }

  fixHint(q: QueuedTicket): string | null {
    return this.fixCache.get(q)?.hint ?? null;
  }

  /** Drunk enough and the words start to swim. */
  garble(label: string): string {
    const g = this.derivedCache.band.garble;
    if (g <= 0) return label;
    const rng = new Rng(label.length * 7919 + 13);
    return label.split(' ').map((w) => {
      if (w.length < 4 || !rng.chance(g)) return w;
      const chars = w.split('');
      const i = rng.int(1, chars.length - 3);
      const a = chars[i] as string;
      chars[i] = chars[i + 1] as string;
      chars[i + 1] = a;
      return chars.join('');
    }).join(' ');
  }

  resolve(q: QueuedTicket, label: string): { ok: boolean; message: string } {
    const s = this.save;
    const t = TICKETS[q.t];
    if (t === undefined) return { ok: false, message: 'That ticket no longer exists.' };
    if (t.fixes.includes(label)) {
      s.queue = s.queue.filter((x) => x !== q);
      const rep = Math.round((12 + t.urgency * 6 + s.floor * 5) * (q.gold ? 2 : 1) * this.derivedCache.deskRepMult * (0.7 + this.difficulty * 0.3));
      s.rep += rep;
      s.stats.resolvedDesk++;
      adjustStanding(s, 'staff', 1);
      adjustStanding(s, 'management', 0.5);
      this.exercise('troubleshooting', 2);
      this.healPlayer(6, '');
      sfx.resolved();
      this.questProgress('resolve');
      return { ok: true, message: `✔ Resolved. +₡${rep}. Root cause: ${t.cause}` };
    }
    q.struck.push(label);
    q.sla -= 10;
    s.stats.wrongFixes++;
    s.sanity -= 8;
    adjustStanding(s, 'staff', -1);
    this.exercise('troubleshooting', 0.5);
    sfx.error();
    return { ok: false, message: '✖ That was not it. The user has reopened the ticket, with feeling. (-8 sanity, -10s SLA, Staff -1)' };
  }

  pullTickets(): number {
    const s = this.save;
    let n = 0;
    while (s.queue.length < this.derivedCache.queueMax && n < 2) {
      const t = fx.int(0, TICKETS.length - 1);
      const tk = TICKETS[t];
      s.queue.push({ t, sla: 170 * this.derivedCache.slaMult, from: `${tk?.reporter ?? 'Backlog'} (backlog #${fx.int(1000, 9999)})`, struck: [], gold: false });
      n++;
    }
    if (n > 0) sfx.phone();
    return n;
  }

  // ================================================================== quests

  newQuest(): Quest | null {
    const s = this.save;
    if (s.location !== 'office') return null;
    if (s.quests.filter((q) => q.kind !== 'boss').length >= 3) return null;
    const f = s.floor;
    const kinds: Quest['kind'][] = ['resolve', 'users', 'peace'];
    if (this.level.interactables.some((i) => i.kind === 'printer' && !i.used) && !s.quests.some((q) => q.kind === 'printer')) kinds.push('printer', 'printer');
    const healers = this.actors.filter((a) => a.kind === 'healer');
    if (healers.length > 0 && !s.quests.some((q) => q.kind === 'deliver')) kinds.push('deliver');
    const kind = fx.pick(kinds);
    const from = fx.pick(['Derek (Team Lead)', 'Service Desk Bot', 'Fiona (Head of Process)', 'Morag (Internal IT)', 'HR Wellbeing Team']);
    const id = s.nextQuestId++;
    let q: Quest;
    switch (kind) {
      case 'resolve': {
        const goal = fx.int(2, 4);
        q = { id, kind, title: `Close ${goal} tickets at a terminal`, body: 'The queue dashboard is red and it is on the big TV in reception. Close tickets from any computer.', from, goal, progress: 0, reward: 40 + goal * 15 + f * 25, done: false };
        break;
      }
      case 'users': {
        const goal = fx.int(5, 9);
        q = { id, kind, title: `Resolve ${goal} people in person`, body: 'Walk the floor. Be visible. "Proactive floor-walking", they call it.', from, goal, progress: 0, reward: 30 + goal * 8 + f * 20, done: false };
        break;
      }
      case 'peace': {
        const goal = fx.int(2, 4);
        q = { id, kind, title: `Talk ${goal} people down without a fight`, body: 'HR has noticed the stapler incidents. Walk up to someone angry, press E, and use your words.', from: 'HR Wellbeing Team', goal, progress: 0, reward: 50 + goal * 20 + f * 20, done: false };
        break;
      }
      case 'printer':
        q = { id, kind, title: 'Fix the printer in the print room', body: 'It says PC LOAD LETTER. Nobody knows what that means. Beware of paper jams.', from, goal: 1, progress: 0, reward: 60 + f * 25, done: false };
        break;
      case 'deliver':
      default: {
        const target = fx.pick(healers);
        s.consumables.laptop = (s.consumables.laptop ?? 0) + 1;
        q = { id, kind: 'deliver', title: `Deliver a laptop to ${target.name}`, body: `${target.name} has been waiting for a replacement laptop since the spring. It is in your backpack (3 kg).`, from, goal: 1, progress: 0, reward: 50 + f * 25, done: false, target: target.name };
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
    adjustStanding(s, 'management', 2);
    s.quests = s.quests.filter((x) => x !== q);
    sfx.coin();
  }

  deliverLaptop(a: Actor): boolean {
    const s = this.save;
    const q = s.quests.find((x) => x.kind === 'deliver' && x.target === a.name && !x.done);
    if (q === undefined || (s.consumables.laptop ?? 0) <= 0) return false;
    delete s.consumables.laptop;
    q.progress = 1;
    this.questDone(q);
    adjustStanding(s, 'kitchen', 5);
    adjustStanding(s, 'staff', 2);
    this.giveItem('biscuits', 1, a.name);
    this.refreshDerived();
    return true;
  }

  // ================================================================== the vices

  private tickVices(dt: number): void {
    const s = this.save;
    const before = bandFor(s.bac);
    if (s.bac > 0) s.bac = Math.max(0, s.bac - bacDecay(s.attrs.liver, skill(s, 'drinking')) * dt);
    s.peakBac = Math.max(s.peakBac, s.bac);
    if (s.peakBac > 50 && s.bac < 10) {
      s.peakBac = 0;
      s.hangover = 110 * (perk(s, 'hardened') > 0 ? 0.5 : 1);
      this.hud.toast('The hangover arrives like a Monday. (Sauna, coffee or the Avanto rune help.)', 'bad');
      this.journal('Hungover. Never again. (Again.)');
      this.refreshDerived();
    }
    if (s.hangover > 0) {
      s.hangover = Math.max(0, s.hangover - dt);
      if (s.hangover === 0) this.refreshDerived();
    }
    s.dependency = Math.max(0, s.dependency - dt * 0.012);
    if (s.dependency >= 50 && s.bac < 5) {
      s.sanity -= ((s.dependency - 45) / 60) * dt * (perk(s, 'hardened') > 0 ? 0.5 : 1);
      this.withdrawalT -= dt;
      if (this.withdrawalT <= 0) {
        this.withdrawalT = 25;
        this.hud.toast('The shakes. Something in you wants a drink. (Or a very long sauna.)', 'bad');
      }
    }
    const after = bandFor(s.bac);
    if (after !== before) {
      this.refreshDerived();
      if (after === 'peak') this.hud.toast('BALLMER PEAK: you can see the code behind the code. (+damage, +persuasion, terminals strike a wrong fix)', 'epic');
      else if (after === 'merry' && before !== 'hammered') this.hud.toast('Merry. The office ladies will not approve. Managers can smell it.', 'bad');
      else if (after === 'hammered') this.hud.toast('HAMMERED. The floor is moving. Stop drinking.', 'bad');
      else if (after === 'blackout') this.blackout();
    }
  }

  drink(id: string): void {
    const s = this.save;
    const c = CONSUMABLES.find((x) => x.id === id);
    if (c?.bac === undefined) return;
    const before = bandFor(s.bac);
    s.bac = Math.min(100, s.bac + drinkBac(c.bac, s.attrs.liver, skill(s, 'drinking')));
    s.dependency = Math.min(100, s.dependency + 3 + c.bac * 0.15);
    s.empties += 1;
    s.stats.drinks++;
    if (s.hangover > 0) {
      s.hangover = 0;
      s.dependency = Math.min(100, s.dependency + 4);
      this.hud.toast('Hair of the dog. The hangover lifts. Something else takes hold.', 'bad');
    }
    // Hardened drinkers get more out of it.
    if (s.dependency >= 50 && c.heal !== undefined) this.healPlayer(c.heal * 0.5, '');
    this.exercise('drinking', 1.5);
    if (s.stats.drinks % 12 === 0) s.attrs.liver = Math.min(100, s.attrs.liver + 1);
    sfx.glug();
    this.hud.toast(`${c.name}. ${promille(s.bac)}‰ - ${BAND_EFFECTS[bandFor(s.bac)].label}.`, 'info');
    this.refreshDerived();
    if (bandFor(s.bac) === 'blackout' && before !== 'blackout') this.blackout();
  }

  /** A manager close by, and you smell of lonkero. */
  private caughtCheck(m: Actor): void {
    const s = this.save;
    const band = this.derivedCache.band;
    const evidence = s.empties >= 4 ? 0.35 : 0;
    const chance = Math.min(1, band.caughtChance + evidence) * (1 - skill(s, 'drinking') / 250);
    this.caughtCd = 15;
    if (chance <= 0 || !fx.chance(chance)) return;
    say(m, s.bac >= 14 ? 'Have you been DRINKING? At WORK?' : 'Is that a bag of empties? In the office?', 3);
    adjustStanding(s, 'management', -8);
    this.warn(s.bac >= 14 ? 'Caught under the influence by a manager' : 'Caught with a bag of empties');
  }

  private blackout(): void {
    if (this.screen !== 'play' && this.screen !== 'os') return;
    const s = this.save;
    s.stats.blackouts++;
    const lost = Math.floor(s.rep * 0.2);
    s.rep -= lost;
    s.bac = 45;
    const incidents = [
      'You replied-all to the whole company with a single word: "löyly".',
      'You set the CEO\'s desktop wallpaper to a picture of a goat. It is still there.',
      'You signed up for the charity 10k. It is on Saturday.',
      'You told Derek what you really think of his stand-ups. In rhyme.',
      'You tried to reimage the vending machine.',
    ];
    const what = fx.pick(incidents);
    this.journal(`Blackout. ${what}`);
    this.warn('Blackout at work');
    this.os.hide();
    this.screen = 'transition';
    this.input.releaseLock();
    this.setOverlay(`<div class="title-logo small dead">BLACKOUT</div>
      <p class="title-blurb">You wake up ${s.location === 'mokki' ? 'face-down on the laituri' : 'under a desk in the lobby'}. You have lost ₡${lost}, most of your dignity, and some time.</p>
      <p class="title-blurb">Apparently: ${what}</p>`, [['Get up', () => {
      this.player.pos.set(this.level.start.x, 0, this.level.start.z);
      s.hangover = 60;
      this.refreshDerived();
      this.resume();
    }]]);
  }

  // ================================================================== magic

  private castOdds(cost: number): number {
    const s = this.save;
    return castChance(cost, skill(s, 'runecraft'), s.attrs.tech, s.attrs.liver, this.derivedCache.band.spell);
  }

  private cycleSpell(): void {
    const s = this.save;
    if (s.spells.length === 0) {
      this.hud.toast('You know no runes. Find the Saunatonttu in a sauna, or at the mökki.');
      return;
    }
    const i = s.spell === null ? -1 : s.spells.indexOf(s.spell);
    s.spell = s.spells[(i + 1) % s.spells.length] ?? null;
    const sp = s.spell === null ? undefined : spellById(s.spell);
    if (sp !== undefined) this.hud.toast(`${sp.name} (${sp.english}): ${sp.desc}`);
  }

  private castSpell(): void {
    const s = this.save;
    const sp = s.spell === null ? undefined : spellById(s.spell);
    if (sp === undefined) {
      this.hud.toast('No rune selected. The Saunatonttu teaches runes.');
      return;
    }
    if (s.loyly < sp.cost) {
      sfx.fizzle();
      this.hud.toast('Not enough Löyly. Sit in a sauna, or drink a Salmari.', 'bad');
      return;
    }
    const odds = this.castOdds(sp.cost);
    if (!fx.chance(odds)) {
      s.loyly -= sp.cost / 2;
      sfx.fizzle();
      this.hud.toast(`The rune fizzles. (${Math.round(odds * 100)}% chance)`, 'bad');
      this.exercise('runecraft', 0.4);
      return;
    }
    s.loyly -= sp.cost;
    s.stats.spellsCast++;
    this.exercise('runecraft', 1 + sp.cost / 25);
    const pp = this.player.pos;
    const d = this.derivedCache;
    const near = (r: number): Actor[] => this.actors.filter((a) => a.hostile && !a.resolved && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < r && lineOfSight(this.level, pp.x, pp.z, a.pos.x, a.pos.z));
    this.player.swing = 1;
    switch (sp.id) {
      case 'steam':
        sfx.hiss();
        this.steamBurst(pp.clone(), 5);
        for (const a of near(5.5)) {
          this.strike(a, 28 + skill(s, 'runecraft') * 0.8, new THREE.Vector3(a.pos.x - pp.x, 0, a.pos.z - pp.z).normalize().multiplyScalar(6), 'spell');
          a.stunned = Math.max(a.stunned, 1);
        }
        break;
      case 'vihta': {
        sfx.swing();
        const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
        let dealt = 0;
        for (const a of near(4)) {
          const dx = a.pos.x - pp.x;
          const dz = a.pos.z - pp.z;
          if ((dx * fwd.x + dz * fwd.z) / Math.max(0.01, Math.hypot(dx, dz)) < 0.4) continue;
          this.strike(a, 22, new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(4), 'spell');
          dealt += 22 * d.spellMult;
        }
        this.fxBall(pp.clone().addScaledVector(fwd, 2).setY(1.2), 0x7aa84a, 0.4, 0.5, 3);
        if (dealt > 0) this.healPlayer(dealt / 3, '');
        break;
      }
      case 'salmiakki': {
        const from = this.muzzle();
        const dir = this.aimPoint().sub(from).normalize();
        this.fire({ kind: 'salmiakki', from, dir, speed: 20, damage: 7 * d.spellMult, hostile: false, owner: null });
        sfx.shoot();
        break;
      }
      case 'sisu':
        this.sisuT = 8;
        sfx.chime();
        this.hud.toast('SISU. Nothing gets through.', 'epic');
        break;
      case 'avanto':
        sfx.splash();
        this.fxRing(pp.clone().setY(0.5), 0x9ad8ff, 7);
        for (const a of near(7)) {
          a.slowT = 5;
          this.strike(a, 10, null, 'spell');
        }
        s.bac = Math.max(0, s.bac - 30);
        s.hangover = 0;
        this.refreshDerived();
        this.hud.toast('AVANTO! The cold hits like a truth. Sober, and very awake.', 'good');
        break;
      case 'silence':
        this.invisT = 10;
        sfx.chime();
        this.hud.toast('Hiljaisuus. Nobody talks to you. Bliss.', 'good');
        break;
      case 'mark':
        this.mark = pp.clone();
        this.hud.toast('Mökkimerkki: this spot is remembered.', 'good');
        sfx.chime();
        break;
      case 'recall': {
        const to = this.mark ?? new THREE.Vector3(this.level.start.x, 0, this.level.start.z);
        this.steamBurst(pp.clone(), 2);
        this.player.pos.copy(to);
        this.steamBurst(to.clone(), 2);
        sfx.hiss();
        break;
      }
      case 'song':
        sfx.chime();
        this.hud.toast('You sing the old song. It goes on for a while. People forget why they came.', 'epic');
        for (const a of near(9)) {
          if (a.kind === 'boss') continue;
          this.resolvePeacefully(a, 'charmed');
          say(a, '...what was I doing? Never mind.', 2);
        }
        break;
      case 'tonttu':
        sfx.chime();
        this.spawnAt('helper', pp.x + 1, pp.z + 1, -1, false, { role: 'spirit', ttl: 25 });
        this.steamBurst(pp.clone().add(new THREE.Vector3(1, 0, 1)), 1.5);
        break;
    }
  }

  private domainAbility(): void {
    const s = this.save;
    if (s.rung < 3 || s.domain === null) {
      this.hud.toast('Domain abilities come with a specialism (from the third rung).');
      return;
    }
    if (this.abilityCd > 0) {
      this.hud.toast(`${s.domain} ability recharging (${Math.ceil(this.abilityCd)}s).`);
      return;
    }
    this.abilityCd = 40;
    const pp = this.player.pos;
    switch (s.domain) {
      case 'Systems':
        sfx.nova();
        this.fxRing(pp.clone().setY(1), 0x7dff9a, 7);
        for (const a of this.actors) {
          if (!a.hostile || a.resolved || Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) > 7) continue;
          this.strike(a, 55 * this.difficulty, new THREE.Vector3(a.pos.x - pp.x, 0, a.pos.z - pp.z).normalize().multiplyScalar(9), 'melee');
        }
        this.hud.toast('HARD REBOOT.', 'epic');
        break;
      case 'Network':
        sfx.chime();
        for (const a of this.actors) {
          if (!a.hostile || a.resolved) continue;
          a.revealT = 15;
          if (Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 20) a.slowT = 3;
          this.level.seen[toCell(a.pos.z) * this.level.w + toCell(a.pos.x)] = 1;
        }
        this.hud.mapOpen = true;
        this.hud.toast('PING SWEEP: everyone on the floor answered. Map open (M).', 'epic');
        break;
      case 'Cloud':
        sfx.chime();
        for (let i = 0; i < 2; i++) this.spawnAt('helper', pp.x + fx.range(-1.5, 1.5), pp.z + fx.range(-1.5, 1.5), -1, false, { role: 'clone', ttl: 20 });
        this.hud.toast('AUTOSCALE: two more of you. Billing is somebody else\'s problem.', 'epic');
        break;
      case 'Security':
        sfx.meeting();
        this.fxRing(pp.clone().setY(1), 0x8080ff, 9);
        for (const a of this.actors) {
          if (a.hostile && !a.resolved && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 9) a.stunned = 3;
        }
        this.hud.toast('LOCKDOWN.', 'epic');
        break;
      case 'Database': {
        const snap = this.history[0];
        if (snap === undefined) {
          this.abilityCd = 0;
          return;
        }
        this.steamBurst(pp.clone(), 1.5);
        this.player.pos.set(snap.x, 0, snap.z);
        s.sanity = Math.max(s.sanity, snap.sanity);
        this.history = [];
        sfx.hiss();
        this.hud.toast('ROLLBACK: restored to a known good state.', 'epic');
        break;
      }
    }
  }

  // ================================================================== resting

  private canRest(): string | null {
    if (this.save.location === 'mokki') return 'At the mökki you sleep in the cottage (the red door).';
    const pp = this.player.pos;
    if (this.actors.some((a) => a.hostile && !a.resolved && a.aggro && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 25)) return 'You cannot rest with people after you.';
    if (this.boss?.bossActive === true && !this.boss.resolved) return 'Not during a major incident.';
    return null;
  }

  private tryRest(): void {
    const why = this.canRest();
    if (why !== null) {
      sfx.error();
      this.hud.toast(why, 'bad');
      return;
    }
    this.rest(false);
  }

  private rest(safe: boolean): void {
    const s = this.save;
    const d = this.derivedCache;
    sfx.snore();
    s.sanity = safe ? d.maxSanity : Math.min(d.maxSanity, s.sanity + d.maxSanity * 0.5);
    s.energy = 100;
    s.loyly = safe ? d.maxLoyly : Math.min(d.maxLoyly, s.loyly + d.maxLoyly * 0.5);
    s.bac = Math.max(0, s.bac - (safe ? 100 : 35));
    if (safe) {
      s.hangover = 0;
      this.hud.toast('You sleep like a log, to the sound of the lake.', 'good');
    } else {
      // An hour under the desk: the queue does not sleep.
      for (const q of s.queue) q.sla -= 60;
      this.hud.toast('You nap under a desk for an hour. The SLA clocks did not.', 'info');
      if (fx.chance(0.25)) {
        const ang = fx.range(0, Math.PI * 2);
        const m = this.spawn('manager', this.player.pos.x + Math.sin(ang) * 3, this.player.pos.z + Math.cos(ang) * 3, -1);
        if (m !== null) {
          say(m, 'Are you ASLEEP? Under a DESK?', 3);
          adjustStanding(s, 'management', -4);
          this.hud.toast('Found napping! (Management -4)', 'bad');
        }
      }
    }
    this.refreshDerived();
    if (levelUpReady(s)) this.openDialogue(levelUpNode(this));
  }

  // ================================================================== interaction

  private findPrompt(): void {
    const pp = this.player.pos;
    const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    let best: { kind: 'interact'; it: Interactable } | { kind: 'actor'; a: Actor } | null = null;
    let bestScore = Infinity;
    for (const it of this.level.interactables) {
      const dx = it.x - pp.x;
      const dz = it.z - pp.z;
      const dist = Math.hypot(dx, dz);
      const reach = it.kind === 'elevator' || it.kind === 'itdesk' || it.kind === 'car' || it.kind === 'lake' ? 3.2 : 2.4;
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
      if (a.resolved) continue;
      const talkable = !a.hostile || ((a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer' || a.kind === 'manager') && !a.talked && a.enragedT <= 0);
      if (!talkable || a.role === 'clone' || a.role === 'spirit') continue;
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
      this.prompt = a.hostile ? `E: Talk to ${a.name} (${a.kind === 'manager' ? 'negotiate' : 'talk them down'})`
        : a.kind === 'healer' ? `E: Talk to ${a.name}`
          : a.kind === 'tonttu' ? 'E: Talk to the Saunatonttu (runes, training)'
            : a.kind === 'npc' ? `E: Talk to ${a.name}` : `E: ${a.recruited ? 'Talk to' : 'Recruit'} ${a.name}`;
      return;
    }
    const it = best.it;
    const labels: Record<Interactable['kind'], string> = {
      terminal: 'E: Log on to WorkgrumbleOS (tickets, tasks, HR, Internal IT)',
      printer: it.used ? 'Printer: READY (for now)' : 'E: Fix the printer',
      cooler: it.used ? 'Water cooler (empty)' : 'E: Water cooler (+sanity, -BAC)',
      coffee: it.used ? 'Coffee machine (descaling)' : 'E: Coffee machine',
      vending: 'E: Vending machine (₡10)',
      itdesk: 'E: Internal IT Service Desk (requisition gear)',
      elevator: this.elevatorOpen ? 'E: Take the lift - Friday, the mökki' : 'Lift locked - Major Incident in progress',
      crate: it.used ? 'Empty spares crate' : 'E: Rummage in the spares crate',
      kiuas: 'E: Throw löyly (sauna)',
      locker: it.used ? 'Supply closet (empty)' : `E: Pick the supply-closet lock (lock ${it.lock})`,
      fridge: it.used ? 'Office fridge (just a yoghurt, and a note)' : 'E: Office fridge',
      pantti: `E: Bottle return (${this.save.empties} empties)`,
      bed: 'E: Sleep (rest, level up)',
      lake: 'E: Swim in the lake',
      grill: this.weekendDone.grill ? 'The grill is cooling' : 'E: Grill makkara',
      stash: 'E: Your stash chest',
      car: 'E: Drive back to work (Monday)',
      runestone: 'E: Read the rune stone',
    };
    this.prompt = labels[it.kind];
  }

  private interact(): void {
    const target = this.promptTarget;
    if (target === null) return;
    const s = this.save;
    if (target.kind === 'actor') {
      const a = target.a;
      if (a.hostile) {
        this.openDialogue(a.kind === 'manager' ? talkManager(this, a) : talkHostile(this, a));
        return;
      }
      if (a.kind === 'healer') this.openDialogue(talkHealer(this, a));
      else if (a.kind === 'tonttu') this.openDialogue(talkTonttu(this, a));
      else if (a.kind === 'npc') {
        this.openDialogue(talkStory(this, a), () => {
          if (a.talked) {
            s.flags[`story_${a.npcId ?? ''}_${s.floor}`] = true;
            setMarker(a, null);
          }
        });
      } else this.openDialogue(talkHelper(this, a));
      return;
    }
    const it = target.it;
    switch (it.kind) {
      case 'terminal':
        this.currentTerminal = it;
        if (this.pendingHearing) {
          this.pendingHearing = false;
          this.openDialogue(disciplinary(this));
          return;
        }
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
        s.bac = Math.max(0, s.bac - 8);
        this.healPlayer(25, 'Water cooler');
        break;
      case 'coffee':
        if (it.used) {
          this.hud.toast('"DESCALING IN PROGRESS". It has said that since 2019.');
          break;
        }
        it.used = true;
        s.energy = 100;
        s.bac = Math.max(0, s.bac - 6);
        s.hangover = Math.max(0, s.hangover - 40);
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
        adjustStanding(s, 'itcrowd', 3);
        this.exercise('troubleshooting', 1);
        this.questProgress('printer');
        break;
      case 'crate':
        if (it.used) {
          this.hud.toast('Just some SCSI terminators and a Zip drive.');
          break;
        }
        it.used = true;
        this.giveAmmo();
        s.rep += 20;
        adjustStanding(s, 'itcrowd', 1);
        this.giveItem(fx.pick(['biscuits', 'coffee', 'energy', 'postit', 'paperclip']), 1, '');
        break;
      case 'elevator':
        if (!this.elevatorOpen) {
          sfx.error();
          this.hud.toast(`The lift is locked while ${this.boss?.name ?? 'the boss'} is unresolved.`, 'bad');
          break;
        }
        writeSave(s);
        if (s.floor === FINAL_FLOOR && !s.won) this.showEnding();
        else this.goToMokki();
        break;
      case 'kiuas':
        this.sauna(it);
        break;
      case 'locker':
        this.pickLock(it);
        break;
      case 'fridge':
        if (it.used) {
          this.hud.toast('Just the yoghurt now. And the note.');
          break;
        }
        this.openDialogue(this.fridgeNode(it));
        break;
      case 'pantti': {
        if (s.empties <= 0) {
          this.hud.toast('No empties. The machine beeps, disappointed.');
          break;
        }
        const n = s.empties;
        s.empties = 0;
        s.rep += n * 2;
        sfx.coin();
        this.hud.toast(`Pantti: ${n} empties returned, ₡${n * 2}. The evidence is gone.`, 'good');
        this.refreshDerived();
        break;
      }
      case 'bed':
        this.rest(true);
        break;
      case 'lake':
        this.swim();
        break;
      case 'grill':
        if (this.weekendDone.grill) {
          this.hud.toast('The coals are grey. Next weekend.');
          break;
        }
        this.weekendDone.grill = true;
        this.giveItem('makkara', 2, 'The grill');
        this.giveItem('lonkero', 1, 'The cool box');
        sfx.hiss();
        break;
      case 'stash':
        this.openDialogue(this.stashNode());
        break;
      case 'car':
        this.openDialogue({
          speaker: 'The car', text: 'Monday morning. Three hours back down the motorway. Ready?',
          options: [
            { label: 'Drive back to work.', pick: () => { this.afterDialogue = () => this.goToWork(); return null; } },
            { label: 'Five more minutes.', pick: () => null },
          ],
        });
        break;
      case 'runestone': {
        const t = this.actors.find((a) => a.kind === 'tonttu');
        if (t !== undefined) this.openDialogue(talkTonttu(this, t));
        else this.hud.toast('The runes glow faintly. The tonttu is out.');
        break;
      }
    }
  }

  private sauna(it: Interactable): void {
    const s = this.save;
    const mokki = s.location === 'mokki';
    if (mokki ? this.weekendDone.sauna : it.used) {
      this.hud.toast('The kiuas needs time to heat up again.');
      return;
    }
    if (mokki) this.weekendDone.sauna = true;
    else it.used = true;
    const d = this.derivedCache;
    const mult = s.sign === 'juhannus' ? 2 : 1;
    sfx.hiss();
    this.steamBurst(this.player.pos.clone(), 3);
    s.sanity = Math.min(d.maxSanity, s.sanity + d.maxSanity * 0.6 * mult);
    s.loyly = perk(s, 'saunoja') > 0 || mokki ? d.maxLoyly : Math.min(d.maxLoyly, s.loyly + 40 * mult);
    s.bac = Math.max(0, s.bac - 40);
    s.hangover = 0;
    s.dependency = Math.max(0, s.dependency - 6);
    this.saunaT = 90;
    if (perk(s, 'saunoja') > 0) this.saunaBuff = true;
    this.exercise('sisu', 2);
    this.exercise('runecraft', 1);
    this.refreshDerived();
    this.hud.toast(mokki ? 'Löylyä! Everything restored. Now the lake - while you are still hot.' : 'Löylyä! Sanity and Löyly restored, BAC down, hangover gone.', 'epic');
    this.journal(mokki ? 'Sauna at the mökki. Some things are simply right.' : 'Found a sauna in the office and used it. Building regulations are a mystery.');
  }

  private swim(): void {
    const s = this.save;
    sfx.splash();
    this.steamBurst(this.player.pos.clone(), 1);
    if (this.saunaT > 0 && !this.weekendDone.lake) {
      this.weekendDone.lake = true;
      this.saunaBuff = true;
      this.hud.toast('SAUNA → LAKE. The Finnish way. Löyly-blessed: +25% damage for the whole next floor.', 'epic');
      this.journal('Sauna, then straight into the lake. Blessed for the week.');
      this.exercise('sisu', 3);
    } else {
      this.hud.toast('Brr! The lake is 14 degrees. Sober, at least. (Try it straight after the sauna.)', 'info');
    }
    s.bac = Math.max(0, s.bac - 25);
    s.hangover = 0;
    this.refreshDerived();
  }

  private fridgeNode(it: Interactable): DialogueNode {
    const s = this.save;
    const witnesses = this.actors.filter((a) => !a.resolved && (a.kind === 'user' || a.kind === 'caller' || a.kind === 'manager' || a.kind === 'healer')
      && Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) < 10
      && lineOfSight(this.level, a.pos.x, a.pos.z, this.player.pos.x, this.player.pos.z));
    return {
      speaker: 'The office fridge',
      text: `A yoghurt from 2023. A note: "THIS IS JUKKA'S. DO NOT TOUCH." Behind it: two cans of lonkero and a Koskenkorva miniature.${witnesses.length > 0 ? ` ${witnesses.length} ${witnesses.length === 1 ? 'person is' : 'people are'} watching.` : ' Nobody is looking.'}`,
      options: [
        {
          label: 'Take Jukka\'s drinks.',
          tag: witnesses.length > 0 ? 'Theft, witnessed' : 'Theft',
          pick: () => {
            it.used = true;
            this.giveItem('lonkero', 2, 'The fridge');
            this.giveItem('kossu', 1, 'The fridge');
            if (witnesses.length > 0) {
              adjustStanding(s, 'staff', -4);
              adjustStanding(s, 'kitchen', -6);
              this.warn('Seen stealing from the office fridge');
              return said('Somebody behind you', 'Is that JUKKA\'S? I am telling Denise.', 'bad');
            }
            this.exercise('stealth', 2);
            return said('The office fridge', 'The door closes with a guilty little thud. Nobody saw.', 'neutral');
          },
        },
        { label: 'Leave it.', pick: () => null },
      ],
    };
  }

  private pickLock(it: Interactable): void {
    const s = this.save;
    if (it.used) {
      this.hud.toast('Empty. Somebody got here first. You.');
      return;
    }
    if ((s.consumables.paperclip ?? 0) <= 0) {
      sfx.error();
      this.hud.toast('You need a paperclip. Internal IT has boxes of them.', 'bad');
      return;
    }
    const witnesses = this.actors.filter((a) => !a.resolved && a.hostile && a.kind !== 'reply' && a.kind !== 'mosquito'
      && Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) < 9
      && lineOfSight(this.level, a.pos.x, a.pos.z, this.player.pos.x, this.player.pos.z));
    this.screen = 'dialogue';
    this.input.enabled = false;
    this.input.releaseLock();
    this.lockpick.start(it.lock, skill(s, 'security') + Math.floor(s.attrs.reflex / 5), () => s.consumables.paperclip ?? 0, () => {
      s.consumables.paperclip = Math.max(0, (s.consumables.paperclip ?? 1) - 1);
      sfx.snap();
      this.exercise('security', 0.5);
    }, (ok) => {
      if (ok) {
        it.used = true;
        s.stats.locks++;
        this.exercise('security', 2 + it.lock / 25);
        sfx.lockClick();
        this.lootLocker();
        if (witnesses.length > 0) {
          adjustStanding(s, 'staff', -4);
          this.warn(`${witnesses[0]?.name ?? 'Someone'} saw you breaking into a supply closet`);
        }
      }
      this.refreshDerived();
      this.resume();
    });
  }

  private lootLocker(): void {
    const s = this.save;
    const got: string[] = [];
    const give = (id: string, n = 1): void => {
      s.consumables[id] = (s.consumables[id] ?? 0) + n;
      got.push(itemById(id)?.name ?? id);
    };
    give(fx.pick(['paperclip', 'postit', 'coffee', 'energy']), fx.int(1, 3));
    if (fx.chance(0.5)) give(fx.pick(['beer', 'lonkero', 'kossu', 'salmari', 'sahti']));
    const unknown = RUNES.filter((r) => {
      const c = CONSUMABLES.find((x) => x.id === r);
      return c?.rune !== undefined && !s.spells.includes(c.rune) && (s.consumables[r] ?? 0) === 0;
    });
    if (unknown.length > 0 && fx.chance(0.35)) give(fx.pick(unknown));
    const gear = GEAR.filter((g) => !s.owned.includes(g.id) && g.minFloor <= s.floor);
    if (gear.length > 0 && fx.chance(0.2)) {
      const g = fx.pick(gear);
      s.owned.push(g.id);
      got.push(g.name);
    }
    const rep = fx.int(10, 30) + s.floor * 10;
    s.rep += rep;
    this.hud.toast(`Supply closet: ${got.join(', ')} and ₡${rep}.`, 'good');
  }

  private stashNode(): DialogueNode {
    const s = this.save;
    const move = (from: Record<string, number>, to: Record<string, number>, filter: (id: string) => boolean): number => {
      let n = 0;
      for (const [id, count] of Object.entries(from)) {
        if (!filter(id) || count <= 0) continue;
        to[id] = (to[id] ?? 0) + count;
        delete from[id];
        n += count;
      }
      this.refreshDerived();
      return n;
    };
    const isDrink = (id: string): boolean => DRINKS.includes(id);
    const isSupply = (id: string): boolean => !DRINKS.includes(id) && id !== 'laptop' && id !== 'paperclip';
    const stored = Object.values(s.stash).reduce((a, b) => a + b, 0);
    return {
      speaker: 'Your stash chest', text: `An old pine chest on the porch. It holds ${stored} thing${stored === 1 ? '' : 's'}. Nothing in here counts toward your carry weight - or tempts you on a Tuesday.`,
      options: [
        { label: 'Put all my drinks in the chest. (Out of reach, out of mind.)', pick: () => { const n = move(s.consumables, s.stash, isDrink); return said('Your stash chest', `${n} drinks stored.`); } },
        { label: 'Take my drinks back out.', pick: () => { const n = move(s.stash, s.consumables, isDrink); return said('Your stash chest', `${n} drinks taken.`); } },
        { label: 'Store my supplies.', pick: () => { const n = move(s.consumables, s.stash, isSupply); return said('Your stash chest', `${n} supplies stored.`); } },
        { label: 'Take my supplies back.', pick: () => { const n = move(s.stash, s.consumables, isSupply); return said('Your stash chest', `${n} supplies taken.`); } },
        { label: 'Close the lid.', pick: () => null },
      ],
    };
  }

  private quickUse(): void {
    const s = this.save;
    const d = this.derivedCache;
    const order = s.sanity < d.maxSanity * 0.6 ? ['biscuits', 'cake', 'makkara', 'coffee', 'energy'] : s.actionItems > 0 ? ['postit', 'coffee', 'energy', 'biscuits'] : ['coffee', 'energy', 'biscuits', 'cake'];
    for (const id of order) {
      if ((s.consumables[id] ?? 0) > 0) {
        this.use(id);
        return;
      }
    }
    sfx.error();
    this.hud.toast('Nothing quick in your pockets. (Drinks are never quick-used: choose them in the backpack.)');
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

  recruitedHelper(): Actor | null {
    return this.actors.find((a) => a.kind === 'helper' && a.recruited && !a.resolved && a.role !== 'clone' && a.role !== 'spirit') ?? null;
  }

  dismiss(a: Actor): void {
    a.recruited = false;
    a.resolved = true;
    a.calm = true;
    a.removeIn = 3;
  }

  spawnHostile(kind: 'user' | 'manager' | 'reply' | 'customer', n: number, name?: string): void {
    for (let i = 0; i < n; i++) {
      const a = this.spawn(kind, this.player.pos.x + fx.range(-3, 3), this.player.pos.z + fx.range(-3, 3), -1);
      if (a !== null && name !== undefined) {
        a.name = name;
        a.hp *= 2;
        a.maxHp *= 2;
      }
    }
  }

  bossDeal(kind: 'nda' | 'mokki'): void {
    const s = this.save;
    if (kind === 'nda') {
      s.flags.ceoDeal = true;
      this.journal('I signed the NDA. The Company Man.');
      this.afterDialogue = () => this.showEnding();
      return;
    }
    s.flags.mokkiDeal = true;
    s.rep += 500;
    if (this.boss !== null) {
      this.boss.hp *= 0.5;
      this.boss.maxHp *= 0.5;
    }
    this.journal('I negotiated the mökki money out of Sir Reginald before the fight. He is distracted, counting it.');
  }

  // ================================================================== OsHost

  buy(id: string): string | null {
    const s = this.save;
    const item = ALL_ITEMS.find((i) => i.id === id);
    if (item === undefined) return 'Unknown item.';
    if (item.minFloor > s.floor) return 'Your clearance does not cover that yet.';
    const price = this.price(item.price);
    if (s.rep < price) return `Requisition denied: needs ₡${price}, you have ₡${s.rep}.`;
    if ((item.slot === 'weapon' || item.slot === 'head' || item.slot === 'body' || item.slot === 'feet' || item.slot === 'trinket') && s.owned.includes(id)) {
      return 'Already issued. Internal IT keeps a spreadsheet.';
    }
    s.rep -= price;
    adjustStanding(s, 'itcrowd', 0.5);
    switch (item.slot) {
      case 'weapon':
        s.owned.push(id);
        s.equipped.weapon = id;
        if (item.ammo !== undefined && s.ammo[item.ammo] === 0) s.ammo[item.ammo] += AMMO.find((a) => a.ammo === item.ammo)?.amount ?? 20;
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

  /** Internal IT prices: Charm and IT Crowd standing both count. */
  price(base: number): number {
    const s = this.save;
    const m = 1 - s.standing.itcrowd / 300 - (s.attrs.charm - 35) / 400;
    return Math.max(1, Math.round(base * Math.max(0.6, Math.min(1.4, m))));
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
    if (c.rune !== undefined) {
      if (s.spells.includes(c.rune)) {
        this.hud.toast('You already know this rune.');
        return;
      }
      s.consumables[id] = (s.consumables[id] ?? 1) - 1;
      if ((s.consumables[id] ?? 0) <= 0) delete s.consumables[id];
      this.learnSpell(c.rune);
      this.refreshDerived();
      return;
    }
    if (id === 'paperclip') {
      this.hud.toast('Paperclips are for supply-closet locks. Walk up to one and press E.');
      return;
    }
    s.consumables[id] = (s.consumables[id] ?? 1) - 1;
    if ((s.consumables[id] ?? 0) <= 0) delete s.consumables[id];
    if (c.heal !== undefined) this.healPlayer(c.heal, '');
    if (c.energy !== undefined) s.energy = Math.min(100, s.energy + c.energy);
    if (c.loyly !== undefined) s.loyly = Math.min(this.derivedCache.maxLoyly, s.loyly + c.loyly);
    if (c.buff === 'coffee') {
      this.coffeeT = 25 * (perk(s, 'caffeine') > 0 ? 2 : 1);
      s.bac = Math.max(0, s.bac - 6);
      s.hangover = Math.max(0, s.hangover - 30);
    }
    if (c.buff === 'wired') {
      this.wiredT = 20;
      this.crashT = 0;
    }
    if (c.buff === 'makkara') s.makkara = true;
    if (c.clearsActionItem === true && s.actionItems > 0) s.actionItems--;
    if (c.bac !== undefined) this.drink(id);
    else {
      sfx.pickup();
      this.hud.toast(`Used ${c.name}.`);
    }
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
    if (fx.chance(0.35 - this.stealth * 0.2)) {
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

  setBloom(on: boolean): void {
    this.save.bloom = on;
  }

  click(): void { sfx.click(); }
  error(): void { sfx.error(); }
  coin(): void { sfx.coin(); }

  // ================================================================== upkeep

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
        else if (lv.floor[i] === 1 && lv.opaque[i] === 1) {
          for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (lv.seen[(cz + oz) * lv.w + cx + ox] === 1) lv.seen[i] = 1;
          }
        }
      }
    }
  }

  private updateLights(force: boolean): void {
    if (this.save.location === 'mokki') return;
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
    const flick = this.lights[2];
    if (flick !== undefined && fx.chance(0.3)) flick.intensity *= fx.range(0.2, 1);
  }
}
